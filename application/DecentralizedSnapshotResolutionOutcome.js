// 0.9.134 — Snapshot Retrieval from Decentralized Discovery.
//
// Names every way application/DecentralizedSnapshotResolver.js#resolve()
// can end, in the same order its own pipeline checks them — the identical
// "name the difference structurally, never by convention" discipline
// application/SnapshotPlacementResolutionOutcome.js (0.8.18) and
// application/PublicationResolutionOutcome.js (0.7.1) already established,
// applied here to the DISCOVERY -> LOCATION -> RETRIEVAL -> VERIFICATION
// pipeline docs/Roadmap.md's own 0.9.134 section names as this milestone's
// centerpiece.
//
// Deliberately NOT a reuse of SnapshotPlacementResolutionOutcome — that
// enum's own INVALID_ENVELOPE/INVALID_SIGNATURE members describe a SIGNED
// PublicationSnapshotPlacement's own envelope/signature checks, which this
// pipeline never performs (a Nostr-discovered candidate carries no
// signature at all — see core/SnapshotDiscoveryEnvelope.js's own header,
// "a self-declared claim, never evidence"). Reusing that enum here would
// either leave two members permanently unreachable or blur two genuinely
// different failure vocabularies into one.
export const DecentralizedSnapshotResolutionOutcome = Object.freeze({
    // Discovery produced at least one candidate for the requested
    // contentHash, a content store was available for the selected
    // candidate's own storage, the store actually returned bytes, and
    // those bytes hash to the requested contentHash. `bytes` is set on
    // this outcome only.
    RESOLVED: 'resolved',
    // DISCOVERY. Nostr search() produced no candidate — of whatever it did
    // report — whose own contentHash matches the one requested. Never a
    // verdict that the content doesn't exist; only that nothing under
    // this discoveryTag currently claims to know where it is.
    NOT_DISCOVERED: 'not-discovered',
    // LOCATION. A candidate was discovered, but no content store is
    // available for its own `storage` — neither an explicit one nor a
    // registered one. Never a verdict about the candidate itself; a
    // caller with the right store available can resolve the identical
    // candidate successfully.
    STORE_UNAVAILABLE: 'store-unavailable',
    // RETRIEVAL. A store was resolved and consulted but could not
    // presently retrieve the bytes — unreachable, timed out, not found
    // (which may simply mean "not yet propagated," or "the discovery
    // record is stale"). NEVER treated as proof the content does not
    // exist; retrying later, or against a different discovered candidate,
    // may succeed.
    CONTENT_UNAVAILABLE: 'content-unavailable',
    // VERIFICATION. The store returned bytes, but they do not hash to the
    // requested contentHash — discovery led somewhere, but not to the
    // expected Snapshot. See docs/Roadmap.md's own 0.9.134 section,
    // "discovery is not verification." A DEFINITE mismatch, never
    // conflated with CONTENT_UNAVAILABLE.
    CONTENT_HASH_MISMATCH: 'content-hash-mismatch'
});
