<!-- translation-of: docs/Privacy.md source-hash: 5b1a4648b8c09240 -->
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

- bangunan Anda, salinan pemulihan dari perubahan yang belum disimpan, dan
  struktur yang disimpan;
- identitas Anda: kunci publik masing-masing, dan kunci privatnya, yang
  dienkripsi dengan frasa sandi Anda kecuali Anda memilih membuatnya tanpa
  frasa sandi;
- kunci pembawa yang mengirim bangunan Anda ke semua orang (kunci Nostr, dibuat pertama kali Anda memilih **Semua orang** di **Siapa yang bisa menemukannya?**). Kunci ini bukan identitas Anda dan tidak menandatangani apa pun milik Anda: siapa pun yang memilikinya hanya bisa mengirim catatan yang diperiksa setiap pembaca dengan tanda tangan identitas Anda sendiri;
- jawaban Anda untuk **Siapa yang bisa menemukannya?**;
- identitas yang dibuat hanya dengan nama, saat pertama kali menerbitkan
  atau berjalan bersama, tidak memiliki frasa sandi sampai Anda
  menambahkannya di **Identitas Saya**, jadi apa pun yang dapat membaca
  penyimpanan situs ini dapat menandatangani sebagai identitas itu;
- rekan yang dikenal, teman, orang yang Anda ikuti, blokir, riwayat
  obrolan, dan pesan yang diantrekan (tidak ada yang diberi tahu bahwa
  Anda mengikutinya, dan tidak ada informasi tentang mengikuti yang pernah
  dikirim);
- profil avatar Anda (jika Anda menjelajahi Tampilan Dunia sebelum memilih
  nama, Anda adalah tamu: avatar itu tidak disimpan di mana pun, bahkan di
  sini, dan tidak pernah dikirim ke siapa pun), pengaturan (termasuk apakah Tampilan Dunia
  memutar suara, seberapa keras, dalam 3D atau stereo, dan dengan atau tanpa musik, apakah Tampilan
  Dunia menampilkan alat lanjutannya, apakah di sana selalu siang, apakah matahari dan bulan menimbulkan bayangan di sana, ke mana Terbitkan mengirim bangunan Anda, bahasa yang
  Anda pilih, dan apakah tampilannya terang, gelap, atau mengikuti perangkat; jika Anda belum memilih, ForkBuild membaca bahasa pilihan
  browser di perangkat dan tidak mengirimnya ke mana pun), serta nama
  pengguna dan kredensial server TURN jika Anda memasukkannya di
  **Pengaturan Jaringan**;
- apakah browser ini ikut dalam hitungan pengunjung harian, dan hari
  terakhir browser ini dihitung;
- publikasi orang lain yang telah ditemukan dan diverifikasi perangkat ini,
  dari rekan, tautan, Tampilan Dunia, atau pencarian Jelajahi di
  jaringan, dan, untuk yang ditemukan di jaringan, tempat catatan
  bertandatangan masing-masing dibaca;
- ID publikasi yang Anda batalkan penerbitannya di perangkat ini, agar
  pencarian Jelajahi di jaringan tidak mencantumkan lagi salinan yang
  pernah Anda distribusikan.
- jaringan mana saja yang menerima setiap komentar Anda dari perangkat ini,
  dan kapan, agar setiap komentar bisa menunjukkan ke mana ia dikirim.
- untuk setiap minggu tantangan membangun yang Anda buka, ID karya peserta
  yang ditemukan di jaringan, agar halamannya menampilkannya lagi sebelum
  mencari.
- bangunan mana yang diketahui perangkat ini ada di relay Nostr sebagai
  catatan bangunan (milik Anda, begitu sebuah relay menerima catatannya, dan
  milik orang lain yang dibukanya dari catatan), agar bisa dibagikan dengan
  tautan pendek.
- untuk setiap bangunan yang Anda mulai dengan **Bangun di sini**, Dunia dan
  tempat yang Anda pilih, agar saat diterbitkan bangunan itu berdiri di
  sana.
