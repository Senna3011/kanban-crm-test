import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/server/auth';
import prisma from '@/lib/prisma';

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

  try {
    const body = await req.json();
    const updated = await prisma.outreachCampaign.updateMany({
      where: { id: campaignId, tenantId },
      data: {
        ...(body.name && { name: body.name.trim() }),
        ...(body.status && { status: body.status }),
        ...(body.targetRole !== undefined && { targetRole: body.targetRole }),
        ...(body.targetLocation !== undefined && { targetLocation: body.targetLocation }),
        ...(body.targetIndustry !== undefined && { targetIndustry: body.targetIndustry }),
        ...(body.promptInstructions !== undefined && { promptInstructions: body.promptInstructions }),
        ...(body.accountId !== undefined && { accountId: body.accountId }),
      },
    });

    if (updated.count === 0) {
      return NextResponse.json({ error: 'Campaign not found or unauthorized' }, { status: 404 });
    }

    const campaign = await prisma.outreachCampaign.findUnique({
      where: { id: campaignId },
      include: { account: true, leads: true },
    });

    return NextResponse.json(campaign);
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
