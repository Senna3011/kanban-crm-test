import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/server/auth';
import prisma from '@/lib/prisma';
import { scrapeApifyLeads } from '@/lib/apify';
import { scrapeOutscraperLeads } from '@/lib/outscraper';
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

  try {
    const body = await req.json().catch(() => ({}));
    const query = body.query || campaign.searchQuery || undefined;
    const role = body.role || campaign.targetRole || 'Chief Technology Officer';
    const location = body.location || campaign.targetLocation || 'United States';
    const industry = body.industry || campaign.targetIndustry || undefined;
    const limit = Number(body.limit) || 10;
    const provider = (body.provider === 'outscraper' ? 'outscraper' : 'apify') as 'apify' | 'outscraper';
    const linkedinUrls = Array.isArray(body.linkedinUrls) ? body.linkedinUrls : undefined;

    // For massive scale (> 30 leads or async requested), enqueue to BullMQ background worker
    if (limit > 30 || body.async === true) {
      const job = await outreachScrapeQueue.add(
        'outreach_scrape',
        {
          type: 'outreach_scrape',
          tenantId,
          campaignId: campaign.id,
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
        message: `Pencarian ${limit} leads dijadwalkan di background worker.`,
      });
    }

    // Fast synchronous scrape for interactive UI (<= 30 items)
    const apiToken = campaign.account?.apifyApiToken || process.env.APIFY_API_TOKEN || process.env.APIFY_API_KEY;

    let scrapedLeads = [];
    if (provider === 'outscraper') {
      scrapedLeads = await scrapeOutscraperLeads({
        query,
        role,
        location,
        industry,
        limit,
      });
    } else {
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

    const createdLeads = [];
    let skippedDuplicates = 0;

    for (const lead of scrapedLeads) {
      const isDuplicateUrl = lead.linkedinUrl && campaignUrls.has(lead.linkedinUrl);
      const isDuplicateEmail = lead.email && campaignEmails.has(lead.email);
      const isDuplicateCompany = !lead.linkedinUrl && !lead.email && lead.companyName && campaignCompanies.has(lead.companyName.toLowerCase().trim());

      if (isDuplicateUrl || isDuplicateEmail || isDuplicateCompany) {
        skippedDuplicates++;
        continue;
      }

      const created = await prisma.outreachLead.create({
        data: {
          fullName: String(lead.fullName || 'Executive Prospect'),
          firstName: lead.firstName ? String(lead.firstName) : null,
          lastName: lead.lastName ? String(lead.lastName) : null,
          jobTitle: lead.jobTitle ? String(lead.jobTitle) : null,
          companyName: lead.companyName ? String(lead.companyName) : null,
          companyDomain: lead.companyDomain ? String(lead.companyDomain) : null,
          linkedinUrl: lead.linkedinUrl ? String(lead.linkedinUrl) : null,
          location: lead.location ? String(lead.location) : null,
          email: lead.email ? String(lead.email) : null,
          status: 'SCRAPED',
          metadata: {
            summary: lead.summary ? String(lead.summary) : undefined,
            source: lead.metadata?.source || 'discovery-live',
            ...(lead.metadata || {}),
            scrapedAt: new Date().toISOString(),
          },
          campaignId: campaign.id,
        },
      });

      if (lead.linkedinUrl) campaignUrls.add(lead.linkedinUrl);
      if (lead.email) campaignEmails.add(lead.email);
      if (lead.companyName) campaignCompanies.add(lead.companyName.toLowerCase().trim());
      createdLeads.push(created);

      // Stop once we have reached the exact requested limit of newly inserted leads
      if (createdLeads.length >= limit) {
        break;
      }
    }

    return NextResponse.json({
      success: true,
      count: createdLeads.length,
      skippedDuplicates,
      leads: createdLeads,
    });
  } catch (error: any) {
    console.error('[API OUTREACH SCRAPE] Error:', error);
    return NextResponse.json({ error: error.message || 'Lead discovery failed' }, { status: 500 });
  }
}
