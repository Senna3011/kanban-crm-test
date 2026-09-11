import prisma from '../src/lib/prisma';
import { decrypt } from '../src/lib/encryption';
import { getValidZohoAccessToken } from '../src/lib/zoho-oauth';
import { EmailAdapter } from '../channels/email';
import { aiProcessQueue } from '../queue';

const emailAdapter = new EmailAdapter();

// Dynamic folder to board resolution with optional fallback mapping
const DEFAULT_FOLDER_MAPPING: Record<string, string> = {
  'INBOX': 'JetDigitaPro',
  'Elite': 'Elite Team',
  'Gold': 'Gold Team',
  'Premiere': 'Premiere Team',
  'Nell': 'Nell VH',
};

async function resolveBoard(tenantId: string, toEmail?: string, folder?: string) {
  const tenant = await prisma.tenant.findUnique({ where: { id: tenantId }, select: { companyInfo: true } });
  let routing: Record<string, string> = {};
  let folderRouting: Record<string, string> = {};
  try {
    if (tenant?.companyInfo) {
      const info = JSON.parse(tenant.companyInfo);
      routing = info.emailRouting || {};
      folderRouting = info.folderRouting || {};
    }
  } catch {}

  // 1. Try recipient-based routing
  if (toEmail && routing[toEmail]) {
    const board = await prisma.board.findFirst({ where: { tenantId, title: routing[toEmail] } });
    if (board) return board;
  }

  // 2. Try tenant custom folder-based routing
  if (folder && folderRouting[folder]) {
    const board = await prisma.board.findFirst({ where: { tenantId, title: folderRouting[folder] } });
    if (board) return board;
  }

  // 3. Try matching folder name directly to board title
  if (folder) {
    const directMatch = await prisma.board.findFirst({
      where: { tenantId, title: { equals: folder, mode: 'insensitive' } },
    });
    if (directMatch) return directMatch;
  }

  // 4. Try default mapping
  if (folder && DEFAULT_FOLDER_MAPPING[folder]) {
    const board = await prisma.board.findFirst({ where: { tenantId, title: DEFAULT_FOLDER_MAPPING[folder] } });
    if (board) return board;
  }

  // 5. Fallback: First board of the tenant
  return prisma.board.findFirst({ where: { tenantId } });
}

