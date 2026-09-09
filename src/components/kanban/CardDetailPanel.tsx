'use client';

import { useState, useEffect, useMemo } from 'react';
import type { CardData, ActivityLogData, DraftData } from '@/types';
import Button from '@/components/ui/Button';
import { sendDraft } from '@/server/actions/draft';
import toast, { Toaster } from 'react-hot-toast';

/* ------------------------------------------------------------------ */
/*  Helpers                                                           */
/* ------------------------------------------------------------------ */

interface TimelineItem {
  id: string;
  type: 'email_received' | 'email_sent' | 'activity' | 'draft';
  title: string;
  summary: string;
  detail?: string;
  timestamp: Date;
  meta?: Record<string, unknown>;
  isCurrent?: boolean;
}

function buildTimeline(
  threadCards: any[],
  activityLogs: ActivityLogData[],
  currentCardId: string,
): TimelineItem[] {
  const items: TimelineItem[] = [];
  const shownCardIds = new Set<string>();
  const shownDraftIds = new Set<string>();

  // Thread cards → timeline items (skip current card — already in description)
  for (const tc of threadCards) {
    if (tc.id === currentCardId) continue; // avoid duplication with description
    shownCardIds.add(tc.id);

    if (tc.type === 'sent') {
      shownDraftIds.add(tc.id);
      items.push({
        id: `thread-${tc.id}`,
        type: 'email_sent',
        title: 'Email Sent',
        summary: tc.subject || '(No subject)',
        detail: tc.body,
        timestamp: new Date(tc.timestamp),
      });
    } else {
      items.push({
        id: `thread-${tc.id}`,
        type: 'email_received',
        title: 'Email Received',
        summary: `From ${tc.from} — ${tc.subject || '(No subject)'}`,
        detail: tc.body,
        timestamp: new Date(tc.timestamp),
      });
    }
  }

  // Activity logs → timeline (skip email logs already covered by thread cards)
  const emailLogTypes = new Set(['email_received', 'email_sent', 'email_reply_received']);
  for (const log of activityLogs) {
    const c = log.content as any;

    if (emailLogTypes.has(log.type)) {
      if (c?.cardId && shownCardIds.has(c.cardId)) continue;
      if (c?.draftId && shownDraftIds.has(c.draftId)) continue;
    }

    let type: TimelineItem['type'] = 'activity';
    let title = log.type.replace(/_/g, ' ');
    let summary = '';
    let detail: string | undefined;

    switch (log.type) {
      case 'email_received':
        title = 'Email Received';
        summary = `From: ${c?.from || 'Unknown'} — ${c?.subject || ''}`;
        detail = c?.bodyText || c?.preview;
        break;
      case 'email_sent':
        title = 'Email Sent';
        summary = `To: ${c?.to || 'Unknown'} — ${c?.subject || ''}`;
        break;
      case 'email_reply_received':
        title = 'Reply Received';
        summary = `From: ${c?.from || 'Unknown'} — ${c?.subject || ''}`;
        break;
      case 'ai_reclassified':
        title = 'AI Reclassified';
        summary = `${c?.from} moved to ${c?.to} (${c?.confidence}% confidence)`;
        break;
      case 'draft_created':
        type = 'draft';
        title = 'Draft Created';
        summary = 'Reply draft saved';
        break;
      case 'card_moved':
        title = 'Card Moved';
        summary = c?.from ? `From "${c.from}" to "${c.to}"` : `Moved to "${c?.to || 'column'}"`;
        break;
      default:
        summary = typeof c === 'object' ? JSON.stringify(c) : String(c || log.type);
    }

    items.push({
      id: `log-${log.id}`,
      type,
      title,
      summary,
      detail,
      timestamp: new Date(log.createdAt),
      meta: c,
    });
  }

  // Sort newest first
  items.sort((a, b) => b.timestamp.getTime() - a.timestamp.getTime());
  return items;
}

function relativeTime(date: Date): string {
  const now = Date.now();
  const diffMs = now - date.getTime();
  const diffMin = Math.floor(diffMs / 60000);
  if (diffMin < 1) return 'just now';
  if (diffMin < 60) return `${diffMin}m ago`;
  const diffHr = Math.floor(diffMin / 60);
  if (diffHr < 24) return `${diffHr}h ago`;
  const diffDay = Math.floor(diffHr / 24);
  if (diffDay < 7) return `${diffDay}d ago`;
  return date.toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
}

