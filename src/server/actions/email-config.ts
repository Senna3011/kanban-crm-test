'use server';

import { getServerSession } from 'next-auth';
import { authOptions } from '@/server/auth';
import prisma from '@/lib/prisma';
import { encrypt, decrypt } from '@/lib/encryption';
import Imap from 'node-imap';
import nodemailer from 'nodemailer';

export async function saveEmailConfig(data: {
  imapHost: string;
  imapPort: number;
  imapUser: string;
  imapPass: string;
  smtpHost: string;
  smtpPort: number;
  smtpUser: string;
  smtpPass: string;
}) {
  const session = await getServerSession(authOptions);
  if (!session?.user) throw new Error('Unauthorized');

  const tenantId = (session.user as any).tenantId;

  await prisma.emailConfig.upsert({
    where: { tenantId },
    create: {
      tenantId,
      imapHost: data.imapHost,
      imapPort: data.imapPort,
      imapUser: data.imapUser,
      imapPass: encrypt(data.imapPass),
      smtpHost: data.smtpHost,
      smtpPort: data.smtpPort,
      smtpUser: data.smtpUser,
      smtpPass: encrypt(data.smtpPass),
    },
    update: {
      imapHost: data.imapHost,
      imapPort: data.imapPort,
      imapUser: data.imapUser,
      imapPass: encrypt(data.imapPass),
      smtpHost: data.smtpHost,
      smtpPort: data.smtpPort,
      smtpUser: data.smtpUser,
      smtpPass: encrypt(data.smtpPass),
    },
  });

  return { success: true };
}

export async function testImapConnection(data: {
  host: string;
  port: number;
  user: string;
  pass: string;
}): Promise<{ success: boolean; error?: string }> {
  return new Promise((resolve) => {
    const imap = new Imap({
      user: data.user,
      password: data.pass,
      host: data.host,
      port: data.port,
      tls: true,
    });

    imap.once('ready', () => {
      imap.end();
      resolve({ success: true });
    });

    imap.once('error', (err) => {
      resolve({ success: false, error: err.message });
    });

    imap.connect();
  });
}

export async function testSmtpConnection(data: {
  host: string;
  port: number;
  user: string;
  pass: string;
}): Promise<{ success: boolean; error?: string }> {
  try {
    const transporter = nodemailer.createTransport({
      host: data.host,
      port: data.port,
      secure: data.port === 465,
      auth: { user: data.user, pass: data.pass },
    });
    await transporter.verify();
    return { success: true };
  } catch (err: any) {
    return { success: false, error: err.message };
  }
}

export async function updateCompanyInfo(data: {
  name: string;
  companyInfo: string;
}) {
  const session = await getServerSession(authOptions);
  if (!session?.user) throw new Error('Unauthorized');

  const tenantId = (session.user as any).tenantId;

  await prisma.tenant.update({
    where: { id: tenantId },
    data: { name: data.name, companyInfo: data.companyInfo },
  });

  return { success: true };
}
