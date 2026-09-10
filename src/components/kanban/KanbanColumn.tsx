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
  const [sortUnreads, setSortUnreads] = useState(false);

  const sortedCards = useMemo(() => {
    if (!sortUnreads) return column.cards;
    return [...column.cards].sort((a, b) => {
      if (a.status === 'unread' && b.status !== 'unread') return -1;
      if (a.status !== 'unread' && b.status === 'unread') return 1;
      return 0;
    });
  }, [column.cards, sortUnreads]);

  const unreadCount = column.cards.filter(c => c.status === 'unread').length;

  return (
    <div
      ref={setNodeRef}
      className={`flex-shrink-0 w-[80vw] max-w-[288px] sm:w-72 bg-slate-100/80 border border-slate-200/80 rounded-2xl flex flex-col max-h-full transition-all overflow-hidden ${
        isOver ? 'bg-primary-50/80 ring-2 ring-primary-300' : ''
      }`}
    >
      {/* Color strip on top of each column */}
      <div className="h-1 w-full" style={{ backgroundColor: column.color }} />

      <div className="p-3 flex items-center justify-between">
        <div className="flex items-center gap-2 min-w-0">
          <div className="w-2 h-2 rounded-full flex-shrink-0" style={{ backgroundColor: column.color }} />
          <h3 className="font-semibold text-sm text-slate-700 truncate">{column.title}</h3>
          <span className="text-xs text-slate-500 bg-slate-200/80 px-1.5 py-0.5 rounded-full">
            {column.cards.length}
          </span>
        </div>
        {unreadCount > 0 && (
          <button
            onClick={() => setSortUnreads(!sortUnreads)}
            className={`text-xs px-2 py-1 rounded-md transition-colors flex-shrink-0 ${
              sortUnreads
                ? 'bg-primary-100 text-primary-700 font-medium'
                : 'text-slate-500 hover:bg-slate-200'
            }`}
            title={sortUnreads ? 'Showing unreads first' : 'Sort by unreads'}
          >
            ● {unreadCount}
          </button>
        )}
      </div>

      <div className="flex-1 overflow-y-auto px-2 pb-2 space-y-2 scrollbar-thin">
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
          <div className="text-center py-8 text-sm text-slate-400">Drop cards here</div>
        )}
      </div>
    </div>
  );
}
