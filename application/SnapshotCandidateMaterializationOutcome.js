// 0.9.158 — Selected Snapshot Materialization.
//
// Names every way application/MaterializeSnapshotFromSelectedCandidateUseCase.js
// #execute() can end for an ALREADY-RESOLVED candidate — the same "one
// enum, one file" shape application/SnapshotPlacementMaterializationOutcome.js
// (0.8.35) and application/PeerSnapshotMaterializationOutcome.js (0.8.37)
// already established, applied here to the CANDIDATE-backed path.
//
// DELIBERATELY ONLY THREE VALUES — narrower than its two siblings. Both
// SnapshotPlacementMaterializationOutcome and PeerSnapshotMaterializationOutcome
// carry their own "the input itself was no good" value (INVALID_PLACEMENT,
// UNAVAILABLE) because THEY are each handed something not yet proven — a
// placement whose signature hasn't been checked yet, a peer that hasn't
// answered yet. application/MaterializeSnapshotFromSelectedCandidateUseCase.js
// is handed something categorically different: an ALREADY-COMPLETED
// application/DecentralizedSnapshotResolver.js#resolveCandidate() result
// (0.9.152) — DISCOVERY, LOCATION, RETRIEVAL, and VERIFICATION already
// ran. When that resolution did not reach RESOLVED, this use case reports
// the RESOLVER'S OWN failure outcome (application/
// DecentralizedSnapshotResolutionOutcome.js's own NOT_DISCOVERED/
// STORE_UNAVAILABLE/CONTENT_UNAVAILABLE/CONTENT_HASH_MISMATCH) VERBATIM,
// never remapped onto a value of this file's own — the identical restraint
// application/SnapshotPublicationAttribution.js's own
// resolveSnapshotPublicationAttribution() already holds one seam over
// ("this function NEVER reports NO_MATCH [for a non-RESOLVED outcome] — it
// passes that same resolution-failure outcome... through unchanged"). This
// file's own three values therefore describe only what happens ONCE
// resolution has already succeeded — see docs/Principles.md, "Selection Is
// Not Verification; Materialization Requires An Already-Verified Snapshot
// (0.9.158)."
export const SnapshotCandidateMaterializationOutcome = Object.freeze({
    // The selected candidate resolved (DecentralizedSnapshotResolutionOutcome
    // .RESOLVED — retrieved and hash-verified against its own declared
    // contentHash), and those bytes were newly written to this replica's
    // own local content/ContentStore.js.
    STORED: 'stored',
    // The selected candidate resolved, but this replica already held bytes
    // for that same content hash. Never an error — the identical
    // "duplicate is not a failure" posture application/
    // SnapshotPlacementMaterializationOutcome.js's own ALREADY_AVAILABLE
    // already holds one layer under.
    ALREADY_AVAILABLE: 'already-available',
    // The selected candidate resolved (its RETRIEVED bytes already hashed
    // to its own DECLARED contentHash, inside resolveCandidate() itself),
    // yet application/StoreSnapshotContentUseCase.js's own independent
    // re-verification of the SAME bytes against the SAME hash somehow
    // failed. Structurally reachable only if the two verification call
    // sites were ever given different inputs — this file never lets that
    // happen (see application/MaterializeSnapshotFromSelectedCandidateUseCase.js's
    // own header) — kept as a real, named outcome rather than an
    // assumption, exactly the defense-in-depth discipline application/
    // StoreSnapshotContentUseCase.js's own header describes as "the actual
    // content trust boundary... exactly once, no matter which explicit
    // action supplied the bytes."
    HASH_MISMATCH: 'hash-mismatch'
});
