// How much two whole builds look alike, for the "looks a lot like someone
// else's build" hint at publish. Like core/BlueprintSimilarity.js it is
// evidence for a person to weigh, never a finding of copying (docs/
// Principles.md, "Similarity Is Evidence; It Never Becomes Lineage").
//
// A brick is compared by what it is and where it stands (its definition and
// position). Its turn and colour are left out: rebuilding a build by eye
// often turns a symmetric brick the other way or picks another colour, and a
// recoloured copy is still a copy. Unlike BlueprintSimilarity, the two builds
// are first lined up: a copy built two studs over, higher up, or turned a
// quarter turn compares as what it is.
//
// Pure: bricks in, numbers out.

// Builds smaller than this are too simple to tell a copy from a coincidence.
export const MIN_COMPARED_BRICKS = 20;
// Shared bricks over all distinct bricks of both (a Jaccard index) at or
// above which two builds are worth pointing out.
export const SIMILAR_BUILD_THRESHOLD = 0.6;

const TURNS = Object.freeze([0, 90, 180, 270]);
const PRECISION = 1000;
// The line-up is found by letting pairs of same-kind bricks vote for the
// offset between the builds. These bound the work on large builds; the
// rarest kinds of brick vote first, since they say the most.
const MAX_ANCHORS = 48;
const MAX_PAIRS_PER_ANCHOR = 64;
const OFFSETS_TRIED_PER_TURN = 3;

function rounded(value) {
    const number = Number(value);
    return Number.isFinite(number) ? Math.round(number * PRECISION) / PRECISION + 0 : 0;
}

function pointKey(definitionId, x, y, z) {
    return `${definitionId}|${x}|${y}|${z}`;
}

// A build's bricks reduced to what is compared: one point per distinct
// definition and position, and how many distinct points each definition has.
export function buildShape(bricks) {
    const points = new Map();
    for (const brick of bricks || []) {
        if (!brick || !brick.definitionId) continue;
        const position = brick.position || {};
        const x = rounded(position.x);
        const y = rounded(position.y);
        const z = rounded(position.z);
        const key = pointKey(brick.definitionId, x, y, z);
        if (!points.has(key)) points.set(key, Object.freeze({ definitionId: brick.definitionId, x, y, z }));
    }
    const kinds = {};
    for (const point of points.values()) {
        kinds[point.definitionId] = (kinds[point.definitionId] || 0) + 1;
    }
    return Object.freeze({
        size: points.size,
        points: Object.freeze([...points.values()]),
        keys: new Set(points.keys()),
        kinds: Object.freeze(kinds)
    });
}

// The highest similarity two shapes could reach however they are lined up,
// from their counts alone: a shared brick needs the same definition on both
// sides. Lets a caller skip the full comparison for builds that can't match.
export function similarityUpperBound(mine, theirs) {
    if (!mine?.size || !theirs?.size) return 0;
    let shared = 0;
    for (const [definitionId, count] of Object.entries(mine.kinds)) {
        shared += Math.min(count, theirs.kinds[definitionId] || 0);
    }
    return shared / (mine.size + theirs.size - shared);
}

// A quarter turn about the vertical, as the Editor turns a selection
// (application/editor/TransformMath.js: x' = cos·x − sin·z, z' = sin·x + cos·z).
function turnPoint(point, turn) {
    switch (turn) {
        case 90: return { definitionId: point.definitionId, x: rounded(-point.z), y: point.y, z: rounded(point.x) };
        case 180: return { definitionId: point.definitionId, x: rounded(-point.x), y: point.y, z: rounded(-point.z) };
        case 270: return { definitionId: point.definitionId, x: rounded(point.z), y: point.y, z: rounded(-point.x) };
        default: return point;
    }
}

function offsetsByVote(mine, turned) {
    const byKind = new Map();
    for (const point of turned) {
        if (!byKind.has(point.definitionId)) byKind.set(point.definitionId, []);
        byKind.get(point.definitionId).push(point);
    }
    const anchors = mine.points
        .filter((point) => byKind.has(point.definitionId))
        .sort((a, b) => byKind.get(a.definitionId).length - byKind.get(b.definitionId).length
            || (pointKey(a.definitionId, a.x, a.y, a.z) < pointKey(b.definitionId, b.x, b.y, b.z) ? -1 : 1))
        .slice(0, MAX_ANCHORS);
    const votes = new Map();
    for (const anchor of anchors) {
        for (const point of byKind.get(anchor.definitionId).slice(0, MAX_PAIRS_PER_ANCHOR)) {
            const offset = { x: rounded(anchor.x - point.x), y: rounded(anchor.y - point.y), z: rounded(anchor.z - point.z) };
            const key = `${offset.x}|${offset.y}|${offset.z}`;
            const vote = votes.get(key);
            if (vote) vote.count += 1;
            else votes.set(key, { key, offset, count: 1 });
        }
    }
    return [...votes.values()]
        .sort((a, b) => b.count - a.count || (a.key < b.key ? -1 : 1))
        .slice(0, OFFSETS_TRIED_PER_TURN)
        .map((vote) => vote.offset);
}

function countShared(mine, turned, offset) {
    let shared = 0;
    for (const point of turned) {
        if (mine.keys.has(pointKey(point.definitionId, rounded(point.x + offset.x), rounded(point.y + offset.y), rounded(point.z + offset.z)))) {
            shared += 1;
        }
    }
    return shared;
}

// How alike `theirs` is to `mine` (two buildShape()s), lined up the way that
// makes the most bricks meet: `similarity` (0 to 1, to two places), how many
// bricks are `shared`, how many are only in each, and the quarter `turn` of
// theirs that lines them up.
export function compareBuildShapes(mine, theirs) {
    if (!mine?.size || !theirs?.size) {
        return Object.freeze({ similarity: 0, shared: 0, onlyMine: mine?.size || 0, onlyTheirs: theirs?.size || 0, turn: 0 });
    }
    let best = { shared: -1, turn: 0 };
    for (const turn of TURNS) {
        const turned = theirs.points.map((point) => turnPoint(point, turn));
        for (const offset of offsetsByVote(mine, turned)) {
            const shared = countShared(mine, turned, offset);
            if (shared > best.shared) best = { shared, turn };
        }
    }
    const shared = Math.max(best.shared, 0);
    const union = mine.size + theirs.size - shared;
    return Object.freeze({
        similarity: Math.round((shared / union) * 100) / 100,
        shared,
        onlyMine: mine.size - shared,
        onlyTheirs: theirs.size - shared,
        turn: best.shared > 0 ? best.turn : 0
    });
}

// Whether `evidence` (compareBuildShapes()) is alike enough to point out.
export function isSimilarBuild(evidence, threshold = SIMILAR_BUILD_THRESHOLD) {
    return !!evidence && evidence.similarity >= threshold;
}
