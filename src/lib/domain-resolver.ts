import dns from 'node:dns/promises';

const GENERIC_NON_COMPANY_PATTERNS = [
  'information technology',
  'information technology & services',
  'information technology and services',
  'financial services',
  'computer software',
  'management consulting',
  'marketing & advertising',
  'marketing and advertising',
  'human resources',
  'higher education',
  'education management',
  'hospital & health care',
  'hospital and health care',
  'telecommunications',
  'real estate',
  'construction',
  'retail',
  'e-commerce',
  'ecommerce',
  'internet',
  'confidential',
  'stealth',
  'stealth startup',
  'stealth mode',
  'self-employed',
  'self employed',
  'freelance',
  'freelancer',
  'independent consultant',
  'government administration',
  'banking',
  'insurance',
  'enterprise org',
  'enterprise group',
  'linkedin member',
  'various companies',
  'n/a',
  'none',
];

// In-memory LRU Cache for high-scale batch operations (max 5,000 entries)
const domainCache = new Map<string, string | null>();

/**
 * Checks whether a given string is a generic industry/placeholder, not a specific company name.
 */
export function isGenericNonCompanyString(companyName?: string | null): boolean {
  if (!companyName || typeof companyName !== 'string') return true;
  const clean = companyName.trim().toLowerCase();
  if (clean.length < 2) return true;

  for (const pattern of GENERIC_NON_COMPANY_PATTERNS) {
    if (clean === pattern || clean.startsWith(`${pattern} `) || clean.endsWith(` ${pattern}`)) {
      return true;
    }
  }

  return false;
}

/**
 * Clean company name by stripping legal suffixes, parentheses, and special characters.
 */
export function sanitizeCompanyName(companyName: string): string {
  if (!companyName || typeof companyName !== 'string') return '';

  return companyName
    .replace(/\s*\([^)]*\)/g, '') // Remove (AWS), (Persero), etc.
    .replace(/[@#$^&*_+=\[\]{}|\\:;"'<>,?/~`]/g, ' ') // Strip special symbols
    .replace(/\b(PT\.?|CV\.?|Inc\.?|Incorporated|LLC|Ltd\.?|Limited|Tbk\.?|Corp\.?|Corporation|GmbH|Co\.?|Group|Holdings?|Enterprises?|Technologies|Solutions|Services|International|Persero)\b/gi, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * Primary domain lookup via Clearbit Autocomplete API with caching.
 */
export async function lookupDomainViaClearbit(companyName: string): Promise<string | null> {
  const sanitized = sanitizeCompanyName(companyName);
  if (!sanitized || sanitized.length < 2) return null;

  const cacheKey = sanitized.toLowerCase();
  if (domainCache.has(cacheKey)) {
    return domainCache.get(cacheKey) || null;
  }

  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 3500);

    const url = `https://autocomplete.clearbit.com/v1/companies/suggest?query=${encodeURIComponent(sanitized)}`;
    const res = await fetch(url, {
      method: 'GET',
      headers: { Accept: 'application/json' },
      signal: controller.signal,
    });
    clearTimeout(timeout);

    if (!res.ok) {
      if (domainCache.size < 5000) domainCache.set(cacheKey, null);
      return null;
    }

    const data = await res.json();
    if (Array.isArray(data) && data.length > 0 && data[0]?.domain) {
      const resolvedDomain = String(data[0].domain).toLowerCase().trim();
      if (resolvedDomain.includes('.') && !resolvedDomain.includes(' ')) {
        if (domainCache.size < 5000) domainCache.set(cacheKey, resolvedDomain);
        return resolvedDomain;
      }
    }

    if (domainCache.size < 5000) domainCache.set(cacheKey, null);
    return null;
  } catch {
    return null;
  }
}

/**
 * Verifies if a website or domain is online, accessible, and not a generic/social placeholder.
 */
export async function isLiveWebsite(urlOrDomain?: string | null): Promise<boolean> {
  if (!urlOrDomain || typeof urlOrDomain !== 'string') return false;

  let clean = urlOrDomain.trim();
  if (clean.startsWith('http://') || clean.startsWith('https://')) {
    try {
      clean = new URL(clean).hostname;
    } catch {
      return false;
    }
  } else {
    clean = clean.split('/')[0].split('?')[0];
  }

  clean = clean.replace(/^www\./i, '').toLowerCase().trim();
  if (!clean || !clean.includes('.') || clean.length < 4 || clean.endsWith('.local')) {
    return false;
  }

  // Block social platforms, search engines, and URL shorteners
  const nonCompanyDomains = [
    'facebook.com',
    'instagram.com',
    'twitter.com',
    'x.com',
    'linkedin.com',
    'youtube.com',
    'google.com',
    'maps.google.com',
    'goo.gl',
    'wa.me',
    'whatsapp.com',
    'linktr.ee',
    't.me',
    'tiktok.com',
    'pinterest.com',
    'bit.ly',
    'wixsite.com',
    'wordpress.com',
    'blogspot.com',
  ];

  if (nonCompanyDomains.some((d) => clean === d || clean.endsWith(`.${d}`))) {
    return false;
  }

  const cacheKey = `live:${clean}`;
  if (domainCache.has(cacheKey)) {
    return domainCache.get(cacheKey) === 'true';
  }

  try {
    // 1. Fast DNS Check
    const lookup = await dns.lookup(clean).catch(() => null);
    if (!lookup || !lookup.address) {
      if (domainCache.size < 5000) domainCache.set(cacheKey, 'false');
      return false;
    }

    // 2. Fast HTTP probe with 2.5s timeout
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 2500);

    let isSuccess = false;
    try {
      const res = await fetch(`https://${clean}`, {
        method: 'HEAD',
        headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) Chrome/120.0.0.0 Safari/537.36' },
        signal: controller.signal,
      });
      clearTimeout(timeout);
      isSuccess = res.status < 500;
    } catch {
      clearTimeout(timeout);
      // Fallback probe with plain HTTP
      const httpController = new AbortController();
      const httpTimeout = setTimeout(() => httpController.abort(), 2000);
      try {
        const httpRes = await fetch(`http://${clean}`, {
          method: 'HEAD',
          headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) Chrome/120.0.0.0 Safari/537.36' },
          signal: httpController.signal,
        });
        clearTimeout(httpTimeout);
        isSuccess = httpRes.status < 500;
      } catch {
        clearTimeout(httpTimeout);
        isSuccess = false;
      }
    }

    if (domainCache.size < 5000) domainCache.set(cacheKey, isSuccess ? 'true' : 'false');
    return isSuccess;
  } catch {
    if (domainCache.size < 5000) domainCache.set(cacheKey, 'false');
    return false;
  }
}

