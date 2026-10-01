<!-- translation-of: docs/user/07-PeerConnectionsAndFriends.md source-hash: 25e078a7afa72b20 -->
# 07 — Koneksi Rekan & Teman

<!-- languages -->
[English](../07-PeerConnectionsAndFriends.md) · [Deutsch](../de/07-PeerConnectionsAndFriends.md) · **Bahasa Indonesia** · [日本語](../ja/07-PeerConnectionsAndFriends.md)
<!-- /languages -->

ForkBuild menghubungkan Anda langsung ke browser orang lain — tidak ada
server pusat yang menyimpan daftar teman. Buka **Rekan** di bilah atas
untuk mengelola siapa yang terhubung, Anda kenal, dan berteman dengan Anda.

## Sekilas tentang halaman ini

```
Rekan                                   ID Anda …N6KbN  [Salin ID lengkap]

Perlu perhatian Anda      koneksi yang menunggu Anda, permintaan pertemanan
Orang  [Semua|Teman|Diikuti|Daring]     satu baris per orang
Terhubung dengan orang baru  [Undang|Tempel undangan|Cari berdasarkan ID|Lobi publik]
▸ Diblokir (N)            hanya saat Anda telah memblokir seseorang
```

- **Perlu perhatian Anda** hanya muncul saat ada yang menunggu: koneksi
  yang sedang berlangsung (dengan langkahnya, mis. "step 2 of 5: WebRTC
  menghubungkan"), koneksi yang menunggu Anda menempelkan balasan dari
  pihak lain, koneksi gagal yang perlu ditutup, atau seseorang yang ingin
  berteman dengan Anda (**Terima** / **Tolak**).
- **Orang** memiliki satu baris per orang, berapa pun hal yang Anda ketahui
  tentang mereka. Tag menunjukkan siapa mereka bagi Anda — **Teman**,
  **Diingat**, **Diikuti**, **Diblokir**, **Permintaan terkirim**,
  **Ingin berteman** — dan titik hijau berarti daring. Orang yang daring
  tampil lebih dulu, lalu teman, lalu semua orang lainnya. Setiap baris
  memiliki tindakan utamanya (**Obrolan** untuk teman, **Hubungkan
  Kembali** saat mereka luring, **Tambah Teman** untuk orang yang
  terhubung dengan Anda), dan menu **⋯** berisi sisanya: **Ganti Nama**
  (atau **Beri Nama & Ingat**), **Ingat** / **Lupakan**, **Hapus
  Pertemanan**, **Ikuti** / **Berhenti Mengikuti**, **Detail Koneksi**,
  **Putuskan**, dan **Blokir** / **Buka Blokir**. Saringan **Diikuti**
  menampilkan orang-orang di sini yang Anda ikuti.
- **Diblokir** terlipat di bagian bawah dan hanya muncul saat Anda telah
  memblokir seseorang.

Di balik daftar itu ada lima catatan yang saling terpisah — koneksi aktif,
Rekan yang Dikenal (orang yang Anda pilih untuk **Ingat**, catatan pribadi
yang tidak pernah dibagikan kepada mereka), Teman (dua arah dan
ditandatangani), Diikuti (lihat
[Mengikuti orang](#mengikuti-orang)), dan Diblokir. Seseorang bisa menjadi
Teman tanpa Diingat, dan seterusnya; barisnya hanya menampilkan yang
berlaku. Orang yang Anda ikuti tetapi belum pernah terhubung dengan Anda
tidak tercantum di sini; halaman **Diikuti** mencantumkan semua orang yang
Anda ikuti.

## Menemukan dan terhubung dengan seseorang

Tidak ada nama pengguna yang dapat dicari — setiap rekan dialamatkan
dengan identitas kriptografisnya, jadi terhubung selalu dimulai dengan
bertukar informasi identitas melalui saluran yang sudah Anda percayai
(obrolan, email, bertemu langsung). **Terhubung dengan orang baru**
menampilkan satu cara pada satu waktu:

- **Undang** — **Buat Undangan**, lalu salin dan kirimkan kepada
  seseorang. Koneksinya menunggu di **Perlu perhatian Anda**; begitu
  mereka membalas, tempelkan balasan mereka di sana dan klik
  **Selesaikan Koneksi**.
- **Tempel undangan** — sisi penerima: tempelkan undangan yang dikirim
  seseorang kepada Anda, klik **Hubungkan**, dan kirim balik balasan yang
  diberikan kepada Anda.
- **Cari berdasarkan ID** — cari dengan ID identitas lengkap seseorang di
  antara kandidat yang telah diterbitkan oleh Anda atau orang lain, lalu
  **Hubungkan**. Balasan Anda dikirim kembali melalui server rendezvous,
  sehingga koneksinya selesai dengan sendirinya; Anda hanya menyalin
  balasan secara manual saat itu tidak memungkinkan (identitas Anda
  terkunci, atau kandidatnya berasal dari undangan yang disimpan).
  **Simpan undangan untuk nanti**, yang terlipat di bawahnya, menambahkan
  undangan ke hasil pencarian ini tanpa terhubung.
- **Jadikan Dapat Ditemukan** (di tab yang sama, di bawah **Izinkan orang
  lain menemukan Anda**) — menerbitkan identitas Anda sendiri ke jaringan
  rendezvous sehingga seseorang yang sudah mengetahui ID identitas Anda
  dapat menemukan dan terhubung dengan Anda tanpa undangan langsung. Satu
  penerbitan menjawab satu upaya koneksi — nyalakan lagi agar dapat
  ditemukan lagi. Tombolnya bertuliskan **Berhenti Dapat Ditemukan**
  selama penerbitan Anda masih menunggu dijawab; tombol itu kembali
  menjadi **Jadikan Dapat Ditemukan** dengan sendirinya begitu seseorang
  terhubung, atau begitu tawarannya ditutup atau undangannya kedaluwarsa.
  Identitas Anda harus tidak terkunci untuk menerbitkan: server rendezvous
  hanya menerima penerbitan yang ditandatangani oleh identitas yang
  disebutkannya, jadi tidak ada orang lain yang dapat menerbitkan atau
  menariknya atas nama Anda. Server rendezvous bawaan hanya menjawab situs
  ForkBuild yang di-host; jika Anda menjalankan ForkBuild dari alamat Anda
  sendiri (termasuk `localhost`), gunakan undangan atau tambahkan server
  Anda sendiri di **Server Rendezvous** pada **Pengaturan Jaringan**.
  Status itu disimpan untuk seluruh aplikasi, jadi meninggalkan halaman
  Rekan lalu kembali tidak mengatur ulangnya.
- **Lobi publik** — bertemu orang yang ID-nya tidak Anda miliki; lihat di
  bawah.

**ID Anda** di bagian atas halaman, dengan **Salin ID lengkap**, adalah
yang diperlukan seseorang untuk **Cari berdasarkan ID**. Bentuk singkat
`…14karakterterakhir` yang ditampilkan di baris hanya untuk membedakan
orang sekilas dan tidak akan pernah cocok dengan pencarian sungguhan.

Apa pun jalur yang Anda pakai, sebuah koneksi melewati langkah yang sama:
**Rendezvous ditemukan → WebRTC menghubungkan → Rekan terhubung →
Mengautentikasi identitas → Terautentikasi** (atau **Gagal**). **Detail
Koneksi** di menu **⋯** milik orang yang terhubung menampilkan identitas
mereka, kunci publik, dan pengingat bahwa *koneksinya* sendiri hanya
berlaku untuk sesi ini, meskipun catatan Rekan yang Dikenal atau Teman tetap
ada setelahnya. Pengatur waktu "daring selama …" dan "dimulai … lalu"
menghitung dari saat koneksi itu benar-benar dibuat, jadi tetap menghitung
dengan benar jika Anda berpindah halaman lalu kembali.

## Lobi publik: bertemu orang yang belum Anda kenal

Cari berdasarkan ID memerlukan ID identitas lengkap seseorang. **Lobi
Publik** adalah untuk bertemu orang yang ID-nya tidak Anda miliki. Ada satu
lobi untuk semua orang, di halaman **Rekan** di bawah **Terhubung dengan
orang baru → Lobi publik**, dan satu untuk setiap Dunia, di bawah **Lobi**
di Tampilan Dunia.

- **Gabung ke Lobi** mencantumkan Anda di sana dengan nama tampilan yang
  Anda pilih, di samping akhir ID identitas Anda. Siapa pun boleh memilih
  nama apa pun; yang benar-benar diperiksa oleh koneksi adalah
  identitasnya. Nama itu diingat untuk lain kali.
- Selama Anda berada di lobi, perangkat ini tetap dapat ditemukan: siapa
  pun di sana dapat mengeklik **Hubungkan** pada Anda, dan saat seseorang
  melakukannya, perangkat langsung bersiap untuk orang berikutnya.
- **Hubungkan** pada seseorang di daftar menghubungkan Anda dengannya
  dengan cara yang sama seperti Cari berdasarkan ID, tanpa ada yang perlu
  disalin. Kartu mereka menampilkan **Menghubungkan…**, lalu **Terhubung**
  begitu jabat tangannya membuktikan siapa mereka. Melihat seseorang di
  lobi tidak pernah menghubungkan Anda dengannya dengan sendirinya.
- **Blokir** menyembunyikan seseorang dari daftar lobi Anda dan
  memblokirnya seperti di bagian lain halaman ini.
- **Keluar dari Lobi** langsung mengeluarkan Anda. Bergabung hanya
  berlaku untuk kunjungan ini: menutup aplikasi mengeluarkan Anda dari
  setiap lobi (pencantuman Anda dapat memerlukan hingga 10 menit untuk
  hilang dari daftar orang lain), dan Anda tidak pernah dimasukkan kembali
  ke lobi saat membukanya lagi.

**Apa yang didapat seseorang yang terhubung dengan Anda dari lobi.**
Koneksi dari lobi adalah rekan terhubung biasa, bahkan sebelum Anda
Mengingat atau berteman dengannya. Mereka mengetahui alamat IP Anda,
melihat avatar dan kehadiran Anda sejauh yang diizinkan pengaturan
visibilitas Anda, dan perangkat kalian **bertukar pengumuman Snapshot dan
Penamaan Tempat serta metadata publikasi**, persis seperti dengan rekan
terhubung mana pun (lihat [Privasi](Privacy.md)). Obrolan dan suara tetap
memerlukan pertemanan. Dunia yang Anda bagikan dengan rekan juga ditawarkan
kepada mereka, tetapi perangkat mereka hanya mengambilnya jika mereka
mengeklik **Ambil** (lihat
[Berbagi dengan rekan yang terhubung](04-PublishingAndForking.md#berbagi-dengan-rekan-yang-terhubung)).
Dunia yang dibagikan Teman dan Rekan yang Dikenal diambilkan untuk Anda
secara otomatis; milik orang asing dari lobi tidak pernah.

**Relay hanya bila diperlukan.** Setiap koneksi mencoba jalur langsung
terlebih dahulu dan memakai relay TURN dari server rendezvous hanya jika
tidak ada jalur langsung yang berhasil. Selama Anda menunggu di lobi,
perangkat Anda tidak pernah meminta kredensial relay; orang yang terhubung
dengan Anda memintanya hanya jika mereka membutuhkannya. Dengan begitu,
jatah bulanan relay disimpan untuk koneksi yang benar-benar terjadi.

Lobi memerlukan server rendezvous (lihat **Server Rendezvous** di
**Pengaturan Jaringan**) dan identitas yang tidak terkunci.

## Mengingat, berteman, memblokir

- **Ingat** seseorang (di menu **⋯** miliknya) untuk menyimpan catatan
  pribadi dan lokal tentang mereka — tanpa memerlukan persetujuan mereka.
  **Ganti Nama** memberi mereka nama yang hanya Anda lihat; untuk orang
  yang belum Anda ingat, **Beri Nama & Ingat** melakukan keduanya.
  **Lupakan** menghapus catatannya, hanya secara lokal.
- **Tambah Teman** pada baris orang yang terhubung meminta hubungan dua
  arah; mereka melihatnya di **Perlu perhatian Anda** dengan **Terima** /
  **Tolak**, dan Anda dapat **Batalkan Permintaan Pertemanan** dari menu
  **⋯** selama menunggu. **Hapus Pertemanan** mengakhirinya; ini
  memerlukan mereka terhubung, karena mereka harus menerimanya. Teman
  mendapat tombol **Obrolan** — lihat
  [Obrolan & Percakapan](08-ChatAndConversations.md).
- **Blokir** menghentikan segala sesuatu dari identitas itu — kehadiran,
  profil, obrolan, bahkan permintaan pertemanan — tanpa memberi tahu
  mereka. Memblokir teman tidak menghapus pertemanannya, hanya
  membungkamnya; **Buka Blokir** (di menu **⋯**, atau daftar **Diblokir**)
  membuat Anda kembali mendengar dari mereka, tetapi tidak pernah
  memulihkan apa pun yang dibungkam selama diblokir.

## Mengikuti orang

**Ikuti** membuat Anda selalu tahu karya terbaru seseorang, seperti
mengikuti akun di media sosial, tanpa salah satu dari kalian meminta apa
pun kepada yang lain.

- **Tempat mengikuti.** **Ikuti** muncul di kartu publikasi di
  Repositori, di samping **Ditandatangani oleh …** di halaman pembuat, di
  menu **⋯** seseorang di halaman ini, dan sebagai **Ikuti Karya Mereka**
  pada avatar di Tampilan Dunia. Anda mengikuti sebuah *identitas*, bukan
  nama pembuat yang diketik: beberapa orang dapat menerbitkan dengan nama
  yang sama, jadi halaman pembuat menampilkan satu **Ikuti** per identitas
  yang menandatangani karya dengan nama itu.
- **Halaman Diikuti** (**Diikuti** di bilah atas) mencantumkan orang yang
  Anda ikuti, masing-masing dengan **Berhenti Mengikuti**, dan di bawahnya
  karya terbaru mereka yang telah sampai di perangkat ini, dari yang
  terbaru. Klik sebuah nama untuk melihat karya orang itu saja.
- **Notifikasi.** Saat karya baru dari orang yang Anda ikuti sampai di
  perangkat ini, panel 🔔 mendapat entri **Publication followed author
  published** (pembuat yang Anda ikuti menerbitkan), sekali per karya,
  dengan **Jelajahi** untuk membukanya.
- **Dunia yang mereka bagikan diambilkan untuk Anda.** Dunia yang dibagikan
  orang yang Anda ikuti kepada rekan yang terhubung diambil secara
  otomatis, seperti yang sudah terjadi untuk Teman dan rekan yang Diingat.
- **Pengumuman mereka disimpan lebih lama.** Perangkat ini menyimpan
  catatan pengumuman yang pernah dilihatnya, hingga batas tertentu per tag
  penemuan. Saat sebuah tag penuh, catatan yang paling lama tidak dilihat
  dihapus lebih dulu, tetapi penempatan bangunan dan nama tempat yang
  ditandatangani orang yang Anda ikuti disimpan lebih dulu daripada yang
  lain.

**Mengikuti bersifat pribadi dan satu arah.** Daftarnya disimpan di
perangkat ini, untuk identitas yang sedang Anda pakai untuk masuk. Daftar
itu tidak pernah dikirim ke mana pun, orang yang Anda ikuti tidak pernah
diberi tahu, dan tidak ada jumlah pengikut: tanpa server, tidak ada yang
dapat menghitungnya dengan jujur. Mengikuti juga tidak memberi apa pun
kepada orang lain itu: tidak ada obrolan, tidak dapat melihat avatar Anda,
tidak ada cara untuk menghubungi Anda. Itu tetap fungsi pertemanan.

**Apa yang tidak dilakukan mengikuti.** Mengikuti memilah karya orang yang
Anda ikuti dari apa yang sampai di perangkat ini; mengikuti tidak pergi
mengambil karya mereka dengan sendirinya. Karya tetap datang lewat cara
biasa: penemuan Dunia di Tampilan Dunia, Dunia yang dibagikan rekan yang
terhubung, dan tautan yang Anda buka. Hanya karya yang tanda tangannya
valid yang dihitung, jadi tidak ada yang bisa masuk ke halaman Diikuti
Anda dengan mengetik nama atau identitas orang lain pada karyanya. Karya
orang yang Anda **Blokir** tetap tersembunyi meskipun Anda mengikutinya.

## TURN: me-relay koneksi rekan yang tidak menemukan jalur langsung

Setiap koneksi rekan dimulai dengan mencoba menegosiasikan jalur langsung
antara dua browser, dengan server STUN publik bawaan ForkBuild membantu
setiap sisi menemukan alamatnya sendiri yang dapat dijangkau. Itu cukup
untuk kebanyakan koneksi — tetapi beberapa jaringan (NAT simetris, firewall
perusahaan yang ketat) tidak pernah memperlihatkan jalur yang dapat
ditemukan STUN saja. Jika server rendezvous Anda menawarkan relay TURN,
ForkBuild meminta kredensial relay berumur pendek darinya saat Anda memulai
koneksi (tidak pernah hanya karena membuka aplikasi) dan memakainya secara
otomatis. Server membagikan kredensial relay dalam jumlah terbatas setiap
bulan; begitu habis, koneksi tetap dicoba, hanya tanpa relay, sampai bulan
berikutnya. Untuk memakai relay milik Anda sendiri, buka **Server TURN**
dari **Pengaturan Jaringan** di bilah atas (`/settings/turn-server`) dan
konfigurasikan relay TURN Anda sendiri: server yang benar-benar meneruskan
data koneksi saat jalur langsung tidak dapat dibuat.

```
Server TURN

Relay TURN milik Anda sendiri, digunakan untuk koneksi rekan yang tidak
dapat membuat jalur langsung atau jalur hasil negosiasi STUN. Pengaturan
ini hanya memengaruhi penyiapan koneksi; tidak mengubah identitas rekan,
autentikasi, atau koneksi yang sudah ada.

Anda tidak perlu mengisi ini untuk mendapatkan relay: saat koneksi dimulai,
ForkBuild sudah meminta relay TURN berumur pendek dari server rendezvous
Anda (lihat Server Rendezvous) dan menggunakannya jika mereka menawarkan.
Tambahkan relay di sini hanya jika Anda menjalankan atau membayar relay
sendiri; relay itu digunakan bersama relay mereka, tidak pernah sebagai
penggantinya.

[ Satu URL turn:/turns: per baris (mis. turn:relay.example:3478). ]

Nama pengguna [______________]
Kredensial    [______________]

[Simpan]   [Hapus]
```

Masukkan satu atau beberapa URL `turn:`/`turns:` (satu per baris), **Nama
pengguna**, dan **Kredensial** — pasangan kredensial yang sama dikirim
untuk setiap URL yang Anda cantumkan, tidak pernah kredensial terpisah per
server — lalu klik **Simpan**. Setelah diatur, relay saat ini ditampilkan
sebagai "Relay TURN saat ini (*N* url): `<URL Anda>` — nama pengguna:
`<nama pengguna Anda>`" — kredensialnya sendiri tidak pernah ditampilkan
kembali setelah disimpan, hanya bahwa kredensial sudah dikonfigurasi. Klik
**Hapus** untuk menghapusnya sepenuhnya.

**Sengaja tidak ada tombol "Kembalikan ke Bawaan" di sini.** Relay bawaan
berasal dari server rendezvous, seperti dijelaskan di atas, jadi halaman
ini tidak memiliki nilai bawaan untuk dikembalikan: menyertakan server
TURN di sini berarti menerbitkan kredensialnya di aplikasi agar dapat
dibaca dan dipakai siapa saja. Membiarkan halaman ini kosong tetap memberi
Anda relay dari server rendezvous, jika mereka menawarkannya; tanpa relay
dari keduanya, koneksi hanya mengandalkan STUN dan konektivitas langsung.
Relay milik Anda sendiri bersifat opsional, dan sesuatu yang Anda sediakan
sendiri (banyak penyedia hosting WebRTC menawarkannya) hanya jika koneksi
ke rekan tertentu tetap terus gagal. Seperti setiap halaman Pengaturan
Jaringan lainnya, perubahan di sini baru berlaku saat aplikasi dimuat
berikutnya.

## Menghubungkan kembali

Rekan yang Dikenal atau Teman yang tidak daring menampilkan tombol
**Hubungkan Kembali**, bahkan teman yang tidak pernah Anda ingat. Tombol
itu membuka pertukaran undangan yang sama seperti **Undang** / **Tempel
undangan**, langsung di barisnya, dan selalu melakukan jabat tangan baru
yang lengkap alih-alih memakai ulang detail koneksi lama. Jika upaya
menghubungkan kembali terautentikasi sebagai identitas yang *berbeda* dari
yang diharapkan, ForkBuild menolaknya dan menutup koneksi dengan pesan
kesalahan yang jelas, alih-alih diam-diam memercayai siapa pun yang
menjawab.

ForkBuild juga mencobanya untuk Anda, secara otomatis, untuk setiap
identitas di Rekan yang Dikenal: begitu aplikasi dimulai, setiap kali Anda
Mengingat, Melupakan, atau mengubah hubungan Rekan yang Dikenal dengan cara
lain, dan setiap kali Anda sendiri mengeklik **Jadikan Dapat Ditemukan**,
ForkBuild diam-diam memeriksa apakah masing-masing saat ini **Dapat
ditemukan** dan, jika ya, menghubungkan tanpa Anda perlu mengeklik Hubungkan
Kembali. Jadi dua teman yang sama-sama mengeklik **Jadikan Dapat
Ditemukan** akan terhubung: klik kedua menemukan yang pertama. Rekan yang
Dikenal yang saat ini tidak dapat ditemukan, atau tidak dapat dijangkau,
dibiarkan saja — tidak ada perulangan yang terus mengejarnya, tidak ada
notifikasi tentang upayanya, dan kegagalan satu identitas tidak pernah
memengaruhi yang lain. Gunakan **Hubungkan Kembali** saat Anda ingin
koneksi terjadi sekarang juga alih-alih menunggu pemeriksaan otomatis
berikutnya.

## Apa selanjutnya?

Begitu Anda punya teman, mengobrollah dengannya di
**[Obrolan & Percakapan](08-ChatAndConversations.md)**.
