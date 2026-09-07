import {
    DocumentOperationApplicationEligibility,
    evaluateApplicationEligibility
} from './DocumentOperationApplicationEligibility.js';
import { DocumentOperationCausalGapDetector } from './DocumentOperationCausalGapDetector.js';

// 0.9.234 — Causal Application Readiness Boundary.
//
// 0.9.231 named the distinction between an operation this replica has
// merely RECORDED as causally known (`DocumentOperationProvenance.RECOVERED`)
// and one that has actually changed local state
// (`DocumentOperationProvenance.EXECUTED`, present in
// `application/CommandHistory.js#getExecutedCommands()`). 0.9.232 then built
// `evaluateApplicationEligibility()` entirely on top of KNOWN — the causal
// graph's own vocabulary — without ever asking whether a named predecessor
// was EXECUTED. That was correct for what 0.9.232 set out to name (Q2/Q3,
// "do we know its predecessors" / "should we apply it"), but it leaves a gap
// this milestone closes:
//
//   Q1  Did we receive it?              -> yes, by construction.
//   Q2  Do we know its causal
//       predecessors?                   -> DocumentOperationCausalGapDetector
//                                          #detect() (0.9.228).
//   Q3  Is it causally eligible?        -> DocumentOperationApplicationEligibility
//                                          (0.9.232) — reads KNOWN only.
//   Q4  Have its causal predecessors
//       ACTUALLY been applied?          -> THIS file. Reads EXECUTED.
//
// Causally known does not mean causally applied. A predecessor can be
// ELIGIBLE-granting (0.9.232's own Section F/G, and 0.9.231's own header)
// purely by having arrived through `DocumentOperationRecoveryUseCase` —
// verified causal evidence that it exists, never a claim that it changed
// this replica's own document state. If a successor is now applied on the
// strength of ELIGIBLE alone, this replica can execute
//
//   B
//
// without ever having executed
//
//   A -> B
//
// even though B names A as a causal predecessor — the receiving replica's
// document state can genuinely diverge from what the author's own device
// actually produced. This file gives that fourth question — "not merely
// known, but actually applied" — its own name, separate from
// `DocumentOperationApplicationEligibility` (which must keep meaning exactly
// what 0.9.232 defined: KNOWN, nothing about EXECUTED) and separate from
// `application/CommandHistory.js` itself (untouched — see "Deliberately
// excluded" below).
//
//   readiness.READY      — every causal predecessor this operation names is
//                          currently KNOWN (0.9.232's own ELIGIBLE) AND has
//                          actually been EXECUTED (present in the injected
//                          execution-history query — see below).
//   readiness.NOT_READY  — at least one named predecessor is either not
//                          known at all, or known only through recovery —
//                          never actually executed.
//
// Deliberately two values, not three, for the exact reason 0.9.232's own
// header already gives for its own vocabulary: `BLOCKED`/`WAITING`/`PENDING`
// describe LIFECYCLE behavior a buffering mechanism would own, if one is
// ever built. This file computes a fact about the present moment only —
// nothing here queues, waits, blocks, retries, defers, or remembers that it
// was asked.
//
// Composition, not duplication — twice over. `evaluateApplicationReadiness()`
// computes its answer by delegating to `evaluateApplicationEligibility()`
// for Q3 (which itself delegates to a `DocumentOperationCausalGapDetector`
// for Q2) — it never re-walks `DocumentOperationCausalGraph` itself, and
// never calls `record()`. Q4 is answered by delegating to an INJECTED
// execution-history query, never by reaching into
// `application/CommandHistory.js` directly. That seam is deliberate: this
// milestone does NOT introduce a new query method on `CommandHistory` (no
// `CommandHistory#containsApplied()`), the same restraint
// `core/DocumentOperationProvenance.js`'s own header already applied for
// exactly this reason — a new piece of tracked state that could itself
// drift out of sync with `CommandHistory#getExecutedCommands()`, the ONE
// real source of truth for "was this actually applied." Callers that want
// readiness evaluated against a replica's REAL execution history pass an
// `executionHistory` object shaped `{ isExecuted(documentId, operationId) }`
// — trivially built by a caller that already holds a `CommandHistory`
// instance (or several, one per open document), the same way 0.9.232's own
// callers pass a `causalGapDetector` that already holds real causal
// knowledge.
//
// A pure, stateless query, exactly like `evaluateApplicationEligibility()`
// and `DocumentOperationCausalGapDetector#detect()` before it:
// `evaluateApplicationReadiness()` never mutates the detector or execution
// query it is given, never records or executes the operation it was asked
// about, and produces the identical answer for identical inputs no matter
// how many times, or in what order relative to other operations, it is
// asked. Recomputing readiness after new causal knowledge or new execution
// history arrives is the caller's job — see 0.9.228's own "resolves on
// re-query, never automatically," which this file inherits unchanged.
//
// Recovery repairs causal knowledge; it never manufactures execution
// history. Because this function only ever READS `executionHistory`, and
// this milestone adds no write path to it, a predecessor that is merely
// RECOVERED stays NOT_READY-causing for every dependent that names it,
// for as long as it remains unexecuted — exactly the invariant this
// milestone exists to prove observable. See
// `tests/DocumentOperationApplicationReadiness.test.js`, the recovered-
// predecessor section, for the central case this whole boundary protects.
//
// Deliberately excluded from this milestone, on purpose: no operation
// queue, no buffering, no pending-operation collection, no delayed
// application, no automatic replay, no causal reordering, no recovery
// changes, no `CommandHistory` changes, no conflict resolution, no CRDT, no
// OT, no synchronized undo, no convergence guarantee, no change to
// `ARRIVAL_ORDER`, no production enforcement. In particular, this file does
// not turn `NOT_READY` into a queue — nothing here gates, delays, or
// otherwise alters any existing call to
// `application/RemoteDocumentOperationApplicationUseCase.js#apply()`. That
// remains the next, still-open, explicit product decision.
export const DocumentOperationApplicationReadiness = Object.freeze({
    READY: 'READY',
    NOT_READY: 'NOT_READY'
});

