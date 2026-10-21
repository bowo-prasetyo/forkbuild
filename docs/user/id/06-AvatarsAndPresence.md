<!-- translation-of: docs/user/06-AvatarsAndPresence.md source-hash: 79dd3fed265f1388 -->
# 06 — Avatar & Kehadiran

<!-- languages -->
[English](../06-AvatarsAndPresence.md) · [Deutsch](../de/06-AvatarsAndPresence.md) · [Español](../es/06-AvatarsAndPresence.md) · [Français](../fr/06-AvatarsAndPresence.md) · **Bahasa Indonesia** · [日本語](../ja/06-AvatarsAndPresence.md) · [한국어](../ko/06-AvatarsAndPresence.md) · [Português (Brasil)](../pt-BR/06-AvatarsAndPresence.md)
<!-- /languages -->

**Avatar** Anda adalah cara orang lain melihat Anda di Tampilan Dunia —
penampilannya, posisinya, dan cara bergeraknya. Panduan ini membahas cara
menyesuaikannya, mengatur siapa yang dapat melihatnya, dan berinteraksi
dengan avatar orang lain.

## Menyesuaikan avatar Anda

Buka **Lainnya → Avatar Saya** (atau klik nama Anda di bilah atas):

1. Pilih **Templat** — jenis tubuh (mis. "Humanoid 01") — dari dropdown.
   Pratinjau datar langsung diperbarui saat Anda memilih.
2. Untuk setiap bagian yang dinyatakan templat itu (templat bawaan
   menawarkan **kulit, rambut, baju, celana**), pilih salah satu opsi dari
   dropdown-nya, dan warnanya jika templat mengizinkan.
3. Nyalakan atau matikan **aksesori** yang ditawarkan templat, dari daftar
   centang. (Bagian mana pun yang mengizinkan beberapa pilihan sekaligus
   ditampilkan sebagai daftar centang seperti ini; halaman menampilkan
   tepat bagian-bagian yang dinyatakan templat yang dipilih.)
4. Atur **Nama tampilan** Anda (hingga 60 karakter) — inilah nama yang
   ditampilkan bersama avatar Anda dan di Rekan/Percakapan.
5. Klik **Simpan**.

Mengganti templat mengatur ulang penampilan ke nilai bawaan templat itu —
pilihan tidak dibawa dari satu templat ke templat lain. Tidak ada pratinjau
3D di sini; Anda melihat avatar Anda yang sebenarnya saat pertama kali Anda
(atau orang lain) melihatnya di Tampilan Dunia.

## Siapa yang dapat melihat Anda: dua pengaturan terpisah

Halaman Avatar Saya memiliki dua kontrol visibilitas yang terpisah. Keduanya
mudah tertukar, jadi bedakan baik-baik:

| Pengaturan | Mengatur |
|---|---|
| **Visibilitas Kehadiran** | Siapa yang menerima *posisi langsung* Anda — apakah dan di mana Anda tampil bergerak di Tampilan Dunia |
| **Visibilitas Profil** | Siapa yang menerima *penampilan* Anda — templat, warna, aksesori, nama tampilan |

Keduanya menawarkan empat tingkat yang sama, dan keduanya dimulai dari
**Publik**:

- **Publik** — siapa pun yang terhubung dapat melihatnya.
- **Teman** — teman bersama, ditambah identitas yang Anda cantumkan secara
  eksplisit (tempelkan ID identitas, satu per baris). Ini daftar izin
  biasa, bukan alur permintaan/persetujuan — lihat
  [Koneksi Rekan & Teman](07-PeerConnectionsAndFriends.md) untuk arti
  "teman".
- **Lokal** — hanya tab ForkBuild lain yang terbuka di browser yang sama
  ini; tidak pernah dikirim ke rekan mana pun, bahkan ke teman.
- **Tersembunyi** — tidak pernah disiarkan, kepada siapa pun. Inilah cara
  Anda menjadi tidak terlihat.

Setiap bagian memiliki tombol **Simpan** sendiri — menyimpan satu bagian
tidak pernah menyimpan yang lain. "Tersimpan." muncul setelah menyimpan dan
hilang begitu Anda mengubah bagian itu lagi, jadi selalu menggambarkan apa
yang sedang Anda lihat.