- untuk setiap bangunan yang dimulai dari struktur siap pakai atau sebagai
  salinan bangunan, dan untuk setiap struktur siap pakai yang ditambahkan,
  balok apa saja dan di mana letaknya, agar saat menerbitkan balok yang Anda
  pasang bisa dibedakan dari balok awal (hanya rentangnya yang dihitung).
- untuk setiap identitas, bangunan tempat seorang teman mencantumkannya saat
  kalian membangunnya bersama (**Bangun bersamaku**): judul setiap bangunan,
  nama dan identitas pembuatnya, dan kapan, untuk **Bangunan yang Anda bantu
  buat** di Dunia Saya dan di halaman pembangun Anda sendiri. Daftar ini
  disimpan di bawah identitas yang dimiliki bersama oleh perangkat-perangkat
  Anda, dan selama perangkat Anda yang lain terhubung (perangkat yang
  diotorisasi dari identitas yang sama) keduanya saling memberikan
  daftarnya; daftar ini tidak pernah dikirim ke perangkat orang lain. Cap
  Anda di
  Beranda dihitung dari apa yang sudah tercantum di sini dan tidak disimpan.

Menghapus data situs ini di browser akan menghapus semuanya, dan tidak ada
salinan lain maupun cara untuk memulihkannya. Cadangkan terlebih dahulu
dengan **Data Anda → Cadangkan ke File**: file itu berisi semua hal di
atas kecuali nama mana yang sedang Anda pakai, dienkripsi dengan frasa
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
  Setelah Anda memilih ke mana bangunan Anda dikirim, setiap Terbitkan juga mengirim bangunan ke sana; sampai saat itu, Terbitkan tidak mengirim apa pun.
- **Siapa yang bisa menemukannya?** ditanyakan sebelum Anda menerbitkan pertama kali. Dengan **Semua orang**, setiap bangunan bertanda tangan yang Anda terbitkan juga dikirim utuh ke relay Nostr publik di **Pengaturan Jaringan** sebagai catatan bangunan (docs/Protocol.md, "Build notes", bahasa Inggris), bersama tag dan tempatnya di Dunia, agar siapa pun yang memakai ForkBuild menemukannya di Jelajahi, di tantangan, dan di Dunia. Catatan itu ditandatangani dengan kunci pembawa perangkat ini, bukan identitas Anda. Relay menyimpan apa yang dikirim kepadanya; catatan tidak bisa ditarik kembali. Dengan **Hanya orang yang saya kirimi tautannya**, tidak ada yang dikirim dan bangunan hanya berpindah lewat tautannya. Pilihan ini diingat di perangkat ini dan bisa diubah dari pesan setelah Terbitkan.
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
  Jelajahi menawarkan salah satu Dunia terbitan Anda kepada semua orang
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
- **Teman yang membangun bersama Anda.** Siapa pun yang membuka tautan
  **Bangun bersamaku** yang Anda buat, selama tautan itu berfungsi,
  terhubung dengan Anda dengan cara yang sama dan menerima nama tampilan
  Anda, judul bangunan, dan, begitu Editor-nya memintanya, bangunan itu
  sendiri, lalu setiap perubahan yang dibuat salah satu dari kalian pada
  bangunan itu, ke mana penunjuk Anda mengarah, dan apa yang Anda pilih,
  selama kalian membangun bersama. Ia tetap menyimpan salinannya. Anda
  mengetahui alamat IP-nya, nama yang ia pakai membangun, dan ke mana ia
  menunjuk dengan cara yang sama. Setiap teman yang perubahannya diterima
  bangunan Anda dicantumkan di bangunan itu, dengan nama yang ia pakai
  membangun dan kunci publik identitasnya, dan saat Anda menerbitkannya,
  pencantuman itu menjadi bagian dari publikasi bertanda tangannya, yang
  dapat dibaca siapa pun yang melihat bangunan itu (halaman yang dibuka
  tautan **Bangun bersamaku** menyebutkannya sebelum ia bergabung). Selama
  kalian membangun bersama, salinan setiap orang mengikuti daftar itu,
  sehingga setiap teman melihat siapa lagi yang dicantumkan.
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
  bangunan, Dunia, identitas, perujuk, atau apa pun yang disimpan ForkBuild
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

