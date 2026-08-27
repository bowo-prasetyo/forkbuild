import { decodeP2wpkhScriptPubKey } from '../anchoring/BitcoinSegwitAddressScriptPubKey.js';

// 0.8.62 — Explicit Reviewed Bitcoin Anchor Signing UI.
//
// Direct, focused coverage of anchoring/BitcoinSegwitAddressScriptPubKey.js
// in isolation — the new bech32 (BIP173) decoder that finally closes the
// gap anchoring/BitcoinAnchorPsbtBuilder.js (0.8.48) and anchoring/
// BitcoinWalletFundingObserver.js (0.8.60) each named, twice over, as
// deliberately unbuilt: "no base58/bech32 decoding exists anywhere in this
// codebase." This file proves the decoder is a correct, honest INVERSE of
// bech32 encoding — never a throw for a malformed or unsupported address,
// and never a guessed scriptPubKey for anything this codebase cannot yet
// support (P2WSH, taproot, base58check).
//
//   Section A: a real mainnet P2WPKH address decodes to the exact
//              '0014' + hash160 scriptPubKey a real wallet would use.
//   Section B: a real testnet P2WPKH address decodes with network:
//              'testnet'.
//   Section C: a corrupted checksum is refused, never silently accepted.
//   Section D: a mixed-case address is refused.
//   Section E: a non-zero witness version (this codebase can only ever
//              sign for version 0) is refused.
//   Section F: a 32-byte witness program (P2WSH-shaped, not P2WPKH) is
//              refused.
//   Section G: an unrecognized human-readable prefix is refused.
//   Section H: malformed/non-string input never throws.

function assert(condition, message) {
    if (!condition) throw new Error(`ASSERT FAILED: ${message}`);
}

// ---------------------------------------------------------------------
// A wholly independent bech32 ENCODER — duplicated, not imported, from
// anchoring/BitcoinSegwitAddressScriptPubKey.js's own decoder, so this test
// proves the production decoder against addresses this file itself
// constructs from raw bytes, never against a copy of the same
// implementation it is testing.
// ---------------------------------------------------------------------

const CHARSET = 'qpzry9x8gf2tvdw0s3jn54khce6mua7l';
const GEN = [0x3b6a57b2, 0x26508e6d, 0x1ea119fa, 0x3d4233dd, 0x2a1462b3];

