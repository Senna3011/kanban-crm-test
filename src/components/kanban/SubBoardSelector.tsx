'use client';

import React, { useState, useRef, useEffect, useMemo } from 'react';

export interface SubBoardSender {
  id: string;
  email: string;
  name?: string;
  totalCards: number;
  unreadCount: number;
  dealValue: number;
  isTeamAlias?: boolean;
}

interface Props {
  senders: SubBoardSender[];
  activeSubBoard: string; // 'all' or email address
  onSelectSubBoard: (alias: string) => void;
  boardTitle?: string;
}

export default function SubBoardSelector({
  senders,
  activeSubBoard,
  onSelectSubBoard,
  boardTitle = 'Board',
}: Props) {
  const [isOpen, setIsOpen] = useState(false);
  const [search, setSearch] = useState('');
  const [filterMode, setFilterMode] = useState<'all' | 'active' | 'unread'>('all');
  const popoverRef = useRef<HTMLDivElement>(null);
  const searchInputRef = useRef<HTMLInputElement>(null);

  // Close on outside click
  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (popoverRef.current && !popoverRef.current.contains(e.target as Node)) {
        setIsOpen(false);
      }
    }
    if (isOpen) {
      document.addEventListener('mousedown', handleClickOutside);
      setTimeout(() => searchInputRef.current?.focus(), 50);
    }
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [isOpen]);

  // Close on Escape key
  useEffect(() => {
    function handleKeyDown(e: KeyboardEvent) {
      if (e.key === 'Escape') setIsOpen(false);
    }
    if (isOpen) document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [isOpen]);

  // Compute active sender details
  const activeSender = useMemo(() => {
    if (activeSubBoard === 'all') return null;
    return senders.find((s) => s.email.toLowerCase() === activeSubBoard.toLowerCase());
  }, [senders, activeSubBoard]);

  const totalCardsAll = useMemo(() => {
    return senders.reduce((acc, s) => acc + s.totalCards, 0);
  }, [senders]);

  const totalUnreadAll = useMemo(() => {
    return senders.reduce((acc, s) => acc + s.unreadCount, 0);
  }, [senders]);

  // Filtered senders list
  const filteredSenders = useMemo(() => {
    const q = search.trim().toLowerCase();
    return senders.filter((s) => {
      // Search match
      const matchSearch =
        !q ||
        s.email.toLowerCase().includes(q) ||
        (s.name && s.name.toLowerCase().includes(q));

      if (!matchSearch) return false;

      // Filter mode match
      if (filterMode === 'active') return s.totalCards > 0;
      if (filterMode === 'unread') return s.unreadCount > 0;
      return true;
    });
  }, [senders, search, filterMode]);

  // Group filtered senders by domain or category
  const groupedSenders = useMemo(() => {
    const groups: Record<string, SubBoardSender[]> = {};

    for (const s of filteredSenders) {
      let groupKey = 'Other Senders';
      if (s.isTeamAlias) {
        groupKey = 'Team Aliases (Zoho Mail)';
      } else if (s.email.includes('@')) {
        const domain = s.email.split('@')[1];
        groupKey = `@${domain}`;
      }

      if (!groups[groupKey]) groups[groupKey] = [];
      groups[groupKey].push(s);
    }

    return Object.entries(groups).sort(([aKey, aList], [bKey, bList]) => {
      // Prioritize Team Aliases first
      if (aKey.startsWith('Team')) return -1;
      if (bKey.startsWith('Team')) return 1;
      // Then by largest card volume
      const aCards = aList.reduce((sum, item) => sum + item.totalCards, 0);
      const bCards = bList.reduce((sum, item) => sum + item.totalCards, 0);
      return bCards - aCards;
    });
  }, [filteredSenders]);

  return (
    <div className="relative inline-block" ref={popoverRef}>
      {/* Trigger Button */}
      <button
        type="button"
        onClick={() => setIsOpen(!isOpen)}
        className={`inline-flex items-center gap-2 px-3 py-1.5 rounded-xl text-xs sm:text-sm font-semibold border transition-all shadow-2xs ${
          activeSubBoard !== 'all'
            ? 'bg-indigo-50 border-indigo-300 text-indigo-900 ring-2 ring-indigo-200'
            : 'bg-white hover:bg-slate-50 border-slate-200 text-slate-800'
        }`}
        title={`Select Sub-Board / Mailbox for ${boardTitle}`}
      >
        <span className="text-base leading-none">
          {activeSubBoard !== 'all' ? '🎯' : '🏷️'}
        </span>
        <span className="font-bold tracking-tight max-w-[180px] sm:max-w-[240px] truncate text-left">
          {activeSubBoard === 'all'
            ? `Sub-Board: All Senders (${senders.length})`
            : `Sub-Board: ${activeSender?.name || activeSubBoard}`}
        </span>
        {activeSubBoard !== 'all' && activeSender && (
          <span className="px-1.5 py-0.2 rounded-full bg-indigo-600 text-white text-[10px] font-bold">
            {activeSender.totalCards}
          </span>
        )}
        <svg
          className={`w-3.5 h-3.5 text-slate-400 transition-transform ${
            isOpen ? 'rotate-180' : ''
          }`}
          fill="none"
          viewBox="0 0 24 24"
          stroke="currentColor"
          strokeWidth={2}
        >
          <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
        </svg>
      </button>

      {/* Popover Palette */}
      {isOpen && (
        <div className="absolute left-0 top-full mt-2 w-80 sm:w-96 bg-white rounded-2xl shadow-2xl border border-slate-200/90 z-50 overflow-hidden animate-in fade-in zoom-in-95 duration-100">
          {/* Header */}
          <div className="p-3 border-b border-slate-100 bg-slate-50/80">
            <div className="flex items-center justify-between mb-2">
              <span className="text-[11px] font-bold text-slate-500 uppercase tracking-wider">
                Select Sub-Board ({senders.length} Senders)
              </span>
              {activeSubBoard !== 'all' && (
                <button
                  type="button"
                  onClick={() => {
                    onSelectSubBoard('all');
                    setIsOpen(false);
                  }}
                  className="text-[11px] font-semibold text-primary-600 hover:text-primary-800 hover:underline"
                >
                  Reset to All
                </button>
              )}
            </div>

            {/* Search Input */}
            <div className="relative">
              <div className="absolute inset-y-0 left-0 pl-2.5 flex items-center pointer-events-none text-slate-400">
                <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
                </svg>
              </div>
              <input
                ref={searchInputRef}
                type="text"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Search alias, sender, domain..."
                className="w-full pl-8 pr-7 py-1.5 text-xs bg-white border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-primary-500/20 focus:border-primary-500 transition-all placeholder:text-slate-400 font-medium"
              />
              {search && (
                <button
                  type="button"
                  onClick={() => setSearch('')}
                  className="absolute inset-y-0 right-0 pr-2 flex items-center text-slate-400 hover:text-slate-600 text-xs"
                >
                  ✕
                </button>
              )}
            </div>

            {/* Quick Filter Tabs */}
            <div className="flex items-center gap-1 mt-2">
              <button
                type="button"
                onClick={() => setFilterMode('all')}
                className={`px-2 py-0.5 rounded-lg text-[10px] font-semibold transition ${
                  filterMode === 'all'
                    ? 'bg-slate-900 text-white'
                    : 'bg-white text-slate-600 border border-slate-200 hover:bg-slate-100'
                }`}
              >
                All ({senders.length})
              </button>
              <button
                type="button"
                onClick={() => setFilterMode('active')}
                className={`px-2 py-0.5 rounded-lg text-[10px] font-semibold transition ${
                  filterMode === 'active'
                    ? 'bg-primary-600 text-white'
                    : 'bg-white text-slate-600 border border-slate-200 hover:bg-slate-100'
                }`}
              >
                Active Only ({senders.filter((s) => s.totalCards > 0).length})
              </button>
              <button
                type="button"
                onClick={() => setFilterMode('unread')}
                className={`px-2 py-0.5 rounded-lg text-[10px] font-semibold transition ${
                  filterMode === 'unread'
                    ? 'bg-amber-600 text-white'
                    : 'bg-white text-slate-600 border border-slate-200 hover:bg-slate-100'
                }`}
              >
                Unread ({senders.filter((s) => s.unreadCount > 0).length})
              </button>
            </div>
          </div>

          {/* Senders List */}
          <div className="max-h-72 overflow-y-auto divide-y divide-slate-100 p-1">
            {/* Option: All Senders Combined */}
            <button
              type="button"
              onClick={() => {
                onSelectSubBoard('all');
                setIsOpen(false);
              }}
              className={`w-full text-left px-3 py-2 rounded-xl flex items-center justify-between text-xs transition ${
                activeSubBoard === 'all'
                  ? 'bg-primary-50 text-primary-950 font-bold border border-primary-200'
                  : 'hover:bg-slate-50 text-slate-800'
              }`}
            >
              <div className="flex items-center gap-2 min-w-0">
                <span className="w-6 h-6 rounded-lg bg-gradient-to-br from-indigo-500 to-primary-600 text-white flex items-center justify-center font-bold text-[10px] shadow-2xs shrink-0">
                  🌐
                </span>
                <div className="min-w-0">
                  <p className="font-bold truncate">All Senders (Combined)</p>
                  <p className="text-[10px] text-slate-400 font-normal">
                    Aggregate view across all mailboxes
                  </p>
                </div>
              </div>
              <div className="flex items-center gap-1.5 shrink-0">
                {totalUnreadAll > 0 && (
                  <span className="px-1.5 py-0.2 rounded-full bg-primary-100 text-primary-800 text-[10px] font-bold">
                    {totalUnreadAll} unread
                  </span>
                )}
                <span className="px-2 py-0.5 rounded-full bg-slate-100 text-slate-700 text-[11px] font-bold">
                  {totalCardsAll} cards
                </span>
              </div>
            </button>

            {/* Grouped Lists */}
            {groupedSenders.length === 0 ? (
              <div className="p-6 text-center text-xs text-slate-400">
                No matching senders or aliases found
              </div>
            ) : (
              groupedSenders.map(([groupTitle, groupList]) => (
                <div key={groupTitle} className="pt-2 pb-1">
                  <div className="px-2.5 py-1 text-[10px] font-bold text-slate-400 uppercase tracking-wider flex items-center justify-between">
                    <span>{groupTitle}</span>
                    <span>{groupList.length}</span>
                  </div>

                  {groupList.map((sender) => {
                    const isSelected = activeSubBoard.toLowerCase() === sender.email.toLowerCase();
                    return (
                      <button
                        key={sender.id || sender.email}
                        type="button"
                        onClick={() => {
                          onSelectSubBoard(sender.email);
                          setIsOpen(false);
                        }}
                        className={`w-full text-left px-3 py-2 rounded-xl flex items-center justify-between text-xs transition my-0.5 ${
                          isSelected
                            ? 'bg-indigo-50 text-indigo-950 font-bold border border-indigo-200 shadow-2xs'
                            : 'hover:bg-slate-50 text-slate-800'
                        }`}
                      >
                        <div className="flex items-center gap-2 min-w-0">
                          <span className="w-6 h-6 rounded-lg bg-slate-100 border border-slate-200 text-slate-600 flex items-center justify-center font-bold text-[10px] shrink-0">
                            {sender.isTeamAlias ? '👥' : '✉️'}
                          </span>
                          <div className="min-w-0">
                            <p className="font-semibold text-slate-900 truncate">
                              {sender.name || sender.email.split('@')[0]}
                            </p>
                            <p className="text-[10px] text-slate-400 truncate">
                              {sender.email}
                            </p>
                          </div>
                        </div>

                        <div className="flex items-center gap-1.5 shrink-0">
                          {sender.unreadCount > 0 && (
                            <span className="px-1.5 py-0.2 rounded-full bg-amber-100 text-amber-800 text-[9px] font-bold">
                              🔥 {sender.unreadCount}
                            </span>
                          )}
                          <span
                            className={`px-1.5 py-0.2 rounded-full text-[10px] font-bold ${
                              sender.totalCards > 0
                                ? 'bg-slate-100 text-slate-700'
                                : 'bg-slate-50 text-slate-400'
                            }`}
                          >
                            {sender.totalCards}
                          </span>
                        </div>
                      </button>
                    );
                  })}
                </div>
              ))
            )}
          </div>
        </div>
      )}
    </div>
  );
}
