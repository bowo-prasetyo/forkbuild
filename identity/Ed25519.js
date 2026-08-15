// Self-contained Ed25519 + SHA-512 primitives for the 0.2.16 trust layer.
//
// Pure BigInt math — no WebCrypto, no network, no dependencies — so the
// signing semantics run identically in every host (browser tests today,
// worker / WebCrypto / wallet adapters later), stay fully deterministic,
// and can be proven correct against published vectors: FIPS 180-4
// SHA-512 and RFC 8032 Ed25519 (asserted in
// tests/DecentralizedIdentity.test.js before anything else).
//
// This is the cryptographic floor of the project: content hashes
// establish WHAT an object is; these primitives establish WHO
// authorized it.
// ------------------------------------------------------------------
// SHA-512 (FIPS 180-4)
// ------------------------------------------------------------------
const M64 = (1n << 64n) - 1n;

const K = [
    0x428a2f98d728ae22n, 0x7137449123ef65cdn, 0xb5c0fbcfec4d3b2fn, 0xe9b5dba58189dbbcn,
    0x3956c25bf348b538n, 0x59f111f1b605d019n, 0x923f82a4af194f9bn, 0xab1c5ed5da6d8118n,
    0xd807aa98a3030242n, 0x12835b0145706fben, 0x243185be4ee4b28cn, 0x550c7dc3d5ffb4e2n,
    0x72be5d74f27b896fn, 0x80deb1fe3b1696b1n, 0x9bdc06a725c71235n, 0xc19bf174cf692694n,
    0xe49b69c19ef14ad2n, 0xefbe4786384f25e3n, 0x0fc19dc68b8cd5b5n, 0x240ca1cc77ac9c65n,
    0x2de92c6f592b0275n, 0x4a7484aa6ea6e483n, 0x5cb0a9dcbd41fbd4n, 0x76f988da831153b5n,
    0x983e5152ee66dfabn, 0xa831c66d2db43210n, 0xb00327c898fb213fn, 0xbf597fc7beef0ee4n,
    0xc6e00bf33da88fc2n, 0xd5a79147930aa725n, 0x06ca6351e003826fn, 0x142929670a0e6e70n,
    0x27b70a8546d22ffcn, 0x2e1b21385c26c926n, 0x4d2c6dfc5ac42aedn, 0x53380d139d95b3dfn,
    0x650a73548baf63den, 0x766a0abb3c77b2a8n, 0x81c2c92e47edaee6n, 0x92722c851482353bn,
    0xa2bfe8a14cf10364n, 0xa81a664bbc423001n, 0xc24b8b70d0f89791n, 0xc76c51a30654be30n,
    0xd192e819d6ef5218n, 0xd69906245565a910n, 0xf40e35855771202an, 0x106aa07032bbd1b8n,
    0x19a4c116b8d2d0c8n, 0x1e376c085141ab53n, 0x2748774cdf8eeb99n, 0x34b0bcb5e19b48a8n,
    0x391c0cb3c5c95a63n, 0x4ed8aa4ae3418acbn, 0x5b9cca4f7763e373n, 0x682e6ff3d6b2b8a3n,
    0x748f82ee5defb2fcn, 0x78a5636f43172f60n, 0x84c87814a1f0ab72n, 0x8cc702081a6439ecn,
    0x90befffa23631e28n, 0xa4506cebde82bde9n, 0xbef9a3f7b2c67915n, 0xc67178f2e372532bn,
    0xca273eceea26619cn, 0xd186b8c721c0c207n, 0xeada7dd6cde0eb1en, 0xf57d4f7fee6ed178n,
    0x06f067aa72176fban, 0x0a637dc5a2c898a6n, 0x113f9804bef90daen, 0x1b710b35131c471bn,
    0x28db77f523047d84n, 0x32caab7b40c72493n, 0x3c9ebe0a15c9bebcn, 0x431d67c49c100d4cn,
    0x4cc5d4becb3e42b6n, 0x597f299cfc657e2an, 0x5fcb6fab3ad6faecn, 0x6c44198c4a475817n
];

const H_INIT = [
    0x6a09e667f3bcc908n, 0xbb67ae8584caa73bn, 0x3c6ef372fe94f82bn, 0xa54ff53a5f1d36f1n,
    0x510e527fade682d1n, 0x9b05688c2b3e6c1fn, 0x1f83d9abfb41bd6bn, 0x5be0cd19137e2179n
];

