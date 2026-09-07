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
  selectionMode?: boolean;
  isSelected?: boolean;
  onToggleSelect?: (cardId: string) => void;
}

export default function KanbanCard({
  card,
  onClick,
  isDragging,
  onToggleRead,
  onDelete,
  selectionMode,
  isSelected,
  onToggleSelect,
}: Props) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging: isSortableDragging } = useSortable({
    id: card.id,
    disabled: !!isDragging || !!selectionMode,
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
    borderLeftWidth: '3px',
    borderLeftColor: isSelected ? '#3b82f6' : isUnread ? '#4f46e5' : isReply ? '#ea580c' : '#e2e8f0',
  };

  function handleCardClick() {
    if (selectionMode) {
      onToggleSelect?.(card.id);
    } else {
      onClick?.();
    }
  }

  return (
    <div
      ref={setNodeRef}
      style={style}
      {...attributes}
      {...(selectionMode ? {} : listeners)}
      onClick={handleCardClick}
      className={clsx(
        'bg-white rounded-xl border border-l-0 p-3.5 cursor-pointer shadow-[0_1px_3px_rgba(0,0,0,0.04)] hover:shadow-[0_4px_12px_rgba(0,0,0,0.06)] hover:border-slate-300 transition-all group select-none relative',
        (isDragging || isSortableDragging) && 'opacity-60 shadow-lg ring-2 ring-primary-400',
        isSelected && 'ring-2 ring-blue-500 bg-blue-50/20 border-blue-200',
        !isSelected && (isUnread ? 'border-primary-100 bg-primary-50/10' : isReply ? 'border-amber-100' : 'border-slate-200/80')
      )}
    >
      <div className="flex items-start justify-between gap-2">
        {selectionMode && (
          <div className="pt-0.5 flex-shrink-0" onClick={(e) => e.stopPropagation()}>
            <input
              type="checkbox"
              checked={!!isSelected}
              onChange={() => onToggleSelect?.(card.id)}
              className="w-4 h-4 text-blue-600 rounded border-slate-300 focus:ring-blue-500 cursor-pointer"
            />
          </div>
        )}
        <div className="min-w-0 flex-1">
          <p
            className={clsx(
              'text-sm leading-snug line-clamp-2 group-hover:text-primary-600 transition-colors',
              isUnread ? 'font-semibold text-slate-900' : 'font-medium text-slate-700'
            )}
          >
            {card.subject || '(No Subject)'}
          </p>
          <p className="text-xs text-slate-500 mt-1 truncate font-normal">
            {card.fromName || card.fromEmail}
          </p>
        </div>
        <div className="flex flex-col gap-1 items-end flex-shrink-0">
          {isUnread && (
            <span className="text-[10px] font-semibold tracking-wide bg-primary-50 text-primary-700 border border-primary-200/60 px-1.5 py-0.5 rounded-full whitespace-nowrap">
              NEW
            </span>
          )}
          {isReply && !isUnread && (
            <span className="text-[10px] font-medium bg-amber-50 text-amber-700 border border-amber-200/60 px-1.5 py-0.5 rounded-full whitespace-nowrap">
              Replied
            </span>
          )}
        </div>
      </div>
      <div className="flex items-center justify-between mt-3 pt-2 border-t border-slate-100">
        <span className="text-[11px] text-slate-400 font-medium">
          {new Date(card.lastActivityAt).toLocaleDateString(undefined, { month: 'short', day: 'numeric' })}
        </span>
        {/* Trello-like card indicators */}
        <div className="flex items-center gap-2">
          {threadCount > 1 && (
            <span className="inline-flex items-center gap-1 text-[11px] text-slate-500 font-medium" title={`${threadCount} messages in thread`}>
              <svg className="w-3 h-3 text-slate-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z" />
              </svg>
              {threadCount}
            </span>
          )}
          {hasDescription && (
            <span className="text-slate-400 hover:text-slate-600 transition-colors" title="Has description">
              <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M4 6h16M4 12h16M4 18h7" />
              </svg>
            </span>
          )}
          {followUpDate && (
            <span
              className={clsx(
                'inline-flex items-center gap-1 text-[11px] px-1.5 py-0.5 rounded font-medium',
                isOverdue
                  ? 'bg-rose-50 text-rose-600 border border-rose-200/60'
                  : 'bg-slate-100 text-slate-600'
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
              className="p-1 rounded hover:bg-slate-100 text-slate-400 hover:text-slate-600 transition-colors"
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
              className="p-1 rounded hover:bg-rose-50 text-slate-400 hover:text-rose-600 transition-colors"
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
