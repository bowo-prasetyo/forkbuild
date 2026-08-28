const HEX_PATTERN = /^0x[0-9a-fA-F]*$/;
const EIP1559_ENVELOPE_TYPE = 0x02;

// 0.8.94 — Explicit Base Signed Transaction Verification & Finalization.
//
// `base/BaseTransactionSigner.js` (0.8.93) hands a wallet a
// transactionRequest and gets back `{ signed: true, rawTransaction }` —
// a hex string, and NOTHING is ever done with it beyond that: no
// decoding, no structural check, no cryptography. This file is the
// canonical codec boundary this milestone's own proposal named directly
// — "isolate: signed bytes → EIP-1559 transaction codec → structured
// signed transaction" — and it does exactly, and only, that one
// transformation:
//
//   "0x02f8...aabbcc"            a claimed SIGNED, EIP-1559 raw
//   (external, UNTRUSTED bytes)   transaction — untrusted wallet output
//           │
//           ▼
//   decodeBaseSignedTransaction()          (THIS FILE — new)
//           │
//           ├─ RLP-decode the envelope, strictly (canonical encoding only)
//           ├─ recompute the EIP-1559 signing hash from the raw decoded
//           │  field bytes — never from anything a caller supplies
//           ├─ cryptographically recover the sender from (r, s, yParity)
//           │  via secp256k1 public-key recovery — NEVER read a `from`
//           │  field, because an EIP-1559 transaction has none: the
//           │  sender is derived from the signature, or it is not known
//           │  at all
//           ▼
//   { decoded: true, transaction: { type, chainId, nonce, gasLimit,
//       maxFeePerGas, maxPriorityFeePerGas, to, value, data,
//       accessListLength, from, transactionHash } }
// | { decoded: false, reason, cryptographicFailure }
//
// A STRUCTURED SIGNED TRANSACTION, NEVER A COMPARISON. This module knows
// nothing about `application/BasePublicationTransactionReview.js`, a
// `plan`, or what "matches the reviewed transaction" means — it turns
// bytes into facts, and stops. Comparing those facts against an
// already-constructed plan is `base/BaseSignedTransactionFinalizer.js`'s
// own, separate job — the identical division `anchoring/
// BitcoinAnchorSignedPsbtInspector.js` (structural facts) and `anchoring/
// BitcoinAnchorSignedPsbtFinalizer.js` (comparison + cryptography) already
// hold one chain over, collapsed here into "decode" vs. "finalize"
// because an EIP-1559 transaction, unlike a PSBT, carries no separate
// unsigned/signed representation to inspect in between.
//
// NEVER TRUSTS THE SIGNED BYTES. `rawTransaction` is external, untrusted
// wallet output — the identical posture `anchoring/
// BitcoinAnchorSignedPsbtInspector.js` already holds toward a claimed
// signed PSBT. `decodeBaseSignedTransaction()` never throws for
// malformed, truncated, or cryptographically invalid input; every such
// failure is reported as `{ decoded: false, reason, cryptographicFailure }`.
//
// ONLY CANONICAL RLP IS ACCEPTED. A length prefix using the long form
// where the short form would do, a leading zero byte inside a length
// field, or a single byte in [0x00, 0x7f] wrapped in an unnecessary
// one-byte string header are all refused as malformed, exactly as a real
// Ethereum node's own RLP decoder refuses them — never silently accepted
// with an ambiguous, non-canonical interpretation.
//
// ONLY TYPE 0x02 (EIP-1559) IS RECOGNIZED. `base/BaseTransactionSigner.js`
// only ever builds a `type: '0x2'` transactionRequest (0.8.91's own
// `maxFeePerGas`/`maxPriorityFeePerGas` fields already committed this
// codebase to EIP-1559 pricing) — a legacy transaction (no type prefix,
// an RLP list directly) or an EIP-2930 transaction (type 0x01) is refused
// by name, `cryptographicFailure: false`, rather than mis-decoded as
// something it is not.
//
// A NON-EMPTY ACCESS LIST IS REFUSED, NEVER SILENTLY IGNORED.
// `base/BaseTransactionSigner.js` never builds an access list of any kind
// — a signed transaction carrying one differs, in real gas-cost and
// storage-warming semantics, from anything this codebase ever asked a
// wallet to sign. `accessListLength` is reported so a caller can see the
// fact, but a non-empty list is treated by `base/
// BaseSignedTransactionFinalizer.js` as exactly the kind of drift 0.8.94
// exists to catch — see that file's own header.
//
// CONTRACT CREATION IS REFUSED. `base/BasePublicationTransactionPlanner.js`
// (0.8.91) never builds a plan with an empty `to` — every Base publication
// plan is a self-transfer with a real destination address (see that
// file's own header, "THE ONE ARCHITECTURAL DECISION THIS FILE MAKES:
// SELF-TRANSFER"). A signed transaction whose `to` field is empty names a
// contract-creation transaction — categorically outside anything this
// codebase ever asked a wallet to sign — and is refused by name.
//
// THE SENDER IS RECOVERED, NEVER READ. See `docs/Roadmap.md`, 0.8.94:
// "Do not trust the signed transaction's claimed `from`." An EIP-1559
// transaction's serialized fields are `chainId, nonce,
// maxPriorityFeePerGas, maxFeePerGas, gasLimit, to, value, data,
// accessList, signatureYParity, signatureR, signatureS` — there is no
// `from` field anywhere in that list. `transaction.from` below is always
// the output of this file's own `ecrecover()` + `addressForPoint()` — a
// real secp256k1 public-key recovery over the SAME bytes this file itself
// just decoded — never a caller-supplied string, and never trusted from
// anywhere else.
//
// A CRYPTOGRAPHIC FAILURE IS REPORTED DISTINCTLY FROM A STRUCTURAL ONE.
// `cryptographicFailure: true` marks exactly, and only, a failure
// discovered AFTER the RLP structure itself decoded cleanly — an
// out-of-range `r`/`s`, an `x`-coordinate with no valid curve point, or a
// recovered point at infinity. Every other failure (bad RLP, wrong field
// count, non-canonical encoding, an unsupported envelope type, contract
// creation) is `cryptographicFailure: false` — a structural fact,
// established before cryptography is ever attempted. `base/
// BaseSignedTransactionFinalizer.js` reads this one flag directly to set
// its own `invalidSignature`, rather than re-deriving the distinction
// from reason-string substrings — see that file's own header,
// "`invalidSignature` NAMES A GENUINE CRYPTOGRAPHIC FACT."
//
// REAL CRYPTOGRAPHY, FROM FIRST PRINCIPLES, ZERO DEPENDENCIES. Exactly as
// `anchoring/BitcoinAnchorSignedPsbtFinalizer.js`'s own header already
// holds for Bitcoin's secp256k1/SHA-256/RIPEMD-160 — this codebase has no
// package manager and no external crypto library anywhere in it. Keccak-256
// (Ethereum's own, with the ORIGINAL Keccak `0x01` padding — NEVER NIST
// SHA3's `0x06`) and secp256k1 public-key recovery are implemented here,
// in plain JavaScript, deliberately duplicated rather than imported from
// `anchoring/BitcoinAnchorSignedPsbtFinalizer.js`'s own unrelated
// (verification-only, not recovery) secp256k1 arithmetic — the identical
// self-containment every anchoring/ class already holds, extended here to
// the wholly separate base/ directory. Cross-checked, during this
// milestone's own development, against Node's own `crypto` module (its
// NIST SHA3-256 for the Keccak-f[1600] permutation itself — identical
// except for the domain-separator byte — and its OpenSSL secp256k1
// support for point arithmetic, ECDSA verification, and recovery), and
// against well-known public test vectors (RLP's own canonical
// `["cat","dog"]` vector; `keccak256("")`; the address belonging to
// private key `1`).
//
// SYNCHRONOUS, PURE, NO NETWORK, NO STATE OF ITS OWN. `decodeBaseSignedTransaction()`
// reads no clock, consults no RPC, and holds no history across calls.
// Calling it twice with the byte-identical `rawTransaction` returns a
// byte-identical result.
export function decodeBaseSignedTransaction(rawTransaction) {
    if (typeof rawTransaction !== 'string' || !isNonEmptyEvenHex(rawTransaction)) {
        return structural('rawTransaction must be a non-empty, even-length 0x-prefixed hex string');
    }

    let rawBytes;
    try {
        rawBytes = hexToBytes(rawTransaction.slice(2));
    } catch (error) {
        return structural(`rawTransaction could not be read as hex: ${error.message}`);
    }
    if (rawBytes.length === 0) {
        return structural('rawTransaction carries no bytes');
    }
    if (rawBytes[0] !== EIP1559_ENVELOPE_TYPE) {
        return structural(`unsupported transaction envelope type 0x${rawBytes[0].toString(16).padStart(2, '0')} — only EIP-1559 (type 0x02) is currently supported`);
    }

    let decodedList;
    try {
        const result = rlpDecodeItem(rawBytes, 1);
        if (result.offset !== rawBytes.length) {
            throw new Error('trailing bytes after the RLP payload');
        }
        decodedList = result.value;
    } catch (error) {
        return structural(`signed transaction could not be RLP-decoded: ${error.message}`);
    }

    if (!Array.isArray(decodedList) || decodedList.length !== 12) {
        return structural(`expected exactly 12 EIP-1559 fields, found ${Array.isArray(decodedList) ? decodedList.length : 'a non-list value'}`);
    }
    const [chainIdBytes, nonceBytes, maxPriorityFeePerGasBytes, maxFeePerGasBytes, gasLimitBytes,
        toBytes, valueBytes, dataBytes, accessList, yParityBytes, rBytes, sBytes] = decodedList;

    if (!Array.isArray(accessList)) {
        return structural('accessList must be an RLP list');
    }
    if (toBytes.length === 0) {
        return structural('signed transaction carries no `to` address — contract-creation transactions are not supported');
    }
    if (toBytes.length !== 20) {
        return structural(`\`to\` must be a 20-byte address, found ${toBytes.length} bytes`);
    }
    if (yParityBytes.length > 1 || (yParityBytes.length === 1 && yParityBytes[0] > 1)) {
        return structural('signatureYParity must be 0 or 1');
    }

    // Recompute the signing hash from the RAW DECODED BYTES of the first
    // nine fields — never from anything reconstructed from a caller's own
    // plan. Because rlpDecodeItem() above accepts only canonical RLP,
    // re-encoding these exact byte values reproduces the exact bytes the
    // wallet itself RLP-encoded and signed.
    const unsignedPayload = concatBytes([
        Uint8Array.from([EIP1559_ENVELOPE_TYPE]),
        rlpEncodeItem([chainIdBytes, nonceBytes, maxPriorityFeePerGasBytes, maxFeePerGasBytes, gasLimitBytes, toBytes, valueBytes, dataBytes, accessList])
    ]);
    const signingHash = keccak256(unsignedPayload);

    const r = bytesToBigInt(rBytes);
    const s = bytesToBigInt(sBytes);
    const yParity = yParityBytes.length === 0 ? 0 : yParityBytes[0];

    let recoveredPoint;
    try {
        recoveredPoint = ecrecover(signingHash, r, s, yParity);
    } catch (error) {
        return { decoded: false, reason: `signature does not cryptographically recover to a valid public key: ${error.message}`, cryptographicFailure: true };
    }

    const from = addressForPoint(recoveredPoint);
    const transactionHash = '0x' + bytesToHex(keccak256(rawBytes));

    return {
        decoded: true,
        transaction: Object.freeze({
            type: 'eip1559',
            chainId: Number(bytesToBigInt(chainIdBytes)),
            nonce: Number(bytesToBigInt(nonceBytes)),
            maxPriorityFeePerGas: bytesToBigInt(maxPriorityFeePerGasBytes).toString(10),
            maxFeePerGas: bytesToBigInt(maxFeePerGasBytes).toString(10),
            gasLimit: Number(bytesToBigInt(gasLimitBytes)),
            to: '0x' + bytesToHex(toBytes),
            value: bytesToBigInt(valueBytes).toString(10),
            data: '0x' + bytesToHex(dataBytes),
            accessListLength: accessList.length,
            from,
            transactionHash
        })
    };
}

