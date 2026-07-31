import prisma from './prisma';
import { decrypt } from './encryption';
import { EmailAdapter } from '../../channels/email';

const emailAdapter = new EmailAdapter();

export async function fetchNewEmails(tenantId: string): Promise<number> {
  const config = await prisma.emailConfig.findFirst({ where: { tenantId } });
  if (!config || !config.isActive) return 0;

  const imapConfig = {
    host: config.imapHost,
    port: String(config.imapPort),
    user: config.imapUser,
    password: decrypt(config.imapPass),
  };

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
  const config = await prisma.emailConfig.findFirst({ where: { tenantId } });
  if (!config) return false;

  const smtpConfig = {
    smtpHost: config.smtpHost,
    smtpPort: String(config.smtpPort),
    smtpUser: config.smtpUser,
    smtpPassword: decrypt(config.smtpPass),
  };

  const result = await emailAdapter.sendMessage({ to, subject, body, inReplyTo }, smtpConfig);
  return result.success;
}
