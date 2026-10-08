<!-- translation-of: docs/user/13-YourData.md source-hash: 268072de3b1fe04f -->
# 13 — Data Anda: mencadangkan dan memulihkan

<!-- languages -->
[English](../13-YourData.md) · [Deutsch](../de/13-YourData.md) · [Español](../es/13-YourData.md) · [Français](../fr/13-YourData.md) · **Bahasa Indonesia** · [日本語](../ja/13-YourData.md) · [한국어](../ko/13-YourData.md) · [Português (Brasil)](../pt-BR/13-YourData.md)
<!-- /languages -->

ForkBuild tidak memiliki akun dan tidak ada server yang menyimpan pekerjaan
Anda. Semua yang disimpannya berada di browser ini, di perangkat ini:
dokumen, identitas beserta kunci privatnya, struktur, publikasi, rekan dan
teman, riwayat obrolan, serta pengaturan. **Menghapus data situs ini di
browser akan menghapus semuanya untuk selamanya**, begitu pula mencopot
pemasangan browser atau kehilangan perangkat.

Halaman **Data Anda** (**Data Anda** di menu atas) adalah tempat Anda
menyimpan salinannya.

## Di perangkat ini

Bagian pertama menampilkan apa yang tersimpan, per jenis, dan berapa
banyak ruang yang dipakainya. Angkanya adalah entri penyimpanan, bukan
dokumen: misalnya, satu dokumen tersimpan dan daftar dokumen adalah dua
entri.

Jika tertulis **Browser dapat menghapus data ini saat ruang disk hampir
penuh.**, klik **Minta Browser untuk Menyimpannya**. Browser biasanya
setuju setelah Anda menandai situs ini, memasangnya, atau sering
memakainya. Ini hanya melindungi dari browser yang merapikan data dengan
sendirinya: menghapus data situs tetap menghapus semuanya.

## Mencadangkan

1. Tentukan **frasa sandi cadangan** (minimal 8 karakter) dan ketik dua
   kali.
2. Biarkan **Sertakan bangunan yang diunduh dari orang lain** tidak
   dicentang kecuali Anda menginginkannya: ukurannya bisa besar dan
   biasanya dapat diambil lagi. Publikasi Anda sendiri selalu disertakan.
3. Klik **Cadangkan ke File**. Browser mengunduh file
   `forkbuild-backup-<tanggal>.forkbuild-backup`.

File itu berisi semua yang ditampilkan halaman, dienkripsi dengan frasa
sandi cadangan Anda. File itu aman disimpan di penyimpanan cloud atau di
flashdisk, tetapi **tidak ada cara untuk membukanya tanpa frasa sandi
itu**, jadi simpan keduanya di tempat yang tidak akan hilang. Frasa sandi
cadangan terpisah dari frasa sandi identitas Anda: setiap identitas di
dalamnya tetap dilindungi frasa sandinya sendiri.

Cadangan tidak mencatat identitas mana yang sedang masuk. Setelah
memulihkan, Anda masuk lagi.

Selain **Cadangkan ke File**, bagian yang sama dapat:

- **Bagikan Cadangan…** (ponsel, tablet, dan beberapa komputer): membuka
  lembar berbagi perangkat Anda, sehingga Anda dapat menyimpan file ke
  drive cloud, mengirimnya lewat email, atau memindahkannya ke perangkat
  lain. Jika lembar berbagi tidak terbuka pada ketukan pertama
  (enkripsinya lebih lama daripada yang diizinkan browser), ketuk
  **Bagikan Cadangan** lagi: cadangannya sudah siap dan langsung
  dikirim.
- **Cadangkan ke "folder"**: setelah Anda memilih folder cadangan (di
  bawah).

**Ingat kunci cadangan di perangkat ini** muncul begitu Anda mengetik
frasa sandi. Centang untuk membuat cadangan berikutnya tanpa mengetik
frasa sandi: tombol sekali klik dan pencadangan otomatis di bawah
memakainya. ForkBuild tidak menyimpan frasa sandinya, hanya kunci yang
dibuat darinya, yang oleh browser hanya boleh dipakai ForkBuild untuk
membuat cadangan dan tidak pernah ditunjukkan kepada siapa pun, dan yang
tidak dapat membuka cadangan. Cadangan yang dibuat dengan kunci itu tetap
dapat dibuka dengan frasa sandi Anda. **Lupakan Kunci Cadangan**
menghapusnya.

