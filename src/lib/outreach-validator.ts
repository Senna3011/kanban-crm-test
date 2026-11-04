import { ApifyScrapedLead } from './apify';

/**
 * Regex identifying company/business legal entities posing as individual names
 */
const COMPANY_LEGAL_ENTITY_REGEX =
  /\b(PT\.?|CV\.?|Inc\.?|LLC|Ltd\.?|Limited|Tbk\.?|Corp\.?|Corporation|Pte\.?|GmbH|Co\.?|Foundation|Yayasan|Universitas|University|Sekolah|School|Bank|Agency|Studio|Software House|Solutions|Enterprises|Technologies|Holdings)\b/i;

/**
 * Regex identifying generic/departmental email prefixes (Must be blocked 100%)
 */
const GENERIC_EMAIL_PREFIX_REGEX =
  /^(info|sales|contact|support|admin|help|office|team|billing|jobs|marketing|inquiry|general|hello|hi|press|media|service|careers|vendors?|invoices?|accounts?|procurement|finance|legal|security|hr|recruiting)@/i;

/**
 * Decision Maker Seniority Role Matcher (Pak Nell Standards)
 */
export const DECISION_MAKER_REGEX =
  /\b(CEO|CTO|CFO|COO|CMO|CRO|CIO|CPO|Founder|Co-Founder|Owner|President|Vice President|VP|Director|Managing Director|Head of|Chief|Partner|Principal|General Manager)\b/i;

/**
 * Non-decision maker roles that should be rejected
 */
const NON_DECISION_MAKER_REGEX =
  /\b(Intern|Internship|Assistant|Student|Junior|Entry Level|Freelance|Volunteer|Apprentice)\b/i;

/**
 * Normalizes company domain string to clean hostname (e.g. "https://www.apple.com/about" -> "apple.com")
 */
export function normalizeCompanyDomain(rawDomain?: string): string | undefined {
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

  // Reject single-letter last names or truncated initials (e.g. "Candice K.", "John D.")
  if (lead.lastName && lead.lastName.replace(/[^a-zA-Z]/g, '').length <= 1) {
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
