import { SnapshotPlacementResolutionOutcome } from './SnapshotPlacementResolutionOutcome.js';

// 0.8.20 — Snapshot Placement Inspection & Explicit Resolution UX.
//
// application/PublicationEvidenceView.js (0.8.3) turns a list of
// already-discovered PublicationAnchor instances plus an optional
// per-anchor verification-result map into one flat, UI-ready shape. This
// file is the identical idea applied to placements: it turns a list of
// already-discovered core/PublicationSnapshotPlacement.js instances
// (application/SnapshotPlacementResolutionCoordinator.js#discover(), a
// synchronous local catalog read) plus an OPTIONAL, caller-supplied map
// of resolution results (application/
// SnapshotPlacementResolutionCoordinator.js#resolve(), called
// separately, per placement, only when a person asks) into one flat,
// UI-ready shape.
//
// This file is pure and read-only — synchronous, side-effect-free, and
// never imports application/LocalPublicationSnapshotPlacementCatalog.js,
// application/SnapshotPlacementResolver.js, or core/
// PublicationSnapshotPlacement.js's own mutating surface. It never
// modifies a placement, never writes to the catalog, and never resolves
// anything itself; it only ever reshapes values a caller already
// obtained. See docs/Principles.md, "Resolving A Placement Observes
// Present Availability; It Does Not Rewrite The Placement Claim
// (0.8.20)."
//
// The central discipline this file exists to enforce in the UI layer: a
// `describeSnapshotPlacement()` view never collapses the six
// application/SnapshotPlacementResolutionOutcome.js values into a single
// "available"/"unavailable" boolean, and never derives — from however
// many placements are known or resolved — any notion of which one is
// "best," "canonical," or "the real copy." `snapshotPlacementView()`
// returns every known placement, in the same order it was handed, with
// no ranking applied anywhere in this file.
export function snapshotPlacementView(placements, resolutions = {}) {
    if (!Array.isArray(placements)) {
        throw new Error('snapshotPlacementView: an array of PublicationSnapshotPlacement instances is required');
    }
    return {
        count: placements.length,
        placements: placements.map((placement) => describeSnapshotPlacement(placement, resolutions[placement.id]))
    };
}

// One placement's derived display shape:
//
//   { placementId, storage, locator, placedAt, placerIdentityId,
//     publicationId, contentHash,
//     checking, resolved, resolutionOutcome, resolutionLabel, resolutionReason }
//
// `resolution` is `undefined`/`null` for a placement this replica has
// cataloged but never asked application/
// SnapshotPlacementResolver.js about, `{ checking: true }` while a
// resolve() call is in flight, or `{ outcome, reason }` — the exact
// shape application/SnapshotPlacementResolutionCoordinator.js#resolve()
// resolves to — once one has completed. `resolved` is `true` only in
// that last case; a resolution currently in flight is reported as its
// own distinct state, never folded into either "resolved" or "not yet
// resolved."
export function describeSnapshotPlacement(placement, resolution = null) {
    if (!placement) {
        throw new Error('describeSnapshotPlacement: a PublicationSnapshotPlacement is required');
    }
    const checking = Boolean(resolution && resolution.checking);
    const resolved = Boolean(resolution && !resolution.checking && resolution.outcome);
    return {
        placementId: placement.id,
        storage: placement.storage,
        locator: placement.locator,
        placedAt: placement.placedAt instanceof Date ? placement.placedAt.toISOString() : placement.placedAt,
        placerIdentityId: placement.placerIdentity ? placement.placerIdentity.id : null,
        publicationId: placement.publicationId,
        contentHash: placement.contentHash,
        checking,
        resolved,
        resolutionOutcome: resolved ? resolution.outcome : null,
        resolutionLabel: checking ? 'Resolving…' : (resolved ? describeResolutionOutcome(resolution.outcome) : 'Not yet resolved'),
        resolutionReason: resolved ? resolution.reason : null
    };
}

// A short, precise, human-readable label for one application/
// SnapshotPlacementResolutionOutcome.js value — presentation only,
// mirroring application/PublicationEvidenceView.js#
// describeVerificationOutcome()'s own restraint. Deliberately NEVER
// collapses the distinct outcomes into a shared "unavailable" bucket:
// `STORE_UNAVAILABLE` ("this replica has no backend configured for this
// storage") and `CONTENT_UNAVAILABLE` ("a backend was consulted, and it
// could not presently produce the bytes") describe opposite kinds of
// gap, and `CONTENT_HASH_MISMATCH` ("a backend answered, with the wrong
// bytes") is a DEFINITE finding, never conflated with either. A person
// deciding whether to trust a placement needs to be able to tell all six
// apart.
export function describeResolutionOutcome(outcome) {
    switch (outcome) {
        case SnapshotPlacementResolutionOutcome.RESOLVED: return 'Content available';
        case SnapshotPlacementResolutionOutcome.INVALID_ENVELOPE: return 'Invalid placement';
        case SnapshotPlacementResolutionOutcome.INVALID_SIGNATURE: return 'Invalid signature';
        case SnapshotPlacementResolutionOutcome.STORE_UNAVAILABLE: return 'No storage backend configured';
        case SnapshotPlacementResolutionOutcome.CONTENT_UNAVAILABLE: return 'Content unavailable';
        case SnapshotPlacementResolutionOutcome.CONTENT_HASH_MISMATCH: return 'Retrieved content does not match this placement';
        default: return 'Not yet resolved';
    }
}

// A plain, non-judgmental summary of HOW MANY placements are known —
// never how many currently resolve. Deliberately never mentions
// resolution state at all: knowing about three placements and having
// resolved one of them are two separate facts, and this function only
// ever reports the first. A caller that wants to also say how many are
// currently RESOLVED counts `view.placements` itself, per outcome,
// rather than this file deciding which outcomes are worth highlighting.
export function describeKnownPlacementCount(view) {
    const count = view ? view.count : 0;
    if (!count) return 'No snapshot placements known';
    return `${count} placement${count === 1 ? '' : 's'} known`;
}