function rotr(x, n) {
    return ((x >> n) | (x << (64n - n))) & M64;
}

export function sha512(message) {
    const bitLen = BigInt(message.length) * 8n;
    const padded = [];
    for (let i = 0; i < message.length; i++) {
        padded.push(message[i]);
    }
    padded.push(0x80);
    while (padded.length % 128 !== 112) {
        padded.push(0);
    }
    // 128-bit big-endian bit length; high 64 bits are zero at our sizes.
    for (let i = 0; i < 8; i++) {
        padded.push(0);
    }
    for (let i = 7; i >= 0; i--) {
        padded.push(Number((bitLen >> BigInt(i * 8)) & 0xffn));
    }

    const h = H_INIT.slice();
    const w = new Array(80);
    for (let block = 0; block < padded.length; block += 128) {
        for (let t = 0; t < 16; t++) {
            let v = 0n;
            for (let j = 0; j < 8; j++) {
                v = (v << 8n) | BigInt(padded[block + t * 8 + j]);
            }
            w[t] = v;
        }
        for (let t = 16; t < 80; t++) {
            const s0 = rotr(w[t - 15], 1n) ^ rotr(w[t - 15], 8n) ^ (w[t - 15] >> 7n);
            const s1 = rotr(w[t - 2], 19n) ^ rotr(w[t - 2], 61n) ^ (w[t - 2] >> 6n);
            w[t] = (w[t - 16] + s0 + w[t - 7] + s1) & M64;
        }
        let a = h[0], b = h[1], c = h[2], d = h[3];
        let e = h[4], f = h[5], g = h[6], hh = h[7];
        for (let t = 0; t < 80; t++) {
            const S1 = rotr(e, 14n) ^ rotr(e, 18n) ^ rotr(e, 41n);
            const ch = (e & f) ^ ((M64 ^ e) & g);
            const temp1 = (hh + S1 + ch + K[t] + w[t]) & M64;
            const S0 = rotr(a, 28n) ^ rotr(a, 34n) ^ rotr(a, 39n);
            const maj = (a & b) ^ (a & c) ^ (b & c);
            const temp2 = (S0 + maj) & M64;
            hh = g; g = f; f = e; e = (d + temp1) & M64;
            d = c; c = b; b = a; a = (temp1 + temp2) & M64;
        }
        h[0] = (h[0] + a) & M64; h[1] = (h[1] + b) & M64;
        h[2] = (h[2] + c) & M64; h[3] = (h[3] + d) & M64;
        h[4] = (h[4] + e) & M64; h[5] = (h[5] + f) & M64;
        h[6] = (h[6] + g) & M64; h[7] = (h[7] + hh) & M64;
    }
    const out = new Uint8Array(64);
    for (let i = 0; i < 8; i++) {
        for (let j = 0; j < 8; j++) {
            out[i * 8 + j] = Number((h[i] >> BigInt((7 - j) * 8)) & 0xffn);
        }
    }
    return out;
}

// ------------------------------------------------------------------
// Ed25519 (RFC 8032) — extended twisted Edwards coordinates
// ------------------------------------------------------------------
const P = (1n << 255n) - 19n;
const L = (1n << 252n) + 27742317777372353535851937790883648493n;
const D = 37095705934669439343138083508754565189542113879843219016388785533085940283555n;
const BASE_X = 15112221349535807912866137220509078758500070471935934681525071646256199207783n;
const BASE_Y = 46316835694926478169428394003475163141307993866256225615783033603165251855960n;

function mod(a) {
    const r = a % P;
    return r >= 0n ? r : r + P;
}

function powMod(base, exp, m) {
    let result = 1n;
    let b = ((base % m) + m) % m;
    let e = exp;
    while (e > 0n) {
        if (e & 1n) {
            result = (result * b) % m;
        }
        b = (b * b) % m;
        e >>= 1n;
    }
    return result;
}

function inv(x) {
    return powMod(x, P - 2n, P);
}

const I = powMod(2n, (P - 1n) / 4n, P); // sqrt(-1)
const BASE = { X: BASE_X, Y: BASE_Y, Z: 1n, T: mod(BASE_X * BASE_Y) };
const IDENTITY = { X: 0n, Y: 1n, Z: 1n, T: 0n };

