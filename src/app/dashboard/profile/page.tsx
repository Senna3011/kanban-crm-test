'use client';

import { useState, useEffect } from 'react';
import { getUserProfile, updateUserProfile } from '@/server/actions/profile';
import { toast, Toaster } from 'react-hot-toast';
import { useSession } from 'next-auth/react';

export default function ProfilePage() {
  const { update } = useSession();
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  const [email, setEmail] = useState('');
  const [name, setName] = useState('');
  const [avatar, setAvatar] = useState('');
  const [role, setRole] = useState('');
  const [tenantName, setTenantName] = useState('');

  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');

  useEffect(() => {
    async function load() {
      try {
        const user = await getUserProfile();
        if (user) {
          setEmail(user.email);
          setName(user.name || '');
          setAvatar(user.avatar || '');
          setRole(user.role);
          setTenantName(user.tenant?.name || '');
        }
      } catch (err: any) {
        toast.error(err?.message || 'Failed to load profile');
      } finally {
        setLoading(false);
      }
    }
    load();
  }, []);

  const handleUpdateProfile = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    try {
      if (newPassword) {
        if (newPassword.length < 6) {
          toast.error('New password must be at least 6 characters.');
          setSaving(false);
          return;
        }
        if (newPassword !== confirmPassword) {
          toast.error('Password confirmation does not match.');
          setSaving(false);
          return;
        }
      }

      await updateUserProfile({
        name,
        avatar,
        currentPassword: currentPassword || undefined,
        newPassword: newPassword || undefined,
      });

      toast.success('Profile updated successfully!');
      setCurrentPassword('');
      setNewPassword('');
      setConfirmPassword('');
      await update?.();
    } catch (err: any) {
      toast.error(err?.message || 'Failed to update profile.');
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return (
      <div className="bg-white rounded-2xl border border-slate-200 p-12 text-center max-w-2xl">
        <div className="animate-spin h-7 w-7 border-3 border-primary-200 border-t-primary-600 rounded-full mx-auto" />
        <p className="text-xs text-slate-400 mt-3">Loading user profile...</p>
      </div>
    );
  }

  const initialLetter = (name || email || 'U').charAt(0).toUpperCase();

  return (
    <div className="max-w-2xl space-y-6 pb-12">
      <Toaster position="top-right" />

      <div>
        <h1 className="text-xl sm:text-2xl font-bold text-slate-900">My Profile</h1>
        <p className="text-xs sm:text-sm text-slate-500 mt-1">
          Manage your personal details, profile picture, and account security.
        </p>
      </div>

      <div className="bg-white rounded-2xl border border-slate-200/90 shadow-sm p-6 space-y-6">
        {/* Avatar Preview */}
        <div className="flex items-center gap-4 pb-4 border-b border-slate-100">
          <div className="w-16 h-16 rounded-full bg-gradient-to-br from-primary-600 to-indigo-700 text-white font-bold flex items-center justify-center text-xl shrink-0 overflow-hidden shadow-xs border-2 border-white ring-2 ring-primary-100">
            {avatar ? (
              <img
                src={avatar}
                alt="Avatar"
                className="w-full h-full object-cover"
                onError={(e) => {
                  (e.target as any).style.display = 'none';
                }}
              />
            ) : (
              <span>{initialLetter}</span>
            )}
          </div>
          <div>
            <h2 className="text-base font-bold text-slate-900">{name || 'Unnamed User'}</h2>
            <p className="text-xs text-slate-500">{email}</p>
            <div className="flex items-center gap-2 mt-1">
              <span className="px-2 py-0.5 rounded-full text-[11px] font-semibold bg-primary-50 text-primary-700 capitalize border border-primary-200/70">
                {role}
              </span>
              <span className="text-[11px] text-slate-400">• {tenantName}</span>
            </div>
          </div>
        </div>

        <form onSubmit={handleUpdateProfile} className="space-y-4">
          <div>
            <label className="block text-xs font-semibold text-slate-700 uppercase mb-1">
              Email Address (Account)
            </label>
            <input
              type="email"
              value={email}
              disabled
              className="w-full px-3.5 py-2.5 bg-slate-100 border border-slate-200 rounded-xl text-slate-500 text-sm cursor-not-allowed"
            />
          </div>

          <div>
            <label className="block text-xs font-semibold text-slate-700 uppercase mb-1">
              Full Name
            </label>
            <input
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="e.g., Alex Johnson"
              required
              className="w-full px-3.5 py-2.5 bg-white border border-slate-300 rounded-xl text-slate-900 text-sm focus:ring-2 focus:ring-primary-500 focus:outline-none"
            />
          </div>

          <div>
            <label className="block text-xs font-semibold text-slate-700 uppercase mb-1">
              Profile Avatar
            </label>
            <div className="flex items-center gap-3">
              <label className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-white hover:bg-slate-50 text-slate-700 text-xs font-semibold border border-slate-300 rounded-lg cursor-pointer shadow-2xs transition">
                <span>📁</span>
                <span>Upload Avatar</span>
                <input
                  type="file"
                  accept="image/*"
                  className="hidden"
                  onChange={(e) => {
                    const file = e.target.files?.[0];
                    if (!file) return;
                    if (file.size > 2 * 1024 * 1024) {
                      toast.error('Image size must be less than 2MB.');
                      return;
                    }
                    const reader = new FileReader();
                    reader.onload = () => {
                      if (typeof reader.result === 'string') {
                        setAvatar(reader.result);
                      }
                    };
                    reader.readAsDataURL(file);
                  }}
                />
              </label>
              {avatar && (
                <button
                  type="button"
                  onClick={() => setAvatar('')}
                  className="text-xs text-red-600 hover:underline font-medium"
                >
                  Use Initials
                </button>
              )}
            </div>
            <p className="text-[11px] text-slate-400 mt-1">
              Choose a picture from your device (PNG, JPG, SVG up to 2MB) or leave blank for name initials.
            </p>
          </div>

          <div className="pt-4 border-t border-slate-100 space-y-3">
            <h3 className="text-sm font-bold text-slate-800">Change Password (Optional)</h3>
            <p className="text-xs text-slate-500">
              Leave blank if you do not wish to change your current account password.
            </p>

            <div>
              <label className="block text-xs font-semibold text-slate-700 uppercase mb-1">
                Current Password
              </label>
              <input
                type="password"
                value={currentPassword}
                onChange={(e) => setCurrentPassword(e.target.value)}
                placeholder="Enter current password"
                className="w-full px-3.5 py-2.5 bg-white border border-slate-300 rounded-xl text-slate-900 text-sm focus:ring-2 focus:ring-primary-500 focus:outline-none"
              />
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <label className="block text-xs font-semibold text-slate-700 uppercase mb-1">
                  New Password
                </label>
                <input
                  type="password"
                  value={newPassword}
                  onChange={(e) => setNewPassword(e.target.value)}
                  placeholder="Minimum 6 characters"
                  className="w-full px-3.5 py-2.5 bg-white border border-slate-300 rounded-xl text-slate-900 text-sm focus:ring-2 focus:ring-primary-500 focus:outline-none"
                />
              </div>
              <div>
                <label className="block text-xs font-semibold text-slate-700 uppercase mb-1">
                  Confirm New Password
                </label>
                <input
                  type="password"
                  value={confirmPassword}
                  onChange={(e) => setConfirmPassword(e.target.value)}
                  placeholder="Repeat new password"
                  className="w-full px-3.5 py-2.5 bg-white border border-slate-300 rounded-xl text-slate-900 text-sm focus:ring-2 focus:ring-primary-500 focus:outline-none"
                />
              </div>
            </div>
          </div>

          <div className="pt-3 text-right">
            <button
              type="submit"
              disabled={saving}
              className="px-5 py-2.5 bg-primary-600 hover:bg-primary-700 disabled:opacity-50 text-white font-semibold text-xs sm:text-sm rounded-xl shadow-xs transition"
            >
              {saving ? 'Saving...' : 'Save Profile Changes'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
