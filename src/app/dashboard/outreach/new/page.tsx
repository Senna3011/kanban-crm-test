'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';

interface EmailAccountOption {
  id: string;
  name: string;
  smtpUser: string;
}

export default function NewOutreachCampaignPage() {
  const router = useRouter();
  const [name, setName] = useState('');
  const [targetRole, setTargetRole] = useState('Chief Technology Officer');
  const [targetLocation, setTargetLocation] = useState('United States');
  const [targetIndustry, setTargetIndustry] = useState('Information Technology');
  const [searchQuery, setSearchQuery] = useState('');
  const [promptInstructions, setPromptInstructions] = useState(
    'Highlight our enterprise automation capabilities and offer a complimentary 10-minute architecture review.'
  );
  const [testRecipientEmail, setTestRecipientEmail] = useState('');
  const [leadCount, setLeadCount] = useState(10);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  // Available Mailbox accounts (from CRM & Outreach settings)
  const [mailAccounts, setMailAccounts] = useState<EmailAccountOption[]>([]);
  const [selectedAccountId, setSelectedAccountId] = useState<string>('');

  useEffect(() => {
    fetch('/api/email-configs')
      .then((r) => r.json())
      .then((data) => {
        if (Array.isArray(data)) {
          setMailAccounts(data);
          if (data.length > 0) {
            setSelectedAccountId(data[0].id);
          }
        }
      })
      .catch(() => {});
  }, []);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!name.trim()) {
      setError('Please provide a campaign name.');
      return;
    }

    setLoading(true);
    setError('');

    try {
      // 1. Create Campaign with chosen sender mailbox
      const res = await fetch('/api/outreach/campaigns', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: name.trim(),
          targetRole: targetRole.trim(),
          targetLocation: targetLocation.trim(),
          targetIndustry: targetIndustry.trim(),
          searchQuery: searchQuery.trim() || undefined,
          promptInstructions: promptInstructions.trim(),
          accountId: selectedAccountId || undefined,
        }),
      });

      if (!res.ok) {
        const errData = await res.json().catch(() => ({}));
        throw new Error(errData.error || 'Failed to create campaign');
      }

      const campaign = await res.json();

      // 2. Automatically trigger lead scraping
      const scrapeRes = await fetch(`/api/outreach/campaigns/${campaign.id}/scrape`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          query: searchQuery.trim() || `${targetRole} in ${targetIndustry}`,
          role: targetRole.trim(),
          location: targetLocation.trim(),
          industry: targetIndustry.trim(),
          limit: leadCount,
        }),
      });

      if (!scrapeRes.ok) {
        console.warn('Initial lead scraping warning on campaign creation');
      }

      // 3. If Test Recipient Email is provided, add it as a primary verified lead
      if (testRecipientEmail.trim()) {
        try {
          await fetch(`/api/outreach/campaigns/${campaign.id}/leads`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              fullName: 'Target Test Recipient',
              email: testRecipientEmail.trim().toLowerCase(),
              companyName: 'Test Target Org',
              jobTitle: targetRole.trim() || 'Lead Decision Maker',
              location: targetLocation.trim() || 'Indonesia',
            }),
          });
        } catch (e) {
          console.warn('Failed to seed test recipient lead:', e);
        }
      }

      // Navigate to campaign workspace
      router.push(`/dashboard/outreach/${campaign.id}`);
    } catch (err: any) {
      setError(err.message || 'An error occurred while creating the campaign.');
      setLoading(false);
    }
  }

  return (
    <div className="p-4 sm:p-6 lg:p-8 max-w-4xl mx-auto space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <Link
            href="/dashboard/outreach"
            className="text-xs font-semibold text-primary-600 hover:text-primary-800 flex items-center gap-1 mb-1"
          >
            ← Back to Outreach Campaigns
          </Link>
          <h1 className="text-xl font-bold text-slate-900 tracking-tight">Create New Outreach Campaign</h1>
          <p className="text-xs text-slate-500 mt-0.5">
            Configure your target market criteria, sender email account, and AI copywriting guidelines.
          </p>
        </div>
      </div>

      <form onSubmit={handleSubmit} className="bg-white p-6 rounded-2xl border border-slate-200/80 shadow-xs space-y-6">
        {error && (
          <div className="p-3 bg-red-50 border border-red-200 text-xs text-red-600 rounded-xl">
            {error}
          </div>
        )}

        {/* Campaign Basics & Mailbox Selector */}
        <div className="space-y-4">
          <h2 className="text-sm font-bold text-slate-900 border-b border-slate-100 pb-2">
            1. Campaign Details & Outbound Sender Account
          </h2>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">
                Campaign Name <span className="text-red-500">*</span>
              </label>
              <input
                type="text"
                required
                placeholder="e.g., Q4 US Tech Leadership Outreach"
                value={name}
                onChange={(e) => setName(e.target.value)}
                className="w-full px-3.5 py-2.5 border border-slate-300 rounded-xl text-xs focus:outline-none focus:ring-2 focus:ring-primary-500"
              />
            </div>
            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">
                Sender Mailbox (Email Account for Dispatch)
              </label>
              <select
                value={selectedAccountId}
                onChange={(e) => setSelectedAccountId(e.target.value)}
                className="w-full px-3.5 py-2.5 border border-slate-300 rounded-xl text-xs focus:outline-none focus:ring-2 focus:ring-primary-500 bg-white"
              >
                {mailAccounts.length > 0 ? (
                  mailAccounts.map((acc) => (
                    <option key={acc.id} value={acc.id}>
                      {acc.name} ({acc.smtpUser})
                    </option>
                  ))
                ) : (
                  <option value="">Default Connected Business Mailbox</option>
                )}
              </select>
            </div>
          </div>
        </div>

        {/* Target Prospecting Criteria */}
        <div className="space-y-4">
          <h2 className="text-sm font-bold text-slate-900 border-b border-slate-100 pb-2">
            2. Target Lead Parameters (LinkedIn Sourcing)
          </h2>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">Target Job Title / Role</label>
              <input
                type="text"
                placeholder="e.g., Chief Technology Officer, VP Sales"
                value={targetRole}
                onChange={(e) => setTargetRole(e.target.value)}
                className="w-full px-3.5 py-2.5 border border-slate-300 rounded-xl text-xs focus:outline-none focus:ring-2 focus:ring-primary-500"
              />
            </div>
            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">Target Geographic Location</label>
              <input
                type="text"
                placeholder="e.g., United States, London, Singapore"
                value={targetLocation}
                onChange={(e) => setTargetLocation(e.target.value)}
                className="w-full px-3.5 py-2.5 border border-slate-300 rounded-xl text-xs focus:outline-none focus:ring-2 focus:ring-primary-500"
              />
            </div>
            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">Target Industry / Niche</label>
              <input
                type="text"
                placeholder="e.g., Fintech, Healthcare, SaaS"
                value={targetIndustry}
                onChange={(e) => setTargetIndustry(e.target.value)}
                className="w-full px-3.5 py-2.5 border border-slate-300 rounded-xl text-xs focus:outline-none focus:ring-2 focus:ring-primary-500"
              />
            </div>
            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">Initial Prospect Count</label>
              <select
                value={leadCount}
                onChange={(e) => setLeadCount(Number(e.target.value))}
                className="w-full px-3.5 py-2.5 border border-slate-300 rounded-xl text-xs focus:outline-none focus:ring-2 focus:ring-primary-500 bg-white"
              >
                <option value={5}>5 Leads (Quick Test)</option>
                <option value={10}>10 Leads (Recommended)</option>
                <option value={25}>25 Leads (Standard Batch)</option>
                <option value={50}>50 Leads (Large Campaign)</option>
              </select>
            </div>
          </div>
          <div>
            <label className="block text-xs font-semibold text-slate-700 mb-1">Custom Search Query (Optional)</label>
            <input
              type="text"
              placeholder="e.g., CTO B2B SaaS startup funding series A"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full px-3.5 py-2.5 border border-slate-300 rounded-xl text-xs focus:outline-none focus:ring-2 focus:ring-primary-500"
            />
          </div>
          <div className="p-3 bg-amber-50/70 border border-amber-200/80 rounded-xl space-y-1">
            <label className="block text-xs font-bold text-amber-900">
              Direct Target / Test Recipient Email (Optional)
            </label>
            <input
              type="email"
              placeholder="e.g., salmanajawe@gmail.com (to test real email delivery to your inbox)"
              value={testRecipientEmail}
              onChange={(e) => setTestRecipientEmail(e.target.value)}
              className="w-full px-3.5 py-2 border border-amber-300 rounded-lg text-xs focus:outline-none focus:ring-2 focus:ring-amber-500 bg-white"
            />
            <p className="text-[11px] text-amber-700">
              Jika diisi, email ini akan otomatis dibuatkan lead khusus dan AI draft agar Anda bisa langsung tes kirim email real ke inbox Anda.
            </p>
          </div>
        </div>

        {/* AI Copywriting Directives */}
        <div className="space-y-4">
          <h2 className="text-sm font-bold text-slate-900 border-b border-slate-100 pb-2">
            3. AI Copywriting Directives
          </h2>
          <div>
            <label className="block text-xs font-semibold text-slate-700 mb-1">
              Custom Value Proposition & Guidelines for AI Drafter
            </label>
            <textarea
              rows={3}
              value={promptInstructions}
              onChange={(e) => setPromptInstructions(e.target.value)}
              placeholder="Specify special angles, pain points, or call-to-actions you want the AI to include in the cold emails."
              className="w-full px-3.5 py-2.5 border border-slate-300 rounded-xl text-xs focus:outline-none focus:ring-2 focus:ring-primary-500"
            />
          </div>
        </div>

        {/* Form Actions */}
        <div className="flex items-center justify-end gap-3 pt-4 border-t border-slate-100">
          <Link
            href="/dashboard/outreach"
            className="px-4 py-2.5 text-xs font-semibold text-slate-600 hover:bg-slate-100 rounded-xl transition-colors"
          >
            Cancel
          </Link>
          <button
            type="submit"
            disabled={loading}
            className="px-6 py-2.5 bg-primary-600 hover:bg-primary-700 text-white text-xs font-semibold rounded-xl shadow-xs transition-colors disabled:opacity-50 flex items-center gap-2"
          >
            {loading ? (
              <>
                <span className="animate-spin">🔄</span>
                <span>Creating & Sourcing Leads...</span>
              </>
            ) : (
              <span>Create Campaign & Source Leads →</span>
            )}
          </button>
        </div>
      </form>
    </div>
  );
}
