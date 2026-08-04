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

  const isUnread = card.status === 'unread';
  const isReply = card.highlighted;

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    borderLeftWidth: '4px',
    borderLeftColor: isUnread ? '#3b82f6' : isReply ? '#f97316' : '#e5e7eb',
  };

  return (
    <div
      ref={setNodeRef}
      style={style}
      {...attributes}
      {...listeners}
      onClick={onClick}
      className={clsx(
        'bg-white rounded-r-lg border border-l-0 p-3 cursor-pointer shadow-sm hover:shadow-md transition-shadow',
        (isDragging || isSortableDragging) && 'opacity-50 shadow-lg',
        isUnread ? 'border-blue-200' : isReply ? 'border-orange-200' : 'border-gray-200'
      )}
    >
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0 flex-1">
          <p className={clsx('text-sm truncate', isUnread ? 'font-bold text-gray-900' : 'font-medium text-gray-700')}>
            {card.subject}
          </p>
          <p className="text-xs text-gray-500 mt-0.5 truncate">{card.fromName || card.fromEmail}</p>
        </div>
        <div className="flex flex-col gap-1 items-end">
          {isUnread && (
            <span className="text-xs bg-blue-100 text-blue-700 px-1.5 py-0.5 rounded-full whitespace-nowrap font-medium">
              NEW
            </span>
          )}
          {isReply && !isUnread && (
            <span className="text-xs bg-orange-100 text-orange-700 px-1.5 py-0.5 rounded-full whitespace-nowrap">
              Replied
            </span>
          )}
        </div>
      </div>
      <div className="flex items-center justify-between mt-2">
        <span className="text-xs text-gray-400">
          {new Date(card.lastActivityAt).toLocaleDateString()}
        </span>
      </div>
    </div>
  );
}
