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

  const tenant = await prisma.tenant.findUnique({
    where: { id: tenantId },
    select: { name: true, companyInfo: true },
  });

  let parsed: any = {};
  try {
    if (tenant?.companyInfo) {
      parsed = JSON.parse(tenant.companyInfo);
    }
  } catch {
    parsed = { knowledgeBase: tenant?.companyInfo };
  }

  return NextResponse.json({
    companyName: parsed.name || tenant?.name || 'JetDigitalPro',
    productsOffer: parsed.products || 'Custom Enterprise Software Development, AI & LLM Automation Workflows, Omnichannel CRM Integration',
    knowledgeBase: parsed.knowledgeBase || 'We partner with enterprises to build custom software, eliminate sales/support bottlenecks, and scale operations.',
    customPrompt: parsed.customPrompt || 'Highlight JetDigitalPro capabilities in software architecture and automation with a complimentary 10-minute discovery call.',
  });
}

export async function POST(req: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session?.user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const tenantId = (session.user as any).tenantId;

  try {
    const body = await req.json();
    const { companyName, productsOffer, knowledgeBase, customPrompt } = body;

    const tenant = await prisma.tenant.findUnique({
      where: { id: tenantId },
      select: { companyInfo: true },
    });

    let existing: any = {};
    try {
      if (tenant?.companyInfo) existing = JSON.parse(tenant.companyInfo);
    } catch {}

    const updatedInfo = {
      ...existing,
      name: companyName?.trim() || existing.name || 'JetDigitalPro',
      products: productsOffer?.trim() || existing.products || '',
      knowledgeBase: knowledgeBase?.trim() || existing.knowledgeBase || '',
      customPrompt: customPrompt?.trim() || existing.customPrompt || '',
    };

    await prisma.tenant.update({
      where: { id: tenantId },
      data: {
        name: updatedInfo.name,
        companyInfo: JSON.stringify(updatedInfo),
      },
    });

    return NextResponse.json({
      success: true,
      message: 'Company context and AI pitch prompt saved successfully!',
    });
  } catch (error: any) {
    console.error('[API COMPANY CONTEXT POST ERROR]', error);
    return NextResponse.json({ error: error.message || 'Failed to update company context' }, { status: 500 });
  }
}
