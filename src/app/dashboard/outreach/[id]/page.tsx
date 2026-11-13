'use client';

import { useEffect, useState, useRef } from 'react';
import { useParams, useSearchParams, useRouter } from 'next/navigation';
import Link from 'next/link';
import ConfirmDialog, { type ConfirmDialogVariant } from '@/components/ui/ConfirmDialog';
import { estimateLeadSearchCost, formatUsdCost } from '@/lib/treg-billing';
import toast from 'react-hot-toast';

interface OutreachRunLog {
  id: string;
  step: string;
  provider: string;
  status: string;
  itemsRequested: number;
  itemsProcessed: number;
  itemsSaved: number;
  estimatedCostUsd: number;
  actualCostUsd: number;
  balanceBeforeUsd?: number | null;
  balanceAfterUsd?: number | null;
  costSource: string;
  metadata?: Record<string, any> | null;
  startedAt: string;
  completedAt?: string | null;
}

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
  totalCostUsd?: number;
  activeRun?: OutreachRunLog | null;
  runLogs?: OutreachRunLog[];
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

function getLeadInitials(name: string): string {
  const parts = (name || 'Lead').trim().split(/\s+/);
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
}

const AVATAR_GRADIENTS = [
  'from-blue-600 to-indigo-600',
  'from-emerald-600 to-teal-600',
  'from-violet-600 to-purple-600',
  'from-amber-500 to-orange-600',
  'from-rose-500 to-pink-600',
  'from-cyan-600 to-blue-600',
];

function getAvatarGradient(name: string): string {
  let hash = 0;
  for (let i = 0; i < (name || '').length; i++) hash = name.charCodeAt(i) + ((hash << 5) - hash);
  return AVATAR_GRADIENTS[Math.abs(hash) % AVATAR_GRADIENTS.length];
}

