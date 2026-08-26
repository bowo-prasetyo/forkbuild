// 0.8.36 — Unified Explicit Snapshot Materialization Sources.
//
// Names every way application/StoreSnapshotContentUseCase.js#execute() can
// end — the same "one enum, one file" shape application/
// SnapshotContentTransferOutcome.js (0.8.32) and application/
// SnapshotPlacementMaterializationOutcome.js (0.8.35) already established,
// applied here to the boundary BOTH of those now share instead of each
// re-implementing their own `verify()`-then-`has()`-then-`put()` shape
// independently.
//
//   STORED             — `bytes` verified against the caller's own claimed
//                         `contentHash` and were newly written to this
//                         replica's own content/ContentStore.js.
//   ALREADY_AVAILABLE  — `bytes` verified, but this replica already held
//                         bytes for that same hash. Never an error — the
//                         identical "duplicate is not a failure" posture
//                         application/SnapshotContentTransferOutcome.js's
//                         own ALREADY_STORED and application/
//                         SnapshotPlacementMaterializationOutcome.js's own
//                         ALREADY_AVAILABLE already hold, one layer over,
//                         for each of the two sources that now share this
//                         one boundary.
//   HASH_MISMATCH      — `bytes` do NOT hash to the caller's own claimed
//                         `contentHash`. Nothing is stored. THE ONE outcome
//                         that says the bytes a caller handed this boundary
//                         do not match what they themselves claimed —
//                         regardless of whether those bytes came from an
//                         offline package or a resolved placement.
//
// Deliberately NOT the outer vocabulary either existing caller shows to
// its own UI. `application/SnapshotContentTransferOutcome.js` and
// `application/SnapshotPlacementMaterializationOutcome.js` each keep their
// own distinct outer values (STORED/ALREADY_STORED/CONTENT_HASH_MISMATCH,
// and STORED/ALREADY_AVAILABLE/UNAVAILABLE/HASH_MISMATCH/INVALID_PLACEMENT
// respectively) — this file's three values are a strictly narrower,
// SHARED inner vocabulary each of those two outer enums maps onto for
// exactly the one question both of them ultimately answer through this
// class: once bytes and a claimed hash reach the storage boundary, what
// happened to them? See application/StoreSnapshotContentUseCase.js's own
// header.
export const StoreSnapshotContentOutcome = Object.freeze({
    STORED: 'stored',
    ALREADY_AVAILABLE: 'already-available',
    HASH_MISMATCH: 'hash-mismatch'
});
