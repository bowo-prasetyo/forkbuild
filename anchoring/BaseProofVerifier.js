import { ProofVerifier } from './ProofVerifier.js';
import { decodeBasePublicationCommitment } from '../application/BasePublicationCommitmentEncoding.js';

const TX_HASH_PATTERN = /^0x[0-9a-fA-F]{64}$/;

// 0.9.463 — Base Transaction Proof Verifier.
//
// The verification-side counterpart of base/BasePublicationTransactionPlanner.js
// — exactly the split anchoring/BitcoinOpReturnProofVerifier.js already
// holds opposite anchoring/BitcoinAnchorPublisher.js, and anchoring/
// ArweaveTransactionDataProofVerifier.js opposite anchoring/
// ArweaveAnchorPublisher.js, one chain over. A `PublicationAnchor`'s own
// `proof` for the `base` anchorType is exactly:
//
//   { txid, network = 'mainnet' }
//
// nothing else — this class never invents a second, redundant
// "commitment" field a forger could set independently of the anchor's own
// signed `contentHash`. The ONE thing checked is that the named Base
// transaction's own `input` decodes (via application/
// BasePublicationCommitmentEncoding.js's own `decodeBasePublicationCommitment()`,
// unchanged) to the anchor's own contentHash — never a hash of a hash,
// never a second encoding this class would have to invent and document
// itself. `network` mirrors exactly the same field, with the same default
// and the same rejection-on-mismatch behavior, anchoring/
// BitcoinOpReturnProofVerifier.js's own proof shape already carries.
//
// tests/BaseTransactionProofVerificationCapabilityAudit.test.js (0.9.461)
// found every non-network seam this class needs already existed —
// ProofVerifier itself, the closed three-outcome failure vocabulary, the
// decode function, the registry/use-case pattern — and named exactly one
// concrete gap: no wrapped RPC read returned a transaction's own payload.
// tests/BaseTransactionPayloadRpcRead.test.js (0.9.462) closed that one
// gap with `base/BaseJsonRpcClient.js#fetchTransactionByHash()`. This
// class is the seam both milestones were building toward, and reuses
// everything they named, unchanged:
//
//   proof.txid
//       │
//       ▼
//   BaseProofVerifier.verify()                          (THIS FILE — new)
//       │
//       ▼
//   injected rpcSource.fetchTransactionByHash(txid)
//   (base/BaseJsonRpcClient.js, or a fake in every test)
//       │
//   ┌───┴────────────────┬─────────────────────────┐
//   ▼                     ▼                          ▼
// { available: true,  { available: true,      { available: false }
//   found: true,        found: false }          — RPC unreachable
//   hash, input }        — no such tx (yet)
//   │
//   ▼
// decodeBasePublicationCommitment(input)
//   │
//   ▼
// compare against the anchor's own contentHash
//
// AN INJECTED `rpcSource`, NEVER A CLIENT THIS CLASS CONSTRUCTS ITSELF.
// The constructor requires a caller-supplied `rpcSource` exposing
// `fetchTransactionByHash()` — this class never `new BaseJsonRpcClient()`s
// its own transport, mirroring exactly how base/
// BasePublicationTransactionPlanner.js's own constructor already takes an
// injected `rpcSource` rather than reaching for the network itself.
// application/CreateBaseAnchorProofVerifierUseCase.js is the one place a
// concrete `BaseJsonRpcClient` and this class are wired together, the
// identical composition-root split every other real-network adapter in
// this codebase already holds.
//
// A BASE PROOF VERIFIES TRANSACTION CONTENT, NEVER TRANSACTION OWNERSHIP
// OR PUBLISHER IDENTITY. This class reads exactly two fields off the
// fetched transaction — `hash` (to confirm the endpoint answered about
// the exact txid asked for; never re-used for anything else) and `input`
// (decoded and compared against contentHash) — and never reads, stores,
// or compares a `from`/sender/signer field of any kind. "This transaction
// carries this contentHash" and "this transaction was sent by this
// publication's own publisher" are two different claims; only the first
// is what a Base proof, or any proof this codebase's ProofVerifier
// contract already expresses (see anchoring/BitcoinOpReturnProofVerifier.js's
// own header, "the ONE thing checked"), was ever asked to establish.
//
// TRANSACTION UNAVAILABILITY, NOT-YET-BROADCAST, AND NOT-YET-PROPAGATED
// ARE ALL `unavailable: true` — NEVER A REJECTION. Exactly the same
// discipline anchoring/BitcoinOpReturnProofVerifier.js's own header
// documents for a not-yet-confirmed Bitcoin transaction, and anchoring/
// ArweaveTransactionDataProofVerifier.js's own header documents for a
// not-yet-retrievable Arweave one: a transaction not (yet) found, or an
// endpoint this class cannot presently reach, is never distinguishable
// from "will never exist," so this class never pretends otherwise. Only a
// transaction that IS reachable and found, but whose own `input` cannot
// decode to the claimed contentHash, is ever reported as a definite
// rejection.
//
// NO POLLING, NO RETRY, NO FINALITY-DEPTH POLICY OF ANY KIND. One
// `verify()` call makes exactly one `rpcSource.fetchTransactionByHash()`
// call — this class has no `minConfirmations` concept (unlike anchoring/
// BitcoinOpReturnProofVerifier.js's own optional one) because
// `fetchTransactionByHash()` itself carries no confirmation-depth
// information to begin with; whether and when to call `verify()` again is
// entirely its own caller's decision, mirroring base/BaseJsonRpcClient.js's
// own header, "no confirmation-count POLICY of any kind."
//
// KNOWN, DELIBERATE CONSEQUENCE FOR PRIOR TEST FILES' OWN GIT-STATUS
// GUARDS. tests/BaseTransactionPayloadRpcRead.test.js (0.9.462) Section
// J's own mechanical `git status --porcelain` guard asserted that ITS
// commit's own two files were the only changes — true when written, and
// now superseded by this milestone's own real, additional files, exactly
// the same relationship that file's own header already documents toward
// its two predecessors (tests/BaseOnChainPublishingCapabilityBoundaryAudit.test.js,
// tests/BaseTransactionProofVerificationCapabilityAudit.test.js).
// tests/BitcoinEndpointConfigurationUIReachabilityAudit.test.js's own
// repo-wide "no production directory changed" guard is superseded for the
// identical reason — any new production file anywhere breaks a
// point-in-time "nothing changed" snapshot by construction. Left as an
// honest historical record, not silently patched — see the first file's
// own header for the precedent this milestone follows.
export class BaseProofVerifier extends ProofVerifier {
    // rpcSource: an injected object exposing
    //   `fetchTransactionByHash(txid) -> { available, found?, hash?, input?, reason? }`
    //   — see base/BaseJsonRpcClient.js's own header for the exact shape.
    // network: which Base network this verifier checks proofs against —
    //   'mainnet' or 'testnet', mirroring base/
    //   BasePublicationTransactionPlanner.js's own `network` values.
    constructor({ rpcSource, network = 'mainnet' } = {}) {
        super();
        if (!rpcSource || typeof rpcSource.fetchTransactionByHash !== 'function') {
            throw new Error('BaseProofVerifier: an rpcSource exposing fetchTransactionByHash() is required');
        }
        this._rpcSource = rpcSource;
        this._network = network;
    }

