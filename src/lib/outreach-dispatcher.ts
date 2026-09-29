import nodemailer, { Transporter } from 'nodemailer';
import { prisma } from './prisma';

export async function waitWithJitter(baseMs = 3000, jitterMs = 6000): Promise<void> {
  const delay = baseMs + Math.floor(Math.random() * jitterMs);
  await new Promise((resolve) => setTimeout(resolve, delay));
}

export interface DispatchLeadEmailParams {
  leadId: string;
  tenantId: string;
}

export interface DispatchResult {
  success: boolean;
  messageId?: string;
  error?: string;
}

const transporterPool = new Map<string, Transporter>();

function getPooledTransporter(
  host: string,
  port: number,
  user: string,
  pass: string
): Transporter {
  const key = `${host}:${port}:${user}`;
  let transporter = transporterPool.get(key);
  if (!transporter) {
    transporter = nodemailer.createTransport({
      host,
      port,
      secure: port === 465,
      pool: true,
      maxConnections: 5,
      maxMessages: 100,
      auth: {
        user,
        pass,
      },
      tls: {
        rejectUnauthorized: process.env.NODE_ENV === 'production',
        minVersion: 'TLSv1.2',
      },
    });
    transporterPool.set(key, transporter);
  }
  return transporter;
}

export async function dispatchColdEmail(params: DispatchLeadEmailParams): Promise<DispatchResult> {
  const lead = await prisma.outreachLead.findUnique({
    where: { id: params.leadId },
    include: {
      campaign: {
        include: {
          account: true,
        },
      },
    },
  });

  if (!lead) {
    return { success: false, error: 'Lead not found' };
  }

  if (!lead.email) {
    return { success: false, error: 'Lead does not have a valid email address' };
  }

  if (!lead.aiDraftBody || !lead.aiDraftSubject) {
    return { success: false, error: 'Lead draft email is not generated yet' };
  }

  // Check suppression list
  const suppressed = await prisma.outreachSuppression.findUnique({
    where: {
      tenantId_email: {
        tenantId: params.tenantId,
        email: lead.email.toLowerCase(),
      },
    },
  });

  if (suppressed) {
    await prisma.outreachLead.update({
      where: { id: lead.id },
      data: {
        status: 'FAILED',
        errorMessage: `Email address is suppressed (${suppressed.reason || 'Unsubscribed'})`,
      },
    });
    return { success: false, error: 'Email address is on the suppression list' };
  }

  const account = lead.campaign.account;

  // Daily rate limit enforcement with atomic conditional update
  if (account) {
    const isSameDay = new Date(account.lastResetDate).toDateString() === new Date().toDateString();

    if (!isSameDay) {
      await prisma.outreachAccountConfig.updateMany({
        where: {
          id: account.id,
          lastResetDate: { lt: new Date(new Date().setHours(0, 0, 0, 0)) },
        },
        data: { sentToday: 0, lastResetDate: new Date() },
      });
    }

    const atomicUpdate = await prisma.outreachAccountConfig.updateMany({
      where: {
        id: account.id,
        sentToday: { lt: account.dailyLimit },
      },
      data: {
        sentToday: { increment: 1 },
      },
    });

    if (atomicUpdate.count === 0) {
      await prisma.outreachLead.update({
        where: { id: lead.id },
        data: {
          status: 'FAILED',
          errorMessage: `Daily mailbox sending limit reached (${account.dailyLimit}/day)`,
        },
      });
      return { success: false, error: `Daily limit of ${account.dailyLimit} emails reached for this sender` };
    }
  }

  // Resolve and decrypt account SMTP credentials if configured
  let rawAccountPass = account?.smtpPass;
  if (rawAccountPass) {
    try {
      const { decrypt } = await import('./encryption');
      rawAccountPass = decrypt(rawAccountPass);
    } catch {
      // Kept as-is if already plaintext
    }
  }

  // Check fallback to active Tenant EmailConfig if OutreachAccountConfig is not explicitly configured
  let smtpHost = account?.smtpHost || process.env.SMTP_HOST;
  let smtpPort = account?.smtpPort || (process.env.SMTP_PORT ? Number(process.env.SMTP_PORT) : 465);
  let smtpUser = account?.smtpUser || process.env.SMTP_USER;
  let smtpPass = rawAccountPass || process.env.SMTP_PASS;
  let senderEmail = account?.senderEmail || smtpUser;
  let senderName = account?.senderName || 'Outreach Team';

  if (!smtpUser || !smtpPass) {
    try {
      const activeCrmConfig = await prisma.emailConfig.findFirst({
        where: { tenantId: params.tenantId, isActive: true },
      });
      if (activeCrmConfig && activeCrmConfig.smtpUser && activeCrmConfig.smtpPass) {
        const { decrypt } = await import('./encryption');
        smtpHost = activeCrmConfig.smtpHost;
        smtpPort = activeCrmConfig.smtpPort;
        smtpUser = activeCrmConfig.smtpUser;
        smtpPass = decrypt(activeCrmConfig.smtpPass);
        senderEmail = activeCrmConfig.smtpUser;
        senderName = activeCrmConfig.name || 'Outreach Team';
      }
    } catch (e) {
      console.warn('[OUTREACH DISPATCH] Could not fallback to active CRM EmailConfig:', e);
    }
  }

  if (!smtpUser || !smtpPass) {
    const errorMsg = 'Tidak ada mailbox SMTP aktif untuk pengiriman. Atur di Outreach Account Settings.';
    await prisma.outreachLead.update({
      where: { id: lead.id },
      data: {
        status: 'FAILED',
        errorMessage: errorMsg,
      },
    });
    return {
      success: false,
      error: errorMsg,
    };
  }

  // Compliant footer with unsubscribe option
  const unsubscribeUrl = `${process.env.NEXTAUTH_URL || 'http://localhost:3099'}/api/outreach/unsubscribe?email=${encodeURIComponent(lead.email)}&t=${params.tenantId}`;
  const emailBodyText = `${lead.aiDraftBody}\n\n---\nIf you prefer not to receive future messages, unsubscribe here: ${unsubscribeUrl}`;
  const emailBodyHtml = `<div style="font-family: Arial, sans-serif; font-size: 14px; line-height: 1.6; color: #1e293b;">
    ${lead.aiDraftBody.replace(/\n\n/g, '<br/><br/>').replace(/\n/g, '<br/>')}
    <br/><br/>
    <hr style="border: none; border-top: 1px solid #e2e8f0; margin: 20px 0;" />
    <p style="font-size: 11px; color: #64748b; margin: 0;">
      You received this message from ${senderName}. If you would like to stop receiving these emails, please <a href="${unsubscribeUrl}" style="color: #6366f1; text-decoration: underline;">unsubscribe here</a>.
    </p>
  </div>`;

  try {
    const transporter = getPooledTransporter(
      smtpHost || 'smtp.zoho.com',
      Number(smtpPort) || 465,
      smtpUser,
      smtpPass
    );

    const info = await transporter.sendMail({
      from: `"${senderName}" <${senderEmail}>`,
      to: lead.email,
      subject: lead.aiDraftSubject,
      text: emailBodyText,
      html: emailBodyHtml,
      headers: {
        'List-Unsubscribe': `<${unsubscribeUrl}>, <mailto:${senderEmail}?subject=Unsubscribe%20${encodeURIComponent(lead.email)}>`,
        'List-Unsubscribe-Post': 'List-Unsubscribe=One-Click',
        'X-Outreach-Campaign-Id': lead.campaignId,
        'X-Outreach-Lead-Id': lead.id,
      },
    });

    await prisma.outreachLead.update({
      where: { id: lead.id },
      data: {
        status: 'DISPATCHED',
        sentAt: new Date(),
        errorMessage: null,
      },
    });

    return {
      success: true,
      messageId: info.messageId,
    };
  } catch (error: any) {
    console.error(`[OUTREACH DISPATCH] Failed to send email to ${lead.email}:`, error);
    await prisma.outreachLead.update({
      where: { id: lead.id },
      data: {
        status: 'FAILED',
        errorMessage: error.message || 'SMTP transmission error',
      },
    });

    return {
      success: false,
      error: error.message || 'Transmission failed',
    };
  }
}

