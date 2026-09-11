import { NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/server/auth';
import prisma from '@/lib/prisma';

export async function GET() {
  const session = await getServerSession(authOptions);
  if (!session?.user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const userId = (session.user as any).id;
  const tenantId = (session.user as any).tenantId;

  const [user, tenant] = await Promise.all([
    prisma.user.findUnique({
      where: { id: userId },
      select: { id: true, name: true, email: true, avatar: true, role: true },
    }),
    prisma.tenant.findUnique({
      where: { id: tenantId },
      select: { id: true, name: true, companyInfo: true },
    }),
  ]);

  let logoUrl = '';
  try {
    if (tenant?.companyInfo) {
      const parsed = JSON.parse(tenant.companyInfo);
      logoUrl = parsed.logoUrl || '';
    }
  } catch {}

  return NextResponse.json({
    user,
    tenant: {
      id: tenant?.id,
      name: tenant?.name,
      logoUrl,
    },
  });
}
