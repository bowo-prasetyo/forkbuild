// 0.9.160 — Snapshot World Runtime Registration.
//
// Names the ONLY outcome `application/MaterializedSnapshotWorldDiscoveryBridge.js#
// registerMaterializedSnapshotWorldSource()` invents on its own — narrower
// still than `application/SnapshotWorldPlacementOutcome.js` (0.9.159, two
// values), for the identical reason those two files' own headers already
// give: name the difference structurally, never fold it into a vaguer,
// larger status.
//
// A PLACEMENT FAILURE IS NEVER REPORTED AS REGISTERED. When the
// `resolveSnapshotWorldPlacement()` result handed to
// `registerMaterializedSnapshotWorldSource()` did not itself reach
// `SnapshotWorldPlacementOutcome.PLACED` — `UNPLACED`, or any
// materialization-failure outcome passed through from further upstream —
// that SAME outcome is passed through unchanged, and nothing is registered
// with the World runtime. This file adds exactly one new value, reachable
// only once a Snapshot has already been independently placed.
export const SnapshotWorldRegistrationOutcome = Object.freeze({
    // The materialized, placed Snapshot's Publication and position were
    // handed to this replica's own, pre-existing `WorldDiscoverySourceRegistry`
    // (application/WorldDiscoverySourceRegistry.js, 0.9.9, UNCHANGED) under
    // a dedicated origin — no new runtime authority, no new World-state
    // store, and no rendering performed. Reported identically whether this
    // is the FIRST registration for this contentHash or a later one
    // replacing it — the registry's own "replacement, not accumulation"
    // rule (0.9.9) already makes repeated registration idempotent; this
    // file adds no "already registered" distinction of its own.
    REGISTERED: 'registered'
});
