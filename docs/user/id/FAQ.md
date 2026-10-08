<!-- translation-of: docs/user/FAQ.md source-hash: e15721b99cda6db7 -->
# Pertanyaan Umum

<!-- languages -->
[English](../FAQ.md) · [Deutsch](../de/FAQ.md) · [Español](../es/FAQ.md) · [Français](../fr/FAQ.md) · **Bahasa Indonesia** · [日本語](../ja/FAQ.md) · [한국어](../ko/FAQ.md) · [Português (Brasil)](../pt-BR/FAQ.md)
<!-- /languages -->

Jawaban singkat atas pertanyaan yang paling sering muncul, masing-masing
dengan tautan ke panduan yang menjelaskannya secara lengkap.

## Menerbitkan dan berbagi

### Saya sudah menerbitkan karya saya, tetapi teman saya tidak menemukannya di Repositori mereka

Menerbitkan hanya menyimpan karya di perangkat Anda sendiri dan
mencantumkannya di Repositori *Anda*. Tidak ada yang dikirim ke mana pun
sampai Anda memilihnya:

- **Bagikan dengan Rekan**, di bawah karya Anda di Repositori, menawarkan
  karya itu kepada orang-orang yang terhubung dengan Anda. Perangkat Teman
  atau Rekan yang Dikenal menambahkannya dengan sendirinya; orang lain
  melihatnya di **Dibagikan kepada Anda** dan mengeklik **Ambil**. Anda
  perlu terhubung pada saat yang sama agar karya itu sampai.
- **Distribusikan** mengunggahnya ke Arweave atau IPFS (atau, secara
  eksperimental, Steem atau Blurt) dan mengumumkannya, sehingga orang dapat
  menemukannya tanpa terhubung dengan Anda.

