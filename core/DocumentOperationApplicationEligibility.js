import { CausalGapStatus, DocumentOperationCausalGapDetector } from './DocumentOperationCausalGapDetector.js';

// 0.9.232 — Causal Application Eligibility Boundary.
//
// 0.9.228-0.9.231 answered two separate questions about an operation this
// replica has received:
//
//   Q1: Did we receive it?           -> yes, by construction (it survived
//                                       ReplayGuard and reached this code).
//   Q2: Do we know its causal
//       predecessors?                -> `DocumentOperationCausalGapDetector
//                                       #detect()` (0.9.228), refined by
//                                       0.9.231 into KNOWN != EXECUTED.
//
// Nothing before this milestone named the THIRD question, or drew a line
// between it and Q2:
//
//   Q3: Should we apply it?          -> PRODUCT POLICY.
//
// Today's actual policy (`core/DocumentCollaborationConsistencyPolicy.js`,
// 0.9.226) is `remoteApplication = IMMEDIATE` /
// `history.orderingBasis = ARRIVAL_ORDER` — Q3's current answer is simply
// "always," independent of Q2's answer, which is exactly why 0.9.228's own
// Section H proves a GAPPED operation is applied exactly like an ungapped
// one. This file does not change that policy. It gives the Q2/Q3 boundary
// its own name and its own descriptor, SEPARATE from `CausalGapStatus`,
// so that if a future milestone ever makes Q3's answer depend on Q2's,
// that policy has a seam to live in that is not `CausalGapStatus` itself
// (which must keep meaning exactly what 0.9.228 defined: "is a named
// predecessor absent," nothing about what to do about it) and is not
// `application/CommandHistory.js` (untouched — see "Deliberately excluded"
// below).
//
//   eligibility.ELIGIBLE     — every causal predecessor this operation
//                              names is currently KNOWN to the replica's
//                              causal graph (0.9.227/0.9.228's own
//                              `isKnown()` — true for an EXECUTED
//                              operation and a merely RECOVERED one alike,
//                              see `core/DocumentOperationProvenance.js`).
//   eligibility.NOT_ELIGIBLE — at least one named predecessor is not
//                              currently known.
//
// Deliberately not three values, and deliberately not `BLOCKED`, `WAITING`,
// or `PENDING` — see this file's own header discipline, inherited whole
// from `core/DocumentOperationCausalGapDetector.js`'s own "two outcomes,
// not three." Those words describe LIFECYCLE behavior — something a
// buffering mechanism would own, if one is ever built. This file computes
// a fact about the PRESENT moment only: nothing here queues, waits,
// blocks, retries, or remembers that it was asked.
//
// Composition, not duplication. `evaluateApplicationEligibility()` computes
// its answer by delegating to a `DocumentOperationCausalGapDetector`'s own
// `detect()` — it does not re-walk `DocumentOperationCausalGraph` itself,
// and it never calls `record()`. Right now, ELIGIBLE and NO_GAP (and
// NOT_ELIGIBLE and GAP) happen to coincide for every operation, because
// today's Q3 policy never actually looks past Q2's own answer. That
// coincidence is not a reason to collapse the two vocabularies into one:
// `CausalGapStatus` answers "what does this replica currently know,"
// eligibility answers "can this operation safely enter the application
// path" — the SAME kind of distinction 0.9.231 already drew between
// `isKnown()` and "was executed." A later milestone that wants Q3 to
// consider something Q2 never did (provenance, document policy, an
// author's own trust level) extends THIS file, without reopening
// `core/DocumentOperationCausalGapDetector.js`'s own, already-settled
// contract.
//
// A pure, stateless query — like `DocumentOperationCausalGapDetector
// #detect()` itself. `evaluateApplicationEligibility()` never mutates the
// detector it is given, never records the operation it was asked about,
// and produces the identical answer for the identical inputs no matter how
// many times, or in what order relative to other operations, it is asked.
// Recomputing eligibility for the same operation after new causal
// knowledge arrives is the caller's job, exactly the same way 0.9.228's own
// header describes `detect()` "resolves on re-query, never automatically."
//
// KNOWN is not applied, and applied is not retroactively unmade. Because
// this function only ever reads causal knowledge, and never reads or
// writes `application/CommandHistory.js`, an operation already applied
// under today's ARRIVAL_ORDER policy stays applied — evaluating its
// eligibility later, after a once-missing predecessor becomes known,
// changes the ANSWER this function gives, never the document's own
// history. See `tests/DocumentOperationApplicationEligibility.test.js`,
// the "eligibility evaluation != history repair" section.
//
// Deliberately excluded from this milestone, on purpose: no operation
// queue, no buffering, no delayed execution, no automatic replay, no
// causal reordering, no rollback, no history rewriting, no
// retransmission, no retry, no CRDT, no OT, no conflict resolution, no
// synchronized undo, no convergence guarantee. `application/CommandHistory.js`
// is UNCHANGED by this milestone, and nothing here is wired to gate, delay,
// or otherwise alter any existing call to
// `application/RemoteDocumentOperationApplicationUseCase.js#apply()`.
export const DocumentOperationApplicationEligibility = Object.freeze({
    ELIGIBLE: 'ELIGIBLE',
    NOT_ELIGIBLE: 'NOT_ELIGIBLE'
});

// True for exactly the two closed values above — the same closed-
// vocabulary discipline `core/DocumentOperationProvenance.js
// #isDocumentOperationProvenance()` and
// `core/DocumentOperationCausalGapDetector.js#CausalGapStatus` already
// apply to their own small enums.
export function isDocumentOperationApplicationEligibility(value) {
    return value === DocumentOperationApplicationEligibility.ELIGIBLE
        || value === DocumentOperationApplicationEligibility.NOT_ELIGIBLE;
}

// Pure. Consumes exactly the facts this milestone's own design calls for —
// the operation's identity, its own causal predecessor list, and the
// replica's current causal knowledge (via `causalGapDetector`) — and
// produces a small, flat descriptor:
//
//   {
//       operationId,
//       documentId,
//       eligibility: ELIGIBLE | NOT_ELIGIBLE,
//       missingCausalPredecessorIds: [...]
//   }
//
// `missingCausalPredecessorIds` is `detect()`'s own field, threaded through
// unchanged — never reshaped, never renamed to a second, possibly-drifting
// name for the identical list, the same restraint
// `application/DocumentOperationCausalGapObservationUseCase.js`'s own
// header already applies to its own `causalGap` field.
//
// `causalGapDetector` defaults to a fresh, private
// `DocumentOperationCausalGapDetector` — pass one explicitly to evaluate
// against a replica's REAL, already-populated causal knowledge (shared
// with whatever `DocumentOperationCausalGapObservationUseCase` or
// `DocumentOperationRecoveryUseCase` already recorded into it).
export function evaluateApplicationEligibility(documentId, { operationId, causalPredecessors = [] } = {}, { causalGapDetector = new DocumentOperationCausalGapDetector() } = {}) {
    if (!causalGapDetector || typeof causalGapDetector.detect !== 'function') {
        throw new Error('evaluateApplicationEligibility(): a DocumentOperationCausalGapDetector is required');
    }
    const causalGap = causalGapDetector.detect(documentId, { operationId, causalPredecessors });
    return {
        operationId,
        documentId,
        eligibility: causalGap.status === CausalGapStatus.NO_GAP
            ? DocumentOperationApplicationEligibility.ELIGIBLE
            : DocumentOperationApplicationEligibility.NOT_ELIGIBLE,
        missingCausalPredecessorIds: causalGap.missingCausalPredecessorIds
    };
}
