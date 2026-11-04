import { getServerSession } from 'next-auth';
import { redirect } from 'next/navigation';
import { authOptions } from '@/server/auth';
import Sidebar from '@/components/layout/Sidebar';
import Navbar from '@/components/layout/Navbar';
import SocketProvider from '@/providers/SocketProvider';

export default async function DashboardLayout({ children }: { children: React.ReactNode }) {
  const session = await getServerSession(authOptions);
  if (!session?.user) redirect('/login');

  const tenantId = (session.user as any).tenantId;

  return (
    <SocketProvider tenantId={tenantId}>
      <div className="flex h-screen overflow-hidden bg-slate-50 dark:bg-slate-950 transition-colors">
        <Sidebar />
        <div className="flex-1 flex flex-col min-w-0 overflow-hidden">
          <Navbar />
          <main className="flex-1 overflow-auto p-3 sm:p-4 md:p-6 bg-slate-50 dark:bg-slate-950 text-slate-900 dark:text-slate-100 transition-colors">{children}</main>
        </div>
      </div>
    </SocketProvider>
  );
}
