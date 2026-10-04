import { createBlockEvidence, GRAPHENE_BLOCK_EVIDENCE_VERSION } from './GrapheneBlockEvidence.js';
import {
    BlurtSerializationError,
    blurtBlockHeaderDigest,
    blurtBlockId,
    blurtMerkleRootFromPath,
    blurtMerkleTree,
    blurtPublicKeyString,
    blurtTransactionId,
    blurtTransactionMerkleDigest,
    hexToBytes
} from './BlurtBinary.js';

// Kept block evidence for a Blurt anchor (docs/Protocol.md, "Proposed: Blurt
// Substrate", "Keeping evidence"), checked as core/GrapheneBlockEvidence.js
// describes with Blurt's serialization: the signing key reads "BLT…".

export const BLURT_BLOCK_EVIDENCE_VERSION = GRAPHENE_BLOCK_EVIDENCE_VERSION;

const evidence = createBlockEvidence({
    SerializationError: BlurtSerializationError,
    binary: {
        hexToBytes,
        blockId: blurtBlockId,
        blockHeaderDigest: blurtBlockHeaderDigest,
        merkleTree: blurtMerkleTree,
        merkleRootFromPath: blurtMerkleRootFromPath,
        publicKeyString: blurtPublicKeyString,
        transactionId: blurtTransactionId,
        transactionMerkleDigest: blurtTransactionMerkleDigest
    }
});

export const captureBlurtBlockEvidence = evidence.capture;
export const checkBlurtBlockEvidence = evidence.check;
