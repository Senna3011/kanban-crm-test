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

  // Move card to next column
  const currentColumn = await prisma.column.findUnique({ where: { id: draft.card.columnId } });
  if (currentColumn) {
    const nextColumn = await prisma.column.findFirst({
      where: { boardId: currentColumn.boardId, position: currentColumn.position + 1 },
      orderBy: { position: 'asc' },
    });
    if (nextColumn) {
      await prisma.card.update({
        where: { id: draft.cardId },
        data: { columnId: nextColumn.id, lastActivityAt: new Date() },
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
