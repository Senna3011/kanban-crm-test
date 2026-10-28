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

export function normalizeRedirectUri(rawUri: string): string {
  if (!rawUri) return '';
  let cleaned = rawUri.trim().replace(/([^:])\/{2,}/g, '$1/');
  if (!cleaned.includes('/api/auth/zoho/callback')) {
    cleaned = `${cleaned.replace(/\/$/, '')}/api/auth/zoho/callback`;
  }
  return cleaned.replace(/([^:])\/{2,}/g, '$1/');
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
  const redirectUri = normalizeRedirectUri(process.env.ZOHO_REDIRECT_URI || '');
  const accountsUrl = process.env.ZOHO_ACCOUNTS_URL || 'https://accounts.zoho.com';
  const mailApiUrl = process.env.ZOHO_MAIL_API_URL || 'https://mail.zoho.com';

  return { clientId, clientSecret, redirectUri, accountsUrl, mailApiUrl };
}

export function buildZohoAuthUrl(state: string, customRedirectUri?: string): string {
  const { clientId, redirectUri, accountsUrl } = getZohoOAuthConfig();
  const effectiveRedirectUri = normalizeRedirectUri(customRedirectUri || redirectUri);
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
  const effectiveRedirectUri = normalizeRedirectUri(customRedirectUri || redirectUri);
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

export interface ZohoMailAccountInfo {
  email: string;
  displayName?: string;
  accountId?: string;
  isPrimary?: boolean;
}

export async function fetchZohoUserInfo(accessToken: string): Promise<{
  primaryEmail: string;
  accountId?: string;
  accounts: ZohoMailAccountInfo[];
}> {
  const { mailApiUrl, accountsUrl } = getZohoOAuthConfig();
  const accounts: ZohoMailAccountInfo[] = [];

  // 1. Fetch Zoho Mail Accounts & SendMailAs (Aliases)
  try {
    const mailRes = await fetch(`${mailApiUrl.replace(/\/$/, '')}/api/accounts`, {
      headers: { Authorization: `Zoho-oauthtoken ${accessToken}` },
    });
    if (mailRes.ok) {
      const json = await mailRes.json();
      const dataList = json.data || [];
      for (const acc of dataList) {
        const primary = acc.primaryEmailAddress || acc.incomingAddress;
        const accountId = acc.accountId ? String(acc.accountId) : undefined;
        if (primary) {
          accounts.push({
            email: primary.trim().toLowerCase(),
            displayName: acc.displayName || acc.accountName || 'Zoho Mail',
            accountId,
            isPrimary: true,
          });
        }

        // Also extract sendMailAs / alias addresses if present in Zoho response
        const sendAsList = [
          ...(Array.isArray(acc.sendMailDetails) ? acc.sendMailDetails : []),
          ...(Array.isArray(acc.emailAddress) ? acc.emailAddress : []),
          ...(Array.isArray(acc.fromAddressList) ? acc.fromAddressList : []),
          ...(Array.isArray(acc.aliases) ? acc.aliases : []),
        ];
        for (const alias of sendAsList) {
          const rawEmail =
            typeof alias === 'string'
              ? alias
              : alias?.fromAddress || alias?.emailAddress || alias?.mailId || alias?.email;
          const aliasName =
            typeof alias === 'string'
              ? 'Team Alias'
              : alias?.displayName || alias?.fromName || acc.displayName;

          if (typeof rawEmail === 'string' && rawEmail.includes('@')) {
            const cleanAlias = rawEmail.trim().toLowerCase();
            if (!accounts.some((a) => a.email === cleanAlias)) {
              accounts.push({
                email: cleanAlias,
                displayName: aliasName || 'Team Alias',
                accountId,
                isPrimary: false,
              });
            }
          }
        }

        // Explicitly query Zoho /api/accounts/{accountId}/sendmaildetails for configured Send-Mail-As addresses
        if (accountId) {
          try {
            const smRes = await fetch(`${mailApiUrl.replace(/\/$/, '')}/api/accounts/${accountId}/sendmaildetails`, {
              headers: { Authorization: `Zoho-oauthtoken ${accessToken}` },
            });
            if (smRes.ok) {
              const smJson = await smRes.json();
              const smList = smJson.data || [];
              for (const item of smList) {
                const itemEmail = item.fromAddress || item.emailAddress || item.email;
                const itemName = item.displayName || item.fromName;
                if (typeof itemEmail === 'string' && itemEmail.includes('@')) {
                  const cleanEmail = itemEmail.trim().toLowerCase();
                  if (!accounts.some(a => a.email === cleanEmail)) {
                    accounts.push({
                      email: cleanEmail,
                      displayName: itemName || 'Team Alias',
                      accountId,
                      isPrimary: false,
                    });
                  }
                }
              }
            }
          } catch (smErr) {
            console.error('[Zoho OAuth] Failed to query /sendmaildetails for account', accountId, smErr);
          }
        }
      }
    }
  } catch (err) {
    console.error('[Zoho OAuth] Failed to fetch /api/accounts:', err);
  }

  // 2. Fallback or Additional User Info Endpoint
  try {
    const userRes = await fetch(`${accountsUrl.replace(/\/$/, '')}/oauth/user/info`, {
      headers: { Authorization: `Zoho-oauthtoken ${accessToken}` },
    });
    if (userRes.ok) {
      const json = await userRes.json();
      const email = json.Email || json.email || json.user_email;
      if (email && String(email).includes('@')) {
        const clean = String(email).trim().toLowerCase();
        if (!accounts.some(a => a.email === clean)) {
          accounts.push({
            email: clean,
            displayName: json.Display_Name || json.fullName || 'Zoho User',
            isPrimary: accounts.length === 0,
          });
        }
      }
    }
  } catch {}

  if (accounts.length === 0) {
    throw new Error('NO_MAILBOX_API');
  }

  const primary = accounts.find(a => a.isPrimary) || accounts[0];
  return {
    primaryEmail: primary.email,
    accountId: primary.accountId,
    accounts,
  };
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
      if (data.error) throw new Error(data.error_description || data.error);

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
