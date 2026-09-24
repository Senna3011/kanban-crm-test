import { getAIConfig } from './ai';

export interface GenerateColdEmailParams {
  prospectName: string;
  jobTitle?: string;
  companyName?: string;
  linkedinSummary?: string;
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
Core Capabilities:
- Custom Enterprise Web & Cloud Application Development (Next.js, Node.js, Microservices)
- AI & LLM Automation Workflows (Intelligent Lead Scoring, Auto-Classification, AI Assistant Integration)
- Omnichannel CRM & Inbound Pipeline Automation (Email, WhatsApp, Zoho, IMAP/SMTP Orchestration)
- IT Infrastructure & Scalable Cloud Architecture Consulting

Value Proposition:
We help tech-forward leadership and enterprise teams eliminate manual sales/support bottlenecks, automate email pipelines, and build bespoke AI-driven software to accelerate operational efficiency.

Call to Action:
A brief 10-minute complimentary software & architecture review session.
`;

export async function generatePersonalizedColdEmail(
  params: GenerateColdEmailParams
): Promise<ColdEmailDraftResult> {
  const { apiKey, endpoint, model } = getAIConfig();
  const senderCompany = params.senderCompany || 'JetDigitalPro';
  const companyContext = params.companyKnowledge || params.productsOffer || JETDIGITALPRO_DEFAULT_CONTEXT;
  const customInstructions = params.customInstructions
    ? `\nCampaign / Lead Specific Guidance:\n${params.customInstructions}\n`
    : '';

  const toneInstruction = params.tone === 'conversational'
    ? 'Tone: Warm, approachable, peer-to-peer conversational.'
    : params.tone === 'direct'
    ? 'Tone: Highly direct, immediate value focus, zero fluff.'
    : 'Tone: Executive, polished, and consultative.';

  const lengthInstruction = params.length === 'detailed'
    ? 'Keep the body between 100-140 words with 2 clear bullet points of value.'
    : 'Keep the body under 90 words with maximum punchiness.';

  try {
    if (!apiKey) {
      throw new Error('No AI API key configured');
    }

    const response = await fetch(endpoint, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model,
        messages: [
          {
            role: 'system',
            content: `You are a world-class executive B2B sales copywriter crafting cold email introductions for ${params.senderName} representing ${senderCompany}.

COMPANY & VALUE PROPOSITION CONTEXT:
${companyContext}

STYLE & COPYWRITING RULES:
1. Write exclusively in persuasive, clean American English.
2. Address the prospect directly: "${params.prospectName}".
3. Reference their role (${params.jobTitle || 'Executive'}) and organization (${params.companyName || 'their firm'}).
4. Clearly articulate relevant value: enterprise web development, AI workflow automation, or pipeline efficiency tailored to their likely industry scale.
5. ${toneInstruction}
6. ${lengthInstruction}
7. Provide a single, low-friction call-to-action: a complimentary 10-minute discovery call or architecture audit.
8. ${customInstructions}
9. Provide 2 distinct subject lines for A/B testing: primary "subject" and high-converting "alternativeSubject".
10. Structure output STRICTLY in valid JSON format with keys: "subject", "alternativeSubject", and "body".`,
          },
          {
            role: 'user',
            content: `Prospect Details:
- Name: ${params.prospectName}
- Job Title: ${params.jobTitle || 'Executive'}
- Company: ${params.companyName || 'Enterprise Organization'}
- Professional Background: ${params.linkedinSummary || 'Industry leader focused on operational excellence and scaling.'}

Craft an authentic, high-converting cold email tailored to their profile.`,
          },
        ],
        temperature: 0.7,
        max_tokens: 500,
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
      subject: parsed.subject || `Strategy & Architecture for ${params.companyName || 'your team'}`,
      alternativeSubject: parsed.alternativeSubject || `Quick idea regarding ${params.companyName || 'your team'} automation`,
      body,
      isAiGenerated: true,
      scoreEstimate: 92,
    };
  } catch (error) {
    console.warn('[OUTREACH AI] Generation fallback applied:', error);
    return {
      subject: `Accelerating software & pipeline efficiency at ${params.companyName || 'your team'}`,
      alternativeSubject: `Automation ideas for ${params.companyName || 'your team'}`,
      body: generateFallbackBody(params),
      isAiGenerated: false,
      scoreEstimate: 75,
    };
  }
}

function generateFallbackBody(params: GenerateColdEmailParams): string {
  const company = params.companyName || 'your organization';
  const role = params.jobTitle || 'your leadership position';
  const senderCompany = params.senderCompany || 'JetDigitalPro';

  return `Hi ${params.prospectName},

I noticed your work as ${role} at ${company}. As enterprise teams scale, streamlining manual operational bottlenecks and architecting reliable software workflows often become key growth drivers.

At ${senderCompany}, we partner with engineering and operational leaders to design high-performance web systems and AI-powered pipeline automations tailored to specific organizational workflows.

Would you be open to a brief 10-minute introductory conversation next week to exchange notes on your current technical priorities?

Best regards,
${params.senderName}
${senderCompany}`;
}
