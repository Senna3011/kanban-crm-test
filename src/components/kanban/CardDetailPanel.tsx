'use client';

import { useState, useEffect, useMemo } from 'react';
import type { CardData, ActivityLogData, DraftData } from '@/types';
import Button from '@/components/ui/Button';
import { sendDraft } from '@/server/actions/draft';
import toast, { Toaster } from 'react-hot-toast';

/* ------------------------------------------------------------------ */
/*  Helpers & Types                                                   */
/* ------------------------------------------------------------------ */

interface TimelineMessage {
  id: string;
  type: 'received' | 'sent' | 'activity' | 'draft';
  title: string;
  sender: string;
  senderEmail?: string;
  body: string;
  timestamp: Date;
  meta?: Record<string, unknown>;
  isCurrent?: boolean;
}

function buildTimelineMessages(
  threadCards: any[],
  activityLogs: ActivityLogData[],
  currentCard: CardData
): TimelineMessage[] {
  const items: TimelineMessage[] = [];
  const shownCardIds = new Set<string>();
  const shownDraftIds = new Set<string>();

  // Add all thread cards
  for (const tc of threadCards) {
    shownCardIds.add(tc.id);

    if (tc.type === 'sent') {
      shownDraftIds.add(tc.id);
      items.push({
        id: `thread-${tc.id}`,
        type: 'sent',
        title: 'Outgoing Reply',
        sender: tc.from || 'Team',
        body: tc.body || '',
        timestamp: new Date(tc.timestamp || Date.now()),
      });
    } else {
      items.push({
        id: `thread-${tc.id}`,
        type: 'received',
        title: 'Client Email',
        sender: tc.from || 'Client',
        senderEmail: tc.fromEmail,
        body: tc.body || '',
        timestamp: new Date(tc.timestamp || Date.now()),
        isCurrent: tc.id === currentCard.id,
      });
    }
  }

  // If threadCards is empty or did not include current card, add current card
  if (!shownCardIds.has(currentCard.id)) {
    items.push({
      id: `current-${currentCard.id}`,
      type: 'received',
      title: 'Client Email',
      sender: currentCard.fromName || currentCard.fromEmail.split('@')[0],
      senderEmail: currentCard.fromEmail,
      body: currentCard.bodyText || '',
      timestamp: new Date(currentCard.lastActivityAt || Date.now()),
      isCurrent: true,
    });
  }

  // Add system activities (skip redundant email received/sent events already captured as bubbles)
  const emailLogTypes = new Set(['email_received', 'email_sent', 'email_reply_received']);
  for (const log of activityLogs) {
    const c = log.content as any;

    if (emailLogTypes.has(log.type)) {
      if (c?.cardId && shownCardIds.has(c.cardId)) continue;
      if (c?.draftId && shownDraftIds.has(c.draftId)) continue;
    }

    let type: TimelineMessage['type'] = 'activity';
    let title = log.type.replace(/_/g, ' ');
    let summary = '';

    switch (log.type) {
      case 'ai_reclassified':
        title = 'AI Auto-Classified';
        summary = `Moved from "${c?.from || 'Unreads'}" to "${c?.to || 'Leads'}" (${c?.confidence || 0}% confidence)`;
        break;
      case 'draft_created':
        type = 'draft';
        title = 'Draft Created';
        summary = 'AI reply draft generated';
        break;
      case 'card_moved':
        title = 'Card Moved';
        summary = c?.from ? `Moved from "${c.from}" to "${c.to}"` : `Moved to "${c?.to || 'column'}"`;
        break;
      case 'user_edited':
        title = 'Draft Edited';
        summary = 'Reply draft customized by team';
        break;
      default:
        summary = typeof c === 'object' ? JSON.stringify(c) : String(c || log.type);
    }

    items.push({
      id: `log-${log.id}`,
      type,
      title,
      sender: 'System',
      body: summary,
      timestamp: new Date(log.createdAt),
      meta: c,
    });
  }

  // Sort chronological (oldest to newest for natural chat reading flow)
  items.sort((a, b) => a.timestamp.getTime() - b.timestamp.getTime());
  return items;
}

