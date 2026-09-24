import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/server/auth';
import prisma from '@/lib/prisma';
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

    const updatedLeads = [];

    for (const lead of leads) {
      let email = lead.email;
      let companyDomain = lead.companyDomain;

      // 1. Resolve authentic domain using Domain Resolver (Clearbit & Sanitizer)
      const domainResult = await resolveCompanyDomain(lead.companyName, companyDomain);
      if (domainResult.domain) {
        companyDomain = domainResult.domain;
      }

      // 2. Generate candidate email permutations if email not present
      if (!email && companyDomain) {
        const permutations = generateEmailPermutations(lead.fullName, companyDomain);
        if (permutations.length > 0) {
          email = permutations[0]; // Primary pattern: first.last@domain
        }
      }

      const updated = await prisma.outreachLead.update({
        where: { id: lead.id },
        data: {
          email,
          companyDomain: companyDomain || lead.companyDomain,
          status: email ? 'DRAFT_READY' : lead.status,
          metadata: {
            ...(typeof lead.metadata === 'object' && lead.metadata !== null ? lead.metadata : {}),
            domainResolvedReason: domainResult.reason,
            isVerifiedDomain: domainResult.isVerifiedDomain,
          },
        },
      });

      updatedLeads.push(updated);
    }

    const totalFound = updatedLeads.filter((l) => Boolean(l.email)).length;

    return NextResponse.json({
      success: true,
      totalProcessed: updatedLeads.length,
      emailsFound: totalFound,
      leads: updatedLeads,
    });
  } catch (error: any) {
    console.error('[API OUTREACH FIND EMAILS ERROR]', error);
    return NextResponse.json({ error: error.message || 'Failed to find emails' }, { status: 500 });
  }
}
