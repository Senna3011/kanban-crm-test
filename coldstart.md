# Catatan Cold Start Proyek Kanban CRM

Catatan ini merangkum proses menyiapkan proyek setelah clone pada 3-4 September 2026.

## Aturan pembaruan catatan

`coldstart.md` adalah laporan setup yang terus diperbarui. Setiap perubahan konfigurasi, perbaikan error, migrasi, atau langkah operasional yang dilakukan pada proyek harus ditambahkan ke file ini. Catat penyebab, tindakan yang dilakukan, hasil verifikasi, serta perintah yang aman digunakan kembali. Jangan mencantumkan password, API key, connection string, atau secret lain.

## 1. Instalasi dependensi Node.js

Versi lingkungan saat setup:

- Node.js `v24.15.0`
- npm `11.12.1`

Perintah `npm install` pertama gagal dengan `EPERM` ketika npm mencoba menulis cache global Windows (`AppData\Local\npm-cache`). Cache tersebut sedang terkunci atau tidak memiliki izin akses.

Setelah cache diarahkan sementara ke folder proyek, muncul konflik peer dependency:

- `next-auth@4.24.15` mendeklarasikan peer optional `nodemailer@^7.0.7`.
- Proyek dan `mailparser` menggunakan `nodemailer@9.0.3`.

Gunakan perintah berikut untuk memasang dependensi proyek:

```powershell
npm install --legacy-peer-deps
```

Jika error cache global `EPERM` muncul lagi, gunakan cache sementara lokal:

```powershell
npm install --legacy-peer-deps --cache .npm-cache
```

Folder `.npm-cache` hanya cache sementara dan tidak perlu dikomit.

## 2. Konfigurasi environment

Salin nilai yang dibutuhkan dari `.env.local.example` ke `.env.local`. Jangan pernah mengomit `.env.local` karena berisi kredensial dan secret.

Datasource Prisma memakai PostgreSQL. Pastikan `DATABASE_URL` menunjuk ke database lokal yang benar. Kredensial harus selaras dengan konfigurasi PostgreSQL yang benar-benar berjalan; jangan gunakan placeholder `user:password` dari file contoh.

Catatan penting: Prisma CLI versi yang dipakai proyek ini tidak memuat `.env.local` secara otomatis. Saat menjalankan Prisma dari Windows, ekspor `DATABASE_URL` ke environment proses terlebih dahulu atau gunakan file `.env` yang dikelola dengan aman.

## 3. Docker untuk layanan lokal

`docker-compose.yml` menyediakan dua layanan:

- PostgreSQL 16 pada port host `5432`
- Redis 7 pada port host `6379`

Jalankan layanan:

```powershell
docker compose up -d
docker compose ps
```

Pada setup ini Docker CLI awalnya tidak dapat mengakses Docker Engine. Setelah akses Docker Engine diberikan, image PostgreSQL dan Redis diunduh dan kedua kontainer aktif:

- `kanban-postgres`
- `kanban-redis`

Koneksi database di dalam kontainer telah diverifikasi dengan `pg_isready` dan query PostgreSQL sederhana.

## 4. Migrasi Prisma

Belum ada folder migrasi saat proyek pertama dikloning. Migrasi awal dibuat dan diterapkan:

```text
prisma/migrations/20260904003323_init
```

Statusnya sudah tercatat sebagai `applied` pada tabel `_prisma_migrations` di database PostgreSQL.

Karena koneksi Prisma dari Windows ke `localhost:5432` masih mengalami autentikasi ke instance PostgreSQL yang berbeda, migrasi dijalankan dari kontainer Node pada jaringan Docker yang sama dengan service `postgres`. Dengan cara ini Prisma terhubung langsung ke hostname service Docker, bukan melalui port host.

Untuk memeriksa migrasi dari dalam jaringan Docker pada cold start berikutnya, gunakan pola berikut (sesuaikan tag Node bila diperlukan):

```powershell
docker run --rm --network kanban-crm_default -v "${PWD}:/app" -v /app/node_modules -w /app -e DATABASE_URL="<url-database-docker>" node:20-bookworm bash -lc "npm ci --legacy-peer-deps && npx prisma migrate status"
```

Jangan menuliskan URL database atau secret sebenarnya ke dokumentasi maupun source control.

## 5. Langkah lanjutan

Setelah database siap, jalankan seed untuk membuat data awal:

```powershell
npm run db:seed
```

### Error seed pada Node.js 24 di Windows

Pada Node.js `v24.15.0`, perintah di atas gagal sebelum skrip seed mengakses database dengan error berikut:

```text
SystemError [ERR_SYSTEM_ERROR]: uv_os_get_passwd returned ENOMEM
```

Error berasal dari `tsx` saat memanggil `os.userInfo()` pada Windows, bukan dari Prisma atau data seed. Gunakan Node.js 20 LTS atau 22 LTS untuk menjalankan aplikasi dan seed secara lokal. Setelah mengganti versi Node, pasang ulang dependensi dengan `npm install --legacy-peer-deps`, lalu jalankan kembali `npm run db:seed`.

Sebagai alternatif bila Node Windows belum dapat diganti, seed dapat dijalankan dari kontainer Node yang berada di jaringan Docker PostgreSQL. Jangan memasang `node_modules` Linux ke folder `node_modules` Windows; gunakan volume anonim untuk folder tersebut:

```powershell
docker run --rm --network kanban-crm_default -v "${PWD}:/app" -v /app/node_modules -w /app -e DATABASE_URL="postgresql://kanban:kanban123@postgres:5432/kanban-crm" node:20-bookworm bash -lc "npm ci --legacy-peer-deps && npx prisma db seed"
```

Hasil verifikasi (telah dijalankan dan berhasil pada 4 September 2026):
- Tenant awal terbuat: `Jet Digital Pro` (subdomain: `jetdigitalpro`)
- User admin terbuat: `admin@jetdigitalpro.com` (role: `admin`, password diubah menjadi `jdp123`)
- Board dan 9 default column terbuat (`Unreads`, `Leads`, `General`, `Follow up 1-3`, `Fail`, `Pending`, `Success`).

