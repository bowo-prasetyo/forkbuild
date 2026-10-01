<!-- translation-of: docs/user/09-PublicationsAndEvidence.md source-hash: 324c4a96e01cda7a -->
# 09 — Publikasi & Bukti Eksternal

<!-- languages -->
[English](../09-PublicationsAndEvidence.md) · [Deutsch](../de/09-PublicationsAndEvidence.md) · [Español](../es/09-PublicationsAndEvidence.md) · **Bahasa Indonesia** · [日本語](../ja/09-PublicationsAndEvidence.md)
<!-- /languages -->

> **Sebagian eksperimental.** Halaman Publikasi adalah fitur biasa: daftar
> dan statusnya, menghapus publikasi yang tidak dapat dipakai, mengumumkan
> di Nostr atau Arweave, menyimpan di IPFS atau Arweave, serta memeriksa,
> mengimpor, atau mengambil snapshot sebuah kartu. Sisanya
> **Eksperimental**: berfungsi, tetapi dapat berubah atau dihapus di versi
> berikutnya, dan apa yang dihasilkannya mungkin tidak terbawa. Halaman ini
> menandai setiap bagian seperti itu dengan lencana **Eksperimental**
> (**Eksp.** pada tab): setiap jenis penjangkaran, dompet, Steem, pinning
> IPFS jarak jauh, tab **Desentralisasi & Bukti**, **Penempatan & IPFS**,
> dan **Riwayat**, bagian kepemilikan rekan dan ringkasan di tab
> **Snapshot**, serta seluruh panel **Dompet, Arsip & Alat Penerbit**.
> Panduan [11](11-EvidenceAndStorage.md) dan
> [12](12-ArchiveAndLeaderboards.md) menyebutkan bagian mana yang
> Eksperimental. Membangun, menyimpan, menerbitkan ke Repositori, fork,
> identitas, dan rekan tidak bergantung pada semua itu.

Tidak ada satu pun dari ini yang diperlukan untuk memakai ForkBuild.
Lewati saja jika Anda hanya ingin membangun, menerbitkan, dan menjelajah.

Halaman **Publikasi** adalah lapisan yang lebih teknis daripada Repositori.
Repositori berkaitan dengan Dokumen dan Dunia; halaman Publikasi berkaitan
dengan **klaim bertanda tangan** seperti "Saya merancang struktur ini" atau
"Saya menyebut tempat ini X", dan dengan kedalaman opsional yang dapat Anda
tambahkan pada sebuah klaim:

- **Panduan ini** — dari mana klaim berasal, halaman Publikasi,
  [Komentar](#komentar), dan [Snapshot Lokal](#snapshot-lokal) (apa yang
  disimpan perangkat Anda).
- **[Pengaturan Jaringan](10-NetworkSettings.md)** — gateway, relay,
  penyedia, dan server koneksi rekan. Tidak eksperimental, dan berguna bagi
  semua orang.
- **[Bukti & Penyimpanan](11-EvidenceAndStorage.md)** — bukti eksternal
  (Bitcoin, Base, Arweave, Steem), alur dompet, Penempatan Snapshot,
  penerbitan IPFS, dan Steem.
- **[Arsip & Papan Peringkat](12-ArchiveAndLeaderboards.md)** — arsip
  pengamatan yang tahan lama, referensi, pencapaian, label penerbit, dan
  halaman Papan Peringkat.

## Dua arti "terbitkan"

| | **Terbitkan** (Repositori) | **Halaman Publikasi** |
|---|---|---|
| Apa yang dibagikan | Dokumen atau Dunia | Catatan bertanda tangan: Dunia Bersama, kepengarangan struktur, atau nama tempat |
| Tempat melihatnya | Repositori, Halaman pembuat, Tampilan Dunia | Halaman **Publikasi** |
| Apa yang Anda lakukan dengannya | Membuka, menjelajahi, mem-fork | Memeriksanya, mengambil kontennya, mendistribusikan dan menjangkarkannya |
| Panduan | [Penerbitan & Fork](04-PublishingAndForking.md) | Yang ini |

