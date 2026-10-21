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
// Pure: a tree's trunk and boxes in, a yes or no out. Which boxes stand near
// a tree is the caller's question (application/world/TreeDisplacement.js).

// Whether the tree whose trunk is `circle` ({ center: { x, z }, radius },
// core/nature/TreeCollisionGeometry.js#treeCollisionCircleFor()) is displaced by
// any of `boxes` ({ min: { x, z }, max: { x, z } } each, a brick's
// collision box in shared space): one whose footprint the trunk overlaps.
// Touching edges do not count.
export function isTreeDisplaced(circle, boxes) {
    if (!circle || !circle.center || !boxes || boxes.length === 0) return false;
    const { x, z } = circle.center;
    const radius = circle.radius;
    for (const box of boxes) {
        if (!box || !box.min || !box.max) continue;
        const dx = x - Math.max(box.min.x, Math.min(x, box.max.x));
        const dz = z - Math.max(box.min.z, Math.min(z, box.max.z));
        if (dx * dx + dz * dz < radius * radius) return true;
    }
    return false;
}
