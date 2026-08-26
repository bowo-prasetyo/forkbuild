import { BitcoinAnchorPsbtSerializer } from './BitcoinAnchorPsbtSerializer.js';
import { BitcoinAnchorSignedPsbtInspector } from './BitcoinAnchorSignedPsbtInspector.js';

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
const SIGHASH_ALL = 0x01;
const P2WPKH_SCRIPT_PUBKEY_LENGTH = 22; // 0x00 0x14 <20-byte-hash>

// 0.8.51 — Bitcoin Signed PSBT Finalization & Cryptographic Signature
// Verification.
//
// anchoring/BitcoinAnchorSignedPsbtInspector.js (0.8.50) establishes one
// precise thing and stops, on purpose — its own header names the boundary
// exactly: "SIGNED MEANS CARRIES RECOGNIZED SIGNING MATERIAL, NOT VALID."
// It proves a claimed signed PSBT still names the same transaction and now
// carries a `partialSig`/`finalScriptSig`/`finalScriptWitness` on every
// input — never that any of it actually satisfies the script it claims to.
// This class is the boundary 0.8.50's own "Deliberately excluded" list
// already reserved for it:
//
//   { globalUnsignedTx, inputs, ... }          the original DESCRIPTION
//           │                                    (0.8.48/0.8.49)
//           │
//           ├──────────────────────────────┐
//           │                              │
//           ▼                              ▼
//   (handed to a wallet, elsewhere)   BitcoinAnchorSignedPsbtInspector
//           │                              │  structural integrity
//           ▼                              ▼
//   a claimed SIGNED PSBT ───────────► { intact: true, signedInputs }
//                                            │
//                                            ▼
//                           BitcoinAnchorSignedPsbtFinalizer  (new)
//                                            │
//                                            │  cryptographic verification
//                                            ▼
//                       { finalized: true, txid, rawTransaction }
//                     | { finalized: false, reason }
//
// AN OFFLINE CRYPTOGRAPHIC BOUNDARY, NOTHING MORE. `finalize()` performs no
// network call, imports nothing from anchoring/BitcoinAnchorPublisher.js,
// and never broadcasts. It answers exactly one question the inspector
// deliberately left open: given the signing material a wallet claims to
// have produced, does it actually satisfy the script being spent, for the
// exact sighash this transaction implies? If — and only if — every input
// answers yes, this class assembles the real, broadcastable transaction
// bytes. Broadcasting itself is explicitly the next, separately sized
// milestone — see docs/Roadmap.md, "0.8.52."
//
// DELIBERATELY NARROWED TO P2WPKH ALONE. anchoring/BitcoinAnchorPsbtBuilder.js
// already accepts three script types — `p2wpkh`, `p2tr`, `p2pkh` — because
// 0.8.47/0.8.48 only ever needed to describe a UTXO, never spend one. This
// class only cryptographically finalizes `p2wpkh` inputs. A `p2pkh` input
// requires parsing an arbitrary previous transaction's raw bytes
// (`nonWitnessUtxo`) to recover the exact scriptPubKey being spent — real
// work this milestone does not take on. A `p2tr` input requires an entirely
// different signature scheme (BIP340 Schnorr) and sighash algorithm
// (BIP341) — also real work this milestone does not take on. Both are
// refused with an explicit, named reason — `{ finalized: false, reason }`,
// never a throw, and never a result that quietly pretends success — rather
// than silently mis-finalizing, or widening this class's scope beyond what
// it can verify correctly. See "Deliberately excluded," in
// docs/Roadmap.md's own 0.8.51 entry, and this file's own tests.
//
// NEVER TRUSTS THE SIGNED PSBT'S OWN SHAPE. `signedPsbt` is external,
// untrusted input — the identical posture BitcoinAnchorSignedPsbtInspector
// already holds toward it. `finalize()` never throws for a malformed,
// incomplete, or cryptographically invalid signed PSBT; every such failure
// is reported as an operational outcome, `{ finalized: false, reason }`.
// It throws only for a malformed `description` — this codebase's own
// already-known-good internal artifact, independently re-validated via
// BitcoinAnchorPsbtSerializer#serialize(), exactly as
// BitcoinAnchorSignedPsbtInspector already does.
//
// STRUCTURAL INTEGRITY IS RE-CHECKED, NEVER ASSUMED. The very first thing
// `finalize()` does is run the exact same
// BitcoinAnchorSignedPsbtInspector#inspect() a caller could have run on its
// own — never trusting that a caller already did, and never skipping it.
// Only a signed PSBT the inspector itself calls `intact: true` is ever
// considered for cryptographic verification.
//
// REAL CRYPTOGRAPHY, FROM FIRST PRINCIPLES, ZERO DEPENDENCIES. This
// codebase has no package manager, no node_modules, and no external crypto
// library anywhere in it. Everything this class needs to verify a real
// secp256k1 ECDSA signature over a real BIP143 sighash — SHA-256,
// RIPEMD-160, secp256k1 point arithmetic, DER signature decoding — is
// implemented here, in plain JavaScript, and cross-checked (during this
// milestone's own development, never at runtime) against Node's own
// `crypto` module across dozens of independently generated real keys and
// signatures. This is real verification, not a placeholder that merely
// checks shapes — see docs/Principles.md, "Signing Material Is Not Yet A
// Signature Until It Verifies (0.8.51)."
//
// "SPENDABLE" MEANS TWO THINGS, BOTH CHECKED, NEITHER ASSUMED. For each
// p2wpkh input, this class checks (1) the claimed public key actually
// HASH160-matches the 20-byte hash embedded in the exact `witnessUtxo`
// scriptPubKey the original description named — proving the key even has
// authority over this UTXO's script — and only then (2) that the claimed
// signature is a valid ECDSA signature, by that same key, over this exact
// transaction's own BIP143 sighash. Either check failing refuses the whole
// PSBT; this class never finalizes a transaction where even one input's
// authority is unproven.
//
// ONLY SIGHASH_ALL IS SUPPORTED. A signature whose trailing sighash-type
// byte is anything other than `0x01` (`SIGHASH_ALL`) is refused, named
// explicitly, rather than silently computing the wrong sighash preimage for
// an ANYONECANPAY/SINGLE/NONE variant this class was never taught to build.
//
// A NOT-YET-FINALIZED `partialSig` IS FINALIZED HERE, ON PURPOSE. Because
// every scriptType this class supports (`p2wpkh`) is always single-key —
// this codebase never selects or describes a multisig UTXO anywhere — a
// signed PSBT carrying exactly one `partialSig` per input, still lacking a
// `finalScriptWitness`, carries everything this class needs to both verify
// AND finalize: this is real BIP174 "finalization" in the literal sense,
// not merely a check. An input already carrying `finalScriptWitness`
// instead is read and verified directly. More than one `partialSig` on a
// single input (multisig) is refused, named explicitly, never guessed at.
export class BitcoinAnchorSignedPsbtFinalizer {
    constructor() {
        this._serializer = new BitcoinAnchorPsbtSerializer();
        this._inspector = new BitcoinAnchorSignedPsbtInspector();
    }

