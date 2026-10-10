<!-- translation-of: docs/user/12-ArchiveAndLeaderboards.md source-hash: 472fcc2701093e58 -->
# 12 — Arsip & Pencapaian

<!-- languages -->
[English](../12-ArchiveAndLeaderboards.md) · [Deutsch](../de/12-ArchiveAndLeaderboards.md) · [Español](../es/12-ArchiveAndLeaderboards.md) · [Français](../fr/12-ArchiveAndLeaderboards.md) · **Bahasa Indonesia** · [日本語](../ja/12-ArchiveAndLeaderboards.md) · [한국어](../ko/12-ArchiveAndLeaderboards.md) · [Português (Brasil)](../pt-BR/12-ArchiveAndLeaderboards.md)
<!-- /languages -->

> **Eksperimental.** Semua yang ada di sini dapat berubah atau dihapus di
> versi berikutnya, dan apa yang dihasilkannya mungkin tidak terbawa. Di
> halaman Publikasi, panel **Alat Dompet & Arsip** ditandai
> dengan lencana **Eksperimental**.

Alat Bitcoin, Base, dan IPFS di
[Bukti & Penyimpanan](11-EvidenceAndStorage.md) mencatat apa yang
diamatinya dalam arsip yang tahan lama di perangkat ini. Panduan ini
membahas arsip itu dan apa yang dibangun di atasnya: referensi antarpublikasi
dan pencapaian.

Sebagian besar kartu ini ada di halaman Publikasi di bawah **Alat Dompet &
Arsip**, di tab **Alat Arsip** dan **Referensi & Pencapaian**.
Masing-masing menampilkan **Disimpan secara lokal** jika isinya tetap ada
setelah dimuat ulang.

