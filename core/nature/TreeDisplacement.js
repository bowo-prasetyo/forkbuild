// Where people have built, wild trees give way: no trunk grows up through a
// floor, a wall or a bridge deck. Whether a tree (core/nature/NaturalFeatureField.js)
// is displaced by what is built where it stands.
//
// A tree's place is a pure function of the World's seed, and builds go
// wherever their builder puts them, so the two can meet. A tree whose trunk
// overlaps the footprint of any brick, at any height, is simply not there:
// it is not drawn and nothing bumps into it, the posture wild animals take
// (core/nature/WildlifeDisplacement.js). Every replica that has loaded the
// same Worlds leaves out the same trees. Building over a tree takes it away;
// removing the build brings it back.
//
// And every build stands in a clearing (docs/Pillars.md, "The World is a
// diorama, not a simulation"): no tree grows within BUILD_CLEARING of any of
// its bricks, so a build reads as a place, not a thing hidden in a wood, and
// "Walk inside it" sees the door with no trunk or crown in between
// (tests/BuildClearing.test.js works out how wide that has to be from the
// trees' own shapes and the arrival camera).
//
// Pure: a tree's trunk and boxes in, a yes or no out. Which boxes stand near
// a tree is the caller's question (application/world/TreeDisplacement.js).

// How far round a build's bricks no tree grows, from the edge of any brick's
// footprint to the edge of the trunk.
export const BUILD_CLEARING = 15;

// Whether the tree whose trunk is `circle` ({ center: { x, z }, radius },
// core/nature/TreeCollisionGeometry.js#treeCollisionCircleFor()) is displaced by
// any of `boxes` ({ min: { x, z }, max: { x, z } } each, a brick's
// collision box in shared space): one whose trunk comes within `clearing` of
// a footprint (0: one whose footprint the trunk overlaps). Touching edges do
// not count.
export function isTreeDisplaced(circle, boxes, clearing = 0) {
    if (!circle || !circle.center || !boxes || boxes.length === 0) return false;
    const { x, z } = circle.center;
    const radius = circle.radius + Math.max(0, Number(clearing) || 0);
    for (const box of boxes) {
        if (!box || !box.min || !box.max) continue;
        const dx = x - Math.max(box.min.x, Math.min(x, box.max.x));
        const dz = z - Math.max(box.min.z, Math.min(z, box.max.z));
        if (dx * dx + dz * dz < radius * radius) return true;
    }
    return false;
}
