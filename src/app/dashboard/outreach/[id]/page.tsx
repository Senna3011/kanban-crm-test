'use client';

import { useEffect, useState, use, useRef } from 'react';
import { useSearchParams } from 'next/navigation';
import Link from 'next/link';
import ConfirmDialog, { type ConfirmDialogVariant } from '@/components/ui/ConfirmDialog';
import toast, { Toaster } from 'react-hot-toast';

interface Lead {
  id: string;
  fullName: string;
  firstName?: string;
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
  dripDraftSubject?: string;
  dripDraftBody?: string;
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
  dripEnabled?: boolean;
  dripStepsCount?: number;
  dripSubject?: string;
  dripSubject2?: string;
  dripSubject3?: string;
  dripDelayDays?: number;
  dripDelayDays2?: number;
  dripDelayDays3?: number;
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

  // Selected Lead for Sequential Draft Review Modal (Supports 4 drafts: Initial + 3 Follow-ups - Point 13)
  const [selectedLead, setSelectedLead] = useState<Lead | null>(null);
  const [activeDraftTab, setActiveDraftTab] = useState(0);
  const [editSubject, setEditSubject] = useState('');
  const [editBody, setEditBody] = useState('');
  const [editDripSubject1, setEditDripSubject1] = useState('');
  const [editDripBody1, setEditDripBody1] = useState('');
  const [editDripSubject2, setEditDripSubject2] = useState('');
  const [editDripBody2, setEditDripBody2] = useState('');
  const [editDripSubject3, setEditDripSubject3] = useState('');
  const [editDripBody3, setEditDripBody3] = useState('');
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
  const [settingsAccountIds, setSettingsAccountIds] = useState<string[]>([]);
  const [settingsTargetRole, setSettingsTargetRole] = useState('');
  const [settingsTargetLocation, setSettingsTargetLocation] = useState('');
  const [settingsTargetIndustry, setSettingsTargetIndustry] = useState('');
  const [settingsSearchQuery, setSettingsSearchQuery] = useState('');
  const [settingsPromptInstructions, setSettingsPromptInstructions] = useState('');
  const [settingsDripEnabled, setSettingsDripEnabled] = useState(false);
  const [settingsDripDelayDays, setSettingsDripDelayDays] = useState(3);
  const [settingsDripSubject, setSettingsDripSubject] = useState('');
  const [savingSettings, setSavingSettings] = useState(false);
  const [outreachAccounts, setOutreachAccounts] = useState<any[]>([]);

  // Background worker polling state
  const [isPollingWorker, setIsPollingWorker] = useState(false);

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

