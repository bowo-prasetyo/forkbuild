import { Brick } from '../../core/Brick.js';
import { Position } from '../../core/Position.js';
import { SpatialBounds } from '../../core/SpatialBounds.js';

// The built-in structures offered as ready-made builds, in the order their
// cards show them: the three showcase builds (core/library/ShowcaseLibrary.js)
// first, then three Village ones. Home, the Repository and My Worlds list
// them, and the Editor's New offers them beside an empty plot. Each opens in
// the Editor as a new, independent document (`/editor?start=<id>`,
// EditorSession.forkStructure()), the same fork the Build Library's Fork
// button makes.
export const FEATURED_STRUCTURE_IDS = Object.freeze([
    'showcase:castle',
    'showcase:harbor_island',
    'showcase:village_square',
    'village:house',
    'village:mill',
    'village:bridge'
]);

// What Home's main button opens: something whole to change, rather than an
// empty plot.
export const STARTER_STRUCTURE_ID = 'village:house';

// The small village Home's 3D showcase turns, laid out two by two.
export const SHOWCASE_STRUCTURE_IDS = Object.freeze([
    'village:house',
    'village:mill',
    'village:watchtower',
    'village:small_chapel'
]);

const SHOWCASE_GAP = 2;

// The built-in structure a `start` query names, or null for anything else
// (a missing or repeated parameter, an unknown id).
export function findStarterStructure(structureRegistry, id) {
    if (typeof id !== 'string' || !id || !structureRegistry || !structureRegistry.has(id)) {
        return null;
    }
    return structureRegistry.get(id);
}

// The structures `ids` names that the registry has, in that order.
export function featuredStructures(structureRegistry, ids = FEATURED_STRUCTURE_IDS) {
    return ids.map((id) => findStarterStructure(structureRegistry, id)).filter(Boolean);
}

// The showcase's bricks: each structure's own bricks moved into a cell of a
// two-column grid, cells sized so footprints never overlap, the whole grid
// centered on the origin. Every brick is a new Brick; the library's own are
// never changed.
export function composeShowcase(structures, brickRegistry, { gap = SHOWCASE_GAP } = {}) {
    const entries = structures
        .filter((structure) => structure && structure.bricks.length > 0)
        .map((structure) => ({ structure, bounds: SpatialBounds.fromBricks(structure.bricks, brickRegistry) }));
    if (entries.length === 0) {
        return [];
    }
    const cellX = Math.max(...entries.map(({ bounds }) => bounds.size.x)) + gap;
    const cellZ = Math.max(...entries.map(({ bounds }) => bounds.size.z)) + gap;
    const columns = Math.min(2, entries.length);
    const rows = Math.ceil(entries.length / columns);

    const bricks = [];
    entries.forEach(({ structure, bounds }, index) => {
        const column = index % columns;
        const row = Math.floor(index / columns);
        const dx = (column - (columns - 1) / 2) * cellX - bounds.center.x;
        const dz = (row - (rows - 1) / 2) * cellZ - bounds.center.z;
        for (const brick of structure.bricks) {
            bricks.push(new Brick({
                definitionId: brick.definitionId,
                position: new Position(brick.position.x + dx, brick.position.y, brick.position.z + dz),
                rotation: brick.rotation,
                color: brick.color
            }));
        }
    });
    return bricks;
}
