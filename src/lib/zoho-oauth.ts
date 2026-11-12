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
    scope: 'ZohoMail.messages.ALL,ZohoMail.accounts.READ,ZohoMail.folders.READ,ZohoMail.organization.groups.READ,ZohoMail.organization.accounts.READ,email',
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
  isSharedMailbox?: boolean;
}

export async function fetchZohoSharedMailboxes(
  accessToken: string,
  accountList?: any[]
): Promise<ZohoMailAccountInfo[]> {
  const { mailApiUrl } = getZohoOAuthConfig();
  const baseUrl = mailApiUrl.replace(/\/$/, '');
  const sharedMailboxes: ZohoMailAccountInfo[] = [];

  try {
    let dataList = accountList;
    if (!dataList) {
      const mailRes = await fetch(`${baseUrl}/api/accounts`, {
        headers: { Authorization: `Zoho-oauthtoken ${accessToken}` },
      });
      if (!mailRes.ok) return [];
      const json = await mailRes.json();
      dataList = json.data || [];
    }

    const zoids = new Set<string>();
    for (const acc of dataList || []) {
      const zoid = acc?.policyId?.zoid || acc?.zoid;
      if (zoid) zoids.add(String(zoid));
    }

    for (const zoid of zoids) {
      try {
        const grpRes = await fetch(`${baseUrl}/api/organization/${zoid}/groups`, {
          headers: { Authorization: `Zoho-oauthtoken ${accessToken}` },
        });
        if (!grpRes.ok) continue;
        const grpJson = await grpRes.json();
        const groups = grpJson?.data?.groups || (Array.isArray(grpJson?.data) ? grpJson.data : []);
        for (const g of groups) {
          const mailboxId = g?.groupAdminSettings?.mailboxId || g?.mailboxId;
          const rawEmail = g?.emailId || g?.groupEmailId;
          if (!mailboxId || typeof rawEmail !== 'string' || !rawEmail.includes('@')) continue;

          const cleanEmail = rawEmail.trim().toLowerCase();
          if (!sharedMailboxes.some((s) => s.email === cleanEmail)) {
            sharedMailboxes.push({
              email: cleanEmail,
              displayName: g?.groupName || g?.displayName || cleanEmail.split('@')[0],
              accountId: String(mailboxId),
              isPrimary: false,
              isSharedMailbox: true,
            });
          }
        }
      } catch (grpErr) {
        console.warn('[Zoho OAuth] Failed to query organization groups for zoid', zoid, grpErr);
      }
    }
  } catch (err) {
    console.warn('[Zoho OAuth] fetchZohoSharedMailboxes error:', err);
  }

  return sharedMailboxes;
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

      // Discover Zoho Organization Shared Mailboxes (Groups with mailboxId) and assign their dedicated mailboxId
      const sharedList = await fetchZohoSharedMailboxes(accessToken, dataList);
      for (const shared of sharedList) {
        const existingIdx = accounts.findIndex((a) => a.email === shared.email);
        if (existingIdx >= 0) {
          accounts[existingIdx] = {
            ...accounts[existingIdx],
            accountId: shared.accountId || accounts[existingIdx].accountId,
            displayName: accounts[existingIdx].displayName || shared.displayName,
            isSharedMailbox: true,
          };
        } else {
          accounts.push(shared);
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
  if (!config.refreshToken) {
    // If this is an alias without its own refresh token, inherit from the primary OAuth2 config of the same tenant
    const primaryOAuth = await prisma.emailConfig.findFirst({
      where: {
        tenantId: config.tenantId,
        authType: 'oauth2',
        refreshToken: { not: null },
      },
    });
    if (primaryOAuth && primaryOAuth.id !== configId) {
      return getValidZohoAccessToken(primaryOAuth.id);
    }
    throw new Error('Akun Zoho tidak memiliki refresh token. Silakan sambungkan ulang akun Zoho Anda di Settings.');
  }

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

export interface ZohoFolder {
  folderId: string;
  folderName: string;
  folderType?: string;
  path?: string;
}

export interface ZohoMessageSummary {
  messageId: string;
  folderId: string;
  subject?: string;
  fromAddress?: string;
  sender?: string;
  toAddress?: string;
  ccAddress?: string;
  receivedTime?: string | number;
  sentDateInGMT?: string | number;
  status?: string | number; // '0' = unread, '1' = read
  status2?: string | number;
  summary?: string;
}

export async function zohoListFolders(
  accessToken: string,
  accountId: string
): Promise<{ folders: ZohoFolder[]; unauthorized: boolean }> {
  const { mailApiUrl } = getZohoOAuthConfig();
  const baseUrl = mailApiUrl.replace(/\/$/, '');
  const res = await fetch(`${baseUrl}/api/accounts/${accountId}/folders`, {
    headers: { Authorization: `Zoho-oauthtoken ${accessToken}` },
  });
  if (res.status === 401 || res.status === 403) {
    return { folders: [], unauthorized: true };
  }
  if (!res.ok) return { folders: [], unauthorized: false };
  const json = await res.json();
  const list = Array.isArray(json?.data) ? json.data : [];
  return {
    unauthorized: false,
    folders: list.map((f: any) => ({
      folderId: String(f.folderId),
      folderName: String(f.folderName || f.path || ''),
      folderType: f.folderType ? String(f.folderType) : undefined,
      path: f.path ? String(f.path) : undefined,
    })),
  };
}

export async function zohoResolveFolderId(
  accessToken: string,
  accountId: string,
  folderName: string
): Promise<{ folderId?: string; unauthorized: boolean }> {
  const { folders, unauthorized } = await zohoListFolders(accessToken, accountId);
  const norm = folderName.toLowerCase().trim();
  if (!unauthorized) {
    const match = folders.find((f) => {
      const fn = f.folderName.toLowerCase().trim();
      const fp = (f.path || '').replace(/^\/+/, '').toLowerCase().trim();
      const ft = (f.folderType || '').toLowerCase().trim();
      return fn === norm || fp === norm || (norm === 'inbox' && ft === 'inbox');
    });
    return { folderId: match?.folderId, unauthorized: false };
  }

  // Fallback for legacy OAuth tokens without ZohoMail.folders.READ:
  // Use searchKey=in:<folder> (limit=1) to resolve exact folderId cleanly
  try {
    const { mailApiUrl } = getZohoOAuthConfig();
    const baseUrl = mailApiUrl.replace(/\/$/, '');
    const searchKey = norm === 'inbox' ? 'in:inbox' : `in:${folderName}`;
    const res = await fetch(
      `${baseUrl}/api/accounts/${accountId}/messages/search?searchKey=${encodeURIComponent(searchKey)}&limit=1`,
      { headers: { Authorization: `Zoho-oauthtoken ${accessToken}` } }
    );
    if (res.ok) {
      const json = await res.json();
      const first = Array.isArray(json?.data) ? json.data[0] : null;
      if (first?.folderId) {
        return { folderId: String(first.folderId), unauthorized: true };
      }
    }
  } catch {}
  return { folderId: undefined, unauthorized: true };
}

export async function zohoFetchMessages(
  accessToken: string,
  accountId: string,
  opts: { folderId?: string; start?: number; limit?: number; includesent?: boolean } = {}
): Promise<ZohoMessageSummary[]> {
  const { mailApiUrl } = getZohoOAuthConfig();
  const baseUrl = mailApiUrl.replace(/\/$/, '');
  const params = new URLSearchParams({
    limit: String(opts.limit ?? 200),
    start: String(opts.start ?? 1),
    includeto: 'true',
  });
  if (opts.folderId) params.set('folderId', opts.folderId);
  if (opts.includesent) params.set('includesent', 'true');

  const res = await fetch(`${baseUrl}/api/accounts/${accountId}/messages/view?${params.toString()}`, {
    headers: { Authorization: `Zoho-oauthtoken ${accessToken}` },
  });
  if (!res.ok) {
    const errText = await res.text().catch(() => '');
    throw new Error(`Zoho messages/view ${res.status}: ${errText.slice(0, 200)}`);
  }
  const json = await res.json();
  return Array.isArray(json?.data) ? json.data : [];
}

export async function zohoFetchOriginalMessage(
  accessToken: string,
  accountId: string,
  messageId: string
): Promise<string | null> {
  const { mailApiUrl } = getZohoOAuthConfig();
  const baseUrl = mailApiUrl.replace(/\/$/, '');
  const res = await fetch(`${baseUrl}/api/accounts/${accountId}/messages/${messageId}/originalmessage`, {
    headers: { Authorization: `Zoho-oauthtoken ${accessToken}` },
  });
  if (!res.ok) return null;
  const json = await res.json();
  return typeof json?.data?.content === 'string' ? json.data.content : null;
}

export async function zohoFetchMessageContentAndDetails(
  accessToken: string,
  accountId: string,
  folderId: string,
  messageId: string
): Promise<{ html?: string; details?: any }> {
  const { mailApiUrl } = getZohoOAuthConfig();
  const baseUrl = mailApiUrl.replace(/\/$/, '');
  const [contentRes, detailsRes] = await Promise.all([
    fetch(`${baseUrl}/api/accounts/${accountId}/folders/${folderId}/messages/${messageId}/content?includeBlockContent=true`, {
      headers: { Authorization: `Zoho-oauthtoken ${accessToken}` },
    }).catch(() => null),
    fetch(`${baseUrl}/api/accounts/${accountId}/folders/${folderId}/messages/${messageId}/details`, {
      headers: { Authorization: `Zoho-oauthtoken ${accessToken}` },
    }).catch(() => null),
  ]);
  const contentJson = contentRes?.ok ? await contentRes.json().catch(() => null) : null;
  const detailsJson = detailsRes?.ok ? await detailsRes.json().catch(() => null) : null;
  return {
    html: typeof contentJson?.data?.content === 'string' ? contentJson.data.content : undefined,
    details: detailsJson?.data || undefined,
  };
}

export async function zohoUpdateMessages(
  accessToken: string,
  accountId: string,
  mode: 'markAsRead' | 'markAsUnread' | 'archiveMails' | 'moveToTrash',
  messageIds: string[]
): Promise<boolean> {
  if (!accountId || messageIds.length === 0) return false;
  const { mailApiUrl } = getZohoOAuthConfig();
  const baseUrl = mailApiUrl.replace(/\/$/, '');
  const res = await fetch(`${baseUrl}/api/accounts/${accountId}/updatemessage`, {
    method: 'PUT',
    headers: {
      Authorization: `Zoho-oauthtoken ${accessToken}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ mode, messageId: messageIds }),
  });
  return res.ok;
}