Penghitung yang sama juga diberi tahu tentang momen-momen ini saat membagikan
bangunan, masing-masing sebagai satu permintaan gambar lagi dengan jenis
yang sama, dengan jalur tetapnya sendiri:

- `/e/share-link`: tautan ke sebuah bangunan disalin atau dibagikan dengan
  **Salin tautan** atau **Bagikan…**;
- `/e/share-link-short`: tautan itu tautan pendek (`/n/…`), dihitung di
  samping `/e/share-link`, tidak pernah menggantikannya;
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
alun-alun tantangan suatu minggu di Tampilan Dunia: `/e/plaza-visit`. Dan setiap kali tampilan dunia dibuka: `/e/world-visit`; dan, sekali per kunjungan, saat bangunan milik orang lain terlihat di sana (bangunan yang tidak diterbitkan dan tidak bisa diedit perangkat ini; bangunan siap pakai di sekeliling alun-alun tidak dihitung): `/e/world-neighbour`. Dan, paling banyak sekali setiap kali ForkBuild dibuka, saat seseorang yang belum punya nama berjalan-jalan di sana sebagai tamu: `/e/guest-walk`; tidak ada yang dikirim tentang ke mana ia berjalan. Dan, paling banyak sekali setiap kali ForkBuild dibuka, saat Editor dibuka: `/e/editor-open`; saat bangunan siap pakai dibuka di sana sebagai salinan milik Anda sendiri dari tautan di **Beranda** atau halaman tantangan: `/e/starter-open`; dan saat Anda membuat perubahan pertama di sana: `/e/editor-edit`. Tidak satu pun menyebut bangunan mana atau apa yang diubah. Dan, paling banyak sekali setiap kali ForkBuild dibuka, saat seseorang memakai salah satu sistem sampingan: berenang (`/e/swam`), menangkap hewan (`/e/animal-caught`), menghias bangunan dengan hewan (`/e/animal-decorated`), membawa sesuatu, hewan atau kendaraan yang disimpan (`/e/inventory-used`), mengirim pesan obrolan (`/e/chat-sent`), membuat atau menjawab panggilan suara (`/e/voice-call`), atau bergabung ke lobi publik (`/e/lobby-joined`). Tidak satu pun menyebut apa yang ditangkap, dikatakan, dipanggil, atau diikuti. Dan saat seseorang membuat tautan **Jalan di sini bersamaku** di Tampilan Dunia: `/e/walk-link`; dan saat seorang teman tiba lewat tautan itu: `/e/walk-joined`. Dan saat seseorang membuat tautan **Bangun bersamaku** di Editor: `/e/build-link`; dan saat seorang teman bergabung lewat tautan itu: `/e/build-joined`; dan pertama kali sebuah bangunan diterbitkan dengan mencantumkan teman-teman yang membangunnya bersama: `/e/publish-together`. Dan setiap kali sebuah bangunan diterbitkan: `/e/publish-found` jika dikirim ke semua orang, atau `/e/publish-link-only` jika hanya lewat tautannya.

Dan saat sebuah bangunan pertama kali diterbitkan dari browser ini
(menerbitkannya lagi nanti tidak mengirim apa pun):

- ukurannya, sebagai salah satu dari lima rentang balok yang dipasang
  langsung, di luar struktur: `/e/publish-bricks-0`, `/e/publish-bricks-1`
  (1 sampai 9), `/e/publish-bricks-10` (10 sampai 49), `/e/publish-bricks-50`
  (50 sampai 199) atau `/e/publish-bricks-200` (200 atau lebih). Tidak pernah
- lima rentang yang sama untuk balok yang dipasang atau diubah pembuatnya,
  tanpa balok siap pakai yang menjadi awalnya atau yang ditambahkan ke
  dalamnya: `/e/publish-placed-0` sampai `/e/publish-placed-200`;
  jumlah persisnya;
- `/e/second-build`, saat itu bangunan kedua yang diterbitkan dari browser
  ini, yang hanya terjadi sekali;
- `/e/remix-published`, saat itu salinan bangunan yang tidak diterbitkan
  browser ini.

