import { sha256 } from '../vendor/noble-hashes/sha2.js';
import { isSteemAccountName } from './SteemDiscoveryThread.js';
import { bytesToHex, hexToBytes } from './SteemBinary.js';

// The Steem anchor format (docs/Protocol.md, "Proposed: Steem Anchoring"):
// one `custom_json` operation carrying a Publication's own contentHash, or
// the Merkle root of several (a batch), and the `{ blockNum, trxId, chain }`
// proof that names the transaction holding it. A batch anchor's proof adds
// `batch: { path }`, the steps from its contentHash to the root, and any
// proof may carry `evidence`, the kept block (core/SteemBlockEvidence.js).
// Shared by the publisher, which writes the operation, and the verifier,
// which finds it again in a block.

export const STEEM_ANCHOR_TYPE = 'steem';
export const STEEM_ANCHOR_CUSTOM_JSON_ID = 'forkbuild-anchor';
export const STEEM_ANCHOR_CHAIN = 'steem';
export const STEEM_ANCHOR_VERSION = 1;

// A Steem transaction id is the first 20 bytes of the transaction digest.
const TRANSACTION_ID_PATTERN = /^[0-9a-f]{40}$/;
// contentHash is carried as text, never re-encoded; this only keeps the
// operation small and printable.
const MAX_CONTENT_HASH_LENGTH = 256;
// One Keychain approval anchors at most this many Publications.
export const STEEM_ANCHOR_MAX_BATCH = 64;
const MAX_BATCH_PATH_STEPS = 16;
const HASH_PATTERN = /^[0-9a-f]{64}$/;
const TEXT_ENCODER = new TextEncoder();

export function isSteemTransactionId(value) {
    return typeof value === 'string' && TRANSACTION_ID_PATTERN.test(value);
}

export function isSteemAnchorContentHash(value) {
    return typeof value === 'string' && value.length > 0 && value.length <= MAX_CONTENT_HASH_LENGTH && value.trim() === value;
}

// The one operation of an anchor transaction, signed with `account`'s
// posting key: `{ version, contentHash }` for one Publication, or
// `{ version, merkleRoot, count }` for a batch.
export function steemAnchorOperations({ account, contentHash = null, merkleRoot = null, count = null }) {
    if (!isSteemAccountName(account)) throw new TypeError(`"${account}" is not a Steem account name`);
    let payload;
    if (merkleRoot !== null) {
        if (!HASH_PATTERN.test(merkleRoot)) throw new TypeError('merkleRoot must be 64 lowercase hex characters');
        if (!Number.isSafeInteger(count) || count < 2 || count > STEEM_ANCHOR_MAX_BATCH) throw new TypeError(`a batch anchors 2 to ${STEEM_ANCHOR_MAX_BATCH} contentHashes`);
        payload = { version: STEEM_ANCHOR_VERSION, merkleRoot, count };
    } else {
        if (!isSteemAnchorContentHash(contentHash)) throw new TypeError('contentHash must be a non-empty string without surrounding spaces');
        payload = { version: STEEM_ANCHOR_VERSION, contentHash };
    }
    return [['custom_json', {
        required_auths: [],
        required_posting_auths: [account],
        id: STEEM_ANCHOR_CUSTOM_JSON_ID,
        json: JSON.stringify(payload)
    }]];
}

// A batch's Merkle tree over distinct contentHashes, in the order given.
// Leaves and inner nodes are domain-separated (0x00 and 0x01 prefixes, as
// in RFC 6962), so a leaf can never pass for an inner node; an odd last
// node is carried up unchanged. Returns `{ merkleRoot, count, paths }`,
// `paths` mapping each contentHash to its steps (`{ position, hash }`,
// the sibling's side and hash, from the leaf up).
export function steemAnchorBatch(contentHashes) {
    const unique = [...new Set(contentHashes)];
    if (unique.length < 2 || unique.length > STEEM_ANCHOR_MAX_BATCH) throw new TypeError(`a batch anchors 2 to ${STEEM_ANCHOR_MAX_BATCH} distinct contentHashes`);
    for (const hash of unique) {
        if (!isSteemAnchorContentHash(hash)) throw new TypeError('every contentHash must be a non-empty string without surrounding spaces');
    }
    let level = unique.map((hash, index) => ({ hash: batchLeafHash(hash), members: [index] }));
    const paths = unique.map(() => []);
    while (level.length > 1) {
        const next = [];
        for (let i = 0; i + 1 < level.length; i += 2) {
            const [left, right] = [level[i], level[i + 1]];
            for (const member of left.members) paths[member].push({ position: 'right', hash: bytesToHex(right.hash) });
            for (const member of right.members) paths[member].push({ position: 'left', hash: bytesToHex(left.hash) });
            next.push({ hash: batchNodeHash(left.hash, right.hash), members: [...left.members, ...right.members] });
        }
        if (level.length % 2 === 1) next.push(level[level.length - 1]);
        level = next;
    }
    return {
        merkleRoot: bytesToHex(level[0].hash),
        count: unique.length,
        paths: new Map(unique.map((hash, index) => [hash, paths[index]]))
    };
}