    // Matches anchoring/BitcoinAnchorPsbtBuilder.js's own anchorType
    // exactly — the same external protocol, one more stage of it.
    get anchorType() { return 'bitcoin-op-return'; }

    // Resolves synchronously (no network, no async work of any kind) to
    // exactly one of:
    //
    //   { finalized: true, txid, rawTransaction: { bytes, hex },
    //       verifiedInputs: [{ txid, vout, pubkey, sighashType }, ...] }
    //   { finalized: false, reason }
    //
    // Throws only for a malformed `description` — re-validated via
    // BitcoinAnchorPsbtSerializer#serialize(), exactly as
    // BitcoinAnchorSignedPsbtInspector#inspect() already does. `signedPsbt`
    // is external, untrusted wallet output: nothing about it is ever
    // allowed to throw. Accepts a Uint8Array, a hex string, or a base64
    // string for `signedPsbt`, the identical trio the inspector and
    // serializer already accept.
    finalize({ description, signedPsbt } = {}) {
        // Independently re-validates `description` — never trusts that it
        // genuinely is a real BitcoinAnchorPsbtBuilder result. Throws
        // exactly as BitcoinAnchorPsbtSerializer#serialize() itself would.
        this._serializer.serialize(description);

        const inspection = this._inspector.inspect({ description, signedPsbt });
        if (!inspection.intact) {
            return { finalized: false, reason: inspection.reason };
        }

        let decoded;
        try {
            decoded = decodeSignedPsbtForFinalization(toBytes(signedPsbt));
        } catch (error) {
            return { finalized: false, reason: `signed PSBT could not be decoded for finalization: ${error.message}` };
        }

        const verifiedInputs = [];
        for (let i = 0; i < description.inputs.length; i++) {
            const planInput = description.inputs[i];
            const signedInput = decoded.inputs[i];

            if (planInput.scriptType !== 'p2wpkh') {
                return {
                    finalized: false,
                    reason: `input ${i} uses scriptType "${planInput.scriptType || 'unknown'}", which this finalizer does not yet cryptographically finalize — only p2wpkh is currently supported`
                };
            }
            if (!planInput.witnessUtxo || !isNonEmptyEvenHex(planInput.witnessUtxo.scriptPubKey)) {
                throw new Error(`BitcoinAnchorSignedPsbtFinalizer: description.inputs[${i}] is scriptType "p2wpkh" but carries no valid witnessUtxo — malformed description`);
            }

            try {
                const verified = finalizeP2wpkhInput({ index: i, planInput, signedInput, globalUnsignedTx: description.globalUnsignedTx });
                verifiedInputs.push(verified);
            } catch (error) {
                return { finalized: false, reason: `input ${i}: ${error.message}` };
            }
        }

        const rawTransaction = buildFinalizedTransaction(description.globalUnsignedTx, verifiedInputs);
        return {
            finalized: true,
            txid: rawTransaction.txid,
            rawTransaction: { bytes: rawTransaction.bytes, hex: rawTransaction.hex },
            verifiedInputs: verifiedInputs.map(({ txid, vout, pubkeyHex, sighashType }) => ({ txid, vout, pubkey: pubkeyHex, sighashType }))
        };
    }
}

