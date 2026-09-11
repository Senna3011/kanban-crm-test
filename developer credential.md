============================================================
DEVELOPER CREDENTIALS & SYSTEM SPECIFICATION
Project: Kanban CRM — Jet Digital Pro
Last Updated: 2026-09-11 (Multi-User & Security Hardening)
============================================================

1. ARSITEKTUR RUNTIME & PORT LOKAL
------------------------------------------------------------
- Web Application (Next.js 16) : http://localhost:3099
- PostgreSQL Cloud (Supabase)  : aws-0-ap-northeast-1.pooler.supabase.com:5432 (Pooler IPv4)
- Redis Local (Docker / BullMQ): localhost:6380 (mapped to 6379)
  *Command: docker run -d -p 6380:6379 --name local-redis-custom redis:alpine
- Background Worker            : npx tsx worker/index.ts (BullMQ email poller)
- Unified Dev Command          : npm run dev:all (Next.js + Worker paralel)

2. OTENTIKASI & SISTEM MULTI-USER (RBAC)
------------------------------------------------------------
A. Form Login:
   - URL Login : http://localhost:3099/login
   - Mode      : Input Email + Password
   - Proteksi  : Hash password bcrypt (12 rounds), validasi session NextAuth JWT.

B. Akun Default Admin:
   - Email     : admin@jetdigitalpro.com
   - Password  : jdp123 (dapat diubah di .env.local)
   - Role      : admin
   - Tenant    : Jet Digital Pro (subdomain: jetdigitalpro)

C. Manajemen Peran & Izin Akses (RBAC):
   - "admin"  : Akses penuh (konfigurasi Zoho/SMTP, profil perusahaan, manajemen pengguna tim).
   - "member" : Operasional (baca & kelola kartu kanban, kirim balasan email, draf AI).

D. Metode Penambahan Pengguna Baru:
   - Direct Creation (Admin Input Langsung):
     * Menu: `/dashboard/team` -> tombol "➕ Buat User Baru"
     * API: `POST /api/users` (role admin/member, password awal dibuat admin).
   - Email Invitation Link (Registrasi Mandiri):
     * Menu: `/dashboard/team` -> tombol "✉️ Undang via Email"
     * API: `POST /api/invitations`
     * Tautan: `/invite/[token]` (Token aman kriptografi 48-bit, berlaku 48 jam).

3. ZOHO OAUTH 2.0 (ONE-CLICK LOGIN)
------------------------------------------------------------
Didaftarkan melalui: https://api-console.zoho.com

- Client Type              : Server-based Application
- Client Name              : Kanban CRM Jet Digital Pro
- Authorized Redirect URIs :
  1) http://localhost:3099/api/auth/zoho/callback
  2) https://<domain-vps-atau-tunnel>/api/auth/zoho/callback
- Scopes Wajib             : ZohoMail.messages.ALL, ZohoMail.accounts.READ, email
- Keamanan State           : HMAC SHA-256 Signature + Anti-Replay Expiry (15 menit).

4. AI PROVIDER (EMAIL CLASSIFIER & AUTO-DRAFT)
------------------------------------------------------------
OpenAI-compatible REST API (Pesatrouter):
- AI_API_BASE : https://api.pesatrouter.com/v1
- AI_MODEL    : pesat-flash
- AI_API_KEY  : sk-pesat-61161ca574f4bfeb6659946fd6df835f387857db5e4d95da

5. TEMPLATE LENGKAP FILE .env.local
------------------------------------------------------------
DATABASE_URL="postgresql://postgres.bcgmotjidqntrsficnbr:Supasenna3011@aws-0-ap-northeast-1.pooler.supabase.com:5432/postgres"
REDIS_URL="redis://127.0.0.1:6380"

NEXTAUTH_URL="http://localhost:3099"
NEXTAUTH_SECRET="b09a1c8e7f42d1847e9305f88421c67d"
ENCRYPTION_KEY="a8f5c3d2e1b40978564213cb98765432"

AI_API_KEY="sk-pesat-61161ca574f4bfeb6659946fd6df835f387857db5e4d95da"
AI_API_BASE="https://api.pesatrouter.com/v1"
AI_MODEL="pesat-flash"

ZOHO_CLIENT_ID="1000.1QE5CUV72TFW97KJ5656SFJFHKIIUX"
ZOHO_CLIENT_SECRET="aeb966bd88c9392c55bacb5cfdfa30104a324f1731"
ZOHO_REDIRECT_URI="http://localhost:3099/api/auth/zoho/callback"
ZOHO_MAIL_API_URL="https://mail.zoho.com"

ADMIN_EMAIL="admin@jetdigitalpro.com"
ADMIN_PASSWORD="jdp123"

============================================================
6. FORMAT KARTU TRELLO (UNTUK LAPORAN MENTOR)
============================================================
Judul Kartu:
[Credential & Architecture] Kanban CRM Jet Digital Pro - Multi-User & RBAC

Deskripsi Kartu:
Berikut rincian kredensial dan arsitektur terbaru sistem Kanban CRM:

1. Akses Web & Akun:
- URL Web: http://localhost:3099/login (Email + Password)
- Akun Admin: admin@jetdigitalpro.com / jdp123
- User Management: Menu "Team" (/dashboard/team) mendukung Direct Creation & Invite Link (/invite/[token]).

2. Kontrol Hak Akses (RBAC):
- Role Admin: Manajemen tim, konfigurasi email Zoho/SMTP, profil perusahaan, setup.
- Role Member: Pengelolaan kartu kanban, interaksi pesan email, draf AI (menu settings read-only).

3. Infrastruktur & Background Sync:
- Database: Supabase PostgreSQL (Connection Pooler)
- Redis Queue: BullMQ (localhost:6380)
- Single Command: npm run dev:all (Next.js + Poller Worker)
- Keamanan: Zoho OAuth HMAC SHA-256 state signature, AES-256 credential encryption.
============================================================
