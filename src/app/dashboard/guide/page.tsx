'use client';

import { useState } from 'react';
import Link from 'next/link';

export default function GuidePage() {
  const [activeTab, setActiveTab] = useState<'outreach' | 'crm' | 'setup'>('outreach');

  return (
    <div className="max-w-5xl space-y-6 pb-12 mx-auto">
      {/* Header */}
      <div className="flex items-start justify-between gap-4 border-b border-slate-200 pb-4">
        <div>
          <h1 className="text-xl sm:text-2xl font-bold text-slate-900 tracking-tight">
            📖 System Documentation Hub
          </h1>
          <p className="text-xs sm:text-sm text-slate-500 mt-1">
            Complete operational guide for the B2B Cold Outreach Engine, Kanban CRM Pipeline Management, and Mailbox Configuration.
          </p>
        </div>
        <Link
          href="/dashboard"
          className="text-xs sm:text-sm text-primary-700 hover:text-primary-900 bg-primary-50 px-3 py-1.5 rounded-xl font-semibold shrink-0 border border-primary-200 transition-colors"
        >
          ← Back to Board
        </Link>
      </div>

      {/* Navigation Tabs */}
      <div className="flex items-center gap-2 border-b border-slate-200">
        <button
          onClick={() => setActiveTab('outreach')}
          className={`px-4 py-2.5 text-xs sm:text-sm font-bold transition-all border-b-2 flex items-center gap-2 ${
            activeTab === 'outreach'
              ? 'border-indigo-600 text-indigo-700 bg-indigo-50/50 rounded-t-xl'
              : 'border-transparent text-slate-500 hover:text-slate-800'
          }`}
        >
          <span>🚀</span>
          <span>1. Mesin Cold Outreach & Deliverability</span>
        </button>
        <button
          onClick={() => setActiveTab('crm')}
          className={`px-4 py-2.5 text-xs sm:text-sm font-bold transition-all border-b-2 flex items-center gap-2 ${
            activeTab === 'crm'
              ? 'border-indigo-600 text-indigo-700 bg-indigo-50/50 rounded-t-xl'
              : 'border-transparent text-slate-500 hover:text-slate-800'
          }`}
        >
          <span>📋</span>
          <span>2. Kanban CRM & Sales Pipeline</span>
        </button>
        <button
          onClick={() => setActiveTab('setup')}
          className={`px-4 py-2.5 text-xs sm:text-sm font-bold transition-all border-b-2 flex items-center gap-2 ${
            activeTab === 'setup'
              ? 'border-indigo-600 text-indigo-700 bg-indigo-50/50 rounded-t-xl'
              : 'border-transparent text-slate-500 hover:text-slate-800'
          }`}
        >
          <span>⚙️</span>
          <span>3. Setup & Integrasi Mailbox</span>
        </button>
      </div>

      {/* ========================================================================= */}
      {/* TAB 1: OUTREACH ENGINE GUIDE                                              */}
      {/* ========================================================================= */}
      {activeTab === 'outreach' && (
        <div className="space-y-6 animate-in fade-in">
          {/* Section 1: Multi-Sender Pool & Warmup */}
          <div className="bg-white rounded-2xl border border-slate-200/80 p-5 sm:p-6 shadow-xs space-y-4">
            <div className="flex items-center gap-3">
              <span className="w-8 h-8 rounded-xl bg-indigo-100 text-indigo-700 font-bold text-sm flex items-center justify-center shrink-0">
                1
              </span>
              <div>
                <h2 className="text-base sm:text-lg font-bold text-slate-900">
                  Multi-Sender Mailbox Pool & Automated Warmup
                </h2>
                <p className="text-xs text-slate-500">
                  Automatic sending rotation without manual account switching to protect domain reputation.
                </p>
              </div>
            </div>

            <div className="pl-11 space-y-3 text-xs sm:text-sm text-slate-600 leading-relaxed">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3 pt-1">
                <div className="p-4 rounded-xl border border-indigo-100 bg-indigo-50/40 space-y-2">
                  <h3 className="font-bold text-slate-900 text-xs uppercase tracking-wide text-indigo-900 flex items-center gap-1.5">
                    <span>📬</span> Multi-Sender Pool (Round-Robin)
                  </h3>
                  <p className="text-xs text-slate-600">
                    Link multiple email accounts into one campaign. The system automatically picks the least-loaded account (<em>least-loaded</em>) that has not yet reached its daily quota.
                  </p>
                </div>
                <div className="p-4 rounded-xl border border-amber-100 bg-amber-50/40 space-y-2">
                  <h3 className="font-bold text-slate-900 text-xs uppercase tracking-wide text-amber-900 flex items-center gap-1.5">
                    <span>📈</span> Automated Warmup (+5/day)
                  </h3>
                  <p className="text-xs text-slate-600">
                    New mailboxes automatically have their send limit increased every midnight (e.g. Day 1 send 10, Day 2 send 15) until reaching the maximum daily cap without triggering spam alarms.
                  </p>
                </div>
              </div>

              <div className="p-3.5 bg-slate-50 border border-slate-200 rounded-xl text-xs space-y-1.5">
                <p className="font-semibold text-slate-800">🛡️ Automatic Reputation & Bounce Protection:</p>
                <ul className="list-disc list-inside space-y-1 text-slate-600">
                  <li><strong className="text-emerald-700">HEALTHY:</strong> Mailbox operating optimally with no bounces.</li>
                  <li><strong className="text-amber-700">WARNING:</strong> Detected 3-4 email bounces.</li>
                  <li><strong className="text-rose-700">PAUSED_BOUNCE:</strong> Detected 5 consecutive bounces $\rightarrow$ Mailbox is automatically paused from rotation to prevent the domain from being blocked.</li>
                </ul>
              </div>
            </div>
          </div>

          {/* Section 2: Scraping & Verification */}
          <div className="bg-white rounded-2xl border border-slate-200/80 p-5 sm:p-6 shadow-xs space-y-4">
            <div className="flex items-center gap-3">
              <span className="w-8 h-8 rounded-xl bg-indigo-100 text-indigo-700 font-bold text-sm flex items-center justify-center shrink-0">
                2
              </span>
              <div>
                <h2 className="text-base sm:text-lg font-bold text-slate-900">
                  Lead Discovery & Multi-Tier Email Verification
                </h2>
                <p className="text-xs text-slate-500">
                  B2B decision-maker search and multi-layer deliverability engine verification.
                </p>
              </div>
            </div>

            <div className="pl-11 space-y-3 text-xs sm:text-sm text-slate-600 leading-relaxed">
              <ol className="list-decimal list-inside space-y-2">
                <li>
                  <strong>Create New Campaign:</strong> Open <Link href="/dashboard/outreach/new" className="text-indigo-600 underline font-semibold">Outreach &gt; Create Campaign</Link>. Specify Role (e.g. <em>CTO, Founder</em>), Location (e.g. <em>United States, Singapore</em>), and target Industry.
                </li>
                <li>
                  <strong>Prospect Sourcing:</strong> The system searches executive profile contacts & company data from a verified business directory network.
                </li>
                <li>
                  <strong>Deliverability Verification:</strong> Click the <em>Verify Mailboxes</em> button. The system validates mailboxes via the Multi-Layer Deliverability Engine:
                  <ul className="pl-6 pt-1 space-y-1 list-disc">
                    <li><span className="text-emerald-700 font-bold">SAFE:</span> 100% valid, ready for cold email sending.</li>
                    <li><span className="text-amber-700 font-bold">RISKY / CATCH-ALL:</span> Server accepts all emails, manual check recommended.</li>
                    <li><span className="text-rose-700 font-bold">INVALID:</span> Dead mailbox, automatically excluded from sending.</li>
                  </ul>
                </li>
              </ol>
            </div>
          </div>

          {/* Section 3: AI Pitch & Sequential Reviewer */}
          <div className="bg-white rounded-2xl border border-slate-200/80 p-5 sm:p-6 shadow-xs space-y-4">
            <div className="flex items-center gap-3">
              <span className="w-8 h-8 rounded-xl bg-indigo-100 text-indigo-700 font-bold text-sm flex items-center justify-center shrink-0">
                3
              </span>
              <div>
                <h2 className="text-base sm:text-lg font-bold text-slate-900">
                  AI Copywriting, Sequential Reviewer & Dispatch
                </h2>
                <p className="text-xs text-slate-500">
                  AI-assisted 1-on-1 pitch writing and curation before dispatch.
                </p>
              </div>
            </div>

            <div className="pl-11 space-y-3 text-xs sm:text-sm text-slate-600 leading-relaxed">
              <ul className="space-y-2 list-disc list-inside">
                <li>
                  <strong>AI Brand Offer Summarizer:</strong> Enter your product website $\rightarrow$ AI reads the offering highlights and crafts tailored emails for each prospect profile.
                </li>
                <li>
                  <strong>Sequential Draft Reviewer:</strong> Click a lead name to open the curation modal. You can edit the subject, email body, press <em>Regenerate</em>, and navigate between prospects using the <strong>Previous (←)</strong> and <strong>Next (→)</strong> buttons.
                </li>
                <li>
                  <strong>Controlled Dispatch (Anti-Spam Jitter):</strong> Each batch dispatch inserts a random 3–9 second delay and RFC 8058 <em>One-Click Unsubscribe</em> headers.
                </li>
                <li>
                  <strong>Auto-Convert on Reply:</strong> When a prospect replies, the IMAP system automatically detects the reply and converts the lead into a new Kanban CRM card!
                </li>
              </ul>
            </div>
          </div>
        </div>
      )}

      {/* ========================================================================= */}
      {/* TAB 2: KANBAN CRM GUIDE                                                   */}
      {/* ========================================================================= */}
      {activeTab === 'crm' && (
        <div className="space-y-6 animate-in fade-in">
          {/* Section 1: Pipeline & Deal Value */}
          <div className="bg-white rounded-2xl border border-slate-200/80 p-5 sm:p-6 shadow-xs space-y-4">
            <div className="flex items-center gap-3">
              <span className="w-8 h-8 rounded-xl bg-primary-100 text-primary-700 font-bold text-sm flex items-center justify-center shrink-0">
                1
              </span>
              <div>
                <h2 className="text-base sm:text-lg font-bold text-slate-900">
                  Struktur Pipeline & Deal Value Forecasting
                </h2>
                <p className="text-xs text-slate-500">
                  Sales prospect stage management and revenue projection monitoring.
                </p>
              </div>
            </div>

            <div className="pl-11 space-y-3 text-xs sm:text-sm text-slate-600 leading-relaxed">
              <p>
                Every card on the <Link href="/dashboard" className="text-primary-600 underline font-semibold">Kanban Board (📋)</Link> represents a business opportunity or client conversation.
              </p>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-1">
                <div className="p-3.5 bg-slate-50 rounded-xl border border-slate-200">
                  <h4 className="font-bold text-slate-800 text-xs">💰 Deal Value & Currency</h4>
                  <p className="text-xs text-slate-600 mt-1">
                    Record the estimated deal value (e.g. <code>$5,000</code> or <code>Rp 75,000,000</code>). All card values are automatically accumulated in the header of each stage column.
                  </p>
                </div>
                <div className="p-3.5 bg-slate-50 rounded-xl border border-slate-200">
                  <h4 className="font-bold text-slate-800 text-xs">🎯 Contact Roles</h4>
                  <p className="text-xs text-slate-600 mt-1">
                    Classify prospect contacts as <em>Decision Maker, Champion, Influencer, Gatekeeper,</em> or <em>Buyer</em> for your sales team's negotiation strategy.
                  </p>
                </div>
              </div>
            </div>
          </div>

          {/* Section 2: Two-Way Sync & AI Follow-Up */}
          <div className="bg-white rounded-2xl border border-slate-200/80 p-5 sm:p-6 shadow-xs space-y-4">
            <div className="flex items-center gap-3">
              <span className="w-8 h-8 rounded-xl bg-primary-100 text-primary-700 font-bold text-sm flex items-center justify-center shrink-0">
                2
              </span>
              <div>
                <h2 className="text-base sm:text-lg font-bold text-slate-900">
                  Two-Way Communication & AI Follow-Up Drafts
                </h2>
                <p className="text-xs text-slate-500">
                  Two-way email synchronization and instant reply draft writing.
                </p>
              </div>
            </div>

            <div className="pl-11 space-y-3 text-xs sm:text-sm text-slate-600 leading-relaxed">
              <ul className="space-y-2 list-disc list-inside">
                <li>
                  <strong>Open Card Detail:</strong> Click any card to view the full conversation history (*Activity Timeline*) and sender details.
                </li>
                <li>
                  <strong>AI Inbound Classification:</strong> Incoming emails are automatically categorized by interest level (<em>High, Medium, Low Interest</em>) with suggested stage moves.
                </li>
                <li>
                  <strong>Direct Reply:</strong> Write a reply or use the AI draft directly from the card detail panel without opening a separate webmail.
                </li>
                <li>
                  <strong>Follow-Up SLA Reminder:</strong> Cards in the Follow Up stage that have not received a reply will display an automatic <em>Overdue</em> warning badge.
                </li>
              </ul>
            </div>
          </div>
        </div>
      )}

      {/* ========================================================================= */}
      {/* TAB 3: SETUP & MAILBOX INTEGRATION                                        */}
      {/* ========================================================================= */}
      {activeTab === 'setup' && (
        <div className="space-y-6 animate-in fade-in">
          <div className="bg-white rounded-2xl border border-slate-200/80 p-5 sm:p-6 shadow-xs space-y-4">
            <div className="flex items-center gap-3">
              <span className="w-8 h-8 rounded-xl bg-emerald-100 text-emerald-700 font-bold text-sm flex items-center justify-center shrink-0">
                1
              </span>
              <div>
                <h2 className="text-base sm:text-lg font-bold text-slate-900">
                  Inbound & Outbound Mailbox Connection (Zoho, Gmail, Outlook)
                </h2>
                <p className="text-xs text-slate-500">
                  IMAP credential configuration for receiving email and SMTP for sending.
                </p>
              </div>
            </div>

            <div className="pl-11 space-y-4 text-xs sm:text-sm text-slate-600 leading-relaxed">
              <p>
                Open the <Link href="/dashboard/settings" className="text-primary-600 underline font-semibold">Settings (⚙️)</Link> menu to connect your main CRM email account.
              </p>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                <div className="p-4 rounded-xl border border-primary-200 bg-primary-50/40 space-y-2">
                  <span className="inline-block px-2 py-0.5 text-[11px] font-semibold bg-primary-100 text-primary-800 rounded-full">
                    Zoho Mail Configuration
                  </span>
                  <ul className="text-xs text-slate-700 space-y-1 list-disc list-inside">
                    <li><strong>IMAP Host:</strong> imap.zoho.com (Port: 993, SSL)</li>
                    <li><strong>SMTP Host:</strong> smtp.zoho.com (Port: 465, SSL)</li>
                    <li><strong>Username:</strong> email@domain.com</li>
                    <li><strong>Password:</strong> App Password from Zoho Security Settings</li>
                  </ul>
                </div>

                <div className="p-4 rounded-xl border border-slate-200 bg-slate-50 space-y-2">
                  <span className="inline-block px-2 py-0.5 text-[11px] font-semibold bg-slate-200 text-slate-700 rounded-full">
                    Google Workspace / Gmail
                  </span>
                  <ul className="text-xs text-slate-700 space-y-1 list-disc list-inside">
                    <li><strong>IMAP Host:</strong> imap.gmail.com (Port: 993, SSL)</li>
                    <li><strong>SMTP Host:</strong> smtp.gmail.com (Port: 465, SSL)</li>
                    <li><strong>Password:</strong> Use a 16-digit Google App Password</li>
                  </ul>
                </div>
              </div>

              <div className="p-3.5 bg-emerald-50 border border-emerald-200 rounded-xl text-xs text-emerald-800">
                💡 <strong>Verification Tip:</strong> Always click the <em>Test Connection / Test SMTP Handshake</em> button before saving configuration to ensure credentials are valid and free of connection errors.
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
