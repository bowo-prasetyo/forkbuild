import { BitcoinWalletFundingObserver } from '../anchoring/BitcoinWalletFundingObserver.js';
import { BitcoinAnchorTransactionBuilder } from '../anchoring/BitcoinAnchorTransactionBuilder.js';
import { BitcoinAnchorPsbtBuilder } from '../anchoring/BitcoinAnchorPsbtBuilder.js';
import { BitcoinAnchorSignedPsbtFinalizer } from '../anchoring/BitcoinAnchorSignedPsbtFinalizer.js';
import { BitcoinWalletConnection } from '../anchoring/BitcoinWalletConnection.js';
import { BitcoinInjectedProviderWalletAdapter } from '../anchoring/BitcoinInjectedProviderWalletAdapter.js';
import { BitcoinAnchorFundingObservationState } from '../application/BitcoinAnchorFundingObservationState.js';
import { BitcoinAnchorTransactionConstructionCoordinator } from '../application/BitcoinAnchorTransactionConstructionCoordinator.js';
import { BitcoinAnchorTransactionConstructionState } from '../application/BitcoinAnchorTransactionConstructionState.js';
import { BitcoinAnchorTransactionReviewCoordinator } from '../application/BitcoinAnchorTransactionReviewCoordinator.js';
import { BitcoinAnchorReviewedSigningCoordinator } from '../application/BitcoinAnchorReviewedSigningCoordinator.js';
import { BitcoinAnchorReviewedSigningState } from '../application/BitcoinAnchorReviewedSigningState.js';
import { BitcoinAnchorSignedPsbtFinalizationCoordinator } from '../application/BitcoinAnchorSignedPsbtFinalizationCoordinator.js';
import { BitcoinAnchorSignedPsbtFinalizationState, isValidBitcoinAnchorSignedPsbtFinalizationState } from '../application/BitcoinAnchorSignedPsbtFinalizationState.js';
import { describeBitcoinAnchorSignedPsbtFinalization } from '../application/BitcoinAnchorSignedPsbtFinalizationView.js';

// 0.8.63 — Explicit Signed PSBT Verification & Transaction Finalization UI.
//
// The flagship this milestone exists to prove: the full pipeline this
// codebase has built since 0.8.47, taken one step further than application/
// BitcoinAnchorReviewedSigningCoordinator.js (0.8.62) ever took it —
//
//   observe funding (0.8.60) -> construct (0.8.61) -> review (0.8.62)
//     -> connect a wallet (0.8.58) -> "Sign Reviewed Transaction" (0.8.62)
//     -> a genuinely, cryptographically SIGNED (but not yet verified) PSBT
//     -> explicit "Verify & Finalize Transaction"
//     -> BitcoinAnchorSignedPsbtFinalizationCoordinator (THIS MILESTONE — new)
//     -> anchoring/BitcoinAnchorSignedPsbtFinalizer.js#finalize()  (0.8.51,
//        UNCHANGED)
//     -> real, broadcastable transaction bytes — and NOTHING beyond that
//
//   Section A: FLAGSHIP — the complete, real pipeline: a real, OBSERVED
//              funding observation constructs into a plan, bridges into a
//              signable PSBT description, a fake UniSat-shaped wallet
//              genuinely, cryptographically signs exactly the reviewed
//              bytes, and the new finalization coordinator independently
//              verifies that signature and produces real transaction bytes
//              — FINALIZED, with a real txid.
//   Section B: a signature by the WRONG key (well-formed, but without
//              authority over the script being spent) is INVALID_SIGNATURE.
//   Section C: a signed PSBT for a transaction that no longer matches what
//              was signed is refused, before any cryptography is ever
//              attempted — FAILED, never INVALID_SIGNATURE.
//   Section D: a cryptographically valid signature over the WRONG sighash
//              (the right key, the wrong message) is INVALID_SIGNATURE.
//   Section E: an unsupported script type (p2tr) is refused explicitly —
//              FAILED, naming the unsupported type, never INVALID_SIGNATURE
//              (no cryptography was ever attempted for it).
//   Section F: multi-input — every input verifies independently; a
//              fully-correct multi-input PSBT is FINALIZED with one
//              verified entry per input, and a single bad input among
//              several otherwise-correct ones is still caught.
//   Section G: the finalized transaction bytes contain exactly the
//              reviewed transaction's own inputs and outputs — nothing
//              substituted, nothing dropped, nothing added.
//   Section H: FINALIZED never itself broadcasts anything — no network
//              call of any kind happens inside finalize().
//   Section I: caller-contract violations throw before the finalizer is
//              ever consulted, and constructing the coordinator without a
//              real finalizer throws.
//   Section J: the state vocabulary and view carry no verdict beyond the
//              one real cryptographic fact this boundary checks, and no
//              undocumented state.
//
// See docs/Principles.md, "Cryptographic Failure Terminates This Signing
// Attempt (0.8.63)."

