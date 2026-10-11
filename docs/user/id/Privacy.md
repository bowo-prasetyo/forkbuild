<!-- translation-of: docs/Privacy.md source-hash: b4c0a3045ba7efaa -->
# Privasi

<!-- languages -->
[English](../../Privacy.md) · [Deutsch](../de/Privacy.md) · [Español](../es/Privacy.md) · [Français](../fr/Privacy.md) · **Bahasa Indonesia** · [日本語](../ja/Privacy.md) · [한국어](../ko/Privacy.md) · [Português (Brasil)](../pt-BR/Privacy.md)
<!-- /languages -->

ForkBuild tidak memiliki akun dan tidak melacak Anda. ForkBuild menyimpan
pekerjaan Anda di browser Anda sendiri dan berkomunikasi dengan komputer
lain hanya untuk fitur yang membutuhkannya, ditambah hitungan pengunjung
anonim, sekali sehari, saat tautan berbagi dipakai, dan saat ForkBuild dipasang, agar pembuatnya tahu
kira-kira berapa banyak orang yang menggunakannya dan membagikan bangunan
(lihat "Hitungan pengunjung" di bawah, juga cara mematikannya). Halaman ini mencantumkan apa yang disimpannya, serta setiap
server yang dapat dihubunginya dan kapan.

## Apa yang tetap di perangkat Anda

Semua yang di bawah ini berada di penyimpanan browser ini (database
IndexedDB `forkbuild`; browser tanpa IndexedDB memakai `localStorage`,
dengan kunci yang diawali `forkbuild:`) dan tidak pernah keluar dari
perangkat kecuali Anda menerbitkan, mengekspor, atau mengirimnya:

- dokumen Anda, salinan pemulihan dari perubahan yang belum disimpan, dan
  struktur yang disimpan;
- identitas Anda: kunci publik masing-masing, dan kunci privatnya, yang
  dienkripsi dengan frasa sandi Anda kecuali Anda memilih membuatnya tanpa
  frasa sandi;
- identitas yang dibuat hanya dengan nama, saat pertama kali menerbitkan
  atau berjalan bersama, tidak memiliki frasa sandi sampai Anda
  menambahkannya di **Identitas Saya**, jadi apa pun yang dapat membaca
  penyimpanan situs ini dapat menandatangani sebagai identitas itu;
- rekan yang dikenal, teman, orang yang Anda ikuti, blokir, riwayat
  obrolan, dan pesan yang diantrekan (tidak ada yang diberi tahu bahwa
  Anda mengikutinya, dan tidak ada informasi tentang mengikuti yang pernah
  dikirim);
- profil avatar Anda, pengaturan (termasuk apakah Tampilan Dunia
  memutar suara, seberapa keras, dalam 3D atau stereo, dan bahasa yang
  Anda pilih; jika Anda belum memilih, ForkBuild membaca bahasa pilihan
  browser di perangkat dan tidak mengirimnya ke mana pun), serta nama
  pengguna dan kredensial server TURN jika Anda memasukkannya di
  **Pengaturan Jaringan**;
- apakah browser ini ikut dalam hitungan pengunjung harian, dan hari
  terakhir browser ini dihitung;
- publikasi orang lain yang telah ditemukan dan diverifikasi perangkat ini,
  dari rekan, tautan, Tampilan Dunia, atau pencarian Repositori di
  jaringan, dan, untuk yang ditemukan di jaringan, tempat catatan
  bertandatangan masing-masing dibaca;
- ID publikasi yang Anda batalkan penerbitannya di perangkat ini, agar
  pencarian Repositori di jaringan tidak mencantumkan lagi salinan yang
  pernah Anda distribusikan.
- jaringan mana saja yang menerima setiap komentar Anda dari perangkat ini,
  dan kapan, agar setiap komentar bisa menunjukkan ke mana ia dikirim.
- untuk setiap minggu tantangan membangun yang Anda buka, ID karya peserta
  yang ditemukan di jaringan, agar halamannya menampilkannya lagi sebelum
  mencari.
- untuk setiap bangunan yang Anda mulai dengan **Bangun di sini**, Dunia
  dan tempat yang Anda pilih, agar saat diterbitkan bangunan itu berdiri di
  sana. Cap Anda di Beranda dihitung dari apa yang sudah tercantum di sini
  dan tidak disimpan.

