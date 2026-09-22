'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';

interface OutreachAccount {
  id: string;
  name: string;
  senderName: string;
  senderEmail: string;
  smtpHost: string;
  smtpPort: number;
  smtpUser: string;
  dailyLimit: number;
  sentToday: number;
  isActive: boolean;
  createdAt: string;
}

export default function OutreachSettingsPage() {
  const [accounts, setAccounts] = useState<OutreachAccount[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');

  // Form State
  const [editingId, setEditingId] = useState<string | null>(null);
  const [name, setName] = useState('Outreach Primary Sender');
  const [senderName, setSenderName] = useState('Outreach Team');
  const [senderEmail, setSenderEmail] = useState('');
  const [smtpHost, setSmtpHost] = useState('smtp.zoho.com');
  const [smtpPort, setSmtpPort] = useState(465);
  const [smtpUser, setSmtpUser] = useState('');
  const [smtpPass, setSmtpPass] = useState('');
  const [dailyLimit, setDailyLimit] = useState(50);
  const [isActive, setIsActive] = useState(true);

  const [saving, setSaving] = useState(false);
  const [testingConnection, setTestingConnection] = useState(false);

  useEffect(() => {
    fetchAccounts();
  }, []);

  async function fetchAccounts() {
    setLoading(true);
    setError('');
    try {
      const res = await fetch('/api/outreach/accounts');
      if (!res.ok) throw new Error('Failed to load accounts');
      const data = await res.json();
      const list = Array.isArray(data) ? data : data.accounts || [];
      setAccounts(list);
      if (list.length > 0 && !editingId) {
        selectForEdit(list[0]);
      }
    } catch (err: any) {
      setError(err.message || 'Connection error');
    } finally {
      setLoading(false);
    }
  }

  function selectForEdit(acc: OutreachAccount) {
    setEditingId(acc.id);
    setName(acc.name);
    setSenderName(acc.senderName);
    setSenderEmail(acc.senderEmail);
    setSmtpHost(acc.smtpHost);
    setSmtpPort(acc.smtpPort);
    setSmtpUser(acc.smtpUser);
    setSmtpPass('');
    setDailyLimit(acc.dailyLimit);
    setIsActive(acc.isActive);
  }

  function resetFormNew() {
    setEditingId(null);
    setName('Outreach Mailbox ' + (accounts.length + 1));
    setSenderName('Outreach Team');
    setSenderEmail('');
    setSmtpHost('smtp.zoho.com');
    setSmtpPort(465);
    setSmtpUser('');
    setSmtpPass('');
    setDailyLimit(50);
    setIsActive(true);
  }

  async function handleTestConnection() {
    if (!smtpHost || !smtpPort || !smtpUser || !smtpPass) {
      setError('Please provide SMTP Host, Port, User, and Password to test connection.');
      return;
    }
    setTestingConnection(true);
    setError('');
    setSuccess('');
    try {
      const res = await fetch('/api/outreach/accounts/test-connection', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          smtpHost,
          smtpPort,
          smtpUser,
          smtpPass,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Connection failed');
      setSuccess(data.message || 'SMTP verified successfully!');
    } catch (err: any) {
      setError(err.message);
    } finally {
      setTestingConnection(false);
    }
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!senderEmail) {
      setError('Sender Email is required.');
      return;
    }

    setSaving(true);
    setError('');
    setSuccess('');

    try {
      const payload: any = {
        name,
        senderName,
        senderEmail: senderEmail.trim().toLowerCase(),
        smtpHost,
        smtpPort: Number(smtpPort),
        smtpUser: smtpUser || senderEmail.trim().toLowerCase(),
        dailyLimit: Number(dailyLimit),
        isActive,
      };
      if (smtpPass) {
        payload.smtpPass = smtpPass;
      }

      const url = editingId ? `/api/outreach/accounts/${editingId}` : '/api/outreach/accounts';
      const method = editingId ? 'PATCH' : 'POST';

      const res = await fetch(url, {
        method,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });

      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Failed to save account');

      setSuccess(editingId ? 'Outreach account updated successfully!' : 'New outreach account created successfully!');
      await fetchAccounts();
    } catch (err: any) {
      setError(err.message);
    } finally {
      setSaving(false);
    }
  }

  async function handleDelete(id: string, accName: string) {
    if (!confirm(`Are you sure you want to delete account "${accName}"?`)) return;
    try {
      const res = await fetch(`/api/outreach/accounts/${id}`, { method: 'DELETE' });
      if (!res.ok) throw new Error('Failed to delete account');
      setSuccess('Account deleted successfully.');
      if (editingId === id) resetFormNew();
      await fetchAccounts();
    } catch (err: any) {
      setError(err.message);
    }
  }

  return (
    <div className="p-4 sm:p-6 lg:p-8 max-w-5xl mx-auto space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <Link
            href="/dashboard/outreach"
            className="text-xs font-semibold text-primary-600 hover:text-primary-800 flex items-center gap-1 mb-1"
          >
            ← Back to Outreach Campaigns
          </Link>
          <h1 className="text-xl font-bold text-slate-900 tracking-tight">Outreach Sender Accounts</h1>
          <p className="text-xs text-slate-500 mt-0.5">
            Configure dedicated outbound SMTP mailboxes for your cold outreach campaigns.
          </p>
        </div>
        <button
          onClick={resetFormNew}
          className="px-4 py-2 bg-primary-600 hover:bg-primary-700 text-white text-xs font-semibold rounded-xl shadow-xs transition-colors flex items-center gap-1.5 self-start sm:self-auto"
        >
          <span>+ Add New Sender Mailbox</span>
        </button>
      </div>

      {/* Status Messages */}
      {error && (
        <div className="p-3.5 bg-red-50 border border-red-200 text-xs text-red-700 rounded-xl flex items-center justify-between">
          <span>{error}</span>
          <button onClick={() => setError('')} className="font-bold text-red-800">✕</button>
        </div>
      )}
      {success && (
        <div className="p-3.5 bg-emerald-50 border border-emerald-200 text-xs text-emerald-800 rounded-xl flex items-center justify-between">
          <span>{success}</span>
          <button onClick={() => setSuccess('')} className="font-bold text-emerald-900">✕</button>
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Left: Accounts List */}
        <div className="space-y-3 lg:col-span-1">
          <div className="bg-white p-4 rounded-2xl border border-slate-200/80 shadow-xs space-y-3">
            <h2 className="text-xs font-bold text-slate-400 uppercase tracking-wider">
              Connected Mailboxes ({accounts.length})
            </h2>

            {loading ? (
              <p className="text-xs text-slate-400 py-4 text-center">Loading accounts...</p>
            ) : accounts.length === 0 ? (
              <div className="p-6 text-center text-xs text-slate-400 space-y-2">
                <p>No outreach senders configured.</p>
                <p className="text-[11px] text-amber-700 bg-amber-50 p-2 rounded-lg border border-amber-200">
                  Required: Outreach campaigns require at least 1 verified sender mailbox to dispatch emails.
                </p>
              </div>
            ) : (
              <div className="space-y-2">
                {accounts.map((acc) => (
                  <div
                    key={acc.id}
                    onClick={() => selectForEdit(acc)}
                    className={`p-3 rounded-xl border cursor-pointer transition-all ${
                      editingId === acc.id
                        ? 'bg-primary-50/50 border-primary-300 ring-1 ring-primary-300'
                        : 'bg-white border-slate-200/80 hover:bg-slate-50'
                    }`}
                  >
                    <div className="flex items-center justify-between">
                      <p className="text-xs font-bold text-slate-900 truncate">{acc.name}</p>
                      <span
                        className={`text-[10px] font-bold px-1.5 py-0.5 rounded-md ${
                          acc.isActive ? 'bg-emerald-100 text-emerald-800' : 'bg-slate-100 text-slate-500'
                        }`}
                      >
                        {acc.isActive ? 'Active' : 'Inactive'}
                      </span>
                    </div>
                    <p className="text-[11px] font-mono text-slate-600 truncate mt-0.5">{acc.senderEmail}</p>
                    <div className="flex items-center justify-between text-[10px] text-slate-400 mt-2 border-t border-slate-100 pt-1.5">
                      <span>Limit: {acc.sentToday}/{acc.dailyLimit}/day</span>
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          handleDelete(acc.id, acc.name);
                        }}
                        className="text-red-500 hover:text-red-700 font-semibold"
                      >
                        Delete
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>

        {/* Right: Form */}
        <div className="lg:col-span-2">
          <form
            onSubmit={handleSubmit}
            className="bg-white p-6 rounded-2xl border border-slate-200/80 shadow-xs space-y-6"
          >
            <div className="border-b border-slate-100 pb-3 flex items-center justify-between">
              <div>
                <h2 className="text-sm font-bold text-slate-900">
                  {editingId ? 'Edit Outreach Sender Mailbox' : 'Add New Outreach Sender Mailbox'}
                </h2>
                <p className="text-[11px] text-slate-500">
                  Configure SMTP delivery credentials for this sender account.
                </p>
              </div>
              <div className="flex items-center gap-2">
                <label className="text-xs font-semibold text-slate-700">Active</label>
                <input
                  type="checkbox"
                  checked={isActive}
                  onChange={(e) => setIsActive(e.target.checked)}
                  className="rounded border-slate-300 text-primary-600 focus:ring-primary-500 w-4 h-4"
                />
              </div>
            </div>

            {/* General Identity */}
            <div className="space-y-3">
              <h3 className="text-xs font-bold text-slate-400 uppercase tracking-wider">1. Sender Identity</h3>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">Account Label *</label>
                  <input
                    type="text"
                    required
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    placeholder="e.g., US Enterprise Cold Mailer"
                    className="w-full px-3 py-2 border border-slate-300 rounded-xl text-xs focus:ring-2 focus:ring-primary-500 focus:outline-none"
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">Sender Display Name *</label>
                  <input
                    type="text"
                    required
                    value={senderName}
                    onChange={(e) => setSenderName(e.target.value)}
                    placeholder="e.g., Salman Faris"
                    className="w-full px-3 py-2 border border-slate-300 rounded-xl text-xs focus:ring-2 focus:ring-primary-500 focus:outline-none"
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">Sender Email Address *</label>
                  <input
                    type="email"
                    required
                    value={senderEmail}
                    onChange={(e) => setSenderEmail(e.target.value)}
                    placeholder="outreach@yourdomain.com"
                    className="w-full px-3 py-2 border border-slate-300 rounded-xl text-xs focus:ring-2 focus:ring-primary-500 focus:outline-none font-mono"
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">Daily Sending Limit</label>
                  <input
                    type="number"
                    min={5}
                    max={2000}
                    value={dailyLimit}
                    onChange={(e) => setDailyLimit(Number(e.target.value))}
                    className="w-full px-3 py-2 border border-slate-300 rounded-xl text-xs focus:ring-2 focus:ring-primary-500 focus:outline-none"
                  />
                </div>
              </div>
            </div>

            {/* SMTP Configuration */}
            <div className="space-y-3 border-t border-slate-100 pt-4">
              <h3 className="text-xs font-bold text-slate-400 uppercase tracking-wider">2. SMTP Outbound Dispatch Server</h3>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">SMTP Host</label>
                  <input
                    type="text"
                    value={smtpHost}
                    onChange={(e) => setSmtpHost(e.target.value)}
                    placeholder="smtp.zoho.com or smtp.gmail.com"
                    className="w-full px-3 py-2 border border-slate-300 rounded-xl text-xs focus:ring-2 focus:ring-primary-500 focus:outline-none font-mono"
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">SMTP Port</label>
                  <input
                    type="number"
                    value={smtpPort}
                    onChange={(e) => setSmtpPort(Number(e.target.value))}
                    placeholder="465 or 587"
                    className="w-full px-3 py-2 border border-slate-300 rounded-xl text-xs focus:ring-2 focus:ring-primary-500 focus:outline-none font-mono"
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">SMTP Username / Email</label>
                  <input
                    type="text"
                    value={smtpUser}
                    onChange={(e) => setSmtpUser(e.target.value)}
                    placeholder="Leave empty to use Sender Email"
                    className="w-full px-3 py-2 border border-slate-300 rounded-xl text-xs focus:ring-2 focus:ring-primary-500 focus:outline-none font-mono"
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">
                    SMTP Password / App Password {editingId && '(Kosongkan jika tidak diubah)'}
                  </label>
                  <input
                    type="password"
                    value={smtpPass}
                    onChange={(e) => setSmtpPass(e.target.value)}
                    placeholder={editingId ? '••••••••' : 'App-specific password'}
                    className="w-full px-3 py-2 border border-slate-300 rounded-xl text-xs focus:ring-2 focus:ring-primary-500 focus:outline-none"
                  />
                </div>
              </div>

              <div className="pt-2">
                <button
                  type="button"
                  disabled={testingConnection || !smtpPass}
                  onClick={handleTestConnection}
                  className="px-3.5 py-1.5 bg-slate-100 hover:bg-slate-200 text-slate-800 text-xs font-semibold rounded-lg transition-colors disabled:opacity-50 flex items-center gap-1.5"
                >
                  <span>{testingConnection ? '⏳' : '⚡'}</span>
                  <span>Test SMTP Handshake</span>
                </button>
              </div>
            </div>

            {/* Actions */}
            <div className="flex items-center justify-end gap-3 pt-4 border-t border-slate-100">
              <button
                type="submit"
                disabled={saving}
                className="px-6 py-2 bg-primary-600 hover:bg-primary-700 text-white text-xs font-bold rounded-xl shadow-xs transition-colors disabled:opacity-50"
              >
                {saving ? 'Saving...' : editingId ? 'Update Outreach Account' : 'Save Outreach Account'}
              </button>
            </div>
          </form>
        </div>
      </div>
    </div>
  );
}
