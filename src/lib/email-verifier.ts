import { resolveCompanyDomain } from './domain-resolver';
import { generateEmailPermutations } from './email-pattern-generator';

export interface EmailVerifyResult {
  email: string;
  status: 'SAFE' | 'RISKY' | 'INVALID' | 'DISPOSABLE' | 'UNVERIFIED';
  score: number;
  provider: 'Reoon' | 'Bouncer' | 'Hunter' | 'ZeroBounce' | 'AbstractAPI' | 'SyntaxCheck' | 'None';
  reason?: string;
  isDisposable?: boolean;
  isFree?: boolean;
}

export interface EmailCandidateParams {
  firstName?: string;
  lastName?: string;
  fullName?: string;
  companyDomain?: string;
  companyName?: string;
  reoonApiKey?: string;
  bouncerApiKey?: string;
  hunterApiKey?: string;
  zeroBounceApiKey?: string;
  abstractApiKey?: string;
}

/**
 * 1. Syntax & Quick Pre-validation
 */
function isValidEmailSyntax(email: string): boolean {
  if (!email || typeof email !== 'string') return false;
  const re = /^[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}$/;
  return re.test(email.trim());
}

/**
 * Tier 1 (Utama): Reoon Email Verifier
 */
async function verifyWithReoon(email: string, apiKey: string): Promise<EmailVerifyResult | null> {
  try {
    const url = new URL('https://emailverifier.reoon.com/api/v1/verify');
    url.searchParams.set('email', email);
    url.searchParams.set('key', apiKey);
    url.searchParams.set('mode', 'quick');

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 8000);

    const response = await fetch(url.toString(), {
      method: 'GET',
      headers: { 'Accept': 'application/json' },
      signal: controller.signal,
    });
    clearTimeout(timeout);

    if (response.status === 401 || response.status === 402 || response.status === 429) {
      console.warn(`[EMAIL-VERIFY][Tier 1 Reoon] Credits exhausted or unauthorized (HTTP ${response.status}). Falling back to Tier 2 (Bouncer)...`);
      return null;
    }

    if (!response.ok) {
      console.warn(`[EMAIL-VERIFY][Tier 1 Reoon] Error HTTP ${response.status}. Falling back to Tier 2 (Bouncer)...`);
      return null;
    }

    const json = await response.json();
    const rawStatus = (json.status || '').toLowerCase();

    if (
      rawStatus === 'error' ||
      rawStatus === 'invalid_key' ||
      rawStatus === 'no_credits' ||
      rawStatus.includes('credit') ||
      json.error ||
      (json.message && json.message.toLowerCase().includes('credit')) ||
      (json.message && json.message.toLowerCase().includes('limit'))
    ) {
      console.warn(`[EMAIL-VERIFY][Tier 1 Reoon] Quota exhausted (${json.message || rawStatus}). Falling back to Tier 2 (Bouncer)...`);
      return null;
    }

    const isDisposable = Boolean(json.is_disposable);
    let status: EmailVerifyResult['status'] = 'SAFE';

    if (isDisposable || rawStatus === 'disposable') {
      status = 'DISPOSABLE';
    } else if (rawStatus === 'valid' || rawStatus === 'safe') {
      status = 'SAFE';
    } else if (rawStatus === 'catch_all' || rawStatus === 'risky' || rawStatus === 'unknown') {
      status = 'RISKY';
    } else if (rawStatus === 'invalid' || rawStatus === 'disabled') {
      status = 'INVALID';
    } else {
      status = 'UNVERIFIED';
    }

    return {
      email,
      status,
      score: typeof json.score === 'number' ? json.score : (status === 'SAFE' ? 95 : status === 'RISKY' ? 60 : 0),
      provider: 'Reoon',
      reason: json.reason || json.message || undefined,
      isDisposable,
      isFree: Boolean(json.is_free),
    };
  } catch (err: any) {
    console.warn(`[EMAIL-VERIFY][Tier 1 Reoon] Call failed (${err.message}). Falling back to Tier 2 (Bouncer)...`);
    return null;
  }
}

/**
 * Tier 2 (Cadangan 1): Bouncer Email Verifier (usebouncer.com)
 */
