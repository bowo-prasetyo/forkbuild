import { DocumentOperationCausalGraph } from './DocumentOperationCausality.js';
import { isValidCausalPredecessorList } from './DocumentOperationEnvelope.js';

// 0.9.228 — Document Operation Causal Gap Detection Boundary.
//
// 0.9.227 made causal dependency REPRESENTABLE and QUERYABLE
// (`core/DocumentOperationCausality.js#DocumentOperationCausalGraph`) but
// deliberately stopped at metadata: `compare()` only ever reasons about
// two operations THIS graph already knows about, and answers UNKNOWN for
// anything else without naming what "anything else" actually means for a
// single, just-arrived operation. This file answers exactly that
// narrower, more useful question:
//
//   given one operation and what THIS replica currently knows, is any
//   causal predecessor it names actually absent?
//
// That is the whole milestone. It is detection only — see "Deliberately
// excluded" below for the long list of things this deliberately is not.
//
// A causal gap is evidence, not a lifecycle claim. If operation B names A
// as a causal predecessor and this replica has never recorded A, that
// proves only that THIS REPLICA does not currently know A — never that A
// was lost, never that A should be requested, never that B is somehow
// invalid. `core/DocumentOperationCausality.js`'s own header already
// draws this exact line for UNKNOWN comparisons; this file draws the same
// line for its own GAP status, on purpose, with the same vocabulary
// discipline: "causal gap detected," never a stronger word like
// `MISSING_OPERATION` that would imply a lifecycle this codebase does not
// yet track.
//
// Two outcomes, not three. `DocumentOperationCausalGraph#compare()` needs
// an UNKNOWN answer because comparing two operations can fail for a
// reason unrelated to either operation's own predecessors: the graph may
// simply never have been told about one of them. Detecting a gap for ONE
// operation is a strictly narrower question — the operation's own
// `causalPredecessors` array is given directly by the caller, never
// looked up — so there is nothing left to be ambiguous about: every
// named predecessor either is or is not `isKnown()` to the underlying
// graph, right now. An empty predecessor list (a genesis operation) is
// unconditionally NO_GAP, the same way `DocumentOperationCausalGraph`
// treats an empty predecessor set as trivially valid. A third UNKNOWN
// status here would not describe any real intermediate state — it would
// just be unused vocabulary, which is exactly what this milestone's own
// "detection only" restraint argues against manufacturing.
//
// Detection is a pure query; recording is a separate, explicit act. Only
// `record()` mutates — the SAME split
// `core/DocumentOperationCausality.js#DocumentOperationCausalGraph` already
// draws between its own `record()` and `compare()`. `detect()` never
// records the operation it was asked about, and never guesses at
// predecessors beyond the list it was given. This means a gap detected
// now can genuinely stop being detected LATER, without this class doing
// anything active about it: once the missing predecessor is itself
// `record()`-ed (by whatever caller learns of it, however it learns of
// it — this class has no opinion), the next `detect()` call for the
// SAME operation, with the SAME predecessor list, answers NO_GAP,
// because it re-reads current graph state instead of caching its own
// earlier verdict. Nothing here decides to re-check, re-apply, or
// request anything — that observation is exactly as far as 0.9.228 goes.
//
// Not deduplication. `replication/ReplayGuard.js` already answers "have I
// already accepted this exact operationId" and does so completely
// independently of this file. `record()` here is idempotent for a repeat
// of the identical (documentId, operationId, predecessors) triple purely
// because the underlying `DocumentOperationCausalGraph#record()` already
// is — never a second duplicate-delivery mechanism layered on top. A
// replica that calls `detect()`/`record()` twice for the same delivered
// operation gets the same answer twice, not a growing side effect.
//
// Deliberately excluded from this milestone, on purpose: no operation
// queue, no buffering, no delayed application, no retransmission
// requests, no automatic predecessor retrieval, no retry, no
// synchronization protocol, no rollback, no reordering, no CRDT, no OT,
// no vector clocks, no conflict resolution, no convergence guarantee, no
// synchronized undo. `application/CommandHistory.js` and
// `application/RemoteDocumentOperationApplicationUseCase.js` are both
// UNTOUCHED by this milestone — a detected gap changes nothing about
// whether or how an operation gets applied; see
// `tests/DocumentOperationCausalGapDetector.test.js` Section H, which
// proves `RemoteDocumentOperationApplicationUseCase#apply()` applies a
// gapped operation exactly as it would an ungapped one.
export const CausalGapStatus = Object.freeze({
    NO_GAP: 'NO_GAP',
    GAP: 'GAP'
});

