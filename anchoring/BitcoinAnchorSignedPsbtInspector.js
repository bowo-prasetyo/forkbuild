import { BitcoinAnchorPsbtSerializer } from './BitcoinAnchorPsbtSerializer.js';

const HEX_PATTERN = /^[0-9a-f]+$/i;
const BASE64_ALPHABET = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/';
const PSBT_MAGIC = [0x70, 0x73, 0x62, 0x74, 0xff]; // 'p' 's' 'b' 't' 0xff — BIP174's own fixed magic bytes.
const PSBT_GLOBAL_UNSIGNED_TX = 0x00;
const PSBT_IN_NON_WITNESS_UTXO = 0x00;
const PSBT_IN_WITNESS_UTXO = 0x01;
const PSBT_IN_PARTIAL_SIG = 0x02;
const PSBT_IN_SIGHASH_TYPE = 0x03;
const PSBT_IN_FINAL_SCRIPTSIG = 0x07;
const PSBT_IN_FINAL_SCRIPTWITNESS = 0x08;

// 0.8.50 — Explicit Bitcoin Wallet Signing.
//
// anchoring/BitcoinAnchorPsbtSerializer.js (0.8.49) can turn a description
// into real unsigned BIP174 bytes, and its own `parse()` deliberately
// refuses to read anything BACK that carries `partialSig`,
// `finalScriptSig`, or `finalScriptWitness` — its own header names exactly
// why: "reading a real, wallet-produced (signed or partially-signed) PSBT
// is a future concern this class does not take on." This class is that
// future concern, and nothing more than it:
//
//   original description { globalUnsignedTx, inputs }   (0.8.48/0.8.49)
//           │
//           ├──────────────────────────────┐
//           │                              │
//           ▼                              ▼
//   (handed to a wallet, elsewhere)   BitcoinAnchorSignedPsbtInspector
//           │                              │
//           ▼                              │
//   a claimed SIGNED PSBT ───────────────►inspect()
//                                          │
//                                          ▼
//                              { intact: true, signedInputs }
//                            | { intact: false, reason }
//
// THE ONE INVARIANT THIS CLASS EXISTS TO CHECK: transaction identity must
// remain stable across signing. `inspect()` independently decodes a signed
// PSBT's own PSBT_GLOBAL_UNSIGNED_TX section — which, in Bitcoin's own
// transaction format, already carries every output's real value and
// script, and every input's real (txid, vout, sequence), regardless of
// signing state — and compares it, field by field, in order, against the
// ORIGINAL description this codebase itself built. A wallet that signs a
// DIFFERENT transaction (a substituted output, a changed value, a
// reordered input) is refused here, before this codebase ever calls the
// result "signed." This is a precise structural check, never a trust
// score: either the bytes name the same transaction or they do not.
//
// NEVER TRUSTS THE WALLET'S OWN CLAIM. A signed PSBT is external,
// untrusted input — the identical posture anchoring/BitcoinAnchorPublisher.js
// already holds toward its own injected `broadcaster`. `inspect()` never
// throws for a structurally-different-but-well-formed signed PSBT, nor for
// bytes it cannot parse at all — both are reported as `{ intact: false,
// reason }`, an operational outcome, never an exception. It throws only
// for `description` itself, which is always this codebase's own,
// already-known-good internal artifact (re-validated via
// anchoring/BitcoinAnchorPsbtSerializer.js#serialize(), the same
// independent-re-validation discipline every anchoring/ class before this
// one already holds).
//
// A NARROW, EXPLICIT SIGNING VOCABULARY — NOTHING GUESSED AT. This class
// recognizes exactly six BIP174 field types on an input
// (non_witness_utxo, witness_utxo, partial_sig, sighash_type,
// final_scriptsig, final_scriptwitness) and exactly one on the global map
// (unsigned_tx). A field it does not recognize — a BIP32 derivation path,
// a redeem/witness script, an xpub, any proprietary field — is refused,
// not silently ignored, exactly as anchoring/BitcoinAnchorPsbtSerializer.js
// already refuses an unrecognized field when proving its own round trip.
// A real-world wallet may well add such fields; teaching this class to
// tolerate them is a deliberate, future widening, not an oversight — see
// this file's own "Deliberately excluded."
//
// "SIGNED" MEANS "CARRIES RECOGNIZED SIGNING MATERIAL," NOT "VALID."
// `inspect()` never verifies a signature cryptographically, never checks a
// finalized input actually satisfies its own script, and never determines
// whether a PSBT is READY to broadcast — that is a real signer's and a
// future finalizer's job (see docs/Roadmap.md, "0.8.51 — Bitcoin Signed
// PSBT Finalization"). This class only checks two things per input: the
// previous-output data (`witnessUtxo`/`nonWitnessUtxo`) is byte-identical
// to what the original description already named, and at least one
// recognized signing field (`partialSig`, `finalScriptSig`, or
// `finalScriptWitness`) is now present that was not present before.
//
// EVERY OUTPUT MAP MUST BE EMPTY, ON PURPOSE. Only an input is ever
// signed in Bitcoin's own transaction format — BIP174 output maps exist to
// carry a future signer's OWN bookkeeping (a redeem/witness script, a BIP32
// path) about an output it does not yet need here, since this codebase's
// own serializer never emits one. A non-empty output map is refused,
// exactly as any other unrecognized field is.
export class BitcoinAnchorSignedPsbtInspector {
    // Resolves synchronously (no network, no async work of any kind) to
    // exactly one of:
    //
    //   { intact: true, signedInputs: [{ txid, vout, partialSigCount,
    //       hasFinalScriptSig, hasFinalScriptWitness }, ...] }
    //   { intact: false, reason }
    //
    // Throws only for a malformed `description` — this codebase's own
    // already-known-good internal artifact, independently re-validated via
    // BitcoinAnchorPsbtSerializer#serialize() exactly as every other
    // anchoring/ class re-validates what it is handed. `signedPsbt` is
    // external, untrusted wallet output: nothing about it — malformed
    // bytes, a decoding failure, a structural mismatch — is ever allowed
    // to throw. Accepts a Uint8Array, a hex string, or a base64 string for
    // `signedPsbt`, the identical trio BitcoinAnchorPsbtSerializer#parse()
    // already accepts.
    inspect({ description, signedPsbt } = {}) {
        // Independently re-validates and canonicalizes `description` —
        // never trusts that it genuinely is a real BitcoinAnchorPsbtBuilder
        // result. Throws exactly as BitcoinAnchorPsbtSerializer#serialize()
        // itself would, on the identical malformed input.
        new BitcoinAnchorPsbtSerializer().serialize(description);

        let decoded;
        try {
            decoded = decodeSignedPsbt(toBytes(signedPsbt));
        } catch (error) {
            return { intact: false, reason: `signed PSBT could not be decoded: ${error.message}` };
        }

        const txMismatch = compareUnsignedTx(description.globalUnsignedTx, decoded.globalUnsignedTx);
        if (txMismatch) {
            return { intact: false, reason: `transaction identity changed across signing: ${txMismatch}` };
        }

        if (decoded.inputs.length !== description.inputs.length) {
            return { intact: false, reason: `signed PSBT carries ${decoded.inputs.length} input map(s), expected ${description.inputs.length}` };
        }

        const signedInputs = [];
        for (let i = 0; i < description.inputs.length; i++) {
            const prevOutMismatch = comparePrevOut(description.inputs[i], decoded.inputs[i]);
            if (prevOutMismatch) {
                return { intact: false, reason: `input ${i}: ${prevOutMismatch}` };
            }
            const input = decoded.inputs[i];
            const hasSigningMaterial = input.partialSigs.length > 0 || input.finalScriptSig !== undefined || input.finalScriptWitness !== undefined;
            if (!hasSigningMaterial) {
                return { intact: false, reason: `input ${i} carries no recognized signing material (partialSig, finalScriptSig, or finalScriptWitness)` };
            }
            signedInputs.push({
                txid: input.txid,
                vout: input.vout,
                partialSigCount: input.partialSigs.length,
                hasFinalScriptSig: input.finalScriptSig !== undefined,
                hasFinalScriptWitness: input.finalScriptWitness !== undefined
            });
        }

        return { intact: true, signedInputs };
    }
}

