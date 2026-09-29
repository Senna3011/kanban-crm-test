export interface ApifySearchParams {
  query?: string;
  role?: string;
  location?: string;
  industry?: string;
  limit?: number;
  linkedinUrls?: string[];
  apiToken?: string;
  actorId?: string;
  onProgress?: (progress: { fetched: number; target: number; status: string }) => void;
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

const FOREIGN_SUBDOMAINS = ['in', 'pk', 'ng', 'bd', 'ru', 'ua'];

const COMPANY_LEGAL_ENTITY_REGEX = /\b(PT\.?|CV\.?|Inc\.?|LLC|Ltd\.?|Limited|Tbk\.?|Corp\.?|Corporation|Pte\.?|GmbH|Co\.?|Foundation|Yayasan|Universitas|University|Sekolah|School|Bank)\b/i;

/**
 * Validates whether a scraped entity is an authentic individual prospect
 */
export function isValidHumanProspect(lead: ApifyScrapedLead): boolean {
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

  // 2. Filter out company / organizational names
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

/**
 * Fetches all dataset items with chunked pagination (1,000 items/page) to prevent memory & network timeouts
 */
async function fetchAllDatasetItems(
  datasetId: string,
  token: string,
  targetLimit: number,
  onProgress?: (progress: { fetched: number; target: number; status: string }) => void
): Promise<any[]> {
  const items: any[] = [];
  const pageSize = Math.min(targetLimit, 1000);
  let offset = 0;

  while (items.length < targetLimit) {
    const fetchLimit = Math.min(pageSize, targetLimit - items.length);
    const url = `https://api.apify.com/v2/datasets/${encodeURIComponent(datasetId)}/items?token=${encodeURIComponent(token)}&offset=${offset}&limit=${fetchLimit}&clean=true`;

    const res = await fetch(url, { headers: { Accept: 'application/json' } });
    if (!res.ok) {
      console.warn(`[Apify Dataset] Fetch chunk failed at offset ${offset}: ${res.status}`);
      break;
    }

    const chunk = await res.json();
    if (!Array.isArray(chunk) || chunk.length === 0) {
      break;
    }

    items.push(...chunk);
    offset += chunk.length;

    if (onProgress) {
      onProgress({
        fetched: items.length,
        target: targetLimit,
        status: `Retrieved ${items.length}/${targetLimit} items from dataset...`,
      });
    }

    if (chunk.length < fetchLimit) {
      break;
    }
  }

  return items;
}

/**
 * Runs an Apify actor asynchronously, polls for completion, and returns the dataset ID
 */
async function runActorAsync(
  actorSlug: string,
  input: Record<string, any>,
  token: string,
  timeoutSec = 300,
  onProgress?: (progress: { fetched: number; target: number; status: string }) => void
): Promise<string> {
  const startUrl = `https://api.apify.com/v2/acts/${encodeURIComponent(actorSlug)}/runs?token=${encodeURIComponent(token)}`;
  const startRes = await fetch(startUrl, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(input),
  });

  if (!startRes.ok) {
    const err = await startRes.text();
    throw new Error(`Failed to start Apify actor ${actorSlug} (${startRes.status}): ${err}`);
  }

  const runData = await startRes.json();
  const runId = runData.data?.id;
  const defaultDatasetId = runData.data?.defaultDatasetId;

  if (!runId) {
    throw new Error('Apify did not return a valid run ID');
  }

  const startTime = Date.now();
  const pollIntervalMs = 3000;

  while (Date.now() - startTime < timeoutSec * 1000) {
    await new Promise((resolve) => setTimeout(resolve, pollIntervalMs));

    const pollUrl = `https://api.apify.com/v2/actor-runs/${encodeURIComponent(runId)}?token=${encodeURIComponent(token)}`;
    const pollRes = await fetch(pollUrl);
    if (!pollRes.ok) continue;

    const pollJson = await pollRes.json();
    const status = pollJson.data?.status;

    if (onProgress) {
      onProgress({
        fetched: 0,
        target: 0,
        status: `Apify Actor ${actorSlug} status: ${status}...`,
      });
    }

    if (status === 'SUCCEEDED') {
      return pollJson.data.defaultDatasetId || defaultDatasetId;
    }

    if (status === 'FAILED' || status === 'ABORTED' || status === 'TIMED-OUT') {
      throw new Error(`Apify Actor ${actorSlug} ended with status: ${status}`);
    }
  }

  throw new Error(`Apify Actor ${actorSlug} timed out after ${timeoutSec}s`);
}

/**
 * Executes a search run against Google Search Scraper Actor (supports sync for small and async for bulk)
 */
async function executeGoogleSearchScraper(
  query: string,
  countryCode: string,
  limit: number,
  token: string,
  onProgress?: (progress: { fetched: number; target: number; status: string }) => void
): Promise<any[]> {
  const actorSlug = 'apify~google-search-scraper';
  const maxPages = Math.min(Math.max(Math.ceil(limit / 10), 1), 100);
  const resultsPerPage = Math.min(Math.max(limit, 25), 100);

  // Fast synchronous path for small limits (<= 50)
  if (limit <= 50) {
    const endpoint = `https://api.apify.com/v2/acts/${encodeURIComponent(actorSlug)}/run-sync-get-dataset-items?token=${encodeURIComponent(token)}`;
    const response = await fetch(endpoint, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
      body: JSON.stringify({
        queries: query,
        countryCode,
        maxPagesPerQuery: maxPages,
        resultsPerPage,
      }),
    });

    if (!response.ok) {
      const errText = await response.text();
      throw new Error(`Lead search request failed (${response.status}): ${errText || 'Invalid token or quota exceeded'}`);
    }

    const data = await response.json();
    const organicResults: any[] = Array.isArray(data) && data[0]?.organicResults
      ? data[0].organicResults
      : (Array.isArray(data) ? data : []);

    return organicResults.filter((item) => item.url && item.url.includes('linkedin.com/in/'));
  }

  // Asynchronous dataset streaming for bulk scale (> 50 to 50,000)
  const datasetId = await runActorAsync(
    actorSlug,
    {
      queries: query,
      countryCode,
      maxPagesPerQuery: maxPages,
      resultsPerPage,
    },
    token,
    600,
    onProgress
  );

  const rawItems = await fetchAllDatasetItems(datasetId, token, limit * 2, onProgress);
  const allResults: any[] = [];
  for (const page of rawItems) {
    if (page?.organicResults && Array.isArray(page.organicResults)) {
      allResults.push(...page.organicResults);
    } else if (page?.url) {
      allResults.push(page);
    }
  }

  return allResults.filter((item) => item.url && item.url.includes('linkedin.com/in/'));
}

