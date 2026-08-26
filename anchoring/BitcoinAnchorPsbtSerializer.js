const HEX_PATTERN = /^[0-9a-f]+$/i;
const TXID_PATTERN = /^[0-9a-f]{64}$/i;
const UINT32_MAX = 0xffffffff;
const MAX_SATS = 21000000 * 100000000; // Bitcoin's own fixed supply — a sanity ceiling, never a consensus rule this class enforces on anyone's behalf.
const PSBT_MAGIC = [0x70, 0x73, 0x62, 0x74, 0xff]; // 'p' 's' 'b' 't' 0xff — BIP174's own fixed magic bytes.
const PSBT_GLOBAL_UNSIGNED_TX = 0x00;
const PSBT_IN_NON_WITNESS_UTXO = 0x00;
const PSBT_IN_WITNESS_UTXO = 0x01;
const BASE64_ALPHABET = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/';

// A PSBT field that only ever exists once a real signer has acted. If any
// of these ever appeared on a description this class was handed, silently
// leaving them unencoded would be worse than refusing outright — it would
// look like a successful serialization while quietly discarding the one
// thing that made a signed PSBT actually signed. See this file's own
// header, "NEVER SILENTLY DROPS SIGNING MATERIAL," below.
const FORBIDDEN_INPUT_FIELDS = ['partialSig', 'finalScriptSig', 'finalScriptWitness', 'signature', 'privateKey', 'seed', 'wif'];

// 0.8.49 — Real BIP-174 PSBT Serialization.
//
// anchoring/BitcoinAnchorPsbtBuilder.js (0.8.48) turns a 0.8.47 plan into
// every piece of information a real BIP174 PSBT would carry — but as a
// plain, structured JS object, never real wire bytes. 0.8.48's own header
// named exactly what came next: "producing genuinely spec-compliant
// wire-format bytes is a future concern." This class is that concern, and
// nothing more:
//
//   { globalUnsignedTx, inputs, outputs, ... }   a PSBT-SHAPED
//                                                 DESCRIPTION (0.8.48)
//           │
//           ▼
//   BitcoinAnchorPsbtSerializer.serialize()      (THIS FILE — new)
//           │
//           ▼
//   { bytes, hex, base64 }             a REAL BIP174 PSBT, still unsigned
//           │
//           ▼
//   (a future milestone: handing this to an external wallet — NOT this one)
//
// STILL NEVER SIGNING, STILL NEVER BROADCASTING, STILL NEVER CONNECTING TO
// A WALLET. This class does not import anchoring/BitcoinAnchorPublisher.js,
// generates no keys, and adds no signature of any kind — it only encodes,
// byte for byte, the exact same unsigned facts 0.8.48 already assembled.
//
// A SERIALIZATION BOUNDARY, ON PURPOSE. `serialize()` consumes exactly the
// minimal shape BIP174 itself needs — `{ globalUnsignedTx, inputs }` — not
// the full 0.8.48 result. A real BitcoinAnchorPsbtBuilder result satisfies
// this shape (its extra fields — `network`, `anchorType`, `outputs`,
// `feeSats`, `totalInputSats` — are ForkBuild's own bookkeeping, not
// BIP174 vocabulary, and are simply ignored here). This keeps the boundary
// the way it should be: if 0.8.48's own result shape ever grows, or this
// class is ever handed a hand-built minimal PSBT description instead, this
// serializer does not need to change, and neither does anything upstream
// of it need to understand wire-format concerns.
//
// DETERMINISTIC, ORDER-PRESERVING. Given the same description, `serialize()`
// always produces byte-identical output — no randomness, no map iteration
// whose order could vary, no timestamp. `description.inputs[i]` must name
// the exact same `(txid, vout)` as `globalUnsignedTx.inputs[i]`, in the
// same order — BIP174's per-input maps are positional, matched by index to
// the unsigned transaction's own input order, so this class checks that
// correspondence explicitly rather than trusting it silently held.
//
// NEVER SILENTLY DROPS SIGNING MATERIAL. This class only ever reads
// `witnessUtxo` and `nonWitnessUtxo` off an input — the two BIP174 fields
// that describe what is being spent, present in every unsigned PSBT. If a
// description's input instead (or also) carries `partialSig`,
// `finalScriptSig`, `finalScriptWitness`, `signature`, `privateKey`,
// `seed`, or `wif`, `serialize()` throws rather than quietly encoding an
// unsigned PSBT that looks complete but has silently lost that material —
// see FORBIDDEN_INPUT_FIELDS above.
//
// A REAL TXID IS BYTE-REVERSED ON THE WIRE. Bitcoin's own convention
// displays a txid as big-endian hex, but the transaction format itself
// stores it little-endian (byte-reversed) — a detail 0.8.47/0.8.48 never
// needed to confront because neither ever produced real bytes. This class
// performs that reversal exactly once, here, and nowhere else.
//
// A PARSER EXISTS ONLY TO PROVE THE ROUND TRIP, NOT AS A GENERAL PSBT
// READER. `parse()` decodes real BIP174 bytes back into the identical
// `{ globalUnsignedTx, inputs }` shape `serialize()` consumed — enough to
// assert `parse(serialize(d).bytes)` reproduces `d` exactly, the strongest
// invariant this milestone can offer before any external wallet is ever
// involved. It recognizes exactly the two per-input key types this class
// itself ever writes (`PSBT_IN_WITNESS_UTXO`, `PSBT_IN_NON_WITNESS_UTXO`)
// and throws on anything else a real wallet-produced PSBT might carry
// (`partialSig`, `finalScriptWitness`, a BIP32 derivation path, an `xpub`)
// — this class never reads a signed or partially-signed PSBT, and refuses
// rather than silently ignoring one.
export class BitcoinAnchorPsbtSerializer {
    // Resolves synchronously (no network, no async work of any kind) to
    // `{ bytes, hex, base64 }` — the real BIP174 wire bytes and its two
    // common textual encodings. Every failure is a caller-contract
    // violation on already-known-good data, exactly as 0.8.48's own
    // `build()` throws rather than reporting an operational outcome.
    serialize(description) {
        validateDescription(description);
        const bytes = encodePsbt(description);
        return { bytes, hex: bytesToHex(bytes), base64: bytesToBase64(bytes) };
    }

