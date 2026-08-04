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
}

export default function KanbanColumn({ column, onCardClick, onToggleRead, onDelete }: Props) {
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
      className={`flex-shrink-0 w-72 bg-gray-100 rounded-xl flex flex-col max-h-full transition-colors ${isOver ? 'bg-primary-50 ring-2 ring-primary-200' : ''}`}
    >
      <div className="p-3 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <div className="w-3 h-3 rounded-full" style={{ backgroundColor: column.color }} />
          <h3 className="font-semibold text-sm text-gray-900">{column.title}</h3>
          <span className="text-xs text-gray-500 bg-gray-200 px-1.5 py-0.5 rounded-full">
            {column.cards.length}
          </span>
        </div>
        {unreadCount > 0 && (
          <button
            onClick={() => setSortUnreads(!sortUnreads)}
            className={`text-xs px-2 py-1 rounded-md transition-colors ${
              sortUnreads
                ? 'bg-blue-100 text-blue-700 font-medium'
                : 'text-gray-500 hover:bg-gray-200'
            }`}
            title={sortUnreads ? 'Showing unreads first' : 'Sort by unreads'}
          >
            🔵 {unreadCount}
          </button>
        )}
      </div>

      <div className="flex-1 overflow-y-auto px-2 pb-2 space-y-2">
        <SortableContext items={sortedCards.map((c) => c.id)} strategy={verticalListSortingStrategy}>
          {sortedCards.map((card) => (
            <KanbanCard
              key={card.id}
              card={card}
              onClick={() => onCardClick?.(card)}
              onToggleRead={onToggleRead}
              onDelete={onDelete}
            />
          ))}
        </SortableContext>
        {column.cards.length === 0 && (
          <div className="text-center py-8 text-sm text-gray-400">Drop cards here</div>
        )}
      </div>
    </div>
  );
}
