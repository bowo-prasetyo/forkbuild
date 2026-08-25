// 0.8.18 — Decentralized Snapshot Placement Foundation.
//
// Names every way application/SnapshotPlacementResolver.js#resolve() can
// end, in the same order its own pipeline checks them — the identical
// "name the difference structurally, never by convention" discipline
// application/PublicationResolutionOutcome.js (0.7.1) and application/
// AnchorVerificationOutcome.js (0.8.1) already established, applied here
// to retrieving bytes a placement claims are available.
export const SnapshotPlacementResolutionOutcome = Object.freeze({
    // The envelope validated, its signature checked out, a content
    // store was available for its `storage`, the store actually
    // returned bytes, and those bytes hash to the placement's own
    // `contentHash`. `bytes` is set on this outcome only.
    RESOLVED: 'resolved',
    // The record is not even a well-formed PublicationSnapshotPlacement.
    INVALID_ENVELOPE: 'invalid-envelope',
    // The envelope is well-formed but its signature does not check out
    // against its own claimed `placerIdentity`.
    INVALID_SIGNATURE: 'invalid-signature',
    // No content store is available for this placement's `storage` —
    // neither an explicit one nor a registered one. Never a verdict
    // about the placement itself; a caller with the right store
    // available can resolve the identical placement successfully.
    STORE_UNAVAILABLE: 'store-unavailable',
    // The resolved store was consulted but could not presently retrieve
    // the bytes — unreachable, timed out, not found (which may simply
    // mean "not yet propagated"). NEVER treated as proof the content
    // does not exist; retrying later may succeed.
    CONTENT_UNAVAILABLE: 'content-unavailable',
    // The store returned bytes, but they do not hash to the placement's
    // own `contentHash` — the store is serving something else at this
    // locator, whether by error, corruption, or by the locator having
    // been reused for different content since. A DEFINITE mismatch,
    // never conflated with CONTENT_UNAVAILABLE.
    CONTENT_HASH_MISMATCH: 'content-hash-mismatch'
});
