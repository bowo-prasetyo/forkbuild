import { BitcoinAnchorTransactionBuilder } from '../anchoring/BitcoinAnchorTransactionBuilder.js';
import { BitcoinAnchorPsbtBuilder } from '../anchoring/BitcoinAnchorPsbtBuilder.js';
import { BitcoinAnchorSignedPsbtFinalizer } from '../anchoring/BitcoinAnchorSignedPsbtFinalizer.js';
import { BitcoinAnchorTransactionBroadcaster } from '../anchoring/BitcoinAnchorTransactionBroadcaster.js';
import { BitcoinAnchorReviewedPsbtSigner } from '../anchoring/BitcoinAnchorReviewedPsbtSigner.js';
import { BitcoinWalletConnection } from '../anchoring/BitcoinWalletConnection.js';
import { BitcoinInjectedProviderWalletAdapter } from '../anchoring/BitcoinInjectedProviderWalletAdapter.js';
import { describeBitcoinAnchorTransactionReview } from '../application/BitcoinAnchorTransactionReviewView.js';

// 0.8.59 — Explicit Bitcoin Anchor Transaction Review UI.
//
// The flagship this milestone exists to prove: transaction identity is
// preserved end to end, through the exact sequence a real person would
// experience on screen —
//
//   build a plan (0.8.47) -> build a PSBT description (0.8.48/0.8.49)
//     -> REVIEW it (0.8.59, new) -> connect a wallet (0.8.58)
//     -> sign EXACTLY the reviewed transaction (0.8.59, new, wrapping
//        0.8.50 unchanged) -> the wallet's claimed signature is
//        independently inspected (0.8.50, unchanged)
//     -> cryptographically finalized (0.8.51, unchanged)
//     -> broadcast (0.8.52, unchanged)
//
// — and that a transaction which does not match what was reviewed is
// refused, at whichever point the mismatch is discovered, never signed or
// broadcast.
//
//   Section A: FLAGSHIP — a real plan/description is reviewed, the review's
//              own reported content hash, inputs, outputs, change, and fee
//              are checked against the description directly, a fake
//              UniSat-shaped wallet is connected, the reviewed-and-signed
//              PSBT is genuinely, cryptographically signed with a real
//              secp256k1 key, inspected, finalized into real transaction
//              bytes, and broadcast — the exact same bytes throughout.
//   Section B: a caller asking to sign a DIFFERENT description than the one
//              reviewed is refused before the wallet is ever consulted.
//   Section C: a wallet that signs a genuinely different transaction than
//              the one it was asked to sign is still refused by the
//              unchanged, independent anchoring/
//              BitcoinAnchorSignedPsbtInspector.js boundary (0.8.50) —
//              proving the pre-existing protection still holds beneath this
//              milestone's new one.
//   Section D: describeBitcoinAnchorTransactionReview()'s own fixed field
//              set, frozen result, and "never a verdict" restraint; a
//              change-less transaction reports changeSats: 0 honestly.
//   Section E: caller-contract violations — a missing reviewedUnsignedPsbtHex,
//              and a malformed description — both throw, before any wallet
//              or network is ever consulted.
//
// See docs/Principles.md, "A Transaction Is Signed Only If It Is The
// Transaction That Was Reviewed (0.8.59)."

function assert(condition, message) {
    if (!condition) throw new Error(`ASSERT FAILED: ${message}`);
}

async function expectThrowsAsync(fn, message) {
    let threw = false;
    try { await fn(); } catch (_e) { threw = true; }
    assert(threw, message);
}

function expectThrows(fn, message) {
    let threw = false;
    try { fn(); } catch (_e) { threw = true; }
    assert(threw, message);
}

function utxo(txid, vout, valueSats, scriptType) {
    return { txid: txid.repeat(64).slice(0, 64), vout, valueSats, scriptType };
}

// ---------------------------------------------------------------------
// A wholly independent SHA-256 / RIPEMD-160 / secp256k1 implementation —
// duplicated, not imported, from tests/BitcoinAnchorPsbtFinalization.test.js
// (the identical self-containment every anchoring/ test file in this
// codebase already holds) — used to generate a real key and real ECDSA
// signatures so this flagship's own "signed" PSBTs are genuinely valid,
// never merely shaped like a signature.
// ---------------------------------------------------------------------

function rotr32(x, n) { return ((x >>> n) | (x << (32 - n))) >>> 0; }

