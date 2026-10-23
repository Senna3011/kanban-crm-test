'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';
import ConfirmDialog, { type ConfirmDialogVariant } from '@/components/ui/ConfirmDialog';
import OutreachTrendChart from '@/components/analytics/OutreachTrendChart';
import toast, { Toaster } from 'react-hot-toast';

interface CampaignMetrics {
  prospects?: number;
  totalLeads: number;
  sent?: number;
  reached?: number;
  opened?: number;
  clicked?: number;
  replied?: number;
  interested?: number;
  opportunities?: number;
  bounced?: number;
  verifiedSafe: number;
  dispatched: number;
  converted: number;
}

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
  metrics: CampaignMetrics;
}

export default function OutreachDashboardPage() {
  const [campaigns, setCampaigns] = useState<CampaignItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [deletingId, setDeletingId] = useState<string | null>(null);

  // SweetAlert2 style ConfirmDialog state
  const [confirmDialog, setConfirmDialog] = useState<{
    isOpen: boolean;
    title: string;
    message: string;
    confirmText?: string;
    cancelText?: string;
    variant?: ConfirmDialogVariant;
    isLoading?: boolean;
    onConfirm: () => void | Promise<void>;
  }>({
    isOpen: false,
    title: '',
    message: '',
    onConfirm: () => {},
  });

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

  function handleDeleteCampaign(id: string, name: string) {
    setConfirmDialog({
      isOpen: true,
      title: `Delete Campaign "${name}"?`,
      message: `Delete campaign '${name}' and all scraped leads? Dispatched history will be lost.`,
      confirmText: 'Delete Campaign',
      variant: 'danger',
      onConfirm: async () => {
        setDeletingId(id);
        setConfirmDialog((prev) => ({ ...prev, isOpen: false }));
        try {
          const res = await fetch(`/api/outreach/campaigns/${id}`, { method: 'DELETE' });
          if (!res.ok) throw new Error('Failed to delete campaign');
          setCampaigns((prev) => prev.filter((c) => c.id !== id));
          toast.success('Campaign deleted successfully');
        } catch (err: any) {
          toast.error(`Delete error: ${err.message}`);
        } finally {
          setDeletingId(null);
        }
      },
    });
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
        <div className="flex items-center gap-2">
          <Link
            href="/dashboard/outreach/settings"
            className="inline-flex items-center justify-center gap-1.5 px-3.5 py-2.5 bg-slate-100 hover:bg-slate-200 text-slate-800 text-xs font-semibold rounded-xl transition-colors border border-slate-200/80"
          >
            <span>⚙️</span>
            <span>Sender Accounts</span>
          </Link>
          <Link
            href="/dashboard/outreach/new"
            className="inline-flex items-center justify-center gap-2 px-4 py-2.5 bg-primary-600 hover:bg-primary-700 text-white text-xs font-semibold rounded-xl shadow-xs transition-colors"
          >
            <span>+</span>
            <span>Create New Campaign</span>
          </Link>
        </div>
      </div>

      {/* Live Time-Series Analytics Chart */}
      <OutreachTrendChart />

      {/* 9 Campaign Performance Metrics (Point 17) */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3">
        <div className="bg-white p-3.5 rounded-xl border border-slate-200/80 shadow-xs">
          <p className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">Prospects</p>
          <p className="text-xl font-bold text-slate-900 mt-0.5">
            {campaigns.reduce((acc, c) => acc + (c.metrics?.prospects ?? c.metrics?.totalLeads ?? 0), 0)}
          </p>
          <span className="text-[10px] text-slate-400">Total Leads</span>
        </div>
        <div className="bg-white p-3.5 rounded-xl border border-slate-200/80 shadow-xs">
          <p className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">Sent</p>
          <p className="text-xl font-bold text-indigo-600 mt-0.5">
            {campaigns.reduce((acc, c) => acc + (c.metrics?.sent ?? c.metrics?.dispatched ?? 0), 0)}
          </p>
          <span className="text-[10px] text-indigo-500">Transmitted</span>
        </div>
        <div className="bg-white p-3.5 rounded-xl border border-slate-200/80 shadow-xs">
          <p className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">Reached</p>
          <p className="text-xl font-bold text-blue-600 mt-0.5">
            {campaigns.reduce((acc, c) => acc + (c.metrics?.reached ?? c.metrics?.dispatched ?? 0), 0)}
          </p>
          <span className="text-[10px] text-blue-500">In Inbox</span>
        </div>
        <div className="bg-white p-3.5 rounded-xl border border-slate-200/80 shadow-xs">
          <p className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">Opened</p>
          <p className="text-xl font-bold text-cyan-600 mt-0.5">
            {campaigns.reduce((acc, c) => acc + (c.metrics?.opened ?? 0), 0)}
          </p>
          <span className="text-[10px] text-cyan-500">Email Opens</span>
        </div>
        <div className="bg-white p-3.5 rounded-xl border border-slate-200/80 shadow-xs">
          <p className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">Clicked</p>
          <p className="text-xl font-bold text-purple-600 mt-0.5">
            {campaigns.reduce((acc, c) => acc + (c.metrics?.clicked ?? 0), 0)}
          </p>
          <span className="text-[10px] text-purple-500">Link Clicks</span>
        </div>
        <div className="bg-white p-3.5 rounded-xl border border-slate-200/80 shadow-xs">
          <p className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">Replied</p>
          <p className="text-xl font-bold text-amber-600 mt-0.5">
            {campaigns.reduce((acc, c) => acc + (c.metrics?.replied ?? 0), 0)}
          </p>
          <span className="text-[10px] text-amber-500">Direct Replies</span>
        </div>
        <div className="bg-white p-3.5 rounded-xl border border-slate-200/80 shadow-xs">
          <p className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">Interested</p>
          <p className="text-xl font-bold text-emerald-600 mt-0.5">
            {campaigns.reduce((acc, c) => acc + (c.metrics?.interested ?? c.metrics?.converted ?? 0), 0)}
          </p>
          <span className="text-[10px] text-emerald-500">In CRM</span>
        </div>
        <div className="bg-white p-3.5 rounded-xl border border-slate-200/80 shadow-xs">
          <p className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">Opportunities</p>
          <p className="text-xl font-bold text-emerald-700 mt-0.5">
            ${campaigns.reduce((acc, c) => acc + (c.metrics?.opportunities ?? ((c.metrics?.converted || 0) * 100)), 0).toLocaleString()}
          </p>
          <span className="text-[10px] text-emerald-600">Pipeline Value</span>
        </div>
        <div className="bg-white p-3.5 rounded-xl border border-slate-200/80 shadow-xs col-span-2 sm:col-span-1">
          <p className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">Bounced</p>
          <p className="text-xl font-bold text-rose-600 mt-0.5">
            {campaigns.reduce((acc, c) => acc + (c.metrics?.bounced ?? 0), 0)}
          </p>
          <span className="text-[10px] text-rose-500">Delivery Bounces</span>
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
                  <th className="px-4 py-3">Campaign</th>
                  <th className="px-3 py-3 text-center">Prospects</th>
                  <th className="px-3 py-3 text-center">Sent</th>
                  <th className="px-3 py-3 text-center">Reached</th>
                  <th className="px-3 py-3 text-center">Opened</th>
                  <th className="px-3 py-3 text-center">Clicked</th>
                  <th className="px-3 py-3 text-center">Replied</th>
                  <th className="px-3 py-3 text-center">Interested</th>
                  <th className="px-3 py-3 text-center">Opportunities</th>
                  <th className="px-3 py-3 text-center">Bounced</th>
                  <th className="px-4 py-3 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {campaigns.map((camp) => {
                  const prospects = camp.metrics.prospects ?? camp.metrics.totalLeads ?? 0;
                  const sent = camp.metrics.sent ?? camp.metrics.dispatched ?? 0;
                  const reached = camp.metrics.reached ?? camp.metrics.dispatched ?? 0;
                  const opened = camp.metrics.opened ?? 0;
                  const clicked = camp.metrics.clicked ?? 0;
                  const replied = camp.metrics.replied ?? 0;
                  const interested = camp.metrics.interested ?? camp.metrics.converted ?? 0;
                  const opportunities = camp.metrics.opportunities ?? (interested * 100);
                  const bounced = camp.metrics.bounced ?? 0;

                  const sentPct = prospects > 0 ? Math.round((sent / prospects) * 100) : 0;
                  const reachedPct = sent > 0 ? Math.round((reached / sent) * 100) : 0;
                  const openedPct = reached > 0 ? Math.round((opened / reached) * 100) : 0;
                  const clickedPct = opened > 0 ? Math.round((clicked / opened) * 100) : 0;
                  const repliedPct = sent > 0 ? Math.round((replied / sent) * 100) : 0;
                  const interestedPct = replied > 0 ? Math.round((interested / replied) * 100) : (interested > 0 ? 100 : 0);
                  const bouncedPct = sent > 0 ? Math.round((bounced / sent) * 100) : 0;

                  return (
                    <tr key={camp.id} className="hover:bg-slate-50/60 transition-colors">
                      <td className="px-4 py-3.5">
                        <Link
                          href={`/dashboard/outreach/${camp.id}`}
                          className="font-bold text-slate-900 hover:text-primary-600 hover:underline"
                        >
                          {camp.name}
                        </Link>
                        <div className="flex items-center gap-1.5 flex-wrap mt-0.5">
                          <span className="text-[10px] text-slate-500 font-medium">
                            {camp.targetRole || 'Executives'}
                          </span>
                          {camp.targetLocation && (
                            <span className="text-[10px] text-slate-400">📍 {camp.targetLocation}</span>
                          )}
                        </div>
                      </td>

                      <td className="px-3 py-3.5 text-center font-bold text-slate-900">
                        {prospects}
                      </td>

                      <td className="px-3 py-3.5 text-center">
                        <span className="font-semibold text-indigo-700">{sent}</span>
                        <span className="text-[10px] text-slate-400 block">{sentPct}%</span>
                      </td>

                      <td className="px-3 py-3.5 text-center">
                        <span className="font-semibold text-blue-700">{reached}</span>
                        <span className="text-[10px] text-slate-400 block">{reachedPct}%</span>
                      </td>

                      <td className="px-3 py-3.5 text-center">
                        <span className="font-semibold text-cyan-700">{opened}</span>
                        <span className="text-[10px] text-slate-400 block">{openedPct}%</span>
                      </td>

                      <td className="px-3 py-3.5 text-center">
                        <span className="font-semibold text-purple-700">{clicked}</span>
                        <span className="text-[10px] text-slate-400 block">{clickedPct}%</span>
                      </td>

                      <td className="px-3 py-3.5 text-center">
                        <span className="font-semibold text-amber-700">{replied}</span>
                        <span className="text-[10px] text-slate-400 block">{repliedPct}%</span>
                      </td>

                      <td className="px-3 py-3.5 text-center">
                        <span className="font-bold text-emerald-700">{interested}</span>
                        <span className="text-[10px] text-emerald-600 block">{interestedPct}%</span>
                      </td>

                      <td className="px-3 py-3.5 text-center font-bold text-emerald-800">
                        ${opportunities.toLocaleString()}
                      </td>

                      <td className="px-3 py-3.5 text-center">
                        <span className="font-semibold text-rose-600">{bounced}</span>
                        <span className="text-[10px] text-slate-400 block">{bouncedPct}%</span>
                      </td>

                      <td className="px-4 py-3.5 text-right space-x-2 whitespace-nowrap">
                        <Link
                          href={`/dashboard/outreach/${camp.id}`}
                          className="inline-flex items-center px-2.5 py-1 bg-slate-100 hover:bg-primary-50 hover:text-primary-700 text-slate-700 text-xs font-semibold rounded-lg transition-colors"
                        >
                          Open →
                        </Link>
                        <button
                          onClick={() => handleDeleteCampaign(camp.id, camp.name)}
                          disabled={deletingId === camp.id}
                          className="inline-flex items-center px-2 py-1 text-red-600 hover:bg-red-50 text-xs font-semibold rounded-lg transition-colors disabled:opacity-50"
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
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* SweetAlert2 Style Confirm Dialog */}
      <ConfirmDialog
        isOpen={confirmDialog.isOpen}
        title={confirmDialog.title}
        message={confirmDialog.message}
        confirmText={confirmDialog.confirmText}
        variant="danger"
        isLoading={Boolean(deletingId)}
        onConfirm={confirmDialog.onConfirm}
        onCancel={() => setConfirmDialog((prev) => ({ ...prev, isOpen: false }))}
      />
    </div>
  );
}
