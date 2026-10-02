import { ApifyScrapedLead, scrapeApifyLeads } from './apify';

export interface OutscraperSearchParams {
  query?: string;
  role?: string;
  location?: string;
  industry?: string;
  limit?: number;
  apiKey?: string;
  language?: string;
}

const LEGAL_ENTITY_REGEX = /\b(PT\.?|CV\.?|Inc\.?|LLC|Ltd\.?|Limited|Tbk\.?|Corp\.?|Corporation|Pte\.?|GmbH|Co\.?|Foundation|Yayasan|Agency|Studio|Software House|Konsultan|Consultant|Services|Group|Enterprise)\b/i;

function cleanCorporateName(rawName: string): string {
  if (!rawName) return 'Enterprise Organization';
  return rawName
    .replace(/\s*[-–—|]\s*LinkedIn.*$/i, '')
    .replace(/\s*\|.*$/, '')
    .replace(/\s*-.*PT.*$/i, '')
    .trim();
}

function isValidPersonnelLead(lead: ApifyScrapedLead): boolean {
  if (!lead || !lead.fullName) return false;
  const nameLower = lead.fullName.toLowerCase().trim();

  if (
    nameLower === 'linkedin member' ||
    nameLower === 'linkedin user' ||
    nameLower === 'member' ||
    nameLower === 'prospect' ||
    nameLower.startsWith('linkedin member')
  ) {
    return false;
  }

  if (LEGAL_ENTITY_REGEX.test(lead.fullName)) {
    return false;
  }

  const words = lead.fullName.split(/\s+/).filter(Boolean);
  if (words.length > 5 || words.length < 1) {
    return false;
  }

  return true;
}

function buildOptimizedBooleanDork(params: OutscraperSearchParams): string {
  if (params.query) {
    return `site:linkedin.com/in/ ${params.query}`.trim();
  }

  const role = (params.role || 'Executive').trim();
  const roleLower = role.toLowerCase();
  const location = (params.location || 'Indonesia').trim();
  const isIndonesia = location.toLowerCase().includes('indonesia') || location.toLowerCase().includes('jakarta');
  const industry = (params.industry && !params.industry.toLowerCase().includes('all')) ? params.industry.trim() : '';

  let roleFilter = `"${role}"`;
  if (roleLower.includes('cto') || roleLower.includes('technology') || roleLower.includes('tech')) {
    roleFilter = '(CTO OR "Chief Technology Officer" OR "VP Engineering" OR "Head of Technology")';
  } else if (roleLower.includes('ceo') || roleLower.includes('founder') || roleLower.includes('owner')) {
    roleFilter = '(CEO OR Founder OR "Co-Founder" OR "Managing Director")';
  } else if (roleLower.includes('cfo') || roleLower.includes('finance')) {
    roleFilter = '(CFO OR "Chief Financial Officer" OR "Finance Director")';
  } else if (roleLower.includes('cmo') || roleLower.includes('marketing')) {
    roleFilter = '(CMO OR "Chief Marketing Officer" OR "VP Marketing" OR "Head of Marketing")';
  } else if (roleLower.includes('sales') || roleLower.includes('revenue') || roleLower.includes('business dev')) {
    roleFilter = '("VP Sales" OR "Head of Sales" OR "Sales Director" OR "Business Development")';
  }

  const locFilter = isIndonesia ? '"Indonesia"' : `"${location}"`;
  const indFilter = industry ? ` "${industry}"` : '';

  return `site:linkedin.com/in/ ${roleFilter} ${locFilter}${indFilter}`.trim();
}

