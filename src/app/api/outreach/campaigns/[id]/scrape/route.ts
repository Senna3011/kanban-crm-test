import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/server/auth';
import prisma from '@/lib/prisma';
import { scrapeApifyLeads } from '@/lib/apify';

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
    const query = body.query || campaign.searchQuery || campaign.targetRole || 'VP of Technology';
    const role = body.role || campaign.targetRole || undefined;
    const location = body.location || campaign.targetLocation || undefined;
    const industry = body.industry || campaign.targetIndustry || undefined;
    const limit = Number(body.limit) || 10;
    const linkedinUrls = Array.isArray(body.linkedinUrls) ? body.linkedinUrls : undefined;

    // Use account specific Apify token if configured, otherwise env default
    const apiToken = campaign.account?.apifyApiToken || process.env.APIFY_API_TOKEN || process.env.APIFY_API_KEY;
    const actorId = process.env.APIFY_ACTOR_ID || 'harvestapi/linkedin-profile-scraper';

    const scrapedLeads = await scrapeApifyLeads({
      query,
      role,
      location,
      industry,
      limit,
      linkedinUrls,
      apiToken,
      actorId,
    });

    // Cross-campaign deduplication for the tenant
    const existingLeads = await prisma.outreachLead.findMany({
      where: {
        campaign: { tenantId },
      },
      select: {
        linkedinUrl: true,
        email: true,
        fullName: true,
      },
    });

    const existingUrls = new Set(existingLeads.map((l) => l.linkedinUrl).filter(Boolean));
    const existingEmails = new Set(existingLeads.map((l) => l.email).filter(Boolean));

    const createdLeads = [];
    let skippedDuplicates = 0;

    for (const lead of scrapedLeads) {
      // Check if lead already exists in this or another campaign for this tenant
      const isDuplicateUrl = lead.linkedinUrl && existingUrls.has(lead.linkedinUrl);
      const isDuplicateEmail = lead.email && existingEmails.has(lead.email);

      if (isDuplicateUrl || isDuplicateEmail) {
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
            source: 'apify',
            ...(lead.metadata || {}),
            scrapedAt: new Date().toISOString(),
          },
          campaignId: campaign.id,
        },
      });

      if (lead.linkedinUrl) existingUrls.add(lead.linkedinUrl);
      if (lead.email) existingEmails.add(lead.email);
      createdLeads.push(created);
    }

    return NextResponse.json({
      success: true,
      count: createdLeads.length,
      skippedDuplicates,
      leads: createdLeads,
    });
  } catch (error: any) {
    console.error('[API OUTREACH SCRAPE - APIFY] Error:', error);
    return NextResponse.json({ error: error.message || 'Apify lead scraping failed' }, { status: 500 });
  }
}
