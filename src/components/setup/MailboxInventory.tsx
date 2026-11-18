'use client';

import { useState, useMemo } from 'react';
import { useRouter } from 'next/navigation';
import Button from '@/components/ui/Button';
import ConfirmDialog from '@/components/ui/ConfirmDialog';
import EmailConfigForm, { PRESETS } from '@/components/setup/EmailConfigForm';
import EmailConfigActiveToggle from '@/components/setup/EmailConfigActiveToggle';
import AddMailboxModal from '@/components/setup/AddMailboxModal';
import {
  deleteEmailConfig,
  deleteManyEmailConfigs,
  testManyConnections,
} from '@/server/actions/email-config';
import toast from 'react-hot-toast';

type BoardItem = { id: string; title: string };

export type InventoryConfig = {
  id: string;
  name: string;
  boardId?: string;
  authType: string;
  imapHost: string;
  imapPort: number;
  imapUser: string;
  smtpHost: string;
  smtpPort: number;
  smtpUser: string;
  hasImapPassword?: boolean;
  hasSmtpPassword?: boolean;
  hasOAuthToken?: boolean;
  isActive?: boolean;
};

type Health = {
  imap?: 'ok' | 'fail' | 'checking';
  smtp?: 'ok' | 'fail' | 'checking';
  imapError?: string;
  smtpError?: string;
  imapMode?: 'zoho_rest' | 'password';
  smtpMode?: 'zoho_rest' | 'password';
};
type Filter = 'all' | 'active' | 'inactive' | 'unlinked';

function inferProvider(cfg: InventoryConfig): { name: string; icon: string } {
  const host = (cfg.imapHost || '').toLowerCase();
  if (host.includes('zoho.in')) return { name: 'Zoho (India)', icon: '🇮🇳' };
  if (host.includes('zoho')) return { name: 'Zoho Mail', icon: '📫' };
  if (host.includes('gmail')) return { name: 'Google Gmail', icon: '✉️' };
  if (host.includes('outlook') || host.includes('office')) return { name: 'Outlook 365', icon: '💼' };
  return { name: 'Custom IMAP', icon: '🧩' };
}

function HealthDot({ state, error, label, mode }: { state?: 'ok' | 'fail' | 'checking'; error?: string; label: string; mode?: 'zoho_rest' | 'password' }) {
  if (!state) return <span className="text-slate-400 font-medium">Not tested</span>;
  if (state === 'checking') {
    return (
      <span className="inline-flex items-center gap-1 text-slate-500 font-medium">
        <span className="animate-spin inline-block w-2.5 h-2.5 border border-slate-400 border-t-transparent rounded-full" />
        Testing…
      </span>
    );
  }
  if (state === 'ok') {
    if (mode === 'zoho_rest') {
      return (
        <span
          className="inline-flex items-center gap-1 text-emerald-700 font-semibold"
          title="Verified via Zoho Mail REST API (HTTPS Port 443 - aman & terjamin)"
        >
          <span>✓</span>
          Zoho REST Connected
        </span>
      );
    }
    return (
      <span className="inline-flex items-center gap-1 text-emerald-700 font-semibold">
        <span>✓</span>
        {label} connected
      </span>
    );
  }
  return (
    <span className="inline-flex items-center gap-1 text-rose-600 font-semibold" title={error || `${label} connection failed`}>
      <span>✗</span>
      {label} failed
      {error ? <span className="text-rose-400 font-normal"> — {error}</span> : null}
    </span>
  );
}

