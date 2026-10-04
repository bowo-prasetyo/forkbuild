import { STEEM_ANCHOR_MAX_BATCH, isSteemAnchorContentHash, steemAnchorBatch, steemAnchorBatchRoot, steemBlockNumberOfId } from './SteemAnchor.js';
import { BLURT_POST_VERSION, blurtPostCommitments, isBlurtAccountName } from './BlurtPost.js';

// The Blurt anchor format (docs/Protocol.md, "Proposed: Blurt Substrate",
// "Anchoring"): a transaction that commits to a Publication's contentHash,
// either a `comment` by the anchoring account whose ForkBuild metadata lists
// it (a build post, an edit of one, or a content manifest) or, for a batch,
// a `forkbuild-anchor` custom_json with a Merkle root, built as on Steem.
// The proof `{ blockNum, trxId, chain, batch?, evidence?, post? }` names
// the transaction.

export const BLURT_ANCHOR_TYPE = 'blurt';
export const BLURT_ANCHOR_CHAIN = 'blurt';
export const BLURT_ANCHOR_CUSTOM_JSON_ID = 'forkbuild-anchor';
export const BLURT_ANCHOR_MAX_BATCH = STEEM_ANCHOR_MAX_BATCH;
// The Merkle tree over a batch's contentHashes is Steem's, unchanged.
export const blurtAnchorBatch = steemAnchorBatch;
export const blurtBlockNumberOfId = steemBlockNumberOfId;
export const isBlurtAnchorContentHash = isSteemAnchorContentHash;

const TRANSACTION_ID_PATTERN = /^[0-9a-f]{40}$/;
const HASH_PATTERN = /^[0-9a-f]{64}$/;
const MAX_BATCH_PATH_STEPS = 16;
const PERMLINK_PATTERN = /^[a-z0-9-]{1,256}$/;

export function isBlurtTransactionId(value) {
    return typeof value === 'string' && TRANSACTION_ID_PATTERN.test(value);
}

export function blurtAnchorLocator(trxId) {
    return `${BLURT_ANCHOR_CHAIN}:${trxId}`;
}

// The batch anchor operation: one custom_json signed with `account`'s
// posting key.
export function blurtBatchAnchorOperations({ account, merkleRoot, count }) {
    if (!isBlurtAccountName(account)) throw new TypeError(`"${account}" is not a Blurt account name`);
    if (!HASH_PATTERN.test(merkleRoot)) throw new TypeError('merkleRoot must be 64 lowercase hex characters');
    if (!Number.isSafeInteger(count) || count < 2 || count > BLURT_ANCHOR_MAX_BATCH) throw new TypeError(`a batch anchors 2 to ${BLURT_ANCHOR_MAX_BATCH} contentHashes`);
    return [['custom_json', {
        required_auths: [],
        required_posting_auths: [account],
        id: BLURT_ANCHOR_CUSTOM_JSON_ID,
        json: JSON.stringify({ version: BLURT_POST_VERSION, merkleRoot, count })
    }]];
}

// Returns `{ blockNum, trxId, chain, batchPath, evidence, post }` (the last
// three null when absent), or `{ error }` naming what is wrong.
export function parseBlurtAnchorProof(proof) {
    if (!proof || typeof proof !== 'object') return { error: 'proof is missing or not an object' };
    const { blockNum, trxId, chain, batch = null, evidence = null, post = null } = proof;
    if (chain !== BLURT_ANCHOR_CHAIN) return { error: `proof names chain "${chain}", not "${BLURT_ANCHOR_CHAIN}"` };
    if (!Number.isSafeInteger(blockNum) || blockNum < 1) return { error: 'proof.blockNum is not a positive block number' };
    if (!isBlurtTransactionId(trxId)) return { error: 'proof.trxId is not a 40-character hex Blurt transaction id' };
    let batchPath = null;
    if (batch !== null) {
        const path = batch?.path;
        const wellFormed = Array.isArray(path) && path.length > 0 && path.length <= MAX_BATCH_PATH_STEPS
            && path.every((step) => step && (step.position === 'left' || step.position === 'right') && HASH_PATTERN.test(step.hash));
        if (!wellFormed) return { error: 'proof.batch.path is not a list of left/right steps with 64-character hex hashes' };
        batchPath = path;
    }
    if (evidence !== null && typeof evidence !== 'object') return { error: 'proof.evidence is not an object' };
    const named = post && isBlurtAccountName(post.author) && PERMLINK_PATTERN.test(post.permlink ?? '') ? { author: post.author, permlink: post.permlink } : null;
    return { blockNum, trxId, chain, batchPath, evidence, post: named };
}

// What an anchor transaction must commit to: the contentHash itself, or the
// batch root its path leads to.
export function blurtAnchorTarget(contentHash, batchPath) {
    return batchPath ? { merkleRoot: steemAnchorBatchRoot(contentHash, batchPath) } : { contentHash };
}

// True when `transaction` (as a block returns it) commits to `target`
// (`{ contentHash }` or a batch's `{ merkleRoot }`), optionally by
// `account`. A contentHash is committed to by a ForkBuild `comment` or a
// single-hash custom_json; a Merkle root only by a custom_json.
export function blurtTransactionAnchors(transaction, target, { account = null } = {}) {
    const { contentHash = null, merkleRoot = null } = target ?? {};
    const operations = Array.isArray(transaction?.operations) ? transaction.operations : [];
    return operations.some((operation) => {
        const [name, data] = operationParts(operation);
        if (name === 'comment' && contentHash !== null) {
            if (account !== null && data?.author !== account) return false;
            return blurtPostCommitments(data?.json_metadata).has(contentHash);
        }
        if (name !== 'custom_json' || data?.id !== BLURT_ANCHOR_CUSTOM_JSON_ID) return false;
        if (account !== null && !(data.required_posting_auths ?? []).includes(account)) return false;
        let payload;
        try {
            payload = JSON.parse(data.json);
        } catch {
            return false;
        }
        if (payload?.version !== BLURT_POST_VERSION) return false;
        return merkleRoot !== null
            ? typeof payload.merkleRoot === 'string' && payload.merkleRoot === merkleRoot
            : typeof payload.contentHash === 'string' && payload.contentHash === contentHash;
    });
}

// condenser_api returns operations as ['name', {...}]; block_api and newer
// nodes as { type: 'name_operation', value: {...} }.
function operationParts(operation) {
    if (Array.isArray(operation)) return [operation[0], operation[1] ?? null];
    if (operation && typeof operation === 'object' && typeof operation.type === 'string') return [operation.type.replace(/_operation$/, ''), operation.value ?? null];
    return [null, null];
}