// ---------------------------------------------------------------------
// Per-input finalization: extract signing material, prove the public key
// has authority over the script, prove the signature is cryptographically
// valid over this exact transaction's BIP143 sighash.
// ---------------------------------------------------------------------

function finalizeP2wpkhInput({ index, planInput, signedInput, globalUnsignedTx }) {
    const { pubkeyBytes, derBytes, sighashType } = extractP2wpkhSigningMaterial(signedInput);

    if (sighashType !== SIGHASH_ALL) {
        throw new Error(`only SIGHASH_ALL (0x01) is supported for finalization — got 0x${sighashType.toString(16).padStart(2, '0')}`);
    }
    if (pubkeyBytes.length !== 33 || (pubkeyBytes[0] !== 0x02 && pubkeyBytes[0] !== 0x03)) {
        throw new Error('public key must be a 33-byte compressed secp256k1 key (0x02/0x03 prefix) — this class does not support uncompressed or x-only keys');
    }

    const expectedHash160 = extractP2wpkhHash160(planInput.witnessUtxo.scriptPubKey);
    if (expectedHash160 === null) {
        throw new Error('witnessUtxo.scriptPubKey is not a standard P2WPKH script (expected OP_0 <20-byte-hash>)');
    }
    const actualHash160 = hash160(pubkeyBytes);
    if (!bytesEqual(actualHash160, expectedHash160)) {
        throw new Error('the public key in the signed PSBT does not correspond to the P2WPKH script being spent — this input is not spendable with this key');
    }

    let pubkeyPoint;
    try {
        pubkeyPoint = decompressPubkey(pubkeyBytes);
    } catch (error) {
        throw new Error(`public key is not a valid secp256k1 point — ${error.message}`);
    }

    const signature = parseDerSignature(derBytes);
    if (signature.r < 1n || signature.r >= SECP256K1_N || signature.s < 1n || signature.s >= SECP256K1_N) {
        throw new Error('signature r/s is out of the valid range [1, n-1]');
    }

    const sighash = computeP2wpkhSighash({ globalUnsignedTx, inputIndex: index, hash160Bytes: expectedHash160, valueSats: planInput.witnessUtxo.valueSats });
    const valid = ecdsaVerify(pubkeyPoint, sighash, signature.r, signature.s);
    if (!valid) {
        throw new Error('signature does not cryptographically verify against the computed BIP143 sighash and public key — this input is NOT spendable');
    }

    return {
        txid: planInput.txid,
        vout: planInput.vout,
        pubkeyHex: bytesToHex(pubkeyBytes),
        pubkeyBytes,
        signatureWithHashType: concatBytes([derBytes, Uint8Array.from([sighashType])]),
        sighashType
    };
}

