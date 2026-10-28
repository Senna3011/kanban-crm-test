import { NextRequest, NextResponse } from 'next/server';
import prisma from '@/lib/prisma';
import { exchangeZohoCode, fetchZohoUserInfo, normalizeRedirectUri, verifyOAuthState } from '@/lib/zoho-oauth';
import { encrypt } from '@/lib/encryption';
import { revalidatePath } from 'next/cache';

export const dynamic = 'force-dynamic';

export async function GET(req: NextRequest) {
  const searchParams = req.nextUrl.searchParams;
  const code = searchParams.get('code');
  const state = searchParams.get('state');
  const error = searchParams.get('error');

  const proto = req.headers.get('x-forwarded-proto') || req.nextUrl.protocol.replace(':', '') || 'https';
  const host = req.headers.get('x-forwarded-host') || req.headers.get('host') || req.nextUrl.host;
  let dynamicBaseUrl = `${proto}://${host}`;
  let settingsUrl = `${dynamicBaseUrl.replace(/\/$/, '')}/dashboard/settings`;

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

  const { tenantId, boardId, loginEmail, redirectUri } = stateData;

  // Use the origin from the user's active redirect URI (matches their current Cloudflare tunnel)
  if (redirectUri) {
    try {
      dynamicBaseUrl = new URL(redirectUri).origin;
      settingsUrl = `${dynamicBaseUrl.replace(/\/$/, '')}/dashboard/settings`;
    } catch {}
  }

  try {
    const tokenResult = await exchangeZohoCode(code, normalizeRedirectUri(redirectUri || ''));

    let userInfo: { primaryEmail: string; accountId?: string; accounts: Array<{ email: string; displayName?: string; accountId?: string; isPrimary?: boolean }> };
    try {
      userInfo = await fetchZohoUserInfo(tokenResult.accessToken);
    } catch (userErr: any) {
      console.error('[Zoho OAuth Callback] fetchZohoUserInfo failed:', userErr?.message || userErr);
      if (loginEmail && loginEmail.includes('@')) {
        const cleanLogin = loginEmail.trim().toLowerCase();
        userInfo = {
          primaryEmail: cleanLogin,
          accounts: [{ email: cleanLogin, displayName: 'Zoho Mail', isPrimary: true }],
        };
      } else {
        return NextResponse.redirect(`${settingsUrl}?error=${encodeURIComponent(userErr?.message || 'could_not_determine_email')}`);
      }
    }

    const expiry = new Date(Date.now() + tokenResult.expiresIn * 1000);
    const encryptedAccessToken = encrypt(tokenResult.accessToken);
    const encryptedRefreshToken = tokenResult.refreshToken ? encrypt(tokenResult.refreshToken) : null;

    // Register all accounts / aliases returned by Zoho API (Primary + SendMailAs Aliases like Diamond, Elite, Gold, Premiere, Nell VH)
    for (const acc of userInfo.accounts) {
      const email = acc.email;
      const displayName = acc.displayName || (acc.isPrimary ? 'Zoho Mail' : 'Team Alias');
      const configName = acc.isPrimary ? `Zoho (${email})` : `${displayName} (${email})`;

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
        accessToken: encryptedAccessToken,
        tokenExpiry: expiry,
        zohoAccountId: acc.accountId || userInfo.accountId || null,
        isActive: true,
        // Assign both primary account and all its SendMailAs aliases to the requested boardId
        boardId: boardId ? boardId : undefined,
      };

      if (encryptedRefreshToken) {
        updateData.refreshToken = encryptedRefreshToken;
      }

      if (existing) {
        await prisma.emailConfig.update({
          where: { id: existing.id },
          data: {
            ...updateData,
            // Update boardId if explicitly selected during connect, otherwise preserve existing
            boardId: boardId ? boardId : existing.boardId,
          },
        });
      } else {
        await prisma.emailConfig.create({
          data: {
            tenantId,
            ...updateData,
            boardId: boardId || null,
          },
        });
      }
    }

    try {
      revalidatePath('/dashboard/settings');
    } catch {}

    return NextResponse.redirect(`${settingsUrl}?status=zoho_connected&email=${encodeURIComponent(userInfo.primaryEmail)}&aliases=${userInfo.accounts.length}`);
  } catch (err: any) {
    console.error('[Zoho OAuth Callback] Error:', err?.message || err);
    return NextResponse.redirect(`${settingsUrl}?error=${encodeURIComponent(err.message || 'oauth_exchange_failed')}`);
  }
}