function compareUnsignedTx(expected, actual) {
    if (actual.version !== expected.version) return `version ${actual.version} does not match the expected ${expected.version}`;
    if (actual.locktime !== expected.locktime) return `locktime ${actual.locktime} does not match the expected ${expected.locktime}`;
    if (actual.inputs.length !== expected.inputs.length) return `${actual.inputs.length} input(s) does not match the expected ${expected.inputs.length}`;
    if (actual.outputs.length !== expected.outputs.length) return `${actual.outputs.length} output(s) does not match the expected ${expected.outputs.length}`;
    for (let i = 0; i < expected.inputs.length; i++) {
        const e = expected.inputs[i], a = actual.inputs[i];
        if (a.txid !== e.txid || a.vout !== e.vout) return `input ${i} (${a.txid}:${a.vout}) does not match the expected input ${i} (${e.txid}:${e.vout})`;
        if (a.sequence !== e.sequence) return `input ${i} sequence ${a.sequence} does not match the expected ${e.sequence}`;
    }
    for (let i = 0; i < expected.outputs.length; i++) {
        const e = expected.outputs[i], a = actual.outputs[i];
        if (a.scriptPubKey !== e.scriptPubKey) return `output ${i} scriptPubKey does not match the expected output ${i}`;
        if (a.valueSats !== e.valueSats) return `output ${i} value ${a.valueSats} does not match the expected ${e.valueSats}`;
    }
    return null;
}

