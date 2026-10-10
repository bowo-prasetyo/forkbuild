<!-- translation-of: docs/user/04-PublishingAndForking.md source-hash: 6d422d4ef6fb45c9 -->
# 04 — Penerbitan & Fork

<!-- languages -->
[English](../04-PublishingAndForking.md) · [Deutsch](../de/04-PublishingAndForking.md) · [Español](../es/04-PublishingAndForking.md) · [Français](../fr/04-PublishingAndForking.md) · **Bahasa Indonesia** · [日本語](../ja/04-PublishingAndForking.md) · [한국어](../ko/04-PublishingAndForking.md) · [Português (Brasil)](../pt-BR/04-PublishingAndForking.md)
<!-- /languages -->

Inilah inti ForkBuild. **Menerbitkan** membagikan karya Anda kepada dunia.
**Fork** memungkinkan siapa pun menyalin sebuah karya dan
mengembangkannya — dengan seluruh riwayatnya tetap terjaga.

## Menerbitkan karya Anda

1. Bangun sesuatu di Editor.
2. Masuk dan pastikan identitas Anda tidak terkunci (lihat
   [Identitas & Masuk](05-IdentityAndLogin.md)). Menerbitkan
   menandatangani karya itu dengan identitas tersebut. Jika Anda belum
   masuk, **Terbitkan** meminta Anda masuk atau membuat identitas lebih
   dulu; **Terbitkan tanpa tanda tangan** di sana menerbitkannya tanpa
   pembuat dan tanpa tautan.