/* ------------------------------------------------------------------ */
/*  Activity Timeline Item                                            */
/* ------------------------------------------------------------------ */

function ActivityItem({ item }: { item: TimelineItem }) {
  const [expanded, setExpanded] = useState(false);
  const hasDetail = !!item.detail && item.detail.trim().length > 0;

  const iconMap: Record<string, { svgPath: string; color: string; bg: string }> = {
    email_received: {
      svgPath: 'M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z',
      color: 'text-primary-600',
      bg: 'bg-primary-50 border-primary-100',
    },
    email_sent: {
      svgPath: 'M12 19l9 2-9-18-9 18 9-2zm0 0v-8',
      color: 'text-emerald-600',
      bg: 'bg-emerald-50 border-emerald-100',
    },
    activity: {
      svgPath: 'M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2',
      color: 'text-slate-600',
      bg: 'bg-slate-50 border-slate-200',
    },
    draft: {
      svgPath: 'M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.572L16.732 3.732z',
      color: 'text-purple-600',
      bg: 'bg-purple-50 border-purple-100',
    },
  };
  const currentIcon = iconMap[item.type] || iconMap.activity;

  return (
    <div
      className={`border rounded-xl transition-all ${
        expanded ? `${currentIcon.bg} shadow-sm` : 'bg-white border-slate-200/70 hover:border-slate-300'
      }`}
    >
      {/* Collapsed header — always visible */}
      <button
        onClick={() => setExpanded(!expanded)}
        className="w-full text-left px-3.5 py-2.5 flex items-start gap-3"
      >
        <div className={`w-6 h-6 rounded-md flex items-center justify-center flex-shrink-0 mt-0.5 ${currentIcon.color} bg-white shadow-xs border border-slate-100`}>
          <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d={currentIcon.svgPath} />
          </svg>
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-baseline justify-between gap-2">
            <span className="text-xs font-semibold text-slate-800 truncate">{item.title}</span>
            <span className="text-[11px] text-slate-400 flex-shrink-0">{relativeTime(item.timestamp)}</span>
          </div>
          <p className="text-xs text-slate-500 mt-0.5 truncate">{item.summary}</p>
        </div>
        {hasDetail && (
          <svg
            className={`w-4 h-4 text-slate-400 flex-shrink-0 mt-1 transition-transform ${expanded ? 'rotate-180' : ''}`}
            fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}
          >
            <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
          </svg>
        )}
      </button>

      {/* Expanded detail */}
      {expanded && hasDetail && (
        <div className="px-3.5 pb-3 pt-0 ml-9">
          {item.type === 'email_received' || item.type === 'email_sent' ? (
            <div className="bg-white border border-slate-200/80 rounded-lg p-3 text-xs text-slate-700 whitespace-pre-wrap max-h-64 overflow-y-auto leading-relaxed">
              {item.detail}
            </div>
          ) : (
            <p className="text-xs text-slate-600 whitespace-pre-wrap">{item.detail}</p>
          )}
        </div>
      )}
    </div>
  );
}

/* ------------------------------------------------------------------ */
/*  Card Detail Panel                                                 */
/* ------------------------------------------------------------------ */

interface Props {
  card: CardData;
  onClose: () => void;
}

