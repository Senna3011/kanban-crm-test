import prisma from './prisma';
import { decrypt } from './encryption';
import { getValidZohoAccessToken } from './zoho-oauth';
import { EmailAdapter } from '../../channels/email';

const emailAdapter = new EmailAdapter();

export async function fetchNewEmails(tenantId: string): Promise<number> {
  const config = await prisma.emailConfig.findFirst({ where: { tenantId, isActive: true } });
  if (!config) return 0;

  const imapConfig: Record<string, string> = {
    host: config.imapHost,
    port: String(config.imapPort),
    user: config.imapUser,
  };

  if (config.authType === 'oauth2') {
    imapConfig.accessToken = await getValidZohoAccessToken(config.id);
  } else if (config.imapPass) {
    imapConfig.password = decrypt(config.imapPass);
  } else {
    return 0;
  }

  const messages = await emailAdapter.pollInbox(imapConfig);

  await prisma.emailConfig.update({
    where: { id: config.id },
    data: { lastPolledAt: new Date() },
  });

  return messages.length;
}

export async function sendEmail(
  tenantId: string,
  to: string,
  subject: string,
  body: string,
  inReplyTo?: string
): Promise<boolean> {
  const config = await prisma.emailConfig.findFirst({ where: { tenantId, isActive: true } });
  if (!config) return false;

  const smtpConfig: Record<string, string> = {
    smtpHost: config.smtpHost,
    smtpPort: String(config.smtpPort),
    smtpUser: config.smtpUser,
  };

  if (config.authType === 'oauth2') {
    smtpConfig.accessToken = await getValidZohoAccessToken(config.id);
  } else if (config.smtpPass) {
    smtpConfig.smtpPassword = decrypt(config.smtpPass);
  } else {
    return false;
  }

  const result = await emailAdapter.sendMessage({ to, subject, body, inReplyTo }, smtpConfig);
  return result.success;
}