// Recognizes exactly the shapes a single-key p2wpkh input's signing
// material can take — either a `finalScriptWitness` already carrying
// exactly [signature, pubkey], or exactly one `partialSig` this class
// itself finalizes. Anything else (multisig, an unexpected combination, a
// malformed witness stack) is refused explicitly.
function extractP2wpkhSigningMaterial(signedInput) {
    if (signedInput.finalScriptSig !== undefined) {
        throw new Error('a p2wpkh input must not carry finalScriptSig — that field belongs to a legacy (p2pkh) input');
    }

    if (signedInput.finalScriptWitness !== undefined) {
        if (signedInput.partialSigs.length > 0) {
            throw new Error('carries both finalScriptWitness and partialSig — ambiguous signing material');
        }
        const items = decodeWitnessStack(hexToBytes(signedInput.finalScriptWitness));
        if (items.length !== 2) {
            throw new Error(`unsupported finalScriptWitness shape for a p2wpkh input (expected exactly 2 items: signature and public key, found ${items.length})`);
        }
        return splitSignatureAndHashType(items[0], items[1]);
    }

    if (signedInput.partialSigs.length !== 1) {
        throw new Error(`expected exactly 1 partialSig for a p2wpkh input, found ${signedInput.partialSigs.length} (multisig is not supported)`);
    }
    const sig = signedInput.partialSigs[0];
    return splitSignatureAndHashType(hexToBytes(sig.signature), hexToBytes(sig.pubkey));
}

function splitSignatureAndHashType(sigWithHashTypeBytes, pubkeyBytes) {
    if (sigWithHashTypeBytes.length < 9) {
        throw new Error('signature is too short to contain a DER signature and a trailing sighash-type byte');
    }
    const sighashType = sigWithHashTypeBytes[sigWithHashTypeBytes.length - 1];
    const derBytes = sigWithHashTypeBytes.slice(0, -1);
    return { pubkeyBytes, derBytes, sighashType };
}

function extractP2wpkhHash160(scriptPubKeyHex) {
    const bytes = hexToBytes(scriptPubKeyHex);
    if (bytes.length !== P2WPKH_SCRIPT_PUBKEY_LENGTH || bytes[0] !== 0x00 || bytes[1] !== 0x14) {
        return null;
    }
    return bytes.slice(2);
}

function decodeWitnessStack(bytes) {
    let offset = 0;
    const count = readCompactSize(bytes, offset); offset = count.offset;
    const items = [];
    for (let i = 0; i < count.value; i++) {
        const item = readVarBytes(bytes, offset); offset = item.offset;
        items.push(item.bytes);
    }
    if (offset !== bytes.length) {
        throw new Error('trailing bytes after the witness stack');
    }
    return items;
}

// ---------------------------------------------------------------------
// BIP143 (segwit v0) sighash — the exact preimage a p2wpkh signer signs.
// ---------------------------------------------------------------------

function computeP2wpkhSighash({ globalUnsignedTx, inputIndex, hash160Bytes, valueSats }) {
    const hashPrevouts = dsha256(concatBytes(globalUnsignedTx.inputs.map((input) =>
        concatBytes([reverseBytes(hexToBytes(input.txid)), writeUInt32LE(input.vout)])
    )));
    const hashSequence = dsha256(concatBytes(globalUnsignedTx.inputs.map((input) => writeUInt32LE(input.sequence))));
    const hashOutputs = dsha256(concatBytes(globalUnsignedTx.outputs.map((output) =>
        concatBytes([writeUInt64LE(output.valueSats), encodeVarBytes(hexToBytes(output.scriptPubKey))])
    )));

    const thisInput = globalUnsignedTx.inputs[inputIndex];
    const outpoint = concatBytes([reverseBytes(hexToBytes(thisInput.txid)), writeUInt32LE(thisInput.vout)]);
    // scriptCode for a p2wpkh input is the equivalent legacy p2pkh script,
    // length-prefixed as a var-length byte string — BIP143's own rule for
    // "witness program version 0, 20-byte program."
    const scriptCode = encodeVarBytes(concatBytes([
        Uint8Array.from([0x76, 0xa9, 0x14]), hash160Bytes, Uint8Array.from([0x88, 0xac])
    ]));

    const preimage = concatBytes([
        writeUInt32LE(globalUnsignedTx.version),
        hashPrevouts,
        hashSequence,
        outpoint,
        scriptCode,
        writeUInt64LE(valueSats),
        writeUInt32LE(thisInput.sequence),
        hashOutputs,
        writeUInt32LE(globalUnsignedTx.locktime),
        writeUInt32LE(SIGHASH_ALL)
    ]);
    return dsha256(preimage);
}

// ---------------------------------------------------------------------
// Assembling the finalized, broadcastable segwit transaction.
// ---------------------------------------------------------------------

