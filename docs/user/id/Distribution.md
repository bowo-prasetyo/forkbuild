<!-- translation-of: docs/user/Distribution.md source-hash: 9c6ca1cfed3b4863 -->
# Mendistribusikan Karya Anda

<!-- languages -->
[English](../Distribution.md) · [Deutsch](../de/Distribution.md) · [Español](../es/Distribution.md) · [Français](../fr/Distribution.md) · **Bahasa Indonesia** · [日本語](../ja/Distribution.md) · [한국어](../ko/Distribution.md) · [Português (Brasil)](../pt-BR/Distribution.md)
<!-- /languages -->

<!-- stale -->
> **Catatan:** Halaman berbahasa Inggris ini telah diubah sejak diterjemahkan, jadi terjemahan ini mungkin sudah tidak sesuai. Lihat [versi bahasa Inggris](../Distribution.md).
<!-- /stale -->

Semua yang dibuat ForkBuild dimulai di perangkat Anda sendiri.
**Mendistribusikan** adalah langkah terpisah yang opsional untuk menaruh
karya Anda di jaringan terdesentralisasi, sehingga orang yang tidak
terhubung dengan Anda dapat menemukan, mengambil, dan memeriksanya. Halaman
ini mengumpulkan di satu tempat apa saja yang dapat Anda distribusikan, ke
mana semuanya dapat dikirim, dan apa yang Anda perlukan. Setiap bagian
menautkan ke panduan yang menjelaskan detailnya.

## Menerbitkan, berbagi, mendistribusikan: tiga hal yang berbeda

