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
  'in', 'pk', 'ng', 'bd', 'ru', 'ua'
];

const COMPANY_LEGAL_ENTITY_REGEX = /\b(PT\.?|CV\.?|Inc\.?|LLC|Ltd\.?|Limited|Tbk\.?|Corp\.?|Corporation|Pte\.?|GmbH|Co\.?|Foundation|Yayasan|Universitas|University|Sekolah|School|Bank)\b/i;

/**
 * Validates whether a scraped entity is an authentic individual prospect
 */
function isValidHumanProspect(lead: ApifyScrapedLead): boolean {
  if (!lead || !lead.fullName) return false;
  const nameLower = lead.fullName.toLowerCase().trim();

  // 1. Filter out anonymous / private LinkedIn Member profiles
  if (
    nameLower === 'linkedin member' ||
    nameLower === 'linkedin user' ||
    nameLower === 'member' ||
    nameLower === 'prospect' ||
    nameLower.startsWith('linkedin member')
  ) {
    return false;
  }

  // 2. Filter out company / organizational names (e.g. "PT. Mutiara Empat Gemilang")
  if (COMPANY_LEGAL_ENTITY_REGEX.test(lead.fullName)) {
    return false;
  }

  // 3. Filter out non-person or multi-line strings
  const words = lead.fullName.split(/\s+/).filter(Boolean);
  if (words.length > 5) {
    return false;
  }

  // 4. Filter out non-individual LinkedIn URLs
  if (lead.linkedinUrl) {
    const urlLower = lead.linkedinUrl.toLowerCase();
    if (
      urlLower.includes('/company/') ||
      urlLower.includes('/school/') ||
      urlLower.includes('/showcase/') ||
      urlLower.includes('/pulse/') ||
      urlLower.includes('/posts/') ||
      urlLower.includes('/jobs/')
    ) {
      return false;
    }
  }

  return true;
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

  // Build clean, natural Google Dork search query
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

  // 1. Geographic Filter
  const geoFilteredResults = rawLinkedinResults.filter((item) => {
    const url = (item.url || '').toLowerCase();

    if (isTargetingUS) {
      for (const sub of FOREIGN_SUBDOMAINS) {
        if (url.includes(`://${sub}.linkedin.com/in/`)) return false;
      }
      return true;
    }

    if (isTargetingIndonesia) {
      if (url.includes('in.linkedin.com') || url.includes('pk.linkedin.com')) return false;
      return true;
    }

    return true;
  });

  // 2. Parse candidates and filter out Companies & "LinkedIn Member"
  const candidates = (geoFilteredResults.length > 0 ? geoFilteredResults : rawLinkedinResults)
    .map((item) => parseGoogleOrganicToLead(item, params, isTargetingUS ? 'United States' : undefined))
    .filter(isValidHumanProspect);

  // Return clean verified human prospects (fallback to raw if all filtered)
  const finalCandidates = candidates.length > 0
    ? candidates
    : rawLinkedinResults.map((item) => parseGoogleOrganicToLead(item, params, isTargetingUS ? 'United States' : undefined));

  return finalCandidates.slice(0, limit);
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
    })
    .filter(isValidHumanProspect);
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
    .replace(/,\s*(PhD|MBA|MSc|MD|CPA|PMP|BSc|BA|MA|BEng|MEng|Dr|Ir|SE|MM|ST|SH|S\.Kom|M\.Kom).*$/i, '')
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
