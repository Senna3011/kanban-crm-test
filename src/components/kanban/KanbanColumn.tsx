'use client';

import { useState, useMemo } from 'react';
import { useDroppable } from '@dnd-kit/core';
import { SortableContext, verticalListSortingStrategy } from '@dnd-kit/sortable';
import KanbanCard from './KanbanCard';
import type { ColumnData, CardData } from '@/types';

interface Props {
  column: ColumnData;
  onCardClick?: (card: CardData) => void;
  onToggleRead?: (cardId: string, currentStatus: string) => void;
  onDelete?: (cardId: string) => void;
  selectionMode?: boolean;
  selectedIds?: Set<string>;
  onToggleSelect?: (cardId: string) => void;
}

export default function KanbanColumn({
  column,
  onCardClick,
  onToggleRead,
  onDelete,
  selectionMode,
  selectedIds,
  onToggleSelect,
}: Props) {
  const { setNodeRef, isOver } = useDroppable({ id: column.id });
  const [sortMode, setSortMode] = useState<'default' | 'unreads' | 'date'>('default');

  const sortedCards = useMemo(() => {
    if (sortMode === 'unreads') {
      return [...column.cards].sort((a, b) => {
        if (a.status === 'unread' && b.status !== 'unread') return -1;
        if (a.status !== 'unread' && b.status === 'unread') return 1;
        return new Date(b.lastActivityAt).getTime() - new Date(a.lastActivityAt).getTime();
      });
    }
    if (sortMode === 'date') {
      return [...column.cards].sort(
        (a, b) => new Date(b.lastActivityAt).getTime() - new Date(a.lastActivityAt).getTime()
      );
    }
    return column.cards;
  }, [column.cards, sortMode]);

  const unreadCount = column.cards.filter((c) => c.status === 'unread').length;

  function toggleSort() {
    if (sortMode === 'default') setSortMode('unreads');
    else if (sortMode === 'unreads') setSortMode('date');
    else setSortMode('default');
  }

  return (
    <div
      ref={setNodeRef}
      className={`flex-shrink-0 w-[82vw] max-w-[290px] sm:w-80 bg-slate-100/70 border rounded-2xl flex flex-col max-h-full transition-all duration-200 overflow-hidden shadow-2xs ${
        isOver
          ? 'bg-primary-50/50 border-primary-300 ring-2 ring-primary-400/30'
          : 'border-slate-200/80 hover:border-slate-300/80'
      }`}
    >
      {/* Top column color strip */}
      <div className="h-1.5 w-full transition-colors" style={{ backgroundColor: column.color || '#3b82f6' }} />

      {/* Column header */}
      <div className="p-3.5 flex items-center justify-between border-b border-slate-200/60 bg-white/50 backdrop-blur-xs">
        <div className="flex items-center gap-2.5 min-w-0">
          <div
            className="w-2.5 h-2.5 rounded-full flex-shrink-0 shadow-2xs ring-2 ring-white"
            style={{ backgroundColor: column.color || '#3b82f6' }}
          />
          <h3 className="font-bold text-sm text-slate-800 truncate tracking-tight">{column.title}</h3>
          <span className="text-xs font-semibold text-slate-500 bg-slate-200/70 px-2 py-0.5 rounded-full leading-none">
            {column.cards.length}
          </span>
        </div>

        {/* Action / Sort button */}
        <div className="flex items-center gap-1">
          {unreadCount > 0 && (
            <span className="text-[10px] font-bold text-primary-700 bg-primary-100/80 px-2 py-0.5 rounded-full flex items-center gap-1">
              <span className="w-1.5 h-1.5 rounded-full bg-primary-600 animate-pulse" />
              {unreadCount}
            </span>
          )}

          <button
            onClick={toggleSort}
            className={`p-1.5 rounded-lg text-xs font-medium transition-all ${
              sortMode !== 'default'
                ? 'bg-primary-50 text-primary-700 font-semibold'
                : 'text-slate-400 hover:text-slate-700 hover:bg-slate-200/60'
            }`}
            title={`Sort: ${sortMode === 'unreads' ? 'Unreads first' : sortMode === 'date' ? 'Newest first' : 'Default'}`}
          >
            <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M3 4h13M3 8h9m-9 4h6m4 0l4-4m0 0l4 4m-4-4v12" />
            </svg>
          </button>
        </div>
      </div>

      {/* Cards list */}
      <div className="flex-1 overflow-y-auto p-2 space-y-2.5 scrollbar-thin">
        <SortableContext items={sortedCards.map((c) => c.id)} strategy={verticalListSortingStrategy}>
          {sortedCards.map((card) => (
            <KanbanCard
              key={card.id}
              card={card}
              onClick={() => onCardClick?.(card)}
              onToggleRead={onToggleRead}
              onDelete={onDelete}
              selectionMode={selectionMode}
              isSelected={selectedIds?.has(card.id)}
              onToggleSelect={onToggleSelect}
            />
          ))}
        </SortableContext>

        {column.cards.length === 0 && (
          <div className="h-44 border-2 border-dashed border-slate-200 rounded-xl flex flex-col items-center justify-center text-slate-400 p-4 text-center transition-colors hover:border-slate-300">
            <svg className="w-8 h-8 text-slate-300 mb-2" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M19.5 14.25v-2.625a3.375 3.375 0 00-3.375-3.375h-1.5A1.125 1.125 0 0113.5 7.125v-1.5a3.375 3.375 0 00-3.375-3.375H8.25m3.75 9v6m3-3H9m1.5-12H5.625c-.621 0-1.125.504-1.125 1.125v17.25c0 .621.504 1.125 1.125 1.125h12.75c.621 0 1.125-.504 1.125-1.125V11.25a9 9 0 00-9-9z" />
            </svg>
            <p className="text-xs font-semibold text-slate-500">No cards here</p>
            <p className="text-[11px] text-slate-400 mt-0.5">Drag & drop cards to this stage</p>
          </div>
        )}
      </div>
    </div>
  );
}
