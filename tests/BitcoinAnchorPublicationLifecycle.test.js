import { DecentralizedPublication } from '../core/DecentralizedPublication.js';
import { ContentReference } from '../core/ContentReference.js';
import { PublicationAnchor } from '../core/PublicationAnchor.js';
import { LocalPublicationCatalog } from '../application/LocalPublicationCatalog.js';
import { LocalPublicationAnchorCatalog } from '../application/LocalPublicationAnchorCatalog.js';
import { CreatePublicationAnchorUseCase } from '../application/CreatePublicationAnchorUseCase.js';
import { ExternalAnchorVerifier } from '../application/ExternalAnchorVerifier.js';
import { AnchorVerificationOutcome } from '../application/AnchorVerificationOutcome.js';
import { BitcoinAnchorPublicationCoordinator } from '../application/BitcoinAnchorPublicationCoordinator.js';
import { BitcoinAnchorPublicationLifecycleState } from '../application/BitcoinAnchorPublicationLifecycleState.js';
import { BitcoinAnchorTransactionBuilder } from '../anchoring/BitcoinAnchorTransactionBuilder.js';
import { BitcoinAnchorPsbtBuilder } from '../anchoring/BitcoinAnchorPsbtBuilder.js';
import { BitcoinAnchorPsbtSerializer } from '../anchoring/BitcoinAnchorPsbtSerializer.js';
import { BitcoinAnchorWalletSigner } from '../anchoring/BitcoinAnchorWalletSigner.js';
import { BitcoinAnchorSignedPsbtFinalizer } from '../anchoring/BitcoinAnchorSignedPsbtFinalizer.js';
import { BitcoinAnchorTransactionBroadcaster } from '../anchoring/BitcoinAnchorTransactionBroadcaster.js';
import { BitcoinOpReturnProofVerifier } from '../anchoring/BitcoinOpReturnProofVerifier.js';
import { StorageProvider } from '../storage/StorageProvider.js';
import { LocalIdentityProvider } from '../identity/LocalIdentityProvider.js';
import { LocalAuthorizationVerifier } from '../identity/LocalAuthorizationVerifier.js';

// 0.8.53 — Bitcoin Anchor Publication Lifecycle.
//
// The flagship this milestone exists to prove: application/
// BitcoinAnchorPublicationCoordinator.js connects EVERY real primitive
// 0.8.47→0.8.52 already built — transaction plan, real BIP174 PSBT, an
// external wallet's genuine secp256k1 signature, independent structural
// inspection, cryptographic finalization, broadcast — into ONE explicit
// action that produces a real, catalogued, independently-verifiable
// `core/PublicationAnchor.js`. Every signature in this file is REAL: a
// wholly independent secp256k1/SHA-256/RIPEMD-160 implementation (sharing
// no code with anchoring/BitcoinAnchorSignedPsbtFinalizer.js's own),
// mirroring exactly the fixture discipline tests/
// BitcoinAnchorPsbtFinalization.test.js already established.
//
//   Section A: flagship — the complete real chain, end to end. Alice's
//              publication's contentHash flows through a real plan, a
//              real serialized PSBT, a fake wallet that independently
//              decodes those exact bytes and signs with a real key, real
//              cryptographic finalization, and a fake broadcaster that
//              receives the exact raw bytes. THE CRITICAL INVARIANT: the
//              broadcasted transaction's OP_RETURN output carries EXACTLY
//              the publication's contentHash — not a CID, not a
//              publicationId, not a signature, not a second, application-
//              chosen encoding. The resulting anchor is independently
//              checkable by anchoring/BitcoinOpReturnProofVerifier.js,
//              exactly as any other bitcoin-op-return anchor already is.
//   Section B: PLAN_FAILED — insufficient funds stops the pipeline before
//              a wallet or broadcaster is ever consulted.
//   Section C: SIGNING_UNAVAILABLE — a wallet that cannot presently be
//              reached stops the pipeline before finalization/broadcast.
//   Section D: SIGNATURE_INVALID — a wallet that definitely declines
//              stops the pipeline the same way.
//   Section E: FINALIZATION_FAILED — a structurally intact but
//              cryptographically wrong signature stops the pipeline
//              before the broadcaster is ever consulted.
//   Section F: BROADCAST_REJECTED — a real, fully finalized transaction
//              that the network refuses never reaches
//              CreatePublicationAnchorUseCase — no anchor is created.
//   Section G: BROADCAST_UNAVAILABLE — distinguishable from a definite
//              rejection, the identical distinction every prior Bitcoin
//              milestone in this sequence already preserves.
//
// See docs/Principles.md, "One Explicit Publication Action, Composed From
// Existing Primitives (0.8.53)."