Semua ini dihitung dari bangunan yang telah diterbitkan browser ini, yang
memang sudah disimpannya (lihat "Apa yang tetap di perangkat Anda"); untuk balok yang dipasang, juga catatan balok yang menjadi awal setiap bangunan, disimpan di sampingnya di perangkat ini dan tidak pernah dikirim.

Dan saat ForkBuild dibuka lewat tautan dari salah satu postingan
peluncurannya sendiri, yang diakhiri `?ref=` dan nama tempat postingan itu
(`hn`, `producthunt`, `reddit`, `itch`, `nostr`, `steem`, `blurt`, `edu`, `gamejolt`, `indiedb`, `youtube` atau `github`; nilai lain diabaikan): `/r/` dan nama itu, seperti
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
ditandatangani), tidak pernah konten, dan tidak menerbitkan apa pun. Catatan
bangunan, yang membawa bangunan utuh, hanya dibaca saat Anda membuka
Jelajahi, halaman pembuat, tantangan, atau alun-alunnya (lihat tabel). Semua
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
| Di situs resmi, Anda membuka tampilan dunia, dan bangunan milik orang lain terlihat di sana (lihat "Hitungan pengunjung") | GoatCounter (`forkbuild.goatcounter.com`) | satu permintaan gambar dengan jalur tetap `/e/world-visit`, dan paling banyak satu dengan `/e/world-neighbour` per kunjungan, tanpa referrer dan tanpa cookie |
| Di situs resmi, Anda berjalan-jalan di tampilan dunia sebelum memilih nama (lihat "Hitungan pengunjung") | GoatCounter (`forkbuild.goatcounter.com`) | paling banyak satu permintaan gambar dengan jalur tetap `/e/guest-walk` setiap kali ForkBuild dibuka, tanpa referrer dan tanpa cookie |
| Di situs resmi, Anda membuka Editor, membuka bangunan siap pakai di sana dari **Beranda** atau tantangan, atau membuat perubahan di sana (lihat "Hitungan pengunjung") | GoatCounter (`forkbuild.goatcounter.com`) | paling banyak satu permintaan gambar setiap kali ForkBuild dibuka untuk masing-masing, dengan jalur tetapnya (`/e/editor-open`, `/e/starter-open`, `/e/editor-edit`), tanpa referrer dan tanpa cookie |
| Di situs resmi, Anda berenang, menangkap hewan, menghias bangunan dengan hewan, membawa sesuatu, mengirim pesan obrolan, membuat atau menjawab panggilan suara, atau bergabung ke lobi publik (lihat "Hitungan pengunjung") | GoatCounter (`forkbuild.goatcounter.com`) | paling banyak satu permintaan gambar per pemuatan halaman untuk masing-masing, dengan jalur tetapnya (`/e/swam`, `/e/animal-caught`, `/e/animal-decorated`, `/e/inventory-used`, `/e/chat-sent`, `/e/voice-call`, `/e/lobby-joined`), tanpa referrer dan tanpa cookie |
| Di situs resmi, Anda membuat tautan **Jalan di sini bersamaku** atau tiba lewat tautan itu (lihat "Hitungan pengunjung") | GoatCounter (`forkbuild.goatcounter.com`) | satu permintaan gambar dengan jalur tetap `/e/walk-link` atau `/e/walk-joined`, tanpa perujuk dan tanpa cookie |
| Di situs resmi, Anda membuat tautan **Bangun bersamaku** atau bergabung lewat tautan itu (lihat "Hitungan pengunjung") | GoatCounter (`forkbuild.goatcounter.com`) | satu permintaan gambar dengan jalur tetap `/e/build-link` atau `/e/build-joined` (dan `/e/publish-together` saat bangunan yang dibuat bersama pertama kali diterbitkan dengan mencantumkan mereka), tanpa perujuk dan tanpa cookie |
| Di situs resmi, Anda menerbitkan sebuah bangunan untuk pertama kali (lihat "Hitungan pengunjung") | GoatCounter (`forkbuild.goatcounter.com`) | satu permintaan gambar dengan jalur tetap yang menyebut rentang baloknya, dan satu lagi untuk bangunan kedua atau remix, tanpa referrer dan tanpa cookie |
| Anda membuka situs resmi lewat tautan postingan peluncuran (`?ref=…`, lihat "Hitungan pengunjung") | GoatCounter (`forkbuild.goatcounter.com`) | satu permintaan gambar dengan jalur tetap `/r/<saluran>`, tanpa referrer dan tanpa cookie |
| Anda menjadikan diri dapat ditemukan, atau mencari seseorang, di **Rekan** | server rendezvous (`forkbuild-rendezvous.prazjp.workers.dev`) | kunci publik identitas Anda dan tawaran koneksi, disimpan paling lama 15 menit; identitas yang Anda cari; saat Anda terhubung dengan seseorang yang Anda temukan, balasan koneksi Anda (berisi alamat jaringan Anda), yang hanya dapat diambil oleh orang itu |
| Anda bergabung ke, atau melihat ke dalam, lobi publik | server rendezvous yang sama | kartu lobi Anda yang ditandatangani (kunci publik, nama tampilan, lobi mana), disimpan paling lama 15 menit dan diperbarui selama Anda tetap di sana; lobi mana yang Anda lihat |
| Anda menyalin ke perangkat lain (**Data Anda** → **Salin ke perangkat lain**), atau membuka tautannya di perangkat lain | server rendezvous (`forkbuild-rendezvous.prazjp.workers.dev`) | kunci publik yang dibuat khusus untuk penyalinan ini (bukan milik identitas Anda) dan tawaran koneksi, disimpan paling lama 10 menit; dari perangkat lain, kunci itu dan balasan koneksinya. Yang disalin dikirim langsung antarperangkat, dienkripsi dengan kunci yang hanya ada di kode |
| Anda membuat tautan **Jalan di sini bersamaku** di Tampilan Dunia, atau membukanya | server rendezvous (`forkbuild-rendezvous.prazjp.workers.dev`) | kunci publik yang dibuat khusus untuk tautan ini (bukan kunci identitas Anda) dan sebuah tawaran koneksi, masing-masing disimpan paling lama 10 menit dan ditawarkan baru selama tautan berfungsi (paling lama 30 menit) dan setelah tiap teman bergabung; dari seorang teman, kunci itu dan balasan koneksinya. Dunia, kedua nama, dan undangan yang menghubungkan kedua sesi rekan Anda berpindah langsung antarperangkat Anda |
| Anda membuat tautan **Bangun bersamaku** di Editor, atau membukanya | server rendezvous yang sama | sama seperti untuk **Jalan di sini bersamaku**. Judul bangunan, kedua nama, undangan, bangunan itu, dan setiap perubahannya berpindah langsung antarperangkat Anda |
| Koneksi rekan dimulai | server STUN (`stun.l.google.com`) | hanya permintaan alamat IP publik Anda |
| Anda memulai koneksi rekan, jika server rendezvous menawarkan relay | `/turn-credentials` pada server rendezvous, lalu relay TURN-nya (Cloudflare) | permintaan kredensial relay berumur pendek, paling sering sekitar sekali sejam; lalu lintas yang direlay dienkripsi ujung ke ujung oleh WebRTC |
| Aplikasi terbuka dan tabnya terlihat (sinkronisasi pengumuman di latar belakang) | relay Nostr (`relay.damus.io`), gateway Arweave (`arweave.net`), node Steem (`api.steemit.com`), node Blurt (`rpc.blurt.blog`) | kueri untuk tag penemuan ForkBuild: tag Snapshot dan Komentar bersama, serta wilayah Penamaan Tempat dan sel peta yang pernah Anda kunjungi |
| Anda membuka Jelajahi atau halaman pembuat | relay Nostr (`relay.damus.io`), gateway Arweave (`arweave.net`), node Steem (`api.steemit.com`), node Blurt (`rpc.blurt.blog`) | kueri untuk tag Publikasi bersama (`forkbuild-publication`); lalu permintaan catatan bertandatangan untuk setiap publikasi yang baru diumumkan, paling banyak 20 per kunjungan atau per **Periksa lagi** |
| Anda membuka tantangan membangun suatu minggu (**Tantangan**) | relay Nostr (`relay.damus.io`), gateway Arweave (`arweave.net`), node Steem (`api.steemit.com`), node Blurt (`rpc.blurt.blog`) | kueri untuk tag minggu itu (`forkbuild-tag:<tag>`); lalu permintaan rekaman bertanda tangan untuk setiap karya peserta yang baru diumumkan, paling banyak 20 per kunjungan atau **Periksa lagi** |
| Anda menerbitkan bangunan setelah memilih **Semua orang** di **Siapa yang bisa menemukannya?** | setiap relay Nostr di **Pengaturan Jaringan** (`relay.damus.io`, `nos.lol`, `relay.primal.net`) | catatan bangunan: bangunan bertanda tangan itu sendiri, tag-nya, dan penempatan bertanda tangan dari penerbitnya, ditandatangani dengan kunci pembawa perangkat ini |
| Anda membuka Jelajahi, halaman seseorang, tantangan suatu minggu, atau alun-alunnya | setiap relay Nostr di **Pengaturan Jaringan** | kueri catatan bangunan (`forkbuild-build`, atau `forkbuild-tag:<tag>` minggu itu); setiap catatan baru diperiksa dan dibuka di perangkat ini, paling banyak 40 per kunjungan |
| Anda mendistribusikan atau menemukan publikasi melalui Nostr | relay Nostr (`relay.damus.io`) | pengumuman bertanda tangan yang Anda terbitkan; kueri Anda |
| Anda menyimpan atau mengambil konten di Arweave | gateway Arweave (`arweave.net`) | konten yang Anda terbitkan; apa yang Anda ambil |
| Anda mengambil konten dari IPFS | gateway IPFS (`ipfs.filebase.io`), atau node IPFS Anda sendiri (`127.0.0.1:5001`) | apa yang Anda ambil atau tambahkan |
| Anda mem-pin konten dengan layanan pinning jarak jauh (*eksperimental*) | layanan yang Anda masukkan | kontennya, dan token yang Anda ketik, yang hanya disimpan sampai halaman ditutup atau dimuat ulang (tidak pernah disimpan permanen); alamat layanan dan nama kolomnya disimpan di perangkat ini setelah Anda menyimpannya di **Penyedia Konten** |
| Anda menyimpan, mengumumkan, atau menjangkarkan di Steem, atau menemukan pengumuman Steem (*eksperimental*) | node API Steem (`api.steemit.com`, lalu `api.justyy.com`, lalu `steemd.steemworld.org`); penandatanganan melalui ekstensi Steem Keychain | nama akun Steem Anda; apa yang Anda posting (pengumuman, konten tersimpan, jangkar) bersifat publik di rantai untuk selamanya, dan suntingan meninggalkan versi sebelumnya dalam riwayatnya |
| Anda menyimpan, mengumumkan, atau menjangkarkan di Blurt, atau menemukan postingan Blurt (*eksperimental*) | node API Blurt (`rpc.blurt.blog`, lalu `rpc.beblurt.com`, lalu `rpc.drakernoise.com`); penandatanganan melalui ekstensi Blurt Keychain (atau WhaleVault) | nama akun Blurt Anda, dan akun-akun yang riwayat postingannya dibaca (yang Anda ikuti, dan setiap akun yang pernah dilihat perangkat ini memposting di bawah tag ForkBuild, yang diingat di perangkat ini); apa yang Anda posting bersifat publik di chain selamanya, di bawah akun Anda sendiri, dan suntingan meninggalkan versi sebelumnya di riwayatnya. Setiap transaksi membayar biaya kecil dalam BLURT dari akun Anda |
| Anda mendistribusikan Klaim Bertanda Tangan sebuah Publikasi di Blurt (*eksperimental*) | host gambar Blurt (`img-upload.blurt.blog`), secara langsung atau, bila peramban tidak dapat menjangkaunya, melalui relai `/blurt-image` server rendezvous, yang tidak menyimpan apa pun | gambar bangunan berukuran 320×200 untuk pratinjau postingan, ditandatangani dengan kunci posting Blurt Anda |
| Anda mendistribusikan Klaim Bertanda Tangan sebuah Publikasi di Steem (*eksperimental*) | host gambar Steem (`steemitimages.com`), secara langsung atau, bila peramban tidak dapat menjangkaunya, melalui relai `/steem-image` milik server rendezvous, yang tidak menyimpan apa pun | gambar bangunan berukuran 320×200 untuk pratinjau postingan, ditandatangani dengan kunci posting Steem Anda |
| Seseorang membuka, atau sebuah situs menampilkan pratinjau, tautan yang membawa bangunannya (`/b/…`) | server rendezvous (`forkbuild-rendezvous.prazjp.workers.dev`) | tautan itu, yang memuat bangunan dan Klaim Bertanda Tangannya; server tidak menyimpan apa pun |
| Seseorang membuka, atau sebuah situs menampilkan pratinjau, tautan pendek ke bangunan yang dikirim ke semua orang (`/n/…`) | server rendezvous (`forkbuild-rendezvous.prazjp.workers.dev`), yang meminta catatan bangunan itu ke relay Nostr (`relay.damus.io`, `nos.lol`, `relay.primal.net`) | tautan itu, yang menyebut Publikasi bangunan; server tidak menyimpan apa pun, dan Cloudflare menyimpan halaman dan gambar bangunan yang ditemukan di cache selama sehari |
| Anda membuka tautan pendek (`#/n/…`) | setiap relay Nostr di **Pengaturan Jaringan** | kueri untuk catatan bangunan itu saja (`forkbuild-build:<id>`); yang terbaru yang lolos pemeriksaan dibuka di perangkat ini |
| Seseorang membuka halaman yang berisi bangunan yang disematkan (`embed.html#…`) | situs tempat ForkBuild disajikan (`bowo-prasetyo.github.io`) | permintaan untuk berkas-berkas sematan, tanpa referrer; tidak pernah bangunannya, yang ada di bagian alamat yang tidak dikirim browser |
| Sebuah situs atau editor menanyakan cara menyematkan tautan `/b/…` (`/n/…`) (oEmbed) | `/oembed` milik server rendezvous (`forkbuild-rendezvous.prazjp.workers.dev`) | tautannya, yang memuat bangunan dan Klaim Bertanda Tangannya; server tidak menyimpan apa pun |
| Anda membuka tautan bersama ke sebuah Publikasi (`#/view/…`) | node Steem atau Blurt, gateway Arweave, atau gateway IPFS yang disebut tautan itu, lalu substrat pengumuman untuk menemukan bangunannya | postingan, transaksi, atau CID mana yang Anda buka |
| Anda menjangkarkan atau memverifikasi bukti di Bitcoin (*eksperimental*) | API Esplora (`blockstream.info`) | transaksi yang Anda siarkan atau cari |
| Anda memverifikasi bukti di Base (*eksperimental*) | endpoint JSON-RPC Base (`mainnet.base.org`) | transaksi yang Anda cari |
| Anda menghubungkan dompet browser (*eksperimental*) | ekstensi dompet yang Anda pilih | apa pun yang dimintanya untuk Anda setujui |

ForkBuild tidak pernah mengirim kunci privat, frasa sandi, atau bangunan
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

**Tautan pendek** (ditawarkan sebagai gantinya begitu bangunan dikirim ke
semua orang, lihat **Siapa yang bisa menemukannya?** di atas) hanya berisi ID
Publikasi bangunan itu (`forkbuild-rendezvous.prazjp.workers.dev/n/…`). Membukanya, atau situs yang menampilkan
pratinjaunya, mengirim ID itu ke server rendezvous, yang meminta catatan
bangunan itu ke relay Nostr publik, memeriksanya seperti tautan yang
membawa bangunannya, menggambar gambarnya, mengarahkan orang ke aplikasi
(`#/n/…`), dan tidak menyimpan apa pun; lalu aplikasi meminta catatan itu
sendiri ke relay. Bangunan itu sudah publik di relay tersebut, dan itulah
yang diandalkan tautan pendek: tautan berhenti berfungsi jika tidak ada
relay yang menyimpan catatannya. Bangunan yang hanya untuk tautannya tidak
pernah mendapatkannya.

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