Menghapus data situs ini di browser akan menghapus semuanya, dan tidak ada
salinan lain maupun cara untuk memulihkannya. Cadangkan terlebih dahulu
dengan **Data Anda → Cadangkan ke File**: file itu berisi semua hal di
atas kecuali identitas mana yang sedang masuk, dienkripsi dengan frasa
sandi yang Anda pilih, dan tetap berada di tempat Anda menaruhnya.
ForkBuild tidak pernah mengunggahnya. **Bagikan Cadangan** menyerahkan
file itu ke aplikasi yang Anda pilih di perangkat Anda. Jika Anda memilih
folder cadangan, browser menyimpan izin ForkBuild untuk folder itu, dan
ForkBuild menyimpan folder itu dan, jika Anda memintanya, kunci yang
dibuat dari frasa sandi cadangan Anda yang hanya dapat membuat cadangan
(tidak pernah membukanya) di database IndexedDB terpisah
`forkbuild-backup`; kapan dan ke mana Anda terakhir mencadangkan disimpan
bersama data lainnya tetapi tidak disertakan dalam cadangan.

Di situs resmi, browser juga menyimpan berkas ForkBuild sendiri (kodenya,
stylesheet, ikon, dan bahasa yang Anda pakai) melalui service worker situs,
agar ForkBuild terbuka tanpa koneksi dan dapat dipasang sebagai aplikasi.
Berkas itu sama untuk semua orang dan tidak berisi apa pun milik Anda.
Apakah notifikasi di perangkat ini aktif disimpan bersama pengaturan Anda
(lihat "Notifikasi di perangkat ini" di bawah).

## Apa yang dapat dilihat orang lain

- **Apa pun yang Anda terbitkan** bersifat publik: isinya, judul,
  deskripsi, dan lisensinya, serta kunci publik identitas Anda yang
  menandatanganinya. Begitu orang lain memiliki salinannya, Anda tidak
  dapat menariknya kembali. Saat Anda mendistribusikannya ke Nostr atau Arweave, pengumumannya juga
  mencantumkan tagnya (sebagai `forkbuild-tag:<tag>`), sehingga siapa pun
  dapat menemukan bangunan dengan tag tertentu, seperti karya peserta
  tantangan suatu minggu.
- **Rekan yang terhubung dengan Anda** mengetahui kunci publik identitas
  Anda dan alamat IP Anda (koneksi langsung memerlukannya; relay TURN
  menyembunyikannya dari rekan tetapi tidak dari relay itu sendiri). Rekan
  yang terhubung dapat melihat avatar dan kehadiran Anda sesuai pengaturan
  visibilitasnya, termasuk kendaraan yang sedang Anda naiki (jenis dan
  id-nya, hanya dikirim saat kehadiran juga dikirim; tempat Anda
  meninggalkan kendaraan tidak pernah dikirim), dan teman Anda dapat
  mengirimi Anda pesan.
  Mereka juga menerima pengumuman Snapshot dan Penamaan Tempat yang telah
  ditemukan perangkat Anda, sehingga mereka mengetahui wilayah Dunia mana
  yang pernah Anda cari nama tempatnya (docs/AnnouncementIndex.md).
- **Rekan, untuk Dunia yang Anda bagikan.** **Bagikan dengan Rekan** di
  Repositori menawarkan salah satu Dunia terbitan Anda kepada semua orang
  yang terhubung dengan Anda sekarang dan siapa pun yang terhubung
  kemudian, termasuk orang asing dari lobi: mereka menerima daftarnya dan
  dapat mengambil Dunia itu sendiri dari perangkat Anda selama Anda
  terhubung. Perangkat Teman dan Rekan yang Dikenal mengambilnya dengan
  sendirinya; perangkat orang lain hanya saat mereka mengeklik **Ambil**.
  Dunia yang hanya Anda **Terbitkan** tidak pernah dikirim kepada siapa
  pun.
- **Teman yang berjalan bersama Anda.** Siapa pun yang membuka tautan
  **Jalan di sini bersamaku** yang Anda buat, selama tautan itu berfungsi,
  menerima Dunia tempat Anda berada (publikasi bertanda tangannya dan
  bangunannya, seperti yang dibawa tautan yang dibagikan) dan nama tampilan
  Anda, lalu terhubung dengan Anda sebagai rekan terhubung biasa: ia
  mengetahui alamat IP Anda dan melihat avatar serta kehadiran Anda sesuai
  pengaturan visibilitas Anda. Anda mengetahui miliknya dengan cara yang
  sama, beserta nama yang ia pakai berjalan.
