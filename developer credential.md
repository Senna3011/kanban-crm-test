============================================================
DEVELOPER CREDENTIALS & SYSTEM SPECIFICATION
Project: Kanban CRM — Jet Digital Pro
Last Updated: 2026-09-07 (Day 2 Milestone)
============================================================

1. ARSITEKTUR & PORT RUNTIME LOKAL
------------------------------------------------------------
- Web Application (Next.js 16) : http://localhost:3099
  *Catatan: default port 3000 dipindah ke 3099 karena port 3000
   digunakan oleh Open WebUI di laptop host.
- PostgreSQL 16 (Docker)       : localhost:5433
  *Host mapping 5433:5432 (port 5432 host dipakai service PostgreSQL lokal)
- Redis 7 (Docker / BullMQ)    : localhost:6379
- Background Worker            : npx tsx worker/index.ts (BullMQ email poller)
- Unified Dev Command          : npm run dev:all (Next.js + Worker paralel)

2. KREDENSIAL & STRUKTUR PENGGUNA (USER ROLES)
------------------------------------------------------------
A. Akun Admin Default Aktif:
   - URL Login : http://localhost:3099/login
   - Email     : admin@jetdigitalpro.com
   - Password  : jdp123 (didefinisikan pada seed & .env.local)
   - Role      : admin
   - Tenant    : Jet Digital Pro (subdomain: jetdigitalpro)

B. Spesifikasi Multi-User & Delegasi Tugas:
   - Skema database (Prisma) mendukung multi-user di dalam satu tenant.
   - Peran (Role) yang tersedia:
     * "admin"  : Hak akses penuh ke konfigurasi email, board, dan sistem.
     * "member" : Staf operasional (sales/CS) untuk pengelolaan pesan kartu.
   - Delegasi Kartu (Assignment):
     * Kolom relasi `assignedToId` pada model `Card` memungkinkan setiap
       email/kartu didelegasikan ke anggota tim tertentu.

C. Database Internal (Docker Postgres):
   - Host     : localhost
   - Port     : 5433
   - User     : kanban
   - Password : kanban123
   - Database : kanban-crm

3. ZOHO OAUTH 2.0 (ONE-CLICK LOGIN) CREDENTIALS
------------------------------------------------------------
Didaftarkan melalui: https://api-console.zoho.com

- Client Type              : Server-based Application
- Client Name              : Kanban CRM Jet Digital Pro
- Homepage URL             : http://localhost:3099
  (atau URL Cloudflare Tunnel publik jika diuji mentor)
- Authorized Redirect URIs :
  1) http://localhost:3099/api/auth/zoho/callback
  2) https://<subdomain>.trycloudflare.com/api/auth/zoho/callback
     (tambahkan saat menggunakan Quick Tunnel)

- Scopes Wajib (pilih saat generate / izin consent):
  * ZohoMail.messages.ALL  (baca & kirim email/thread)
  * ZohoMail.accounts.READ (deteksi primary email & account ID)
  * email                  (identitas akun Zoho)

- Nilai yang didapat dari Zoho Console:
  * Client ID     : <generate_dari_api_console>
  * Client Secret : <generate_dari_api_console>

4. AI PROVIDER (EMAIL CLASSIFIER & AUTO-DRAFT)
------------------------------------------------------------
Menggunakan OpenAI-compatible REST API (pesatrouter):
- AI_API_BASE : https://api.pesatrouter.com/v1
- AI_MODEL    : pesat-flash
- AI_API_KEY  : <isi_api_key_anda>

5. TEMPLATE LENGKAP FILE .env.local
------------------------------------------------------------
DATABASE_URL="postgresql://kanban:kanban123@localhost:5433/kanban-crm"
REDIS_URL="redis://localhost:6379"

NEXTAUTH_URL="http://localhost:3099"
NEXTAUTH_SECRET="your-random-32-char-secret-here"
ENCRYPTION_KEY="your-32-character-encryption-key"

AI_API_KEY="sk-your-ai-api-key"
AI_API_BASE="https://api.pesatrouter.com/v1"
AI_MODEL="pesat-flash"

ZOHO_CLIENT_ID="1000.YOUR_ZOHO_CLIENT_ID"
ZOHO_CLIENT_SECRET="YOUR_ZOHO_CLIENT_SECRET"
ZOHO_REDIRECT_URI="http://localhost:3099/api/auth/zoho/callback"
ZOHO_ACCOUNTS_URL="https://accounts.zoho.com"
ZOHO_MAIL_API_URL="https://mail.zoho.com"

ADMIN_EMAIL="admin@jetdigitalpro.com"
ADMIN_PASSWORD="jdp123"

# Opsional Pengaturan Poller:
IMAP_POLL_INTERVAL_MS="120000"           # Interval cek email otomatis (default 2 menit)
IMAP_ALLOW_SELF_SIGNED="false"           # True jika menggunakan sertifikat self-signed

6. PERINTAH OPERASIONAL
------------------------------------------------------------
# 1. Menyalakan Container Database & Redis
docker compose up -d

# 2. Menjalankan Web & Worker Sekaligus (Satu Pintu - Recommended)
npm run dev:all

# 3. Atau Menjalankan Secara Terpisah:
# Terminal 1 (Next.js):
npm run dev
# Terminal 2 (Background Poller):
npm run worker

# 4. Aktifkan Akses Publik via Cloudflare Tunnel (Jika Diuji Mentor Jarak Jauh)
& "C:\Program Files (x86)\cloudflared\cloudflared.exe" tunnel --url http://127.0.0.1:3099

============================================================
7. FORMAT KARTU TRELLO (UNTUK LAPORAN MENTOR)
============================================================
Judul Kartu:
[Credential & Environment] Kanban CRM Jet Digital Pro - Day 2

Deskripsi Kartu:
Berikut rincian kredensial dan akses pengujian sistem Kanban CRM Jet Digital Pro:

1. Akses Web & Akun:
- URL Lokal: http://localhost:3099
- Akun Admin: admin@jetdigitalpro.com / jdp123
- Role Sistem: Admin & Member (didukung penugasan kartu/assignedTo)

2. Infrastruktur Lokal:
- Docker Postgres: localhost:5433 (User: kanban / Pass: kanban123 / DB: kanban-crm)
- Docker Redis: localhost:6379
- Single Run Command: npm run dev:all (Next.js port 3099 + Worker IMAP Poller 2 menit)

3. Integrasi Email & AI:
- Zoho OAuth: Server-based App (Scope: ZohoMail.messages.ALL, email)
- AI Model: pesat-flash via pesatrouter API (Email auto-classification & reply drafting)
- IMAP / SMTP: Mendukung Zoho OAuth (XOAUTH2) dan Password/App Password Gmail
============================================================
