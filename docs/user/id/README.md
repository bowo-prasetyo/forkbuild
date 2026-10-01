<!-- translation-of: docs/user/README.md source-hash: 26ea018db8723ef6 -->
# Dokumentasi Pengguna ForkBuild

<!-- languages -->
[English](../README.md) · [Deutsch](../de/README.md) · [Español](../es/README.md) · **Bahasa Indonesia** · [日本語](../ja/README.md) · [Português (Brasil)](../pt-BR/README.md)
<!-- /languages -->

Panduan cara menggunakan ForkBuild di browser. Semua yang ada di sini
menjelaskan produk sebagaimana cara kerjanya saat ini; bagian dalam mesin
dijelaskan di [docs/Architecture.md](../../Architecture.md) dan di folder
[docs/](../..) tingkat atas (hanya dalam bahasa Inggris).

## Mulai dari sini (baca berurutan)

1. **[Memulai](01-GettingStarted.md)** — membuka aplikasi, masuk, dan
   menempatkan balok pertama Anda.
2. **[Editor](02-TheEditor.md)** — perangkat untuk
   membangun: alat, pemilihan, transformasi, warna balok, grup, struktur di
   Pustaka Bangunan dan cetak biru Anda sendiri, instans struktur, serta
   judul/deskripsi/lisensi sebuah karya.
3. **[Tampilan Dunia](03-WorldView.md)** — ruang 3D
   bersama yang hanya dapat dilihat, tempat setiap karya yang diterbitkan
   berada: terbang berkeliling, menemukan dan memeriksa sesuatu,
   **Edit Salinan** untuk membawa sesuatu ke Editor, Perjumpaan Dunia yang
   dibagikan rekan Anda, mendistribusikan publikasi Anda sendiri dari
   **Dunia Bersama Saya**, komentar dan notifikasi.
4. **[Penerbitan & Fork](04-PublishingAndForking.md)**
   — menerbitkan, lisensi, fork, katalog Repositori, dan mendistribusikan
   publikasi langsung dari Editor.
   Untuk semua yang dapat Anda distribusikan dan ke mana semuanya dapat
   dikirim, lihat [Distributing Your Work](../Distribution.md) (bahasa
   Inggris).
5. **[Identitas & Masuk](05-IdentityAndLogin.md)** —
   identitas kriptografis Anda, brankas (mengunci/membuka), mencadangkannya
   dengan ekspor/impor, dan mengelola identitas dari **Identitas Saya**.
6. **[Avatar & Kehadiran](06-AvatarsAndPresence.md)** —
   menyesuaikan avatar, siapa yang dapat melihat Anda, berjalan, sudut
   pandang kamera, kendaraan, hewan, dan inventaris Anda.
7. **[Koneksi Rekan & Teman](07-PeerConnectionsAndFriends.md)** — terhubung langsung dengan orang lain, mengingat, berteman,
   mengikuti, memblokir, menghubungkan kembali secara otomatis, dan relay
   TURN Anda sendiri.
8. **[Obrolan & Percakapan](08-ChatAndConversations.md)** — pesan langsung khusus teman, pengiriman saat luring, tanda
   sudah dibaca, dan panggilan suara.
9. **[Publikasi & Bukti Eksternal](09-PublicationsAndEvidence.md)** — lapisan teknis yang opsional: klaim kepengarangan dan
   nama tempat yang ditandatangani, halaman Publikasi, komentar, dan apa
   yang disimpan perangkat Anda (Snapshot Lokal). Sebagian halamannya
   *eksperimental*, dan ditandai demikian.
10. **[Pengaturan Jaringan](10-NetworkSettings.md)** —
    gateway, relay, penyedia penyimpanan dan pengumuman, serta server untuk
    koneksi rekan.
    Apa yang dibutuhkan setiap jaringan dirangkum di
    [Distributing Your Work](../Distribution.md#what-each-network-needs)
    (bahasa Inggris).
11. **[Bukti & Penyimpanan](11-EvidenceAndStorage.md)**
    — menyimpan konten di IPFS atau Arweave, dan yang *eksperimental*:
    bukti eksternal, alur dompet Bitcoin dan Base, penempatan snapshot,
    pinning IPFS jarak jauh, dan Steem.
    [Distributing Your Work](../Distribution.md) (bahasa Inggris)
    menunjukkan bagaimana semuanya saling terkait.
12. **[Arsip & Papan Peringkat](12-ArchiveAndLeaderboards.md)** — *eksperimental*. Arsip pengamatan, referensi publikasi,
    pencapaian, label penerbit, dan halaman Papan Peringkat.
13. **[Data Anda](13-YourData.md)** — mencadangkan semua yang disimpan
    browser ini ke satu file terenkripsi dan memulihkannya, ekspor yang
    lebih kecil, dan di mana perangkat ini mencatat distribusi publikasi
    Anda.

## Referensi

- **[Distributing Your Work](../Distribution.md)** (bahasa Inggris) — semua
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

- **Editor** (`/editor`) — ruang kerja pribadi Anda. Tempatkan balok dari
  palet, pilih, lalu ubah dengan keyboard atau gizmo. Simpan, muat, dan
  terbitkan dokumen dari bilah alat.
- **Tampilan Dunia** (`/world/:id`) — dunia spasial bersama. Terbang di
  antara dunia yang diterbitkan, cari dan jelajahi apa yang ada di sekitar
  Anda, periksa balok dan struktur yang ditempatkan, jalankan avatar Anda di
  atas struktur dan medan, dan gunakan **Edit Salinan** untuk membuka apa
  pun yang Anda temukan di Editor, siap untuk dikembangkan.

Apa pun yang Anda lakukan di Editor, setiap perubahan adalah satu langkah
yang dapat diurungkan, dan `Ctrl/Cmd+Z` membatalkannya.

## Kolaborasi dan penjelajahan

ForkBuild memberi Anda kolaborasi melalui avatar dan penemuan dunia:

- **Berjalan dan bernavigasi** — gunakan tombol WASD untuk menjalankan
  avatar Anda melintasi bangunan dan medan, melompat, memanjat, dan
  menjelajahi ruang bertingkat.
- **Membangun bersama** — lihat avatar pembangun lain dan pahami apa yang
  sedang mereka kerjakan melalui kesadaran spasial, lalu gunakan **Edit
  Salinan** untuk membawa sesuatu yang Anda temukan ke Editor dan
  mengembangkannya sendiri.
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
membangun dengan seluruh struktur sekaligus — dua puluh struktur siap pakai
dalam lima kategori, ditambah apa pun yang Anda simpan sendiri:

- **Tempatkan** sebuah struktur langsung ke dalam apa yang sedang Anda
  bangun, atau **fork** menjadi dokumen baru tersendiri.
- **Simpan bangunan Anda sendiri** sebagai struktur yang dapat dipakai
  ulang di **Struktur Saya**, pustaka cetak biru pribadi Anda.
- **Ekspor dan impor** cetak biru sebagai file portabel untuk dibagikan
  kepada orang lain, atau dibawa ke perangkat lain.

Lihat [Editor](02-TheEditor.md#struktur-menyusun-mem-fork-dan-pustaka-pribadi-anda) untuk penjelasan lengkapnya.
