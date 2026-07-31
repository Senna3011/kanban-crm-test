'use server';

import { getServerSession } from 'next-auth';
import { authOptions } from '@/server/auth';
import prisma from '@/lib/prisma';
import { encrypt, decrypt } from '@/lib/encryption';
import { validateEmailConfigInput, type EmailConfigInput } from '@/lib/email-config-validation';
import Imap from 'node-imap';
import nodemailer from 'nodemailer';

function requireSession() {
  return getServerSession(authOptions).then((session) => {
    if (!session?.user) throw new Error('Please sign in again.');
    return session;
  });
}

function validateConnectionInput(data: { host: string; port: number; user: string; pass: string }) {
  const result = validateEmailConfigInput({
    imapHost: data.host,
    imapPort: data.port,
    imapUser: data.user,
    imapPass: data.pass,
    smtpHost: data.host,
    smtpPort: data.port,
    smtpUser: data.user,
    smtpPass: data.pass,
  }, false);
  if (!result.ok) throw new Error(result.errors[0]);
}

function withTimeout<T>(promise: Promise<T>, ms = 15000): Promise<T> {
  return Promise.race([
    promise,
    new Promise<T>((_, reject) => setTimeout(() => reject(new Error('Connection timed out. Check the host, port, and firewall.')), ms)),
  ]);
}

export async function getEmailConfig() {
  const session = await requireSession();
  const tenantId = (session.user as any).tenantId;
  const [tenant, config] = await Promise.all([
    prisma.tenant.findUnique({ where: { id: tenantId }, select: { name: true, companyInfo: true } }),
    prisma.emailConfig.findUnique({ where: { tenantId } }),
  ]);
  let companyInfo: { name?: string; products?: string } = {};
  try { if (tenant?.companyInfo) companyInfo = JSON.parse(tenant.companyInfo); } catch {}
  return {
    company: { name: tenant?.name || companyInfo.name || '', products: companyInfo.products || '' },
    email: config ? {
      imapHost: config.imapHost, imapPort: config.imapPort, imapUser: config.imapUser,
      smtpHost: config.smtpHost, smtpPort: config.smtpPort, smtpUser: config.smtpUser,
      hasImapPassword: Boolean(config.imapPass), hasSmtpPassword: Boolean(config.smtpPass),
      lastPolledAt: config.lastPolledAt?.toISOString() || null,
    } : null,
  };
}

export type { EmailConfigInput };

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
  const session = await requireSession();
  const tenantId = (session.user as any).tenantId;
  const existing = await prisma.emailConfig.findUnique({ where: { tenantId } });
  const editing = Boolean(existing);
  const validation = validateEmailConfigInput(data, editing);
  if (!validation.ok) throw new Error(validation.errors.join(' '));

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
      ...(data.imapPass ? { imapPass: encrypt(data.imapPass) } : {}),
      smtpHost: data.smtpHost,
      smtpPort: data.smtpPort,
      smtpUser: data.smtpUser,
      ...(data.smtpPass ? { smtpPass: encrypt(data.smtpPass) } : {}),
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
  await requireSession();
  try {
    validateConnectionInput(data);
    await withTimeout(new Promise<void>((resolve, reject) => {
      const imap = new Imap({
        user: data.user,
        password: data.pass,
        host: data.host,
        port: data.port,
        tls: data.port === 993,
        autotls: data.port === 143 ? 'always' : 'never',
        connTimeout: 12000,
        authTimeout: 12000,
      });
      const close = () => { try { imap.end(); } catch {} };
      imap.once('ready', () => { close(); resolve(); });
      imap.once('error', (err) => { close(); reject(err); });
      imap.connect();
    }));
    return { success: true };
  } catch (err: any) {
    return { success: false, error: err?.message || 'IMAP connection failed.' };
  }
}

export async function testSmtpConnection(data: {
  host: string;
  port: number;
  user: string;
  pass: string;
}): Promise<{ success: boolean; error?: string }> {
  await requireSession();
  try {
    validateConnectionInput(data);
    const transporter = nodemailer.createTransport({
      host: data.host,
      port: data.port,
      secure: data.port === 465,
      requireTLS: data.port === 587,
      connectionTimeout: 12000,
      greetingTimeout: 12000,
      socketTimeout: 15000,
      auth: { user: data.user, pass: data.pass },
    });
    await withTimeout(transporter.verify());
    transporter.close();
    return { success: true };
  } catch (err: any) {
    return { success: false, error: err?.message || 'SMTP connection failed.' };
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