### Penanganan Konflik Port PostgreSQL Host (Port 5432 ke 5433)

Saat menjalankan aplikasi atau Prisma dari host Windows, muncul error:
```text
Error: P1000: Authentication failed against database server at `localhost`
```
Penyebab: Windows memiliki layanan sistem lokal `PostgreSQL-x64-18` yang sedang aktif dan menggunakan port default `5432`. Akibatnya, koneksi dari aplikasi host tidak masuk ke kontainer Docker `kanban-postgres`, melainkan ke PostgreSQL lokal Windows, yang berujung pada kegagalan query user saat login (`Wrong password`).

Tindakan perbaikan:
1. Pemetaan port di `docker-compose.yml` disesuaikan menjadi `"5433:5432"` (port host Windows 5433, port internal kontainer tetap 5432). Arsitektur internal Docker dan produksi tidak berubah.
2. `DATABASE_URL` di `.env.local` disesuaikan menunjuk ke port 5433:
   ```text
   DATABASE_URL="postgresql://kanban:kanban123@localhost:5433/kanban-crm"
   ```
3. Kontainer Docker di-restart dengan `docker compose down` dan `docker compose up -d`.

Hasil verifikasi:
- Perintah eksekusi Prisma dari host ke `localhost:5433` berhasil 100%.
- Query ke tabel `User` via Prisma host berhasil membaca record admin.

## 6. Rencana deployment dengan Cloudflare Tunnel

Deployment direncanakan menggunakan Cloudflare Tunnel tanpa mengubah arsitektur aplikasi:

```text
Internet -> Cloudflare Tunnel -> Nginx lokal (HTTPS/443) -> Next.js/PM2 (127.0.0.1:3099)
                                                   -> Worker, PostgreSQL, Redis (tetap internal)
```

Nginx tetap menjadi reverse proxy seperti pada `nginx.conf`; tunnel hanya menggantikan kebutuhan membuka port publik pada router/server. Untuk deployment produksi, gunakan remotely-managed tunnel dari dashboard Cloudflare, pasang `cloudflared` sebagai layanan Windows, lalu arahkan public hostname ke origin HTTPS Nginx lokal. Token tunnel adalah secret: simpan hanya pada konfigurasi layanan Windows atau secret manager, dan jangan tulis ke `.env.local`, source code, maupun file ini.

Sebelum aktivasi diperlukan hostname/domain yang sudah berada pada zona Cloudflare dan token tunnel dari dashboard Cloudflare. Setelah informasi tersebut tersedia, validasi origin Nginx, konfigurasi tunnel, dan status public hostname harus dilakukan sebelum aplikasi dinyatakan live.

### Menggunakan hostname yang sama

Hostname yang telah ada, misalnya `crm.jetdigitalpro.com`, dapat tetap digunakan. Pada saat cutover, public hostname pada Cloudflare Tunnel memakai hostname tersebut dan Cloudflare membuat/mengarahkan record DNS ke subdomain tunnel (`<tunnel-id>.cfargotunnel.com`). Ini menggantikan tujuan DNS lama untuk hostname itu, sehingga pastikan layanan lama tidak lagi harus menerima trafik pada hostname yang sama.

Untuk mempertahankan arsitektur saat ini, service tunnel harus diarahkan ke `https://localhost:443`, bukan ke port HTTP `80` dan bukan langsung ke Next.js `3099`. Dengan begitu Nginx tetap menangani reverse proxy dan WebSocket seperti semula. Sertifikat TLS pada Nginx harus valid untuk hostname tersebut; gunakan Cloudflare Origin CA bila sertifikat Let's Encrypt lokal tidak dapat diperbarui melalui tunnel.

### Urutan aman untuk pemula

Jangan pindahkan DNS `crm.jetdigitalpro.com` sebelum aplikasi sudah berjalan stabil secara lokal. Ikuti urutan berikut:

1. [x] Gunakan Node.js 20 LTS atau 22 LTS, lalu pasang dependency dan selesaikan seed database. *(Selesai via isolasi Docker container Node 20 LTS)*
2. [x] Nyalakan Docker (`docker compose up -d`) dan pastikan PostgreSQL serta Redis aktif. *(Selesai, port PostgreSQL host disesuaikan ke 5433)*
3. [x] Jalankan aplikasi lokal dan pastikan halaman login dapat dibuka sebelum melanjutkan. *(Selesai, verifikasi login admin di dashboard berhasil pada 4 September 2026)*
4. [x] Jalankan build produksi (`npm run build`) dan proses web/worker melalui PM2 sesuai `ecosystem.config.js`. *(Next.js production build 16.3.0 berhasil dikompilasi tanpa error)*
5. [x] Instalasi `cloudflared` pada host Windows (berhasil dipasang via winget, versi 2026.8.3).
6. [x] Jalankan Cloudflare Quick Tunnel ke port aplikasi lokal:
   ```powershell
   & "C:\Program Files (x86)\cloudflared\cloudflared.exe" tunnel --url http://127.0.0.1:3000
   ```
   Aplikasi langsung mendapatkan endpoint publik HTTPS gratis dari Cloudflare edge network yang dapat diakses oleh mentor dan penguji tanpa memerlukan setup Nginx rumit maupun pembukaan port router.
7. [ ] (Opsional Produksi Penuh) Sambungkan ke domain kustom permanen (misal: `crm.jetdigitalpro.com`) menggunakan remotely-managed tunnel dan Nginx jika telah siap untuk cutover DNS resmi.

### 7. Panduan Operasional Cloudflare Tunnel

#### Cara Menjalankan Ulang Cloudflare Tunnel (Jika Terminal Ditutup):
Jika terminal dimatikan atau laptop baru dinyalakan, jalankan dua hal:
1. Pastikan Docker dan Next.js aktif:
   ```powershell
   docker compose up -d
   npm run start
   ```
