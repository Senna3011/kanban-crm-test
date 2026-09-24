export interface ApifySearchParams {
  query?: string;
  role?: string;
  location?: string;
  industry?: string;
  seniority?: string;
  limit?: number;
  linkedinUrls?: string[];
  apiToken?: string;
  actorId?: string;
}

export interface ApifyScrapedLead {
  fullName: string;
  firstName?: string;
  lastName?: string;
  jobTitle?: string;
  companyName?: string;
  companyDomain?: string;
  linkedinUrl?: string;
  location?: string;
  email?: string;
  summary?: string;
  metadata?: Record<string, any>;
}

const ROLE_EXPANSIONS: Record<string, string> = {
  'head of it': '("Head of IT" OR "Director of IT" OR "VP of IT" OR "CIO")',
  'head it': '("Head of IT" OR "Director of IT" OR "VP of IT" OR "CIO")',
  'director of it': '("Director of IT" OR "VP of IT" OR "Head of IT" OR "Director of Information Technology")',
  'vp of it': '("VP of IT" OR "Vice President of IT" OR "Director of IT" OR "CIO")',
  'vp of technology': '("VP of Technology" OR "Vice President of Technology" OR "CTO")',
  'cto': '("CTO" OR "Chief Technology Officer" OR "VP of Engineering")',
  'cio': '("CIO" OR "Chief Information Officer" OR "VP of IT" OR "Director of IT")',
  'ceo': '("CEO" OR "Chief Executive Officer" OR "Founder" OR "Co-Founder")',
  'cmo': '("CMO" OR "Chief Marketing Officer" OR "VP of Marketing" OR "Head of Marketing")',
  'head of sales': '("Head of Sales" OR "VP of Sales" OR "Director of Sales")',
  'vp of sales': '("VP of Sales" OR "Vice President of Sales" OR "Head of Sales")',
};

const COUNTRY_GEO_MAP: Record<string, { prefix: string; countryCode: string }> = {
  indonesia: { prefix: 'id.linkedin.com/in/', countryCode: 'id' },
  jakarta: { prefix: 'id.linkedin.com/in/', countryCode: 'id' },
  singapore: { prefix: 'sg.linkedin.com/in/', countryCode: 'sg' },
  malaysia: { prefix: 'my.linkedin.com/in/', countryCode: 'my' },
  philippines: { prefix: 'ph.linkedin.com/in/', countryCode: 'ph' },
  vietnam: { prefix: 'vn.linkedin.com/in/', countryCode: 'vn' },
  thailand: { prefix: 'th.linkedin.com/in/', countryCode: 'th' },
  india: { prefix: 'in.linkedin.com/in/', countryCode: 'in' },
  australia: { prefix: 'au.linkedin.com/in/', countryCode: 'au' },
  'united kingdom': { prefix: 'uk.linkedin.com/in/', countryCode: 'gb' },
  uk: { prefix: 'uk.linkedin.com/in/', countryCode: 'gb' },
  'united states': { prefix: 'linkedin.com/in/', countryCode: 'us' },
  usa: { prefix: 'linkedin.com/in/', countryCode: 'us' },
  us: { prefix: 'linkedin.com/in/', countryCode: 'us' },
  germany: { prefix: 'de.linkedin.com/in/', countryCode: 'de' },
  japan: { prefix: 'jp.linkedin.com/in/', countryCode: 'jp' },
  canada: { prefix: 'ca.linkedin.com/in/', countryCode: 'ca' },
};

export async function scrapeLinkedInProfiles(
  queries: string[],
  limit = 10
): Promise<ApifyScrapedLead[]> {
  return scrapeApifyLeads({ query: queries.join(' '), limit });
}

