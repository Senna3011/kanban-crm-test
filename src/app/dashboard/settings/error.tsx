'use client';

import { useEffect } from 'react';
import Link from 'next/link';

export default function SettingsError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error('[SETTINGS ERROR BOUNDARY]', error);
  }, [error]);

  return (
    <div className="max-w-xl mx-auto my-12 p-6 bg-white rounded-2xl border border-slate-200 shadow-xs text-center space-y-4">
      <div className="w-12 h-12 rounded-full bg-red-50 text-red-600 flex items-center justify-center mx-auto text-xl">
        ⚠️
      </div>
      <div>
        <h2 className="text-base font-bold text-slate-900">Failed to Load Settings</h2>
        <p className="text-xs text-slate-500 mt-1 max-w-sm mx-auto">
          Unable to establish connection with database services. Please verify database connectivity or try again.
        </p>
      </div>
      <div className="pt-2 flex items-center justify-center gap-3">
        <Link
          href="/dashboard"
          className="px-4 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs font-semibold rounded-xl transition-colors"
        >
          ← Back to Board
        </Link>
        <button
          onClick={() => reset()}
          className="px-4 py-2 bg-primary-600 hover:bg-primary-700 text-white text-xs font-semibold rounded-xl transition-colors"
        >
          Retry Connection
        </button>
      </div>
    </div>
  );
}
