import { Suspense } from 'react';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/server/auth';
import { getEmailConfigs } from '@/server/actions/email-config';
import CompanyInfoForm from '@/components/setup/CompanyInfoForm';
import EmailConfigForm from '@/components/setup/EmailConfigForm';
import ZohoConnectCard from '@/components/setup/ZohoConnectCard';
import ZohoStatusBanner from '@/components/setup/ZohoStatusBanner';
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
          <p className="text-gray-500 mt-1">Manage your company information and email configurations.</p>
        </div>
        <Link href="/dashboard" className="text-sm text-primary-700 hover:underline">← Back to board</Link>
      </div>

      <Suspense fallback={null}>
        <ZohoStatusBanner />
      </Suspense>
      <AiStatusBanner />

      {/* Role Banner if Member */}
      {!isAdmin && (
        <div className="p-4 bg-slate-50 border border-slate-200 rounded-xl text-xs text-slate-600 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <span className="w-2 h-2 rounded-full bg-slate-400" />
            <span>Anda masuk sebagai <strong>Member</strong>. Konfigurasi integrasi & informasi perusahaan dikelola oleh Administrator.</span>
          </div>
          <Link href="/dashboard/team" className="text-primary-600 hover:underline font-semibold">
            Lihat Tim (👥)
          </Link>
        </div>
      )}

      {/* Company Information Section */}
      <section className="bg-white rounded-xl border border-gray-200 p-6">
        <h2 className="text-lg font-semibold mb-4">Company Information</h2>
        <CompanyInfoForm initial={data.company} readOnly={!isAdmin} />
      </section>

      {/* Zoho One-Click OAuth Login Section - Admin Only */}
      {isAdmin && <ZohoConnectCard boards={data.boards} />}

      {/* Email Configurations Section */}
      <section className="bg-white rounded-xl border border-gray-200 p-6">
        <div className="flex items-center justify-between mb-4">
          <div>
            <h2 className="text-lg font-semibold">
              {isAdmin ? 'Manual / Existing Email Configurations' : 'Connected Email Accounts'}
            </h2>
            <p className="text-xs text-gray-500 mt-0.5">
              {isAdmin
                ? 'Use manual IMAP/SMTP setup if not connecting via Zoho OAuth.'
                : 'Daftar akun email yang terhubung untuk sinkronisasi pesan masuk.'}
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
                    {cfg.authType === 'oauth2' && (
                      <span className="px-2 py-0.5 text-xs font-medium rounded-full bg-blue-100 text-blue-700">
                        Zoho OAuth
                      </span>
                    )}
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
                      {data.boards.find((b) => b.id === cfg.boardId)?.title || 'Semua Board'}
                    </span>
                  </p>
                </div>
                <div className="flex items-center gap-2">
                  {cfg.authType === 'oauth2' ? (
                    <span className="px-2.5 py-1 text-xs font-medium rounded-full bg-blue-50 text-blue-700 border border-blue-200">
                      Zoho OAuth
                    </span>
                  ) : (
                    <span className="px-2.5 py-1 text-xs font-medium rounded-full bg-slate-100 text-slate-600 border border-slate-200">
                      IMAP/SMTP
                    </span>
                  )}
                  <span
                    className={`px-2.5 py-1 text-xs font-medium rounded-full ${
                      cfg.isActive
                        ? 'bg-emerald-50 text-emerald-700 border border-emerald-200'
                        : 'bg-gray-100 text-gray-500'
                    }`}
                  >
                    {cfg.isActive ? 'Aktif' : 'Non-aktif'}
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
