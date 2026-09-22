import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/server/auth';
import prisma from '@/lib/prisma';
import { outreachDispatchQueue } from '@/../queue';
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
      email: { not: null },
      status: { notIn: ['DISPATCHED', 'CONVERTED', 'REPLIED'] },
    },
  });

  if (leads.length === 0) {
    return NextResponse.json({
      success: true,
      message: 'No pending leads ready for dispatch.',
      queuedCount: 0,
      dispatchedCount: 0,
    });
  }

  let enqueuedCount = 0;
  let fallbackSyncCount = 0;

  try {
    // Enqueue jobs to BullMQ background queue with staggered delays
    for (let i = 0; i < leads.length; i++) {
      const lead = leads[i];
      await outreachDispatchQueue.add(
        'outreach_dispatch',
        {
          type: 'outreach_dispatch',
          tenantId,
          leadId: lead.id,
        },
        {
          delay: i * 2000, // Stagger 2s per lead
          attempts: 2,
          backoff: { type: 'exponential', delay: 5000 },
          removeOnComplete: true,
        }
      );
      enqueuedCount++;
    }
  } catch (queueError) {
    console.warn('[OUTREACH DISPATCH] Queue unavailable, falling back to direct dispatch:', queueError);
    for (let i = 0; i < leads.length; i++) {
      const lead = leads[i];
      await dispatchColdEmail({ leadId: lead.id, tenantId });
      fallbackSyncCount++;
    }
  }

  // Update campaign status to RUNNING
  await prisma.outreachCampaign.update({
    where: { id: campaign.id },
    data: { status: 'RUNNING' },
  });

  return NextResponse.json({
    success: true,
    message: enqueuedCount > 0
      ? `Successfully queued ${enqueuedCount} emails to background dispatcher.`
      : `Dispatched ${fallbackSyncCount} emails directly.`,
    queuedCount: enqueuedCount || fallbackSyncCount,
    dispatchedCount: fallbackSyncCount,
  });
}
