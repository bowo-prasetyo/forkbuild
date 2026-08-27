import { BitcoinWalletFundingObserver } from '../anchoring/BitcoinWalletFundingObserver.js';
import { BitcoinAnchorTransactionBuilder } from '../anchoring/BitcoinAnchorTransactionBuilder.js';
import { BitcoinAnchorPsbtBuilder } from '../anchoring/BitcoinAnchorPsbtBuilder.js';
import { BitcoinAnchorSignedPsbtFinalizer } from '../anchoring/BitcoinAnchorSignedPsbtFinalizer.js';
import { BitcoinAnchorTransactionBroadcaster } from '../anchoring/BitcoinAnchorTransactionBroadcaster.js';
import { BitcoinAnchorConfirmationObserver } from '../anchoring/BitcoinAnchorConfirmationObserver.js';
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
import { BitcoinAnchorBroadcastState } from '../application/BitcoinAnchorBroadcastState.js';
import { BitcoinAnchorConfirmationCoordinator } from '../application/BitcoinAnchorConfirmationCoordinator.js';
import { BitcoinAnchorConfirmationState } from '../application/BitcoinAnchorConfirmationState.js';
import { appendBitcoinAnchorConfirmationObservationHistoryEntry, latestBitcoinAnchorConfirmationObservation } from '../application/BitcoinAnchorConfirmationObservationHistory.js';
import { describeBitcoinAnchorConfirmationObservationHistoryDetails } from '../application/BitcoinAnchorConfirmationObservationHistoryDetailView.js';
import { BitcoinAnchorProofReconciliationView } from '../application/BitcoinAnchorProofReconciliationView.js';
import { BitcoinAnchorContentProofState } from '../application/BitcoinAnchorContentProofState.js';

// 0.8.65 — Explicit Bitcoin Anchor Confirmation UI.
//
// The flagship this milestone exists to prove: the full pipeline this
// codebase has built since 0.8.47, taken one step further than application/
// BitcoinAnchorBroadcastCoordinator.js (0.8.64) ever took it —
//
//   observe funding (0.8.60) -> construct (0.8.61) -> review (0.8.62)
//     -> connect a wallet (0.8.58) -> "Sign Reviewed Transaction" (0.8.62)
//     -> "Verify & Finalize Transaction" (0.8.63)
//     -> a real, FINALIZED transaction, with a real txid
//     -> explicit "Broadcast Transaction" -> a real BROADCASTED outcome (0.8.64)
//     -> explicit "Observe Confirmation" (THIS MILESTONE — new)
//     -> BitcoinAnchorConfirmationCoordinator
//     -> anchoring/BitcoinAnchorConfirmationObserver.js#observeConfirmation()  (0.8.54,
//        UNCHANGED)
//     -> NOT_CONFIRMED, then CONFIRMED (1), then CONFIRMED (6) — the SAME
//        real, broadcasted txid every time, three independent, appended
//        observations, none rewriting another
//
//   Section A: FLAGSHIP — the complete, real pipeline, ending in a
//              three-observation confirmation history for the real
//              broadcasted transaction; no automatic observation ever
//              happens on broadcast.
//   Section B: repeated "Observe Confirmation" clicks are independent,
//              fresh reads — never deduplicated, even when a click repeats
//              the identical state as the one before it.
//   Section C: the coordinator refuses to observe unless its caller proves
//              the txid came from a real BROADCASTED outcome
//              (`broadcasted: true`) — caller-contract violations throw
//              before the injected observer is ever consulted.
//   Section D: constructing the coordinator without a real observer throws.
//   Section E: confirmation observation and OP_RETURN content-proof
//              verification stay fully independent — CONFIRMED never
//              implies HASH_MATCH, and NOT_CONFIRMED never implies
//              UNAVAILABLE — all four combinations are legitimate, and
//              neither history is ever merged with the other.
//   Section F: BROADCASTED never implies CONFIRMED, and a confirmation
//              outcome never carries a content-proof-shaped field.
//
// See docs/Principles.md, "Confirmation Observation Reports What Is; It
// Does Not Decide What It Means (0.8.54)," extended here to the explicit
// UI action that binds it to a specific broadcast transaction's own
// identity.

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
// tests/BitcoinAnchorBroadcastUX.test.js (0.8.64).
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

