const CHARSET = 'qpzry9x8gf2tvdw0s3jn54khce6mua7l';
const GEN = [0x3b6a57b2, 0x26508e6d, 0x1ea119fa, 0x3d4233dd, 0x2a1462b3];
const HRP_NETWORKS = { bc: 'mainnet', tb: 'testnet' };

// 0.8.62 — Explicit Reviewed Bitcoin Anchor Signing UI.
//
// anchoring/BitcoinAnchorPsbtBuilder.js's own header (0.8.48) named this
// gap directly, three times over, and left it deliberately unbuilt: "NO
// ADDRESS DECODING, STILL... The change output's real scriptPubKey is
// always caller-supplied... this class validates SHAPE... never the
// cryptographic correspondence between an address and a script." anchoring/
// BitcoinWalletFundingObserver.js's own header (0.8.60) named the same gap
// again, one stage earlier: "the base58check or bech32 checksum-and-payload
// decoding this codebase's anchoring/ layer still deliberately does not
// perform anywhere... That gap is unchanged and still unbuilt." This file
// is that missing piece, and nothing more than it:
//
//   a bech32 (BIP173) native segwit address string
//   (a connected wallet's own `.account`, or `.changeAccount` — anchoring/
//    BitcoinWalletFundingObserver.js's own, unchanged 0.8.60 output)
//           │
//           ▼
//   decodeP2wpkhScriptPubKey()                          (THIS FILE — new)
//           │
//           ▼
//   { decoded: true, scriptPubKeyHex, network }
// | { decoded: false, reason }
//
// ONLY NATIVE SEGWIT V0, 20-BYTE PROGRAMS (P2WPKH) — NOTHING ELSE. This
// file decodes exactly the one address shape anchoring/
// BitcoinAnchorSignedPsbtFinalizer.js (0.8.51) can ever cryptographically
// finalize a signature for: bech32 (never bech32m), witness version 0, a
// 20-byte witness program. A P2WSH program (32 bytes), any taproot address
// (witness version 1, bech32m-encoded), and any base58check (P2PKH/P2SH)
// address are all real, valid Bitcoin address shapes this function simply
// does not decode — reported as an honest `decoded: false`, never guessed
// at or partially decoded. Extending this to other address shapes is real,
// separately sized future work — see docs/Roadmap.md, 0.8.62's own
// "Deliberately excluded" list.
//
// A REAL ADDRESS FAILING TO DECODE IS AN OPERATIONAL FACT, NEVER A
// CALLER-CONTRACT VIOLATION. Unlike anchoring/BitcoinAnchorPsbtBuilder.js's
// own `plan`/`utxoDetails` (this codebase's own already-known-good internal
// artifacts, which throw when malformed), the `address` this function reads
// is always an untrusted, external string — a wallet extension's own
// report of its account, which this codebase's own anchoring/
// BitcoinWalletFundingObserver.js already treats as opaque (its own
// `inferScriptTypeFromAddress()` reads only the address's public prefix,
// never its checksum). A malformed, wrong-network, or wrong-witness-version
// address is therefore always reported as `{ decoded: false, reason }` —
// this function never throws.
//
// A HAND-ROLLED BECH32 IMPLEMENTATION, ON PURPOSE — THE IDENTICAL
// SELF-CONTAINMENT ANCHORING/BitcoinAnchorSignedPsbtFinalizer.js (0.8.51)
// ALREADY HOLDS FOR SHA-256/RIPEMD-160/secp256k1. This codebase has no
// package manager and installs nothing — BIP173's own polymod checksum and
// 5-bit/8-bit regrouping are implemented directly from the specification
// below, never imported from anywhere.
//
// CASE IS CHECKED, NEVER SILENTLY NORMALIZED FROM A MIXED-CASE INPUT.
// BIP173 requires a bech32 string to be entirely lowercase or entirely
// uppercase — never mixed — because mixed case is exactly the failure mode
// the checksum exists to catch (a typo, or a corrupted copy/paste). This
// function refuses a mixed-case address as a decode failure, the same way
// it refuses a bad checksum, rather than silently lowercasing it and
// hiding a possible transcription error.
export function decodeP2wpkhScriptPubKey(address) {
    if (typeof address !== 'string' || address.length < 8 || address.length > 90) {
        return { decoded: false, reason: 'address must be a bech32-shaped string' };
    }
    if (address !== address.toLowerCase() && address !== address.toUpperCase()) {
        return { decoded: false, reason: 'address mixes uppercase and lowercase — not a valid bech32 string' };
    }
    const lower = address.toLowerCase();

    const separator = lower.lastIndexOf('1');
    if (separator < 1 || separator + 7 > lower.length) {
        return { decoded: false, reason: 'address has no valid bech32 separator, or too short a data part' };
    }
    const hrp = lower.slice(0, separator);
    const dataPart = lower.slice(separator + 1);

    const network = HRP_NETWORKS[hrp];
    if (!network) {
        return { decoded: false, reason: `address has an unrecognized human-readable prefix "${hrp}" — expected "bc" (mainnet) or "tb" (testnet)` };
    }

    const data = [];
    for (const char of dataPart) {
        const value = CHARSET.indexOf(char);
        if (value === -1) {
            return { decoded: false, reason: 'address data part contains a character outside the bech32 charset' };
        }
        data.push(value);
    }

    if (!verifyBech32Checksum(hrp, data)) {
        return { decoded: false, reason: 'address failed bech32 checksum verification' };
    }

    const witnessVersion = data[0];
    const program = convertBits(data.slice(1, data.length - 6), 5, 8, false);
    if (!program) {
        return { decoded: false, reason: 'address witness program could not be regrouped into whole bytes' };
    }
    if (witnessVersion !== 0) {
        return { decoded: false, reason: `address uses witness version ${witnessVersion}, not the version 0 (native segwit) this codebase can presently sign for` };
    }
    if (program.length !== 20) {
        return { decoded: false, reason: `address witness program is ${program.length} bytes, not the 20 bytes a P2WPKH program requires (32 bytes would be P2WSH, unsupported)` };
    }

    const programHex = program.map((byte) => byte.toString(16).padStart(2, '0')).join('');
    return { decoded: true, scriptPubKeyHex: '0014' + programHex, network };
}

