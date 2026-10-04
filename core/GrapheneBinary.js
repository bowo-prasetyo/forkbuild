import { sha224, sha256 } from '../vendor/noble-hashes/sha2.js';
import { ripemd160 } from '../vendor/noble-hashes/legacy.js';

// The binary serialization (fc::raw::pack) that Steem and its forks share,
// as far as ForkBuild needs it to check a block offline: transactions, the
// signed block header, transaction ids, the transaction Merkle root and the
// block id. A chain supplies what differs: its operation table, its key
// prefix, its block header extensions and the error class it throws.
// core/SteemBinary.js and core/BlurtBinary.js are the two chains. Anything
// a chain can't serialize (an operation it doesn't know, an asset or key it
// can't read) throws that error, never guesses.

const TEXT_ENCODER = new TextEncoder();
const BASE58_ALPHABET = '123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz';

// `defineOperations(fields)` returns `{ name: [id, [[field, serializer], …]] }`
// from the field serializers given to it; `headerExtensions(fields)` the
// block header extension variants by number.
export function createGrapheneBinary({ chainName, publicKeyPrefix, SerializationError, defineOperations, headerExtensions }) {
    const nullPublicKey = `${publicKeyPrefix}1111111111111111111111111111111114T1Anm`;

    class Writer {
        constructor() {
            this._bytes = new Uint8Array(256);
            this._length = 0;
        }

        _reserve(count) {
            if (this._length + count <= this._bytes.length) return;
            const grown = new Uint8Array(Math.max(this._bytes.length * 2, this._length + count));
            grown.set(this._bytes.subarray(0, this._length));
            this._bytes = grown;
        }

        bytes(data) {
            this._reserve(data.length);
            this._bytes.set(data, this._length);
            this._length += data.length;
        }

        uint(value, size) {
            if (!Number.isInteger(value) || value < 0 || value >= 2 ** (8 * size)) {
                throw new SerializationError(`${value} is not an unsigned ${8 * size}-bit integer`);
            }
            const out = new Uint8Array(size);
            let rest = value;
            for (let i = 0; i < size; i += 1) {
                out[i] = rest % 256;
                rest = Math.floor(rest / 256);
            }
            this.bytes(out);
        }

        int(value, size) {
            if (!Number.isInteger(value) || value < -(2 ** (8 * size - 1)) || value >= 2 ** (8 * size - 1)) {
                throw new SerializationError(`${value} is not a signed ${8 * size}-bit integer`);
            }
            this.uint(value < 0 ? value + 2 ** (8 * size) : value, size);
        }

        int64(value) {
            let big;
            try {
                big = BigInt(value);
            } catch {
                throw new SerializationError(`${value} is not an integer`);
            }
            const out = new Uint8Array(8);
            new DataView(out.buffer).setBigInt64(0, big, true);
            this.bytes(out);
        }

        varint32(value) {
            if (!Number.isInteger(value) || value < 0 || value > 0xffffffff) throw new SerializationError(`${value} is not a varint32`);
            let rest = value;
            do {
                let byte = rest & 0x7f;
                rest = Math.floor(rest / 128);
                if (rest > 0) byte |= 0x80;
                this.bytes([byte]);
            } while (rest > 0);
        }

        string(value) {
            if (typeof value !== 'string') throw new SerializationError(`expected a string, got ${typeof value}`);
            const encoded = TEXT_ENCODER.encode(value);
            this.varint32(encoded.length);
            this.bytes(encoded);
        }

        result() {
            return this._bytes.slice(0, this._length);
        }
    }

    // --- Encodings -----------------------------------------------------

    function hexToBytes(hex) {
        if (typeof hex !== 'string' || hex.length % 2 !== 0 || !/^[0-9a-fA-F]*$/.test(hex)) {
            throw new SerializationError('expected hex');
        }
        const out = new Uint8Array(hex.length / 2);
        for (let i = 0; i < out.length; i += 1) out[i] = Number.parseInt(hex.slice(2 * i, 2 * i + 2), 16);
        return out;
    }

    function base58Decode(text) {
        let value = 0n;
        for (const char of text) {
            const digit = BASE58_ALPHABET.indexOf(char);
            if (digit < 0) throw new SerializationError(`"${char}" is not base58`);
            value = value * 58n + BigInt(digit);
        }
        const bytes = [];
        while (value > 0n) {
            bytes.unshift(Number(value % 256n));
            value /= 256n;
        }
        for (const char of text) {
            if (char !== '1') break;
            bytes.unshift(0);
        }
        return Uint8Array.from(bytes);
    }

    // "<prefix>…": the 33-byte compressed key and the first 4 bytes of its
    // RIPEMD-160.
    function publicKeyString(keyBytes) {
        const checksum = ripemd160(keyBytes).subarray(0, 4);
        const joined = new Uint8Array(keyBytes.length + 4);
        joined.set(keyBytes);
        joined.set(checksum, keyBytes.length);
        return publicKeyPrefix + base58Encode(joined);
    }

    function publicKeyBytes(text) {
        if (typeof text !== 'string' || !text.startsWith(publicKeyPrefix)) throw new SerializationError(`"${text}" is not a ${chainName} public key`);
        const decoded = base58Decode(text.slice(publicKeyPrefix.length));
        if (decoded.length !== 37) throw new SerializationError(`"${text}" is not a ${chainName} public key`);
        const key = decoded.subarray(0, 33);
        const checksum = ripemd160(key).subarray(0, 4);
        if (!checksum.every((byte, i) => byte === decoded[33 + i])) throw new SerializationError(`"${text}" has a wrong checksum`);
        return key;
    }

    // Times are UTC without a zone ("2026-09-26T10:00:00").
    function timeSeconds(text) {
        if (typeof text !== 'string' || !/^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d$/.test(text)) throw new SerializationError(`"${text}" is not a ${chainName} time`);
        return Date.parse(`${text}Z`) / 1000;
    }

    // "0.23.0" → major << 24 | hardfork << 16 | release.
    function versionNumber(text) {
        const match = typeof text === 'string' ? /^(\d+)\.(\d+)\.(\d+)$/.exec(text) : null;
        if (!match) throw new SerializationError(`"${text}" is not a version`);
        const [major, hardfork, release] = match.slice(1).map(Number);
        if (major > 255 || hardfork > 255 || release > 65535) throw new SerializationError(`"${text}" is not a version`);
        return major * 2 ** 24 + hardfork * 2 ** 16 + release;
    }

    // --- Field serializers ---------------------------------------------

    const string = (w, v) => w.string(v);
    const uint16 = (w, v) => w.uint(v, 2);
    const uint32 = (w, v) => w.uint(v, 4);
    const int16 = (w, v) => w.int(v, 2);
    const int64 = (w, v) => w.int64(v);
    const bool = (w, v) => {
        if (typeof v !== 'boolean') throw new SerializationError(`expected a boolean, got ${typeof v}`);
        w.bytes([v ? 1 : 0]);
    };
    const time = (w, v) => w.uint(timeSeconds(v), 4);
    const version = (w, v) => w.uint(versionNumber(v), 4);
    const array = (item) => (w, v) => {
        if (!Array.isArray(v)) throw new SerializationError('expected an array');
        w.varint32(v.length);
        for (const entry of v) item(w, entry);
    };
    // An extensions field no operation fills: only an empty list is known.
    const noExtensions = (w, v) => {
        if (v !== undefined && (!Array.isArray(v) || v.length > 0)) throw new SerializationError('unknown extensions');
        w.varint32(0);
    };
    const flatMap = (key, value) => (w, v) => {
        if (!Array.isArray(v)) throw new SerializationError('expected a map as a list of pairs');
        w.varint32(v.length);
        for (const pair of v) {
            if (!Array.isArray(pair) || pair.length !== 2) throw new SerializationError('expected a key and value pair');
            key(w, pair[0]);
            value(w, pair[1]);
        }
    };
    const optional = (item) => (w, v) => {
        if (v === undefined || v === null) {
            w.bytes([0]);
        } else {
            w.bytes([1]);
            item(w, v);
        }
    };
    const fixedBinary = (size) => (w, v) => {
        const bytes = hexToBytes(v);
        if (bytes.length !== size) throw new SerializationError(`expected ${size} bytes, got ${bytes.length}`);
        w.bytes(bytes);
    };
    const binary = (w, v) => {
        const bytes = hexToBytes(v);
        w.varint32(bytes.length);
        w.bytes(bytes);
    };
    const publicKey = (w, v) => {
        if (v === null || v === nullPublicKey) {
            w.bytes(new Uint8Array(33));
            return;
        }
        w.bytes(publicKeyBytes(v));
    };
    // "1.000 STEEM": the amount in the smallest unit, the precision (digits
    // after the point) and the symbol, padded to 7 bytes.
    const asset = (w, v) => {
        const match = typeof v === 'string' ? /^(-?)(\d+)(?:\.(\d+))? ([A-Z]{1,7})$/.exec(v) : null;
        if (!match) throw new SerializationError(`"${JSON.stringify(v)}" is not a ${chainName} asset string`);
        const [, sign, whole, fraction = '', symbol] = match;
        const amount = BigInt(`${sign}${whole}${fraction}`);
        w.int64(amount);
        w.bytes([fraction.length]);
        const symbolBytes = new Uint8Array(7);
        symbolBytes.set(TEXT_ENCODER.encode(symbol));
        w.bytes(symbolBytes);
    };
    const object = (fields) => (w, v) => {
        if (!v || typeof v !== 'object') throw new SerializationError('expected an object');
        for (const [name, serialize] of fields) {
            try {
                serialize(w, v[name]);
            } catch (error) {
                if (error instanceof SerializationError) throw new SerializationError(`${name}: ${error.message}`);
                throw error;
            }
        }
    };
    const staticVariant = (variants) => (w, v) => {
        if (!Array.isArray(v) || v.length !== 2 || !variants[v[0]]) throw new SerializationError('unknown variant');
        w.varint32(v[0]);
        variants[v[0]](w, v[1]);
    };

    const authority = object([
        ['weight_threshold', uint32],
        ['account_auths', flatMap(string, uint16)],
        ['key_auths', flatMap(publicKey, uint16)]
    ]);
    const price = object([['base', asset], ['quote', asset]]);
    const beneficiary = object([['account', string], ['weight', uint16]]);

    const fields = Object.freeze({
        string, uint16, uint32, int16, int64, bool, time, version, array, noExtensions, flatMap, optional,
        fixedBinary, binary, publicKey, asset, object, staticVariant, authority, price, beneficiary
    });

    const blockHeaderExtension = staticVariant(headerExtensions(fields));
    const blockHeaderFields = [
        ['previous', fixedBinary(20)],
        ['timestamp', time],
        ['witness', string],
        ['transaction_merkle_root', fixedBinary(20)],
        ['extensions', array(blockHeaderExtension)]
    ];
    const blockHeader = object(blockHeaderFields);
    const signedBlockHeader = object([...blockHeaderFields, ['witness_signature', fixedBinary(65)]]);

    const operationSerializers = Object.fromEntries(Object.entries(defineOperations({ ...fields, signedBlockHeader }))
        .map(([name, [id, operationFields]]) => [name, { id, serialize: object(operationFields) }]));

    // condenser_api's ['name', {…}], or appbase's { type: 'name_operation', value }.
    function operation(w, v) {
        let name;
        let data;
        if (Array.isArray(v)) {
            [name, data] = v;
        } else if (v && typeof v === 'object' && typeof v.type === 'string') {
            name = v.type.replace(/_operation$/, '');
            data = v.value;
        }
        const known = Object.hasOwn(operationSerializers, name) ? operationSerializers[name] : null;
        if (!known) throw new SerializationError(`no serializer for operation "${name}"`);
        w.varint32(known.id);
        try {
            known.serialize(w, data);
        } catch (error) {
            if (error instanceof SerializationError) throw new SerializationError(`${name}: ${error.message}`);
            throw error;
        }
    }

    const transactionFields = [
        ['ref_block_num', uint16],
        ['ref_block_prefix', uint32],
        ['expiration', time],
        ['operations', array(operation)],
        ['extensions', noExtensions]
    ];
    const transaction = object(transactionFields);
    const signedTransaction = object([...transactionFields, ['signatures', array(fixedBinary(65))]]);

    function pack(serializer, value) {
        const w = new Writer();
        serializer(w, value);
        return w.result();
    }

    const packTransaction = (tx) => pack(transaction, tx);
    const packSignedTransaction = (tx) => pack(signedTransaction, tx);
    const packBlockHeader = (header) => pack(blockHeader, header);
    const packSignedBlockHeader = (header) => pack(signedBlockHeader, header);

    // SHA-224 over the signed header, cut to 20 bytes, with the block number
    // (one more than the previous block's) in its first 4 bytes, big endian.
    function blockId(signedHeader) {
        const hash = sha224(packSignedBlockHeader(signedHeader)).slice(0, 20);
        const previousNumber = new DataView(hexToBytes(signedHeader.previous).buffer).getUint32(0, false);
        new DataView(hash.buffer).setUint32(0, previousNumber + 1, false);
        return bytesToHex(hash);
    }

    // The root reached from one leaf digest and its path.
    function merkleRootFromPath(digest, path) {
        let current = Uint8Array.from(digest);
        for (const step of path) {
            const sibling = hexToBytes(step.hash);
            if (sibling.length !== 32) throw new SerializationError('a Merkle path hash is not 32 bytes');
            if (step.position === 'left') current = sha256(concat(sibling, current));
            else if (step.position === 'right') current = sha256(concat(current, sibling));
            else throw new SerializationError('a Merkle path step is neither left nor right');
        }
        return bytesToHex(ripemd160(current));
    }

    return Object.freeze({
        hexToBytes,
        bytesToHex,
        publicKeyString,
        publicKeyBytes,
        timeSeconds,
        packTransaction,
        packSignedTransaction,
        packBlockHeader,
        packSignedBlockHeader,
        // The first 20 bytes of SHA-256 over the unsigned transaction, as hex.
        transactionId: (tx) => bytesToHex(sha256(packTransaction(tx)).subarray(0, 20)),
        // SHA-256 over the signed transaction: a leaf of the block's Merkle tree.
        transactionMerkleDigest: (tx) => sha256(packSignedTransaction(tx)),
        // What the witness signs: SHA-256 over the unsigned header.
        blockHeaderDigest: (header) => sha256(packBlockHeader(header)),
        blockId,
        merkleTree,
        merkleRootFromPath
    });
}

