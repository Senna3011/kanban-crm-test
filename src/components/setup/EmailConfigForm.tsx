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

const PRESETS: Record<string, { name: string; icon: string; imapHost: string; imapPort: number; smtpHost: string; smtpPort: number; hint: string }> = {
  zoho: {
    name: 'Zoho Mail',
    icon: '📫',
    imapHost: 'imap.zoho.com',
    imapPort: 993,
    smtpHost: 'smtp.zoho.com',
    smtpPort: 465,
    hint: 'Gunakan Password Akun Zoho atau App Password jika akun mengaktifkan 2FA/OTP.',
  },
  zoho_in: {
    name: 'Zoho (India)',
    icon: '🇮🇳',
    imapHost: 'imap.zoho.in',
    imapPort: 993,
    smtpHost: 'smtp.zoho.in',
    smtpPort: 465,
    hint: 'Khusus akun Zoho datacenter India (.in).',
  },
  gmail: {
    name: 'Google Gmail',
    icon: '✉️',
    imapHost: 'imap.gmail.com',
    imapPort: 993,
    smtpHost: 'smtp.gmail.com',
    smtpPort: 465,
    hint: 'Wajib gunakan 16 digit Google App Password (bukan password login biasa).',
  },
  outlook: {
    name: 'Outlook / Office 365',
    icon: '💼',
    imapHost: 'outlook.office365.com',
    imapPort: 993,
    smtpHost: 'smtp.office365.com',
    smtpPort: 587,
    hint: 'Gunakan password akun Microsoft atau App Password.',
  },
};

const defaults: EmailValues = {
  imapHost: 'imap.zoho.com',
  imapPort: 993,
  imapUser: '',
  imapPass: '',
  smtpHost: 'smtp.zoho.com',
  smtpPort: 465,
  smtpUser: '',
  smtpPass: '',
};