const SHA256_K = [
    0x428a2f98, 0x71374491, 0xb5c0fbcf, 0xe9b5dba5, 0x3956c25b, 0x59f111f1, 0x923f82a4, 0xab1c5ed5,
    0xd807aa98, 0x12835b01, 0x243185be, 0x550c7dc3, 0x72be5d74, 0x80deb1fe, 0x9bdc06a7, 0xc19bf174,
    0xe49b69c1, 0xefbe4786, 0x0fc19dc6, 0x240ca1cc, 0x2de92c6f, 0x4a7484aa, 0x5cb0a9dc, 0x76f988da,
    0x983e5152, 0xa831c66d, 0xb00327c8, 0xbf597fc7, 0xc6e00bf3, 0xd5a79147, 0x06ca6351, 0x14292967,
    0x27b70a85, 0x2e1b2138, 0x4d2c6dfc, 0x53380d13, 0x650a7354, 0x766a0abb, 0x81c2c92e, 0x92722c85,
    0xa2bfe8a1, 0xa81a664b, 0xc24b8b70, 0xc76c51a3, 0xd192e819, 0xd6990624, 0xf40e3585, 0x106aa070,
    0x19a4c116, 0x1e376c08, 0x2748774c, 0x34b0bcb5, 0x391c0cb3, 0x4ed8aa4a, 0x5b9cca4f, 0x682e6ff3,
    0x748f82ee, 0x78a5636f, 0x84c87814, 0x8cc70208, 0x90befffa, 0xa4506ceb, 0xbef9a3f7, 0xc67178f2
];

function sha256(bytes) {
    let h0 = 0x6a09e667, h1 = 0xbb67ae85, h2 = 0x3c6ef372, h3 = 0xa54ff53a;
    let h4 = 0x510e527f, h5 = 0x9b05688c, h6 = 0x1f83d9ab, h7 = 0x5be0cd19;
    const msgLen = bytes.length;
    let totalLen = msgLen + 1;
    while (totalLen % 64 !== 56) totalLen++;
    totalLen += 8;
    const padded = new Uint8Array(totalLen);
    padded.set(bytes);
    padded[msgLen] = 0x80;
    new DataView(padded.buffer).setBigUint64(totalLen - 8, BigInt(msgLen) * 8n, false);

    const w = new Uint32Array(64);
    for (let offset = 0; offset < padded.length; offset += 64) {
        for (let i = 0; i < 16; i++) {
            w[i] = ((padded[offset + i * 4] << 24) | (padded[offset + i * 4 + 1] << 16) | (padded[offset + i * 4 + 2] << 8) | padded[offset + i * 4 + 3]) >>> 0;
        }
        for (let i = 16; i < 64; i++) {
            const s0 = rotr32(w[i - 15], 7) ^ rotr32(w[i - 15], 18) ^ (w[i - 15] >>> 3);
            const s1 = rotr32(w[i - 2], 17) ^ rotr32(w[i - 2], 19) ^ (w[i - 2] >>> 10);
            w[i] = (w[i - 16] + s0 + w[i - 7] + s1) >>> 0;
        }
        let a = h0, b = h1, c = h2, d = h3, e = h4, f = h5, g = h6, h = h7;
        for (let i = 0; i < 64; i++) {
            const S1 = rotr32(e, 6) ^ rotr32(e, 11) ^ rotr32(e, 25);
            const ch = (e & f) ^ (~e & g);
            const t1 = (h + S1 + ch + SHA256_K[i] + w[i]) >>> 0;
            const S0 = rotr32(a, 2) ^ rotr32(a, 13) ^ rotr32(a, 22);
            const maj = (a & b) ^ (a & c) ^ (b & c);
            const t2 = (S0 + maj) >>> 0;
            h = g; g = f; f = e; e = (d + t1) >>> 0; d = c; c = b; b = a; a = (t1 + t2) >>> 0;
        }
        h0 = (h0 + a) >>> 0; h1 = (h1 + b) >>> 0; h2 = (h2 + c) >>> 0; h3 = (h3 + d) >>> 0;
        h4 = (h4 + e) >>> 0; h5 = (h5 + f) >>> 0; h6 = (h6 + g) >>> 0; h7 = (h7 + h) >>> 0;
    }
    const out = new Uint8Array(32);
    const dv = new DataView(out.buffer);
    [h0, h1, h2, h3, h4, h5, h6, h7].forEach((h, i) => dv.setUint32(i * 4, h));
    return out;
}

function dsha256(bytes) { return sha256(sha256(bytes)); }

