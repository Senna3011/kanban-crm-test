import prisma from '../src/lib/prisma';
import { aiProcessQueue } from '../queue';

const ADVANCE_DAYS = 7;

export async function processAutoAdvance(data: { tenantId: string; cardId: string }) {
  const { tenantId, cardId } = data;

  const card = await prisma.card.findUnique({
    where: { id: cardId },
    include: {
      column: { include: { board: true } },
    },
  });

  if (!card || card.highlighted) return;

  // Find next column
  const nextColumn = await prisma.column.findFirst({
    where: {
      boardId: card.column.boardId,
      position: card.column.position + 1,
    },
    orderBy: { position: 'asc' },
  });

  if (!nextColumn) return;

  // Move card
  await prisma.card.update({
    where: { id: cardId },
    data: {
      columnId: nextColumn.id,
      lastActivityAt: new Date(),
      nextFollowUpAt: new Date(Date.now() + ADVANCE_DAYS * 24 * 60 * 60 * 1000),
    },
  });

  await prisma.activityLog.create({
    data: {
      type: 'system_advanced',
      content: { fromColumn: card.column.title, toColumn: nextColumn.title },
      cardId,
      tenantId,
    },
  });

  // Generate follow-up draft for new column
  const followUpNumber = parseInt(nextColumn.title.replace('Follow up ', '')) || 1;
  await aiProcessQueue.add('draft_followup', {
    type: 'draft_followup',
    tenantId,
    cardId,
    followUpNumber,
  });
}
