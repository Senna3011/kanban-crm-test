import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/server/auth';
import { getAIConfig } from '@/lib/ai';
import { fetchDirectWebpageContent } from '@/lib/tavily';

function extractDeterministicTargeting(icpDescription: string = '', brandOrUrl: string = '', knowledgeText: string = '') {
  const text = `${icpDescription} ${brandOrUrl} ${knowledgeText}`.toLowerCase();

  // Role detection
  const roles: string[] = [];
  if (text.includes('cto') || text.includes('tech') || text.includes('developer') || text.includes('engineer')) {
    roles.push('Chief Technology Officer, VP of Engineering');
  }
  if (text.includes('cmo') || text.includes('marketing') || text.includes('growth')) {
    roles.push('Chief Marketing Officer, Head of Growth');
  }
  if (text.includes('sales') || text.includes('revenue') || text.includes('cro') || text.includes('bizdev')) {
    roles.push('VP of Sales, Head of Business Development');
  }
  if (text.includes('cfo') || text.includes('finance') || text.includes('payment')) {
    roles.push('Chief Financial Officer, VP Finance');
  }
  if (roles.length === 0 || text.includes('founder') || text.includes('ceo') || text.includes('owner') || text.includes('director')) {
    roles.unshift('Founder, CEO');
  }
  const targetRole = roles.slice(0, 2).join(', ');

  // Industry detection
  const industries: string[] = [];
  if (text.includes('saas') || text.includes('software') || text.includes('tech') || text.includes('app')) {
    industries.push('Computer Software / SaaS');
  }
  if (text.includes('fintech') || text.includes('finance') || text.includes('bank') || text.includes('payment') || text.includes('crypto')) {
    industries.push('Financial Services & Fintech');
  }
  if (text.includes('ecommerce') || text.includes('e-commerce') || text.includes('retail') || text.includes('shop') || text.includes('dtc')) {
    industries.push('E-Commerce & Retail');
  }
  if (text.includes('health') || text.includes('medical') || text.includes('clinic') || text.includes('doctor')) {
    industries.push('Healthcare & Medical');
  }
  if (text.includes('agency') || text.includes('marketing') || text.includes('seo') || text.includes('ads')) {
    industries.push('Marketing & Advertising');
  }
  if (text.includes('real estate') || text.includes('property') || text.includes('construction')) {
    industries.push('Real Estate & Construction');
  }
  if (text.includes('logistics') || text.includes('supply chain') || text.includes('manufacturing')) {
    industries.push('Manufacturing & Logistics');
  }
  if (industries.length === 0) {
    industries.push('Computer Software / SaaS', 'Information Technology & Services');
  }

  // Location detection
  let targetLocation = 'United States';
  if (text.includes('indonesia') || text.includes('jakarta') || text.includes('bali')) {
    targetLocation = 'Indonesia';
  } else if (text.includes('singapore') || text.includes('sg')) {
    targetLocation = 'Singapore';
  } else if (text.includes('malaysia') || text.includes('kuala lumpur')) {
    targetLocation = 'Malaysia';
  } else if (text.includes('united kingdom') || text.includes('uk') || text.includes('london')) {
    targetLocation = 'United Kingdom';
  } else if (text.includes('australia') || text.includes('sydney') || text.includes('melbourne')) {
    targetLocation = 'Australia';
  } else if (text.includes('canada')) {
    targetLocation = 'Canada';
  } else if (text.includes('europe') || text.includes('germany') || text.includes('france')) {
    targetLocation = 'Europe';
  }

  // Search query
  let searchQuery = '';
  if (text.includes('b2b')) searchQuery = 'B2B';
  else if (text.includes('saas')) searchQuery = 'SaaS';
  else if (text.includes('fintech')) searchQuery = 'Fintech';
  else if (text.includes('ecommerce') || text.includes('e-commerce')) searchQuery = 'E-Commerce';

  return {
    targetRole,
    targetIndustries: industries.slice(0, 2),
    targetLocation,
    searchQuery,
    summary: `Targeting ${targetRole.split(',')[0]} decision-makers in ${targetLocation} within ${industries[0]}.`,
  };
}