const RMD_ZL = [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 7, 4, 13, 1, 10, 6, 15, 3, 12, 0, 9, 5, 2, 14, 11, 8, 3, 10, 14, 4, 9, 15, 8, 1, 2, 7, 0, 6, 13, 11, 5, 12, 1, 9, 11, 10, 0, 8, 12, 4, 13, 3, 7, 15, 14, 5, 6, 2, 4, 0, 5, 9, 7, 12, 2, 10, 14, 1, 3, 8, 11, 6, 15, 13];
const RMD_ZR = [5, 14, 7, 0, 9, 2, 11, 4, 13, 6, 15, 8, 1, 10, 3, 12, 6, 11, 3, 7, 0, 13, 5, 10, 14, 15, 8, 12, 4, 9, 1, 2, 15, 5, 1, 3, 7, 14, 6, 9, 11, 8, 12, 2, 10, 0, 4, 13, 8, 6, 4, 1, 3, 11, 15, 0, 5, 12, 2, 13, 9, 7, 10, 14, 12, 15, 10, 4, 1, 5, 8, 7, 6, 2, 13, 14, 0, 3, 9, 11];
const RMD_SL = [11, 14, 15, 12, 5, 8, 7, 9, 11, 13, 14, 15, 6, 7, 9, 8, 7, 6, 8, 13, 11, 9, 7, 15, 7, 12, 15, 9, 11, 7, 13, 12, 11, 13, 6, 7, 14, 9, 13, 15, 14, 8, 13, 6, 5, 12, 7, 5, 11, 12, 14, 15, 14, 15, 9, 8, 9, 14, 5, 6, 8, 6, 5, 12, 9, 15, 5, 11, 6, 8, 13, 12, 5, 12, 13, 14, 11, 8, 5, 6];
const RMD_SR = [8, 9, 9, 11, 13, 15, 15, 5, 7, 7, 8, 11, 14, 14, 12, 6, 9, 13, 15, 7, 12, 8, 9, 11, 7, 7, 12, 7, 6, 15, 13, 11, 9, 7, 15, 11, 8, 6, 6, 14, 12, 13, 5, 14, 13, 13, 7, 5, 15, 5, 8, 11, 14, 14, 6, 14, 6, 9, 12, 9, 12, 5, 15, 8, 8, 5, 12, 9, 12, 5, 14, 6, 8, 13, 6, 5, 15, 13, 11, 11];
const RMD_KL = [0x00000000, 0x5a827999, 0x6ed9eba1, 0x8f1bbcdc, 0xa953fd4e];
const RMD_KR = [0x50a28be6, 0x5c4dd124, 0x6d703ef3, 0x7a6d76e9, 0x00000000];

function rol32(x, n) { return ((x << n) | (x >>> (32 - n))) >>> 0; }

function rmdF(j, x, y, z) {
    if (j < 16) return (x ^ y ^ z) >>> 0;
    if (j < 32) return ((x & y) | (~x & z)) >>> 0;
    if (j < 48) return ((x | ~y) ^ z) >>> 0;
    if (j < 64) return ((x & z) | (y & ~z)) >>> 0;
    return (x ^ (y | ~z)) >>> 0;
}

function ripemd160(bytes) {
    const msgLen = bytes.length;
    let totalLen = msgLen + 1;
    while (totalLen % 64 !== 56) totalLen++;
    totalLen += 8;
    const padded = new Uint8Array(totalLen);
    padded.set(bytes);
    padded[msgLen] = 0x80;
    new DataView(padded.buffer).setBigUint64(totalLen - 8, BigInt(msgLen) * 8n, true);

    let h0 = 0x67452301, h1 = 0xefcdab89, h2 = 0x98badcfe, h3 = 0x10325476, h4 = 0xc3d2e1f0;
    for (let offset = 0; offset < padded.length; offset += 64) {
        const x = new Uint32Array(16);
        for (let i = 0; i < 16; i++) {
            x[i] = (padded[offset + i * 4] | (padded[offset + i * 4 + 1] << 8) | (padded[offset + i * 4 + 2] << 16) | (padded[offset + i * 4 + 3] << 24)) >>> 0;
        }
        let al = h0, bl = h1, cl = h2, dl = h3, el = h4;
        let ar = h0, br = h1, cr = h2, dr = h3, er = h4;
        for (let j = 0; j < 80; j++) {
            const round = Math.floor(j / 16);
            let t = (al + rmdF(j, bl, cl, dl) + x[RMD_ZL[j]] + RMD_KL[round]) >>> 0;
            t = (rol32(t, RMD_SL[j]) + el) >>> 0;
            al = el; el = dl; dl = rol32(cl, 10); cl = bl; bl = t;
            let tr = (ar + rmdF(79 - j, br, cr, dr) + x[RMD_ZR[j]] + RMD_KR[round]) >>> 0;
            tr = (rol32(tr, RMD_SR[j]) + er) >>> 0;
            ar = er; er = dr; dr = rol32(cr, 10); cr = br; br = tr;
        }
        const t = (h1 + cl + dr) >>> 0;
        h1 = (h2 + dl + er) >>> 0; h2 = (h3 + el + ar) >>> 0; h3 = (h4 + al + br) >>> 0; h4 = (h0 + bl + cr) >>> 0;
        h0 = t;
    }
    const out = new Uint8Array(20);
    const dv = new DataView(out.buffer);
    [h0, h1, h2, h3, h4].forEach((h, i) => dv.setUint32(i * 4, h, true));
    return out;
}

