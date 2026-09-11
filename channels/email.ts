import { ImapFlow } from 'imapflow';
import { simpleParser } from 'mailparser';
import nodemailer from 'nodemailer';
import type { ChannelAdapter } from './interface';
import type { InboundMessage, SendParams, SendResult } from '../src/types';

function createImapConnection(config: Record<string, string>): ImapFlow {
  const port = parseInt(config.port, 10);
  const authConfig: any = { user: config.user };
  if (config.accessToken) {
    authConfig.accessToken = config.accessToken;
  } else {
    authConfig.pass = config.password;
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

export class EmailAdapter implements ChannelAdapter {
  readonly channel = 'email';

  async pollInbox(config: Record<string, string>, folder = 'INBOX'): Promise<InboundMessage[]> {
    const imap = createImapConnection(config);
    try {
      await imap.connect();
      await imap.mailboxOpen(folder, { readOnly: false });

      const messages: InboundMessage[] = [];

      // Fetch all recent messages (not just unseen) to catch team emails
      const since = new Date();
      since.setDate(since.getDate() - 30);
      for await (const message of imap.fetch({ since }, { source: true, uid: true, flags: true })) {
        if (!message.source) { console.log('[IMAP] Skipping message with no source'); continue; }
        const uid = message.uid;
        if (!uid) { console.log('[IMAP] Skipping message with no uid'); continue; }

        try {
          const parsed = await simpleParser(message.source);
          const messageId = parsed.messageId?.trim();
          if (!messageId) { console.log('[IMAP] Skipping message with no messageId, subject:', parsed.subject); continue; }

          const isRead = message.flags instanceof Set && [...message.flags].some(f => f.endsWith('Seen'));

          messages.push({
            messageId,
            uid,
            isRead,
            inReplyTo: parsed.inReplyTo || undefined,
            fromEmail: parsed.from?.value[0]?.address || 'unknown',
            fromName: parsed.from?.value[0]?.name || undefined,
            toEmail: Array.isArray(parsed.to) ? parsed.to[0]?.value[0]?.address : parsed.to?.value[0]?.address || undefined,
            subject: parsed.subject || '(No subject)',
            bodyText: parsed.text || '',
            bodyHtml: parsed.html || undefined,
            receivedAt: parsed.date || new Date(),
          });
        } catch (e: any) {
          console.log('[IMAP] Failed to parse message:', e?.message || 'unknown error');
        }
      }

      return messages;
    } finally {
      await imap.logout();
    }
  }

  async getAvailableFolders(config: Record<string, string>): Promise<string[]> {
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
    const imap = createImapConnection(config);
    try {
      await imap.connect();
      await imap.mailboxOpen(folder, { readOnly: true });
      const since = new Date();
      since.setDate(since.getDate() - 30);
      for await (const message of imap.fetch({ since }, { source: true, uid: true, flags: true })) {
        if (!message.source) continue;
        const uid = message.uid;
        if (!uid) continue;
        const flags = message.flags instanceof Set ? [...message.flags] : [];
        const isRead = flags.some(f => f.endsWith('Seen'));
        const isReplied = flags.some(f => f.endsWith('Answered'));
        try {
          const { simpleParser } = await import('mailparser');
          const parsed = await simpleParser(message.source);
          const messageId = parsed.messageId?.trim();
          if (messageId) {
            statusMap.set(messageId, { isRead, isReplied });
          }
          statusMap.set(`uid:${uid}`, { isRead, isReplied });
        } catch {
          statusMap.set(`uid:${uid}`, { isRead, isReplied });
        }
      }
      return statusMap;
    } catch {
      return statusMap;
    } finally {
      await imap.logout();
    }
  }

  async moveToFolder(config: Record<string, string>, uid: number, targetFolder: string, sourceFolder = 'INBOX'): Promise<boolean> {
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
