import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/server/auth';
import prisma from '@/lib/prisma';
import { generatePersonalizedColdEmail } from '@/lib/outreach-ai';

const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

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
    const body = await req.json();
    const { fullName, email, companyName, jobTitle, location, linkedinUrl } = body;

    if (!fullName || typeof fullName !== 'string' || !fullName.trim()) {
      return NextResponse.json({ error: 'Full name is required' }, { status: 400 });
    }

    if (!email || typeof email !== 'string' || !EMAIL_REGEX.test(email.trim())) {
      return NextResponse.json({ error: 'A valid email address is required (e.g. name@domain.com)' }, { status: 400 });
    }

    const tenant = await prisma.tenant.findUnique({
      where: { id: tenantId },
      select: { name: true },
    });

    const generated = await generatePersonalizedColdEmail({
      prospectName: fullName.trim(),
      jobTitle: jobTitle?.trim() || 'Decision Maker',
      companyName: companyName?.trim() || 'Enterprise Partner',
      senderName: campaign.account?.senderName || 'Outreach Manager',
      senderCompany: tenant?.name || 'Our Company',
      customInstructions: campaign.promptInstructions || 'Personalized introductory cold email',
    });

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
        verifyStatus: 'UNVERIFIED',
        verifyScore: 0,
        aiDraftSubject: generated.subject,
        aiDraftBody: generated.body,
        status: 'DRAFT_READY',
        metadata: {
          isAiGenerated: generated.isAiGenerated,
          source: 'manual_lead',
          createdAt: new Date().toISOString(),
        },
      },
    });

    return NextResponse.json(newLead, { status: 201 });
  } catch (error: any) {
    console.error('[API OUTREACH ADD MANUAL LEAD ERROR]', error);
    return NextResponse.json({ error: error.message || 'Failed to create lead' }, { status: 500 });
  }
}