export default function CardDetailPanel({ card, onClose }: Props) {
  const [draftBody, setDraftBody] = useState('');
  const [draftId, setDraftId] = useState<string | null>(null);
  const [activityLogs, setActivityLogs] = useState<ActivityLogData[]>([]);
  const [sending, setSending] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [fromAddresses, setFromAddresses] = useState<string[]>([]);
  const [selectedFrom, setSelectedFrom] = useState('');
  const [cardData, setCardData] = useState<any>(null);
  const [threadCards, setThreadCards] = useState<any[]>([]);
  const [isUnread, setIsUnread] = useState(card.status === 'unread');
  const [showHtml, setShowHtml] = useState(true);
  const [cardHtml, setCardHtml] = useState('');

  useEffect(() => {
    async function loadCardDetails() {
      try {
        setLoading(true);
        const [cardRes, configRes] = await Promise.all([
          fetch(`/api/cards/${card.id}`),
          fetch(`/api/email-configs`),
        ]);
        if (!cardRes.ok) {
          const errBody = await cardRes.json().catch(() => ({}));
          throw new Error(errBody.error || `Failed to load card (HTTP ${cardRes.status})`);
        }
        const data = await cardRes.json();

        setActivityLogs(data.activityLogs || []);
        setCardData(data);
        setCardHtml(data.bodyHtml || '');

        // Fetch thread conversation history
        try {
          const threadRes = await fetch(`/api/cards/${card.id}/thread`);
          if (threadRes.ok) {
            const thread = await threadRes.json();
            setThreadCards(thread);
          }
        } catch {}

        // Load available email addresses for from-selection
        if (configRes.ok) {
          const configs = await configRes.json();
          const addresses = configs.map((c: any) => c.smtpUser).filter(Boolean);
          setFromAddresses([...new Set(addresses)] as string[]);
          if (addresses.length > 0 && !selectedFrom) setSelectedFrom(addresses[0]);
        }

        // Load latest pending draft
        const drafts = data.drafts || [];
        const pending = drafts.find((d: DraftData) => d.status === 'pending');
        if (pending) {
          setDraftId(pending.id);
          setDraftBody(pending.body);
        } else {
          setDraftBody(
            `Hi ${card.fromName || card.fromEmail},\n\nI noticed your interest in our services. Would you like to schedule a call?\n\nBest regards`
          );
        }
      } catch (err: any) {
        setError(err.message);
      } finally {
        setLoading(false);
      }
    }
    loadCardDetails();
  }, [card.id, card.fromName, card.fromEmail]);

  // Build combined timeline
  const timeline = useMemo(
    () => buildTimeline(threadCards, activityLogs, card.id),
    [threadCards, activityLogs, card.id],
  );

  async function handleSend() {
    setSending(true);
    try {
      let idToSend = draftId;
      if (!idToSend && draftBody.trim()) {
        const res = await fetch(`/api/cards/${card.id}/draft`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ body: draftBody, subject: card.subject }),
        });
        if (!res.ok) throw new Error('Failed to create draft');
        const created = await res.json();
        idToSend = created.id;
        setDraftId(created.id);
      }
      if (!idToSend) {
        toast.error('Nothing to send — draft is empty');
        return;
      }
      await sendDraft(idToSend, selectedFrom || undefined);
      toast.success('Email sent!');
      const updatedRes = await fetch(`/api/cards/${card.id}`);
      if (updatedRes.ok) {
        const updatedData = await updatedRes.json();
        setActivityLogs(updatedData.activityLogs || []);
      }
      window.dispatchEvent(new Event('board-refresh'));
    } catch (e: any) {
      toast.error(e.message);
    } finally {
      setSending(false);
    }
  }

  async function handleDelete() {
    if (!confirm('Delete this card permanently?')) return;
    setDeleting(true);
    try {
      const res = await fetch(`/api/cards/${card.id}`, { method: 'DELETE' });
      if (!res.ok) throw new Error('Failed to delete');
      toast.success('Card deleted');
      window.dispatchEvent(new Event('board-refresh'));
      onClose();
    } catch (e: any) {
      toast.error(e.message || 'Delete failed');
    } finally {
      setDeleting(false);
    }
  }

  async function handleToggleUnread() {
    try {
      const newStatus = isUnread ? 'read' : 'unread';
      const res = await fetch(`/api/cards/${card.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status: newStatus }),
      });
      if (!res.ok) throw new Error('Failed to update');
      setIsUnread(!isUnread);
      toast.success(isUnread ? 'Marked as read' : 'Marked as unread');
      window.dispatchEvent(new Event('board-refresh'));
    } catch (e: any) {
      toast.error(e.message);
    }
  }

  async function handleNotALead() {
    try {
      const cardRes = await fetch(`/api/cards/${card.id}`);
      const cardInfo = await cardRes.json();
      const boardId = cardInfo.column?.boardId;
      if (!boardId) { toast.error('Board not found'); return; }

      const columnsRes = await fetch(`/api/columns?boardId=${boardId}`);
      const columns = await columnsRes.json();
      const generalCol = columns.find((c: any) => c.title === 'General');
      if (!generalCol) { toast.error('General column not found'); return; }

      await fetch(`/api/cards/${card.id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ columnId: generalCol.id }),
      });
      toast.success('Moved to General — not a lead', { duration: 2000 });
      window.dispatchEvent(new Event('board-refresh'));
      setTimeout(() => onClose(), 100);
    } catch (e: any) {
      toast.error(e.message || 'Failed to move');
    }
  }

  const columnName = cardData?.column?.title || '';
  const followUpDate = card.nextFollowUpAt ? new Date(card.nextFollowUpAt) : null;
  const isOverdue = followUpDate ? followUpDate < new Date() : false;

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center pt-6 sm:pt-12 p-4">
      <Toaster position="top-right" />
      {/* Backdrop with blur */}
      <div className="absolute inset-0 bg-slate-900/40 backdrop-blur-xs transition-opacity" onClick={onClose} />

      {/* Modal panel */}
      <div className="relative w-full max-w-2xl bg-white rounded-2xl shadow-2xl border border-slate-200/80 flex flex-col max-h-[88vh] overflow-hidden">
        {/* ---- Header ---- */}
        <div className="px-6 py-4 border-b border-slate-100 bg-slate-50/50 flex items-start justify-between gap-4">
          <div className="min-w-0 flex-1">
            <h2 className="text-base font-bold text-slate-800 leading-snug">{card.subject || '(No Subject)'}</h2>
            <div className="flex items-center gap-2 mt-2 flex-wrap">
              <span className="text-xs font-medium text-slate-600">
                {card.fromName ? `${card.fromName} <${card.fromEmail}>` : card.fromEmail}
              </span>
              {columnName && (
                <span className="inline-flex items-center gap-1.5 text-[11px] font-medium text-slate-600 bg-slate-200/70 px-2.5 py-0.5 rounded-full">
                  <span className="w-1.5 h-1.5 rounded-full bg-primary-600" />
                  {columnName}
                </span>
              )}
              {followUpDate && (
                <span
                  className={`inline-flex items-center gap-1 text-[11px] font-medium px-2 py-0.5 rounded-full border ${
                    isOverdue ? 'bg-rose-50 text-rose-600 border-rose-200/60' : 'bg-primary-50 text-primary-700 border-primary-200/60'
                  }`}
                >
                  <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
                  </svg>
                  {isOverdue ? 'Overdue' : `Follow up ${followUpDate.toLocaleDateString(undefined, { month: 'short', day: 'numeric' })}`}
                </span>
              )}
            </div>
          </div>
          <div className="flex items-center gap-1 flex-shrink-0">
            <button
              onClick={handleNotALead}
              className="text-xs px-2.5 py-1 rounded-lg bg-amber-50 text-amber-700 border border-amber-200 hover:bg-amber-100 transition-colors font-medium"
              title="Move to General — not a lead"
            >
              Not a lead
            </button>
            <button
              onClick={handleToggleUnread}
              className="p-1.5 rounded-lg hover:bg-slate-100 text-slate-500 hover:text-slate-700 transition-colors"
              title={isUnread ? 'Mark as read' : 'Mark as unread'}
            >
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                {isUnread ? (
                  <path strokeLinecap="round" strokeLinejoin="round" d="M3 19v-8.93a2 2 0 01.89-1.664l7-4.666a2 2 0 012.22 0l7 4.666A2 2 0 0121 10.07V19M3 19a2 2 0 002 2h14a2 2 0 002-2M3 19l6.75-4.5M21 19l-6.75-4.5M3 10l6.75 4.5M21 10l-6.75 4.5" />
                ) : (
                  <path strokeLinecap="round" strokeLinejoin="round" d="M21.75 6.75v10.5a2.25 2.25 0 01-2.25 2.25h-15a2.25 2.25 0 01-2.25-2.25V6.75m19.5 0A2.25 2.25 0 0019.5 4.5h-15a2.25 2.25 0 00-2.25 2.25m19.5 0v.243a2.25 2.25 0 01-1.07 1.916l-7.5 4.615a2.25 2.25 0 01-2.36 0L3.32 8.91a2.25 2.25 0 01-1.07-1.916V6.75" />
                )}
              </svg>
            </button>
            <button
              onClick={handleDelete}
              disabled={deleting}
              className="p-1.5 rounded-lg hover:bg-rose-50 text-slate-400 hover:text-rose-600 disabled:opacity-50 transition-colors"
              title="Delete card"
            >
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M14.74 9l-.346 9m-4.788 0L9.26 9m9.968-3.21c.342.052.682.107 1.022.166m-1.022-.165L18.16 19.673a2.25 2.25 0 01-2.244 2.077H8.084a2.25 2.25 0 01-2.244-2.077L4.772 5.79m14.456 0a48.108 48.108 0 00-3.478-.397m-12 .562c.34-.059.68-.114 1.022-.165m0 0a48.11 48.11 0 013.478-.397m7.5 0v-.916c0-1.18-.91-2.164-2.09-2.201a51.964 51.964 0 00-3.32 0c-1.18.037-2.09 1.022-2.09 2.201v.916m7.5 0a48.667 48.667 0 00-7.5 0" />
              </svg>
            </button>
            <button onClick={onClose} className="p-1.5 rounded-lg hover:bg-slate-200/60 text-slate-400 hover:text-slate-600 transition-colors">
              <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          </div>
        </div>

        {/* ---- Scrollable content ---- */}
        <div className="flex-1 overflow-y-auto">
          {loading ? (
            <div className="flex items-center justify-center py-16">
              <div className="animate-spin h-6 w-6 border-2 border-primary-200 border-t-primary-600 rounded-full" />
            </div>
          ) : error ? (
            <div className="text-center py-12 text-rose-500">
              <p>{error}</p>
            </div>
          ) : (
            <div className="px-6 py-5 space-y-6">
              {/* ---- Description / Original Email ---- */}
              <section>
                <div className="flex items-center justify-between mb-2.5">
                  <h3 className="text-xs font-bold text-slate-400 uppercase tracking-wider">Description</h3>
                  {cardHtml && (
                    <button
                      onClick={() => setShowHtml(!showHtml)}
                      className="text-xs font-medium text-primary-600 hover:text-primary-700 transition-colors"
                    >
                      {showHtml ? 'Show Plain Text' : 'Show Original HTML'}
                    </button>
                  )}
                </div>
                {showHtml && cardHtml ? (
                  <div className="bg-white border border-slate-200 rounded-xl overflow-hidden shadow-xs">
                    <iframe
                      srcDoc={cardHtml}
                      className="w-full border-0"
                      style={{ minHeight: 220, maxHeight: 400 }}
                      sandbox="allow-same-origin"
                      title="Email HTML"
                    />
                  </div>
                ) : card.bodyText ? (
                  <div className="bg-slate-50/80 rounded-xl p-4 text-xs text-slate-700 whitespace-pre-wrap leading-relaxed border border-slate-200/80 font-mono selection:bg-primary-100">
                    {card.bodyText}
                  </div>
                ) : (
                  <p className="text-xs text-slate-400 italic">No description</p>
                )}
              </section>

              {/* ---- Combined Activity Timeline ---- */}
              <section>
                <h3 className="text-xs font-bold text-slate-400 uppercase tracking-wider mb-3">
                  Activity {timeline.length > 0 && <span className="text-slate-400 normal-case font-normal">({timeline.length})</span>}
                </h3>
                {timeline.length === 0 ? (
                  <p className="text-xs text-slate-400 text-center py-6">No activity yet</p>
                ) : (
                  <div className="space-y-2">
                    {timeline.map((item) => (
                      <ActivityItem key={item.id} item={item} />
                    ))}
                  </div>
                )}
              </section>
            </div>
          )}
        </div>

        {/* ---- Draft Reply Composer (sticky bottom) ---- */}
        {!loading && !error && (
          <div className="border-t border-slate-200 bg-slate-50/70 px-6 py-4">
            <h3 className="text-xs font-bold text-slate-400 uppercase tracking-wider mb-2">Reply</h3>
            <textarea
              className="w-full h-28 px-3.5 py-2.5 border border-slate-200 rounded-xl text-xs text-slate-800 focus:outline-none focus:ring-2 focus:ring-primary-500/20 focus:border-primary-500 resize-none bg-white shadow-xs transition-all leading-relaxed"
              value={draftBody}
              onChange={(e) => setDraftBody(e.target.value)}
              placeholder="Write a reply..."
            />
            <div className="flex items-center justify-between mt-3">
              <div className="flex items-center gap-2">
                {fromAddresses.length > 1 && (
                  <select
                    className="px-2.5 py-1 border border-slate-200 rounded-lg text-xs text-slate-600 focus:outline-none focus:ring-2 focus:ring-primary-500/20 focus:border-primary-500 bg-white"
                    value={selectedFrom}
                    onChange={(e) => setSelectedFrom(e.target.value)}
                  >
                    {fromAddresses.map((addr) => (
                      <option key={addr} value={addr}>{addr}</option>
                    ))}
                  </select>
                )}
              </div>
              <Button size="sm" onClick={handleSend} loading={sending}>
                Send Reply
              </Button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
