'use server';

import { getServerSession } from 'next-auth';
import { authOptions } from '@/server/auth';
import prisma from '@/lib/prisma';
import { decrypt } from '@/lib/encryption';
import { getValidZohoAccessToken } from '@/lib/zoho-oauth';
import { createTransport } from 'nodemailer';
import { broadcastAppEvent } from '@/lib/events';

function sanitizeErrorMessage(err: any): string {
  const raw = err?.response || err?.message || 'Gagal mengirim email';
  return String(raw)
    // Strip Windows and POSIX absolute file paths
    .replace(/[a-zA-Z]:\\[^\s:;,]+/g, '')
    .replace(/\/[a-zA-Z0-9_.-]+(?:\/[a-zA-Z0-9_.-]+)+/g, '')
    .replace(/\s+/g, ' ')
    .trim() || 'Gagal mengirim email. Silakan periksa koneksi atau kredensial akun email.';
}

export async function composeAndSendEmail(data: {
  boardId: string;
  fromAddress: string;
  toEmail: string;
  subject: string;
  body: string;
}): Promise<{ success: boolean; cardId?: string; error?: string }> {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user) {
      return { success: false, error: 'Sesi Anda telah berakhir. Silakan login kembali.' };
    }

    const tenantId = (session.user as any).tenantId;
    const toEmail = data.toEmail?.trim().toLowerCase();
    const subject = data.subject?.trim() || '(No Subject)';
    const body = data.body?.trim();
    const fromAddress = data.fromAddress?.trim();

    if (!toEmail || !toEmail.includes('@')) {
      return { success: false, error: 'Mohon masukkan alamat email penerima yang valid.' };
    }

    if (!body) {
      return { success: false, error: 'Isi pesan email tidak boleh kosong.' };
    }

    // Find board
    const board = await prisma.board.findFirst({
      where: { id: data.boardId, tenantId },
      include: { columns: { orderBy: { position: 'asc' } } },
    });

    if (!board) {
      return { success: false, error: 'Papan Kanban tidak ditemukan.' };
    }

    // Find target column (prefer "Leads" or first column)
    const targetCol = board.columns.find((c) => c.title === 'Leads') || board.columns[0];
    if (!targetCol) {
      return { success: false, error: 'Tidak ada kolom yang tersedia pada board ini.' };
    }

    // 1. Verify board authorization for fromAddress
    let allowAllOutreach = false;
    try {
      const tenantRecord = await prisma.tenant.findUnique({
        where: { id: tenantId },
        select: { companyInfo: true },
      });
      if (tenantRecord?.companyInfo) {
        const info = JSON.parse(tenantRecord.companyInfo);
        allowAllOutreach = Boolean(info.boardSettings?.[board.id]?.allowAllOutreach);
      }
    } catch {}

    // Find board-authorized EmailConfig matching fromAddress
    let emailConfig = await prisma.emailConfig.findFirst({
      where: {
        tenantId,
        isActive: true,
        boardId: board.id,
        OR: [{ smtpUser: fromAddress }, { imapUser: fromAddress }, { id: fromAddress }],
      },
    });

    // If not found in board-specific configs, check if outreach account is authorized
    let outreachAccount = null;
    if (!emailConfig && allowAllOutreach && fromAddress) {
      outreachAccount = await prisma.outreachAccountConfig.findFirst({
        where: {
          tenantId,
          isActive: true,
          senderEmail: { equals: fromAddress, mode: 'insensitive' },
        },
      });
    }

    // Fallback: if no fromAddress was passed, take the board's primary linked email config
    if (!emailConfig && !outreachAccount && !fromAddress) {
      emailConfig = await prisma.emailConfig.findFirst({
        where: { tenantId, isActive: true, boardId: board.id },
      });
    }

    // Fallback: if emailConfig wasn't linked to boardId explicitly, search across tenant
    if (!emailConfig && !outreachAccount && fromAddress) {
      emailConfig = await prisma.emailConfig.findFirst({
        where: {
          tenantId,
          isActive: true,
          OR: [{ smtpUser: fromAddress }, { imapUser: fromAddress }, { id: fromAddress }],
        },
      });
    }

    if (!emailConfig && !outreachAccount) {
      return {
        success: false,
        error: `Pengirim "${fromAddress || 'Default'}" belum diotorisasi untuk board "${board.title}". Silakan hubungkan email di Settings.`,
      };
    }

    let transporter;
    let sendFrom = fromAddress;
    let senderDisplayName = (session.user as any).name || 'Sales Team';

    if (emailConfig) {
      sendFrom = fromAddress || emailConfig.smtpUser;
      senderDisplayName = (session.user as any).name || emailConfig.name || 'Sales Team';

      let authUser = emailConfig.smtpUser;
      if (emailConfig.authType === 'oauth2') {
        // Zoho XOAUTH2 MUST authenticate with primary Zoho account email
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
      if (emailConfig.authType === 'oauth2') {
        authConfig.type = 'OAuth2';
        authConfig.accessToken = await getValidZohoAccessToken(emailConfig.id);
      } else if (emailConfig.smtpPass) {
        authConfig.pass = decrypt(emailConfig.smtpPass);
      }

      transporter = createTransport({
        host: emailConfig.smtpHost || 'smtp.zoho.com',
        port: emailConfig.smtpPort || 465,
        secure: emailConfig.smtpPort === 465,
        requireTLS: emailConfig.smtpPort === 587,
        auth: authConfig,
        connectionTimeout: 10000,
        greetingTimeout: 10000,
        socketTimeout: 15000,
      });
    } else if (outreachAccount) {
      sendFrom = outreachAccount.senderEmail;
      senderDisplayName = outreachAccount.senderName || (session.user as any).name || 'Outreach Team';

      transporter = createTransport({
        host: outreachAccount.smtpHost || 'smtp.zoho.com',
        port: outreachAccount.smtpPort || 465,
        secure: outreachAccount.smtpPort === 465,
        requireTLS: outreachAccount.smtpPort === 587,
        auth: {
          user: outreachAccount.smtpUser,
          pass: outreachAccount.smtpPass ? decrypt(outreachAccount.smtpPass) : '',
        },
        connectionTimeout: 10000,
        greetingTimeout: 10000,
        socketTimeout: 15000,
      });
    }

    const fromHeader = `"${senderDisplayName}" <${sendFrom}>`;

    let info;
    try {
      info = await transporter!.sendMail({
        from: fromHeader,
        to: toEmail,
        subject,
        text: body,
      });
    } catch (smtpErr: any) {
      console.error('[composeAndSendEmail] SMTP error:', smtpErr);
      const host = emailConfig?.smtpHost || outreachAccount?.smtpHost || 'SMTP';
      return {
        success: false,
        error: `Gagal mengirim email (${host}): ${sanitizeErrorMessage(smtpErr)}`,
      };
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
        emailConfigId: emailConfig?.id || undefined,
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

    try {
      broadcastAppEvent({ type: 'card_updated', tenantId });
    } catch {}

    return { success: true, cardId: card.id };
  } catch (err: any) {
    console.error('[composeAndSendEmail] Unexpected error:', err);
    return {
      success: false,
      error: sanitizeErrorMessage(err),
    };
  }
}
