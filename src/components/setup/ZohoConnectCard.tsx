'use client';

import { useState } from 'react';
import Button from '@/components/ui/Button';

type BoardItem = { id: string; title: string };

export default function ZohoConnectCard({ boards }: { boards: BoardItem[] }) {
  const [selectedBoardId, setSelectedBoardId] = useState(boards[0]?.id || '');
  const [zohoEmail, setZohoEmail] = useState('');
  const [connecting, setConnecting] = useState(false);

  function handleConnect() {
    setConnecting(true);
    const params = new URLSearchParams();
    if (selectedBoardId) params.set('boardId', selectedBoardId);
    if (zohoEmail.trim()) params.set('loginEmail', zohoEmail.trim());
    window.location.href = `/api/auth/zoho?${params.toString()}`;
  }

  return (
    <div className="bg-gradient-to-br from-indigo-50/80 via-blue-50/50 to-white rounded-2xl border border-indigo-200/90 p-5 shadow-2xs space-y-4">
      <div className="flex flex-col md:flex-row md:items-start justify-between gap-4">
        <div className="space-y-1.5 max-w-xl">
          <div className="flex items-center gap-2">
            <span className="text-xl">📫</span>
            <h3 className="text-sm font-bold text-slate-900">
              1-Click Connect Zoho Mail (OAuth 2.0)
            </h3>
            <span className="text-[10px] font-bold px-2 py-0.5 bg-indigo-100 text-indigo-700 rounded-full">
              Auto-Discover Aliases
            </span>
          </div>
          <p className="text-xs text-slate-600 leading-relaxed">
            Connect directly through official Zoho OAuth. The system automatically detects and imports <strong>all Send-Mail-As alias addresses</strong> (e.g. <code>info@</code>, <code>jdp-elite-team@</code>, <code>grow@</code>, etc.) into the selected board without typing passwords or manual alias lists.
          </p>
        </div>

        <div className="flex flex-col sm:flex-row items-stretch sm:items-end gap-2.5">
          <div className="space-y-1">
            <label className="block text-[11px] font-bold text-slate-700">Link to Board:</label>
            <select
              className="w-full sm:w-auto px-3 py-2 border border-slate-300 rounded-xl text-xs bg-white text-slate-800 font-medium focus:outline-none focus:ring-2 focus:ring-primary-500"
              value={selectedBoardId}
              onChange={(e) => setSelectedBoardId(e.target.value)}
            >
              {boards.map((b) => (
                <option key={b.id} value={b.id}>
                  {b.title}
                </option>
              ))}
            </select>
          </div>

          <div className="space-y-1">
            <label className="block text-[11px] font-bold text-slate-700">Zoho Email (Optional):</label>
            <input
              type="email"
              placeholder="e.g. n3ll3ll@aol.com"
              className="w-full sm:w-44 px-3 py-2 border border-slate-300 rounded-xl text-xs bg-white text-slate-800 focus:outline-none focus:ring-2 focus:ring-primary-500"
              value={zohoEmail}
              onChange={(e) => setZohoEmail(e.target.value)}
            />
          </div>

          <Button
            onClick={handleConnect}
            loading={connecting}
            className="px-4 py-2 bg-indigo-600 hover:bg-indigo-700 text-white font-bold text-xs rounded-xl shadow-xs whitespace-nowrap"
          >
            Connect Zoho Mail →
          </Button>
        </div>
      </div>
    </div>
  );
}
