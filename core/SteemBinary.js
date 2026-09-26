import { sha224, sha256 } from '../vendor/noble-hashes/sha2.js';
import { ripemd160 } from '../vendor/noble-hashes/legacy.js';

// Steem's binary serialization (fc::raw::pack), as far as ForkBuild needs it
// to check a block offline: transactions and every operation a current
// Steem block carries, the signed block header, transaction ids, the
// transaction Merkle root and the block id. The operation layouts follow
// steemit/steem's protocol headers, as dsteem (which signs real Steem
// transactions) serializes them. Anything this file can't serialize (an
// operation it doesn't know, an asset or key it can't read) throws
// SteemSerializationError, never guesses.

export class SteemSerializationError extends Error {
    constructor(message) {
        super(message);
        this.name = 'SteemSerializationError';
    }
}

const TEXT_ENCODER = new TextEncoder();
const PUBLIC_KEY_PREFIX = 'STM';
const NULL_PUBLIC_KEY = 'STM1111111111111111111111111111111114T1Anm';

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
            throw new SteemSerializationError(`${value} is not an unsigned ${8 * size}-bit integer`);
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
            throw new SteemSerializationError(`${value} is not a signed ${8 * size}-bit integer`);
        }
        this.uint(value < 0 ? value + 2 ** (8 * size) : value, size);
    }

    int64(value) {
        let big;
        try {
            big = BigInt(value);
        } catch {
            throw new SteemSerializationError(`${value} is not an integer`);
        }
        const out = new Uint8Array(8);
        new DataView(out.buffer).setBigInt64(0, big, true);
        this.bytes(out);
    }

    varint32(value) {
        if (!Number.isInteger(value) || value < 0 || value > 0xffffffff) throw new SteemSerializationError(`${value} is not a varint32`);
        let rest = value;
        do {
            let byte = rest & 0x7f;
            rest = Math.floor(rest / 128);
            if (rest > 0) byte |= 0x80;
            this.bytes([byte]);
        } while (rest > 0);
    }

    string(value) {
        if (typeof value !== 'string') throw new SteemSerializationError(`expected a string, got ${typeof value}`);
        const encoded = TEXT_ENCODER.encode(value);
        this.varint32(encoded.length);
        this.bytes(encoded);
    }

    result() {
        return this._bytes.slice(0, this._length);
    }
}

// --- Encodings ---------------------------------------------------------

export function hexToBytes(hex) {
    if (typeof hex !== 'string' || hex.length % 2 !== 0 || !/^[0-9a-fA-F]*$/.test(hex)) {
        throw new SteemSerializationError('expected hex');
    }
    const out = new Uint8Array(hex.length / 2);
    for (let i = 0; i < out.length; i += 1) out[i] = Number.parseInt(hex.slice(2 * i, 2 * i + 2), 16);
    return out;
}

export function bytesToHex(bytes) {
    return Array.from(bytes, (byte) => byte.toString(16).padStart(2, '0')).join('');
}

const BASE58_ALPHABET = '123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz';

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