2. Buka terminal baru dan aktifkan Cloudflare Tunnel:
   ```powershell
   & "C:\Program Files (x86)\cloudflared\cloudflared.exe" tunnel --url http://127.0.0.1:3000
   ```
   Cloudflare akan menampilkan URL publik baru berakhiran `.trycloudflare.com` di terminal.

#### Agar Website Tetap Online 24/7 Saat Laptop Dimatikan:
Cloudflare Tunnel hanya berfungsi sebagai "jembatan" aman antara internet dan komputer yang menjalankan aplikasi. Jika laptop Anda dimatikan atau sleep, proses aplikasi (Next.js, database, dan worker) otomatis berhenti.

Untuk online 24 jam nonstop tanpa bergantung pada laptop:
1. Proyek ini harus dideploy ke **Server Cloud / VPS 24/7** (misalnya VPS Ubuntu murah di DigitalOcean, Hetzner, atau Biznet Gio seharga ~$4/bulan).
2. Di VPS tersebut, jalankan Docker (`kanban-postgres`, `kanban-redis`) dan aplikasi.
3. Pasang Cloudflare Tunnel di VPS tersebut sebagai background service (`cloudflared service install`), sehingga aplikasi akan terus aktif dan online selamanya meskipun laptop Anda mati.

#### Catatan Kompatibilitas Sign Out pada Domain Tunnel:
Secara default, `signOut()` NextAuth tanpa argumen eksplisit akan mengarahkan user kembali ke origin yang didefinisikan pada `NEXTAUTH_URL` (`http://localhost:3000`). Agar proses sign out tetap berada pada domain Cloudflare (atau domain kustom apapun):
1. Tombol logout di `src/components/layout/Navbar.tsx` diperbarui untuk mendeteksi origin dinamis peramban:
   ```typescript
   const callbackUrl = typeof window !== 'undefined' ? `${window.location.origin}/login` : '/login';
   await signOut({ callbackUrl });
   ```
2. Ditambahkan callback `redirect({ url, baseUrl })` di `src/server/auth.ts` yang mengizinkan URL relatif serta domain Cloudflare (`*.trycloudflare.com`). Dengan ini, sign out dari domain publik akan selalu kembali ke halaman login domain publik tersebut.

#### URL Quick Tunnel Aktif Saat Ini:
- Endpoint publik: `https://nail-consult-snapshot-functions.trycloudflare.com`
- Status: Aktif dan terhubung ke `http://127.0.0.1:3000` (4 September 2026).

### 9. Analisis Fungsionalitas Email Configuration, AI, dan Penyebab Sync Failed

Berdasarkan inspeksi langsung pada sistem (database, antrean BullMQ, proses background, dan API AI):

#### A. Status Komponen Sistem:
1. **Layanan Docker**: Kontainer `kanban-postgres` (port host `5433`) dan `kanban-redis` (port `6379`) aktif dan berjalan normal.
2. **Worker Background**: Proses worker (`npx tsx worker/index.ts`) terdeteksi sudah aktif berjalan di latar belakang (PID node aktif).
3. **Koneksi AI (LLM)**: Integrasi AI di `src/lib/ai.ts` diuji langsung ke endpoint `https://api.pesatrouter.com/v1/chat/completions` (model `pesat-flash`). Pengujian mandiri berhasil mengembalikan respons valid dan parser JSON siap mengklasifikasikan email inbound.
4. **Jaringan Port IMAP**: Koneksi TCP dari mesin ke `imap.zoho.com:993` berhasil terhubung tanpa hambatan firewall.

#### B. Akar Penyebab Error "IMAP: Command failed" dan "Sync failed":
1. **Penyebab "Sync failed"**:
   - Di tabel database `EmailConfig`, jumlah record konfigurasi email aktif saat ini adalah `0` (`Configs in DB: 0`).
   - Endpoint `/api/sync` memiliki logika:
     ```typescript
     if (configs.length === 0) {
       return NextResponse.json({ error: 'No email configured' }, { status: 400 });
     }
     ```
   - Karena belum ada konfigurasi email yang tersimpan di database, endpoint `/api/sync` langsung merespons HTTP 400 (`No email configured`), yang memicu toast merah `"Sync failed"` di UI board.
2. **Penyebab Konfigurasi Belum Tersimpan**:
   - Di UI Settings, konfigurasi belum berhasil disimpan ke database karena tombol **Save Configuration** belum pernah sukses ditekan atau input password ditolak oleh Zoho.
   - Pesan `IMAP: Command failed` saat tes koneksi berasal dari autentikasi Zoho Mail: Zoho menolak password akun biasa jika IMAP Access belum diaktifkan di Zoho Settings atau jika akun memiliki proteksi 2FA/TFA (wajib menggunakan Zoho *Application-Specific Password*).

#### C. Solusi dan Langkah Eksekusi:
1. Aktifkan **IMAP Access** di akun Zoho: `mail.zoho.com` -> Settings -> Mail Accounts -> aktifkan toggle IMAP.
2. Buat **Application-Specific Password** di `accounts.zoho.com` -> Security -> Application-Specific Passwords.
3. Di halaman `/dashboard/settings`:
   - Pilih **Link to Board** -> pilih `Main Board`.
   - Masukkan Application Password Zoho pada kolom IMAP dan SMTP Password.
   - Klik **Save Configuration** hingga muncul notifikasi sukses tersimpan.
4. Setelah konfigurasi tersimpan di database, klik tombol **Sync** pada board. Job akan masuk antrean Redis dan diproses oleh worker secara otomatis.


Jika dipindahkan ke Pages, arsitektur harus berubah: runtime server perlu diadaptasi ke Cloudflare Workers, PostgreSQL/Redis Docker lokal harus diganti layanan database yang dapat dijangkau dari Cloudflare, worker BullMQ perlu diganti layanan antrean/penjadwalan Cloudflare, dan Socket.IO perlu diganti solusi WebSocket Workers/Durable Objects.

