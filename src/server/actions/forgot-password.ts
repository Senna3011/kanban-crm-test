'use server';

import crypto from 'crypto';
import bcrypt from 'bcryptjs';
import prisma from '@/lib/prisma';
import nodemailer from 'nodemailer';
import { decrypt } from '@/lib/encryption';

export async function requestPasswordReset(emailInput: string) {
  const email = emailInput.trim().toLowerCase();
  if (!email || !email.includes('@')) {
    throw new Error('Please enter a valid email address.');
  }

  const user = await prisma.user.findUnique({
    where: { email },
    include: { tenant: true },
  });

  // If user does not exist, return generic success to prevent email enumeration
  if (!user) {
    return {
      success: true,
      message: 'If an account exists with this email, password reset instructions have been generated.',
    };
  }

  const token = crypto.randomBytes(32).toString('hex');
  const expires = new Date(Date.now() + 60 * 60 * 1000); // 1 hour validity

  await prisma.user.update({
    where: { id: user.id },
    data: {
      resetPasswordToken: token,
      resetPasswordExpires: expires,
    } as any,
  });

  const baseUrl = process.env.NEXTAUTH_URL || 'http://localhost:3099';
  const resetLink = `${baseUrl.replace(/\/$/, '')}/reset-password/${token}`;

  // Attempt to send email via active tenant email config if configured
  let emailSent = false;
  try {
    const config = await prisma.emailConfig.findFirst({
      where: { tenantId: user.tenantId, isActive: true },
    });

    if (config && (config.smtpPass || config.accessToken)) {
      const authConfig: any = { user: config.smtpUser };
      if (config.authType === 'oauth2' && config.accessToken) {
        const { getValidZohoAccessToken } = await import('@/lib/zoho-oauth');
        authConfig.type = 'OAuth2';
        authConfig.accessToken = await getValidZohoAccessToken(config.id);
      } else if (config.smtpPass) {
        authConfig.pass = decrypt(config.smtpPass);
      }

      const transporter = nodemailer.createTransport({
        host: config.smtpHost,
        port: config.smtpPort,
        secure: config.smtpPort === 465,
        requireTLS: config.smtpPort === 587,
        auth: authConfig,
      });

      await transporter.sendMail({
        from: `"${user.tenant.name} Support" <${config.smtpUser}>`,
        to: user.email,
        subject: `Reset your ${user.tenant.name} password`,
        text: `Hello ${user.name || 'User'},\n\nWe received a request to reset your password. Click the link below to set a new password:\n\n${resetLink}\n\nThis link is valid for 1 hour. If you did not request this, you can ignore this email.\n\nBest regards,\n${user.tenant.name}`,
      });
      emailSent = true;
    }
  } catch (err: any) {
    console.error('[requestPasswordReset] SMTP sending error:', err?.message || err);
  }

  return {
    success: true,
    emailSent,
    resetLink: !emailSent ? resetLink : undefined,
    message: emailSent
      ? 'Password reset link has been sent to your email.'
      : 'Password reset link generated successfully.',
  };
}

export async function resetPasswordWithToken(token: string, newPassword: string) {
  if (!token || token.length < 16) {
    throw new Error('Invalid or missing reset token.');
  }

  if (!newPassword || newPassword.length < 6) {
    throw new Error('Password must be at least 6 characters.');
  }

  const user = await prisma.user.findFirst({
    where: {
      resetPasswordToken: token,
      resetPasswordExpires: { gt: new Date() },
    } as any,
  });

  if (!user) {
    throw new Error('Reset link is invalid or has expired. Please request a new one.');
  }

  const passwordHash = await bcrypt.hash(newPassword, 12);

  await prisma.user.update({
    where: { id: user.id },
    data: {
      passwordHash,
      resetPasswordToken: null,
      resetPasswordExpires: null,
    } as any,
  });

  return {
    success: true,
    email: user.email,
  };
}
