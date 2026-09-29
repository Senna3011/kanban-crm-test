import { prisma } from '../src/lib/prisma';
import { verifyEmailsBulk, verifyEmailAddress } from '../src/lib/reoon';
import { resolveCompanyDomain } from '../src/lib/domain-resolver';
import { generateEmailPermutations } from '../src/lib/email-pattern-generator';
import { OutreachVerifyJob } from '../queue/jobs';

export async function processOutreachVerify(job: OutreachVerifyJob) {
  console.log(`[Verify Worker] Processing verification job for campaign ${job.campaignId}`);

  const campaign = await prisma.outreachCampaign.findUnique({
    where: { id: job.campaignId },
    include: { account: true },
  });

  if (!campaign) {
    throw new Error(`Campaign ${job.campaignId} not found`);
  }

  const apiKey = job.reoonApiKey || campaign.account?.reoonApiKey || process.env.REOON_API_KEY;

  // Fetch leads in batches of 500 to keep memory low
  const batchSize = 500;
  let cursor: string | undefined = undefined;
  let totalProcessed = 0;

  while (true) {
    const leads: any[] = await prisma.outreachLead.findMany({
      where: {
        campaignId: job.campaignId,
        ...(job.leadIds && job.leadIds.length > 0 ? { id: { in: job.leadIds } } : {}),
        verifyStatus: null,
      },
      take: batchSize,
      skip: cursor ? 1 : 0,
      cursor: cursor ? { id: cursor } : undefined,
      orderBy: { id: 'asc' },
    });

    if (leads.length === 0) break;
    cursor = leads[leads.length - 1].id;

    // Collect all direct emails needing verification
    const directEmails = leads.map((l: any) => l.email).filter(Boolean) as string[];

    // If we have direct emails and count > 10, run bulk verification via Reoon Bulk Task API
    if (directEmails.length >= 10 && apiKey) {
      try {
        console.log(`[Verify Worker] Submitting ${directEmails.length} emails to Reoon Bulk API...`);
        const bulkResults = await verifyEmailsBulk(directEmails, apiKey);

        for (const lead of leads) {
          if (!lead.email) continue;
          const verification = bulkResults.get(lead.email.toLowerCase());
          if (verification) {
            const isSafe = verification.status === 'SAFE';
            const isRisky = verification.status === 'RISKY';
            await prisma.outreachLead.update({
              where: { id: lead.id },
              data: {
                verifyStatus: verification.status,
                verifyScore: verification.score,
                status: isSafe ? 'VERIFIED_SAFE' : isRisky ? 'VERIFIED_RISKY' : 'INVALID',
              },
            });
            totalProcessed++;
          }
        }
        continue;
      } catch (err: any) {
        console.warn(`[Verify Worker] Reoon Bulk API failed (${err.message}). Falling back to multi-provider stream.`);
      }
    }

    // Per-lead pattern resolution & verification fallback
    for (const lead of leads) {
      try {
        let emailToVerify = lead.email;

        // Pattern generator if lead has no email
        if (!emailToVerify && lead.fullName && lead.companyName) {
          const { domain } = await resolveCompanyDomain(lead.companyName, lead.companyDomain);
          if (domain) {
            const permutations = generateEmailPermutations(lead.fullName, domain);
            if (permutations.length > 0) {
              emailToVerify = permutations[0];
            }
          }
        }

        if (!emailToVerify) {
          await prisma.outreachLead.update({
            where: { id: lead.id },
            data: {
              verifyStatus: 'UNVERIFIED',
              status: 'INVALID',
              errorMessage: 'Could not resolve domain or email pattern',
            },
          });
          continue;
        }

        const result = await verifyEmailAddress(emailToVerify, apiKey);
        const isSafe = result.status === 'SAFE';
        const isRisky = result.status === 'RISKY';

        await prisma.outreachLead.update({
          where: { id: lead.id },
          data: {
            email: emailToVerify,
            verifyStatus: result.status,
            verifyScore: result.score,
            status: isSafe ? 'VERIFIED_SAFE' : isRisky ? 'VERIFIED_RISKY' : 'INVALID',
          },
        });

        totalProcessed++;
      } catch (e: any) {
        console.error(`[Verify Worker] Error verifying lead ${lead.id}:`, e.message);
      }
    }

    if (job.leadIds && job.leadIds.length > 0) break;
  }

  console.log(`[Verify Worker] Completed verification. Processed ${totalProcessed} leads for campaign ${job.campaignId}`);
  return { success: true, count: totalProcessed };
}