async function pollFolder(imapConfig: Record<string, string>, folder: string, tenantId: string, emailConfigId: string) {
  console.log(`[IMAP Poller] Polling folder: ${folder}...`);
  
  let messages;
  try {
    messages = await emailAdapter.pollInbox(imapConfig, folder);
  } catch (err: any) {
    console.error(`[IMAP Poller] Error polling ${folder}: ${err.message}`);
    return 0;
  }
  
  console.log(`[IMAP Poller] Found ${messages.length} messages in ${folder}`);
  let created = 0;

  for (const msg of messages) {
    try {
      const existingCard = await prisma.card.findUnique({ where: { messageId: msg.messageId }, select: { id: true, status: true, imapUid: true } });
      if (existingCard) {
        // If card was deleted by user, never resurrect it
        if (existingCard.status === 'deleted') {
          continue;
        }

        // Update read status and imapUid if changed
        const newStatus = msg.isRead ? 'read' : 'unread';
        const updateData: any = {};
        if (existingCard.status !== newStatus) updateData.status = newStatus;
        if (msg.uid && existingCard.imapUid !== msg.uid) updateData.imapUid = msg.uid;
        if (Object.keys(updateData).length > 0) {
          await prisma.card.update({ where: { id: existingCard.id }, data: updateData });
        }
        continue;
      }

      // Skip outbound emails — if fromEmail is from configured mailbox domain or matches configured user
      const senderEmail = msg.fromEmail?.toLowerCase() || '';
      const configUser = imapConfig.user?.toLowerCase() || '';
      const configDomain = configUser.includes('@') ? configUser.split('@')[1] : '';
      const isOurDomain = configDomain ? senderEmail.endsWith(`@${configDomain}`) : false;
      const isConfigUser = configUser && senderEmail === configUser;
      if (isOurDomain || isConfigUser) {
        console.log(`[IMAP Poller] Skipping outbound email: ${msg.subject} (from ${msg.fromEmail})`);
        continue;
      }

      // Skip reply emails — if this is a reply to an existing thread, don't create new card
      // The reply will be picked up by reply detection (highlighted) on the original card
      if (msg.inReplyTo) {
        const parentCard = await prisma.card.findFirst({ where: { messageId: msg.inReplyTo, tenantId } });
        if (parentCard) {
          // Mark parent card as replied (highlighted)
          await prisma.card.update({ where: { id: parentCard.id }, data: { highlighted: true, lastActivityAt: new Date() } });
          await prisma.activityLog.create({
            data: { type: 'email_reply_received', content: { messageId: msg.messageId, subject: msg.subject, from: msg.fromEmail, replyTo: msg.inReplyTo }, cardId: parentCard.id, tenantId },
          });
          console.log(`[IMAP Poller] Reply detected: "${msg.subject}" → parent card ${parentCard.id} marked as highlighted`);
          continue;
        }
        // If parent not found, might be a new thread — allow creation
        console.log(`[IMAP Poller] Reply to unknown message ${msg.inReplyTo}, creating new card`);
      }

      const board = await resolveBoard(tenantId, msg.toEmail, folder);
      if (!board) continue;

      const general = await prisma.column.findFirst({ where: { boardId: board.id, title: 'General' } });
      if (!general) continue;

      try {
        const card = await prisma.card.create({
          data: {
            subject: msg.subject, fromEmail: msg.fromEmail, fromName: msg.fromName,
            bodyText: msg.bodyText, bodyHtml: msg.bodyHtml,
            messageId: msg.messageId, inReplyTo: msg.inReplyTo || null,
            imapUid: msg.uid || null, imapFolder: folder,
            status: msg.isRead ? 'read' : 'unread',
            channel: 'email', columnId: general.id, tenantId, emailConfigId: emailConfigId,
            lastActivityAt: msg.receivedAt || new Date(),
          },
        });
        await prisma.activityLog.create({
          data: { type: 'email_received', content: { messageId: msg.messageId, subject: msg.subject, from: msg.fromEmail, to: msg.toEmail }, cardId: card.id, tenantId },
        });
        await aiProcessQueue.add('classify_email', {
          type: 'classify_email', tenantId, cardId: card.id,
          fromName: msg.fromName || '', fromEmail: msg.fromEmail, subject: msg.subject, body: msg.bodyText,
        });
        created++;
      } catch (createErr: any) {
        // Handle race condition: another poller worker inserted this messageId concurrently
        if (createErr?.code === 'P2002') {
          console.log(`[IMAP Poller] Concurrent insert collision for message ${msg.messageId}, updating existing card.`);
          const existing = await prisma.card.findUnique({ where: { messageId: msg.messageId } });
          if (existing && msg.uid && existing.imapUid !== msg.uid) {
            await prisma.card.update({ where: { id: existing.id }, data: { imapUid: msg.uid, imapFolder: folder } });
          }
          continue;
        }
        throw createErr;
      }
    } catch (error: any) {
      console.error(`[IMAP Poller] Failed message ${msg.messageId}: ${error?.message}`);
    }
  }
  return created;
}

