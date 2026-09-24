import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/server/auth';
import prisma from '@/lib/prisma';
import { generatePersonalizedColdEmail } from '@/lib/outreach-ai';

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
    include: {
      account: true,
      tenant: { select: { name: true, companyInfo: true } },
    },
  });

  if (!campaign) {
    return NextResponse.json({ error: 'Campaign not found' }, { status: 404 });
  }

  const body = await req.json().catch(() => ({}));
  const leadIds: string[] | undefined = body.leadIds;

  const leads = await prisma.outreachLead.findMany({
    where: {
      campaignId: campaign.id,
      ...(leadIds && leadIds.length > 0 ? { id: { in: leadIds } } : {}),
      email: { not: null },
      verifyStatus: { not: 'INVALID' },
    },
  });

  // Extract company knowledge from tenant settings if available
  let parsedCompanyContext = '';
  if (campaign.tenant?.companyInfo) {
    try {
      const parsed = JSON.parse(campaign.tenant.companyInfo);
      const parts = [];
      if (parsed.name) parts.push(`Company Name: ${parsed.name}`);
      if (parsed.products) parts.push(`Products & Solutions: ${parsed.products}`);
      if (parsed.knowledgeBase) parts.push(`Knowledge Base / Value Offer: ${parsed.knowledgeBase}`);
      if (parsed.customPrompt) parts.push(`Tone & Guidelines: ${parsed.customPrompt}`);
      parsedCompanyContext = parts.join('\n');
    } catch {
      parsedCompanyContext = campaign.tenant.companyInfo;
    }
  }

  const senderName = campaign.account?.senderName || session.user.name || 'JetDigitalPro Team';
  const senderCompany = campaign.account?.name || campaign.tenant?.name || 'JetDigitalPro';
  const customInstructions = campaign.promptInstructions || undefined;

  const updatedLeads = [];
  for (const lead of leads) {
    const metadata = lead.metadata as any;
    const linkedinSummary = metadata?.summary || undefined;

    const draft = await generatePersonalizedColdEmail({
      prospectName: lead.fullName,
      jobTitle: lead.jobTitle || undefined,
      companyName: lead.companyName || undefined,
      linkedinSummary,
      senderName,
      senderCompany,
      companyKnowledge: parsedCompanyContext || undefined,
      customInstructions,
    });

    const updated = await prisma.outreachLead.update({
      where: { id: lead.id },
      data: {
        aiDraftSubject: draft.subject,
        aiDraftBody: draft.body,
        status: 'DRAFT_READY',
        metadata: {
          ...(typeof lead.metadata === 'object' && lead.metadata !== null ? lead.metadata : {}),
          isAiGenerated: draft.isAiGenerated,
          draftedAt: new Date().toISOString(),
        },
      },
    });

    updatedLeads.push(updated);
  }

  return NextResponse.json({
    success: true,
    draftsCreated: updatedLeads.length,
    leads: updatedLeads,
  });
}
