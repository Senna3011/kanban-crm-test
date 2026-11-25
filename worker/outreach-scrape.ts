import { prisma } from '../src/lib/prisma';
import { scrapeApifyLeads, ApifyScrapedLead } from '../src/lib/apify';
import { scrapeOutscraperLeads } from '../src/lib/outscraper';
import { searchTregLeadsWithCost, TregSearchResult } from '../src/lib/treg';
import { estimateLeadSearchCost } from '../src/lib/treg-billing';
import { maskSensitiveInfo } from '../src/lib/outreach-error';
import { OutreachScrapeJob } from '../queue/jobs';

export async function processOutreachScrape(job: OutreachScrapeJob) {
  console.log(`[Scrape Worker] Starting discovery scrape for campaign ${job.campaignId} (Target: ${job.limit} leads, Provider: ${job.provider || 'treg'})`);

  let runLogId = job.runLogId;

  try {
    const campaign = await prisma.outreachCampaign.findUnique({
      where: { id: job.campaignId },
      include: { account: true },
    });

    if (!campaign) {
      throw new Error(`Campaign ${job.campaignId} not found`);
    }

    const requestedProvider = job.provider || 'treg';
    if (!runLogId) {
      const created = await prisma.outreachRunLog.create({
        data: {
          campaignId: job.campaignId,
          tenantId: job.tenantId || campaign.tenantId,
          step: 'SCRAPE',
          provider: requestedProvider,
          status: 'RUNNING',
          itemsRequested: job.limit,
          estimatedCostUsd: estimateLeadSearchCost(requestedProvider, job.limit),
          costSource: requestedProvider === 'treg' ? 'verified_ledger' : 'catalog_estimate',
        },
      });
      runLogId = created.id;
    }

    const token = job.apiToken || campaign.account?.apifyApiToken || process.env.APIFY_API_TOKEN;
    let executedProvider: 'treg' | 'outscraper' | 'apify' = requestedProvider;
    let tregTelemetry: TregSearchResult | null = null;

    // Single-batch scrape helper used by the refill loop below.
    // Returns the leads for the batch plus any treg telemetry (for cost accounting).
    async function scrapeBatch(limit: number): Promise<{
      leads: ApifyScrapedLead[];
      telemetry: TregSearchResult | null;
    }> {
      let batchTelemetry: TregSearchResult | null = null;
      if (job.provider === 'treg' || (!job.provider && process.env.TREG_API_KEY)) {
        try {
          batchTelemetry = await searchTregLeadsWithCost({
            query: job.query,
            role: job.role,
            location: job.location,
            industry: job.industry,
            limit,
          });
          executedProvider = 'treg';
          return { leads: batchTelemetry.leads, telemetry: batchTelemetry };
        } catch (err: any) {
          console.warn(`[Scrape Worker] Treg Gateway error: ${err.message}. Trying Outscraper cross-fallback.`);
          try {
            executedProvider = 'outscraper';
            const leads = await scrapeOutscraperLeads({
              query: job.query || job.role || job.industry || 'Business Executive',
              location: job.location || 'United States',
              limit,
            });
            return { leads, telemetry: null };
          } catch (outErr: any) {
            console.warn(`[Scrape Worker] Outscraper cross-fallback failed (${outErr.message}). Falling back to Apify.`);
            executedProvider = 'apify';
            const leads = await scrapeApifyLeads({
              query: job.query,
              role: job.role,
              location: job.location,
              industry: job.industry,
              limit,
              apiToken: token,
            });
            return { leads, telemetry: null };
          }
        }
      } else if (job.provider === 'outscraper' || process.env.OUTSCRAPER_API_KEY) {
        executedProvider = 'outscraper';
        try {
          const leads = await scrapeOutscraperLeads({
            query: job.query || job.role || job.industry || 'Business Executive',
            location: job.location || 'Indonesia',
            limit,
          });
          return { leads, telemetry: null };
        } catch (err: any) {
          console.warn(`[Scrape Worker] Outscraper fallback to Apify due to: ${err.message}`);
          executedProvider = 'apify';
          const leads = await scrapeApifyLeads({
            query: job.query,
            role: job.role,
            location: job.location,
            industry: job.industry,
            limit,
            apiToken: token,
          });
          return { leads, telemetry: null };
        }
      } else {
        executedProvider = 'apify';
        const leads = await scrapeApifyLeads({
          query: job.query,
          role: job.role,
          location: job.location,
          industry: job.industry,
          limit,
          apiToken: token,
          onProgress: (p) => {
            console.log(`[Scrape Worker][Campaign ${job.campaignId}] ${p.status}`);
          },
        });
        return { leads, telemetry: null };
      }
    }

    // Refill loop: keep scraping until saved >= limit or max retries reached.
    const MAX_REFILL = 3;
    let totalInserted = 0;
    let totalScraped = 0;
    let refillAttempt = 0;

    while (totalInserted < job.limit && refillAttempt < MAX_REFILL) {
      refillAttempt++;
      const remaining = job.limit - totalInserted;
      console.log(`[Scrape Worker] Refill attempt ${refillAttempt}/${MAX_REFILL}: scraping ${remaining} leads (inserted so far: ${totalInserted})`);

      const { leads: batchLeads, telemetry: batchTelemetry } = await scrapeBatch(remaining);
      if (batchTelemetry) tregTelemetry = batchTelemetry;
      totalScraped += batchLeads.length;
      console.log(`[Scrape Worker] Scraped ${batchLeads.length} raw leads from provider (attempt ${refillAttempt}).`);

      // Check if campaign was cancelled or reset before inserting
      const checkCampaign = await prisma.outreachCampaign.findUnique({
        where: { id: job.campaignId },
        select: { status: true },
      });
      if (!checkCampaign || checkCampaign.status === 'DRAFT' || checkCampaign.status === 'PAUSED') {
        console.log(`[Scrape Worker] Campaign ${job.campaignId} was cancelled by user. Aborting insertion.`);
        if (runLogId) {
          await prisma.outreachRunLog
            .update({
              where: { id: runLogId },
              data: {
                provider: executedProvider,
                status: 'FAILED',
                itemsProcessed: totalScraped,
                itemsSaved: 0,
                actualCostUsd: tregTelemetry ? tregTelemetry.actualCostUsd : 0,
                balanceBeforeUsd: tregTelemetry ? tregTelemetry.balanceBeforeUsd : null,
                balanceAfterUsd: tregTelemetry ? tregTelemetry.balanceAfterUsd : null,
                costSource: tregTelemetry ? tregTelemetry.costSource : 'catalog_estimate',
                metadata: { reason: 'Campaign cancelled during background scrape' },
                completedAt: new Date(),
              },
            })
            .catch(() => {});
        }
        return { success: false, cancelled: true };
      }

async function insertChunkedWithRetry(chunk: any[]): Promise<number> {
      const MAX_INSERT_RETRY = 3;
      for (let attempt = 1; attempt <= MAX_INSERT_RETRY; attempt++) {
        try {
          const result = await prisma.outreachLead.createMany({
            data: chunk,
            skipDuplicates: true,
          });
          return result.count;
        } catch (err: any) {
          const msg = err?.message || '';
          if ((msg.includes('EMAXCONNSESSION') || msg.includes('max clients reached')) && attempt < MAX_INSERT_RETRY) {
            const delayMs = attempt * 2000;
            console.warn(`[Scrape Worker] DB pool exhausted (EMAXCONNSESSION), retry ${attempt}/${MAX_INSERT_RETRY} in ${delayMs}ms...`);
            await new Promise((r) => setTimeout(r, delayMs));
            continue;
          }
          throw err;
        }
      }
      return 0;
    }

    // Chunked batch insertion (500 leads per chunk) to optimize Supabase memory & network
    const chunkSize = 500;
    let insertedCount = 0;

    for (let i = 0; i < batchLeads.length; i += chunkSize) {
      const chunk = batchLeads.slice(i, i + chunkSize);

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
        verifyStatus: 'UNVERIFIED',
        status: 'SCRAPED' as const,
        metadata: lead.metadata || { source: 'lead-discovery-bulk' },
      }));

      insertedCount += await insertChunkedWithRetry(leadData);
    }

      totalInserted += insertedCount;
      console.log(`[Scrape Worker] Inserted ${insertedCount} leads (attempt ${refillAttempt}), total inserted: ${totalInserted}`);

      // Early-stop: provider returned leads but none survived dedup — inventory exhausted
      if (insertedCount === 0 && batchLeads.length > 0) {
        console.warn(`[Scrape Worker] Refill attempt ${refillAttempt} produced 0 new leads after dedup — stopping refill loop early.`);
        break;
      }
      // Early-stop: provider returned nothing at all
      if (batchLeads.length === 0) {
        console.warn(`[Scrape Worker] Provider returned 0 leads — stopping refill loop early.`);
        break;
      }
    }

    const shortfallRequested = job.limit;
    const shortfallSaved = totalInserted;
    const hasShortfall = shortfallSaved < shortfallRequested;

    console.log(`[Scrape Worker] Finished refill. Total inserted ${totalInserted} leads into campaign ${job.campaignId} (scraped ${totalScraped} raw)${hasShortfall ? ` — SHORTFALL: ${shortfallSaved}/${shortfallRequested}` : ''}.`);

    const actualCostUsd = tregTelemetry
      ? tregTelemetry.actualCostUsd
      : estimateLeadSearchCost(executedProvider, totalScraped);

    if (runLogId) {
      const baseMeta: any = tregTelemetry
        ? {
            apiCallsMade: tregTelemetry.apiCallsMade,
            billedCallsCount: tregTelemetry.billedCallsCount,
            actualCostMicro: tregTelemetry.actualCostMicro,
            callIds: tregTelemetry.callIds,
          }
        : {};

      if (hasShortfall) {
        baseMeta.shortfall = true;
        baseMeta.requested = shortfallRequested;
        baseMeta.saved = shortfallSaved;
        baseMeta.reason = 'Provider inventory exhausted or results were duplicates of existing leads. Refine location, role, or industry to increase matches.';
      }

      await prisma.outreachRunLog
        .update({
          where: { id: runLogId },
          data: {
            provider: executedProvider,
            status: 'COMPLETED',
            itemsProcessed: totalScraped,
            itemsSaved: totalInserted,
            actualCostUsd,
            balanceBeforeUsd: tregTelemetry ? tregTelemetry.balanceBeforeUsd : null,
            balanceAfterUsd: tregTelemetry ? tregTelemetry.balanceAfterUsd : null,
            costSource: tregTelemetry ? tregTelemetry.costSource : 'catalog_estimate',
            metadata: baseMeta,
            completedAt: new Date(),
          },
        })
        .catch(() => {});
    }

    // Reset campaign status: if drip automation is enabled, keep RUNNING so scheduler processes drip follow-ups; otherwise return to DRAFT
    const finalStatus = campaign.dripEnabled ? 'RUNNING' : 'DRAFT';
    await prisma.outreachCampaign.update({
      where: { id: job.campaignId },
      data: { status: finalStatus },
    }).catch(() => {});

    return { success: true, count: totalInserted, actualCostUsd, shortfall: hasShortfall ? { requested: shortfallRequested, saved: shortfallSaved } : null };
  } catch (err: any) {
    console.error(`[Scrape Worker] Scrape error for campaign ${job.campaignId}:`, maskSensitiveInfo(err?.message || 'Unknown error'));
    if (runLogId) {
      await prisma.outreachRunLog
        .update({
          where: { id: runLogId },
          data: {
            status: 'FAILED',
            actualCostUsd: 0,
            completedAt: new Date(),
            metadata: { error: maskSensitiveInfo(err?.message || 'Unknown error').slice(0, 300) },
          },
        })
        .catch(() => {});
    }
    await prisma.outreachCampaign.update({
      where: { id: job.campaignId },
      data: { status: 'DRAFT' },
    }).catch(() => {});
    throw err;
  }
}
