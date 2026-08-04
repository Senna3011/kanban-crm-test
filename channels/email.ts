import { ImapFlow } from 'imapflow';
import { simpleParser } from 'mailparser';
import nodemailer from 'nodemailer';
import type { ChannelAdapter } from './interface';
import type { InboundMessage, SendParams, SendResult } from '../src/types';

function createImapConnection(config: Record<string, string>): ImapFlow {
  const port = parseInt(config.port, 10);
  return new ImapFlow({
    host: config.host,
    port,
    secure: port === 993,
    auth: {
      user: config.user,
      pass: config.password,
    },
    tls: {
      rejectUnauthorized: false,
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

  async markAsRead(config: Record<string, string>, uid: number): Promise<boolean> {
    const imap = createImapConnection(config);
    try {
      await imap.connect();
      await imap.mailboxOpen('INBOX', { readOnly: false });
      await imap.messageFlagsAdd({ uid }, ['\\Seen'], { uid: true });
      return true;
    } catch {
      return false;
    } finally {
      await imap.logout();
    }
  }

  async findUidByMessageId(config: Record<string, string>, messageId: string): Promise<number | null> {
    const imap = createImapConnection(config);
    try {
      await imap.connect();
      await imap.mailboxOpen('INBOX', { readOnly: true });
      const results = await imap.search({ header: { 'Message-ID': messageId } });
      if (results && results.length > 0) return results[0];
      return null;
    } catch {
      return null;
    } finally {
      await imap.logout();
    }
  }

  async syncReadStatus(config: Record<string, string>, folder = 'INBOX'): Promise<Map<string, boolean>> {
    const statusMap = new Map<string, boolean>();
    const imap = createImapConnection(config);
    try {
      await imap.connect();
      await imap.mailboxOpen(folder, { readOnly: true });
      const since = new Date();
      since.setDate(since.getDate() - 30);
      // Fetch source + flags so we can match by Message-ID (stable across compaction)
      for await (const message of imap.fetch({ since }, { source: true, uid: true, flags: true })) {
        if (!message.source) continue;
        const uid = message.uid;
        if (!uid) continue;
        const isRead = message.flags instanceof Set && [...message.flags].some(f => f.endsWith('Seen'));
        try {
          const { simpleParser } = await import('mailparser');
          const parsed = await simpleParser(message.source);
          const messageId = parsed.messageId?.trim();
          if (messageId) {
            statusMap.set(messageId, isRead);
          }
          // Also map by UID for backward compatibility
          statusMap.set(`uid:${uid}`, isRead);
        } catch {
          // Fallback: UID-only mapping
          statusMap.set(`uid:${uid}`, isRead);
        }
      }
      return statusMap;
    } catch {
      return statusMap;
    } finally {
      await imap.logout();
    }
  }

  async moveToFolder(config: Record<string, string>, uid: number, targetFolder: string): Promise<boolean> {
    const imap = createImapConnection(config);
    try {
      await imap.connect();
      await imap.mailboxOpen('INBOX', { readOnly: false });
      await imap.messageMove({ uid }, targetFolder, { uid: true });
      return true;
    } catch {
      return false;
    } finally {
      await imap.logout();
    }
  }

  async sendMessage(params: SendParams, config: Record<string, string>): Promise<SendResult> {
    try {
      const transporter = nodemailer.createTransport({
        host: config.smtpHost,
        port: parseInt(config.smtpPort),
        secure: parseInt(config.smtpPort) === 465,
        auth: { user: config.smtpUser, pass: config.smtpPassword },
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
