import { isValidCausalPredecessorList } from './DocumentOperationEnvelope.js';

// 0.9.227 — Document Operation Identity & Causal Predecessor Boundary.
//
// 0.9.226 froze five properties of this codebase's REAL Editor-document
// collaboration chain, and named `delivery.order = NOT_GUARANTEED` and
// `missingOperations.detection = NONE` as two of them. Its own
// "Recommendation" section named the smallest honest next step as
// "causal delivery" — but a full causal-delivery MECHANISM (ordering,
// buffering, gap detection) was explicitly deferred, because a scalar
// send-time signal cannot even ASK the question that matters first:
//
//   given two operations, did one happen because of the other, or did
//   they happen independently ("concurrently")?
//
// This file answers exactly that question, and only that question. It
// is pure causal METADATA — a way to record "operation B was authored
// with knowledge of operations {A, C, ...}" and later ask "given what is
// currently known, how do A and B relate?" It does not decide what to do
// with the answer. Nothing here reorders `application/CommandHistory.js`,
// buffers an operation, requests a retransmission, or resolves a
// conflict — see "Deliberately excluded" below. That restraint is not an
// oversight; it is this milestone's entire point, the same way
// `core/DocumentCollaborationConsistencyPolicy.js` (0.9.226) deliberately
// named a boundary without building the mechanism on the other side of
// it.
//
// Causal predecessors, not a logical/vector clock — why:
//
//   A scalar Lamport clock gives every operation a single number and a
//   total order, but a total order CANNOT distinguish "B genuinely
//   depends on A" from "B merely got a higher number than A." Two
//   operations authored with no knowledge of each other still end up
//   comparable (one number is bigger), which is precisely the false
//   information 0.9.226's own `conflict.nonCommutingOperations =
//   UNDEFINED` finding warns against manufacturing.
//
//   A predecessor SET — "which operationIds had I already applied when
//   I authored this one" — answers the real question directly: if B
//   lists A as a (transitive) predecessor, A happened-before B; if
//   neither lists the other, they are CONCURRENT, genuinely and
//   verifiably, not merely "arrived in some order."
//
// The graph this file builds mirrors exactly what
// `application/CommandHistory.js` already is on a single replica: a
// LINEAR stack, never a branching structure a single replica can create
// on its own (see `application/DocumentCommandPropagationUseCase.js`'s
// own `attachCommandHistory()`, which stamps each newly-broadcast local
// command with exactly one predecessor — the command immediately before
// it in that replica's own history, or none for the first). A DIAMOND
// shape (`A -> B`, `A -> C`, `B,C -> D`) — two operations that
// independently follow a common ancestor, later joined by one that
// follows both — is possible in the METADATA this file can represent
// and compare (Test D below), even though nothing yet in this codebase's
// runtime constructs one; that is exactly the seam a future milestone
// (merging two replicas' histories, or an explicit multi-parent
// operation) would use without reshaping this file's own contract.
//
// Deliberately excluded from this milestone, on purpose:
//   no operation queue, no waiting for predecessors, no retransmission,
//   no gap/missing-operation detection, no logical/Lamport/vector clock,
//   no CRDT, no OT, no conflict resolution, no automatic reordering, no
//   rollback, no synchronized undo, no offline synchronization, no
//   convergence guarantee. `application/CommandHistory.js` is UNCHANGED
//   by this milestone — see `core/DocumentCollaborationConsistencyPolicy.js`,
//   `history.orderingBasis = ARRIVAL_ORDER`, which this milestone does
//   not touch or reassign.
//
// UNKNOWN is a first-class, deliberately common answer, not an error
// case: `DocumentOperationCausalGraph#compare()` only ever reasons about
// operations THIS graph was explicitly told about via `record()`. An
// operation B that lists a predecessor A the graph never recorded is
// still perfectly valid to record (0.9.227's own design constraint,
// below) — B's relationship to that unrecorded A is UNKNOWN, not
// CONCURRENT and not an error. Conflating "I have no information about
// this pair" with "these two are independent" would misrepresent exactly
// the gap `core/DocumentCollaborationConsistencyPolicy.js`'s own
// `missingOperations.detection = NONE` already names: causal metadata
// answers "does B depend on A," never "please go fetch A" — this file
// has no concept of fetching, retrying, or even noticing that A is
// missing beyond this one UNKNOWN answer.
export const CausalRelationship = Object.freeze({
    BEFORE: 'BEFORE',
    AFTER: 'AFTER',
    CONCURRENT: 'CONCURRENT',
    SAME: 'SAME',
    UNKNOWN: 'UNKNOWN'
});

// A pure, in-memory record of "operation X, in document D, was authored
// with these causal predecessors" and the comparisons derivable from it.
// Document-scoped by construction — every key this graph ever stores or
// looks up is `(documentId, operationId)`, never a bare operationId — so
// an operationId that happens to collide across two unrelated documents
// can never make one document's operation a causal predecessor of
// another's. This is the SAME "own file, own scope, never widen a
// sibling's contract" discipline `core/DocumentOperationEnvelope.js`'s
// own header already applies against `core/WorldOperationEnvelope.js`.
export class DocumentOperationCausalGraph {
    constructor() {
        this._predecessors = new Map(); // "documentId::operationId" -> Set of "documentId::operationId"
    }

