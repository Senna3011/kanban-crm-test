export interface EmailVerifyResult {
  email: string;
  status: 'SAFE' | 'RISKY' | 'INVALID' | 'DISPOSABLE' | 'UNVERIFIED';
  score: number;
  provider: 'Reoon' | 'ZeroBounce' | 'AbstractAPI' | 'SyntaxCheck' | 'None';
  reason?: string;
  isDisposable?: boolean;
  isFree?: boolean;
}

export interface EmailCandidateParams {
  firstName: string;
  lastName: string;
  companyDomain?: string;
  companyName?: string;
  reoonApiKey?: string;
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
 * Tier 1: Reoon Email Verifier
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
      console.warn(`[EMAIL-VERIFY] Reoon credits exhausted or unauthorized (status ${response.status}). Falling back to next tier.`);
      return null;
    }

    if (!response.ok) {
      console.warn(`[EMAIL-VERIFY] Reoon error ${response.status}. Attempting fallback.`);
      return null;
    }

    const json = await response.json();
    const rawStatus = (json.status || '').toLowerCase();
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
    console.warn(`[EMAIL-VERIFY] Reoon call failed (${err.message}). Falling back to next provider.`);
    return null;
  }
}

/**
 * Tier 2: ZeroBounce Email Verifier
 */
async function verifyWithZeroBounce(email: string, apiKey: string): Promise<EmailVerifyResult | null> {
  try {
    const url = new URL('https://api.zerobounce.net/v2/validate');
    url.searchParams.set('api_key', apiKey);
    url.searchParams.set('email', email);
    url.searchParams.set('ip_address', '');

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 8000);

    const response = await fetch(url.toString(), {
      method: 'GET',
      headers: { 'Accept': 'application/json' },
      signal: controller.signal,
    });
    clearTimeout(timeout);

    if (response.status === 401 || response.status === 402 || response.status === 429) {
      console.warn(`[EMAIL-VERIFY] ZeroBounce credits exhausted (status ${response.status}). Falling back to Tier 3.`);
      return null;
    }

    if (!response.ok) {
      console.warn(`[EMAIL-VERIFY] ZeroBounce returned ${response.status}. Attempting fallback.`);
      return null;
    }

    const json = await response.json();
    const rawStatus = (json.status || '').toLowerCase();
    const subStatus = (json.sub_status || '').toLowerCase();
    const isDisposable = subStatus === 'disposable' || rawStatus === 'disposable';

    let status: EmailVerifyResult['status'] = 'SAFE';
    let score = 95;

    if (isDisposable) {
      status = 'DISPOSABLE';
      score = 0;
    } else if (rawStatus === 'valid') {
      status = 'SAFE';
      score = 95;
    } else if (rawStatus === 'catch-all' || rawStatus === 'unknown') {
      status = 'RISKY';
      score = 60;
    } else if (rawStatus === 'invalid' || rawStatus === 'spamtrap' || rawStatus === 'abuse' || rawStatus === 'do_not_mail') {
      status = 'INVALID';
      score = 0;
    } else {
      status = 'UNVERIFIED';
      score = 50;
    }

    return {
      email,
      status,
      score,
      provider: 'ZeroBounce',
      reason: json.sub_status || rawStatus,
      isDisposable,
      isFree: Boolean(json.free_email),
    };
  } catch (err: any) {
    console.warn(`[EMAIL-VERIFY] ZeroBounce call failed (${err.message}). Falling back.`);
    return null;
  }
}

/**
 * Tier 3: Abstract API Email Validation
 */