function comparePrevOut(expected, actual) {
    if ('witnessUtxo' in expected) {
        if (!actual.witnessUtxo) return 'expected a witnessUtxo but the signed PSBT does not carry one';
        if (actual.witnessUtxo.scriptPubKey !== expected.witnessUtxo.scriptPubKey || actual.witnessUtxo.valueSats !== expected.witnessUtxo.valueSats) {
            return 'witnessUtxo no longer matches the original description';
        }
        return null;
    }
    if (!actual.nonWitnessUtxo) return 'expected a nonWitnessUtxo but the signed PSBT does not carry one';
    if (actual.nonWitnessUtxo !== expected.nonWitnessUtxo) return 'nonWitnessUtxo no longer matches the original description';
    return null;
}

// ---------------------------------------------------------------------
// Decoding: a signed/partially-signed PSBT's bytes into a structure this
// class can compare — deliberately never a general-purpose PSBT reader,
// see this file's own header on its narrow, explicit vocabulary.
// ---------------------------------------------------------------------

function decodeSignedPsbt(bytes) {
    let offset = 0;
    PSBT_MAGIC.forEach((expected, index) => {
        if (bytes[offset + index] !== expected) {
            throw new Error('not a valid PSBT — bad magic bytes');
        }
    });
    offset += PSBT_MAGIC.length;

    const globalMap = readKeyValueMap(bytes, offset);
    offset = globalMap.offset;
    if (globalMap.entries.length !== 1 || globalMap.entries[0].key.length !== 1 || globalMap.entries[0].key[0] !== PSBT_GLOBAL_UNSIGNED_TX) {
        throw new Error('global map must carry exactly PSBT_GLOBAL_UNSIGNED_TX and nothing else — an unrecognized global field (e.g. an xpub) is not supported');
    }
    const globalUnsignedTx = decodeUnsignedTx(globalMap.entries[0].value);

    const inputs = globalUnsignedTx.inputs.map((globalInput, index) => {
        const inputMap = readKeyValueMap(bytes, offset);
        offset = inputMap.offset;
        return decodeSignedInputMap(inputMap.entries, globalInput, index);
    });

    globalUnsignedTx.outputs.forEach((_, index) => {
        const outputMap = readKeyValueMap(bytes, offset);
        offset = outputMap.offset;
        if (outputMap.entries.length !== 0) {
            throw new Error(`output ${index} carries a field this class does not recognize — output maps are expected to stay empty`);
        }
    });

    if (offset !== bytes.length) {
        throw new Error('trailing bytes after the last output map');
    }

    return { globalUnsignedTx, inputs };
}