Lihat [Penerbitan & Fork](04-PublishingAndForking.md#berbagi-dengan-rekan-yang-terhubung).

### Bagaimana cara membuat karya saya tersedia untuk semua orang?

Distribusikan: simpan di Arweave atau IPFS (atau, secara eksperimental,
Steem atau Blurt) dan umumkan di Nostr atau Arweave (atau Steem atau Blurt), sehingga siapa pun
dapat menemukan dan memeriksanya tanpa terhubung dengan Anda. Klik
**Distribusikan** tepat setelah menerbitkan, atau di bawah
**Dunia Bersama Saya** di Tampilan Dunia. Anda memerlukan ekstensi browser
penanda tangan untuk jaringan yang Anda pilih, seperti Wander untuk Arweave
atau nos2x untuk Nostr. [Mendistribusikan Karya Anda](Distribution.md)
mencantumkan semua yang dapat Anda distribusikan, ke mana semuanya dapat
dikirim, dan apa yang dibutuhkan setiap jaringan.

### Mengapa tidak ada yang bisa mem-fork karya saya?

Dokumen baru tidak memiliki lisensi, dan karya tanpa lisensi tidak dapat
di-fork. Buka **Properti Dokumen** (tombol **✎** di samping judul dokumen
di Editor), pilih lisensi yang mengizinkan fork (lisensi CC apa pun kecuali
CC BY-ND), lalu terbitkan lagi. Pengaturan ini termasuk bagian dari apa
yang diterbitkan, jadi karya yang sudah Anda terbitkan tetap memakai
lisensinya yang lama. Lihat
[Choosing a license](04-PublishingAndForking.md#memilih-lisensi).

### Penerbitan gagal. Apa arti pesannya?

Alasan setelah "Gagal menerbitkan:" ditampilkan dalam bahasa Inggris.

- **a title is required before publishing** (judul diperlukan sebelum
  menerbitkan) — beri karya itu judul di **Properti Dokumen**.
- **cannot publish an empty world** (dunia kosong tidak dapat diterbitkan)
  — tempatkan setidaknya satu balok terlebih dahulu.
- **cannot sign, identity is locked** (tidak dapat menandatangani,
  identitas terkunci) — identitas Anda terkunci dengan sendirinya; klik
  **Buka Kunci** di samping nama Anda di bilah atas dan terbitkan lagi.

### Apakah saya harus masuk untuk menerbitkan?

Menerbitkan tetap bisa saat Anda belum masuk, tetapi hasilnya tidak
memiliki pembuat dan tanda tangan, sehingga tidak dapat Anda bagikan kepada
rekan atau distribusikan nanti. Masuklah sebelum menerbitkan.

### Bisakah saya membatalkan penerbitan?

Bisa: buka Dunia itu di Tampilan Dunia, lalu di **Dunia Bersama Saya**
pilih **Lainnya ▾ → Batalkan Penerbitan…**. Dunia itu dihapus dari
Repositori Anda. Salinan yang sudah diterima orang lain atau apa pun yang
sudah Anda distribusikan ke Arweave, IPFS, Nostr, Steem, atau Blurt tidak dapat
ditarik kembali. Perangkat ini tetap mengingat apa yang Anda batalkan
penerbitannya, sehingga pencarian Repositori di jaringan tidak akan
menampilkan salinan itu lagi di sini; perangkat lain dan orang lain masih
bisa menemukannya.

### Seseorang menempatkan bangunan saya di Dunia mereka. Apakah bangunan saya dipindahkan?

Tidak. Penempatan hanya menyatakan di mana Dunia *mereka* menampilkan
bangunan Anda; bangunan Anda tetap di tempat yang Anda tentukan, dan tetap
membawa nama serta riwayat Anda. Jika Anda tidak menginginkannya, pilih
**Hanya saya yang boleh menempatkannya** di bawah **Siapa yang dapat
menempatkannya di Dunia** sebelum Anda menerbitkan. Lihat
[Mengapa saya bisa menempatkan bangunan orang lain?](03-WorldView.md#mengapa-saya-bisa-menempatkan-bangunan-orang-lain).

### Mengapa ada dua bangunan di tempat yang sama?

Penempatan tidak mengklaim lahan, dan tidak ada server pusat yang
menentukan siapa yang lebih dulu mendapatkan suatu tempat, jadi dua
penempatan bisa menunjuk titik yang sama. Anda diperingatkan sebelum
memindahkan salah satu bangunan Anda ke tempat yang sudah terisi. Lihat
[Mengapa dua bangunan bisa berada di tempat yang sama?](03-WorldView.md#mengapa-dua-bangunan-bisa-berada-di-tempat-yang-sama).

## Identitas dan data Anda

### Saya lupa frasa sandi saya. Bisakah diatur ulang?

Tidak. Frasa sandi adalah satu-satunya cara untuk mendekripsi kunci
identitas itu, dan tidak ada server yang menyimpan salinannya. Jika Anda
pernah mengekspor identitas itu, Anda tetap memerlukan frasa sandi yang
Anda pilih untuk ekspornya. Jika tidak, buat identitas baru. Lihat
[Identitas & Masuk](05-IdentityAndLogin.md).

### Mengapa identitas saya terus terkunci sendiri?

Identitas yang dilindungi terkunci **15 menit setelah Anda membukanya**,
meskipun Anda sedang memakai aplikasi, dan setiap kali Anda memuat ulang
halaman. Membangun dan menyimpan tetap berfungsi saat terkunci;
menerbitkan, menjadi dapat ditemukan, dan bergabung ke lobi mengharuskan
Anda membukanya lagi.

### Bagaimana cara memindahkan pekerjaan saya ke komputer atau browser lain?

Tidak ada yang tersinkron dengan sendirinya. Untuk memindahkan semuanya,
cadangkan di **Data Anda** dan pulihkan file itu di perangkat lain (lihat
[Data Anda](13-YourData.md)). Untuk memindahkan satu jenis saja:

- **Dokumen**: **Ekspor** di bilah alat Editor, atau **Ekspor Semua
  Dokumen** di bagian bawah **Terbaru**, lalu **Impor** di perangkat lain.
- **Struktur Anda sendiri**: **Ekspor Cetak Biru** dari menu **⋮** pada
  kartunya, atau **Ekspor Semua** di samping **Struktur Saya**, lalu
  **Impor Cetak Biru**.
- **Identitas**: **Ekspor** di **Identitas Saya**, lalu **Impor
  Identitas**.

Riwayat obrolan, teman, dan pengaturan hanya ikut pindah dengan cadangan
penuh.

### Apakah menghapus data browser akan menghapus pekerjaan saya?

Ya. Dokumen, identitas, teman, dan riwayat obrolan semuanya berada di
penyimpanan browser ini untuk situs ini, dan menghapusnya akan
menghilangkannya untuk selamanya. Cadangkan terlebih dahulu dengan
**Data Anda → Cadangkan ke File**, dan simpan file serta frasa sandinya
baik-baik; **Pulihkan** di halaman yang sama mengembalikan semuanya.
ForkBuild mengingatkan Anda saat cadangan terakhir sudah lama, dan di
Chrome atau Edge di komputer ForkBuild dapat mencadangkan secara otomatis
setiap hari ke folder yang disinkronkan oleh penyimpanan cloud Anda. Lihat
[Data Anda](13-YourData.md) dan [Privasi](Privacy.md).

### Bisakah saya mengganti nama atau menghapus identitas?

Tidak. Identitas dimaksudkan untuk bertahan lama. Untuk berhenti
memakainya, nyatakan penggantinya atau cabut identitas itu di **Identitas
Saya**.

### Mengapa salinan ForkBuild yang lebih lama tidak bisa membuka dokumen yang saya ekspor?

Dokumen kini disimpan dalam format yang lebih baru dan lebih ringkas.
ForkBuild 1.0.0 dan yang lebih lama tidak dapat membacanya, jadi perbarui
salinan lain itu terlebih dahulu. File yang diekspor versi lama tetap
dapat dibuka di sini.

## Tampilan Dunia dan avatar Anda

### WASD tidak menggerakkan avatar saya

Berjalan nonaktif sampai Anda menyalakannya:

1. Masuk dan simpan avatar di **Avatar Saya**.
2. Di bagian **Avatar** pada Tampilan Dunia, centang **Kendalikan Avatar
   Saya (WASD, Shift, Spasi)**.
3. Klik tampilan 3D, agar tombol yang ditekan tidak masuk ke kolom teks.

Di layar sentuh, ketuk **Jalan** di atas joystick sebagai gantinya. Lihat
[Walking your avatar](06-AvatarsAndPresence.md#menjalankan-avatar-anda).

### Siapa yang bisa melihat avatar saya?

Secara bawaan, siapa pun yang terhubung dengan Anda: **Visibilitas
Kehadiran** dan **Visibilitas Profil** sama-sama dimulai dari **Publik**.
Ubah keduanya di **Avatar Saya**; **Tersembunyi** membuat Anda tidak
terlihat. Lihat
[Who can see you](06-AvatarsAndPresence.md#siapa-yang-dapat-melihat-anda-dua-pengaturan-terpisah).

### Tab browser tertutup saat saya mengemudikan kendaraan

**Ctrl** adalah rem dan **W** untuk mempercepat, dan di Windows serta
Linux kebanyakan browser menutup tab dengan **Ctrl+W**. Lepaskan **W**
sebelum mengerem.

### Bisakah saya mengubah sesuatu di Tampilan Dunia?

Hanya anotasi: penanda, nama wilayah, dan hiasan hewan. Membangun
dilakukan di Editor; gunakan **Edit Salinan** untuk membawa apa yang
sedang Anda lihat ke sana. Lihat
[Tampilan Dunia](03-WorldView.md#edit-salinan--membawa-sesuatu-ke-editor).

## Rekan, teman, dan obrolan

### Saya menjalankan ForkBuild sendiri dan tidak bisa menemukan siapa pun

Server rendezvous bawaan hanya menjawab situs yang di-host, jadi salinan
yang disajikan dari alamat Anda sendiri (termasuk `localhost`) tidak dapat
memakainya. Terhubunglah dengan undangan (**Rekan → Terhubung dengan
orang baru → Undang**), atau tambahkan server rendezvous Anda sendiri di
**Pengaturan Jaringan → Server Rendezvous**. Lihat
[Koneksi Rekan & Teman](07-PeerConnectionsAndFriends.md).

### Teman saya tidak terhubung kembali secara otomatis

Penyambungan ulang otomatis hanya mencakup orang yang Anda **Ingat**
(Rekan yang Dikenal), dan hanya menemukan mereka selama mereka **Dapat
ditemukan**. Teman yang belum Anda Ingat menampilkan tombol **Hubungkan
Kembali** sebagai gantinya. Pilih **Ingat** di menu **⋯** mereka, dan
minta kalian berdua mengeklik **Jadikan Dapat Ditemukan**.

### Pesan saya masih "Diantrekan"

Pesan menunggu di perangkat Anda, bukan di server, jadi hanya terkirim
selama ForkBuild terbuka di kedua sisi dan kalian terhubung. Pesan yang
tidak terkirim dalam 7 hari dibuang dan ditandai **Tidak terkirim —
kedaluwarsa**. Lihat
[Sending while someone's offline](08-ChatAndConversations.md#mengirim-saat-seseorang-luring).

### Mengapa saya tidak bisa mengobrol dengan seseorang yang terhubung dengan saya?

Obrolan dan panggilan suara khusus untuk teman. Klik **Tambah Teman** pada
baris mereka di **Rekan**; begitu mereka menerima, tombol **Obrolan**
muncul.

### Saya mengubah Pengaturan Jaringan tetapi tidak ada yang berbeda

Pengaturan jaringan (server, relay, gateway) dibaca saat aplikasi dimulai.
Muat ulang halaman setelah menyimpan. Lihat
[Pengaturan Jaringan](10-NetworkSettings.md).

## Perangkat dan browser

### Apakah ForkBuild bisa dipakai di ponsel atau tablet?

Bisa. Kedua tampilan memiliki kontrol sentuh, dan di layar sempit menu
serta panel samping terlipat. Lihat
[Layar sentuh](ControlsReference.md#layar-sentuh).

### Apakah ForkBuild berfungsi tanpa internet? Bisakah saya memasangnya?

Ya, di situs yang di-host. Setelah kunjungan pertama, ForkBuild terbuka
tanpa koneksi, dan **Pasang ForkBuild** di layar Beranda menambahkannya ke
perangkat Anda sebagai aplikasi. Membangun, menyimpan, serta bangunan
tersimpan dan siap pakai berfungsi tanpa internet; menemukan bangunan dan
orang, mendistribusikan, dan obrolan memerlukan koneksi. Lihat
[Memasang ForkBuild](01-GettingStarted.md#memasang-forkbuild).

### Bisakah saya mencetak 3D bangunan saya, atau membukanya di Blender?

Bisa. **Model 3D** di bilah alat Editor mengunduhnya sebagai STL untuk cetak
3D (dalam milimeter, berdiri di alas cetak) atau sebagai glTF atau OBJ
berwarna untuk Blender dan program lain. Lihat
[Mengunduh model 3D](02-TheEditor.md#mengunduh-model-3d).

### Apakah saya memerlukan dompet kripto?

Tidak. Membangun, menyimpan, menerbitkan, mem-fork, rekan, dan obrolan
tidak memerlukannya. Dompet atau ekstensi penanda tangan hanya diperlukan
untuk fitur distribusi dan penjangkaran eksperimental di
[Bukti & Penyimpanan](11-EvidenceAndStorage.md).
