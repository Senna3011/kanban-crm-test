import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/server/auth';
import prisma from '@/lib/prisma';

export async function GET(req: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session?.user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const tenantId = (session.user as any).tenantId;
  const boardId = req.nextUrl.searchParams.get('boardId');

  let board;
  if (boardId) {
    board = await prisma.board.findFirst({ where: { id: boardId, tenantId } });
  } else {
    board = await prisma.board.findFirst({ where: { tenantId } });
  }
  if (!board) return NextResponse.json([]);

  const columns = await prisma.column.findMany({
    where: { boardId: board.id },
    orderBy: { position: 'asc' },
    include: {
      cards: {
        where: {
          NOT: { status: 'deleted' },
        },
        orderBy: { lastActivityAt: 'desc' },
        select: {
          id: true, subject: true, fromEmail: true, fromName: true,
          bodyText: true, status: true, channel: true, highlighted: true,
          columnId: true, assignedToId: true, lastActivityAt: true,
          nextFollowUpAt: true, metadata: true, createdAt: true,
        },
      },
    },
  });

  // Compute threadCount per card: group cards by normalized subject within this board's cards
  const allCards = columns.flatMap(c => c.cards);
  const subjectGroups = new Map<string, string[]>();
  for (const c of allCards) {
    const base = (c.subject || '')
      .replace(/^(re:|fw:|fwd:|re\s*\[\d+\]:)\s*/gi, '')
      .trim()
      .toLowerCase();
    const key = base || c.id;
    if (!subjectGroups.has(key)) subjectGroups.set(key, []);
    subjectGroups.get(key)!.push(c.id);
  }
  const threadCountMap = new Map<string, number>();
  for (const [key, ids] of subjectGroups) {
    for (const id of ids) {
      threadCountMap.set(id, ids.length);
    }
  }

  // Add threadCount and descLen to each card
  const enriched = columns.map(col => ({
    ...col,
    cards: col.cards.map(card => ({
      ...card,
      threadCount: threadCountMap.get(card.id) || 1,
      descLen: card.bodyText ? card.bodyText.length : 0,
    })),
  }));

  return NextResponse.json(enriched);
}

export async function POST(req: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session?.user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const tenantId = (session.user as any).tenantId;
  const body = await req.json();

  const board = body.boardId
    ? await prisma.board.findFirst({ where: { id: body.boardId, tenantId } })
    : await prisma.board.findFirst({ where: { tenantId } });
  if (!board) return NextResponse.json({ error: 'Board not found' }, { status: 404 });

  const column = await prisma.column.create({
    data: {
      title: body.title,
      position: body.position,
      color: body.color || '#6366f1',
      boardId: board.id,
    },
  });

  return NextResponse.json(column, { status: 201 });
}

export async function PUT(req: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session?.user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const body = await req.json();

  if (body.columns) {
    for (const col of body.columns) {
      await prisma.column.update({
        where: { id: col.id },
        data: { title: col.title, position: col.position, color: col.color },
      });
    }
  }

  if (body.deleteIds) {
    for (const id of body.deleteIds) {
      const col = await prisma.column.findUnique({ where: { id } });
      if (col && !col.isSystem) {
        await prisma.column.delete({ where: { id } });
      }
    }
  }

  return NextResponse.json({ success: true });
}
