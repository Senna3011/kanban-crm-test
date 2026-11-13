'use server';

import { getServerSession } from 'next-auth';
import { authOptions } from '@/server/auth';
import prisma from '@/lib/prisma';
import { decrypt } from '@/lib/encryption';
import { getValidZohoAccessToken } from '@/lib/zoho-oauth';
import { createTransport } from 'nodemailer';

function sanitizeErrorMessage(err: any): string {
  const raw = err?.response || err?.message || 'Failed to send email';
  return String(raw)
    .replace(/[a-zA-Z]:\\[^\s:;,]+/g, '')
    .replace(/\/[a-zA-Z0-9_.-]+(?:\/[a-zA-Z0-9_.-]+)+/g, '')
    .replace(/\s+/g, ' ')
    .trim() || 'Failed to send email. Please check connection or mailbox credentials.';
}

export async function sendDraft(
  draftId: string,
  fromAddress?: string
): Promise<{ success: boolean; error?: string }> {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user) {
      return { success: false, error: 'Your session has expired. Please sign in again.' };
    }

    const tenantId = (session.user as any).tenantId;

    const draft = await prisma.draftMessage.findUnique({
      where: { id: draftId },
      include: { card: { include: { column: true } } },
    });

    if (!draft || draft.tenantId !== tenantId) {
      return { success: false, error: 'Draft email not found.' };
    }

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

    // 3. Fallback to card's linked email config
    if (!emailConfig && draft.card.emailConfigId) {
      emailConfig = await prisma.emailConfig.findFirst({
        where: {
          id: draft.card.emailConfigId,
          tenantId,
          isActive: true,
        },
      });
    }

    // 4. Fallback to board's primary email config
    if (!emailConfig && boardId) {
      emailConfig = await prisma.emailConfig.findFirst({
        where: { tenantId, isActive: true, boardId },
      });
    }

    // 5. Fallback to any active emailConfig on tenant
    if (!emailConfig) {
      emailConfig = await prisma.emailConfig.findFirst({
        where: { tenantId, isActive: true },
      });
    }

    // 6. Fallback to outreach account if board allows
    if (!emailConfig && allowAllOutreach) {
      emailConfig = await prisma.outreachAccountConfig.findFirst({
        where: { tenantId, isActive: true },
      });
      if (emailConfig) isOutreachAccount = true;
    }

    if (!emailConfig) {
      return {
        success: false,
        error: 'No active email mailbox configured for this board. Please check Settings.',
      };
    }

    // Send via SMTP
    let authUser = emailConfig.smtpUser || emailConfig.senderEmail;
    if (!isOutreachAccount && emailConfig.authType === 'oauth2') {
      // For Zoho OAuth2, auth.user MUST be the primary Zoho account email
      const primaryConfig = await prisma.emailConfig.findFirst({
        where: {
          tenantId,
          authType: 'oauth2',
          OR: [
            { name: { startsWith: 'Zoho (' } },
            { refreshToken: { not: null } },
          ],
        },
        select: { smtpUser: true },
      });
      if (primaryConfig?.smtpUser) {
        authUser = primaryConfig.smtpUser;
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
      connectionTimeout: 10000,
      greetingTimeout: 10000,
      socketTimeout: 15000,
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
      console.error('[sendDraft] SMTP sendMail failed:', smtpErr);
      const host = emailConfig.smtpHost || 'SMTP';
      return {
        success: false,
        error: `Gagal mengirim email (${host}): ${sanitizeErrorMessage(smtpErr)}`,
      };
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
      const colTitleLower = currentColumn.title.toLowerCase().trim();
      let targetColumnTitle = '';
      let nextStep = 1;

      if (colTitleLower === 'fresh leads' || colTitleLower === 'leads' || colTitleLower === 'general' || colTitleLower === 'incoming') {
        targetColumnTitle = 'Follow up 1';
        nextStep = 1;
      } else if (colTitleLower === 'follow up 1' || colTitleLower === 'contacted') {
        targetColumnTitle = 'Follow up 2';
        nextStep = 2;
      } else if (colTitleLower === 'follow up 2') {
        targetColumnTitle = 'Follow up 3';
        nextStep = 3;
      }

      let targetColumn = null;
      if (targetColumnTitle) {
        const boardCols = await prisma.column.findMany({ where: { boardId: currentColumn.boardId } });
        targetColumn = boardCols.find((c) => c.title.toLowerCase().trim() === targetColumnTitle.toLowerCase().trim());
      }

      if (targetColumn) {
        const metadata = (typeof draft.card.metadata === 'object' && draft.card.metadata !== null) ? { ...(draft.card.metadata as any) } : {};
        const sequenceDrafts = Array.isArray(metadata.sequenceDrafts) ? metadata.sequenceDrafts : [];
        const nextDraftData = sequenceDrafts.find((s: any) => s.step === nextStep);

        metadata.currentSequenceStep = nextStep;
        await prisma.card.update({
          where: { id: draft.cardId },
          data: {
            columnId: targetColumn.id,
            lastActivityAt: new Date(),
            nextFollowUpAt: new Date(Date.now() + advanceDays * 24 * 60 * 60 * 1000),
            highlighted: false,
            metadata,
          },
        });

        // Auto-create next stage pending draft if found and no pending draft exists
        if (nextDraftData) {
          const existingPending = await prisma.draftMessage.findFirst({
            where: { cardId: draft.cardId, status: 'pending' },
          });
          if (!existingPending) {
            await prisma.draftMessage.create({
              data: {
                subject: nextDraftData.subject || `Follow-up #${nextStep}`,
                body: nextDraftData.body,
                status: 'pending',
                cardId: draft.cardId,
                tenantId,
              },
            });
          }
        }
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
  } catch (err: any) {
    console.error('[sendDraft] Unexpected error:', err);
    return {
      success: false,
      error: sanitizeErrorMessage(err),
    };
  }
}

export async function editDraft(draftId: string, body: string, subject?: string) {
  const session = await getServerSession(authOptions);
  if (!session?.user) throw new Error('Unauthorized');

  const tenantId = (session.user as any).tenantId;

  await prisma.draftMessage.update({
    where: { id: draftId, tenantId },
    data: { body, subject, status: 'edited', editedAt: new Date() },
  });

  return { success: true };
}
