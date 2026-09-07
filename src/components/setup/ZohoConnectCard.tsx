'use client';

import { useState } from 'react';
import Button from '@/components/ui/Button';

type BoardItem = { id: string; title: string };

export default function ZohoConnectCard({ boards }: { boards: BoardItem[] }) {
  const [selectedBoardId, setSelectedBoardId] = useState(boards[0]?.id || '');
  const [zohoEmail, setZohoEmail] = useState('');
  const [connecting, setConnecting] = useState(false);

  function handleConnect() {
    if (!zohoEmail.trim() || !zohoEmail.includes('@')) {
      alert('Please enter your valid Zoho email address.');
      return;
    }
    setConnecting(true);
    const params = new URLSearchParams();
    if (selectedBoardId) params.set('boardId', selectedBoardId);
    params.set('loginEmail', zohoEmail.trim());
    window.location.href = `/api/auth/zoho?${params.toString()}`;
  }

  return (
    <section className="bg-gradient-to-r from-blue-50 to-indigo-50 rounded-xl border border-blue-200 p-6">
      <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
        <div className="space-y-1">
          <div className="flex items-center gap-2">
            <span className="text-xl">📫</span>
            <h2 className="text-lg font-semibold text-gray-900">Connect with Zoho Mail (One-Click)</h2>
          </div>
          <p className="text-sm text-gray-600">
            Log in directly through official Zoho OAuth. No need to share your password or configure IMAP/SMTP ports manually.
          </p>
        </div>

        <div className="flex flex-col gap-3">
          <div className="flex items-center gap-2">
            <label className="text-xs font-medium text-gray-700 whitespace-nowrap">Your Zoho Email:</label>
            <input
              type="email"
              placeholder="you@zoho.com"
              className="px-3 py-2 border border-gray-300 rounded-lg text-sm bg-white focus:outline-none focus:ring-2 focus:ring-primary-500 flex-1 max-w-xs"
              value={zohoEmail}
              onChange={(e) => setZohoEmail(e.target.value)}
              required
            />
          </div>

          <div className="flex items-center gap-3">
            {boards.length > 0 && (
              <div className="flex items-center gap-2">
                <label className="text-xs font-medium text-gray-700 whitespace-nowrap">Link to Board:</label>
                <select
                  className="px-3 py-2 border border-gray-300 rounded-lg text-sm bg-white focus:outline-none focus:ring-2 focus:ring-primary-500"
                  value={selectedBoardId}
                  onChange={(e) => setSelectedBoardId(e.target.value)}
                >
                  {boards.map((b) => (
                    <option key={b.id} value={b.id}>
                      {b.title}
                    </option>
                  ))}
                </select>
              </div>
            )}

            <Button onClick={handleConnect} loading={connecting} className="bg-blue-600 hover:bg-blue-700 text-white whitespace-nowrap">
              Login with Zoho
            </Button>
          </div>
        </div>
      </div>
    </section>
  );
}
