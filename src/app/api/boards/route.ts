import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/server/auth';
import prisma from '@/lib/prisma';

export async function GET() {
  const session = await getServerSession(authOptions);
  if (!session?.user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const tenantId = (session.user as any).tenantId;
  const userId = (session.user as any).id;
  const role = (session.user as any).role;

  let boards;
  if (role === 'admin') {
    boards = await prisma.board.findMany({
      where: { tenantId },
      orderBy: { createdAt: 'asc' },
      select: { id: true, title: true },
    });
  } else {
    // Check if user has specific assigned boards inside tenant companyInfo or default to all
    const tenant = await prisma.tenant.findUnique({
      where: { id: tenantId },
      select: { companyInfo: true },
    });

    let userBoardMap: Record<string, string[]> = {};
    try {
      if (tenant?.companyInfo) {
        const parsed = JSON.parse(tenant.companyInfo);
        userBoardMap = parsed.userBoardMap || {};
      }
    } catch {}

    const allowedIds = userBoardMap[userId];

    if (Array.isArray(allowedIds) && allowedIds.length > 0) {
      boards = await prisma.board.findMany({
        where: { tenantId, id: { in: allowedIds } },
        orderBy: { createdAt: 'asc' },
        select: { id: true, title: true },
      });
    } else {
      // Default: see all boards in tenant
      boards = await prisma.board.findMany({
        where: { tenantId },
        orderBy: { createdAt: 'asc' },
        select: { id: true, title: true },
      });
    }
  }

  return NextResponse.json(boards);
}

export async function POST(req: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session?.user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const role = (session.user as any).role;
  if (role !== 'admin') {
    return NextResponse.json({ error: 'Forbidden: Hanya Admin yang dapat membuat Board baru.' }, { status: 403 });
  }

  const tenantId = (session.user as any).tenantId;
  const body = await req.json();

  if (!body.title?.trim()) return NextResponse.json({ error: 'Title required' }, { status: 400 });

  const board = await prisma.board.create({
    data: { title: body.title.trim(), tenantId },
  });

  const defaultColumns = [
    { title: 'Unreads', position: 0, color: '#6b7280', isSystem: true },
    { title: 'Leads', position: 1, color: '#3b82f6', isSystem: false },
    { title: 'General', position: 2, color: '#64748b', isSystem: false },
    { title: 'Follow up 1', position: 3, color: '#f59e0b', isSystem: false },
    { title: 'Follow up 2', position: 4, color: '#f59e0b', isSystem: false },
    { title: 'Follow up 3', position: 5, color: '#f59e0b', isSystem: false },
    { title: 'Fail', position: 6, color: '#ef4444', isSystem: false },
    { title: 'Pending', position: 7, color: '#8b5cf6', isSystem: false },
    { title: 'Success', position: 8, color: '#22c55e', isSystem: false },
  ];

  for (const col of defaultColumns) {
    await prisma.column.create({ data: { ...col, boardId: board.id } });
  }

  return NextResponse.json(board, { status: 201 });
}