export default function EmailConfigForm({ initial, boards = [], isNew = false }: { initial?: Partial<EmailValues>; boards?: BoardItem[]; isNew?: boolean }) {
  const [form, setForm] = useState<EmailValues>({
    ...defaults,
    ...initial,
    name: initial?.name || (isNew ? 'Zoho Mail' : 'Zoho Mail'),
    boardId: initial?.boardId || (boards[0]?.id || ''),
    authType: initial?.authType || 'password',
    imapPass: '',
    smtpPass: '',
  });

  const [selectedPreset, setSelectedPreset] = useState<string>('zoho');
  const [singlePassword, setSinglePassword] = useState('');
  const [hasSavedPasswords] = useState(Boolean(initial?.imapUser));
  const [testing, setTesting] = useState<'imap' | 'smtp' | 'all' | null>(null);
  const [saving, setSaving] = useState(false);
  const [status, setStatus] = useState<{ imap?: string; smtp?: string }>({});

  function applyPreset(presetKey: string, silent = false) {
    setSelectedPreset(presetKey);
    const p = PRESETS[presetKey];
    if (p) {
      setForm((prev) => ({
        ...prev,
        name: prev.name && prev.name !== 'Default' ? prev.name : p.name,
        imapHost: p.imapHost,
        imapPort: p.imapPort,
        smtpHost: p.smtpHost,
        smtpPort: p.smtpPort,
      }));
      if (!silent) {
        toast.success(`Preset ${p.name} aktif! Host & port otomatis disesuaikan.`);
      }
    }
  }

  function handleEmailChange(rawEmail: string) {
    const email = rawEmail.trim();
    const emailLower = email.toLowerCase();

    // Auto-detection of provider preset based on email domain
    if (emailLower.endsWith('@gmail.com') && selectedPreset !== 'gmail') {
      applyPreset('gmail', true);
    } else if (emailLower.endsWith('.in') && emailLower.includes('zoho') && selectedPreset !== 'zoho_in') {
      applyPreset('zoho_in', true);
    } else if ((emailLower.endsWith('@zoho.com') || emailLower.endsWith('@zohomail.com')) && selectedPreset !== 'zoho') {
      applyPreset('zoho', true);
    } else if ((emailLower.endsWith('@outlook.com') || emailLower.endsWith('@hotmail.com')) && selectedPreset !== 'outlook') {
      applyPreset('outlook', true);
    }

    setForm((prev) => ({
      ...prev,
      imapUser: email,
      smtpUser: email,
    }));
  }

  function handlePasswordChange(pass: string) {
    setSinglePassword(pass);
    setForm((prev) => ({
      ...prev,
      imapPass: pass,
      smtpPass: pass,
    }));
  }

  async function handleTest(kind: 'imap' | 'smtp' | 'all'): Promise<boolean> {
    if (!form.imapUser.trim()) {
      toast.error('Silakan isi Alamat Email terlebih dahulu.');
      return false;
    }
    if (!hasSavedPasswords && !singlePassword && !form.imapPass) {
      toast.error('Silakan isi Password akun / App Password terlebih dahulu.');
      return false;
    }

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
        if (!result.success) {
          setStatus({ imap: result.error || 'IMAP connection failed.' });
          toast.error(`IMAP: ${result.error}`);
          return false;
        }
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
        if (!result.success) {
          setStatus((current) => ({ ...current, smtp: result.error || 'SMTP connection failed.' }));
          toast.error(`SMTP: ${result.error}`);
          return false;
        }
        setStatus((current) => ({ ...current, smtp: 'Connected' }));
      }
      toast.success(kind === 'all' ? '✅ IMAP dan SMTP berhasil terhubung!' : `✅ ${kind.toUpperCase()} berhasil terhubung!`);
      return true;
    } catch (error: any) {
      toast.error(error?.message || 'Uji coba koneksi gagal.');
      return false;
    } finally {
      setTesting(null);
    }
  }

  async function handleSave() {
    if (!form.imapUser.trim()) {
      toast.error('Alamat Email wajib diisi.');
      return;
    }

    // Auto-verify connection before saving if new password entered
    if (singlePassword || !hasSavedPasswords) {
      const isValid = await handleTest('all');
      if (!isValid) {
        toast.error('Koneksi email gagal. Periksa kembali email dan password Anda sebelum menyimpan.');
        return;
      }
    }

    setSaving(true);
    try {
      await saveEmailConfig({
        ...form,
        name: form.name || 'Zoho Mail',
        smtpUser: form.smtpUser || form.imapUser,
        smtpPass: form.smtpPass || form.imapPass,
      });
      toast.success('Konfigurasi email berhasil disimpan!');
      window.location.reload();
    } catch (error: any) {
      toast.error(error?.message || 'Gagal menyimpan konfigurasi email.');
    } finally {
      setSaving(false);
    }
  }

  async function handleDelete() {
    if (!form.id) return;
    if (!confirm('Hapus konfigurasi email ini?')) return;
    try {
      await deleteEmailConfig(form.id);
      toast.success('Konfigurasi email dihapus.');
      window.location.reload();
    } catch (error: any) {
      toast.error(error?.message || 'Gagal menghapus konfigurasi.');
    }
  }

  const updateField = (field: keyof EmailValues, value: string | number) => setForm((prev) => ({ ...prev, [field]: value }));
  const activePresetInfo = PRESETS[selectedPreset] || PRESETS.zoho;

  return (
    <div className="space-y-4">
      {/* 1-Click Provider Presets Selector */}
      <div className="p-3.5 bg-slate-50 border border-slate-200/90 rounded-xl space-y-2">
        <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider">
          Pilih Provider Email (Otomatis Mengisi Host & Port):
        </label>
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
          {Object.entries(PRESETS).map(([key, p]) => (
            <button
              key={key}
              type="button"
              onClick={() => applyPreset(key)}
              className={`px-3 py-2 rounded-xl text-xs font-semibold flex items-center justify-center gap-1.5 border transition-all ${
                selectedPreset === key
                  ? 'bg-primary-600 text-white border-primary-600 shadow-xs ring-2 ring-primary-500/30'
                  : 'bg-white text-slate-700 border-slate-200 hover:bg-slate-100 hover:border-slate-300'
              }`}
            >
              <span>{p.icon}</span>
              <span className="truncate">{p.name}</span>
            </button>
          ))}
        </div>
      </div>

      {/* Label & Board Selector */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <Input
          id={`name-${form.id || 'new'}`}
          label="Label Konfigurasi"
          value={form.name || ''}
          onChange={(e) => updateField('name', e.target.value)}
          placeholder="e.g., Zoho Salman, Support, Sales"
          required
        />
        <div className="space-y-1">
          <label className="block text-sm font-medium text-gray-700">Hubungkan ke Board</label>
          <select
            id={`board-${form.id || 'new'}`}
            className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary-500 bg-white text-sm text-slate-800"
            value={form.boardId || ''}
            onChange={(e) => updateField('boardId', e.target.value)}
          >
            {boards.map((b) => (
              <option key={b.id} value={b.id}>
                {b.title}
              </option>
            ))}
          </select>
        </div>
      </div>

      {/* Email & Password Input */}
      <div className="p-4 bg-primary-50/40 border border-primary-100 rounded-xl space-y-3">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div>
            <Input
              id={`email-${form.id || 'new'}`}
              label="Alamat Email (Username)"
              type="email"
              value={form.imapUser}
              onChange={(e) => handleEmailChange(e.target.value)}
              placeholder="e.g., nama@zoho.com atau nama@zohomail.com"
              required
            />
            <p className="text-[11px] text-slate-500 mt-1">Otomatis digunakan untuk penerimaan (IMAP) & pengiriman (SMTP).</p>
          </div>
          <div>
            <Input
              id={`pass-${form.id || 'new'}`}
              label="Password / App Password"
              type="password"
              value={singlePassword}
              onChange={(e) => handlePasswordChange(e.target.value)}
              placeholder={hasSavedPasswords ? '••••••••' : 'Password Akun / App Password'}
              required={!hasSavedPasswords}
            />
            <p className="text-[11px] text-primary-700 font-medium mt-1">💡 {activePresetInfo.hint}</p>
          </div>
        </div>
      </div>

      {/* Advanced Server Ports & Hosts Details */}
      <details className="group border border-slate-200 rounded-xl p-3 bg-white text-xs">
        <summary className="font-semibold text-slate-700 cursor-pointer flex items-center justify-between select-none">
          <span>⚙️ Pengaturan Teknis Server (Host & Port IMAP/SMTP)</span>
          <span className="text-slate-400 group-open:rotate-180 transition-transform">▼</span>
        </summary>
        <div className="mt-3 pt-3 border-t border-slate-100 space-y-4">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <Input id="imap-host" label="IMAP Host" value={form.imapHost} onChange={(e) => updateField('imapHost', e.target.value)} required />
            <Input id="imap-port" label="IMAP Port" type="number" value={form.imapPort} onChange={(e) => updateField('imapPort', Number(e.target.value))} required />
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <Input id="smtp-host" label="SMTP Host" value={form.smtpHost} onChange={(e) => updateField('smtpHost', e.target.value)} required />
            <Input id="smtp-port" label="SMTP Port" type="number" value={form.smtpPort} onChange={(e) => updateField('smtpPort', Number(e.target.value))} required />
          </div>
        </div>
      </details>

      {/* Status Indicators */}
      {status.imap && (
        <p className={`text-xs font-semibold ${status.imap === 'Connected' ? 'text-emerald-700' : 'text-rose-600'}`}>
          IMAP: {status.imap}
        </p>
      )}
      {status.smtp && (
        <p className={`text-xs font-semibold ${status.smtp === 'Connected' ? 'text-emerald-700' : 'text-rose-600'}`}>
          SMTP: {status.smtp}
        </p>
      )}

      {/* Action Buttons */}
      <div className="flex flex-wrap items-center gap-2 pt-1">
        <Button
          type="button"
          variant="secondary"
          onClick={() => handleTest('all')}
          loading={testing === 'all'}
          disabled={Boolean(testing) || saving}
          className="text-xs sm:text-sm font-semibold"
        >
          🔍 Test Koneksi (Test All)
        </Button>
        <Button
          type="button"
          onClick={handleSave}
          loading={saving}
          disabled={Boolean(testing)}
          className="text-xs sm:text-sm font-bold bg-primary-600 hover:bg-primary-700 text-white"
        >
          {isNew ? '💾 Simpan Konfigurasi Email' : '💾 Simpan Perubahan'}
        </Button>
        {form.id && (
          <Button
            type="button"
            variant="secondary"
            onClick={handleDelete}
            className="text-xs sm:text-sm text-red-600 hover:text-red-700 hover:bg-red-50 ml-auto"
          >
            Hapus
          </Button>
        )}
      </div>
    </div>
  );
}
