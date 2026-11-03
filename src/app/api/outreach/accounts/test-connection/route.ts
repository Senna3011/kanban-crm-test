import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/server/auth';
import nodemailer from 'nodemailer';
import dns from 'dns';

const ALLOWED_SMTP_PORTS = [25, 465, 587, 2525];

function isPrivateOrInternalIp(ip: string): boolean {
  if (ip === 'localhost' || ip === '::1') return true;
  if (ip.startsWith('127.') || ip.startsWith('0.') || ip === '255.255.255.255') return true;
  if (ip.startsWith('10.') || ip.startsWith('192.168.') || ip.startsWith('169.254.')) return true;
  if (ip.startsWith('fc00:') || ip.startsWith('fe80:')) return true;
  const parts = ip.split('.').map(Number);
  if (parts.length === 4 && parts[0] === 172 && parts[1] >= 16 && parts[1] <= 31) {
    return true;
  }
  return false;
}

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

    const portNum = Number(smtpPort);
    if (!ALLOWED_SMTP_PORTS.includes(portNum)) {
      return NextResponse.json({
        error: `Invalid SMTP port: ${smtpPort}. Allowed ports are: ${ALLOWED_SMTP_PORTS.join(', ')}`,
      }, { status: 400 });
    }

    const cleanHost = smtpHost.trim();
    if (isPrivateOrInternalIp(cleanHost)) {
      return NextResponse.json({
        error: 'Disallowed destination: connecting to internal or private IP address is prohibited',
      }, { status: 400 });
    }

    try {
      const lookup = await dns.promises.lookup(cleanHost);
      if (lookup?.address && isPrivateOrInternalIp(lookup.address)) {
        return NextResponse.json({
          error: 'Disallowed destination: resolved host points to an internal or private network IP',
        }, { status: 400 });
      }
    } catch (dnsErr: any) {
      return NextResponse.json({
        error: `Could not resolve SMTP host: ${dnsErr.message || cleanHost}`,
      }, { status: 400 });
    }

    const transporter = nodemailer.createTransport({
      host: cleanHost,
      port: portNum,
      secure: portNum === 465,
      auth: {
        user: smtpUser.trim(),
        pass: smtpPass,
      },
      connectionTimeout: 8000,
      greetingTimeout: 8000,
    });

    await transporter.verify();

    return NextResponse.json({
      success: true,
      message: `SMTP connection to ${cleanHost}:${portNum} verified successfully!`,
    });
  } catch (error: any) {
    console.error('[API OUTREACH TEST CONNECTION ERROR]', error);
    return NextResponse.json({
      error: `SMTP connection failed: ${error.message || 'Check host, port, credentials, or firewall'}`,
    }, { status: 400 });
  }
}
