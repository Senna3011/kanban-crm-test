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
    <div className="bg-white rounded-xl border border-slate-200/90 p-4 shadow-2xs hover:border-slate-300 transition-colors">
      <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4">
        {/* Left: Brand Identity & Explanation */}
        <div className="flex items-start gap-3.5">
          {/* Zoho official 4-color tile badge */}
          <div className="w-10 h-10 rounded-xl bg-slate-900 flex items-center justify-center p-2 shrink-0 shadow-2xs border border-slate-800">
            <div className="grid grid-cols-2 gap-0.5 w-full h-full">
              <span className="bg-[#E42528] rounded-xs" />
              <span className="bg-[#009F4D] rounded-xs" />
              <span className="bg-[#006BC8] rounded-xs" />
              <span className="bg-[#F5B800] rounded-xs" />
            </div>
          </div>

          <div className="space-y-1">
            <div className="flex flex-wrap items-center gap-2">
              <h3 className="text-sm font-bold text-slate-900 tracking-tight">Zoho Mail Integration</h3>
              <span className="text-[10px] font-bold px-2 py-0.5 bg-emerald-50 text-emerald-700 border border-emerald-200/60 rounded-full">
                OAuth 2.0 Secure
              </span>
              <span className="text-[10px] font-semibold px-2 py-0.5 bg-indigo-50 text-indigo-700 border border-indigo-200/60 rounded-full">
                Auto-Discovers All Aliases
              </span>
            </div>
            <p className="text-xs text-slate-500 leading-relaxed max-w-xl">
              Connect your official Zoho inbox in one click. Primary mailbox and all Send-Mail-As team aliases (e.g. <code>info@</code>, <code>jdp-elite-team@</code>) are automatically imported without passwords.
            </p>
          </div>
        </div>

        {/* Right: Controls with clear labeling */}
        <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-2.5 shrink-0 self-stretch lg:self-center border-t lg:border-t-0 pt-3 lg:pt-0 border-slate-100">
          {boards.length > 0 && (
            <div className="flex items-center gap-2 bg-slate-50 border border-slate-200 px-3 py-1.5 rounded-lg">
              <label htmlFor="target-board-select" className="text-xs font-semibold text-slate-600 whitespace-nowrap">
                Target Board:
              </label>
              <select
                id="target-board-select"
                value={selectedBoardId}
                onChange={(e) => setSelectedBoardId(e.target.value)}
                className="bg-transparent text-xs font-bold text-slate-900 focus:outline-none cursor-pointer pr-1"
                aria-label="Select pipeline board to link with this Zoho account"
              >
                {boards.map((b) => (
                  <option key={b.id} value={b.id}>
                    {b.title}
                  </option>
                ))}
              </select>
            </div>
          )}

          <button
            type="button"
            onClick={handleConnect}
            disabled={connecting}
            className="px-4 py-2 bg-indigo-600 hover:bg-indigo-700 active:bg-indigo-800 text-white text-xs font-bold rounded-lg transition-all flex items-center justify-center gap-2 disabled:opacity-60 cursor-pointer shadow-xs whitespace-nowrap"
          >
            {connecting ? (
              <>
                <svg className="animate-spin h-3.5 w-3.5 text-white" viewBox="0 0 24 24" fill="none">
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8H4z" />
                </svg>
                <span>Redirecting to Zoho...</span>
              </>
            ) : (
              <>
                <span>Connect Zoho Account</span>
                <span className="text-indigo-200">→</span>
              </>
            )}
          </button>
        </div>
      </div>
    </div>
  );
}
