import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/server/auth';
import prisma from '@/lib/prisma';
import { sendDraft } from '@/server/actions/draft';

export async function POST(req: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session?.user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const tenantId = (session.user as any).tenantId;

  try {
    const body = await req.json().catch(() => ({}));
    const { columnId, fromAddress } = body;

    if (!columnId) {
      return NextResponse.json({ error: 'columnId is required' }, { status: 400 });
    }

    // Verify column belongs to this tenant
    const column = await prisma.column.findFirst({
      where: { id: columnId, board: { tenantId } },
      include: { board: true },
    });

    if (!column) {
      return NextResponse.json({ error: 'Column not found or unauthorized' }, { status: 404 });
    }

    // Find all cards in this column with pending or edited drafts
    const cards = await prisma.card.findMany({
      where: {
        columnId,
        tenantId,
        drafts: {
          some: {
            status: { in: ['pending', 'edited'] },
          },
        },
      },
      include: {
        drafts: {
          where: { status: { in: ['pending', 'edited'] } },
          take: 1,
        },
      },
    });

    if (cards.length === 0) {
      return NextResponse.json({
        success: true,
        message: 'No cards with pending drafts found in this column.',
        sentCount: 0,
        failedCount: 0,
      });
    }

    let sentCount = 0;
    let failedCount = 0;

    for (const card of cards) {
      const draft = card.drafts[0];
      if (!draft || !card.fromEmail) continue;

      try {
        await sendDraft(draft.id, fromAddress);
        sentCount++;

        // 1.5s throttle between sends to maintain healthy deliverability
        await new Promise((res) => setTimeout(res, 1500));
      } catch (err: any) {
        console.error(`[SEND COLUMN DRAFTS] Error sending card ${card.id}:`, err?.message || err);
        failedCount++;
      }
    }

    return NextResponse.json({
      success: true,
      sentCount,
      failedCount,
      totalCards: cards.length,
      message: `Successfully sent ${sentCount} outreach email(s).`,
    });
  } catch (error: any) {
    console.error('[API SEND COLUMN DRAFTS ERROR]', error);
    return NextResponse.json({ error: error.message || 'Failed to dispatch emails' }, { status: 500 });
  }
}