function structural(reason) {
    return { decoded: false, reason, cryptographicFailure: false };
}

// ---------------------------------------------------------------------
// Ethereum address derivation — keccak256 of the 64-byte uncompressed
// public key (x||y, no 0x04 prefix), lowercase, last 20 bytes.
// Cross-checked against the well-known address for private key 1:
// 0x7e5f4552091a69125d5dfcb7b8c2659029395bdf.
// ---------------------------------------------------------------------
function addressForPoint(point) {
    const xy = concatBytes([bigIntTo32Bytes(point.x), bigIntTo32Bytes(point.y)]);
    return '0x' + bytesToHex(keccak256(xy)).slice(24);
}

// ---------------------------------------------------------------------
// secp256k1 ECDSA public-key recovery — SEC1 4.1.6, restricted to the
// single, overwhelmingly common case this codebase ever needs to recover
// (no `x = r + n` wraparound — astronomically rare, and never produced by
// any real signer). Cross-checked against Node's own OpenSSL-backed
// secp256k1 ECDSA signatures across many random keys and messages: every
// recovered point exactly matched the real public key. Deliberately
// duplicated, not imported, from `anchoring/BitcoinAnchorSignedPsbtFinalizer.js`'s
// own (verification-only) secp256k1 arithmetic — see this file's own
// header.
// ---------------------------------------------------------------------
const SECP256K1_P = (1n << 256n) - (1n << 32n) - 977n;
const SECP256K1_N = 0xFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFEBAAEDCE6AF48A03BBFD25E8CD0364141n;
const SECP256K1_G = {
    x: 0x79BE667EF9DCBBAC55A06295CE870B07029BFCDB2DCE28D959F2815B16F81798n,
    y: 0x483ADA7726A3C4655DA4FBFC0E1108A8FD17B448A68554199C47D08FFB10D4B8n
};