function polymod(values) {
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

function createChecksum(hrp, data) {
    const values = hrpExpand(hrp).concat(data).concat([0, 0, 0, 0, 0, 0]);
    const mod = polymod(values) ^ 1;
    const checksum = [];
    for (let p = 0; p < 6; p++) checksum.push((mod >>> (5 * (5 - p))) & 31);
    return checksum;
}

function convertBits(data, fromBits, toBits, pad) {
    let acc = 0, bits = 0;
    const result = [];
    const maxValue = (1 << toBits) - 1;
    for (const value of data) {
        acc = (acc << fromBits) | value;
        bits += fromBits;
        while (bits >= toBits) {
            bits -= toBits;
            result.push((acc >>> bits) & maxValue);
        }
    }
    if (pad && bits > 0) result.push((acc << (toBits - bits)) & maxValue);
    return result;
}

function encodeSegwitAddress(hrp, witnessVersion, programBytes) {
    const data = [witnessVersion].concat(convertBits(Array.from(programBytes), 8, 5, true));
    const combined = data.concat(createChecksum(hrp, data));
    return hrp + '1' + combined.map((d) => CHARSET[d]).join('');
}

function hash160Bytes(seedByte) {
    const bytes = new Uint8Array(20);
    for (let i = 0; i < 20; i++) bytes[i] = (seedByte + i) & 0xff;
    return bytes;
}

function bytesToHex(bytes) { return Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join(''); }

async function run() {
    // ---------------------------------------------------------------
    // Section A — a real mainnet P2WPKH address decodes correctly.
    // ---------------------------------------------------------------
    {
        const program = hash160Bytes(0x11);
        const address = encodeSegwitAddress('bc', 0, program);
        const result = decodeP2wpkhScriptPubKey(address);
        assert(result.decoded === true, '1. a real, well-formed mainnet P2WPKH address decodes successfully');
        assert(result.scriptPubKeyHex === '0014' + bytesToHex(program), '2. the decoded scriptPubKey is exactly OP_0 + push(20) + the witness program');
        assert(result.network === 'mainnet', '3. a "bc" prefix decodes to network "mainnet"');
    }
    console.log('✓ Section A: a real mainnet P2WPKH address decodes to its exact scriptPubKey');

    // ---------------------------------------------------------------
    // Section B — a real testnet P2WPKH address decodes with network:
    // 'testnet'.
    // ---------------------------------------------------------------
    {
        const program = hash160Bytes(0x22);
        const address = encodeSegwitAddress('tb', 0, program);
        const result = decodeP2wpkhScriptPubKey(address);
        assert(result.decoded === true, '4. a real, well-formed testnet P2WPKH address decodes successfully');
        assert(result.network === 'testnet', '5. a "tb" prefix decodes to network "testnet"');
        assert(result.scriptPubKeyHex === '0014' + bytesToHex(program), '6. the decoded scriptPubKey is exact on testnet too');
    }
    console.log('✓ Section B: a real testnet P2WPKH address decodes correctly, with network: "testnet"');

    // ---------------------------------------------------------------
    // Section C — a corrupted checksum is refused, never silently
    // accepted.
    // ---------------------------------------------------------------
    {
        const address = encodeSegwitAddress('bc', 0, hash160Bytes(0x33));
        const corrupted = address.slice(0, -1) + (address.slice(-1) === 'q' ? 'p' : 'q');
        const result = decodeP2wpkhScriptPubKey(corrupted);
        assert(result.decoded === false, '7. a single flipped checksum character is refused');
        assert(/checksum/.test(result.reason), '8. the refusal names the checksum failure');
    }
    console.log('✓ Section C: a corrupted checksum is refused');

    // ---------------------------------------------------------------
    // Section D — a mixed-case address is refused.
    // ---------------------------------------------------------------
    {
        const address = encodeSegwitAddress('bc', 0, hash160Bytes(0x44));
        const mixedCase = address.slice(0, 4) + address.slice(4).toUpperCase();
        const result = decodeP2wpkhScriptPubKey(mixedCase);
        assert(result.decoded === false, '9. a mixed-case bech32 string is refused, exactly as BIP173 requires');
    }
    console.log('✓ Section D: a mixed-case address is refused');

    // ---------------------------------------------------------------
    // Section E — a non-zero witness version is refused.
    // ---------------------------------------------------------------
    {
        const address = encodeSegwitAddress('bc', 1, hash160Bytes(0x55));
        const result = decodeP2wpkhScriptPubKey(address);
        assert(result.decoded === false, '10. a witness version other than 0 is refused — this codebase can only presently sign for native segwit v0');
        assert(/witness version/.test(result.reason), '11. the refusal names the unsupported witness version');
    }
    console.log('✓ Section E: a non-zero witness version (e.g. taproot) is refused');

    // ---------------------------------------------------------------
    // Section F — a 32-byte (P2WSH-shaped) witness program is refused.
    // ---------------------------------------------------------------
    {
        const program32 = new Uint8Array(32).fill(0x66);
        const address = encodeSegwitAddress('bc', 0, program32);
        const result = decodeP2wpkhScriptPubKey(address);
        assert(result.decoded === false, '12. a 32-byte witness program (P2WSH) is refused — only 20-byte P2WPKH programs are supported');
        assert(/20 bytes/.test(result.reason), '13. the refusal names the expected program length');
    }
    console.log('✓ Section F: a 32-byte (P2WSH-shaped) witness program is refused');

    // ---------------------------------------------------------------
    // Section G — an unrecognized human-readable prefix is refused.
    // ---------------------------------------------------------------
    {
        const address = encodeSegwitAddress('bcrt', 0, hash160Bytes(0x77));
        const result = decodeP2wpkhScriptPubKey(address);
        assert(result.decoded === false, '14. an unrecognized human-readable prefix (e.g. regtest\'s "bcrt") is refused');
        assert(/human-readable prefix/.test(result.reason), '15. the refusal names the unrecognized prefix');
    }
    console.log('✓ Section G: an unrecognized human-readable prefix is refused');

    // ---------------------------------------------------------------
    // Section H — malformed/non-string input never throws.
    // ---------------------------------------------------------------
    {
        for (const input of [null, undefined, 42, {}, [], '', 'not-bech32-at-all', 'bc1']) {
            let threw = false;
            let result;
            try {
                result = decodeP2wpkhScriptPubKey(input);
            } catch (_e) {
                threw = true;
            }
            assert(!threw, `16. decodeP2wpkhScriptPubKey(${JSON.stringify(input)}) never throws`);
            assert(result.decoded === false, `17. decodeP2wpkhScriptPubKey(${JSON.stringify(input)}) reports decoded: false, honestly`);
        }
    }
    console.log('✓ Section H: malformed or non-string input is always refused, never thrown');

    console.log('\nAll BitcoinSegwitAddressScriptPubKey tests passed.');
}

run().catch((error) => {
    console.error('BitcoinSegwitAddressScriptPubKey.test.js FAILED:', error);
    process.exitCode = 1;
});
