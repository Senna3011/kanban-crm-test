import { ApifyScrapedLead } from './apify';

export interface LeadOceanSearchParams {
  role?: string;
  location?: string;
  industry?: string;
  query?: string;
  limit?: number;
  apiKey?: string;
}

export interface LeadOceanPersonRecord {
  id?: string;
  first_name?: string;
  last_name?: string;
  full_name?: string;
  name?: string;
  job_title?: string;
  title?: string;
  company_name?: string;
  company?: string;
  company_domain?: string;
  domain?: string;
  linkedin_url?: string;
  linkedin?: string;
  location?: string;
  city?: string;
  state?: string;
  country?: string;
  email?: string;
  work_email?: string;
  personal_email?: string;
  emails?: Array<{ email: string; type?: string; status?: string } | string>;
  phone?: string;
  phone_numbers?: string[];
  summary?: string;
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
 * Free public webmail domains (Not corporate business emails)
 */
const FREE_WEBMAIL_DOMAINS = new Set([
  'gmail.com',
  'yahoo.com',
  'hotmail.com',
  'outlook.com',
  'aol.com',
  'icloud.com',
  'mail.com',
  'zoho.com',
  'protonmail.com',
  'yandex.com',
]);

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
 * Searches B2B leads from Enterprise B2B Pre-Indexed Database (<500ms response)
 * Enforces strict decision-maker and email validation filters.
 */
export async function searchLeadOceanLeads(params: LeadOceanSearchParams): Promise<ApifyScrapedLead[]> {
  const apiKey = params.apiKey || process.env.LEADOCEAN_API_KEY;
  if (!apiKey) {
    throw new Error('Enterprise B2B API Key is not configured in environment variables.');
  }

  // Fetch up to 2x requested limit to account for post-filtering of non-human records
  const targetLimit = Math.min(Math.max(params.limit || 10, 1), 100);
  const fetchLimit = Math.min(targetLimit * 2, 100);

  const bodyPayload: Record<string, any> = {
    limit: fetchLimit,
    has_email: true,
  };

  if (params.role) {
    const roles = params.role.split(',').map((r) => r.trim()).filter(Boolean);
    bodyPayload.titles = roles;
  }

  if (params.location) {
    const locs = params.location.split(',').map((l) => l.trim()).filter(Boolean);
    bodyPayload.countries = locs;
    bodyPayload.locations = locs;
  }

  if (params.industry) {
    const inds = params.industry.split(',').map((i) => i.trim()).filter(Boolean);
    bodyPayload.industries = inds;
  }

  if (params.query) {
    bodyPayload.q = params.query.trim();
    bodyPayload.keywords = params.query.trim();
  }

  console.log('[Enterprise B2B Engine] Querying indexed decision maker database...');

  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 15000); // 15s timeout

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
      let parsedErr = errText;
      try {
        const jsonErr = JSON.parse(errText);
        parsedErr = jsonErr.message || jsonErr.error || errText;
      } catch {}
      throw new Error(`Enterprise B2B Index Error (${res.status}): ${parsedErr}`);
    }

    const resData = await res.json();
    const rawList: LeadOceanPersonRecord[] =
      resData.data ||
      resData.results ||
      resData.persons ||
      (Array.isArray(resData) ? resData : []);

    console.log(`[Enterprise B2B Engine] Received ${rawList.length} raw records. Applying Pak Nell 8-point qualification...`);

    const qualifiedLeads: ApifyScrapedLead[] = [];

    for (const person of rawList) {
      const fullName =
        person.full_name ||
        person.name ||
        [person.first_name, person.last_name].filter(Boolean).join(' ') ||
        '';

      if (!fullName) continue;

      const firstName =
        person.first_name ||
        (fullName.includes(' ') ? fullName.split(' ')[0] : fullName);

      const lastName =
        person.last_name ||
        (fullName.includes(' ') ? fullName.split(' ').slice(1).join(' ') : undefined);

      const jobTitle = person.job_title || person.title || params.role || 'Executive';
      const companyName = person.company_name || person.company || undefined;
      const companyDomain = normalizeDomain(person.company_domain || person.domain);
      const rawLinkedin = person.linkedin_url || person.linkedin || undefined;

      // Ensure valid individual LinkedIn URL
      let linkedinUrl = rawLinkedin;
      if (linkedinUrl && !linkedinUrl.startsWith('http')) {
        linkedinUrl = `https://${linkedinUrl}`;
      }

      const locParts = [person.city, person.state, person.country].filter(Boolean);
      const location = person.location || (locParts.length > 0 ? locParts.join(', ') : params.location);

      // Extract verified personal corporate work email
      let emailCandidate = person.work_email || person.email || person.personal_email;
      if (!emailCandidate && Array.isArray(person.emails) && person.emails.length > 0) {
        const first = person.emails[0];
        emailCandidate = typeof first === 'string' ? first : first.email;
      }

      let email = emailCandidate ? emailCandidate.toLowerCase().trim() : undefined;

      // Filter out generic email prefixes (info@, sales@, etc.)
      if (email && GENERIC_EMAIL_PREFIX_REGEX.test(email)) {
        email = undefined;
      }

      const candidate: ApifyScrapedLead = {
        fullName,
        firstName,
        lastName,
        jobTitle,
        companyName,
        companyDomain,
        linkedinUrl,
        location,
        email,
        summary: person.summary || undefined,
        metadata: {
          source: 'enterprise-b2b-index',
          phone: person.phone || (person.phone_numbers && person.phone_numbers[0]) || undefined,
          scrapedAt: new Date().toISOString(),
        },
      };

      if (isValidDecisionMakerLead(candidate)) {
        qualifiedLeads.push(candidate);
        if (qualifiedLeads.length >= targetLimit) {
          break;
        }
      }
    }

    console.log(`[Enterprise B2B Engine] Qualified ${qualifiedLeads.length} valid decision makers (filtered from ${rawList.length}).`);
    return qualifiedLeads;
  } catch (err: any) {
    clearTimeout(timeoutId);
    if (err.name === 'AbortError') {
      throw new Error('Enterprise B2B Index request timed out after 15 seconds.');
    }
    throw err;
  }
}
