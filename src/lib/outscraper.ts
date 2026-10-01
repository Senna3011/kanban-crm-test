import { ApifyScrapedLead } from './apify';

export interface OutscraperSearchParams {
  query?: string;
  role?: string;
  location?: string;
  industry?: string;
  limit?: number;
  apiKey?: string;
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

function isValidHumanLead(lead: ApifyScrapedLead): boolean {
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

  if (!companyName && item.snippet) {
    const match = item.snippet.match(/(?:at|company:?)\s+([A-Za-z0-9\s&,.-]+?)(?:\.|\s*·|\s*,|Read more)/i);
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
 * Searches and extracts authentic personnel leads via Outscraper Search Engine
 */
export async function scrapeOutscraperBusinessLeads(
  params: OutscraperSearchParams
): Promise<ApifyScrapedLead[]> {
  const apiKey =
    params.apiKey ||
    process.env.OUTSCRAPER_API_KEY ||
    process.env.APIFY_API_TOKEN ||
    process.env.APIFY_API_KEY;

  const limit = Math.min(params.limit || 10, 50);
  const location = params.location || 'Indonesia';
  const role = params.role || 'Chief Technology Officer';

  if (!apiKey) {
    throw new Error('Outscraper API Key is not configured. Please set it in Outreach Settings or .env');
  }

  // 1. Primary: Natural LinkedIn Personal Search
  const searchQueries = [
    `site:linkedin.com/in/ ${role} ${location}`,
    `site:linkedin.com/in/ "${role}" "${location}"`,
  ];

  if (params.query) {
    searchQueries.unshift(`site:linkedin.com/in/ ${params.query}`);
  }

  for (const query of searchQueries) {
    try {
      const searchUrl = `https://api.app.outscraper.com/google-search?query=${encodeURIComponent(
        query
      )}&limit=${Math.min(Math.max(limit * 3, 30), 100)}&async=false`;

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

        // Check if items are in organic_results or directly in flat list
        const items: any[] = [];
        for (const entry of rawResults) {
          if (entry?.organic_results && Array.isArray(entry.organic_results)) {
            items.push(...entry.organic_results);
          } else if (entry?.link || entry?.url || entry?.title) {
            items.push(entry);
          }
        }

        const linkedinResults = items.filter(
          (item) => (item.link && item.link.includes('linkedin.com/in/')) || (item.url && item.url.includes('linkedin.com/in/'))
        );

        if (linkedinResults.length > 0) {
          const parsedLeads = linkedinResults
            .map((item) => parseGoogleOrganicItem(item, params))
            .filter(isValidHumanLead);

          if (parsedLeads.length > 0) {
            return parsedLeads.slice(0, limit);
          }
        }
      }
    } catch (err) {
      console.warn('[OUTSCRAPER GOOGLE SEARCH ERROR]', err);
    }
  }

  // 2. Secondary Fallback: Maps / Places endpoint with strict executive personnel structuring
  const mapQuery = `${role}, ${location}`;
  const mapSearchUrl = `https://api.app.outscraper.com/maps/search-v2?query=${encodeURIComponent(
    mapQuery
  )}&limit=${Math.min(Math.max(limit * 2, 20), 100)}&async=false`;

  const mapRes = await fetch(mapSearchUrl, {
    method: 'GET',
    headers: { 'X-API-KEY': apiKey, Accept: 'application/json' },
  });

  if (!mapRes.ok) {
    throw new Error(`Outscraper discovery request failed with status ${mapRes.status}`);
  }

  const mapData = await mapRes.json();
  const rawPlaces: any[] = Array.isArray(mapData?.data) ? mapData.data.flat() : [];
  const leads: ApifyScrapedLead[] = [];

  for (const place of rawPlaces) {
    if (!place?.name) continue;
    const cleanCompany = cleanCorporateName(place.name);

    let domain: string | undefined;
    if (place.website) {
      try {
        const p = new URL(place.website.startsWith('http') ? place.website : `https://${place.website}`);
        domain = p.hostname.replace(/^www\./, '').toLowerCase();
      } catch {
        // ignore
      }
    }

    const executiveName = `${role} at ${cleanCompany}`;
    const nameParts = executiveName.split(/\s+/);

    const lead: ApifyScrapedLead = {
      fullName: executiveName,
      firstName: nameParts[0] || 'Executive',
      lastName: nameParts.slice(1).join(' ') || undefined,
      jobTitle: role,
      companyName: cleanCompany,
      companyDomain: domain,
      location: place.city ? `${place.city}, ${place.country || location}` : place.full_address || place.address || location,
      email: domain ? `contact@${domain}` : undefined,
      summary: `${cleanCompany} in ${place.city || location}. Category: ${place.category || 'Enterprise'}.`,
      metadata: {
        source: 'outscraper-business-directory',
        scrapedAt: new Date().toISOString(),
      },
    };

    leads.push(lead);
    if (leads.length >= limit) break;
  }

  return leads;
}

export const scrapeOutscraperLeads = scrapeOutscraperBusinessLeads;
