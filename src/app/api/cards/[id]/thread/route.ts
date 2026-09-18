import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/server/auth';
import prisma from '@/lib/prisma';
import { sanitizeEmailBody } from '@/lib/email-cleaner';

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const session = await getServerSession(authOptions);
  if (!session?.user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const tenantId = (session.user as any).tenantId;

  // Get the current card
  const card = await prisma.card.findUnique({ where: { id } });
  if (!card || card.tenantId !== tenantId) {
    return NextResponse.json({ error: 'Not found' }, { status: 404 });
  }

  // Find all cards in the same thread using RFC Message-ID chain (fast 2-round resolution)
  const threadMessageIds = new Set<string>();
  const threadCardIds = new Set<string>();

  if (card.messageId) threadMessageIds.add(card.messageId);
  if (card.inReplyTo) threadMessageIds.add(card.inReplyTo);
  threadCardIds.add(card.id);

  // Bounded 2-round thread lookup to prevent unbounded recursive loops
  for (let round = 0; round < 2; round++) {
    if (threadMessageIds.size === 0) break;
    const related = await prisma.card.findMany({
      where: {
        tenantId,
        status: { not: 'deleted' },
        OR: [
          { messageId: { in: [...threadMessageIds] } },
          { inReplyTo: { in: [...threadMessageIds] } },
        ],
      },
      select: { id: true, messageId: true, inReplyTo: true },
      take: 50,
    });

    let addedNew = false;
    for (const r of related) {
      if (r.messageId && !threadMessageIds.has(r.messageId)) {
        threadMessageIds.add(r.messageId);
        addedNew = true;
      }
      if (r.inReplyTo && !threadMessageIds.has(r.inReplyTo)) {
        threadMessageIds.add(r.inReplyTo);
        addedNew = true;
      }
      if (!threadCardIds.has(r.id)) {
        threadCardIds.add(r.id);
        addedNew = true;
      }
    }
    if (!addedNew) break;
  }

  // Fetch all received emails in thread
  const receivedEmails = await prisma.card.findMany({
    where: {
      tenantId,
      OR: [
        { messageId: { in: [...threadMessageIds] } },
        { inReplyTo: { in: [...threadMessageIds] } },
      ],
    },
    select: {
      id: true,
      subject: true,
      fromEmail: true,
      fromName: true,
      bodyText: true,
      lastActivityAt: true,
    },
  });

  // Fetch sent + pending drafts for these cards
  const sentEmails = await prisma.draftMessage.findMany({
    where: {
      tenantId,
      cardId: { in: [...threadCardIds] },
    },
    select: {
      id: true,
      subject: true,
      body: true,
      sentAt: true,
      editedAt: true,
      fromAddress: true,
      status: true,
      cardId: true,
    },
  });

  // Combine: current card (always included) + other thread cards + sent emails
  // Most recent first (Trello-style)
  const allMessages = [
    // Current card — always first (this email)
    {
      id: card.id,
      type: 'received' as const,
      subject: card.subject,
      from: card.fromName || card.fromEmail,
      body: sanitizeEmailBody(card.bodyText, card.bodyHtml),
      timestamp: card.lastActivityAt,
      isCurrent: true,
    },
    // Other received emails in thread (excluding current)
    ...receivedEmails.filter(e => e.id !== card.id).map(e => ({
      id: e.id,
      type: 'received' as const,
      subject: e.subject,
      from: e.fromName || e.fromEmail,
      body: sanitizeEmailBody(e.bodyText),
      timestamp: e.lastActivityAt,
    })),
    // Sent emails (all drafts, not just 'sent' — show pending too)
    ...sentEmails.map(s => ({
      id: s.id,
      type: 'sent' as const,
      subject: s.subject || '',
      from: s.fromAddress || session.user?.name || 'Support Team',
      body: sanitizeEmailBody(s.body),
      timestamp: s.sentAt || new Date(),
    })),
  ].sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime());

  return NextResponse.json(allMessages);
}