    // Inverse of serialize() — see this file's own header on why this
    // exists only to prove a round trip, never as a general-purpose PSBT
    // reader. Accepts a Uint8Array, a hex string, or a base64 string.
    parse(psbt) {
        const bytes = toBytes(psbt);
        return decodePsbt(bytes);
    }
}

function isUint32(value) {
    return Number.isInteger(value) && value >= 0 && value <= UINT32_MAX;
}

function isNonEmptyEvenHex(value) {
    return typeof value === 'string' && value.length > 0 && value.length % 2 === 0 && HEX_PATTERN.test(value);
}

function isValueSats(value) {
    return Number.isInteger(value) && value >= 0 && value <= MAX_SATS;
}

// Independently re-validates the description this class was handed —
// never trusts that it genuinely came from BitcoinAnchorPsbtBuilder#build(),
// the identical restraint that class already held toward its own `plan`.
function validateDescription(description) {
    if (!description || typeof description !== 'object') {
        throw new Error('BitcoinAnchorPsbtSerializer: description must be an object');
    }
    const tx = description.globalUnsignedTx;
    if (!tx || typeof tx !== 'object') {
        throw new Error('BitcoinAnchorPsbtSerializer: description.globalUnsignedTx must be an object');
    }
    if (!isUint32(tx.version)) {
        throw new Error('BitcoinAnchorPsbtSerializer: globalUnsignedTx.version must be a uint32');
    }
    if (!isUint32(tx.locktime)) {
        throw new Error('BitcoinAnchorPsbtSerializer: globalUnsignedTx.locktime must be a uint32');
    }
    if (!Array.isArray(tx.inputs) || tx.inputs.length === 0) {
        throw new Error('BitcoinAnchorPsbtSerializer: globalUnsignedTx.inputs must be a non-empty array');
    }
    if (!Array.isArray(tx.outputs) || tx.outputs.length === 0) {
        throw new Error('BitcoinAnchorPsbtSerializer: globalUnsignedTx.outputs must be a non-empty array');
    }
    tx.inputs.forEach((input, index) => {
        if (!input || typeof input.txid !== 'string' || !TXID_PATTERN.test(input.txid)) {
            throw new Error(`BitcoinAnchorPsbtSerializer: globalUnsignedTx.inputs[${index}].txid must be a 32-byte hex transaction id`);
        }
        if (!isUint32(input.vout)) {
            throw new Error(`BitcoinAnchorPsbtSerializer: globalUnsignedTx.inputs[${index}].vout must be a uint32`);
        }
        if (!isUint32(input.sequence)) {
            throw new Error(`BitcoinAnchorPsbtSerializer: globalUnsignedTx.inputs[${index}].sequence must be a uint32`);
        }
    });
    tx.outputs.forEach((output, index) => {
        if (!output || !isNonEmptyEvenHex(output.scriptPubKey)) {
            throw new Error(`BitcoinAnchorPsbtSerializer: globalUnsignedTx.outputs[${index}].scriptPubKey must be a non-empty, even-length hex string`);
        }
        if (!isValueSats(output.valueSats)) {
            throw new Error(`BitcoinAnchorPsbtSerializer: globalUnsignedTx.outputs[${index}].valueSats must be a non-negative integer within Bitcoin's fixed supply`);
        }
    });

    if (!Array.isArray(description.inputs) || description.inputs.length !== tx.inputs.length) {
        throw new Error('BitcoinAnchorPsbtSerializer: description.inputs must be an array with exactly one entry per globalUnsignedTx.inputs, in the same order');
    }
    description.inputs.forEach((input, index) => {
        const globalInput = tx.inputs[index];
        if (!input || typeof input !== 'object' || input.txid !== globalInput.txid || input.vout !== globalInput.vout) {
            throw new Error(`BitcoinAnchorPsbtSerializer: description.inputs[${index}] (txid/vout) must match globalUnsignedTx.inputs[${index}] exactly, in the same order`);
        }
        FORBIDDEN_INPUT_FIELDS.forEach((field) => {
            if (field in input) {
                throw new Error(`BitcoinAnchorPsbtSerializer: description.inputs[${index}] carries a "${field}" field — this class only ever serializes an UNSIGNED PSBT and refuses to silently drop signing material`);
            }
        });

        const hasWitnessUtxo = 'witnessUtxo' in input;
        const hasNonWitnessUtxo = 'nonWitnessUtxo' in input;
        if (hasWitnessUtxo === hasNonWitnessUtxo) {
            throw new Error(`BitcoinAnchorPsbtSerializer: description.inputs[${index}] must supply exactly one of witnessUtxo or nonWitnessUtxo`);
        }
        if (hasWitnessUtxo) {
            if (!input.witnessUtxo || !isNonEmptyEvenHex(input.witnessUtxo.scriptPubKey)) {
                throw new Error(`BitcoinAnchorPsbtSerializer: description.inputs[${index}].witnessUtxo.scriptPubKey must be a non-empty, even-length hex string`);
            }
            if (!isValueSats(input.witnessUtxo.valueSats) || input.witnessUtxo.valueSats === 0) {
                throw new Error(`BitcoinAnchorPsbtSerializer: description.inputs[${index}].witnessUtxo.valueSats must be a positive integer`);
            }
        } else if (!isNonEmptyEvenHex(input.nonWitnessUtxo)) {
            throw new Error(`BitcoinAnchorPsbtSerializer: description.inputs[${index}].nonWitnessUtxo must be a non-empty, even-length hex string`);
        }
    });
}

