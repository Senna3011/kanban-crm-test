'use client';

import Link from 'next/link';
import { useState, useEffect } from 'react';
import { useSession, signOut } from 'next-auth/react';
import { useSocket } from '@/providers/SocketProvider';
import Button from '@/components/ui/Button';

export default function Navbar() {
  const { data: session } = useSession();
  const { connected } = useSocket();
  const [isOffline, setIsOffline] = useState(false);
  const [profileMeta, setProfileMeta] = useState<{
    user?: { name?: string | null; email?: string; avatar?: string | null; role?: string };
    tenant?: { name?: string; logoUrl?: string };
  }>({});

  const sessionUser = session?.user as any;

  useEffect(() => {
    fetch('/api/profile-meta')
      .then((r) => (r.ok ? r.json() : {}))
      .then((data: any) => {
        if (data && (data.user || data.tenant)) {
          setProfileMeta(data);
        }
      })
      .catch(() => {});
  }, [sessionUser?.id]);

  useEffect(() => {
    const handleOnline = () => setIsOffline(false);
    const handleOffline = () => setIsOffline(true);

    if (typeof window !== 'undefined') {
      setIsOffline(!navigator.onLine);
      window.addEventListener('online', handleOnline);
      window.addEventListener('offline', handleOffline);
    }

    return () => {
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
    };
  }, []);

  async function handleSignOut() {
    const callbackUrl = typeof window !== 'undefined' ? `${window.location.origin}/login` : '/login';
    await signOut({ callbackUrl });
  }

  function handleToggleMobileSidebar() {
    window.dispatchEvent(new Event('toggle-mobile-sidebar'));
  }

  const currentUserEmail = profileMeta.user?.email || sessionUser?.email || '';
  const currentUserName = profileMeta.user?.name || sessionUser?.name || '';
  const currentUserAvatar = profileMeta.user?.avatar || sessionUser?.avatar || '';
  const currentRole = profileMeta.user?.role || sessionUser?.role || 'member';
  const tenantName = profileMeta.tenant?.name || sessionUser?.tenantName || 'Workspace';
  const tenantLogo = profileMeta.tenant?.logoUrl || '';

  const initial = (currentUserName || currentUserEmail || '?').charAt(0).toUpperCase();

  return (
    <>
      {isOffline && (
        <div className="bg-rose-600 text-white text-xs font-semibold py-1.5 px-4 text-center flex items-center justify-center gap-2 animate-pulse sticky top-0 z-40">
          <span>📡</span>
          <span>Koneksi internet terputus. Sistem akan otomatis menyinkronkan data saat kembali online.</span>
        </div>
      )}
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
            <span className="w-8 h-8 rounded-xl bg-gradient-to-br from-primary-600 to-indigo-700 text-white text-xs font-bold flex items-center justify-center tracking-tight flex-shrink-0 shadow-2xs overflow-hidden border border-slate-200/80">
              {tenantLogo ? (
                <img src={tenantLogo} alt="Logo" className="w-full h-full object-cover" onError={(e) => { (e.target as any).style.display = 'none'; }} />
              ) : (
                (tenantName || 'CR').substring(0, 2).toUpperCase()
              )}
            </span>
            <div className="leading-tight min-w-0">
              <p className="text-sm font-bold text-slate-900 truncate max-w-[140px] sm:max-w-xs">
                {tenantName}
              </p>
              <p className="text-[11px] text-slate-400 truncate max-w-[140px] sm:max-w-xs">
                {currentRole === 'admin' ? 'Administrator' : 'Team Member'}
              </p>
            </div>
          </div>
        </div>

        {/* Right: Live Sync Pill + Guide Shortcut + User profile */}
        <div className="flex items-center gap-2 sm:gap-3 flex-shrink-0">
          {/* Real-time sync badge */}
          <div
            className={`hidden sm:inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-[11px] font-semibold border transition-all ${
              isOffline
                ? 'bg-rose-50 text-rose-700 border-rose-200/80'
                : connected
                ? 'bg-emerald-50 text-emerald-700 border-emerald-200/80'
                : 'bg-amber-50 text-amber-700 border-amber-200/80'
            }`}
            title={
              isOffline
                ? 'Offline — periksa koneksi internet'
                : connected
                ? 'Real-time synchronization connected'
                : 'Connecting to real-time events...'
            }
          >
            <span
              className={`w-1.5 h-1.5 rounded-full ${
                isOffline ? 'bg-rose-500' : connected ? 'bg-emerald-600 animate-pulse' : 'bg-amber-500'
              }`}
            />
            <span>{isOffline ? 'Offline' : connected ? 'Live Sync' : 'Connecting'}</span>
          </div>

          {/* User Guide Button */}
          <Link
            href="/dashboard/guide"
            className="inline-flex items-center gap-1.5 px-2.5 py-1 text-xs font-semibold text-slate-700 bg-slate-50 border border-slate-200/90 rounded-lg hover:bg-slate-100 hover:border-slate-300 transition-all shadow-2xs"
          >
            <span>📖</span>
            <span className="hidden sm:inline">Panduan</span>
          </Link>

          {/* User Avatar & Profile Link */}
          <Link
            href="/dashboard/profile"
            className="hidden sm:flex items-center gap-2 p-1 rounded-xl hover:bg-slate-100 transition"
            title="Buka Profil Saya"
          >
            <span className="w-7 h-7 rounded-full bg-gradient-to-br from-primary-600 to-indigo-600 text-white text-xs font-bold flex items-center justify-center shadow-2xs overflow-hidden border border-slate-200">
              {currentUserAvatar ? (
                <img src={currentUserAvatar} alt="Avatar" className="w-full h-full object-cover" onError={(e) => { (e.target as any).style.display = 'none'; }} />
              ) : (
                initial
              )}
            </span>
            <span className="text-xs font-medium text-slate-700 max-w-[130px] truncate">{currentUserName || currentUserEmail}</span>
          </Link>

          <Button variant="ghost" size="sm" onClick={handleSignOut} className="text-xs font-medium">
            Sign out
          </Button>
        </div>
      </header>
    </>
  );
}
