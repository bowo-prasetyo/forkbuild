// 0.9.143 — Snapshot–Publication Attribution.
//
// Names the ONLY two outcomes `application/SnapshotPublicationAttribution.js#resolveSnapshotPublicationAttribution()`
// invents on its own — deliberately as small as `application/
// DecentralizedSnapshotResolutionOutcome.js` (0.9.134) already is, and for
// the identical reason (see that file's own header): name the difference
// structurally, never fold it into a vaguer, larger status.
//
// A RESOLUTION FAILURE IS NEVER REPORTED AS NO_MATCH. When the
// `resolvedSnapshot` handed to `resolveSnapshotPublicationAttribution()`
// did not itself reach `DecentralizedSnapshotResolutionOutcome.RESOLVED` —
// NOT_DISCOVERED, STORE_UNAVAILABLE, CONTENT_UNAVAILABLE, or
// CONTENT_HASH_MISMATCH — that outcome is passed through unchanged. Those
// four values remain application/DecentralizedSnapshotResolutionOutcome.js's
// own; this file adds exactly two new ones, reachable only once a Snapshot
// has already been independently verified.
export const SnapshotPublicationAttributionOutcome = Object.freeze({
    // The verified Snapshot's own content hash equals the Publication's
    // own contentReference.hash — the two independently-established facts
    // this milestone exists to compare.
    MATCH: 'match',
    // A Snapshot was independently verified, but its own content hash
    // differs from the Publication's own contentReference.hash. A
    // DEFINITE mismatch between two already-verified facts — never
    // conflated with a resolution failure (see this file's own header).
    NO_MATCH: 'no-match'
});
