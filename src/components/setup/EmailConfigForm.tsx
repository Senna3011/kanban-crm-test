'use client';

import { useState } from 'react';
import Input from '@/components/ui/Input';
import Button from '@/components/ui/Button';
import { saveEmailConfig, testImapConnection, testSmtpConnection } from '@/server/actions/email-config';
import toast from 'react-hot-toast';

type EmailValues = {
  imapHost: string;
  imapPort: number;
  imapUser: string;
  imapPass: string;
  smtpHost: string;
  smtpPort: number;
  smtpUser: string;
  smtpPass: string;
};

const defaults: EmailValues = {
  imapHost: 'imap.zoho.com', imapPort: 993, imapUser: '', imapPass: '',
  smtpHost: 'smtp.zoho.com', smtpPort: 465, smtpUser: '', smtpPass: '',
};

export default function EmailConfigForm({ initial }: { initial?: Partial<EmailValues> }) {
  const [form, setForm] = useState<EmailValues>({ ...defaults, ...initial, imapPass: '', smtpPass: '' });
  const [hasSavedPasswords] = useState(Boolean(initial?.imapUser));
  const [testing, setTesting] = useState<'imap' | 'smtp' | 'all' | null>(null);
  const [saving, setSaving] = useState(false);
  const [status, setStatus] = useState<{ imap?: string; smtp?: string }>({});

  async function handleTest(kind: 'imap' | 'smtp' | 'all') {
    setTesting(kind);
    setStatus({});
    try {
      if (kind === 'imap' || kind === 'all') {
        const result = await testImapConnection({ host: form.imapHost, port: form.imapPort, user: form.imapUser, pass: form.imapPass });
        if (!result.success) { setStatus({ imap: result.error || 'IMAP connection failed.' }); toast.error(`IMAP: ${result.error}`); return; }
        setStatus((current) => ({ ...current, imap: 'Connected' }));
      }
      if (kind === 'smtp' || kind === 'all') {
        const result = await testSmtpConnection({ host: form.smtpHost, port: form.smtpPort, user: form.smtpUser, pass: form.smtpPass });
        if (!result.success) { setStatus((current) => ({ ...current, smtp: result.error || 'SMTP connection failed.' })); toast.error(`SMTP: ${result.error}`); return; }
        setStatus((current) => ({ ...current, smtp: 'Connected' }));
      }
      toast.success(kind === 'all' ? 'IMAP and SMTP connections work.' : `${kind.toUpperCase()} connection works.`);
    } catch (error: any) {
      toast.error(error?.message || 'Connection test failed.');
    } finally { setTesting(null); }
  }

  async function handleSave() {
    setSaving(true);
    try {
      await saveEmailConfig(form);
      toast.success('Email configuration saved.');
    } catch (error: any) {
      toast.error(error?.message || 'Could not save email configuration.');
    } finally { setSaving(false); }
  }

  const updateField = (field: keyof EmailValues, value: string | number) => setForm((prev) => ({ ...prev, [field]: value }));
  const passwordHint = hasSavedPasswords ? 'Leave blank to keep the saved password.' : 'Required for the first setup.';

  return (
    <div className="space-y-6 max-w-2xl">
      <div><h2 className="text-xl font-semibold">Email Configuration</h2><p className="text-gray-500 mt-1">Connect your inbox to start processing leads.</p></div>
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <Input id="imap-host" label="IMAP Host" value={form.imapHost} onChange={(e) => updateField('imapHost', e.target.value)} required />
        <Input id="imap-port" label="IMAP Port" type="number" value={form.imapPort} onChange={(e) => updateField('imapPort', Number(e.target.value))} required />
        <Input id="imap-user" label="IMAP Username" value={form.imapUser} onChange={(e) => updateField('imapUser', e.target.value)} required />
        <div><Input id="imap-pass" label="IMAP Password" type="password" value={form.imapPass} onChange={(e) => updateField('imapPass', e.target.value)} required={!hasSavedPasswords} /><p className="text-xs text-gray-500 mt-1">{passwordHint}</p></div>
      </div>
      {status.imap && <p className="text-sm text-green-700">IMAP: {status.imap}</p>}
      <hr className="border-gray-200" />
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <Input id="smtp-host" label="SMTP Host" value={form.smtpHost} onChange={(e) => updateField('smtpHost', e.target.value)} required />
        <Input id="smtp-port" label="SMTP Port" type="number" value={form.smtpPort} onChange={(e) => updateField('smtpPort', Number(e.target.value))} required />
        <Input id="smtp-user" label="SMTP Username" value={form.smtpUser} onChange={(e) => updateField('smtpUser', e.target.value)} required />
        <div><Input id="smtp-pass" label="SMTP Password" type="password" value={form.smtpPass} onChange={(e) => updateField('smtpPass', e.target.value)} required={!hasSavedPasswords} /><p className="text-xs text-gray-500 mt-1">{passwordHint}</p></div>
      </div>
      {status.smtp && <p className="text-sm text-green-700">SMTP: {status.smtp}</p>}
      <div className="flex flex-wrap gap-3">
        <Button variant="secondary" onClick={() => handleTest('imap')} loading={testing === 'imap'} disabled={Boolean(testing)}>Test IMAP</Button>
        <Button variant="secondary" onClick={() => handleTest('smtp')} loading={testing === 'smtp'} disabled={Boolean(testing)}>Test SMTP</Button>
        <Button variant="secondary" onClick={() => handleTest('all')} loading={testing === 'all'} disabled={Boolean(testing)}>Test All</Button>
        <Button onClick={handleSave} loading={saving} disabled={Boolean(testing)}>Save Configuration</Button>
      </div>
    </div>
  );
}
