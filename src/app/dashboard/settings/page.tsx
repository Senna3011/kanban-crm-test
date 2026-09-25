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

      {/* Quick Navigation / Category Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
        <a
          href="#company-profile"
          className="p-3.5 bg-white border border-slate-200 hover:border-primary-400 rounded-xl transition-all shadow-2xs hover:shadow-xs group"
        >
          <div className="flex items-center gap-2">
            <span className="text-lg">🏢</span>
            <span className="text-xs font-bold text-slate-800 group-hover:text-primary-600">Company Profile</span>
          </div>
          <p className="text-[11px] text-slate-500 mt-1">Branding, AI context & knowledge base</p>
        </a>

        <a
          href="#crm-mailboxes"
          className="p-3.5 bg-white border border-slate-200 hover:border-primary-400 rounded-xl transition-all shadow-2xs hover:shadow-xs group"
        >
          <div className="flex items-center gap-2">
            <span className="text-lg">📬</span>
            <span className="text-xs font-bold text-slate-800 group-hover:text-primary-600">CRM Inbound Mailboxes</span>
          </div>
          <p className="text-[11px] text-slate-500 mt-1">{data.configs.length} mailbox(es) connected to boards</p>
        </a>

        <Link
          href="/dashboard/outreach/settings"
          className="p-3.5 bg-gradient-to-br from-indigo-50 to-purple-50 border border-indigo-200 hover:border-indigo-400 rounded-xl transition-all shadow-2xs hover:shadow-xs group"
        >
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <span className="text-lg">🚀</span>
              <span className="text-xs font-bold text-indigo-950 group-hover:text-indigo-700">Outreach Senders & APIs</span>
            </div>
            <span className="text-xs text-indigo-600 font-bold">→</span>
          </div>
          <p className="text-[11px] text-indigo-800/80 mt-1">Dedicated cold SMTP, Apify & Reoon tokens</p>
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
      <section id="company-profile" className="bg-white rounded-2xl border border-gray-200/90 p-6 shadow-2xs space-y-4">
        <div className="flex items-center justify-between border-b border-gray-100 pb-3">
          <div>
            <h2 className="text-base font-bold text-slate-900">Company Profile & AI Knowledge Context</h2>
            <p className="text-xs text-slate-500 mt-0.5">
              This context powers automatic AI email replies in Kanban and custom outreach pitch copy generation.
            </p>
          </div>
        </div>
        <CompanyInfoForm initial={data.company} readOnly={!isAdmin} />
      </section>

      {/* Email Configurations Section */}
      <section id="crm-mailboxes" className="bg-white rounded-2xl border border-gray-200/90 p-6 shadow-2xs space-y-4">
        <div className="flex items-center justify-between border-b border-gray-100 pb-3">
          <div>
            <h2 className="text-base font-bold text-slate-900">
              {isAdmin ? 'CRM Mailbox Integrations (Inbound IMAP / SMTP)' : 'Connected CRM Mailbox Accounts'}
            </h2>
            <p className="text-xs text-slate-500 mt-0.5">
              {isAdmin
                ? 'Sync customer emails directly into Kanban pipeline boards. For outbound mass cold campaigns, use Outreach Senders.'
                : 'Active mailboxes syncing customer conversations with your pipeline boards.'}
            </p>
          </div>
          <span className="text-xs font-semibold px-2.5 py-1 bg-slate-100 text-slate-700 rounded-lg">
            {data.configs.length} configured
          </span>
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
