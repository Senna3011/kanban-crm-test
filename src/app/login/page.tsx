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
      setError('Wrong password');
      setLoading(false);
      return;
    }

    router.push('/dashboard');
  }

  return (
    <div className="min-h-screen flex flex-col bg-gray-50">
      <div className="flex-1 flex items-center justify-center px-4">
        <div className="max-w-md w-full space-y-8 p-8 bg-white rounded-xl shadow-lg">
          <div>
            <h1 className="text-3xl font-bold text-center text-gray-900">Kanban CRM</h1>
            <p className="mt-2 text-center text-sm text-gray-600">Enter password to continue</p>
          </div>
          <form className="mt-8 space-y-6" onSubmit={handleSubmit}>
            {error && <div className="text-red-500 text-sm text-center">{error}</div>}
            <div className="space-y-4">
              <input
                type="password"
                placeholder="Password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
                autoFocus
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary-500 text-center text-lg"
              />
            </div>
            <button
              type="submit"
              disabled={loading}
              className="w-full py-2 px-4 bg-primary-600 text-white rounded-lg hover:bg-primary-700 disabled:opacity-50"
            >
              {loading ? 'Signing in...' : 'Sign in'}
            </button>
          </form>
        </div>
      </div>
      <footer className="py-6 text-center text-sm text-gray-500">
        <div className="flex items-center justify-center gap-4">
          <a href="/privacy" className="hover:text-primary-600">Privacy Policy</a>
          <span className="text-gray-300">|</span>
          <a href="/terms" className="hover:text-primary-600">Terms of Service</a>
          <span className="text-gray-300">|</span>
          <a href="/support" className="hover:text-primary-600">Support</a>
        </div>
        <p className="mt-2 text-gray-400">&copy; 2026 Jet Digital Pro</p>
      </footer>
    </div>
  );
}
