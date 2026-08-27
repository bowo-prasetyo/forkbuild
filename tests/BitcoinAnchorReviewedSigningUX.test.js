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
import { BitcoinAnchorReviewedSigningState, isValidBitcoinAnchorReviewedSigningState } from '../application/BitcoinAnchorReviewedSigningState.js';
import { describeBitcoinAnchorReviewedSigning } from '../application/BitcoinAnchorReviewedSigningView.js';

// 0.8.62 — Explicit Reviewed Bitcoin Anchor Signing UI.
//
// The flagship this milestone exists to prove: the exact sequence a real
// person would experience on screen, end to end, through every trust
// boundary this codebase has built since 0.8.47 —
//
//   observe funding (0.8.60) -> explicit "Create Transaction Plan"
//     -> BitcoinAnchorTransactionConstructionCoordinator (0.8.61, unchanged)
//     -> explicit review bridge -> BitcoinAnchorTransactionReviewCoordinator
//        (THIS MILESTONE — new: the address-decoding wiring 0.8.61's own
//        "Deliberately excluded" list named directly)
//     -> a person reviews real facts -> connect a wallet (0.8.58, unchanged)
//     -> explicit "Sign Reviewed Transaction"
//     -> BitcoinAnchorReviewedSigningCoordinator (THIS MILESTONE — new)
//     -> anchoring/BitcoinAnchorReviewedPsbtSigner.js (0.8.59, unchanged)
//     -> a genuinely, cryptographically signed PSBT
//     -> finalized (0.8.51, unchanged)
//
//   Section A: FLAGSHIP — a real, OBSERVED funding observation for a real
//              bech32 P2WPKH address constructs, through the unchanged
//              0.8.47/0.8.61 pipeline, into a plan; the new review bridge
//              derives that account's own real scriptPubKey (never
//              caller-supplied) and produces a real, signable PSBT
//              description; a fake UniSat-shaped wallet genuinely,
//              cryptographically signs EXACTLY the reviewed bytes; the
//              signing coordinator reports SIGNED; the result finalizes
//              into real transaction bytes.
//   Section B: a transaction that no longer matches what was reviewed is
//              refused — DECLINED — and the wallet is NEVER consulted.
//   Section C: a wallet's definite decline reaches this coordinator as
//              DECLINED.
//   Section D: a wallet that cannot presently tell reaches this coordinator
//              as UNAVAILABLE.
//   Section E: a wallet claiming success while returning no PSBT at all is
//              refused as FAILED, never crashing the page.
//   Section F: no wallet connected at all is UNAVAILABLE, and the wallet is
//              never consulted.
//   Section G: a wallet that signs a genuinely different transaction than
//              it was asked to is still caught by the unchanged 0.8.50
//              inspection boundary, surfacing here as DECLINED.
//   Section H: the review bridge reports an honest, non-throwing
//              `reviewable: false` for an account this codebase cannot yet
//              decode a scriptPubKey for (an unsupported script type, or a
//              real bech32 string that fails checksum) — and throws only
//              for a genuine caller-contract violation.
//   Section I: caller-contract violations on the signing coordinator itself
//              throw before any wallet is ever consulted.
//   Section J: the state vocabulary and view carry no verdict, and no
//              fifth/sixth undocumented state.
//
// See docs/Principles.md, "Review Is An Authorization Boundary; Signing Is
// An External Capability Invocation (0.8.62)."

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

