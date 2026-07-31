import { getEmailConfig } from '@/server/actions/email-config';
import CompanyInfoForm from '@/components/setup/CompanyInfoForm';
import EmailConfigForm from '@/components/setup/EmailConfigForm';
import Link from 'next/link';

export default async function SettingsPage() {
  const config = await getEmailConfig();

  return (
    <div className="max-w-4xl space-y-8">
      <div className="flex items-start justify-between gap-4">
        <div><h1 className="text-2xl font-bold text-gray-900">Settings</h1><p className="text-gray-500 mt-1">Manage your company information and email configuration.</p></div>
        <Link href="/dashboard" className="text-sm text-primary-700 hover:underline">Back to board</Link>
      </div>
      <section className="bg-white rounded-xl border border-gray-200 p-6"><CompanyInfoForm initial={config.company} /></section>
      <section className="bg-white rounded-xl border border-gray-200 p-6"><EmailConfigForm initial={config.email || undefined} /></section>
    </div>
  );
}
