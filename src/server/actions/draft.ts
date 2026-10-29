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
    include: { card: { include: { column: true } } },
  });

  if (!draft || draft.tenantId !== tenantId) throw new Error('Not found');

  const boardId = draft.card.column?.boardId;

  // Check board-level multi-sender outreach authorization
  let allowAllOutreach = false;
  if (boardId) {
    try {
      const tenantRecord = await prisma.tenant.findUnique({
        where: { id: tenantId },
        select: { companyInfo: true },
      });
      if (tenantRecord?.companyInfo) {
        const info = JSON.parse(tenantRecord.companyInfo);
        allowAllOutreach = Boolean(info.boardSettings?.[boardId]?.allowAllOutreach);
      }
    } catch {}
  }

  // Find board-authorized email config
  let emailConfig: any = null;
  let isOutreachAccount = false;

  if (fromAddress) {
    // 1. Check board-specific email configs
    emailConfig = await prisma.emailConfig.findFirst({
      where: {
        tenantId,
        isActive: true,
        ...(boardId ? { boardId } : {}),
        OR: [{ smtpUser: fromAddress }, { imapUser: fromAddress }, { id: fromAddress }],
      },
    });

    // 2. If board allows outreach, check outreach accounts
    if (!emailConfig && allowAllOutreach) {
      emailConfig = await prisma.outreachAccountConfig.findFirst({
        where: {
          tenantId,
          isActive: true,
          OR: [{ senderEmail: fromAddress }, { smtpUser: fromAddress }, { id: fromAddress }],
        },
      });
      if (emailConfig) isOutreachAccount = true;
    }
  }

  // 3. Fallback to card's linked email config if it belongs to this board
  if (!emailConfig && draft.card.emailConfigId) {
    emailConfig = await prisma.emailConfig.findFirst({
      where: {
        id: draft.card.emailConfigId,
        tenantId,
        isActive: true,
        ...(boardId ? { boardId } : {}),
      },
    });
  }

  // 4. Fallback to board's primary email config
  if (!emailConfig && boardId) {
    emailConfig = await prisma.emailConfig.findFirst({
      where: { tenantId, isActive: true, boardId },
    });
  }

  // 5. Fallback to outreach account if board allows
  if (!emailConfig && allowAllOutreach) {
    emailConfig = await prisma.outreachAccountConfig.findFirst({
      where: { tenantId, isActive: true },
    });
    if (emailConfig) isOutreachAccount = true;
  }

  if (!emailConfig) {
    throw new Error('No authorized email mailbox configured for this board. Please check Settings.');
  }

  // Send via SMTP
  let authUser = emailConfig.smtpUser || emailConfig.senderEmail;
  if (!isOutreachAccount && emailConfig.authType === 'oauth2') {
    // For Zoho OAuth2, auth.user MUST be the primary Zoho account email,
    // while From: header can be any authorized Send-Mail-As alias.
    if (!emailConfig.name?.startsWith('Zoho (')) {
      const primaryConfig = await prisma.emailConfig.findFirst({
        where: {
          tenantId,
          authType: 'oauth2',
          name: { startsWith: 'Zoho (' },
        },
        select: { smtpUser: true },
      });
      if (primaryConfig?.smtpUser) {
        authUser = primaryConfig.smtpUser;
      }
    }
  }

  const authConfig: any = { user: authUser };
  if (!isOutreachAccount && emailConfig.authType === 'oauth2') {
    authConfig.type = 'OAuth2';
    authConfig.accessToken = await getValidZohoAccessToken(emailConfig.id);
  } else if (emailConfig.smtpPass) {
    authConfig.pass = decrypt(emailConfig.smtpPass);
  }

  const transporter = createTransport({
    host: emailConfig.smtpHost || 'smtp.zoho.com',
    port: emailConfig.smtpPort || 465,
    secure: emailConfig.smtpPort === 465,
    requireTLS: emailConfig.smtpPort === 587,
    auth: authConfig,
  });

  // Strictly enforce that the From header is an authorized address from emailConfig or outreachAccount
  const sendFrom = emailConfig.senderEmail || emailConfig.smtpUser;
  const senderDisplayName = emailConfig.senderName || (session.user as any).name || 'Support Team';
  const fromHeader = `"${senderDisplayName}" <${sendFrom}>`;

  try {
    await transporter.sendMail({
      from: fromHeader,
      to: draft.card.fromEmail,
      subject: draft.subject || '',
      text: draft.body,
      inReplyTo: draft.card.messageId || undefined,
      references: draft.card.messageId || undefined,
    });
  } catch (smtpErr: any) {
    console.error('[sendDraft] SMTP sendMail failed:', smtpErr?.message || smtpErr);
    throw new Error(`SMTP Error (${emailConfig.smtpHost}): ${smtpErr?.response || smtpErr?.message || 'Failed to send email'}`);
  }

  // Update draft status
  await prisma.draftMessage.update({
    where: { id: draftId },
    data: { status: 'sent', sentAt: new Date(), fromAddress: sendFrom },
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
