'use client';

import { useState, useMemo } from 'react';
import type { ColumnData, CardData } from '@/types';
import toast from 'react-hot-toast';

export interface BoardSenderOption {
  id: string;
  name: string;
  email: string;
}

interface Props {
  isOpen: boolean;
  onClose: () => void;
  boardTitle: string;
  boardId?: string;
  columns: ColumnData[];
  availableSenders: BoardSenderOption[];
  onCardClick: (card: CardData) => void;
  onRefresh: () => void;
}

export default function BoardLeadsReviewDrawer({
  isOpen,
  onClose,
  boardTitle,
  columns,
  availableSenders,
  onCardClick,
  onRefresh,
}: Props) {
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedColumnFilter, setSelectedColumnFilter] = useState('ALL');
  const [statusFilter, setStatusFilter] = useState<'ALL' | 'READY' | 'SENT' | 'NO_DRAFT'>('ALL');
  const [selectedCardIds, setSelectedCardIds] = useState<Set<string>>(new Set());
  const [targetSenderId, setTargetSenderId] = useState('');
  const [applyingSender, setApplyingSender] = useState(false);
  const [previewDraft, setPreviewDraft] = useState<{ leadName: string; subject: string; body: string } | null>(null);

  // Flatten all cards from all columns
  const allBoardCards = useMemo(() => {
    const list: { card: CardData; columnTitle: string; columnColor?: string }[] = [];
    for (const col of columns) {
      for (const card of col.cards) {
        list.push({ card, columnTitle: col.title, columnColor: col.color });
      }
    }
    return list;
  }, [columns]);

  // Filtered cards
  const filteredItems = useMemo(() => {
    return allBoardCards.filter(({ card, columnTitle }) => {
      // Column filter
      if (selectedColumnFilter !== 'ALL' && card.columnId !== selectedColumnFilter) {
        return false;
      }

      // Draft status filter
      const pendingDraft = card.drafts?.find((d) => d.status === 'pending' || d.status === 'edited');
      const sentDraft = card.drafts?.find((d) => d.status === 'sent');

      if (statusFilter === 'READY' && !pendingDraft) return false;
      if (statusFilter === 'SENT' && !sentDraft) return false;
      if (statusFilter === 'NO_DRAFT' && (pendingDraft || sentDraft)) return false;

      // Text search
      if (searchQuery.trim()) {
        const q = searchQuery.toLowerCase().trim();
        const name = (card.fromName || '').toLowerCase();
        const email = (card.fromEmail || '').toLowerCase();
        const company = (card.metadata?.company || '').toLowerCase();
        const jobTitle = (card.metadata?.jobTitle || '').toLowerCase();
        const subject = (card.subject || '').toLowerCase();
        return (
          name.includes(q) ||
          email.includes(q) ||
          company.includes(q) ||
          jobTitle.includes(q) ||
          subject.includes(q)
        );
      }

      return true;
    });
  }, [allBoardCards, selectedColumnFilter, statusFilter, searchQuery]);

  const readyToSendCount = useMemo(() => {
    return allBoardCards.filter(({ card }) =>
      card.drafts?.some((d) => d.status === 'pending' || d.status === 'edited')
    ).length;
  }, [allBoardCards]);

  const toggleSelectAll = () => {
    if (selectedCardIds.size === filteredItems.length) {
      setSelectedCardIds(new Set());
    } else {
      setSelectedCardIds(new Set(filteredItems.map((item) => item.card.id)));
    }
  };

  const toggleCardSelect = (id: string) => {
    const next = new Set(selectedCardIds);
    if (next.has(id)) next.delete(id);
    else next.add(id);
    setSelectedCardIds(next);
  };

  const handleApplySenderBulk = async () => {
    if (!targetSenderId) {
      toast.error('Please select a sender mailbox first.');
      return;
    }
    if (selectedCardIds.size === 0) {
      toast.error('Please select at least one prospect card.');
      return;
    }

    const senderObj = availableSenders.find((s) => s.id === targetSenderId || s.email === targetSenderId);
    setApplyingSender(true);
    try {
      const res = await fetch('/api/cards/batch-assign-sender', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          cardIds: Array.from(selectedCardIds),
          emailConfigId: senderObj?.id || targetSenderId,
          fromAddress: senderObj?.email || targetSenderId,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Failed to assign sender');
      toast.success(data.message || `Assigned sender to ${selectedCardIds.size} cards!`);
      setSelectedCardIds(new Set());
      onRefresh();
    } catch (err: any) {
      toast.error(err.message || 'Failed to assign sender mailbox');
    } finally {
      setApplyingSender(false);
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 overflow-hidden flex justify-end animate-in fade-in duration-200">
      {/* Backdrop */}
      <div
        className="fixed inset-0 bg-slate-900/50 backdrop-blur-xs transition-opacity cursor-pointer"
        onClick={onClose}
      />

      {/* Slide-over Drawer Panel */}
      <div className="relative w-full max-w-5xl bg-white dark:bg-[#161A1D] h-full shadow-2xl flex flex-col z-10 border-l border-slate-200 dark:border-[#2C333A]">
        {/* Drawer Header */}
        <div className="p-4 sm:p-5 border-b border-slate-200 dark:border-[#2C333A] bg-slate-50/70 dark:bg-[#1c2227] flex items-center justify-between gap-3">
          <div className="min-w-0">
            <div className="flex items-center gap-2">
              <span className="text-xl">🦅</span>
              <h2 className="text-base font-bold text-slate-900 dark:text-white truncate">
                Board Lead Inspection & Sender Setup
              </h2>
              <span className="px-2.5 py-0.5 rounded-full text-xs font-bold bg-primary-100 dark:bg-primary-950 text-primary-800 dark:text-primary-300">
                {allBoardCards.length} Leads in &quot;{boardTitle}&quot;
              </span>
            </div>
            <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">
              Bird-Eye View: inspect recipient details, verify assigned senders, and review sequence drafts before dispatching.
            </p>
          </div>
          <button
            onClick={onClose}
            className="p-2 text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 rounded-xl hover:bg-slate-200/60 dark:hover:bg-[#2C333A] transition-colors"
            title="Close Drawer"
          >
            ✕
          </button>
        </div>

        {/* Top Metric Bar */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 p-4 border-b border-slate-100 dark:border-[#2C333A] bg-white dark:bg-[#161A1D] text-xs">
          <div className="p-2.5 rounded-xl bg-slate-50 dark:bg-[#1c2227] border border-slate-200 dark:border-[#2C333A]">
            <span className="text-slate-500 dark:text-slate-400 block font-medium">Total Prospects</span>
            <span className="text-lg font-bold text-slate-900 dark:text-white">{allBoardCards.length}</span>
          </div>
          <div className="p-2.5 rounded-xl bg-indigo-50/60 dark:bg-indigo-950/30 border border-indigo-100 dark:border-indigo-900/50">
            <span className="text-indigo-600 dark:text-indigo-400 block font-medium">Drafts Ready to Send</span>
            <span className="text-lg font-bold text-indigo-700 dark:text-indigo-300">{readyToSendCount}</span>
          </div>
          <div className="p-2.5 rounded-xl bg-emerald-50/60 dark:bg-emerald-950/30 border border-emerald-100 dark:border-emerald-900/50">
            <span className="text-emerald-600 dark:text-emerald-400 block font-medium">Available Senders</span>
            <span className="text-lg font-bold text-emerald-700 dark:text-emerald-300">{availableSenders.length} mailboxes</span>
          </div>
          <div className="p-2.5 rounded-xl bg-amber-50/60 dark:bg-amber-950/30 border border-amber-100 dark:border-amber-900/50">
            <span className="text-amber-700 dark:text-amber-400 block font-medium">Pipeline Stages</span>
            <span className="text-lg font-bold text-amber-800 dark:text-amber-300">{columns.length} columns</span>
          </div>
        </div>

        {/* Filters & Bulk Actions Toolbar */}
        <div className="p-4 border-b border-slate-200 dark:border-[#2C333A] bg-slate-50/40 dark:bg-[#161A1D] space-y-3">
          <div className="flex flex-wrap items-center justify-between gap-3">
            {/* Search Input */}
            <div className="flex-1 min-w-[200px] max-w-sm relative">
              <input
                type="text"
                placeholder="Search name, company, email..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="w-full pl-8 pr-3 py-1.5 text-xs rounded-xl border border-slate-300 dark:border-[#2C333A] bg-white dark:bg-[#1c2227] text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-primary-500"
              />
              <span className="absolute left-2.5 top-2 text-xs text-slate-400">🔍</span>
            </div>

            {/* Stage / Column Filter */}
            <select
              value={selectedColumnFilter}
              onChange={(e) => setSelectedColumnFilter(e.target.value)}
              className="px-3 py-1.5 text-xs rounded-xl border border-slate-300 dark:border-[#2C333A] bg-white dark:bg-[#1c2227] text-slate-800 dark:text-slate-200 font-semibold focus:outline-none"
            >
              <option value="ALL">All Stages ({allBoardCards.length})</option>
              {columns.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.title} ({c.cards.length})
                </option>
              ))}
            </select>

            {/* Status Filter */}
            <select
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value as any)}
              className="px-3 py-1.5 text-xs rounded-xl border border-slate-300 dark:border-[#2C333A] bg-white dark:bg-[#1c2227] text-slate-800 dark:text-slate-200 font-semibold focus:outline-none"
            >
              <option value="ALL">All Draft Statuses</option>
              <option value="READY">Ready to Send ({readyToSendCount})</option>
              <option value="SENT">Sent / Contacted</option>
              <option value="NO_DRAFT">No Draft</option>
            </select>
          </div>

          {/* Bulk Assign Sender Toolbar */}
          <div className="flex flex-wrap items-center justify-between gap-2.5 p-2.5 rounded-xl bg-indigo-50/70 dark:bg-[#1c2636] border border-indigo-100 dark:border-[#204677]">
            <div className="flex items-center gap-2">
              <input
                type="checkbox"
                checked={filteredItems.length > 0 && selectedCardIds.size === filteredItems.length}
                onChange={toggleSelectAll}
                className="w-4 h-4 text-primary-600 rounded border-slate-300 cursor-pointer"
              />
              <span className="text-xs font-bold text-slate-800 dark:text-white">
                {selectedCardIds.size} of {filteredItems.length} selected
              </span>
            </div>

            <div className="flex items-center gap-2">
              <select
                value={targetSenderId}
                onChange={(e) => setTargetSenderId(e.target.value)}
                className="px-2.5 py-1.5 text-xs rounded-lg border border-slate-300 dark:border-[#2C333A] bg-white dark:bg-[#161A1D] text-slate-800 dark:text-slate-200 font-medium focus:outline-none max-w-xs"
              >
                <option value="">-- Choose Sender Mailbox --</option>
                {availableSenders.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.email} ({s.name})
                  </option>
                ))}
              </select>

              <button
                type="button"
                onClick={handleApplySenderBulk}
                disabled={applyingSender || selectedCardIds.size === 0 || !targetSenderId}
                className="px-3 py-1.5 bg-primary-600 hover:bg-primary-700 text-white text-xs font-bold rounded-lg transition-colors flex items-center gap-1 shadow-xs disabled:opacity-50 cursor-pointer"
              >
                {applyingSender ? (
                  <span>Applying...</span>
                ) : (
                  <>
                    <span>📬</span>
                    <span>Assign Sender to {selectedCardIds.size}</span>
                  </>
                )}
              </button>
            </div>
          </div>
        </div>

        {/* Table Content */}
        <div className="flex-1 overflow-y-auto">
          {filteredItems.length === 0 ? (
            <div className="py-16 text-center text-slate-400 text-xs">
              <p className="text-2xl mb-1">🔍</p>
              <p className="font-semibold text-slate-600 dark:text-slate-300">No prospects match your filter.</p>
              <p className="mt-0.5">Try clearing your search query or choosing another stage.</p>
            </div>
          ) : (
            <table className="w-full text-left border-collapse text-xs">
              <thead>
                <tr className="border-b border-slate-200 dark:border-[#2C333A] bg-slate-50 dark:bg-[#1c2227] text-slate-500 dark:text-slate-400 font-semibold sticky top-0 z-10">
                  <th className="py-2.5 pl-4 pr-2 w-8">
                    <input
                      type="checkbox"
                      checked={filteredItems.length > 0 && selectedCardIds.size === filteredItems.length}
                      onChange={toggleSelectAll}
                      className="w-3.5 h-3.5 rounded border-slate-300 cursor-pointer"
                    />
                  </th>
                  <th className="py-2.5 px-3">Prospect</th>
                  <th className="py-2.5 px-3">Company & Role</th>
                  <th className="py-2.5 px-3">Stage</th>
                  <th className="py-2.5 px-3">Assigned Sender</th>
                  <th className="py-2.5 px-3">Sequence Draft</th>
                  <th className="py-2.5 pr-4 pl-2 text-right">Action</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 dark:divide-[#2C333A] text-slate-700 dark:text-slate-300">
                {filteredItems.map(({ card, columnTitle, columnColor }) => {
                  const meta = card.metadata || {};
                  const isSelected = selectedCardIds.has(card.id);
                  const pendingDraft = card.drafts?.find((d) => d.status === 'pending' || d.status === 'edited');
                  const sentDraft = card.drafts?.find((d) => d.status === 'sent');
                  const currentSender =
                    card.emailConfig?.smtpUser ||
                    meta.fromAddress ||
                    availableSenders.find((s) => s.id === card.emailConfigId)?.email ||
                    'Auto Default';

                  return (
                    <tr
                      key={card.id}
                      className={`hover:bg-slate-50 dark:hover:bg-[#1f252b] transition-colors ${
                        isSelected ? 'bg-primary-50/40 dark:bg-primary-950/30' : ''
                      }`}
                    >
                      <td className="py-3 pl-4 pr-2">
                        <input
                          type="checkbox"
                          checked={isSelected}
                          onChange={() => toggleCardSelect(card.id)}
                          className="w-3.5 h-3.5 rounded border-slate-300 text-primary-600 cursor-pointer"
                        />
                      </td>

                      {/* Prospect Name & Email */}
                      <td className="py-3 px-3">
                        <div className="font-bold text-slate-900 dark:text-white">
                          {card.fromName || 'Unnamed Prospect'}
                        </div>
                        <div className="text-[11px] text-slate-500 dark:text-slate-400 font-mono">
                          {card.fromEmail}
                        </div>
                      </td>

                      {/* Company & Role */}
                      <td className="py-3 px-3">
                        <div className="font-semibold text-slate-800 dark:text-slate-200">
                          {meta.company || 'Enterprise'}
                        </div>
                        <div className="text-[11px] text-slate-500 dark:text-slate-400">
                          {meta.jobTitle || 'Executive'}
                        </div>
                      </td>

                      {/* Stage Badge */}
                      <td className="py-3 px-3">
                        <span
                          className="px-2 py-0.5 rounded-md text-[11px] font-bold inline-flex items-center gap-1 shadow-2xs border"
                          style={{
                            borderColor: columnColor || '#3b82f6',
                            color: columnColor || '#3b82f6',
                            backgroundColor: `${columnColor || '#3b82f6'}15`,
                          }}
                        >
                          <span
                            className="w-1.5 h-1.5 rounded-full"
                            style={{ backgroundColor: columnColor || '#3b82f6' }}
                          />
                          {columnTitle}
                        </span>
                      </td>

                      {/* Assigned Sender Mailbox */}
                      <td className="py-3 px-3">
                        <span className="font-mono text-[11px] text-indigo-700 dark:text-indigo-300 font-semibold bg-indigo-50 dark:bg-indigo-950/60 px-2 py-1 rounded-md border border-indigo-100 dark:border-indigo-900 flex items-center gap-1 max-w-[190px] truncate">
                          <span>📬</span>
                          <span className="truncate">{currentSender}</span>
                        </span>
                      </td>

                      {/* Sequence Draft Preview Button */}
                      <td className="py-3 px-3">
                        {pendingDraft ? (
                          <button
                            type="button"
                            onClick={() =>
                              setPreviewDraft({
                                leadName: card.fromName || 'Lead',
                                subject: pendingDraft.subject || 'Outreach Pitch',
                                body: pendingDraft.body,
                              })
                            }
                            className="px-2 py-1 bg-emerald-50 dark:bg-emerald-950/60 border border-emerald-200 dark:border-emerald-800 text-emerald-800 dark:text-emerald-300 rounded-md font-semibold text-[11px] hover:bg-emerald-100 transition-colors flex items-center gap-1"
                            title="Click to preview draft email pitch"
                          >
                            <span>🟢</span>
                            <span className="truncate max-w-[120px]">{pendingDraft.subject || 'Draft Ready'}</span>
                          </button>
                        ) : sentDraft ? (
                          <span className="text-slate-400 text-[11px] flex items-center gap-1">
                            <span>🚀</span> Sent
                          </span>
                        ) : (
                          <span className="text-slate-400 text-[11px]">⚪ No Draft</span>
                        )}
                      </td>

                      {/* Action */}
                      <td className="py-3 pr-4 pl-2 text-right">
                        <button
                          type="button"
                          onClick={() => {
                            onCardClick(card);
                          }}
                          className="px-2.5 py-1 text-[11px] font-bold text-primary-600 hover:text-primary-700 dark:text-primary-400 hover:underline inline-flex items-center gap-0.5"
                        >
                          <span>Review Card</span>
                          <span>↗</span>
                        </button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          )}
        </div>

        {/* Drawer Footer */}
        <div className="p-3.5 border-t border-slate-200 dark:border-[#2C333A] bg-slate-50 dark:bg-[#1c2227] flex items-center justify-between text-xs text-slate-500">
          <span>Showing {filteredItems.length} of {allBoardCards.length} prospects</span>
          <button
            onClick={onClose}
            className="px-4 py-1.5 bg-slate-200 hover:bg-slate-300 dark:bg-[#2C333A] dark:hover:bg-[#38414A] text-slate-800 dark:text-slate-200 font-bold rounded-xl transition-colors"
          >
            Done
          </button>
        </div>
      </div>

      {/* Quick Draft Preview Modal */}
      {previewDraft && (
        <div className="fixed inset-0 z-60 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white dark:bg-[#161A1D] rounded-2xl max-w-lg w-full p-5 shadow-2xl border border-slate-200 dark:border-[#2C333A] space-y-3 animate-in fade-in">
            <div className="flex items-center justify-between border-b border-slate-100 dark:border-[#2C333A] pb-2.5">
              <div>
                <h4 className="text-xs font-bold uppercase tracking-wider text-slate-400">Draft Pitch Preview</h4>
                <p className="text-sm font-bold text-slate-900 dark:text-white">{previewDraft.leadName}</p>
              </div>
              <button
                onClick={() => setPreviewDraft(null)}
                className="text-slate-400 hover:text-slate-600 text-sm"
              >
                ✕
              </button>
            </div>
            <div>
              <label className="text-[10px] font-bold text-slate-400 uppercase">Subject</label>
              <p className="text-xs font-bold text-slate-800 dark:text-slate-200">{previewDraft.subject}</p>
            </div>
            <div>
              <label className="text-[10px] font-bold text-slate-400 uppercase">Body</label>
              <div className="mt-1 p-3 bg-slate-50 dark:bg-[#1c2227] border border-slate-200 dark:border-[#2C333A] rounded-xl text-xs text-slate-700 dark:text-slate-300 font-mono whitespace-pre-wrap max-h-60 overflow-y-auto leading-relaxed">
                {previewDraft.body}
              </div>
            </div>
            <div className="pt-2 text-right">
              <button
                onClick={() => setPreviewDraft(null)}
                className="px-4 py-1.5 bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs font-bold rounded-lg transition-colors"
              >
                Close Preview
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
