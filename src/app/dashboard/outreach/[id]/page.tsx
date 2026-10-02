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

const INDUSTRY_OPTIONS = [
  'Information Technology & Services',
  'Computer Software / SaaS',
  'Financial Services & Fintech',
  'Healthcare & Medical',
  'E-Commerce & Retail',
  'Marketing & Advertising',
  'Real Estate & Construction',
  'Manufacturing & Logistics',
  'Education Management',
  'Hospitality & Tourism',
  'Legal & Consulting',
  'All Industries (Broad)',
];

interface CampaignDetail {
  id: string;
  name: string;
  targetRole?: string;
  targetLocation?: string;
  targetIndustry?: string;
  searchQuery?: string;
  promptInstructions?: string;
  status: string;
  accountId?: string;
  createdAt: string;
  account?: {
    id?: string;
    senderEmail: string;
    senderName: string;
    smtpUser?: string;
  };
  leads: Lead[];
}

interface BoardOption {
  id: string;
  title: string;
  columns: { id: string; title: string; position: number }[];
}

function isValidWebsiteDomain(domain?: string | null): boolean {
  if (!domain || typeof domain !== 'string') return false;
  const clean = domain.replace(/^https?:\/\//i, '').replace(/\/.*$/, '').replace(/^www\./i, '').toLowerCase().trim();
  if (!clean || !clean.includes('.') || clean.length < 4 || clean.endsWith('.local')) return false;

  const blocked = [
    'facebook.com',
    'instagram.com',
    'twitter.com',
    'x.com',
    'linkedin.com',
    'youtube.com',
    'google.com',
    'maps.google.com',
    'wa.me',
    'whatsapp.com',
    'linktr.ee',
    't.me',
    'tiktok.com',
    'pinterest.com',
    'bit.ly',
    'none',
    'n/a',
  ];

  return !blocked.some((b) => clean === b || clean.endsWith(`.${b}`));
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
  const [sourceBatchSize, setSourceBatchSize] = useState(10);

  // Selection state for Checkboxes
  const [selectedIds, setSelectedIds] = useState<string[]>([]);

  // Pagination & Filtering
  const [currentPage, setCurrentPage] = useState(1);
  const pageSize = 15;
  const [filterStatus, setFilterStatus] = useState('ALL');

  // Push to CRM Modal State (with Board & Column selection)
  const [isPushCrmModalOpen, setIsPushCrmModalOpen] = useState(false);
  const [crmTargetLeadIds, setCrmTargetLeadIds] = useState<string[]>([]);
  const [boardsList, setBoardsList] = useState<BoardOption[]>([]);
  const [selectedBoardId, setSelectedBoardId] = useState('');
  const [selectedColumnId, setSelectedColumnId] = useState('');

  // Selected Lead for Sequential Draft Review Modal
  const [selectedLead, setSelectedLead] = useState<Lead | null>(null);
  const [editSubject, setEditSubject] = useState('');
  const [editBody, setEditBody] = useState('');
  const [editEmail, setEditEmail] = useState('');
  const [modalCustomPrompt, setModalCustomPrompt] = useState('');
  const [regeneratingDraft, setRegeneratingDraft] = useState(false);
  const [savingDraft, setSavingDraft] = useState(false);
  const [sendingSingleTest, setSendingSingleTest] = useState(false);

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

  // Campaign Settings Modal State
  const [isSettingsModalOpen, setIsSettingsModalOpen] = useState(false);
  const [settingsName, setSettingsName] = useState('');
  const [settingsStatus, setSettingsStatus] = useState('DRAFT');
  const [settingsAccountId, setSettingsAccountId] = useState('');
  const [settingsTargetRole, setSettingsTargetRole] = useState('');
  const [settingsTargetLocation, setSettingsTargetLocation] = useState('');
  const [settingsTargetIndustry, setSettingsTargetIndustry] = useState('');
  const [settingsSearchQuery, setSettingsSearchQuery] = useState('');
  const [settingsPromptInstructions, setSettingsPromptInstructions] = useState('');
  const [savingSettings, setSavingSettings] = useState(false);
  const [outreachAccounts, setOutreachAccounts] = useState<any[]>([]);

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
    fetch('/api/outreach/accounts')
      .then((r) => r.json())
      .then((data) => {
        const list = Array.isArray(data) ? data : data.accounts || [];
        setOutreachAccounts(list);
      })
      .catch((e) => console.error('Failed to load accounts:', e));
  }, []);

  useEffect(() => {
    fetchCampaign().then((loadedCampaign) => {
      const autoSource = searchParams?.get('autoSource');
      const limit = Number(searchParams?.get('limit')) || 10;
      const provider = searchParams?.get('provider') || undefined;
      if (autoSource === 'true' && !autoSourceTriggered.current && loadedCampaign?.leads?.length === 0) {
        autoSourceTriggered.current = true;
        handleSourceLeads(limit, provider);
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
      const res = await fetch(`/api/outreach/campaigns/${campaignId}`, {
        cache: 'no-store',
        headers: {
          'Cache-Control': 'no-cache, no-store, must-revalidate',
          Pragma: 'no-cache',
        },
      });
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
  async function handleSourceLeads(customLimit?: number, customProvider?: string) {
    setActionLoading('scrape');
    try {
      const provider = customProvider || searchParams?.get('provider') || 'outscraper';
      const res = await fetch(`/api/outreach/campaigns/${campaignId}/scrape`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ limit: customLimit || 10, provider }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Failed to source leads');
      if (data.queued) {
        toast.success(data.message || `Pencarian ${customLimit || 10} leads dijadwalkan di background worker.`);
      } else {
        toast.success(`Successfully sourced ${data.count} targeted prospects.`);
      }
      await fetchCampaign();
    } catch (err: any) {
      toast.error(`Discovery error: ${err.message}`);
    } finally {
      setActionLoading('');
    }
  }

  // 2. Step 2: Get Candidate Emails
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
      toast.success(`Discovered emails for ${data.emailsFound} leads.`);
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

  // 3. Step 3: Verify Deliverability
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
      if (data.queued) {
        toast.success(data.message || `Verifikasi ${data.totalProcessed || 'leads'} dijadwalkan di background worker.`);
      } else {
        const parts: string[] = [];
        if (data.safeCount) parts.push(`${data.safeCount} Safe 🟢`);
        if (data.riskyCount) parts.push(`${data.riskyCount} Catch-All 🟡`);
        if (data.invalidCount) parts.push(`${data.invalidCount} Invalid 🔴`);
        if (data.unverifiedCount) parts.push(`${data.unverifiedCount} Unverified ⚪`);
        const summary = parts.length > 0 ? parts.join(', ') : `${data.totalProcessed || 0} checked`;
        toast.success(`Verification complete: ${summary}`);
      }
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

  // 4. Step 4: Generate Personalized AI Pitches
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

  // 5. Open Push to Kanban CRM Modal (with Board & Column Selector)
  async function openPushCrmModal(targetLeadIds?: string[]) {
    const ids = targetLeadIds || (selectedIds.length > 0 ? selectedIds : undefined);
    const eligibleLeads = (campaign?.leads || []).filter(
      (l) => l.status !== 'CONVERTED' && (!ids || ids.includes(l.id)) && l.verifyStatus !== 'INVALID'
    );

    if (eligibleLeads.length === 0) {
      toast.error('No uncommitted valid leads available to push to CRM.');
      return;
    }

    setCrmTargetLeadIds(eligibleLeads.map((l) => l.id));

    // Fetch tenant boards
    try {
      const res = await fetch('/api/boards');
      if (res.ok) {
        const data = await res.json();
        const bList = Array.isArray(data) ? data : [];
        setBoardsList(bList);
        if (bList.length > 0) {
          setSelectedBoardId(bList[0].id);
          const cols = bList[0].columns || [];
          const leadsCol = cols.find((c: any) => c.title.toLowerCase() === 'leads') || cols[0];
          if (leadsCol) setSelectedColumnId(leadsCol.id);
        }
      }
    } catch (e) {
      console.error('Failed to load boards', e);
    }

    setIsPushCrmModalOpen(true);
  }

  function handleSelectBoard(boardId: string) {
    setSelectedBoardId(boardId);
    const b = boardsList.find((item) => item.id === boardId);
    if (b && b.columns?.length > 0) {
      const leadsCol = b.columns.find((c: any) => c.title.toLowerCase() === 'leads') || b.columns[0];
      setSelectedColumnId(leadsCol?.id || '');
    }
  }

  // Execute the Push to CRM
  async function executePushCrm() {
    if (crmTargetLeadIds.length === 0) return;
    setActionLoading('push-crm');
    try {
      const res = await fetch('/api/outreach/leads/batch-push-crm', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          leadIds: crmTargetLeadIds,
          boardId: selectedBoardId || undefined,
          columnId: selectedColumnId || undefined,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Failed to push leads to CRM');
      toast.success(`Successfully pushed ${data.convertedCount || crmTargetLeadIds.length} leads into Kanban CRM!`);
      clearSelection();
      setIsPushCrmModalOpen(false);
      await fetchCampaign();
    } catch (err: any) {
      toast.error(`Push to CRM failed: ${err.message}`);
    } finally {
      setActionLoading('');
    }
  }

  // 6. Export Campaign Leads to CSV / Excel-ready Spreadsheet
  async function handleExportCsv() {
    if (!campaign?.leads || campaign.leads.length === 0) return;
    setExportingCsv(true);
    try {
      const headers = [
        'Full Name',
        'Job Title',
        'Company',
        'Company Domain',
        'Email Address',
        'Deliverability Status',
        'Confidence Score',
        'Outreach Status',
        'AI Draft Subject',
        'AI Draft Body',
        'LinkedIn Profile URL',
        'Location',
        'Phone Number',
      ];

      const rows = campaign.leads.map((l) => [
        `"${(l.fullName || '').replace(/"/g, '""')}"`,
        `"${(l.jobTitle || '').replace(/"/g, '""')}"`,
        `"${(l.companyName || '').replace(/"/g, '""')}"`,
        `"${(l.companyDomain || '').replace(/"/g, '""')}"`,
        `"${(l.email || '').replace(/"/g, '""')}"`,
        `"${(l.verifyStatus || 'UNVERIFIED').replace(/"/g, '""')}"`,
        `"${l.verifyScore || 0}%"`,
        `"${(l.status || '').replace(/"/g, '""')}"`,
        `"${(l.aiDraftSubject || '').replace(/"/g, '""')}"`,
        `"${(l.aiDraftBody || '').replace(/\r?\n/g, ' ').replace(/"/g, '""')}"`,
        `"${(l.linkedinUrl || '').replace(/"/g, '""')}"`,
        `"${(l.location || '').replace(/"/g, '""')}"`,
        `"${((l.metadata as any)?.phone || '').replace(/"/g, '""')}"`,
      ]);

      // \uFEFF is the UTF-8 Byte Order Mark (BOM) so Microsoft Excel opens it cleanly with proper column separation and accents
      const csvContent = '\uFEFF' + [headers.join(','), ...rows.map((r) => r.join(','))].join('\r\n');
      const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
      const url = URL.createObjectURL(blob);

      const link = document.createElement('a');
      link.href = url;
      link.setAttribute('download', `${campaign.name.toLowerCase().replace(/[^a-z0-9]/g, '_')}_leads.csv`);
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      URL.revokeObjectURL(url);

      toast.success('Leads exported successfully (Excel UTF-8 Compatible)!');
    } finally {
      setExportingCsv(false);
    }
  }

  // 7. Add Custom Lead
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
          jobTitle: customRole.trim() || 'Executive',
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Failed to add lead');
      setIsAddLeadOpen(false);
      setCustomName('');
      setCustomEmail('');
      setCustomCompany('');
      setCustomRole('');
      toast.success(`Custom lead "${customName}" added!`);
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

  function openSettingsModal() {
    if (!campaign) return;
    setSettingsName(campaign.name || '');
    setSettingsStatus(campaign.status || 'DRAFT');
    setSettingsAccountId(campaign.accountId || (campaign.account as any)?.id || '');
    setSettingsTargetRole(campaign.targetRole || '');
    setSettingsTargetLocation(campaign.targetLocation || '');
    setSettingsTargetIndustry(campaign.targetIndustry || '');
    setSettingsSearchQuery(campaign.searchQuery || '');
    setSettingsPromptInstructions(campaign.promptInstructions || '');
    setIsSettingsModalOpen(true);
  }

  async function handleSaveSettings(e: React.FormEvent) {
    e.preventDefault();
    if (!settingsName.trim()) {
      toast.error('Campaign title cannot be empty');
      return;
    }
    setSavingSettings(true);
    try {
      const res = await fetch(`/api/outreach/campaigns/${campaignId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: settingsName.trim(),
          status: settingsStatus,
          accountId: settingsAccountId || null,
          targetRole: settingsTargetRole.trim() || undefined,
          targetLocation: settingsTargetLocation.trim() || undefined,
          targetIndustry: settingsTargetIndustry.trim() || undefined,
          searchQuery: settingsSearchQuery.trim() || undefined,
          promptInstructions: settingsPromptInstructions.trim() || undefined,
        }),
      });

      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Failed to update campaign settings');

      setCampaign((prev) => (prev ? { ...prev, ...data } : data));
      setIsSettingsModalOpen(false);
      toast.success('Campaign settings updated successfully!');
      await fetchCampaign();
    } catch (err: any) {
      toast.error(`Save Settings Error: ${err.message}`);
    } finally {
      setSavingSettings(false);
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
  const unverifiedCount = allLeads.filter((l) => Boolean(l.email) && (!l.verifyStatus || l.verifyStatus === 'UNVERIFIED')).length;
  const readyDrafts = allLeads.filter((l) => Boolean(l.aiDraftSubject) && Boolean(l.aiDraftBody)).length;
  const dispatchedLeads = allLeads.filter((l) => l.status === 'DISPATCHED' || l.status === 'CONVERTED').length;
  const convertedLeads = allLeads.filter((l) => l.status === 'CONVERTED').length;
  const uncommittedSafeDrafts = allLeads.filter((l) => l.status !== 'CONVERTED' && l.verifyStatus === 'SAFE' && Boolean(l.aiDraftSubject)).length;
  const uncommittedTotalLeads = allLeads.filter((l) => l.status !== 'CONVERTED').length;

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

  // Selection metrics
  const selectedLeadsList = allLeads.filter((l) => selectedIds.includes(l.id));
  const selectedMissingEmail = selectedLeadsList.filter((l) => !l.email).length;
  const selectedUnverified = selectedLeadsList.filter((l) => Boolean(l.email) && (!l.verifyStatus || l.verifyStatus === 'UNVERIFIED')).length;
  const selectedNeedDraft = selectedLeadsList.filter((l) => l.verifyStatus === 'SAFE' && !l.aiDraftSubject).length;
  const selectedUncommittedSafe = selectedLeadsList.filter((l) => l.status !== 'CONVERTED' && l.verifyStatus !== 'INVALID').length;

  // Determine current active wizard step & Next-Best-Action (NBA) button
  let currentStepNumber = 1;
  let nextActionPrompt = 'Sourced leads ready. Click "Get Emails" to discover corporate addresses.';
  let nextActionLabel = 'Get Candidate Emails';
  let nextActionHandler: () => void | Promise<void> = async () => { await handleFindEmails(); };
  let nextActionColor = 'bg-indigo-600 hover:bg-indigo-700';

  if (selectedIds.length > 0) {
    // Selection-specific contextual action
    if (selectedMissingEmail > 0) {
      currentStepNumber = 2;
      nextActionPrompt = `Selected Batch: ${selectedMissingEmail} of ${selectedIds.length} checked leads need email discovery.`;
      nextActionLabel = `Get Emails (${selectedIds.length} Selected)`;
      nextActionHandler = async () => { await handleFindEmails(selectedIds); };
      nextActionColor = 'bg-indigo-600 hover:bg-indigo-700';
    } else if (selectedUnverified > 0) {
      currentStepNumber = 3;
      nextActionPrompt = `Selected Batch: ${selectedUnverified} of ${selectedIds.length} checked leads need deliverability verification.`;
      nextActionLabel = `Verify (${selectedIds.length} Selected)`;
      nextActionHandler = async () => { await handleVerifyEmails(selectedIds); };
      nextActionColor = 'bg-emerald-600 hover:bg-emerald-700';
    } else if (selectedNeedDraft > 0) {
      currentStepNumber = 4;
      nextActionPrompt = `Selected Batch: ${selectedNeedDraft} checked safe leads need personalized AI cold copy.`;
      nextActionLabel = `Generate AI (${selectedIds.length} Selected)`;
      nextActionHandler = async () => { await handleGenerateDrafts(selectedIds); };
      nextActionColor = 'bg-purple-600 hover:bg-purple-700';
    } else {
      currentStepNumber = 5;
      nextActionPrompt = `Selected Batch: Ready to push ${selectedUncommittedSafe} verified leads to Kanban CRM.`;
      nextActionLabel = `Push ${selectedUncommittedSafe} Selected to CRM`;
      nextActionHandler = () => { openPushCrmModal(selectedIds); };
      nextActionColor = 'bg-amber-500 hover:bg-amber-600 text-slate-950';
    }
  } else {
    // Global Pipeline Progression
    if (allLeads.length === 0) {
      currentStepNumber = 1;
      nextActionPrompt = 'Start by sourcing targeted prospects from LinkedIn.';
      nextActionLabel = 'Source Target Leads';
      nextActionHandler = async () => { await handleSourceLeads(); };
      nextActionColor = 'bg-blue-600 hover:bg-blue-700';
    } else if (missingEmailCount > 0) {
      currentStepNumber = 2;
      nextActionPrompt = `Step 2: ${missingEmailCount} leads need email discovery. Click to extract business emails.`;
      nextActionLabel = `Get Candidate Emails (${missingEmailCount})`;
      nextActionHandler = async () => { await handleFindEmails(); };
      nextActionColor = 'bg-indigo-600 hover:bg-indigo-700';
    } else if (unverifiedCount > 0) {
      currentStepNumber = 3;
      nextActionPrompt = `Step 3: ${unverifiedCount} candidate emails need deliverability verification.`;
      nextActionLabel = `Verify Deliverability (${unverifiedCount})`;
      nextActionHandler = async () => { await handleVerifyEmails(); };
      nextActionColor = 'bg-emerald-600 hover:bg-emerald-700';
    } else if (safeLeads > 0 && readyDrafts < safeLeads) {
      currentStepNumber = 4;
      nextActionPrompt = `Step 4: ${safeLeads} safe inboxes verified. Generate personalized AI cold copy.`;
      nextActionLabel = `Generate AI Drafts (${safeLeads - readyDrafts} remaining)`;
      nextActionHandler = async () => { await handleGenerateDrafts(); };
      nextActionColor = 'bg-purple-600 hover:bg-purple-700';
    } else if (uncommittedSafeDrafts > 0) {
      currentStepNumber = 5;
      nextActionPrompt = `Step 5: ${uncommittedSafeDrafts} verified AI drafts ready! Push to Kanban CRM for pipeline tracking.`;
      nextActionLabel = `Push ${uncommittedSafeDrafts} Leads to CRM`;
      nextActionHandler = () => { openPushCrmModal(); };
      nextActionColor = 'bg-amber-500 hover:bg-amber-600 text-slate-950';
    } else if (convertedLeads > 0 && convertedLeads === allLeads.length) {
      currentStepNumber = 5;
      nextActionPrompt = 'Pipeline fully executed! All leads are active in Kanban CRM.';
      nextActionLabel = 'View Kanban CRM Board';
      nextActionHandler = () => { window.location.assign('/dashboard'); };
      nextActionColor = 'bg-emerald-600 hover:bg-emerald-700';
    }
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
              onClick={openSettingsModal}
              className="px-3 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 border border-slate-200/90 text-xs font-bold rounded-xl transition-colors flex items-center gap-1.5 shadow-2xs"
              title="Edit Campaign identity, targeting parameters, and AI copywriting prompt"
            >
              <span>⚙️</span>
              <span>Campaign Settings</span>
            </button>
            <button
              onClick={() => setIsTestSendOpen(true)}
              disabled={Boolean(actionLoading) || loading}
              className="px-3 py-2 bg-amber-50 hover:bg-amber-100 text-amber-900 border border-amber-300 text-xs font-bold rounded-xl transition-colors flex items-center gap-1.5 shadow-2xs disabled:opacity-50"
              title="Kirim 1 email uji coba ke inbox pribadi sebelum kirim massal"
            >
              <span>⚡</span>
              <span>Send Test Email</span>
            </button>
            <button
              onClick={() => setIsAddLeadOpen(true)}
              disabled={Boolean(actionLoading) || loading}
              className="px-3 py-2 bg-emerald-50 hover:bg-emerald-100 text-emerald-800 border border-emerald-300 text-xs font-bold rounded-xl transition-colors flex items-center gap-1.5 shadow-2xs disabled:opacity-50"
            >
              <span>➕</span>
              <span>Add Custom Lead</span>
            </button>
            {/* Source More Leads with Batch Selector */}
            <div className="inline-flex rounded-xl shadow-2xs border border-slate-200 bg-slate-100 overflow-hidden">
              <button
                onClick={() => handleSourceLeads(sourceBatchSize)}
                disabled={Boolean(actionLoading) || loading}
                className="px-3 py-2 hover:bg-slate-200 text-slate-800 text-xs font-semibold transition-colors disabled:opacity-50 flex items-center gap-1.5"
              >
                {actionLoading === 'scrape' ? (
                  <>
                    <span className="w-3.5 h-3.5 border-2 border-slate-800 border-t-transparent rounded-full animate-spin" />
                    <span>Searching ({sourceBatchSize})...</span>
                  </>
                ) : (
                  <>
                    <span>🔍</span>
                    <span>Source Leads</span>
                  </>
                )}
              </button>
              <select
                value={sourceBatchSize}
                onChange={(e) => setSourceBatchSize(Number(e.target.value))}
                disabled={Boolean(actionLoading) || loading}
                className="bg-slate-200/80 hover:bg-slate-200 border-l border-slate-300 px-2 py-2 text-xs font-bold text-slate-800 focus:outline-none cursor-pointer"
                title="Select number of leads to discover"
              >
                <option value={10}>+10</option>
                <option value={25}>+25</option>
                <option value={50}>+50</option>
                <option value={100}>+100</option>
                <option value={500}>+500</option>
              </select>
            </div>

            <button
              onClick={handleExportCsv}
              disabled={exportingCsv || Boolean(actionLoading) || loading || allLeads.length === 0}
              className="px-3 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs font-semibold rounded-xl transition-colors flex items-center gap-1.5 disabled:opacity-50"
              title={allLeads.length === 0 ? 'No leads available to export' : 'Export leads to Excel-compatible CSV'}
            >
              <span>📊</span>
              <span>{exportingCsv ? 'Exporting...' : 'Export Excel/CSV'}</span>
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

          {/* Step 2: Candidate Emails */}
          <div className={`p-3.5 rounded-xl border transition-all ${currentStepNumber === 2 ? 'bg-white/15 border-amber-400 ring-2 ring-amber-400/30' : missingEmailCount === 0 && allLeads.length > 0 ? 'bg-emerald-950/30 border-emerald-500/30' : 'bg-white/5 border-white/10'} flex flex-col justify-between`}>
            <div>
              <div className="flex items-center justify-between">
                <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">Step 2</span>
                {missingEmailCount === 0 && allLeads.length > 0 ? (
                  <span className="text-emerald-400 text-xs font-bold bg-emerald-500/20 px-1.5 py-0.5 rounded-md">✓ Done</span>
                ) : (
                  <span className="text-slate-500 text-[10px]">{missingEmailCount} Missing</span>
                )}
              </div>
              <p className="text-xs font-semibold text-slate-200 mt-1">Candidate Emails</p>
              <p className="text-lg font-bold text-indigo-300 mt-0.5">{leadsWithEmail} <span className="text-xs font-normal text-slate-400">/ {allLeads.length}</span></p>
            </div>
            <button
              onClick={() => handleFindEmails()}
              disabled={Boolean(actionLoading) || missingEmailCount === 0 || allLeads.length === 0}
              className="mt-2 w-full py-1 bg-indigo-600 hover:bg-indigo-500 text-white text-[11px] font-semibold rounded-lg transition-colors flex items-center justify-center gap-1 disabled:opacity-40"
              title="Run pattern generator & domain lookup to find candidate emails"
            >
              {actionLoading === 'find-emails' ? (
                <span className="w-3 h-3 border-2 border-white border-t-transparent rounded-full animate-spin" />
              ) : missingEmailCount === 0 && allLeads.length > 0 ? (
                <span>✓ All Found</span>
              ) : (
                <span>📬 Get Emails</span>
              )}
            </button>
          </div>

          {/* Step 3: Verify Emails */}
          <div className={`p-3.5 rounded-xl border transition-all ${currentStepNumber === 3 ? 'bg-white/15 border-amber-400 ring-2 ring-amber-400/30' : unverifiedCount === 0 && leadsWithEmail > 0 ? 'bg-emerald-950/30 border-emerald-500/30' : 'bg-white/5 border-white/10'} flex flex-col justify-between`}>
            <div>
              <div className="flex items-center justify-between">
                <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">Step 3</span>
                {unverifiedCount === 0 && leadsWithEmail > 0 ? (
                  <span className="text-emerald-400 text-xs font-bold bg-emerald-500/20 px-1.5 py-0.5 rounded-md">✓ Done</span>
                ) : (
                  <span className="text-slate-500 text-[10px]">{unverifiedCount} Unverified</span>
                )}
              </div>
              <p className="text-xs font-semibold text-slate-200 mt-1">Deliverability</p>
              <p className="text-lg font-bold text-emerald-400 mt-0.5">{safeLeads} <span className="text-xs font-normal text-emerald-300/70">Safe</span></p>
            </div>
            <button
              onClick={() => handleVerifyEmails()}
              disabled={Boolean(actionLoading) || unverifiedCount === 0 || leadsWithEmail === 0}
              className="mt-2 w-full py-1 bg-emerald-600 hover:bg-emerald-500 text-white text-[11px] font-semibold rounded-lg transition-colors flex items-center justify-center gap-1 disabled:opacity-40"
              title="Verify mailbox deliverability and safety score"
            >
              {actionLoading === 'verify' ? (
                <span className="w-3 h-3 border-2 border-white border-t-transparent rounded-full animate-spin" />
              ) : unverifiedCount === 0 && leadsWithEmail > 0 ? (
                <span>✓ Verified</span>
              ) : (
                <span>🛡️ Verify</span>
              )}
            </button>
          </div>

          {/* Step 4: AI Drafts */}
          <div className={`p-3.5 rounded-xl border transition-all ${currentStepNumber === 4 ? 'bg-white/15 border-amber-400 ring-2 ring-amber-400/30' : readyDrafts >= safeLeads && safeLeads > 0 ? 'bg-emerald-950/30 border-emerald-500/30' : 'bg-white/5 border-white/10'} flex flex-col justify-between`}>
            <div>
              <div className="flex items-center justify-between">
                <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">Step 4</span>
                {readyDrafts >= safeLeads && safeLeads > 0 ? (
                  <span className="text-emerald-400 text-xs font-bold bg-emerald-500/20 px-1.5 py-0.5 rounded-md">✓ Done</span>
                ) : (
                  <span className="text-slate-500 text-[10px]">{Math.max(safeLeads - readyDrafts, 0)} Needed</span>
                )}
              </div>
              <p className="text-xs font-semibold text-slate-200 mt-1">AI Pitch Copy</p>
              <p className="text-lg font-bold text-purple-400 mt-0.5">{readyDrafts} <span className="text-xs font-normal text-purple-300/70">Ready</span></p>
            </div>
            <button
              onClick={() => handleGenerateDrafts()}
              disabled={Boolean(actionLoading) || safeLeads === 0 || (readyDrafts >= safeLeads && safeLeads > 0)}
              className="mt-2 w-full py-1 bg-purple-600 hover:bg-purple-500 text-white text-[11px] font-semibold rounded-lg transition-colors flex items-center justify-center gap-1 disabled:opacity-40"
              title="Generate personalized cold pitches with JetDigitalPro AI"
            >
              {actionLoading === 'draft' ? (
                <span className="w-3 h-3 border-2 border-white border-t-transparent rounded-full animate-spin" />
              ) : readyDrafts >= safeLeads && safeLeads > 0 ? (
                <span>✓ All Drafted</span>
              ) : (
                <span>🤖 AI Drafts</span>
              )}
            </button>
          </div>

          {/* Step 5: Push to CRM & Dispatch */}
          <div className={`p-3.5 rounded-xl border transition-all ${currentStepNumber === 5 ? 'bg-white/15 border-amber-400 ring-2 ring-amber-400/30' : uncommittedTotalLeads === 0 && allLeads.length > 0 ? 'bg-emerald-950/30 border-emerald-500/30' : 'bg-white/5 border-white/10'} col-span-2 md:col-span-1 flex flex-col justify-between`}>
            <div>
              <div className="flex items-center justify-between">
                <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">Step 5</span>
                {uncommittedTotalLeads === 0 && allLeads.length > 0 ? (
                  <span className="text-emerald-400 text-xs font-bold bg-emerald-500/20 px-1.5 py-0.5 rounded-md">✓ Done</span>
                ) : (
                  <span className="text-slate-500 text-[10px]">{uncommittedSafeDrafts} Ready</span>
                )}
              </div>
              <p className="text-xs font-semibold text-slate-200 mt-1">CRM Bridge</p>
              <p className="text-lg font-bold text-amber-400 mt-0.5">{convertedLeads} <span className="text-xs font-normal text-amber-300/70">in CRM</span></p>
            </div>
            <button
              onClick={() => openPushCrmModal()}
              disabled={Boolean(actionLoading) || uncommittedSafeDrafts === 0 || allLeads.length === 0}
              className="mt-2 w-full py-1 bg-amber-500 hover:bg-amber-400 text-slate-950 text-[11px] font-bold rounded-lg transition-colors flex items-center justify-center gap-1 disabled:opacity-40"
              title="Bridge verified leads into Kanban CRM pipeline board"
            >
              {actionLoading === 'push-crm' ? (
                <span className="w-3 h-3 border-2 border-slate-900 border-t-transparent rounded-full animate-spin" />
              ) : uncommittedTotalLeads === 0 && allLeads.length > 0 ? (
                <span>✓ All in CRM</span>
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
              Apply actions specifically to checked prospects:
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
              onClick={() => openPushCrmModal(selectedIds)}
              disabled={Boolean(actionLoading) || selectedUncommittedSafe === 0}
              className="px-3 py-1.5 bg-amber-500 hover:bg-amber-400 text-slate-950 text-xs font-bold rounded-xl transition-colors flex items-center gap-1 disabled:opacity-50"
            >
              <span>📋 Push to CRM ({selectedUncommittedSafe})</span>
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
              <option value="DISPATCHED">Dispatched / In CRM ({dispatchedLeads})</option>
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
          <div className="p-12 text-center text-xs text-slate-400 space-y-3">
            {actionLoading === 'scrape' ? (
              <div className="space-y-3 max-w-sm mx-auto animate-in fade-in">
                <div className="w-8 h-8 border-3 border-primary-600 border-t-transparent rounded-full animate-spin mx-auto" />
                <p className="text-sm font-bold text-slate-800">Searching Initial Prospects from LinkedIn...</p>
                <p className="text-xs text-slate-500">
                  Please wait while the discovery engine extracts targeted leads matching your ICP criteria.
                </p>
              </div>
            ) : (
              <>
                <p>No leads sourced yet for this campaign.</p>
                <button
                  onClick={() => handleSourceLeads()}
                  disabled={Boolean(actionLoading) || loading}
                  className="px-4 py-2 bg-primary-600 hover:bg-primary-700 text-white font-bold rounded-xl text-xs transition-colors shadow-xs disabled:opacity-50"
                >
                  Source Target Leads Now →
                </button>
              </>
            )}
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

                      {/* Name & Company & Direct Links */}
                      <td className="px-4 py-3.5">
                        <div className="font-bold text-slate-900 text-xs">
                          {lead.fullName}
                        </div>
                        <div className="text-[11px] text-slate-500 mt-0.5 flex items-center gap-1.5 flex-wrap">
                          <span className="font-medium text-slate-600">{lead.jobTitle}</span>
                          <span>•</span>
                          <span className="font-semibold text-slate-800">{lead.companyName}</span>
                          {lead.location && (
                            <>
                              <span>•</span>
                              <span className="text-slate-400">📍 {lead.location}</span>
                            </>
                          )}
                        </div>
                        {/* Dedicated Fixed Action Row for LinkedIn & Website */}
                        {(lead.linkedinUrl || isValidWebsiteDomain(lead.companyDomain)) && (
                          <div className="flex items-center gap-2 mt-2 pt-1.5 border-t border-slate-100">
                            {lead.linkedinUrl && (
                              <a
                                href={lead.linkedinUrl.startsWith('http') ? lead.linkedinUrl : `https://${lead.linkedinUrl}`}
                                target="_blank"
                                rel="noreferrer"
                                className="inline-flex items-center gap-1.5 px-2 py-1 text-[11px] font-medium text-slate-700 bg-slate-100 hover:bg-[#0077b5]/10 hover:text-[#0077b5] border border-slate-200/90 hover:border-[#0077b5]/30 rounded-md transition-all"
                                title="Buka Profil / Halaman LinkedIn Resmi"
                              >
                                <svg className="w-3 h-3 fill-current text-[#0077b5]" viewBox="0 0 24 24">
                                  <path d="M19 3a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h14m-.5 15.5v-5.3a3.26 3.26 0 0 0-3.26-3.26c-.85 0-1.84.52-2.28 1.3v-1.11h-2.79v8.37h2.79v-4.93c0-.77.62-1.4 1.39-1.4a1.4 1.4 0 0 1 1.4 1.4v4.93h2.75M6.46 10.9v8.37H9.2V10.9H6.46M7.83 6.64a1.66 1.66 0 0 0-1.66 1.66 1.66 1.66 0 0 0 1.66 1.66 1.66 1.66 0 0 0 1.66-1.66c0-.92-.74-1.66-1.66-1.66Z" />
                                </svg>
                                <span>LinkedIn</span>
                                <span className="text-[9px] text-slate-400">↗</span>
                              </a>
                            )}

                            {isValidWebsiteDomain(lead.companyDomain) && (
                              <a
                                href={lead.companyDomain!.startsWith('http') ? lead.companyDomain! : `https://${lead.companyDomain}`}
                                target="_blank"
                                rel="noreferrer"
                                className="inline-flex items-center gap-1.5 px-2 py-1 text-[11px] font-medium text-slate-700 bg-slate-100 hover:bg-indigo-50 hover:text-indigo-700 border border-slate-200/90 hover:border-indigo-200 rounded-md transition-all"
                                title="Kunjungi Website Perusahaan"
                              >
                                <span className="text-slate-400">🌐</span>
                                <span className="max-w-[140px] truncate">{lead.companyDomain!.replace(/^https?:\/\//, '').replace(/\/.*$/, '')}</span>
                                <span className="text-[9px] text-slate-400">↗</span>
                              </a>
                            )}
                          </div>
                        )}
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
                            🟡 Risky ({lead.verifyScore || 60}%)
                          </span>
                        )}
                        {(isInvalid || lead.verifyStatus === 'DISPOSABLE') && (
                          <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-bold bg-red-100 text-red-800">
                            🔴 {lead.verifyStatus === 'DISPOSABLE' ? 'Disposable' : 'Invalid'}
                          </span>
                        )}
                        {!isSafe && !isRisky && !isInvalid && lead.verifyStatus !== 'DISPOSABLE' && (
                          lead.email ? (
                            <button
                              onClick={() => handleVerifyEmails([lead.id])}
                              disabled={isVerifying}
                              className="inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-bold bg-slate-100 hover:bg-slate-200 text-slate-600 transition-colors border border-slate-200 shadow-2xs"
                              title="Click to check deliverability via Reoon Verifier"
                            >
                              {isVerifying ? 'Checking...' : '⚪ Verify'}
                            </button>
                          ) : (
                            <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-medium text-slate-400 bg-slate-50 border border-slate-200">
                              ⚪ No Email
                            </span>
                          )
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
                            disabled={isDrafting || lead.verifyStatus === 'INVALID'}
                            className="px-2.5 py-1 bg-slate-100 hover:bg-purple-50 hover:text-purple-700 text-slate-600 text-[10px] font-bold rounded-lg transition-colors border border-slate-200 disabled:opacity-40"
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
                        {lead.status === 'CONVERTED' && lead.convertedCardId ? (
                          <Link
                            href={`/dashboard?cardId=${lead.convertedCardId}`}
                            className="px-2.5 py-1 bg-emerald-50 text-emerald-800 border border-emerald-300 text-[11px] font-bold rounded-lg hover:bg-emerald-100 transition-colors inline-flex items-center gap-1 shadow-2xs"
                            title="View Card on Kanban CRM Board"
                          >
                            <span>✓ In CRM</span>
                            <span className="text-[10px]">↗</span>
                          </Link>
                        ) : (
                          <button
                            onClick={() => openPushCrmModal([lead.id])}
                            disabled={isPushing || lead.verifyStatus === 'INVALID'}
                            className="px-2.5 py-1 bg-amber-50 hover:bg-amber-100 text-amber-900 border border-amber-300 text-[11px] font-bold rounded-lg transition-colors disabled:opacity-40"
                            title="Convert immediately to Kanban CRM Lead Card"
                          >
                            <span>📋 Push CRM</span>
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

      {/* Interactive Push to Kanban CRM Modal with Board & Column Selector */}
      {isPushCrmModalOpen && (
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-4 z-50 animate-in fade-in">
          <div className="bg-white rounded-2xl max-w-lg w-full p-6 shadow-2xl border border-slate-200 space-y-4">
            <div className="flex items-center justify-between border-b border-slate-100 pb-3">
              <div className="flex items-center gap-2">
                <span className="text-xl">📋</span>
                <div>
                  <h3 className="text-sm font-bold text-slate-900">Push Leads to Kanban CRM</h3>
                  <p className="text-xs text-slate-500">Select the target Kanban Board and Column for these prospects.</p>
                </div>
              </div>
              <button
                onClick={() => setIsPushCrmModalOpen(false)}
                className="text-slate-400 hover:text-slate-600"
              >
                ✕
              </button>
            </div>

            {/* Target Count & Summary */}
            <div className="p-3.5 bg-indigo-50/80 border border-indigo-100 rounded-xl text-xs space-y-1">
              <div className="flex items-center justify-between font-bold text-indigo-950">
                <span>Eligible Prospects to Push:</span>
                <span className="bg-indigo-600 text-white px-2 py-0.5 rounded-full text-[11px]">
                  {crmTargetLeadIds.length} Leads
                </span>
              </div>
              <p className="text-[11px] text-indigo-700/80">
                Each prospect will be converted into a Kanban card with their contact info, LinkedIn link, and generated AI pitch draft.
              </p>
            </div>

            {/* Board & Column Selectors */}
            <div className="space-y-3">
              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">
                  Select Target Board *
                </label>
                <select
                  value={selectedBoardId}
                  onChange={(e) => handleSelectBoard(e.target.value)}
                  className="w-full px-3 py-2 border border-slate-300 rounded-xl text-xs bg-white text-slate-800 font-semibold focus:ring-2 focus:ring-primary-500"
                >
                  {boardsList.length === 0 && <option value="">Default Main Sales Board</option>}
                  {boardsList.map((b) => (
                    <option key={b.id} value={b.id}>
                      {b.title} ({b.columns?.length || 0} columns)
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">
                  Select Target Column *
                </label>
                <select
                  value={selectedColumnId}
                  onChange={(e) => setSelectedColumnId(e.target.value)}
                  className="w-full px-3 py-2 border border-slate-300 rounded-xl text-xs bg-white text-slate-800 focus:ring-2 focus:ring-primary-500"
                >
                  {(() => {
                    const currentBoard = boardsList.find((b) => b.id === selectedBoardId) || boardsList[0];
                    const columns = currentBoard?.columns || [];
                    if (columns.length === 0) {
                      return <option value="">Default "Leads" Column</option>;
                    }
                    return columns.map((col: any) => (
                      <option key={col.id} value={col.id}>
                        {col.title}
                      </option>
                    ));
                  })()}
                </select>
              </div>
            </div>

            {/* Modal Actions */}
            <div className="flex items-center justify-end gap-2 pt-3 border-t border-slate-100">
              <button
                type="button"
                onClick={() => setIsPushCrmModalOpen(false)}
                className="px-4 py-2 text-xs font-semibold text-slate-600 hover:bg-slate-100 rounded-xl"
              >
                Cancel
              </button>
              <button
                type="button"
                disabled={Boolean(actionLoading) || crmTargetLeadIds.length === 0}
                onClick={executePushCrm}
                className="px-5 py-2 bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-bold rounded-xl transition-all shadow-xs flex items-center gap-1.5 disabled:opacity-50"
              >
                {actionLoading === 'push-crm' ? (
                  <>
                    <span className="w-3.5 h-3.5 border-2 border-white border-t-transparent rounded-full animate-spin" />
                    <span>Pushing to CRM...</span>
                  </>
                ) : (
                  <>
                    <span>✓</span>
                    <span>Confirm & Push {crmTargetLeadIds.length} Leads</span>
                  </>
                )}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Sequential AI Draft Review & Edit Modal (Side-by-Side Split View) */}
      {selectedLead && (
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-4 z-50 animate-in fade-in">
          <div className="bg-white rounded-2xl max-w-4xl w-full p-5 sm:p-6 shadow-2xl border border-slate-200 space-y-4 max-h-[92vh] overflow-y-auto">
            {/* Modal Header with Sequential Lead Navigator */}
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-slate-100 pb-4">
              <div className="flex items-center gap-3">
                <span className="w-9 h-9 rounded-xl bg-purple-100 text-purple-700 flex items-center justify-center font-bold text-sm">
                  {currentModalIndex >= 0 ? currentModalIndex + 1 : 1}
                </span>
                <div>
                  <h3 className="text-sm font-bold text-slate-900 flex items-center gap-2">
                    <span>{selectedLead.fullName}</span>
                    {selectedLead.verifyStatus === 'SAFE' && (
                      <span className="text-[10px] bg-emerald-100 text-emerald-800 font-bold px-2 py-0.5 rounded-full">
                        🟢 Safe
                      </span>
                    )}
                  </h3>
                  <p className="text-xs text-slate-500">
                    {selectedLead.jobTitle || 'Executive'} at{' '}
                    <span className="font-semibold text-slate-700">{selectedLead.companyName || 'Enterprise'}</span>
                  </p>
                </div>
              </div>

              {/* Sequential Navigator Controls */}
              <div className="flex items-center gap-2">
                <div className="text-xs font-semibold text-slate-400 mr-1">
                  Lead {currentModalIndex + 1} of {filteredLeads.length}
                </div>
                <button
                  onClick={() => navigateDraftModal('prev')}
                  disabled={currentModalIndex <= 0}
                  className="px-3 py-1.5 bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs font-bold rounded-xl transition-colors disabled:opacity-30"
                  title="Previous Lead (Alt + Left Arrow)"
                >
                  ← Prev
                </button>
                <button
                  onClick={() => navigateDraftModal('next')}
                  disabled={currentModalIndex >= filteredLeads.length - 1}
                  className="px-3 py-1.5 bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs font-bold rounded-xl transition-colors disabled:opacity-30"
                  title="Next Lead (Alt + Right Arrow)"
                >
                  Next →
                </button>
                <button
                  onClick={() => setSelectedLead(null)}
                  className="p-1.5 text-slate-400 hover:text-slate-600 rounded-xl"
                  title="Close (Esc)"
                >
                  ✕
                </button>
              </div>
            </div>

            {/* Email Edit Inputs */}
            <div className="space-y-3">
              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">
                  Recipient Target Email <span className="text-slate-400 font-normal">(Verified or custom test email)</span>
                </label>
                <input
                  type="email"
                  value={editEmail}
                  onChange={(e) => setEditEmail(e.target.value)}
                  placeholder="e.g. prospect@company.com"
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
                      className="text-[10px] text-indigo-600 hover:text-indigo-800 font-medium"
                      title="Use AI A/B testing alternative subject"
                    >
                      💡 Switch to A/B Subject
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

              {/* Custom AI Regeneration Guidance */}
              <div className="p-3 bg-purple-50/50 rounded-xl border border-purple-100 space-y-2">
                <div className="flex items-center justify-between">
                  <label className="text-[11px] font-bold text-purple-900 flex items-center gap-1">
                    <span>✨</span>
                    <span>AI Regeneration Directives for this Lead (Optional)</span>
                  </label>
                  <button
                    type="button"
                    onClick={handleRegenerateModalDraft}
                    disabled={regeneratingDraft}
                    className="text-[11px] text-purple-700 hover:text-purple-900 font-bold flex items-center gap-1 bg-white px-2 py-1 rounded-lg border border-purple-200 shadow-2xs"
                  >
                    <span>{regeneratingDraft ? '⏳' : '⚡'}</span>
                    <span>{regeneratingDraft ? 'Regenerating AI...' : 'Regenerate AI Copy'}</span>
                  </button>
                </div>
                <input
                  type="text"
                  value={modalCustomPrompt}
                  onChange={(e) => setModalCustomPrompt(e.target.value)}
                  placeholder="e.g. Make it under 80 words, emphasize cloud security, or use a conversational tone."
                  className="w-full px-3 py-1.5 border border-purple-200 bg-white rounded-lg text-xs text-slate-800 focus:outline-none focus:ring-2 focus:ring-purple-500"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">Email Pitch Body</label>
                <textarea
                  rows={7}
                  value={editBody}
                  onChange={(e) => setEditBody(e.target.value)}
                  className="w-full px-3 py-2.5 border border-slate-300 rounded-xl text-xs focus:outline-none focus:ring-2 focus:ring-primary-500 text-slate-800 leading-relaxed font-sans"
                />
              </div>
            </div>

            {/* Clean Unified Action Footer */}
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 pt-3 border-t border-slate-100">
              {/* Push / Approve to CRM Action */}
              <div>
                {selectedLead.status === 'CONVERTED' && selectedLead.convertedCardId ? (
                  <Link
                    href={`/dashboard?cardId=${selectedLead.convertedCardId}`}
                    className="px-3 py-1.5 bg-emerald-50 text-emerald-800 border border-emerald-300 text-xs font-bold rounded-xl inline-flex items-center gap-1"
                  >
                    <span>✓ Converted in Kanban CRM</span>
                    <span>↗</span>
                  </Link>
                ) : (
                  <button
                    type="button"
                    onClick={async () => {
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
                        setSelectedLead(null);
                        openPushCrmModal([selectedLead.id]);
                      } catch (err: any) {
                        toast.error(`Save draft error: ${err.message}`);
                      }
                    }}
                    className="px-4 py-2 bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-bold rounded-xl transition-all inline-flex items-center gap-1.5 shadow-xs"
                    title="Approve edited draft and choose board to convert into Kanban CRM"
                  >
                    <span>✓</span>
                    <span>Approve Draft & Push to CRM</span>
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
                  {addingCustomLead ? 'Adding...' : 'Add Lead'}
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

      {/* Campaign Settings Modal */}
      {isSettingsModalOpen && (
        <div className="fixed inset-0 bg-slate-900/50 backdrop-blur-xs flex items-center justify-center p-4 z-50 overflow-y-auto">
          <div className="bg-white rounded-2xl max-w-2xl w-full p-6 shadow-xl border border-slate-200 space-y-5 my-8 max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between border-b border-slate-100 pb-3">
              <div className="flex items-center gap-2.5">
                <span className="text-xl">⚙️</span>
                <div>
                  <h3 className="text-sm font-bold text-slate-900">Campaign Configuration & AI Settings</h3>
                  <p className="text-xs text-slate-500">Update campaign parameters, targeting criteria, and AI copywriting prompt.</p>
                </div>
              </div>
              <button onClick={() => setIsSettingsModalOpen(false)} className="text-slate-400 hover:text-slate-600 p-1">
                ✕
              </button>
            </div>

            <form onSubmit={handleSaveSettings} className="space-y-5">
              {/* 1. General Info & Mailbox */}
              <div className="space-y-3 p-4 bg-slate-50/70 rounded-xl border border-slate-200/80">
                <h4 className="text-xs font-bold text-slate-900 flex items-center gap-1.5">
                  <span>📌</span>
                  <span>General Identity & Sender Mailbox</span>
                </h4>
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                  <div className="sm:col-span-2">
                    <label className="block text-[11px] font-semibold text-slate-700 mb-1">Campaign Title *</label>
                    <input
                      type="text"
                      required
                      value={settingsName}
                      onChange={(e) => setSettingsName(e.target.value)}
                      placeholder="e.g. US Enterprise CTOs"
                      className="w-full px-3 py-2 border border-slate-300 rounded-xl text-xs bg-white focus:ring-2 focus:ring-primary-500"
                    />
                  </div>
                  <div>
                    <label className="block text-[11px] font-semibold text-slate-700 mb-1">Status</label>
                    <select
                      value={settingsStatus}
                      onChange={(e) => setSettingsStatus(e.target.value)}
                      className="w-full px-3 py-2 border border-slate-300 rounded-xl text-xs bg-white focus:ring-2 focus:ring-primary-500 font-medium"
                    >
                      <option value="DRAFT">DRAFT</option>
                      <option value="ACTIVE">ACTIVE</option>
                      <option value="PAUSED">PAUSED</option>
                      <option value="COMPLETED">COMPLETED</option>
                    </select>
                  </div>
                  <div className="sm:col-span-3">
                    <label className="block text-[11px] font-semibold text-slate-700 mb-1">Outbound Sender Mailbox</label>
                    <select
                      value={settingsAccountId}
                      onChange={(e) => setSettingsAccountId(e.target.value)}
                      className="w-full px-3 py-2 border border-slate-300 rounded-xl text-xs bg-white focus:ring-2 focus:ring-primary-500"
                    >
                      <option value="">No sender configured (Staging only)</option>
                      {outreachAccounts.map((acc) => (
                        <option key={acc.id} value={acc.id}>
                          {acc.name} ({acc.senderEmail})
                        </option>
                      ))}
                    </select>
                  </div>
                </div>
              </div>

              {/* 2. Target Prospect Criteria */}
              <div className="space-y-3 p-4 bg-slate-50/70 rounded-xl border border-slate-200/80">
                <h4 className="text-xs font-bold text-slate-900 flex items-center gap-1.5">
                  <span>🎯</span>
                  <span>Prospect Targeting Criteria</span>
                </h4>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div>
                    <label className="block text-[11px] font-semibold text-slate-700 mb-1">Target Job Title / Role</label>
                    <input
                      type="text"
                      value={settingsTargetRole}
                      onChange={(e) => setSettingsTargetRole(e.target.value)}
                      placeholder="e.g. Chief Technology Officer"
                      className="w-full px-3 py-2 border border-slate-300 rounded-xl text-xs bg-white focus:ring-2 focus:ring-primary-500"
                    />
                  </div>
                  <div>
                    <label className="block text-[11px] font-semibold text-slate-700 mb-1">Target Location / Geography</label>
                    <input
                      type="text"
                      value={settingsTargetLocation}
                      onChange={(e) => setSettingsTargetLocation(e.target.value)}
                      placeholder="e.g. United States, Indonesia"
                      className="w-full px-3 py-2 border border-slate-300 rounded-xl text-xs bg-white focus:ring-2 focus:ring-primary-500"
                    />
                  </div>
                  <div>
                    <label className="block text-[11px] font-semibold text-slate-700 mb-1">Industry / Sector</label>
                    <select
                      value={settingsTargetIndustry}
                      onChange={(e) => setSettingsTargetIndustry(e.target.value)}
                      className="w-full px-3 py-2 border border-slate-300 rounded-xl text-xs bg-white focus:ring-2 focus:ring-primary-500"
                    >
                      {INDUSTRY_OPTIONS.map((ind) => (
                        <option key={ind} value={ind}>
                          {ind}
                        </option>
                      ))}
                    </select>
                  </div>
                  <div>
                    <label className="block text-[11px] font-semibold text-slate-700 mb-1">Search Keyword Qualifier</label>
                    <input
                      type="text"
                      value={settingsSearchQuery}
                      onChange={(e) => setSettingsSearchQuery(e.target.value)}
                      placeholder="e.g. B2B SaaS, Series A"
                      className="w-full px-3 py-2 border border-slate-300 rounded-xl text-xs bg-white focus:ring-2 focus:ring-primary-500"
                    />
                  </div>
                </div>
              </div>

              {/* 3. AI Value Proposition & Pitch Instructions */}
              <div className="space-y-3 p-4 bg-slate-50/70 rounded-xl border border-slate-200/80">
                <div className="flex items-center justify-between">
                  <h4 className="text-xs font-bold text-slate-900 flex items-center gap-1.5">
                    <span>🤖</span>
                    <span>AI Copywriting & Value Proposition Strategy</span>
                  </h4>
                  <span className="text-[10px] text-slate-400">Used for AI draft generation</span>
                </div>
                <textarea
                  rows={4}
                  value={settingsPromptInstructions}
                  onChange={(e) => setSettingsPromptInstructions(e.target.value)}
                  placeholder="Describe your offer, USP, key client benefits, and call to action..."
                  className="w-full px-3 py-2 border border-slate-300 rounded-xl text-xs leading-relaxed bg-white focus:ring-2 focus:ring-primary-500 text-slate-800"
                />
              </div>

              <div className="flex items-center justify-end gap-2 pt-3 border-t border-slate-100">
                <button
                  type="button"
                  onClick={() => setIsSettingsModalOpen(false)}
                  className="px-4 py-2 text-xs font-semibold text-slate-600 hover:bg-slate-100 rounded-xl transition-colors"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={savingSettings}
                  className="px-5 py-2 bg-primary-600 hover:bg-primary-700 text-white text-xs font-bold rounded-xl shadow-xs transition-colors disabled:opacity-50 flex items-center gap-1.5"
                >
                  {savingSettings ? (
                    <>
                      <span className="w-3.5 h-3.5 border-2 border-white border-t-transparent rounded-full animate-spin" />
                      <span>Saving Changes...</span>
                    </>
                  ) : (
                    <span>Save Campaign Settings</span>
                  )}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
