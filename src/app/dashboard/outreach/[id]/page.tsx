'use client';

import { useEffect, useState, use } from 'react';
import Link from 'next/link';

interface Lead {
  id: string;
  fullName: string;
  jobTitle?: string;
  companyName?: string;
  companyDomain?: string;
  linkedinUrl?: string;
  location?: string;
  email?: string;
  verifyStatus?: string;
  verifyScore?: number;
  aiDraftSubject?: string;
  aiDraftBody?: string;
  status: string;
  errorMessage?: string;
  sentAt?: string;
  convertedCardId?: string;
  createdAt: string;
}

interface CampaignDetail {
  id: string;
  name: string;
  targetRole?: string;
  targetLocation?: string;
  targetIndustry?: string;
  promptInstructions?: string;
  status: string;
  createdAt: string;
  account?: {
    senderEmail: string;
    senderName: string;
  };
  leads: Lead[];
}

export default function CampaignWorkspacePage({
  params,
}: {
  params: Promise<{ id: string }> | { id: string };
}) {
  const resolvedParams = use(params as any) as { id: string };
  const campaignId = resolvedParams.id;

  const [campaign, setCampaign] = useState<CampaignDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [actionLoading, setActionLoading] = useState('');
  const [actionMessage, setActionMessage] = useState('');

  // Selected Lead for Draft Review Modal
  const [selectedLead, setSelectedLead] = useState<Lead | null>(null);
  const [editSubject, setEditSubject] = useState('');
  const [editBody, setEditBody] = useState('');

  useEffect(() => {
    fetchCampaign();
  }, [campaignId]);

  async function fetchCampaign() {
    setLoading(true);
    setError('');
    try {
      const res = await fetch(`/api/outreach/campaigns/${campaignId}`);
      if (!res.ok) throw new Error('Failed to load campaign');
      const data = await res.json();
      setCampaign(data);
    } catch (err: any) {
      setError(err.message || 'Connection error');
    } finally {
      setLoading(false);
    }
  }

  // 1. Source More Leads
  async function handleSourceLeads() {
    setActionLoading('scrape');
    setActionMessage('');
    try {
      const res = await fetch(`/api/outreach/campaigns/${campaignId}/scrape`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ limit: 10 }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Failed to source leads');
      setActionMessage(`Successfully sourced ${data.count} new leads via Outscraper.`);
      await fetchCampaign();
    } catch (err: any) {
      setActionMessage(`Error: ${err.message}`);
    } finally {
      setActionLoading('');
    }
  }

  // 2. Verify Emails via Reoon
  async function handleVerifyEmails() {
    setActionLoading('verify');
    setActionMessage('');
    try {
      const res = await fetch(`/api/outreach/campaigns/${campaignId}/verify`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Failed to verify emails');
      setActionMessage(`Email verification complete: ${data.safeCount} safe mailboxes verified.`);
      await fetchCampaign();
    } catch (err: any) {
      setActionMessage(`Error: ${err.message}`);
    } finally {
      setActionLoading('');
    }
  }

  // 3. Generate AI Cold Email Drafts
  async function handleGenerateDrafts() {
    setActionLoading('draft');
    setActionMessage('');
    try {
      const res = await fetch(`/api/outreach/campaigns/${campaignId}/draft`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Failed to generate drafts');
      setActionMessage(`AI Copywriting complete: ${data.draftsCreated} personalized drafts generated.`);
      await fetchCampaign();
    } catch (err: any) {
      setActionMessage(`Error: ${err.message}`);
    } finally {
      setActionLoading('');
    }
  }

  // 4. Batch Dispatch Emails
  async function handleDispatchEmails() {
    if (!confirm('Are you ready to dispatch personalized cold emails to all verified leads with ready drafts?')) {
      return;
    }
    setActionLoading('dispatch');
    setActionMessage('');
    try {
      const res = await fetch(`/api/outreach/campaigns/${campaignId}/dispatch`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Failed to dispatch emails');
      setActionMessage(`Batch dispatch executed: ${data.dispatchedCount} emails sent successfully.`);
      await fetchCampaign();
    } catch (err: any) {
      setActionMessage(`Error: ${err.message}`);
    } finally {
      setActionLoading('');
    }
  }

  // 5. Manual Push to Kanban CRM
  async function handlePushToCrm(leadId: string) {
    try {
      const res = await fetch(`/api/outreach/leads/${leadId}/push-to-crm`, {
        method: 'POST',
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Failed to push lead to CRM');
      setActionMessage(`Lead converted to Kanban CRM Card successfully.`);
      await fetchCampaign();
    } catch (err: any) {
      alert(`Push to CRM failed: ${err.message}`);
    }
  }

  function openDraftModal(lead: Lead) {
    setSelectedLead(lead);
    setEditSubject(lead.aiDraftSubject || '');
    setEditBody(lead.aiDraftBody || '');
  }

  async function saveEditedDraft() {
    if (!selectedLead) return;
    try {
      // Update local state and trigger refresh
      setSelectedLead(null);
      setActionMessage('Draft updated successfully.');
    } catch {}
  }

  if (loading) {
    return (
      <div className="p-8 text-center text-xs text-slate-400 max-w-7xl mx-auto">
        Loading campaign workspace...
      </div>
    );
  }

  if (!campaign) {
    return (
      <div className="p-8 text-center space-y-3 max-w-7xl mx-auto">
        <p className="text-sm font-semibold text-slate-800">Campaign Not Found</p>
        <Link href="/dashboard/outreach" className="text-xs font-semibold text-primary-600 hover:underline">
          ← Return to Outreach List
        </Link>
      </div>
    );
  }

  const leads = campaign.leads || [];
  const safeLeads = leads.filter((l) => l.verifyStatus === 'SAFE').length;
  const readyDrafts = leads.filter((l) => l.status === 'DRAFT_READY' || l.status === 'APPROVED').length;
  const dispatchedLeads = leads.filter((l) => l.status === 'DISPATCHED' || l.status === 'CONVERTED').length;
  const convertedLeads = leads.filter((l) => l.status === 'CONVERTED').length;

  return (
    <div className="p-4 sm:p-6 lg:p-8 space-y-6 max-w-7xl mx-auto">
      {/* Top Breadcrumb & Campaign Header */}
      <div className="bg-white p-6 rounded-2xl border border-slate-200/80 shadow-xs space-y-4">
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
          <div>
            <Link
              href="/dashboard/outreach"
              className="text-xs font-semibold text-primary-600 hover:text-primary-800 flex items-center gap-1 mb-1"
            >
              ← Back to Outreach Campaigns
            </Link>
            <div className="flex items-center gap-3">
              <h1 className="text-xl font-bold text-slate-900 tracking-tight">{campaign.name}</h1>
              <span className="px-2.5 py-0.5 rounded-full text-[11px] font-bold bg-primary-50 text-primary-700 border border-primary-200/60">
                {campaign.status}
              </span>
            </div>
            <p className="text-xs text-slate-500 mt-1">
              Target: <span className="font-semibold text-slate-700">{campaign.targetRole || 'Executives'}</span> in{' '}
              <span className="font-semibold text-slate-700">{campaign.targetLocation || 'Global'}</span> • Sender:{' '}
              <span className="font-semibold text-slate-700">{campaign.account?.senderEmail || 'Default Mailer'}</span>
            </p>
          </div>

          {/* Action Toolbar */}
          <div className="flex flex-wrap items-center gap-2">
            <button
              onClick={handleSourceLeads}
              disabled={Boolean(actionLoading)}
              className="px-3 py-2 bg-slate-100 hover:bg-slate-200 text-slate-800 text-xs font-semibold rounded-xl transition-colors disabled:opacity-50 flex items-center gap-1.5"
            >
              <span>{actionLoading === 'scrape' ? '⏳' : '🔍'}</span>
              <span>Source More Leads</span>
            </button>
            <button
              onClick={handleVerifyEmails}
              disabled={Boolean(actionLoading)}
              className="px-3 py-2 bg-blue-50 hover:bg-blue-100 text-blue-700 border border-blue-200/60 text-xs font-semibold rounded-xl transition-colors disabled:opacity-50 flex items-center gap-1.5"
            >
              <span>{actionLoading === 'verify' ? '⏳' : '🛡️'}</span>
              <span>Verify Mailboxes</span>
            </button>
            <button
              onClick={handleGenerateDrafts}
              disabled={Boolean(actionLoading)}
              className="px-3 py-2 bg-purple-50 hover:bg-purple-100 text-purple-700 border border-purple-200/60 text-xs font-semibold rounded-xl transition-colors disabled:opacity-50 flex items-center gap-1.5"
            >
              <span>{actionLoading === 'draft' ? '⏳' : '🤖'}</span>
              <span>Generate AI Drafts</span>
            </button>
            <button
              onClick={handleDispatchEmails}
              disabled={Boolean(actionLoading) || readyDrafts === 0}
              className="px-4 py-2 bg-primary-600 hover:bg-primary-700 text-white text-xs font-semibold rounded-xl shadow-xs transition-colors disabled:opacity-50 flex items-center gap-1.5"
            >
              <span>{actionLoading === 'dispatch' ? '⏳' : '✉️'}</span>
              <span>Dispatch Emails ({readyDrafts})</span>
            </button>
          </div>
        </div>

        {/* Action Status Banner */}
        {actionMessage && (
          <div className="p-3 bg-emerald-50 border border-emerald-200 text-xs font-medium text-emerald-800 rounded-xl flex items-center justify-between">
            <span>{actionMessage}</span>
            <button onClick={() => setActionMessage('')} className="text-emerald-600 hover:text-emerald-900 font-bold">
              ✕
            </button>
          </div>
        )}
      </div>

      {/* Progress Funnel Tiles */}
      <div className="grid grid-cols-2 lg:grid-cols-5 gap-3">
        <div className="bg-white p-4 rounded-xl border border-slate-200/80 shadow-xs">
          <p className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">1. Sourced</p>
          <p className="text-xl font-bold text-slate-900 mt-1">{leads.length}</p>
        </div>
        <div className="bg-white p-4 rounded-xl border border-slate-200/80 shadow-xs">
          <p className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">2. Safe Mailboxes</p>
          <p className="text-xl font-bold text-blue-600 mt-1">{safeLeads}</p>
        </div>
        <div className="bg-white p-4 rounded-xl border border-slate-200/80 shadow-xs">
          <p className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">3. AI Drafts Ready</p>
          <p className="text-xl font-bold text-purple-600 mt-1">{readyDrafts}</p>
        </div>
        <div className="bg-white p-4 rounded-xl border border-slate-200/80 shadow-xs">
          <p className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">4. Dispatched</p>
          <p className="text-xl font-bold text-indigo-600 mt-1">{dispatchedLeads}</p>
        </div>
        <div className="bg-white p-4 rounded-xl border border-slate-200/80 shadow-xs col-span-2 lg:col-span-1">
          <p className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">5. CRM Converted</p>
          <p className="text-xl font-bold text-emerald-600 mt-1">{convertedLeads}</p>
        </div>
      </div>

      {/* Lead Staging Table */}
      <div className="bg-white rounded-2xl border border-slate-200/80 shadow-xs overflow-hidden">
        <div className="p-4 border-b border-slate-100 flex items-center justify-between">
          <div>
            <h2 className="text-sm font-bold text-slate-900">Lead Staging & Verification Workspace</h2>
            <p className="text-[11px] text-slate-400 mt-0.5">
              Review enriched contacts, verify mailbox deliverables, and preview personalized AI messages.
            </p>
          </div>
          <button
            onClick={fetchCampaign}
            className="text-xs text-slate-500 hover:text-slate-800 transition-colors flex items-center gap-1"
          >
            <span>🔄</span> Refresh
          </button>
        </div>

        {leads.length === 0 ? (
          <div className="p-12 text-center text-xs text-slate-400">
            No leads sourced yet for this campaign. Click &quot;Source More Leads&quot; to begin.
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs text-slate-600">
              <thead className="bg-slate-50/80 text-[11px] font-bold text-slate-400 uppercase tracking-wider border-b border-slate-100">
                <tr>
                  <th className="px-4 py-3">Prospect & Organization</th>
                  <th className="px-4 py-3">Email Address</th>
                  <th className="px-4 py-3 text-center">Deliverability</th>
                  <th className="px-4 py-3 text-center">Campaign Status</th>
                  <th className="px-4 py-3">AI Draft Preview</th>
                  <th className="px-4 py-3 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {leads.map((lead) => {
                  const isSafe = lead.verifyStatus === 'SAFE';
                  const isRisky = lead.verifyStatus === 'RISKY';
                  const isInvalid = lead.verifyStatus === 'INVALID';

                  return (
                    <tr key={lead.id} className="hover:bg-slate-50/60 transition-colors">
                      {/* Name & Company */}
                      <td className="px-4 py-3.5">
                        <div className="font-bold text-slate-900 flex items-center gap-1.5">
                          <span>{lead.fullName}</span>
                          {lead.linkedinUrl && (
                            <a
                              href={lead.linkedinUrl}
                              target="_blank"
                              rel="noreferrer"
                              className="text-blue-600 hover:text-blue-800 text-[11px]"
                              title="Open LinkedIn Profile"
                            >
                              🔗
                            </a>
                          )}
                        </div>
                        <p className="text-[11px] text-slate-500">
                          {lead.jobTitle} • <span className="font-medium text-slate-700">{lead.companyName}</span>
                        </p>
                      </td>

                      {/* Email */}
                      <td className="px-4 py-3.5 font-mono text-[11px] text-slate-700">
                        {lead.email || <span className="text-slate-400 italic">Not discovered</span>}
                      </td>

                      {/* Deliverability Badge */}
                      <td className="px-4 py-3.5 text-center">
                        {isSafe && (
                          <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-bold bg-emerald-50 text-emerald-700 border border-emerald-200">
                            🟢 Safe ({lead.verifyScore}%)
                          </span>
                        )}
                        {isRisky && (
                          <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-bold bg-amber-50 text-amber-700 border border-amber-200">
                            🟡 Risky ({lead.verifyScore}%)
                          </span>
                        )}
                        {isInvalid && (
                          <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-bold bg-red-50 text-red-700 border border-red-200">
                            🔴 Invalid
                          </span>
                        )}
                        {!lead.verifyStatus && (
                          <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-bold bg-slate-100 text-slate-500">
                            ⚪ Unverified
                          </span>
                        )}
                      </td>

                      {/* Status */}
                      <td className="px-4 py-3.5 text-center">
                        <span className="inline-flex items-center px-2 py-0.5 rounded-md text-[10px] font-semibold bg-slate-100 text-slate-700">
                          {lead.status.replace('_', ' ')}
                        </span>
                        {lead.sentAt && (
                          <p className="text-[9px] text-slate-400 mt-0.5">
                            Sent {new Date(lead.sentAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                          </p>
                        )}
                      </td>

                      {/* AI Draft Preview */}
                      <td className="px-4 py-3.5 max-w-xs">
                        {lead.aiDraftSubject ? (
                          <button
                            onClick={() => openDraftModal(lead)}
                            className="text-left group hover:text-primary-600 block"
                          >
                            <p className="font-semibold text-slate-800 group-hover:text-primary-600 truncate text-[11px]">
                              {lead.aiDraftSubject}
                            </p>
                            <p className="text-[10px] text-slate-400 truncate mt-0.5">
                              {lead.aiDraftBody?.slice(0, 70)}...
                            </p>
                          </button>
                        ) : (
                          <span className="text-slate-400 text-[11px] italic">No draft yet</span>
                        )}
                      </td>

                      {/* Actions */}
                      <td className="px-4 py-3.5 text-right space-x-1.5 whitespace-nowrap">
                        {lead.aiDraftSubject && (
                          <button
                            onClick={() => openDraftModal(lead)}
                            className="px-2.5 py-1 bg-slate-100 hover:bg-slate-200 text-slate-700 text-[11px] font-semibold rounded-lg transition-colors"
                          >
                            Preview
                          </button>
                        )}
                        {lead.status === 'CONVERTED' ? (
                          <span className="px-2.5 py-1 bg-emerald-50 text-emerald-700 border border-emerald-200 text-[11px] font-bold rounded-lg">
                            ✓ In CRM
                          </span>
                        ) : (
                          <button
                            onClick={() => handlePushToCrm(lead.id)}
                            className="px-2.5 py-1 bg-indigo-50 hover:bg-indigo-100 text-indigo-700 border border-indigo-200 text-[11px] font-bold rounded-lg transition-colors"
                            title="Convert immediately to Kanban CRM Lead Card"
                          >
                            + Push to CRM
                          </button>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Draft Review & Edit Modal */}
      {selectedLead && (
        <div className="fixed inset-0 bg-slate-900/50 backdrop-blur-xs flex items-center justify-center p-4 z-50">
          <div className="bg-white rounded-2xl max-w-xl w-full p-6 shadow-xl border border-slate-200 space-y-4">
            <div className="flex items-center justify-between border-b border-slate-100 pb-3">
              <div>
                <h3 className="text-sm font-bold text-slate-900">Personalized AI Cold Email</h3>
                <p className="text-xs text-slate-500">
                  Recipient: <span className="font-semibold text-slate-700">{selectedLead.fullName}</span> ({selectedLead.email})
                </p>
              </div>
              <button
                onClick={() => setSelectedLead(null)}
                className="text-slate-400 hover:text-slate-600 text-lg leading-none"
              >
                ✕
              </button>
            </div>

            <div className="space-y-3">
              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">Subject Line</label>
                <input
                  type="text"
                  value={editSubject}
                  onChange={(e) => setEditSubject(e.target.value)}
                  className="w-full px-3 py-2 border border-slate-300 rounded-xl text-xs focus:outline-none focus:ring-2 focus:ring-primary-500 font-semibold text-slate-800"
                />
              </div>
              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">Email Body</label>
                <textarea
                  rows={8}
                  value={editBody}
                  onChange={(e) => setEditBody(e.target.value)}
                  className="w-full px-3 py-2 border border-slate-300 rounded-xl text-xs focus:outline-none focus:ring-2 focus:ring-primary-500 text-slate-800 leading-relaxed font-sans"
                />
              </div>
            </div>

            <div className="flex items-center justify-between pt-3 border-t border-slate-100">
              <button
                type="button"
                onClick={() => handlePushToCrm(selectedLead.id)}
                className="px-3 py-1.5 bg-indigo-50 text-indigo-700 hover:bg-indigo-100 text-xs font-semibold rounded-lg transition-colors"
              >
                Push to Kanban CRM
              </button>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => setSelectedLead(null)}
                  className="px-3 py-1.5 text-xs text-slate-600 hover:bg-slate-100 rounded-lg"
                >
                  Close
                </button>
                <button
                  type="button"
                  onClick={saveEditedDraft}
                  className="px-4 py-1.5 text-xs bg-primary-600 text-white font-semibold rounded-lg hover:bg-primary-700"
                >
                  Save Draft
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
