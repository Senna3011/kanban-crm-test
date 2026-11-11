import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/server/auth';
import prisma from '@/lib/prisma';
import { getTregBalance, microToUsd, TREG_PEOPLE_SEARCH_COST_MICRO } from '@/lib/treg-billing';

export async function GET(req: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session?.user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const tenantId = (session.user as any).tenantId;
  const forceRefresh = req.nextUrl.searchParams.get('refresh') === '1';

  try {
    const [balance, totalAgg] = await Promise.all([
      getTregBalance({ forceRefresh, includeUsage: true }),
      prisma.outreachRunLog.aggregate({
        where: { tenantId, step: 'SCRAPE' },
        _sum: { actualCostUsd: true, itemsSaved: true },
        _count: { id: true },
      }),
    ]);

    return NextResponse.json({
      balance,
      pricing: {
        tregPerCallUsd: microToUsd(TREG_PEOPLE_SEARCH_COST_MICRO),
        tregMaxPerCallLeads: 100,
      },
      tenantSpend: {
        totalCostUsd: Number((totalAgg._sum.actualCostUsd || 0).toFixed(6)),
        totalRuns: totalAgg._count.id,
        totalLeadsSaved: totalAgg._sum.itemsSaved || 0,
      },
    });
  } catch (error: any) {
    console.error('[API OUTREACH BILLING ERROR]', error);
    return NextResponse.json({ error: error.message || 'Failed to fetch outreach billing' }, { status: 500 });
  }
}
