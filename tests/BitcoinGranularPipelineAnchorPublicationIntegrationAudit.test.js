import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { BitcoinWalletFundingObserver } from '../anchoring/BitcoinWalletFundingObserver.js';
import { BitcoinAnchorTransactionBuilder } from '../anchoring/BitcoinAnchorTransactionBuilder.js';
import { BitcoinAnchorPsbtBuilder } from '../anchoring/BitcoinAnchorPsbtBuilder.js';
import { BitcoinAnchorSignedPsbtFinalizer } from '../anchoring/BitcoinAnchorSignedPsbtFinalizer.js';
import { BitcoinAnchorTransactionBroadcaster } from '../anchoring/BitcoinAnchorTransactionBroadcaster.js';
import { BitcoinWalletConnection } from '../anchoring/BitcoinWalletConnection.js';
import { BitcoinInjectedProviderWalletAdapter } from '../anchoring/BitcoinInjectedProviderWalletAdapter.js';
import { BitcoinAnchorEvidenceView } from '../anchoring/BitcoinAnchorEvidenceView.js';
import { BitcoinOpReturnProofVerifier } from '../anchoring/BitcoinOpReturnProofVerifier.js';
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
import { BitcoinAnchorPublicationCoordinator } from '../application/BitcoinAnchorPublicationCoordinator.js';
import { BitcoinAnchorPublicationLifecycleState } from '../application/BitcoinAnchorPublicationLifecycleState.js';
import { CreatePublicationAnchorUseCase } from '../application/CreatePublicationAnchorUseCase.js';
import { DecentralizedPublication } from '../core/DecentralizedPublication.js';
import { ContentReference } from '../core/ContentReference.js';
import { PublicationAnchor } from '../core/PublicationAnchor.js';
import { LocalPublicationCatalog } from '../application/LocalPublicationCatalog.js';
import { LocalPublicationAnchorCatalog } from '../application/LocalPublicationAnchorCatalog.js';
import { LocalIdentityProvider } from '../identity/LocalIdentityProvider.js';
import { LocalAuthorizationVerifier } from '../identity/LocalAuthorizationVerifier.js';
import { StorageProvider } from '../storage/StorageProvider.js';
import { publicationsPageFiles } from './support/SourceFileGroups.js';

// 0.9.512 — Bitcoin Granular Pipeline Anchor Publication Integration Audit.
//
// The audit that motivated this milestone found Bitcoin's real granular
// transaction pipeline (fund -> construct -> review -> connect a wallet ->
// sign -> finalize -> broadcast, 0.8.47 through 0.8.64) could execute the
// full anchoring operation but never minted the corresponding Publication
// Anchor — application/BitcoinAnchorPublicationCoordinator.js (0.8.53)
// already existed as the intended bridge but was reachable from nowhere in
// ui/main.js. This audit proves the bridge is now ACTIVATED, not replaced:
//
//   Section A: Production reachability — ui/main.js constructs the real
//              coordinator from this app's own shared catalogs, and
//              ui/views/DecentralizedPublicationsView.js calls its new
//              publishBroadcastedAnchor() method exactly once, immediately
//              after a real BROADCASTED outcome, never from a passive
//              projection.
//   Section B: FLAGSHIP — the complete, real pipeline (funding through a
//              UniSat-shaped wallet adapter, genuine secp256k1 signing,
//              finalization, broadcast) reaches the coordinator and mints
//              a real, cataloged core/PublicationAnchor.js.
//   Section C: Identity fidelity — the anchor's own proof.txid is the
//              exact real txid the pipeline produced; contentHash is
//              exactly the publication's own, never a caller-supplied one.
//   Section D: Lifecycle boundary — publishBroadcastedAnchor() requires
//              broadcasted === true and a real txid, thrown before the
//              publication is even looked up; production wiring never
//              calls it for a REJECTED/UNAVAILABLE/FAILED broadcast.
//   Section E: Failure semantics — a rejected or unavailable granular
//              broadcast never produces an anchor.
//   Section F: Existing evidence — anchoring/BitcoinAnchorEvidenceView.js
//              already describes the freshly minted anchor, unchanged.
//   Section G: Existing verification — anchoring/BitcoinOpReturnProofVerifier.js
//              independently verifies the minted anchor against the real
//              broadcast bytes, unchanged.
//   Section H: No duplicate anchor — a second publishBroadcastedAnchor()
//              call for the identical publicationId/txid returns the
//              already-cataloged anchor rather than minting a second one.
//   Section I: No second Bitcoin write path — the production-shaped
//              coordinator instance (exactly as ui/main.js constructs it)
//              cannot sign, finalize, or broadcast anything itself.
//   Section J: Base/Arweave isolation — no other substrate's file changed.

