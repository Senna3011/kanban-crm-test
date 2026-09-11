'use server';

import { requireAuth, requireAdmin } from '@/lib/auth-guards';
import prisma from '@/lib/prisma';
import { encrypt, decrypt } from '@/lib/encryption';
import { validateEmailConfigInput, type EmailConfigInput } from '@/lib/email-config-validation';
import { validateImageInput } from '@/lib/image-validation';
import { ImapFlow } from 'imapflow';
import nodemailer from 'nodemailer';
import { getValidZohoAccessToken } from '@/lib/zoho-oauth';

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

export async function getEmailConfigs() {
  const user = await requireAuth();
  const tenantId = user.tenantId;
  const [tenant, configs, boards] = await Promise.all([
    prisma.tenant.findUnique({ where: { id: tenantId }, select: { name: true, companyInfo: true } }),
    prisma.emailConfig.findMany({ where: { tenantId }, orderBy: { createdAt: 'asc' } }),
    prisma.board.findMany({ where: { tenantId }, select: { id: true, title: true } }),
  ]);
  let companyInfo: { name?: string; products?: string; logoUrl?: string } = {};
  try { if (tenant?.companyInfo) companyInfo = JSON.parse(tenant.companyInfo); } catch {}
  return {
    company: { name: tenant?.name || companyInfo.name || '', products: companyInfo.products || '', logoUrl: companyInfo.logoUrl || '' },
    configs: configs.map(c => ({
      id: c.id, name: c.name, boardId: c.boardId || undefined,
      authType: c.authType,
      imapHost: c.imapHost, imapPort: c.imapPort, imapUser: c.imapUser,
      smtpHost: c.smtpHost, smtpPort: c.smtpPort, smtpUser: c.smtpUser,
      hasImapPassword: Boolean(c.imapPass), hasSmtpPassword: Boolean(c.smtpPass),
      hasOAuthToken: Boolean(c.accessToken),
      lastPolledAt: c.lastPolledAt?.toISOString() || null,
      isActive: c.isActive,
    })),
    boards,
  };
}

// Keep backward compat
export async function getEmailConfig() {
  const result = await getEmailConfigs();
  return { ...result, email: result.configs[0] || null };
}

export type { EmailConfigInput };

export async function saveEmailConfig(data: {
  id?: string;
  name?: string;
  boardId?: string;
  imapHost: string;
  imapPort: number;
  imapUser: string;
  imapPass: string;
  smtpHost: string;
  smtpPort: number;
  smtpUser: string;
  smtpPass: string;
}) {
  const user = await requireAdmin();
  const tenantId = user.tenantId;
  const configName = (data.name || 'Default').trim();
  const existing = data.id
    ? await prisma.emailConfig.findFirst({ where: { id: data.id, tenantId } })
    : await prisma.emailConfig.findFirst({ where: { tenantId, name: configName } });
  const editing = Boolean(existing);
  const validation = validateEmailConfigInput(data, editing);
  if (!validation.ok) throw new Error(validation.errors.join(' '));

  const updateData: any = {
    name: configName,
    imapHost: data.imapHost,
    imapPort: data.imapPort,
    imapUser: data.imapUser,
    smtpHost: data.smtpHost,
    smtpPort: data.smtpPort,
    smtpUser: data.smtpUser,
    boardId: data.boardId || null,
  };
  if (data.imapPass) updateData.imapPass = encrypt(data.imapPass);
  if (data.smtpPass) updateData.smtpPass = encrypt(data.smtpPass);

  if (existing) {
    await prisma.emailConfig.update({ where: { id: existing.id }, data: updateData });
  } else {
    if (!data.imapPass || !data.smtpPass) throw new Error('Password is required for new email configuration.');
    await prisma.emailConfig.create({
      data: { tenantId, ...updateData, imapPass: encrypt(data.imapPass), smtpPass: encrypt(data.smtpPass) },
    });
  }

  return { success: true };
}

