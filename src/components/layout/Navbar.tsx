'use client';

import Link from 'next/link';
import { useSession, signOut } from 'next-auth/react';
import { useSocket } from '@/providers/SocketProvider';
import Button from '@/components/ui/Button';

export default function Navbar() {
  const { data: session } = useSession();
  const { connected } = useSocket();
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
    <header className="h-14 bg-white/95 backdrop-blur-md border-b border-slate-200 flex items-center justify-between px-3 sm:px-6 sticky top-0 z-30">
      {/* Left: Mobile Toggle + Brand Logo */}
      <div className="flex items-center gap-2 sm:gap-3 min-w-0">
        <button
          onClick={handleToggleMobileSidebar}
          className="p-1.5 -ml-1 rounded-lg text-slate-500 hover:text-slate-800 hover:bg-slate-100 md:hidden flex-shrink-0 transition-colors"
          title="Open menu"
        >
          <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M3.75 6.75h16.5M3.75 12h16.5m-16.5 5.25h16.5" />
          </svg>
        </button>
        <div className="flex items-center gap-2 sm:gap-2.5 min-w-0">
          <span className="w-8 h-8 rounded-xl bg-gradient-to-br from-primary-600 to-indigo-700 text-white text-xs font-bold flex items-center justify-center tracking-tight flex-shrink-0 shadow-2xs">
            JD
          </span>
          <div className="leading-tight min-w-0">
            <p className="text-sm font-bold text-slate-900 truncate max-w-[120px] sm:max-w-none">Jet Digital Pro</p>
            <p className="text-[11px] text-slate-400 truncate max-w-[120px] sm:max-w-none">{user?.tenantName || 'Kanban CRM'}</p>
          </div>
        </div>
      </div>

      {/* Right: Live Sync Pill + Guide Shortcut + User profile */}
      <div className="flex items-center gap-2 sm:gap-3 flex-shrink-0">
        {/* Real-time sync badge */}
        <div
          className={`hidden sm:inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-[11px] font-semibold border transition-all ${
            connected
              ? 'bg-emerald-50 text-emerald-700 border-emerald-200/80'
              : 'bg-amber-50 text-amber-700 border-amber-200/80'
          }`}
          title={connected ? 'Real-time synchronization connected' : 'Connecting to real-time events...'}
        >
          <span
            className={`w-1.5 h-1.5 rounded-full ${
              connected ? 'bg-emerald-600 animate-pulse' : 'bg-amber-500'
            }`}
          />
          <span>{connected ? 'Live Sync' : 'Connecting'}</span>
        </div>

        {/* User Guide Button */}
        <Link
          href="/dashboard/guide"
          className="inline-flex items-center gap-1.5 px-2.5 py-1 text-xs font-semibold text-slate-700 bg-slate-50 border border-slate-200/90 rounded-lg hover:bg-slate-100 hover:border-slate-300 transition-all shadow-2xs"
        >
          <span>📖</span>
          <span className="hidden sm:inline">Panduan</span>
        </Link>

        {/* User Avatar */}
        <div className="hidden sm:flex items-center gap-2">
          <span className="w-7 h-7 rounded-full bg-gradient-to-br from-primary-600 to-indigo-600 text-white text-xs font-bold flex items-center justify-center shadow-2xs">
            {initial}
          </span>
          <span className="text-xs font-medium text-slate-600 max-w-[140px] truncate">{user?.email}</span>
        </div>

        <Button variant="ghost" size="sm" onClick={handleSignOut} className="text-xs font-medium">
          Sign out
        </Button>
      </div>
    </header>
  );
}
