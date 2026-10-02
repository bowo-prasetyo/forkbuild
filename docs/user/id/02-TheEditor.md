<!-- translation-of: docs/user/02-TheEditor.md source-hash: c8966f8ede880a9e -->
# 02 — Editor

<!-- languages -->
[English](../02-TheEditor.md) · [Deutsch](../de/02-TheEditor.md) · [Español](../es/02-TheEditor.md) · **Bahasa Indonesia** · [日本語](../ja/02-TheEditor.md) · [Português (Brasil)](../pt-BR/02-TheEditor.md)
<!-- /languages -->

Editor adalah tempat Anda membangun. Panduan ini membahas alat-alatnya,
cara memilih dan mentransformasi balok, dan cara menata bangunan Anda
dengan grup.

## Tata letak

```
┌─────────────────────────────────────────────────────────────┐
│ Bilah alat: Simpan · Terbitkan · Baru · Ekspor · Impor ·    │
│             Terbaru · ⌨ Pintasan                            │
├──────────────────────┬──────────────────────────────────────┤
│ [Pilih | Tempatkan]  │                                      │
│ Judul dokumen     ✎  │                                      │
│ Pilihan              │            Viewport 3D               │
│ Pustaka Bangunan     │                                      │
│   [Balok|Struktur]   │                                      │
│                      │                                      │
└──────────────────────┴──────────────────────────────────────┘
```

- **Bilah alat** — menyimpan, menerbitkan, memulai karya baru, mengekspor
  atau mengimpor dokumen sebagai file, membuka kembali yang terbaru, dan
  membuka daftar **⌨ Pintasan** (juga `?`).
- **Alat** — beralih antara **Pilih** (`1`) dan **Tempatkan** (`2`).
  **Tempatkan** tetap tersorot selama Anda menempatkan balok atau
  struktur.
- **Judul dokumen** — nama karya yang terbuka. Klik **✎** untuk mengedit
  judul, deskripsi, dan lisensinya. Apakah sudah tersimpan ditampilkan di
  bilah alat.
