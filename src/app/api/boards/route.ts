import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/server/auth';
import prisma from '@/lib/prisma';

export async function GET() {
  const session = await getServerSession(authOptions);
  if (!session?.user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const tenantId = (session.user as any).tenantId;
  const boards = await prisma.board.findMany({
    where: { tenantId },
    orderBy: { createdAt: 'asc' },
    select: { id: true, title: true },
  });

  return NextResponse.json(boards);
}

export async function POST(req: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session?.user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const tenantId = (session.user as any).tenantId;
  const body = await req.json();

  if (!body.title?.trim()) return NextResponse.json({ error: 'Title required' }, { status: 400 });

  const board = await prisma.board.create({
    data: { title: body.title.trim(), tenantId },
  });

  const defaultColumns = [
    { title: 'Unreads', position: 0, color: '#6b7280', isSystem: true },
    { title: 'Leads', position: 1, color: '#3b82f6', isSystem: false },
    { title: 'Follow up 1', position: 2, color: '#f59e0b', isSystem: false },
    { title: 'Follow up 2', position: 3, color: '#f59e0b', isSystem: false },
    { title: 'Follow up 3', position: 4, color: '#f59e0b', isSystem: false },
    { title: 'Fail', position: 5, color: '#ef4444', isSystem: false },
    { title: 'Pending', position: 6, color: '#8b5cf6', isSystem: false },
    { title: 'Success', position: 7, color: '#22c55e', isSystem: false },
  ];

  for (const col of defaultColumns) {
    await prisma.column.create({ data: { ...col, boardId: board.id } });
  }

  return NextResponse.json(board, { status: 201 });
}