function fieldMod(a, m) { const r = a % m; return r >= 0n ? r : r + m; }

function modInverse(a, m) {
    let [oldR, r] = [fieldMod(a, m), m];
    let [oldS, s] = [1n, 0n];
    while (r !== 0n) {
        const q = oldR / r;
        [oldR, r] = [r, oldR - q * r];
        [oldS, s] = [s, oldS - q * s];
    }
    return fieldMod(oldS, m);
}

function modPow(base, exp, m) {
    let result = 1n;
    base = fieldMod(base, m);
    while (exp > 0n) {
        if (exp & 1n) result = fieldMod(result * base, m);
        exp >>= 1n;
        base = fieldMod(base * base, m);
    }
    return result;
}

function pointAdd(p1, p2) {
    if (p1 === null) return p2;
    if (p2 === null) return p1;
    if (p1.x === p2.x && fieldMod(p1.y + p2.y, SECP256K1_P) === 0n) return null; // point at infinity
    let m;
    if (p1.x === p2.x && p1.y === p2.y) {
        m = fieldMod(3n * p1.x * p1.x * modInverse(2n * p1.y, SECP256K1_P), SECP256K1_P);
    } else {
        m = fieldMod((p2.y - p1.y) * modInverse(p2.x - p1.x, SECP256K1_P), SECP256K1_P);
    }
    const x3 = fieldMod(m * m - p1.x - p2.x, SECP256K1_P);
    const y3 = fieldMod(m * (p1.x - x3) - p1.y, SECP256K1_P);
    return { x: x3, y: y3 };
}

