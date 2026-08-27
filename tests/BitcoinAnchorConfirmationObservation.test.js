import { BitcoinAnchorConfirmationObserver } from '../anchoring/BitcoinAnchorConfirmationObserver.js';
import { BitcoinAnchorConfirmationState } from '../application/BitcoinAnchorConfirmationState.js';
import { BitcoinAnchorTransactionBuilder } from '../anchoring/BitcoinAnchorTransactionBuilder.js';
import { BitcoinAnchorPsbtBuilder } from '../anchoring/BitcoinAnchorPsbtBuilder.js';
import { BitcoinAnchorSignedPsbtFinalizer } from '../anchoring/BitcoinAnchorSignedPsbtFinalizer.js';

// 0.8.54 — Bitcoin Anchor Confirmation Observation.
//
// The flagship this milestone exists to prove: given a real, already-
// broadcast txid — not a hand-typed string, but one anchoring/
// BitcoinAnchorSignedPsbtFinalizer.js (0.8.51) genuinely, cryptographically
// derived from a real content-hash → plan → PSBT → signature chain —
// BitcoinAnchorConfirmationObserver reports exactly what an injected
// confirmationSource says about it, translated into the three-outcome
// CONFIRMED/NOT_CONFIRMED/UNAVAILABLE vocabulary, and NOTHING else: no
// broadcasting, no retry, no signature handling, no reconstruction of the
// transaction, and no modification of anything upstream this class was
// handed.
//
//   Section A: flagship — a real chain (content hash → transaction plan →
//              PSBT → real signature → real finalization) produces a real
//              txid, which is observed as CONFIRMED with real block
//              metadata
//   Section B: a found-but-unconfirmed transaction (e.g. in the mempool)
//              reports NOT_CONFIRMED — a real, positive fact, never
//              UNAVAILABLE
//   Section C: a transaction the source could not find reports
//              UNAVAILABLE, never a rejection
//   Section D: a confirmationSource that throws reports UNAVAILABLE,
//              never propagating the throw
//   Section E: a malformed confirmationSource response is handled without
//              crashing — reported UNAVAILABLE
//   Section F: a "confirmed: true" report with incomplete or malformed
//              block metadata is never taken at face value — reported
//              UNAVAILABLE, never CONFIRMED on partial information
//   Section G: block metadata is preserved exactly, unmodified, and every
//              observation is frozen
//   Section H: repeated observations are independent, fresh reads — never
//              cached, and an earlier observation is never mutated by a
//              later one (including one whose blockHash disagrees with an
//              earlier CONFIRMED observation of the same txid)
//   Section I: a malformed txid throws before the confirmationSource is
//              ever consulted
//   Section J: the constructor requires a real confirmationSource
//   Section K: this class never asks the source for anything beyond
//              fetchConfirmation(txid) — no broadcasting, no signing, no
//              transaction reconstruction anywhere in this file's own
//              fakes
//
// See docs/Roadmap.md, "0.8.54 — Bitcoin Anchor Confirmation Observation."

function assert(condition, message) {
    if (!condition) throw new Error(`ASSERT FAILED: ${message}`);
}

function expectThrows(fn, message) {
    let threw = false;
    try { fn(); } catch (e) { threw = true; }
    assert(threw, message);
}

async function expectRejects(promise, message) {
    let threw = false;
    try { await promise; } catch (e) { threw = true; }
    assert(threw, message);
}

function utxo(txid, vout, valueSats, scriptType) {
    return { txid: txid.repeat(64).slice(0, 64), vout, valueSats, scriptType };
}

// ---------------------------------------------------------------------
// A wholly independent SHA-256 / RIPEMD-160 / secp256k1 implementation —
// plain BigInt arithmetic, sharing no code with any anchoring/ class —
// the identical "wholly independent, hand-rolled" fixture discipline
// tests/BitcoinAnchorTransactionBroadcasting.test.js already established,
// used here ONLY to produce one real, cryptographically-derived txid for
// this file's own flagship. This file never re-tests finalization or
// broadcasting itself — those stay entirely tests/
// BitcoinAnchorPsbtFinalization.test.js's and tests/
// BitcoinAnchorTransactionBroadcasting.test.js's own jobs.
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

