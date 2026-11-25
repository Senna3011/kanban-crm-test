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
        <p className="text-xs mt-1 opacity-90">
          Affected: <strong>AI email classification</strong> (lead/general/spam) and <strong>auto-draft follow-up</strong>.
          Without an active token, all emails go to the <strong>General</strong> column and drafts use default templates only.
        </p>
        <p className="text-xs mt-2 opacity-90">
          Fix: update <code className="bg-amber-100 px-1 rounded">DEEPSEEK_API_KEY</code> in <code className="bg-amber-100 px-1 rounded">.env</code> on the server, then restart the worker.
        </p>
      </div>
    </div>
  );
}
