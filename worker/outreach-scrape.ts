import { prisma } from '../src/lib/prisma';
import { scrapeApifyLeads, ApifyScrapedLead } from '../src/lib/apify';
import { scrapeOutscraperLeads } from '../src/lib/outscraper';
import { OutreachScrapeJob } from '../queue/jobs';

export async function processOutreachScrape(job: OutreachScrapeJob) {
  console.log(`[Scrape Worker] Starting discovery scrape for campaign ${job.campaignId} (Target: ${job.limit} leads, Provider: ${job.provider || 'apify'})`);

  const campaign = await prisma.outreachCampaign.findUnique({
    where: { id: job.campaignId },
    include: { account: true },
  });

  if (!campaign) {
    throw new Error(`Campaign ${job.campaignId} not found`);
  }

  const token = job.apiToken || campaign.account?.apifyApiToken || process.env.APIFY_API_TOKEN;
  let scrapedLeads: ApifyScrapedLead[] = [];

  if (job.provider === 'outscraper' || process.env.OUTSCRAPER_API_KEY) {
    try {
      scrapedLeads = await scrapeOutscraperLeads({
        query: job.query || job.role || job.industry || 'Business Executive',
        location: job.location || 'Indonesia',
        limit: job.limit,
      });
    } catch (err: any) {
      console.warn(`[Scrape Worker] Outscraper fallback to Apify due to: ${err.message}`);
      scrapedLeads = await scrapeApifyLeads({
        query: job.query,
        role: job.role,
        location: job.location,
        industry: job.industry,
        limit: job.limit,
        apiToken: token,
      });
    }
  } else {
    scrapedLeads = await scrapeApifyLeads({
      query: job.query,
      role: job.role,
      location: job.location,
      industry: job.industry,
      limit: job.limit,
      apiToken: token,
      onProgress: (p) => {
        console.log(`[Scrape Worker][Campaign ${job.campaignId}] ${p.status}`);
      },
    });
  }

  console.log(`[Scrape Worker] Scraped ${scrapedLeads.length} raw leads from provider.`);

  // Chunked batch insertion (500 leads per chunk) to optimize Supabase memory & network
  const chunkSize = 500;
  let insertedCount = 0;

  for (let i = 0; i < scrapedLeads.length; i += chunkSize) {
    const chunk = scrapedLeads.slice(i, i + chunkSize);

    const leadData = chunk.map((lead) => ({
      campaignId: job.campaignId,
      fullName: lead.fullName,
      firstName: lead.firstName || null,
      lastName: lead.lastName || null,
      jobTitle: lead.jobTitle || 'Executive',
      companyName: lead.companyName || null,
      companyDomain: lead.companyDomain || null,
      linkedinUrl: lead.linkedinUrl || null,
      location: lead.location || null,
      email: lead.email || null,
      status: lead.email ? ('VERIFYING' as const) : ('SCRAPED' as const),
      metadata: lead.metadata || { source: 'lead-discovery-bulk' },
    }));

    const result = await prisma.outreachLead.createMany({
      data: leadData,
      skipDuplicates: true,
    });

    insertedCount += result.count;
  }

  console.log(`[Scrape Worker] Successfully inserted ${insertedCount} leads into campaign ${job.campaignId}`);

  // Reset campaign status back to DRAFT or ACTIVE
  await prisma.outreachCampaign.update({
    where: { id: job.campaignId },
    data: { status: 'DRAFT' },
  }).catch(() => {});

  return { success: true, count: insertedCount };
}
