<!-- translation-of: docs/user/12-ArchiveAndLeaderboards.md source-hash: 6f86f5609d7f2b27 -->
# 12 — Arsip & Papan Peringkat

<!-- languages -->
[English](../12-ArchiveAndLeaderboards.md) · [Deutsch](../de/12-ArchiveAndLeaderboards.md) · [Español](../es/12-ArchiveAndLeaderboards.md) · **Bahasa Indonesia** · [日本語](../ja/12-ArchiveAndLeaderboards.md)
<!-- /languages -->

> **Eksperimental.** Semua yang ada di sini dapat berubah atau dihapus di
> versi berikutnya, dan apa yang dihasilkannya mungkin tidak terbawa. Di
> halaman Publikasi, panel **Dompet, Arsip & Alat Penerbit** ditandai
> dengan lencana **Eksperimental**; halaman Papan Peringkat menampilkan
> spanduk **Eksperimental.**

Alat Bitcoin, Base, dan IPFS di
[Bukti & Penyimpanan](11-EvidenceAndStorage.md) mencatat apa yang
diamatinya dalam arsip yang tahan lama di perangkat ini. Panduan ini
membahas arsip itu dan apa yang dibangun di atasnya: referensi antarpublikasi,
pencapaian, label penerbit, dan halaman Papan Peringkat.

Sebagian besar kartu ini ada di halaman Publikasi di bawah **Dompet, Arsip
& Alat Penerbit**, di tab **Alat Arsip** dan **Referensi & Pencapaian**.
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

## Identitas Penerbit

**Asosiasi Penerbit** memungkinkan Anda memberi label nama penerbit pada
publikasi, berdasarkan pernyataan Anda sendiri, untuk kartu penerbit dan
papan peringkat di bawah.

Pengenal penerbit adalah label sederhana yang dinyatakan sendiri, bukan
identitas yang diverifikasi atau login. Pencocokannya persis: `Alice`,
`alice`, dan `ALICE` adalah tiga penerbit. Tidak ada yang disimpulkan dari
dompet, konten, atau nama.

**Tampilkan Asosiasi Penerbit**, lalu:

1. **Pengenal penerbit** — ketik label, atau pilih yang pernah Anda pakai.
2. **Publikasi** — pilih salah satu identitas publikasi Bitcoin atau Base
   Anda.
3. **Tambah Publikasi** — mencatat asosiasi itu.

**Asosiasi yang Tercatat** mencantumkannya, dari yang terlama.
**Publikasi yang Dikaitkan dengan Seorang Penerbit** menampilkan setiap
publikasi untuk penerbit yang dipilih, dengan hash konten dan waktu
pengaitannya.

