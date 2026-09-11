import crypto from 'crypto';
import prisma from './prisma';
import { encrypt, decrypt } from './encryption';

export interface ZohoOAuthState {
  tenantId: string;
  boardId?: string;
  loginEmail?: string;
  redirectUri?: string;
  timestamp: number;
}

function getOAuthSecret(): string {
  return process.env.ENCRYPTION_KEY || process.env.NEXTAUTH_SECRET || 'kanban-crm-oauth-secret-signing-key';
}

export function signOAuthState(payload: ZohoOAuthState): string {
  const data = Buffer.from(JSON.stringify(payload)).toString('base64url');
  const signature = crypto.createHmac('sha256', getOAuthSecret()).update(data).digest('base64url');
  return `${data}.${signature}`;
}

export function verifyOAuthState(state: string): ZohoOAuthState | null {
  try {
    const [data, signature] = state.split('.');
    if (!data || !signature) return null;

    const expectedSig = crypto.createHmac('sha256', getOAuthSecret()).update(data).digest('base64url');
    if (signature.length !== expectedSig.length) return null;
    if (!crypto.timingSafeEqual(Buffer.from(signature), Buffer.from(expectedSig))) {
      return null;
    }

    const payload: ZohoOAuthState = JSON.parse(Buffer.from(data, 'base64url').toString('utf8'));
    // State expires in 15 minutes to prevent replay attacks
    if (!payload.timestamp || Date.now() - payload.timestamp > 15 * 60 * 1000) {
      return null;
    }
    return payload;
  } catch {
    return null;
  }
}

export function getZohoOAuthConfig() {
  const clientId = process.env.ZOHO_CLIENT_ID || '';
  const clientSecret = process.env.ZOHO_CLIENT_SECRET || '';
  const redirectUri = process.env.ZOHO_REDIRECT_URI || '';
  const accountsUrl = process.env.ZOHO_ACCOUNTS_URL || 'https://accounts.zoho.com';
  const mailApiUrl = process.env.ZOHO_MAIL_API_URL || 'https://mail.zoho.com';

  return { clientId, clientSecret, redirectUri, accountsUrl, mailApiUrl };
}

export function buildZohoAuthUrl(state: string, customRedirectUri?: string): string {
  const { clientId, redirectUri, accountsUrl } = getZohoOAuthConfig();
  const effectiveRedirectUri = customRedirectUri || redirectUri;
  const params = new URLSearchParams({
    scope: 'ZohoMail.messages.ALL,ZohoMail.accounts.READ,email',
    client_id: clientId,
    response_type: 'code',
    access_type: 'offline',
    prompt: 'consent',
    redirect_uri: effectiveRedirectUri,
    state,
  });
  return `${accountsUrl.replace(/\/$/, '')}/oauth/v2/auth?${params.toString()}`;
}

export async function exchangeZohoCode(code: string, customRedirectUri?: string): Promise<{
  accessToken: string;
  refreshToken?: string;
  expiresIn: number;
}> {
  const { clientId, clientSecret, redirectUri, accountsUrl } = getZohoOAuthConfig();
  const effectiveRedirectUri = customRedirectUri || redirectUri;
  const url = `${accountsUrl.replace(/\/$/, '')}/oauth/v2/token`;

  const params = new URLSearchParams({
    grant_type: 'authorization_code',
    client_id: clientId,
    client_secret: clientSecret,
    redirect_uri: effectiveRedirectUri,
    code,
  });

  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: params.toString(),
  });

  const data = await res.json();
  if (data.error) {
    throw new Error(data.error_description || data.error);
  }

  return {
    accessToken: data.access_token,
    refreshToken: data.refresh_token,
    expiresIn: Number(data.expires_in) || 3600,
  };
}

export async function fetchZohoUserInfo(accessToken: string): Promise<{ email: string; accountId?: string }> {
  const { mailApiUrl, accountsUrl } = getZohoOAuthConfig();

  // 1. Try Zoho Mail Accounts API
  try {
    const mailRes = await fetch(`${mailApiUrl.replace(/\/$/, '')}/api/accounts`, {
      headers: { Authorization: `Zoho-oauthtoken ${accessToken}` },
    });
    if (mailRes.ok) {
      const json = await mailRes.json();
      const firstAccount = json.data?.[0];
      const email = firstAccount?.primaryEmailAddress || firstAccount?.incomingAddress;
      const accountId = firstAccount?.accountId ? String(firstAccount.accountId) : undefined;
      if (email) return { email: email.trim().toLowerCase(), accountId };
    }
  } catch {
    // Expected to fail if Zoho Mail API is not available
  }

  // 2. Try Zoho User Info endpoint
  try {
    const userRes = await fetch(`${accountsUrl.replace(/\/$/, '')}/oauth/user/info`, {
      headers: { Authorization: `Zoho-oauthtoken ${accessToken}` },
    });
    if (userRes.ok) {
      const json = await userRes.json();
      const email = json.Email || json.email || json.user_email || json.ZUID;
      if (email && String(email).includes('@')) {
        return { email: String(email).trim().toLowerCase() };
      }
    }
  } catch {
    // Fallback
  }

  throw new Error('NO_MAILBOX_API');
}

const refreshLocks = new Map<string, Promise<string>>();

export async function getValidZohoAccessToken(configId: string): Promise<string> {
  const config = await prisma.emailConfig.findUnique({ where: { id: configId } });
  if (!config) throw new Error('Email configuration not found.');
  if (config.authType !== 'oauth2') throw new Error('Email configuration does not use OAuth2.');
  if (!config.refreshToken) throw new Error('No refresh token stored.');

  const now = new Date();
  const bufferMs = 5 * 60 * 1000;
  if (config.accessToken && config.tokenExpiry && config.tokenExpiry.getTime() - bufferMs > now.getTime()) {
    return decrypt(config.accessToken);
  }

  // Mutex lock / in-flight deduplication per configId
  if (refreshLocks.has(configId)) {
    return refreshLocks.get(configId)!;
  }

  const refreshPromise = (async () => {
    try {
      const { clientId, clientSecret, accountsUrl } = getZohoOAuthConfig();
      const rawRefreshToken = decrypt(config.refreshToken!);

      const url = `${accountsUrl.replace(/\/$/, '')}/oauth/v2/token`;
      const params = new URLSearchParams({
        grant_type: 'refresh_token',
        client_id: clientId,
        client_secret: clientSecret,
        refresh_token: rawRefreshToken,
      });

      const res = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: params.toString(),
      });

      const data = await res.json();
      if (data.error) {
        throw new Error(`Failed to refresh Zoho token: ${data.error_description || data.error}`);
      }

      const newAccessToken = data.access_token;
      const expiresIn = Number(data.expires_in) || 3600;
      const newExpiry = new Date(Date.now() + expiresIn * 1000);

      await prisma.emailConfig.update({
        where: { id: configId },
        data: {
          accessToken: encrypt(newAccessToken),
          tokenExpiry: newExpiry,
        },
      });

      return newAccessToken;
    } finally {
      refreshLocks.delete(configId);
    }
  })();

  refreshLocks.set(configId, refreshPromise);
  return refreshPromise;
}
