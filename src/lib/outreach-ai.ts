import { getAIConfig } from './ai';

export interface GenerateColdEmailParams {
  prospectName: string;
  jobTitle?: string;
  companyName?: string;
  linkedinSummary?: string;
  senderName: string;
  senderCompany?: string;
  companyKnowledge?: string;
  productsOffer?: string;
  customInstructions?: string;
}

export interface ColdEmailDraftResult {
  subject: string;
  body: string;
  isAiGenerated: boolean;
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
    ? `\nCampaign Custom Guidance:\n${params.customInstructions}\n`
    : '';

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
            content: `You are an executive outbound sales copywriter crafting cold email introductions for ${params.senderName} representing ${senderCompany}.

COMPANY & OFFERING CONTEXT:
${companyContext}

CRITICAL COPYWRITING DIRECTIVES:
1. Write exclusively in concise, professional, and persuasive American English.
2. Address the prospect directly: "${params.prospectName}".
3. Reference their role (${params.jobTitle || 'Executive'}) and organization (${params.companyName || 'their firm'}).
4. Clearly articulate JetDigitalPro's relevant value: custom software, enterprise automation, or AI/CRM workflows tailored to their likely industry challenges.
5. Keep the body under 120 words. No buzzwords, no spammy marketing cliches.
6. Provide a single, low-friction call-to-action: a complimentary 10-minute discovery call or architecture audit.
7. Structure output STRICTLY in valid JSON format with keys "subject" and "body".
${customInstructions}`,
          },
          {
            role: 'user',
            content: `Prospect Details:
- Name: ${params.prospectName}
- Job Title: ${params.jobTitle || 'Executive'}
- Company: ${params.companyName || 'Enterprise'}
- Background Summary: ${params.linkedinSummary || 'Industry leader focused on scaling and operational excellence.'}

Craft an authentic, high-converting cold email tailored to their profile and our solutions.`,
          },
        ],
        temperature: 0.7,
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

    return {
      subject: parsed.subject || `Architecture & Automation Strategy for ${params.companyName || 'your team'}`,
      body: parsed.body || generateFallbackBody(params),
      isAiGenerated: true,
    };
  } catch (error) {
    console.warn('[OUTREACH AI] Generation fallback applied:', error);
    return {
      subject: `Accelerating software & pipeline efficiency at ${params.companyName || 'your team'}`,
      body: generateFallbackBody(params),
      isAiGenerated: false,
    };
  }
}

function generateFallbackBody(params: GenerateColdEmailParams): string {
  const company = params.companyName || 'your organization';
  const role = params.jobTitle || 'your leadership position';

  return `Hi ${params.prospectName},

I hope this message finds you well.

I came across your work as ${role} at ${company} and wanted to reach out. At JetDigitalPro, we partner with growing enterprises to build custom software, implement AI workflow automation, and streamline pipeline operations.

Given your focus on operational growth, I would love to share how we helped similar teams eliminate workflow bottlenecks and scale their tech infrastructure.

Would you be open to a brief 10-minute exploratory conversation next week?

Best regards,

${params.senderName}
JetDigitalPro Team`;
}
