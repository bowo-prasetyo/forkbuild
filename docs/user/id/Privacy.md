<!-- translation-of: docs/Privacy.md source-hash: 91943196a1dbc4fd -->
# Privasi

<!-- languages -->
[English](../../Privacy.md) · [Deutsch](../de/Privacy.md) · **Bahasa Indonesia** · [日本語](../ja/Privacy.md)
<!-- /languages -->

ForkBuild tidak memiliki akun dan tidak memakai analitik. ForkBuild
menyimpan pekerjaan Anda di browser Anda sendiri dan berkomunikasi dengan
komputer lain hanya untuk fitur yang memerlukannya. Halaman ini mencantumkan
apa yang disimpannya, serta setiap server yang dapat dihubunginya dan
kapan.

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
- rekan yang dikenal, teman, orang yang Anda ikuti, blokir, riwayat
  obrolan, dan pesan yang diantrekan (tidak ada yang diberi tahu bahwa
  Anda mengikutinya, dan tidak ada informasi tentang mengikuti yang pernah
  dikirim);
- profil avatar Anda, pengaturan (termasuk apakah Tampilan Dunia
  memutar suara, seberapa keras, dalam 3D atau stereo, dan bahasa yang
  Anda pilih; jika Anda belum memilih, ForkBuild membaca bahasa pilihan
  browser di perangkat dan tidak mengirimnya ke mana pun), serta nama
  pengguna dan kredensial server TURN jika Anda memasukkannya di
  **Pengaturan Jaringan**.

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

## Apa yang dapat dilihat orang lain

- **Apa pun yang Anda terbitkan** bersifat publik: isinya, judul,
  deskripsi, dan lisensinya, serta kunci publik identitas Anda yang
  menandatanganinya. Begitu orang lain memiliki salinannya, Anda tidak
  dapat menariknya kembali.
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

## Server yang dihubungi ForkBuild

Setiap skrip, gaya, dan font berasal dari situs tempat aplikasi disajikan
(lihat [docs/Deployment.md](../../Deployment.md), bahasa Inggris). Ada satu
hal yang dimulai dengan sendirinya: sekitar 10 detik setelah aplikasi
dibuka, dan setiap beberapa menit selama tabnya terlihat, aplikasi membaca
pengumuman baru dari relay Nostr, gateway Arweave, dan node Steem yang
dikonfigurasi di **Pengaturan Jaringan** (docs/AnnouncementIndex.md).
Aplikasi hanya membaca pengumuman (penunjuk kecil dan klaim yang
ditandatangani), tidak pernah konten, dan tidak menerbitkan apa pun. Semua
hal lainnya hanya terjadi saat Anda memakai fiturnya, dan setiap server
dapat diubah di **Pengaturan Jaringan**. Setiap server melihat alamat IP
Anda dan apa yang Anda minta darinya.

