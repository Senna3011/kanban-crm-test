'use server';

import bcrypt from 'bcryptjs';
import prisma from '@/lib/prisma';
import { requireAuth, requireAdmin } from '@/lib/auth-guards';

export async function getTenantUsers() {
  const user = await requireAuth();
  const [users, tenant] = await Promise.all([
    prisma.user.findMany({
      where: { tenantId: user.tenantId },
      select: {
        id: true,
        email: true,
        name: true,
        role: true,
        avatar: true,
        createdAt: true,
      },
      orderBy: { createdAt: 'asc' },
    }),
    prisma.tenant.findUnique({
      where: { id: user.tenantId },
      select: { companyInfo: true },
    }),
  ]);

  let userBoardMap: Record<string, string[]> = {};
  try {
    if (tenant?.companyInfo) {
      const parsed = JSON.parse(tenant.companyInfo);
      userBoardMap = parsed.userBoardMap || {};
    }
  } catch {}

  return users.map((u) => ({
    ...u,
    assignedBoardIds: JSON.stringify(userBoardMap[u.id] || []),
  }));
}

export async function createTenantUser(data: {
  email: string;
  name?: string;
  password: string;
  role?: 'admin' | 'member';
  boardIds?: string[];
}) {
  const admin = await requireAdmin();

  const email = data.email?.trim().toLowerCase();
  if (!email || !email.includes('@')) {
    throw new Error('Alamat email tidak valid.');
  }

  if (!data.password || data.password.length < 6) {
    throw new Error('Password minimal 6 karakter.');
  }

  const role = data.role === 'admin' ? 'admin' : 'member';

  const existing = await prisma.user.findUnique({
    where: { email },
  });

  if (existing) {
    throw new Error('Email sudah terdaftar.');
  }

  const passwordHash = await bcrypt.hash(data.password, 12);

  const newUser = await prisma.user.create({
    data: {
      email,
      name: data.name?.trim() || null,
      passwordHash,
      role,
      tenantId: admin.tenantId,
    },
    select: {
      id: true,
      email: true,
      name: true,
      role: true,
      createdAt: true,
    },
  });

  if (data.boardIds && data.boardIds.length > 0) {
    await updateUserBoardAccess(newUser.id, data.boardIds);
  }

  return { success: true, user: newUser };
}

export async function updateUserBoardAccess(userId: string, boardIds: string[]) {
  const admin = await requireAdmin();

  const tenant = await prisma.tenant.findUnique({
    where: { id: admin.tenantId },
    select: { companyInfo: true, name: true },
  });

  let currentInfo: any = {};
  try {
    if (tenant?.companyInfo) currentInfo = JSON.parse(tenant.companyInfo);
  } catch {}

  const currentMap = currentInfo.userBoardMap || {};
  if (boardIds.length > 0) {
    currentMap[userId] = boardIds;
  } else {
    delete currentMap[userId];
  }

  currentInfo.userBoardMap = currentMap;

  await prisma.tenant.update({
    where: { id: admin.tenantId },
    data: { companyInfo: JSON.stringify(currentInfo) },
  });

  return { success: true };
}

export async function deleteTenantUser(userId: string) {
  const admin = await requireAdmin();

  if (admin.id === userId) {
    throw new Error('Tidak dapat menghapus akun admin sendiri.');
  }

  const target = await prisma.user.findFirst({
    where: { id: userId, tenantId: admin.tenantId },
  });

  if (!target) {
    throw new Error('User tidak ditemukan.');
  }

  await prisma.user.delete({
    where: { id: userId },
  });

  return { success: true };
}

export async function updateTenantUserRole(userId: string, role: 'admin' | 'member') {
  const admin = await requireAdmin();

  if (admin.id === userId) {
    throw new Error('Tidak dapat mengubah role akun sendiri.');
  }

  const target = await prisma.user.findFirst({
    where: { id: userId, tenantId: admin.tenantId },
  });

  if (!target) {
    throw new Error('User tidak ditemukan.');
  }

  await prisma.user.update({
    where: { id: userId },
    data: { role: role === 'admin' ? 'admin' : 'member' },
  });

  return { success: true };
}