function hash160(bytes) { return ripemd160(sha256(bytes)); }

const P = (1n << 256n) - (1n << 32n) - 977n;
const N = 0xFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFEBAAEDCE6AF48A03BBFD25E8CD0364141n;
const G = { x: 0x79BE667EF9DCBBAC55A06295CE870B07029BFCDB2DCE28D959F2815B16F81798n, y: 0x483ADA7726A3C4655DA4FBFC0E1108A8FD17B448A68554199C47D08FFB10D4B8n };

function fmod(a, m) { const r = a % m; return r >= 0n ? r : r + m; }
function modInv(a, m) {
    let [oldR, r] = [fmod(a, m), m];
    let [oldS, s] = [1n, 0n];
    while (r !== 0n) {
        const q = oldR / r;
        [oldR, r] = [r, oldR - q * r];
        [oldS, s] = [s, oldS - q * s];
    }
    return fmod(oldS, m);
}
function pointAdd(p1, p2) {
    if (p1 === null) return p2;
    if (p2 === null) return p1;
    if (p1.x === p2.x && fmod(p1.y + p2.y, P) === 0n) return null;
    let m;
    if (p1.x === p2.x && p1.y === p2.y) m = fmod(3n * p1.x * p1.x * modInv(2n * p1.y, P), P);
    else m = fmod((p2.y - p1.y) * modInv(p2.x - p1.x, P), P);
    const x3 = fmod(m * m - p1.x - p2.x, P);
    const y3 = fmod(m * (p1.x - x3) - p1.y, P);
    return { x: x3, y: y3 };
}
function scalarMul(point, scalar) {
    let result = null, addend = point, k = scalar;
    while (k > 0n) {
        if (k & 1n) result = pointAdd(result, addend);
        addend = pointAdd(addend, addend);
        k >>= 1n;
    }
    return result;
}
function bytesToBigInt(bytes) { let v = 0n; for (const b of bytes) v = (v << 8n) | BigInt(b); return v; }
function bigIntTo32Bytes(v) { const out = new Uint8Array(32); let x = v; for (let i = 31; i >= 0; i--) { out[i] = Number(x & 0xffn); x >>= 8n; } return out; }
function compressPubkey(point) { return Uint8Array.from([point.y % 2n === 0n ? 0x02 : 0x03, ...bigIntTo32Bytes(point.x)]); }
function derEncodeInt(v) {
    let bytes = [];
    let x = v;
    if (x === 0n) bytes = [0];
    while (x > 0n) { bytes.unshift(Number(x & 0xffn)); x >>= 8n; }
    if (bytes[0] & 0x80) bytes.unshift(0);
    return Uint8Array.from(bytes);
}
function derEncodeSignature(r, s) {
    const rBytes = derEncodeInt(r), sBytes = derEncodeInt(s);
    const body = Uint8Array.from([0x02, rBytes.length, ...rBytes, 0x02, sBytes.length, ...sBytes]);
    return Uint8Array.from([0x30, body.length, ...body]);
}
function ecdsaSign(privateKey, hashBytes, nonce) {
    const z = bytesToBigInt(hashBytes);
    const R = scalarMul(G, nonce);
    const r = fmod(R.x, N);
    if (r === 0n) throw new Error('bad nonce: r=0');
    const s = fmod(modInv(nonce, N) * (z + r * privateKey), N);
    if (s === 0n) throw new Error('bad nonce: s=0');
    return { r, s };
}

function realKey(privateKeySeed) {
    const privateKey = privateKeySeed;
    const point = scalarMul(G, privateKey);
    const pubkeyBytes = compressPubkey(point);
    return { privateKey, pubkeyBytes, pubkeyHex: bytesToHex(pubkeyBytes), hash160Bytes: hash160(pubkeyBytes) };
}

function computeP2wpkhSighash(tx, inputIndex, hash160Bytes, valueSats) {
    const hashPrevouts = dsha256(concatBytes(tx.inputs.map((input) => concatBytes([reverseBytes(hexToBytes(input.txid)), writeU32LE(input.vout)]))));
    const hashSequence = dsha256(concatBytes(tx.inputs.map((input) => writeU32LE(input.sequence))));
    const hashOutputs = dsha256(concatBytes(tx.outputs.map((output) => concatBytes([writeU64LE(output.valueSats), encodeVarBytes(hexToBytes(output.scriptPubKey))]))));
    const thisInput = tx.inputs[inputIndex];
    const outpoint = concatBytes([reverseBytes(hexToBytes(thisInput.txid)), writeU32LE(thisInput.vout)]);
    const scriptCode = encodeVarBytes(concatBytes([Uint8Array.from([0x76, 0xa9, 0x14]), hash160Bytes, Uint8Array.from([0x88, 0xac])]));
    const preimage = concatBytes([
        writeU32LE(tx.version), hashPrevouts, hashSequence, outpoint, scriptCode,
        writeU64LE(valueSats), writeU32LE(thisInput.sequence), hashOutputs, writeU32LE(tx.locktime), writeU32LE(1)
    ]);
    return dsha256(preimage);
}

