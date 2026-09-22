import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/server/auth';
import prisma from '@/lib/prisma';

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> | { id: string } }
) {
  const session = await getServerSession(authOptions);
  if (!session?.user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const resolvedParams = await params;
  const leadId = resolvedParams.id;
  const tenantId = (session.user as any).tenantId;

  const lead = await prisma.outreachLead.findFirst({
    where: {
      id: leadId,
      campaign: { tenantId },
    },
  });

  if (!lead) {
    return NextResponse.json({ error: 'Lead not found or unauthorized' }, { status: 404 });
  }

  try {
    const body = await req.json();
    const { aiDraftSubject, aiDraftBody, email, status } = body;

    const updated = await prisma.outreachLead.update({
      where: { id: leadId },
      data: {
        ...(aiDraftSubject !== undefined && { aiDraftSubject }),
        ...(aiDraftBody !== undefined && { aiDraftBody }),
        ...(email !== undefined && { email }),
        ...(status !== undefined && { status }),
      },
    });

    return NextResponse.json(updated);
  } catch (error: any) {
    console.error('[API OUTREACH LEAD PATCH] Error:', error);
    return NextResponse.json({ error: error.message || 'Failed to update lead' }, { status: 500 });
  }
}
