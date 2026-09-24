import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/server/auth';
import prisma from '@/lib/prisma';
import { findAndVerifyProspectEmail, verifyEmailAddress } from '@/lib/email-verifier';
import { resolveCompanyDomain } from '@/lib/domain-resolver';
import { generateEmailPermutations } from '@/lib/email-pattern-generator';

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

    const leads = await prisma.outreachLead.findMany({
      where: {
        campaignId: campaign.id,
        ...(leadIds && leadIds.length > 0 ? { id: { in: leadIds } } : {}),
      },
    });

    const apiKey = campaign.account?.reoonApiKey || process.env.REOON_API_KEY;
    const updatedLeads = [];

    for (const lead of leads) {
      let email = lead.email;
      let verifyStatus = lead.verifyStatus || 'UNVERIFIED';
      let verifyScore = lead.verifyScore || 0;
      let companyDomain = lead.companyDomain;

      // 1. Ensure valid domain resolution
      if (!companyDomain || !companyDomain.includes('.')) {
        const domRes = await resolveCompanyDomain(lead.companyName, companyDomain);
        if (domRes.domain) companyDomain = domRes.domain;
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
        if (found.resolvedDomain) companyDomain = found.resolvedDomain;
      } else if (email) {
        // Verify current email
        const verified = await verifyEmailAddress(email, apiKey);
        verifyStatus = verified.status;
        verifyScore = verified.score;

        // If primary candidate was INVALID and we have domain, try other permutations to find valid email
        if (verified.status === 'INVALID' && companyDomain) {
          const permutations = generateEmailPermutations(lead.fullName, companyDomain);
          for (const candidate of permutations) {
            if (candidate.toLowerCase() === email.toLowerCase()) continue; // Skip already failed candidate

            const candidateRes = await verifyEmailAddress(candidate, apiKey);
            if (candidateRes.status === 'SAFE') {
              email = candidate;
              verifyStatus = candidateRes.status;
              verifyScore = candidateRes.score;
              break;
            }
            if (candidateRes.status === 'RISKY' && verifyStatus === 'INVALID') {
              email = candidate;
              verifyStatus = candidateRes.status;
              verifyScore = candidateRes.score;
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
          : 'VERIFYING';

      const updated = await prisma.outreachLead.update({
        where: { id: lead.id },
        data: {
          email,
          companyDomain: companyDomain || lead.companyDomain,
          verifyStatus,
          verifyScore,
          status: newStatus,
        },
      });

      updatedLeads.push(updated);
    }

    return NextResponse.json({
      success: true,
      totalVerified: updatedLeads.length,
      safeCount: updatedLeads.filter((l) => l.verifyStatus === 'SAFE').length,
      leads: updatedLeads,
    });
  } catch (error: any) {
    console.error('[API OUTREACH VERIFY ERROR]', error);
    return NextResponse.json({ error: error.message || 'Verification failed' }, { status: 500 });
  }
}
