import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/server/auth';
import prisma from '@/lib/prisma';
import { findAndVerifyProspectEmail, verifyEmailAddress } from '@/lib/email-verifier';
import { resolveCompanyDomain } from '@/lib/domain-resolver';
import { generateEmailPermutations } from '@/lib/email-pattern-generator';
import { outreachVerifyQueue } from '@/../queue';

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> | { id: string } }
) {
  const session = await getServerSession(authOptions);
  if (!session?.user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const resolvedParams = await params;
  const campaignId = resolvedParams.id;
  const tenantId = (session.user as any).tenantId;

  try {
    const campaign = await prisma.outreachCampaign.findFirst({
      where: { id: campaignId, tenantId },
      include: { account: true },
    });

    if (!campaign) {
      return NextResponse.json({ error: 'Campaign not found' }, { status: 404 });
    }

    const body = await req.json().catch(() => ({}));
    const leadIds: string[] | undefined = body.leadIds;

    const leadsCount = await prisma.outreachLead.count({
      where: {
        campaignId: campaign.id,
        ...(leadIds && leadIds.length > 0 ? { id: { in: leadIds } } : {}),
      },
    });

    // For massive scale (> 50 leads or explicit async), enqueue to BullMQ worker
    if (leadsCount > 50 || body.async === true) {
      const job = await outreachVerifyQueue.add(
        'outreach_verify_batch',
        {
          type: 'outreach_verify_batch',
          tenantId,
          campaignId: campaign.id,
          leadIds,
          reoonApiKey: campaign.account?.reoonApiKey || process.env.REOON_API_KEY,
        },
        {
          attempts: 2,
          backoff: { type: 'exponential', delay: 5000 },
          removeOnComplete: true,
        }
      );

      return NextResponse.json({
        success: true,
        queued: true,
        jobId: job.id,
        totalProcessed: leadsCount,
        message: `Verifikasi ${leadsCount} leads dijadwalkan di background worker.`,
      });
    }

    const leads = await prisma.outreachLead.findMany({
      where: {
        campaignId: campaign.id,
        ...(leadIds && leadIds.length > 0 ? { id: { in: leadIds } } : {}),
      },
    });

    const apiKey = campaign.account?.reoonApiKey || process.env.REOON_API_KEY;

    // Process leads in concurrent batches of 5 for instant real-time response
    const concurrencyChunk = 5;
    const updatedLeads = [];

    for (let i = 0; i < leads.length; i += concurrencyChunk) {
      const chunk = leads.slice(i, i + concurrencyChunk);
      const chunkResults = await Promise.all(
        chunk.map(async (lead) => {
          let email = lead.email;
          let verifyStatus = lead.verifyStatus || 'UNVERIFIED';
          let verifyScore = lead.verifyScore || 0;
          let companyDomain = lead.companyDomain;
          let isDomainVerified = Boolean(lead.companyDomain);

          // 1. Ensure valid domain resolution if missing
          if (!companyDomain || !companyDomain.includes('.')) {
            const domRes = await resolveCompanyDomain(lead.companyName, companyDomain);
            if (domRes.domain) {
              companyDomain = domRes.domain;
              isDomainVerified = domRes.isVerifiedDomain;
            }
          }

          if (!email && (lead.fullName || lead.firstName)) {
            const found = await findAndVerifyProspectEmail({
              fullName: lead.fullName,
              firstName: lead.firstName || undefined,
              lastName: lead.lastName || undefined,
              companyName: lead.companyName || undefined,
              companyDomain: companyDomain || undefined,
              reoonApiKey: apiKey,
            });

            email = found.email || null;
            verifyStatus = found.status;
            verifyScore = found.score;
            if (found.resolvedDomain) {
              companyDomain = found.resolvedDomain;
              isDomainVerified = true;
            }
          } else if (email) {
            // Direct verification without heavy multi-loop overhead
            const verified = await verifyEmailAddress(email, apiKey);
            verifyStatus = verified.status;
            verifyScore = verified.score;

            // If primary candidate was INVALID and domain available, test max 1 top permutation
            if (verified.status === 'INVALID' && companyDomain) {
              const permutations = generateEmailPermutations(lead.fullName, companyDomain);
              for (const candidate of permutations.slice(0, 1)) {
                if (candidate.toLowerCase() === email.toLowerCase()) continue;

                const candidateRes = await verifyEmailAddress(candidate, apiKey);
                if (candidateRes.status === 'SAFE') {
                  email = candidate;
                  verifyStatus = candidateRes.status;
                  verifyScore = candidateRes.score;
                  break;
                }
              }
            }
          }

          const newStatus =
            verifyStatus === 'SAFE'
              ? 'VERIFIED_SAFE'
              : verifyStatus === 'RISKY'
              ? 'VERIFIED_RISKY'
              : verifyStatus === 'INVALID' || verifyStatus === 'DISPOSABLE'
              ? 'INVALID'
              : lead.aiDraftSubject
              ? 'DRAFT_READY'
              : 'SCRAPED';

          const updated = await prisma.outreachLead.update({
            where: { id: lead.id },
            data: {
              email,
              companyDomain: isDomainVerified ? companyDomain : (lead.companyDomain || null),
              verifyStatus,
              verifyScore,
              status: newStatus,
            },
          });

          return updated;
        })
      );
      updatedLeads.push(...chunkResults);
    }

    const safeCount = updatedLeads.filter((l) => l.verifyStatus === 'SAFE').length;
    const riskyCount = updatedLeads.filter((l) => l.verifyStatus === 'RISKY').length;
    const invalidCount = updatedLeads.filter((l) => l.verifyStatus === 'INVALID' || l.verifyStatus === 'DISPOSABLE').length;
    const unverifiedCount = updatedLeads.filter((l) => !l.verifyStatus || l.verifyStatus === 'UNVERIFIED').length;

    return NextResponse.json({
      success: true,
      totalProcessed: updatedLeads.length,
      safeCount,
      riskyCount,
      invalidCount,
      unverifiedCount,
      leads: updatedLeads,
    });
  } catch (error: any) {
    console.error('[API OUTREACH VERIFY ERROR]', error);
    return NextResponse.json({ error: error.message || 'Verification failed' }, { status: 500 });
  }
}
