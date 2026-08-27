import { BitcoinWalletFundingObserver } from '../anchoring/BitcoinWalletFundingObserver.js';
import { BitcoinAnchorTransactionBuilder } from '../anchoring/BitcoinAnchorTransactionBuilder.js';
import { BitcoinAnchorPsbtBuilder } from '../anchoring/BitcoinAnchorPsbtBuilder.js';
import { BitcoinAnchorSignedPsbtFinalizer } from '../anchoring/BitcoinAnchorSignedPsbtFinalizer.js';
import { BitcoinAnchorTransactionBroadcaster } from '../anchoring/BitcoinAnchorTransactionBroadcaster.js';
import { BitcoinWalletConnection } from '../anchoring/BitcoinWalletConnection.js';
import { BitcoinInjectedProviderWalletAdapter } from '../anchoring/BitcoinInjectedProviderWalletAdapter.js';
import { BitcoinAnchorFundingObservationState } from '../application/BitcoinAnchorFundingObservationState.js';
import { BitcoinAnchorTransactionConstructionCoordinator } from '../application/BitcoinAnchorTransactionConstructionCoordinator.js';
import { BitcoinAnchorTransactionConstructionState } from '../application/BitcoinAnchorTransactionConstructionState.js';
import { BitcoinAnchorTransactionReviewCoordinator } from '../application/BitcoinAnchorTransactionReviewCoordinator.js';
import { BitcoinAnchorReviewedSigningCoordinator } from '../application/BitcoinAnchorReviewedSigningCoordinator.js';
import { BitcoinAnchorReviewedSigningState } from '../application/BitcoinAnchorReviewedSigningState.js';
import { BitcoinAnchorSignedPsbtFinalizationCoordinator } from '../application/BitcoinAnchorSignedPsbtFinalizationCoordinator.js';
import { BitcoinAnchorSignedPsbtFinalizationState } from '../application/BitcoinAnchorSignedPsbtFinalizationState.js';
import { BitcoinAnchorBroadcastCoordinator } from '../application/BitcoinAnchorBroadcastCoordinator.js';
import { BitcoinAnchorBroadcastState, isValidBitcoinAnchorBroadcastState } from '../application/BitcoinAnchorBroadcastState.js';
import { describeBitcoinAnchorBroadcast } from '../application/BitcoinAnchorBroadcastView.js';

// 0.8.64 — Explicit Bitcoin Anchor Broadcast UI.
//
// The flagship this milestone exists to prove: the full pipeline this
// codebase has built since 0.8.47, taken one step further than application/
// BitcoinAnchorSignedPsbtFinalizationCoordinator.js (0.8.63) ever took it —
//
//   observe funding (0.8.60) -> construct (0.8.61) -> review (0.8.62)
//     -> connect a wallet (0.8.58) -> "Sign Reviewed Transaction" (0.8.62)
//     -> "Verify & Finalize Transaction" (0.8.63)
//     -> a real, FINALIZED transaction, with a real txid
//     -> explicit "Broadcast Transaction"
//     -> BitcoinAnchorBroadcastCoordinator (THIS MILESTONE — new)
//     -> anchoring/BitcoinAnchorTransactionBroadcaster.js#broadcast()  (0.8.52,
//        UNCHANGED)
//     -> BROADCASTED, with the SAME real txid, and NOTHING beyond that
//
//   Section A: FLAGSHIP — the complete, real pipeline, ending in a real
//              BROADCASTED outcome; the injected broadcaster receives
//              exactly the finalizer's own raw transaction hex.
//   Section B: a definite rejection is reported as REJECTED, with the
//              broadcaster's own reason, and no txid.
//   Section C: network unavailable is reported as UNAVAILABLE, never a
//              rejection.
//   Section D: no automatic retry — broadcast() reaches the injected
//              broadcaster exactly once per call; two EXPLICIT calls with
//              the identical bound artifact reach it twice, deterministically.
//   Section E: caller-contract violations (finalized !== true, or a
//              missing txid/rawTransaction) throw before the injected
//              broadcaster is ever consulted.
//   Section F: constructing the coordinator without a real broadcaster
//              throws.
//   Section G: a BROADCASTED outcome and its view carry no confirmation-
//              shaped field of any kind — BROADCASTED is never CONFIRMED.
//   Section H: the view is a pure, stateless projection of the
//              coordinator's own outcome.
//   Section I: the state vocabulary carries exactly its six documented
//              values, and no forbidden verdict word.
//
// See docs/Principles.md, "Broadcasting Submits; It Does Not Decide
// (0.8.52)," extended here to the explicit UI action that finally reaches
// it.