function scalarMul(point, scalar) {
    let result = null;
    let addend = point;
    let k = scalar;
    while (k > 0n) {
        if (k & 1n) result = pointAdd(result, addend);
        addend = pointAdd(addend, addend);
        k >>= 1n;
    }
    return result;
}

// Recovers the full curve point for a given x-coordinate, choosing the
// root whose parity matches `wantOdd`. Throws for an x not on the curve.
function decompressGivenX(x, wantOdd) {
    if (x >= SECP256K1_P) {
        throw new Error('x-coordinate is not less than the field prime');
    }
    const ySquared = fieldMod(x * x * x + 7n, SECP256K1_P);
    let y = modPow(ySquared, (SECP256K1_P + 1n) / 4n, SECP256K1_P); // valid because p ≡ 3 (mod 4)
    if (fieldMod(y * y, SECP256K1_P) !== ySquared) {
        throw new Error('point is not on the secp256k1 curve');
    }
    if ((y % 2n === 1n) !== wantOdd) y = SECP256K1_P - y;
    return y;
}

// SEC1 4.1.6: Q = r^-1 * (s*R - e*G), computed here as
// r^-1*s*R + (-e*r^-1)*G — the standard Ethereum ecrecover, restricted to
// recovery id 0/1 (yParity directly names R's own y-parity; the "x = r + n"
// case is never produced by a real signer and is not attempted here).
function ecrecover(hashBytes, r, s, yParity) {
    if (r < 1n || r >= SECP256K1_N || s < 1n || s >= SECP256K1_N) {
        throw new Error('signature r/s is out of the valid range [1, n-1]');
    }
    const y = decompressGivenX(r, yParity === 1);
    const R = { x: r, y };
    const e = bytesToBigInt(hashBytes);
    const rInv = modInverse(r, SECP256K1_N);
    const u1 = fieldMod(SECP256K1_N - fieldMod(e, SECP256K1_N), SECP256K1_N); // -e mod n
    const negE_rInv = fieldMod(u1 * rInv, SECP256K1_N);
    const s_rInv = fieldMod(s * rInv, SECP256K1_N);
    const Q = pointAdd(scalarMul(SECP256K1_G, negE_rInv), scalarMul(R, s_rInv));
    if (Q === null) {
        throw new Error('recovered point is the point at infinity');
    }
    return Q;
}

