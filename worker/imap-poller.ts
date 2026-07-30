import prisma from '../src/lib/prisma';
import { decrypt } from '../src/lib/encryption';
import { EmailAdapter } from '../channels/email';
import { aiProcessQueue } from '../queue';

const emailAdapter = new EmailAdapter();

export async function processEmailPoll(data: { tenantId: string }) {
  const { tenantId } = data;

  const config = await prisma.emailConfig.findUnique({ where: { tenantId } });
  if (!config || !config.isActive) return;

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

  // Get default board and columns
  const board = await prisma.board.findUnique({ where: { tenantId } });
  if (!board) return;

  const unreadsColumn = await prisma.column.findFirst({
    where: { boardId: board.id, title: 'Unreads' },
  });
  if (!unreadsColumn) return;

  for (const msg of messages) {
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
  }

  // Update last polled time
  await prisma.emailConfig.update({
    where: { id: config.id },
    data: { lastPolledAt: new Date() },
  });
}
