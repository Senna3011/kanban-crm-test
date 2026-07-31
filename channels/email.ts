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
        port: parseInt(config.port, 10),
        tls: parseInt(config.port, 10) === 993,
        autotls: parseInt(config.port, 10) === 143 ? 'always' : 'never',
        connTimeout: 15000,
        authTimeout: 15000,
      });
      const messages: InboundMessage[] = [];
      let settled = false;
      const finish = (error?: Error) => {
        if (settled) return;
        settled = true;
        try { imap.end(); } catch {}
        error ? reject(error) : resolve(messages);
      };

      imap.once('ready', () => {
        imap.openBox('INBOX', false, (err) => {
          if (err) return finish(err);
          imap.search(['UNSEEN'], (searchError, results) => {
            if (searchError) return finish(searchError);
            if (!results?.length) return finish();

            const fetch = imap.fetch(results, { bodies: '', markSeen: true });
            const parsing: Promise<void>[] = [];
            fetch.on('message', (msg) => {
              parsing.push(new Promise<void>((done) => {
                let buffer = '';
                msg.on('body', (stream) => stream.on('data', (chunk: Buffer) => { buffer += chunk.toString('utf8'); }));
                msg.once('end', async () => {
                  try {
                    const parsed = await simpleParser(buffer);
                    const messageId = parsed.messageId?.trim();
                    if (!messageId) return done();
                    messages.push({
                      messageId,
                      inReplyTo: parsed.inReplyTo || undefined,
                      fromEmail: parsed.from?.value[0]?.address || 'unknown',
                      fromName: parsed.from?.value[0]?.name || undefined,
                      toEmail: Array.isArray(parsed.to) ? parsed.to[0]?.value[0]?.address : parsed.to?.value[0]?.address || undefined,
                      subject: parsed.subject || '(No subject)',
                      bodyText: parsed.text || '',
                      bodyHtml: parsed.html || undefined,
                      receivedAt: parsed.date || new Date(),
                    });
                  } catch {}
                  done();
                });
              }));
            });
            fetch.once('error', (fetchError) => finish(fetchError));
            fetch.once('end', async () => {
              await Promise.all(parsing);
              finish();
            });
          });
        });
      });
      imap.once('error', (error) => finish(error));
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
