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

  const initial = (user?.email || '?').charAt(0).toUpperCase();

  return (
    <header className="h-14 bg-white border-b border-slate-200 flex items-center justify-between px-6">
      <div className="flex items-center gap-3">
        <div className="flex items-center gap-2.5">
          <span className="w-8 h-8 rounded-lg bg-gradient-to-br from-primary-600 to-primary-800 text-white text-xs font-bold flex items-center justify-center tracking-tight">
            JD
          </span>
          <div className="leading-tight">
            <p className="text-sm font-semibold text-slate-900">Jet Digital Pro</p>
            <p className="text-[11px] text-slate-400">{user?.tenantName || 'Kanban CRM'}</p>
          </div>
        </div>
      </div>
      <div className="flex items-center gap-4">
        <div className="hidden sm:flex items-center gap-2.5">
          <span className="w-7 h-7 rounded-full bg-slate-100 border border-slate-200 text-slate-600 text-xs font-semibold flex items-center justify-center">
            {initial}
          </span>
          <span className="text-sm text-slate-500">{user?.email}</span>
        </div>
        <Button variant="ghost" size="sm" onClick={handleSignOut}>Sign out</Button>
      </div>
    </header>
  );
}
