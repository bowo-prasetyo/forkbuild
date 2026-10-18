<!-- translation-of: docs/user/WorldViewAdvancedTools.md source-hash: 88c9c021db48f898 -->
# Tampilan Dunia: Alat Lanjutan

<!-- languages -->
[English](../WorldViewAdvancedTools.md) · [Deutsch](../de/WorldViewAdvancedTools.md) · [Español](../es/WorldViewAdvancedTools.md) · [Français](../fr/WorldViewAdvancedTools.md) · **Bahasa Indonesia** · [日本語](../ja/WorldViewAdvancedTools.md) · [한국어](../ko/WorldViewAdvancedTools.md) · [Português (Brasil)](../pt-BR/WorldViewAdvancedTools.md)
<!-- /languages -->

Halaman ini membahas bagian [Tampilan Dunia](03-WorldView.md) yang hanya
muncul saat Anda mencentang **Tampilkan alat lanjutan** di bagian bawah
panel samping. Semuanya untuk jaringan di balik Dunia: di mana sebuah
bangunan ditempatkan, di mana ia disimpan, dan apa yang diumumkan orang
lain di dekat Anda.

Anda tidak memerlukan satu pun untuk berjalan, membangun, me-remix, atau
membagikan tautan. Centang itu diingat di perangkat ini dan tidak mengubah
apa pun bagi orang lain.

**Dengan alat lanjutan, Anda mendapat:**

