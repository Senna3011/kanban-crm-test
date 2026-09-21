import { getAIConfig } from './ai';

export interface GenerateColdEmailParams {
  prospectName: string;
  jobTitle?: string;
  companyName?: string;
  linkedinSummary?: string;
  senderName: string;
  senderCompany?: string;
  customInstructions?: string;
}

export interface ColdEmailDraftResult {
  subject: string;
  body: string;
}

export async function generatePersonalizedColdEmail(
  params: GenerateColdEmailParams
): Promise<ColdEmailDraftResult> {
  const { apiKey, endpoint, model } = getAIConfig();
  const senderCompany = params.senderCompany || 'our enterprise consultancy';
  const customInstructions = params.customInstructions
    ? `\nCampaign Custom Guidance:\n${params.customInstructions}\n`
    : '';

  try {
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
            content: `You are an executive outbound sales copywriter crafting cold email introductions for ${params.senderName} at ${senderCompany}.

CRITICAL COPYWRITING DIRECTIVES:
1. Write exclusively in concise, polite, and persuasive American English.
2. Address the prospect directly: "${params.prospectName}".
3. Reference their role (${params.jobTitle || 'Executive'}) and organization (${params.companyName || 'their firm'}).
4. Deliver high value in under 110 words without aggressive or spammy sales tactics.
5. Provide a single, low-friction call-to-action (e.g., a brief 10-minute discovery exchange).
6. Structure output STRICTLY in JSON format with keys "subject" and "body".
${customInstructions}`,
          },
          {
            role: 'user',
            content: `Prospect Details:
- Name: ${params.prospectName}
- Job Title: ${params.jobTitle || 'Executive'}
- Company: ${params.companyName || 'Enterprise'}
- Background Summary: ${params.linkedinSummary || 'Industry leader focused on scaling and operational excellence.'}

Craft an authentic, value-focused introductory cold email.`,
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
      subject: parsed.subject || `Quick question regarding ${params.companyName || 'growth initiatives'}`,
      body: parsed.body || generateFallbackBody(params),
    };
  } catch (error) {
    console.error('[OUTREACH AI] Generation error, applying high-conversion template:', error);
    return {
      subject: `Exploring strategic collaboration with ${params.companyName || 'your team'}`,
      body: generateFallbackBody(params),
    };
  }
}

function generateFallbackBody(params: GenerateColdEmailParams): string {
  const company = params.companyName || 'your organization';
  const role = params.jobTitle || 'your leadership position';

  return `Hi ${params.prospectName},

I hope this message finds you well.

I came across your profile and was impressed by your work leading initiatives as ${role} at ${company}. We assist companies in your sector to streamline operations, optimize client acquisition, and drive measurable growth.

Would you be open to a brief 10-minute conversation next week to explore if there is mutual alignment?

Best regards,

${params.senderName}`;
}
