import Imap from 'node-imap';
import { simpleParser } from 'mailparser';
import nodemailer from 'nodemailer';
import type { ChannelAdapter } from './interface';
import type { InboundMessage, SendParams, SendResult } from '../src/types';

export class EmailAdapter implements ChannelAdapter {
  readonly channel = 'email';

  async pollInbox(config: Record<string, string>): Promise<InboundMessage[]> {
    return new Promise((resolve, reject) => {
      const imap = new Imap({
        user: config.user,
        password: config.password,
        host: config.host,
        port: parseInt(config.port),
        tls: true,
      });

      const messages: InboundMessage[] = [];

      imap.once('ready', () => {
        imap.openBox('INBOX', true, (err, box) => {
          if (err) { imap.end(); return reject(err); }

          // Search for unseen messages
          imap.search(['UNSEEN'], (err, results) => {
            if (err) { imap.end(); return reject(err); }
            if (!results || results.length === 0) { imap.end(); return resolve([]); }

            const fetch = imap.fetch(results, { bodies: '', markSeen: false });

            fetch.on('message', (msg) => {
              let buffer = '';

              msg.on('body', (stream) => {
                stream.on('data', (chunk: Buffer) => { buffer += chunk.toString('utf8'); });
              });

              msg.once('end', async () => {
                try {
                  const parsed = await simpleParser(buffer);
                  messages.push({
                    messageId: parsed.messageId || `msg-${Date.now()}-${Math.random()}`,
                    inReplyTo: parsed.inReplyTo || undefined,
                    fromEmail: (parsed.from?.value[0]?.address) || 'unknown',
                    fromName: parsed.from?.value[0]?.name || undefined,
                    subject: parsed.subject || '(No subject)',
                    bodyText: parsed.text || '',
                    bodyHtml: parsed.html || undefined,
                    receivedAt: parsed.date || new Date(),
                  });
                } catch (e) {
                  // Skip malformed messages
                }
              });
            });

            fetch.once('end', () => {
              imap.end();
              resolve(messages);
            });

            fetch.once('error', (err) => {
              imap.end();
              reject(err);
            });
          });
        });
      });

      imap.once('error', (err) => reject(err));
      imap.connect();
    });
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
    return new Promise((resolve) => {
      const imap = new Imap({
        user: config.user,
        password: config.password,
        host: config.host,
        port: parseInt(config.port),
        tls: true,
      });

      imap.once('ready', () => {
        imap.end();
        resolve({ success: true });
      });

      imap.once('error', (err) => {
        resolve({ success: false, error: err.message });
      });

      imap.connect();
    });
  }
}
