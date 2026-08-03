import prisma from '../src/lib/prisma';
import { decrypt } from '../src/lib/encryption';
import { EmailAdapter } from '../channels/email';
import { aiProcessQueue } from '../queue';

const emailAdapter = new EmailAdapter();

// Map IMAP folder names to board titles
const FOLDER_TO_BOARD: Record<string, string> = {
  'INBOX': 'JetDigitaPro',
  'Elite': 'Elite Team',
  'Gold': 'Gold Team',
  'Premiere': 'Premiere Team',
  'Nell': 'Nell VH',
};

async function resolveBoard(tenantId: string, toEmail?: string, folder?: string) {
  // First try folder-based routing
  if (folder && FOLDER_TO_BOARD[folder]) {
    const board = await prisma.board.findFirst({ where: { tenantId, title: FOLDER_TO_BOARD[folder] } });
    if (board) return board;
  }

  // Then try recipient-based routing
  const tenant = await prisma.tenant.findUnique({ where: { id: tenantId }, select: { companyInfo: true } });
  let routing: Record<string, string> = {};
  try {
    if (tenant?.companyInfo) {
      const info = JSON.parse(tenant.companyInfo);
      routing = info.emailRouting || {};
    }
  } catch {}

  if (toEmail && routing[toEmail]) {
    const board = await prisma.board.findFirst({ where: { tenantId, title: routing[toEmail] } });
    if (board) return board;
  }

  // Fallback: General board or first board
  const general = await prisma.board.findFirst({ where: { tenantId, title: 'General' } });
  if (general) return general;
  return prisma.board.findFirst({ where: { tenantId } });
}

async function pollFolder(imapConfig: Record<string, string>, folder: string, tenantId: string, emailConfigId: string) {
  console.log(`[IMAP Poller] Polling folder: ${folder}...`);
  
  let messages;
  try {
    messages = await emailAdapter.pollInbox(imapConfig, folder);
  } catch (err: any) {
    console.error(`[IMAP Poller] Error polling ${folder}: ${err.message}`);
    return 0;
  }
  
  console.log(`[IMAP Poller] Found ${messages.length} messages in ${folder}`);
  let created = 0;

  for (const msg of messages) {
    try {
      const existingCard = await prisma.card.findUnique({ where: { messageId: msg.messageId }, select: { id: true, status: true } });
      if (existingCard) {
        // Update read status if changed
        const newStatus = msg.isRead ? 'read' : 'unread';
        if (existingCard.status !== newStatus) {
          await prisma.card.update({ where: { id: existingCard.id }, data: { status: newStatus } });
        }
        continue;
      }

      const board = await resolveBoard(tenantId, msg.toEmail, folder);
      if (!board) continue;

      const unreads = await prisma.column.findFirst({ where: { boardId: board.id, title: 'Unreads' } });
      if (!unreads) continue;

      // Check if reply to existing thread
      let replyCard = null;
      if (msg.inReplyTo) {
        replyCard = await prisma.card.findFirst({ where: { messageId: msg.inReplyTo, tenantId } });
      }

      if (replyCard) {
        await prisma.card.update({ where: { id: replyCard.id }, data: { highlighted: true, lastActivityAt: new Date() } });
        await prisma.activityLog.create({
          data: { type: 'email_received', content: { messageId: msg.messageId, subject: msg.subject, from: msg.fromEmail }, cardId: replyCard.id, tenantId },
        });
      } else {
        const card = await prisma.card.create({
          data: {
            subject: msg.subject, fromEmail: msg.fromEmail, fromName: msg.fromName,
            bodyText: msg.bodyText, bodyHtml: msg.bodyHtml,
            messageId: msg.messageId, inReplyTo: msg.inReplyTo || null,
            imapUid: msg.uid || null, imapFolder: folder,
            status: msg.isRead ? 'read' : 'unread',
            channel: 'email', columnId: unreads.id, tenantId, emailConfigId: emailConfigId,
            lastActivityAt: msg.receivedAt || new Date(),
          },
        });
        await prisma.activityLog.create({
          data: { type: 'email_received', content: { messageId: msg.messageId, subject: msg.subject, from: msg.fromEmail }, cardId: card.id, tenantId },
        });
        await aiProcessQueue.add('classify_email', {
          type: 'classify_email', tenantId, cardId: card.id,
          fromName: msg.fromName || '', fromEmail: msg.fromEmail, subject: msg.subject, body: msg.bodyText,
        });
        created++;
      }
    } catch (error: any) {
      console.error(`[IMAP Poller] Failed message ${msg.messageId}: ${error?.message}`);
    }
  }
  return created;
}

export async function processEmailPoll(data: { tenantId: string; emailConfigId: string }) {
  const { tenantId, emailConfigId } = data;

  const config = await prisma.emailConfig.findUnique({ where: { id: emailConfigId } });
  if (!config || !config.isActive || config.tenantId !== tenantId) return;

  const imapConfig = {
    host: config.imapHost,
    port: String(config.imapPort),
    user: config.imapUser,
    password: decrypt(config.imapPass),
  };

  console.log(`[IMAP Poller] Polling ${config.imapUser}...`);

  let totalCreated = 0;
  // Poll INBOX + all shared mailbox folders
  const folders = ['INBOX', 'Elite', 'Gold', 'Premiere', 'Nell'];
  for (const folder of folders) {
    const created = await pollFolder(imapConfig, folder, tenantId, emailConfigId);
    totalCreated += created;
  }

  console.log(`[IMAP Poller] Total: ${totalCreated} new cards created`);

  // Sync read/unread status for existing cards
  for (const folder of folders) {
    try {
      const statusMap = await emailAdapter.syncReadStatus(imapConfig, folder);
      if (statusMap.size === 0) continue;
      
      const cards = await prisma.card.findMany({
        where: { imapUid: { not: null }, imapFolder: folder },
        select: { id: true, imapUid: true, status: true },
      });
      
      let updated = 0;
      for (const card of cards) {
        if (!card.imapUid) continue;
        const isRead = statusMap.get(String(card.imapUid));
        if (isRead === undefined) continue;
        const newStatus = isRead ? 'read' : 'unread';
        if (card.status !== newStatus) {
          await prisma.card.update({ where: { id: card.id }, data: { status: newStatus } });
          updated++;
        }
      }
      if (updated > 0) console.log(`[IMAP Poller] Updated ${updated} cards status in ${folder}`);
    } catch (err: any) {
      console.error(`[IMAP Poller] Status sync error for ${folder}: ${err.message}`);
    }
  }

  await prisma.emailConfig.update({
    where: { id: config.id },
    data: { lastPolledAt: new Date() },
  });
}
