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
  const searchParams = req.nextUrl.searchParams;
  const rangeDays = Math.min(Math.max(parseInt(searchParams.get('days') || '14', 10), 7), 60);

  try {
    const startDate = new Date();
    startDate.setDate(startDate.getDate() - (rangeDays - 1));
    startDate.setHours(0, 0, 0, 0);

    // Fetch leads created or modified in the time range
    const [leads, convertedCards] = await Promise.all([
      prisma.outreachLead.findMany({
        where: {
          campaign: { tenantId },
          createdAt: { gte: startDate },
        },
        select: {
          id: true,
          status: true,
          verifyStatus: true,
          createdAt: true,
          sentAt: true,
          repliedAt: true,
          dripSentAt: true,
        },
      }),
      prisma.card.findMany({
        where: {
          tenantId,
          createdAt: { gte: startDate },
          dealValue: { not: null },
        },
        select: {
          id: true,
          createdAt: true,
          dealValue: true,
        },
      }),
    ]);

    // Build day map
    const dayMap = new Map<string, {
      date: string;
      label: string;
      sourced: number;
      verified: number;
      dispatched: number;
      replied: number;
      value: number;
    }>();

    for (let i = 0; i < rangeDays; i++) {
      const d = new Date(startDate);
      d.setDate(d.getDate() + i);
      const key = d.toISOString().split('T')[0];
      const label = d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
      dayMap.set(key, {
        date: key,
        label,
        sourced: 0,
        verified: 0,
        dispatched: 0,
        replied: 0,
        value: 0,
      });
    }

    let totalSourced = 0;
    let totalVerified = 0;
    let totalDispatched = 0;
    let totalReplied = 0;

    for (const lead of leads) {
      const createdKey = lead.createdAt.toISOString().split('T')[0];
      if (dayMap.has(createdKey)) {
        dayMap.get(createdKey)!.sourced += 1;
        totalSourced++;
      }

      if (lead.verifyStatus === 'SAFE') {
        if (dayMap.has(createdKey)) {
          dayMap.get(createdKey)!.verified += 1;
        }
        totalVerified++;
      }

      if (lead.sentAt) {
        const sentKey = lead.sentAt.toISOString().split('T')[0];
        if (dayMap.has(sentKey)) {
          dayMap.get(sentKey)!.dispatched += 1;
        }
        totalDispatched++;
      }

      if (lead.repliedAt || lead.status === 'REPLIED' || lead.status === 'CONVERTED') {
        const replyKey = (lead.repliedAt || lead.createdAt).toISOString().split('T')[0];
        if (dayMap.has(replyKey)) {
          dayMap.get(replyKey)!.replied += 1;
        }
        totalReplied++;
      }
    }

    let totalValue = 0;
    for (const card of convertedCards) {
      const cardKey = card.createdAt.toISOString().split('T')[0];
      const val = card.dealValue ? Number(card.dealValue) : 0;
      if (val > 0) {
        if (dayMap.has(cardKey)) {
          dayMap.get(cardKey)!.value += val;
        }
        totalValue += val;
      }
    }

    const timeSeries = Array.from(dayMap.values());
    const replyRate = totalDispatched > 0 ? ((totalReplied / totalDispatched) * 100).toFixed(1) : '0.0';
    const verifyRate = totalSourced > 0 ? ((totalVerified / totalSourced) * 100).toFixed(1) : '0.0';

    return NextResponse.json({
      rangeDays,
      timeSeries,
      summary: {
        totalSourced,
        totalVerified,
        totalDispatched,
        totalReplied,
        totalValue,
        replyRate,
        verifyRate,
      },
    });
  } catch (error: any) {
    console.error('[API OUTREACH ANALYTICS ERROR]', error);
    return NextResponse.json({ error: error.message || 'Failed to fetch analytics' }, { status: 500 });
  }
}