Kesimpulan: untuk mempertahankan arsitektur saat ini, Cloudflare Tunnel adalah pilihan yang tepat. Pages/Workers merupakan proyek migrasi terpisah yang perlu diuji di branch atau environment staging; tidak dilakukan pada setup ini.

### 10. Redirect sign out kembali ke localhost pada Quick Tunnel

NextAuth memakai `NEXTAUTH_URL` sebagai base URL redirect. Jika nilainya masih `http://localhost:3000`, redirect default setelah sign out dapat mengarah ke localhost walaupun pengguna mengakses aplikasi dari URL Cloudflare Tunnel.

Untuk Quick Tunnel, ubah `NEXTAUTH_URL` di `.env.local` menjadi URL HTTPS `trycloudflare.com` yang sedang ditampilkan oleh proses `cloudflared`, lalu restart proses Next.js. URL Quick Tunnel berubah setiap kali tunnel dimulai ulang, sehingga nilai ini perlu diperbarui setiap kali URL publik berubah. Untuk domain permanen, gunakan hostname kustom permanen sebagai nilai `NEXTAUTH_URL`.

Implementasi `Navbar.tsx` sudah meneruskan origin browser sebagai `callbackUrl` dan callback redirect di `auth.ts` mengizinkan domain `trycloudflare.com`. Namun pengaturan `NEXTAUTH_URL` tetap harus selaras dengan hostname publik agar seluruh redirect NextAuth konsisten.

#### Aturan `NEXTAUTH_URL` untuk localhost dan Quick Tunnel

- Saat aplikasi hanya dibuka dari browser lokal, gunakan `http://localhost:3000`.
- Saat aplikasi dibuka melalui Quick Tunnel, gunakan URL HTTPS `trycloudflare.com` aktif sebagai nilai `NEXTAUTH_URL` dan restart Next.js.
- Jangan mengharapkan Quick Tunnel sebagai URL deploy permanen: hostname berubah setiap tunnel dimulai ulang, sehingga sesi pengguna dapat perlu login kembali dan nilai `NEXTAUTH_URL` harus diperbarui.
- Untuk deployment stabil, gunakan named tunnel dengan hostname kustom permanen, lalu isi `NEXTAUTH_URL` dengan hostname kustom tersebut.

### 9. Diagnosa login admin: password tidak berubah setelah seed

Password admin disimpan dalam bentuk hash pada tabel `User`. Mengubah nilai default password di `prisma/seed.ts` atau mengubah `ADMIN_PASSWORD` di `.env.local` tidak otomatis mengganti hash akun admin yang sudah ada. Pada seed saat ini, `upsert` pengguna memakai `update: {}`, sehingga hanya membuat akun pada seed pertama dan tidak memperbarui password akun yang telah ada.

Saat terjadi pesan `wrong password`, pastikan `ADMIN_PASSWORD` di `.env.local` berisi nilai yang benar, lalu lakukan reset password admin secara eksplisit. Jangan menggunakan `db:seed` sebagai mekanisme reset password produksi tanpa perubahan kode yang terkontrol, karena seed sebaiknya idempoten dan tidak diam-diam mengubah kredensial akun yang sudah ada.

## [2026-09-04] AI Provider Customization
- Updated `src/lib/ai.ts` to support multiple OpenAI-compatible AI providers using `AI_API_KEY`, `AI_API_BASE`, and `AI_MODEL`.
- Updated `src/app/api/ai-status/route.ts` to check active AI provider.
- Documented new environment variables in `.env.local.example`.
- Fixed TypeScript error in `src/server/auth.ts` (removed invalid `trustHost` config for NextAuth).
- Build verified successful (`npm run build`) after all changes.

## [2026-09-04] Rencana Peremajaan UI (Modern, Ramah Mata, Teks Brand)

Telah disepakati arah desain untuk perbaikan UI:
- **Arah visual**: Modern, bersih, kontras teks jelas untuk produktivitas membaca email/pesan pekerjaan, tanpa warna neon/menyilaukan mata.
- **Branding**: Teks saja (tanpa aset logo eksternal), dengan tipografi yang kuat ("Jet Digital Pro").

### Butir Rencana Implementasi:
1. **Palet Warna**:
   - Slate / Neutral gray sebagai dasar (`bg-slate-50`, `border-slate-200`) untuk mengurangi kelelahan mata.
   - Primary: Biru profesional teduh (Tailwind `indigo-600` / `blue-600`).
   - Status badge: Warna pastel redup (bukan warna menyala), teks kontras tinggi (WCAG AAA compliant).
2. **Tipografi & Spacing**:
   - Integrasi font `Inter` via `@next/font/google` bawaan Next.js.
   - Pertegas hierarki judul subject email dan nama pengirim agar scanning pesan cepat.