export async function scrapeApifyLeads(
  params: ApifySearchParams
): Promise<ApifyScrapedLead[]> {
  const token = params.apiToken || process.env.APIFY_API_TOKEN || process.env.APIFY_API_KEY;
  const limit = Math.min(params.limit || 10, 50);

  if (!token) {
    throw new Error('Apify API token is not configured. Please set your Apify Token in Outreach Settings or .env');
  }

  // If direct LinkedIn URLs are passed, scrape them via harvestapi/linkedin-profile-scraper
  if (params.linkedinUrls && params.linkedinUrls.length > 0) {
    return scrapeDirectLinkedInUrls(params.linkedinUrls, token, limit);
  }

  // Detect country-specific geolocation & LinkedIn subdomain
  const locLower = (params.location || '').toLowerCase().trim();
  let countryPrefix = 'linkedin.com/in/';
  let targetCountryCode = 'us';

  for (const [key, geo] of Object.entries(COUNTRY_GEO_MAP)) {
    if (locLower.includes(key)) {
      countryPrefix = geo.prefix;
      targetCountryCode = geo.countryCode;
      break;
    }
  }

  // Build targeted search terms
  const searchTerms: string[] = [];
  const roleLower = (params.role || '').toLowerCase().trim();
  if (ROLE_EXPANSIONS[roleLower]) {
    searchTerms.push(ROLE_EXPANSIONS[roleLower]);
  } else if (params.role) {
    searchTerms.push(`"${params.role.trim()}"`);
  }

  if (params.seniority && params.seniority !== 'ALL') {
    searchTerms.push(`"${params.seniority.trim()}"`);
  }

  if (locLower === 'us' || locLower === 'usa' || locLower === 'united states') {
    searchTerms.push('("United States" OR "USA")');
  } else if (params.location) {
    searchTerms.push(`"${params.location.trim()}"`);
  }

  if (params.industry) searchTerms.push(`"${params.industry.trim()}"`);
  if (params.query && !params.role && !params.location) {
    searchTerms.push(params.query.trim());
  }

  const combinedSearch = searchTerms.filter(Boolean).join(' ');
  const googleSearchQuery = `site:${countryPrefix} ${combinedSearch}`.trim();

  // Call Apify Google Search Scraper with strict geo-targeting
  const actorSlug = 'apify~google-search-scraper';
  const endpoint = `https://api.apify.com/v2/acts/${encodeURIComponent(actorSlug)}/run-sync-get-dataset-items?token=${encodeURIComponent(token)}`;

  const response = await fetch(endpoint, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Accept': 'application/json',
    },
    body: JSON.stringify({
      queries: googleSearchQuery,
      countryCode: targetCountryCode,
      maxPagesPerQuery: 1,
      resultsPerPage: Math.max(limit * 2, 20),
    }),
  });

  if (!response.ok) {
    const errText = await response.text();
    console.error(`[APIFY SEARCH ERROR] ${response.status}: ${errText}`);
    throw new Error(`Apify scraping request failed (${response.status}): ${errText || 'Invalid token or quota exceeded'}`);
  }

  const data = await response.json();
  const organicResults: any[] = Array.isArray(data) && data[0]?.organicResults
    ? data[0].organicResults
    : (Array.isArray(data) ? data : []);

  const linkedinResults = organicResults.filter(
    (item) => item.url && item.url.includes('linkedin.com/in/')
  );

  return linkedinResults.slice(0, limit).map((item) => parseGoogleOrganicToLead(item, params));
}

async function scrapeDirectLinkedInUrls(
  urls: string[],
  token: string,
  limit: number
): Promise<ApifyScrapedLead[]> {
  const actorSlug = 'harvestapi~linkedin-profile-scraper';
  const endpoint = `https://api.apify.com/v2/acts/${encodeURIComponent(actorSlug)}/run-sync-get-dataset-items?token=${encodeURIComponent(token)}`;

  const response = await fetch(endpoint, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      queries: urls.slice(0, limit),
      maxItems: limit,
    }),
  });

  if (!response.ok) {
    throw new Error(`Profile scraper responded with ${response.status}`);
  }

  const items = await response.json();
  if (!Array.isArray(items)) return [];

  return items
    .filter((item) => item && !item.error && item.status !== 404)
    .map((item) => {
      const company = item.company || item.companyName || '';
      return {
        fullName: `${item.firstName || ''} ${item.lastName || ''}`.trim() || item.name || 'LinkedIn Prospect',
        firstName: item.firstName || undefined,
        lastName: item.lastName || undefined,
        jobTitle: item.headline || item.title || item.occupation || 'Executive',
        companyName: company || 'Enterprise Organization',
        companyDomain: company ? cleanCompanyToDomain(company) : undefined,
        linkedinUrl: item.linkedinUrl || item.profileUrl || undefined,
        location: typeof item.location === 'object' ? item.location.linkedinText || 'Global' : item.location || 'Global',
        email: item.email || (Array.isArray(item.emails) ? item.emails[0] : undefined),
        summary: item.summary || item.about || undefined,
        metadata: { source: 'apify-harvestapi-direct' },
      };
    });
}

