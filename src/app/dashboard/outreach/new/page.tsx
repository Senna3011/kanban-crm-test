'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import toast, { Toaster } from 'react-hot-toast';

interface OutreachAccount {
  id: string;
  name: string;
  senderEmail: string;
  isActive: boolean;
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

export default function NewOutreachCampaignPage() {
  const router = useRouter();
  const [step, setStep] = useState(1);

  // Step 1: Basics
  const [name, setName] = useState('');
  const [outreachAccounts, setOutreachAccounts] = useState<OutreachAccount[]>([]);
  const [selectedAccountId, setSelectedAccountId] = useState('');
  const [selectedAccountIds, setSelectedAccountIds] = useState<string[]>([]);

  // Step 2: Target Lead Parameters
  const [leadProvider, setLeadProvider] = useState<'outscraper' | 'apify'>('outscraper');
  const [targetRole, setTargetRole] = useState('Chief Technology Officer');
  const [targetLocation, setTargetLocation] = useState('United States');
  const [targetIndustry, setTargetIndustry] = useState('Information Technology & Services');
  const [selectedIndustries, setSelectedIndustries] = useState<string[]>([
    'Information Technology & Services',
  ]);
  const [customIndustryInput, setCustomIndustryInput] = useState('');
  const [searchQuery, setSearchQuery] = useState('');
  const [leadCount, setLeadCount] = useState(10);
  const [icpChatInput, setIcpChatInput] = useState('');
  const [icpBrandUrl, setIcpBrandUrl] = useState('');
  const [isResearchingIcp, setIsResearchingIcp] = useState(false);

  // Step 3: AI Copywriting Strategy & Brand Research
  const [aiTone, setAiTone] = useState<'formal' | 'conversational' | 'direct'>('formal');
  const [aiLength, setAiLength] = useState<'concise' | 'detailed'>('concise');
  const [brandInput, setBrandInput] = useState('');
  const [isResearchingBrand, setIsResearchingBrand] = useState(false);
  const [promptInstructions, setPromptInstructions] = useState(
    'Highlight our enterprise web architecture and AI automation capabilities. Offer a complimentary 10-minute discovery review.'
  );
  const [dripEnabled, setDripEnabled] = useState(false);
  const [dripStepsCount, setDripStepsCount] = useState(1);
  const [dripDelayDays, setDripDelayDays] = useState(7); // Default 7 days from last email (Point 5)
  const [customDelay1, setCustomDelay1] = useState(false);
  const [dripSubject, setDripSubject] = useState('');
  const [dripDelayDays2, setDripDelayDays2] = useState(7);
  const [customDelay2, setCustomDelay2] = useState(false);
  const [dripSubject2, setDripSubject2] = useState('');
  const [dripDelayDays3, setDripDelayDays3] = useState(7);
  const [customDelay3, setCustomDelay3] = useState(false);
  const [dripSubject3, setDripSubject3] = useState('');

  const [loading, setLoading] = useState(false);
  const [loadingStep, setLoadingStep] = useState('');
  const [error, setError] = useState('');

  useEffect(() => {
    fetch('/api/outreach/accounts')
      .then((r) => r.json())
      .then((data) => {
        const list = Array.isArray(data) ? data : data.accounts || [];
        setOutreachAccounts(list);
        const activeAccs = list.filter((a: any) => a.isActive);
        if (activeAccs.length > 0) {
          setSelectedAccountId(activeAccs[0].id);
          setSelectedAccountIds(activeAccs.map((a: any) => a.id));
        }
      })
      .catch((e) => console.error('Failed to load accounts:', e));
  }, []);

  async function handleAutoResearchBrand(
    overrideTone?: 'formal' | 'conversational' | 'direct',
    overrideLength?: 'concise' | 'detailed'
  ) {
    if (!brandInput.trim()) {
      toast.error('Please enter a website URL, brand name, or pricing page link');
      return;
    }

    const currentTone = overrideTone || aiTone;
    const currentLength = overrideLength || aiLength;

    setIsResearchingBrand(true);
    try {
      const res = await fetch('/api/outreach/summarize-offer', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          urlOrBrand: brandInput.trim(),
          tone: currentTone,
          length: currentLength,
        }),
      });

      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Failed to extract offer knowledge');