    _key(documentId, operationId) {
        return `${documentId}::${operationId}`;
    }

    // Records one operation's own identity and its causal predecessors.
    // `predecessorOperationIds` is interpreted ENTIRELY within `documentId`
    // — there is no way to construct a cross-document predecessor edge
    // through this method, by design (see this file's own header).
    // Idempotent for a repeat of the identical (documentId, operationId,
    // predecessors) triple — mirrors `replication/ReplayGuard.js`'s own
    // "recording the same thing twice is a no-op" posture. Recording the
    // SAME operationId again with a DIFFERENT predecessor set is a
    // contract violation (an operation's causal history is immutable
    // once authored) and throws, rather than silently overwriting
    // history a caller may already have compared against.
    record(documentId, operationId, predecessorOperationIds = []) {
        if (!documentId || typeof documentId !== 'string') {
            throw new Error('DocumentOperationCausalGraph.record(): documentId is required');
        }
        if (!operationId || typeof operationId !== 'string') {
            throw new Error('DocumentOperationCausalGraph.record(): operationId is required');
        }
        if (!isValidCausalPredecessorList(predecessorOperationIds, operationId)) {
            throw new Error('DocumentOperationCausalGraph.record(): predecessorOperationIds must be an array of distinct, non-empty operationId strings that does not include this operation\'s own operationId');
        }
        const key = this._key(documentId, operationId);
        const predecessorKeys = new Set(predecessorOperationIds.map((id) => this._key(documentId, id)));
        const existing = this._predecessors.get(key);
        if (existing) {
            const same = existing.size === predecessorKeys.size
                && [...existing].every((k) => predecessorKeys.has(k));
            if (same) {
                return;
            }
            throw new Error(`DocumentOperationCausalGraph.record(): operation "${operationId}" was already recorded with a different causal predecessor set`);
        }
        this._predecessors.set(key, predecessorKeys);
    }

    // True once `record()` has been called for this exact (documentId,
    // operationId) pair. An operation named only as SOMEONE ELSE's
    // predecessor, but never itself `record()`-ed, is NOT known — see
    // this file's own header on why that stays UNKNOWN rather than being
    // treated as an implicit genesis operation.
    isKnown(documentId, operationId) {
        return this._predecessors.has(this._key(documentId, operationId));
    }

    // Depth-first search: is `ancestorKey` reachable from `descendantKey`
    // by following recorded predecessor edges (directly or transitively)?
    // Unknown intermediate operations simply have no outgoing edges to
    // walk — they neither help nor hinder reaching `ancestorKey` through
    // some other path.
    _isAncestor(ancestorKey, descendantKey, visited) {
        const predecessorKeys = this._predecessors.get(descendantKey);
        if (!predecessorKeys) {
            return false;
        }
        if (predecessorKeys.has(ancestorKey)) {
            return true;
        }
        for (const predecessorKey of predecessorKeys) {
            if (visited.has(predecessorKey)) {
                continue;
            }
            visited.add(predecessorKey);
            if (this._isAncestor(ancestorKey, predecessorKey, visited)) {
                return true;
            }
        }
        return false;
    }

    // Compares two operations WITHIN the same document. Comparing across
    // two different documentIds is a caller error (there is no such
    // thing as a cross-document causal relationship in this codebase —
    // see this file's own header) and throws, rather than quietly
    // returning UNKNOWN for a question that should never have been asked.
    //
    //   SAME       — identical (documentId, operationId).
    //   BEFORE     — operationIdA is a (transitive) causal predecessor
    //                of operationIdB.
    //   AFTER      — the reverse.
    //   CONCURRENT — both are KNOWN to this graph, neither is a
    //                predecessor of the other.
    //   UNKNOWN    — either operation was never `record()`-ed, so there
    //                is not enough information to say more.
    compare(documentId, operationIdA, operationIdB) {
        if (!documentId || typeof documentId !== 'string') {
            throw new Error('DocumentOperationCausalGraph.compare(): documentId is required');
        }
        if (operationIdA === operationIdB) {
            return CausalRelationship.SAME;
        }
        if (!this.isKnown(documentId, operationIdA) || !this.isKnown(documentId, operationIdB)) {
            return CausalRelationship.UNKNOWN;
        }
        const keyA = this._key(documentId, operationIdA);
        const keyB = this._key(documentId, operationIdB);
        if (this._isAncestor(keyA, keyB, new Set())) {
            return CausalRelationship.BEFORE;
        }
        if (this._isAncestor(keyB, keyA, new Set())) {
            return CausalRelationship.AFTER;
        }
        return CausalRelationship.CONCURRENT;
    }
}
