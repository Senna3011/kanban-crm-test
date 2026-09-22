import { getServerSession } from 'next-auth';
import { authOptions } from '@/server/auth';
import { getEmailConfigs } from '@/server/actions/email-config';
import CompanyInfoForm from '@/components/setup/CompanyInfoForm';
import EmailConfigForm from '@/components/setup/EmailConfigForm';
import Link from 'next/link';
import AiStatusBanner from '@/components/AiStatusBanner';

export const dynamic = 'force-dynamic';
export const revalidate = 0;

export default async function SettingsPage() {
  const session = await getServerSession(authOptions);
  const userRole = (session?.user as any)?.role || 'member';
  const isAdmin = userRole === 'admin';

  const data = await getEmailConfigs();

  return (
    <div className="max-w-4xl space-y-8 pb-12">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Settings</h1>
          <p className="text-gray-500 mt-1">Manage your company branding and mailbox connections.</p>
        </div>
        <Link href="/dashboard" className="text-sm text-primary-700 hover:underline">← Back to board</Link>
      </div>

      <AiStatusBanner />

      {/* Outreach Engine Banner */}
      <div className="p-4 bg-gradient-to-r from-primary-50 to-indigo-50 border border-primary-200/80 rounded-2xl flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 shadow-2xs">
        <div>
          <div className="flex items-center gap-1.5">
            <span className="text-base">🚀</span>
            <h3 className="text-sm font-bold text-slate-900">Outreach Sender Accounts & API Keys</h3>
          </div>
          <p className="text-xs text-slate-600 mt-0.5">
            Manage dedicated outbound cold mailboxes, Apify LinkedIn scrapers, and Reoon deliverability API tokens.
          </p>
        </div>
        <Link
          href="/dashboard/outreach/settings"
          className="px-4 py-2 bg-primary-600 hover:bg-primary-700 text-white text-xs font-semibold rounded-xl transition-colors whitespace-nowrap self-start sm:self-auto shadow-2xs"
        >
          Manage Outreach Accounts →
        </Link>
      </div>

      {/* Role Banner if Member */}
      {!isAdmin && (
        <div className="p-4 bg-slate-50 border border-slate-200 rounded-xl text-xs text-slate-600 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <span className="w-2 h-2 rounded-full bg-slate-400" />
            <span>You are signed in as a <strong>Team Member</strong>. Integrations and company settings are managed by Administrators.</span>
          </div>
          <Link href="/dashboard/team" className="text-primary-600 hover:underline font-semibold">
            View Team (👥)
          </Link>
        </div>
      )}

      {/* Company Information Section */}
      <section className="bg-white rounded-xl border border-gray-200 p-6">
        <h2 className="text-lg font-semibold mb-4">Company Profile & Context</h2>
        <CompanyInfoForm initial={data.company} readOnly={!isAdmin} />
      </section>

      {/* Email Configurations Section */}
      <section className="bg-white rounded-xl border border-gray-200 p-6">
        <div className="flex items-center justify-between mb-4">
          <div>
            <h2 className="text-lg font-semibold">
              {isAdmin ? 'Email Mailbox Integrations (IMAP / SMTP)' : 'Connected Mailbox Accounts'}
            </h2>
            <p className="text-xs text-gray-500 mt-0.5">
              {isAdmin
                ? 'Connect multiple business mailboxes (Zoho Mail, Gmail, Outlook, etc.) for automatic Kanban sync.'
                : 'List of active mailboxes synced with your pipeline boards.'}
            </p>
          </div>
          <p className="text-sm text-gray-500">{data.configs.length} configured</p>
        </div>

        {data.configs.length === 0 ? (
          <div className="text-center py-8 text-gray-500">
            <p className="mb-4">No email accounts configured yet.</p>
            {isAdmin && <EmailConfigForm boards={data.boards} />}
          </div>
        ) : isAdmin ? (
          /* Admin View: Full editable forms */
          <div className="space-y-6">
            {data.configs.map((cfg) => (
              <div key={cfg.id} className="border border-gray-200 rounded-lg p-4">
                <div className="flex items-center justify-between mb-3">
                  <div>
                    <h3 className="font-medium text-gray-900">{cfg.name}</h3>
                    <p className="text-sm text-gray-500">
                      {cfg.imapUser} → {data.boards.find((b) => b.id === cfg.boardId)?.title || 'No board linked'}
                    </p>
                  </div>
                  <div className="flex items-center gap-2">
                    <span
                      className={`px-2 py-0.5 text-xs font-medium rounded-full ${
                        cfg.isActive ? 'bg-green-100 text-green-700' : 'bg-gray-100 text-gray-500'
                      }`}
                    >
                      {cfg.isActive ? 'Active' : 'Inactive'}
                    </span>
                  </div>
                </div>
                <EmailConfigForm initial={cfg} boards={data.boards} />
              </div>
            ))}
            <EmailConfigForm boards={data.boards} isNew />
          </div>
        ) : (
          /* Member View: Clean read-only status list */
          <div className="space-y-3">
            {data.configs.map((cfg) => (
              <div
                key={cfg.id}
                className="flex items-center justify-between p-4 bg-slate-50 border border-slate-200 rounded-xl"
              >
                <div>
                  <h4 className="font-semibold text-slate-800 text-sm">{cfg.name}</h4>
                  <p className="text-xs text-slate-500 mt-0.5">
                    Email: <span className="font-medium text-slate-700">{cfg.imapUser}</span> • Board:{' '}
                    <span className="font-medium text-slate-700">
                      {data.boards.find((b) => b.id === cfg.boardId)?.title || 'All Boards'}
                    </span>
                  </p>
                </div>
                <div className="flex items-center gap-2">
                  <span
                    className={`px-2.5 py-1 text-xs font-medium rounded-full ${
                      cfg.isActive ? 'bg-green-100 text-green-700' : 'bg-gray-100 text-gray-500'
                    }`}
                  >
                    {cfg.isActive ? 'Active' : 'Inactive'}
                  </span>
                </div>
              </div>
            ))}
          </div>
        )}
      </section>
    </div>
  );
}
