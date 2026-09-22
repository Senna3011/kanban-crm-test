import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/server/auth';
import prisma from '@/lib/prisma';

export async function GET(req: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session?.user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const tenantId = (session.user as any).tenantId;

  try {
    const campaigns = await prisma.outreachCampaign.findMany({
      where: { tenantId },
      orderBy: { createdAt: 'desc' },
      include: {
        account: {
          select: { id: true, name: true, senderEmail: true },
        },
        _count: {
          select: { leads: true },
        },
        leads: {
          select: { status: true, verifyStatus: true },
        },
      },
    });

    const formatted = campaigns.map((c) => {
      const totalLeads = c._count.leads;
      const verifiedSafe = c.leads.filter((l) => l.verifyStatus === 'SAFE').length;
      const dispatched = c.leads.filter((l) => l.status === 'DISPATCHED' || l.status === 'CONVERTED' || l.status === 'REPLIED').length;
      const converted = c.leads.filter((l) => l.status === 'CONVERTED').length;

      return {
        id: c.id,
        name: c.name,
        targetRole: c.targetRole,
        targetLocation: c.targetLocation,
        targetIndustry: c.targetIndustry,
        searchQuery: c.searchQuery,
        status: c.status,
        createdAt: c.createdAt,
        account: c.account,
        metrics: {
          totalLeads,
          verifiedSafe,
          dispatched,
          converted,
        },
      };
    });

    return NextResponse.json(formatted);
  } catch (error: any) {
    console.error('[API OUTREACH GET CAMPAIGNS ERROR]', error);
    return NextResponse.json({ error: error.message || 'Failed to fetch campaigns' }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session?.user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const tenantId = (session.user as any).tenantId;

  try {
    const body = await req.json();
    const { name, targetRole, targetLocation, targetIndustry, searchQuery, promptInstructions, accountId } = body;

    if (!name || typeof name !== 'string') {
      return NextResponse.json({ error: 'Campaign name is required' }, { status: 400 });
    }

    const campaign = await prisma.outreachCampaign.create({
      data: {
        name: name.trim(),
        targetRole: targetRole?.trim() || null,
        targetLocation: targetLocation?.trim() || null,
        targetIndustry: targetIndustry?.trim() || null,
        searchQuery: searchQuery?.trim() || null,
        promptInstructions: promptInstructions?.trim() || null,
        tenantId,
        accountId: accountId || null,
      },
      include: {
        account: true,
      },
    });

    return NextResponse.json(campaign, { status: 201 });
  } catch (error: any) {
    console.error('[API OUTREACH CAMPAIGNS] Create error:', error);
    return NextResponse.json({ error: error.message || 'Failed to create campaign' }, { status: 500 });
  }
}
