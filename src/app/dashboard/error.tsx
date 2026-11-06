'use client';

import { useEffect } from 'react';
import Link from 'next/link';

export default function DashboardError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error('[DASHBOARD ERROR BOUNDARY]', error);
  }, [error]);

  return (
    <div className="flex-1 flex items-center justify-center p-6 bg-slate-50 dark:bg-[#1D2125]">
      <div className="max-w-md w-full p-8 bg-white dark:bg-[#22272B] rounded-2xl border border-slate-200 dark:border-[#2C333A] shadow-lg text-center space-y-4">
        <div className="w-12 h-12 rounded-full bg-rose-50 dark:bg-rose-950/40 text-rose-600 dark:text-rose-400 flex items-center justify-center mx-auto text-xl">
          ⚠️
        </div>
        <div>
          <h2 className="text-lg font-bold text-slate-900 dark:text-[#B6C2CF]">Terjadi Kesalahan di Dashboard</h2>
          <p className="text-xs text-slate-500 dark:text-[#9FADBC] mt-2">
            Gagal memuat komponen dashboard. Silakan muat ulang atau coba lagi.
          </p>
        </div>
        <div className="pt-3 flex items-center justify-center gap-3">
          <Link
            href="/dashboard"
            className="px-4 py-2 bg-slate-100 hover:bg-slate-200 dark:bg-[#161A1D] dark:hover:bg-[#2C333A] text-slate-700 dark:text-[#B6C2CF] text-xs font-semibold rounded-xl transition-colors"
          >
            Refresh Board
          </Link>
          <button
            onClick={() => reset()}
            className="px-4 py-2 bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-semibold rounded-xl transition-colors"
          >
            Coba Lagi
          </button>
        </div>
      </div>
    </div>
  );
}
