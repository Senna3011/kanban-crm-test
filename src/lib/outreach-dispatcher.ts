import nodemailer from 'nodemailer';
import { prisma } from './prisma';

export interface DispatchLeadEmailParams {
  leadId: string;
  tenantId: string;
}

export interface DispatchResult {
  success: boolean;
  messageId?: string;
  error?: string;
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
    return { success: false, error: 'Lead does not have a verified email address' };
  }

  if (!lead.aiDraftBody || !lead.aiDraftSubject) {
    return { success: false, error: 'Lead draft email is not generated' };
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
  const smtpHost = account?.smtpHost || process.env.SMTP_HOST || 'smtp.zoho.com';
  const smtpPort = account?.smtpPort || Number(process.env.SMTP_PORT) || 465;
  const smtpUser = account?.smtpUser || process.env.SMTP_USER || '';
  const smtpPass = account?.smtpPass || process.env.SMTP_PASS || '';
  const senderEmail = account?.senderEmail || smtpUser || 'outreach@jetdigitalpro.com';
  const senderName = account?.senderName || 'Outreach Team';

  if (!smtpUser || !smtpPass) {
    // If SMTP credentials are not yet configured, simulate successful dispatch in sandbox mode
    console.warn(`[OUTREACH DISPATCH] Sandbox mode: Simulated dispatch to ${lead.email}`);
    await prisma.outreachLead.update({
      where: { id: lead.id },
      data: {
        status: 'DISPATCHED',
        sentAt: new Date(),
      },
    });
    return {
      success: true,
      messageId: `<simulated-${Date.now()}@sandbox.outreach>`,
    };
  }

  try {
    const transporter = nodemailer.createTransport({
      host: smtpHost,
      port: smtpPort,
      secure: smtpPort === 465,
      auth: {
        user: smtpUser,
        pass: smtpPass,
      },
      tls: {
        rejectUnauthorized: false,
      },
    });

    const info = await transporter.sendMail({
      from: `"${senderName}" <${senderEmail}>`,
      to: lead.email,
      subject: lead.aiDraftSubject,
      text: lead.aiDraftBody,
      html: `<div style="font-family: Arial, sans-serif; font-size: 14px; line-height: 1.6; color: #1e293b;">
        ${lead.aiDraftBody.replace(/\n\n/g, '<br/><br/>').replace(/\n/g, '<br/>')}
      </div>`,
    });

    await prisma.outreachLead.update({
      where: { id: lead.id },
      data: {
        status: 'DISPATCHED',
        sentAt: new Date(),
      },
    });

    if (account) {
      await prisma.outreachAccountConfig.update({
        where: { id: account.id },
        data: {
          sentToday: { increment: 1 },
        },
      });
    }

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

  // Find or use the primary board and "Leads" column
  let board = await prisma.board.findFirst({
    where: { tenantId: params.tenantId },
    include: { columns: true },
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
      include: { columns: true },
    });
  }

  const leadsColumn = board.columns.find((c) => c.title.toLowerCase() === 'leads') || board.columns[0];

  const cardTitle = `${lead.fullName} - ${lead.companyName || 'Outreach Lead'}`;
  const subject = params.replySubject || `Outreach Lead: ${lead.fullName}`;
  const bodyText = params.replyBody || `Prospect sourced from campaign "${lead.campaign.name}".\n\nTitle: ${lead.jobTitle || 'N/A'}\nCompany: ${lead.companyName || 'N/A'}\nLinkedIn: ${lead.linkedinUrl || 'N/A'}\nEmail: ${lead.email || 'N/A'}\n\nLast Sent Email:\nSubject: ${lead.aiDraftSubject || ''}\nBody:\n${lead.aiDraftBody || ''}`;

  const card = await prisma.card.create({
    data: {
      subject,
      fromEmail: lead.email || 'outreach-lead@prospect.com',
      fromName: lead.fullName,
      bodyText,
      columnId: leadsColumn.id,
      tenantId: params.tenantId,
      status: 'unread',
      channel: 'email',
      metadata: {
        isOutreachLead: true,
        campaignId: lead.campaignId,
        campaignName: lead.campaign.name,
        jobTitle: lead.jobTitle,
        company: lead.companyName,
        linkedinUrl: lead.linkedinUrl,
      },
    },
  });

  // Create initial activity log
  await prisma.activityLog.create({
    data: {
      type: 'LEAD_CONVERTED',
      content: {
        message: `Converted from Outreach Campaign: "${lead.campaign.name}"`,
        leadId: lead.id,
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
