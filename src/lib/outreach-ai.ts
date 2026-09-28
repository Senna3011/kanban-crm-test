import { getAIConfig } from './ai';

export interface GenerateColdEmailParams {
  prospectName: string;
  jobTitle?: string;
  companyName?: string;
  linkedinSummary?: string;
  location?: string;
  industry?: string;
  senderName: string;
  senderCompany?: string;
  senderAddress?: string;
  companyKnowledge?: string;
  productsOffer?: string;
  customInstructions?: string;
  tone?: 'formal' | 'conversational' | 'direct';
  length?: 'concise' | 'detailed';
}

export interface ColdEmailDraftResult {
  subject: string;
  alternativeSubject?: string;
  body: string;
  isAiGenerated: boolean;
  scoreEstimate?: number;
}

const JETDIGITALPRO_DEFAULT_CONTEXT = `
Company: JetDigitalPro (jetdigitalpro.com)
Core Offer: Bespoke Enterprise Software, Custom Cloud Applications & AI Workflow Automation.
Key Value Proposition: We eliminate operational friction, automate sales/support email pipelines, and build scalable web platforms that accelerate revenue growth.
Proof Points: Helped fast-scaling B2B & enterprise teams reduce manual operational overhead by up to 40%.
Call to Action: A brief 9-minute introductory exchange or software architecture review.
`;