Menjadi teman seseorang **tidak** dengan sendirinya memperlihatkan avatar
Anda — kedua pengaturan ini yang menentukan apa yang benar-benar dibagikan,
secara terpisah satu sama lain. Dan keduanya hanya memengaruhi pembaruan
*berikutnya*: orang yang sudah menerima posisi atau penampilan Anda tetap
menyimpan apa yang mereka punya; tidak ada "lupakan saya" dari jarak jauh.

Anda juga dapat menyalakan atau mematikan **Tampilkan Avatar Saya** dan
**Tampilkan Avatar Lain** langsung di Tampilan Dunia, sebagai sakelar
tampilan sederhana di sisi Anda. Sampai Anda memiliki avatar sendiri,
bagian Avatar di Tampilan Dunia hanya menampilkan **Tampilkan Avatar Lain**
dan catatan cara membuatnya; kontrol yang memerlukan avatar Anda muncul
setelah Anda memilikinya.

## Melihat orang lain di Tampilan Dunia

Siapa pun yang kehadirannya boleh Anda terima (menurut Visibilitas
Kehadiran mereka sendiri) muncul otomatis saat Anda bergerak — tidak
perlu permintaan pertemanan untuk melihat avatar publik. Klik sebuah avatar
(atau entri di panel **Avatar Terdekat** — daftar sederhana semua orang di
dekat Anda, dengan jarak dan animasi saat ini) untuk membuka **Panel Info
Avatar**:

- Nama tampilan dan templat avatar
- Baris status — **Hadir / Usang / Tidak hadir**, dan label kepercayaan
  (**Tepercaya / Tidak ditandatangani / Bertentangan**) yang menjelaskan
  seberapa terverifikasi data avatar ini
- Posisi, jarak (dalam Unit Dunia), dan animasi saat ini (Berjalan, Diam,
  …)
- **Ikuti Avatar** — mengunci kamera Anda pada gerakan mereka
- **Sapa / Lambaikan Tangan / Tunjuk** — mengirim gestur sekali ke avatar
  itu