Satu istilah yang dipakai di seluruh panduan: **identitas publikasi** adalah
satu catatan Publikasi Jangkar Bitcoin atau Base (lihat
[Publikasi Jangkar Bitcoin](11-EvidenceAndStorage.md#publikasi-jangkar-bitcoin)).
Itu catatan di sebuah rantai, bukan orang.

## Arsip Pengamatan Publikasi

Satu catatan yang tahan lama, di perangkat ini, berisi fakta-fakta yang
diamati alat IPFS, Bitcoin, dan Base. Arsip ini hanya menyimpan identitas
publikasi dan pengamatan: tidak pernah koneksi dompet, kunci, atau
kredensial pinning.

### Arsip Pengamatan

Kartu **Arsip Pengamatan** menampilkan berapa banyak **Publikasi** dan
**Pengamatan** yang disimpannya.

- **Tampilkan Arsip** membuka **Linimasa Pengamatan yang Diarsipkan**:
  setiap penerbitan dan verifikasi IPFS, setiap penyiaran, konfirmasi, dan
  bukti konten Bitcoin, serta setiap pengamatan pencantuman Base, berurutan
  menurut waktu, masing-masing menyebutkan domain, status, dan (jika
  relevan) lokator, txid, atau tinggi bloknya. Membukanya tidak menghubungi
  jaringan apa pun.
- **Kosongkan Arsip** adalah satu-satunya cara menghapus sesuatu dari
  arsip; semua hal lain hanya menambahkan ke dalamnya. Tombol ini nonaktif
  saat arsip kosong.

### Bukti Historis Jangkar Bitcoin

Fakta Bitcoin yang sama, dikelompokkan per ID jangkar, di sebuah kartu di
tab **Penjangkaran Blockchain**. **Tampilkan Jangkar Historis**, lalu
sebuah ID jangkar, menampilkan **Riwayat Penyiaran**, **Riwayat
Konfirmasi**, **Riwayat Bukti Konten**, **Perbandingan Posisi di Rantai**,
dan **Konsistensi Pengamatan**-nya, dengan ringkasan **Bukti Gabungan** dari
kelima jumlah itu. Jumlahnya menyatakan seberapa banyak yang dicatat, bukan
seberapa tepercaya.

### Mengekspor, mengimpor, dan memeriksa arsip

Kartu **Arsip Publikasi** mengubah arsip menjadi file JSON:

- **Ekspor Arsip** menampilkan JSON dan tautan **Unduh Ekspor Arsip**.
- **Impor Arsip** menerima file atau JSON yang ditempel dan menampilkan
  pratinjau berapa banyak publikasi dan pengamatan di dalamnya
  dibandingkan arsip saat ini. Hanya **Ganti Arsip Saat Ini** yang
  menerapkannya. Mengimpor **menggantikan** arsip saat ini (tidak
  menggabungkan) dan tidak dapat diurungkan. File yang tidak valid ditolak
  tanpa ada yang berubah.

**Periksa Arsip Eksternal** melihat isi sebuah ekspor tanpa mengimpornya.
Ini menampilkan versi skema file itu, jumlah fakta per domain (penerbitan
dan verifikasi IPFS; penyiaran, konfirmasi, bukti konten, dan identitas
publikasi Bitcoin; pencantuman dan identitas publikasi Base), jumlah fakta
lokal dan yang diimpor, peristiwa impor, sidik jarinya, serta ID jangkar
Bitcoin, indeks catatan IPFS, dan hash transaksi Base yang dimuatnya. Dari
sana:

- **Bandingkan dengan Arsip Saat Ini** mencantumkan, per domain, apa yang
  **Sama**, **Berubah**, **Hanya di saat ini**, **Hanya di eksternal**, atau
  memiliki **Asal berbeda**.
- **Tinjau Penggantian** (setelah perbandingan) menampilkan pratinjau apa
  yang akan diubah oleh penggantian, dengan jumlah dan sidik jari kedua
  arsip. Tombol **Ganti Arsip Saat Ini**-nya adalah impor yang sama seperti
  di atas. Mengganti menandai setiap fakta sebagai baru diimpor, sehingga
  sidik jari hasilnya berbeda dari milik file.

### Asal Arsip

Menunjukkan dari mana fakta berasal: **Fakta lokal** (diamati di perangkat
ini) dan **Fakta yang diimpor** (dari **Ganti Arsip Saat Ini**). Jika Anda
pernah mengimpor, **Impor Arsip** mencantumkan waktu, jumlah fakta, dan versi
skema setiap impor. Tidak ada jenis yang dianggap lebih tepercaya.

### Sidik Jari Arsip

Ringkasan SHA-256 dari setiap fakta dan tag asal di arsip. **Salin Sidik
Jari** menyalinnya. Untuk membandingkan dengan sidik jari dari tempat lain
(misalnya dari rekan), tempelkan di bawah **Bandingkan dengan Sidik Jari
Lain** dan klik **Bandingkan**:

| Hasil | Arti |
|---|---|
| **MATCH** | Kedua arsip berisi konten yang identik. |
| **DIFFERENT** | Tidak identik. |
| **INVALID_FINGERPRINT** | Yang Anda tempel bukan sidik jari SHA-256 sepanjang 64 karakter. |

Kecocokan hanya berarti isinya identik, bukan bahwa isinya benar, dan tidak
ada apa pun di sini yang menyebutkan arsip mana yang lebih baru.

## Referensi Publikasi

Mencatat bahwa satu identitas publikasi menunjuk ke identitas lain.

**Referensi Publikasi → Tampilkan Referensi** membuka formulir: pilih
**Publikasi sumber (yang membuat referensi)** dan **Publikasi yang dirujuk
(yang ditunjuk)** dari identitas publikasi Bitcoin dan Base yang Anda
ketahui (misalnya "Bitcoin — a1b2…c3d4 — content 9f8e…"), lalu klik
**Catat Referensi**. Sebuah publikasi tidak dapat merujuk dirinya sendiri.
Referensi hanya pernah dibuat oleh Anda; tidak ada yang membuatnya secara
otomatis, dan fork di bagian lain aplikasi juga tidak.

Referensi sengaja tidak disebut fork: referensi mencatat bahwa penunjuk
itu ada, bukan apa artinya (fork, kutipan, balasan).

Referensi yang tercatat dicantumkan dari yang terlama, dengan rantai,
identitas singkat, hash konten, dan waktu pencatatan kedua sisi. Duplikat
tetap disimpan sebagai referensi terpisah.

**Graf Referensi Publikasi** mengelompokkan referensi yang sama per
publikasi: total untuk **Sisi**, **Publikasi**, **Sumber berbeda**, dan
**Yang dirujuk berbeda**, dan untuk setiap publikasi **Referensi keluar**
dan **Referensi masuk**-nya, yang dapat dibuka untuk melihat referensi
satu per satu. Jumlahnya bukan peringkat.

## Pencapaian

Sebuah identitas publikasi mendapat lencana begitu melewati suatu ambang;
tidak ada yang perlu diklaim.

**Pencapaian → Tampilkan Pencapaian** mencantumkan lencana yang sudah
didapat sejauh ini. Nama lencana ditampilkan dalam bahasa Inggris di
aplikasi.

| Lencana | Ikon | Didapat saat |
|---|---|---|
| First publication (publikasi pertama) | 🏆 | Catatan publikasi jangkar Bitcoin atau Base pertama Anda. |
| Bitcoin publisher (penerbit Bitcoin) | ₿ | Yang Bitcoin pertama Anda. |
| Base publisher (penerbit Base) | 🔵 | Yang Base pertama Anda. |
| Multi-chain publisher (penerbit multi-rantai) | 🌐 | Catatan di lebih dari satu rantai. |
| Ten publications (sepuluh publikasi) | 🔟 | Yang ke-10, Bitcoin dan Base digabung. |
| One hundred publications (seratus publikasi) | 💯 | Yang ke-100. |

Klik sebuah lencana untuk melihat **Publikasi Sumber**-nya (rantai, hash
konten, referensi rantai, waktu pembuatan) dan, jika tersedia, **Lihat
Siklus Hidup Publikasi di Atas**, yang melompat ke siklus hidup catatan
itu.

Lima pencapaian lagi berasal dari referensi dan belum memiliki lencana:
**First reference created** (referensi pertama dibuat), **First reference
received** (referensi pertama diterima), **Referenced by 10 publications**
(dirujuk oleh 10 publikasi), **Referenced by 100 publications** (dirujuk
oleh 100 publikasi), dan **First cross-chain reference** (referensi lintas
rantai pertama, antara publikasi Bitcoin dan Base). Semuanya dicantumkan
berdasarkan nama di **Profil Pencapaian**, tempat Anda memilih identitas
publikasi dan melihat jumlah serta daftar lengkap pencapaiannya,
masing-masing dengan waktu didapatnya.

Pencapaian dimiliki identitas publikasi, bukan orang: tidak ada apa pun di
sini yang mengaitkan publikasi dengan seseorang.

## Dihentikan: papan peringkat, rekonsiliasi, dan label penerbit

Versi sebelumnya punya halaman Papan Peringkat: papan peringkat penerbit,
klaim snapshot penerbit yang ditandatangani, ruang kerja dan papan peringkat
rekonsiliasi, serta perbandingan ekspor bukti. ForkBuild tidak memeringkat
orang atau mencatat skor ([Pilar](../../Pillars.md#what-we-are-not-making)), jadi semuanya dihapus. Tautan lama
ke salah satu halaman itu membuka Beranda. Arsip yang disimpan saat halaman
itu masih ada tetap bisa dimuat dan diimpor, dengan semua catatan lainnya;
klaim papan peringkat dan keputusan rekonsiliasi di dalamnya dibuang.

Asosiasi Penerbit, yang memberi label nama penerbit pada publikasi Anda untuk
halaman-halaman itu, juga dihapus. Label yang ada di arsip dibuang dengan
cara yang sama.