function signRealInput(description, index, key, nonce) {
    const sighash = computeP2wpkhSighash(description.globalUnsignedTx, index, key.hash160Bytes, description.inputs[index].witnessUtxo.valueSats);
    const { r, s } = ecdsaSign(key.privateKey, sighash, nonce);
    return bytesToHex(concatBytes([derEncodeSignature(r, s), Uint8Array.from([1])])); // SIGHASH_ALL suffix
}

// ---------------------------------------------------------------------
// A wholly independent, hand-rolled signed-PSBT encoder — duplicated,
// not imported, from tests/BitcoinAnchorPsbtFinalization.test.js.
// ---------------------------------------------------------------------

function u32le(n) {
    return [n & 0xff, (n >>> 8) & 0xff, (n >>> 16) & 0xff, (n >>> 24) & 0xff].map((b) => b.toString(16).padStart(2, '0')).join('');
}
function u64le(n) {
    let big = BigInt(n);
    const bytes = [];
    for (let i = 0; i < 8; i++) { bytes.push(Number(big & 0xffn)); big >>= 8n; }
    return bytes.map((b) => b.toString(16).padStart(2, '0')).join('');
}
function compactSizeHex(n) {
    if (n <= 0xfc) return n.toString(16).padStart(2, '0');
    throw new Error('test helper does not need multi-byte compactSize');
}
function reverseHex(hex) { return hex.match(/.{2}/g).reverse().join(''); }
function kv(keyHex, valueHex) {
    return compactSizeHex(keyHex.length / 2) + keyHex + compactSizeHex(valueHex.length / 2) + valueHex;
}
function encodeUnsignedTxHex(tx) {
    const inputsHex = tx.inputs.map((input) => reverseHex(input.txid) + u32le(input.vout) + compactSizeHex(0) + u32le(input.sequence)).join('');
    const outputsHex = tx.outputs.map((output) => u64le(output.valueSats) + compactSizeHex(output.scriptPubKey.length / 2) + output.scriptPubKey).join('');
    return u32le(tx.version) + compactSizeHex(tx.inputs.length) + inputsHex + compactSizeHex(tx.outputs.length) + outputsHex + u32le(tx.locktime);
}
function buildSignedPsbtHex(description, { tx, inputExtras = [] } = {}) {
    const unsignedTx = tx || description.globalUnsignedTx;
    let out = '70736274ff'; // magic
    out += kv('00', encodeUnsignedTxHex(unsignedTx));
    out += '00';
    description.inputs.forEach((input, i) => {
        const w = input.witnessUtxo;
        out += kv('01', u64le(w.valueSats) + compactSizeHex(w.scriptPubKey.length / 2) + w.scriptPubKey);
        (inputExtras[i] || []).forEach((extraKv) => { out += extraKv; });
        out += '00';
    });
    unsignedTx.outputs.forEach(() => { out += '00'; });
    return out;
}
function finalScriptWitnessKv(sigWithHashTypeHex, pubkeyHex) {
    const value = compactSizeHex(2) + compactSizeHex(sigWithHashTypeHex.length / 2) + sigWithHashTypeHex + compactSizeHex(pubkeyHex.length / 2) + pubkeyHex;
    return kv('08', value);
}

function hexToBytes(hex) {
    const bytes = new Uint8Array(hex.length / 2);
    for (let i = 0; i < bytes.length; i++) bytes[i] = parseInt(hex.substr(i * 2, 2), 16);
    return bytes;
}
function bytesToHex(bytes) { return Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join(''); }
function reverseBytes(bytes) { return Uint8Array.from(bytes).reverse(); }
function concatBytes(arrays) {
    const total = arrays.reduce((sum, a) => sum + a.length, 0);
    const result = new Uint8Array(total);
    let offset = 0;
    for (const a of arrays) { result.set(a, offset); offset += a.length; }
    return result;
}
function writeU32LE(v) { const b = new Uint8Array(4); new DataView(b.buffer).setUint32(0, v, true); return b; }
function writeU64LE(v) { const b = new Uint8Array(8); new DataView(b.buffer).setBigUint64(0, BigInt(v), true); return b; }
function encodeVarBytes(bytes) { return concatBytes([Uint8Array.from([bytes.length]), bytes]); }