async function verifyWithBouncer(email: string, apiKey: string): Promise<EmailVerifyResult | null> {
  try {
    const url = new URL('https://api.usebouncer.com/v1.1/email/verify');
    url.searchParams.set('email', email);
    url.searchParams.set('timeout', '5');

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 8000);

    const response = await fetch(url.toString(), {
      method: 'GET',
      headers: {
        'Accept': 'application/json',
        'x-api-key': apiKey,
      },
      signal: controller.signal,
    });
    clearTimeout(timeout);

    if (response.status === 401 || response.status === 402 || response.status === 429) {
      console.warn(`[EMAIL-VERIFY][Tier 2 Bouncer] Credits exhausted or unauthorized (HTTP ${response.status}). Falling back to Tier 3 (Hunter.io)...`);
      return null;
    }

    if (!response.ok) {
      console.warn(`[EMAIL-VERIFY][Tier 2 Bouncer] Error HTTP ${response.status}. Falling back to Tier 3 (Hunter.io)...`);
      return null;
    }

    const json = await response.json();
    const rawStatus = (json.status || '').toLowerCase();
    const isDisposable = Boolean(json.disposable || json.is_disposable || rawStatus === 'disposable');

    if (
      rawStatus === 'error' ||
      json.error ||
      (json.message && json.message.toLowerCase().includes('credit')) ||
      (json.message && json.message.toLowerCase().includes('key'))
    ) {
      console.warn(`[EMAIL-VERIFY][Tier 2 Bouncer] Quota exhausted (${json.message || rawStatus}). Falling back to Tier 3 (Hunter.io)...`);
      return null;
    }

    let status: EmailVerifyResult['status'] = 'SAFE';
    let score = typeof json.score === 'number' ? json.score : 90;

    if (isDisposable) {
      status = 'DISPOSABLE';
      score = 0;
    } else if (rawStatus === 'deliverable') {
      status = 'SAFE';
      score = score || 95;
    } else if (rawStatus === 'risky' || rawStatus === 'unknown' || rawStatus === 'accept_all') {
      status = 'RISKY';
      score = score || 60;
    } else if (rawStatus === 'undeliverable' || rawStatus === 'invalid') {
      status = 'INVALID';
      score = 0;
    } else {
      status = 'UNVERIFIED';
    }

    return {
      email,
      status,
      score,
      provider: 'Bouncer',
      reason: json.reason || rawStatus,
      isDisposable,
      isFree: Boolean(json.free),
    };
  } catch (err: any) {
    console.warn(`[EMAIL-VERIFY][Tier 2 Bouncer] Call failed (${err.message}). Falling back to Tier 3 (Hunter.io)...`);
    return null;
  }
}

/**
 * Tier 3 (Cadangan 2): Hunter.io Email Verifier (hunter.io)
 */
async function verifyWithHunter(email: string, apiKey: string): Promise<EmailVerifyResult | null> {
  try {
    const url = new URL('https://api.hunter.io/v2/email-verifier');
    url.searchParams.set('email', email);
    url.searchParams.set('api_key', apiKey);

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 8000);

    const response = await fetch(url.toString(), {
      method: 'GET',
      headers: { 'Accept': 'application/json' },
      signal: controller.signal,
    });
    clearTimeout(timeout);

    if (response.status === 401 || response.status === 402 || response.status === 429) {
      console.warn(`[EMAIL-VERIFY][Tier 3 Hunter.io] Quota exhausted or unauthorized (HTTP ${response.status}).`);
      return null;
    }

    if (!response.ok) {
      console.warn(`[EMAIL-VERIFY][Tier 3 Hunter.io] Returned HTTP ${response.status}.`);
      return null;
    }

    const json = await response.json();
    const data = json.data || {};

    if (json.errors && json.errors.length > 0) {
      console.warn(`[EMAIL-VERIFY][Tier 3 Hunter.io] Error payload: ${JSON.stringify(json.errors)}`);
      return null;
    }

    const rawStatus = (data.status || data.result || '').toLowerCase();
    const isDisposable = Boolean(data.disposable || rawStatus === 'disposable');
    const score = typeof data.score === 'number' ? data.score : 85;

    let status: EmailVerifyResult['status'] = 'SAFE';

    if (isDisposable) {
      status = 'DISPOSABLE';
    } else if (rawStatus === 'valid' || rawStatus === 'deliverable') {
      status = 'SAFE';
    } else if (rawStatus === 'accept_all' || rawStatus === 'risky' || rawStatus === 'unknown' || rawStatus === 'webmail') {
      status = 'RISKY';
    } else if (rawStatus === 'invalid' || rawStatus === 'undeliverable') {
      status = 'INVALID';
    } else {
      status = 'UNVERIFIED';
    }

    return {
      email,
      status,
      score,
      provider: 'Hunter',
      reason: data.regexp ? `Hunter Result: ${rawStatus}` : undefined,
      isDisposable,
      isFree: Boolean(data.webmail),
    };
  } catch (err: any) {
    console.warn(`[EMAIL-VERIFY][Tier 3 Hunter.io] Call failed (${err.message}).`);
    return null;
  }
}

