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

// Known foreign country subdomains to strictly exclude when targeting US/Domestic
const FOREIGN_SUBDOMAINS = [
  'in', 'id', 'pk', 'uk', 'ca', 'au', 'ng', 'sg', 'ph', 'my', 'de', 'fr', 'es',
  'it', 'nl', 'za', 'ke', 'bd', 'ae', 'sa', 'eg', 'br', 'mx', 'ar', 'co', 'cl',
  'ru', 'ua', 'pl', 'se', 'no', 'dk', 'fi', 'nz', 'ie', 'jp', 'kr', 'cn', 'hk', 'tw', 'vn', 'th'
];

const INDIA_LOCATION_KEYWORDS = [
  'india', 'bengaluru', 'bangalore', 'mumbai', 'delhi', 'new delhi', 'hyderabad',
  'pune', 'chennai', 'noida', 'gurgaon', 'gurugram', 'kolkata', 'ahmedabad',
  'jaipur', 'kerala', 'karnataka', 'maharashtra', 'tamil nadu', 'telangana'
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
    locLower.includes('america') ||
    locLower.includes('california') ||
    locLower.includes('new york') ||
    locLower.includes('texas');

  const isTargetingIndonesia =
    locLower.includes('indonesia') ||
    locLower.includes('jakarta') ||
    locLower.includes('surabaya') ||
    locLower.includes('bandung') ||
    locLower.includes('bali');

  const isTargetingSingapore = locLower.includes('singapore');
  const isTargetingUK = locLower.includes('uk') || locLower.includes('united kingdom') || locLower.includes('london');
  const isTargetingAustralia = locLower.includes('australia') || locLower.includes('sydney') || locLower.includes('melbourne');

  // Build targeted search terms
  const searchTerms: string[] = [];
  const roleLower = (params.role || '').toLowerCase().trim();

  if (ROLE_EXPANSIONS[roleLower]) {
    searchTerms.push(ROLE_EXPANSIONS[roleLower]);
  } else if (params.role) {
    searchTerms.push(`"${params.role.trim()}"`);
  }

  // Strict Geo query construction
  let sitePrefix = 'site:linkedin.com/in/';
  let targetCountryCode = 'us';

  if (isTargetingUS) {
    targetCountryCode = 'us';
    // For US, exclude dominant foreign scraping leak subdomains directly in Google query
    sitePrefix = 'site:www.linkedin.com/in/ -site:in.linkedin.com -site:id.linkedin.com -site:pk.linkedin.com -site:ng.linkedin.com';
    searchTerms.push('("United States" OR "Greater" OR "Area" OR "USA")');
  } else if (isTargetingIndonesia) {
    targetCountryCode = 'id';
    sitePrefix = '(site:id.linkedin.com/in/ OR (site:www.linkedin.com/in/ "Indonesia"))';
    searchTerms.push('("Indonesia" OR "Jakarta")');
  } else if (isTargetingSingapore) {
    targetCountryCode = 'sg';
    sitePrefix = '(site:sg.linkedin.com/in/ OR (site:www.linkedin.com/in/ "Singapore"))';
    searchTerms.push('"Singapore"');
  } else if (isTargetingUK) {
    targetCountryCode = 'gb';
    sitePrefix = '(site:uk.linkedin.com/in/ OR (site:www.linkedin.com/in/ "United Kingdom"))';
    searchTerms.push('("United Kingdom" OR "UK" OR "London")');
  } else if (isTargetingAustralia) {
    targetCountryCode = 'au';
    sitePrefix = '(site:au.linkedin.com/in/ OR (site:www.linkedin.com/in/ "Australia"))';
    searchTerms.push('"Australia"');
  } else if (params.location) {
    searchTerms.push(`"${params.location.trim()}"`);
  }

  if (params.industry && !params.industry.toLowerCase().includes('other') && !params.industry.toLowerCase().includes('custom')) {
    searchTerms.push(params.industry.trim());
  }

  if (params.query && !params.role && !params.location) {
    searchTerms.push(params.query.trim());
  }

  const combinedSearch = searchTerms.filter(Boolean).join(' ');
  const googleSearchQuery = `${sitePrefix} ${combinedSearch}`.trim();

  // Call Apify Google Search Scraper with high result buffer to allow strict filtering
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
      resultsPerPage: Math.max(limit * 3, 30), // 3x buffer for strict location filtration
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

  // Strict Post-Scrape Location Validator to eliminate leakage
  const filteredResults = rawLinkedinResults.filter((item) => {
    const url = (item.url || '').toLowerCase();
    const title = (item.title || '').toLowerCase();
    const snippet = (item.description || '').toLowerCase();
    const textContent = `${title} ${snippet}`;

    // 1. If targeting United States: Reject all foreign subdomains & locations
    if (isTargetingUS) {
      for (const sub of FOREIGN_SUBDOMAINS) {
        if (url.includes(`://${sub}.linkedin.com/in/`)) {
          return false;
        }
      }
      for (const kw of INDIA_LOCATION_KEYWORDS) {
        if (textContent.includes(kw)) {
          return false;
        }
      }
      if (textContent.includes('nigeria') || textContent.includes('pakistan') || textContent.includes('bangladesh') || textContent.includes('philippines')) {
        return false;
      }
      return true;
    }

    // 2. If targeting Indonesia: Ensure Indonesian connection
    if (isTargetingIndonesia) {
      if (url.includes('in.linkedin.com') || url.includes('pk.linkedin.com') || url.includes('ng.linkedin.com')) {
        return false;
      }
      if (url.includes('id.linkedin.com')) return true;
      if (textContent.includes('indonesia') || textContent.includes('jakarta') || textContent.includes('surabaya') || textContent.includes('bandung')) {
        return true;
      }
    }

    // 3. If targeting Singapore:
    if (isTargetingSingapore) {
      if (url.includes('in.linkedin.com') || url.includes('id.linkedin.com') || url.includes('pk.linkedin.com')) {
        return false;
      }
      return url.includes('sg.linkedin.com') || textContent.includes('singapore');
    }

    // 4. Default filter: Reject obvious subdomains not matching target
    if (url.includes('in.linkedin.com') && !locLower.includes('india')) return false;
    if (url.includes('id.linkedin.com') && !locLower.includes('indonesia')) return false;
    if (url.includes('pk.linkedin.com') && !locLower.includes('pakistan')) return false;

    return true;
  });

  // Take top items up to requested limit
  const finalResults = (filteredResults.length >= limit ? filteredResults : rawLinkedinResults).slice(0, limit);

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
  let clean = companyName
    .replace(/\b(Inc\.?|Incorporated|LLC|Ltd\.?|Limited|PT\.?|Tbk\.?|Corp\.?|Corporation|GmbH|Co\.?)\b/gi, '')
    .trim();
  clean = clean.toLowerCase().replace(/[^a-z0-9]/g, '');
  if (!clean || clean.length < 2) return undefined;
  return `${clean}.com`;
}

function parseGoogleOrganicToLead(item: any, params: ApifySearchParams, forcedLocation?: string): ApifyScrapedLead {
  // Clean raw title from Google snippet
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

  // Fallback company extraction from Google snippet description
  if (!companyName && item.description) {
    const match = item.description.match(/(?:at|company:?)\s+([A-Za-z0-9\s&,.-]+?)(?:\.|\s*·|\s*,|Read more)/i);
    if (match && match[1]) {
      companyName = match[1].trim();
    }
  }

  companyName = companyName || params.industry || 'Enterprise Group';
  const cleanCompany = companyName.toLowerCase().replace(/[^a-z0-9]/g, '');
  const companyDomain = cleanCompany ? `${cleanCompany}.com` : 'enterprise.com';

  const cleanUrl = (item.url || '').split('?')[0];

  // Infer exact location
  let location = forcedLocation || params.location || 'United States';
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
