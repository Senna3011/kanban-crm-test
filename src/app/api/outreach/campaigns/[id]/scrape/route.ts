import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/server/auth';
import prisma from '@/lib/prisma';
import { scrapeApifyLeads, ApifyScrapedLead } from '@/lib/apify';
import { scrapeOutscraperLeads } from '@/lib/outscraper';
import { searchTregLeadsWithCost, TregSearchResult } from '@/lib/treg';
import { estimateLeadSearchCost } from '@/lib/treg-billing';
import { sanitizeOutreachError } from '@/lib/outreach-error';
import { outreachScrapeQueue } from '@/../queue';

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> | { id: string } }
) {
  const session = await getServerSession(authOptions);
  if (!session?.user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const resolvedParams = await params;
  const campaignId = resolvedParams.id;
  const tenantId = (session.user as any).tenantId;

  const campaign = await prisma.outreachCampaign.findFirst({
    where: { id: campaignId, tenantId },
    include: { account: true },
  });

  if (!campaign) {
    return NextResponse.json({ error: 'Campaign not found' }, { status: 404 });
  }

  let activeProvider = 'gateway';
  let runLogId: string | null = null;

  try {
    const body = await req.json().catch(() => ({}));
    const query = body.query || campaign.searchQuery || undefined;
    const role = body.role || campaign.targetRole || 'Chief Technology Officer';
    const location = body.location || campaign.targetLocation || 'United States';
    const industry = body.industry || campaign.targetIndustry || undefined;
    const limit = Number(body.limit) || 10;
    const rawProvider = String(body.provider || '').toLowerCase();
    const provider: 'treg' | 'outscraper' | 'apify' =
      rawProvider === 'outscraper'
        ? 'outscraper'
        : rawProvider === 'apify'
        ? 'apify'
        : 'treg';
    activeProvider = provider;
    const linkedinUrls = Array.isArray(body.linkedinUrls) ? body.linkedinUrls : undefined;

    const estimatedCostUsd = estimateLeadSearchCost(provider, limit);

    // For massive scale (> 30 leads or async requested), enqueue to BullMQ background worker
    if (limit > 30 || body.async === true) {
      if (campaign.status === 'RUNNING') {
        return NextResponse.json({
          success: true,
          queued: true,
          alreadyRunning: true,
          message: 'Pencarian leads sedang berjalan di background worker. Data akan ter-update otomatis.',
        });
      }

      const runLog = await prisma.outreachRunLog.create({
        data: {
          campaignId: campaign.id,
          tenantId,
          step: 'SCRAPE',
          provider,
          status: 'RUNNING',
          itemsRequested: limit,
          estimatedCostUsd,
          costSource: provider === 'treg' ? 'verified_ledger' : 'catalog_estimate',
        },
      });
      runLogId = runLog.id;

      await prisma.outreachCampaign.update({
        where: { id: campaign.id },
        data: { status: 'RUNNING' },
      });

      const job = await outreachScrapeQueue.add(
        'outreach_scrape',
        {
          type: 'outreach_scrape',
          tenantId,
          campaignId: campaign.id,
          runLogId: runLog.id,
          query,
          role,
          location,
          industry,
          limit,
          provider,
          apiToken: campaign.account?.apifyApiToken || process.env.APIFY_API_TOKEN,
        },
        {
          attempts: 2,
          backoff: { type: 'exponential', delay: 5000 },
          removeOnComplete: true,
        }
      );

      return NextResponse.json({
        success: true,
        queued: true,
        jobId: job.id,
        runLog,
        estimatedCostUsd,
        message: `Pencarian ${limit} leads dijadwalkan di background worker.`,
      });
    }

    // Fast synchronous scrape for interactive UI (<= 30 items)
    const runLog = await prisma.outreachRunLog.create({
      data: {
        campaignId: campaign.id,
        tenantId,
        step: 'SCRAPE',
        provider,
        status: 'RUNNING',
        itemsRequested: limit,
        estimatedCostUsd,
        costSource: provider === 'treg' ? 'verified_ledger' : 'catalog_estimate',
      },
    });
    runLogId = runLog.id;

    const apiToken = campaign.account?.apifyApiToken || process.env.APIFY_API_TOKEN || process.env.APIFY_API_KEY;

    let scrapedLeads: ApifyScrapedLead[] = [];
    let executedProvider: 'treg' | 'outscraper' | 'apify' = provider;
    let tregTelemetry: TregSearchResult | null = null;

    if (provider === 'treg') {
      try {
        tregTelemetry = await searchTregLeadsWithCost({
          query,
          role,
          location,
          industry,
          limit,
        });
        scrapedLeads = tregTelemetry.leads;
      } catch (err: any) {
        console.warn(`[Scrape Route] Treg Gateway error: ${err.message}. Trying Outscraper fallback.`);
        try {
          executedProvider = 'outscraper';
          scrapedLeads = await scrapeOutscraperLeads({
            query,
            role,
            location,
            industry,
            limit,
          });
        } catch (outErr: any) {
          console.warn(`[Scrape Route] Outscraper fallback failed: ${outErr.message}. Trying Apify.`);
          executedProvider = 'apify';
          scrapedLeads = await scrapeApifyLeads({
            query,
            role,
            location,
            industry,
            limit,
            apiToken,
            linkedinUrls,
          });
        }
      }
    } else if (provider === 'outscraper') {
      executedProvider = 'outscraper';
      scrapedLeads = await scrapeOutscraperLeads({
        query,
        role,
        location,
        industry,
        limit,
      });
    } else {
      executedProvider = 'apify';
      scrapedLeads = await scrapeApifyLeads({
        query,
        role,
        location,
        industry,
        limit,
        linkedinUrls,
        apiToken,
      });
    }

    // Check leads existing specifically in this campaign
    const campaignLeads = await prisma.outreachLead.findMany({
      where: { campaignId: campaign.id },
      select: { linkedinUrl: true, email: true, companyName: true },
    });

    const campaignUrls = new Set(campaignLeads.map((l) => l.linkedinUrl).filter(Boolean));
    const campaignEmails = new Set(campaignLeads.map((l) => l.email).filter(Boolean));
    const campaignCompanies = new Set(campaignLeads.map((l) => l.companyName?.toLowerCase().trim()).filter(Boolean));

    const leadsToInsert = [];
    let skippedDuplicates = 0;

    for (const lead of scrapedLeads) {
      const isDuplicateUrl = lead.linkedinUrl && campaignUrls.has(lead.linkedinUrl);
      const isDuplicateEmail = lead.email && campaignEmails.has(lead.email);
      const isDuplicateCompany = !lead.linkedinUrl && !lead.email && lead.companyName && campaignCompanies.has(lead.companyName.toLowerCase().trim());

      if (isDuplicateUrl || isDuplicateEmail || isDuplicateCompany) {
        skippedDuplicates++;
        continue;
      }

      leadsToInsert.push({
        fullName: String(lead.fullName || 'Executive Prospect'),
        firstName: lead.firstName ? String(lead.firstName) : null,
        lastName: lead.lastName ? String(lead.lastName) : null,
        jobTitle: lead.jobTitle ? String(lead.jobTitle) : null,
        companyName: lead.companyName ? String(lead.companyName) : null,
        companyDomain: lead.companyDomain ? String(lead.companyDomain) : null,
        linkedinUrl: lead.linkedinUrl ? String(lead.linkedinUrl) : null,
        location: lead.location ? String(lead.location) : null,
        email: lead.email ? String(lead.email) : null,
        verifyStatus: 'UNVERIFIED',
        status: 'SCRAPED' as const,
        metadata: {
          summary: lead.summary ? String(lead.summary) : undefined,
          source:
            lead.metadata?.source ||
            (executedProvider === 'treg'
              ? 'on-demand-gateway'
              : 'discovery-live'),
          ...(lead.metadata || {}),
          scrapedAt: new Date().toISOString(),
        },
        campaignId: campaign.id,
      });

      if (lead.linkedinUrl) campaignUrls.add(lead.linkedinUrl);
      if (lead.email) campaignEmails.add(lead.email);
      if (lead.companyName) campaignCompanies.add(lead.companyName.toLowerCase().trim());

      if (leadsToInsert.length >= limit) {
        break;
      }
    }

    if (leadsToInsert.length > 0) {
      await prisma.outreachLead.createMany({
        data: leadsToInsert,
        skipDuplicates: true,
      });
    }

    const actualCostUsd = tregTelemetry
      ? tregTelemetry.actualCostUsd
      : estimateLeadSearchCost(executedProvider, scrapedLeads.length);

    const completedRunLog = await prisma.outreachRunLog.update({
      where: { id: runLog.id },
      data: {
        provider: executedProvider,
        status: 'COMPLETED',
        itemsProcessed: tregTelemetry ? tregTelemetry.rawRecordsReturned : scrapedLeads.length,
        itemsSaved: leadsToInsert.length,
        actualCostUsd,
        balanceBeforeUsd: tregTelemetry ? tregTelemetry.balanceBeforeUsd : null,
        balanceAfterUsd: tregTelemetry ? tregTelemetry.balanceAfterUsd : null,
        costSource: tregTelemetry ? tregTelemetry.costSource : 'catalog_estimate',
        metadata: {
          skippedDuplicates,
          ...(tregTelemetry
            ? {
                apiCallsMade: tregTelemetry.apiCallsMade,
                billedCallsCount: tregTelemetry.billedCallsCount,
                actualCostMicro: tregTelemetry.actualCostMicro,
                callIds: tregTelemetry.callIds,
              }
            : {}),
        },
        completedAt: new Date(),
      },
    });

    return NextResponse.json({
      success: true,
      count: leadsToInsert.length,
      skippedDuplicates,
      costUsd: actualCostUsd,
      costSource: completedRunLog.costSource,
      balanceBeforeUsd: completedRunLog.balanceBeforeUsd,
      balanceAfterUsd: completedRunLog.balanceAfterUsd,
      rawRecordsReturned: completedRunLog.itemsProcessed,
      runLog: completedRunLog,
    });
  } catch (error: any) {
    if (runLogId) {
      await prisma.outreachRunLog
        .update({
          where: { id: runLogId },
          data: {
            status: 'FAILED',
            actualCostUsd: 0,
            completedAt: new Date(),
            metadata: { error: String(error?.message || 'Scrape failed').slice(0, 300) },
          },
        })
        .catch(() => {});
    }

    const sanitized = sanitizeOutreachError(error, {
      provider: activeProvider,
      action: 'scrape',
      campaignId,
    });
    return NextResponse.json(
      { error: sanitized.clientMessage, code: sanitized.errorCode },
      { status: sanitized.statusCode }
    );
  }
}
