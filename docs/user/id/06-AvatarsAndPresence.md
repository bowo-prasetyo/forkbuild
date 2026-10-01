<!-- translation-of: docs/user/06-AvatarsAndPresence.md source-hash: 5914df7d440551c6 -->
# 06 — Avatar & Kehadiran

<!-- languages -->
[English](../06-AvatarsAndPresence.md) · [Deutsch](../de/06-AvatarsAndPresence.md) · [Español](../es/06-AvatarsAndPresence.md) · **Bahasa Indonesia** · [日本語](../ja/06-AvatarsAndPresence.md) · [Português (Brasil)](../pt-BR/06-AvatarsAndPresence.md)
<!-- /languages -->

**Avatar** Anda adalah cara orang lain melihat Anda di Tampilan Dunia —
penampilannya, posisinya, dan cara bergeraknya. Panduan ini membahas cara
menyesuaikannya, mengatur siapa yang dapat melihatnya, dan berinteraksi
dengan avatar orang lain.

## Menyesuaikan avatar Anda

Buka **Avatar Saya** di bilah atas:

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

Menerbangkan kamera ([Tampilan Dunia](03-WorldView.md#terbang-berkeliling)) adalah salah satu cara bergerak, tetapi Anda juga dapat
menjalankan avatar Anda secara langsung dengan **Mode Kendali Avatar**.
Untuk menyalakannya, Anda harus masuk dengan avatar yang tersimpan di
**Avatar Saya**; lalu centang **Kendalikan Avatar Saya (WASD, Shift,
Spasi)** di bagian **Avatar** pada Tampilan Dunia. Tombol-tombolnya tidak
melakukan apa pun sebelum itu, dan diabaikan selama kolom teks sedang
fokus — klik tampilan 3D terlebih dahulu.

| Tombol | Tindakan |
|---|---|
| **W / A / S / D** | Bergerak / berbelok |
| **Shift** | Berlari (bergerak lebih cepat) |
| **Space** | Melompat |
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

**Ikuti Avatar** menjaga kamera tetap terkunci pada avatar Anda saat
bergerak, alih-alih mengorbit bebas. Anda juga dapat mengikuti avatar
pemain lain untuk melihat ke mana mereka pergi.

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

Beberapa dunia menempatkan sepeda, sepeda motor, mobil, atau drone yang
dapat dinaiki avatar Anda alih-alih berjalan. Berjalanlah cukup dekat ke
salah satunya dan sebuah petunjuk muncul yang memberi tahu tombol mana
untuk menaikinya:

| Tombol | Tindakan |
|---|---|
| **E** (dekat kendaraan) | Naik |
| **E** (saat menaiki) | Turun |
| **W / S** | Mempercepat / mundur |
| **A / D** | Memutar arah hadap avatar Anda sendiri — belokan berkelanjutan yang sama seperti saat berjalan kaki, bukan kemudi kendaraan |
| **← / →** (tekan) | Mengemudi — satu belokan 45° pada arah tujuan kendaraan per tekan; menahan tombol tidak membuatnya terus berbelok, dan setiap belokan memerlukan tekanan baru |
| **Ctrl** (ditahan) | Mengerem |

Setelah naik, **W/S** dan **Ctrl** mengendarai kendaraan, sedangkan
**←/→** mengemudikannya — tidak ada "mode mengemudi" terpisah yang perlu
dinyalakan. **A/D** tetap memutar tubuh avatar Anda sendiri, persis seperti
saat berjalan kaki, dan terpisah dari kemudi. Turun dari kendaraan
mengembalikan avatar Anda berjalan kaki di tempat kosong di samping
kendaraan. Kecepatan tertinggi, percepatan, pengereman, dan belokan sebuah
kendaraan semuanya bergantung pada jenisnya, dan jejak tabrakannya
disesuaikan — saat ini itu sepeda, sepeda motor, mobil, dan drone, empat
kendaraan yang benar-benar ditempatkan dan digambar di dunia. Sepeda motor
lebih cepat daripada sepeda dan lebih jarang ditemukan, mobil lebih cepat
lagi daripada sepeda motor dan lebih jarang lagi, dan drone adalah yang
tercepat dan paling langka.

Drone diam di tanah, persis seperti tiga lainnya, sampai Anda menaikinya
dan mulai bergerak — menahan **W** atau **S** mengangkatnya dari tanah;
melepasnya membawanya turun kembali. Begitu terbang, drone melayang di atas
pepohonan, tetapi bangunan tinggi tetap menghalanginya persis seperti
menghalangi mobil, jadi terbang tidak berarti mengabaikan bentuk dunia itu
sendiri. Anda tidak dapat turun dari drone di udara — bawa kembali ke tanah
terlebih dahulu.

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
sepeda, sepeda motor, mobil, atau drone Anda digambar di bawah Anda di
layar mereka, menghadap ke arah Anda melaju, dan mereka mendengar suara
mesinnya, saat Anda naik dan turun, serta pengereman Anda (lihat "Sound" di
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
menempatkannya, tidak pernah menjauh lebih dari beberapa langkah.
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
menambahkan [penanda](03-WorldView.md#penanda--menandai-tempat-yang-layak-diingat), menghiasi memerlukan Anda masuk dengan akses EDIT ke
Dunia tempat Anda berada. Di Dunia terbitan orang lain, hiasannya masuk ke
salinan Anda sendiri — selama lisensinya mengizinkan fork. Jika semua itu
tidak berlaku, **G** tidak melakukan apa-apa; tombol **Hiasi** di pad
sentuh justru memberi tahu alasannya.

### Penghuni

Sebuah Dunia dapat memiliki **penghuni**: orang-orang yang tinggal di sana
dan berjalan-jalan di sekitar tempat yang mereka sebut rumah, menjalani hari
di antara bangunan Anda. Untuk menambahkannya, berdirilah di tanah terbuka
tempat Anda ingin mereka tinggal dan tekan **R** (atau klik **Tambahkan
Penghuni di Sini** di bagian **Avatar**). Penghuni muncul tepat di samping
Anda, dan sejak itu menjadi bagian dari konten Dunia itu sendiri —
disimpan, diterbitkan, dan di-fork bersamanya, seperti
[penanda](03-WorldView.md#penanda--menandai-tempat-yang-layak-diingat). Menambahkannya memerlukan Anda masuk dengan akses EDIT ke
Dunia tempat Anda berada; di Dunia terbitan orang lain, penghuninya masuk
ke salinan Anda sendiri. Berubah pikiran? Berdirilah di samping penghuni
dan tekan **R** lagi (petunjuk menampilkan **[R] Hapus Penghuni**), atau
urungkan dengan **Ctrl/Cmd+Z**.

Penghuni tetap berada dalam jarak sekitar enam langkah dari rumah. Mereka
berjalan memutari dinding, pohon, dan air, tidak pernah menembusnya, dan
sesekali beristirahat untuk berdiri dan melihat sekeliling. Setiap orang
yang membuka Dunia itu melihat setiap penghuni di tempat yang sama pada
saat yang sama, karena posisi mereka berasal dari Dunia dan jam, bukan dari
apa pun yang dikirim antarpemain. Mereka padat: Anda menabrak mereka
seperti menabrak pohon. Namun mereka tidak berhenti atau menyingkir untuk
Anda, jadi seorang penghuni bisa saja berjalan menembus Anda saat Anda
berdiri diam.

Penghuni memperhatikan Anda. Saat seorang penghuni sedang berdiri dan Anda
berada di depan atau di sampingnya, dalam beberapa langkah, ia berbalik
menghadap Anda, dan jika Anda berjalan tepat ke dekatnya, ia melambaikan
tangan. Ia melambai sekali setiap kali Anda datang. Seperti hewan, ini
hanya terjadi di layar Anda, dan hanya untuk avatar Anda sendiri.

Penghuni juga mengenal lingkungannya. Berdirilah di samping salah satunya
dan tekan **T** (petunjuk menampilkan **[T] Bicara**; bagian Avatar dan pad
sentuh juga memiliki tombol **Bicara**), dan ia memberi tahu satu dua hal
tentang apa yang ada di sekitar, dalam gelembung ucapan di atas kepalanya:
sepeda atau rusa di dekat sini, sebuah penanda, struktur yang ditempatkan
di Dunia (dengan judul dan pembuatnya), seseorang yang ada di sekitar,
tempat ia tinggal, atau bangunan lain yang agak jauh — misalnya *"Ada
bangunan bernama “Hill Fort” karya bob, sekitar 3,6 km ke arah timur
laut."* Jarak dibulatkan dan arah dilihat dari tempat penghuni berdiri
(utara adalah arah yang ditunjuk kompas). Ajak bicara lagi dan ia
menyebutkan hal lain. Gelembungnya hilang setelah beberapa detik, atau
begitu Anda pergi.

Selama gelembung itu muncul, tombol **Fokus** muncul di bagian bawah
tampilan untuk setiap hal yang disebutkannya yang tidak berpindah — penanda,
struktur, bangunan, atau kendaraan (hewan dan orang berpindah, jadi tidak
mendapat tombol). Klik untuk mengayunkan kamera ke sana dan melihat, sama
seperti **Fokus** di panel Lokasi: avatar Anda tetap di samping penghuni,
dan berjalan lagi mengembalikan kamera jika Ikuti Avatar aktif.

Apa yang dikatakan penghuni adalah apa yang diketahui ForkBuild *Anda*:
bangunan di katalog Anda, orang-orang yang hadir bersama Anda, kendaraan dan
hewan yang belum Anda ambil. Orang lain yang berbicara dengan penghuni yang
sama mungkin mendengar hal yang berbeda, dan tidak ada orang lain yang
pernah melihat apa yang dikatakannya kepada Anda. Ia tidak pernah
menyebutkan kendaraan yang Anda simpan atau sedang Anda naiki, kendaraan
yang sedang dinaiki orang lain, atau hewan yang sudah Anda tangkap.
Bangunan disebut dengan judul dan pembuatnya sebagaimana tercantum di
publikasinya, sama seperti di bagian lain aplikasi.

Penghuni memerlukan tanah kering yang terbuka: bukan atap, bukan air, dan
tidak saat Anda sedang berkendara. Bagian Avatar menyebutkan alasannya saat
tidak dapat menambahkan penghuni di tempat Anda berdiri. Penghuni bukan
orang — mereka tidak memiliki profil, tidak pernah muncul di Orang atau
Terdekat, tidak dapat diklik untuk melihat info, dan tidak pernah memberi
Anda misi, tugas, atau hadiah — mereka hanya tinggal di sana, dan memberi
tahu apa yang ada di sekitar saat Anda bertanya.

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