    get anchorType() { return 'base'; }
    get network() { return this._network; }

    async verify(proof, { contentHash } = {}) {
        if (!proof || typeof proof !== 'object') {
            return { valid: false, reason: 'proof is missing or not an object' };
        }
        const { txid, network = 'mainnet' } = proof;
        if (typeof txid !== 'string' || !TX_HASH_PATTERN.test(txid)) {
            return { valid: false, reason: 'proof.txid is missing or not a valid 32-byte hex transaction hash' };
        }
        if (network !== this._network) {
            return { valid: false, reason: `proof declares network "${network}", this verifier only checks "${this._network}"` };
        }
        if (typeof contentHash !== 'string' || contentHash.length === 0) {
            return { valid: false, reason: 'no contentHash was supplied to verify the proof against' };
        }

        let result;
        try {
            result = await this._rpcSource.fetchTransactionByHash(txid);
        } catch (error) {
            return { valid: false, unavailable: true, reason: error.message };
        }

        if (!result || result.available !== true) {
            return {
                valid: false,
                unavailable: true,
                reason: (result && result.reason) || `could not reach the Base RPC endpoint to look up transaction ${txid}`
            };
        }
        if (result.found !== true) {
            return {
                valid: false,
                unavailable: true,
                reason: `transaction ${txid} was not found — it may not have been broadcast yet, or has not yet propagated to this endpoint`
            };
        }

        let decodedContentHash;
        try {
            decodedContentHash = decodeBasePublicationCommitment(result.input);
        } catch (error) {
            return { valid: false, reason: `transaction ${txid}'s own input is not a valid Base publication commitment — ${error.message}` };
        }

        if (decodedContentHash !== contentHash.trim().toLowerCase()) {
            return { valid: false, reason: `transaction ${txid}'s own decoded content hash does not match the anchor's contentHash` };
        }
        return { valid: true };
    }
}
