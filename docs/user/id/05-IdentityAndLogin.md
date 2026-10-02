<!-- translation-of: docs/user/05-IdentityAndLogin.md source-hash: b7e773ae656ae805 -->
# 05 — Identitas & Masuk

<!-- languages -->
[English](../05-IdentityAndLogin.md) · [Deutsch](../de/05-IdentityAndLogin.md) · [Español](../es/05-IdentityAndLogin.md) · [Français](../fr/05-IdentityAndLogin.md) · **Bahasa Indonesia** · [日本語](../ja/05-IdentityAndLogin.md) · [Português (Brasil)](../pt-BR/05-IdentityAndLogin.md)
<!-- /languages -->

ForkBuild tidak memiliki kata sandi dan tidak ada server akun pusat.
**Identitas Anda adalah pasangan kunci kriptografis yang tersimpan di
browser ini** — kunci yang sama yang menandatangani semua yang Anda bangun,
terbitkan, kirim sebagai pesan, atau pindahkan. Panduan ini membahas cara
membuat, melindungi, dan mencadangkan identitas itu.

## Membuat identitas

Klik **Masuk** di bilah atas. Dialognya menampilkan setiap identitas yang
sudah ada di perangkat ini — klik salah satunya untuk memakainya — atau
buat yang baru:

1. Ketik **nama tampilan**. Inilah yang dilihat orang lain; Anda dapat
   memiliki beberapa identitas dengan nama yang berbeda.
2. Ketik **frasa sandi** (minimal 8 karakter), lalu ketik lagi untuk
   mengonfirmasinya.
3. Klik **Buat & Masuk**.

Ini membuat identitas yang **terlindungi** (ditampilkan dengan 🔒): kuncinya
dienkripsi saat disimpan dan hanya didekripsi, di memori, setelah Anda
memasukkan frasa sandi.

Anda dapat membiarkan frasa sandi kosong, tetapi hanya dengan mencentang
**Buat tanpa frasa sandi**. Itu membuat identitas yang **tidak
terlindungi**: kuncinya disimpan tanpa enkripsi di browser ini, siap
dipakai tanpa pernah meminta apa pun, dan apa pun yang dapat membaca
penyimpanan situs ini dapat menandatangani sebagai Anda. Anda dapat
melindunginya nanti dari **Identitas Saya**.

> Tidak ada pengaturan ulang kata sandi. Untuk identitas yang terlindungi,
> frasa sandi *adalah* satu-satunya cara untuk mendekripsi kuncinya —
> jika hilang, identitas itu hilang, bahkan bagi ForkBuild sendiri.
> Pilihlah yang dapat Anda ingat.

## Brankas: terkunci vs. keluar

Kunci yang sudah didekripsi dari identitas yang terlindungi berada di
sesuatu yang disebut **brankas**. Brankas dapat **terkunci** atau **tidak
terkunci**, dan itu benar-benar pertanyaan yang berbeda dari apakah Anda
sedang masuk:

- **Masuk, tidak terkunci** — semuanya berfungsi seperti biasa.
- **Masuk, terkunci** (🔒 di samping nama Anda di kanan atas) — Anda tetap
  diri Anda sendiri, dan masih dapat menelusuri, membangun, dan menyimpan,
  tetapi apa pun yang memerlukan tanda tangan baru (menerbitkan, menjadi
  dapat ditemukan, bergabung ke lobi) gagal dengan pesan "identity is
  locked" (identitas terkunci) sampai Anda membukanya. Klik **Buka Kunci**
  di samping nama Anda untuk memasukkan frasa sandi, lalu coba lagi.
- **Keluar** — Anda bukan siapa-siapa; buka **Masuk** untuk memilih atau
  membuka identitas lagi.

Brankas terkunci otomatis **15 menit setelah Anda membukanya**, entah Anda
masih memakai aplikasi atau tidak (ini bukan pengatur waktu
ketidakaktifan), atau kapan pun Anda sendiri mengeklik **Kunci** di
**Identitas Saya**. Memuat ulang halaman selalu membuat identitas yang
terlindungi terkunci — kunci yang sudah didekripsi tidak pernah ditulis ke
disk, hanya disimpan di memori — meskipun aplikasi tetap mengingat sebagai
siapa Anda masuk.

## Mengelola identitas — halaman Identitas Saya

Buka **Identitas Saya** di bilah atas untuk melihat setiap identitas yang
ada di perangkat ini, masing-masing dengan status kuncinya sendiri, terlepas
dari identitas mana yang sedang Anda pakai untuk masuk. Dari sini Anda dapat:

- **Membuat** identitas baru (sama seperti dialog masuk).
- **Lindungi dengan Frasa Sandi** — ditampilkan pada identitas yang tidak
  terlindungi (ditandai **⚠ Tidak Terlindungi**). Ini mengenkripsi kunci
  yang ada; identitasnya sendiri tidak berubah, dan identitas itu terkunci
  sampai Anda membukanya.
- **Kunci / Buka Kunci** identitas mana pun secara terpisah.
- **Ganti Frasa Sandi** — mengganti frasa sandi identitas yang terlindungi
  (hanya identitas terlindungi yang menawarkannya). Identitasnya sendiri —
  ID-nya, kunci publiknya, dan setiap tanda tangan yang pernah dibuatnya —
  tidak pernah berubah.