| Tindakan | Ke mana perginya | Siapa yang menerimanya | Panduan |
|---|---|---|---|
| **Terbitkan** | Hanya perangkat ini | Belum ada orang lain | [Menerbitkan karya Anda](04-PublishingAndForking.md#menerbitkan-karya-anda) |
| **Bagikan dengan Rekan** | Langsung ke orang-orang yang terhubung dengan Anda | Rekan yang terhubung, selama Anda daring | [Berbagi dengan rekan yang terhubung](04-PublishingAndForking.md#berbagi-dengan-rekan-yang-terhubung) |
| **Distribusikan** | Jaringan terdesentralisasi (IPFS, Arweave, Nostr, Steem) | Siapa pun, tanpa perlu terhubung dengan Anda | Halaman ini |

Menerbitkan tidak pernah mengirim apa pun ke mana pun dengan sendirinya, dan
berbagi dengan rekan bukanlah distribusi: rekan menyimpan salinan hanya
selama mereka mau, dan orang lain tidak dapat menemukannya. Setiap
distribusi adalah klik tersendiri yang disengaja.

## Tiga peran yang dapat dimainkan sebuah jaringan

Mendistribusikan memakai hingga tiga jenis jaringan, masing-masing dipilih
terpisah:

| Peran | Seperti… | Apa yang dilakukannya | Pilihan |
|---|---|---|---|
| **Konten** (Penyimpanan) | Tempat salinan cetak disimpan | Menyimpan byte, seperti balok-balok Dunia Anda, agar orang lain dapat mengambilnya | **Arweave**, **IPFS (Local Kubo)**, **IPFS (Remote Pinning)**, **Steem** *(eksperimental)* |
| **Pengumuman / Penemuan** | Entri di katalog perpustakaan | Menerbitkan pemberitahuan kecil bertanda tangan bahwa karya Anda ada dan di mana salinannya, agar orang lain dapat menemukannya | **Nostr**, **Arweave**, **Steem** *(eksperimental)* |
| **Bukti / Penjangkaran** *(eksperimental, opsional)* | Stempel notaris | Menuliskan hash konten Anda ke blockchain, sebagai bukti bahwa konten itu sudah ada pada waktu tersebut. Peran ini tidak menyimpan atau mengumumkan apa pun. | **Bitcoin**, **Arweave**, **Base**, **Steem** |

Penyimpanan tanpa pengumuman berarti tidak ada yang tahu harus mencari di
mana; pengumuman tanpa penyimpanan menunjuk ke kekosongan.
**Distribusikan** melakukan keduanya dengan satu klik. Penjangkaran adalah
tambahan, dan dilakukan terpisah di halaman **Publikasi**.

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
| **Klaim Bertanda Tangan Dunia Anda** (catatan bertanda tangan dari Dunia yang diterbitkan, disebut Dunia Bersama) | Arweave, IPFS, atau Steem | Nostr, Arweave, atau Steem | — | **Distribusikan** setelah menerbitkan di Editor; **Dunia Bersama Saya** di Tampilan Dunia; halaman **Publikasi** |
| **Snapshot Dunia Anda** (balok-baloknya), beserta tempat Anda menempatkannya | Arweave, IPFS, atau Steem | Nostr, Arweave, atau Steem | — | Dialog **Distribusikan** yang sama (**Distribusikan Snapshot saja** untuk separuh ini saja) |
| **Hash konten publikasi apa pun** (Dunia, klaim kepengarangan, atau nama tempat) | — | — | Bitcoin, Arweave, Base, atau Steem | Kartu publikasi itu di halaman **Publikasi** |
| **Kepengarangan sebuah struktur** (Atribusi Cetak Biru) | Arweave, IPFS, atau Steem | Nostr, Arweave, atau Steem | — | **Distribusikan** di panel **Info** struktur, yang ditawarkan begitu Anda **Terbitkan ke Jaringan**; halaman **Publikasi** |
| **Nama tempat** (Klaim Nama Tempat) | Arweave, IPFS, atau Steem | Nostr, Arweave, atau Steem | — | **Distribusikan** di panel penamaan Tampilan Dunia, yang ditawarkan begitu Anda **Terbitkan Sebuah Nama** (mengumumkan nama itu di jaringan yang Anda pilih); halaman **Publikasi** untuk pilihan mana pun |
| **Komentar** pada sebuah publikasi | — | Nostr, Arweave, atau Steem | — | **Kirim Komentar**, di Repositori atau Tampilan Dunia, di jaringan yang dipilih di sebelahnya |

Snapshot sebuah Dunia membawa penempatan bertanda tangan Anda, sehingga
orang yang mengambilnya melihat bangunan itu tepat di tempat Anda
menaruhnya.

Detail:

- Klaim Bertanda Tangan dan Snapshot:
  [Mendistribusikan langsung dari Editor](04-PublishingAndForking.md#mendistribusikan-langsung-dari-editor),
  [Dunia Bersama Saya](03-WorldView.md#dunia-bersama-saya--mendistribusikan-snapshot-anda-sendiri-tanpa-rekan),
  dan [dialog Distribusikan](03-WorldView.md#perjumpaan-dunia--publikasi-dan-avatar-yang-dibagikan-rekan-anda)
  itu sendiri.
- Halaman Publikasi:
  [Mendistribusikan dari halaman Publikasi](09-PublicationsAndEvidence.md#mendistribusikan-dari-halaman-publikasi),
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
| **IPFS (Remote Pinning)** *(eksperimental)* | Konten | Akun di layanan pinning yang kompatibel dengan Pinata | Tanpa batas ukuran. Ketik endpoint dan kredensial setiap kali; keduanya tidak pernah disimpan. |
| **Steem** *(eksperimental)* | Konten, Pengumuman / Penemuan, Bukti / Penjangkaran | Ekstensi Steem Keychain dengan kunci posting Anda, dan akun Anda di [Pengaturan Jaringan → Steem](10-NetworkSettings.md#steem) | Postingan berupa balasan pada utas bulanan ForkBuild; satu persetujuan per postingan. Menyimpan sekitar 2.500 balok per postingan, hingga sekitar 30.000 balok dalam 20 postingan. Memakai Resource Credits, yang terisi kembali. |
| **Bitcoin** *(eksperimental)* | Bukti / Penjangkaran | Ekstensi UniSat, dengan bitcoin di alamat native SegWit (`bc1q…`) untuk biayanya | Dibuat melalui langkah-langkah dompet di halaman Publikasi |
| **Base** *(eksperimental)* | Bukti / Penjangkaran | Dompet browser seperti MetaMask atau Coinbase Wallet, di jaringan Base | Setiap jangkar adalah transaksi yang Anda periksa dan tanda tangani |

Jangkar Steem cepat dan gratis, tetapi dibuktikan oleh witness Steem, bukan
oleh proof of work: gunakan bersama jangkar Bitcoin, bukan sebagai
penggantinya. Lihat [Steem](11-EvidenceAndStorage.md#steem).

## Alur yang umum

1. **Terbitkan** Dunia Anda di Editor (lihat
   [Menerbitkan karya Anda](04-PublishingAndForking.md#menerbitkan-karya-anda)).
2. Klik **Distribusikan** di pemberitahuan yang muncul, atau nanti di bawah
   **Dunia Bersama Saya** di Tampilan Dunia.
3. Pilih **Penyimpanan** dan **Substrat Pengumuman / Penemuan**, misalnya
   IPFS dan Nostr, atau Arweave untuk keduanya, lalu klik **Distribusikan**.
   Snapshot didistribusikan lebih dulu, lalu Klaim Bertanda Tangan, dan
   hasil masing-masing dilaporkan terpisah. Jika salah satu separuh gagal,
   ulangi separuh itu saja dengan tombol **Distribusikan … saja** miliknya.
4. Jika mau, di halaman **Publikasi**, jangkarkan publikasi itu (misalnya
   **Jangkarkan di Arweave**) untuk mencatat kapan publikasi itu sudah ada.
5. Klik **Bagikan…** atau **Salin tautan** di bawah hasilnya untuk memberi
   orang tautan yang membuka bangunan Anda di Tampilan Dunia di perangkat
   apa pun.

Untuk bangunan yang lebih besar dari batas 256 KB Arweave, pilih IPFS. Rekan
yang terhubung dengan Anda tetap dapat mengambil bangunan hingga 64 MB
langsung dari Anda.

## Memeriksa apakah berhasil

- Kartu Repositori bangunan Anda menyebutkan di mana perangkat ini mencatat
  distribusinya, misalnya **Disimpan di IPFS · Diumumkan di Nostr**, atau
  **Tidak ada distribusi yang tercatat di perangkat ini.** Lihat
  [Publikasi Anda](13-YourData.md#publikasi-anda).
- **Temukan Dunia Bersama** di Tampilan Dunia mencari Dunia Bersama Anda
  langsung di Arweave dan Nostr lalu memeriksanya, sehingga menjawab
  pertanyaan "apakah publikasi saya benar-benar ada di luar sana, dan
  utuh?" Lihat
  [Temukan Dunia Bersama](03-WorldView.md#temukan-dunia-bersama--mencari-langsung-di-jaringan-terdesentralisasi).
- Di halaman Publikasi, **Verifikasi Konten IPFS** mengambil kembali
  unggahan IPFS dan membandingkannya dengan hash-nya, dan
  **Verifikasi Bukti** memeriksa sebuah jangkar.

Distribusi tidak dapat ditarik kembali: begitu sesuatu diumumkan atau
disimpan, orang lain mungkin sudah memiliki salinannya.
**Batalkan Penerbitan** hanya menghapus Dunia dari katalog Anda sendiri.