// ---------------------------------------------------------------------
// Encoding: description → real BIP174 bytes.
// ---------------------------------------------------------------------

function encodePsbt(description) {
    const tx = description.globalUnsignedTx;
    const parts = [Uint8Array.from(PSBT_MAGIC)];

    parts.push(encodeKeyValue(Uint8Array.from([PSBT_GLOBAL_UNSIGNED_TX]), encodeUnsignedTx(tx)));
    parts.push(Uint8Array.from([0x00])); // end of the global map

    description.inputs.forEach((input) => {
        if ('witnessUtxo' in input) {
            const value = concatBytes([
                writeUInt64LE(input.witnessUtxo.valueSats),
                encodeVarBytes(hexToBytes(input.witnessUtxo.scriptPubKey))
            ]);
            parts.push(encodeKeyValue(Uint8Array.from([PSBT_IN_WITNESS_UTXO]), value));
        } else {
            parts.push(encodeKeyValue(Uint8Array.from([PSBT_IN_NON_WITNESS_UTXO]), hexToBytes(input.nonWitnessUtxo)));
        }
        parts.push(Uint8Array.from([0x00])); // end of this input's map
    });

    // BIP174 requires one map per output, even when there is nothing yet
    // to say about it (no redeemScript/witnessScript exists at this
    // unsigned stage) — an output map with zero entries is still a map,
    // signaled by going straight to the 0x00 separator.
    tx.outputs.forEach(() => parts.push(Uint8Array.from([0x00])));

    return concatBytes(parts);
}

