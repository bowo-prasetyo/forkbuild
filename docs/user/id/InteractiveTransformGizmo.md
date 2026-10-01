<!-- translation-of: docs/user/InteractiveTransformGizmo.md source-hash: abe609dc8dec857e -->
# Gizmo Transformasi Interaktif

<!-- languages -->
[English](../InteractiveTransformGizmo.md) · [Deutsch](../de/InteractiveTransformGizmo.md) · [Español](../es/InteractiveTransformGizmo.md) · **Bahasa Indonesia** · [日本語](../ja/InteractiveTransformGizmo.md)
<!-- /languages -->

Setiap kali ada balok yang dipilih di Editor, sebuah gizmo muncul di poros
pilihan itu. Menyeret pegangannya memindahkan atau memutar pilihan dengan
pratinjau langsung; melepaskannya menerapkan perubahan sebagai **satu
langkah urung**. Memilih satu
[instans struktur](02-TheEditor.md#instans-struktur-referensi-hidup)
di Editor menampilkan gizmo yang persis sama, dengan satu perbedaan:
pegangan sumbu Y yang hijau tidak aktif. Ketinggian sebuah penempatan selalu
mengikuti medan di bawahnya — tidak pernah menjadi pegangan yang Anda seret
atau nilai yang Anda ketik.

Gizmo hanya ada di Editor. [Tampilan Dunia](03-WorldView.md) adalah ruang jelajah yang hanya dapat dilihat; untuk
mengembangkan sesuatu yang Anda temukan di sana, gunakan tombol **Edit
Salinan** untuk membukanya di sini, di Editor.

## Gizmo

```
    Y
    ↑
    │
    │
    ●──────→ X        ●  poros
   /
  /
 Z

    ◯
  ◯ ● ◯               cincin rotasi (sumbu Y)
    ◯
```

| Pegangan | Warna | Fungsinya |
|---|---|---|
| Panah sumbu | Merah (X) | Seret untuk memindahkan sepanjang X saja |
| Panah sumbu | Hijau (Y) | Seret untuk memindahkan sepanjang Y saja |
| Panah sumbu | Biru (Z) | Seret untuk memindahkan sepanjang Z saja |
| Bantalan tengah | Kuning tua | Memindahkan bebas di bidang tanah (X + Z) |
| Cincin rotasi | Ungu | Seret untuk memutar di sekitar poros |

Pegangan menyala saat Anda mengarahkan penunjuk ke atasnya, dan bersinar
lebih terang selama Anda menyeretnya. Gizmo tetap berukuran nyaman di layar
seberapa jauh pun Anda memperkecil tampilan.

## Poros

Penanda putih di tengah gizmo adalah **poros**:

```
┌───────────────┐
│ ■           ■ │
│               │
│       +       │ ← poros (pusat batas pilihan)
│               │
│ ■           ■ │
└───────────────┘
```

- Pilih satu balok → poros berada di pusat balok itu.
- Pilih beberapa balok → poros berada di pusat kotak yang melingkupi
  semuanya.
- Rotasi selalu terjadi di sekitar poros.

Poros mengikuti pilihan Anda secara otomatis: pilih A, lalu tambahkan B,
lalu urungkan sebuah pemindahan — gizmo menempatkan dirinya ulang setiap
kali.

## Memindahkan

1. Pilih satu balok atau lebih.
2. Pegang pegangan sumbu untuk memindahkan sepanjang sumbu itu, atau
   bantalan tengah untuk bergerak bebas di sepanjang tanah.
3. Pilihan mengikuti penunjuk secara langsung.
4. Lepaskan untuk menerapkan.

## Memutar

1. Pilih satu balok atau lebih.
2. Seret cincin ungu. Pilihan berputar di sekitar poros selama Anda
   menyeret.
3. Lepaskan untuk menerapkan.

Untuk pilihan ganda, setiap balok mengorbit di sekitar poros bersama *dan*
berputar dengan sudut yang sama — susunannya tetap mempertahankan
bentuknya.

## Menerapkan, membatalkan, tidak melakukan apa-apa

| Anda… | Hasilnya |
|---|---|
| Melepas mouse | Perubahan diterapkan — **tepat satu** entri di riwayat urung, berapa pun balok yang berpindah |
| Menekan `Escape` di tengah seretan | Batal — semuanya kembali tepat seperti semula; riwayat tidak tersentuh |
| Klik-lepas tanpa bergerak | Tidak ada apa-apa — tidak ada perintah, tidak ada entri riwayat |

`Ctrl/Cmd+Z` mengurungkan seluruh gerakan dalam satu langkah;
`Ctrl/Cmd+Y` (atau `Ctrl/Cmd+Shift+Z`) mengulanginya.

## Selama Anda menyeret, gerakan itu menguasai penunjuk

Selama menyeret, kamera tidak akan mengorbit, tidak ada hal lain yang dapat
dipilih, dan pintasan diabaikan — seretan tidak bisa secara tidak sengaja
berebut dengan kamera. Melepas (menerapkan) atau `Escape` (membatalkan)
mengembalikan semuanya seperti biasa. Melepas mouse *di luar* viewport
tetap menerapkan dengan benar.

## Grup

Memilih sebuah grup memilih balok-balok anggotanya — dan gizmo
memperlakukannya persis seperti pilihan ganda lainnya:

- Menyeret memindahkan setiap anggota; memutar memutar setiap anggota di
  sekitar poros bersama.
- Grupnya sendiri tidak tersentuh: keanggotaan tidak pernah berubah
  karena transformasi. (Gizmo bahkan tidak tahu grup itu ada.)
- Satu kali urung mengembalikan setiap anggota ke tempatnya semula.

## Snapping

Seretan secara bawaan di-snap — 1 Unit Dunia untuk pemindahan (langkah yang
sama dengan dorongan tombol panah) dan 15° untuk rotasi (lebih halus
daripada putaran 90° dari `R`). Tahan **Shift** saat menyeret untuk **mode
presisi**: 0,1× kelipatan normal (0,1 Unit Dunia, 1,5°), untuk penyesuaian
halus yang terlalu kasar bagi grid bawaan.

**Panel angka** dan **perataan/penyebaran** sengaja menjadi pengecualian —
keduanya selalu menerapkan nilai tepat atau hasil geometris tepat yang Anda
minta, tanpa snapping, karena Anda sudah mengetik (atau meminta) sesuatu
yang presisi.

## Tabrakan memblokir penerapan

Memindahkan atau memutar pilihan memeriksa hasilnya terhadap setiap balok
*di luar* pilihan sebelum diizinkan mendarat. Jika ada anggota yang akan
bertumpuk dengan sesuatu yang sudah ada, melepas di sana tidak menerapkan —
setiap balok dalam pilihan kembali tepat ke tempatnya semula, tanpa entri
urung baru, sama seperti melepas satu balok di atas sel yang terisi menolak
kliknya. Menata ulang balok *di dalam* pilihan yang sama (misalnya dua
anggota bertukar tempat karena rotasi) tidak pernah dianggap tabrakan.
Pemeriksaan ini berlaku sama untuk seretan gizmo, dorongan keyboard, dan
rotasi; perataan, penyebaran, dan panel angka tidak dibatasi olehnya,
karena semuanya menghitung hasil yang tepat dan disengaja, bukan pemindahan
bebas.

## Apa yang tidak dilakukan gizmo

- **Skala** — balok tidak dapat diubah ukurannya, jadi tidak ada pegangan
  skala.
- **Seret-duplikat** — tidak ada tombol pengubah untuk menyalin sambil
  menyeret; gunakan `Ctrl/Cmd+D` untuk menduplikasi pilihan di tempat
  terlebih dahulu (lihat
  [Editor](02-TheEditor.md#salin-tempel-dan-duplikat)), lalu seret
  salinannya.

## Kiat

- Arahkan penunjuk ke cincin rotasi dan seret perlahan untuk kendali yang
  halus — busur penunjuk kecil di dekat poros tetap presisi, karena rotasi
  diukur sebagai sudut, bukan jarak.
- Gunakan pegangan sumbu saat Anda ingin menjaga dua koordinat tetap
  sempurna — batasannya tepat, bukan sekadar visual.
- Gabungkan cara: dorong dengan tombol panah untuk langkah satu unit penuh,
  lalu selesaikan dengan seret sambil menahan Shift untuk penempatan yang
  halus. Urung/ulangi memperlakukan keduanya sama — satu langkah per
  gerakan.
