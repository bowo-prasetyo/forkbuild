import { ProofVerifier } from './ProofVerifier.js';
import { STEEM_ANCHOR_TYPE, parseSteemAnchorProof, steemBlockNumberOfId, steemTransactionAnchors } from '../core/SteemAnchor.js';
import { DEFAULT_STEEM_API_NODES, createSteemRpcClient } from '../steem/SteemRpcClient.js';

// Checks a `steem` PublicationAnchor's proof, `{ blockNum, trxId, chain }`,
// against the chain (docs/Protocol.md, "Proposed: Steem Anchoring",
// "Verifying"). The one thing checked is that the named transaction, in the
// named irreversible block, carries a `forkbuild-anchor` custom_json with
// the anchor's own contentHash. The operation is read from the block, never
// from get_content, since posts can be edited and custom_json can't.
//
// Every configured API node (up to `maxNodes`) is asked separately, and all
// that answer must agree on the block and on what it holds. Disagreement,
// no answer, or a block that isn't irreversible yet is "unavailable", never
// a rejection. Only an irreversible block that all answering nodes agree
// on, and that lacks the transaction or the anchor, is a rejection.
//
// A valid result also carries the block's id, time and witness and how many
// nodes agreed; application/anchoring/ExternalAnchorVerifier.js reads only
// `valid`, so these are for callers that ask this verifier directly.
const DEFAULT_MAX_NODES = 3;

export class SteemProofVerifier extends ProofVerifier {
    constructor({ nodes = DEFAULT_STEEM_API_NODES, fetchImpl = globalThis.fetch, timeoutMs, maxNodes = DEFAULT_MAX_NODES } = {}) {
        super();
        if (!Array.isArray(nodes) || nodes.length === 0) throw new TypeError('SteemProofVerifier: at least one Steem API node is required');
        this._nodes = Object.freeze(nodes.slice(0, Math.max(1, maxNodes)));
        this._clients = this._nodes.map((node) => ({ node, rpc: createSteemRpcClient({ nodes: [node], fetchImpl, timeoutMs }) }));
    }

    get anchorType() { return STEEM_ANCHOR_TYPE; }
    get nodes() { return this._nodes; }

    async verify(proof, { contentHash } = {}) {
        const parsed = parseSteemAnchorProof(proof);
        if (parsed.error) return { valid: false, reason: parsed.error };
        if (typeof contentHash !== 'string' || contentHash.length === 0) {
            return { valid: false, reason: 'no contentHash was supplied to verify the proof against' };
        }
        const { blockNum, trxId } = parsed;
        const views = await Promise.all(this._clients.map(({ node, rpc }) => readBlock(node, rpc, parsed, contentHash)));

        const answered = views.filter((view) => view.kind !== 'unreachable');
        if (answered.length === 0) {
            return { valid: false, unavailable: true, reason: `no Steem API node could be read (${views.map((v) => `${v.node}: ${v.reason}`).join('; ')})` };
        }
        const reversible = answered.find((view) => view.kind === 'reversible');
        if (reversible) {
            return {
                valid: false,
                unavailable: true,
                reason: `Steem block ${blockNum} is not irreversible yet (${reversible.node} reports block ${reversible.lastIrreversible} as the last irreversible one)`
            };
        }
        const missing = answered.find((view) => view.kind === 'missing');
        if (missing) {
            return { valid: false, unavailable: true, reason: `${missing.node} did not return Steem block ${blockNum}` };
        }

        const verdicts = new Set(answered.map((view) => `${view.blockId}|${view.contains}|${view.anchors}`));
        if (verdicts.size > 1) {
            return {
                valid: false,
                unavailable: true,
                reason: `Steem API nodes disagree about block ${blockNum}: ${answered.map(describeView).join('; ')}`
            };
        }

        const [agreed] = answered;
        if (!agreed.contains) {
            return { valid: false, reason: `Steem block ${blockNum} does not contain transaction ${trxId}` };
        }
        if (!agreed.anchors) {
            return { valid: false, reason: `transaction ${trxId} in Steem block ${blockNum} carries no ForkBuild anchor for contentHash ${contentHash}` };
        }
        return {
            valid: true,
            blockNum,
            blockId: agreed.blockId,
            timestamp: agreed.timestamp,
            witness: agreed.witness,
            nodesAgreeing: answered.length,
            nodesAsked: this._clients.length
        };
    }
}

function describeView(view) {
    const holds = !view.contains ? 'without the transaction' : (view.anchors ? 'with the anchor' : 'with the transaction but no anchor');
    return `${view.node} returned block ${view.blockId} ${holds}`;
}

// One node's view of the block: 'unreachable', 'reversible', 'missing', or
// 'block' with what it holds.
async function readBlock(node, rpc, { blockNum, trxId }, contentHash) {
    let properties;
    let block;
    try {
        properties = await rpc.getDynamicGlobalProperties();
        const lastIrreversible = properties?.last_irreversible_block_num;
        if (!Number.isSafeInteger(lastIrreversible)) return { kind: 'unreachable', node, reason: 'no last irreversible block number' };
        if (blockNum > lastIrreversible) return { kind: 'reversible', node, lastIrreversible };
        block = await rpc.getBlock(blockNum);
    } catch (error) {
        return { kind: 'unreachable', node, reason: error.message };
    }
    if (!block) return { kind: 'missing', node };
    // A node that returns some other block is not answering this question.
    if (steemBlockNumberOfId(block.block_id) !== blockNum) {
        return { kind: 'unreachable', node, reason: `returned block ${block.block_id} for block number ${blockNum}` };
    }
    const index = Array.isArray(block.transaction_ids) ? block.transaction_ids.indexOf(trxId) : -1;
    const transaction = index >= 0 && Array.isArray(block.transactions) ? block.transactions[index] : null;
    return {
        kind: 'block',
        node,
        blockId: block.block_id,
        timestamp: block.timestamp ?? null,
        witness: block.witness ?? null,
        contains: index >= 0,
        anchors: Boolean(transaction) && steemTransactionAnchors(transaction, contentHash)
    };
}
