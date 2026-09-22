export interface ReoonVerifyResult {
  email: string;
  status: 'SAFE' | 'RISKY' | 'INVALID' | 'UNVERIFIED';
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

  if (!email || !email.includes('@') || !email.includes('.')) {
    return {
      email,
      status: 'INVALID',
      score: 0,
      reason: 'Malformed email address syntax',
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

    let status: 'SAFE' | 'RISKY' | 'INVALID' | 'UNVERIFIED' = 'SAFE';
    if (rawStatus === 'valid' || rawStatus === 'safe') {
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
      score: typeof json.score === 'number' ? json.score : (status === 'SAFE' ? 95 : status === 'RISKY' ? 60 : 10),
      reason: json.reason || json.message || undefined,
      isDisposable: Boolean(json.is_disposable),
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

export async function findProspectEmail(
  params: ReoonFindParams
): Promise<{ email: string | null; status: 'SAFE' | 'RISKY' | 'INVALID' | 'UNVERIFIED'; score: number; reason?: string }> {
  const cleanFirst = params.firstName.toLowerCase().replace(/[^a-z0-9]/g, '');
  const cleanLast = params.lastName.toLowerCase().replace(/[^a-z0-9]/g, '');
  const domain = params.companyDomain || (params.companyName ? `${params.companyName.toLowerCase().replace(/[^a-z0-9]/g, '')}.com` : null);

  if (!cleanFirst && !cleanLast) {
    return { email: null, status: 'INVALID', score: 0, reason: 'First or last name is missing' };
  }

  if (!domain) {
    return { email: null, status: 'INVALID', score: 0, reason: 'Company domain could not be resolved' };
  }

  // Realistic corporate email pattern: first.last@domain.com
  const candidateEmail = cleanLast ? `${cleanFirst}.${cleanLast}@${domain}` : `${cleanFirst}@${domain}`;
  const verification = await verifyEmailAddress(candidateEmail, params.apiKey);

  return {
    email: candidateEmail,
    status: verification.status,
    score: verification.score,
    reason: verification.reason,
  };
}