3. Beri judul — Terbitkan menolak karya tanpa judul atau kosong — dan,
   secara opsional, deskripsi dan lisensi: klik **✎** di samping judul
   dokumen di bilah sisi untuk membuka **Properti Dokumen**. Dokumen baru
   tidak memiliki lisensi; saat pertama kali Anda menerbitkannya, ForkBuild
   bertanya apakah orang lain boleh me-remix-nya (lihat
   [Mengizinkan orang lain me-remix](#mengizinkan-orang-lain-me-remix)).
4. Tekan **Simpan** agar tersimpan.
5. Klik **Terbitkan**.

Karya Anda kini muncul di **Repositori Anda sendiri** di perangkat ini,
tempat Anda dapat mencarinya, membukanya, dan mem-fork-nya, dengan nama
Anda sebagai pembuatnya. Orang lain baru melihatnya setelah Anda
membagikan atau mendistribusikannya (lihat catatan di bawah). Karya itu
juga otomatis diberi posisi di dunia bersama, sehingga **Jelajahi** selalu
punya tempat untuk dituju — lihat
[Menemukan dunia](03-WorldView.md#menemukan-dunia).

> **Catatan:** Menerbitkan hanya menyimpan Dokumen/Dunia Anda di perangkat
> ini. Kartunya di Repositori menyebutkan di mana perangkat ini mencatat
> distribusinya (misalnya **Disimpan di IPFS · Diumumkan di Nostr**), atau
> **Tidak ada distribusi yang tercatat di perangkat ini.** Cadangkan di
> [Data Anda](13-YourData.md) untuk menyimpan salinan sementara itu.
> Menerbitkan tidak pernah mengirim apa pun ke mana pun dengan sendirinya.
> [Tautan](#membagikan-tautan) yang Anda salin membawa bangunan itu kepada
> orang yang Anda beri.
> Dua langkah terpisah yang opsional yang melakukannya: **Distribusikan**,
> yang dijelaskan di bawah, mengirim publikasi ke Arweave atau IPFS dan
> mengumumkannya di Nostr atau Arweave sehingga orang lain dapat
> menemukannya tanpa terhubung dengan Anda; dan
> [**Bagikan dengan Rekan**](#berbagi-dengan-rekan-yang-terhubung)
> menawarkannya kepada orang-orang yang terhubung dengan Anda.

## Membagikan tautan

Begitu **Terbitkan** berhasil, pemberitahuan di Editor juga menampilkan
**Bagikan…** (jika perangkat Anda punya menu berbagi), **Salin tautan**,
**Simpan gambar**, dan **Sematkan**, dengan tautannya di bawahnya. Tombol yang sama ada di
bawah **Dunia Bersama Saya** di Tampilan Dunia.

- **Bangunannya ikut di dalam tautan.** Tidak ada yang perlu
  didistribusikan lebih dulu, dan tidak ada dompet atau akun yang
  terlibat: tautan itu membawa Dunia Bersama Anda yang bertanda tangan dan
  bangunannya sendiri. Siapa pun yang membukanya, di perangkat apa pun,
  sampai pada bangunan Anda (lihat [Apa yang dibuka sebuah tautan](#apa-yang-dibuka-sebuah-tautan)). ForkBuild memeriksa tanda tangannya, dan
  bahwa bangunannya cocok, sebelum menampilkan apa pun; tautan yang diubah
  atau terpotong akan mengatakannya.
- **Tautan itu menunjukkan isinya.** Saat ditempel di aplikasi obrolan,
  email, atau unggahan, tautan menampilkan judul bangunan Anda, nama Anda,
  dan gambar bangunan itu, yang digambar oleh server tautan ForkBuild, lalu
  mengarahkan siapa pun yang membukanya ke ForkBuild. Tautan yang diubah
  hanya menampilkan "A shared build".
- **Perlu tanda tangan.** Terbitkan saat masuk; karya yang diterbitkan saat
  keluar tidak mendapat tautan.
- **Ukuran.** Bangunan hingga sekitar 500 balok muat; tautan kastel siap
  pakai sekitar 3.700 karakter. Email serta sebagian besar aplikasi obrolan
  dan media sosial mempertahankan tautan sepanjang itu, tetapi Discord dan
  Telegram membatasi panjang pesan. Bangunan yang lebih besar mengatakan
  bahwa ia terlalu besar untuk tautan: distribusikan untuk mendapatkannya.
- **Setelah didistribusikan**, tombol-tombolnya menawarkan tautan yang
  lebih pendek yang menyebut tempat Dunia Bersama disimpan, yang juga
  membawa penempatan Anda (lihat [Distribusi](Distribution.md)). Tautan yang
  membawa bangunannya tidak membawa penempatan Anda, jadi Tampilan Dunia
  menaruh bangunan itu di tempat ia menaruh bangunan tanpa penempatan.
- **Simpan gambar** mengunduh PNG 1200 × 630 dari bangunan itu, dengan
  judulnya dan "Remix di ForkBuild" di bagian bawah, untuk diunggah di
  tempat yang tidak menampilkan gambar untuk tautan saja.

Menyalin atau membagikan tautan, dan membukanya, dihitung secara anonim,
seperti kunjungan harian; lihat
[Hitungan pengunjung harian](13-YourData.md#hitungan-pengunjung-harian).

### Apa yang dibuka sebuah tautan

Tautan ke sebuah bangunan, baik yang membawa bangunannya maupun yang
menyebut tempat ia disimpan, membuka halaman bangunan itu sendiri:

- bangunannya, berputar perlahan;
- judulnya dan siapa pembuatnya;
- **Remix dari "…" oleh …** jika itu remix, dan **Di-remix N kali** jika
  perangkat ini telah menemukan remix-nya (lihat
  [Jumlah remix](#jumlah-remix));
- **Silsilah**-nya: bangunan asal remix-nya, sampai yang asli, dan
  remix yang dibuat darinya dan dari remix itu, masing-masing berupa
  tautan jika perangkat ini dapat membukanya;
- **Edit Salinan**, tombol besarnya: salinan Anda sendiri terbuka di
  Editor, siap diubah, tanpa perlu akun. Salinan itu mencatat asalnya, jadi
  pembuatnya tetap mendapat kredit, dan **Kembali ke Dunia** membawa Anda
  ke aslinya;
- **Jelajahi di Dunia**, untuk melihatnya di Tampilan Dunia.

Jika lisensinya mengizinkan salinan, halaman itu juga menawarkan **Unduh
sebagai model 3D** (glTF, STL untuk cetak 3D, atau OBJ; lihat
[Mengunduh model 3D](02-TheEditor.md#mengunduh-model-3d)). Jika lisensi bangunan itu tidak mengizinkan
salinan, halamannya
mengatakannya dan hanya menawarkan untuk mengelilinginya.

### Menyematkan bangunan di halaman web

Bangunan yang tautannya memuat bangunan itu juga dapat ditampilkan di dalam
tulisan blog atau halaman web, tempat pembaca melihatnya berputar tanpa
meninggalkan halaman:

1. Di bawah tautan, pilih **Sematkan**. Kode untuk ditempel muncul di
   bawahnya.
2. Pilih **Salin kode sematan**, lalu tempelkan di bagian halaman yang
   menerima HTML atau sematan (sebuah `<iframe>`).

Di halaman itu, bangunan berputar perlahan, dan menyeret ke samping
memutarnya dengan tangan. Judul dan pembuatnya ada di bagian bawah, di
samping **Remix di ForkBuild** (**Buka di ForkBuild** jika lisensinya tidak
mengizinkan salinan), yang membuka halaman bangunan itu sendiri di ForkBuild
di tab baru (lihat
[Apa yang dibuka sebuah tautan](#apa-yang-dibuka-sebuah-tautan)).

- **Bangunan ikut di dalam kode**, seperti di tautannya: tidak ada yang
  perlu didistribusikan, dan sematan memeriksa tanda tangan dan bangunannya
  sebelum menampilkannya.
- **Sematan tetap senyap.** Sematan tidak memulai satu pun koneksi ForkBuild
  dan tidak menyimpan apa pun di browser pembaca; lihat
  [Privasi](Privacy.md).
- **Situs yang menyematkan tautan sendiri** (yang mendukung oEmbed, seperti
  Notion dan Ghost) dapat diberi tautan dari **Salin tautan** saja: situs
  itu meminta sematannya ke server tautan ForkBuild.
- **Situs yang membuang kode `<iframe>`**, seperti kebanyakan jejaring
  sosial, tidak dapat menampilkannya; bagikan tautan atau gambarnya di sana.

Menyalin kode sematan, serta sematan yang ditampilkan atau dibuka di
ForkBuild, juga dihitung secara anonim.

## Mendistribusikan langsung dari Editor

Begitu **Terbitkan** berhasil, Editor menampilkan pemberitahuan kecil di
tempat itu juga — "Dunia Bersama berhasil diterbitkan." — dengan tombol
**Distribusikan** di sampingnya, dan **Tutup** untuk menghilangkannya tanpa
melakukan apa pun. Mengeklik **Distribusikan** membuka dialog
**Distribusikan** alih-alih memenuhi lapisan itu dengan pemilih dan hasil
yang hanya sesekali Anda perlukan; menutupnya lagi (**Tutup**, mengeklik di
luarnya, atau Escape) tidak pernah menghilangkan apa pun yang dihasilkannya
— membukanya lagi menampilkan hasil, kesalahan, atau keadaan yang sedang
berjalan persis seperti saat Anda meninggalkannya.

Dialog ini sama dengan yang dipakai Tampilan Dunia — pengaturan
**Penyimpanan** dan **Substrat Pengumuman / Penemuan**-nya, tombol gabungan
**Distribusikan**, serta tombol terpisah **Distribusikan Snapshot saja** /
**Distribusikan Klaim Bertanda Tangan saja** semuanya bekerja seperti
dijelaskan di
[Perjumpaan Dunia](03-WorldView.md#perjumpaan-dunia--publikasi-dan-avatar-yang-dibagikan-rekan-anda). Ada dua perbedaan di sini: dialog ini selalu bekerja pada
Dunia Bersama yang baru saja dihasilkan oleh klik Terbitkan Anda, dan
bagian **Snapshot** muncul lebih dulu, sehingga tombol gabungan menjalankan
Snapshot terlebih dahulu, lalu Klaim Bertanda Tangan.

Hasil Klaim Bertanda Tangan muncul di bagiannya sendiri:

| Kolom | Arti |
|---|---|
| **Dunia Bersama** | Id Dunia Bersama itu sendiri — memastikan Dunia Bersama mana yang dimaksud hasil ini. |
| **Materi** | Lokasi yang dihasilkan unggahan, atau "Belum diunggah" jika tidak selesai. |
| **Penemuan** | Id pengumuman, atau "Belum diumumkan" jika tidak selesai — satu baris per relay jika beberapa relay dikonfigurasi. |
| **Repositori** | Tombol **Jelajahi** yang langsung melompat ke halaman publikasi ini di Tampilan Dunia — ditampilkan setiap kali publikasi memiliki tempat untuk dijelajahi, yang dalam praktiknya selalu. |

**Bangunan besar.** Penyimpanan Arweave menerima Snapshot hingga 256 KB,
sekitar delapan ribu balok. Untuk yang lebih besar, pilih penyimpanan IPFS
(node IPFS lokal atau pinning jarak jauh), yang tidak memiliki batas
ukuran; jika Anda tetap memilih Arweave, bagian Snapshot menyebutkan
seberapa besar bangunannya dan meminta Anda memilih IPFS, dan tidak ada
yang diunggah. Rekan yang terhubung dengan Anda dapat mengambil bangunan
hingga 64 MB langsung dari Anda, tanpa memerlukan penyimpanan.

Hasil Snapshot itu sendiri — **Hash konten**, **Lokator**, dan id
**Pengumuman**, atau "Tanpa pengumuman" untuk penempatan yang berhasil
tanpanya — sepenuhnya terpisah, karena Snapshot ditempatkan dan ditemukan
secara terpisah dari distribusi Klaim Bertanda Tangan; lihat
[Snapshot Lokal](09-PublicationsAndEvidence.md#snapshot-lokal) untuk arti
perbedaan itu.

Seperti setiap tombol distribusi lain di aplikasi ini, mendistribusikan
memerlukan ekstensi browser penanda tangan — dompet Arweave (seperti
Wander) atau ekstensi Nostr (seperti nos2x); tanpanya, prosesnya berakhir
dengan pemberitahuan sederhana "…tidak dapat diselesaikan." Menerbitkan
sendiri tidak pernah mendistribusikan apa pun: distribusi hanya terjadi
pada klik terpisah dan eksplisit di kemudian hari ini. Menerbitkan lagi
mengganti seluruh lapisan dengan yang baru untuk publikasi baru;
menutupnya, atau meninggalkan halaman, menghapusnya — baik pemberitahuan
maupun hasil kedua bagian tidak diingat di mana pun.

## Berbagi dengan rekan yang terhubung

Dunia yang Anda terbitkan hanya tercantum di Repositori *Anda*, sampai Anda
mendistribusikannya di Nostr, Arweave, Steem, atau Blurt (lihat
[Distribusi](Distribution.md)): setelah itu Repositori siapa pun dapat
menemukannya (lihat
[Karya yang didistribusikan orang lain](#karya-yang-didistribusikan-orang-lain)).
Untuk
memasukkannya ke Repositori orang yang terhubung dengan Anda (lihat
[Koneksi Rekan & Teman](07-PeerConnectionsAndFriends.md)), klik
**Bagikan dengan Rekan** di bawahnya di Repositori. Tombol ini hanya muncul
pada Dunia terbitan Anda sendiri.

- Berbagi menawarkan Dunia itu kepada semua orang yang terhubung sekarang,
  dan kepada siapa pun yang terhubung kemudian. **Dibagikan ✓ · Bagikan
  Lagi** mengumumkannya lagi kepada orang yang terhubung sekarang.
- Di sisi mereka, Dunia yang dibagikan oleh salah satu **Teman** atau
  **Rekan yang Dikenal** mereka ditambahkan ke Repositori mereka dengan
  sendirinya, beserta semua yang diperlukan untuk **Jelajahi**. Dunia yang
  dibagikan orang lain menunggu di **Dibagikan kepada Anda** di bagian atas
  Repositori mereka sampai mereka mengeklik **Ambil**. Tidak ada perangkat
  yang mengunduh Dunia orang asing tanpa diminta. Masing-masing tercantum
  dengan judulnya, jadi mereka dapat memilih; perangkat mereka memastikan
  bahwa Dunia yang mereka ambil adalah Dunia yang disebut judul itu. Dunia
  yang Anda bagikan sebelum judul disertakan tercantum sebagai "Dunia yang
  dibagikan oleh …" sampai Anda mengeklik **Bagikan Lagi**.
- Dunia itu hanya diambil dari Anda, dan hanya selama Anda terhubung: jika
  Anda luring, **Ambil** menunggu sampai Anda kembali, dan Teman atau Rekan
  yang Dikenal menerimanya begitu Anda terhubung kembali. Perangkat Anda
  memeriksa bahwa Dunia itu ditandatangani oleh Anda sebelum
  menambahkannya, jadi tidak ada yang bisa mengaku-ngaku salinan sebagai
  miliknya.
- Seperti menerbitkan apa pun, berbagi tidak dapat ditarik kembali dari
  orang yang sudah menerimanya.

## Memilih lisensi

### Mengizinkan orang lain me-remix

Saat pertama kali Anda menerbitkan bangunan tanpa lisensi, ForkBuild
bertanya **Izinkan orang lain me-remix?** sebelum apa pun diterbitkan:

- **Ya, izinkan remix** memasang **CC BY 4.0**: siapa pun boleh menyalin
  dan mengubahnya, asalkan mencantumkan nama Anda, dan setiap remix
  menunjukkan bahwa ia berasal dari milik Anda.
- **Tidak, hanya untuk dilihat** memasang **Hak Cipta Dilindungi**: orang
  dapat mengelilinginya, tetapi tidak menyalinnya.
- **Nanti saja** tidak menerbitkan apa pun.

Jawaban Anda disimpan sebagai lisensi bangunan, jadi Anda hanya ditanya
sekali; ubah kapan saja di **Properti Dokumen**. Sebuah fork sudah membawa
lisensi aslinya, jadi menerbitkannya tidak pernah bertanya.

### Semua lisensi

Karya yang diterbitkan selalu ditampilkan dengan lisensi, yang dipilih dari
dialog **Properti Dokumen**:

| Lisensi | Arti |
|---|---|
| **CC0 1.0 — Domain Publik** | Tidak ada hak yang dilindungi — siapa pun boleh melakukan apa pun dengannya |
| **CC BY 4.0 — Atribusi** | Siapa pun boleh mem-fork dan memakai ulang, dengan mencantumkan nama Anda |
| **CC BY-SA 4.0 — Atribusi, BerbagiSerupa** | Fork harus membawa lisensi yang sama |
| **CC BY-NC 4.0 — Atribusi, NonKomersial** | Fork diizinkan, penggunaan komersial tidak |
| **CC BY-ND 4.0 — Atribusi, TanpaTurunan** | Dapat dilihat, tetapi **fork tidak diizinkan** |
| **Hak Cipta Dilindungi** | Dapat dilihat, tetapi fork tidak diizinkan |
| **Tidak ada lisensi yang ditentukan** | Fork tidak diizinkan sampai Anda menetapkan lisensi |

Jika Anda membiarkan karya tanpa lisensi, orang tetap dapat membuka dan
menjelajahinya — mereka hanya tidak dapat mem-fork-nya sampai Anda memilih
lisensi yang mengizinkannya.

## Memilih siapa yang dapat menempatkannya

Orang lain biasanya dapat menempatkan karya terbitan Anda di Dunia mereka
sendiri. Itu menambahkan penempatan bangunan Anda, tidak pernah salinannya,
dan tidak pernah memindahkan atau mengubah milik Anda (lihat
[Mengapa saya bisa menempatkan bangunan orang lain?](03-WorldView.md#mengapa-saya-bisa-menempatkan-bangunan-orang-lain)). Fork adalah hal terpisah dan diatur oleh lisensi (lihat
[Menempatkan vs mem-fork](03-WorldView.md#menempatkan-vs-mem-fork)). Jika Anda lebih suka mereka tidak menempatkannya, buka **Properti
Dokumen** dan atur **Siapa yang dapat menempatkannya di Dunia**:

| Pengaturan | Arti |
|---|---|
| **Siapa pun boleh menempatkannya** | Bawaan. Siapa pun boleh menempatkannya di mana saja di Dunia mereka sendiri |
| **Hanya saya yang boleh menempatkannya** | Hanya Anda yang dapat menempatkannya. Orang lain tetap dapat menemukan, melihat, dan (jika lisensi mengizinkan) mem-fork-nya, tetapi ForkBuild tidak akan membiarkan mereka menempatkannya |

Pengaturan ini ditandatangani sebagai bagian dari publikasi saat Anda
menerbitkan, jadi tidak ada yang dapat menghapus atau mengubahnya setelah
itu. Itu juga berarti pengaturan ini hanya berlaku untuk apa yang Anda
terbitkan setelah memilihnya. Publikasi yang sudah beredar tetap memakai
pengaturan saat diterbitkan, jadi terbitkan lagi jika Anda ingin pengaturan
baru berlaku.

Cara kerjanya sama seperti izin fork pada lisensi: setiap salinan ForkBuild
mematuhinya, tetapi itu bukan kunci. Seseorang yang mengubah kode aplikasi
dapat mengabaikannya, dan pengaturan ini tidak dapat menarik kembali
penempatan yang dibuat seseorang sebelum Anda memilihnya.

Bagaimanapun juga, orang lain melihat bangunan Anda di tempat *Anda*
menaruhnya begitu Anda **Distribusikan** Snapshot-nya dari Tampilan Dunia atau langsung setelah menerbitkan di Editor:
pengumumannya membawa penempatan Anda yang ditandatangani, dan ForkBuild
mereka menampilkan bangunan di sana begitu mengenali Dunia Bersama Anda.
Pindahkan dan distribusikan lagi, dan bangunan itu juga berpindah bagi
mereka.

## Mengedit karya yang sudah diterbitkan

Karya yang sudah diterbitkan **tidak dapat diubah** — tidak pernah bisa
berubah setelahnya. Untuk mengembangkannya, **Fork** (di bawah), atau
gunakan **Edit Salinan** di Tampilan Dunia. Di Tampilan Dunia, membuat
perubahan pertama Anda pada dunia yang diterbitkan — metadatanya, penanda
atau nama wilayah, atau hiasan hewan — otomatis membuat salinan Anda
sendiri, berjudul *"Fork dari &lt;nama asli&gt;"*, dengan konfirmasi
singkat ("Salinan Anda sendiri yang dapat diedit telah dibuat — "…" tidak
berubah"); lihat
[Menyimpan dan menerbitkan di sini juga](03-WorldView.md#menyimpan-dan-menerbitkan-di-sini-juga).

Yang asli tidak pernah tersentuh, seberapa banyak pun Anda mengubah
salinan Anda.

## Repositori

**Repositori** adalah katalog yang dapat dicari berisi setiap karya
terbitan yang diketahui perangkat ini: milik Anda sendiri, yang dibagikan
rekan kepada Anda, dan yang ditemukan di jaringan terdesentralisasi.
Repositori dibuat agar tetap mudah dipakai baik berisi sepuluh karya
maupun sepuluh ribu.

### Bangunan siap pakai

Di bagian atas, **Mulai dari bangunan siap pakai** menampilkan bangunan
yang disertakan bersama ForkBuild: kastil, pulau pelabuhan, alun-alun
desa, rumah, kincir, dan jembatan. Semuanya sudah ada bahkan sebelum ada
yang diterbitkan atau ditemukan. Klik salah satunya (**Remix**) untuk
membuka salinan Anda sendiri di Editor; tidak ada yang diterbitkan sampai
Anda menerbitkannya. Klik judulnya untuk melipat baris itu.

### Karya yang didistribusikan orang lain

Setiap kali Anda membuka Repositori (atau halaman pembuat), Repositori
mencari di Nostr, Arweave, Steem, dan Blurt karya yang didistribusikan orang lain
di sana, lalu menambahkan yang dapat diverifikasinya. Sebuah baris di atas
daftar menjelaskan apa yang sedang dilakukannya, lalu berapa banyak karya
baru yang ditemukannya; **Periksa lagi** mencari sekali lagi.

- Hanya karya yang catatan bertandatangannya lolos pemeriksaan yang
  ditambahkan: ditandatangani dengan kunci yang disebutkannya, dan persis
  karya yang diumumkan. Selebihnya dilewati, dan catatan yang gagal tidak
  diambil lagi.
- Repositori memeriksa hingga 20 karya baru sekaligus. Jika ada lebih
  banyak, baris itu menyebutkan berapa yang tersisa untuk lain kali.
- Karya yang ditemukan dengan cara ini tetap ada di Repositori Anda setelah
  dimuat ulang.
- Build-nya belum ada di perangkat Anda. **Jelajahi** mengambilnya dari
  tempat penyimpanannya dan memeriksanya, lalu membukanya di Tampilan
  Dunia, sama seperti membuka tautan yang dibagikan.

```
Cari [________________]  ☐ Sertakan deskripsi  [Cari]

Urutkan: [Terbaru Diterbitkan ▾]   Kelompokkan: [Tidak ada ▾]   [Kartu] [Daftar]

1.248 publikasi

┌─────────────────────────────────────────┐
│  [pratinjau]  Ancient City               │
│             A reconstruction of a        │
│             Roman city showing…          │
│             🔒 Diterbitkan  oleh alice   │
│             16/8/2026 · CC BY 4.0        │
│             [Buka] [Fork] [Jelajahi]     │
└─────────────────────────────────────────┘

        [← Sebelumnya]  1 2 3 4 5 … 125  [Berikutnya →]
```

- **Cari** secara bawaan melihat judul dan pembuat. Centang **Sertakan
  deskripsi** untuk juga mencari di dalam deskripsi — ini bisa sedikit
  lebih lama, karena harus membaca lebih banyak daripada yang biasanya
  diperlukan daftar.
- **Urutkan** menawarkan lima urutan: Terbaru Diterbitkan, Terlama
  Diterbitkan, Judul A–Z, Judul Z–A, dan Pembuat A–Z.
- **Kelompokkan** mengelompokkan hasil di halaman saat ini menurut
  Pembuat, Tanggal, atau Lisensi — semata untuk menelusuri; tidak mengubah
  apa yang ditemukan atau berapa banyak halamannya.
- **Kartu** paling baik untuk menelusuri secara visual; **Daftar** adalah
  tabel ringkas — beralihlah ke sana saat Anda memindai banyak hasil
  dengan cepat.
- Penomoran halaman eksplisit, halaman demi halaman, bukan gulir tanpa
  akhir — jadi "halaman 5" selalu berarti hal yang sama jika Anda kembali
  nanti.

Setiap karya menawarkan tiga tindakan:

| Tombol | Fungsinya |
|---|---|
| **Buka** | Memuat dokumen itu ke Editor |
| **Fork** | Menyalinnya menjadi karya Anda sendiri yang dapat diedit |
| **Jelajahi** | Terbang ke sana di Tampilan Dunia |

(Tombol **Lanjutkan Menjelajah** milik **Dunia Saya** — lihat
[Dunia Saya](03-WorldView.md#dunia-saya--dunia-yang-benar-benar-pernah-anda-kunjungi) — melakukan hal yang sama dengan **Jelajahi** di sini, hanya
dengan kata-kata untuk Dunia yang sudah pernah Anda kunjungi, bukan yang
baru pertama kali Anda temukan.)

Klik **nama pembuat** mana pun untuk mengunjungi **Halaman pembuat** milik
mereka — portofolio semua yang telah mereka buat, termasuk karya asli dan
semua fork yang tumbuh darinya, memakai katalog pencarian/urutan/penomoran
halaman yang persis sama dengan Repositori, hanya dibatasi pada satu
pembuat itu.

Kartu yang tanda tangannya valid juga memiliki tombol **Ikuti**, dan
Halaman pembuat menampilkan **Ditandatangani oleh …** dengan **Ikuti**
untuk setiap identitas yang menerbitkan dengan nama itu. Mengikuti
seseorang menempatkan karya baru mereka di halaman **Diikuti** dan di
notifikasi Anda; lihat
[Mengikuti orang](07-PeerConnectionsAndFriends.md#mengikuti-orang).

Repositori juga tidak terbatas pada apa yang diterbitkan dari perangkat ini
atau ditemukan secara langsung: karya Repositori terdesentralisasi yang
ditunjukkan seorang rekan kepada Anda di peta
[Perjumpaan Dunia](03-WorldView.md#perjumpaan-dunia--publikasi-dan-avatar-yang-dibagikan-rekan-anda) di Tampilan Dunia, begitu kontennya benar-benar
terselesaikan, juga bergabung ke pencarian yang sama ini dan ke Halaman
pembuatnya, dan tetap di sana setelah dimuat ulang. Karya itu ditampilkan
tidak berbeda dengan hal lain di sini.

## Fork: jadikan milik Anda

**Fork** adalah yang membuat ForkBuild istimewa. Saat Anda mem-fork sebuah
karya:

- Anda mendapat **salinan baru yang mandiri** untuk diedit dengan bebas.
- **Yang asli tidak tersentuh** — perubahan Anda tidak pernah memengaruhinya.
- Salinannya **mengingat dari mana asalnya**, jadi penghargaan tidak pernah
  hilang.

Cara kerjanya persis seperti mem-fork proyek di Git: Anda bercabang,
mengerjakan hal Anda sendiri, dan pohon keluarganya mencatat semua orang.
(Di Tampilan Dunia, fork juga terjadi otomatis begitu Anda mengubah dunia
yang diterbitkan — lihat
[Mengedit karya yang sudah diterbitkan](#mengedit-karya-yang-sudah-diterbitkan)
di atas.)

> **Disebut juga "Edit Salinan" di Tampilan Dunia.** Keduanya operasi yang
> sama di baliknya, dengan aturan lisensi yang sama dan penanganan
> [Fork Tidak Tersedia](#saat-fork-tidak-dapat-diselesaikan) yang sama.
> Lihat
> [Edit Salinan](03-WorldView.md#edit-salinan--membawa-sesuatu-ke-editor) untuk panduan Tampilan Dunia sendiri.

### Cara mem-fork

1. Temukan sebuah karya di **Repositori** (atau di Tampilan Dunia).
2. Klik **Fork**.
3. Salinannya terbuka di Editor, berjudul *"Fork dari &lt;nama asli&gt;"*.
4. Kembangkan, lalu simpan dan terbitkan sebagai milik Anda.

Fork terbitan Anda muncul dengan catatan **Remix dari "…" oleh …**, yang
menautkannya kembali ke yang asli.

### Jumlah remix

Halaman sebuah bangunan dan kartu Repositori-nya menyebutkan berapa kali
ia di-remix (**Di-remix 3 kali**): berapa banyak bangunan berbeda yang
di-fork darinya dan diterbitkan yang telah ditemukan perangkat ini. Remix
yang diterbitkan dua kali dihitung sekali, dan bangunan yang belum pernah
di-remix tidak menampilkan apa pun. Jumlahnya hanya apa yang diketahui
perangkat ini, jadi perangkat lain bisa menampilkan angka berbeda, dan
jumlah itu tidak pernah menentukan apa yang ditampilkan lebih dulu.

Saat perangkat ini menemukan remix dari orang lain atas salah satu
bangunan Anda, 🔔 Anda mendapat entri **… me-remix bangunan Anda**, sekali
per remix (dan perangkat Anda juga menampilkannya, jika Anda mengaktifkan
[Notifikasi di perangkat ini](03-WorldView.md#notifikasi-di-perangkat-ini)).

### Saat fork tidak dapat diselesaikan

Sesekali fork tidak dapat dilakukan — paling sering saat mem-fork Dunia
Bersama yang ditemukan melalui rekan atau jaringan terdesentralisasi
(lihat [Publikasi & Bukti Eksternal](09-PublicationsAndEvidence.md)),
bukan entri Repositori biasa. Alih-alih melempar Anda ke dokumen Editor
kosong yang tidak berhubungan, ForkBuild menampilkan dialog **Fork Tidak
Tersedia** yang menyebutkan persis apa yang salah:

- **Dunia Bersama ini tidak dapat di-fork berdasarkan lisensinya.** —
  lisensi yang melekat pada apa yang ingin Anda fork tidak mengizinkannya
  (lihat [Memilih lisensi](#memilih-lisensi) di atas).
- **Materi Dunia Bersama ini sedang tidak tersedia.** — lisensinya
  mengizinkan fork, tetapi konten sebenarnya belum ada di perangkat ini
  (atau belum dapat dijangkau melalui rekan yang terhubung).

Bagaimanapun juga, satu-satunya tombol di dialog itu, **Kembali ke Dunia
Bersama**, membawa Anda kembali ke tempat Anda menemukannya — Dunia tempat
karya itu ditempatkan, atau Dunia Bersama itu sendiri — alih-alih
meninggalkan Anda terdampar di Editor tanpa apa pun untuk dibangun.

## Tantangan membangun mingguan

Setiap minggu ForkBuild memberi tema untuk dibangun (mercusuar, jembatan,
rumah mungil, …), dari Senin sampai akhir Minggu (UTC). Beranda
menampilkannya, dan **Tantangan** di bilah atas membuka halamannya.

1. **Ikut tantangan** membuka bangunan awal di Editor sebagai salinan Anda
   sendiri, sudah bertag minggu itu (tag seperti `#lighthouse-20261012`:
   temanya dan hari Senin saat dimulai). Tantangan juga menjadi pilihan
   pertama di **Baru** pada Editor, dan **Ide untuk memulai** di halamannya
   membuka bangunan lain yang cocok dengan cara yang sama.
2. Jadikan milik Anda, atau mulai lagi dari lahan kosong: apa pun yang Anda
   bangun ikut serta selama tetap memakai tag minggu itu (tambahkan di
   **Properti Dokumen → Tag** jika Anda memulai dengan cara lain).
3. Terbitkan sebelum minggu berakhir, lalu bagikan tautannya. Teks
   tautannya menyebut tantangan dan tagnya, siap untuk sebuah postingan.

Halaman tantangan menampilkan karya peserta yang diketahui perangkat ini:
bangunan Anda sendiri yang diterbitkan dengan tag itu, dan bangunan orang
lain yang ditemukan di jaringan. Saat bangunan didistribusikan ke Nostr, Arweave, Steem, atau Blurt, pengumumannya (di Blurt, postingannya) mencantumkan tagnya, dan halaman itu menanyakan
tag minggu itu ke jaringan tersebut setiap kali dibuka (**Periksa lagi**
menanyakan lagi). Setiap karya yang ditemukan diperiksa seperti semua yang
ditemukan Repositori, dan juga muncul di Repositori. Bangunan yang hanya dibagikan lewat tautannya tidak ditemukan dengan cara ini, begitu pula bangunan yang hanya diumumkan di Steem sebelum 8 Oktober 2026, saat pengumuman Steem mulai mencantumkan tag. Minggu-minggu sebelumnya tetap bisa dibuka
lewat hari Seninnya (**Minggu lalu: …**), tanpa **Ikut**.

Karya peserta ditampilkan dari yang terbaru, dengan jumlah remix-nya. Tidak
ada yang menilai dan tidak ada peringkat: tantangan ini adalah alasan untuk
membangun sesuatu minggu ini, dan melihat apa yang dibuat orang lain dari
ide yang sama.

Jika ada karya peserta yang di-remix dari satu sama lain, atau dari
bangunan lain, **Silsilah** di bawah daftar peserta menunjukkan asalnya,
satu pohon untuk setiap rantai remix.

## Pohon keluarga

Karena setiap fork mencatat induknya, ForkBuild dapat menggambar seluruh
silsilah sebuah karya. Di **Halaman pembuat**, Anda akan melihat **pohon
fork**:

```
Medieval House (asli)
└─ Fork dari Medieval House (oleh Bob)
   └─ Fork dari Fork dari… (oleh Carol)
```

Ini berarti sebuah karya hebat dapat mengilhami seluruh ekosistem variasi —
dan setiap orang dalam rantai itu mendapat penghargaan.

Halaman sebuah bangunan, yang dibuka dari tautan yang dibagikan,
menampilkan garis keturunan yang sama sebagai **Silsilah**: asal remix-nya
sampai yang asli, lalu bangunan itu sendiri, lalu remix yang dibuat
darinya, sejauh yang diketahui perangkat ini.

## Alur kreatif yang umum

Inilah seluruh perjalanannya dalam satu alur:

1. **Bangun** sebuah karya di Editor.
2. **Simpan**.
3. **Terbitkan** ke Repositori.
4. Seseorang **menemukannya** — dengan mencari, dengan menjelajahi sekitar
   di Tampilan Dunia, atau dengan menelusuri Halaman pembuat Anda — lalu
   **mem-fork**-nya.
5. Mereka **menerbitkan** fork mereka.
6. Orang lain **menjelajahi** keduanya di Tampilan Dunia, dan pohonnya
   tumbuh.

Itulah ekosistem konstruksi terbuka yang menjadi tujuan ForkBuild.

## Apa selanjutnya?

Simpan [Referensi Kontrol](ControlsReference.md) di dekat Anda saat
membangun, atau kembali dan jelajahi
[Tampilan Dunia](03-WorldView.md) lebih dalam.
