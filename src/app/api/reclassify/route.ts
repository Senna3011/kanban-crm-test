import { NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/server/auth';
import prisma from '@/lib/prisma';
import { classifyEmail } from '@/lib/ai';

export async function POST() {
  const session = await getServerSession(authOptions);
  if (!session?.user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const tenantId = (session.user as any).tenantId;
  const tenant = await prisma.tenant.findUnique({ where: { id: tenantId } });
  if (!tenant) return NextResponse.json({ error: 'Tenant not found' }, { status: 404 });

  // Exclude workflow columns and deleted cards directly at DB level
  const workflowColumns = ['Leads', 'Follow up 1', 'Follow up 2', 'Follow up 3', 'Success', 'Fail', 'Pending'];
  const cards = await prisma.card.findMany({
    where: {
      tenantId,
      status: { not: 'deleted' },
      column: { title: { notIn: workflowColumns } },
    },
    take: 30, // Limit per run to prevent HTTP timeout
    select: {
      id: true,
      subject: true,
      fromEmail: true,
      fromName: true,
      bodyText: true,
      bodyHtml: true,
      columnId: true,
      column: { select: { title: true, boardId: true } },
    },
  });

  let reclassified = 0;
  let errors = 0;
  const results: { cardId: string; subject: string; from: string; oldColumn: string; newCategory: string; confidence: number }[] = [];

  // Process in chunks of 4 concurrent calls
  const CONCURRENCY = 4;
  for (let i = 0; i < cards.length; i += CONCURRENCY) {
    const chunk = cards.slice(i, i + CONCURRENCY);
    await Promise.all(
      chunk.map(async (card) => {
        try {
          const body = card.bodyText || card.bodyHtml || '';
          if (!body.trim()) return;

          const classification = await classifyEmail({
            companyContext: tenant.companyInfo || '',
            fromName: card.fromName || '',
            fromEmail: card.fromEmail,
            subject: card.subject,
            body,
          });

          if (classification.confidence < 30) return;

          const suggestedColumn = classification.suggestedColumn || (classification.isLead ? 'Leads' : 'General');

          // SAFEGUARD: Never move to Fail unless confidence > 90%
          if (suggestedColumn === 'Fail' && classification.confidence < 90) {
            console.log(`[RECLASSIFY] SKIP Fail for "${card.subject}" — confidence ${classification.confidence}% < 90% threshold`);
            return;
          }

          const targetColumn = await prisma.column.findFirst({
            where: { boardId: card.column.boardId, title: suggestedColumn },
          });

          if (!targetColumn || targetColumn.id === card.columnId) return;

          await prisma.card.update({
            where: { id: card.id },
            data: {
              columnId: targetColumn.id,
              metadata: classification as any,
              lastActivityAt: new Date(),
            },
          });

          await prisma.activityLog.create({
            data: {
              type: 'ai_reclassified',
              content: {
                from: card.column.title,
                to: suggestedColumn,
                category: classification.category,
                confidence: classification.confidence,
                reason: classification.reason,
              },
              cardId: card.id,
              tenantId,
            },
          });

          reclassified++;
          results.push({
            cardId: card.id,
            subject: card.subject,
            from: card.fromEmail,
            oldColumn: card.column.title,
            newCategory: classification.category,
            confidence: classification.confidence,
          });

          console.log(`[RECLASSIFY] ${card.subject} → ${suggestedColumn} (${classification.confidence}%)`);
        } catch (e: any) {
          errors++;
          console.error(`[RECLASSIFY] Failed for card ${card.id}: ${e.message}`);
        }
      })
    );
  }

  return NextResponse.json({
    total: cards.length,
    reclassified,
    errors,
    results,
  });
}