      // Clean the query string from browser history immediately to prevent F5 duplicate job triggers
      if (autoSource === 'true') {
        if (typeof window !== 'undefined') {
          window.history.replaceState({}, '', window.location.pathname);
        }
        if (!autoSourceTriggered.current && (!loadedCampaign?.leads || loadedCampaign.leads.length === 0)) {
          autoSourceTriggered.current = true;
          handleSourceLeads(limit, provider);
        }
      }
    });
  }, [campaignId]);

  // Live Auto-Polling when Background Scraper is active
  useEffect(() => {
    let interval: NodeJS.Timeout | null = null;
    if (isPollingWorker || campaign?.status === 'RUNNING') {
      interval = setInterval(async () => {
        const res = await fetch(`/api/outreach/campaigns/${campaignId}`, { cache: 'no-store' });
        if (res.ok) {
          const loaded: CampaignDetail = await res.json();
          setCampaign(loaded);
          if (loaded.status !== 'RUNNING') {
            setIsPollingWorker(false);
            toast.success(`🎉 Pencarian background selesai! Total ${loaded.leads?.length || 0} leads terkumpul.`);
          }
        }
      }, 2500);
    }
    return () => {
      if (interval) clearInterval(interval);
    };
  }, [isPollingWorker, campaign?.status, campaignId]);

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
        setIsPollingWorker(true);
        toast.success(data.message || `Pencarian ${customLimit || 10} leads dijadwalkan di background worker.`);
      } else if (data.count === 0 && data.skippedDuplicates > 0) {
        toast(`ℹ️ Tidak ada leads baru. (${data.skippedDuplicates} leads ditemukan sudah ada di kampanye ini).`, { icon: '🔍' });
      } else {
        toast.success(`Successfully sourced ${data.count} targeted prospects (${data.skippedDuplicates || 0} duplicates skipped).`);
      }
      await fetchCampaign();
    } catch (err: any) {
      toast.error(`Discovery error: ${err.message}`);
    } finally {
      setActionLoading('');
    }
  }

  async function handleResetStatus() {
    try {
      const res = await fetch(`/api/outreach/campaigns/${campaignId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status: 'DRAFT' }),
      });
      if (!res.ok) throw new Error('Failed to reset status');
      setIsPollingWorker(false);
      setActionLoading('');
      toast.success('Pencarian berhasil dibatalkan dan status di-reset ke DRAFT!');
      await fetchCampaign();
    } catch (err: any) {
      toast.error(`Reset Error: ${err.message}`);
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
          const leadsCol = cols.find((c: any) => c.title.toLowerCase() === 'fresh leads') || cols.find((c: any) => c.title.toLowerCase() === 'leads') || cols[0];
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
      const leadsCol = b.columns.find((c: any) => c.title.toLowerCase() === 'fresh leads') || b.columns.find((c: any) => c.title.toLowerCase() === 'leads') || b.columns[0];
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
      
      const count = data.convertedCount || crmTargetLeadIds.length;
      toast.success(
        `✓ ${count} lead(s) successfully pushed to "Fresh leads" in CRM! Cards saved safely as drafts (No email sent).`,
        { duration: 7000 }
      );
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

  // Sequential Draft Reviewer Modal Navigation (Point 13: 4 drafts for 3 follow-ups)
  function openDraftModal(lead: Lead) {
    setSelectedLead(lead);
    setActiveDraftTab(0);
    setEditSubject(lead.aiDraftSubject || '');
    setEditBody(lead.aiDraftBody || '');
    setEditEmail(lead.email || '');
    setModalCustomPrompt('');

    const seq = (lead.metadata as any)?.sequenceDrafts || [];
    const d1 = seq.find((s: any) => s.step === 1);
    const d2 = seq.find((s: any) => s.step === 2);
    const d3 = seq.find((s: any) => s.step === 3);

    const fName = lead.firstName || lead.fullName?.split(' ')[0] || 'there';

    setEditDripSubject1(
      d1?.subject || lead.dripDraftSubject || campaign?.dripSubject || `Re: ${lead.aiDraftSubject || 'Quick follow up'}`
    );
    setEditDripBody1(
      d1?.body || lead.dripDraftBody || `Hi ${fName},\n\nI wanted to follow up on my previous note regarding ${lead.companyName || 'your organization'}. Would love to share how our team can help streamline your digital operations.\n\nDo you have 10 minutes this week for a brief conversation?\n\nBest regards`
    );

    setEditDripSubject2(
      d2?.subject || campaign?.dripSubject2 || `Re: Following up / ${lead.aiDraftSubject || 'Quick check'}`
    );
    setEditDripBody2(
      d2?.body || `Hi ${fName},\n\nCircling back on this as I know how busy you must be heading ${lead.jobTitle || 'your team'}. We recently helped a similar enterprise accelerate their delivery pipelines with significant efficiency gains.\n\nHappy to send over a quick 2-page brief if you'd find that helpful.\n\nBest regards`
    );

    setEditDripSubject3(
      d3?.subject || campaign?.dripSubject3 || `Re: Final check-in / Closing loop`
    );
    setEditDripBody3(
      d3?.body || `Hi ${fName},\n\nI haven't heard back, so I assume this isn't a priority right now, which is completely understandable. I'll stop reaching out for now so I don't crowd your inbox.\n\nFeel free to reach out anytime if your priorities shift.\n\nBest of luck with everything at ${lead.companyName || 'your company'}!\n\nBest regards`
    );
  }

  function navigateDraftModal(direction: 'prev' | 'next') {
    if (!selectedLead || !campaign?.leads) return;
    const leadsList = filteredLeads;
    const currentIndex = leadsList.findIndex((l) => l.id === selectedLead.id);
    if (currentIndex === -1) return;

    const isDirty = (
      editSubject !== (selectedLead.aiDraftSubject || '') ||
      editBody !== (selectedLead.aiDraftBody || '') ||
      editEmail !== (selectedLead.email || '')
    );

    if (isDirty) {
      const confirmDiscard = window.confirm('You have unsaved changes in this draft. Move to next lead and discard changes?');
      if (!confirmDiscard) return;
    }

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
      const sequenceDrafts = [
        { step: 0, title: 'Initial Touch (Cold Pitch)', subject: editSubject.trim(), body: editBody.trim() },
        { step: 1, title: 'Follow-Up #1', subject: editDripSubject1.trim(), body: editDripBody1.trim() },
        { step: 2, title: 'Follow-Up #2', subject: editDripSubject2.trim(), body: editDripBody2.trim() },
        { step: 3, title: 'Follow-Up #3 (Closing)', subject: editDripSubject3.trim(), body: editDripBody3.trim() },
      ];

      const res = await fetch(`/api/outreach/leads/${selectedLead.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          aiDraftSubject: editSubject.trim(),
          aiDraftBody: editBody.trim(),
          dripDraftSubject: editDripSubject1.trim(),
          dripDraftBody: editDripBody1.trim(),
          email: editEmail.trim() || undefined,
          metadata: {
            ...(typeof selectedLead.metadata === 'object' && selectedLead.metadata !== null ? selectedLead.metadata : {}),
            sequenceDrafts,
          },
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
                  dripDraftSubject: editDripSubject1.trim(),
                  dripDraftBody: editDripBody1.trim(),
                  email: editEmail.trim() || l.email,
                }
              : l
          ),
        };
      });
      setSelectedLead(null);
      toast.success('All email sequence drafts saved successfully.');
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
    const poolList = Array.isArray((campaign as any).accounts) ? (campaign as any).accounts.map((a: any) => a.id) : [];
    setSettingsAccountIds(poolList.length > 0 ? poolList : (campaign.accountId ? [campaign.accountId] : []));
    setSettingsTargetRole(campaign.targetRole || '');
    setSettingsTargetLocation(campaign.targetLocation || '');
    setSettingsTargetIndustry(campaign.targetIndustry || '');
    setSettingsSearchQuery(campaign.searchQuery || '');
    setSettingsPromptInstructions(campaign.promptInstructions || '');
    setSettingsDripEnabled((campaign as any).dripEnabled || false);
    setSettingsDripDelayDays((campaign as any).dripDelayDays || 3);
    setSettingsDripSubject((campaign as any).dripSubject || '');
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
          accountId: settingsAccountIds[0] || settingsAccountId || null,
          accountIds: settingsAccountIds,
          targetRole: settingsTargetRole.trim() || undefined,
          targetLocation: settingsTargetLocation.trim() || undefined,
          targetIndustry: settingsTargetIndustry.trim() || undefined,
          searchQuery: settingsSearchQuery.trim() || undefined,
          promptInstructions: settingsPromptInstructions.trim() || undefined,
          dripEnabled: settingsDripEnabled,
          dripDelayDays: settingsDripDelayDays,
          dripSubject: settingsDripSubject.trim() || null,
        }),
      });

      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Failed to update campaign settings');

      setCampaign((prev) => (prev ? { ...prev, ...data } : data));
      setIsSettingsModalOpen(false);
      toast.success('Campaign settings & sender pool updated successfully!');
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

  function computeLeadIcpScore(lead: Lead): { score: number; label: string; badgeClass: string } {
    if (!campaign) return { score: 60, label: 'Moderate Match', badgeClass: 'bg-blue-50 text-blue-700 border-blue-200' };

    let score = 50; // Base score
    const targetRole = (campaign.targetRole || '').toLowerCase();
    const leadRole = (lead.jobTitle || '').toLowerCase();
    const targetLocation = (campaign.targetLocation || '').toLowerCase();
    const leadLocation = (lead.location || '').toLowerCase();

    // 1. Role / Seniority Match (up to +30 pts)
    if (targetRole && leadRole) {
      const roles = targetRole.split(/[,/|]/).map((r) => r.trim().toLowerCase());
      const matched = roles.some((r) => r.length > 2 && leadRole.includes(r));
      if (matched || leadRole.includes('founder') || leadRole.includes('owner') || leadRole.includes('ceo') || leadRole.includes('chief') || leadRole.includes('cto')) {
        score += 30;
      } else if (leadRole.includes('director') || leadRole.includes('vp') || leadRole.includes('head') || leadRole.includes('lead')) {
        score += 20;
      } else {
        score += 10;
      }
    }

    // 2. Location Match (+10 pts)
    if (targetLocation && leadLocation) {
      const locs = targetLocation.split(/[,/|]/).map((l) => l.trim().toLowerCase());
      if (locs.some((l) => l.length > 2 && leadLocation.includes(l))) {
        score += 10;
      }
    }

    // 3. Email presence (+10 pts)
    if (lead.email) {
      score += 10;
    }

    score = Math.min(score, 100);

    let label = 'Moderate';
    let badgeClass = 'bg-blue-50 text-blue-700 border-blue-200';
    if (score >= 85) {
      label = '🔥 High ICP Match';
      badgeClass = 'bg-emerald-50 text-emerald-800 border-emerald-300 font-bold';
    } else if (score >= 70) {
      label = '⭐ Strong Match';
      badgeClass = 'bg-indigo-50 text-indigo-700 border-indigo-200 font-semibold';
    }

    return { score, label, badgeClass };
  }

  function copyLeadsToClipboard(leads: Lead[], stepTitle: string) {
    if (leads.length === 0) {
      toast(`No leads to copy in ${stepTitle}`, { icon: 'ℹ️' });
      return;
    }
    const tsvHeader = ['Full Name', 'Job Title', 'Company', 'Email', 'Location', 'LinkedIn'].join('\t');
    const tsvRows = leads.map((l) => [
      l.fullName || '',
      l.jobTitle || '',
      l.companyName || '',
      l.email || '',
      l.location || '',
      l.linkedinUrl || '',
    ].join('\t'));
    const fullText = [tsvHeader, ...tsvRows].join('\n');
    navigator.clipboard.writeText(fullText).then(() => {
      toast.success(`Copied ${leads.length} leads to clipboard! (Ready to paste into Excel/Sheets)`, { icon: '📋' });
    }).catch(() => {
      toast.error('Failed to copy to clipboard');
    });
  }

  function exportStepCsv(leads: Lead[], filename: string) {
    if (leads.length === 0) {
      toast(`No leads to export`, { icon: 'ℹ️' });
      return;
    }
    const headers = ['Full Name', 'Job Title', 'Company', 'Company Domain', 'Email Address', 'Location', 'LinkedIn'];
    const rows = leads.map((l) => [
      `"${(l.fullName || '').replace(/"/g, '""')}"`,
      `"${(l.jobTitle || '').replace(/"/g, '""')}"`,
      `"${(l.companyName || '').replace(/"/g, '""')}"`,
      `"${(l.companyDomain || '').replace(/"/g, '""')}"`,
      `"${(l.email || '').replace(/"/g, '""')}"`,
      `"${(l.location || '').replace(/"/g, '""')}"`,
      `"${(l.linkedinUrl || '').replace(/"/g, '""')}"`,
    ]);
    const csvContent = '\uFEFF' + [headers.join(','), ...rows.map((r) => r.join(','))].join('\r\n');
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.setAttribute('download', `${filename}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
    toast.success(`Exported ${leads.length} leads to CSV!`);
  }

  const filteredLeads = allLeads
    .filter((l) => {
      if (filterStatus === 'MISSING_EMAIL') return !l.email;
      if (filterStatus === 'SAFE') return l.verifyStatus === 'SAFE';
      if (filterStatus === 'DRAFT_READY') return Boolean(l.aiDraftSubject);
      if (filterStatus === 'DISPATCHED') return l.status === 'DISPATCHED' || l.status === 'CONVERTED';
      return true;
    })
    .sort((a, b) => {
      const scoreA = computeLeadIcpScore(a).score;
      const scoreB = computeLeadIcpScore(b).score;
      return scoreB - scoreA; // Sort highest ICP score first (Point 11)
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
  let nextActionPrompt = 'Sourced leads ready. Click "Get Lead Emails" to discover corporate addresses.';
  let nextActionLabel = 'Get Lead Emails';
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
                disabled={Boolean(actionLoading) || loading || isPollingWorker || campaign.status === 'RUNNING'}
                className="px-3 py-2 hover:bg-slate-200 text-slate-800 text-xs font-semibold transition-colors disabled:opacity-50 flex items-center gap-1.5"
              >
                {actionLoading === 'scrape' || isPollingWorker || campaign.status === 'RUNNING' ? (
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
                disabled={Boolean(actionLoading) || loading || isPollingWorker || campaign.status === 'RUNNING'}
                className="bg-slate-200/80 hover:bg-slate-200 border-l border-slate-300 px-2 py-2 text-xs font-bold text-slate-800 focus:outline-none cursor-pointer disabled:opacity-50"
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

      {/* Background Scraping Active Live Indicator */}
      {(Boolean(actionLoading) || isPollingWorker || campaign.status === 'RUNNING') && (
        <div className="bg-indigo-50 border border-indigo-200 p-4 rounded-2xl flex items-center justify-between shadow-xs animate-pulse">
          <div className="flex items-center gap-3">
            <span className="relative flex h-3 w-3">
              <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-indigo-400 opacity-75"></span>
              <span className="relative inline-flex rounded-full h-3 w-3 bg-indigo-600"></span>
            </span>
            <div>
              <p className="text-xs font-bold text-indigo-900">
                {actionLoading ? 'Processing outreach request...' : 'Background lead discovery in progress...'}
              </p>
              <p className="text-[11px] text-indigo-700">
                Targeted leads are being extracted and populated automatically (Current: {allLeads.length} leads).
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={handleResetStatus}
              className="px-3 py-1.5 text-xs font-bold bg-rose-600 hover:bg-rose-700 text-white rounded-xl shadow-xs transition-colors flex items-center gap-1.5"
              title="Cancel active lead discovery or force unlock status"
            >
              <span>🛑</span>
              <span>Cancel Discovery</span>
            </button>
            <span className="text-[10px] font-bold px-2.5 py-1 rounded-full bg-indigo-100 text-indigo-800 flex items-center gap-1.5">
              <span className="w-1.5 h-1.5 rounded-full bg-indigo-600 animate-spin" />
              Live Sync Active
            </span>
          </div>
        </div>
      )}

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
              disabled={Boolean(actionLoading) || loading || isPollingWorker || campaign.status === 'RUNNING'}
              className={`px-4 py-2 text-xs font-bold rounded-xl transition-all shadow-md flex items-center gap-2 disabled:opacity-50 ${nextActionColor}`}
            >
              {actionLoading || isPollingWorker || campaign.status === 'RUNNING' ? (
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
          <div className={`p-3.5 rounded-xl border transition-all ${currentStepNumber === 1 ? 'bg-white/15 border-amber-400 ring-2 ring-amber-400/30' : allLeads.length > 0 ? 'bg-emerald-950/30 border-emerald-500/30' : 'bg-white/5 border-white/10'} flex flex-col justify-between`}>
            <div>
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
            <div className="flex items-center gap-1.5 mt-2 pt-1.5 border-t border-white/10">
              <button
                onClick={() => exportStepCsv(allLeads, `${campaign.name}_step1_sourced_leads`)}
                className="text-[10px] text-slate-300 hover:text-white px-1.5 py-0.5 rounded bg-white/5 hover:bg-white/10 flex items-center gap-1"
                title="Export Step 1 leads to CSV"
              >
                <span>📥 CSV</span>
              </button>
              <button
                onClick={() => copyLeadsToClipboard(allLeads, 'Step 1: Leads Sourced')}
                className="text-[10px] text-slate-300 hover:text-white px-1.5 py-0.5 rounded bg-white/5 hover:bg-white/10 flex items-center gap-1"
                title="Copy Step 1 leads to clipboard"
              >
                <span>📋 Copy</span>
              </button>
            </div>
          </div>

          {/* Step 2: Lead Emails */}
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
              <p className="text-xs font-semibold text-slate-200 mt-1">Lead Emails</p>
              <p className="text-lg font-bold text-indigo-300 mt-0.5">{leadsWithEmail} <span className="text-xs font-normal text-slate-400">/ {allLeads.length}</span></p>
            </div>
            <div>
              <button
                onClick={() => handleFindEmails()}
                disabled={Boolean(actionLoading) || missingEmailCount === 0 || allLeads.length === 0}
                className="mt-2 w-full py-1 bg-indigo-600 hover:bg-indigo-500 text-white text-[11px] font-semibold rounded-lg transition-colors flex items-center justify-center gap-1 disabled:opacity-40"
                title="Run pattern generator & domain lookup to find lead emails"
              >
                {actionLoading === 'find-emails' ? (
                  <span className="w-3 h-3 border-2 border-white border-t-transparent rounded-full animate-spin" />
                ) : missingEmailCount === 0 && allLeads.length > 0 ? (
                  <span>✓ All Found</span>
                ) : (
                  <span>📬 Get Emails</span>
                )}
              </button>
              <div className="flex items-center gap-1.5 mt-1.5 pt-1 border-t border-white/10">
                <button
                  onClick={() => exportStepCsv(allLeads.filter((l) => Boolean(l.email)), `${campaign.name}_step2_emails`)}
                  className="text-[10px] text-slate-300 hover:text-white px-1.5 py-0.5 rounded bg-white/5 hover:bg-white/10 flex items-center gap-1"
                  title="Export discovered emails to CSV"
                >
                  <span>📥 CSV</span>
                </button>
                <button
                  onClick={() => copyLeadsToClipboard(allLeads.filter((l) => Boolean(l.email)), 'Step 2: Lead Emails')}
                  className="text-[10px] text-slate-300 hover:text-white px-1.5 py-0.5 rounded bg-white/5 hover:bg-white/10 flex items-center gap-1"
                  title="Copy discovered emails to clipboard"
                >
                  <span>📋 Copy</span>
                </button>
              </div>
            </div>
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
            <div>
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
              <div className="flex items-center gap-1.5 mt-1.5 pt-1 border-t border-white/10">
                <button
                  onClick={() => exportStepCsv(allLeads.filter((l) => l.verifyStatus === 'SAFE'), `${campaign.name}_step3_safe_leads`)}
                  className="text-[10px] text-slate-300 hover:text-white px-1.5 py-0.5 rounded bg-white/5 hover:bg-white/10 flex items-center gap-1"
                  title="Export safe verified leads to CSV"
                >
                  <span>📥 CSV</span>
                </button>
                <button
                  onClick={() => copyLeadsToClipboard(allLeads.filter((l) => l.verifyStatus === 'SAFE'), 'Step 3: Safe Leads')}
                  className="text-[10px] text-slate-300 hover:text-white px-1.5 py-0.5 rounded bg-white/5 hover:bg-white/10 flex items-center gap-1"
                  title="Copy safe leads to clipboard"
                >
                  <span>📋 Copy</span>
                </button>
              </div>
            </div>
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
            <div>
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
              <div className="flex items-center gap-1.5 mt-1.5 pt-1 border-t border-white/10">
                <button
                  onClick={() => exportStepCsv(allLeads.filter((l) => Boolean(l.aiDraftSubject)), `${campaign.name}_step4_drafts`)}
                  className="text-[10px] text-slate-300 hover:text-white px-1.5 py-0.5 rounded bg-white/5 hover:bg-white/10 flex items-center gap-1"
                  title="Export drafted leads to CSV"
                >
                  <span>📥 CSV</span>
                </button>
                <button
                  onClick={() => copyLeadsToClipboard(allLeads.filter((l) => Boolean(l.aiDraftSubject)), 'Step 4: AI Drafts')}
                  className="text-[10px] text-slate-300 hover:text-white px-1.5 py-0.5 rounded bg-white/5 hover:bg-white/10 flex items-center gap-1"
                  title="Copy drafted leads to clipboard"
                >
                  <span>📋 Copy</span>
                </button>
              </div>
            </div>
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
            <div>
              <button
                onClick={() => openPushCrmModal()}
                disabled={Boolean(actionLoading) || uncommittedSafeDrafts === 0 || allLeads.length === 0}
                className="mt-2 w-full py-1 bg-amber-500 hover:bg-amber-400 text-slate-950 text-[11px] font-bold rounded-lg transition-colors flex items-center justify-center gap-1 disabled:opacity-40"
                title="Bridge verified leads into Kanban CRM Fresh leads column"
              >
                {actionLoading === 'push-crm' ? (
                  <span className="w-3 h-3 border-2 border-slate-900 border-t-transparent rounded-full animate-spin" />
                ) : uncommittedTotalLeads === 0 && allLeads.length > 0 ? (
                  <span>✓ All in CRM</span>
                ) : (
                  <span>📋 Push CRM</span>
                )}
              </button>
              <div className="flex items-center gap-1.5 mt-1.5 pt-1 border-t border-white/10">
                <button
                  onClick={() => exportStepCsv(allLeads.filter((l) => l.status === 'CONVERTED'), `${campaign.name}_step5_crm_leads`)}
                  className="text-[10px] text-slate-300 hover:text-white px-1.5 py-0.5 rounded bg-white/5 hover:bg-white/10 flex items-center gap-1"
                  title="Export CRM leads to CSV"
                >
                  <span>📥 CSV</span>
                </button>
                <button
                  onClick={() => copyLeadsToClipboard(allLeads.filter((l) => l.status === 'CONVERTED'), 'Step 5: CRM Leads')}
                  className="text-[10px] text-slate-300 hover:text-white px-1.5 py-0.5 rounded bg-white/5 hover:bg-white/10 flex items-center gap-1"
                  title="Copy CRM leads to clipboard"
                >
                  <span>📋 Copy</span>
                </button>
              </div>
            </div>
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
            {actionLoading === 'scrape' || isPollingWorker || campaign.status === 'RUNNING' ? (
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
                  disabled={Boolean(actionLoading) || loading || isPollingWorker || campaign.status === 'RUNNING'}
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
                  <th className="px-3 py-3 w-10 text-center">
                    <input
                      type="checkbox"
                      checked={isAllSelected}
                      onChange={() => toggleSelectAll(paginatedLeads)}
                      className="rounded border-slate-300 text-primary-600 focus:ring-primary-500 w-4 h-4 cursor-pointer"
                      title="Select / Deselect All on this page"
                    />
                  </th>
                  <th className="px-5 py-3">Lead & Organization Profile</th>
                  <th className="px-4 py-3">Corporate Email</th>
                  <th className="px-4 py-3 text-center">ICP Match Score</th>
                  <th className="px-4 py-3 text-right">CRM Pipeline</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {paginatedLeads.map((lead) => {
                  const isChecked = selectedIds.includes(lead.id);
                  const isFinding = rowLoading[`${lead.id}-find`];
                  const isPushing = rowLoading[`${lead.id}-push`];

                  return (
                    <tr
                      key={lead.id}
                      onClick={() => toggleSelectLead(lead.id)}
                      className={`transition-colors cursor-pointer ${
                        isChecked ? 'bg-primary-50/50' : 'hover:bg-slate-50/70'
                      }`}
                    >
                      {/* Checkbox */}
                      <td className="px-3 py-4 text-center" onClick={(e) => e.stopPropagation()}>
                        <input
                          type="checkbox"
                          checked={isChecked}
                          onChange={() => toggleSelectLead(lead.id)}
                          className="rounded border-slate-300 text-primary-600 focus:ring-primary-500 w-4 h-4 cursor-pointer"
                        />
                      </td>

                      {/* 4-Line Detailed Lead & Organization Layout */}
                      <td className="px-5 py-4">
                        <div className="space-y-1">
                          {/* Line 1: Full Name & Credentials */}
                          <div className="font-bold text-slate-900 text-sm tracking-tight flex items-center gap-2">
                            <span>{lead.fullName}</span>
                            {lead.status === 'CONVERTED' && (
                              <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-emerald-100 text-emerald-800 border border-emerald-200">
                                ✓ in CRM
                              </span>
                            )}
                          </div>

                          {/* Line 2: Full Job Title / Role (No truncation) */}
                          <div className="text-xs font-semibold text-indigo-950 leading-snug">
                            {lead.jobTitle || 'Decision Maker'}
                          </div>

                          {/* Line 3: Company & Direct Links */}
                          <div className="text-xs text-slate-700 flex items-center gap-2.5 flex-wrap pt-0.5">
                            <span className="font-bold text-slate-900">{lead.companyName || 'Enterprise'}</span>
                            {isValidWebsiteDomain(lead.companyDomain) && (
                              <a
                                href={lead.companyDomain!.startsWith('http') ? lead.companyDomain! : `https://${lead.companyDomain}`}
                                target="_blank"
                                rel="noreferrer"
                                className="inline-flex items-center gap-1 text-[11px] text-primary-600 hover:text-primary-800 font-semibold hover:underline"
                                title="Visit Official Company Website"
                                onClick={(e) => e.stopPropagation()}
                              >
                                <span>🌐 {lead.companyDomain!.replace(/^https?:\/\//, '').replace(/\/.*$/, '')}</span>
                                <span className="text-[9px]">↗</span>
                              </a>
                            )}
                            {lead.linkedinUrl && (
                              <a
                                href={lead.linkedinUrl.startsWith('http') ? lead.linkedinUrl : `https://${lead.linkedinUrl}`}
                                target="_blank"
                                rel="noreferrer"
                                className="inline-flex items-center gap-1 text-[11px] text-[#0077b5] hover:text-[#005582] font-semibold hover:underline"
                                title="Open Official LinkedIn Profile"
                                onClick={(e) => e.stopPropagation()}
                              >
                                <svg className="w-3.5 h-3.5 fill-current" viewBox="0 0 24 24">
                                  <path d="M19 3a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h14m-.5 15.5v-5.3a3.26 3.26 0 0 0-3.26-3.26c-.85 0-1.84.52-2.28 1.3v-1.11h-2.79v8.37h2.79v-4.93c0-.77.62-1.4 1.39-1.4a1.4 1.4 0 0 1 1.4 1.4v4.93h2.75M6.46 10.9v8.37H9.2V10.9H6.46M7.83 6.64a1.66 1.66 0 0 0-1.66 1.66 1.66 1.66 0 0 0 1.66 1.66 1.66 1.66 0 0 0 1.66-1.66c0-.92-.74-1.66-1.66-1.66Z" />
                                </svg>
                                <span>LinkedIn</span>
                                <span className="text-[9px]">↗</span>
                              </a>
                            )}
                          </div>

                          {/* Line 4: Location */}
                          {lead.location && (
                            <div className="text-[11px] text-slate-500 flex items-center gap-1 pt-0.5">
                              <span>📍</span>
                              <span>{lead.location}</span>
                            </div>
                          )}
                        </div>
                      </td>

                      {/* Email Address */}
                      <td className="px-4 py-4 font-mono text-xs text-slate-800" onClick={(e) => e.stopPropagation()}>
                        {lead.email ? (
                          <div className="flex items-center gap-1.5 flex-wrap">
                            <span className="font-semibold text-slate-900 select-all">{lead.email}</span>
                            <button
                              onClick={() => {
                                navigator.clipboard.writeText(lead.email!);
                                toast.success(`Copied ${lead.email} to clipboard!`);
                              }}
                              className="text-slate-400 hover:text-slate-700 text-xs p-1 rounded hover:bg-slate-100"
                              title="Copy email to clipboard"
                            >
                              📋
                            </button>
                          </div>
                        ) : (
                          <button
                            onClick={() => handleFindEmails([lead.id])}
                            disabled={isFinding}
                            className="px-2.5 py-1 bg-indigo-50 hover:bg-indigo-100 text-indigo-700 border border-indigo-200 text-xs font-bold rounded-lg transition-colors inline-flex items-center gap-1"
                          >
                            {isFinding ? (
                              <>
                                <span className="w-3 h-3 border-2 border-indigo-600 border-t-transparent rounded-full animate-spin" />
                                <span>Finding...</span>
                              </>
                            ) : (
                              <>
                                <span>📬</span>
                                <span>+ Get Email</span>
                              </>
                            )}
                          </button>
                        )}
                      </td>

                      {/* ICP Match Score */}
                      <td className="px-4 py-4 text-center" onClick={(e) => e.stopPropagation()}>
                        {(() => {
                          const { score, label, badgeClass } = computeLeadIcpScore(lead);
                          return (
                            <div className="inline-flex flex-col items-center gap-1">
                              <span className={`px-2.5 py-0.5 rounded-full text-[11px] border ${badgeClass}`}>
                                {label} ({score}%)
                              </span>
                              <div className="w-16 h-1.5 bg-slate-100 rounded-full overflow-hidden border border-slate-200">
                                <div
                                  className={`h-full rounded-full ${score >= 85 ? 'bg-emerald-500' : score >= 70 ? 'bg-indigo-500' : 'bg-blue-400'}`}
                                  style={{ width: `${score}%` }}
                                />
                              </div>
                            </div>
                          );
                        })()}
                      </td>

                      {/* CRM Status / Action */}
                      <td className="px-4 py-4 text-right whitespace-nowrap" onClick={(e) => e.stopPropagation()}>
                        {lead.status === 'CONVERTED' && lead.convertedCardId ? (
                          <Link
                            href={`/dashboard?cardId=${lead.convertedCardId}`}
                            className="px-3 py-1.5 bg-emerald-50 text-emerald-800 border border-emerald-300 text-xs font-bold rounded-xl hover:bg-emerald-100 transition-colors inline-flex items-center gap-1 shadow-2xs"
                            title="View Card on Kanban CRM Board"
                          >
                            <span>✓ In CRM</span>
                            <span className="text-[10px]">↗</span>
                          </Link>
                        ) : (
                          <button
                            onClick={() => openPushCrmModal([lead.id])}
                            disabled={isPushing}
                            className="px-3 py-1.5 bg-amber-50 hover:bg-amber-100 text-amber-900 border border-amber-300 text-xs font-bold rounded-xl transition-colors inline-flex items-center gap-1 shadow-2xs disabled:opacity-40"
                            title="Push directly into Kanban CRM Fresh leads column"
                          >
                            <span>📋</span>
                            <span>Push CRM</span>
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
            <div className="p-3.5 bg-indigo-50/80 border border-indigo-100 rounded-xl text-xs space-y-1.5">
              <div className="flex items-center justify-between font-bold text-indigo-950">
                <span>Eligible Leads to Push:</span>
                <span className="bg-indigo-600 text-white px-2 py-0.5 rounded-full text-[11px]">
                  {crmTargetLeadIds.length} Leads
                </span>
              </div>
              <p className="text-[11px] text-indigo-700/80">
                Leads are saved into your Kanban board under <strong>&quot;Fresh leads&quot;</strong>.
              </p>
              <div className="pt-1.5 border-t border-indigo-100/80 text-[11px] font-semibold text-emerald-800 flex items-center gap-1">
                <span>🛡️</span>
                <span>Safe Mode Active: Pushing will NOT send emails. Leads remain as pending drafts until you review and click &quot;Start Sending All&quot;.</span>
              </div>
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

            {/* Sequence Tabs for Initial + 3 Follow-ups (Point 13) */}
            <div className="flex items-center gap-1.5 border-b border-slate-200 pb-2 overflow-x-auto">
              <button
                type="button"
                onClick={() => setActiveDraftTab(0)}
                className={`px-3 py-1.5 rounded-xl text-xs font-bold transition-all cursor-pointer ${
                  activeDraftTab === 0
                    ? 'bg-primary-600 text-white shadow-2xs'
                    : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                }`}
              >
                ✉️ Initial Cold Email
              </button>
              <button
                type="button"
                onClick={() => setActiveDraftTab(1)}
                className={`px-3 py-1.5 rounded-xl text-xs font-bold transition-all cursor-pointer ${
                  activeDraftTab === 1
                    ? 'bg-indigo-600 text-white shadow-2xs'
                    : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                }`}
              >
                ⚡ Follow-Up #1
              </button>
              {(campaign?.dripStepsCount || 1) >= 2 && (
                <button
                  type="button"
                  onClick={() => setActiveDraftTab(2)}
                  className={`px-3 py-1.5 rounded-xl text-xs font-bold transition-all cursor-pointer ${
                    activeDraftTab === 2
                      ? 'bg-indigo-600 text-white shadow-2xs'
                      : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                  }`}
                >
                  ⚡ Follow-Up #2
                </button>
              )}
              {(campaign?.dripStepsCount || 1) >= 3 && (
                <button
                  type="button"
                  onClick={() => setActiveDraftTab(3)}
                  className={`px-3 py-1.5 rounded-xl text-xs font-bold transition-all cursor-pointer ${
                    activeDraftTab === 3
                      ? 'bg-indigo-600 text-white shadow-2xs'
                      : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                  }`}
                >
                  ⚡ Follow-Up #3 (Closing)
                </button>
              )}
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
                  <label className="block text-xs font-semibold text-slate-700">
                    {activeDraftTab === 0
                      ? 'Subject Line (Initial Outreach)'
                      : `Subject Line (Follow-up #${activeDraftTab})`}
                  </label>
                  {activeDraftTab === 0 && Boolean(selectedLead.metadata && (selectedLead.metadata as any).alternativeSubject) && (
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
                  value={
                    activeDraftTab === 0
                      ? editSubject
                      : activeDraftTab === 1
                      ? editDripSubject1
                      : activeDraftTab === 2
                      ? editDripSubject2
                      : editDripSubject3
                  }
                  onChange={(e) => {
                    const val = e.target.value;
                    if (activeDraftTab === 0) setEditSubject(val);
                    else if (activeDraftTab === 1) setEditDripSubject1(val);
                    else if (activeDraftTab === 2) setEditDripSubject2(val);
                    else if (activeDraftTab === 3) setEditDripSubject3(val);
                  }}
                  className="w-full px-3 py-2 border border-slate-300 rounded-xl text-xs focus:outline-none focus:ring-2 focus:ring-primary-500 font-semibold text-slate-800"
                />
              </div>

              {/* Custom AI Regeneration Guidance */}
              {activeDraftTab === 0 && (
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
              )}

              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">
                  {activeDraftTab === 0
                    ? 'Email Pitch Body (Initial Touch)'
                    : `Follow-up Message Body (Step #${activeDraftTab})`}
                </label>
                <textarea
                  rows={7}
                  value={
                    activeDraftTab === 0
                      ? editBody
                      : activeDraftTab === 1
                      ? editDripBody1
                      : activeDraftTab === 2
                      ? editDripBody2
                      : editDripBody3
                  }
                  onChange={(e) => {
                    const val = e.target.value;
                    if (activeDraftTab === 0) setEditBody(val);
                    else if (activeDraftTab === 1) setEditDripBody1(val);
                    else if (activeDraftTab === 2) setEditDripBody2(val);
                    else if (activeDraftTab === 3) setEditDripBody3(val);
                  }}
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
                  <div className="sm:col-span-3 space-y-2 pt-1">
                    <div className="flex items-center justify-between">
                      <label className="block text-[11px] font-bold text-slate-800">
                        📬 Rotated Sender Mailboxes ({settingsAccountIds.length}/{outreachAccounts.length} in Pool)
                      </label>
                      {outreachAccounts.length > 0 && (
                        <button
                          type="button"
                          onClick={() => {
                            if (settingsAccountIds.length === outreachAccounts.length) {
                              setSettingsAccountIds([]);
                            } else {
                              setSettingsAccountIds(outreachAccounts.map((a) => a.id));
                            }
                          }}
                          className="text-[10px] text-primary-600 hover:text-primary-800 font-semibold"
                        >
                          {settingsAccountIds.length === outreachAccounts.length ? 'Deselect All' : 'Select All Active'}
                        </button>
                      )}
                    </div>
                    {outreachAccounts.length === 0 ? (
                      <p className="text-[11px] text-slate-400">No sender accounts configured.</p>
                    ) : (
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 max-h-40 overflow-y-auto p-1">
                        {outreachAccounts.map((acc: any) => {
                          const isChecked = settingsAccountIds.includes(acc.id);
                          return (
                            <div
                              key={acc.id}
                              onClick={() => {
                                if (isChecked) {
                                  setSettingsAccountIds(settingsAccountIds.filter((id) => id !== acc.id));
                                } else {
                                  setSettingsAccountIds([...settingsAccountIds, acc.id]);
                                }
                              }}
                              className={`p-2 rounded-lg border text-xs cursor-pointer transition-all flex items-center justify-between ${
                                isChecked
                                  ? 'bg-primary-50 border-primary-300 ring-1 ring-primary-300'
                                  : 'bg-white border-slate-200 hover:bg-slate-50'
                              }`}
                            >
                              <div className="min-w-0 flex-1 pr-2">
                                <p className="font-bold text-slate-900 truncate text-[11px]">{acc.name}</p>
                                <p className="text-[10px] font-mono text-slate-500 truncate">{acc.senderEmail}</p>
                                <p className="text-[9px] text-slate-400">Limit: {acc.sentToday}/{acc.warmupEnabled ? acc.currentWarmupLimit : acc.dailyLimit}/d</p>
                              </div>
                              <input
                                type="checkbox"
                                checked={isChecked}
                                onChange={() => {}}
                                className="w-3.5 h-3.5 text-primary-600 rounded border-slate-300 pointer-events-none"
                              />
                            </div>
                          );
                        })}
                      </div>
                    )}
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

              {/* 4. Automated Drip Follow-Up Sequence */}
              <div className="space-y-3 p-4 bg-slate-50/70 rounded-xl border border-slate-200/80">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <input
                      type="checkbox"
                      id="modalDripToggle"
                      checked={settingsDripEnabled}
                      onChange={(e) => setSettingsDripEnabled(e.target.checked)}
                      className="w-4 h-4 rounded border-slate-300 text-primary-600 focus:ring-primary-500"
                    />
                    <div>
                      <label htmlFor="modalDripToggle" className="text-xs font-bold text-slate-900 cursor-pointer flex items-center gap-1.5">
                        <span>⚡</span>
                        <span>Automated Step-2 Follow-up Sequence</span>
                      </label>
                      <p className="text-[10px] text-slate-500">
                        Automatically sends a polite follow-up email if the prospect has not replied after several days.
                      </p>
                    </div>
                  </div>
                </div>

                {settingsDripEnabled && (
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-2 border-t border-slate-200/60 animate-in fade-in">
                    <div>
                      <label className="block text-[11px] font-semibold text-slate-700 mb-1">
                        Follow-up Delay (Days)
                      </label>
                      <select
                        value={settingsDripDelayDays}
                        onChange={(e) => setSettingsDripDelayDays(Number(e.target.value))}
                        className="w-full px-3 py-2 bg-white border border-slate-300 rounded-xl text-xs focus:ring-2 focus:ring-primary-500"
                      >
                        <option value={1}>After 1 Day</option>
                        <option value={2}>After 2 Days</option>
                        <option value={3}>After 3 Days (Recommended)</option>
                        <option value={5}>After 5 Days</option>
                        <option value={7}>After 7 Days</option>
                      </select>
                    </div>

                    <div>
                      <label className="block text-[11px] font-semibold text-slate-700 mb-1">
                        Follow-up Subject (Optional)
                      </label>
                      <input
                        type="text"
                        placeholder="e.g. Re: Quick follow up (defaults to Re: Original Subject)"
                        value={settingsDripSubject}
                        onChange={(e) => setSettingsDripSubject(e.target.value)}
                        className="w-full px-3 py-2 bg-white border border-slate-300 rounded-xl text-xs focus:ring-2 focus:ring-primary-500"
                      />
                    </div>
                  </div>
                )}
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

      {/* Sticky Bottom Lead Selection Action Bar (UX Improvement for Lead Selection) */}
      {selectedIds.length > 0 && (
        <div className="fixed bottom-6 left-1/2 -translate-x-1/2 z-40 bg-slate-900/95 backdrop-blur-md text-white px-5 py-3 rounded-2xl shadow-2xl border border-slate-700/80 flex items-center gap-3 sm:gap-4 animate-in slide-in-from-bottom-5 max-w-[95vw] overflow-x-auto">
          <div className="flex items-center gap-2 flex-shrink-0">
            <span className="w-6 h-6 rounded-full bg-indigo-600 text-white flex items-center justify-center text-xs font-bold shadow-2xs">
              {selectedIds.length}
            </span>
            <span className="text-xs font-semibold text-slate-200">
              Leads Selected
            </span>
          </div>

          <div className="h-4 w-px bg-slate-700 flex-shrink-0" />

          <button
            onClick={() => openPushCrmModal(selectedIds)}
            disabled={Boolean(actionLoading)}
            className="px-4 py-1.5 bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-bold rounded-xl transition-all shadow-xs flex items-center gap-1.5 cursor-pointer disabled:opacity-50 flex-shrink-0"
          >
            <span>📋</span>
            <span>Push {selectedIds.length} to CRM (Fresh leads)</span>
          </button>

          <button
            onClick={() => handleFindEmails(selectedIds)}
            disabled={Boolean(actionLoading)}
            className="px-3.5 py-1.5 bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-semibold rounded-xl transition-all shadow-xs flex items-center gap-1.5 cursor-pointer disabled:opacity-50 flex-shrink-0"
          >
            <span>📬</span>
            <span>Get Emails</span>
          </button>

          <button
            onClick={() => copyLeadsToClipboard(selectedLeadsList, 'Selected Leads')}
            className="px-3 py-1.5 bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs font-medium rounded-xl transition-all flex items-center gap-1 flex-shrink-0"
            title="Copy selected leads to clipboard"
          >
            <span>📋 Copy</span>
          </button>

          <button
            onClick={clearSelection}
            className="text-xs text-slate-400 hover:text-white transition-colors underline ml-1 flex-shrink-0 cursor-pointer"
          >
            Deselect
          </button>
        </div>
      )}
    </div>
  );
}