**Terbitkan** saja tidak memasukkan sebuah Dunia ke halaman Publikasi.
**Bagikan dengan Rekan** yang melakukannya: ia menandatangani Dunia itu
sebagai **Dunia Bersama** yang dapat berpindah ke rekan (lihat
[Karya Repositori, terdesentralisasi](#karya-repositori-terdesentralisasi)).

Halaman Publikasi tidak memiliki **Buka**, **Jelajahi**, atau **Fork**,
bahkan untuk Dunia Bersama. Halaman ini menampilkan catatan bertanda
tangan, bukan Dunianya. Untuk membuka, menjelajahi, atau mem-fork Dunia
Bersama, temukan di Repositori, di halaman pembuatnya, atau di Tampilan
Dunia. Yang Anda terima dari rekan muncul di sana begitu kontennya ada di
perangkat ini. (Satu-satunya pengecualian adalah **Buka di Editor** pada
Dunia Bersama milik Anda sendiri yang perlu diterbitkan lagi; lihat
[Arti status](#arti-status).)

Setiap entri di halaman Publikasi adalah sebuah *publikasi*, dan
masing-masing adalah salah satu dari tiga jenis:

| Jenis | Apa itu |
|---|---|
| **Dunia Bersama** | Dunia yang diterbitkan, sebagai catatan bertanda tangan yang dapat berpindah antarrekan dan jaringan |
| **Atribusi Cetak Biru** | Klaim bahwa Anda merancang sebuah struktur |
| **Klaim Nama Tempat** | Nama untuk sebuah Wilayah atau Penanda |

Tampilan Dunia, Editor, dan Repositori juga menyebut catatan bertanda
tangan sebuah Dunia sebagai **Dunia Bersama**, seperti di **Dunia Bersama
Saya**, **Temukan Dunia Bersama**, dan **Kembali ke Dunia Bersama**.

## Apa yang melingkupi sebuah publikasi

Publikasi hanyalah catatan bertanda tangan. Semua hal lain yang Anda lihat
di kartunya, dan di sekitarnya di Tampilan Dunia, adalah sesuatu yang
dilakukan dengannya atau dilekatkan padanya. Tidak satu pun dari itu yang
merupakan jenis publikasi, dan hanya publikasi itu sendiri yang wajib:

| Istilah | Seperti… | Apa itu |
|---|---|---|
| **Publikasi** | Bukunya sendiri | Catatan bertanda tangan: Dunia Bersama, Atribusi Cetak Biru, atau Klaim Nama Tempat. Membawa hash kontennya dan tanda tangan penerbitnya. |
| **Konten** | Tempat salinan cetak disimpan | Byte yang menjadi isi publikasi, seperti balok sebuah Dunia. Selalu disimpan di perangkat ini terlebih dahulu; **Simpan di …** menaruh salinannya di IPFS, Arweave, atau Steem agar orang lain dapat mengambilnya. Lihat [Penyedia Konten](10-NetworkSettings.md#penyedia-konten). |
| **Snapshot** | Satu salinan cetak | Satu salinan tersimpan dari konten publikasi, seperti balok sebuah Dunia, yang dapat diambil orang lain dan dicocokkan dengan hash-nya. Lihat [Snapshot Lokal](#snapshot-lokal). |
| **Penempatan** | Rak tempat salinan itu ditaruh | Catatan bertanda tangan tentang di mana sebuah bangunan berdiri di Dunia. Satu Dunia Bersama dapat memiliki beberapa penempatan. Lihat [Menempatkan vs mem-fork](03-WorldView.md#menempatkan-vs-mem-fork). |
| **Pengumuman / Penemuan** | Entri katalog perpustakaan | Pemberitahuan kecil bertanda tangan di Nostr, Arweave, atau Steem yang menyatakan bahwa publikasi atau Snapshot itu ada dan di mana salinannya, agar orang yang tidak terhubung dengan Anda dapat menemukannya. Lihat [Penyedia Pengumuman / Penemuan](10-NetworkSettings.md#penyedia-pengumuman--penemuan). |
| **Bukti / Penjangkaran** *(Eksperimental)* | Cap notaris | Hash konten yang ditulis ke dalam transaksi blockchain (Bitcoin, Base, Arweave, atau Steem), sebagai bukti bahwa konten itu sudah ada pada waktu tersebut. Tidak menyimpan atau mengumumkan apa pun. Lihat [Bukti & Penyimpanan](11-EvidenceAndStorage.md). |
| **Komentar** | Ulasan pembaca | Komentar yang dapat dilekatkan siapa pun yang sudah masuk pada sebuah publikasi, masing-masing ditandatangani oleh pemberi komentar, bukan oleh penerbit. Lihat [Komentar](#komentar). |

Jadi Anda membuat publikasi; lalu, jika mau, menyimpan kontennya,
mengumumkannya, menjangkarkannya, dan menempatkannya (untuk Dunia
Bersama); dan siapa pun dapat mengomentarinya.

## Dari mana publikasi berasal

Anda tidak pernah membuat klaim di halaman Publikasi itu sendiri. Halaman
ini mencantumkan klaim yang Anda buat di tempat lain, yang dikirim rekan
kepada Anda, dan karya Repositori yang datang dalam bentuk
terdesentralisasi. Klaim nama tempat juga dapat ditemukan langsung dari
Nostr, tanpa melibatkan rekan; lihat
[Nama Tempat di Sekitar](03-WorldView.md#nama-tempat-di-sekitar--menemukan-klaim-dari-siapa-pun).

### Mengklaim kepengarangan sebuah struktur

Buka panel **Info** sebuah struktur dari **Struktur Saya** di Pustaka
Bangunan Editor. Jika struktur itu memiliki identitas Cetak Biru
(kebanyakan struktur tersimpan memilikinya), bagian **Atribusi Komunitas**
menawarkan:

- **Klaim kepengarangan** — menandatangani klaim, dengan identitas Anda
  saat ini, bahwa Anda yang merancangnya. Ditampilkan sampai Anda
  mengklaimnya.
- **Ekspor Atribusi** — menyimpan klaim Anda sebagai file yang dapat Anda
  berikan kepada seseorang.
- **Terbitkan ke Jaringan** — mengumumkan klaim Anda kepada setiap rekan
  yang terhubung dengan Anda, sehingga klaim itu masuk ke halaman Publikasi
  mereka, dan milik Anda.

### Memberi nama tempat

Di Tampilan Dunia, buka panel penamaan untuk sebuah Wilayah atau Penanda
dan gunakan **Terbitkan Sebuah Nama** (lihat
[Tempat geografis](03-WorldView.md#tempat-geografis)). Ini mengumumkan klaim bertanda tangan kepada rekan yang
terhubung dengan Anda.

Agar nama itu juga dapat ditemukan melalui
[Nama Tempat di Sekitar](03-WorldView.md#nama-tempat-di-sekitar--menemukan-klaim-dari-siapa-pun), buka **Lainnya** di panel penamaan, temukan klaimnya di
**Semua Klaim**, dan klik **Terbitkan ke Nostr**. Ini langkah terpisah:
tidak ada tindakan yang melakukan tindakan lainnya. Keberhasilan
menyebutkan relay yang dicapainya; kegagalan, paling sering karena tidak
ada ekstensi browser Nostr yang terpasang, menampilkan kesalahannya.

### Menerima dari rekan

Saat Anda terhubung dengan rekan (lihat
[Koneksi Rekan & Teman](07-PeerConnectionsAndFriends.md)), perangkat Anda
menerima semua yang telah mereka terbitkan, bukan hanya yang mereka
terbitkan selama kalian terhubung. Klaim yang diterima hanyalah catatan
yang ditandatangani dengan sah: kontennya tidak ada di perangkat Anda
sampai Anda mengambilnya dengan **Ambil dari Rekan** (di bawah).

### Karya Repositori, terdesentralisasi

Sebuah kartu juga dapat berisi **Dunia Bersama** — jenis objek yang sama
dengan entri Repositori, dibungkus untuk perjalanan terdesentralisasi.
**Bagikan dengan Rekan** di Repositori membuatnya untuk Dunia Anda sendiri
(lihat
[Berbagi dengan rekan yang terhubung](04-PublishingAndForking.md#berbagi-dengan-rekan-yang-terhubung)).
Begitu Anda menyelesaikannya di sini dengan **Periksa Ulang** atau **Ambil
dari Rekan**, karya itu bergabung ke pencarian Repositori, halaman
pembuatnya, dan Tampilan Dunia, dan tetap ada setelah dimuat ulang.

## Halaman Publikasi

Buka **Publikasi** di bilah atas. Halaman ini mencantumkan setiap publikasi
bertanda tangan yang telah dikatalogkan perangkat ini, milik Anda atau
milik rekan. Di bagian bawah, panel terlipat **Dompet, Arsip & Alat
Penerbit** berisi alat untuk seluruh halaman dalam tiga tab:
**Penjangkaran Blockchain**, **Alat Arsip**, dan **Referensi &
Pencapaian** (lihat panduan [11](11-EvidenceAndStorage.md) dan
[12](12-ArchiveAndLeaderboards.md)). Tautan ke panel itu di pengantar
halaman, dan di setiap langkah yang memerlukan pengamatan dompet terlebih
dahulu, akan membukanya untuk Anda.

Setiap kartu publikasi menampilkan:

- Namanya, setelah kontennya diperiksa: judul Dunia Bersama atau nama
  tempat. Jika belum, atau untuk klaim kepengarangan, jenis publikasinya.
- Jenis publikasi (di bawah nama, jika ada) dan siapa yang menerbitkannya,
  dipersingkat menjadi beberapa karakter terakhir ID mereka.
- **Lencana status** (lihat [Arti status](#arti-status)), yang dihitung
  ulang setiap kali halaman dimuat atau Anda mengeklik **Periksa Ulang**.
- Ringkasan satu baris dari klaim: sidik jari dan pengklaim sebuah
  atribusi, atau nama tempat dan pengklaimnya.
- **Ambil dari Rekan**, selama kontennya tidak tersedia (nonaktif tanpa
  rekan yang terhubung). Tombol ini meminta byte kepada setiap rekan yang
  terhubung secara bergiliran, dan menerimanya hanya setelah perangkat Anda
  mencocokkannya dengan hash konten.
- **Periksa Ulang** — menghitung ulang status sekarang.

Di bawahnya, dua bagian terlipat:

- **Distribusi** — mengumumkan publikasi, menyimpan kontennya, dan
  menjangkarkannya. Penyimpanan dan penjangkaran masing-masing diawali satu
  tombol untuk penyedia yang Anda simpan di **Konfigurasi** (**Simpan di
  IPFS**, **Jangkarkan di Steem**), dengan setiap penyedia lain terlipat di
  bawah **Opsi … lain**. Tanpa penyedia tersimpan yang dapat dipakai,
  semua opsi ditampilkan. Steem dan pinning IPFS jarak jauh ditandai
  **Eksperimental** di mana pun ditawarkan, begitu pula seluruh blok
  **Bukti / Penjangkaran**. Lihat
  [Mendistribusikan dari halaman Publikasi](#mendistribusikan-dari-halaman-publikasi)
  dan [Bukti & Penyimpanan](11-EvidenceAndStorage.md).
- **Detail**, dalam empat tab:

| Tab | Isinya |
|---|---|
| **Snapshot** | [Snapshot Lokal](#snapshot-lokal): apa yang disimpan perangkat ini, dan cara mendapatkannya. |
| **Desentralisasi & Bukti** *(Eksp.)* | [Desentralisasi](#desentralisasi-sekilas), [daftar bukti](11-EvidenceAndStorage.md#daftar-bukti), dan langkah-langkah transaksi Bitcoin dan Base. |
| **Penempatan & IPFS** *(Eksp.)* | Daftar [Penempatan Snapshot](11-EvidenceAndStorage.md#penempatan-snapshot) dan [Penerbitan IPFS](11-EvidenceAndStorage.md#penerbitan-ipfs). |
| **Riwayat** *(Eksp.)* | **Tampilkan Linimasa Lintas Domain**: setiap pengamatan IPFS dan Bitcoin untuk publikasi ini, berurutan menurut waktu. |

### Arti status

| Lencana | Arti |
|---|---|
| **Tersedia** | Kontennya ada di perangkat ini sekarang. |
| **Konten tidak tersedia** | Klaimnya asli, tetapi kontennya belum ada di sini. Coba **Ambil dari Rekan**. |
| **Amplop publikasi tidak valid** / **Tanda tangan publikasi tidak valid** | Catatannya rusak, atau tidak benar-benar ditandatangani. |
| **Konten tidak cocok dengan referensinya sendiri** / **Konten tidak valid** / **Tanda tangan konten tidak valid** | Kontennya tidak cocok dengan apa yang diklaim publikasi. |
| **Gagal dalam pemeriksaan khusus domain** | Bentuknya benar dan ditandatangani, tetapi gagal dalam pemeriksaan khusus untuk jenisnya. |
| **Jenis publikasi tidak didukung** | Versi ini tidak dapat menampilkan jenis publikasi ini. |

Status ini menjelaskan apakah catatannya valid, bukan apakah desain atau
namanya bagus.

Publikasi yang statusnya bukan **Tersedia** atau **Konten tidak tersedia**
tidak dapat dibuka, didistribusikan, atau dijangkarkan, jadi tidak diberi
kartu lengkap. Publikasi semacam itu dikumpulkan di bagian bawah halaman
dalam kelompok terlipat, "*N* publikasi yang tidak dapat digunakan",
masing-masing dengan statusnya, alasannya, **Periksa Ulang**, dan **Hapus
dari Perangkat Ini**. Publikasi itu juga tidak diikutkan di **Jangkarkan
Beberapa Publikasi**. Alasan yang paling umum adalah publikasi yang dibuat
sebelum hash konten menjadi SHA-256: hanya pembuatnya yang dapat
memperbaikinya, dengan menerbitkannya lagi.

Jika salah satunya **milik Anda** (ditandatangani oleh identitas di
perangkat ini) dan gagal hanya karena hash lamanya, publikasi itu
dicantumkan paling atas dengan lencana **Milik Anda**. Alih-alih "pembuatnya
perlu menerbitkannya lagi", ia memberi tahu caranya:

| Jenis | Cara menerbitkannya lagi |
|---|---|
| **Dunia Bersama** | Terbitkan Dunia itu lagi dari Editor, lalu **Bagikan dengan Rekan** di bawahnya di Repositori (**Buka Repositori**). |
| **Atribusi Cetak Biru** | Di Editor, buka panel **Info** struktur itu, **Tandatangani ulang untuk desain ini**, lalu **Terbitkan ke Jaringan** (**Buka Editor**). |
| **Klaim Nama Tempat** | Di Tampilan Dunia, buka panel penamaan tempat itu dan **Terbitkan Sebuah Nama** lagi. |

Untuk sebuah Dunia, kartunya melangkah lebih jauh saat perangkat ini masih
menyimpan catatannya sendiri tentang apa yang Anda terbitkan: kartu itu
diberi nama Dunianya (**My Castle** alih-alih **Dunia Bersama**) dan **Buka
di Editor** membuka Dunia itu, siap diterbitkan lagi. Nama dan tautannya
berasal dari catatan Anda sendiri, tidak pernah dari konten entri lama yang
tidak dapat diperiksa siapa pun. Jika catatannya sudah tidak ada (Anda
membatalkan penerbitan Dunia itu sejak saat itu), kartunya menampilkan
**Buka Repositori** seperti di atas.

Salinan baru mendapat kartunya sendiri; lalu hapus yang lama. Yang lama
tidak pernah diterima, meskipun milik Anda: perangkat ini juga menyimpan
konten yang diterimanya dari rekan, jadi hash lama tidak dapat membuktikan
byte mana yang Anda terbitkan.

**Hapus dari Perangkat Ini** (atau **Hapus Semua *N* dari Perangkat Ini**
di bagian atas kelompok) meminta konfirmasi, lalu melupakan publikasi itu
di sini. Ini tidak membatalkan penerbitan apa pun atau menjangkau orang
lain, dan rekan terhubung yang masih memiliki publikasi itu dapat
mengumumkannya lagi. Hanya publikasi di kelompok ini yang dapat dihapus.

### Mendistribusikan dari halaman Publikasi

**Distribusi → Pengumuman / Penemuan** memiliki dua kartu:

- **Publikasi** mengumumkan publikasi bertanda tangan itu sendiri di
  **Substrat** yang Anda pilih (Arweave, Nostr, atau Steem, yang
  Eksperimental). Pilihan awalnya adalah
  [Penyedia Pengumuman / Penemuan](10-NetworkSettings.md#penyedia-pengumuman--penemuan)
  Anda.
- **Snapshot** menyimpan konten di bawah **Konten** dan mengumumkannya di
  **Substrat**-nya sendiri, yang juga dimulai dari penyedia itu. Untuk
  sebuah Dunia, itu adalah snapshot Dunia itu sendiri, diumumkan bersama
  tempat penerbitnya menempatkannya jika perangkat ini menyimpan
  penempatan bertanda tangan itu, seperti yang dilakukan **Distribusikan**
  di Tampilan Dunia. Untuk jenis lain, itu adalah konten publikasi,
  diumumkan hanya dengan hash-nya. Perangkat ini memerlukan byte-nya: untuk
  Dunia yang belum Anda buka, buka di Tampilan Dunia atau ambil dari rekan
  terlebih dahulu.

Hasilnya menyebutkan substrat yang dipakai, seperti **Steem: Diumumkan**,
dan untuk sebuah Dunia menyebutkan apakah penempatan penerbitnya ikut
terkirim. **Belum diumumkan** berarti hanya pengumumannya yang gagal;
kontennya sudah tersimpan.

## Komentar

Identitas mana pun yang sudah masuk dapat mengomentari publikasi apa pun
yang terselesaikan: karya Repositori, klaim kepengarangan, atau nama
tempat. Tidak ada pemeriksaan kepemilikan, syarat pertemanan, atau
moderasi.

Anda akan menemukan komentar:

- di **Repositori** dan di halaman pembuat: tombol **Komentar** di setiap
  kartu dan baris daftar;
- di panel
  [Dunia Bersama Saya](03-WorldView.md#dunia-bersama-saya--mendistribusikan-snapshot-anda-sendiri-tanpa-rekan) di Tampilan Dunia, di bagian **Komentar**-nya;
- pada **Perjumpaan Dunia** yang dipilih: tombol **Komentar**-nya.

Masing-masing menampilkan komentar, dari yang terlama, dengan identitas
setiap pemberi komentar. Jika sudah masuk, Anda mendapat kotak teks dan
**Kirim Komentar**; jika belum, catatan untuk masuk.

Komentar bersifat permanen: tidak ada penyuntingan, penghapusan, atau
balasan.

### Cara komentar berpindah

Komentar yang dikirim dari **Repositori** disimpan di perangkat Anda,
dikirim ke rekan yang terhubung dengan Anda, dan diterbitkan ke jaringan
yang dipilih di samping **Kirim Komentar** (Nostr, Arweave, atau Steem;
dimulai dari
[Penyedia Pengumuman / Penemuan](10-NetworkSettings.md#penyedia-pengumuman--penemuan)
Anda), sehingga orang yang tidak terhubung dapat menemukannya. Menutup
bagian itu (**Sembunyikan Komentar**) membuang apa pun yang sudah Anda
ketik tetapi belum dikirim. Komentar yang dikirim dari **Dunia Bersama
Saya** atau **Perjumpaan Dunia** di Tampilan Dunia, untuk saat ini, hanya
disimpan di perangkat Anda.

Komentar orang lain sampai kepada Anda:

- dari rekan yang terhubung, saat komentar itu dikirim;
- dari jaringan, saat Anda membuka komentar sebuah publikasi dan setiap
  kali Anda mengeklik **Periksa komentar baru**. Beginilah Anda melihat
  komentar yang dikirim selama Anda luring.

Baris di samping tombol melaporkan pemeriksaan terakhir, seperti
*Ditemukan 2 komentar baru* atau *Tidak ada komentar baru* (yang hanya
mencakup jaringan yang menjawab). Jaringan yang tidak dapat dijangkau
disebutkan namanya (*Arweave tidak tersedia*); jika tidak ada yang
menjawab, Anda melihat *Tidak dapat menjangkau Nostr atau Arweave —
menampilkan komentar yang tersimpan di perangkat ini.* Hanya publikasi yang
komentarnya Anda buka yang diperiksa. Tanda tangan setiap komentar yang
diambil diperiksa, dan tidak ada yang dihitung dua kali.

Saat seseorang mengomentari publikasi yang Anda terbitkan, entri
**Publication commented** (publikasi Anda dikomentari) muncul di
[Riwayat Notifikasi](03-WorldView.md#orientasi-dan-lokasi) Anda (tombol 🔔 di kepala halaman). Itulah satu-satunya
jenis notifikasi yang dimiliki ForkBuild saat ini.

## Snapshot Lokal

Di tab **Snapshot** sebuah kartu, **Snapshot Lokal** menjawab satu
pertanyaan: apakah perangkat ini menyimpan byte untuk konten publikasi ini
sekarang? Bagian ini tidak memeriksa tanda tangan atau penempatan, dan
menghubungi jaringan hanya saat Anda mengeklik salah satu tindakan
pengambilan.

### Memeriksa apa yang Anda miliki

**Periksa Snapshot Lokal** (lalu **Periksa Lagi**):

| Lencana | Arti |
|---|---|
| **Tersedia** | Byte-nya ada di sini dan cocok dengan hash konten. |
| **Tidak tersedia** | Tidak pernah ada yang disimpan dengan hash ini. |
| **Hash tidak cocok** | Ada sesuatu yang disimpan dengan hash ini, tetapi tidak lagi cocok. |

Dua orang dengan publikasi yang sama bisa mendapat jawaban berbeda, karena
penyimpanan mereka berbeda. Setelah pemeriksaan, sebuah baris berbunyi
*Publikasi: diketahui secara lokal / tidak diketahui secara lokal ·
Snapshot: tersedia / tidak tersedia*: apakah perangkat ini telah
mengatalogkan publikasi bertanda tangan itu, dan apakah perangkat ini
menyimpan byte yang valid.

### Mendatangkan byte-nya

Tiga tindakan, masing-masing dengan kliknya sendiri:

**Impor Snapshot** — menampilkan pemilih file dan kotak tempel untuk
**Paket Transfer Snapshot Publikasi** (bundel JSON berisi konten satu
publikasi). Pilih atau tempelkan satu, lalu klik **Impor Snapshot** lagi.

| Lencana | Arti |
|---|---|
| **Diimpor** | Disimpan dan dicocokkan dengan hash-nya. |
| **Sudah tersedia** | Byte yang cocok sudah ada di sini. |
| **Impor ditolak** | Byte paket tidak cocok dengan hash paket itu sendiri. |
| **Snapshot tidak diimpor** | Bukan paket yang valid. |

**Ambil Snapshot dari Rekan** — pilih satu rekan yang terhubung dan klik
**Ambil Snapshot dari Rekan** (lalu **…Lagi**). Tindakan ini hanya bertanya
kepada rekan itu.

| Lencana | Arti |
|---|---|
| **Diperoleh** | Byte dari rekan cocok dengan hash konten. |
| **Sudah tersedia** | Byte yang cocok sudah ada di sini. |
| **Saat ini tidak tersedia** | Rekan tidak menjawab, atau tidak memilikinya. |
| **Ditolak** | Byte dari rekan tidak cocok. |

**Materialisasi Snapshot**, dari sebuah penempatan (lihat
[Penempatan Snapshot](11-EvidenceAndStorage.md#penempatan-snapshot)),
adalah cara ketiga. Begitu salah satu dari ketiganya berhasil, baris
**Sumber:** menyebutkan yang terakhir berhasil: "Paket transfer",
"Penempatan", atau "Rekan".

### Bertanya kepada rekan apa yang mereka miliki

*Eksperimental*, begitu pula **Ringkasan** di bawah.

**Kepemilikan Snapshot oleh Rekan** bertanya kepada satu rekan apakah
mereka menyimpan byte-nya, tanpa mengambilnya: pilih rekan dan klik
**Periksa ke Rekan** (lalu **…Lagi**). Jawabannya, dengan waktu
**Diamati:**, adalah **Rekan melaporkan snapshot tersedia**, **Rekan
melaporkan snapshot tidak tersedia**, atau **Tidak ada jawaban dari
rekan**. Pemeriksaan baru menggantikan yang terakhir.

**Perbandingan Kepemilikan Snapshot oleh Rekan** bertanya kepada beberapa
rekan: centang rekan-rekannya dan klik **Periksa Rekan Terpilih** (lalu
**…Lagi**). Sebuah tabel menampilkan laporan setiap rekan (**Tersedia**,
**Tidak tersedia**, atau **Tidak dapat ditentukan**) dan waktunya, ditambah
totalnya. **Tampilkan Riwayat Pengamatan** mencantumkan setiap pemeriksaan
pada kunjungan ini, satu baris masing-masing (seperti
`20:21:04 — Alice → Tersedia`); klik sebuah baris untuk laporan lengkap,
publikasi, dan hash kontennya. Sebuah baris mencatat apa yang dikatakan
rekan pada saat itu dan tidak pernah ditulis ulang.

### Ringkasan

- **Perolehan Snapshot**, di bagian atas bagian ini begitu Anda memeriksa
  atau mencoba sesuatu: **Kepemilikan saat ini** (pemeriksaan di atas) dan
  **Riwayat perolehan**, jumlah percobaan pada kunjungan ini menurut hasil
  dan sumbernya. Keduanya terpisah: percobaan yang berhasil disimpan tidak
  berarti byte-nya masih ada di sini. Jika sudah tidak ada, sebuah petunjuk
  menunjuk ke tiga cara untuk mendatangkannya; tidak ada yang dicoba ulang
  dengan sendirinya. **Tampilkan Riwayat Perolehan** mencantumkan setiap
  percobaan (seperti `20:16 — Rekan → Hash tidak cocok`); klik salah satunya
  untuk hasil, publikasi, dan hash kontennya.
- **Keadaan Snapshot**, di bawahnya, menjajarkan fakta-fakta yang telah Anda
  kumpulkan pada kunjungan ini: **Konten**, **Kepemilikan lokal**,
  **Perolehan**, **Penempatan**, dan **Pengamatan rekan**. Setiap bagian
  hanya muncul setelah Anda mengamatinya, dan semuanya tidak pernah
  digabungkan menjadi satu putusan.

## Desentralisasi sekilas

*Eksperimental.* Di tab **Desentralisasi & Bukti**, begitu sebuah publikasi
memiliki jangkar atau penempatan, **Desentralisasi** membandingkan
[Bukti Eksternal](11-EvidenceAndStorage.md#bukti-eksternal) dan
[Penempatan Snapshot](11-EvidenceAndStorage.md#penempatan-snapshot):

- **Publikasi: diketahui secara lokal / tidak diketahui secara lokal** —
  apakah perangkat ini telah mengatalogkan publikasi bertanda tangan itu.
- Dua kartu berisi berapa banyak klaim dari setiap jenis yang diketahui,
  dan apakah klaim-klaim itu sepakat tentang hash konten (**Sesuai**) atau
  tidak (**Bertentangan**). Jika yang satu sesuai dan yang lain
  bertentangan, sebuah kalimat menyebutkannya; kesesuaian di satu jenis
  tidak menjamin jenis lainnya. Jika belum ada klaim dari suatu jenis,
  tertulis **Belum ada yang dapat dibandingkan** sebagai gantinya.
- **Sinkronkan dengan Rekan** (lalu **Sinkronkan Lagi**) meminta kepada
  setiap rekan yang terhubung jangkar dan penempatan yang belum Anda
  miliki, dan melaporkan **Klaim baru** dan **Sudah diketahui** untuk
  setiap jenis.
- **Tampilkan Pengetahuan Replika** mencantumkan, untuk setiap jangkar dan
  penempatan, bagaimana perangkat ini mengetahuinya (**Perolehan**:
  *Diketahui secara lokal*, *Diketahui melalui impor paket*, atau
  *Diketahui melalui pertukaran dengan rekan*), **Pertama terlihat**, dan
  status **Verifikasi** / **Resolusi** saat ini. Tidak menghubungi jaringan
  apa pun.

## Apa yang tetap ada setelah dimuat ulang

Klaim bertanda tangan dan fakta yang tercatat disimpan; pemeriksaan,
percobaan, dan layar yang sedang berlangsung tidak.

| Disimpan di perangkat ini | Diatur ulang saat dimuat ulang |
|---|---|
| Bukti dan penempatan yang dikatalogkan, dan **Pengetahuan Lokal** masing-masing | Hasil **Verifikasi Bukti** dan **Selesaikan Snapshot** |
| Byte snapshot yang Anda impor, ambil, atau materialisasikan | Semua hal lain di **Snapshot Lokal**: pemeriksaan, riwayat percobaan, baris **Sumber:**, pemeriksaan dan perbandingan rekan |
| Jumlah **Desentralisasi** (dihitung pada setiap pemuatan) | Hasil **Sinkronkan dengan Rekan** |
| — | **Penerbitan IPFS**: konfigurasi penyedia, hasil, riwayat di layar, dan riwayat verifikasi |
| Catatan **Publikasi Jangkar Bitcoin/Base**, dibuat saat finalisasi | Koneksi alur dompet, pengamatan dana atau akun, rencana, tinjauan, tanda tangan, transaksi yang difinalisasi, hasil penyiaran, dan riwayat konfirmasi atau inklusi di layar |
| **Arsip Pengamatan Publikasi** (setiap penerbitan dan verifikasi IPFS, penyiaran, konfirmasi, dan bukti konten Bitcoin, serta inklusi Base), sampai **Kosongkan Arsip** | — |
| Referensi Publikasi dan Asosiasi Penerbit | Kartu dan baris mana yang sedang Anda buka |
| Keputusan dan pengamatan rekonsiliasi (disimpan di arsip) | Arsip rekan yang ditempel, ekspor bukti yang diimpor, saringan, Perbandingan Ekspor Bukti, dan Klaim Snapshot Penerbit |

Setelah dimuat ulang, hasil sebuah alur atau penerbitan IPFS tetap terlihat
di [Arsip Pengamatan](12-ArchiveAndLeaderboards.md#arsip-pengamatan-publikasi),
siklus hidup sebuah catatan, atau (untuk Bitcoin) Bukti Jangkar Bitcoin
Historis. Hubungkan kembali dompet, atau konfigurasikan ulang penyedia
pinning, untuk melanjutkan.

## Apa selanjutnya?

Berbagi bangunan Anda tetap dilakukan di
[Penerbitan & Fork](04-PublishingAndForking.md). Untuk melangkah lebih jauh
di sini, lanjutkan ke [Bukti & Penyimpanan](11-EvidenceAndStorage.md).