Tiga kartu di halaman [Papan Peringkat](#pusat-papan-peringkat) dibangun di
atas asosiasi ini, masing-masing dengan dropdown **Pilih Seorang
Penerbit**-nya sendiri:

| Kartu | Menampilkan |
|---|---|
| **Profil Pencapaian Penerbit** | Setiap pencapaian yang didapat oleh publikasi mana pun yang diklaim penerbit itu, dan publikasi mana yang mendapatkannya. |
| **Lencana Pencapaian Penerbit** | Sama, dibatasi pada pencapaian yang memiliki lencana, masing-masing menaut kembali ke siklus hidupnya di halaman Publikasi. |
| **Statistik Pencapaian Penerbit** | Jumlah publikasi yang dikaitkan, pencapaian, jenis pencapaian, lencana, dan jenis lencana, publikasi per rantai, dan pencapaian per jenis. |

Jika belum ada asosiasi, setiap kartu menyebutkannya dan menunjuk ke
Asosiasi Penerbit. Kartu-kartu ini melaporkan apa yang *diklaim* seorang
penerbit, bukan siapa yang mengendalikan sebuah publikasi, dan tidak ada
yang memeringkat siapa pun.

## Pusat Papan Peringkat

Halaman **Papan Peringkat** (`/leaderboard`) menautkan halaman-halaman di
bawah, ditambah tiga kartu penerbit di atas. Halaman ini tidak ada di bilah
atas: buka dari tautan **Papan Peringkat** di bawah kartu **Arsip
Publikasi** di halaman Publikasi.

### Papan Peringkat Kinerja Penerbit

`/publisher-leaderboard` memeringkat penerbit berdasarkan apa yang telah
dicatat perangkat ini: **Peringkat**, **Penerbit**, **Pencapaian**, **Jenis
Pencapaian**, dan **Publikasi**, dihitung baru setiap kali halaman dibuka
dan tidak pernah disimpan. Seorang penerbit muncul begitu Anda mengaitkan
publikasi dengannya. Namanya adalah label Anda sendiri, bukan identitas
yang diverifikasi.

### Klaim Snapshot Penerbit

`/publisher-snapshot-claim` menandatangani klaim tentang snapshot papan
peringkat Anda saat ini, sehingga rekan dapat membandingkan dengannya. Anda
harus sudah masuk.

1. **Buat & Tandatangani Klaim** — menghitung snapshot Anda dan
   menandatangani klaim tentangnya. Menampilkan penanda tangan serta sidik
   jari bukti, kebijakan, dan snapshot. **Mulai Ulang** membuangnya.
2. **Ekspor Klaim** — menampilkan klaim sebagai JSON dengan tautan **Unduh
   Klaim**, untuk ditempel ke
   [Ruang Kerja Rekonsiliasi](#ruang-kerja-rekonsiliasi) milik rekan atau
   dikirim sebagai file.

### Ruang Kerja Rekonsiliasi

`/reconciliation-workspace`: tempelkan klaim yang diekspor rekan ke **JSON
bukti rekan** dan klik **Rekonsiliasi**. Ini membandingkan klaim itu dengan
arsip Anda dan, jika menemukan kandidat rekonsiliasi, mencatat keputusan dan
pengamatan validasi ulang di arsip Anda serta menawarkan **Lihat di Papan
Peringkat**. Jika tidak ada yang perlu direkonsiliasi, ini menyebutkan
alasannya. **Hapus Hasil** menutup hasilnya.

### Papan Peringkat Kandidat Rekonsiliasi

`/reconciliation-leaderboard` hanya dapat dibaca. Halaman ini menampilkan,
untuk setiap kandidat rekonsiliasi, bukti yang disimpan arsip Anda,
secara opsional dibandingkan dengan arsip rekan.

**Kandidat** adalah titik tempat klaim bukti eksternal dan catatan Snapshot
Lokal untuk konten yang sama dibandingkan:

| Label kandidat | Arti |
|---|---|
| **Claim *X* ↔ Snapshot #*N*** | Klaim dan snapshot yang dibandingkan dan berbeda. |
| **Claim *X* (no corresponding Snapshot)** | Klaim tanpa snapshot untuk dibandingkan. |
| **Snapshot #*N* (no corresponding Claim)** | Snapshot tanpa klaim untuk dibandingkan. |

Kandidat berasal dari Ruang Kerja Rekonsiliasi. Sampai Anda
merekonsiliasi klaim rekan di sana, halaman ini menampilkan "Tidak ada
kandidat rekonsiliasi untuk ditampilkan."

**Kolom.** **Bukti Keputusan** (pilihan yang tercatat tentang sisi mana
yang dipercaya) dan **Bukti Pengamatan** (pemeriksaan ulang atas keputusan
itu di kemudian hari) masing-masing memiliki tiga jumlah: **Bersama** (kedua
arsip memilikinya), **Hanya sumber** (hanya milik Anda), dan **Hanya
target** (hanya milik rekan). Baris muncul sesuai urutan ditemukannya,
bukan menurut banyaknya bukti; ini bukan peringkat.

**Membandingkan dengan rekan.** Tempelkan ekspor arsip rekan ke **Arsip
Rekan** dan klik **Gunakan sebagai Arsip Rekan**. Tempelan yang tidak valid
ditolak. Tanpa arsip rekan, semuanya dihitung sebagai Hanya sumber. Sebuah
baris di atas tabel menyebutkan keadaan Anda:

| Spanduk | Arti |
|---|---|
| *Tidak ada arsip rekan yang diberikan — setiap hitungan di bawah hanya mencerminkan replika ini.* | Belum ada arsip rekan. |
| *Arsip rekan telah diberikan, tetapi tidak ada bukti yang tercatat di dalamnya — setiap hitungan di bawah masih hanya mencerminkan replika ini.* | Arsip sungguhan, tetapi kosong. |
| *Membandingkan dengan arsip rekan yang diberikan.* | Perbandingan sungguhan. |

**Periksa Bukti** (lalu **Sembunyikan Bukti**) pada sebuah baris
mencantumkan catatan keputusan dan pengamatan di balik jumlahnya, dibagi
menjadi Bersama, Hanya sumber, dan Hanya target. Setiap pengamatan
menampilkan sidik jari rencana yang diperiksa (seperti `rencana
abcdef012345…`) dan apakah kandidatnya **ada** dan **cocok dengan
rencana**, sebagaimana tercatat. Catatan yang tampak mirip tetap terpisah.

**Saringan Bukti.** Dua dropdown mempersempit apa yang ditampilkan:
**Jenis bukti** (**Semua**, **Keputusan**, **Pengamatan**) dan **Hubungan
replika** (**Semua**, **Bersama**, **Hanya sumber**, **Hanya target**).
Sebuah baris tetap ditampilkan jika memiliki bukti jenis itu dalam hubungan
itu. Dengan **Hubungan replika** pada **Semua**, tidak ada yang disaring;
dengan **Jenis bukti** pada **Semua**, sebuah baris cocok jika salah satu
jenis memiliki hubungan yang dipilih. Saringan ini juga mempersempit daftar
Periksa Bukti di setiap baris. Saringan hanya menyembunyikan baris dan
catatan; jumlah pada sebuah baris tidak pernah berubah.

**Ekspor Bukti.** **Ekspor Bukti** menghasilkan dokumen JSON berisi persis
apa yang ditampilkan saringan, mencatat keadaan perbandingan dan saringan
yang dipakai, dengan tautan **Unduh Ekspor Bukti**
(`reconciliation-candidate-leaderboard-evidence-export.json`). Tidak ada
yang diunggah. **Bandingkan Bukti yang Diekspor** membuka
[Perbandingan Ekspor Bukti](#perbandingan-ekspor-bukti).

**Mengimpor Ekspor Bukti.** Tempelkan sebuah ekspor (milik Anda atau milik
rekan) dan klik **Impor Bukti** untuk melihat keadaan perbandingannya serta
jumlah kandidat, keputusan, dan pengamatannya. Tempelan yang tidak valid
ditolak dan ringkasan sebelumnya tetap disimpan. **Hapus Bukti yang
Diimpor** menutupnya. Ini tidak memengaruhi tabel di atas.

Halaman ini membaca arsip Anda sekali saat dibuka; buka ulang untuk melihat
catatan baru. Arsip rekan, saringan, baris yang terbuka, dan ringkasan yang
diimpor tidak disimpan.

## Perbandingan Ekspor Bukti

`/evidence-export-comparison` membandingkan dua ekspor bukti satu sama lain
— misalnya milik minggu lalu dan hari ini, atau milik Anda dan milik
rekan. Halaman ini tidak membaca arsip Anda atau memengaruhi papan
peringkat.

Tempelkan kedua dokumen ke **Ekspor Bukti Sumber** dan **Ekspor Bukti
Target** lalu klik **Bandingkan Bukti**. Sisi yang tidak valid ditolak
sendiri; sisi lainnya tetap disimpan. **Hapus Perbandingan** mengosongkan
halaman.

- **Keadaan Perbandingan** dan saringan menampilkan keadaan perbandingan dan
  saringan yang tercatat di setiap dokumen, dan apakah keduanya sama.
- Tiga tabel — **keberadaan kandidat**, **bukti keputusan**, dan **bukti
  pengamatan** — masing-masing menghitung Hanya sumber, Bersama, dan Hanya
  target, dan tidak pernah digabungkan.
- **Periksa catatan** (lalu sembunyikan catatan) mencantumkan catatan di
  balik jumlah sebuah tabel. Pada catatan keputusan atau pengamatan,
  **Periksa identitas** menampilkan kolom-kolom yang mengidentifikasinya:

| Catatan | Kolom identitas |
|---|---|
| Keputusan | `decided`, `candidate`, `decision`, `decidedAt` |
| Pengamatan | `candidate`, `decision`, `planIdentity`, `candidatePresent`, `candidateType`, `candidateMatchesPlan`, `observedAt` |

**Pemasangan Catatan Eksplisit.** Untuk membandingkan dua catatan tertentu,
pilih satu catatan sumber dan satu catatan target (dari partisi mana pun)
untuk keputusan atau pengamatan lalu klik **Tambah Pasangan**; **Hapus**
mengeluarkan sebuah pasangan. Tidak ada yang dipasangkan secara otomatis,
dan pasangan yang sama dapat ditambahkan dua kali. Di bawah **Perbedaan
Catatan Berpasangan**, setiap **Pasangan Keputusan N** atau **Pasangan
Pengamatan N** menampilkan berapa banyak kolom identitas yang berbeda (atau
**Tidak ada perbedaan**); **Periksa perbedaan** menyebutkan namanya, atau
menyatakan **Identik di setiap kolom bernama.** Halaman ini tidak pernah
menyatakan sisi mana yang benar.

Tidak ada apa pun di halaman ini yang disimpan atau dikirim ke mana pun;
memuat ulang menghapusnya.
