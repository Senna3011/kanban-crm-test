import { ApifyScrapedLead } from './apify';
import { isValidDecisionMakerLead } from './outreach-validator';
import {
  getTregBalance,
  getTregCallChargeMicro,
  microToUsd,
  TREG_PEOPLE_SEARCH_COST_MICRO,
} from './treg-billing';

export interface TregSearchParams {
  role?: string;
  location?: string;
  industry?: string;
  query?: string;
  limit?: number;
  apiKey?: string;
}

export interface TregSearchResult {
  leads: ApifyScrapedLead[];
  rawRecordsReturned: number;
  qualifiedCount: number;
  apiCallsMade: number;
  billedCallsCount: number;
  actualCostMicro: number;
  actualCostUsd: number;
  balanceBeforeMicro: number;
  balanceAfterMicro: number;
  balanceBeforeUsd: number;
  balanceAfterUsd: number;
  costSource: 'verified_ledger' | 'api_header' | 'balance_delta' | 'catalog_estimate';
  callIds: string[];
}

export interface TregPersonRecord {
  id?: string;
  name?: string;
  first_name?: string;
  last_name?: string;
  title?: string;
  job_title?: string;
  company?: {
    name?: string;
    domain?: string;
    city?: string;
    country?: string;
    industry?: string;
  } | string;
  company_name?: string;
  domain?: string;
  company_domain?: string;
  email?: {
    value?: string;
    status?: string;
    kind?: string;
  } | string;
  work_email?: string;
  linkedin?: string;
  linkedin_url?: string;
  location?: string;
  city?: string;
  state?: string;
  country?: string;
  phone?: string;
  phone_number?: string;
  source_url?: string;
  insight?: {
    summary?: string;
    decision_role?: string;
    seniority?: string;
    department?: string;
  };
}

const INDUSTRY_TAXONOMY_MAP: Record<string, string> = {
  'information technology & services': 'IT Services and IT Consulting',
  'computer software / saas': 'Software Development',
  'financial services & fintech': 'Financial Services',
  'healthcare & medical': 'Hospitals and Health Care',
  'e-commerce & retail': 'Retail',
  'marketing & advertising': 'Marketing Services',
  'real estate & construction': 'Real Estate',
  'manufacturing & logistics': 'Manufacturing',
  'education management': 'Education Administration Programs',
  'hospitality & tourism': 'Hospitality',
  'legal & consulting': 'Legal Services',
};

function normalizeIndustryForTreg(rawIndustry?: string): string | undefined {
  if (!rawIndustry) return undefined;
  const first = rawIndustry.split(',')[0].trim();
  const lower = first.toLowerCase();
  if (!first || lower.includes('all') || lower.includes('broad')) return undefined;
  return INDUSTRY_TAXONOMY_MAP[lower] || first;
}

/**
 * Normalizes company domain string to clean hostname (e.g. "https://www.google.com" -> "google.com")
 */
