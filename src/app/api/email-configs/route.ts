import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/server/auth';
import prisma from '@/lib/prisma';

export async function GET(req: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session?.user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const tenantId = (session.user as any).tenantId;
  const { searchParams } = new URL(req.url);
  const boardId = searchParams.get('boardId')?.trim();

  // If boardId is provided, filter strictly to email accounts authorized for this specific board
  if (boardId) {
    const boardConfigs = await prisma.emailConfig.findMany({
      where: { tenantId, isActive: true, boardId },
      select: { id: true, name: true, smtpUser: true, imapUser: true, boardId: true },
    });

    // Check if this board has Multi-ESP Outreach Senders enabled in Tenant companyInfo
    let allowAllOutreach = false;
    try {
      const tenant = await prisma.tenant.findUnique({
        where: { id: tenantId },
        select: { companyInfo: true },
      });
      if (tenant?.companyInfo) {
        const info = JSON.parse(tenant.companyInfo);
        allowAllOutreach = Boolean(info.boardSettings?.[boardId]?.allowAllOutreach);
      }
    } catch {}

    const results: any[] = [...boardConfigs];

    // If multi-sender outreach is enabled for this board (hundreds of senders across ESPs)
    if (allowAllOutreach) {
      const outreachAccounts = await prisma.outreachAccountConfig.findMany({
        where: { tenantId, isActive: true },
        select: { id: true, name: true, senderEmail: true, senderName: true },
      });

      for (const acc of outreachAccounts) {
        if (!results.some((r) => r.smtpUser?.toLowerCase() === acc.senderEmail.toLowerCase())) {
          results.push({
            id: `outreach-${acc.id}`,
            name: `${acc.senderName} (${acc.senderEmail})`,
            smtpUser: acc.senderEmail,
            imapUser: acc.senderEmail,
            boardId,
            isOutreachAccount: true,
          });
        }
      }
    }

    return NextResponse.json(results);
  }

  // Without boardId (e.g. Settings management): return all tenant email configs
  const allConfigs = await prisma.emailConfig.findMany({
    where: { tenantId, isActive: true },
    select: { id: true, name: true, smtpUser: true, imapUser: true, boardId: true },
  });

  return NextResponse.json(allConfigs);
}
