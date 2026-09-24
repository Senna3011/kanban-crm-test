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

const FOREIGN_SUBDOMAINS = [
  'in', 'id', 'pk', 'uk', 'ca', 'au', 'ng', 'sg', 'ph', 'my', 'de', 'fr', 'es',
  'it', 'nl', 'za', 'ke', 'bd', 'ae', 'sa', 'eg', 'br', 'mx', 'ar', 'co', 'cl',
  'ru', 'ua', 'pl', 'se', 'no', 'dk', 'fi', 'nz', 'ie', 'jp', 'kr', 'cn', 'hk', 'tw', 'vn', 'th'
];

const INDIA_KEYWORDS = [
  'india', 'bengaluru', 'bangalore', 'mumbai', 'delhi', 'hyderabad', 'pune',
  'chennai', 'noida', 'gurgaon', 'gurugram', 'kolkata', 'ahmedabad', 'karnataka', 'maharashtra'
];

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

  const locLower = (params.location || '').toLowerCase().trim();
  const isTargetingUS =
    !params.location ||
    locLower === 'united states' ||
    locLower === 'usa' ||
    locLower === 'us' ||
    locLower.includes('america');

  const isTargetingIndonesia = locLower.includes('indonesia') || locLower.includes('jakarta');
  const isTargetingSingapore = locLower.includes('singapore');
  const isTargetingUK = locLower.includes('uk') || locLower.includes('united kingdom');

  // Build clean, natural search terms without contradictory boolean operators
  const searchTerms: string[] = [];

  if (params.role) {
    searchTerms.push(`"${params.role.trim()}"`);
  }

  if (isTargetingUS) {
    searchTerms.push('"United States"');
  } else if (isTargetingIndonesia) {
    searchTerms.push('"Indonesia"');
  } else if (isTargetingSingapore) {
    searchTerms.push('"Singapore"');
  } else if (isTargetingUK) {
    searchTerms.push('"United Kingdom"');
  } else if (params.location) {
    searchTerms.push(`"${params.location.trim()}"`);
  }

  // Add search query or industry keyword loosely if custom query exists
  if (params.query && !params.role) {
    searchTerms.push(params.query.trim());
  }

  const combinedSearch = searchTerms.filter(Boolean).join(' ');
  const googleSearchQuery = `site:linkedin.com/in/ ${combinedSearch}`.trim();

  // Call Apify Google Search Scraper
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
      countryCode: isTargetingUS ? 'us' : isTargetingIndonesia ? 'id' : isTargetingSingapore ? 'sg' : isTargetingUK ? 'gb' : 'us',
      maxPagesPerQuery: 1,
      resultsPerPage: Math.max(limit * 2, 25),
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

  const rawLinkedinResults = organicResults.filter(
    (item) => item.url && item.url.includes('linkedin.com/in/')
  );

  // Filter results by geography in JavaScript to prevent foreign leakage
  const filteredResults = rawLinkedinResults.filter((item) => {
    const url = (item.url || '').toLowerCase();
    const title = (item.title || '').toLowerCase();
    const snippet = (item.description || '').toLowerCase();
    const text = `${title} ${snippet}`;

    if (isTargetingUS) {
      // Reject any non-US country subdomain
      for (const sub of FOREIGN_SUBDOMAINS) {
        if (url.includes(`://${sub}.linkedin.com/in/`)) return false;
      }
      // Reject any snippet with prominent Indian locations
      for (const kw of INDIA_KEYWORDS) {
        if (text.includes(kw)) return false;
      }
      return true;
    }

    if (isTargetingIndonesia) {
      if (url.includes('in.linkedin.com') || url.includes('pk.linkedin.com')) return false;
      return url.includes('id.linkedin.com') || text.includes('indonesia') || text.includes('jakarta');
    }

    if (isTargetingSingapore) {
      return url.includes('sg.linkedin.com') || text.includes('singapore');
    }

    return true;
  });

  const finalResults = (filteredResults.length > 0 ? filteredResults : rawLinkedinResults).slice(0, limit);

  return finalResults.map((item) => parseGoogleOrganicToLead(item, params, isTargetingUS ? 'United States' : undefined));
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
        companyDomain: company ? `${company.toLowerCase().replace(/[^a-z0-9]/g, '')}.com` : undefined,
        linkedinUrl: item.linkedinUrl || item.profileUrl || undefined,
        location: typeof item.location === 'object' ? item.location.linkedinText || 'Global' : item.location || 'Global',
        email: item.email || (Array.isArray(item.emails) ? item.emails[0] : undefined),
        summary: item.summary || item.about || undefined,
        metadata: { source: 'apify-harvestapi-direct' },
      };
    });
}

function parseGoogleOrganicToLead(item: any, params: ApifySearchParams, forcedLocation?: string): ApifyScrapedLead {
  // Clean raw title
  const rawTitle = (item.title || '')
    .replace(/\s*[-–—|]\s*LinkedIn.*$/i, '')
    .replace(/^LinkedIn\s*[-–—|]\s*/i, '')
    .trim();

  const parts = rawTitle.split(/\s*[-–—|]\s*/);

  const fullName = (parts[0] || 'LinkedIn Member')
    .replace(/[\u{1F600}-\u{1F64F}\u{1F300}-\u{1F5FF}\u{1F680}-\u{1F6FF}\u{2600}-\u{26FF}\u{2700}-\u{27BF}]/gu, '')
    .replace(/,\s*(PhD|MBA|MSc|MD|CPA|PMP|BSc|BA|MA)$/i, '')
    .trim() || 'LinkedIn Member';

  const nameParts = fullName.split(/\s+/);
  const firstName = nameParts[0] || 'Prospect';
  const lastName = nameParts.slice(1).join(' ') || '';

  let jobTitle = parts[1] || item.personalInfo?.jobTitle || params.role || 'Executive';
  let companyName = item.personalInfo?.companyName || '';

  // Extract company if mentioned with " at "
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

  // Snippet description fallback for company
  if (!companyName && item.description) {
    const match = item.description.match(/(?:at|company:?)\s+([A-Za-z0-9\s&,.-]+?)(?:\.|\s*·|\s*,|Read more)/i);
    if (match && match[1]) {
      companyName = match[1].trim();
    }
  }

  companyName = companyName || params.industry || 'Enterprise Group';
  const cleanCompany = companyName.toLowerCase().replace(/[^a-z0-9]/g, '');
  const companyDomain = cleanCompany ? `${cleanCompany}.com` : undefined;

  const cleanUrl = (item.url || '').split('?')[0];

  let location = forcedLocation || params.location || 'United States';
  if (cleanUrl.includes('id.linkedin.com')) {
    location = 'Indonesia';
  } else if (cleanUrl.includes('sg.linkedin.com')) {
    location = 'Singapore';
  } else if (cleanUrl.includes('my.linkedin.com')) {
    location = 'Malaysia';
  } else if (cleanUrl.includes('uk.linkedin.com')) {
    location = 'United Kingdom';
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
