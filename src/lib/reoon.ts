export interface ReoonVerifyResult {
  email: string;
  status: 'SAFE' | 'RISKY' | 'INVALID' | 'DISPOSABLE' | 'UNVERIFIED';
  score: number;
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

export async function verifyEmailAddress(
  email: string,
  apiKey?: string
): Promise<ReoonVerifyResult> {
  const key = apiKey || process.env.REOON_API_KEY;

  if (!email || !email.includes('@')) {
    return {
      email,
      status: 'INVALID',
      score: 0,
      reason: 'Sintaks alamat email tidak valid',
      isDisposable: false,
      isFree: false,
    };
  }

  if (!key) {
    return {
      email,
      status: 'UNVERIFIED',
      score: 0,
      reason: 'Verifikasi tidak dilakukan — Reoon API key belum diatur di Outreach Settings',
      isDisposable: false,
      isFree: false,
    };
  }

  try {
    const url = new URL('https://emailverifier.reoon.com/api/v1/verify');
    url.searchParams.set('email', email);
    url.searchParams.set('key', key);
    url.searchParams.set('mode', 'quick');

    const response = await fetch(url.toString(), {
      method: 'GET',
      headers: { 'Accept': 'application/json' },
    });

    if (!response.ok) {
      const errText = await response.text();
      console.error(`[REOON] Verification HTTP error ${response.status}: ${errText}`);
      return {
        email,
        status: 'UNVERIFIED',
        score: 0,
        reason: `Reoon API responded with status ${response.status}: ${errText || 'Verification failed'}`,
      };
    }

    const json = await response.json();
    const rawStatus = (json.status || '').toLowerCase();
    const isDisposable = Boolean(json.is_disposable);

    let status: 'SAFE' | 'RISKY' | 'INVALID' | 'DISPOSABLE' | 'UNVERIFIED' = 'SAFE';
    
    // Explicitly categorize disposable emails as DISPOSABLE or INVALID
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
      reason: json.reason || json.message || undefined,
      isDisposable,
      isFree: Boolean(json.is_free),
    };
  } catch (error: any) {
    console.error('[REOON] Exception during verification:', error);
    return {
      email,
      status: 'UNVERIFIED',
      score: 0,
      reason: `Verification exception: ${error.message || 'Network error'}`,
    };
  }
}

export function generateEmailCandidates(
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

export async function findProspectEmail(
  params: ReoonFindParams
): Promise<{ email: string | null; status: 'SAFE' | 'RISKY' | 'INVALID' | 'DISPOSABLE' | 'UNVERIFIED'; score: number; reason?: string }> {
  const domain = params.companyDomain || (params.companyName ? `${params.companyName.toLowerCase().replace(/[^a-z0-9]/g, '')}.com` : null);

  if (!domain) {
    return { email: null, status: 'UNVERIFIED', score: 0, reason: 'Company domain not found' };
  }

  const candidates = generateEmailCandidates(params.firstName, params.lastName, domain);
  if (candidates.length === 0) {
    return { email: null, status: 'INVALID', score: 0, reason: 'First or last name is missing' };
  }

  // If no API key, return the primary standard pattern immediately
  if (!params.apiKey && !process.env.REOON_API_KEY) {
    return {
      email: candidates[0],
      status: 'UNVERIFIED',
      score: 0,
      reason: 'Generated pattern without Reoon API key verification',
    };
  }

  // Try verifying candidates to find the highest deliverability email
  let bestResult = {
    email: candidates[0],
    status: 'UNVERIFIED' as 'SAFE' | 'RISKY' | 'INVALID' | 'DISPOSABLE' | 'UNVERIFIED',
    score: 0,
    reason: undefined as string | undefined,
  };

  for (const candidate of candidates.slice(0, 3)) {
    const verification = await verifyEmailAddress(candidate, params.apiKey);
    if (verification.status === 'SAFE') {
      return {
        email: candidate,
        status: verification.status,
        score: verification.score,
        reason: verification.reason,
      };
    }
    if (verification.status === 'RISKY' && bestResult.status !== 'RISKY') {
      bestResult = {
        email: candidate,
        status: verification.status,
        score: verification.score,
        reason: verification.reason,
      };
    }
  }

  return bestResult;
}