// A fake browser wallet extension, shaped exactly like UniSat's own real,
// documented API — the identical fixture technique
// tests/BitcoinWalletConnectionUX.test.js already uses. `onSignPsbt` lets
// each section control exactly what this fake wallet claims to return,
// including a genuinely different transaction than the one it was asked to
// sign (Section C). `calls` records every psbt this fake was actually
// asked to sign, so a test can assert the wallet was NEVER consulted at all
// (Section B).
function fakeUnisatProvider({ account = 'bc1qalice0000000000000000000000000000000', network = 'livenet', onSignPsbt, calls = [] } = {}) {
    return {
        async requestAccounts() { return [account]; },
        async getNetwork() { return network; },
        async signPsbt(psbtHex) {
            calls.push(psbtHex);
            return onSignPsbt(psbtHex);
        }
    };
}

function buildDescription({ psbtBuilder, transactionBuilder, key, contentHash = 'deadbeef' }) {
    const plan = transactionBuilder.build({
        contentHash,
        utxos: [utxo('a', 0, 100000, 'p2wpkh')],
        changeAddress: 'bc1qexamplechangeaddress'
    });
    return psbtBuilder.build({
        plan,
        utxoDetails: [{ txid: plan.inputs[0].txid, vout: 0, scriptPubKey: '0014' + bytesToHex(key.hash160Bytes), valueSats: 100000 }],
        changeScriptPubKey: '0014' + 'b'.repeat(40)
    });
}

