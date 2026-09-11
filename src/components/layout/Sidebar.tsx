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
    fetch('/api/boards')
      .then((r) => r.json())
      .then((data: BoardItem[]) => {
        setBoards(data);
        if (data.length > 0 && !activeBoard) {
          const saved = localStorage.getItem('activeBoardId');
          const found = saved && data.some((b) => b.id === saved) ? saved : data[0].id;
          setActiveBoard(found);
          localStorage.setItem('activeBoardId', found);
        }
      })
      .catch(() => {});
  }, [activeBoard]);

  // Listen for mobile sidebar toggle from Navbar
  useEffect(() => {
    const handleToggle = () => setMobileOpen((prev) => !prev);
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
          'fixed inset-y-0 left-0 z-50 w-64 bg-white border-r border-slate-200/90 flex flex-col transition-transform duration-200 ease-in-out md:static md:translate-x-0 md:z-auto md:w-60 shadow-xs',
          mobileOpen ? 'translate-x-0 shadow-2xl' : '-translate-x-full md:translate-x-0'
        )}
      >
        {/* Brand Header */}
        <div className="p-4 border-b border-slate-200/80 flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <span className="w-7 h-7 rounded-lg bg-gradient-to-br from-primary-600 to-indigo-700 text-white font-bold flex items-center justify-center text-xs shadow-2xs">
              CRM
            </span>
            <h1 className="text-base font-bold text-slate-900 tracking-tight">Kanban CRM</h1>
          </div>
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

        {/* Boards Selector */}
        {boards.length > 1 && (
          <div className="p-3 border-b border-slate-100 space-y-1">
            <p className="px-2 text-[10px] font-bold text-slate-400 uppercase tracking-wider">Boards</p>
            <div className="space-y-0.5">
              {boards.map((board) => (
                <button
                  key={board.id}
                  onClick={() => selectBoard(board.id)}
                  className={clsx(
                    'w-full text-left px-2.5 py-1.5 rounded-lg text-xs font-semibold transition-all flex items-center gap-2',
                    activeBoard === board.id
                      ? 'bg-primary-50 text-primary-700 border border-primary-200/70 shadow-2xs'
                      : 'text-slate-600 hover:bg-slate-50 hover:text-slate-900'
                  )}
                >
                  <span className="text-xs">📌</span>
                  <span className="truncate">{board.title}</span>
                </button>
              ))}
            </div>
          </div>
        )}

        {/* Main Nav Links */}
        <nav className="flex-1 p-3 space-y-1 overflow-y-auto">
          <p className="px-2 text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-1">Navigation</p>
          {navItems.map((item) => {
            const isActive = pathname === item.href;
            return (
              <Link
                key={item.href}
                href={item.href}
                onClick={() => setMobileOpen(false)}
                className={clsx(
                  'flex items-center gap-2.5 px-2.5 py-2 rounded-xl text-xs font-semibold transition-all',
                  isActive
                    ? 'bg-primary-600 text-white shadow-xs font-bold'
                    : 'text-slate-600 hover:bg-slate-100/80 hover:text-slate-900'
                )}
              >
                <span className="text-sm">{item.icon}</span>
                <span>{item.label}</span>
              </Link>
            );
          })}
        </nav>

        {/* Sidebar Footer info */}
        <div className="p-3 border-t border-slate-100 bg-slate-50/50">
          <div className="px-2 py-1 text-[11px] text-slate-400">
            <p className="font-semibold text-slate-600">Jet Digital Pro CRM</p>
            <p className="text-[10px] text-slate-400 mt-0.5">v2.4 • Production Ready</p>
          </div>
        </div>
      </aside>
    </>
  );
}