function cleanCompanyToDomain(companyName: string): string | undefined {
  if (!companyName || typeof companyName !== 'string') return undefined;
  // Strip legal entities
  let clean = companyName
    .replace(/\b(Inc\.?|Incorporated|LLC|Ltd\.?|Limited|PT\.?|Tbk\.?|Corp\.?|Corporation|GmbH|Co\.?)\b/gi, '')
    .trim();
  clean = clean.toLowerCase().replace(/[^a-z0-9]/g, '');
  if (!clean || clean.length < 2) return undefined;
  return `${clean}.com`;
}

function parseGoogleOrganicToLead(item: any, params: ApifySearchParams): ApifyScrapedLead {
  // Clean raw title from Google snippet
  const rawTitle = (item.title || '')
    .replace(/\s*[-–—|]\s*LinkedIn.*$/i, '')
    .replace(/^LinkedIn\s*[-–—|]\s*/i, '')
    .trim();

  const titleSegments = rawTitle.split(/\s*[-–—|]\s*/);

  // Extract Name (Segment 0)
  const fullName = (titleSegments[0] || 'LinkedIn Member')
    .replace(/[\u{1F600}-\u{1F64F}\u{1F300}-\u{1F5FF}\u{1F680}-\u{1F6FF}\u{2600}-\u{26FF}\u{2700}-\u{27BF}]/gu, '')
    .replace(/,\s*(PhD|MBA|MSc|MD|CPA|PMP|BSc|BA|MA)$/i, '')
    .trim() || 'LinkedIn Member';

  const nameParts = fullName.split(/\s+/);
  const firstName = nameParts[0] || 'Prospect';
  const lastName = nameParts.slice(1).join(' ') || '';

  // Extract Job Title & Company from remaining segments
  let jobTitle = titleSegments[1] || item.personalInfo?.jobTitle || params.role || 'Executive';
  let companyName = item.personalInfo?.companyName || '';

  // Guard against splitting phrases like "Head of Product" or "Director of Engineering"
  // Only split on " at " or " @ " when identifying company
  if (jobTitle.includes(' at ')) {
    const splitAt = jobTitle.split(/\s+at\s+/i);
    jobTitle = splitAt[0].trim();
    if (!companyName && splitAt[1]) companyName = splitAt[1].trim();
  } else if (jobTitle.includes(' @ ')) {
    const splitAt = jobTitle.split(/\s+@\s+/);
    jobTitle = splitAt[0].trim();
    if (!companyName && splitAt[1]) companyName = splitAt[1].trim();
  } else if (titleSegments[2] && !companyName) {
    companyName = titleSegments[2].trim();
  }

  // Snippet description fallback for company
  if (!companyName && item.description) {
    const match = item.description.match(/(?:works\s+at|at|company:?)\s+([A-Za-z0-9\s&,.-]+?)(?:\.|\s*·|\s*\|\s*|Read more)/i);
    if (match && match[1]) {
      const candidate = match[1].trim();
      if (candidate.length > 2 && candidate.length < 50) {
        companyName = candidate;
      }
    }
  }

  companyName = companyName || params.industry || 'Enterprise Org';
  const companyDomain = cleanCompanyToDomain(companyName);

  const cleanUrl = (item.url || '').split('?')[0];

  // Infer location
  let location = params.location || 'Global';
  if (cleanUrl.includes('id.linkedin.com')) {
    location = 'Indonesia';
  } else if (cleanUrl.includes('sg.linkedin.com')) {
    location = 'Singapore';
  } else if (cleanUrl.includes('my.linkedin.com')) {
    location = 'Malaysia';
  } else if (cleanUrl.includes('uk.linkedin.com')) {
    location = 'United Kingdom';
  } else if (cleanUrl.includes('au.linkedin.com')) {
    location = 'Australia';
  } else if (item.personalInfo?.location) {
    location = item.personalInfo.location;
  }

  return {
    fullName,
    firstName,
    lastName,
    jobTitle: jobTitle || params.role || 'Executive',
    companyName,
    companyDomain,
    linkedinUrl: cleanUrl,
    location,
    summary: item.description || `Experienced ${jobTitle} at ${companyName}.`,
    metadata: {
      source: 'apify-google-linkedin-live',
      scrapedAt: new Date().toISOString(),
      displayUrl: item.displayedUrl || undefined,
    },
  };
}
