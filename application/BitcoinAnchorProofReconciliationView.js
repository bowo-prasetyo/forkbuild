import { BitcoinAnchorConfirmationState } from './BitcoinAnchorConfirmationState.js';
import { BitcoinAnchorContentProofState } from './BitcoinAnchorContentProofState.js';

const TXID_PATTERN = /^[0-9a-f]{64}$/i;

// 0.8.55 — Bitcoin Anchor Proof Reconciliation.
//
// 0.8.54's own "Deliberately excluded" list named exactly this milestone:
// "Reconciling confirmation with OP_RETURN proof verification, or a
// combined 'anchor health' verdict." This class is that reconciliation,
// and ONLY the reconciliation — it introduces no new Bitcoin primitive,
// runs no new network protocol, and computes nothing anchoring/
// BitcoinAnchorConfirmationObserver.js (0.8.54) and anchoring/
// BitcoinOpReturnProofVerifier.js (0.8.1) do not already compute
// themselves:
//
//   PublicationAnchor { publicationId, contentHash, proof: { txid } }
//        │
//        ├──────────────────────────────┬─────────────────────────────┐
//        ▼                              ▼                              │
//   BitcoinAnchorConfirmationObserver   BitcoinOpReturnProofVerifier    │
//   .observeConfirmation(txid)          .verify(proof, { contentHash }) │
//        │                              │                               │
//        ▼                              ▼                               │
//   CONFIRMED / NOT_CONFIRMED /    HASH_MATCH / HASH_MISMATCH /         │
//   UNAVAILABLE                    UNAVAILABLE                         │
//        │                              │                               │
//        └──────────────┬───────────────┘                              │
//                        ▼                                             │
//         { transaction: { txid, confirmation },                       │
//           contentProof }                            (THIS FILE) ─────┘
//
// A COMPOSITION, NEVER A SECOND VERIFICATION. `reconcile()` never talks
// to a network itself — every fact it reports was already independently
// produced by one of the two injected collaborators. This class only
// runs both, once each, and places their results side by side.
//
// THE ONE RULE THIS FILE EXISTS TO ENFORCE: NO `valid`, `healthy`,
// `trusted`, `reliable`, `canonical`, `confidence`, OR `status` FIELD
// THAT COLLAPSES `transaction.confirmation.state` AND `contentProof.state`
// INTO EACH OTHER. A transaction reported CONFIRMED here and
// HASH_MISMATCH there is not an error this class resolves, hides, or
// scores — it is exactly the honest, structurally legitimate combination
// this milestone exists to make visible. A caller that wants an opinion
// about what a given combination MEANS forms that opinion itself, one
// layer up; this class only ever answers "what do the two independent
// observations currently say." See docs/Principles.md, "Reconciliation
// Composes Independent Observations; It Does Not Score Them (0.8.55)."
//
// BOTH OBSERVATIONS ARE RUN CONCURRENTLY, AND NEITHER ONE CAN BLOCK OR
// CORRUPT THE OTHER. `reconcile()` awaits both calls together
// (`Promise.all`) — a slow or failing confirmation source never delays
// the content-proof check, and vice versa. Both injected collaborators
// already report every failure they can distinguish through their own
// return value rather than throwing (see anchoring/
// BitcoinAnchorConfirmationObserver.js and anchoring/
// BitcoinOpReturnProofVerifier.js's own headers); this class additionally
// catches a proof verifier that throws anyway, translating it into the
// identical honest UNAVAILABLE form a well-behaved verifier would have
// returned itself — mirroring application/ExternalAnchorVerifier.js's own
// treatment of a throwing proofVerifier.
//
// A MISSING OR MALFORMED `proof.txid` NEVER REACHES THE CONFIRMATION
// OBSERVER. anchoring/BitcoinAnchorConfirmationObserver.js's own `txid`
// parameter is a trusted internal artifact — a malformed one is a
// caller-contract violation it THROWS for, never an observation of its
// own. This class checks the format itself first and, on a malformed or
// absent txid, reports `transaction.confirmation` as UNAVAILABLE with an
// honest reason — never calling the observer, and never letting a
// malformed anchor crash a reconciliation. The content-proof side is
// unaffected: anchoring/BitcoinOpReturnProofVerifier.js already handles a
// malformed proof gracefully on its own (a definite HASH_MISMATCH — see
// that file's own header, "structurally invalid proof... a DEFINITE
// rejection, never 'unavailable'"), so it is still asked, independently.
//
// ONLY `bitcoin-op-return` ANCHORS. Exactly like anchoring/
// BitcoinAnchorConfirmationObserver.js's own txid validation, an anchor
// of a different anchorType handed to `reconcile()` is a caller-contract
// violation this class THROWS for, checked before either collaborator is
// ever consulted — never a reconciliation outcome of its own, because
// neither collaborator this class composes understands any other
// anchorType.
//
// NEVER PERSISTED, NEVER SHARED, NEVER CACHED. Every call to `reconcile()`
// performs two fresh reads and returns a new, frozen record — the
// identical restraint anchoring/BitcoinAnchorConfirmationObserver.js's own
// header already holds for a single observation, extended here to their
// composition. A caller that wants a HISTORY of reconciliations keeps
// that history itself; this class only ever answers "what do both
// observations currently say," once, per call.
export class BitcoinAnchorProofReconciliationView {
    constructor({ bitcoinAnchorConfirmationObserver, bitcoinProofVerifier } = {}) {
        if (!bitcoinAnchorConfirmationObserver || typeof bitcoinAnchorConfirmationObserver.observeConfirmation !== 'function') {
            throw new Error('BitcoinAnchorProofReconciliationView: a bitcoinAnchorConfirmationObserver is required');
        }
        if (!bitcoinProofVerifier || typeof bitcoinProofVerifier.verify !== 'function') {
            throw new Error('BitcoinAnchorProofReconciliationView: a bitcoinProofVerifier is required');
        }
        this._confirmationObserver = bitcoinAnchorConfirmationObserver;
        this._proofVerifier = bitcoinProofVerifier;
    }

