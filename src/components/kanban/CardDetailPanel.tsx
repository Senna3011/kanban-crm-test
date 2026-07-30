'use client';

import { useState } from 'react';
import type { CardData } from '@/types';
import Button from '@/components/ui/Button';
import { sendDraft, editDraft } from '@/server/actions/draft';
import toast from 'react-hot-toast';

interface Props {
  card: CardData;
  onClose: () => void;
}

export default function CardDetailPanel({ card, onClose }: Props) {
  const [draftBody, setDraftBody] = useState(
    `Hi ${card.fromName || card.fromEmail},\n\nI noticed your interest in our services. Would you like to schedule a call?\n\nBest regards`
  );
  const [sending, setSending] = useState(false);

  async function handleSend() {
    setSending(true);
    try {
      await sendDraft('draft-1');
      toast.success('Email sent!');
    } catch (e: any) {
      toast.error(e.message);
    } finally {
      setSending(false);
    }
  }

  const mockActivity = [
    {
      type: 'email_received',
      content: `Email from ${card.fromName || card.fromEmail}`,
      time: new Date(card.createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
    },
  ];

  return (
    <div className="fixed inset-0 z-50 flex justify-end">
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
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600 text-xl ml-4">&times;</button>
        </div>

        <div className="flex-1 overflow-y-auto p-4 space-y-6">
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
            <div className="space-y-3">
              {mockActivity.map((log, i) => (
                <div key={i} className="flex gap-3 text-sm">
                  <span className="text-xs text-gray-400 w-16 pt-0.5 flex-shrink-0">{log.time}</span>
                  <div className="flex-1 bg-gray-50 rounded-lg p-3">
                    <span className="text-xs text-gray-500 uppercase tracking-wide">{log.type.replace(/_/g, ' ')}</span>
                    <p className="text-gray-700 mt-1">{log.content}</p>
                  </div>
                </div>
              ))}
            </div>
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
              <div className="flex items-center gap-2">
                <Button size="sm" onClick={handleSend} loading={sending}>
                  Send Now
                </Button>
                <Button size="sm" variant="secondary">
                  Edit Draft
                </Button>
                <Button size="sm" variant="ghost">
                  AI Regenerate
                </Button>
              </div>
            </div>
          </section>
        </div>
      </div>
    </div>
  );
}
