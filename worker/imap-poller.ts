import prisma from '../src/lib/prisma';
import { decrypt } from '../src/lib/encryption';
import { getValidZohoAccessToken } from '../src/lib/zoho-oauth';
import { EmailAdapter } from '../channels/email';
import { aiProcessQueue } from '../queue';
import { convertOutreachLeadToKanbanCard } from '../src/lib/outreach-dispatcher';

const emailAdapter = new EmailAdapter();

function isDeliveryFailureEmail(fromEmail: string, subject: string): boolean {
  const cleanFrom = fromEmail.toLowerCase();
  const cleanSubj = subject.toLowerCase();

  const isBounceSender = (
    cleanFrom.includes('mailer-daemon') ||
    cleanFrom.includes('postmaster') ||
    cleanFrom.includes('mail-delivery') ||
    (cleanFrom.includes('noreply') && cleanSubj.includes('undelivered')) ||
    cleanFrom.includes('bounce')
  );

  const isBounceSubject = (
    cleanSubj.includes('delivery status notification') ||
    cleanSubj.includes('undelivered mail') ||
    cleanSubj.includes('mail delivery failed') ||
    cleanSubj.includes('failure notice') ||
    cleanSubj.includes('returned mail') ||
    cleanSubj.includes('delivery failure') ||
    cleanSubj.includes('address not found') ||
    cleanSubj.includes('message not delivered')
  );

  return isBounceSender || isBounceSubject;
}

