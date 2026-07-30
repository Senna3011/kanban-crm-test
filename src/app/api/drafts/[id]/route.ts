import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/server/auth';
import prisma from '@/lib/prisma';
import { decrypt } from '@/lib/encryption';
import { createTransport } from 'nodemailer';

export async function PUT(req: NextRequest, { params }: { params: { id: string } }) {
  const session = await getServerSession(authOptions);
  if (!session?.user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const tenantId = (session.user as any).tenantId;
  const body = await req.json();

  const draft = await prisma.draftMessage.findUnique({ where: { id: params.id } });
  if (!draft || draft.tenantId !== tenantId) {
    return NextResponse.json({ error: 'Not found' }, { status: 404 });
  }

  const updated = await prisma.draftMessage.update({
    where: { id: params.id },
    data: {
      body: body.body,
      subject: body.subject,
      status: 'edited',
      editedAt: new Date(),
    },
  });

  await prisma.activityLog.create({
    data: {
      type: 'user_edited',
      content: { draftId: params.id },
      cardId: draft.cardId,
      tenantId,
    },
  });

  return NextResponse.json(updated);
}

export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  const session = await getServerSession(authOptions);
  if (!session?.user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const tenantId = (session.user as any).tenantId;

  const draft = await prisma.draftMessage.findUnique({
    where: { id: params.id },
    include: { card: true },
  });
  if (!draft || draft.tenantId !== tenantId) {
    return NextResponse.json({ error: 'Not found' }, { status: 404 });
  }

  const emailConfig = await prisma.emailConfig.findUnique({ where: { tenantId } });
  if (!emailConfig) {
    return NextResponse.json({ error: 'Email not configured' }, { status: 400 });
  }

  // Send via SMTP
  const transporter = createTransport({
    host: emailConfig.smtpHost,
    port: emailConfig.smtpPort,
    secure: emailConfig.smtpPort === 465,
    auth: { user: emailConfig.smtpUser, pass: decrypt(emailConfig.smtpPass) },
  });

  await transporter.sendMail({
    from: emailConfig.smtpUser,
    to: draft.card.fromEmail,
    subject: draft.subject || '',
    text: draft.body,
    inReplyTo: draft.card.messageId || undefined,
  });

  // Update draft
  await prisma.draftMessage.update({
    where: { id: params.id },
    data: { status: 'sent', sentAt: new Date() },
  });

  // Log activity
  await prisma.activityLog.create({
    data: {
      type: 'email_sent',
      content: { draftId: params.id, subject: draft.subject, to: draft.card.fromEmail },
      cardId: draft.cardId,
      tenantId,
    },
  });

  // Auto-advance card
  const currentColumn = await prisma.column.findUnique({ where: { id: draft.card.columnId } });
  if (currentColumn) {
    const nextColumn = await prisma.column.findFirst({
      where: { boardId: currentColumn.boardId, position: currentColumn.position + 1 },
      orderBy: { position: 'asc' },
    });
    if (nextColumn) {
      await prisma.card.update({
        where: { id: draft.cardId },
        data: { columnId: nextColumn.id, lastActivityAt: new Date() },
      });
    }
  }

  return NextResponse.json({ success: true });
}
