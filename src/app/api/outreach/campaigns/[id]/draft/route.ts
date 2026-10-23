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
  const requestCustomPrompt: string | undefined = body.customInstructions || body.leadCustomPrompt;

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
  const customInstructions = [campaign.promptInstructions, requestCustomPrompt].filter(Boolean).join('\n');

  const updatedLeads = [];
  for (const lead of leads) {
    const metadata = lead.metadata as any;
    const linkedinSummary = metadata?.summary || undefined;

    const draft = await generatePersonalizedColdEmail({
      prospectName: lead.fullName,
      jobTitle: lead.jobTitle || undefined,
      companyName: lead.companyName || undefined,
      linkedinSummary,
      location: lead.location || campaign.targetLocation || undefined,
      industry: campaign.targetIndustry || undefined,
      senderName,
      senderCompany,
      companyKnowledge: parsedCompanyContext || undefined,
      customInstructions: customInstructions || undefined,
    });

    const firstName = lead.firstName || lead.fullName?.split(' ')[0] || 'there';
    const dripCount = campaign.dripStepsCount || 1;

    // Generate follow-up drafts if drip sequences are enabled (Point 13)
    const followUpSubject1 = campaign.dripSubject || `Re: ${draft.subject}`;
    const followUpBody1 = `Hi ${firstName},\n\nI wanted to follow up on my previous note regarding ${lead.companyName || 'your organization'}. Would love to share how our team can help streamline your digital operations and engineering bottlenecks.\n\nDo you have 10 minutes this week for a brief conversation?\n\nBest regards,\n${senderName}`;

    const followUpSubject2 = campaign.dripSubject2 || `Re: ${draft.subject}`;
    const followUpBody2 = `Hi ${firstName},\n\nCircling back on this as I know how busy you must be heading ${lead.jobTitle || 'your team'}. We recently helped a similar enterprise accelerate their delivery pipelines with significant efficiency gains.\n\nHappy to send over a quick 2-page brief if you'd find that helpful.\n\nBest,\n${senderName}`;

    const followUpSubject3 = campaign.dripSubject3 || `Re: Final check-in / ${draft.subject}`;
    const followUpBody3 = `Hi ${firstName},\n\nI haven't heard back, so I assume this isn't a priority right now, which is completely understandable. I'll stop reaching out for now so I don't crowd your inbox.\n\nFeel free to reach out anytime if your priorities shift.\n\nBest of luck with everything at ${lead.companyName || 'your company'}!\n\nBest,\n${senderName}`;

    const sequenceDrafts = [
      { step: 0, title: 'Initial Touch (Cold Pitch)', subject: draft.subject, body: draft.body },
      { step: 1, title: 'Follow-Up #1', subject: followUpSubject1, body: followUpBody1 },
      ...(dripCount >= 2 ? [{ step: 2, title: 'Follow-Up #2', subject: followUpSubject2, body: followUpBody2 }] : []),
      ...(dripCount >= 3 ? [{ step: 3, title: 'Follow-Up #3 (Closing)', subject: followUpSubject3, body: followUpBody3 }] : []),
    ];

    const updated = await prisma.outreachLead.update({
      where: { id: lead.id },
      data: {
        aiDraftSubject: draft.subject,
        aiDraftBody: draft.body,
        dripDraftSubject: followUpSubject1,
        dripDraftBody: followUpBody1,
        status: 'DRAFT_READY',
        metadata: {
          ...(typeof lead.metadata === 'object' && lead.metadata !== null ? lead.metadata : {}),
          isAiGenerated: draft.isAiGenerated,
          alternativeSubject: draft.alternativeSubject,
          scoreEstimate: draft.scoreEstimate,
          sequenceDrafts,
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