export async function generatePersonalizedColdEmail(
  params: GenerateColdEmailParams
): Promise<ColdEmailDraftResult> {
  const { apiKey, endpoint, model } = getAIConfig();
  const senderCompany = params.senderCompany || 'JetDigitalPro';
  const companyContext = params.companyKnowledge || params.productsOffer || JETDIGITALPRO_DEFAULT_CONTEXT;
  const customInstructions = params.customInstructions
    ? `\nCampaign Custom Guidance:\n${params.customInstructions}\n`
    : '';

  const toneInstruction = params.tone === 'conversational'
    ? 'Tone: Warm, peer-to-peer conversational, friendly yet professional.'
    : params.tone === 'direct'
    ? 'Tone: Direct, punchy, immediate value proposition, zero fluff.'
    : 'Tone: Executive, consultative, polished, and respectful.';

  const lengthInstruction = params.length === 'detailed'
    ? 'Length: 100-130 words with 2 clear value bullet points and quantifiable proof.'
    : 'Length: Under 85 words, concise, high-impact, mobile-friendly (scannable in 15 seconds).';

  // Role-specific angle guidance
  const roleLower = (params.jobTitle || '').toLowerCase();
  let roleAngle = 'Focus on operational efficiency and driving scalable business outcomes.';
  if (roleLower.includes('cto') || roleLower.includes('tech') || roleLower.includes('engineering') || roleLower.includes('developer')) {
    roleAngle = 'Focus on developer velocity, reducing technical debt, robust API/cloud architecture, and eliminating manual engineering overhead.';
  } else if (roleLower.includes('sales') || roleLower.includes('revenue') || roleLower.includes('growth')) {
    roleAngle = 'Focus on inbound pipeline speed, automated lead qualification, eliminating CRM data-entry friction, and boosting deal velocity.';
  } else if (roleLower.includes('marketing') || roleLower.includes('cmo')) {
    roleAngle = 'Focus on multi-channel attribution, automated customer touchpoints, and higher conversion rates.';
  } else if (roleLower.includes('ceo') || roleLower.includes('founder') || roleLower.includes('owner') || roleLower.includes('director')) {
    roleAngle = 'Focus on strategic speed of execution, team productivity, cost-effective scaling, and measurable ROI.';
  }

  try {
    if (!apiKey) {
      throw new Error('No AI API key configured');
    }

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
            content: `You are an elite B2B Cold Outreach Copywriter writing an ultra-personalized cold email on behalf of ${params.senderName} from ${senderCompany}.

SENDER CONTEXT & OFFER:
${companyContext}

COPYWRITING FRAMEWORK (8-POINT PERSONALIZATION):
1. Natural Hook: Start with a natural, authentic 1-sentence observation tailored to their role (${params.jobTitle || 'Executive'}) at ${params.companyName || 'their company'}. Never use fake generic praise like "I hope this email finds you well" or "I came across your impressive profile".
2. Role-Targeted Pain: ${roleAngle}
3. Relevant Bridge: Connect the pain point directly to how ${senderCompany} delivers quantifiable results.
4. Social Proof: Include a brief, believable metric or outcome.
5. Low-Friction CTA: Ask for a casual 9-minute exchange or quick feedback.
6. ${toneInstruction}
7. ${lengthInstruction}
8. Provide 2 distinct, highly clickable subject lines for A/B testing:
   - "subject": Conversational & personalized (e.g. "quick question re: {companyName} systems")
   - "alternativeSubject": Outcome & value-oriented (e.g. "accelerating pipeline efficiency at {companyName}")

OUTPUT FORMAT: Strict JSON only with keys:
- "subject": string
- "alternativeSubject": string
- "body": string`,
          },
          {
            role: 'user',
            content: `PROSPECT PROFILE:
- Full Name: ${params.prospectName}
- Role / Title: ${params.jobTitle || 'Executive'}
- Company: ${params.companyName || 'Enterprise'}
- Location: ${params.location || 'Global'}
- Industry: ${params.industry || 'Business & Technology'}
- LinkedIn Info / Background: ${params.linkedinSummary || `Leading ${params.jobTitle || 'operations'} at ${params.companyName || 'their organization'}`}
${customInstructions}

Craft an ultra-personalized, authentic cold email.`,
          },
        ],
        temperature: 0.65,
        max_tokens: 450,
      }),
    });

    if (!response.ok) {
      throw new Error(`AI Gateway responded with status: ${response.status}`);
    }

    const data = await response.json();
    const content = data.choices?.[0]?.message?.content || '';
    const cleaned = content.replace(/^```json\s*/i, '').replace(/^```\s*/i, '').replace(/\s*```$/i, '').trim();
    const parsed = JSON.parse(cleaned);

    let body = parsed.body || generateFallbackBody(params);
    if (params.senderAddress && !body.includes(params.senderAddress)) {
      body += `\n\n---\n${params.senderCompany || 'JetDigitalPro'}\n${params.senderAddress}`;
    }

    return {
      subject: parsed.subject || `Quick question regarding ${params.companyName || 'your team'} systems`,
      alternativeSubject: parsed.alternativeSubject || `Idea for ${params.companyName || 'your team'} efficiency`,
      body,
      isAiGenerated: true,
      scoreEstimate: 95,
    };
  } catch (error) {
    console.warn('[OUTREACH AI] Hyper-personalized generation fallback applied:', error);
    return {
      subject: `Accelerating workflow efficiency at ${params.companyName || 'your team'}`,
      alternativeSubject: `Question regarding ${params.companyName || 'your team'} automation`,
      body: generateFallbackBody(params),
      isAiGenerated: false,
      scoreEstimate: 78,
    };
  }
}

function generateFallbackBody(params: GenerateColdEmailParams): string {
  const company = params.companyName || 'your team';
  const role = params.jobTitle || 'your leadership position';
  const senderCompany = params.senderCompany || 'JetDigitalPro';

  return `Hi ${params.prospectName},

I noticed your work leading ${role} at ${company}. As enterprise teams scale, eliminating manual operational bottlenecks and architecting reliable software workflows often become key growth drivers.

At ${senderCompany}, we partner with leadership teams to design high-performance web systems and AI-powered pipeline automations tailored to specific business workflows.

Would you be open to a brief 9-minute introductory conversation next week to exchange notes on your current technical priorities?

Best regards,
${params.senderName}
${senderCompany}`;
}
