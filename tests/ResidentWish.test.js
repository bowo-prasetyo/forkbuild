import {
    RESIDENT_WISH, RESIDENT_WISH_STARTER, OPEN_GROUND_DISTANCE, WISH_CLEAR_RADIUS, WISH_SEARCH_RADIUS,
    residentWishNear, phraseWish, wishBuildLabel, isWishTurn
} from '../core/world/ResidentWish.js';
import { describeWhere } from '../core/world/ResidentTalk.js';
import { VillageLibrary } from '../core/library/VillageLibrary.js';
import { DEFAULT_WORLD_SEED, terrainHeightAt } from '../core/nature/TerrainHeightField.js';
import { HIGHLAND_ELEVATION } from '../core/nature/TerrainSurface.js';
import { hydrologyFeatureAt, HYDROLOGY_FEATURE } from '../core/nature/Hydrology.js';
import { isResidentGroundAt } from '../core/world/ResidentPath.js';
import { displayText } from '../ui/i18n/i18n.js';
import { assert } from './support/Assert.js';

// What a World Resident wonders the ground nearby has never had
// (core/world/ResidentWish.js): a statement about a real spot, with a ready-made
// Village structure to start from there. Never a task: nothing here keeps,
// tracks or rewards anything.

const SEED = DEFAULT_WORLD_SEED;
const near = (x, z) => residentWishNear({ seed: SEED, position: { x, z }, homePosition: { x: x - 3, z } });

// Spots on the default World where each kind of ground is (found by scanning it).
const RIVERSIDE = { x: -600, z: -600 };
const LAKESIDE = { x: -600, z: 66 };
const HILLSIDE = { x: -600, z: 473 };
const OPEN = { x: -600, z: 177 };

// Every wish starts from a structure the Village library has.
{
    for (const wish of Object.values(RESIDENT_WISH)) {
        const id = RESIDENT_WISH_STARTER[wish];
        assert(VillageLibrary.structures.some((structure) => structure.id === id), `${wish} starts from ${id}, a Village structure`);
    }
    console.log('✓ every wish starts from a Village structure');
}

// Water first, then high ground, then open ground, each pointing at a real spot.
{
    const bridge = near(RIVERSIDE.x, RIVERSIDE.z);
    assert(bridge && bridge.wish === RESIDENT_WISH.BRIDGE && bridge.structureId === 'village:bridge', `by a river, a bridge (got ${bridge && bridge.wish})`);
    assert(hydrologyFeatureAt(SEED, bridge.spot.x, bridge.spot.z) === HYDROLOGY_FEATURE.RIVER, '...pointing at the river');
    assert(Math.hypot(bridge.spot.x - RIVERSIDE.x, bridge.spot.z - RIVERSIDE.z) <= WISH_SEARCH_RADIUS + 1e-9, '...within reach');

    const dock = near(LAKESIDE.x, LAKESIDE.z);
    const water = dock && hydrologyFeatureAt(SEED, dock.spot.x, dock.spot.z);
    assert(dock && dock.wish === RESIDENT_WISH.DOCK && (water === HYDROLOGY_FEATURE.LAKE || water === HYDROLOGY_FEATURE.SEA),
        `by still water, a dock on it (got ${dock && dock.wish}, ${water})`);

    const lookout = near(HILLSIDE.x, HILLSIDE.z);
    assert(lookout && lookout.wish === RESIDENT_WISH.LOOKOUT, `near high ground, a lookout (got ${lookout && lookout.wish})`);
    assert(terrainHeightAt(SEED, lookout.spot.x, lookout.spot.z) >= HIGHLAND_ELEVATION && isResidentGroundAt(SEED, lookout.spot.x, lookout.spot.z),
        '...on dry high ground');

    const open = near(OPEN.x, OPEN.z);
    assert(open && [RESIDENT_WISH.WELL, RESIDENT_WISH.PAVILION, RESIDENT_WISH.MARKET_STALL, RESIDENT_WISH.COTTAGE].includes(open.wish),
        `on open ground, something open ground lacks (got ${open && open.wish})`);
    const home = { x: OPEN.x - 3, z: OPEN.z };
    assert(Math.abs(Math.hypot(open.spot.x - home.x, open.spot.z - home.z) - OPEN_GROUND_DISTANCE) < 1e-9 && open.spot.x > OPEN.x,
        '...on the far side from home, past where it walks');
    assert(isResidentGroundAt(SEED, open.spot.x, open.spot.z), '...on dry ground');
    console.log('✓ a river wants a bridge, still water a dock, high ground a lookout, open ground something of its own');
}

// The same ground gives the same wish to everyone; a spot already built on gives none.
{
    assert(JSON.stringify(near(OPEN.x, OPEN.z)) === JSON.stringify(near(OPEN.x, OPEN.z)), 'the same inputs give the same wish');
    const open = near(OPEN.x, OPEN.z);
    const built = residentWishNear({ seed: SEED, position: OPEN, homePosition: { x: OPEN.x - 3, z: OPEN.z },
        builtPositions: [{ x: open.spot.x + WISH_CLEAR_RADIUS / 2, z: open.spot.z }] });
    assert(built === null, 'a spot with a build beside it has nothing to wish for');
    const farBuilt = residentWishNear({ seed: SEED, position: OPEN, homePosition: { x: OPEN.x - 3, z: OPEN.z },
        builtPositions: [{ x: open.spot.x + WISH_CLEAR_RADIUS * 3, z: open.spot.z }] });
    assert(farBuilt && farBuilt.wish === open.wish, 'a build farther off changes nothing');
    assert(residentWishNear({ seed: SEED, position: null }) === null && residentWishNear() === null, 'no position, no wish');
    console.log('✓ wishes are the same for everyone, and never for a spot already built on');
}

// Said as a statement, with a button to start it; every third conversation, or when quiet.
{
    for (const wish of Object.values(RESIDENT_WISH)) {
        const said = displayText(phraseWish({ wish }, describeWhere({ distance: 30, direction: 'E' })));
        assert(!said.startsWith('resident.') && said.includes('30 m') && said.endsWith('.') && !said.includes('?'),
            `${wish}: a statement saying where (got "${said}")`);
        const label = displayText(wishBuildLabel({ wish }));
        assert(label.startsWith('Build a') && label.endsWith('there'), `${wish}: its button builds it there (got "${label}")`);
    }
    assert(phraseWish({ wish: 'castle' }, null) === null && wishBuildLabel(null) === null, 'an unknown wish says nothing');
    assert([0, 1, 2, 3, 4, 5].map((turn) => isWishTurn(turn)).join() === 'false,false,true,false,false,true', 'every third conversation');
    assert(isWishTurn(0, { quiet: true }) === true, '...and whenever it has nothing else to say');
    console.log('✓ a wish is a statement with a Build there button, every third conversation or when quiet');
}
