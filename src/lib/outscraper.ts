import { ApifyScrapedLead, isValidHumanProspect } from './apify';

export interface OutscraperSearchParams {
  query: string;
  location?: string;
  limit?: number;
  apiKey?: string;
  language?: string;
}

export interface OutscraperBusinessLead {
  name: string;
  site?: string;
  type?: string;
  phone?: string;
  full_address?: string;
  city?: string;
  state?: string;
  country?: string;
  emails?: string[];
  contacts?: Array<{
    value: string;
    type: string;
    name?: string;
    title?: string;
  }>;
}

/**
 * Searches business leads and contacts using Outscraper API
 */
export async function scrapeOutscraperLeads(
  params: OutscraperSearchParams
): Promise<ApifyScrapedLead[]> {
  const apiKey = params.apiKey || process.env.OUTSCRAPER_API_KEY;
  if (!apiKey) {
    throw new Error('Outscraper API Key is not configured. Please set OUTSCRAPER_API_KEY in .env');
  }

  const limit = Math.max(params.limit || 20, 1);
  const searchQuery = [params.query, params.location].filter(Boolean).join(', ');

  const url = `https://api.app.outscraper.com/maps/search-v2?query=${encodeURIComponent(
    searchQuery
  )}&limit=${Math.min(limit, 500)}&enrichment=emails_and_contacts&async=false`;

  const response = await fetch(url, {
    method: 'GET',
    headers: {
      'X-API-KEY': apiKey,
      Accept: 'application/json',
    },
  });

  if (!response.ok) {
    const errText = await response.text();
    throw new Error(`Outscraper API error (${response.status}): ${errText}`);
  }

  const data = await response.json();
  const rawResults: any[] = Array.isArray(data?.data) ? data.data.flat() : [];

  const leads: ApifyScrapedLead[] = [];

  for (const item of rawResults) {
    if (!item) continue;

    const companyName = item.name || 'Business Contact';
    const site = item.site || '';
    let domain: string | undefined;
    try {
      if (site) {
        const parsed = new URL(site.startsWith('http') ? site : `https://${site}`);
        domain = parsed.hostname.replace(/^www\./, '');
      }
    } catch {
      domain = undefined;
    }

    // Extract emails from Outscraper enrichment
    const extractedEmails: string[] = [];
    if (Array.isArray(item.emails)) {
      extractedEmails.push(...item.emails);
    }
    if (Array.isArray(item.contacts)) {
      for (const contact of item.contacts) {
        if (contact.type === 'email' && contact.value) {
          extractedEmails.push(contact.value);
        }
      }
    }

    const uniqueEmails = Array.from(new Set(extractedEmails.map((e) => e.toLowerCase().trim()))).filter(
      (e) => e.includes('@') && !e.includes('example.com') && !e.includes('wixpress.com')
    );

    const primaryEmail = uniqueEmails[0];
    const contactName = item.owner_name || item.name || 'Business Executive';
    const nameParts = contactName.split(/\s+/);

    const lead: ApifyScrapedLead = {
      fullName: contactName,
      firstName: nameParts[0] || 'Executive',
      lastName: nameParts.slice(1).join(' ') || undefined,
      jobTitle: item.type || 'Business Owner',
      companyName,
      companyDomain: domain,
      location: item.city ? `${item.city}, ${item.country || params.location || 'Global'}` : item.full_address || params.location || 'Global',
      email: primaryEmail || undefined,
      summary: `Business lead for ${companyName} (${item.type || 'Commercial enterprise'}). Phone: ${item.phone || 'N/A'}.`,
      metadata: {
        source: 'outscraper-b2b',
        scrapedAt: new Date().toISOString(),
        phone: item.phone || undefined,
        rating: item.rating || undefined,
        reviewsCount: item.reviews || undefined,
      },
    };

    leads.push(lead);
  }

  return leads.slice(0, limit);
}
