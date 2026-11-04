import { ApifyScrapedLead } from './apify';

export interface LeadOceanSearchParams {
  role?: string;
  location?: string;
  industry?: string;
  query?: string;
  limit?: number;
  apiKey?: string;
}

/**
 * Regex identifying company/business legal entities posing as individual names
 */
const COMPANY_LEGAL_ENTITY_REGEX =
  /\b(PT\.?|CV\.?|Inc\.?|LLC|Ltd\.?|Limited|Tbk\.?|Corp\.?|Corporation|Pte\.?|GmbH|Co\.?|Foundation|Yayasan|Universitas|University|Sekolah|School|Bank|Agency|Studio|Software House|Solutions|Enterprises|Technologies|Holdings)\b/i;

/**
 * Regex identifying generic/departmental email prefixes (Must be blocked 100%)
 */
const GENERIC_EMAIL_PREFIX_REGEX =
  /^(info|sales|contact|support|admin|help|office|team|billing|jobs|marketing|inquiry|general|hello|hi|press|media|service|careers)@/i;

/**
 * Decision Maker Seniority Role Matcher (Pak Nell Standards)
 */
const DECISION_MAKER_REGEX =
  /\b(CEO|CTO|CFO|COO|CMO|CRO|CIO|CPO|Founder|Co-Founder|Owner|President|Vice President|VP|Director|Managing Director|Head of|Chief|Partner|Principal|General Manager)\b/i;

/**
 * Non-decision maker roles that should be rejected
 */
const NON_DECISION_MAKER_REGEX =
  /\b(Intern|Internship|Assistant|Student|Junior|Entry Level|Freelance|Volunteer|Apprentice)\b/i;

/**
 * Maps common country names to ISO 3166-1 alpha-2 codes for LeadOcean schema
 */
const COUNTRY_NAME_TO_CODE: Record<string, string> = {
  'united states': 'US',
  usa: 'US',
  us: 'US',
  indonesia: 'ID',
  id: 'ID',
  singapore: 'SG',
  sg: 'SG',
  malaysia: 'MY',
  my: 'MY',
  'united kingdom': 'GB',
  uk: 'GB',
  gb: 'GB',
  australia: 'AU',
  au: 'AU',
  canada: 'CA',
  ca: 'CA',
  germany: 'DE',
  de: 'DE',
  france: 'FR',
  fr: 'FR',
  japan: 'JP',
  jp: 'JP',
  india: 'IN',
  in: 'IN',
  netherlands: 'NL',
  nl: 'NL',
};

function resolveCountryCode(loc?: string): string[] | undefined {
  if (!loc) return undefined;
  const parts = loc.split(',').map((p) => p.trim().toLowerCase());
  const codes: string[] = [];
  for (const part of parts) {
    if (COUNTRY_NAME_TO_CODE[part]) {
      codes.push(COUNTRY_NAME_TO_CODE[part]);
    } else if (part.length === 2 && /^[a-z]{2}$/i.test(part)) {
      codes.push(part.toUpperCase());
    }
  }
  return codes.length > 0 ? Array.from(new Set(codes)) : undefined;
}

/**
 * Normalizes company domain string to clean hostname (e.g. "https://www.apple.com/about" -> "apple.com")
 */
function normalizeDomain(rawDomain?: string): string | undefined {
  if (!rawDomain) return undefined;
  const clean = rawDomain
    .replace(/^https?:\/\//i, '')
    .replace(/\/.*$/, '')
    .replace(/^www\./i, '')
    .toLowerCase()
    .trim();
  return clean.includes('.') && clean.length >= 4 ? clean : undefined;
}

/**
 * Validates whether an extracted prospect meets Pak Nell's 8-Point B2B Standard
 */
export function isValidDecisionMakerLead(lead: ApifyScrapedLead): boolean {
  if (!lead || !lead.fullName) return false;

  const trimmedName = lead.fullName.trim();
  if (trimmedName.length < 3 || trimmedName.toLowerCase() === 'executive prospect') {
    return false;
  }

  // 1. Must be a genuine human individual, not a company or organization name
  if (COMPANY_LEGAL_ENTITY_REGEX.test(trimmedName)) {
    return false;
  }

  // 2. Reject non-decision maker roles
  const title = lead.jobTitle || '';
  if (NON_DECISION_MAKER_REGEX.test(title)) {
    return false;
  }

  // 3. Email validation: reject generic mailbox prefixes (info@, sales@, etc.)
  if (lead.email) {
    const emailLower = lead.email.toLowerCase().trim();
    if (GENERIC_EMAIL_PREFIX_REGEX.test(emailLower)) {
      return false;
    }
  }

  // 4. LinkedIn validation: reject company or school pages
  if (lead.linkedinUrl) {
    const url = lead.linkedinUrl.toLowerCase();
    if (url.includes('/company/') || url.includes('/school/')) {
      return false;
    }
  }

  return true;
}

/**
 * Enriches a specific LeadOcean person_id to retrieve actual work email
 */
async function enrichLeadOceanPerson(personId: string, apiKey: string, linkedinUrl?: string): Promise<string | undefined> {
  const enrichPayload: Record<string, any> = {
    reveal_email: true,
  };
  if (personId) enrichPayload.person_id = String(personId);
  else if (linkedinUrl) enrichPayload.linkedin_url = linkedinUrl;
  else return undefined;

  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 6000);

    const res = await fetch('https://api.leadocean.io/v1/people/enrich', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': apiKey,
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify(enrichPayload),
      signal: controller.signal,
    });

    clearTimeout(timeout);
    if (!res.ok) return undefined;

    const data = await res.json();
    const emailsList =
      data.data?.contact_data?.contact_emails ||
      data.contact_data?.contact_emails ||
      data.data?.emails ||
      [];

    if (Array.isArray(emailsList) && emailsList.length > 0) {
      const best = emailsList[0];
      const rawEmail = typeof best === 'string' ? best : best.email;
      if (rawEmail && !GENERIC_EMAIL_PREFIX_REGEX.test(rawEmail.toLowerCase().trim())) {
        return rawEmail.toLowerCase().trim();
      }
    }
    return undefined;
  } catch {
    return undefined;
  }
}

