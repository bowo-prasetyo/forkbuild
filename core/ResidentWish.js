// What a World Resident sometimes wonders aloud about: something the ground
// near it has never had (a bridge over the river, a dock on the water, a
// lookout on the high ground, a well or a stall on open ground), with the
// spot it means. The viewer may choose to start that build there (World
// View's Build there); nothing else follows from it.
//
// A wish is a statement of what isn't there, never a task (see
// docs/principles/vehicles.md, "A Resident May Wonder What's Missing, Never
// Ask For It"): no reward, nothing tracked or remembered, no check whether it
// was ever built, and the same ground gives the same wish to everyone.
//
// Pure: no clock, no session, no randomness — the same seed and positions
// always give the same wish.
import { message } from './Message.js';
import { hydrologyFeatureAt, HYDROLOGY_FEATURE } from './Hydrology.js';
import { terrainHeightAt } from './TerrainHeightField.js';
import { HIGHLAND_ELEVATION } from './TerrainSurface.js';
import { isResidentGroundAt } from './ResidentPath.js';

export const RESIDENT_WISH = Object.freeze({
    BRIDGE: 'bridge',
    DOCK: 'dock',
    LOOKOUT: 'lookout',
    WELL: 'well',
    PAVILION: 'pavilion',
    MARKET_STALL: 'marketStall',
    COTTAGE: 'cottage'
});

// The Village structure each wish starts from (core/library/VillageLibrary.js).
export const RESIDENT_WISH_STARTER = Object.freeze({
    [RESIDENT_WISH.BRIDGE]: 'village:bridge',
    [RESIDENT_WISH.DOCK]: 'village:dock',
    [RESIDENT_WISH.LOOKOUT]: 'village:watchtower',
    [RESIDENT_WISH.WELL]: 'village:well',
    [RESIDENT_WISH.PAVILION]: 'village:pavilion',
    [RESIDENT_WISH.MARKET_STALL]: 'village:market_stall',
    [RESIDENT_WISH.COTTAGE]: 'village:cottage'
});

// What open, dry ground can lack, taken in turn by where the spot is.
const OPEN_GROUND_WISHES = Object.freeze([
    RESIDENT_WISH.WELL,
    RESIDENT_WISH.PAVILION,
    RESIDENT_WISH.MARKET_STALL,
    RESIDENT_WISH.COTTAGE
]);

// How far a resident looks for water and high ground.
export const WISH_SEARCH_RADIUS = 40;
const SEARCH_STEP = 4;
const SEARCH_DIRECTIONS = 16;
// How far from home an open-ground wish points: past where the resident
// walks (core/ResidentMotion.js, 6) and the build it lives by.
export const OPEN_GROUND_DISTANCE = 14;
// A spot with a build or structure this close already has something.
export const WISH_CLEAR_RADIUS = 10;

function isBuiltNear(spot, builtPositions) {
    return (builtPositions || []).some((built) => built
        && Number.isFinite(built.x) && Number.isFinite(built.z)
        && Math.hypot(built.x - spot.x, built.z - spot.z) < WISH_CLEAR_RADIUS);
}

// Points around `position`, nearest ring first, each ring starting due north
// and going clockwise, so the nearest match is found first and ties go the
// same way on every device.
function* ringPoints(position) {
    for (let radius = SEARCH_STEP; radius <= WISH_SEARCH_RADIUS; radius += SEARCH_STEP) {
        for (let step = 0; step < SEARCH_DIRECTIONS; step += 1) {
            const angle = (2 * Math.PI * step) / SEARCH_DIRECTIONS;
            yield { x: position.x + radius * Math.sin(angle), z: position.z - radius * Math.cos(angle) };
        }
    }
}