function assert(condition, message) {
    if (!condition) throw new Error(`ASSERT FAILED: ${message}`);
}

function expectThrows(fn, message) {
    let threw = false;
    try { fn(); } catch (_e) { threw = true; }
    assert(threw, message);
}

async function expectRejects(promise, message) {
    let threw = false;
    try { await promise; } catch (_e) { threw = true; }
    assert(threw, message);
}

// ---------------------------------------------------------------------
// A wholly independent bech32 ENCODER — duplicated, not imported, from
// tests/BitcoinAnchorSignedPsbtFinalizationUX.test.js (0.8.63).
// ---------------------------------------------------------------------

const CHARSET = 'qpzry9x8gf2tvdw0s3jn54khce6mua7l';
const GEN = [0x3b6a57b2, 0x26508e6d, 0x1ea119fa, 0x3d4233dd, 0x2a1462b3];

function bech32Polymod(values) {
    let chk = 1;
    for (const value of values) {
        const top = chk >>> 25;
        chk = ((chk & 0x1ffffff) << 5) ^ value;
        for (let i = 0; i < 5; i++) { if ((top >>> i) & 1) chk ^= GEN[i]; }
    }
    return chk >>> 0;
}
function bech32HrpExpand(hrp) {
    const result = [];
    for (const char of hrp) result.push(char.charCodeAt(0) >>> 5);
    result.push(0);
    for (const char of hrp) result.push(char.charCodeAt(0) & 31);
    return result;
}
function bech32Checksum(hrp, data) {
    const values = bech32HrpExpand(hrp).concat(data).concat([0, 0, 0, 0, 0, 0]);
    const mod = bech32Polymod(values) ^ 1;
    const checksum = [];
    for (let p = 0; p < 6; p++) checksum.push((mod >>> (5 * (5 - p))) & 31);
    return checksum;
}
function bech32ConvertBits(data, fromBits, toBits, pad) {
    let acc = 0, bits = 0;
    const result = [];
    const maxValue = (1 << toBits) - 1;
    for (const value of data) {
        acc = (acc << fromBits) | value;
        bits += fromBits;
        while (bits >= toBits) { bits -= toBits; result.push((acc >>> bits) & maxValue); }
    }
    if (pad && bits > 0) result.push((acc << (toBits - bits)) & maxValue);
    return result;
}
function encodeSegwitAddress(hrp, witnessVersion, programBytes) {
    const data = [witnessVersion].concat(bech32ConvertBits(Array.from(programBytes), 8, 5, true));
    const combined = data.concat(bech32Checksum(hrp, data));
    return hrp + '1' + combined.map((d) => CHARSET[d]).join('');
}

// ---------------------------------------------------------------------
// A wholly independent SHA-256 / RIPEMD-160 / secp256k1 implementation —
// duplicated, not imported, from every other Bitcoin test file in this
// codebase, the identical self-containment discipline each one already
// holds.
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
    const s = fmod(modInv(nonce, N) * (z + r * privateKey), N);
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
    return bytesToHex(concatBytes([derEncodeSignature(r, s), Uint8Array.from([1])]));
}

// ---------------------------------------------------------------------
// A wholly independent, hand-rolled signed-PSBT encoder.
// ---------------------------------------------------------------------

