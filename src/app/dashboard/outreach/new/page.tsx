'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';

interface OutreachAccountOption {
  id: string;
  name: string;
  senderEmail: string;
  isActive: boolean;
}

const INDUSTRY_OPTIONS = [
  'Information Technology & Services',
  'Software & SaaS',
  'Financial Services & Fintech',
  'Healthcare & Biotechnology',
  'E-commerce & Retail',
  'Management Consulting & Professional Services',
  'Marketing & Advertising',
  'Real Estate & Construction',
  'Manufacturing & Supply Chain',
  'Education & EdTech',
  'Energy & Utilities',
  'Other / Custom Niche',
];

export default function NewOutreachCampaignPage() {
  const router = useRouter();
  const [step, setStep] = useState<1 | 2 | 3>(1);

  // Step 1: Basics
  const [name, setName] = useState('');
  const [selectedAccountId, setSelectedAccountId] = useState<string>('');
  const [outreachAccounts, setOutreachAccounts] = useState<OutreachAccountOption[]>([]);

  // Step 2: Targeting (Pak Nell's Standard Parameters)
  const [targetRole, setTargetRole] = useState('Chief Technology Officer');
  const [targetLocation, setTargetLocation] = useState('United States');
  const [targetIndustry, setTargetIndustry] = useState('Information Technology & Services');
  const [searchQuery, setSearchQuery] = useState('');
  const [leadCount, setLeadCount] = useState(10);

  // Step 3: AI Copywriting Strategy
  const [aiTone, setAiTone] = useState<'formal' | 'conversational' | 'direct'>('formal');
  const [aiLength, setAiLength] = useState<'concise' | 'detailed'>('concise');
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
        setError('Please specify a target role or a custom search query.');
        return;
      }
      setStep(3);
    }
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();

    // STRICT GUARD: Do not allow submission if not on Step 3
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
      router.push(`/dashboard/outreach/${campaign.id}?autoSource=true&limit=${leadCount}`);
    } catch (err: any) {
      setError(err.message || 'An error occurred while creating the campaign.');
      setLoading(false);
      setLoadingStep('');
    }
  }

  return (
    <div className="p-4 sm:p-6 lg:p-8 max-w-4xl mx-auto space-y-6">
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
            Follow the 3-step wizard to configure lead sourcing parameters and AI copywriting directives.
          </p>
        </div>
      </div>

      {/* Step Indicator */}
      <div className="bg-white p-4 rounded-2xl border border-slate-200/80 shadow-xs">
        <div className="flex items-center justify-between max-w-2xl mx-auto">
          <div className="flex items-center gap-2">
            <div className={`w-7 h-7 rounded-full flex items-center justify-center text-xs font-bold ${step >= 1 ? 'bg-primary-600 text-white' : 'bg-slate-100 text-slate-500'}`}>
              1
            </div>
            <span className={`text-xs font-bold ${step >= 1 ? 'text-slate-900' : 'text-slate-400'}`}>
              Basics & Mailbox
            </span>
          </div>
          <div className={`flex-1 h-0.5 mx-4 ${step >= 2 ? 'bg-primary-600' : 'bg-slate-200'}`} />
          <div className="flex items-center gap-2">
            <div className={`w-7 h-7 rounded-full flex items-center justify-center text-xs font-bold ${step >= 2 ? 'bg-primary-600 text-white' : 'bg-slate-100 text-slate-500'}`}>
              2
            </div>
            <span className={`text-xs font-bold ${step >= 2 ? 'text-slate-900' : 'text-slate-400'}`}>
              Targeting Criteria
            </span>
          </div>
          <div className={`flex-1 h-0.5 mx-4 ${step >= 3 ? 'bg-primary-600' : 'bg-slate-200'}`} />
          <div className="flex items-center gap-2">
            <div className={`w-7 h-7 rounded-full flex items-center justify-center text-xs font-bold ${step >= 3 ? 'bg-primary-600 text-white' : 'bg-slate-100 text-slate-500'}`}>
              3
            </div>
            <span className={`text-xs font-bold ${step >= 3 ? 'text-slate-900' : 'text-slate-400'}`}>
              AI Strategy & Review
            </span>
          </div>
        </div>
      </div>

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
          <div className="space-y-4 animate-in fade-in">
            <div>
              <h2 className="text-sm font-bold text-slate-900">Step 2: Target Lead Parameters (LinkedIn Prospecting)</h2>
              <p className="text-xs text-slate-500 mt-0.5">Define your ideal customer profile (ICP) by role, location, and industry.</p>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 pt-2">
              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">Target Job Title / Role *</label>
                <input
                  type="text"
                  required
                  placeholder="e.g., Chief Technology Officer, VP Sales, Founder"
                  value={targetRole}
                  onChange={(e) => setTargetRole(e.target.value)}
                  className="w-full px-3.5 py-2.5 border border-slate-300 rounded-xl text-xs focus:outline-none focus:ring-2 focus:ring-primary-500"
                />
              </div>
              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">Geographic Location *</label>
                <input
                  type="text"
                  required
                  placeholder="e.g., United States, Singapore, Jakarta, United Kingdom"
                  value={targetLocation}
                  onChange={(e) => setTargetLocation(e.target.value)}
                  className="w-full px-3.5 py-2.5 border border-slate-300 rounded-xl text-xs focus:outline-none focus:ring-2 focus:ring-primary-500"
                />
              </div>
              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">Target Industry / Niche</label>
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
                <label className="block text-xs font-semibold text-slate-700 mb-1">Initial Prospect Count</label>
                <select
                  value={leadCount}
                  onChange={(e) => setLeadCount(Number(e.target.value))}
                  className="w-full px-3.5 py-2.5 border border-slate-300 rounded-xl text-xs focus:outline-none focus:ring-2 focus:ring-primary-500 bg-white"
                >
                  <option value={5}>5 Leads (Quick Test)</option>
                  <option value={10}>10 Leads (Recommended Batch)</option>
                  <option value={25}>25 Leads (Standard Sourcing)</option>
                  <option value={50}>50 Leads (Comprehensive)</option>
                </select>
              </div>
              <div className="sm:col-span-2">
                <label className="block text-xs font-semibold text-slate-700 mb-1">Custom Search Query (Optional)</label>
                <input
                  type="text"
                  placeholder="e.g., B2B SaaS Series A funding scale"
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="w-full px-3.5 py-2.5 border border-slate-300 rounded-xl text-xs focus:outline-none focus:ring-2 focus:ring-primary-500"
                />
              </div>
            </div>
          </div>
        )}

        {/* STEP 3: AI COPYWRITING STRATEGY & REVIEW */}
        {step === 3 && (
          <div className="space-y-4 animate-in fade-in">
            <div>
              <h2 className="text-sm font-bold text-slate-900">Step 3: AI Copywriting Strategy & Guidelines</h2>
              <p className="text-xs text-slate-500 mt-0.5">Customize tone, length, and value propositions for JetDigitalPro AI copywriter before creating.</p>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 pt-2">
              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">Copy Tone</label>
                <select
                  value={aiTone}
                  onChange={(e) => setAiTone(e.target.value as any)}
                  className="w-full px-3.5 py-2.5 border border-slate-300 rounded-xl text-xs focus:outline-none focus:ring-2 focus:ring-primary-500 bg-white"
                >
                  <option value="formal">Formal & Consultative (Executive)</option>
                  <option value="conversational">Conversational & Friendly (Peer-to-Peer)</option>
                  <option value="direct">Direct & Value-Focused (Zero Fluff)</option>
                </select>
              </div>
              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">Copy Length</label>
                <select
                  value={aiLength}
                  onChange={(e) => setAiLength(e.target.value as any)}
                  className="w-full px-3.5 py-2.5 border border-slate-300 rounded-xl text-xs focus:outline-none focus:ring-2 focus:ring-primary-500 bg-white"
                >
                  <option value="concise">Concise (Under 90 words, high punchiness)</option>
                  <option value="detailed">Detailed (100-140 words, 2 value bullet points)</option>
                </select>
              </div>
            </div>
            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">
                Custom Value Proposition & Pain Points
              </label>
              <textarea
                rows={3}
                value={promptInstructions}
                onChange={(e) => setPromptInstructions(e.target.value)}
                placeholder="Specify key angles, problems you solve, or call-to-actions you want included."
                className="w-full px-3.5 py-2.5 border border-slate-300 rounded-xl text-xs focus:outline-none focus:ring-2 focus:ring-primary-500"
              />
            </div>
          </div>
        )}

        {/* Wizard Navigation Footer */}
        <div className="flex items-center justify-between pt-4 border-t border-slate-100">
          <div>
            {step > 1 ? (
              <button
                type="button"
                onClick={() => setStep((s) => (s - 1) as any)}
                className="px-4 py-2.5 text-xs font-semibold text-slate-600 hover:bg-slate-100 rounded-xl transition-colors"
              >
                ← Back
              </button>
            ) : (
              <Link
                href="/dashboard/outreach"
                className="px-4 py-2.5 text-xs font-semibold text-slate-600 hover:bg-slate-100 rounded-xl transition-colors inline-block"
              >
                Cancel
              </Link>
            )}
          </div>

          <div>
            {step < 3 ? (
              <button
                type="button"
                onClick={handleNextStep}
                className="px-6 py-2.5 bg-primary-600 hover:bg-primary-700 text-white text-xs font-semibold rounded-xl shadow-xs transition-colors"
              >
                Continue to Next Step →
              </button>
            ) : (
              <button
                type="submit"
                disabled={loading}
                className="px-6 py-2.5 bg-primary-600 hover:bg-primary-700 text-white text-xs font-semibold rounded-xl shadow-xs transition-colors disabled:opacity-50 flex items-center gap-2"
              >
                {loading ? (
                  <>
                    <span className="w-3.5 h-3.5 border-2 border-white border-t-transparent rounded-full animate-spin" />
                    <span>{loadingStep || 'Creating Workspace...'}</span>
                  </>
                ) : (
                  <span>🚀 Create Campaign & Start Sourcing</span>
                )}
              </button>
            )}
          </div>
        </div>
      </form>
    </div>
  );
}
