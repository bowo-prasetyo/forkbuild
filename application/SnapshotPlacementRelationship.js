// 0.8.23 — Multi-Placement Convergence & Relationship UX.
//
// application/ContentBindingSetRelationship.js (0.8.13) names how the
// WHOLE set of anchors known for a publication relate to EACH OTHER —
// exactly what application/PublicationEvidenceConvergence.js's own
// `contentHashGroups.length` already tells structurally, given a name a
// presentation layer can switch on without re-deriving the count itself.
// This file is the identical vocabulary, one domain over: how the WHOLE
// set of PLACEMENTS known for a publication relate to each other, per
// application/PublicationSnapshotPlacementConvergence.js's own
// `contentHashGroups.length`.
//
//   AGREEMENT   — every cataloged placement for this publication binds
//                 the SAME contentHash. Exactly one group in
//                 `contentHashGroups`.
//   CONFLICT    — more than one distinct contentHash is claimed. NEVER
//                 read as "most of the placements are right and the rest
//                 are wrong," and NEVER read as "the storage backend with
//                 more placements is more likely to still be serving the
//                 real content" — see application/
//                 PublicationSnapshotPlacementConvergence.js's own header
//                 on why group size is reported honestly and never
//                 treated as a tiebreaker.
//
// A SEPARATE FILE FROM application/ContentBindingSetRelationship.js,
// deliberately, even though the two vocabularies are structurally
// identical — the same restraint core/PublicationSnapshotPlacement.js's
// own header already draws between a placement and an anchor as domain
// concepts ("PLACEMENT IS NOT ANCHORING"). An anchor asks "what external
// evidence claims do I know?"; a placement asks "what locations do I
// know that claim this snapshot is retrievable?" Two different questions
// deserve two independently named answers, even where — as here — the
// SHAPE of the answer happens to coincide.
//
// Deliberately NOT `TRUSTED`/`UNTRUSTED`, `BEST`/`PREFERRED`, `MOST
// RELIABLE`/`LEAST RELIABLE`, or `CONFIDENT`/`LIKELY` — this names a
// structural fact about the placement SET, never a verdict about which
// storage backend to trust, prefer, or believe is more likely to still
// be serving bytes. See docs/Principles.md, "Evidence Relationships Are
// Derived, Never Adjudicated (0.8.6)," which this vocabulary extends
// across to placements, never past.
export const SnapshotPlacementRelationship = Object.freeze({
    AGREEMENT: 'agreement',
    CONFLICT: 'conflict'
});
