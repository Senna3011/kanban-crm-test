'use client';

import { useSession, signOut } from 'next-auth/react';
import Button from '@/components/ui/Button';

export default function Navbar() {
  const { data: session } = useSession();
  const user = session?.user as any;

  async function handleSignOut() {
    const callbackUrl = typeof window !== 'undefined' ? `${window.location.origin}/login` : '/login';
    await signOut({ callbackUrl });
  }

  function handleToggleMobileSidebar() {
    window.dispatchEvent(new Event('toggle-mobile-sidebar'));
  }

  const initial = (user?.email || '?').charAt(0).toUpperCase();

  return (
    <header className="h-14 bg-white border-b border-slate-200 flex items-center justify-between px-3 sm:px-6">
      <div className="flex items-center gap-2 sm:gap-3 min-w-0">
        <button
          onClick={handleToggleMobileSidebar}
          className="p-1.5 -ml-1 rounded-lg text-slate-500 hover:text-slate-800 hover:bg-slate-100 md:hidden flex-shrink-0"
          title="Open menu"
        >
          <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M3.75 6.75h16.5M3.75 12h16.5m-16.5 5.25h16.5" />
          </svg>
        </button>
        <div className="flex items-center gap-2 sm:gap-2.5 min-w-0">
          <span className="w-8 h-8 rounded-lg bg-gradient-to-br from-primary-600 to-primary-800 text-white text-xs font-bold flex items-center justify-center tracking-tight flex-shrink-0">
            JD
          </span>
          <div className="leading-tight min-w-0">
            <p className="text-sm font-semibold text-slate-900 truncate">Jet Digital Pro</p>
            <p className="text-[11px] text-slate-400 truncate">{user?.tenantName || 'Kanban CRM'}</p>
          </div>
        </div>
      </div>
      <div className="flex items-center gap-2 sm:gap-4 flex-shrink-0">
        <div className="hidden sm:flex items-center gap-2.5">
          <span className="w-7 h-7 rounded-full bg-slate-100 border border-slate-200 text-slate-600 text-xs font-semibold flex items-center justify-center">
            {initial}
          </span>
          <span className="text-sm text-slate-500 max-w-[150px] truncate">{user?.email}</span>
        </div>
        <Button variant="ghost" size="sm" onClick={handleSignOut}>Sign out</Button>
      </div>
    </header>
  );
}