export async function POST(req: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session?.user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  try {
    const body = await req.json().catch(() => ({}));
    const { brandOrUrl, icpDescription } = body;

    if (!icpDescription && !brandOrUrl) {
      return NextResponse.json(
        { error: 'Please provide either a brand URL or an ICP customer profile description.' },
        { status: 400 }
      );
    }

    let knowledgeText = '';
    const input = (brandOrUrl || '').trim();
    const hasExplicitIcp = typeof icpDescription === 'string' && icpDescription.trim().length >= 15;

    // 1. Fast-path: Only fetch webpage if brand URL is provided and ICP description needs brand grounding
    if ((input.includes('.') || input.startsWith('http')) && !hasExplicitIcp) {
      try {
        knowledgeText = (await fetchDirectWebpageContent(input)) || '';
      } catch {
        knowledgeText = '';
      }
    }

    // 2. Synthesize using AI Gateway
    const { apiKey, endpoint, model } = getAIConfig();
    if (!apiKey) {
      return NextResponse.json({
        success: true,
        data: extractDeterministicTargeting(icpDescription, input, knowledgeText),
      });
    }

    const availableIndustries = [
      'Information Technology & Services',
      'Computer Software / SaaS',
      'Financial Services & Fintech',
      'Healthcare & Medical',
      'E-Commerce & Retail',
      'Marketing & Advertising',
      'Real Estate & Construction',
      'Manufacturing & Logistics',
      'Education Management',
      'Hospitality & Tourism',
      'Legal & Consulting',
      'All Industries (Broad)',
    ];

    try {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 5500);

      const response = await fetch(endpoint, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${apiKey}`,
        },
        signal: controller.signal,
        body: JSON.stringify({
          model,
          messages: [
            {
              role: 'system',
              content: `You are an elite B2B Sales Prospecting & ICP Targeting Architect.
Given a user's company website/brand and their natural language target customer description (ICP), generate exact targeting parameters to scrape high-value decision-makers.

RULES:
- targetRole: 1 to 3 standard job titles separated by comma (e.g. "Founder, CEO" or "Chief Marketing Officer, Head of Growth"). NO sentences, NO brackets.
- targetIndustries: 1 to 3 matching industries chosen STRICTLY from the list below:
${availableIndustries.map((ind) => `- "${ind}"`).join('\n')}
- targetLocation: Country or Region name (e.g. "United States", "Indonesia", "Singapore"). If not mentioned, default to "United States".
- searchQuery: Short topic/niche qualifier (1-3 words max, e.g. "B2B SaaS" or "E-Commerce") or empty string "". DO NOT use search operators.
- summary: 1 punchy sentence summarizing who we are targeting.

OUTPUT FORMAT: Strict JSON only with no markdown or backticks:
{
  "targetRole": "Founder, CEO",
  "targetIndustries": ["Computer Software / SaaS"],
  "targetLocation": "United States",
  "searchQuery": "",
  "summary": "Targeting Founders and CEOs in US Software companies"
}`,
            },
            {
              role: 'user',
              content: `COMPANY / BRAND: ${input || 'Not specified'}
USER'S ICP DESCRIPTION: ${icpDescription || 'Not specified'}
${knowledgeText ? `COMPANY CONTEXT:\n${knowledgeText.slice(0, 1500)}` : ''}

Generate structured targeting parameters matching the user's intent.`,
            },
          ],
          temperature: 0.2,
          max_tokens: 250,
        }),
      });
      clearTimeout(timeout);

      if (response.ok) {
        const data = await response.json();
        const rawContent = data.choices?.[0]?.message?.content || '';
        const cleaned = rawContent.replace(/^```json\s*/i, '').replace(/^```\s*/i, '').replace(/\s*```$/i, '').trim();
        const parsed = JSON.parse(cleaned);

        return NextResponse.json({
          success: true,
          data: {
            targetRole: parsed.targetRole || 'Founder, Chief Technology Officer',
            targetIndustries: Array.isArray(parsed.targetIndustries) && parsed.targetIndustries.length > 0
              ? parsed.targetIndustries
              : ['Computer Software / SaaS'],
            targetLocation: parsed.targetLocation || 'United States',
            searchQuery: (parsed.searchQuery && !parsed.searchQuery.includes('site:')) ? parsed.searchQuery : '',
            summary: parsed.summary || 'AI-recommended decision maker targeting based on ICP.',
          },
        });
      }
    } catch (aiErr: any) {
      console.warn('[AI TARGET ASSISTANT TIMEOUT/ERROR - FALLBACK TO DETERMINISTIC]', aiErr.message);
    }

    // Fast robust fallback when AI is slow or fails
    return NextResponse.json({
      success: true,
      data: extractDeterministicTargeting(icpDescription, input, knowledgeText),
    });
  } catch (error: any) {
    console.error('[AI TARGET ASSISTANT ERROR]', error);
    return NextResponse.json(
      { error: error.message || 'Failed to auto-generate targeting profile' },
      { status: 500 }
    );
  }
}
