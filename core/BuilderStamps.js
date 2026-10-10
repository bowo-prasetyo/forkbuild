// Builder stamps (docs/Pillars.md, "What we are not making": facts about
// builds are welcome as credit): each stamp states a fact about this
// device's own builds that crossed a named threshold, such as "a build of
// yours was remixed" or "you entered three challenges". Like an achievement
// (docs/principles/achievements.md), a stamp never says a person is better,
// adds up to no points, levels or score, and is never compared with anyone
// else's. They are worked out on this device from its own records and shown
// only to the builder.
//
// Pure: the caller gathers the facts (application/stamps/BuilderStampFacts.js).

// Each stamp's fact and the counts at which it is earned, lowest first.
export const BUILDER_STAMPS = Object.freeze([
    Object.freeze({ id: 'published', fact: 'publishedBuilds', thresholds: Object.freeze([1, 10, 50]) }),
    Object.freeze({ id: 'remixed', fact: 'remixesByOthers', thresholds: Object.freeze([1, 10, 100]) }),
    Object.freeze({ id: 'remixer', fact: 'remixesMade', thresholds: Object.freeze([1, 10]) }),
    Object.freeze({ id: 'challenger', fact: 'challengesEntered', thresholds: Object.freeze([1, 3, 10]) }),
    Object.freeze({ id: 'bigBuild', fact: 'largestBuildBricks', thresholds: Object.freeze([100, 500, 2000]) }),
    Object.freeze({ id: 'onPlot', fact: 'buildsOnPlots', thresholds: Object.freeze([1, 10]) })
]);

// The stamps `facts` earn, in BUILDER_STAMPS order: `{ id, threshold, count }`
// with the highest threshold reached and the fact's own count. A fact that
// is missing or not a whole number earns nothing.
export function builderStamps(facts = {}) {
    const stamps = [];
    for (const stamp of BUILDER_STAMPS) {
        const count = facts?.[stamp.fact];
        if (!Number.isInteger(count) || count < 1) continue;
        const reached = stamp.thresholds.filter((threshold) => count >= threshold);
        if (reached.length === 0) continue;
        stamps.push(Object.freeze({ id: stamp.id, threshold: reached[reached.length - 1], count }));
    }
    return Object.freeze(stamps);
}

// How many bricks a published build's snapshot places directly (structure
// placements aside): a build's `brickTable` holds six numbers a brick, an
// older one a `bricks` list.
export function snapshotBrickCount(snapshot) {
    let total = 0;
    for (const building of Array.isArray(snapshot?.world?.buildings) ? snapshot.world.buildings : []) {
        const table = building?.brickTable;
        if (table && Array.isArray(table.values)) total += Math.floor(table.values.length / 6);
        else if (Array.isArray(building?.bricks)) total += building.bricks.length;
    }
    return total;
}
