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

function buildDiversifiedDorkQueries(params: OutscraperSearchParams, limit: number): string[] {
  const role = (params.role || 'Executive').trim();
  const roleLower = role.toLowerCase();
  const location = (params.location || 'Indonesia').trim();
  const isIndonesia = location.toLowerCase().includes('indonesia') || location.toLowerCase().includes('jakarta');
  const locFilter = isIndonesia ? '"Indonesia"' : `"${location}"`;
  const indFilter = (params.industry && !params.industry.toLowerCase().includes('all')) ? ` "${params.industry.trim()}"` : '';

  if (params.query) {
    return [
      `site:linkedin.com/in/ ${params.query}`.trim(),
      `site:linkedin.com/in/ "${params.query}"`.trim(),
    ];
  }

  // Generate an expanded list of executive role synonyms for high-volume batches (100 - 1000 leads)
  const roleSynonyms: string[] = [];

  if (roleLower.includes('cto') || roleLower.includes('technology') || roleLower.includes('tech') || roleLower.includes('software')) {
    roleSynonyms.push(
      'CTO',
      'Chief Technology Officer',
      'VP Engineering',
      'Vice President of Engineering',
      'Head of Technology',
      'Head of Engineering',
      'Director of Engineering',
      'Technical Director',
      'Chief Architect',
      'Software Engineering Director',
      'Engineering Manager'
    );
  } else if (roleLower.includes('ceo') || roleLower.includes('founder') || roleLower.includes('owner')) {
    roleSynonyms.push(
      'CEO',
      'Chief Executive Officer',
      'Founder',
      'Co-Founder',
      'Managing Director',
      'President Director',
      'Business Owner',
      'Executive Director'
    );
  } else if (roleLower.includes('cfo') || roleLower.includes('finance')) {
    roleSynonyms.push(
      'CFO',
      'Chief Financial Officer',
      'VP Finance',
      'Finance Director',
      'Head of Finance',
      'Financial Controller'
    );
  } else if (roleLower.includes('cmo') || roleLower.includes('marketing')) {
    roleSynonyms.push(
      'CMO',
      'Chief Marketing Officer',
      'VP Marketing',
      'Head of Marketing',
      'Marketing Director',
      'Growth Marketing Director'
    );
  } else if (roleLower.includes('sales') || roleLower.includes('revenue') || roleLower.includes('commercial')) {
    roleSynonyms.push(
      'VP Sales',
      'Head of Sales',
      'Sales Director',
      'Chief Commercial Officer',
      'Director of Business Development',
      'Head of Commercial'
    );
  } else {
    roleSynonyms.push(role, `Head of ${role}`, `Director of ${role}`, `VP ${role}`, `Lead ${role}`);
  }

  // Small batch (<= 15 leads): single boolean query
  if (limit <= 15) {
    const compactRole = roleSynonyms.slice(0, 3).map((r) => `"${r}"`).join(' OR ');
    return [`site:linkedin.com/in/ (${compactRole}) ${locFilter}${indFilter}`.trim()];
  }

  // Medium to large batch (25 - 1000 leads): multi-angle queries
  const queriesNeeded = Math.min(Math.max(Math.ceil(limit / 15), 2), roleSynonyms.length);
  const selected = roleSynonyms.slice(0, queriesNeeded);

  return selected.map((syn) => `site:linkedin.com/in/ "${syn}" ${locFilter}${indFilter}`.trim());
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
    const match1 = text.match(/(?:at|@|of|company:?)\s+([A-Za-z0-9\s&,.-]+?)(?:\.|\s*·|\s*,|Read more|-|Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec|\d{4})/i);
    if (match1 && match1[1] && match1[1].trim().length > 2) {
      companyName = match1[1].trim();
    } else {
      const segments = text.split(/\s*[.·•|]\s*/);
      for (const seg of segments) {
        const cleanSeg = seg.trim();
        if (
          cleanSeg.length > 2 &&
          cleanSeg.length < 50 &&
          !cleanSeg.includes('http') &&
          !cleanSeg.toLowerCase().includes('information technology') &&
          !cleanSeg.toLowerCase().includes('years') &&
          !cleanSeg.toLowerCase().includes('experience') &&
          !cleanSeg.toLowerCase().includes('connections')
        ) {
          companyName = cleanSeg;
          break;
        }
      }
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

  let directEmail: string | undefined;
  const fullText = `${item.title || ''} ${item.snippet || ''} ${item.description || ''}`;
  const emailMatch = fullText.match(/[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/);
  if (emailMatch) {
    const candidate = emailMatch[0].toLowerCase().trim();
    if (!candidate.endsWith('.png') && !candidate.endsWith('.jpg') && !candidate.includes('wixpress') && !candidate.includes('example.com')) {
      directEmail = candidate;
    }
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
    email: directEmail,
    summary: item.snippet || item.description || `Experienced ${jobTitle} at ${cleanCompany}.`,
    metadata: {
      source: 'outscraper-linkedin-live',
      scrapedAt: new Date().toISOString(),
      displayUrl: item.displayed_link || item.link || undefined,
    },
  };
}

/**
 * High-Speed & High-Volume Personnel Leads Discovery via Outscraper
 * Scales seamlessly from small batches (10 leads) to massive volume (100 - 1000 leads).
 */
export async function scrapeOutscraperLeads(
  params: OutscraperSearchParams
): Promise<ApifyScrapedLead[]> {
  const apiKey =
    params.apiKey ||
    process.env.OUTSCRAPER_API_KEY ||
    process.env.APIFY_API_TOKEN ||
    process.env.APIFY_API_KEY;

  const targetLimit = Math.max(params.limit || 10, 1);

  if (!apiKey) {
    throw new Error('Outscraper API Key is not configured. Please set it in Outreach Settings or .env');
  }

  const queries = buildDiversifiedDorkQueries(params, targetLimit);
  const collectedLeads: ApifyScrapedLead[] = [];
  const seenUrls = new Set<string>();

  // Fetch per query allocation: 25-50 results per query
  const resultsPerQuery = Math.min(Math.max(Math.ceil(targetLimit / queries.length) + 5, 20), 100);

  for (const query of queries) {
    if (collectedLeads.length >= targetLimit) break;

    try {
      const searchUrl = `https://api.app.outscraper.com/google-search?query=${encodeURIComponent(
        query
      )}&limit=${resultsPerQuery}&async=false`;

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
                if (collectedLeads.length >= targetLimit) break;
              }
            }
          }
        }
      }
    } catch (err) {
      console.warn('[OUTSCRAPER HIGH-VOLUME SEARCH ERROR]', err);
    }
  }

  // High-Yield Fallback: If Outscraper queries gave fewer than requested target, backfill via Apify
  if (collectedLeads.length < targetLimit) {
    try {
      const remainingNeeded = targetLimit - collectedLeads.length;
      const apifyLeads = await scrapeApifyLeads({
        query: params.query,
        role: params.role,
        location: params.location,
        industry: params.industry,
        limit: remainingNeeded,
      });

      for (const lead of apifyLeads) {
        const url = lead.linkedinUrl || lead.fullName;
        if (!seenUrls.has(url)) {
          seenUrls.add(url);
          collectedLeads.push(lead);
          if (collectedLeads.length >= targetLimit) break;
        }
      }
    } catch (apifyErr) {
      console.warn('[APIFY HIGH-VOLUME FALLBACK ERROR]', apifyErr);
    }
  }

  return collectedLeads.slice(0, targetLimit);
}

export const scrapeOutscraperBusinessLeads = scrapeOutscraperLeads;
