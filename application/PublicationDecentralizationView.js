// 0.8.27 — Unified Publication Decentralization View.
//
// Anchors (0.8.0-0.8.17) and placements (0.8.18-0.8.26) have grown into
// two independently complete, structurally symmetrical subsystems:
//
//   Anchors:    claim -> inspect -> verify  -> verification lifecycle
//   Placements: claim -> inspect -> resolve -> availability  lifecycle
//
// Nothing in either subsystem has ever combined them. This file is the
// first thing that does — and it does the SMALLEST possible thing that
// could be called "combining": it takes the two convergence VIEWS a
// caller already computed, separately, from application/
// PublicationEvidenceConvergenceView.js (0.8.13) and application/
// PublicationSnapshotPlacementConvergenceView.js (0.8.23), and places
// them side by side under one publicationId so a screen can show them as
// PARALLEL SIBLINGS rather than as two unrelated sections a person has
// to remember to compare by eye.
//
//   publicationEvidenceConvergenceView()              (0.8.13, UNCHANGED)
//   publicationSnapshotPlacementConvergenceView()      (0.8.23, UNCHANGED)
//                        │                    │
//                        ▼                    ▼
//              describePublicationDecentralization()   (THIS FILE)
//                        │
//                        ▼
//        { publicationId, evidence: {...}, placements: {...} }
//
// THE ONE RULE THIS FILE EXISTS TO ENFORCE, ABOVE EVERYTHING ELSE ANY
// FUTURE MILESTONE MIGHT WANT TO ADD HERE: this is a SYNTHESIS, never an
// ADJUDICATION, and never a new AGGREGATE. It never imports a catalog, a
// verifier, a resolver, a knowledge store, or the network. It never
// computes anything application/PublicationEvidenceConvergence.js (0.8.6)
// and application/PublicationSnapshotPlacementConvergence.js (0.8.23)
// have not already computed. And it NEVER emits a field that reads as a
// verdict spanning the two dimensions — no `decentralizationScore`, no
// `confidence`, no `trustLevel`, no `preferredSource`, no `bestEvidence`,
// no `bestPlacement`. "Evidence conflict does not imply placement
// conflict" and "multiple placements do not establish that any evidence
// claim is true" are exactly as true after this file runs as before it —
// see docs/Principles.md, "Publication Decentralization Is Two Separate
// Dimensions, Never One Combined Verdict (0.8.27)."
//
// LIFECYCLE AND PROVENANCE ARE DELIBERATELY EXCLUDED FROM THIS FUNCTION'S
// SIGNATURE, NOT JUST FROM ITS OUTPUT. A verification/resolution
// lifecycle (application/PublicationAnchorVerificationLifecycleView.js,
// 0.8.12; application/SnapshotPlacementLifecycleView.js, 0.8.26) is a
// LOCAL OBSERVATION about ONE claim this replica happened to check, and
// an acquisition record (application/PublicationAnchorKnowledgeView.js,
// 0.8.17; application/PublicationSnapshotPlacementKnowledgeView.js,
// 0.8.24) is a LOCAL FACT about how THIS replica happened to learn ONE
// claim. Neither one is a property of the SHARED claim set, and neither
// is a property of how the evidence dimension relates to the placement
// dimension. Rather than accept them as optional parameters that sit
// inert (the one design this file's own review explicitly ruled out),
// this function has NO parameter capable of receiving them at all —
// a caller displays a lifecycle note or a provenance line underneath the
// individual anchor/placement card it belongs to, exactly as
// ui/views/DecentralizedPublicationsView.js already does, never inside
// the object this function returns. See tests/
// PublicationDecentralizationView.test.js's own flagship section for the
// direct proof: Dave's own verification/resolution history changes
// nothing about his derived decentralization view.
//
// Pure and stateless, exactly like the two convergence views it combines:
// no constructor, no injected dependency, no caching. Calling this twice
// with the identical two views returns a byte-identical result.
export function describePublicationDecentralization({
    publicationId,
    evidenceConvergenceView = null,
    placementConvergenceView = null
} = {}) {
    if (!publicationId || typeof publicationId !== 'string' || !publicationId.trim()) {
        throw new Error('describePublicationDecentralization: a publicationId is required');
    }
    return {
        publicationId,
        evidence: describeEvidenceDimension(evidenceConvergenceView),
        placements: describePlacementDimension(placementConvergenceView)
    };
}

// `known: false` — never an error, never a zero-filled stand-in for
// "conflict" or "agreement" — is what a caller sees when it has not yet
// computed an evidence convergence view for this publication at all
// (e.g. no `publicationEvidenceCoordinator` was ever injected). `null`
// relationship reads as "nothing known," never as "agreement."
function describeEvidenceDimension(view) {
    if (!view) {
        return {
            known: false,
            anchorCount: 0,
            relationship: null,
            hasConflict: false,
            contentGroups: []
        };
    }
    return {
        known: true,
        anchorCount: view.anchorCount,
        relationship: view.relationship,
        hasConflict: view.hasConflict,
        contentGroups: view.contentGroups
    };
}

// The placement-side sibling immediately above, one axis over — carries
// `storageTypes`/`storageTypeCount`/`locatorCount` because those are
// meaningful specifically for placements, exactly as application/
// PublicationSnapshotPlacementConvergenceView.js's own header already
// explains has no natural equivalent on the evidence side.
function describePlacementDimension(view) {
    if (!view) {
        return {
            known: false,
            placementCount: 0,
            relationship: null,
            hasConflict: false,
            storageTypes: [],
            storageTypeCount: 0,
            locatorCount: 0,
            contentGroups: []
        };
    }
    return {
        known: true,
        placementCount: view.placementCount,
        relationship: view.relationship,
        hasConflict: view.hasConflict,
        storageTypes: view.storageTypes,
        storageTypeCount: view.storageTypeCount,
        locatorCount: view.locatorCount,
        contentGroups: view.contentGroups
    };
}

// The one sentence this milestone adds, and the only place its wording
// lives — a plain statement of fact when the two dimensions' conflict
// states DIVERGE, naming neither dimension more trustworthy than the
// other. `null` whenever both dimensions agree with themselves, both
// dimensions conflict with themselves, or either dimension is unknown —
// there is nothing to contrast in any of those cases. This is the one
// piece of prose that makes docs/Roadmap.md's own two design-conversation
// lines ("evidence conflict does not imply placement conflict," and its
// converse) visible on screen, without ever implying the AGREEING
// dimension is the "correct" one.
export function describeDecentralizationRelationshipContrast(view) {
    if (!view || !view.evidence.known || !view.placements.known) return null;
    if (view.evidence.hasConflict === view.placements.hasConflict) return null;
    return view.evidence.hasConflict
        ? 'External evidence claims conflict, while known snapshot placements agree with each other. A conflict in one dimension does not imply a conflict in the other.'
        : 'Known snapshot placements conflict, while external evidence claims agree with each other. Multiple agreeing placements do not establish that any external evidence claim is true.';
}
