'use client';

import Link from 'next/link';

export default function GuidePage() {
  return (
    <div className="max-w-4xl space-y-6 pb-12">
      {/* Header */}
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-xl sm:text-2xl font-bold text-slate-900">Panduan Penggunaan Sistem</h1>
          <p className="text-xs sm:text-sm text-slate-500 mt-1">
            Petunjuk alur kerja Kanban CRM mulai dari login, koneksi Zoho Mail, hingga penerimaan pesan.
          </p>
        </div>
        <Link
          href="/dashboard"
          className="text-xs sm:text-sm text-primary-700 hover:underline font-medium shrink-0"
        >
          ← Kembali ke Board
        </Link>
      </div>

      {/* Step 1 */}
      <div className="bg-white rounded-2xl border border-slate-200/80 p-5 sm:p-6 shadow-sm space-y-3">
        <div className="flex items-center gap-3">
          <span className="w-8 h-8 rounded-xl bg-primary-100 text-primary-700 font-bold text-sm flex items-center justify-center shrink-0">
            1
          </span>
          <h2 className="text-base sm:text-lg font-bold text-slate-800">Login ke Aplikasi</h2>
        </div>
        <div className="pl-11 space-y-2 text-xs sm:text-sm text-slate-600 leading-relaxed">
          <p>
            Buka tautan website pada browser handphone atau desktop.
          </p>
          <div className="bg-slate-50 border border-slate-200 rounded-xl p-3 font-mono text-xs space-y-1">
            <p><strong className="text-slate-700">Akun Default:</strong> admin@jetdigitalpro.com</p>
            <p><strong className="text-slate-700">Password:</strong> jdp123</p>
          </div>
          <p>
            Setelah klik <strong>Sign in</strong>, Anda akan langsung diarahkan ke tampilan <strong>Main Board</strong>.
          </p>
        </div>
      </div>

      {/* Step 2 */}
      <div className="bg-white rounded-2xl border border-slate-200/80 p-5 sm:p-6 shadow-sm space-y-3">
        <div className="flex items-center gap-3">
          <span className="w-8 h-8 rounded-xl bg-primary-100 text-primary-700 font-bold text-sm flex items-center justify-center shrink-0">
            2
          </span>
          <h2 className="text-base sm:text-lg font-bold text-slate-800">Menghubungkan Akun Zoho Mail</h2>
        </div>
        <div className="pl-11 space-y-3 text-xs sm:text-sm text-slate-600 leading-relaxed">
          <p>
            Masuk ke menu <Link href="/dashboard/settings" className="text-primary-600 underline font-medium">Settings (⚙️)</Link> melalui sidebar atau menu hamburger di HP.
          </p>
          
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3 pt-1">
            <div className="p-4 rounded-xl border border-blue-200 bg-blue-50/50 space-y-2">
              <span className="inline-block px-2 py-0.5 text-[11px] font-semibold bg-blue-100 text-blue-800 rounded-full">
                Opsi A — Disarankan
              </span>
              <h3 className="font-semibold text-slate-900 text-sm">Zoho One-Click OAuth</h3>
              <p className="text-xs text-slate-600">
                Pilih papan target (misal: <em>Main Board</em>), klik tombol <strong>Connect with Zoho Mail</strong>, lalu setujui izin akses akun Zoho Anda.
              </p>
            </div>

            <div className="p-4 rounded-xl border border-slate-200 bg-slate-50 space-y-2">
              <span className="inline-block px-2 py-0.5 text-[11px] font-semibold bg-slate-200 text-slate-700 rounded-full">
                Opsi B
              </span>
              <h3 className="font-semibold text-slate-900 text-sm">Manual IMAP / SMTP</h3>
              <p className="text-xs text-slate-600">
                Isi IMAP/SMTP User dengan email Zoho dan Password akun / App Password Zoho. Klik <strong>Test All</strong> lalu <strong>Save Configuration</strong>.
              </p>
            </div>
          </div>
        </div>
      </div>

      {/* Step 3 */}
      <div className="bg-white rounded-2xl border border-slate-200/80 p-5 sm:p-6 shadow-sm space-y-3">
        <div className="flex items-center gap-3">
          <span className="w-8 h-8 rounded-xl bg-primary-100 text-primary-700 font-bold text-sm flex items-center justify-center shrink-0">
            3
          </span>
          <h2 className="text-base sm:text-lg font-bold text-slate-800">Menguji Pesan Masuk ke Board</h2>
        </div>
        <div className="pl-11 space-y-2 text-xs sm:text-sm text-slate-600 leading-relaxed">
          <ol className="list-decimal list-inside space-y-1.5">
            <li>
              Kirim email pengujian dari <strong>alamat email eksternal</strong> (seperti Gmail pribadi) ke alamat email Zoho yang baru saja dikonfigurasi.
            </li>
            <li>
              Buka menu <Link href="/dashboard" className="text-primary-600 underline font-medium">Board (📋)</Link>.
            </li>
            <li>
              Sistem akan otomatis menarik email setiap 2 menit, atau Anda dapat menekan tombol <strong>Sync</strong> di kanan atas untuk penarikan instan.
            </li>
            <li>
              Pesan baru akan muncul sebagai kartu di kolom <strong>General</strong> atau langsung diklasifikasi oleh AI ke kolom <strong>Leads</strong>.
            </li>
          </ol>
        </div>
      </div>

      {/* Step 4 */}
      <div className="bg-white rounded-2xl border border-slate-200/80 p-5 sm:p-6 shadow-sm space-y-3">
        <div className="flex items-center gap-3">
          <span className="w-8 h-8 rounded-xl bg-primary-100 text-primary-700 font-bold text-sm flex items-center justify-center shrink-0">
            4
          </span>
          <h2 className="text-base sm:text-lg font-bold text-slate-800">Membaca Detail & Mengirim Balasan AI</h2>
        </div>
        <div className="pl-11 space-y-2 text-xs sm:text-sm text-slate-600 leading-relaxed">
          <ul className="list-disc list-inside space-y-1.5">
            <li>
              <strong>Buka Kartu:</strong> Klik kartu pesan untuk membuka pop-up panel detail dan riwayat percakapan.
            </li>
            <li>
              <strong>Analisis AI:</strong> AI otomatis menganalisis pesan, minat prospek, dan menyusun draf balasan resmi.
            </li>
            <li>
              <strong>Kirim Balasan:</strong> Sesuaikan draf pesan di bagian <em>Reply</em> lalu klik <strong>Send Reply</strong>.
            </li>
            <li>
              <strong>Perpindahan Otomatis:</strong> Kartu akan otomatis bergeser ke tahapan <strong>Follow up 1</strong> beserta jadwal tindak lanjut berikutnya.
            </li>
          </ul>
        </div>
      </div>
    </div>
  );
}
