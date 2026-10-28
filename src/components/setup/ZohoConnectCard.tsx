'use client';

import { useState } from 'react';

type BoardItem = { id: string; title: string };

export default function ZohoConnectCard({ boards }: { boards: BoardItem[] }) {
  const [selectedBoardId, setSelectedBoardId] = useState(boards[0]?.id || '');
  const [connecting, setConnecting] = useState(false);

  function handleConnect() {
    setConnecting(true);
    const params = new URLSearchParams();
    if (selectedBoardId) params.set('boardId', selectedBoardId);
    window.location.href = `/api/auth/zoho?${params.toString()}`;
  }

  return (
    <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 p-3.5 bg-gradient-to-r from-slate-50 to-indigo-50/40 border border-slate-200/90 rounded-xl">
      <div className="flex items-center gap-2.5">
        <div className="w-8 h-8 rounded-lg bg-indigo-600 text-white flex items-center justify-center font-bold text-xs shadow-2xs shrink-0">
          Z
        </div>
        <div>
          <div className="flex items-center gap-2">
            <h4 className="text-xs font-bold text-slate-800">Hubungkan Zoho Mail (OAuth 2.0)</h4>
            <span className="text-[10px] bg-indigo-100 text-indigo-700 font-semibold px-2 py-0.5 rounded-full">
              Auto-Fetch Aliases
            </span>
          </div>
          <p className="text-[11px] text-slate-500 mt-0.5">
            Login resmi Zoho untuk menarik akun utama dan seluruh alias <em>Send-Mail-As</em> secara otomatis.
          </p>
        </div>
      </div>

      <div className="flex items-center gap-2 shrink-0 self-end sm:self-center">
        {boards.length > 0 && (
          <select
            value={selectedBoardId}
            onChange={(e) => setSelectedBoardId(e.target.value)}
            className="px-2.5 py-1.5 border border-slate-300 rounded-lg text-xs bg-white text-slate-700 font-medium focus:ring-2 focus:ring-primary-500 focus:outline-none"
            title="Pilih board target untuk akun dan alias ini"
          >
            {boards.map((b) => (
              <option key={b.id} value={b.id}>
                Target: {b.title}
              </option>
            ))}
          </select>
        )}

        <button
          type="button"
          onClick={handleConnect}
          disabled={connecting}
          className="px-3.5 py-1.5 bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-bold rounded-lg transition-colors flex items-center gap-1.5 disabled:opacity-50 cursor-pointer shadow-2xs whitespace-nowrap"
        >
          <span>{connecting ? 'Mengarahkan...' : '+ Connect Zoho'}</span>
        </button>
      </div>
    </div>
  );
}
