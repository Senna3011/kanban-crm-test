import prisma from '../src/lib/prisma';
import { decrypt } from '../src/lib/encryption';
import { EmailAdapter } from '../channels/email';
import { aiProcessQueue } from '../queue';

const emailAdapter = new EmailAdapter();

async function resolveBoard(tenantId: string, toEmail?: string) {
  // Load email routing from tenant companyInfo
  const tenant = await prisma.tenant.findUnique({ where: { id: tenantId }, select: { companyInfo: true } });
  let routing: Record<string, string> = {};
  try {
    if (tenant?.companyInfo) {
      const info = JSON.parse(tenant.companyInfo);
      routing = info.emailRouting || {};
    }
  } catch {}

  // Route based on recipient address
  if (toEmail && routing[toEmail]) {
    const board = await prisma.board.findFirst({ where: { tenantId, title: routing[toEmail] } });
    if (board) return board;
  }

  // Fallback: first board
  return prisma.board.findFirst({ where: { tenantId } });
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
  
  let messages;
  try {
    messages = await emailAdapter.pollInbox(imapConfig);
  } catch (err: any) {
    console.error(`[IMAP Poller] Error polling ${config.imapUser}: ${err.message}`);
    return;
  }
  
  console.log(`[IMAP Poller] Found ${messages.length} new messages`);

  for (const msg of messages) {
    try {
      const alreadyProcessed = await prisma.card.findUnique({ where: { messageId: msg.messageId }, select: { id: true } });
      if (alreadyProcessed) {
        console.log(`[IMAP Poller] Skipping duplicate message ${msg.messageId}`);
        continue;
      }

      // Resolve target board based on recipient
      const board = await resolveBoard(tenantId, msg.toEmail);
      if (!board) {
        console.log(`[IMAP Poller] No board found for ${msg.toEmail}, skipping`);
        continue;
      }

      const unreadsColumn = await prisma.column.findFirst({
        where: { boardId: board.id, title: 'Unreads' },
      });
      if (!unreadsColumn) {
        console.log(`[IMAP Poller] No Unreads column in board ${board.title}`);
        continue;
      }

      // Check if it's a reply to an existing thread
      let existingCard = null;
    if (msg.inReplyTo) {
      existingCard = await prisma.card.findFirst({
        where: { messageId: msg.inReplyTo, tenantId },
      });
    }

    if (existingCard) {
      // Append to existing thread — highlight card
      await prisma.card.update({
        where: { id: existingCard.id },
        data: { highlighted: true, lastActivityAt: new Date() },
      });

      await prisma.activityLog.create({
        data: {
          type: 'email_received',
          content: { messageId: msg.messageId, subject: msg.subject, from: msg.fromEmail },
          cardId: existingCard.id,
          tenantId,
        },
      });
    } else {
      // Create new card in Unreads
      const card = await prisma.card.create({
        data: {
          subject: msg.subject,
          fromEmail: msg.fromEmail,
          fromName: msg.fromName,
          bodyText: msg.bodyText,
          bodyHtml: msg.bodyHtml,
          messageId: msg.messageId,
          inReplyTo: msg.inReplyTo || null,
          channel: 'email',
          columnId: unreadsColumn.id,
          tenantId,
          emailConfigId: config.id,
          lastActivityAt: new Date(),
        },
      });

      await prisma.activityLog.create({
        data: {
          type: 'email_received',
          content: { messageId: msg.messageId, subject: msg.subject, from: msg.fromEmail },
          cardId: card.id,
          tenantId,
        },
      });

      // Queue AI classification
      await aiProcessQueue.add('classify_email', {
        type: 'classify_email',
        tenantId,
        cardId: card.id,
        fromName: msg.fromName || '',
        fromEmail: msg.fromEmail,
        subject: msg.subject,
        body: msg.bodyText,
      });
      }
    } catch (error: any) {
      console.error(`[IMAP Poller] Failed message ${msg.messageId}: ${error?.message || 'unknown error'}`);
    }
  }

  // Update last polled time
  await prisma.emailConfig.update({
    where: { id: config.id },
    data: { lastPolledAt: new Date() },
  });
}