export async function deleteEmailConfig(id: string) {
  const user = await requireAdmin();
  const tenantId = user.tenantId;
  const config = await prisma.emailConfig.findFirst({ where: { id, tenantId } });
  if (!config) throw new Error('Configuration not found.');
  await prisma.emailConfig.delete({ where: { id } });
  return { success: true };
}

export async function testImapConnection(data: {
  configId?: string;
  host: string;
  port: number;
  user: string;
  pass?: string;
}): Promise<{ success: boolean; error?: string }> {
  const user = await requireAdmin();
  const tenantId = user.tenantId;
  try {
    let authConfig: any;
    if (data.configId) {
      const config = await prisma.emailConfig.findFirst({
        where: { id: data.configId, tenantId },
      });
      if (config?.authType === 'oauth2') {
        const accessToken = await getValidZohoAccessToken(config.id);
        authConfig = { user: data.user || config.imapUser, accessToken };
      }
    }

    if (!authConfig) {
      validateConnectionInput({
        host: data.host,
        port: data.port,
        user: data.user,
        pass: data.pass || '',
      });
      authConfig = { user: data.user, pass: data.pass };
    }

    const imap = new ImapFlow({
      host: data.host,
      port: data.port,
      secure: data.port === 993,
      auth: authConfig,
      tls: { rejectUnauthorized: false },
      logger: false,
    });
    await withTimeout((async () => {
      try {
        await imap.connect();
      } finally {
        await imap.logout();
      }
    })());
    return { success: true };
  } catch (err: any) {
    return { success: false, error: err?.message || 'IMAP connection failed.' };
  }
}

export async function testSmtpConnection(data: {
  configId?: string;
  host: string;
  port: number;
  user: string;
  pass?: string;
}): Promise<{ success: boolean; error?: string }> {
  const user = await requireAdmin();
  const tenantId = user.tenantId;
  try {
    let authConfig: any;
    if (data.configId) {
      const config = await prisma.emailConfig.findFirst({
        where: { id: data.configId, tenantId },
      });
      if (config?.authType === 'oauth2') {
        const accessToken = await getValidZohoAccessToken(config.id);
        authConfig = { type: 'OAuth2', user: data.user || config.smtpUser, accessToken };
      }
    }

    if (!authConfig) {
      validateConnectionInput({
        host: data.host,
        port: data.port,
        user: data.user,
        pass: data.pass || '',
      });
      authConfig = { user: data.user, pass: data.pass };
    }

    const transporter = nodemailer.createTransport({
      host: data.host,
      port: data.port,
      secure: data.port === 465,
      requireTLS: data.port === 587,
      connectionTimeout: 12000,
      greetingTimeout: 12000,
      socketTimeout: 15000,
      auth: authConfig,
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
  logoUrl?: string;
}) {
  const user = await requireAdmin();
  const tenantId = user.tenantId;

  let currentCompanyInfo: any = {};
  try {
    const t = await prisma.tenant.findUnique({ where: { id: tenantId } });
    if (t?.companyInfo) currentCompanyInfo = JSON.parse(t.companyInfo);
  } catch {}

  let parsedNewInfo: any = {};
  try {
    parsedNewInfo = JSON.parse(data.companyInfo);
  } catch {
    parsedNewInfo = { products: data.companyInfo };
  }

  const validatedLogo = data.logoUrl !== undefined ? validateImageInput(data.logoUrl, 'Logo Perusahaan') : currentCompanyInfo.logoUrl;

  const finalCompanyInfo = JSON.stringify({
    ...currentCompanyInfo,
    ...parsedNewInfo,
    name: data.name,
    logoUrl: validatedLogo || undefined,
  });

  const updateData: any = {
    name: data.name,
    companyInfo: finalCompanyInfo,
  };
  if (validatedLogo !== undefined) {
    updateData.logoUrl = validatedLogo;
  }

  await prisma.tenant.update({
    where: { id: tenantId },
    data: updateData,
  });

  return { success: true };
}
