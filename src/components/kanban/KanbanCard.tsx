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

function getAvatarColor(str: string) {
  const gradients = [
    'from-blue-600 to-indigo-600 text-white',
    'from-emerald-600 to-teal-600 text-white',
    'from-purple-600 to-pink-600 text-white',
    'from-amber-600 to-orange-600 text-white',
    'from-rose-600 to-red-600 text-white',
    'from-cyan-600 to-blue-600 text-white',
  ];
  let hash = 0;
  for (let i = 0; i < str.length; i++) {
    hash = str.charCodeAt(i) + ((hash << 5) - hash);
  }
  const index = Math.abs(hash) % gradients.length;
  return gradients[index];
}

function formatRelativeTime(dateStr: string): string {
  const date = new Date(dateStr);
  const now = Date.now();
  const diffMs = now - date.getTime();
  const diffMin = Math.floor(diffMs / 60000);
  if (diffMin < 1) return 'just now';
  if (diffMin < 60) return `${diffMin}m ago`;
  const diffHr = Math.floor(diffMin / 60);
  if (diffHr < 24) return `${diffHr}h ago`;
  const diffDay = Math.floor(diffHr / 24);
  if (diffDay === 1) return 'Yesterday';
  if (diffDay < 7) return `${diffDay}d ago`;
  return date.toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
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

  const threadCount = card.threadCount ?? 1;
  const followUpDate = card.nextFollowUpAt ? new Date(card.nextFollowUpAt) : null;
  const isOverdue = followUpDate ? followUpDate < new Date() : false;

  const senderDisplay = card.fromName || card.fromEmail.split('@')[0] || 'Unknown';
  const initial = senderDisplay.charAt(0).toUpperCase();
  const avatarGradient = getAvatarColor(card.fromEmail || senderDisplay);

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
  };

  function handleCardClick(e: React.MouseEvent) {
    if (selectionMode) {
      e.stopPropagation();
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
        'group relative bg-white rounded-xl p-3.5 cursor-pointer select-none transition-all duration-150',
        'border border-slate-200/90 shadow-[0_1px_3px_rgba(0,0,0,0.03)] hover:shadow-[0_6px_16px_rgba(0,0,0,0.06)] hover:border-slate-300/90 hover:-translate-y-0.5',
        (isDragging || isSortableDragging) && 'opacity-60 shadow-2xl ring-2 ring-primary-500 scale-[1.02] rotate-1 z-30',
        isSelected && 'ring-2 ring-primary-600 bg-primary-50/20 border-primary-300',
        !isSelected && isUnread && 'border-l-4 border-l-primary-600 bg-gradient-to-r from-primary-50/30 to-white',
        !isSelected && !isUnread && isReply && 'border-l-4 border-l-amber-500 bg-gradient-to-r from-amber-50/20 to-white',
        !isSelected && !isUnread && !isReply && 'border-l-4 border-l-slate-200 hover:border-l-primary-400'
      )}
    >
      {/* Top row: Avatar, Sender, Status Badge */}
      <div className="flex items-start justify-between gap-2">
        <div className="flex items-center gap-2 min-w-0 flex-1">
          {selectionMode ? (
            <div className="flex-shrink-0" onClick={(e) => e.stopPropagation()}>
              <input
                type="checkbox"
                checked={!!isSelected}
                onChange={() => onToggleSelect?.(card.id)}
                className="w-4 h-4 text-primary-600 rounded border-slate-300 focus:ring-primary-500 cursor-pointer"
              />
            </div>
          ) : (
            <div className={clsx('w-6 h-6 rounded-full flex items-center justify-center text-[10px] font-bold shadow-xs bg-gradient-to-br flex-shrink-0', avatarGradient)}>
              {initial}
            </div>
          )}
          <span className="text-xs font-semibold text-slate-700 truncate">
            {senderDisplay}
          </span>
        </div>

        {/* Badges */}
        <div className="flex items-center gap-1.5 flex-shrink-0">
          {isUnread && (
            <span className="inline-flex items-center gap-1 text-[10px] font-bold px-1.5 py-0.5 rounded-full bg-primary-50 text-primary-700 border border-primary-200/80 shadow-2xs">
              <span className="w-1.5 h-1.5 rounded-full bg-primary-600 animate-pulse" />
              NEW
            </span>
          )}
          {isReply && !isUnread && (
            <span className="inline-flex items-center text-[10px] font-semibold px-1.5 py-0.5 rounded-full bg-amber-50 text-amber-700 border border-amber-200/80 shadow-2xs">
              Replied
            </span>
          )}
        </div>
      </div>

      {/* Subject */}
      <p
        className={clsx(
          'text-sm mt-1.5 leading-snug line-clamp-2 transition-colors group-hover:text-primary-700',
          isUnread ? 'font-bold text-slate-900' : 'font-medium text-slate-800'
        )}
      >
        {card.subject || '(No Subject)'}
      </p>

      {/* Snippet preview if available */}
      {card.bodyText && (
        <p className="text-xs text-slate-500 mt-1 line-clamp-1 leading-relaxed">
          {card.bodyText.replace(/\s+/g, ' ').trim()}
        </p>
      )}

      {/* Bottom info row: Date, Follow-up tag, Thread & Action buttons */}
      <div className="flex items-center justify-between mt-3 pt-2.5 border-t border-slate-100/90 text-xs text-slate-400">
        <div className="flex items-center gap-2 min-w-0">
          <span className="text-[11px] font-medium text-slate-400 truncate" title={new Date(card.lastActivityAt).toLocaleString()}>
            {formatRelativeTime(card.lastActivityAt)}
          </span>

          {threadCount > 1 && (
            <span
              className="inline-flex items-center gap-1 text-[11px] font-medium text-slate-500 bg-slate-100 px-1.5 py-0.2 rounded"
              title={`${threadCount} messages in thread`}
            >
              <svg className="w-3 h-3 text-slate-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z" />
              </svg>
              {threadCount}
            </span>
          )}

          {followUpDate && (
            <span
              className={clsx(
                'inline-flex items-center gap-1 text-[10px] font-semibold px-1.5 py-0.5 rounded-md border',
                isOverdue
                  ? 'bg-rose-50 text-rose-700 border-rose-200 animate-pulse'
                  : 'bg-slate-100 text-slate-600 border-slate-200'
              )}
              title={isOverdue ? `Overdue: ${followUpDate.toLocaleDateString()}` : `Follow-up: ${followUpDate.toLocaleDateString()}`}
            >
              <svg className="w-2.5 h-2.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M12 6v6h4.5m4.5 0a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
              {isOverdue ? 'Overdue' : followUpDate.toLocaleDateString(undefined, { month: 'short', day: 'numeric' })}
            </span>
          )}

          {/* Assigned User Avatar */}
          {card.assignedTo && (
            <span
              className="inline-flex items-center gap-1 text-[10px] font-medium px-1.5 py-0.5 rounded-md bg-indigo-50 text-indigo-700 border border-indigo-200/80"
              title={`Ditugaskan ke: ${card.assignedTo.name || card.assignedTo.email}`}
            >
              <span className="w-3.5 h-3.5 rounded-full bg-indigo-600 text-white flex items-center justify-center text-[9px] font-bold overflow-hidden">
                {card.assignedTo.avatar ? (
                  <img src={card.assignedTo.avatar} alt="Avatar" className="w-full h-full object-cover" onError={(e) => { (e.target as any).style.display = 'none'; }} />
                ) : (
                  (card.assignedTo.name || 'U').charAt(0).toUpperCase()
                )}
              </span>
              <span className="truncate max-w-[65px]">{card.assignedTo.name || 'User'}</span>
            </span>
          )}
        </div>

        {/* Hover Quick Actions */}
        {!isDragging && (
          <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity flex-shrink-0" onClick={(e) => e.stopPropagation()}>
            <button
              onClick={() => onToggleRead?.(card.id, card.status)}
              className="p-1 rounded-md text-slate-400 hover:text-slate-700 hover:bg-slate-100 transition-colors"
              title={isUnread ? 'Mark as read' : 'Mark as unread'}
            >
              {isUnread ? (
                <svg className="w-3.5 h-3.5 text-primary-600" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M3 19v-8.93a2 2 0 01.89-1.664l7-4.666a2 2 0 012.22 0l7 4.666A2 2 0 0121 10.07V19M3 19a2 2 0 002 2h14a2 2 0 002-2M3 19l6.75-4.5M21 19l-6.75-4.5M3 10l6.75 4.5M21 10l-6.75 4.5m0 0l-1.14.76a2 2 0 01-2.22 0l-1.14-.76" />
                </svg>
              ) : (
                <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M21.75 6.75v10.5a2.25 2.25 0 01-2.25 2.25h-15a2.25 2.25 0 01-2.25-2.25V6.75m19.5 0A2.25 2.25 0 0019.5 4.5h-15a2.25 2.25 0 00-2.25 2.25m19.5 0v.243a2.25 2.25 0 01-1.07 1.916l-7.5 4.615a2.25 2.25 0 01-2.36 0L3.32 8.91a2.25 2.25 0 01-1.07-1.916V6.75" />
                </svg>
              )}
            </button>
            <button
              onClick={() => onDelete?.(card.id)}
              className="p-1 rounded-md text-slate-400 hover:text-rose-600 hover:bg-rose-50 transition-colors"
              title="Delete card"
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
