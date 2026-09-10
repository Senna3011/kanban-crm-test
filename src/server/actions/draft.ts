'use server';

import { getServerSession } from 'next-auth';
import { authOptions } from '@/server/auth';
import prisma from '@/lib/prisma';
import { decrypt } from '@/lib/encryption';
import { getValidZohoAccessToken } from '@/lib/zoho-oauth';
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
    auth: authConfig,
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
  let advanceDays = 7;
  try {
    const tenantRecord = await prisma.tenant.findUnique({ where: { id: tenantId }, select: { companyInfo: true } });
    if (tenantRecord?.companyInfo) {
      const info = JSON.parse(tenantRecord.companyInfo);
      if (typeof info.followUpIntervalDays === 'number' && info.followUpIntervalDays > 0) {
        advanceDays = info.followUpIntervalDays;
      }
    }
  } catch {}

  const currentColumn = await prisma.column.findUnique({ where: { id: draft.card.columnId } });
  if (currentColumn) {
    const nextStageMap: Record<string, string> = {
      'Leads': 'Follow up 1',
      'Follow up 1': 'Follow up 2',
      'Follow up 2': 'Follow up 3',
    };

    const targetTitle = nextStageMap[currentColumn.title];
    let targetColumn = null;

    if (targetTitle) {
      targetColumn = await prisma.column.findFirst({
        where: { boardId: currentColumn.boardId, title: targetTitle },
      });
    }

    if (targetColumn) {
      await prisma.card.update({
        where: { id: draft.cardId },
        data: {
          columnId: targetColumn.id,
          lastActivityAt: new Date(),
          nextFollowUpAt: new Date(Date.now() + advanceDays * 24 * 60 * 60 * 1000),
          highlighted: false, // Reset reply status when we send a new follow-up
        },
      });
    } else {
      // Just update activity timestamp and clear highlight
      await prisma.card.update({
        where: { id: draft.cardId },
        data: {
          lastActivityAt: new Date(),
          highlighted: false,
        },
      });
    }
  }

  // Trigger real-time UI refresh
  try {
    const { broadcastAppEvent } = await import('@/lib/events');
    broadcastAppEvent({ type: 'card_updated', tenantId });
  } catch {}

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
