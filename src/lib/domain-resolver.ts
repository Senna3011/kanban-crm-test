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
 * Primary domain lookup via Clearbit Autocomplete API (Free, high-accuracy).
 */
export async function lookupDomainViaClearbit(companyName: string): Promise<string | null> {
  const sanitized = sanitizeCompanyName(companyName);
  if (!sanitized || sanitized.length < 2) return null;

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

    if (!res.ok) return null;

    const data = await res.json();
    if (Array.isArray(data) && data.length > 0 && data[0]?.domain) {
      const resolvedDomain = String(data[0].domain).toLowerCase().trim();
      if (resolvedDomain.includes('.') && !resolvedDomain.includes(' ')) {
        return resolvedDomain;
      }
    }
    return null;
  } catch {
    return null;
  }
}

/**
 * Comprehensive Domain Resolver:
 * 1. Validates company name (rejects generic industry categories).
 * 2. Attempts Clearbit Autocomplete for authentic corporate domain.
 * 3. Falls back to sanitized slug domain if lookup fails.
 */
export async function resolveCompanyDomain(
  companyName?: string | null,
  existingDomain?: string | null
): Promise<{ domain: string | null; isVerifiedDomain: boolean; reason: string }> {
  // 1. If an existing domain is already valid, use it
  if (existingDomain && existingDomain.includes('.') && !isGenericNonCompanyString(existingDomain.split('.')[0])) {
    return {
      domain: existingDomain.toLowerCase().trim(),
      isVerifiedDomain: true,
      reason: 'Existing valid domain provided',
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

  // 4. Fallback: Intelligent sanitization
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
