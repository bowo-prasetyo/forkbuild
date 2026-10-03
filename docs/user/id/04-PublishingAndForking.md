<!-- translation-of: docs/user/04-PublishingAndForking.md source-hash: 31b37f7993e1c8cc -->
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
   menandatangani karya itu dengan identitas tersebut; jika diterbitkan
   saat belum masuk, karya itu tidak memiliki pembuat.
3. Beri judul — Terbitkan menolak karya tanpa judul atau kosong — dan,
   secara opsional, deskripsi dan lisensi: klik **✎** di samping judul
   dokumen di bilah sisi untuk membuka **Properti Dokumen**. Dokumen baru
   tidak memiliki lisensi, jadi tidak ada yang dapat mem-fork-nya sampai
   Anda memilih lisensi.
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
> Dua langkah terpisah yang opsional yang melakukannya: **Distribusikan**,
> yang dijelaskan berikutnya, mengirim publikasi ke Arweave atau IPFS dan
> mengumumkannya di Nostr atau Arweave sehingga orang lain dapat
> menemukannya tanpa terhubung dengan Anda; dan
> [**Bagikan dengan Rekan**](#berbagi-dengan-rekan-yang-terhubung)
> menawarkannya kepada orang-orang yang terhubung dengan Anda.

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

Dunia yang Anda terbitkan hanya tercantum di Repositori *Anda*. Untuk
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
  yang mengunduh Dunia orang asing tanpa diminta.
- Dunia itu hanya diambil dari Anda, dan hanya selama Anda terhubung: jika
  Anda luring, **Ambil** menunggu sampai Anda kembali, dan Teman atau Rekan
  yang Dikenal menerimanya begitu Anda terhubung kembali. Perangkat Anda
  memeriksa bahwa Dunia itu ditandatangani oleh Anda sebelum
  menambahkannya, jadi tidak ada yang bisa mengaku-ngaku salinan sebagai
  miliknya.
- Seperti menerbitkan apa pun, berbagi tidak dapat ditarik kembali dari
  orang yang sudah menerimanya.

## Memilih lisensi

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

Fork terbitan Anda muncul dengan catatan **"↳ Fork dari …"**, yang
menautkannya kembali ke yang asli.

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