function cleanDomain(rawDomain?: string): string | undefined {
  if (!rawDomain) return undefined;
  const clean = rawDomain
    .replace(/^https?:\/\//i, '')
    .replace(/\/.*$/, '')
    .replace(/^www\./i, '')
    .toLowerCase()
    .trim();
  return clean.includes('.') && clean.length >= 4 ? clean : undefined;
}

/**
 * Resolves standard 2-letter ISO country code from location string.
 * Returns undefined if location is global/worldwide or unspecified.
 */
function resolveCountry(loc?: string): string | undefined {
  if (!loc) return undefined;
  const clean = loc.toLowerCase().trim();
  if (clean.includes('worldwide') || clean.includes('global') || clean.includes('all')) return undefined;
  if (clean.includes('indonesia') || clean.includes('jakarta') || clean.includes('surabaya') || clean.includes('bali') || clean === 'id') return 'ID';
  if (clean.includes('singapore') || clean === 'sg') return 'SG';
  if (clean.includes('united kingdom') || clean.includes('london') || clean === 'uk' || clean === 'gb') return 'GB';
  if (clean.includes('australia') || clean.includes('sydney') || clean.includes('melbourne') || clean === 'au') return 'AU';
  if (clean.includes('canada') || clean.includes('toronto') || clean.includes('vancouver') || clean === 'ca') return 'CA';
  if (clean.includes('germany') || clean.includes('berlin') || clean === 'de') return 'DE';
  if (clean.includes('japan') || clean.includes('tokyo') || clean === 'jp') return 'JP';
  if (clean.includes('netherlands') || clean.includes('amsterdam') || clean === 'nl') return 'NL';
  if (clean.includes('united states') || clean.includes('usa') || clean.includes('california') || clean.includes('new york') || clean.includes('san francisco') || clean === 'us') return 'US';
  return 'US';
}

function mapRecordToLead(item: TregPersonRecord, params: TregSearchParams): ApifyScrapedLead | null {
  const fullName =
    item.name ||
    [item.first_name, item.last_name].filter(Boolean).join(' ') ||
    '';

  if (!fullName) return null;

  const firstName =
    item.first_name ||
    (fullName.includes(' ') ? fullName.split(' ')[0] : fullName);

  const lastName =
    item.last_name ||
    (fullName.includes(' ') ? fullName.split(' ').slice(1).join(' ') : undefined);

  const jobTitle = item.title || item.job_title || params.role || 'Executive';

  let companyName: string | undefined;
  let rawDomain: string | undefined;
  let cityStr: string | undefined;
  let countryStr: string | undefined;

  if (item.company && typeof item.company === 'object') {
    companyName = item.company.name;
    rawDomain = item.company.domain;
    cityStr = item.company.city;
    countryStr = item.company.country;
  } else if (typeof item.company === 'string') {
    companyName = item.company;
  }

  if (!companyName && item.company_name) {
    companyName = item.company_name;
  }
  if (!rawDomain && (item.domain || item.company_domain)) {
    rawDomain = item.domain || item.company_domain;
  }

  const companyDomain = cleanDomain(rawDomain);

  let linkedinUrl = item.linkedin || item.linkedin_url || undefined;
  if (linkedinUrl) {
    if (!linkedinUrl.startsWith('http')) {
      if (linkedinUrl.includes('linkedin.com')) {
        linkedinUrl = `https://${linkedinUrl}`;
      } else {
        linkedinUrl = `https://www.linkedin.com/in/${linkedinUrl}`;
      }
    }
  }

  const locParts = [cityStr, countryStr, item.city, item.state, item.country].filter(Boolean);
  const location = locParts.length > 0 ? Array.from(new Set(locParts)).join(', ') : (item.location || params.location);

  let email: string | undefined;
  if (item.email) {
    if (typeof item.email === 'object' && item.email.value) {
      email = item.email.value.toLowerCase().trim();
    } else if (typeof item.email === 'string') {
      email = item.email.toLowerCase().trim();
    }
  }
  if (!email && item.work_email) {
    email = typeof item.work_email === 'string' ? item.work_email.toLowerCase().trim() : undefined;
  }

  const profileSummary =
    item.insight?.summary ||
    [
      item.insight?.decision_role ? `Role: ${item.insight.decision_role}` : null,
      item.insight?.department ? `Department: ${item.insight.department}` : null,
      item.insight?.seniority ? `Seniority: ${item.insight.seniority}` : null,
    ]
      .filter(Boolean)
      .join(' | ') ||
    undefined;

  // Phone numbers are intentionally omitted (100% B2B Cold Email focus)
  const candidate: ApifyScrapedLead = {
    fullName,
    firstName,
    lastName,
    jobTitle,
    companyName,
    companyDomain,
    linkedinUrl,
    location,
    email,
    summary: profileSummary,
    metadata: {
      source: 'on-demand-gateway',
      personId: item.id || undefined,
      sourceUrl: item.source_url || undefined,
      summary: profileSummary,
      industry: typeof item.company === 'object' ? item.company.industry : undefined,
      department: item.insight?.department || undefined,
      seniority: item.insight?.seniority || undefined,
      decisionRole: item.insight?.decision_role || undefined,
      scrapedAt: new Date().toISOString(),
    },
  };

  return isValidDecisionMakerLead(candidate) ? candidate : null;
}

async function executeTregPageRequest(
  apiKey: string,
  requestBody: Record<string, any>
): Promise<{
  ok: boolean;
  status: number;
  errText: string;
  resData: any;
  callId?: string;
  headerCostMicro?: number;
}> {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 15000);

  try {
    const res = await fetch('https://treg.to/call/crawl4ai.people.search', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Treg-Token': apiKey,
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify(requestBody),
      signal: controller.signal,
    });
    clearTimeout(timeoutId);

    const callId = res.headers.get('x-treg-call-id') || undefined;
    const rawCostHeader = res.headers.get('x-treg-cost-micro');
    const headerCostMicro =
      rawCostHeader !== null && /^\d+$/.test(rawCostHeader.trim())
        ? Number(rawCostHeader.trim())
        : undefined;

    if (!res.ok) {
      const errText = await res.text();
      return { ok: false, status: res.status, errText, resData: null, callId, headerCostMicro };
    }

    const resData = await res.json();
    return { ok: true, status: res.status, errText: '', resData, callId, headerCostMicro };
  } catch (err: any) {
    clearTimeout(timeoutId);
    if (err?.name === 'AbortError') {
      throw new Error('On-Demand B2B Gateway timed out after 15 seconds.');
    }
    throw err;
  }
}

