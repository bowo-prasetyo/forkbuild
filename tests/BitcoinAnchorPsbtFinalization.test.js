import { BitcoinAnchorTransactionBuilder } from '../anchoring/BitcoinAnchorTransactionBuilder.js';
import { BitcoinAnchorPsbtBuilder } from '../anchoring/BitcoinAnchorPsbtBuilder.js';
import { BitcoinAnchorSignedPsbtFinalizer } from '../anchoring/BitcoinAnchorSignedPsbtFinalizer.js';

// 0.8.51 — Bitcoin Signed PSBT Finalization & Cryptographic Signature
// Verification.
//
// The flagship this milestone exists to prove: given a signed PSBT whose
// signing material was independently, genuinely produced by real
// secp256k1 ECDSA signing — not merely shaped like a signature, the way
// tests/BitcoinAnchorWalletSigning.test.js's own fixtures deliberately are
// ("a DER-signature-shaped value, content unchecked") —
// BitcoinAnchorSignedPsbtFinalizer cryptographically verifies it and
// produces a real, broadcastable transaction, byte for byte. And given
// signing material that is merely shaped correctly but not actually valid
// — wrong key, wrong sighash, wrong sighash type, more than one signer — it
// is refused, every time, never finalized.
//
// EVERY SIGNATURE IN THIS FILE IS REAL. This file implements its own
// independent secp256k1 point arithmetic, SHA-256, RIPEMD-160, and ECDSA
// signing — sharing no code with anchoring/BitcoinAnchorSignedPsbtFinalizer.js
// itself — to generate real keys and sign real BIP143 sighashes from
// scratch. This is the identical "wholly independent, hand-rolled" fixture
// discipline tests/BitcoinAnchorWalletSigning.test.js already established
// for PSBT byte encoding, extended here to real cryptography. A test that
// merely fed the finalizer's own internal signing helper back into itself
// would prove nothing; these signatures are produced by a second,
// unrelated implementation, then checked against the first.
//
//   Section A: flagship — a genuinely signed p2wpkh PSBT (finalScriptWitness)
//              is cryptographically verified and finalized into real,
//              broadcastable transaction bytes.
//   Section B: a not-yet-finalized partialSig, from a real signature, is
//              itself finalized (BIP174 finalization, not merely checked).
//   Section C: multi-input — every input's own real signature is verified
//              independently; a fully-correct multi-input finalizes cleanly.
//   Section D: THE CORE INVARIANT — a public key that does not correspond
//              to the scriptPubKey being spent is refused, even though its
//              signature is otherwise perfectly well-formed.
//   Section E: a cryptographically valid signature over the WRONG sighash
//              (the right key, the wrong message) is refused.
//   Section F: only SIGHASH_ALL is supported — any other sighash type is
//              refused explicitly, never silently mis-verified.
//   Section G: more than one partialSig on a single input (multisig) is
//              refused, named explicitly as unsupported.
//   Section H: p2tr and p2pkh scriptTypes are refused as not-yet-supported
//              — an operational outcome, never a throw, never a silent
//              mis-finalization.
//   Section I: multi-input — tampering with just one of several otherwise
//              correctly-signed inputs is still caught, and named by index.
//   Section J: structural integrity is re-checked, not assumed — a signed
//              PSBT for a substituted transaction is refused via the exact
//              same BitcoinAnchorSignedPsbtInspector reason, before any
//              cryptography is even attempted.
//   Section K: a malformed finalScriptWitness shape (not exactly 2 items)
//              is refused.
//   Section L: an uncompressed public key is refused — this class only
//              supports 33-byte compressed keys.
//   Section M: a malformed description throws, before any signed PSBT is
//              ever considered.
//
// See docs/Principles.md, "Signing Material Is Not Yet A Signature Until
// It Verifies (0.8.51)."

function assert(condition, message) {
    if (!condition) throw new Error(`ASSERT FAILED: ${message}`);
}

