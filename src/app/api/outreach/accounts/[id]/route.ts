import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/server/auth';
import prisma from '@/lib/prisma';

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> | { id: string } }
) {
  const session = await getServerSession(authOptions);
  if (!session?.user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const resolvedParams = await params;
  const accountId = resolvedParams.id;
  const tenantId = (session.user as any).tenantId;

  const account = await prisma.outreachAccountConfig.findFirst({
    where: { id: accountId, tenantId },
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
      apifyApiToken: true,
      reoonApiKey: true,
      createdAt: true,
      updatedAt: true,
    },
  });

  if (!account) {
    return NextResponse.json({ error: 'Outreach Account not found' }, { status: 404 });
  }

  return NextResponse.json(account);
}

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> | { id: string } }
) {
  const session = await getServerSession(authOptions);
  if (!session?.user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const resolvedParams = await params;
  const accountId = resolvedParams.id;
  const tenantId = (session.user as any).tenantId;

  const existing = await prisma.outreachAccountConfig.findFirst({
    where: { id: accountId, tenantId },
  });

  if (!existing) {
    return NextResponse.json({ error: 'Outreach Account not found' }, { status: 404 });
  }

  try {
    const body = await req.json();

    let updatedPass = body.smtpPass;
    if (updatedPass && typeof updatedPass === 'string' && updatedPass.trim() !== '') {
      try {
        const { encrypt } = await import('@/lib/encryption');
        updatedPass = encrypt(updatedPass);
      } catch {
        // Keep as-is if encryption fails
      }
    }

    const updated = await prisma.outreachAccountConfig.update({
      where: { id: accountId },
      data: {
        ...(body.name !== undefined && { name: body.name.trim() }),
        ...(body.senderName !== undefined && { senderName: body.senderName.trim() }),
        ...(body.senderEmail !== undefined && { senderEmail: body.senderEmail.trim().toLowerCase() }),
        ...(body.smtpHost !== undefined && { smtpHost: body.smtpHost.trim() }),
        ...(body.smtpPort !== undefined && { smtpPort: Number(body.smtpPort) }),
        ...(body.smtpUser !== undefined && { smtpUser: body.smtpUser.trim() }),
        ...(body.smtpPass !== undefined && body.smtpPass !== '' && { smtpPass: updatedPass }),
        ...(body.apifyApiToken !== undefined && { apifyApiToken: body.apifyApiToken?.trim() || null }),
        ...(body.reoonApiKey !== undefined && { reoonApiKey: body.reoonApiKey?.trim() || null }),
        ...(body.dailyLimit !== undefined && { dailyLimit: Number(body.dailyLimit) }),
        ...(body.isActive !== undefined && { isActive: Boolean(body.isActive) }),
      },
    });

    return NextResponse.json(updated);
  } catch (error: any) {
    console.error('[API OUTREACH ACCOUNT PATCH] Error:', error);
    return NextResponse.json({ error: error.message || 'Failed to update account' }, { status: 500 });
  }
}

export async function DELETE(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> | { id: string } }
) {
  const session = await getServerSession(authOptions);
  if (!session?.user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const resolvedParams = await params;
  const accountId = resolvedParams.id;
  const tenantId = (session.user as any).tenantId;

  try {
    const deleted = await prisma.outreachAccountConfig.deleteMany({
      where: { id: accountId, tenantId },
    });

    if (deleted.count === 0) {
      return NextResponse.json({ error: 'Outreach Account not found' }, { status: 404 });
    }

    return NextResponse.json({ success: true, message: 'Account deleted successfully' });
  } catch (error: any) {
    return NextResponse.json({ error: error.message || 'Failed to delete account' }, { status: 500 });
  }
}