function base58Decode(text) {
    let value = 0n;
    for (const char of text) {
        const digit = BASE58_ALPHABET.indexOf(char);
        if (digit < 0) throw new SteemSerializationError(`"${char}" is not base58`);
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

// "STM…": the 33-byte compressed key and the first 4 bytes of its RIPEMD-160.
export function steemPublicKeyString(keyBytes) {
    const checksum = ripemd160(keyBytes).subarray(0, 4);
    const joined = new Uint8Array(keyBytes.length + 4);
    joined.set(keyBytes);
    joined.set(checksum, keyBytes.length);
    return PUBLIC_KEY_PREFIX + base58Encode(joined);
}

export function steemPublicKeyBytes(text) {
    if (typeof text !== 'string' || !text.startsWith(PUBLIC_KEY_PREFIX)) throw new SteemSerializationError(`"${text}" is not a Steem public key`);
    const decoded = base58Decode(text.slice(PUBLIC_KEY_PREFIX.length));
    if (decoded.length !== 37) throw new SteemSerializationError(`"${text}" is not a Steem public key`);
    const key = decoded.subarray(0, 33);
    const checksum = ripemd160(key).subarray(0, 4);
    if (!checksum.every((byte, i) => byte === decoded[33 + i])) throw new SteemSerializationError(`"${text}" has a wrong checksum`);
    return key;
}

// Steem times are UTC without a zone ("2026-09-26T10:00:00").
export function steemTimeSeconds(text) {
    if (typeof text !== 'string' || !/^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d$/.test(text)) throw new SteemSerializationError(`"${text}" is not a Steem time`);
    return Date.parse(`${text}Z`) / 1000;
}

// "0.23.0" → major << 24 | hardfork << 16 | release.
function versionNumber(text) {
    const match = typeof text === 'string' ? /^(\d+)\.(\d+)\.(\d+)$/.exec(text) : null;
    if (!match) throw new SteemSerializationError(`"${text}" is not a version`);
    const [major, hardfork, release] = match.slice(1).map(Number);
    if (major > 255 || hardfork > 255 || release > 65535) throw new SteemSerializationError(`"${text}" is not a version`);
    return major * 2 ** 24 + hardfork * 2 ** 16 + release;
}

// --- Field serializers -------------------------------------------------

const string = (w, v) => w.string(v);
const uint16 = (w, v) => w.uint(v, 2);
const uint32 = (w, v) => w.uint(v, 4);
const int16 = (w, v) => w.int(v, 2);
const int64 = (w, v) => w.int64(v);
const bool = (w, v) => {
    if (typeof v !== 'boolean') throw new SteemSerializationError(`expected a boolean, got ${typeof v}`);
    w.bytes([v ? 1 : 0]);
};
const time = (w, v) => w.uint(steemTimeSeconds(v), 4);
const array = (item) => (w, v) => {
    if (!Array.isArray(v)) throw new SteemSerializationError('expected an array');
    w.varint32(v.length);
    for (const entry of v) item(w, entry);
};
// An extensions field no Steem operation fills: only an empty list is known.
const noExtensions = (w, v) => {
    if (v !== undefined && (!Array.isArray(v) || v.length > 0)) throw new SteemSerializationError('unknown extensions');
    w.varint32(0);
};
const flatMap = (key, value) => (w, v) => {
    if (!Array.isArray(v)) throw new SteemSerializationError('expected a map as a list of pairs');
    w.varint32(v.length);
    for (const pair of v) {
        if (!Array.isArray(pair) || pair.length !== 2) throw new SteemSerializationError('expected a key and value pair');
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
    if (bytes.length !== size) throw new SteemSerializationError(`expected ${size} bytes, got ${bytes.length}`);
    w.bytes(bytes);
};
const binary = (w, v) => {
    const bytes = hexToBytes(v);
    w.varint32(bytes.length);
    w.bytes(bytes);
};
const publicKey = (w, v) => {
    if (v === null || v === NULL_PUBLIC_KEY) {
        w.bytes(new Uint8Array(33));
        return;
    }
    w.bytes(steemPublicKeyBytes(v));
};
// "1.000 STEEM": the amount in the smallest unit, the precision (digits
// after the point) and the symbol, padded to 7 bytes.
const asset = (w, v) => {
    const match = typeof v === 'string' ? /^(-?)(\d+)(?:\.(\d+))? ([A-Z]{1,7})$/.exec(v) : null;
    if (!match) throw new SteemSerializationError(`"${JSON.stringify(v)}" is not a Steem asset string`);
    const [, sign, whole, fraction = '', symbol] = match;
    const amount = BigInt(`${sign}${whole}${fraction}`);
    w.int64(amount);
    w.bytes([fraction.length]);
    const symbolBytes = new Uint8Array(7);
    symbolBytes.set(TEXT_ENCODER.encode(symbol));
    w.bytes(symbolBytes);
};
const object = (fields) => (w, v) => {
    if (!v || typeof v !== 'object') throw new SteemSerializationError('expected an object');
    for (const [name, serialize] of fields) {
        try {
            serialize(w, v[name]);
        } catch (error) {
            if (error instanceof SteemSerializationError) throw new SteemSerializationError(`${name}: ${error.message}`);
            throw error;
        }
    }
};
const staticVariant = (variants) => (w, v) => {
    if (!Array.isArray(v) || v.length !== 2 || !variants[v[0]]) throw new SteemSerializationError('unknown variant');
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
const chainProperties = object([['account_creation_fee', asset], ['maximum_block_size', uint32], ['sbd_interest_rate', uint16]]);

// A block header extension: void, a witness's running version, or its
// hardfork vote.
const blockHeaderExtension = staticVariant({
    0: () => {},
    1: (w, v) => w.uint(versionNumber(v), 4),
    2: object([['hf_version', (w, v) => w.uint(versionNumber(v), 4)], ['hf_time', time]])
});
const blockHeaderFields = [
    ['previous', fixedBinary(20)],
    ['timestamp', time],
    ['witness', string],
    ['transaction_merkle_root', fixedBinary(20)],
    ['extensions', array(blockHeaderExtension)]
];
const blockHeader = object(blockHeaderFields);
const signedBlockHeader = object([...blockHeaderFields, ['witness_signature', fixedBinary(65)]]);

// id → [name, fields], from steemit/steem's operations.hpp.
const OPERATIONS = {
    vote: [0, [['voter', string], ['author', string], ['permlink', string], ['weight', int16]]],
    comment: [1, [['parent_author', string], ['parent_permlink', string], ['author', string], ['permlink', string], ['title', string], ['body', string], ['json_metadata', string]]],
    transfer: [2, [['from', string], ['to', string], ['amount', asset], ['memo', string]]],
    transfer_to_vesting: [3, [['from', string], ['to', string], ['amount', asset]]],
    withdraw_vesting: [4, [['account', string], ['vesting_shares', asset]]],
    limit_order_create: [5, [['owner', string], ['orderid', uint32], ['amount_to_sell', asset], ['min_to_receive', asset], ['fill_or_kill', bool], ['expiration', time]]],
    limit_order_cancel: [6, [['owner', string], ['orderid', uint32]]],
    feed_publish: [7, [['publisher', string], ['exchange_rate', price]]],
    convert: [8, [['owner', string], ['requestid', uint32], ['amount', asset]]],
    account_create: [9, [['fee', asset], ['creator', string], ['new_account_name', string], ['owner', authority], ['active', authority], ['posting', authority], ['memo_key', publicKey], ['json_metadata', string]]],
    account_update: [10, [['account', string], ['owner', optional(authority)], ['active', optional(authority)], ['posting', optional(authority)], ['memo_key', publicKey], ['json_metadata', string]]],
    witness_update: [11, [['owner', string], ['url', string], ['block_signing_key', publicKey], ['props', chainProperties], ['fee', asset]]],
    account_witness_vote: [12, [['account', string], ['witness', string], ['approve', bool]]],
    account_witness_proxy: [13, [['account', string], ['proxy', string]]],
    custom: [15, [['required_auths', array(string)], ['id', uint16], ['data', binary]]],
    report_over_production: [16, [['reporter', string], ['first_block', signedBlockHeader], ['second_block', signedBlockHeader]]],
    delete_comment: [17, [['author', string], ['permlink', string]]],
    custom_json: [18, [['required_auths', array(string)], ['required_posting_auths', array(string)], ['id', string], ['json', string]]],
    comment_options: [19, [['author', string], ['permlink', string], ['max_accepted_payout', asset], ['percent_steem_dollars', uint16], ['allow_votes', bool], ['allow_curation_rewards', bool], ['extensions', array(staticVariant({ 0: object([['beneficiaries', array(beneficiary)]]) }))]]],
    set_withdraw_vesting_route: [20, [['from_account', string], ['to_account', string], ['percent', uint16], ['auto_vest', bool]]],
    limit_order_create2: [21, [['owner', string], ['orderid', uint32], ['amount_to_sell', asset], ['fill_or_kill', bool], ['exchange_rate', price], ['expiration', time]]],
    claim_account: [22, [['creator', string], ['fee', asset], ['extensions', noExtensions]]],
    create_claimed_account: [23, [['creator', string], ['new_account_name', string], ['owner', authority], ['active', authority], ['posting', authority], ['memo_key', publicKey], ['json_metadata', string], ['extensions', noExtensions]]],
    request_account_recovery: [24, [['recovery_account', string], ['account_to_recover', string], ['new_owner_authority', authority], ['extensions', noExtensions]]],
    recover_account: [25, [['account_to_recover', string], ['new_owner_authority', authority], ['recent_owner_authority', authority], ['extensions', noExtensions]]],
    change_recovery_account: [26, [['account_to_recover', string], ['new_recovery_account', string], ['extensions', noExtensions]]],
    escrow_transfer: [27, [['from', string], ['to', string], ['agent', string], ['escrow_id', uint32], ['sbd_amount', asset], ['steem_amount', asset], ['fee', asset], ['ratification_deadline', time], ['escrow_expiration', time], ['json_meta', string]]],
    escrow_dispute: [28, [['from', string], ['to', string], ['agent', string], ['who', string], ['escrow_id', uint32]]],
    escrow_release: [29, [['from', string], ['to', string], ['agent', string], ['who', string], ['receiver', string], ['escrow_id', uint32], ['sbd_amount', asset], ['steem_amount', asset]]],
    escrow_approve: [31, [['from', string], ['to', string], ['agent', string], ['who', string], ['escrow_id', uint32], ['approve', bool]]],
    transfer_to_savings: [32, [['from', string], ['to', string], ['amount', asset], ['memo', string]]],
    transfer_from_savings: [33, [['from', string], ['request_id', uint32], ['to', string], ['amount', asset], ['memo', string]]],
    cancel_transfer_from_savings: [34, [['from', string], ['request_id', uint32]]],
    custom_binary: [35, [['required_owner_auths', array(string)], ['required_active_auths', array(string)], ['required_posting_auths', array(string)], ['required_auths', array(authority)], ['id', string], ['data', binary]]],
    decline_voting_rights: [36, [['account', string], ['decline', bool]]],
    reset_account: [37, [['reset_account', string], ['account_to_reset', string], ['new_owner_authority', authority]]],
    set_reset_account: [38, [['account', string], ['current_reset_account', string], ['reset_account', string]]],
    claim_reward_balance: [39, [['account', string], ['reward_steem', asset], ['reward_sbd', asset], ['reward_vests', asset]]],
    delegate_vesting_shares: [40, [['delegator', string], ['delegatee', string], ['vesting_shares', asset]]],
    account_create_with_delegation: [41, [['fee', asset], ['delegation', asset], ['creator', string], ['new_account_name', string], ['owner', authority], ['active', authority], ['posting', authority], ['memo_key', publicKey], ['json_metadata', string], ['extensions', noExtensions]]],
    witness_set_properties: [42, [['owner', string], ['props', flatMap(string, binary)], ['extensions', noExtensions]]],
    account_update2: [43, [['account', string], ['owner', optional(authority)], ['active', optional(authority)], ['posting', optional(authority)], ['memo_key', optional(publicKey)], ['json_metadata', string], ['posting_json_metadata', string], ['extensions', noExtensions]]],
    create_proposal: [44, [['creator', string], ['receiver', string], ['start_date', time], ['end_date', time], ['daily_pay', asset], ['subject', string], ['permlink', string], ['extensions', noExtensions]]],
    update_proposal_votes: [45, [['voter', string], ['proposal_ids', array(int64)], ['approve', bool], ['extensions', noExtensions]]],
    remove_proposal: [46, [['proposal_owner', string], ['proposal_ids', array(int64)], ['extensions', noExtensions]]]
};
const OPERATION_SERIALIZERS = Object.fromEntries(Object.entries(OPERATIONS).map(([name, [id, fields]]) => [name, { id, serialize: object(fields) }]));

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
    const known = OPERATION_SERIALIZERS[name];
    if (!known) throw new SteemSerializationError(`no serializer for operation "${name}"`);
    w.varint32(known.id);
    try {
        known.serialize(w, data);
    } catch (error) {
        if (error instanceof SteemSerializationError) throw new SteemSerializationError(`${name}: ${error.message}`);
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

// --- What a block check needs -------------------------------------------

export const packSteemTransaction = (tx) => pack(transaction, tx);
export const packSteemSignedTransaction = (tx) => pack(signedTransaction, tx);
export const packSteemBlockHeader = (header) => pack(blockHeader, header);
export const packSteemSignedBlockHeader = (header) => pack(signedBlockHeader, header);

// The first 20 bytes of SHA-256 over the unsigned transaction, as hex.
export function steemTransactionId(tx) {
    return bytesToHex(sha256(packSteemTransaction(tx)).subarray(0, 20));
}

// SHA-256 over the signed transaction: a leaf of the block's Merkle tree.
export function steemTransactionMerkleDigest(tx) {
    return sha256(packSteemSignedTransaction(tx));
}

// What the witness signs: SHA-256 over the unsigned header.
export function steemBlockHeaderDigest(header) {
    return sha256(packSteemBlockHeader(header));
}

// SHA-224 over the signed header, cut to 20 bytes, with the block number
// (one more than the previous block's) in its first 4 bytes, big endian.
export function steemBlockId(signedHeader) {
    const hash = sha224(packSteemSignedBlockHeader(signedHeader)).slice(0, 20);
    const previousNumber = new DataView(hexToBytes(signedHeader.previous).buffer).getUint32(0, false);
    new DataView(hash.buffer).setUint32(0, previousNumber + 1, false);
    return bytesToHex(hash);
}

// Steem's transaction Merkle tree: pairs hashed with SHA-256, an odd last
// digest carried up unchanged, and the root cut down with RIPEMD-160.
// Returns the root as hex, and, for `index`, the sibling digests from the
// leaf up (`{ position: 'left' | 'right', hash }`).
export function steemMerkleTree(digests, index = null) {
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

// The root reached from one leaf digest and its path.
export function steemMerkleRootFromPath(digest, path) {
    let current = Uint8Array.from(digest);
    for (const step of path) {
        const sibling = hexToBytes(step.hash);
        if (sibling.length !== 32) throw new SteemSerializationError('a Merkle path hash is not 32 bytes');
        if (step.position === 'left') current = sha256(concat(sibling, current));
        else if (step.position === 'right') current = sha256(concat(current, sibling));
        else throw new SteemSerializationError('a Merkle path step is neither left nor right');
    }
    return bytesToHex(ripemd160(current));
}

function concat(a, b) {
    const out = new Uint8Array(a.length + b.length);
    out.set(a);
    out.set(b, a.length);
    return out;
}
