<!-- translation-of: docs/user/01-GettingStarted.md source-hash: ccc330f1bc5e0f97 -->
# 01 — Memulai

<!-- languages -->
[English](../01-GettingStarted.md) · [Deutsch](../de/01-GettingStarted.md) · [Español](../es/01-GettingStarted.md) · [Français](../fr/01-GettingStarted.md) · **Bahasa Indonesia** · [日本語](../ja/01-GettingStarted.md) · [한국어](../ko/01-GettingStarted.md) · [Português (Brasil)](../pt-BR/01-GettingStarted.md)
<!-- /languages -->

Selamat datang! Panduan ini membawa Anda dari "baru membuka aplikasi"
sampai "saya sudah membangun sesuatu" dalam sekitar lima menit.

## Membuka ForkBuild

ForkBuild berjalan di browser web terkini mana pun. Buka URL yang
di-host, dan Anda akan tiba di layar **Beranda**. Untuk menjalankan salinan
Anda sendiri, sajikan foldernya melalui HTTP (misalnya
`python3 -m http.server 8000`, lalu buka <http://localhost:8000/>):
membuka `index.html` langsung dari disk tidak berfungsi, karena browser
tidak mau memuat modulnya dari halaman `file://`. Server rendezvous bawaan
hanya melayani situs yang di-host, jadi salinan Anda sendiri tidak dapat
memakainya untuk menemukan orang; terhubunglah dengan undangan, atau
siapkan server rendezvous Anda sendiri (lihat
[Koneksi Rekan & Teman](07-PeerConnectionsAndFriends.md)).

Layar **Beranda** menampilkan desa kecil yang berputar dalam 3D dan
menawarkan tiga cara untuk mulai: **Coba sekarang: mulai dengan sebuah
rumah** membuka rumah siap pakai di Editor sebagai salinan Anda sendiri,
siap diubah; **Mulai dari nol** membuka Editor pada lahan kosong; dan
**Jelajahi bangunan** membuka Repositori. Di bawah **Mulai dari bangunan
siap pakai**, setiap kartu (rumah, pondok, kincir, menara pengawas,
jembatan, dan kapel kecil) membuka salinan Anda sendiri dari bangunan itu
dengan cara yang sama. Tidak ada yang diterbitkan atau dikirim ke mana pun
sampai Anda memilihnya.

Bilah di bagian atas selalu terlihat:

`ForkBuild Beranda Editor Repositori Dunia Saya Avatar Saya Identitas Saya Rekan Diikuti Percakapan Publikasi Pengaturan Jaringan Data Anda Bahasa Tentang 🔔 [Masuk]`

- **Beranda** — halaman awal
- **Editor** — tempat Anda membangun
- **Repositori** — telusuri karya yang diterbitkan semua orang
- **Dunia Saya** — Dunia yang benar-benar pernah Anda kunjungi di
  perangkat ini, lihat
  [Dunia Saya](03-WorldView.md#dunia-saya--dunia-yang-benar-benar-pernah-anda-kunjungi)
- **Avatar Saya** — bagaimana Anda terlihat oleh orang lain di Tampilan
  Dunia, lihat [Avatar & Kehadiran](06-AvatarsAndPresence.md)
- **Identitas Saya** — identitas kriptografis yang tersimpan di perangkat
  ini, lihat [Identitas & Masuk](05-IdentityAndLogin.md)
- **Rekan** — orang yang terhubung, Anda kenal, atau berteman dengan Anda,
  lihat [Koneksi Rekan & Teman](07-PeerConnectionsAndFriends.md)
- **Percakapan** — pesan langsung Anda, lihat
  [Obrolan & Percakapan](08-ChatAndConversations.md)
- **Publikasi** — klaim kepengarangan/nama tempat yang ditandatangani, tempat
  menyimpan dan mengumumkannya, dan (*eksperimental*) bukti eksternalnya,
  lihat [Publikasi & Bukti Eksternal](09-PublicationsAndEvidence.md)
- **Pengaturan Jaringan** — gateway, relay, penyedia, dan server untuk
  koneksi rekan, lihat
  [Pengaturan Jaringan](10-NetworkSettings.md)
- **Bahasa** — bahasa yang ditampilkan ForkBuild di perangkat ini. Bahasa
  mengikuti pengaturan bahasa browser Anda sampai Anda memilihnya sendiri;
  menyimpan akan memuat ulang halaman, jadi simpan pekerjaan Anda dulu.
  ForkBuild tersedia dalam bahasa Inggris, bahasa Jerman, bahasa Spanyol, bahasa Prancis, Bahasa Indonesia,
  bahasa Jepang, bahasa Korea, dan bahasa Portugis Brasil (lihat [Translating ForkBuild](../../Translating.md), bahasa Inggris).
- **Tentang** — informasi versi

## Masuk

Klik **Masuk** di pojok kanan atas. ForkBuild tidak memakai kata sandi atau
akun pusat — sebagai gantinya, **identitas Anda adalah pasangan kunci
kriptografis yang tersimpan di perangkat ini**. Dialog masuk menampilkan
setiap identitas yang sudah ada di browser ini; klik salah satunya untuk
memakainya, atau buat yang baru:

1. Ketik **nama tampilan** — inilah yang akan dilihat orang lain.
2. Ketik **frasa sandi** minimal 8 karakter, dua kali. Frasa sandi
   mengenkripsi kunci Anda di perangkat ini, dan tidak dapat diatur ulang,
   jadi pilih yang akan Anda ingat. (Untuk melewatinya, centang **Buat
   tanpa frasa sandi**; kunci lalu disimpan tanpa enkripsi di browser ini.)
3. Klik **Buat & Masuk**.

Selesai — Anda sudah masuk, dan semua yang Anda bangun, terbitkan, atau
kirim ditandatangani dengan identitas ini.

Apa yang dilindungi frasa sandi, mengunci dan membuka kunci, serta
mencadangkan identitas Anda dijelaskan di
[Identitas & Masuk](05-IdentityAndLogin.md).

## Berkeliling

ForkBuild memiliki beberapa area utama:

| Area | Kegunaannya |
|---|---|
| **Editor** | Membangun dan mengedit karya Anda sendiri |
| **Repositori** | Mencari, menelusuri, membuka, mem-fork, dan menjelajahi karya yang diterbitkan |
| **Halaman pembuat** | Melihat semua yang dibuat satu orang (buka dengan mengeklik nama pembuat mana pun) |
| **Tampilan Dunia** | Terbang di dunia bersama tempat semua karya berada dalam ruang 3D, dan mencari atau menjelajah untuk menemukan sesuatu |
| **Avatar Saya / Rekan / Percakapan** | Bagaimana Anda terlihat oleh orang lain, dengan siapa Anda terhubung, dan pesan langsung Anda — lihat panduan yang ditautkan di atas |

## Menempatkan balok pertama Anda

1. Klik **Editor** di bilah atas.
2. Di bilah sisi kiri, pastikan alat **Tempatkan** aktif (tekan `2`).
3. Di **Pustaka Bangunan** di bawahnya, buka tab **Balok** dan klik sebuah
   balok — misalnya **Kubus** di bawah **Dasar**.
4. Gerakkan mouse ke viewport 3D. **Bayangan** tembus pandang balok itu
   mengikuti grid.
5. **Klik** untuk menempatkannya.

Selamat — Anda sudah membangun balok pertama Anda! 🎉

### Menumpuk balok

Anda tidak harus membangun di atas tanah. Arahkan penunjuk ke **sisi**
balok yang sudah ada, dan bayangannya menempel ke sisi itu — klik untuk
menumpuk di atas, atau menempel di samping. Begitulah cara membangun
dinding, menara, dan atap.

## Menyimpan pekerjaan Anda

Tekan **Ctrl+S** (atau klik **Simpan** di bilah alat). Penanda
**● Perubahan belum disimpan** berubah menjadi **Tersimpan**.

Karya Anda disimpan di browser Anda, jadi masih ada saat Anda kembali.
Selama Anda mengedit, ForkBuild juga menyimpan salinan pemulihan dari
perubahan yang belum disimpan, dan menawarkan untuk memulihkannya jika
halaman tertutup sebelum Anda menyimpan.

Browser membatasi berapa banyak yang boleh disimpan setiap situs, biasanya
sebagian dari disk. Jika jatah ForkBuild penuh, penyimpanan dan pemulihan
berhenti dengan pesan yang menjelaskannya; tidak ada yang sedang terbuka
yang hilang. Gunakan **Ekspor** di bilah alat untuk menyimpan salinan
dokumen sebagai file. Saat pertama kali Anda menyimpan, beberapa browser
bertanya apakah ForkBuild boleh menyimpan datanya secara permanen;
mengizinkannya mencegah browser menghapus data saat ruang disk hampir
penuh.

Anda tidak perlu masuk untuk membangun. Masuk menjadi penting begitu Anda
menerbitkan atau bekerja dengan orang lain: karya yang Anda terbitkan
tanpa masuk tidak memiliki pembuat dan tanda tangan, jadi tidak dapat
dibagikan kepada rekan atau didistribusikan nanti. Masuklah dulu, lalu
terbitkan.

## Apa selanjutnya?

- Pelajari perangkat membangun selengkapnya di
  **[Editor](02-TheEditor.md)**.
- Siap berbagi? Lanjut ke
  **[Penerbitan & Fork](04-PublishingAndForking.md)**.
- Siapkan identitas, avatar, dan koneksi Anda di
  **[Identitas & Masuk](05-IdentityAndLogin.md)**,
  **[Avatar & Kehadiran](06-AvatarsAndPresence.md)**, dan
  **[Koneksi Rekan & Teman](07-PeerConnectionsAndFriends.md)**.
