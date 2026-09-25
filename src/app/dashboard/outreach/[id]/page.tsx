'use client';

import { useEffect, useState, use, useRef } from 'react';
import { useSearchParams } from 'next/navigation';
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
  const searchParams = useSearchParams();
  const autoSourceTriggered = useRef(false);

  const [campaign, setCampaign] = useState<CampaignDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [actionLoading, setActionLoading] = useState('');
  const [rowLoading, setRowLoading] = useState<Record<string, boolean>>({});
  const [exportingCsv, setExportingCsv] = useState(false);

  // Selection state for Checkboxes
  const [selectedIds, setSelectedIds] = useState<string[]>([]);

  // Pagination & Filtering
  const [currentPage, setCurrentPage] = useState(1);
  const pageSize = 15;
  const [filterStatus, setFilterStatus] = useState('ALL');

  // Selected Lead for Sequential Draft Review Modal
  const [selectedLead, setSelectedLead] = useState<Lead | null>(null);
  const [editSubject, setEditSubject] = useState('');
  const [editBody, setEditBody] = useState('');
  const [editEmail, setEditEmail] = useState('');
  const [modalCustomPrompt, setModalCustomPrompt] = useState('');
  const [regeneratingDraft, setRegeneratingDraft] = useState(false);
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
  const [testTargetEmail, setTestTargetEmail] = useState('');
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
    fetchCampaign().then((loadedCampaign) => {
      const autoSource = searchParams?.get('autoSource');
      const limit = Number(searchParams?.get('limit')) || 10;
      if (autoSource === 'true' && !autoSourceTriggered.current && loadedCampaign?.leads?.length === 0) {
        autoSourceTriggered.current = true;
        handleSourceLeads(limit);
      }
    });
  }, [campaignId]);

  // Keyboard shortcut listener for Draft Review Modal
  useEffect(() => {
    function handleKeyDown(e: KeyboardEvent) {
      if (!selectedLead) return;
      if (e.key === 'Escape') {
        setSelectedLead(null);
      } else if (e.altKey && e.key === 'ArrowRight') {
        e.preventDefault();
        navigateDraftModal('next');
      } else if (e.altKey && e.key === 'ArrowLeft') {
        e.preventDefault();
        navigateDraftModal('prev');
      }
    }
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [selectedLead, campaign]);

  async function fetchCampaign(): Promise<CampaignDetail | null> {
    setLoading(true);
    setError('');
    try {
      const res = await fetch(`/api/outreach/campaigns/${campaignId}`);
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Failed to load campaign');
      setCampaign(data);
      return data;
    } catch (err: any) {
      setError(err.message || 'Connection error');
      return null;
    } finally {
      setLoading(false);
    }
  }

  // Selection Checkbox Helpers
  function toggleSelectAll(visibleLeads: Lead[]) {
    const visibleIds = visibleLeads.map((l) => l.id);
    const allSelected = visibleIds.every((id) => selectedIds.includes(id));
    if (allSelected) {
      setSelectedIds((prev) => prev.filter((id) => !visibleIds.includes(id)));
    } else {
      setSelectedIds((prev) => Array.from(new Set([...prev, ...visibleIds])));
    }
  }

  function toggleSelectLead(id: string) {
    setSelectedIds((prev) =>
      prev.includes(id) ? prev.filter((item) => item !== id) : [...prev, id]
    );
  }

  function clearSelection() {
    setSelectedIds([]);
  }

  // 1. Source More Leads
  async function handleSourceLeads(customLimit?: number | React.MouseEvent) {
    const limitNum = typeof customLimit === 'number' ? customLimit : 10;
    setActionLoading('scrape');
    try {
      const res = await fetch(`/api/outreach/campaigns/${campaignId}/scrape`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ limit: limitNum }),
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

  // 2. Step 1: Get Candidate Emails (Find Emails)
  async function handleFindEmails(targetLeadIds?: string[]) {
    const ids = targetLeadIds || (selectedIds.length > 0 ? selectedIds : undefined);
    if (targetLeadIds?.length === 1) {
      setRowLoading((prev) => ({ ...prev, [`${targetLeadIds[0]}-find`]: true }));
    } else {
      setActionLoading('find-emails');
    }
    try {
      const res = await fetch(`/api/outreach/campaigns/${campaignId}/find-emails`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(ids ? { leadIds: ids } : {}),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Failed to find candidate emails');
      toast.success(`Found candidate emails for ${data.emailsFound} leads! Ready to verify deliverability.`);
      await fetchCampaign();
    } catch (err: any) {
      toast.error(`Find email error: ${err.message}`);
    } finally {
      if (targetLeadIds?.length === 1) {
        setRowLoading((prev) => ({ ...prev, [`${targetLeadIds[0]}-find`]: false }));
      } else {
        setActionLoading('');
      }
    }
  }

  // 3. Step 2: Verify Emails Deliverability via Reoon
  async function handleVerifyEmails(targetLeadIds?: string[]) {
    const ids = targetLeadIds || (selectedIds.length > 0 ? selectedIds : undefined);
    if (targetLeadIds?.length === 1) {
      setRowLoading((prev) => ({ ...prev, [`${targetLeadIds[0]}-verify`]: true }));
    } else {
      setActionLoading('verify');
    }
    try {
      const res = await fetch(`/api/outreach/campaigns/${campaignId}/verify`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(ids ? { leadIds: ids } : {}),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Failed to verify emails');
      toast.success(`Verification complete: ${data.safeCount} safe mailboxes verified.`);
      await fetchCampaign();
    } catch (err: any) {
      toast.error(`Verification error: ${err.message}`);
    } finally {
      if (targetLeadIds?.length === 1) {
        setRowLoading((prev) => ({ ...prev, [`${targetLeadIds[0]}-verify`]: false }));
      } else {
        setActionLoading('');
      }
    }
  }

  // 4. Step 3: Generate AI Cold Email Drafts
  async function handleGenerateDrafts(targetLeadIds?: string[]) {
    const ids = targetLeadIds || (selectedIds.length > 0 ? selectedIds : undefined);
    if (targetLeadIds?.length === 1) {
      setRowLoading((prev) => ({ ...prev, [`${targetLeadIds[0]}-draft`]: true }));
    } else {
      setActionLoading('draft');
    }
    try {
      const res = await fetch(`/api/outreach/campaigns/${campaignId}/draft`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(ids ? { leadIds: ids } : {}),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Failed to generate drafts');
      toast.success(`JetDigitalPro AI Copywriting complete: ${data.draftsCreated} personalized drafts generated!`);
      await fetchCampaign();
    } catch (err: any) {
      toast.error(`Draft error: ${err.message}`);
    } finally {
      if (targetLeadIds?.length === 1) {
        setRowLoading((prev) => ({ ...prev, [`${targetLeadIds[0]}-draft`]: false }));
      } else {
        setActionLoading('');
      }
    }
  }

  // 5. Batch or Single Dispatch Emails
  function handleDispatchEmails(leadId?: string) {
    const isSingle = Boolean(leadId);
    const targetLead = isSingle ? campaign?.leads.find((l) => l.id === leadId) : null;
    const targetCount = isSingle ? 1 : selectedIds.length > 0 ? selectedIds.length : readyDrafts;
    const recipientInfo = targetLead ? `to "${targetLead.fullName}" (${targetLead.email})` : `to ${targetCount} selected prospects`;

    setConfirmDialog({
      isOpen: true,
      title: isSingle ? 'Dispatch Cold Email?' : `Dispatch ${targetCount} Cold Emails?`,
      message: `Are you ready to send outbound personalized emails ${recipientInfo}? Messages will be dispatched using your configured SMTP sender.`,
      confirmText: isSingle ? 'Send Email Now' : 'Dispatch Emails',
      variant: 'primary',
      onConfirm: async () => {
        setConfirmDialog((prev) => ({ ...prev, isLoading: true }));
        if (leadId) {
          setRowLoading((prev) => ({ ...prev, [`${leadId}-send`]: true }));
        } else {
          setActionLoading('dispatch');
        }
        try {
          const ids = leadId ? [leadId] : selectedIds.length > 0 ? selectedIds : undefined;
          const res = await fetch(`/api/outreach/campaigns/${campaignId}/dispatch`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(ids ? { leadIds: ids } : {}),
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

  // 6. Push to Kanban CRM (Selected or Single or All)
  function handlePushToCrm(targetLeadIds?: string[]) {
    const ids = targetLeadIds || (selectedIds.length > 0 ? selectedIds : undefined);
    const uncommittedLeads = (campaign?.leads || []).filter(
      (l) => l.status !== 'CONVERTED' && (!ids || ids.includes(l.id))
    );

    if (uncommittedLeads.length === 0) {
      toast.error('Selected leads are already converted to Kanban CRM.');
      return;
    }

    const title = uncommittedLeads.length === 1
      ? `Push "${uncommittedLeads[0].fullName}" to Kanban CRM?`
      : `Push ${uncommittedLeads.length} Leads to Kanban CRM?`;

    setConfirmDialog({
      isOpen: true,
      title,
      message: `This will convert ${uncommittedLeads.length} prospect(s) into cards on your Kanban CRM board under the "Leads" column for immediate follow-up.`,
      confirmText: `Push ${uncommittedLeads.length} Lead(s) to CRM`,
      variant: 'info',
      onConfirm: async () => {
        setConfirmDialog((prev) => ({ ...prev, isLoading: true }));
        if (targetLeadIds?.length === 1) {
          setRowLoading((prev) => ({ ...prev, [`${targetLeadIds[0]}-push`]: true }));
        } else {
          setActionLoading('push-crm');
        }
        try {
          const idsToPush = uncommittedLeads.map((l) => l.id);
          const res = await fetch('/api/outreach/leads/batch-push-crm', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ leadIds: idsToPush }),
          });
          const data = await res.json();
          if (!res.ok) throw new Error(data.error || 'Failed to push leads to CRM');

          const successCount = data.convertedCount ?? uncommittedLeads.length;
          toast.success(`Successfully pushed ${successCount} leads into Kanban CRM!`);
          clearSelection();
          await fetchCampaign();
        } catch (err: any) {
          toast.error(`Push to CRM failed: ${err.message}`);
        } finally {
          setConfirmDialog((prev) => ({ ...prev, isOpen: false, isLoading: false }));
          if (targetLeadIds?.length === 1) {
            setRowLoading((prev) => ({ ...prev, [`${targetLeadIds[0]}-push`]: false }));
          } else {
            setActionLoading('');
          }
        }
      },
    });
  }

  // 7. Export Campaign Leads to CSV
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

  // 8. Add Custom / Test Lead
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

  // 9. Direct Live Test Send
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

  // Sequential Draft Reviewer Modal Navigation
  function openDraftModal(lead: Lead) {
    setSelectedLead(lead);
    setEditSubject(lead.aiDraftSubject || '');
    setEditBody(lead.aiDraftBody || '');
    setEditEmail(lead.email || '');
    setModalCustomPrompt('');
  }

  function navigateDraftModal(direction: 'prev' | 'next') {
    if (!selectedLead || !campaign?.leads) return;
    const leadsList = filteredLeads;
    const currentIndex = leadsList.findIndex((l) => l.id === selectedLead.id);
    if (currentIndex === -1) return;

    const targetIndex = direction === 'prev' ? currentIndex - 1 : currentIndex + 1;
    if (targetIndex >= 0 && targetIndex < leadsList.length) {
      openDraftModal(leadsList[targetIndex]);
    }
  }

  async function handleRegenerateModalDraft() {
    if (!selectedLead) return;
    setRegeneratingDraft(true);
    try {
      const res = await fetch(`/api/outreach/campaigns/${campaignId}/draft`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          leadIds: [selectedLead.id],
          leadCustomPrompt: modalCustomPrompt.trim() || undefined,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Failed to regenerate draft');
      const updated = data.leads?.[0];
      if (updated) {
        setEditSubject(updated.aiDraftSubject || '');
        setEditBody(updated.aiDraftBody || '');
        setSelectedLead((prev) => (prev ? { ...prev, aiDraftSubject: updated.aiDraftSubject, aiDraftBody: updated.aiDraftBody, metadata: updated.metadata } : null));
      }
      toast.success('AI draft regenerated with custom context!');
      await fetchCampaign();
    } catch (err: any) {
      toast.error(`Regeneration error: ${err.message}`);
    } finally {
      setRegeneratingDraft(false);
    }
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
      toast.success('Draft details saved successfully.');
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
      await fetch(`/api/outreach/leads/${selectedLead.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          aiDraftSubject: editSubject.trim(),
          aiDraftBody: editBody.trim(),
          email: editEmail.trim() || undefined,
        }),
      });

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
  const leadsWithEmail = allLeads.filter((l) => Boolean(l.email)).length;
  const missingEmailCount = allLeads.length - leadsWithEmail;
  const safeLeads = allLeads.filter((l) => l.verifyStatus === 'SAFE').length;
  const readyDrafts = allLeads.filter((l) => Boolean(l.aiDraftSubject) && Boolean(l.aiDraftBody)).length;
  const dispatchedLeads = allLeads.filter((l) => l.status === 'DISPATCHED' || l.status === 'CONVERTED').length;
  const convertedLeads = allLeads.filter((l) => l.status === 'CONVERTED').length;

  const filteredLeads = allLeads.filter((l) => {
    if (filterStatus === 'MISSING_EMAIL') return !l.email;
    if (filterStatus === 'SAFE') return l.verifyStatus === 'SAFE';
    if (filterStatus === 'DRAFT_READY') return Boolean(l.aiDraftSubject);
    if (filterStatus === 'DISPATCHED') return l.status === 'DISPATCHED' || l.status === 'CONVERTED';
    return true;
  });

  const totalPages = Math.ceil(filteredLeads.length / pageSize) || 1;
  const paginatedLeads = filteredLeads.slice((currentPage - 1) * pageSize, currentPage * pageSize);

  const isAllSelected = paginatedLeads.length > 0 && paginatedLeads.every((l) => selectedIds.includes(l.id));

  // Determine current active wizard step
  let currentStepNumber = 1;
  let nextActionPrompt = 'Sourced leads ready. Click "Get Emails" to discover corporate addresses.';
  let nextActionLabel = 'Get Candidate Emails';
  let nextActionHandler: () => void | Promise<void> = async () => { await handleFindEmails(); };
  let nextActionColor = 'bg-indigo-600 hover:bg-indigo-700';

  if (allLeads.length === 0) {
    currentStepNumber = 1;
    nextActionPrompt = 'Start by sourcing targeted leads from LinkedIn / Apify.';
    nextActionLabel = 'Source Leads via Apify';
    nextActionHandler = async () => { await handleSourceLeads(); };
    nextActionColor = 'bg-blue-600 hover:bg-blue-700';
  } else if (missingEmailCount > 0 && leadsWithEmail === 0) {
    currentStepNumber = 2;
    nextActionPrompt = `Step 2: ${missingEmailCount} leads need email discovery. Click to extract business emails.`;
    nextActionLabel = `Get Candidate Emails (${missingEmailCount})`;
    nextActionHandler = async () => { await handleFindEmails(); };
    nextActionColor = 'bg-indigo-600 hover:bg-indigo-700';
  } else if (leadsWithEmail > 0 && safeLeads === 0) {
    currentStepNumber = 3;
    nextActionPrompt = `Step 3: ${leadsWithEmail} emails discovered. Verify deliverability to prevent bounces.`;
    nextActionLabel = `Verify Deliverability (${leadsWithEmail})`;
    nextActionHandler = async () => { await handleVerifyEmails(); };
    nextActionColor = 'bg-emerald-600 hover:bg-emerald-700';
  } else if (safeLeads > 0 && readyDrafts < safeLeads) {
    currentStepNumber = 4;
    nextActionPrompt = `Step 4: ${safeLeads} safe inboxes verified. Generate personalized AI cold copy.`;
    nextActionLabel = `Generate AI Drafts (${safeLeads - readyDrafts} remaining)`;
    nextActionHandler = async () => { await handleGenerateDrafts(); };
    nextActionColor = 'bg-purple-600 hover:bg-purple-700';
  } else if (readyDrafts > 0 && convertedLeads < readyDrafts) {
    currentStepNumber = 5;
    nextActionPrompt = `Step 5: ${readyDrafts} AI drafts ready! Push to Kanban CRM for pipeline tracking or send live.`;
    nextActionLabel = `Push ${readyDrafts - convertedLeads} Leads to CRM`;
    nextActionHandler = () => { handlePushToCrm(); };
    nextActionColor = 'bg-amber-500 hover:bg-amber-600 text-slate-950';
  } else if (convertedLeads > 0 && convertedLeads === allLeads.length) {
    currentStepNumber = 5;
    nextActionPrompt = 'Pipeline fully executed! All leads are active in Kanban CRM.';
    nextActionLabel = 'View Kanban CRM Board';
    nextActionHandler = () => { window.location.assign('/dashboard'); };
    nextActionColor = 'bg-emerald-600 hover:bg-emerald-700';
  }

  // Selected lead index for modal navigation
  const currentModalIndex = selectedLead ? filteredLeads.findIndex((l) => l.id === selectedLead.id) : -1;

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

      {/* Top Header */}
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
              <span className="font-semibold text-slate-700">{campaign.account?.senderEmail || 'Default JetDigitalPro Mailer'}</span>
            </p>
          </div>

          {/* Quick Utility Tools */}
          <div className="flex flex-wrap items-center gap-2">
            <button
              onClick={() => setIsTestSendOpen(true)}
              className="px-3 py-2 bg-amber-50 hover:bg-amber-100 text-amber-900 border border-amber-300 text-xs font-bold rounded-xl transition-colors flex items-center gap-1.5 shadow-2xs"
              title="Kirim email percobaan langsung ke inbox pribadi Anda"
            >
              <span>⚡</span>
              <span>Test Send to My Email</span>
            </button>
            <button
              onClick={() => setIsAddLeadOpen(true)}
              className="px-3 py-2 bg-emerald-50 hover:bg-emerald-100 text-emerald-800 border border-emerald-300 text-xs font-bold rounded-xl transition-colors flex items-center gap-1.5 shadow-2xs"
            >
              <span>➕</span>
              <span>Add Custom Lead</span>
            </button>
            <button
              onClick={handleSourceLeads}
              disabled={Boolean(actionLoading) || loading}
              className="px-3 py-2 bg-slate-100 hover:bg-slate-200 text-slate-800 text-xs font-semibold rounded-xl transition-colors disabled:opacity-50 flex items-center gap-1.5"
            >
              {actionLoading === 'scrape' ? (
                <>
                  <span className="w-3.5 h-3.5 border-2 border-slate-800 border-t-transparent rounded-full animate-spin" />
                  <span>Sourcing Apify...</span>
                </>
              ) : (
                <>
                  <span>🔍</span>
                  <span>Source More Leads</span>
                </>
              )}
            </button>
            <button
              onClick={handleExportCsv}
              disabled={exportingCsv || Boolean(actionLoading) || loading}
              className="px-3 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs font-semibold rounded-xl transition-colors flex items-center gap-1.5 disabled:opacity-50"
            >
              <span>📊</span>
              <span>Export CSV</span>
            </button>
          </div>
        </div>
      </div>

      {/* Guided 5-Step Outreach Funnel Wizard */}
      <div className="bg-gradient-to-r from-slate-900 via-indigo-950 to-slate-900 p-5 sm:p-6 rounded-2xl text-white shadow-lg space-y-5 border border-slate-800">
        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4 border-b border-slate-800 pb-4">
          <div>
            <div className="flex items-center gap-2">
              <span className="text-xl">⚡</span>
              <h2 className="text-base font-bold tracking-tight">Outreach Pipeline Flow</h2>
              <span className="text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded-full bg-indigo-500/20 text-indigo-300 border border-indigo-500/30">
                Step {currentStepNumber} of 5
              </span>
            </div>
            <p className="text-xs text-slate-300 mt-1">
              {nextActionPrompt}
            </p>
          </div>

          <div className="flex items-center gap-2">
            <button
              onClick={nextActionHandler}
              disabled={Boolean(actionLoading) || loading}
              className={`px-4 py-2 text-xs font-bold rounded-xl transition-all shadow-md flex items-center gap-2 disabled:opacity-50 ${nextActionColor}`}
            >
              {actionLoading ? (
                <>
                  <span className="w-3.5 h-3.5 border-2 border-current border-t-transparent rounded-full animate-spin" />
                  <span>Processing...</span>
                </>
              ) : (
                <>
                  <span>▶</span>
                  <span>{nextActionLabel}</span>
                </>
              )}
            </button>
          </div>
        </div>

        {/* Step Progression Grid */}
        <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
          {/* Step 1: Leads Sourced */}
          <div className={`p-3.5 rounded-xl border transition-all ${currentStepNumber === 1 ? 'bg-white/15 border-amber-400 ring-2 ring-amber-400/30' : allLeads.length > 0 ? 'bg-emerald-950/30 border-emerald-500/30' : 'bg-white/5 border-white/10'}`}>
            <div className="flex items-center justify-between">
              <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">Step 1</span>
              {allLeads.length > 0 ? (
                <span className="text-emerald-400 text-xs font-bold bg-emerald-500/20 px-1.5 py-0.5 rounded-md">✓ Done</span>
              ) : (
                <span className="text-slate-500 text-[10px]">Pending</span>
              )}
            </div>
            <p className="text-xs font-semibold text-slate-200 mt-1">Leads Sourced</p>
            <p className="text-lg font-bold text-blue-400 mt-0.5">{allLeads.length}</p>
          </div>

          {/* Step 2: Get Emails */}
          <div className={`p-3.5 rounded-xl border transition-all ${currentStepNumber === 2 ? 'bg-white/15 border-amber-400 ring-2 ring-amber-400/30' : leadsWithEmail > 0 ? 'bg-emerald-950/30 border-emerald-500/30' : 'bg-white/5 border-white/10'} flex flex-col justify-between`}>
            <div>
              <div className="flex items-center justify-between">
                <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">Step 2</span>
                {leadsWithEmail > 0 ? (
                  <span className="text-emerald-400 text-xs font-bold bg-emerald-500/20 px-1.5 py-0.5 rounded-md">✓ Done</span>
                ) : (
                  <span className="text-slate-500 text-[10px]">Pending</span>
                )}
              </div>
              <p className="text-xs font-semibold text-slate-200 mt-1">Candidate Emails</p>
              <p className="text-lg font-bold text-indigo-300 mt-0.5">{leadsWithEmail} <span className="text-xs font-normal text-slate-400">/ {allLeads.length}</span></p>
            </div>
            <button
              onClick={() => handleFindEmails()}
              disabled={Boolean(actionLoading) || allLeads.length === 0}
              className="mt-2 w-full py-1 bg-indigo-600/80 hover:bg-indigo-600 text-white text-[11px] font-semibold rounded-lg transition-colors flex items-center justify-center gap-1 disabled:opacity-30"
              title="Run pattern generator & domain lookup to find missing emails"
            >
              {actionLoading === 'find-emails' ? (
                <span className="w-3 h-3 border-2 border-white border-t-transparent rounded-full animate-spin" />
              ) : (
                <span>📬 Get Emails</span>
              )}
            </button>
          </div>

          {/* Step 3: Verify Emails */}
          <div className={`p-3.5 rounded-xl border transition-all ${currentStepNumber === 3 ? 'bg-white/15 border-amber-400 ring-2 ring-amber-400/30' : safeLeads > 0 ? 'bg-emerald-950/30 border-emerald-500/30' : 'bg-white/5 border-white/10'} flex flex-col justify-between`}>
            <div>
              <div className="flex items-center justify-between">
                <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">Step 3</span>
                {safeLeads > 0 ? (
                  <span className="text-emerald-400 text-xs font-bold bg-emerald-500/20 px-1.5 py-0.5 rounded-md">✓ Done</span>
                ) : (
                  <span className="text-slate-500 text-[10px]">Pending</span>
                )}
              </div>
              <p className="text-xs font-semibold text-slate-200 mt-1">Deliverability</p>
              <p className="text-lg font-bold text-emerald-400 mt-0.5">{safeLeads} <span className="text-xs font-normal text-emerald-300/70">Safe</span></p>
            </div>
            <button
              onClick={() => handleVerifyEmails()}
              disabled={Boolean(actionLoading) || leadsWithEmail === 0}
              className="mt-2 w-full py-1 bg-emerald-600/80 hover:bg-emerald-600 text-white text-[11px] font-semibold rounded-lg transition-colors flex items-center justify-center gap-1 disabled:opacity-30"
              title="Verify inbox existence via Reoon API"
            >
              {actionLoading === 'verify' ? (
                <span className="w-3 h-3 border-2 border-white border-t-transparent rounded-full animate-spin" />
              ) : (
                <span>🛡️ Verify</span>
              )}
            </button>
          </div>

          {/* Step 4: AI Drafts */}
          <div className={`p-3.5 rounded-xl border transition-all ${currentStepNumber === 4 ? 'bg-white/15 border-amber-400 ring-2 ring-amber-400/30' : readyDrafts > 0 ? 'bg-emerald-950/30 border-emerald-500/30' : 'bg-white/5 border-white/10'} flex flex-col justify-between`}>
            <div>
              <div className="flex items-center justify-between">
                <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">Step 4</span>
                {readyDrafts > 0 ? (
                  <span className="text-emerald-400 text-xs font-bold bg-emerald-500/20 px-1.5 py-0.5 rounded-md">✓ Done</span>
                ) : (
                  <span className="text-slate-500 text-[10px]">Pending</span>
                )}
              </div>
              <p className="text-xs font-semibold text-slate-200 mt-1">AI Pitch Copy</p>
              <p className="text-lg font-bold text-purple-400 mt-0.5">{readyDrafts} <span className="text-xs font-normal text-purple-300/70">Ready</span></p>
            </div>
            <button
              onClick={() => handleGenerateDrafts()}
              disabled={Boolean(actionLoading) || safeLeads === 0}
              className="mt-2 w-full py-1 bg-purple-600/80 hover:bg-purple-600 text-white text-[11px] font-semibold rounded-lg transition-colors flex items-center justify-center gap-1 disabled:opacity-30"
              title="Generate personalized cold pitches with JetDigitalPro AI"
            >
              {actionLoading === 'draft' ? (
                <span className="w-3 h-3 border-2 border-white border-t-transparent rounded-full animate-spin" />
              ) : (
                <span>🤖 AI Drafts</span>
              )}
            </button>
          </div>

          {/* Step 5: Push to CRM & Dispatch */}
          <div className={`p-3.5 rounded-xl border transition-all ${currentStepNumber === 5 ? 'bg-white/15 border-amber-400 ring-2 ring-amber-400/30' : convertedLeads > 0 ? 'bg-emerald-950/30 border-emerald-500/30' : 'bg-white/5 border-white/10'} col-span-2 md:col-span-1 flex flex-col justify-between`}>
            <div>
              <div className="flex items-center justify-between">
                <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">Step 5</span>
                {convertedLeads > 0 ? (
                  <span className="text-emerald-400 text-xs font-bold bg-emerald-500/20 px-1.5 py-0.5 rounded-md">✓ Done</span>
                ) : (
                  <span className="text-slate-500 text-[10px]">Pending</span>
                )}
              </div>
              <p className="text-xs font-semibold text-slate-200 mt-1">CRM / Dispatch</p>
              <p className="text-lg font-bold text-amber-400 mt-0.5">{convertedLeads} <span className="text-xs font-normal text-amber-300/70">in CRM</span></p>
            </div>
            <button
              onClick={() => handlePushToCrm()}
              disabled={Boolean(actionLoading) || allLeads.length === 0}
              className="mt-2 w-full py-1 bg-amber-500 hover:bg-amber-400 text-slate-950 text-[11px] font-bold rounded-lg transition-colors flex items-center justify-center gap-1 disabled:opacity-30"
              title="Bridge verified leads into Kanban CRM pipeline board"
            >
              {actionLoading === 'push-crm' ? (
                <span className="w-3 h-3 border-2 border-slate-900 border-t-transparent rounded-full animate-spin" />
              ) : (
                <span>📋 Push CRM</span>
              )}
            </button>
          </div>
        </div>
      </div>

      {/* Floating Selection Bar */}
      {selectedIds.length > 0 && (
        <div className="bg-primary-900 text-white p-3.5 rounded-2xl flex flex-wrap items-center justify-between gap-3 shadow-lg border border-primary-700 animate-in fade-in slide-in-from-top-2">
          <div className="flex items-center gap-2">
            <span className="bg-primary-700 px-2 py-0.5 rounded-md font-bold text-xs">
              {selectedIds.length} Selected
            </span>
            <span className="text-xs text-primary-100">
              Apply actions specifically to checked leads:
            </span>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <button
              onClick={() => handleFindEmails(selectedIds)}
              disabled={Boolean(actionLoading)}
              className="px-3 py-1.5 bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-bold rounded-xl transition-colors flex items-center gap-1"
            >
              <span>📬 Get Emails ({selectedIds.length})</span>
            </button>
            <button
              onClick={() => handleVerifyEmails(selectedIds)}
              disabled={Boolean(actionLoading)}
              className="px-3 py-1.5 bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-bold rounded-xl transition-colors flex items-center gap-1"
            >
              <span>🛡️ Verify ({selectedIds.length})</span>
            </button>
            <button
              onClick={() => handleGenerateDrafts(selectedIds)}
              disabled={Boolean(actionLoading)}
              className="px-3 py-1.5 bg-purple-600 hover:bg-purple-500 text-white text-xs font-bold rounded-xl transition-colors flex items-center gap-1"
            >
              <span>🤖 AI Draft ({selectedIds.length})</span>
            </button>
            <button
              onClick={() => handlePushToCrm(selectedIds)}
              disabled={Boolean(actionLoading)}
              className="px-3 py-1.5 bg-amber-500 hover:bg-amber-400 text-slate-950 text-xs font-bold rounded-xl transition-colors flex items-center gap-1"
            >
              <span>📋 Push to CRM ({selectedIds.length})</span>
            </button>
            <button
              onClick={clearSelection}
              className="px-2.5 py-1.5 bg-white/10 hover:bg-white/20 text-white text-xs font-semibold rounded-xl transition-colors"
            >
              ✕ Deselect All
            </button>
          </div>
        </div>
      )}

      {/* Lead Staging Table */}
      <div className="bg-white rounded-2xl border border-slate-200/80 shadow-xs overflow-hidden">
        <div className="p-4 border-b border-slate-100 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div>
            <h2 className="text-sm font-bold text-slate-900">Lead Staging & Deliverability Matrix</h2>
            <p className="text-[11px] text-slate-400 mt-0.5">
              Select leads to perform bulk email finding, verification, AI drafting, or push into Kanban CRM.
            </p>
          </div>

          <div className="flex items-center gap-2">
            {/* Filter Tabs */}
            <select
              value={filterStatus}
              onChange={(e) => { setFilterStatus(e.target.value); setCurrentPage(1); }}
              className="px-3 py-1.5 border border-slate-300 rounded-xl text-xs font-semibold text-slate-700 bg-white"
            >
              <option value="ALL">All Leads ({allLeads.length})</option>
              <option value="MISSING_EMAIL">Missing Email ({missingEmailCount})</option>
              <option value="SAFE">Verified Safe ({safeLeads})</option>
              <option value="DRAFT_READY">AI Drafts Ready ({readyDrafts})</option>
              <option value="DISPATCHED">Dispatched / Sent ({dispatchedLeads})</option>
            </select>

            <button
              onClick={fetchCampaign}
              disabled={loading}
              className="text-xs text-slate-500 hover:text-slate-800 transition-colors flex items-center gap-1.5 px-3 py-1.5 bg-slate-100 rounded-xl"
            >
              <span className={loading ? 'animate-spin' : ''}>🔄</span>
              <span>{loading ? 'Refreshing...' : 'Refresh'}</span>
            </button>
          </div>
        </div>

        {allLeads.length === 0 ? (
          <div className="p-12 text-center text-xs text-slate-400 space-y-2">
            <p>No leads sourced yet for this campaign.</p>
            <button
              onClick={handleSourceLeads}
              className="px-4 py-2 bg-primary-600 text-white font-bold rounded-xl text-xs"
            >
              Source Leads with Apify Now →
            </button>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs text-slate-600">
              <thead className="bg-slate-50/80 text-[11px] font-bold text-slate-400 uppercase tracking-wider border-b border-slate-100">
                <tr>
                  <th className="px-3 py-3 w-8 text-center">
                    <input
                      type="checkbox"
                      checked={isAllSelected}
                      onChange={() => toggleSelectAll(paginatedLeads)}
                      className="rounded border-slate-300 text-primary-600 focus:ring-primary-500 w-4 h-4 cursor-pointer"
                      title="Select / Deselect All on this page"
                    />
                  </th>
                  <th className="px-4 py-3">Prospect & Organization</th>
                  <th className="px-4 py-3">Email Address</th>
                  <th className="px-4 py-3 text-center">Deliverability</th>
                  <th className="px-4 py-3">AI Pitch Draft (JetDigitalPro)</th>
                  <th className="px-4 py-3 text-right">Quick Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {paginatedLeads.map((lead) => {
                  const isChecked = selectedIds.includes(lead.id);
                  const isSafe = lead.verifyStatus === 'SAFE';
                  const isRisky = lead.verifyStatus === 'RISKY';
                  const isInvalid = lead.verifyStatus === 'INVALID';
                  const isFinding = rowLoading[`${lead.id}-find`];
                  const isVerifying = rowLoading[`${lead.id}-verify`];
                  const isDrafting = rowLoading[`${lead.id}-draft`];
                  const isSending = rowLoading[`${lead.id}-send`];
                  const isPushing = rowLoading[`${lead.id}-push`];

                  return (
                    <tr
                      key={lead.id}
                      className={`transition-colors ${
                        isChecked ? 'bg-primary-50/40' : 'hover:bg-slate-50/60'
                      }`}
                    >
                      {/* Checkbox */}
                      <td className="px-3 py-3.5 text-center">
                        <input
                          type="checkbox"
                          checked={isChecked}
                          onChange={() => toggleSelectLead(lead.id)}
                          className="rounded border-slate-300 text-primary-600 focus:ring-primary-500 w-4 h-4 cursor-pointer"
                        />
                      </td>

                      {/* Name & Company */}
                      <td className="px-4 py-3.5">
                        <div className="font-bold text-slate-900 flex items-center gap-1.5">
                          <span>{lead.fullName}</span>
                          {lead.linkedinUrl && (
                            <a
                              href={lead.linkedinUrl}
                              target="_blank"
                              rel="noreferrer"
                              className="text-blue-500 hover:text-blue-700 text-[11px]"
                              title="Open Real LinkedIn Profile"
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
                              title="Edit Target Email"
                            >
                              ✏️
                            </button>
                          </div>
                        ) : (
                          <button
                            onClick={() => handleFindEmails([lead.id])}
                            disabled={isFinding}
                            className="px-2 py-0.5 bg-indigo-50 hover:bg-indigo-100 text-indigo-700 border border-indigo-200 text-[10px] font-bold rounded-md transition-colors"
                          >
                            {isFinding ? 'Finding...' : '+ Get Email'}
                          </button>
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
                        {(isInvalid || lead.verifyStatus === 'DISPOSABLE') && (
                          <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-bold bg-red-100 text-red-800">
                            🔴 {lead.verifyStatus === 'DISPOSABLE' ? 'Disposable' : 'Invalid'}
                          </span>
                        )}
                        {!isSafe && !isRisky && !isInvalid && lead.verifyStatus !== 'DISPOSABLE' && (
                          <button
                            onClick={() => handleVerifyEmails([lead.id])}
                            disabled={isVerifying || !lead.email}
                            className="inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-bold bg-slate-100 hover:bg-slate-200 text-slate-600 transition-colors"
                          >
                            {isVerifying ? 'Checking...' : '⚪ Verify'}
                          </button>
                        )}
                      </td>

                      {/* AI Draft Preview */}
                      <td className="px-4 py-3.5 max-w-xs">
                        {lead.aiDraftSubject ? (
                          <button
                            onClick={() => openDraftModal(lead)}
                            className="p-2 bg-purple-50/60 hover:bg-purple-100/70 border border-purple-200/80 rounded-xl text-left block w-full transition-all group"
                          >
                            <div className="flex items-center justify-between gap-1 mb-0.5">
                              <span className="text-[10px] font-bold text-purple-700 bg-purple-100 px-1.5 py-0.2 rounded">
                                📝 JetDigital AI Draft
                              </span>
                              <span className="text-[10px] text-purple-600 group-hover:underline font-semibold">
                                Review →
                              </span>
                            </div>
                            <p className="font-semibold text-slate-900 truncate text-[11px]">
                              {lead.aiDraftSubject}
                            </p>
                            <p className="text-[10px] text-slate-500 truncate mt-0.5">
                              {lead.aiDraftBody?.slice(0, 70)}...
                            </p>
                          </button>
                        ) : (
                          <button
                            onClick={() => handleGenerateDrafts([lead.id])}
                            disabled={isDrafting}
                            className="px-2.5 py-1 bg-slate-100 hover:bg-purple-50 hover:text-purple-700 text-slate-600 text-[10px] font-bold rounded-lg transition-colors border border-slate-200"
                          >
                            {isDrafting ? 'Writing AI...' : '🤖 Generate AI Copy'}
                          </button>
                        )}
                      </td>

                      {/* Actions */}
                      <td className="px-4 py-3.5 text-right space-x-1.5 whitespace-nowrap">
                        {lead.aiDraftSubject && (
                          <button
                            onClick={() => openDraftModal(lead)}
                            className="px-2.5 py-1 bg-slate-100 hover:bg-slate-200 text-slate-800 text-[11px] font-bold rounded-lg transition-colors"
                          >
                            Review
                          </button>
                        )}
                        {lead.status === 'CONVERTED' ? (
                          <span className="px-2.5 py-1 bg-emerald-50 text-emerald-700 border border-emerald-200 text-[11px] font-bold rounded-lg">
                            ✓ In CRM
                          </span>
                        ) : (
                          <button
                            onClick={() => handlePushToCrm([lead.id])}
                            disabled={isPushing}
                            className="px-2.5 py-1 bg-indigo-50 hover:bg-indigo-100 text-indigo-700 border border-indigo-200 text-[11px] font-bold rounded-lg transition-colors disabled:opacity-50"
                            title="Convert immediately to Kanban CRM Lead Card"
                          >
                            {isPushing ? 'Pushing...' : '+ Push to CRM'}
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
              Page {currentPage} of {totalPages} ({filteredLeads.length} leads total)
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

      {/* Sequential AI Draft Review & Edit Modal (Side-by-Side Split View) */}
      {selectedLead && (
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-4 z-50 animate-in fade-in">
          <div className="bg-white rounded-2xl max-w-4xl w-full p-5 sm:p-6 shadow-2xl border border-slate-200 space-y-4 max-h-[92vh] overflow-y-auto">
            {/* Modal Header with Sequential Lead Navigator */}
            <div className="flex items-center justify-between border-b border-slate-100 pb-3">
              <div className="flex items-center gap-2.5">
                <div className="w-8 h-8 rounded-xl bg-purple-100 text-purple-700 flex items-center justify-center font-bold text-sm">
                  🤖
                </div>
                <div>
                  <div className="flex items-center gap-2">
                    <h3 className="text-sm font-bold text-slate-900">JetDigitalPro AI Draft Reviewer</h3>
                    {currentModalIndex !== -1 && (
                      <span className="text-[10px] font-bold bg-purple-50 text-purple-700 border border-purple-200/70 px-2 py-0.5 rounded-full">
                        Lead {currentModalIndex + 1} of {filteredLeads.length}
                      </span>
                    )}
                  </div>
                  <p className="text-xs text-slate-500">
                    Review and tailor AI personalized pitch for <span className="font-semibold text-slate-800">{selectedLead.fullName}</span>
                  </p>
                </div>
              </div>

              {/* Prev / Next Lead Quick Navigation & Shortcuts */}
              <div className="flex items-center gap-1.5">
                <button
                  type="button"
                  onClick={() => navigateDraftModal('prev')}
                  disabled={currentModalIndex <= 0}
                  className="px-2.5 py-1.5 bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs font-semibold rounded-lg disabled:opacity-30 transition-colors flex items-center gap-1"
                  title="Previous Lead (Alt + ←)"
                >
                  <span>←</span>
                  <span className="hidden sm:inline">Prev</span>
                </button>
                <button
                  type="button"
                  onClick={() => navigateDraftModal('next')}
                  disabled={currentModalIndex >= filteredLeads.length - 1}
                  className="px-2.5 py-1.5 bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs font-semibold rounded-lg disabled:opacity-30 transition-colors flex items-center gap-1"
                  title="Next Lead (Alt + →)"
                >
                  <span className="hidden sm:inline">Next</span>
                  <span>→</span>
                </button>
                <button
                  onClick={() => setSelectedLead(null)}
                  className="text-slate-400 hover:text-slate-600 text-lg leading-none ml-2 px-1.5 py-1 rounded-lg hover:bg-slate-100"
                  title="Close (Esc)"
                >
                  ✕
                </button>
              </div>
            </div>

            {/* Side-by-Side Content Grid */}
            <div className="grid grid-cols-1 lg:grid-cols-12 gap-5 items-start">
              {/* Left Column (7 cols): Email Editor */}
              <div className="lg:col-span-7 space-y-3.5">
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">
                    Recipient Target Email
                  </label>
                  <input
                    type="email"
                    value={editEmail}
                    onChange={(e) => setEditEmail(e.target.value)}
                    placeholder="prospect@company.com"
                    className="w-full px-3 py-2 border border-slate-300 rounded-xl text-xs focus:outline-none focus:ring-2 focus:ring-primary-500 font-mono text-slate-800"
                  />
                </div>

                <div>
                  <div className="flex items-center justify-between mb-1">
                    <label className="block text-xs font-semibold text-slate-700">Subject Line</label>
                    {Boolean(selectedLead.metadata && (selectedLead.metadata as any).alternativeSubject) && (
                      <button
                        type="button"
                        onClick={() => setEditSubject((selectedLead.metadata as any).alternativeSubject)}
                        className="text-[10px] text-indigo-600 hover:text-indigo-800 font-semibold inline-flex items-center gap-1 bg-indigo-50 px-2 py-0.5 rounded-md border border-indigo-200"
                        title="Use AI alternative subject"
                      >
                        <span>💡</span>
                        <span>Switch to A/B Subject</span>
                      </button>
                    )}
                  </div>
                  <input
                    type="text"
                    value={editSubject}
                    onChange={(e) => setEditSubject(e.target.value)}
                    className="w-full px-3 py-2 border border-slate-300 rounded-xl text-xs focus:outline-none focus:ring-2 focus:ring-primary-500 font-semibold text-slate-800"
                  />
                </div>

                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">Email Pitch Body</label>
                  <textarea
                    rows={8}
                    value={editBody}
                    onChange={(e) => setEditBody(e.target.value)}
                    className="w-full px-3 py-2.5 border border-slate-300 rounded-xl text-xs focus:outline-none focus:ring-2 focus:ring-primary-500 text-slate-800 leading-relaxed font-sans"
                    placeholder="Enter pitch body..."
                  />
                </div>
              </div>

              {/* Right Column (5 cols): Context & AI Assistant */}
              <div className="lg:col-span-5 space-y-3">
                {/* Lead Profile Context Card */}
                <div className="p-3.5 bg-slate-50 rounded-xl border border-slate-200 space-y-2">
                  <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">Prospect Profile</span>
                  <div className="space-y-1">
                    <p className="text-xs font-bold text-slate-900">{selectedLead.fullName}</p>
                    <p className="text-xs text-slate-600">{selectedLead.jobTitle || 'No title'} @ <span className="font-semibold text-slate-800">{selectedLead.companyName || 'Unknown company'}</span></p>
                    {selectedLead.location && (
                      <p className="text-[11px] text-slate-500">📍 {selectedLead.location}</p>
                    )}
                  </div>

                  {/* Deliverability Badge */}
                  <div className="pt-2 border-t border-slate-200 flex items-center justify-between">
                    <span className="text-[11px] text-slate-500">Deliverability:</span>
                    {selectedLead.verifyStatus === 'SAFE' ? (
                      <span className="px-2 py-0.5 bg-emerald-100 text-emerald-800 font-bold text-[10px] rounded-full border border-emerald-300 flex items-center gap-1">
                        <span>🛡️</span>
                        <span>Safe (Score: {selectedLead.verifyScore ?? 100})</span>
                      </span>
                    ) : selectedLead.verifyStatus === 'INVALID' ? (
                      <span className="px-2 py-0.5 bg-rose-100 text-rose-800 font-bold text-[10px] rounded-full border border-rose-300">
                        ⚠️ Invalid / Risky
                      </span>
                    ) : (
                      <span className="px-2 py-0.5 bg-slate-200 text-slate-700 font-medium text-[10px] rounded-full">
                        Not Verified
                      </span>
                    )}
                  </div>
                </div>

                {/* AI Assistant Directives Card */}
                <div className="p-3.5 bg-purple-50/70 rounded-xl border border-purple-200/80 space-y-2.5">
                  <div className="flex items-center justify-between">
                    <label className="text-xs font-bold text-purple-900 flex items-center gap-1">
                      <span>✨</span>
                      <span>AI Directives</span>
                    </label>
                  </div>
                  <p className="text-[11px] text-purple-700 leading-snug">
                    Provide custom instructions to regenerate tailored copy for this lead.
                  </p>
                  <textarea
                    rows={3}
                    value={modalCustomPrompt}
                    onChange={(e) => setModalCustomPrompt(e.target.value)}
                    placeholder="e.g. Keep under 75 words, emphasize ROI and security, informal tone."
                    className="w-full px-3 py-1.5 border border-purple-200 bg-white rounded-lg text-xs text-slate-800 focus:outline-none focus:ring-2 focus:ring-purple-500"
                  />
                  <button
                    type="button"
                    onClick={handleRegenerateModalDraft}
                    disabled={regeneratingDraft}
                    className="w-full py-1.5 bg-purple-600 hover:bg-purple-700 text-white text-xs font-bold rounded-lg transition-colors flex items-center justify-center gap-1.5 shadow-xs disabled:opacity-50"
                  >
                    {regeneratingDraft ? (
                      <>
                        <span className="w-3.5 h-3.5 border-2 border-white border-t-transparent rounded-full animate-spin" />
                        <span>Regenerating AI Copy...</span>
                      </>
                    ) : (
                      <>
                        <span>⚡</span>
                        <span>Regenerate AI Copy</span>
                      </>
                    )}
                  </button>
                </div>

                <p className="text-[10px] text-slate-400 text-center italic">
                  Keyboard: Esc to close | Alt + ← / → to browse
                </p>
              </div>
            </div>

            {/* Clean Unified Action Footer */}
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pt-4 border-t border-slate-100">
              {/* Push / Approve to CRM Action */}
              <div>
                {selectedLead.status === 'CONVERTED' ? (
                  <span className="px-3 py-1.5 bg-emerald-50 text-emerald-800 border border-emerald-200 text-xs font-bold rounded-xl inline-flex items-center gap-1">
                    <span>✓</span> Converted in Kanban CRM
                  </span>
                ) : (
                  <button
                    type="button"
                    onClick={async () => {
                      setPushingToCrmModal(true);
                      try {
                        await fetch(`/api/outreach/leads/${selectedLead.id}`, {
                          method: 'PATCH',
                          headers: { 'Content-Type': 'application/json' },
                          body: JSON.stringify({
                            aiDraftSubject: editSubject.trim(),
                            aiDraftBody: editBody.trim(),
                            email: editEmail.trim() || undefined,
                          }),
                        });
                        await handlePushToCrm([selectedLead.id]);
                        setSelectedLead(null);
                      } finally {
                        setPushingToCrmModal(false);
                      }
                    }}
                    disabled={pushingToCrmModal}
                    className="px-4 py-2 bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-bold rounded-xl transition-all inline-flex items-center gap-1.5 shadow-xs"
                    title="Approve edited draft and convert directly to Kanban CRM lead card"
                  >
                    <span>✓</span>
                    <span>{pushingToCrmModal ? 'Approving & Pushing...' : 'Approve Draft & Push to CRM'}</span>
                  </button>
                )}
              </div>

              {/* Actions Right */}
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={sendSingleTestNow}
                  disabled={sendingSingleTest || savingDraft}
                  className="px-3.5 py-2 bg-amber-50 border border-amber-300 text-amber-900 hover:bg-amber-100 text-xs font-bold rounded-xl transition-colors inline-flex items-center gap-1.5"
                  title="Dispatch email now directly to recipient"
                >
                  {sendingSingleTest ? (
                    <span>Sending...</span>
                  ) : (
                    <span>🚀 Send Live</span>
                  )}
                </button>
                <button
                  type="button"
                  disabled={savingDraft || sendingSingleTest}
                  onClick={saveEditedDraft}
                  className="px-4 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold text-xs rounded-xl transition-colors"
                >
                  {savingDraft ? 'Saving...' : 'Save Draft Only'}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Add Custom Lead Modal */}
      {isAddLeadOpen && (
        <div className="fixed inset-0 bg-slate-900/50 backdrop-blur-xs flex items-center justify-center p-4 z-50">
          <div className="bg-white rounded-2xl max-w-md w-full p-6 shadow-xl border border-slate-200 space-y-4">
            <div className="flex items-center justify-between border-b border-slate-100 pb-3">
              <div>
                <h3 className="text-sm font-bold text-slate-900">Add Custom Prospect</h3>
                <p className="text-xs text-slate-500">Add a specific lead for deliverability check & AI drafting.</p>
              </div>
              <button onClick={() => setIsAddLeadOpen(false)} className="text-slate-400 hover:text-slate-600">
                ✕
              </button>
            </div>

            <form onSubmit={handleAddCustomLead} className="space-y-3">
              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">Target Email *</label>
                <input
                  type="email"
                  required
                  value={customEmail}
                  onChange={(e) => setCustomEmail(e.target.value)}
                  placeholder="e.g. prospect@company.com"
                  className="w-full px-3 py-2 border border-slate-300 rounded-xl text-xs focus:ring-2 focus:ring-primary-500 font-mono text-slate-800"
                />
              </div>
              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">Full Name *</label>
                <input
                  type="text"
                  required
                  value={customName}
                  onChange={(e) => setCustomName(e.target.value)}
                  placeholder="e.g. John Doe"
                  className="w-full px-3 py-2 border border-slate-300 rounded-xl text-xs focus:ring-2 focus:ring-primary-500 text-slate-800"
                />
              </div>
              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">Company</label>
                  <input
                    type="text"
                    value={customCompany}
                    onChange={(e) => setCustomCompany(e.target.value)}
                    placeholder="e.g. Acme Corp"
                    className="w-full px-3 py-2 border border-slate-300 rounded-xl text-xs focus:ring-2 focus:ring-primary-500 text-slate-800"
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">Job Role</label>
                  <input
                    type="text"
                    value={customRole}
                    onChange={(e) => setCustomRole(e.target.value)}
                    placeholder="e.g. VP Engineering"
                    className="w-full px-3 py-2 border border-slate-300 rounded-xl text-xs focus:ring-2 focus:ring-primary-500 text-slate-800"
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
                  className="px-4 py-1.5 bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-bold rounded-lg shadow-xs disabled:opacity-50"
                >
                  {addingCustomLead ? 'Adding...' : 'Add Lead & Create AI Draft'}
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
                  <p className="text-xs text-slate-500">Send an immediate live test email to your personal inbox.</p>
                </div>
              </div>
              <button onClick={() => setIsTestSendOpen(false)} className="text-slate-400 hover:text-slate-600">
                ✕
              </button>
            </div>

            <form onSubmit={handleSendDirectTest} className="space-y-3">
              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">Target Recipient Email *</label>
                <input
                  type="email"
                  required
                  value={testTargetEmail}
                  onChange={(e) => setTestTargetEmail(e.target.value)}
                  placeholder="e.g. yourname@gmail.com"
                  className="w-full px-3 py-2 border border-slate-300 rounded-xl text-xs focus:ring-2 focus:ring-primary-500 font-mono text-slate-800"
                />
              </div>
              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">Email Subject (Optional)</label>
                <input
                  type="text"
                  value={testSubject}
                  onChange={(e) => setTestSubject(e.target.value)}
                  placeholder="Leave empty for auto-generated AI subject"
                  className="w-full px-3 py-2 border border-slate-300 rounded-xl text-xs focus:ring-2 focus:ring-primary-500 text-slate-800"
                />
              </div>
              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">Email Body Content (Optional)</label>
                <textarea
                  rows={4}
                  value={testContent}
                  onChange={(e) => setTestContent(e.target.value)}
                  placeholder="Leave empty for auto-generated JetDigitalPro AI personalized cold outreach copy"
                  className="w-full px-3 py-2 border border-slate-300 rounded-xl text-xs focus:ring-2 focus:ring-primary-500 text-slate-800"
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
                  className="px-4 py-1.5 bg-amber-600 hover:bg-amber-700 text-white text-xs font-bold rounded-lg shadow-xs disabled:opacity-50"
                >
                  {sendingTestDirect ? 'Sending...' : '🚀 Send Test Email Now'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
