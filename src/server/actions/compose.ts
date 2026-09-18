'use server';

import { getServerSession } from 'next-auth';
import { authOptions } from '@/server/auth';
import prisma from '@/lib/prisma';
import { decrypt } from '@/lib/encryption';
import { getValidZohoAccessToken } from '@/lib/zoho-oauth';
import { createTransport } from 'nodemailer';
import { broadcastAppEvent } from '@/lib/events';

export async function composeAndSendEmail(data: {
  boardId: string;
  fromAddress: string;
  toEmail: string;
  subject: string;
  body: string;
}) {
  const session = await getServerSession(authOptions);
  if (!session?.user) throw new Error('Unauthorized');

  const tenantId = (session.user as any).tenantId;
  const toEmail = data.toEmail?.trim().toLowerCase();
  const subject = data.subject?.trim() || '(No Subject)';
  const body = data.body?.trim();
  const fromAddress = data.fromAddress?.trim();

  if (!toEmail || !toEmail.includes('@')) {
    throw new Error('Please provide a valid recipient email address.');
  }

  if (!body) {
    throw new Error('Message body cannot be empty.');
  }

  // Find board
  const board = await prisma.board.findFirst({
    where: { id: data.boardId, tenantId },
    include: { columns: { orderBy: { position: 'asc' } } },
  });

  if (!board) {
    throw new Error('Board not found.');
  }

  // Find target column (prefer "Leads" or first column)
  const targetCol = board.columns.find((c) => c.title === 'Leads') || board.columns[0];
  if (!targetCol) {
    throw new Error('No column available in target board.');
  }

  // Find email config matching fromAddress or first active
  let emailConfig = await prisma.emailConfig.findFirst({
    where: {
      tenantId,
      isActive: true,
      OR: [{ smtpUser: fromAddress }, { imapUser: fromAddress }, { id: fromAddress }],
    },
  });

  if (!emailConfig) {
    emailConfig = await prisma.emailConfig.findFirst({ where: { tenantId, isActive: true } });
  }

  if (!emailConfig) {
    throw new Error('No active email mailbox configured in Settings.');
  }

  // Configure SMTP Transport
  const authConfig: any = { user: emailConfig.smtpUser };
  if (emailConfig.authType === 'oauth2') {
    authConfig.type = 'OAuth2';
    authConfig.accessToken = await getValidZohoAccessToken(emailConfig.id);
  } else if (emailConfig.smtpPass) {
    authConfig.pass = decrypt(emailConfig.smtpPass);
  }

  const transporter = createTransport({
    host: emailConfig.smtpHost,
    port: emailConfig.smtpPort,
    secure: emailConfig.smtpPort === 465,
    requireTLS: emailConfig.smtpPort === 587,
    auth: authConfig,
  });

  const sendFrom = fromAddress || emailConfig.smtpUser;
  const senderDisplayName = (session.user as any).name || (session.user as any).tenantName || 'Sales Team';
  const fromHeader = `"${senderDisplayName}" <${sendFrom}>`;

  let info;
  try {
    info = await transporter.sendMail({
      from: fromHeader,
      to: toEmail,
      subject,
      text: body,
    });
  } catch (smtpErr: any) {
    console.error('[composeAndSendEmail] SMTP error:', smtpErr);
    throw new Error(`SMTP Error (${emailConfig.smtpHost}): ${smtpErr?.response || smtpErr?.message || 'Failed to send outbound email'}`);
  }

  // Create new card on Kanban board
  const card = await prisma.card.create({
    data: {
      subject,
      fromEmail: toEmail,
      fromName: toEmail.split('@')[0],
      bodyText: body,
      columnId: targetCol.id,
      tenantId,
      emailConfigId: emailConfig.id,
      messageId: info.messageId || undefined,
      status: 'read',
      highlighted: false,
      lastActivityAt: new Date(),
    },
  });

  // Record outgoing draft message
  await prisma.draftMessage.create({
    data: {
      cardId: card.id,
      tenantId,
      subject,
      body,
      status: 'sent',
      sentAt: new Date(),
      fromAddress: sendFrom,
    },
  });

  // Log activity
  await prisma.activityLog.create({
    data: {
      type: 'email_sent',
      content: { subject, to: toEmail, from: sendFrom, outboundCompose: true },
      cardId: card.id,
      tenantId,
    },
  });

  broadcastAppEvent({ type: 'card_updated', tenantId });

  return { success: true, cardId: card.id };
}
