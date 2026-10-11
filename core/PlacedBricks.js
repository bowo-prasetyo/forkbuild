// How many of a build's bricks its builder placed or changed, as opposed to
// bricks it was started with: a ready-made structure it began as, a build it
// is a copy of, or a ready-made structure dropped into it from the Build
// Library. The counters' building target reads this
// (core/VisitorCount.js, publishedPlacedRangeEvent;
// docs/reviews/CreativeDirection-2026-10-11.md, finding 2): publishing the
// starter house untouched is not building it.
//
// A brick is compared by what it is and where it stands (its signature:
// definition, position, turn, tilt and colour), never by id: a copy gets new
// ids. So a ready-made brick moved, turned, tilted or recoloured counts as the
// builder's own, and one deleted counts for nothing.
//
// Pure: bricks and a record of ready-made signatures in, a count out.

// Positions are compared to a thousandth of a unit, so a build saved and
// opened again matches what it started as.
const PRECISION = 1000;

function rounded(value) {
    const number = Number(value);
    return Number.isFinite(number) ? Math.round(number * PRECISION) / PRECISION : 0;
}

// What a brick is and where it stands, as one string.
export function brickSignature(brick) {
    const position = brick?.position || {};
    const color = brick?.color === null || brick?.color === undefined ? '' : String(brick.color);
    return [
        brick?.definitionId ?? '',
        rounded(position.x),
        rounded(position.y),
        rounded(position.z),
        rounded(brick?.rotation ?? 0),
        rounded(brick?.tilt ?? 0),
        color
    ].join('|');
}

// { signature: how many } for `bricks`, added to `into` (a plain object,
// copied, never changed).
export function addReadyMadeBricks(into, bricks) {
    const counts = { ...(into && typeof into === 'object' ? into : {}) };
    for (const brick of bricks || []) {
        const signature = brickSignature(brick);
        counts[signature] = (counts[signature] || 0) + 1;
    }
    return counts;
}

// How many of `bricks` aren't accounted for by `readyMade` ({ signature:
// how many }, as addReadyMadeBricks() makes): each ready-made brick still
// standing as it was accounts for one brick with its signature. With no
// record, every brick is the builder's own.
export function countPlacedBricks(bricks, readyMade) {
    const left = { ...(readyMade && typeof readyMade === 'object' ? readyMade : {}) };
    let placed = 0;
    for (const brick of bricks || []) {
        const signature = brickSignature(brick);
        if (left[signature] > 0) {
            left[signature] -= 1;
        } else {
            placed += 1;
        }
    }
    return placed;
}

// Every brick of a World's buildings.
export function worldBricks(world) {
    const bricks = [];
    for (const building of world?.getBuildings?.() || []) {
        for (const brick of building.getBricks()) bricks.push(brick);
    }
    return bricks;
}
