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
  });

  if (!campaign) {
    return NextResponse.json({ error: 'Campaign not found' }, { status: 404 });
  }

  try {
    const body = await req.json();
    const { fullName, email, companyName, jobTitle, location, linkedinUrl } = body;

    if (!fullName || !email) {
      return NextResponse.json({ error: 'Full name and email are required' }, { status: 400 });
    }

    // Auto generate AI draft if campaign instructions exist
    let aiDraftSubject: string | undefined;
    let aiDraftBody: string | undefined;

    try {
      const tenant = await prisma.tenant.findUnique({
        where: { id: tenantId },
        select: { companyInfo: true, name: true },
      });
      let companyContext = '';
      if (tenant?.companyInfo) {
        try {
          const parsed = JSON.parse(tenant.companyInfo);
          companyContext = parsed.customPrompt || parsed.products || '';
        } catch {}
      }

      const generated = await generatePersonalizedColdEmail({
        prospectName: fullName,
        jobTitle: jobTitle || 'Decision Maker',
        companyName: companyName || 'Enterprise Partner',
        senderName: 'Outreach Manager',
        senderCompany: tenant?.name || 'Our Company',
        customInstructions: campaign.promptInstructions || 'Personalized introductory cold email',
      });

      aiDraftSubject = generated.subject;
      aiDraftBody = generated.body;
    } catch (e) {
      console.warn('[MANUAL LEAD] AI draft auto-generation fallback:', e);
      aiDraftSubject = `Exploring collaboration with ${companyName || 'your team'}`;
      aiDraftBody = `Hi ${fullName.split(' ')[0] || 'there'},\n\nI came across your profile and would love to connect to discuss how we can support ${companyName || 'your business'}.\n\nBest regards,\nOutreach Team`;
    }

    const newLead = await prisma.outreachLead.create({
      data: {
        campaignId: campaign.id,
        fullName: fullName.trim(),
        firstName: fullName.trim().split(' ')[0] || fullName.trim(),
        lastName: fullName.trim().split(' ').slice(1).join(' ') || '',
        email: email.trim().toLowerCase(),
        companyName: companyName?.trim() || 'Custom Prospect',
        jobTitle: jobTitle?.trim() || 'Business Leader',
        location: location?.trim() || 'Indonesia',
        linkedinUrl: linkedinUrl?.trim() || `https://linkedin.com/in/${email.split('@')[0]}`,
        verifyStatus: 'SAFE',
        verifyScore: 99,
        aiDraftSubject,
        aiDraftBody,
        status: 'DRAFT_READY',
      },
    });

    return NextResponse.json(newLead, { status: 201 });
  } catch (error: any) {
    console.error('[API OUTREACH ADD MANUAL LEAD ERROR]', error);
    return NextResponse.json({ error: error.message || 'Failed to create lead' }, { status: 500 });
  }
}