- **Ekspor** — mencadangkannya.
- **Impor** — memulihkan atau menyalin identitas dari file cadangan.
- **Nyatakan Pengganti / Cabut** — menandai identitas sebagai pensiun dan
  digantikan identitas lain (tempelkan ID `did:key:z…` milik
  penggantinya), atau mencabutnya sepenuhnya, secara permanen. Menyatakan
  pengganti tidak mencabut apa pun dengan sendirinya — cabut secara
  terpisah saat peralihan itu harus berlaku. Untuk identitas terlindungi
  yang terkunci, keduanya meminta frasa sandinya, dan menandatangani
  dengannya akan membukanya, persis seperti jika Anda membukanya sendiri.

Hanya satu dari formulir ini (Buka Kunci, Ekspor, Ganti Frasa Sandi,
Nyatakan Pengganti, Cabut) yang terbuka pada satu waktu, pada satu kartu
identitas. Membuka formulir lain, menekan **Batal**, atau menyelesaikan
tindakannya akan menutupnya dan mengosongkan setiap kolom di dalamnya,
sehingga frasa sandi yang Anda ketik tidak pernah tertinggal di halaman.
Pengelola kata sandi browser diberi tahu agar tidak mengisi otomatis kolom
di halaman ini.

Tidak ada ganti nama atau hapus — identitas dimaksudkan untuk bertahan;
jika Anda ingin berhenti memakainya, cabut saja.

## Mencadangkan identitas (ekspor & impor)

Identitas Anda hanya ada di perangkat ini kecuali Anda mencadangkannya.
**Ekspor** menghasilkan file yang dapat diunduh berisi kunci privat Anda
yang terenkripsi:

- Mengekspor selalu meminta frasa sandi identitas itu, bahkan jika saat
  ini tidak terkunci.
- Jika identitasnya tidak terlindungi, ekspor meminta Anda memilih frasa
  sandi (minimal 8 karakter) saat itu juga, hanya untuk melindungi salinan
  di dalam file.

**Impor** membawa identitas yang diekspor ke perangkat atau browser lain:

1. Klik **Impor Identitas**, lalu pilih file yang diekspor (atau tempelkan
   JSON-nya ke kotak di bawahnya). ForkBuild menampilkan pratinjau yang
   aman terlebih dahulu — nama, ID, algoritme, dan apakah Anda sudah
   memilikinya — tanpa mendekripsi apa pun.
2. Masukkan frasa sandi ekspornya untuk benar-benar mengimpornya.

Identitas yang diimpor selalu masuk dalam keadaan **terkunci**, dan Anda
tidak otomatis masuk sebagai identitas itu — buka kuncinya dari Identitas
Saya atau dialog masuk seperti identitas terlindungi lainnya.

File itu juga membawa catatan siklus hidup identitas yang ditandatangani:
pencabutannya, pengganti yang dinyatakannya, dan perangkat yang
diotorisasinya atau yang berhenti diotorisasinya. Mengimpor memulihkan
catatan-catatan itu, sehingga identitas yang dicabut kembali dalam keadaan
dicabut, bukan aktif. Mengimpor file yang lebih baru untuk identitas yang
sudah Anda miliki menambahkan catatan yang belum ada di perangkat, dan
tidak mengubah apa pun selain itu.

Untuk mencadangkan semua identitas sekaligus, bersama semua hal lainnya,
gunakan [Data Anda](13-YourData.md).

File yang diekspor oleh versi ForkBuild sebelumnya tetap dapat diimpor.
File yang diekspor sekarang memakai format lebih baru yang tidak dapat
dibaca versi sebelumnya, jadi perbarui ForkBuild di perangkat lain itu
terlebih dahulu.

## Kunci dari versi sebelumnya

Identitas terlindungi yang dibuat sebelum versi ini memakai format
enkripsi yang lebih lemah. Identitas itu tetap dapat dibuka dengan frasa
sandi yang sama, dan saat pertama kali Anda membukanya (atau
mengekspornya), ForkBuild mengenkripsinya ulang dalam format saat ini.
Tidak ada yang berubah pada identitasnya sendiri.

> Simpan baik-baik file yang diekspor *dan* frasa sandinya. Salah satunya
> saja tidak berguna — dan kehilangan keduanya berarti identitas itu, dan
> semua yang hanya dapat ditandatanganinya, tidak dapat dipulihkan.

## Frasa sandi salah

Lima kali percobaan salah (membuka kunci, mengekspor, atau mengganti frasa
sandi — semuanya berbagi satu hitungan per identitas) memicu jeda 30 detik;
pesan kesalahannya menghitung mundur sisa percobaan, lalu sisa waktu
jedanya. Hitungannya diatur ulang saat halaman dimuat ulang.

## Apa selanjutnya?

Setelah Anda masuk, atur bagaimana Anda terlihat oleh orang lain di
**[Avatar & Kehadiran](06-AvatarsAndPresence.md)**, atau temukan orang
untuk membangun bersama di
**[Koneksi Rekan & Teman](07-PeerConnectionsAndFriends.md)**.
