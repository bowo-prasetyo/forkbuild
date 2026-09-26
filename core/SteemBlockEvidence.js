import { secp256k1 } from '../vendor/noble-curves/secp256k1.js';
import {
    SteemSerializationError,
    hexToBytes,
    steemBlockHeaderDigest,
    steemBlockId,
    steemMerkleRootFromPath,
    steemMerkleTree,
    steemPublicKeyString,
    steemTransactionId,
    steemTransactionMerkleDigest
} from './SteemBinary.js';

// Kept block evidence for a Steem anchor (docs/Protocol.md, "Proposed: Steem
// Anchoring", "Keeping evidence"): the signed block header, the anchor
// transaction, and the path from that transaction to the header's
// transaction Merkle root. With it, a reader can check without any network
// that:
//
//   - the header hashes to a block id for the anchor's block number;
//   - the header's witness signature was made by `signingKey`;
//   - the transaction has the anchor's transaction id and is one of the
//     transactions the header commits to.
//
// What it can't show offline is that `signingKey` was the named witness's
// key at that time, or that the block is on the chain and irreversible;
// that still needs a node.

export const STEEM_BLOCK_EVIDENCE_VERSION = 1;
const MAX_MERKLE_PATH_STEPS = 32;

// Builds evidence for transaction `trxId` from a block as condenser_api's
// get_block returns it. Throws when the block can't be checked (an
// operation this code can't serialize, or a block whose id, Merkle root or
// signature doesn't match), so evidence is never kept that wouldn't check.
export function captureSteemBlockEvidence(block, { blockNum, trxId }) {
    if (!block || !Array.isArray(block.transactions) || !Array.isArray(block.transaction_ids)) {
        throw new SteemSerializationError('the block has no transactions to take evidence from');
    }
    const index = block.transaction_ids.indexOf(trxId);
    if (index < 0) throw new SteemSerializationError(`the block doesn't list transaction ${trxId}`);
    const header = headerOf(block);
    const blockId = steemBlockId(header);
    if (blockId !== block.block_id) throw new SteemSerializationError(`the header hashes to block id ${blockId}, not ${block.block_id}`);
    const transactions = block.transactions.map(transactionOf);
    const { root, path } = steemMerkleTree(transactions.map(steemTransactionMerkleDigest), index);
    if (root !== header.transaction_merkle_root) throw new SteemSerializationError(`the transactions hash to Merkle root ${root}, not ${header.transaction_merkle_root}`);
    const signingKey = recoverSigningKey(header);
    if (typeof block.signing_key === 'string' && block.signing_key !== signingKey) {
        throw new SteemSerializationError(`the header was signed by ${signingKey}, not the node's ${block.signing_key}`);
    }
    const evidence = { version: STEEM_BLOCK_EVIDENCE_VERSION, header, signingKey, transaction: transactions[index], merklePath: path };
    const checked = checkSteemBlockEvidence(evidence, { blockNum, trxId });
    if (!checked.ok) throw new SteemSerializationError(checked.reason);
    return evidence;
}

// Checks kept evidence against the anchor's proof. Returns `{ ok: true,
// blockId, timestamp, witness, signingKey, transaction }` or `{ ok: false,
// reason }`. Never throws, never uses the network.
export function checkSteemBlockEvidence(evidence, { blockNum, trxId }) {
    try {
        if (!evidence || typeof evidence !== 'object' || evidence.version !== STEEM_BLOCK_EVIDENCE_VERSION) {
            return { ok: false, reason: 'the kept block evidence has an unknown format' };
        }
        const { header, signingKey, transaction, merklePath } = evidence;
        if (!Array.isArray(merklePath) || merklePath.length > MAX_MERKLE_PATH_STEPS) {
            return { ok: false, reason: 'the kept Merkle path is malformed' };
        }
        const blockId = steemBlockId(header);
        if (Number.parseInt(blockId.slice(0, 8), 16) !== blockNum) {
            return { ok: false, reason: `the kept header is for block ${Number.parseInt(blockId.slice(0, 8), 16)}, not ${blockNum}` };
        }
        const recovered = recoverSigningKey(header);
        if (recovered !== signingKey) {
            return { ok: false, reason: `the kept header's signature was made by ${recovered}, not ${signingKey}` };
        }
        const id = steemTransactionId(transaction);
        if (id !== trxId) return { ok: false, reason: `the kept transaction has id ${id}, not ${trxId}` };
        const root = steemMerkleRootFromPath(steemTransactionMerkleDigest(transaction), merklePath);
        if (root !== header.transaction_merkle_root) {
            return { ok: false, reason: "the kept transaction isn't one the kept header commits to" };
        }
        return { ok: true, blockId, timestamp: header.timestamp, witness: header.witness, signingKey, transaction };
    } catch (error) {
        return { ok: false, reason: `the kept block evidence can't be read: ${error.message}` };
    }
}

// The key that made the header's witness signature, as "STM…". Steem's
// compact signature starts with 27 + 4 (compressed) + the recovery id.
function recoverSigningKey(header) {
    const signature = hexToBytes(header.witness_signature);
    if (signature.length !== 65) throw new SteemSerializationError('the witness signature is not 65 bytes');
    const recovery = signature[0] >= 31 ? signature[0] - 31 : signature[0] - 27;
    if (recovery < 0 || recovery > 3) throw new SteemSerializationError('the witness signature has no recovery id');
    const recovered = Uint8Array.of(recovery, ...signature.subarray(1));
    const point = secp256k1.Signature.fromBytes(recovered, 'recovered').recoverPublicKey(steemBlockHeaderDigest(header));
    return steemPublicKeyString(point.toBytes(true));
}

function headerOf(block) {
    return {
        previous: block.previous,
        timestamp: block.timestamp,
        witness: block.witness,
        transaction_merkle_root: block.transaction_merkle_root,
        extensions: Array.isArray(block.extensions) ? block.extensions : [],
        witness_signature: block.witness_signature
    };
}

// Only what the chain signs and hashes; nodes add transaction_id,
// block_num and transaction_num.
function transactionOf(tx) {
    return {
        ref_block_num: tx.ref_block_num,
        ref_block_prefix: tx.ref_block_prefix,
        expiration: tx.expiration,
        operations: tx.operations,
        extensions: Array.isArray(tx.extensions) ? tx.extensions : [],
        signatures: Array.isArray(tx.signatures) ? tx.signatures : []
    };
}