function buildFinalizedTransaction(globalUnsignedTx, verifiedInputs) {
    const inputParts = globalUnsignedTx.inputs.map((input) => concatBytes([
        reverseBytes(hexToBytes(input.txid)),
        writeUInt32LE(input.vout),
        encodeCompactSize(0), // a p2wpkh input's scriptSig is always empty — it spends via witness only
        writeUInt32LE(input.sequence)
    ]));
    const outputParts = globalUnsignedTx.outputs.map((output) => concatBytes([
        writeUInt64LE(output.valueSats),
        encodeVarBytes(hexToBytes(output.scriptPubKey))
    ]));
    const witnessParts = verifiedInputs.map((verified) => concatBytes([
        encodeCompactSize(2),
        encodeVarBytes(verified.signatureWithHashType),
        encodeVarBytes(verified.pubkeyBytes)
    ]));

    const nonWitnessBytes = concatBytes([
        writeUInt32LE(globalUnsignedTx.version),
        encodeCompactSize(globalUnsignedTx.inputs.length),
        ...inputParts,
        encodeCompactSize(globalUnsignedTx.outputs.length),
        ...outputParts,
        writeUInt32LE(globalUnsignedTx.locktime)
    ]);
    const txid = bytesToHex(reverseBytes(dsha256(nonWitnessBytes)));

    const fullBytes = concatBytes([
        writeUInt32LE(globalUnsignedTx.version),
        Uint8Array.from([0x00]), // segwit marker
        Uint8Array.from([0x01]), // segwit flag
        encodeCompactSize(globalUnsignedTx.inputs.length),
        ...inputParts,
        encodeCompactSize(globalUnsignedTx.outputs.length),
        ...outputParts,
        ...witnessParts,
        writeUInt32LE(globalUnsignedTx.locktime)
    ]);

    return { bytes: fullBytes, hex: bytesToHex(fullBytes), txid };
}

// ---------------------------------------------------------------------
// Decoding: a signed/partially-signed PSBT's bytes, capturing the raw
// signing-material bytes this class needs — pubkeys, signatures, final
// scripts/witnesses — deliberately duplicated from, not imported from,
// anchoring/BitcoinAnchorSignedPsbtInspector.js's own decoder (which
// discards those bytes after reducing them to booleans/counts). The same
// self-containment every anchoring/ class before this one already holds.
// ---------------------------------------------------------------------

function decodeSignedPsbtForFinalization(bytes) {
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
        throw new Error('global map must carry exactly PSBT_GLOBAL_UNSIGNED_TX and nothing else');
    }
    const inputCount = countUnsignedTxInputs(globalMap.entries[0].value);
    const outputCount = countUnsignedTxOutputs(globalMap.entries[0].value);

    const inputs = [];
    for (let i = 0; i < inputCount; i++) {
        const inputMap = readKeyValueMap(bytes, offset);
        offset = inputMap.offset;
        inputs.push(decodeSignedInputMapForFinalization(inputMap.entries, i));
    }

    for (let i = 0; i < outputCount; i++) {
        const outputMap = readKeyValueMap(bytes, offset);
        offset = outputMap.offset;
        if (outputMap.entries.length !== 0) {
            throw new Error(`output ${i} carries a field this class does not recognize — output maps are expected to stay empty`);
        }
    }

    if (offset !== bytes.length) {
        throw new Error('trailing bytes after the last output map');
    }

    return { inputs };
}

function decodeSignedInputMapForFinalization(entries, index) {
    const result = { partialSigs: [] };
    let finalScriptSigEntry, finalScriptWitnessEntry;
    let sawWitnessUtxo = false, sawNonWitnessUtxo = false, sawSighash = false;

    entries.forEach((entry) => {
        const keyType = entry.key[0];
        if (keyType === PSBT_IN_WITNESS_UTXO && entry.key.length === 1) { sawWitnessUtxo = true; return; }
        if (keyType === PSBT_IN_NON_WITNESS_UTXO && entry.key.length === 1) { sawNonWitnessUtxo = true; return; }
        if (keyType === PSBT_IN_PARTIAL_SIG && entry.key.length > 1) { result.partialSigs.push({ pubkey: bytesToHex(entry.key.slice(1)), signature: bytesToHex(entry.value) }); return; }
        if (keyType === PSBT_IN_SIGHASH_TYPE && entry.key.length === 1) { sawSighash = true; return; }
        if (keyType === PSBT_IN_FINAL_SCRIPTSIG && entry.key.length === 1) { finalScriptSigEntry = entry; return; }
        if (keyType === PSBT_IN_FINAL_SCRIPTWITNESS && entry.key.length === 1) { finalScriptWitnessEntry = entry; return; }
        throw new Error(`input ${index} carries a field this class does not recognize (key type 0x${keyType.toString(16).padStart(2, '0')})`);
    });

    if (!sawWitnessUtxo && !sawNonWitnessUtxo) {
        throw new Error(`input ${index} carries neither witnessUtxo nor nonWitnessUtxo`);
    }
    void sawSighash; // sighash type, if present, is redundant with the trailing byte on the signature itself — not separately needed here

    if (finalScriptSigEntry) {
        result.finalScriptSig = bytesToHex(finalScriptSigEntry.value);
    }
    if (finalScriptWitnessEntry) {
        result.finalScriptWitness = bytesToHex(finalScriptWitnessEntry.value);
    }
    return result;
}

