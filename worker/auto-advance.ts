import prisma from '../src/lib/prisma';

const ADVANCE_DAYS = 7;

/**
 * AUTO-ADVANCE RULES (UPDATED):
 * - Cards do NOT auto-advance automatically
 * - Cards ONLY move when user sends a follow-up email via "Send Now" button
 * - This function now only marks cards as "stale" (overdue) for UI display
 * - The actual column move happens in draft.ts sendDraft()
 */
export async function processAutoAdvance(data: { tenantId: string; cardId: string }) {
  const { tenantId, cardId } = data;

  const card = await prisma.card.findUnique({
    where: { id: cardId },
    include: {
      column: { include: { board: true } },
    },
  });

  if (!card) return;

  // If card has been replied to (highlighted), it's not stale
  if (card.highlighted) return;

  // Only check cards in "Follow up" columns
  if (!card.column.title.startsWith('Follow up')) return;

  // Check if nextFollowUpAt has passed — mark as overdue (for UI display)
  if (card.nextFollowUpAt && card.nextFollowUpAt <= new Date()) {
    console.log(`[Auto-Advance] Card ${cardId} is overdue in ${card.column.title} — waiting for user to send follow-up`);
    // Don't auto-advance — just log. User must click "Send Now" to move.
  }
}
