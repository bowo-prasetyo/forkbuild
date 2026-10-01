<!-- translation-of: docs/user/08-ChatAndConversations.md source-hash: 406b0d8076916c27 -->
# 08 — Obrolan & Percakapan

<!-- languages -->
[English](../08-ChatAndConversations.md) · **Bahasa Indonesia** · [日本語](../ja/08-ChatAndConversations.md)
<!-- /languages -->

Pesan langsung di ForkBuild bersifat rekan-ke-rekan dan **khusus teman** —
lihat [Koneksi Rekan & Teman](07-PeerConnectionsAndFriends.md) untuk cara
berteman dengan seseorang terlebih dahulu.

## Memulai percakapan

Obrolan dibuka dari tombol **Obrolan** milik seorang teman di halaman
**Rekan**, atau dari halaman **Percakapan** di bilah atas — tidak ada jalan
masuk obrolan dari Tampilan Dunia atau dari avatar. Membuka obrolan dengan
seseorang yang saat ini bukan teman (atau yang diblokir) menampilkan
penjelasan alih-alih kotak tulis: yang membuka obrolan adalah pertemanan,
bukan status daring.

## Halaman Percakapan

Menampilkan semua orang yang layak ditampilkan — siapa pun yang memiliki
hubungan yang Anda ingat, pertemanan (termasuk permintaan yang tertunda),
atau riwayat pesan dengan Anda, diurutkan dari aktivitas terbaru. Setiap
baris menampilkan:

- Nama tampilan mereka dan lencana **Daring / Luring**
- Hubungan mereka — Teman, Permintaan pertemanan tertunda, Rekan yang
  dikenal, atau Belum pernah terhubung
- Jumlah pesan yang belum dibaca, dan "N pesan menunggu dikirim" jika ada
  yang diantrekan
- Waktu aktivitas terakhir

Hanya teman saat ini yang tidak Anda blokir yang mendapat tombol **Buka
Obrolan**; baris orang lain mengarahkan Anda kembali ke Rekan. Teman yang
Anda blokir menampilkan "⛔ Diblokir — buka blokir dari Rekan untuk
mengobrol lagi." di tempat tombolnya, dan baris itu langsung diperbarui
begitu Anda memblokir atau membuka blokirnya.

## Tampilan obrolan

Satu transkrip yang dapat digulir antara Anda dan seorang teman: gelembung
pesan berlabel "Anda" atau nama mereka, masing-masing dengan stempel waktu,
dan kotak tulis di bawahnya (hingga 4.000 karakter). Klik **Tampilkan
detail** untuk panel kecil yang melaporkan identitas mereka, hubungan,
pertemanan, status koneksi saat ini, serta jumlah pesan/yang tertunda. Tidak
ada indikator mengetik, penyuntingan, penghapusan, reaksi, lampiran, atau
obrolan grup — sengaja hanya pesan.

## Panggilan suara

Tombol **📞 Panggil** ada di samping kotak tulis setiap kali setidaknya
satu perangkat teman itu yang saat ini dapat dijangkau mendukung suara —
Anda tidak perlu tahu perangkat mana yang akan menjawab; panggilan
menjangkau identitas mereka, bukan satu koneksi tertentu.

- Klik **Panggil** untuk memanggil — Anda akan melihat **Memanggil…**
  sampai mereka menjawab.
- Di sisi penerima, panggilan masuk menampilkan **Terima** / **Tolak**.
- Setelah tersambung, bilahnya menampilkan **Dalam panggilan** serta
  **Bisukan** / **Aktifkan Suara**, dan — begitu mikrofon Anda benar-benar
  terpasang — pilihan **Mikrofon** dan (jika browser Anda mendukungnya)
  **Speaker** yang akan dipakai.
- Tombol akhirnya bertuliskan **Batal** selama Anda masih menunggu mereka
  menjawab, dan **Tutup Panggilan** begitu Anda benar-benar berbicara.

Anda dibatasi satu panggilan pada satu waktu di seluruh perangkat ini —
tombol Panggil dinonaktifkan untuk orang lain selama Anda sedang dalam
panggilan. Jika mikrofon Anda hilang di tengah panggilan (dicabut, izinnya
ditarik), sebuah spanduk kecil memberitahukannya; panggilannya sendiri tetap
berjalan, siapa tahu tersambung kembali.

Panggilan yang berakhir sebelum Anda tersambung menjelaskan alasannya
secara singkat:

| Pesan | Arti |
|---|---|
| **Panggilan ditolak.** | Mereka mengeklik Tolak. |
| **Mereka sedang dalam panggilan lain.** | Mereka sedang sibuk di tempat lain. |
| **Tidak ada jawaban.** | Tidak ada yang menjawab tepat waktu. |
| **Tidak dapat mengakses mikrofon Anda.** | Browser Anda menolak atau tidak memiliki akses mikrofon. |
| **Panggilan gagal terhubung.** | Kegagalan di tingkat koneksi — layak dicoba lagi. |

Panggilan yang ditutup secara biasa (oleh Anda atau mereka) tidak
menampilkan pesan apa pun — bilah panggilan yang menghilang sudah
menceritakan semuanya.

## Mengirim saat seseorang luring

Anda dapat mengirim pesan ke teman yang luring — mereka tidak perlu sedang
terhubung. Pesan itu diantrekan di perangkat dan dikirim otomatis saat
berikutnya kalian berdua terhubung; Anda tidak perlu mengirimnya ulang.
Tidak ada server yang menyimpannya di antaranya, jadi pesan itu menunggu di
perangkat *Anda*: ForkBuild harus terbuka di kedua sisi pada saat yang sama
agar pesan sampai. Pesan yang masih belum terkirim setelah 7 hari dibuang
dan ditandai **Tidak terkirim — kedaluwarsa**. Setiap pesan keluar
menampilkan statusnya sendiri di bawah gelembungnya:

| Status | Arti |
|---|---|
| **Diantrekan — akan dikirim begitu mereka terhubung kembali** | Menunggu mereka daring |
| **Terkirim** | Sudah diserahkan ke jaringan — belum dipastikan sampai |
| **Diterima** | Dipastikan sudah sampai di perangkat mereka |
| **Tidak terkirim — kedaluwarsa** | Tidak pernah sampai tepat waktu dan dibuang |
| **Dilihat** | Mereka sudah membuka percakapan dan membaca sampai pesan ini |

**Dilihat** sepenuhnya otomatis — tidak ada tombol "tandai sudah dibaca".
Cukup membuka atau menyegarkan percakapan untuk memberi tahu pengirim
bahwa Anda sudah membacanya.

## Riwayat Anda

Percakapan disimpan di perangkat ini dan berlanjut tepat dari tempat Anda
berhenti setelah dimuat ulang — pesan, status pengiriman, semuanya. Riwayat
ini **hanya ada di perangkat ini**: tidak ikut ke browser atau komputer
lain, dan tidak ada salinan di server. Setiap percakapan menyimpan 500
pesan terbarunya; yang lebih lama dihapus diam-diam agar penyimpanan tetap
terkendali.

Membatalkan pertemanan atau memblokir seseorang langsung menghentikan
obrolan, bahkan jika koneksi di baliknya secara teknis masih aktif — Anda
tidak memerlukan langkah "putuskan" terpisah.

## Apa selanjutnya?

Kembali ke **[Koneksi Rekan & Teman](07-PeerConnectionsAndFriends.md)**
untuk menemukan lebih banyak orang untuk membangun dan mengobrol bersama,
atau kunjungi lagi **[Tampilan Dunia](03-WorldView.md)** untuk melihat di mana karya semua orang berada.