function parseGoogleOrganicItem(item: any, params: OutscraperSearchParams): ApifyScrapedLead {
  const rawTitle = (item.title || '')
    .replace(/\s*[-–—|]\s*LinkedIn.*$/i, '')
    .replace(/^LinkedIn\s*[-–—|]\s*/i, '')
    .trim();

  const parts = rawTitle.split(/\s*[-–—|]\s*/);

  const fullName = (parts[0] || 'LinkedIn Member')
    .replace(/[\u{1F600}-\u{1F64F}\u{1F300}-\u{1F5FF}\u{1F680}-\u{1F6FF}\u{2600}-\u{26FF}\u{2700}-\u{27BF}]/gu, '')
    .replace(/,\s*(PhD|MBA|MSc|MD|CPA|PMP|BSc|BA|MA|BEng|MEng|Dr|Ir|SE|MM|ST|SH|S\.Kom|M\.Kom).*$/i, '')
    .trim() || 'LinkedIn Member';

  const nameParts = fullName.split(/\s+/);
  const firstName = nameParts[0] || 'Prospect';
  const lastName = nameParts.slice(1).join(' ') || '';

  let jobTitle = parts[1] || item.jobTitle || params.role || 'Executive';
  let companyName = item.companyName || '';

  if (jobTitle.toLowerCase().includes(' at ')) {
    const splitAt = jobTitle.split(/\s+at\s+/i);
    jobTitle = splitAt[0].trim();
    if (!companyName && splitAt[1]) companyName = splitAt[1].trim();
  } else if (jobTitle.includes(' @ ')) {
    const splitAt = jobTitle.split(/\s+@\s+/);
    jobTitle = splitAt[0].trim();
    if (!companyName && splitAt[1]) companyName = splitAt[1].trim();
  } else if (parts[2] && !companyName) {
    companyName = parts[2].trim();
  }

  if (!companyName && (item.snippet || item.description)) {
    const text = item.snippet || item.description || '';
    const match = text.match(/(?:at|company:?)\s+([A-Za-z0-9\s&,.-]+?)(?:\.|\s*·|\s*,|Read more)/i);
    if (match && match[1]) {
      companyName = match[1].trim();
    }
  }

  companyName = companyName || params.industry || 'Enterprise Group';
  const cleanCompany = cleanCorporateName(companyName);
  const companySlug = cleanCompany.toLowerCase().replace(/[^a-z0-9]/g, '');
  const companyDomain = companySlug ? `${companySlug}.com` : undefined;

  const url = item.link || item.url || '';
  const cleanUrl = url.split('?')[0];

  let location = params.location || 'Indonesia';
  if (cleanUrl.includes('id.linkedin.com')) {
    location = 'Indonesia';
  } else if (cleanUrl.includes('sg.linkedin.com')) {
    location = 'Singapore';
  } else if (cleanUrl.includes('my.linkedin.com')) {
    location = 'Malaysia';
  } else if (cleanUrl.includes('uk.linkedin.com')) {
    location = 'United Kingdom';
  } else if (cleanUrl.includes('in.linkedin.com')) {
    location = 'India';
  }

  return {
    fullName,
    firstName,
    lastName,
    jobTitle: jobTitle || params.role || 'Executive',
    companyName: cleanCompany,
    companyDomain,
    linkedinUrl: cleanUrl,
    location,
    summary: item.snippet || item.description || `Experienced ${jobTitle} at ${cleanCompany}.`,
    metadata: {
      source: 'outscraper-linkedin-live',
      scrapedAt: new Date().toISOString(),
      displayUrl: item.displayed_link || item.link || undefined,
    },
  };
}

/**
 * High-Speed & High-Accuracy Personnel Leads Discovery via Outscraper
 * Uses single high-yield Boolean SERP query to eliminate multi-roundtrip delay.
 */
export async function scrapeOutscraperLeads(
  params: OutscraperSearchParams
): Promise<ApifyScrapedLead[]> {
  const apiKey =
    params.apiKey ||
    process.env.OUTSCRAPER_API_KEY ||
    process.env.APIFY_API_TOKEN ||
    process.env.APIFY_API_KEY;

  const limit = Math.min(params.limit || 10, 50);

  if (!apiKey) {
    throw new Error('Outscraper API Key is not configured. Please set it in Outreach Settings or .env');
  }

  // 1. Generate Single High-Density Boolean Query
  const dorkQuery = buildOptimizedBooleanDork(params);
  // Optimal fetch limit: small buffer (+5) to stay within fast single-page render
  const fetchLimit = Math.min(Math.max(limit + 5, 15), 50);

  const collectedLeads: ApifyScrapedLead[] = [];
  const seenUrls = new Set<string>();

  try {
    const searchUrl = `https://api.app.outscraper.com/google-search?query=${encodeURIComponent(
      dorkQuery
    )}&limit=${fetchLimit}&async=false`;

    const res = await fetch(searchUrl, {
      method: 'GET',
      headers: {
        'X-API-KEY': apiKey,
        Accept: 'application/json',
      },
    });

    if (res.ok) {
      const data = await res.json();
      const rawResults: any[] = Array.isArray(data?.data) ? data.data.flat() : [];

      const items: any[] = [];
      for (const entry of rawResults) {
        if (entry?.organic_results && Array.isArray(entry.organic_results)) {
          items.push(...entry.organic_results);
        } else if (entry?.link || entry?.url || entry?.title) {
          items.push(entry);
        }
      }

      for (const item of items) {
        const itemUrl = item.link || item.url || '';
        if (itemUrl.includes('linkedin.com/in/')) {
          const cleanUrl = itemUrl.split('?')[0];
          if (!seenUrls.has(cleanUrl)) {
            seenUrls.add(cleanUrl);
            const lead = parseGoogleOrganicItem(item, params);
            if (isValidPersonnelLead(lead)) {
              collectedLeads.push(lead);
              if (collectedLeads.length >= limit) break;
            }
          }
        }
      }
    }
  } catch (err) {
    console.warn('[OUTSCRAPER FAST SEARCH ERROR]', err);
  }

  // 2. High-Speed Fallback: Only invoke Apify if Outscraper gave fewer than requested limit
  if (collectedLeads.length < limit) {
    try {
      const apifyLeads = await scrapeApifyLeads({
        query: params.query,
        role: params.role,
        location: params.location,
        industry: params.industry,
        limit: limit - collectedLeads.length,
      });

      for (const lead of apifyLeads) {
        const url = lead.linkedinUrl || lead.fullName;
        if (!seenUrls.has(url)) {
          seenUrls.add(url);
          collectedLeads.push(lead);
          if (collectedLeads.length >= limit) break;
        }
      }
    } catch (apifyErr) {
      console.warn('[APIFY FALLBACK ERROR]', apifyErr);
    }
  }

  return collectedLeads.slice(0, limit);
}

export const scrapeOutscraperBusinessLeads = scrapeOutscraperLeads;
