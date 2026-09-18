import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/server/auth';
import prisma from '@/lib/prisma';
import { emailPollQueue } from '@/../queue';
import { processEmailPoll } from '@/../worker/imap-poller';

export const dynamic = 'force-dynamic';

export async function GET(req: NextRequest) {
  const authHeader = req.headers.get('authorization');
  const cronSecret = process.env.CRON_SECRET;
  const isVercelCron =
    req.headers.get('user-agent')?.includes('vercel-cron') ||
    (cronSecret && authHeader === `Bearer ${cronSecret}`);

  let tenantId: string | undefined;

  if (!isVercelCron) {
    const session = await getServerSession(authOptions);
    if (!session?.user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    tenantId = (session.user as any).tenantId;
  }

  const where = tenantId ? { tenantId, isActive: true } : { isActive: true };
  const configs = await prisma.emailConfig.findMany({
    where,
    select: { id: true, tenantId: true, imapUser: true },
  });

  if (configs.length === 0) {
    return NextResponse.json({ message: 'No active email configured', synced: 0 }, { status: 200 });
  }

  let totalDirectProcessed = 0;

  // 1. Process directly on-demand for instant sync response
  for (const config of configs) {
    try {
      const created = await processEmailPoll({
        tenantId: config.tenantId,
        emailConfigId: config.id,
      });
      totalDirectProcessed += typeof created === 'number' ? created : 0;
    } catch (directErr: any) {
      console.error(`[API /api/sync] Direct poll for ${config.imapUser} failed, queuing job to BullMQ:`, directErr?.message || directErr);
      // Fallback: Queue job to BullMQ
      try {
        await emailPollQueue.add('poll_inbox', {
          type: 'poll_inbox',
          tenantId: config.tenantId,
          emailConfigId: config.id,
        });
      } catch {}
    }
  }

  return NextResponse.json({
    success: true,
    mailboxes: configs.length,
    newEmails: totalDirectProcessed,
  });
}

export async function POST(req: NextRequest) {
  return GET(req);
}