function assert(condition, message) {
    if (!condition) throw new Error(`ASSERT FAILED: ${message}`);
}

class InMemoryStorageProvider extends StorageProvider {
    constructor() { super(); this._data = new Map(); }
    save(name, data) { this._data.set(name, JSON.parse(JSON.stringify(data))); }
    load(name) { return this._data.has(name) ? JSON.parse(JSON.stringify(this._data.get(name))) : null; }
    remove(name) { this._data.delete(name); }
    list() { return Array.from(this._data.keys()); }
}

function makeIdentity(label) {
    const provider = new LocalIdentityProvider(new InMemoryStorageProvider());
    const identity = provider.createLocalIdentity(label);
    provider.authenticate(identity.identityId);
    return provider;
}

function publishContent(publicationCatalog, { id, hash }) {
    const publication = new DecentralizedPublication({
        id,
        contentKind: 'forkbuild.structure',
        contentReference: new ContentReference({ hash })
    });
    publicationCatalog.add(publication);
    return publication;
}

// ---------------------------------------------------------------------
// A wholly independent secp256k1 / SHA-256 / RIPEMD-160 implementation —
// sharing no code with anchoring/BitcoinAnchorSignedPsbtFinalizer.js's own
// — used to generate a real key and a real ECDSA signature. See this
// file's own header, and tests/BitcoinAnchorPsbtFinalization.test.js,
// which already established this exact discipline.
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
    const point = scalarMul(G, privateKeySeed);
    const pubkeyBytes = compressPubkey(point);
    return { privateKey: privateKeySeed, pubkeyBytes, pubkeyHex: bytesToHex(pubkeyBytes), hash160Hex: bytesToHex(hash160(pubkeyBytes)) };
}

// Independent BIP143 (segwit v0) sighash.
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
function signRealInput(tx, index, key, valueSats, nonce) {
    const sighash = computeP2wpkhSighash(tx, index, hexToBytes(key.hash160Hex), valueSats);
    const { r, s } = ecdsaSign(key.privateKey, sighash, nonce);
    return bytesToHex(concatBytes([derEncodeSignature(r, s), Uint8Array.from([1])]));
}

