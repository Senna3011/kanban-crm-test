import prisma from '../src/lib/prisma';
import { emailPollQueue, autoAdvanceQueue } from '../queue';

const POLL_INTERVAL_MS = 30 * 60 * 1000; // 30 minutes
const ADVANCE_CHECK_INTERVAL_MS = 60 * 60 * 1000; // 1 hour

export function startSchedulers() {
  // Poll all tenants' inboxes every 30 minutes
  async function pollAllTenants() {
    console.log('[Scheduler] Starting email poll for all tenants...');
    try {
      const configs = await prisma.emailConfig.findMany({
        where: { isActive: true },
        select: { tenantId: true },
      });

      for (const config of configs) {
        await emailPollQueue.add('poll_inbox', {
          type: 'poll_inbox',
          tenantId: config.tenantId,
        });
      }

      console.log(`[Scheduler] Queued ${configs.length} poll jobs`);
    } catch (err) {
      console.error('[Scheduler] Error polling tenants:', err);
    }
  }

  // Check auto-advance every hour
  async function checkAutoAdvance() {
    console.log('[Scheduler] Checking auto-advance...');
    try {
      const staleCards = await prisma.card.findMany({
        where: {
          highlighted: false,
          nextFollowUpAt: { lte: new Date() },
          column: {
            title: { startsWith: 'Follow up' },
          },
        },
        select: { id: true, tenantId: true },
      });

      for (const card of staleCards) {
        await autoAdvanceQueue.add('advance_card', {
          type: 'advance_card',
          tenantId: card.tenantId,
          cardId: card.id,
        });
      }
    } catch (err) {
      console.error('[Scheduler] Error checking auto-advance:', err);
    }
  }

  // Run immediately on startup
  pollAllTenants();
  
  // Then schedule
  setInterval(pollAllTenants, POLL_INTERVAL_MS);
  setInterval(checkAutoAdvance, ADVANCE_CHECK_INTERVAL_MS);

  console.log('[Scheduler] Cron jobs registered');
  console.log(`[Scheduler] Email poll every ${POLL_INTERVAL_MS / 60000} minutes`);
  console.log(`[Scheduler] Auto-advance check every ${ADVANCE_CHECK_INTERVAL_MS / 60000} minutes`);
}
