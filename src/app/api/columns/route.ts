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
        orderBy: { lastActivityAt: 'desc' },
      },
    },
  });

  return NextResponse.json(columns);
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
