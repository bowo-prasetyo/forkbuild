import { describePublicationDecentralization, describeDecentralizationRelationshipContrast } from './PublicationDecentralizationView.js';

// 0.8.28 — Offline Publication Reconstruction & Replica Knowledge.
//
// 0.8.0-0.8.17 built the anchor subsystem, 0.8.18-0.8.26 built its
// placement sibling, and 0.8.27 finally placed the two side by side
// under one `publicationId` — but never asked the question those two
// subsystems exist to answer:
//
//   What can a replica know about a publication when the original
//   publisher and every external system are unavailable?
//
// This file is the smallest possible answer. It is application/
// PublicationDecentralizationView.js's own result, PLUS exactly one new
// fact that file's own signature has never carried: whether THIS
// replica has ever cataloged the publication envelope itself (application/
// LocalPublicationCatalog.js#has(), 0.7.2) that `publicationId` names.
//
//   describePublicationDecentralization()        (0.8.27, UNCHANGED)
//              │
//              ▼
//   describePublicationReplicaKnowledge()         (THIS FILE)
//              │
//              ▼
//     { publicationId, hasPublication,
//       evidence: {...}, placements: {...} }
//
// `hasPublication` is a plain boolean the CALLER already knows —
// ordinarily `publicationCatalog.has(publicationId)` — never something
// this file goes and looks up itself. This file imports no catalog, no
// store, no coordinator, and no network, exactly like application/
// PublicationDecentralizationView.js it wraps; the only difference in
// its OWN signature over that file's is one more scalar fact sitting
// beside the two convergence views, never a live lookup replacing them.
// The whole point of accepting a plain boolean rather than a publication
// record, an id, or a catalog reference is that this view stays blind to
// what "having the publication" even MEANS at the storage layer — a
// caller backed by application/LocalPublicationCatalog.js's own 0.7.2
// `DecentralizedPublication` envelopes reports it one way; a caller with
// a different notion of "known locally" (a Structure sitting in this
// replica's own library, say) could report it another way, with zero
// change to this file. See docs/Principles.md, "Replica Knowledge
// Describes What This Replica Possesses, Not What The World Has Proven
// (0.8.28)."
//
// THE ONE THING THIS MILESTONE DELIBERATELY DOES NOT DO: reconstruct
// anything. `hasPublication: true` alongside a known IPFS placement
// claim means exactly "this replica has seen a signed envelope claiming
// this publication, and a signed envelope claiming this snapshot sits at
// this locator" — it does NOT mean the snapshot's bytes were retrieved,
// and it does NOT mean any anchor's proof was checked against the
// external system it names. Retrieval is application/
// SnapshotPlacementResolver.js's job; proof verification is application/
// ExternalAnchorVerifier.js's job. Both stay separate, explicit
// operations a caller runs afterward, exactly as before this file
// existed — see this milestone's own docs/Principles.md entry, "Known
// Is Not Available (0.8.28)," for why KNOWN + UNAVAILABLE is a
// completely ordinary, non-contradictory pair of facts about the
// identical claim, never a sign the claim disappeared.
//
// Lifecycle and provenance are excluded from this function's signature
// for the exact reason application/PublicationDecentralizationView.js's
// own header already gives, restated here because it would be the
// easiest possible regression for this milestone to introduce: a
// verification/resolution lifecycle is a LOCAL OBSERVATION about ONE
// claim, and an acquisition record is a LOCAL FACT about how ONE claim
// was learned — neither is a property of the shared claim set this view
// describes, and neither is a property of whether this replica knows the
// publication at all. A caller still shows a lifecycle note or a
// provenance line exactly where 0.8.12/0.8.17/0.8.24/0.8.26 already put
// them, underneath the individual anchor/placement card, never inside
// the object this function returns.
//
// Pure and stateless, exactly like the view it wraps: no constructor, no
// injected dependency, no caching. Calling this twice with identical
// arguments returns a byte-identical result.
export function describePublicationReplicaKnowledge({
    publicationId,
    hasPublication = false,
    evidenceConvergenceView = null,
    placementConvergenceView = null
} = {}) {
    const decentralization = describePublicationDecentralization({
        publicationId,
        evidenceConvergenceView,
        placementConvergenceView
    });
    return {
        publicationId: decentralization.publicationId,
        hasPublication: Boolean(hasPublication),
        evidence: decentralization.evidence,
        placements: decentralization.placements
    };
}

// Re-exported unchanged: `describePublicationReplicaKnowledge()`'s result
// carries the identical `evidence`/`placements` shape application/
// PublicationDecentralizationView.js#describeDecentralizationRelationship
// Contrast() already reads, so the contrast sentence works, unmodified,
// over a replica knowledge view exactly as it does over a decentraliza-
// tion view. Re-exported here purely so a caller that only ever imports
// THIS file (never PublicationDecentralizationView.js directly) still has
// a path to it.
export { describeDecentralizationRelationshipContrast };