// ---------------------------------------------------------------------
// Keccak-256 — Ethereum's own hash, NOT NIST SHA3-256. Identical
// Keccak-f[1600] permutation to SHA3 (cross-checked against Node's own
// `crypto.createHash('sha3-256')` across many inputs, including
// multi-block ones, using this same implementation with the domain byte
// swapped to SHA3's 0x06), but padded with Keccak's ORIGINAL domain
// separator byte, 0x01 — never SHA3's 0x06. Independently cross-checked
// against the well-known `keccak256("")` vector,
// c5d2460186f7233c927e7db2dcc703c0e500b653ca82273b7bfad8045d85a470.
// ---------------------------------------------------------------------
const KECCAK_RATE_BYTES = 136; // 1088-bit rate for a 256-bit output (capacity 512 bits)
const KECCAK_OUTPUT_BYTES = 32;
const KECCAK_DOMAIN_SEPARATOR = 0x01;
const KECCAK_MASK64 = (1n << 64n) - 1n;

const KECCAK_ROUND_CONSTANTS = [
    0x0000000000000001n, 0x0000000000008082n, 0x800000000000808an, 0x8000000080008000n,
    0x000000000000808bn, 0x0000000080000001n, 0x8000000080008081n, 0x8000000000008009n,
    0x000000000000008an, 0x0000000000000088n, 0x0000000080008009n, 0x000000008000000an,
    0x000000008000808bn, 0x800000000000008bn, 0x8000000000008089n, 0x8000000000008003n,
    0x8000000000008002n, 0x8000000000000080n, 0x000000000000800an, 0x800000008000000an,
    0x8000000080008081n, 0x8000000000008080n, 0x0000000080000001n, 0x8000000080008008n
];

// Keccak's own rotation-offset table, r[x][y] — the Keccak reference
// implementation's linear KeccakRhoOffsets[25] table (lane index x+5y),
// reshaped here into [x][y] form.
const KECCAK_RHO_OFFSETS = [
    [0, 36, 3, 41, 18],
    [1, 44, 10, 45, 2],
    [62, 6, 43, 15, 61],
    [28, 55, 25, 21, 56],
    [27, 20, 39, 8, 14]
];

function rotl64(value, amount) {
    const n = BigInt(amount % 64);
    if (n === 0n) return value & KECCAK_MASK64;
    return ((value << n) | (value >> (64n - n))) & KECCAK_MASK64;
}

function keccakRound(state, roundConstant) {
    // theta
    const C = [0, 1, 2, 3, 4].map((x) => state[x][0] ^ state[x][1] ^ state[x][2] ^ state[x][3] ^ state[x][4]);
    const D = [0, 1, 2, 3, 4].map((x) => C[(x + 4) % 5] ^ rotl64(C[(x + 1) % 5], 1));
    const afterTheta = Array.from({ length: 5 }, () => Array(5).fill(0n));
    for (let x = 0; x < 5; x++) for (let y = 0; y < 5; y++) afterTheta[x][y] = (state[x][y] ^ D[x]) & KECCAK_MASK64;

    // rho + pi (combined: B[y][(2x+3y) mod 5] = rotl(A[x][y], offset[x][y]))
    const afterPi = Array.from({ length: 5 }, () => Array(5).fill(0n));
    for (let x = 0; x < 5; x++) {
        for (let y = 0; y < 5; y++) {
            const newX = y, newY = (2 * x + 3 * y) % 5;
            afterPi[newX][newY] = rotl64(afterTheta[x][y], KECCAK_RHO_OFFSETS[x][y]);
        }
    }

    // chi
    const afterChi = Array.from({ length: 5 }, () => Array(5).fill(0n));
    for (let x = 0; x < 5; x++) {
        for (let y = 0; y < 5; y++) {
            afterChi[x][y] = (afterPi[x][y] ^ (((~afterPi[(x + 1) % 5][y]) & KECCAK_MASK64) & afterPi[(x + 2) % 5][y])) & KECCAK_MASK64;
        }
    }

    // iota
    afterChi[0][0] = (afterChi[0][0] ^ roundConstant) & KECCAK_MASK64;
    return afterChi;
}

