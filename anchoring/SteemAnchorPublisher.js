import {
    STEEM_ANCHOR_CHAIN,
    STEEM_ANCHOR_TYPE,
    isSteemAnchorContentHash,
    isSteemTransactionId,
    steemAnchorLocator,
    steemTransactionAnchors
} from '../core/SteemAnchor.js';

// Creates a `steem` anchor (docs/Protocol.md, "Proposed: Steem Anchoring",
// "Anchoring"): broadcasts a `forkbuild-anchor` custom_json carrying the
// Publication's own contentHash through the injected `poster` (the Steem
// announcer, which signs through Steem Keychain), then finds the block it
// landed in, so the proof names `{ blockNum, trxId, chain }`, exactly what
// anchoring/SteemProofVerifier.js checks.
//
// Keychain's broadcast result usually names the block. When it doesn't, or
// the block it names doesn't hold the transaction, the publisher reads the
// blocks produced since just before the broadcast and finds the operation
// by account and contentHash.
//
// Like the other publishers it never throws for an operational failure (no
// account, no Keychain, a declined signature, an unreachable node): those
// are `{ published: false, unavailable: true, reason }`. It never reports
// `anchoredAt`, and "published" means an API node accepted the transaction,
// not that its block is irreversible yet; the verifier answers that.
const DEFAULT_BLOCK_INTERVAL_MS = 3000;
const DEFAULT_MAX_LOCATE_ATTEMPTS = 10;
// Enough for a Keychain approval that takes a few minutes.
const DEFAULT_MAX_SCAN_BLOCKS = 100;

export class SteemAnchorPublisher {
    constructor({
        poster,
        rpc,
        sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms)),
        blockIntervalMs = DEFAULT_BLOCK_INTERVAL_MS,
        maxLocateAttempts = DEFAULT_MAX_LOCATE_ATTEMPTS,
        maxScanBlocks = DEFAULT_MAX_SCAN_BLOCKS
    } = {}) {
        if (!poster || typeof poster.postAnchor !== 'function') throw new TypeError('SteemAnchorPublisher: a poster with postAnchor() is required');
        if (!rpc || typeof rpc.getBlock !== 'function' || typeof rpc.getDynamicGlobalProperties !== 'function') {
            throw new TypeError('SteemAnchorPublisher: a Steem RPC client with getBlock() and getDynamicGlobalProperties() is required');
        }
        this._poster = poster;
        this._rpc = rpc;
        this._sleep = sleep;
        this._blockIntervalMs = blockIntervalMs;
        this._maxLocateAttempts = maxLocateAttempts;
        this._maxScanBlocks = maxScanBlocks;
    }

    get anchorType() { return STEEM_ANCHOR_TYPE; }

    // Resolves to `{ published: true, locator, proof }` or
    // `{ published: false, unavailable: true, reason }`.
    async publish(contentHash) {
        if (!isSteemAnchorContentHash(contentHash)) {
            throw new Error('SteemAnchorPublisher: contentHash must be a non-empty string without surrounding spaces');
        }
        // Where to start looking if the broadcast result names no block.
        const startBlock = await this._headBlock();

        let posted;
        try {
            posted = await this._poster.postAnchor(contentHash);
        } catch (error) {
            return { published: false, unavailable: true, reason: error.message };
        }
        const transactionId = isSteemTransactionId(posted?.transactionId) ? posted.transactionId : null;

        const found = await this._locate({ author: posted?.author ?? null, transactionId, blockNum: posted?.blockNum ?? null, startBlock, contentHash });
        if (!found) {
            const which = transactionId ? `transaction ${transactionId}` : 'the transaction';
            return {
                published: false,
                unavailable: true,
                reason: `Steem accepted ${which}, but its block couldn't be found on the API node, so no anchor was recorded. Check the account's history before anchoring again.`
            };
        }
        return {
            published: true,
            locator: steemAnchorLocator(found.trxId),
            proof: { blockNum: found.blockNum, trxId: found.trxId, chain: STEEM_ANCHOR_CHAIN }
        };
    }

    async _headBlock() {
        try {
            const head = (await this._rpc.getDynamicGlobalProperties())?.head_block_number;
            return Number.isSafeInteger(head) ? head : null;
        } catch {
            return null;
        }
    }

    // `{ blockNum, trxId }` of the anchor, or null.
    async _locate({ author, transactionId, blockNum, startBlock, contentHash }) {
        const findIn = (block) => findAnchor(block, { author, transactionId, contentHash });
        const reported = Number.isSafeInteger(blockNum) && blockNum > 0 ? blockNum : null;
        let next = startBlock !== null ? startBlock + 1 : null;
        let scanned = 0;

        for (let attempt = 0; attempt < this._maxLocateAttempts; attempt += 1) {
            if (attempt > 0) await this._sleep(this._blockIntervalMs);
            try {
                if (reported !== null) {
                    const trxId = findIn(await this._rpc.getBlock(reported));
                    if (trxId) return { blockNum: reported, trxId };
                }
                const head = await this._headBlock();
                if (head === null) continue;
                // No starting point: look back far enough to cover a broadcast
                // that just happened.
                if (next === null) next = Math.max(1, head - 20);
                while (next <= head && scanned < this._maxScanBlocks) {
                    const block = await this._rpc.getBlock(next);
                    // The node hasn't caught up with its own head yet.
                    if (!block) break;
                    const trxId = findIn(block);
                    if (trxId) return { blockNum: next, trxId };
                    next += 1;
                    scanned += 1;
                }
                if (scanned >= this._maxScanBlocks) return null;
            } catch {
                // An unreachable node; try again after a block.
            }
        }
        return null;
    }
}

// The id of the transaction in `block` that anchors `contentHash` for
// `author`, or null. When the broadcast named a transaction id, only that
// transaction counts.
function findAnchor(block, { author, transactionId, contentHash }) {
    if (!block || !Array.isArray(block.transactions) || !Array.isArray(block.transaction_ids)) return null;
    const options = { account: author };
    if (transactionId) {
        const index = block.transaction_ids.indexOf(transactionId);
        return index >= 0 && steemTransactionAnchors(block.transactions[index], contentHash, options) ? transactionId : null;
    }
    const index = block.transactions.findIndex((transaction) => steemTransactionAnchors(transaction, contentHash, options));
    const trxId = index >= 0 ? block.transaction_ids[index] : null;
    return isSteemTransactionId(trxId) ? trxId : null;
}
