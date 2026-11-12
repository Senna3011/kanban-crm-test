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
  const isAuthorizedCron = Boolean(cronSecret && authHeader === `Bearer ${cronSecret}`);

  let tenantId: string | undefined;

  if (!isAuthorizedCron) {
    const session = await getServerSession(authOptions);
    if (!session?.user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    tenantId = (session.user as any).tenantId;
  }

  const where = tenantId ? { tenantId, isActive: true } : { isActive: true };
  const configs = await prisma.emailConfig.findMany({
    where,
    select: { id: true, tenantId: true, imapUser: true, name: true, authType: true, imapPass: true, zohoAccountId: true },
  });

  if (configs.length === 0) {
    return NextResponse.json({ message: 'No active email configured', synced: 0 }, { status: 200 });
  }

  // Filter primary mailboxes + dedicated Zoho Shared Mailboxes (skip pure Send-Mail-As aliases sharing primary zohoAccountId)
  const primaryZohoIdsByTenant = new Set(
    configs
      .filter((c) => c.zohoAccountId && (Boolean(c.imapPass) || c.name?.startsWith('Zoho (')))
      .map((c) => `${c.tenantId}:${c.zohoAccountId}`)
  );

  const primaryConfigs = configs.filter((c) => {
    if (c.authType !== 'oauth2') return true;
    if (Boolean(c.imapPass)) return true;
    if (c.name?.startsWith('Zoho (')) return true;
    if (c.zohoAccountId && !primaryZohoIdsByTenant.has(`${c.tenantId}:${c.zohoAccountId}`)) return true;
    return false;
  });
  const targets = primaryConfigs.length > 0 ? primaryConfigs : configs;

  let totalDirectProcessed = 0;

  const results = await Promise.allSettled(
    targets.map(async (config) => {
      try {
        const created = await processEmailPoll({
          tenantId: config.tenantId,
          emailConfigId: config.id,
        });
        return typeof created === 'number' ? created : 0;
      } catch (directErr: any) {
        console.error(`[API /api/sync] Direct poll for ${config.imapUser} failed, queuing job to BullMQ:`, directErr?.message || directErr);
        try {
          await emailPollQueue.add('poll_inbox', {
            type: 'poll_inbox',
            tenantId: config.tenantId,
            emailConfigId: config.id,
          });
        } catch {}
        return 0;
      }
    })
  );

  for (const res of results) {
    if (res.status === 'fulfilled') totalDirectProcessed += res.value;
  }

  try {
    const { broadcastAppEvent } = await import('@/lib/events');
    if (tenantId) {
      broadcastAppEvent({ type: 'card_updated', tenantId });
    }
  } catch {}

  return NextResponse.json({
    success: true,
    mailboxes: targets.length,
    newEmails: totalDirectProcessed,
  });
}

export async function POST(req: NextRequest) {
  return GET(req);
}