let assertionCount = 0;
function assert(condition, message) {
    assertionCount += 1;
    if (!condition) throw new Error(`ASSERT FAILED: ${message}`);
}
function n(message) {
    return `${assertionCount + 1}. ${message}`;
}
async function expectRejects(promise, message) {
    let threw = false;
    try { await promise; } catch (_e) { threw = true; }
    assert(threw, message);
}

const SOURCE_ROOT = fileURLToPath(new URL('../', import.meta.url));
async function source(relativePath) {
    return readFile(path.join(SOURCE_ROOT, relativePath), 'utf8');
}
function codeOnly(src) {
    return src.split('\n').filter((line) => !line.trim().startsWith('//')).join('\n');
}

// ---------------------------------------------------------------------
// A wholly independent bech32 ENCODER, and a wholly independent SHA-256 /
// RIPEMD-160 / secp256k1 implementation — duplicated, not imported, from
// tests/BitcoinAnchorBroadcastUX.test.js (0.8.64), which duplicated them,
// not imported, from every other Bitcoin test file in this codebase — the
// identical self-containment discipline each one already holds.
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
// Extracts the OP_RETURN output's pushed hex data directly from real,
// broadcast segwit transaction bytes — proving anchoring/
// BitcoinOpReturnProofVerifier.js's own independent verification (Section
// G below) against the exact bytes the granular pipeline's own broadcaster
// received, not merely a PSBT description.
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

function utxo(txid, vout, valueSats) {
    return { txid: txid.repeat(64).slice(0, 64), vout, valueSats, scriptType: 'p2wpkh' };
}
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
    const calls = [];
    return {
        calls,
        broadcast(rawTransactionHex) {
            calls.push(rawTransactionHex);
            return handler(rawTransactionHex, calls.length);
        }
    };
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
        id, contentKind: 'forkbuild.structure', contentReference: new ContentReference({ hash })
    });
    publicationCatalog.add(publication);
    return publication;
}

