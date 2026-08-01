import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/server/auth';
import prisma from '@/lib/prisma';
import { syncMarkAsRead, syncArchiveEmail } from '@/lib/imap-sync';

export async function GET(req: NextRequest, { params }: { params: { id: string } }) {
  const session = await getServerSession(authOptions);
  if (!session?.user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const card = await prisma.card.findUnique({
    where: { id: params.id },
    include: {
      activityLogs: { orderBy: { createdAt: 'desc' } },
      drafts: { orderBy: { editedAt: 'desc' } },
      assignedTo: { select: { id: true, name: true } },
    },
  });

  if (!card || card.tenantId !== (session.user as any).tenantId) {
    return NextResponse.json({ error: 'Not found' }, { status: 404 });
  }

  return NextResponse.json(card);
}

export async function PUT(req: NextRequest, { params }: { params: { id: string } }) {
  const session = await getServerSession(authOptions);
  if (!session?.user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const tenantId = (session.user as any).tenantId;
  const body = await req.json();

  const card = await prisma.card.findUnique({
    where: { id: params.id },
    include: { column: { select: { title: true } } },
  });
  if (!card || card.tenantId !== tenantId) {
    return NextResponse.json({ error: 'Not found' }, { status: 404 });
  }

  const updated = await prisma.card.update({
    where: { id: params.id },
    data: {
      columnId: body.columnId,
      status: body.status,
      highlighted: body.highlighted,
      assignedToId: body.assignedToId,
    },
  });

  // Sync: if moved FROM Unreads to another column, mark as read in Zoho
  if (card.column.title === 'Unreads' && body.columnId && body.columnId !== card.columnId) {
    syncMarkAsRead(tenantId, params.id).catch((err) =>
      console.error(`[IMAP Sync] Failed to mark as read: ${err.message}`)
    );
  }

  return NextResponse.json(updated);
}

export async function DELETE(req: NextRequest, { params }: { params: { id: string } }) {
  const session = await getServerSession(authOptions);
  if (!session?.user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const tenantId = (session.user as any).tenantId;
  const card = await prisma.card.findUnique({ where: { id: params.id } });
  if (!card || card.tenantId !== tenantId) {
    return NextResponse.json({ error: 'Not found' }, { status: 404 });
  }

  // Sync: archive email in Zoho before deleting from CRM
  syncArchiveEmail(tenantId, params.id).catch((err) =>
    console.error(`[IMAP Sync] Failed to archive: ${err.message}`)
  );

  await prisma.activityLog.deleteMany({ where: { cardId: params.id } });
  await prisma.draftMessage.deleteMany({ where: { cardId: params.id } });
  await prisma.card.delete({ where: { id: params.id } });

  return NextResponse.json({ success: true });
}