function assert(condition, message) {
    if (!condition) throw new Error(`ASSERT FAILED: ${message}`);
}

function expectThrows(fn, message) {
    let threw = false;
    try { fn(); } catch (_e) { threw = true; }
    assert(threw, message);
}

// ---------------------------------------------------------------------
// A wholly independent bech32 ENCODER — duplicated, not imported, from
// tests/BitcoinAnchorReviewedSigningUX.test.js (0.8.62), used here to
// build Alice's own real address from her own real hash160 pubkey.
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
// duplicated, not imported, from anchoring/BitcoinAnchorSignedPsbtFinalizer.js
// and from every other Bitcoin test file in this codebase, the identical
// self-containment discipline each one already holds.
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
    return bytesToHex(concatBytes([derEncodeSignature(r, s), Uint8Array.from([1])]));
}

// ---------------------------------------------------------------------
// A wholly independent, hand-rolled signed-PSBT encoder — duplicated, not
// imported, from tests/BitcoinAnchorPsbtFinalization.test.js.
// ---------------------------------------------------------------------

function u32le(n) { return [n & 0xff, (n >>> 8) & 0xff, (n >>> 16) & 0xff, (n >>> 24) & 0xff].map((b) => b.toString(16).padStart(2, '0')).join(''); }
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
function kv(keyHex, valueHex) { return compactSizeHex(keyHex.length / 2) + keyHex + compactSizeHex(valueHex.length / 2) + valueHex; }
function encodeUnsignedTxHex(tx) {
    const inputsHex = tx.inputs.map((input) => reverseHex(input.txid) + u32le(input.vout) + compactSizeHex(0) + u32le(input.sequence)).join('');
    const outputsHex = tx.outputs.map((output) => u64le(output.valueSats) + compactSizeHex(output.scriptPubKey.length / 2) + output.scriptPubKey).join('');
    return u32le(tx.version) + compactSizeHex(tx.inputs.length) + inputsHex + compactSizeHex(tx.outputs.length) + outputsHex + u32le(tx.locktime);
}
function buildSignedPsbtHex(description, { tx, inputExtras = [] } = {}) {
    const unsignedTx = tx || description.globalUnsignedTx;
    let out = '70736274ff';
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

async function run() {
    const keyA = realKey(0x1a2b3c4d5e6f7890a1b2c3d4e5f60718293a4b5c6d7e8f90112233445566778n);
    const keyB = realKey(0x2222222222222222222222222222222222222222222222222222222222221n);
    const keyC = realKey(0x3333333333333333333333333333333333333333333333333333333333331n);
    const aliceAddress = encodeSegwitAddress('bc', 0, keyA.hash160Bytes);
    const nonce1 = 0x9f8e7d6c5b4a39281706f5e4d3c2b1a0918273645362718293a4b5c6d7e8f90n;
    const nonce2 = 0x9999999999999999999999999999999999999999999999999999999999992n;
    const nonce3 = 0x9999999999999999999999999999999999999999999999999999999999993n;

    const txid = (byte) => byte.toString(16).padStart(2, '0').repeat(32);

    function freshFinalizationCoordinator() {
        return new BitcoinAnchorSignedPsbtFinalizationCoordinator({ bitcoinAnchorSignedPsbtFinalizer: new BitcoinAnchorSignedPsbtFinalizer() });
    }

    function buildDescription({ key = keyA, contentHash = 'deadbeef' } = {}) {
        const transactionBuilder = new BitcoinAnchorTransactionBuilder({ network: 'mainnet', feeRateSatsPerVByte: 1 });
        const psbtBuilder = new BitcoinAnchorPsbtBuilder();
        const plan = transactionBuilder.build({ contentHash, utxos: [utxo('a', 0, 100000, 'p2wpkh')], changeAddress: 'bc1qexamplechangeaddress' });
        return psbtBuilder.build({
            plan,
            utxoDetails: [{ txid: plan.inputs[0].txid, vout: 0, scriptPubKey: '0014' + bytesToHex(key.hash160Bytes), valueSats: 100000 }],
            changeScriptPubKey: '0014' + 'b'.repeat(40)
        });
    }

    // ---------------------------------------------------------------
    // Section A — FLAGSHIP: the full, real pipeline, byte-identical
    // throughout, ending in a real, cryptographically FINALIZED
    // transaction.
    // ---------------------------------------------------------------
    {
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
        assert(reviewOutcome.reviewable === true, '1. a real, native-segwit funding observation bridges into a reviewable PSBT description');

        const signedHex = buildSignedPsbtHex(reviewOutcome.description, {
            inputExtras: [[finalScriptWitnessKv(signRealInput(reviewOutcome.description, 0, keyA, nonce1), keyA.pubkeyHex)]]
        });
        const calls = [];
        const provider = new BitcoinInjectedProviderWalletAdapter({ injectedProvider: fakeUnisatProvider({ account: aliceAddress, onSignPsbt: () => signedHex, calls }) });
        const connection = new BitcoinWalletConnection({ provider });
        const connectResult = await connection.connect();
        assert(connectResult.connected === true, '2. Alice connects her wallet');

        const signingCoordinator = new BitcoinAnchorReviewedSigningCoordinator();
        const signOutcome = await signingCoordinator.sign({
            wallet: connection.wallet, description: reviewOutcome.description, reviewedUnsignedPsbtHex: reviewOutcome.review.unsignedPsbtHex
        });
        assert(signOutcome.state === BitcoinAnchorReviewedSigningState.SIGNED, '3. the wallet genuinely, cryptographically signs the exact PSBT that was reviewed');
        assert(calls.length === 1, '4. the wallet was consulted exactly once');

        // 5-9. THIS MILESTONE: verify & finalize exactly the wallet's own
        // SIGNED (not yet verified) result.
        const finalizationCoordinator = freshFinalizationCoordinator();
        const finalizeOutcome = finalizationCoordinator.finalize({ description: reviewOutcome.description, signedPsbt: signOutcome.psbt });
        assert(finalizeOutcome.state === BitcoinAnchorSignedPsbtFinalizationState.FINALIZED, '5. a genuinely signed PSBT, produced by the real end-to-end pipeline, cryptographically finalizes');
        assert(finalizeOutcome.finalized === true, '6. the outcome reports finalized: true');
        assert(/^[0-9a-f]{64}$/.test(finalizeOutcome.txid), '7. a real 32-byte txid (as hex) is produced');
        assert(finalizeOutcome.rawTransaction.hex.startsWith('02000000000101'), '8. the raw transaction begins with version 2, segwit marker, and flag');
        assert(finalizeOutcome.verifiedInputCount === 1, '9. exactly one input was independently, cryptographically verified');

        const view = describeBitcoinAnchorSignedPsbtFinalization(finalizeOutcome);
        assert(view.state === BitcoinAnchorSignedPsbtFinalizationState.FINALIZED, '10. the view reports the coordinator\'s own FINALIZED state');
        assert(view.txid === finalizeOutcome.txid, '11. the view exposes the real txid');
        assert(view.rawTransactionHex === finalizeOutcome.rawTransaction.hex, '12. the view exposes the real raw transaction hex');
    }
    console.log('✓ Section A (FLAGSHIP): observe -> construct -> review -> connect -> sign -> verify & finalize, byte-identical throughout, into a real FINALIZED transaction');

    // ---------------------------------------------------------------
    // Section B — a signature by the WRONG key (well-formed, but without
    // authority over the script being spent) is INVALID_SIGNATURE.
    // ---------------------------------------------------------------
    {
        const description = buildDescription({ key: keyA });
        const sighash = computeP2wpkhSighash(description.globalUnsignedTx, 0, keyA.hash160Bytes, 100000);
        const { r, s } = ecdsaSign(keyB.privateKey, sighash, nonce2); // keyB genuinely signs the real sighash — wrong key for this script
        const sigHex = bytesToHex(concatBytes([derEncodeSignature(r, s), Uint8Array.from([1])]));
        const signedHex = buildSignedPsbtHex(description, { inputExtras: [[finalScriptWitnessKv(sigHex, keyB.pubkeyHex)]] });

        const outcome = freshFinalizationCoordinator().finalize({ description, signedPsbt: signedHex });
        assert(outcome.state === BitcoinAnchorSignedPsbtFinalizationState.INVALID_SIGNATURE, '13. a well-formed signature by a key without authority over the script is INVALID_SIGNATURE');
        assert(outcome.finalized === false && outcome.txid === null && outcome.rawTransaction === null, '14. no txid or transaction bytes are ever produced for an invalid signature');
        assert(/does not correspond to the P2WPKH script/.test(outcome.reason), '15. the reason names the spendability mismatch specifically');
    }
    console.log('✓ Section B: a signature by the wrong key is INVALID_SIGNATURE, with no txid or transaction bytes ever produced');

    // ---------------------------------------------------------------
    // Section C — a signed PSBT for a transaction that no longer matches
    // what was signed is refused BEFORE any cryptography is attempted —
    // FAILED, never INVALID_SIGNATURE.
    // ---------------------------------------------------------------
    {
        const description = buildDescription({ key: keyA });
        const tamperedTx = { ...description.globalUnsignedTx, outputs: description.globalUnsignedTx.outputs.map((output, i) => i === 1 ? { ...output, valueSats: output.valueSats + 1 } : output) };
        const sigHex = signRealInput(description, 0, keyA, nonce1);
        const tamperedHex = buildSignedPsbtHex(description, { tx: tamperedTx, inputExtras: [[finalScriptWitnessKv(sigHex, keyA.pubkeyHex)]] });

        const outcome = freshFinalizationCoordinator().finalize({ description, signedPsbt: tamperedHex });
        assert(outcome.state === BitcoinAnchorSignedPsbtFinalizationState.FAILED, '16. a signed PSBT substituted for a different transaction is FAILED, not INVALID_SIGNATURE — no signature was ever actually checked');
        assert(/transaction identity changed/.test(outcome.reason), '17. the reason is the exact structural-integrity reason the unchanged 0.8.50 inspector itself gives');
    }
    console.log('✓ Section C: a transaction substituted after signing is rejected before finalization is ever attempted — FAILED, not INVALID_SIGNATURE');

    // ---------------------------------------------------------------
    // Section D — a cryptographically valid signature over the WRONG
    // sighash (the right key, the wrong message) is INVALID_SIGNATURE.
    // ---------------------------------------------------------------
    {
        const description = buildDescription({ key: keyA });
        const wrongHash = new Uint8Array(32).fill(0x42); // a real signature, but over the wrong message entirely
        const { r, s } = ecdsaSign(keyA.privateKey, wrongHash, nonce1);
        const sigHex = bytesToHex(concatBytes([derEncodeSignature(r, s), Uint8Array.from([1])]));
        const signedHex = buildSignedPsbtHex(description, { inputExtras: [[finalScriptWitnessKv(sigHex, keyA.pubkeyHex)]] });

        const outcome = freshFinalizationCoordinator().finalize({ description, signedPsbt: signedHex });
        assert(outcome.state === BitcoinAnchorSignedPsbtFinalizationState.INVALID_SIGNATURE, '18. a valid signature over the wrong sighash is INVALID_SIGNATURE');
        assert(/does not cryptographically verify/.test(outcome.reason), '19. the reason names cryptographic verification failing');
    }
    console.log('✓ Section D: a cryptographically valid signature over the wrong sighash is INVALID_SIGNATURE');

    // ---------------------------------------------------------------
    // Section E — an unsupported script type (p2tr) is refused
    // explicitly — FAILED, never INVALID_SIGNATURE, because no
    // cryptography was ever attempted for it.
    // ---------------------------------------------------------------
    {
        const transactionBuilder = new BitcoinAnchorTransactionBuilder({ network: 'mainnet', feeRateSatsPerVByte: 1 });
        const psbtBuilder = new BitcoinAnchorPsbtBuilder();
        const plan = transactionBuilder.build({ contentHash: 'deadbeef', utxos: [utxo('a', 0, 100000, 'p2tr')], changeAddress: 'bc1pexample' });
        const description = psbtBuilder.build({
            plan, utxoDetails: [{ txid: plan.inputs[0].txid, vout: 0, scriptPubKey: '5120' + 'c'.repeat(64), valueSats: 100000 }],
            changeScriptPubKey: '0014' + 'b'.repeat(40)
        });
        const signedHex = buildSignedPsbtHex(description, { inputExtras: [[finalScriptWitnessKv('aa'.repeat(64), keyA.pubkeyHex)]] });

        const outcome = freshFinalizationCoordinator().finalize({ description, signedPsbt: signedHex });
        assert(outcome.state === BitcoinAnchorSignedPsbtFinalizationState.FAILED, '20. an unsupported script type (p2tr) is FAILED, never INVALID_SIGNATURE');
        assert(/p2tr/.test(outcome.reason) && /does not yet cryptographically finalize/.test(outcome.reason), '21. the reason names p2tr as not yet supported, explicitly');
    }
    console.log('✓ Section E: an unsupported script type is refused explicitly — FAILED, never INVALID_SIGNATURE');

    // ---------------------------------------------------------------
    // Section F — multi-input: every input verifies independently.
    // ---------------------------------------------------------------
    {
        const transactionBuilder = new BitcoinAnchorTransactionBuilder({ network: 'mainnet', feeRateSatsPerVByte: 1 });
        const psbtBuilder = new BitcoinAnchorPsbtBuilder();
        const bigContentHash = 'f'.repeat(64); // forces more than one input to be selected
        const plan = transactionBuilder.build({
            contentHash: bigContentHash,
            utxos: [utxo('2', 0, 100, 'p2wpkh'), utxo('1', 0, 100, 'p2wpkh'), utxo('3', 0, 50, 'p2wpkh')],
            changeAddress: 'bc1qchange'
        });
        assert(plan.inputs.length >= 2, 'sanity: more than one input is selected');
        const keys = [keyA, keyB, keyC];
        const utxoDetails = plan.inputs.map((input, i) => ({ txid: input.txid, vout: input.vout, scriptPubKey: '0014' + bytesToHex(keys[i].hash160Bytes), valueSats: input.valueSats }));
        const description = psbtBuilder.build({ plan, utxoDetails, changeScriptPubKey: plan.outputs.length > 1 ? '0014' + 'b'.repeat(40) : undefined });
        const nonces = [nonce1, nonce2, nonce3];
        const sigs = description.inputs.map((_, i) => signRealInput(description, i, keys[i], nonces[i]));

        // A fully-correct multi-input finalizes cleanly, with one verified
        // entry per input.
        const goodHex = buildSignedPsbtHex(description, { inputExtras: description.inputs.map((_, i) => [finalScriptWitnessKv(sigs[i], keys[i].pubkeyHex)]) });
        const goodOutcome = freshFinalizationCoordinator().finalize({ description, signedPsbt: goodHex });
        assert(goodOutcome.state === BitcoinAnchorSignedPsbtFinalizationState.FINALIZED, '22. a fully-correct multi-input PSBT is FINALIZED');
        assert(goodOutcome.verifiedInputCount === description.inputs.length, '23. every input is independently verified, one entry each');

        // Tampering with just ONE of several otherwise correctly-signed
        // inputs is still caught, and named by index.
        const badSig = signRealInput(description, 1, keys[0], nonce2); // wrong key for input 1
        const extras = description.inputs.map((_, i) => i === 1 ? [finalScriptWitnessKv(badSig, keys[0].pubkeyHex)] : [finalScriptWitnessKv(sigs[i], keys[i].pubkeyHex)]);
        const tamperedHex = buildSignedPsbtHex(description, { inputExtras: extras });
        const badOutcome = freshFinalizationCoordinator().finalize({ description, signedPsbt: tamperedHex });
        assert(badOutcome.state === BitcoinAnchorSignedPsbtFinalizationState.INVALID_SIGNATURE, '24. a single bad input among several otherwise-correct ones is still caught as INVALID_SIGNATURE');
        assert(/^input 1:/.test(badOutcome.reason), '25. the reason names the invalid input by index');
    }
    console.log('✓ Section F: multi-input — every input verifies independently; one bad input among several otherwise-correct ones is still caught');

    // ---------------------------------------------------------------
    // Section G — the finalized transaction bytes contain exactly the
    // reviewed transaction's own inputs and outputs.
    // ---------------------------------------------------------------
    {
        const description = buildDescription({ key: keyA, contentHash: 'cafebabe' });
        const signedHex = buildSignedPsbtHex(description, { inputExtras: [[finalScriptWitnessKv(signRealInput(description, 0, keyA, nonce1), keyA.pubkeyHex)]] });
        const outcome = freshFinalizationCoordinator().finalize({ description, signedPsbt: signedHex });
        assert(outcome.state === BitcoinAnchorSignedPsbtFinalizationState.FINALIZED, 'sanity: this description finalizes');

        const hex = outcome.rawTransaction.hex;
        description.globalUnsignedTx.inputs.forEach((input, i) => {
            assert(hex.includes(reverseHex(input.txid)), `26. finalized bytes contain input ${i}'s own outpoint txid, exactly as reviewed`);
        });
        description.globalUnsignedTx.outputs.forEach((output, i) => {
            assert(hex.includes(output.scriptPubKey), `27. finalized bytes contain output ${i}'s own scriptPubKey, exactly as reviewed — never substituted`);
            assert(hex.includes(u64le(output.valueSats)), `28. finalized bytes contain output ${i}'s own value, exactly as reviewed`);
        });
        assert(outcome.rawTransaction.bytes instanceof Uint8Array, '29. rawTransaction.bytes is a real Uint8Array, not merely a hex string');
    }
    console.log('✓ Section G: the finalized transaction bytes contain exactly the reviewed transaction\'s own inputs and outputs');

    // ---------------------------------------------------------------
    // Section H — FINALIZED never itself broadcasts anything: no network
    // call of any kind happens inside finalize().
    // ---------------------------------------------------------------
    {
        const description = buildDescription({ key: keyA, contentHash: 'ba5eba11' });
        const signedHex = buildSignedPsbtHex(description, { inputExtras: [[finalScriptWitnessKv(signRealInput(description, 0, keyA, nonce1), keyA.pubkeyHex)]] });

        const originalFetch = globalThis.fetch;
        let networkCallAttempted = false;
        globalThis.fetch = async (...args) => { networkCallAttempted = true; throw new Error(`unexpected network call: ${JSON.stringify(args)}`); };
        let outcome;
        try {
            outcome = freshFinalizationCoordinator().finalize({ description, signedPsbt: signedHex });
        } finally {
            globalThis.fetch = originalFetch;
        }
        assert(outcome.state === BitcoinAnchorSignedPsbtFinalizationState.FINALIZED, '30. finalization succeeds with no network access available at all');
        assert(networkCallAttempted === false, '31. finalize() never attempts a network call — FINALIZED is not a broadcast');
        assert(!('broadcast' in outcome) && !('broadcasted' in outcome), '32. the outcome carries no broadcast-shaped field of any kind');
    }
    console.log('✓ Section H: FINALIZED never itself broadcasts anything — no network call happens inside finalize()');

    // ---------------------------------------------------------------
    // Section I — caller-contract violations throw before the finalizer
    // is ever consulted, and constructing the coordinator without a real
    // finalizer throws.
    // ---------------------------------------------------------------
    {
        expectThrows(() => new BitcoinAnchorSignedPsbtFinalizationCoordinator({}), '33. constructing the coordinator without a real finalizer throws');
        expectThrows(() => new BitcoinAnchorSignedPsbtFinalizationCoordinator({ bitcoinAnchorSignedPsbtFinalizer: {} }), '34. constructing the coordinator with a finalizer-shaped object lacking finalize() throws');

        const coordinator = freshFinalizationCoordinator();
        const description = buildDescription({ key: keyA });
        expectThrows(() => coordinator.finalize({ signedPsbt: 'aa' }), '35. a missing description throws');
        expectThrows(() => coordinator.finalize({ description }), '36. a missing signedPsbt throws');
        expectThrows(() => coordinator.finalize({ description, signedPsbt: null }), '37. a null signedPsbt throws');
        expectThrows(() => coordinator.finalize({ description: null, signedPsbt: 'aa' }), '38. a malformed description throws');
    }
    console.log('✓ Section I: caller-contract violations throw before the finalizer is ever consulted, and a missing finalizer throws at construction');

    // ---------------------------------------------------------------
    // Section J — the state vocabulary and view carry no verdict beyond
    // the one real cryptographic fact this boundary checks, and no
    // undocumented state.
    // ---------------------------------------------------------------
    {
        assert(Object.values(BitcoinAnchorSignedPsbtFinalizationState).length === 6, '39. the finalization state vocabulary carries exactly its six documented values');
        for (const forbiddenState of ['ready', 'safe', 'valid', 'authorized', 'trusted', 'secure', 'recommended']) {
            assert(!Object.values(BitcoinAnchorSignedPsbtFinalizationState).includes(forbiddenState), `40. the finalization state vocabulary never carries a "${forbiddenState}" value`);
        }
        assert(isValidBitcoinAnchorSignedPsbtFinalizationState(BitcoinAnchorSignedPsbtFinalizationState.FINALIZED), '41. isValidBitcoinAnchorSignedPsbtFinalizationState() recognizes a real state value');
        assert(!isValidBitcoinAnchorSignedPsbtFinalizationState('authorized'), '42. isValidBitcoinAnchorSignedPsbtFinalizationState() rejects a value outside the vocabulary');

        const idleView = describeBitcoinAnchorSignedPsbtFinalization(null);
        assert(idleView.state === BitcoinAnchorSignedPsbtFinalizationState.IDLE, '43. describeBitcoinAnchorSignedPsbtFinalization(null) reports IDLE — the state before any finalization attempt has ever been made');
        assert(Object.isFrozen(idleView), '44. the view result is frozen');
        assert(idleView.txid === null && idleView.rawTransactionHex === null && idleView.verifiedInputCount === null, '45. an IDLE view carries no leftover fact from any previous attempt');

        // "verified" and "finalized" are deliberately NOT forbidden here —
        // unlike application/BitcoinAnchorReviewedSigningView.js one stage
        // earlier, THIS view's entire reason for existing is the boundary
        // that actually performs cryptographic verification, so its own
        // state vocabulary naming that fact is honest, not a verdict. Only
        // a BROADER security judgment stays forbidden.
        const serialized = JSON.stringify(idleView).toLowerCase();
        for (const forbidden of ['safe', 'secure', 'trusted', 'recommended', 'confidence', 'score']) {
            assert(!serialized.includes(forbidden), `46. the view never carries "${forbidden}" — a finalization attempt's own cryptographic fact is never promoted to a broader security verdict`);
        }
    }
    console.log('✓ Section J: the finalization state vocabulary and view carry no verdict beyond the one real cryptographic fact this boundary checks');

    console.log('\nAll BitcoinAnchorSignedPsbtFinalizationUX tests passed.');
}

run().catch((error) => {
    console.error('BitcoinAnchorSignedPsbtFinalizationUX.test.js FAILED:', error);
    process.exitCode = 1;
});