function u32le(n) { return [n & 0xff, (n >>> 8) & 0xff, (n >>> 16) & 0xff, (n >>> 24) & 0xff].map((b) => b.toString(16).padStart(2, '0')).join(''); }
function compactSizeHex(n) {
    if (n <= 0xfc) return n.toString(16).padStart(2, '0');
    throw new Error('test helper does not need multi-byte compactSize');
}
function reverseHex(hex) { return hex.match(/.{2}/g).reverse().join(''); }
function kv(keyHex, valueHex) { return compactSizeHex(keyHex.length / 2) + keyHex + compactSizeHex(valueHex.length / 2) + valueHex; }
function encodeUnsignedTxHex(tx) {
    const inputsHex = tx.inputs.map((input) => reverseHex(input.txid) + u32le(input.vout) + compactSizeHex(0) + u32le(input.sequence)).join('');
    const outputsHex = tx.outputs.map((output) => u64leHex(output.valueSats) + compactSizeHex(output.scriptPubKey.length / 2) + output.scriptPubKey).join('');
    return u32le(tx.version) + compactSizeHex(tx.inputs.length) + inputsHex + compactSizeHex(tx.outputs.length) + outputsHex + u32le(tx.locktime);
}
function u64leHex(n) {
    let big = BigInt(n);
    const bytes = [];
    for (let i = 0; i < 8; i++) { bytes.push(Number(big & 0xffn)); big >>= 8n; }
    return bytes.map((b) => b.toString(16).padStart(2, '0')).join('');
}
function buildSignedPsbtHex(description, { inputExtras = [] } = {}) {
    const unsignedTx = description.globalUnsignedTx;
    let out = '70736274ff';
    out += kv('00', encodeUnsignedTxHex(unsignedTx));
    out += '00';
    description.inputs.forEach((input, i) => {
        const w = input.witnessUtxo;
        out += kv('01', u64leHex(w.valueSats) + compactSizeHex(w.scriptPubKey.length / 2) + w.scriptPubKey);
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

function utxo(txid, vout, valueSats, scriptType) {
    return { txid: txid.repeat(64).slice(0, 64), vout, valueSats, scriptType };
}

function fakeUnisatProvider({ account, network = 'livenet', onSignPsbt, calls = [] } = {}) {
    return {
        async requestAccounts() { return [account]; },
        async getNetwork() { return network; },
        async signPsbt(psbtHex) {
            calls.push(psbtHex);
            return onSignPsbt(psbtHex);
        }
    };
}

function fakeFundingSource(utxos) {
    return { async fetchUtxos() { return { found: true, utxos }; } };
}

function fakeBroadcaster(handler) {
    const calls = [];
    return {
        calls,
        broadcast(rawTransactionHex) {
            calls.push(rawTransactionHex);
            return handler(rawTransactionHex, calls.length);
        }
    };
}

async function run() {
    const keyA = realKey(0x1a2b3c4d5e6f7890a1b2c3d4e5f60718293a4b5c6d7e8f90112233445566778n);
    const aliceAddress = encodeSegwitAddress('bc', 0, keyA.hash160Bytes);
    const nonce1 = 0x9f8e7d6c5b4a39281706f5e4d3c2b1a0918273645362718293a4b5c6d7e8f90n;
    const txid = (byte) => byte.toString(16).padStart(2, '0').repeat(32);

    // Builds one genuinely, cryptographically finalized transaction, via
    // the REAL end-to-end pipeline — observe funding, construct, review,
    // connect a wallet, sign, and finalize. Returns the exact
    // `{ finalized: true, txid, rawTransaction }` shape a FINALIZED
    // outcome produces, THIS milestone's own coordinator is meant to
    // accept.
    async function buildRealFinalizedTransaction() {
        const builder = new BitcoinAnchorTransactionBuilder({ network: 'mainnet', feeRateSatsPerVByte: 1 });
        const psbtBuilder = new BitcoinAnchorPsbtBuilder();

        const observer = new BitcoinWalletFundingObserver({ fundingSource: fakeFundingSource([{ txid: txid(0xaa), vout: 0, valueSats: 150000 }]) });
        const observation = await observer.observeFunding({ account: aliceAddress, network: 'mainnet' });
        assert(observation.state === BitcoinAnchorFundingObservationState.OBSERVED, 'sanity: a real fundingSource produces a real OBSERVED observation');

        const constructionCoordinator = new BitcoinAnchorTransactionConstructionCoordinator({ bitcoinAnchorTransactionBuilder: builder });
        const constructed = constructionCoordinator.construct({ publicationId: 'pub-1', contentHash: 'deadbeef', fundingObservation: observation });
        assert(constructed.state === BitcoinAnchorTransactionConstructionState.CONSTRUCTED, 'sanity: comfortable funding constructs successfully');

        const reviewCoordinator = new BitcoinAnchorTransactionReviewCoordinator({ bitcoinAnchorPsbtBuilder: psbtBuilder });
        const reviewOutcome = reviewCoordinator.review({ construction: constructed.construction });
        assert(reviewOutcome.reviewable === true, 'sanity: a real, native-segwit funding observation bridges into a reviewable PSBT description');

        const signedHex = buildSignedPsbtHex(reviewOutcome.description, {
            inputExtras: [[finalScriptWitnessKv(signRealInput(reviewOutcome.description, 0, keyA, nonce1), keyA.pubkeyHex)]]
        });
        const provider = new BitcoinInjectedProviderWalletAdapter({ injectedProvider: fakeUnisatProvider({ account: aliceAddress, onSignPsbt: () => signedHex }) });
        const connection = new BitcoinWalletConnection({ provider });
        const connectResult = await connection.connect();
        assert(connectResult.connected === true, 'sanity: Alice connects her wallet');

        const signingCoordinator = new BitcoinAnchorReviewedSigningCoordinator();
        const signOutcome = await signingCoordinator.sign({
            wallet: connection.wallet, description: reviewOutcome.description, reviewedUnsignedPsbtHex: reviewOutcome.review.unsignedPsbtHex
        });
        assert(signOutcome.state === BitcoinAnchorReviewedSigningState.SIGNED, 'sanity: the wallet genuinely, cryptographically signs the exact PSBT that was reviewed');

        const finalizationCoordinator = new BitcoinAnchorSignedPsbtFinalizationCoordinator({ bitcoinAnchorSignedPsbtFinalizer: new BitcoinAnchorSignedPsbtFinalizer() });
        const finalizeOutcome = finalizationCoordinator.finalize({ description: reviewOutcome.description, signedPsbt: signOutcome.psbt });
        assert(finalizeOutcome.state === BitcoinAnchorSignedPsbtFinalizationState.FINALIZED, 'sanity: a genuinely signed PSBT, produced by the real end-to-end pipeline, cryptographically finalizes');

        return { finalized: true, txid: finalizeOutcome.txid, rawTransaction: finalizeOutcome.rawTransaction };
    }

    function freshBroadcastCoordinator(broadcaster) {
        const bitcoinAnchorTransactionBroadcaster = new BitcoinAnchorTransactionBroadcaster({ broadcaster });
        return new BitcoinAnchorBroadcastCoordinator({ bitcoinAnchorTransactionBroadcaster });
    }

    // ---------------------------------------------------------------
    // Section A — FLAGSHIP: the full, real pipeline, ending in a real
    // BROADCASTED outcome.
    // ---------------------------------------------------------------
    {
        const finalized = await buildRealFinalizedTransaction();
        assert(/^[0-9a-f]{64}$/.test(finalized.txid), 'sanity: a real txid was produced');

        const fake = fakeBroadcaster(() => ({ broadcast: true, txid: finalized.txid }));
        const coordinator = freshBroadcastCoordinator(fake);

        const outcome = await coordinator.broadcast(finalized);
        assert(outcome.state === BitcoinAnchorBroadcastState.BROADCASTED, '1. a real, finalized transaction broadcasts successfully through the new coordinator');
        assert(outcome.broadcasted === true, '2. the outcome reports broadcasted: true');
        assert(outcome.txid === finalized.txid, '3. the reported txid is the finalizer\'s own real txid, unchanged');
        assert(fake.calls.length === 1 && fake.calls[0] === finalized.rawTransaction.hex, '4. the injected broadcaster receives exactly the finalizer\'s own raw transaction hex, unmodified');

        const view = describeBitcoinAnchorBroadcast(outcome);
        assert(view.state === BitcoinAnchorBroadcastState.BROADCASTED, '5. the view reports the coordinator\'s own BROADCASTED state');
        assert(view.txid === finalized.txid, '6. the view exposes the real txid');
    }
    console.log('✓ Section A (FLAGSHIP): observe -> construct -> review -> connect -> sign -> finalize -> broadcast, byte-identical throughout, into a real BROADCASTED outcome');

    // ---------------------------------------------------------------
    // Section B — a definite rejection is reported as REJECTED, with the
    // broadcaster's own reason, and no txid.
    // ---------------------------------------------------------------
    {
        const finalized = await buildRealFinalizedTransaction();
        const fake = fakeBroadcaster(() => ({ broadcast: false, reason: 'min relay fee not met' }));
        const coordinator = freshBroadcastCoordinator(fake);

        const outcome = await coordinator.broadcast(finalized);
        assert(outcome.state === BitcoinAnchorBroadcastState.REJECTED, '7. a definite rejection is reported as REJECTED');
        assert(outcome.broadcasted === false && outcome.txid === null, '8. a rejected outcome carries no txid');
        assert(outcome.reason === 'min relay fee not met', '9. the rejection reason is passed through verbatim');
    }
    console.log('✓ Section B: a definite rejection is reported as REJECTED, with the broadcaster\'s own reason, and no txid');

    // ---------------------------------------------------------------
    // Section C — network unavailable is reported as UNAVAILABLE, never a
    // rejection.
    // ---------------------------------------------------------------
    {
        const finalized = await buildRealFinalizedTransaction();
        const fake = fakeBroadcaster(() => ({ broadcast: false, unavailable: true, reason: 'no network connectivity' }));
        const coordinator = freshBroadcastCoordinator(fake);

        const outcome = await coordinator.broadcast(finalized);
        assert(outcome.state === BitcoinAnchorBroadcastState.UNAVAILABLE, '10. network unavailable is reported as UNAVAILABLE, never REJECTED');
        assert(outcome.reason === 'no network connectivity', '11. the unavailable reason is passed through');
    }
    console.log('✓ Section C: network unavailable is reported as UNAVAILABLE, never a rejection');

    // ---------------------------------------------------------------
    // Section D — no automatic retry: broadcast() reaches the injected
    // broadcaster exactly once per call; two EXPLICIT calls with the
    // identical bound artifact reach it twice, deterministically.
    // ---------------------------------------------------------------
    {
        const finalized = await buildRealFinalizedTransaction();
        const fake = fakeBroadcaster(() => ({ broadcast: true }));
        const coordinator = freshBroadcastCoordinator(fake);

        const first = await coordinator.broadcast(finalized);
        assert(fake.calls.length === 1, '12. a single explicit broadcast() call reaches the injected broadcaster exactly once');

        // A second, EXPLICIT call — never automatic — with the identical
        // bound artifact (exactly what "Broadcast Again" on the same
        // finalized transaction would do) is deterministic.
        const second = await coordinator.broadcast(finalized);
        assert(fake.calls.length === 2, '13. a second explicit call reaches the injected broadcaster again — never batched or deduplicated automatically');
        assert(fake.calls[0] === fake.calls[1] && fake.calls[0] === finalized.rawTransaction.hex, '14. both calls submit byte-for-byte identical bytes');
        assert(first.state === BitcoinAnchorBroadcastState.BROADCASTED && second.state === BitcoinAnchorBroadcastState.BROADCASTED, '15. both explicit attempts succeed');
        assert(first.txid === finalized.txid && second.txid === finalized.txid, '16. both attempts report the identical, real txid');
    }
    console.log('✓ Section D: no automatic retry — each explicit broadcast() call reaches the injected broadcaster exactly once, and repeat explicit calls are deterministic');

    // ---------------------------------------------------------------
    // Section E — caller-contract violations throw before the injected
    // broadcaster is ever consulted.
    // ---------------------------------------------------------------
    {
        const finalized = await buildRealFinalizedTransaction();

        const fake1 = fakeBroadcaster(() => ({ broadcast: true }));
        await expectRejects(freshBroadcastCoordinator(fake1).broadcast({ finalized: false, txid: finalized.txid, rawTransaction: finalized.rawTransaction }),
            '17. finalized: false throws');
        assert(fake1.calls.length === 0, '18. the injected broadcaster is never consulted when finalized is not true');

        const fake2 = fakeBroadcaster(() => ({ broadcast: true }));
        await expectRejects(freshBroadcastCoordinator(fake2).broadcast({ txid: finalized.txid, rawTransaction: finalized.rawTransaction }),
            '19. a missing finalized flag throws');
        assert(fake2.calls.length === 0, '20. the injected broadcaster is never consulted when finalized is missing');

        const fake3 = fakeBroadcaster(() => ({ broadcast: true }));
        await expectRejects(freshBroadcastCoordinator(fake3).broadcast({ finalized: true, rawTransaction: finalized.rawTransaction }),
            '21. a missing txid throws');
        assert(fake3.calls.length === 0, '22. the injected broadcaster is never consulted when txid is missing');

        const fake4 = fakeBroadcaster(() => ({ broadcast: true }));
        await expectRejects(freshBroadcastCoordinator(fake4).broadcast({ finalized: true, txid: finalized.txid }),
            '23. a missing rawTransaction throws');
        assert(fake4.calls.length === 0, '24. the injected broadcaster is never consulted when rawTransaction is missing');
    }
    console.log('✓ Section E: caller-contract violations (finalized !== true, or a missing txid/rawTransaction) throw before the injected broadcaster is ever consulted');

    // ---------------------------------------------------------------
    // Section F — constructing the coordinator without a real broadcaster
    // throws.
    // ---------------------------------------------------------------
    {
        expectThrows(() => new BitcoinAnchorBroadcastCoordinator({}), '25. constructing the coordinator without a real broadcaster throws');
        expectThrows(() => new BitcoinAnchorBroadcastCoordinator({ bitcoinAnchorTransactionBroadcaster: {} }), '26. constructing the coordinator with a broadcaster-shaped object lacking broadcast() throws');
    }
    console.log('✓ Section F: constructing the coordinator without a real broadcaster throws');

    // ---------------------------------------------------------------
    // Section G — a BROADCASTED outcome and its view carry no
    // confirmation-shaped field of any kind.
    // ---------------------------------------------------------------
    {
        const finalized = await buildRealFinalizedTransaction();
        const fake = fakeBroadcaster(() => ({ broadcast: true }));
        const outcome = await freshBroadcastCoordinator(fake).broadcast(finalized);
        assert(outcome.state === BitcoinAnchorBroadcastState.BROADCASTED, 'sanity: this attempt broadcasts');

        for (const forbiddenKey of ['confirmed', 'confirmations', 'blockHeight', 'blockHash']) {
            assert(!(forbiddenKey in outcome), `27. the outcome never carries a "${forbiddenKey}" field — BROADCASTED is never CONFIRMED`);
        }
        const view = describeBitcoinAnchorBroadcast(outcome);
        for (const forbiddenKey of ['confirmed', 'confirmations', 'blockHeight', 'blockHash']) {
            assert(!(forbiddenKey in view), `28. the view never carries a "${forbiddenKey}" field either`);
        }
    }
    console.log('✓ Section G: a BROADCASTED outcome and its view carry no confirmation-shaped field of any kind — BROADCASTED is never CONFIRMED');

    // ---------------------------------------------------------------
    // Section H — the view is a pure, stateless projection of the
    // coordinator's own outcome.
    // ---------------------------------------------------------------
    {
        const idleView = describeBitcoinAnchorBroadcast(null);
        assert(idleView.state === BitcoinAnchorBroadcastState.IDLE, '29. describeBitcoinAnchorBroadcast(null) reports IDLE — the state before any broadcast attempt has ever been made');
        assert(Object.isFrozen(idleView), '30. the view result is frozen');
        assert(idleView.txid === null && idleView.reason === null, '31. an IDLE view carries no leftover fact from any previous attempt');

        const finalized = await buildRealFinalizedTransaction();
        const fake = fakeBroadcaster(() => ({ broadcast: true }));
        const outcome = await freshBroadcastCoordinator(fake).broadcast(finalized);
        const viewOnce = describeBitcoinAnchorBroadcast(outcome);
        const viewTwice = describeBitcoinAnchorBroadcast(outcome);
        assert(JSON.stringify(viewOnce) === JSON.stringify(viewTwice), '32. calling the view twice with the byte-identical outcome returns a byte-identical result');
    }
    console.log('✓ Section H: the view is a pure, stateless projection of the coordinator\'s own outcome');

    // ---------------------------------------------------------------
    // Section I — the state vocabulary carries exactly its six documented
    // values, and no forbidden verdict word.
    // ---------------------------------------------------------------
    {
        assert(Object.values(BitcoinAnchorBroadcastState).length === 6, '33. the broadcast state vocabulary carries exactly its six documented values');
        for (const forbiddenState of ['ready', 'safe', 'valid', 'confirmed', 'trusted', 'secure', 'recommended']) {
            assert(!Object.values(BitcoinAnchorBroadcastState).includes(forbiddenState), `34. the broadcast state vocabulary never carries a "${forbiddenState}" value`);
        }
        assert(isValidBitcoinAnchorBroadcastState(BitcoinAnchorBroadcastState.BROADCASTED), '35. isValidBitcoinAnchorBroadcastState() recognizes a real state value');
        assert(!isValidBitcoinAnchorBroadcastState('confirmed'), '36. isValidBitcoinAnchorBroadcastState() rejects a value outside the vocabulary');

        const finalized = await buildRealFinalizedTransaction();
        const fake = fakeBroadcaster(() => ({ broadcast: true }));
        const outcome = await freshBroadcastCoordinator(fake).broadcast(finalized);
        const serialized = JSON.stringify(describeBitcoinAnchorBroadcast(outcome)).toLowerCase();
        for (const forbidden of ['safe', 'secure', 'trusted', 'recommended', 'confidence', 'score', 'successrate', 'health']) {
            assert(!serialized.includes(forbidden), `37. the view never carries "${forbidden}" — a broadcast attempt's own real fact is never promoted to a broader verdict`);
        }
    }
    console.log('✓ Section I: the broadcast state vocabulary and view carry no verdict beyond the one real fact this boundary checks, and no undocumented state');

    console.log('\nAll BitcoinAnchorBroadcastUX tests passed.');
}

run().catch((error) => {
    console.error('BitcoinAnchorBroadcastUX.test.js FAILED:', error);
    process.exitCode = 1;
});