// Reads only enough of PSBT_GLOBAL_UNSIGNED_TX to know how many input and
// output maps follow — the finalizer trusts `description.globalUnsignedTx`
// (already independently re-validated) for every actual transaction field,
// exactly as it trusts `description.inputs[i].witnessUtxo` rather than
// re-decoding the signed PSBT's own (already inspector-confirmed-identical)
// copy of it.
function countUnsignedTxInputs(raw) {
    let offset = 4; // version
    return readCompactSize(raw, offset).value;
}

function countUnsignedTxOutputs(raw) {
    let offset = 4; // version
    const inputCount = readCompactSize(raw, offset); offset = inputCount.offset;
    for (let i = 0; i < inputCount.value; i++) {
        offset += 32 + 4; // txid + vout
        const scriptSigLen = readCompactSize(raw, offset); offset = scriptSigLen.offset;
        offset += scriptSigLen.value; // an unsigned tx's scriptSig is always empty, but skip generically anyway
        offset += 4; // sequence
    }
    return readCompactSize(raw, offset).value;
}

// ---------------------------------------------------------------------
// Cryptography: SHA-256, RIPEMD-160, and secp256k1 ECDSA verification,
// each implemented from first principles — see this file's own header,
// "REAL CRYPTOGRAPHY, FROM FIRST PRINCIPLES, ZERO DEPENDENCIES."
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
            const temp1 = (h + S1 + ch + SHA256_K[i] + w[i]) >>> 0;
            const S0 = rotr32(a, 2) ^ rotr32(a, 13) ^ rotr32(a, 22);
            const maj = (a & b) ^ (a & c) ^ (b & c);
            const temp2 = (S0 + maj) >>> 0;
            h = g; g = f; f = e; e = (d + temp1) >>> 0; d = c; c = b; b = a; a = (temp1 + temp2) >>> 0;
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

// RIPEMD-160 message-schedule word order and rotate-amount tables for its
// two parallel compression lines — BIP-standard, unrelated to Bitcoin's own
// choices but required by it (HASH160 = RIPEMD160(SHA256(x))).
const RMD_ZL = [
    0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15,
    7, 4, 13, 1, 10, 6, 15, 3, 12, 0, 9, 5, 2, 14, 11, 8,
    3, 10, 14, 4, 9, 15, 8, 1, 2, 7, 0, 6, 13, 11, 5, 12,
    1, 9, 11, 10, 0, 8, 12, 4, 13, 3, 7, 15, 14, 5, 6, 2,
    4, 0, 5, 9, 7, 12, 2, 10, 14, 1, 3, 8, 11, 6, 15, 13
];
const RMD_ZR = [
    5, 14, 7, 0, 9, 2, 11, 4, 13, 6, 15, 8, 1, 10, 3, 12,
    6, 11, 3, 7, 0, 13, 5, 10, 14, 15, 8, 12, 4, 9, 1, 2,
    15, 5, 1, 3, 7, 14, 6, 9, 11, 8, 12, 2, 10, 0, 4, 13,
    8, 6, 4, 1, 3, 11, 15, 0, 5, 12, 2, 13, 9, 7, 10, 14,
    12, 15, 10, 4, 1, 5, 8, 7, 6, 2, 13, 14, 0, 3, 9, 11
];
const RMD_SL = [
    11, 14, 15, 12, 5, 8, 7, 9, 11, 13, 14, 15, 6, 7, 9, 8,
    7, 6, 8, 13, 11, 9, 7, 15, 7, 12, 15, 9, 11, 7, 13, 12,
    11, 13, 6, 7, 14, 9, 13, 15, 14, 8, 13, 6, 5, 12, 7, 5,
    11, 12, 14, 15, 14, 15, 9, 8, 9, 14, 5, 6, 8, 6, 5, 12,
    9, 15, 5, 11, 6, 8, 13, 12, 5, 12, 13, 14, 11, 8, 5, 6
];
const RMD_SR = [
    8, 9, 9, 11, 13, 15, 15, 5, 7, 7, 8, 11, 14, 14, 12, 6,
    9, 13, 15, 7, 12, 8, 9, 11, 7, 7, 12, 7, 6, 15, 13, 11,
    9, 7, 15, 11, 8, 6, 6, 14, 12, 13, 5, 14, 13, 13, 7, 5,
    15, 5, 8, 11, 14, 14, 6, 14, 6, 9, 12, 9, 12, 5, 15, 8,
    8, 5, 12, 9, 12, 5, 14, 6, 8, 13, 6, 5, 15, 13, 11, 11
];
const RMD_KL = [0x00000000, 0x5a827999, 0x6ed9eba1, 0x8f1bbcdc, 0xa953fd4e];
const RMD_KR = [0x50a28be6, 0x5c4dd124, 0x6d703ef3, 0x7a6d76e9, 0x00000000];