export class DocumentOperationCausalGapDetector {
    // `causalGraph` defaults to a fresh, private
    // `DocumentOperationCausalGraph` — pass one explicitly only when a
    // caller needs to share graph state with something else already
    // holding a graph instance (e.g. a test reconstructing both a
    // detector and a graph from the same received data).
    constructor({ causalGraph = new DocumentOperationCausalGraph() } = {}) {
        if (!causalGraph || typeof causalGraph.isKnown !== 'function' || typeof causalGraph.record !== 'function') {
            throw new Error('DocumentOperationCausalGapDetector: a DocumentOperationCausalGraph is required');
        }
        this._graph = causalGraph;
    }

    // Pure. Never mutates, never records `operationId` itself. Answers,
    // for THIS operation's own causal predecessor list, checked against
    // what is currently `isKnown()` to the underlying graph:
    //
    //   { status: CausalGapStatus.NO_GAP, missingCausalPredecessorIds: [] }
    //
    // or
    //
    //   { status: CausalGapStatus.GAP, missingCausalPredecessorIds: [...] }
    //
    // `missingCausalPredecessorIds` names every predecessor this
    // operation lists that is not currently known — ALL of them, not
    // merely the first, so a caller can tell a diamond-shaped operation
    // (`core/DocumentOperationCausality.js`'s own Section 5 shape) with
    // one missing predecessor out of several apart from one missing all
    // of them. Document-scoped like every other method in this file's
    // own sibling: a predecessor recorded under a different documentId
    // is not "known" here either (`DocumentOperationCausalGraph#isKnown()`
    // is itself document-scoped — see that file's own header).
    detect(documentId, { operationId, causalPredecessors = [] } = {}) {
        if (!documentId || typeof documentId !== 'string') {
            throw new Error('DocumentOperationCausalGapDetector.detect(): documentId is required');
        }
        if (!operationId || typeof operationId !== 'string') {
            throw new Error('DocumentOperationCausalGapDetector.detect(): operationId is required');
        }
        if (!isValidCausalPredecessorList(causalPredecessors, operationId)) {
            throw new Error('DocumentOperationCausalGapDetector.detect(): causalPredecessors must be an array of distinct, non-empty operationId strings that does not include this operation\'s own operationId');
        }
        const missingCausalPredecessorIds = causalPredecessors.filter((predecessorId) => !this._graph.isKnown(documentId, predecessorId));
        return {
            status: missingCausalPredecessorIds.length === 0 ? CausalGapStatus.NO_GAP : CausalGapStatus.GAP,
            missingCausalPredecessorIds
        };
    }

    // Delegates entirely to `DocumentOperationCausalGraph#record()` — see
    // that method's own header for its idempotency / contract-violation
    // rules, which apply here completely unchanged. Recording an
    // operation is what lets a LATER `detect()` call, for some OTHER
    // operation that names this one as a predecessor, stop reporting a
    // gap — see this file's own header.
    record(documentId, operationId, causalPredecessors = []) {
        this._graph.record(documentId, operationId, causalPredecessors);
    }

    // True once `record()` has been called for this exact (documentId,
    // operationId) pair. Exposed only because it is already the
    // underlying graph's own vocabulary — this class adds no meaning to
    // it beyond `DocumentOperationCausalGraph#isKnown()`'s own.
    isKnown(documentId, operationId) {
        return this._graph.isKnown(documentId, operationId);
    }
}
