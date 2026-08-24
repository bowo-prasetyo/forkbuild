import { SpatialBounds } from './SpatialBounds.js';

// 0.6.4 — Blueprint Discovery, Search & Library Organization.
//
// Pure, stateless structure list ORDERING — the presentation-only
// counterpart to core/groupStructuresByCategory.js's own grouping.
// Nothing here reads or writes core/Structure.js, and nothing here is
// ever persisted: see docs/Principles.md, "Sorting Is Presentation,
// Never Identity (0.6.4)." A caller re-sorts the exact same array of
// Structure values every time the user changes the sort dropdown —
// this never mutates a Structure, never reorders anything a
// registry/store itself hands back, and never becomes part of what
// gets serialized.
//
// Every branch below breaks ties on `id` — the one field every
// Structure is guaranteed to have and guaranteed unique — so the same
// query renders in the same order on every call, never left to
// whatever order Array#prototype.sort's own (engine-dependent, if the
// comparator ever returned 0 unresolved) stability happened to
// preserve.
export const STRUCTURE_SORT_OPTIONS = [
    { key: 'name', label: 'Name' },
    { key: 'recent', label: 'Recently created' },
    { key: 'brickCount', label: 'Brick count' },
    { key: 'footprint', label: 'Footprint' },
    { key: 'height', label: 'Height' }
];

const DEFAULT_SORT_KEY = 'name';

function compareIds(a, b) {
    if (a.id < b.id) return -1;
    if (a.id > b.id) return 1;
    return 0;
}

function boundsOf(structure, registry) {
    return SpatialBounds.fromBricks(structure.bricks, registry || null);
}

// registry is optional — without one, SpatialBounds.fromBricks() falls
// back to treating every brick as a 1x1x1 cube (its own documented
// default), so footprint/height sorting degrades to "roughly how many
// bricks span the structure" rather than throwing when a caller has no
// registry handy.
function footprintArea(structure, registry) {
    return boundsOf(structure, registry).size.x * boundsOf(structure, registry).size.z;
}

function heightOf(structure, registry) {
    return boundsOf(structure, registry).size.y;
}

// `savedAtById` is an optional { [structureId]: timestamp } map — the
// ONLY source of recency this function ever consults. It never reaches
// into a Structure itself for a creation date, because core/Structure.js
// deliberately carries no such field (see that file's own header) — a
// built-in Structure (never present in the map) always sorts as least
// recent, falling back to the same id tie-break as every other key.
export function sortStructures(structures, sortKey = DEFAULT_SORT_KEY, { registry = null, savedAtById = {} } = {}) {
    const list = structures.slice();

    switch (sortKey) {
        case 'recent':
            list.sort((a, b) => {
                const diff = (savedAtById[b.id] ?? -Infinity) - (savedAtById[a.id] ?? -Infinity);
                return diff !== 0 ? diff : compareIds(a, b);
            });
            break;
        case 'brickCount':
            list.sort((a, b) => {
                const diff = b.bricks.length - a.bricks.length;
                return diff !== 0 ? diff : compareIds(a, b);
            });
            break;
        case 'footprint':
            list.sort((a, b) => {
                const diff = footprintArea(b, registry) - footprintArea(a, registry);
                return diff !== 0 ? diff : compareIds(a, b);
            });
            break;
        case 'height':
            list.sort((a, b) => {
                const diff = heightOf(b, registry) - heightOf(a, registry);
                return diff !== 0 ? diff : compareIds(a, b);
            });
            break;
        case 'name':
        default:
            list.sort((a, b) => {
                const nameA = (a.name || '').toLowerCase();
                const nameB = (b.name || '').toLowerCase();
                if (nameA < nameB) return -1;
                if (nameA > nameB) return 1;
                return compareIds(a, b);
            });
            break;
    }

    return list;
}
