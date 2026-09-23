import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/server/auth';
import prisma from '@/lib/prisma';

export async function GET(req: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session?.user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const tenantId = (session.user as any).tenantId;

  try {
    const [campaigns, leadStatusGroups, safeStatusGroups] = await Promise.all([
      prisma.outreachCampaign.findMany({
        where: { tenantId },
        orderBy: { createdAt: 'desc' },
        include: {
          account: {
            select: { id: true, name: true, senderEmail: true },
          },
          _count: {
            select: { leads: true },
          },
        },
      }),
      prisma.outreachLead.groupBy({
        by: ['campaignId', 'status'],
        where: { campaign: { tenantId } },
        _count: { id: true },
      }),
      prisma.outreachLead.groupBy({
        by: ['campaignId'],
        where: { campaign: { tenantId }, verifyStatus: 'SAFE' },
        _count: { id: true },
      }),
    ]);

    // Map aggregated metrics per campaign
    const safeCountMap = new Map<string, number>();
    for (const item of safeStatusGroups) {
      safeCountMap.set(item.campaignId, item._count.id);
    }

    const dispatchedMap = new Map<string, number>();
    const convertedMap = new Map<string, number>();

    for (const item of leadStatusGroups) {
      const cId = item.campaignId;
      const count = item._count.id;
      if (['DISPATCHED', 'CONVERTED', 'REPLIED'].includes(item.status)) {
        dispatchedMap.set(cId, (dispatchedMap.get(cId) || 0) + count);
      }
      if (item.status === 'CONVERTED') {
        convertedMap.set(cId, (convertedMap.get(cId) || 0) + count);
      }
    }

    const formatted = campaigns.map((c) => {
      const totalLeads = c._count.leads;
      const verifiedSafe = safeCountMap.get(c.id) || 0;
      const dispatched = dispatchedMap.get(c.id) || 0;
      const converted = convertedMap.get(c.id) || 0;

      return {
        id: c.id,
        name: c.name,
        targetRole: c.targetRole,
        targetLocation: c.targetLocation,
        targetIndustry: c.targetIndustry,
        searchQuery: c.searchQuery,
        status: c.status,
        createdAt: c.createdAt,
        account: c.account,
        metrics: {
          totalLeads,
          verifiedSafe,
          dispatched,
          converted,
        },
      };
    });

    return NextResponse.json(formatted);
  } catch (error: any) {
    console.error('[API OUTREACH GET CAMPAIGNS ERROR]', error);
    return NextResponse.json({ error: error.message || 'Failed to fetch campaigns' }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session?.user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const tenantId = (session.user as any).tenantId;

  try {
    const body = await req.json();
    const { name, targetRole, targetLocation, targetIndustry, searchQuery, promptInstructions, accountId } = body;

    if (!name || typeof name !== 'string') {
      return NextResponse.json({ error: 'Campaign name is required' }, { status: 400 });
    }

    // Optional accountId: link to OutreachAccountConfig if provided, otherwise allow null (zero blocker)
    let validAccountId: string | null = null;
    if (accountId && typeof accountId === 'string') {
      const existingAccount = await prisma.outreachAccountConfig.findFirst({
        where: { id: accountId, tenantId },
      });
      if (existingAccount) {
        validAccountId = existingAccount.id;
      }
    }

    const campaign = await prisma.outreachCampaign.create({
      data: {
        name: name.trim(),
        targetRole: targetRole?.trim() || null,
        targetLocation: targetLocation?.trim() || null,
        targetIndustry: targetIndustry?.trim() || null,
        searchQuery: searchQuery?.trim() || null,
        promptInstructions: promptInstructions?.trim() || null,
        tenantId,
        accountId: validAccountId,
      },
      include: {
        account: true,
      },
    });

    return NextResponse.json(campaign, { status: 201 });
  } catch (error: any) {
    console.error('[API OUTREACH CAMPAIGNS] Create error:', error);
    return NextResponse.json({ error: error.message || 'Failed to create campaign' }, { status: 500 });
  }
}