- **Siapa pun, selama Anda berada di lobi publik.** Bergabung ke lobi
  publik (**Rekan**) atau lobi sebuah Dunia (**Lobi** di Tampilan Dunia)
  mencantumkan kunci publik identitas Anda dan nama tampilan yang Anda
  pilih, bagi siapa pun yang membuka lobi itu. Lobi sebuah Dunia juga
  memberi tahu mereka Dunia mana yang sedang Anda buka. Pencantuman Anda
  bertahan sampai Anda keluar, menutup aplikasi (kemudian hingga 10
  menit), atau kartunya kedaluwarsa. Pencantuman itu tidak memuat alamat
  jaringan, tetapi siapa pun di lobi dapat terhubung dengan Anda, dan
  orang asing yang terhubung menjadi rekan terhubung biasa: mereka
  mengetahui alamat IP Anda, melihat avatar dan kehadiran Anda sejauh
  yang diizinkan pengaturan visibilitas Anda, dan **bertukar pengumuman
  Snapshot dan Penamaan Tempat serta metadata publikasi dengan Anda,
  persis seperti rekan terhubung mana pun**, sebelum Anda Mengingat atau
  berteman dengan mereka. Obrolan dan suara tetap memerlukan pertemanan
  dua arah. **Blokir** di lobi menyembunyikan seseorang dari daftar lobi
  Anda dan memblokirnya seperti di halaman Rekan (kehadiran, profil,
  obrolan, dan permintaan pertemanan).

## Hitungan pengunjung

Sekali sehari, saat ForkBuild pertama kali dibuka di perangkat ini pada hari
kalender itu, situs resmi (`https://bowo-prasetyo.github.io/forkbuild/`)
memuat satu gambar kecil dari GoatCounter (`forkbuild.goatcounter.com`),
penghitung yang tidak memasang cookie. Hanya permintaan itu yang dikirim:

- **Yang diterima GoatCounter:** alamat IP Anda dan User-Agent browser
  Anda, seperti pada permintaan web mana pun, ditambah jalur tetap (`/`)
  dan angka acak yang mencegah gambar disimpan di cache. Tidak ada halaman,
  dokumen, Dunia, identitas, perujuk, atau apa pun yang disimpan ForkBuild
  yang ikut dikirim, jadi GoatCounter tidak dapat tahu apa yang Anda
  lakukan di aplikasi, bahkan halaman mana yang Anda buka.
