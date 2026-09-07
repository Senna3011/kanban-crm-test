import { Suspense } from 'react';
import { getEmailConfigs } from '@/server/actions/email-config';
import CompanyInfoForm from '@/components/setup/CompanyInfoForm';
import EmailConfigForm from '@/components/setup/EmailConfigForm';
import ZohoConnectCard from '@/components/setup/ZohoConnectCard';
import ZohoStatusBanner from '@/components/setup/ZohoStatusBanner';
import Link from 'next/link';
import AiStatusBanner from '@/components/AiStatusBanner';

export default async function SettingsPage() {
  const data = await getEmailConfigs();

  return (
    <div className="max-w-4xl space-y-8">
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

      <section className="bg-white rounded-xl border border-gray-200 p-6">
        <h2 className="text-lg font-semibold mb-4">Company Information</h2>
        <CompanyInfoForm initial={data.company} />
      </section>

      {/* Zoho One-Click OAuth Login Section */}
      <ZohoConnectCard boards={data.boards} />

      <section className="bg-white rounded-xl border border-gray-200 p-6">
        <div className="flex items-center justify-between mb-4">
          <div>
            <h2 className="text-lg font-semibold">Manual / Existing Email Configurations</h2>
            <p className="text-xs text-gray-500 mt-0.5">Use manual IMAP/SMTP setup if not connecting via Zoho OAuth.</p>
          </div>
          <p className="text-sm text-gray-500">{data.configs.length} configured</p>
        </div>
        {data.configs.length === 0 ? (
          <div className="text-center py-8 text-gray-500">
            <p className="mb-4">No manual email configured yet.</p>
            <EmailConfigForm boards={data.boards} />
          </div>
        ) : (
          <div className="space-y-6">
            {data.configs.map((cfg) => (
              <div key={cfg.id} className="border border-gray-200 rounded-lg p-4">
                <div className="flex items-center justify-between mb-3">
                  <div>
                    <h3 className="font-medium text-gray-900">{cfg.name}</h3>
                    <p className="text-sm text-gray-500">{cfg.imapUser} → {data.boards.find(b => b.id === cfg.boardId)?.title || 'No board linked'}</p>
                  </div>
                  <div className="flex items-center gap-2">
                    {cfg.authType === 'oauth2' && (
                      <span className="px-2 py-0.5 text-xs font-medium rounded-full bg-blue-100 text-blue-700">
                        Zoho OAuth
                      </span>
                    )}
                    <span className={`px-2 py-0.5 text-xs font-medium rounded-full ${cfg.isActive ? 'bg-green-100 text-green-700' : 'bg-gray-100 text-gray-500'}`}>
                      {cfg.isActive ? 'Active' : 'Inactive'}
                    </span>
                  </div>
                </div>
                <EmailConfigForm initial={cfg} boards={data.boards} />
              </div>
            ))}
            <EmailConfigForm boards={data.boards} isNew />
          </div>
        )}
      </section>
    </div>
  );
}
