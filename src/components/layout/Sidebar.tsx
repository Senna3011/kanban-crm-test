'use client';

import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';
import clsx from 'clsx';

const navItems = [
  { href: '/dashboard', label: 'Board', icon: '📋' },
  { href: '/dashboard/guide', label: 'Panduan', icon: '📖' },
  { href: '/dashboard/settings', label: 'Settings', icon: '⚙️' },
  { href: '/dashboard/spam', label: 'Spam Box', icon: '🛡️' },
];

type BoardItem = { id: string; title: string };

export default function Sidebar() {
  const pathname = usePathname();
  const router = useRouter();
  const [boards, setBoards] = useState<BoardItem[]>([]);
  const [activeBoard, setActiveBoard] = useState<string>('');
  const [mobileOpen, setMobileOpen] = useState(false);

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

  // Listen for mobile sidebar toggle from Navbar
  useEffect(() => {
    const handleToggle = () => setMobileOpen(prev => !prev);
    const handleClose = () => setMobileOpen(false);
    window.addEventListener('toggle-mobile-sidebar', handleToggle);
    window.addEventListener('close-mobile-sidebar', handleClose);
    return () => {
      window.removeEventListener('toggle-mobile-sidebar', handleToggle);
      window.removeEventListener('close-mobile-sidebar', handleClose);
    };
  }, []);

  // Close mobile sidebar on route change
  useEffect(() => {
    setMobileOpen(false);
  }, [pathname]);

  function selectBoard(id: string) {
    setActiveBoard(id);
    localStorage.setItem('activeBoardId', id);
    window.dispatchEvent(new Event('board-switched'));
    setMobileOpen(false);
    router.refresh();
  }

  return (
    <>
      {/* Mobile backdrop */}
      {mobileOpen && (
        <div
          className="fixed inset-0 bg-slate-900/50 backdrop-blur-xs z-40 md:hidden transition-opacity"
          onClick={() => setMobileOpen(false)}
        />
      )}

      {/* Sidebar container (static on desktop, slide-over drawer on mobile) */}
      <aside
        className={clsx(
          'fixed inset-y-0 left-0 z-50 w-64 bg-white border-r border-slate-200 flex flex-col transition-transform duration-200 ease-in-out md:static md:translate-x-0 md:z-auto md:w-60',
          mobileOpen ? 'translate-x-0 shadow-2xl' : '-translate-x-full md:translate-x-0'
        )}
      >
        <div className="p-4 border-b border-slate-200 flex items-center justify-between">
          <h1 className="text-lg font-bold text-slate-900 tracking-tight">Kanban CRM</h1>
          <button
            onClick={() => setMobileOpen(false)}
            className="p-1.5 rounded-lg text-slate-400 hover:text-slate-600 hover:bg-slate-100 md:hidden"
            title="Close menu"
          >
            <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        {boards.length > 1 && (
          <div className="p-2 border-b border-slate-200 space-y-1">
            <p className="px-3 text-xs font-medium text-slate-400 uppercase tracking-wider">Boards</p>
            {boards.map(board => (
              <button
                key={board.id}
                onClick={() => selectBoard(board.id)}
                className={clsx(
                  'w-full text-left px-3 py-2 rounded-lg text-sm font-medium transition-colors flex items-center gap-2',
                  activeBoard === board.id
                    ? 'bg-primary-50 text-primary-700'
                    : 'text-slate-600 hover:bg-slate-50 hover:text-slate-900'
                )}
              >
                <span>📌</span>
                <span className="truncate">{board.title}</span>
              </button>
            ))}
          </div>
        )}

        <nav className="flex-1 p-2 space-y-1 overflow-y-auto">
          {navItems.map((item) => (
            <Link
              key={item.href}
              href={item.href}
              onClick={() => setMobileOpen(false)}
              className={clsx(
                'flex items-center gap-3 px-3 py-2 rounded-lg text-sm font-medium transition-colors',
                pathname === item.href
                  ? 'bg-primary-50 text-primary-700'
                  : 'text-slate-600 hover:bg-slate-50 hover:text-slate-900'
              )}
            >
              <span>{item.icon}</span>
              {item.label}
            </Link>
          ))}
        </nav>
      </aside>
    </>
  );
}
