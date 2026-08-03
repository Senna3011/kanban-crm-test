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
  const [error, setError] = useState<string | null>(null);
  const [boardName, setBoardName] = useState('Board');
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
      <div className="flex items-center justify-between mb-4">
        <h1 className="text-2xl font-bold text-gray-900">{boardName}</h1>
        <div className="flex items-center gap-2">
          <button
            onClick={handleSync}
            disabled={syncing}
            className="px-3 py-1.5 text-sm font-medium text-gray-700 bg-white border border-gray-300 rounded-lg hover:bg-gray-50 disabled:opacity-50"
          >
            {syncing ? '⏳ Syncing...' : '🔄 Sync'}
          </button>
          <button
            onClick={() => setShowColumnSettings(true)}
            className="px-3 py-1.5 text-sm font-medium text-gray-700 bg-white border border-gray-300 rounded-lg hover:bg-gray-50"
          >
            Manage columns
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
            <KanbanColumn key={column.id} column={column} onCardClick={(card) => setSelectedCard(card)} />
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
