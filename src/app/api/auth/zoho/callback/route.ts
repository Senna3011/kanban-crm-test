import { NextRequest, NextResponse } from 'next/server';
import prisma from '@/lib/prisma';
import { exchangeZohoCode, fetchZohoUserInfo, verifyOAuthState } from '@/lib/zoho-oauth';
import { encrypt } from '@/lib/encryption';
import { revalidatePath } from 'next/cache';

export const dynamic = 'force-dynamic';

export async function GET(req: NextRequest) {
  const searchParams = req.nextUrl.searchParams;
  const code = searchParams.get('code');
  const state = searchParams.get('state');
  const error = searchParams.get('error');

  const baseUrl = process.env.NEXTAUTH_URL || `${req.nextUrl.protocol}//${req.nextUrl.host}`;
  const settingsUrl = `${baseUrl.replace(/\/$/, '')}/dashboard/settings`;

  if (error) {
    return NextResponse.redirect(`${settingsUrl}?error=${encodeURIComponent(error)}`);
  }

  if (!code || !state) {
    return NextResponse.redirect(`${settingsUrl}?error=missing_code_or_state`);
  }

  const stateData = verifyOAuthState(state);
  if (!stateData || !stateData.tenantId) {
    return NextResponse.redirect(`${settingsUrl}?error=invalid_or_expired_state`);
  }

  const { tenantId, boardId, loginEmail } = stateData;

  try {
    const tokenResult = await exchangeZohoCode(code);

    // Try to get email from API first, fallback to user-provided email
    let email = '';
    let zohoAccountId: string | null = null;
    try {
      const userInfo = await fetchZohoUserInfo(tokenResult.accessToken);
      email = userInfo.email.trim().toLowerCase();
      zohoAccountId = userInfo.accountId || null;
    } catch {
      if (loginEmail && loginEmail.includes('@')) {
        email = loginEmail.trim().toLowerCase();
      } else {
        return NextResponse.redirect(`${settingsUrl}?error=could_not_determine_email`);
      }
    }

    const expiry = new Date(Date.now() + tokenResult.expiresIn * 1000);

    // If boardId is provided, unlink any other config that is currently occupying this boardId (since boardId is @unique)
    if (boardId) {
      const targetBoard = await prisma.board.findFirst({ where: { id: boardId, tenantId } });
      if (targetBoard) {
        await prisma.emailConfig.updateMany({
          where: { tenantId, boardId },
          data: { boardId: null },
        });
      }
    }

    // Find existing config by email or matching name in this tenant
    const configName = `Zoho (${email})`;
    const existing = await prisma.emailConfig.findFirst({
      where: {
        tenantId,
        OR: [
          { imapUser: { equals: email, mode: 'insensitive' } },
          { name: configName },
        ],
      },
    });

    const updateData: any = {
      name: configName,
      authType: 'oauth2',
      imapHost: 'imap.zoho.com',
      imapPort: 993,
      imapUser: email,
      smtpHost: 'smtp.zoho.com',
      smtpPort: 465,
      smtpUser: email,
      accessToken: encrypt(tokenResult.accessToken),
      tokenExpiry: expiry,
      zohoAccountId,
      isActive: true,
      boardId: boardId || null,
    };

    if (tokenResult.refreshToken) {
      updateData.refreshToken = encrypt(tokenResult.refreshToken);
    }

    if (existing) {
      await prisma.emailConfig.update({
        where: { id: existing.id },
        data: updateData,
      });
    } else {
      await prisma.emailConfig.create({
        data: {
          tenantId,
          ...updateData,
        },
      });
    }

    // Revalidate settings path
    try {
      revalidatePath('/dashboard/settings');
    } catch {}

    return NextResponse.redirect(`${settingsUrl}?status=zoho_connected&email=${encodeURIComponent(email)}`);
  } catch (err: any) {
    console.error('[Zoho OAuth Callback] Error:', err?.message || err);
    return NextResponse.redirect(`${settingsUrl}?error=${encodeURIComponent(err.message || 'oauth_exchange_failed')}`);
  }
}
