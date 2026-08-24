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
          content: `You are a CRM AI assistant for a digital marketing agency (Jet Digital Pro). Classify inbound emails into exactly one category.
Company context: ${params.companyContext}

CRITICAL RULES — Read these FIRST:
- If someone explicitly wants to PAY, SCHEDULE, or HIRE us → "lead"
- If someone mentions a PROJECT with budget/timeline → "lead"
- If it's a forward from a team member about a potential deal → "lead"
- If someone asks for PRICING or QUOTE → "lead"
- Meeting requests are ALWAYS leads
- Emails mentioning clients, SEO, content, writing services are leads
- If it's an automated notification, receipt, or system email → "general"
- If it's a forwarded email from a service (order updates, delivery, etc.) → "general"
- Only classify as "spam" if it's clearly phishing, crypto scams, or completely unrelated junk
- NEVER classify business emails as spam

Categories:
- "lead": the sender explicitly wants business with us — wants to pay, buy, schedule a meeting, get a quote, start a project, hire us, or discusses a deal. Meeting requests, pricing inquiries, and client-related emails are ALWAYS leads.
- "general": automated emails, order notifications, delivery updates, password resets, system alerts, newsletter subscriptions, or forwarded emails without a clear sales ask.
- "spam": unsolicited junk — phishing, crypto scams, random bulk marketing completely unrelated to our services. Do NOT classify business inquiries as spam.

Respond in JSON format only:
{
  "isLead": boolean,
  "confidence": 0-100,
  "reason": "brief reason",
  "extractedCompany": "company name if mentioned",
  "interestLevel": "high|medium|low",
  "category": "lead|general|spam|uncertain",
  "suggestedColumn": "Leads|General|Fail|General"
}

Rules:
- category "lead" -> isLead true, suggestedColumn "Leads"
- category "general" -> isLead false, suggestedColumn "General"
- category "spam" -> isLead false, suggestedColumn "Fail"
- category "uncertain" -> isLead false, suggestedColumn "General", add "[UNCERTAIN]" prefix to reason`,
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
    const parsed = JSON.parse(content);
    console.log(`[AI CLASSIFY] "${params.subject}" → category=${parsed.category}, confidence=${parsed.confidence}, reason=${parsed.reason}`);
    return parsed;
  } catch {
    console.log(`[AI CLASSIFY] FAILED TO PARSE for "${params.subject}": ${content}`);
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
          content: `You write reply emails for a salesperson named ${params.senderName} at JetDigitalPro.

The reply goes TO: ${params.contactName} <${params.contactEmail}>

STRICT RULES — violating any = wrong output:
1. You ARE ${params.senderName}. You are NOT the client.
2. NEVER use phrases like: "I would like", "I want to", "Please give me", "Can I get", "I need" — these are CLIENT phrases
3. ALWAYS use phrases like: "I'd be happy to", "Let me", "Here's", "We can", "I can share", "Absolutely" — these are SENDER phrases
4. The email must offer something, not ask for something
5. Reference what the CLIENT said in their email, then RESPOND to it
6. End with a clear next step (schedule call, share info, etc.)
7. Keep under 120 words
8. Use "Re:" prefix in subject if this is a follow-up

Company context: ${params.companyContext}
Follow-up number: ${params.followUpNumber}

Respond ONLY in this JSON format:
{"subject": "Re: ...", "body": "..."}
`,
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
    const parsed = JSON.parse(content);

    // Post-process: replace client phrases with sender-appropriate alternatives
    if (parsed.body) {
      parsed.body = parsed.body
        .replace(/please give me the pricing/gi, "I'd be happy to share our pricing options")
        .replace(/please give me pricing/gi, "I'd be happy to share our pricing")
        .replace(/i would like to know/gi, "Let me share")
        .replace(/i want to know/gi, "Let me explain")
        .replace(/can i get/gi, "I can provide")
        .replace(/i need/gi, "I can help with")
        .replace(/could you provide/gi, "I can share")
        .replace(/i am interested in/gi, "I'd be happy to discuss")
        .replace(/i'm interested in/gi, "I'd be happy to discuss")
        .replace(/would you be able to/gi, "I can")
        .replace(/can you send me/gi, "I'll send you")
        .replace(/i was wondering/gi, "Let me share");

      // Validate: if body still contains client phrases, use fallback
      const stillClient = /please give me|i would like|i want to|can i get|i need|could you provide/i.test(parsed.body);
      if (stillClient) {
        console.log(`[AI DRAFT] Post-process failed, using fallback for ${params.contactEmail}`);
        parsed.body = `Hi ${params.contactName},\n\nThank you for your interest. I'd be happy to share more details about our services and discuss how we can help.\n\nWould you be available for a quick call this week?\n\nBest regards,\n${params.senderName}`;
      }
    }

    return parsed;
  } catch {
    return {
      subject: `Re: Following up`,
      body: `Hi ${params.contactName},\n\nThank you for your interest. I'd be happy to share more details about our services and discuss how we can help.\n\nWould you be available for a quick call this week?\n\nBest regards,\n${params.senderName}`,
    };
  }
}