export async function processEmailPoll(data: { tenantId: string; emailConfigId: string }) {
  const { tenantId, emailConfigId } = data;

  const config = await prisma.emailConfig.findUnique({ where: { id: emailConfigId } });
  if (!config || !config.isActive || config.tenantId !== tenantId) return;

  let accessToken: string | undefined;
  let password = '';
  if (config.authType === 'oauth2') {
    try {
      accessToken = await getValidZohoAccessToken(config.id);
    } catch (err: any) {
      console.error(`[IMAP Poller] Failed to get valid OAuth token for ${config.imapUser}: ${err.message}`);
      return;
    }
  } else if (config.imapPass) {
    password = decrypt(config.imapPass);
  }

  const imapConfig: Record<string, string> = {
    host: config.imapHost,
    port: String(config.imapPort),
    user: config.imapUser,
  };
  if (accessToken) imapConfig.accessToken = accessToken;
  if (password) imapConfig.password = password;

  console.log(`[IMAP Poller] Polling ${config.imapUser}...`);

  let totalCreated = 0;
  // Determine candidate folders (INBOX + tenant folders or default agency folders)
  let candidateFolders = ['INBOX', 'Elite', 'Gold', 'Premiere', 'Nell'];
  try {
    const tenantRecord = await prisma.tenant.findUnique({ where: { id: tenantId }, select: { companyInfo: true } });
    if (tenantRecord?.companyInfo) {
      const info = JSON.parse(tenantRecord.companyInfo);
      if (Array.isArray(info.pollFolders) && info.pollFolders.length > 0) {
        candidateFolders = Array.from(new Set(['INBOX', ...info.pollFolders]));
      }
    }
  } catch {}

  // Filter to only folders that actually exist on the mail server to prevent Command Failed errors
  let folders = ['INBOX'];
  try {
    const available = await emailAdapter.getAvailableFolders(imapConfig);
    const availableLower = new Set(available.map((f) => f.toLowerCase()));
    folders = candidateFolders.filter((f) => f.toUpperCase() === 'INBOX' || availableLower.has(f.toLowerCase()));
  } catch {
    folders = ['INBOX'];
  }

  for (const folder of folders) {
    const created = await pollFolder(imapConfig, folder, tenantId, emailConfigId);
    totalCreated += created;
  }

  console.log(`[IMAP Poller] Total: ${totalCreated} new cards created`);

  // Sync read/unread status for existing cards (match by Message-ID, stable across compaction)
  console.log(`[IMAP Poller] Starting status sync for ${folders.length} folders...`);
  for (const folder of folders) {
    try {
      const statusMap = await emailAdapter.syncReadStatus(imapConfig, folder);
      if (statusMap.size === 0) {
        console.log(`[IMAP Poller] Status sync ${folder}: empty map, skipping`);
        continue;
      }

      const cards = await prisma.card.findMany({
        where: { imapFolder: folder },
        select: { id: true, imapUid: true, messageId: true, status: true },
      });
      console.log(`[IMAP Poller] Status sync ${folder}: ${statusMap.size} entries, ${cards.length} cards`);

      let updated = 0;
      let matched = 0;
      for (const card of cards) {
        // Primary: match by Message-ID (stable)
        let status: { isRead: boolean; isReplied: boolean } | undefined;
        if (card.messageId) {
          status = statusMap.get(card.messageId);
        }
        // Fallback: match by UID (may be stale after compaction)
        if (!status && card.imapUid) {
          status = statusMap.get(`uid:${card.imapUid}`);
        }
        if (!status) continue;
        matched++;

        const updateData: any = {};

        // Sync read/unread status
        const newStatus = status.isRead ? 'read' : 'unread';
        if (card.status !== newStatus) {
          updateData.status = newStatus;
        }

        // Sync reply detection — if email has \Answered flag, mark card as highlighted (replied)
        if (status.isReplied) {
          updateData.highlighted = true;
          console.log(`[IMAP Poller] Detected reply for card ${card.messageId} — marking as highlighted`);
        }

        if (Object.keys(updateData).length > 0) {
          await prisma.card.update({ where: { id: card.id }, data: updateData });
          updated++;
        }
      }
      console.log(`[IMAP Poller] Status sync ${folder}: ${matched} matched, ${updated} updated`);
    } catch (err: any) {
      console.error(`[IMAP Poller] Status sync error for ${folder}: ${err.message}`);
    }
  }

  await prisma.emailConfig.update({
    where: { id: config.id },
    data: { lastPolledAt: new Date() },
  });
}
