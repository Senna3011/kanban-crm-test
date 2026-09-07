# Rencana Implementasi: Zoho OAuth 2.0 Integration

Sesuai instruksi mentor, aplikasi akan menyediakan tombol/halaman integrasi di mana pengguna (mentor) cukup mengklik satu tombol untuk masuk ke akun Zoho dan menghubungkan Zoho Mail ke aplikasi secara otomatis (tanpa perlu mengisi host, port, dan password manual).

---

## 1. Komponen yang Diperlukan dari Zoho API Console
Untuk menjalankan OAuth, dibutuhkan kredensial Client OAuth dari Zoho (dibuat di `https://api-console.zoho.com`):
- `ZOHO_CLIENT_ID`
- `ZOHO_CLIENT_SECRET`
- `ZOHO_REDIRECT_URI` (misal: `https://<domain-kamu>/api/auth/zoho/callback`)
- Scope: `ZohoMail.messages.ALL`, `ZohoMail.accounts.READ`, `offline_access`

---

## 2. Perubahan Database (`prisma/schema.prisma`)
Tambahkan field OAuth pada model `EmailConfig` agar dapat menyimpan token aman:
- `authType` (`String @default("password")`) -> `password` atau `oauth2`
- `accessToken` (`String?`) -> Dienkripsi dengan AES
- `refreshToken` (`String?`) -> Dienkripsi dengan AES
- `tokenExpiry` (`DateTime?`)
- `zohoAccountId` (`String?`)
- Ubah `imapPass` & `smtpPass` menjadi opsional (`String?`) bila menggunakan OAuth2.

Jalankan migrasi Prisma via container/CLI.

---

## 3. Modul Token & Auth Zoho (`src/lib/zoho-oauth.ts`)
- Fungsi `getZohoAuthUrl(tenantId, boardId)`: Menghasilkan URL login resmi Zoho OAuth dengan state CSRF.
- Fungsi `exchangeZohoCode(code)`: Menukar `code` dengan `access_token` & `refresh_token`.
- Fungsi `refreshZohoToken(configId)`: Memperbarui access token otomatis jika sudah expired sebelum poller atau sender berjalan.

---

## 4. API Routes OAuth Zoho
- `GET /api/auth/zoho`: Endpoint inisiasi login. Mengarahkan user langsung ke halaman login Zoho.
- `GET /api/auth/zoho/callback`: Endpoint callback setelah login Zoho berhasil.
  - Memvalidasi code & state.
  - Mengambil detail akun email pengguna dari Zoho API (`/api/accounts`).
  - Menyimpan record `EmailConfig` (aktif, berstatus `oauth2`, tertaut ke board yang dipilih).
  - Mengarahkan kembali ke `/dashboard/settings?status=zoho_connected`.

---

## 5. Integrasi Poller & Sender (`channels/email.ts` & `worker/imap-poller.ts`)
- Saat `authType === 'oauth2'`:
  - Periksa `tokenExpiry`; jika expired, panggil `refreshZohoToken`.
  - Pada `imapflow`: Kirim autentikasi XOAUTH2 (`auth: { user, accessToken }`).
  - Pada `nodemailer`: Kirim autentikasi OAuth2 (`auth: { type: 'OAuth2', user, clientId, clientSecret, refreshToken, accessToken }`).
- Mode password manual tetap dipertahankan untuk backward-compatibility.

---

## 6. Antarmuka Pengguna (UI)
- Pada `src/components/setup/EmailConfigForm.tsx` & `/dashboard/settings`:
  - Tambahkan banner / tombol utama: **"Connect with Zoho Mail (One-Click Login)"**.
  - Opsi form manual tetap ada di bawahnya (tab/collapsible) sebagai alternatif jika dibutuhkan.
  - Status koneksi menampilkan badge **"Connected via Zoho OAuth"**.

---

## 7. Verifikasi & Dokumentasi
- Uji alur redirect dari tombol hingga tersimpan di database.
- Dokumentasikan variabel environment baru dan langkah pembuatan Zoho App Console ke `coldstart.md`.
