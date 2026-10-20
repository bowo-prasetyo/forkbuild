import { PLAZA_CENTER } from './ChallengePlaza.js';
import { SETTLEMENT_TAKEN_RADIUS, settleInVillage } from './BuildSettlement.js';

// Where each of a week's entries stands while someone visits its plaza
// (ui/views/worldView/useChallengePlaza.js). Only that week's entries stand
// round the square, and each stands there either way:
//
// - placed in the village (its signed spot within PLAZA_IN_VIEW_RADIUS of the
//   middle: builds published while builds still settled round the plaza,
//   from 2026-10-12), it stands there, drawn as any placed build is, and
//   nothing more is shown;
// - placed anywhere else (on the id-keyed grid, where builds are placed when
//   published, or on a Build here plot), or not placed at all as far as this
//   device knows, it is shown, as an exhibit, on the spot it would settle on
//   round the square (core/challenge/BuildSettlement.js), clear of the other entries.
//   Its own spot never moves: an exhibit is never a placement.
//
// Other placed builds near the square, from other weeks or none, are left
// out of World View while the plaza is visited (PLAZA_QUIET_RADIUS), so the
// square shows its week alone.
//
// Pure: `entries` in plaza order, as `{ key, publicationId }`; `placedAt`
// maps an entry's publication id to its known position (only the week's
// entries: the builds left out don't take a spot); returns `{ key, position,
// placed }` for each entry that has a spot, `placed` true when it stands
// there itself.

// Within this of the middle a placed build stands in the village, drawn
// whenever the plaza is visited (World View streams builds 150 round the
// camera, which stands near the middle): the first four village rings.
export const PLAZA_IN_VIEW_RADIUS = 120;

// While a plaza is visited, placed builds within this of the middle that
// aren't the week's entries are left out of World View: on screen only,
// their placements untouched. World View's streaming radius
// (application/worldNavigation/constants.js), so a camera in the square sees
// none of them; the id-keyed grid starts further off (x >= 0, 170 from the
// middle), so no grid placement is ever left out.
export const PLAZA_QUIET_RADIUS = 150;

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
