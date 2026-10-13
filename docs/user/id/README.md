<!-- translation-of: docs/user/README.md source-hash: 0a529ac2186a5c9d -->
# Dokumentasi Pengguna ForkBuild

<!-- languages -->
[English](../README.md) · [Deutsch](../de/README.md) · [Español](../es/README.md) · [Français](../fr/README.md) · **Bahasa Indonesia** · [日本語](../ja/README.md) · [한국어](../ko/README.md) · [Português (Brasil)](../pt-BR/README.md)
<!-- /languages -->

Panduan cara memakai ForkBuild di browser. Baru di sini? Mulailah dengan
**[Memulai](01-GettingStarted.md)**: lima menit dari membuka aplikasi
sampai berjalan di dalam bangunan pertama Anda.

## Saya ingin…

| Saya ingin… | Baca |
|---|---|
| Membangun sesuatu untuk pertama kali | [Memulai](01-GettingStarted.md#menempatkan-balok-pertama-anda) |
| Mempelajari alat membangun | [Editor](02-TheEditor.md) |
| Membagikan bangunan kepada teman | [Membagikan tautan](04-PublishingAndForking.md#membagikan-tautan) |
| Membiarkan semua orang menemukan bangunan saya | [Siapa yang bisa menemukannya?](04-PublishingAndForking.md#siapa-yang-bisa-menemukannya) |
| Me-remix bangunan orang lain | [Fork: jadikan milik Anda](04-PublishingAndForking.md#fork-jadikan-milik-anda) |
| Membangun bersama teman, secara langsung | [Bangun bersamaku](02-TheEditor.md#bangun-bersamaku-membangun-bersama-secara-langsung) |
| Jalan-jalan bersama teman | [Jalan di sini bersamaku](03-WorldView.md#jalan-di-sini-bersamaku--membawa-teman-ke-dunia-ini) |
| Mengubah tampilan avatar saya | [Avatar & Kehadiran](06-AvatarsAndPresence.md#menyesuaikan-avatar-anda) |
| Mencadangkan pekerjaan saya, atau memindahkannya ke perangkat lain | [Data Anda](13-YourData.md) |
| Mencari tombol atau kontrol mouse | [Referensi Kontrol](ControlsReference.md) |
| Memperbaiki sesuatu yang tidak berjalan | [FAQ](FAQ.md) |

Semua yang ada di sini menjelaskan produk sebagaimana cara kerjanya saat
ini; bagian dalam mesinnya ada di [docs/Architecture.md](../../Architecture.md)
dan folder [docs/](../..) tingkat atas lainnya (hanya dalam bahasa Inggris).

## Bermain (baca berurutan)

Semua yang Anda perlukan untuk membangun, berbagi, meremiks, dan
berjalan-jalan bersama teman.

1. **[Memulai](01-GettingStarted.md)** — membuka aplikasi, mengenal
   menu, menempatkan balok pertama Anda, dan memilih nama hanya saat
   menerbitkan.
2. **[Editor](02-TheEditor.md)** — perangkat untuk
   membangun: alat, pemilihan, transformasi, warna balok, grup, struktur di
   Pustaka Bangunan dan cetak biru Anda sendiri, instans struktur, serta
   judul/deskripsi/lisensi sebuah karya.
3. **[Tampilan Dunia](03-WorldView.md)** — dunia 3D bersama tempat
   setiap bangunan yang diterbitkan berada: berjalan dan terbang
   berkeliling, menemukan dan melihat berbagai hal, **Bangun di sini**,
   **Jalan di sini bersamaku**, para penghuni, dan **Edit Salinan**
   untuk membawa sesuatu ke Editor. Alat jaringannya menunggu di bawah
   **Tampilkan alat lanjutan**.
4. **[Penerbitan & Fork](04-PublishingAndForking.md)** — menerbitkan
   dan membagikan tautan, memilih ke mana bangunan Anda dikirim,
   lisensi, meremiks, **Jelajahi** dan bangunan siap pakainya, tantangan
   mingguan dan alun-alunnya, serta pohon keluarga. Untuk semua tujuan
   sebuah bangunan, lihat [Mendistribusikan Karya
   Anda](Distribution.md).
5. **[Avatar & Kehadiran](06-AvatarsAndPresence.md)** —
   menyesuaikan avatar, siapa yang dapat melihat Anda, berjalan, sudut
   pandang kamera, kendaraan, hewan, dan inventaris Anda.
6. **[Data Anda](13-YourData.md)** — mencadangkan semua yang disimpan
   browser ini ke satu file terenkripsi dan memulihkannya, ekspor yang
   lebih kecil, dan di mana perangkat ini mencatat distribusi publikasi
   Anda.

## Lanjutan

Mesin di baliknya: identitas Anda secara rinci, koneksi langsung dengan
orang lain, jaringan tempat sebuah bangunan bisa dikirim, dan alat
eksperimental. Anda tidak memerlukan semua ini untuk bermain.

- **[Identitas & Masuk](05-IdentityAndLogin.md)** —
  identitas kriptografis Anda, brankas (mengunci/membuka), mencadangkannya
  dengan ekspor/impor, dan mengelola identitas dari **Identitas Saya**.
- **[Koneksi Rekan & Teman](07-PeerConnectionsAndFriends.md)** — terhubung langsung dengan orang lain, mengingat, berteman,
  mengikuti, memblokir, menghubungkan kembali secara otomatis, dan relay
  TURN Anda sendiri.
- **[Obrolan & Percakapan](08-ChatAndConversations.md)** — pesan langsung khusus teman, pengiriman saat luring, tanda
  sudah dibaca, dan panggilan suara.
- **[Publikasi & Bukti Eksternal](09-PublicationsAndEvidence.md)** — lapisan teknis yang opsional: klaim kepengarangan dan
  nama tempat yang ditandatangani, halaman Publikasi, komentar, dan apa
  yang disimpan perangkat Anda (Snapshot Lokal). Sebagian halamannya
  *eksperimental*, dan ditandai demikian.
- **[Pengaturan Jaringan](10-NetworkSettings.md)** —
  gateway, relay, penyedia penyimpanan dan pengumuman, serta server untuk
  koneksi rekan.
  Apa yang dibutuhkan setiap jaringan dirangkum di
  [Mendistribusikan Karya Anda](Distribution.md#apa-yang-dibutuhkan-setiap-jaringan).
- **[Bukti & Penyimpanan](11-EvidenceAndStorage.md)** — menyimpan konten
  di IPFS atau Arweave, penempatan snapshot, penjangkaran di Arweave, dan
  yang *eksperimental*: bukti eksternal lainnya, alur dompet Bitcoin dan
  Base, pinning IPFS jarak jauh, Steem, dan Blurt.
  [Mendistribusikan Karya Anda](Distribution.md) menunjukkan bagaimana
  semuanya saling terkait.
- **[Arsip & Pencapaian](12-ArchiveAndLeaderboards.md)** — *eksperimental*. Arsip pengamatan, referensi publikasi,
  dan pencapaian.

## Referensi

- **[Mendistribusikan Karya Anda](Distribution.md)** — semua
  yang dapat Anda simpan di jaringan terdesentralisasi (Dunia Anda, klaim
  kepengarangan dan nama tempat, komentar, jangkar), tiga peran yang
  dimainkan sebuah jaringan (Konten, Pengumuman / Penemuan, Bukti /
  Penjangkaran), apa yang dibutuhkan setiap jaringan, dan tautan ke panduan
  yang menjelaskan detailnya.
- **[Pertanyaan Umum](FAQ.md)** — jawaban singkat atas pertanyaan yang
  paling sering muncul: berbagi, lisensi, frasa sandi yang terlupa, pindah
  ke perangkat lain, menjalankan avatar, dan terhubung kembali dengan teman.
- **[Referensi Kontrol](ControlsReference.md)** — setiap interaksi mouse
  dan keyboard di Editor dan Tampilan Dunia, dalam satu tabel. Jika halaman
  ini dan Palet Perintah di aplikasi (`Ctrl/Cmd+K`) berbeda, Palet yang
  benar dan halaman ini mengandung kesalahan — mohon laporkan.
- **[Gizmo Transformasi Interaktif](InteractiveTransformGizmo.md)** — cara memindahkan dan memutar pilihan Anda dengan
  menyeret langsung di viewport: pegangan, titik poros, snapping,
  menerapkan, membatalkan, mengurungkan, dan perilaku grup.

## Tempat membangun, tempat menjelajah

Editor adalah satu-satunya tempat membangun di ForkBuild; Tampilan Dunia
adalah ruang jelajah yang hanya dapat dilihat:

- **Editor** (**Bangun** di menu) — ruang kerja pribadi Anda. Tempatkan
  balok dari Pustaka Bangunan, pilih, lalu pindahkan atau putar dengan
  keyboard atau gizmo. Simpan, buka, dan terbitkan bangunan dari bilah
  alat.
- **Tampilan Dunia** (**Jalan-jalan** di menu, atau **Jelajahi** pada
  bangunan mana pun) — dunia bersama. Berjalan atau terbang di antara
  bangunan terbitan, cari dan jelajahi apa yang ada di sekitar Anda,
  jalankan avatar Anda di atas gedung dan medan, dan gunakan **Edit
  Salinan** untuk membuka apa pun yang Anda temukan di Editor, siap untuk
  dikembangkan.

Apa pun yang Anda lakukan di Editor, setiap perubahan adalah satu langkah
yang dapat diurungkan, dan `Ctrl/Cmd+Z` membatalkannya.

## Kolaborasi dan penjelajahan

ForkBuild memberi Anda kolaborasi melalui avatar dan penemuan dunia:

- **Berjalan dan bernavigasi** — gunakan tombol WASD untuk menjalankan
  avatar Anda melintasi bangunan dan medan, melompat, memanjat, dan
  menjelajahi ruang bertingkat.
- **Membangun bersama** — **Bangun bersamaku** di Editor membuat tautan yang
  membuka bangunan Anda di Editor teman, sehingga kalian membangunnya
  bersama secara langsung, masing-masing melihat balok yang lain muncul dan
  ke mana ia menunjuk (lihat
  [Editor](02-TheEditor.md#bangun-bersamaku-membangun-bersama-secara-langsung)).
  Di Tampilan Dunia, lihat avatar pembangun lain dan apa yang sedang mereka
  kerjakan, lalu gunakan **Edit Salinan** untuk membawa sesuatu yang Anda
  temukan ke Editor dan mengembangkannya sendiri.
- **Menemukan dunia** — gunakan kompas dengan penanda lokasi kontekstual
  untuk menemukan struktur di dekat Anda dan bentang alam seperti hutan,
  sungai, dan padang rumput.
- **Mengikuti kolaborator** — kunci kamera Anda untuk mengikuti avatar
  seseorang saat mereka bergerak di dunia.

Semua yang Anda lihat diturunkan dari benih (seed) deterministik dunia —
medan, ekologi, dan hidrologi dihitung secara sama untuk semua orang,
sehingga tercipta tempat bersama yang selaras tanpa menyimpan data
tambahan.

## Struktur dan cetak biru yang dapat dipakai ulang

Selain balok satu per satu, Pustaka Bangunan di Editor memungkinkan Anda
membangun dengan seluruh struktur sekaligus — dua puluh dua struktur siap pakai
dalam lima kategori, ditambah apa pun yang Anda simpan sendiri:

- **Tempatkan** sebuah struktur langsung ke dalam apa yang sedang Anda
  bangun, atau **fork** menjadi dokumen baru tersendiri.
- **Simpan bangunan Anda sendiri** sebagai struktur yang dapat dipakai
  ulang di **Struktur Saya**, pustaka cetak biru pribadi Anda.
- **Ekspor dan impor** cetak biru sebagai file portabel untuk dibagikan
  kepada orang lain, atau dibawa ke perangkat lain.

Lihat [Editor](02-TheEditor.md#struktur-menyusun-mem-fork-dan-pustaka-pribadi-anda) untuk penjelasan lengkapnya.