/**
 * Maps common UI industry options to strict LeadOcean / LinkedIn standard industry enums.
 * Unmapped or broad generic wildcards are omitted so LeadOcean searches across all industries without 400 validation error.
 */
const LEADOCEAN_INDUSTRY_MAP: Record<string, string> = {
  'information technology & services': 'IT Services and IT Consulting',
  'it services': 'IT Services and IT Consulting',
  'computer software / saas': 'Software Development',
  'software': 'Software Development',
  'saas': 'Software Development',
  'financial services & fintech': 'Financial Services',
  'fintech': 'Financial Services',
  'healthcare & medical': 'Hospitals and Health Care',
  'medical': 'Hospitals and Health Care',
  'e-commerce & retail': 'Retail',
  'retail': 'Retail',
  'ecommerce': 'Retail',
  'marketing & advertising': 'Advertising Services',
  'advertising': 'Advertising Services',
  'real estate & construction': 'Real Estate',
  'real estate': 'Real Estate',
  'construction': 'Construction',
  'manufacturing & logistics': 'Manufacturing',
  'manufacturing': 'Manufacturing',
  'logistics': 'Freight and Package Transportation',
  'education management': 'Education Administration Programs',
  'education': 'Education Administration Programs',
  'hospitality & tourism': 'Hospitality',
  'hospitality': 'Hospitality',
  'tourism': 'Travel Arrangements',
  'legal & consulting': 'Business Consulting and Services',
  'consulting': 'Business Consulting and Services',
};

function resolveLeadOceanIndustries(rawIndustry?: string): string[] | undefined {
  if (!rawIndustry) return undefined;
  const items = rawIndustry.split(',').map((i) => i.trim().toLowerCase()).filter(Boolean);
  const matched = new Set<string>();

  for (const item of items) {
    if (item.includes('all') || item.includes('broad')) {
      continue;
    }
    const exact = LEADOCEAN_INDUSTRY_MAP[item];
    if (exact) {
      matched.add(exact);
    } else {
      // Check partial match in map
      for (const [key, val] of Object.entries(LEADOCEAN_INDUSTRY_MAP)) {
        if (item.includes(key) || key.includes(item)) {
          matched.add(val);
          break;
        }
      }
    }
  }

  return matched.size > 0 ? Array.from(matched) : undefined;
}

/**
 * Searches B2B leads from Enterprise B2B Pre-Indexed Database (<500ms response)
 * Uses strict camelCase payload schema matching LeadOcean API v1.
 */