// The batch root a contentHash and its path lead to.
export function steemAnchorBatchRoot(contentHash, path) {
    let current = batchLeafHash(contentHash);
    for (const step of path) {
        const sibling = hexToBytes(step.hash);
        current = step.position === 'left' ? batchNodeHash(sibling, current) : batchNodeHash(current, sibling);
    }
    return bytesToHex(current);
}

function batchLeafHash(contentHash) {
    const text = TEXT_ENCODER.encode(contentHash);
    const input = new Uint8Array(text.length + 1);
    input.set(text, 1);
    return sha256(input);
}

function batchNodeHash(left, right) {
    const input = new Uint8Array(65);
    input[0] = 1;
    input.set(left, 1);
    input.set(right, 33);
    return sha256(input);
}

export function steemAnchorLocator(trxId) {
    return `steem:${trxId}`;
}

// Returns `{ blockNum, trxId, chain, batchPath, evidence }` (batchPath and
// evidence null when absent), or `{ error }` naming what is wrong. The
// evidence's own contents are checked by core/SteemBlockEvidence.js.
export function parseSteemAnchorProof(proof) {
    if (!proof || typeof proof !== 'object') return { error: 'proof is missing or not an object' };
    const { blockNum, trxId, chain, batch = null, evidence = null } = proof;
    if (chain !== STEEM_ANCHOR_CHAIN) return { error: `proof names chain "${chain}", not "${STEEM_ANCHOR_CHAIN}"` };
    if (!Number.isSafeInteger(blockNum) || blockNum < 1) return { error: 'proof.blockNum is not a positive block number' };
    if (!isSteemTransactionId(trxId)) return { error: 'proof.trxId is not a 40-character hex Steem transaction id' };
    let batchPath = null;
    if (batch !== null) {
        const path = batch?.path;
        const wellFormed = Array.isArray(path) && path.length > 0 && path.length <= MAX_BATCH_PATH_STEPS
            && path.every((step) => step && (step.position === 'left' || step.position === 'right') && HASH_PATTERN.test(step.hash));
        if (!wellFormed) return { error: 'proof.batch.path is not a list of left/right steps with 64-character hex hashes' };
        batchPath = path;
    }
    if (evidence !== null && typeof evidence !== 'object') return { error: 'proof.evidence is not an object' };
    return { blockNum, trxId, chain, batchPath, evidence };
}

// What an anchor transaction must carry for this proof and contentHash:
// the contentHash itself, or the batch root its path leads to.
export function steemAnchorTarget(contentHash, batchPath) {
    return batchPath ? { merkleRoot: steemAnchorBatchRoot(contentHash, batchPath) } : { contentHash };
}

// The block number a Steem block id starts with (its first 4 bytes, big
// endian), or NaN. Lets a verifier tell that a node returned the block it
// was asked for.
export function steemBlockNumberOfId(blockId) {
    if (typeof blockId !== 'string' || !/^[0-9a-f]{40}$/.test(blockId)) return NaN;
    return Number.parseInt(blockId.slice(0, 8), 16);
}

// True when `transaction` (as a block returns it) holds a ForkBuild anchor
// operation for `target`, optionally signed by `account`. `target` is a
// contentHash, `{ contentHash }`, or a batch's `{ merkleRoot }`; either is
// compared exactly.
export function steemTransactionAnchors(transaction, target, { account = null } = {}) {
    const { contentHash = null, merkleRoot = null } = typeof target === 'string' ? { contentHash: target } : (target ?? {});
    const operations = Array.isArray(transaction?.operations) ? transaction.operations : [];
    return operations.some((operation) => {
        const customJson = customJsonOf(operation);
        if (!customJson || customJson.id !== STEEM_ANCHOR_CUSTOM_JSON_ID) return false;
        if (account !== null && !(customJson.required_posting_auths ?? []).includes(account)) return false;
        let payload;
        try {
            payload = JSON.parse(customJson.json);
        } catch {
            return false;
        }
        if (payload?.version !== STEEM_ANCHOR_VERSION) return false;
        return merkleRoot !== null
            ? typeof payload.merkleRoot === 'string' && payload.merkleRoot === merkleRoot
            : typeof payload.contentHash === 'string' && payload.contentHash === contentHash;
    });
}

// condenser_api returns operations as ['custom_json', {...}]; block_api and
// newer nodes as { type: 'custom_json_operation', value: {...} }.
function customJsonOf(operation) {
    if (Array.isArray(operation) && operation[0] === 'custom_json') return operation[1] ?? null;
    if (operation && typeof operation === 'object' && operation.type === 'custom_json_operation') return operation.value ?? null;
    return null;
}