function realKey(privateKey) {
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
function buildSignedPsbtHex(description, { inputExtras = [] } = {}) {
    const unsignedTx = description.globalUnsignedTx;
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

// Builds one genuinely, cryptographically finalized transaction and
// returns its real, finalizer-derived txid — this file's only use for
// the crypto fixture above.
function buildRealTxid() {
    const transactionBuilder = new BitcoinAnchorTransactionBuilder({ network: 'mainnet', feeRateSatsPerVByte: 1 });
    const psbtBuilder = new BitcoinAnchorPsbtBuilder();
    const finalizer = new BitcoinAnchorSignedPsbtFinalizer();
    const key = realKey(0x1a2b3c4d5e6f7890a1b2c3d4e5f60718293a4b5c6d7e8f90112233445566778n);
    const nonce = 0x9f8e7d6c5b4a39281706f5e4d3c2b1a0918273645362718293a4b5c6d7e8f90n;

    const plan = transactionBuilder.build({
        contentHash: 'deadbeef',
        utxos: [utxo('a', 0, 100000, 'p2wpkh')],
        changeAddress: 'bc1qexamplechangeaddress'
    });
    const description = psbtBuilder.build({
        plan,
        utxoDetails: [{ txid: plan.inputs[0].txid, vout: 0, scriptPubKey: '0014' + bytesToHex(key.hash160Bytes), valueSats: 100000 }],
        changeScriptPubKey: '0014' + 'b'.repeat(40)
    });
    const sigHex = signRealInput(description, 0, key, nonce);
    const signedHex = buildSignedPsbtHex(description, { inputExtras: [[finalScriptWitnessKv(sigHex, key.pubkeyHex)]] });

    const result = finalizer.finalize({ description, signedPsbt: signedHex });
    if (!result.finalized) {
        throw new Error(`test setup failure: expected a real finalized transaction, got: ${result.reason}`);
    }
    return result.txid;
}

function fakeSource(handler) {
    const calls = [];
    return {
        calls,
        fetchConfirmation(txid) {
            calls.push(txid);
            return handler(txid, calls.length);
        }
    };
}

async function run() {
    const realTxid = buildRealTxid();
    assert(/^[0-9a-f]{64}$/.test(realTxid), 'sanity: buildRealTxid produces a real txid');

    // ---------------------------------------------------------------
    // Section A — flagship: a real, cryptographically-derived txid is
    // observed as CONFIRMED, with real block metadata reported exactly.
    // ---------------------------------------------------------------
    {
        const source = fakeSource(() => ({
            found: true, confirmed: true, blockHash: 'f'.repeat(64), blockHeight: 800000, confirmationCount: 6
        }));
        const observer = new BitcoinAnchorConfirmationObserver({ confirmationSource: source });

        const before = new Date();
        const result = await observer.observeConfirmation(realTxid);
        const after = new Date();

        assert(result.state === BitcoinAnchorConfirmationState.CONFIRMED, '1. a real txid reported confirmed by the source observes as CONFIRMED');
        assert(result.txid === realTxid, '2. the observation echoes back the real, exact txid');
        assert(result.blockHash === 'f'.repeat(64), '3. blockHash is reported exactly as the source gave it');
        assert(result.blockHeight === 800000, '4. blockHeight is reported exactly as the source gave it');
        assert(result.confirmationCount === 6, '5. confirmationCount is reported exactly as the source gave it');
        assert(result.reason === null, '6. a CONFIRMED observation carries no reason');
        assert(result.observedAt instanceof Date && result.observedAt >= before && result.observedAt <= after, '7. observedAt is this call\'s own local clock, not a source-reported timestamp');
        assert(source.calls.length === 1 && source.calls[0] === realTxid, '8. the confirmationSource is consulted exactly once, with the exact real txid');
    }
    console.log('✓ Section A: flagship — a real, cryptographically-derived txid is observed as CONFIRMED, with real block metadata');

    // ---------------------------------------------------------------
    // Section B — a found-but-unconfirmed transaction is a real,
    // positive NOT_CONFIRMED fact, never UNAVAILABLE.
    // ---------------------------------------------------------------
    {
        const source = fakeSource(() => ({ found: true, confirmed: false }));
        const observer = new BitcoinAnchorConfirmationObserver({ confirmationSource: source });

        const result = await observer.observeConfirmation(realTxid);
        assert(result.state === BitcoinAnchorConfirmationState.NOT_CONFIRMED, '9. a found-but-unconfirmed transaction is NOT_CONFIRMED');
        assert(result.blockHash === null && result.blockHeight === null && result.confirmationCount === null, '10. NOT_CONFIRMED carries no block metadata');
        assert(result.reason === null, '11. NOT_CONFIRMED carries no reason — it is not an error');
    }
    console.log('✓ Section B: a found-but-unconfirmed transaction reports NOT_CONFIRMED, a real fact, never UNAVAILABLE');

    // ---------------------------------------------------------------
    // Section C — a transaction the source could not find is
    // UNAVAILABLE, never a rejection.
    // ---------------------------------------------------------------
    {
        const source = fakeSource(() => ({ found: false, reason: 'not found — may not have propagated yet' }));
        const observer = new BitcoinAnchorConfirmationObserver({ confirmationSource: source });

        const result = await observer.observeConfirmation(realTxid);
        assert(result.state === BitcoinAnchorConfirmationState.UNAVAILABLE, '12. a not-found transaction is UNAVAILABLE');
        assert(result.reason === 'not found — may not have propagated yet', '13. the source\'s own reason is passed through');
    }
    console.log('✓ Section C: a transaction the source could not find is UNAVAILABLE, never a rejection');

    // ---------------------------------------------------------------
    // Section D — a confirmationSource that throws reports UNAVAILABLE,
    // never propagating the throw.
    // ---------------------------------------------------------------
    {
        const source = fakeSource(() => { throw new Error('ECONNRESET'); });
        const observer = new BitcoinAnchorConfirmationObserver({ confirmationSource: source });

        let threw = false;
        let result;
        try {
            result = await observer.observeConfirmation(realTxid);
        } catch (e) {
            threw = true;
        }
        assert(!threw, '14. a throwing confirmationSource never propagates out of observeConfirmation()');
        assert(result.state === BitcoinAnchorConfirmationState.UNAVAILABLE && result.reason === 'ECONNRESET', '15. the throw is translated into the UNAVAILABLE form');
    }
    console.log('✓ Section D: a confirmationSource that throws reports UNAVAILABLE, never propagating the throw');

    // ---------------------------------------------------------------
    // Section E — a malformed confirmationSource response is handled
    // without crashing.
    // ---------------------------------------------------------------
    {
        const malformedResponses = [undefined, null, 'confirmed', 42, true, { found: 'yes' }, {}];
        for (const response of malformedResponses) {
            const source = fakeSource(() => response);
            const observer = new BitcoinAnchorConfirmationObserver({ confirmationSource: source });
            const result = await observer.observeConfirmation(realTxid);
            assert(result.state === BitcoinAnchorConfirmationState.UNAVAILABLE, `16. a malformed response (${JSON.stringify(response)}) is treated as UNAVAILABLE, never a crash`);
            assert(typeof result.reason === 'string' && result.reason.length > 0, '17. a malformed response still yields a non-empty reason');
        }
    }
    console.log('✓ Section E: a malformed confirmationSource response is handled without crashing — reported UNAVAILABLE');

    // ---------------------------------------------------------------
    // Section F — a "confirmed: true" report with incomplete or
    // malformed block metadata is never taken at face value.
    // ---------------------------------------------------------------
    {
        const badMetadataResponses = [
            { found: true, confirmed: true }, // no block fields at all
            { found: true, confirmed: true, blockHash: 'f'.repeat(64), blockHeight: 800000 }, // missing confirmationCount
            { found: true, confirmed: true, blockHash: '', blockHeight: 800000, confirmationCount: 1 }, // empty blockHash
            { found: true, confirmed: true, blockHash: 'f'.repeat(64), blockHeight: 'not-a-number', confirmationCount: 1 },
            { found: true, confirmed: true, blockHash: 'f'.repeat(64), blockHeight: 800000, confirmationCount: 0 }, // non-positive
            { found: true, confirmed: true, blockHash: 'f'.repeat(64), blockHeight: 800000, confirmationCount: -1 }
        ];
        for (const response of badMetadataResponses) {
            const source = fakeSource(() => response);
            const observer = new BitcoinAnchorConfirmationObserver({ confirmationSource: source });
            const result = await observer.observeConfirmation(realTxid);
            assert(result.state === BitcoinAnchorConfirmationState.UNAVAILABLE, `18. incomplete block metadata (${JSON.stringify(response)}) is never reported as CONFIRMED`);
        }
    }
    console.log('✓ Section F: a "confirmed" report with incomplete or malformed block metadata is reported UNAVAILABLE, never CONFIRMED');

    // ---------------------------------------------------------------
    // Section G — block metadata is preserved exactly, and every
    // observation is frozen.
    // ---------------------------------------------------------------
    {
        const source = fakeSource(() => ({
            found: true, confirmed: true, blockHash: 'a1b2'.repeat(16), blockHeight: 912345, confirmationCount: 42
        }));
        const observer = new BitcoinAnchorConfirmationObserver({ confirmationSource: source });

        const result = await observer.observeConfirmation(realTxid);
        assert(result.blockHash === 'a1b2'.repeat(16) && result.blockHeight === 912345 && result.confirmationCount === 42, '19. block metadata is preserved exactly, unmodified');
        assert(Object.isFrozen(result), '20. an observation record is frozen — never mutable after it is produced');
    }
    console.log('✓ Section G: block metadata is preserved exactly, and every observation is frozen');

    // ---------------------------------------------------------------
    // Section H — repeated observations are independent, fresh reads.
    // ---------------------------------------------------------------
    {
        let call = 0;
        const source = fakeSource(() => {
            call++;
            if (call === 1) return { found: true, confirmed: false };
            if (call === 2) return { found: true, confirmed: true, blockHash: 'a'.repeat(64), blockHeight: 700000, confirmationCount: 1 };
            return { found: true, confirmed: true, blockHash: 'b'.repeat(64), blockHeight: 700001, confirmationCount: 1 };
        });
        const observer = new BitcoinAnchorConfirmationObserver({ confirmationSource: source });

        const first = await observer.observeConfirmation(realTxid);
        const second = await observer.observeConfirmation(realTxid);
        const third = await observer.observeConfirmation(realTxid);

        assert(first.state === BitcoinAnchorConfirmationState.NOT_CONFIRMED, '21. the first observation reflects the source\'s first answer');
        assert(second.state === BitcoinAnchorConfirmationState.CONFIRMED && second.blockHash === 'a'.repeat(64), '22. the second observation reflects the source\'s second, independent answer');
        assert(third.state === BitcoinAnchorConfirmationState.CONFIRMED && third.blockHash === 'b'.repeat(64), '23. a third observation naming a DIFFERENT blockHash is reported exactly as given — a possible reorganization the observer never hides or reconciles');
        assert(first.state === BitcoinAnchorConfirmationState.NOT_CONFIRMED && second.blockHash === 'a'.repeat(64), '24. the earlier observations are never mutated by a later call');
        assert(source.calls.length === 3, '25. each call reaches the confirmationSource independently — never cached');
    }
    console.log('✓ Section H: repeated observations are independent, fresh reads — never cached, never mutating an earlier observation');

    // ---------------------------------------------------------------
    // Section I — a malformed txid throws before the confirmationSource
    // is ever consulted.
    // ---------------------------------------------------------------
    {
        const malformedTxids = [undefined, null, '', 'not-hex', 'a'.repeat(63), 'a'.repeat(65), 123];
        for (const badTxid of malformedTxids) {
            const source = fakeSource(() => ({ found: true, confirmed: true, blockHash: 'a'.repeat(64), blockHeight: 1, confirmationCount: 1 }));
            const observer = new BitcoinAnchorConfirmationObserver({ confirmationSource: source });
            await expectRejects(observer.observeConfirmation(badTxid), `26. a malformed txid (${JSON.stringify(badTxid)}) throws`);
            assert(source.calls.length === 0, '27. the confirmationSource is never consulted for a malformed txid');
        }
    }
    console.log('✓ Section I: a malformed txid throws before the confirmationSource is ever consulted');

    // ---------------------------------------------------------------
    // Section J — the constructor requires a real confirmationSource.
    // ---------------------------------------------------------------
    {
        expectThrows(() => new BitcoinAnchorConfirmationObserver({}), '28. no confirmationSource at all throws');
        expectThrows(() => new BitcoinAnchorConfirmationObserver({ confirmationSource: {} }), '29. a confirmationSource without a fetchConfirmation() function throws');
        expectThrows(() => new BitcoinAnchorConfirmationObserver({ confirmationSource: { fetchConfirmation: 'not-a-function' } }), '30. a confirmationSource whose fetchConfirmation is not a function throws');
    }
    console.log('✓ Section J: the constructor requires a real confirmationSource');

    // ---------------------------------------------------------------
    // Section K — this class only ever calls fetchConfirmation(txid) —
    // no broadcasting, no signing, no transaction reconstruction.
    // ---------------------------------------------------------------
    {
        const source = { fetchConfirmation: (txid) => ({ found: true, confirmed: false, echoedTxid: txid }) };
        assert(typeof source.broadcast === 'undefined', '31. sanity: this fake exposes no broadcast() at all');
        const observer = new BitcoinAnchorConfirmationObserver({ confirmationSource: source });
        const result = await observer.observeConfirmation(realTxid);
        assert(result.state === BitcoinAnchorConfirmationState.NOT_CONFIRMED, '32. observeConfirmation() succeeds using only fetchConfirmation(), nothing else');
    }
    console.log('✓ Section K: this class never asks the source for anything beyond fetchConfirmation(txid)');

    console.log('\nAll BitcoinAnchorConfirmationObservation tests passed.');
}

run().catch((error) => {
    console.error('BitcoinAnchorConfirmationObservation.test.js FAILED:', error);
    process.exitCode = 1;
});
