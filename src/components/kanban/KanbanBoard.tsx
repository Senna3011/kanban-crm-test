'use client';

import { useState } from 'react';
import { DndContext, DragEndEvent, DragOverlay, DragStartEvent, PointerSensor, useSensor, useSensors } from '@dnd-kit/core';
import { SortableContext, verticalListSortingStrategy } from '@dnd-kit/sortable';
import KanbanColumn from './KanbanColumn';
import KanbanCard from './KanbanCard';
import type { ColumnData, CardData } from '@/types';

const DEFAULT_COLUMNS: ColumnData[] = [
  { id: 'unreads', title: 'Unreads', position: 0, color: '#6b7280', isSystem: true, cards: [] },
  { id: 'leads', title: 'Leads', position: 1, color: '#3b82f6', isSystem: false, cards: [] },
  { id: 'followup-1', title: 'Follow up 1', position: 2, color: '#f59e0b', isSystem: false, cards: [] },
  { id: 'followup-2', title: 'Follow up 2', position: 3, color: '#f59e0b', isSystem: false, cards: [] },
  { id: 'followup-3', title: 'Follow up 3', position: 4, color: '#f59e0b', isSystem: false, cards: [] },
  { id: 'fail', title: 'Fail', position: 5, color: '#ef4444', isSystem: false, cards: [] },
  { id: 'pending', title: 'Pending', position: 6, color: '#8b5cf6', isSystem: false, cards: [] },
  { id: 'success', title: 'Success', position: 7, color: '#22c55e', isSystem: false, cards: [] },
];

export default function KanbanBoard() {
  const [columns, setColumns] = useState<ColumnData[]>(DEFAULT_COLUMNS);
  const [activeCard, setActiveCard] = useState<CardData | null>(null);

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 8 } })
  );

  function handleDragStart(event: DragStartEvent) {
    const cardId = event.active.id as string;
    for (const col of columns) {
      const card = col.cards.find((c) => c.id === cardId);
      if (card) { setActiveCard(card); break; }
    }
  }

  function handleDragEnd(event: DragEndEvent) {
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
  }

  return (
    <div className="h-full flex flex-col">
      <div className="flex items-center justify-between mb-4">
        <h1 className="text-2xl font-bold text-gray-900">Sales Board</h1>
      </div>

      <DndContext sensors={sensors} onDragStart={handleDragStart} onDragEnd={handleDragEnd}>
        <div className="flex-1 flex gap-4 overflow-x-auto pb-4">
          {columns.map((column) => (
            <KanbanColumn key={column.id} column={column} />
          ))}
        </div>
        <DragOverlay>
          {activeCard ? <KanbanCard card={activeCard} isDragging /> : null}
        </DragOverlay>
      </DndContext>
    </div>
  );
}
