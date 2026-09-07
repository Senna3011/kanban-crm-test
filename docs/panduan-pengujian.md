# Panduan Pengujian Sistem Kanban CRM (Untuk Mentor / Penguji)

Dokumen ini disusun untuk memudahkan pengujian seluruh fitur utama sistem Kanban CRM Jet Digital Pro, mulai dari menyalakan aplikasi, membaca email masuk secara otomatis, hingga membalas pesan prospek dengan bantuan AI.

---

## 1. Menyalakan Sistem (Cukup 1 Perintah)

Pastikan Docker (Database & Antrean) sudah aktif di komputer, lalu buka terminal di folder proyek dan jalankan:

```powershell
npm run dev:all
```

> **Catatan**: Perintah ini otomatis menyalakan **tampilan web** sekaligus **robot penarik email (worker)** dalam satu jendela terminal tanpa perlu membuka banyak tab.

---

## 2. Masuk ke Aplikasi (Login)

1. Buka peramban (browser) dan buka tautan:
   **[http://localhost:3099](http://localhost:3099)**
2. Masukkan akun admin default:
   - **Email**: `admin@jetdigitalpro.com`
   - **Password**: `jdp123`
3. Klik tombol **Sign In**. Anda akan langsung diarahkan ke halaman utama **Kanban Board**.

---

## 3. Skenario Pengujian Fitur Utama

### Skenario A: Email Masuk Otomatis Menjadi Kartu Kanban
1. Buka aplikasi email pribadi Anda (misal: Gmail atau Outlook di HP/laptop).
2. Kirim pesan baru ke alamat email kantor yang sudah terhubung (contoh: `alzmann30@gmail.com`).
   - **Subjek**: *Tanya Biaya Layanan Digital Marketing*
   - **Isi Pesan**: *Halo tim Jet Digital Pro, saya tertarik dengan paket promosi bisnis Anda. Apakah bisa dikirimkan proposal penawaran harga lengkap? Terima kasih.*
3. Kembali ke aplikasi Kanban CRM di peramban:
   - Sistem otomatis memeriksa email baru setiap **2 menit**.
   - Jika ingin kartu langsung muncul seketika tanpa menunggu, klik tombol **Sync** (ikon putar) di pojok kanan atas papan Kanban.
4. **Hasil yang Diamati**:
   - Email baru otomatis muncul sebagai **kartu pada kolom "General"**.
   - Terdapat nama pengirim, subjek email, dan tanda status pesan belum dibaca (*unread*).

---

### Skenario B: Membaca Pesan & Asisten AI (Klasifikasi & Draft Balasan)
1. Klik pada salah satu kartu email di papan Kanban.
2. Jendela **Detail Kartu** akan terbuka di sisi kanan:
   - **Isi Percakapan**: Menampilkan teks email yang dikirim oleh calon klien secara utuh.
   - **Klasifikasi AI**: Sistem otomatis mengelompokkan pesan (misal: kategori minat prospek, tingkat urgensi, atau ringkasan kebutuhan).
   - **Draft Balasan Otomatis (AI Draft)**: Di area bawah, asisten AI sudah menyiapkan usulan draf balasan profesional yang relevan dengan pertanyaan calon klien.
3. Anda dapat langsung mengedit isi balasan tersebut, lalu klik **Send Reply**. Balasan akan terkirim langsung ke email pengirim.

---

### Skenario C: Memindahkan Tahapan Prospek (Drag and Drop)
1. Klik dan tahan kartu pada papan Kanban.
2. Geser kartu dari kolom **General** ke kolom proses berikutnya sesuai progres komunikasi:
   - **Follow up 1 / 2 / 3**: Untuk prospek yang sedang dalam tahap negosiasi/menunggu respons.
   - **Success / Closing**: Untuk prospek yang berhasil sepakat bekerjasama.
   - **Fail**: Untuk prospek yang dibatalkan.
3. Perubahan posisi tersimpan otomatis dan kartu lain dapat dipindahkan dengan fleksibel.

---

### Skenario D: Mengatur & Menghubungkan Akun Email Baru (Opsional)
Jika ingin mencoba menghubungkan alamat email lain:
1. Klik menu **Settings** pada bilah navigasi atas.
2. Terdapat 2 opsi integrasi email:
   - **Zoho Mail (One-Click)**: Pilih papan tujuan, masukkan alamat email Zoho, lalu klik tombol **Login with Zoho**. Anda akan diarahkan ke halaman resmi Zoho untuk konfirmasi login tanpa perlu memasukkan password di dalam CRM.
   - **Email Manual (Gmail / Mail Server Lain)**: Masukkan nama email, server IMAP (`imap.gmail.com`), server SMTP (`smtp.gmail.com`), port, dan App Password.
3. Klik tombol **Test IMAP** dan **Test SMTP** untuk memastikan koneksi pengiriman dan penerimaan surat berfungsi normal sebelum menekan tombol simpan.

---

## 4. Langkah Selesai Uji Coba
- **Keluar Aplikasi**: Klik tombol **Logout** di pojok kanan atas navbar.
- **Mematikan Server**: Tekan kombinasi tombol `Ctrl + C` di jendela terminal yang menjalankan `npm run dev:all`.
