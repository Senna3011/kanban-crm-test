import { getAIConfig } from './ai';

export interface OfferSummarizeParams {
  urlOrBrand: string;
  additionalContext?: string;
  tavilyApiKey?: string;
  tone?: 'formal' | 'conversational' | 'direct';
  length?: 'concise' | 'detailed';
  targetRole?: string;
  targetIndustry?: string;
  targetLocation?: string;
}

export interface OfferSummarizeResult {
  valueProposition: string;
  painPoints: string;
  callToAction: string;
  fullInstruction: string;
  source: 'Tavily' | 'WebScrape' | 'DirectAI';
}

/**
 * Clean HTML and extract text content with priority on meta description & title
 */
function extractTextFromHtml(html: string): string {
  const metaDescMatch = html.match(/<meta\s+[^>]*name=["']description["'][^>]*content=["']([^"']+)["']/i)
    || html.match(/<meta\s+[^>]*content=["']([^"']+)["'][^>]*name=["']description["']/i)
    || html.match(/<meta\s+[^>]*property=["']og:description["'][^>]*content=["']([^"']+)["']/i);
  const titleMatch = html.match(/<title[^>]*>([^<]+)<\/title>/i);

  const metaDesc = metaDescMatch?.[1]?.trim() || '';
  const title = titleMatch?.[1]?.trim() || '';

  const cleanBody = html
    .replace(/<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi, '')
    .replace(/<style\b[^<]*(?:(?!<\/style>)<[^<]*)*<\/style>/gi, '')
    .replace(/<header\b[^<]*(?:(?!<\/header>)<[^<]*)*<\/header>/gi, '')
    .replace(/<footer\b[^<]*(?:(?!<\/footer>)<[^<]*)*<\/footer>/gi, '')
    .replace(/<nav\b[^<]*(?:(?!<\/nav>)<[^<]*)*<\/nav>/gi, '')
    .replace(/<[^>]+>/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 3000);

  const parts = [
    title ? `Title: ${title}` : '',
    metaDesc ? `Description: ${metaDesc}` : '',
    cleanBody ? `Content: ${cleanBody}` : '',
  ].filter(Boolean);

  return parts.join('\n\n').slice(0, 3500);
}

/**
 * Fetch webpage content directly with fast 3s timeout
 */
export async function fetchDirectWebpageContent(targetUrl: string): Promise<string | null> {
  let url = targetUrl.trim();
  if (!url.startsWith('http://') && !url.startsWith('https://')) {
    url = `https://${url}`;
  }

  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 4500);

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
 * Search and extract knowledge using Tavily API with fast 3.5s timeout
 */
async function searchWithTavily(query: string, apiKey: string): Promise<string | null> {
  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 3500);

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
 * Fast deterministic fallback synthesizer when AI Gateway is slow or unreachable
 */
function extractOfferDirectlyFromKnowledge(
  input: string,
  knowledgeText: string,
  params: OfferSummarizeParams,
  source: OfferSummarizeResult['source']
): OfferSummarizeResult {
  const brandClean = input.replace(/^https?:\/\//i, '').replace(/^www\./i, '').split('/')[0];

  const descMatch = knowledgeText.match(/Description:\s*([^\n]+)/i);
  const titleMatch = knowledgeText.match(/Title:\s*([^\n]+)/i);

  const rawSummary = descMatch?.[1]?.trim()
    || titleMatch?.[1]?.trim()
    || `${brandClean} specialized business offerings`;

  // Strip excessive punctuation and truncate
  const cleanedSummary = rawSummary.slice(0, 180).replace(/\.$/, '');

  const targetRole = params.targetRole || 'leadership teams';
  const targetIndustry = params.targetIndustry || 'their market';
  const tone = params.tone || 'formal';

  const valueProp = tone === 'direct'
    ? `We help ${targetRole} scale with ${brandClean}: ${cleanedSummary}.`
    : `Empowering ${targetRole} in ${targetIndustry} through ${brandClean}: ${cleanedSummary}.`;

  const cta = tone === 'conversational'
    ? 'Open to a brief 10-minute exchange this week?'
    : 'Worth exploring on a brief 10-minute introductory call?';

  const fullInstruction = `Focus on ${brandClean}'s core value: ${cleanedSummary}. Address key operational priorities for ${targetRole} in ${targetIndustry} and propose a low-friction 10-minute introductory discussion. Tone: ${tone}.`;

  return {
    valueProposition: valueProp,
    painPoints: `Operational friction and scaling constraints in ${targetIndustry}.`,
    callToAction: cta,
    fullInstruction,
    source,
  };
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

  const isUrlLike = input.includes('.') || input.startsWith('http');

  // Parallel fast fetch: Direct WebScrape (if URL) and/or Tavily
  const fetchPromises: Promise<void>[] = [];

  if (isUrlLike) {
    fetchPromises.push(
      fetchDirectWebpageContent(input).then((web) => {
        if (web && web.length > 40 && !knowledgeText) {
          knowledgeText = web;
          source = 'WebScrape';
        }
      }).catch(() => {})
    );
  }

  if (tavilyKey && (!isUrlLike || !knowledgeText)) {
    fetchPromises.push(
      searchWithTavily(input, tavilyKey).then((tav) => {
        if (tav && tav.length > 50 && (!knowledgeText || source !== 'WebScrape')) {
          knowledgeText = tav;
          source = 'Tavily';
        }
      }).catch(() => {})
    );
  }

  if (fetchPromises.length > 0) {
    await Promise.allSettled(fetchPromises);
  }

  // 3. Synthesize via LLM
  const { apiKey, endpoint, model } = getAIConfig();
  if (!apiKey) {
    return extractOfferDirectlyFromKnowledge(input, knowledgeText, params, source);
  }

  try {
    const aiController = new AbortController();
    const aiTimeout = setTimeout(() => aiController.abort(), 5500);

    const audienceContext = [
      params.targetRole ? `Target Decision Maker Role: ${params.targetRole}` : '',
      params.targetIndustry ? `Target Industry: ${params.targetIndustry}` : '',
      params.targetLocation ? `Target Market: ${params.targetLocation}` : '',
    ].filter(Boolean).join('\n');

    const response = await fetch(endpoint, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${apiKey}`,
      },
      signal: aiController.signal,
      body: JSON.stringify({
        model,
        messages: [
          {
            role: 'system',
            content: `You are an elite B2B sales copywriter and offer strategist.
Analyze the provided company/product research and generate a high-converting Cold Email Value Proposition & Directive.

STYLING DIRECTIVES:
- ${toneInstruction}
- ${lengthInstruction}

OUTPUT FORMAT: Strict JSON only with no markdown or backticks:
{
  "valueProposition": "1-2 crisp sentences describing the primary offer and business value tailored to the target audience",
  "painPoints": "1 sentence highlighting the exact customer problem or bottleneck solved",
  "callToAction": "A single low-friction CTA (e.g. 10-min strategy review, brief chat)",
  "fullInstruction": "A cohesive instruction combining the value, tone, and CTA to guide AI cold email drafting"
}`,
          },
          {
            role: 'user',
            content: `TARGET BRAND / KNOWLEDGE BASE:
Input: ${input}
Tone: ${tone}
Length: ${length}
${audienceContext ? `TARGET AUDIENCE:\n${audienceContext}` : ''}
${params.additionalContext ? `Additional Context: ${params.additionalContext}` : ''}
${knowledgeText ? `Extracted Web Research:\n${knowledgeText.slice(0, 2500)}` : ''}

Generate the structured value proposition adhering strictly to the requested tone (${tone}) and length (${length}).`,
          },
        ],
        temperature: 0.4,
        max_tokens: 350,
      }),
    });
    clearTimeout(aiTimeout);

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
    return extractOfferDirectlyFromKnowledge(input, knowledgeText, params, source);
  }
}
