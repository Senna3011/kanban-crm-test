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
    throw new Error(`Failed to start lead discovery actor (${startRes.status}): ${err}`);
  }

  const runData = await startRes.json();
  const runId = runData.data?.id;
  const defaultDatasetId = runData.data?.defaultDatasetId;

  if (!runId) {
    throw new Error('Lead discovery did not return a valid task ID');
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
        status: `Discovery service status: ${status}...`,
      });
    }

    if (status === 'SUCCEEDED') {
      return pollJson.data.defaultDatasetId || defaultDatasetId;
    }

    if (status === 'FAILED' || status === 'ABORTED' || status === 'TIMED-OUT') {
      throw new Error(`Discovery service ended with status: ${status}`);
    }
  }

  throw new Error(`Discovery service timed out after ${timeoutSec}s`);
}

/**
 * Generates multi-line query variations to bypass single-query search ceilings (yields 100-1,000+ leads)
 */
function buildMultiLineSearchQueries(params: ApifySearchParams, isTargetingIndonesia: boolean, countryCode: string): string {
  const role = (params.role || params.query || 'Executive').trim();
  const loc = (params.location || '').trim();
  const industry = (params.industry || '').trim();

  const queries: string[] = [];

  // Synonyms mapping for high-yield B2B role variations
  const roleLower = role.toLowerCase();
  const roleSynonyms: string[] = [role];

  if (roleLower.includes('technology') || roleLower.includes('cto')) {
    roleSynonyms.push('CTO', 'Chief Technology Officer', 'Head of Engineering', 'VP Engineering', 'Director of Technology');
  } else if (roleLower.includes('sales') || roleLower.includes('revenue') || roleLower.includes('cro')) {
    roleSynonyms.push('VP Sales', 'Head of Sales', 'Sales Director', 'Chief Commercial Officer', 'Business Development Director');
  } else if (roleLower.includes('marketing') || roleLower.includes('cmo')) {
    roleSynonyms.push('CMO', 'Chief Marketing Officer', 'Head of Marketing', 'VP Marketing', 'Marketing Director');
  } else if (roleLower.includes('ceo') || roleLower.includes('founder') || roleLower.includes('owner')) {
    roleSynonyms.push('CEO', 'Founder', 'Co-Founder', 'Managing Director', 'President Director');
  } else if (roleLower.includes('finance') || roleLower.includes('cfo')) {
    roleSynonyms.push('CFO', 'Chief Financial Officer', 'Finance Director', 'Head of Finance');
  } else if (roleLower.includes('product') || roleLower.includes('cpo')) {
    roleSynonyms.push('CPO', 'Chief Product Officer', 'Head of Product', 'VP Product');
  } else if (roleLower.includes('operations') || roleLower.includes('coo')) {
    roleSynonyms.push('COO', 'Chief Operating Officer', 'Operations Director', 'Head of Operations');
  }

  const uniqueRoles = Array.from(new Set(roleSynonyms)).slice(0, 5);

  for (const r of uniqueRoles) {
    if (isTargetingIndonesia) {
      queries.push(`site:id.linkedin.com/in/ "${r}"`);
      queries.push(`site:linkedin.com/in/ "${r}" "Indonesia"`);
      if (loc && loc.toLowerCase() !== 'indonesia') {
        queries.push(`site:linkedin.com/in/ "${r}" "${loc}"`);
      }
    } else if (countryCode === 'sg') {
      queries.push(`site:sg.linkedin.com/in/ "${r}"`);
      queries.push(`site:linkedin.com/in/ "${r}" "Singapore"`);
    } else if (countryCode === 'gb') {
      queries.push(`site:uk.linkedin.com/in/ "${r}"`);
      queries.push(`site:linkedin.com/in/ "${r}" "United Kingdom"`);
    } else {
      queries.push(`site:linkedin.com/in/ "${r}" ${loc ? `"${loc}"` : '"United States"'}`);
    }
  }

  if (industry && !industry.toLowerCase().includes('all')) {
    queries.push(`site:linkedin.com/in/ "${role}" "${industry}" ${loc ? `"${loc}"` : ''}`.trim());
  }

  if (params.query && !params.role) {
    queries.push(`site:linkedin.com/in/ ${params.query}`);
  }

  return Array.from(new Set(queries)).join('\n');
}

/**
 * Executes a search run against Google Search Scraper Actor with multi-page aggregation
 */
