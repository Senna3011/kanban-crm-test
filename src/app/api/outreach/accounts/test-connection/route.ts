import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/server/auth';
import nodemailer from 'nodemailer';

export async function POST(req: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session?.user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  try {
    const body = await req.json();
    const { smtpHost, smtpPort, smtpUser, smtpPass } = body;

    if (!smtpHost || !smtpPort || !smtpUser || !smtpPass) {
      return NextResponse.json({ error: 'SMTP Host, Port, User, and Password are required' }, { status: 400 });
    }

    const transporter = nodemailer.createTransport({
      host: smtpHost.trim(),
      port: Number(smtpPort),
      secure: Number(smtpPort) === 465,
      auth: {
        user: smtpUser.trim(),
        pass: smtpPass,
      },
      tls: {
        rejectUnauthorized: false,
      },
      connectionTimeout: 8000,
      greetingTimeout: 8000,
    });

    await transporter.verify();

    return NextResponse.json({
      success: true,
      message: `SMTP connection to ${smtpHost}:${smtpPort} verified successfully!`,
    });
  } catch (error: any) {
    console.error('[API OUTREACH TEST CONNECTION ERROR]', error);
    return NextResponse.json({
      error: `SMTP connection failed: ${error.message || 'Check host, port, credentials, or firewall'}`,
    }, { status: 400 });
  }
}
