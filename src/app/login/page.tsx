'use client';

import { useState, Suspense } from 'react';
import { signIn } from 'next-auth/react';
import { useRouter, useSearchParams } from 'next/navigation';

function LoginForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const registered = searchParams.get('registered') === 'true';

  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError('');

    const result = await signIn('credentials', {
      email: email.trim().toLowerCase(),
      password,
      redirect: false,
    });

    if (result?.error) {
      setError(result.error === 'CredentialsSignin' ? 'Email atau password salah.' : result.error);
      setLoading(false);
      return;
    }

    router.push('/dashboard');
    router.refresh();
  }

  return (
    <div className="max-w-md w-full space-y-6 sm:space-y-8 p-6 sm:p-8 bg-white rounded-2xl shadow-card-hover border border-slate-200/70">
      <div className="text-center space-y-3 sm:space-y-4">
        <span className="inline-flex w-12 h-12 rounded-xl bg-gradient-to-br from-primary-600 to-indigo-700 text-white font-bold items-center justify-center text-sm tracking-tight shadow-xs">
          CRM
        </span>
        <div>
          <h1 className="text-xl sm:text-2xl font-bold text-slate-900">Jet Digital Pro</h1>
          <p className="mt-1 text-xs sm:text-sm text-slate-500">Kanban CRM — Masuk ke akun Anda</p>
        </div>
      </div>

      {registered && (
        <div className="text-xs sm:text-sm text-center text-emerald-700 bg-emerald-50 border border-emerald-200 rounded-xl py-2.5 px-3 font-medium">
          ✓ Akun Anda berhasil dibuat. Silakan login.
        </div>
      )}

      {error && (
        <div className="text-xs sm:text-sm text-center text-red-600 bg-red-50 border border-red-100 rounded-xl py-2.5 px-3">
          {error}
        </div>
      )}

      <form className="mt-6 sm:mt-8 space-y-4" onSubmit={handleSubmit}>
        <div>
          <label className="block text-xs font-semibold text-slate-700 uppercase mb-1">
            Email
          </label>
          <input
            type="email"
            placeholder="nama@email.com"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            required
            autoFocus
            autoComplete="email"
            className="w-full px-3.5 py-2.5 border border-slate-300 rounded-xl focus:outline-none focus:ring-2 focus:ring-primary-500 focus:border-primary-400 text-sm placeholder:text-slate-400 transition-shadow"
          />
        </div>

        <div>
          <label className="block text-xs font-semibold text-slate-700 uppercase mb-1">
            Password
          </label>
          <input
            type="password"
            placeholder="Password akun"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            required
            autoComplete="current-password"
            className="w-full px-3.5 py-2.5 border border-slate-300 rounded-xl focus:outline-none focus:ring-2 focus:ring-primary-500 focus:border-primary-400 text-sm placeholder:text-slate-400 transition-shadow"
          />
        </div>

        <button
          type="submit"
          disabled={loading}
          className="w-full mt-2 py-2.5 px-4 bg-primary-600 hover:bg-primary-700 active:scale-[0.99] disabled:opacity-50 text-white rounded-xl font-medium transition-all text-sm shadow-xs"
        >
          {loading ? 'Memproses...' : 'Sign In'}
        </button>

        <div className="pt-2 text-center text-xs text-slate-500">
          Startup/Perusahaan baru?{' '}
          <a href="/register" className="font-semibold text-primary-600 hover:underline">
            Daftarkan Workspace di sini
          </a>
        </div>
      </form>
    </div>
  );
}

export default function LoginPage() {
  return (
    <div className="min-h-screen flex flex-col bg-slate-50 bg-[radial-gradient(ellipse_at_top,_var(--tw-gradient-stops))] from-indigo-100 via-slate-50 to-slate-50">
      <div className="flex-1 flex items-center justify-center p-4">
        <Suspense fallback={<div className="text-slate-400 text-xs">Memuat halaman login...</div>}>
          <LoginForm />
        </Suspense>
      </div>
      <footer className="py-6 text-center text-xs sm:text-sm text-slate-400 px-4">
        <div className="flex items-center justify-center gap-3 sm:gap-4 flex-wrap">
          <a href="/privacy" className="hover:text-primary-600">Privacy Policy</a>
          <span className="text-slate-300">|</span>
          <a href="/terms" className="hover:text-primary-600">Terms of Service</a>
          <span className="text-slate-300">|</span>
          <a href="/support" className="hover:text-primary-600">Support</a>
        </div>
        <p className="mt-2 text-slate-400">&copy; 2026 Jet Digital Pro</p>
      </footer>
    </div>
  );
}

