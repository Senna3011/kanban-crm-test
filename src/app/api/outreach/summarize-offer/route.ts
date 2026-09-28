import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/server/auth';
import { summarizeBrandOffer } from '@/lib/tavily';

export async function POST(req: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session?.user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  try {
    const body = await req.json();
    const { urlOrBrand, additionalContext } = body;

    if (!urlOrBrand || typeof urlOrBrand !== 'string' || !urlOrBrand.trim()) {
      return NextResponse.json({ error: 'Brand name or website URL is required' }, { status: 400 });
    }

    const result = await summarizeBrandOffer({
      urlOrBrand: urlOrBrand.trim(),
      additionalContext: additionalContext?.trim() || undefined,
    });

    return NextResponse.json({
      success: true,
      data: result,
    });
  } catch (error: any) {
    console.error('[API SUMMARIZE OFFER ERROR]', error);
    return NextResponse.json({ error: error.message || 'Failed to summarize offer' }, { status: 500 });
  }
}