export default function MailboxInventory({
  configs,
  boards,
  readOnly = false,
}: {
  configs: InventoryConfig[];
  boards: BoardItem[];
  readOnly?: boolean;
}) {
  const router = useRouter();
  const [filter, setFilter] = useState<Filter>('all');
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [health, setHealth] = useState<Record<string, Health>>({});
  const [testingAll, setTestingAll] = useState(false);
  const [testingId, setTestingId] = useState<string | null>(null);
  const [showAddModal, setShowAddModal] = useState(false);

  const [confirmDialog, setConfirmDialog] = useState<{
    isOpen: boolean;
    title: string;
    message: string;
    confirmText?: string;
    isLoading?: boolean;
    onConfirm: () => void | Promise<void>;
  }>({ isOpen: false, title: '', message: '', onConfirm: () => {} });

  const [disconnectAllStep, setDisconnectAllStep] = useState<'idle' | 'typing'>('idle');
  const [disconnectAllText, setDisconnectAllText] = useState('');

  const counts = useMemo(() => {
    const active = configs.filter((c) => c.isActive !== false).length;
    const inactive = configs.length - active;
    const unlinked = configs.filter((c) => !c.boardId).length;
    return { all: configs.length, active, inactive, unlinked };
  }, [configs]);

  const filtered = useMemo(() => {
    switch (filter) {
      case 'active':
        return configs.filter((c) => c.isActive !== false);
      case 'inactive':
        return configs.filter((c) => c.isActive === false);
      case 'unlinked':
        return configs.filter((c) => !c.boardId);
      default:
        return configs;
    }
  }, [configs, filter]);

  const idsToTest = selected.size > 0 ? [...selected] : configs.map((c) => c.id);

  async function runTests(ids: string[]): Promise<{ okCount: number; failCount: number } | null> {
    if (ids.length === 0) {
      toast.error('No mailboxes to test.');
      return null;
    }
    setHealth((prev) => {
      const next = { ...prev };
      ids.forEach((id) => {
        next[id] = { imap: 'checking', smtp: 'checking' };
      });
      return next;
    });

    try {
      const result = await testManyConnections(ids);
      let okCount = 0;
      let failCount = 0;
      setHealth((prev) => {
        const next = { ...prev };
        for (const r of result.results) {
          const imapOk = r.imap.success;
          const smtpOk = r.smtp.success;
          if (imapOk && smtpOk) okCount++;
          else failCount++;
          next[r.id] = {
            imap: imapOk ? 'ok' : 'fail',
            smtp: smtpOk ? 'ok' : 'fail',
            imapError: r.imap.error,
            smtpError: r.smtp.error,
            imapMode: (r.imap as any).mode,
            smtpMode: (r.smtp as any).mode,
          };
        }
        return next;
      });
      if (failCount === 0) toast.success(`✅ ${okCount} mailbox(es) healthy — IMAP & SMTP connected.`);
      else if (okCount === 0) toast.error(`❌ All ${failCount} mailbox(es) failed connection test.`);
      else toast(`${okCount} ✓ healthy / ${failCount} ✗ failed. See red rows below.`, { icon: '⚠️' });
      return { okCount, failCount };
    } catch (err: any) {
      toast.error(err?.message || 'Connection test failed.');
      setHealth((prev) => {
        const next = { ...prev };
        ids.forEach((id) => {
          delete next[id]?.imap;
          delete next[id]?.smtp;
        });
        return next;
      });
      return null;
    }
  }

  async function handleTestAll() {
    setTestingAll(true);
    try {
      await runTests(idsToTest);
    } finally {
      setTestingAll(false);
    }
  }

  async function handleTestOne(cfg: InventoryConfig) {
    setTestingId(cfg.id);
    try {
      const summary = await runTests([cfg.id]);
      if (summary && summary.failCount > 0) {
        setExpandedId(cfg.id);
        toast('Fix credentials in the opened form, then Save.', { icon: '🔧' });
      }
    } finally {
      setTestingId(null);
    }
  }

  function toggleSelect(id: string) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function toggleSelectAll() {
    if (selected.size === configs.length) setSelected(new Set());
    else setSelected(new Set(configs.map((c) => c.id)));
  }

  function askDeleteOne(cfg: InventoryConfig) {
    setConfirmDialog({
      isOpen: true,
      title: 'Disconnect Mailbox?',
      message: `Disconnect '${cfg.imapUser || cfg.name}'? Inbound sync and automated processing for this address will stop immediately.`,
      confirmText: 'Disconnect Mailbox',
      isLoading: false,
      onConfirm: async () => {
        setConfirmDialog((prev) => ({ ...prev, isLoading: true }));
        try {
          await deleteEmailConfig(cfg.id);
          toast.success('Mailbox disconnected.');
          setSelected((prev) => {
            const next = new Set(prev);
            next.delete(cfg.id);
            return next;
          });
          if (expandedId === cfg.id) setExpandedId(null);
          router.refresh();
        } catch (err: any) {
          toast.error(err?.message || 'Failed to disconnect mailbox.');
        } finally {
          setConfirmDialog((prev) => ({ ...prev, isOpen: false, isLoading: false }));
        }
      },
    });
  }

  function askDeleteSelected() {
    const ids = [...selected];
    if (ids.length === 0) return;
    setConfirmDialog({
      isOpen: true,
      title: `Disconnect ${ids.length} Mailbox(es)?`,
      message: `Disconnect ${ids.length} selected mailbox(es)? Inbound sync for these addresses will stop immediately.`,
      confirmText: 'Disconnect Selected',
      isLoading: false,
      onConfirm: async () => {
        setConfirmDialog((prev) => ({ ...prev, isLoading: true }));
        try {
          await deleteManyEmailConfigs(ids);
          toast.success(`${ids.length} mailbox(es) disconnected.`);
          setSelected(new Set());
          router.refresh();
        } catch (err: any) {
          toast.error(err?.message || 'Failed to disconnect mailboxes.');
        } finally {
          setConfirmDialog((prev) => ({ ...prev, isOpen: false, isLoading: false }));
        }
      },
    });
  }

  async function handleDisconnectAll() {
    const ids = configs.map((c) => c.id);
    if (ids.length === 0) return;
    try {
      await deleteManyEmailConfigs(ids);
      toast.success('All mailboxes disconnected.');
      setSelected(new Set());
      setDisconnectAllStep('idle');
      setDisconnectAllText('');
      router.refresh();
    } catch (err: any) {
      toast.error(err?.message || 'Failed to disconnect all mailboxes.');
    }
  }

  const filterChip = (key: Filter, label: string, count: number) => (
    <button
      key={key}
      type="button"
      onClick={() => setFilter(key)}
      className={`px-3 py-1.5 rounded-full text-xs font-bold border transition-all cursor-pointer ${
        filter === key
          ? 'bg-primary-600 text-white border-primary-600 shadow-xs'
          : 'bg-white text-slate-600 border-slate-200 hover:bg-slate-50 hover:border-slate-300'
      }`}
    >
      {label} <span className={filter === key ? 'text-primary-100' : 'text-slate-400'}>{count}</span>
    </button>
  );

  return (
    <div className="space-y-4">
      <ConfirmDialog
        isOpen={confirmDialog.isOpen}
        title={confirmDialog.title}
        message={confirmDialog.message}
        confirmText={confirmDialog.confirmText}
        variant="danger"
        isLoading={confirmDialog.isLoading}
        onConfirm={confirmDialog.onConfirm}
        onCancel={() => setConfirmDialog((prev) => ({ ...prev, isOpen: false }))}
      />

      <AddMailboxModal
        isOpen={showAddModal}
        boards={boards}
        onClose={() => setShowAddModal(false)}
        onSaved={() => {
          setShowAddModal(false);
          router.refresh();
        }}
      />

      {/* Toolbar */}
      <div className="flex flex-wrap items-center gap-2 justify-between bg-slate-50 border border-slate-200/90 rounded-xl p-3">
        <div className="flex flex-wrap items-center gap-1.5">
          {filterChip('all', 'All', counts.all)}
          {filterChip('active', '● Active', counts.active)}
          {filterChip('inactive', '○ Inactive', counts.inactive)}
          {filterChip('unlinked', '⚑ Unlinked', counts.unlinked)}
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {!readOnly && (
            <Button
              type="button"
              variant="secondary"
              size="sm"
              onClick={handleTestAll}
              loading={testingAll}
              disabled={testingAll || Boolean(testingId) || configs.length === 0}
              className="text-xs font-semibold"
            >
              🔍 Test {selected.size > 0 ? `Selected (${selected.size})` : 'All'}
            </Button>
          )}
          {!readOnly && (
            <Button
              type="button"
              size="sm"
              onClick={() => setShowAddModal(true)}
              className="text-xs font-bold"
            >
              + Add Mailbox
            </Button>
          )}
        </div>
      </div>

      {/* Empty state */}
      {configs.length === 0 && (
        <div className="text-center py-10 bg-white border border-dashed border-slate-300 rounded-2xl space-y-3">
          <p className="text-4xl">📭</p>
          <p className="text-sm font-semibold text-slate-700">No mailbox connected yet.</p>
          <p className="text-xs text-slate-500">Connect your first inbox to start syncing customer emails into Kanban boards.</p>
          {!readOnly && (
            <Button type="button" size="sm" onClick={() => setShowAddModal(true)} className="text-xs font-bold">
              + Add First Mailbox
            </Button>
          )}
        </div>
      )}

      {/* Inventory list */}
      {filtered.length > 0 && (
        <div className="bg-white border border-slate-200/90 rounded-2xl overflow-hidden divide-y divide-slate-100">
          {!readOnly && configs.length > 1 && (
            <div className="flex items-center gap-2 px-4 py-2 bg-slate-50/70 border-b border-slate-100">
              <input
                type="checkbox"
                checked={selected.size === configs.length && configs.length > 0}
                onChange={toggleSelectAll}
                className="w-3.5 h-3.5 rounded border-slate-300 text-primary-600 focus:ring-primary-500 cursor-pointer"
                aria-label="Select all mailboxes"
              />
              <span className="text-[11px] font-semibold text-slate-500">
                {selected.size > 0 ? `${selected.size} selected` : 'Select all'}
              </span>
            </div>
          )}

          {filtered.map((cfg) => {
            const provider = inferProvider(cfg);
            const board = boards.find((b) => b.id === cfg.boardId);
            const h = health[cfg.id];
            const isExpanded = expandedId === cfg.id;
            const hasFailed = h && (h.imap === 'fail' || h.smtp === 'fail');
            const isChecking = h?.imap === 'checking' || h?.smtp === 'checking';

            let statusChip: React.ReactNode = (
              <span className="inline-flex items-center gap-1 text-[10px] font-bold px-2 py-0.5 bg-slate-50 text-slate-500 border border-slate-200 rounded-full">
                Not tested
              </span>
            );
            if (isChecking) {
              statusChip = (
                <span className="inline-flex items-center gap-1.5 text-[10px] font-bold px-2 py-0.5 bg-blue-50 text-blue-700 border border-blue-200/70 rounded-full">
                  <span className="animate-spin inline-block w-2.5 h-2.5 border border-blue-400 border-t-transparent rounded-full" />
                  Testing…
                </span>
              );
            } else if (h?.imap === 'ok' && h?.smtp === 'ok') {
              statusChip = (
                <span className="inline-flex items-center gap-1 text-[10px] font-bold px-2 py-0.5 bg-emerald-50 text-emerald-700 border border-emerald-200 rounded-full">
                  ✓ Connected
                </span>
              );
            } else if (hasFailed) {
              statusChip = (
                <span className="inline-flex items-center gap-1 text-[10px] font-bold px-2 py-0.5 bg-rose-50 text-rose-700 border border-rose-200 rounded-full">
                  ✗ Connection failed
                </span>
              );
            }

            return (
              <div
                key={cfg.id}
                className={`${isExpanded ? 'bg-primary-50/30' : 'hover:bg-slate-50/60 transition-colors'} ${
                  hasFailed ? 'border-l-4 border-l-rose-400' : ''
                }`}
              >
                <div className="flex items-center gap-3 px-4 py-3">
                  {!readOnly && (
                    <input
                      type="checkbox"
                      checked={selected.has(cfg.id)}
                      onChange={() => toggleSelect(cfg.id)}
                      className="w-3.5 h-3.5 rounded border-slate-300 text-primary-600 focus:ring-primary-500 cursor-pointer shrink-0"
                      aria-label={`Select ${cfg.imapUser}`}
                    />
                  )}

                  <span
                    className={`w-2.5 h-2.5 rounded-full shrink-0 ${
                      cfg.isActive === false ? 'bg-slate-300' : 'bg-emerald-500'
                    }`}
                    title={cfg.isActive === false ? 'Inactive' : 'Active'}
                  />

                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
                      <span className="text-sm font-bold text-slate-900 truncate">{cfg.imapUser}</span>
                      <span className="inline-flex items-center gap-1 text-[10px] font-bold px-2 py-0.5 bg-slate-100 text-slate-600 border border-slate-200 rounded-full">
                        {provider.icon} {provider.name}
                      </span>
                      {cfg.authType === 'oauth2' && (
                        <span
                          className="text-[10px] font-bold px-2 py-0.5 bg-indigo-50 text-indigo-700 border border-indigo-200/70 rounded-full cursor-help"
                          title="Akun resmi terhubung via Zoho OAuth2 (menggunakan token aman, tidak butuh password manual)"
                        >
                          🔑 Zoho OAuth2
                        </span>
                      )}
                      {cfg.hasImapPassword ? (
                        <span
                          className="text-[10px] font-bold px-2 py-0.5 bg-emerald-50 text-emerald-700 border border-emerald-200/70 rounded-full cursor-help"
                          title="Akun mandiri dengan IMAP/SMTP App Password"
                        >
                          🛡 App Password
                        </span>
                      ) : cfg.authType === 'oauth2' && cfg.name?.startsWith('Zoho (') ? (
                        <span
                          className="text-[10px] font-bold px-2 py-0.5 bg-blue-50 text-blue-700 border border-blue-200/70 rounded-full cursor-help"
                          title="Primary Mailbox (Kotak surat utama yang memegang token OAuth)"
                        >
                          ⭐ Primary Mailbox
                        </span>
                      ) : cfg.authType === 'oauth2' ? (
                        <span
                          className="text-[10px] font-bold px-2 py-0.5 bg-purple-50 text-purple-700 border border-purple-200/70 rounded-full cursor-help"
                          title="Team Alias / Shared Mailbox (Mengirim & menerima email via token Primary Mailbox)"
                        >
                          👥 Team Alias / Shared
                        </span>
                      ) : null}
                      {board ? (
                        <span className="inline-flex items-center gap-1 text-[10px] font-bold px-2 py-0.5 bg-primary-50 text-primary-700 border border-primary-200/70 rounded-full">
                          📋 {board.title}
                        </span>
                      ) : (
                        <span className="inline-flex items-center gap-1 text-[10px] font-bold px-2 py-0.5 bg-amber-50 text-amber-700 border border-amber-200/70 rounded-full">
                          ⚑ Unlinked
                        </span>
                      )}
                    </div>
                    <div className="flex flex-wrap items-center gap-x-3 gap-y-0.5 mt-1 text-[11px]">
                      {statusChip}
                      <HealthDot state={h?.imap} error={h?.imapError} mode={h?.imapMode} label="IMAP" />
                      <HealthDot state={h?.smtp} error={h?.smtpError} mode={h?.smtpMode} label="SMTP" />
                    </div>
                  </div>

                  <div className="flex items-center gap-2 shrink-0">
                    {!readOnly && (
                      <EmailConfigActiveToggle configId={cfg.id} initialActive={cfg.isActive !== false} />
                    )}
                    {!readOnly && hasFailed && (
                      <Button
                        type="button"
                        variant="secondary"
                        size="sm"
                        onClick={() => {
                          setExpandedId(cfg.id);
                          toast('Update the password or check IMAP/SMTP settings below, then Save.', { icon: '🔧' });
                        }}
                        className="text-[11px] font-bold text-amber-700 border-amber-300 hover:bg-amber-50"
                      >
                        ⚠ Repair
                      </Button>
                    )}
                    {!readOnly && (
                      <Button
                        type="button"
                        variant="secondary"
                        size="sm"
                        onClick={() => handleTestOne(cfg)}
                        loading={testingId === cfg.id}
                        disabled={Boolean(testingId) || testingAll}
                        className="text-[11px] font-semibold"
                        title="Test this mailbox connection"
                      >
                        Test
                      </Button>
                    )}
                    <Button
                      type="button"
                      variant={isExpanded ? 'primary' : 'ghost'}
                      size="sm"
                      onClick={() => setExpandedId(isExpanded ? null : cfg.id)}
                      className="text-[11px] font-bold"
                      aria-expanded={isExpanded}
                    >
                      {isExpanded ? 'Close' : readOnly ? 'View' : 'Edit'} ▾
                    </Button>
                    {!readOnly && (
                      <button
                        type="button"
                        onClick={() => askDeleteOne(cfg)}
                        className="w-7 h-7 inline-flex items-center justify-center rounded-lg text-slate-400 hover:text-rose-600 hover:bg-rose-50 transition-colors cursor-pointer"
                        title="Disconnect this mailbox"
                        aria-label={`Disconnect ${cfg.imapUser}`}
                      >
                        🗑
                      </button>
                    )}
                  </div>
                </div>

                {/* Accordion: full edit form in-place */}
                {isExpanded && (
                  <div className="px-4 pb-4 pt-1 border-t border-slate-100/80">
                    <div className="bg-white rounded-xl border border-slate-200/90 p-4 shadow-2xs">
                      <EmailConfigForm initial={cfg as any} boards={boards} />
                    </div>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}

      {/* Danger zone */}
      {!readOnly && configs.length > 0 && (
        <div className="bg-rose-50/60 border border-rose-200/80 rounded-2xl p-4 space-y-3">
          <div className="flex items-center justify-between gap-3 flex-wrap">
            <div>
              <p className="text-xs font-bold text-rose-900 uppercase tracking-wider flex items-center gap-1.5">
                <span>⚠️</span> Danger Zone
              </p>
              <p className="text-[11px] text-rose-700 mt-0.5">
                Disconnecting stops inbound sync immediately. Historical Kanban cards are kept.
              </p>
            </div>
            <div className="flex items-center gap-2">
              <Button
                type="button"
                variant="secondary"
                size="sm"
                onClick={askDeleteSelected}
                disabled={selected.size === 0}
                className="text-xs font-bold text-rose-700 border-rose-300 hover:bg-rose-100"
              >
                Disconnect Selected{selected.size > 0 ? ` (${selected.size})` : ''}
              </Button>
              <Button
                type="button"
                variant="danger"
                size="sm"
                onClick={() => setDisconnectAllStep('typing')}
                className="text-xs font-bold"
              >
                Disconnect All
              </Button>
            </div>
          </div>

          {disconnectAllStep === 'typing' && (
            <div className="flex flex-wrap items-center gap-2 bg-white border border-rose-300 rounded-xl p-3">
              <span className="text-xs font-semibold text-rose-800">
                Type <code className="font-mono font-bold bg-rose-100 px-1.5 py-0.5 rounded">DISCONNECT</code> to confirm removing all {configs.length} mailbox(es):
              </span>
              <input
                type="text"
                value={disconnectAllText}
                onChange={(e) => setDisconnectAllText(e.target.value)}
                className="px-3 py-1.5 border border-slate-300 rounded-lg text-xs font-mono focus:outline-none focus:ring-2 focus:ring-rose-500 min-w-[140px]"
                placeholder="DISCONNECT"
                autoFocus
              />
              <Button
                type="button"
                variant="danger"
                size="sm"
                onClick={handleDisconnectAll}
                disabled={disconnectAllText !== 'DISCONNECT'}
                className="text-xs font-bold"
              >
                Confirm Remove All
              </Button>
              <Button
                type="button"
                variant="ghost"
                size="sm"
                onClick={() => {
                  setDisconnectAllStep('idle');
                  setDisconnectAllText('');
                }}
                className="text-xs"
              >
                Cancel
              </Button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
