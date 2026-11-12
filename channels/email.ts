import { ImapFlow } from 'imapflow';
import { simpleParser } from 'mailparser';
import nodemailer from 'nodemailer';
import type { ChannelAdapter } from './interface';
import type { InboundMessage, SendParams, SendResult } from '../src/types';
import { sanitizeEmailBody } from '../src/lib/email-cleaner';
import {
  zohoListFolders,
  zohoResolveFolderId,
  zohoFetchMessages,
  zohoFetchOriginalMessage,
  zohoFetchMessageContentAndDetails,
  zohoUpdateMessages,
} from '../src/lib/zoho-oauth';

function isZohoRestOnly(config: Record<string, string>): boolean {
  return Boolean(!config.password && config.accessToken && config.zohoAccountId);
}

function parseAddressString(raw?: string): string[] {
  if (!raw) return [];
  const matches = raw.match(/[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/g);
  return matches ? Array.from(new Set(matches.map((e) => e.toLowerCase().trim()))) : [];
}

function decodeHtmlEntities(str?: string): string {
  if (!str) return '';
  return str
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&amp;/g, '&');
}

function createImapConnection(config: Record<string, string>): ImapFlow {
  const port = parseInt(config.port, 10);
  const authConfig: any = { user: config.user };
  if (config.password) {
    authConfig.pass = config.password;
  } else if (config.accessToken) {
    authConfig.accessToken = config.accessToken;
  }

  const rejectUnauthorized = process.env.NODE_ENV === 'production' && process.env.IMAP_ALLOW_SELF_SIGNED !== 'true';

  return new ImapFlow({
    host: config.host,
    port,
    secure: port === 993,
    auth: authConfig,
    tls: {
      rejectUnauthorized,
    },
    logger: false,
  });
}

