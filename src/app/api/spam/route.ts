import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/server/auth';
import prisma from '@/lib/prisma';

export async function GET(req: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session?.user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const tenantId = (session.user as any).tenantId;
  const spamLogs = await prisma.spamLog.findMany({
    where: { tenantId },
    orderBy: { receivedAt: 'desc' },
    take: 100,
    include: { emailConfig: { select: { name: true } } },
  });

  return NextResponse.json(spamLogs);
}

export async function POST(req: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session?.user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const tenantId = (session.user as any).tenantId;
  const body = await req.json();

  if (!body.spamLogId || !body.columnId) {
    return NextResponse.json({ error: 'spamLogId and columnId required' }, { status: 400 });
  }

  const spamLog = await prisma.spamLog.findFirst({ where: { id: body.spamLogId, tenantId } });
  if (!spamLog) return NextResponse.json({ error: 'Spam log not found' }, { status: 404 });

  const column = await prisma.column.findFirst({
    where: { id: body.columnId, board: { tenantId } },
  });
  if (!column) return NextResponse.json({ error: 'Column not found' }, { status: 404 });

  const card = await prisma.card.create({
    data: {
      subject: spamLog.subject,
      fromEmail: spamLog.fromEmail,
      fromName: spamLog.fromName,
      bodyText: spamLog.bodyPreview,
      channel: 'email',
      columnId: column.id,
      tenantId,
      emailConfigId: spamLog.emailConfigId,
      lastActivityAt: new Date(),
    },
  });

  await prisma.spamLog.update({
    where: { id: spamLog.id },
    data: { recoveredToId: card.id },
  });

  await prisma.activityLog.create({
    data: {
      type: 'email_received',
      content: { subject: spamLog.subject, from: spamLog.fromEmail, recoveredFromSpam: true },
      cardId: card.id,
      tenantId,
    },
  });

  return NextResponse.json({ success: true, cardId: card.id });
}