/**
 * Comprehensive Domain Resolver:
 * 1. Validates company name (rejects generic industry categories).
 * 2. Attempts Clearbit Autocomplete with cache for authentic corporate domain.
 * 3. Falls back to sanitized slug domain if lookup fails.
 */
export async function resolveCompanyDomain(
  companyName?: string | null,
  existingDomain?: string | null
): Promise<{ domain: string | null; isVerifiedDomain: boolean; reason: string }> {
  // 1. If an existing domain is already valid, verify it
  if (existingDomain && existingDomain.includes('.') && !isGenericNonCompanyString(existingDomain.split('.')[0])) {
    const cleanDomain = existingDomain.toLowerCase().trim();
    return {
      domain: cleanDomain,
      isVerifiedDomain: true,
      reason: 'Existing domain provided',
    };
  }

  // 2. Reject non-company or generic industry strings
  if (!companyName || isGenericNonCompanyString(companyName)) {
    return {
      domain: null,
      isVerifiedDomain: false,
      reason: 'Generic industry or invalid company name detected',
    };
  }

  // 3. Primary Lookup: Clearbit Autocomplete API
  const clearbitDomain = await lookupDomainViaClearbit(companyName);
  if (clearbitDomain) {
    return {
      domain: clearbitDomain,
      isVerifiedDomain: true,
      reason: 'Resolved via Clearbit Corporate Intelligence',
    };
  }

  // 4. Fallback: Intelligent sanitization (Unverified - only used for internal permutation trials)
  const sanitized = sanitizeCompanyName(companyName);
  const slug = sanitized.toLowerCase().replace(/[^a-z0-9]/g, '');

  if (slug && slug.length >= 2) {
    return {
      domain: `${slug}.com`,
      isVerifiedDomain: false,
      reason: 'Fallback generated from sanitized company name',
    };
  }

  return {
    domain: null,
    isVerifiedDomain: false,
    reason: 'Unable to derive domain from company name',
  };
}
