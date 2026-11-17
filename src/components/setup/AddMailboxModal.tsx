'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import Button from '@/components/ui/Button';
import Input from '@/components/ui/Input';
import { PRESETS } from '@/components/setup/EmailConfigForm';
import {
  saveEmailConfig,
  testImapConnection,
  testSmtpConnection,
} from '@/server/actions/email-config';
import toast from 'react-hot-toast';

type BoardItem = { id: string; title: string };

export default function AddMailboxModal({
  isOpen,
  boards,
  onClose,
  onSaved,
}: {
  isOpen: boolean;
  boards: BoardItem[];
  onClose: () => void;
  onSaved: () => void;
}) {
  const router = useRouter();
  const [step, setStep] = useState<1 | 2>(1);
  const [presetKey, setPresetKey] = useState('zoho');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [boardId, setBoardId] = useState(boards[0]?.id || '');
  const [testing, setTesting] = useState(false);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (isOpen) {
      setStep(1);
      setEmail('');
      setPassword('');
      setPresetKey('zoho');
      setBoardId(boards[0]?.id || '');
    }
  }, [isOpen, boards]);

  useEffect(() => {
    if (!isOpen) return;
    const handleEsc = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && !saving) onClose();
    };
    window.addEventListener('keydown', handleEsc);
    return () => window.removeEventListener('keydown', handleEsc);
  }, [isOpen, saving, onClose]);

  if (!isOpen) return null;

  const preset = PRESETS[presetKey];

  function handleEmailChange(raw: string) {
    const value = raw.trim().toLowerCase();
    setEmail(value);
    if (value.endsWith('@gmail.com') && presetKey !== 'gmail') setPresetKey('gmail');
    else if (value.includes('zoho') && value.endsWith('.in') && presetKey !== 'zoho_in') setPresetKey('zoho_in');
    else if ((value.endsWith('@zoho.com') || value.endsWith('@zohomail.com')) && presetKey !== 'zoho') setPresetKey('zoho');
    else if ((value.endsWith('@outlook.com') || value.endsWith('@hotmail.com')) && presetKey !== 'outlook') setPresetKey('outlook');
  }

  async function handleContinue() {
    if (!email) {
      toast.error('Email address is required.');
      return;
    }
    if (!password) {
      toast.error('Password / App Password is required.');
      return;
    }
    setStep(2);
  }

  async function handleTestAndSave() {
    setTesting(true);
    try {
      const [imap, smtp] = await Promise.all([
        testImapConnection({
          host: preset.imapHost,
          port: preset.imapPort,
          user: email,
          pass: password,
        }),
        testSmtpConnection({
          host: preset.smtpHost,
          port: preset.smtpPort,
          user: email,
          pass: password,
        }),
      ]);

      if (!imap.success || !smtp.success) {
        const errMsg = imap.error || smtp.error || 'Connection failed.';
        toast.error(`Test failed: ${errMsg}`);
        setStep(1);
        return;
      }

      setSaving(true);
      await saveEmailConfig({
        name: preset.name,
        boardId: boardId || undefined,
        imapHost: preset.imapHost,
        imapPort: preset.imapPort,
        imapUser: email,
        imapPass: password,
        smtpHost: preset.smtpHost,
        smtpPort: preset.smtpPort,
        smtpUser: email,
        smtpPass: password,
        isActive: true,
      });
      toast.success(`✅ ${email} connected and linked successfully!`);
      onSaved();
      router.refresh();
    } catch (err: any) {
      toast.error(err?.message || 'Failed to save mailbox.');
    } finally {
      setTesting(false);
      setSaving(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-xs animate-in fade-in duration-200" onClick={!saving ? onClose : undefined} />

      <div className="relative bg-white rounded-3xl w-full max-w-lg shadow-2xl border border-slate-200/80 animate-in zoom-in-95 duration-200 z-10 overflow-hidden">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-100 bg-slate-50/70">
          <div>
            <h3 className="text-sm font-bold text-slate-900">Connect New Mailbox</h3>
            <p className="text-[11px] text-slate-500 mt-0.5">
              Step {step} of 2 · {step === 1 ? 'Choose provider & enter credentials' : 'Test & link to board'}
            </p>
          </div>
          <div className="flex items-center gap-1.5" aria-hidden>
            <span className={`w-6 h-1.5 rounded-full ${step >= 1 ? 'bg-primary-600' : 'bg-slate-200'}`} />
            <span className={`w-6 h-1.5 rounded-full ${step >= 2 ? 'bg-primary-600' : 'bg-slate-200'}`} />
          </div>
        </div>

        <div className="p-6 space-y-4 max-h-[70vh] overflow-y-auto">
          {step === 1 ? (
            <>
              <div className="space-y-2">
                <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider">
                  Select Email Provider (auto-fills host & port):
                </label>
                <div className="grid grid-cols-2 gap-2">
                  {Object.entries(PRESETS).map(([key, p]) => (
                    <button
                      key={key}
                      type="button"
                      onClick={() => setPresetKey(key)}
                      className={`px-3 py-2.5 rounded-xl text-xs font-semibold flex items-center justify-center gap-1.5 border transition-all cursor-pointer ${
                        presetKey === key
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

              <Input
                id="add-mailbox-email"
                label="Email Address"
                type="email"
                value={email}
                onChange={(e) => handleEmailChange(e.target.value)}
                placeholder="e.g., info@yourcompany.com"
                required
              />

              <div>
                <Input
                  id="add-mailbox-password"
                  label="Password / App Password"
                  type="password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="Account password or app password"
                  required
                />
                <p className="text-[11px] text-primary-700 font-medium mt-1">💡 {preset.hint}</p>
              </div>
            </>
          ) : (
            <>
              <div className="bg-primary-50/50 border border-primary-100 rounded-xl p-4 space-y-3">
                <div className="flex items-center justify-between text-xs">
                  <span className="text-slate-500 font-medium">Provider</span>
                  <span className="font-bold text-slate-800">{preset.icon} {preset.name}</span>
                </div>
                <div className="flex items-center justify-between text-xs">
                  <span className="text-slate-500 font-medium">Email</span>
                  <span className="font-bold text-slate-800 font-mono">{email}</span>
                </div>
                <div className="flex items-center justify-between text-xs">
                  <span className="text-slate-500 font-medium">Password</span>
                  <span className="font-bold text-slate-800">••••••••</span>
                </div>
              </div>

              <div className="space-y-1">
                <label htmlFor="add-mailbox-board" className="block text-sm font-medium text-gray-700">
                  Link to Pipeline Board
                </label>
                <select
                  id="add-mailbox-board"
                  value={boardId}
                  onChange={(e) => setBoardId(e.target.value)}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary-500 bg-white text-sm text-slate-800"
                >
                  {boards.map((b) => (
                    <option key={b.id} value={b.id}>
                      {b.title}
                    </option>
                  ))}
                </select>
                <p className="text-[11px] text-slate-500">
                  Customer emails from this inbox will sync to the selected board.
                </p>
              </div>

              <div className="bg-amber-50 border border-amber-200/70 rounded-xl p-3 text-[11px] text-amber-800">
                ⚠️ Connection will be tested before saving. Make sure IMAP/SMTP access is enabled for this account.
              </div>
            </>
          )}
        </div>

        {/* Footer */}
        <div className="flex items-center justify-between gap-3 px-6 py-4 border-t border-slate-100 bg-slate-50/50">
          <Button type="button" variant="ghost" size="sm" onClick={step === 1 ? onClose : () => setStep(1)} disabled={saving || testing} className="text-xs">
            {step === 1 ? 'Cancel' : '← Back'}
          </Button>
          {step === 1 ? (
            <Button type="button" size="sm" onClick={handleContinue} className="text-xs font-bold">
              Continue →
            </Button>
          ) : (
            <Button
              type="button"
              size="sm"
              onClick={handleTestAndSave}
              loading={testing || saving}
              className="text-xs font-bold"
            >
              {testing ? 'Testing connection…' : saving ? 'Saving…' : '⚡ Test & Connect'}
            </Button>
          )}
        </div>
      </div>
    </div>
  );
}
