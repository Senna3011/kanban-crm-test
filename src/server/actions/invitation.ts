'use server';

import crypto from 'crypto';
import bcrypt from 'bcryptjs';
import prisma from '@/lib/prisma';
import { requireAdmin, requireAuth } from '@/lib/auth-guards';
import nodemailer from 'nodemailer';
import { decrypt } from '@/lib/encryption';
import { getValidZohoAccessToken } from '@/lib/zoho-oauth';
import { headers } from 'next/headers';

async function getBaseUrl(): Promise<string> {
  if (process.env.NEXTAUTH_URL && !process.env.NEXTAUTH_URL.includes('localhost')) {
    return process.env.NEXTAUTH_URL;
  }
  try {
    const headersList = await headers();
    const host = headersList.get('x-forwarded-host') || headersList.get('host');
    const proto = headersList.get('x-forwarded-proto') || (host?.includes('localhost') ? 'http' : 'https');
    if (host) {
      return `${proto}://${host}`;
    }
  } catch {}
  return process.env.NEXTAUTH_URL || 'http://localhost:3099';
}

export async function getTenantInvitations() {
  const user = await requireAuth();
  return prisma.invitation.findMany({
    where: { tenantId: user.tenantId },
    orderBy: { createdAt: 'desc' },
  });
}

export async function createInvitation(data: { email: string; role?: 'admin' | 'member' }) {
  const admin = await requireAdmin();

  const email = data.email?.trim().toLowerCase();
  if (!email || !email.includes('@')) {
    throw new Error('Alamat email tidak valid.');
  }

  // Check if already a user
  const existingUser = await prisma.user.findUnique({ where: { email } });
  if (existingUser) {
    throw new Error('User dengan email ini sudah terdaftar di sistem.');
  }

  const role = data.role === 'admin' ? 'admin' : 'member';
  const token = crypto.randomBytes(24).toString('hex');
  const expiresAt = new Date(Date.now() + 48 * 60 * 60 * 1000); // 48 hours

  // Upsert invitation for this tenant & email
  const invitation = await prisma.invitation.upsert({
    where: { tenantId_email: { tenantId: admin.tenantId, email } },
    update: {
      token,
      role,
      expiresAt,
      invitedById: admin.id,
    },
    create: {
      tenantId: admin.tenantId,
      email,
      role,
      token,
      expiresAt,
      invitedById: admin.id,
    },
  });

  const baseUrl = (await getBaseUrl()).replace(/\/$/, '');
  const inviteLink = `${baseUrl}/invite/${token}`;

  // Try sending invitation email if SMTP is configured
  let emailSent = false;
  try {
    const config = await prisma.emailConfig.findFirst({
      where: { tenantId: admin.tenantId, isActive: true },
    });

    if (config) {
      let transporter: nodemailer.Transporter | null = null;
      if (config.authType === 'oauth2' && config.accessToken) {
        const accessToken = await getValidZohoAccessToken(config.id);
        transporter = nodemailer.createTransport({
          host: config.smtpHost,
          port: config.smtpPort,
          secure: config.smtpPort === 465,
          requireTLS: config.smtpPort === 587,
          auth: {
            type: 'OAuth2',
            user: config.smtpUser,
            accessToken,
          },
        });
      } else if (config.smtpPass) {
        transporter = nodemailer.createTransport({
          host: config.smtpHost,
          port: config.smtpPort,
          secure: config.smtpPort === 465,
          requireTLS: config.smtpPort === 587,
          auth: {
            user: config.smtpUser,
            pass: decrypt(config.smtpPass),
          },
        });
      }

      if (transporter) {
        await transporter.sendMail({
          from: config.smtpUser,
          to: email,
          subject: `Undangan Bergabung ke CRM - ${admin.tenantName}`,
          html: `
            <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px; border: 1px solid #e5e7eb; rounded: 8px;">
              <h2 style="color: #2563eb;">Undangan Bergabung ke CRM</h2>
              <p>Halo,</p>
              <p>Anda telah diundang oleh administrator <strong>${admin.tenantName}</strong> untuk bergabung sebagai <strong>${role}</strong> di Kanban CRM.</p>
              <div style="margin: 30px 0;">
                <a href="${inviteLink}" style="background-color: #2563eb; color: #ffffff; padding: 12px 24px; text-decoration: none; border-radius: 6px; font-weight: bold; display: inline-block;">
                  Terima Undangan & Buat Akun
                </a>
              </div>
              <p style="color: #6b7280; font-size: 14px;">Link ini berlaku selama 48 jam. Jika tombol tidak berfungsi, salin link berikut:</p>
              <p style="color: #2563eb; word-break: break-all; font-size: 13px;">${inviteLink}</p>
            </div>
          `,
        });
        emailSent = true;
      }
    }
  } catch (err) {
    console.warn('[Invitation] Could not send email automatically:', (err as any)?.message);
  }

  return {
    success: true,
    inviteLink,
    emailSent,
    invitation: {
      id: invitation.id,
      email: invitation.email,
      role: invitation.role,
      expiresAt: invitation.expiresAt,
    },
  };
}

export async function revokeInvitation(invitationId: string) {
  const admin = await requireAdmin();

  const inv = await prisma.invitation.findFirst({
    where: { id: invitationId, tenantId: admin.tenantId },
  });

  if (!inv) throw new Error('Undangan tidak ditemukan.');

  await prisma.invitation.delete({ where: { id: invitationId } });
  return { success: true };
}

export async function getInvitationDetails(token: string) {
  if (!token) throw new Error('Token undangan tidak valid.');

  const inv = await prisma.invitation.findUnique({
    where: { token },
    include: { tenant: { select: { name: true } } },
  });

  if (!inv) {
    return { valid: false, reason: 'Undangan tidak ditemukan atau sudah digunakan.' };
  }

  if (new Date() > new Date(inv.expiresAt)) {
    return { valid: false, reason: 'Undangan ini sudah kadaluarsa (melewati 48 jam).' };
  }

  return {
    valid: true,
    email: inv.email,
    role: inv.role,
    tenantName: inv.tenant.name,
  };
}

export async function acceptInvitation(data: {
  token: string;
  name: string;
  password: string;
}) {
  const { token, name, password } = data;

  if (!token) throw new Error('Token wajib diisi.');
  if (!name || name.trim().length < 2) throw new Error('Nama minimal 2 karakter.');
  if (!password || password.length < 6) throw new Error('Password minimal 6 karakter.');

  const inv = await prisma.invitation.findUnique({
    where: { token },
  });

  if (!inv) {
    throw new Error('Undangan tidak valid atau sudah digunakan.');
  }

  if (new Date() > new Date(inv.expiresAt)) {
    throw new Error('Undangan ini sudah kadaluarsa.');
  }

  const existingUser = await prisma.user.findUnique({
    where: { email: inv.email },
  });

  if (existingUser) {
    // Delete stale invitation
    await prisma.invitation.delete({ where: { id: inv.id } }).catch(() => {});
    throw new Error('Email ini sudah memiliki akun aktif. Silakan langsung login.');
  }

  const passwordHash = await bcrypt.hash(password, 12);

  // Transaction: create user and delete invitation
  const newUser = await prisma.$transaction(async (tx) => {
    const user = await tx.user.create({
      data: {
        email: inv.email,
        name: name.trim(),
        passwordHash,
        role: inv.role,
        tenantId: inv.tenantId,
      },
    });

    await tx.invitation.delete({
      where: { id: inv.id },
    });

    return user;
  });

  return { success: true, email: newUser.email };
}
