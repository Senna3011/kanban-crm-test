import { ApifyScrapedLead } from './apify';
import { isValidDecisionMakerLead } from './outreach-validator';

export interface TregSearchParams {
  role?: string;
  location?: string;
  industry?: string;
  query?: string;
  limit?: number;
  apiKey?: string;
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
  return 'US'; // sensible fallback if specific non-global location was entered
}

/**
 * Searches B2B leads from On-Demand B2B Gateway (Treg.to / Crawl4AI gateway)
 * Uses official nested "where" schema: POST https://treg.to/call/crawl4ai.people.search
 */
export async function searchTregLeads(params: TregSearchParams): Promise<ApifyScrapedLead[]> {
  const apiKey = params.apiKey || process.env.TREG_API_KEY;
  if (!apiKey) {
    throw new Error('On-Demand B2B Gateway API Key (TREG_API_KEY) is not configured in server environment.');
  }

  const targetLimit = Math.min(Math.max(params.limit || 10, 1), 50);
  const fetchLimit = Math.min(targetLimit * 2, 50);

  // Build the nested where query required by Treg.to / crawl4ai.people.search
  const personWhere: Record<string, any> = {
    has_email: true, // Guarantees verified work/personal email is present in returned records
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

  // Filter out "All Industries (Broad)" or any generic wildcard to prevent 0 leads / 400 Bad Request
  if (params.industry && !params.industry.toLowerCase().includes('all') && !params.industry.toLowerCase().includes('broad')) {
    companyWhere.industry = params.industry.split(',')[0].trim();
  }

  const wherePayload: Record<string, any> = {
    person: personWhere,
  };

  if (Object.keys(companyWhere).length > 0) {
    wherePayload.company = companyWhere;
  }

  const requestBody = {
    where: wherePayload,
    limit: fetchLimit,
  };

  console.log('[On-Demand B2B Gateway] Sending search request to Treg.to with payload:', JSON.stringify(requestBody));

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

    if (!res.ok) {
      const errText = await res.text();
      let summary = `HTTP ${res.status}`;
      try {
        const jsonErr = JSON.parse(errText);
        if (typeof jsonErr.detail === 'string') summary = `${summary} - ${jsonErr.detail}`;
        else if (typeof jsonErr.message === 'string') summary = `${summary} - ${jsonErr.message}`;
        else if (typeof jsonErr.error === 'string') summary = `${summary} - ${jsonErr.error}`;
        else if (jsonErr.error?.message) summary = `${summary} - ${jsonErr.error.message}`;
        else if (jsonErr.detail?.message) summary = `${summary} - ${jsonErr.detail.message}`;
      } catch {
        if (errText && errText.length < 100) summary = `${summary} - ${errText.trim()}`;
      }
      console.error(`[On-Demand B2B Gateway] Upstream error raw body: ${errText.slice(0, 500)}`);
      throw new Error(`On-Demand B2B Gateway (${res.status}): ${summary}`);
    }

    const resData = await res.json();
    const rawList: TregPersonRecord[] =
      resData.data ||
      resData.output?.people ||
      resData.output?.data ||
      resData.results ||
      resData.people ||
      (Array.isArray(resData) ? resData : []);

    console.log(`[On-Demand B2B Gateway] Successfully received ${rawList.length} raw records from Treg.to.`);

    const qualifiedLeads: ApifyScrapedLead[] = [];

    for (const item of rawList) {
      const fullName =
        item.name ||
        [item.first_name, item.last_name].filter(Boolean).join(' ') ||
        '';

      if (!fullName) continue;

      const firstName =
        item.first_name ||
        (fullName.includes(' ') ? fullName.split(' ')[0] : fullName);

      const lastName =
        item.last_name ||
        (fullName.includes(' ') ? fullName.split(' ').slice(1).join(' ') : undefined);

      const jobTitle = item.title || item.job_title || params.role || 'Executive';

      // Parse nested company object: { name, domain, city, country, industry }
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

      // Parse LinkedIn handle or full URL
      let linkedinUrl = item.linkedin || item.linkedin_url || undefined;
      if (linkedinUrl) {
        if (!linkedinUrl.startsWith('http')) {
          if (linkedinUrl.includes('linkedin.com')) {
            linkedinUrl = `https://${linkedinUrl}`;
          } else {
            // Slug handle provided (e.g. "niclas-tollgard-50a62")
            linkedinUrl = `https://www.linkedin.com/in/${linkedinUrl}`;
          }
        }
      }

      // Location resolution
      const locParts = [cityStr, countryStr, item.city, item.state, item.country].filter(Boolean);
      const location = locParts.length > 0 ? Array.from(new Set(locParts)).join(', ') : (item.location || params.location);

      // Parse nested email object: { value, status, kind } or direct string
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
        summary: item.insight?.summary || undefined,
        metadata: {
          source: 'on-demand-gateway',
          personId: item.id || undefined,
          sourceUrl: item.source_url || undefined,
          scrapedAt: new Date().toISOString(),
        },
      };

      if (isValidDecisionMakerLead(candidate)) {
        qualifiedLeads.push(candidate);
        if (qualifiedLeads.length >= targetLimit) {
          break;
        }
      }
    }

    console.log(`[On-Demand B2B Gateway] Filtered and qualified ${qualifiedLeads.length} valid decision makers from Treg.to.`);
    return qualifiedLeads;
  } catch (err: any) {
    clearTimeout(timeoutId);
    if (err.name === 'AbortError') {
      throw new Error('On-Demand B2B Gateway timed out after 15 seconds.');
    }
    throw err;
  }
}
