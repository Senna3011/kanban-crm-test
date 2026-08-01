import prisma from '../src/lib/prisma';
import { classifyEmail, generateFollowUpDraft } from '../src/lib/ai';

export async function processAIClassify(data: {
  tenantId: string;
  cardId: string;
  fromName: string;
  fromEmail: string;
  subject: string;
  body: string;
}) {
  const { tenantId, cardId, fromName, fromEmail, subject, body } = data;

  const tenant = await prisma.tenant.findUnique({ where: { id: tenantId } });
  if (!tenant) return;

  const classification = await classifyEmail({
    companyContext: tenant.companyInfo || '',
    fromName,
    fromEmail,
    subject,
    body,
  });

  console.log(`[AI] Classified card ${cardId}: isLead=${classification.isLead}, confidence=${classification.confidence}`);

  // Log AI classification
  await prisma.activityLog.create({
    data: {
      type: 'ai_classified',
      content: classification as any,
      cardId,
      tenantId,
    },
  });

  // Move card to appropriate column within the same board the card is on
  const suggestedColumn = classification.suggestedColumn || (classification.isLead ? 'Leads' : 'General');
  const currentCard = await prisma.card.findUnique({
    where: { id: cardId },
    select: { column: { select: { boardId: true } } },
  });
  const boardId = currentCard?.column.boardId;
  if (!boardId) return;

  const targetColumn = await prisma.column.findFirst({
    where: { boardId, title: suggestedColumn },
  });

  if (targetColumn) {
    await prisma.card.update({
      where: { id: cardId },
      data: {
        columnId: targetColumn.id,
        metadata: classification as any,
        lastActivityAt: new Date(),
      },
    });
  }

  // If it's a lead, generate first follow-up draft
  if (classification.isLead) {
    // Parse forwarded email to find actual client
    let contactName = fromName;
    let contactEmail = fromEmail;
    // Try multiple patterns to extract client from forwarded email
    const toPatterns = [
      /To:\s*([A-Za-z\s]+)\s*<([a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,})>/i,
      /To:\s*<([a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,})>/i,
      /To:\s*([a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,})/i,
    ];
    for (const pattern of toPatterns) {
      const match = body.match(pattern);
      if (match) {
        if (match[2]) { contactName = match[1].trim(); contactEmail = match[2]; }
        else if (match[1] && match[1].includes('@')) { contactEmail = match[1]; }
        break;
      }
    }

    const draft = await generateFollowUpDraft({
      companyContext: tenant.companyInfo || '',
      senderName: 'Nell VH',
      contactName,
      contactEmail,
      extractedCompany: classification.extractedCompany,
      interestLevel: classification.interestLevel,
      conversationHistory: [body],
      followUpNumber: 1,
    });

    await prisma.draftMessage.create({
      data: {
        channel: 'email',
        subject: draft.subject,
        body: draft.body,
        status: 'pending',
        aiGeneratedAt: new Date(),
        cardId,
        tenantId,
      },
    });

    await prisma.activityLog.create({
      data: {
        type: 'ai_drafted',
        content: { followUpNumber: 1, subject: draft.subject },
        cardId,
        tenantId,
      },
    });
  }
}

export async function processAIDraft(data: {
  tenantId: string;
  cardId: string;
  followUpNumber: number;
}) {
  const { tenantId, cardId, followUpNumber } = data;

  const card = await prisma.card.findUnique({
    where: { id: cardId },
    include: {
      activityLogs: { orderBy: { createdAt: 'asc' } },
    },
  });

  if (!card) return;

  const tenant = await prisma.tenant.findUnique({ where: { id: tenantId } });
  if (!tenant) return;

  const history = card.activityLogs
    .filter((log) => log.type === 'email_received' || log.type === 'email_sent')
    .map((log) => JSON.stringify(log.content));

  const draft = await generateFollowUpDraft({
    companyContext: tenant.companyInfo || '',
    senderName: 'Nell VH',
    contactName: card.fromName || '',
    contactEmail: card.fromEmail,
    conversationHistory: history,
    followUpNumber,
  });

  await prisma.draftMessage.create({
    data: {
      channel: 'email',
      subject: draft.subject,
      body: draft.body,
      status: 'pending',
      aiGeneratedAt: new Date(),
      cardId,
      tenantId,
    },
  });

  await prisma.activityLog.create({
    data: {
      type: 'ai_drafted',
      content: { followUpNumber, subject: draft.subject },
      cardId,
      tenantId,
    },
  });
}