function encodeKeyValue(keyBytes, valueBytes) {
    return concatBytes([
        encodeCompactSize(keyBytes.length),
        keyBytes,
        encodeCompactSize(valueBytes.length),
        valueBytes
    ]);
}

function encodeUnsignedTx(tx) {
    return concatBytes([
        writeUInt32LE(tx.version),
        encodeCompactSize(tx.inputs.length),
        ...tx.inputs.map(encodeUnsignedTxInput),
        encodeCompactSize(tx.outputs.length),
        ...tx.outputs.map(encodeUnsignedTxOutput),
        writeUInt32LE(tx.locktime)
    ]);
}

function encodeUnsignedTxInput(input) {
    return concatBytes([
        reverseBytes(hexToBytes(input.txid)),
        writeUInt32LE(input.vout),
        encodeCompactSize(0), // an unsigned tx's scriptSig is always empty — BIP174's own requirement
        writeUInt32LE(input.sequence)
    ]);
}

function encodeUnsignedTxOutput(output) {
    return concatBytes([
        writeUInt64LE(output.valueSats),
        encodeVarBytes(hexToBytes(output.scriptPubKey))
    ]);
}

function encodeVarBytes(bytes) {
    return concatBytes([encodeCompactSize(bytes.length), bytes]);
}

// ---------------------------------------------------------------------
// Decoding: real BIP174 bytes → the identical { globalUnsignedTx, inputs }
// shape serialize() consumed. See this file's own header on why this
// exists only to prove a round trip.
// ---------------------------------------------------------------------

function decodePsbt(bytes) {
    let offset = 0;
    PSBT_MAGIC.forEach((expected, index) => {
        if (bytes[offset + index] !== expected) {
            throw new Error('BitcoinAnchorPsbtSerializer: not a valid PSBT — bad magic bytes');
        }
    });
    offset += PSBT_MAGIC.length;

    const globalMap = readKeyValueMap(bytes, offset);
    offset = globalMap.offset;
    const unsignedTxEntry = globalMap.entries.find((entry) => entry.key.length === 1 && entry.key[0] === PSBT_GLOBAL_UNSIGNED_TX);
    if (!unsignedTxEntry) {
        throw new Error('BitcoinAnchorPsbtSerializer: PSBT is missing PSBT_GLOBAL_UNSIGNED_TX');
    }
    const globalUnsignedTx = decodeUnsignedTx(unsignedTxEntry.value);

    const inputs = globalUnsignedTx.inputs.map((globalInput, index) => {
        const inputMap = readKeyValueMap(bytes, offset);
        offset = inputMap.offset;
        return decodeInputMap(inputMap.entries, globalInput, index);
    });

    globalUnsignedTx.outputs.forEach(() => {
        const outputMap = readKeyValueMap(bytes, offset);
        offset = outputMap.offset;
    });

    if (offset !== bytes.length) {
        throw new Error('BitcoinAnchorPsbtSerializer: trailing bytes after the last output map');
    }

    return { globalUnsignedTx, inputs };
}

