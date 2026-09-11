'use client';

import { useState, useEffect, use } from 'react';
import { useRouter } from 'next/navigation';
import { getInvitationDetails, acceptInvitation } from '@/server/actions/invitation';
import { toast, Toaster } from 'react-hot-toast';
import Link from 'next/link';

export default function AcceptInvitePage({ params }: { params: Promise<{ token: string }> }) {
  const resolvedParams = use(params);
  const token = resolvedParams.token;
  const router = useRouter();

  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [inviteData, setInviteData] = useState<{
    valid: boolean;
    email?: string;
    role?: string;
    tenantName?: string;
    reason?: string;
  } | null>(null);

  const [name, setName] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');

  useEffect(() => {
    async function load() {
      try {
        const details = await getInvitationDetails(token);
        setInviteData(details);
      } catch (err: any) {
        setInviteData({ valid: false, reason: err?.message || 'Gagal memuat informasi undangan.' });
      } finally {
        setLoading(false);
      }
    }
    load();
  }, [token]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim()) {
      toast.error('Silakan masukkan nama lengkap.');
      return;
    }
    if (password.length < 6) {
      toast.error('Password minimal 6 karakter.');
      return;
    }
    if (password !== confirmPassword) {
      toast.error('Konfirmasi password tidak cocok.');
      return;
    }

    setSubmitting(true);
    try {
      await acceptInvitation({ token, name, password });
      toast.success('Akun berhasil dibuat! Mengalihkan ke login...');
      setTimeout(() => {
        router.push('/login?registered=true');
      }, 1500);
    } catch (err: any) {
      toast.error(err?.message || 'Gagal menerima undangan.');
      setSubmitting(false);
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50 dark:bg-gray-900">
        <div className="animate-spin h-8 w-8 border-4 border-primary-200 border-t-primary-600 rounded-full" />
      </div>
    );
  }

  if (!inviteData?.valid) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50 dark:bg-gray-900 px-4">
        <div className="max-w-md w-full bg-white dark:bg-gray-800 p-8 rounded-xl shadow-md border border-gray-100 dark:border-gray-700 text-center">
          <div className="w-12 h-12 rounded-full bg-red-100 text-red-600 flex items-center justify-center mx-auto mb-4 text-xl">
            ✕
          </div>
          <h2 className="text-xl font-bold text-gray-900 dark:text-white mb-2">Undangan Tidak Valid</h2>
          <p className="text-gray-600 dark:text-gray-300 text-sm mb-6">
            {inviteData?.reason || 'Link undangan sudah kadaluarsa atau tidak ditemukan.'}
          </p>
          <Link
            href="/login"
            className="inline-block w-full py-2.5 px-4 bg-primary-600 hover:bg-primary-700 text-white font-medium rounded-lg text-sm transition"
          >
            Kembali ke Halaman Login
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-50 dark:bg-gray-900 px-4 py-8">
      <Toaster position="top-right" />
      <div className="max-w-md w-full bg-white dark:bg-gray-800 p-8 rounded-xl shadow-md border border-gray-100 dark:border-gray-700">
        <div className="text-center mb-6">
          <div className="inline-flex items-center justify-center w-12 h-12 rounded-full bg-primary-100 text-primary-600 mb-3 text-xl font-bold">
            CRM
          </div>
          <h1 className="text-2xl font-bold text-gray-900 dark:text-white">Terima Undangan</h1>
          <p className="text-sm text-gray-600 dark:text-gray-300 mt-1">
            Bergabung dengan tim <strong className="text-gray-900 dark:text-white">{inviteData.tenantName}</strong>
          </p>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="block text-xs font-semibold text-gray-700 dark:text-gray-300 uppercase mb-1">
              Email
            </label>
            <input
              type="email"
              value={inviteData.email || ''}
              disabled
              className="w-full px-3.5 py-2.5 bg-gray-100 dark:bg-gray-700 border border-gray-300 dark:border-gray-600 rounded-lg text-gray-500 dark:text-gray-400 text-sm cursor-not-allowed"
            />
          </div>

          <div>
            <label className="block text-xs font-semibold text-gray-700 dark:text-gray-300 uppercase mb-1">
              Peran Akun
            </label>
            <span className="inline-block px-2.5 py-1 text-xs font-medium rounded-full bg-blue-100 text-blue-800 dark:bg-blue-950/50 dark:text-blue-300 capitalize">
              {inviteData.role || 'member'}
            </span>
          </div>

          <div>
            <label className="block text-xs font-semibold text-gray-700 dark:text-gray-300 uppercase mb-1">
              Nama Lengkap
            </label>
            <input
              type="text"
              required
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Contoh: Budi Pratama"
              className="w-full px-3.5 py-2.5 bg-white dark:bg-gray-900 border border-gray-300 dark:border-gray-600 rounded-lg text-gray-900 dark:text-white text-sm focus:ring-2 focus:ring-primary-500 focus:outline-none"
            />
          </div>

          <div>
            <label className="block text-xs font-semibold text-gray-700 dark:text-gray-300 uppercase mb-1">
              Buat Password
            </label>
            <input
              type="password"
              required
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="Minimal 6 karakter"
              className="w-full px-3.5 py-2.5 bg-white dark:bg-gray-900 border border-gray-300 dark:border-gray-600 rounded-lg text-gray-900 dark:text-white text-sm focus:ring-2 focus:ring-primary-500 focus:outline-none"
            />
          </div>

          <div>
            <label className="block text-xs font-semibold text-gray-700 dark:text-gray-300 uppercase mb-1">
              Konfirmasi Password
            </label>
            <input
              type="password"
              required
              value={confirmPassword}
              onChange={(e) => setConfirmPassword(e.target.value)}
              placeholder="Ulangi password"
              className="w-full px-3.5 py-2.5 bg-white dark:bg-gray-900 border border-gray-300 dark:border-gray-600 rounded-lg text-gray-900 dark:text-white text-sm focus:ring-2 focus:ring-primary-500 focus:outline-none"
            />
          </div>

          <button
            type="submit"
            disabled={submitting}
            className="w-full mt-2 py-2.5 px-4 bg-primary-600 hover:bg-primary-700 disabled:opacity-50 text-white font-medium rounded-lg text-sm transition shadow-sm"
          >
            {submitting ? 'Memproses Akun...' : 'Konfirmasi & Selesaikan Registrasi'}
          </button>
        </form>
      </div>
    </div>
  );
}