// True for exactly the two closed values above — the same closed-vocabulary
// discipline `core/DocumentOperationApplicationEligibility.js
// #isDocumentOperationApplicationEligibility()` already applies to its own
// small enum.
export function isDocumentOperationApplicationReadiness(value) {
    return value === DocumentOperationApplicationReadiness.READY
        || value === DocumentOperationApplicationReadiness.NOT_READY;
}

// Pure. Consumes the operation's identity and its own causal predecessor
// list, an (optional, defaulted) `causalGapDetector` for Q2/Q3, and a
// REQUIRED `executionHistory` for Q4. Produces a small, flat descriptor:
//
//   {
//       operationId,
//       documentId,
//       readiness: READY | NOT_READY,
//       eligibility: ELIGIBLE | NOT_ELIGIBLE,
//       missingCausalPredecessorIds: [...],
//       unexecutedCausalPredecessorIds: [...]
//   }
//
// `missingCausalPredecessorIds` is `evaluateApplicationEligibility()`'s own
// field, threaded through unchanged. `unexecutedCausalPredecessorIds` is
// this file's own: every named predecessor for which
// `executionHistory.isExecuted(documentId, predecessorId)` answers false —
// this INCLUDES predecessors that are not even known, since an unknown
// predecessor was, by construction, never executed either. A caller can
// therefore always tell, from one descriptor, both "what is this replica
// missing entirely" and "what does it know about but has not yet applied."
//
// `readiness` is READY only when BOTH gates clear: `eligibility` is
// ELIGIBLE (every predecessor KNOWN) AND `unexecutedCausalPredecessorIds`
// is empty (every predecessor EXECUTED). A predecessor that is merely
// RECOVERED is KNOWN but not EXECUTED — eligibility for such an operation
// is ELIGIBLE while readiness is NOT_READY, exactly the distinction this
// milestone's own header exists to prove.
//
// `executionHistory` has no default: unlike `causalGapDetector` (which
// safely defaults to a fresh, private, empty
// `DocumentOperationCausalGraph`), silently defaulting an execution-history
// query to "nothing is ever executed" would make every operation with any
// predecessor NOT_READY by construction, in a way indistinguishable from a
// caller's own genuine "nothing has executed yet" state — an easy, silent
// mistake this file refuses to allow. Callers must say explicitly what
// this replica's execution history is.
export function evaluateApplicationReadiness(documentId, { operationId, causalPredecessors = [] } = {}, { causalGapDetector = new DocumentOperationCausalGapDetector(), executionHistory } = {}) {
    if (!executionHistory || typeof executionHistory.isExecuted !== 'function') {
        throw new Error('evaluateApplicationReadiness(): an executionHistory with isExecuted(documentId, operationId) is required');
    }
    const eligibility = evaluateApplicationEligibility(documentId, { operationId, causalPredecessors }, { causalGapDetector });
    const unexecutedCausalPredecessorIds = causalPredecessors.filter((predecessorId) => !executionHistory.isExecuted(documentId, predecessorId));
    const readiness = eligibility.eligibility === DocumentOperationApplicationEligibility.ELIGIBLE && unexecutedCausalPredecessorIds.length === 0
        ? DocumentOperationApplicationReadiness.READY
        : DocumentOperationApplicationReadiness.NOT_READY;
    return {
        operationId,
        documentId,
        readiness,
        eligibility: eligibility.eligibility,
        missingCausalPredecessorIds: eligibility.missingCausalPredecessorIds,
        unexecutedCausalPredecessorIds
    };
}