function keccakF1600(state) {
    for (let round = 0; round < 24; round++) {
        state = keccakRound(state, KECCAK_ROUND_CONSTANTS[round]);
    }
    return state;
}

function keccak256(messageBytes) {
    const blockCount = Math.floor(messageBytes.length / KECCAK_RATE_BYTES) + 1;
    const paddedLength = blockCount * KECCAK_RATE_BYTES;
    const padded = new Uint8Array(paddedLength);
    padded.set(messageBytes);
    padded[messageBytes.length] ^= KECCAK_DOMAIN_SEPARATOR;
    padded[paddedLength - 1] ^= 0x80;

    let state = Array.from({ length: 5 }, () => Array(5).fill(0n));
    for (let offset = 0; offset < paddedLength; offset += KECCAK_RATE_BYTES) {
        for (let i = 0; i < KECCAK_RATE_BYTES / 8; i++) {
            const x = i % 5, y = Math.floor(i / 5);
            let lane = 0n;
            for (let b = 7; b >= 0; b--) lane = (lane << 8n) | BigInt(padded[offset + i * 8 + b]);
            state[x][y] = (state[x][y] ^ lane) & KECCAK_MASK64;
        }
        state = keccakF1600(state);
    }

    const out = new Uint8Array(KECCAK_OUTPUT_BYTES);
    let written = 0;
    for (let i = 0; written < KECCAK_OUTPUT_BYTES; i++) {
        const x = i % 5, y = Math.floor(i / 5);
        let lane = state[x][y];
        for (let b = 0; b < 8 && written < KECCAK_OUTPUT_BYTES; b++) {
            out[written++] = Number(lane & 0xffn);
            lane >>= 8n;
        }
    }
    return out;
}

// ---------------------------------------------------------------------
// RLP — strict, canonical-only decode; a matching encode used solely to
// reconstruct the exact unsigned payload bytes from already-decoded
// (therefore already-canonical) field values. Cross-checked against the
// Ethereum wiki's own canonical vectors (`RLP("dog") = 0x83646f67`,
// `RLP(["cat","dog"]) = 0xc88363617483646f67`) and extensive encode/decode
// round-tripping.
// ---------------------------------------------------------------------
function rlpEncodeLength(length, offset) {
    if (length < 56) return Uint8Array.from([offset + length]);
    const lengthBytes = minimalBigEndianBytes(BigInt(length));
    return concatBytes([Uint8Array.from([offset + 55 + lengthBytes.length]), lengthBytes]);
}

function rlpEncodeItem(item) {
    if (item instanceof Uint8Array) {
        if (item.length === 1 && item[0] < 0x80) return item;
        return concatBytes([rlpEncodeLength(item.length, 0x80), item]);
    }
    if (Array.isArray(item)) {
        const body = concatBytes(item.map(rlpEncodeItem));
        return concatBytes([rlpEncodeLength(body.length, 0xc0), body]);
    }
    throw new Error('rlpEncodeItem: item must be a Uint8Array or an Array');
}