async function executeGoogleSearchScraper(
  multiQuery: string,
  countryCode: string,
  limit: number,
  token: string,
  onProgress?: (progress: { fetched: number; target: number; status: string }) => void
): Promise<any[]> {
  const actorSlug = 'apify~google-search-scraper';
  // Scale pages and results according to target limit
  const queryCount = multiQuery.split('\n').filter(Boolean).length || 1;
  const maxPages = Math.min(Math.max(Math.ceil((limit * 1.5) / (queryCount * 10)), 1), 10);
  const resultsPerPage = Math.min(Math.max(limit, 25), 100);

  // Fast synchronous path for small limits (<= 30)
  if (limit <= 30) {
    const endpoint = `https://api.apify.com/v2/acts/${encodeURIComponent(actorSlug)}/run-sync-get-dataset-items?token=${encodeURIComponent(token)}`;
    const response = await fetch(endpoint, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
      body: JSON.stringify({
        queries: multiQuery,
        countryCode,
        maxPagesPerQuery: maxPages,
        resultsPerPage,
      }),
    });

    if (!response.ok) {
      const errText = await response.text();
      throw new Error(`Lead search request failed (${response.status}): ${errText || 'Invalid credentials or quota limit'}`);
    }

    const data = await response.json();
    const allOrganic: any[] = [];

    // Aggregates across all returned pages (fixes 10-lead single page ceiling!)
    if (Array.isArray(data)) {
      for (const page of data) {
        if (page?.organicResults && Array.isArray(page.organicResults)) {
          allOrganic.push(...page.organicResults);
        } else if (page?.url) {
          allOrganic.push(page);
        }
      }
    }

    return allOrganic.filter((item) => item.url && item.url.includes('linkedin.com/in/'));
  }

  // Asynchronous dataset streaming for bulk scale (> 30 to 50,000)
  const datasetId = await runActorAsync(
    actorSlug,
    {
      queries: multiQuery,
      countryCode,
      maxPagesPerQuery: maxPages,
      resultsPerPage,
    },
    token,
    600,
    onProgress
  );

  const rawItems = await fetchAllDatasetItems(datasetId, token, limit * 3, onProgress);
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
    throw new Error('Lead Discovery service is temporarily unconfigured. Please check system credentials.');
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

  const isTargetingIndonesia = locLower.includes('indonesia') || locLower.includes('jakarta') || locLower.includes('surabaya') || locLower.includes('bandung') || locLower.includes('bali');
  const isTargetingSingapore = locLower.includes('singapore');
  const isTargetingUK = locLower.includes('uk') || locLower.includes('united kingdom');

  const countryCode = isTargetingUS ? 'us' : isTargetingIndonesia ? 'id' : isTargetingSingapore ? 'sg' : isTargetingUK ? 'gb' : 'us';

  const multiQuery = buildMultiLineSearchQueries(params, isTargetingIndonesia, countryCode);

  const rawLinkedinResults = await executeGoogleSearchScraper(multiQuery, countryCode, limit, token, params.onProgress);

  // Geographic Filter & Deduplication
  const seenUrls = new Set<string>();
  const candidates: ApifyScrapedLead[] = [];

  for (const item of rawLinkedinResults) {
    const url = (item.url || '').split('?')[0].toLowerCase();
    if (!url || seenUrls.has(url)) continue;

    if (isTargetingUS) {
      let isForeign = false;
      for (const sub of FOREIGN_SUBDOMAINS) {
        if (url.includes(`://${sub}.linkedin.com/in/`)) {
          isForeign = true;
          break;
        }
      }
      if (isForeign) continue;
    }

    if (isTargetingIndonesia) {
      if (url.includes('in.linkedin.com') || url.includes('pk.linkedin.com')) continue;
    }

    seenUrls.add(url);
    const parsed = parseGoogleOrganicToLead(item, params, isTargetingUS ? 'United States' : isTargetingIndonesia ? 'Indonesia' : undefined);
    if (isValidHumanProspect(parsed)) {
      candidates.push(parsed);
    }
  }

  return candidates.slice(0, limit);
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
      throw new Error(`Profile discovery service returned status ${response.status}`);
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
    fullName: `${item.firstName || ''} ${item.lastName || ''}`.trim() || item.name || 'Prospect Contact',
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
      source: 'profile-discovery-direct',
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
    metadata: {
      source: 'discovery-live',
      scrapedAt: new Date().toISOString(),
    },
  };
}
