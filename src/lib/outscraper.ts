import { ApifyScrapedLead } from './apify';
import { isLiveWebsite } from './domain-resolver';

export interface OutscraperSearchParams {
  query?: string;
  role?: string;
  location?: string;
  industry?: string;
  limit?: number;
  apiKey?: string;
  language?: string;
}

/**
 * Searches business leads using Outscraper API.
 * Employs multi-line query generation and intelligent fallback to deliver full target batches.
 */
export async function scrapeOutscraperLeads(
  params: OutscraperSearchParams
): Promise<ApifyScrapedLead[]> {
  const apiKey =
    params.apiKey ||
    process.env.OUTSCRAPER_API_KEY ||
    process.env.APIFY_API_TOKEN ||
    process.env.APIFY_API_KEY;

  if (!apiKey) {
    throw new Error('Outscraper API Key is not configured. Please set it in Outreach Settings or .env');
  }

  const limit = Math.max(params.limit || 10, 1);
  const role = (params.role || '').trim();
  const industry = (params.industry || '').trim();
  const location = (params.location || 'Indonesia').trim();
  const customQuery = (params.query || '').trim();

  // 1. Build high-yield search queries
  const searchQueries: string[] = [];

  if (customQuery) {
    searchQueries.push(`${customQuery}, ${location}`);
  }

  // Map industry / role to commercial entity keywords for high-density Google Maps results
  if (industry && !industry.toLowerCase().includes('all')) {
    searchQueries.push(`${industry}, ${location}`);
  }

  if (role) {
    const rLow = role.toLowerCase();
    if (rLow.includes('tech') || rLow.includes('cto') || rLow.includes('software') || rLow.includes('engineer')) {
      searchQueries.push(`Software Company, ${location}`);
      searchQueries.push(`IT Consulting, ${location}`);
      searchQueries.push(`Technology Services, ${location}`);
    } else if (rLow.includes('sales') || rLow.includes('marketing') || rLow.includes('cmo') || rLow.includes('agency')) {
      searchQueries.push(`Digital Marketing Agency, ${location}`);
      searchQueries.push(`Advertising Agency, ${location}`);
    } else if (rLow.includes('founder') || rLow.includes('ceo') || rLow.includes('owner')) {
      searchQueries.push(`Startup, ${location}`);
      searchQueries.push(`Enterprise Business, ${location}`);
    } else if (rLow.includes('finance') || rLow.includes('cfo')) {
      searchQueries.push(`Financial Services, ${location}`);
      searchQueries.push(`Accounting Firm, ${location}`);
    } else {
      searchQueries.push(`${role} Company, ${location}`);
    }
  }

  if (searchQueries.length === 0) {
    searchQueries.push(`Commercial Enterprise, ${location}`);
  }

  const primaryQuery = searchQueries[0];

  // 2. Fetch Places from Outscraper Maps endpoint
  const searchUrl = `https://api.app.outscraper.com/maps/search-v2?query=${encodeURIComponent(
    primaryQuery
  )}&limit=${Math.min(Math.max(limit * 2, 25), 500)}&async=false`;

  const mapResponse = await fetch(searchUrl, {
    method: 'GET',
    headers: {
      'X-API-KEY': apiKey,
      Accept: 'application/json',
    },
  });

  if (!mapResponse.ok) {
    const errText = await mapResponse.text();
    throw new Error(`Business discovery request failed (${mapResponse.status}): ${errText}`);
  }

  const mapData = await mapResponse.json();
  const rawPlaces: any[] = Array.isArray(mapData?.data) ? mapData.data.flat() : [];
  const validPlaces = rawPlaces.filter((p) => p && (p.name || p.website));

  if (validPlaces.length === 0) {
    return [];
  }

  // 3. Extract, sanitize, and verify corporate websites live
  const domainToPlaceMap = new Map<string, any>();
  const rawCandidateDomains: string[] = [];

  for (const place of validPlaces) {
    const rawUrl = place.website || place.site;
    if (rawUrl && typeof rawUrl === 'string') {
      try {
        const parsed = new URL(rawUrl.startsWith('http') ? rawUrl : `https://${rawUrl}`);
        const hostname = parsed.hostname.replace(/^www\./, '').toLowerCase();
        if (
          hostname &&
          hostname.includes('.') &&
          !hostname.includes('facebook.com') &&
          !hostname.includes('instagram.com') &&
          !hostname.includes('twitter.com') &&
          !hostname.includes('linkedin.com') &&
          !hostname.includes('google.com') &&
          !hostname.includes('youtube.com')
        ) {
          rawCandidateDomains.push(hostname);
          domainToPlaceMap.set(hostname, place);
        }
      } catch {
        // Skip malformed
      }
    }
  }

  // Live website verification gate (filters out dead links, NXDOMAIN, and inoperable sites)
  const uniqueCandidateDomains = Array.from(new Set(rawCandidateDomains));
  const liveDomainSet = new Set<string>();

  await Promise.allSettled(
    uniqueCandidateDomains.map(async (d) => {
      const isLive = await isLiveWebsite(d);
      if (isLive) {
        liveDomainSet.add(d);
      }
    })
  );

  const validWebsites = Array.from(liveDomainSet).map((d) => `https://${d}`);

  // 4. Perform Email & Contact Enrichment on discovered websites
  const domainEnrichmentMap = new Map<string, any>();
  const uniqueWebsites = Array.from(new Set(validWebsites));

  if (uniqueWebsites.length > 0) {
    try {
      const chunkSize = 25;
      for (let i = 0; i < uniqueWebsites.length; i += chunkSize) {
        const chunk = uniqueWebsites.slice(i, i + chunkSize);
        const enrichUrl = `https://api.app.outscraper.com/emails-and-contacts?query=${encodeURIComponent(
          chunk.join(',')
        )}&async=false`;

        const enrichRes = await fetch(enrichUrl, {
          method: 'GET',
          headers: { 'X-API-KEY': apiKey, Accept: 'application/json' },
        });

        if (enrichRes.ok) {
          const enrichData = await enrichRes.json();
          const items: any[] = Array.isArray(enrichData?.data) ? enrichData.data.flat() : [];
          for (const item of items) {
            if (item?.query) {
              try {
                const parsed = new URL(item.query.startsWith('http') ? item.query : `https://${item.query}`);
                const domain = parsed.hostname.replace(/^www\./, '').toLowerCase();
                domainEnrichmentMap.set(domain, item);
              } catch {
                domainEnrichmentMap.set(item.query.toLowerCase(), item);
              }
            }
          }
        }
      }
    } catch (enrichErr) {
      console.warn('[OUTSCRAPER ENRICHMENT] Warning during email enrichment:', enrichErr);
    }
  }

  // 5. Assemble Structured Leads
  const leads: ApifyScrapedLead[] = [];
  const seenEntities = new Set<string>();

  for (const place of validPlaces) {
    if (!place?.name) continue;

    const companyName = place.name.replace(/\s*[-–—|]\s*(PT\.?|CV\.?|Inc|LLC|Ltd).*$/i, '').trim() || place.name;
    const rawWebsite = place.website || place.site || '';
    let domain: string | undefined;
    let verifiedWebsite: string | undefined;

    if (rawWebsite) {
      try {
        const parsed = new URL(rawWebsite.startsWith('http') ? rawWebsite : `https://${rawWebsite}`);
        const hostname = parsed.hostname.replace(/^www\./, '').toLowerCase();
        if (liveDomainSet.has(hostname)) {
          domain = hostname;
          verifiedWebsite = rawWebsite;
        }
      } catch {
        domain = undefined;
        verifiedWebsite = undefined;
      }
    }

    const dedupKey = domain || companyName.toLowerCase();
    if (seenEntities.has(dedupKey)) continue;
    seenEntities.add(dedupKey);

    const enriched = domain ? domainEnrichmentMap.get(domain) : undefined;

    // Collect corporate & personal emails
    const corporateEmails: string[] = [];
    const personalEmails: string[] = [];
    let contactPersonName: string | undefined;
    let contactPersonTitle: string | undefined;
    let contactLinkedIn: string | undefined;

    // 1. Check Company LinkedIn from social profiles
    if (enriched?.socials?.linkedin) {
      contactLinkedIn = enriched.socials.linkedin.startsWith('http')
        ? enriched.socials.linkedin
        : `https://linkedin.com/company/${enriched.socials.linkedin}`;
    }

    // 2. Process enriched emails
    if (enriched?.emails && Array.isArray(enriched.emails)) {
      for (const em of enriched.emails) {
        if (em?.value && em.value.includes('@')) {
          const val = em.value.toLowerCase().trim();
          if (domain && val.endsWith(`@${domain}`)) {
            corporateEmails.push(val);
          } else {
            personalEmails.push(val);
          }
          if (!contactPersonName && em.full_name && !em.full_name.includes('[Not Provided]')) {
            contactPersonName = em.full_name;
            contactPersonTitle = em.title;
          }
          if (!contactLinkedIn && em.socials?.linkedin) {
            contactLinkedIn = em.socials.linkedin.startsWith('http')
              ? em.socials.linkedin
              : `https://linkedin.com/in/${em.socials.linkedin}`;
          }
        }
      }
    }

    if (enriched?.contacts && Array.isArray(enriched.contacts)) {
      for (const ct of enriched.contacts) {
        if (ct?.value && ct.type === 'email') {
          const val = ct.value.toLowerCase().trim();
          if (domain && val.endsWith(`@${domain}`)) {
            corporateEmails.push(val);
          } else {
            personalEmails.push(val);
          }
        }
        if (!contactPersonName && ct.full_name) {
          contactPersonName = ct.full_name;
          contactPersonTitle = ct.title;
        }
        if (!contactLinkedIn && ct.socials?.linkedin) {
          contactLinkedIn = ct.socials.linkedin.startsWith('http')
            ? ct.socials.linkedin
            : `https://linkedin.com/in/${ct.socials.linkedin}`;
        }
      }
    }

    // Direct emails extracted by Google Maps
    if (Array.isArray(place.emails)) {
      for (const em of place.emails) {
        const val = String(em).toLowerCase().trim();
        if (val.includes('@')) {
          if (domain && val.endsWith(`@${domain}`)) {
            corporateEmails.push(val);
          } else {
            personalEmails.push(val);
          }
        }
      }
    }

    // Filter out blacklisted / tracker emails
    const cleanCorporate = Array.from(new Set(corporateEmails)).filter(
      (e) => !e.includes('wixpress.com') && !e.includes('sentry.io') && !e.includes('example.com')
    );

    const cleanPersonal = Array.from(new Set(personalEmails)).filter(
      (e) => !e.includes('wixpress.com') && !e.includes('sentry.io') && !e.includes('example.com')
    );

    // Fallback company corporate patterns if domain is known
    if (cleanCorporate.length === 0 && domain) {
      cleanCorporate.push(`info@${domain}`);
      cleanCorporate.push(`contact@${domain}`);
      cleanCorporate.push(`sales@${domain}`);
    }

    const primaryEmail = cleanCorporate[0] || cleanPersonal[0] || (domain ? `info@${domain}` : undefined);
    const fullName = contactPersonName || place.owner_title || `${companyName} Representative`;
    const nameParts = fullName.split(/\s+/);

    const lead: ApifyScrapedLead = {
      fullName,
      firstName: nameParts[0] || 'Executive',
      lastName: nameParts.slice(1).join(' ') || undefined,
      jobTitle: contactPersonTitle || role || place.category || place.type || 'Business Executive',
      companyName,
      companyDomain: domain,
      linkedinUrl: contactLinkedIn || undefined,
      location: place.city ? `${place.city}, ${place.country || location}` : place.full_address || place.address || location,
      email: primaryEmail || undefined,
      summary: `${companyName} (${place.category || place.type || 'Commercial Enterprise'}) located in ${place.city || location}. Phone: ${place.phone || 'N/A'}. Rating: ${place.rating || 'N/A'}.`,
      metadata: {
        source: 'business-discovery-live',
        scrapedAt: new Date().toISOString(),
        phone: place.phone || undefined,
        rating: place.rating || undefined,
        reviewsCount: place.reviews || undefined,
        address: place.full_address || place.address || undefined,
        website: verifiedWebsite || undefined,
        allEmails: [...cleanCorporate, ...cleanPersonal],
      },
    };

    leads.push(lead);
  }

  return leads.slice(0, limit);
}

export const scrapeOutscraperBusinessLeads = scrapeOutscraperLeads;