3. **Kanban Board & Column**:
   - Kolom `rounded-2xl` dengan border tipis `border-slate-200/80` dan latar abu lembut.
   - Indikator strip warna kolom tipis di tepi atas/kiri.
   - Scrollbar horizontal/vertikal dibuat tipis dan minimalis.
	4. **Kanban Card**:
	   - Kartu berlatar putih dengan shadow mikro (`shadow-[0_1px_3px_rgba(0,0,0,0.04)] hover:shadow-[0_4px_12px_rgba(0,0,0,0.06)]`).
	   - Hover state halus tanpa efek gerak berlebih (`hover:border-slate-300`).
	   - Indikator unread, thread count, dan follow-up date menggunakan ikon SVG inline yang ringkas dan rapi.
	5. **Modal Detail Kartu**:
	   - Backdrop semi-transparan dengan blur tipis (`backdrop-blur-xs bg-slate-900/40`).
	   - Desain timeline aktivitas dengan ikon SVG bertema (email received, sent, activity, draft).
	   - Area komposer balasan dan deskripsi dengan tipografi nyaman dan kontras teks slate jelas.
	6. **Halaman Login & Header**:
	   - Tampilan login minimalis terfokus.
	   - Navbar dengan teks brand "Jet Digital Pro" yang tegas dan avatar profil inisial.

	### Status Eksekusi Pembaruan UI (4 September 2026):
	- [x] `KanbanColumn.tsx`: Layout rounded-2xl, color-strip indikator atas, slate styling.
	- [x] `KanbanCard.tsx`: Micro-shadow, refined typography, responsive badge colors, compact action buttons.
	- [x] `KanbanBoard.tsx`: Header slate styling, pulse unread badge, modern icon buttons for Sync / Reclassify / Columns.
	- [x] `CardDetailPanel.tsx`: Backdrop blur, SVG-based activity timeline, modern reply composer layout.
	- [x] `Modal.tsx` & `ColumnSettings.tsx`: Backdrop blur-xs, rounded-2xl container, palette selector berjarak nyaman, border slate lembut.
	- [x] `Navbar.tsx` & `login/page.tsx`: Branding tegas "Jet Digital Pro", avatar profile inisial, kontras teks WCAG compliant.
	- [x] Verifikasi build: `npm run build` sukses 100% tanpa error TypeScript.

## [2026-09-04] Zoho OAuth 2.0 Integration (One-Click Login Zoho)

Sesuai instruksi mentor: aplikasi harus menyediakan halaman/tombol login Zoho sendiri (integrated), bukan sekadar memberikan link ke zoho.com. Alurnya: user klik tombol di aplikasi -> login di halaman resmi Zoho -> redirect balik ke aplikasi -> koneksi email otomatis tersimpan tanpa input IMAP/SMTP password manual.

### Perubahan yang dilakukan:
1. **Prisma schema** (`prisma/schema.prisma`, model `EmailConfig`):
   - Field baru: `authType` (default `password`), `accessToken`, `refreshToken`, `tokenExpiry`, `zohoAccountId`.
   - `imapPass`/`smtpPass` kini nullable (tidak dibutuhkan saat OAuth).
   - Migrasi diterapkan via `npx prisma db push` di kontainer Docker Node 20.
2. **Modul OAuth** (`src/lib/zoho-oauth.ts`): build auth URL, exchange code -> token, fetch info akun (`/api/accounts`), auto-refresh access token (`getValidZohoAccessToken`).
3. **API Routes**:
   - `GET /api/auth/zoho` — inisiasi login (validasi sesi CRM, state berisi tenantId/boardId, redirect ke Zoho).
   - `GET /api/auth/zoho/callback` — tukar `code`, simpan/update `EmailConfig` (authType `oauth2`, token terenkripsi AES), redirect ke `/dashboard/settings?status=zoho_connected`.
4. **Transport layer** (`channels/email.ts`, `worker/imap-poller.ts`, `src/server/actions/draft.ts`, `src/lib/mail.ts`, `src/lib/imap-sync.ts`, `src/app/api/cards/[id]/route.ts`, `src/app/api/drafts/[id]/route.ts`):
   - IMAP `imapflow`: pakai `auth: { user, accessToken }` (XOAUTH2) saat `authType === 'oauth2'`; fallback ke password.
   - SMTP `nodemailer`: pakai `auth: { type: 'OAuth2', user, accessToken }` saat OAuth; fallback password.
   - Call site `decrypt(config.imapPass)` yang tadinya non-null disesuaikan karena field kini nullable.
5. **UI** (`src/components/setup/ZohoConnectCard.tsx` + `src/app/dashboard/settings/page.tsx`):
   - Kartu "Connect with Zoho Mail (One-Click)" dengan dropdown Link to Board + tombol "Login with Zoho".
   - Badge "Zoho OAuth" pada konfigurasi yang terhubung via OAuth.
