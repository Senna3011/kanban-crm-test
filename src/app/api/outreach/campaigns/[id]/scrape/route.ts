import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/server/auth';
import prisma from '@/lib/prisma';
import { searchLinkedInLeads } from '@/lib/outscraper';

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

    const apiKey = campaign.account?.outscraperApiKey || process.env.OUTSCRAPER_API_KEY;

    const scrapedLeads = await searchLinkedInLeads({
      query,
      role,
      location,
      industry,
      limit,
      apiKey,
    });

    const createdLeads = [];
    for (const lead of scrapedLeads) {
      const created = await prisma.outreachLead.create({
        data: {
          fullName: lead.fullName,
          firstName: lead.firstName,
          lastName: lead.lastName,
          jobTitle: lead.jobTitle,
          companyName: lead.companyName,
          companyDomain: lead.companyDomain,
          linkedinUrl: lead.linkedinUrl,
          location: lead.location,
          status: 'SCRAPED',
          metadata: {
            summary: lead.summary,
            scrapedAt: new Date().toISOString(),
          },
          campaignId: campaign.id,
        },
      });
      createdLeads.push(created);
    }

    return NextResponse.json({
      success: true,
      count: createdLeads.length,
      leads: createdLeads,
    });
  } catch (error: any) {
    console.error('[API OUTREACH SCRAPE] Error:', error);
    return NextResponse.json({ error: error.message || 'Scraping failed' }, { status: 500 });
  }
}