export function bytesToHex(bytes) {
    return Array.from(bytes, (byte) => byte.toString(16).padStart(2, '0')).join('');
}

function base58Encode(bytes) {
    let value = 0n;
    for (const byte of bytes) value = value * 256n + BigInt(byte);
    let out = '';
    while (value > 0n) {
        out = BASE58_ALPHABET[Number(value % 58n)] + out;
        value /= 58n;
    }
    for (const byte of bytes) {
        if (byte !== 0) break;
        out = '1' + out;
    }
    return out;
}

// The transaction Merkle tree: pairs hashed with SHA-256, an odd last
// digest carried up unchanged, and the root cut down with RIPEMD-160.
// Returns the root as hex, and, for `index`, the sibling digests from the
// leaf up (`{ position: 'left' | 'right', hash }`).
function merkleTree(digests, index = null) {
    if (digests.length === 0) return { root: '0'.repeat(40), path: [] };
    let level = digests.map((digest) => Uint8Array.from(digest));
    let position = index;
    const path = [];
    while (level.length > 1) {
        const next = [];
        for (let i = 0; i + 1 < level.length; i += 2) {
            if (position === i) path.push({ position: 'right', hash: bytesToHex(level[i + 1]) });
            if (position === i + 1) path.push({ position: 'left', hash: bytesToHex(level[i]) });
            next.push(sha256(concat(level[i], level[i + 1])));
        }
        if (level.length % 2 === 1) next.push(level[level.length - 1]);
        if (position !== null) position = Math.floor(position / 2);
        level = next;
    }
    return { root: bytesToHex(ripemd160(level[0])), path };
}

function concat(a, b) {
    const out = new Uint8Array(a.length + b.length);
    out.set(a);
    out.set(b, a.length);
    return out;
}
