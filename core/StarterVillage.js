import { SpatialBounds } from './SpatialBounds.js';
import { PLAZA_CENTER, PLAZA_VILLAGE_RADIUS, layoutPlazaExhibits, plazaFootprint } from './ChallengePlaza.js';

// The village at the challenge plaza (docs/reviews/CreativeDirection-2026-10-12b.md,
// finding 1): the square and the ready-made builds round it stand in the
// shared World for everyone, in every World View, the way its terrain and
// trees do. They are the World's own content: the same on every device,
// signed by nobody, never a placement, never stored. While a week's plaza is
// visited, its entries are shown in rings just outside them
// (core/PlazaEntrySpots.js).
//
// Pure: where each ready-made build stands, from its bricks.

// Each ready-made build's spot: `{ structureId, position, footprint, middle }`,
// `position` where the build's own origin goes and `middle` the middle of
// its footprint in the World. Laid out like the plaza's exhibits, round the
// open square in the order given.
export function starterVillageLayout(structures, brickRegistry, { center = PLAZA_CENTER } = {}) {
    const items = (structures || [])
        .filter((structure) => structure && structure.bricks.length > 0)
        .map((structure) => ({ key: structure.id, footprint: plazaFootprint(SpatialBounds.fromBricks(structure.bricks, brickRegistry)) }));
    const footprints = new Map(items.map(({ key, footprint }) => [key, footprint]));
    return layoutPlazaExhibits(items, { center }).map(({ key, position }) => {
        const footprint = footprints.get(key);
        return Object.freeze({
            structureId: key,
            position,
            footprint,
            middle: Object.freeze({
                x: position.x + (footprint.minX + footprint.maxX) / 2,
                y: position.y,
                z: position.z + (footprint.minZ + footprint.maxZ) / 2
            })
        });
    });
}

// How far from the plaza's middle the village's ready-made builds reach: the
// furthest footprint corner. Kept inside PLAZA_VILLAGE_RADIUS, so no
// entry is shown on them.
export function starterVillageReach(layout, { center = PLAZA_CENTER } = {}) {
    let reach = 0;
    for (const { position, footprint } of layout || []) {
        for (const x of [footprint.minX, footprint.maxX]) {
            for (const z of [footprint.minZ, footprint.maxZ]) {
                reach = Math.max(reach, Math.hypot(position.x + x - center.x, position.z + z - center.z));
            }
        }
    }
    return reach;
}

export { PLAZA_VILLAGE_RADIUS };
