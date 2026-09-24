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
