'use client';

import { useState, useEffect } from 'react';
import { useSession } from 'next-auth/react';
import { toast, Toaster } from 'react-hot-toast';
import {
  getTenantUsers,
  createTenantUser,
  deleteTenantUser,
  updateTenantUserRole,
  updateUserBoardAccess,
  resetTenantUserPassword,
} from '@/server/actions/user';
import { getTenantInvitations, createInvitation, revokeInvitation } from '@/server/actions/invitation';

interface BoardRef {
  id: string;
  title: string;
}

interface UserItem {
  id: string;
  email: string;
  name: string | null;
  role: string;
  avatar?: string | null;
  assignedBoardIds?: string | null;
  createdAt: Date | string;
}

interface InvitationItem {
  id: string;
  email: string;
  role: string;
  token: string;
  expiresAt: Date | string;
  createdAt: Date | string;
}

export default function TeamPage() {
  const { data: session } = useSession();
  const currentUserRole = (session?.user as any)?.role || 'member';
  const currentUserId = (session?.user as any)?.id;
  const isAdmin = currentUserRole === 'admin';

  const [activeTab, setActiveTab] = useState<'members' | 'invitations'>('members');
  const [modalMode, setModalMode] = useState<'none' | 'direct' | 'invite'>('none');
  const [loading, setLoading] = useState(true);
  const [users, setUsers] = useState<UserItem[]>([]);
  const [invitations, setInvitations] = useState<InvitationItem[]>([]);
  const [allBoards, setAllBoards] = useState<BoardRef[]>([]);

  // Direct create state
  const [directName, setDirectName] = useState('');
  const [directEmail, setDirectEmail] = useState('');
  const [directPassword, setDirectPassword] = useState('');
  const [directRole, setDirectRole] = useState<'member' | 'admin'>('member');
  const [directBoardIds, setDirectBoardIds] = useState<string[]>([]);
  const [submittingDirect, setSubmittingDirect] = useState(false);

  // Invite state
  const [inviteEmail, setInviteEmail] = useState('');
  const [inviteRole, setInviteRole] = useState<'member' | 'admin'>('member');
  const [submittingInvite, setSubmittingInvite] = useState(false);
  const [generatedLink, setGeneratedLink] = useState<string | null>(null);

  // Edit Board Access Modal
  const [editingUser, setEditingUser] = useState<UserItem | null>(null);
  const [selectedBoardIds, setSelectedBoardIds] = useState<string[]>([]);
  const [savingBoards, setSavingBoards] = useState(false);

  // Reset Password Modal
  const [resetUserTarget, setResetUserTarget] = useState<UserItem | null>(null);
  const [resetNewPassword, setResetNewPassword] = useState('');
  const [savingResetPassword, setSavingResetPassword] = useState(false);

  async function loadData() {
    setLoading(true);
    try {
      const [usersData, invsData, boardsRes] = await Promise.all([
        getTenantUsers(),
        isAdmin ? getTenantInvitations() : Promise.resolve([]),
        fetch('/api/boards').then((r) => (r.ok ? r.json() : [])),
      ]);
      setUsers(usersData as any);
      setInvitations(invsData as any);
      setAllBoards(Array.isArray(boardsRes) ? boardsRes : []);
    } catch (err: any) {
      toast.error(err?.message || 'Failed to load team data');
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    loadData();
  }, [isAdmin]);

  const handleDirectCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!directEmail || !directPassword) {
      toast.error('Email and password are required.');
      return;
    }
    setSubmittingDirect(true);
    try {
      await createTenantUser({
        name: directName,
        email: directEmail,
        password: directPassword,
        role: directRole,
        boardIds: directBoardIds,
      });
      toast.success('New user created successfully!');
      setDirectName('');
      setDirectEmail('');
      setDirectPassword('');
      setDirectRole('member');
      setDirectBoardIds([]);
      setModalMode('none');
      loadData();
    } catch (err: any) {
      toast.error(err?.message || 'Failed to create user');
    } finally {
      setSubmittingDirect(false);
    }
  };

  const handleCreateInvite = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!inviteEmail) {
      toast.error('Email address is required.');
      return;
    }
    setSubmittingInvite(true);
    try {
      const res = await createInvitation({
        email: inviteEmail,
        role: inviteRole,
      });
      setGeneratedLink(res.inviteLink);
      toast.success(res.emailSent ? 'Invitation sent via email!' : 'Invitation link generated!');
      setInviteEmail('');
      setInviteRole('member');
      loadData();
    } catch (err: any) {
      toast.error(err?.message || 'Failed to generate invitation');
    } finally {
      setSubmittingInvite(false);
    }
  };

  const handleDeleteUser = async (userId: string, email: string) => {
    if (!confirm(`Delete user ${email} from workspace?`)) return;
    try {
      await deleteTenantUser(userId);
      toast.success('User deleted successfully.');
      loadData();
    } catch (err: any) {
      toast.error(err?.message || 'Failed to delete user.');
    }
  };

  const handleRoleChange = async (userId: string, newRole: 'admin' | 'member') => {
    try {
      await updateTenantUserRole(userId, newRole);
      toast.success('User role updated successfully.');
      loadData();
    } catch (err: any) {
      toast.error(err?.message || 'Failed to update user role.');
    }
  };

  const handleRevokeInvite = async (inviteId: string) => {
    if (!confirm('Cancel this invitation?')) return;
    try {
      await revokeInvitation(inviteId);
      toast.success('Invitation revoked.');
      loadData();
    } catch (err: any) {
      toast.error(err?.message || 'Failed to revoke invitation.');
    }
  };

  const handleSaveBoardAccess = async () => {
    if (!editingUser) return;
    setSavingBoards(true);
    try {
      await updateUserBoardAccess(editingUser.id, selectedBoardIds);
      toast.success('Board access permissions updated.');
      setEditingUser(null);
      loadData();
    } catch (err: any) {
      toast.error(err?.message || 'Failed to update permissions.');
    } finally {
      setSavingBoards(false);
    }
  };

  const handleResetPasswordSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!resetUserTarget) return;
    if (!resetNewPassword || resetNewPassword.length < 6) {
      toast.error('New password must be at least 6 characters.');
      return;
    }
    setSavingResetPassword(true);
    try {
      await resetTenantUserPassword(resetUserTarget.id, resetNewPassword);
      toast.success(`Password for ${resetUserTarget.email} updated successfully!`);
      setResetUserTarget(null);
      setResetNewPassword('');
    } catch (err: any) {
      toast.error(err?.message || 'Failed to reset member password.');
    } finally {
      setSavingResetPassword(false);
    }
  };

  const copyToClipboard = (text: string) => {
    navigator.clipboard.writeText(text);
    toast.success('Invitation link copied to clipboard!');
  };

  return (
    <div className="max-w-5xl space-y-6 pb-12">
      <Toaster position="top-right" />

      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-xl sm:text-2xl font-bold text-slate-900">Team & User Management</h1>
          <p className="text-xs sm:text-sm text-slate-500 mt-1">
            Manage team access, configure board assignment restrictions, or generate invite links.
          </p>
        </div>

        {isAdmin && (
          <div className="flex items-center gap-2">
            <button
              onClick={() => {
                setDirectBoardIds([]);
                setModalMode('direct');
              }}
              className="inline-flex items-center gap-1.5 px-3.5 py-2 bg-primary-600 hover:bg-primary-700 text-white text-xs font-semibold rounded-xl shadow-xs transition"
            >
              <span>➕</span>
              <span>Add New User</span>
            </button>
            <button
              onClick={() => {
                setGeneratedLink(null);
                setModalMode('invite');
              }}
              className="inline-flex items-center gap-1.5 px-3.5 py-2 bg-white hover:bg-slate-50 text-slate-700 border border-slate-200 text-xs font-semibold rounded-xl shadow-xs transition"
            >
              <span>✉️</span>
              <span>Invite via Link</span>
            </button>
          </div>
        )}
      </div>

      {/* Navigation Tabs */}
      <div className="flex border-b border-slate-200">
        <button
          onClick={() => setActiveTab('members')}
          className={`pb-3 px-4 text-xs sm:text-sm font-semibold border-b-2 transition ${
            activeTab === 'members'
              ? 'border-primary-600 text-primary-600'
              : 'border-transparent text-slate-500 hover:text-slate-800'
          }`}
        >
          Team Members ({users.length})
        </button>
        {isAdmin && (
          <button
            onClick={() => setActiveTab('invitations')}
            className={`pb-3 px-4 text-xs sm:text-sm font-semibold border-b-2 transition ${
              activeTab === 'invitations'
                ? 'border-primary-600 text-primary-600'
                : 'border-transparent text-slate-500 hover:text-slate-800'
            }`}
          >
            Pending Invitations ({invitations.length})
          </button>
        )}
      </div>

      {/* Content Section */}
      {loading ? (
        <div className="bg-white rounded-2xl border border-slate-200 p-12 text-center">
          <div className="animate-spin h-7 w-7 border-3 border-primary-200 border-t-primary-600 rounded-full mx-auto" />
          <p className="text-xs text-slate-400 mt-3">Loading team users...</p>
        </div>
      ) : activeTab === 'members' ? (
        /* Members List */
        <div className="bg-white rounded-2xl border border-slate-200/90 shadow-sm overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs sm:text-sm">
              <thead className="bg-slate-50/75 border-b border-slate-200 text-slate-500 text-[11px] uppercase tracking-wider font-semibold">
                <tr>
                  <th className="py-3 px-4">User</th>
                  <th className="py-3 px-4">Role</th>
                  <th className="py-3 px-4">Board Access</th>
                  <th className="py-3 px-4">Joined</th>
                  {isAdmin && <th className="py-3 px-4 text-right">Actions</th>}
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {users.map((u) => {
                  const isSelf = u.id === currentUserId;
                  let parsedBoardIds: string[] = [];
                  try {
                    if (u.assignedBoardIds) parsedBoardIds = JSON.parse(u.assignedBoardIds);
                  } catch {}

                  const assignedBoardTitles = allBoards
                    .filter((b) => parsedBoardIds.includes(b.id))
                    .map((b) => b.title);

                  return (
                    <tr key={u.id} className="hover:bg-slate-50/60 transition">
                      <td className="py-3.5 px-4">
                        <div className="flex items-center gap-3">
                          <div className="w-8 h-8 rounded-full bg-gradient-to-br from-primary-500 to-indigo-600 text-white font-bold flex items-center justify-center text-xs shrink-0 overflow-hidden">
                            {u.avatar ? (
                              <img src={u.avatar} alt="Avatar" className="w-full h-full object-cover" onError={(e) => { (e.target as any).style.display = 'none'; }} />
                            ) : (
                              u.name ? u.name.charAt(0).toUpperCase() : u.email.charAt(0).toUpperCase()
                            )}
                          </div>
                          <div>
                            <p className="font-semibold text-slate-900 flex items-center gap-1.5">
                              {u.name || 'Unnamed User'}
                              {isSelf && (
                                <span className="text-[10px] bg-slate-100 text-slate-600 px-1.5 py-0.5 rounded font-normal">
                                  You
                                </span>
                              )}
                            </p>
                            <p className="text-xs text-slate-500">{u.email}</p>
                          </div>
                        </div>
                      </td>
                      <td className="py-3.5 px-4">
                        {isAdmin && !isSelf ? (
                          <select
                            value={u.role}
                            onChange={(e) => handleRoleChange(u.id, e.target.value as any)}
                            className="bg-slate-50 border border-slate-200 text-slate-700 text-xs rounded-lg px-2.5 py-1 focus:ring-1 focus:ring-primary-500 focus:outline-none cursor-pointer"
                          >
                            <option value="member">Member</option>
                            <option value="admin">Admin</option>
                          </select>
                        ) : (
                          <span
                            className={`inline-block px-2.5 py-0.5 rounded-full text-xs font-semibold capitalize ${
                              u.role === 'admin'
                                ? 'bg-indigo-50 text-indigo-700 border border-indigo-200/80'
                                : 'bg-slate-100 text-slate-700 border border-slate-200'
                            }`}
                          >
                            {u.role}
                          </span>
                        )}
                      </td>
                      <td className="py-3.5 px-4">
                        {u.role === 'admin' ? (
                          <span className="text-xs text-slate-500 italic">All Boards (Full Access)</span>
                        ) : (
                          <div className="flex items-center gap-2">
                            <span className="text-xs text-slate-700">
                              {assignedBoardTitles.length === 0
                                ? 'All Boards (Default)'
                                : assignedBoardTitles.join(', ')}
                            </span>
                            {isAdmin && (
                              <button
                                onClick={() => {
                                  setEditingUser(u);
                                  setSelectedBoardIds(parsedBoardIds);
                                }}
                                className="text-[11px] text-primary-600 hover:underline font-semibold"
                              >
                                Edit
                              </button>
                            )}
                          </div>
                        )}
                      </td>
                      <td className="py-3.5 px-4 text-xs text-slate-400">
                        {new Date(u.createdAt).toLocaleDateString(undefined, {
                          month: 'short',
                          day: 'numeric',
                          year: 'numeric',
                        })}
                      </td>
                      {isAdmin && (
                        <td className="py-3.5 px-4 text-right space-x-2">
                          {!isSelf && (
                            <>
                              <button
                                onClick={() => {
                                  setResetUserTarget(u);
                                  setResetNewPassword('');
                                }}
                                className="text-xs text-indigo-600 hover:text-indigo-800 hover:underline font-medium"
                                title="Reset user password manually"
                              >
                                Reset Pass
                              </button>
                              <button
                                onClick={() => handleDeleteUser(u.id, u.email)}
                                className="text-xs text-red-600 hover:text-red-800 hover:underline font-medium"
                              >
                                Delete
                              </button>
                            </>
                          )}
                        </td>
                      )}
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      ) : (
        /* Pending Invitations List */
        <div className="bg-white rounded-2xl border border-slate-200/90 shadow-sm overflow-hidden">
          {invitations.length === 0 ? (
            <div className="text-center py-12 text-slate-400 text-xs">No active pending invitations</div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs sm:text-sm">
                <thead className="bg-slate-50/75 border-b border-slate-200 text-slate-500 text-[11px] uppercase tracking-wider font-semibold">
                  <tr>
                    <th className="py-3 px-4">Email</th>
                    <th className="py-3 px-4">Role</th>
                    <th className="py-3 px-4">Expires At</th>
                    <th className="py-3 px-4 text-right">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {invitations.map((inv) => (
                    <tr key={inv.id} className="hover:bg-slate-50/60 transition">
                      <td className="py-3.5 px-4 font-semibold text-slate-900">{inv.email}</td>
                      <td className="py-3.5 px-4">
                        <span className="px-2.5 py-0.5 rounded-full text-xs font-semibold bg-slate-100 text-slate-700 capitalize">
                          {inv.role}
                        </span>
                      </td>
                      <td className="py-3.5 px-4 text-xs text-slate-500">
                        {new Date(inv.expiresAt).toLocaleString(undefined, {
                          month: 'short',
                          day: 'numeric',
                          hour: '2-digit',
                          minute: '2-digit',
                        })}
                      </td>
                      <td className="py-3.5 px-4 text-right space-x-2">
                        <button
                          onClick={() => copyToClipboard(`${window.location.origin}/invite/${inv.token}`)}
                          className="text-xs text-primary-600 hover:underline font-semibold"
                        >
                          Copy Link
                        </button>
                        <button
                          onClick={() => handleRevokeInvite(inv.id)}
                          className="text-xs text-red-600 hover:underline font-medium"
                        >
                          Cancel
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {/* Modal: Direct Create User */}
      {modalMode === 'direct' && (
        <div className="fixed inset-0 bg-slate-900/50 backdrop-blur-xs flex items-center justify-center p-4 z-50">
          <div className="bg-white rounded-2xl max-w-md w-full p-6 shadow-xl border border-slate-200 space-y-4">
            <div className="flex items-center justify-between">
              <h3 className="text-base font-bold text-slate-900">Add New Team Member</h3>
              <button onClick={() => setModalMode('none')} className="text-slate-400 hover:text-slate-600">
                ✕
              </button>
            </div>

            <form onSubmit={handleDirectCreate} className="space-y-3.5 text-xs sm:text-sm">
              <div>
                <label className="block text-xs font-semibold text-slate-700 uppercase mb-1">Full Name</label>
                <input
                  type="text"
                  placeholder="e.g., Jane Doe"
                  value={directName}
                  onChange={(e) => setDirectName(e.target.value)}
                  className="w-full px-3.5 py-2 border border-slate-300 rounded-xl focus:ring-2 focus:ring-primary-500 focus:outline-none"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 uppercase mb-1">Email Address</label>
                <input
                  type="email"
                  placeholder="jane@company.com"
                  value={directEmail}
                  onChange={(e) => setDirectEmail(e.target.value)}
                  required
                  className="w-full px-3.5 py-2 border border-slate-300 rounded-xl focus:ring-2 focus:ring-primary-500 focus:outline-none"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 uppercase mb-1">Temporary Password</label>
                <input
                  type="password"
                  placeholder="Minimum 6 characters"
                  value={directPassword}
                  onChange={(e) => setDirectPassword(e.target.value)}
                  required
                  className="w-full px-3.5 py-2 border border-slate-300 rounded-xl focus:ring-2 focus:ring-primary-500 focus:outline-none"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 uppercase mb-1">Role</label>
                <select
                  value={directRole}
                  onChange={(e) => setDirectRole(e.target.value as any)}
                  className="w-full px-3.5 py-2 border border-slate-300 rounded-xl bg-white focus:ring-2 focus:ring-primary-500 focus:outline-none"
                >
                  <option value="member">Member (Pipeline Operations)</option>
                  <option value="admin">Admin (Full Workspace Management)</option>
                </select>
              </div>

              {allBoards.length > 0 && directRole === 'member' && (
                <div>
                  <label className="block text-xs font-semibold text-slate-700 uppercase mb-1">
                    Allowed Board Access (Leave empty for all boards)
                  </label>
                  <div className="space-y-1 max-h-32 overflow-y-auto p-2 border border-slate-200 rounded-xl">
                    {allBoards.map((b) => (
                      <label key={b.id} className="flex items-center gap-2 text-xs text-slate-700 cursor-pointer">
                        <input
                          type="checkbox"
                          checked={directBoardIds.includes(b.id)}
                          onChange={(e) => {
                            if (e.target.checked) setDirectBoardIds([...directBoardIds, b.id]);
                            else setDirectBoardIds(directBoardIds.filter((id) => id !== b.id));
                          }}
                          className="rounded text-primary-600 focus:ring-primary-500"
                        />
                        <span>{b.title}</span>
                      </label>
                    ))}
                  </div>
                </div>
              )}

              <div className="flex items-center justify-end gap-2 pt-3">
                <button
                  type="button"
                  onClick={() => setModalMode('none')}
                  className="px-4 py-2 text-xs text-slate-600 hover:bg-slate-100 rounded-xl"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={submittingDirect}
                  className="px-4 py-2 text-xs bg-primary-600 hover:bg-primary-700 text-white font-semibold rounded-xl shadow-xs disabled:opacity-50"
                >
                  {submittingDirect ? 'Creating...' : 'Create User'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Modal: Invite via Link */}
      {modalMode === 'invite' && (
        <div className="fixed inset-0 bg-slate-900/50 backdrop-blur-xs flex items-center justify-center p-4 z-50">
          <div className="bg-white rounded-2xl max-w-md w-full p-6 shadow-xl border border-slate-200 space-y-4">
            <div className="flex items-center justify-between">
              <h3 className="text-base font-bold text-slate-900">Invite via Registration Link</h3>
              <button onClick={() => setModalMode('none')} className="text-slate-400 hover:text-slate-600">
                ✕
              </button>
            </div>

            <p className="text-xs text-slate-500">
              Generate a secure invitation link (valid for 48 hours) for self-registration into this workspace.
            </p>

            <form onSubmit={handleCreateInvite} className="space-y-3.5 text-xs sm:text-sm">
              <div>
                <label className="block text-xs font-semibold text-slate-700 uppercase mb-1">Invitee Email Address</label>
                <input
                  type="email"
                  placeholder="collaborator@company.com"
                  value={inviteEmail}
                  onChange={(e) => setInviteEmail(e.target.value)}
                  required
                  className="w-full px-3.5 py-2 border border-slate-300 rounded-xl focus:ring-2 focus:ring-primary-500 focus:outline-none"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 uppercase mb-1">Assigned Role</label>
                <select
                  value={inviteRole}
                  onChange={(e) => setInviteRole(e.target.value as any)}
                  className="w-full px-3.5 py-2 border border-slate-300 rounded-xl bg-white focus:ring-2 focus:ring-primary-500 focus:outline-none"
                >
                  <option value="member">Member</option>
                  <option value="admin">Admin</option>
                </select>
              </div>

              {generatedLink && (
                <div className="p-3 bg-emerald-50 border border-emerald-200 rounded-xl space-y-2">
                  <p className="text-xs font-semibold text-emerald-800">✅ Link successfully generated:</p>
                  <div className="flex items-center gap-2">
                    <input
                      type="text"
                      readOnly
                      value={generatedLink}
                      className="flex-1 px-2.5 py-1.5 bg-white border border-emerald-300 rounded-lg text-xs font-mono text-slate-700 select-all"
                    />
                    <button
                      type="button"
                      onClick={() => copyToClipboard(generatedLink)}
                      className="px-3 py-1.5 bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-bold rounded-lg shadow-2xs"
                    >
                      Copy
                    </button>
                  </div>
                </div>
              )}

              <div className="flex items-center justify-end gap-2 pt-3">
                <button
                  type="button"
                  onClick={() => setModalMode('none')}
                  className="px-4 py-2 text-xs text-slate-600 hover:bg-slate-100 rounded-xl"
                >
                  Close
                </button>
                <button
                  type="submit"
                  disabled={submittingInvite}
                  className="px-4 py-2 text-xs bg-primary-600 hover:bg-primary-700 text-white font-semibold rounded-xl shadow-xs disabled:opacity-50"
                >
                  {submittingInvite ? 'Generating...' : 'Generate Link'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Modal: Edit User Board Access */}
      {editingUser && (
        <div className="fixed inset-0 bg-slate-900/50 backdrop-blur-xs flex items-center justify-center p-4 z-50">
          <div className="bg-white rounded-2xl max-w-sm w-full p-6 shadow-xl border border-slate-200 space-y-4">
            <div className="flex items-center justify-between">
              <h3 className="text-base font-bold text-slate-900">Board Access Permissions</h3>
              <button onClick={() => setEditingUser(null)} className="text-slate-400 hover:text-slate-600">
                ✕
              </button>
            </div>

            <p className="text-xs text-slate-500">
              Configure allowed boards for <strong>{editingUser.name || editingUser.email}</strong>. Leave all unchecked to grant access to all boards.
            </p>

            <div className="space-y-2 max-h-48 overflow-y-auto p-3 border border-slate-200 rounded-xl">
              {allBoards.map((b) => (
                <label key={b.id} className="flex items-center gap-2.5 text-xs text-slate-700 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={selectedBoardIds.includes(b.id)}
                    onChange={(e) => {
                      if (e.target.checked) setSelectedBoardIds([...selectedBoardIds, b.id]);
                      else setSelectedBoardIds(selectedBoardIds.filter((id) => id !== b.id));
                    }}
                    className="rounded text-primary-600 focus:ring-primary-500"
                  />
                  <span>📌 {b.title}</span>
                </label>
              ))}
            </div>

            <div className="flex items-center justify-end gap-2 pt-2">
              <button
                type="button"
                onClick={() => setEditingUser(null)}
                className="px-4 py-2 text-xs text-slate-600 hover:bg-slate-100 rounded-xl"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleSaveBoardAccess}
                disabled={savingBoards}
                className="px-4 py-2 text-xs bg-primary-600 hover:bg-primary-700 text-white font-semibold rounded-xl shadow-xs disabled:opacity-50"
              >
                {savingBoards ? 'Saving...' : 'Save Permissions'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Modal: Admin Manual Reset Password Member */}
      {resetUserTarget && (
        <div className="fixed inset-0 bg-slate-900/50 backdrop-blur-xs flex items-center justify-center p-4 z-50">
          <div className="bg-white rounded-2xl max-w-sm w-full p-6 shadow-xl border border-slate-200 space-y-4">
            <div className="flex items-center justify-between">
              <h3 className="text-base font-bold text-slate-900">Reset Member Password</h3>
              <button onClick={() => setResetUserTarget(null)} className="text-slate-400 hover:text-slate-600">
                ✕
              </button>
            </div>

            <p className="text-xs text-slate-500">
              Set a new password directly for <strong>{resetUserTarget.name || resetUserTarget.email}</strong>.
            </p>

            <form onSubmit={handleResetPasswordSubmit} className="space-y-3.5 text-xs sm:text-sm">
              <div>
                <label className="block text-xs font-semibold text-slate-700 uppercase mb-1">New Password *</label>
                <input
                  type="password"
                  placeholder="Minimum 6 characters"
                  value={resetNewPassword}
                  onChange={(e) => setResetNewPassword(e.target.value)}
                  required
                  autoFocus
                  className="w-full px-3.5 py-2 border border-slate-300 rounded-xl focus:ring-2 focus:ring-primary-500 focus:outline-none"
                />
              </div>

              <div className="flex items-center justify-end gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => setResetUserTarget(null)}
                  className="px-4 py-2 text-xs text-slate-600 hover:bg-slate-100 rounded-xl"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={savingResetPassword}
                  className="px-4 py-2 text-xs bg-primary-600 hover:bg-primary-700 text-white font-bold rounded-xl shadow-xs disabled:opacity-50"
                >
                  {savingResetPassword ? 'Updating...' : 'Set Password'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
