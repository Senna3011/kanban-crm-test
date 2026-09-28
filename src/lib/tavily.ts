import { getAIConfig } from './ai';

export interface OfferSummarizeParams {
  urlOrBrand: string;
  additionalContext?: string;
  tavilyApiKey?: string;
  tone?: 'formal' | 'conversational' | 'direct';
  length?: 'concise' | 'detailed';
}

export interface OfferSummarizeResult {
  valueProposition: string;
  painPoints: string;
  callToAction: string;
  fullInstruction: string;
  source: 'Tavily' | 'WebScrape' | 'DirectAI';
}

/**
 * Clean HTML and extract text content
 */
function extractTextFromHtml(html: string): string {
  return html
    .replace(/<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi, '')
    .replace(/<style\b[^<]*(?:(?!<\/style>)<[^<]*)*<\/style>/gi, '')
    .replace(/<header\b[^<]*(?:(?!<\/header>)<[^<]*)*<\/header>/gi, '')
    .replace(/<footer\b[^<]*(?:(?!<\/footer>)<[^<]*)*<\/footer>/gi, '')
    .replace(/<nav\b[^<]*(?:(?!<\/nav>)<[^<]*)*<\/nav>/gi, '')
    .replace(/<[^>]+>/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 4000);
}

/**
 * Fetch webpage content directly
 */
async function fetchDirectWebpageContent(targetUrl: string): Promise<string | null> {
  let url = targetUrl.trim();
  if (!url.startsWith('http://') && !url.startsWith('https://')) {
    url = `https://${url}`;
  }

  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 6000);

    const res = await fetch(url, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        Accept: 'text/html,application/xhtml+xml',
      },
      signal: controller.signal,
    });
    clearTimeout(timeout);

    if (!res.ok) return null;
    const html = await res.text();
    return extractTextFromHtml(html);
  } catch {
    return null;
  }
}

/**
 * Search and extract knowledge using Tavily API
 */
async function searchWithTavily(query: string, apiKey: string): Promise<string | null> {
  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 8000);

    const res = await fetch('https://api.tavily.com/search', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        api_key: apiKey,
        query: `company offerings products services pricing value proposition for ${query}`,
        include_answer: true,
        max_results: 3,
        search_depth: 'basic',
      }),
      signal: controller.signal,
    });
    clearTimeout(timeout);

    if (!res.ok) return null;
    const data = await res.json();

    const resultsText = (data.results || [])
      .map((r: any) => `${r.title}\n${r.content}`)
      .join('\n\n');

    return [data.answer, resultsText].filter(Boolean).join('\n\n');
  } catch {
    return null;
  }
}

/**
 * Summarize Brand/URL Knowledgebase into High-Converting Value Proposition for Cold Outreach
 */
