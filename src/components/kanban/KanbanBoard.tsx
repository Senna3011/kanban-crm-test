'use client';

import { useState, useEffect, useCallback } from 'react';
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
  const [error, setError] = useState<string | null>(null);

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 8 } })
  );

  const fetchColumns = useCallback(async () => {
    try {
      setError(null);
      const res = await fetch('/api/columns');
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
        <h1 className="text-2xl font-bold text-gray-900">Sales Board</h1>
        <button
          onClick={() => setShowColumnSettings(true)}
          className="px-3 py-1.5 text-sm font-medium text-gray-700 bg-white border border-gray-300 rounded-lg hover:bg-gray-50"
        >
          Manage columns
        </button>
      </div>

      <DndContext sensors={sensors} onDragStart={handleDragStart} onDragEnd={handleDragEnd}>
        <div className="flex-1 flex gap-4 overflow-x-auto pb-4">
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
