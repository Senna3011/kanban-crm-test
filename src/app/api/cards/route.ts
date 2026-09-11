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
