// What a build is made of, and what a remix changed, as facts a sentence can
// be made from (ui/i18n/buildDescriptionText.js): for a screen reader, for
// the picture of a build on its shared link and in an embed, and under
// "Remixed from" so credit says what each builder added, not only who.
//
// Facts, never guesses: counts of bricks, the Build Library structures that
// stand in a build (core/catalog/BuildSimilarity.js#findReadyMade(), the same
// detection the look-alike hint uses), the parts a person would name
// (windows, doors, a roof, trees …) among the rest, its size and its main
// colours named after the village palette.
//
// Pure: bricks and definitions in, plain objects out.
import { buildShape, findReadyMade, readyMadeCoverage } from './BuildSimilarity.js';
import { VILLAGE_PALETTE } from '../building/VillagePalette.js';

// The parts a description names, in the order it names them.
export const BUILD_PARTS = Object.freeze([
    'window', 'door', 'roof', 'stairs', 'arch', 'fence', 'chimney', 'furniture', 'lantern', 'tree', 'bush', 'rock', 'lawn'
]);

const PART_BY_DEFINITION = Object.freeze({
    'core:window_small': 'window',
    'core:window_large': 'window',
    'core:window_frame': 'window',
    'core:window_round': 'window',
    'core:door': 'door',
    'core:door_double': 'door',
    'core:roof_hip': 'roof',
    'core:roof_hip_4x4': 'roof',
    'core:roof_hip_4x6': 'roof',
    'core:roof_hip_6x6': 'roof',
    'core:roof_gable': 'roof',
    'core:roof_gable_2x4': 'roof',
    'core:roof_cone': 'roof',
    'core:stair': 'stairs',
    'core:stair_wide': 'stairs',
    'core:ladder': 'stairs',
    'core:arch': 'arch',
    'core:arch_small': 'arch',
    'core:fence': 'fence',
    'core:chimney': 'chimney',
    'core:table': 'furniture',
    'core:bed': 'furniture',
    'core:hearth': 'furniture',
    'core:shelf': 'furniture',
    'core:bench': 'furniture',
    'core:barrel': 'furniture',
    'core:lantern': 'lantern',
    'core:pine_tree': 'tree',
    'core:bush': 'bush',
    'core:rock': 'rock',
    'core:lawn_2x2': 'lawn'
});

// A brick from another library is named by its category when that is a part.
const PART_BY_CATEGORY = Object.freeze({ window: 'window', door: 'door', roof: 'roof', stairs: 'stairs', arch: 'arch' });

// A structure is named when this much of it stands in a build. The look-alike
// hint takes out half of a large structure (readyMadeCoverage()); naming
// one needs nearly all of it, or a House would be named as the House with a
// Porch, which is the House and six bricks more.
const NAMED_STRUCTURE_SHARE = 0.95;
const namedCoverage = (size) => (readyMadeCoverage(size) === null ? null : NAMED_STRUCTURE_SHARE);

// A colour named in a description needs at least this share of the bricks.
const MAIN_COLOUR_SHARE = 0.2;
const MAIN_COLOURS = 2;

// The part a brick of `definitionId` is, or null for a plain one (a wall, a
// block, a beam).
export function brickPart(definitionId, definition = null) {
    return PART_BY_DEFINITION[definitionId] || PART_BY_CATEGORY[definition?.category] || null;
}

// The village palette colour (its id) nearest to `color` (0xRRGGBB).
export function nearestPaletteColour(color) {
    const r = (color >> 16) & 0xff;
    const g = (color >> 8) & 0xff;
    const b = color & 0xff;
    let best = null;
    let bestDistance = Infinity;
    for (const swatch of VILLAGE_PALETTE) {
        const dr = r - ((swatch.color >> 16) & 0xff);
        const dg = g - ((swatch.color >> 8) & 0xff);
        const db = b - (swatch.color & 0xff);
        // Weighted for how the eye sees green more than red, red more than blue.
        const distance = 2 * dr * dr + 4 * dg * dg + 3 * db * db;
        if (distance < bestDistance) {
            bestDistance = distance;
            best = swatch.id;
        }
    }
    return best;
}

function colourOf(brick, definitionOf) {
    const own = brick?.color;
    if (Number.isInteger(own)) return own;
    const fallback = definitionOf(brick?.definitionId)?.color;
    return Number.isInteger(fallback) ? fallback : null;
}

function partsOf(points, definitionOf) {
    const counts = new Map();
    for (const point of points) {
        const part = brickPart(point.definitionId, definitionOf(point.definitionId));
        if (part) counts.set(part, (counts.get(part) || 0) + 1);
    }
    return Object.freeze(BUILD_PARTS.filter((part) => counts.has(part)).map((part) => Object.freeze({ part, count: counts.get(part) })));
}

