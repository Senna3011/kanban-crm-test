import test from 'node:test';
import assert from 'node:assert/strict';
import { validateEmailConfigInput } from './email-config-validation';

test('rejects incomplete email configuration', () => {
  const result = validateEmailConfigInput({
    imapHost: '', imapPort: 993, imapUser: '', imapPass: '',
    smtpHost: 'mail.pesat.ai', smtpPort: 465, smtpUser: 'user@example.com', smtpPass: '',
  }, false);

  assert.equal(result.ok, false);
  assert.match(result.errors.join(' '), /IMAP host/i);
  assert.match(result.errors.join(' '), /IMAP username/i);
  assert.match(result.errors.join(' '), /IMAP password/i);
});

test('accepts mail.pesat.ai settings on initial setup', () => {
  const result = validateEmailConfigInput({
    imapHost: 'mail.pesat.ai', imapPort: 993, imapUser: 'user@example.com', imapPass: 'secret',
    smtpHost: 'mail.pesat.ai', smtpPort: 465, smtpUser: 'user@example.com', smtpPass: 'secret',
  }, false);

  assert.deepEqual(result, { ok: true, errors: [] });
});

test('allows blank passwords when editing an existing config', () => {
  const result = validateEmailConfigInput({
    imapHost: 'mail.pesat.ai', imapPort: 993, imapUser: 'user@example.com', imapPass: '',
    smtpHost: 'mail.pesat.ai', smtpPort: 587, smtpUser: 'user@example.com', smtpPass: '',
  }, true);

  assert.deepEqual(result, { ok: true, errors: [] });
});

test('rejects invalid ports and hostnames', () => {
  const result = validateEmailConfigInput({
    imapHost: 'not a host', imapPort: 0, imapUser: 'u', imapPass: 'p',
    smtpHost: 'mail.pesat.ai', smtpPort: 70000, smtpUser: 'u', smtpPass: 'p',
  }, false);

  assert.equal(result.ok, false);
  assert.match(result.errors.join(' '), /IMAP port/i);
  assert.match(result.errors.join(' '), /SMTP port/i);
  assert.match(result.errors.join(' '), /host/i);
});
