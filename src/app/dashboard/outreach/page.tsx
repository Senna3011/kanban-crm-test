'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';
import ConfirmDialog, { type ConfirmDialogVariant } from '@/components/ui/ConfirmDialog';
import OutreachTrendChart from '@/components/analytics/OutreachTrendChart';
import { formatUsdCost } from '@/lib/treg-billing';
import toast from 'react-hot-toast';

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
  totalCostUsd?: number;
}

interface BillingSummary {
  balance: {
    configured: boolean;
    balanceUsd: number;
    spendUsd?: number;
    billedCalls?: number;
    lowBalanceWarning: boolean;
    criticalBalanceWarning: boolean;
    error?: string;
  };
  tenantSpend: {
    totalCostUsd: number;
    totalRuns: number;
  };
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
    name?: string;
  };
  metrics: CampaignMetrics;
}

export default function OutreachDashboardPage() {
  const [campaigns, setCampaigns] = useState<CampaignItem[]>([]);
  const [billing, setBilling] = useState<BillingSummary | null>(null);
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
    fetchBilling();
  }, []);

  async function fetchBilling(refresh = false) {
    try {
      const res = await fetch(`/api/outreach/billing${refresh ? '?refresh=1' : ''}`);
      if (res.ok) {
        setBilling(await res.json());
      }
    } catch {
      // ignore non-blocking billing fetch errors
    }
  }

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
        <div className="flex flex-wrap items-center gap-2">
          {billing?.balance?.configured && (
            <button
              type="button"
              onClick={() => fetchBilling(true)}
              title="Click to refresh live B2B Verified Database credit balance"
              className={`inline-flex items-center gap-2 px-3 py-2 rounded-xl border text-xs font-semibold transition-colors ${
                billing.balance.criticalBalanceWarning
                  ? 'bg-rose-50 border-rose-200 text-rose-800 hover:bg-rose-100'
                  : billing.balance.lowBalanceWarning
                  ? 'bg-amber-50 border-amber-200 text-amber-800 hover:bg-amber-100'
                  : 'bg-emerald-50 border-emerald-200 text-emerald-800 hover:bg-emerald-100'
              }`}
            >
              <span>💳</span>
              <div className="text-left leading-tight">
                <p className="text-[10px] uppercase tracking-wider opacity-75">Database Balance</p>
                <p className="font-bold">
                  {formatUsdCost(billing.balance.balanceUsd)}
                  {billing.balance.lowBalanceWarning && ' • Low'}
                </p>
              </div>
            </button>
          )}
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

      {/* Overall Stats (Feedback 17 / Image 3) */}
      <div className="bg-white dark:bg-[#1D2125] rounded-2xl border border-slate-200/80 dark:border-[#2C333A] shadow-xs p-5 sm:p-6 transition-colors">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 mb-5 pb-4 border-b border-slate-100 dark:border-[#2C333A]">
          <div>
            <div className="flex items-center gap-2">
              <h2 className="text-base font-bold text-slate-900 dark:text-white">Overall Stats</h2>
              <span className="text-[10px] font-semibold uppercase tracking-wider px-2 py-0.5 rounded-full bg-primary-50 dark:bg-primary-950/50 text-primary-600 dark:text-primary-400 border border-primary-200/60 dark:border-primary-800/40">
                Lifetime Aggregated
              </span>
            </div>
            <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">The data is from the start of campaign until now</p>
          </div>
        </div>

        {(() => {
          const totalProspects = campaigns.reduce((acc, c) => acc + (c.metrics?.prospects ?? c.metrics?.totalLeads ?? 0), 0);
          const totalSent = campaigns.reduce((acc, c) => acc + (c.metrics?.sent ?? c.metrics?.dispatched ?? 0), 0);
          const totalReached = campaigns.reduce((acc, c) => acc + (c.metrics?.reached ?? c.metrics?.dispatched ?? 0), 0);
          const totalOpened = campaigns.reduce((acc, c) => acc + (c.metrics?.opened ?? 0), 0);
          const totalClicked = campaigns.reduce((acc, c) => acc + (c.metrics?.clicked ?? 0), 0);
          const totalReplied = campaigns.reduce((acc, c) => acc + (c.metrics?.replied ?? 0), 0);
          const totalInterested = campaigns.reduce((acc, c) => acc + (c.metrics?.interested ?? c.metrics?.converted ?? 0), 0);
          const totalOpportunities = campaigns.reduce((acc, c) => acc + (c.metrics?.opportunities ?? ((c.metrics?.converted || 0) * 100)), 0);
          const totalBounced = campaigns.reduce((acc, c) => acc + (c.metrics?.bounced ?? 0), 0);
          const totalCampaignCost = campaigns.reduce((acc, c) => acc + (c.metrics?.totalCostUsd ?? 0), 0);

          const sentPct = totalProspects > 0 ? Math.round((totalSent / totalProspects) * 100) : 0;
          const reachedPct = totalSent > 0 ? Math.round((totalReached / totalSent) * 100) : 0;
          const openedPct = totalReached > 0 ? Math.round((totalOpened / totalReached) * 100) : 0;
          const clickedPct = totalOpened > 0 ? Math.round((totalClicked / totalOpened) * 100) : 0;
          const repliedPct = totalSent > 0 ? Math.round((totalReplied / totalSent) * 100) : 0;
          const bouncePct = totalSent > 0 ? ((totalBounced / totalSent) * 100).toFixed(1) : '0';

          return (
            <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3.5 sm:gap-4">
              {/* 1. Prospects */}
              <div className="bg-slate-50/70 dark:bg-[#161A1D] hover:bg-slate-100/60 dark:hover:bg-[#1C2126] transition-all p-4 rounded-xl border border-slate-200/70 dark:border-[#2C333A] flex flex-col justify-between shadow-2xs">
                <div className="flex items-center justify-between gap-1 mb-2">
                  <span className="text-[11px] font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider">Prospects</span>
                  <span className="w-6 h-6 rounded-lg bg-slate-200/60 dark:bg-slate-800 text-slate-600 dark:text-slate-300 flex items-center justify-center text-xs">👥</span>
                </div>
                <div className="space-y-1">
                  <p className="text-2xl font-black text-slate-900 dark:text-white tracking-tight">{totalProspects.toLocaleString()}</p>
                  <p className="text-[11px] text-slate-500 dark:text-slate-400 font-medium">Total Audience Pool</p>
                </div>
              </div>

              {/* 2. Sent */}
              <div className="bg-slate-50/70 dark:bg-[#161A1D] hover:bg-slate-100/60 dark:hover:bg-[#1C2126] transition-all p-4 rounded-xl border border-slate-200/70 dark:border-[#2C333A] flex flex-col justify-between shadow-2xs">
                <div className="flex items-center justify-between gap-1 mb-2">
                  <span className="text-[11px] font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider">Sent</span>
                  <span className="w-6 h-6 rounded-lg bg-indigo-50 dark:bg-indigo-950/60 text-indigo-600 dark:text-indigo-400 flex items-center justify-center text-xs">📤</span>
                </div>
                <div className="space-y-1">
                  <div className="flex items-baseline gap-2">
                    <span className="text-2xl font-black text-indigo-600 dark:text-indigo-400 tracking-tight">{totalSent.toLocaleString()}</span>
                    <span className="text-xs font-bold text-indigo-600/80 dark:text-indigo-400/80 bg-indigo-50 dark:bg-indigo-950/60 px-1.5 py-0.5 rounded-md border border-indigo-200/60 dark:border-indigo-800/40">
                      {sentPct}%
                    </span>
                  </div>
                  <p className="text-[11px] text-slate-500 dark:text-slate-400 font-medium">Dispatched of pool</p>
                </div>
              </div>

              {/* 3. Reached */}
              <div className="bg-slate-50/70 dark:bg-[#161A1D] hover:bg-slate-100/60 dark:hover:bg-[#1C2126] transition-all p-4 rounded-xl border border-slate-200/70 dark:border-[#2C333A] flex flex-col justify-between shadow-2xs">
                <div className="flex items-center justify-between gap-1 mb-2">
                  <span className="text-[11px] font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider">Reached</span>
                  <span className="w-6 h-6 rounded-lg bg-blue-50 dark:bg-blue-950/60 text-blue-600 dark:text-blue-400 flex items-center justify-center text-xs">📬</span>
                </div>
                <div className="space-y-1">
                  <div className="flex items-baseline gap-2">
                    <span className="text-2xl font-black text-blue-600 dark:text-blue-400 tracking-tight">{totalReached.toLocaleString()}</span>
                    <span className="text-xs font-bold text-blue-600/80 dark:text-blue-400/80 bg-blue-50 dark:bg-blue-950/60 px-1.5 py-0.5 rounded-md border border-blue-200/60 dark:border-blue-800/40">
                      {reachedPct}%
                    </span>
                  </div>
                  <p className="text-[11px] text-slate-500 dark:text-slate-400 font-medium">Delivered to inboxes</p>
                </div>
              </div>

              {/* 4. Opened */}
              <div className="bg-slate-50/70 dark:bg-[#161A1D] hover:bg-slate-100/60 dark:hover:bg-[#1C2126] transition-all p-4 rounded-xl border border-slate-200/70 dark:border-[#2C333A] flex flex-col justify-between shadow-2xs">
                <div className="flex items-center justify-between gap-1 mb-2">
                  <span className="text-[11px] font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider">Opened</span>
                  <span className="w-6 h-6 rounded-lg bg-cyan-50 dark:bg-cyan-950/60 text-cyan-600 dark:text-cyan-400 flex items-center justify-center text-xs">👁️</span>
                </div>
                <div className="space-y-1">
                  <div className="flex items-baseline gap-2">
                    <span className="text-2xl font-black text-cyan-600 dark:text-cyan-400 tracking-tight">{totalOpened.toLocaleString()}</span>
                    <span className="text-xs font-bold text-cyan-600/80 dark:text-cyan-400/80 bg-cyan-50 dark:bg-cyan-950/60 px-1.5 py-0.5 rounded-md border border-cyan-200/60 dark:border-cyan-800/40">
                      {openedPct}%
                    </span>
                  </div>
                  <p className="text-[11px] text-slate-500 dark:text-slate-400 font-medium">Unique read rate</p>
                </div>
              </div>

              {/* 5. Clicked */}
              <div className="bg-slate-50/70 dark:bg-[#161A1D] hover:bg-slate-100/60 dark:hover:bg-[#1C2126] transition-all p-4 rounded-xl border border-slate-200/70 dark:border-[#2C333A] flex flex-col justify-between shadow-2xs">
                <div className="flex items-center justify-between gap-1 mb-2">
                  <span className="text-[11px] font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider">Clicked</span>
                  <span className="w-6 h-6 rounded-lg bg-purple-50 dark:bg-purple-950/60 text-purple-600 dark:text-purple-400 flex items-center justify-center text-xs">🔗</span>
                </div>
                <div className="space-y-1">
                  <div className="flex items-baseline gap-2">
                    <span className="text-2xl font-black text-purple-600 dark:text-purple-400 tracking-tight">{totalClicked.toLocaleString()}</span>
                    <span className="text-xs font-bold text-purple-600/80 dark:text-purple-400/80 bg-purple-50 dark:bg-purple-950/60 px-1.5 py-0.5 rounded-md border border-purple-200/60 dark:border-purple-800/40">
                      {clickedPct}%
                    </span>
                  </div>
                  <p className="text-[11px] text-slate-500 dark:text-slate-400 font-medium">Link CTR engagement</p>
                </div>
              </div>

              {/* 6. Replied */}
              <div className="bg-slate-50/70 dark:bg-[#161A1D] hover:bg-slate-100/60 dark:hover:bg-[#1C2126] transition-all p-4 rounded-xl border border-slate-200/70 dark:border-[#2C333A] flex flex-col justify-between shadow-2xs">
                <div className="flex items-center justify-between gap-1 mb-2">
                  <span className="text-[11px] font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider">Replied</span>
                  <span className="w-6 h-6 rounded-lg bg-amber-50 dark:bg-amber-950/60 text-amber-600 dark:text-amber-400 flex items-center justify-center text-xs">💬</span>
                </div>
                <div className="space-y-1">
                  <div className="flex items-baseline gap-2">
                    <span className="text-2xl font-black text-amber-600 dark:text-amber-400 tracking-tight">{totalReplied.toLocaleString()}</span>
                    <span className="text-xs font-bold text-amber-600/80 dark:text-amber-400/80 bg-amber-50 dark:bg-amber-950/60 px-1.5 py-0.5 rounded-md border border-amber-200/60 dark:border-amber-800/40">
                      {repliedPct}%
                    </span>
                  </div>
                  <p className="text-[11px] text-slate-500 dark:text-slate-400 font-medium">Inbound responses</p>
                </div>
              </div>

              {/* 7. Interested */}
              <div className="bg-slate-50/70 dark:bg-[#161A1D] hover:bg-slate-100/60 dark:hover:bg-[#1C2126] transition-all p-4 rounded-xl border border-slate-200/70 dark:border-[#2C333A] flex flex-col justify-between shadow-2xs">
                <div className="flex items-center justify-between gap-1 mb-2">
                  <span className="text-[11px] font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider">Interested</span>
                  <span className="w-6 h-6 rounded-lg bg-emerald-50 dark:bg-emerald-950/60 text-emerald-600 dark:text-emerald-400 flex items-center justify-center text-xs">⭐</span>
                </div>
                <div className="space-y-1">
                  <p className="text-2xl font-black text-emerald-600 dark:text-emerald-400 tracking-tight">{totalInterested.toLocaleString()}</p>
                  <p className="text-[11px] text-emerald-600/90 dark:text-emerald-400/90 font-medium">Hot prospects qualified</p>
                </div>
              </div>

              {/* 8. Opportunities */}
              <div className="bg-slate-50/70 dark:bg-[#161A1D] hover:bg-slate-100/60 dark:hover:bg-[#1C2126] transition-all p-4 rounded-xl border border-slate-200/70 dark:border-[#2C333A] flex flex-col justify-between shadow-2xs">
                <div className="flex items-center justify-between gap-1 mb-2">
                  <span className="text-[11px] font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider">Opportunities</span>
                  <span className="w-6 h-6 rounded-lg bg-emerald-50 dark:bg-emerald-950/60 text-emerald-600 dark:text-emerald-400 flex items-center justify-center text-xs">💼</span>
                </div>
                <div className="space-y-1">
                  <p className="text-2xl font-black text-emerald-700 dark:text-emerald-300 tracking-tight">${totalOpportunities.toLocaleString()}</p>
                  <p className="text-[11px] text-slate-500 dark:text-slate-400 font-medium">Est. pipeline value</p>
                </div>
              </div>

              {/* 9. Bounced */}
              <div className="bg-slate-50/70 dark:bg-[#161A1D] hover:bg-slate-100/60 dark:hover:bg-[#1C2126] transition-all p-4 rounded-xl border border-slate-200/70 dark:border-[#2C333A] flex flex-col justify-between shadow-2xs">
                <div className="flex items-center justify-between gap-1 mb-2">
                  <span className="text-[11px] font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider">Bounced</span>
                  <span className="w-6 h-6 rounded-lg bg-rose-50 dark:bg-rose-950/60 text-rose-600 dark:text-rose-400 flex items-center justify-center text-xs">⚠️</span>
                </div>
                <div className="space-y-1">
                  <div className="flex items-baseline gap-2">
                    <span className="text-2xl font-black text-rose-600 dark:text-rose-400 tracking-tight">{totalBounced.toLocaleString()}</span>
                    <span className="text-xs font-bold text-rose-600/80 dark:text-rose-400/80 bg-rose-50 dark:bg-rose-950/60 px-1.5 py-0.5 rounded-md border border-rose-200/60 dark:border-rose-800/40">
                      {bouncePct}%
                    </span>
                  </div>
                  <p className="text-[11px] text-slate-500 dark:text-slate-400 font-medium">Email deliverability</p>
                </div>
              </div>

              {/* 10. Total Cost */}
              <div className="bg-amber-50/60 dark:bg-[#161A1D] hover:bg-amber-50 dark:hover:bg-[#1C2126] transition-all p-4 rounded-xl border border-amber-200/70 dark:border-[#2C333A] flex flex-col justify-between shadow-2xs">
                <div className="flex items-center justify-between gap-1 mb-2">
                  <span className="text-[11px] font-bold text-amber-700 dark:text-amber-400 uppercase tracking-wider">Total Cost</span>
                  <span className="w-6 h-6 rounded-lg bg-amber-100 dark:bg-amber-950/80 text-amber-700 dark:text-amber-300 flex items-center justify-center text-xs">💳</span>
                </div>
                <div className="space-y-1">
                  <p className="text-2xl font-black text-amber-800 dark:text-amber-400 tracking-tight">{formatUsdCost(totalCampaignCost)}</p>
                  <p className="text-[11px] text-amber-700/80 dark:text-amber-400/80 font-medium">Outreach billing run</p>
                </div>
              </div>
            </div>
          );
        })()}
      </div>

      {/* Campaign List Table (Feedback 17 / Image 2) */}
      <div className="bg-white rounded-2xl border border-slate-200/80 shadow-xs overflow-hidden">
        <div className="p-4 border-b border-slate-100 flex items-center justify-between">
          <h2 className="text-sm font-bold text-slate-900">Active campaigns</h2>
          <button
            onClick={fetchCampaigns}
            disabled={loading}
            className="text-xs font-semibold text-slate-600 hover:text-slate-900 transition-colors flex items-center gap-1.5 disabled:opacity-50 px-2.5 py-1 rounded-lg border border-slate-200 hover:bg-slate-50 shadow-2xs"
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
                  <th className="px-4 py-3">CAMPAIGN NAME</th>
                  <th className="px-4 py-3">TARGET PROFILE</th>
                  <th className="px-4 py-3">SENDER ACCOUNT</th>
                  <th className="px-3 py-3 text-center">LEADS</th>
                  <th className="px-3 py-3 text-center">SAFE</th>
                  <th className="px-3 py-3 text-center">DISPATCHED</th>
                  <th className="px-3 py-3 text-center">CONVERTED</th>
                  <th className="px-3 py-3 text-center">COST</th>
                  <th className="px-4 py-3 text-right">ACTIONS</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {campaigns.map((camp) => {
                  const leads = camp.metrics.totalLeads ?? camp.metrics.prospects ?? 0;
                  const safe = camp.metrics.verifiedSafe ?? 0;
                  const dispatched = camp.metrics.dispatched ?? camp.metrics.sent ?? 0;
                  const converted = camp.metrics.converted ?? camp.metrics.interested ?? 0;
                  const senderDisplay = camp.account?.name || camp.account?.senderEmail || 'Default Mailer';
                  const createdDate = new Date(camp.createdAt).toLocaleDateString('en-US', {
                    month: 'short',
                    day: 'numeric',
                    year: 'numeric',
                  });

                  return (
                    <tr key={camp.id} className="hover:bg-slate-50/60 transition-colors">
                      <td className="px-4 py-3.5">
                        <Link
                          href={`/dashboard/outreach/${camp.id}`}
                          className="font-bold text-slate-900 hover:text-primary-600 hover:underline"
                        >
                          {camp.name}
                        </Link>
                        <p className="text-[10px] text-slate-400 mt-0.5">created {createdDate}</p>
                      </td>

                      <td className="px-4 py-3.5">
                        <p className="font-semibold text-slate-800 line-clamp-1">
                          {camp.targetRole || 'Executives'}
                        </p>
                        <p className="text-[10px] text-slate-400">
                          {camp.targetLocation || 'Worldwide'}
                        </p>
                      </td>

                      <td className="px-4 py-3.5">
                        <span className="font-medium text-slate-700 bg-slate-100 px-2 py-0.5 rounded text-[11px]">
                          {senderDisplay}
                        </span>
                      </td>

                      <td className="px-3 py-3.5 text-center font-bold text-slate-900 text-sm">
                        {leads}
                      </td>

                      <td className="px-3 py-3.5 text-center">
                        <span className="inline-flex items-center gap-1 font-bold text-emerald-700 bg-emerald-50 border border-emerald-200/80 px-2 py-0.5 rounded-full text-xs">
                          <span>✓</span>
                          <span>{safe}</span>
                        </span>
                      </td>

                      <td className="px-3 py-3.5 text-center font-bold text-indigo-700 text-sm">
                        {dispatched}
                      </td>

                      <td className="px-3 py-3.5 text-center font-bold text-emerald-800 text-sm">
                        {converted}
                      </td>

                      <td className="px-3 py-3.5 text-center">
                        <span className="font-mono font-bold text-amber-800 bg-amber-50 border border-amber-200/80 px-2 py-0.5 rounded-md text-[11px]">
                          {formatUsdCost(camp.metrics.totalCostUsd || 0)}
                        </span>
                      </td>

                      <td className="px-4 py-3.5 text-right space-x-2 whitespace-nowrap">
                        <Link
                          href={`/dashboard/outreach/${camp.id}`}
                          className="inline-flex items-center px-3 py-1 bg-primary-50 hover:bg-primary-100 text-primary-700 border border-primary-200 text-xs font-semibold rounded-lg transition-colors"
                        >
                          Open
                        </Link>
                        <button
                          onClick={() => handleDeleteCampaign(camp.id, camp.name)}
                          disabled={deletingId === camp.id}
                          className="inline-flex items-center px-2 py-1 text-slate-400 hover:text-red-600 hover:bg-red-50 text-xs font-semibold rounded-lg transition-colors disabled:opacity-50"
                          title="Delete Campaign"
                        >
                          {deletingId === camp.id ? (
                            <span className="w-3 h-3 border-2 border-red-600 border-t-transparent rounded-full animate-spin" />
                          ) : (
                            <span>Delete</span>
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