function extractRecipientEmails(parsed: any): { primaryTo?: string; deliveredTo?: string; allRecipients: string[] } {
  const recipients = new Set<string>();

  const addAddress = (addr: any) => {
    if (!addr) return;
    if (typeof addr === 'string') {
      const match = addr.match(/[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/);
      if (match) recipients.add(match[0].toLowerCase().trim());
    } else if (addr.address && typeof addr.address === 'string') {
      recipients.add(addr.address.toLowerCase().trim());
    }
  };

  const processAddressField = (field: any) => {
    if (!field) return;
    if (Array.isArray(field)) {
      field.forEach((item) => {
        if (item?.value && Array.isArray(item.value)) item.value.forEach(addAddress);
        else addAddress(item);
      });
    } else if (field.value && Array.isArray(field.value)) {
      field.value.forEach(addAddress);
    } else {
      addAddress(field);
    }
  };

  processAddressField(parsed.to);
  processAddressField(parsed.cc);
  processAddressField(parsed.bcc);

  // Check header aliases (Delivered-To, Zoho Mail proprietary headers, X-Original-To, Envelope-To, etc.)
  const headerKeys = [
    'x-zoho-recipient',
    'x-zoho-mail-delivered-to',
    'x-received-for',
    'delivered-to',
    'x-delivered-to',
    'x-original-to',
    'envelope-to',
    'x-forwarded-to',
    'x-envelope-to',
  ];
  let deliveredTo: string | undefined;

  if (parsed.headers && typeof parsed.headers.get === 'function') {
    for (const key of headerKeys) {
      const val = parsed.headers.get(key);
      if (val) {
        if (typeof val === 'string') {
          addAddress(val);
          if (!deliveredTo) {
            const m = val.match(/[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/);
            if (m) deliveredTo = m[0].toLowerCase().trim();
          }
        } else if (val.text && typeof val.text === 'string') {
          addAddress(val.text);
          if (!deliveredTo) {
            const m = val.text.match(/[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/);
            if (m) deliveredTo = m[0].toLowerCase().trim();
          }
        }
      }
    }
  }

  const toAddress = Array.isArray(parsed.to)
    ? parsed.to[0]?.value[0]?.address?.toLowerCase().trim()
    : parsed.to?.value[0]?.address?.toLowerCase().trim();

  const allRecipients = Array.from(recipients);
  // Prioritize explicit To: address over generic Delivered-To: so alias mailboxes (e.g. elite@, gold@)
  // are preserved as the primary recipient instead of being overwritten by the physical mailbox username
  const primaryTo = toAddress || deliveredTo || (allRecipients.length > 0 ? allRecipients[0] : undefined);

  return { primaryTo, deliveredTo, allRecipients };
}

export interface PollInboxOptions {
  knownMessageIds?: Set<string>;
  knownZohoMessageIds?: Set<string>;
  knownFingerprintMap?: Map<string, Array<{ messageId: string; receivedAtMs: number }>>;
}

export function normalizeMessageFingerprint(fromEmail: string, subject: string): string {
  return `${fromEmail.toLowerCase().trim()}|${subject.replace(/\s+/g, ' ').trim().toLowerCase()}`;
}

async function pollZohoRestInbox(
  config: Record<string, string>,
  folder = 'INBOX',
  options?: PollInboxOptions
): Promise<InboundMessage[]> {
  const accessToken = config.accessToken;
  const accountId = config.zohoAccountId;
  if (!accessToken || !accountId) return [];

  const { folderId } = await zohoResolveFolderId(accessToken, accountId, folder);
  if (!folderId && folder.toUpperCase() !== 'INBOX') {
    return [];
  }
  // If folders API was unauthorized and search in:inbox found nothing (e.g. empty inbox), only try unfiltered on INBOX
  const summaries: any[] = [];
  const cutoffMs = Date.now() - 180 * 24 * 60 * 60 * 1000;

  for (let start = 1; start <= 201; start += 200) {
    const batch = await zohoFetchMessages(accessToken, accountId, {
      folderId: folderId || undefined,
      start,
      limit: 200,
    });
    if (batch.length === 0) break;

    summaries.push(...batch);

    const lastTime = Number(batch[batch.length - 1]?.receivedTime || batch[batch.length - 1]?.sentDateInGMT || 0);
    if (batch.length < 200 || (lastTime > 0 && lastTime < cutoffMs && summaries.length >= 200)) {
      break;
    }
  }

  const messages: InboundMessage[] = [];
  const toFetchFull: any[] = [];

  for (const m of summaries) {
    const zohoMessageId = String(m.messageId || '');
    if (!zohoMessageId) continue;
    const zohoFolderId = String(m.folderId || folderId || '');
    const isRead = String(m.status) === '1';
    const isReplied = String(m.status2) === '1';
    const receivedAtMs = Number(m.receivedTime || m.sentDateInGMT) || Date.now();
    const receivedAt = new Date(receivedAtMs);
    const fromEmail = parseAddressString(decodeHtmlEntities(m.fromAddress || m.sender || ''))[0] || 'unknown';
    const toEmails = parseAddressString(decodeHtmlEntities(m.toAddress || ''));
    const ccEmails = parseAddressString(decodeHtmlEntities(m.ccAddress || ''));
    const allRecip = Array.from(new Set([...toEmails, ...ccEmails]));
    const subject = decodeHtmlEntities(m.subject) || '(No subject)';

    let matchedExistingMsgId = '';
    let isAlreadyKnown = Boolean(options?.knownZohoMessageIds?.has(zohoMessageId));
    if (!isAlreadyKnown && options?.knownFingerprintMap) {
      const fpKey = normalizeMessageFingerprint(fromEmail, subject);
      const candidates = options.knownFingerprintMap.get(fpKey);
      if (candidates) {
        const hit = candidates.find((c) => Math.abs(c.receivedAtMs - receivedAtMs) <= 15 * 60 * 1000);
        if (hit) {
          isAlreadyKnown = true;
          matchedExistingMsgId = hit.messageId;
        }
      }
    }

    if (isAlreadyKnown) {
      messages.push({
        messageId: matchedExistingMsgId,
        zohoMessageId,
        zohoFolderId,
        isRead,
        isReplied,
        skipBody: true,
        fromEmail,
        toEmail: toEmails[0],
        recipientEmails: allRecip,
        subject,
        bodyText: decodeHtmlEntities(m.summary || ''),
        receivedAt,
      });
    } else {
      toFetchFull.push({ m, zohoMessageId, zohoFolderId, isRead, isReplied, receivedAt, fromEmail, toEmails, allRecip, subject });
    }
  }

  // Fetch full RFC822 content only for new/unlinked messages (concurrency = 10)
  const CONCURRENCY = 10;
  for (let i = 0; i < toFetchFull.length; i += CONCURRENCY) {
    const chunk = toFetchFull.slice(i, i + CONCURRENCY);
    const parsedChunk = await Promise.all(
      chunk.map(async (item): Promise<InboundMessage | null> => {
        try {
          const raw = await zohoFetchOriginalMessage(accessToken, accountId, item.zohoMessageId);
          if (raw) {
            const parsed = await simpleParser(raw);
            const messageId = parsed.messageId?.trim() || `<zoho-${item.zohoMessageId}@mail.zoho.com>`;
            const cleanText = sanitizeEmailBody(parsed.text, parsed.html || undefined);
            const { primaryTo, deliveredTo, allRecipients } = extractRecipientEmails(parsed);
            const mergedRecipients = Array.from(new Set([...allRecipients, ...item.allRecip]));
            const toEmail =
              primaryTo ||
              (Array.isArray(parsed.to) ? parsed.to[0]?.value[0]?.address : parsed.to?.value[0]?.address) ||
              item.toEmails[0];

            return {
              messageId,
              zohoMessageId: item.zohoMessageId,
              zohoFolderId: item.zohoFolderId,
              isRead: item.isRead,
              isReplied: item.isReplied,
              inReplyTo: parsed.inReplyTo || undefined,
              fromEmail: parsed.from?.value[0]?.address || item.fromEmail,
              fromName: parsed.from?.value[0]?.name || undefined,
              toEmail,
              recipientEmails: mergedRecipients,
              deliveredTo,
              subject: parsed.subject || item.subject,
              bodyText: cleanText,
              bodyHtml: parsed.html || undefined,
              receivedAt: parsed.date || item.receivedAt,
            };
          }

          // Fallback to /details + /content if /originalmessage is unavailable
          const { html, details } = await zohoFetchMessageContentAndDetails(
            accessToken,
            accountId,
            item.zohoFolderId,
            item.zohoMessageId
          );
          const headerContent = details?.headerContent || {};
          const rawMsgId = headerContent['Message-ID'] || headerContent['Message-Id'] || details?.messageId;
          const messageId = typeof rawMsgId === 'string' && rawMsgId.includes('@')
            ? rawMsgId.trim()
            : `<zoho-${item.zohoMessageId}@mail.zoho.com>`;
          const inReplyTo = typeof headerContent['In-Reply-To'] === 'string' ? headerContent['In-Reply-To'].trim() : undefined;
          const cleanText = sanitizeEmailBody(decodeHtmlEntities(item.m.summary || ''), html);

          return {
            messageId,
            zohoMessageId: item.zohoMessageId,
            zohoFolderId: item.zohoFolderId,
            isRead: item.isRead,
            isReplied: item.isReplied,
            inReplyTo,
            fromEmail: item.fromEmail,
            toEmail: item.toEmails[0],
            recipientEmails: item.allRecip,
            subject: item.subject,
            bodyText: cleanText,
            bodyHtml: html,
            receivedAt: item.receivedAt,
          };
        } catch (err: any) {
          console.log('[Zoho REST] Failed to parse message', item.zohoMessageId, err?.message);
          return null;
        }
      })
    );

    for (const msg of parsedChunk) {
      if (msg) messages.push(msg);
    }
  }

  return messages;
}

export class EmailAdapter implements ChannelAdapter {
  readonly channel = 'email';

  async pollInbox(config: Record<string, string>, folder = 'INBOX', options?: PollInboxOptions): Promise<InboundMessage[]> {
    if (isZohoRestOnly(config)) {
      return pollZohoRestInbox(config, folder, options);
    }

    const imap = createImapConnection(config);
    try {
      await imap.connect();
      await imap.mailboxOpen(folder, { readOnly: false });

      const messages: InboundMessage[] = [];

      // Fetch recent messages in the mailbox (up to last 350 messages or 180 days)
      // to ensure all historical client threads and alias emails are comprehensively synced
      const since = new Date();
      since.setDate(since.getDate() - 180);

      let uids: number[] = [];
      try {
        const searchResult = await imap.search({ since }, { uid: true });
        if (Array.isArray(searchResult) && searchResult.length > 0) {
          uids = searchResult;
        }
      } catch {
        console.log(`[IMAP] Search by date failed, fetching by sequence range in ${folder}`);
        uids = [];
      }

      // If search by date returns fewer than 200 messages or fails, ensure we capture the most recent
      // up to 300 messages via sequence range so no emails in Zoho Inbox (e.g. 203 emails) are missed
      let fetchRange: any;
      let fetchOptions: any;

      const totalExists = imap.mailbox ? imap.mailbox.exists : 0;
      if (uids.length > 0 && uids.length >= Math.min(totalExists, 200)) {
        fetchRange = uids;
        fetchOptions = { uid: true };
      } else {
        const startSeq = Math.max(1, totalExists - 300);
        fetchRange = totalExists > 0 ? `${startSeq}:*` : '1:*';
        fetchOptions = { uid: false };
      }

      if (options?.knownMessageIds && options.knownMessageIds.size > 0) {
        // Fast pass: fetch only envelope + flags + uid to skip downloading bodies of already-known cards
        const newUids: number[] = [];
        for await (const headerMsg of imap.fetch(fetchRange, { envelope: true, uid: true, flags: true }, fetchOptions)) {
          const uid = headerMsg.uid;
          if (!uid) continue;
          const flags = headerMsg.flags instanceof Set ? [...headerMsg.flags] : [];
          const isRead = flags.some((f) => f.endsWith('Seen'));
          const isReplied = flags.some((f) => f.endsWith('Answered'));
          const msgId = headerMsg.envelope?.messageId?.trim();

          if (msgId && options.knownMessageIds.has(msgId)) {
            messages.push({
              messageId: msgId,
              uid,
              isRead,
              isReplied,
              skipBody: true,
              fromEmail: headerMsg.envelope?.from?.[0]?.address || 'unknown',
              subject: headerMsg.envelope?.subject || '(No subject)',
              bodyText: '',
              receivedAt: headerMsg.envelope?.date || new Date(),
            });
          } else {
            newUids.push(uid);
          }
        }

        if (newUids.length === 0) {
          return messages;
        }
        fetchRange = newUids;
        fetchOptions = { uid: true };
      }

      for await (const message of imap.fetch(fetchRange, { source: true, uid: true, flags: true }, fetchOptions)) {
        if (!message.source) continue;
        const uid = message.uid;
        if (!uid) continue;

        try {
          const parsed = await simpleParser(message.source);
          const messageId = parsed.messageId?.trim() || `<uid-${uid}-${folder}@local>`;

          const flags = message.flags instanceof Set ? [...message.flags] : [];
          const isRead = flags.some(f => f.endsWith('Seen'));
          const isReplied = flags.some(f => f.endsWith('Answered'));
          const cleanText = sanitizeEmailBody(parsed.text, parsed.html || undefined);
          const { primaryTo, deliveredTo, allRecipients } = extractRecipientEmails(parsed);
          const toEmail = primaryTo || (Array.isArray(parsed.to) ? parsed.to[0]?.value[0]?.address : parsed.to?.value[0]?.address || undefined);

          messages.push({
            messageId,
            uid,
            isRead,
            isReplied,
            inReplyTo: parsed.inReplyTo || undefined,
            fromEmail: parsed.from?.value[0]?.address || 'unknown',
            fromName: parsed.from?.value[0]?.name || undefined,
            toEmail,
            recipientEmails: allRecipients,
            deliveredTo,
            subject: parsed.subject || '(No subject)',
            bodyText: cleanText,
            bodyHtml: parsed.html || undefined,
            receivedAt: parsed.date || new Date(),
          });
        } catch (e: any) {
          console.log('[IMAP] Failed to parse message:', e?.message || 'unknown error');
        }
      }

      return messages;
    } finally {
      try {
        await imap.logout();
      } catch {}
    }
  }

  async getAvailableFolders(config: Record<string, string>): Promise<string[]> {
    if (isZohoRestOnly(config)) {
      try {
        const { folders, unauthorized } = await zohoListFolders(config.accessToken, config.zohoAccountId);
        if (!unauthorized && folders.length > 0) {
          return folders.map((f) => f.folderName || (f.path || '').replace(/^\/+/, '')).filter(Boolean);
        }
      } catch {}
      return ['INBOX'];
    }

    const imap = createImapConnection(config);
    try {
      await imap.connect();
      const mailboxes = await imap.list();
      return mailboxes.map((m) => m.path);
    } catch {
      return ['INBOX'];
    } finally {
      try {
        await imap.logout();
      } catch {}
    }
  }

  async markAsRead(config: Record<string, string>, uid: number, folder = 'INBOX'): Promise<boolean> {
    if (isZohoRestOnly(config)) return false;
    const imap = createImapConnection(config);
    try {
      await imap.connect();
      await imap.mailboxOpen(folder || 'INBOX', { readOnly: false });
      await imap.messageFlagsAdd({ uid }, ['\\Seen'], { uid: true });
      return true;
    } catch {
      return false;
    } finally {
      await imap.logout();
    }
  }

  async findUidByMessageId(config: Record<string, string>, messageId: string, folder = 'INBOX'): Promise<number | null> {
    if (isZohoRestOnly(config)) return null;
    const imap = createImapConnection(config);
    try {
      await imap.connect();
      await imap.mailboxOpen(folder || 'INBOX', { readOnly: true });
      const results = await imap.search({ header: { 'Message-ID': messageId } });
      if (results && results.length > 0) return results[0];
      return null;
    } catch {
      return null;
    } finally {
      await imap.logout();
    }
  }

  async syncReadStatus(config: Record<string, string>, folder = 'INBOX'): Promise<Map<string, { isRead: boolean; isReplied: boolean }>> {
    const statusMap = new Map<string, { isRead: boolean; isReplied: boolean }>();
    if (isZohoRestOnly(config)) {
      try {
        const { folderId } = await zohoResolveFolderId(config.accessToken, config.zohoAccountId, folder);
        if (!folderId && folder.toUpperCase() !== 'INBOX') return statusMap;
        const list = await zohoFetchMessages(config.accessToken, config.zohoAccountId, {
          folderId: folderId || undefined,
          start: 1,
          limit: 200,
        });
        for (const m of list) {
          if (m.messageId) {
            statusMap.set(`zoho:${m.messageId}`, {
              isRead: String(m.status) === '1',
              isReplied: String(m.status2) === '1',
            });
          }
        }
      } catch {}
      return statusMap;
    }

    const imap = createImapConnection(config);
    try {
      await imap.connect();
      await imap.mailboxOpen(folder, { readOnly: true });
      const since = new Date();
      since.setDate(since.getDate() - 30);

      let uids: number[] = [];
      try {
        const searchResult = await imap.search({ since }, { uid: true });
        if (Array.isArray(searchResult)) {
          uids = searchResult;
        }
      } catch {
        uids = [];
      }

      const fetchRange: any = uids && uids.length > 0 ? uids : '1:*';
      const fetchOptions: any = { uid: uids && uids.length > 0 };

      for await (const message of imap.fetch(fetchRange, { envelope: true, uid: true, flags: true }, fetchOptions)) {
        const uid = message.uid;
        if (!uid) continue;
        const flags = message.flags instanceof Set ? [...message.flags] : [];
        const isRead = flags.some(f => f.endsWith('Seen'));
        const isReplied = flags.some(f => f.endsWith('Answered'));
        const messageId = message.envelope?.messageId?.trim();
        if (messageId) {
          statusMap.set(messageId, { isRead, isReplied });
        }
        statusMap.set(`uid:${uid}`, { isRead, isReplied });
      }
      return statusMap;
    } catch {
      return statusMap;
    } finally {
      try {
        await imap.logout();
      } catch {}
    }
  }

  async moveToFolder(config: Record<string, string>, uid: number, targetFolder: string, sourceFolder = 'INBOX'): Promise<boolean> {
    if (isZohoRestOnly(config)) return false;
    const imap = createImapConnection(config);
    try {
      await imap.connect();
      await imap.mailboxOpen(sourceFolder || 'INBOX', { readOnly: false });

      let destination = targetFolder;
      try {
        const mailboxes = await imap.list();
        if (targetFolder.toLowerCase().includes('trash')) {
          const trashBox = mailboxes.find(m =>
            m.specialUse === '\\Trash' ||
            m.path.toLowerCase().includes('trash') ||
            m.path.includes('Sampah') ||
            m.path.includes('Bin')
          );
          if (trashBox) destination = trashBox.path;
        } else if (targetFolder.toLowerCase().includes('archive')) {
          const archiveBox = mailboxes.find(m =>
            m.specialUse === '\\Archive' ||
            m.path.toLowerCase().includes('archive')
          );
          if (archiveBox) destination = archiveBox.path;
        }
      } catch {
        // use default targetFolder
      }

      try {
        await imap.messageMove({ uid }, destination, { uid: true });
        return true;
      } catch {
        // Fallback: flag message as \Deleted
        await imap.messageFlagsAdd({ uid }, ['\\Deleted'], { uid: true });
        return true;
      }
    } catch {
      return false;
    } finally {
      await imap.logout();
    }
  }

  async sendMessage(params: SendParams, config: Record<string, string>): Promise<SendResult> {
    try {
      const port = parseInt(config.smtpPort);
      const authConfig: any = { user: config.smtpUser };
      if (config.accessToken) {
        authConfig.type = 'OAuth2';
        authConfig.accessToken = config.accessToken;
      } else {
        authConfig.pass = config.smtpPassword;
      }

      const transporter = nodemailer.createTransport({
        host: config.smtpHost,
        port,
        secure: port === 465,
        auth: authConfig,
      });

      const info = await transporter.sendMail({
        from: config.smtpUser,
        to: params.to,
        subject: params.subject,
        text: params.body,
        inReplyTo: params.inReplyTo,
        references: params.references,
      });

      return { success: true, externalId: info.messageId };
    } catch (err: any) {
      return { success: false, error: err.message };
    }
  }

  async testConnection(config: Record<string, string>): Promise<{ success: boolean; error?: string }> {
    const imap = createImapConnection(config);
    try {
      await imap.connect();
      await imap.logout();
      return { success: true };
    } catch (err: any) {
      return { success: false, error: err.message };
    }
  }
}