| Alat | Letaknya | Gunanya |
|---|---|---|
| [Memeriksa](#memeriksa-balok--atau-struktur-yang-ditempatkan) | Klik balok atau struktur yang ditempatkan | Melihat apa itu dan dari mana asalnya |
| [Kamera vs. Mengedit](#kamera-vs-mengedit) | Satu baris di bagian kepala panel | Melihat bangunan mana yang dikenai perubahan Anda berikutnya |
| [Tentang bangunan ini, dan Penempatan](#informasi-bangunan-dan-penempatan) | Di bawah bagian kepala, setelah klik | Detail bangunan dan tempatnya berdiri |
| Koordinat dan pencarian **Lokasi** | Di atas tampilan, dan di **Cari** | Menemukan sesuatu berdasarkan posisi X/Y/Z |
| [Perjumpaan Dunia](#perjumpaan-dunia--publikasi-dan-avatar-yang-dibagikan-rekan-anda) | **Di Sekitar**, di Jelajahi | Apa yang dibagikan orang yang terhubung |
| [Nama Tempat](#nama-tempat-di-sekitar--menemukan-klaim-dari-siapa-pun) | **Di Sekitar**, di Jelajahi | Nama yang diberikan orang lain untuk tempat di sekitar Anda |
| [Bangunan yang Diklaim](#bangunan-yang-diklaim--bangunan-orang-lain-di-tempat-yang-dinyatakan-penerbitnya) | **Di Sekitar**, di Jelajahi | Bangunan yang diumumkan di dekat Anda, sebagai bayangan |
| [Dunia Bersama Saya](#dunia-bersama-saya--mendistribusikan-snapshot-anda-sendiri-tanpa-rekan) | Lebih ke bawah di panel | Penempatan bangunan Anda sendiri, distribusinya, dan komentarnya |

Alat lanjutan juga menambahkan daftar Dunia yang gagal dimuat dan, di
**Pengaturan avatar**, diagnostik avatar.

## Memeriksa balok — atau struktur yang ditempatkan

Klik sebuah balok untuk membuka panel **Pemeriksaan**. (Tanpa alat
lanjutan, klik hanya memilih avatar lain.) Panel ini menampilkan:

- jenis baloknya;
- posisi dan rotasinya;
- Dunia dan bangunan tempatnya berada;
- siapa pembuat Dunia itu.

**Fokus ke Balok** memperbesar ke balok itu. **Fokus ke Dunia** membawa
Anda ke posisi awal Dunia. **Edit Salinan** membuat salinan Dunia milik
Anda sendiri dan membukanya di Editor; aslinya tetap seperti semula.

Mengeklik tanah kosong di dalam Dunia membuka panel yang sama, dengan
posisi dan Dunianya tetapi tanpa detail balok. Panel ini juga punya
**Edit Salinan**, jadi Anda bisa menyalin Dunia dengan mengeklik di mana
saja di dalamnya.

**Struktur yang ditempatkan** adalah seluruh bangunan yang diletakkan ke
sebuah Dunia dari Editor (lihat
[Instans struktur](02-TheEditor.md#instans-struktur-referensi-hidup)).
Klik salah satunya, dan panel menampilkan bangunan yang dirujuknya: judul,
posisi dan rotasi, ketinggian tanah, dan Dunia tempatnya berdiri. Anda
tidak bisa memindahkannya di sini. Ada dua tombol:

- **Buka Sumber** membuka bangunan yang dirujuk di Editor. Setiap salinan
  struktur itu, di mana pun ditempatkan, menampilkan apa yang Anda ubah di
  sana.
- **Edit Salinan** malah membuat salinan bangunan itu milik Anda sendiri,
  dan membiarkan aslinya serta setiap salinan yang ditempatkan tidak
  berubah.

Setiap **Edit Salinan** di Tampilan Dunia melakukan hal yang sama; lihat
[Edit Salinan](03-WorldView.md#edit-salinan--membawa-sesuatu-ke-editor).

## Kamera vs. Mengedit

Bagian kepala menampilkan baris seperti ini:

```
Kamera: Alice's Castle · Mengedit: Bob's Castle
```

- **Kamera** adalah apa yang sedang Anda lihat. Terbang ke sebuah Dunia,
  atau mengeklik **Fokus** atau **Pergi**, mengubahnya.
- **Mengedit** adalah bangunan yang dikenai perubahan Anda berikutnya:
  penanda, wilayah, detailnya, atau penerbitan. Mengeklik balok atau
  penempatan, atau **Pilih** pada hasil pencarian, mengubahnya tanpa
  memindahkan kamera.

Biasanya keduanya sama, karena **Fokus** mengubah keduanya. Keduanya
berbeda saat Anda memilih satu bangunan dan melihat bangunan lain, atau
saat dua bangunan berdiri tepat di tempat yang sama: memfokuskan yang
kedua tidak memindahkan kamera, tetapi baris itu menunjukkan Anda kini
mengedit yang lain. Melihat-lihat tidak pernah mengubah apa yang Anda
edit; hanya memilih yang mengubahnya.

**Pergi** dan **Fokus** adalah hal yang sama dengan dua nama: keduanya
memindahkan kamera. Apakah keduanya juga mengubah apa yang Anda edit
bergantung pada panelnya (di
[Cari](03-WorldView.md#cari--publikasi-mana-yang-cocok-dengan-ini), Fokus
mengubahnya).

## Informasi Bangunan dan Penempatan

Klik balok, tanah kosong, atau struktur yang ditempatkan, dan dua panel
terbuka di bawah bagian kepala, untuk bangunan yang Anda klik:

- **Tentang bangunan ini**: judul, deskripsi, tag, lisensi, status,
  pembuat, dan dari mana bangunan itu di-remix. **Edit Metadata** mengubah
  judul, deskripsi, lisensi, dan siapa yang boleh menempatkannya.
- **Penempatan**: tempat bangunan berdiri di Dunia, dalam **Satuan Dunia**.
  Ini koordinat ForkBuild sendiri, bukan GPS; satu Satuan Dunia sama dengan
  satu meter. **Fokus** membawa Anda ke sana. **Pindahkan** membuka
  **Pindahkan Penempatan**, tempat Anda mengetik nilai X, Y, dan Z baru
  atau menggeser bangunan 1, 10, atau 100 satuan. **Pindahkan ke titik
  gridnya** mengisi titik bangunan itu sendiri di grid Dunia, tempat
  bangunan ditempatkan saat diterbitkan; klik **Pindahkan** untuk ke sana.
  **Hapus dari Dunia** mengeluarkan penempatan ini.

Keduanya panel terpisah karena *apa* sebuah bangunan dan *di mana* ia
berdiri adalah hal yang berbeda. Memindahkan penempatan tidak pernah
mengubah bangunannya, dan mengubah bangunan tidak pernah memindahkannya.

### Posisi di dunia

Untuk mengembalikan bangunan ke titiknya sendiri di grid Dunia (bangunan
yang diterbitkan dari 12 sampai 17 Oktober 2026 justru ditempatkan di
sekeliling alun-alun tantangan), buka **Pindahkan Penempatan**, klik
**Pindahkan ke titik gridnya**, lalu **Pindahkan**. Setelah itu kirim lagi
dengan **Distribusikan** di **Dunia Bersama Saya**, agar perangkat lain
juga memindahkannya.

Jika bangunan lain sudah berdiri tepat di tempat tujuan Anda, **Pindahkan
Penempatan** memperingatkan Anda dan mencantumkan apa yang ada di sana
sebelum Anda mengonfirmasi. Berbagi tempat diperbolehkan: adegan halaman
dalam dan gedung di sekelilingnya bisa berada di tempat yang sama.
ForkBuild hanya memastikan Anda tahu.

### Penempatan yang bukan milik Anda

Jika orang lain yang menempatkan sebuah bangunan, panel Penempatan
bertuliskan **🔒 Ditempatkan oleh &lt;nama&gt; — Anda dapat melihat
penempatan ini tetapi tidak dapat memindahkannya**, dan **Pindahkan**
dinonaktifkan. Anda tetap bisa memfokuskannya, memeriksanya, dan memakai
**Edit Salinan** untuk membangun di atasnya. Hanya letaknya yang menjadi
hak mereka.

### Bangunan di Sini

Jika panel Penempatan menyebut ada bangunan lain di tempat ini, klik
**Lihat** untuk membuka **Bangunan di Sini**: daftar setiap bangunan di
tempat itu, masing-masing dengan tombol **Fokus**. Bangunan yang
penerbitannya dibatalkan tidak dicantumkan.

### Mengapa saya bisa menempatkan bangunan orang lain?

Gedung sungguhan tidak bisa diangkat dan dipindahkan, jadi mungkin terasa
aneh bahwa Anda bisa menempatkan bangunan siapa pun yang diterbitkan di
mana saja. Tetapi bangunan yang diterbitkan bukan satu benda fisik. Ia
konten tetap, dikenali dari hash kontennya, seperti sebuah berkas.
**Penempatan** adalah catatan terpisah yang ditandatangani, berbunyi
"tampilkan bangunan ini di sini". Ia merujuk ke bangunan; ia tidak
menyalinnya. Satu bangunan bisa punya banyak penempatan, dan masing-masing
menampilkan konten yang persis sama.

Jadi menempatkan bangunan orang lain tidak pernah memindahkan atau
mengubah milik mereka:

- **Penempatan mereka tetap di tempat mereka meletakkannya.** Hanya mereka
  yang bisa memindahkannya (lihat
  [Penempatan yang bukan milik Anda](#penempatan-yang-bukan-milik-anda)).
- **Penempatan Anda ditandatangani oleh Anda.** Ia hanya menyebut di mana
  *Anda* menampilkan bangunan mereka.
- **Bangunan itu tetap memiliki pembuat dan riwayatnya.** Ia tetap persis
  seperti yang diterbitkan, dan siapa pun bisa memeriksanya dengan hash dan
  tanda tangannya.

Tidak ada peta pusat yang menyatakan siapa pemilik lahan mana. Setiap
Dunia menampilkan penempatan yang diterimanya. Itu sebabnya bangunan yang
diumumkan seseorang di dekat Anda hanya muncul sebagai bayangan sampai
Anda memilih **Terima Posisi** (lihat
[Bangunan yang Diklaim](#bangunan-yang-diklaim--bangunan-orang-lain-di-tempat-yang-dinyatakan-penerbitnya)).
Tidak ada yang bisa memasukkan bangunan ke Dunia Anda tanpa persetujuan
Anda.

Beberapa alasan menempatkan bangunan yang bukan buatan Anda:

- **Mengkurasi**, seperti Dunia galeri berisi bangunan yang Anda sukai.
- **Menyusun adegan**, seperti meletakkan kastel teman di samping desa
  Anda.
- **Memakainya apa adanya.** Tempatkan jika Anda ingin tidak berubah, dan
  gunakan
  [Edit Salinan](03-WorldView.md#edit-salinan--membawa-sesuatu-ke-editor)
  jika Anda ingin mengubahnya.

Penerbit yang tidak menginginkan ini dapat memilih **Hanya saya yang boleh
menempatkannya** saat menerbitkan (lihat
[Memilih siapa yang dapat menempatkannya](04-PublishingAndForking.md#memilih-siapa-yang-dapat-menempatkannya)).
Anda tetap bisa menemukan dan melihat bangunan mereka, dan me-remix-nya
jika lisensinya mengizinkan, tetapi tidak bisa menempatkannya.

### Mengapa dua bangunan bisa berada di tempat yang sama?

Dua gedung sungguhan tidak bisa berdiri di tempat yang sama. Di ForkBuild
bisa, karena penempatan tidak memakai lahan. Ia hanya catatan bertanda
tangan yang berbunyi "tampilkan bangunan ini di sini", dan dua catatan bisa
menyebut tempat yang sama.

ForkBuild sengaja mengizinkannya:

- **Tidak ada yang membagikan lahan.** Tidak ada server pusat yang
  memutuskan siapa yang lebih dulu di suatu tempat, dan ForkBuild tidak
  pernah memilih pemenang di antara dua penempatan bertanda tangan.
  Keduanya tetap sah.
- **Setiap perangkat mengenal penempatan yang berbeda.** Tempat yang
  terisi di perangkat teman Anda mungkin masih kosong di perangkat Anda
  sampai penempatan mereka sampai ke Anda. Aturan ketat "satu bangunan per
  tempat" akan memberi jawaban berbeda di perangkat berbeda, jadi ForkBuild
  tidak berpura-pura punya aturan itu.
- **Kadang Anda memang menginginkannya.** Adegan halaman di dalam gedung,
  atau versi lama yang ditampilkan menggantikan yang baru, memang tempatnya
  di titik yang sama.

Itu tidak berarti siapa pun bisa menjejali bangunan Anda:

- **Anda diperingatkan lebih dulu.** **Pindahkan Penempatan** mencantumkan
  apa yang sudah ada di suatu tempat sebelum Anda mengonfirmasi, dan tidak
  pernah diam-diam memindahkan bangunan Anda ke tempat lain (lihat
  [Posisi di dunia](#posisi-di-dunia)).
- **Tidak ada duplikat tak sengaja.** **Tambahkan Penempatan di Sini**
  menolak jika sudah ada penempatan tepat di tempat Anda.
- **Klaim orang lain hanya bayangan.** Posisi yang diumumkan oleh siapa pun
  selain penerbit bangunan itu hanya ditampilkan sebagai bayangan tembus
  pandang, dan tidak pernah di tempat yang sudah memiliki penempatan nyata
  yang dikenal perangkat ini (lihat
  [Bangunan yang Diklaim](#bangunan-yang-diklaim--bangunan-orang-lain-di-tempat-yang-dinyatakan-penerbitnya)).
- **Hanya pemilik yang bisa memindahkan atau menghapus penempatan** (lihat
  [Penempatan yang bukan milik Anda](#penempatan-yang-bukan-milik-anda)).

ForkBuild hanya memeriksa bangunan di titik yang persis sama. Dua bangunan
yang agak berjauhan tetapi baloknya kebetulan bersentuhan tidak ditandai.
Untuk alasan rancangannya, lihat
[Overlap Is A Fact; Collision Is A Policy Decision](../../principles/placement.md#overlap-is-a-fact-collision-is-a-policy-decision-0225)
(bahasa Inggris) dan aturan sesudahnya.

### Menempatkan vs me-remix

Keduanya memasukkan bangunan orang lain ke Dunia milik Anda, tetapi
berbeda:

| | Menempatkan | Me-remix (atau Edit Salinan) |
|---|---|---|
| Yang dibuat | Penempatan: catatan kecil bertanda tangan tentang di mana bangunan ditampilkan | Bangunan baru, dengan id baru, milik Anda |
| Bangunannya | Dunia Bersama yang sama, seperti saat diterbitkan | Salinan Anda sendiri, dengan catatan yang merujuk ke aslinya |
| Bisakah Anda mengubah baloknya? | Tidak | Ya, di Editor |
| Siapa pembuatnya | Penerbit asli | Anda, dengan aslinya tercatat sebagai induk |
| Dikendalikan oleh | Pengaturan **Siapa yang dapat menempatkannya** milik penerbit | Lisensi |
| Saat menerbitkan | Tidak ada yang baru diterbitkan | Membuat Dunia Bersama baru atas nama Anda |

Menempatkan itu seperti menautkan ke sebuah berkas; me-remix seperti
membuat salinan sendiri untuk diubah. Orang yang memilih **Hanya saya yang
boleh menempatkannya** tetap bisa mengizinkan remix lewat lisensinya, dan
remix itu milik Anda untuk ditempatkan di mana saja.

## Perjumpaan Dunia — publikasi dan avatar yang dibagikan rekan Anda

**Perjumpaan Dunia** adalah kelompok di **Di Sekitar** pada Jelajahi.
Kelompok ini peta kecil tersendiri (bukan Peta Dunia) yang menampilkan apa
yang diberitahukan [rekan yang terhubung](07-PeerConnectionsAndFriends.md)
kepada Anda:

- **publikasi** yang ditempatkan di dekat Anda (lihat
  [Publikasi & Bukti Eksternal](09-PublicationsAndEvidence.md));
- **avatar** orang lain;
- penanda untuk Anda.

Sampai ada rekan terhubung yang membagikan sesuatu, kelompok ini
bertuliskan **Belum ada yang dapat dijumpai di sini.**

Klik sebuah penanda untuk memeriksanya:

- **Publikasi** menampilkan judul, penerbit, apakah bertanda tangan,
  posisi, serta jumlah jangkar dan penempatan Snapshot-nya.
- **Avatar** menampilkan nama, pemilik, dan posisinya.

Jika lebih dari satu rekan menawarkan hal yang sama, **Pilih Sumber**
membiarkan Anda memilih salinan milik siapa yang dilihat. Tidak ada yang di
sini memindahkan kamera Anda atau mengubah apa pun.

### Materi dan Verifikasi

Memilih publikasi menampilkan dua baris lagi:

- **Materi**: bisakah kontennya dimuat? **Available** (tersedia) atau
  **Unavailable** (tidak tersedia).
- **Verifikasi**: apakah kontennya cocok dengan yang diklaim? **Verified**
  (terverifikasi) atau **Unverifiable** (tidak dapat diverifikasi).

Konten yang sudah ada di perangkat ini langsung dimuat dan diperiksa. Yang
hanya ditunjukkan rekan biasanya bertuliskan **Unavailable** /
**Unverifiable** sampai Anda mencarinya dengan
[Temukan Dunia Bersama](#temukan-dunia-bersama--mencari-langsung-di-jaringan-terdesentralisasi).
Jika itu menemukannya di Arweave atau Nostr, hasilnya juga dipakai di
sini. Jika ditemukan lebih dari satu tempat, **Pilih Lokasi** membiarkan
Anda memilih salah satu; tidak ada yang dimuat sampai Anda memilih, dan
pilihannya hanya berlaku untuk publikasi ini.

Baris **Sumber** menyebut dari mana konten berasal: **Local** (lokal,
perangkat ini) atau **Decentralized** (terdesentralisasi, Arweave atau
Nostr). Itu fakta biasa, bukan skor kepercayaan.

Begitu publikasi dari rekan bertuliskan **Available**, ia ditambahkan ke
Jelajahi dan ke halaman pembuatnya seolah-olah Anda menemukannya di sana,
dan tetap ada setelah dimuat ulang. Tidak ada yang menandainya sebagai
ditemukan lewat rekan: perangkat Anda sendiri sudah memeriksa kontennya,
jadi ia sama seperti yang lain.

### Dialog Distribusikan

Begitu perangkat ini punya konten sebuah publikasi, tombol
**Distribusikan** membuka dialog **Distribusikan**. Dialog yang sama
terbuka dari
[Dunia Bersama Saya](#dunia-bersama-saya--mendistribusikan-snapshot-anda-sendiri-tanpa-rekan)
untuk bangunan Anda sendiri. Untuk apa yang dilakukan setiap jaringan,
lihat [Mendistribusikan Karya Anda](Distribution.md).

Di atas ada dua pengaturan yang berlaku untuk seluruh dialog. Keduanya
dimulai dari preferensi yang Anda simpan:

- **Penyimpanan**: ke mana konten pergi. **Arweave**, **IPFS (Kubo
  Lokal)**, **IPFS (Pinning Jarak Jauh)**, atau, eksperimental, **Steem**
  atau **Blurt** (lihat [Steem](11-EvidenceAndStorage.md#steem) dan
  [Blurt](11-EvidenceAndStorage.md#blurt)). Pinning Jarak Jauh meminta
  endpoint dan kredensial setiap kali dan tidak pernah menyimpannya. Hanya
  penyimpanan yang benar-benar bisa dipakai perangkat ini yang
  dicantumkan.
- **Substrat Pengumuman / Penemuan**: di mana ia diumumkan agar orang lain
  menemukannya. **Arweave**, **Blurt**, **Nostr**, atau **Steem**.

Dialog ini bisa mengirim dua hal:

- **Klaim Bertanda Tangan**, yang menyatakan Anda menerbitkan ini, dan
- **Snapshot**, salinan bangunan itu sendiri (lihat
  [Snapshot lokal](09-PublicationsAndEvidence.md#snapshot-lokal)).

Jika keduanya bisa dikirim, tombol utama **Distribusikan** mengirimnya
satu per satu, karena keduanya bisa meminta tanda tangan dari ekstensi
dompet yang sama. Masing-masing punya bagian dengan hasilnya sendiri, dan
kegagalan yang satu tidak pernah menutupi atau menghentikan yang lain.
**Distribusikan Klaim Bertanda Tangan saja** dan **Distribusikan Snapshot
saja** hanya mengirim satu, misalnya untuk mengulang separuh yang gagal.
Jika hanya satu yang bisa dikirim, tombolnya cukup **Distribusikan Klaim
Bertanda Tangan** atau **Distribusikan Snapshot**.

Untuk menandatangani Anda perlu ekstensi browser: dompet Arweave (seperti
Wander) untuk Arweave, dan penanda tangan Nostr (seperti nos2x) untuk
Nostr. Tanpanya, bagian itu bertuliskan "Distribusi tidak dapat
diselesaikan." beserta alasannya.

- Bagian **Klaim Bertanda Tangan** bertuliskan **Absent** (tidak ada) untuk
  **Materi** dan **Penemuan** sampai dikirim. Sesudahnya ia menampilkan id
  publikasi, letak materinya, dan id pengumumannya, dengan satu baris per
  [relay Nostr](10-NetworkSettings.md#relay-nostr).
- Bagian **Snapshot** menampilkan **Hash konten**, **Lokator**, dan id
  **Pengumuman**. "Tanpa pengumuman" berarti salinannya tersimpan tetapi
  tidak diumumkan; itu hasil parsial, bukan kesalahan. Kegagalan sungguhan
  bertuliskan "Distribusi snapshot tidak dapat diselesaikan."

Menutup dialog tidak menghilangkan apa pun: buka lagi, dan hasilnya masih
ada. Hasilnya dilupakan saat Anda memilih publikasi lain atau meninggalkan
halaman.

## Temukan Dunia Bersama — mencari langsung di jaringan terdesentralisasi

Di Perjumpaan Dunia, **Penemuan Dunia Bersama** membuka panel **Temukan
Dunia Bersama**. Panel ini tidak memerlukan rekan maupun penanda. Ketik
**Id Dunia Bersama**, biarkan **tag penemuan** (dimulai dengan tag milik
ForkBuild sendiri, yang hampir selalu benar), lalu klik **Temukan Dunia
Bersama**. ForkBuild bertanya langsung ke Arweave dan Nostr.

Baris **Penemuan** lalu bertuliskan **Unavailable** (tidak tersedia),
**Resolved** (terselesaikan), atau **Ambiguous** (ambigu: lebih dari satu
petunjuk untuk lokasi yang sama). Setelah terselesaikan, ia menampilkan
baris Materi, Sumber, dan Verifikasi yang sama seperti di atas.

Saat ini ia hanya menyelesaikan publikasi Anda sendiri: yang Anda tanda
tangani dan masih ada di perangkat ini. Anggap saja sebagai "apakah
bangunan saya benar-benar ada di luar sana, utuh?", bukan pencarian atas
karya semua orang.

Jika sebuah hasil bertuliskan **Verified**, **Pilih Dunia Bersama**
menandainya sebagai yang sedang Anda kerjakan, dalam catatan di bawahnya.
Hanya itu yang dilakukannya: tidak mengirim atau memeriksa ulang apa pun.
Pilihan itu bertahan sampai Anda memilih yang lain atau meninggalkan
halaman. Menutup panel tetap menyimpan apa yang Anda ketik dan temukan.

## Nama Tempat di Sekitar — menemukan klaim dari siapa pun

**Nama Tempat**, kelompok di **Di Sekitar** pada Jelajahi, menampilkan
nama yang diterbitkan orang untuk Wilayah Dunia di sekitar Anda. Kelompok
ini mencarinya di Nostr, jadi tidak memerlukan rekan yang terhubung. Ia
mulai dalam keadaan terlipat, karena nama-nama ini belum diperiksa.

Setiap baris menampilkan nama, kira-kira letaknya, siapa yang memberi
nama, dan kapan:

- **Navigasi** memindahkan kamera Anda ke wilayah itu, seperti **Pergi**.
  Ia tidak mengganti nama atau menerima apa pun.
- **Pakai** menyimpan nama itu ke perangkat ini, setelah pemeriksaan tanda
  tangan yang sama seperti nama dari rekan yang terhubung (lihat
  [Menerima dari rekan](09-PublicationsAndEvidence.md#menerima-dari-rekan)).
  Tombolnya lalu bertuliskan **✓ Sudah disimpan**.

Jika dua orang menamai tanah yang sama, kedua nama muncul. ForkBuild tidak
pernah memilih pemenang, dan memakai salah satunya tidak berarti nama itu
lebih benar. Jika pencarian gagal, sebuah pemberitahuan menyebutkannya, dan
nama yang sudah Anda lihat tetap ada. Untuk menerbitkan nama sendiri,
lihat [Memberi nama tempat](09-PublicationsAndEvidence.md#memberi-nama-tempat).

## Bangunan yang Diklaim — bangunan orang lain, di tempat yang dinyatakan penerbitnya

Saat Anda berjalan, ForkBuild mengunduh Snapshot yang diumumkan di dekat
Anda (lihat
[Dunia Bersama Saya](#dunia-bersama-saya--mendistribusikan-snapshot-anda-sendiri-tanpa-rekan)).
Sebuah pengumuman bisa menyebut di mana bangunan berdiri, tetapi itu hanya
**klaim**: memercayainya begitu saja akan membiarkan siapa pun meletakkan
bangunan di atas bangunan Anda. Jadi bangunan yang diklaim ditampilkan
sebagai **bayangan**, baloknya tembus pandang di tempat yang diklaim, dan
tidak pernah menjadi penempatan nyata dengan sendirinya.

**Satu pengecualian tidak memerlukan klik.** Saat penerbit
mendistribusikan Snapshot mereka sendiri, pengumumannya membawa
**penempatan bertanda tangan** mereka. Begitu perangkat ini mengenal Dunia
Bersama bangunan itu (ia ada di Jelajahi, atau Anda mengeklik
**Verifikasi**), ForkBuild memeriksa bahwa penempatan itu ditandatangani
dengan kunci Dunia Bersama tersebut. Jika ya, bangunan tampil padat, tepat
di tempat mereka meletakkannya. Itu tetap penempatan mereka, jadi Anda
tidak bisa memindahkan atau menghapusnya, dan jika mereka memindahkannya
lalu mendistribusikan lagi, ia juga berpindah bagi Anda. Posisi yang
ditandatangani orang lain tetap bayangan.

Bayangan hanya digambar jika:

- ia di dekat Anda (sel peta Anda atau sel di sebelahnya, sekitar 1.000
  satuan ke tiap arah), dan hilang lagi saat Anda menjauh;
- kontennya sudah diunduh dan cocok dengan hash kontennya;
- perangkat ini belum punya penempatan bangunan itu (begitu punya,
  bangunan nyatanya yang ditampilkan);
- tidak ada yang dikenal perangkat ini yang sudah berdiri tepat di tempat
  itu.

Anda tidak bisa memilih, memeriksa, mengedit, atau menyalin bayangan.
Bangunan yang sangat besar hanya digambar sebagian (beberapa ribu balok
pertama).

Setiap bayangan punya baris di **Bangunan yang Diklaim**, yang terdekat di
atas: judul, jarak, posisi, dan "diklaim oleh …". Judul dan pembuatnya
berasal dari bangunan itu sendiri dan sama belum diperiksanya dengan
posisinya. Setiap baris punya:

- **Navigasi**: memindahkan kamera ke tempat yang diklaim. Tidak ada yang
  lain berubah.
- **Verifikasi**: muncul selama perangkat ini belum punya Dunia Bersama
  bangunan itu yang bertanda tangan. Ia mencarinya di Nostr dan Arweave,
  lalu memeriksa bahwa tanda tangannya sah, bahwa itu Dunia Bersama
  bangunan ini, dan bahwa ia menyebut persis konten yang ditampilkan
  bayangan. Jika semuanya cocok, ia ditambahkan ke Jelajahi dan barisnya
  bertuliskan "ditandatangani oleh *nama* (kunci did:key:…)". Jika tidak,
  barisnya menyebut alasannya: tidak ada yang diumumkan (penerbit mungkin
  hanya mendistribusikan Snapshot), tidak ada salinan yang bertanda tangan
  sah, atau ia menyebut konten lain. Verifikasi tidak menerima posisinya,
  tetapi jika penempatan bertanda tangan milik penerbit ikut datang,
  bangunan kini tampil padat di tempat ia meletakkannya.
- **Terima Posisi**: satu-satunya cara memercayai klaim. Ia menempatkan
  bangunan di tempat yang diklaim dengan penempatan *milik Anda sendiri*,
  ditandatangani oleh Anda, dan sejak itu ia bangunan biasa di Dunia Anda.
  Tombol ini hanya berfungsi jika perangkat ini punya Dunia Bersama
  penerbit yang bertanda tangan dan sudah diperiksa, dan hanya jika ia
  menyebut persis konten yang ditampilkan bayangan. Anda mendapatkannya
  lewat **Verifikasi**, saat
  [mereka membagikan Dunia itu kepada Anda](04-PublishingAndForking.md#berbagi-dengan-rekan-yang-terhubung),
  atau saat
  [Perjumpaan](#perjumpaan-dunia--publikasi-dan-avatar-yang-dibagikan-rekan-anda)
  dari rekan untuknya bertuliskan **Available**. Tombol ini juga tetap
  nonaktif jika penerbit memilih **Hanya saya yang boleh menempatkannya**
  (lihat
  [Memilih siapa yang dapat menempatkannya](04-PublishingAndForking.md#memilih-siapa-yang-dapat-menempatkannya)).
  Saat nonaktif, barisnya menyebut alasannya.

  **Arti "terverifikasi".** Bangunan itu persis konten Dunia Bersama yang
  ditandatangani dengan kunci yang ditampilkan. Itu tidak membuktikan siapa
  pemegang kunci itu (siapa pun bisa membuat kunci dan menyebut dirinya
  "bob"), dan tidak membuktikan posisinya, yang tetap hanya klaim. Terima
  Posisi juga berfungsi untuk kunci yang tidak Anda kenal; memercayainya
  atau tidak adalah keputusan Anda.
- **Sembunyikan**: menghapus bayangan itu dan barisnya sampai Anda
  meninggalkan Tampilan Dunia. Tidak ada yang dilaporkan atau dihapus.

## Dunia Bersama Saya — mendistribusikan Snapshot Anda sendiri, tanpa rekan

**Dunia Bersama Saya**, lebih ke bawah di panel di bawah Cari dan Avatar,
berkaitan dengan bangunan yang sedang Anda buka. Ia menampilkan judul dan
pembuatnya setelah diterbitkan, dan berfungsi ada atau tidak ada orang
lain di sekitar.

Di depan ada **Distribusikan** dan tautan berbagi. **Distribusikan**
membuka [dialog Distribusikan](#dialog-distribusikan) yang sama dengan di
Perjumpaan Dunia, tetapi untuk bangunan Anda sendiri. Sampai bangunan itu
diterbitkan, tombolnya nonaktif, dengan catatan bahwa belum ada yang bisa
dikirim. Pinning IPFS jarak jauh dan penjangkaran di Bitcoin atau Base
tidak ada di sini: keduanya memerlukan akun atau dompet dulu, jadi ada di
halaman Publikasi (lihat
[Penerbitan IPFS](11-EvidenceAndStorage.md#penerbitan-ipfs) dan
[Alur jangkar Bitcoin](11-EvidenceAndStorage.md#alur-jangkar-bitcoin)).

**Lainnya ▾** berisi tindakan yang lebih jarang:

- **Ekspor Snapshot** dan **Periksa Kecocokan Snapshot**. Hasilnya tetap
  di panel setelah menu ditutup.
- **Alat Diagnostik** (lihat [di bawah](#alat-diagnostik)).
- **Batalkan Penerbitan…** bertanya sekali, lalu mengeluarkan Dunia dari
  katalog. Penempatannya, bangunannya, dan salinan yang sudah Anda kirim
  tetap ada; salinan yang sudah dikirim tidak bisa ditarik kembali, tetapi
  perangkat ini mengingat apa yang Anda batalkan penerbitannya, sehingga
  Jelajahi tidak mencantumkannya lagi. **Batal** mengurungkannya.

Jika Dunia yang Anda buka diterbitkan orang lain (misalnya dibagikan oleh
rekan), panelnya berjudul **Dunia Bersama** dan tidak punya **Batalkan
Penerbitan** maupun **Distribusikan**: hanya penerbit Dunia yang bisa
melakukannya. Semua yang lain tetap ada, termasuk komentar.

**▸ Komentar (N)** membuka komentar bangunan; jumlahnya tetap terbaru
selama terlipat. Anda bisa menulis setelah bangunan diterbitkan. Siapa
yang boleh berkomentar dijelaskan di
[Komentar](09-PublicationsAndEvidence.md#komentar).

### Penempatan

**Penempatan (N)** mencantumkan setiap tempat Dunia Bersama ini berdiri:
posisi, revisi, dan, jika diketahui, pemilik. Sebuah bangunan bisa berdiri
di lebih dari satu tempat, dan setiap penempatan yang dikenal perangkat ini
dicantumkan.

- **Pindahkan…** membuka **Pindahkan Penempatan** untuk penempatan itu,
  dengan peringatan tentang bangunan yang sudah ada di tempat baru.
- **Hapus…** bertanya sekali, lalu mengeluarkan penempatan itu dari Dunia.
  Bangunan dan penempatan lainnya tetap ada. Tanpa penempatan apa pun,
  bangunan itu tidak ditampilkan di mana pun sampai Anda menempatkannya
  lagi.

Keduanya nonaktif pada penempatan yang dibuat orang lain.

**Tambahkan Penempatan di Sini**, di bawah daftar, menempatkan bangunan
yang sama *sekali lagi* di tempat avatar Anda berdiri (atau di bawah
kamera, jika tanpa avatar). Ia tidak memindahkan penempatan yang ada dan
tidak membuat salinan: tetap satu Dunia Bersama (lihat
[Menempatkan vs me-remix](#menempatkan-vs-me-remix)). Ia menyebut di mana
bangunan ditempatkan dan berapa penempatannya sekarang. Jika sudah ada
penempatan tepat di tempat Anda, ia meminta Anda bergeser dulu, jadi dua
kali klik tidak menumpuk dua di satu tempat.

### Alat Diagnostik

ForkBuild menemukan Snapshot sendiri saat Anda berjalan (lihat di bawah).
**Alat Diagnostik**, di bawah **Lainnya**, menjalankan langkah yang sama
secara manual, untuk saat cara otomatis tidak menemukan yang Anda harapkan.
Setiap langkah adalah klik tersendiri, dan tidak ada yang berjalan
sendiri:

1. **Temukan Snapshot** mencantumkan semua yang diumumkan dengan tag
   bersama ForkBuild. Ini berfungsi tanpa rekan dan tanpa bangunan
   terbitan milik sendiri.
2. **Selesaikan Snapshot Terpilih** memeriksa bahwa yang Anda pilih bisa
   diambil.
3. **Atribusikan Snapshot Terpilih** memeriksa apakah ia cocok dengan hash
   konten Dunia Bersama ini. **Materialisasi Snapshot Terpilih** menyimpannya
   di perangkat ini. Anda bisa melakukan salah satu atau keduanya, dalam
   urutan apa pun.
4. **Tempatkan Snapshot yang Dimaterialisasi**, lalu **Daftarkan Snapshot
   yang Ditempatkan**, menambahkannya ke Dunia tempat Anda berada, tanpa
   memuat ulang.

**Gunakan Posisi yang Diklaim**, kapan saja setelah memilih satu, memakai
posisi yang diklaim Snapshot itu sendiri, jika ada.

**Apa yang terjadi otomatis.** Saat Anda berjalan, ForkBuild sesekali
mencari Snapshot, sama seperti **Temukan Snapshot**. Ia melihat apa yang
ada di perangkat ini, apa yang dibagikan rekan yang terhubung hanya karena
terhubung, dan apa yang dilaporkan Nostr. Snapshot yang lolos pemeriksaan
menjalani langkah yang sama dengan sendirinya dan muncul sebagai penanda
[Perjumpaan Dunia](#perjumpaan-dunia--publikasi-dan-avatar-yang-dibagikan-rekan-anda);
tidak ada daftar atau notifikasi terpisah.

Ia hanya mengunduh Snapshot di dekat Anda: yang ditempatkan, atau
diumumkan sebagai ditempatkan, di sel peta Anda atau sel di sebelahnya
(sekitar 1.000 satuan ke tiap arah), ditambah 20 yang terbaru yang tidak
menyebut tempatnya. Yang lebih jauh diunduh saat Anda mendekat. Paling
banyak empat diunduh bersamaan. Snapshot yang sudah ada di perangkat ini
dibaca dari penyimpanannya sendiri, setelah pemeriksaan konten yang sama.

## Apa selanjutnya?

Kembali ke **[Tampilan Dunia](03-WorldView.md)**, atau lanjutkan ke
**[Mendistribusikan Karya Anda](Distribution.md)** untuk semua tujuan
pengiriman sebuah bangunan.