## Pengingat

Jika perangkat ini sudah lama tidak dicadangkan, sebuah bilah di bawah
menu di setiap halaman memberi tahu Anda, dengan **Cadangkan Sekarang**
dan **Ingatkan Saya Seminggu Lagi**:

- Bilah itu pertama kali muncul seminggu setelah browser ini mulai
  menyimpan pekerjaan Anda (dokumen, identitas, struktur, rekan, atau
  obrolan), jika Anda belum pernah mencadangkan.
- Setelah itu, bilah muncul saat cadangan terakhir lebih lama daripada
  yang Anda pilih di **Pengingat dan pencadangan otomatis → Ingatkan saya
  untuk mencadangkan**: **Setiap minggu**, **Setiap 2 minggu**,
  **Setiap bulan** (bawaan), **Setiap 3 bulan**, atau **Tidak pernah**.
- **Cadangkan Sekarang** mencadangkan ke folder cadangan Anda dalam satu
  klik jika Anda sudah menyiapkannya dengan kunci yang diingat; jika
  tidak, tombol itu membuka halaman ini.

Bagian yang sama menunjukkan kapan dan ke mana cadangan terakhir dibuat.

## Mencadangkan ke folder

Di Chrome dan Edge di komputer, **Pilih Folder…** memungkinkan Anda
memilih folder untuk cadangan. Pilih folder yang disinkronkan oleh
penyimpanan cloud Anda (Dropbox, OneDrive, iCloud Drive, Google Drive)
atau drive USB, dan setiap cadangan keluar dari perangkat ini tanpa Anda
perlu memindahkan file. Cadangan setiap hari adalah satu file,
`forkbuild-backup-<tanggal>.forkbuild-backup`; cadangan kedua di hari
yang sama menggantikan file hari itu, dan ForkBuild menyimpan sepuluh
cadangan terbarunya sendiri di sana, tanpa pernah menyentuh isi folder
yang lain.

Browser bertanya apakah ForkBuild boleh menyimpan di folder itu pada saat
pertama, dan mungkin bertanya lagi pada kunjungan berikutnya. **Berhenti
Menggunakan Folder Ini** melupakan folder itu; cadangan yang sudah ada di
sana tetap ada.

**Cadangkan ke folder secara otomatis sekali sehari selama ForkBuild
terbuka** memerlukan folder dan kunci yang diingat. ForkBuild lalu
memeriksa satu menit setelah dibuka, dan setiap jam, lalu mencadangkan
jika cadangan terakhir sudah berumur satu hari. ForkBuild tidak pernah
meminta izin dengan sendirinya: jika browser ingin bertanya lagi,
pencadangan otomatis menunggu sampai Anda sendiri mencadangkan ke folder
itu sekali. Pencadangan otomatis yang gagal ditampilkan di halaman ini.

Browser lain tidak dapat menyimpan ke folder. Gunakan **Bagikan
Cadangan…** di sana, atau unduh file dan pindahkan sendiri.

## Memulihkan

Tutup ForkBuild di tab lain terlebih dahulu: tab yang dibiarkan terbuka
dapat menulis kembali datanya yang lebih lama.

1. Di **Pulihkan**, pilih file cadangan dan masukkan frasa sandinya, lalu
   klik **Buka Cadangan**. Frasa sandi yang salah ditolak dan tidak ada
   yang berubah. ForkBuild menampilkan kapan cadangan itu dibuat dan apa
   isinya.
2. Pilih cara memulihkan:
   - **Tambahkan apa yang tidak dimiliki perangkat ini** (bawaan): semua
     isi cadangan yang tidak ada di perangkat ini ditambahkan. Jika
     keduanya memiliki sesuatu, seperti dokumen atau pengaturan yang
     sama, versi perangkat ini yang disimpan.
   - **Ganti semua yang ada di perangkat ini dengan cadangan**: menghapus
     dulu apa yang disimpan ForkBuild di sini, lalu memulihkan cadangan
     persis seperti adanya. Centang konfirmasinya untuk mengaktifkannya.
3. Klik **Pulihkan**. Halaman dimuat ulang setelah selesai. Perangkat yang
   dipulihkan dianggap sudah dicadangkan pada tanggal cadangan itu dibuat.

