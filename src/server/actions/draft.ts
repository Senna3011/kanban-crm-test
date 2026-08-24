'use server';

import { getServerSession } from 'next-auth';
import { authOptions } from '@/server/auth';
import prisma from '@/lib/prisma';
import { decrypt } from '@/lib/encryption';
import { createTransport } from 'nodemailer';

export async function sendDraft(draftId: string, fromAddress?: string) {
  const session = await getServerSession(authOptions);
  if (!session?.user) throw new Error('Unauthorized');

  const tenantId = (session.user as any).tenantId;

  const draft = await prisma.draftMessage.findUnique({
    where: { id: draftId },
    include: { card: true },
  });

  if (!draft || draft.tenantId !== tenantId) throw new Error('Not found');

  // Find the right email config: prefer one matching fromAddress, else first active
  let emailConfig;
  if (fromAddress) {
    emailConfig = await prisma.emailConfig.findFirst({ where: { tenantId, smtpUser: fromAddress, isActive: true } });
  }
  if (!emailConfig) {
    emailConfig = await prisma.emailConfig.findFirst({ where: { tenantId, isActive: true } });
  }
  if (!emailConfig) throw new Error('Email not configured');

  // Send via SMTP
  const transporter = createTransport({
    host: emailConfig.smtpHost,
    port: emailConfig.smtpPort,
    secure: emailConfig.smtpPort === 465,
    auth: {
      user: emailConfig.smtpUser,
      pass: decrypt(emailConfig.smtpPass),
    },
  });

  const sendFrom = fromAddress || emailConfig.smtpUser;
  await transporter.sendMail({
    from: sendFrom,
    to: draft.card.fromEmail,
    subject: draft.subject || '',
    text: draft.body,
    inReplyTo: draft.card.messageId || undefined,
    references: draft.card.messageId || undefined,
  });

  // Update draft status
  await prisma.draftMessage.update({
    where: { id: draftId },
    data: { status: 'sent', sentAt: new Date() },
  });

  // Log activity
  await prisma.activityLog.create({
    data: {
      type: 'email_sent',
      content: { draftId, subject: draft.subject, to: draft.card.fromEmail },
      cardId: draft.cardId,
      tenantId,
    },
  });

  // Move card to next column + set nextFollowUpAt for auto-advance
  const ADVANCE_DAYS = 7;
  const currentColumn = await prisma.column.findUnique({ where: { id: draft.card.columnId } });
  if (currentColumn) {
    // Rule: If card is in "Leads" and we send first email, move to "Follow up 1"
    // Rule: If card is in "Follow up N", move to "Follow up N+1"
    let targetColumn;

    if (currentColumn.title === 'Leads') {
      // First email to a lead → move to Follow up 1
      targetColumn = await prisma.column.findFirst({
        where: { boardId: currentColumn.boardId, title: 'Follow up 1' },
      });
    } else if (currentColumn.title.startsWith('Follow up')) {
      // In Follow up column → move to next column
      targetColumn = await prisma.column.findFirst({
        where: { boardId: currentColumn.boardId, position: currentColumn.position + 1 },
        orderBy: { position: 'asc' },
      });
    }

    if (targetColumn) {
      await prisma.card.update({
        where: { id: draft.cardId },
        data: {
          columnId: targetColumn.id,
          lastActivityAt: new Date(),
          nextFollowUpAt: new Date(Date.now() + ADVANCE_DAYS * 24 * 60 * 60 * 1000),
          highlighted: false, // Reset reply status when we send a new follow-up
        },
      });
    }
  }

  return { success: true };
}

export async function editDraft(draftId: string, body: string, subject?: string) {
  const session = await getServerSession(authOptions);
  if (!session?.user) throw new Error('Unauthorized');

  const tenantId = (session.user as any).tenantId;

  await prisma.draftMessage.update({
    where: { id: draftId, tenantId },
    data: { body, subject, status: 'edited', editedAt: new Date() },
  });

  const draft = await prisma.draftMessage.findUnique({ where: { id: draftId } });

  await prisma.activityLog.create({
    data: {
      type: 'user_edited',
      content: { draftId },
      cardId: draft!.cardId,
      tenantId,
    },
  });

  return { success: true };
}