function sanitizeLeadCompany(company?: string | null): string {
  if (!company) return 'Independent';
  const clean = company.trim();
  // Strip trailing ellipsis or web protocol prefixes, but retain actual company name
  const formatted = clean.replace(/\.{2,}$/, '').replace(/^https?:\/\//i, '').trim();
  return formatted || 'Independent';
}

function extractLeadBioSummary(lead: { fullName: string; jobTitle?: string | null; companyName?: string | null; metadata?: any }) {
  const summary = (lead.metadata as any)?.summary || '';
  if (!summary) return { shortSnippet: '', fullBio: '' };

  let clean = summary
    .replace(/\.{2,}\s*Read more/gi, '')
    .replace(/Read more/gi, '')
    .replace(/\s+/g, ' ')
    .trim();

  // Strip leading repetitive name if bio starts with it
  if (lead.fullName && clean.toLowerCase().startsWith(lead.fullName.toLowerCase())) {
    clean = clean.slice(lead.fullName.length).replace(/^[.\s·|:-]+/, '').trim();
  }

  const shortSnippet = clean.length > 135 
    ? clean.slice(0, 130).replace(/\s+\S*$/, '') + '...' 
    : clean;

  return { shortSnippet, fullBio: clean };
}

export default function CampaignWorkspacePage({
  params,
}: {
  params?: { id?: string } | Promise<{ id?: string }>;
}) {
  const router = useRouter();
  const routeParams = useParams();
  const campaignId = (routeParams?.id as string) || (params as any)?.id || '';
  const searchParams = useSearchParams();
  const autoSourceTriggered = useRef(false);

  const [campaign, setCampaign] = useState<CampaignDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [actionLoading, setActionLoading] = useState('');
  const [rowLoading, setRowLoading] = useState<Record<string, boolean>>({});
  const [exportingCsv, setExportingCsv] = useState(false);
  const [sourceBatchSize, setSourceBatchSize] = useState(10);
  const [sourceProvider, setSourceProvider] = useState<'treg' | 'outscraper' | 'apify'>('treg');

  // Selection state for Checkboxes
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [expandedBioIds, setExpandedBioIds] = useState<Record<string, boolean>>({});

  // Pagination & Filtering
  const [currentPage, setCurrentPage] = useState(1);
  const pageSize = 15;
  const [filterStatus, setFilterStatus] = useState('ALL');

  // Push to CRM Modal State (with Board & Column selection, Inline Board Creator & Success Feedback)
  const [isPushCrmModalOpen, setIsPushCrmModalOpen] = useState(false);
  const [crmTargetLeadIds, setCrmTargetLeadIds] = useState<string[]>([]);
  const [boardsList, setBoardsList] = useState<BoardOption[]>([]);
  const [selectedBoardId, setSelectedBoardId] = useState('');
  const [selectedColumnId, setSelectedColumnId] = useState('');
  const [isCreatingBoardInline, setIsCreatingBoardInline] = useState(false);
  const [newBoardTitle, setNewBoardTitle] = useState('');
  const [creatingBoard, setCreatingBoard] = useState(false);
  const [pushSuccessData, setPushSuccessData] = useState<{
    boardId: string;
    boardTitle: string;
    columnTitle: string;
    count: number;
  } | null>(null);

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
  const [settingsDripDelayDays, setSettingsDripDelayDays] = useState(7);
  const [settingsDripSubject, setSettingsDripSubject] = useState('');
  const [savingSettings, setSavingSettings] = useState(false);
  const [outreachAccounts, setOutreachAccounts] = useState<any[]>([]);

  // Background worker polling state
  const [isPollingWorker, setIsPollingWorker] = useState(false);

  // Live Engine Balance & Cost History state
  const [engineBalance, setEngineBalance] = useState<{
    configured: boolean;
    balanceUsd: number;
    lowBalanceWarning: boolean;
    criticalBalanceWarning: boolean;
  } | null>(null);
  const [showRunHistory, setShowRunHistory] = useState(true);

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

  async function fetchEngineBalance(refresh = false) {
    try {
      const res = await fetch(`/api/outreach/billing${refresh ? '?refresh=1' : ''}`);
      if (res.ok) {
        const data = await res.json();
        if (data?.balance) setEngineBalance(data.balance);
      }
    } catch {
      // ignore non-blocking balance poll error
    }
  }

  useEffect(() => {
    fetch('/api/outreach/accounts')
      .then((r) => r.json())
      .then((data) => {
        const list = Array.isArray(data) ? data : data.accounts || [];
        setOutreachAccounts(list);
      })
      .catch((e) => console.error('Failed to load accounts:', e));

    fetchEngineBalance();
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
            const lastRun = loaded.runLogs?.[0];
            const costSuffix = lastRun ? ` • Run Cost: ${formatUsdCost(lastRun.actualCostUsd)}` : '';
            toast.success(`🎉 Background sourcing complete! Total ${loaded.leads?.length || 0} leads collected${costSuffix}.`);
            fetchEngineBalance(true);
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
      const provider = customProvider || sourceProvider || searchParams?.get('provider') || 'treg';
      const res = await fetch(`/api/outreach/campaigns/${campaignId}/scrape`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ limit: customLimit || 10, provider }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Failed to source leads');
      if (data.queued) {
        setIsPollingWorker(true);
        const estText = data.estimatedCostUsd !== undefined ? ` (Est. Cost: ${formatUsdCost(data.estimatedCostUsd)})` : '';
        toast.success(`${data.message || `Sourcing ${customLimit || 10} leads queued in background worker.`}${estText}`);
      } else if (data.count === 0 && data.skippedDuplicates > 0) {
        const costText = data.costUsd !== undefined ? ` • Cost: ${formatUsdCost(data.costUsd)}` : '';
        toast(`ℹ️ No new leads found. (${data.skippedDuplicates} duplicates skipped)${costText}`, { icon: '🔍' });
      } else {
        const costInfo = data.costUsd !== undefined ? ` • Cost: ${formatUsdCost(data.costUsd)}` : '';
        const balInfo = typeof data.balanceAfterUsd === 'number' ? ` • Balance: ${formatUsdCost(data.balanceAfterUsd)}` : '';
        toast.success(`Successfully sourced ${data.count} targeted prospects (${data.skippedDuplicates || 0} duplicates skipped)${costInfo}${balInfo}.`);
      }
      await fetchCampaign();
      fetchEngineBalance(true);
    } catch (err: any) {
      const rawMsg = err.message || 'Lead sourcing failed';
      const cleanMsg = rawMsg.startsWith('{') || rawMsg.includes('{"') || rawMsg.includes('SyntaxError')
        ? 'Lead sourcing could not be completed. Please adjust search criteria or choose an alternative provider.'
        : rawMsg;
      toast.error(cleanMsg);
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
      toast.success('Search cancelled and status reset to DRAFT!');
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
      if (!res.ok) throw new Error(data.error || 'Failed to find lead emails');
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
        toast.success(data.message || `Verification for ${data.totalProcessed || 'leads'} queued in background worker.`);
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
    setPushSuccessData(null);
    setIsCreatingBoardInline(false);
    const ids = targetLeadIds || (selectedIds.length > 0 ? selectedIds : undefined);
    const eligibleLeads = (campaign?.leads || []).filter(
      (l) => l.status !== 'CONVERTED' && (!ids || ids.includes(l.id)) && Boolean(l.email) && l.verifyStatus !== 'INVALID'
    );

    if (eligibleLeads.length === 0) {
      toast.error('No uncommitted leads with verified emails available to push to CRM.');
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

  async function handleCreateNewBoardInline() {
    const title = newBoardTitle.trim() || `${campaign?.name || 'Outreach'} Board`;
    setCreatingBoard(true);
    try {
      const res = await fetch('/api/boards', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ title }),
      });
      if (!res.ok) throw new Error('Failed to create board');
      const newBoard = await res.json();
      setBoardsList((prev) => [newBoard, ...prev]);
      setSelectedBoardId(newBoard.id);
      const cols = newBoard.columns || [];
      const leadsCol = cols.find((c: any) => c.title.toLowerCase() === 'fresh leads') || cols.find((c: any) => c.title.toLowerCase() === 'leads') || cols[0];
      if (leadsCol) setSelectedColumnId(leadsCol.id);
      setIsCreatingBoardInline(false);
      setNewBoardTitle('');
      toast.success(`Board "${newBoard.title}" created successfully!`);
    } catch (err: any) {
      toast.error(`Error creating board: ${err.message}`);
    } finally {
      setCreatingBoard(false);
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
      const targetBoard = boardsList.find((b) => b.id === selectedBoardId);
      const targetCol = targetBoard?.columns?.find((c: any) => c.id === selectedColumnId);
      setPushSuccessData({
        boardId: selectedBoardId,
        boardTitle: targetBoard?.title || 'Target Board',
        columnTitle: targetCol?.title || 'Fresh leads',
        count,
      });
      clearSelection();
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
        'Profile Summary',
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
        `"${((l.metadata as any)?.summary || '').replace(/"/g, '""')}"`,
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
    setSettingsDripDelayDays((campaign as any).dripDelayDays || 7);
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
  const uncommittedTotalLeads = allLeads.filter((l) => l.status !== 'CONVERTED' && Boolean(l.email)).length;
  const isActionLocked = Boolean(actionLoading) || isPollingWorker || campaign.status === 'RUNNING';

  function computeLeadIcpScore(lead: Lead): { score: number; label: string; badgeClass: string; matchFactors: string[] } {
    const matchFactors: string[] = [];
    if (!campaign) {
      return {
        score: 60,
        label: 'Moderate Match',
        badgeClass: 'bg-blue-50 text-blue-700 border-blue-200 dark:bg-blue-950/40 dark:text-blue-300 dark:border-blue-800',
        matchFactors: ['Profile Verified'],
      };
    }

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
        matchFactors.push('Executive Role');
      } else if (leadRole.includes('director') || leadRole.includes('vp') || leadRole.includes('head') || leadRole.includes('lead')) {
        score += 20;
        matchFactors.push('Leadership');
      } else {
        score += 10;
        matchFactors.push('Role Match');
      }
    } else if (leadRole) {
      score += 15;
      matchFactors.push('Role Verified');
    }

    // 2. Location Match (+10 pts)
    if (targetLocation && leadLocation) {
      const locs = targetLocation.split(/[,/|]/).map((l) => l.trim().toLowerCase());
      if (locs.some((l) => l.length > 2 && leadLocation.includes(l))) {
        score += 10;
        matchFactors.push('Target Geo');
      }
    } else if (leadLocation) {
      score += 5;
      matchFactors.push('Geo Verified');
    }

    // 3. Email presence (+10 pts)
    if (lead.email) {
      score += 10;
      matchFactors.push('Corporate Email');
    }

    score = Math.min(score, 100);

    let label = 'Moderate';
    let badgeClass = 'bg-slate-50 text-slate-700 border-slate-200 dark:bg-slate-800 dark:text-slate-300 dark:border-slate-700 font-medium';
    if (score >= 85) {
      label = 'High Match';
      badgeClass = 'bg-emerald-50 text-emerald-800 border-emerald-300 dark:bg-emerald-950/40 dark:text-emerald-300 dark:border-emerald-800 font-bold';
    } else if (score >= 70) {
      label = 'Strong Match';
      badgeClass = 'bg-indigo-50 text-indigo-700 border-indigo-200 dark:bg-indigo-950/40 dark:text-indigo-300 dark:border-indigo-800 font-semibold';
    }

    return { score, label, badgeClass, matchFactors };
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
      if (filterStatus === 'WITH_EMAIL') return Boolean(l.email);
      if (filterStatus === 'MISSING_EMAIL') return !l.email;
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
  const selectedUncommittedSafe = selectedLeadsList.filter((l) => l.status !== 'CONVERTED' && l.verifyStatus !== 'INVALID').length;

  // Determine current active wizard step & Next-Best-Action (NBA) button (3 sleek steps)
  let currentStepNumber = 1;
  let nextActionPrompt = 'Sourced leads ready. Click "Get Corporate Emails" to discover business addresses.';
  let nextActionLabel = 'Get Lead Emails';
  let nextActionHandler: () => void | Promise<void> = async () => { await handleFindEmails(); };
  let nextActionColor = 'bg-indigo-600 hover:bg-indigo-700';

  if (selectedIds.length > 0) {
    // Selection-specific contextual action
    if (selectedMissingEmail > 0) {
      currentStepNumber = 2;
      nextActionPrompt = `Selected Batch: ${selectedMissingEmail} of ${selectedIds.length} checked leads need corporate email discovery.`;
      nextActionLabel = `Get Corporate Emails (${selectedIds.length} Selected)`;
      nextActionHandler = async () => { await handleFindEmails(selectedIds); };
      nextActionColor = 'bg-indigo-600 hover:bg-indigo-700';
    } else {
      currentStepNumber = 3;
      nextActionPrompt = `Selected Batch: Ready to push ${selectedIds.length} leads directly into Kanban CRM.`;
      nextActionLabel = `Push ${selectedIds.length} Selected to CRM`;
      nextActionHandler = () => { openPushCrmModal(selectedIds); };
      nextActionColor = 'bg-emerald-600 hover:bg-emerald-700 text-white';
    }
  } else {
    // Global Pipeline Progression
    if (allLeads.length === 0) {
      currentStepNumber = 1;
      nextActionPrompt = 'Start by sourcing targeted prospects from LinkedIn matching your ICP criteria.';
      nextActionLabel = 'Source Target Leads';
      nextActionHandler = async () => { await handleSourceLeads(); };
      nextActionColor = 'bg-blue-600 hover:bg-blue-700';
    } else if (leadsWithEmail === 0 && missingEmailCount > 0) {
      currentStepNumber = 2;
      nextActionPrompt = `Step 2: ${missingEmailCount} leads need email discovery. Click to extract business emails.`;
      nextActionLabel = `Get Lead Emails (${missingEmailCount})`;
      nextActionHandler = async () => { await handleFindEmails(); };
      nextActionColor = 'bg-indigo-600 hover:bg-indigo-700';
    } else if (uncommittedTotalLeads > 0) {
      currentStepNumber = 3;
      nextActionPrompt = `Step 3: ${uncommittedTotalLeads} verified leads ready. Push into Kanban CRM pipeline.`;
      nextActionLabel = `Push ${uncommittedTotalLeads} Leads to CRM`;
      nextActionHandler = () => { openPushCrmModal(); };
      nextActionColor = 'bg-emerald-600 hover:bg-emerald-700 text-white';
    } else if (convertedLeads > 0 && uncommittedTotalLeads === 0) {
      currentStepNumber = 3;
      nextActionPrompt = 'Pipeline fully executed! All verified leads are active in Kanban CRM.';
      nextActionLabel = 'View Kanban CRM Board';
      nextActionHandler = () => { router.push('/dashboard'); };
      nextActionColor = 'bg-emerald-600 hover:bg-emerald-700';
    }
  }

  // Selected lead index for modal navigation
  const currentModalIndex = selectedLead ? filteredLeads.findIndex((l) => l.id === selectedLead.id) : -1;

  return (
    <div className="p-4 sm:p-6 lg:p-8 space-y-6 max-w-7xl mx-auto">
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
      <div className="bg-white dark:bg-slate-900 p-6 rounded-2xl border border-slate-200/80 dark:border-slate-800 shadow-xs space-y-4">
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
          <div>
            <Link
              href="/dashboard/outreach"
              className="text-xs font-semibold text-primary-600 dark:text-primary-400 hover:text-primary-800 flex items-center gap-1 mb-1"
            >
              ← Back to Outreach Campaigns
            </Link>
            <div className="flex flex-wrap items-center gap-2.5">
              <h1 className="text-xl font-bold text-slate-900 dark:text-slate-100 tracking-tight">{campaign.name}</h1>
              <span className="px-2.5 py-0.5 rounded-full text-[11px] font-bold bg-primary-50 dark:bg-primary-950/60 text-primary-700 dark:text-primary-300 border border-primary-200/60 dark:border-primary-800/60">
                {campaign.status}
              </span>
              <span
                className="px-2.5 py-0.5 rounded-full text-[11px] font-bold bg-amber-50 text-amber-800 border border-amber-200/80 font-mono"
                title="Total accumulated cost across all progress runs in this campaign"
              >
                💳 Campaign Cost: {formatUsdCost(campaign.totalCostUsd || 0)}
              </span>
              {engineBalance?.configured && (
                <button
                  type="button"
                  onClick={() => fetchEngineBalance(true)}
                  title="Click to refresh live B2B Verified Database credit balance"
                  className={`px-2.5 py-0.5 rounded-full text-[11px] font-bold border font-mono transition-colors ${
                    engineBalance.criticalBalanceWarning
                      ? 'bg-rose-50 text-rose-800 border-rose-200 hover:bg-rose-100'
                      : engineBalance.lowBalanceWarning
                      ? 'bg-amber-50 text-amber-800 border-amber-200 hover:bg-amber-100'
                      : 'bg-emerald-50 text-emerald-800 border-emerald-200 hover:bg-emerald-100'
                  }`}
                >
                  Database Balance: {formatUsdCost(engineBalance.balanceUsd)}
                  {engineBalance.lowBalanceWarning ? ' ⚠️ Low' : ''}
                </button>
              )}
            </div>
            <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">
              Target: <span className="font-semibold text-slate-700 dark:text-slate-300">{campaign.targetRole || 'Executives'}</span> in{' '}
              <span className="font-semibold text-slate-700 dark:text-slate-300">{campaign.targetLocation || 'Global'}</span> • Sender:{' '}
              <span className="font-semibold text-slate-700 dark:text-slate-300">{campaign.account?.senderEmail || 'Default JetDigitalPro Mailer'}</span>
            </p>
          </div>

          {/* Quick Utility Tools */}
          <div className="flex flex-wrap items-center gap-2">
            <button
              onClick={openSettingsModal}
              className="px-3 py-2 bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-300 border border-slate-200/90 dark:border-slate-700 text-xs font-bold rounded-xl transition-colors flex items-center gap-1.5 shadow-2xs"
              title="Edit Campaign identity, targeting parameters, and AI copywriting prompt"
            >
              <span>⚙️</span>
              <span>Campaign Settings</span>
            </button>
            <button
              onClick={() => setIsTestSendOpen(true)}
              disabled={Boolean(actionLoading) || loading}
              className="px-3 py-2 bg-amber-50 dark:bg-amber-950/40 hover:bg-amber-100 dark:hover:bg-amber-900/60 text-amber-900 dark:text-amber-300 border border-amber-300 dark:border-amber-800 text-xs font-bold rounded-xl transition-colors flex items-center gap-1.5 shadow-2xs disabled:opacity-50"
              title="Kirim 1 email uji coba ke inbox pribadi sebelum kirim massal"
            >
              <span>Send Test Email</span>
            </button>
            <button
              onClick={() => setIsAddLeadOpen(true)}
              disabled={Boolean(actionLoading) || loading}
              className="px-3 py-2 bg-emerald-50 dark:bg-emerald-950/40 hover:bg-emerald-100 dark:hover:bg-emerald-900/60 text-emerald-800 dark:text-emerald-300 border border-emerald-300 dark:border-emerald-800 text-xs font-bold rounded-xl transition-colors flex items-center gap-1.5 shadow-2xs disabled:opacity-50"
            >
              <span>➕</span>
              <span>Add Custom Lead</span>
            </button>
            {/* Source More Leads with Provider & Batch Selector */}
            <div className="inline-flex rounded-xl shadow-2xs border border-slate-200 bg-slate-100 overflow-hidden">
              <select
                value={sourceProvider}
                onChange={(e) => setSourceProvider(e.target.value as any)}
                disabled={Boolean(actionLoading) || loading || isPollingWorker || campaign.status === 'RUNNING'}
                className="bg-white dark:bg-slate-800 hover:bg-slate-50 dark:hover:bg-slate-750 px-2.5 py-2 text-xs font-bold text-slate-800 dark:text-slate-200 border-r border-slate-200 dark:border-slate-700 focus:outline-none cursor-pointer disabled:opacity-50"
                title="Select Lead Discovery Mode"
              >
                <option value="treg">B2B Verified Database (Recommended)</option>
                <option value="outscraper">Business Directory Search</option>
                <option value="apify">Executive Network Discovery</option>
              </select>
              <button
                onClick={() => handleSourceLeads(sourceBatchSize, sourceProvider)}
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
              <span
                className="px-2.5 py-2 bg-amber-50 border-l border-slate-200 text-[11px] font-mono font-bold text-amber-800 flex items-center"
                title="Estimated run cost for this batch size"
              >
                Est. {formatUsdCost(estimateLeadSearchCost(sourceProvider, sourceBatchSize))}
              </span>
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

      {/* Background Scraping / Active Progress Cost Live Indicator */}
      {(Boolean(actionLoading) || isPollingWorker || campaign.status === 'RUNNING') && (() => {
        const isDiscoveryRun = actionLoading === 'scrape' || isPollingWorker || campaign.status === 'RUNNING' || Boolean(campaign.activeRun);
        const runningEstCost =
          campaign.activeRun?.estimatedCostUsd ??
          estimateLeadSearchCost(sourceProvider, sourceBatchSize);

        return (
          <div className="bg-indigo-50 border border-indigo-200 p-4 rounded-2xl flex flex-wrap items-center justify-between gap-3 shadow-xs">
            <div className="flex items-center gap-3">
              <span className="relative flex h-3 w-3">
                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-indigo-400 opacity-75"></span>
                <span className="relative inline-flex rounded-full h-3 w-3 bg-indigo-600"></span>
              </span>
              <div>
                <div className="flex flex-wrap items-center gap-2">
                  <p className="text-xs font-bold text-indigo-900">
                    {actionLoading && actionLoading !== 'scrape'
                      ? 'Processing outreach request...'
                      : 'Running Lead Discovery...'}
                  </p>
                  {isDiscoveryRun && (
                    <span className="px-2 py-0.5 rounded-md bg-amber-100 border border-amber-300 text-[11px] font-mono font-bold text-amber-900">
                      💳 Progress Run Cost: ~{formatUsdCost(runningEstCost)}
                    </span>
                  )}
                  {engineBalance?.configured && (
                    <span className="px-2 py-0.5 rounded-md bg-white border border-indigo-200 text-[11px] font-mono font-semibold text-indigo-800">
                      Balance: {formatUsdCost(engineBalance.balanceUsd)}
                    </span>
                  )}
                </div>
                <p className="text-[11px] text-indigo-700 mt-0.5">
                  Targeted leads and search engine credit cost are tracked per progress run (Current: {allLeads.length} leads • Total Cost: {formatUsdCost(campaign.totalCostUsd || 0)}).
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
        );
      })()}

      {/* Guided 3-Step Outreach Funnel Wizard */}
      <div className="bg-gradient-to-r from-slate-900 via-indigo-950 to-slate-900 p-5 sm:p-6 rounded-2xl text-white shadow-lg space-y-5 border border-slate-800">
        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4 border-b border-slate-800 pb-4">
          <div>
            <div className="flex items-center gap-2">
              <span className="text-xl">⚡</span>
              <h2 className="text-base font-bold tracking-tight">Outreach Pipeline Flow</h2>
              <span className="text-[10px] font-bold uppercase tracking-wider px-2.5 py-0.5 rounded-full bg-indigo-500/20 text-indigo-300 border border-indigo-500/30">
                Step {currentStepNumber} of 3
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

        {/* Step Progression Grid: 3 Clean Steps */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-3.5">
          {/* Step 1: Leads Sourced */}
          <div className={`p-4 rounded-xl border transition-all ${currentStepNumber === 1 ? 'bg-white/15 border-amber-400 ring-2 ring-amber-400/30' : allLeads.length > 0 ? 'bg-emerald-950/30 border-emerald-500/30' : 'bg-white/5 border-white/10'} flex flex-col justify-between`}>
            <div>
              <div className="flex items-center justify-between">
                <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">Step 1</span>
                {allLeads.length > 0 ? (
                  <span className="text-emerald-400 text-xs font-bold bg-emerald-500/20 px-2 py-0.5 rounded-md">✓ Done</span>
                ) : (
                  <span className="text-slate-500 text-[10px]">Pending</span>
                )}
              </div>
              <p className="text-xs font-semibold text-slate-200 mt-1.5">Leads Sourced</p>
              <div className="flex items-baseline justify-between gap-2 mt-1">
                <p className="text-xl font-bold text-blue-400">{allLeads.length}</p>
                <span className="text-[10px] font-mono text-amber-300 bg-amber-500/15 border border-amber-400/20 px-1.5 py-0.5 rounded">
                  {formatUsdCost(campaign.totalCostUsd || 0)}
                </span>
              </div>
            </div>
            {allLeads.length === 0 ? (
              <button
                onClick={() => handleSourceLeads()}
                disabled={isActionLocked}
                className="mt-3 w-full py-1.5 bg-blue-600 hover:bg-blue-500 text-white text-xs font-bold rounded-lg transition-colors flex items-center justify-center gap-1.5 shadow-xs disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {isActionLocked ? (
                  <>
                    <span className="w-3.5 h-3.5 border-2 border-white border-t-transparent rounded-full animate-spin" />
                    <span>Sourcing in Progress...</span>
                  </>
                ) : (
                  <span>🔍 Source Prospects</span>
                )}
              </button>
            ) : (
              <div className="mt-3 pt-2.5 border-t border-white/10 flex items-center gap-1.5">
                <button
                  type="button"
                  onClick={() => exportStepCsv(allLeads, `${campaign.name}-step1-all-leads`)}
                  className="flex-1 py-1 px-2 bg-white/10 hover:bg-white/20 text-slate-200 hover:text-white text-[11px] font-semibold rounded-lg transition-colors flex items-center justify-center gap-1 border border-white/10 shadow-2xs"
                  title="Export all Step 1 sourced leads to CSV"
                >
                  <span>📥</span> CSV ({allLeads.length})
                </button>
                <button
                  type="button"
                  onClick={() => copyLeadsToClipboard(allLeads, 'Step 1: All Sourced Leads')}
                  className="flex-1 py-1 px-2 bg-white/10 hover:bg-white/20 text-slate-200 hover:text-white text-[11px] font-semibold rounded-lg transition-colors flex items-center justify-center gap-1 border border-white/10 shadow-2xs"
                  title="Copy all Step 1 leads to clipboard (Ready to paste into Excel/Sheets)"
                >
                  <span>📋</span> Copy
                </button>
              </div>
            )}
          </div>

          {/* Step 2: Corporate Emails */}
          <div className={`p-4 rounded-xl border transition-all ${currentStepNumber === 2 ? 'bg-white/15 border-amber-400 ring-2 ring-amber-400/30' : missingEmailCount === 0 && allLeads.length > 0 ? 'bg-emerald-950/30 border-emerald-500/30' : 'bg-white/5 border-white/10'} flex flex-col justify-between`}>
            <div>
              <div className="flex items-center justify-between">
                <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">Step 2</span>
                {missingEmailCount === 0 && allLeads.length > 0 ? (
                  <span className="text-emerald-400 text-xs font-bold bg-emerald-500/20 px-2 py-0.5 rounded-md">✓ Complete</span>
                ) : (
                  <span className="text-slate-400 text-[11px] font-medium">{missingEmailCount} Missing</span>
                )}
              </div>
              <p className="text-xs font-semibold text-slate-200 mt-1.5">Corporate Emails</p>
              <p className="text-xl font-bold text-indigo-300 mt-1">
                {leadsWithEmail} <span className="text-xs font-normal text-slate-400">/ {allLeads.length} Discovered</span>
              </p>
            </div>
            <div className="mt-3 space-y-1.5">
              <button
                onClick={() => handleFindEmails()}
                disabled={isActionLocked || missingEmailCount === 0 || allLeads.length === 0}
                className="w-full py-1.5 bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-bold rounded-lg transition-colors flex items-center justify-center gap-1.5 shadow-xs disabled:opacity-40 disabled:cursor-not-allowed"
                title="Find corporate verified emails for leads without email"
              >
                {actionLoading === 'email' ? (
                  <span className="w-3.5 h-3.5 border-2 border-white border-t-transparent rounded-full animate-spin" />
                ) : missingEmailCount === 0 && allLeads.length > 0 ? (
                  <span>✓ All Emails Found</span>
                ) : (
                  <span>📬 Get Lead Emails ({missingEmailCount})</span>
                )}
              </button>
              {leadsWithEmail > 0 && (
                <div className="pt-2 border-t border-white/10 flex items-center gap-1.5">
                  <button
                    type="button"
                    onClick={() => exportStepCsv(allLeads.filter(l => Boolean(l.email)), `${campaign.name}-step2-corporate-emails`)}
                    className="flex-1 py-1 px-2 bg-indigo-500/20 hover:bg-indigo-500/30 text-indigo-200 hover:text-white text-[11px] font-semibold rounded-lg transition-colors flex items-center justify-center gap-1 border border-indigo-400/20 shadow-2xs"
                    title="Export Step 2 leads with discovered emails to CSV"
                  >
                    <span>📥</span> CSV ({leadsWithEmail})
                  </button>
                  <button
                    type="button"
                    onClick={() => copyLeadsToClipboard(allLeads.filter(l => Boolean(l.email)), 'Step 2: Corporate Emails')}
                    className="flex-1 py-1 px-2 bg-indigo-500/20 hover:bg-indigo-500/30 text-indigo-200 hover:text-white text-[11px] font-semibold rounded-lg transition-colors flex items-center justify-center gap-1 border border-indigo-400/20 shadow-2xs"
                    title="Copy Step 2 leads with emails to clipboard (Ready to paste into Excel/Sheets)"
                  >
                    <span>📋</span> Copy
                  </button>
                </div>
              )}
            </div>
          </div>

          {/* Step 3: Push to CRM */}
          <div className={`p-4 rounded-xl border transition-all ${currentStepNumber === 3 ? 'bg-white/15 border-amber-400 ring-2 ring-amber-400/30' : uncommittedTotalLeads === 0 && allLeads.length > 0 ? 'bg-emerald-950/30 border-emerald-500/30' : 'bg-white/5 border-white/10'} flex flex-col justify-between`}>
            <div>
              <div className="flex items-center justify-between">
                <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">Step 3</span>
                {uncommittedTotalLeads === 0 && allLeads.length > 0 ? (
                  <span className="text-emerald-400 text-xs font-bold bg-emerald-500/20 px-2 py-0.5 rounded-md">✓ Active</span>
                ) : (
                  <span className="text-slate-400 text-[11px] font-medium">{uncommittedTotalLeads} Ready</span>
                )}
              </div>
              <p className="text-xs font-semibold text-slate-200 mt-1.5">CRM Pipeline Bridge</p>
              <p className="text-xl font-bold text-emerald-400 mt-1">
                {convertedLeads} <span className="text-xs font-normal text-slate-400">/ {allLeads.length} In Pipeline</span>
              </p>
            </div>
            <div className="mt-3 space-y-1.5">
              {uncommittedTotalLeads === 0 && allLeads.length > 0 ? (
                <button
                  type="button"
                  onClick={() => router.push('/dashboard')}
                  className="w-full py-1.5 bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-bold rounded-lg transition-colors flex items-center justify-center gap-1.5 shadow-xs cursor-pointer"
                  title="Open Kanban CRM Board"
                >
                  <span>✓ Synced to CRM — View Board ↗</span>
                </button>
              ) : (
                <button
                  onClick={() => openPushCrmModal()}
                  disabled={isActionLocked || uncommittedTotalLeads === 0 || allLeads.length === 0}
                  className="w-full py-1.5 bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-bold rounded-lg transition-colors flex items-center justify-center gap-1.5 shadow-xs disabled:opacity-40 disabled:cursor-not-allowed"
                  title="Bridge leads into Kanban CRM Fresh leads column"
                >
                  {actionLoading === 'push-crm' ? (
                    <span className="w-3.5 h-3.5 border-2 border-white border-t-transparent rounded-full animate-spin" />
                  ) : (
                    <span>📥 Push to CRM ({uncommittedTotalLeads})</span>
                  )}
                </button>
              )}
              {(convertedLeads > 0 || uncommittedTotalLeads > 0) && (
                <div className="pt-2 border-t border-white/10 flex items-center gap-1.5">
                  <button
                    type="button"
                    onClick={() => {
                      const targetLeads = convertedLeads > 0
                        ? allLeads.filter(l => l.status === 'CONVERTED')
                        : allLeads.filter(l => Boolean(l.email));
                      exportStepCsv(targetLeads, `${campaign.name}-step3-crm-leads`);
                    }}
                    className="flex-1 py-1 px-2 bg-emerald-500/20 hover:bg-emerald-500/30 text-emerald-200 hover:text-white text-[11px] font-semibold rounded-lg transition-colors flex items-center justify-center gap-1 border border-emerald-400/20 shadow-2xs"
                    title="Export Step 3 CRM bridged leads to CSV"
                  >
                    <span>📥</span> CSV ({convertedLeads > 0 ? convertedLeads : allLeads.filter(l => Boolean(l.email)).length})
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      const targetLeads = convertedLeads > 0
                        ? allLeads.filter(l => l.status === 'CONVERTED')
                        : allLeads.filter(l => Boolean(l.email));
                      copyLeadsToClipboard(targetLeads, 'Step 3: CRM Pipeline Leads');
                    }}
                    className="flex-1 py-1 px-2 bg-emerald-500/20 hover:bg-emerald-500/30 text-emerald-200 hover:text-white text-[11px] font-semibold rounded-lg transition-colors flex items-center justify-center gap-1 border border-emerald-400/20 shadow-2xs"
                    title="Copy Step 3 CRM leads to clipboard (Ready to paste into Excel/Sheets)"
                  >
                    <span>📋</span> Copy
                  </button>
                </div>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* Top Selection Bar */}
      {selectedIds.length > 0 && (
        <div className="bg-slate-900 text-white p-3.5 rounded-2xl flex flex-wrap items-center justify-between gap-3 shadow-lg border border-slate-700 animate-in fade-in slide-in-from-top-2">
          <div className="flex items-center gap-2">
            <span className="bg-primary-600 px-2.5 py-0.5 rounded-md font-bold text-xs">
              {selectedIds.length} Selected
            </span>
            <span className="text-xs text-slate-300">
              Apply actions to selected prospects:
            </span>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <button
              onClick={() => handleFindEmails(selectedIds)}
              disabled={Boolean(actionLoading)}
              className="px-3.5 py-1.5 bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-bold rounded-xl transition-colors flex items-center gap-1.5 cursor-pointer shadow-xs disabled:opacity-50"
            >
              <span>📬</span>
              <span>Get Emails ({selectedIds.length})</span>
            </button>
            <button
              onClick={() => openPushCrmModal(selectedIds)}
              disabled={Boolean(actionLoading)}
              className="px-3.5 py-1.5 bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-bold rounded-xl transition-colors flex items-center gap-1.5 cursor-pointer shadow-xs disabled:opacity-50"
            >
              <span>📥</span>
              <span>Push to CRM ({selectedIds.length})</span>
            </button>
            <button
              onClick={clearSelection}
              className="px-3 py-1.5 bg-white/10 hover:bg-white/20 text-white text-xs font-semibold rounded-xl transition-colors cursor-pointer"
            >
              ✕ Deselect
            </button>
          </div>
        </div>
      )}

      {/* Progress Run Cost History Card */}
      {(campaign.runLogs && campaign.runLogs.length > 0) && (
        <div className="bg-white rounded-2xl border border-slate-200/80 shadow-xs overflow-hidden">
          <div className="px-4 py-3 border-b border-slate-100 flex flex-wrap items-center justify-between gap-2 bg-slate-50/70">
            <div className="flex items-center gap-2">
              <span className="text-sm">💳</span>
              <h2 className="text-xs font-bold text-slate-900 uppercase tracking-wider">Progress Running Cost Log</h2>
              <span className="text-[10px] font-semibold px-2 py-0.5 rounded-full bg-amber-100 text-amber-800 border border-amber-200 font-mono">
                Total: {formatUsdCost(campaign.totalCostUsd || 0)}
              </span>
              {engineBalance?.lowBalanceWarning && (
                <span className="text-[10px] font-semibold px-2 py-0.5 rounded-full bg-amber-50 text-amber-800 border border-amber-300">
                  ⚠️ Database Balance Low ({formatUsdCost(engineBalance.balanceUsd)}) — Monitoring Only
                </span>
              )}
            </div>
            <button
              type="button"
              onClick={() => setShowRunHistory((prev) => !prev)}
              className="text-[11px] font-semibold text-slate-600 hover:text-slate-900 px-2.5 py-1 rounded-lg border border-slate-200 bg-white"
            >
              {showRunHistory ? 'Hide History' : `Show History (${campaign.runLogs.length})`}
            </button>
          </div>
          {showRunHistory && (
            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs text-slate-600">
                <thead className="bg-slate-50/60 text-[10px] font-bold text-slate-400 uppercase tracking-wider border-b border-slate-100">
                  <tr>
                    <th className="px-4 py-2">PROGRESS STEP</th>
                    <th className="px-4 py-2">ENGINE MODE</th>
                    <th className="px-3 py-2 text-center">STATUS</th>
                    <th className="px-3 py-2 text-center">PROCESSED / SAVED</th>
                    <th className="px-3 py-2 text-right">RUN COST</th>
                    <th className="px-3 py-2 text-right">BALANCE AFTER</th>
                    <th className="px-4 py-2 text-right">TIME</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {campaign.runLogs.slice(0, 10).map((run) => {
                    const providerLabel =
                      run.provider === 'treg'
                        ? 'B2B Verified Database'
                        : run.provider === 'outscraper'
                        ? 'Business Directory Search'
                        : run.provider === 'apify'
                        ? 'Executive Network Discovery'
                        : run.provider;
                    const accuracyTag =
                      run.costSource === 'verified_ledger'
                        ? 'Ledger Verified'
                        : run.costSource === 'balance_delta'
                        ? 'Balance Delta'
                        : run.costSource === 'api_header'
                        ? 'Gateway Header'
                        : 'Estimated';

                    return (
                      <tr key={run.id} className="hover:bg-slate-50/70">
                        <td className="px-4 py-2 font-semibold text-slate-800">Lead Discovery</td>
                        <td className="px-4 py-2 text-[11px] text-slate-600">{providerLabel}</td>
                        <td className="px-3 py-2 text-center">
                          <span
                            className={`px-2 py-0.5 rounded-full text-[10px] font-bold ${
                              run.status === 'COMPLETED'
                                ? 'bg-emerald-50 text-emerald-700 border border-emerald-200'
                                : run.status === 'RUNNING'
                                ? 'bg-indigo-50 text-indigo-700 border border-indigo-200 animate-pulse'
                                : 'bg-rose-50 text-rose-700 border border-rose-200'
                            }`}
                          >
                            {run.status}
                          </span>
                        </td>
                        <td className="px-3 py-2 text-center font-mono text-[11px]">
                          {run.status === 'RUNNING'
                            ? `Req: ${run.itemsRequested}`
                            : `${run.itemsProcessed} / ${run.itemsSaved}`}
                        </td>
                        <td className="px-3 py-2 text-right">
                          <div className="font-mono font-bold text-amber-800">
                            {run.status === 'RUNNING'
                              ? `~${formatUsdCost(run.estimatedCostUsd)}`
                              : formatUsdCost(run.actualCostUsd)}
                          </div>
                          <div className="text-[9px] text-slate-400">{accuracyTag}</div>
                        </td>
                        <td className="px-3 py-2 text-right font-mono text-[11px] text-slate-700">
                          {typeof run.balanceAfterUsd === 'number' ? formatUsdCost(run.balanceAfterUsd) : '—'}
                        </td>
                        <td className="px-4 py-2 text-right text-[10px] text-slate-400">
                          {new Date(run.startedAt).toLocaleString('en-US', {
                            day: '2-digit',
                            month: 'short',
                            hour: '2-digit',
                            minute: '2-digit',
                          })}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {/* Prospect Qualification Table */}
      <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200/80 dark:border-slate-800 shadow-xs overflow-hidden">
        <div className="p-4 border-b border-slate-100 dark:border-slate-800 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div>
            <h2 className="text-sm font-bold text-slate-900 dark:text-slate-100">Prospect Roster & Qualification Matrix</h2>
            <p className="text-[11px] text-slate-500 dark:text-slate-400 mt-0.5">
              Review enriched profiles, discover corporate emails, and bridge high-fit leads into your Kanban pipeline.
            </p>
          </div>

          <div className="flex items-center gap-2">
            {/* Filter Tabs */}
            <select
              value={filterStatus}
              onChange={(e) => { setFilterStatus(e.target.value); setCurrentPage(1); }}
              className="px-3 py-1.5 border border-slate-300 dark:border-slate-700 rounded-xl text-xs font-semibold text-slate-700 dark:text-slate-200 bg-white dark:bg-slate-800 focus:outline-none focus:ring-2 focus:ring-primary-500"
            >
              <option value="ALL">All Leads ({allLeads.length})</option>
              <option value="WITH_EMAIL">Has Email ({leadsWithEmail})</option>
              <option value="MISSING_EMAIL">Missing Email ({missingEmailCount})</option>
              <option value="DISPATCHED">In CRM Pipeline ({dispatchedLeads})</option>
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
            <table className="w-full text-left text-xs text-slate-600 dark:text-slate-300">
              <thead className="bg-slate-50/80 dark:bg-slate-900/60 text-[11px] font-bold text-slate-400 dark:text-slate-500 uppercase tracking-wider border-b border-slate-100 dark:border-slate-800">
                <tr>
                  <th className="px-3 py-3 w-10 text-center">
                    <input
                      type="checkbox"
                      checked={isAllSelected}
                      onChange={() => toggleSelectAll(paginatedLeads)}
                      className="rounded border-slate-300 dark:border-slate-600 text-primary-600 focus:ring-primary-500 w-4 h-4 cursor-pointer"
                      title="Select / Deselect All on this page"
                    />
                  </th>
                  <th className="px-4 py-3">Lead & Organization Profile</th>
                  <th className="px-4 py-3 w-[260px]">Corporate Email</th>
                  <th className="px-3 py-3 text-center w-[130px]">ICP Match</th>
                  <th className="px-4 py-3 text-right w-[140px]">CRM Pipeline</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                {paginatedLeads.map((lead) => {
                  const isChecked = selectedIds.includes(lead.id);
                  const isFinding = rowLoading[`${lead.id}-find`];
                  const isPushing = rowLoading[`${lead.id}-push`];

                  return (
                    <tr
                      key={lead.id}
                      onClick={() => toggleSelectLead(lead.id)}
                      className={`transition-colors cursor-pointer border-b border-slate-100 dark:border-slate-800 ${
                        isChecked ? 'bg-primary-50/50 dark:bg-primary-950/40' : 'hover:bg-slate-50/70 dark:hover:bg-slate-850/60'
                      }`}
                    >
                      {/* Checkbox */}
                      <td className="px-3 py-3.5 text-center" onClick={(e) => e.stopPropagation()}>
                        <input
                          type="checkbox"
                          checked={isChecked}
                          onChange={() => toggleSelectLead(lead.id)}
                          className="rounded border-slate-300 dark:border-slate-600 text-primary-600 focus:ring-primary-500 w-4 h-4 cursor-pointer"
                        />
                      </td>

                      {/* Lead & Organization Profile (No Avatar Logo: Maximum Content Width) */}
                      <td className="px-4 py-3.5">
                        <div className="space-y-1.5 min-w-0">
                          {/* Line 1: Full Name, CRM Status, LinkedIn Pill */}
                          <div className="flex items-center gap-2 flex-wrap">
                            <span className="font-bold text-slate-900 dark:text-slate-100 text-[13px] tracking-tight">
                              {lead.fullName}
                            </span>
                            {lead.status === 'CONVERTED' && (
                              <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-emerald-100 dark:bg-emerald-950/60 text-emerald-800 dark:text-emerald-300 border border-emerald-200 dark:border-emerald-800">
                                ✓ in CRM
                              </span>
                            )}
                            {lead.linkedinUrl && (
                              <a
                                href={lead.linkedinUrl.startsWith('http') ? lead.linkedinUrl : `https://${lead.linkedinUrl}`}
                                target="_blank"
                                rel="noreferrer"
                                className="inline-flex items-center gap-1 text-[11px] font-semibold text-[#0077b5] dark:text-[#3897d3] bg-[#0077b5]/10 dark:bg-[#0077b5]/20 hover:bg-[#0077b5]/20 px-2 py-0.5 rounded-md border border-[#0077b5]/20 transition-colors"
                                title="Open Official LinkedIn Profile"
                                onClick={(e) => e.stopPropagation()}
                              >
                                <svg className="w-3 h-3 fill-current" viewBox="0 0 24 24">
                                  <path d="M19 3a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h14m-.5 15.5v-5.3a3.26 3.26 0 0 0-3.26-3.26c-.85 0-1.84.52-2.28 1.3v-1.11h-2.79v8.37h2.79v-4.93c0-.77.62-1.4 1.39-1.4a1.4 1.4 0 0 1 1.4 1.4v4.93h2.75M6.46 10.9v8.37H9.2V10.9H6.46M7.83 6.64a1.66 1.66 0 0 0-1.66 1.66 1.66 1.66 0 0 0 1.66 1.66 1.66 1.66 0 0 0 1.66-1.66c0-.92-.74-1.66-1.66-1.66Z" />
                                </svg>
                                <span>LinkedIn</span>
                                <span className="text-[9px]">↗</span>
                              </a>
                            )}
                          </div>

                          {/* Line 2: Full Job Title / Role */}
                          <div className="text-xs font-semibold text-indigo-700 dark:text-indigo-300 leading-snug break-words whitespace-normal flex items-start gap-1">
                            <span className="text-indigo-500/80 dark:text-indigo-400 text-[11px] shrink-0 mt-0.5">👔</span>
                            <span>{lead.jobTitle || 'Executive Decision Maker'}</span>
                          </div>

                          {/* Line 3: Badges for Company and Location */}
                          <div className="text-xs flex items-center gap-2 flex-wrap pt-0.5">
                            {/* Company Badge Chip */}
                            <div className="inline-flex items-center gap-1.5 text-slate-800 dark:text-slate-200 font-bold bg-slate-100 dark:bg-slate-800/80 px-2 py-0.5 rounded-md border border-slate-200/80 dark:border-slate-700/80 max-w-full">
                              <span className="text-slate-400 dark:text-slate-500 text-[11px] shrink-0">🏢</span>
                              <span>{sanitizeLeadCompany(lead.companyName)}</span>
                              {isValidWebsiteDomain(lead.companyDomain) && (
                                <a
                                  href={lead.companyDomain!.startsWith('http') ? lead.companyDomain! : `https://${lead.companyDomain}`}
                                  target="_blank"
                                  rel="noreferrer"
                                  className="inline-flex items-center gap-0.5 text-primary-600 dark:text-primary-400 hover:underline font-semibold ml-0.5 text-[10px]"
                                  title={`Visit ${lead.companyDomain}`}
                                  onClick={(e) => e.stopPropagation()}
                                >
                                  <span>{lead.companyDomain!.replace(/^https?:\/\//, '').replace(/\/.*$/, '')}</span>
                                  <span className="text-[9px]">↗</span>
                                </a>
                              )}
                            </div>

                            {/* Location Badge Chip */}
                            {lead.location && (
                              <div className="inline-flex items-center gap-1 text-[11px] font-medium text-slate-600 dark:text-slate-300 bg-slate-50 dark:bg-slate-850 px-2 py-0.5 rounded-md border border-slate-200/60 dark:border-slate-800 max-w-full">
                                <span className="text-[10px] shrink-0">📍</span>
                                <span>{lead.location}</span>
                              </div>
                            )}
                          </div>

                          {/* Line 4: Unique Profile Highlights & Bio */}
                          {(() => {
                            const { shortSnippet, fullBio } = extractLeadBioSummary(lead);
                            if (!fullBio) return null;
                            const isExpanded = Boolean(expandedBioIds[lead.id]);

                            return (
                              <div className="mt-1 p-2 rounded-lg bg-slate-50/90 dark:bg-slate-850/80 border border-slate-200/70 dark:border-slate-700/60 text-[11px] text-slate-600 dark:text-slate-300">
                                <div className="flex items-start gap-1.5">
                                  <span className="text-[11px] shrink-0 mt-0.5 text-amber-500">✨</span>
                                  <div className="flex-1 leading-relaxed">
                                    <span className="font-semibold text-slate-800 dark:text-slate-200 mr-1">Unique Profile:</span>
                                    <span>{isExpanded ? fullBio : shortSnippet}</span>
                                    {fullBio.length > 135 && (
                                      <button
                                        type="button"
                                        onClick={(e) => {
                                          e.stopPropagation();
                                          setExpandedBioIds((prev) => ({ ...prev, [lead.id]: !prev[lead.id] }));
                                        }}
                                        className="ml-1.5 text-primary-600 dark:text-primary-400 font-bold hover:underline inline-flex items-center text-[10px] cursor-pointer"
                                      >
                                        {isExpanded ? 'Show less' : 'View full bio'}
                                      </button>
                                    )}
                                  </div>
                                </div>
                              </div>
                            );
                          })()}
                        </div>
                      </td>

                      {/* Corporate Email: Clean Full Address Display */}
                      <td className="px-4 py-3.5 text-xs text-slate-800 dark:text-slate-200" onClick={(e) => e.stopPropagation()}>
                        {lead.email ? (
                          <div className="space-y-1.5 w-full max-w-[260px]">
                            <div className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full bg-emerald-50 dark:bg-emerald-950/40 text-emerald-700 dark:text-emerald-400 border border-emerald-200/60 dark:border-emerald-800 text-[10px] font-bold">
                              <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" />
                              <span>Corporate Email</span>
                            </div>
                            <div className="flex items-center justify-between gap-1.5 bg-slate-50 dark:bg-slate-800/80 px-2.5 py-1.5 rounded-lg border border-slate-200/80 dark:border-slate-700 font-mono text-[11px] group">
                              <span className="font-semibold text-slate-900 dark:text-slate-100 select-all break-all leading-tight" title={lead.email}>
                                {lead.email}
                              </span>
                              <button
                                onClick={() => {
                                  navigator.clipboard.writeText(lead.email!);
                                  toast.success(`Copied ${lead.email} to clipboard!`);
                                }}
                                className="text-slate-400 hover:text-slate-700 dark:hover:text-slate-200 text-xs p-1 rounded hover:bg-white dark:hover:bg-slate-700 transition-colors shrink-0 cursor-pointer"
                                title="Copy email to clipboard"
                              >
                                📋
                              </button>
                            </div>
                          </div>
                        ) : (
                          <div className="space-y-1 w-full max-w-[260px]">
                            <button
                              onClick={() => handleFindEmails([lead.id])}
                              disabled={isFinding}
                              className="px-3 py-1.5 bg-indigo-50 hover:bg-indigo-100 dark:bg-indigo-950/40 dark:hover:bg-indigo-900/60 text-indigo-700 dark:text-indigo-300 border border-indigo-200 dark:border-indigo-800 text-xs font-bold rounded-xl transition-colors inline-flex items-center gap-1.5 shadow-2xs cursor-pointer"
                            >
                              {isFinding ? (
                                <>
                                  <span className="w-3 h-3 border-2 border-indigo-600 border-t-transparent rounded-full animate-spin" />
                                  <span>Finding...</span>
                                </>
                              ) : (
                                <>
                                  <span>✨</span>
                                  <span>Find Corporate Email</span>
                                </>
                              )}
                            </button>
                            <p className="text-[10px] text-slate-400 dark:text-slate-500">Email not discovered</p>
                          </div>
                        )}
                      </td>

                      {/* ICP Match Score */}
                      <td className="px-3 py-3.5 text-center whitespace-nowrap" onClick={(e) => e.stopPropagation()}>
                        {(() => {
                          const { score, label, badgeClass, matchFactors } = computeLeadIcpScore(lead);
                          return (
                            <div className="inline-flex flex-col items-center gap-1">
                              <span className={`px-2.5 py-0.5 rounded-full text-[11px] border font-bold ${badgeClass}`}>
                                {score}% Match
                              </span>
                              <div className="w-16 h-1.5 bg-slate-100 dark:bg-slate-800 rounded-full overflow-hidden border border-slate-200 dark:border-slate-700">
                                <div
                                  className={`h-full rounded-full transition-all duration-300 ${score >= 85 ? 'bg-emerald-500' : score >= 70 ? 'bg-indigo-500' : 'bg-blue-400'}`}
                                  style={{ width: `${score}%` }}
                                />
                              </div>
                              <div className="flex items-center justify-center gap-1 flex-wrap text-[9px] text-slate-500 dark:text-slate-400 font-medium max-w-[125px]">
                                {matchFactors.slice(0, 2).map((factor, i) => (
                                  <span key={i} className="bg-slate-100 dark:bg-slate-800/80 px-1 py-0.2 rounded border border-slate-200/60 dark:border-slate-700">
                                    ✓ {factor}
                                  </span>
                                ))}
                              </div>
                            </div>
                          );
                        })()}
                      </td>

                      {/* CRM Status / Action */}
                      <td className="px-4 py-3.5 text-right whitespace-nowrap" onClick={(e) => e.stopPropagation()}>
                        {lead.status === 'CONVERTED' && lead.convertedCardId ? (
                          <Link
                            href={`/dashboard?cardId=${lead.convertedCardId}`}
                            className="px-3 py-1.5 bg-emerald-50 text-emerald-800 dark:bg-emerald-950/40 dark:text-emerald-300 border border-emerald-300 dark:border-emerald-800 text-xs font-bold rounded-xl hover:bg-emerald-100 dark:hover:bg-emerald-900/40 transition-colors inline-flex items-center gap-1 shadow-2xs"
                            title="View Card on Kanban CRM Board"
                          >
                            <span className="text-emerald-600 dark:text-emerald-400">✓</span>
                            <span>In Pipeline</span>
                            <span className="text-[10px]">↗</span>
                          </Link>
                        ) : (
                          <button
                            onClick={() => openPushCrmModal([lead.id])}
                            disabled={isPushing}
                            className="px-3 py-1.5 bg-primary-600 hover:bg-primary-700 text-white text-xs font-bold rounded-xl transition-colors inline-flex items-center gap-1 shadow-xs disabled:opacity-40 cursor-pointer"
                            title="Push directly into Kanban CRM Fresh leads column"
                          >
                            {isPushing ? (
                              <>
                                <span className="w-3 h-3 border-2 border-white border-t-transparent rounded-full animate-spin" />
                                <span>Pushing...</span>
                              </>
                            ) : (
                              <>
                                <span>📥</span>
                                <span>Push CRM</span>
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
            {pushSuccessData ? (
              /* Success Screen after Push to CRM */
              <div className="py-4 space-y-5 text-center">
                <div className="w-14 h-14 bg-emerald-100 text-emerald-600 rounded-full flex items-center justify-center mx-auto text-2xl shadow-inner">
                  ✓
                </div>
                <div className="space-y-1">
                  <h3 className="text-base font-bold text-slate-900">Leads Successfully Synced to CRM!</h3>
                  <p className="text-xs text-slate-500 max-w-sm mx-auto">
                    {pushSuccessData.count} prospects converted into prospect cards on board{' '}
                    <strong className="text-slate-800">&quot;{pushSuccessData.boardTitle}&quot;</strong> under column{' '}
                    <strong className="text-slate-800">&quot;{pushSuccessData.columnTitle}&quot;</strong>.
                  </p>
                </div>
                <div className="p-3.5 bg-slate-50 border border-slate-200 rounded-xl text-left text-xs space-y-1 text-slate-600">
                  <div className="flex items-center gap-1.5 font-bold text-slate-800">
                    <span>🛡️</span>
                    <span>Safe Drafts Active</span>
                  </div>
                  <p className="text-[11px] text-slate-500 leading-relaxed">
                    Personalized AI pitches are saved as pending drafts. You can review them in the Kanban board and initiate sending whenever ready.
                  </p>
                </div>
                <div className="flex items-center justify-center gap-3 pt-2">
                  <button
                    type="button"
                    onClick={() => {
                      setIsPushCrmModalOpen(false);
                      setPushSuccessData(null);
                    }}
                    className="px-4 py-2 text-xs font-semibold text-slate-600 hover:bg-slate-100 rounded-xl"
                  >
                    Stay in Campaign
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setIsPushCrmModalOpen(false);
                      setPushSuccessData(null);
                      router.push(`/dashboard?boardId=${pushSuccessData.boardId}`);
                    }}
                    className="px-5 py-2 bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-bold rounded-xl transition-all shadow-md flex items-center gap-1.5 cursor-pointer"
                  >
                    <span>Open CRM Board 🚀</span>
                  </button>
                </div>
              </div>
            ) : (
              <>
                <div className="flex items-center justify-between border-b border-slate-100 pb-3">
                  <div className="flex items-center gap-2">
                    <span className="text-xl">📋</span>
                    <div>
                      <h3 className="text-sm font-bold text-slate-900">Push Leads to Kanban CRM</h3>
                      <p className="text-xs text-slate-500">Select target Kanban Board and Column for these prospects.</p>
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
                <div className="p-3.5 bg-indigo-50/80 dark:bg-[#1c2b41] border border-indigo-100 dark:border-[#204677] rounded-xl text-xs space-y-1.5">
                  <div className="flex items-center justify-between font-bold text-indigo-950 dark:text-[#B6C2CF]">
                    <span>Eligible Leads to Push:</span>
                    <span className="bg-indigo-600 text-white px-2 py-0.5 rounded-full text-[11px]">
                      {crmTargetLeadIds.length} Leads
                    </span>
                  </div>
                  <p className="text-[11px] text-indigo-700/80 dark:text-[#8C9BAB]">
                    Leads are saved into your Kanban board under <strong>&quot;Fresh leads&quot;</strong>.
                  </p>
                  <div className="pt-1.5 border-t border-indigo-100/80 dark:border-[#204677] text-[11px] font-semibold text-emerald-800 dark:text-[#4BCE97] flex items-center gap-1">
                    <span>🛡️</span>
                    <span>Safe Mode Active: Pushing will NOT send emails. Leads remain as pending drafts until you review and click &quot;Start Sending All&quot;.</span>
                  </div>
                </div>

                {/* Board & Column Selectors */}
                <div className="space-y-3">
                  <div>
                    <div className="flex items-center justify-between mb-1">
                      <label className="block text-xs font-semibold text-slate-700">
                        Select Target Board *
                      </label>
                      {!isCreatingBoardInline ? (
                        <button
                          type="button"
                          onClick={() => {
                            setNewBoardTitle(`${campaign?.name || 'Outreach'} Leads`);
                            setIsCreatingBoardInline(true);
                          }}
                          className="text-[11px] font-bold text-primary-600 hover:text-primary-800 transition-colors"
                        >
                          + Create New Board
                        </button>
                      ) : (
                        <button
                          type="button"
                          onClick={() => setIsCreatingBoardInline(false)}
                          className="text-[11px] font-semibold text-slate-500 hover:text-slate-700"
                        >
                          Cancel
                        </button>
                      )}
                    </div>

                    {isCreatingBoardInline ? (
                      <div className="p-3 bg-slate-50 border border-slate-200 rounded-xl space-y-2 mb-2">
                        <label className="block text-[11px] font-semibold text-slate-600">
                          New Board Title:
                        </label>
                        <div className="flex items-center gap-2">
                          <input
                            type="text"
                            value={newBoardTitle}
                            onChange={(e) => setNewBoardTitle(e.target.value)}
                            placeholder="e.g. Q2 Outreach Campaign"
                            className="flex-1 px-3 py-1.5 border border-slate-300 rounded-lg text-xs bg-white text-slate-800 focus:outline-none focus:ring-2 focus:ring-primary-500"
                          />
                          <button
                            type="button"
                            onClick={handleCreateNewBoardInline}
                            disabled={creatingBoard}
                            className="px-3 py-1.5 bg-primary-600 hover:bg-primary-700 text-white text-xs font-bold rounded-lg disabled:opacity-50 flex items-center gap-1"
                          >
                            {creatingBoard ? 'Creating...' : 'Create'}
                          </button>
                        </div>
                      </div>
                    ) : (
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
                    )}
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
                    className="px-5 py-2 bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-bold rounded-xl transition-all shadow-xs flex items-center gap-1.5 disabled:opacity-50 cursor-pointer"
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
              </>
            )}
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
		                  <p className="text-xs text-slate-500 break-words whitespace-normal mt-0.5">
		                    <span className="font-semibold text-indigo-950 dark:text-indigo-300">{selectedLead.jobTitle || 'Executive'}</span>
		                    {' at '}
		                    <span className="font-bold text-slate-800 dark:text-slate-200">{sanitizeLeadCompany(selectedLead.companyName)}</span>
		                    {selectedLead.location && (
		                      <span className="ml-1 text-slate-500 dark:text-slate-400">
		                        • 📍 {selectedLead.location}
		                      </span>
		                    )}
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
                        Follow-up Delay (from Initial Email)
                      </label>
                      <select
                        value={settingsDripDelayDays}
                        onChange={(e) => setSettingsDripDelayDays(Number(e.target.value))}
                        className="w-full px-3 py-2 bg-white border border-slate-300 rounded-xl text-xs focus:ring-2 focus:ring-primary-500"
                      >
                        <option value={7}>After 7 Days from initial email (Default)</option>
                        <option value={3}>After 3 Days from initial email</option>
                        <option value={5}>After 5 Days from initial email</option>
                        <option value={10}>After 10 Days from initial email</option>
                        <option value={14}>After 14 Days from initial email</option>
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
