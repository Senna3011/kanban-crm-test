import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/server/auth';
import prisma from '@/lib/prisma';
import { dispatchColdEmail } from '@/lib/outreach-dispatcher';

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

  const campaign = await prisma.outreachCampaign.findFirst({
    where: { id: campaignId, tenantId },
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
      email: { not: null },
    },
  });

  const results = [];
  for (let i = 0; i < leads.length; i++) {
    const lead = leads[i];
    const result = await dispatchColdEmail({
      leadId: lead.id,
      tenantId,
    });
    results.push({ leadId: lead.id, email: lead.email, ...result });

    // Stagger email dispatch to avoid burst rate-limiting and protect sender domain reputation
    if (i < leads.length - 1 && result.success) {
      await new Promise((resolve) => setTimeout(resolve, 1500));
    }
  }

  // Update campaign status to RUNNING if not already
  await prisma.outreachCampaign.update({
    where: { id: campaign.id },
    data: { status: 'RUNNING' },
  });

  return NextResponse.json({
    success: true,
    dispatchedCount: results.filter((r) => r.success).length,
    failedCount: results.filter((r) => !r.success).length,
    results,
  });
}
