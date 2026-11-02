import { ApifyScrapedLead } from './apify';
import { isValidDecisionMakerLead } from './leadocean';

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
  first_name?: string;
  last_name?: string;
  name?: string;
  title?: string;
  job_title?: string;
  company?: string;
  company_name?: string;
  domain?: string;
  company_domain?: string;
  linkedin?: string;
  linkedin_url?: string;
  location?: string;
  city?: string;
  state?: string;
  country?: string;
  email?: string;
  work_email?: string;
  phone?: string;
  phone_number?: string;
  source?: string;
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
 * Searches B2B leads from On-Demand B2B Gateway (Treg.to Unified Gateway)
 * Uses official gateway proxy path: https://treg.to/call/treg.people.search
 */
export async function searchTregLeads(params: TregSearchParams): Promise<ApifyScrapedLead[]> {
  const apiKey = params.apiKey || process.env.TREG_API_KEY;
  if (!apiKey) {
    throw new Error('On-Demand B2B Gateway API Key (TREG_API_KEY) is not configured in server environment.');
  }

  const targetLimit = Math.min(Math.max(params.limit || 10, 1), 50);
  const fetchLimit = Math.min(targetLimit * 2, 50);

  const payload: Record<string, any> = {
    limit: fetchLimit,
    has_email: true,
  };

  if (params.role) {
    payload.title = params.role.split(',')[0].trim();
  }

  if (params.location) {
    payload.location = params.location.trim();
  }

  if (params.industry) {
    payload.keywords = params.industry.split(',').map((i) => i.trim());
  }

  if (params.query) {
    payload.q = params.query.trim();
  }

  console.log('[On-Demand B2B Gateway] Dispatching request to https://treg.to/call/treg.people.search...');

  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 15000);

  try {
    const res = await fetch('https://treg.to/call/treg.people.search', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Treg-Token': apiKey,
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify(payload),
      signal: controller.signal,
    });

    clearTimeout(timeoutId);

    if (!res.ok) {
      const errText = await res.text();
      let parsedErr = errText;
      try {
        const jsonErr = JSON.parse(errText);
        parsedErr =
          typeof jsonErr.error === 'object'
            ? JSON.stringify(jsonErr.error)
            : jsonErr.message || jsonErr.error || errText;
      } catch {}
      throw new Error(`On-Demand B2B Gateway Error (${res.status}): ${parsedErr}`);
    }

    const data = await res.json();
    const rawList: TregPersonRecord[] =
      data.output?.people ||
      data.output?.data ||
      data.output ||
      data.data ||
      data.people ||
      (Array.isArray(data) ? data : []);

    console.log(`[On-Demand B2B Gateway] Received ${rawList.length} raw records from gateway. Served by: ${res.headers.get('x-treg-served-by') || 'multi-provider'}`);

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
      const companyName = item.company || item.company_name || undefined;
      const companyDomain = cleanDomain(item.domain || item.company_domain);
      let linkedinUrl = item.linkedin || item.linkedin_url || undefined;
      if (linkedinUrl && !linkedinUrl.startsWith('http')) {
        linkedinUrl = `https://${linkedinUrl}`;
      }

      const locParts = [item.city, item.state, item.country].filter(Boolean);
      const location = item.location || (locParts.length > 0 ? locParts.join(', ') : params.location);

      const email = (item.work_email || item.email || '').toLowerCase().trim() || undefined;

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
        metadata: {
          source: 'on-demand-gateway',
          phone: item.phone || item.phone_number || undefined,
          aggregatorProvider: item.source || res.headers.get('x-treg-served-by') || 'unified-b2b',
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

    console.log(`[On-Demand B2B Gateway] Qualified ${qualifiedLeads.length} leads successfully.`);
    return qualifiedLeads;
  } catch (err: any) {
    clearTimeout(timeoutId);
    if (err.name === 'AbortError') {
      throw new Error('On-Demand B2B Gateway timed out after 15 seconds.');
    }
    throw err;
  }
}
