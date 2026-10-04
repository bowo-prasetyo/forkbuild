import { createBlockEvidence, GRAPHENE_BLOCK_EVIDENCE_VERSION } from './GrapheneBlockEvidence.js';
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
// Anchoring", "Keeping evidence"), checked as core/GrapheneBlockEvidence.js
// describes with Steem's serialization: the signing key reads "STM…".

export const STEEM_BLOCK_EVIDENCE_VERSION = GRAPHENE_BLOCK_EVIDENCE_VERSION;

const evidence = createBlockEvidence({
    SerializationError: SteemSerializationError,
    binary: {
        hexToBytes,
        blockId: steemBlockId,
        blockHeaderDigest: steemBlockHeaderDigest,
        merkleTree: steemMerkleTree,
        merkleRootFromPath: steemMerkleRootFromPath,
        publicKeyString: steemPublicKeyString,
        transactionId: steemTransactionId,
        transactionMerkleDigest: steemTransactionMerkleDigest
    }
});

// Builds evidence for transaction `trxId` from a block as condenser_api's
// get_block returns it; throws SteemSerializationError when the block can't
// be checked.
export const captureSteemBlockEvidence = evidence.capture;
// `{ ok: true, blockId, timestamp, witness, signingKey, transaction }` or
// `{ ok: false, reason }`; never throws, never uses the network.
export const checkSteemBlockEvidence = evidence.check;