// Unified addition (add-2008-hwcd): complete for a = -1, so it is
// safe for every input pair including the identity.
function pointAdd(p, q) {
    const A = mod((p.Y - p.X) * (q.Y - q.X));
    const B = mod((p.Y + p.X) * (q.Y + q.X));
    const C = mod(p.T * 2n * D * q.T);
    const Dd = mod(p.Z * 2n * q.Z);
    const E = B - A;
    const F = Dd - C;
    const G = Dd + C;
    const H = B + A;
    return { X: mod(E * F), Y: mod(G * H), T: mod(E * H), Z: mod(F * G) };
}

function pointDouble(p) {
    const A = mod(p.X * p.X);
    const B = mod(p.Y * p.Y);
    const C = mod(2n * p.Z * p.Z);
    const Dd = mod(-A); // a = -1
    const E = mod(mod((p.X + p.Y) * (p.X + p.Y)) - A - B);
    const G = Dd + B;
    const F = G - C;
    const H = Dd - B;
    return { X: mod(E * F), Y: mod(G * H), T: mod(E * H), Z: mod(F * G) };
}

function scalarMult(scalar, point) {
    let result = IDENTITY;
    for (let i = 255; i >= 0; i--) {
        result = pointDouble(result);
        if ((scalar >> BigInt(i)) & 1n) {
            result = pointAdd(result, point);
        }
    }
    return result;
}

function encodeScalarLE(value) {
    const bytes = new Uint8Array(32);
    let v = value;
    for (let i = 0; i < 32; i++) {
        bytes[i] = Number(v & 0xffn);
        v >>= 8n;
    }
    return bytes;
}

function decodeLE(bytes) {
    let v = 0n;
    for (let i = bytes.length - 1; i >= 0; i--) {
        v = (v << 8n) | BigInt(bytes[i]);
    }
    return v;
}

function toAffine(point) {
    const zi = inv(point.Z);
    return { x: mod(point.X * zi), y: mod(point.Y * zi) };
}

function encodePoint(point) {
    const { x, y } = toAffine(point);
    const bytes = encodeScalarLE(y);
    if (x & 1n) {
        bytes[31] |= 0x80;
    }
    return bytes;
}

function decodePoint(bytes) {
    if (!bytes || bytes.length !== 32) {
        return null;
    }
    const sign = (bytes[31] & 0x80) !== 0;
    const cleared = new Uint8Array(bytes);
    cleared[31] &= 0x7f;
    const y = decodeLE(cleared);
    if (y >= P) {
        return null;
    }
    const y2 = mod(y * y);
    const u = mod(y2 - 1n);
    const v = mod(D * y2 + 1n);
    const v3 = mod(v * v % P * v);
    const v7 = mod(v3 * v3 % P * v);
    let x = mod(u * v3 % P * powMod(mod(u * v7), (P - 5n) / 8n, P));
    const check = mod(v * mod(x * x));
    if (check !== u) {
        if (check === mod(-u)) {
            x = mod(x * I);
        } else {
            return null;
        }
    }
    if (x === 0n && sign) {
        return null;
    }
    if ((x & 1n) !== (sign ? 1n : 0n)) {
        x = P - x;
    }
    return { X: x, Y: y, Z: 1n, T: mod(x * y) };
}

function clampScalar(bytes) {
    const c = new Uint8Array(bytes);
    c[0] &= 248;
    c[31] &= 127;
    c[31] |= 64;
    return decodeLE(c);
}

export function seedToKeyPair(seedBytes) {
    const h = sha512(seedBytes);
    const a = clampScalar(h.slice(0, 32));
    return { publicKey: encodePoint(scalarMult(a, BASE)) };
}

export function sign(seedBytes, messageBytes) {
    const h = sha512(seedBytes);
    const a = clampScalar(h.slice(0, 32));
    const prefix = h.slice(32);
    const A = encodePoint(scalarMult(a, BASE));
    const r = decodeLE(sha512(concatBytes(prefix, messageBytes))) % L;
    const R = encodePoint(scalarMult(r, BASE));
    const k = decodeLE(sha512(concatBytes(R, A, messageBytes))) % L;
    const s = (r + k * a) % L;
    return concatBytes(R, encodeScalarLE(s));
}

