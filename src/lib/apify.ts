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

  // If direct LinkedIn URLs are passed, scrape them via harvestapi/linkedin-profile-scraper
  if (params.linkedinUrls && params.linkedinUrls.length > 0 && token) {
    return scrapeDirectLinkedInUrls(params.linkedinUrls, token, limit);
  }

  // Build targeted search terms
  const searchTerms: string[] = [];
  if (params.query) searchTerms.push(params.query);
  if (params.role) searchTerms.push(`"${params.role}"`);
  if (params.location) searchTerms.push(`"${params.location}"`);
  if (params.industry) searchTerms.push(`"${params.industry}"`);

  const combinedSearch = searchTerms.filter(Boolean).join(' ');
  const googleSearchQuery = `site:linkedin.com/in/ ${combinedSearch}`.trim();

  if (!token) {
    console.warn('[APIFY] No APIFY_API_TOKEN found. Using dynamic preview leads.');
    return generateFallbackApifyLeads(combinedSearch, limit, params.role, params.location, params.industry);
  }

  try {
    // Call Apify Google Search Scraper to discover REAL active LinkedIn Profiles
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
        maxPagesPerQuery: 1,
        resultsPerPage: limit,
      }),
    });

    if (!response.ok) {
      const errText = await response.text();
      console.error(`[APIFY SEARCH ERROR] ${response.status}: ${errText}`);
      return generateFallbackApifyLeads(combinedSearch, limit, params.role, params.location, params.industry);
    }

    const data = await response.json();
    const organicResults: any[] = Array.isArray(data) && data[0]?.organicResults
      ? data[0].organicResults
      : (Array.isArray(data) ? data : []);

    const linkedinResults = organicResults.filter(
      (item) => item.url && item.url.includes('linkedin.com/in/')
    );

    if (linkedinResults.length === 0) {
      console.info('[APIFY] No direct search results returned from Google scraper. Using fallback leads.');
      return generateFallbackApifyLeads(combinedSearch, limit, params.role, params.location, params.industry);
    }

    return linkedinResults.slice(0, limit).map((item) => parseGoogleOrganicToLead(item, params));
  } catch (error: any) {
    console.error('[APIFY] Scraping exception:', error.message || error);
    return generateFallbackApifyLeads(combinedSearch, limit, params.role, params.location, params.industry);
  }
}

async function scrapeDirectLinkedInUrls(
  urls: string[],
  token: string,
  limit: number
): Promise<ApifyScrapedLead[]> {
  try {
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
  } catch (e: any) {
    console.error('[APIFY DIRECT SCRAPE ERROR]', e);
    return [];
  }
}

function parseGoogleOrganicToLead(item: any, params: ApifySearchParams): ApifyScrapedLead {
  // Title usually: "Full Name - Job Title at Company ... - LinkedIn" or "Full Name - Job Title | LinkedIn"
  const rawTitle = (item.title || '').replace(/\s*[-–—|]\s*LinkedIn.*$/i, '').trim();
  const parts = rawTitle.split(/\s*[-–—|]\s*/);

  const fullName = (parts[0] || 'LinkedIn Member').replace(/[\u{1F600}-\u{1F64F}\u{1F300}-\u{1F5FF}\u{1F680}-\u{1F6FF}\u{2600}-\u{26FF}\u{2700}-\u{27BF}]/gu, '').trim() || 'LinkedIn Member';
  const nameParts = fullName.split(' ');
  const firstName = nameParts[0] || 'Prospect';
  const lastName = nameParts.slice(1).join(' ') || '';

  let jobTitle = parts[1] || item.personalInfo?.jobTitle || params.role || 'Executive';
  let companyName = item.personalInfo?.companyName || '';

  // Check if title has "at Company" or "of Company"
  if (jobTitle.toLowerCase().includes(' at ')) {
    const splitAt = jobTitle.split(/\s+at\s+/i);
    jobTitle = splitAt[0].trim();
    if (!companyName) companyName = splitAt[1].trim();
  } else if (jobTitle.toLowerCase().includes(' of ')) {
    const splitOf = jobTitle.split(/\s+of\s+/i);
    jobTitle = splitOf[0].trim();
    if (!companyName) companyName = splitOf[1].trim();
  }

  // Fallback company from description if still empty
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

  return {
    fullName,
    firstName,
    lastName,
    jobTitle: jobTitle || params.role || 'Executive',
    companyName,
    companyDomain,
    linkedinUrl: cleanUrl,
    location: item.personalInfo?.location || params.location || 'Global',
    summary: item.description || `Experienced ${jobTitle} at ${companyName}.`,
    metadata: {
      source: 'apify-google-linkedin-live',
      scrapedAt: new Date().toISOString(),
      displayUrl: item.displayedUrl || undefined,
    },
  };
}

function generateFallbackApifyLeads(
  query: string,
  count: number,
  role?: string,
  location?: string,
  industry?: string
): ApifyScrapedLead[] {
  const firstNames = ['David', 'Sarah', 'Alex', 'Elena', 'Marcus', 'Jessica', 'Jonathan', 'Amira', 'Robert', 'Chloe'];
  const lastNames = ['Miller', 'Jenkins', 'Rivera', 'Rostova', 'Sterling', 'Vance', 'Hayward', 'Nasser', 'Chen', 'Dupont'];
  const companies = [
    { name: 'Apex Global Corp', domain: 'apexglobal.com' },
    { name: 'Nexis Media Group', domain: 'nexismedia.com' },
    { name: 'Veritas Financial', domain: 'veritasfin.com' },
    { name: 'AeroCloud Solutions', domain: 'aerocloud.io' },
    { name: 'Sterling Capital Partners', domain: 'sterlingcap.com' },
  ];

  return Array.from({ length: count }).map((_, i) => {
    const fName = firstNames[i % firstNames.length];
    const lName = lastNames[i % lastNames.length];
    const comp = companies[i % companies.length];
    const jobTitle = role || 'Executive Leader';

    return {
      fullName: `${fName} ${lName}`,
      firstName: fName,
      lastName: lName,
      jobTitle,
      companyName: comp.name,
      companyDomain: comp.domain,
      linkedinUrl: `https://www.linkedin.com/search/results/people/?keywords=${encodeURIComponent(`${fName} ${lName} ${comp.name}`)}`,
      location: location || 'Global',
      summary: `Experienced ${jobTitle} at ${comp.name}.`,
      metadata: { source: 'preview' },
    };
  });
}
