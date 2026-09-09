import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/server/auth';
import prisma from '@/lib/prisma';
import { syncArchiveEmail } from '@/lib/imap-sync';

export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> | { id: string } }) {
  try {
    const resolvedParams = params instanceof Promise ? await params : params;
    const id = resolvedParams?.id;
    if (!id) {
      return NextResponse.json({ error: 'Card ID is required' }, { status: 400 });
    }

    const session = await getServerSession(authOptions);
    if (!session?.user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const tenantId = (session.user as any).tenantId;

    const card = await prisma.card.findUnique({
      where: { id: id },
      include: {
        activityLogs: { orderBy: { createdAt: 'desc' } },
        drafts: { orderBy: { editedAt: 'desc' } },
        assignedTo: { select: { id: true, name: true } },
        column: { select: { id: true, title: true, boardId: true } },
      },
    });

    if (!card || card.tenantId !== tenantId) {
      return NextResponse.json({ error: 'Not found' }, { status: 404 });
    }

    return NextResponse.json(card);
  } catch (error: any) {
    console.error(`[API /api/cards/[id]] GET error:`, error);
    return NextResponse.json(
      { error: error?.message || 'Internal server error' },
      { status: 500 }
    );
  }
}

export async function PUT(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const session = await getServerSession(authOptions);
  if (!session?.user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const tenantId = (session.user as any).tenantId;
  const body = await req.json();

  const card = await prisma.card.findUnique({
    where: { id: id },
    include: { column: { select: { title: true } } },
  });
  if (!card || card.tenantId !== tenantId) {
    return NextResponse.json({ error: 'Not found' }, { status: 404 });
  }

  if (body.columnId) {
    const targetCol = await prisma.column.findFirst({
      where: { id: body.columnId, board: { tenantId } },
    });
    if (!targetCol) {
      return NextResponse.json({ error: 'Target column not found or access denied' }, { status: 400 });
    }
  }

  const updated = await prisma.card.update({
    where: { id: id },
    data: {
      columnId: body.columnId,
      status: body.status,
      highlighted: body.highlighted,
      assignedToId: body.assignedToId,
    },
  });

  return NextResponse.json(updated);
}

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const session = await getServerSession(authOptions);
  if (!session?.user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const tenantId = (session.user as any).tenantId;
  const body = await req.json();

  const card = await prisma.card.findUnique({ where: { id: id } });
  if (!card || card.tenantId !== tenantId) {
    return NextResponse.json({ error: 'Not found' }, { status: 404 });
  }

  const updated = await prisma.card.update({
    where: { id: id },
    data: { status: body.status },
  });

  // Non-blocking background sync read/unread status with IMAP (Zoho/Gmail)
  if (body.status === 'unread' || body.status === 'read') {
    (async () => {
      try {
        const { ImapFlow } = await import('imapflow');
        const configs = card.emailConfigId
          ? await prisma.emailConfig.findMany({ where: { id: card.emailConfigId, tenantId, isActive: true } })
          : await prisma.emailConfig.findMany({ where: { tenantId, isActive: true } });

        const folder = card.imapFolder || 'INBOX';

        for (const config of configs) {
          try {
            let authConfig: any = { user: config.imapUser };
            if (config.authType === 'oauth2') {
              const { getValidZohoAccessToken } = await import('@/lib/zoho-oauth');
              authConfig.accessToken = await getValidZohoAccessToken(config.id);
            } else if (config.imapPass) {
              const { decrypt } = await import('@/lib/encryption');
              authConfig.pass = decrypt(config.imapPass);
            } else {
              continue;
            }

            const imap = new ImapFlow({
              host: config.imapHost, port: config.imapPort,
              secure: config.imapPort === 993,
              auth: authConfig,
              tls: {
                rejectUnauthorized: process.env.NODE_ENV === 'production' && process.env.IMAP_ALLOW_SELF_SIGNED !== 'true',
              },
              logger: false,
            });
            await imap.connect();
            await imap.mailboxOpen(folder, { readOnly: false });
            // Find UID: try imapUid first, fallback to search by Message-ID
            let uid = card.imapUid;
            if (!uid && card.messageId) {
              const results = await imap.search({ header: { 'Message-ID': card.messageId } });
              if (results && results.length > 0) uid = results[0];
            }
            if (uid) {
              if (body.status === 'unread') {
                await imap.messageFlagsRemove({ uid }, ['\\Seen'], { uid: true });
                console.log(`[IMAP Sync] Marked ${card.messageId} as UNREAD in ${config.name} (UID: ${uid}, folder: ${folder})`);
              } else {
                await imap.messageFlagsAdd({ uid }, ['\\Seen'], { uid: true });
                console.log(`[IMAP Sync] Marked ${card.messageId} as READ in ${config.name} (UID: ${uid}, folder: ${folder})`);
              }
              await imap.logout();
              break; // Found and updated, stop searching
            }
            await imap.logout();
          } catch (configErr: any) {
            console.error(`[IMAP Sync] Config ${config.name} failed: ${configErr.message}`);
          }
        }
      } catch (err: any) {
        console.error(`[IMAP Sync] Failed to sync read status: ${err.message}`);
      }
    })().catch((e) => console.error(`[IMAP Sync] Unhandled background error: ${e.message}`));
  }

  return NextResponse.json(updated);
}

export async function DELETE(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const session = await getServerSession(authOptions);
  if (!session?.user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const tenantId = (session.user as any).tenantId;
  const card = await prisma.card.findUnique({ where: { id: id } });
  if (!card || card.tenantId !== tenantId) {
    return NextResponse.json({ error: 'Not found' }, { status: 404 });
  }

  // Snapshot card data for background archiving before atomic delete
  const cardSnapshot = {
    messageId: card.messageId,
    imapUid: card.imapUid,
    imapFolder: card.imapFolder,
    emailConfigId: card.emailConfigId,
  };

  syncArchiveEmail(tenantId, cardSnapshot).catch((err) =>
    console.error(`[IMAP Sync] Failed to archive: ${err.message}`)
  );

  // Soft-delete: update status to 'deleted' so poller never resurrects this card
  await prisma.$transaction([
    prisma.activityLog.deleteMany({ where: { cardId: id } }),
    prisma.draftMessage.deleteMany({ where: { cardId: id } }),
    prisma.card.update({ where: { id: id }, data: { status: 'deleted' } }),
  ]);

  return NextResponse.json({ success: true });
}
