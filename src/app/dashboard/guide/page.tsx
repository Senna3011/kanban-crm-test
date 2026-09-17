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
            Complete walkthrough for Kanban CRM: sign-in, email mailbox connection, and inbound lead automation.
          </p>
        </div>
        <Link
          href="/dashboard"
          className="text-xs sm:text-sm text-primary-700 hover:underline font-medium shrink-0"
        >
          ← Back to Board
        </Link>
      </div>

      {/* Step 1 */}
      <div className="bg-white rounded-2xl border border-slate-200/80 p-5 sm:p-6 shadow-sm space-y-3">
        <div className="flex items-center gap-3">
          <span className="w-8 h-8 rounded-xl bg-primary-100 text-primary-700 font-bold text-sm flex items-center justify-center shrink-0">
            1
          </span>
          <h2 className="text-base sm:text-lg font-bold text-slate-800">Sign In to the Platform</h2>
        </div>
        <div className="pl-11 space-y-2 text-xs sm:text-sm text-slate-600 leading-relaxed">
          <p>
            Open the CRM application on desktop or mobile browser. Sign in using your team credentials or create a new workspace via <Link href="/register" className="text-primary-600 underline font-medium">/register</Link>.
          </p>
          <p>
            Upon successful sign-in, you are directed immediately to your workspace <strong>Main Board</strong>.
          </p>
        </div>
      </div>

      {/* Step 2 */}
      <div className="bg-white rounded-2xl border border-slate-200/80 p-5 sm:p-6 shadow-sm space-y-3">
        <div className="flex items-center gap-3">
          <span className="w-8 h-8 rounded-xl bg-primary-100 text-primary-700 font-bold text-sm flex items-center justify-center shrink-0">
            2
          </span>
          <h2 className="text-base sm:text-lg font-bold text-slate-800">Connect Email Mailboxes (Zoho, Gmail, Outlook)</h2>
        </div>
        <div className="pl-11 space-y-3 text-xs sm:text-sm text-slate-600 leading-relaxed">
          <p>
            Navigate to <Link href="/dashboard/settings" className="text-primary-600 underline font-medium">Settings (⚙️)</Link> from the sidebar or mobile menu.
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
                <li><strong>Password:</strong> Account Password or App Password (if 2FA enabled)</li>
              </ul>
            </div>

            <div className="p-4 rounded-xl border border-slate-200 bg-slate-50 space-y-2">
              <span className="inline-block px-2 py-0.5 text-[11px] font-semibold bg-slate-200 text-slate-700 rounded-full">
                Gmail / Outlook / Custom
              </span>
              <h3 className="font-semibold text-slate-900 text-sm">Universal IMAP & SMTP</h3>
              <ul className="text-xs text-slate-600 space-y-1 list-disc list-inside">
                <li><strong>Gmail:</strong> imap.gmail.com (993) / smtp.gmail.com (465) with 16-char App Password</li>
                <li><strong>Outlook:</strong> outlook.office365.com (993) / smtp.office365.com (587)</li>
                <li>Multiple mailboxes can be linked to separate pipeline boards.</li>
              </ul>
            </div>
          </div>

          <p className="text-xs text-slate-500 pt-1">
            Click <strong>Test Connection (Test All)</strong> to verify both IMAP and SMTP, then click <strong>Save Email Configuration</strong>.
          </p>
        </div>
      </div>

      {/* Step 3 */}
      <div className="bg-white rounded-2xl border border-slate-200/80 p-5 sm:p-6 shadow-sm space-y-3">
        <div className="flex items-center gap-3">
          <span className="w-8 h-8 rounded-xl bg-primary-100 text-primary-700 font-bold text-sm flex items-center justify-center shrink-0">
            3
          </span>
          <h2 className="text-base sm:text-lg font-bold text-slate-800">Test Inbound Emails & Auto-Sync</h2>
        </div>
        <div className="pl-11 space-y-2 text-xs sm:text-sm text-slate-600 leading-relaxed">
          <ol className="list-decimal list-inside space-y-1.5">
            <li>
              Send a test inquiry email from an <strong>external email address</strong> (e.g. personal Gmail) to your connected mailbox.
            </li>
            <li>
              Open the <Link href="/dashboard" className="text-primary-600 underline font-medium">Board (📋)</Link> page.
            </li>
            <li>
              The background worker polls every 2 minutes, or click the <strong>Sync</strong> button in the top right for immediate ingestion.
            </li>
            <li>
              New emails appear as cards in the <strong>General</strong> column or are automatically classified by AI into <strong>Leads</strong>.
            </li>
          </ol>
        </div>
      </div>

      {/* Step 4 */}
      <div className="bg-white rounded-2xl border border-slate-200/80 p-5 sm:p-6 shadow-sm space-y-3">
        <div className="flex items-center gap-3">
          <span className="w-8 h-8 rounded-xl bg-primary-100 text-primary-700 font-bold text-sm flex items-center justify-center shrink-0">
            4
          </span>
          <h2 className="text-base sm:text-lg font-bold text-slate-800">View Details & Send Quick AI Responses</h2>
        </div>
        <div className="pl-11 space-y-2 text-xs sm:text-sm text-slate-600 leading-relaxed">
          <ul className="list-disc list-inside space-y-1.5">
            <li>
              <strong>Card Detail:</strong> Click any card to inspect full email content and WhatsApp/Trello-style conversation timeline.
            </li>
            <li>
              <strong>AI Analysis:</strong> View AI intent evaluation, interest level, and confidence metric.
            </li>
            <li>
              <strong>Quick Templates:</strong> Apply 1-click templates (Meeting, Pricing, Follow-up, Proposal) or write a custom reply.
            </li>
            <li>
              <strong>Automatic Stage Progression:</strong> Clicking <strong>Send Reply</strong> sends the email via SMTP and advances the card to <strong>Follow up 1</strong> with automated scheduling.
            </li>
          </ul>
        </div>
      </div>
    </div>
  );
}