// A small whole-number hash of a spot's 50 m cell, so neighbouring residents
// on the same open ground wish for the same thing.
function cellHash(spot) {
    const cx = Math.floor(spot.x / 50);
    const cz = Math.floor(spot.z / 50);
    let h = (cx * 73856093) ^ (cz * 19349663);
    h = Math.imul(h ^ (h >>> 13), 0x5bd1e995);
    return (h ^ (h >>> 15)) >>> 0;
}

// What the ground near a resident standing at `position` ({ x, z }) lacks:
// { wish, structureId, spot: { x, z } }, or null when it has nothing to wish
// for (the spot is already built on, or under water).
//
//   seed            — the World seed (terrain and water)
//   homePosition    — where the resident lives ({ x, z }); an open-ground
//                     wish points away from it
//   builtPositions  — [{ x, z }]: builds, structures and loaded Worlds near
//                     it, in shared space
//
// Water comes first (a river wants a bridge, a lake or the sea a dock), then
// high ground (a lookout), then open ground.
export function residentWishNear({ seed, position, homePosition = null, builtPositions = [] } = {}) {
    if (!position || !Number.isFinite(position.x) || !Number.isFinite(position.z)) return null;
    const found = (wish, spot) => (isBuiltNear(spot, builtPositions)
        ? null
        : { wish, structureId: RESIDENT_WISH_STARTER[wish], spot: { x: spot.x, z: spot.z } });

    let river = null;
    let water = null;
    let high = null;
    for (const point of ringPoints(position)) {
        const feature = hydrologyFeatureAt(seed, point.x, point.z);
        if (feature === HYDROLOGY_FEATURE.RIVER) {
            if (!river) river = point;
        } else if (feature === HYDROLOGY_FEATURE.LAKE || feature === HYDROLOGY_FEATURE.SEA) {
            if (!water) water = point;
        } else if (!high && terrainHeightAt(seed, point.x, point.z) >= HIGHLAND_ELEVATION && isResidentGroundAt(seed, point.x, point.z)) {
            high = point;
        }
        if (river) break;
    }
    if (river) return found(RESIDENT_WISH.BRIDGE, river);
    if (water) return found(RESIDENT_WISH.DOCK, water);
    if (high) return found(RESIDENT_WISH.LOOKOUT, high);

    // Open ground, on the far side from home (due east when it lives right here).
    const home = homePosition && Number.isFinite(homePosition.x) && Number.isFinite(homePosition.z) ? homePosition : position;
    const dx = position.x - home.x;
    const dz = position.z - home.z;
    const length = Math.hypot(dx, dz);
    const unit = length > 0.5 ? { x: dx / length, z: dz / length } : { x: 1, z: 0 };
    const spot = { x: home.x + unit.x * OPEN_GROUND_DISTANCE, z: home.z + unit.z * OPEN_GROUND_DISTANCE };
    if (!isResidentGroundAt(seed, spot.x, spot.z)) return null;
    return found(OPEN_GROUND_WISHES[cellHash(spot) % OPEN_GROUND_WISHES.length], spot);
}

// What the resident says about it: one sentence (a message) with where the
// spot is, `where` being core/ResidentTalk.js's own "about 30 m to the east".
export function phraseWish(wish, where) {
    return wish && Object.values(RESIDENT_WISH).includes(wish.wish)
        ? message(`resident.wish.${wish.wish}`, { where })
        : null;
}

// The words on the button that starts it ("Build a bridge there").
export function wishBuildLabel(wish) {
    return wish && Object.values(RESIDENT_WISH).includes(wish.wish)
        ? message(`resident.wishBuild.${wish.wish}`)
        : null;
}

// On which conversations a resident wonders aloud: every third one, and
// whenever it has nothing else to say.
export const WISH_EVERY_TURNS = 3;

export function isWishTurn(turn, { quiet = false } = {}) {
    const index = Math.max(0, Math.floor(Number.isFinite(turn) ? turn : 0));
    return quiet || index % WISH_EVERY_TURNS === WISH_EVERY_TURNS - 1;
}
