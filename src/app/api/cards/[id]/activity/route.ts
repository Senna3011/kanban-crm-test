import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/server/auth';
import prisma from '@/lib/prisma';

export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const session = await getServerSession(authOptions);
  if (!session?.user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const tenantId = (session.user as any).tenantId;
  
  const card = await prisma.card.findUnique({ where: { id: id } });
  if (!card || card.tenantId !== tenantId) {
    return NextResponse.json({ error: 'Not found' }, { status: 404 });
  }

  const logs = await prisma.activityLog.findMany({
    where: { cardId: id },
    orderBy: { createdAt: 'asc' },
  });

  return NextResponse.json(logs);
}