function fakeUnisatProvider({ account, network = 'livenet', onSignPsbt } = {}) {
    return {
        async requestAccounts() { return [account]; },
        async getNetwork() { return network; },
        async signPsbt(psbtHex) { return onSignPsbt(psbtHex); }
    };
}

function fakeFundingSource(utxos) {
    return { async fetchUtxos() { return { found: true, utxos }; } };
}

function fakeBroadcaster(handler) {
    return { broadcast(rawTransactionHex) { return handler(rawTransactionHex); } };
}

// A fake confirmationSource driven by an ordered SCRIPT of responses, one
// per call — asserts every call is for the expected txid, mirroring
// exactly application/BitcoinAnchorConfirmationObserver.js's own
// `{ fetchConfirmation(txid) -> ... }` contract.
function scriptedConfirmationSource(expectedTxid, script) {
    const calls = [];
    return {
        calls,
        async fetchConfirmation(txid) {
            assert(txid === expectedTxid, 'sanity: the confirmation source is only ever asked about the exact broadcast txid');
            calls.push(txid);
            const response = script[calls.length - 1];
            if (!response) throw new Error('scriptedConfirmationSource: no more scripted responses');
            return response;
        }
    };
}

async function run() {
    const keyA = realKey(0x1a2b3c4d5e6f7890a1b2c3d4e5f60718293a4b5c6d7e8f90112233445566778n);
    const aliceAddress = encodeSegwitAddress('bc', 0, keyA.hash160Bytes);
    const nonce1 = 0x9f8e7d6c5b4a39281706f5e4d3c2b1a0918273645362718293a4b5c6d7e8f90n;
    const txid = (byte) => byte.toString(16).padStart(2, '0').repeat(32);

    // Builds one genuinely, cryptographically finalized and BROADCASTED
    // transaction, via the REAL end-to-end pipeline — observe funding,
    // construct, review, connect a wallet, sign, finalize, and broadcast.
    // Returns the exact `{ state: BROADCASTED, broadcasted: true, txid,
    // reason: null }` shape application/BitcoinAnchorBroadcastCoordinator.js
    // itself produces, alongside `broadcasterCalls` for sanity checks.
    async function buildRealBroadcastedTransaction() {
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

        const broadcasterCalls = [];
        const fakeRawBroadcaster = fakeBroadcaster((rawTransactionHex) => {
            broadcasterCalls.push(rawTransactionHex);
            return { broadcast: true, txid: finalizeOutcome.txid };
        });
        const broadcastCoordinator = new BitcoinAnchorBroadcastCoordinator({
            bitcoinAnchorTransactionBroadcaster: new BitcoinAnchorTransactionBroadcaster({ broadcaster: fakeRawBroadcaster })
        });
        const broadcastOutcome = await broadcastCoordinator.broadcast({
            finalized: true, txid: finalizeOutcome.txid, rawTransaction: finalizeOutcome.rawTransaction
        });
        assert(broadcastOutcome.state === BitcoinAnchorBroadcastState.BROADCASTED, 'sanity: the real, finalized transaction broadcasts successfully');

        return { broadcastOutcome, broadcasterCalls };
    }

    // ---------------------------------------------------------------
    // Section A — FLAGSHIP: the full, real pipeline, ending in a
    // three-observation confirmation history for the real broadcasted
    // transaction; no automatic observation ever happens on broadcast.
    // ---------------------------------------------------------------
    {
        const { broadcastOutcome, broadcasterCalls } = await buildRealBroadcastedTransaction();
        assert(/^[0-9a-f]{64}$/.test(broadcastOutcome.txid), 'sanity: a real txid was broadcast');
        assert(broadcasterCalls.length === 1, 'sanity: exactly one broadcast attempt happened');

        const source = scriptedConfirmationSource(broadcastOutcome.txid, [
            { found: true, confirmed: false },
            { found: true, confirmed: true, blockHash: 'b'.repeat(64), blockHeight: 900000, confirmationCount: 1 },
            { found: true, confirmed: true, blockHash: 'b'.repeat(64), blockHeight: 900000, confirmationCount: 6 }
        ]);
        const observer = new BitcoinAnchorConfirmationObserver({ confirmationSource: source });
        const coordinator = new BitcoinAnchorConfirmationCoordinator({ bitcoinAnchorConfirmationObserver: observer });

        // 5. No automatic observation occurs after broadcasting — the
        // confirmation source has never been asked anything yet.
        assert(source.calls.length === 0, '1. reaching BROADCASTED never itself triggers a confirmation observation');

        let history = [];

        const first = await coordinator.observeConfirmation({ broadcasted: true, txid: broadcastOutcome.txid });
        history = appendBitcoinAnchorConfirmationObservationHistoryEntry(history, first);
        assert(first.state === BitcoinAnchorConfirmationState.NOT_CONFIRMED, '2. the first explicit "Observe Confirmation" click reports NOT_CONFIRMED');
        assert(first.txid === broadcastOutcome.txid, '3. the observation is bound to the exact broadcast txid');

        const second = await coordinator.observeConfirmation({ broadcasted: true, txid: broadcastOutcome.txid });
        history = appendBitcoinAnchorConfirmationObservationHistoryEntry(history, second);
        assert(second.state === BitcoinAnchorConfirmationState.CONFIRMED, '4. the second click reports CONFIRMED');
        assert(second.confirmationCount === 1 && second.blockHeight === 900000, '5. the second click reports the real block metadata, at 1 confirmation');

        const third = await coordinator.observeConfirmation({ broadcasted: true, txid: broadcastOutcome.txid });
        history = appendBitcoinAnchorConfirmationObservationHistoryEntry(history, third);
        assert(third.state === BitcoinAnchorConfirmationState.CONFIRMED, '6. the third click reports CONFIRMED');
        assert(third.confirmationCount === 6, '7. the third click reports the block\'s confirmation count having advanced to 6');

        assert(source.calls.length === 3, '8. exactly three explicit clicks reached the injected confirmation source exactly three times');
        assert(source.calls.every((observed) => observed === broadcastOutcome.txid), '9. every single one of the three calls used the exact broadcast txid, never any other value');

        // All three observations remain in history, in order, metadata
        // unchanged — a later CONFIRMED entry never rewrites or discards
        // an earlier NOT_CONFIRMED one, and the 6-confirmation entry never
        // rewrites the 1-confirmation entry before it.
        assert(history.length === 3, '10. all three observations remain in history — none is ever rewritten into "the current one"');
        assert(history[0] === first && history[1] === second && history[2] === third, '11. history holds the exact three observation objects, in the order they happened');
        assert(history[0].state === BitcoinAnchorConfirmationState.NOT_CONFIRMED, '12. the first history entry is still NOT_CONFIRMED, untouched by the later CONFIRMED entries');
        assert(history[1].confirmationCount === 1, '13. the second history entry still reports 1 confirmation, untouched by the third entry\'s own 6');
        assert(history[2].confirmationCount === 6, '14. the third history entry reports 6 confirmations');

        const latest = latestBitcoinAnchorConfirmationObservation(history);
        assert(latest === third, '15. the latest observation query returns the third, most recent entry');

        const detailed = describeBitcoinAnchorConfirmationObservationHistoryDetails(history);
        assert(detailed.count === 3, '16. the detail view narrates all three entries');
        assert(detailed.entries[0].stateShortLabel === 'Not confirmed' && detailed.entries[1].stateShortLabel === 'Confirmed' && detailed.entries[2].stateShortLabel === 'Confirmed',
            '17. the detail view\'s short labels match each entry\'s own real state, oldest first');
    }
    console.log('✓ Section A (FLAGSHIP): fund -> construct -> review -> connect -> sign -> finalize -> broadcast -> observe (NOT_CONFIRMED) -> observe (CONFIRMED, 1) -> observe (CONFIRMED, 6), with a three-entry, never-rewritten history bound to the real broadcast txid throughout, and no automatic observation on broadcast');

    // ---------------------------------------------------------------
    // Section B — repeated "Observe Confirmation" clicks are independent,
    // fresh reads — never deduplicated, even when a click repeats the
    // identical state as the one before it.
    // ---------------------------------------------------------------
    {
        const { broadcastOutcome } = await buildRealBroadcastedTransaction();
        const source = scriptedConfirmationSource(broadcastOutcome.txid, [
            { found: true, confirmed: false },
            { found: true, confirmed: false }
        ]);
        const coordinator = new BitcoinAnchorConfirmationCoordinator({
            bitcoinAnchorConfirmationObserver: new BitcoinAnchorConfirmationObserver({ confirmationSource: source })
        });

        let history = [];
        const first = await coordinator.observeConfirmation({ broadcasted: true, txid: broadcastOutcome.txid });
        history = appendBitcoinAnchorConfirmationObservationHistoryEntry(history, first);
        const second = await coordinator.observeConfirmation({ broadcasted: true, txid: broadcastOutcome.txid });
        history = appendBitcoinAnchorConfirmationObservationHistoryEntry(history, second);

        assert(source.calls.length === 2, '18. two explicit clicks reach the injected confirmation source exactly twice — never batched or cached');
        assert(history.length === 2, '19. two identical-state observations both remain in history — never collapsed into one');
        assert(first !== second, '20. each click produces its OWN observation object, never the same one returned twice');
        assert(first.observedAt.getTime() <= second.observedAt.getTime(), '21. each observation carries its own, independently recorded observedAt');
    }
    console.log('✓ Section B: repeated explicit "Observe Confirmation" clicks are independent, fresh reads — never deduplicated, even when they report the identical state');

    // ---------------------------------------------------------------
    // Section C — the coordinator refuses to observe unless its caller
    // proves the txid came from a real BROADCASTED outcome; caller-contract
    // violations throw before the injected observer is ever consulted.
    // ---------------------------------------------------------------
    {
        const { broadcastOutcome } = await buildRealBroadcastedTransaction();

        const source1 = scriptedConfirmationSource(broadcastOutcome.txid, [{ found: true, confirmed: false }]);
        const coordinator1 = new BitcoinAnchorConfirmationCoordinator({ bitcoinAnchorConfirmationObserver: new BitcoinAnchorConfirmationObserver({ confirmationSource: source1 }) });
        await expectRejects(coordinator1.observeConfirmation({ broadcasted: false, txid: broadcastOutcome.txid }),
            '22. broadcasted: false throws — a txid alone is never sufficient');
        assert(source1.calls.length === 0, '23. the injected confirmation source is never consulted when broadcasted is not true');

        const source2 = scriptedConfirmationSource(broadcastOutcome.txid, [{ found: true, confirmed: false }]);
        const coordinator2 = new BitcoinAnchorConfirmationCoordinator({ bitcoinAnchorConfirmationObserver: new BitcoinAnchorConfirmationObserver({ confirmationSource: source2 }) });
        await expectRejects(coordinator2.observeConfirmation({ txid: broadcastOutcome.txid }),
            '24. a missing broadcasted flag throws');
        assert(source2.calls.length === 0, '25. the injected confirmation source is never consulted when broadcasted is missing');

        const source3 = scriptedConfirmationSource(broadcastOutcome.txid, [{ found: true, confirmed: false }]);
        const coordinator3 = new BitcoinAnchorConfirmationCoordinator({ bitcoinAnchorConfirmationObserver: new BitcoinAnchorConfirmationObserver({ confirmationSource: source3 }) });
        await expectRejects(coordinator3.observeConfirmation({ broadcasted: true }),
            '26. a missing txid throws, even when broadcasted is true');
        assert(source3.calls.length === 0, '27. the injected confirmation source is never consulted when txid is missing');

        await expectRejects(coordinator3.observeConfirmation(),
            '28. calling with no arguments at all throws');

        // Even a well-formed-looking txid the caller merely TYPED, never
        // obtained from a real broadcast outcome, is refused unless
        // `broadcasted: true` accompanies it — the coordinator has no way
        // to independently verify provenance beyond this caller-contract
        // check, exactly as application/BitcoinAnchorBroadcastCoordinator.js's
        // own `finalized` check has no way to independently verify a
        // `rawTransaction` beyond requiring `finalized: true`.
        const arbitraryTxid = 'c'.repeat(64);
        const source4 = scriptedConfirmationSource(arbitraryTxid, [{ found: true, confirmed: false }]);
        const coordinator4 = new BitcoinAnchorConfirmationCoordinator({ bitcoinAnchorConfirmationObserver: new BitcoinAnchorConfirmationObserver({ confirmationSource: source4 }) });
        await expectRejects(coordinator4.observeConfirmation({ txid: arbitraryTxid }),
            '29. an arbitrary txid displayed elsewhere on a page is refused without broadcasted: true');
        assert(source4.calls.length === 0, '30. the arbitrary txid never reaches the confirmation source');
    }
    console.log('✓ Section C: the coordinator refuses to observe unless its caller proves the txid came from a real BROADCASTED outcome — caller-contract violations throw before the injected observer is ever consulted, and an arbitrary displayed txid is never accepted');

    // ---------------------------------------------------------------
    // Section D — constructing the coordinator without a real observer
    // throws.
    // ---------------------------------------------------------------
    {
        expectThrows(() => new BitcoinAnchorConfirmationCoordinator({}), '31. constructing the coordinator without a real observer throws');
        expectThrows(() => new BitcoinAnchorConfirmationCoordinator({ bitcoinAnchorConfirmationObserver: {} }), '32. constructing the coordinator with an observer-shaped object lacking observeConfirmation() throws');
    }
    console.log('✓ Section D: constructing the coordinator without a real BitcoinAnchorConfirmationObserver throws');

    // ---------------------------------------------------------------
    // Section E — confirmation observation and OP_RETURN content-proof
    // verification stay fully independent: all four combinations are
    // legitimate, and neither history is ever merged with the other.
    // ---------------------------------------------------------------
    {
        const { broadcastOutcome } = await buildRealBroadcastedTransaction();
        const anchor = { publicationId: 'pub-1', id: 'anchor-1', contentHash: 'deadbeef', anchorType: 'bitcoin-op-return', proof: { txid: broadcastOutcome.txid } };

        async function reconcileWith(confirmed, proofValid) {
            const source = scriptedConfirmationSource(broadcastOutcome.txid, [
                confirmed
                    ? { found: true, confirmed: true, blockHash: 'd'.repeat(64), blockHeight: 900001, confirmationCount: 3 }
                    : { found: true, confirmed: false }
            ]);
            const observer = new BitcoinAnchorConfirmationObserver({ confirmationSource: source });
            const proofVerifier = { async verify() { return proofValid ? { valid: true } : { valid: false, reason: 'content hash mismatch' }; } };
            const view = new BitcoinAnchorProofReconciliationView({ bitcoinAnchorConfirmationObserver: observer, bitcoinProofVerifier: proofVerifier });
            return view.reconcile(anchor);
        }

        const confirmedAndMatch = await reconcileWith(true, true);
        assert(confirmedAndMatch.transaction.confirmation.state === BitcoinAnchorConfirmationState.CONFIRMED
            && confirmedAndMatch.contentProof.state === BitcoinAnchorContentProofState.HASH_MATCH,
            '33. CONFIRMED + HASH_MATCH is a legitimate, real combination');

        const confirmedAndMismatch = await reconcileWith(true, false);
        assert(confirmedAndMismatch.transaction.confirmation.state === BitcoinAnchorConfirmationState.CONFIRMED
            && confirmedAndMismatch.contentProof.state === BitcoinAnchorContentProofState.HASH_MISMATCH,
            '34. CONFIRMED + HASH_MISMATCH is ALSO a legitimate combination — CONFIRMED never implies HASH_MATCH');

        const notConfirmedAndMatch = await reconcileWith(false, true);
        assert(notConfirmedAndMatch.transaction.confirmation.state === BitcoinAnchorConfirmationState.NOT_CONFIRMED
            && notConfirmedAndMatch.contentProof.state === BitcoinAnchorContentProofState.HASH_MATCH,
            '35. NOT_CONFIRMED + HASH_MATCH is a legitimate combination — content proof does not require confirmation');

        const notConfirmedAndMismatch = await reconcileWith(false, false);
        assert(notConfirmedAndMismatch.transaction.confirmation.state === BitcoinAnchorConfirmationState.NOT_CONFIRMED
            && notConfirmedAndMismatch.contentProof.state === BitcoinAnchorContentProofState.HASH_MISMATCH,
            '36. NOT_CONFIRMED + HASH_MISMATCH is ALSO a legitimate, honestly reported combination');

        // Confirmation history (this milestone) and content-proof
        // verification are never merged into a shared array or a shared
        // record — appending a confirmation observation never produces or
        // requires any contentProof-shaped field.
        let confirmationHistory = [];
        confirmationHistory = appendBitcoinAnchorConfirmationObservationHistoryEntry(confirmationHistory, confirmedAndMatch.transaction.confirmation);
        for (const forbiddenKey of ['contentProof', 'valid', 'hashMatch']) {
            assert(!(forbiddenKey in confirmationHistory[0]), `37. a confirmation history entry never carries a "${forbiddenKey}" field — the two histories are never merged`);
        }
    }
    console.log('✓ Section E: confirmation observation and OP_RETURN content-proof verification stay fully independent — all four CONFIRMED/NOT_CONFIRMED × HASH_MATCH/HASH_MISMATCH combinations are legitimate, and neither history is ever merged with the other');

    // ---------------------------------------------------------------
    // Section F — BROADCASTED never implies CONFIRMED, and a confirmation
    // outcome never carries a content-proof-shaped field.
    // ---------------------------------------------------------------
    {
        const { broadcastOutcome } = await buildRealBroadcastedTransaction();
        for (const forbiddenKey of ['confirmed', 'confirmations', 'blockHeight', 'blockHash', 'confirmationCount']) {
            assert(!(forbiddenKey in broadcastOutcome), `38. a BROADCASTED outcome never carries a "${forbiddenKey}" field — BROADCASTED is never CONFIRMED`);
        }

        const source = scriptedConfirmationSource(broadcastOutcome.txid, [{ found: true, confirmed: true, blockHash: 'e'.repeat(64), blockHeight: 900002, confirmationCount: 2 }]);
        const coordinator = new BitcoinAnchorConfirmationCoordinator({ bitcoinAnchorConfirmationObserver: new BitcoinAnchorConfirmationObserver({ confirmationSource: source }) });
        const confirmation = await coordinator.observeConfirmation({ broadcasted: true, txid: broadcastOutcome.txid });
        for (const forbiddenKey of ['contentProof', 'valid', 'hashMatch', 'broadcasted']) {
            assert(!(forbiddenKey in confirmation), `39. a confirmation observation never carries a "${forbiddenKey}" field of its own`);
        }

        const serialized = JSON.stringify(confirmation).toLowerCase();
        for (const forbidden of ['safe', 'secure', 'trusted', 'recommended', 'confidence', 'score', 'healthy', 'valid']) {
            assert(!serialized.includes(forbidden), `40. a confirmation observation never carries "${forbidden}" — it reports a fact, never a verdict`);
        }
    }
    console.log('✓ Section F: BROADCASTED never implies CONFIRMED, and a confirmation observation never carries a content-proof-shaped field or a verdict word');

    console.log('\nAll BitcoinAnchorConfirmationUX tests passed.');
}

run().catch((error) => {
    console.error('BitcoinAnchorConfirmationUX.test.js FAILED:', error);
    process.exitCode = 1;
});
