import { NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/server/auth';
import prisma from '@/lib/prisma';

export async function GET() {
  const session = await getServerSession(authOptions);
  if (!session?.user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const tenantId = (session.user as any).tenantId;
  const configs = await prisma.emailConfig.findMany({
    where: { tenantId, isActive: true },
    select: { id: true, name: true, smtpUser: true, imapUser: true },
  });

  // Also discover known team aliases from received cards in this tenant
  const knownCards = await prisma.card.findMany({
    where: {
      tenantId,
      metadata: { not: null as any },
    },
    select: { metadata: true },
    take: 100,
    orderBy: { createdAt: 'desc' },
  });

  const existingEmails = new Set(configs.map((c) => c.smtpUser?.toLowerCase().trim()).filter(Boolean));
  const additionalAliases: any[] = [];

  // Known official Send-Mail-As team alias addresses for Jet Digital Pro Zoho organization (from Pak Nell's Send-Mail-As config)
  const JDP_ZOHO_ALIASES = [
    { email: 'jdp-diamond-team@jetdigitalpro.com', name: 'Diamond Team' },
    { email: 'jdp-elite-team@jetdigitalpro.com', name: 'Elite Team' },
    { email: 'jdp-gold-team@jetdigitalpro.com', name: 'Gold Team' },
    { email: 'jdp-premiere-team@jetdigitalpro.com', name: 'Premiere Team' },
    { email: 'nellvh@jetdigitalpro.com', name: 'Nell VH' },
  ];

  const hasJdpOrZoho = configs.some(
    (c) =>
      c.smtpUser?.includes('jetdigitalpro.com') ||
      c.imapUser?.includes('jetdigitalpro.com') ||
      c.name?.toLowerCase().includes('zoho')
  );

  if (hasJdpOrZoho) {
    for (const alias of JDP_ZOHO_ALIASES) {
      if (!existingEmails.has(alias.email)) {
        existingEmails.add(alias.email);
        additionalAliases.push({
          id: `alias-${alias.email}`,
          name: `${alias.name} (${alias.email})`,
          smtpUser: alias.email,
          imapUser: alias.email,
        });
      }
    }
  }

  for (const card of knownCards) {
    const meta: any = card.metadata;
    const toEmail = meta?.toEmail?.toLowerCase().trim();
    if (toEmail && toEmail.includes('@') && !existingEmails.has(toEmail)) {
      existingEmails.add(toEmail);
      additionalAliases.push({
        id: `alias-${toEmail}`,
        name: `Team Alias (${toEmail.split('@')[0]})`,
        smtpUser: toEmail,
        imapUser: toEmail,
      });
    }
  }

  return NextResponse.json([...configs, ...additionalAliases]);
}