function decodeSignedInputMap(entries, globalInput, index) {
    const result = { txid: globalInput.txid, vout: globalInput.vout, partialSigs: [] };
    let witnessUtxoEntry, nonWitnessUtxoEntry, sighashEntry, finalScriptSigEntry, finalScriptWitnessEntry;

    entries.forEach((entry) => {
        const keyType = entry.key[0];
        if (keyType === PSBT_IN_WITNESS_UTXO && entry.key.length === 1) { witnessUtxoEntry = entry; return; }
        if (keyType === PSBT_IN_NON_WITNESS_UTXO && entry.key.length === 1) { nonWitnessUtxoEntry = entry; return; }
        if (keyType === PSBT_IN_PARTIAL_SIG && entry.key.length > 1) { result.partialSigs.push({ pubkey: bytesToHex(entry.key.slice(1)), signature: bytesToHex(entry.value) }); return; }
        if (keyType === PSBT_IN_SIGHASH_TYPE && entry.key.length === 1) { sighashEntry = entry; return; }
        if (keyType === PSBT_IN_FINAL_SCRIPTSIG && entry.key.length === 1) { finalScriptSigEntry = entry; return; }
        if (keyType === PSBT_IN_FINAL_SCRIPTWITNESS && entry.key.length === 1) { finalScriptWitnessEntry = entry; return; }
        throw new Error(`input ${index} carries a field this class does not recognize (key type 0x${keyType.toString(16).padStart(2, '0')}) — a BIP32 derivation path, redeem/witness script, or proprietary field is not supported`);
    });

    if (!witnessUtxoEntry && !nonWitnessUtxoEntry) {
        throw new Error(`input ${index} carries neither witnessUtxo nor nonWitnessUtxo`);
    }
    if (witnessUtxoEntry && nonWitnessUtxoEntry) {
        throw new Error(`input ${index} carries both witnessUtxo and nonWitnessUtxo`);
    }
    if (witnessUtxoEntry) {
        const valueSats = readUInt64LE(witnessUtxoEntry.value, 0);
        const script = readVarBytes(witnessUtxoEntry.value, 8);
        result.witnessUtxo = { scriptPubKey: bytesToHex(script.bytes), valueSats };
    } else {
        result.nonWitnessUtxo = bytesToHex(nonWitnessUtxoEntry.value);
    }
    if (sighashEntry) {
        result.sighashType = readUInt32LE(sighashEntry.value, 0);
    }
    if (finalScriptSigEntry) {
        result.finalScriptSig = bytesToHex(finalScriptSigEntry.value);
    }
    if (finalScriptWitnessEntry) {
        result.finalScriptWitness = bytesToHex(finalScriptWitnessEntry.value);
    }
    return result;
}

function decodeUnsignedTx(raw) {
    let offset = 0;
    const version = readUInt32LE(raw, offset); offset += 4;

    const inputCount = readCompactSize(raw, offset); offset = inputCount.offset;
    const inputs = [];
    for (let i = 0; i < inputCount.value; i++) {
        const txidBytes = raw.slice(offset, offset + 32); offset += 32;
        const vout = readUInt32LE(raw, offset); offset += 4;
        const scriptSigLen = readCompactSize(raw, offset); offset = scriptSigLen.offset;
        if (scriptSigLen.value !== 0) {
            throw new Error(`PSBT_GLOBAL_UNSIGNED_TX input ${i} must have an empty scriptSig — a non-empty one is not an unsigned transaction`);
        }
        const sequence = readUInt32LE(raw, offset); offset += 4;
        inputs.push({ txid: bytesToHex(reverseBytes(txidBytes)), vout, sequence });
    }

    const outputCount = readCompactSize(raw, offset); offset = outputCount.offset;
    const outputs = [];
    for (let i = 0; i < outputCount.value; i++) {
        const valueSats = readUInt64LE(raw, offset); offset += 8;
        const script = readVarBytes(raw, offset); offset = script.offset;
        outputs.push({ scriptPubKey: bytesToHex(script.bytes), valueSats });
    }

    const locktime = readUInt32LE(raw, offset); offset += 4;
    if (offset !== raw.length) {
        throw new Error('trailing bytes after the unsigned transaction');
    }
    return { version, locktime, inputs, outputs };
}

