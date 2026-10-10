<!-- translation-of: docs/user/ControlsReference.md source-hash: ac00224cc1d8ef6a -->
# Referensi Kontrol

<!-- languages -->
[English](../ControlsReference.md) · [Deutsch](../de/ControlsReference.md) · [Español](../es/ControlsReference.md) · [Français](../fr/ControlsReference.md) · **Bahasa Indonesia** · [日本語](../ja/ControlsReference.md) · [한국어](../ko/ControlsReference.md) · [Português (Brasil)](../pt-BR/ControlsReference.md)
<!-- /languages -->

Setiap interaksi mouse dan keyboard di ForkBuild; ponsel dan tablet
dibahas di [Layar sentuh](#layar-sentuh). Tampilan Dunia adalah untuk
melihat-lihat dan bernavigasi; setiap kontrol membangun (pemilihan untuk
mengedit, transformasi, grup, papan klip, penempatan, dan Palet Perintah)
hanya berfungsi di Editor. Pintasan Editor sama dengan yang tercantum di
Palet Perintah dan daftar **⌨ Pintasan** — jika halaman ini dan palet
berbeda, palet yang benar dan halaman ini mengandung kesalahan.

Buka **Palet Perintah** dengan `Ctrl/Cmd+K` di Editor untuk mencari setiap
operasi pengeditan di bawah ini berdasarkan nama.

## Kamera (kedua tampilan)

| Masukan | Tindakan |
|---|---|
| Seret kiri di ruang kosong | Orbit |
| Seret kanan | Geser (pan) |
| Roda gulir | Zoom |
| `Home` | Editor: atur ulang kamera (diabaikan selama gizmo sedang diseret). Tampilan Dunia: kembalikan kamera dan avatar ke dunia Anda sendiri saat ini — lihat [Tampilan Dunia](03-WorldView.md#orientasi-dan-lokasi) |

## Perintah (hanya Editor)

| Masukan | Tindakan |
|---|---|
| `Ctrl/Cmd+K` | Palet Perintah |
| `?` | Daftar Pintasan Keyboard (juga dapat dibuka dari tombol "⌨ Pintasan" di bilah alat) — setiap pintasan Editor |

## Penemuan (Tampilan Dunia)

Bukan pintasan keyboard, melainkan cara Tampilan Dunia sendiri untuk
menemukan sesuatu — lihat
[Tampilan Dunia](03-WorldView.md#menemukan-dunia) untuk
penjelasan lengkapnya.

| Kontrol | Tindakan |
|---|---|
| Panel pencarian, **Cari** | Mencari publikasi berdasarkan judul/pembuat, secara opsional dalam radius dari suatu koordinat |
| **Jelajahi di Sini** | Membuka dialog Jelajahi Lokasi yang berpusat pada posisi kamera saat ini |
| **Ada Apa di Sini?** | Sama, dengan radius tetap yang kecil — "apa yang ada tepat di sini" |
| **Fokus** pada sebuah hasil | Menerbangkan kamera ke sana dan menjadikannya dokumen aktif (yang sedang diedit) |
| **Pilih** pada sebuah hasil | Menjadikannya dokumen aktif, tanpa memindahkan kamera |
| **Periksa** pada sebuah hasil | Membuka ringkasan baca-saja di tempat |

## Orientasi & Navigasi (Tampilan Dunia)

Murni navigasi kamera — tidak satu pun memuat dokumen, mengubah pilihan,
atau mengedit apa pun. Lihat
[Tampilan Dunia](03-WorldView.md#orientasi-dan-lokasi).

| Kontrol | Tindakan |
|---|---|
| Indikator kompas | Arah hadap baca-saja dengan penanda kontekstual untuk struktur dan bentang alam di dekat Anda |
| **Beranda** | Mengembalikan kamera dan avatar ke dunia Anda sendiri saat ini (kembali ke titik asal bersama jika Anda belum memfokuskan salah satu dunia Anda di sesi ini) — lihat [Tampilan Dunia](03-WorldView.md#orientasi-dan-lokasi) |
| **Lokasi** | Membuka daftar Dunia, strukturnya, penanda, dan tempat-tempatnya, masing-masing dengan tombol **Fokus** |
| **?** | Menampilkan atau menyembunyikan kontrol kamera dan berjalan |
| 🔔 **Notifikasi** (kepala aplikasi, setiap halaman) | Membuka **Riwayat Notifikasi** Anda — catatan baca-saja, bukan tindakan kamera; lihat [Tampilan Dunia](03-WorldView.md#orientasi-dan-lokasi) |
| **Kamera**: Bebas / Orang Pertama / Orang Ketiga / Pandangan Burung | Mengunci kamera pada jarak tetap dari avatar Anda sendiri alih-alih menerbangkannya sendiri; klik yang aktif sekali lagi untuk kembali ke Bebas — lihat [Avatar & Kehadiran](06-AvatarsAndPresence.md#sudut-pandang-kamera) |

### Deskripsi lokasi kontekstual

Saat Anda bergerak di dunia, antarmuka menampilkan konteks turunan
seperti:

- "**Hutan · dekat House**" — Anda berada di hutan, dalam jarak 50 unit
  dari sebuah struktur
- "**Padang Rumput · sungai**" — medan terbuka di tepi sungai
- "**Padang Rumput · danau · dekat Barn**" — medan, air, dan struktur
  terdekat

Deskripsi ini dihitung dari posisi Anda, ekologi medan, hidrologi, dan
penempatan struktur — tidak ada yang disimpan di dunia.

## Suara (kedua tampilan)

| Masukan | Tindakan | Catatan |
|---|---|---|
| `M` | Mematikan atau menyalakan suara | Sama dengan tombol **Suara**; satu pengaturan untuk kedua tampilan, diingat di perangkat ini. Lihat [Tampilan Dunia](03-WorldView.md#suara) dan [Editor](02-TheEditor.md#suara) |

## Gerakan Avatar (Tampilan Dunia)

Menjalankan avatar Anda secara langsung, alih-alih menerbangkan kamera —
lihat [Avatar & Kehadiran](06-AvatarsAndPresence.md#menjalankan-avatar-anda).

| Masukan | Tindakan | Catatan |
|---|---|---|
| `W` / `A` / `S` / `D` | Bergerak / berbelok | Terhalang oleh bangunan, pohon, satwa liar, dan penghuni di dekatnya, sama seperti dinding |
| `Shift` (ditahan) | Berlari | |
| `Space` | Melompat | Di air dalam: berenang naik |
| `C` (ditahan) | Menyelam | Hanya di air yang cukup dalam untuk berenang |
| `Alt` + `W` / `S` | Mulai berjalan terus maju/mundur | Tetap bergerak setelah tombol dilepas; ketukan `W`/`S` biasa tanpa Alt membatalkannya |
| `Alt` + `Shift` + `W` / `S` | Mulai berlari terus maju/mundur | Aturan pembatalan sama seperti di atas |

## Kendaraan (Tampilan Dunia)

Lihat [Avatar & Kehadiran](06-AvatarsAndPresence.md#kendaraan). Memerlukan Mode Kendali Avatar (**Kendalikan Avatar Saya**);
petunjuk muncul otomatis saat Anda cukup dekat dengan kendaraan untuk
menaikinya.

| Masukan | Tindakan | Catatan |
|---|---|---|
| `E` | Menaiki kendaraan terdekat, atau turun dari kendaraan yang sedang dinaiki | Hanya ditampilkan/aktif saat ada kendaraan dalam jangkauan atau Anda sedang menaikinya |
| `W` / `S` | Mempercepat / mundur | Menggantikan berjalan kaki selama menaiki kendaraan |
| `A` / `D` | Membelokkan kendaraan, bersama Anda di atasnya | Belokan halus dan berkelanjutan; hanya saat kendaraan bergerak |
| `←` / `→` (tekan) | Membelokkan kendaraan ke kiri/kanan, bersama Anda di atasnya | Satu belokan 45° per tekan — menahan tombol tidak membuatnya terus berbelok |
| `Ctrl` (ditahan) | Mengerem | |
| `Q` (saat menaiki) | Menyimpan kendaraan yang dinaiki ke inventaris | Menghapusnya dari dunia; sekaligus menurunkan Anda |
| `Q` (tidak menaiki, membawa kendaraan) | Mengeluarkan kendaraan tersimpan yang sedang dipilih | Memunculkan dan menaikinya di posisi Anda saat ini; bawaannya yang terakhir disimpan |
| `[` / `]` (membawa 2+ kendaraan) | Mengganti pilihan kendaraan yang akan dikeluarkan ke yang lebih lama / lebih baru | Hanya mengubah mana yang akan dikeluarkan `Q` berikutnya — tidak pernah menaiki atau menghapus apa pun dengan sendirinya |

## Hewan (Tampilan Dunia)

Lihat [Avatar & Kehadiran](06-AvatarsAndPresence.md#hewan). Memerlukan Mode Kendali Avatar; petunjuk muncul otomatis saat ada
hewan yang dapat ditangkap di dekat Anda atau Anda sedang membawanya.

| Masukan | Tindakan | Catatan |
|---|---|---|
| `F` (dekat hewan yang dapat ditangkap) | Menangkapnya | Menambahkannya ke inventaris dan menghapusnya dari dunia |
| `F` (tidak dekat hewan yang dapat ditangkap, sedang membawa hewan) | Melepaskan hewan yang terakhir ditangkap | Memunculkannya di posisi Anda saat ini, dapat ditangkap lagi |
| `G` (dekat hewan yang Anda lepaskan) | Menghiasi Dunia dengannya | Menyimpannya ke dalam konten Dunia sebagai hiasan — tidak dapat ditangkap lagi; memerlukan akses EDIT. Petunjuk muncul saat `G` dapat melakukan sesuatu |
| `G` (dekat hiasan hewan, tidak ada hewan yang dilepaskan di dekatnya) | Mengurungkan hiasan | Menghapusnya dari Dunia dan mengubahnya kembali menjadi hewan hidup yang dapat ditangkap |

## Penghuni (Tampilan Dunia)

Lihat [Avatar & Kehadiran](06-AvatarsAndPresence.md#penghuni). Memerlukan Mode Kendali Avatar; tombol **Tambahkan Penghuni di
Sini** / **Hapus Penghuni** dan **Bicara** di bagian Avatar melakukan hal
yang sama tanpanya.

| Masukan | Tindakan | Catatan |
|---|---|---|
| `R` (di tanah terbuka, tidak ada penghuni tepat di samping Anda) | Menambahkan penghuni yang rumahnya di tempat Anda berdiri | Disimpan ke dalam konten Dunia; memerlukan akses EDIT. Tidak bisa di atap, di air, atau saat berkendara |
| `R` (di samping penghuni) | Menghapusnya dari Dunianya | Petunjuk menampilkan **[R] Hapus Penghuni**; urungkan dengan `Ctrl/Cmd+Z` |
| `T` (di samping penghuni) | Bicara: penghuni memberi tahu apa yang ada di sekitar | Ditampilkan dalam gelembung di atas kepalanya; bicara lagi untuk hal lain. Tombol **Bicara** di bagian Avatar dan di pad sentuh melakukan hal yang sama |
| Tombol **Fokus: …** (selama ucapan penghuni ditampilkan) | Melihat apa yang disebutkannya | Hanya kamera; avatar Anda tetap di tempat. Ditawarkan untuk penanda, struktur, bangunan, dan kendaraan |

Inventaris Anda, kendaraan yang ditempatkan, dan hewan yang dilepaskan
disimpan di perangkat ini dan tetap ada setelah dimuat ulang — lihat
[Avatar & Kehadiran](06-AvatarsAndPresence.md#apa-yang-tetap-ada-setelah-dimuat-ulang).

## Pemilihan (Editor; mengeklik balok di Tampilan Dunia hanya memeriksanya)

| Masukan | Tindakan | Catatan |
|---|---|---|
| Klik sebuah balok | Memilihnya (menggantikan pilihan) | di Tampilan Dunia ini hanya membuka panel Pemeriksaan — lihat [Tampilan Dunia](03-WorldView.md#tampilan-dunia-hanya-dapat-dilihat--membangun-dilakukan-di-editor) |
| `Shift`-klik | Menambahkan balok ke pilihan | |
| `Ctrl/Cmd`-klik | Memasukkan/mengeluarkan balok dari pilihan | |
| `Shift`-seret | Pilih dengan kotak (menggantikan pilihan) | `Ctrl/Cmd+Shift`-seret menambah ke pilihan; seret biasa mengorbit kamera |
| `Ctrl/Cmd+A` | Pilih Semua | |
| `Esc` | Hapus Pilihan | Urutan Escape milik Editor sendiri, di bawah — Escape di Tampilan Dunia hanya menutup panel mana pun yang sedang terbuka |
| `Delete` / `Backspace` | Hapus Pilihan — **hanya Editor** | satu langkah urung; tidak ada tombol yang terikat sama sekali di Tampilan Dunia |
| Tombol **Fokus** di panel Pilihan — **hanya Editor** | Membingkai kamera pada balok yang dipilih, seketika | tanpa pintasan keyboard; hanya kamera — tidak pernah menyentuh dokumen, pilihan, atau riwayat urung; hanya untuk pilihan balok, bukan penempatan struktur |

## Transformasi — keyboard (hanya Editor)

| Masukan | Tindakan |
|---|---|
| `→` / `←` | Memindahkan pilihan sepanjang sumbu X dunia |
| `↑` / `↓` | Memindahkan pilihan sepanjang sumbu Z dunia |
| `PgUp` / `PgDn` | Memindahkan pilihan sepanjang sumbu Y dunia |
| `R` | Memutar +90° di sekitar poros pilihan |
| `Shift+R` | Memutar −90° |
| `T` | Rebahkan setiap balok terpilih ke sisi berikutnya, alasnya tetap |
| `Shift+T` | Miringkan ke arah sebaliknya |
| `Shift` saat menyeret gizmo | Mode presisi (kelipatan 0,1×) |

## Transformasi — gizmo (hanya Editor)

| Masukan | Tindakan |
|---|---|
| Arahkan penunjuk ke pegangan | Menyorotnya |
| Seret pegangan sumbu (X merah / Y hijau / Z biru) | Memindahkan sepanjang sumbu itu (dengan snapping) |
| Seret bantalan tengah (kuning tua) | Memindahkan bebas di bidang tanah |
| Seret cincin rotasi (ungu) | Memutar di sekitar poros (dengan snapping) |
| Lepaskan | Menerapkan — tepat satu langkah urung |
| `Esc` di tengah seretan | Membatalkan — tidak ada yang berubah, tidak ada riwayat |

Jika salah satu anggota dari seretan atau dorongan banyak balok akan
mendarat di balok di luar pilihan, melepaskannya di sana membatalkan
gerakan alih-alih menerapkannya — setiap balok kembali tepat ke tempat
awalnya, tanpa entri urung baru. Menata ulang balok di dalam pilihan yang
sama tidak pernah dianggap tabrakan.

## Transformasi — panel angka (hanya Editor)

Di bagian **Posisi & rotasi tepat** pada panel Pilihan.

| Masukan | Tindakan |
|---|---|
| Ketik di kolom X/Y/Z/R | Nilai tepat; kolom kosong = tidak berubah |
| Sakelar Absolut / Selisih | Menargetkan poros vs. selisih biasa |
| `Enter` atau Terapkan | Satu operasi, satu langkah urung — tidak pernah di-snap |
| `Esc` di kolom, atau **Atur ulang isian** | Mengosongkan kolom (tidak pernah menghapus pilihan) |

## Perataan & Penyebaran (hanya Editor)

Tersedia di bagian **Ratakan, sebarkan, ulangi** pada panel Pilihan dan
melalui palet. Perataan memerlukan **2+ balok**; penyebaran memerlukan
**3+**. Keduanya bekerja pada batas seluruh pilihan dalam **sumbu dunia**
dan diterapkan sebagai satu perintah.

## Ulangi (hanya Editor)

Juga di bagian **Ratakan, sebarkan, ulangi** pada panel Pilihan. Membuat
**N** salinan tambahan dari pilihan, dengan jarak yang sama sepanjang satu
sumbu, sebagai **satu langkah urung** — seluruh kumpulan diperiksa
tabrakannya sebelum apa pun dibuat, sehingga tabrakan di tengah kumpulan
memblokir seluruh pengulangan alih-alih membuat sebagian salinan saja.

| Masukan | Tindakan |
|---|---|
| Kolom **Salinan** | Berapa banyak salinan tambahan (yang asli tidak pernah disentuh) |
| Kolom **Jarak** | Jarak antara setiap salinan |
| **Ulangi X** / **Ulangi Y** / **Ulangi Z** | Mengulang sepanjang sumbu dunia itu |

## Struktur (Pustaka Bangunan) — hanya Editor

Menyusun, mem-fork, dan pustaka pribadi Anda — lihat
[Editor](02-TheEditor.md#struktur-menyusun-mem-fork-dan-pustaka-pribadi-anda).

| Masukan | Tindakan | Catatan |
|---|---|---|
| Klik sebuah kartu di tab **Struktur** | Masuk ke mode penempatan struktur, pratinjau bayangan mengikuti penunjuk | berlaku untuk struktur bawaan atau milik Anda sendiri di **Struktur Saya** |
| `R` / `Shift+R` saat menempatkan | Memutar bayangan yang tertunda ±90° | tombol pratinjau penempatan yang sama seperti balok |
| Klik | Menerapkan — setiap balok dalam struktur mendarat sebagai satu langkah urung | ditolak di posisi yang terisi (merah) |
| `Esc` saat menempatkan | Membatalkan — tidak ada yang ditambahkan | |
| Menu **⋮** pada kartu, **Fork Sebagai Dokumen Baru** | Memulai dokumen baru yang berawal sebagai salinan struktur itu | tidak pernah mengubah entri pustaka |
| Menu **⋮** pada kartu bawaan, **Fork ke Struktur Saya** | Menambahkannya ke Struktur Saya apa adanya | tidak ada dokumen yang dibuat, tidak ada yang diekstrak |
| Menu **⋮** pada kartu mana pun, **Info** | Menampilkan panel baca-saja berisi nama/kategori/balok/jejak/tinggi/sumber/deskripsi | tidak pernah dapat diedit |
| Pilihan dengan **1+ balok**, lalu **Buat Cetak Biru** (bagian **Grup & cetak biru** pada panel Pilihan, atau Palet Perintah) | Membuka dialog kecil (nama / kategori / deskripsi + pratinjau); menyimpan pilihan sebagai entri baru di **Struktur Saya** | |
| Menu **⋮** pada kartu **Struktur Saya**, **Ganti Nama** | Mengubah nama struktur pribadi | hanya struktur pribadi |
| Menu **⋮** pada kartu **Struktur Saya**, **Hapus** | Menghapusnya dari pustaka Anda | tidak pernah menyentuh balok yang sudah disusun atau di-fork darinya |
| Menu **⋮** pada kartu mana pun, **Ekspor Cetak Biru** | Mengunduhnya sebagai file JSON portabel | bawaan atau pribadi |
| Tombol **Impor Cetak Biru** (di samping judul Struktur Saya) | Menambahkan file cetak biru ke pustaka Anda sebagai entri baru | identitas baru, bahkan untuk file yang diimpor ulang |

## Instans Struktur (Editor)

**Instans struktur** menempatkan seluruh dokumen tersimpan sebagai satu
unit yang dapat dipilih — referensi hidup, bukan salinan — lihat
[Editor](02-TheEditor.md#instans-struktur-referensi-hidup).

| Masukan | Tindakan | Catatan |
|---|---|---|
| Dropdown **Terbaru** di bilah alat, tombol **Tempatkan** pada sebuah dokumen | Masuk ke mode Tempatkan-Struktur dengan dokumen itu sebagai sasaran | mengeklik nama dokumen justru membukanya |
| `R` / `Shift+R` saat menempatkan | Memutar instans yang tertunda ±90° | tombol pratinjau penempatan yang sama seperti balok |
| Klik instans yang sudah ditempatkan (alat Pilih) | Memilihnya sebagai satu unit, berbeda dari pilihan balok | |
| Seret di viewport, atau gizmo | Memindahkan / memutar instans | |
| `Ctrl/Cmd+D` | Duplikat — menempatkan instans lain dari dokumen yang sama | lihat [Duplikat](#duplikat-hanya-editor) — pilihan instans mendapat instans baru alih-alih salinan balok baru |
| Kolom **X / Z / Rotasi** di panel instans, lalu Terapkan | Menetapkan posisi/arah yang tepat | Y (ketinggian) selalu diturunkan dari medan, tidak pernah menjadi sasaran |
| **Edit Dokumen Sumber** di panel instans | Membuka dokumen yang dirujuk untuk mengubah baloknya | setiap instans ikut diperbarui, karena instans adalah referensi hidup |
| `Delete` / `Backspace` | Menghapus instans | tidak pernah menyentuh dokumen yang dirujuk |

## Grup (hanya Editor)

Di bagian **Grup & cetak biru** pada panel Pilihan; saat tidak ada yang
dipilih, panel menampilkan grup Anda sehingga Anda dapat mengeklik salah
satunya untuk memilihnya.

| Operasi | Tersedia saat |
|---|---|
| Grup baru | ada balok yang dipilih |
| Ganti nama / Duplikat / Hapus grup | ada grup yang dipilih |
| Tambahkan ke grup / Keluarkan dari grup | ada balok yang dipilih dan grup yang dipilih |

Transformasi grup (pindah/putar/ratakan/sebarkan/angka) bekerja pada
balok anggota yang terhimpun; keanggotaannya sendiri tidak pernah diubah
oleh transformasi.

## Papan Klip (hanya Editor)

| Masukan | Tindakan | Catatan |
|---|---|---|
| `Ctrl/Cmd+C`, atau **Salin** di panel Pilihan | Salin | memerlukan pilihan |
| `Ctrl/Cmd+V`, atau **Tempel** di panel Pilihan | Tempel | tombolnya muncul begitu papan klip berisi sesuatu |

## Duplikat (hanya Editor)

| Masukan | Tindakan | Catatan |
|---|---|---|
| `Ctrl/Cmd+D` | Menduplikasi pilihan saat ini di tempat — satu langkah urung | berlaku untuk balok lepas atau grup yang terhimpun; pilihan instans struktur juga ikut terduplikasi — lihat [Instans Struktur](#instans-struktur-editor). Papan klip (dan selisih tempel yang tertunda) tidak tersentuh |

Hasil duplikat menjadi pilihan aktif, jadi langsung siap diseret atau
didorong.

## Riwayat

| Masukan | Tindakan | Tempat |
|---|---|---|
| `Ctrl/Cmd+Z` | Urungkan | Editor dan Tampilan Dunia |
| `Ctrl/Cmd+Shift+Z` atau `Ctrl/Cmd+Y` | Ulangi | Editor dan Tampilan Dunia |

Di Tampilan Dunia, urungkan dan ulangi berlaku untuk suntingan anotasinya:
penanda, nama wilayah, dan hiasan hewan. Panel Riwayatnya (lihat
[Tampilan Dunia](03-WorldView.md#riwayat--melihat-pratinjau-dan-memulihkan-keadaan-sebelumnya))
juga dapat menampilkan pratinjau dan memulihkannya.

## Khusus Editor

| Masukan | Tindakan |
|---|---|
| `1` / `2` | Beralih ke alat Pilih / Tempatkan |
| `Ctrl/Cmd+S` | Menyimpan dokumen |

## Penempatan (hanya Editor)

Tombol-tombol ini milik alat Tempatkan, jadi tidak muncul di Palet
Perintah (di sana, `R`/`Shift+R` memutar *pilihan*). Tampilan Dunia sama
sekali tidak memiliki alat Tempatkan.

| Masukan | Tindakan | Catatan |
|---|---|---|
| Gerakkan penunjuk | Pratinjau mengikuti permukaan tanah/balok yang ditunjuk | berwarna merah saat posisi itu sedang terisi |
| `R` | Memutar pratinjau yang tertunda +90° | tetap berlaku saat berganti balok; diatur ulang saat Anda keluar dari mode Tempatkan. Jika ditekan sebelum ada yang ditunjuk, memutar pratinjau berikutnya |
| `Shift+R` | Memutar pratinjau yang tertunda −90° | |
| `T` | Miringkan pratinjau yang tertunda ke sisi berikutnya | diatur ulang saat Anda keluar dari mode Tempatkan |
| `Shift+T` | Miringkan pratinjau yang tertunda ke arah sebaliknya | |
| Klik | Menerapkan pratinjau sebagai Balok sungguhan | ditolak di posisi yang terisi (merah) |
| Contoh warna **Warna** di Pustaka Bangunan | Memilih warna untuk balok berikutnya yang Anda tempatkan | kembali ke warna bawaan jenis balok saat Anda memilih jenis lain — lihat [Brick colors](02-TheEditor.md#warna-balok) |

Untuk mewarnai ulang balok yang sudah ditempatkan, pilih balok-balok itu
dan gunakan contoh warna **Warna** di bagian Pilihan — satu langkah urung
per perubahan.

## Layar sentuh

Di ponsel atau tablet, tindakan yang sama memiliki kontrol di layar.
Kontrol itu muncul setiap kali perangkat memiliki layar sentuh, jadi
laptop berlayar sentuh menampilkannya di samping keyboard dan mouse-nya.
Di layar selebar 720 piksel atau kurang, halaman juga menata ulang
dirinya: tautan halaman terlipat di balik tombol **Menu**, panel samping
Tampilan Dunia dibuka dari tombol **Panel**, dan bilah sisi Editor menjadi
laci yang dibuka dari tombol **Alat**.

### Kamera (kedua tampilan)

| Sentuhan | Tindakan |
|---|---|
| Seret satu jari | Orbit |
| Seret dua jari | Geser (pan) |
| Cubit | Zoom |
| Ketuk | Tampilan Dunia: memeriksa apa yang Anda ketuk. Editor: sama dengan klik dengan alat saat ini |

### Berjalan (Tampilan Dunia)

Pad sentuh muncul selama Mode Kendali Avatar aktif; tombol **Jalan** di
atas joystick menyalakan dan mematikan mode itu, beserta pad-nya.

| Kontrol | Tombol yang diwakilinya | Catatan |
|---|---|---|
| Joystick | `W` / `A` / `S` / `D` | Dorong ke atas untuk berjalan maju, ke samping untuk berbelok; arah diagonal menekan kedua tombol |
| Joystick didorong sampai ke tepi | `Shift` | Berlari |
| **Lompat** | `Space` | Menjadi **Berenang Naik** di air dalam |
| **Menyelam** | `C` | Muncul saat berenang |
| **Jelajah Otomatis** | `Alt` + `W`, lalu `Alt` + `Shift` + `W`, lalu `W` | Setiap ketukan: berjalan maju tanpa menyentuh, lalu berlari, lalu berhenti. Menampilkan **Jelajah Otomatis: Jalan** / **Jelajah Otomatis: Lari** selama aktif. Mendorong joystick ke depan atau ke belakang juga menghentikannya; ke samping hanya mengemudi |
| **Naik** / **Turun** | `E` | Ditampilkan saat ada kendaraan dalam jangkauan, atau selama berkendara |
| **Simpan** / **Keluarkan** | `Q` | Ditampilkan saat Anda dapat menyimpan kendaraan yang dinaiki, atau mengeluarkan yang tersimpan. Tombol Keluarkan menyebut nama kendaraannya, dan urutannya dalam daftar (seperti 2/3) saat Anda membawa lebih dari satu |
| **‹** / **›** di samping Keluarkan | `[` / `]` | Membawa 2+ kendaraan: memilih yang lebih lama atau lebih baru untuk dikeluarkan |
| **Tangkap** / **Lepaskan** | `F` | Ditampilkan saat ada hewan yang dapat ditangkap di dekat Anda, atau selama membawa hewan |
| **Hiasi** / **Urungkan Hiasan** | `G` | Ditampilkan di dekat hewan yang Anda lepaskan, atau di dekat hiasan. Tidak seperti `G`, hiasan yang ditolak (belum masuk, tidak ada akses EDIT) menyebutkan alasannya |
| **↶** / **↷** | `←` / `→` | Selama berkendara: belokan kemudi 45° per ketukan |
| **Rem** | `Ctrl` (ditahan) | Selama berkendara |

Tombol-tombol pad menggantikan petunjuk keyboard, yang disembunyikan
selama pad ditampilkan. Berjalan mundur tanpa menyentuh (`Alt` + `S`)
tidak memiliki tombol sentuh; jika dimulai dari keyboard, tampil sebagai
**Jelajah Otomatis: Mundur**, dan mengetuknya akan menghentikannya.

### Mengedit (Editor)

Ketukan melakukan apa yang dilakukan klik: memilih dengan alat Pilih,
menempatkan dengan alat Tempatkan. Seretan hanya menggerakkan kamera,
jadi mengorbit tidak pernah menempatkan balok atau menghapus pilihan
secara tidak sengaja. Sentuhan tidak memiliki hover, jadi alat Tempatkan
tidak menampilkan pratinjau sebelum ketukan; balok ditempatkan di tempat
Anda mengetuk. Memilih balok atau struktur untuk ditempatkan menutup laci
Alat, sehingga ketukan berikutnya sampai ke adegan. Bilah di bagian bawah
viewport menggantikan tombol-tombol keyboard:

| Tombol | Sama dengan | Catatan |
|---|---|---|
| **Urungkan** / **Ulangi** | `Ctrl/Cmd+Z` / `Ctrl/Cmd+Shift+Z` | |
| **Putar** | `R` | Saat menempatkan, memutar balok atau struktur berikutnya sebelum Anda mengetuk; selain itu memutar pilihan |
| **Miringkan** | `T` | Saat menempatkan, merebahkan balok berikutnya ke sisi berikutnya; selain itu memiringkan balok terpilih |
| **Hapus** | `Delete` | |
| **Multi** | `Ctrl/Cmd`-klik | Selama aktif, setiap ketukan menambahkan balok ke pilihan atau mengeluarkannya |
| **Kotak** | `Shift`-seret | Selama aktif, seretan satu jari menggambar kotak pilihan alih-alih menggerakkan kamera; dengan **Multi** juga aktif, kotak menambah ke pilihan (`Ctrl/Cmd+Shift`-seret). Kamera diam selama Kotak aktif (jari kedua membatalkan kotak alih-alih zoom), jadi matikan untuk bergerak lagi |
| **Lainnya** | `Ctrl/Cmd+K` | Palet Perintah, yang menjangkau setiap tindakan pengeditan lainnya |

Pegangan gizmo bekerja dengan sentuhan seperti dengan mouse, **Kotak**
aktif atau tidak: seret pegangannya.

## Prioritas Escape (Editor)

Escape bergantung pada konteks, dengan urutan persis seperti ini:

1. **Kolom teks yang aktif** — mengosongkan/melepas fokus kolom.
2. **Daftar Pintasan Keyboard** — menutup daftar (`?` juga menutupnya).
3. **Palet perintah** — menutup palet.
4. **Gerakan gizmo yang aktif** — membatalkan seretan (tanpa riwayat).
5. **Kotak pilihan yang aktif** — membatalkan kotak pilihan.
6. **Selain itu** — menghapus pilihan (dalam mode Tempatkan: keluar dari
   penempatan).

### Escape di Tampilan Dunia

Kolom teks yang aktif tetap memiliki Escape dengan cara yang sama; selain
itu, Escape menutup panel Tampilan Dunia mana pun yang sedang terbuka
(panel Fokus, panel penamaan, dan sebagainya).
