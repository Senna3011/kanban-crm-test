import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/server/auth';
import prisma from '@/lib/prisma';
import nodemailer from 'nodemailer';

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> | { id: string } }
) {
  const session = await getServerSession(authOptions);
  if (!session?.user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const resolvedParams = await params;
  const campaignId = resolvedParams.id;
  const tenantId = (session.user as any).tenantId;

  const campaign = await prisma.outreachCampaign.findFirst({
    where: { id: campaignId, tenantId },
    include: { account: true },
  });

  if (!campaign) {
    return NextResponse.json({ error: 'Campaign not found' }, { status: 404 });
  }

  try {
    const body = await req.json();
    const { targetEmail, subject, content, leadId } = body;

    const recipient = targetEmail || (leadId ? (await prisma.outreachLead.findUnique({ where: { id: leadId } }))?.email : null);

    if (!recipient) {
      return NextResponse.json({ error: 'Recipient target email is required' }, { status: 400 });
    }

    // Resolve and decrypt account SMTP credentials if available
    let rawAccountPass = campaign.account?.smtpPass;
    if (rawAccountPass) {
      try {
        const { decrypt } = await import('@/lib/encryption');
        rawAccountPass = decrypt(rawAccountPass);
      } catch {
        // Keep as-is if raw plaintext
      }
    }

    // Determine SMTP sender settings from Outreach Account or fallback to CRM active email config
    let smtpHost = campaign.account?.smtpHost || process.env.SMTP_HOST;
    let smtpPort = campaign.account?.smtpPort || (process.env.SMTP_PORT ? Number(process.env.SMTP_PORT) : 465);
    let smtpUser = campaign.account?.smtpUser || process.env.SMTP_USER;
    let smtpPass = rawAccountPass || process.env.SMTP_PASS;
    let senderEmail = campaign.account?.senderEmail || smtpUser;
    let senderName = campaign.account?.senderName || 'Kanban CRM Outreach';

    if (!smtpUser || !smtpPass) {
      const activeCrmConfig = await prisma.emailConfig.findFirst({
        where: { tenantId, isActive: true },
      });
      if (activeCrmConfig && activeCrmConfig.smtpUser && activeCrmConfig.smtpPass) {
        const { decrypt } = await import('@/lib/encryption');
        smtpHost = activeCrmConfig.smtpHost;
        smtpPort = activeCrmConfig.smtpPort;
        smtpUser = activeCrmConfig.smtpUser;
        smtpPass = decrypt(activeCrmConfig.smtpPass);
        senderEmail = activeCrmConfig.smtpUser;
        senderName = activeCrmConfig.name || 'Outreach Admin';
      }
    }

    if (!smtpUser || !smtpPass) {
      return NextResponse.json({
        error: 'No active SMTP mailbox configured in Admin Settings. Please configure SMTP in Settings > Email Accounts first.',
      }, { status: 400 });
    }

    const emailSubject = subject || `[Test Outreach] Exploring opportunities with ${campaign.name}`;
    const emailBody = content || `Hello,\n\nThis is a test outreach email from ${senderName} dispatched directly to ${recipient}.\n\nCampaign: ${campaign.name}\n\nBest regards,\n${senderName}`;

    const unsubscribeUrl = `${process.env.NEXTAUTH_URL || 'http://localhost:3099'}/api/outreach/unsubscribe?email=${encodeURIComponent(recipient)}&t=${tenantId}`;
    const emailHtml = `<div style="font-family: Arial, sans-serif; font-size: 14px; line-height: 1.6; color: #1e293b;">
      ${emailBody.replace(/\n\n/g, '<br/><br/>').replace(/\n/g, '<br/>')}
      <br/><br/>
      <hr style="border: none; border-top: 1px solid #e2e8f0; margin: 20px 0;" />
      <p style="font-size: 11px; color: #64748b; margin: 0;">
        Test Outreach Message from ${senderName}. <a href="${unsubscribeUrl}" style="color: #6366f1;">Unsubscribe</a>
      </p>
    </div>`;

    const transporter = nodemailer.createTransport({
      host: smtpHost,
      port: smtpPort,
      secure: smtpPort === 465,
      auth: { user: smtpUser, pass: smtpPass },
      tls: { rejectUnauthorized: false },
    });

    const info = await transporter.sendMail({
      from: `"${senderName}" <${senderEmail}>`,
      to: recipient,
      subject: emailSubject,
      text: emailBody,
      html: emailHtml,
      headers: {
        'List-Unsubscribe': `<${unsubscribeUrl}>, <mailto:${senderEmail}?subject=Unsubscribe>`,
        'List-Unsubscribe-Post': 'List-Unsubscribe=One-Click',
        'X-Outreach-Test': 'true',
      },
    });

    return NextResponse.json({
      success: true,
      messageId: info.messageId,
      recipient,
      sender: senderEmail,
    });
  } catch (error: any) {
    console.error('[API TEST DISPATCH EMAIL ERROR]', error);
    return NextResponse.json({
      error: `SMTP Dispatch failed: ${error.message || 'Check SMTP credentials, host, or port in settings'}`,
    }, { status: 500 });
  }
}
