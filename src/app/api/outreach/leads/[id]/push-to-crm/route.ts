import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/server/auth';
import prisma from '@/lib/prisma';
import { convertOutreachLeadToKanbanCard } from '@/lib/outreach-dispatcher';

export async function POST(
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
    const result = await convertOutreachLeadToKanbanCard({
      leadId: lead.id,
      tenantId,
    });

    return NextResponse.json({
      success: true,
      cardId: result.cardId,
      message: 'Prospect converted successfully to Kanban CRM board',
    });
  } catch (error: any) {
    console.error('[API OUTREACH PUSH TO CRM] Error:', error);
    return NextResponse.json({ error: error.message || 'Conversion failed' }, { status: 500 });
  }
}
