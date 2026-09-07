'use client';

import { useState } from 'react';
import Input from '@/components/ui/Input';
import Button from '@/components/ui/Button';
import { saveEmailConfig, deleteEmailConfig, testImapConnection, testSmtpConnection } from '@/server/actions/email-config';
import toast from 'react-hot-toast';

type BoardItem = { id: string; title: string };

type EmailValues = {
  id?: string;
  name?: string;
  boardId?: string;
  authType?: string;
  hasOAuthToken?: boolean;
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

export default function EmailConfigForm({ initial, boards = [], isNew = false }: { initial?: Partial<EmailValues>; boards?: BoardItem[]; isNew?: boolean }) {
  const [form, setForm] = useState<EmailValues>({
    ...defaults, ...initial,
    name: initial?.name || (isNew ? '' : 'Default'),
    boardId: initial?.boardId || '',
    authType: initial?.authType || 'password',
    imapPass: '', smtpPass: '',
  });
  const isOAuth = form.authType === 'oauth2';
  const [hasSavedPasswords] = useState(Boolean(initial?.imapUser));
  const [testing, setTesting] = useState<'imap' | 'smtp' | 'all' | null>(null);
  const [saving, setSaving] = useState(false);
  const [status, setStatus] = useState<{ imap?: string; smtp?: string }>({});

  async function handleTest(kind: 'imap' | 'smtp' | 'all') {
    setTesting(kind);
    setStatus({});
    try {
      if (kind === 'imap' || kind === 'all') {
        const result = await testImapConnection({
          configId: form.id,
          host: form.imapHost,
          port: form.imapPort,
          user: form.imapUser,
          pass: form.imapPass || undefined,
        });
        if (!result.success) { setStatus({ imap: result.error || 'IMAP connection failed.' }); toast.error(`IMAP: ${result.error}`); return; }
        setStatus((current) => ({ ...current, imap: 'Connected' }));
      }
      if (kind === 'smtp' || kind === 'all') {
        const result = await testSmtpConnection({
          configId: form.id,
          host: form.smtpHost,
          port: form.smtpPort,
          user: form.smtpUser,
          pass: form.smtpPass || undefined,
        });
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
      await saveEmailConfig({ ...form, name: form.name || 'Default' });
      toast.success('Email configuration saved.');
      window.location.reload();
    } catch (error: any) {
      toast.error(error?.message || 'Could not save email configuration.');
    } finally { setSaving(false); }
  }

  async function handleDelete() {
    if (!form.id) return;
    if (!confirm('Delete this email configuration?')) return;
    try {
      await deleteEmailConfig(form.id);
      toast.success('Configuration deleted.');
      window.location.reload();
    } catch (error: any) {
      toast.error(error?.message || 'Could not delete configuration.');
    }
  }

  const updateField = (field: keyof EmailValues, value: string | number) => setForm((prev) => ({ ...prev, [field]: value }));
  const passwordHint = hasSavedPasswords ? 'Leave blank to keep the saved password.' : 'Required for the first setup.';

  return (
    <div className="space-y-4">
      {(isNew || !initial?.id) && (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <Input id={`name-${form.id || 'new'}`} label="Configuration Name" value={form.name || ''} onChange={(e) => updateField('name', e.target.value)} placeholder="e.g., Sales, Support, Billing" required />
          <div className="space-y-1">
            <label className="block text-sm font-medium text-gray-700">Link to Board</label>
            <select
              id={`board-${form.id || 'new'}`}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary-500"
              value={form.boardId || ''}
              onChange={(e) => updateField('boardId', e.target.value)}
            >
              <option value="">No board linked</option>
              {boards.map(b => <option key={b.id} value={b.id}>{b.title}</option>)}
            </select>
          </div>
        </div>
      )}
      {isOAuth && (
        <div className="p-3 bg-blue-50/70 border border-blue-200/80 rounded-xl text-xs text-blue-800 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <span className="w-2 h-2 rounded-full bg-blue-600 animate-pulse" />
            <span>Connected via <strong>Zoho OAuth</strong>. Authentication is handled automatically via secure tokens.</span>
          </div>
          <span className="text-[11px] font-semibold text-blue-700 bg-blue-100 px-2 py-0.5 rounded-full">
            No Password Required
          </span>
        </div>
      )}

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <Input id="imap-host" label="IMAP Host" value={form.imapHost} onChange={(e) => updateField('imapHost', e.target.value)} required />
        <Input id="imap-port" label="IMAP Port" type="number" value={form.imapPort} onChange={(e) => updateField('imapPort', Number(e.target.value))} required />
        <Input id="imap-user" label="IMAP Username" value={form.imapUser} onChange={(e) => updateField('imapUser', e.target.value)} required />
        {!isOAuth && (
          <div>
            <Input id="imap-pass" label="IMAP Password" type="password" value={form.imapPass} onChange={(e) => updateField('imapPass', e.target.value)} required={!hasSavedPasswords} />
            <p className="text-xs text-gray-500 mt-1">{passwordHint}</p>
          </div>
        )}
      </div>
      {status.imap && <p className="text-sm text-green-700 font-medium">IMAP: {status.imap}</p>}
      <hr className="border-gray-200" />
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <Input id="smtp-host" label="SMTP Host" value={form.smtpHost} onChange={(e) => updateField('smtpHost', e.target.value)} required />
        <Input id="smtp-port" label="SMTP Port" type="number" value={form.smtpPort} onChange={(e) => updateField('smtpPort', Number(e.target.value))} required />
        <Input id="smtp-user" label="SMTP Username" value={form.smtpUser} onChange={(e) => updateField('smtpUser', e.target.value)} required />
        {!isOAuth && (
          <div>
            <Input id="smtp-pass" label="SMTP Password" type="password" value={form.smtpPass} onChange={(e) => updateField('smtpPass', e.target.value)} required={!hasSavedPasswords} />
            <p className="text-xs text-gray-500 mt-1">{passwordHint}</p>
          </div>
        )}
      </div>
      {status.smtp && <p className="text-sm text-green-700 font-medium">SMTP: {status.smtp}</p>}
      <div className="flex flex-wrap gap-3 pt-1">
        <Button variant="secondary" onClick={() => handleTest('imap')} loading={testing === 'imap'} disabled={Boolean(testing)}>
          {isOAuth ? 'Test IMAP (OAuth)' : 'Test IMAP'}
        </Button>
        <Button variant="secondary" onClick={() => handleTest('smtp')} loading={testing === 'smtp'} disabled={Boolean(testing)}>
          {isOAuth ? 'Test SMTP (OAuth)' : 'Test SMTP'}
        </Button>
        <Button variant="secondary" onClick={() => handleTest('all')} loading={testing === 'all'} disabled={Boolean(testing)}>
          {isOAuth ? 'Test All (OAuth)' : 'Test All'}
        </Button>
        <Button onClick={handleSave} loading={saving} disabled={Boolean(testing)}>
          {isNew ? 'Add Configuration' : 'Save Configuration'}
        </Button>
        {form.id && <Button variant="secondary" onClick={handleDelete} className="text-red-600 hover:text-red-700">Delete</Button>}
      </div>
    </div>
  );
}