function extractBouncedEmail(bodyText: string): string | null {
  if (!bodyText) return null;
  const patterns = [
    /(?:to|recipient|final-recipient|for <|was not delivered to|failed recipient:?)\s*:?\s*(?:rfc822;)?\s*<?([a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,})>?/i,
    /<([a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,})>\s*:\s*(?:550|551|552|553|554|Host or domain name not found|User unknown|Recipient address rejected|No such user)/i,
    /Your message to ([a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}) couldn't be delivered/i,
  ];

  for (const regex of patterns) {
    const match = bodyText.match(regex);
    if (match && match[1]) {
      return match[1].toLowerCase().trim();
    }
  }

  const emails = bodyText.match(/[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/g);
  if (emails && emails.length > 0) {
    const filtered = emails.filter(e => {
      const lower = e.toLowerCase();
      return !lower.includes('mailer-daemon') && !lower.includes('postmaster') && !lower.includes('google.com') && !lower.includes('zoho.com');
    });
    if (filtered.length > 0) return filtered[0].toLowerCase().trim();
  }

  return null;
}

// Dynamic folder to board resolution with optional fallback mapping
const DEFAULT_FOLDER_MAPPING: Record<string, string> = {
  'INBOX': 'JetDigitaPro',
  'Elite': 'Elite Team',
  'Gold': 'Gold Team',
  'Premiere': 'Premiere Team',
  'Nell': 'Nell VH',
};

// Generic tokens to exclude when extracting distinctive team keywords
const GENERIC_PREFIX_TOKENS = new Set([
  'jdp', 'team', 'mail', 'inbox', 'group', 'crm', 'admin', 'info', 'contact', 'office', 'help', 'no-reply', 'noreply'
]);

function extractTeamKeyword(email: string): { keyword?: string; autoTitle?: string; isTeamAlias: boolean } {
  if (!email || !email.includes('@')) return { isTeamAlias: false };
  const prefix = email.split('@')[0].toLowerCase().trim();
  const tokens = prefix.split(/[-_.]+/).filter(Boolean);

  const isTeam = tokens.includes('team') || prefix.startsWith('jdp-') || prefix.includes('group');
  const meaningfulTokens = tokens.filter((t) => !GENERIC_PREFIX_TOKENS.has(t));

  const keyword = meaningfulTokens[0];
  let autoTitle: string | undefined;

  if (meaningfulTokens.length > 0) {
    const capitalized = meaningfulTokens.map((t) => t.charAt(0).toUpperCase() + t.slice(1)).join(' ');
    autoTitle = isTeam ? `${capitalized} Team` : capitalized;
  } else if (isTeam) {
    autoTitle = 'Team Mailbox';
  }

  return { keyword, autoTitle, isTeamAlias: isTeam || Boolean(keyword) };
}

async function resolveBoard(
  tenantId: string,
  emailConfigId?: string,
  toEmail?: string,
  folder?: string,
  candidateRecipients: string[] = []
) {
  // 1. Gather all candidate recipient emails (to, deliveredTo, cc, etc.)
  const allRecipients = Array.from(
    new Set([toEmail, ...candidateRecipients].filter(Boolean).map((e) => e!.toLowerCase().trim()))
  );

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

  // Fetch all existing boards in this tenant
  const tenantBoards = await prisma.board.findMany({ where: { tenantId } });

  // 1. PRIORITY 1: Explicit EmailConfig board link configured in Settings
  if (emailConfigId) {
    const config = await prisma.emailConfig.findUnique({
      where: { id: emailConfigId },
      include: { board: true },
    });
    if (config?.board) return config.board;
  }

  // 2. PRIORITY 2: Check if any candidate recipient matches explicit routing or board title
  for (const recipient of allRecipients) {
    // 2a. Explicit routing in companyInfo
    if (routing[recipient]) {
      const match = tenantBoards.find((b) => b.title.toLowerCase() === routing[recipient].toLowerCase());
      if (match) return match;
    }

    // 2b. Exact board title match with email or prefix
    const prefix = recipient.split('@')[0];
    const exactMatch = tenantBoards.find(
      (b) =>
        b.title.toLowerCase() === recipient ||
        b.title.toLowerCase() === prefix ||
        b.title.toLowerCase() === prefix.replace(/[-_.]+/g, ' ')
    );
    if (exactMatch) return exactMatch;
  }

  // 3. PRIORITY 3: Folder-based routing
  if (folder && folder.toUpperCase() !== 'INBOX') {
    if (folderRouting[folder]) {
      const match = tenantBoards.find((b) => b.title.toLowerCase() === folderRouting[folder].toLowerCase());
      if (match) return match;
    }

    const folderMatch = tenantBoards.find(
      (b) => b.title.toLowerCase() === folder.toLowerCase() || b.title.toLowerCase().includes(folder.toLowerCase())
    );
    if (folderMatch) return folderMatch;

    if (DEFAULT_FOLDER_MAPPING[folder]) {
      const defaultMatch = tenantBoards.find(
        (b) => b.title.toLowerCase() === DEFAULT_FOLDER_MAPPING[folder].toLowerCase()
      );
      if (defaultMatch) return defaultMatch;
    }
  }

  // 4. PRIORITY 4: Fallback to Main Board or first board in tenant (NEVER auto-create boards)
  const mainBoard = tenantBoards.find((b) => b.title.toLowerCase() === 'main board');
  if (mainBoard) return mainBoard;
  return tenantBoards[0] || (await prisma.board.findFirst({ where: { tenantId } }));
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
      const existingCard = await prisma.card.findFirst({
        where: { tenantId, messageId: msg.messageId },
        select: { id: true, status: true, imapUid: true },
      });
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

      // Skip outbound emails if sender is the configured mailbox user or any active internal sender/alias
      const senderEmail = msg.fromEmail?.toLowerCase().trim() || '';
      const configUser = imapConfig.user?.toLowerCase().trim() || '';
      if (configUser && senderEmail === configUser) {
        console.log(`[IMAP Poller] Skipping outbound email: ${msg.subject} (from ${msg.fromEmail})`);
        continue;
      }
      if (senderEmail) {
        const isInternalSender = await prisma.emailConfig.findFirst({
          where: {
            tenantId,
            isActive: true,
            OR: [
              { imapUser: { equals: senderEmail, mode: 'insensitive' } },
              { smtpUser: { equals: senderEmail, mode: 'insensitive' } },
            ],
          },
          select: { id: true },
        });
        if (isInternalSender) {
          console.log(`[IMAP Poller] Skipping internal/outbound message: ${msg.subject} (from ${senderEmail})`);
          continue;
        }
      }

      // 1. Check for Bounce / Delivery Status Notification (DSN / NDR)
      if (isDeliveryFailureEmail(senderEmail, msg.subject)) {
        const bouncedEmail = extractBouncedEmail(msg.bodyText || '');
        console.log(`[IMAP Poller] Bounce / DSN detected in ${folder}: "${msg.subject}". Extracted recipient: ${bouncedEmail || 'none'}`);

        if (bouncedEmail) {
          // Add to tenant suppression list
          await prisma.outreachSuppression.upsert({
            where: { tenantId_email: { tenantId, email: bouncedEmail } },
            update: { reason: 'HARD_BOUNCE' },
            create: { tenantId, email: bouncedEmail, reason: 'HARD_BOUNCE' },
          });

          // Mark matching OutreachLead as BOUNCED
          const updatedLeads = await prisma.outreachLead.updateMany({
            where: {
              campaign: { tenantId },
              email: { equals: bouncedEmail, mode: 'insensitive' },
              status: { in: ['DISPATCHED', 'APPROVED'] },
            },
            data: {
              status: 'BOUNCED',
              errorMessage: `Undelivered bounce: ${msg.subject.slice(0, 100)}`,
            },
          });

          console.log(`[IMAP Poller] Processed bounce for ${bouncedEmail}: ${updatedLeads.count} lead(s) marked BOUNCED & added to suppression.`);

          // Increase consecutive bounces ONLY on the outreach account that dispatched to this lead
          const bouncedLead = await prisma.outreachLead.findFirst({
            where: {
              campaign: { tenantId },
              email: { equals: bouncedEmail, mode: 'insensitive' },
            },
            include: { campaign: { select: { accountId: true } } },
            orderBy: { updatedAt: 'desc' },
          });
          const targetAccountId = bouncedLead?.campaign?.accountId;
          if (targetAccountId) {
            const acc = await prisma.outreachAccountConfig.findUnique({
              where: { id: targetAccountId },
            });
            if (acc && acc.isActive) {
              const nextBounces = acc.consecutiveBounces + 1;
              const healthStatus = nextBounces >= 5 ? 'PAUSED_BOUNCE' : (nextBounces >= 3 ? 'WARNING' : acc.healthStatus);
              await prisma.outreachAccountConfig.update({
                where: { id: acc.id },
                data: {
                  consecutiveBounces: nextBounces,
                  healthStatus,
                },
              });
              if (healthStatus === 'PAUSED_BOUNCE') {
                console.warn(`[IMAP Poller] Mailbox ${acc.senderEmail} PAUSED due to high bounce threshold (5)!`);
              }
            }
          }
        }
        continue; // Do not create a card in general column for system bounce emails
      }

      // Outreach Auto Reply Detection: Check if sender is an outreach lead waiting for response
      if (senderEmail) {
        try {
          const outreachLead = await prisma.outreachLead.findFirst({
            where: {
              campaign: { tenantId },
              email: { equals: senderEmail, mode: 'insensitive' },
              status: { in: ['DISPATCHED', 'APPROVED'] },
            },
            include: { campaign: true },
          });

          if (outreachLead) {
            console.log(`[IMAP Poller] Outreach reply matched: "${msg.fromEmail}" for campaign "${outreachLead.campaign.name}"`);
            await prisma.outreachLead.update({
              where: { id: outreachLead.id },
              data: {
                status: 'REPLIED',
                repliedAt: new Date(),
              },
            });
            const convertResult = await convertOutreachLeadToKanbanCard({
              leadId: outreachLead.id,
              tenantId,
              replySubject: msg.subject,
              replyBody: msg.bodyText,
            });
            console.log(`[IMAP Poller] Auto-converted outreach lead to Kanban card: ${convertResult.cardId}`);
            created++;
            continue; // Prevent creating duplicate General card below
          }
        } catch (outreachErr: any) {
          console.warn('[IMAP Poller] Outreach reply detection check error:', outreachErr?.message);
        }
      }

      // Skip reply emails — if this is a reply to an existing thread, don't create new card
      // The reply will be picked up by reply detection (highlighted) on the original card
      if (msg.inReplyTo) {
        const parentCard = await prisma.card.findFirst({ where: { messageId: msg.inReplyTo, tenantId } });
        if (parentCard) {
          // Check if this reply message has already been processed to prevent infinite duplicate activity logs
          const alreadyLogged = msg.messageId
            ? await prisma.activityLog.findFirst({
                where: {
                  cardId: parentCard.id,
                  type: 'email_reply_received',
                  content: { path: ['messageId'], equals: msg.messageId },
                },
              })
            : null;

          if (!alreadyLogged) {
            // Mark parent card as replied (highlighted)
            await prisma.card.update({ where: { id: parentCard.id }, data: { highlighted: true, lastActivityAt: new Date() } });
            await prisma.activityLog.create({
              data: {
                type: 'email_reply_received',
                content: {
                  messageId: msg.messageId,
                  subject: msg.subject,
                  from: msg.fromEmail,
                  replyTo: msg.inReplyTo,
                  bodyText: msg.bodyText,
                  bodyHtml: msg.bodyHtml,
                },
                cardId: parentCard.id,
                tenantId,
              },
            });
            console.log(`[IMAP Poller] Reply detected: "${msg.subject}" → parent card ${parentCard.id} marked as highlighted with message content`);
          }
          continue;
        }
        // If parent not found, might be a new thread — allow creation
        console.log(`[IMAP Poller] Reply to unknown message ${msg.inReplyTo}, creating new card`);
      }

      const board = await resolveBoard(tenantId, emailConfigId, msg.toEmail, folder, msg.recipientEmails);
      if (!board) continue;

      let targetColumn = await prisma.column.findFirst({ where: { boardId: board.id, title: 'General' } });
      if (!targetColumn) {
        targetColumn = await prisma.column.findFirst({
          where: { boardId: board.id },
          orderBy: { position: 'asc' },
        });
      }
      if (!targetColumn) {
        console.warn(`[IMAP Poller] No column available on board ${board.id} to place inbound email`);
        continue;
      }

      try {
        const cardMetadata: any = {};
        if (msg.toEmail) cardMetadata.toEmail = msg.toEmail;
        if (msg.deliveredTo) cardMetadata.deliveredTo = msg.deliveredTo;
        if (msg.recipientEmails && msg.recipientEmails.length > 0) cardMetadata.recipientEmails = msg.recipientEmails;

        const card = await prisma.card.create({
          data: {
            subject: msg.subject, fromEmail: msg.fromEmail, fromName: msg.fromName,
            bodyText: msg.bodyText, bodyHtml: msg.bodyHtml,
            messageId: msg.messageId, inReplyTo: msg.inReplyTo || null,
            imapUid: msg.uid || null, imapFolder: folder,
            status: msg.isRead ? 'read' : 'unread',
            channel: 'email', columnId: targetColumn.id, tenantId, emailConfigId: emailConfigId,
            lastActivityAt: msg.receivedAt || new Date(),
            metadata: Object.keys(cardMetadata).length > 0 ? cardMetadata : undefined,
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
          const existing = await prisma.card.findFirst({ where: { tenantId, messageId: msg.messageId } });
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

const activePollLocks = new Set<string>();
const folderListCache = new Map<string, { folders: string[]; expiresAt: number }>();
const FOLDER_CACHE_TTL_MS = 60 * 60 * 1000; // 1 hour

export async function processEmailPoll(data: { tenantId: string; emailConfigId: string }) {
  const { tenantId, emailConfigId } = data;

  if (activePollLocks.has(emailConfigId)) {
    console.log(`[IMAP Poller] Polling already in progress for config ${emailConfigId}, skipping concurrent duplicate poll.`);
    return 0;
  }
  activePollLocks.add(emailConfigId);

  try {
    const config = await prisma.emailConfig.findUnique({ where: { id: emailConfigId } });
    if (!config || !config.isActive || config.tenantId !== tenantId) return 0;

    // For Zoho OAuth2, only poll primary account mailbox (Send-Mail-As aliases are incoming-routed via the primary mailbox)
    if (config.authType === 'oauth2' && !config.name?.startsWith('Zoho (')) {
      console.log(`[IMAP Poller] Skipping separate IMAP poll for alias "${config.name}" (managed via primary Zoho mailbox).`);
      return 0;
    }

    let accessToken: string | undefined;
    let password = '';
    if (config.authType === 'oauth2') {
      try {
        accessToken = await getValidZohoAccessToken(config.id);
      } catch (err: any) {
        console.error(`[IMAP Poller] Failed to get valid OAuth token for ${config.imapUser}: ${err.message}`);
        return 0;
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
    // Determine candidate folders: For Zoho defaults to agency folders, for standard Gmail/IMAP defaults to INBOX
    const isZohoHost = config.imapHost?.toLowerCase().includes('zoho');
    let candidateFolders = isZohoHost ? ['INBOX', 'Elite', 'Gold', 'Premiere', 'Nell'] : ['INBOX'];
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
    // Cache folder listing for 1 hour to prevent redundant IMAP LIST calls every 2 minutes
    let folders = ['INBOX'];
    try {
      const cacheKey = `${config.imapHost}:${config.imapPort}:${config.imapUser}`;
      const now = Date.now();
      let available: string[] = [];

      const cached = folderListCache.get(cacheKey);
      if (cached && cached.expiresAt > now) {
        available = cached.folders;
      } else {
        available = await emailAdapter.getAvailableFolders(imapConfig);
        folderListCache.set(cacheKey, {
          folders: available,
          expiresAt: now + FOLDER_CACHE_TTL_MS,
        });
      }

      const availableLower = new Set(available.map((f) => f.toLowerCase()));
      folders = candidateFolders.filter((f) => f.toUpperCase() === 'INBOX' || availableLower.has(f.toLowerCase()));
    } catch {
      folders = ['INBOX'];
    }

    for (const folder of folders) {
      const created = await pollFolder(imapConfig, folder, tenantId, emailConfigId);
      totalCreated += created;
    }

    console.log(`[IMAP Poller] Total: ${totalCreated} new cards created for ${config.imapUser}`);

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

    return totalCreated;
  } finally {
    activePollLocks.delete(emailConfigId);
  }
}
