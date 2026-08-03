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

      for await (const message of imap.fetch({ seen: false }, { source: true, uid: true })) {
        if (!message.source) continue;
        const uid = message.uid;
        if (!uid) continue;

        try {
          const parsed = await simpleParser(message.source);
          const messageId = parsed.messageId?.trim();
          if (!messageId) continue;

          messages.push({
            messageId,
            uid,
            inReplyTo: parsed.inReplyTo || undefined,
            fromEmail: parsed.from?.value[0]?.address || 'unknown',
            fromName: parsed.from?.value[0]?.name || undefined,
            toEmail: Array.isArray(parsed.to) ? parsed.to[0]?.value[0]?.address : parsed.to?.value[0]?.address || undefined,
            subject: parsed.subject || '(No subject)',
            bodyText: parsed.text || '',
            bodyHtml: parsed.html || undefined,
            receivedAt: parsed.date || new Date(),
          });
        } catch {
          // Skip messages that fail to parse
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
