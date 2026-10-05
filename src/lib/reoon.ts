import {
  EmailVerifyResult,
  EmailCandidateParams,
  verifyEmailMultiProvider,
  findAndVerifyProspectEmail,
  generateCandidatePatterns,
} from './email-verifier';

export interface ReoonVerifyResult {
  email: string;
  status: 'SAFE' | 'RISKY' | 'INVALID' | 'DISPOSABLE' | 'UNVERIFIED';
  score: number;
  provider?: string;
  reason?: string;
  isDisposable?: boolean;
  isFree?: boolean;
}

export interface ReoonFindParams {
  firstName: string;
  lastName: string;
  companyDomain?: string;
  companyName?: string;
  apiKey?: string;
}

export interface ReoonBulkTaskResult {
  taskId: string;
  status: 'processing' | 'completed' | 'error';
  progressPercentage?: number;
  results?: Record<string, ReoonVerifyResult>;
  totalEmails?: number;
}

/**
 * Creates a bulk verification task on Reoon API (handles up to 50,000 emails per task)
 */
export async function createReoonBulkTask(
  emails: string[],
  apiKey?: string,
  taskName = 'Bulk Verification'
): Promise<string> {
  const key = apiKey || process.env.REOON_API_KEY;
  if (!key) {
    throw new Error('Reoon API Key is required for bulk verification');
  }

  const cleanEmails = Array.from(
    new Set(emails.map((e) => e.trim().toLowerCase()).filter((e) => e && e.includes('@')))
  );

  if (cleanEmails.length === 0) {
    throw new Error('No valid email addresses provided for bulk verification');
  }

  const url = 'https://emailverifier.reoon.com/api/v1/create-bulk-verification-task/';
  const response = await fetch(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Accept: 'application/json',
    },
    body: JSON.stringify({
      name: taskName,
      emails: cleanEmails,
      key,
    }),
  });

  if (!response.ok) {
    const errText = await response.text();
    throw new Error(`Reoon bulk task creation failed (${response.status}): ${errText}`);
  }

  const json = await response.json();
  if (json.status !== 'success' || !json.task_id) {
    throw new Error(`Reoon bulk task failed: ${json.message || json.reason || 'Unknown error'}`);
  }

  return json.task_id;
}

/**
 * Fetches status or results for a Reoon Bulk Verification Task
 */
export async function getReoonBulkTaskResult(
  taskId: string,
  apiKey?: string
): Promise<ReoonBulkTaskResult> {
  const key = apiKey || process.env.REOON_API_KEY;
  if (!key) {
    throw new Error('Reoon API Key is required');
  }

  const url = `https://emailverifier.reoon.com/api/v1/get-result-bulk-verification-task/?key=${encodeURIComponent(
    key
  )}&task_id=${encodeURIComponent(taskId)}`;

  const response = await fetch(url, {
    method: 'GET',
    headers: { Accept: 'application/json' },
  });

  if (!response.ok) {
    const errText = await response.text();
    throw new Error(`Reoon get-result failed (${response.status}): ${errText}`);
  }

  const json = await response.json();
  const rawStatus = (json.status || '').toLowerCase();

  if (rawStatus === 'completed') {
    const parsedResults: Record<string, ReoonVerifyResult> = {};
    const rawResults = json.results || {};

    for (const [emailKey, item] of Object.entries<any>(rawResults)) {
      const itemStatus = (item?.status || '').toLowerCase();
      const isDisposable = Boolean(item?.is_disposable);
      let mappedStatus: ReoonVerifyResult['status'] = 'SAFE';

      if (isDisposable || itemStatus === 'disposable') {
        mappedStatus = 'DISPOSABLE';
      } else if (itemStatus === 'valid' || itemStatus === 'safe') {
        mappedStatus = 'SAFE';
      } else if (itemStatus === 'catch_all' || itemStatus === 'risky' || itemStatus === 'unknown') {
        mappedStatus = 'RISKY';
      } else if (itemStatus === 'invalid' || itemStatus === 'disabled') {
        mappedStatus = 'INVALID';
      } else {
        mappedStatus = 'UNVERIFIED';
      }

      parsedResults[emailKey.toLowerCase()] = {
        email: emailKey.toLowerCase(),
        status: mappedStatus,
        score: typeof item?.score === 'number' ? item.score : mappedStatus === 'SAFE' ? 95 : mappedStatus === 'RISKY' ? 60 : 0,
        provider: 'Reoon Bulk API',
        isDisposable,
        isFree: Boolean(item?.is_free_email),
      };
    }

    return {
      taskId,
      status: 'completed',
      progressPercentage: 100,
      totalEmails: Object.keys(parsedResults).length,
      results: parsedResults,
    };
  }

  if (rawStatus === 'waiting' || rawStatus === 'processing' || rawStatus === 'running') {
    return {
      taskId,
      status: 'processing',
      progressPercentage: typeof json.progress_percentage === 'number' ? json.progress_percentage : 0,
    };
  }

  return {
    taskId,
    status: 'error',
    progressPercentage: 0,
  };
}

/**
 * High-scale bulk verification: Submits task, polls until completion, and returns map of results
 */
export async function verifyEmailsBulk(
  emails: string[],
  apiKey?: string,
  onProgress?: (progress: number) => void
): Promise<Map<string, ReoonVerifyResult>> {
  const taskId = await createReoonBulkTask(emails, apiKey);
  const startTime = Date.now();
  const maxWaitMs = 15 * 60 * 1000; // 15 mins timeout for massive bulk jobs

  while (Date.now() - startTime < maxWaitMs) {
    await new Promise((resolve) => setTimeout(resolve, 5000));
    const result = await getReoonBulkTaskResult(taskId, apiKey);

    if (onProgress && result.progressPercentage !== undefined) {
      onProgress(result.progressPercentage);
    }

    if (result.status === 'completed' && result.results) {
      const map = new Map<string, ReoonVerifyResult>();
      for (const [em, r] of Object.entries(result.results)) {
        map.set(em.toLowerCase(), r);
      }
      return map;
    }

    if (result.status === 'error') {
      throw new Error(`Reoon bulk verification failed for task ${taskId}`);
    }
  }

  throw new Error(`Reoon bulk verification timed out for task ${taskId}`);
}

/**
 * Backwards-compatible verifyEmailAddress using 3-Tier Multi-Provider Fallback Chain
 */
export async function verifyEmailAddress(
  email: string,
  apiKey?: string
): Promise<ReoonVerifyResult> {
  const res = await verifyEmailMultiProvider(email, { reoonApiKey: apiKey });
  return {
    email: res.email,
    status: res.status,
    score: res.score,
    provider: res.provider,
    reason: res.reason,
    isDisposable: res.isDisposable,
    isFree: res.isFree,
  };
}

export function generateEmailCandidates(
  firstName: string,
  lastName: string,
  domain: string
): string[] {
  return generateCandidatePatterns(firstName, lastName, domain);
}

/**
 * Backwards-compatible findProspectEmail using 3-Tier Multi-Provider Fallback Chain
 */
export async function findProspectEmail(
  params: ReoonFindParams
): Promise<{
  email: string | null;
  status: 'SAFE' | 'RISKY' | 'INVALID' | 'DISPOSABLE' | 'UNVERIFIED';
  score: number;
  provider?: string;
  reason?: string;
}> {
  return findAndVerifyProspectEmail({
    firstName: params.firstName,
    lastName: params.lastName,
    companyDomain: params.companyDomain,
    companyName: params.companyName,
    reoonApiKey: params.apiKey,
  });
}
