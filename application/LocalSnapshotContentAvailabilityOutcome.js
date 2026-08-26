// 0.8.33 — Local Snapshot Content Availability & Integrity UX.
//
// Names every way application/CheckLocalSnapshotContentAvailabilityUseCase.js
// #execute() can end, the same "one outcome enum per pipeline" shape
// application/SnapshotContentTransferOutcome.js (0.8.32) and application/
// SnapshotPlacementResolutionOutcome.js (0.8.18/0.8.20) already established
// one layer over. This enum answers a narrower question than either of
// those: given a publication this replica already knows about, does its
// OWN local content/ContentStore.js right now hold usable bytes for that
// publication's own contentReference?
//
//   NOT_AVAILABLE          — this replica's local ContentStore does not
//                             currently hold any bytes for this
//                             publication's contentReference.hash. Says
//                             nothing about whether the bytes exist
//                             ANYWHERE else — a placement may still claim
//                             a retrievable locator, an anchor may still
//                             record external evidence, and a Publication
//                             Snapshot Transfer Package (0.8.32) may still
//                             exist to close this gap. This outcome
//                             describes only THIS replica's present
//                             content state.
//   AVAILABLE               — bytes are present, AND core/
//                             ContentReference.js#verify() confirms they
//                             hash to the publication's own claimed
//                             contentHash. The strongest true statement
//                             this milestone ever makes: "local snapshot
//                             is available and matches the publication's
//                             content hash" — never "verified,"
//                             "trusted," or "authentic," which describe a
//                             different, external claim this observation
//                             does not touch.
//   CONTENT_HASH_MISMATCH   — bytes ARE present under this hash, but they
//                             no longer verify against it — the local
//                             storage layer holding something other than
//                             what its own key claims, whether through
//                             corruption, a bug, or direct tampering with
//                             the underlying storage. A DEFINITE finding,
//                             never conflated with NOT_AVAILABLE: "no
//                             bytes here" and "the wrong bytes are here"
//                             are different facts about this replica's
//                             own storage, exactly the distinction
//                             application/
//                             SnapshotPlacementResolutionOutcome.js
//                             already draws between CONTENT_UNAVAILABLE
//                             and its own CONTENT_HASH_MISMATCH, one layer
//                             over.
export const LocalSnapshotContentAvailabilityOutcome = Object.freeze({
    NOT_AVAILABLE: 'not-available',
    AVAILABLE: 'available',
    CONTENT_HASH_MISMATCH: 'content-hash-mismatch'
});
