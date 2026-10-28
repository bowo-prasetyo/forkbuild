<!-- translation-of: docs/user/04-PublishingAndForking.md source-hash: d9d2658aa5a248b1 -->
# 04 — Penerbitan & Remix

<!-- languages -->
[English](../04-PublishingAndForking.md) · [Deutsch](../de/04-PublishingAndForking.md) · [Español](../es/04-PublishingAndForking.md) · [Français](../fr/04-PublishingAndForking.md) · **Bahasa Indonesia** · [日本語](../ja/04-PublishingAndForking.md) · [한국어](../ko/04-PublishingAndForking.md) · [Português (Brasil)](../pt-BR/04-PublishingAndForking.md)
<!-- /languages -->

Inilah inti ForkBuild. **Menerbitkan** membagikan bangunan Anda kepada
dunia. **Remix** memungkinkan siapa pun membuat salinan sendiri dari sebuah
bangunan dan mengembangkannya, dengan seluruh riwayatnya tetap terjaga.
(Dokumen pengembang menyebut remix sebagai *fork*,
seperti dalam ForkBuild.)

## Menerbitkan karya Anda

1. Bangun sesuatu di Editor.
2. Beri judul — Terbitkan menolak karya tanpa judul atau kosong — dan,
   secara opsional, deskripsi dan lisensi: klik **✎** di samping judul
   bangunan di bilah sisi untuk membuka **Properti Bangunan**.
