import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/server/auth';
import { buildZohoAuthUrl, getZohoOAuthConfig } from '@/lib/zoho-oauth';

export async function GET(req: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session?.user) {
    return NextResponse.redirect(new URL('/login', req.url));
  }

  const { clientId, clientSecret, redirectUri } = getZohoOAuthConfig();
  if (!clientId || !clientSecret || !redirectUri) {
    return NextResponse.json(
      { error: 'Zoho OAuth credentials not configured in environment (ZOHO_CLIENT_ID, ZOHO_CLIENT_SECRET, ZOHO_REDIRECT_URI).' },
      { status: 400 }
    );
  }

  const searchParams = req.nextUrl.searchParams;
  const boardId = searchParams.get('boardId') || '';
  const loginEmail = searchParams.get('loginEmail') || '';
  const tenantId = (session.user as any).tenantId;

  const statePayload = JSON.stringify({
    tenantId,
    boardId,
    loginEmail,
    timestamp: Date.now(),
  });
  const state = Buffer.from(statePayload).toString('base64url');

  const authUrl = buildZohoAuthUrl(state);
  return NextResponse.redirect(authUrl);
}
