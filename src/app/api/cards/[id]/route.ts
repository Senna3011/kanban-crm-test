import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/server/auth';
import prisma from '@/lib/prisma';
import { syncArchiveEmail } from '@/lib/imap-sync';

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

  return NextResponse.json(updated);
}

export async function PATCH(req: NextRequest, { params }: { params: { id: string } }) {
  const session = await getServerSession(authOptions);
  if (!session?.user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const tenantId = (session.user as any).tenantId;
  const body = await req.json();

  const card = await prisma.card.findUnique({ where: { id: params.id } });
  if (!card || card.tenantId !== tenantId) {
    return NextResponse.json({ error: 'Not found' }, { status: 404 });
  }

  const updated = await prisma.card.update({
    where: { id: params.id },
    data: { status: body.status },
  });

  // Sync: if marking as unread, remove \Seen flag in Zoho
  if (body.status === 'unread') {
    try {
      const { ImapFlow } = await import('imapflow');
      const config = await prisma.emailConfig.findFirst({ where: { tenantId, isActive: true } });
      if (config) {
        const { decrypt } = await import('@/lib/encryption');
        const imap = new ImapFlow({
          host: config.imapHost, port: config.imapPort,
          secure: config.imapPort === 993,
          auth: { user: config.imapUser, pass: decrypt(config.imapPass) },
          logger: false,
        });
        await imap.connect();
        await imap.mailboxOpen('INBOX', { readOnly: false });
        // Find UID: try imapUid first, fallback to search by Message-ID
        let uid = card.imapUid;
        if (!uid && card.messageId) {
          const results = await imap.search({ header: { 'Message-ID': card.messageId } });
          if (results && results.length > 0) uid = results[0];
        }
        if (uid) {
          await imap.messageFlagsRemove({ uid }, ['\\Seen'], { uid: true });
          console.log(`[IMAP Sync] Marked ${card.messageId} as unread (UID: ${uid})`);
        }
        await imap.logout();
      }
    } catch (err: any) {
      console.error(`[IMAP Sync] Failed to mark as unread: ${err.message}`);
    }
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
