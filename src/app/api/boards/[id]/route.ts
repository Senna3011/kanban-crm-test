import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/server/auth';
import prisma from '@/lib/prisma';

export async function DELETE(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await getServerSession(authOptions);
  if (!session?.user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const role = (session.user as any).role;
  if (role !== 'admin') {
    return NextResponse.json({ error: 'Forbidden: Admin access required.' }, { status: 403 });
  }

  const tenantId = (session.user as any).tenantId;
  const { id } = await params;

  // Check how many boards the tenant has
  const count = await prisma.board.count({
    where: { tenantId },
  });

  if (count <= 1) {
    return NextResponse.json(
      { error: 'Tidak dapat menghapus satu-satunya papan (board) yang tersisa.' },
      { status: 400 }
    );
  }

  const target = await prisma.board.findFirst({
    where: { id, tenantId },
    include: {
      columns: {
        select: { id: true },
      },
    },
  });

  if (!target) {
    return NextResponse.json({ error: 'Board tidak ditemukan.' }, { status: 404 });
  }

  const columnIds = target.columns.map((c) => c.id);

  try {
    await prisma.$transaction(async (tx) => {
      if (columnIds.length > 0) {
        // Find all cards in these columns
        const cards = await tx.card.findMany({
          where: { columnId: { in: columnIds } },
          select: { id: true },
        });
        const cardIds = cards.map((c) => c.id);

        if (cardIds.length > 0) {
          // 1. Delete notifications referencing these cards
          await tx.notification.deleteMany({
            where: { cardId: { in: cardIds } },
          });

          // 2. Unlink spam logs referencing these cards
          await tx.spamLog.updateMany({
            where: { recoveredToId: { in: cardIds } },
            data: { recoveredToId: null },
          });

          // 3. Delete activity logs and draft messages
          await tx.activityLog.deleteMany({
            where: { cardId: { in: cardIds } },
          });
          await tx.draftMessage.deleteMany({
            where: { cardId: { in: cardIds } },
          });

          // 4. Delete all cards
          await tx.card.deleteMany({
            where: { id: { in: cardIds } },
          });
        }

        // 5. Delete all columns of the board
        await tx.column.deleteMany({
          where: { id: { in: columnIds } },
        });
      }

      // 6. Unlink any EmailConfig assigned to this board
      await tx.emailConfig.updateMany({
        where: { boardId: id },
        data: { boardId: null },
      });

      // 7. Finally delete the board
      await tx.board.delete({
        where: { id },
      });
    });

    return NextResponse.json({ success: true });
  } catch (err: any) {
    console.error(`[DELETE /api/boards/${id}] Error:`, err);
    return NextResponse.json(
      { error: err?.message || 'Gagal menghapus board karena kendala database.' },
      { status: 500 }
    );
  }
}