3. Klik **Terbitkan**. Pertama kali, satu lembar menanyakan apa yang masih
   perlu diketahui Terbitkan, dengan jawaban yang sudah dipilih untuk
   masing-masing:
   - **Nama Anda**, di perangkat yang belum punya nama, dengan satu nama
     yang disarankan (misalnya *Pembangun 427*): ketik nama Anda sendiri di
     atasnya jika mau. Menerbitkan menandatangani bangunan dengannya (lihat
     [Nama & Identitas Anda](05-IdentityAndLogin.md)).
   - **Orang lain boleh me-remix-nya**, aktif, untuk bangunan tanpa lisensi
     (lihat [Mengizinkan orang lain me-remix](#mengizinkan-orang-lain-me-remix)).
   - **Semua orang bisa menemukannya**, aktif, saat perangkat ini pertama
     kali menerbitkan (lihat [Siapa yang bisa menemukannya?](#siapa-yang-bisa-menemukannya)).

   Hapus centang salah satunya jika Anda mau, lalu klik **Terbitkan sebagai
   …** (atau **Terbitkan**). **Terus membangun** menutup lembar dan tidak
   menerbitkan apa pun. **Lanjutan** berisi **Terbitkan tanpa nama**, yang
   menerbitkannya tanpa pembuat dan tanpa tautan. Nama yang terkunci, atau
   salah satu dari beberapa nama, ditanyakan setelah lembar itu.
   Menerbitkan juga menyimpan bangunan.

Karya Anda kini muncul di **Jelajahi** di perangkat ini, tempat Anda dapat
mencarinya, membukanya, dan me-remix-nya, dengan nama Anda sebagai
pembuatnya. Orang lain melihatnya setelah Anda membagikan tautannya, atau
langsung jika Anda memilih **Semua orang** di
[Siapa yang bisa menemukannya?](#siapa-yang-bisa-menemukannya). Karya itu
juga diberi tempatnya sendiri di dunia bersama (lihat
[Tempat bangunan berdiri](#tempat-bangunan-berdiri)), sehingga **Jelajahi** selalu
punya tempat untuk dituju — lihat
[Menemukan dunia](03-WorldView.md#menemukan-dunia).

### Masuk ke dalamnya

Di samping tautan, pemberitahuan yang ditampilkan Terbitkan memiliki **Masuk
ke dalamnya** (**Kelilingi** untuk bangunan tanpa pintu). Tombol itu membuka
Tampilan Dunia dengan avatar Anda di tanah di depan pintu bangunan,
menghadapnya; pintu berayun terbuka saat Anda mendekat, dan masuk (**W**,
atau joystick di ponsel) mencentang langkah terakhir
[Bangunan pertama Anda](02-TheEditor.md#bangunan-pertama-anda). Pintu itu
adalah jalan masuk utama: pintu di dinding atau menara yang padat, tanpa
tempat berdiri di baliknya, tidak dihitung, dan bangunan tanpa pintu didatangi
dari depan. Kartu **Bangunan pertama Anda** menawarkan tombol yang sama
setelah bangunan diterbitkan.

> **Catatan:** Menerbitkan menyimpan bangunan Anda di perangkat ini.
> Kartunya di **Jelajahi** menyebutkan di mana perangkat ini mencatat
> distribusinya (misalnya **Disimpan di IPFS · Diumumkan di Nostr**), atau
> **Tidak ada distribusi yang tercatat di perangkat ini.** Cadangkan di
> [Data Anda](13-YourData.md) untuk menyimpan salinan sementara itu.
> Sampai Anda memilih ke mana bangunan Anda dikirim, menerbitkan tidak
> mengirim apa pun ke mana pun dengan sendirinya. [Tautan](#membagikan-tautan) yang
> Anda salin membawa bangunan itu kepada orang yang Anda beri. Setelah Anda
> memilih jaringan (lihat [Ke mana dikirim](#ke-mana-dikirim--mengirim-bangunan-saat-menerbitkan)), setiap Terbitkan juga
> mengirim bangunan ke sana, sehingga orang lain dapat menemukannya tanpa
> terhubung dengan Anda. [**Bagikan dengan Rekan**](#berbagi-dengan-rekan-yang-terhubung) menawarkannya
> kepada orang-orang yang terhubung dengan Anda.

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
- **Perlu tanda tangan.** Terbitkan dengan sebuah nama; bangunan yang
  diterbitkan tanpa nama (**Terbitkan tanpa nama**) tidak mendapat
  tautan.
- **Tautan pendek begitu dikirim ke semua orang.** Jika bangunan dikirim ke
  **Semua orang** (lihat
  [Siapa yang bisa menemukannya?](#siapa-yang-bisa-menemukannya)), tombolnya
  menawarkan tautan pendek, sekitar 90 karakter, yang menyebut bangunan itu
  alih-alih membawanya: siapa pun yang membukanya mendapatkan bangunan dari
  relay Nostr publik tempat bangunan itu dikirim, dan diperiksa seperti
  tautan. Tautan ini muat di obrolan mana pun, termasuk Discord dan
  Telegram, dan berlaku untuk bangunan hingga sekitar 2.000 balok.
  Bangunan yang hanya untuk tautannya tetap memakai tautan panjang, karena
  bangunan itu tidak ada di tempat lain. Tautan pendek berfungsi selama ada
  relay yang menyimpan bangunan itu; jika tidak ada yang menjawab,
  halamannya mengatakannya dan menawarkan **Coba lagi**.
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
- **Buat video** merekam video pendek bangunan itu untuk Anda unggah sendiri
  ke YouTube, Shorts, TikTok, atau Reels: **Time-lapse pembangunan**, tempat
  bangunan berdiri balok demi balok dari tanah, atau **Meja putar**, tempat
  bangunan berputar satu kali, dalam bentuk **Lebar (16:9)** atau **Tegak
  (9:16)**. Namanya tampil di bagian bawah, dan video diakhiri kartu yang
  menyebut siapa yang membangunnya, bersama semua yang ikut membangun, dan di
  mana me-remix-nya. Video dibuat di perangkat Anda selama durasinya (paling
  lama setengah menit) lalu disimpan ke unduhan; tidak ada yang diunggah.
  Setelah itu **Salin judul** dan **Salin deskripsi** memberi teks untuk
  ditempel di sampingnya: siapa yang membangunnya, tautan ke bangunan Anda,
  tautan ke ForkBuild, dan lisensinya. Video sebuah remix juga menyebut
  siapa yang membangun aslinya, dan deskripsi bangunan nonkomersial
  menyebutkan bahwa bangunan itu tidak boleh dijadikan sumber penghasilan.
  **Buat video** tersedia pada bangunan terbitan siapa pun, jadi sebelum
  Anda membuatnya, ia memberi tahu apa yang diminta lisensi bangunan itu
  jika orang lain yang membangunnya: pencantuman nama, tidak menghasilkan
  uang darinya (CC BY-NC), atau bertanya dulu kepadanya (Hak Cipta
  Dilindungi atau tanpa lisensi). Biarkan tab tetap di depan selama
  merekam; perekaman berhenti sejenak saat tab tersembunyi.
  Jika **Dengan musik** dicentang, seperti bawaannya kecuali Anda menghapus
  centangnya, musik ForkBuild ikut direkam dan memudar di bawah kartu penutup.
- **Jelajah**, jenis ketiga di **Buat video**, difilmkan di Tampilan Dunia:
  Tampilan Dunia terbuka di bangunan Anda, avatar Anda mulai beberapa langkah
  di depannya, berjalan ke pintu (yang terbuka) lalu masuk, dan melihat
  sekeliling ruangan, dengan suara Tampilan Dunia (burung atau jangkrik,
  angin, langkah kaki, pintu) dan, kecuali Anda menghapus centang **Dengan
  musik**, musiknya. Hanya tampilan 3D yang difilmkan, bukan panelnya, dan
  lamanya sama dengan durasi video (sekitar 15 detik). Bangunan tanpa pintu
  didatangi dari depan. Musik dan suara tetap ada di video meskipun Anda
  mematikannya. Tautan yang memuat bangunan besar terlalu panjang untuk
  deskripsi YouTube, jadi tidak disertakan dan Buat video memberitahukannya;
  terbitkan dengan **Siapa yang bisa menemukannya?** diatur ke **Semua
  orang** untuk tautan pendek.
  Di **Kamera**, **Di belakang avatar** mengikutinya dari tepat di belakang,
  dan **Lewat matanya** memfilmkan apa yang dilihatnya, seolah penonton
  sendiri yang masuk.
  **Mulai dengan kamera memutari bagian luar**, dicentang kecuali Anda
  menghapusnya, membuka video dengan kamera memutari setengah bangunan Anda
  sebelum jelajah. Lewat matanya, avatar berjalan ke titik paling lapang di
  ruangan dan difilmkan dengan lensa lebar, seperti video tur rumah, sehingga
  ruangan kecil pun terlihat utuh.
  Selama merekam, Tampilan Dunia digambar dengan bentuk video itu sendiri,
  lebar atau tegak, dengan bilah di sampingnya, sehingga yang Anda lihat
  adalah yang masuk ke video.

Menyalin atau membagikan tautan, dan membukanya, dihitung secara anonim,
seperti kunjungan harian; lihat
[Hitungan pengunjung harian](13-YourData.md#hitungan-pengunjung-harian).

### Apa yang dibuka sebuah tautan

Tautan ke sebuah bangunan, baik yang membawa bangunannya maupun yang
menyebut tempat ia disimpan, membuka halaman bangunan itu sendiri:

- bangunannya, berputar perlahan;
- judulnya dan siapa pembuatnya, serta **Dibangun bersama …** dan nama-nama
  mereka bila teman-teman membangunnya bersama pembuatnya (lihat
  [Bangun bersamaku](02-TheEditor.md#bangun-bersamaku-membangun-bersama-secara-langsung)).
  Nama pembuat dan nama setiap rekan pembangun membuka halaman orang itu:
  bangunan yang ditandatangani identitasnya, dan bangunan yang mencantumkan
  namanya oleh orang lain;
- **Remix dari "…" oleh …** jika itu remix, dan **Di-remix N kali** jika
  perangkat ini telah menemukan remix-nya (lihat
  [Jumlah remix](#jumlah-remix));
- **Yang berubah**, di bawah **Remix dari** pada remix: apa yang
  ditambahkannya (struktur Pustaka Bangunan, serta jendela, pintu, pohon,
  dan bagian lain di antara balok barunya), dicat ulang, dan dibuang,
  dihitung dari balok kedua bangunan jika perangkat ini dapat membaca
  bangunan yang di-remix;
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

Pada bangunan Anda sendiri, halaman itu tidak menawarkan salinannya. Jika
bangunan itu tersimpan di perangkat ini, tombol besarnya adalah **Lanjut
membangun**, yang membukanya di Editor seperti saat Anda menyimpannya, siap
diubah dan diterbitkan lagi. Di perangkat lain, halaman itu meminta Anda
mengubahnya di perangkat tempat Anda membangunnya.

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

## Siapa yang bisa menemukannya?

Pertama kali Anda mengeklik **Terbitkan**, lembarnya berisi **Semua orang
bisa menemukannya**, sudah dicentang:

- **Dicentang (semua orang)**: setiap bangunan yang Anda terbitkan juga dikirim ke
  semua orang. Bangunan itu muncul di **Jelajahi**, di tantangan minggu itu
  dan alun-alunnya, dan di Dunia, bagi siapa pun yang memakai ForkBuild,
  tanpa tautan, dompet, atau akun di kedua sisi. Tepat setelah Terbitkan,
  Editor berkata "Diterbitkan! Sedang dikirim ke semua orang…", lalu
  "Diterbitkan! Kini siapa pun bisa menemukannya di Jelajahi, di tantangan,
  dan di Dunia." Jika jaringan tidak dapat dijangkau, Editor mengatakannya
  dan menawarkan **Coba lagi**; tautannya tetap berfungsi.
- **Tidak dicentang (hanya orang yang Anda kirimi tautannya)**: bangunan tetap di perangkat
  ini dan di dalam tautannya. Pemberitahuannya berkata "Hanya orang yang
  Anda kirimi tautannya yang bisa melihatnya." dengan **Biarkan semua orang
  menemukannya**, yang mengirim bangunan ini dan menjadikan **Semua orang**
  pilihan sejak saat itu.

Jawabannya diingat di perangkat ini. Setelah sebuah bangunan dikirim ke
semua orang, **Mulai sekarang hanya lewat tautan** di pemberitahuan yang sama
menjaga bangunan Anda berikutnya hanya di tautannya.

Cara kerjanya: bangunan, yang Anda tandatangani, dikirim sebagai *catatan
bangunan* ke relay Nostr publik di **Pengaturan Jaringan**, bersama tag-nya
dan tempatnya di Dunia. Catatan itu ditandatangani dengan kunci yang dibuat
perangkat ini untuk keperluan itu (*kunci pembawa*-nya), bukan dengan
identitas Anda, jadi tidak ada yang perlu dipasang. Siapa pun yang
menemukan catatan itu membukanya persis seperti membuka tautan Anda: tanda
tangan Anda dan isi bangunan diperiksa lebih dulu, dan catatan yang tidak
cocok diabaikan. Bangunan yang terlalu besar untuk sebuah catatan (sekitar
2.000 balok) mengatakannya; bagikan tautannya, atau pilih ke mana dikirim
di bawah. Bangunan yang diterbitkan tanpa nama tidak bisa dikirim. Lihat
[Privasi](Privacy.md).

### Tempat bangunan berdiri

Bangunan terbitan mendapat tempatnya sendiri di Dunia bersama, dengan
ruang di sekelilingnya, sehingga Dunia terasa seperti daratan yang luas dan
terbuka:

- **Bangun di sini** menaruh bangunan di tempat yang Anda pilih;
- **yang lainnya**, termasuk remix, mendapat titiknya sendiri di grid
  Dunia, dipilih dari bangunan itu sendiri, sehingga setiap perangkat
  menaruhnya di tempat yang sama;
- menerbitkan ulang bangunan tidak pernah memindahkannya.

Karya tantangan ditempatkan dengan cara yang sama. Selama seseorang
mengunjungi [alun-alun tantangan](#alun-alun-tantangan) minggu itu, karya
tersebut juga ditampilkan di sekeliling alun-alun di samping karya lain
minggu itu, tanpa memindahkannya.

Untuk menaruh remix di samping bangunan yang di-remix-nya, pindahkan ke
sana: **Pindahkan…**, di
[alat lanjutan](WorldViewAdvancedTools.md#penempatan) Tampilan Dunia.

Semua orang yang menemukan bangunan itu melihatnya di tempat yang sama,
karena tempatnya ikut bersamanya, ditandatangani oleh Anda. Bangunan yang
diterbitkan dari 12 sampai 17 Oktober 2026 justru ditempatkan di sekeliling
alun-alun tantangan, dan tetap di sana sampai pembuatnya memindahkannya:
**Pindahkan ke titik gridnya**, di **Pindahkan Penempatan**, membawa
bangunan ke titik gridnya (lihat
[Posisi di dunia](WorldViewAdvancedTools.md#posisi-di-dunia)).

## Ke mana dikirim — mengirim bangunan saat menerbitkan

**Terbitkan** menyimpan bangunan Anda di perangkat ini dan di tautannya
sampai Anda memilih ke mana dikirim, kecuali pengiriman ke semua orang (di
atas). Tepat setelah Terbitkan, pemberitahuannya menawarkan **Pilih ke mana
dikirim** (atau **Jaringan lain**, setelah bangunan dikirim ke semua orang)
di samping tautan, dan **Tutup**.

**Pilih ke mana dikirim** membuka dialog **Ke mana dikirim**: pilih
**Penyimpanan** (tempat bangunan itu sendiri disimpan: Arweave, IPFS, atau
Steem atau Blurt bila penulisnya aktif) dan **Substrat Pengumuman /
Penemuan** (tempat bangunan diumumkan: Nostr, Arweave, Steem, atau Blurt),
lalu klik **Kirim**. **Kirim ke sini setiap kali aku menerbitkan** mulanya
tercentang: setelah pengiriman berhasil dengan centang itu, perangkat ini
menyimpan pilihannya, dan **setiap Terbitkan sesudahnya mengirim bangunan ke
sana dengan sendirinya**. Pemberitahuan lalu berkata "Sedang dikirim ke
Nostr…", kemudian "Diterbitkan dan dikirim ke Nostr: sekarang siapa pun bisa
menemukannya.", atau, bila pengiriman gagal, apa yang salah, dengan **Coba
lagi** dan **Ubah ke mana dikirim**. Hapus centang (di dialog, dari **Ubah
ke mana dikirim**) untuk berhenti, dan Terbitkan kembali menyimpan bangunan
di perangkat ini. Pinning jarak jauh tidak pernah disimpan, karena tokennya
hanya berlaku selama kunjungan; pilih di dialog setiap kali.

Hanya bangunan bertanda tangan yang dikirim dengan sendirinya; **Terbitkan
tanpa nama** tidak mengirim apa pun. Dompet atau ekstensi browser
Anda untuk jaringan itu (dompet Arweave seperti Wander, ekstensi Nostr
seperti nos2x, Steem atau Blurt Keychain) meminta persetujuan Anda untuk
setiap pengiriman, dan Arweave serta Blurt memungut biaya kecil setiap kali.
Tanpa itu, pengiriman berakhir dengan pemberitahuan biasa "…tidak dapat
diselesaikan" dan bangunan tetap diterbitkan di sini.

Dialog ini sama dengan yang dipakai Tampilan Dunia — pengaturan
**Penyimpanan** dan **Substrat Pengumuman / Penemuan**-nya, serta tombol
terpisah **Distribusikan Snapshot saja** / **Distribusikan Klaim Bertanda
Tangan saja**, bekerja seperti yang dijelaskan di
[Perjumpaan Dunia](WorldViewAdvancedTools.md#perjumpaan-dunia--publikasi-dan-avatar-yang-dibagikan-rekan-anda). Dua hal berbeda di sini: dialog ini selalu
bekerja pada Dunia Bersama persis yang baru dihasilkan klik Terbitkan Anda,
dan **Snapshot** didahulukan, sehingga **Kirim** mengirim Snapshot, lalu
Klaim Bertanda Tangan. Menutup dialog (**Tutup**, klik di luarnya, atau
Escape) tidak pernah menghilangkan apa pun yang dihasilkannya.

Hasil Klaim Bertanda Tangan muncul di bagiannya sendiri:

| Kolom | Arti |
|---|---|
| **Dunia Bersama** | Id Dunia Bersama itu sendiri — memastikan Dunia Bersama mana yang dimaksud hasil ini. |
| **Materi** | Lokasi yang dihasilkan unggahan, atau "Belum diunggah" jika tidak selesai. |
| **Penemuan** | Id pengumuman, atau "Belum diumumkan" jika tidak selesai — satu baris per relay jika beberapa relay dikonfigurasi. |
| **Bangunan Anda** | Tombol **Jelajahi** yang langsung melompat ke halaman publikasi ini di Tampilan Dunia — ditampilkan setiap kali publikasi memiliki tempat untuk dijelajahi, yang dalam praktiknya selalu. |

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

Menerbitkan lagi mengganti seluruh pemberitahuan dengan yang baru untuk
publikasi baru; menutupnya, atau meninggalkan halaman, menghapusnya.
Pemberitahuan maupun hasil bagian mana pun tidak diingat di mana pun; hanya
ke mana bangunan Anda dikirim.

## Berbagi dengan rekan yang terhubung

Bangunan yang Anda terbitkan hanya tercantum di **Jelajahi** *Anda*,
sampai bangunan itu dikirim ke semua orang (lihat
[Siapa yang bisa menemukannya?](#siapa-yang-bisa-menemukannya)) atau Anda
mendistribusikannya di Nostr, Arweave, Steem, atau Blurt (lihat
[Distribusi](Distribution.md)): setelah itu **Jelajahi** siapa pun dapat
menemukannya (lihat
[Karya yang didistribusikan orang lain](#karya-yang-didistribusikan-orang-lain)).
Untuk memasukkannya ke **Jelajahi** orang yang terhubung dengan Anda
(lihat [Koneksi Rekan & Teman](07-PeerConnectionsAndFriends.md)), klik
**Bagikan dengan Rekan** di bawahnya di **Jelajahi**. Tombol ini hanya muncul
pada Dunia terbitan Anda sendiri.

- Berbagi menawarkan Dunia itu kepada semua orang yang terhubung sekarang,
  dan kepada siapa pun yang terhubung kemudian. **Dibagikan ✓ · Bagikan
  Lagi** mengumumkannya lagi kepada orang yang terhubung sekarang.
- Di sisi mereka, Dunia yang dibagikan oleh salah satu **Teman** atau
  **Rekan yang Dikenal** mereka ditambahkan ke **Jelajahi** mereka dengan
  sendirinya, beserta semua yang diperlukan untuk **Jelajahi**. Dunia yang
  dibagikan orang lain menunggu di **Dibagikan kepada Anda** di bagian atas
  **Jelajahi** mereka sampai mereka mengeklik **Ambil**. Tidak ada perangkat
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

Saat pertama kali Anda menerbitkan bangunan tanpa lisensi, lembar
Terbitkan berisi **Orang lain boleh me-remix-nya**, sudah dicentang:

- **Dicentang** memasang **CC BY 4.0**: siapa pun boleh menyalin dan
  mengubahnya, asalkan mencantumkan nama Anda, dan setiap remix menunjukkan
  bahwa ia berasal dari milik Anda.
- **Tidak dicentang** memasang **Hak Cipta Dilindungi**: orang dapat
  mengelilinginya, tetapi tidak menyalinnya.

Remix adalah tujuan ForkBuild, jadi pilihan ini aktif sejak awal. **Terus
membangun** menutup lembar dan tidak menerbitkan apa pun.

Jawaban Anda disimpan sebagai lisensi bangunan, jadi Anda hanya ditanya
sekali; ubah kapan saja di **Properti Bangunan**. Sebuah remix sudah membawa
lisensi aslinya, jadi menerbitkannya tidak pernah bertanya.

### Semua lisensi

Karya yang diterbitkan selalu ditampilkan dengan lisensi, yang dipilih dari
dialog **Properti Bangunan**:

| Lisensi | Arti |
|---|---|
| **CC0 1.0 — Domain Publik** | Tidak ada hak yang dilindungi — siapa pun boleh melakukan apa pun dengannya |
| **CC BY 4.0 — Atribusi** | Siapa pun boleh me-remix dan memakai ulang, dengan mencantumkan nama Anda |
| **CC BY-SA 4.0 — Atribusi, BerbagiSerupa** | Remix harus membawa lisensi yang sama |
| **CC BY-NC 4.0 — Atribusi, NonKomersial** | Remix diizinkan, penggunaan komersial tidak |
| **CC BY-ND 4.0 — Atribusi, TanpaTurunan** | Dapat dilihat, tetapi **remix tidak diizinkan** |
| **Hak Cipta Dilindungi** | Dapat dilihat, tetapi remix tidak diizinkan |
| **Tidak ada lisensi yang ditentukan** | Remix tidak diizinkan sampai Anda menetapkan lisensi |

Jika Anda membiarkan karya tanpa lisensi, orang tetap dapat membuka dan
menjelajahinya — mereka hanya tidak dapat me-remix-nya sampai Anda memilih
lisensi yang mengizinkannya.

### Remix tetap menyebut nama Anda dan memegang syarat Anda

Remix dari bangunan Anda menyebut nama Anda, dan tetap memegang syarat
lisensi Anda, bagaimanapun pembuat barunya mengubah lisensinya di
**Properti Bangunan**:

| Lisensi Anda | Remix-nya boleh memakai |
|---|---|
| **CC0 1.0** | Lisensi apa pun |
| **CC BY 4.0** | Lisensi apa pun kecuali CC0, yang akan menghapus nama Anda |
| **CC BY-SA 4.0** | Hanya CC BY-SA 4.0 |
| **CC BY-NC 4.0** | Hanya CC BY-NC 4.0, Hak Cipta Dilindungi, atau tanpa lisensi, sehingga remix dari bangunan nonkomersial tidak pernah boleh dijual siapa pun |

**Properti Bangunan** hanya menawarkan lisensi-lisensi ini untuk remix,
menyebutkan bangunan siapa yang di-remix-nya, dan tetap mencantumkan nama
Anda lisensi mana pun yang dipilih. Me-remix bangunan Anda sendiri tidak
mengikat Anda pada apa pun: salinan Anda boleh memakai lisensi apa pun.
Gambar dan video bangunan yang disimpan memuat nama pembuatnya.

### Jika bangunan Anda mirip dengan bangunan orang lain

Saat Anda menekan **Terbitkan** di Editor, ForkBuild membandingkan bangunan Anda
dengan bangunan orang lain yang sudah pernah dilihat perangkat ini: yang
Anda buka, temukan di **Jelajahi**, atau lewati di dunia. Jika bangunan
Anda sangat mirip dengan salah satunya, ForkBuild memberi tahu sebelum
menerbitkan: bangunan yang mana, milik siapa, dan berapa banyak yang sama.
Jika Anda memulai dari bangunan itu, buka bangunan itu dan pilih
**Edit Salinan**, agar pembuatnya dicantumkan dan syaratnya tetap berlaku
(lihat [Cara me-remix](#cara-me-remix)). Jika lisensinya tidak mengizinkan
salinan, tanyakan dulu kepadanya. Jika itu karya Anda sendiri, pilih
**Ini buatan saya, terbitkan**. Pertanyaan ini muncul sekali setiap
kunjungan dan tidak pernah menghalangi Anda menerbitkan.

Apa yang dibandingkan, dan apa yang tidak bisa diketahuinya:

- Hanya balok yang Anda letakkan sendiri yang dihitung, jadi dua bangunan
  yang dimulai dari rumah siap pakai yang sama tidak dianggap mirip karena
  itu. Struktur siap pakai dari Pustaka Bangunan juga tidak dihitung, di
  kedua sisi, di mana pun letaknya dan bagaimanapun diputarnya, meskipun sebagian baloknya diubah: balok yang diubah dihitung sebagai milik Anda. Bangunan
  dengan kurang dari 20 balok milik Anda sendiri tidak
  dibandingkan: bangunan kecil terlalu mudah terlihat mirip.
- Sebuah balok dianggap sama jika jenisnya sama dan berada di tempat yang
  sama, meskipun seluruh bangunan Anda berdiri di tempat lain, diputar seperempat putaran, atau dicerminkan. Warna, dan arah hadap tiap balok, tidak dihitung.
- Dua bangunan terlihat mirip jika sebagian besar keduanya sama, atau jika
  hampir seluruh salah satunya (85% atau lebih) ada di bangunan lainnya, jadi
  salinan yang ditambahi balok sendiri juga ketahuan. Yang sama di antara
  keduanya harus setidaknya 20 balok dari setidaknya empat jenis: dinding,
  lantai, atau kotak dari satu atau dua jenis balok, atau dinding dan atap dua
  rumah kecil, terlalu sering mirip secara kebetulan sehingga tidak berarti
  apa-apa.
- Bangunan Anda sendiri, setiap bangunan dalam silsilah bangunan Anda
  (yang di-remix olehnya, remix-remixnya, dan remix lain dalam keluarga yang
  sama), dan bangunan yang diterbitkan setelah bangunan Anda pertama kali
  diterbitkan tidak diikutkan.
- Bangunan yang dibuat ulang dengan tangan dari bangunan orang lain, atau
  dibuat dari balok yang disalin darinya atau disimpan darinya ke **Struktur
  Saya**, tidak termasuk silsilahnya: hanya **Edit Salinan** yang menyimpan
  tautan itu. Bangunan seperti itu dibandingkan seperti bangunan lain, karena
  justru itulah gunanya petunjuk ini.
- ForkBuild hanya mengenal bangunan yang pernah dilihat perangkat ini, jadi
  tidak menemukan apa pun bukan berarti tidak ada yang membangun sesuatu
  yang mirip. Ini petunjuk, bukan penilaian: bangunan bisa mirip secara
  kebetulan, dan hanya Anda yang tahu bagaimana bangunan Anda dibuat. Tidak
  ada yang dikirim atau disimpan.

### Jika seseorang memakai bangunan Anda dengan cara yang tidak diizinkan lisensinya

ForkBuild tidak punya perusahaan atau moderator di tengah: bangunan
berpindah dari perangkat ke perangkat, dan video atau gambar dibuat dan
diunggah oleh orang yang memasangnya, di situs yang tidak dijalankan
ForkBuild. ForkBuild tidak dapat menurunkan video atau membayar Anda
darinya. Yang dilakukannya adalah membuat syarat Anda sulit terlewat dan
sulit dihapus: setiap bangunan terbitan menampilkan lisensinya, setiap
remix dan video menyebut nama Anda, dan siapa pun yang membuat video
bangunan Anda diberi tahu lebih dulu apa yang diminta lisensi Anda. Setiap
salinan ForkBuild mematuhinya, tetapi itu bukan kunci: orang yang mengubah
kode aplikasi bisa mengabaikannya, dan apa yang dilakukan seseorang di luar
ForkBuild terserah dirinya.

Jika seseorang memasang bangunan Anda atau menghasilkan uang darinya
bertentangan dengan lisensi Anda:

1. **Tanyakan dulu kepadanya.** Banyak orang tidak tahu lisensinya dan
   dengan senang hati akan menambahkan nama dan tautan Anda, menurunkan
   video, atau membagi hasilnya.
2. **Simpan buktinya.** Publikasi bangunan Anda adalah klaim yang
   ditandatangani identitas Anda, membawa lisensinya, dan dapat ditambatkan
   di Arweave untuk tanggal yang tidak bisa diubah siapa pun kemudian
   (lihat [Catatan Bertanda Tangan & Bukti Eksternal](09-PublicationsAndEvidence.md)).
   Simpan juga salinan tersimpan Anda dan tautan ke sana.
3. **Gunakan proses situs itu sendiri.** YouTube, TikTok, dan lainnya
   menerima keluhan hak cipta dari orang yang memiliki karya itu. Ajukan
   hanya jika penggunaannya memang tidak diizinkan: video *tentang* sebuah
   bangunan, seperti ulasan, mungkin diperbolehkan tanpa izin di banyak
   negara.
4. **Untuk hal yang serius, tanyakan pengacara.** Hak cipta berlaku berbeda
   di setiap negara, dan panduan ini bukan nasihat hukum.

Di ForkBuild sendiri Anda dapat memakai **Blokir** pada seseorang (lihat
[Koneksi Rekan & Teman](07-PeerConnectionsAndFriends.md)) agar perangkat
Anda berhenti terhubung dengannya.

## Memilih siapa yang dapat menempatkannya

Orang lain biasanya dapat menempatkan karya terbitan Anda di Dunia mereka
sendiri. Itu menambahkan penempatan bangunan Anda, tidak pernah salinannya,
dan tidak pernah memindahkan atau mengubah milik Anda (lihat
[Mengapa saya bisa menempatkan bangunan orang lain?](WorldViewAdvancedTools.md#mengapa-saya-bisa-menempatkan-bangunan-orang-lain)). Remix adalah hal terpisah dan diatur oleh lisensi (lihat
[Menempatkan vs me-remix](WorldViewAdvancedTools.md#menempatkan-vs-me-remix)). Jika Anda lebih suka mereka tidak menempatkannya, buka **Properti
Bangunan** dan atur **Siapa yang dapat menempatkannya di Dunia**:

| Pengaturan | Arti |
|---|---|
| **Siapa pun boleh menempatkannya** | Bawaan. Siapa pun boleh menempatkannya di mana saja di Dunia mereka sendiri |
| **Hanya saya yang boleh menempatkannya** | Hanya Anda yang dapat menempatkannya. Orang lain tetap dapat menemukan, melihat, dan (jika lisensi mengizinkan) me-remix-nya, tetapi ForkBuild tidak akan membiarkan mereka menempatkannya |

Pengaturan ini ditandatangani sebagai bagian dari publikasi saat Anda
menerbitkan, jadi tidak ada yang dapat menghapus atau mengubahnya setelah
itu. Itu juga berarti pengaturan ini hanya berlaku untuk apa yang Anda
terbitkan setelah memilihnya. Publikasi yang sudah beredar tetap memakai
pengaturan saat diterbitkan, jadi terbitkan lagi jika Anda ingin pengaturan
baru berlaku.

Cara kerjanya sama seperti izin remix pada lisensi: setiap salinan ForkBuild
mematuhinya, tetapi itu bukan kunci. Seseorang yang mengubah kode aplikasi
dapat mengabaikannya, dan pengaturan ini tidak dapat menarik kembali
penempatan yang dibuat seseorang sebelum Anda memilihnya.

Bagaimanapun juga, orang lain melihat bangunan Anda di tempat *Anda*
menaruhnya begitu Anda mengirim Snapshot-nya, seperti yang dilakukan
Terbitkan setelah Anda memilih ke mana bangunan Anda dikirim, atau dengan
**Distribusikan** di Tampilan Dunia: pengumumannya membawa penempatan
bertanda tangan Anda, dan ForkBuild mereka menampilkan bangunan di sana
begitu mengenal Dunia Bersama Anda. Pindahkan dan distribusikan lagi, dan
bangunan itu juga berpindah bagi mereka.

## Mengedit karya yang sudah diterbitkan

Karya yang sudah diterbitkan **tidak dapat diubah** — tidak pernah bisa
berubah setelahnya. Untuk mengembangkannya, **Remix** (di bawah), atau
gunakan **Edit Salinan** di Tampilan Dunia. Di Tampilan Dunia, membuat
perubahan pertama Anda pada dunia yang diterbitkan — metadatanya, penanda
atau nama wilayah, atau hiasan hewan — otomatis membuat salinan Anda
sendiri, berjudul *"Remix dari &lt;nama asli&gt;"*, dengan konfirmasi
singkat ("Salinan Anda sendiri yang dapat diedit telah dibuat — "…" tidak
berubah"); lihat
[Menyimpan dan menerbitkan di sini juga](03-WorldView.md#menyimpan-dan-menerbitkan-di-sini-juga).

Yang asli tidak pernah tersentuh, seberapa banyak pun Anda mengubah
salinan Anda.

## Jelajahi

**Jelajahi** di bilah atas (disebut *Repositori* di versi
lama) adalah katalog yang dapat dicari berisi setiap
bangunan terbitan yang diketahui perangkat ini: milik Anda sendiri, yang dibagikan
rekan kepada Anda, dan yang ditemukan di jaringan terdesentralisasi.
Jelajahi dibuat agar tetap mudah dipakai baik berisi sepuluh karya
maupun sepuluh ribu.

### Bangunan siap pakai

Di bagian atas, **Mulai dari bangunan siap pakai** menampilkan bangunan
yang disertakan bersama ForkBuild: kastil, pulau pelabuhan, alun-alun
desa, rumah, kincir, dan jembatan. Semuanya sudah ada bahkan sebelum ada
yang diterbitkan atau ditemukan. Klik salah satunya (**Remix**) untuk
membuka salinan Anda sendiri di Editor; tidak ada yang diterbitkan sampai
Anda menerbitkannya. Klik judulnya untuk melipat baris itu.

Di bawahnya, **Bagaimana remiks tumbuh** menampilkan tiga contoh
keluarga yang disertakan bersama ForkBuild, masing-masing rantai remiks dari
bangunan siap pakai: Rumah, diremiks menjadi Rumah dengan Teras, yang diremiks
dua kali lagi (Rumah dengan Taman dan Rumah dengan Menara); Menara Pengawas,
diremiks menjadi Mercusuar lalu Mercusuar dan Pondok Penjaga; dan Kincir,
diremiks menjadi Kincir dan Lumbung lalu Rumah Pertanian. Masing-masing adalah
induknya dengan tambahan, seperti remiks buatanmu. Klik sebuah nama untuk
membuka salinanmu sendiri. Ini contoh dari aplikasi, bukan publikasi siapa
pun; semuanya juga ada di **Struktur** Pustaka Bangunan, di bawah
*koleksi*.

### Karya yang didistribusikan orang lain

Setiap kali Anda membuka **Jelajahi** (atau halaman pembuat), **Jelajahi**
mencari di Nostr, Arweave, Steem, dan Blurt karya yang didistribusikan orang lain
di sana, lalu menambahkan yang dapat diverifikasinya. Sebuah baris di atas
daftar menjelaskan apa yang sedang dilakukannya, lalu berapa banyak karya
baru yang ditemukannya; **Periksa lagi** mencari sekali lagi.

- Hanya karya yang catatan bertandatangannya lolos pemeriksaan yang
  ditambahkan: ditandatangani dengan kunci yang disebutkannya, dan persis
  karya yang diumumkan. Selebihnya dilewati, dan catatan yang gagal tidak
  diambil lagi.
- Jelajahi memeriksa hingga 20 karya baru sekaligus. Jika ada lebih
  banyak, baris itu menyebutkan berapa yang tersisa untuk lain kali.
- Karya yang ditemukan dengan cara ini tetap ada di **Jelajahi** Anda setelah
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
| **Buka** | Memuat bangunan itu ke Editor |
| **Remix** | Menyalinnya menjadi karya Anda sendiri yang dapat diedit |
| **Jelajahi** | Terbang ke sana di Tampilan Dunia |

(Tombol **Lanjutkan Menjelajah** milik **Dunia Saya** — lihat
[Dunia Saya](03-WorldView.md#dunia-saya--dunia-yang-benar-benar-pernah-anda-kunjungi) — melakukan hal yang sama dengan **Jelajahi** di sini, hanya
dengan kata-kata untuk Dunia yang sudah pernah Anda kunjungi, bukan yang
baru pertama kali Anda temukan.)

Klik **nama pembuat** mana pun untuk mengunjungi **Halaman pembuat** milik
mereka — portofolio semua yang telah mereka buat, termasuk karya asli dan
semua remix yang tumbuh darinya, memakai katalog pencarian/urutan/penomoran
halaman yang persis sama dengan **Jelajahi**, hanya dibatasi pada satu
pembuat itu.

Kartu yang tanda tangannya valid juga memiliki tombol **Ikuti**, dan
Halaman pembuat menampilkan **Ditandatangani oleh …** dengan **Ikuti**
untuk setiap identitas yang menerbitkan dengan nama itu. Mengikuti
seseorang menempatkan karya baru mereka di halaman **Diikuti** dan di
notifikasi Anda; lihat
[Mengikuti orang](07-PeerConnectionsAndFriends.md#mengikuti-orang).

**Jelajahi** juga tidak terbatas pada apa yang diterbitkan dari perangkat ini
atau ditemukan secara langsung: bangunan terdesentralisasi yang
ditunjukkan seorang rekan kepada Anda di peta
[Perjumpaan Dunia](WorldViewAdvancedTools.md#perjumpaan-dunia--publikasi-dan-avatar-yang-dibagikan-rekan-anda) di Tampilan Dunia, begitu kontennya benar-benar
terselesaikan, juga bergabung ke pencarian yang sama ini dan ke Halaman
pembuatnya, dan tetap di sana setelah dimuat ulang. Karya itu ditampilkan
tidak berbeda dengan hal lain di sini.

## Remix: jadikan milik Anda

**Remix** adalah yang membuat ForkBuild istimewa. Saat Anda me-remix sebuah
karya:

- Anda mendapat **salinan baru yang mandiri** untuk diedit dengan bebas.
- **Yang asli tidak tersentuh** — perubahan Anda tidak pernah memengaruhinya.
- Salinannya **mengingat dari mana asalnya**, jadi penghargaan tidak pernah
  hilang.

Cara kerjanya persis seperti mem-fork proyek di Git: Anda bercabang,
mengerjakan hal Anda sendiri, dan pohon keluarganya mencatat semua orang.
(Di Tampilan Dunia, remix juga terjadi otomatis begitu Anda mengubah dunia
yang diterbitkan — lihat
[Mengedit karya yang sudah diterbitkan](#mengedit-karya-yang-sudah-diterbitkan)
di atas.)

> **Disebut juga "Edit Salinan" di Tampilan Dunia.** Keduanya operasi yang
> sama di baliknya, dengan aturan lisensi yang sama dan penanganan
> [Tidak bisa membuat salinan](#saat-remix-tidak-dapat-diselesaikan) yang sama.
> Lihat
> [Edit Salinan](03-WorldView.md#edit-salinan--membawa-sesuatu-ke-editor) untuk panduan Tampilan Dunia sendiri.

### Cara me-remix

1. Temukan sebuah bangunan di **Jelajahi** (atau di Tampilan Dunia).
2. Klik **Remix**.
3. Salinannya terbuka di Editor, berjudul *"Remix dari &lt;nama asli&gt;"*.
4. Kembangkan, lalu simpan dan terbitkan sebagai milik Anda.

Remix terbitan Anda muncul dengan catatan **Remix dari "…" oleh …**, yang
menautkannya kembali ke yang asli.

### Jumlah remix

Halaman sebuah bangunan dan kartunya di **Jelajahi** menyebutkan berapa kali
ia di-remix (**Di-remix 3 kali**): berapa banyak bangunan berbeda yang
di-remix darinya dan diterbitkan yang telah ditemukan perangkat ini. Remix
yang diterbitkan dua kali dihitung sekali, dan bangunan yang belum pernah
di-remix tidak menampilkan apa pun. Jumlahnya hanya apa yang diketahui
perangkat ini, jadi perangkat lain bisa menampilkan angka berbeda, dan
jumlah itu tidak pernah menentukan apa yang ditampilkan lebih dulu.

Saat perangkat ini menemukan remix dari orang lain atas salah satu
bangunan Anda, 🔔 Anda mendapat entri **… me-remix bangunan Anda**, sekali
per remix (dan perangkat Anda juga menampilkannya, jika Anda mengaktifkan
[Notifikasi di perangkat ini](03-WorldView.md#notifikasi-di-perangkat-ini)).

### Hati

Ketuk **♡** pada bangunan yang Anda sukai: di panel **Tentang bangunan ini**
di Tampilan Dunia atau pada kartunya di **Jelajahi**. Tombol itu berubah
menjadi **♥** dan menunjukkan siapa yang menyukainya: **Disukai Anda dan 11
lainnya**. Klik baris itu untuk melihat semuanya, setiap nama tautan ke
halamannya. Ketuk **♥** lagi untuk menarik kembali hati Anda.

Hati bersifat publik. Hati ditandatangani dengan nama yang Anda pakai untuk
masuk, dikirim ke orang yang terhubung dengan Anda dan ke jaringan yang
dipilih untuk hati di **Pengaturan → Pengumuman / Penemuan → Hati** (Nostr
kecuali Anda mengubahnya, tempat aplikasi Nostr lain menampilkannya sebagai
suka), dan pembuatnya mendapat entri **… menyukai bangunan Anda** di 🔔
miliknya. Pertama kali, ForkBuild memberi tahu Anda sebelum mengirimnya.
Seperti jumlah remix, angkanya hanya yang ditemukan perangkat ini, dan tidak
pernah menentukan apa yang ditampilkan lebih dulu.

### Saat remix tidak dapat diselesaikan

Sesekali remix tidak dapat dilakukan — paling sering saat me-remix Dunia
Bersama yang ditemukan melalui rekan atau jaringan terdesentralisasi
(lihat [Catatan Bertanda Tangan & Bukti Eksternal](09-PublicationsAndEvidence.md)),
bukan bangunan biasa di **Jelajahi**. Alih-alih melempar Anda ke bangunan
Editor kosong yang tidak berhubungan, ForkBuild menampilkan dialog **Tidak
bisa membuat salinan** yang menyebutkan persis apa yang salah:

- **Lisensi bangunan ini tidak mengizinkan salinan.** — lihat
  [Memilih lisensi](#memilih-lisensi) di atas.
- **Bangunan ini tidak bisa diambil saat ini.** — lisensinya mengizinkan
  salinan, tetapi bangunan itu sendiri belum ada di perangkat ini (atau
  belum dapat dijangkau melalui rekan yang terhubung).

Bagaimanapun juga, satu-satunya tombol di dialog itu, **Kembali ke
bangunan**, membawa Anda kembali ke tempat Anda menemukannya — Dunia tempat
karya itu ditempatkan, atau Dunia Bersama itu sendiri — alih-alih
meninggalkan Anda terdampar di Editor tanpa apa pun untuk dibangun.

## Tantangan membangun mingguan

Setiap minggu ForkBuild memberi tema untuk dibangun (mercusuar, jembatan,
rumah mungil, …), dari Senin sampai akhir Minggu (UTC). Beranda
menampilkannya, dan **Tantangan** di bilah atas membuka halamannya.

Ada 26 tema, sehingga setengah tahun berlalu sebelum satu tema muncul
lagi, masing-masing dengan ide untuk memulai dan tantangan tambahan yang membuat
karya minggu itu berbeda-beda, misalnya *"Buat cukup lebar untuk dilewati
gerobak jerami."* Setiap minggu keempat adalah minggu remix (lihat di
bawah).

1. **Ikut tantangan** membuka lahan kosong milik Anda di Editor, dinamai
   sesuai tema dan sudah bertag minggu itu (tag seperti
   `#lighthouse-20261012`: temanya dan hari Senin saat dimulai), dengan
   struktur minggu itu disematkan di atas **Struktur** di Pustaka Bangunan.
   Tantangan juga menjadi pilihan pertama di **Baru** pada Editor, dan
   **Ide untuk memulai** di halamannya membuka salah satu bangunan itu
   sebagai salinan Anda sendiri.
2. Bangun dengan cara Anda: tambahkan sebuah ide jika mau, lalu jadikan
   milik Anda. Apa pun yang Anda bangun ikut serta selama tetap memakai tag
   minggu itu (tambahkan di **Properti Bangunan → Tag** jika Anda memulai
   dengan cara lain).
3. Terbitkan sebelum minggu berakhir, lalu bagikan tautannya. Teks
   tautannya menyebut tantangan dan tagnya, siap untuk sebuah postingan.

**Tema musiman.** Beberapa tema termasuk dalam satu musim: taman di musim
semi, pasar malam musim panas, lumbung di musim gugur, pondok musim dingin,
atau kolam seluncur. Tema-tema ini tersebar di antara tema lainnya, jadi
satu muncul kira-kira setiap enam minggu, musim demi musim. Musim di Tampilan Dunia berganti jauh lebih cepat
daripada minggu, jadi minggu itu tidak menunggu musimnya; sebagai gantinya
halaman tantangan menyarankan memilih musim itu di **Musim** di Tampilan
Dunia, untuk melihat karya peserta sebagaimana mestinya.

**Minggu remix.** Setiap minggu keempat, mulai dari minggu 2 November
2026, adalah minggu remix (`#remix-20261102`): alih-alih sebuah tema,
sebuah karya dimulai sebagai salinan Anda sendiri dari salah satu karya
minggu sebelumnya. **Ikut** membuka halaman tantangan, yang menampilkan
karya minggu lalu; **Remix** pada salah satunya membuka salinan Anda di
Editor, bertag minggu itu. Salinan Anda mengingat milik siapa asalnya,
sehingga pembuatnya tercantum di pohon keluarga. Jika minggu lalu tidak ada
karya, keluarga remix contoh yang ditawarkan.

Halaman tantangan menampilkan karya peserta yang diketahui perangkat ini:
bangunan Anda sendiri yang diterbitkan dengan tag itu, dan bangunan orang
lain yang ditemukan di jaringan. Saat bangunan didistribusikan ke Nostr, Arweave, Steem, atau Blurt, pengumumannya (di Blurt, postingannya) mencantumkan tagnya, dan halaman itu menanyakan
tag minggu itu ke jaringan tersebut setiap kali dibuka (**Periksa lagi**
menanyakan lagi). Setiap karya yang ditemukan diperiksa seperti semua yang
ditemukan **Jelajahi**, dan juga muncul di **Jelajahi**. Bangunan yang hanya dibagikan lewat tautannya tidak ditemukan dengan cara ini, begitu pula bangunan yang hanya diumumkan di Steem sebelum 8 Oktober 2026, saat pengumuman Steem mulai mencantumkan tag. Minggu-minggu sebelumnya tetap bisa dibuka
lewat hari Seninnya (**Minggu lalu: …**), tanpa **Ikut**.

Karya peserta ditampilkan dari yang terbaru, dengan jumlah remix-nya. Tidak
ada yang menilai dan tidak ada peringkat: tantangan ini adalah alasan untuk
membangun sesuatu minggu ini, dan melihat apa yang dibuat orang lain dari
ide yang sama.

Jika ada karya peserta yang di-remix dari satu sama lain, atau dari
bangunan lain, **Silsilah** di bawah daftar peserta menunjukkan asalnya,
satu pohon untuk setiap rantai remix.
Minggu yang belum punya entri menampilkan contoh keluarga sebagai gantinya (lihat [Bangunan siap pakai](#bangunan-siap-pakai)).

### Alun-alun tantangan

**Jalan-jalan** di menu utama membawamu ke alun-alun minggu ini, begitu
pula **Jelajahi alun-alun** di halaman tantangan begitu satu minggu punya
karya. Itulah alun-alun desa di dunia bersama: enam bangunan siap pakai
berdiri mengelilinginya untuk semua orang, selalu, masing-masing dengan
**Remix**, dan karya minggu itu berdiri tepat di luarnya. Berjalanlah di antaranya, atau pilih satu di panel: **Navigasi** terbang ke
sana, **Buka** membukanya seperti **Jelajahi**, dan **Edit Salinan** memulai
salinanmu sendiri.

- Hanya karya minggu itu yang berdiri di sekeliling alun-alun: alun-alun
  minggu lalu menampilkan karya minggu lalu, dan alun-alun minggu ini
  menampilkan karya minggu ini.
- Setiap karya ditampilkan, selama kamu berada di alun-alun, di sebuah
  tempat di sekeliling alun-alun. Itu salinan untuk pameran: tempat
  bangunan itu sendiri, di luar sana di Dunia, tetap di tempatnya. Karya
  yang memang ditempatkan di sekeliling alun-alun (seperti bangunan yang
  diterbitkan dari 12 sampai 17 Oktober 2026) berdiri sendiri di sana.
- Bangunan lain yang ditempatkan di dekat alun-alun tidak ditampilkan
  selama kamu berada di alun-alun, agar alun-alun hanya menampilkan
  minggunya. Tidak ada yang terjadi pada bangunan itu: mereka kembali saat
  kamu pergi.
- Panel mendaftar 24 karya pertama yang diterbitkan. Sisanya ada di
  halaman tantangan.
- Karya yang ditemukan di jaringan diambil dan diperiksa seperti saat
  tautannya dibuka. Karya yang tidak bisa diambil ditinggalkan, dan panel
  menyebutkan berapa banyak.
- Karya yang penerbitnya memilih **Hanya saya yang boleh menempatkannya**
  tidak berdiri di alun-alun, karena menaruhnya di sana sama dengan
  menempatkannya. Karya itu tetap di halaman tantangan.
- Karya yang ditampilkan di tempatnya adalah pajangan, bukan penempatan:
  tidak ada yang ditandatangani atau disimpan untuk siapa pun, dan karya itu
  hilang saat kamu pergi. Seperti bagian lain Tampilan Dunia, alun-alun menampilkan apa yang
  diketahui perangkat ini, jadi dua pengunjung bisa melihat kumpulan yang
  berbeda.

## Pohon keluarga

Karena setiap remix mencatat induknya, ForkBuild dapat menggambar seluruh
silsilah sebuah karya. Di **Halaman pembuat**, Anda akan melihat **pohon
remix**:

```
Medieval House (asli)
└─ Remix dari Medieval House (oleh Bob)
   └─ Remix dari Remix dari… (oleh Carol)
```

Ini berarti sebuah karya hebat dapat mengilhami seluruh ekosistem variasi —
dan setiap orang dalam rantai itu mendapat penghargaan.

Halaman sebuah bangunan, yang dibuka dari tautan yang dibagikan,
menampilkan garis keturunan yang sama sebagai **Silsilah**: asal remix-nya
sampai yang asli, lalu bangunan itu sendiri, lalu remix yang dibuat
darinya, sejauh yang diketahui perangkat ini. Halaman tantangan
menampilkan satu silsilah untuk setiap rantai peserta. Setiap bangunan dalam
silsilah menyebut pembuatnya dan teman-teman yang membangunnya bersamanya;
judulnya membuka bangunan itu, dan setiap nama membuka halaman orang itu.

Di bawah setiap remix di silsilah, satu baris menyebutkan apa yang
diubahnya dari bangunan di atasnya (*Menambahkan 2 semak, 4 petak rumput,
dan 6 balok lain*), jika perangkat ini dapat membaca keduanya. Keluarga
siap pakai di halaman tantangan menampilkan hal yang sama.

### Bangunan mirip yang diterbitkan lebih dulu

Di bawah silsilah, halaman sebuah bangunan mencantumkan bangunan orang lain
yang diterbitkan sebelumnya dan sangat mirip dengannya, di antara yang
pernah dilihat perangkat ini: judul dan pembuat masing-masing, berapa banyak
yang sama, dan kapan diterbitkan. Dengan ini Anda bisa menemukan salinan
bangunan Anda: buka halaman salinan itu, dan jika bangunan Anda diterbitkan
lebih dulu dan mirip dengannya, bangunan Anda tercantum di sana. Bangunan
dibandingkan seperti saat menerbitkan (lihat
[Jika bangunan Anda mirip dengan bangunan orang lain](#jika-bangunan-anda-mirip-dengan-bangunan-orang-lain)),
hanya saja setiap balok dihitung kecuali yang menjadi bagian dari struktur siap pakai dari Pustaka Bangunan (meskipun sebagian telah diubah), karena hanya perangkat pembuatnya
yang tahu balok mana yang ia letakkan sendiri.

Tidak diikutkan: bangunan dari pembuat yang sama (dan siapa pun yang
membangunnya bersama dia), seluruh silsilah, dan bangunan yang diterbitkan
sesudahnya. "Sebelum" mengikuti tanggal yang ditandatangani tiap bangunan saat diterbitkan. Tanggal itu dipilih pembuatnya, jadi perangkat ini mendukungnya dengan kapan perangkat ini pertama kali melihat tiap bangunan: bangunan yang hanya bertanggal sebelum bangunan ini, tetapi pertama terlihat di sini sesudahnya, dicantumkan sebagai "bertanggal … menurut pembuatnya, pertama terlihat di sini …", dan bangunan bertanggal sesudah bangunan ini yang lebih dulu dilihat perangkat ini dicantumkan sebagai "terlihat di sini sebelum bangunan ini". Salinan tidak bisa menempatkan dirinya lebih dulu hanya dengan menandatangani tanggal yang lebih awal, dan 🔔 memberi tahu Anda tentang bangunan bertanggal sebelum milik Anda yang baru sekarang dilihat perangkat ini, dengan menyebut bahwa bangunan itu bertanggal sebelum milik Anda.

Bangunan bisa mirip secara kebetulan atau karena mengubah struktur siap
pakai yang sama dengan cara yang mirip, jadi bangunan yang tercantum di sini
tidak berarti ada yang
menyalin. Jika Anda merasa seseorang memakai bangunan Anda dengan cara yang
tidak diizinkan lisensinya, lihat
[Jika seseorang memakai bangunan Anda dengan cara yang tidak diizinkan lisensinya](#jika-seseorang-memakai-bangunan-anda-dengan-cara-yang-tidak-diizinkan-lisensinya).
Tidak ada yang dicantumkan jika perangkat ini belum melihat bangunan seperti
itu, dan itu tidak berarti tidak ada.

Panel **Tentang bangunan ini** di Tampilan Dunia juga mencantumkannya, di
bawah detail bangunan. Dan saat perangkat ini menemukan bangunan orang lain
yang sangat mirip dengan salah satu bangunan Anda dan diterbitkan
sesudahnya, 🔔 Anda mendapat entri
**… menerbitkan bangunan yang mirip dengan milik Anda**, sekali per
bangunan, beserta berapa banyak yang sama; entri itu membuka bangunan
tersebut, yang halamannya mencantumkan bangunan Anda (perangkat Anda juga
menampilkannya jika Anda menyalakan
[Notifikasi di perangkat ini](03-WorldView.md#notifikasi-di-perangkat-ini)).
Remix dari bangunan Anda tidak dihitung di sini: remix mencantumkan nama
Anda dan punya [notifikasinya sendiri](#jumlah-remix).

Pada bangunan Anda sendiri, dan hanya di sana, kartu Anda di **Jelajahi** juga menyebut berapa banyak bangunan orang lain,
yang diterbitkan setelah milik Anda, yang sangat mirip dengannya
(**2 bangunan yang diterbitkan setelah milik Anda mirip dengannya**); klik
untuk melihatnya. Bangunan Anda sendiri adalah yang Anda terbitkan dari
perangkat ini dan, dari perangkat Anda yang lain, yang ditandatangani dengan
nama yang kuncinya dimiliki perangkat ini. Hanya Anda yang melihat ini: tidak ada kartu milik orang
lain yang ditandai di daftar yang dijelajahi semua orang.

## Alur kreatif yang umum

Inilah seluruh perjalanannya dalam satu alur:

1. **Bangun** sesuatu di Editor.
2. **Simpan**.
3. **Terbitkan**, lalu kirim ke semua orang atau bagikan tautannya.
4. Seseorang **menemukannya** — dengan mencari, dengan menjelajahi sekitar
   di Tampilan Dunia, atau dengan menelusuri Halaman pembuat Anda — lalu
   **me-remix**-nya.
5. Mereka **menerbitkan** remix mereka.
6. Orang lain **menjelajahi** keduanya di Tampilan Dunia, dan pohonnya
   tumbuh.

Itulah ekosistem konstruksi terbuka yang menjadi tujuan ForkBuild.

## Apa selanjutnya?

Simpan [Referensi Kontrol](ControlsReference.md) di dekat Anda saat
membangun, atau kembali dan jelajahi
[Tampilan Dunia](03-WorldView.md) lebih dalam.
