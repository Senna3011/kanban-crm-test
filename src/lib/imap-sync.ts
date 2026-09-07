import prisma from './prisma';
import { decrypt } from './encryption';
import { EmailAdapter } from '../../channels/email';
import { getValidZohoAccessToken } from './zoho-oauth';

const emailAdapter = new EmailAdapter();

async function getImapConfig(tenantId: string, emailConfigId?: string | null): Promise<Record<string, string> | null> {
  let config = null;
  if (emailConfigId) {
    config = await prisma.emailConfig.findFirst({ where: { id: emailConfigId, tenantId, isActive: true } });
  }
  if (!config) {
    config = await prisma.emailConfig.findFirst({ where: { tenantId, isActive: true } });
  }
  if (!config) return null;

  if (config.authType === 'oauth2') {
    try {
      const accessToken = await getValidZohoAccessToken(config.id);
      return {
        host: config.imapHost,
        port: String(config.imapPort),
        user: config.imapUser,
        accessToken,
      };
    } catch (err: any) {
      console.error(`[IMAP Sync] Failed to obtain OAuth2 token for config ${config.id}: ${err.message}`);
      return null;
    }
  }

  if (!config.imapPass) return null;
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

  const imapConfig = await getImapConfig(tenantId, card.emailConfigId);
  if (!imapConfig) return false;

  const folder = card.imapFolder || 'INBOX';
  let uid = card.imapUid;
  if (!uid && card.messageId) {
    uid = await emailAdapter.findUidByMessageId(imapConfig, card.messageId, folder);
  }
  if (!uid) return false;

  console.log(`[IMAP Sync] Marking ${card.messageId} as read (UID: ${uid}) in ${folder}`);
  return emailAdapter.markAsRead(imapConfig, uid, folder);
}

export async function syncArchiveEmail(
  tenantId: string,
  cardIdOrData: string | { messageId?: string | null; imapUid?: number | null; imapFolder?: string | null; emailConfigId?: string | null }
): Promise<boolean> {
  const card = typeof cardIdOrData === 'string'
    ? await prisma.card.findUnique({ where: { id: cardIdOrData } })
    : cardIdOrData;

  if (!card) return false;

  const imapConfig = await getImapConfig(tenantId, card.emailConfigId);
  if (!imapConfig) return false;

  const folder = card.imapFolder || 'INBOX';
  let uid = card.imapUid;
  if (!uid && card.messageId) {
    uid = await emailAdapter.findUidByMessageId(imapConfig, card.messageId, folder);
  }
  if (!uid) return false;

  console.log(`[IMAP Sync] Archiving ${card.messageId} (UID: ${uid}) from ${folder}`);
  const moved = await emailAdapter.moveToFolder(imapConfig, uid, 'Archive', folder);
  if (!moved) {
    // Fallback if 'Archive' does not exist
    return emailAdapter.moveToFolder(imapConfig, uid, 'Trash', folder);
  }
  return true;
}
