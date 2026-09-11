'use client';

import { useState, useEffect, useCallback, useRef, useMemo } from 'react';
import { DndContext, DragEndEvent, DragOverlay, DragStartEvent, MouseSensor, TouchSensor, useSensor, useSensors } from '@dnd-kit/core';
import KanbanColumn from './KanbanColumn';
import KanbanCard from './KanbanCard';
import CardDetailPanel from './CardDetailPanel';
import ColumnSettings from './ColumnSettings';
import toast, { Toaster } from 'react-hot-toast';
import type { ColumnData, CardData } from '@/types';

type FilterMode = 'all' | 'unread' | 'replied' | 'overdue';

export default function KanbanBoard() {
  const [columns, setColumns] = useState<ColumnData[]>([]);
  const [boards, setBoards] = useState<{ id: string; title: string }[]>([]);
  const [activeBoardId, setActiveBoardId] = useState<string>('');
  const [activeCard, setActiveCard] = useState<CardData | null>(null);
  const [selectedCard, setSelectedCard] = useState<CardData | null>(null);
  const [showColumnSettings, setShowColumnSettings] = useState(false);
  const [loading, setLoading] = useState(true);
  const [syncing, setSyncing] = useState(false);
  const [reclassifying, setReclassifying] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [boardName, setBoardName] = useState('Main Board');
  const [totalUnread, setTotalUnread] = useState(0);
  const [aiStatus, setAiStatus] = useState<{ configured: boolean; valid?: boolean; message: string } | null>(null);
  const [selectionMode, setSelectionMode] = useState(false);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [bulkDeleting, setBulkDeleting] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [filterMode, setFilterMode] = useState<FilterMode>('all');
  const searchInputRef = useRef<HTMLInputElement>(null);

  const scrollRef = useRef<HTMLDivElement>(null);
  const isDragging = useRef(false);
  const startX = useRef(0);
  const scrollLeft = useRef(0);

  const handleMouseDown = useCallback((e: React.MouseEvent) => {
    if (!scrollRef.current) return;
    // Don't drag scroll if clicking interactive element
    const target = e.target as HTMLElement;
    if (target.closest('button') || target.closest('input') || target.closest('a')) return;
    isDragging.current = true;
    startX.current = e.pageX - scrollRef.current.offsetLeft;
    scrollLeft.current = scrollRef.current.scrollLeft;
    scrollRef.current.style.cursor = 'grabbing';
    scrollRef.current.style.userSelect = 'none';
  }, []);

  const handleMouseMove = useCallback((e: React.MouseEvent) => {
    if (!isDragging.current || !scrollRef.current) return;
    e.preventDefault();
    const x = e.pageX - scrollRef.current.offsetLeft;
    const walk = (x - startX.current) * 1.5;
    scrollRef.current.scrollLeft = scrollLeft.current - walk;
  }, []);

  const handleMouseUp = useCallback(() => {
    isDragging.current = false;
    if (scrollRef.current) {
      scrollRef.current.style.cursor = 'grab';
      scrollRef.current.style.userSelect = '';
    }
  }, []);

  const sensors = useSensors(
    useSensor(MouseSensor, { activationConstraint: { distance: 8 } }),
    useSensor(TouchSensor, { activationConstraint: { delay: 250, tolerance: 8 } })
  );

  const fetchColumns = useCallback(async () => {
    try {
      setError(null);
      const boardId = localStorage.getItem('activeBoardId') || '';
      const url = boardId ? `/api/columns?boardId=${boardId}` : '/api/columns';
      const res = await fetch(url);
      if (!res.ok) throw new Error('Failed to load board');
      const data: ColumnData[] = await res.json();
      setColumns(
        data.map((c) => ({
          ...c,
          cards: c.cards.map((card) => ({
            ...card,
            lastActivityAt: new Date(card.lastActivityAt).toISOString(),
          })),
        }))
      );
      if (data.length > 0) {
        const boardsRes = await fetch('/api/boards');
        if (boardsRes.ok) {
          const allBoards = await boardsRes.json();
          setBoards(allBoards);
          const current = allBoards.find((b: any) => b.id === boardId);
          if (current) {
            setBoardName(current.title);
            setActiveBoardId(current.id);
          } else if (allBoards.length > 0) {
            setBoardName(allBoards[0].title);
            setActiveBoardId(allBoards[0].id);
          }
        }
      }
    } catch (err: any) {
      setError(err.message || 'Failed to load board');
      toast.error('Failed to load board data');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchColumns();
  }, [fetchColumns]);

  // Fetch total unread count across all boards
  useEffect(() => {
    fetch('/api/cards?status=unread')
      .then((r) => r.json())
      .then((cards: any[]) => setTotalUnread(cards.length))
      .catch(() => {});
  }, []);

  // Check AI status
  useEffect(() => {
    fetch('/api/ai-status')
      .then((r) => r.json())
      .then(setAiStatus)
      .catch(() => {});
  }, []);

  // Real-time refresh listeners
  useEffect(() => {
    const handler = () => fetchColumns();
    window.addEventListener('board-refresh', handler);
    return () => window.removeEventListener('board-refresh', handler);
  }, [fetchColumns]);

  useEffect(() => {
    const handler = () => {
      setLoading(true);
      fetchColumns();
    };
    window.addEventListener('board-switched', handler);
    return () => window.removeEventListener('board-switched', handler);
  }, [fetchColumns]);

  // Global keyboard shortcut '/' to search, 'Esc' to clear search
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === '/' && !['INPUT', 'TEXTAREA'].includes((e.target as HTMLElement)?.tagName)) {
        e.preventDefault();
        searchInputRef.current?.focus();
      }
      if (e.key === 'Escape' && document.activeElement === searchInputRef.current) {
        setSearchQuery('');
        searchInputRef.current?.blur();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, []);

  function handleSwitchBoard(newId: string) {
    setActiveBoardId(newId);
    localStorage.setItem('activeBoardId', newId);
    setLoading(true);
    window.dispatchEvent(new Event('board-switched'));
  }

  function handleDragStart(event: DragStartEvent) {
    const cardId = event.active.id as string;
    for (const col of columns) {
      const card = col.cards.find((c) => c.id === cardId);
      if (card) {
        setActiveCard(card);
        break;
      }
    }
  }

  async function handleDragEnd(event: DragEndEvent) {
    setActiveCard(null);
    const { active, over } = event;
    if (!over) return;

    const cardId = active.id as string;
    const targetId = over.id as string;

    let sourceColIdx = -1;
    let cardIndex = -1;
    for (let ci = 0; ci < columns.length; ci++) {
      const idx = columns[ci].cards.findIndex((c) => c.id === cardId);
      if (idx !== -1) {
        sourceColIdx = ci;
        cardIndex = idx;
        break;
      }
    }
    if (sourceColIdx === -1) return;

    let targetColIdx = columns.findIndex((c) => c.id === targetId);
    if (targetColIdx === -1) {
      targetColIdx = columns.findIndex((c) => c.cards.some((card) => card.id === targetId));
    }
    if (targetColIdx === -1) return;
    if (sourceColIdx === targetColIdx) return;

    const newColumns = columns.map((col) => ({ ...col, cards: [...col.cards] }));
    const [movedCard] = newColumns[sourceColIdx].cards.splice(cardIndex, 1);
    movedCard.columnId = newColumns[targetColIdx].id;
    newColumns[targetColIdx].cards.push(movedCard);
    setColumns(newColumns);

    try {
      await fetch(`/api/cards/${cardId}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ columnId: newColumns[targetColIdx].id }),
      });
    } catch {
      toast.error('Failed to save card position');
    }
  }

  async function handleToggleRead(cardId: string, currentStatus: string) {
    const newStatus = currentStatus === 'unread' ? 'read' : 'unread';
    setColumns((prev) =>
      prev.map((col) => ({
        ...col,
        cards: col.cards.map((c) => (c.id === cardId ? { ...c, status: newStatus } : c)),
      }))
    );
    if (selectedCard?.id === cardId) {
      setSelectedCard((prev) => (prev ? { ...prev, status: newStatus } : prev));
    }
    setTotalUnread((prev) => (newStatus === 'unread' ? prev + 1 : Math.max(0, prev - 1)));
    try {
      await fetch(`/api/cards/${cardId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status: newStatus }),
      });
      toast.success(newStatus === 'unread' ? 'Marked as unread' : 'Marked as read');
    } catch {
      toast.error('Failed to update status');
      fetchColumns();
    }
  }

  async function handleDeleteCard(cardId: string) {
    if (!confirm('Delete this card? This will also archive the email in Zoho.')) return;
    let wasUnread = false;
    columns.forEach((col) => {
      const card = col.cards.find((c) => c.id === cardId);
      if (card && card.status === 'unread') wasUnread = true;
    });
    setColumns((prev) =>
      prev.map((col) => ({
        ...col,
        cards: col.cards.filter((c) => c.id !== cardId),
      }))
    );
    if (selectedCard?.id === cardId) setSelectedCard(null);
    if (wasUnread) setTotalUnread((prev) => Math.max(0, prev - 1));
    try {
      await fetch(`/api/cards/${cardId}`, { method: 'DELETE' });
      toast.success('Card deleted');
    } catch {
      toast.error('Failed to delete card');
      fetchColumns();
    }
  }

  function handleToggleSelect(cardId: string) {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(cardId)) next.delete(cardId);
      else next.add(cardId);
      return next;
    });
  }

  async function handleBulkMarkRead(read: boolean) {
    if (selectedIds.size === 0) return;
    const newStatus = read ? 'read' : 'unread';
    for (const cardId of selectedIds) {
      try {
        await fetch(`/api/cards/${cardId}`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ status: newStatus }),
        });
      } catch {}
    }
    toast.success(`Marked ${selectedIds.size} cards as ${newStatus}`);
    setSelectedIds(new Set());
    setSelectionMode(false);
    fetchColumns();
  }

  async function handleBulkDelete() {
    if (selectedIds.size === 0) return;
    if (!confirm(`Delete ${selectedIds.size} selected card(s)? This will also archive the emails.`)) return;
    setBulkDeleting(true);
    let failed = 0;
    for (const cardId of selectedIds) {
      try {
        const res = await fetch(`/api/cards/${cardId}`, { method: 'DELETE' });
        if (!res.ok) failed++;
      } catch {
        failed++;
      }
    }
    setBulkDeleting(false);
    setSelectedIds(new Set());
    setSelectionMode(false);
    if (failed > 0) toast.error(`Deleted with ${failed} failure(s)`);
    else toast.success(`${selectedIds.size} card(s) deleted`);
    fetchColumns();
  }

  async function handleSync() {
    setSyncing(true);
    try {
      const res = await fetch('/api/sync', { method: 'POST' });
      if (!res.ok) throw new Error('Sync failed');
      toast.success('Syncing emails...');
      setTimeout(() => {
        fetchColumns();
        setSyncing(false);
      }, 4000);
    } catch (err: any) {
      toast.error(err.message || 'Sync failed');
      setSyncing(false);
    }
  }

  async function handleReclassify() {
    if (!confirm('Re-run AI classification on pending cards? Cards may move between columns.')) return;
    setReclassifying(true);
    try {
      const res = await fetch('/api/reclassify', { method: 'POST' });
      if (!res.ok) throw new Error('Reclassify failed');
      const data = await res.json();
      toast.success(`Reclassified ${data.reclassified} of ${data.total} cards`);
      fetchColumns();
    } catch (err: any) {
      toast.error(err.message || 'Reclassify failed');
    } finally {
      setReclassifying(false);
    }
  }

  // Calculate statistics
  const stats = useMemo(() => {
    let total = 0;
    let unread = 0;
    let replied = 0;
    let overdue = 0;
    const now = new Date();

    columns.forEach((col) => {
      col.cards.forEach((card) => {
        total++;
        if (card.status === 'unread') unread++;
        if (card.highlighted) replied++;
        if (card.nextFollowUpAt && new Date(card.nextFollowUpAt) < now) overdue++;
      });
    });

    return { total, unread, replied, overdue };
  }, [columns]);

  // Client-side search and filtering
  const filteredColumns = useMemo(() => {
    const q = searchQuery.toLowerCase().trim();
    const now = new Date();

    return columns.map((col) => {
      const cards = col.cards.filter((card) => {
        if (q) {
          const matchSub = (card.subject || '').toLowerCase().includes(q);
          const matchSender =
            (card.fromName || '').toLowerCase().includes(q) || (card.fromEmail || '').toLowerCase().includes(q);
          const matchBody = (card.bodyText || '').toLowerCase().includes(q);
          if (!matchSub && !matchSender && !matchBody) return false;
        }

        if (filterMode === 'unread') return card.status === 'unread';
        if (filterMode === 'replied') return card.highlighted;
        if (filterMode === 'overdue') {
          return card.nextFollowUpAt && new Date(card.nextFollowUpAt) < now;
        }

        return true;
      });
      return { ...col, cards };
    });
  }, [columns, searchQuery, filterMode]);

  const totalFilteredCards = useMemo(() => {
    return filteredColumns.reduce((acc, col) => acc + col.cards.length, 0);
  }, [filteredColumns]);

  // Skeleton Loader View
  if (loading) {
    return (
      <div className="h-full flex flex-col space-y-4">
        {/* Header Skeleton */}
        <div className="flex items-center justify-between animate-pulse">
          <div className="h-7 w-48 bg-slate-200 rounded-lg" />
          <div className="flex gap-2">
            <div className="h-8 w-24 bg-slate-200 rounded-lg" />
            <div className="h-8 w-24 bg-slate-200 rounded-lg" />
          </div>
        </div>
        {/* Columns Skeleton */}
        <div className="flex-1 flex gap-4 overflow-hidden">
          {[1, 2, 3, 4].map((n) => (
            <div key={n} className="w-80 bg-slate-100/70 border border-slate-200 rounded-2xl p-3 flex flex-col space-y-3">
              <div className="h-6 w-32 bg-slate-200 rounded-md animate-pulse" />
              <div className="space-y-2.5 flex-1">
                {[1, 2, 3].map((cardN) => (
                  <div key={cardN} className="bg-white rounded-xl p-4 border border-slate-200/80 shadow-xs space-y-2.5 animate-pulse">
                    <div className="flex items-center gap-2">
                      <div className="w-5 h-5 rounded-full bg-slate-200" />
                      <div className="h-3.5 w-24 bg-slate-200 rounded" />
                    </div>
                    <div className="h-4 w-full bg-slate-200 rounded" />
                    <div className="h-3 w-4/5 bg-slate-200 rounded" />
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
      </div>
    );
  }

  // Error State View
  if (error && columns.length === 0) {
    return (
      <div className="h-full flex items-center justify-center p-6">
        <div className="text-center space-y-4 max-w-sm bg-white p-8 rounded-2xl border border-slate-200 shadow-sm">
          <div className="w-12 h-12 rounded-2xl bg-rose-50 text-rose-600 flex items-center justify-center mx-auto text-xl">
            ⚠️
          </div>
          <div>
            <h2 className="text-lg font-bold text-slate-800">Failed to load board</h2>
            <p className="text-xs text-slate-500 mt-1">{error}</p>
          </div>
          <button
            onClick={fetchColumns}
            className="w-full px-4 py-2 bg-primary-600 text-white font-medium rounded-xl text-sm hover:bg-primary-700 shadow-sm transition-all"
          >
            Try again
          </button>
        </div>
      </div>
    );
  }

  // Empty Columns View
  if (columns.length === 0) {
    return (
      <div className="h-full flex items-center justify-center p-6">
        <div className="text-center space-y-4 max-w-sm bg-white p-8 rounded-2xl border border-slate-200 shadow-sm">
          <div className="w-12 h-12 rounded-2xl bg-primary-50 text-primary-600 flex items-center justify-center mx-auto text-xl">
            📋
          </div>
          <div>
            <h2 className="text-lg font-bold text-slate-800">No columns yet</h2>
            <p className="text-xs text-slate-500 mt-1">Configure your board columns or go to setup to start.</p>
          </div>
          <button
            onClick={() => setShowColumnSettings(true)}
            className="w-full px-4 py-2 bg-primary-600 text-white font-medium rounded-xl text-sm hover:bg-primary-700 shadow-sm transition-all"
          >
            Create Columns
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="h-full flex flex-col">
      <Toaster position="top-right" />

      {/* AI Notice Banner */}
      {aiStatus && !aiStatus.valid && (
        <div className="mb-3 px-4 py-3 rounded-xl border text-xs sm:text-sm flex items-start gap-3 bg-amber-50/90 border-amber-200 text-amber-900 shadow-2xs">
          <span className="text-base leading-none mt-0.5">⚠️</span>
          <div>
            <p className="font-semibold">{aiStatus.message}</p>
            <p className="mt-0.5 text-xs text-amber-700">
              Email tetap ditarik, namun <strong>AI classification</strong> dan <strong>auto-draft</strong> menunggu token AI. Semua pesan masuk ke kolom <strong>Unreads</strong>.
            </p>
          </div>
        </div>
      )}

      {/* Main Top Header */}
      <div className="flex flex-col gap-3 mb-3 sm:mb-4">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2.5">
          {/* Board Title & Board Switcher Dropdown */}
          <div className="flex items-center gap-2.5 flex-wrap">
            {boards.length > 1 ? (
              <div className="relative inline-block">
                <select
                  value={activeBoardId}
                  onChange={(e) => handleSwitchBoard(e.target.value)}
                  className="appearance-none bg-white hover:bg-slate-50 border border-slate-200 text-slate-900 font-bold text-lg sm:text-xl rounded-xl px-3.5 py-1 pr-8 focus:outline-none focus:ring-2 focus:ring-primary-500 shadow-2xs cursor-pointer tracking-tight"
                >
                  {boards.map((b) => (
                    <option key={b.id} value={b.id}>
                      {b.title}
                    </option>
                  ))}
                </select>
                <div className="pointer-events-none absolute inset-y-0 right-0 flex items-center px-2.5 text-slate-500">
                  <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
                  </svg>
                </div>
              </div>
            ) : (
              <h1 className="text-lg sm:text-xl font-bold tracking-tight text-slate-900">{boardName}</h1>
            )}

            {/* Quick Metrics Chips */}
            <div className="flex items-center gap-1.5 text-xs font-semibold">
              <span className="bg-slate-100 text-slate-700 px-2.5 py-1 rounded-full border border-slate-200/80 shadow-2xs">
                {stats.total} total
              </span>
              {stats.unread > 0 && (
                <span className="bg-primary-50 text-primary-700 border border-primary-200 px-2.5 py-1 rounded-full flex items-center gap-1 shadow-2xs">
                  <span className="w-1.5 h-1.5 rounded-full bg-primary-600 animate-pulse" />
                  {stats.unread} unread
                </span>
              )}
              {stats.overdue > 0 && (
                <span className="bg-rose-50 text-rose-700 border border-rose-200 px-2.5 py-1 rounded-full flex items-center gap-1 shadow-2xs animate-pulse">
                  <span className="w-1.5 h-1.5 rounded-full bg-rose-600" />
                  {stats.overdue} overdue
                </span>
              )}
            </div>
          </div>

          {/* Action Buttons Toolbar */}
          <div className="flex items-center gap-1.5 sm:gap-2 flex-wrap sm:flex-nowrap">
            {selectionMode ? (
              <>
                <span className="text-xs font-medium text-slate-500">{selectedIds.size} selected</span>
                <button
                  onClick={() => handleBulkMarkRead(true)}
                  disabled={selectedIds.size === 0}
                  className="px-2.5 py-1.5 text-xs font-semibold text-slate-700 bg-white border border-slate-200 rounded-lg hover:bg-slate-50 shadow-xs transition-all disabled:opacity-50"
                >
                  Mark Read
                </button>
                <button
                  onClick={() => handleBulkMarkRead(false)}
                  disabled={selectedIds.size === 0}
                  className="px-2.5 py-1.5 text-xs font-semibold text-slate-700 bg-white border border-slate-200 rounded-lg hover:bg-slate-50 shadow-xs transition-all disabled:opacity-50"
                >
                  Mark Unread
                </button>
                <button
                  onClick={handleBulkDelete}
                  disabled={selectedIds.size === 0 || bulkDeleting}
                  className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold text-white bg-rose-600 border border-rose-600 rounded-lg hover:bg-rose-700 shadow-xs transition-all disabled:opacity-50"
                >
                  <svg className={`w-3.5 h-3.5 ${bulkDeleting ? 'animate-spin' : ''}`} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                  </svg>
                  {bulkDeleting ? 'Deleting...' : `Delete (${selectedIds.size})`}
                </button>
                <button
                  onClick={() => {
                    setSelectionMode(false);
                    setSelectedIds(new Set());
                  }}
                  className="px-3 py-1.5 text-xs font-semibold text-slate-600 bg-white border border-slate-200 rounded-lg hover:bg-slate-50 shadow-xs transition-all"
                >
                  Cancel
                </button>
              </>
            ) : (
              <button
                onClick={() => setSelectionMode(true)}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold text-slate-700 bg-white border border-slate-200/90 rounded-lg hover:bg-slate-50 shadow-xs transition-all"
              >
                <svg className="w-3.5 h-3.5 text-slate-500" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
                </svg>
                Select
              </button>
            )}

            <button
              onClick={handleSync}
              disabled={syncing}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold text-slate-700 bg-white border border-slate-200/90 rounded-lg hover:bg-slate-50 shadow-xs transition-all disabled:opacity-50"
              title="Poll emails manually"
            >
              <svg className={`w-3.5 h-3.5 text-slate-500 ${syncing ? 'animate-spin' : ''}`} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
              </svg>
              {syncing ? 'Syncing...' : 'Sync'}
            </button>

            <button
              onClick={handleReclassify}
              disabled={reclassifying}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold text-amber-800 bg-amber-50 border border-amber-200 rounded-lg hover:bg-amber-100 shadow-xs transition-all disabled:opacity-50"
              title="Re-run AI classification on pending cards"
            >
              <svg className={`w-3.5 h-3.5 text-amber-600 ${reclassifying ? 'animate-spin' : ''}`} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M13 10V3L4 14h7v7l9-11h-7z" />
              </svg>
              {reclassifying ? 'Classifying...' : 'Reclassify'}
            </button>

            <button
              onClick={() => setShowColumnSettings(true)}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold text-slate-700 bg-white border border-slate-200/90 rounded-lg hover:bg-slate-50 shadow-xs transition-all"
            >
              <svg className="w-3.5 h-3.5 text-slate-500" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M10.5 6h9.75M10.5 6a1.5 1.5 0 11-3 0m3 0a1.5 1.5 0 10-3 0M3.75 6H7.5m3 12h9.75m-9.75 0a1.5 1.5 0 01-3 0m3 0a1.5 1.5 0 00-3 0m-3.75 0H7.5m9-6h3.75m-3.75 0a1.5 1.5 0 01-3 0m3 0a1.5 1.5 0 00-3 0m-9.75 0h9.75" />
              </svg>
              Columns
            </button>
          </div>
        </div>

        {/* Search Bar & Filter Chips Row */}
        <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-2.5 pt-1">
          {/* Search Input with shortcut hint */}
          <div className="relative flex-1 max-w-md">
            <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none text-slate-400">
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
              </svg>
            </div>
            <input
              ref={searchInputRef}
              type="text"
              placeholder="Search subject, sender, body... (Press / to search)"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full pl-9 pr-8 py-1.5 text-xs sm:text-sm bg-white border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-primary-500/20 focus:border-primary-500 shadow-2xs transition-all placeholder:text-slate-400"
            />
            {searchQuery && (
              <button
                onClick={() => setSearchQuery('')}
                className="absolute inset-y-0 right-0 pr-2.5 flex items-center text-slate-400 hover:text-slate-600"
              >
                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            )}
          </div>

          {/* Filter Pills */}
          <div className="flex items-center gap-1.5 overflow-x-auto pb-1 sm:pb-0 scrollbar-none">
            <button
              onClick={() => setFilterMode('all')}
              className={`px-3 py-1 text-xs font-semibold rounded-lg transition-all ${
                filterMode === 'all'
                  ? 'bg-slate-900 text-white shadow-xs'
                  : 'bg-white text-slate-600 border border-slate-200 hover:bg-slate-50'
              }`}
            >
              All ({stats.total})
            </button>
            <button
              onClick={() => setFilterMode('unread')}
              className={`px-3 py-1 text-xs font-semibold rounded-lg transition-all ${
                filterMode === 'unread'
                  ? 'bg-primary-600 text-white shadow-xs'
                  : 'bg-white text-slate-600 border border-slate-200 hover:bg-slate-50'
              }`}
            >
              Unread ({stats.unread})
            </button>
            <button
              onClick={() => setFilterMode('replied')}
              className={`px-3 py-1 text-xs font-semibold rounded-lg transition-all ${
                filterMode === 'replied'
                  ? 'bg-amber-600 text-white shadow-xs'
                  : 'bg-white text-slate-600 border border-slate-200 hover:bg-slate-50'
              }`}
            >
              Replied ({stats.replied})
            </button>
            <button
              onClick={() => setFilterMode('overdue')}
              className={`px-3 py-1 text-xs font-semibold rounded-lg transition-all ${
                filterMode === 'overdue'
                  ? 'bg-rose-600 text-white shadow-xs'
                  : 'bg-white text-slate-600 border border-slate-200 hover:bg-slate-50'
              }`}
            >
              Overdue ({stats.overdue})
            </button>
          </div>
        </div>

        {/* Search Active Indicator */}
        {(searchQuery || filterMode !== 'all') && (
          <div className="flex items-center justify-between px-3 py-1.5 rounded-lg bg-primary-50/70 border border-primary-100 text-xs text-primary-800">
            <span>
              Showing <strong>{totalFilteredCards}</strong> cards matching filter
              {searchQuery && (
                <>
                  {' '}for &ldquo;<strong>{searchQuery}</strong>&rdquo;
                </>
              )}
            </span>
            <button
              onClick={() => {
                setSearchQuery('');
                setFilterMode('all');
              }}
              className="text-primary-700 underline font-semibold hover:text-primary-900"
            >
              Reset Filters
            </button>
          </div>
        )}
      </div>

      {/* Kanban Board DND Area */}
      <DndContext sensors={sensors} onDragStart={handleDragStart} onDragEnd={handleDragEnd}>
        <div
          ref={scrollRef}
          className="flex-1 flex gap-3 sm:gap-4 overflow-x-auto pb-4 touch-pan-x select-none"
          style={{ cursor: 'grab', WebkitOverflowScrolling: 'touch' }}
          onMouseDown={handleMouseDown}
          onMouseMove={handleMouseMove}
          onMouseUp={handleMouseUp}
          onMouseLeave={handleMouseUp}
        >
          {filteredColumns.map((column) => (
            <KanbanColumn
              key={column.id}
              column={column}
              onCardClick={(card) => setSelectedCard(card)}
              onToggleRead={handleToggleRead}
              onDelete={handleDeleteCard}
              selectionMode={selectionMode}
              selectedIds={selectedIds}
              onToggleSelect={handleToggleSelect}
            />
          ))}
        </div>
        <DragOverlay>
          {activeCard ? <KanbanCard card={activeCard} isDragging /> : null}
        </DragOverlay>
      </DndContext>

      {/* Card Detail Modal */}
      {selectedCard && <CardDetailPanel card={selectedCard} onClose={() => setSelectedCard(null)} />}

      {/* Column Settings Modal */}
      {showColumnSettings && (
        <ColumnSettings columns={columns} onChange={setColumns} onClose={() => setShowColumnSettings(false)} />
      )}
    </div>
  );
}