- **Yang disimpannya:** hanya jumlah total, yaitu pengunjung per jam dan per
  hari, serta dari browser, sistem, negara, dan bahasa mana mereka datang,
  masing-masing dihitung terpisah sehingga tidak dapat dikaitkan satu sama
  lain. Kebijakan privasinya (<https://www.goatcounter.com/help/privacy>)
  menyatakan bahwa ia tidak pernah menyimpan alamat IP atau User-Agent
  lengkap: keduanya hanya disimpan di memori hingga 8 jam untuk mengenali
  kunjungan berulang, tanpa cookie.
- **Siapa pun dapat melihat jumlah totalnya** di dasbor publik,
  <https://forkbuild.goatcounter.com/>.

Penghitung yang sama juga diberi tahu tentang tiga momen saat membagikan
bangunan, masing-masing sebagai satu permintaan gambar lagi dengan jenis
yang sama, dengan jalur tetapnya sendiri:

- `/e/share-link`: tautan ke sebuah bangunan disalin atau dibagikan dengan
  **Salin tautan** atau **Bagikan…**;
- `/e/opened-shared-link`: tautan yang dibagikan membuka sebuah bangunan;
- `/e/remix-from-link`: bangunan yang dibuka dari tautan yang dibagikan
  disalin ke Editor (paling banyak sekali per bangunan setiap kali aplikasi
  dibuka).

Penghitung itu juga diberi tahu, dengan cara yang sama, saat ForkBuild
dipasang sebagai aplikasi (`/e/installed`).

Dengan cara yang sama, penghitung juga diberi tahu tentang bangunan yang
disematkan di halaman situs lain (lihat "Server yang dihubungi ForkBuild" di
bawah):

- `/e/embed-code`: kode sematan sebuah bangunan disalin dengan
  **Sematkan → Salin kode sematan**;
- `/e/embed-view`: bangunan yang disematkan ditampilkan di sebuah halaman;
- `/e/embed-open`: bangunan yang disematkan dibuka di ForkBuild dari halaman
  itu.

Dan saat seseorang ikut tantangan membangun mingguan (**Ikut tantangan**,
atau tantangan di **Baru** pada Editor): `/e/challenge-join`; dan saat seseorang membuka
alun-alun tantangan suatu minggu di Tampilan Dunia: `/e/plaza-visit`. Dan saat seseorang membuat tautan **Jalan di sini bersamaku** di Tampilan Dunia: `/e/walk-link`; dan saat seorang teman tiba lewat tautan itu: `/e/walk-joined`.

Dan saat sebuah bangunan pertama kali diterbitkan dari browser ini
(menerbitkannya lagi nanti tidak mengirim apa pun):

- ukurannya, sebagai salah satu dari lima rentang balok yang dipasang
  langsung, di luar struktur: `/e/publish-bricks-0`, `/e/publish-bricks-1`
  (1 sampai 9), `/e/publish-bricks-10` (10 sampai 49), `/e/publish-bricks-50`
  (50 sampai 199) atau `/e/publish-bricks-200` (200 atau lebih). Tidak pernah
  jumlah persisnya;
- `/e/second-build`, saat itu bangunan kedua yang diterbitkan dari browser
  ini, yang hanya terjadi sekali;
- `/e/remix-published`, saat itu salinan bangunan yang tidak diterbitkan
  browser ini.

Semua ini dihitung dari bangunan yang telah diterbitkan browser ini, yang
memang sudah disimpannya (lihat "Apa yang tetap di perangkat Anda"); tidak
ada yang baru disimpan untuk itu.

Dan saat ForkBuild dibuka lewat tautan dari salah satu postingan
peluncurannya sendiri, yang diakhiri `?ref=` dan nama tempat postingan itu
(`hn`, `producthunt`, `reddit`, `itch`, `nostr`, `steem`, `blurt`, `edu` atau `github`; nilai lain diabaikan): `/r/` dan nama itu, seperti
`/r/hn`, sekali. Aplikasi lalu menghapus `ref` dari alamat, sehingga memuat
ulang atau meneruskan alamat itu tidak mengirimnya lagi. Ini menunjukkan
postingan mana yang membawa orang, dan tidak ada apa pun tentang siapa
mereka atau apa yang mereka lakukan.

Masing-masing hanya mengirim jalurnya dan angka acak: tidak pernah
tautannya, bangunannya, judulnya, atau siapa pembuatnya. Bangunan mana yang
dibuka dari tautan hanya disimpan di memori halaman yang terbuka, dan
dilupakan saat halaman ditutup.

Tak satu pun dari permintaan ini pernah dikirim:

- saat browser Anda mengirim Global Privacy Control atau Do Not Track;
- saat Anda mematikan **Data Anda → Hitungan pengunjung harian → Hitung
  browser ini** (pilihan itu hanya disimpan di browser ini);
- dari salinan ForkBuild yang disajikan di tempat lain selain situs resmi,
  termasuk `localhost`.

Bangunan yang disematkan tidak dapat membaca pilihan **Hitung browser
ini**: ia tidak membuka penyimpanan apa pun, dan browser memang memisahkan
penyimpanan sebuah situs di dalam halaman situs lain. Jadi `/e/embed-view`
dan `/e/embed-open` hanya mengikuti dua aturan lainnya: tidak pernah dengan
Global Privacy Control atau Do Not Track, dan hanya dari situs resmi.

Kodenya ada di `core/VisitorCount.js`,
`core/LaunchChannel.js`, `application/settings/CountDailyVisit.js`,
`application/settings/CountLaunchChannel.js`,
`application/settings/FunnelEventCounter.js`, `ui/counterHit.js`,
`ui/start.js`, dan `ui/embed/embedBoot.js`.

## Server yang dihubungi ForkBuild

Setiap skrip, gaya, dan font berasal dari situs tempat aplikasi disajikan
(lihat [docs/Deployment.md](../../Deployment.md), bahasa Inggris). Ada satu
hal yang dimulai dengan sendirinya: sekitar 10 detik setelah aplikasi
dibuka, dan setiap beberapa menit selama tabnya terlihat, aplikasi membaca
pengumuman baru dari relay Nostr, gateway Arweave, serta node Steem dan Blurt yang
dikonfigurasi di **Pengaturan Jaringan** (docs/AnnouncementIndex.md).
Aplikasi hanya membaca pengumuman (penunjuk kecil dan klaim yang
ditandatangani), tidak pernah konten, dan tidak menerbitkan apa pun. Semua
hal lainnya hanya terjadi saat Anda memakai fiturnya, dan setiap server
dapat diubah di **Pengaturan Jaringan**. Setiap server melihat alamat IP
Anda dan apa yang Anda minta darinya.

| Kapan | Server (bawaan) | Apa yang diterimanya |
| --- | --- | --- |
| Aplikasi dibuka di situs resmi, paling banyak sekali sehari (lihat "Hitungan pengunjung") | GoatCounter (`forkbuild.goatcounter.com`) | satu permintaan gambar dengan jalur tetap, tanpa perujuk dan tanpa cookie |
| Di situs resmi, Anda menyalin atau membagikan tautan ke sebuah bangunan, membuka tautan yang dibagikan, atau menyalin bangunan yang dibuka dari tautan itu ke Editor (lihat "Hitungan pengunjung") | GoatCounter (`forkbuild.goatcounter.com`) | satu permintaan gambar dengan jalur tetap yang menyebut momen mana dari ketiganya, tanpa perujuk dan tanpa cookie |
| Anda memasang ForkBuild dari situs resmi (lihat "Hitungan pengunjung") | GoatCounter (`forkbuild.goatcounter.com`) | satu permintaan gambar dengan jalur tetap `/e/installed`, tanpa referrer dan tanpa cookie |
| Di situs resmi, Anda menyalin kode sematan sebuah bangunan, atau bangunan yang disematkan ditampilkan atau dibuka di ForkBuild (lihat "Hitungan pengunjung") | GoatCounter (`forkbuild.goatcounter.com`) | satu permintaan gambar dengan jalur tetap yang menyebut yang mana dari ketiganya, tanpa referrer dan tanpa cookie |
| Di situs resmi, Anda ikut tantangan membangun mingguan atau membuka alun-alunnya (lihat "Hitungan pengunjung") | GoatCounter (`forkbuild.goatcounter.com`) | satu permintaan gambar dengan jalur tetap `/e/challenge-join` atau `/e/plaza-visit`, tanpa referrer dan tanpa cookie |
| Di situs resmi, Anda membuat tautan **Jalan di sini bersamaku** atau tiba lewat tautan itu (lihat "Hitungan pengunjung") | GoatCounter (`forkbuild.goatcounter.com`) | satu permintaan gambar dengan jalur tetap `/e/walk-link` atau `/e/walk-joined`, tanpa perujuk dan tanpa cookie |
| Di situs resmi, Anda menerbitkan sebuah bangunan untuk pertama kali (lihat "Hitungan pengunjung") | GoatCounter (`forkbuild.goatcounter.com`) | satu permintaan gambar dengan jalur tetap yang menyebut rentang baloknya, dan satu lagi untuk bangunan kedua atau remix, tanpa referrer dan tanpa cookie |
| Anda membuka situs resmi lewat tautan postingan peluncuran (`?ref=…`, lihat "Hitungan pengunjung") | GoatCounter (`forkbuild.goatcounter.com`) | satu permintaan gambar dengan jalur tetap `/r/<saluran>`, tanpa referrer dan tanpa cookie |
| Anda menjadikan diri dapat ditemukan, atau mencari seseorang, di **Rekan** | server rendezvous (`forkbuild-rendezvous.prazjp.workers.dev`) | kunci publik identitas Anda dan tawaran koneksi, disimpan paling lama 15 menit; identitas yang Anda cari; saat Anda terhubung dengan seseorang yang Anda temukan, balasan koneksi Anda (berisi alamat jaringan Anda), yang hanya dapat diambil oleh orang itu |
| Anda bergabung ke, atau melihat ke dalam, lobi publik | server rendezvous yang sama | kartu lobi Anda yang ditandatangani (kunci publik, nama tampilan, lobi mana), disimpan paling lama 15 menit dan diperbarui selama Anda tetap di sana; lobi mana yang Anda lihat |
| Anda menyalin ke perangkat lain (**Data Anda** → **Salin ke perangkat lain**), atau membuka tautannya di perangkat lain | server rendezvous (`forkbuild-rendezvous.prazjp.workers.dev`) | kunci publik yang dibuat khusus untuk penyalinan ini (bukan milik identitas Anda) dan tawaran koneksi, disimpan paling lama 10 menit; dari perangkat lain, kunci itu dan balasan koneksinya. Yang disalin dikirim langsung antarperangkat, dienkripsi dengan kunci yang hanya ada di kode |
| Anda membuat tautan **Jalan di sini bersamaku** di Tampilan Dunia, atau membukanya | server rendezvous (`forkbuild-rendezvous.prazjp.workers.dev`) | kunci publik yang dibuat khusus untuk tautan ini (bukan kunci identitas Anda) dan sebuah tawaran koneksi, disimpan selama tautan berfungsi (paling lama 30 menit) dan ditawarkan lagi setelah tiap teman bergabung; dari seorang teman, kunci itu dan balasan koneksinya. Dunia, kedua nama, dan undangan yang menghubungkan kedua sesi rekan Anda berpindah langsung antarperangkat Anda |
| Koneksi rekan dimulai | server STUN (`stun.l.google.com`) | hanya permintaan alamat IP publik Anda |
| Anda memulai koneksi rekan, jika server rendezvous menawarkan relay | `/turn-credentials` pada server rendezvous, lalu relay TURN-nya (Cloudflare) | permintaan kredensial relay berumur pendek, paling sering sekitar sekali sejam; lalu lintas yang direlay dienkripsi ujung ke ujung oleh WebRTC |
| Aplikasi terbuka dan tabnya terlihat (sinkronisasi pengumuman di latar belakang) | relay Nostr (`relay.damus.io`), gateway Arweave (`arweave.net`), node Steem (`api.steemit.com`), node Blurt (`rpc.blurt.blog`) | kueri untuk tag penemuan ForkBuild: tag Snapshot dan Komentar bersama, serta wilayah Penamaan Tempat dan sel peta yang pernah Anda kunjungi |
| Anda membuka Repositori atau halaman pembuat | relay Nostr (`relay.damus.io`), gateway Arweave (`arweave.net`), node Steem (`api.steemit.com`), node Blurt (`rpc.blurt.blog`) | kueri untuk tag Publikasi bersama (`forkbuild-publication`); lalu permintaan catatan bertandatangan untuk setiap publikasi yang baru diumumkan, paling banyak 20 per kunjungan atau per **Periksa lagi** |
| Anda membuka tantangan membangun suatu minggu (**Tantangan**) | relay Nostr (`relay.damus.io`), gateway Arweave (`arweave.net`), node Steem (`api.steemit.com`), node Blurt (`rpc.blurt.blog`) | kueri untuk tag minggu itu (`forkbuild-tag:<tag>`); lalu permintaan rekaman bertanda tangan untuk setiap karya peserta yang baru diumumkan, paling banyak 20 per kunjungan atau **Periksa lagi** |
| Anda mendistribusikan atau menemukan publikasi melalui Nostr | relay Nostr (`relay.damus.io`) | pengumuman bertanda tangan yang Anda terbitkan; kueri Anda |
| Anda menyimpan atau mengambil konten di Arweave | gateway Arweave (`arweave.net`) | konten yang Anda terbitkan; apa yang Anda ambil |
| Anda mengambil konten dari IPFS | gateway IPFS (`ipfs.filebase.io`), atau node IPFS Anda sendiri (`127.0.0.1:5001`) | apa yang Anda ambil atau tambahkan |
| Anda mem-pin konten dengan layanan pinning jarak jauh (*eksperimental*) | layanan yang Anda masukkan | kontennya, dan token yang Anda ketik, yang hanya disimpan sampai halaman ditutup atau dimuat ulang (tidak pernah disimpan permanen); alamat layanan dan nama kolomnya disimpan di perangkat ini setelah Anda menyimpannya di **Penyedia Konten** |
| Anda menyimpan, mengumumkan, atau menjangkarkan di Steem, atau menemukan pengumuman Steem (*eksperimental*) | node API Steem (`api.steemit.com`, lalu `api.justyy.com`, lalu `steemd.steemworld.org`); penandatanganan melalui ekstensi Steem Keychain | nama akun Steem Anda; apa yang Anda posting (pengumuman, konten tersimpan, jangkar) bersifat publik di rantai untuk selamanya, dan suntingan meninggalkan versi sebelumnya dalam riwayatnya |
| Anda menyimpan, mengumumkan, atau menjangkarkan di Blurt, atau menemukan postingan Blurt (*eksperimental*) | node API Blurt (`rpc.blurt.blog`, lalu `rpc.beblurt.com`, lalu `rpc.drakernoise.com`); penandatanganan melalui ekstensi Blurt Keychain (atau WhaleVault) | nama akun Blurt Anda, dan akun-akun yang riwayat postingannya dibaca (yang Anda ikuti, dan setiap akun yang pernah dilihat perangkat ini memposting di bawah tag ForkBuild, yang diingat di perangkat ini); apa yang Anda posting bersifat publik di chain selamanya, di bawah akun Anda sendiri, dan suntingan meninggalkan versi sebelumnya di riwayatnya. Setiap transaksi membayar biaya kecil dalam BLURT dari akun Anda |
| Anda mendistribusikan Klaim Bertanda Tangan sebuah Publikasi di Blurt (*eksperimental*) | host gambar Blurt (`img-upload.blurt.blog`), secara langsung atau, bila peramban tidak dapat menjangkaunya, melalui relai `/blurt-image` server rendezvous, yang tidak menyimpan apa pun | gambar bangunan berukuran 320×200 untuk pratinjau postingan, ditandatangani dengan kunci posting Blurt Anda |
| Anda mendistribusikan Klaim Bertanda Tangan sebuah Publikasi di Steem (*eksperimental*) | host gambar Steem (`steemitimages.com`), secara langsung atau, bila peramban tidak dapat menjangkaunya, melalui relai `/steem-image` milik server rendezvous, yang tidak menyimpan apa pun | gambar bangunan berukuran 320×200 untuk pratinjau postingan, ditandatangani dengan kunci posting Steem Anda |
| Seseorang membuka, atau sebuah situs menampilkan pratinjau, tautan yang membawa bangunannya (`/b/…`) | server rendezvous (`forkbuild-rendezvous.prazjp.workers.dev`) | tautan itu, yang memuat bangunan dan Klaim Bertanda Tangannya; server tidak menyimpan apa pun |
| Seseorang membuka halaman yang berisi bangunan yang disematkan (`embed.html#…`) | situs tempat ForkBuild disajikan (`bowo-prasetyo.github.io`) | permintaan untuk berkas-berkas sematan, tanpa referrer; tidak pernah bangunannya, yang ada di bagian alamat yang tidak dikirim browser |
| Sebuah situs atau editor menanyakan cara menyematkan tautan `/b/…` (oEmbed) | `/oembed` milik server rendezvous (`forkbuild-rendezvous.prazjp.workers.dev`) | tautannya, yang memuat bangunan dan Klaim Bertanda Tangannya; server tidak menyimpan apa pun |
| Anda membuka tautan bersama ke sebuah Publikasi (`#/view/…`) | node Steem atau Blurt, gateway Arweave, atau gateway IPFS yang disebut tautan itu, lalu substrat pengumuman untuk menemukan bangunannya | postingan, transaksi, atau CID mana yang Anda buka |
| Anda menjangkarkan atau memverifikasi bukti di Bitcoin (*eksperimental*) | API Esplora (`blockstream.info`) | transaksi yang Anda siarkan atau cari |
| Anda memverifikasi bukti di Base (*eksperimental*) | endpoint JSON-RPC Base (`mainnet.base.org`) | transaksi yang Anda cari |
| Anda menghubungkan dompet browser (*eksperimental*) | ekstensi dompet yang Anda pilih | apa pun yang dimintanya untuk Anda setujui |

ForkBuild tidak pernah mengirim kunci privat, frasa sandi, atau dokumen
tersimpan Anda ke server mana pun di atas.

**Tautan yang membawa bangunannya** (dibuat dengan **Salin tautan** atau
**Bagikan…** sebelum bangunan didistribusikan) memuat Dunia Bersama Anda
yang bertanda tangan dan bangunan itu sendiri. Tautan itu mengarah ke server
rendezvous (`forkbuild-rendezvous.prazjp.workers.dev/b/…`) agar aplikasi
obrolan dan media sosial dapat menampilkan judul bangunan dan gambarnya:
membuka tautan, atau situs yang menampilkan pratinjaunya, mengirim tautan
itu, beserta bangunannya, ke server tersebut, yang memeriksa tanda tangan,
menggambar gambarnya, mengarahkan orang ke aplikasi (`#/s/…`, bagian alamat
yang tidak pernah dikirim browser ke server), dan tidak menyimpan apa pun.
Cloudflare, yang menjalankan server itu, mungkin mencatat alamat yang
diminta. Membuat tautan tidak menghubungi apa pun. Siapa pun yang memegang
tautan itu dapat melihat bangunannya, judul, deskripsi, dan nama pembuatnya,
serta kunci publik identitas Anda, seperti pada Dunia Bersama mana pun yang
Anda distribusikan.

**Bangunan yang disematkan** (kode yang disalin **Sematkan**: sebuah
`<iframe>` dari `embed.html#…` di situs tempat ForkBuild disajikan) memuat
hal yang sama: Dunia Bersama Anda yang ditandatangani dan bangunannya.
Halaman tempat kode itu ditempel memuat sematan dari situs tersebut, yang
tidak mengetahui bangunannya (ada di bagian alamat yang tidak pernah dikirim
browser ke server) maupun halaman di sekitarnya (bingkainya tidak mengirim
referrer). Di browser pembaca, sematan memeriksa tanda tangan dan
bangunannya, menampilkannya, dan tidak menyimpan apa pun; ia tidak memulai
satu pun koneksi aplikasi, jadi tidak ada rekan, relay, atau jaringan lain
yang dihubungi. Siapa pun yang dapat melihat halaman itu dapat melihat
bangunannya, sama seperti dengan tautannya.

**Relay hanya dipakai bila diperlukan.** Koneksi selalu mencoba jalur
langsung terlebih dahulu, lalu jalur yang ditemukan melalui STUN, dan
beralih ke relay TURN hanya jika keduanya tidak berhasil. Selama Anda
menunggu di lobi, tawaran yang disiapkan perangkat Anda tidak pernah
meminta kredensial relay, jadi berada di lobi tidak menghabiskan jatah
relay yang dibagikan server rendezvous setiap bulan; orang yang terhubung
dengan Anda yang memintanya, jika mereka membutuhkannya.

## Notifikasi di perangkat ini

Jika Anda mengaktifkan **Beri tahu saya di perangkat ini** (di panel 🔔),
perangkat Anda menampilkan sendiri notifikasi baru Anda selama ForkBuild
terbuka di tab latar belakang atau sebagai aplikasi terpasang. Tidak ada
layanan push yang dipakai dan tidak ada yang dikirim ke mana pun untuk itu:
halaman yang terbuka menyerahkan notifikasi ke browser Anda, yang
menampilkannya melalui sistem operasi Anda. Teks notifikasi (misalnya judul
bangunan dan nama pembuatnya) kemudian dapat tersimpan di riwayat
notifikasi perangkat Anda, seperti notifikasi aplikasi apa pun. Matikan di
panel yang sama, atau blokir notifikasi ForkBuild di pengaturan situs
browser.

## Jika Anda menjalankan salinan sendiri

Sebuah deployment menentukan nilai bawaan di atas: server rendezvous-nya
(`peer/RendezvousConfig.js`), apakah server itu menawarkan relay TURN
(`server/rendezvous-worker/README.md`), dan nilai bawaan lainnya di
**Pengaturan Jaringan**. Server rendezvous bawaan hanya menerima origin
situs resmi, jadi salinan yang di-host di tempat lain memerlukan server
sendiri (lihat [docs/Deployment.md](../../Deployment.md), bahasa Inggris).
Jika Anda meng-host ForkBuild untuk orang lain, perbarui halaman ini
(termasuk versi bahasa Inggrisnya) agar menyebutkan server Anda.

Hitungan pengunjung hanya berjalan di situs resmi, jadi salinan yang
di-host di tempat lain tidak menghitung apa pun. Untuk menghitung pengunjung
Anda sendiri, ubah alamat di `core/VisitorCount.js` dan entri `img-src` di
Content Security Policy `index.html`.
