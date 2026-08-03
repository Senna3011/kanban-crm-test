'use client';

import { useState, useEffect } from 'react';
import type { CardData, ActivityLogData, DraftData } from '@/types';
import Button from '@/components/ui/Button';
import { sendDraft, editDraft } from '@/server/actions/draft';
import toast, { Toaster } from 'react-hot-toast';

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

  useEffect(() => {
    async function loadCardDetails() {
      try {
        setLoading(true);
        const [cardRes, configRes] = await Promise.all([
          fetch(`/api/cards/${card.id}`),
          fetch(`/api/email-configs`),
        ]);
        if (!cardRes.ok) throw new Error('Failed to load card');
        const data = await cardRes.json();

        setActivityLogs(data.activityLogs || []);

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
          // Generate default draft text
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

  async function handleSend() {
    if (!draftId) {
      toast.error('No draft to send');
      return;
    }
    setSending(true);
    try {
      await sendDraft(draftId, selectedFrom || undefined);
      toast.success('Email sent!');
      window.dispatchEvent(new Event('board-refresh'));
    } catch (e: any) {
      toast.error(e.message);
    } finally {
      setSending(false);
    }
  }

  async function handleEdit() {
    if (!draftId) return;
    try {
      await editDraft(draftId, draftBody);
      toast.success('Draft saved');
    } catch (e: any) {
      toast.error(e.message);
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

  return (
    <div className="fixed inset-0 z-50 flex justify-end">
      <Toaster position="top-right" />
      <div className="absolute inset-0 bg-black/30" onClick={onClose} />
      <div className="relative w-full max-w-lg bg-white shadow-xl flex flex-col">
        {/* Header */}
        <div className="p-4 border-b border-gray-200 flex items-start justify-between">
          <div className="min-w-0 flex-1">
            <h2 className="font-semibold text-gray-900 truncate">{card.subject}</h2>
            <p className="text-sm text-gray-500 truncate">
              {card.fromName ? `${card.fromName} <${card.fromEmail}>` : card.fromEmail}
            </p>
          </div>
          <div className="flex items-center gap-2 ml-4">
            <button
              onClick={handleDelete}
              disabled={deleting}
              className="text-red-400 hover:text-red-600 text-sm px-2 py-1 rounded hover:bg-red-50 disabled:opacity-50"
              title="Delete card"
            >
              {deleting ? '...' : '🗑️'}
            </button>
            <button onClick={onClose} className="text-gray-400 hover:text-gray-600 text-xl">&times;</button>
          </div>
        </div>

        <div className="flex-1 overflow-y-auto p-4 space-y-6">
          {loading ? (
            <div className="flex items-center justify-center py-12">
              <div className="animate-spin h-6 w-6 border-2 border-primary-200 border-t-primary-600 rounded-full" />
            </div>
          ) : error ? (
            <div className="text-center py-8 text-red-500">
              <p>{error}</p>
            </div>
          ) : (
            <>
              {/* Email body */}
              <section>
                <h3 className="text-sm font-semibold text-gray-700 mb-2">Original Email</h3>
                <div className="bg-gray-50 rounded-lg p-3 text-sm text-gray-700 whitespace-pre-wrap">
                  {card.bodyText || '(No text content)'}
                </div>
              </section>

              {/* Activity Log */}
              <section>
                <h3 className="text-sm font-semibold text-gray-700 mb-2">Activity</h3>
                {activityLogs.length === 0 ? (
                  <p className="text-sm text-gray-400 text-center py-4">No activity yet</p>
                ) : (
                  <div className="space-y-3">
                    {activityLogs.map((log) => (
                      <div key={log.id} className="flex gap-3 text-sm">
                        <span className="text-xs text-gray-400 w-16 pt-0.5 flex-shrink-0">
                          {new Date(log.createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                        </span>
                        <div className="flex-1 bg-gray-50 rounded-lg p-3">
                          <span className="text-xs text-gray-500 uppercase tracking-wide">
                            {log.type.replace(/_/g, ' ')}
                          </span>
                          <p className="text-gray-700 mt-1 text-xs">
                            {typeof log.content === 'string' ? log.content : JSON.stringify(log.content)}
                          </p>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </section>

              {/* Draft Reply */}
              <section>
                <h3 className="text-sm font-semibold text-gray-700 mb-2">Draft Reply</h3>
                <div className="bg-gray-50 rounded-lg p-4 space-y-3">
                  <textarea
                    className="w-full h-40 px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary-500 resize-none"
                    value={draftBody}
                    onChange={(e) => setDraftBody(e.target.value)}
                    placeholder="Write your reply..."
                  />
                  {fromAddresses.length > 1 && (
                    <div className="space-y-1">
                      <label className="text-xs font-medium text-gray-600">Send from</label>
                      <select
                        className="w-full px-3 py-1.5 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary-500"
                        value={selectedFrom}
                        onChange={(e) => setSelectedFrom(e.target.value)}
                      >
                        {fromAddresses.map((addr) => (
                          <option key={addr} value={addr}>{addr}</option>
                        ))}
                      </select>
                    </div>
                  )}
                  <div className="flex items-center gap-2">
                    <Button size="sm" onClick={handleSend} loading={sending}>
                      Send Now
                    </Button>
                    <Button size="sm" variant="secondary" onClick={handleEdit}>
                      Save Draft
                    </Button>
                    <Button size="sm" variant="ghost" onClick={() => {
                      setDraftBody(`Hi ${card.fromName || card.fromEmail},\n\nI noticed your interest in our services. Would you like to schedule a call?\n\nBest regards`);
                    }}>
                      Reset
                    </Button>
                  </div>
                </div>
              </section>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
