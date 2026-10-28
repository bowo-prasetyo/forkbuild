// How much two whole builds look alike, for the "looks a lot like someone
// else's build" hint at publish. Like core/building/BlueprintSimilarity.js it is
// evidence for a person to weigh, never a finding of copying (docs/
// Principles.md, "Similarity Is Evidence; It Never Becomes Lineage").
//
// A brick is compared by what it is and where it stands (its definition and
// position). Its turn and colour are left out: rebuilding a build by eye
// often turns a symmetric brick the other way or picks another colour, and a
// recoloured copy is still a copy. Unlike BlueprintSimilarity, the two builds
// are first lined up: a copy built two studs over, higher up, turned a
// quarter turn, or mirrored compares as what it is.
//
// Two builds are pointed out (isSimilarBuild()) when most of both is the
// same (a Jaccard index), or when nearly all of the smaller stands in the
// larger: a copy with a garden added is still a copy. Either way, what they
// share must say something: walls, a floor or a block of one or two kinds of
// brick turn up in many builds by chance, and so do the walls and roof of two
// tiny homes for the same challenge, so a match made of fewer than
// MIN_SHARED_KINDS kinds of brick is never pointed out. Every Build Library
// structure and example build of 20 bricks or more has five or more.
// scripts/evaluate-look-alikes.mjs measures these bars.
//
// Bricks of a ready-made structure from the Build Library, even one its
// builder changed in part, can be taken out of a shape first
// (withoutReadyMade()): two builds that both stand the same ready-made house
// look alike for it, not for anything their builders placed.
//
// Pure: bricks in, numbers out.

// Builds smaller than this are too simple to tell a copy from a coincidence.
export const MIN_COMPARED_BRICKS = 20;
// Shared bricks over all distinct bricks of both (a Jaccard index) at or
// above which two builds are worth pointing out.
export const SIMILAR_BUILD_THRESHOLD = 0.6;
// The share of the smaller build's bricks standing in the larger at or above
// which they are worth pointing out too, however much the larger added.
export const CONTAINED_BUILD_THRESHOLD = 0.85;
// How many kinds of brick the shared bricks must be to say anything: with
// three, two tiny homes made apart were pointed out one time in twelve, and
// a tiny home among a village of others one in nine; with four, one in a
// hundred and none, while copies are still found.
export const MIN_SHARED_KINDS = 4;

const TURNS = Object.freeze([0, 90, 180, 270]);
const PRECISION = 1000;
// The line-up is found by letting pairs of same-kind bricks vote for the
// offset between the builds, and by lining up their corners. These bound the
// work on large builds; the rarest kinds of brick vote first, since they say
// the most.
const MAX_ANCHORS = 48;
const MAX_PAIRS_PER_ANCHOR = 64;
const OFFSETS_TRIED_PER_TURN = 3;
// Smaller structures than MIN_READY_MADE_POINTS (a fence segment) are too
// plain to tell from bricks placed by hand, and are left in.
export const MIN_READY_MADE_POINTS = 6;
const MAX_COPIES_OF_ONE_STRUCTURE = 12;

// The share of a ready-made structure's bricks that must stand in a build,
// lined up as it is anywhere and at any quarter turn, for it to count as
// there, though its builder changed the rest; null for one too small to tell.
// The larger the structure, the less chance a pattern that big turns up by
// hand, so the more of it may have been changed: measured with
// scripts/evaluate-ready-made-detection.mjs, these find a structure changed
// by a fifth nine times in ten and take out no brick placed by hand, where
// lower shares (0.6 for every size) start to.
export function readyMadeCoverage(size) {
    if (!(size >= MIN_READY_MADE_POINTS)) return null;
    if (size < 12) return 0.8;
    if (size < 30) return 0.7;
    return 0.5;
}

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
    return shapeOf(points);
}

