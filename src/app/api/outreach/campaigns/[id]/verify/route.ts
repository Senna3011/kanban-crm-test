import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/server/auth';
import prisma from '@/lib/prisma';
import { findProspectEmail, verifyEmailAddress } from '@/lib/reoon';

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

      if (!email) {
        const nameParts = lead.fullName.split(' ');
        const firstName = lead.firstName || nameParts[0] || 'prospect';
        const lastName = lead.lastName || nameParts.slice(1).join(' ') || '';

        const found = await findProspectEmail({
          firstName,
          lastName,
          companyName: lead.companyName || undefined,
          companyDomain: lead.companyDomain || undefined,
          apiKey,
        });

        email = found.email || null;
        verifyStatus = found.status;
        verifyScore = found.score;
      } else {
        const verified = await verifyEmailAddress(email, apiKey);
        verifyStatus = verified.status;
        verifyScore = verified.score;
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