- **Ikuti Karya Mereka** — mengikuti identitas di balik avatar itu, sehingga
  karya baru mereka muncul di halaman **Diikuti** (lihat
  [Mengikuti orang](07-PeerConnectionsAndFriends.md#mengikuti-orang)).
  Tombol ini hanya muncul saat kehadiran avatar itu ditandatangani, karena
  tanda tanganlah yang membuktikan milik siapa avatar itu.

Selain itu, avatar orang lain hanya dapat dilihat — tidak ada cara untuk
memindahkan, mengedit, atau menghapus avatar orang lain, hanya melihat,
mengikuti, dan memberi gestur.

Apakah avatar di dekat Anda muncul atau tidak bergantung pada ke mana
**kamera** Anda sedang melihat, bukan ke arah mana avatar Anda sendiri
berjalan — keduanya dapat menghadap ke arah berbeda, paling sering tepat
setelah Anda mengorbitkan kamera dengan bebas. Seseorang yang berdiri tepat
di jalur jalan Anda bisa sepenuhnya tidak terlihat selama kamera Anda
melihat ke tempat lain; putar atau orbitkan kamera kembali ke arahnya dan
mereka muncul lagi.

## Menjalankan avatar Anda

Menerbangkan kamera ([Tampilan Dunia](03-WorldView.md#terbang-berkeliling))
adalah salah satu cara bergerak, tetapi Anda juga bisa menjalankan avatar
secara langsung dengan **Mode Kendali Avatar**, yang sudah menyala saat
Tampilan Dunia dibuka (**Kendalikan Avatar Saya (WASD, Shift, Spasi)** di
**Pengaturan avatar**). Tombol diabaikan selama kolom teks sedang aktif —
klik tampilan 3D terlebih dahulu.

Anda tidak perlu nama untuk berjalan. Sampai Anda memilih nama, Anda
berjalan sebagai **tamu**: avatar dengan tampilan bawaan yang hanya Anda
lihat dan tidak diberitahukan kepada siapa pun. Tamu bisa berbicara dengan
penghuni, tetapi tidak bisa menambah atau menghapusnya atau menghias Dunia
dengan hewan, karena itu perubahan yang ditandatangani dengan nama. Pilih
nama (saat menerbitkan, dengan **Jalan di sini bersamaku**, atau dengan
**Pilih nama** di bilah atas) dan avatar itu menjadi milik Anda di tempat
ia berdiri, dengan tampilan yang disimpan di **Avatar Saya**, dan orang
lain bisa melihatnya. **Ganti nama → Lanjut tanpa nama** menjadikannya tamu
lagi.

| Tombol | Tindakan |
|---|---|
| **W / A / S / D** | Bergerak / berbelok |
| **Shift** | Berlari (bergerak lebih cepat) |
| **Space** | Melompat; di air dalam, berenang naik |
| **C** (ditahan, di air dalam) | Menyelam |
| **Alt + W / S** | Berjalan terus maju/mundur tanpa menyentuh — tetap bergerak setelah Anda melepas tombol |
| **Alt + Shift + W / S** | Sama, tetapi berlari alih-alih berjalan |

Di ponsel atau tablet, joystick dan tombol di layar menggantikan
tombol-tombol ini: dorong joystick untuk berjalan dan sampai ke tepinya
untuk berlari, lalu ketuk **Lompat**. Lihat
[Layar sentuh](ControlsReference.md#berjalan-tampilan-dunia).

Berjalan memperhatikan tabrakan dengan bangunan, pohon, dan satwa liar di
dekatnya yang sudah dimuat — Anda tidak dapat berjalan menembus struktur
yang dimuat di sekitar Anda, menembus pohon yang dihasilkan sebagai bagian
dari medan, atau menembus rusa atau kelinci yang sedang merumput di dekat
Anda (lihat [Tampilan Dunia](03-WorldView.md#terbang-berkeliling)). Satwa liar hanya menghalangi jalan Anda seperti pohon, di mana
pun hewan itu berkeliaran — ia mungkin menoleh untuk memperhatikan Anda,
tetapi tidak pernah menyingkir atau terluka, dan kendaraan melaju
menembusnya begitu saja; hanya berjalan kaki yang terhenti. Hewan yang
sudah Anda tangkap tidak lagi menghalangi apa pun. Avatar Anda dapat
berjalan di atas struktur yang ditempatkan, memanjat permukaan tegak, dan
menyusuri medan yang tidak rata. Kamera mengikuti avatar Anda secara alami
saat Anda bergerak.

Pintu dan lengkungan adalah jalan masuk. Pintu berayun terbuka, menjauh
dari Anda, saat Anda mendekatinya, lalu menutup di belakang Anda; pintu juga
terbuka untuk penghuni dan untuk orang yang Anda lihat, dan tidak ada orang
lain yang melihat pintu yang Anda buka. Anda berjalan melewati bukaan
lengkungan, dan sisi serta puncaknya sepadat kelihatannya. Lengkungan kecil
terlalu rendah untuk dilewati, dan pintu atau lengkungan yang dimiringkan ke
samping menghalangi Anda seperti balok lainnya.

**Ikuti Avatar** menjaga kamera tetap terkunci pada avatar Anda saat
bergerak, alih-alih mengorbit bebas. Anda juga dapat mengikuti avatar
pemain lain untuk melihat ke mana mereka pergi.

### Berenang dan menyelam

Air setinggi paling banyak setengah tinggi avatar Anda dilalui dengan
berjalan, makin lambat makin dalam airnya. Lebih dalam dari itu, avatar
Anda berenang: ia mengapung dengan kepala di atas permukaan, dan bergerak
seperti di darat, hanya lebih lambat. Tahan **C** untuk menyelam dan
**Space** untuk berenang naik kembali; lepaskan keduanya dan ia perlahan
naik ke permukaan. Dalam sudut pandang orang pertama Anda melihat dunia di
atas air saat mengapung, dan dunia di bawahnya saat menyelam.

Di dalam air avatar Anda menahan napas. Bilah **Udara** di bagian atas
tampilan menunjukkan sisanya: dua setengah menit dari napas penuh. Saat
habis, avatar Anda didorong naik ke permukaan dan tetap di sana beberapa
detik untuk mengambil napas sebelum dapat menyelam lagi. Berenanglah ke
tepi dan ia akan berdiri lalu berjalan keluar.

Orang lain juga melihat Anda berenang dan menyelam: cara avatar Anda
bergerak di air ditentukan dari posisinya, jadi tidak ada yang dikirim
tambahan.

### Sudut Pandang Kamera

Di samping Ikuti Avatar ada **Kamera**, sederet empat tombol — **Bebas**,
**Orang Pertama**, **Orang Ketiga**, dan **Pandangan Burung** — untuk
mengunci kamera Anda pada jarak tetap dari avatar Anda sendiri alih-alih
menerbangkannya sendiri. Seperti Ikuti Avatar, tombol-tombol ini
memerlukan avatar lokal (Avatar Saya) agar aktif.

- **Bebas** adalah kamera orbit biasa — bawaan Tampilan Dunia, dan yang
  diasumsikan oleh setiap kontrol kamera lain di panduan ini.
- **Orang Pertama** menempatkan kamera setinggi mata avatar Anda sendiri,
  melihat ke arah yang dihadapinya.
- **Orang Ketiga** berada di belakang dan di atas avatar Anda, sedikit
  melihat ke bawah — bingkai klasik "melihat karakter Anda sendiri".
- **Pandangan Burung** melihat lurus ke bawah dari ketinggian, mengikuti
  posisi avatar Anda tetapi sengaja mengabaikan arah hadapnya, sehingga
  tampilan tidak pernah berputar saat Anda berbelok.

Mengeklik tombol yang sudah aktif mengembalikannya ke **Bebas**. Sudut
Pandang Kamera sepenuhnya lokal — tidak pernah dibagikan kepada
kolaborator dan tidak pernah memengaruhi apa yang mereka lihat.

Kedua mode berperilaku berbeda saat Anda berbelok: dengan Sudut Pandang
terkunci (Orang Pertama atau Orang Ketiga), kamera membingkai ulang dirinya
ke arah hadap avatar Anda saat ini pada setiap gerakan, sehingga tampilan
Anda berputar persis seperti Anda. Dengan **Bebas** dipilih, kamera
sengaja tidak memedulikan arah — berbelok di tempat, berjalan, atau
menaiki kendaraan tidak pernah memindahkan atau memutarnya dengan sendirinya,
hanya seret/geser/zoom Anda sendiri yang melakukannya. Jika Anda
mengorbitkan kamera bebas untuk melihat ke satu arah lalu berjalan ke arah
lain, kamera tetap melihat ke mana terakhir Anda arahkan, alih-alih
mengikuti Anda.

### Bergerak terus tanpa menyentuh

Menahan **Alt** sambil mengetuk **W** atau **S** membuat avatar Anda
berjalan (atau, dengan **Shift** juga ditahan, berlari) ke arah itu
secara terus-menerus — tetap bergerak bahkan setelah Anda melepas semua
tombol, persis seperti kendali jelajah (cruise control). Mengetuk **W** atau
**S** lagi *tanpa* menahan Alt membatalkannya dan kembali ke gerakan biasa
selama tombol ditahan; mengetuk arah sebaliknya dengan cara yang sama juga
membatalkannya, alih-alih membalik arahnya. Di keyboard tidak ada penanda
di layar bahwa mode ini aktif — satu-satunya tanda adalah avatar Anda terus
berjalan sendiri.

Di ponsel atau tablet, tombol **Jelajah Otomatis** di pad sentuh melakukan
hal yang sama: ketuk sekali untuk berjalan maju tanpa menyentuh, sekali lagi
untuk berlari, dan ketiga kalinya untuk berhenti. Tombol itu bertuliskan
**Jelajah Otomatis: Jalan** atau **Jelajah Otomatis: Lari** selama aktif.
Mendorong joystick ke depan atau ke belakang juga menghentikannya, sama
seperti mengetuk **W** atau **S**; mendorongnya ke samping hanya membelokkan
Anda, jadi Anda dapat mengemudi selama jelajah otomatis.

### Kendaraan

Beberapa dunia menempatkan sepeda, sepeda roda tinggi, gerobak jerami, atau balon udara yang dapat dinaiki avatar Anda alih-alih berjalan. Berjalanlah cukup dekat ke
salah satunya dan sebuah petunjuk muncul yang memberi tahu tombol mana
untuk menaikinya:

| Tombol | Tindakan |
|---|---|
| **E** (dekat kendaraan) | Naik |
| **E** (saat menaiki) | Turun |
| **W / S** | Mempercepat / mundur |
| **A / D** | Berbelok — belokan kendaraan yang halus dan berkelanjutan, bersama Anda di atasnya |
| **← / →** (tekan) | Mengemudi — satu belokan 45° kendaraan per tekan; menahan tombol tidak membuatnya terus berbelok, dan setiap belokan memerlukan tekanan baru |
| **Ctrl** (ditahan) | Mengerem |

Setelah naik, **W/S** dan **Ctrl** mengendarai kendaraan, sedangkan
**A/D** dan **←/→** membelokkannya — tidak ada "mode mengemudi" terpisah
yang perlu dinyalakan. Anda selalu menghadap ke arah kendaraan Anda, dan
pemain lain juga melihat Anda begitu. Kendaraan hanya berbelok saat
bergerak, jadi berbelok saat berhenti tidak berpengaruh; saat mundur,
kendaraan bergerak ke belakang tanpa berputar balik. Turun dari kendaraan
mengembalikan avatar Anda berjalan kaki di tempat kosong di samping
kendaraan. Kecepatan tertinggi, percepatan, pengereman, dan belokan sebuah
kendaraan semuanya bergantung pada jenisnya, dan jejak tabrakannya
disesuaikan — saat ini itu sepeda, sepeda roda tinggi, gerobak jerami, dan balon udara, empat
kendaraan yang benar-benar ditempatkan dan digambar di dunia. Sepeda roda tinggi lebih cepat daripada sepeda dan lebih jarang ditemukan, gerobak jerami lebih cepat lagi dan lebih jarang lagi, dan balon udara adalah yang tercepat dan paling langka.

Balon udara diam di tanah, persis seperti tiga lainnya, sampai Anda menaikinya
dan mulai bergerak — menahan **W** atau **S** mengangkatnya dari tanah;
melepasnya membawanya turun kembali. Begitu terbang, balon melayang di atas
pepohonan, tetapi bangunan tinggi tetap menghalanginya persis seperti menghalangi gerobak, jadi terbang tidak berarti mengabaikan bentuk dunia itu
sendiri. Anda tidak dapat turun dari balon di udara — bawa kembali ke tanah
terlebih dahulu.

Sepeda, sepeda roda tinggi, dan gerobak berhenti di tepi air. Balon terus terbang
di atas danau dan laut, dan menurunkan Anda di atas air: daratkan, turun,
dan avatar Anda pun berenang. Anda tidak dapat mengeluarkan kendaraan
beroda dari inventaris saat berada di air.

Di darat, kendaraan ini naik ke tanjakan dan ke atas balok seperti Anda
berjalan di atasnya: apa pun yang tidak lebih tinggi dari satu anak tangga,
serta setiap lereng atau tangga. Jadi jembatan yang dibangun seseorang
membawa gerobak menyeberangi sungai yang tidak bisa diseberanginya dengan
cara lain. Keluar dari tepi lantai jembatan dan Anda jatuh kembali ke tanah;
turun di atas jembatan dan Anda berdiri di lantainya.

#### Membawa kendaraan

Menemukan kendaraan jauh dari tempat Anda akan membutuhkannya nanti? Saat
menaikinya, tekan **Q** untuk menyimpannya di inventaris — kendaraan itu
menghilang dari dunia dan Anda turun dalam gerakan yang sama. Berjalanlah
ke tempat lain, tekan **Q** lagi saat tidak menaiki apa pun, dan kendaraan
tersimpan yang dipilih muncul tepat di tempat Anda berdiri, sudah dalam
keadaan dinaiki. Saat ini tidak ada batas berapa banyak kendaraan yang
dapat Anda bawa sekaligus, dan kendaraan yang disimpan tidak pernah muncul
kembali di tempat Anda menemukannya.

Secara bawaan, **Q** mengeluarkan kendaraan yang terakhir Anda simpan. Jika
Anda membawa lebih dari satu, tekan **[** atau **]** untuk memutar pilihan
mundur atau maju melalui semua yang Anda bawa — petunjuknya menunjukkan
mana yang dipilih dan urutannya (mis. "[Q] Keluarkan Sepeda (1/3)") sehingga
Anda dapat menemukan yang lebih lama tanpa harus mengeluarkan dan menyimpan
ulang satu per satu. Memutar pilihan hanya mengubah apa yang akan
dikeluarkan **Q** berikutnya; tidak pernah memunculkan atau menghapus apa
pun dengan sendirinya.

#### Berkendara di dekat orang lain

Orang yang dapat melihat avatar Anda juga melihat apa yang Anda naiki:
sepeda, sepeda roda tinggi, gerobak, atau balon Anda digambar di bawah Anda di
layar mereka, menghadap ke arah Anda melaju, dan mereka mendengar suaranya melaju, saat Anda naik dan turun, serta pengereman Anda (lihat "Sound" di
[03 — World View](03-WorldView.md)). Anda melihat dan
mendengar milik mereka dengan cara yang sama. Ini mengikuti pengaturan
kehadiran Anda: siapa pun yang tidak dapat melihat Anda juga tidak tahu apa
yang Anda naiki.

Selama orang lain menaiki sebuah kendaraan, salinan kendaraan itu di sisi
Anda menghilang dan Anda tidak dapat menaikinya; kendaraan yang sedang Anda
naiki sendiri selalu tetap milik Anda. Namun, tempat sebuah kendaraan
berdiri saat tidak ada yang menaikinya tidak dibagikan: begitu mereka
turun, kendaraan itu muncul lagi di layar Anda di tempat terakhir Anda
melihatnya berdiri, yang mungkin bukan tempat mereka meninggalkannya.
Kendaraan yang disimpan dengan **Q** atau dikeluarkan di tempat baru juga
hanya ada di layar pemiliknya sampai mereka menaikinya.

### Hewan

Beberapa dunia memiliki satwa liar — rusa di hutan, kelinci di padang
rumput terbuka. Hewan liar berkeliaran perlahan di sekitar tempat dunia
menempatkannya, tidak pernah menjauh lebih dari beberapa langkah. Hewan yang petak tanahnya
ditempati bangunan tidak ada, dan tidak bisa ditangkap, sampai bangunan itu
hilang (lihat [Apa yang ada di sekitar Anda](03-WorldView.md#apa-yang-ada-di-sekitar-anda)).
Berjalanlah cukup dekat ke salah satunya dan sebuah petunjuk muncul yang
meminta Anda menekan **F** untuk menangkapnya. Menangkap menambahkannya ke
inventaris Anda (inventaris yang sama dengan tempat kendaraan tersimpan) dan
menghapusnya dari dunia.

Berjalanlah ke tempat lain dan tekan **F** lagi — jika tidak ada yang dapat
ditangkap di dekat Anda, ini melepaskan hewan yang terakhir ditangkap tepat
di tempat Anda berdiri, dan hewan itu langsung dapat ditangkap lagi jika
Anda menginginkannya kembali. Hewan yang dilepaskan tetap di tempat Anda
melepaskannya, tetapi tidak membeku: ia merumput, melihat sekeliling,
sesekali berbalik menghadap arah baru, dan menoleh untuk memperhatikan Anda
saat Anda mendekat.
Saat ini tidak ada batas berapa banyak hewan yang dapat Anda bawa, dan
menangkap hewan tidak pernah mengganggu kendaraan yang juga Anda bawa, atau
sebaliknya — keduanya berbagi ransel yang sama tetapi tidak pernah
tercampur.

#### Menghiasi Dunia dengan hewan

Hewan yang dilepaskan hanya hidup di sesi Anda sendiri. Untuk menjadikannya
bagian tetap dari Dunia — misalnya, seekor kelinci yang duduk di atas
sesuatu yang Anda bangun — berdirilah di samping hewan yang Anda lepaskan
dan tekan **G**. Hewan itu menjadi **hiasan hewan**: disimpan ke dalam
konten Dunia itu sendiri, sehingga ikut saat Dunia itu diterbitkan atau
didistribusikan dan setiap orang yang membukanya melihatnya, tampak persis
seperti hewan asalnya. Hiasan itu tetap di tempat yang Anda pilih (jadi
kelinci di atap tidak pernah berjalan turun), tetapi merumput, melihat
sekeliling, dan berbalik di tempat, dan setiap orang yang membuka Dunia itu
melihatnya melakukan hal yang sama pada saat yang sama.

Hiasan hanya bersifat dekoratif — tidak dapat ditangkap dengan **F**.
Berubah pikiran? Berdirilah di sampingnya dan tekan **G** lagi: hiasan
dihapus dari Dunia dan kembali menjadi hewan hidup yang dapat ditangkap.
Jika keduanya ada di dekat Anda, **G** lebih dulu menghiasi dengan hewan
yang baru dilepaskan, sama seperti **F** lebih memilih menangkap daripada
melepaskan. Hanya hewan yang Anda lepaskan yang dapat dijadikan hiasan —
satwa liar yang ditempatkan dunia sendiri tidak bisa. Petunjuk muncul saat
**G** dapat menghiasi atau mengurungkan sesuatu di dekat Anda. Seperti
menambahkan [penanda](03-WorldView.md#penanda--menandai-tempat-yang-layak-diingat), menghiasi memerlukan sebuah nama dan akses EDIT ke
Dunia tempat Anda berada. Di Dunia terbitan orang lain, hiasannya masuk ke
salinan Anda sendiri — selama lisensinya mengizinkan remix. Jika semua itu
tidak berlaku, **G** tidak melakukan apa-apa; tombol **Hiasi** di pad
sentuh justru memberi tahu alasannya.

### Penghuni

Sebuah Dunia bisa punya **penghuni**: orang yang tinggal di sana dan
berjalan-jalan di sekitar rumahnya, di antara bangunan Anda.

**Menambah dan menghapus penghuni.** Berdirilah di tanah terbuka tempat
Anda ingin ia tinggal lalu tekan **R**, atau klik **Tambahkan Penghuni di
Sini** di bagian **Avatar**. Ia muncul tepat di samping Anda. Untuk
menghapusnya, berdirilah di sampingnya dan tekan **R** lagi (muncul
petunjuk **[R] Hapus Penghuni**), atau urungkan dengan **Ctrl/Cmd+Z**.

- Anda harus bisa mengedit Dunia tempat Anda berada. Di Dunia terbitan
  orang lain, penghuni masuk ke salinan Anda sendiri.
- Penghuni perlu tanah kering yang terbuka: bukan atap atau air, dan tidak
  saat Anda berkendara. Jika tidak bisa ditambahkan, bagian Avatar
  menyebut alasannya.
- Penghuni adalah bagian dari Dunia, seperti
  [penanda](03-WorldView.md#penanda--menandai-tempat-yang-layak-diingat):
  mereka disimpan, diterbitkan, dan disalin bersamanya.

**Cara mereka bergerak.** Penghuni tetap dalam jarak sekitar enam langkah
dari rumahnya. Mereka mengitari dinding, pohon, dan air, tidak pernah
menembusnya, dan sesekali berhenti untuk melihat sekeliling. Semua orang
melihat setiap penghuni di tempat yang sama pada saat yang sama, karena
letaknya berasal dari Dunia dan jam. Pemain yang terhubung menyepakati
satu jam Dunia, jadi perangkat yang jamnya sedikit meleset tetap
menampilkan hal yang sama; hanya waktu yang dikirim antarmereka, tidak
pernah letak seorang penghuni. Anda menabrak penghuni seperti menabrak pohon, tetapi ia tidak menyingkir
untuk Anda, jadi ia bisa berjalan menembus Anda saat Anda diam.

**Menemukan jalan.** Penghuni keluar lewat pintu, berbelok di sudut rumahnya, dan menyusuri jalan ke tempat-tempat yang ia sukai, memutari apa pun yang menghalangi. Saat malam tiba, ia pulang dan tetap di rumah sampai pagi.

**Mereka memperhatikan Anda.** Saat Anda mendekat sampai beberapa langkah,
di depan atau di samping penghuni, ia menoleh menghadap Anda. Datangi
tepat ke sebelahnya dan ia melambai, sekali setiap kali Anda datang.
Seperti hewan, ini hanya terjadi di layar Anda, dan hanya untuk avatar
Anda sendiri.

**Berbicara dengan penghuni.** Berdirilah di sampingnya lalu tekan **T**
(muncul petunjuk **[T] Bicara**; bagian Avatar dan panel sentuh juga
punya tombol **Bicara**). Ia menceritakan sesuatu di dekat situ dalam
gelembung ucapan: sepeda atau rusa, penanda, bangunan dan siapa
pembuatnya, seseorang yang ada di sekitar, tempat tinggalnya, atau
bangunan yang lebih jauh. Misalnya: *"Ada
bangunan bernama “Hill Fort” karya bob, sekitar 3,6 km ke arah timur
laut."*

- Jarak dibulatkan. Arah dihitung dari tempat penghuni berdiri, dengan
  utara ke arah yang ditunjuk kompas.
- Ajak bicara lagi dan ia menyebut hal lain. Gelembungnya hilang setelah
  beberapa detik, atau saat Anda pergi.
- Untuk hal yang tidak berpindah (penanda, bangunan, atau kendaraan),
  tombol **Fokus** muncul di bagian bawah tampilan. Tombol ini mengarahkan
  kamera untuk melihatnya, seperti **Fokus** di Lokasi. Avatar Anda tetap
  di tempatnya, dan berjalan mengembalikan kamera jika Ikuti Avatar aktif.

**Ide untuk lingkungan sekitar.** Setiap kali ketiga, atau saat tidak ada
hal lain untuk diceritakan, penghuni mungkin bertanya-tanya tentang
sesuatu yang belum pernah ada di tanah sekitarnya: jembatan di atas
sungai, dermaga di air, menara pandang di dataran tinggi, atau sumur,
paviliun teduh, lapak pasar, atau pondok di tanah terbuka. Misalnya: *"Belum pernah ada yang membangun jembatan di atas sungai sekitar
30 m ke arah timur."*

- Selama ia mengatakannya, muncul tombol seperti **Bangun jembatan di
  sana**. Tombol itu membuka bangunan baru milik Anda di Editor untuk
  tempat itu, dimulai dari struktur Desa yang sudah jadi, sama seperti
  **Bangun di sini** di Tampilan Dunia. Saat Anda menerbitkannya, ia
  berdiri di sana.
- Itu hanya pikiran, bukan tugas: tidak ada yang diingat, tidak ada yang
  memeriksa, dan tidak ada hadiah.
- Tanah yang sama memberi pikiran yang sama kepada semua orang. Tempat
  yang sudah ada bangunannya di dekat situ tidak punya keinginan apa pun.
- Begitu sesuatu berdiri di sana, penghuni malah mengatakannya, menyebut
  nama bangunan itu jika berjudul, dengan tombol untuk melihatnya.
  Misalnya: *"Seseorang sudah membangun sekitar 14 m ke arah timur, tepat di tempat yang
selalu saya kira cocok untuk sebuah sumur."*

**Yang diketahui penghuni** adalah yang diketahui ForkBuild *Anda*:
bangunan di katalog Anda, orang-orang yang ada di sini bersama Anda, dan
kendaraan serta hewan yang belum diambil siapa pun. Orang lain yang
berbicara dengan penghuni yang sama mungkin mendengar hal berbeda, dan
tidak ada orang lain yang melihat apa yang dikatakannya kepada Anda. Ia
tidak pernah menyebut kendaraan yang Anda simpan atau yang sedang
dikendarai orang, atau hewan yang Anda tangkap. Bangunan disebut dengan
judul dan pembuatnya, seperti di seluruh aplikasi.

Penghuni bukan orang. Mereka tidak punya profil, tidak pernah muncul di
Orang atau Di Sekitar, dan tidak bisa diklik untuk info. Mereka tidak
pernah memberi misi, tugas, atau hadiah: mereka hanya tinggal di sana,
dan menceritakan apa yang ada di sekitar saat Anda bertanya.

#### Apa yang tetap ada setelah dimuat ulang

Inventaris Anda — setiap kendaraan dan hewan yang Anda bawa — disimpan di
perangkat ini, begitu pula kendaraan yang telah Anda tempatkan atau naiki di
suatu tempat dan hewan yang telah Anda lepaskan, tepat di tempat Anda
meninggalkannya. Memuat ulang halaman atau kembali nanti melanjutkan tepat
dari keadaan Anda sebelumnya.

### Kesadaran spasial dan aktivitas

Saat ada orang lain, Anda akan melihat penanda kontekstual yang menunjukkan
apa yang sedang mereka lakukan:

- "**Bob — sedang menjelajah di sekitar**" muncul di dekat avatar mereka
  saat mereka terbang atau berjalan berkeliling.
- "**Alice — sedang memeriksa di sekitar**" menunjukkan seseorang sedang
  mengamati sesuatu dengan saksama, tanpa mengubahnya.

Penanda aktivitas ini diturunkan dari data kehadiran spasial dan membantu
Anda memahami apa yang sedang dilihat orang lain tanpa perlu komunikasi
eksplisit.

Penanda aktivitas hanya menggambarkan apa yang sedang dilakukan seseorang;
penanda itu tidak pernah mengubah apa pun — lihat
[Melihat kolaborator lain](03-WorldView.md#melihat-kolaborator-lain).

## Apa selanjutnya?

Temukan orang untuk terhubung di
**[Koneksi Rekan & Teman](07-PeerConnectionsAndFriends.md)**, lalu
mengobrollah dengan teman Anda di
**[Obrolan & Percakapan](08-ChatAndConversations.md)**.