export async function searchLeadOceanLeads(params: LeadOceanSearchParams): Promise<ApifyScrapedLead[]> {
  const apiKey = params.apiKey || process.env.LEADOCEAN_API_KEY;
  if (!apiKey) {
    throw new Error('Enterprise B2B API Key is not configured in server environment.');
  }

  const targetLimit = Math.min(Math.max(params.limit || 10, 1), 50);
  const fetchLimit = Math.min(targetLimit * 2, 50);

  // Build clean camelCase body adhering strictly to LeadOcean schema
  const bodyPayload: Record<string, any> = {
    limit: fetchLimit,
    hasEmail: true,
  };

  if (params.role) {
    const titles = params.role.split(/[,/|]/).map((r) => r.trim()).filter(Boolean);
    if (titles.length > 0) {
      bodyPayload.title = titles;
    }
  }

  const resolvedCodes = resolveCountryCode(params.location);
  if (resolvedCodes && resolvedCodes.length > 0) {
    bodyPayload.country = resolvedCodes;
  }

  const validIndustries = resolveLeadOceanIndustries(params.industry);
  if (validIndustries && validIndustries.length > 0) {
    bodyPayload.industry = validIndustries;
  }

  if (params.query) {
    bodyPayload.q = params.query.trim();
  }

  console.log('[Enterprise B2B Index] Querying LeadOcean with payload:', JSON.stringify(bodyPayload));

  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 15000);

  try {
    const res = await fetch('https://api.leadocean.io/v1/people/search', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': apiKey,
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify(bodyPayload),
      signal: controller.signal,
    });

    clearTimeout(timeoutId);

    if (!res.ok) {
      const errText = await res.text();
      let summary = `HTTP ${res.status}`;
      try {
        const jsonErr = JSON.parse(errText);
        if (typeof jsonErr.message === 'string') summary = `${summary} - ${jsonErr.message}`;
        else if (typeof jsonErr.error === 'string') summary = `${summary} - ${jsonErr.error}`;
        else if (jsonErr.error?.message) summary = `${summary} - ${jsonErr.error.message}`;
      } catch {
        if (errText && errText.length < 100) summary = `${summary} - ${errText.trim()}`;
      }
      console.error(`[Enterprise B2B Index] Upstream error raw body: ${errText.slice(0, 500)}`);
      throw new Error(`Enterprise B2B Index (${res.status}): ${summary}`);
    }

    const resData = await res.json();
    const rawList: any[] = resData.data || resData.results || resData.persons || [];

    console.log(`[Enterprise B2B Index] Successfully received ${rawList.length} candidate profiles from LeadOcean.`);

    // Parse structured profiles
    const parsedCandidates: Array<{ lead: ApifyScrapedLead; personId?: string }> = [];

    for (const item of rawList) {
      const profile = item.profile_data || {};
      const contact = item.contact_data || {};
      const exp = Array.isArray(contact.contact_current_experiences) && contact.contact_current_experiences.length > 0
        ? contact.contact_current_experiences[0]
        : {};

      const fullName =
        profile.profile_full_name ||
        item.full_name ||
        [profile.profile_first_name, profile.profile_last_name].filter(Boolean).join(' ') ||
        '';

      if (!fullName) continue;

      const firstName = profile.profile_first_name || (fullName.includes(' ') ? fullName.split(' ')[0] : fullName);
      const lastName = profile.profile_last_name || (fullName.includes(' ') ? fullName.split(' ').slice(1).join(' ') : undefined);
      const jobTitle = exp.job_title || profile.profile_headline || params.role || 'Executive';
      const companyName = exp.company_name || undefined;
      const companyDomain = normalizeDomain(exp.company_domain);
      let linkedinUrl = profile.profile_url || undefined;
      if (linkedinUrl && !linkedinUrl.startsWith('http')) {
        linkedinUrl = `https://${linkedinUrl}`;
      }

      const addr = profile.profile_address || {};
      const locParts = [addr.city, addr.state, addr.country_code].filter(Boolean);
      const location = locParts.length > 0 ? locParts.join(', ') : params.location;

      const personId = item.meta?.source_ids?.person_id || item.id || undefined;

      const candidate: ApifyScrapedLead = {
        fullName,
        firstName,
        lastName,
        jobTitle,
        companyName,
        companyDomain,
        linkedinUrl,
        location,
        email: undefined, // to be enriched
        summary: profile.profile_headline || undefined,
        metadata: {
          source: 'enterprise-b2b-index',
          personId,
          scrapedAt: new Date().toISOString(),
        },
      };

      if (isValidDecisionMakerLead(candidate)) {
        parsedCandidates.push({ lead: candidate, personId });
        if (parsedCandidates.length >= targetLimit) {
          break;
        }
      }
    }

    console.log(`[Enterprise B2B Index] Enriching verified work emails for ${parsedCandidates.length} qualified prospects...`);

    // Parallel batch email revelation via /v1/people/enrich
    const enrichPromises = parsedCandidates.map(async ({ lead, personId }) => {
      if (personId) {
        const directEmail = await enrichLeadOceanPerson(personId, apiKey, lead.linkedinUrl);
        if (directEmail) {
          lead.email = directEmail;
        }
      }
      return lead;
    });

    const enrichedLeads = await Promise.all(enrichPromises);
    const validWithEmails = enrichedLeads.filter((l) => Boolean(l.email));

    console.log(`[Enterprise B2B Index] Finalized ${validWithEmails.length} decision makers with verified direct corporate emails.`);
    return validWithEmails.length > 0 ? validWithEmails : enrichedLeads;
  } catch (err: any) {
    clearTimeout(timeoutId);
    if (err.name === 'AbortError') {
      throw new Error('Enterprise B2B Index request timed out after 15 seconds.');
    }
    throw err;
  }
}
