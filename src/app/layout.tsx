import type { Metadata } from 'next';
import AuthProvider from '@/providers/AuthProvider';
import './globals.css';

export const metadata: Metadata = {
  title: 'Kanban CRM',
  description: 'AI-powered Kanban CRM for sales teams',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>
        <AuthProvider>{children}</AuthProvider>
      </body>
    </html>
  );
}
