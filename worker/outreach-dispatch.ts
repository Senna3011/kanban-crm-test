import { dispatchColdEmail } from '../src/lib/outreach-dispatcher';
import { OutreachDispatchJob } from '../queue/jobs';

export async function processOutreachDispatch(job: OutreachDispatchJob) {
  console.log(`[Outreach Worker] Processing dispatch job for lead: ${job.leadId} (Tenant: ${job.tenantId})`);
  try {
    const result = await dispatchColdEmail({
      leadId: job.leadId,
      tenantId: job.tenantId,
    });

    if (!result.success) {
      console.warn(`[Outreach Worker] Dispatch result failed for lead ${job.leadId}: ${result.error}`);
    } else {
      console.log(`[Outreach Worker] Successfully sent email to lead ${job.leadId} (MessageId: ${result.messageId})`);
    }

    return result;
  } catch (error: any) {
    console.error(`[Outreach Worker] Exception dispatching lead ${job.leadId}:`, error);
    throw error;
  }
}
