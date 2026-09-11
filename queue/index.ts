import { Queue } from 'bullmq';
import IORedis from 'ioredis';

let rawUrl = (process.env.REDIS_URL || 'redis://127.0.0.1:6379').trim();
// Fix common formatting issues (e.g. missing redis:// protocol prefix)
if (!rawUrl.startsWith('redis://') && !rawUrl.startsWith('rediss://')) {
  rawUrl = `redis://${rawUrl.replace(/^\/+/, '')}`;
}

export const connection = new IORedis(rawUrl, {
  maxRetriesPerRequest: null,
  retryStrategy(times) {
    const delay = Math.min(times * 2000, 30000);
    return delay;
  },
  enableReadyCheck: false,
});

connection.on('error', (err: any) => {
  if (err?.message?.includes('max requests limit exceeded')) {
    console.error('[Redis Error] Upstash limit reached (500k/day). Please reset database in Upstash Console or use fresh Redis.');
  } else {
    console.error('[Redis Connection Error]', err?.message || err);
  }
});

// Queues
export const emailPollQueue = new Queue('email-poll', { connection });
export const aiProcessQueue = new Queue('ai-process', { connection });
export const autoAdvanceQueue = new Queue('auto-advance', { connection });
export const notificationQueue = new Queue('notification', { connection });

// Queue names enum
export const QueueNames = {
  EMAIL_POLL: 'email-poll',
  AI_PROCESS: 'ai-process',
  AUTO_ADVANCE: 'auto-advance',
  NOTIFICATION: 'notification',
} as const;
