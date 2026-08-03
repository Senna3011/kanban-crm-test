import { NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/server/auth';
import prisma from '@/lib/prisma';
import { emailPollQueue } from '../../../../queue';

export async function POST() {
  const session = await getServerSession(authOptions);
  if (!session?.user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const tenantId = (session.user as any).tenantId;

  // Find all active email configs for this tenant
  const configs = await prisma.emailConfig.findMany({
    where: { tenantId, isActive: true },
    select: { id: true },
  });

  if (configs.length === 0) {
    return NextResponse.json({ error: 'No email configured' }, { status: 400 });
  }

  // Queue poll jobs for all configs
  for (const config of configs) {
    await emailPollQueue.add('poll_inbox', {
      type: 'poll_inbox',
      tenantId,
      emailConfigId: config.id,
    });
  }

  return NextResponse.json({ success: true, queued: configs.length });
}
