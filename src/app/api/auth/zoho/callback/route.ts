import { NextRequest, NextResponse } from 'next/server';
import prisma from '@/lib/prisma';
import { exchangeZohoCode, fetchZohoUserInfo, verifyOAuthState } from '@/lib/zoho-oauth';
import { encrypt } from '@/lib/encryption';

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
      email = userInfo.email;
      zohoAccountId = userInfo.accountId || null;
    } catch {
      if (loginEmail && loginEmail.includes('@')) {
        email = loginEmail;
      } else {
        return NextResponse.redirect(`${settingsUrl}?error=could_not_determine_email`);
      }
    }

    const expiry = new Date(Date.now() + tokenResult.expiresIn * 1000);

    // Upsert EmailConfig for this tenant
    const existing = await prisma.emailConfig.findFirst({
      where: { tenantId, imapUser: email },
    });

    const updateData: any = {
      name: `Zoho (${email})`,
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
      boardId: boardId || undefined,
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

    return NextResponse.redirect(`${settingsUrl}?status=zoho_connected&email=${encodeURIComponent(email)}`);
  } catch (err: any) {
    console.error('[Zoho OAuth Callback] Error:', err?.message || err);
    return NextResponse.redirect(`${settingsUrl}?error=${encodeURIComponent(err.message || 'oauth_exchange_failed')}`);
  }
}