async function run() {
    // -------------------------------------------------------------
    // Section A — Production reachability. Confirms, by direct source
    // inspection of ui/main.js and ui/views/DecentralizedPublicationsView.js,
    // that the real granular Bitcoin pipeline is now wired all the way
    // into application/BitcoinAnchorPublicationCoordinator.js.
    // -------------------------------------------------------------
    {
        const mainSrc = codeOnly(await source('ui/main.js'));
        const viewSrc = codeOnly((await Promise.all(publicationsPageFiles().map((file) => source(file)))).join('\n'));

        assert(mainSrc.includes("import { CreateBitcoinAnchorPublicationCoordinatorUseCase } from '../application/CreateBitcoinAnchorPublicationCoordinatorUseCase.js';"),
            n('ui/main.js imports CreateBitcoinAnchorPublicationCoordinatorUseCase'));
        assert(/new CreateBitcoinAnchorPublicationCoordinatorUseCase\(\)\.execute\(\{[^}]*publicationCatalog[^}]*createPublicationAnchorUseCase[^}]*publicationAnchorCatalog[^}]*\}\)/s.test(mainSrc),
            n('ui/main.js constructs the coordinator from this app\'s own shared publicationCatalog/createPublicationAnchorUseCase/publicationAnchorCatalog'));
        assert(mainSrc.includes("app.provide('bitcoinAnchorPublicationCoordinator', bitcoinAnchorPublicationCoordinator);"),
            n('ui/main.js provides the real coordinator instance to the app'));

        assert(viewSrc.includes("inject('bitcoinAnchorPublicationCoordinator', null)"),
            n('ui/views/DecentralizedPublicationsView.js injects the coordinator'));
        assert(viewSrc.includes('bitcoinAnchorPublicationCoordinator.publishBroadcastedAnchor('),
            n('the view calls publishBroadcastedAnchor() on the real, injected coordinator'));

        // The call must live inside broadcastBitcoinAnchorTransaction() —
        // the SAME explicit-click action that produces the real BROADCASTED
        // outcome — never inside a `function bitcoin...View(` pure
        // projection, which would mean repeated rendering could mint
        // duplicate anchors (see Section H).
        const broadcastFnMatch = viewSrc.match(/async function broadcastBitcoinAnchorTransaction\(\) \{[\s\S]*?\n {4}\}\n/);
        assert(broadcastFnMatch, n('broadcastBitcoinAnchorTransaction() is a locatable, self-contained function'));
        assert(broadcastFnMatch[0].includes('publishBroadcastedAnchor('),
            n('publishBroadcastedAnchor() is called from inside broadcastBitcoinAnchorTransaction() itself'));
        assert(broadcastFnMatch[0].includes('BitcoinAnchorBroadcastState.BROADCASTED'),
            n('the call is guarded by the real BROADCASTED state, never unconditional'));

        // No pure `function bitcoin...View(...)` projection calls it.
        const viewFnBodies = viewSrc.match(/function bitcoinAnchor\w*View\([^)]*\) \{[^}]*\}/g) || [];
        assert(viewFnBodies.every((body) => !body.includes('publishBroadcastedAnchor')),
            n('no pure bitcoinAnchor*View() projection function ever calls publishBroadcastedAnchor()'));
    }
    console.log('✓ Section A: production reachability — ui/main.js wires the real coordinator; ui/views/DecentralizedPublicationsView.js calls publishBroadcastedAnchor() exactly from the broadcast action, never from a passive projection');

    const keyA = realKey(0x1a2b3c4d5e6f7890a1b2c3d4e5f60718293a4b5c6d7e8f90112233445566778n);
    const aliceAddress = encodeSegwitAddress('bc', 0, keyA.hash160Bytes);
    const nonce1 = 0x9f8e7d6c5b4a39281706f5e4d3c2b1a0918273645362718293a4b5c6d7e8f90n;
    const txidSeed = (byte) => byte.toString(16).padStart(2, '0').repeat(32);

    // Builds one genuinely, cryptographically finalized transaction via the
    // REAL end-to-end granular pipeline — observe funding, construct,
    // review, connect a UniSat-SHAPED wallet (anchoring/
    // BitcoinInjectedProviderWalletAdapter.js, unchanged), sign, finalize.
    // Mirrors tests/BitcoinAnchorBroadcastUX.test.js's own
    // buildRealFinalizedTransaction() helper exactly, plus reporting the
    // network the review itself decoded, needed by
    // publishBroadcastedAnchor() below.
    async function buildRealFinalizedTransaction({ publicationId, contentHash }) {
        const builder = new BitcoinAnchorTransactionBuilder({ network: 'mainnet', feeRateSatsPerVByte: 1 });
        const psbtBuilder = new BitcoinAnchorPsbtBuilder();

        const observer = new BitcoinWalletFundingObserver({ fundingSource: fakeFundingSource([utxo('aa', 0, 150000)]) });
        const observation = await observer.observeFunding({ account: aliceAddress, network: 'mainnet' });
        assert(observation.state === BitcoinAnchorFundingObservationState.OBSERVED, 'sanity: a real fundingSource produces a real OBSERVED observation');

        const constructionCoordinator = new BitcoinAnchorTransactionConstructionCoordinator({ bitcoinAnchorTransactionBuilder: builder });
        const constructed = constructionCoordinator.construct({ publicationId, contentHash, fundingObservation: observation });
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
        assert(connectResult.connected === true, 'sanity: Alice connects her (UniSat-shaped) wallet');

        const signingCoordinator = new BitcoinAnchorReviewedSigningCoordinator();
        const signOutcome = await signingCoordinator.sign({
            wallet: connection.wallet, description: reviewOutcome.description, reviewedUnsignedPsbtHex: reviewOutcome.review.unsignedPsbtHex
        });
        assert(signOutcome.state === BitcoinAnchorReviewedSigningState.SIGNED, 'sanity: the wallet genuinely, cryptographically signs the exact PSBT that was reviewed');

        const finalizationCoordinator = new BitcoinAnchorSignedPsbtFinalizationCoordinator({ bitcoinAnchorSignedPsbtFinalizer: new BitcoinAnchorSignedPsbtFinalizer() });
        const finalizeOutcome = finalizationCoordinator.finalize({ description: reviewOutcome.description, signedPsbt: signOutcome.psbt });
        assert(finalizeOutcome.state === BitcoinAnchorSignedPsbtFinalizationState.FINALIZED, 'sanity: a genuinely signed PSBT, produced by the real end-to-end pipeline, cryptographically finalizes');

        return {
            finalized: true, txid: finalizeOutcome.txid, rawTransaction: finalizeOutcome.rawTransaction,
            network: reviewOutcome.description.network
        };
    }

    function freshBroadcastCoordinator(broadcaster) {
        const bitcoinAnchorTransactionBroadcaster = new BitcoinAnchorTransactionBroadcaster({ broadcaster });
        return new BitcoinAnchorBroadcastCoordinator({ bitcoinAnchorTransactionBroadcaster });
    }

    // The PRODUCTION-SHAPED coordinator — constructed EXACTLY the way
    // ui/main.js constructs it: only publicationCatalog/
    // createPublicationAnchorUseCase/publicationAnchorCatalog, none of the
    // six one-shot-pipeline collaborators publishAnchor() alone needs. Used
    // by every section below except where a section deliberately builds a
    // differently-shaped instance of its own.
    function makeProductionShapedCoordinator() {
        const alice = makeIdentity('Alice');
        const publicationCatalog = new LocalPublicationCatalog(new InMemoryStorageProvider());
        const anchorCatalog = new LocalPublicationAnchorCatalog(new InMemoryStorageProvider());
        const authVerifier = new LocalAuthorizationVerifier();
        const createPublicationAnchorUseCase = new CreatePublicationAnchorUseCase(publicationCatalog, alice, authVerifier, anchorCatalog);
        const coordinator = new BitcoinAnchorPublicationCoordinator({
            publicationCatalog, createPublicationAnchorUseCase, publicationAnchorCatalog: anchorCatalog
        });
        return { coordinator, publicationCatalog, anchorCatalog };
    }

    let flagshipAnchor = null;
    let flagshipRawTransactionHex = null;
    let flagshipContentHash = null;
    let flagshipTxid = null;

    // -------------------------------------------------------------
    // Section B — FLAGSHIP: the complete, real granular pipeline reaches
    // the coordinator and mints a real, cataloged PublicationAnchor.
    // -------------------------------------------------------------
    {
        const contentHash = 'f00dcafedeadbeef';
        const publicationId = 'pub-flagship';
        const { coordinator, publicationCatalog, anchorCatalog } = makeProductionShapedCoordinator();
        publishContent(publicationCatalog, { id: publicationId, hash: contentHash });

        const finalized = await buildRealFinalizedTransaction({ publicationId, contentHash });
        const fake = fakeBroadcaster(() => ({ broadcast: true, txid: finalized.txid }));
        const broadcastCoordinator = freshBroadcastCoordinator(fake);
        const broadcastOutcome = await broadcastCoordinator.broadcast(finalized);
        assert(broadcastOutcome.state === BitcoinAnchorBroadcastState.BROADCASTED, 'sanity: the real, finalized transaction broadcasts successfully');

        const mintResult = await coordinator.publishBroadcastedAnchor(publicationId, {
            broadcasted: true, txid: broadcastOutcome.txid, network: finalized.network
        });

        assert(mintResult.state === BitcoinAnchorPublicationLifecycleState.BROADCASTED, n('publishBroadcastedAnchor() reports BROADCASTED'));
        assert(mintResult.reachedStage === BitcoinAnchorPublicationLifecycleState.BROADCASTED, n('reachedStage agrees with state'));
        assert(mintResult.anchor instanceof PublicationAnchor, n('a real PublicationAnchor is produced'));
        assert(mintResult.anchor.anchorType === 'bitcoin-op-return', n('the anchor carries the bitcoin-op-return anchorType'));
        assert(anchorCatalog.list().length === 1 && anchorCatalog.get(mintResult.anchor.id), n('the anchor is really catalogued, not merely returned'));

        flagshipAnchor = mintResult.anchor;
        flagshipRawTransactionHex = finalized.rawTransaction.hex;
        flagshipContentHash = contentHash;
        flagshipTxid = broadcastOutcome.txid;
    }
    console.log('✓ Section B (FLAGSHIP): fund -> construct -> review -> connect a UniSat-shaped wallet -> sign -> finalize -> broadcast -> BitcoinAnchorPublicationCoordinator.publishBroadcastedAnchor() -> a real, cataloged PublicationAnchor');

    // -------------------------------------------------------------
    // Section C — Identity fidelity.
    // -------------------------------------------------------------
    {
        assert(flagshipAnchor.contentHash === flagshipContentHash, n('the anchor\'s contentHash is exactly the publication\'s own, real contentHash'));
        assert(flagshipAnchor.proof.txid === flagshipTxid, n('the anchor\'s proof.txid is exactly the real txid the granular pipeline produced'));
        assert(flagshipAnchor.locator === `bitcoin:${flagshipTxid}`, n('the anchor\'s locator names the exact real txid'));

        const opReturnData = extractOpReturnDataFromRawTxHex(flagshipRawTransactionHex);
        assert(opReturnData !== null, n('the real broadcast transaction carries an OP_RETURN output'));
        assert(opReturnData.toLowerCase() === flagshipContentHash.toLowerCase(),
            n('the OP_RETURN output the real broadcaster received carries exactly the publication\'s contentHash, byte for byte'));
    }
    console.log('✓ Section C: identity fidelity — the anchor references the real Bitcoin transaction identity, and the anchored contentHash is exactly the intended hash');

    // -------------------------------------------------------------
    // Section D — Lifecycle boundary.
    // -------------------------------------------------------------
    {
        const { coordinator, publicationCatalog } = makeProductionShapedCoordinator();
        publishContent(publicationCatalog, { id: 'pub-boundary', hash: 'aa' });

        await expectRejects(
            coordinator.publishBroadcastedAnchor('pub-boundary', { broadcasted: false, txid: txidSeed(1), network: 'mainnet' }),
            n('publishBroadcastedAnchor() throws when broadcasted is not true')
        );
        await expectRejects(
            coordinator.publishBroadcastedAnchor('pub-boundary', { broadcasted: true, txid: null, network: 'mainnet' }),
            n('publishBroadcastedAnchor() throws when txid is missing, even if broadcasted claims true')
        );
        await expectRejects(
            coordinator.publishBroadcastedAnchor('pub-unknown', { broadcasted: true, txid: txidSeed(2), network: 'mainnet' }),
            n('publishBroadcastedAnchor() throws for an unknown publicationId')
        );
    }
    console.log('✓ Section D: lifecycle boundary — anchor creation is gated on an explicit, real broadcasted:true plus a real txid, exactly BitcoinAnchorPublicationCoordinator\'s own legitimate boundary');

    // -------------------------------------------------------------
    // Section E — Failure semantics: a rejected or unavailable granular
    // broadcast never produces an anchor, and this page's own guard (the
    // exact condition Section A confirmed lives in
    // broadcastBitcoinAnchorTransaction()) never calls the coordinator for
    // either.
    // -------------------------------------------------------------
    {
        // Mirrors the exact guard `if (bitcoinAnchorPublicationCoordinator
        // && outcome.state === BitcoinAnchorBroadcastState.BROADCASTED)`
        // Section A found in the real production source.
        async function driveProductionGuard(coordinator, publicationId, broadcastOutcome, network) {
            if (broadcastOutcome.state !== BitcoinAnchorBroadcastState.BROADCASTED) return null;
            return coordinator.publishBroadcastedAnchor(publicationId, { broadcasted: true, txid: broadcastOutcome.txid, network });
        }

        const { coordinator, publicationCatalog, anchorCatalog } = makeProductionShapedCoordinator();
        publishContent(publicationCatalog, { id: 'pub-rejected', hash: 'bb' });
        const finalizedRejected = await buildRealFinalizedTransaction({ publicationId: 'pub-rejected', contentHash: 'bb' });
        const rejectingBroadcast = await freshBroadcastCoordinator(fakeBroadcaster(() => ({ broadcast: false, reason: 'non-standard' }))).broadcast(finalizedRejected);
        assert(rejectingBroadcast.state === BitcoinAnchorBroadcastState.REJECTED, 'sanity: the network definitely refuses this transaction');
        const rejectedMint = await driveProductionGuard(coordinator, 'pub-rejected', rejectingBroadcast, finalizedRejected.network);
        assert(rejectedMint === null, n('a REJECTED broadcast never reaches publishBroadcastedAnchor()'));
        assert(anchorCatalog.list().length === 0, n('no anchor exists after a rejected broadcast'));

        publishContent(publicationCatalog, { id: 'pub-unavailable', hash: 'cc' });
        const finalizedUnavailable = await buildRealFinalizedTransaction({ publicationId: 'pub-unavailable', contentHash: 'cc' });
        const unavailableBroadcast = await freshBroadcastCoordinator(fakeBroadcaster(() => ({ broadcast: false, unavailable: true, reason: 'no connectivity' }))).broadcast(finalizedUnavailable);
        assert(unavailableBroadcast.state === BitcoinAnchorBroadcastState.UNAVAILABLE, 'sanity: the network cannot presently be reached');
        const unavailableMint = await driveProductionGuard(coordinator, 'pub-unavailable', unavailableBroadcast, finalizedUnavailable.network);
        assert(unavailableMint === null, n('an UNAVAILABLE broadcast never reaches publishBroadcastedAnchor()'));
        assert(anchorCatalog.list().length === 0, n('anchor-publication failure never falsely reports success — no anchor exists after either failure'));
    }
    console.log('✓ Section E: failure semantics — a rejected or unavailable granular broadcast never produces a successful anchor, and never falsely reports success');

    // -------------------------------------------------------------
    // Section F — Existing evidence: anchoring/BitcoinAnchorEvidenceView.js
    // already describes the freshly minted anchor, unchanged.
    // -------------------------------------------------------------
    {
        const evidenceView = new BitcoinAnchorEvidenceView();
        const described = evidenceView.describe(flagshipAnchor);
        assert(described.summary === 'Bitcoin', n('BitcoinAnchorEvidenceView recognizes the newly minted anchor as a Bitcoin anchor'));
        const txidField = described.fields.find((f) => f.label === 'Transaction ID');
        assert(txidField && txidField.value === flagshipTxid, n('BitcoinAnchorEvidenceView reports the anchor\'s own real txid'));
        assert(described.externalLocator && described.externalLocator.url.includes(flagshipTxid), n('BitcoinAnchorEvidenceView links to a real block explorer for this txid'));
    }
    console.log('✓ Section F: existing evidence — the newly created anchor is already inspectable through anchoring/BitcoinAnchorEvidenceView.js, unchanged');

    // -------------------------------------------------------------
    // Section G — Existing verification: anchoring/BitcoinOpReturnProofVerifier.js
    // independently verifies the minted anchor, unchanged.
    // -------------------------------------------------------------
    {
        const opReturnData = extractOpReturnDataFromRawTxHex(flagshipRawTransactionHex);
        const fetchImpl = async (url) => {
            const parsed = new URL(url);
            if (parsed.pathname.match(/\/tx\/([0-9a-f]+)$/i)?.[1] === flagshipTxid) {
                return new Response(JSON.stringify({
                    txid: flagshipTxid, vout: [opReturnEsploraOutput(opReturnData)], status: { confirmed: true, block_height: 900001 }
                }), { status: 200 });
            }
            return new Response('not found', { status: 404 });
        };
        const proofVerifier = new BitcoinOpReturnProofVerifier({ apiUrl: 'https://bob-explorer.test/api', fetchImpl });
        const verification = await proofVerifier.verify(flagshipAnchor.proof, { contentHash: flagshipContentHash });
        assert(verification.valid === true, n('BitcoinOpReturnProofVerifier independently verifies the coordinator-produced anchor against the real broadcast bytes'));
    }
    console.log('✓ Section G: existing verification — the existing Bitcoin proof verifier remains independently usable against the newly minted anchor');

    // -------------------------------------------------------------
    // Section H — No duplicate anchor: repeated lifecycle observation of
    // the SAME already-broadcast transaction never mints a second anchor.
    // -------------------------------------------------------------
    {
        const { coordinator, publicationCatalog, anchorCatalog } = makeProductionShapedCoordinator();
        const publicationId = 'pub-duplicate';
        publishContent(publicationCatalog, { id: publicationId, hash: 'dd' });
        const finalized = await buildRealFinalizedTransaction({ publicationId, contentHash: 'dd' });
        const broadcastOutcome = await freshBroadcastCoordinator(fakeBroadcaster(() => ({ broadcast: true, txid: finalized.txid }))).broadcast(finalized);

        const first = await coordinator.publishBroadcastedAnchor(publicationId, { broadcasted: true, txid: broadcastOutcome.txid, network: finalized.network });
        assert(anchorCatalog.list().length === 1, n('the first mint catalogs exactly one anchor'));

        // A second, redundant observation of the identical already-
        // broadcast fact — e.g. a duplicate event, or a UI action
        // accidentally invoked twice — must never mint a second anchor.
        const second = await coordinator.publishBroadcastedAnchor(publicationId, { broadcasted: true, txid: broadcastOutcome.txid, network: finalized.network });
        assert(anchorCatalog.list().length === 1, n('a second observation of the SAME publicationId/txid never creates a second anchor'));
        assert(second.anchor.id === first.anchor.id, n('the second call returns the SAME already-cataloged anchor, not a fresh one'));
    }
    console.log('✓ Section H: no duplicate anchor — repeated lifecycle observation of the same broadcast never creates more than one anchor');

    // -------------------------------------------------------------
    // Section I — No second Bitcoin write path: the production-shaped
    // coordinator (exactly as ui/main.js constructs it) cannot sign,
    // finalize, or broadcast anything itself — UniSat/the granular
    // pipeline remains the sole real Bitcoin write path.
    // -------------------------------------------------------------
    {
        const { coordinator, publicationCatalog } = makeProductionShapedCoordinator();
        publishContent(publicationCatalog, { id: 'pub-no-second-path', hash: 'ee' });

        await expectRejects(
            coordinator.publishAnchor('pub-no-second-path', { utxos: [utxo('ff', 0, 100000)], changeAddress: aliceAddress }),
            n('the production-shaped coordinator instance cannot run its own from-scratch publishAnchor() pipeline — it holds no signer, finalizer, or broadcaster')
        );
    }
    console.log('✓ Section I: no second Bitcoin write path — the production-shaped coordinator instance structurally cannot sign, finalize, or broadcast; the granular pipeline remains the sole real write path');

    // -------------------------------------------------------------
    // Section J — Base/Arweave isolation: this milestone's production
    // changes touch only Bitcoin's own coordinator and its two composition-
    // root call sites (plus this test file) — never a Base or Arweave file.
    // -------------------------------------------------------------
    {
        const mainSrc = codeOnly(await source('ui/main.js'));
        const viewSrc = codeOnly((await Promise.all(publicationsPageFiles().map((file) => source(file)))).join('\n'));

        assert(!/BitcoinAnchorPublicationCoordinator/.test(await source('anchoring/BaseAnchorPublisher.js')),
            n('anchoring/BaseAnchorPublisher.js was never touched by this Bitcoin-only integration'));
        assert(!/BitcoinAnchorPublicationCoordinator/.test(await source('anchoring/ArweaveAnchorPublisher.js')),
            n('anchoring/ArweaveAnchorPublisher.js was never touched by this Bitcoin-only integration'));

        // ui/main.js's own Base and Arweave wiring stays byte-for-byte
        // reachable — this milestone adds a new const/provide pair, it
        // never edits an existing one.
        assert(mainSrc.includes("const { baseAnchorPublisher } = new CreateBaseAnchorPublisherUseCase().execute({"),
            n('ui/main.js\'s own Base anchor publisher wiring is untouched'));
        assert(viewSrc.includes('async function createBaseAnchor(entry)'),
            n('ui/views/DecentralizedPublicationsView.js\'s own Base anchor creation action is untouched'));
    }
    console.log('✓ Section J: Base/Arweave isolation — no change to either substrate\'s own workflow');

    console.log(`\nAll BitcoinGranularPipelineAnchorPublicationIntegrationAudit assertions passed (${assertionCount} total).`);
}

run().catch((error) => {
    console.error('BitcoinGranularPipelineAnchorPublicationIntegrationAudit.test.js FAILED:', error);
    process.exitCode = 1;
});
