'use client';

import { useSortable } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import clsx from 'clsx';
import type { CardData } from '@/types';

interface Props {
  card: CardData;
  isDragging?: boolean;
  onClick?: () => void;
}

export default function KanbanCard({ card, onClick, isDragging }: Props) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging: isSortableDragging } = useSortable({
    id: card.id,
    disabled: !!isDragging,
  });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
  };

  return (
    <div
      ref={setNodeRef}
      style={style}
      {...attributes}
      {...listeners}
      onClick={onClick}
      className={clsx(
        'bg-white rounded-lg border p-3 cursor-pointer shadow-sm hover:shadow-md transition-shadow',
        card.highlighted && 'ring-2 ring-orange-400 border-orange-300',
        (isDragging || isSortableDragging) && 'opacity-50 shadow-lg',
        !card.highlighted && 'border-gray-200'
      )}
    >
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0 flex-1">
          <p className="text-sm font-medium text-gray-900 truncate">{card.subject}</p>
          <p className="text-xs text-gray-500 mt-0.5 truncate">{card.fromName || card.fromEmail}</p>
        </div>
        {card.highlighted && (
          <span className="text-xs bg-orange-100 text-orange-700 px-1.5 py-0.5 rounded-full whitespace-nowrap">
            Reply
          </span>
        )}
      </div>
      <div className="flex items-center justify-between mt-2">
        <span className="text-xs text-gray-400">
          {new Date(card.lastActivityAt).toLocaleDateString()}
        </span>
      </div>
    </div>
  );
}