Cadangan yang dibuat oleh versi ForkBuild yang lebih baru tidak dapat
dibuka oleh versi yang lebih lama; perbarui salinan ini terlebih dahulu.
Apa pun di dalam cadangan yang tidak dikenali versi ini dilewati, dan
hasilnya menyebutkan berapa banyak.

## Ekspor yang lebih kecil

Untuk memindahkan satu jenis saja, atau membagikannya, gunakan ekspor di
halamannya masing-masing:

| Apa | Ekspor | Impor |
|---|---|---|
| Satu dokumen | **Ekspor** di bilah alat Editor | **Impor** di bilah alat Editor |
| Semua dokumen tersimpan | **Ekspor Semua Dokumen** di bagian bawah menu **Terbaru** di Editor | **Impor** di bilah alat Editor |
| Satu struktur | **Ekspor Cetak Biru** di menu **⋮** pada kartunya | **Impor Cetak Biru** di samping **Struktur Saya** |
| Semua struktur | **Ekspor Semua** di samping **Struktur Saya** | **Impor Cetak Biru** di samping **Struktur Saya** |
| Satu identitas | **Ekspor** di **Identitas Saya** | **Impor Identitas** di **Identitas Saya** |

Mengimpor semua dokumen mengembalikan dokumen yang tidak dimiliki
perangkat ini, membiarkan yang sudah ada tanpa perubahan, dan menyimpan
salinan di samping dokumen yang ada dalam versi berbeda. Mengimpor semua
struktur melewati desain yang sudah ada di Struktur Saya. Identitas yang
diekspor juga membawa pencabutan, pengganti, dan otorisasi perangkatnya,
sehingga identitas yang dicabut kembali dalam keadaan dicabut.

Riwayat obrolan, teman, orang yang diikuti, dan pengaturan hanya ikut
pindah dengan cadangan penuh.

## Publikasi Anda

Karya yang Anda **Terbitkan** hanya disimpan di perangkat ini, sampai Anda
mendistribusikannya (lihat
[Penerbitan & Fork](04-PublishingAndForking.md)).
Kartunya di Repositori menyebutkan di mana perangkat ini mencatat
distribusinya, misalnya **Disimpan di IPFS · Diumumkan di Nostr**: tempat
bangunan atau Klaim Bertanda Tangannya diunggah (IPFS, Arweave, Steem, atau
Blurt) dan tempat diumumkan (Nostr, Arweave, Steem, atau Blurt). Arahkan penunjuk
ke sebuah nama untuk melihat alamat atau id pengumumannya.

Baris itu hanya menyatakan apa yang tercatat di perangkat ini. Baris itu
tidak memeriksa apakah unggahan masih tersedia (salinan IPFS hanya
bertahan selama ada yang mem-pin-nya), dan distribusi yang dilakukan dari
perangkat lain tidak diketahui di sini. Tanpa catatan, kartu itu
bertuliskan **Tidak ada distribusi yang tercatat di perangkat ini.**:
cadangkan, atau buka di Tampilan Dunia dengan **Jelajahi** lalu gunakan
**Distribusikan** di bawah **Dunia Bersama Saya**. Membagikan kepada rekan
yang terhubung tidak dicatat sebagai distribusi: mereka menyimpan salinan
hanya selama mereka mau.

## Hitungan pengunjung harian

Di bagian bawah halaman, **Hitungan pengunjung harian** mengatur satu-satunya
hal yang dikirim ForkBuild tanpa dibutuhkan fitur apa pun. Sekali sehari,
situs resmi memberi tahu GoatCounter bahwa satu browser lagi membukanya.
Dengan cara yang sama, situs itu juga menghitung saat tautan ke sebuah
bangunan disalin atau dibagikan, saat tautan yang dibagikan dibuka, dan saat
bangunan yang dibuka dari tautan itu disalin ke Editor. Setiap permintaan
adalah jalur tetap yang tidak menyebut halaman, bangunan, atau orang apa pun
dan tidak memasang cookie, dan siapa pun dapat melihat jumlah totalnya di
dasbor publik. Hapus centang **Hitung browser ini** untuk menghentikannya; pilihan
itu langsung disimpan, hanya di browser ini. Browser yang mengirim Global
Privacy Control atau Do Not Track tidak pernah dihitung, dan sakelarnya
menyebutkan hal itu. Lihat [Privasi](Privacy.md#hitungan-pengunjung) untuk
tahu persis apa yang dikirim.