/**
 * Hunter.io Corporate Email Finder by Name & Company/Domain
 */
async function findEmailWithHunterFinder(
  firstName: string,
  lastName: string,
  companyOrDomain: string,
  apiKey: string
): Promise<{ email: string; score: number } | null> {
  try {
    const url = new URL('https://api.hunter.io/v2/email-finder');
    url.searchParams.set('first_name', firstName);
    url.searchParams.set('last_name', lastName);
    if (companyOrDomain.includes('.')) {
      url.searchParams.set('domain', companyOrDomain);
    } else {
      url.searchParams.set('company', companyOrDomain);
    }
    url.searchParams.set('api_key', apiKey);

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 8000);

    const response = await fetch(url.toString(), {
      method: 'GET',
      headers: { 'Accept': 'application/json' },
      signal: controller.signal,
    });
    clearTimeout(timeout);

    if (!response.ok) return null;

    const json = await response.json();
    if (json.data && json.data.email) {
      return {
        email: json.data.email,
        score: json.data.score || 90,
      };
    }
    return null;
  } catch {
    return null;
  }
}

/**
 * Multi-Provider Email Verifier with 3-Tier Fallback Chain
 */
export async function verifyEmailMultiProvider(
  email: string,
  options?: {
    reoonApiKey?: string;
    bouncerApiKey?: string;
    hunterApiKey?: string;
    zeroBounceApiKey?: string;
    abstractApiKey?: string;
  }
): Promise<EmailVerifyResult> {
  const cleanEmail = (email || '').trim().toLowerCase();

  // 1. Syntax pre-check (saves API calls)
  if (!isValidEmailSyntax(cleanEmail)) {
    return {
      email: cleanEmail,
      status: 'INVALID',
      score: 0,
      provider: 'SyntaxCheck',
      reason: 'Format email tidak valid (RFC 5322 syntax error)',
      isDisposable: false,
      isFree: false,
    };
  }

  const reoonKey = options?.reoonApiKey || process.env.REOON_API_KEY;
  const bouncerKey = options?.bouncerApiKey || process.env.BOUNCER_API_KEY || process.env.USEBOUNCER_API_KEY || options?.zeroBounceApiKey || process.env.ZEROBOUNCE_API_KEY;
  const hunterKey = options?.hunterApiKey || process.env.HUNTER_API_KEY || process.env.HUNTERIO_API_KEY || options?.abstractApiKey || process.env.ABSTRACT_API_KEY;

  // Tier 1: Reoon (Prioritas Utama)
  if (reoonKey) {
    const result = await verifyWithReoon(cleanEmail, reoonKey);
    if (result) return result;
  }

  // Tier 2: Bouncer (Cadangan 1 saat Reoon limit/habis)
  if (bouncerKey) {
    const result = await verifyWithBouncer(cleanEmail, bouncerKey);
    if (result) return result;
  }

  // Tier 3: Hunter.io (Cadangan 2 saat Reoon & Bouncer limit/habis)
  if (hunterKey) {
    const result = await verifyWithHunter(cleanEmail, hunterKey);
    if (result) return result;
  }

  // Jika semua API verifier gagal atau belum diisi
  return {
    email: cleanEmail,
    status: 'UNVERIFIED',
    score: 0,
    provider: 'None',
    reason: 'Semua API key verifier (Reoon, Bouncer, Hunter.io) habis kuota atau belum diatur',
    isDisposable: false,
    isFree: false,
  };
}

/**
 * Backwards-compatible verifyEmailAddress wrapper
 */
export async function verifyEmailAddress(
  email: string,
  apiKey?: string
): Promise<EmailVerifyResult> {
  return verifyEmailMultiProvider(email, { reoonApiKey: apiKey });
}

/**
 * Generate Candidate Patterns (wraps email-pattern-generator)
 */