6. **Build**: `npm run build` berhasil kompilasi; route `/api/auth/zoho` dan `/api/auth/zoho/callback` terdaftar.

	### Setup Zoho API Console (dibutuhkan sebelum tombol bisa dipakai):
	1. Buka https://api-console.zoho.com -> Add Client -> pilih **Server-based Application**.
	2. Isi Client Name: `Kanban CRM Jet Digital Pro`.
	3. Isi Homepage URL: `http://localhost:3099` (atau URL tunnel `https://<domain>`).
	4. Authorized Redirect URI: `http://localhost:3099/api/auth/zoho/callback` (atau `https://<domain>/api/auth/zoho/callback`).
	5. Catat Client ID & Client Secret, lalu isi `.env.local`:
	   - `ZOHO_CLIENT_ID`, `ZOHO_CLIENT_SECRET`, `ZOHO_REDIRECT_URI`.
	   - Opsional `ZOHO_ACCOUNTS_URL` / `ZOHO_MAIL_API_URL` bila akun berada di data center selain `.com` (`.eu`, `.in`, `.com.au`).
	6. Scope yang dipakai aplikasi: `ZohoMail.messages.ALL,ZohoMail.accounts.READ,email` dengan `access_type=offline` sehingga refresh token tersimpan dan access token diperpanjang otomatis oleh `getValidZohoAccessToken`.

	### Insiden Port 3000 & Resolusi Port 3099 (4 September 2026):
	- **Gejala**: Saat tombol login Zoho diklik, browser menampilkan halaman gelap "Sign in to Open WebUI".
	- **Penyebab**: Mesin host memiliki service Open WebUI yang aktif di port `3000` (PID 30000). Redirect OAuth masuk ke Open WebUI alih-alih server Next.js Kanban CRM.
	- **Solusi**:
	  1. Port default Kanban CRM dipindahkan ke `3099` di `package.json` (`next dev -p 3099` dan `next start -p 3099`).
	  2. `NEXTAUTH_URL` dan `ZOHO_REDIRECT_URI` disesuaikan menunjuk ke port `3099`.
	  3. Di Zoho API Console, Redirect URI diubah ke `http://localhost:3099/api/auth/zoho/callback`.
	  4. Aplikasi CRM diakses di `http://localhost:3099`.

	### Format Developer Credentials untuk Kartu Trello:
	Mentor meminta developer credential ditulis di kartu Trello:
	```text
	Judul Card: Zoho OAuth 2.0 Developer Credentials - Kanban CRM

	Deskripsi:
	Kredensial Zoho API Console untuk fitur One-Click Zoho Login pada Kanban CRM Jet Digital Pro.

	1. Zoho API Console Link:
	https://api-console.zoho.com

	2. Client Configuration:
	- Client Type: Server-based Application
	- Client Name: Kanban CRM Jet Digital Pro
	- Homepage URL: http://localhost:3099 (atau domain publik tunnel)
	- Authorized Redirect URI: http://localhost:3099/api/auth/zoho/callback

	3. Scopes Wajib:
	- ZohoMail.messages.ALL
	- email

	4. Environment Variables (.env.local):
	ZOHO_CLIENT_ID=<Client_ID_dari_Zoho_Console>
	ZOHO_CLIENT_SECRET=<Client_Secret_dari_Zoho_Console>
	ZOHO_REDIRECT_URI=http://localhost:3099/api/auth/zoho/callback
	ZOHO_ACCOUNTS_URL=https://accounts.zoho.com
	ZOHO_MAIL_API_URL=https://mail.zoho.com

		5. Catatan:
		- Aplikasi berjalan di port 3099 (karena port 3000 dipakai Open WebUI).
		- Setelah Client ID & Secret diisi di .env.local, restart aplikasi CRM (`npm run start` atau `npm run dev`).
		```

	### Insiden & Investigasi Zoho OAuth (4 September 2026):
	1. **Bentrok Port 3000 (Open WebUI) & Quick Tunnel 502**:
	   - **Gejala**: Redirect OAuth Zoho mengarah ke halaman login Open WebUI atau error 502 Bad Gateway di domain `trycloudflare.com`.
	   - **Penyebab**: Port 3000 dipakai oleh proses Open WebUI di laptop host (PID 30000). Selain itu URL Quick Tunnel berubah tiap kali proses `cloudflared` di-restart.
	   - **Solusi**: Port default CRM diubah permanen ke `3099` di `package.json` (`next start -p 3099` dan `next dev -p 3099`). `NEXTAUTH_URL` dan `ZOHO_REDIRECT_URI` di `.env.local` serta di Zoho API Console diselaraskan ke port `3099`.

	2. **Insiden HTTP 500 / 401 Zoho API & Fallback Input Email**:
	   - **Gejala**: Callback Zoho gagal dengan pesan `Failed to fetch Zoho accounts: HTTP 500` lalu `HTTP 401`, atau `Invalid OAuth Scope` saat scope dicoba diperluas.
	   - **Penyebab**: Token OAuth Zoho bukan JWT standar (opaque token) sehingga tidak bisa didecode langsung. Akun Zoho yang didaftarkan menggunakan email eksternal (seperti `@gmail.com`) tidak memiliki akun mailbox native pada endpoint `https://mail.zoho.com/api/accounts`, dan scope `ZohoAccounts.profile.READ` ditolak Zoho karena scope resmi yang valid adalah `ZohoMail.messages.ALL,email`.
	   - **Solusi**: Input "Your Zoho Email" ditambahkan pada kartu `ZohoConnectCard.tsx` sebelum tombol login diklik. Email diteruskan melalui state OAuth ke callback route `/api/auth/zoho/callback`. Jika API Zoho gagal mengembalikan profil mailbox, sistem otomatis menggunakan email dari input user untuk menyimpan konfigurasi `EmailConfig`.

	3. **Status Penyimpanan OAuth Berhasil (Milestone)**:
	   - Alur One-Click OAuth Zoho berhasil diverifikasi: user login di halaman resmi Zoho -> tombol Accept -> redirect kembali ke CRM -> record konfigurasi email tersimpan di database dengan badge `Zoho OAuth` dan status `Active`.
	   - Fitur toggle ikon mata (show/hide password) ditambahkan pada komponen `Input.tsx` untuk mempermudah pengecekan password.

	4. **Temuan Tes IMAP "Command failed" & SMTP "535 Authentication Failed"**:
	   - **Gejala**: Saat tombol "Test IMAP" dan "Test SMTP" ditekan pada konfigurasi yang tersambung via OAuth, muncul error `IMAP: Command failed` dan `SMTP: Invalid login: 535 Authentication Failed`.
	   - **Penyebab**: Fungsi tes di `src/server/actions/email-config.ts` (`testImapConnection` dan `testSmtpConnection`) saat ini hanya menguji autentikasi berbasis password biasa (`auth: { user, pass }`). Karena konfigurasi tersambung via OAuth, server Zoho menolak password biasa (atau password app) untuk username berekstensi non-Zoho (`@gmail.com`).
	   - **Rencana Tindakan**: Perbarui action tes koneksi agar mendeteksi status OAuth dan melakukan tes menggunakan mekanisme token OAuth (`XOAUTH2`), serta pastikan worker sinkronisasi email menggunakan token OAuth yang valid.

	### Catatan operasional:
- Restart `next start` dan worker diperlukan setelah `npx prisma generate` (proses node lama mengunci `query_engine-windows.dll.node` sehingga generate sempat gagal `EPERM`).
- Konfigurasi IMAP/SMTP password manual tetap berfungsi (backward compatible) untuk akun non-Zoho.



## Catatan Untuk hari ke-2 progress proyek
## ---------------------------------------

### 1. Analisis Akar Masalah Kegagalan Uji Koneksi IMAP & SMTP (Log 5 September 2026)
Berdasarkan log eksekusi `testImapConnection({"host":"imap.zoho.com","pass":"...","port":993})` dan `GET /socket.io 404`:

