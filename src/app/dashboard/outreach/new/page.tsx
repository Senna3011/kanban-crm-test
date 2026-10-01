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

  // Step 2: Target Lead Parameters
  const [leadProvider, setLeadProvider] = useState<'apify' | 'outscraper'>('apify');
  const [targetRole, setTargetRole] = useState('Chief Technology Officer');
  const [targetLocation, setTargetLocation] = useState('United States');
  const [targetIndustry, setTargetIndustry] = useState('Information Technology & Services');
  const [searchQuery, setSearchQuery] = useState('');
  const [leadCount, setLeadCount] = useState(10);

  // Step 3: AI Copywriting Strategy & Brand Research
  const [aiTone, setAiTone] = useState<'formal' | 'conversational' | 'direct'>('formal');
  const [aiLength, setAiLength] = useState<'concise' | 'detailed'>('concise');
  const [brandInput, setBrandInput] = useState('');
  const [isResearchingBrand, setIsResearchingBrand] = useState(false);
  const [promptInstructions, setPromptInstructions] = useState(
    'Highlight our enterprise web architecture and AI automation capabilities. Offer a complimentary 10-minute discovery review.'
  );

  const [loading, setLoading] = useState(false);
  const [loadingStep, setLoadingStep] = useState('');
  const [error, setError] = useState('');

  useEffect(() => {
    fetch('/api/outreach/accounts')
      .then((r) => r.json())
      .then((data) => {
        const list = Array.isArray(data) ? data : data.accounts || [];
        setOutreachAccounts(list);
        const activeAcc = list.find((a: any) => a.isActive);
        if (activeAcc) {
          setSelectedAccountId(activeAcc.id);
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

  function handleToneChange(newTone: 'formal' | 'conversational' | 'direct') {
    setAiTone(newTone);
    if (brandInput.trim() && !isResearchingBrand) {
      handleAutoResearchBrand(newTone, aiLength);
    }
  }

  function handleLengthChange(newLength: 'concise' | 'detailed') {
    setAiLength(newLength);
    if (brandInput.trim() && !isResearchingBrand) {
      handleAutoResearchBrand(aiTone, newLength);
    }
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
          accountId: selectedAccountId || undefined,
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
              Basics & Mailbox
            </span>
          </div>
          <div className="h-0.5 w-12 bg-slate-200" />
          <div className="flex items-center gap-2">
            <span
              className={`w-6 h-6 rounded-full flex items-center justify-center text-xs font-bold ${
                step >= 2 ? 'bg-primary-600 text-white' : 'bg-slate-100 text-slate-400'
              }`}
            >
              2
            </span>
            <span className={`text-xs font-semibold ${step >= 2 ? 'text-slate-900' : 'text-slate-400'}`}>
              Prospect Targeting
            </span>
          </div>
          <div className="h-0.5 w-12 bg-slate-200" />
          <div className="flex items-center gap-2">
            <span
              className={`w-6 h-6 rounded-full flex items-center justify-center text-xs font-bold ${
                step >= 3 ? 'bg-primary-600 text-white' : 'bg-slate-100 text-slate-400'
              }`}
            >
              3
            </span>
            <span className={`text-xs font-semibold ${step >= 3 ? 'text-slate-900' : 'text-slate-400'}`}>
              AI Pitch Strategy
            </span>
          </div>
        </div>
      </div>

      {/* Form Container */}
      <form
        onSubmit={handleSubmit}
        onKeyDown={(e) => {
          if (e.key === 'Enter' && step < 3 && e.target instanceof HTMLInputElement) {
            e.preventDefault();
            handleNextStep();
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
              <h2 className="text-sm font-bold text-slate-900">Step 1: Campaign Identity & Sender Setup</h2>
              <p className="text-xs text-slate-500 mt-0.5">Name your campaign and select which sender account to associate.</p>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 pt-2">
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
              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">
                  Sender Mailbox <span className="text-slate-400 font-normal">(Optional for staging)</span>
                </label>
                <select
                  value={selectedAccountId}
                  onChange={(e) => setSelectedAccountId(e.target.value)}
                  className="w-full px-3.5 py-2.5 border border-slate-300 rounded-xl text-xs focus:outline-none focus:ring-2 focus:ring-primary-500 bg-white"
                >
                  <option value="">Direct Sourcing & Staging (No Sender Required)</option>
                  {outreachAccounts.map((acc) => (
                    <option key={acc.id} value={acc.id}>
                      {acc.name} ({acc.senderEmail})
                    </option>
                  ))}
                </select>
                <p className="text-[10px] text-slate-400 mt-1">
                  You can source leads and push them to Kanban CRM even without an outbound sender configured.
                </p>
              </div>
            </div>
          </div>
        )}

        {/* STEP 2: STRUCTURED TARGETING CRITERIA */}
        {step === 2 && (
          <div className="space-y-5 animate-in fade-in">
            <div>
              <h2 className="text-sm font-bold text-slate-900">Step 2: Target Lead Parameters (Prospect Discovery)</h2>
              <p className="text-xs text-slate-500 mt-0.5">Define your ideal customer profile (ICP) and select the discovery engine.</p>
            </div>

            {/* Discovery Engine Selector Toggle */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-1">
              <button
                type="button"
                onClick={() => setLeadProvider('apify')}
                className={`p-3.5 rounded-xl border text-left transition-all relative ${
                  leadProvider === 'apify'
                    ? 'border-indigo-600 bg-indigo-50/70 ring-2 ring-indigo-500/20'
                    : 'border-slate-200 bg-white hover:border-slate-300'
                }`}
              >
                <div className="flex items-center justify-between">
                  <span className="text-xs font-bold text-slate-900 flex items-center gap-1.5">
                    <span>👤</span>
                    <span>LinkedIn Decision Makers</span>
                  </span>
                  <span className="text-[10px] font-bold text-indigo-700 bg-indigo-100 px-2 py-0.5 rounded-full">
                    Recommended
                  </span>
                </div>
                <p className="text-[11px] text-slate-500 mt-1.5 leading-relaxed">
                  Discovers authentic individual executive profiles (CTO, VP, CEO, Founder) with personal LinkedIn links.
                </p>
              </button>

              <button
                type="button"
                onClick={() => setLeadProvider('outscraper')}
                className={`p-3.5 rounded-xl border text-left transition-all relative ${
                  leadProvider === 'outscraper'
                    ? 'border-indigo-600 bg-indigo-50/70 ring-2 ring-indigo-500/20'
                    : 'border-slate-200 bg-white hover:border-slate-300'
                }`}
              >
                <div className="flex items-center justify-between">
                  <span className="text-xs font-bold text-slate-900 flex items-center gap-1.5">
                    <span>🏢</span>
                    <span>Company & Business Directory</span>
                  </span>
                  <span className="text-[10px] font-semibold text-slate-600 bg-slate-100 px-2 py-0.5 rounded-full">
                    Outscraper
                  </span>
                </div>
                <p className="text-[11px] text-slate-500 mt-1.5 leading-relaxed">
                  Discovers commercial organizations, local business directories, and corporate domain contacts.
                </p>
              </button>
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

              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">
                  Target Industry / Sector
                </label>
                <select
                  value={targetIndustry}
                  onChange={(e) => setTargetIndustry(e.target.value)}
                  className="w-full px-3.5 py-2.5 border border-slate-300 rounded-xl text-xs focus:outline-none focus:ring-2 focus:ring-primary-500 bg-white"
                >
                  {INDUSTRY_OPTIONS.map((ind) => (
                    <option key={ind} value={ind}>
                      {ind}
                    </option>
                  ))}
                </select>
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

              <div className="sm:col-span-2">
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

            {/* Provider Selection Toggle */}
            <div className="pt-2 border-t border-slate-100">
              <label className="block text-xs font-semibold text-slate-700 mb-2">
                Discovery Scraper Engine
              </label>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div
                  onClick={() => setLeadProvider('apify')}
                  className={`p-3.5 rounded-xl border-2 cursor-pointer transition-all ${
                    leadProvider === 'apify'
                      ? 'border-primary-600 bg-primary-50/50 shadow-xs ring-1 ring-primary-500/20'
                      : 'border-slate-200/90 bg-white hover:border-slate-300 hover:bg-slate-50/60'
                  }`}
                >
                  <div className="flex items-center justify-between mb-1">
                    <div className="flex items-center gap-2">
                      <span className="text-base">🎯</span>
                      <h4 className="text-xs font-bold text-slate-900">Apify Scraper</h4>
                    </div>
                    <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-primary-100 text-primary-800">
                      LinkedIn Index
                    </span>
                  </div>
                  <p className="text-[11px] text-slate-600">
                    Discovers executive contacts and decision makers directly via LinkedIn search indices.
                  </p>
                </div>

                <div
                  onClick={() => setLeadProvider('outscraper')}
                  className={`p-3.5 rounded-xl border-2 cursor-pointer transition-all ${
                    leadProvider === 'outscraper'
                      ? 'border-indigo-600 bg-indigo-50/50 shadow-xs ring-1 ring-indigo-500/20'
                      : 'border-slate-200/90 bg-white hover:border-slate-300 hover:bg-slate-50/60'
                  }`}
                >
                  <div className="flex items-center justify-between mb-1">
                    <div className="flex items-center gap-2">
                      <span className="text-base">⚡</span>
                      <h4 className="text-xs font-bold text-slate-900">Outscraper Engine</h4>
                    </div>
                    <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-indigo-100 text-indigo-800">
                      Corporate Web
                    </span>
                  </div>
                  <p className="text-[11px] text-slate-600">
                    Scrapes company websites and enriches decision makers, work emails, and social profiles.
                  </p>
                </div>
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
