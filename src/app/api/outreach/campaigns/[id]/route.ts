import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/server/auth';
import prisma from '@/lib/prisma';
import { OutreachCampaignStatus } from '@prisma/client';

export async function GET(
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

  try {
    const campaign = await prisma.outreachCampaign.findFirst({
      where: { id: campaignId, tenantId },
      include: {
        account: true,
        leads: {
          orderBy: { createdAt: 'desc' },
        },
      },
    });

    if (!campaign) {
      return NextResponse.json({ error: 'Campaign not found' }, { status: 404 });
    }

    return NextResponse.json(campaign);
  } catch (error: any) {
    console.error('[API OUTREACH GET CAMPAIGN BY ID ERROR]', error);
    return NextResponse.json({ error: error.message || 'Failed to fetch campaign' }, { status: 500 });
  }
}

export async function PATCH(
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

  const existingCampaign = await prisma.outreachCampaign.findFirst({
    where: { id: campaignId, tenantId },
  });

  if (!existingCampaign) {
    return NextResponse.json({ error: 'Campaign not found or unauthorized' }, { status: 404 });
  }

  try {
    const body = await req.json();

    // Validate accountId if provided
    if (body.accountId !== undefined && body.accountId !== null) {
      const validAccount = await prisma.outreachAccountConfig.findFirst({
        where: { id: body.accountId, tenantId },
      });
      if (!validAccount) {
        return NextResponse.json({
          error: 'Specified Outreach Sender Account was not found or is unauthorized.',
        }, { status: 400 });
      }
    }

    // Validate status if provided
    if (body.status !== undefined) {
      const validStatuses = Object.values(OutreachCampaignStatus);
      if (!validStatuses.includes(body.status)) {
        return NextResponse.json({
          error: `Invalid status "${body.status}". Allowed values: ${validStatuses.join(', ')}`,
        }, { status: 400 });
      }
    }

    const updated = await prisma.outreachCampaign.update({
      where: { id: campaignId },
      data: {
        ...(body.name && { name: body.name.trim() }),
        ...(body.status && { status: body.status as OutreachCampaignStatus }),
        ...(body.targetRole !== undefined && { targetRole: body.targetRole }),
        ...(body.targetLocation !== undefined && { targetLocation: body.targetLocation }),
        ...(body.targetIndustry !== undefined && { targetIndustry: body.targetIndustry }),
        ...(body.promptInstructions !== undefined && { promptInstructions: body.promptInstructions }),
        ...(body.accountId !== undefined && { accountId: body.accountId }),
      },
      include: {
        account: true,
        leads: true,
      },
    });

    return NextResponse.json(updated);
  } catch (error: any) {
    return NextResponse.json({ error: error.message || 'Update failed' }, { status: 500 });
  }
}

export async function DELETE(
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

  try {
    const deleted = await prisma.outreachCampaign.deleteMany({
      where: { id: campaignId, tenantId },
    });

    if (deleted.count === 0) {
      return NextResponse.json({ error: 'Campaign not found' }, { status: 404 });
    }

    return NextResponse.json({ success: true, message: 'Campaign deleted successfully' });
  } catch (error: any) {
    return NextResponse.json({ error: error.message || 'Delete failed' }, { status: 500 });
  }
}