function decodeInputMap(entries, globalInput, index) {
    const witnessEntry = entries.find((entry) => entry.key.length === 1 && entry.key[0] === PSBT_IN_WITNESS_UTXO);
    const nonWitnessEntry = entries.find((entry) => entry.key.length === 1 && entry.key[0] === PSBT_IN_NON_WITNESS_UTXO);
    const recognizedCount = (witnessEntry ? 1 : 0) + (nonWitnessEntry ? 1 : 0);
    if (recognizedCount !== entries.length) {
        throw new Error(`BitcoinAnchorPsbtSerializer: input ${index} carries a field this class does not recognize — likely a signed or partially-signed PSBT, which this class never reads`);
    }
    if (witnessEntry && nonWitnessEntry) {
        throw new Error(`BitcoinAnchorPsbtSerializer: input ${index} carries both witnessUtxo and nonWitnessUtxo`);
    }
    if (witnessEntry) {
        const valueSats = readUInt64LE(witnessEntry.value, 0);
        const script = readVarBytes(witnessEntry.value, 8);
        return { txid: globalInput.txid, vout: globalInput.vout, witnessUtxo: { scriptPubKey: bytesToHex(script.bytes), valueSats } };
    }
    if (nonWitnessEntry) {
        return { txid: globalInput.txid, vout: globalInput.vout, nonWitnessUtxo: bytesToHex(nonWitnessEntry.value) };
    }
    throw new Error(`BitcoinAnchorPsbtSerializer: input ${index} carries neither witnessUtxo nor nonWitnessUtxo`);
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
            throw new Error(`BitcoinAnchorPsbtSerializer: PSBT_GLOBAL_UNSIGNED_TX input ${i} must have an empty scriptSig — a non-empty one is not an unsigned transaction`);
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
        throw new Error('BitcoinAnchorPsbtSerializer: trailing bytes after the unsigned transaction');
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
// Byte-level primitives.
// ---------------------------------------------------------------------

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

function readUInt32LE(bytes, offset) {
    return new DataView(bytes.buffer, bytes.byteOffset + offset, 4).getUint32(0, true);
}

function readUInt64LE(bytes, offset) {
    return Number(new DataView(bytes.buffer, bytes.byteOffset + offset, 8).getBigUint64(0, true));
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
        throw new Error('BitcoinAnchorPsbtSerializer: unexpected end of PSBT bytes');
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

// No btoa/Buffer dependency — this module runs identically under Node
// (tests) and in the browser (tests.html), so base64 is encoded and
// decoded by hand against a fixed alphabet rather than relying on a
// runtime-specific global.
function bytesToBase64(bytes) {
    let result = '';
    for (let i = 0; i < bytes.length; i += 3) {
        const b0 = bytes[i];
        const b1 = bytes[i + 1];
        const b2 = bytes[i + 2];
        const triplet = (b0 << 16) | ((b1 ?? 0) << 8) | (b2 ?? 0);
        result += BASE64_ALPHABET[(triplet >> 18) & 0x3f];
        result += BASE64_ALPHABET[(triplet >> 12) & 0x3f];
        result += b1 !== undefined ? BASE64_ALPHABET[(triplet >> 6) & 0x3f] : '=';
        result += b2 !== undefined ? BASE64_ALPHABET[triplet & 0x3f] : '=';
    }
    return result;
}

function base64ToBytes(base64) {
    const clean = base64.replace(/=+$/, '');
    const bytes = [];
    let buffer = 0;
    let bits = 0;
    for (const char of clean) {
        const value = BASE64_ALPHABET.indexOf(char);
        if (value === -1) {
            throw new Error('BitcoinAnchorPsbtSerializer: invalid base64 character');
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
    throw new Error('BitcoinAnchorPsbtSerializer: parse() accepts a Uint8Array, a hex string, or a base64 string');
}
