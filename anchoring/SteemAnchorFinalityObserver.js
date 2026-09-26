import { STEEM_ANCHOR_TYPE, parseSteemAnchorProof } from '../core/SteemAnchor.js';

// Watches a freshly created `steem` anchor until its block is irreversible
// (docs/Protocol.md, "Proposed: Steem Anchoring", "Finality"), so the app
// can say "anchored" rather than only "accepted". A block is final once the
// chain's last irreversible block number reaches it, about a minute after
// it was produced. When it does, the observer reads the block once more:
// a transaction a fork dropped before finality is reported as dropped,
// never as anchored.
//
// This is a convenience for the person who just clicked. It proves nothing
// to anyone else; anchoring/SteemProofVerifier.js is what checks an anchor.
//
// States: 'pending' (not final yet), 'final', 'dropped' (the final block
// doesn't hold the transaction), 'unknown' (no node answered, or the wait
// ran out; verify later).
const DEFAULT_INTERVAL_MS = 3000;
// Irreversibility normally takes about 45 seconds.
const DEFAULT_MAX_WAIT_MS = 180000;

export class SteemAnchorFinalityObserver {
    constructor({
        rpc,
        sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms)),
        clock = () => Date.now(),
        intervalMs = DEFAULT_INTERVAL_MS,
        maxWaitMs = DEFAULT_MAX_WAIT_MS
    } = {}) {
        if (!rpc || typeof rpc.getDynamicGlobalProperties !== 'function' || typeof rpc.getBlock !== 'function') {
            throw new TypeError('SteemAnchorFinalityObserver: a Steem RPC client with getDynamicGlobalProperties() and getBlock() is required');
        }
        this._rpc = rpc;
        this._sleep = sleep;
        this._clock = clock;
        this._intervalMs = intervalMs;
        this._maxWaitMs = maxWaitMs;
    }

    get anchorType() { return STEEM_ANCHOR_TYPE; }

    // One look: `{ state, blockNum, lastIrreversible, reason }`.
    async check(proof) {
        const parsed = parseSteemAnchorProof(proof);
        if (parsed.error) return { state: 'unknown', blockNum: null, lastIrreversible: null, reason: parsed.error };
        const { blockNum, trxId } = parsed;
        let lastIrreversible;
        try {
            lastIrreversible = (await this._rpc.getDynamicGlobalProperties())?.last_irreversible_block_num;
        } catch (error) {
            return { state: 'unknown', blockNum, lastIrreversible: null, reason: error.message };
        }
        if (!Number.isSafeInteger(lastIrreversible)) return { state: 'unknown', blockNum, lastIrreversible: null, reason: 'the node reported no last irreversible block' };
        if (blockNum > lastIrreversible) return { state: 'pending', blockNum, lastIrreversible, reason: null };
        let block;
        try {
            block = await this._rpc.getBlock(blockNum);
        } catch (error) {
            return { state: 'unknown', blockNum, lastIrreversible, reason: error.message };
        }
        if (!block) return { state: 'unknown', blockNum, lastIrreversible, reason: `the node didn't return block ${blockNum}` };
        const holds = Array.isArray(block.transaction_ids) && block.transaction_ids.includes(trxId);
        return holds
            ? { state: 'final', blockNum, lastIrreversible, reason: null, timestamp: block.timestamp ?? null }
            : { state: 'dropped', blockNum, lastIrreversible, reason: `final block ${blockNum} doesn't contain transaction ${trxId}` };
    }

    // Checks every interval until the block is final or dropped, or the wait
    // runs out ('unknown'). Calls `onUpdate` with each state; `signal`
    // (an AbortSignal) stops it early.
    async waitUntilFinal(proof, { onUpdate = () => {}, signal = null } = {}) {
        const deadline = this._clock() + this._maxWaitMs;
        let last = null;
        for (;;) {
            last = await this.check(proof);
            onUpdate(last);
            if (last.state === 'final' || last.state === 'dropped' || (last.state === 'unknown' && last.blockNum === null)) return last;
            if (signal?.aborted || this._clock() + this._intervalMs > deadline) break;
            await this._sleep(this._intervalMs);
            if (signal?.aborted) break;
        }
        const timedOut = { ...last, state: 'unknown', reason: last.reason ?? `block ${last.blockNum} was not final yet when the app stopped waiting` };
        onUpdate(timedOut);
        return timedOut;
    }
}
