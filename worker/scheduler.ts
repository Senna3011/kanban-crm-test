import prisma from '../src/lib/prisma';
import { emailPollQueue, autoAdvanceQueue } from '../queue';

const POLL_INTERVAL_MS = parseInt(process.env.IMAP_POLL_INTERVAL_MS || '', 10) || 2 * 60 * 1000; // default 2 minutes
const ADVANCE_CHECK_INTERVAL_MS = 60 * 60 * 1000; // 1 hour
const WARMUP_CHECK_INTERVAL_MS = 15 * 60 * 1000; // 15 minutes

export function startSchedulers() {
  // Reset daily quotas & auto-increment warmup accounts
  async function checkDailyWarmupAndQuotaReset() {
    try {
      const today = new Date();
      today.setHours(0, 0, 0, 0);

      const accountsToReset = await prisma.outreachAccountConfig.findMany({
        where: {
          lastResetDate: { lt: today },
        },
      });

      for (const acc of accountsToReset) {
        let newLimit = acc.currentWarmupLimit;
        if (acc.warmupEnabled && acc.currentWarmupLimit < acc.targetDailyLimit) {
          newLimit = Math.min(acc.currentWarmupLimit + (acc.rampUpPerDay || 5), acc.targetDailyLimit);
          console.log(`[Scheduler] Warming up mailbox ${acc.senderEmail}: limit increased from ${acc.currentWarmupLimit} to ${newLimit}/day`);
        }

        await prisma.outreachAccountConfig.update({
          where: { id: acc.id },
          data: {
            sentToday: 0,
            currentWarmupLimit: newLimit,
            lastResetDate: new Date(),
          },
        });
      }

      if (accountsToReset.length > 0) {
        console.log(`[Scheduler] Reset daily quotas for ${accountsToReset.length} outreach mailboxes`);
      }
    } catch (err) {
      console.error('[Scheduler] Error in warmup & quota reset:', err);
    }
  }

  // Poll all tenants' inboxes every 30 minutes
  async function pollAllTenants() {
    console.log('[Scheduler] Starting email poll for all tenants...');
    try {
      const configs = await prisma.emailConfig.findMany({
        where: { isActive: true },
        select: { tenantId: true, id: true },
      });

      for (const config of configs) {
        await emailPollQueue.add('poll_inbox', {
          type: 'poll_inbox',
          tenantId: config.tenantId,
          emailConfigId: config.id,
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

  // Check automated step-2 drip follow-up sequences
  async function checkDripFollowUpSequence() {
    try {
      const activeDripCampaigns = await prisma.outreachCampaign.findMany({
        where: {
          status: 'RUNNING',
          dripEnabled: true,
        },
        select: {
          id: true,
          tenantId: true,
          dripDelayDays: true,
        },
      });

      if (activeDripCampaigns.length === 0) return;

      const { dispatchDripFollowUp } = await import('../src/lib/outreach-dispatcher');

      for (const camp of activeDripCampaigns) {
        const cutoffDate = new Date();
        cutoffDate.setDate(cutoffDate.getDate() - (camp.dripDelayDays || 3));

        const eligibleLeads = await prisma.outreachLead.findMany({
          where: {
            campaignId: camp.id,
            status: 'DISPATCHED',
            repliedAt: null,
            dripStatus: 'IDLE',
            sentAt: { lte: cutoffDate },
          },
          select: { id: true, email: true },
          take: 20, // process in small batches per check
        });

        for (const lead of eligibleLeads) {
          try {
            const res = await dispatchDripFollowUp({
              leadId: lead.id,
              tenantId: camp.tenantId,
            });
            if (res.success) {
              console.log(`[Scheduler] Drip follow-up sent to ${lead.email} for campaign ${camp.id}`);
            }
          } catch (dripErr: any) {
            console.error(`[Scheduler] Error sending drip to ${lead.email}:`, dripErr?.message || dripErr);
          }
        }
      }
    } catch (err) {
      console.error('[Scheduler] Error in drip follow-up sequence check:', err);
    }
  }

  // Run immediately on startup
  pollAllTenants();
  checkDailyWarmupAndQuotaReset();
  checkDripFollowUpSequence();

  // Then schedule
  setInterval(pollAllTenants, POLL_INTERVAL_MS);
  setInterval(checkAutoAdvance, ADVANCE_CHECK_INTERVAL_MS);
  setInterval(checkDailyWarmupAndQuotaReset, WARMUP_CHECK_INTERVAL_MS);
  setInterval(checkDripFollowUpSequence, WARMUP_CHECK_INTERVAL_MS);

  console.log('[Scheduler] Cron jobs registered');
  console.log(`[Scheduler] Email poll every ${POLL_INTERVAL_MS / 60000} minutes`);
  console.log(`[Scheduler] Auto-advance check every ${ADVANCE_CHECK_INTERVAL_MS / 60000} minutes`);
  console.log(`[Scheduler] Warmup & Quota check every ${WARMUP_CHECK_INTERVAL_MS / 60000} minutes`);
  console.log(`[Scheduler] Drip Follow-up check every ${WARMUP_CHECK_INTERVAL_MS / 60000} minutes`);
}
