import { snapshotCellTag, snapshotCellTagsAround } from '../../core/NarrowDiscoveryTags.js';

// Snapshots without any known position kept per call, newest first: the
// cap the global tag's network query used to impose on its own.
export const DEFAULT_MAX_UNLOCATED_CANDIDATES = 20;

// Which discovered Snapshot candidates World View should fetch the bytes of.
// A candidate is kept when its position falls in the 3×3 block of map cells
// around the viewer, the same block discovery reads the cell tags of. Its
// position is the local placement for its Publication when there is one
// (`placementPositionOf(publicationId)`), otherwise the publisher's
// `claimedPosition`; this only decides what is worth fetching, never where
// anything is placed. Candidates with neither are kept up to
// `maxUnlocated`, in the order given (the index lists newest first).
// Without a viewer position nothing located is near, so only those are kept.
export function selectNearbySnapshotCandidates(candidates, {
    viewerPosition = null,
    placementPositionOf = () => null,
    maxUnlocated = DEFAULT_MAX_UNLOCATED_CANDIDATES
} = {}) {
    if (!Array.isArray(candidates)) return [];
    const nearbyCells = new Set(snapshotCellTagsAround(viewerPosition));
    let unlocated = 0;
    return candidates.filter((candidate) => {
        if (!candidate) return false;
        const cell = snapshotCellTag(positionOf(candidate, placementPositionOf));
        if (cell !== null) return nearbyCells.has(cell);
        unlocated += 1;
        return unlocated <= maxUnlocated;
    });
}

function positionOf(candidate, placementPositionOf) {
    const placed = typeof candidate.publicationId === 'string' && candidate.publicationId.length > 0
        ? placementPositionOf(candidate.publicationId)
        : null;
    return placed || candidate.claimedPosition || null;
}
