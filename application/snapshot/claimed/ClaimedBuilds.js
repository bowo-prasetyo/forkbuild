import { snapshotCellTag, snapshotCellTagsAround } from '../../../core/NarrowDiscoveryTags.js';
import { detectSpatialOverlap } from '../../../core/SpatialOverlap.js';

// Claimed builds: a downloaded, content-verified Snapshot whose publisher
// announced a `claimedPosition`, for a Publication this device holds no
// Placement for. The automatic cascade stops such a Snapshot at UNPLACED and
// never promotes the claim (AutomaticSnapshotEncounterCascade.js, "claimedPosition
// is never promoted"). This module keeps that boundary: a claim is only ever
// SHOWN, as a translucent ghost (renderer/ClaimedBuildGhostRenderer.js), until
// the Wanderer explicitly accepts it, which creates their own signed Placement
// through the ordinary placePublication() path. Nothing here writes a
// PlacementRecord.

function isFinitePosition(position) {
    return !!position && Number.isFinite(position.x) && Number.isFinite(position.y) && Number.isFinite(position.z);
}

export function claimedBuildKey(publicationId, contentHash) {
    return `${publicationId}:${contentHash}`;
}

// Session-scoped record of the claims this Wanderer has encountered, keyed by
// publicationId + contentHash. Holds only what the announcement said; the
// build's own title/author are read from its content when it is drawn.
export class ClaimedBuildStore {
    constructor() {
        this._claims = new Map();
        this._dismissed = new Set();
        this._listeners = new Set();
    }

    // Ignores anything that is not a usable claim. A later claim for the same
    // key replaces the earlier one (the publisher re-announced elsewhere).
    record({ publicationId, contentHash, claimedPosition } = {}) {
        if (typeof publicationId !== 'string' || publicationId.length === 0
            || typeof contentHash !== 'string' || contentHash.length === 0
            || !isFinitePosition(claimedPosition)) {
            return false;
        }
        const key = claimedBuildKey(publicationId, contentHash);
        const position = Object.freeze({ x: claimedPosition.x, y: claimedPosition.y, z: claimedPosition.z });
        const existing = this._claims.get(key);
        if (existing && existing.position.x === position.x && existing.position.y === position.y && existing.position.z === position.z) {
            return false;
        }
        this._claims.set(key, Object.freeze({ key, publicationId, contentHash, position }));
        this._notify();
        return true;
    }

    // Hides one claim for the rest of this session. Nothing is deleted or
    // reported anywhere.
    dismiss(key) {
        if (!this._claims.has(key) || this._dismissed.has(key)) {
            return;
        }
        this._dismissed.add(key);
        this._notify();
    }

    isDismissed(key) {
        return this._dismissed.has(key);
    }

    list() {
        return Array.from(this._claims.values());
    }

    subscribe(listener) {
        this._listeners.add(listener);
        return () => this._listeners.delete(listener);
    }

    _notify() {
        for (const listener of Array.from(this._listeners)) {
            try {
                listener();
            } catch (error) {
                // A listener's failure never affects the store or other listeners.
            }
        }
    }
}

// Which claims are drawn right now. A claim is shown when it sits in the 3×3
// block of map cells around the viewer (the block discovery downloads from,
// see NearbySnapshotCandidates.js) and is not dismissed. It is hidden when:
// - `isPlaced(publicationId)`: this device has a real Placement for it, which
//   World View already renders; a claim never competes with a Placement.
// - a known Placement already sits at exactly the claimed position
//   (`knownPlacements`, the registry's records). Overlap is only a fact
//   (docs/Principles.md, "Overlap Is A Fact; Collision Is A Policy
//   Decision"); for an unverified claim the policy here is to yield.
export function selectVisibleClaimedBuilds(claims, {
    viewerPosition = null,
    isPlaced = () => false,
    isDismissed = () => false,
    knownPlacements = []
} = {}) {
    if (!Array.isArray(claims) || !isFinitePosition(viewerPosition)) {
        return [];
    }
    const nearbyCells = new Set(snapshotCellTagsAround(viewerPosition));
    return claims.filter((claim) => claim
        && !isDismissed(claim.key)
        && nearbyCells.has(snapshotCellTag(claim.position))
        && !isPlaced(claim.publicationId)
        && detectSpatialOverlap(claim.position, knownPlacements).isEmpty);
}

export const ClaimedBuildAcceptance = Object.freeze({
    ACCEPTABLE: 'acceptable',
    // The publisher's signed Publication record is not known on this device,
    // so there is nothing verified to place.
    PUBLICATION_UNKNOWN: 'publication-unknown',
    // The known Publication names different content than the ghost shows.
    CONTENT_MISMATCH: 'content-mismatch',
    // Its publisher allows only their own placements (core/PlacementPolicy.js).
    PUBLISHER_ONLY: 'publisher-only'
});

// Whether "Accept Position" may place this claim. Only a Publication this
// device already knows (verified and admitted, e.g. by inspecting its World
// Encounter) can be placed, and only when that Publication's own content is
// exactly the content the ghost shows, so accepting never places something
// other than what the Wanderer saw, and only when its publisher's placement
// policy lets this Wanderer place it (`isPlacementPermitted`, which defaults
// to allowed).
export function describeClaimedBuildAcceptance(claim, findPublicationById, isPlacementPermitted = () => true) {
    const publication = typeof findPublicationById === 'function' ? findPublicationById(claim.publicationId) : null;
    if (!publication) {
        return ClaimedBuildAcceptance.PUBLICATION_UNKNOWN;
    }
    const hash = publication.contentReference ? publication.contentReference.hash : null;
    if (hash !== claim.contentHash) {
        return ClaimedBuildAcceptance.CONTENT_MISMATCH;
    }
    if (!isPlacementPermitted(publication)) {
        return ClaimedBuildAcceptance.PUBLISHER_ONLY;
    }
    return ClaimedBuildAcceptance.ACCEPTABLE;
}
