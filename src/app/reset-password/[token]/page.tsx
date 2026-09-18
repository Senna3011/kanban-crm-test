'use client';

import { useState } from 'react';
import { useRouter, useParams } from 'next/navigation';
import Link from 'next/link';
import { resetPasswordWithToken } from '@/server/actions/forgot-password';

export default function ResetPasswordPage() {
  const router = useRouter();
  const params = useParams();
  const token = params?.token as string;

  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError('');

    if (password.length < 6) {
      setError('Password must be at least 6 characters.');
      return;
    }

    if (password !== confirmPassword) {
      setError('Password confirmation does not match.');
      return;
    }

    setLoading(true);

    try {
      await resetPasswordWithToken(token, password);
      router.push('/login?resetSuccess=true');
    } catch (err: any) {
      setError(err?.message || 'Failed to reset password.');
      setLoading(false);
    }
  }

  return (
    <div className="min-h-screen flex flex-col bg-slate-50 bg-[radial-gradient(ellipse_at_top,_var(--tw-gradient-stops))] from-indigo-100 via-slate-50 to-slate-50">
      <div className="flex-1 flex items-center justify-center p-4">
        <div className="max-w-md w-full space-y-6 p-6 sm:p-8 bg-white rounded-2xl shadow-card-hover border border-slate-200/70">
          <div className="text-center space-y-3">
            <span className="inline-flex w-12 h-12 rounded-xl bg-gradient-to-br from-primary-600 to-indigo-700 text-white font-bold items-center justify-center text-sm tracking-tight shadow-xs">
              CRM
            </span>
            <div>
              <h1 className="text-xl sm:text-2xl font-bold text-slate-900">Set New Password</h1>
              <p className="mt-1 text-xs sm:text-sm text-slate-500">
                Create a new strong password for your account.
              </p>
            </div>
          </div>

          {error && (
            <div className="text-xs sm:text-sm text-center text-red-600 bg-red-50 border border-red-100 rounded-xl py-2.5 px-3">
              {error}
            </div>
          )}

          <form className="mt-4 space-y-4" onSubmit={handleSubmit}>
            <div>
              <label className="block text-xs font-semibold text-slate-700 uppercase mb-1">
                New Password
              </label>
              <input
                type="password"
                placeholder="Minimum 6 characters"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
                autoFocus
                className="w-full px-3.5 py-2.5 border border-slate-300 rounded-xl focus:outline-none focus:ring-2 focus:ring-primary-500 text-sm placeholder:text-slate-400 transition-shadow"
              />
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-700 uppercase mb-1">
                Confirm New Password
              </label>
              <input
                type="password"
                placeholder="Repeat new password"
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
                required
                className="w-full px-3.5 py-2.5 border border-slate-300 rounded-xl focus:outline-none focus:ring-2 focus:ring-primary-500 text-sm placeholder:text-slate-400 transition-shadow"
              />
            </div>

            <button
              type="submit"
              disabled={loading}
              className="w-full py-2.5 px-4 bg-primary-600 hover:bg-primary-700 active:scale-[0.99] disabled:opacity-50 text-white rounded-xl font-semibold transition-all text-sm shadow-xs"
            >
              {loading ? 'Saving...' : 'Update Password & Sign In'}
            </button>

            <div className="pt-2 text-center text-xs text-slate-500">
              <Link href="/login" className="font-semibold text-primary-600 hover:underline">
                Back to Sign in
              </Link>
            </div>
          </form>
        </div>
      </div>
    </div>
  );
}
