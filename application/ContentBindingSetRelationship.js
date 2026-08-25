// 0.8.13 — Multi-Evidence Comparison & Conflict UX.
//
// application/ContentBindingRelationship.js (0.8.6) names how ONE
// anchor's own `contentHash` relates to an `expectedContentHash` a
// caller already knows. This file names the companion relationship one
// level up: how the WHOLE set of anchors known for a publication relate
// to EACH OTHER — exactly what application/
// PublicationEvidenceConvergence.js's own `contentHashGroups.length`
// already tells structurally (see that file's own header), given a
// name a presentation layer can switch on without re-deriving the
// count itself.
//
//   AGREEMENT   — every cataloged anchor for this publication carries
//                 the SAME contentHash. Exactly one group in
//                 `contentHashGroups`.
//   CONFLICT    — more than one distinct contentHash is claimed. NEVER
//                 read as "most of the anchors are right and the rest
//                 are wrong" — see application/
//                 PublicationEvidenceConvergence.js's own header on why
//                 group size is reported honestly and never treated as
//                 a tiebreaker.
//
// Deliberately NOT `TRUSTED`/`UNTRUSTED`, `BEST`/`PREFERRED`, or
// `CONFIDENT`/`LIKELY` — this names a structural fact about the evidence
// SET, never a verdict about which claim within it to believe. See
// docs/Principles.md, "Evidence Relationships Are Derived, Never
// Adjudicated (0.8.6)," which this vocabulary extends one presentation
// layer up, never past.
export const ContentBindingSetRelationship = Object.freeze({
    AGREEMENT: 'agreement',
    CONFLICT: 'conflict'
});