// `points`: key -> point.
function shapeOf(points) {
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
// (application/editor/TransformMath.js: x' = cos·x − sin·z, z' = sin·x + cos·z),
// after mirroring left to right (x' = −x) when `mirrored`.
function turnPoint(point, turn, mirrored = false) {
    if (mirrored) point = { definitionId: point.definitionId, x: rounded(-point.x), y: point.y, z: point.z };
    switch (turn) {
        case 90: return { definitionId: point.definitionId, x: rounded(-point.z), y: point.y, z: rounded(point.x) };
        case 180: return { definitionId: point.definitionId, x: rounded(-point.x), y: point.y, z: rounded(-point.z) };
        case 270: return { definitionId: point.definitionId, x: rounded(point.z), y: point.y, z: rounded(-point.x) };
        default: return point;
    }
}

// By place, so the same build compares the same whatever order its bricks
// were placed in.
function byPlace(a, b) {
    return a.x - b.x || a.y - b.y || a.z - b.z;
}

// `count` of `points`, spread evenly from first to last, rather than the
// first `count`: those all stand in one corner of a large build, where the
// other build's corner may not be.
function spread(points, count) {
    if (points.length <= count) return points;
    return Array.from({ length: count }, (_, i) => points[Math.floor((i * points.length) / count)]);
}

function groupByKind(points) {
    const byKind = new Map();
    for (const point of points) {
        if (!byKind.has(point.definitionId)) byKind.set(point.definitionId, []);
        byKind.get(point.definitionId).push(point);
    }
    for (const kind of byKind.values()) kind.sort(byPlace);
    return byKind;
}

function offsetsByVote(mine, turned) {
    const theirsByKind = groupByKind(turned);
    const mineByKind = groupByKind(mine.points.filter((point) => theirsByKind.has(point.definitionId)));
    // The rarest kinds first, every brick of them while the anchors last,
    // then the rest of a kind spread over the build.
    const kinds = [...mineByKind.keys()]
        .sort((a, b) => theirsByKind.get(a).length - theirsByKind.get(b).length || (a < b ? -1 : 1));
    const anchors = [];
    for (const kind of kinds) {
        if (anchors.length >= MAX_ANCHORS) break;
        anchors.push(...spread(mineByKind.get(kind), MAX_ANCHORS - anchors.length));
    }
    const votes = new Map();
    for (const anchor of anchors) {
        for (const point of spread(theirsByKind.get(anchor.definitionId), MAX_PAIRS_PER_ANCHOR)) {
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

function bounds(points) {
    const low = { x: Infinity, y: Infinity, z: Infinity };
    const high = { x: -Infinity, y: -Infinity, z: -Infinity };
    for (const point of points) {
        for (const axis of ['x', 'y', 'z']) {
            low[axis] = Math.min(low[axis], point[axis]);
            high[axis] = Math.max(high[axis], point[axis]);
        }
    }
    return { low, high };
}

// The offsets that put `turned`'s lowest corner on `mine`'s, and its highest
// on `mine`'s. Votes can't find a copy of a build of one or two kinds of
// brick laid in rows (a wall, a floor), where every offset gets about as
// many; these line up any copy moved whole, and one with bricks added or
// taken away on one side.
function offsetsByCorner(mine, turned) {
    const ours = bounds(mine.points);
    const theirs = bounds(turned);
    return ['low', 'high'].map((corner) => ({
        x: rounded(ours[corner].x - theirs[corner].x),
        y: rounded(ours[corner].y - theirs[corner].y),
        z: rounded(ours[corner].z - theirs[corner].z)
    }));
}

// The keys of `mine` that `turned`, moved by `offset`, lands on.
function sharedKeys(mine, turned, offset) {
    const keys = [];
    for (const point of turned) {
        const key = pointKey(point.definitionId, rounded(point.x + offset.x), rounded(point.y + offset.y), rounded(point.z + offset.z));
        if (mine.keys.has(key)) keys.push(key);
    }
    return keys;
}

// `theirs` turned (and, with `mirror`, mirrored) and moved onto `mine` the
// way that makes the most bricks meet: `{ shared, turn, mirrored, keys }`,
// `keys` being those of `mine` they meet. A mirrored line-up wins only when
// it meets more, so a symmetric build is never called mirrored.
function bestAlignment(mine, theirs, { mirror = false } = {}) {
    let best = { shared: -1, turn: 0, mirrored: false, keys: [] };
    for (const mirrored of mirror ? [false, true] : [false]) {
        for (const turn of TURNS) {
            const turned = theirs.points.map((point) => turnPoint(point, turn, mirrored));
            for (const offset of [...offsetsByVote(mine, turned), ...offsetsByCorner(mine, turned)]) {
                const keys = sharedKeys(mine, turned, offset);
                if (keys.length > best.shared) best = { shared: keys.length, turn, mirrored, keys };
            }
        }
    }
    return best;
}

// How many of `keys` (pointKey()s) are of each kind of brick.
function countByKind(keys) {
    const counts = {};
    for (const key of keys) {
        const definitionId = key.split('|').slice(0, -3).join('|');
        counts[definitionId] = (counts[definitionId] || 0) + 1;
    }
    return counts;
}

// How alike `theirs` is to `mine` (two buildShape()s), lined up the way that
// makes the most bricks meet, mirrored or not: `similarity` (0 to 1, to two
// places), how many bricks are `shared`, how many are only in each, the
// shares of each standing in the other (`theirsInMine`, `mineInTheirs`, 0 to
// 1, to two places), the quarter `turn` of theirs that lines them up and
// whether it was `mirrored` first, and how many kinds of brick the shared
// bricks are (`sharedKinds`) and how many of each (`sharedByKind`).
// `mirror: false` tries quarter turns only (the measuring script compares
// with how it was before mirroring).
export function compareBuildShapes(mine, theirs, { mirror = true } = {}) {
    if (!mine?.size || !theirs?.size) {
        return Object.freeze({
            similarity: 0, shared: 0, onlyMine: mine?.size || 0, onlyTheirs: theirs?.size || 0,
            theirsInMine: 0, mineInTheirs: 0, turn: 0, mirrored: false, sharedKinds: 0, sharedByKind: Object.freeze({})
        });
    }
    const best = bestAlignment(mine, theirs, { mirror });
    const shared = Math.max(best.shared, 0);
    const union = mine.size + theirs.size - shared;
    const share = (part, whole) => Math.round((part / whole) * 100) / 100;
    const sharedByKind = countByKind(best.keys);
    return Object.freeze({
        similarity: share(shared, union),
        shared,
        onlyMine: mine.size - shared,
        onlyTheirs: theirs.size - shared,
        theirsInMine: share(shared, theirs.size),
        mineInTheirs: share(shared, mine.size),
        turn: best.shared > 0 ? best.turn : 0,
        mirrored: best.shared > 0 && best.mirrored,
        sharedKinds: Object.keys(sharedByKind).length,
        sharedByKind: Object.freeze(sharedByKind)
    });
}

// `shape` without the bricks of each ready-made structure that stands in it
// (each of `readyMadeShapes`, buildShape()s of the Build Library's
// structures), however it was moved or turned, as many times as it stands
// there: the bricks still as the structure has them, while the ones its
// builder changed stay theirs. Larger structures are taken first, so a house
// with a porch goes as one, not as a house and some steps. `coverageFor(size)`
// is how much of a structure must be there (readyMadeCoverage(), unless the
// measuring script tries another).
export function withoutReadyMade(shape, readyMadeShapes, { coverageFor = readyMadeCoverage } = {}) {
    if (!Array.isArray(readyMadeShapes)) return shape;
    return findReadyMade(shape, readyMadeShapes.map((structureShape) => ({ id: null, shape: structureShape })), { coverageFor }).rest;
}

// The same, also saying which structures were found: `{ rest, found }`,
// `found` being `[{ id, count }]` for each of `structures` (`[{ id, shape }]`)
// that stands in `shape`, largest first.
export function findReadyMade(shape, structures, { coverageFor = readyMadeCoverage } = {}) {
    if (!shape?.size || !Array.isArray(structures) || structures.length === 0) return { rest: shape, found: [] };
    const candidates = structures
        .filter((structure) => structure?.shape?.size && coverageFor(structure.shape.size) !== null)
        .sort((a, b) => b.shape.size - a.shape.size);
    let rest = shape;
    const found = [];
    for (const { id, shape: structure } of candidates) {
        const needed = Math.ceil(structure.size * coverageFor(structure.size));
        let count = 0;
        for (let copy = 0; copy < MAX_COPIES_OF_ONE_STRUCTURE; copy += 1) {
            if (rest.size < needed || containedAtMost(structure, rest) < needed) break;
            const alignment = bestAlignment(rest, structure);
            if (alignment.shared < needed) break;
            const taken = new Set(alignment.keys);
            const left = new Map();
            for (const point of rest.points) {
                const key = pointKey(point.definitionId, point.x, point.y, point.z);
                if (!taken.has(key)) left.set(key, point);
            }
            rest = shapeOf(left);
            count += 1;
        }
        if (count > 0) found.push(Object.freeze({ id, count }));
    }
    return { rest, found };
}

// The most bricks of `part` that `whole` could hold, from counts per kind.
function containedAtMost(part, whole) {
    let held = 0;
    for (const [definitionId, count] of Object.entries(part.kinds)) {
        held += Math.min(count, whole.kinds[definitionId] || 0);
    }
    return held;
}

// Whether `evidence` (compareBuildShapes()) is alike enough to point out:
// most of both the same, or nearly all of the smaller standing in the larger,
// and in either case at least MIN_COMPARED_BRICKS shared bricks of at least
// MIN_SHARED_KINDS kinds. `policy` changes the bars, for the measuring script
// (scripts/evaluate-look-alikes.mjs).
export function isSimilarBuild(evidence, policy = {}) {
    if (!evidence) return false;
    const {
        threshold = SIMILAR_BUILD_THRESHOLD,
        containedThreshold = CONTAINED_BUILD_THRESHOLD,
        minKinds = MIN_SHARED_KINDS
    } = typeof policy === 'number' ? { threshold: policy } : policy;
    if (evidence.shared < MIN_COMPARED_BRICKS || evidence.sharedKinds < minKinds) return false;
    return evidence.similarity >= threshold || Math.max(evidence.theirsInMine, evidence.mineInTheirs) >= containedThreshold;
}

// What to say of `evidence` that was pointed out: `{ kind, percent,
// mirrored }`, `kind` being 'same' when most of both is the same (`percent`
// of all their bricks), or else 'theirsInMine' or 'mineInTheirs' (`percent`
// of that build's bricks standing in the other).
export function lookAlikeShare(evidence) {
    const percent = (share) => Math.round(share * 100);
    const mirrored = !!evidence?.mirrored;
    if (!evidence || evidence.similarity >= SIMILAR_BUILD_THRESHOLD) return Object.freeze({ kind: 'same', percent: percent(evidence?.similarity || 0), mirrored });
    return evidence.theirsInMine >= evidence.mineInTheirs
        ? Object.freeze({ kind: 'theirsInMine', percent: percent(evidence.theirsInMine), mirrored })
        : Object.freeze({ kind: 'mineInTheirs', percent: percent(evidence.mineInTheirs), mirrored });
}

// Whether two shapes could be pointed out at all, from their counts alone
// (similarityUpperBound(), and the most of the smaller that could stand in
// the larger): lets a caller skip the full comparison for builds that can't.
export function couldBeSimilar(mine, theirs, policy = {}) {
    if (!mine?.size || !theirs?.size) return false;
    const { threshold = SIMILAR_BUILD_THRESHOLD, containedThreshold = CONTAINED_BUILD_THRESHOLD } = typeof policy === 'number' ? { threshold: policy } : policy;
    const shared = containedAtMost(mine, theirs);
    if (shared < MIN_COMPARED_BRICKS) return false;
    return similarityUpperBound(mine, theirs) >= threshold || shared / Math.min(mine.size, theirs.size) >= containedThreshold;
}