async function run() {
    const transactionBuilder = new BitcoinAnchorTransactionBuilder({ network: 'mainnet', feeRateSatsPerVByte: 1 });
    const psbtBuilder = new BitcoinAnchorPsbtBuilder();
    const finalizer = new BitcoinAnchorSignedPsbtFinalizer();

    const keyA = realKey(0x1a2b3c4d5e6f7890a1b2c3d4e5f60718293a4b5c6d7e8f90112233445566778n);
    const nonce1 = 0x9f8e7d6c5b4a39281706f5e4d3c2b1a0918273645362718293a4b5c6d7e8f90n;
    const nonce2 = 0x9999999999999999999999999999999999999999999999999999999999992n;

    // ---------------------------------------------------------------
    // Section A — FLAGSHIP: identity preservation end to end.
    // ---------------------------------------------------------------
    {
        const description = buildDescription({ psbtBuilder, transactionBuilder, key: keyA, contentHash: 'deadbeef' });

        // 1-2. Review the exact PSBT description a real BitcoinAnchorTransactionBuilder/
        // BitcoinAnchorPsbtBuilder pipeline produced.
        const review = describeBitcoinAnchorTransactionReview(description);
        assert(review.network === 'mainnet', '1. the review reports the plan\'s own network');
        assert(review.contentHash === 'deadbeef', '2. the review reports the exact content hash being anchored');
        assert(review.inputs.length === 1 && review.inputs[0].txid === description.inputs[0].txid && review.inputs[0].valueSats === 100000, '3. the review reports the exact input(s) selected');
        assert(review.outputs.length === 2 && review.outputs[0].type === 'op_return' && review.outputs[1].type === 'change', '4. the review reports the exact outputs, op_return then change');
        assert(review.changeSats === review.outputs[1].valueSats && review.changeSats > 0, '5. the review reports the exact change amount');
        assert(review.feeSats === description.feeSats && review.totalInputSats === description.totalInputSats, '6. the review reports the exact fee and total input value');

        // 3. Connect a wallet — a fake, UniSat-shaped provider standing in
        // for a real browser extension, exactly as tests/
        // BitcoinWalletConnectionUX.test.js's own flagship already
        // establishes.
        const signedHex = buildSignedPsbtHex(description, { inputExtras: [[finalScriptWitnessKv(signRealInput(description, 0, keyA, nonce1), keyA.pubkeyHex)]] });
        const walletCalls = [];
        const provider = new BitcoinInjectedProviderWalletAdapter({
            injectedProvider: fakeUnisatProvider({ onSignPsbt: () => signedHex, calls: walletCalls })
        });
        const connection = new BitcoinWalletConnection({ provider });
        const connectResult = await connection.connect();
        assert(connectResult.connected === true && connection.network === 'mainnet', '7. Alice connects her wallet and its network matches this transaction\'s own');

        // 4-6. Sign EXACTLY the reviewed PSBT via the new review-bound
        // signer, wrapping the unchanged 0.8.50 BitcoinAnchorWalletSigner.
        const reviewedSigner = new BitcoinAnchorReviewedPsbtSigner({ wallet: connection.wallet });
        const signResult = await reviewedSigner.requestSignature({ description, reviewedUnsignedPsbtHex: review.unsignedPsbtHex });
        assert(signResult.signed === true, '8. the wallet genuinely, cryptographically signs the exact PSBT that was reviewed');
        assert(walletCalls.length === 1 && walletCalls[0] === review.unsignedPsbtHex, '9. the wallet was asked to sign the exact bytes shown in the review — nothing else');
        assert(signResult.signedInputs.length === 1, '10. the wallet\'s claimed signature is independently inspected (0.8.50, unchanged) and found intact');

        // 7. Finalize — cryptographic verification, unchanged (0.8.51).
        const finalizeResult = finalizer.finalize({ description, signedPsbt: signResult.psbt });
        assert(finalizeResult.finalized === true, '11. the signed PSBT cryptographically finalizes into real, broadcastable transaction bytes');
        assert(/^[0-9a-f]{64}$/.test(finalizeResult.txid), '12. a real txid is produced');

        // 8. Broadcast — the exact finalized transaction, unchanged (0.8.52).
        const broadcastCalls = [];
        const broadcaster = new BitcoinAnchorTransactionBroadcaster({
            broadcaster: { async broadcast(hex) { broadcastCalls.push(hex); return { broadcast: true }; } }
        });
        const broadcastResult = await broadcaster.broadcast({ txid: finalizeResult.txid, rawTransaction: finalizeResult.rawTransaction });
        assert(broadcastResult.broadcasted === true && broadcastResult.txid === finalizeResult.txid, '13. the exact finalized transaction is broadcast');
        assert(broadcastCalls.length === 1 && broadcastCalls[0] === finalizeResult.rawTransaction.hex, '14. the broadcaster received the exact finalized bytes — nothing substituted anywhere along the chain');

        connection.disconnect();
        assert(connection.wallet === null, '15. disconnecting clears the signing capability, exactly as 0.8.58 already guarantees');
    }
    console.log('✓ Section A (FLAGSHIP): build -> review -> connect -> sign exactly what was reviewed -> inspect -> finalize -> broadcast, byte-identical throughout');

    // ---------------------------------------------------------------
    // Section B — a caller asking to sign something OTHER than what was
    // reviewed is refused before the wallet is ever consulted.
    // ---------------------------------------------------------------
    {
        const reviewedDescription = buildDescription({ psbtBuilder, transactionBuilder, key: keyA, contentHash: 'deadbeef' });
        const review = describeBitcoinAnchorTransactionReview(reviewedDescription);

        // A DIFFERENT transaction — a different content hash, never shown
        // to Alice as the one she reviewed.
        const substitutedDescription = buildDescription({ psbtBuilder, transactionBuilder, key: keyA, contentHash: 'facefeed' });

        const walletCalls = [];
        const provider = new BitcoinInjectedProviderWalletAdapter({
            injectedProvider: fakeUnisatProvider({ onSignPsbt: (psbtHex) => psbtHex, calls: walletCalls })
        });
        const connection = new BitcoinWalletConnection({ provider });
        await connection.connect();

        const reviewedSigner = new BitcoinAnchorReviewedPsbtSigner({ wallet: connection.wallet });
        const result = await reviewedSigner.requestSignature({ description: substitutedDescription, reviewedUnsignedPsbtHex: review.unsignedPsbtHex });
        assert(result.signed === false && !result.unavailable, '16. signing a substituted transaction is a definite refusal, never "unavailable"');
        assert(/no longer matches/.test(result.reason), '17. the refusal names the mismatch honestly');
        assert(walletCalls.length === 0, '18. the wallet is NEVER consulted at all when the description no longer matches what was reviewed');
    }
    console.log('✓ Section B: a description that no longer matches what was reviewed is refused before the wallet is ever asked');

    // ---------------------------------------------------------------
    // Section C — a wallet that signs a genuinely DIFFERENT transaction
    // than the one it was asked to sign is still caught by the unchanged,
    // independent 0.8.50 inspection boundary.
    // ---------------------------------------------------------------
    {
        const description = buildDescription({ psbtBuilder, transactionBuilder, key: keyA, contentHash: 'deadbeef' });
        const review = describeBitcoinAnchorTransactionReview(description);

        // A malicious/buggy wallet: asked to sign `description`, it
        // instead returns a genuinely, cryptographically valid signature
        // over a DIFFERENT transaction entirely.
        const otherDescription = buildDescription({ psbtBuilder, transactionBuilder, key: keyA, contentHash: 'facefeed' });
        const deceptiveSignedHex = buildSignedPsbtHex(otherDescription, {
            inputExtras: [[finalScriptWitnessKv(signRealInput(otherDescription, 0, keyA, nonce2), keyA.pubkeyHex)]]
        });

        const provider = new BitcoinInjectedProviderWalletAdapter({
            injectedProvider: fakeUnisatProvider({ onSignPsbt: () => deceptiveSignedHex })
        });
        const connection = new BitcoinWalletConnection({ provider });
        await connection.connect();

        const reviewedSigner = new BitcoinAnchorReviewedPsbtSigner({ wallet: connection.wallet });
        const result = await reviewedSigner.requestSignature({ description, reviewedUnsignedPsbtHex: review.unsignedPsbtHex });
        assert(result.signed === false && !result.unavailable, '19. a wallet signing a different transaction than it was asked to is refused, never "unavailable"');
        assert(/does not match the intended transaction/.test(result.reason), '20. the refusal is anchoring/BitcoinAnchorSignedPsbtInspector.js\'s own, unchanged reason — this milestone adds a precondition, never a replacement for it');
    }
    console.log('✓ Section C: a wallet that signs a genuinely different transaction than it was asked to is still refused by the unchanged 0.8.50 inspection boundary');

    // ---------------------------------------------------------------
    // Section D — describeBitcoinAnchorTransactionReview()'s own fixed
    // shape, frozen result, "never a verdict" restraint, and honest
    // change-less reporting.
    // ---------------------------------------------------------------
    {
        const description = buildDescription({ psbtBuilder, transactionBuilder, key: keyA, contentHash: 'deadbeef' });
        const review = describeBitcoinAnchorTransactionReview(description);
        assert(Object.isFrozen(review), '21. the review result is frozen');
        assert(Object.keys(review).sort().join(',') === ['anchorType', 'changeSats', 'contentHash', 'feeSats', 'inputs', 'network', 'outputs', 'totalInputSats', 'unsignedPsbtHex'].sort().join(','),
            '22. describeBitcoinAnchorTransactionReview() carries exactly this fixed field set — no more, no less');
        for (const forbidden of ['valid', 'safe', 'recommended', 'confidence', 'score', 'trusted', 'authorized']) {
            assert(!(forbidden in review), `23. the review never carries a "${forbidden}" field — reviewing a transaction's own facts is never promoted to a verdict about it`);
        }

        // A change-less transaction: a UTXO whose leftover after fees
        // would fall below dust is folded entirely into the fee (0.8.47's
        // own restraint) — the review reports that honestly, never
        // fabricating a change entry that does not exist.
        const changelessPlan = transactionBuilder.build({ contentHash: 'ab', utxos: [utxo('c', 0, 600, 'p2wpkh')], changeAddress: 'bc1qexamplechangeaddress' });
        const changelessDescription = psbtBuilder.build({
            plan: changelessPlan,
            utxoDetails: [{ txid: changelessPlan.inputs[0].txid, vout: 0, scriptPubKey: '0014' + bytesToHex(keyA.hash160Bytes), valueSats: 600 }]
        });
        const changelessReview = describeBitcoinAnchorTransactionReview(changelessDescription);
        assert(changelessReview.changeSats === 0 && changelessReview.outputs.length === 1, '24. a change-less transaction reports changeSats: 0 and exactly one (op_return) output, honestly');
    }
    console.log('✓ Section D: describeBitcoinAnchorTransactionReview() carries exactly its documented, frozen, verdict-free field set, and reports a change-less transaction honestly');

    // ---------------------------------------------------------------
    // Section E — caller-contract violations throw, before any wallet or
    // network is ever consulted.
    // ---------------------------------------------------------------
    {
        const description = buildDescription({ psbtBuilder, transactionBuilder, key: keyA, contentHash: 'deadbeef' });
        const provider = new BitcoinInjectedProviderWalletAdapter({ injectedProvider: fakeUnisatProvider({ onSignPsbt: (h) => h }) });
        const connection = new BitcoinWalletConnection({ provider });
        await connection.connect();
        const reviewedSigner = new BitcoinAnchorReviewedPsbtSigner({ wallet: connection.wallet });

        await expectThrowsAsync(() => reviewedSigner.requestSignature({ description }), '25. omitting reviewedUnsignedPsbtHex entirely throws — there is no "sign without having reviewed anything"');
        await expectThrowsAsync(() => reviewedSigner.requestSignature({ description, reviewedUnsignedPsbtHex: '' }), '26. an empty reviewedUnsignedPsbtHex throws');

        expectThrows(() => describeBitcoinAnchorTransactionReview({ not: 'a real description' }), '27. a malformed description throws — this is a caller-contract violation on an already-known-good internal artifact, never an operational "review unavailable" outcome');
        expectThrows(() => describeBitcoinAnchorTransactionReview(null), '28. a null description throws');
    }
    console.log('✓ Section E: a missing review commitment and a malformed description both throw as caller-contract violations');

    console.log('\nAll BitcoinAnchorTransactionReviewUX tests passed.');
}

run().catch((error) => {
    console.error('BitcoinAnchorTransactionReviewUX.test.js FAILED:', error);
    process.exitCode = 1;
});