function mainColours(bricks, definitionOf) {
    const counts = new Map();
    let total = 0;
    for (const brick of bricks) {
        const color = colourOf(brick, definitionOf);
        if (color === null) continue;
        const id = nearestPaletteColour(color);
        counts.set(id, (counts.get(id) || 0) + 1);
        total += 1;
    }
    return Object.freeze([...counts.entries()]
        .filter(([, count]) => count / total >= MAIN_COLOUR_SHARE)
        .sort((a, b) => b[1] - a[1] || (a[0] < b[0] ? -1 : 1))
        .slice(0, MAIN_COLOURS)
        .map(([id]) => id));
}

function sizeOf(bricks) {
    const extent = (axis) => {
        let min = Infinity;
        let max = -Infinity;
        for (const brick of bricks) {
            const value = Number(brick?.position?.[axis]);
            if (!Number.isFinite(value)) continue;
            min = Math.min(min, value);
            max = Math.max(max, value);
        }
        return min === Infinity ? 0 : Math.max(1, Math.round(max - min + 1));
    };
    return Object.freeze({ width: extent('x'), depth: extent('z'), height: extent('y') });
}

// The structures and parts among `bricks`, and how many bricks are neither:
// structures first, their bricks then left out of the parts, so "a House and
// 2 windows" means two windows besides the House's own.
function contents(bricks, { definitionOf, readyMade }) {
    const { rest, found } = findReadyMade(buildShape(bricks), readyMade, { coverageFor: namedCoverage });
    const parts = partsOf(rest?.points || [], definitionOf);
    const named = parts.reduce((sum, { count }) => sum + count, 0);
    // The bricks neither a structure nor a part: walls, blocks, beams.
    return { structures: Object.freeze(found), parts, otherBricks: Math.max(0, (rest?.size || 0) - named) };
}

// What `bricks` (a build's) are: `{ brickCount, size, structures, parts,
// otherBricks, colours }`. `definitionOf(id)` gives a brick definition (its
// category and default colour); `readyMade` is `[{ id, shape }]`, the Build
// Library's structures as buildShape()s, or none to name no structures.
export function describeBricks(bricks, { definitionOf = () => null, readyMade = [] } = {}) {
    const list = (bricks || []).filter((brick) => brick && brick.definitionId);
    if (list.length === 0) {
        return Object.freeze({ brickCount: 0, size: Object.freeze({ width: 0, depth: 0, height: 0 }), structures: Object.freeze([]), parts: Object.freeze([]), otherBricks: 0, colours: Object.freeze([]) });
    }
    return Object.freeze({
        brickCount: list.length,
        size: sizeOf(list),
        ...contents(list, { definitionOf, readyMade }),
        colours: mainColours(list, definitionOf)
    });
}

function placeKey(brick) {
    const position = brick.position || {};
    const round = (value) => Math.round(Number(value || 0) * 1000) / 1000 + 0;
    return `${brick.definitionId}|${round(position.x)}|${round(position.y)}|${round(position.z)}|${Number(brick.rotation) || 0}|${Number(brick.tilt) || 0}`;
}

// What a remix changed from the build it came from (`parentBricks`): the
// bricks it added (their structures and parts, as describeBricks() names
// them), how many it took away, and how many it repainted and to what
// colour mostly. A brick turned or moved counts as taken away and added.
// `changed` is false when the two are the same.
export function describeRemixChanges(parentBricks, bricks, { definitionOf = () => null, readyMade = [] } = {}) {
    const before = new Map();
    for (const brick of parentBricks || []) {
        if (!brick?.definitionId) continue;
        const key = placeKey(brick);
        if (!before.has(key)) before.set(key, []);
        before.get(key).push(colourOf(brick, definitionOf));
    }
    const added = [];
    const repainted = [];
    for (const brick of bricks || []) {
        if (!brick?.definitionId) continue;
        const colours = before.get(placeKey(brick));
        if (!colours || colours.length === 0) {
            added.push(brick);
            continue;
        }
        const colour = colourOf(brick, definitionOf);
        const same = colours.indexOf(colour);
        if (same !== -1) {
            colours.splice(same, 1);
        } else {
            colours.shift();
            repainted.push(brick);
        }
    }
    let removed = 0;
    for (const colours of before.values()) removed += colours.length;
    const addedContents = added.length > 0 ? contents(added, { definitionOf, readyMade }) : { structures: Object.freeze([]), parts: Object.freeze([]), otherBricks: 0 };
    return Object.freeze({
        changed: added.length + removed + repainted.length > 0,
        added: Object.freeze({ brickCount: added.length, ...addedContents }),
        removed: Object.freeze({ brickCount: removed }),
        repainted: Object.freeze({ brickCount: repainted.length, colours: repainted.length > 0 ? mainColours(repainted, definitionOf).slice(0, 1) : Object.freeze([]) })
    });
}