// Decodes exactly one RLP item starting at `offset`. Strict: rejects any
// non-canonical encoding (a single byte < 0x80 wrapped in a one-byte
// string header, a leading zero in a long-form length, or a long form
// used where the short form would do) rather than accepting an ambiguous
// interpretation. Throws for any malformed input — the caller here
// (`decodeBaseSignedTransaction()`) always catches it and reports the
// operational, never-throwing `{ decoded: false, ... }` shape.
function rlpDecodeItem(bytes, offset) {
    if (offset >= bytes.length) throw new Error('unexpected end of RLP input');
    const prefix = bytes[offset];

    if (prefix < 0x80) {
        return { value: bytes.slice(offset, offset + 1), offset: offset + 1 };
    }
    if (prefix < 0xb8) {
        const length = prefix - 0x80;
        if (length === 1) {
            if (offset + 1 >= bytes.length) throw new Error('unexpected end of RLP input');
            if (bytes[offset + 1] < 0x80) throw new Error('non-canonical RLP: a single byte below 0x80 must be encoded directly, not wrapped in a string header');
        }
        const start = offset + 1;
        if (start + length > bytes.length) throw new Error('unexpected end of RLP input');
        return { value: bytes.slice(start, start + length), offset: start + length };
    }
    if (prefix < 0xc0) {
        const lengthOfLength = prefix - 0xb7;
        const lengthStart = offset + 1;
        if (lengthStart + lengthOfLength > bytes.length) throw new Error('unexpected end of RLP input');
        const lengthBytes = bytes.slice(lengthStart, lengthStart + lengthOfLength);
        if (lengthBytes[0] === 0) throw new Error('non-canonical RLP: leading zero byte in a long-form length');
        const length = Number(bytesToBigInt(lengthBytes));
        if (length < 56) throw new Error('non-canonical RLP: long form used for a length that fits the short form');
        const start = lengthStart + lengthOfLength;
        if (start + length > bytes.length) throw new Error('unexpected end of RLP input');
        return { value: bytes.slice(start, start + length), offset: start + length };
    }
    if (prefix < 0xf8) {
        const length = prefix - 0xc0;
        const start = offset + 1;
        if (start + length > bytes.length) throw new Error('unexpected end of RLP input');
        return { value: rlpDecodeList(bytes, start, start + length), offset: start + length };
    }
    const lengthOfLength = prefix - 0xf7;
    const lengthStart = offset + 1;
    if (lengthStart + lengthOfLength > bytes.length) throw new Error('unexpected end of RLP input');
    const lengthBytes = bytes.slice(lengthStart, lengthStart + lengthOfLength);
    if (lengthBytes[0] === 0) throw new Error('non-canonical RLP: leading zero byte in a long-form length');
    const length = Number(bytesToBigInt(lengthBytes));
    if (length < 56) throw new Error('non-canonical RLP: long form used for a length that fits the short form');
    const start = lengthStart + lengthOfLength;
    if (start + length > bytes.length) throw new Error('unexpected end of RLP input');
    return { value: rlpDecodeList(bytes, start, start + length), offset: start + length };
}

function rlpDecodeList(bytes, start, end) {
    const items = [];
    let offset = start;
    while (offset < end) {
        const item = rlpDecodeItem(bytes, offset);
        items.push(item.value);
        offset = item.offset;
    }
    if (offset !== end) throw new Error('RLP list length does not match its own contents');
    return items;
}

// ---------------------------------------------------------------------
// Byte-level primitives.
// ---------------------------------------------------------------------
function isNonEmptyEvenHex(value) {
    return typeof value === 'string' && value.length > 2 && value.length % 2 === 0 && HEX_PATTERN.test(value);
}

function hexToBytes(hex) {
    const bytes = new Uint8Array(hex.length / 2);
    for (let i = 0; i < bytes.length; i++) {
        bytes[i] = parseInt(hex.substr(i * 2, 2), 16);
    }
    return bytes;
}

function bytesToHex(bytes) {
    return Array.from(bytes, (byte) => byte.toString(16).padStart(2, '0')).join('');
}

function bytesToBigInt(bytes) {
    let value = 0n;
    for (const b of bytes) value = (value << 8n) | BigInt(b);
    return value;
}

function bigIntTo32Bytes(value) {
    const out = new Uint8Array(32);
    for (let i = 31; i >= 0; i--) {
        out[i] = Number(value & 0xffn);
        value >>= 8n;
    }
    return out;
}

function minimalBigEndianBytes(value) {
    if (value === 0n) return new Uint8Array(0);
    const bytes = [];
    while (value > 0n) {
        bytes.unshift(Number(value & 0xffn));
        value >>= 8n;
    }
    return Uint8Array.from(bytes);
}

function concatBytes(arrays) {
    const total = arrays.reduce((sum, array) => sum + array.length, 0);
    const result = new Uint8Array(total);
    let offset = 0;
    for (const array of arrays) {
        result.set(array, offset);
        offset += array.length;
    }
    return result;
}