    // Resolves to exactly one, frozen, reconciliation record:
    //
    //   { publicationId, anchorId, contentHash,
    //     transaction: { txid,
    //       confirmation: { state, blockHash, blockHeight,
    //                        confirmationCount, reason, observedAt } },
    //     contentProof: { state, contentHash, reason, observedAt } }
    //
    // `transaction.confirmation` is exactly what `bitcoinAnchorConfirmationObserver.
    // observeConfirmation()` itself returned (see anchoring/
    // BitcoinAnchorConfirmationObserver.js's own header for that shape) —
    // never re-derived or re-interpreted. `contentProof` translates the
    // injected `bitcoinProofVerifier`'s own `{ valid, unavailable, reason }`
    // answer into application/BitcoinAnchorContentProofState.js's named
    // vocabulary, nothing more.
    //
    // Throws only for a caller-contract violation checked before either
    // collaborator is ever consulted: a missing/malformed `anchor`, or one
    // whose `anchorType` is not `bitcoin-op-return`. Never throws for
    // either collaborator's own operational failure — those are always
    // reported via `state`.
    async reconcile(anchor) {
        if (!anchor || typeof anchor !== 'object'
            || typeof anchor.publicationId !== 'string' || !anchor.publicationId
            || typeof anchor.contentHash !== 'string' || !anchor.contentHash
            || typeof anchor.anchorType !== 'string') {
            throw new Error('BitcoinAnchorProofReconciliationView: a PublicationAnchor is required');
        }
        if (anchor.anchorType !== 'bitcoin-op-return') {
            throw new Error(`BitcoinAnchorProofReconciliationView: anchor ${anchor.id} is anchorType "${anchor.anchorType}", not "bitcoin-op-return"`);
        }

        const proof = anchor.proof && typeof anchor.proof === 'object' ? anchor.proof : {};
        const txid = typeof proof.txid === 'string' && TXID_PATTERN.test(proof.txid) ? proof.txid.toLowerCase() : null;

        const [confirmation, contentProof] = await Promise.all([
            this._observeConfirmation(txid),
            this._observeContentProof(proof, anchor.contentHash)
        ]);

        return Object.freeze({
            publicationId: anchor.publicationId,
            anchorId: anchor.id || null,
            contentHash: anchor.contentHash,
            transaction: Object.freeze({ txid, confirmation }),
            contentProof
        });
    }

    async _observeConfirmation(txid) {
        if (!txid) {
            return Object.freeze({
                state: BitcoinAnchorConfirmationState.UNAVAILABLE,
                txid: null, blockHash: null, blockHeight: null, confirmationCount: null,
                reason: 'anchor proof does not carry a recognizable transaction id',
                observedAt: new Date()
            });
        }
        return this._confirmationObserver.observeConfirmation(txid);
    }

    async _observeContentProof(proof, contentHash) {
        const observedAt = new Date();
        let result;
        try {
            result = await this._proofVerifier.verify(proof, { contentHash });
        } catch (error) {
            return Object.freeze({
                state: BitcoinAnchorContentProofState.UNAVAILABLE, contentHash, reason: error.message, observedAt
            });
        }
        if (!result || typeof result !== 'object') {
            return Object.freeze({
                state: BitcoinAnchorContentProofState.UNAVAILABLE, contentHash,
                reason: 'proof verifier returned a malformed result', observedAt
            });
        }
        if (result.valid === true) {
            return Object.freeze({ state: BitcoinAnchorContentProofState.HASH_MATCH, contentHash, reason: null, observedAt });
        }
        const state = result.unavailable ? BitcoinAnchorContentProofState.UNAVAILABLE : BitcoinAnchorContentProofState.HASH_MISMATCH;
        return Object.freeze({ state, contentHash, reason: (typeof result.reason === 'string' && result.reason) || null, observedAt });
    }
}
