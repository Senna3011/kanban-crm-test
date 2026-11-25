import { prisma } from '../src/lib/prisma';
import { scrapeApifyLeads, ApifyScrapedLead } from '../src/lib/apify';
import { scrapeOutscraperLeads } from '../src/lib/outscraper';
import { searchTregLeadsWithCost, TregSearchResult, getCountriesInContinent } from '../src/lib/treg';
import { estimateLeadSearchCost } from '../src/lib/treg-billing';
import { maskSensitiveInfo } from '../src/lib/outreach-error';
import { OutreachScrapeJob } from '../queue/jobs';
import { outreachVerifyQueue } from '../queue';

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
    async function scrapeBatch(limit: number, forcedProvider?: string): Promise<{
      leads: ApifyScrapedLead[];
      telemetry: TregSearchResult | null;
    }> {
      let batchTelemetry: TregSearchResult | null = null;
      const activeProvider = forcedProvider || job.provider;
      if (activeProvider === 'treg' || (!activeProvider && process.env.TREG_API_KEY)) {
        // Redis cache for Treg raw results (24h) to avoid re-billing identical queries
        const cacheKey = `treg:cache:${Buffer.from(JSON.stringify({c:job.campaignId,q:job.query,r:job.role,l:job.location,i:job.industry})).toString('base64')}`;
        try {
          const { default: Redis } = await import('ioredis');
          const redis = new Redis(process.env.REDIS_URL || 'redis://localhost:6379');
          const cached = await redis.get(cacheKey);
          if (cached) {
            const parsed = JSON.parse(cached);
            redis.disconnect();
            console.log(`[Scrape Worker] Treg cache HIT for ${cacheKey.slice(0,40)}...`);
            executedProvider = 'treg';
            return { leads: parsed.leads, telemetry: null };
          }
          batchTelemetry = await searchTregLeadsWithCost({
            query: job.query,
            role: job.role,
            location: job.location,
            industry: job.industry,
            limit,
          });
          await redis.set(cacheKey, JSON.stringify({ leads: batchTelemetry.leads }), 'EX', 86400);
          redis.disconnect();
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
      } else if (activeProvider === 'outscraper' || process.env.OUTSCRAPER_API_KEY) {
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
    const MAX_REFILL = job.limit >= 500 ? 5 : 3;
    let totalInserted = 0;
    let totalScraped = 0;
    let verifyQueued = false;
    let refillAttempt = 0;
    const providersTried: string[] = [];

    while (totalInserted < job.limit && refillAttempt < MAX_REFILL) {
      refillAttempt++;
      const remaining = job.limit - totalInserted;
      console.log(`[Scrape Worker] Refill attempt ${refillAttempt}/${MAX_REFILL}: scraping ${remaining} leads (inserted so far: ${totalInserted})`);

      const { leads: batchLeads, telemetry: batchTelemetry } = await scrapeBatch(remaining);
      if (!providersTried.includes(executedProvider)) providersTried.push(executedProvider);
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

    // Dedup pre-filter: skip emails already present in this campaign
    const existingEmails = await prisma.outreachLead.findMany({
      where: { campaignId: job.campaignId, email: { in: batchLeads.map((l) => l.email).filter(Boolean) as string[] } },
      select: { email: true },
    });
    const existingSet = new Set(existingEmails.map((e) => e.email));
    const dedupedLeads = batchLeads.filter((l) => !l.email || !existingSet.has(l.email));
    console.log(`[Scrape Worker] Dedup pre-filter: ${batchLeads.length} raw -> ${dedupedLeads.length} new (${batchLeads.length - dedupedLeads.length} duplicates skipped).`);

    for (let i = 0; i < dedupedLeads.length; i += chunkSize) {
      const chunk = dedupedLeads.slice(i, i + chunkSize);

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
        const fallbackOrder = ['treg', 'outscraper', 'apify'].filter((pp) => pp !== executedProvider);
        const nextProvider = fallbackOrder[0];
        if (nextProvider) {
          console.warn(`[Scrape Worker] ${executedProvider} produced 0 new leads — falling back to ${nextProvider}.`);
          const fb = await scrapeBatch(remaining, nextProvider);
          if (fb.leads.length > 0) {
            batchLeads.splice(0, batchLeads.length, ...fb.leads);
            if (fb.telemetry) tregTelemetry = fb.telemetry;
            continue;
          }
        }
        console.warn(`[Scrape Worker] No fallback provider available — stopping refill loop early.`);
        break;
      }
      // Early-stop: provider returned nothing at all
      if (batchLeads.length === 0) {
        console.warn(`[Scrape Worker] Provider returned 0 leads — stopping refill loop early.`);
        break;
      }
    }

    // Query broadening: if shortfall > 30% after all providers, try one broadened pass (continent-scoped)
    let broadened = false;
    let broadenedScope = 'none';
    if (totalInserted < job.limit * 0.7 && totalInserted > 0) {
      broadened = true;
      const continentCountries = getCountriesInContinent(job.location);
      const targetCountries = continentCountries.length > 0
        ? continentCountries.filter((c) => c.toLowerCase() !== (job.location || '').toLowerCase())
        : [];
      console.log(`[Scrape Worker] Shortfall >30% — running broadened pass (continent-scoped: ${targetCountries.join(', ') || 'global fallback'}, role preserved).`);

      const broadResults: any[] = [];
      const countriesToQuery = targetCountries.length > 0 ? targetCountries : [undefined];
      broadenedScope = targetCountries.length > 0 ? 'continent' : 'global';

      const broadPromises = countriesToQuery.map((country) =>
        searchTregLeadsWithCost({
          query: job.query,
          role: job.role,
          location: country,
          industry: job.industry,
          limit: Math.ceil((job.limit - totalInserted) / countriesToQuery.length) + 5,
        }).catch(() => null)
      );
      const broadSettled = await Promise.all(broadPromises);
      for (const r of broadSettled) {
        if (r && r.leads.length > 0) {
          broadResults.push(...r.leads);
          if (r) tregTelemetry = r;
        }
      }

      // Dedup across broad results
      const seenBroad = new Set<string>();
      const uniqueBroad = broadResults.filter((l) => {
        const key = (l.email || l.linkedinUrl || `${l.fullName}|${l.companyName}`).toLowerCase();
        if (seenBroad.has(key)) return false;
        seenBroad.add(key);
        return true;
      });

      if (uniqueBroad.length > 0) {
        const existingEmails = await prisma.outreachLead.findMany({
          where: { campaignId: job.campaignId, email: { in: uniqueBroad.map((l) => l.email).filter(Boolean) as string[] } },
          select: { email: true },
        });
        const existingSet = new Set(existingEmails.map((e) => e.email));
        const deduped = uniqueBroad.filter((l) => !l.email || !existingSet.has(l.email));
        const chunkSize = 500;
        for (let i = 0; i < deduped.length; i += chunkSize) {
          const chunk = deduped.slice(i, i + chunkSize);
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
            metadata: lead.metadata || { source: 'lead-discovery-broadened' },
          }));
          const result = await prisma.outreachLead.createMany({ data: leadData, skipDuplicates: true });
          totalInserted += result.count;
          totalScraped += chunk.length;
        }
        console.log(`[Scrape Worker] Broadened pass inserted ${totalInserted} total (scope: ${broadenedScope}).`);
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

      baseMeta.providersTried = providersTried;
      baseMeta.broadened = broadened;
      baseMeta.broadenedScope = broadenedScope;
      baseMeta.verifyQueued = verifyQueued;
      baseMeta.verifyApiKeyPresent = Boolean(campaign.account?.reoonApiKey || process.env.REOON_API_KEY);
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

    // Auto-verify: prove human identity via LinkedIn URL or SAFE email for all new leads
    if (totalInserted > 0) {
      try {
        await outreachVerifyQueue.add(
          'outreach_verify_batch',
          {
            type: 'outreach_verify_batch',
            tenantId: job.tenantId || campaign.tenantId,
            campaignId: job.campaignId,
            reoonApiKey: campaign.account?.reoonApiKey || process.env.REOON_API_KEY,
          },
          {
            attempts: 2,
            backoff: { type: 'exponential', delay: 10000 },
            removeOnComplete: true,
          }
        );
        verifyQueued = true;
        console.log(`[Scrape Worker] Queued auto-verify for campaign ${job.campaignId} (${totalInserted} new leads).`);
      } catch (queueErr: any) {
        console.warn(`[Scrape Worker] Failed to queue auto-verify: ${queueErr.message}`);
      }
    }


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
