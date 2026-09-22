'use client';

import { useEffect, useState, use } from 'react';
import Link from 'next/link';
import ConfirmDialog, { type ConfirmDialogVariant } from '@/components/ui/ConfirmDialog';
import toast, { Toaster } from 'react-hot-toast';

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
  metadata?: Record<string, any> | null;
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
    smtpUser?: string;
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
  const [rowLoading, setRowLoading] = useState<Record<string, boolean>>({});
  const [exportingCsv, setExportingCsv] = useState(false);

  // Pagination & Filtering
  const [currentPage, setCurrentPage] = useState(1);
  const pageSize = 15;
  const [filterStatus, setFilterStatus] = useState('ALL');

  // Selected Lead for Draft Review Modal
  const [selectedLead, setSelectedLead] = useState<Lead | null>(null);
  const [editSubject, setEditSubject] = useState('');
  const [editBody, setEditBody] = useState('');
  const [editEmail, setEditEmail] = useState('');
  const [savingDraft, setSavingDraft] = useState(false);
  const [sendingSingleTest, setSendingSingleTest] = useState(false);
  const [pushingToCrmModal, setPushingToCrmModal] = useState(false);

  // Add Custom Lead Modal State
  const [isAddLeadOpen, setIsAddLeadOpen] = useState(false);
  const [customName, setCustomName] = useState('');
  const [customEmail, setCustomEmail] = useState('');
  const [customCompany, setCustomCompany] = useState('');
  const [customRole, setCustomRole] = useState('');
  const [addingCustomLead, setAddingCustomLead] = useState(false);

  // Direct Test Email Modal State
  const [isTestSendOpen, setIsTestSendOpen] = useState(false);
  const [testTargetEmail, setTestTargetEmail] = useState('salmanajawe@gmail.com');
  const [testSubject, setTestSubject] = useState('');
  const [testContent, setTestContent] = useState('');
  const [sendingTestDirect, setSendingTestDirect] = useState(false);

  // SweetAlert2-styled Confirm Dialog State
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
    fetchCampaign();
  }, [campaignId]);

  async function fetchCampaign() {
    setLoading(true);
    setError('');
    try {
      const res = await fetch(`/api/outreach/campaigns/${campaignId}`);
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Failed to load campaign');
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
    try {
      const res = await fetch(`/api/outreach/campaigns/${campaignId}/scrape`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ limit: 10 }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Failed to source leads');
      toast.success(`Successfully sourced ${data.count} new leads via Apify.`);
      await fetchCampaign();
    } catch (err: any) {
      toast.error(`Source error: ${err.message}`);
    } finally {
      setActionLoading('');
    }
  }

  // 2. Verify Emails via Reoon (Batch or Single)
  async function handleVerifyEmails(leadId?: string) {
    if (leadId) {
      setRowLoading((prev) => ({ ...prev, [`${leadId}-verify`]: true }));
    } else {
      setActionLoading('verify');
    }
    try {
      const res = await fetch(`/api/outreach/campaigns/${campaignId}/verify`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(leadId ? { leadIds: [leadId] } : {}),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Failed to verify emails');
      toast.success(leadId ? 'Lead mailbox deliverability verified.' : `Email verification complete: ${data.safeCount} safe mailboxes.`);
      await fetchCampaign();
    } catch (err: any) {
      toast.error(`Verification error: ${err.message}`);
    } finally {
      if (leadId) {
        setRowLoading((prev) => ({ ...prev, [`${leadId}-verify`]: false }));
      } else {
        setActionLoading('');
      }
    }
  }

  // 3. Generate AI Cold Email Drafts (Batch or Single)
  async function handleGenerateDrafts(leadId?: string) {
    if (leadId) {
      setRowLoading((prev) => ({ ...prev, [`${leadId}-draft`]: true }));
    } else {
      setActionLoading('draft');
    }
    try {
      const res = await fetch(`/api/outreach/campaigns/${campaignId}/draft`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(leadId ? { leadIds: [leadId] } : {}),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Failed to generate drafts');
      toast.success(leadId ? 'AI personalized draft regenerated.' : `AI Copywriting complete: ${data.draftsCreated} drafts generated.`);
      await fetchCampaign();
    } catch (err: any) {
      toast.error(`Draft error: ${err.message}`);
    } finally {
      if (leadId) {
        setRowLoading((prev) => ({ ...prev, [`${leadId}-draft`]: false }));
      } else {
        setActionLoading('');
      }
    }
  }

  // 4. Batch or Single Dispatch Emails with SweetAlert2 style confirmation
  function handleDispatchEmails(leadId?: string) {
    const isSingle = Boolean(leadId);
    const targetLead = isSingle ? campaign?.leads.find((l) => l.id === leadId) : null;
    const recipientInfo = targetLead ? `to "${targetLead.fullName}" (${targetLead.email})` : `to ${readyDrafts} verified prospects`;

    setConfirmDialog({
      isOpen: true,
      title: isSingle ? 'Dispatch Cold Email?' : `Launch Campaign to ${readyDrafts} Leads?`,
      message: isSingle
        ? `Are you ready to dispatch a cold email to "${targetLead?.fullName}" (${targetLead?.email})? This will consume daily sending quota.`
        : `Dispatch cold email campaign to ${readyDrafts} verified safe leads? This will consume daily sending quota.`,
      confirmText: isSingle ? 'Send Email Now' : 'Launch & Dispatch Campaign',
      variant: 'primary',
      onConfirm: async () => {
        setConfirmDialog((prev) => ({ ...prev, isLoading: true }));
        if (leadId) {
          setRowLoading((prev) => ({ ...prev, [`${leadId}-send`]: true }));
        } else {
          setActionLoading('dispatch');
        }
        try {
          const res = await fetch(`/api/outreach/campaigns/${campaignId}/dispatch`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(leadId ? { leadIds: [leadId] } : {}),
          });
          const data = await res.json();
          if (!res.ok) throw new Error(data.error || 'Failed to dispatch emails');
          toast.success(leadId ? 'Email dispatched successfully.' : `Batch dispatch executed: ${data.dispatchedCount} emails sent.`);
          await fetchCampaign();
        } catch (err: any) {
          toast.error(`Dispatch error: ${err.message}`);
        } finally {
          setConfirmDialog((prev) => ({ ...prev, isOpen: false, isLoading: false }));
          if (leadId) {
            setRowLoading((prev) => ({ ...prev, [`${leadId}-send`]: false }));
          } else {
            setActionLoading('');
          }
        }
      },
    });
  }

  // 5. Manual Push to Kanban CRM with SweetAlert2 style confirmation
  function handlePushToCrm(leadId: string) {
    const targetLead = campaign?.leads.find((l) => l.id === leadId);
    const name = targetLead?.fullName || 'this lead';

    setConfirmDialog({
      isOpen: true,
      title: `Push "${name}" to Kanban CRM?`,
      message: 'This will convert the prospect into a new lead card on your primary Kanban CRM board in the "Leads" column.',
      confirmText: 'Push to Kanban CRM',
      variant: 'info',
      onConfirm: async () => {
        setConfirmDialog((prev) => ({ ...prev, isLoading: true }));
        setRowLoading((prev) => ({ ...prev, [`${leadId}-push`]: true }));
        try {
          const res = await fetch(`/api/outreach/leads/${leadId}/push-to-crm`, {
            method: 'POST',
          });
          const data = await res.json();
          if (!res.ok) throw new Error(data.error || 'Failed to push lead to CRM');
          toast.success(`"${name}" converted to Kanban CRM successfully!`);
          await fetchCampaign();
        } catch (err: any) {
          toast.error(`Push to CRM failed: ${err.message}`);
        } finally {
          setConfirmDialog((prev) => ({ ...prev, isOpen: false, isLoading: false }));
          setRowLoading((prev) => ({ ...prev, [`${leadId}-push`]: false }));
        }
      },
    });
  }

  // 6. Export Campaign Leads to CSV
  async function handleExportCsv() {
    if (!campaign?.leads || campaign.leads.length === 0) return;
    setExportingCsv(true);
    try {
      const headers = ['Full Name', 'Job Title', 'Company', 'Email', 'Deliverability', 'Status', 'Draft Subject', 'LinkedIn URL'];
      const rows = campaign.leads.map((l) => [
        `"${l.fullName.replace(/"/g, '""')}"`,
        `"${(l.jobTitle || '').replace(/"/g, '""')}"`,
        `"${(l.companyName || '').replace(/"/g, '""')}"`,
        `"${(l.email || '').replace(/"/g, '""')}"`,
        `"${l.verifyStatus || 'UNVERIFIED'}"`,
        `"${l.status}"`,
        `"${(l.aiDraftSubject || '').replace(/"/g, '""')}"`,
        `"${(l.linkedinUrl || '').replace(/"/g, '""')}"`,
      ]);
      const csvContent = 'data:text/csv;charset=utf-8,' + [headers.join(','), ...rows.map((r) => r.join(','))].join('\n');
      const encodedUri = encodeURI(csvContent);
      const link = document.createElement('a');
      link.setAttribute('href', encodedUri);
      link.setAttribute('download', `${campaign.name.toLowerCase().replace(/[^a-z0-9]/g, '_')}_leads.csv`);
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      toast.success('Campaign leads exported to CSV');
    } finally {
      setExportingCsv(false);
    }
  }

  // 7. Add Custom / Test Lead
  async function handleAddCustomLead(e: React.FormEvent) {
    e.preventDefault();
    if (!customName.trim() || !customEmail.trim()) {
      toast.error('Name and Email are required.');
      return;
    }
    setAddingCustomLead(true);
    try {
      const res = await fetch(`/api/outreach/campaigns/${campaignId}/leads`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          fullName: customName.trim(),
          email: customEmail.trim().toLowerCase(),
          companyName: customCompany.trim() || 'Custom Org',
          jobTitle: customRole.trim() || 'Director',
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Failed to add lead');
      setIsAddLeadOpen(false);
      setCustomName('');
      setCustomEmail('');
      setCustomCompany('');
      setCustomRole('');
      toast.success(`Custom lead "${customName}" added with AI draft!`);
      await fetchCampaign();
    } catch (err: any) {
      toast.error(`Add Lead error: ${err.message}`);
    } finally {
      setAddingCustomLead(false);
    }
  }

  // 8. Direct Live Test Send
  async function handleSendDirectTest(e?: React.FormEvent) {
    if (e) e.preventDefault();
    if (!testTargetEmail.trim()) {
      toast.error('Target recipient email is required.');
      return;
    }
    setSendingTestDirect(true);
    try {
      const res = await fetch(`/api/outreach/campaigns/${campaignId}/test-send`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          targetEmail: testTargetEmail.trim(),
          subject: testSubject.trim() || undefined,
          content: testContent.trim() || undefined,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Test send failed');
      setIsTestSendOpen(false);
      toast.success(`Test email dispatched to ${data.recipient}! Check inbox.`);
    } catch (err: any) {
      toast.error(`Test Send failed: ${err.message}`);
    } finally {
      setSendingTestDirect(false);
    }
  }

  function openDraftModal(lead: Lead) {
    setSelectedLead(lead);
    setEditSubject(lead.aiDraftSubject || '');
    setEditBody(lead.aiDraftBody || '');
    setEditEmail(lead.email || '');
  }

  async function saveEditedDraft() {
    if (!selectedLead) return;
    setSavingDraft(true);
    try {
      const res = await fetch(`/api/outreach/leads/${selectedLead.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          aiDraftSubject: editSubject.trim(),
          aiDraftBody: editBody.trim(),
          email: editEmail.trim() || undefined,
        }),
      });
      if (!res.ok) throw new Error('Failed to save draft changes');

      // Update local state
      setCampaign((prev) => {
        if (!prev) return null;
        return {
          ...prev,
          leads: prev.leads.map((l) =>
            l.id === selectedLead.id
              ? {
                  ...l,
                  aiDraftSubject: editSubject.trim(),
                  aiDraftBody: editBody.trim(),
                  email: editEmail.trim() || l.email,
                }
              : l
          ),
        };
      });
      setSelectedLead(null);
      toast.success('Draft details updated successfully.');
    } catch (err: any) {
      toast.error(`Save draft error: ${err.message}`);
    } finally {
      setSavingDraft(false);
    }
  }

  async function sendSingleTestNow() {
    if (!selectedLead) return;
    setSendingSingleTest(true);
    try {
      // Save draft first
      await fetch(`/api/outreach/leads/${selectedLead.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          aiDraftSubject: editSubject.trim(),
          aiDraftBody: editBody.trim(),
          email: editEmail.trim() || undefined,
        }),
      });

      // Dispatch directly to this lead's updated email
      const res = await fetch(`/api/outreach/campaigns/${campaignId}/test-send`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          targetEmail: editEmail.trim() || selectedLead.email,
          subject: editSubject.trim(),
          content: editBody.trim(),
          leadId: selectedLead.id,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Failed to dispatch email');

      setSelectedLead(null);
      toast.success(`Email dispatched successfully to ${data.recipient}!`);
      await fetchCampaign();
    } catch (err: any) {
      toast.error(`Dispatch Error: ${err.message}`);
    } finally {
      setSendingSingleTest(false);
    }
  }

  if (loading && !campaign) {
    return (
      <div className="p-12 text-center text-xs text-slate-500 max-w-7xl mx-auto space-y-3">
        <div className="w-8 h-8 border-3 border-primary-600 border-t-transparent rounded-full animate-spin mx-auto" />
        <p className="font-medium">Loading campaign workspace...</p>
      </div>
    );
  }

  if (!campaign) {
    return (
      <div className="p-8 text-center space-y-3 max-w-7xl mx-auto">
        <p className="text-sm font-semibold text-slate-800">Campaign Not Found</p>
        {error && <p className="text-xs text-red-500 max-w-md mx-auto">{error}</p>}
        <div className="pt-2 flex items-center justify-center gap-3">
          <button
            onClick={() => fetchCampaign()}
            className="px-3.5 py-1.5 bg-primary-600 hover:bg-primary-700 text-white text-xs font-semibold rounded-xl"
          >
            Retry Loading
          </button>
          <Link href="/dashboard/outreach" className="px-3.5 py-1.5 bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs font-semibold rounded-xl">
            ← Return to Outreach List
          </Link>
        </div>
      </div>
    );
  }

  const allLeads = campaign.leads || [];
  const safeLeads = allLeads.filter((l) => l.verifyStatus === 'SAFE').length;
  const readyDrafts = allLeads.filter((l) => l.status === 'DRAFT_READY' || l.status === 'APPROVED').length;
  const dispatchedLeads = allLeads.filter((l) => l.status === 'DISPATCHED' || l.status === 'CONVERTED').length;
  const convertedLeads = allLeads.filter((l) => l.status === 'CONVERTED').length;

  const filteredLeads = allLeads.filter((l) => {
    if (filterStatus === 'SAFE') return l.verifyStatus === 'SAFE';
    if (filterStatus === 'DRAFT_READY') return l.status === 'DRAFT_READY' || l.status === 'APPROVED';
    if (filterStatus === 'DISPATCHED') return l.status === 'DISPATCHED' || l.status === 'CONVERTED';
    return true;
  });

  const totalPages = Math.ceil(filteredLeads.length / pageSize) || 1;
  const paginatedLeads = filteredLeads.slice((currentPage - 1) * pageSize, currentPage * pageSize);

  return (
    <div className="p-4 sm:p-6 lg:p-8 space-y-6 max-w-7xl mx-auto">
      <Toaster position="top-right" />

      {/* SweetAlert2 Style Confirm Modal */}
      <ConfirmDialog
        isOpen={confirmDialog.isOpen}
        title={confirmDialog.title}
        message={confirmDialog.message}
        confirmText={confirmDialog.confirmText}
        cancelText={confirmDialog.cancelText}
        variant={confirmDialog.variant}
        isLoading={confirmDialog.isLoading}
        onConfirm={confirmDialog.onConfirm}
        onCancel={() => setConfirmDialog((prev) => ({ ...prev, isOpen: false }))}
      />

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
              <span className="font-semibold text-slate-700">{campaign.account?.senderEmail || 'Admin Connected SMTP'}</span>
            </p>
          </div>

          {/* Action Toolbar with Lazy Loading States */}
          <div className="flex flex-wrap items-center gap-2">
            <button
              onClick={() => setIsTestSendOpen(true)}
              disabled={Boolean(actionLoading) || loading}
              className="px-3 py-2 bg-amber-50 hover:bg-amber-100 text-amber-900 border border-amber-300 text-xs font-bold rounded-xl transition-colors flex items-center gap-1.5 shadow-2xs disabled:opacity-50"
              title="Kirim email percobaan langsung ke inbox pribadi Anda"
            >
              <span>⚡</span>
              <span>Test Send to My Email</span>
            </button>
            <button
              onClick={() => setIsAddLeadOpen(true)}
              disabled={Boolean(actionLoading) || loading}
              className="px-3 py-2 bg-emerald-50 hover:bg-emerald-100 text-emerald-800 border border-emerald-300 text-xs font-bold rounded-xl transition-colors flex items-center gap-1.5 shadow-2xs disabled:opacity-50"
              title="Tambahkan email target khusus/pribadi sebagai lead kampanye"
            >
              <span>➕</span>
              <span>Add Custom Lead</span>
            </button>
            <button
              onClick={handleExportCsv}
              disabled={exportingCsv || Boolean(actionLoading) || loading}
              className="px-3 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs font-semibold rounded-xl transition-colors flex items-center gap-1.5 disabled:opacity-50"
              title="Export leads to CSV"
            >
              {exportingCsv ? (
                <>
                  <span className="w-3.5 h-3.5 border-2 border-slate-700 border-t-transparent rounded-full animate-spin" />
                  <span>Exporting...</span>
                </>
              ) : (
                <>
                  <span>📊</span>
                  <span>Export CSV</span>
                </>
              )}
            </button>
            <button
              onClick={handleSourceLeads}
              disabled={Boolean(actionLoading) || loading}
              className="px-3 py-2 bg-slate-100 hover:bg-slate-200 text-slate-800 text-xs font-semibold rounded-xl transition-colors disabled:opacity-50 flex items-center gap-1.5"
            >
              {actionLoading === 'scrape' ? (
                <>
                  <span className="w-3.5 h-3.5 border-2 border-slate-800 border-t-transparent rounded-full animate-spin" />
                  <span>Sourcing Leads...</span>
                </>
              ) : (
                <>
                  <span>🔍</span>
                  <span>Source More</span>
                </>
              )}
            </button>
            <button
              onClick={() => handleVerifyEmails()}
              disabled={Boolean(actionLoading) || loading}
              className="px-3 py-2 bg-blue-50 hover:bg-blue-100 text-blue-700 border border-blue-200/60 text-xs font-semibold rounded-xl transition-colors disabled:opacity-50 flex items-center gap-1.5"
            >
              {actionLoading === 'verify' ? (
                <>
                  <span className="w-3.5 h-3.5 border-2 border-blue-700 border-t-transparent rounded-full animate-spin" />
                  <span>Verifying...</span>
                </>
              ) : (
                <>
                  <span>🛡️</span>
                  <span>Verify Mailboxes</span>
                </>
              )}
            </button>
            <button
              onClick={() => handleGenerateDrafts()}
              disabled={Boolean(actionLoading) || loading}
              className="px-3 py-2 bg-purple-50 hover:bg-purple-100 text-purple-700 border border-purple-200/60 text-xs font-semibold rounded-xl transition-colors disabled:opacity-50 flex items-center gap-1.5"
            >
              {actionLoading === 'draft' ? (
                <>
                  <span className="w-3.5 h-3.5 border-2 border-purple-700 border-t-transparent rounded-full animate-spin" />
                  <span>Drafting AI...</span>
                </>
              ) : (
                <>
                  <span>🤖</span>
                  <span>Generate AI Drafts</span>
                </>
              )}
            </button>
            <button
              onClick={() => handleDispatchEmails()}
              disabled={Boolean(actionLoading) || readyDrafts === 0 || loading}
              className="px-4 py-2 bg-primary-600 hover:bg-primary-700 text-white text-xs font-semibold rounded-xl shadow-xs transition-colors disabled:opacity-50 flex items-center gap-1.5"
            >
              {actionLoading === 'dispatch' ? (
                <>
                  <span className="w-3.5 h-3.5 border-2 border-white border-t-transparent rounded-full animate-spin" />
                  <span>Dispatching...</span>
                </>
              ) : (
                <>
                  <span>✉️</span>
                  <span>Dispatch Emails ({readyDrafts})</span>
                </>
              )}
            </button>
          </div>
        </div>
      </div>

      {/* Progress Funnel Tiles */}
      <div className="grid grid-cols-2 lg:grid-cols-5 gap-3">
        <button
          onClick={() => { setFilterStatus('ALL'); setCurrentPage(1); }}
          className={`p-4 rounded-xl border text-left transition-all ${filterStatus === 'ALL' ? 'bg-slate-900 text-white border-slate-900 shadow-xs' : 'bg-white border-slate-200/80 hover:border-slate-300'}`}
        >
          <p className={`text-[10px] font-bold uppercase tracking-wider ${filterStatus === 'ALL' ? 'text-slate-300' : 'text-slate-400'}`}>1. Sourced</p>
          <p className="text-xl font-bold mt-1">{allLeads.length}</p>
        </button>
        <button
          onClick={() => { setFilterStatus('SAFE'); setCurrentPage(1); }}
          className={`p-4 rounded-xl border text-left transition-all ${filterStatus === 'SAFE' ? 'bg-blue-600 text-white border-blue-600 shadow-xs' : 'bg-white border-slate-200/80 hover:border-slate-300'}`}
        >
          <p className={`text-[10px] font-bold uppercase tracking-wider ${filterStatus === 'SAFE' ? 'text-blue-100' : 'text-slate-400'}`}>2. Safe Mailboxes</p>
          <p className={`text-xl font-bold mt-1 ${filterStatus === 'SAFE' ? 'text-white' : 'text-blue-600'}`}>{safeLeads}</p>
        </button>
        <button
          onClick={() => { setFilterStatus('DRAFT_READY'); setCurrentPage(1); }}
          className={`p-4 rounded-xl border text-left transition-all ${filterStatus === 'DRAFT_READY' ? 'bg-purple-600 text-white border-purple-600 shadow-xs' : 'bg-white border-slate-200/80 hover:border-slate-300'}`}
        >
          <p className={`text-[10px] font-bold uppercase tracking-wider ${filterStatus === 'DRAFT_READY' ? 'text-purple-100' : 'text-slate-400'}`}>3. AI Drafts Ready</p>
          <p className={`text-xl font-bold mt-1 ${filterStatus === 'DRAFT_READY' ? 'text-white' : 'text-purple-600'}`}>{readyDrafts}</p>
        </button>
        <button
          onClick={() => { setFilterStatus('DISPATCHED'); setCurrentPage(1); }}
          className={`p-4 rounded-xl border text-left transition-all ${filterStatus === 'DISPATCHED' ? 'bg-indigo-600 text-white border-indigo-600 shadow-xs' : 'bg-white border-slate-200/80 hover:border-slate-300'}`}
        >
          <p className={`text-[10px] font-bold uppercase tracking-wider ${filterStatus === 'DISPATCHED' ? 'text-indigo-100' : 'text-slate-400'}`}>4. Dispatched</p>
          <p className={`text-xl font-bold mt-1 ${filterStatus === 'DISPATCHED' ? 'text-white' : 'text-indigo-600'}`}>{dispatchedLeads}</p>
        </button>
        <div className="bg-white p-4 rounded-xl border border-slate-200/80 shadow-xs col-span-2 lg:col-span-1">
          <p className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">5. CRM Converted</p>
          <p className="text-xl font-bold text-emerald-600 mt-1">{convertedLeads}</p>
        </div>
      </div>

      {/* Lead Staging Table */}
      <div className="bg-white rounded-2xl border border-slate-200/80 shadow-xs overflow-hidden">
        <div className="p-4 border-b border-slate-100 flex items-center justify-between">
          <div>
            <h2 className="text-sm font-bold text-slate-900">Lead Staging & Deliverability Matrix</h2>
            <p className="text-[11px] text-slate-400 mt-0.5">
              Showing {filteredLeads.length} leads (Filter: {filterStatus})
            </p>
          </div>
          <button
            onClick={fetchCampaign}
            disabled={loading}
            className="text-xs text-slate-500 hover:text-slate-800 transition-colors flex items-center gap-1.5 disabled:opacity-50"
          >
            <span className={loading ? 'animate-spin' : ''}>🔄</span>
            <span>{loading ? 'Refreshing...' : 'Refresh'}</span>
          </button>
        </div>

        {allLeads.length === 0 ? (
          <div className="p-12 text-center text-xs text-slate-400">
            No leads sourced yet for this campaign. Click &quot;Source More&quot; or &quot;Add Custom Lead&quot; to begin.
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
                {paginatedLeads.map((lead) => {
                  const isSafe = lead.verifyStatus === 'SAFE';
                  const isRisky = lead.verifyStatus === 'RISKY';
                  const isInvalid = lead.verifyStatus === 'INVALID';
                  const isDrafting = rowLoading[`${lead.id}-draft`];
                  const isSending = rowLoading[`${lead.id}-send`];
                  const isPushing = rowLoading[`${lead.id}-push`];

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
                              className="text-blue-500 hover:text-blue-700 text-[10px]"
                              title="Open LinkedIn Profile"
                            >
                              🔗
                            </a>
                          )}
                        </div>
                        <p className="text-[11px] text-slate-500 mt-0.5">
                          {lead.jobTitle} • <span className="font-medium text-slate-700">{lead.companyName}</span>
                        </p>
                      </td>

                      {/* Email */}
                      <td className="px-4 py-3.5 font-mono text-[11px] text-slate-800">
                        {lead.email ? (
                          <div className="flex items-center gap-1.5">
                            <span>{lead.email}</span>
                            <button
                              onClick={() => openDraftModal(lead)}
                              className="text-slate-400 hover:text-primary-600 text-[10px]"
                              title="Edit Email Address"
                            >
                              ✏️
                            </button>
                          </div>
                        ) : (
                          <span className="text-slate-400 italic">Not found yet</span>
                        )}
                      </td>

                      {/* Deliverability */}
                      <td className="px-4 py-3.5 text-center">
                        {isSafe && (
                          <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-bold bg-emerald-100 text-emerald-800">
                            🟢 Safe ({lead.verifyScore || 95}%)
                          </span>
                        )}
                        {isRisky && (
                          <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-bold bg-amber-100 text-amber-800">
                            🟡 Risky
                          </span>
                        )}
                        {isInvalid && (
                          <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-bold bg-red-100 text-red-800">
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

                      {/* Actions with Lazy Loading Spinners */}
                      <td className="px-4 py-3.5 text-right space-x-1.5 whitespace-nowrap">
                        <button
                          onClick={() => handleGenerateDrafts(lead.id)}
                          disabled={isDrafting || isSending || isPushing}
                          className="px-2 py-1 bg-slate-100 hover:bg-slate-200 text-slate-700 text-[11px] font-semibold rounded-lg transition-colors disabled:opacity-50 inline-flex items-center gap-1"
                          title="Generate/Re-generate AI draft for this lead"
                        >
                          {isDrafting ? (
                            <>
                              <span className="w-2.5 h-2.5 border-2 border-slate-700 border-t-transparent rounded-full animate-spin" />
                              <span>Drafting...</span>
                            </>
                          ) : (
                            <>
                              <span>🤖</span>
                              <span>Draft</span>
                            </>
                          )}
                        </button>
                        {lead.aiDraftSubject && (
                          <button
                            onClick={() => openDraftModal(lead)}
                            className="px-2.5 py-1 bg-slate-100 hover:bg-slate-200 text-slate-700 text-[11px] font-semibold rounded-lg transition-colors"
                          >
                            Review / Test
                          </button>
                        )}
                        {lead.aiDraftSubject && lead.email && (
                          <button
                            onClick={() => handleDispatchEmails(lead.id)}
                            disabled={isDrafting || isSending || isPushing}
                            className="px-2.5 py-1 bg-primary-50 hover:bg-primary-100 text-primary-700 border border-primary-200 text-[11px] font-bold rounded-lg transition-colors disabled:opacity-50 inline-flex items-center gap-1"
                            title="Send email to this prospect now"
                          >
                            {isSending ? (
                              <>
                                <span className="w-2.5 h-2.5 border-2 border-primary-700 border-t-transparent rounded-full animate-spin" />
                                <span>Sending...</span>
                              </>
                            ) : (
                              <>
                                <span>✉️</span>
                                <span>Send</span>
                              </>
                            )}
                          </button>
                        )}
                        {lead.status === 'CONVERTED' ? (
                          <span className="px-2.5 py-1 bg-emerald-50 text-emerald-700 border border-emerald-200 text-[11px] font-bold rounded-lg">
                            ✓ In CRM
                          </span>
                        ) : (
                          <button
                            onClick={() => handlePushToCrm(lead.id)}
                            disabled={isDrafting || isSending || isPushing}
                            className="px-2.5 py-1 bg-indigo-50 hover:bg-indigo-100 text-indigo-700 border border-indigo-200 text-[11px] font-bold rounded-lg transition-colors disabled:opacity-50 inline-flex items-center gap-1"
                            title="Convert immediately to Kanban CRM Lead Card"
                          >
                            {isPushing ? (
                              <>
                                <span className="w-2.5 h-2.5 border-2 border-indigo-700 border-t-transparent rounded-full animate-spin" />
                                <span>Pushing...</span>
                              </>
                            ) : (
                              <>
                                <span>+</span>
                                <span>Push to CRM</span>
                              </>
                            )}
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

        {/* Pagination Footer */}
        {totalPages > 1 && (
          <div className="p-4 border-t border-slate-100 flex items-center justify-between text-xs text-slate-500">
            <span>
              Page {currentPage} of {totalPages}
            </span>
            <div className="flex items-center gap-2">
              <button
                onClick={() => setCurrentPage((p) => Math.max(p - 1, 1))}
                disabled={currentPage === 1}
                className="px-3 py-1 bg-slate-100 hover:bg-slate-200 rounded-lg disabled:opacity-40 font-semibold"
              >
                Previous
              </button>
              <button
                onClick={() => setCurrentPage((p) => Math.min(p + 1, totalPages))}
                disabled={currentPage === totalPages}
                className="px-3 py-1 bg-slate-100 hover:bg-slate-200 rounded-lg disabled:opacity-40 font-semibold"
              >
                Next
              </button>
            </div>
          </div>
        )}
      </div>

      {/* Add Custom Lead Modal */}
      {isAddLeadOpen && (
        <div className="fixed inset-0 bg-slate-900/50 backdrop-blur-xs flex items-center justify-center p-4 z-50">
          <div className="bg-white rounded-2xl max-w-md w-full p-6 shadow-xl border border-slate-200 space-y-4">
            <div className="flex items-center justify-between border-b border-slate-100 pb-3">
              <div>
                <h3 className="text-sm font-bold text-slate-900">Add Custom / Test Lead</h3>
                <p className="text-xs text-slate-500">Tambahkan target email spesifik untuk tes dispatch real.</p>
              </div>
              <button onClick={() => setIsAddLeadOpen(false)} className="text-slate-400 hover:text-slate-600">
                ✕
              </button>
            </div>

            <form onSubmit={handleAddCustomLead} className="space-y-3">
              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">Target Recipient Email *</label>
                <input
                  type="email"
                  required
                  value={customEmail}
                  onChange={(e) => setCustomEmail(e.target.value)}
                  placeholder="e.g. salmanajawe@gmail.com"
                  className="w-full px-3 py-2 border border-slate-300 rounded-xl text-xs focus:outline-none focus:ring-2 focus:ring-primary-500 font-mono text-slate-800"
                />
              </div>
              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">Prospect Full Name *</label>
                <input
                  type="text"
                  required
                  value={customName}
                  onChange={(e) => setCustomName(e.target.value)}
                  placeholder="e.g. Salman Test"
                  className="w-full px-3 py-2 border border-slate-300 rounded-xl text-xs focus:outline-none focus:ring-2 focus:ring-primary-500 text-slate-800"
                />
              </div>
              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">Company</label>
                  <input
                    type="text"
                    value={customCompany}
                    onChange={(e) => setCustomCompany(e.target.value)}
                    placeholder="e.g. Test Org"
                    className="w-full px-3 py-2 border border-slate-300 rounded-xl text-xs focus:outline-none focus:ring-2 focus:ring-primary-500 text-slate-800"
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">Job Role</label>
                  <input
                    type="text"
                    value={customRole}
                    onChange={(e) => setCustomRole(e.target.value)}
                    placeholder="e.g. Managing Director"
                    className="w-full px-3 py-2 border border-slate-300 rounded-xl text-xs focus:outline-none focus:ring-2 focus:ring-primary-500 text-slate-800"
                  />
                </div>
              </div>

              <div className="flex items-center justify-end gap-2 pt-3 border-t border-slate-100">
                <button
                  type="button"
                  onClick={() => setIsAddLeadOpen(false)}
                  className="px-3.5 py-1.5 text-xs font-semibold text-slate-600 hover:bg-slate-100 rounded-lg"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={addingCustomLead}
                  className="px-4 py-1.5 bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-semibold rounded-lg shadow-xs disabled:opacity-50 inline-flex items-center gap-1.5"
                >
                  {addingCustomLead ? (
                    <>
                      <span className="w-3 h-3 border-2 border-white border-t-transparent rounded-full animate-spin" />
                      <span>Adding & Drafting...</span>
                    </>
                  ) : (
                    <span>Add Lead & Generate AI Draft</span>
                  )}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Direct Test Send Modal */}
      {isTestSendOpen && (
        <div className="fixed inset-0 bg-slate-900/50 backdrop-blur-xs flex items-center justify-center p-4 z-50">
          <div className="bg-white rounded-2xl max-w-lg w-full p-6 shadow-xl border border-slate-200 space-y-4">
            <div className="flex items-center justify-between border-b border-slate-100 pb-3">
              <div className="flex items-center gap-2">
                <span className="text-xl">⚡</span>
                <div>
                  <h3 className="text-sm font-bold text-slate-900">Direct Test Email Dispatcher</h3>
                  <p className="text-xs text-slate-500">Kirim email pengujian langsung ke inbox pribadi Anda.</p>
                </div>
              </div>
              <button onClick={() => setIsTestSendOpen(false)} className="text-slate-400 hover:text-slate-600">
                ✕
              </button>
            </div>

            <form onSubmit={handleSendDirectTest} className="space-y-3">
              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">Send Directly To (Target Email) *</label>
                <input
                  type="email"
                  required
                  value={testTargetEmail}
                  onChange={(e) => setTestTargetEmail(e.target.value)}
                  placeholder="e.g. salmanajawe@gmail.com"
                  className="w-full px-3 py-2 border border-slate-300 rounded-xl text-xs focus:outline-none focus:ring-2 focus:ring-primary-500 font-mono text-slate-800"
                />
              </div>
              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">Email Subject (Optional)</label>
                <input
                  type="text"
                  value={testSubject}
                  onChange={(e) => setTestSubject(e.target.value)}
                  placeholder="Leave empty for auto-generated AI subject"
                  className="w-full px-3 py-2 border border-slate-300 rounded-xl text-xs focus:outline-none focus:ring-2 focus:ring-primary-500 text-slate-800"
                />
              </div>
              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">Email Body Content (Optional)</label>
                <textarea
                  rows={4}
                  value={testContent}
                  onChange={(e) => setTestContent(e.target.value)}
                  placeholder="Leave empty for auto-generated AI personalized cold outreach copy"
                  className="w-full px-3 py-2 border border-slate-300 rounded-xl text-xs focus:outline-none focus:ring-2 focus:ring-primary-500 text-slate-800"
                />
              </div>

              <div className="flex items-center justify-end gap-2 pt-3 border-t border-slate-100">
                <button
                  type="button"
                  onClick={() => setIsTestSendOpen(false)}
                  className="px-3.5 py-1.5 text-xs font-semibold text-slate-600 hover:bg-slate-100 rounded-lg"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={sendingTestDirect}
                  className="px-4 py-1.5 bg-amber-600 hover:bg-amber-700 text-white text-xs font-bold rounded-lg shadow-xs disabled:opacity-50 inline-flex items-center gap-1.5"
                >
                  {sendingTestDirect ? (
                    <>
                      <span className="w-3 h-3 border-2 border-white border-t-transparent rounded-full animate-spin" />
                      <span>Sending Test Email...</span>
                    </>
                  ) : (
                    <span>🚀 Send Test Email Now</span>
                  )}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Draft Review & Edit Modal */}
      {selectedLead && (
        <div className="fixed inset-0 bg-slate-900/50 backdrop-blur-xs flex items-center justify-center p-4 z-50">
          <div className="bg-white rounded-2xl max-w-xl w-full p-6 shadow-xl border border-slate-200 space-y-4">
            <div className="flex items-center justify-between border-b border-slate-100 pb-3">
              <div>
                <h3 className="text-sm font-bold text-slate-900">Personalized AI Cold Email</h3>
                <p className="text-xs text-slate-500">
                  Recipient: <span className="font-semibold text-slate-700">{selectedLead.fullName}</span>
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
                <label className="block text-xs font-semibold text-slate-700 mb-1">
                  Recipient Target Email (Ubah ke email pribadi Anda untuk tes)
                </label>
                <input
                  type="email"
                  value={editEmail}
                  onChange={(e) => setEditEmail(e.target.value)}
                  placeholder="e.g. salmanajawe@gmail.com"
                  className="w-full px-3 py-2 border border-slate-300 rounded-xl text-xs focus:outline-none focus:ring-2 focus:ring-primary-500 font-mono text-slate-800"
                />
              </div>
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

            <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2 pt-3 border-t border-slate-100">
              <button
                type="button"
                onClick={() => handlePushToCrm(selectedLead.id)}
                disabled={pushingToCrmModal}
                className="px-3 py-1.5 bg-indigo-50 text-indigo-700 hover:bg-indigo-100 text-xs font-semibold rounded-lg transition-colors inline-flex items-center gap-1.5 disabled:opacity-50"
              >
                {pushingToCrmModal ? (
                  <>
                    <span className="w-3 h-3 border-2 border-indigo-700 border-t-transparent rounded-full animate-spin" />
                    <span>Converting...</span>
                  </>
                ) : (
                  <span>Push to Kanban CRM</span>
                )}
              </button>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={sendSingleTestNow}
                  disabled={sendingSingleTest || savingDraft}
                  className="px-3 py-1.5 bg-primary-50 border border-primary-300 text-primary-700 hover:bg-primary-100 text-xs font-bold rounded-lg transition-colors inline-flex items-center gap-1.5 disabled:opacity-50"
                  title="Kirim email ini langsung ke alamat email penerima di atas"
                >
                  {sendingSingleTest ? (
                    <>
                      <span className="w-3 h-3 border-2 border-primary-700 border-t-transparent rounded-full animate-spin" />
                      <span>Sending Live...</span>
                    </>
                  ) : (
                    <span>🚀 Send Live to this Lead</span>
                  )}
                </button>
                <button
                  type="button"
                  onClick={() => setSelectedLead(null)}
                  className="px-3 py-1.5 text-xs text-slate-600 hover:bg-slate-100 rounded-lg"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  disabled={savingDraft || sendingSingleTest}
                  onClick={saveEditedDraft}
                  className="px-4 py-1.5 text-xs bg-primary-600 text-white font-semibold rounded-lg hover:bg-primary-700 disabled:opacity-50 inline-flex items-center gap-1.5"
                >
                  {savingDraft ? (
                    <>
                      <span className="w-3 h-3 border-2 border-white border-t-transparent rounded-full animate-spin" />
                      <span>Saving...</span>
                    </>
                  ) : (
                    <span>Save Draft</span>
                  )}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
