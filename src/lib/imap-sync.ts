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
  if (!card) return false;

  const imapConfig = await getImapConfig(tenantId);
  if (!imapConfig) return false;

  // Try by UID first, fallback to search by Message-ID
  let uid = card.imapUid;
  if (!uid && card.messageId) {
    uid = await emailAdapter.findUidByMessageId(imapConfig, card.messageId);
  }
  if (!uid) return false;

  console.log(`[IMAP Sync] Marking ${card.messageId} as read (UID: ${uid})`);
  return emailAdapter.markAsRead(imapConfig, uid);
}

export async function syncArchiveEmail(tenantId: string, cardId: string): Promise<boolean> {
  const card = await prisma.card.findUnique({ where: { id: cardId } });
  if (!card) return false;

  const imapConfig = await getImapConfig(tenantId);
  if (!imapConfig) return false;

  let uid = card.imapUid;
  if (!uid && card.messageId) {
    uid = await emailAdapter.findUidByMessageId(imapConfig, card.messageId);
  }
  if (!uid) return false;

  console.log(`[IMAP Sync] Archiving ${card.messageId} (UID: ${uid})`);
  return emailAdapter.moveToFolder(imapConfig, uid, 'Archive');
}
