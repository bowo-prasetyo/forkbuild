import { ContentBindingSetRelationship } from './ContentBindingSetRelationship.js';

// 0.8.13 — Multi-Evidence Comparison & Conflict UX.
//
// application/PublicationEvidenceConvergence.js (0.8.6) already derives
// everything this codebase is willing to say, structurally, about a set
// of anchors known for one publication: how many, of how many types,
// grouped by which `contentHash` they claim, and whether those groups
// conflict. What it does not do — deliberately, per its own header — is
// shape that result for a screen. This file is the identical idea
// application/PublicationEvidenceView.js (0.8.3) already applied to a
// SINGLE anchor's verification result, applied here to the CONVERGENCE
// result across every known anchor at once:
//
//   derivePublicationEvidenceConvergence()   (0.8.6, UNCHANGED)
//                        │
//                        ▼
//        publicationEvidenceConvergenceView()   (THIS FILE)
//                        │
//                        ▼
//         { anchorCount, contentGroups, hasConflict,
//           relationship, conflictDescription }
//
// Pure and read-only, exactly like application/PublicationEvidenceView.js
// itself: no catalog, no verifier, no network, and no import of
// application/PublicationEvidenceConvergence.js's own derivation
// function — this file only ever reshapes a result a caller already
// computed elsewhere (ordinarily ui/views/DecentralizedPublicationsView.js,
// once per entry, right after it calls derivePublicationEvidenceConvergence()
// itself). Calling this twice with the identical input always returns a
// byte-identical result.
//
// THE CENTRAL RULE THIS FILE EXISTS TO ENFORCE, one layer up from
// application/PublicationEvidenceConvergence.js's own: a content-hash
// group with more anchors is never presented as more likely correct,
// larger, "winning," or anything else that reads as a verdict. Two
// groups — `{ contentHash: 'hash-a', anchorCount: 2 }` and
// `{ contentHash: 'hash-b', anchorCount: 1 }` — are returned in the same
// `contentGroups` array, sorted the same deterministic way application/
// PublicationEvidenceConvergence.js's own `contentHashGroups` already
// is (by `contentHash`, never by size), with no field anywhere ranking
// one above the other. `conflictDescription`, the one piece of prose
// this file generates, says only that the claims disagree and how many
// distinct values are claimed — never which one a reader should believe.
// See docs/Principles.md, "Evidence Comparison Is Not Adjudication
// (0.8.13)."
export function publicationEvidenceConvergenceView(convergence) {
    if (!convergence || typeof convergence !== 'object' || !Array.isArray(convergence.contentHashGroups)) {
        throw new Error('publicationEvidenceConvergenceView: a derivePublicationEvidenceConvergence() result is required');
    }

    const contentGroups = convergence.contentHashGroups.map((group) => ({
        contentHash: group.contentHash,
        anchorIds: group.anchorIds,
        anchorCount: group.anchorIds.length
    }));

    const hasConflict = Boolean(convergence.contentBindingConflict);
    const relationship = hasConflict ? ContentBindingSetRelationship.CONFLICT : ContentBindingSetRelationship.AGREEMENT;

    return {
        anchorCount: convergence.anchorCount,
        contentGroups,
        relationship,
        hasConflict,
        conflictDescription: describeContentBindingSetRelationship(hasConflict, contentGroups.length)
    };
}

// The one sentence this milestone adds to the screen, and the only
// place its wording lives. Says exactly two things — that the known
// evidence disagrees, and how many distinct content hashes are
// claimed — and nothing about which claim is more likely true. `null`
// whenever there is no conflict to describe, so a caller can use its
// presence directly as "show the warning" without re-checking
// `hasConflict` itself.
export function describeContentBindingSetRelationship(hasConflict, groupCount) {
    if (!hasConflict) return null;
    return `Evidence claims disagree about the content hash — ${groupCount} different content hashes are each claimed by at least one anchor.`;
}

// A plain, non-judgmental summary of how many DISTINCT content hashes
// are claimed — never how many anchors agree with "the" one. Mirrors
// application/PublicationEvidenceView.js#describeKnownEvidenceCount()'s
// own restraint: a caller that wants to say more counts `view.
// contentGroups` itself rather than this file deciding which group is
// worth highlighting.
export function describeContentGroupCount(view) {
    const count = view ? view.contentGroups.length : 0;
    if (!count) return 'No content binding known';
    return `${count} distinct content hash${count === 1 ? '' : 'es'} claimed`;
}
