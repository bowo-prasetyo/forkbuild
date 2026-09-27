// Narrower discovery tags carried beside the global ones
// (docs/AnnouncementIndex.md, "Phase 6"). Every announcement keeps its global
// tag, so a reader that knows only the global tag still finds it; the
// narrow tag lets a reader ask for just the announcements it needs, which a
// capped query then returns completely.

export const COMMENTARY_PUBLICATION_TAG_PREFIX = 'forkbuild-commentary:';
export const SNAPSHOT_CELL_TAG_PREFIX = 'forkbuild-snapshot:cell:';
// World units per map cell side. Discovery reads a 3×3 block of cells around
// the player, so this is also roughly how far ahead it looks.
export const SNAPSHOT_CELL_SIZE = 1000;

// Null for a missing publication id, so callers publish the global tag alone.
export function commentaryPublicationTag(publicationId) {
    return typeof publicationId === 'string' && publicationId.length > 0
        ? COMMENTARY_PUBLICATION_TAG_PREFIX + publicationId
        : null;
}

function isFinitePosition(position) {
    return Boolean(position) && Number.isFinite(position.x) && Number.isFinite(position.z);
}

function cellTag(cx, cz) {
    // `+ 0` turns -0 into 0, so a cell's tag never depends on how it was reached.
    return `${SNAPSHOT_CELL_TAG_PREFIX}${cx + 0}:${cz + 0}`;
}

// The cell holding a claimed position ({ x, z }), or null without one.
export function snapshotCellTag(position) {
    if (!isFinitePosition(position)) return null;
    return cellTag(Math.floor(position.x / SNAPSHOT_CELL_SIZE), Math.floor(position.z / SNAPSHOT_CELL_SIZE));
}

// The cell holding `position` and the `radius` rings of cells around it.
export function snapshotCellTagsAround(position, radius = 1) {
    if (!isFinitePosition(position)) return [];
    const cx = Math.floor(position.x / SNAPSHOT_CELL_SIZE);
    const cz = Math.floor(position.z / SNAPSHOT_CELL_SIZE);
    const tags = [];
    for (let dx = -radius; dx <= radius; dx++) {
        for (let dz = -radius; dz <= radius; dz++) tags.push(cellTag(cx + dx, cz + dz));
    }
    return tags;
}
