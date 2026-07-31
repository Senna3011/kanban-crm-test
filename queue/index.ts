import { Queue } from 'bullmq';
import IORedis from 'ioredis';

const redisUrl = process.env.REDIS_URL;
if (process.env.NODE_ENV === 'production' && !redisUrl) {
  throw new Error('REDIS_URL must be configured in production.');
}

export const connection = new IORedis(redisUrl || 'redis://localhost:6379', {
  maxRetriesPerRequest: null,
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
