import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/server/auth';
import prisma from '@/lib/prisma';

export async function GET(req: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session?.user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const tenantId = (session.user as any).tenantId;

  const accounts = await prisma.outreachAccountConfig.findMany({
    where: { tenantId },
    orderBy: { createdAt: 'desc' },
    select: {
      id: true,
      name: true,
      senderName: true,
      senderEmail: true,
      smtpHost: true,
      smtpPort: true,
      smtpUser: true,
      dailyLimit: true,
      sentToday: true,
      isActive: true,
      outscraperApiKey: true,
      reoonApiKey: true,
      createdAt: true,
    },
  });

  return NextResponse.json(accounts);
}

export async function POST(req: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session?.user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const tenantId = (session.user as any).tenantId;

  try {
    const body = await req.json();
    const {
      name,
      senderName,
      senderEmail,
      smtpHost,
      smtpPort,
      smtpUser,
      smtpPass,
      outscraperApiKey,
      reoonApiKey,
      dailyLimit,
    } = body;

    if (!senderEmail || typeof senderEmail !== 'string') {
      return NextResponse.json({ error: 'Sender email is required' }, { status: 400 });
    }

    const account = await prisma.outreachAccountConfig.upsert({
      where: {
        tenantId_senderEmail: {
          tenantId,
          senderEmail: senderEmail.trim().toLowerCase(),
        },
      },
      update: {
        name: name?.trim() || 'Outreach Sender',
        senderName: senderName?.trim() || 'Outreach Team',
        smtpHost: smtpHost || 'smtp.zoho.com',
        smtpPort: Number(smtpPort) || 465,
        smtpUser: smtpUser || senderEmail,
        ...(smtpPass ? { smtpPass } : {}),
        ...(outscraperApiKey !== undefined ? { outscraperApiKey } : {}),
        ...(reoonApiKey !== undefined ? { reoonApiKey } : {}),
        dailyLimit: Number(dailyLimit) || 50,
      },
      create: {
        name: name?.trim() || 'Outreach Sender',
        senderName: senderName?.trim() || 'Outreach Team',
        senderEmail: senderEmail.trim().toLowerCase(),
        smtpHost: smtpHost || 'smtp.zoho.com',
        smtpPort: Number(smtpPort) || 465,
        smtpUser: smtpUser || senderEmail,
        smtpPass: smtpPass || null,
        outscraperApiKey: outscraperApiKey || null,
        reoonApiKey: reoonApiKey || null,
        dailyLimit: Number(dailyLimit) || 50,
        tenantId,
      },
    });

    return NextResponse.json(account, { status: 201 });
  } catch (error: any) {
    console.error('[API OUTREACH ACCOUNTS] Error:', error);
    return NextResponse.json({ error: error.message || 'Failed to save account' }, { status: 500 });
  }
}