function formatChatTime(date: Date): string {
  const now = Date.now();
  const diffMs = now - date.getTime();
  const diffMin = Math.floor(diffMs / 60000);
  if (diffMin < 1) return 'Just now';
  if (diffMin < 60) return `${diffMin}m ago`;
  const diffHr = Math.floor(diffMin / 60);
  if (diffHr < 24) return `${diffHr}h ago`;
  const diffDay = Math.floor(diffHr / 24);
  if (diffDay === 1) return 'Yesterday ' + date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  if (diffDay < 7) return `${diffDay}d ago`;
  return date.toLocaleDateString(undefined, { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' });
}

function getAvatarColor(str: string) {
  const gradients = [
    'from-blue-600 to-indigo-600 text-white',
    'from-emerald-600 to-teal-600 text-white',
    'from-purple-600 to-pink-600 text-white',
    'from-amber-600 to-orange-600 text-white',
    'from-rose-600 to-red-600 text-white',
  ];
  let hash = 0;
  for (let i = 0; i < str.length; i++) {
    hash = str.charCodeAt(i) + ((hash << 5) - hash);
  }
  return gradients[Math.abs(hash) % gradients.length];
}

/* ------------------------------------------------------------------ */
/*  WhatsApp / Trello Style Chat Bubble Component                     */
/* ------------------------------------------------------------------ */

function ChatBubble({ message }: { message: TimelineMessage }) {
  const [expanded, setExpanded] = useState(false);

  // System Activity event (centered pill)
  if (message.type === 'activity' || message.type === 'draft') {
    return (
      <div className="flex items-center justify-center my-2">
        <div className="inline-flex items-center gap-2 px-3 py-1 bg-slate-100 border border-slate-200/80 rounded-full text-[11px] text-slate-600 font-medium shadow-2xs">
          <span className="w-1.5 h-1.5 rounded-full bg-slate-400" />
          <span className="font-semibold text-slate-700">{message.title}:</span>
          <span>{message.body}</span>
          <span className="text-slate-400 text-[10px]">• {formatChatTime(message.timestamp)}</span>
        </div>
      </div>
    );
  }

  const isSent = message.type === 'sent';
  const rawText = message.body || '';
  const isLong = rawText.length > 250;
  const displayText = expanded || !isLong ? rawText : rawText.slice(0, 240) + '...';

  const avatarInitial = (message.sender || '?').charAt(0).toUpperCase();
  const avatarBg = isSent ? 'from-primary-600 to-indigo-700 text-white' : getAvatarColor(message.sender);

  return (
    <div className={`flex items-start gap-2.5 my-3 ${isSent ? 'flex-row-reverse' : 'flex-row'}`}>
      {/* Avatar */}
      <div
        className={`w-8 h-8 rounded-full flex items-center justify-center text-xs font-bold shadow-2xs bg-gradient-to-br flex-shrink-0 ${avatarBg}`}
      >
        {avatarInitial}
      </div>

      {/* Bubble Container */}
      <div
        className={`max-w-[85%] sm:max-w-[78%] rounded-2xl p-3.5 shadow-2xs transition-all ${
          isSent
            ? 'bg-primary-50/90 border border-primary-200/80 rounded-tr-xs text-slate-900'
            : 'bg-white border border-slate-200/90 rounded-tl-xs text-slate-900'
        }`}
      >
        {/* Bubble Header: Sender, Badge & Timestamp */}
        <div className="flex items-center justify-between gap-3 mb-1.5 border-b border-slate-100/80 pb-1">
          <div className="flex items-center gap-1.5 min-w-0">
            <span className="font-bold text-xs text-slate-900 truncate">{message.sender}</span>
            <span
              className={`text-[9px] font-bold uppercase tracking-wider px-1.5 py-0.2 rounded-full border ${
                isSent
                  ? 'bg-primary-100 text-primary-800 border-primary-200'
                  : 'bg-slate-100 text-slate-700 border-slate-200'
              }`}
            >
              {isSent ? 'Outgoing' : 'Inbound'}
            </span>
          </div>
          <span className="text-[10px] text-slate-400 font-medium whitespace-nowrap">
            {formatChatTime(message.timestamp)}
          </span>
        </div>

        {/* Message Body (50+ words with Read More toggle) */}
        <div className="text-xs sm:text-sm text-slate-700 whitespace-pre-wrap leading-relaxed">
          {displayText}
        </div>

        {/* Inline Read More / Show Less Toggle */}
        {isLong && (
          <button
            type="button"
            onClick={() => setExpanded(!expanded)}
            className="mt-1.5 text-xs font-bold text-primary-600 hover:text-primary-800 transition-colors flex items-center gap-1"
          >
            {expanded ? 'Show less ↑' : '... Read more ↓'}
          </button>
        )}
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/*  Main Card Detail Panel Component                                  */
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
  const [backgroundLoading, setBackgroundLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [fromAddresses, setFromAddresses] = useState<string[]>([]);
  const [selectedFrom, setSelectedFrom] = useState('');
  const [cardData, setCardData] = useState<any>(card);
  const [threadCards, setThreadCards] = useState<any[]>([]);
  const [isUnread, setIsUnread] = useState(card.status === 'unread');
  const [showHtml, setShowHtml] = useState(true);
  const [cardHtml, setCardHtml] = useState('');
  const [activeTab, setActiveTab] = useState<'message' | 'activity'>('message');
  const [copiedEmail, setCopiedEmail] = useState(false);
  const [tenantUsers, setTenantUsers] = useState<any[]>([]);
  const [assignedUserId, setAssignedUserId] = useState<string>(card.assignedToId || '');
  const [updatingAssignee, setUpdatingAssignee] = useState(false);

  // Initialize draft immediately
  useEffect(() => {
    setDraftBody(
      `Hi ${card.fromName || card.fromEmail.split('@')[0]},\n\nThank you for reaching out to us. I'd be happy to share more details and discuss how we can help.\n\nWould you be available for a brief call this week?\n\nBest regards`
    );
  }, [card]);

  // Load team users for assignee dropdown
  useEffect(() => {
    fetch('/api/users')
      .then((r) => r.json())
      .then((users) => {
        if (Array.isArray(users)) setTenantUsers(users);
      })
      .catch(() => {});
  }, []);

  // Fetch detailed data in background without blocking instant modal render
  useEffect(() => {
    async function loadBackgroundDetails() {
      try {
        setBackgroundLoading(true);
        const [cardRes, configRes, threadRes] = await Promise.allSettled([
          fetch(`/api/cards/${card.id}`),
          fetch(`/api/email-configs`),
          fetch(`/api/cards/${card.id}/thread`),
        ]);

        if (cardRes.status === 'fulfilled' && cardRes.value.ok) {
          const data = await cardRes.value.json();
          setActivityLogs(data.activityLogs || []);
          setCardData(data);
          setCardHtml(data.bodyHtml || '');

          const drafts = data.drafts || [];
          const pending = drafts.find((d: DraftData) => d.status === 'pending');
          if (pending) {
            setDraftId(pending.id);
            setDraftBody(pending.body);
          }
        }

        if (configRes.status === 'fulfilled' && configRes.value.ok) {
          const configs = await configRes.value.json();
          const addresses = configs.map((c: any) => c.smtpUser).filter(Boolean);
          const uniqueAddrs = [...new Set(addresses)] as string[];
          setFromAddresses(uniqueAddrs);
          if (uniqueAddrs.length > 0 && !selectedFrom) setSelectedFrom(uniqueAddrs[0]);
        }

        if (threadRes.status === 'fulfilled' && threadRes.value.ok) {
          const thread = await threadRes.value.json();
          if (Array.isArray(thread)) setThreadCards(thread);
        }
      } catch (err: any) {
        console.error('[CardDetailPanel] Background load error:', err);
      } finally {
        setBackgroundLoading(false);
      }
    }
    loadBackgroundDetails();
  }, [card.id, selectedFrom]);

  // Keyboard shortcut: Escape to close modal
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [onClose]);

  const timelineMessages = useMemo(
    () => buildTimelineMessages(threadCards, activityLogs, card),
    [threadCards, activityLogs, card]
  );

  async function handleAssignUser(newUserId: string) {
    setUpdatingAssignee(true);
    try {
      const res = await fetch(`/api/cards/${card.id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ assignedToId: newUserId || null }),
      });
      if (res.ok) {
        setAssignedUserId(newUserId);
        toast.success(newUserId ? 'Assignee updated' : 'Assignee removed');
        window.dispatchEvent(new Event('board-refresh'));
      }
    } catch {
      toast.error('Failed to update assignee');
    } finally {
      setUpdatingAssignee(false);
    }
  }

  function copyToClipboard(text: string) {
    navigator.clipboard.writeText(text);
    setCopiedEmail(true);
    toast.success('Email copied to clipboard!');
    setTimeout(() => setCopiedEmail(false), 2000);
  }

  function applyTemplate(type: 'meeting' | 'pricing' | 'followup' | 'proposal') {
    const name = card.fromName || card.fromEmail.split('@')[0];
    let template = '';
    if (type === 'meeting') {
      template = `Hi ${name},\n\nThank you for reaching out! We would love to discuss your project requirements in detail. Are you available for a quick 15-minute discovery call tomorrow or later this week?\n\nBest regards`;
    } else if (type === 'pricing') {
      template = `Hi ${name},\n\nThank you for your interest! I'd be happy to provide our customized pricing tiers and package details. Could you let me know your estimated timeline and specific scope?\n\nBest regards`;
    } else if (type === 'followup') {
      template = `Hi ${name},\n\nJust following up on our previous conversation to see if you have any questions or if you would like us to prepare a tailored proposal for you.\n\nBest regards`;
    } else if (type === 'proposal') {
      template = `Hi ${name},\n\nWe have prepared our scope of work and strategy proposal for your review. Please let us know when would be a convenient time to walk through the details together.\n\nBest regards`;
    }
    setDraftBody(template);
    toast.success('Template applied!');
  }

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
      toast.success('Email sent successfully!');
      const updatedRes = await fetch(`/api/cards/${card.id}`);
      if (updatedRes.ok) {
        const updatedData = await updatedRes.json();
        setActivityLogs(updatedData.activityLogs || []);
      }
      window.dispatchEvent(new Event('board-refresh'));
    } catch (e: any) {
      toast.error(e.message || 'Failed to send email');
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
      if (!boardId) {
        toast.error('Board not found');
        return;
      }

      const columnsRes = await fetch(`/api/columns?boardId=${boardId}`);
      const columns = await columnsRes.json();
      const generalCol = columns.find((c: any) => c.title === 'General');
      if (!generalCol) {
        toast.error('General column not found');
        return;
      }

      await fetch(`/api/cards/${card.id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ columnId: generalCol.id }),
      });
      toast.success('Moved to General — marked as not a lead', { duration: 2000 });
      window.dispatchEvent(new Event('board-refresh'));
      setTimeout(() => onClose(), 100);
    } catch (e: any) {
      toast.error(e.message || 'Failed to move');
    }
  }

  const columnName = cardData?.column?.title || '';
  const followUpDate = card.nextFollowUpAt ? new Date(card.nextFollowUpAt) : null;
  const isOverdue = followUpDate ? followUpDate < new Date() : false;
  const aiMeta = cardData?.metadata as any;

  const senderName = card.fromName || card.fromEmail.split('@')[0];
  const avatarGradient = getAvatarColor(card.fromEmail || senderName);

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center pt-2 sm:pt-10 p-2 sm:p-4">
      <Toaster position="top-right" />
      {/* Backdrop */}
      <div className="absolute inset-0 bg-slate-900/50 backdrop-blur-xs transition-opacity" onClick={onClose} />

      {/* Modal Card Container */}
      <div className="relative w-full max-w-2xl bg-white rounded-2xl shadow-2xl border border-slate-200 flex flex-col max-h-[94vh] sm:max-h-[90vh] overflow-hidden">
        {/* Header */}
        <div className="px-4 sm:px-6 py-3.5 border-b border-slate-200/80 bg-slate-50/60 flex items-start justify-between gap-3 flex-shrink-0">
          <div className="flex items-start gap-3 min-w-0 flex-1">
            <div
              className={`w-9 h-9 rounded-xl flex items-center justify-center text-xs font-bold shadow-xs bg-gradient-to-br flex-shrink-0 ${avatarGradient}`}
            >
              {senderName.charAt(0).toUpperCase()}
            </div>
            <div className="min-w-0 flex-1">
              <h2 className="text-base sm:text-lg font-bold text-slate-900 leading-snug truncate">
                {card.subject || '(No Subject)'}
              </h2>
              <div className="flex items-center gap-2 mt-1 flex-wrap">
                <button
                  onClick={() => copyToClipboard(card.fromEmail)}
                  className="inline-flex items-center gap-1 text-xs text-slate-600 hover:text-primary-600 transition-colors group"
                  title="Click to copy email"
                >
                  <span className="font-semibold">{card.fromName ? `${card.fromName} (${card.fromEmail})` : card.fromEmail}</span>
                  {copiedEmail ? (
                    <span className="text-[10px] text-emerald-600 font-bold">✓ Copied</span>
                  ) : (
                    <svg className="w-3 h-3 text-slate-400 group-hover:text-primary-600" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z" />
                    </svg>
                  )}
                </button>

                {columnName && (
                  <span className="inline-flex items-center gap-1.5 text-[11px] font-semibold text-slate-700 bg-slate-200/80 px-2.5 py-0.5 rounded-full">
                    <span className="w-1.5 h-1.5 rounded-full bg-primary-600" />
                    {columnName}
                  </span>
                )}

                {followUpDate && (
                  <span
                    className={`inline-flex items-center gap-1 text-[11px] font-semibold px-2 py-0.5 rounded-full border ${
                      isOverdue
                        ? 'bg-rose-50 text-rose-700 border-rose-200 animate-pulse'
                        : 'bg-primary-50 text-primary-700 border-primary-200'
                    }`}
                  >
                    <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
                    </svg>
                    {isOverdue ? 'Overdue' : `Follow-up: ${followUpDate.toLocaleDateString(undefined, { month: 'short', day: 'numeric' })}`}
                  </span>
                )}

                {/* Assignee Dropdown */}
                <div className="inline-flex items-center gap-1.5 bg-indigo-50/80 border border-indigo-200/80 px-2 py-0.5 rounded-lg text-xs">
                  <span className="text-[11px] font-semibold text-indigo-900">👤 Assignee:</span>
                  <select
                    value={assignedUserId}
                    disabled={updatingAssignee}
                    onChange={(e) => handleAssignUser(e.target.value)}
                    className="bg-transparent text-indigo-800 font-medium text-[11px] focus:outline-none cursor-pointer"
                  >
                    <option value="">Unassigned</option>
                    {tenantUsers.map((u) => (
                      <option key={u.id} value={u.id}>
                        {u.name || u.email} ({u.role})
                      </option>
                    ))}
                  </select>
                </div>
              </div>
            </div>
          </div>

          {/* Header Action Buttons */}
          <div className="flex items-center gap-1 flex-shrink-0">
            <button
              onClick={handleNotALead}
              className="text-xs px-2.5 py-1 rounded-lg bg-amber-50 text-amber-800 border border-amber-200 hover:bg-amber-100 transition-colors font-semibold shadow-2xs"
              title="Move to General (Not a sales lead)"
            >
              Not a lead
            </button>
            <button
              onClick={handleToggleUnread}
              className="p-1.5 rounded-lg hover:bg-slate-200/70 text-slate-500 hover:text-slate-800 transition-colors"
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
            <button
              onClick={onClose}
              className="p-1.5 rounded-lg hover:bg-slate-200/70 text-slate-400 hover:text-slate-700 transition-colors"
              title="Close (Esc)"
            >
              <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          </div>
        </div>

        {/* AI Insight Banner */}
        {aiMeta && (
          <div className="px-4 sm:px-6 py-2.5 bg-gradient-to-r from-indigo-50/70 via-blue-50/50 to-slate-50 border-b border-indigo-100 flex items-center justify-between gap-3 text-xs flex-shrink-0">
            <div className="flex items-center gap-2 flex-wrap min-w-0">
              <span className="font-bold text-indigo-900 flex items-center gap-1">
                <span>🤖</span> AI Analysis:
              </span>
              <span
                className={`px-2 py-0.5 rounded-full font-bold uppercase tracking-wider text-[10px] ${
                  aiMeta.category === 'lead'
                    ? 'bg-emerald-100 text-emerald-800'
                    : aiMeta.category === 'spam'
                    ? 'bg-rose-100 text-rose-800'
                    : 'bg-slate-200 text-slate-800'
                }`}
              >
                {aiMeta.category || 'general'}
              </span>
              {typeof aiMeta.confidence === 'number' && (
                <span className="text-slate-600 font-medium">{aiMeta.confidence}% confidence</span>
              )}
              {aiMeta.interestLevel && (
                <span className="text-slate-600">
                  • Interest: <strong>{aiMeta.interestLevel}</strong>
                </span>
              )}
            </div>
            {aiMeta.reason && (
              <span className="text-slate-500 italic truncate max-w-xs hidden sm:inline" title={aiMeta.reason}>
                &ldquo;{aiMeta.reason}&rdquo;
              </span>
            )}
          </div>
        )}

        {/* View Tabs */}
        <div className="flex items-center gap-2 px-4 sm:px-6 pt-3 border-b border-slate-100 bg-white flex-shrink-0">
          <button
            onClick={() => setActiveTab('message')}
            className={`pb-2.5 px-2 text-xs font-bold border-b-2 transition-all ${
              activeTab === 'message'
                ? 'border-primary-600 text-primary-600'
                : 'border-transparent text-slate-500 hover:text-slate-800'
            }`}
          >
            Email Content
          </button>
          <button
            onClick={() => setActiveTab('activity')}
            className={`pb-2.5 px-2 text-xs font-bold border-b-2 transition-all flex items-center gap-1.5 ${
              activeTab === 'activity'
                ? 'border-primary-600 text-primary-600'
                : 'border-transparent text-slate-500 hover:text-slate-800'
            }`}
          >
            Thread & Activity
            {timelineMessages.length > 0 && (
              <span className="px-1.5 py-0.2 rounded-full text-[10px] bg-slate-100 text-slate-600 font-bold">
                {timelineMessages.length}
              </span>
            )}
          </button>
        </div>

        {/* Scrollable Content Body (Instant Rendered) */}
        <div className="flex-1 overflow-y-auto p-4 sm:p-6 space-y-4">
          {error ? (
            <div className="text-center py-12 text-rose-500 text-xs">
              <p>{error}</p>
            </div>
          ) : activeTab === 'message' ? (
            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <span className="text-xs font-bold text-slate-400 uppercase tracking-wider">Message Content</span>
                {cardHtml && (
                  <button
                    onClick={() => setShowHtml(!showHtml)}
                    className="text-xs font-semibold text-primary-600 hover:text-primary-800 transition-colors"
                  >
                    {showHtml ? 'Switch to Plain Text' : 'View HTML Email'}
                  </button>
                )}
              </div>

              {showHtml && cardHtml ? (
                <div className="bg-white border border-slate-200 rounded-xl overflow-hidden shadow-xs">
                  <iframe
                    srcDoc={cardHtml}
                    className="w-full border-0"
                    style={{ minHeight: 240, maxHeight: 420 }}
                    sandbox="allow-same-origin"
                    title="Email HTML"
                  />
                </div>
              ) : card.bodyText ? (
                <div className="bg-slate-50 rounded-xl p-4 text-xs sm:text-sm text-slate-800 whitespace-pre-wrap leading-relaxed border border-slate-200/90 font-mono">
                  {card.bodyText}
                </div>
              ) : (
                <p className="text-xs text-slate-400 italic">No description available</p>
              )}
            </div>
          ) : (
            /* Thread & Activity: WhatsApp / Trello Comment Stream Style */
            <div className="space-y-1">
              <div className="flex items-center justify-between mb-2">
                <span className="text-xs font-bold text-slate-400 uppercase tracking-wider">
                  Conversation & Activity History
                </span>
                {backgroundLoading && (
                  <span className="text-[11px] text-slate-400 flex items-center gap-1">
                    <span className="w-1.5 h-1.5 rounded-full bg-primary-600 animate-pulse" />
                    Syncing thread...
                  </span>
                )}
              </div>

              {timelineMessages.length === 0 ? (
                <p className="text-xs text-slate-400 text-center py-8">No conversation history yet</p>
              ) : (
                <div className="space-y-1 py-1">
                  {timelineMessages.map((msg) => (
                    <ChatBubble key={msg.id} message={msg} />
                  ))}
                </div>
              )}
            </div>
          )}
        </div>

        {/* Quick Reply Composer (Sticky Bottom) */}
        {!error && (
          <div className="border-t border-slate-200 bg-slate-50/80 px-4 sm:px-6 py-3.5 flex-shrink-0 space-y-2.5">
            <div className="flex items-center justify-between flex-wrap gap-2">
              <span className="text-xs font-bold text-slate-600 uppercase tracking-wider">Quick Reply</span>

              {/* Template shortcuts */}
              <div className="flex items-center gap-1.5 overflow-x-auto pb-0.5">
                <button
                  type="button"
                  onClick={() => applyTemplate('meeting')}
                  className="px-2 py-0.5 text-[11px] font-semibold bg-white border border-slate-200 rounded-lg hover:bg-slate-100 text-slate-700 shadow-2xs transition-all"
                >
                  📅 Meeting
                </button>
                <button
                  type="button"
                  onClick={() => applyTemplate('pricing')}
                  className="px-2 py-0.5 text-[11px] font-semibold bg-white border border-slate-200 rounded-lg hover:bg-slate-100 text-slate-700 shadow-2xs transition-all"
                >
                  💰 Pricing
                </button>
                <button
                  type="button"
                  onClick={() => applyTemplate('followup')}
                  className="px-2 py-0.5 text-[11px] font-semibold bg-white border border-slate-200 rounded-lg hover:bg-slate-100 text-slate-700 shadow-2xs transition-all"
                >
                  ⚡ Follow-up
                </button>
                <button
                  type="button"
                  onClick={() => applyTemplate('proposal')}
                  className="px-2 py-0.5 text-[11px] font-semibold bg-white border border-slate-200 rounded-lg hover:bg-slate-100 text-slate-700 shadow-2xs transition-all"
                >
                  🤝 Proposal
                </button>
              </div>
            </div>

            <textarea
              className="w-full h-24 sm:h-28 px-3.5 py-2.5 border border-slate-200 rounded-xl text-xs sm:text-sm text-slate-800 focus:outline-none focus:ring-2 focus:ring-primary-500/20 focus:border-primary-500 resize-none bg-white shadow-2xs transition-all leading-relaxed"
              value={draftBody}
              onChange={(e) => setDraftBody(e.target.value)}
              placeholder="Write your email reply..."
            />

            <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-2.5">
              <div className="flex items-center gap-2">
                {fromAddresses.length > 0 && (
                  <select
                    className="w-full sm:w-auto px-2.5 py-1.5 border border-slate-200 rounded-lg text-xs font-medium text-slate-700 focus:outline-none focus:ring-2 focus:ring-primary-500/20 focus:border-primary-500 bg-white"
                    value={selectedFrom}
                    onChange={(e) => setSelectedFrom(e.target.value)}
                  >
                    {fromAddresses.map((addr) => (
                      <option key={addr} value={addr}>
                        From: {addr}
                      </option>
                    ))}
                  </select>
                )}
              </div>

              <Button size="sm" onClick={handleSend} loading={sending} className="w-full sm:w-auto font-bold shadow-xs">
                Send Reply & Advance Stage →
              </Button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
