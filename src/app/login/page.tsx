'use client';

import { useState } from 'react';
import { signIn } from 'next-auth/react';
import { useRouter } from 'next/navigation';

const ADMIN_EMAIL = 'admin@jetdigitalpro.com';

export default function LoginPage() {
  const router = useRouter();
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError('');

    const result = await signIn('credentials', {
      email: ADMIN_EMAIL,
      password,
      redirect: false,
    });

    if (result?.error) {
      if (result.error === 'RATE_LIMITED') {
        setError('Too many login attempts. Please wait 15 minutes.');
      } else {
        setError(result.error === 'CredentialsSignin' ? 'Wrong password' : result.error);
      }
      setLoading(false);
      return;
    }

    router.push('/dashboard');
    router.refresh();
  }

  return (
    <div className="min-h-screen flex flex-col bg-slate-50 bg-[radial-gradient(ellipse_at_top,_var(--tw-gradient-stops))] from-indigo-100 via-slate-50 to-slate-50">
      <div className="flex-1 flex items-center justify-center px-4">
        <div className="max-w-md w-full space-y-8 p-8 bg-white rounded-2xl shadow-card-hover border border-slate-200/70">
          <div className="text-center space-y-4">
            <span className="inline-flex w-12 h-12 rounded-xl bg-gradient-to-br from-primary-600 to-primary-800 text-white font-bold items-center justify-center text-sm tracking-tight">
              JD
            </span>
            <div>
              <h1 className="text-2xl font-bold text-slate-900">Jet Digital Pro</h1>
              <p className="mt-1 text-sm text-slate-500">Kanban CRM — enter password to continue</p>
            </div>
          </div>
          <form className="mt-8 space-y-6" onSubmit={handleSubmit}>
            {error && (
              <div className="text-sm text-center text-red-600 bg-red-50 border border-red-100 rounded-lg py-2 px-3">
                {error}
              </div>
            )}
            <div className="space-y-4">
              <input
                type="password"
                placeholder="Password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
                autoFocus
                className="w-full px-3.5 py-2.5 border border-slate-300 rounded-xl focus:outline-none focus:ring-2 focus:ring-primary-500 focus:border-primary-400 text-center text-lg placeholder:text-slate-400 transition-shadow"
              />
            </div>
            <button
              type="submit"
              disabled={loading}
              className="w-full py-2.5 px-4 bg-primary-600 text-white rounded-xl hover:bg-primary-700 active:scale-[0.98] disabled:opacity-50 font-medium transition-all"
            >
              {loading ? 'Signing in...' : 'Sign in'}
            </button>
          </form>
        </div>
      </div>
      <footer className="py-6 text-center text-sm text-slate-400">
        <div className="flex items-center justify-center gap-4">
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