function rol32(x, n) { return ((x << n) | (x >>> (32 - n))) >>> 0; }

function ripemd160F(j, x, y, z) {
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
            let t = (al + ripemd160F(j, bl, cl, dl) + x[RMD_ZL[j]] + RMD_KL[round]) >>> 0;
            t = (rol32(t, RMD_SL[j]) + el) >>> 0;
            al = el; el = dl; dl = rol32(cl, 10); cl = bl; bl = t;

            let tr = (ar + ripemd160F(79 - j, br, cr, dr) + x[RMD_ZR[j]] + RMD_KR[round]) >>> 0;
            tr = (rol32(tr, RMD_SR[j]) + er) >>> 0;
            ar = er; er = dr; dr = rol32(cr, 10); cr = br; br = tr;
        }
        const t = (h1 + cl + dr) >>> 0;
        h1 = (h2 + dl + er) >>> 0;
        h2 = (h3 + el + ar) >>> 0;
        h3 = (h4 + al + br) >>> 0;
        h4 = (h0 + bl + cr) >>> 0;
        h0 = t;
    }

    const out = new Uint8Array(20);
    const dv = new DataView(out.buffer);
    [h0, h1, h2, h3, h4].forEach((h, i) => dv.setUint32(i * 4, h, true));
    return out;
}

function hash160(bytes) { return ripemd160(sha256(bytes)); }

// secp256k1 curve parameters (SEC2).
const SECP256K1_P = (1n << 256n) - (1n << 32n) - 977n;
const SECP256K1_N = 0xFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFEBAAEDCE6AF48A03BBFD25E8CD0364141n;
const SECP256K1_GX = 0x79BE667EF9DCBBAC55A06295CE870B07029BFCDB2DCE28D959F2815B16F81798n;
const SECP256K1_GY = 0x483ADA7726A3C4655DA4FBFC0E1108A8FD17B448A68554199C47D08FFB10D4B8n;
const SECP256K1_G = { x: SECP256K1_GX, y: SECP256K1_GY };

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

// Affine-coordinate point addition/doubling over F_p — simple and slow
// compared to a Jacobian-coordinate implementation, but this class only
// ever performs a handful of scalar multiplications per finalize() call, so
// clarity and straightforward correctness win over performance here.
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

function bytesToBigInt(bytes) {
    let value = 0n;
    for (const b of bytes) value = (value << 8n) | BigInt(b);
    return value;
}

// Recovers a full curve point from a 33-byte SEC1-compressed public key.
// Throws for anything that is not a valid point on the curve — an invalid
// x-coordinate, or bytes that were never a real compressed pubkey at all.
function decompressPubkey(bytes) {
    const x = bytesToBigInt(bytes.slice(1));
    if (x >= SECP256K1_P) {
        throw new Error('x-coordinate is not less than the field prime');
    }
    const ySquared = fieldMod(x * x * x + 7n, SECP256K1_P);
    let y = modPow(ySquared, (SECP256K1_P + 1n) / 4n, SECP256K1_P); // valid because p ≡ 3 (mod 4)
    if (fieldMod(y * y, SECP256K1_P) !== ySquared) {
        throw new Error('point is not on the secp256k1 curve');
    }
    const wantOdd = bytes[0] === 0x03;
    if ((y % 2n === 1n) !== wantOdd) y = SECP256K1_P - y;
    return { x, y };
}

