<!-- translation-of: docs/user/Distribution.md source-hash: f97c16f677fc5882 -->
# Mendistribusikan Karya Anda

<!-- languages -->
[English](../Distribution.md) · [Deutsch](../de/Distribution.md) · [Español](../es/Distribution.md) · [Français](../fr/Distribution.md) · **Bahasa Indonesia** · [日本語](../ja/Distribution.md) · [한국어](../ko/Distribution.md) · [Português (Brasil)](../pt-BR/Distribution.md)
<!-- /languages -->

Semua yang Anda buat di ForkBuild berawal di perangkat Anda sendiri.
**Mendistribusikan** menaruhnya di jaringan terdesentralisasi, agar orang
yang tidak terhubung dengan Anda bisa menemukannya, mengambilnya, dan
memeriksa bahwa itu milik Anda. Ini opsional, dan berbeda dari
menerbitkan.

Halaman ini menunjukkan apa yang bisa Anda distribusikan, ke mana, dan apa
yang Anda perlukan. Setiap bagian menautkan ke panduan yang berisi
detailnya.

## Menerbitkan, berbagi, mendistribusikan: tiga hal yang berbeda

| Tindakan | Ke mana perginya | Siapa yang menerimanya | Panduan |
|---|---|---|---|
| **Terbitkan** | Perangkat ini, dan setelah Anda memilih ke mana bangunan Anda dikirim, juga ke sana | Belum ada orang lain sampai saat itu; lalu siapa pun | [Menerbitkan karya Anda](04-PublishingAndForking.md#menerbitkan-karya-anda), [Ke mana dikirim](04-PublishingAndForking.md#ke-mana-dikirim--mengirim-bangunan-saat-menerbitkan) |
| **Bagikan dengan Rekan** | Langsung ke orang-orang yang terhubung dengan Anda | Rekan yang terhubung, selama Anda daring | [Berbagi dengan rekan yang terhubung](04-PublishingAndForking.md#berbagi-dengan-rekan-yang-terhubung) |
| **Distribusikan** | Jaringan terdesentralisasi (IPFS, Arweave, Nostr, Steem, Blurt) | Siapa pun, tanpa perlu terhubung dengan Anda | Halaman ini |

Menerbitkan tidak mengirim apa pun ke mana pun dengan sendirinya sampai
Anda memilih ke mana bangunan Anda dikirim. Anda memilihnya di **Ke mana
dikirim** pada Editor: dengan **Kirim ke sini setiap kali aku menerbitkan**
tercentang, setiap kali Anda menerbitkan bangunan bertanda tangan, bangunan
itu juga didistribusikan ke sana. Hapus centang untuk berhenti.

Berbagi dengan rekan bukan distribusi. Rekan menyimpan salinan hanya
selama mereka mau, dan tidak ada orang lain yang bisa menemukannya.

## Tiga peran yang dapat dimainkan sebuah jaringan

Mendistribusikan memakai hingga tiga jenis jaringan, masing-masing dipilih
terpisah:

| Peran | Seperti… | Apa yang dilakukannya | Pilihan |
|---|---|---|---|
| **Konten** (Penyimpanan) | Tempat salinan cetak disimpan | Menyimpan byte, seperti balok-balok Dunia Anda, agar orang lain dapat mengambilnya | **Arweave**, **Blurt** *(eksperimental)*, **IPFS (Local Kubo)**, **IPFS (Remote Pinning)**, **Steem** *(eksperimental)* |
| **Pengumuman / Penemuan** | Entri di katalog perpustakaan | Menerbitkan pemberitahuan kecil bertanda tangan bahwa karya Anda ada dan di mana salinannya, agar orang lain dapat menemukannya | **Nostr**, **Arweave**, **Steem** *(eksperimental)*, **Blurt** *(eksperimental)* |
| **Bukti / Penjangkaran** *(eksperimental, opsional)* | Stempel notaris | Menuliskan hash konten Anda ke blockchain, sebagai bukti bahwa konten itu sudah ada pada waktu tersebut. Peran ini tidak menyimpan atau mengumumkan apa pun. | **Bitcoin**, **Arweave**, **Base**, **Steem**, **Blurt** |

Anda memerlukan dua peran pertama bersama-sama. Karya yang disimpan tanpa
diumumkan sulit ditemukan, dan pengumuman tanpa ada yang disimpan tidak
menunjuk ke apa pun. **Distribusikan** melakukan keduanya dengan satu
klik. Penjangkaran adalah tambahan, dan dilakukan terpisah di halaman
**Catatan Bertanda Tangan**.

Atur pilihan biasa Anda untuk setiap peran di
[Pengaturan Jaringan](10-NetworkSettings.md):
[Penyedia Konten](10-NetworkSettings.md#penyedia-konten),
[Penyedia Pengumuman / Penemuan](10-NetworkSettings.md#penyedia-pengumuman--penemuan),
dan [Penyedia Bukti / Penjangkaran](10-NetworkSettings.md#penyedia-bukti--penjangkaran).
Pengaturan ini hanya mengisi pilihan pertama setiap pemilih; menyimpannya
tidak pernah mengirim apa pun.

## Apa yang dapat Anda distribusikan

| Apa | Konten | Pengumuman / Penemuan | Bukti / Penjangkaran | Di mana Anda melakukannya |
|---|---|---|---|---|
| **Klaim Bertanda Tangan Dunia Anda** (catatan bertanda tangan dari Dunia yang diterbitkan, disebut Dunia Bersama) | Arweave, IPFS, Steem, atau Blurt | Nostr, Arweave, Steem, atau Blurt | — | **Distribusikan** setelah menerbitkan di Editor; **Dunia Bersama Saya** di Tampilan Dunia; halaman **Catatan Bertanda Tangan** |
| **Snapshot Dunia Anda** (balok-baloknya), beserta tempat Anda menempatkannya | Arweave, IPFS, Steem, atau Blurt | Nostr, Arweave, Steem, atau Blurt | — | Dialog **Distribusikan** yang sama (**Distribusikan Snapshot saja** untuk separuh ini saja) |
| **Hash konten catatan apa pun** (Dunia, klaim kepengarangan, atau nama tempat) | — | — | Bitcoin, Arweave, Base, Steem, atau Blurt | Kartu catatan itu di halaman **Catatan Bertanda Tangan** |
| **Kepengarangan sebuah struktur** (Atribusi Cetak Biru) | Arweave, IPFS, Steem, atau Blurt | Nostr, Arweave, Steem, atau Blurt | — | **Distribusikan** di panel **Info** struktur, yang ditawarkan begitu Anda **Terbitkan ke Jaringan**; halaman **Catatan Bertanda Tangan** |
| **Nama tempat** (Klaim Nama Tempat) | Arweave, IPFS, Steem, atau Blurt | Nostr, Arweave, Steem, atau Blurt | — | **Distribusikan** di panel penamaan Tampilan Dunia, yang ditawarkan begitu Anda **Terbitkan Sebuah Nama** (mengumumkan nama itu di jaringan yang Anda pilih); halaman **Catatan Bertanda Tangan** untuk pilihan mana pun |
| **Komentar** pada sebuah publikasi | — | Nostr, Arweave, Steem, atau Blurt, atau tidak ada (**Lokal & rekan saja**) | — | **Kirim Komentar**, di Jelajahi atau Tampilan Dunia, di jaringan yang dipilih di sebelahnya; nanti, **Distribusikan** di bawah komentar Anda sendiri |

Snapshot sebuah Dunia membawa penempatan bertanda tangan Anda, sehingga
orang yang mengambilnya melihat bangunan itu tepat di tempat Anda
menaruhnya.

### Klaim Bertanda Tangan dan Snapshot: dua separuh dari satu Dunia

Dunia yang diterbitkan didistribusikan dalam dua bagian terpisah:

| | Klaim Bertanda Tangan | Snapshot |
|---|---|---|
| **Seperti…** | Kartu katalog yang dinotariskan | Salinan cetak di rak, berlabel tempat letaknya |
| **Isinya** | Judul Dunia, Anda sebagai pembuatnya, lisensinya, Dunia asal remix-nya (jika ada), dan **hash konten**-nya, sidik jari balok-baloknya, semuanya ditandatangani dengan identitas Anda | Setiap balok Dunia, ditambah penempatan bertanda tangan Anda: tempat Anda menaruhnya di Tampilan Dunia |
| **Ukuran** | Beberapa kilobyte | Sebesar bangunannya: hingga 256 KB di Arweave, tanpa batas di IPFS |
| **Yang dibuktikannya** | Bahwa Anda menerbitkan Dunia ini, dengan sidik jari persis ini | Tidak ada dengan sendirinya; siapa pun yang mengambilnya memeriksa balok-baloknya terhadap hash konten |
| **Kegunaannya** | Tautan berbagi, dan **Temukan Dunia Bersama** yang mencari Dunia Anda dan memeriksanya | Menampilkan bangunan Anda di Tampilan Dunia, di tempat Anda menaruhnya, kepada orang yang berjalan di dekatnya |

Hash konten mengikat keduanya: siapa pun yang memegang balok-baloknya dapat
memeriksa bahwa balok-balok itu cocok dengan sidik jari pada catatan
bertanda tangan Anda.

Kedua separuh memakai kedua peran: masing-masing disimpan di jaringan Konten
yang Anda pilih dan diumumkan di jaringan Pengumuman / Penemuan yang Anda
pilih. Dengan IPFS dan Nostr, misalnya, **Distribusikan** menyimpan Snapshot
di IPFS dan mengumumkannya di Nostr, lalu menyimpan Klaim Bertanda Tangan di
IPFS dan mengumumkannya di Nostr juga.

Setiap separuh berguna dengan sendirinya, itulah sebabnya dialog
**Distribusikan** melaporkannya secara terpisah dan memungkinkan Anda
mencoba ulang salah satunya dengan **Distribusikan Snapshot saja** atau
**Distribusikan Klaim Bertanda Tangan saja**:

- **Snapshot saja:** bangunan Anda muncul di Tampilan Dunia bagi orang di
  dekatnya, tetapi tidak ada catatan bertanda tangan atas publikasi itu di
  baliknya.
- **Klaim Bertanda Tangan saja:** orang dapat menemukan Dunia Anda dan
  memastikan bahwa itu milik Anda, tetapi tidak dapat mengambil
  balok-baloknya dari jaringan. Rekan yang terhubung dengan Anda masih dapat
  mengambilnya langsung dari Anda selama Anda daring.

Detail:

- Klaim Bertanda Tangan dan Snapshot:
  [Ke mana dikirim](04-PublishingAndForking.md#ke-mana-dikirim--mengirim-bangunan-saat-menerbitkan),
  [Dunia Bersama Saya](WorldViewAdvancedTools.md#dunia-bersama-saya--mendistribusikan-snapshot-anda-sendiri-tanpa-rekan),
  dan [dialog Distribusikan](WorldViewAdvancedTools.md#perjumpaan-dunia--publikasi-dan-avatar-yang-dibagikan-rekan-anda)
  itu sendiri.
- Halaman Catatan Bertanda Tangan:
  [Mendistribusikan dari halaman Catatan Bertanda Tangan](09-PublicationsAndEvidence.md#mendistribusikan-dari-halaman-catatan-bertanda-tangan),
  [Penempatan Snapshot](11-EvidenceAndStorage.md#penempatan-snapshot), dan
  [Penerbitan IPFS](11-EvidenceAndStorage.md#penerbitan-ipfs).
- Penjangkaran: [Bukti Eksternal](11-EvidenceAndStorage.md#bukti-eksternal),
  [Alur Jangkar Bitcoin](11-EvidenceAndStorage.md#alur-jangkar-bitcoin),
  dan [Alur Jangkar Base](11-EvidenceAndStorage.md#alur-jangkar-base).
- Kepengarangan: [Mengklaim kepengarangan sebuah struktur](09-PublicationsAndEvidence.md#mengklaim-kepengarangan-sebuah-struktur).
- Nama tempat: [Memberi nama tempat](09-PublicationsAndEvidence.md#memberi-nama-tempat).
- Komentar: [Cara komentar berpindah](09-PublicationsAndEvidence.md#cara-komentar-berpindah).

## Apa yang tetap pada Anda atau rekan Anda

Tidak semua yang Anda buat didistribusikan. Hal-hal berikut tidak pernah
masuk ke jaringan di atas:

| Apa | Ke mana perginya | Panduan |
|---|---|---|
| Dunia yang Anda **Bagikan dengan Rekan** | Hanya rekan yang terhubung | [Berbagi dengan rekan yang terhubung](04-PublishingAndForking.md#berbagi-dengan-rekan-yang-terhubung) |
| Posisi langsung dan tampilan avatar Anda | Rekan yang terhubung, sesuai izin pengaturan visibilitas Anda | [Siapa yang dapat melihat Anda](06-AvatarsAndPresence.md#siapa-yang-dapat-melihat-anda-dua-pengaturan-terpisah) |
| Pesan obrolan dan panggilan suara | Langsung ke teman yang sedang Anda ajak bicara | [Obrolan & Percakapan](08-ChatAndConversations.md) |
| Jangkar dan penempatan yang Anda tukar dengan **Sinkronkan dengan Rekan** | Hanya rekan yang terhubung | [Desentralisasi sekilas](09-PublicationsAndEvidence.md#desentralisasi-sekilas) |
| Identitas Anda, struktur yang disimpan, kendaraan dan hewan yang Anda bawa, teman, pengaturan | Perangkat ini, kecuali Anda mengekspor atau mencadangkannya | [Data Anda](13-YourData.md) |

Untuk memindahkan semua ini ke perangkat lain, atau memberikannya kepada
seseorang, gunakan ekspor dan pencadangan lengkap di
[Data Anda](13-YourData.md).

## Apa yang dibutuhkan setiap jaringan

Distribusi ditandatangani oleh ekstensi browser atau dompet yang Anda pasang
sendiri; ForkBuild tidak pernah melihat kunci Anda. Tanpa ekstensi yang
sesuai, upaya itu berakhir dengan pemberitahuan bahwa distribusi tidak dapat
diselesaikan.

| Jaringan | Peran | Yang Anda perlukan | Batas dan catatan |
|---|---|---|---|
| **Nostr** | Pengumuman / Penemuan | Ekstensi penanda tangan Nostr, seperti nos2x | Mengumumkan ke setiap relay di [Relay Nostr](10-NetworkSettings.md#relay-nostr) sekaligus; makin banyak relay, makin banyak orang yang dapat menemukan Anda |
| **Arweave** | Konten, Pengumuman / Penemuan, Bukti / Penjangkaran | Ekstensi dompet Arweave, seperti Wander | Menyimpan hingga 256 KB per Snapshot, sekitar delapan ribu balok; yang lebih besar ditolak sebelum ditandatangani. Permanen: tetap tersedia saat komputer Anda mati. Unggahan baru dapat memerlukan beberapa menit untuk sampai ke gateway. |
| **IPFS (Local Kubo)** | Konten | Node IPFS Anda sendiri, secara bawaan di `http://127.0.0.1:5001` | Tanpa batas ukuran. Hanya tersedia selama node Anda daring, kecuali ada orang lain yang mem-pin-nya. |
| **IPFS (Remote Pinning)** *(eksperimental)* | Konten | Akun di layanan pinning yang kompatibel dengan Pinata | Tanpa batas ukuran. Siapkan layanannya sekali di [Penyedia Konten](10-NetworkSettings.md#penyedia-konten); token diminta sekali per kunjungan dan tidak pernah disimpan. |
| **Steem** *(eksperimental)* | Konten, Pengumuman / Penemuan, Bukti / Penjangkaran | Ekstensi Steem Keychain dengan kunci posting Anda, dan akun Anda di [Pengaturan Jaringan → Steem](10-NetworkSettings.md#steem) | Postingan berupa balasan pada utas bulanan ForkBuild; satu persetujuan per postingan. Menyimpan sekitar 2.500 balok per postingan, hingga sekitar 30.000 balok dalam 20 postingan. Memakai Resource Credits, yang terisi kembali. |
| **Blurt** *(eksperimental)* | Konten, Pengumuman / Penemuan, Bukti / Penjangkaran | Ekstensi Blurt Keychain (atau WhaleVault) dengan kunci posting Anda, dan akun Anda di [Pengaturan Jaringan → Blurt](10-NetworkSettings.md#blurt) | Satu postingan utama dari akun Anda sendiri per bangunan, yang tetap menerima pembayarannya; data yang disimpan ada di balasan di bawahnya. Menyimpan sekitar 2.500 balok per balasan, hingga sekitar 30.000 balok. Setiap transaksi dikenai biaya kecil dalam BLURT. |
| **Bitcoin** *(eksperimental)* | Bukti / Penjangkaran | Ekstensi UniSat, dengan bitcoin di alamat native SegWit (`bc1q…`) untuk biayanya | Dibuat melalui langkah-langkah dompet di halaman Catatan Bertanda Tangan |
| **Base** *(eksperimental)* | Bukti / Penjangkaran | Dompet browser seperti MetaMask atau Coinbase Wallet, di jaringan Base | Setiap jangkar adalah transaksi yang Anda periksa dan tanda tangani |

Jangkar Steem cepat dan gratis, tetapi dibuktikan oleh witness Steem, bukan
oleh proof of work: gunakan bersama jangkar Bitcoin, bukan sebagai
penggantinya. Lihat [Steem](11-EvidenceAndStorage.md#steem). Hal yang sama berlaku
untuk jangkar Blurt, yang tidak memakan biaya apa pun bila postingan Blurt
bangunan Anda sudah memuat hash kontennya; lihat [Blurt](11-EvidenceAndStorage.md#blurt).

## Alur yang umum

1. **Terbitkan** Dunia Anda di Editor (lihat
   [Menerbitkan karya Anda](04-PublishingAndForking.md#menerbitkan-karya-anda)).
2. Klik **Distribusikan** pada pemberitahuan yang muncul. Anda juga bisa
   melakukannya nanti, di **Dunia Bersama Saya** dalam Tampilan Dunia.
3. Pilih **Penyimpanan** dan **Substrat Pengumuman / Penemuan**: misalnya
   IPFS dan Nostr, atau Arweave untuk keduanya. Klik **Distribusikan**.
4. Ia mengirim Snapshot, lalu Klaim Bertanda Tangan, dan menampilkan hasil
   untuk masing-masing. Jika salah satu gagal, ulangi yang itu saja dengan
   tombol **Distribusikan … saja** miliknya.
5. *Opsional:* di halaman **Catatan Bertanda Tangan**, jangkarkan catatan itu
   (misalnya dengan **Jangkarkan di Arweave**) untuk mencatat kapan ia ada.
6. Klik **Bagikan…** atau **Salin tautan** di bawah hasilnya. Tautan itu
   membuka bangunan Anda di perangkat apa pun, siap di-remix atau
   dijelajahi.

Bangunan yang terlalu besar untuk Arweave (lebih dari 256 KB) bisa ke IPFS
saja. Rekan yang terhubung dengan Anda bisa mengambil bangunan hingga 64 MB
langsung dari Anda.

## Memeriksa apakah berhasil

- **Di kartu Anda sendiri.** Kartu bangunan Anda di **Jelajahi**
  menyebutkan di mana perangkat ini mencatat distribusinya: misalnya
  **Disimpan di IPFS · Diumumkan di Nostr**, atau **Tidak ada distribusi
  yang tercatat di perangkat ini.** Lihat
  [Publikasi Anda](13-YourData.md#publikasi-anda).
- **Bagi orang lain.** **Jelajahi** mereka menemukan bangunan Anda di
  Nostr, Arweave, Steem, atau Blurt saat mereka membukanya lagi, asalkan
  diumumkan dengan tag penemuan yang biasa, `forkbuild-publication`. Lihat
  [Karya yang didistribusikan orang lain](04-PublishingAndForking.md#karya-yang-didistribusikan-orang-lain).
- **Langsung dari jaringan.** **Temukan Dunia Bersama** di Tampilan Dunia
  mencari Dunia Anda di Arweave dan Nostr lalu memeriksanya: apakah
  benar-benar ada di luar sana, utuh? Lihat
  [Temukan Dunia Bersama](WorldViewAdvancedTools.md#temukan-dunia-bersama--mencari-langsung-di-jaringan-terdesentralisasi).
- **Di halaman Catatan Bertanda Tangan.** **Verifikasi Konten IPFS** mengambil kembali
  unggahan IPFS dan membandingkannya dengan hash-nya. **Verifikasi Bukti**
  memeriksa jangkar.

Distribusi tidak bisa dibatalkan: begitu sesuatu disimpan atau diumumkan,
orang lain mungkin sudah punya salinannya. **Batalkan Penerbitan** hanya
mengeluarkan Dunia dari katalog Anda sendiri. Perangkat ini lalu ingat
untuk tidak mencantumkan lagi salinan yang Anda distribusikan saat
Jelajahi mencari di jaringan.
