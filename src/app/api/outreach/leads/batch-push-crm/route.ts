import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/server/auth';
import prisma from '@/lib/prisma';
import { convertOutreachLeadToKanbanCard } from '@/lib/outreach-dispatcher';

export async function POST(req: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session?.user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const tenantId = (session.user as any).tenantId;

  try {
    const body = await req.json().catch(() => ({}));
    const leadIds: string[] = body.leadIds;

    if (!Array.isArray(leadIds) || leadIds.length === 0) {
      return NextResponse.json({ error: 'No leadIds provided' }, { status: 400 });
    }

    const leads = await prisma.outreachLead.findMany({
      where: {
        id: { in: leadIds },
        campaign: { tenantId },
      },
    });

    const results = [];
    let convertedCount = 0;
    let failedCount = 0;

    for (const lead of leads) {
      try {
        const res = await convertOutreachLeadToKanbanCard({
          leadId: lead.id,
          tenantId,
        });
        results.push({ leadId: lead.id, cardId: res.cardId, success: true });
        convertedCount++;
      } catch (err: any) {
        console.error(`[BATCH PUSH CRM] Failed for lead ${lead.id}:`, err);
        results.push({ leadId: lead.id, success: false, error: err.message });
        failedCount++;
      }
    }

    return NextResponse.json({
      success: true,
      convertedCount,
      failedCount,
      results,
    });
  } catch (error: any) {
    console.error('[API OUTREACH BATCH PUSH CRM] Error:', error);
    return NextResponse.json({ error: error.message || 'Batch push failed' }, { status: 500 });
  }
}