function readKeyValueMap(bytes, offset) {
    const entries = [];
    for (;;) {
        const keyLen = readCompactSize(bytes, offset);
        offset = keyLen.offset;
        if (keyLen.value === 0) {
            break; // the 0x00 separator that ends this map
        }
        const key = bytes.slice(offset, offset + keyLen.value); offset += keyLen.value;
        const valueLen = readCompactSize(bytes, offset); offset = valueLen.offset;
        const value = bytes.slice(offset, offset + valueLen.value); offset += valueLen.value;
        entries.push({ key, value });
    }
    return { entries, offset };
}

function readVarBytes(bytes, offset) {
    const len = readCompactSize(bytes, offset);
    const dataBytes = bytes.slice(len.offset, len.offset + len.value);
    return { bytes: dataBytes, offset: len.offset + len.value };
}

// ---------------------------------------------------------------------
// Byte-level primitives — deliberately duplicated, not imported, from
// anchoring/BitcoinAnchorPsbtSerializer.js: the identical
// self-containment every anchoring/ class before this one already holds
// (e.g. BitcoinAnchorPsbtBuilder.js duplicates HEX_PATTERN/TXID_PATTERN
// from BitcoinAnchorTransactionBuilder.js rather than importing them).
// ---------------------------------------------------------------------

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

function reverseBytes(bytes) {
    return Uint8Array.from(bytes).reverse();
}

function readUInt32LE(bytes, offset) {
    return new DataView(bytes.buffer, bytes.byteOffset + offset, 4).getUint32(0, true);
}

function readUInt64LE(bytes, offset) {
    return Number(new DataView(bytes.buffer, bytes.byteOffset + offset, 8).getBigUint64(0, true));
}

function readCompactSize(bytes, offset) {
    const first = bytes[offset];
    if (first === undefined) {
        throw new Error('unexpected end of PSBT bytes');
    }
    if (first < 0xfd) {
        return { value: first, offset: offset + 1 };
    }
    if (first === 0xfd) {
        return { value: new DataView(bytes.buffer, bytes.byteOffset + offset + 1, 2).getUint16(0, true), offset: offset + 3 };
    }
    if (first === 0xfe) {
        return { value: new DataView(bytes.buffer, bytes.byteOffset + offset + 1, 4).getUint32(0, true), offset: offset + 5 };
    }
    return { value: Number(new DataView(bytes.buffer, bytes.byteOffset + offset + 1, 8).getBigUint64(0, true)), offset: offset + 9 };
}

function base64ToBytes(base64) {
    const clean = base64.replace(/=+$/, '');
    const bytes = [];
    let buffer = 0;
    let bits = 0;
    for (const char of clean) {
        const value = BASE64_ALPHABET.indexOf(char);
        if (value === -1) {
            throw new Error('invalid base64 character');
        }
        buffer = (buffer << 6) | value;
        bits += 6;
        if (bits >= 8) {
            bits -= 8;
            bytes.push((buffer >> bits) & 0xff);
        }
    }
    return Uint8Array.from(bytes);
}

function isNonEmptyEvenHex(value) {
    return typeof value === 'string' && value.length > 0 && value.length % 2 === 0 && HEX_PATTERN.test(value);
}

function toBytes(psbt) {
    if (psbt instanceof Uint8Array) {
        return psbt;
    }
    if (typeof psbt === 'string') {
        return isNonEmptyEvenHex(psbt) ? hexToBytes(psbt) : base64ToBytes(psbt);
    }
    throw new Error('signedPsbt must be a Uint8Array, a hex string, or a base64 string');
}
