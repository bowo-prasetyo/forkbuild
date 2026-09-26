import {
    STEEM_ANCHOR_CHAIN,
    STEEM_ANCHOR_MAX_BATCH,
    STEEM_ANCHOR_TYPE,
    isSteemAnchorContentHash,
    isSteemTransactionId,
    steemAnchorBatch,
    steemAnchorLocator,
    steemTransactionAnchors
} from '../core/SteemAnchor.js';
import { captureSteemBlockEvidence } from '../core/SteemBlockEvidence.js';

// Creates `steem` anchors (docs/Protocol.md, "Proposed: Steem Anchoring",
// "Anchoring"): broadcasts a `forkbuild-anchor` custom_json through the
// injected `poster` (the Steem announcer, which signs through Steem
// Keychain), then finds the block it landed in, so the proof names
// `{ blockNum, trxId, chain }`, exactly what anchoring/SteemProofVerifier.js
// checks. `publish()` anchors one contentHash; `publishBatch()` anchors
// several with one operation carrying their Merkle root, and gives each its
// own proof with `batch: { path }`.
//
// Keychain's broadcast result usually names the block. When it doesn't, or
// the block it names doesn't hold the transaction, the publisher reads the
// blocks produced since just before the broadcast and finds the operation
// by account and contentHash (or root).
//
// Each proof also keeps the block as evidence (core/SteemBlockEvidence.js)
// when it can: the signed header, the transaction and its Merkle path. A
// block this code can't check (an operation it can't serialize) is still a
// valid anchor, only without kept evidence.
//
// Like the other publishers it never throws for an operational failure (no
// account, no Keychain, a declined signature, an unreachable node): those
// are `{ published: false, unavailable: true, reason }`. It never reports
// `anchoredAt`, and "published" means an API node accepted the transaction,
// not that its block is irreversible yet; the verifier and
// anchoring/SteemAnchorFinalityObserver.js answer that.
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
        maxScanBlocks = DEFAULT_MAX_SCAN_BLOCKS,
        keepEvidence = true
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
        this._keepEvidence = keepEvidence;
    }

    get anchorType() { return STEEM_ANCHOR_TYPE; }

    // Resolves to `{ published: true, locator, proof }` or
    // `{ published: false, unavailable: true, reason }`.
    async publish(contentHash) {
        if (!isSteemAnchorContentHash(contentHash)) {
            throw new Error('SteemAnchorPublisher: contentHash must be a non-empty string without surrounding spaces');
        }
        const anchored = await this._anchor({ contentHash });
        if (!anchored.published) return anchored;
        return { published: true, locator: steemAnchorLocator(anchored.trxId), proof: anchored.proof };
    }

    // Anchors every contentHash with one broadcast, so one Keychain
    // approval. Resolves to `{ published: true, results: [{ contentHash,
    // locator, proof }] }`, in the order given (a repeated contentHash
    // shares one leaf), or the same failure shape as publish(). One
    // distinct contentHash is anchored exactly as publish() would.
    async publishBatch(contentHashes) {
        if (!Array.isArray(contentHashes) || contentHashes.length === 0 || !contentHashes.every(isSteemAnchorContentHash)) {
            throw new Error('SteemAnchorPublisher: publishBatch() needs a non-empty list of contentHashes');
        }
        const distinct = [...new Set(contentHashes)];
        if (distinct.length > STEEM_ANCHOR_MAX_BATCH) {
            throw new Error(`SteemAnchorPublisher: one batch anchors at most ${STEEM_ANCHOR_MAX_BATCH} distinct contentHashes`);
        }
        if (distinct.length === 1) {
            const single = await this.publish(distinct[0]);
            if (!single.published) return single;
            return { published: true, results: contentHashes.map((contentHash) => ({ contentHash, locator: single.locator, proof: single.proof })) };
        }
        const batch = steemAnchorBatch(distinct);
        const anchored = await this._anchor({ merkleRoot: batch.merkleRoot, count: batch.count });
        if (!anchored.published) return anchored;
        const locator = steemAnchorLocator(anchored.trxId);
        return {
            published: true,
            results: contentHashes.map((contentHash) => ({
                contentHash,
                locator,
                proof: { ...anchored.proof, batch: { path: batch.paths.get(contentHash) } }
            }))
        };
    }

    get maxBatchSize() { return STEEM_ANCHOR_MAX_BATCH; }

    // Broadcasts one anchor operation for `target` (`{ contentHash }` or
    // `{ merkleRoot, count }`) and finds it on the chain.
    async _anchor(target) {
        // Where to start looking if the broadcast result names no block.
        const startBlock = await this._headBlock();

        let posted;
        try {
            posted = await this._poster.postAnchor(target);
        } catch (error) {
            return { published: false, unavailable: true, reason: error.message };
        }
        const transactionId = isSteemTransactionId(posted?.transactionId) ? posted.transactionId : null;

        const found = await this._locate({ author: posted?.author ?? null, transactionId, blockNum: posted?.blockNum ?? null, startBlock, target });
        if (!found) {
            const which = transactionId ? `transaction ${transactionId}` : 'the transaction';
            return {
                published: false,
                unavailable: true,
                reason: `Steem accepted ${which}, but its block couldn't be found on the API node, so no anchor was recorded. Check the account's history before anchoring again.`
            };
        }
        const proof = { blockNum: found.blockNum, trxId: found.trxId, chain: STEEM_ANCHOR_CHAIN };
        if (this._keepEvidence) {
            try {
                proof.evidence = captureSteemBlockEvidence(found.block, { blockNum: found.blockNum, trxId: found.trxId });
            } catch {
                // A block this code can't check; the anchor stands without it.
            }
        }
        return { published: true, trxId: found.trxId, proof };
    }

    async _headBlock() {
        try {
            const head = (await this._rpc.getDynamicGlobalProperties())?.head_block_number;
            return Number.isSafeInteger(head) ? head : null;
        } catch {
            return null;
        }
    }

    // `{ blockNum, trxId, block }` of the anchor, or null.
    async _locate({ author, transactionId, blockNum, startBlock, target }) {
        const findIn = (block) => findAnchor(block, { author, transactionId, target });
        const reported = Number.isSafeInteger(blockNum) && blockNum > 0 ? blockNum : null;
        let next = startBlock !== null ? startBlock + 1 : null;
        let scanned = 0;

        for (let attempt = 0; attempt < this._maxLocateAttempts; attempt += 1) {
            if (attempt > 0) await this._sleep(this._blockIntervalMs);
            try {
                if (reported !== null) {
                    const block = await this._rpc.getBlock(reported);
                    const trxId = findIn(block);
                    if (trxId) return { blockNum: reported, trxId, block };
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
                    if (trxId) return { blockNum: next, trxId, block };
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

// The id of the transaction in `block` that anchors `target` for `author`,
// or null. When the broadcast named a transaction id, only that transaction
// counts.
function findAnchor(block, { author, transactionId, target }) {
    if (!block || !Array.isArray(block.transactions) || !Array.isArray(block.transaction_ids)) return null;
    const options = { account: author };
    if (transactionId) {
        const index = block.transaction_ids.indexOf(transactionId);
        return index >= 0 && steemTransactionAnchors(block.transactions[index], target, options) ? transactionId : null;
    }
    const index = block.transactions.findIndex((transaction) => steemTransactionAnchors(transaction, target, options));
    const trxId = index >= 0 ? block.transaction_ids[index] : null;
    return isSteemTransactionId(trxId) ? trxId : null;
}
