import { ApifyScrapedLead } from './apify';

export interface OutscraperSearchParams {
  query?: string;
  role?: string;
  location?: string;
  industry?: string;
  limit?: number;
  apiKey?: string;
}

const LEGAL_ENTITY_REGEX = /\b(PT\.?|CV\.?|Inc\.?|LLC|Ltd\.?|Limited|Tbk\.?|Corp\.?|Corporation|Pte\.?|GmbH|Co\.?|Foundation|Yayasan|Agency|Studio|Software House|Konsultan|Consultant|Services)\b/i;

function cleanCorporateName(rawName: string): string {
  if (!rawName) return 'Enterprise Organization';
  return rawName
    .replace(/\s*\|.*$/, '')
    .replace(/\s*-.*PT.*$/i, '')
    .trim();
}

/**
 * Normalizes and extracts authentic personnel representation from Outscraper data
 */
export const scrapeOutscraperLeads = scrapeOutscraperBusinessLeads;

export async function scrapeOutscraperBusinessLeads(
  params: OutscraperSearchParams
): Promise<ApifyScrapedLead[]> {
  const apiKey =
    params.apiKey ||
    process.env.OUTSCRAPER_API_KEY ||
    process.env.APIFY_API_TOKEN ||
    process.env.APIFY_API_KEY;

  const limit = Math.min(params.limit || 10, 50);
  const location = params.location || 'Indonesia';
  const role = params.role || 'Director';
  const industry = params.industry || 'Technology & Services';

  if (!apiKey) {
    throw new Error('Outscraper API Key is not configured. Please set it in Outreach Settings or .env');
  }

  // 1. Build targeted search queries
  const searchQueries: string[] = [];

  if (params.query) {
    searchQueries.push(`${params.query}, ${location}`);
  } else if (industry && !industry.toLowerCase().includes('other') && !industry.toLowerCase().includes('custom')) {
    searchQueries.push(`${industry}, ${location}`);
    if (role) {
      searchQueries.push(`${role} ${industry}, ${location}`);
    }
  } else if (role) {
    const rLow = role.toLowerCase();
    if (rLow.includes('tech') || rLow.includes('cto') || rLow.includes('developer') || rLow.includes('it')) {
      searchQueries.push(`Software Company, ${location}`);
      searchQueries.push(`IT Consulting, ${location}`);
    } else if (rLow.includes('marketing') || rLow.includes('cmo') || rLow.includes('sales')) {
      searchQueries.push(`Digital Marketing Agency, ${location}`);
    } else if (rLow.includes('founder') || rLow.includes('ceo') || rLow.includes('owner')) {
      searchQueries.push(`Startup Enterprise, ${location}`);
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
  )}&limit=${Math.min(Math.max(limit * 2, 25), 200)}&async=false`;

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

  // 3. Extract and sanitize corporate websites
  const domainToPlaceMap = new Map<string, any>();
  const validWebsites: string[] = [];

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
          domainToPlaceMap.set(hostname, place);
          validWebsites.push(parsed.origin);
        }
      } catch {
        // Skip malformed
      }
    }
  }

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

  // 5. Assemble Structured Leads with strict personnel naming
  const leads: ApifyScrapedLead[] = [];
  const seenEntities = new Set<string>();

  for (const place of validPlaces) {
    if (!place?.name) continue;

    const rawCompanyName = place.name.trim();
    const cleanCompany = cleanCorporateName(rawCompanyName);

    if (seenEntities.has(cleanCompany.toLowerCase())) continue;
    seenEntities.add(cleanCompany.toLowerCase());

    let domain: string | undefined;
    if (place.website) {
      try {
        const p = new URL(place.website.startsWith('http') ? place.website : `https://${place.website}`);
        domain = p.hostname.replace(/^www\./, '').toLowerCase();
      } catch {
        // ignore
      }
    }

    const enriched = domain ? domainEnrichmentMap.get(domain) : undefined;
    let contactPersonName: string | undefined;
    let contactPersonTitle: string | undefined;
    let contactLinkedIn: string | undefined;
    const corporateEmails: string[] = [];
    const personalEmails: string[] = [];

    // Check enriched contacts array for authentic individual humans
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
        if (!contactPersonName && ct.full_name && !LEGAL_ENTITY_REGEX.test(ct.full_name)) {
          contactPersonName = ct.full_name.trim();
          contactPersonTitle = ct.title || ct.role;
        }
        if (!contactLinkedIn && ct.socials?.linkedin) {
          contactLinkedIn = ct.socials.linkedin.startsWith('http')
            ? ct.socials.linkedin
            : `https://linkedin.com/in/${ct.socials.linkedin}`;
        }
      }
    }

    // Process enriched emails
    if (enriched?.emails && Array.isArray(enriched.emails)) {
      for (const em of enriched.emails) {
        if (em?.value && em.value.includes('@')) {
          const val = em.value.toLowerCase().trim();
          if (domain && val.endsWith(`@${domain}`)) {
            corporateEmails.push(val);
          } else {
            personalEmails.push(val);
          }
          if (!contactPersonName && em.full_name && !LEGAL_ENTITY_REGEX.test(em.full_name)) {
            contactPersonName = em.full_name.trim();
            contactPersonTitle = em.title || em.role;
          }
          if (!contactLinkedIn && em.socials?.linkedin) {
            contactLinkedIn = em.socials.linkedin.startsWith('http')
              ? em.socials.linkedin
              : `https://linkedin.com/in/${em.socials.linkedin}`;
          }
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

    const cleanCorporate = Array.from(new Set(corporateEmails)).filter(
      (e) => !e.includes('wixpress.com') && !e.includes('sentry.io') && !e.includes('example.com')
    );

    const cleanPersonal = Array.from(new Set(personalEmails)).filter(
      (e) => !e.includes('wixpress.com') && !e.includes('sentry.io') && !e.includes('example.com')
    );

    if (cleanCorporate.length === 0 && domain) {
      cleanCorporate.push(`contact@${domain}`);
      cleanCorporate.push(`info@${domain}`);
    }

    const primaryEmail = cleanCorporate[0] || cleanPersonal[0] || (domain ? `contact@${domain}` : undefined);

    // Strict Human Prospect Name formatting (Prevent company name from becoming the person's name)
    let fullName: string;
    let jobTitle: string;

    if (contactPersonName && !LEGAL_ENTITY_REGEX.test(contactPersonName)) {
      fullName = contactPersonName;
      jobTitle = contactPersonTitle || role || 'Executive Director';
    } else {
      fullName = `${role || 'Executive Lead'} - ${cleanCompany}`;
      jobTitle = role || place.category || 'Executive Decision Maker';
    }

    const nameParts = fullName.split(/\s+/);

    const lead: ApifyScrapedLead = {
      fullName,
      firstName: nameParts[0] || 'Executive',
      lastName: nameParts.slice(1).join(' ') || undefined,
      jobTitle,
      companyName: cleanCompany,
      companyDomain: domain,
      linkedinUrl: contactLinkedIn || (enriched?.socials?.linkedin ? `https://linkedin.com/company/${enriched.socials.linkedin}` : undefined),
      location: place.city ? `${place.city}, ${place.country || location}` : place.full_address || place.address || location,
      email: primaryEmail || undefined,
      summary: `${cleanCompany} located in ${place.city || location}. Phone: ${place.phone || 'N/A'}. Category: ${place.category || 'Commercial Enterprise'}.`,
      metadata: {
        source: 'business-directory-outscraper',
        scrapedAt: new Date().toISOString(),
        phone: place.phone || undefined,
        address: place.full_address || place.address || undefined,
      },
    };

    leads.push(lead);
    if (leads.length >= limit) break;
  }

  return leads;
}
