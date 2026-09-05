// 0.9.159 — Snapshot World Placement.
//
// Names the ONLY two outcomes `application/SnapshotWorldPlacement.js#resolveSnapshotWorldPlacement()`
// invents on its own — the same "as small as possible" restraint application/
// SnapshotPublicationAttributionOutcome.js (0.9.143) already holds one seam
// over, for the identical reason: name the difference structurally, never
// fold it into a vaguer, larger status.
//
// A MATERIALIZATION FAILURE IS NEVER REPORTED AS UNPLACED. When the
// materialization result handed to `resolveSnapshotWorldPlacement()` did not
// itself reach `StoreSnapshotContentOutcome.STORED`/`.ALREADY_AVAILABLE` —
// any resolver-failure outcome passed through from a PLACEMENT/PEER/
// CANDIDATE materialization attempt, a HASH_MISMATCH, an INVALID_PLACEMENT,
// an UNAVAILABLE — that outcome is passed through unchanged. This file adds
// exactly two new values, reachable only once a Snapshot has already been
// independently materialized (turned into this replica's own local
// possession).
export const SnapshotWorldPlacementOutcome = Object.freeze({
    // Materialization succeeded, AND the Publication this Snapshot's bytes
    // belong to already has its own WorldPlacement — this replica's
    // pre-existing spatial authority for "where is this Publication in the
    // World" (core/WorldPlacement.js, application/PlacePublicationUseCase.js,
    // both entirely unchanged by this milestone). The materialized
    // Snapshot's own World position is that SAME placement's own position,
    // borrowed verbatim — never recomputed, never a new spatial algorithm.
    PLACED: 'placed',
    // Materialization succeeded, but the Publication this Snapshot's bytes
    // belong to has never been placed anywhere in the World yet. Exactly as
    // unencounterable as any other unplaced Publication — see core/
    // WorldEncounter.js's own header, "a Publication with no WorldPlacement
    // is exactly as unencounterable... as any other document that was never
    // placed." Never a fabricated position of any kind — no placement is
    // ever invented from a locator, a discovery order, or anyone's current
    // avatar position.
    UNPLACED: 'unplaced'
});
