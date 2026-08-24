'use client';

import { useState, useEffect } from 'react';

export default function AiStatusBanner() {
  const [status, setStatus] = useState<{ configured: boolean; valid?: boolean; message: string } | null>(null);

  useEffect(() => {
    fetch('/api/ai-status')
      .then(r => r.json())
      .then(setStatus)
      .catch(() => {});
  }, []);

  if (!status || status.valid) return null;

  return (
    <div className="px-4 py-3 rounded-lg border text-sm flex items-start gap-3 bg-amber-50 border-amber-300 text-amber-800">
      <span className="text-lg leading-none mt-0.5">⚠️</span>
      <div>
        <p className="font-medium">{status.message}</p>
        <p className="mt-1 text-xs text-amber-600">
          Fitur yang terpengaruh: <strong>AI email classification</strong> (lead/general/spam) dan <strong>auto-draft follow-up</strong>.
          Tanpa token aktif, semua email masuk ke kolom <strong>Unreads</strong> dan draft hanya menggunakan template default.
        </p>
        <p className="mt-1 text-xs text-amber-600">
          Cara fix: update <code className="bg-amber-100 px-1 rounded">DEEPSEEK_API_KEY</code> di file <code className="bg-amber-100 px-1 rounded">.env</code> di server, lalu restart worker.
        </p>
      </div>
    </div>
  );
}