async function verifyWithAbstractApi(email: string, apiKey: string): Promise<EmailVerifyResult | null> {
  try {
    const url = new URL('https://emailvalidation.abstractapi.com/v1/');
    url.searchParams.set('api_key', apiKey);
    url.searchParams.set('email', email);

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 8000);

    const response = await fetch(url.toString(), {
      method: 'GET',
      headers: { 'Accept': 'application/json' },
      signal: controller.signal,
    });
    clearTimeout(timeout);

    if (response.status === 401 || response.status === 402 || response.status === 429) {
      console.warn(`[EMAIL-VERIFY] Abstract API quota reached (status ${response.status}).`);
      return null;
    }

    if (!response.ok) {
      console.warn(`[EMAIL-VERIFY] Abstract API returned ${response.status}.`);
      return null;
    }

    const json = await response.json();
    const deliverability = (json.deliverability || '').toUpperCase();
    const isDisposable = Boolean(json.is_disposable_email?.value);
    const qualityScore = typeof json.quality_score === 'number' ? Math.round(json.quality_score * 100) : 75;

    let status: EmailVerifyResult['status'] = 'SAFE';

    if (isDisposable) {
      status = 'DISPOSABLE';
    } else if (deliverability === 'DELIVERABLE') {
      status = 'SAFE';
    } else if (deliverability === 'RISKY' || deliverability === 'UNKNOWN') {
      status = 'RISKY';
    } else if (deliverability === 'UNDELIVERABLE') {
      status = 'INVALID';
    } else {
      status = 'UNVERIFIED';
    }

    return {
      email,
      status,
      score: qualityScore,
      provider: 'AbstractAPI',
      reason: `Deliverability: ${deliverability}`,
      isDisposable,
      isFree: Boolean(json.is_free_email?.value),
    };
  } catch (err: any) {
    console.warn(`[EMAIL-VERIFY] Abstract API failed: ${err.message}`);
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
    zeroBounceApiKey?: string;
    abstractApiKey?: string;
  }
): Promise<EmailVerifyResult> {
  const cleanEmail = (email || '').trim().toLowerCase();

  // 1. Syntax check
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
  const zeroBounceKey = options?.zeroBounceApiKey || process.env.ZEROBOUNCE_API_KEY;
  const abstractKey = options?.abstractApiKey || process.env.ABSTRACT_API_KEY;

  // Tier 1: Try Reoon
  if (reoonKey) {
    const result = await verifyWithReoon(cleanEmail, reoonKey);
    if (result) return result;
  }

  // Tier 2: Fallback to ZeroBounce
  if (zeroBounceKey) {
    const result = await verifyWithZeroBounce(cleanEmail, zeroBounceKey);
    if (result) return result;
  }

  // Tier 3: Fallback to Abstract API
  if (abstractKey) {
    const result = await verifyWithAbstractApi(cleanEmail, abstractKey);
    if (result) return result;
  }

  // All failed or no API keys configured
  return {
    email: cleanEmail,
    status: 'UNVERIFIED',
    score: 0,
    provider: 'None',
    reason: 'Semua API key verifier (Reoon, ZeroBounce, Abstract) belum diisi atau kuota habis',
    isDisposable: false,
    isFree: false,
  };
}

/**
 * Email Candidate Generator based on Standard Corporate Patterns
 */
export function generateCandidatePatterns(
  firstName: string,
  lastName: string,
  domain: string
): string[] {
  const f = firstName.toLowerCase().replace(/[^a-z0-9]/g, '');
  const l = lastName.toLowerCase().replace(/[^a-z0-9]/g, '');
  if (!f && !l) return [];
  if (!l) return [`${f}@${domain}`];
  if (!f) return [`${l}@${domain}`];

  const candidates = [
    `${f}.${l}@${domain}`,
    `${f}@${domain}`,
    `${f[0]}${l}@${domain}`,
    `${f}${l}@${domain}`,
    `${f}${l[0]}@${domain}`,
  ];

  return Array.from(new Set(candidates));
}

/**
 * Discover Prospect Email & Verify via Multi-Provider Fallback Chain
 */
export async function findAndVerifyProspectEmail(
  params: EmailCandidateParams
): Promise<{
  email: string | null;
  status: EmailVerifyResult['status'];
  score: number;
  provider: EmailVerifyResult['provider'];
  reason?: string;
}> {
  const domain = params.companyDomain || (params.companyName ? `${params.companyName.toLowerCase().replace(/[^a-z0-9]/g, '')}.com` : null);

  if (!domain) {
    return { email: null, status: 'UNVERIFIED', score: 0, provider: 'None', reason: 'Domain perusahaan tidak ditemukan' };
  }

  const candidates = generateCandidatePatterns(params.firstName, params.lastName, domain);
  if (candidates.length === 0) {
    return { email: null, status: 'INVALID', score: 0, provider: 'None', reason: 'Nama prospek tidak lengkap' };
  }

  const hasAnyKey = Boolean(
    params.reoonApiKey ||
    process.env.REOON_API_KEY ||
    params.zeroBounceApiKey ||
    process.env.ZEROBOUNCE_API_KEY ||
    params.abstractApiKey ||
    process.env.ABSTRACT_API_KEY
  );

  // Return primary candidate directly if no verifiers configured
  if (!hasAnyKey) {
    return {
      email: candidates[0],
      status: 'UNVERIFIED',
      score: 0,
      provider: 'None',
      reason: 'Pattern generated without API verifier check',
    };
  }

  let bestResult = {
    email: candidates[0],
    status: 'UNVERIFIED' as EmailVerifyResult['status'],
    score: 0,
    provider: 'None' as EmailVerifyResult['provider'],
    reason: undefined as string | undefined,
  };

  for (const candidate of candidates.slice(0, 3)) {
    const verified = await verifyEmailMultiProvider(candidate, {
      reoonApiKey: params.reoonApiKey,
      zeroBounceApiKey: params.zeroBounceApiKey,
      abstractApiKey: params.abstractApiKey,
    });

    if (verified.status === 'SAFE') {
      return {
        email: candidate,
        status: verified.status,
        score: verified.score,
        provider: verified.provider,
        reason: verified.reason,
      };
    }

    if (verified.status === 'RISKY' && bestResult.status !== 'RISKY') {
      bestResult = {
        email: candidate,
        status: verified.status,
        score: verified.score,
        provider: verified.provider,
        reason: verified.reason,
      };
    }
  }

  return bestResult;
}
