import prisma from '../src/lib/prisma';

export async function processAutoAdvance(data: { tenantId: string; cardId: string }) {
  const { tenantId, cardId } = data;

  const card = await prisma.card.findUnique({
    where: { id: cardId },
    include: {
      column: { include: { board: true } },
    },
  });

  if (!card || card.tenantId !== tenantId) return;

  // If card has been replied to (highlighted), it's not overdue
  if (card.highlighted) return;

  // Only check cards in "Follow up" columns
  if (!card.column.title.startsWith('Follow up')) return;

  // Check if nextFollowUpAt has passed — flag as overdue
  if (card.nextFollowUpAt && card.nextFollowUpAt <= new Date()) {
    console.log(`[Auto-Advance] Card ${cardId} is overdue in ${card.column.title}`);
    await prisma.card.update({
      where: { id: cardId },
      data: { highlighted: true },
    });
  }
}