export async function scrapeApifyLeads(
  params: ApifySearchParams
): Promise<ApifyScrapedLead[]> {
  const token = params.apiToken || process.env.APIFY_API_TOKEN || process.env.APIFY_API_KEY;
  const limit = Math.max(params.limit || 10, 1);

  if (!token) {
    throw new Error('Lead Discovery API token is not configured. Please set your token in Outreach Settings or .env');
  }

  if (params.linkedinUrls && params.linkedinUrls.length > 0) {
    return scrapeDirectLinkedInUrls(params.linkedinUrls, token, limit, params.onProgress);
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

  const countryCode = isTargetingUS ? 'us' : isTargetingIndonesia ? 'id' : isTargetingSingapore ? 'sg' : isTargetingUK ? 'gb' : 'us';

  const searchTerms: string[] = [];
  if (params.role) searchTerms.push(`"${params.role.trim()}"`);
  if (isTargetingUS) searchTerms.push('"United States"');
  else if (isTargetingIndonesia) searchTerms.push('"Indonesia"');
  else if (isTargetingSingapore) searchTerms.push('"Singapore"');
  else if (isTargetingUK) searchTerms.push('"United Kingdom"');
  else if (params.location) searchTerms.push(`"${params.location.trim()}"`);

  if (params.query && !params.role) searchTerms.push(params.query.trim());

  const combinedSearch = searchTerms.filter(Boolean).join(' ');
  const primaryQuery = `site:linkedin.com/in/ ${combinedSearch}`.trim();

  let rawLinkedinResults = await executeGoogleSearchScraper(primaryQuery, countryCode, limit, token, params.onProgress);

  if (rawLinkedinResults.length === 0) {
    const relaxedTerms = [params.role, params.location].filter(Boolean).join(' ');
    const relaxedQuery = `site:linkedin.com/in/ ${relaxedTerms}`.trim();
    try {
      rawLinkedinResults = await executeGoogleSearchScraper(relaxedQuery, countryCode, limit, token, params.onProgress);
    } catch {
      // Keep empty if relaxed query fails
    }
  }

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

  const candidates = (geoFilteredResults.length > 0 ? geoFilteredResults : rawLinkedinResults)
    .map((item) => parseGoogleOrganicToLead(item, params, isTargetingUS ? 'United States' : undefined))
    .filter(isValidHumanProspect);

  const finalCandidates = candidates.length > 0
    ? candidates
    : rawLinkedinResults.map((item) => parseGoogleOrganicToLead(item, params, isTargetingUS ? 'United States' : undefined)).filter(isValidHumanProspect);

  return finalCandidates.slice(0, limit);
}

async function scrapeDirectLinkedInUrls(
  urls: string[],
  token: string,
  limit: number,
  onProgress?: (progress: { fetched: number; target: number; status: string }) => void
): Promise<ApifyScrapedLead[]> {
  const actorSlug = 'harvestapi~linkedin-profile-scraper';

  if (urls.length <= 20) {
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
    return (Array.isArray(items) ? items : []).map(mapHarvestItemToLead).filter(isValidHumanProspect);
  }

  // Bulk async execution for direct profile URLs
  const datasetId = await runActorAsync(
    actorSlug,
    { queries: urls.slice(0, limit), maxItems: limit },
    token,
    600,
    onProgress
  );

  const items = await fetchAllDatasetItems(datasetId, token, limit, onProgress);
  return items.map(mapHarvestItemToLead).filter(isValidHumanProspect);
}

function mapHarvestItemToLead(item: any): ApifyScrapedLead {
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
    metadata: {
      source: 'harvestapi-direct',
      scrapedAt: new Date().toISOString(),
    },
  };
}

function parseGoogleOrganicToLead(item: any, params: ApifySearchParams, forcedLocation?: string): ApifyScrapedLead {
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
  if (cleanUrl.includes('id.linkedin.com')) location = 'Indonesia';
  else if (cleanUrl.includes('sg.linkedin.com')) location = 'Singapore';
  else if (cleanUrl.includes('my.linkedin.com')) location = 'Malaysia';
  else if (cleanUrl.includes('uk.linkedin.com')) location = 'United Kingdom';
  else if (item.personalInfo?.location) location = item.personalInfo.location;

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
    // Lean metadata to prevent Supabase 500MB DB bloat
    metadata: {
      source: 'linkedin-google-live',
      scrapedAt: new Date().toISOString(),
    },
  };
}
