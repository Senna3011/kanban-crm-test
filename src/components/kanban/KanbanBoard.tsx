'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import { DndContext, DragEndEvent, DragOverlay, DragStartEvent, PointerSensor, useSensor, useSensors } from '@dnd-kit/core';
import KanbanColumn from './KanbanColumn';
import KanbanCard from './KanbanCard';
import CardDetailPanel from './CardDetailPanel';
import ColumnSettings from './ColumnSettings';
import toast, { Toaster } from 'react-hot-toast';
import type { ColumnData, CardData } from '@/types';

export default function KanbanBoard() {
  const [columns, setColumns] = useState<ColumnData[]>([]);
  const [activeCard, setActiveCard] = useState<CardData | null>(null);
  const [selectedCard, setSelectedCard] = useState<CardData | null>(null);
  const [showColumnSettings, setShowColumnSettings] = useState(false);
  const [loading, setLoading] = useState(true);
  const [syncing, setSyncing] = useState(false);
  const [reclassifying, setReclassifying] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [boardName, setBoardName] = useState('Board');
  const [totalUnread, setTotalUnread] = useState(0);
  const [aiStatus, setAiStatus] = useState<{ configured: boolean; valid?: boolean; message: string } | null>(null);
  const [selectionMode, setSelectionMode] = useState(false);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [bulkDeleting, setBulkDeleting] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);
  const isDragging = useRef(false);
  const startX = useRef(0);
  const scrollLeft = useRef(0);

  const handleMouseDown = useCallback((e: React.MouseEvent) => {
    if (!scrollRef.current) return;
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
    useSensor(PointerSensor, { activationConstraint: { distance: 8 } })
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
          const boards = await boardsRes.json();
          const current = boards.find((b: any) => b.id === boardId);
          if (current) setBoardName(current.title);
          else if (boards.length > 0) setBoardName(boards[0].title);
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
      .then(r => r.json())
      .then((cards: any[]) => setTotalUnread(cards.length))
      .catch(() => {});
  }, []);

  // Check AI status
  useEffect(() => {
    fetch('/api/ai-status')
      .then(r => r.json())
      .then(setAiStatus)
      .catch(() => {});
  }, []);

  // Listen for real-time refresh events
  useEffect(() => {
    const handler = () => fetchColumns();
    window.addEventListener('board-refresh', handler);
    return () => window.removeEventListener('board-refresh', handler);
  }, [fetchColumns]);

  // Listen for board switch events
  useEffect(() => {
    const handler = () => { setLoading(true); fetchColumns(); };
    window.addEventListener('board-switched', handler);
    return () => window.removeEventListener('board-switched', handler);
  }, [fetchColumns]);

  function handleDragStart(event: DragStartEvent) {
    const cardId = event.active.id as string;
    for (const col of columns) {
      const card = col.cards.find((c) => c.id === cardId);
      if (card) { setActiveCard(card); break; }
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
      if (idx !== -1) { sourceColIdx = ci; cardIndex = idx; break; }
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

    // Persist card move to API
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
    // Optimistic update
    setColumns(prev => prev.map(col => ({
      ...col,
      cards: col.cards.map(c => c.id === cardId ? { ...c, status: newStatus } : c),
    })));
    if (selectedCard?.id === cardId) {
      setSelectedCard(prev => prev ? { ...prev, status: newStatus } : prev);
    }
    // Update global unread count
    setTotalUnread(prev => newStatus === 'unread' ? prev + 1 : prev - 1);
    try {
      await fetch(`/api/cards/${cardId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status: newStatus }),
      });
      toast.success(newStatus === 'unread' ? 'Marked as unread' : 'Marked as read');
    } catch {
      toast.error('Failed to update status');
      setTotalUnread(prev => newStatus === 'unread' ? prev - 1 : prev + 1);
      fetchColumns();
    }
  }

  async function handleDeleteCard(cardId: string) {
    if (!confirm('Delete this card? This will also archive the email in Zoho.')) return;
    // Check if card is unread before removing
    let wasUnread = false;
    columns.forEach(col => {
      const card = col.cards.find(c => c.id === cardId);
      if (card && card.status === 'unread') wasUnread = true;
    });
    // Optimistic remove
    setColumns(prev => prev.map(col => ({
      ...col,
      cards: col.cards.filter(c => c.id !== cardId),
    })));
    if (selectedCard?.id === cardId) setSelectedCard(null);
    if (wasUnread) setTotalUnread(prev => Math.max(0, prev - 1));
    try {
      await fetch(`/api/cards/${cardId}`, { method: 'DELETE' });
      toast.success('Card deleted');
    } catch {
      toast.error('Failed to delete card');
      fetchColumns();
    }
  }

  function handleToggleSelect(cardId: string) {
    setSelectedIds(prev => {
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
      // Wait a bit then refresh
      setTimeout(() => { fetchColumns(); setSyncing(false); }, 5000);
    } catch (err: any) {
      toast.error(err.message || 'Sync failed');
      setSyncing(false);
    }
  }

  async function handleReclassify() {
    if (!confirm('Re-run AI classification on all cards? Cards may move between columns.')) return;
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

  if (loading) {
    return (
      <div className="h-full flex items-center justify-center">
        <div className="text-center space-y-3">
          <div className="animate-spin h-8 w-8 border-4 border-primary-200 border-t-primary-600 rounded-full mx-auto" />
          <p className="text-gray-500 text-sm">Loading board...</p>
        </div>
      </div>
    );
  }

  if (error && columns.length === 0) {
    return (
      <div className="h-full flex items-center justify-center">
        <div className="text-center space-y-4 max-w-sm">
          <div className="text-4xl">😞</div>
          <h2 className="text-lg font-semibold text-gray-800">Failed to load board</h2>
          <p className="text-sm text-gray-500">{error}</p>
          <button
            onClick={fetchColumns}
            className="px-4 py-2 bg-primary-600 text-white rounded-lg text-sm hover:bg-primary-700"
          >
            Try again
          </button>
        </div>
      </div>
    );
  }

  if (columns.length === 0) {
    return (
      <div className="h-full flex items-center justify-center">
        <div className="text-center space-y-3">
          <div className="text-4xl">📋</div>
          <h2 className="text-lg font-semibold text-gray-800">No columns yet</h2>
          <p className="text-sm text-gray-500">Go to setup to get started with your board.</p>
        </div>
      </div>
    );
  }

  return (
    <div className="h-full flex flex-col">
      <Toaster position="top-right" />
      {aiStatus && !aiStatus.valid && (
        <div className="mb-3 px-4 py-3 rounded-lg border text-sm flex items-start gap-3 bg-amber-50 border-amber-300 text-amber-800">
          <span className="text-lg leading-none mt-0.5">⚠️</span>
          <div>
            <p className="font-medium">{aiStatus.message}</p>
            <p className="mt-1 text-xs text-amber-600">
              Email tetap masuk, tapi <strong>AI classification</strong> dan <strong>auto-draft</strong> tidak jalan sampai token diisi ulang.
              Semua email akan masuk kolom <strong>Unreads</strong> secara default.
            </p>
          </div>
        </div>
      )}
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-3">
          <h1 className="text-xl font-bold tracking-tight text-slate-800">{boardName}</h1>
          {totalUnread > 0 && (
            <span className="text-xs bg-primary-50 text-primary-700 border border-primary-200/80 px-2.5 py-0.5 rounded-full font-medium flex items-center gap-1.5">
              <span className="w-1.5 h-1.5 rounded-full bg-primary-600 animate-pulse" />
              {totalUnread} unread
            </span>
          )}
        </div>
        <div className="flex items-center gap-2">
          {selectionMode ? (
            <>
              <span className="text-xs font-medium text-slate-500">{selectedIds.size} selected</span>
              <button
                onClick={() => handleBulkMarkRead(true)}
                disabled={selectedIds.size === 0}
                className="px-2.5 py-1.5 text-xs font-medium text-slate-700 bg-white border border-slate-200 rounded-lg hover:bg-slate-50 shadow-sm transition-all disabled:opacity-50"
              >
                Mark Read
              </button>
              <button
                onClick={() => handleBulkMarkRead(false)}
                disabled={selectedIds.size === 0}
                className="px-2.5 py-1.5 text-xs font-medium text-slate-700 bg-white border border-slate-200 rounded-lg hover:bg-slate-50 shadow-sm transition-all disabled:opacity-50"
              >
                Mark Unread
              </button>
              <button
                onClick={handleBulkDelete}
                disabled={selectedIds.size === 0 || bulkDeleting}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-white bg-rose-600 border border-rose-600 rounded-lg hover:bg-rose-700 shadow-sm transition-all disabled:opacity-50"
              >
                <svg className={`w-3.5 h-3.5 ${bulkDeleting ? 'animate-spin' : ''}`} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                </svg>
                {bulkDeleting ? 'Deleting...' : `Delete (${selectedIds.size})`}
              </button>
              <button
                onClick={() => { setSelectionMode(false); setSelectedIds(new Set()); }}
                className="px-3 py-1.5 text-xs font-medium text-slate-600 bg-white border border-slate-200 rounded-lg hover:bg-slate-50 shadow-sm transition-all"
              >
                Cancel
              </button>
            </>
          ) : (
            <button
              onClick={() => setSelectionMode(true)}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-slate-700 bg-white border border-slate-200 rounded-lg hover:bg-slate-50 hover:border-slate-300 shadow-sm transition-all"
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
            className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-slate-700 bg-white border border-slate-200 rounded-lg hover:bg-slate-50 hover:border-slate-300 shadow-sm transition-all disabled:opacity-50"
          >
            <svg className={`w-3.5 h-3.5 text-slate-500 ${syncing ? 'animate-spin' : ''}`} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
            </svg>
            {syncing ? 'Syncing...' : 'Sync'}
          </button>
          <button
            onClick={handleReclassify}
            disabled={reclassifying}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-amber-700 bg-amber-50/80 border border-amber-200 rounded-lg hover:bg-amber-100/80 shadow-sm transition-all disabled:opacity-50"
            title="Re-run AI classification on all existing cards"
          >
            <svg className={`w-3.5 h-3.5 text-amber-600 ${reclassifying ? 'animate-spin' : ''}`} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M13 10V3L4 14h7v7l9-11h-7z" />
            </svg>
            {reclassifying ? 'Classifying...' : 'Reclassify'}
          </button>
          <button
            onClick={() => setShowColumnSettings(true)}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-slate-700 bg-white border border-slate-200 rounded-lg hover:bg-slate-50 hover:border-slate-300 shadow-sm transition-all"
          >
            <svg className="w-3.5 h-3.5 text-slate-500" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M10.5 6h9.75M10.5 6a1.5 1.5 0 11-3 0m3 0a1.5 1.5 0 10-3 0M3.75 6H7.5m3 12h9.75m-9.75 0a1.5 1.5 0 01-3 0m3 0a1.5 1.5 0 00-3 0m-3.75 0H7.5m9-6h3.75m-3.75 0a1.5 1.5 0 01-3 0m3 0a1.5 1.5 0 00-3 0m-9.75 0h9.75" />
            </svg>
            Columns
          </button>
        </div>
      </div>

      <DndContext sensors={sensors} onDragStart={handleDragStart} onDragEnd={handleDragEnd}>
        <div
          ref={scrollRef}
          className="flex-1 flex gap-4 overflow-x-auto pb-4"
          style={{ cursor: 'grab' }}
          onMouseDown={handleMouseDown}
          onMouseMove={handleMouseMove}
          onMouseUp={handleMouseUp}
          onMouseLeave={handleMouseUp}
        >
          {columns.map((column) => (
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

      {selectedCard && <CardDetailPanel card={selectedCard} onClose={() => setSelectedCard(null)} />}
      {showColumnSettings && <ColumnSettings columns={columns} onChange={setColumns} onClose={() => setShowColumnSettings(false)} />}
    </div>
  );
}