// Standard ECDSA verification (SEC1 4.1.4): valid iff
// (u1*G + u2*Q).x mod n === r, where u1 = e*s^-1 mod n, u2 = r*s^-1 mod n.
function ecdsaVerify(publicKeyPoint, hashBytes, r, s) {
    if (r < 1n || r >= SECP256K1_N || s < 1n || s >= SECP256K1_N) return false;
    const e = bytesToBigInt(hashBytes);
    const w = modInverse(s, SECP256K1_N);
    const u1 = fieldMod(e * w, SECP256K1_N);
    const u2 = fieldMod(r * w, SECP256K1_N);
    const point = pointAdd(scalarMul(SECP256K1_G, u1), scalarMul(publicKeyPoint, u2));
    if (point === null) return false;
    return fieldMod(point.x, SECP256K1_N) === r;
}

// Decodes a BIP62-shaped DER ECDSA signature (SEQUENCE of two INTEGERs).
// Only short-form (single-byte) DER lengths are supported — a real
// secp256k1 signature is always well under the 128-byte threshold where
// long-form length encoding would ever be needed, so encountering one here
// means the bytes were never a real ECDSA signature, and this class refuses
// rather than mis-parsing.
function parseDerSignature(bytes) {
    let offset = 0;
    if (bytes[offset++] !== 0x30) throw new Error('not a DER SEQUENCE');
    const seqLen = bytes[offset++];
    if (seqLen === undefined || seqLen >= 0x80) throw new Error('DER signature uses an unsupported or malformed length encoding');
    if (seqLen !== bytes.length - 2) throw new Error('DER sequence length does not match the signature bytes');
    if (bytes[offset++] !== 0x02) throw new Error('expected an INTEGER marker for r');
    const rLen = bytes[offset++];
    if (rLen === undefined || rLen >= 0x80 || offset + rLen > bytes.length) throw new Error('malformed r length');
    const r = bytesToBigInt(bytes.slice(offset, offset + rLen)); offset += rLen;
    if (bytes[offset++] !== 0x02) throw new Error('expected an INTEGER marker for s');
    const sLen = bytes[offset++];
    if (sLen === undefined || sLen >= 0x80 || offset + sLen > bytes.length) throw new Error('malformed s length');
    const s = bytesToBigInt(bytes.slice(offset, offset + sLen)); offset += sLen;
    if (offset !== bytes.length) throw new Error('trailing bytes after the DER signature');
    return { r, s };
}

// ---------------------------------------------------------------------
// Byte-level primitives — deliberately duplicated, not imported, from
// anchoring/BitcoinAnchorSignedPsbtInspector.js and
// anchoring/BitcoinAnchorPsbtSerializer.js: the identical self-containment
// every anchoring/ class before this one already holds.
// ---------------------------------------------------------------------

function isNonEmptyEvenHex(value) {
    return typeof value === 'string' && value.length > 0 && value.length % 2 === 0 && HEX_PATTERN.test(value);
}

function bytesEqual(a, b) {
    if (a.length !== b.length) return false;
    for (let i = 0; i < a.length; i++) {
        if (a[i] !== b[i]) return false;
    }
    return true;
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

function writeUInt32LE(value) {
    const bytes = new Uint8Array(4);
    new DataView(bytes.buffer).setUint32(0, value, true);
    return bytes;
}

function writeUInt64LE(value) {
    const bytes = new Uint8Array(8);
    new DataView(bytes.buffer).setBigUint64(0, BigInt(value), true);
    return bytes;
}

function encodeVarBytes(bytes) {
    return concatBytes([encodeCompactSize(bytes.length), bytes]);
}

function encodeCompactSize(value) {
    if (value <= 0xfc) {
        return Uint8Array.from([value]);
    }
    if (value <= 0xffff) {
        const bytes = new Uint8Array(3);
        bytes[0] = 0xfd;
        new DataView(bytes.buffer).setUint16(1, value, true);
        return bytes;
    }
    if (value <= 0xffffffff) {
        const bytes = new Uint8Array(5);
        bytes[0] = 0xfe;
        new DataView(bytes.buffer).setUint32(1, value, true);
        return bytes;
    }
    const bytes = new Uint8Array(9);
    bytes[0] = 0xff;
    new DataView(bytes.buffer).setBigUint64(1, BigInt(value), true);
    return bytes;
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

function readVarBytes(bytes, offset) {
    const len = readCompactSize(bytes, offset);
    const dataBytes = bytes.slice(len.offset, len.offset + len.value);
    return { bytes: dataBytes, offset: len.offset + len.value };
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

function toBytes(psbt) {
    if (psbt instanceof Uint8Array) {
        return psbt;
    }
    if (typeof psbt === 'string') {
        return isNonEmptyEvenHex(psbt) ? hexToBytes(psbt) : base64ToBytes(psbt);
    }
    throw new Error('signedPsbt must be a Uint8Array, a hex string, or a base64 string');
}