function expectThrows(fn, message) {
    let threw = false;
    try { fn(); } catch (e) { threw = true; }
    assert(threw, message);
}

function utxo(txid, vout, valueSats, scriptType) {
    return { txid: txid.repeat(64).slice(0, 64), vout, valueSats, scriptType };
}

// ---------------------------------------------------------------------
// An independent SHA-256 / RIPEMD-160 / secp256k1 implementation — plain
// BigInt arithmetic, sharing no code with anchoring/
// BitcoinAnchorSignedPsbtFinalizer.js's own implementation — used to
// generate real keys and real ECDSA signatures for this file's fixtures.
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

// Real key generation — a fixed private key per test case (deterministic,
// reproducible fixtures; this is a test file, not a wallet).
function realKey(privateKeySeed) {
    const privateKey = privateKeySeed;
    const point = scalarMul(G, privateKey);
    const pubkeyBytes = compressPubkey(point);
    return { privateKey, pubkeyBytes, pubkeyHex: bytesToHex(pubkeyBytes), hash160Bytes: hash160(pubkeyBytes) };
}

// Independent BIP143 (segwit v0) sighash — reimplemented separately from
// anchoring/BitcoinAnchorSignedPsbtFinalizer.js's own copy, so that a real
// signature produced against THIS implementation's sighash genuinely tests
// whether the finalizer's own, unrelated implementation computes the exact
// same preimage.
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

// Signs input `index` of `description` with `key`'s real private key, over
// the real BIP143 sighash this transaction implies — the exact signature a
// correctly-behaving external wallet would have produced.
function signRealInput(description, index, key, nonce) {
    const sighash = computeP2wpkhSighash(description.globalUnsignedTx, index, key.hash160Bytes, description.inputs[index].witnessUtxo.valueSats);
    const { r, s } = ecdsaSign(key.privateKey, sighash, nonce);
    return bytesToHex(concatBytes([derEncodeSignature(r, s), Uint8Array.from([1])])); // SIGHASH_ALL suffix
}

// ---------------------------------------------------------------------
// A wholly independent, hand-rolled signed-PSBT encoder — plain hex-string
// manipulation, sharing no code with anchoring/
// BitcoinAnchorSignedPsbtFinalizer.js's own decoder — mirroring exactly
// tests/BitcoinAnchorWalletSigning.test.js's own fixture-building
// discipline.
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
function partialSigKv(pubkeyHex, sigWithHashTypeHex) {
    return kv('02' + pubkeyHex, sigWithHashTypeHex);
}

// ---------------------------------------------------------------------
// Byte-level primitives.
// ---------------------------------------------------------------------

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

function buildFlagshipDescription({ psbtBuilder, transactionBuilder, key }) {
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
    return description;
}

