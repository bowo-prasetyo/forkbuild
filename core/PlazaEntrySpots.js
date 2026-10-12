import { PLAZA_CENTER } from './ChallengePlaza.js';
import { SETTLEMENT_TAKEN_RADIUS, settleInVillage } from './BuildSettlement.js';

// Where each of a week's entries stands while someone visits its plaza
// (ui/views/worldView/useChallengePlaza.js). An entry stands in the village
// round the square either way:
//
// - placed in the village (its signed spot within PLAZA_IN_VIEW_RADIUS of the
//   middle), it stands there, drawn as any placed build is, and nothing
//   more is shown;
// - placed further away (a build published before builds settled in the
//   village, on the old grid, or a Build here plot elsewhere), or not placed
//   at all as far as this device knows, it is also shown, as an exhibit, on
//   the spot it would settle on in the village (core/BuildSettlement.js),
//   clear of the placements and of the entries before it. Its own spot
//   never moves: an exhibit is never a placement.
//
// Showing only placed entries' own spots lost the ones placed far away: World
// View draws a placed build only within its streaming radius of the camera,
// so an entry standing hundreds of units off was counted on the plaza and
// seen nowhere near it.
//
// Pure: `entries` in plaza order, as `{ key, publicationId }`; `placedAt`
// maps a publication id to its known position; returns `{ key, position,
// placed }` for each entry that has a spot, `placed` true when it stands
// there itself.

// Within this of the middle a placed build stands in the village, drawn
// whenever the plaza is visited (World View streams builds 150 round the
// camera, which stands near the middle): the first four village rings.
export const PLAZA_IN_VIEW_RADIUS = 120;

export function standsInVillage(position, { center = PLAZA_CENTER } = {}) {
    return Boolean(position)
        && Number.isFinite(position.x) && Number.isFinite(position.z)
        && Math.hypot(position.x - center.x, position.z - center.z) <= PLAZA_IN_VIEW_RADIUS;
}

export function plazaEntrySpots(entries, { placedAt = new Map(), seed = undefined, center = PLAZA_CENTER } = {}) {
    const taken = [...placedAt.values()].filter(Boolean);
    const isTaken = (x, z) => taken.some((spot) => Math.hypot(spot.x - x, spot.z - z) < SETTLEMENT_TAKEN_RADIUS);
    const spots = [];
    for (const { key, publicationId } of entries || []) {
        const standing = placedAt.get(publicationId);
        if (standing && standsInVillage(standing, { center })) {
            spots.push(Object.freeze({ key, position: standing, placed: true }));
            continue;
        }
        const spot = settleInVillage({ publicationId, isTaken, seed, center });
        if (!spot) continue;
        taken.push(spot);
        spots.push(Object.freeze({ key, position: spot, placed: false }));
    }
    return spots;
}
