import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/server/auth';
import { buildZohoAuthUrl, getZohoOAuthConfig, signOAuthState } from '@/lib/zoho-oauth';

export const dynamic = 'force-dynamic';

export async function GET(req: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session?.user) {
    return NextResponse.redirect(new URL('/login', req.url));
  }

  const role = (session.user as any).role;
  if (role !== 'admin') {
    return NextResponse.json({ error: 'Forbidden: Admin access required.' }, { status: 403 });
  }

  const { clientId, clientSecret } = getZohoOAuthConfig();
  if (!clientId || !clientSecret) {
    return NextResponse.json(
      { error: 'Zoho OAuth credentials not configured in environment (ZOHO_CLIENT_ID, ZOHO_CLIENT_SECRET).' },
      { status: 400 }
    );
  }

  const searchParams = req.nextUrl.searchParams;
  const boardId = searchParams.get('boardId') || '';
  const loginEmail = searchParams.get('loginEmail') || '';
  const tenantId = (session.user as any).tenantId;

  // Determine current origin for dynamic callback URL
  const proto = req.headers.get('x-forwarded-proto') || req.nextUrl.protocol.replace(':', '') || 'https';
  const host = req.headers.get('x-forwarded-host') || req.headers.get('host') || req.nextUrl.host;
  const currentOrigin = `${proto}://${host}`;
  const dynamicCallbackUrl = `${currentOrigin.replace(/\/$/, '')}/api/auth/zoho/callback`;

  // Prefer configured ZOHO_REDIRECT_URI if set, otherwise use current origin callback
  const redirectUri = process.env.ZOHO_REDIRECT_URI || dynamicCallbackUrl;

  const state = signOAuthState({
    tenantId,
    boardId,
    loginEmail,
    redirectUri,
    timestamp: Date.now(),
  });

  const authUrl = buildZohoAuthUrl(state, redirectUri);
  return NextResponse.redirect(authUrl);
}
