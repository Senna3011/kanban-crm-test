'use client';

import { useState } from 'react';
import Link from 'next/link';
import { requestPasswordReset } from '@/server/actions/forgot-password';

export default function ForgotPasswordPage() {
  const [email, setEmail] = useState('');
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState('');
  const [resetLink, setResetLink] = useState<string | null>(null);
  const [error, setError] = useState('');

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError('');
    setMessage('');
    setResetLink(null);
    setLoading(true);

    try {
      const res = await requestPasswordReset(email);
      setMessage(res.message);
      if (res.resetLink) {
        setResetLink(res.resetLink);
      }
    } catch (err: any) {
      setError(err?.message || 'Failed to process password reset.');
    } finally {
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
              <h1 className="text-xl sm:text-2xl font-bold text-slate-900">Reset Password</h1>
              <p className="mt-1 text-xs sm:text-sm text-slate-500">
                Enter your registered account email to receive a password reset link.
              </p>
            </div>
          </div>

          {error && (
            <div className="text-xs sm:text-sm text-center text-red-600 bg-red-50 border border-red-100 rounded-xl py-2.5 px-3">
              {error}
            </div>
          )}

          {message && (
            <div className="text-xs sm:text-sm text-emerald-800 bg-emerald-50 border border-emerald-200 rounded-xl p-3 space-y-2">
              <p className="font-semibold text-center">{message}</p>
              {resetLink && (
                <div className="space-y-1.5 pt-1">
                  <p className="text-slate-600 text-xs">Direct Reset Link (Click below to set new password):</p>
                  <Link
                    href={resetLink}
                    className="block text-center py-2 px-3 bg-emerald-600 hover:bg-emerald-700 text-white font-bold rounded-lg text-xs shadow-2xs transition"
                  >
                    👉 Click to Set New Password
                  </Link>
                </div>
              )}
            </div>
          )}

          <form className="mt-4 space-y-4" onSubmit={handleSubmit}>
            <div>
              <label className="block text-xs font-semibold text-slate-700 uppercase mb-1">
                Registered Email Address
              </label>
              <input
                type="email"
                placeholder="name@company.com"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
                autoFocus
                className="w-full px-3.5 py-2.5 border border-slate-300 rounded-xl focus:outline-none focus:ring-2 focus:ring-primary-500 text-sm placeholder:text-slate-400 transition-shadow"
              />
            </div>

            <button
              type="submit"
              disabled={loading}
              className="w-full py-2.5 px-4 bg-primary-600 hover:bg-primary-700 active:scale-[0.99] disabled:opacity-50 text-white rounded-xl font-semibold transition-all text-sm shadow-xs"
            >
              {loading ? 'Processing...' : 'Send Reset Link'}
            </button>

            <div className="pt-2 text-center text-xs text-slate-500">
              Remember your password?{' '}
              <Link href="/login" className="font-semibold text-primary-600 hover:underline">
                Sign in here
              </Link>
            </div>
          </form>
        </div>
      </div>
    </div>
  );
}