/**
 * Searches B2B leads from Treg.to (crawl4ai.people.search) with exact credit telemetry.
 * - Uses flat per-call pricing optimization (up to 100 leads per $0.0005 call, no wasteful 2x over-fetching).
 * - Automatically maps LinkedIn taxonomy industries & recovers from free 400 industry mismatch errors.
 * - Captures exact micro-USD charge via Treg call headers, /calls ledger verification, and before/after balance.
 */
export async function searchTregLeadsWithCost(params: TregSearchParams): Promise<TregSearchResult> {
  const apiKey = params.apiKey || process.env.TREG_API_KEY;
  if (!apiKey) {
    throw new Error('On-Demand B2B Gateway API Key (TREG_API_KEY) is not configured in server environment.');
  }

  const targetLimit = Math.min(Math.max(params.limit || 10, 1), 1000);

  const balanceBefore = await getTregBalance({ apiKey, forceRefresh: true });

  const personWhere: Record<string, any> = {
    has_email: true,
  };

  if (params.role) {
    personWhere.title = params.role.split(/[,/|]/)[0].trim();
  } else if (params.query && !/site:\s*linkedin\.com/i.test(params.query)) {
    personWhere.title = params.query.trim();
  } else {
    personWhere.title = 'Founder';
  }

  const companyWhere: Record<string, any> = {};
  const resolvedCountry = resolveCountry(params.location);
  if (resolvedCountry) {
    companyWhere.country = resolvedCountry;
  }

  let activeIndustry = normalizeIndustryForTreg(params.industry);
  if (activeIndustry) {
    companyWhere.industry = activeIndustry;
  }

  const qualifiedLeads: ApifyScrapedLead[] = [];
  const seenKeys = new Set<string>();
  const callIds: string[] = [];
  let rawRecordsReturned = 0;
  let apiCallsMade = 0;
  let billedCallsCount = 0;
  let settledMicroTotal = 0;
  let headerMicroTotal = 0;
  let hasVerifiedLedger = false;
  let hasHeaderCost = false;
  let cursor: string | undefined = undefined;
  const maxPages = Math.min(Math.ceil(targetLimit / 100) + 2, 10);

  for (let page = 0; page < maxPages; page++) {
    const remaining = targetLimit - qualifiedLeads.length;
    if (remaining <= 0) break;

    // Flat per-call cost up to 100 records: include a small validation buffer (+3) within the same 100-cap
    // so strict decision-maker filtering never triggers an unnecessary second API call.
    const pageLimit = Math.min(remaining <= 80 ? remaining + 3 : remaining, 100);

    const wherePayload: Record<string, any> = {
      person: personWhere,
      ...(Object.keys(companyWhere).length > 0 ? { company: { ...companyWhere } } : {}),
    };

    const requestBody: Record<string, any> = {
      where: wherePayload,
      limit: pageLimit,
      ...(cursor ? { cursor } : {}),
    };

    console.log('[On-Demand B2B Gateway] Sending search request to Treg.to:', JSON.stringify(requestBody));

    let pageRes = await executeTregPageRequest(apiKey, requestBody);
    apiCallsMade++;

    // Free auto-recovery if industry string is rejected with HTTP 400 ("not_billable_400")
    if (!pageRes.ok && pageRes.status === 400 && pageRes.errText.includes('unknown industry')) {
      const closestMatch = pageRes.errText.match(/closest:\s*([^."]+)/i);
      if (closestMatch && closestMatch[1]) {
        const firstClosest = closestMatch[1].split(',')[0].trim();
        if (firstClosest && firstClosest !== companyWhere.industry) {
          console.warn(`[On-Demand B2B Gateway] Auto-correcting industry "${companyWhere.industry}" -> "${firstClosest}" (free 400 recovery)`);
          companyWhere.industry = firstClosest;
          requestBody.where = {
            person: personWhere,
            company: { ...companyWhere },
          };
          pageRes = await executeTregPageRequest(apiKey, requestBody);
          apiCallsMade++;
        }
      }

      // If still 400 on industry, drop industry filter rather than triggering synthetic scrapers
      if (!pageRes.ok && pageRes.status === 400 && companyWhere.industry) {
        console.warn(`[On-Demand B2B Gateway] Retrying without strict industry filter after 400.`);
        delete companyWhere.industry;
        requestBody.where = {
          person: personWhere,
          ...(Object.keys(companyWhere).length > 0 ? { company: { ...companyWhere } } : {}),
        };
        pageRes = await executeTregPageRequest(apiKey, requestBody);
        apiCallsMade++;
      }
    }

    if (!pageRes.ok) {
      let summary = `HTTP ${pageRes.status}`;
      try {
        const jsonErr = JSON.parse(pageRes.errText);
        if (typeof jsonErr.detail === 'string') summary = `${summary} - ${jsonErr.detail}`;
        else if (typeof jsonErr.message === 'string') summary = `${summary} - ${jsonErr.message}`;
        else if (typeof jsonErr.error === 'string') summary = `${summary} - ${jsonErr.error}`;
        else if (jsonErr.error?.message) summary = `${summary} - ${jsonErr.error.message}`;
        else if (jsonErr.detail?.message) summary = `${summary} - ${jsonErr.detail.message}`;
      } catch {
        if (pageRes.errText && pageRes.errText.length < 100) summary = `${summary} - ${pageRes.errText.trim()}`;
      }
      console.error(`[On-Demand B2B Gateway] Upstream error raw body: ${pageRes.errText.slice(0, 500)}`);
      throw new Error(`On-Demand B2B Gateway (${pageRes.status}): ${summary}`);
    }

    if (pageRes.callId) {
      callIds.push(pageRes.callId);
    }

    const resData = pageRes.resData || {};
    const rawList: TregPersonRecord[] =
      resData.data ||
      resData.output?.people ||
      resData.output?.data ||
      resData.results ||
      resData.people ||
      (Array.isArray(resData) ? resData : []);

    rawRecordsReturned += rawList.length;

    if (rawList.length > 0) {
      billedCallsCount++;
      if (typeof pageRes.headerCostMicro === 'number' && pageRes.headerCostMicro > 0) {
        headerMicroTotal += pageRes.headerCostMicro;
        hasHeaderCost = true;
      }
      // Verify settled ledger charge from Treg /calls/{callId} for exact accuracy
      if (pageRes.callId) {
        const settled = await getTregCallChargeMicro(pageRes.callId, apiKey);
        if (typeof settled === 'number') {
          settledMicroTotal += settled;
          hasVerifiedLedger = true;
        }
      }
    }

    console.log(`[On-Demand B2B Gateway] Page ${page + 1}: received ${rawList.length} records from Treg.to.`);

    for (const item of rawList) {
      const candidate = mapRecordToLead(item, params);
      if (!candidate) continue;

      const dedupKey = (candidate.email || candidate.linkedinUrl || `${candidate.fullName}|${candidate.companyName || ''}`).toLowerCase();
      if (seenKeys.has(dedupKey)) continue;
      seenKeys.add(dedupKey);

      qualifiedLeads.push(candidate);
      if (qualifiedLeads.length >= targetLimit) {
        break;
      }
    }

    const nextCursor = typeof resData.next === 'string' && resData.next ? resData.next : undefined;
    if (!nextCursor || nextCursor === cursor || rawList.length === 0 || qualifiedLeads.length >= targetLimit) {
      break;
    }
    cursor = nextCursor;
  }

  const balanceAfter = await getTregBalance({ apiKey, forceRefresh: true });
  const balanceDeltaMicro = Math.max(0, balanceBefore.balanceMicro - balanceAfter.balanceMicro);

  let actualCostMicro = 0;
  let costSource: TregSearchResult['costSource'] = 'catalog_estimate';

  if (hasVerifiedLedger) {
    actualCostMicro = settledMicroTotal;
    costSource = 'verified_ledger';
  } else if (balanceDeltaMicro > 0) {
    actualCostMicro = balanceDeltaMicro;
    costSource = 'balance_delta';
  } else if (hasHeaderCost) {
    actualCostMicro = headerMicroTotal;
    costSource = 'api_header';
  } else {
    actualCostMicro = billedCallsCount * TREG_PEOPLE_SEARCH_COST_MICRO;
    costSource = 'catalog_estimate';
  }

  console.log(
    `[On-Demand B2B Gateway] Qualified ${qualifiedLeads.length}/${rawRecordsReturned} leads | ` +
    `Billed calls: ${billedCallsCount} | Actual Cost: $${microToUsd(actualCostMicro)} (${costSource}) | ` +
    `Balance: $${balanceAfter.balanceUsd}`
  );

  return {
    leads: qualifiedLeads,
    rawRecordsReturned,
    qualifiedCount: qualifiedLeads.length,
    apiCallsMade,
    billedCallsCount,
    actualCostMicro,
    actualCostUsd: microToUsd(actualCostMicro),
    balanceBeforeMicro: balanceBefore.balanceMicro,
    balanceAfterMicro: balanceAfter.balanceMicro,
    balanceBeforeUsd: balanceBefore.balanceUsd,
    balanceAfterUsd: balanceAfter.balanceUsd,
    costSource,
    callIds,
  };
}

/**
 * Legacy wrapper returning leads only.
 */
export async function searchTregLeads(params: TregSearchParams): Promise<ApifyScrapedLead[]> {
  const result = await searchTregLeadsWithCost(params);
  return result.leads;
}
