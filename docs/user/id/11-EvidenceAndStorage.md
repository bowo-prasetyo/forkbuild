<!-- translation-of: docs/user/11-EvidenceAndStorage.md source-hash: fe92a9427ac32e6f -->
# 11 — Bukti & Penyimpanan

<!-- languages -->
[English](../11-EvidenceAndStorage.md) · [Deutsch](../de/11-EvidenceAndStorage.md) · [Español](../es/11-EvidenceAndStorage.md) · **Bahasa Indonesia** · [日本語](../ja/11-EvidenceAndStorage.md)
<!-- /languages -->

> **Sebagian besar eksperimental.** Menyimpan konten di IPFS atau Arweave
> dari blok **Distribusi → Konten** pada sebuah kartu
> ([Membuat penempatan](#membuat-penempatan) dan
> [Menggunakan penyedia pilihan](#menggunakan-penyedia-pilihan)) adalah
> fitur biasa. Semua hal lain di sini **Eksperimental**: bukti eksternal
> dan kedua alur dompet, daftar Penempatan Snapshot, pinning IPFS jarak
> jauh, dan Steem. Semuanya dapat berubah atau dihapus di versi berikutnya,
> dan apa yang dihasilkannya mungkin tidak terbawa. Halaman ini menandai
> bagian-bagian itu dengan lencana **Eksperimental**.

Setiap kartu di halaman **Publikasi** (lihat
[Publikasi & Bukti Eksternal](09-PublicationsAndEvidence.md)) memiliki
bagian untuk membuktikan *kapan* sebuah publikasi ada dan untuk menaruh
kontennya di tempat yang dapat diambil orang lain:

- **[Bukti Eksternal](#bukti-eksternal)** — catatan di Bitcoin, Base,
  Arweave, atau Steem bahwa hash konten sebuah publikasi sudah ada pada
  waktu tertentu.
- **[Alur Jangkar Bitcoin](#alur-jangkar-bitcoin)** dan
  **[Alur Jangkar Base](#alur-jangkar-base)** — alur langkah demi langkah
  yang memakai dompet Anda sendiri untuk menulis transaksi sungguhan.
- **[Penempatan Snapshot](#penempatan-snapshot)** — penunjuk bertanda
  tangan ke tempat konten dapat diambil: IPFS, Arweave, atau perangkat ini.
- **[Penerbitan IPFS](#penerbitan-ipfs)** — mengunggah ke layanan pinning
  jarak jauh.
- **[Steem](#steem)** — memposting, menyimpan, dan membagikan tautan di
  Steem.

Bukti dan penempatan menjawab pertanyaan yang berbeda. Jangkar menunjukkan
bahwa sebuah hash dicatat pada suatu waktu; jangkar tidak mengatakan apa pun
tentang apakah byte-nya masih dapat diambil. Penempatan menyatakan di mana
byte dapat diambil; penempatan tidak mengatakan apa pun tentang kapan
klaim itu pertama kali dibuat.

## Bukti Eksternal

*Eksperimental.*

Jangkar yang tercantum di sini hanya berarti perangkat ini menyimpan
catatan yang ditandatangani dengan sah yang menyatakan "ini dicatat secara
eksternal." Apakah pencatatan itu benar-benar terjadi hanya diperiksa saat
Anda mengeklik **Verifikasi Bukti**. Tidak ada apa pun di halaman ini yang
memverifikasi secara otomatis: tidak saat dimuat, tidak saat bukti tiba,
tidak saat Anda membuka daftarnya.

### Membuat bukti

Di bagian **Distribusi** sebuah kartu publikasi, blok **Bukti /
Penjangkaran** (ditandai **Eksperimental**) memiliki satu kartu untuk setiap
jenis bukti yang dapat dibuat dengan satu klik, masing-masing dengan
tombolnya sendiri: **Buat Jangkar Arweave** dan **Buat Jangkar Steem**.
Jangkar Bitcoin dan Base tidak memiliki kartu seperti itu: keduanya dibuat
melalui langkah-langkah dompetnya di tab **Detail → Desentralisasi &
Bukti** pada kartu, dan blok itu menyebutkannya. Jika Anda sudah menyimpan
penyedia pilihan, kartu-kartu ini terlipat di bawah **Opsi penjangkaran
lain**, di bawah tombol milik penyedia itu (lihat
[Menjangkarkan di penyedia pilihan](#menjangkarkan-di-penyedia-pilihan)).
Masing-masing mencatat hash konten publikasi dalam sebuah transaksi di
jaringan itu, dengan salah satu dari tiga hasil:

| Hasil | Arti |
|---|---|
| **Jangkar dibuat** | Berhasil. Jangkar baru muncul di daftar, belum diverifikasi. |
| **Pencatatan ditolak** | Jaringan berhasil dijangkau dan menolak. |
| **Tidak ada jangkar yang dibuat** | Jaringan tidak dapat dijangkau, atau perangkat ini tidak dapat menandatangani untuknya. |

- Untuk Bitcoin, gunakan [Alur Jangkar Bitcoin](#alur-jangkar-bitcoin);
  untuk Base, [Membuat jangkar Base dalam satu langkah](#membuat-jangkar-base-dalam-satu-langkah).
- **Buat Jangkar Arweave** memerlukan ekstensi dompet Arweave, seperti
  Wander.
- **Buat Jangkar Steem** memerlukan ekstensi Steem Keychain, dan akun Steem
  Anda yang diatur di
  [Pengaturan Jaringan → Steem](10-NetworkSettings.md#steem).

Publikasi yang dibuat sebelum hash konten menjadi SHA-256 tidak pernah
dijangkarkan, baik oleh tombol-tombol ini, langkah Bitcoin atau Base,
maupun **Jangkarkan Beberapa Publikasi**: tidak ada orang lain yang dapat
memeriksa konten terhadap hash lamanya, jadi catatannya tidak membuktikan
apa pun. Anda mendapat **Pencatatan ditolak** (atau, untuk Bitcoin dan
Base, langkah transaksi yang gagal) yang meminta Anda menerbitkannya lagi,
sebelum dompet mana pun ditanya. Hal yang sama berlaku untuk penempatan,
yang berakhir dengan **Tidak ada penempatan yang dibuat**.

Setelah berhasil, tombolnya bertuliskan **Buat Jangkar … Lainnya**, yang
membuat jangkar kedua yang mandiri. Jangkar Base dibuat dengan cara yang
berbeda; lihat
[Membuat jangkar Base dalam satu langkah](#membuat-jangkar-base-dalam-satu-langkah).

**Jangkar Steem lebih lemah daripada jangkar Bitcoin.** Tidak ada biaya,
hanya Resource Credits (yang terisi kembali), dan bloknya final sekitar
satu menit kemudian. Sampai saat itu kartunya bertuliskan **Waiting for
finality** (menunggu final), lalu **Anchored** (sudah dijangkarkan) (atau,
jarang sekali, **Not anchored** (belum dijangkarkan) jika rantainya
membuangnya: buat lagi). **Verifikasi Bukti** melaporkan **Verifikasi tidak
tersedia** selama menit pertama itu, dan setelahnya menyebutkan kapan, dan
oleh saksi (witness) mana, blok itu dicatat. **Periksa Bukti** langsung
menampilkan waktu blok, dari salinan header blok bertanda tangan yang
diperiksa perangkat Anda secara luring. Blok Steem ditandatangani oleh
sekitar 21 saksi yang dipilih berdasarkan stake, tidak diamankan oleh
proof of work, jadi cukup banyak dari mereka bersama-sama dapat menulis
ulang riwayat; kartunya menyatakan "Dibuktikan oleh saksi Steem". Gunakan
jangkar Steem sebagai bukti cepat dan gratis di samping jangkar Bitcoin,
bukan sebagai penggantinya.

**Menjangkarkan beberapa publikasi sekaligus di Steem.** Di bawah **Dompet,
Arsip & Alat Penerbit → Penjangkaran Blockchain**, **Jangkarkan Beberapa
Publikasi di Steem** mencantumkan publikasi yang sudah Anda katalogkan.
Centang yang Anda inginkan (atau **Pilih yang Belum Dijangkarkan**) dan klik
**Jangkarkan N Publikasi di Steem**. Satu persetujuan Keychain
menjangkarkan hingga 64. Setiap publikasi tetap mendapat jangkarnya
sendiri, yang diverifikasi secara terpisah.

### Menjangkarkan di penyedia pilihan

Tautan **Konfigurasi** di blok **Bukti / Penjangkaran** membuka
[Penyedia Bukti / Penjangkaran](10-NetworkSettings.md#penyedia-bukti--penjangkaran),
tempat Anda memilih bawaan. Setelah itu, blok tersebut diawali satu tombol
bernama sesuai pilihan itu, seperti **Jangkarkan di Steem**, yang
menjangkarkan di sana dengan hasil yang sama seperti tombol-tombol di atas.
Tombol itu bertuliskan **Menjangkarkan…** selama bekerja dan menampilkan
transaksi serta hash konten jangkar baru setelah selesai. Setiap jenis lain
tetap dapat dijangkau dengan satu klik di bawah **Opsi penjangkaran lain**.
Menyimpan pilihan tidak mengubah tombol-tombol itu maupun jangkar yang sudah
ada.

Tombol seperti itu tidak ada, dan semua opsi ditampilkan, jika belum ada
yang disimpan, jika penyedia yang disimpan tidak terdaftar di perangkat ini,
atau jika penyedia itu Bitcoin: jangkar Bitcoin dibuat melalui
langkah-langkah dompetnya (lihat
[Alur Jangkar Bitcoin](#alur-jangkar-bitcoin)), dan blok itu
menyebutkannya.

### Temukan dari Rekan

Rekan yang terhubung hanya meneruskan bukti yang dibuat atau diumumkan
ulang selama Anda terhubung. **Temukan dari Rekan** mengisi celah itu:
tombol ini bertanya kepada setiap rekan yang terhubung, satu per satu,
tentang setiap jangkar yang mereka ketahui untuk publikasi ini, termasuk
yang mereka ketahui dari orang lain. Tidak ada hal lain di halaman ini yang
menghubungi rekan.

| Pesan | Arti |
|---|---|
| *N klaim bukti baru ditemukan dari rekan.* | Klaim itu sekarang ada di daftar di bawah. |
| *Tidak ada klaim bukti baru yang ditemukan dari rekan.* | Rekan-rekan ini tidak punya yang baru. Ini tidak berarti tidak ada bukti. |
| *Tidak ada rekan terautentikasi yang tersedia untuk ditanya.* | Hubungkan ke rekan terlebih dahulu (lihat [Koneksi Rekan & Teman](07-PeerConnectionsAndFriends.md)). |
| *Operasi penemuan rekan yang diminta tidak dapat diselesaikan.* | Ada yang gagal secara lokal sebelum rekan mana pun ditanya. |

Jangkar yang ditemukan tiba dalam keadaan belum diverifikasi, hasil
verifikasi Anda sebelumnya tetap disimpan, dan jangkar yang sama tidak
pernah ditambahkan dua kali.

### Daftar bukti

Di tab **Desentralisasi & Bukti** pada kartu, **Bukti Eksternal**
menampilkan berapa banyak jangkar yang diketahui dan menawarkan **Temukan
dari Rekan** (di atas). **Tampilkan Bukti** mencantumkan setiap jangkar
yang diketahui untuk publikasi itu, berdampingan, bahkan yang saling tidak
sepakat. Dengan lebih dari satu jangkar, ringkasan **Pengikatan konten**
muncul terlebih dahulu, menghitung jangkar per hash konten, dan
memperingatkan saat jangkar-jangkar itu mengklaim hash yang berbeda.
Ringkasan itu tidak menyebutkan mana yang benar.

Setiap jangkar menampilkan:

| Kolom | Arti |
|---|---|
| **Lokator** | Tempat yang ditunjukkan sistem eksternal untuk menemukan pencatatannya. |
| **Dicatat** | Waktu pencatatan yang diklaim (masih klaim sampai Anda memverifikasinya). |
| **Publikasi / Hash konten** | Apa yang diikat bersama oleh tanda tangan jangkar ini. |
| **Dibuktikan oleh** | Identitas yang menandatangani jangkar itu. |

- **Verifikasi Bukti** (lalu **Verifikasi Lagi**) memeriksa ke sistem
  eksternal sekarang; lihat [Hasil verifikasi](#hasil-verifikasi).
- **Periksa Bukti** menampilkan klaim mentahnya: waktu persisnya,
  lokatornya, dan untuk Bitcoin tautan penjelajah blok serta bukti
  mentahnya. Ini hanya membaca apa yang ada di perangkat Anda. Di bagian
  bawah, **Pengetahuan Lokal** menyebutkan bagaimana perangkat ini
  mengetahui jangkar itu: **Perolehan** (*Diketahui secara lokal*,
  *Diketahui melalui impor paket*, atau *Diketahui melalui pertukaran
  dengan rekan*) dan **Pertama kali dilihat oleh replika ini**. Bagian ini
  tidak pernah menyebutkan nama rekannya dan bukan tanda kepercayaan.

### Hasil verifikasi

| Label | Arti |
|---|---|
| **Diverifikasi secara independen** | Sistem eksternal memastikan persis apa yang diklaim. |
| **Bukti belum diverifikasi secara independen** | Benar-benar ditandatangani, tetapi perangkat ini tidak dapat memeriksa jenis jangkar ini secara eksternal. |
| **Verifikasi tidak tersedia** | Sistem eksternal tidak dapat dijangkau. Ini tidak sama dengan tidak valid. |
| **Bukti tidak valid** / **Tanda tangan tidak valid** | Catatannya rusak atau tidak benar-benar ditandatangani. |
| **Konten tidak cocok** | Jangkar itu tidak cocok dengan publikasi ini. |
| **Bukti eksternal tidak valid** | Sistem eksternal menyatakan klaim itu salah. |

Jika sebuah jangkar sudah diverifikasi sebelumnya pada kunjungan ini dan
pemeriksaan berikutnya tidak dapat menjangkau jaringan, jangkar itu tetap
membawa catatan: "Bukti ini sebelumnya diverifikasi secara independen;
verifikasi saat ini tidak tersedia."

Jangkar Base, baik yang dibuat di sini maupun yang diterima, diverifikasi
dengan tombol **Verifikasi Bukti** yang sama.

### Rekonsiliasi jangkar Bitcoin

Kartu jangkar Bitcoin juga memiliki bagian **Jangkar Bitcoin**.
**Rekonsiliasi** (lalu **Rekonsiliasi Lagi**) mengajukan dua pertanyaan
terpisah dan menampilkan kedua jawabannya:

| Konfirmasi | Arti |
|---|---|
| **Transaksi terkonfirmasi** | Sudah ditambang; menampilkan tinggi blok, hash blok, dan jumlah konfirmasi. |
| **Transaksi belum terkonfirmasi** | Tidak ditemukan, atau belum ditambang (keduanya tidak dibedakan). |
| **Status konfirmasi tidak tersedia** | Tidak dapat diperiksa. |

| Bukti konten | Arti |
|---|---|
| **Hash cocok dengan OP_RETURN** | Transaksi membawa hash konten yang diklaim. |
| **Hash tidak cocok dengan OP_RETURN** | Tidak membawanya, atau buktinya rusak. |
| **Bukti konten tidak tersedia** | Tidak dapat diperiksa. |

Transaksi terkonfirmasi yang OP_RETURN-nya tidak cocok ditampilkan apa
adanya. Konfirmasi setiap rekonsiliasi ditambahkan ke **Tampilkan Riwayat
Konfirmasi**, dari yang terlama; bukti konten hanya menampilkan hasil
terbaru.

## Alur Jangkar Bitcoin

Alur langkah demi langkah yang memakai dompet Bitcoin Anda sendiri untuk
menulis hash konten sebuah publikasi ke dalam transaksi sungguhan. Setiap
langkah adalah kliknya sendiri.

> **Ini membelanjakan bitcoin sungguhan di Bitcoin mainnet.** Sejak **Buat
> Rencana Transaksi**, alur ini bekerja dengan dana sungguhan di dompet
> Anda, dan **Siarkan Transaksi** mengirim transaksi sungguhan. Tidak ada
> mode uji coba.

Semua panel untuk seluruh halaman berada di bawah **Dompet, Arsip & Alat
Penerbit → Penjangkaran Blockchain**, panel terlipat di bagian bawah
halaman Publikasi; langkah per publikasi ada di kartu setiap publikasi.
Jika sebuah langkah memerlukan dompet atau dana diamati terlebih dahulu,
tautannya membuka panel itu untuk Anda.

### Apa yang Anda perlukan

- Ekstensi browser **UniSat** (`window.unisat`); dompet Bitcoin lain belum
  didukung.
- Akun yang menyimpan bitcoin yang dapat dibelanjakan di alamat **native
  SegWit** (diawali `bc1q…`). Dana di alamat Taproot (`bc1p…`) atau lama
  (`1…`, `3…`) dapat diamati tetapi tidak dapat ditandatangani; tahap
  tinjauan melaporkannya sebagai tidak dapat ditinjau.
- Sebuah publikasi di halaman Publikasi Anda; transaksi itu menjangkarkan
  hash kontennya.

### Menghubungkan dompet

Klik **Hubungkan Dompet Bitcoin** di kartu **Dompet Bitcoin** dan setujui
koneksinya di ekstensi. ForkBuild tidak pernah melihat kunci, frasa benih,
atau kata sandi Anda; ForkBuild mendapat alamat, jaringan, dan kemampuan
menandatangani selama terhubung.

| Status | Arti |
|---|---|
| **Terhubung** | Menampilkan **Akun** dan **Jaringan**. |
| **Terputus** | Belum terhubung, atau Anda menolak. |
| **Dompet tidak tersedia** | Tidak ada ekstensi, ekstensinya terkunci, atau tidak dapat dijangkau. |

Koneksi itu dipakai di seluruh halaman. **Putuskan** memutusnya, dan
memuat ulang melupakannya. Dompet di jaringan selain mainnet dilaporkan
sebagai tidak cocok; ForkBuild tidak pernah mengganti jaringan untuk Anda.

### Mengamati dana

Setelah terhubung, kartu **Dana Bitcoin** muncul. **Amati Dana Dompet**
(lalu **Muat Ulang Dana**) membaca apa yang dapat dibelanjakan akun itu
saat ini. Tidak membelanjakan atau mencadangkan apa pun, dan tidak
memperbarui dengan sendirinya.

| Status | Arti |
|---|---|
| **Dana teramati** | Jumlah UTXO (**Tampilkan Input Dana** mencantumkannya), totalnya, jenis skrip, dan alamat kembalian (selalu akun Anda sendiri). |
| **Format alamat tidak didukung** | Jenis alamat yang belum didukung biayanya, seperti `3…` lama. |
| **Dana tidak tersedia** | Sumber dana tidak dapat dijangkau. |

Jika setelah itu Anda terhubung kembali di jaringan lain, sebuah peringatan
menyatakan bahwa pengamatannya sudah usang.

### Menyusun rencana transaksi

Di tab **Desentralisasi & Bukti** pada kartu publikasi, **Transaksi Jangkar
Bitcoin → Buat Rencana Transaksi** aktif begitu Anda sudah mengamati dana.
Rencana disusun berdasarkan pengamatan terbaru, memilih UTXO dari yang
terbesar, dan menghitung biayanya.

| Status | Arti |
|---|---|
| **Rencana transaksi disusun** | Jaringan, hash konten, input, biaya, kembalian, total input, daftar lengkap input dan output, serta kapan dana diamati dan rencana disusun. |
| **Tidak dapat menyusun transaksi** | Biasanya, dana tidak cukup untuk menutup biaya. |

Rencana baru menggantikan apa pun yang sudah ditinjau, ditandatangani, atau
disiarkan sebelumnya.

### Meninjau dan menandatangani

Rencana langsung mengisi panel **Tinjau Transaksi Jangkar Bitcoin**:
jaringan, hash konten, biaya, kembalian, total input, input dan output,
serta apakah jaringan dompet Anda cocok dengan transaksi ini.
**Tandatangani Transaksi yang Ditinjau** (aktif saat dompet yang cocok
terhubung) meminta dompet untuk menandatangani. ForkBuild terlebih dahulu
memeriksa bahwa yang akan ditandatangani masih persis sama dengan yang Anda
tinjau; jika tidak, dompet tidak ditanya.

| Status | Arti |
|---|---|
| **Dompet mengembalikan PSBT bertanda tangan** | Responsnya membawa materi tanda tangan untuk transaksi ini. Belum diverifikasi; itu langkah berikutnya. |
| **Penandatanganan ditolak** | Anda atau dompet menolak. |
| **Dompet tidak tersedia** | Tidak ada dompet yang terhubung, atau tidak dapat dijangkau. |
| **Penandatanganan gagal** | Dompet mengembalikan sesuatu yang tidak dapat dipakai. |

### Memverifikasi dan memfinalisasi

**Verifikasi & Finalisasi Transaksi** memeriksa tanda tangan secara
kriptografis, secara luring.

| Status | Arti |
|---|---|
| **Transaksi difinalisasi** | Tanda tangannya valid. Menampilkan ID transaksi dan, di bawah **Byte transaksi mentah**, transaksi yang difinalisasi. |
| **Tanda tangan tidak terverifikasi** | Kunci salah, tanda tangan salah, atau ditandatangani atas data yang salah. |
| **Finalisasi gagal** | Hasil lain yang tidak dapat dipakai. |

Hanya input native SegWit (P2WPKH) yang dapat difinalisasi. Memfinalisasi
juga mencatat
[Publikasi Jangkar Bitcoin](#publikasi-jangkar-bitcoin).

### Menyiarkan

**Siarkan Transaksi** mengirim byte yang sudah difinalisasi, tanpa diubah,
ke jaringan Bitcoin.

| Status | Arti |
|---|---|
| **Transaksi disiarkan** | Diterima oleh jaringan, tetapi belum ditambang. |
| **Transaksi ditolak** | Ditolak. |
| **Penyiaran tidak tersedia** | Jaringan tidak dapat dijangkau. |

**Siarkan Lagi** mengirim ulang byte yang sama. Tidak ada yang dicoba ulang
dengan sendirinya.

### Mengamati konfirmasi

Setelah penyiaran, **Amati Konfirmasi** memeriksa apakah transaksi itu sudah
ditambang, dengan tiga hasil yang sama seperti
[Rekonsiliasi jangkar Bitcoin](#rekonsiliasi-jangkar-bitcoin). Setiap
pemeriksaan ditambahkan ke **Tampilkan Riwayat Konfirmasi** milik
penyiaran ini. Daftar itu dihapus saat dimuat ulang, tetapi setiap hasil
juga disimpan di
[Arsip Pengamatan Publikasi](12-ArchiveAndLeaderboards.md#arsip-pengamatan-publikasi).

### Apa yang tidak dilakukan alur ini

Bahkan transaksi yang terkonfirmasi tidak membuat entri **Bukti
Eksternal**, jadi orang lain tidak dapat menemukannya sebagai bukti. Layar
tinjauan, penandatanganan, dan penyiaran dihapus oleh rencana baru, tanda
tangan baru, atau pemuatan ulang. Yang disimpan adalah catatan publikasi
yang dibuat saat finalisasi, serta setiap hasil penyiaran dan konfirmasi di
Arsip Pengamatan.

### Publikasi Jangkar Bitcoin

Kartu **Publikasi Jangkar Bitcoin** mencantumkan catatan untuk setiap
transaksi yang telah difinalisasi perangkat ini: `{ anchor ID, content
hash, txid, network, created at }`. Catatan itu dibuat saat **Verifikasi &
Finalisasi Transaksi** berhasil, entah penyiarannya nanti berhasil atau
tidak, dan tidak memiliki status terkonfirmasi atau valid sendiri.
**Tampilkan Publikasi** mencantumkannya. Setiap baris memiliki:

- **Periksa Pengamatan** — jumlah setiap fakta penyiaran, konfirmasi,
  bukti konten, penempatan di rantai, dan konsistensi yang disimpan arsip
  untuk ID jangkar itu.
- **Tampilkan Siklus Hidup Publikasi** — fakta yang sama dalam urutan
  waktu, dimulai dengan **Catatan publikasi dibuat**. Langkah yang tidak
  memiliki catatan cukup tidak ditampilkan. Membukanya tidak menghubungi
  jaringan apa pun.

## Alur Jangkar Base

Gagasan yang sama di **Base**, jaringan yang kompatibel dengan Ethereum.
Alur ini terpisah dari Bitcoin: dompetnya sendiri, transaksinya sendiri
(transfer ke diri sendiri yang membawa hash konten sebagai data), dan
istilahnya sendiri.

> **Ini membelanjakan dana sungguhan di Base mainnet, atau dana uji coba di
> Base Sepolia — jaringan mana pun tempat dompet Anda berada.** ForkBuild
> tidak pernah memilih jaringannya untuk Anda.

### Apa yang Anda perlukan

- Dompet browser yang memakai antarmuka standar
  [EIP-1193](https://eips.ethereum.org/EIPS/eip-1193) `window.ethereum`,
  seperti Coinbase Wallet atau MetaMask.
- Akun di chain ID **8453** (Base mainnet) atau **84532** (Base Sepolia).
  Rantai lain dilaporkan sebagai tidak cocok.
- Sebuah publikasi di halaman Publikasi Anda.

### Menghubungkan dompet dan mengamati akun

Di kartu **Jaringan Base** (di bawah **Dompet, Arsip & Alat Penerbit →
Penjangkaran Blockchain**), klik **Hubungkan Dompet Base** dan setujui.
Statusnya **Terhubung**, **Terputus**, dan **Dompet tidak tersedia**,
seperti untuk Bitcoin; **Putuskan** memutusnya dan memuat ulang
melupakannya.

Lalu **Amati Akun Base** (kemudian **Muat Ulang Pengamatan**) membaca rantai
dan saldo akun itu:

| Lencana | Arti |
|---|---|
| **Akun Base teramati** | **Jaringan**, **Chain ID**, **Akun**, **Saldo asli** (dalam wei), dan kapan diamati. |
| **Jaringan yang terhubung bukan Base** | Menampilkan chain ID yang benar-benar ditemukan. |
| **Akun Base tidak tersedia** | Dompet tidak dapat dijangkau. |

### Menyusun rencana transaksi

Di tab **Desentralisasi & Bukti** pada kartu publikasi, **Transaksi
Publikasi Base → Buat Rencana Transaksi Base** (aktif begitu Anda sudah
mengamati akun) menyusun transfer tanpa tanda tangan dari akun Anda ke
akun itu sendiri, yang membawa hash konten sebagai datanya.

| Status | Arti |
|---|---|
| **Rencana transaksi disusun** | Jaringan, chain ID, hash konten, dari/ke (alamat yang sama), nilai, nonce, batas gas, biaya maksimum dan biaya prioritas (dalam wei), datanya, serta kapan akun diamati dan rencana disusun. |
| **Jaringan Base tidak tersedia** | Akun, biaya, atau nonce tidak dapat dibaca. |
| **Tidak dapat menyusun transaksi** | Kegagalan lain. |

Rencana baru menggantikan apa pun yang sudah ditinjau, ditandatangani, atau
disiarkan sebelumnya.

### Meninjau dan menandatangani

Rencana langsung mengisi **Tinjauan Transaksi Base** pada kartu: dari, ke,
nilai, nonce, angka gas, hash konten, dan data transaksi. **Tandatangani
Transaksi yang Ditinjau** meminta dompet menandatangani persis rencana itu.

| Status | Arti |
|---|---|
| **Dompet mengembalikan transaksi bertanda tangan** | Ditandatangani, tetapi belum diverifikasi. |
| **Penandatanganan ditolak** | Anda atau dompet menolak. |
| **Dompet tidak tersedia** | Tidak ada dompet yang terhubung, atau tidak dapat dijangkau. |
| **Penandatanganan gagal** | Dompet mengembalikan sesuatu yang tidak dapat dipakai. |

### Membuat jangkar Base dalam satu langkah

Di kartu tinjauan yang sama, **Buat Jangkar Base** menandatangani,
memfinalisasi, dan menyiarkan transaksi yang ditinjau dalam satu klik, lalu
menambahkannya ke daftar bukti publikasi. Ini alternatif untuk tombol
langkah demi langkah, yang tetap berfungsi.

| Lencana | Arti |
|---|---|
| **Jangkar dibuat** | Disiarkan; jangkar baru muncul, terbuka, di [daftar bukti](#daftar-bukti). |
| **Pencatatan ditolak** | Penandatanganan, finalisasi, atau penyiaran ditolak. |
| **Tidak ada jangkar yang dibuat** | Dompet atau jaringan tidak dapat dijangkau. |

Setelah itu tombolnya bertuliskan **Buat Jangkar Base Lainnya**. Tombol ini
memakai dompet Anda dan mengirim transaksi sungguhan.

### Memverifikasi, memfinalisasi, dan menyiarkan

**Verifikasi & Finalisasi Transaksi** memeriksa tanda tangan secara luring
terhadap rencana yang ditinjau dan memulihkan penandatangannya.

| Status | Arti |
|---|---|
| **Transaksi difinalisasi** | Valid; menampilkan penandatangan yang dipulihkan dan hash transaksi. |
| **Tanda tangan tidak terverifikasi** | Kunci salah, tanda tangan salah, atau data salah. |
| **Finalisasi tidak tersedia** / **Finalisasi gagal** | Tidak dapat diperiksa, atau hasil lain yang tidak dapat dipakai. |

Memfinalisasi mencatat
[Publikasi Jangkar Base](#publikasi-jangkar-base). Lalu **Siarkan
Transaksi** mengirimnya: **Transaksi disiarkan** (dengan **ID Transaksi**;
belum dicantumkan dalam blok), **Transaksi ditolak**, atau **Penyiaran
tidak tersedia**. **Siarkan Lagi** mengirim ulang byte yang sama.

### Mengamati pencantuman

Setelah penyiaran, **Amati Transaksi** di bagian **Pencantuman Transaksi
Base** memeriksa apakah transaksi itu sudah ada di dalam blok:

| Lencana | Arti |
|---|---|
| **Transaksi dicantumkan** | Base melaporkan tanda terima: hash blok, nomor blok, indeks transaksi, jumlah konfirmasi. Reorganisasi rantai masih mungkin terjadi dan tidak terdeteksi. |
| **Transaksi tidak dicantumkan** | Belum ada tanda terima (tertunda dan tidak pernah terkirim tidak dibedakan). |
| **Status pencantuman tidak tersedia** | Tidak dapat diperiksa. |

**Amati Transaksi Lagi** menambahkan ke **Tampilkan Riwayat Pengamatan**.
Daftar itu dihapus saat dimuat ulang, tetapi setiap pengamatan juga
disimpan di
[Arsip Pengamatan Publikasi](12-ArchiveAndLeaderboards.md#arsip-pengamatan-publikasi).

### Publikasi Jangkar Base

Seperti milik Bitcoin, kartu **Publikasi Jangkar Base** menyimpan catatan
per transaksi yang difinalisasi: `{ content hash, txid, network, created
at }`. **Tampilkan Publikasi** mencantumkannya, dan **Tampilkan Siklus
Hidup Publikasi** menampilkan **Catatan publikasi dibuat** diikuti setiap
**Pengamatan pencantuman #N**. Hasil penyiaran Base tidak disimpan, jadi
tidak ada entri penyiaran.

Hanya **Buat Jangkar Base** yang menambahkan entri Bukti Eksternal; alur
langkah demi langkah tidak pernah melakukannya.

## Penempatan Snapshot

Membuat penempatan di IPFS, Arweave, atau Lokal adalah fitur biasa; daftar
di tab **Penempatan & IPFS** dan semua yang ada setelah
[Menggunakan penyedia pilihan](#menggunakan-penyedia-pilihan) bersifat
*Eksperimental*.

**Penempatan snapshot** adalah klaim bertanda tangan bahwa sebuah backend
penyimpanan — **IPFS**, **Arweave**, atau penyimpanan **Lokal** milik
perangkat ini sendiri — dapat menyajikan byte untuk hash konten sebuah
publikasi. Itu bukan jaminan byte-nya masih ada besok. Beberapa penempatan,
di backend yang berbeda dan dari orang yang berbeda, dapat ada
berdampingan; tidak ada yang diutamakan.

### Membuat penempatan

Di bagian **Distribusi** sebuah kartu publikasi, blok **Konten** memiliki
kartu untuk setiap backend, dengan **Buat Penempatan Lokal**, **Buat
Penempatan IPFS**, atau **Buat Penempatan Arweave**. Jika Anda sudah
menyimpan penyimpanan pilihan, blok itu diawali satu tombol untuknya,
seperti **Simpan di IPFS**, dan melipat kartu-kartu ini di bawah **Opsi
penyimpanan lain**. Masing-masing mengambil byte yang disimpan perangkat
ini untuk publikasi itu dan menyerahkannya ke backend tersebut:

- **Penempatan dibuat** — diterima; penempatan bertanda tangan yang baru
  muncul di bawah.
- **Tidak ada penempatan yang dibuat** — backend tidak dapat dijangkau, atau
  perangkat ini tidak menyimpan kontennya.

Setelah itu tombolnya bertuliskan **Buat Penempatan … Lainnya**. Berhasil
membuat penempatan hanya berarti sebuah backend menerima byte-nya barusan.

- **IPFS** memerlukan API node IPFS milik Anda sendiri, secara bawaan di
  `http://127.0.0.1:5001` (ubah di
  [Penyedia Konten](10-NetworkSettings.md#penyedia-konten)). Tanpa node
  yang berjalan, Anda akan mendapat **Tidak ada penempatan yang dibuat**.
- **Arweave** memerlukan ekstensi dompet, seperti Wander.

Anda tidak memerlukan node untuk *membaca* penempatan IPFS: **Selesaikan
Snapshot** dan **Materialisasi Snapshot** memakai gateway publik (lihat
[Gateway IPFS](10-NetworkSettings.md#gateway-ipfs)), sehingga Anda dapat
mengambil konten yang ditempatkan orang lain.

### Menggunakan penyedia pilihan

**Simpan di …** di bagian atas blok **Konten**, dan **Gunakan Penyedia
Pilihan** di tab **Detail → Penempatan & IPFS** pada kartu, membuat
penempatan di backend yang disimpan di
[Penyedia Konten](10-NetworkSettings.md#penyedia-konten). Menyimpan pilihan
tidak mengubah tombol eksplisit maupun penempatan yang sudah ada. Jika
belum ada yang disimpan, atau yang disimpan adalah IPFS (Pinning Jarak
Jauh), blok **Konten** menampilkan setiap backend alih-alih **Simpan di …**.

| Label | Arti |
|---|---|
| **Penempatan dibuat** | Sama dengan mengeklik tombol backend itu. |
| **Tidak ada penempatan yang dibuat** | Belum ada pilihan yang disimpan. |
| **Penyedia pilihan tidak ditemukan** | Backend yang disimpan tidak terdaftar di perangkat ini, atau itu IPFS (Pinning Jarak Jauh), yang memerlukan endpoint diketik setiap kali. |

### Daftar Penempatan Snapshot

Di tab **Penempatan & IPFS** pada kartu, **Tampilkan Penempatan**
mencantumkan setiap penempatan yang diketahui untuk publikasi itu: yang
Anda buat, yang dikirim rekan, dan yang ada di dalam paket Cetak Biru yang
diimpor.

| Kolom | Arti |
|---|---|
| **Lokator** | Tempat yang ditunjukkan backend untuk menemukan byte-nya. |
| **Ditempatkan** | Waktu penempatan yang diklaim. |
| **Publikasi** / **Hash konten** | Apa yang diikat bersama oleh tanda tangan penempatan. |
| **Ditempatkan oleh** | Identitas yang menandatanganinya. |

Masing-masing memiliki hingga tiga tombol:

- **Periksa Penempatan** — kolom-kolom milik penempatan itu sendiri, dan
  untuk IPFS tautan gateway. Tidak menghubungi jaringan apa pun. Di
  bawahnya, **Pengetahuan Lokal** menunjukkan bagaimana perangkat ini
  mengetahuinya (*Diketahui secara lokal*, *melalui impor paket*, atau
  *melalui pertukaran dengan rekan*) dan kapan **Pertama kali dilihat oleh
  replika ini**.
- **Selesaikan Snapshot** (lalu **Selesaikan Lagi**) — memeriksa ke
  backend apakah byte-nya dapat diambil sekarang, tanpa menyimpannya.
- **Materialisasi Snapshot** (lalu **Materialisasi Lagi**) — menyelesaikan
  dan, jika berhasil, menyimpan byte-nya di perangkat ini (lihat
  [Snapshot Lokal](09-PublicationsAndEvidence.md#snapshot-lokal)). Anda yang
  memilih penempatannya; tombol ini tidak pernah mencoba penempatan lain
  untuk Anda.

| Hasil materialisasi | Arti |
|---|---|
| **Dimaterialisasi** | Diambil, dicocokkan, dan disimpan di sini. |
| **Sudah tersedia** | Perangkat ini sudah memiliki byte yang cocok. |
| **Saat ini tidak tersedia** | Backend tidak dapat dijangkau atau tidak memilikinya. |
| **Ditolak** | Byte-nya tidak cocok dengan hash penempatan. |
| **Penempatan tidak valid** | Catatannya rusak atau tidak benar-benar ditandatangani. |

### Hasil penyelesaian

| Lencana | Arti |
|---|---|
| **Konten tersedia** | Backend menyajikan byte yang cocok dengan hash konten. |
| **Tidak ada backend penyimpanan yang dikonfigurasi** | Perangkat ini tidak memiliki backend untuk jenis penyimpanan ini. |
| **Konten tidak tersedia** | Berhasil dijangkau, tetapi saat ini tidak memiliki byte-nya. |
| **Konten yang diambil tidak cocok dengan penempatan ini** | Backend menyajikan byte yang salah. |
| **Penempatan tidak valid** / **Tanda tangan tidak valid** | Catatannya rusak atau tidak benar-benar ditandatangani. |

Hasil tetap ada di halaman ini selama kunjungan ini dan tidak dibagikan.
Dua orang bisa mendapat hasil yang berbeda untuk penempatan yang sama
(misalnya, hanya satu yang menjalankan node IPFS). Jika sebuah penempatan
berhasil diselesaikan sebelumnya pada kunjungan ini lalu kemudian tidak
dapat dijangkau, akan ada catatan: "Snapshot ini sebelumnya berhasil
diselesaikan; saat ini tidak tersedia." Ketidakcocokan tidak pernah
diperlunak dengan cara ini.

### Hubungan penempatan

Dengan lebih dari satu penempatan, kartu **Hubungan penempatan**
menampilkan berapa banyak backend dan lokasi berbeda yang ada, menghitung
penempatan per hash konten, dan bertuliskan **Pengikatan konten: Sesuai**
atau **Bertentangan** (dengan peringatan). Ini hanya berdasarkan klaimnya,
bukan pada apakah Anda sudah menyelesaikannya, dan kelompok yang lebih
besar tidak dianggap lebih mungkin benar.

## Penerbitan IPFS

*Eksperimental.* Bagian **Penerbitan IPFS**, di bawah Penempatan Snapshot di
tab **Penempatan & IPFS** pada kartu, mengunggah konten ke layanan pinning
yang Anda pilih. (Seperti yang disebutkan bagian itu: node Kubo lokal dapat
menyelesaikan dan menerbitkan, gateway jarak jauh hanya dapat
menyelesaikan, dan pinning jarak jauh hanya dapat menerbitkan.) Tidak
seperti penempatan, hasilnya bukan klaim bertanda tangan yang dapat
ditemukan orang lain: hasilnya adalah catatan bahwa sebuah penyedia
menerima byte ini. Hasil di layar dihapus saat dimuat ulang, tetapi setiap
penerbitan yang berhasil dan setiap verifikasi juga disimpan di
[Arsip Pengamatan Publikasi](12-ArchiveAndLeaderboards.md#arsip-pengamatan-publikasi).

### Mengonfigurasi penyedia pinning jarak jauh

ForkBuild tidak menyertakan penyedia pinning bawaan. Klik **Konfigurasi
Penerbitan Jarak Jauh** (kemudian **Konfigurasi Ulang Penerbitan Jarak
Jauh**):

| Kolom | Arti |
|---|---|
| **Endpoint** | URL unggahan layanan itu. Wajib. |
| **Kredensial** (opsional) | Dikirim sebagai header bearer `Authorization`. Tidak pernah ditampilkan kembali; kartunya hanya menyebutkan **dikonfigurasi** atau **belum dikonfigurasi**. |
| **Kolom permintaan** (opsional) | Kolom formulir untuk file. Bawaannya `file`. |
| **Kolom respons** (opsional) | Kolom respons yang berisi CID. Bawaannya `cid`. |

**Simpan Konfigurasi** menyimpannya hanya untuk kunjungan ini; tidak pernah
disimpan permanen, dan memuat ulang atau **Hapus Konfigurasi**
membuangnya. Membatalkan membiarkan konfigurasi sebelumnya. Mengonfigurasi
ulang memulai dari awal, tanpa ada yang diterbitkan dengan penyedia baru.

### Menerbitkan

**Terbitkan ke IPFS Jarak Jauh** (lalu **Terbitkan Lagi**) mencocokkan
salinan di perangkat ini dengan hash konten lalu mengunggahnya.

| Lencana | Arti |
|---|---|
| **Diterbitkan** | Diterima; penyedia mengembalikan CID. |
| **Penerbitan ditolak** | Ditolak, misalnya kredensial salah, permintaan rusak, atau kuota. Ubah konfigurasi sebelum mencoba lagi. |
| **Penerbitan tidak tersedia** | Penyedia tidak dapat dijangkau. Coba lagi nanti. |
| **Penerbitan gagal** | Hal lain apa pun, termasuk pemeriksaan integritas lokal yang gagal terlebih dahulu. |

Hasil yang diterbitkan menampilkan hash konten, lokator (`ipfs://<cid>`),
endpoint, dan waktu. Lencana seperti **Nostr: Diumumkan** atau **Steem:
Belum diumumkan**, dinamai sesuai
[Penyedia Pengumuman / Penemuan](10-NetworkSettings.md#penyedia-pengumuman--penemuan)
Anda, menyatakan apakah penerbitan itu juga diumumkan untuk penemuan
Snapshot, sehingga orang lain dapat menemukannya seperti penerbitan dari
node lokal. **Belum diumumkan** berarti hanya pengumumannya yang gagal.

### Memverifikasi apa yang diterbitkan

Setelah penerbitan berhasil, **Pengambilan konten → Verifikasi Konten
IPFS** (lalu **Verifikasi Lagi**) mengambil byte melalui
[gateway IPFS](10-NetworkSettings.md#gateway-ipfs) Anda dan
membandingkannya dengan hash yang tercatat:

| Lencana | Arti |
|---|---|
| **Konten yang diambil cocok dengan hash konten yang tercatat** | Cocok. |
| **Konten yang diambil tidak cocok dengan hash konten yang tercatat** | Tidak cocok. |
| **Pengambilan konten tidak tersedia** | Gateway tidak dapat dijangkau atau tidak memilikinya. Bukan ketidakcocokan. |
| **Verifikasi gagal** | Ada hal lain yang salah. |

### Riwayat Publikasi

Menerbitkan lagi tidak pernah menimpa catatan sebelumnya. **Tampilkan
Riwayat Publikasi** mencantumkan setiap penerbitan, dari yang terlama,
dengan lokator dan waktunya; **Periksa** menampilkan lokator, hash konten,
waktu, dan metodenya (saat ini selalu **Penyedia pinning jarak jauh**).
Setiap entri memiliki tombol **Verifikasi Konten** sendiri dan **Tampilkan
Riwayat Verifikasi**, daftar berurutan waktu berisi setiap pemeriksaan
untuk catatan itu.

## Steem

*Eksperimental.* ForkBuild dapat mengumumkan, menyimpan, dan membagikan
melalui blockchain Steem. Pengumuman (publikasi, Snapshot, dan komentar)
adalah balasan di utas penemuan bulanan seperti
[`@forkbuild/forkbuild-snapshot-2026-09`](https://steemit.com/forkbuild/@forkbuild/forkbuild-snapshot-2026-09).
Membaca tidak memerlukan akun. Apa pun yang ditemukan diverifikasi seperti
pengumuman dari Nostr atau Arweave; suara, imbalan, dan reputasi tidak
memengaruhinya. Pengaturannya ada di
[Pengaturan Jaringan → Steem](10-NetworkSettings.md#steem).

### Memposting ke Steem

Pilih **Steem** di dialog Distribusikan, di halaman Publikasi, atau di
samping **Kirim Komentar**, atau jadikan bawaan Anda di
[Penyedia Pengumuman / Penemuan](10-NetworkSettings.md#penyedia-pengumuman--penemuan).
Anda memerlukan ekstensi Steem Keychain yang menyimpan kunci **posting**
akun Anda, dan nama akun Anda yang tersimpan di halaman pengaturan Steem.
ForkBuild tidak pernah melihat kuncinya. Setiap postingan adalah balasan di
utas bulan ini dengan imbalan ditolak, dan Keychain meminta Anda
menyetujuinya. Jika utas bulan ini belum ada, tidak ada yang diposting dan
Anda diberi tahu. Komentar selalu disimpan di perangkat ini terlebih
dahulu, dan formulirnya memperingatkan Anda jika akun atau Keychain tidak
ada.

### Menyimpan di Steem

Pilih **Steem** sebagai penyimpanan di dialog Distribusikan atau di
halaman Publikasi. Snapshot dikompresi dan disimpan sebagai balasan di utas
konten bulan ini (seperti `@forkbuild/forkbuild-content-2026-10`), tanpa
biaya pinning atau unggahan. Datanya berada di metadata setiap postingan;
teks postingannya berupa catatan satu baris. Postingan lama yang datanya
ada di teks tetap dapat dimuat.

- **Ukuran.** Hingga sekitar 2.500 balok muat dalam satu postingan.
  Bangunan yang lebih besar adalah satu postingan indeks ditambah hingga 20
  postingan berukuran sekitar 48 KB, hingga sekitar 30.000 balok. Yang lebih
  besar dari itu ditolak sebelum diposting, dengan saran untuk memakai IPFS
  atau Arweave.
- **Menyetujui.** Keychain meminta persetujuan untuk setiap postingan,
  dengan jeda minimal 4,5 detik, dan dialog menampilkan kemajuannya
  ("Menyimpan di Steem: 3 dari 9 postingan dibuat").
- **Resource Credits.** Memposting memakai Resource Credits akun Anda, yang
  terisi kembali dalam lima hari. Jika tidak cukup, tidak ada yang
  diposting dan Anda diberi tahu berapa banyak yang dibutuhkan. Kemajuan
  menampilkan porsi yang terpakai.
- **Jika berhenti di tengah jalan** (Anda menolak, kehabisan kredit, atau
  koneksi terputus), Anda diberi tahu berapa postingan yang sudah
  tersimpan. Distribusikan lagi dengan akun yang sama dan hanya postingan
  yang kurang yang dibuat. Tidak ada yang diumumkan sampai setiap postingan
  tersimpan.

Klaim Bertanda Tangan juga dapat disimpan di Steem: satu postingan (dan
persetujuan) lagi di utas yang sama, setelah Snapshot saat Anda
mendistribusikan keduanya. Klaim itu dibaca kembali dan diperiksa tanda
tangannya seperti yang dari Arweave.

### Membagikan tautan

**Di Steem.** Postingan Klaim Bertanda Tangan menampilkan gambar bangunan
Anda, judulnya, nama dan deskripsi Anda, serta tautan "See it in 3D"
(lihat dalam 3D). Keychain meminta Anda menyetujui penandatanganan gambar,
yang diunggah ke host gambar Steemit tanpa biaya Resource Credit; jika Anda
menolak atau gambar tidak dapat dibuat, postingan dikirim tanpanya.
Sebutan, tag, dan tautan di judul atau deskripsi Anda ditampilkan sebagai
teks biasa, sehingga tidak memberi tahu siapa pun. Siapa pun yang mengeklik
tautan itu, bahkan tanpa pernah memakai ForkBuild sebelumnya, akan tiba di
Tampilan Dunia di bangunan Anda, setelah ForkBuild memeriksa tanda tangan
Dunia Bersama dan bahwa bangunannya cocok dengan pengumumannya (jika tidak,
halamannya menyebutkan alasannya). Bangunan itu lalu disimpan di browser
mereka. Tautan ini memerlukan bangunan yang diumumkan sekaligus disimpan,
yang dilakukan oleh Distribusikan.

**Di mana saja.** Begitu Klaim Bertanda Tangan disimpan di Steem, Arweave,
atau IPFS, **Bagikan…** dan **Salin tautan** muncul di bawahnya: di panel
publikasi Tampilan Dunia, di hasil dialog Distribusikan, dan di halaman
Publikasi. **Bagikan…** membuka lembar berbagi perangkat Anda jika
tersedia; **Salin tautan** menyalin tautannya, yang juga ditampilkan untuk
disalin secara manual. Tautan itu dapat dibuka di perangkat mana pun,
asalkan Snapshot-nya juga sudah didistribusikan. Alamat `#/world/…` di
bilah alamat Anda hanya berfungsi di browser Anda sendiri.

- **Arweave:** tepat setelah didistribusikan, tautan dapat memerlukan
  beberapa menit untuk bisa dibuka selama unggahan mencapai gateway.
  Halamannya menawarkan **Coba lagi**.
- **IPFS di node Anda sendiri:** tautan hanya terbuka selama node Anda
  daring dan dapat dijangkau dari gateway publik. Layanan pinning atau
  Arweave membuatnya tetap tersedia saat komputer Anda mati.
- Teman membaca melalui gateway di Pengaturan Jaringan mereka sendiri.
  Gateway IPFS diberi waktu hingga 30 detik untuk menemukan klaimnya.
