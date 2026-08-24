import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/server/auth';
import prisma from '@/lib/prisma';

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const session = await getServerSession(authOptions);
  if (!session?.user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const tenantId = (session.user as any).tenantId;
  const body = await req.json();

  // Verify card belongs to this tenant
  const card = await prisma.card.findUnique({ where: { id } });
  if (!card || card.tenantId !== tenantId) {
    return NextResponse.json({ error: 'Not found' }, { status: 404 });
  }

  // Create draft
  const draft = await prisma.draftMessage.create({
    data: {
      body: body.body || '',
      subject: body.subject || card.subject,
      status: 'pending',
      cardId: id,
      tenantId,
    },
  });

  // Log activity
  await prisma.activityLog.create({
    data: {
      type: 'draft_created',
      content: { draftId: draft.id },
      cardId: id,
      tenantId,
    },
  });

  return NextResponse.json(draft);
}