function bech32Polymod(values) {
    let chk = 1;
    for (const value of values) {
        const top = chk >>> 25;
        chk = ((chk & 0x1ffffff) << 5) ^ value;
        for (let i = 0; i < 5; i++) {
            if ((top >>> i) & 1) chk ^= GEN[i];
        }
    }
    return chk >>> 0;
}

function hrpExpand(hrp) {
    const result = [];
    for (const char of hrp) result.push(char.charCodeAt(0) >>> 5);
    result.push(0);
    for (const char of hrp) result.push(char.charCodeAt(0) & 31);
    return result;
}

function verifyBech32Checksum(hrp, data) {
    return bech32Polymod(hrpExpand(hrp).concat(data)) === 1;
}

// Regroups a sequence of 5-bit values into 8-bit bytes (or vice versa,
// unused here) — BIP173's own, standard algorithm. `pad: false` (this
// file's only use) requires the leftover bits to be all zero, exactly as
// BIP173 mandates for a witness program's own encoding; a non-zero
// remainder means the address was not really produced by encoding whole
// bytes in the first place, so this returns `null` rather than silently
// truncating it.
function convertBits(data, fromBits, toBits, pad) {
    let acc = 0;
    let bits = 0;
    const result = [];
    const maxValue = (1 << toBits) - 1;
    for (const value of data) {
        if (value < 0 || (value >> fromBits) !== 0) return null;
        acc = (acc << fromBits) | value;
        bits += fromBits;
        while (bits >= toBits) {
            bits -= toBits;
            result.push((acc >>> bits) & maxValue);
        }
    }
    if (pad) {
        if (bits > 0) result.push((acc << (toBits - bits)) & maxValue);
    } else if (bits >= fromBits || ((acc << (toBits - bits)) & maxValue)) {
        return null;
    }
    return result;
}