async function run() {
    const transactionBuilder = new BitcoinAnchorTransactionBuilder({ network: 'mainnet', feeRateSatsPerVByte: 1 });
    const psbtBuilder = new BitcoinAnchorPsbtBuilder();
    const finalizer = new BitcoinAnchorSignedPsbtFinalizer();

    const keyA = realKey(0x1a2b3c4d5e6f7890a1b2c3d4e5f60718293a4b5c6d7e8f90112233445566778n);
    const keyB = realKey(0x2222222222222222222222222222222222222222222222222222222222221n);
    const keyC = realKey(0x3333333333333333333333333333333333333333333333333333333333331n);
    const nonce1 = 0x9f8e7d6c5b4a39281706f5e4d3c2b1a0918273645362718293a4b5c6d7e8f90n;
    const nonce2 = 0x9999999999999999999999999999999999999999999999999999999999992n;
    const nonce3 = 0x9999999999999999999999999999999999999999999999999999999999993n;

    // ---------------------------------------------------------------
    // Section A — flagship: a genuinely signed p2wpkh PSBT is
    // cryptographically verified and finalized into real transaction bytes.
    // ---------------------------------------------------------------
    {
        const description = buildFlagshipDescription({ psbtBuilder, transactionBuilder, key: keyA });
        const sigHex = signRealInput(description, 0, keyA, nonce1);
        const signedHex = buildSignedPsbtHex(description, { inputExtras: [[finalScriptWitnessKv(sigHex, keyA.pubkeyHex)]] });

        const result = finalizer.finalize({ description, signedPsbt: signedHex });
        assert(result.finalized === true, '1. a genuinely signed p2wpkh PSBT is cryptographically verified and finalized');
        assert(/^[0-9a-f]{64}$/.test(result.txid), '2. a real 32-byte txid (as hex) is produced');
        assert(result.rawTransaction.hex.startsWith('02000000000101'), '3. the raw transaction begins with version 2, segwit marker 0x00, and flag 0x01');
        assert(result.verifiedInputs.length === 1 && result.verifiedInputs[0].pubkey === keyA.pubkeyHex, '4. the verified input reports the real public key that signed it');
        assert(result.verifiedInputs[0].sighashType === 1, '5. the verified input reports SIGHASH_ALL');
    }
    console.log('✓ Section A: flagship — a genuinely signed p2wpkh PSBT is cryptographically verified and finalized into real transaction bytes');

    // ---------------------------------------------------------------
    // Section B — a not-yet-finalized partialSig, from a real signature,
    // is itself finalized (real BIP174 finalization, not merely checked).
    // ---------------------------------------------------------------
    {
        const description = buildFlagshipDescription({ psbtBuilder, transactionBuilder, key: keyA });
        const sigHex = signRealInput(description, 0, keyA, nonce1);
        const signedHex = buildSignedPsbtHex(description, { inputExtras: [[partialSigKv(keyA.pubkeyHex, sigHex)]] });

        const result = finalizer.finalize({ description, signedPsbt: signedHex });
        assert(result.finalized === true, '6. a real, not-yet-finalized partialSig is itself finalized into a broadcastable transaction');
        assert(result.rawTransaction.bytes instanceof Uint8Array, '7. rawTransaction.bytes is a real Uint8Array');
    }
    console.log('✓ Section B: a not-yet-finalized partialSig, from a real signature, is itself finalized');

    // ---------------------------------------------------------------
    // Section C — multi-input: every input's own real signature is
    // verified independently; a fully-correct multi-input finalizes.
    // ---------------------------------------------------------------
    let multiInputDescription, multiInputKeys, multiInputSigs;
    {
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

        const signedHex = buildSignedPsbtHex(description, { inputExtras: description.inputs.map((_, i) => [finalScriptWitnessKv(sigs[i], keys[i].pubkeyHex)]) });
        const result = finalizer.finalize({ description, signedPsbt: signedHex });
        assert(result.finalized === true && result.verifiedInputs.length === description.inputs.length, '8. a fully-correct multi-input PSBT is finalized, one verified entry per input');

        multiInputDescription = description; multiInputKeys = keys; multiInputSigs = sigs;
    }
    console.log('✓ Section C: multi-input — every input\'s own real signature is verified independently, and a fully-correct multi-input finalizes cleanly');

    // ---------------------------------------------------------------
    // Section D — THE CORE INVARIANT: a public key that does not
    // correspond to the scriptPubKey being spent is refused, even with an
    // otherwise perfectly well-formed signature.
    // ---------------------------------------------------------------
    {
        const description = buildFlagshipDescription({ psbtBuilder, transactionBuilder, key: keyA });
        // keyB genuinely signs the real sighash — the signature itself is
        // perfectly valid, just by the wrong key for this scriptPubKey.
        const sighash = computeP2wpkhSighash(description.globalUnsignedTx, 0, keyA.hash160Bytes, 100000);
        const { r, s } = ecdsaSign(keyB.privateKey, sighash, nonce2);
        const sigHex = bytesToHex(concatBytes([derEncodeSignature(r, s), Uint8Array.from([1])]));
        const signedHex = buildSignedPsbtHex(description, { inputExtras: [[finalScriptWitnessKv(sigHex, keyB.pubkeyHex)]] });

        const result = finalizer.finalize({ description, signedPsbt: signedHex });
        assert(result.finalized === false, '9. a public key that does not correspond to the scriptPubKey being spent is refused');
        assert(/does not correspond to the P2WPKH script/.test(result.reason), '10. the refusal names the spendability mismatch specifically');
    }
    console.log('✓ Section D: THE CORE INVARIANT — a public key that does not correspond to the script being spent is refused');

    // ---------------------------------------------------------------
    // Section E — a cryptographically valid signature over the WRONG
    // sighash (the right key, the wrong message) is refused.
    // ---------------------------------------------------------------
    {
        const description = buildFlagshipDescription({ psbtBuilder, transactionBuilder, key: keyA });
        const wrongHash = new Uint8Array(32).fill(0x42);
        const { r, s } = ecdsaSign(keyA.privateKey, wrongHash, nonce1);
        const sigHex = bytesToHex(concatBytes([derEncodeSignature(r, s), Uint8Array.from([1])]));
        const signedHex = buildSignedPsbtHex(description, { inputExtras: [[finalScriptWitnessKv(sigHex, keyA.pubkeyHex)]] });

        const result = finalizer.finalize({ description, signedPsbt: signedHex });
        assert(result.finalized === false, '11. a valid signature over the wrong sighash is refused');
        assert(/does not cryptographically verify/.test(result.reason), '12. the refusal names cryptographic verification failing');
    }
    console.log('✓ Section E: a cryptographically valid signature over the wrong sighash (right key, wrong message) is refused');

    // ---------------------------------------------------------------
    // Section F — only SIGHASH_ALL is supported.
    // ---------------------------------------------------------------
    {
        const description = buildFlagshipDescription({ psbtBuilder, transactionBuilder, key: keyA });
        const sighash = computeP2wpkhSighash(description.globalUnsignedTx, 0, keyA.hash160Bytes, 100000);
        const { r, s } = ecdsaSign(keyA.privateKey, sighash, nonce1);
        const sigHex = bytesToHex(concatBytes([derEncodeSignature(r, s), Uint8Array.from([0x02])])); // SIGHASH_NONE
        const signedHex = buildSignedPsbtHex(description, { inputExtras: [[finalScriptWitnessKv(sigHex, keyA.pubkeyHex)]] });

        const result = finalizer.finalize({ description, signedPsbt: signedHex });
        assert(result.finalized === false, '13. a sighash type other than SIGHASH_ALL is refused');
        assert(/only SIGHASH_ALL/.test(result.reason), '14. the refusal names SIGHASH_ALL as the only supported type');
    }
    console.log('✓ Section F: only SIGHASH_ALL is supported — any other sighash type is refused explicitly');

    // ---------------------------------------------------------------
    // Section G — more than one partialSig on a single input (multisig)
    // is refused, named explicitly.
    // ---------------------------------------------------------------
    {
        const description = buildFlagshipDescription({ psbtBuilder, transactionBuilder, key: keyA });
        const sigHex = signRealInput(description, 0, keyA, nonce1);
        const signedHex = buildSignedPsbtHex(description, { inputExtras: [[partialSigKv(keyA.pubkeyHex, sigHex), partialSigKv(keyB.pubkeyHex, sigHex)]] });

        const result = finalizer.finalize({ description, signedPsbt: signedHex });
        assert(result.finalized === false, '15. more than one partialSig on a single input is refused');
        assert(/multisig is not supported/.test(result.reason), '16. the refusal names multisig as unsupported');
    }
    console.log('✓ Section G: more than one partialSig on a single input (multisig) is refused, named explicitly as unsupported');

    // ---------------------------------------------------------------
    // Section H — p2tr and p2pkh scriptTypes are refused as not-yet-
    // supported — an operational outcome, never a throw.
    // ---------------------------------------------------------------
    {
        const plan = transactionBuilder.build({ contentHash: 'deadbeef', utxos: [utxo('a', 0, 100000, 'p2tr')], changeAddress: 'bc1pexample' });
        const description = psbtBuilder.build({ plan, utxoDetails: [{ txid: plan.inputs[0].txid, vout: 0, scriptPubKey: '5120' + 'c'.repeat(64), valueSats: 100000 }], changeScriptPubKey: '0014' + 'b'.repeat(40) });
        const signedHex = buildSignedPsbtHex(description, { inputExtras: [[finalScriptWitnessKv('aa'.repeat(64), keyA.pubkeyHex)]] });

        const result = finalizer.finalize({ description, signedPsbt: signedHex });
        assert(result.finalized === false, '17. a p2tr input is refused as not-yet-supported');
        assert(/p2tr/.test(result.reason) && /does not yet cryptographically finalize/.test(result.reason), '18. the refusal names p2tr as not yet supported');
    }
    {
        const plan = transactionBuilder.build({ contentHash: 'deadbeef', utxos: [utxo('b', 0, 100000, 'p2pkh')], changeAddress: '1ExampleLegacyAddress' });
        const description = psbtBuilder.build({ plan, utxoDetails: [{ txid: plan.inputs[0].txid, vout: 0, nonWitnessUtxo: 'ab'.repeat(100) }], changeScriptPubKey: '76a914' + 'c'.repeat(40) + '88ac' });
        // p2pkh carries nonWitnessUtxo, not witnessUtxo — build its signed hex by hand since buildSignedPsbtHex assumes witnessUtxo.
        let out = '70736274ff';
        out += kv('00', encodeUnsignedTxHex(description.globalUnsignedTx));
        out += '00';
        out += kv('00', description.inputs[0].nonWitnessUtxo);
        out += kv('07', 'aabb'); // finalScriptSig, content unchecked — refused before signature bytes are ever inspected
        out += '00';
        description.globalUnsignedTx.outputs.forEach(() => { out += '00'; });

        const result = finalizer.finalize({ description, signedPsbt: out });
        assert(result.finalized === false, '19. a p2pkh input is refused as not-yet-supported');
        assert(/p2pkh/.test(result.reason) && /does not yet cryptographically finalize/.test(result.reason), '20. the refusal names p2pkh as not yet supported');
    }
    console.log('✓ Section H: p2tr and p2pkh scriptTypes are refused as not-yet-supported — an operational outcome, never a throw');

    // ---------------------------------------------------------------
    // Section I — multi-input: tampering with just one of several
    // otherwise correctly-signed inputs is still caught, and named by
    // index.
    // ---------------------------------------------------------------
    {
        const badSig = signRealInput(multiInputDescription, 1, multiInputKeys[0], nonce2); // wrong key for input 1
        const extras = multiInputDescription.inputs.map((_, i) => i === 1
            ? [finalScriptWitnessKv(badSig, multiInputKeys[0].pubkeyHex)]
            : [finalScriptWitnessKv(multiInputSigs[i], multiInputKeys[i].pubkeyHex)]);
        const tamperedHex = buildSignedPsbtHex(multiInputDescription, { inputExtras: extras });

        const result = finalizer.finalize({ description: multiInputDescription, signedPsbt: tamperedHex });
        assert(result.finalized === false, '21. tampering with just one of several otherwise correctly-signed inputs is still caught');
        assert(/^input 1:/.test(result.reason), '22. the refusal names the tampered input by index');
    }
    console.log('✓ Section I: multi-input — tampering with just one of several otherwise correctly-signed inputs is still caught, and named by index');

    // ---------------------------------------------------------------
    // Section J — structural integrity is re-checked, not assumed: a
    // signed PSBT for a substituted transaction is refused via the exact
    // same BitcoinAnchorSignedPsbtInspector reason, before any
    // cryptography is even attempted.
    // ---------------------------------------------------------------
    {
        const description = buildFlagshipDescription({ psbtBuilder, transactionBuilder, key: keyA });
        const tamperedTx = { ...description.globalUnsignedTx, outputs: description.globalUnsignedTx.outputs.map((output, i) => i === 1 ? { ...output, valueSats: output.valueSats + 1 } : output) };
        const sigHex = signRealInput(description, 0, keyA, nonce1);
        const tamperedHex = buildSignedPsbtHex(description, { tx: tamperedTx, inputExtras: [[finalScriptWitnessKv(sigHex, keyA.pubkeyHex)]] });

        const result = finalizer.finalize({ description, signedPsbt: tamperedHex });
        assert(result.finalized === false, '23. a signed PSBT for a substituted transaction is refused');
        assert(/transaction identity changed/.test(result.reason), '24. the refusal is the exact structural-integrity reason the inspector itself would give, reached before any cryptography');
    }
    console.log('✓ Section J: structural integrity is re-checked, not assumed — a substituted transaction is refused before any cryptography is attempted');

    // ---------------------------------------------------------------
    // Section K — a malformed finalScriptWitness shape (not exactly 2
    // items) is refused.
    // ---------------------------------------------------------------
    {
        const description = buildFlagshipDescription({ psbtBuilder, transactionBuilder, key: keyA });
        const sigHex = signRealInput(description, 0, keyA, nonce1);
        const value = compactSizeHex(3) + compactSizeHex(sigHex.length / 2) + sigHex + compactSizeHex(keyA.pubkeyHex.length / 2) + keyA.pubkeyHex + compactSizeHex(1) + 'ff';
        const signedHex = buildSignedPsbtHex(description, { inputExtras: [[kv('08', value)]] });

        const result = finalizer.finalize({ description, signedPsbt: signedHex });
        assert(result.finalized === false, '25. a finalScriptWitness with the wrong number of stack items is refused');
        assert(/unsupported finalScriptWitness shape/.test(result.reason), '26. the refusal names the unsupported witness shape');
    }
    console.log('✓ Section K: a malformed finalScriptWitness shape (not exactly 2 items) is refused');

    // ---------------------------------------------------------------
    // Section L — an uncompressed public key is refused.
    // ---------------------------------------------------------------
    {
        const description = buildFlagshipDescription({ psbtBuilder, transactionBuilder, key: keyA });
        const sigHex = signRealInput(description, 0, keyA, nonce1);
        const uncompressedPubkeyHex = '04' + 'aa'.repeat(64);
        const signedHex = buildSignedPsbtHex(description, { inputExtras: [[finalScriptWitnessKv(sigHex, uncompressedPubkeyHex)]] });

        const result = finalizer.finalize({ description, signedPsbt: signedHex });
        assert(result.finalized === false, '27. an uncompressed public key is refused');
        assert(/compressed secp256k1 key/.test(result.reason), '28. the refusal names the compressed-key requirement');
    }
    console.log('✓ Section L: an uncompressed public key is refused — this class only supports 33-byte compressed keys');

    // ---------------------------------------------------------------
    // Section M — a malformed description throws, before any signed PSBT
    // is ever considered.
    // ---------------------------------------------------------------
    {
        expectThrows(() => finalizer.finalize({ description: { globalUnsignedTx: undefined, inputs: [] }, signedPsbt: '00' }),
            '29. a malformed description is refused before the signed PSBT is ever considered');
    }
    console.log('✓ Section M: a malformed description throws, before any signed PSBT is ever considered');

    console.log('\nAll BitcoinAnchorPsbtFinalization tests passed.');
}

run().catch((error) => {
    console.error('BitcoinAnchorPsbtFinalization.test.js FAILED:', error);
    process.exitCode = 1;
});
