import './env';
import { Worker } from 'bullmq';
import { connection, QueueNames } from '../queue';
import { processEmailPoll } from './imap-poller';
import { processAutoAdvance } from './auto-advance';
import { processNotification } from './notification';
import { processAIClassify, processAIDraft } from './ai-processor';
import { startSchedulers } from './scheduler';

console.log('[Worker] Starting all workers...');

// Email poll worker
new Worker(
  QueueNames.EMAIL_POLL,
  async (job) => processEmailPoll(job.data),
  { connection, concurrency: 1 }
);

// AI classification worker
new Worker(
  QueueNames.AI_PROCESS,
  async (job) => {
    if (job.data.type === 'classify_email') return processAIClassify(job.data);
    if (job.data.type === 'draft_followup') return processAIDraft(job.data);
  },
  { connection, concurrency: 2 }
);

// Auto-advance worker
new Worker(
  QueueNames.AUTO_ADVANCE,
  async (job) => processAutoAdvance(job.data),
  { connection, concurrency: 1 }
);

// Notification worker
new Worker(
  QueueNames.NOTIFICATION,
  async (job) => processNotification(job.data),
  { connection, concurrency: 2 }
);

// Start cron schedulers
startSchedulers();

console.log('[Worker] All workers registered. Waiting for jobs...');

process.on('SIGTERM', () => {
  console.log('[Worker] Shutting down...');
  process.exit(0);
});
