import { BUILD_TAG_MAX_COUNT, normalizeBuildTag } from './BuildTags.js';

// Narrower discovery tags carried beside the global ones
// (docs/AnnouncementIndex.md, "Phase 6"). Every announcement keeps its global
// tag, so a reader that knows only the global tag still finds it; the
// narrow tag lets a reader ask for just the announcements it needs, which a
// capped query then returns completely.

export const COMMENTARY_PUBLICATION_TAG_PREFIX = 'forkbuild-commentary:';
export const SNAPSHOT_CELL_TAG_PREFIX = 'forkbuild-snapshot:cell:';
export const PUBLICATION_RECORD_TAG_PREFIX = 'forkbuild-publication:';
export const BUILD_TAG_DISCOVERY_PREFIX = 'forkbuild-tag:';
// World units per map cell side. Discovery reads a 3×3 block of cells around
// the player, so this is also roughly how far ahead it looks.
export const SNAPSHOT_CELL_SIZE = 1000;

// Null for a missing publication id, so callers publish the global tag alone.
export function commentaryPublicationTag(publicationId) {
    return typeof publicationId === 'string' && publicationId.length > 0
        ? COMMENTARY_PUBLICATION_TAG_PREFIX + publicationId
        : null;
}

// Carried by a Publication announcement beside the global
// 'forkbuild-publication' tag, so a reader looking for one Publication's
// signed record (a claimed build's, see application/snapshot/claimed/) can
// ask for exactly its announcements, however old. Null for a missing id.
export function publicationRecordTag(publicationId) {
    return typeof publicationId === 'string' && publicationId.length > 0
        ? PUBLICATION_RECORD_TAG_PREFIX + publicationId
        : null;
}

// Carried by a Publication announcement for each of the build's own tags
// (core/BuildTags.js), so a reader can ask for the builds with one tag, such
// as a week's challenge entries (core/BuildChallenge.js). Null for anything
// that isn't a build tag.
export function buildTagDiscoveryTag(tag) {
    const normalized = normalizeBuildTag(tag);
    return normalized && normalized === tag ? BUILD_TAG_DISCOVERY_PREFIX + normalized : null;
}

// The build tag a `forkbuild-tag:` discovery tag names, or null.
export function buildTagOfDiscoveryTag(discoveryTag) {
    if (typeof discoveryTag !== 'string' || !discoveryTag.startsWith(BUILD_TAG_DISCOVERY_PREFIX)) return null;
    const tag = discoveryTag.slice(BUILD_TAG_DISCOVERY_PREFIX.length);
    return normalizeBuildTag(tag) === tag ? tag : null;
}

// The build-tag discovery tags for `tags`, each once, invalid ones left out,
// at most BUILD_TAG_MAX_COUNT.
export function buildTagDiscoveryTags(tags) {
    if (!Array.isArray(tags)) return [];
    const result = [];
    for (const tag of tags) {
        const discoveryTag = buildTagDiscoveryTag(tag);
        if (discoveryTag && !result.includes(discoveryTag)) result.push(discoveryTag);
        if (result.length === BUILD_TAG_MAX_COUNT) break;
    }
    return result;
}

// The build-tag discovery tags a Publication's announcement carries, from
// `buildTagsFor(publicationId)` (the build's own tags). A build whose tags
// can't be read is announced without them, never refused.
export function announcedBuildTagDiscoveryTags(buildTagsFor, publicationId) {
    if (typeof buildTagsFor !== 'function') return [];
    try {
        return buildTagDiscoveryTags(buildTagsFor(publicationId));
    } catch {
        return [];
    }
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
