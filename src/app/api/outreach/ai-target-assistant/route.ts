import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/server/auth';
import { getAIConfig } from '@/lib/ai';
import { fetchDirectWebpageContent } from '@/lib/tavily';

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

    // 1. If URL or domain provided, extract company offerings
    if (input.includes('.') || input.startsWith('http')) {
      knowledgeText = (await fetchDirectWebpageContent(input)) || '';
    }

    // 2. Synthesize using AI Gateway
    const { apiKey, endpoint, model } = getAIConfig();
    if (!apiKey) {
      // Deterministic rule-based fallback if AI is offline
      const role = icpDescription?.toLowerCase().includes('cto') || icpDescription?.toLowerCase().includes('tech')
        ? 'Chief Technology Officer, VP of Engineering'
        : icpDescription?.toLowerCase().includes('marketing')
        ? 'Chief Marketing Officer, Head of Growth'
        : 'Founder, Managing Director, CEO';

      const location = icpDescription?.toLowerCase().includes('indonesia') || icpDescription?.toLowerCase().includes('jakarta')
        ? 'Indonesia'
        : icpDescription?.toLowerCase().includes('singapore')
        ? 'Singapore'
        : 'United States';

      return NextResponse.json({
        success: true,
        data: {
          targetRole: role,
          targetIndustries: ['Information Technology & Services', 'Computer Software / SaaS'],
          targetLocation: location,
          searchQuery: `site:linkedin.com/in ("${role.split(',')[0].trim()}") "${location}"`,
          summary: 'Rule-based targeting profile generated from ICP keywords.',
        },
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

    const response = await fetch(endpoint, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model,
        messages: [
          {
            role: 'system',
            content: `You are an elite B2B Sales Prospecting & ICP Targeting Architect. 
Given a user's company website/brand and their natural language target customer description (ICP), generate the exact targeting parameters to scrape high-value decision-makers on LinkedIn.

AVAILABLE INDUSTRIES (choose 1 to 3 that best match):
${availableIndustries.map((ind) => `- "${ind}"`).join('\n')}

OUTPUT FORMAT: Strict JSON only with no markdown or fences:
{
  "targetRole": "comma-separated top decision maker titles (e.g. Founder, Chief Technology Officer, VP Engineering)",
  "targetIndustries": ["Array of 1 to 3 matching industries from the available list above"],
  "targetLocation": "target country, region, or city (e.g. United States, Indonesia, Singapore, Global)",
  "searchQuery": "clean Boolean LinkedIn discovery search query (e.g. site:linkedin.com/in (\\"Founder\\" OR \\"CTO\\") \\"United States\\")",
  "summary": "1 concise sentence explaining the targeting strategy"
}`,
          },
          {
            role: 'user',
            content: `COMPANY / BRAND: ${input || 'Not specified'}
USER'S ICP DESCRIPTION: ${icpDescription || 'Not specified'}
${knowledgeText ? `COMPANY KNOWLEDGE SCRAPED:\n${knowledgeText.slice(0, 2000)}` : ''}

Generate structured targeting parameters matching the user's intent.`,
          },
        ],
        temperature: 0.3,
        max_tokens: 400,
      }),
    });

    if (!response.ok) {
      throw new Error(`AI Gateway responded with ${response.status}`);
    }

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
        searchQuery: parsed.searchQuery || `site:linkedin.com/in ("Founder" OR "CTO") "${parsed.targetLocation || 'United States'}"`,
        summary: parsed.summary || 'AI-recommended decision maker targeting based on ICP.',
      },
    });
  } catch (error: any) {
    console.error('[AI TARGET ASSISTANT ERROR]', error);
    return NextResponse.json(
      { error: error.message || 'Failed to auto-generate targeting profile' },
      { status: 500 }
    );
  }
}