// ---------------------------------------------------------------------
// A wholly independent PSBT byte encoder/decoder — sharing no code with
// anchoring/BitcoinAnchorPsbtSerializer.js's own — used both to decode
// the REAL unsigned PSBT the fake wallet below receives, and to encode
// the signed PSBT it hands back. Mirrors exactly the "independent
// encoder, never the codebase's own" discipline tests/
// BitcoinAnchorPsbtFinalization.test.js already established.
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
function encodeVarBytes(bytes) { return concatBytes([encodeCompactSize(bytes.length), bytes]); }
function encodeCompactSize(v) {
    if (v <= 0xfc) return Uint8Array.from([v]);
    throw new Error('test helper does not need multi-byte compactSize');
}
function readCompactSize(bytes, offset) {
    const first = bytes[offset];
    if (first < 0xfd) return { value: first, offset: offset + 1 };
    if (first === 0xfd) return { value: new DataView(bytes.buffer, bytes.byteOffset + offset + 1, 2).getUint16(0, true), offset: offset + 3 };
    if (first === 0xfe) return { value: new DataView(bytes.buffer, bytes.byteOffset + offset + 1, 4).getUint32(0, true), offset: offset + 5 };
    return { value: Number(new DataView(bytes.buffer, bytes.byteOffset + offset + 1, 8).getBigUint64(0, true)), offset: offset + 9 };
}
function readVarBytes(bytes, offset) {
    const len = readCompactSize(bytes, offset);
    return { bytes: bytes.slice(len.offset, len.offset + len.value), offset: len.offset + len.value };
}
function readKeyValueMap(bytes, offset) {
    const entries = [];
    for (;;) {
        const keyLen = readCompactSize(bytes, offset); offset = keyLen.offset;
        if (keyLen.value === 0) break;
        const key = bytes.slice(offset, offset + keyLen.value); offset += keyLen.value;
        const valueLen = readCompactSize(bytes, offset); offset = valueLen.offset;
        const value = bytes.slice(offset, offset + valueLen.value); offset += valueLen.value;
        entries.push({ key, value });
    }
    return { entries, offset };
}
function decodeUnsignedTx(raw) {
    let offset = 0;
    const version = new DataView(raw.buffer, raw.byteOffset, 4).getUint32(0, true); offset += 4;
    const inputCount = readCompactSize(raw, offset); offset = inputCount.offset;
    const inputs = [];
    for (let i = 0; i < inputCount.value; i++) {
        const txidBytes = raw.slice(offset, offset + 32); offset += 32;
        const vout = new DataView(raw.buffer, raw.byteOffset + offset, 4).getUint32(0, true); offset += 4;
        const scriptSigLen = readCompactSize(raw, offset); offset = scriptSigLen.offset + scriptSigLen.value;
        const sequence = new DataView(raw.buffer, raw.byteOffset + offset, 4).getUint32(0, true); offset += 4;
        inputs.push({ txid: bytesToHex(reverseBytes(txidBytes)), vout, sequence });
    }
    const outputCount = readCompactSize(raw, offset); offset = outputCount.offset;
    const outputs = [];
    for (let i = 0; i < outputCount.value; i++) {
        const valueSats = Number(new DataView(raw.buffer, raw.byteOffset + offset, 8).getBigUint64(0, true)); offset += 8;
        const script = readVarBytes(raw, offset); offset = script.offset;
        outputs.push({ scriptPubKey: bytesToHex(script.bytes), valueSats });
    }
    const locktime = new DataView(raw.buffer, raw.byteOffset + offset, 4).getUint32(0, true);
    return { version, locktime, inputs, outputs };
}
// Decodes a REAL unsigned PSBT (as produced by anchoring/
// BitcoinAnchorPsbtSerializer.js) into { globalUnsignedTx, inputs:
// [{ txid, vout, witnessUtxo }] } — the shape a real external wallet would
// need to recover in order to know what it is being asked to sign.
function decodeUnsignedPsbtForWallet(bytes) {
    let offset = 5; // PSBT magic
    const globalMap = readKeyValueMap(bytes, offset); offset = globalMap.offset;
    const globalUnsignedTx = decodeUnsignedTx(globalMap.entries[0].value);
    const inputs = globalUnsignedTx.inputs.map((globalInput) => {
        const inputMap = readKeyValueMap(bytes, offset); offset = inputMap.offset;
        const witnessEntry = inputMap.entries.find((e) => e.key.length === 1 && e.key[0] === 0x01);
        const valueSats = Number(new DataView(witnessEntry.value.buffer, witnessEntry.value.byteOffset, 8).getBigUint64(0, true));
        const script = readVarBytes(witnessEntry.value, 8);
        return { txid: globalInput.txid, vout: globalInput.vout, witnessUtxo: { scriptPubKey: bytesToHex(script.bytes), valueSats } };
    });
    globalUnsignedTx.outputs.forEach(() => { const m = readKeyValueMap(bytes, offset); offset = m.offset; });
    return { globalUnsignedTx, inputs };
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
function kv(keyHex, valueHex) { return compactSizeHex(keyHex.length / 2) + keyHex + compactSizeHex(valueHex.length / 2) + valueHex; }
function encodeUnsignedTxHex(tx) {
    const inputsHex = tx.inputs.map((input) => reverseHex(input.txid) + u32le(input.vout) + compactSizeHex(0) + u32le(input.sequence)).join('');
    const outputsHex = tx.outputs.map((output) => u64le(output.valueSats) + compactSizeHex(output.scriptPubKey.length / 2) + output.scriptPubKey).join('');
    return u32le(tx.version) + compactSizeHex(tx.inputs.length) + inputsHex + compactSizeHex(tx.outputs.length) + outputsHex + u32le(tx.locktime);
}
function finalScriptWitnessKv(sigWithHashTypeHex, pubkeyHex) {
    const value = compactSizeHex(2) + compactSizeHex(sigWithHashTypeHex.length / 2) + sigWithHashTypeHex + compactSizeHex(pubkeyHex.length / 2) + pubkeyHex;
    return kv('08', value);
}
function buildSignedPsbtHex(decoded, inputExtras) {
    let out = '70736274ff';
    out += kv('00', encodeUnsignedTxHex(decoded.globalUnsignedTx));
    out += '00';
    decoded.inputs.forEach((input, i) => {
        const w = input.witnessUtxo;
        out += kv('01', u64le(w.valueSats) + compactSizeHex(w.scriptPubKey.length / 2) + w.scriptPubKey);
        (inputExtras[i] || []).forEach((extraKv) => { out += extraKv; });
        out += '00';
    });
    decoded.globalUnsignedTx.outputs.forEach(() => { out += '00'; });
    return out;
}

// A fake wallet that behaves like a real one would: it independently
// DECODES the exact unsigned PSBT bytes it was handed (never trusting a
// `description` object it was never given), matches each input's
// witnessUtxo scriptPubKey to a known private key by hash160, and signs
// each input's own real BIP143 sighash with a real secp256k1 signature.
function makeRealSigningWallet(keysByHash160Hex, noncesByIndex) {
    return {
        async signPsbt(unsignedPsbt) {
            const decoded = decodeUnsignedPsbtForWallet(unsignedPsbt.bytes);
            const inputExtras = decoded.inputs.map((input, i) => {
                const hash160Hex = input.witnessUtxo.scriptPubKey.slice(4); // strip '0014'
                const key = keysByHash160Hex[hash160Hex];
                if (!key) throw new Error(`test wallet: no key known for input ${i}`);
                const sigHex = signRealInput(decoded.globalUnsignedTx, i, key, input.witnessUtxo.valueSats, noncesByIndex[i]);
                return [finalScriptWitnessKv(sigHex, key.pubkeyHex)];
            });
            return { signed: true, psbt: buildSignedPsbtHex(decoded, inputExtras) };
        }
    };
}

// A wallet that signs a real key over the WRONG message (a fixed garbage
// hash instead of the real BIP143 sighash) — structurally a perfectly
// well-formed finalScriptWitness (BitcoinAnchorSignedPsbtInspector reports
// `intact: true`), but cryptographically wrong, so only
// BitcoinAnchorSignedPsbtFinalizer's own signature verification can catch
// it — exactly the FINALIZATION_FAILED boundary this section exists to
// exercise.
function makeCryptographicallyBrokenWallet(key, nonce) {
    return {
        async signPsbt(unsignedPsbt) {
            const decoded = decodeUnsignedPsbtForWallet(unsignedPsbt.bytes);
            const wrongHash = new Uint8Array(32).fill(0x42);
            const { r, s } = ecdsaSign(key.privateKey, wrongHash, nonce);
            const sigHex = bytesToHex(concatBytes([derEncodeSignature(r, s), Uint8Array.from([1])]));
            return { signed: true, psbt: buildSignedPsbtHex(decoded, [[finalScriptWitnessKv(sigHex, key.pubkeyHex)]]) };
        }
    };
}

function makeCapturingBroadcaster() {
    let capturedHex = null;
    return {
        broadcaster: { async broadcast(rawTransactionHex) { capturedHex = rawTransactionHex; return { broadcast: true }; } },
        getCapturedHex: () => capturedHex
    };
}

function makeRejectingBroadcaster(reason) {
    return { async broadcast() { return { broadcast: false, reason }; } };
}
function makeUnavailableBroadcaster(reason) {
    return { async broadcast() { return { broadcast: false, unavailable: true, reason }; } };
}

// Extracts the OP_RETURN output's pushed hex data directly from real,
// broadcast segwit transaction bytes — an independent, minimal raw-tx
// reader, proving the CRITICAL invariant against the exact bytes a real
// broadcasting endpoint would have received, not merely the PSBT
// description that preceded them.
function extractOpReturnDataFromRawTxHex(hex) {
    const bytes = hexToBytes(hex);
    let offset = 4; // version
    if (bytes[offset] === 0x00 && bytes[offset + 1] === 0x01) offset += 2; // segwit marker + flag
    const inputCount = readCompactSize(bytes, offset); offset = inputCount.offset;
    for (let i = 0; i < inputCount.value; i++) {
        offset += 32 + 4; // txid + vout
        const scriptLen = readCompactSize(bytes, offset); offset = scriptLen.offset + scriptLen.value;
        offset += 4; // sequence
    }
    const outputCount = readCompactSize(bytes, offset); offset = outputCount.offset;
    const scripts = [];
    for (let i = 0; i < outputCount.value; i++) {
        offset += 8; // value
        const script = readVarBytes(bytes, offset); offset = script.offset;
        scripts.push(script.bytes);
    }
    const opReturn = scripts.find((script) => script[0] === 0x6a);
    if (!opReturn) return null;
    if (opReturn[1] <= 0x4b) return bytesToHex(opReturn.slice(2, 2 + opReturn[1]));
    if (opReturn[1] === 0x4c) return bytesToHex(opReturn.slice(3, 3 + opReturn[2]));
    throw new Error('test helper does not support this OP_RETURN push size');
}

function opReturnEsploraOutput(hexData) {
    return { scriptpubkey_type: 'op_return', scriptpubkey_asm: `OP_RETURN OP_PUSHBYTES_${hexData.length / 2} ${hexData}` };
}

// ---------------------------------------------------------------------

function makeComponents({ wallet, broadcaster }) {
    return {
        bitcoinAnchorTransactionBuilder: new BitcoinAnchorTransactionBuilder({ network: 'mainnet', feeRateSatsPerVByte: 1 }),
        bitcoinAnchorPsbtBuilder: new BitcoinAnchorPsbtBuilder(),
        bitcoinAnchorPsbtSerializer: new BitcoinAnchorPsbtSerializer(),
        bitcoinAnchorWalletSigner: new BitcoinAnchorWalletSigner({ wallet }),
        bitcoinAnchorSignedPsbtFinalizer: new BitcoinAnchorSignedPsbtFinalizer(),
        bitcoinAnchorTransactionBroadcaster: new BitcoinAnchorTransactionBroadcaster({ broadcaster })
    };
}

function makeCoordinator(components) {
    const alice = makeIdentity('Alice');
    const publicationCatalog = new LocalPublicationCatalog(new InMemoryStorageProvider());
    const anchorCatalog = new LocalPublicationAnchorCatalog(new InMemoryStorageProvider());
    const authVerifier = new LocalAuthorizationVerifier();
    const createPublicationAnchorUseCase = new CreatePublicationAnchorUseCase(publicationCatalog, alice, authVerifier, anchorCatalog);

    const coordinator = new BitcoinAnchorPublicationCoordinator({
        publicationCatalog, createPublicationAnchorUseCase, ...components
    });
    return { coordinator, publicationCatalog, anchorCatalog };
}

async function run() {
    const keyA = realKey(0x1a2b3c4d5e6f7890a1b2c3d4e5f60718293a4b5c6d7e8f90112233445566778n);
    const nonce1 = 0x9f8e7d6c5b4a39281706f5e4d3c2b1a0918273645362718293a4b5c6d7e8f90n;

    const utxos = [{ txid: 'a'.repeat(64), vout: 0, valueSats: 100000, scriptType: 'p2wpkh' }];
    const changeAddress = 'bc1qexamplechangeaddress';
    const utxoDetails = [{ txid: 'a'.repeat(64), vout: 0, scriptPubKey: '0014' + keyA.hash160Hex, valueSats: 100000 }];
    const changeScriptPubKey = '0014' + 'b'.repeat(40);

    // ---------------------------------------------------------------
    // Section A — flagship: the complete real chain, end to end.
    // ---------------------------------------------------------------
    {
        const contentHash = 'f00dcafedeadbeef';
        const wallet = makeRealSigningWallet({ [keyA.hash160Hex]: keyA }, [nonce1]);
        const capturing = makeCapturingBroadcaster();
        const components = makeComponents({ wallet, broadcaster: capturing.broadcaster });
        const { coordinator, publicationCatalog, anchorCatalog } = makeCoordinator(components);
        publishContent(publicationCatalog, { id: 'pub-flagship', hash: contentHash });

        const result = await coordinator.publishAnchor('pub-flagship', { utxos, changeAddress, utxoDetails, changeScriptPubKey });

        assert(result.state === BitcoinAnchorPublicationLifecycleState.BROADCASTED, '1. the full pipeline reaches BROADCASTED');
        assert(result.reachedStage === BitcoinAnchorPublicationLifecycleState.BROADCASTED, '2. reachedStage agrees with state on success');
        assert(result.reason === null, '3. no reason is reported on success');
        assert(result.unsignedPsbt && typeof result.unsignedPsbt.hex === 'string', '4. the real serialized unsigned PSBT is included in the result');
        assert(typeof result.txid === 'string' && /^[0-9a-f]{64}$/i.test(result.txid), '5. a real 32-byte txid is reported');
        assert(result.anchor instanceof PublicationAnchor, '6. a real PublicationAnchor is produced');
        assert(result.anchor.contentHash === contentHash, '7. the anchor binds to the publication\'s own contentHash');
        assert(result.anchor.anchorType === 'bitcoin-op-return', '8. the anchor carries the bitcoin-op-return anchorType');
        assert(result.anchor.proof.txid === result.txid, '9. the anchor\'s proof carries the exact txid the pipeline produced');
        assert(anchorCatalog.list().length === 1 && anchorCatalog.get(result.anchor.id), '10. the anchor is really catalogued, not merely returned');

        // THE CRITICAL INVARIANT: the OP_RETURN output of the exact bytes
        // the broadcaster received carries EXACTLY the contentHash — not a
        // CID, not the publicationId, not a signature, not a second,
        // application-chosen encoding.
        const capturedHex = capturing.getCapturedHex();
        assert(typeof capturedHex === 'string' && capturedHex.length > 0, '11. the broadcaster received real raw transaction bytes');
        const opReturnData = extractOpReturnDataFromRawTxHex(capturedHex);
        assert(opReturnData !== null, '12. the broadcasted transaction carries an OP_RETURN output');
        assert(opReturnData.toLowerCase() === contentHash.toLowerCase(),
            '13. THE CRITICAL INVARIANT — the OP_RETURN output carries exactly the publication\'s contentHash, byte for byte, nothing more');

        // Bonus continuity check: the resulting anchor is independently
        // checkable by anchoring/BitcoinOpReturnProofVerifier.js, exactly
        // like any other bitcoin-op-return anchor already is.
        const fetchImpl = async (url) => {
            const parsed = new URL(url);
            if (parsed.pathname.match(/\/tx\/([0-9a-f]+)$/i)?.[1] === result.txid) {
                return new Response(JSON.stringify({
                    txid: result.txid, vout: [opReturnEsploraOutput(opReturnData)], status: { confirmed: true, block_height: 900001 }
                }), { status: 200 });
            }
            return new Response('not found', { status: 404 });
        };
        const bobAuthVerifier = new LocalAuthorizationVerifier();
        const bobAnchorVerifier = new ExternalAnchorVerifier(bobAuthVerifier);
        const bobProofVerifier = new BitcoinOpReturnProofVerifier({ apiUrl: 'https://bob-explorer.test/api', fetchImpl });
        const verification = await bobAnchorVerifier.verify(result.anchor.toJSON(), {
            expectedContentHash: contentHash, proofVerifier: bobProofVerifier
        });
        assert(verification.outcome === AnchorVerificationOutcome.VALID,
            '14. Bob, with none of Alice\'s local state, independently verifies the coordinator-produced anchor as VALID against the real broadcasted bytes');
    }
    console.log('✓ Section A: flagship — the complete real chain reaches BROADCASTED, the OP_RETURN output carries exactly the contentHash, and the anchor independently verifies');

    // ---------------------------------------------------------------
    // Section B — PLAN_FAILED: insufficient funds stops the pipeline
    // before a wallet or broadcaster is ever consulted.
    // ---------------------------------------------------------------
    {
        let walletCalls = 0, broadcastCalls = 0;
        const wallet = { signPsbt: async () => { walletCalls += 1; return { signed: true, psbt: '00' }; } };
        const broadcaster = { broadcast: async () => { broadcastCalls += 1; return { broadcast: true }; } };
        const components = makeComponents({ wallet, broadcaster });
        const { coordinator, publicationCatalog } = makeCoordinator(components);
        publishContent(publicationCatalog, { id: 'pub-broke', hash: 'aa' });

        const result = await coordinator.publishAnchor('pub-broke', {
            utxos: [{ txid: 'c'.repeat(64), vout: 0, valueSats: 10, scriptType: 'p2wpkh' }],
            changeAddress, utxoDetails: [], changeScriptPubKey: undefined
        });

        assert(result.state === BitcoinAnchorPublicationLifecycleState.PLAN_FAILED, '15. insufficient funds reports PLAN_FAILED');
        assert(result.reachedStage === null, '16. no stage was reached at all');
        assert(typeof result.reason === 'string' && result.reason.length > 0, '17. a reason is reported');
        assert(result.anchor === null && result.unsignedPsbt === null && result.txid === null, '18. no PSBT, txid, or anchor exists');
        assert(walletCalls === 0 && broadcastCalls === 0, '19. neither the wallet nor the broadcaster is ever consulted');
    }
    console.log('✓ Section B: PLAN_FAILED — insufficient funds stops the pipeline before a wallet or broadcaster is ever consulted');

    // ---------------------------------------------------------------
    // Section C — SIGNING_UNAVAILABLE: a wallet that cannot presently be
    // reached stops the pipeline before finalization/broadcast.
    // ---------------------------------------------------------------
    {
        let broadcastCalls = 0;
        const wallet = { signPsbt: async () => { throw new Error('wallet is locked'); } };
        const broadcaster = { broadcast: async () => { broadcastCalls += 1; return { broadcast: true }; } };
        const components = makeComponents({ wallet, broadcaster });
        const { coordinator, publicationCatalog } = makeCoordinator(components);
        publishContent(publicationCatalog, { id: 'pub-locked', hash: 'bb' });

        const result = await coordinator.publishAnchor('pub-locked', { utxos, changeAddress, utxoDetails, changeScriptPubKey });

        assert(result.state === BitcoinAnchorPublicationLifecycleState.SIGNING_UNAVAILABLE, '20. an unreachable wallet reports SIGNING_UNAVAILABLE');
        assert(result.reachedStage === BitcoinAnchorPublicationLifecycleState.PSBT_READY, '21. PSBT_READY was reached before signing failed');
        assert(result.unsignedPsbt && typeof result.unsignedPsbt.hex === 'string', '22. the unsigned PSBT is still available for inspection/export');
        assert(result.anchor === null && result.txid === null, '23. no anchor or txid exists');
        assert(broadcastCalls === 0, '24. the broadcaster is never consulted');
    }
    console.log('✓ Section C: SIGNING_UNAVAILABLE — an unreachable wallet stops the pipeline, the unsigned PSBT stays available');

    // ---------------------------------------------------------------
    // Section D — SIGNATURE_INVALID: a wallet that definitely declines.
    // ---------------------------------------------------------------
    {
        const wallet = { signPsbt: async () => ({ signed: false, reason: 'user declined to sign' }) };
        const broadcaster = { broadcast: async () => ({ broadcast: true }) };
        const components = makeComponents({ wallet, broadcaster });
        const { coordinator, publicationCatalog } = makeCoordinator(components);
        publishContent(publicationCatalog, { id: 'pub-declined', hash: 'cc' });

        const result = await coordinator.publishAnchor('pub-declined', { utxos, changeAddress, utxoDetails, changeScriptPubKey });

        assert(result.state === BitcoinAnchorPublicationLifecycleState.SIGNATURE_INVALID, '25. a declined wallet reports SIGNATURE_INVALID');
        assert(result.reason === 'user declined to sign', '26. the wallet\'s own reason is preserved');
        assert(result.anchor === null, '27. no anchor is created');
    }
    console.log('✓ Section D: SIGNATURE_INVALID — a wallet that definitely declines stops the pipeline');

    // ---------------------------------------------------------------
    // Section E — FINALIZATION_FAILED: structurally intact but
    // cryptographically wrong signature stops the pipeline before the
    // broadcaster is ever consulted.
    // ---------------------------------------------------------------
    {
        let broadcastCalls = 0;
        const wallet = makeCryptographicallyBrokenWallet(keyA, nonce1);
        const broadcaster = { broadcast: async () => { broadcastCalls += 1; return { broadcast: true }; } };
        const components = makeComponents({ wallet, broadcaster });
        const { coordinator, publicationCatalog } = makeCoordinator(components);
        publishContent(publicationCatalog, { id: 'pub-badsig', hash: 'dd' });

        const result = await coordinator.publishAnchor('pub-badsig', { utxos, changeAddress, utxoDetails, changeScriptPubKey });

        assert(result.state === BitcoinAnchorPublicationLifecycleState.FINALIZATION_FAILED, '28. a cryptographically wrong signature reports FINALIZATION_FAILED');
        assert(result.reachedStage === BitcoinAnchorPublicationLifecycleState.SIGNED, '29. SIGNED was reached — the signature passed structural inspection — before cryptographic finalization failed');
        assert(/does not cryptographically verify/.test(result.reason), '30. the reason names cryptographic verification failing');
        assert(broadcastCalls === 0, '31. the broadcaster is never consulted');
    }
    console.log('✓ Section E: FINALIZATION_FAILED — a structurally intact but cryptographically wrong signature stops the pipeline before broadcast');

    // ---------------------------------------------------------------
    // Section F — BROADCAST_REJECTED: a real, fully finalized transaction
    // the network refuses never reaches CreatePublicationAnchorUseCase.
    // ---------------------------------------------------------------
    {
        const wallet = makeRealSigningWallet({ [keyA.hash160Hex]: keyA }, [nonce1]);
        const broadcaster = makeRejectingBroadcaster('transaction rejected as non-standard');
        const components = makeComponents({ wallet, broadcaster });
        const { coordinator, publicationCatalog, anchorCatalog } = makeCoordinator(components);
        publishContent(publicationCatalog, { id: 'pub-rejected', hash: 'ee' });

        const result = await coordinator.publishAnchor('pub-rejected', { utxos, changeAddress, utxoDetails, changeScriptPubKey });

        assert(result.state === BitcoinAnchorPublicationLifecycleState.BROADCAST_REJECTED, '32. a definite rejection reports BROADCAST_REJECTED');
        assert(result.reachedStage === BitcoinAnchorPublicationLifecycleState.FINALIZED, '33. FINALIZED was reached — real, valid transaction bytes existed — before the network refused them');
        assert(result.reason === 'transaction rejected as non-standard', '34. the broadcaster\'s own reason is preserved');
        assert(typeof result.txid === 'string' && /^[0-9a-f]{64}$/i.test(result.txid), '35. the real, cryptographically-derived txid is still reported even though it was never accepted');
        assert(result.anchor === null, '36. no anchor is created for a rejected broadcast');
        assert(anchorCatalog.list().length === 0, '37. the anchor catalog was never touched');
    }
    console.log('✓ Section F: BROADCAST_REJECTED — a real, finalized transaction the network refuses never reaches CreatePublicationAnchorUseCase');

    // ---------------------------------------------------------------
    // Section G — BROADCAST_UNAVAILABLE: distinguishable from a definite
    // rejection.
    // ---------------------------------------------------------------
    {
        const wallet = makeRealSigningWallet({ [keyA.hash160Hex]: keyA }, [nonce1]);
        const broadcaster = makeUnavailableBroadcaster('no connectivity to the broadcasting endpoint');
        const components = makeComponents({ wallet, broadcaster });
        const { coordinator, publicationCatalog, anchorCatalog } = makeCoordinator(components);
        publishContent(publicationCatalog, { id: 'pub-unavailable', hash: 'ff' });

        const result = await coordinator.publishAnchor('pub-unavailable', { utxos, changeAddress, utxoDetails, changeScriptPubKey });

        assert(result.state === BitcoinAnchorPublicationLifecycleState.BROADCAST_UNAVAILABLE, '38. an unreachable broadcasting endpoint reports BROADCAST_UNAVAILABLE, distinguishable from a rejection');
        assert(result.reachedStage === BitcoinAnchorPublicationLifecycleState.FINALIZED, '39. FINALIZED was still reached');
        assert(result.anchor === null && anchorCatalog.list().length === 0, '40. no anchor is created while broadcast status is merely unknown');
    }
    console.log('✓ Section G: BROADCAST_UNAVAILABLE — distinguishable from a definite rejection, no anchor is ever created either way');

    console.log('\nAll BitcoinAnchorPublicationLifecycle tests passed.');
}

run().catch((error) => {
    console.error('BitcoinAnchorPublicationLifecycle.test.js FAILED:', error);
    process.exitCode = 1;
});
