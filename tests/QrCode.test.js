// The QR Code encoder (core/QrCode.js). The golden symbols below were made
// by an independent encoder (Python's `qrcode` package) for the same text,
// level and mask, so a match means the two agree module for module. While
// it was written, every version at every level was also read back by a
// decoder (zxing-cpp).
import { encodeQrCode, QrErrorCorrection } from '../core/QrCode.js';
import { assert } from './support/Assert.js';

const GOLDEN = [
    {
        text: 'ForkBuild',
        version: 1,
        mask: 7,
        rows: [
            '1fc97f', '104141', '174a5d', '174c5d', '17495d', '105b41', '1fd57f', '000700', '12d0a0', '1eac77',
            '14f9e9', '1d9e4a', '1a7d0b', '0012a8', '1fc03a', '105380', '1746e2', '175a17', '174539', '1048e0',
            '1fdb1e'
        ]
    },
    {
        text: 'https://bowo-prasetyo.github.io/forkbuild/#/pair/AXNhbXBsZS1wYWlyaW5nLWNvZGUtZm9yLXRlc3RzLW9ubHktbm90LWEtcmVhbC1rZXktMDAwMDAwMDAwMDAwMDAwMDAwMDA',
        version: 8,
        mask: 4,
        rows: [
            '1fd870a6db17f', '1041ef6fb2741', '174b02035d35d', '1755eee5e6a5d', '1754777ffa05d', '105bc1c61f441',
            '1fd555555557f', '001908c6bf000', '117fd1fef7bf9', '0617f5bec9ed8', '18fa6da64754c', '0f0008429b3c4',
            '08c013763b118', '03b008f6c8e56', '0c7c3599f2fd0', '1d34172b06856', '1d48cc36933bc', '09162987fa6c8',
            '0fd0929dac14c', '199350793ca76', '04d4935e9f17c', '0c1aeda4c96ce', '19fe017cd97fc', '131169442bd14',
            '1352d65693157', '1d1341c4e8514', '1ff503fc1d3f8', '06ae8d5055204', '17467d12db0f7', '0806572859598',
            '08fe463a5ab0c', '1127acd44dca6', '0e756006db481', '122a3372db69b', '0ded9fd3b23ac', '1b28c02fd6cd7',
            '13de49c6db16c', '0d83517cf8c7b', '08f4850b5373c', '0e0cfa06ee0fd', '1c798afed75f7', '001475c7c971e',
            '1fd6a1d503954', '104d78c6fd11f', '175fcffed7bfd', '17499ccc7b40f', '174615c96dda7', '1040278306906',
            '1fd6078e5fff3'
        ]
    }
];

function hexRows(modules) {
    const width = Math.ceil(modules.length / 4);
    return modules.map((row) => BigInt('0b' + row.map((dark) => (dark ? '1' : '0')).join('')).toString(16).padStart(width, '0'));
}

// The symbol matches the independent encoder's, mask choice included.
for (const golden of GOLDEN) {
    const qr = encodeQrCode(golden.text, { errorCorrection: QrErrorCorrection.MEDIUM });
    assert(qr.version === golden.version, `version ${qr.version} for ${golden.text.length} bytes, expected ${golden.version}`);
    assert(qr.mask === golden.mask, `mask ${qr.mask}, expected ${golden.mask}`);
    assert(qr.size === golden.version * 4 + 17, 'size follows the version');
    const rows = hexRows(qr.modules);
    assert(rows.length === golden.rows.length && rows.every((row, i) => row === golden.rows[i]), `the symbol for "${golden.text.slice(0, 20)}" matches the reference`);
}

// The version grows with the text and with the error correction level.
{
    const link = 'https://bowo-prasetyo.github.io/forkbuild/#/pair/' + 'A'.repeat(88);
    const medium = encodeQrCode(link);
    const high = encodeQrCode(link, { errorCorrection: QrErrorCorrection.HIGH });
    assert(medium.version < high.version, 'more error correction needs a bigger symbol');
    assert(encodeQrCode('a').version === 1, 'one byte fits version 1');
    assert(encodeQrCode('a'.repeat(15)).version === 2, '15 bytes need version 2 at level M (14 fit version 1)');
    assert(encodeQrCode('a'.repeat(14)).version === 1, '14 bytes fit version 1 at level M');
    assert(encodeQrCode('é').version === 1, 'text is encoded as UTF-8');
}

// A forced mask is used as given; the finder patterns stay in the corners.
{
    for (let mask = 0; mask < 8; mask++) {
        const qr = encodeQrCode('ForkBuild', { mask });
        assert(qr.mask === mask, `mask ${mask} is used when forced`);
        const corner = qr.modules.slice(0, 7).map((row) => row.slice(0, 7).map((dark) => (dark ? 1 : 0)).join('')).join('/');
        assert(corner === '1111111/1000001/1011101/1011101/1011101/1000001/1111111', 'the top-left finder pattern is drawn');
    }
}

// Text too long for version 40 is refused rather than cut short.
{
    let threw = false;
    try { encodeQrCode('a'.repeat(3000), { errorCorrection: QrErrorCorrection.HIGH }); } catch { threw = true; }
    assert(threw, 'too much text throws');
}

console.log('QR code encoder tests passed.');