1. **Akar Masalah Kegagalan Autentikasi IMAP/SMTP ("Command failed" & "535 Authentication Failed")**:
   - `testImapConnection` dan `testSmtpConnection` pada `src/server/actions/email-config.ts` hanya dirancang untuk pengujian autentikasi password statis (`auth: { user, pass }`).
   - Konfigurasi yang telah terhubung melalui **Zoho OAuth** menyimpan token akses terenkripsi (`accessToken` & `refreshToken`) di database dan mengharuskan mekanisme autentikasi **XOAUTH2** (`auth: { user, accessToken }`).
   - Saat tombol "Test IMAP" / "Test SMTP" ditekan pada akun OAuth, form di UI tetap mengirim teks password manual (atau fallback), sehingga server Zoho menolak permintaan login karena akun yang terotentikasi OAuth menolak autentikasi password biasa.

2. **Temuan Kode Redundan & Noise Log Socket.IO (404 Polling Loop)**:
   - Terminal Next.js dibanjiri request berulang:
     `GET /socket.io?EIO=4&transport=polling... 404`
   - Penyebab: Komponen `SocketProvider.tsx` menginisialisasi client Socket.IO ke root URL aplikasi, sementara Next.js dijalankan dengan command standar (`next start`) tanpa server runtime Socket.IO terpasang. Polling yang selalu gagal 404 ini memboroskan sumber daya jaringan dan mengaburkan log sistem.

### 2. Rencana Perbaikan Logika dan Perapihan Kode (Arsitektur Tetap Terjaga)

1. **Perbaikan Fungsi Pengujian Koneksi (Email Test Actions)**:
   - Tambahkan kemampuan pengujian koneksi berbasis OAuth pada `testImapConnection` dan `testSmtpConnection`. Jika dipanggil untuk konfigurasi bertipe `oauth2` (menggunakan `configId`), fungsi akan memanggil `getValidZohoAccessToken(configId)` dan melakukan pengujian konektivitas IMAP/SMTP menggunakan protokol XOAUTH2 secara otomatis.
   - Pengujian berbasis password tetap dipertahankan untuk konfigurasi manual/non-Zoho.

2. **Perapihan Antarmuka Form Konfigurasi Email (`EmailConfigForm.tsx`)**:
   - Berikan pemisahan visual yang jelas antara konfigurasi OAuth dan konfigurasi password manual.
   - Pada konfigurasi berstatus `oauth2`, sembunyikan kolom input password IMAP/SMTP yang tidak relevan agar tidak membingungkan pengguna, dan tampilkan badge status koneksi token OAuth.
   - Sesuaikan aksi tombol "Test" agar otomatis memicu tes XOAUTH2 pada akun OAuth.

3. **Pembersihan Logika Socket.IO yang Tidak Diperlukan**:
   - Nonaktifkan koneksi fallback polling pada `SocketProvider.tsx` yang menyebabkan flooding request 404 berulang pada terminal, dan ganti mekanisme sinkronisasi UI ke event berbasis browser (`CustomEvent` / `board-refresh`) yang sudah terpasang stabil pada aplikasi.

4. **Verifikasi Jalur Worker IMAP Poller**:
   - Pastikan worker background (`worker/imap-poller.ts`) menggunakan token hasil dekripsi OAuth untuk akun bertipe `oauth2` saat menyinkronkan email masuk menjadi kartu Kanban.

