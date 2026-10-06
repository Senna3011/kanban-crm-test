'use client';

import { useState } from 'react';
import Link from 'next/link';

export default function GuidePage() {
  const [activeTab, setActiveTab] = useState<'outreach' | 'crm' | 'setup'>('outreach');

  return (
    <div className="max-w-5xl space-y-6 pb-12 mx-auto">
      {/* Header */}
      <div className="flex items-start justify-between gap-4 border-b border-slate-200 pb-4">
        <div>
          <h1 className="text-xl sm:text-2xl font-bold text-slate-900 tracking-tight">
            📖 Pusat Panduan Sistem (Web Documentation)
          </h1>
          <p className="text-xs sm:text-sm text-slate-500 mt-1">
            Panduan operasional lengkap untuk Mesin Cold Outreach B2B, Manajemen Pipeline Kanban CRM, dan Konfigurasi Mailbox.
          </p>
        </div>
        <Link
          href="/dashboard"
          className="text-xs sm:text-sm text-primary-700 hover:text-primary-900 bg-primary-50 px-3 py-1.5 rounded-xl font-semibold shrink-0 border border-primary-200 transition-colors"
        >
          ← Kembali ke Board
        </Link>
      </div>

      {/* Navigation Tabs */}
      <div className="flex items-center gap-2 border-b border-slate-200">
        <button
          onClick={() => setActiveTab('outreach')}
          className={`px-4 py-2.5 text-xs sm:text-sm font-bold transition-all border-b-2 flex items-center gap-2 ${
            activeTab === 'outreach'
              ? 'border-indigo-600 text-indigo-700 bg-indigo-50/50 rounded-t-xl'
              : 'border-transparent text-slate-500 hover:text-slate-800'
          }`}
        >
          <span>🚀</span>
          <span>1. Mesin Cold Outreach & Deliverability</span>
        </button>
        <button
          onClick={() => setActiveTab('crm')}
          className={`px-4 py-2.5 text-xs sm:text-sm font-bold transition-all border-b-2 flex items-center gap-2 ${
            activeTab === 'crm'
              ? 'border-indigo-600 text-indigo-700 bg-indigo-50/50 rounded-t-xl'
              : 'border-transparent text-slate-500 hover:text-slate-800'
          }`}
        >
          <span>📋</span>
          <span>2. Kanban CRM & Sales Pipeline</span>
        </button>
        <button
          onClick={() => setActiveTab('setup')}
          className={`px-4 py-2.5 text-xs sm:text-sm font-bold transition-all border-b-2 flex items-center gap-2 ${
            activeTab === 'setup'
              ? 'border-indigo-600 text-indigo-700 bg-indigo-50/50 rounded-t-xl'
              : 'border-transparent text-slate-500 hover:text-slate-800'
          }`}
        >
          <span>⚙️</span>
          <span>3. Setup & Integrasi Mailbox</span>
        </button>
      </div>

      {/* ========================================================================= */}
      {/* TAB 1: OUTREACH ENGINE GUIDE                                              */}
      {/* ========================================================================= */}
      {activeTab === 'outreach' && (
        <div className="space-y-6 animate-in fade-in">
          {/* Section 1: Multi-Sender Pool & Warmup */}
          <div className="bg-white rounded-2xl border border-slate-200/80 p-5 sm:p-6 shadow-xs space-y-4">
            <div className="flex items-center gap-3">
              <span className="w-8 h-8 rounded-xl bg-indigo-100 text-indigo-700 font-bold text-sm flex items-center justify-center shrink-0">
                1
              </span>
              <div>
                <h2 className="text-base sm:text-lg font-bold text-slate-900">
                  Multi-Sender Mailbox Pool & Automated Warmup
                </h2>
                <p className="text-xs text-slate-500">
                  Rotasi pengiriman otomatis tanpa ganti akun manual untuk menjaga reputasi domain.
                </p>
              </div>
            </div>

            <div className="pl-11 space-y-3 text-xs sm:text-sm text-slate-600 leading-relaxed">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3 pt-1">
                <div className="p-4 rounded-xl border border-indigo-100 bg-indigo-50/40 space-y-2">
                  <h3 className="font-bold text-slate-900 text-xs uppercase tracking-wide text-indigo-900 flex items-center gap-1.5">
                    <span>📬</span> Multi-Sender Pool (Round-Robin)
                  </h3>
                  <p className="text-xs text-slate-600">
                    Kaitkan beberapa akun email ke dalam satu kampanye. Sistem di balik layar secara otomatis memilih akun yang paling longgar (<em>least-loaded</em>) dan belum mencapai kuota harian.
                  </p>
                </div>
                <div className="p-4 rounded-xl border border-amber-100 bg-amber-50/40 space-y-2">
                  <h3 className="font-bold text-slate-900 text-xs uppercase tracking-wide text-amber-900 flex items-center gap-1.5">
                    <span>📈</span> Automated Warmup (+5/hari)
                  </h3>
                  <p className="text-xs text-slate-600">
                    Mailbox baru otomatis dinaikkan limit kirimnya setiap tengah malam (contoh: Hari 1 kirim 10, Hari 2 kirim 15) hingga mencapai batas maksimal harian tanpa memicu alarm spam.
                  </p>
                </div>
              </div>

              <div className="p-3.5 bg-slate-50 border border-slate-200 rounded-xl text-xs space-y-1.5">
                <p className="font-semibold text-slate-800">🛡️ Perlindungan Reputasi & Bounce Otomatis:</p>
                <ul className="list-disc list-inside space-y-1 text-slate-600">
                  <li><strong className="text-emerald-700">HEALTHY:</strong> Mailbox beroperasi optimal tanpa bounce.</li>
                  <li><strong className="text-amber-700">WARNING:</strong> Terdeteksi 3-4 bounce email.</li>
                  <li><strong className="text-rose-700">PAUSED_BOUNCE:</strong> Terdeteksi 5 bounce beruntun $\rightarrow$ Mailbox otomatis dijeda dari rotasi agar domain tidak diblokir.</li>
                </ul>
              </div>
            </div>
          </div>

          {/* Section 2: Scraping & Verification */}
          <div className="bg-white rounded-2xl border border-slate-200/80 p-5 sm:p-6 shadow-xs space-y-4">
            <div className="flex items-center gap-3">
              <span className="w-8 h-8 rounded-xl bg-indigo-100 text-indigo-700 font-bold text-sm flex items-center justify-center shrink-0">
                2
              </span>
              <div>
                <h2 className="text-base sm:text-lg font-bold text-slate-900">
                  Lead Discovery & Multi-Tier Email Verification
                </h2>
                <p className="text-xs text-slate-500">
                  Pencarian pengambil keputusan B2B dan verifikasi 4-lapis dengan Reoon API.
                </p>
              </div>
            </div>

            <div className="pl-11 space-y-3 text-xs sm:text-sm text-slate-600 leading-relaxed">
              <ol className="list-decimal list-inside space-y-2">
                <li>
                  <strong>Buat Campaign Baru:</strong> Buka <Link href="/dashboard/outreach/new" className="text-indigo-600 underline font-semibold">Outreach &gt; Create Campaign</Link>. Tentukan Role (e.g. <em>CTO, Founder</em>), Lokasi (e.g. <em>United States, Singapore</em>), dan Industri target.
                </li>
                <li>
                  <strong>Sourcing Prospek:</strong> Sistem mencari kontak profil LinkedIn & data perusahaan dari Google Maps/Outscraper.
                </li>
                <li>
                  <strong>Verifikasi Deliverability:</strong> Klik tombol <em>Verify Mailboxes</em>. Sistem memvalidasi kotak surat via Reoon API:
                  <ul className="pl-6 pt-1 space-y-1 list-disc">
                    <li><span className="text-emerald-700 font-bold">SAFE:</span> Valid 100%, siap untuk pengiriman cold email.</li>
                    <li><span className="text-amber-700 font-bold">RISKY / CATCH-ALL:</span> Server menerima semua email, disarankan dicek manual.</li>
                    <li><span className="text-rose-700 font-bold">INVALID:</span> Kotak surat mati, otomatis dikeluarkan dari pengiriman.</li>
                  </ul>
                </li>
              </ol>
            </div>
          </div>

          {/* Section 3: AI Pitch & Sequential Reviewer */}
          <div className="bg-white rounded-2xl border border-slate-200/80 p-5 sm:p-6 shadow-xs space-y-4">
            <div className="flex items-center gap-3">
              <span className="w-8 h-8 rounded-xl bg-indigo-100 text-indigo-700 font-bold text-sm flex items-center justify-center shrink-0">
                3
              </span>
              <div>
                <h2 className="text-base sm:text-lg font-bold text-slate-900">
                  AI Copywriting, Sequential Reviewer & Dispatch
                </h2>
                <p className="text-xs text-slate-500">
                  Penyusunan pitch 1-on-1 dengan AI dan kurasi sebelum pengiriman.
                </p>
              </div>
            </div>

            <div className="pl-11 space-y-3 text-xs sm:text-sm text-slate-600 leading-relaxed">
              <ul className="space-y-2 list-disc list-inside">
                <li>
                  <strong>AI Brand Offer Summarizer:</strong> Masukkan website produk Anda $\rightarrow$ AI membaca keunggulan penawaran dan menyusun email yang disesuaikan untuk tiap profil prospek.
                </li>
                <li>
                  <strong>Sequential Draft Reviewer:</strong> Klik nama lead untuk membuka modal kurasi. Anda dapat mengedit subjek, isi email, menekan <em>Regenerate</em>, dan berpindah antar-prospek menggunakan tombol <strong>Previous (←)</strong> dan <strong>Next (→)</strong>.
                </li>
                <li>
                  <strong>Pengiriman Terkendali (Anti-Spam Jitter):</strong> Setiap pengiriman batch disisipi jeda acak 3–9 detik dan header RFC 8058 <em>One-Click Unsubscribe</em>.
                </li>
                <li>
                  <strong>Auto-Convert on Reply:</strong> Saat prospek membalas email, sistem IMAP otomatis mendeteksi balasan dan mengubah lead menjadi kartu baru di Kanban CRM!
                </li>
              </ul>
            </div>
          </div>
        </div>
      )}

      {/* ========================================================================= */}
      {/* TAB 2: KANBAN CRM GUIDE                                                   */}
      {/* ========================================================================= */}
      {activeTab === 'crm' && (
        <div className="space-y-6 animate-in fade-in">
          {/* Section 1: Pipeline & Deal Value */}
          <div className="bg-white rounded-2xl border border-slate-200/80 p-5 sm:p-6 shadow-xs space-y-4">
            <div className="flex items-center gap-3">
              <span className="w-8 h-8 rounded-xl bg-primary-100 text-primary-700 font-bold text-sm flex items-center justify-center shrink-0">
                1
              </span>
              <div>
                <h2 className="text-base sm:text-lg font-bold text-slate-900">
                  Struktur Pipeline & Deal Value Forecasting
                </h2>
                <p className="text-xs text-slate-500">
                  Pengelolaan tahapan prospek penjualan dan pemantauan proyeksi omset.
                </p>
              </div>
            </div>

            <div className="pl-11 space-y-3 text-xs sm:text-sm text-slate-600 leading-relaxed">
              <p>
                Setiap kartu di <Link href="/dashboard" className="text-primary-600 underline font-semibold">Kanban Board (📋)</Link> merepresentasikan satu peluang bisnis atau percakapan klien.
              </p>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-1">
                <div className="p-3.5 bg-slate-50 rounded-xl border border-slate-200">
                  <h4 className="font-bold text-slate-800 text-xs">💰 Deal Value & Currency</h4>
                  <p className="text-xs text-slate-600 mt-1">
                    Catat estimasi nilai transaksi (misal: <code>$5,000</code> atau <code>Rp 75.000.000</code>). Nilai seluruh kartu diakumulasikan otomatis pada header setiap kolom stage.
                  </p>
                </div>
                <div className="p-3.5 bg-slate-50 rounded-xl border border-slate-200">
                  <h4 className="font-bold text-slate-800 text-xs">🎯 Contact Roles</h4>
                  <p className="text-xs text-slate-600 mt-1">
                    Klasifikasikan kontak prospek sebagai <em>Decision Maker, Champion, Influencer, Gatekeeper,</em> atau <em>Buyer</em> untuk strategi negosiasi tim sales.
                  </p>
                </div>
              </div>
            </div>
          </div>

          {/* Section 2: Two-Way Sync & AI Follow-Up */}
          <div className="bg-white rounded-2xl border border-slate-200/80 p-5 sm:p-6 shadow-xs space-y-4">
            <div className="flex items-center gap-3">
              <span className="w-8 h-8 rounded-xl bg-primary-100 text-primary-700 font-bold text-sm flex items-center justify-center shrink-0">
                2
              </span>
              <div>
                <h2 className="text-base sm:text-lg font-bold text-slate-900">
                  Two-Way Communication & AI Follow-Up Drafts
                </h2>
                <p className="text-xs text-slate-500">
                  Sinkronisasi email dua arah dan penulisan draf balasan instan.
                </p>
              </div>
            </div>

            <div className="pl-11 space-y-3 text-xs sm:text-sm text-slate-600 leading-relaxed">
              <ul className="space-y-2 list-disc list-inside">
                <li>
                  <strong>Buka Card Detail:</strong> Klik kartu apa saja untuk melihat riwayat percakapan lengkap (*Activity Timeline*) dan detail pengirim.
                </li>
                <li>
                  <strong>AI Inbound Classification:</strong> Email masuk otomatis dikategorikan ke dalam level ketertarikan (<em>High, Medium, Low Interest</em>) dan disarankan pemindahan stage yang tepat.
                </li>
                <li>
                  <strong>Kirim Balasan Langsung:</strong> Tulis balasan atau gunakan draf AI langsung dari panel detail kartu tanpa perlu membuka webmail terpisah.
                </li>
                <li>
                  <strong>Follow-Up SLA Reminder:</strong> Kartu di stage Follow Up yang belum membalas akan menampilkan badge peringatan <em>Overdue</em> otomatis.
                </li>
              </ul>
            </div>
          </div>
        </div>
      )}

      {/* ========================================================================= */}
      {/* TAB 3: SETUP & MAILBOX INTEGRATION                                        */}
      {/* ========================================================================= */}
      {activeTab === 'setup' && (
        <div className="space-y-6 animate-in fade-in">
          <div className="bg-white rounded-2xl border border-slate-200/80 p-5 sm:p-6 shadow-xs space-y-4">
            <div className="flex items-center gap-3">
              <span className="w-8 h-8 rounded-xl bg-emerald-100 text-emerald-700 font-bold text-sm flex items-center justify-center shrink-0">
                1
              </span>
              <div>
                <h2 className="text-base sm:text-lg font-bold text-slate-900">
                  Koneksi Mailbox Inbound & Outbound (Zoho, Gmail, Outlook)
                </h2>
                <p className="text-xs text-slate-500">
                  Konfigurasi kredensial IMAP untuk penerimaan email dan SMTP untuk pengiriman.
                </p>
              </div>
            </div>

            <div className="pl-11 space-y-4 text-xs sm:text-sm text-slate-600 leading-relaxed">
              <p>
                Buka menu <Link href="/dashboard/settings" className="text-primary-600 underline font-semibold">Settings (⚙️)</Link> untuk menghubungkan akun email utama CRM Anda.
              </p>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                <div className="p-4 rounded-xl border border-primary-200 bg-primary-50/40 space-y-2">
                  <span className="inline-block px-2 py-0.5 text-[11px] font-semibold bg-primary-100 text-primary-800 rounded-full">
                    Zoho Mail Configuration
                  </span>
                  <ul className="text-xs text-slate-700 space-y-1 list-disc list-inside">
                    <li><strong>IMAP Host:</strong> imap.zoho.com (Port: 993, SSL)</li>
                    <li><strong>SMTP Host:</strong> smtp.zoho.com (Port: 465, SSL)</li>
                    <li><strong>Username:</strong> email@domain.com</li>
                    <li><strong>Password:</strong> App Password dari Zoho Security Settings</li>
                  </ul>
                </div>

                <div className="p-4 rounded-xl border border-slate-200 bg-slate-50 space-y-2">
                  <span className="inline-block px-2 py-0.5 text-[11px] font-semibold bg-slate-200 text-slate-700 rounded-full">
                    Google Workspace / Gmail
                  </span>
                  <ul className="text-xs text-slate-700 space-y-1 list-disc list-inside">
                    <li><strong>IMAP Host:</strong> imap.gmail.com (Port: 993, SSL)</li>
                    <li><strong>SMTP Host:</strong> smtp.gmail.com (Port: 465, SSL)</li>
                    <li><strong>Password:</strong> Gunakan 16-digit Google App Password</li>
                  </ul>
                </div>
              </div>

              <div className="p-3.5 bg-emerald-50 border border-emerald-200 rounded-xl text-xs text-emerald-800">
                💡 <strong>Tips Verifikasi:</strong> Selalu klik tombol <em>Test Connection / Test SMTP Handshake</em> sebelum menyimpan konfigurasi untuk memastikan kredensial valid dan bebas error koneksi.
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
