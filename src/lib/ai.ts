const DEEPSEEK_API_URL = 'https://api.deepseek.com/v1/chat/completions';

export interface AIClassification {
  isLead: boolean;
  confidence: number;
  reason: string;
  extractedCompany?: string;
  interestLevel: 'high' | 'medium' | 'low';
  suggestedColumn: string;
  category: 'lead' | 'general' | 'spam';
}

export interface FollowUpDraft {
  subject: string;
  body: string;
}

export async function classifyEmail(params: {
  companyContext: string;
  fromName: string;
  fromEmail: string;
  subject: string;
  body: string;
}): Promise<AIClassification> {
  const response = await fetch(DEEPSEEK_API_URL, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${process.env.DEEPSEEK_API_KEY}`,
    },
    body: JSON.stringify({
      model: process.env.DEEPSEEK_MODEL || 'deepseek-chat',
      messages: [
        {
          role: 'system',
          content: `You are a CRM AI assistant. Classify inbound emails into exactly one category.
Company context: ${params.companyContext}

Categories:
- "lead": the sender shows genuine purchase intent, inquiry about services/pricing, or is a prospective client/partner conversation.
- "general": legitimate email that is NOT a sales lead — internal forwards without a clear external ask, system/service notifications (password reset, login alerts, delivery status), collaboration/document comments, work correspondence unrelated to sales.
- "spam": unsolicited marketing, phishing, suspicious content, or clearly irrelevant junk.

Respond in JSON format only:
{
  "isLead": boolean,
  "confidence": 0-100,
  "reason": "brief reason",
  "extractedCompany": "company name if mentioned",
  "interestLevel": "high|medium|low",
  "category": "lead|general|spam",
  "suggestedColumn": "Leads|General|Fail"
}

Rules:
- category "lead" -> isLead true, suggestedColumn "Leads"
- category "general" -> isLead false, suggestedColumn "General"
- category "spam" -> isLead false, suggestedColumn "Fail"`,
        },
        {
          role: 'user',
          content: `From: ${params.fromName} <${params.fromEmail}>
Subject: ${params.subject}
Body: ${params.body}`,
        },
      ],
      temperature: 0.3,
      max_tokens: 500,
    }),
  });

  const data = await response.json();
  const content = data.choices?.[0]?.message?.content;

  try {
    return JSON.parse(content);
  } catch {
    return {
      isLead: false,
      confidence: 0,
      reason: 'Failed to parse AI response',
      interestLevel: 'low',
      category: 'general',
      suggestedColumn: 'General',
    };
  }
}

export async function generateFollowUpDraft(params: {
  companyContext: string;
  senderName: string;
  contactName: string;
  contactEmail: string;
  extractedCompany?: string;
  interestLevel?: string;
  conversationHistory: string[];
  followUpNumber: number;
}): Promise<FollowUpDraft> {
  const historyText = params.conversationHistory.length > 0
    ? `\nConversation history:\n${params.conversationHistory.join('\n---\n')}`
    : '';

  const response = await fetch(DEEPSEEK_API_URL, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${process.env.DEEPSEEK_API_KEY}`,
    },
    body: JSON.stringify({
      model: process.env.DEEPSEEK_MODEL || 'deepseek-chat',
      messages: [
        {
          role: 'system',
          content: `You are a sales AI assistant for JetDigitalPro. Write a professional follow-up email.

Company context: ${params.companyContext}
This is follow-up #${params.followUpNumber}.

CRITICAL RULES:
- The email is FROM: ${params.senderName} (JetDigitalPro)
- The email is TO: the CLIENT (not to the sender or internal team)
- If the conversation history shows a forwarded email, extract the ORIGINAL client from the "To:" header
- Do NOT address the email to the person who forwarded it
- Keep under 150 words
- Professional but not pushy
- Include a clear CTA
- Reference previous conversation if available
- Generate subject and body

Respond in JSON:
{
  "subject": "email subject",
  "body": "email body text"
}`,
        },
        {
          role: 'user',
          content: `Contact: ${params.contactName} <${params.contactEmail}>
Interest: ${params.interestLevel || 'medium'}
Company: ${params.extractedCompany || 'Unknown'}${historyText}`,
        },
      ],
      temperature: 0.7,
      max_tokens: 500,
    }),
  });

  const data = await response.json();
  const content = data.choices?.[0]?.message?.content;

  try {
    return JSON.parse(content);
  } catch {
    return {
      subject: `Following up - ${params.contactName}`,
      body: `Hi ${params.contactName},\n\nI wanted to follow up on our previous conversation. Would you be available for a quick call?\n\nBest regards`,
    };
  }
}
