# Plan: Perbaikan Error Zoho HTTP 500

## Akar Masalah
`fetchZohoUserInfo` memanggil `https://mail.zoho.com/api/accounts` → HTTP 500. Zoho Mail API mengembalikan error ketika:
- Akun tidak memiliki Zoho Mail aktif
- Mail API scope belum ter-activate untuk aplikasi tersebut
- Aplikasi Zoho dibuat di data center regional yang berbeda

## Solusi: Ganti endpoint ke Zoho User Info API (lebih stabil)

Zoho menyediakan `/oauth/v2/user/info` yang mengembalikan email dan account ID tanpa bergantung Zoho Mail API.

### Perubahan pada `src/lib/zoho-oauth.ts`

Fungsi `fetchZohoUserInfo` diganti:
```typescript
export async function fetchZohoUserInfo(accessToken: string): Promise<{ email: string; accountId?: string }> {
  const { accountsUrl } = getZohoOAuthConfig();
  const res = await fetch(`${accountsUrl.replace(/\/$/, '')}/oauth/v2/user/info`, {
    headers: {
      Authorization: `Zoho-oauthtoken ${accessToken}`,
    },
  });

  if (!res.ok) {
    throw new Error(`Failed to fetch Zoho user info: HTTP ${res.status}`);
  }

  const json = await res.json();
  const email = json.email;
  const accountId = json.zaid ? String(json.zaid) : undefined;

  if (!email) {
    throw new Error('Could not find email in Zoho user info response.');
  }

  return { email, accountId };
}
```

- Endpoint berubah: `mail.zoho.com/api/accounts` → `accounts.zoho.com/oauth/v2/user/info`
- Scope `ZohoMail.accounts.READ` bisa dihapus dari OAuth URL (tidak dibutuhkan lagi)
- Scope yang dibutuhkan: hanya `ZohoMail.messages.ALL` + `email`

### Scope cleanup pada `buildZohoAuthUrl`
```typescript
scope: 'ZohoMail.messages.ALL,email',
```

### Verifikasi
1. `npm run build` — pastikan tidak error
2. Jalankan CRM, login admin
3. Klik "Login with Zoho" → seharusnya berhasil redirect ke settings tanpa HTTP 500