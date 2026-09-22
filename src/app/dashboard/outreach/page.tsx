'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';

interface CampaignItem {
  id: string;
  name: string;
  targetRole?: string;
  targetLocation?: string;
  targetIndustry?: string;
  status: string;
  createdAt: string;
  account?: {
    senderEmail: string;
  };
  metrics: {
    totalLeads: number;
    verifiedSafe: number;
    dispatched: number;
    converted: number;
  };
}

export default function OutreachDashboardPage() {
  const [campaigns, setCampaigns] = useState<CampaignItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [deletingId, setDeletingId] = useState<string | null>(null);

  useEffect(() => {
    fetchCampaigns();
  }, []);

  async function fetchCampaigns() {
    setLoading(true);
    setError('');
    try {
      const res = await fetch('/api/outreach/campaigns');
      if (!res.ok) throw new Error('Failed to load outreach campaigns');
      const data = await res.json();
      setCampaigns(data);
    } catch (err: any) {
      setError(err.message || 'Connection error');
    } finally {
      setLoading(false);
    }
  }

  async function handleDeleteCampaign(id: string, name: string) {
    if (!confirm(`Are you sure you want to delete campaign "${name}" and all its leads? This action cannot be undone.`)) {
      return;
    }
    setDeletingId(id);
    try {
      const res = await fetch(`/api/outreach/campaigns/${id}`, { method: 'DELETE' });
      if (!res.ok) throw new Error('Failed to delete campaign');
      setCampaigns((prev) => prev.filter((c) => c.id !== id));
    } catch (err: any) {
      alert(`Delete error: ${err.message}`);
    } finally {
      setDeletingId(null);
    }
  }

  return (
    <div className="p-4 sm:p-6 lg:p-8 space-y-6 max-w-7xl mx-auto">
      {/* Header Banner */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 bg-white p-6 rounded-2xl border border-slate-200/80 shadow-xs">
        <div>
          <div className="flex items-center gap-2">
            <span className="text-xl">🚀</span>
            <h1 className="text-xl font-bold text-slate-900 tracking-tight">Outreach Marketing Engine</h1>
          </div>
          <p className="text-xs text-slate-500 mt-1">
            Discover LinkedIn leads, verify business deliverability, generate AI personalized drafts, and dispatch campaigns.
          </p>
        </div>
        <Link
          href="/dashboard/outreach/new"
          className="inline-flex items-center justify-center gap-2 px-4 py-2.5 bg-primary-600 hover:bg-primary-700 text-white text-xs font-semibold rounded-xl shadow-xs transition-colors"
        >
          <span>+</span>
          <span>Create New Campaign</span>
        </Link>
      </div>

      {/* Aggregate Stats */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="bg-white p-4 rounded-xl border border-slate-200/80 shadow-xs">
          <p className="text-[11px] font-bold text-slate-400 uppercase tracking-wider">Total Campaigns</p>
          <p className="text-2xl font-bold text-slate-900 mt-1">{campaigns.length}</p>
        </div>
        <div className="bg-white p-4 rounded-xl border border-slate-200/80 shadow-xs">
          <p className="text-[11px] font-bold text-slate-400 uppercase tracking-wider">Leads Sourced</p>
          <p className="text-2xl font-bold text-blue-600 mt-1">
            {campaigns.reduce((acc, c) => acc + (c.metrics?.totalLeads || 0), 0)}
          </p>
        </div>
        <div className="bg-white p-4 rounded-xl border border-slate-200/80 shadow-xs">
          <p className="text-[11px] font-bold text-slate-400 uppercase tracking-wider">Verified Safe</p>
          <p className="text-2xl font-bold text-emerald-600 mt-1">
            {campaigns.reduce((acc, c) => acc + (c.metrics?.verifiedSafe || 0), 0)}
          </p>
        </div>
        <div className="bg-white p-4 rounded-xl border border-slate-200/80 shadow-xs">
          <p className="text-[11px] font-bold text-slate-400 uppercase tracking-wider">CRM Converted</p>
          <p className="text-2xl font-bold text-indigo-600 mt-1">
            {campaigns.reduce((acc, c) => acc + (c.metrics?.converted || 0), 0)}
          </p>
        </div>
      </div>

      {/* Campaign List Table */}
      <div className="bg-white rounded-2xl border border-slate-200/80 shadow-xs overflow-hidden">
        <div className="p-4 border-b border-slate-100 flex items-center justify-between">
          <h2 className="text-sm font-bold text-slate-900">Active Campaigns</h2>
          <button
            onClick={fetchCampaigns}
            disabled={loading}
            className="text-xs text-slate-500 hover:text-slate-800 transition-colors flex items-center gap-1.5 disabled:opacity-50"
          >
            <span className={loading ? 'animate-spin' : ''}>🔄</span>
            <span>{loading ? 'Refreshing...' : 'Refresh'}</span>
          </button>
        </div>

        {error && (
          <div className="p-4 bg-red-50 border-b border-red-100 text-xs text-red-600">
            {error}
          </div>
        )}

        {loading && campaigns.length === 0 ? (
          <div className="p-12 text-center text-xs text-slate-500 space-y-2">
            <div className="w-6 h-6 border-2 border-primary-600 border-t-transparent rounded-full animate-spin mx-auto" />
            <p>Loading outreach campaigns...</p>
          </div>
        ) : campaigns.length === 0 ? (
          <div className="p-12 text-center space-y-3">
            <div className="w-12 h-12 rounded-full bg-primary-50 text-primary-600 flex items-center justify-center mx-auto text-xl font-bold">
              🎯
            </div>
            <p className="text-sm font-semibold text-slate-800">No Outreach Campaigns Yet</p>
            <p className="text-xs text-slate-500 max-w-sm mx-auto">
              Launch your first outbound marketing campaign to search verified leads and connect with decision makers.
            </p>
            <div className="pt-2">
              <Link
                href="/dashboard/outreach/new"
                className="inline-flex items-center gap-2 px-4 py-2 bg-primary-600 hover:bg-primary-700 text-white text-xs font-semibold rounded-xl shadow-xs transition-colors"
              >
                Launch First Campaign
              </Link>
            </div>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs text-slate-600">
              <thead className="bg-slate-50/80 text-[11px] font-bold text-slate-400 uppercase tracking-wider border-b border-slate-100">
                <tr>
                  <th className="px-4 py-3">Campaign Name</th>
                  <th className="px-4 py-3">Target Profile</th>
                  <th className="px-4 py-3">Sender Account</th>
                  <th className="px-4 py-3 text-center">Leads</th>
                  <th className="px-4 py-3 text-center">Safe</th>
                  <th className="px-4 py-3 text-center">Dispatched</th>
                  <th className="px-4 py-3 text-center">Converted</th>
                  <th className="px-4 py-3 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {campaigns.map((camp) => (
                  <tr key={camp.id} className="hover:bg-slate-50/60 transition-colors">
                    <td className="px-4 py-3.5">
                      <Link
                        href={`/dashboard/outreach/${camp.id}`}
                        className="font-bold text-slate-900 hover:text-primary-600 hover:underline"
                      >
                        {camp.name}
                      </Link>
                      <p className="text-[10px] text-slate-400 mt-0.5">
                        Created {new Date(camp.createdAt).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}
                      </p>
                    </td>
                    <td className="px-4 py-3.5">
                      <span className="inline-flex items-center px-2 py-0.5 rounded-md bg-slate-100 text-slate-700 text-[11px] font-medium">
                        {camp.targetRole || 'Executives'}
                      </span>
                      {camp.targetLocation && (
                        <p className="text-[10px] text-slate-400 mt-0.5">📍 {camp.targetLocation}</p>
                      )}
                    </td>
                    <td className="px-4 py-3.5 text-slate-600">
                      {camp.account?.senderEmail || 'Default Mailer'}
                    </td>
                    <td className="px-4 py-3.5 text-center font-semibold text-slate-800">
                      {camp.metrics.totalLeads}
                    </td>
                    <td className="px-4 py-3.5 text-center font-semibold text-emerald-600">
                      {camp.metrics.verifiedSafe}
                    </td>
                    <td className="px-4 py-3.5 text-center font-semibold text-indigo-600">
                      {camp.metrics.dispatched}
                    </td>
                    <td className="px-4 py-3.5 text-center font-semibold text-emerald-700">
                      {camp.metrics.converted}
                    </td>
                    <td className="px-4 py-3.5 text-right space-x-2 whitespace-nowrap">
                      <Link
                        href={`/dashboard/outreach/${camp.id}`}
                        className="inline-flex items-center px-3 py-1 bg-slate-100 hover:bg-primary-50 hover:text-primary-700 text-slate-700 text-xs font-semibold rounded-lg transition-colors"
                      >
                        Open →
                      </Link>
                      <button
                        onClick={() => handleDeleteCampaign(camp.id, camp.name)}
                        disabled={deletingId === camp.id}
                        className="inline-flex items-center px-2.5 py-1 text-red-600 hover:bg-red-50 text-xs font-semibold rounded-lg transition-colors disabled:opacity-50"
                        title="Delete Campaign"
                      >
                        {deletingId === camp.id ? (
                          <>
                            <span className="w-2.5 h-2.5 border-2 border-red-600 border-t-transparent rounded-full animate-spin mr-1" />
                            <span>Deleting...</span>
                          </>
                        ) : (
                          <span>🗑️ Delete</span>
                        )}
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