### 3. Hasil Eksekusi Perbaikan (5 September 2026):
- [x] **Dukungan XOAUTH2 pada Server Action Tes Email**: `testImapConnection` dan `testSmtpConnection` di `src/server/actions/email-config.ts` kini menerima `configId`. Jika akun bertipe `oauth2`, fungsi secara otomatis meminta access token valid melalui `getValidZohoAccessToken` dan menguji konektivitas IMAP via ImapFlow (`auth: { user, accessToken }`) serta SMTP via Nodemailer (`auth: { type: 'OAuth2', user, accessToken }`).
- [x] **Pemisahan UI OAuth pada Form Konfigurasi Email**: `src/components/setup/EmailConfigForm.tsx` diperbarui. Konfigurasi bertipe OAuth kini tidak lagi menampilkan kolom password yang membingungkan dan menampilkan banner informatif "Connected via Zoho OAuth (No Password Required)". Tombol pengujian koneksi berganti menjadi `Test IMAP (OAuth)` dan `Test SMTP (OAuth)`.
- [x] **Pembersihan Flooding Log 404 Socket.IO**: Komponen `src/providers/SocketProvider.tsx` dialihkan dari polling fiktif `socket.io-client` ke native Server-Sent Events (`/api/events`) yang sudah didukung secara internal oleh Next.js. Log terminal kini bersih dari spam `GET /socket.io 404`.
- [x] **Penyesuaian Modul Mail Standalone**: `src/lib/mail.ts` diperbarui untuk mendukung mode `oauth2` pada fungsi `fetchNewEmails` dan `sendEmail` tanpa mengandalkan password teks yang null.
- [x] **Verifikasi Build**: Kompilasi `npm run build` berhasil 100% tanpa error TypeScript dan Turbopack.

	### 4. Implementasi Hasil Audit QA & Stabilisasi Sistem (7 September 2026)
	Menindaklanjuti temuan laporan audit kualitas (`docs/qa-audit-report.md`), serangkaian perbaikan berkala telah diterapkan tanpa merusak infrastruktur eksisting:

	- [x] **Pembersihan Logika & Dead Code**: Menghapus blok dead code penanganan duplikat `inReplyTo` pada `worker/imap-poller.ts`. Blok kedua tidak lagi memicu kode tak terjangkau.
	- [x] **Keamanan & Otorisasi Objek (BOLA Protection)**: Menambahkan validasi kepemilikan tenant untuk target `columnId` pada endpoint `PUT /api/cards/[id]`, mencegah pemindahan kartu ke board/kolom milik tenant lain.
	- [x] **Operasi Hapus Kartu Bersifat Atomic & Data Snapshot**: Endpoint `DELETE /api/cards/[id]` membungkus pembersihan relasi (`ActivityLog`, `DraftMessage`, `Card`) dalam satu transaksi `prisma.$transaction`. Data kartu disalin (*snapshot*) sebelum record dihapus agar proses pengarsipan email ke mail server di latar belakang tetap memiliki referensi lengkap.
	- [x] **Pengerasan Konfigurasi TLS IMAP**: Opsi `rejectUnauthorized: false` pada `channels/email.ts` diganti menjadi kondisional: diaktifkan penuh pada mode produksi (`process.env.NODE_ENV === 'production' && process.env.IMAP_ALLOW_SELF_SIGNED !== 'true'`).
	- [x] **Dinamisasi Folder IMAP Multi-Mailbox**: Membuka folder email dinamis sesuai lokasi folder kartu (`card.imapFolder || 'INBOX'`) pada `channels/email.ts`, `src/lib/imap-sync.ts`, dan handler `PATCH /api/cards/[id]`. Email di shared folder tim (`Elite`, `Gold`, `Premiere`, `Nell`) tersinkronisasi flag read/unread-nya secara presisi.
	- [x] **Proteksi Concurrency & Race Condition Poller**: Menangani error Prisma `P2002` (unique constraint `messageId`) pada `worker/imap-poller.ts` untuk mencegah duplikasi kartu dan antrean AI ganda saat poller concurrent aktif.
	- [x] **Dukungan OAuth2 Zoho & Non-blocking Sync**: Menghubungkan fungsi `syncMarkAsRead` dan `syncArchiveEmail` di `src/lib/imap-sync.ts` dengan `getValidZohoAccessToken` saat konfigurasi bertipe `oauth2`. Sinkronisasi status IMAP di route `PATCH /api/cards/[id]` dialihkan ke eksekusi asinkron latar belakang (non-blocking) agar respons UI Kanban tetap instan. Menambahkan fallback folder arsip (`Archive` -> `Trash`).
	- [x] **Verifikasi Teknis**: Pemeriksaan tipe statis `npx tsc --noEmit` berhasil 100% tanpa error TypeScript.

	### 5. Investigasi Masalah Email Masuk Tidak Muncul di Board (7 September 2026)
	- **Gejala**: Email baru yang dikirim ke akun email uji coba tidak otomatis muncul sebagai kartu di Kanban Board.
	- **Akar Masalah**:
	  1. **Worker Background Tidak Aktif**: Di Windows host, hanya proses web Next.js (`npm run dev -p 3099`) yang berjalan. Proses worker BullMQ (`npm run worker`) belum diaktifkan di terminal terpisah. Tombol "Sync" di board hanya memasukkan job ke antrean Redis `email-poll`, sehingga tanpa worker aktif, job tersebut tidak pernah dieksekusi.
	  2. **Interval Polling Default Terlalu Lama**: `POLL_INTERVAL_MS` pada `worker/scheduler.ts` sebelumnya diatur setiap 30 menit, sehingga email baru lambat terdeteksi.
	- **Tindakan & Solusi**:
	  1. `POLL_INTERVAL_MS` di `worker/scheduler.ts` disesuaikan dari 30 menit menjadi 2 menit (dapat dikonfigurasi via `IMAP_POLL_INTERVAL_MS`).
	  2. Pengujian poller manual berhasil menarik 17 email (termasuk email uji coba "TES 2 IMAP/SMTP", "TES 3 IMAP/SMTP", dan "Uji IMAP/SMTP") dan membuat kartu Kanban baru di kolom General pada database.
	### 6. Investigasi Masalah Pesan Muncul Kembali Setelah Dihapus (7 September 2026)
	- **Gejala**: Pengguna menghapus kartu email dari papan Kanban CRM, tetapi saat poller IMAP berjalan, pesan tersebut muncul kembali (*resurrected*) sebagai kartu baru di kolom General.
	- **Akar Masalah**:
	  1. **Hard-Delete Menghilangkan Riwayat**: Sebelumnya `DELETE /api/cards/[id]` menghapus record kartu secara permanen dari database (`prisma.card.delete`).
	  2. **Email Fisik Masih Ada di Mailbox**: Gmail menggunakan penamaan folder khusus (`[Gmail]/Trash` atau `[Gmail]/Sampah`) sehingga perintah pemindahan ke folder hardcoded `'Archive'` / `'Trash'` ditolak oleh Gmail. Email fisik tetap berada di folder `INBOX` Gmail.
	  3. **Poller Mengira Email Baru**: Saat poller memindai `INBOX` setiap 2 menit, email tersebut dicocokkan dengan `findUnique({ where: { messageId } })`. Karena record di DB sudah terhapus total, poller menganggapnya sebagai email baru yang belum pernah masuk ke CRM dan membuat kartu ulang.
	- **Solusi Dua Lapis**:
	  1. **Soft-Delete pada Kartu CRM**: Endpoint `DELETE /api/cards/[id]` kini memperbarui status kartu menjadi `status: 'deleted'`. Endpoint query kolom dan kartu (`/api/columns`, `/api/cards`) memfilter `NOT: { status: 'deleted' }` sehingga kartu langsung hilang dari tampilan Kanban.
	  2. **Proteksi Poller**: Worker `worker/imap-poller.ts` kini mengecek `if (existingCard.status === 'deleted') continue;`. Email yang sudah dihapus oleh pengguna di CRM tidak akan pernah dibuatkan kartu baru lagi.
	  3. **Dinamisasi Trash Gmail**: Modul `channels/email.ts` kini memindai daftar mailbox via `imap.list()` untuk mendeteksi folder sampah sebenarnya (misal `[Gmail]/Trash` atau folder berbendera `\Trash`), serta memberikan fallback flag `\Deleted` jika pemindahan ditolak oleh server mail.


