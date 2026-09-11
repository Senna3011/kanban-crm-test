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
  });

  if (!target) {
    return NextResponse.json({ error: 'Board tidak ditemukan.' }, { status: 404 });
  }

  // Delete board (cascade deletes columns and related cards)
  await prisma.board.delete({
    where: { id },
  });

  return NextResponse.json({ success: true });
}
