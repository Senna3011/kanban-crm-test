import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/server/auth';
import prisma from '@/lib/prisma';
import { estimateLeadSearchCost } from '@/lib/treg-billing';
import { outreachScrapeQueue } from '@/../queue';

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

  if (campaign.status === 'RUNNING') {
    return NextResponse.json({
      success: true,
      queued: true,
      alreadyRunning: true,
      message: 'Lead search is running in the background worker.',
    });
  }

  const body = await req.json().catch(() => ({}));
  const limit = Number(body.limit) || 100;
  const provider = 'treg';
  const estimatedCostUsd = estimateLeadSearchCost(provider, limit);

  const runLog = await prisma.outreachRunLog.create({
    data: {
      campaignId: campaign.id,
      tenantId,
      step: 'SCRAPE',
      provider,
      status: 'RUNNING',
      itemsRequested: limit,
      estimatedCostUsd,
      costSource: 'verified_ledger',
      metadata: { source: 'widen-search-global' },
    },
  });

  await prisma.outreachCampaign.update({
    where: { id: campaign.id },
    data: { status: 'RUNNING' },
  });

  const job = await outreachScrapeQueue.add(
    'outreach_scrape',
    {
      type: 'outreach_scrape',
      tenantId,
      campaignId: campaign.id,
      runLogId: runLog.id,
      query: campaign.searchQuery || undefined,
      role: campaign.targetRole || 'Chief Technology Officer',
      location: undefined, // global widen
      industry: campaign.targetIndustry || undefined,
      limit,
      provider,
      apiToken: campaign.account?.apifyApiToken || process.env.APIFY_API_TOKEN,
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
    runLog,
    estimatedCostUsd,
    message: `Widening search globally for ${limit} leads queued.`,
  });
}
