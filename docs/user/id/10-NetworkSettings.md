<!-- translation-of: docs/user/10-NetworkSettings.md source-hash: 16855c5d4fae8108 -->
# 10 — Pengaturan Jaringan

<!-- languages -->
[English](../10-NetworkSettings.md) · [Deutsch](../de/10-NetworkSettings.md) · [Español](../es/10-NetworkSettings.md) · **Bahasa Indonesia** · [日本語](../ja/10-NetworkSettings.md)
<!-- /languages -->

**Pengaturan Jaringan**, di bilah atas, menautkan setiap halaman yang
mengatur server mana yang dihubungi ForkBuild. Kebanyakan orang tidak
pernah perlu mengubah apa pun di sini: nilai bawaannya langsung berfungsi.
Datanglah ke sini saat sebuah server mati, saat Anda menjalankan server
sendiri, atau untuk memilih di mana publikasi Anda disimpan dan
diumumkan.

Untuk apa yang diketahui setiap server tentang Anda, lihat
[Privasi](Privacy.md).

## Halaman-halamannya

| Halaman | Rute | Apa yang diaturnya |
|---|---|---|
| **Penyedia Konten** | `/settings/content-provider` | Tempat **Simpan di …** dan **Gunakan Penyedia Pilihan** menyimpan konten baru, dan node IPFS tujuannya — lihat [di bawah](#penyedia-konten) |
| **Penyedia Pengumuman / Penemuan** | `/settings/announcement-discovery-provider` | Ke mana pengumuman Anda dikirim secara bawaan: Nostr, Arweave, atau Steem — lihat [di bawah](#penyedia-pengumuman--penemuan) |
| **Penyedia Bukti / Penjangkaran** *(eksperimental)* | `/settings/anchor-provider` | Tempat **Jangkarkan di …** menjangkarkan — lihat [di bawah](#penyedia-bukti--penjangkaran) |
| **Gateway Arweave** | `/settings/arweave-gateway` | Gateway untuk membaca konten Arweave — lihat [di bawah](#gateway-arweave) |
| **Gateway IPFS** | `/settings/ipfs-gateway` | Gateway untuk membaca konten IPFS — lihat [di bawah](#gateway-ipfs) |
| **Endpoint Bitcoin** *(eksperimental)* | `/settings/bitcoin-esplora` | Layanan yang dipakai penjangkaran Bitcoin — lihat [di bawah](#endpoint-bitcoin) |
| **Relay Nostr** | `/settings/nostr-relay` | Relay untuk menerbitkan dan menemukan melalui Nostr — lihat [di bawah](#relay-nostr) |
| **Steem** *(eksperimental)* | `/settings/steem` | Akun Steem Anda, dan dari mana Steem dibaca — lihat [di bawah](#steem) |
| **Server STUN** / **Server TURN** | `/settings/stun`, `/settings/turn-server` | Bantuan untuk koneksi rekan — lihat [TURN](07-PeerConnectionsAndFriends.md#turn-me-relay-koneksi-rekan-yang-tidak-menemukan-jalur-langsung) |
| **Server Rendezvous** | `/settings/rendezvous` | Cara rekan saling menemukan — lihat [Koneksi Rekan & Teman](07-PeerConnectionsAndFriends.md) |

## Perilaku setiap halaman

- **Muat ulang setelah menyimpan.** Perubahan berlaku saat aplikasi dimuat
  berikutnya (akun Steem adalah satu-satunya pengecualian). Tampilan Dunia
  atau Editor yang sedang terbuka tetap memakai pengaturan lama sampai
  Anda memuat ulang.
- Setiap halaman memiliki tombol **Simpan** sendiri. Penyimpanan yang gagal
  menampilkan alasannya dan membiarkan pengaturan sebelumnya seperti
  semula; yang berhasil menampilkan "Tersimpan."
- Daftar pilihan ditampilkan dalam urutan abjad.
- **Daftar server dilengkapi nilai bawaan.** Halaman Gateway Arweave,
  Gateway IPFS, Endpoint Bitcoin, Relay Nostr, Steem, STUN, dan Rendezvous
  dimulai dengan beberapa server publik gratis, sehingga semuanya tetap
  berfungsi saat salah satunya mati. Halaman itu menyebutkan apakah sedang
  "Menggunakan … bawaan" atau "Menggunakan … yang Anda simpan". Jika belum
  ada yang disimpan, kotak teksnya berisi nilai bawaan, satu per baris,
  siap disunting. **Simpan** tetap nonaktif sampai Anda mengubah sesuatu,
  sehingga Anda terus mendapatkan nilai bawaan yang lebih baik dari versi
  berikutnya. **Kembalikan ke Bawaan** menghapus daftar Anda.
- **Validasi hanya memeriksa format.** Simpan menolak apa pun yang bukan
  URL berbentuk benar dari jenis yang tepat, tetapi tidak memeriksa apakah
  servernya berfungsi; server yang salah baru terlihat nanti sebagai
  pembacaan yang gagal.
- **Nilai bawaan adalah layanan pihak ketiga.** Masing-masing melihat
  alamat IP Anda dan apa yang diminta aplikasi darinya. Konten yang dibaca
  melalui gateway dicocokkan dengan hash kontennya, sehingga gateway tidak
  dapat menukarnya dengan byte yang berbeda.

## Penyedia Konten

Pilih penyimpanan tempat **Simpan di …** (tombol pertama di blok
**Konten** sebuah publikasi) dan **Gunakan Penyedia Pilihan** membuat
Penempatan Snapshot (lihat
[Menggunakan penyedia pilihan](11-EvidenceAndStorage.md#menggunakan-penyedia-pilihan)),
dari backend yang terdaftar di perangkat ini, lalu klik **Simpan**.
**Lokal** tidak ditawarkan, karena setiap publikasi sudah tersimpan di
perangkat ini.

**IPFS (Pinning Jarak Jauh)** selalu ditawarkan. Memilihnya membuat Pinning
Jarak Jauh terpilih sebagai penyimpanan di setiap dialog **Distribusikan**;
Anda tetap mengetik endpoint dan kredensialnya setiap kali. Tombol penyedia
pilihan tidak dapat memakai Pinning Jarak Jauh: jika itu yang disimpan,
blok **Konten** menampilkan setiap backend alih-alih **Simpan di …**, dan
**Gunakan Penyedia Pilihan** melaporkan **Penyedia pilihan tidak
ditemukan**.

Bagian kedua, **Node IPFS**, mengatur node tujuan penempatan IPFS baru.
Bawaannya adalah node Kubo lokal di `http://127.0.0.1:5001`. Masukkan URL
API node lain lalu **Simpan**, atau **Gunakan Bawaan Deployment** untuk
kembali. Pengaturan ini tidak memengaruhi pembacaan konten IPFS, yang
memakai daftar [Gateway IPFS](#gateway-ipfs).

## Penyedia Pengumuman / Penemuan

Pilih **Arweave**, **Nostr**, atau **Steem** (eksperimental) sebagai tempat
bawaan untuk mengumumkan publikasi Anda (Dunia Bersama, Atribusi Cetak
Biru, dan klaim nama tempat), Snapshot, dan komentar. Ini hanya bawaan:
setiap dialog **Distribusikan**, pemilih Distribusi per kartu di
Repositori, dan pemilih jaringan di samping **Kirim Komentar** dimulai
dari pilihan ini, dan Anda dapat menggantinya untuk satu tindakan.
Mencari konten orang lain selalu menelusuri ketiganya.

## Penyedia Bukti / Penjangkaran

*Eksperimental.* Pilih tempat **Jangkarkan di …** (tombol pertama di blok
**Bukti / Penjangkaran** sebuah publikasi) membuat bukti eksternal:
**Arweave**, **Bitcoin**, atau **Steem**, mana pun yang terdaftar di
perangkat ini. Base tidak pernah ditawarkan, karena setiap jangkar Base
mengharuskan Anda meninjau dan menandatangani transaksi dompet. Jika
Bitcoin yang dipilih, tidak ada tombol **Jangkarkan di …**: blok itu
menampilkan setiap pilihan dan menunjuk ke langkah-langkah dompet; lihat
[Alur Jangkar Bitcoin](11-EvidenceAndStorage.md#alur-jangkar-bitcoin)
untuk jangkar Bitcoin sungguhan.

## Gateway Arweave

Gateway untuk membaca konten Arweave, satu URL `http://` atau `https://`
per baris. Bawaannya adalah `https://arweave.net`, `https://ardrive.net`,
dan `https://permagate.io`.

Gateway dicoba secara berurutan: pembacaan pindah ke gateway berikutnya
hanya jika gateway saat ini tidak dapat dijangkau atau mengembalikan
kesalahan. Konten Arweave dialamatkan dengan id transaksinya, jadi setiap
gateway mengembalikan byte yang sama.

Daftar ini dipakai saat mengambil materi publikasi dari sumber
terdesentralisasi dan saat menyelesaikan atau mewujudkan Penempatan
Snapshot Arweave. Daftar ini tidak mengubah tempat konten Anda sendiri
diunggah. Jangkar Arweave memakai gateway pertama dalam daftar untuk
membuat dan memverifikasi.

## Gateway IPFS

Gateway untuk membaca konten IPFS, satu URL per baris, dicoba secara
berurutan seperti milik Arweave. Bawaannya adalah `https://ipfs.io`,
`https://dweb.link`, `https://4everland.io`, dan
`https://ipfs.filebase.io`.

Daftar ini dipakai saat menyelesaikan atau mewujudkan Penempatan Snapshot
IPFS, untuk **Verifikasi Konten IPFS**, dan untuk membuka tautan bersama ke
konten di IPFS. Daftar ini tidak mengubah tempat konten Anda sendiri
di-pin.

Beberapa gateway, termasuk `https://ipfs.io`, memblokir permintaan
otomatis dari sebagian orang di balik pemeriksaan bot; gateway bawaan
lainnya dijalankan oleh operator yang berbeda, jadi pembacaan beralih ke
sana. Jika **Verifikasi** atau **Selesaikan** terus gagal dengan "Failed to
fetch" untuk konten yang Anda tahu ada, tambahkan gateway penyedia pinning
Anda (misalnya `https://gateway.pinata.cloud`) di bagian paling atas.

## Endpoint Bitcoin

*Eksperimental.* API yang kompatibel dengan Esplora yang dipakai
penjangkaran Bitcoin untuk menyiarkan transaksi, memeriksa konfirmasi,
mencari dana dompet, dan memverifikasi bukti OP_RETURN sebuah jangkar. Satu
URL `http://` atau `https://` per baris; bawaannya adalah
`https://blockstream.info/api` dan `https://mempool.space/api`.

Pencarian memakai endpoint pertama yang menjawab. Penyiaran pindah ke
endpoint berikutnya hanya jika endpoint sebelumnya tidak dapat dijangkau,
tidak pernah setelah ada yang menolak transaksinya.

## Relay Nostr

Relay untuk semua yang diterbitkan atau ditemukan ForkBuild melalui Nostr:
publikasi (Dunia Bersama, Atribusi Cetak Biru, dan klaim nama tempat),
Snapshot, dan komentar. Satu URL `ws://` atau `wss://` per baris;
bawaannya adalah `wss://relay.damus.io`, `wss://nos.lol`, dan
`wss://relay.primal.net`. **Simpan** mengganti seluruh daftar, dan
menolaknya jika ada baris yang bukan URL yang valid.

Tidak seperti gateway, relay tidak dicoba secara berurutan: pengumuman
dikirim ke setiap relay sekaligus dan penemuan menanyai setiap relay,
sehingga setiap relay tambahan membuat konten Anda dapat ditemukan lebih
banyak orang bahkan saat relay lain mati. Tidak ada status per relay di
sini; hasil **Distribusikan** mencantumkan satu baris **Penemuan** per
relay.

## Steem

*Eksperimental.* Atur **Akun Steem Anda** di bawah **Memposting** (ini
langsung berlaku, tanpa memuat ulang), yang diperlukan untuk memposting
atau menyimpan di Steem — lihat
[Steem](11-EvidenceAndStorage.md#steem). Membaca dari Steem tidak
memerlukan akun. Sisa halamannya mengatur dari mana Steem dibaca:

- **Node API**, satu URL `https://` per baris (bawaan
  `https://api.steemit.com` dan `https://api.justyy.com`), dicoba secara
  berurutan.
- **Akun utas**, satu per baris (bawaan `forkbuild`): utas penemuan
  bulanan milik siapa yang dibaca. Tambahkan yang lain jika sebuah
  komunitas menjalankan utasnya sendiri.
- **Bulan pertama yang dibaca** (bawaan September 2026): ForkBuild membaca
  setiap bulan dari sana sampai sekarang, hingga 36 bulan terakhir.

Saat tidak ada node Steem yang dapat dijangkau, **Periksa komentar baru**
dan penemuan Snapshot menyebutkan Steem tidak tersedia, alih-alih
melaporkan bahwa tidak ada yang ditemukan.