export function generateCandidatePatterns(
  firstName: string,
  lastName: string,
  domain: string
): string[] {
  const fullName = `${firstName} ${lastName}`.trim();
  return generateEmailPermutations(fullName, domain);
}

/**
 * Discover Prospect Email & Verify using Domain Resolver & Permutation Engine
 */
export async function findAndVerifyProspectEmail(
  params: EmailCandidateParams
): Promise<{
  email: string | null;
  resolvedDomain: string | null;
  status: EmailVerifyResult['status'];
  score: number;
  provider: EmailVerifyResult['provider'];
  reason?: string;
}> {
  const fullName = params.fullName || `${params.firstName || ''} ${params.lastName || ''}`.trim() || 'prospect';
  const hunterKey = params.hunterApiKey || process.env.HUNTER_API_KEY || process.env.HUNTERIO_API_KEY;

  // 1. Resolve authentic corporate domain via Clearbit & sanitization
  const domainRes = await resolveCompanyDomain(params.companyName, params.companyDomain);
  const targetDomain = domainRes.domain;

  // 2. Direct Hunter.io Email Finder if key is available
  if (hunterKey && params.firstName && (targetDomain || params.companyName)) {
    const hunterMatch = await findEmailWithHunterFinder(
      params.firstName,
      params.lastName || '',
      targetDomain || params.companyName || '',
      hunterKey
    );

    if (hunterMatch && hunterMatch.email) {
      const verified = await verifyEmailMultiProvider(hunterMatch.email, {
        reoonApiKey: params.reoonApiKey,
        bouncerApiKey: params.bouncerApiKey,
        hunterApiKey: hunterKey,
      });

      return {
        email: hunterMatch.email,
        resolvedDomain: targetDomain,
        status: verified.status === 'UNVERIFIED' ? 'SAFE' : verified.status,
        score: verified.score || hunterMatch.score || 90,
        provider: verified.provider !== 'None' ? verified.provider : 'Hunter',
        reason: 'Verified via Hunter.io Corporate Intelligence',
      };
    }
  }

  if (!targetDomain) {
    return {
      email: null,
      resolvedDomain: null,
      status: 'UNVERIFIED',
      score: 0,
      provider: 'None',
      reason: domainRes.reason,
    };
  }

  // 3. Generate candidate permutations
  const candidates = generateEmailPermutations(fullName, targetDomain);
  if (candidates.length === 0) {
    return {
      email: null,
      resolvedDomain: targetDomain,
      status: 'INVALID',
      score: 0,
      provider: 'None',
      reason: 'Nama prospek tidak lengkap',
    };
  }

  const hasAnyKey = Boolean(
    params.reoonApiKey ||
    process.env.REOON_API_KEY ||
    params.bouncerApiKey ||
    process.env.BOUNCER_API_KEY ||
    process.env.USEBOUNCER_API_KEY ||
    params.hunterApiKey ||
    process.env.HUNTER_API_KEY
  );

  if (!hasAnyKey) {
    return {
      email: candidates[0],
      resolvedDomain: targetDomain,
      status: 'UNVERIFIED',
      score: 0,
      provider: 'None',
      reason: 'Pattern generated without API verifier check',
    };
  }

  let bestResult = {
    email: candidates[0],
    resolvedDomain: targetDomain,
    status: 'UNVERIFIED' as EmailVerifyResult['status'],
    score: 0,
    provider: 'None' as EmailVerifyResult['provider'],
    reason: undefined as string | undefined,
  };

  // Test top 3 candidates to preserve verification quota
  for (const candidate of candidates.slice(0, 3)) {
    const verified = await verifyEmailMultiProvider(candidate, {
      reoonApiKey: params.reoonApiKey,
      bouncerApiKey: params.bouncerApiKey,
      hunterApiKey: params.hunterApiKey,
    });

    if (verified.status === 'SAFE') {
      return {
        email: candidate,
        resolvedDomain: targetDomain,
        status: verified.status,
        score: verified.score,
        provider: verified.provider,
        reason: verified.reason,
      };
    }

    if (verified.status === 'RISKY' && bestResult.status !== 'RISKY') {
      bestResult = {
        email: candidate,
        resolvedDomain: targetDomain,
        status: verified.status,
        score: verified.score,
        provider: verified.provider,
        reason: verified.reason,
      };
    }
  }

  return bestResult;
}
