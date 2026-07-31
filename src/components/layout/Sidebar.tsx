'use client';

import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';
import clsx from 'clsx';

const navItems = [
  { href: '/dashboard', label: 'Board', icon: '📋' },
  { href: '/dashboard/settings', label: 'Settings', icon: '⚙️' },
  { href: '/dashboard/spam', label: 'Spam Box', icon: '🛡️' },
];

type BoardItem = { id: string; title: string };

export default function Sidebar() {
  const pathname = usePathname();
  const router = useRouter();
  const [boards, setBoards] = useState<BoardItem[]>([]);
  const [activeBoard, setActiveBoard] = useState<string>('');

  useEffect(() => {
    fetch('/api/boards').then(r => r.json()).then((data: BoardItem[]) => {
      setBoards(data);
      if (data.length > 0 && !activeBoard) {
        const saved = localStorage.getItem('activeBoardId');
        const found = saved && data.some(b => b.id === saved) ? saved : data[0].id;
        setActiveBoard(found);
        localStorage.setItem('activeBoardId', found);
      }
    }).catch(() => {});
  }, []);

  function selectBoard(id: string) {
    setActiveBoard(id);
    localStorage.setItem('activeBoardId', id);
    window.dispatchEvent(new Event('board-switched'));
    router.refresh();
  }

  return (
    <aside className="w-60 bg-white border-r border-gray-200 flex flex-col">
      <div className="p-4 border-b border-gray-200">
        <h1 className="text-lg font-bold text-gray-900">Kanban CRM</h1>
      </div>

      {boards.length > 1 && (
        <div className="p-2 border-b border-gray-200 space-y-1">
          <p className="px-3 text-xs font-medium text-gray-400 uppercase">Boards</p>
          {boards.map(board => (
            <button
              key={board.id}
              onClick={() => selectBoard(board.id)}
              className={clsx(
                'w-full text-left px-3 py-1.5 rounded-lg text-sm font-medium transition-colors',
                activeBoard === board.id
                  ? 'bg-primary-50 text-primary-700'
                  : 'text-gray-600 hover:bg-gray-50 hover:text-gray-900'
              )}
            >
              📌 {board.title}
            </button>
          ))}
        </div>
      )}

      <nav className="flex-1 p-2 space-y-1">
        {navItems.map((item) => (
          <Link
            key={item.href}
            href={item.href}
            className={clsx(
              'flex items-center gap-3 px-3 py-2 rounded-lg text-sm font-medium transition-colors',
              pathname === item.href
                ? 'bg-primary-50 text-primary-700'
                : 'text-gray-600 hover:bg-gray-50 hover:text-gray-900'
            )}
          >
            <span>{item.icon}</span>
            {item.label}
          </Link>
        ))}
      </nav>
    </aside>
  );
}
