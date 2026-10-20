import {
    FAIR_WEATHER, WEATHER_SPELL_SECONDS, DRY_SECONDS, spellRain, rainAt, wetnessAt, weatherAt
} from '../core/nature/Weather.js';
import { CreateBrickRegistryUseCase } from '../application/editor/CreateBrickRegistryUseCase.js';
import { WorldNavigationSession } from '../application/world/WorldNavigationSession.js';
import { BrickInstanceRegistry } from '../renderer/BrickInstanceRegistry.js';
import { brickAabb } from '../core/avatar/AvatarCollision.js';
import { indoorCutaway } from '../core/building/IndoorView.js';
import { CoreLibrary } from '../core/library/CoreLibrary.js';
import { VillageLibrary } from '../core/library/VillageLibrary.js';
import { DEFAULT_WORLD_SEED, terrainHeightAt } from '../core/nature/TerrainHeightField.js';
import { assert } from './support/Assert.js';

// Wet ground (core/nature/Weather.js#wetnessAt()): the ground soaks up the rain
// quickly and dries over a few minutes once it stops, the same for everyone
// at the same moment; Always day keeps it dry; and the room the avatar stands
// in stays dry.

const FIRST = Math.floor(1_800_000_000 / WEATHER_SPELL_SECONDS);

// A spell that rains hard, followed by a dry one.
let rainy = FIRST;
while (!(spellRain(rainy) > 0.6 && spellRain(rainy + 1) === 0 && spellRain(rainy - 1) === 0)) rainy++;
const rainStarts = rainy * WEATHER_SPELL_SECONDS;
const rainStops = (rainy + 1) * WEATHER_SPELL_SECONDS;

{
    assert(FAIR_WEATHER.wetness === 0 && wetnessAt(NaN) === 0 && weatherAt(NaN).wetness === 0, 'fair weather, and no clock, is dry');
    let dryAt = FIRST;
    while (spellRain(dryAt) > 0 || spellRain(dryAt - 1) > 0 || spellRain(dryAt - 2) > 0 || spellRain(dryAt + 1) > 0) dryAt++;
    assert(wetnessAt(dryAt * WEATHER_SPELL_SECONDS + 100) < 0.01, 'after a long dry spell the ground is dry');

    // It soaks up the rain quickly.
    let wetBy = null;
    for (let t = rainStarts - 120; t < rainStops; t += 5) {
        if (rainAt(t) > 0 && wetBy === null && wetnessAt(t) > 0.8) wetBy = t;
    }
    const firstDrops = (() => { let t = rainStarts - 120; while (rainAt(t) === 0) t += 1; return t; })();
    assert(wetBy !== null && wetBy - firstDrops < 150, `a downpour soaks the ground within a couple of minutes (${wetBy - firstDrops} s)`);
    assert(Math.abs(weatherAt(rainStarts + 200).wetness - wetnessAt(rainStarts + 200)) < 1e-12, 'every weather says how wet the ground is');

    // And dries slowly once it stops.
    // Rain stops before the clouds clear, ahead of the next spell.
    let lastDrops = rainStops;
    while (rainAt(lastDrops - 1) === 0) lastDrops -= 1;
    const wetAtStop = wetnessAt(lastDrops);
    assert(wetAtStop > 0.9, `soaked when the rain stops (${wetAtStop.toFixed(2)})`);
    const half = wetnessAt(lastDrops + 120);
    assert(half < wetAtStop * 0.5 && half > wetAtStop * 0.3, `half dry within two minutes (${half.toFixed(2)})`);
    assert(wetnessAt(lastDrops + 60) > 0.6, 'but still wet a minute later');
    assert(wetnessAt(lastDrops + 8 * 60) < 0.05, `nearly dry in eight (${wetnessAt(lastDrops + 8 * 60).toFixed(3)})`);
    assert(DRY_SECONDS > 60, 'drying takes minutes');
    console.log(`✓ the ground soaks up rain in ${wetBy - firstDrops} s and dries over a few minutes`);
}

// The same answer however it is asked, and no jumps from moment to moment,
// across spells too.
{
    const t = rainStops + 95.5;
    const fresh = wetnessAt(t);
    wetnessAt(rainStarts - 3000);
    wetnessAt(t - 1);
    assert(wetnessAt(t) === fresh, 'followed on or worked out afresh, the same wetness');
    let worst = 0;
    let previous = wetnessAt(rainStarts - 2 * WEATHER_SPELL_SECONDS);
    for (let s = rainStarts - 2 * WEATHER_SPELL_SECONDS; s < rainStops + 3 * WEATHER_SPELL_SECONDS; s += 1) {
        const now = wetnessAt(s);
        worst = Math.max(worst, Math.abs(now - previous));
        previous = now;
    }
    assert(worst < 0.04, `the ground soaks and dries smoothly (${worst.toFixed(4)} in a second at most)`);
    console.log('✓ the same wetness for everyone, changing smoothly');
}

// The session: wet with the world, dry in Always day.
{
    const nav = new WorldNavigationSession({ registry: new CreateBrickRegistryUseCase().execute(), wildlifeClock: () => rainStops - 200 });
    assert(nav.weather().wetness > 0.8, 'the session\'s weather is wet in the rain');
    nav.setAlwaysDay(true);
    assert(nav.weather().wetness === 0, 'Always day keeps it dry');
    console.log('✓ the session is wet with the world, and Always day keeps it dry');
}

// The room the avatar stands in stays dry: the shelter carries the underside
// of its roof; and the bricks soak with one number.
{
    const definitions = new Map(CoreLibrary.definitions.map((definition) => [definition.id, definition]));
    const house = VillageLibrary.structures.find((candidate) => candidate.id === 'village:house');
    const boxes = house.bricks.map((brick) => brickAabb(brick.position, definitions.get(brick.definitionId), brick.rotation, brick.tilt));
    const nav = new WorldNavigationSession({ registry: new CreateBrickRegistryUseCase().execute(), wildlifeClock: () => 0 });
    const shelters = [];
    nav._session = { setRainShelter: (s) => shelters.push(s), setCutaway() {} };
    nav._indoorBoxesNear = () => boxes;
    nav._followIndoors({ position: { x: 0, y: 0.25, z: -2 }, rotation: { y: 0 } });
    const cutaway = indoorCutaway({ x: 0, y: 0.25, z: -2 }, boxes);
    const groundY = terrainHeightAt(DEFAULT_WORLD_SEED, 0, -2);
    const shelter = shelters[shelters.length - 1];
    assert(Math.abs(shelter.ceiling - (cutaway.ceiling + groundY)) < 1e-9 && shelter.ceiling <= shelter.top,
        'the shelter carries the underside of the roof, lifted onto the ground');

    const registry = new BrickInstanceRegistry({ add() {}, remove() {} });
    assert(registry.wetness === 0, 'bricks start dry');
    registry.setWetness(0.7);
    assert(registry.wetness === 0.7, 'and soak with one number');
    registry.setWetness(5);
    assert(registry.wetness === 1, 'never wetter than soaked');
    registry.setWetShelter(shelter);
    registry.setWetShelter(null);
    console.log('✓ the room you stand in stays dry, and bricks soak with one number');
}
