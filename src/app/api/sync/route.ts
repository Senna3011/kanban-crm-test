import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/server/auth';
import prisma from '@/lib/prisma';
import { emailPollQueue } from '../../../../queue';

export async function GET(req: NextRequest) {
  // Support Vercel Cron or direct trigger
  const authHeader = req.headers.get('authorization');
  const cronSecret = process.env.CRON_SECRET;
  const isVercelCron = req.headers.get('user-agent')?.includes('vercel-cron') || (cronSecret && authHeader === `Bearer ${cronSecret}`);

  let tenantId: string | undefined;

  if (!isVercelCron) {
    const session = await getServerSession(authOptions);
    if (!session?.user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    tenantId = (session.user as any).tenantId;
  }

  const where = tenantId ? { tenantId, isActive: true } : { isActive: true };
  const configs = await prisma.emailConfig.findMany({
    where,
    select: { id: true, tenantId: true },
  });

  if (configs.length === 0) {
    return NextResponse.json({ message: 'No active email configured' }, { status: 200 });
  }

  for (const config of configs) {
    await emailPollQueue.add('poll_inbox', {
      type: 'poll_inbox',
      tenantId: config.tenantId,
      emailConfigId: config.id,
    });
  }

  return NextResponse.json({ success: true, queued: configs.length });
}

export async function POST(req: NextRequest) {
  return GET(req);
}