export async function convertOutreachLeadToKanbanCard(params: {
  leadId: string;
  tenantId: string;
  boardId?: string;
  columnId?: string;
  replySubject?: string;
  replyBody?: string;
}): Promise<{ cardId: string }> {
  const lead = await prisma.outreachLead.findUnique({
    where: { id: params.leadId },
    include: {
      campaign: true,
    },
  });

  if (!lead) {
    throw new Error('Outreach lead not found');
  }

  // Idempotency guard: Return existing card if already converted
  if (lead.status === 'CONVERTED' && lead.convertedCardId) {
    const existingCard = await prisma.card.findUnique({
      where: { id: lead.convertedCardId },
    });
    if (existingCard) {
      return { cardId: existingCard.id };
    }
  }

  // Find target column based on custom boardId/columnId or default board
  let targetColumn;

  if (params.columnId) {
    targetColumn = await prisma.column.findFirst({
      where: { id: params.columnId, board: { tenantId: params.tenantId } },
    });
  }

  if (!targetColumn && params.boardId) {
    const targetBoard = await prisma.board.findFirst({
      where: { id: params.boardId, tenantId: params.tenantId },
      include: { columns: { orderBy: { position: 'asc' } } },
    });
    if (targetBoard && targetBoard.columns.length > 0) {
      targetColumn = targetBoard.columns.find((c) => c.title.toLowerCase() === 'leads') || targetBoard.columns[0];
    }
  }

  if (!targetColumn) {
    // Find or create primary board
    let board = await prisma.board.findFirst({
      where: { tenantId: params.tenantId },
      include: { columns: { orderBy: { position: 'asc' } } },
    });

    if (!board) {
      board = await prisma.board.create({
        data: {
          title: 'Main Sales Board',
          tenantId: params.tenantId,
          columns: {
            create: [
              { title: 'Leads', position: 0, color: '#3b82f6', isSystem: true },
              { title: 'In Progress', position: 1, color: '#f59e0b', isSystem: false },
              { title: 'Resolved', position: 2, color: '#10b981', isSystem: false },
            ],
          },
        },
        include: { columns: { orderBy: { position: 'asc' } } },
      });
    }

    targetColumn = board.columns.find((c) => c.title.toLowerCase() === 'leads') || board.columns[0];
  }

  // Find an active email config to attach if available
  const activeEmailConfig = await prisma.emailConfig.findFirst({
    where: { tenantId: params.tenantId, isActive: true },
  });

  const subject = params.replySubject || `Outreach Lead: ${lead.fullName} (${lead.companyName || 'Enterprise'})`;
  const bodyText = params.replyBody || `Prospect sourced from campaign "${lead.campaign.name}".\n\nTitle: ${lead.jobTitle || 'N/A'}\nCompany: ${lead.companyName || 'N/A'}\nLinkedIn: ${lead.linkedinUrl || 'N/A'}\nEmail: ${lead.email || 'N/A'}\nLocation: ${lead.location || 'N/A'}\n\nAI Cold Email Pitch:\nSubject: ${lead.aiDraftSubject || ''}\n\n${lead.aiDraftBody || ''}`;

  const card = await prisma.card.create({
    data: {
      subject,
      fromEmail: lead.email || 'outreach-lead@prospect.com',
      fromName: lead.fullName,
      bodyText,
      columnId: targetColumn.id,
      tenantId: params.tenantId,
      emailConfigId: activeEmailConfig?.id || null,
      status: 'unread',
      channel: 'email',
      metadata: {
        isOutreachLead: true,
        campaignId: lead.campaignId,
        campaignName: lead.campaign.name,
        jobTitle: lead.jobTitle,
        company: lead.companyName,
        linkedinUrl: lead.linkedinUrl,
        location: lead.location,
        aiDraftSubject: lead.aiDraftSubject,
        aiDraftBody: lead.aiDraftBody,
      },
    },
  });

  // If lead had an AI draft, create a pending draft message for this card
  if (lead.aiDraftBody) {
    await prisma.draftMessage.create({
      data: {
        subject: lead.aiDraftSubject || `Hello ${lead.fullName}`,
        body: lead.aiDraftBody,
        status: 'pending',
        cardId: card.id,
        tenantId: params.tenantId,
      },
    });
  }

  // Create initial activity log
  await prisma.activityLog.create({
    data: {
      type: 'LEAD_CONVERTED',
      content: {
        message: `Imported from Outreach Campaign: "${lead.campaign.name}" to column "${targetColumn.title}"`,
        campaignName: lead.campaign.name,
        columnTitle: targetColumn.title,
        leadId: lead.id,
        columnId: targetColumn.id,
        convertedAt: new Date(),
      },
      cardId: card.id,
      tenantId: params.tenantId,
    },
  });

  // Update lead status to CONVERTED
  await prisma.outreachLead.update({
    where: { id: lead.id },
    data: {
      status: 'CONVERTED',
      convertedCardId: card.id,
    },
  });

  return { cardId: card.id };
}