// ---------------------------------------------------------------------
// A wholly independent bech32 ENCODER — the identical duplication
// tests/BitcoinSegwitAddressScriptPubKey.test.js already holds toward
// anchoring/BitcoinSegwitAddressScriptPubKey.js's own decoder — used here
// to build Alice's own real address from her own real hash160 pubkey, so
// this flagship's review bridge derives a scriptPubKey that genuinely
// corresponds to the key that later signs.
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
// duplicated, not imported, from tests/BitcoinAnchorTransactionReviewUX.test.js
// (the identical self-containment every anchoring/ test file in this
// codebase already holds).
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
// imported, from tests/BitcoinAnchorTransactionReviewUX.test.js.
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
    const aliceAddress = encodeSegwitAddress('bc', 0, keyA.hash160Bytes);
    const nonce1 = 0x9f8e7d6c5b4a39281706f5e4d3c2b1a0918273645362718293a4b5c6d7e8f90n;
    const nonce2 = 0x9999999999999999999999999999999999999999999999999999999999992n;

    const txid = (byte) => byte.toString(16).padStart(2, '0').repeat(32);

    function freshCoordinators() {
        return {
            builder: new BitcoinAnchorTransactionBuilder({ network: 'mainnet', feeRateSatsPerVByte: 1 }),
            psbtBuilder: new BitcoinAnchorPsbtBuilder(),
            finalizer: new BitcoinAnchorSignedPsbtFinalizer()
        };
    }

    async function observeAndConstruct({ utxos, contentHash = 'deadbeef', publicationId = 'pub-1' }) {
        const { builder } = freshCoordinators();
        const observer = new BitcoinWalletFundingObserver({ fundingSource: fakeFundingSource(utxos) });
        const observation = await observer.observeFunding({ account: aliceAddress, network: 'mainnet' });
        assert(observation.state === BitcoinAnchorFundingObservationState.OBSERVED, 'sanity: a real fundingSource produces a real OBSERVED observation');

        const constructionCoordinator = new BitcoinAnchorTransactionConstructionCoordinator({ bitcoinAnchorTransactionBuilder: builder });
        const constructed = constructionCoordinator.construct({ publicationId, contentHash, fundingObservation: observation });
        assert(constructed.state === BitcoinAnchorTransactionConstructionState.CONSTRUCTED, 'sanity: comfortable funding constructs successfully');
        return constructed;
    }

    function connectAlice(onSignPsbt) {
        const calls = [];
        const provider = new BitcoinInjectedProviderWalletAdapter({
            injectedProvider: fakeUnisatProvider({ account: aliceAddress, onSignPsbt, calls })
        });
        return { connection: new BitcoinWalletConnection({ provider }), calls };
    }

    // A raw fake `wallet` — bypassing anchoring/
    // BitcoinInjectedProviderWalletAdapter.js entirely — used for Sections
    // C/D/E below, which each need to control the EXACT `{ signed,
    // unavailable, reason }` shape anchoring/BitcoinAnchorWalletSigner.js's
    // own header documents. The adapter's own real, documented UniSat API
    // only ever returns a signed hex STRING or throws (both already proven
    // against Section A/B/G's own real, connected wallet) — it has no way
    // to directly express `unavailable: true` or a bare `{ signed: true }`
    // with no `psbt`, so these three sections talk to the ONE layer that
    // actually accepts those shapes directly.
    function rawWallet(signPsbt) {
        const calls = [];
        return { wallet: { async signPsbt(psbt) { calls.push(psbt); return signPsbt(psbt); } }, calls };
    }

    // ---------------------------------------------------------------
    // Section A — FLAGSHIP: full pipeline, byte-identical throughout.
    // ---------------------------------------------------------------
    {
        const { psbtBuilder, finalizer } = freshCoordinators();
        const constructed = await observeAndConstruct({ utxos: [{ txid: txid(0xaa), vout: 0, valueSats: 150000 }] });

        // 1-3. The new review bridge derives Alice's OWN real scriptPubKey
        // from her own real address — never a caller-supplied one — and
        // produces a real, signable PSBT description.
        const reviewCoordinator = new BitcoinAnchorTransactionReviewCoordinator({ bitcoinAnchorPsbtBuilder: psbtBuilder });
        const reviewOutcome = reviewCoordinator.review({ construction: constructed.construction });
        assert(reviewOutcome.reviewable === true, '1. a real, native-segwit funding observation bridges into a reviewable PSBT description');
        assert(reviewOutcome.description.inputs[0].witnessUtxo.scriptPubKey === '0014' + bytesToHex(keyA.hash160Bytes), '2. the bridge derives the EXACT scriptPubKey corresponding to the real key that will sign — never a placeholder');
        assert(reviewOutcome.review.contentHash === 'deadbeef', '3. the review reports the exact content hash being anchored');

        // 4. Connect a wallet — a fake, UniSat-shaped provider standing in
        // for a real browser extension.
        const signedHex = buildSignedPsbtHex(reviewOutcome.description, {
            inputExtras: [[finalScriptWitnessKv(signRealInput(reviewOutcome.description, 0, keyA, nonce1), keyA.pubkeyHex)]]
        });
        const { connection, calls } = connectAlice(() => signedHex);
        const connectResult = await connection.connect();
        assert(connectResult.connected === true, '4. Alice connects her wallet');

        // 5-7. Sign EXACTLY the reviewed PSBT via the new signing
        // coordinator, wrapping the unchanged 0.8.59 review-bound signer.
        const signingCoordinator = new BitcoinAnchorReviewedSigningCoordinator();
        const signOutcome = await signingCoordinator.sign({
            wallet: connection.wallet,
            description: reviewOutcome.description,
            reviewedUnsignedPsbtHex: reviewOutcome.review.unsignedPsbtHex
        });
        assert(signOutcome.state === BitcoinAnchorReviewedSigningState.SIGNED, '5. the wallet genuinely, cryptographically signs the exact PSBT that was reviewed');
        assert(calls.length === 1 && calls[0] === reviewOutcome.review.unsignedPsbtHex, '6. the wallet was asked to sign the exact bytes shown in the review — nothing else');
        assert(signOutcome.signedInputs.length === 1, '7. the wallet\'s claimed signature is independently inspected (0.8.50, unchanged) and found intact');

        // 8. SIGNED is not yet finalized/verified — the view names this
        // honestly.
        const signingView = describeBitcoinAnchorReviewedSigning(signOutcome);
        assert(signingView.state === BitcoinAnchorReviewedSigningState.SIGNED, '8. the view reports the coordinator\'s own SIGNED state');
        assert(!('finalized' in signingView) && !('verified' in signingView) && !('txid' in signingView), '9. the view carries no finalization/verification claim — SIGNED never implies FINALIZED');

        // 10. Finalize — cryptographic verification, unchanged (0.8.51).
        const finalizeResult = finalizer.finalize({ description: reviewOutcome.description, signedPsbt: signOutcome.psbt });
        assert(finalizeResult.finalized === true, '10. the signed PSBT cryptographically finalizes into real, broadcastable transaction bytes');
        assert(/^[0-9a-f]{64}$/.test(finalizeResult.txid), '11. a real txid is produced');
    }
    console.log('✓ Section A (FLAGSHIP): observe -> construct -> bridge to a real PSBT -> review -> connect -> sign exactly what was reviewed -> inspect -> finalize, byte-identical throughout');

    // ---------------------------------------------------------------
    // Section B — a transaction that no longer matches what was reviewed
    // is refused (DECLINED) and the wallet is NEVER consulted.
    // ---------------------------------------------------------------
    {
        const { psbtBuilder } = freshCoordinators();
        const reviewCoordinator = new BitcoinAnchorTransactionReviewCoordinator({ bitcoinAnchorPsbtBuilder: psbtBuilder });

        const reviewedConstruction = await observeAndConstruct({ utxos: [{ txid: txid(0xbb), vout: 0, valueSats: 150000 }], contentHash: 'deadbeef' });
        const reviewedOutcome = reviewCoordinator.review({ construction: reviewedConstruction.construction });

        // A DIFFERENT transaction — a different content hash, never shown
        // to Alice as the one she reviewed.
        const substitutedConstruction = await observeAndConstruct({ utxos: [{ txid: txid(0xbb), vout: 0, valueSats: 150000 }], contentHash: 'facefeed' });
        const substitutedOutcome = reviewCoordinator.review({ construction: substitutedConstruction.construction });

        const { connection, calls } = connectAlice((psbtHex) => psbtHex);
        await connection.connect();

        const signingCoordinator = new BitcoinAnchorReviewedSigningCoordinator();
        const outcome = await signingCoordinator.sign({
            wallet: connection.wallet,
            description: substitutedOutcome.description,
            reviewedUnsignedPsbtHex: reviewedOutcome.review.unsignedPsbtHex
        });
        assert(outcome.state === BitcoinAnchorReviewedSigningState.DECLINED, '12. signing a substituted transaction reaches this coordinator as DECLINED');
        assert(/no longer matches/.test(outcome.reason), '13. the refusal names the mismatch honestly');
        assert(calls.length === 0, '14. the wallet is NEVER consulted at all when the description no longer matches what was reviewed');
    }
    console.log('✓ Section B: a description that no longer matches what was reviewed is DECLINED before the wallet is ever asked, and the wallet is never consulted');

    // ---------------------------------------------------------------
    // Section C — a wallet's definite decline reaches this coordinator as
    // DECLINED.
    // ---------------------------------------------------------------
    {
        const { psbtBuilder } = freshCoordinators();
        const reviewCoordinator = new BitcoinAnchorTransactionReviewCoordinator({ bitcoinAnchorPsbtBuilder: psbtBuilder });
        const constructed = await observeAndConstruct({ utxos: [{ txid: txid(0xcc), vout: 0, valueSats: 150000 }] });
        const reviewOutcome = reviewCoordinator.review({ construction: constructed.construction });

        const { wallet } = rawWallet(() => ({ signed: false, reason: 'user rejected the signing request' }));

        const signingCoordinator = new BitcoinAnchorReviewedSigningCoordinator();
        const outcome = await signingCoordinator.sign({
            wallet, description: reviewOutcome.description, reviewedUnsignedPsbtHex: reviewOutcome.review.unsignedPsbtHex
        });
        assert(outcome.state === BitcoinAnchorReviewedSigningState.DECLINED, '15. a wallet\'s own definite decline reaches this coordinator as DECLINED');
        assert(outcome.reason === 'user rejected the signing request', '16. the wallet\'s own reason is carried through verbatim');
    }
    console.log('✓ Section C: a wallet\'s definite decline reaches the coordinator as DECLINED, with its own reason carried through');

    // ---------------------------------------------------------------
    // Section D — a wallet that cannot presently tell reaches this
    // coordinator as UNAVAILABLE.
    // ---------------------------------------------------------------
    {
        const { psbtBuilder } = freshCoordinators();
        const reviewCoordinator = new BitcoinAnchorTransactionReviewCoordinator({ bitcoinAnchorPsbtBuilder: psbtBuilder });
        const constructed = await observeAndConstruct({ utxos: [{ txid: txid(0xdd), vout: 0, valueSats: 150000 }] });
        const reviewOutcome = reviewCoordinator.review({ construction: constructed.construction });

        const { wallet } = rawWallet(() => { throw new Error('wallet is locked'); });

        const signingCoordinator = new BitcoinAnchorReviewedSigningCoordinator();
        const outcome = await signingCoordinator.sign({
            wallet, description: reviewOutcome.description, reviewedUnsignedPsbtHex: reviewOutcome.review.unsignedPsbtHex
        });
        assert(outcome.state === BitcoinAnchorReviewedSigningState.UNAVAILABLE, '17. a wallet that throws while signing reaches this coordinator as UNAVAILABLE, never DECLINED');
        assert(outcome.reason === 'wallet is locked', '18. the underlying error message is carried through');
    }
    console.log('✓ Section D: a wallet that cannot presently tell reaches the coordinator as UNAVAILABLE, never confused with a decline');

    // ---------------------------------------------------------------
    // Section E — a wallet claiming success while returning no PSBT at
    // all is refused as FAILED, never crashing the page.
    // ---------------------------------------------------------------
    {
        const { psbtBuilder } = freshCoordinators();
        const reviewCoordinator = new BitcoinAnchorTransactionReviewCoordinator({ bitcoinAnchorPsbtBuilder: psbtBuilder });
        const constructed = await observeAndConstruct({ utxos: [{ txid: txid(0xee), vout: 0, valueSats: 150000 }] });
        const reviewOutcome = reviewCoordinator.review({ construction: constructed.construction });

        const { wallet } = rawWallet(() => ({ signed: true })); // no psbt field — a wallet-contract violation

        const signingCoordinator = new BitcoinAnchorReviewedSigningCoordinator();
        const outcome = await signingCoordinator.sign({
            wallet, description: reviewOutcome.description, reviewedUnsignedPsbtHex: reviewOutcome.review.unsignedPsbtHex
        });
        assert(outcome.state === BitcoinAnchorReviewedSigningState.FAILED, '19. a wallet claiming signed: true with no PSBT at all is refused as FAILED, never accepted as a signature');
        assert(typeof outcome.reason === 'string' && outcome.reason.length > 0, '20. the FAILED outcome names why');
    }
    console.log('✓ Section E: a wallet claiming success while returning no PSBT is refused as FAILED, never crashing the page or accepted as signed');

    // ---------------------------------------------------------------
    // Section F — no wallet connected at all is UNAVAILABLE, and the
    // wallet is never consulted (there is none to consult).
    // ---------------------------------------------------------------
    {
        const { psbtBuilder } = freshCoordinators();
        const reviewCoordinator = new BitcoinAnchorTransactionReviewCoordinator({ bitcoinAnchorPsbtBuilder: psbtBuilder });
        const constructed = await observeAndConstruct({ utxos: [{ txid: txid(0xf0), vout: 0, valueSats: 150000 }] });
        const reviewOutcome = reviewCoordinator.review({ construction: constructed.construction });

        const signingCoordinator = new BitcoinAnchorReviewedSigningCoordinator();
        const outcome = await signingCoordinator.sign({
            wallet: null, description: reviewOutcome.description, reviewedUnsignedPsbtHex: reviewOutcome.review.unsignedPsbtHex
        });
        assert(outcome.state === BitcoinAnchorReviewedSigningState.UNAVAILABLE, '21. no wallet connected at all is reported as UNAVAILABLE — a connected wallet is a capability this coordinator never assumes');
        assert(/no wallet is currently connected/.test(outcome.reason), '22. the reason names the missing capability honestly');
    }
    console.log('✓ Section F: no wallet connected at all is UNAVAILABLE, never a throw and never a decline');

    // ---------------------------------------------------------------
    // Section G — a wallet that signs a genuinely DIFFERENT transaction
    // than it was asked to is still caught by the unchanged 0.8.50
    // inspection boundary, surfacing here as DECLINED.
    // ---------------------------------------------------------------
    {
        const { psbtBuilder } = freshCoordinators();
        const reviewCoordinator = new BitcoinAnchorTransactionReviewCoordinator({ bitcoinAnchorPsbtBuilder: psbtBuilder });

        const constructed = await observeAndConstruct({ utxos: [{ txid: txid(0x11), vout: 0, valueSats: 150000 }], contentHash: 'deadbeef' });
        const reviewOutcome = reviewCoordinator.review({ construction: constructed.construction });

        const otherConstructed = await observeAndConstruct({ utxos: [{ txid: txid(0x11), vout: 0, valueSats: 150000 }], contentHash: 'facefeed' });
        const otherOutcome = reviewCoordinator.review({ construction: otherConstructed.construction });
        const deceptiveSignedHex = buildSignedPsbtHex(otherOutcome.description, {
            inputExtras: [[finalScriptWitnessKv(signRealInput(otherOutcome.description, 0, keyA, nonce2), keyA.pubkeyHex)]]
        });

        const { connection } = connectAlice(() => deceptiveSignedHex);
        await connection.connect();

        const signingCoordinator = new BitcoinAnchorReviewedSigningCoordinator();
        const outcome = await signingCoordinator.sign({
            wallet: connection.wallet, description: reviewOutcome.description, reviewedUnsignedPsbtHex: reviewOutcome.review.unsignedPsbtHex
        });
        assert(outcome.state === BitcoinAnchorReviewedSigningState.DECLINED, '23. a wallet signing a genuinely different transaction than asked reaches this coordinator as DECLINED, not SIGNED');
        assert(/does not match the intended transaction/.test(outcome.reason), '24. the refusal is anchoring/BitcoinAnchorSignedPsbtInspector.js\'s own, unchanged reason');
    }
    console.log('✓ Section G: a wallet that signs a genuinely different transaction is still refused by the unchanged 0.8.50 inspection boundary');

    // ---------------------------------------------------------------
    // Section H — the review bridge is honest about what it cannot yet
    // support, and never throws for a real-but-unsupported account.
    // ---------------------------------------------------------------
    {
        const { psbtBuilder } = freshCoordinators();
        const reviewCoordinator = new BitcoinAnchorTransactionReviewCoordinator({ bitcoinAnchorPsbtBuilder: psbtBuilder });

        // A p2tr-shaped account address (bc1p...) — a real, valid funding
        // observation this class cannot yet bridge into a signable PSBT.
        const taprootObserver = new BitcoinWalletFundingObserver({
            fundingSource: fakeFundingSource([{ txid: txid(0x22), vout: 0, valueSats: 100000 }])
        });
        const taprootObservation = await taprootObserver.observeFunding({ account: 'bc1p' + 'a'.repeat(58), network: 'mainnet' });
        assert(taprootObservation.scriptType === 'p2tr', 'sanity: a bc1p... address observes as p2tr');
        const { builder } = freshCoordinators();
        const taprootConstructed = new BitcoinAnchorTransactionConstructionCoordinator({ bitcoinAnchorTransactionBuilder: builder })
            .construct({ publicationId: 'p', contentHash: 'ab', fundingObservation: taprootObservation });
        const taprootReview = reviewCoordinator.review({ construction: taprootConstructed.construction });
        assert(taprootReview.reviewable === false, '25. a p2tr account cannot presently be bridged into a signable PSBT — reported honestly, never guessed at');
        assert(/p2tr/.test(taprootReview.reason), '26. the refusal names the unsupported script type');

        // A real-shaped (bc1q..., 42 chars) address that fails bech32
        // checksum — the identical fixture tests/
        // BitcoinAnchorTransactionConstructionUX.test.js's own ALICE_P2WPKH
        // already uses, proving this bridge degrades gracefully against
        // exactly the kind of fixture already used elsewhere in this
        // codebase's own test suite.
        const uncheckedObserver = new BitcoinWalletFundingObserver({
            fundingSource: fakeFundingSource([{ txid: txid(0x33), vout: 0, valueSats: 100000 }])
        });
        const uncheckedObservation = await uncheckedObserver.observeFunding({ account: 'bc1q' + 'a'.repeat(38), network: 'mainnet' });
        const uncheckedConstructed = new BitcoinAnchorTransactionConstructionCoordinator({ bitcoinAnchorTransactionBuilder: builder })
            .construct({ publicationId: 'p', contentHash: 'ab', fundingObservation: uncheckedObservation });
        const uncheckedReview = reviewCoordinator.review({ construction: uncheckedConstructed.construction });
        assert(uncheckedReview.reviewable === false, '27. an address that fails bech32 checksum verification is refused, never guessed at');
        assert(/checksum/.test(uncheckedReview.reason), '28. the refusal names the checksum failure');

        // Caller-contract violations still throw.
        expectThrows(() => reviewCoordinator.review({ construction: null }), '29. a missing construction throws');
        expectThrows(() => reviewCoordinator.review({ construction: { plan: null, fundingObservation: {} } }), '30. a construction missing its own plan throws');
        expectThrows(() => new BitcoinAnchorTransactionReviewCoordinator({}), '31. constructing the coordinator without a real PSBT builder throws');
    }
    console.log('✓ Section H: the review bridge honestly refuses what it cannot yet support, and throws only for genuine caller-contract violations');

    // ---------------------------------------------------------------
    // Section I — caller-contract violations on the signing coordinator
    // throw before any wallet is ever consulted.
    // ---------------------------------------------------------------
    {
        const { psbtBuilder } = freshCoordinators();
        const reviewCoordinator = new BitcoinAnchorTransactionReviewCoordinator({ bitcoinAnchorPsbtBuilder: psbtBuilder });
        const constructed = await observeAndConstruct({ utxos: [{ txid: txid(0x44), vout: 0, valueSats: 150000 }] });
        const reviewOutcome = reviewCoordinator.review({ construction: constructed.construction });

        const { connection, calls } = connectAlice((h) => h);
        await connection.connect();
        const signingCoordinator = new BitcoinAnchorReviewedSigningCoordinator();

        await expectThrowsAsync(() => signingCoordinator.sign({ wallet: connection.wallet, reviewedUnsignedPsbtHex: reviewOutcome.review.unsignedPsbtHex }), '32. a missing description throws');
        await expectThrowsAsync(() => signingCoordinator.sign({ wallet: connection.wallet, description: reviewOutcome.description }), '33. a missing reviewedUnsignedPsbtHex throws');
        await expectThrowsAsync(() => signingCoordinator.sign({ wallet: connection.wallet, description: reviewOutcome.description, reviewedUnsignedPsbtHex: '' }), '34. an empty reviewedUnsignedPsbtHex throws');
        assert(calls.length === 0, '35. none of these caller-contract violations ever reach the wallet');
    }
    console.log('✓ Section I: caller-contract violations on the signing coordinator throw before any wallet is ever consulted');

    // ---------------------------------------------------------------
    // Section J — the state vocabulary and view carry no verdict, and no
    // undocumented state.
    // ---------------------------------------------------------------
    {
        assert(Object.values(BitcoinAnchorReviewedSigningState).length === 6, '36. the signing state vocabulary carries exactly its six documented values');
        for (const forbiddenState of ['ready', 'safe', 'valid', 'authorized', 'verified', 'finalized', 'trusted']) {
            assert(!Object.values(BitcoinAnchorReviewedSigningState).includes(forbiddenState), `37. the signing state vocabulary never carries a "${forbiddenState}" value`);
        }
        assert(isValidBitcoinAnchorReviewedSigningState(BitcoinAnchorReviewedSigningState.SIGNED), '38. isValidBitcoinAnchorReviewedSigningState() recognizes a real state value');
        assert(!isValidBitcoinAnchorReviewedSigningState('authorized'), '39. isValidBitcoinAnchorReviewedSigningState() rejects a value outside the vocabulary');

        const idleView = describeBitcoinAnchorReviewedSigning(null);
        assert(idleView.state === BitcoinAnchorReviewedSigningState.IDLE, '40. describeBitcoinAnchorReviewedSigning(null) reports IDLE — the state before any signing attempt has ever been made');
        assert(Object.isFrozen(idleView), '41. the view result is frozen');
        const serialized = JSON.stringify(idleView).toLowerCase();
        for (const forbidden of ['valid', 'safe', 'verified', 'finalized', 'recommended', 'trusted', 'confidence', 'score']) {
            assert(!serialized.includes(forbidden), `42. the view never carries "${forbidden}" — a signing attempt's own facts are never promoted to a verdict about it`);
        }
    }
    console.log('✓ Section J: the signing state vocabulary and view carry no verdict, and no undocumented state');

    console.log('\nAll BitcoinAnchorReviewedSigningUX tests passed.');
}

run().catch((error) => {
    console.error('BitcoinAnchorReviewedSigningUX.test.js FAILED:', error);
    process.exitCode = 1;
});
