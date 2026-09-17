import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/server/auth';
import prisma from '@/lib/prisma';

export async function GET(req: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session?.user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const tenantId = (session.user as any).tenantId;
  const { searchParams } = new URL(req.url);
  const columnId = searchParams.get('columnId');
  const status = searchParams.get('status');

  const where: any = { tenantId, NOT: { status: 'deleted' } };
  if (columnId) where.columnId = columnId;
  if (status) where.status = status;

  const cards = status === 'unread'
    ? await prisma.card.findMany({
        where,
        orderBy: { lastActivityAt: 'desc' },
        select: { id: true },
      })
    : await prisma.card.findMany({
        where,
        orderBy: { lastActivityAt: 'desc' },
        include: { assignedTo: { select: { id: true, name: true, avatar: true } } },
      });

  return NextResponse.json(cards);
}

export async function POST(req: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session?.user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const tenantId = (session.user as any).tenantId;
  const body = await req.json();

  if (!body.columnId) {
    return NextResponse.json({ error: 'Column ID is required' }, { status: 400 });
  }

  // Verify column belongs to this tenant's board
  const targetCol = await prisma.column.findFirst({
    where: { id: body.columnId, board: { tenantId } },
  });

  if (!targetCol) {
    return NextResponse.json({ error: 'Target column not found or unauthorized' }, { status: 403 });
  }

  const card = await prisma.card.create({
    data: {
      subject: body.subject,
      fromEmail: body.fromEmail,
      fromName: body.fromName,
      bodyText: body.bodyText,
      columnId: targetCol.id,
      tenantId,
      channel: body.channel || 'email',
    },
  });

  return NextResponse.json(card, { status: 201 });
}

export async function DELETE(req: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session?.user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const tenantId = (session.user as any).tenantId;
  const body = await req.json().catch(() => ({}));
  const cardIds: string[] = body.cardIds || [];

  if (!Array.isArray(cardIds) || cardIds.length === 0) {
    return NextResponse.json({ error: 'No cards selected' }, { status: 400 });
  }

  // Find cards belonging to this tenant
  const cards = await prisma.card.findMany({
    where: { id: { in: cardIds }, tenantId },
    select: { id: true, messageId: true, imapUid: true, imapFolder: true, emailConfigId: true },
  });

  if (cards.length === 0) {
    return NextResponse.json({ error: 'No valid cards found' }, { status: 404 });
  }

  const validIds = cards.map((c) => c.id);

  // Background archive emails in Zoho/IMAP
  try {
    const { syncArchiveEmail } = await import('@/lib/imap-sync');
    for (const card of cards) {
      syncArchiveEmail(tenantId, {
        messageId: card.messageId,
        imapUid: card.imapUid,
        imapFolder: card.imapFolder,
        emailConfigId: card.emailConfigId,
      }).catch((err) => console.error(`[IMAP Bulk Sync] Failed to archive: ${err.message}`));
    }
  } catch {}

  // Soft-delete in database
  await prisma.$transaction([
    prisma.activityLog.deleteMany({ where: { cardId: { in: validIds } } }),
    prisma.draftMessage.deleteMany({ where: { cardId: { in: validIds } } }),
    prisma.card.updateMany({ where: { id: { in: validIds } }, data: { status: 'deleted' } }),
  ]);

  try {
    const { broadcastAppEvent } = await import('@/lib/events');
    broadcastAppEvent({ type: 'card_updated', tenantId });
  } catch {}

  return NextResponse.json({ success: true, count: validIds.length });
}
