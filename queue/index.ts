import { Queue, QueueOptions } from 'bullmq';
import IORedis, { RedisOptions } from 'ioredis';

let rawUrl = (process.env.REDIS_URL || 'redis://127.0.0.1:6379').trim();
// Fix common formatting issues (e.g. missing redis:// protocol prefix)
if (!rawUrl.startsWith('redis://') && !rawUrl.startsWith('rediss://')) {
  rawUrl = `redis://${rawUrl.replace(/^\/+/, '')}`;
}

export const redisConnectionOptions: RedisOptions = {
  maxRetriesPerRequest: null,
  retryStrategy(times) {
    return Math.min(times * 2000, 30000);
  },
  enableReadyCheck: false,
};

export function createRedisConnection(): IORedis {
  const client = new IORedis(rawUrl, redisConnectionOptions);
  client.on('error', (err: any) => {
    if (err?.message?.includes('max requests limit exceeded')) {
      console.error('[Redis Error] Upstash limit reached. Check Upstash Console or use fresh Redis.');
    } else {
      console.error('[Redis Connection Error]', err?.message || err);
    }
  });
  return client;
}

export const connection = createRedisConnection();

const defaultQueueOptions: QueueOptions = {
  connection,
  defaultJobOptions: {
    removeOnComplete: { count: 500 },
    removeOnFail: { count: 1000 },
    attempts: 3,
    backoff: {
      type: 'exponential',
      delay: 3000,
    },
  },
};

// Queues
export const emailPollQueue = new Queue('email-poll', defaultQueueOptions);
export const aiProcessQueue = new Queue('ai-process', defaultQueueOptions);
export const autoAdvanceQueue = new Queue('auto-advance', defaultQueueOptions);
export const notificationQueue = new Queue('notification', defaultQueueOptions);
export const outreachDispatchQueue = new Queue('outreach-dispatch', defaultQueueOptions);
export const outreachScrapeQueue = new Queue('outreach-scrape', defaultQueueOptions);
export const outreachVerifyQueue = new Queue('outreach-verify', defaultQueueOptions);

// Queue names enum
export const QueueNames = {
  EMAIL_POLL: 'email-poll',
  AI_PROCESS: 'ai-process',
  AUTO_ADVANCE: 'auto-advance',
  NOTIFICATION: 'notification',
  OUTREACH_DISPATCH: 'outreach-dispatch',
  OUTREACH_SCRAPE: 'outreach-scrape',
  OUTREACH_VERIFY: 'outreach-verify',
} as const;

