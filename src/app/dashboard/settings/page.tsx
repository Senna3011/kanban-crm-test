import { getServerSession } from 'next-auth';
import { redirect } from 'next/navigation';
import { authOptions } from '@/server/auth';
import prisma from '@/lib/prisma';

export default async function SettingsPage() {
  const session = await getServerSession(authOptions);
  if (!session?.user) redirect('/login');

  const tenantId = (session.user as any).tenantId;
  const tenant = await prisma.tenant.findUnique({
    where: { id: tenantId },
    include: { emailConfigs: true },
  });

  let companyInfo: { name?: string; products?: string } = {};
  try {
    if (tenant?.companyInfo) companyInfo = JSON.parse(tenant.companyInfo);
  } catch {}

  return (
    <div className="max-w-2xl space-y-8">
      <div>
        <h1 className="text-2xl font-bold text-gray-900">Settings</h1>
        <p className="text-gray-500 mt-1">Manage your company info and email configuration</p>
      </div>

      <div className="bg-white rounded-xl border border-gray-200 p-6 space-y-4">
        <h2 className="text-lg font-semibold">Company Information</h2>
        <div className="p-4 bg-gray-50 rounded-lg space-y-2">
          <p className="text-sm"><strong>Name:</strong> {companyInfo.name || 'Not set'}</p>
          <p className="text-sm"><strong>Products:</strong> {companyInfo.products || 'Not set'}</p>
        </div>
      </div>

      <div className="bg-white rounded-xl border border-gray-200 p-6">
        <h2 className="text-lg font-semibold mb-4">Email Configuration</h2>
        {tenant?.emailConfigs[0] ? (
          <div className="p-4 bg-gray-50 rounded-lg space-y-2 text-sm">
            <p><strong>IMAP:</strong> {tenant.emailConfigs[0].imapHost}:{tenant.emailConfigs[0].imapPort}</p>
            <p><strong>SMTP:</strong> {tenant.emailConfigs[0].smtpHost}:{tenant.emailConfigs[0].smtpPort}</p>
            <p><strong>Last Polled:</strong> {tenant.emailConfigs[0].lastPolledAt?.toLocaleString() || 'Never'}</p>
          </div>
        ) : (
          <p className="text-gray-500">Not configured. Go to setup to configure email.</p>
        )}
      </div>
    </div>
  );
}
