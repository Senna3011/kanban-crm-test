'use client';

import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';
import { useSession } from 'next-auth/react';
import clsx from 'clsx';

const navItems = [
  { href: '/dashboard', label: 'Board', icon: '📋' },
  { href: '/dashboard/team', label: 'Team', icon: '👥' },
  { href: '/dashboard/profile', label: 'Profil Saya', icon: '👤' },
  { href: '/dashboard/guide', label: 'Panduan', icon: '📖' },
  { href: '/dashboard/settings', label: 'Settings', icon: '⚙️' },
  { href: '/dashboard/spam', label: 'Spam Box', icon: '🛡️' },
];

type BoardItem = { id: string; title: string };

export default function Sidebar() {
  const { data: session } = useSession();
  const tenantName = (session?.user as any)?.tenantName || 'Kanban CRM';
  const isAdmin = (session?.user as any)?.role === 'admin';
  const pathname = usePathname();
  const router = useRouter();
  const [boards, setBoards] = useState<BoardItem[]>([]);
  const [activeBoard, setActiveBoard] = useState<string>('');
  const [mobileOpen, setMobileOpen] = useState(false);
  const [showNewBoardModal, setShowNewBoardModal] = useState(false);
  const [newBoardTitle, setNewBoardTitle] = useState('');
  const [creatingBoard, setCreatingBoard] = useState(false);
  const [boardError, setBoardError] = useState('');

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

        {/* Boards Selector & Creator */}
        <div className="p-3 border-b border-slate-100 space-y-1">
          <div className="flex items-center justify-between px-2">
            <p className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">Boards</p>
            {isAdmin && (
              <button
                onClick={() => {
                  setNewBoardTitle('');
                  setBoardError('');
                  setShowNewBoardModal(true);
                }}
                className="text-[11px] font-bold text-primary-600 hover:text-primary-800 hover:underline flex items-center gap-0.5"
                title="Buat Board Baru"
              >
                <span>+ Board</span>
              </button>
            )}
          </div>
          <div className="space-y-0.5 max-h-48 overflow-y-auto">
            {boards.map((board) => (
              <div
                key={board.id}
                className={clsx(
                  'group flex items-center justify-between rounded-lg text-xs font-semibold transition-all px-2.5 py-1.5',
                  activeBoard === board.id
                    ? 'bg-primary-50 text-primary-700 border border-primary-200/70 shadow-2xs'
                    : 'text-slate-600 hover:bg-slate-50 hover:text-slate-900'
                )}
              >
                <button
                  onClick={() => selectBoard(board.id)}
                  className="flex items-center gap-2 truncate flex-1 text-left"
                >
                  <span className="text-xs">📌</span>
                  <span className="truncate">{board.title}</span>
                </button>
                {isAdmin && boards.length > 1 && (
                  <button
                    onClick={async (e) => {
                      e.stopPropagation();
                      if (!confirm(`Hapus papan "${board.title}" beserta seluruh kartu di dalamnya?`)) return;
                      try {
                        const res = await fetch(`/api/boards/${board.id}`, { method: 'DELETE' });
                        if (res.ok) {
                          const updated = boards.filter((b) => b.id !== board.id);
                          setBoards(updated);
                          if (activeBoard === board.id && updated.length > 0) {
                            selectBoard(updated[0].id);
                          }
                        }
                      } catch {}
                    }}
                    className="opacity-0 group-hover:opacity-100 hover:text-red-600 p-0.5 rounded transition text-[11px]"
                    title="Hapus Board"
                  >
                    🗑️
                  </button>
                )}
              </div>
            ))}
          </div>
        </div>

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
            <p className="font-semibold text-slate-600 truncate">{tenantName}</p>
            <p className="text-[10px] text-slate-400 mt-0.5">v2.4 • Multi-Tenant CRM</p>
          </div>
        </div>
      </aside>

      {/* Modal Form: Buat Board Baru */}
      {showNewBoardModal && (
        <div className="fixed inset-0 bg-slate-900/50 backdrop-blur-xs flex items-center justify-center p-4 z-50">
          <div className="bg-white rounded-2xl max-w-sm w-full p-5 sm:p-6 shadow-xl border border-slate-200 space-y-4">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <span className="text-base">📌</span>
                <h3 className="text-sm font-bold text-slate-900">Buat Papan (Board) Baru</h3>
              </div>
              <button
                onClick={() => setShowNewBoardModal(false)}
                className="text-slate-400 hover:text-slate-600 text-lg leading-none"
              >
                ✕
              </button>
            </div>
            <p className="text-xs text-slate-500">
              Tambahkan papan kerja baru untuk memisahkan alur task atau saluran email tim Anda.
            </p>

            {boardError && (
              <div className="text-xs text-red-600 bg-red-50 border border-red-100 rounded-lg p-2">
                {boardError}
              </div>
            )}

            <form
              onSubmit={async (e) => {
                e.preventDefault();
                if (!newBoardTitle.trim()) {
                  setBoardError('Nama board tidak boleh kosong.');
                  return;
                }
                setCreatingBoard(true);
                setBoardError('');
                try {
                  const res = await fetch('/api/boards', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ title: newBoardTitle.trim() }),
                  });
                  if (res.ok) {
                    const newBoard = await res.json();
                    setBoards((prev) => [...prev, newBoard]);
                    selectBoard(newBoard.id);
                    setShowNewBoardModal(false);
                    setNewBoardTitle('');
                  } else {
                    const data = await res.json();
                    setBoardError(data.error || 'Gagal membuat board.');
                  }
                } catch {
                  setBoardError('Terjadi kesalahan koneksi.');
                } finally {
                  setCreatingBoard(false);
                }
              }}
              className="space-y-3"
            >
              <div>
                <label className="block text-[11px] font-bold text-slate-600 uppercase mb-1">
                  Nama Papan *
                </label>
                <input
                  type="text"
                  required
                  autoFocus
                  placeholder="Contoh: Leads, CS Support, Project"
                  value={newBoardTitle}
                  onChange={(e) => setNewBoardTitle(e.target.value)}
                  className="w-full px-3 py-2 text-xs border border-slate-300 rounded-xl focus:ring-2 focus:ring-primary-500 focus:outline-none"
                />
              </div>

              <div className="flex items-center justify-end gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => setShowNewBoardModal(false)}
                  className="px-3.5 py-1.5 text-xs font-semibold text-slate-600 hover:bg-slate-100 rounded-xl transition"
                >
                  Batal
                </button>
                <button
                  type="submit"
                  disabled={creatingBoard}
                  className="px-4 py-1.5 text-xs font-semibold bg-primary-600 hover:bg-primary-700 disabled:opacity-50 text-white rounded-xl shadow-xs transition"
                >
                  {creatingBoard ? 'Membuat...' : 'Buat Board'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </>
  );
}
