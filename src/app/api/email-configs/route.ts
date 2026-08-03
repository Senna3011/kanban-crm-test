import { NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/server/auth';
import prisma from '@/lib/prisma';

export async function GET() {
  const session = await getServerSession(authOptions);
  if (!session?.user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const tenantId = (session.user as any).tenantId;
  const configs = await prisma.emailConfig.findMany({
    where: { tenantId, isActive: true },
    select: { id: true, name: true, smtpUser: true, imapUser: true },
  });

  return NextResponse.json(configs);
}
