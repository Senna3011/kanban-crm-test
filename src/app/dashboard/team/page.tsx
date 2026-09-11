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
      toast.error(err?.message || 'Gagal memuat data tim');
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
      toast.error('Email dan password wajib diisi.');
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
      toast.success('Pengguna baru berhasil dibuat!');
      setDirectName('');
      setDirectEmail('');
      setDirectPassword('');
      setDirectRole('member');
      setDirectBoardIds([]);
      setModalMode('none');
      loadData();
    } catch (err: any) {
      toast.error(err?.message || 'Gagal membuat pengguna');
    } finally {
      setSubmittingDirect(false);
    }
  };

  const handleCreateInvite = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!inviteEmail) {
      toast.error('Email wajib diisi.');
      return;
    }
    setSubmittingInvite(true);
    try {
      const res = await createInvitation({
        email: inviteEmail,
        role: inviteRole,
      });
      setGeneratedLink(res.inviteLink);
      toast.success(res.emailSent ? 'Undangan terkirim via email!' : 'Link undangan berhasil dibuat!');
      setInviteEmail('');
      setInviteRole('member');
      loadData();
    } catch (err: any) {
      toast.error(err?.message || 'Gagal membuat undangan');
    } finally {
      setSubmittingInvite(false);
    }
  };

  const handleDeleteUser = async (userId: string, email: string) => {
    if (!confirm(`Hapus pengguna ${email} dari tim?`)) return;
    try {
      await deleteTenantUser(userId);
      toast.success('Pengguna berhasil dihapus.');
      loadData();
    } catch (err: any) {
      toast.error(err?.message || 'Gagal menghapus pengguna.');
    }
  };

  const handleRoleChange = async (userId: string, newRole: 'admin' | 'member') => {
    try {
      await updateTenantUserRole(userId, newRole);
      toast.success('Peran pengguna berhasil diperbarui.');
      loadData();
    } catch (err: any) {
      toast.error(err?.message || 'Gagal memperbarui peran.');
    }
  };

  const handleRevokeInvite = async (inviteId: string) => {
    if (!confirm('Batalkan undangan ini?')) return;
    try {
      await revokeInvitation(inviteId);
      toast.success('Undangan dibatalkan.');
      loadData();
    } catch (err: any) {
      toast.error(err?.message || 'Gagal membatalkan undangan.');
    }
  };

  const handleSaveBoardAccess = async () => {
    if (!editingUser) return;
    setSavingBoards(true);
    try {
      await updateUserBoardAccess(editingUser.id, selectedBoardIds);
      toast.success('Penugasan papan kerja berhasil diperbarui.');
      setEditingUser(null);
      loadData();
    } catch (err: any) {
      toast.error(err?.message || 'Gagal memperbarui penugasan.');
    } finally {
      setSavingBoards(false);
    }
  };

  const copyToClipboard = (text: string) => {
    navigator.clipboard.writeText(text);
    toast.success('Link undangan disalin ke clipboard!');
  };

  return (
    <div className="max-w-5xl space-y-6 pb-12">
      <Toaster position="top-right" />

      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-xl sm:text-2xl font-bold text-slate-900">Manajemen Pengguna & Tim</h1>
          <p className="text-xs sm:text-sm text-slate-500 mt-1">
            Kelola akses anggota tim, atur penugasan papan kerja (board), atau kirim tautan undangan.
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
              <span>Buat User Baru</span>
            </button>
            <button
              onClick={() => {
                setGeneratedLink(null);
                setModalMode('invite');
              }}
              className="inline-flex items-center gap-1.5 px-3.5 py-2 bg-white hover:bg-slate-50 text-slate-700 border border-slate-200 text-xs font-semibold rounded-xl shadow-xs transition"
            >
              <span>✉️</span>
              <span>Undang via Email</span>
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
          Anggota Tim ({users.length})
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
            Undangan Pending ({invitations.length})
          </button>
        )}
      </div>

      {/* Content Section */}
      {loading ? (
        <div className="bg-white rounded-2xl border border-slate-200 p-12 text-center">
          <div className="animate-spin h-7 w-7 border-3 border-primary-200 border-t-primary-600 rounded-full mx-auto" />
          <p className="text-xs text-slate-400 mt-3">Memuat data pengguna...</p>
        </div>
      ) : activeTab === 'members' ? (
        /* Members List */
        <div className="bg-white rounded-2xl border border-slate-200/90 shadow-sm overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs sm:text-sm">
              <thead className="bg-slate-50/75 border-b border-slate-200 text-slate-500 text-[11px] uppercase tracking-wider font-semibold">
                <tr>
                  <th className="py-3 px-4">Pengguna</th>
                  <th className="py-3 px-4">Peran (Role)</th>
                  <th className="py-3 px-4">Akses Papan (Board)</th>
                  <th className="py-3 px-4">Terdaftar</th>
                  {isAdmin && <th className="py-3 px-4 text-right">Aksi</th>}
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
                              {u.name || 'Tanpa Nama'}
                              {isSelf && (
                                <span className="text-[10px] bg-slate-100 text-slate-600 px-1.5 py-0.5 rounded font-normal">
                                  Anda
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
                            className="text-xs border border-slate-200 rounded-lg px-2 py-1 bg-white font-medium text-slate-700 focus:outline-none focus:ring-1 focus:ring-primary-500"
                          >
                            <option value="member">Member</option>
                            <option value="admin">Admin</option>
                          </select>
                        ) : (
                          <span
                            className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-semibold capitalize ${
                              u.role === 'admin'
                                ? 'bg-indigo-50 text-indigo-700 border border-indigo-200'
                                : 'bg-slate-100 text-slate-700'
                            }`}
                          >
                            {u.role}
                          </span>
                        )}
                      </td>
                      <td className="py-3.5 px-4">
                        {u.role === 'admin' ? (
                          <span className="text-xs font-medium text-slate-400 italic">Semua Papan (Akses Penuh)</span>
                        ) : (
                          <div className="flex items-center gap-1.5 flex-wrap">
                            {assignedBoardTitles.length === 0 ? (
                              <span className="text-xs text-slate-400">Semua Papan (Default)</span>
                            ) : (
                              assignedBoardTitles.map((title, idx) => (
                                <span
                                  key={idx}
                                  className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-[11px] font-semibold bg-blue-50 text-blue-700 border border-blue-200"
                                >
                                  <span>📌</span>
                                  <span>{title}</span>
                                </span>
                              ))
                            )}
                            {isAdmin && !isSelf && (
                              <button
                                onClick={() => {
                                  setEditingUser(u);
                                  setSelectedBoardIds(parsedBoardIds);
                                }}
                                className="text-[11px] text-primary-600 hover:text-primary-800 underline font-semibold ml-1"
                              >
                                Atur Board
                              </button>
                            )}
                          </div>
                        )}
                      </td>
                      <td className="py-3.5 px-4 text-xs text-slate-500">
                        {new Date(u.createdAt).toLocaleDateString('id-ID', {
                          day: 'numeric',
                          month: 'short',
                          year: 'numeric',
                        })}
                      </td>
                      {isAdmin && (
                        <td className="py-3.5 px-4 text-right">
                          {!isSelf && (
                            <button
                              onClick={() => handleDeleteUser(u.id, u.email)}
                              className="text-xs text-red-600 hover:text-red-800 font-medium px-2 py-1 rounded hover:bg-red-50 transition"
                            >
                              Hapus
                            </button>
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
        /* Invitations List */
        <div className="bg-white rounded-2xl border border-slate-200/90 shadow-sm overflow-hidden">
          {invitations.length === 0 ? (
            <div className="p-12 text-center text-slate-400 text-xs">
              Tidak ada undangan yang sedang aktif/pending.
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs sm:text-sm">
                <thead className="bg-slate-50/75 border-b border-slate-200 text-slate-500 text-[11px] uppercase tracking-wider font-semibold">
                  <tr>
                    <th className="py-3 px-4">Email Calon Pengguna</th>
                    <th className="py-3 px-4">Peran</th>
                    <th className="py-3 px-4">Kadaluarsa</th>
                    <th className="py-3 px-4 text-right">Aksi</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {invitations.map((inv) => {
                    const isExpired = new Date() > new Date(inv.expiresAt);
                    const link = `${typeof window !== 'undefined' ? window.location.origin : ''}/invite/${inv.token}`;
                    return (
                      <tr key={inv.id} className="hover:bg-slate-50/60 transition">
                        <td className="py-3.5 px-4">
                          <p className="font-semibold text-slate-900">{inv.email}</p>
                          <p className="text-[11px] text-slate-400 font-mono truncate max-w-xs">{inv.token}</p>
                        </td>
                        <td className="py-3.5 px-4">
                          <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-semibold capitalize bg-blue-50 text-blue-700 border border-blue-200">
                            {inv.role}
                          </span>
                        </td>
                        <td className="py-3.5 px-4 text-xs">
                          {isExpired ? (
                            <span className="text-red-600 font-semibold">Kadaluarsa</span>
                          ) : (
                            <span className="text-slate-600">
                              {new Date(inv.expiresAt).toLocaleDateString('id-ID', {
                                day: 'numeric',
                                month: 'short',
                                hour: '2-digit',
                                minute: '2-digit',
                              })}
                            </span>
                          )}
                        </td>
                        <td className="py-3.5 px-4 text-right space-x-2">
                          {!isExpired && (
                            <button
                              onClick={() => copyToClipboard(link)}
                              className="text-xs text-primary-600 hover:text-primary-800 font-medium px-2 py-1 rounded hover:bg-primary-50 transition"
                            >
                              Salin Link
                            </button>
                          )}
                          <button
                            onClick={() => handleRevokeInvite(inv.id)}
                            className="text-xs text-red-600 hover:text-red-800 font-medium px-2 py-1 rounded hover:bg-red-50 transition"
                          >
                            Batalkan
                          </button>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {/* Modal: Direct User Creation */}
      {modalMode === 'direct' && (
        <div className="fixed inset-0 bg-slate-900/50 backdrop-blur-xs flex items-center justify-center p-4 z-50">
          <div className="bg-white rounded-2xl max-w-md w-full p-6 shadow-xl border border-slate-200 space-y-4 max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between">
              <h2 className="text-base font-bold text-slate-900">Buat Akun Pengguna Langsung</h2>
              <button
                onClick={() => setModalMode('none')}
                className="text-slate-400 hover:text-slate-600 text-lg leading-none"
              >
                ✕
              </button>
            </div>
            <p className="text-xs text-slate-500">
              Admin membuatkan akun langsung dengan password sementara dan menentukan penempatan papan kerja (board).
            </p>

            <form onSubmit={handleDirectCreate} className="space-y-3">
              <div>
                <label className="block text-[11px] font-bold text-slate-600 uppercase mb-1">
                  Nama Lengkap
                </label>
                <input
                  type="text"
                  value={directName}
                  onChange={(e) => setDirectName(e.target.value)}
                  placeholder="Contoh: Siti Rahma"
                  className="w-full px-3 py-2 text-xs border border-slate-200 rounded-xl focus:ring-2 focus:ring-primary-500 focus:outline-none"
                />
              </div>

              <div>
                <label className="block text-[11px] font-bold text-slate-600 uppercase mb-1">
                  Email Akun *
                </label>
                <input
                  type="email"
                  required
                  value={directEmail}
                  onChange={(e) => setDirectEmail(e.target.value)}
                  placeholder="user@startupanda.com"
                  className="w-full px-3 py-2 text-xs border border-slate-200 rounded-xl focus:ring-2 focus:ring-primary-500 focus:outline-none"
                />
              </div>

              <div>
                <label className="block text-[11px] font-bold text-slate-600 uppercase mb-1">
                  Password Sementara *
                </label>
                <input
                  type="password"
                  required
                  value={directPassword}
                  onChange={(e) => setDirectPassword(e.target.value)}
                  placeholder="Minimal 6 karakter"
                  className="w-full px-3 py-2 text-xs border border-slate-200 rounded-xl focus:ring-2 focus:ring-primary-500 focus:outline-none"
                />
              </div>

              <div>
                <label className="block text-[11px] font-bold text-slate-600 uppercase mb-1">
                  Peran (Role)
                </label>
                <select
                  value={directRole}
                  onChange={(e) => setDirectRole(e.target.value as any)}
                  className="w-full px-3 py-2 text-xs border border-slate-200 rounded-xl bg-white focus:ring-2 focus:ring-primary-500 focus:outline-none font-medium"
                >
                  <option value="member">Member (Kelola Kartu & Draft)</option>
                  <option value="admin">Admin (Akses Penuh & Konfigurasi)</option>
                </select>
              </div>

              {directRole === 'member' && allBoards.length > 1 && (
                <div>
                  <label className="block text-[11px] font-bold text-slate-600 uppercase mb-1">
                    Penugasan Papan Kerja (Pilih Board)
                  </label>
                  <div className="p-3 bg-slate-50 border border-slate-200 rounded-xl space-y-1.5 max-h-32 overflow-y-auto">
                    {allBoards.map((b) => (
                      <label key={b.id} className="flex items-center gap-2 text-xs text-slate-700 cursor-pointer">
                        <input
                          type="checkbox"
                          checked={directBoardIds.includes(b.id)}
                          onChange={(e) => {
                            if (e.target.checked) {
                              setDirectBoardIds((prev) => [...prev, b.id]);
                            } else {
                              setDirectBoardIds((prev) => prev.filter((id) => id !== b.id));
                            }
                          }}
                          className="rounded text-primary-600 focus:ring-primary-500"
                        />
                        <span>{b.title}</span>
                      </label>
                    ))}
                  </div>
                  <p className="text-[10px] text-slate-400 mt-1">Kosongkan centang jika user boleh mengakses semua papan.</p>
                </div>
              )}

              <div className="flex items-center justify-end gap-2 pt-3">
                <button
                  type="button"
                  onClick={() => setModalMode('none')}
                  className="px-4 py-2 text-xs font-semibold text-slate-600 hover:bg-slate-100 rounded-xl transition"
                >
                  Batal
                </button>
                <button
                  type="submit"
                  disabled={submittingDirect}
                  className="px-4 py-2 text-xs font-semibold bg-primary-600 hover:bg-primary-700 disabled:opacity-50 text-white rounded-xl shadow-xs transition"
                >
                  {submittingDirect ? 'Menyimpan...' : 'Buat Akun'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Modal: Edit Board Access for Member */}
      {editingUser && (
        <div className="fixed inset-0 bg-slate-900/50 backdrop-blur-xs flex items-center justify-center p-4 z-50">
          <div className="bg-white rounded-2xl max-w-sm w-full p-6 shadow-xl border border-slate-200 space-y-4">
            <div className="flex items-center justify-between">
              <h2 className="text-base font-bold text-slate-900">Atur Akses Papan Kerja</h2>
              <button
                onClick={() => setEditingUser(null)}
                className="text-slate-400 hover:text-slate-600 text-lg leading-none"
              >
                ✕
              </button>
            </div>
            <p className="text-xs text-slate-500">
              Pilih papan kerja (board) yang dapat diakses dan dilihat oleh <strong>{editingUser.name || editingUser.email}</strong>.
            </p>

            <div className="p-3 bg-slate-50 border border-slate-200 rounded-xl space-y-2 max-h-48 overflow-y-auto">
              {allBoards.map((b) => (
                <label key={b.id} className="flex items-center gap-2 text-xs text-slate-700 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={selectedBoardIds.includes(b.id)}
                    onChange={(e) => {
                      if (e.target.checked) {
                        setSelectedBoardIds((prev) => [...prev, b.id]);
                      } else {
                        setSelectedBoardIds((prev) => prev.filter((id) => id !== b.id));
                      }
                    }}
                    className="rounded text-primary-600 focus:ring-primary-500"
                  />
                  <span className="font-medium">{b.title}</span>
                </label>
              ))}
            </div>
            <p className="text-[10px] text-slate-400">
              Jika tidak ada yang dicentang, anggota tim otomatis dapat melihat seluruh papan kerja di workspace ini.
            </p>

            <div className="flex items-center justify-end gap-2 pt-2">
              <button
                type="button"
                onClick={() => setEditingUser(null)}
                className="px-4 py-2 text-xs font-semibold text-slate-600 hover:bg-slate-100 rounded-xl transition"
              >
                Batal
              </button>
              <button
                type="button"
                disabled={savingBoards}
                onClick={handleSaveBoardAccess}
                className="px-4 py-2 text-xs font-semibold bg-primary-600 hover:bg-primary-700 disabled:opacity-50 text-white rounded-xl shadow-xs transition"
              >
                {savingBoards ? 'Menyimpan...' : 'Simpan Penugasan'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Modal: Email / Link Invitation */}
      {modalMode === 'invite' && (
        <div className="fixed inset-0 bg-slate-900/50 backdrop-blur-xs flex items-center justify-center p-4 z-50">
          <div className="bg-white rounded-2xl max-w-md w-full p-6 shadow-xl border border-slate-200 space-y-4">
            <div className="flex items-center justify-between">
              <h2 className="text-base font-bold text-slate-900">Undang Anggota via Email / Link</h2>
              <button
                onClick={() => {
                  setModalMode('none');
                  setGeneratedLink(null);
                }}
                className="text-slate-400 hover:text-slate-600 text-lg leading-none"
              >
                ✕
              </button>
            </div>
            <p className="text-xs text-slate-500">
              Sistem akan mengirimkan undangan ke email calon anggota atau Anda dapat menyalin link registrasi secara manual.
            </p>

            {generatedLink ? (
              <div className="space-y-3 bg-emerald-50 border border-emerald-200 rounded-xl p-4">
                <p className="text-xs font-bold text-emerald-800">✓ Undangan Berhasil Dibuat!</p>
                <p className="text-[11px] text-emerald-700">
                  Bagikan tautan berikut kepada calon anggota (berlaku 48 jam):
                </p>
                <div className="flex items-center gap-2">
                  <input
                    type="text"
                    readOnly
                    value={generatedLink}
                    className="w-full px-2.5 py-1.5 text-xs bg-white border border-emerald-300 rounded-lg text-slate-700 font-mono"
                  />
                  <button
                    onClick={() => copyToClipboard(generatedLink)}
                    className="px-3 py-1.5 bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-semibold rounded-lg shrink-0"
                  >
                    Salin
                  </button>
                </div>
                <div className="text-right pt-2">
                  <button
                    onClick={() => {
                      setGeneratedLink(null);
                      setModalMode('none');
                    }}
                    className="text-xs font-semibold text-emerald-800 underline"
                  >
                    Selesai
                  </button>
                </div>
              </div>
            ) : (
              <form onSubmit={handleCreateInvite} className="space-y-3">
                <div>
                  <label className="block text-[11px] font-bold text-slate-600 uppercase mb-1">
                    Email Calon Anggota *
                  </label>
                  <input
                    type="email"
                    required
                    value={inviteEmail}
                    onChange={(e) => setInviteEmail(e.target.value)}
                    placeholder="calon.anggota@gmail.com"
                    className="w-full px-3 py-2 text-xs border border-slate-200 rounded-xl focus:ring-2 focus:ring-primary-500 focus:outline-none"
                  />
                </div>

                <div>
                  <label className="block text-[11px] font-bold text-slate-600 uppercase mb-1">
                    Peran (Role)
                  </label>
                  <select
                    value={inviteRole}
                    onChange={(e) => setInviteRole(e.target.value as any)}
                    className="w-full px-3 py-2 text-xs border border-slate-200 rounded-xl bg-white focus:ring-2 focus:ring-primary-500 focus:outline-none font-medium"
                  >
                    <option value="member">Member (Kelola Kartu & Draft)</option>
                    <option value="admin">Admin (Akses Penuh & Konfigurasi)</option>
                  </select>
                </div>

                <div className="flex items-center justify-end gap-2 pt-3">
                  <button
                    type="button"
                    onClick={() => setModalMode('none')}
                    className="px-4 py-2 text-xs font-semibold text-slate-600 hover:bg-slate-100 rounded-xl transition"
                  >
                    Batal
                  </button>
                  <button
                    type="submit"
                    disabled={submittingInvite}
                    className="px-4 py-2 text-xs font-semibold bg-primary-600 hover:bg-primary-700 disabled:opacity-50 text-white rounded-xl shadow-xs transition"
                  >
                    {submittingInvite ? 'Memproses...' : 'Buat & Kirim Undangan'}
                  </button>
                </div>
              </form>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