export async function summarizeBrandOffer(
  params: OfferSummarizeParams
): Promise<OfferSummarizeResult> {
  const input = (params.urlOrBrand || '').trim();
  const tavilyKey = params.tavilyApiKey || process.env.TAVILY_API_KEY;
  const tone = params.tone || 'formal';
  const length = params.length || 'concise';

  const toneInstruction = tone === 'conversational'
    ? 'Tone: Warm, approachable, peer-to-peer conversational.'
    : tone === 'direct'
    ? 'Tone: Direct, punchy, zero fluff, and immediate value focus.'
    : 'Tone: Executive, polished, consultative, and professional.';

  const lengthInstruction = length === 'detailed'
    ? 'Length: Comprehensive 2-3 sentence instruction detailing specific pain points and distinct value deliverables.'
    : 'Length: Ultra-concise, punchy, high-impact instruction under 2 sentences.';

  let knowledgeText = '';
  let source: OfferSummarizeResult['source'] = 'DirectAI';

  // 1. If Tavily key available, run Tavily search
  if (tavilyKey) {
    const tavilyData = await searchWithTavily(input, tavilyKey);
    if (tavilyData && tavilyData.length > 50) {
      knowledgeText = tavilyData;
      source = 'Tavily';
    }
  }

  // 2. If it's a URL and Tavily didn't yield or not configured, fetch webpage directly
  if (!knowledgeText && (input.includes('.') || input.startsWith('http'))) {
    const webContent = await fetchDirectWebpageContent(input);
    if (webContent && webContent.length > 50) {
      knowledgeText = webContent;
      source = 'WebScrape';
    }
  }

  // 3. Synthesize via LLM
  const { apiKey, endpoint, model } = getAIConfig();
  if (!apiKey) {
    const fallbackInstruction = tone === 'direct'
      ? `Deliver direct value on ${input}. Focus on eliminating operational bottlenecks and propose a quick 10-minute audit.`
      : tone === 'conversational'
      ? `Share friendly insights on how ${input} helps engineering and business teams streamline workflows, offering a casual 10-minute exchange.`
      : `Highlight our enterprise capabilities based on ${input}. Address operational efficiency and propose a complimentary 10-minute consultative session.`;

    return {
      valueProposition: `We partner with leadership teams to accelerate growth through custom software and workflow automation based on ${input}.`,
      painPoints: `Manual operational bottlenecks and fragmented tooling.`,
      callToAction: `Complimentary 10-minute discovery call.`,
      fullInstruction: fallbackInstruction,
      source,
    };
  }

  try {
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
            content: `You are an executive sales strategist. Analyze the provided company/product research and generate a high-converting Cold Email Value Proposition & Directive.

STYLING DIRECTIVES:
- ${toneInstruction}
- ${lengthInstruction}

OUTPUT FORMAT: Strict JSON with keys:
- "valueProposition": (1-2 crisp sentences describing the primary offer and business value matching the requested tone)
- "painPoints": (1 sentence highlighting the exact customer problem/bottleneck solved)
- "callToAction": (A single low-friction CTA, e.g. 10-min architecture review)
- "fullInstruction": (A cohesive instruction combining the value, tone, and CTA to guide AI cold email drafting)`,
          },
          {
            role: 'user',
            content: `TARGET BRAND / KNOWLEDGE BASE:
Input: ${input}
Tone: ${tone}
Length: ${length}
${params.additionalContext ? `Additional Context: ${params.additionalContext}` : ''}
${knowledgeText ? `Extracted Web Research:\n${knowledgeText.slice(0, 2500)}` : ''}

Generate the structured value proposition adhering strictly to the requested tone (${tone}) and length (${length}).`,
          },
        ],
        temperature: 0.5,
        max_tokens: 350,
      }),
    });

    if (!response.ok) throw new Error('AI Gateway error');
    const data = await response.json();
    const rawContent = data.choices?.[0]?.message?.content || '';
    const cleaned = rawContent.replace(/^```json\s*/i, '').replace(/^```\s*/i, '').replace(/\s*```$/i, '').trim();
    const parsed = JSON.parse(cleaned);

    return {
      valueProposition: parsed.valueProposition || `Enterprise solutions designed to accelerate growth and automate pipelines.`,
      painPoints: parsed.painPoints || `Manual workflow bottlenecks and complex system integration.`,
      callToAction: parsed.callToAction || `Complimentary 10-minute software & architecture review.`,
      fullInstruction: parsed.fullInstruction || `Highlight our solutions based on ${input}. Focus on resolving operational friction and offer a 10-minute discovery session.`,
      source,
    };
  } catch (err: any) {
    console.warn('[OFFER SUMMARIZE ERROR]', err);
    return {
      valueProposition: `We help leadership teams eliminate operational friction through tailored technology and automation.`,
      painPoints: `Manual overhead and scaling bottlenecks.`,
      callToAction: `Brief 10-minute introductory conversation.`,
      fullInstruction: `Highlight our core offerings based on ${input}. Emphasize operational efficiency and propose a complimentary 10-minute consultation.`,
      source,
    };
  }
}
