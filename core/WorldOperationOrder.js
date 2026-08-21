// 0.2.97 — Shared World Ordering & Conflict Resolution.
//
// The deterministic TOTAL order every replica uses to decide "which of
// these two operations comes first" — the central invariant this
// milestone exists to establish:
//
//   Every authorized replica that receives the SAME set of valid World
//   operations eventually derives the SAME World state, regardless of
//   arrival order or retransmission order.
//
// Two components, in order:
//
//   1. logicalClock — the causal/logical sequence (core/LogicalClock.js)
//   2. operationId  — the operation's own globally-unique identity
//                      (application/commands/Command.js's own
//                      createId(), never reused — see
//                      core/WorldOperationEnvelope.js's own header,
//                      "this is what makes idempotency free")
//
// operationId is already unique per operation, so these two components
// together give a STRICT total order: no two DISTINCT operations can
// ever compare EQUAL. That is deliberately stronger than a causal
// (partial) order — this milestone never needs to distinguish
// "happened before" from "concurrent," only "which one does every
// replica agree comes first" — see core/LogicalClock.js's own header
// for why a scalar Lamport clock, not a vector clock, is the right
// tool for that weaker, sufficient question.
export function compareWorldOperations(a, b) {
    if (a.logicalClock !== b.logicalClock) {
        return a.logicalClock < b.logicalClock ? -1 : 1;
    }
    if (a.operationId === b.operationId) {
        return 0;
    }
    return a.operationId < b.operationId ? -1 : 1;
}

// Extracts the {logicalClock, operationId} sort key this file's own
// comparator consumes from a WorldOperationEnvelope (core/
// WorldOperationEnvelope.js) or anything shaped like one. A missing/
// non-integer logicalClock degrades to 0 — the exact graceful-read
// posture core/WorldOperationEnvelope.js's own isValidWorldOperationEnvelope()
// already takes for a pre-0.2.97 envelope: it still orders (by
// operationId alone, among every other 0), it just carries no causal
// information.
export function worldOperationSortKey(envelope) {
    return {
        logicalClock: Number.isInteger(envelope.logicalClock) ? envelope.logicalClock : 0,
        operationId: envelope.operationId
    };
}
