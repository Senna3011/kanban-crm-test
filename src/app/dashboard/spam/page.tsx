'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';
import toast, { Toaster } from 'react-hot-toast';

type SpamLogItem = {
  id: string;
  fromEmail: string;
  fromName: string | null;
  subject: string;
  bodyPreview: string | null;
  reason: string | null;
  receivedAt: string;
  recoveredToId: string | null;
  emailConfig: { name: string };
};

type Board = { id: string; title: string };
type Column = { id: string; title: string; boardId: string };

export default function SpamBoxPage() {
  const [spamLogs, setSpamLogs] = useState<SpamLogItem[]>([]);
  const [boards, setBoards] = useState<Board[]>([]);
  const [columns, setColumns] = useState<Column[]>([]);
  const [selectedBoard, setSelectedBoard] = useState('');
  const [loading, setLoading] = useState(true);
  const [recovering, setRecovering] = useState<string | null>(null);

  useEffect(() => {
    Promise.all([
      fetch('/api/spam').then(r => r.json()),
      fetch('/api/boards').then(r => r.json()),
    ]).then(([spam, b]) => {
      setSpamLogs(spam);
      setBoards(b);
      if (b.length > 0) setSelectedBoard(b[0].id);
    }).finally(() => setLoading(false));
  }, []);

  useEffect(() => {
    if (!selectedBoard) return;
    fetch(`/api/columns?boardId=${selectedBoard}`).then(r => r.json()).then(setColumns);
  }, [selectedBoard]);

  async function recover(log: SpamLogItem, columnId: string) {
    setRecovering(log.id);
    try {
      const res = await fetch('/api/spam', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ spamLogId: log.id, columnId }),
      });
      if (!res.ok) throw new Error('Failed to recover');
      toast.success('Email recovered to board');
      setSpamLogs(prev => prev.map(s => s.id === log.id ? { ...s, recoveredToId: 'recovered' } : s));
    } catch (err: any) {
      toast.error(err.message || 'Recovery failed');
    } finally { setRecovering(null); }
  }

  if (loading) return <div className="h-full flex items-center justify-center"><div className="animate-spin h-8 w-8 border-4 border-primary-200 border-t-primary-600 rounded-full" /></div>;

  return (
    <div className="max-w-4xl space-y-6">
      <Toaster />
      <div className="flex items-start justify-between gap-4">
        <div><h1 className="text-2xl font-bold text-gray-900">Spam Box</h1><p className="text-gray-500 mt-1">Skipped emails. Recover to any board if needed.</p></div>
        <Link href="/dashboard" className="text-sm text-primary-700 hover:underline">← Back to board</Link>
      </div>

      {spamLogs.length === 0 ? (
        <div className="bg-white rounded-xl border border-gray-200 p-12 text-center text-gray-500">
          <div className="text-4xl mb-3">🛡️</div>
          <p>No spam emails logged yet.</p>
        </div>
      ) : (
        <div className="space-y-3">
          {spamLogs.map(log => (
            <div key={log.id} className="bg-white rounded-xl border border-gray-200 p-4">
              <div className="flex items-start justify-between gap-4">
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 mb-1">
                    <span className="font-medium text-gray-900 truncate">{log.subject}</span>
                    {log.recoveredToId && <span className="px-2 py-0.5 text-xs bg-green-100 text-green-700 rounded-full">Recovered</span>}
                  </div>
                  <p className="text-sm text-gray-500">From: {log.fromName ? `${log.fromName} <${log.fromEmail}>` : log.fromEmail}</p>
                  <p className="text-sm text-gray-400 mt-1">via {log.emailConfig.name} • {new Date(log.receivedAt).toLocaleString()}</p>
                  {log.bodyPreview && <p className="text-sm text-gray-500 mt-2 line-clamp-2">{log.bodyPreview}</p>}
                </div>
                {!log.recoveredToId && (
                  <div className="flex items-center gap-2 shrink-0">
                    <select
                      className="text-sm border border-gray-300 rounded-lg px-2 py-1"
                      value={selectedBoard}
                      onChange={(e) => setSelectedBoard(e.target.value)}
                    >
                      {boards.map(b => <option key={b.id} value={b.id}>{b.title}</option>)}
                    </select>
                    <select
                      className="text-sm border border-gray-300 rounded-lg px-2 py-1"
                      id={`col-${log.id}`}
                    >
                      {columns.map(c => <option key={c.id} value={c.id}>{c.title}</option>)}
                    </select>
                    <button
                      onClick={() => {
                        const sel = document.getElementById(`col-${log.id}`) as HTMLSelectElement;
                        if (sel) recover(log, sel.value);
                      }}
                      disabled={recovering === log.id}
                      className="px-3 py-1 text-sm bg-primary-600 text-white rounded-lg hover:bg-primary-700 disabled:opacity-50"
                    >
                      {recovering === log.id ? '...' : 'Recover'}
                    </button>
                  </div>
                )}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