| Kapan | Server (bawaan) | Apa yang diterimanya |
| --- | --- | --- |
| Anda menjadikan diri dapat ditemukan, atau mencari seseorang, di **Rekan** | server rendezvous (`forkbuild-rendezvous.prazjp.workers.dev`) | kunci publik identitas Anda dan tawaran koneksi, disimpan paling lama 15 menit; identitas yang Anda cari; saat Anda terhubung dengan seseorang yang Anda temukan, balasan koneksi Anda (berisi alamat jaringan Anda), yang hanya dapat diambil oleh orang itu |
| Anda bergabung ke, atau melihat ke dalam, lobi publik | server rendezvous yang sama | kartu lobi Anda yang ditandatangani (kunci publik, nama tampilan, lobi mana), disimpan paling lama 15 menit dan diperbarui selama Anda tetap di sana; lobi mana yang Anda lihat |
| Koneksi rekan dimulai | server STUN (`stun.l.google.com`) | hanya permintaan alamat IP publik Anda |
| Anda memulai koneksi rekan, jika server rendezvous menawarkan relay | `/turn-credentials` pada server rendezvous, lalu relay TURN-nya (Cloudflare) | permintaan kredensial relay berumur pendek, paling sering sekitar sekali sejam; lalu lintas yang direlay dienkripsi ujung ke ujung oleh WebRTC |
| Aplikasi terbuka dan tabnya terlihat (sinkronisasi pengumuman di latar belakang) | relay Nostr (`relay.damus.io`), gateway Arweave (`arweave.net`), node Steem (`api.steemit.com`) | kueri untuk tag penemuan ForkBuild: tag Snapshot dan Komentar bersama, serta wilayah Penamaan Tempat dan sel peta yang pernah Anda kunjungi |
| Anda mendistribusikan atau menemukan publikasi melalui Nostr | relay Nostr (`relay.damus.io`) | pengumuman bertanda tangan yang Anda terbitkan; kueri Anda |
| Anda menyimpan atau mengambil konten di Arweave | gateway Arweave (`arweave.net`) | konten yang Anda terbitkan; apa yang Anda ambil |
| Anda mengambil konten dari IPFS | gateway IPFS (`ipfs.io`), atau node IPFS Anda sendiri (`127.0.0.1:5001`) | apa yang Anda ambil atau tambahkan |
| Anda mem-pin konten dengan layanan pinning jarak jauh (*eksperimental*) | layanan yang Anda masukkan | kontennya, dan token yang Anda ketik untuk satu unggahan itu (tidak pernah disimpan) |
| Anda menyimpan, mengumumkan, atau menjangkarkan di Steem, atau menemukan pengumuman Steem (*eksperimental*) | node API Steem (`api.steemit.com`, lalu `api.justyy.com`); penandatanganan melalui ekstensi Steem Keychain | nama akun Steem Anda; apa yang Anda posting (pengumuman, konten tersimpan, jangkar) bersifat publik di rantai untuk selamanya, dan suntingan meninggalkan versi sebelumnya dalam riwayatnya |
| Anda mendistribusikan Klaim Bertanda Tangan sebuah Publikasi di Steem (*eksperimental*) | host gambar Steem (`steemitimages.com`) | gambar bangunan berukuran 320×200 untuk pratinjau postingan, ditandatangani dengan kunci posting Steem Anda |
| Anda membuka tautan bersama ke sebuah Publikasi (`#/view/…`) | node Steem, gateway Arweave, atau gateway IPFS yang disebut tautan itu, lalu substrat pengumuman untuk menemukan bangunannya | postingan, transaksi, atau CID mana yang Anda buka |
| Anda menjangkarkan atau memverifikasi bukti di Bitcoin (*eksperimental*) | API Esplora (`blockstream.info`) | transaksi yang Anda siarkan atau cari |
| Anda memverifikasi bukti di Base (*eksperimental*) | endpoint JSON-RPC Base (`mainnet.base.org`) | transaksi yang Anda cari |
| Anda menghubungkan dompet browser (*eksperimental*) | ekstensi dompet yang Anda pilih | apa pun yang dimintanya untuk Anda setujui |

ForkBuild tidak pernah mengirim kunci privat, frasa sandi, atau dokumen
tersimpan Anda ke server mana pun di atas.

**Relay hanya dipakai bila diperlukan.** Koneksi selalu mencoba jalur
langsung terlebih dahulu, lalu jalur yang ditemukan melalui STUN, dan
beralih ke relay TURN hanya jika keduanya tidak berhasil. Selama Anda
menunggu di lobi, tawaran yang disiapkan perangkat Anda tidak pernah
meminta kredensial relay, jadi berada di lobi tidak menghabiskan jatah
relay yang dibagikan server rendezvous setiap bulan; orang yang terhubung
dengan Anda yang memintanya, jika mereka membutuhkannya.

## Jika Anda menjalankan salinan sendiri

Sebuah deployment menentukan nilai bawaan di atas: server rendezvous-nya
(`peer/RendezvousConfig.js`), apakah server itu menawarkan relay TURN
(`server/rendezvous-worker/README.md`), dan nilai bawaan lainnya di
**Pengaturan Jaringan**. Server rendezvous bawaan hanya menerima origin
situs resmi, jadi salinan yang di-host di tempat lain memerlukan server
sendiri (lihat [docs/Deployment.md](../../Deployment.md), bahasa Inggris).
Jika Anda meng-host ForkBuild untuk orang lain, perbarui halaman ini
(termasuk versi bahasa Inggrisnya) agar menyebutkan server Anda.
