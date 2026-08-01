import prisma from './prisma';
import { decrypt } from './encryption';
import { EmailAdapter } from '../../channels/email';

const emailAdapter = new EmailAdapter();

async function getImapConfig(tenantId: string) {
  const config = await prisma.emailConfig.findFirst({ where: { tenantId, isActive: true } });
  if (!config) return null;
  return {
    host: config.imapHost,
    port: String(config.imapPort),
    user: config.imapUser,
    password: decrypt(config.imapPass),
  };
}

export async function syncMarkAsRead(tenantId: string, cardId: string): Promise<boolean> {
  const card = await prisma.card.findUnique({ where: { id: cardId } });
  if (!card || !card.imapUid) return false;

  const imapConfig = await getImapConfig(tenantId);
  if (!imapConfig) return false;

  console.log(`[IMAP Sync] Marking ${card.messageId} as read (UID: ${card.imapUid})`);
  return emailAdapter.markAsRead(imapConfig, card.imapUid);
}

export async function syncArchiveEmail(tenantId: string, cardId: string): Promise<boolean> {
  const card = await prisma.card.findUnique({ where: { id: cardId } });
  if (!card || !card.imapUid) return false;

  const imapConfig = await getImapConfig(tenantId);
  if (!imapConfig) return false;

  console.log(`[IMAP Sync] Archiving ${card.messageId} (UID: ${card.imapUid})`);
  return emailAdapter.moveToFolder(imapConfig, card.imapUid, 'Archive');
}
