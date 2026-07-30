'use client';

import { useState } from 'react';
import Input from '@/components/ui/Input';
import Button from '@/components/ui/Button';
import { saveEmailConfig, testImapConnection, testSmtpConnection } from '@/server/actions/email-config';
import toast from 'react-hot-toast';

export default function EmailConfigForm() {
  const [form, setForm] = useState({
    imapHost: 'imap.zoho.com',
    imapPort: 993,
    imapUser: '',
    imapPass: '',
    smtpHost: 'smtp.zoho.com',
    smtpPort: 465,
    smtpUser: '',
    smtpPass: '',
  });
  const [testing, setTesting] = useState(false);
  const [saving, setSaving] = useState(false);

  async function handleTest() {
    setTesting(true);
    try {
      const imap = await testImapConnection({ host: form.imapHost, port: form.imapPort, user: form.imapUser, pass: form.imapPass });
      if (!imap.success) { toast.error(`IMAP: ${imap.error}`); return; }
      const smtp = await testSmtpConnection({ host: form.smtpHost, port: form.smtpPort, user: form.smtpUser, pass: form.smtpPass });
      if (!smtp.success) { toast.error(`SMTP: ${smtp.error}`); return; }
      toast.success('Connections work!');
    } finally {
      setTesting(false);
    }
  }

  async function handleSave() {
    setSaving(true);
    try {
      await saveEmailConfig(form);
      toast.success('Email config saved!');
    } catch (e: any) {
      toast.error(e.message);
    } finally {
      setSaving(false);
    }
  }

  const updateField = (field: string, value: string | number) =>
    setForm((prev) => ({ ...prev, [field]: value }));

  return (
    <div className="space-y-6 max-w-lg">
      <div>
        <h2 className="text-xl font-semibold">Email Configuration</h2>
        <p className="text-gray-500 mt-1">Connect your inbox to start processing leads</p>
      </div>

      <div className="grid grid-cols-2 gap-4">
        <Input label="IMAP Host" value={form.imapHost} onChange={(e) => updateField('imapHost', e.target.value)} />
        <Input label="Port" type="number" value={form.imapPort} onChange={(e) => updateField('imapPort', Number(e.target.value))} />
      </div>
      <div className="grid grid-cols-2 gap-4">
        <Input label="IMAP Username" value={form.imapUser} onChange={(e) => updateField('imapUser', e.target.value)} />
        <Input label="IMAP Password" type="password" value={form.imapPass} onChange={(e) => updateField('imapPass', e.target.value)} />
      </div>

      <hr className="border-gray-200" />

      <div className="grid grid-cols-2 gap-4">
        <Input label="SMTP Host" value={form.smtpHost} onChange={(e) => updateField('smtpHost', e.target.value)} />
        <Input label="Port" type="number" value={form.smtpPort} onChange={(e) => updateField('smtpPort', Number(e.target.value))} />
      </div>
      <div className="grid grid-cols-2 gap-4">
        <Input label="SMTP Username" value={form.smtpUser} onChange={(e) => updateField('smtpUser', e.target.value)} />
        <Input label="SMTP Password" type="password" value={form.smtpPass} onChange={(e) => updateField('smtpPass', e.target.value)} />
      </div>

      <div className="flex gap-3">
        <Button variant="secondary" onClick={handleTest} loading={testing}>Test Connection</Button>
        <Button onClick={handleSave} loading={saving}>Save Configuration</Button>
      </div>
    </div>
  );
}
