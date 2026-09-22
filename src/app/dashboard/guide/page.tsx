'use client';

import Link from 'next/link';

export default function GuidePage() {
  return (
    <div className="max-w-4xl space-y-6 pb-12">
      {/* Header */}
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-xl sm:text-2xl font-bold text-slate-900">System User Guide</h1>
          <p className="text-xs sm:text-sm text-slate-500 mt-1">
            Complete walkthrough for Kanban CRM & Outreach: mailbox configuration, inbound lead management, and automated cold outreach marketing.
          </p>
        </div>
        <Link
          href="/dashboard"
          className="text-xs sm:text-sm text-primary-700 hover:underline font-medium shrink-0"
        >
          ← Back to Board
        </Link>
      </div>

      {/* Step 1: Sign In */}
      <div className="bg-white rounded-2xl border border-slate-200/80 p-5 sm:p-6 shadow-sm space-y-3">
        <div className="flex items-center gap-3">
          <span className="w-8 h-8 rounded-xl bg-primary-100 text-primary-700 font-bold text-sm flex items-center justify-center shrink-0">
            1
          </span>
          <h2 className="text-base sm:text-lg font-bold text-slate-800">Sign In to the Platform</h2>
        </div>
        <div className="pl-11 space-y-2 text-xs sm:text-sm text-slate-600 leading-relaxed">
          <p>
            Open the application on your desktop or mobile browser. Sign in using your team credentials or register a new workspace at <Link href="/register" className="text-primary-600 underline font-medium">/register</Link>.
          </p>
          <p>
            Upon signing in, you will land directly on your workspace <strong>Main Board</strong>.
          </p>
        </div>
      </div>

      {/* Step 2: Connect Mailboxes */}
      <div className="bg-white rounded-2xl border border-slate-200/80 p-5 sm:p-6 shadow-sm space-y-3">
        <div className="flex items-center gap-3">
          <span className="w-8 h-8 rounded-xl bg-primary-100 text-primary-700 font-bold text-sm flex items-center justify-center shrink-0">
            2
          </span>
          <h2 className="text-base sm:text-lg font-bold text-slate-800">Connect Email Mailboxes (Zoho, Gmail, Outlook)</h2>
        </div>
        <div className="pl-11 space-y-3 text-xs sm:text-sm text-slate-600 leading-relaxed">
          <p>
            Navigate to <Link href="/dashboard/settings" className="text-primary-600 underline font-medium">Settings (⚙️)</Link> from the sidebar.
          </p>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-3 pt-1">
            <div className="p-4 rounded-xl border border-primary-200 bg-primary-50/40 space-y-2">
              <span className="inline-block px-2 py-0.5 text-[11px] font-semibold bg-primary-100 text-primary-800 rounded-full">
                Zoho Mail Setup
              </span>
              <h3 className="font-semibold text-slate-900 text-sm">Zoho Mail IMAP & SMTP</h3>
              <ul className="text-xs text-slate-600 space-y-1 list-disc list-inside">
                <li><strong>IMAP:</strong> imap.zoho.com (Port: 993, SSL)</li>
                <li><strong>SMTP:</strong> smtp.zoho.com (Port: 465, SSL)</li>
                <li><strong>Username:</strong> your Zoho email address</li>
                <li><strong>Password:</strong> Zoho Account Password or App Password</li>
              </ul>
            </div>

            <div className="p-4 rounded-xl border border-slate-200 bg-slate-50 space-y-2">
              <span className="inline-block px-2 py-0.5 text-[11px] font-semibold bg-slate-200 text-slate-700 rounded-full">
                Gmail / Outlook / Custom
              </span>
              <h3 className="font-semibold text-slate-900 text-sm">Universal IMAP & SMTP</h3>
              <ul className="text-xs text-slate-600 space-y-1 list-disc list-inside">
                <li><strong>Gmail:</strong> imap.gmail.com (993) / smtp.gmail.com (465) with Google App Password</li>
                <li><strong>Outlook:</strong> outlook.office365.com (993) / smtp.office365.com (587)</li>
                <li>Multiple mailboxes can be connected to separate boards.</li>
              </ul>
            </div>
          </div>

          <p className="text-xs text-slate-500 pt-1">
            Click <strong>Test Connection</strong> to verify mailbox connectivity, then click <strong>Save Email Configuration</strong>.
          </p>
        </div>
      </div>

      {/* Step 3: Inbound Kanban Flow */}
      <div className="bg-white rounded-2xl border border-slate-200/80 p-5 sm:p-6 shadow-sm space-y-3">
        <div className="flex items-center gap-3">
          <span className="w-8 h-8 rounded-xl bg-primary-100 text-primary-700 font-bold text-sm flex items-center justify-center shrink-0">
            3
          </span>
          <h2 className="text-base sm:text-lg font-bold text-slate-800">Inbound Lead Auto-Classification & Kanban Flow</h2>
        </div>
        <div className="pl-11 space-y-2 text-xs sm:text-sm text-slate-600 leading-relaxed">
          <ol className="list-decimal list-inside space-y-1.5">
            <li>
              When customers send emails to your connected mailbox, the background worker automatically ingests them.
            </li>
            <li>
              AI analyzes incoming messages: inquiries and business opportunities land directly in <strong>Leads</strong>, while general notifications go to <strong>General</strong>.
            </li>
            <li>
              Click any card on the <Link href="/dashboard" className="text-primary-600 underline font-medium">Board (📋)</Link> to view conversation history and send instant AI-generated responses.
            </li>
          </ol>
        </div>
      </div>

      {/* Step 4: Outreach Marketing Guide */}
      <div className="bg-white rounded-2xl border border-indigo-200 bg-indigo-50/20 p-5 sm:p-6 shadow-sm space-y-4">
        <div className="flex items-center gap-3">
          <span className="w-8 h-8 rounded-xl bg-indigo-600 text-white font-bold text-sm flex items-center justify-center shrink-0">
            4
          </span>
          <h2 className="text-base sm:text-lg font-bold text-slate-900">
            Outreach Marketing: Find Leads & Send Cold Campaigns
          </h2>
        </div>
        <div className="pl-11 space-y-3 text-xs sm:text-sm text-slate-700 leading-relaxed">
          <p>
            The <strong>Outreach Module</strong> allows you to prospect decision-makers on LinkedIn and send personalized cold email campaigns.
          </p>

          <div className="space-y-2.5 pt-1">
            <div className="flex items-start gap-2.5">
              <span className="font-bold text-indigo-600">A.</span>
              <div>
                <strong>Configure Sender Accounts (Settings):</strong> Go to <Link href="/dashboard/outreach/settings" className="text-indigo-600 underline font-semibold">Outreach Settings (⚙️)</Link> to set up your outbound email addresses, SMTP credentials, daily sending limits, and Apify API key. This lets you choose different business email accounts for different target audiences.
              </div>
            </div>

            <div className="flex items-start gap-2.5">
              <span className="font-bold text-indigo-600">B.</span>
              <div>
                <strong>Create Campaign & Pick Sender:</strong> Go to <Link href="/dashboard/outreach" className="text-indigo-600 underline font-semibold">Outreach (🚀)</Link> &gt; click <strong>Create New Campaign</strong>. Select your preferred <em>Sender Mailbox</em> from the dropdown, then enter target Role (e.g. <em>CEO, CTO</em>), Location (e.g. <em>Singapore, Jakarta</em>), and value proposition.
              </div>
            </div>

            <div className="flex items-start gap-2.5">
              <span className="font-bold text-indigo-600">C.</span>
              <div>
                <strong>Verify Deliverability:</strong> Sourced leads appear in the Staging Table. Click <strong>Verify Mailboxes</strong> to check email validity (<em>Safe, Risky, or Invalid</em>).
              </div>
            </div>

            <div className="flex items-start gap-2.5">
              <span className="font-bold text-indigo-600">D.</span>
              <div>
                <strong>AI Copywriting:</strong> Click <strong>Generate AI Drafts</strong>. AI writes customized email copy for each contact. Click <strong>Review / Test</strong> to inspect or edit the draft.
              </div>
            </div>

            <div className="flex items-start gap-2.5">
              <span className="font-bold text-indigo-600">E.</span>
              <div>
                <strong>Dispatch & CRM Sync:</strong> Click <strong>Dispatch Emails</strong> to send batch campaigns, or <strong>Send</strong> for individual delivery. When a prospect replies, they automatically convert into a new card on your Kanban Board!
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