- **Pilihan** — hanya menampilkan apa yang dapat bekerja pada pilihan Anda
  saat ini; lihat [Panel Pilihan](#panel-pilihan) di bawah.
- **Pustaka Bangunan** — kotak pencarian dan dua tab:
  - **Balok** — semua yang dapat Anda tempatkan dengan alat Tempatkan,
    sebagai ubin dalam lima bagian (Dasar, Struktur, Atap & Tangga,
    Bukaan, Detail). Klik salah satunya untuk memilihnya (dan beralih ke
    alat Tempatkan); contoh warna **Warna** lalu muncul untuk memilih
    warnanya — lihat [Warna balok](#warna-balok) di bawah.
  - **Struktur** — dua puluh struktur siap pakai dalam lima kategori
    (hunian, pertanian, komersial, komunitas, infrastruktur), ditambah
    **Struktur Saya** milik Anda sendiri. Klik sebuah kartu untuk
    menempatkannya — lihat
    [Struktur: menyusun, mem-fork, dan pustaka pribadi Anda](#struktur-menyusun-mem-fork-dan-pustaka-pribadi-anda)
    di bawah.

### Panel Pilihan

Panel ini berubah sesuai apa yang Anda pilih, jadi tidak pernah menampilkan
tombol yang belum bisa melakukan apa-apa:

- **Tidak ada yang dipilih** — petunjuk singkat, **Pilih Semua**,
  **Tempel** begitu Anda menyalin sesuatu, dan grup-grup Anda (klik salah
  satunya untuk memilih baloknya).
- **Balok dipilih** — berapa banyak, di mana letaknya, dan tindakan
  sehari-hari: **Putar ↻ / ↺**, **Duplikat**, **Hapus**, **Salin**,
  **Tempel**, **Warna**, **Fokus**, dan **Batalkan Pilihan**. Alat yang
  lebih jarang dipakai terlipat di tiga bagian di bawahnya: **Posisi &
  rotasi tepat**, **Ratakan, sebarkan, ulangi**, dan **Grup & cetak biru**.
- **Instans struktur dipilih** — kartunya sendiri sebagai gantinya, dengan
  posisi, rotasi, dan tindakannya (lihat
  [Instans struktur](#instans-struktur-referensi-hidup)).

> **Kiat:** Tekan `Ctrl/Cmd+K` di mana saja untuk membuka **Palet
> Perintah** — daftar yang dapat dicari berisi setiap tindakan di panduan
> ini, berdasarkan nama.

## Dua alat

### Alat Tempatkan (`2`)

Pilih balok dari palet, arahkan penunjuk ke viewport, lalu klik untuk
menempatkannya. Bayangan tembus pandang menunjukkan persis di mana balok
akan mendarat. Arahkan penunjuk ke sisi balok yang sudah ada untuk menumpuk
atau menempelkan.

> **Kiat:** Tekan **Escape** untuk kembali ke alat Pilih.

### Alat Pilih (`1`)

Klik balok untuk memilihnya, lalu pindahkan, putar, atau hapus. Di sinilah
Anda menghabiskan sebagian besar waktu begitu bentuk kasarnya sudah jadi.

## Memilih balok

ForkBuild memberi Anda kendali yang presisi atas pemilihan:

| Tindakan | Hasil |
|---|---|
| **Klik** sebuah balok | Memilihnya (menggantikan pilihan saat ini) |
| **Ctrl/Cmd + Klik** | Memasukkan atau mengeluarkan balok itu dari pilihan |
| **Shift + Klik** | Menambahkan balok itu ke pilihan |
| **Shift + Seret** | Menggambar kotak — memilih semua yang ada di dalamnya |
| **Ctrl/Cmd + Shift + Seret** | Memilih dengan kotak dan *menambah* ke pilihan saat ini |
| **Ctrl/Cmd + A** | Memilih setiap balok dalam karya |
| **Escape** | Menghapus pilihan |

> **Mengapa ini penting:** Membangun apa pun yang lebih besar dari satu
> balok berarti bekerja dengan *banyak* balok sekaligus. Pelajari kotak
> pilihan dengan Shift-seret sejak awal — itulah cara tercepat untuk
> mengambil satu dinding utuh.

## Memindahkan, memutar, dan menghapus

Dengan satu balok atau lebih dipilih:

| Tombol | Tindakan |
|---|---|
| **Tombol panah** | Mendorong ke kiri/kanan/depan/belakang |
| **Page Up / Page Down** | Mendorong ke atas / bawah |
| **R** | Memutar 90° searah jarum jam |
| **Shift + R** | Memutar 90° berlawanan arah jarum jam |
| **Delete / Backspace** | Menghapus balok yang dipilih |

Saat Anda memilih beberapa balok, balok-balok itu berputar di sekitar
**pusat bersamanya**, sehingga satu bagian utuh berayun sebagai satu
kesatuan.

## Warna balok

Setiap jenis balok memiliki warna bawaannya sendiri, tetapi Anda dapat
memilih warna sendiri:

- **Sebelum menempatkan** — begitu sebuah balok dipilih di tab **Balok**
  pada Pustaka Bangunan, klik contoh warna **Warna**-nya dan pilih warna.
  Setiap balok yang Anda tempatkan sejak itu memakainya, dan bayangan
  penempatan menampilkan pratinjaunya. Memilih jenis balok lain kembali ke
  warna bawaan jenis itu sampai Anda memilih warna lagi.
- **Setelah menempatkan** — pilih satu balok atau lebih dan gunakan contoh
  warna **Warna** di bagian **Pilihan** untuk mewarnai ulang semuanya
  sekaligus. Setiap perubahan dapat diurungkan (`Ctrl/Cmd+Z`) seperti
  suntingan lainnya. Contoh warna tidak ditawarkan untuk pilihan instans
  struktur — edit dokumen struktur itu sendiri sebagai gantinya (lihat
  [Instans struktur](#instans-struktur-referensi-hidup) di bawah).

Warna balok disimpan bersama karya Anda dan ikut terbawa saat Anda
menerbitkan atau membagikannya.

## Transformasi presisi: masukan angka, perataan, dan pengulangan

Bagian-bagian yang terlipat di panel Pilihan memberi Anda cara yang lebih
tepat untuk memindahkan pilihan, di samping gizmo dan tombol-tombol di
atas:

- **Posisi & rotasi tepat** — ketik nilai X/Y/Z/Rotasi yang tepat alih-alih
  menyeret. Alihkan ke **Absolut** (nilai menjadi sasaran bagi
  poros/orientasi pilihan) atau **Selisih** (nilai ditambahkan sebagai
  selisih), lalu tekan **Terapkan** (atau `Enter` di sebuah kolom). Kolom
  kosong berarti "biarkan tidak berubah", bukan nol. **Atur ulang isian**
  mengosongkan kolom tanpa menyentuh pilihan.
- **Perataan & Penyebaran** (di bawah **Ratakan, sebarkan, ulangi**) —
  sembilan tombol untuk meratakan tepi atau tengah seluruh pilihan pada
  sumbu dunia (← Kiri/Tengah X/Kanan →, ↓ Bawah/Tengah Y/Atas ↑,
  Depan/Tengah Z/Belakang), ditambah tiga untuk menyebarkannya merata
  (Sebarkan X/Y/Z). Perataan memerlukan **2+ balok** yang dipilih;
  penyebaran memerlukan **3+**.
- **Ulangi** (juga di bawah **Ratakan, sebarkan, ulangi**) — membuat **N**
  salinan tambahan dari pilihan, berjarak sama sepanjang satu sumbu. Jika
  ada salinan yang akan bertabrakan, tidak ada salinan yang dibuat sama
  sekali.

Masing-masing adalah **satu langkah urung**, persis seperti seretan gizmo
atau dorongan keyboard — lihat
[Referensi Kontrol](ControlsReference.md#transformasi--panel-angka-hanya-editor)
untuk perilaku lengkap per kolom.

Tombol **Fokus** di panel Pilihan membingkai kamera pada balok yang dipilih
tanpa mengubah apa pun.

> **Tabrakan diblokir.** Menyeret gizmo atau mendorong dengan keyboard
> memeriksa hasilnya terhadap setiap balok di luar pilihan. Jika
> melepaskannya akan membuat anggota mana pun mendarat di atas salah
> satunya, seluruh pemindahan dibatalkan alih-alih diterapkan — setiap
> balok dalam pilihan kembali tepat ke tempat awalnya, tanpa entri urung
> baru. Menata ulang balok *di dalam* pilihan Anda sendiri (seperti
> menukar tempat dua balok dengan rotasi) tidak pernah dianggap tabrakan.

## Salin, tempel, dan duplikat

| Tombol | Tindakan |
|---|---|
| **Ctrl/Cmd + C** | Menyalin balok yang dipilih |
| **Ctrl/Cmd + V** | Menempelkannya (sedikit digeser agar terlihat) |
| **Ctrl/Cmd + D** | Menduplikasi pilihan di tempat — salin dan tempel dalam satu langkah |

Salin lalu tempel sangat cocok untuk elemen yang berulang — buat satu
jendela, lalu salin-tempel di sepanjang fasad. **Duplikat** melakukan hal
yang sama dalam satu gerakan dan satu langkah urung, dan tidak menyentuh
papan klip Anda: Ctrl+C sebelumnya masih ada untuk ditempel setelah Anda
menduplikasi sesuatu yang lain. Hasil duplikat menjadi pilihan baru Anda,
jadi alur alaminya adalah pilih → duplikat → seret atau dorong ke tempatnya.
Duplikat bekerja pada pilihan apa pun — balok lepas, satu grup penuh, atau
satu [instans struktur](#instans-struktur-referensi-hidup).

## Urungkan dan ulangi

Setiap perubahan dicatat, jadi Anda selalu dapat kembali:

| Tombol | Tindakan |
|---|---|
| **Ctrl/Cmd + Z** | Mengurungkan tindakan terakhir |
| **Ctrl/Cmd + Y** *(atau Ctrl/Cmd+Shift+Z)* | Mengulanginya |

Memindahkan sepuluh balok dihitung sebagai **satu** langkah urung, jadi
urungkan tetap mudah dikelola bahkan pada bangunan besar.

## Grup

Grup memungkinkan Anda memberi nama dan memakai ulang kumpulan balok —
seperti "Atap" atau "Jendela".

**Membuat grup:**
1. Pilih beberapa balok.
2. Buka bagian **Grup & cetak biru** di panel Pilihan dan klik **Grup
   baru**, lalu beri nama dengan **Ganti nama grup** (di bawah).

**Memakai grup:** klik nama sebuah grup di daftar untuk memilihnya (beserta
baloknya) — daftarnya ada di panel Pilihan saat tidak ada yang dipilih, dan
di **Grup & cetak biru** jika ada. Tombol-tombol ini bekerja pada grup mana
pun yang sedang dipilih:

| Tombol | Fungsinya |
|---|---|
| **Ganti nama grup** | Mengubah nama grup |
| **Duplikat grup** | Menyalin seluruh grup *dan* baloknya |
| **Hapus grup** | Menghapus grup (baloknya sendiri tetap ada) |
| **Tambahkan ke grup** | Menambahkan pilihan Anda saat ini ke grup |
| **Keluarkan dari grup** | Mengeluarkan pilihan Anda saat ini dari grup |

> **Perlu diketahui:** Memilih sebuah grup hanya memilih baloknya — tidak
> pernah mengubah grupnya. Dan menghapus grup hanya menghapus *labelnya*,
> bukan balok di dalamnya.

## Struktur: menyusun, mem-fork, dan pustaka pribadi Anda

Tab **Struktur** di Pustaka Bangunan (lihat [Tata letak](#tata-letak) di
atas) memberi Anda dua puluh struktur siap pakai — rumah, lumbung, sumur,
pasar, kincir, jembatan, dan lainnya, dalam lima kategori — ditambah
**Struktur Saya**, koleksi pribadi Anda berisi apa pun yang Anda simpan
dari sebuah bangunan. Ada tiga hal berbeda yang dapat Anda lakukan dengan
salah satunya, dan masing-masing penting untuk alasan yang berbeda:

- **Tempatkan** (klik kartunya) — menyalin balok struktur langsung ke
  dokumen yang sedang Anda kerjakan, sehingga menjadi bagian dari satu
  bangunan yang lebih besar. Inilah tindakan sehari-hari.
- **Fork Sebagai Dokumen Baru** (di menu **⋮** kartu) — memulai dokumen
  baru yang mandiri yang berawal sebagai salinan persis struktur itu.
- **Fork ke Struktur Saya** (hanya kartu bawaan, di menu **⋮**) —
  menambahkan struktur ke **Struktur Saya** milik Anda, tanpa melibatkan
  dokumen sama sekali. Lihat
  [Struktur Saya](#struktur-saya-pustaka-cetak-biru-pribadi-anda) di
  bawah.
- **Info** (di menu **⋮** kartu) — tampilan baca-saja berisi nama,
  kategori, jumlah balok, jejak, tinggi, sumber, dan deskripsi struktur.
- Tempatkan **dokumen tersimpan** milik Anda sendiri sebagai **instans
  struktur** — referensi hidup yang dapat dipakai ulang, bukan salinan —
  dari dropdown **Terbaru** di bilah alat, bukan dari Pustaka Bangunan.
  Lihat [Instans struktur](#instans-struktur-referensi-hidup) di bawah.

### Menempatkan struktur ke dalam dokumen Anda

Klik kartu mana pun di tab **Struktur** — yang bawaan atau salah satu
**Struktur Saya** milik Anda — dan pratinjau bayangan tembus pandang dari
seluruh struktur muncul, mengikuti penunjuk Anda di atas tanah, persis
seperti menempatkan satu balok:

1. Gerakkan penunjuk untuk memosisikan bayangan.
2. Tekan `R` / `Shift+R` untuk memutarnya per 90°.
3. Klik untuk menerapkan — setiap balok dalam struktur ditambahkan ke
   dokumen Anda sebagai satu **langkah urung**. Posisi yang terisi
   mewarnai bayangan menjadi merah dan menolak kliknya, sama seperti satu
   balok menolak ditempatkan di atas balok lain.
4. `Escape` membatalkan — tidak ada yang ditambahkan, dan Anda kembali ke
   alat yang Anda pakai sebelumnya.

Balok yang Anda dapatkan adalah balok biasa di dokumen Anda sejak saat
mendarat — tidak dapat dibedakan dari apa pun yang Anda tempatkan dengan
tangan, bebas diedit, dipilih, dikelompokkan, atau dihapus seperti yang
lain. Menempatkan beberapa struktur adalah cara cepat membangun sebuah
adegan: klik Rumah, tempatkan; klik Lumbung, tempatkan di sampingnya; klik
Sumur, tempatkan di halaman.

### Mem-fork struktur sebagai dokumen baru

Buka menu **⋮** sebuah kartu dan klik **Fork Sebagai Dokumen Baru** untuk
memulai karya baru milik Anda yang berawal sebagai salinan persis struktur
itu — balok yang persis sama, dapat diedit dengan setiap alat di panduan
ini, dalam dokumennya sendiri alih-alih dilebur ke apa pun yang sedang Anda
buka. Fork tidak pernah mengubah salinan milik pustaka: fork Rumah sepuluh
kali dan masing-masing menjadi karya mandiri sejak Anda mengeklik Fork.

### Struktur Saya: pustaka cetak biru pribadi Anda

Membangun sesuatu yang layak dipakai ulang? Pilih balok-balok yang
menyusunnya (satu bangunan utuh, atau hanya sebagian) dan klik **Buat
Cetak Biru** — tombol itu ada di bagian **Grup & cetak biru** pada panel
Pilihan begitu Anda memilih balok, dan di Palet Perintah (`Ctrl/Cmd+K`)
kapan pun. Sebuah dialog kecil meminta **nama**, **kategori**, dan
**deskripsi** opsional, dengan pratinjau langsung dari apa yang akan Anda
simpan; klik **Buat Cetak Biru** dan struktur itu dinormalkan ke titik asal
lokalnya sendiri dan langsung disimpan ke **Struktur Saya**, bagian baru di
bawah tab Struktur, tepat di bawah kategori bawaan.

Ada cara kedua sebuah struktur masuk ke Struktur Saya, tanpa ada yang perlu
dipilih atau dibangun terlebih dahulu: buka menu **⋮** pada kartu
**bawaan** mana pun dan klik **Fork ke Struktur Saya**. Struktur itu
ditambahkan persis apa adanya — tidak ada dokumen yang dibuat, tidak ada
yang diekstrak — jadi siap untuk Ganti Nama, Ekspor, atau ditempatkan
langsung, seperti entri lain di pustaka Anda.

Struktur di **Struktur Saya** bekerja persis seperti yang bawaan — klik
untuk menempatkannya ke dokumen Anda saat ini, atau Fork Sebagai Dokumen
Baru — dengan dua tindakan tambahan di menu **⋮**-nya:

| Tindakan | Fungsinya |
|---|---|
| **Ganti Nama** | Mengubah namanya (kategori dan deskripsinya tetap) |
| **Hapus** | Menghapusnya dari pustaka Anda |

**Struktur Saya** hanya menyimpan *struktur itu sendiri* — nama dan
sekumpulan balok. Menghapus satu struktur tidak pernah menyentuh apa pun
yang sudah Anda bangun dengannya: setiap tempat yang sudah Anda tempati
atau fork dengannya tetap menyimpan balok-balok itu apa adanya. Dan
struktur itu tidak pernah diedit di tempat — jika Anda ingin mengubah apa
yang sebenarnya dibangun oleh struktur tersimpan, tempatkan ke sebuah
dokumen, edit dokumen itu, lalu **Buat Cetak Biru** lagi (secara opsional
dengan nama baru, seperti "Farmstead Deluxe" — itu menjadi entri tersendiri
di Struktur Saya, bukan pengganti yang asli).

> **Perlu diketahui:** Struktur Saya ada di perangkat ini. Struktur Saya
> tidak terikat pada identitas Anda atau disinkronkan ke mana pun secara
> otomatis — lihat
> [Berbagi cetak biru](#berbagi-cetak-biru-ekspor-dan-impor) di bawah untuk
> cara memindahkannya ke perangkat lain atau memberikannya kepada orang
> lain.

### Berbagi cetak biru: ekspor dan impor

Struktur apa pun — yang bawaan atau milik Anda sendiri — dapat keluar dari
perangkatnya sebagai file portabel, tanpa pernah menjadi bagian dari Dunia
bersama yang diterbitkan:

- **Ekspor Cetak Biru** (di menu **⋮** kartu mana pun) mengunduhnya sebagai
  file JSON kecil — snapshot mandiri berisi nama, kategori, tag, deskripsi,
  dan balok struktur itu.
- **Impor Cetak Biru** (tombol di samping judul **Struktur Saya**) membaca
  file cetak biru dan menambahkannya ke Struktur Saya Anda sebagai entri
  baru yang mandiri — salinan baru dengan identitasnya sendiri, tidak
  pernah terhubung kembali ke asalnya. Mengimpor file yang sama dua kali
  memberi Anda dua entri terpisah, bukan satu yang diam-diam menimpa yang
  lain. File yang rusak atau tidak dikenali ditolak dengan penjelasan,
  alih-alih diam-diam menghasilkan sesuatu yang rusak.

Begitulah cara Anda memberikan sebuah bangunan kepada teman, atau membawa
struktur Anda antarperangkat Anda sendiri: ekspor di satu sisi, kirim file
dengan cara apa pun yang Anda suka, impor di sisi lain.

**Ekspor Semua** (di samping **Impor Cetak Biru**, begitu Anda memiliki
struktur sendiri) mengunduh setiap struktur di Struktur Saya sebagai satu
file, masing-masing dengan atribusi dan klaim silsilahnya. **Impor Cetak
Biru** juga membaca file itu, dan melewati desain yang sudah ada di Struktur
Saya, jadi mengimpornya dua kali tidak menghasilkan duplikat. Untuk
menyimpan salinan semua hal lainnya juga, gunakan [Data Anda](13-YourData.md).

### Mengklaim kepengarangan

Struktur yang memiliki identitas Cetak Biru (kebanyakan yang tersimpan
memilikinya) juga dapat membawa **Atribusi Komunitas** — catatan
bertanda tangan tentang siapa yang mengklaim telah merancangnya. Buka
panel **Info** struktur dari kartunya dan Anda akan menemukan:

- **Klaim kepengarangan** — menandatangani klaim, dengan identitas Anda
  saat ini, bahwa Anda salah satu perancangnya. Beberapa orang dapat
  masing-masing mengklaim desain yang sama secara terpisah; klaim siapa
  pun tidak pernah menimpa atau menggantikan klaim orang lain.
- **Ekspor Atribusi** / **Terbitkan ke Jaringan** — begitu Anda
  mengklaimnya, bagikan klaim itu sebagai file atau umumkan kepada rekan
  yang terhubung.
  Setelah **Terbitkan ke Jaringan**, panel menawarkan **Distribusikan**,
  yang membawa klaim itu ke jaringan terdesentralisasi juga (lihat
  [Distribusi](Distribution.md)).
- **Tandatangani ulang untuk desain ini** — klaim yang dibuat sebelum 28
  September 2026 memakai jenis sidik jari desain lama yang dapat ditiru
  oleh desain lain, jadi klaim itu tidak lagi dihitung dan panel
  menyebutkan berapa banyaknya. Jika salah satunya milik Anda dan ini
  memang desain Anda, tombol ini menandatangani klaim Anda lagi. Periksa
  desainnya terlebih dahulu: tombol ini muncul untuk desain apa pun yang
  berbagi sidik jari lama itu.

Ini opsional, dan sepenuhnya terpisah dari menempatkan, mem-fork, atau
membagikan struktur itu sendiri — fitur ini ada untuk situasi saat Anda
ingin melekatkan nama Anda pada sebuah desain dengan cara yang dapat
diverifikasi orang lain secara mandiri, bukan sekadar dipercaya. Lihat
[Publikasi & Bukti Eksternal](09-PublicationsAndEvidence.md) untuk apa
yang terjadi pada klaim setelah Anda menerbitkannya, dan cara melekatkan
bukti eksternal yang mandiri padanya.

## Instans struktur: referensi hidup

Menempatkan (di atas) menyalin balok struktur ke dokumen Anda sekali.
Terkadang yang Anda inginkan justru salinan **hidup** dari sesuatu yang
sudah Anda bangun — dokumen tersimpan apa pun, bukan hanya yang ada di
pustaka — yang selalu selaras dengan sumbernya setiap kali Anda melihatnya.
Itulah **instans struktur**: instans merujuk dokumen sumber alih-alih
menyalin baloknya, sehingga mengedit sumbernya nanti otomatis memperbarui
setiap instansnya.

1. Buka dropdown **Terbaru** di bilah alat. (Dropdown ini muncul setelah
   Anda menyimpan setidaknya satu dokumen.)
2. Di samping dokumen tersimpan mana pun, klik **Tempatkan**. Mengeklik
   nama dokumen justru membukanya, menggantikan apa yang sedang Anda buka.
3. Arahkan penunjuk ke tanah, tekan `R` untuk memutar, dan klik untuk
   menempatkannya — persis seperti menempatkan balok.

Instans adalah *referensi* hidup ke dokumen itu, bukan salinan baloknya:
dokumen yang sama dapat ditempatkan berapa kali pun, dan mengedit balok
dokumen sumber nanti memperbarui setiap instansnya. Pilih sebuah instans
dengan alat Pilih (`1`) dan bilah sisi menampilkan:

| Kontrol | Fungsinya |
|---|---|
| Seret di viewport, atau [gizmo](InteractiveTransformGizmo.md) | Memindahkan / memutar, sama seperti balok |
| Tombol panah / Page Up / Page Down | Mendorong |
| **Kolom X / Z / Rotasi °, lalu Terapkan** | Menetapkan posisi dan arah yang tepat — ketinggian (Y tanah) selalu mengikuti medan dan bukan sasaran yang Anda tetapkan |
| **Putar ↻ / ↺** | Memutar tepat 90° |
| **Duplikat** (`Ctrl/Cmd+D`) | Menempatkan instans lain dari struktur yang sama |
| **Hapus** | Menghapus instans ini — dokumen sumbernya tidak tersentuh |
| **Edit Dokumen Sumber** | Membuka dokumen yang dirujuk itu sendiri, untuk mengubah tampilan setiap instansnya |

Mengedit *isi* struktur yang ditempatkan selalu dilakukan dengan mengedit
dokumen sumbernya — tidak ada cara untuk mengedit balok sebuah instans
secara langsung, dan justru itulah yang menjaga setiap instansnya tetap
selaras.

## Properti Dokumen

Setiap karya memiliki **judul**, **deskripsi** opsional, **lisensi**, dan
pengaturan **Siapa yang dapat menempatkannya di Dunia** — atur semuanya di
dialog **Properti Dokumen**, yang dibuka dengan tombol **✎** di samping
judul dokumen di bagian atas bilah sisi Editor (di Tampilan Dunia,
tombolnya **Edit Metadata**). Dokumen baru dimulai tanpa lisensi, yang
berarti tidak ada orang lain yang dapat mem-fork-nya sampai Anda memilih
lisensi. Deskripsinya muncul sebagai cuplikan di kartu Repositori-nya dan
juga dapat dicari di sana; lisensi menentukan apakah — dan bagaimana —
orang lain boleh mem-fork-nya. Lihat
[Penerbitan & Fork](04-PublishingAndForking.md) untuk arti setiap lisensi.

## Suara

Setiap perubahan yang Anda buat memiliki suara pendeknya sendiri, sehingga
Anda dapat mendengar apa yang terjadi tanpa melihat: bunyi klik saat balok
atau struktur ditempatkan, bunyi pop saat dihapus, bunyi tik untuk
pemindahan dan tik ganda untuk putaran, rangkaian bip cepat untuk tempel
atau duplikat, denting terang untuk warna baru, dua nada untuk
pengelompokan, lonceng untuk memberi nama tempat, bip menurun untuk urungkan
dan bip menaik untuk ulangi, serta akor kecil saat Anda menyimpan. Perubahan
yang dibuat kolaborator di dokumen yang sama tidak bersuara.

Matikan atau nyalakan suara dengan tombol **Suara** di kanan atas tampilan
atau dengan menekan `M` (tercantum di daftar Pintasan Keyboard, `?`);
penggeser di sampingnya mengatur volume. Ini pengaturan yang sama dengan
milik Tampilan Dunia, diingat di perangkat ini. Suara dimulai dengan klik
atau tekanan tombol pertama Anda, sebagaimana diwajibkan browser.

## Menyimpan, menerbitkan, memulai ulang

- **Simpan** (`Ctrl+S`) — menyimpan pekerjaan Anda di perangkat ini.
- **Terbitkan** — membagikannya kepada semua orang (lihat
  [Penerbitan & Fork](04-PublishingAndForking.md)).
- **Baru** — memulai karya baru yang kosong.
- **Ekspor** — mengunduh karya saat ini sebagai file JSON, untuk menyimpan
  salinan atau memindahkannya ke perangkat lain. File memakai format ringkas
  yang menyimpan balok sebagai tabel.
- **Impor** — membuka file yang diekspor sebagai karya baru dengan
  identitasnya sendiri; tidak ada yang disimpan sampai Anda **Simpan**. File
  yang diekspor versi sebelumnya tetap dapat dibuka (dikonversi saat
  dimuat), tetapi ForkBuild 1.0.0 dan yang lebih lama tidak dapat membuka
  file yang diekspor versi ini.
- **Terbaru** — membuka kembali sesuatu yang pernah Anda simpan (muncul
  setelah penyimpanan pertama; klik nama dokumen untuk membukanya). Begitu
  Anda menyimpan cukup banyak dokumen, kotak saring muncul sehingga Anda
  dapat langsung melompat ke salah satunya berdasarkan nama. Setiap entri
  juga memiliki tombol **Tempatkan** — lihat
  [Instans struktur](#instans-struktur-referensi-hidup) — untuk
  menambahkannya ke dokumen *saat ini* alih-alih menggantinya. **Ekspor
  Semua Dokumen** di bagian bawah mengunduh setiap dokumen tersimpan
  sebagai satu file; **Impor** membacanya kembali, menyimpan dokumen yang
  belum ada di perangkat ini (buka dari Terbaru), melewati yang sudah ada
  tanpa perubahan, dan menyimpan salinan di samping dokumen yang ada dalam
  versi berbeda. Perubahan yang belum disimpan tidak disertakan, jadi
  simpan terlebih dahulu.

## Kontrol kamera

- **Seret** — mengorbit di sekitar adegan
- **Gulir** — memperbesar dan memperkecil
- **Home** — mengembalikan kamera ke tampilan bawaan

## Di ponsel atau tablet

Editor bekerja dengan sentuhan. Seret dengan satu jari untuk mengorbit,
dua jari untuk menggeser, dan cubit untuk zoom. Ketukan memilih atau
menempatkan, dan seretan tidak pernah melakukannya. Di layar sempit, bilah
sisi dibuka dari tombol **Alat** di kanan atas adegan. Bilah di bagian
bawah adegan memiliki **Urungkan**, **Ulangi**, **Putar**, **Hapus**,
**Multi** (setiap ketukan menambahkan balok ke pilihan atau
mengeluarkannya), **Kotak** (seret untuk menggambar kotak pilihan; kamera
tetap diam sampai Anda mematikannya), dan **Lainnya**, yang membuka Palet
Perintah. Lihat [Layar sentuh](ControlsReference.md#layar-sentuh) untuk
detailnya.
