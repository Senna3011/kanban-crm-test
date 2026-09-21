# Rencana Integrasi Modul Kanban Outreach ke Kanban CRM

Dokumen ini merinci analisis kelayakan, arsitektur, dan tahapan implementasi fitur **Kanban Outreach** (Lead Generation & Cold Outreach Engine) ke dalam sistem **Kanban CRM** sesuai arahan Pak Nell.

---

## 1. Analisis Kelayakan (Feasibility Analysis)

**Kesimpulan:** **Sangat Memungkinkan (Highly Feasible)**.

Sistem `kanban-crm` saat ini sudah memiliki infrastruktur lengkap untuk siklus **CRM & Follow-Up**:
- **Email Engine**: Pengiriman & sinkronisasi email melalui SMTP, IMAP, dan Zoho OAuth.
- **AI Engine**: Integrasi Gemini/Groq untuk klasifikasi pesan dan pembuatan draf balasan.
- **Pipeline Kanban**: Papan interaktif dengan tahapan *Leads*, *Follow up 1-3*, *Success*, *Fail*.
- **Multi-Tenant & Security**: Dukungan multi-tenant, RBAC role, dan audit log.

Penambahan modul **Kanban Outreach** melengkapi funnel menjadi **Full Funnel Outreach Marketing** (*Top-of-Funnel* / Lead Sourcing hingga *Bottom-of-Funnel* / Retention & Closing).

---

## 2. Pemetaan Alur Full Funnel (End-to-End Workflow)

```
[ MODUL OUTREACH (Hulu) ]                                          [ MODUL CRM (Hilir) ]
1. Outscraper API        2. Reoon API           3. AI Engine         4. Mail Engine           5. Kanban CRM
┌────────────────┐     ┌──────────────┐       ┌───────────────┐    ┌─────────────────┐      ┌─────────────────────────┐
│ Search Leads   │ ──> │ Find & Verify│ ───>  │ Generate      │ ──>│ Send Cold Email │ ───> │ Buat Kartu Otomatis di │
│ LinkedIn       │     │ Valid Emails │       │ Persona Draft │    │ (SMTP/OAuth)    │      │ Kolom "Leads" /         │
└────────────────┘     └──────────────┘       └───────────────┘    └─────────────────┘      │ "Follow up 1"           │
                                                                                            └─────────────────────────┘
```

### Tahapan Detail:
1. **Cari Leads (LinkedIn)**: Menggunakan **Outscraper API** berdasarkan filter (jabatan, industri, lokasi, perusahaan).
2. **Temukan & Verifikasi Email**:
   - Menggunakan **Reoon Email Finder** untuk mendapatkan email berbasis nama dan domain perusahaan.
   - Menggunakan **Reoon Email Verifier** untuk validasi status email (*Safe*, *Risky*, *Invalid*) guna mencegah *bounce rate*.
3. **Personalisasi Draf Email (AI)**:
   - AI menghasilkan subjek dan pesan pembuka personal sesuai profil LinkedIn dan profil perusahaan prospek.
4. **Kirim Cold Email**:
   - Pengiriman draf yang telah disetujui melalui SMTP/OAuth dengan sistem throttling/antrean.
5. **Koneksi Otomatis ke Kanban CRM**:
   - Email yang berhasil terkirim otomatis terdaftar sebagai **Card** baru di kolom *Leads* atau *Follow up 1* untuk dipantau respons masuknya.

---

## 3. Rencana Arsitektur & Perubahan Sistem

### A. Database Schema (`prisma/schema.prisma`)
Penambahan model baru:
- **`OutreachCampaign`**: Menyimpan metadata kampanye, target audience, parameter AI prompt, dan status kampanye.
- **`OutreachLead`**: Menyimpan data prospek hasil scraping (nama, LinkedIn profile URL, judul pekerjaan, nama perusahaan, email hasil Reoon, status verifikasi, teks draf AI, status pengiriman).
- **`OutreachApiConfig`**: Menyimpan API Key Outscraper dan Reoon per tenant secara aman.

### B. Modul Backend Service (`src/lib/`)
- **`src/lib/outscraper.ts`**: Klien API untuk pencarian data LinkedIn via Outscraper.
- **`src/lib/reoon.ts`**: Klien API untuk Reoon Email Finder & Email Verifier.
- **`src/lib/outreach-ai.ts`**: Prompt generator untuk *cold email* personalisasi tingkat tinggi.
- **`src/lib/outreach-dispatcher.ts`**: Engine pengiriman bertahap (batch queue) dan bridge pembuatan kartu Kanban CRM otomatis.

### C. Antarmuka Pengguna (UI / Frontend)
- **Menu Baru**: `/outreach`
  - **Lead Scraper & Filter**: Form pencarian prospek LinkedIn.
  - **Lead Staging Table**: Tabel hasil pencarian dengan indikator verifikasi email Reoon (*Safe*, *Risky*, *Invalid*).
  - **Draf Reviewer & AI Personalizer**: Panel untuk review dan penyesuaian draf sebelum pengiriman massal.
  - **Campaign Analytics**: Ringkasan jumlah lead dicari, email valid, email terkirim, dan kartu yang masuk ke CRM.
- **Settings**: Form input API Key Outscraper & Reoon di `/settings/integrations`.

---

## 4. Tahapan Pengerjaan (Milestones)

| Fase | Fokus | Deliverables |
| :--- | :--- | :--- |
| **Fase 1** | Basis Data & Integrasi API | Migrasi Prisma schema, modul client `outscraper.ts` & `reoon.ts`. |
| **Fase 2** | AI Generator & Pengiriman | Modul `outreach-ai.ts`, antrean pengiriman, dan integrasi auto-create Kanban card. |
| **Fase 3** | Frontend & Dasbor Outreach | Halaman `/outreach`, tabel staging, modal AI preview, dan integrasi settings. |
| **Fase 4** | Pengujian & Verifikasi | Pengujian end-to-end (Scraping -> Verification -> AI Draft -> Send -> Kanban Sync). |

---

*Catatan: Dokumen ini siap dijadikan acuan saat implementasi diperintahkan.*
