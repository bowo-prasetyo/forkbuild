import { SnapshotPlacementRelationship } from './SnapshotPlacementRelationship.js';

// 0.8.23 — Multi-Placement Convergence & Relationship UX.
//
// application/PublicationSnapshotPlacementConvergence.js (this milestone)
// already derives everything this codebase is willing to say,
// structurally, about a set of placements known for one publication: how
// many, across how many storage backends and locators, grouped by which
// contentHash they claim, and whether those groups conflict. What it
// does not do — deliberately, per its own header — is shape that result
// for a screen. This file is the identical idea application/
// PublicationEvidenceConvergenceView.js (0.8.13) already applied to
// anchors, applied here to placements:
//
//   derivePublicationSnapshotPlacementConvergence()   (THIS MILESTONE, UNCHANGED)
//                        │
//                        ▼
//        publicationSnapshotPlacementConvergenceView()   (THIS FILE)
//                        │
//                        ▼
//         { placementCount, storageTypeCount, locatorCount,
//           contentGroups, relationship, conflictDescription }
//
// Pure and read-only, exactly like application/
// PublicationEvidenceConvergenceView.js itself: no catalog, no resolver,
// no network, and no import of application/
// PublicationSnapshotPlacementConvergence.js's own derivation function —
// this file only ever reshapes a result a caller already computed
// elsewhere. Calling this twice with the identical input always returns
// a byte-identical result.
//
// THE CENTRAL RULE THIS FILE EXISTS TO ENFORCE, one layer up from
// application/PublicationSnapshotPlacementConvergence.js's own: a
// content-hash group with more placements, more storage-backend
// diversity, or (see this file's own header on why it is not even
// possible here — no resolution observation ever reaches this function)
// more RESOLVED placements is never presented as more likely correct,
// larger, "winning," or anything else that reads as a verdict. See
// docs/Principles.md, "Evidence Comparison Is Not Adjudication (0.8.13),"
// extended here across locators instead of evidence.
export function publicationSnapshotPlacementConvergenceView(convergence) {
    if (!convergence || typeof convergence !== 'object' || !Array.isArray(convergence.contentHashGroups)) {
        throw new Error('publicationSnapshotPlacementConvergenceView: a derivePublicationSnapshotPlacementConvergence() result is required');
    }

    const contentGroups = convergence.contentHashGroups.map((group) => ({
        contentHash: group.contentHash,
        placementIds: group.placementIds,
        placementCount: group.placementIds.length
    }));

    const hasConflict = Boolean(convergence.contentBindingConflict);
    const relationship = hasConflict ? SnapshotPlacementRelationship.CONFLICT : SnapshotPlacementRelationship.AGREEMENT;

    const storageTypes = Array.isArray(convergence.storageTypes) ? convergence.storageTypes : [];
    const locatorCount = typeof convergence.locatorCount === 'number'
        ? convergence.locatorCount
        : (Array.isArray(convergence.locators) ? convergence.locators.length : 0);

    return {
        placementCount: convergence.placementCount,
        storageTypes,
        storageTypeCount: storageTypes.length,
        locatorCount,
        contentGroups,
        relationship,
        hasConflict,
        conflictDescription: describeSnapshotPlacementRelationship(hasConflict, contentGroups.length)
    };
}

// The one sentence this milestone adds to the screen, and the only place
// its wording lives. Says exactly two things — that the known placements
// disagree, and how many distinct content hashes are claimed — and
// nothing about which storage backend, locator, or claim is more likely
// true. `null` whenever there is no conflict to describe, so a caller
// can use its presence directly as "show the warning" without
// re-checking `hasConflict` itself. Mirrors application/
// PublicationEvidenceConvergenceView.js#describeContentBindingSetRelationship()
// exactly, one domain over.
export function describeSnapshotPlacementRelationship(hasConflict, groupCount) {
    if (!hasConflict) return null;
    return `Placement claims disagree about the content hash — ${groupCount} different content hashes are each claimed by at least one placement. No claim is ranked or selected.`;
}

// A plain, non-judgmental summary of how many DISTINCT content hashes
// are claimed — never how many placements agree with "the" one. Mirrors
// application/PublicationEvidenceConvergenceView.js#describeContentGroupCount()'s
// own restraint.
export function describeSnapshotPlacementContentGroupCount(view) {
    const count = view ? view.contentGroups.length : 0;
    if (!count) return 'No content binding known';
    return `${count} distinct content hash${count === 1 ? '' : 'es'} claimed`;
}
