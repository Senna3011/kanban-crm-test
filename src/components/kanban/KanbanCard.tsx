'use client';

import { useSortable } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import clsx from 'clsx';
import type { CardData } from '@/types';

interface Props {
  card: CardData;
  isDragging?: boolean;
  onClick?: () => void;
  onToggleRead?: (cardId: string, currentStatus: string) => void;
  onDelete?: (cardId: string) => void;
}

export default function KanbanCard({ card, onClick, isDragging, onToggleRead, onDelete }: Props) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging: isSortableDragging } = useSortable({
    id: card.id,
    disabled: !!isDragging,
  });

  const isUnread = card.status === 'unread';
  const isReply = card.highlighted;

  // Trello-like indicators
  const threadCount = card.threadCount ?? 1;
  const hasDescription = (card.descLen ?? 0) > 0;
  const followUpDate = card.nextFollowUpAt ? new Date(card.nextFollowUpAt) : null;
  const isOverdue = followUpDate ? followUpDate < new Date() : false;

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
        'bg-white rounded-r-lg border border-l-0 p-3 cursor-pointer shadow-sm hover:shadow-md transition-shadow group',
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
        {/* Trello-like card indicators */}
        <div className="flex items-center gap-2">
          {threadCount > 1 && (
            <span className="inline-flex items-center gap-0.5 text-xs text-gray-500" title={`${threadCount} messages in thread`}>
              <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z" />
              </svg>
              {threadCount}
            </span>
          )}
          {hasDescription && (
            <span className="text-xs text-gray-400" title="Has description">
              <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M4 6h16M4 12h16M4 18h7" />
              </svg>
            </span>
          )}
          {followUpDate && (
            <span
              className={clsx(
                'inline-flex items-center gap-0.5 text-xs',
                isOverdue ? 'text-red-500 font-medium' : 'text-gray-500'
              )}
              title={isOverdue ? `Overdue: ${followUpDate.toLocaleDateString()}` : `Follow up: ${followUpDate.toLocaleDateString()}`}
            >
              <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
              </svg>
              {isOverdue ? 'Overdue' : followUpDate.toLocaleDateString(undefined, { month: 'short', day: 'numeric' })}
            </span>
          )}
        </div>
        {!isDragging && (
          <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
            <button
              onClick={(e) => { e.stopPropagation(); onToggleRead?.(card.id, card.status); }}
              className="p-1 rounded hover:bg-gray-100 text-gray-400 hover:text-gray-600"
              title={isUnread ? 'Mark as read' : 'Mark as unread'}
            >
              {isUnread ? (
                <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M3 19v-8.93a2 2 0 01.89-1.664l7-4.666a2 2 0 012.22 0l7 4.666A2 2 0 0121 10.07V19M3 19a2 2 0 002 2h14a2 2 0 002-2M3 19l6.75-4.5M21 19l-6.75-4.5M3 10l6.75 4.5M21 10l-6.75 4.5m0 0l-1.14.76a2 2 0 01-2.22 0l-1.14-.76" />
                </svg>
              ) : (
                <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M21.75 6.75v10.5a2.25 2.25 0 01-2.25 2.25h-15a2.25 2.25 0 01-2.25-2.25V6.75m19.5 0A2.25 2.25 0 0019.5 4.5h-15a2.25 2.25 0 00-2.25 2.25m19.5 0v.243a2.25 2.25 0 01-1.07 1.916l-7.5 4.615a2.25 2.25 0 01-2.36 0L3.32 8.91a2.25 2.25 0 01-1.07-1.916V6.75" />
                </svg>
              )}
            </button>
            <button
              onClick={(e) => { e.stopPropagation(); onDelete?.(card.id); }}
              className="p-1 rounded hover:bg-red-50 text-gray-400 hover:text-red-500"
              title="Delete"
            >
              <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M14.74 9l-.346 9m-4.788 0L9.26 9m9.968-3.21c.342.052.682.107 1.022.166m-1.022-.165L18.16 19.673a2.25 2.25 0 01-2.244 2.077H8.084a2.25 2.25 0 01-2.244-2.077L4.772 5.79m14.456 0a48.108 48.108 0 00-3.478-.397m-12 .562c.34-.059.68-.114 1.022-.165m0 0a48.11 48.11 0 013.478-.397m7.5 0v-.916c0-1.18-.91-2.164-2.09-2.201a51.964 51.964 0 00-3.32 0c-1.18.037-2.09 1.022-2.09 2.201v.916m7.5 0a48.667 48.667 0 00-7.5 0" />
              </svg>
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