      if (data.data?.fullInstruction) {
        setPromptInstructions(data.data.fullInstruction);
        toast.success(`Value proposition updated (${currentTone} tone, ${currentLength})!`);
      }
    } catch (err: any) {
      toast.error(`Research failed: ${err.message}`);
    } finally {
      setIsResearchingBrand(false);
    }
  }

  async function handleAutoResearchIcp() {
    if (!icpChatInput.trim() && !icpBrandUrl.trim()) {
      toast.error('Please enter your brand URL or describe your target ICP in the chatbox.');
      return;
    }
    setIsResearchingIcp(true);
    try {
      const res = await fetch('/api/outreach/ai-target-assistant', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          brandOrUrl: icpBrandUrl.trim(),
          icpDescription: icpChatInput.trim(),
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Failed to auto-generate targeting');
      if (data.data) {
        if (data.data.targetRole) setTargetRole(data.data.targetRole);
        if (data.data.targetLocation) setTargetLocation(data.data.targetLocation);
        if (Array.isArray(data.data.targetIndustries) && data.data.targetIndustries.length > 0) {
          setSelectedIndustries(data.data.targetIndustries);
          setTargetIndustry(data.data.targetIndustries.join(', '));
        }
        if (data.data.searchQuery) setSearchQuery(data.data.searchQuery);
        toast.success(`Targeting profile auto-filled by AI! (${data.data.summary || 'Ready'})`);
      }
    } catch (err: any) {
      toast.error(err.message || 'AI targeting assistant error');
    } finally {
      setIsResearchingIcp(false);
    }
  }

  function handleToneChange(newTone: 'formal' | 'conversational' | 'direct') {
    setAiTone(newTone);
  }

  function handleLengthChange(newLength: 'concise' | 'detailed') {
    setAiLength(newLength);
  }

  function handleNextStep(e?: React.MouseEvent) {
    if (e) e.preventDefault();
    setError('');
    if (step === 1) {
      if (!name.trim()) {
        setError('Please enter a campaign name to continue.');
        return;
      }
      setStep(2);
    } else if (step === 2) {
      if (!targetRole.trim() && !searchQuery.trim()) {
        setError('Please specify a target executive job title or search query.');
        return;
      }
      if (!targetLocation.trim()) {
        setError('Please specify a geographic location or target country/city.');
        return;
      }
      setStep(3);
    }
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();

    if (step !== 3) {
      handleNextStep();
      return;
    }

    if (!name.trim()) {
      setError('Please provide a campaign name.');
      return;
    }

    setLoading(true);
    setLoadingStep('Creating campaign workspace...');
    setError('');

    try {
      const fullPromptInstructions = `[Tone: ${aiTone}, Length: ${aiLength}] ${promptInstructions}`.trim();

      const res = await fetch('/api/outreach/campaigns', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: name.trim(),
          targetRole: targetRole.trim(),
          targetLocation: targetLocation.trim(),
          targetIndustry: targetIndustry.trim(),
          searchQuery: searchQuery.trim() || undefined,
          promptInstructions: fullPromptInstructions,
          accountId: selectedAccountId || (selectedAccountIds.length > 0 ? selectedAccountIds[0] : undefined),
          accountIds: selectedAccountIds,
          dripEnabled,
          dripStepsCount,
          dripDelayDays,
          dripSubject: dripSubject.trim() || undefined,
          dripDelayDays2,
          dripSubject2: dripSubject2.trim() || undefined,
          dripDelayDays3,
          dripSubject3: dripSubject3.trim() || undefined,
        }),
      });

      if (!res.ok) {
        const errData = await res.json().catch(() => ({}));
        throw new Error(errData.error || 'Failed to create campaign');
      }

      const campaign = await res.json();
      router.push(`/dashboard/outreach/${campaign.id}?autoSource=true&limit=${leadCount}&provider=${leadProvider}`);
    } catch (err: any) {
      setError(err.message || 'An error occurred while creating the campaign.');
      setLoading(false);
      setLoadingStep('');
    }
  }

  return (
    <div className="p-4 sm:p-6 lg:p-8 max-w-4xl mx-auto space-y-6">
      <Toaster position="top-right" />

      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <Link
            href="/dashboard/outreach"
            className="text-xs font-semibold text-primary-600 hover:text-primary-800 flex items-center gap-1 mb-1"
          >
            ← Back to Outreach Campaigns
          </Link>
          <h1 className="text-xl font-bold text-slate-900 tracking-tight">Create Targeted Outreach Campaign</h1>
          <p className="text-xs text-slate-500 mt-0.5">
            Follow the 3-step wizard to configure lead discovery parameters and AI copywriting directives.
          </p>
        </div>
      </div>

      {/* Step Indicator */}
      <div className="bg-white p-4 rounded-2xl border border-slate-200/80 shadow-xs">
        <div className="flex items-center justify-between max-w-2xl mx-auto">
          <div className="flex items-center gap-2">
            <span
              className={`w-6 h-6 rounded-full flex items-center justify-center text-xs font-bold ${
                step >= 1 ? 'bg-primary-600 text-white' : 'bg-slate-100 text-slate-400'
              }`}
            >
              1
            </span>
            <span className={`text-xs font-semibold ${step >= 1 ? 'text-slate-900' : 'text-slate-400'}`}>
              Campaign Setup & Mailbox
            </span>
          </div>
          <div className="h-0.5 w-10 bg-slate-200" />
          <div className="flex items-center gap-2">
            <span
              className={`w-6 h-6 rounded-full flex items-center justify-center text-xs font-bold ${
                step >= 2 ? 'bg-primary-600 text-white' : 'bg-slate-100 text-slate-400'
              }`}
            >
              2
            </span>
            <span className={`text-xs font-semibold ${step >= 2 ? 'text-slate-900' : 'text-slate-400'}`}>
              Target Audience & ICP (AI-Assisted)
            </span>
          </div>
          <div className="h-0.5 w-10 bg-slate-200" />
          <div className="flex items-center gap-2">
            <span
              className={`w-6 h-6 rounded-full flex items-center justify-center text-xs font-bold ${
                step >= 3 ? 'bg-primary-600 text-white' : 'bg-slate-100 text-slate-400'
              }`}
            >
              3
            </span>
            <span className={`text-xs font-semibold ${step >= 3 ? 'text-slate-900' : 'text-slate-400'}`}>
              AI Messaging Strategy & Follow-ups
            </span>
          </div>
        </div>
      </div>

      {/* Form Container */}
      <form
        onSubmit={handleSubmit}
        onKeyDown={(e) => {
          if (e.key === 'Enter' && e.target instanceof HTMLInputElement) {
            e.preventDefault();
          }
        }}
        className="bg-white p-6 rounded-2xl border border-slate-200/80 shadow-xs space-y-6"
      >
        {error && (
          <div className="p-3 bg-red-50 border border-red-200 text-xs text-red-600 rounded-xl font-medium">
            ⚠️ {error}
          </div>
        )}

        {/* STEP 1: BASICS & SENDER */}
        {step === 1 && (
          <div className="space-y-4 animate-in fade-in">
            <div>
              <h2 className="text-sm font-bold text-slate-900">Step 1: Campaign Identity & Multi-Sender Setup</h2>
              <p className="text-xs text-slate-500 mt-0.5">Name your campaign and select sender mailbox accounts for automated round-robin rotation.</p>
            </div>
            <div className="space-y-4 pt-1">
              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">
                  Campaign Name <span className="text-red-500">*</span>
                </label>
                <input
                  type="text"
                  required
                  placeholder="e.g., US Enterprise CTOs - Q4 Outbound"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  className="w-full px-3.5 py-2.5 border border-slate-300 rounded-xl text-xs focus:outline-none focus:ring-2 focus:ring-primary-500"
                />
              </div>

              {/* Multi-Sender Pool Selection */}
              <div className="bg-slate-50 p-4 rounded-xl border border-slate-200/80 space-y-3">
                <div className="flex items-center justify-between">
                  <div>
                    <label className="block text-xs font-bold text-slate-800">
                      📬 Multi-Sender Rotation Pool ({selectedAccountIds.length}/{outreachAccounts.length} selected)
                    </label>
                    <p className="text-[11px] text-slate-500">
                      Cold emails will automatically rotate between selected mailboxes to protect sender domain reputation.
                    </p>
                  </div>
                  {outreachAccounts.length > 0 && (
                    <button
                      type="button"
                      onClick={() => {
                        if (selectedAccountIds.length === outreachAccounts.length) {
                          setSelectedAccountIds([]);
                        } else {
                          setSelectedAccountIds(outreachAccounts.map((a) => a.id));
                        }
                      }}
                      className="text-xs text-primary-600 hover:text-primary-800 font-semibold"
                    >
                      {selectedAccountIds.length === outreachAccounts.length ? 'Deselect All' : 'Select All'}
                    </button>
                  )}
                </div>

                {outreachAccounts.length === 0 ? (
                  <p className="text-xs text-slate-400 py-2">
                    No dedicated outreach sender mailboxes connected yet. (You can still source leads and push them to Kanban CRM).
                  </p>
                ) : (
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 pt-1">
                    {outreachAccounts.map((acc: any) => {
                      const isSelected = selectedAccountIds.includes(acc.id);
                      return (
                        <div
                          key={acc.id}
                          onClick={() => {
                            if (isSelected) {
                              setSelectedAccountIds(selectedAccountIds.filter((id) => id !== acc.id));
                            } else {
                              setSelectedAccountIds([...selectedAccountIds, acc.id]);
                            }
                          }}
                          className={`p-3 rounded-xl border cursor-pointer transition-all flex items-center justify-between ${
                            isSelected
                              ? 'bg-primary-50/60 border-primary-300 ring-1 ring-primary-300'
                              : 'bg-white border-slate-200 hover:bg-slate-50 opacity-70'
                          }`}
                        >
                          <div className="min-w-0 flex-1 pr-2">
                            <div className="flex items-center gap-1.5">
                              <span className="text-xs font-bold text-slate-900 truncate">{acc.name}</span>
                              {acc.warmupEnabled && (
                                <span className="text-[9px] font-bold px-1.5 py-0.2 rounded bg-amber-100 text-amber-800">
                                  Warmup (+{acc.rampUpPerDay}/d)
                                </span>
                              )}
                            </div>
                            <p className="text-[11px] font-mono text-slate-500 truncate">{acc.senderEmail}</p>
                            <p className="text-[10px] text-slate-400 mt-0.5">
                              Limit: {acc.sentToday}/{acc.warmupEnabled ? acc.currentWarmupLimit : acc.dailyLimit}/day
                            </p>
                          </div>
                          <input
                            type="checkbox"
                            checked={isSelected}
                            onChange={() => {}}
                            className="w-4 h-4 text-primary-600 rounded border-slate-300 pointer-events-none"
                          />
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            </div>
          </div>
        )}

        {/* STEP 2: STRUCTURED TARGETING CRITERIA */}
        {step === 2 && (
          <div className="space-y-5 animate-in fade-in">
            <div>
              <h2 className="text-sm font-bold text-slate-900">Step 2: Target Audience & ICP Parameters (AI-Assisted)</h2>
              <p className="text-xs text-slate-500 mt-0.5">Define your ideal prospect role, geographic territory, industry, and target volume.</p>
            </div>

            {/* AI ICP & Targeting Assistant Chatbox (Point 1) */}
            <div className="p-4 bg-gradient-to-r from-blue-50/90 via-indigo-50/80 to-purple-50/90 rounded-2xl border border-indigo-200/80 space-y-3 shadow-2xs">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <span className="text-lg">✨</span>
                  <div>
                    <h3 className="text-xs font-bold text-indigo-950">
                      AI ICP & Targeting Assistant
                    </h3>
                    <p className="text-[11px] text-indigo-700/80">
                      Describe your brand and ideal customer profile (ICP) in natural language. AI will research and auto-fill the targeting parameters below.
                    </p>
                  </div>
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
                <input
                  type="text"
                  placeholder="Brand / URL (e.g. jetdigitalpro.com)"
                  value={icpBrandUrl}
                  onChange={(e) => setIcpBrandUrl(e.target.value)}
                  className="px-3 py-2 bg-white border border-indigo-200 rounded-xl text-xs text-slate-800 placeholder:text-slate-400 focus:ring-2 focus:ring-indigo-500"
                />
                <input
                  type="text"
                  placeholder="Target ICP description (e.g. Founder/CTO e-commerce in US who need scaling...)"
                  value={icpChatInput}
                  onChange={(e) => setIcpChatInput(e.target.value)}
                  className="sm:col-span-2 px-3 py-2 bg-white border border-indigo-200 rounded-xl text-xs text-slate-800 placeholder:text-slate-400 focus:ring-2 focus:ring-indigo-500"
                />
              </div>

              <div className="flex justify-end">
                <button
                  type="button"
                  onClick={handleAutoResearchIcp}
                  disabled={isResearchingIcp || (!icpChatInput.trim() && !icpBrandUrl.trim())}
                  className="px-4 py-2 bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-bold rounded-xl transition-all shadow-xs disabled:opacity-50 flex items-center gap-1.5 cursor-pointer"
                >
                  {isResearchingIcp ? (
                    <>
                      <span className="w-3.5 h-3.5 border-2 border-white border-t-transparent rounded-full animate-spin" />
                      <span>Researching ICP...</span>
                    </>
                  ) : (
                    <>
                      <span>✨</span>
                      <span>Auto-Fill Targeting with AI</span>
                    </>
                  )}
                </button>
              </div>
            </div>

            {/* Structured Inputs */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 pt-1">
              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">
                  Target Job Title / Decision Maker Role <span className="text-red-500">*</span>
                </label>
                <input
                  type="text"
                  required
                  placeholder="e.g., Chief Technology Officer, VP Sales, Founder, Head of Marketing"
                  value={targetRole}
                  onChange={(e) => setTargetRole(e.target.value)}
                  className="w-full px-3.5 py-2.5 border border-slate-300 rounded-xl text-xs bg-white focus:outline-none focus:ring-2 focus:ring-primary-500"
                />
                <p className="text-[10px] text-slate-400 mt-1">
                  The discovery engine automatically matches related decision makers (e.g. CTO, VP Engineering).
                </p>
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">
                  Target Country / Region / City <span className="text-red-500">*</span>
                </label>
                <input
                  type="text"
                  required
                  placeholder="e.g., United States, Indonesia, Jakarta, Singapore, United Kingdom"
                  value={targetLocation}
                  onChange={(e) => setTargetLocation(e.target.value)}
                  className="w-full px-3.5 py-2.5 border border-slate-300 rounded-xl text-xs bg-white focus:outline-none focus:ring-2 focus:ring-primary-500"
                />
              </div>

              {/* Multi-Select Target Industry (Point 2) */}
              <div className="sm:col-span-2">
                <div className="flex items-center justify-between mb-1.5">
                  <label className="block text-xs font-semibold text-slate-700">
                    Target Industry / Vertical (Multi-Select) <span className="text-red-500">*</span>
                  </label>
                  <span className="text-[11px] text-slate-400 font-medium">
                    {selectedIndustries.length} selected
                  </span>
                </div>

                <div className="space-y-2.5 p-3.5 bg-slate-50 border border-slate-200 rounded-xl">
                  <div className="flex flex-wrap gap-1.5">
                    {INDUSTRY_OPTIONS.map((ind) => {
                      const isSelected = selectedIndustries.includes(ind);
                      return (
                        <button
                          key={ind}
                          type="button"
                          onClick={() => {
                            if (ind === 'All Industries (Broad)') {
                              setSelectedIndustries(['All Industries (Broad)']);
                              setTargetIndustry('All Industries (Broad)');
                              return;
                            }
                            let updated: string[];
                            if (isSelected) {
                              updated = selectedIndustries.filter((i) => i !== ind);
                              if (updated.length === 0) updated = ['All Industries (Broad)'];
                            } else {
                              updated = [...selectedIndustries.filter((i) => i !== 'All Industries (Broad)'), ind];
                            }
                            setSelectedIndustries(updated);
                            setTargetIndustry(updated.join(', '));
                          }}
                          className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-all border cursor-pointer ${
                            isSelected
                              ? 'bg-primary-600 text-white border-primary-600 shadow-2xs'
                              : 'bg-white text-slate-700 border-slate-200 hover:bg-slate-100 hover:border-slate-300'
                          }`}
                        >
                          {isSelected ? '✓ ' : '+ '}
                          {ind}
                        </button>
                      );
                    })}

                    {/* Custom Industry Tags added by user */}
                    {selectedIndustries
                      .filter((ind) => !INDUSTRY_OPTIONS.includes(ind))
                      .map((customInd) => (
                        <span
                          key={customInd}
                          className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-bold bg-indigo-600 text-white shadow-2xs"
                        >
                          <span>✓ {customInd}</span>
                          <button
                            type="button"
                            onClick={() => {
                              const updated = selectedIndustries.filter((i) => i !== customInd);
                              const finalInd = updated.length > 0 ? updated : ['All Industries (Broad)'];
                              setSelectedIndustries(finalInd);
                              setTargetIndustry(finalInd.join(', '));
                            }}
                            className="hover:text-red-200 font-bold ml-0.5 text-xs"
                            title="Remove custom industry"
                          >
                            ✕
                          </button>
                        </span>
                      ))}
                  </div>

                  {/* Add Custom Industry Input Box */}
                  <div className="flex items-center gap-2 pt-2 border-t border-slate-200/70">
                    <input
                      type="text"
                      placeholder="Add custom niche industry (e.g. Dental Clinics, Solar Energy, B2B SaaS)..."
                      value={customIndustryInput}
                      onChange={(e) => setCustomIndustryInput(e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter') {
                          e.preventDefault();
                          if (customIndustryInput.trim()) {
                            const val = customIndustryInput.trim();
                            if (!selectedIndustries.includes(val)) {
                              const updated = [...selectedIndustries.filter((i) => i !== 'All Industries (Broad)'), val];
                              setSelectedIndustries(updated);
                              setTargetIndustry(updated.join(', '));
                            }
                            setCustomIndustryInput('');
                          }
                        }
                      }}
                      className="flex-1 px-3 py-1.5 bg-white border border-slate-300 rounded-lg text-xs text-slate-800 focus:outline-none focus:ring-2 focus:ring-primary-500"
                    />
                    <button
                      type="button"
                      onClick={() => {
                        if (customIndustryInput.trim()) {
                          const val = customIndustryInput.trim();
                          if (!selectedIndustries.includes(val)) {
                            const updated = [...selectedIndustries.filter((i) => i !== 'All Industries (Broad)'), val];
                            setSelectedIndustries(updated);
                            setTargetIndustry(updated.join(', '));
                          }
                          setCustomIndustryInput('');
                        }
                      }}
                      className="px-3 py-1.5 bg-slate-800 hover:bg-slate-900 text-white text-xs font-bold rounded-lg transition-colors cursor-pointer"
                    >
                      + Add Niche
                    </button>
                  </div>
                </div>
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">
                  Target Prospect Batch Size
                </label>
                <select
                  value={leadCount}
                  onChange={(e) => setLeadCount(Number(e.target.value))}
                  className="w-full px-3.5 py-2.5 border border-slate-300 rounded-xl text-xs focus:outline-none focus:ring-2 focus:ring-primary-500 bg-white font-medium"
                >
                  <option value={5}>5 Leads (Quick Test)</option>
                  <option value={10}>10 Leads (Recommended Interactive)</option>
                  <option value={25}>25 Leads (Standard Sourcing)</option>
                  <option value={50}>50 Leads (Large Batch)</option>
                  <option value={100}>100 Leads (Bulk Worker Queue)</option>
                  <option value={500}>500 Leads (Massive Scale Queue)</option>
                  <option value={1000}>1,000 Leads (High Volume Enterprise)</option>
                </select>
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">
                  Additional Search Qualifier / Niche Keyword (Optional)
                </label>
                <input
                  type="text"
                  placeholder="e.g., B2B SaaS, Series A, Ecommerce, Healthcare tech"
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="w-full px-3.5 py-2.5 border border-slate-300 rounded-xl text-xs bg-white focus:outline-none focus:ring-2 focus:ring-primary-500"
                />
              </div>
            </div>
          </div>
        )}

        {/* STEP 3: AI COPYWRITING STRATEGY & OFFER GENERATOR */}
        {step === 3 && (
          <div className="space-y-5 animate-in fade-in">
            <div>
              <h2 className="text-sm font-bold text-slate-900">Step 3: AI Copywriting Strategy & Offer Context</h2>
              <p className="text-xs text-slate-500 mt-0.5">
                Provide your website or brand URL to auto-extract knowledge, or write your custom value proposition.
              </p>
            </div>

            {/* AI Auto-Research Box */}
            <div className="p-4 bg-gradient-to-r from-indigo-50/80 via-purple-50/60 to-indigo-50/80 rounded-2xl border border-indigo-200/80 space-y-3 shadow-2xs">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <span className="text-base">✨</span>
                  <div>
                    <h3 className="text-xs font-bold text-indigo-950">
                      Auto-Extract Offer from Website / Brand
                    </h3>
                    <p className="text-[11px] text-indigo-700/80">
                      AI will analyze your landing page, pricing, and services to build a compelling outreach pitch.
                    </p>
                  </div>
                </div>
              </div>

              <div className="flex gap-2">
                <input
                  type="text"
                  placeholder="https://yourcompany.com or brand name"
                  value={brandInput}
                  onChange={(e) => setBrandInput(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') {
                      e.preventDefault();
                      handleAutoResearchBrand();
                    }
                  }}
                  className="flex-1 px-3.5 py-2 bg-white border border-indigo-200 rounded-xl text-xs focus:outline-none focus:ring-2 focus:ring-indigo-500 text-slate-800 placeholder:text-slate-400"
                />
                <button
                  type="button"
                  onClick={() => handleAutoResearchBrand()}
                  disabled={isResearchingBrand}
                  className="px-4 py-2 bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-semibold rounded-xl transition-all shadow-xs disabled:opacity-50 flex items-center gap-1.5 flex-shrink-0"
                >
                  {isResearchingBrand ? (
                    <>
                      <span className="w-3.5 h-3.5 border-2 border-white border-t-transparent rounded-full animate-spin" />
                      <span>Extracting...</span>
                    </>
                  ) : (
                    <span>Auto-Generate Offer</span>
                  )}
                </button>
              </div>
            </div>

            {/* Tone & Length Controls */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 pt-1">
              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1.5">Communication Tone</label>
                <div className="grid grid-cols-3 gap-2">
                  {(['formal', 'conversational', 'direct'] as const).map((t) => (
                    <button
                      key={t}
                      type="button"
                      onClick={() => handleToneChange(t)}
                      className={`py-2 px-3 text-xs font-medium rounded-xl border transition-all capitalize ${
                        aiTone === t
                          ? 'bg-primary-50 border-primary-500 text-primary-700 font-semibold shadow-2xs'
                          : 'bg-white border-slate-200 text-slate-600 hover:bg-slate-50'
                      }`}
                    >
                      {t}
                    </button>
                  ))}
                </div>
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1.5">Email Length</label>
                <div className="grid grid-cols-2 gap-2">
                  {(['concise', 'detailed'] as const).map((l) => (
                    <button
                      key={l}
                      type="button"
                      onClick={() => handleLengthChange(l)}
                      className={`py-2 px-3 text-xs font-medium rounded-xl border transition-all capitalize ${
                        aiLength === l
                          ? 'bg-primary-50 border-primary-500 text-primary-700 font-semibold shadow-2xs'
                          : 'bg-white border-slate-200 text-slate-600 hover:bg-slate-50'
                      }`}
                    >
                      {l === 'concise' ? 'Concise (Short)' : 'Detailed (Value-add)'}
                    </button>
                  ))}
                </div>
              </div>
            </div>

            {/* Prompt Instructions Editor */}
            <div>
              <div className="flex items-center justify-between mb-1.5">
                <label className="block text-xs font-semibold text-slate-700">
                  AI Value Proposition & Outreach Strategy Instructions
                </label>
                <span className="text-[11px] text-slate-400">Customizable prompt</span>
              </div>
              <textarea
                rows={5}
                value={promptInstructions}
                onChange={(e) => setPromptInstructions(e.target.value)}
                placeholder="Describe your offer, USP, key client benefits, and call to action..."
                className="w-full px-3.5 py-3 border border-slate-300 rounded-xl text-sm leading-relaxed focus:outline-none focus:ring-2 focus:ring-primary-500 bg-white text-slate-800"
              />
              <p className="text-[11px] text-slate-400 mt-1">
                The AI copywriter will tailor this pitch for each recipient using their role, company domain, and background.
              </p>
            </div>

            {/* Automated Multi-Step Drip Follow-Up */}
            <div className="p-4 bg-slate-50 rounded-2xl border border-slate-200/80 space-y-3">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <input
                    type="checkbox"
                    id="newDripToggle"
                    checked={dripEnabled}
                    onChange={(e) => setDripEnabled(e.target.checked)}
                    className="w-4 h-4 rounded border-slate-300 text-primary-600 focus:ring-primary-500"
                  />
                  <div>
                    <label htmlFor="newDripToggle" className="text-xs font-bold text-slate-900 cursor-pointer flex items-center gap-1.5">
                      <span>⚡</span>
                      <span>Enable Automated Multi-Step Follow Up (2-3x Drip Sequence)</span>
                    </label>
                    <p className="text-[11px] text-slate-500">
                      Automatically sends polite sequential follow-up emails if the prospect has not replied.
                    </p>
                  </div>
                </div>
              </div>

              {dripEnabled && (
                <div className="space-y-4 pt-3 border-t border-slate-200/60 animate-in fade-in">
                  <div>
                    <label className="block text-xs font-bold text-slate-800 mb-1">Number of Follow-Up Steps</label>
                    <select
                      value={dripStepsCount}
                      onChange={(e) => setDripStepsCount(Number(e.target.value))}
                      className="w-full sm:w-64 px-3 py-2 bg-white border border-slate-300 rounded-xl text-xs font-semibold focus:ring-2 focus:ring-primary-500"
                    >
                      <option value={1}>1 Follow-up Step (Standard)</option>
                      <option value={2}>2 Follow-up Steps (Recommended)</option>
                      <option value={3}>3 Follow-up Steps (Aggressive Nurture)</option>
                    </select>
                  </div>

                  {/* Step 1 Settings */}
                  <div className="p-3 bg-white rounded-xl border border-slate-200/80 space-y-2">
                    <p className="text-xs font-bold text-slate-800">Follow-Up Step 1</p>
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                      <div>
                        <label className="block text-[11px] font-semibold text-slate-700 mb-1">
                          Delay (after previous email) <span className="text-slate-400 font-normal">• 7d default</span>
                        </label>
                        {!customDelay1 ? (
                          <div className="flex gap-1.5">
                            <select
                              value={dripDelayDays}
                              onChange={(e) => {
                                const val = Number(e.target.value);
                                if (val === -1) {
                                  setCustomDelay1(true);
                                } else {
                                  setDripDelayDays(val);
                                }
                              }}
                              className="w-full px-3 py-2 bg-white border border-slate-300 rounded-xl text-xs font-medium"
                            >
                              <option value={3}>After 3 Days</option>
                              <option value={5}>After 5 Days</option>
                              <option value={7}>After 7 Days (Default)</option>
                              <option value={10}>After 10 Days</option>
                              <option value={14}>After 14 Days</option>
                              <option value={-1}>Custom Days...</option>
                            </select>
                          </div>
                        ) : (
                          <div className="flex items-center gap-1.5">
                            <input
                              type="number"
                              min={1}
                              max={60}
                              value={dripDelayDays}
                              onChange={(e) => setDripDelayDays(Math.max(1, Number(e.target.value)))}
                              className="w-24 px-3 py-2 bg-white border border-indigo-300 rounded-xl text-xs font-bold"
                            />
                            <span className="text-xs text-slate-500">days</span>
                            <button
                              type="button"
                              onClick={() => { setCustomDelay1(false); setDripDelayDays(7); }}
                              className="text-[10px] text-slate-400 hover:text-slate-600 underline"
                            >
                              Presets
                            </button>
                          </div>
                        )}
                      </div>
                      <div>
                        <label className="block text-[11px] font-semibold text-slate-700 mb-1">Subject (Optional)</label>
                        <input
                          type="text"
                          placeholder="Re: Quick follow up (defaults to Re: Original Subject)"
                          value={dripSubject}
                          onChange={(e) => setDripSubject(e.target.value)}
                          className="w-full px-3 py-2 bg-white border border-slate-300 rounded-xl text-xs"
                        />
                      </div>
                    </div>
                  </div>

                  {/* Step 2 Settings */}
                  {dripStepsCount >= 2 && (
                    <div className="p-3 bg-white rounded-xl border border-slate-200/80 space-y-2 animate-in fade-in">
                      <p className="text-xs font-bold text-slate-800">Follow-Up Step 2</p>
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                        <div>
                          <label className="block text-[11px] font-semibold text-slate-700 mb-1">
                            Delay (after Step 1 email) <span className="text-slate-400 font-normal">• 7d default</span>
                          </label>
                          {!customDelay2 ? (
                            <div className="flex gap-1.5">
                              <select
                                value={dripDelayDays2}
                                onChange={(e) => {
                                  const val = Number(e.target.value);
                                  if (val === -1) {
                                    setCustomDelay2(true);
                                  } else {
                                    setDripDelayDays2(val);
                                  }
                                }}
                                className="w-full px-3 py-2 bg-white border border-slate-300 rounded-xl text-xs font-medium"
                              >
                                <option value={3}>After 3 Days</option>
                                <option value={5}>After 5 Days</option>
                                <option value={7}>After 7 Days (Default)</option>
                                <option value={10}>After 10 Days</option>
                                <option value={14}>After 14 Days</option>
                                <option value={-1}>Custom Days...</option>
                              </select>
                            </div>
                          ) : (
                            <div className="flex items-center gap-1.5">
                              <input
                                type="number"
                                min={1}
                                max={60}
                                value={dripDelayDays2}
                                onChange={(e) => setDripDelayDays2(Math.max(1, Number(e.target.value)))}
                                className="w-24 px-3 py-2 bg-white border border-indigo-300 rounded-xl text-xs font-bold"
                              />
                              <span className="text-xs text-slate-500">days</span>
                              <button
                                type="button"
                                onClick={() => { setCustomDelay2(false); setDripDelayDays2(7); }}
                                className="text-[10px] text-slate-400 hover:text-slate-600 underline"
                              >
                                Presets
                              </button>
                            </div>
                          )}
                        </div>
                        <div>
                          <label className="block text-[11px] font-semibold text-slate-700 mb-1">Subject 2 (Optional)</label>
                          <input
                            type="text"
                            placeholder="Re: Following up again..."
                            value={dripSubject2}
                            onChange={(e) => setDripSubject2(e.target.value)}
                            className="w-full px-3 py-2 bg-white border border-slate-300 rounded-xl text-xs"
                          />
                        </div>
                      </div>
                    </div>
                  )}

                  {/* Step 3 Settings */}
                  {dripStepsCount >= 3 && (
                    <div className="p-3 bg-white rounded-xl border border-slate-200/80 space-y-2 animate-in fade-in">
                      <p className="text-xs font-bold text-slate-800">Follow-Up Step 3 (Final)</p>
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                        <div>
                          <label className="block text-[11px] font-semibold text-slate-700 mb-1">
                            Delay (after Step 2 email) <span className="text-slate-400 font-normal">• 7d default</span>
                          </label>
                          {!customDelay3 ? (
                            <div className="flex gap-1.5">
                              <select
                                value={dripDelayDays3}
                                onChange={(e) => {
                                  const val = Number(e.target.value);
                                  if (val === -1) {
                                    setCustomDelay3(true);
                                  } else {
                                    setDripDelayDays3(val);
                                  }
                                }}
                                className="w-full px-3 py-2 bg-white border border-slate-300 rounded-xl text-xs font-medium"
                              >
                                <option value={3}>After 3 Days</option>
                                <option value={5}>After 5 Days</option>
                                <option value={7}>After 7 Days (Default)</option>
                                <option value={10}>After 10 Days</option>
                                <option value={14}>After 14 Days</option>
                                <option value={-1}>Custom Days...</option>
                              </select>
                            </div>
                          ) : (
                            <div className="flex items-center gap-1.5">
                              <input
                                type="number"
                                min={1}
                                max={60}
                                value={dripDelayDays3}
                                onChange={(e) => setDripDelayDays3(Math.max(1, Number(e.target.value)))}
                                className="w-24 px-3 py-2 bg-white border border-indigo-300 rounded-xl text-xs font-bold"
                              />
                              <span className="text-xs text-slate-500">days</span>
                              <button
                                type="button"
                                onClick={() => { setCustomDelay3(false); setDripDelayDays3(7); }}
                                className="text-[10px] text-slate-400 hover:text-slate-600 underline"
                              >
                                Presets
                              </button>
                            </div>
                          )}
                        </div>
                        <div>
                          <label className="block text-[11px] font-semibold text-slate-700 mb-1">Subject 3 (Optional)</label>
                          <input
                            type="text"
                            placeholder="Re: Final check-in / Closing loop"
                            value={dripSubject3}
                            onChange={(e) => setDripSubject3(e.target.value)}
                            className="w-full px-3 py-2 bg-white border border-slate-300 rounded-xl text-xs"
                          />
                        </div>
                      </div>
                    </div>
                  )}

                  {/* Sequence Preview Box (Recognition over Recall) */}
                  <div className="p-3.5 bg-slate-100/80 rounded-xl border border-slate-200 text-xs space-y-1.5">
                    <p className="text-[11px] font-bold text-slate-700 uppercase tracking-wider flex items-center gap-1.5">
                      <span>👁️</span>
                      <span>Drip Sequence Preview</span>
                    </p>
                    <p className="text-slate-600 text-[11px]">
                      • <strong>Initial Touch:</strong> Personalized cold email sent upon approval.
                    </p>
                    <p className="text-slate-600 text-[11px]">
                      • <strong>Step 1:</strong> Follow-up after {dripDelayDays} days ({dripSubject || 'Re: Original Subject'}).
                    </p>
                    {dripStepsCount >= 2 && (
                      <p className="text-slate-600 text-[11px]">
                        • <strong>Step 2:</strong> Follow-up after +{dripDelayDays2} days ({dripSubject2 || 'Re: Following up again...'}).
                      </p>
                    )}
                    {dripStepsCount >= 3 && (
                      <p className="text-slate-600 text-[11px]">
                        • <strong>Step 3 (Final):</strong> Final check-in after +{dripDelayDays3} days ({dripSubject3 || 'Re: Final check-in / Closing loop'}).
                      </p>
                    )}
                    <p className="text-[10px] text-emerald-700 font-semibold pt-1">
                      ✓ Sequence automatically halts if the prospect replies, books a call, bounces, or unsubscribes.
                    </p>
                  </div>
                </div>
              )}
            </div>
          </div>
        )}

        {/* Footer Navigation */}
        <div className="flex items-center justify-between pt-4 border-t border-slate-100">
          {step > 1 ? (
            <button
              type="button"
              onClick={() => setStep((s) => s - 1)}
              disabled={loading}
              className="px-4 py-2 border border-slate-300 hover:bg-slate-50 text-slate-700 text-xs font-semibold rounded-xl transition-colors disabled:opacity-50"
            >
              Back
            </button>
          ) : (
            <div />
          )}

          {step < 3 ? (
            <button
              type="button"
              onClick={handleNextStep}
              className="px-6 py-2 bg-primary-600 hover:bg-primary-700 text-white text-xs font-semibold rounded-xl shadow-xs transition-colors"
            >
              Continue to Step {step + 1} →
            </button>
          ) : (
            <button
              type="submit"
              disabled={loading}
              className="px-6 py-2.5 bg-primary-600 hover:bg-primary-700 text-white text-xs font-bold rounded-xl shadow-xs transition-colors disabled:opacity-50 flex items-center gap-2"
            >
              {loading ? (
                <>
                  <span className="w-3.5 h-3.5 border-2 border-white border-t-transparent rounded-full animate-spin" />
                  <span>{loadingStep || 'Creating Campaign...'}</span>
                </>
              ) : (
                <span>Launch Outreach Workspace & Discover Leads →</span>
              )}
            </button>
          )}
        </div>
      </form>
    </div>
  );
}
