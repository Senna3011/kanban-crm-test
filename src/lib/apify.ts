export interface ApifySearchParams {
  query?: string;
  role?: string;
  location?: string;
  industry?: string;
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

// Map common countries to LinkedIn domain prefixes & ISO country codes
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
    throw new Error('Apify API token belum diatur. Silakan konfigurasikan Apify API Token di menu Outreach Settings.');
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
  if (params.role) searchTerms.push(`"${params.role.trim()}"`);
  if (params.location) searchTerms.push(`"${params.location.trim()}"`);
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
      resultsPerPage: Math.max(limit * 2, 15), // Fetch extra results to allow strict location filtering
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
    .map((item) => ({
      fullName: `${item.firstName || ''} ${item.lastName || ''}`.trim() || item.name || 'LinkedIn Prospect',
      firstName: item.firstName || undefined,
      lastName: item.lastName || undefined,
      jobTitle: item.headline || item.title || item.occupation || 'Executive',
      companyName: item.company || item.companyName || 'Enterprise',
      companyDomain: item.company ? `${item.company.toLowerCase().replace(/[^a-z0-9]/g, '')}.com` : undefined,
      linkedinUrl: item.linkedinUrl || item.profileUrl || undefined,
      location: typeof item.location === 'object' ? item.location.linkedinText || 'Global' : item.location || 'Global',
      email: item.email || (Array.isArray(item.emails) ? item.emails[0] : undefined),
      summary: item.summary || item.about || undefined,
      metadata: { source: 'apify-harvestapi-direct' },
    }));
}

function parseGoogleOrganicToLead(item: any, params: ApifySearchParams): ApifyScrapedLead {
  // Clean raw title
  const rawTitle = (item.title || '').replace(/\s*[-–—|]\s*LinkedIn.*$/i, '').trim();
  const parts = rawTitle.split(/\s*[-–—|]\s*/);

  const fullName = (parts[0] || 'LinkedIn Member')
    .replace(/[\u{1F600}-\u{1F64F}\u{1F300}-\u{1F5FF}\u{1F680}-\u{1F6FF}\u{2600}-\u{26FF}\u{2700}-\u{27BF}]/gu, '')
    .trim() || 'LinkedIn Member';

  const nameParts = fullName.split(' ');
  const firstName = nameParts[0] || 'Prospect';
  const lastName = nameParts.slice(1).join(' ') || '';

  let jobTitle = parts[1] || item.personalInfo?.jobTitle || params.role || 'Executive';
  let companyName = item.personalInfo?.companyName || '';

  // Extract company if mentioned with "at" or "of"
  if (jobTitle.toLowerCase().includes(' at ')) {
    const splitAt = jobTitle.split(/\s+at\s+/i);
    jobTitle = splitAt[0].trim();
    if (!companyName) companyName = splitAt[1].trim();
  } else if (jobTitle.toLowerCase().includes(' of ')) {
    const splitOf = jobTitle.split(/\s+of\s+/i);
    jobTitle = splitOf[0].trim();
    if (!companyName) companyName = splitOf[1].trim();
  }

  // Fallback company extraction from Google snippet description
  if (!companyName && item.description) {
    const match = item.description.match(/(?:at|company:?)\s+([A-Za-z0-9\s&]+?)(?:\.|\s*·|\s*,|Read more)/i);
    if (match && match[1]) {
      companyName = match[1].trim();
    }
  }

  companyName = companyName || params.industry || 'Enterprise Group';
  const cleanCompany = companyName.toLowerCase().replace(/[^a-z0-9]/g, '');
  const companyDomain = cleanCompany ? `${cleanCompany}.com` : 'enterprise.com';

  const cleanUrl = (item.url || '').split('?')[0];

  // Infer location from URL subdomain or search parameters
  let location = params.location || 'Global';
  if (cleanUrl.includes('id.linkedin.com')) {
    location = 'Indonesia';
  } else if (cleanUrl.includes('sg.linkedin.com')) {
    location = 'Singapore';
  } else if (cleanUrl.includes('my.linkedin.com')) {
    location = 'Malaysia';
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
