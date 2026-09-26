import { isSteemAccountName } from './SteemDiscoveryThread.js';

// The Steem anchor format (docs/Protocol.md, "Proposed: Steem Anchoring"):
// one `custom_json` operation carrying a Publication's own contentHash, and
// the `{ blockNum, trxId, chain }` proof that names the transaction holding
// it. Shared by the publisher, which writes the operation, and the
// verifier, which finds it again in a block.

export const STEEM_ANCHOR_TYPE = 'steem';
export const STEEM_ANCHOR_CUSTOM_JSON_ID = 'forkbuild-anchor';
export const STEEM_ANCHOR_CHAIN = 'steem';
export const STEEM_ANCHOR_VERSION = 1;

// A Steem transaction id is the first 20 bytes of the transaction digest.
const TRANSACTION_ID_PATTERN = /^[0-9a-f]{40}$/;
// contentHash is carried as text, never re-encoded; this only keeps the
// operation small and printable.
const MAX_CONTENT_HASH_LENGTH = 256;

export function isSteemTransactionId(value) {
    return typeof value === 'string' && TRANSACTION_ID_PATTERN.test(value);
}

export function isSteemAnchorContentHash(value) {
    return typeof value === 'string' && value.length > 0 && value.length <= MAX_CONTENT_HASH_LENGTH && value.trim() === value;
}

// The one operation of an anchor transaction, signed with `account`'s
// posting key.
export function steemAnchorOperations({ account, contentHash }) {
    if (!isSteemAccountName(account)) throw new TypeError(`"${account}" is not a Steem account name`);
    if (!isSteemAnchorContentHash(contentHash)) throw new TypeError('contentHash must be a non-empty string without surrounding spaces');
    return [['custom_json', {
        required_auths: [],
        required_posting_auths: [account],
        id: STEEM_ANCHOR_CUSTOM_JSON_ID,
        json: JSON.stringify({ version: STEEM_ANCHOR_VERSION, contentHash })
    }]];
}

export function steemAnchorLocator(trxId) {
    return `steem:${trxId}`;
}

// Returns `{ blockNum, trxId, chain }`, or `{ error }` naming what is wrong.
export function parseSteemAnchorProof(proof) {
    if (!proof || typeof proof !== 'object') return { error: 'proof is missing or not an object' };
    const { blockNum, trxId, chain } = proof;
    if (chain !== STEEM_ANCHOR_CHAIN) return { error: `proof names chain "${chain}", not "${STEEM_ANCHOR_CHAIN}"` };
    if (!Number.isSafeInteger(blockNum) || blockNum < 1) return { error: 'proof.blockNum is not a positive block number' };
    if (!isSteemTransactionId(trxId)) return { error: 'proof.trxId is not a 40-character hex Steem transaction id' };
    return { blockNum, trxId, chain };
}

// The block number a Steem block id starts with (its first 4 bytes, big
// endian), or NaN. Lets a verifier tell that a node returned the block it
// was asked for.
export function steemBlockNumberOfId(blockId) {
    if (typeof blockId !== 'string' || !/^[0-9a-f]{40}$/.test(blockId)) return NaN;
    return Number.parseInt(blockId.slice(0, 8), 16);
}

// True when `transaction` (as a block returns it) holds a ForkBuild anchor
// operation for exactly `contentHash`, optionally signed by `account`.
export function steemTransactionAnchors(transaction, contentHash, { account = null } = {}) {
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
        return payload?.version === STEEM_ANCHOR_VERSION && payload.contentHash === contentHash;
    });
}

// condenser_api returns operations as ['custom_json', {...}]; block_api and
// newer nodes as { type: 'custom_json_operation', value: {...} }.
function customJsonOf(operation) {
    if (Array.isArray(operation) && operation[0] === 'custom_json') return operation[1] ?? null;
    if (operation && typeof operation === 'object' && operation.type === 'custom_json_operation') return operation.value ?? null;
    return null;
}