export function verify(publicKeyBytes, messageBytes, signatureBytes) {
    if (!signatureBytes || signatureBytes.length !== 64) {
        return false;
    }
    const A = decodePoint(publicKeyBytes);
    if (!A) {
        return false;
    }
    const Rbytes = signatureBytes.slice(0, 32);
    const R = decodePoint(Rbytes);
    if (!R) {
        return false;
    }
    const s = decodeLE(signatureBytes.slice(32));
    if (s >= L) {
        return false;
    }
    const k = decodeLE(sha512(concatBytes(Rbytes, publicKeyBytes, messageBytes))) % L;
    const left = scalarMult(s, BASE);
    const right = pointAdd(R, scalarMult(k, A));
    return mod(left.X * right.Z) === mod(right.X * left.Z)
        && mod(left.Y * right.Z) === mod(right.Y * left.Z);
}

// ------------------------------------------------------------------
// Byte helpers
// ------------------------------------------------------------------
export function hexToBytes(hex) {
    if (typeof hex !== 'string' || hex.length % 2 !== 0) {
        throw new Error('Ed25519: invalid hex string');
    }
    const bytes = new Uint8Array(hex.length / 2);
    for (let i = 0; i < bytes.length; i++) {
        const value = parseInt(hex.slice(i * 2, i * 2 + 2), 16);
        if (Number.isNaN(value)) {
            throw new Error('Ed25519: invalid hex string');
        }
        bytes[i] = value;
    }
    return bytes;
}

export function bytesToHex(bytes) {
    let hex = '';
    for (let i = 0; i < bytes.length; i++) {
        hex += bytes[i].toString(16).padStart(2, '0');
    }
    return hex;
}

export function utf8ToBytes(text) {
    return new TextEncoder().encode(text);
}

export function concatBytes(...arrays) {
    const total = arrays.reduce((sum, a) => sum + a.length, 0);
    const out = new Uint8Array(total);
    let offset = 0;
    for (const a of arrays) {
        out.set(a, offset);
        offset += a.length;
    }
    return out;
}

export function randomSeed() {
    const seed = new Uint8Array(32);
    if (typeof crypto !== 'undefined' && typeof crypto.getRandomValues === 'function') {
        crypto.getRandomValues(seed);
    } else {
        for (let i = 0; i < 32; i++) {
            seed[i] = Math.floor(Math.random() * 256);
        }
    }
    return seed;
}

// ------------------------------------------------------------------
// did:key encoding (multicodec ed25519-pub 0xed01 + base58btc)
// ------------------------------------------------------------------
const B58_ALPHABET = '123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz';

function base58Encode(bytes) {
    let num = 0n;
    for (const b of bytes) {
        num = num * 256n + BigInt(b);
    }
    let str = '';
    while (num > 0n) {
        str = B58_ALPHABET[Number(num % 58n)] + str;
        num /= 58n;
    }
    for (const b of bytes) {
        if (b === 0) {
            str = '1' + str;
        } else {
            break;
        }
    }
    return str;
}

function base58Decode(str) {
    let num = 0n;
    for (const ch of str) {
        const idx = B58_ALPHABET.indexOf(ch);
        if (idx === -1) {
            return null;
        }
        num = num * 58n + BigInt(idx);
    }
    const bytes = [];
    while (num > 0n) {
        bytes.unshift(Number(num % 256n));
        num /= 256n;
    }
    for (const ch of str) {
        if (ch === '1') {
            bytes.unshift(0);
        } else {
            break;
        }
    }
    return new Uint8Array(bytes);
}

export function publicKeyToDidKey(publicKeyBytes) {
    return 'did:key:z' + base58Encode(concatBytes(new Uint8Array([0xed, 0x01]), publicKeyBytes));
}

// Recovers the raw public key from a did:key id — this is what lets a
// bare signature (signer did only) be verified for objects that carry
// no separate identity payload, such as the SpatialIndexRoot.
export function didKeyToPublicKey(did) {
    if (typeof did !== 'string' || !did.startsWith('did:key:z')) {
        return null;
    }
    const bytes = base58Decode(did.slice('did:key:z'.length));
    if (!bytes || bytes.length !== 34 || bytes[0] !== 0xed || bytes[1] !== 0x01) {
        return null;
    }
    return bytes.slice(2);
}
