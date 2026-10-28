'use client';

import { useState } from 'react';
import { updateBoardEmailSettings } from '@/server/actions/email-config';
import toast from 'react-hot-toast';

interface BoardItem {
  id: string;
  title: string;
}

interface ConfigItem {
  id: string;
  name: string;
  smtpUser: string;
  imapUser: string;
  boardId?: string;
  authType: string;
}

export default function BoardSenderManager({
  boards,
  configs,
  initialBoardSettings,
  readOnly = false,
}: {
  boards: BoardItem[];
  configs: ConfigItem[];
  initialBoardSettings?: Record<string, { allowAllOutreach?: boolean }>;
  readOnly?: boolean;
}) {
  const [boardSettings, setBoardSettings] = useState<Record<string, { allowAllOutreach?: boolean }>>(
    initialBoardSettings || {}
  );
  const [savingBoardId, setSavingBoardId] = useState<string | null>(null);

  // Group email configs by boardId
  const getConfigsForBoard = (boardId: string) => {
    return configs.filter((c) => c.boardId === boardId);
  };

  const getUnassignedConfigs = () => {
    return configs.filter((c) => !c.boardId);
  };

  async function handleToggleOutreach(boardId: string, currentVal: boolean) {
    if (readOnly) return;
    const newVal = !currentVal;
    setBoardSettings((prev) => ({
      ...prev,
      [boardId]: { ...prev[boardId], allowAllOutreach: newVal },
    }));

    setSavingBoardId(boardId);
    try {
      await updateBoardEmailSettings({
        boardId,
        allowAllOutreach: newVal,
      });
      toast.success(
        newVal
          ? 'Multi-ESP Outreach Mode enabled for this board!'
          : 'Board switched to dedicated sender isolation mode.'
      );
    } catch (err: any) {
      toast.error(err.message || 'Failed to update board settings');
    } finally {
      setSavingBoardId(null);
    }
  }

  async function handleAssignConfig(boardId: string, configId: string) {
    if (readOnly) return;
    setSavingBoardId(boardId);
    try {
      const currentConfigs = getConfigsForBoard(boardId);
      const newConfigIds = [...currentConfigs.map((c) => c.id), configId];
      await updateBoardEmailSettings({
        boardId,
        assignedConfigIds: newConfigIds,
      });
      toast.success('Mailbox assigned to board.');
      window.location.reload();
    } catch (err: any) {
      toast.error(err.message || 'Failed to assign mailbox');
    } finally {
      setSavingBoardId(null);
    }
  }

  async function handleUnassignConfig(boardId: string, configId: string) {
    if (readOnly) return;
    setSavingBoardId(boardId);
    try {
      const currentConfigs = getConfigsForBoard(boardId);
      const newConfigIds = currentConfigs.map((c) => c.id).filter((id) => id !== configId);
      await updateBoardEmailSettings({
        boardId,
        assignedConfigIds: newConfigIds,
      });
      toast.success('Mailbox unassigned from board.');
      window.location.reload();
    } catch (err: any) {
      toast.error(err.message || 'Failed to unassign mailbox');
    } finally {
      setSavingBoardId(null);
    }
  }

  return (
    <div className="space-y-4">
      <div className="bg-gradient-to-r from-blue-50 to-indigo-50 border border-blue-200/80 rounded-xl p-4 text-xs text-blue-900 space-y-1">
        <p className="font-bold flex items-center gap-1.5 text-sm">
          <span>🛡️</span>
          <span>Per-Board Mailbox & Outbound Sender Isolation</span>
        </p>
        <p className="text-blue-700 leading-relaxed">
          Each board has its own dedicated outbound senders. A card on <strong>Main Board</strong> cannot send from mailboxes belonging to <strong>nell@jetdigitalpro.com</strong> or random senders. For mass cold outreach boards, toggle <em>Multi-ESP Outreach Mode</em> to allow dispatching from hundreds of cold senders.
        </p>
      </div>

      <div className="grid grid-cols-1 gap-4">
        {boards.map((b) => {
          const assignedConfigs = getConfigsForBoard(b.id);
          const unassigned = getUnassignedConfigs();
          const isOutreachEnabled = Boolean(boardSettings[b.id]?.allowAllOutreach);
          const isSaving = savingBoardId === b.id;

          return (
            <div
              key={b.id}
              className="p-4 bg-white border border-slate-200/90 rounded-2xl shadow-2xs space-y-3 transition-all hover:border-slate-300"
            >
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 border-b border-slate-100 pb-2.5">
                <div>
                  <div className="flex items-center gap-2">
                    <span className="text-base">📋</span>
                    <h3 className="text-sm font-bold text-slate-900">{b.title}</h3>
                    <span className="text-[10px] bg-slate-100 text-slate-600 font-bold px-2 py-0.5 rounded-full">
                      Board ID: {b.id.slice(0, 10)}...
                    </span>
                  </div>
                </div>

                {/* Multi-ESP Outreach Toggle */}
                {!readOnly && (
                  <label className="flex items-center gap-2 cursor-pointer bg-slate-50 border border-slate-200 px-3 py-1.5 rounded-xl hover:bg-slate-100 transition-colors">
                    <input
                      type="checkbox"
                      checked={isOutreachEnabled}
                      disabled={isSaving}
                      onChange={() => handleToggleOutreach(b.id, isOutreachEnabled)}
                      className="w-4 h-4 rounded text-indigo-600 focus:ring-indigo-500 border-slate-300 cursor-pointer"
                    />
                    <div className="text-[11px]">
                      <span className="font-bold text-slate-800">Multi-ESP Outreach Mode</span>
                      <span className="text-slate-400 block text-[10px]">
                        {isOutreachEnabled ? '✓ Enabled (Hundreds of ESP senders)' : 'Disabled (Single sender isolation)'}
                      </span>
                    </div>
                  </label>
                )}
              </div>

              {/* Assigned Senders */}
              <div>
                <label className="block text-xs font-semibold text-slate-700 uppercase tracking-wider mb-1.5">
                  Authorized Senders for this Board:
                </label>

                {assignedConfigs.length === 0 && !isOutreachEnabled ? (
                  <div className="p-3 bg-amber-50 border border-amber-200/70 rounded-xl text-xs text-amber-800 flex items-center justify-between">
                    <div>
                      <span className="font-bold">⚠️ No Mailbox Assigned</span>
                      <p className="text-[11px] text-amber-700 mt-0.5">
                        This board cannot send emails until at least one mailbox is assigned below.
                      </p>
                    </div>
                  </div>
                ) : (
                  <div className="flex flex-wrap gap-2">
                    {assignedConfigs.map((cfg) => (
                      <span
                        key={cfg.id}
                        className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-emerald-50 text-emerald-800 border border-emerald-200 rounded-xl text-xs font-semibold shadow-2xs"
                      >
                        <span className="w-2 h-2 rounded-full bg-emerald-500" />
                        <span>{cfg.name}</span>
                        <span className="text-[11px] text-emerald-600 font-mono">({cfg.smtpUser})</span>
                        {!readOnly && (
                          <button
                            type="button"
                            onClick={() => handleUnassignConfig(b.id, cfg.id)}
                            className="hover:text-red-600 font-bold ml-1 text-xs"
                            title="Unassign mailbox from this board"
                          >
                            ✕
                          </button>
                        )}
                      </span>
                    ))}

                    {isOutreachEnabled && (
                      <span className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-indigo-50 text-indigo-800 border border-indigo-200 rounded-xl text-xs font-semibold shadow-2xs">
                        <span>🚀</span>
                        <span>All Connected Outreach ESP Accounts (Cold Senders)</span>
                      </span>
                    )}
                  </div>
                )}
              </div>

              {/* Assign Mailbox Selector */}
              {!readOnly && unassigned.length > 0 && (
                <div className="pt-2 border-t border-slate-100 flex items-center gap-2">
                  <span className="text-xs text-slate-500">+ Link Available Mailbox:</span>
                  <div className="flex flex-wrap gap-1.5">
                    {unassigned.map((u) => (
                      <button
                        key={u.id}
                        type="button"
                        onClick={() => handleAssignConfig(b.id, u.id)}
                        disabled={isSaving}
                        className="px-2.5 py-1 bg-slate-100 hover:bg-primary-50 hover:text-primary-700 text-slate-700 rounded-lg text-xs font-semibold border border-slate-200 transition-colors cursor-pointer"
                      >
                        + {u.name} ({u.smtpUser})
                      </button>
                    ))}
                  </div>
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
