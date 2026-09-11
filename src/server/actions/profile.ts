'use server';

import bcrypt from 'bcryptjs';
import prisma from '@/lib/prisma';
import { requireAuth } from '@/lib/auth-guards';
import { validateImageInput } from '@/lib/image-validation';

export async function getUserProfile() {
  const user = await requireAuth();
  const dbUser = await prisma.user.findUnique({
    where: { id: user.id },
    include: {
      tenant: {
        select: {
          name: true,
          companyInfo: true,
        },
      },
    },
  });

  return dbUser;
}

export async function updateUserProfile(data: {
  name?: string;
  avatar?: string;
  currentPassword?: string;
  newPassword?: string;
}) {
  const authUser = await requireAuth();

  const user = await prisma.user.findUnique({
    where: { id: authUser.id },
  });

  if (!user) throw new Error('Pengguna tidak ditemukan.');

  const updateData: any = {};

  if (data.name !== undefined) {
    updateData.name = data.name.trim() || null;
  }

  if (data.avatar !== undefined) {
    updateData.avatar = validateImageInput(data.avatar, 'Foto Profil');
  }

  if (data.newPassword) {
    if (!data.currentPassword) {
      throw new Error('Password saat ini wajib diisi untuk mengganti password.');
    }
    const isValid = await bcrypt.compare(data.currentPassword, user.passwordHash);
    if (!isValid) {
      throw new Error('Password saat ini salah.');
    }
    if (data.newPassword.length < 6) {
      throw new Error('Password baru minimal 6 karakter.');
    }
    updateData.passwordHash = await bcrypt.hash(data.newPassword, 12);
  }

  const updated = await prisma.user.update({
    where: { id: user.id },
    data: updateData,
    select: {
      id: true,
      email: true,
      name: true,
      avatar: true,
      role: true,
    },
  });

  return { success: true, user: updated };
}
