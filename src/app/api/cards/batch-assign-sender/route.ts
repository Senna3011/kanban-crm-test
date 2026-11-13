import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/server/auth';
import prisma from '@/lib/prisma';

export async function POST(req: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session?.user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const tenantId = (session.user as any).tenantId;

  try {
    const body = await req.json().catch(() => ({}));
    const { cardIds, emailConfigId, fromAddress } = body;

    if (!Array.isArray(cardIds) || cardIds.length === 0) {
      return NextResponse.json({ error: 'cardIds array is required' }, { status: 400 });
    }

    // Verify cards belong to this tenant
    const cards = await prisma.card.findMany({
      where: {
        id: { in: cardIds },
        tenantId,
      },
      select: { id: true, metadata: true },
    });

    if (cards.length === 0) {
      return NextResponse.json({ error: 'No matching cards found' }, { status: 404 });
    }

    // If an emailConfigId is supplied, verify it belongs to this tenant
    let resolvedEmailConfigId = emailConfigId;
    if (emailConfigId) {
      const config = await prisma.emailConfig.findFirst({
        where: { id: emailConfigId, tenantId },
      });
      if (!config) {
        // Check if it's an outreach account
        const outreachAccount = await prisma.outreachAccountConfig.findFirst({
          where: { id: emailConfigId, tenantId },
        });
        if (!outreachAccount) {
          return NextResponse.json({ error: 'Selected email mailbox is invalid or unauthorized' }, { status: 400 });
        }
      }
    }

    let updatedCount = 0;
    for (const card of cards) {
      const meta = (typeof card.metadata === 'object' && card.metadata !== null) ? { ...(card.metadata as any) } : {};
      if (fromAddress) {
        meta.fromAddress = fromAddress;
      }

      await prisma.card.update({
        where: { id: card.id },
        data: {
          emailConfigId: resolvedEmailConfigId || null,
          metadata: meta,
        },
      });
      updatedCount++;
    }

    // Broadcast update
    try {
      const { broadcastAppEvent } = await import('@/lib/events');
      broadcastAppEvent({ type: 'card_updated', tenantId });
    } catch {}

    return NextResponse.json({
      success: true,
      updatedCount,
      message: `Successfully assigned sender to ${updatedCount} prospect card(s).`,
    });
  } catch (error: any) {
    console.error('[API CARDS BATCH ASSIGN SENDER ERROR]', error);
    return NextResponse.json({ error: error.message || 'Failed to assign sender' }, { status: 500 });
  }
}
