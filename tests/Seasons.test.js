import * as THREE from 'three';
import { DAY_CYCLE_SECONDS, MOON_CYCLE_DAYS, moonPhaseAt } from '../core/DayCycle.js';
import {
    SEASON,
    SEASONS,
    SEASON_DAYS,
    SEASON_SECONDS,
    WORLD_YEAR_DAYS,
    WORLD_YEAR_SECONDS,
    seasonAt,
    seasonBoundsAt,
    seasonLookAt,
    seasonLookAtYearDay,
    seasonLookOf,
    snowShareAt,
    yearDayAt
} from '../core/Season.js';
import {
    FAIR_WEATHER,
    WEATHER_SPELL_SECONDS,
    fairWeatherIn,
    precipitationAt,
    rainAt,
    snowAt,
    snowCoverAt,
    spellSeason,
    weatherAt,
    weatherInSeason
} from '../core/Weather.js';
import { thunderBetween } from '../core/Storms.js';
import { groundCoverAt, ecologyZoneAt, ECOLOGY_ZONE } from '../core/TerrainEcology.js';
import { DEFAULT_WORLD_SEED } from '../core/TerrainHeightField.js';
import { TERRAIN_TILE_SIZE } from '../core/TerrainTiling.js';
import { naturalFeaturesInRegion, FEATURE_TYPE, TREE_SPECIES } from '../core/NaturalFeatureField.js';
import { ambientMixAt, ambientMixInSeason, AMBIENT_LAYER } from '../core/AmbientSoundscape.js';
import {
    DECIDUOUS, TREE_PART, createSeasonSurfaces, makeSeasonalGround, makeSeasonalTree, seasonedTreeColour, setSeason, setTreeSeasonFlags, treeNumbers, treeSeasonFlags, treeSeasonOf
} from '../renderer/SeasonalSurfaces.js';
import { createWetSurfaces, makeWet, setSnowCover } from '../renderer/WetSurfaces.js';
import { Drift, DRIFT } from '../renderer/SeasonDrift.js';
import { TreeForest } from '../renderer/TreeForest.js';
import { WorldViewSeasonStore } from '../application/settings/WorldViewSeasonStore.js';
import { CreateBrickRegistryUseCase } from '../application/editor/CreateBrickRegistryUseCase.js';
import { WorldNavigationSession } from '../application/world/WorldNavigationSession.js';
import { InMemoryStorageProvider } from './support/InMemoryStorageProvider.js';
import { assert } from './support/Assert.js';

// World View's seasons (core/Season.js): a world year of 32 of its days, a
// season to each turn of the moon, worked out from the clock alone; how the
// land looks through it; winter's snow falling and lying (core/Weather.js);
// the renderer's side of it; and a device keeping one season.

const YEAR = WORLD_YEAR_SECONDS;
// The start of some world year, well into the future.
const YEAR_START = Math.ceil(1_800_000_000 / YEAR) * YEAR;
const inYear = (day) => YEAR_START + day * DAY_CYCLE_SECONDS;

// A 32-day year, four seasons of eight days, each a turn of the moon.
{
    assert(WORLD_YEAR_DAYS === 32 && SEASON_DAYS === 8 && SEASON_DAYS === MOON_CYCLE_DAYS, 'a 32-day year, a season to each turn of the moon');
    assert(SEASON_SECONDS === 8 * DAY_CYCLE_SECONDS && YEAR === 4 * SEASON_SECONDS, 'its length in seconds');
    assert(SEASONS.join() === 'SPRING,SUMMER,AUTUMN,WINTER', 'in the year\'s order');
    assert(YEAR % WEATHER_SPELL_SECONDS === 0 && SEASON_SECONDS % WEATHER_SPELL_SECONDS === 0, 'a whole number of weather spells to a season');
    assert(YEAR % (24 * 3600) !== 0, 'a year doesn\'t divide a real day, so the seasons go round any hour of play');
    console.log('✓ a 32-day year of four eight-day seasons');
}

// The season follows the clock: the same for everyone, each starting at dawn
// on the day of a new moon, and round again every year.
{
    for (let s = 0; s < 4; s++) {
        const start = inYear(s * SEASON_DAYS);
        assert(seasonAt(start) === SEASONS[s], `${SEASONS[s]} starts on day ${s * SEASON_DAYS}`);
        assert(seasonAt(start - 1) === SEASONS[(s + 3) % 4], 'the season before ends just before');
        assert(seasonAt(start + YEAR) === SEASONS[s] && seasonAt(start - 7 * YEAR) === SEASONS[s], 'every year the same');
        // Dawn: the start of a day of World View's day and night.
        assert(start % DAY_CYCLE_SECONDS === 0, 'a season starts at dawn');
        // That night's moon is new.
        assert(moonPhaseAt(start + 0.8 * DAY_CYCLE_SECONDS).name === 'newMoon', 'on the day whose night brings a new moon');
        const bounds = seasonBoundsAt(start + 1000);
        assert(bounds.start === start && bounds.end === start + SEASON_SECONDS, 'its bounds');
    }
    assert(Math.abs(yearDayAt(inYear(13.25)) - 13.25) < 1e-9, 'the day of the year');
    assert(yearDayAt(NaN) === 12 && seasonAt(NaN) === SEASON.SUMMER, 'no clock is high summer');
    assert(seasonLookAt(inYear(5.4321)) === seasonLookAt(inYear(5.4321) + 0.5), 'the same moment, the same look');
    console.log('✓ the season follows the clock, starting with each new moon');
}

// What each season shows.
{
    const look = (day) => seasonLookAtYearDay(day);
    // Spring: blossom, then the trees coming into fresh leaf, and flowers.
    assert(look(2.5).blossom === 1 && look(2.5).fresh === 1 && look(2.5).leaves < 1 && look(2.5).petalDrift === 1, 'spring blossoms, in fresh leaf');
    assert(look(5.5).flowers === 1 && look(5.5).leaves === 1, 'late spring is in full leaf, with flowers in the grass');
    assert(look(0.2).leaves < look(2.5).leaves && look(2.5).leaves < look(5.5).leaves, 'the leaves come out through spring');
    // Summer: lush and green, and the crops and fruit ripen.
    assert(look(10).leaves === 1 && look(10).autumn === 0 && look(10).groundSaturation > 1, 'high summer is lush and green');
    assert(look(14.5).fruit === 1 && look(14.5).fieldColor[0] > look(10).fieldColor[0] && look(14.5).fieldColor[1] > look(10).fieldColor[1], 'late summer\'s fruit and golden fields');
    // Autumn: leaves turn, then fall.
    assert(look(20).autumn === 1 && look(20).leafDrift > 0.5, 'autumn\'s leaves turn and blow about');
    assert(look(17).autumn < look(20).autumn && look(22.5).leaves < look(20).leaves && look(22.5).leafDrift === 1, 'they turn, then fall');
    // Winter: bare trees, a dull, greyer ground, snow.
    assert(look(27).leaves === 0 && look(27).groundSaturation < 0.6 && look(27).snowCover > 0.8, 'winter is bare and snowy');
    assert(look(27).insects === 0 && look(27).birds < look(5.5).birds, 'and hushed');
    // Continuous all round the year, the end of winter into spring too.
    for (let d = 0; d < WORLD_YEAR_DAYS; d += 0.05) {
        const a = look(d);
        const b = look(d + 0.05);
        for (const key of ['leaves', 'fresh', 'blossom', 'autumn', 'fruit', 'flowers', 'groundSaturation', 'fieldAmount', 'snowCover']) {
            assert(Math.abs(a[key] - b[key]) < 0.06, `${key} changes a little each day (day ${d.toFixed(2)})`);
        }
    }
    assert(look(WORLD_YEAR_DAYS - 0.001).leaves - look(0).leaves < 0.01, 'winter runs into spring without a jump');
    assert(Object.isFrozen(look(3)) && Object.isFrozen(look(3).groundGrade), 'a frozen look');
    for (const season of SEASONS) {
        assert(seasonLookOf(season).season === season, `${season} kept is ${season}`);
    }
    assert(seasonLookOf('MONSOON').season === SEASON.SUMMER, 'anything else, summer');
    console.log('✓ blossom, lush summer, autumn colours and winter\'s bare trees');
}

// The weather through the year: snow only in winter, never rain; summer the
// sunniest; over the year, the shares there always were.
{
    const counts = Object.fromEntries(SEASONS.map((s) => [s, { spells: 0, fair: 0, rain: 0, snow: 0 }]));
    const firstSpell = YEAR_START / WEATHER_SPELL_SECONDS;
    const years = 25;
    for (let spell = firstSpell; spell < firstSpell + years * YEAR / WEATHER_SPELL_SECONDS; spell++) {
        const mid = spell * WEATHER_SPELL_SECONDS + 150;
        const season = spellSeason(spell);
        assert(season === seasonAt(mid), 'a spell falls wholly in its season');
        const c = counts[season];
        c.spells++;
        if (weatherAt(mid).cloudCover < 0.3) c.fair++;
        if (rainAt(mid) > 0) c.rain++;
        if (snowAt(mid) > 0) c.snow++;
    }
    assert(counts.WINTER.rain === 0 && counts.WINTER.snow > counts.WINTER.spells * 0.1, `winter snows, never rains (${JSON.stringify(counts.WINTER)})`);
    for (const season of [SEASON.SPRING, SEASON.SUMMER, SEASON.AUTUMN]) {
        assert(counts[season].snow === 0 && counts[season].rain > 0, `${season} rains, never snows`);
    }
    const share = (season, key) => counts[season][key] / counts[season].spells;
    assert(share(SEASON.SUMMER, 'fair') > share(SEASON.SPRING, 'fair') && share(SEASON.SUMMER, 'rain') < share(SEASON.SPRING, 'rain'), 'summer is the sunniest');
    const total = SEASONS.reduce((sum, s) => sum + counts[s].spells, 0);
    const fair = SEASONS.reduce((sum, s) => sum + counts[s].fair, 0) / total;
    const falls = SEASONS.reduce((sum, s) => sum + counts[s].rain + counts[s].snow, 0) / total;
    assert(fair > 0.55 && fair < 0.65, `about three spells in five fair over the year (${fair.toFixed(3)})`);
    assert(falls > 0.09 && falls < 0.16, `about one in eight rains or snows (${falls.toFixed(3)})`);
    // What falls is split, never lost: rain and snow make up the precipitation.
    for (let t = YEAR_START + 3 * SEASON_SECONDS - 600; t < YEAR_START + 3 * SEASON_SECONDS + 600; t += 7) {
        assert(Math.abs(rainAt(t) + snowAt(t) - precipitationAt(t)) < 1e-12, 'rain and snow are what falls');
    }
    assert(snowShareAt(inYear(20)) === 0 && snowShareAt(inYear(28)) === 1 && snowShareAt(inYear(2)) === 0, 'snow in winter only');
    const turning = snowShareAt(YEAR_START + 3 * SEASON_SECONDS - 60);
    assert(turning > 0 && turning < 1, 'rain turns to snow as winter comes, over a minute or two');
    console.log('✓ snow only in winter, the sunniest summer, the year\'s weather as before');
}

// Snow lies: it builds up as it snows, lasts from one snowfall to the next
// through winter, and melts away soon after.
{
    const winterStart = YEAR_START + 3 * SEASON_SECONDS;
    let snowing = null;
    for (let t = winterStart; t < winterStart + SEASON_SECONDS && snowing === null; t += 60) {
        if (snowAt(t) > 0.5 && snowAt(t + 240) > 0.5) snowing = t;
    }
    assert(snowing !== null, 'setup: a heavy snowfall this winter');
    const before = snowCoverAt(snowing);
    const after = snowCoverAt(snowing + 240);
    assert(after > before && after > 0.5, `it builds up as it snows (${before.toFixed(2)} to ${after.toFixed(2)})`);
    let stopped = snowing + 240;
    while (snowAt(stopped) > 0 && stopped < winterStart + SEASON_SECONDS) stopped += 30;
    if (stopped + 1200 < winterStart + SEASON_SECONDS && snowAt(stopped + 1200) === 0 && rainAt(stopped + 1200) === 0) {
        const lying = snowCoverAt(stopped);
        const later = snowCoverAt(stopped + 1200);
        assert(later < lying && later > lying * 0.5, `in winter it melts slowly (${lying.toFixed(2)} to ${later.toFixed(2)})`);
    }
    assert(snowCoverAt(winterStart - 600) === 0, 'none lies before winter');
    assert(snowCoverAt(inYear(4)) === 0 && snowCoverAt(inYear(12)) === 0, 'none in spring or summer');
    let mostAtWinterEnd = 0;
    for (let t = YEAR + YEAR_START - 1200; t < YEAR + YEAR_START; t += 60) mostAtWinterEnd = Math.max(mostAtWinterEnd, snowCoverAt(t));
    assert(snowCoverAt(YEAR + YEAR_START + 50 * 60) < Math.max(0.05, mostAtWinterEnd * 0.05), 'it melts away soon after spring comes');
    // Followed from the clock: the same however it is reached.
    const t = winterStart + 2.5 * 3600 + 17;
    const forward = snowCoverAt(t);
    snowCoverAt(winterStart + 100);
    assert(Math.abs(snowCoverAt(t) - forward) < 1e-12, 'the same snow, followed or worked out afresh');
    // weatherAt carries it.
    assert(weatherAt(t).snowCover === snowCoverAt(t) && weatherAt(t).snow === snowAt(t), 'the weather says how much snows and lies');
    // No thunder in a snowstorm.
    assert(thunderBetween(winterStart, winterStart + SEASON_SECONDS).length === 0, 'no thunder in winter');
    console.log('✓ snow builds up, lies through winter and melts in spring');
}

// A season kept on a device: the world's clouds and what falls, as that
// season's rain or snow; Always day, the season's snow under a clear sky.
{
    const snowing = { ...FAIR_WEATHER, cloudCover: 0.95, rain: 0, snow: 0.8, wetness: 0, snowCover: 0.3 };
    const summer = weatherInSeason(snowing, seasonLookOf(SEASON.SUMMER));
    assert(summer.rain === 0.8 && summer.snow === 0 && summer.snowCover === 0 && summer.wetness > 0, 'kept in summer, the snow falls as rain');
    const raining = { ...FAIR_WEATHER, cloudCover: 0.95, rain: 0.6, wetness: 0.7 };
    const winter = weatherInSeason(raining, seasonLookOf(SEASON.WINTER));
    assert(winter.snow === 0.6 && winter.rain === 0 && winter.snowCover > 0.8, 'kept in winter, the rain falls as snow on lying snow');
    assert(fairWeatherIn(seasonLookOf(SEASON.SUMMER)) === FAIR_WEATHER, 'Always day in summer: fair');
    const clearWinter = fairWeatherIn(seasonLookOf(SEASON.WINTER));
    assert(clearWinter.cloudCover === 0 && clearWinter.snow === 0 && clearWinter.snowCover > 0.8, 'in winter: clear, over the snow');
    console.log('✓ a kept season\'s rain or snow, and Always day\'s');
}

// The session follows the world's season, or keeps this device's.
{
    const clock = { now: inYear(20) };
    const nav = new WorldNavigationSession({ registry: new CreateBrickRegistryUseCase().execute(), wildlifeClock: () => clock.now });
    assert(nav.season() === seasonLookAt(clock.now) && nav.season().season === SEASON.AUTUMN, 'the world\'s autumn');
    assert(nav.keptSeason() === null, 'following the world');
    clock.now = inYear(28);
    assert(nav.season().season === SEASON.WINTER && JSON.stringify(nav.weather()) === JSON.stringify(weatherAt(clock.now)), 'its winter, in its own weather');
    assert(nav.setKeptSeason(SEASON.SPRING) === SEASON.SPRING && nav.season() === seasonLookOf(SEASON.SPRING), 'kept in spring');
    assert(nav.weather().snow === 0 && nav.weather().snowCover === 0, 'no snow in a kept spring, in the world\'s winter');
    nav.setAlwaysDay(true);
    nav.setKeptSeason(SEASON.WINTER);
    assert(nav.weather().snowCover > 0.8 && nav.weather().cloudCover === 0, 'Always day in a kept winter: snow under a clear sky');
    assert(nav.setKeptSeason('nonsense') === null && nav.season() === seasonLookAt(clock.now), 'anything else follows the world');

    // Handed to the renderer with the sky.
    const shown = [];
    const facade = {
        setSkyLook() {},
        setSkyBodies() {},
        setWeather() {},
        setSeason: (look) => shown.push(look),
        onAnimationFrame: () => () => {}
    };
    const withRenderer = new WorldNavigationSession({ registry: new CreateBrickRegistryUseCase().execute(), wildlifeClock: () => clock.now });
    withRenderer._session = facade;
    withRenderer._setupDayCycle();
    assert(shown[shown.length - 1] === seasonLookAt(clock.now), 'the renderer is shown the season');
    withRenderer.setKeptSeason(SEASON.SUMMER);
    assert(shown[shown.length - 1] === seasonLookOf(SEASON.SUMMER), 'and the one kept, at once');
    console.log('✓ the session follows the world\'s season, or keeps this device\'s');
}

// The choice is this device's, remembered.
{
    const storage = new InMemoryStorageProvider();
    const store = new WorldViewSeasonStore({ storageProvider: storage });
    assert(store.keptSeason() === null, 'nothing stored follows the world');
    assert(store.setKeptSeason(SEASON.WINTER) === SEASON.WINTER && new WorldViewSeasonStore({ storageProvider: storage }).keptSeason() === SEASON.WINTER, 'a kept winter is remembered');
    assert(store.setKeptSeason('MONSOON') === null && store.keptSeason() === null, 'anything else follows the world');
    let threw = false;
    try {
        new WorldViewSeasonStore({ storageProvider: {} });
    } catch {
        threw = true;
    }
    assert(threw, 'needs a StorageProvider');
    console.log('✓ the season kept is this device\'s, remembered');
}

// What grows on the ground, for the seasons to colour.
{
    const seen = new Map();
    for (let x = -2000; x < 2000 && seen.size < 5; x += 13) {
        for (let z = -2000; z < 2000 && seen.size < 5; z += 17) {
            const zone = ecologyZoneAt(DEFAULT_WORLD_SEED, x, z);
            if (!seen.has(zone)) seen.set(zone, groundCoverAt(DEFAULT_WORLD_SEED, x, z));
        }
    }
    if (seen.has(ECOLOGY_ZONE.GRASSLAND)) assert(seen.get(ECOLOGY_ZONE.GRASSLAND).grass === 1 && seen.get(ECOLOGY_ZONE.GRASSLAND).field === 0, 'grassland is grass');
    if (seen.has(ECOLOGY_ZONE.FOREST)) assert(seen.get(ECOLOGY_ZONE.FOREST).grass === 1, 'so is the forest floor');
    if (seen.has(ECOLOGY_ZONE.FIELD)) assert(seen.get(ECOLOGY_ZONE.FIELD).field === 1 && seen.get(ECOLOGY_ZONE.FIELD).grass === 0, 'a field is crops');
    if (seen.has(ECOLOGY_ZONE.WATER)) assert(seen.get(ECOLOGY_ZONE.WATER).grass === 0 && seen.get(ECOLOGY_ZONE.WATER).field === 0, 'water neither');
    if (seen.has(ECOLOGY_ZONE.ROCK)) assert(seen.get(ECOLOGY_ZONE.ROCK).grass === 0, 'nor rock');
    assert(seen.size >= 4, `setup: several kinds of ground found (${[...seen.keys()]})`);
    console.log('✓ grass and fields, for the seasons to colour');
}

// The sound of the seasons: spring's birdsong, winter's hush.
{
    let mix = null;
    for (let x = 0; x < 3000 && !mix; x += 37) {
        const m = ambientMixAt(DEFAULT_WORLD_SEED, x, x * 0.7);
        if (m[AMBIENT_LAYER.BIRDS] > 0.2 && m[AMBIENT_LAYER.INSECTS] > 0.01) mix = m;
    }
    assert(mix, 'setup: somewhere with birds and insects');
    assert(ambientMixInSeason(mix, null) === mix && ambientMixInSeason(mix, { birds: 1, insects: 1 }) === mix, 'with no season, or an ordinary one, the mix as it is');
    assert(ambientMixInSeason(mix, seasonLookAtYearDay(12))[AMBIENT_LAYER.INSECTS] > mix[AMBIENT_LAYER.INSECTS], 'summer\'s insects');
    const spring = ambientMixInSeason(mix, seasonLookAtYearDay(5.5));
    const winter = ambientMixInSeason(mix, seasonLookAtYearDay(27));
    assert(spring[AMBIENT_LAYER.BIRDS] > mix[AMBIENT_LAYER.BIRDS], 'more birdsong in spring');
    assert(winter[AMBIENT_LAYER.INSECTS] === 0 && winter[AMBIENT_LAYER.BIRDS] < mix[AMBIENT_LAYER.BIRDS] * 0.5, 'winter is hushed');
    console.log('✓ spring\'s birdsong and winter\'s hush');
}

// The renderer's side: the ground's uniforms follow the look; each tree's
// colours and leaves for the season; snow lies as the weather says; flakes,
// leaves and petals fall only when there are any.
{
    const surfaces = createSeasonSurfaces();
    assert(surfaces.flowers.value === 0 && surfaces.groundSaturation.value === 1 && surfaces.fieldAmount.value === 0,
        'until told otherwise, the ground\'s plain look');
    const ground = makeSeasonalGround(new THREE.MeshStandardMaterial(), surfaces);
    const groundVersion = ground.version;
    assert(!surfaces.shown && !ground.customProgramCacheKey().endsWith('-shown'), 'until a season is shown, the ground\'s shaders carry none of it');
    const autumn = seasonLookAtYearDay(20);
    setSeason(surfaces, autumn);
    assert(surfaces.shown && ground.version > groundVersion && ground.customProgramCacheKey().endsWith('-shown'), 'the first season rebuilds them');
    assert(surfaces.groundSaturation.value === autumn.groundSaturation && surfaces.fieldAmount.value === autumn.fieldAmount, 'autumn\'s uniforms');
    assert(surfaces.groundGrade.value.x === autumn.groundGrade[0] && surfaces.fieldColor.value.z === autumn.fieldColor[2], 'its colours');
    setSeason(surfaces, null);
    assert(surfaces.groundSaturation.value === autumn.groundSaturation, 'no look changes nothing');
    const wet = createWetSurfaces();
    assert(wet.snowCover.value === 0, 'no snow to begin with');
    setSnowCover(wet, 0.6);
    assert(wet.snowCover.value === 0.6, 'snow lies');
    setSnowCover(wet, 7);
    assert(wet.snowCover.value === 1, 'never more than a blanket');
    setSnowCover(wet, NaN);
    assert(wet.snowCover.value === 0, 'nonsense is none');

    const added = [];
    const sink = { add: (o) => added.push(o), remove: (o) => added.splice(added.indexOf(o), 1) };
    const camera = new THREE.PerspectiveCamera(60, 1, 0.1, 1000);
    camera.position.set(100, 5, 100);
    for (const kind of Object.values(DRIFT)) {
        const drift = new Drift(sink, kind);
        assert(drift.kind === kind && drift.points.material.depthWrite === false && drift.points.frustumCulled === false, `${kind} drifts round the camera, seen through`);
        drift.update(camera, 3);
        assert(!drift.points.visible, 'nothing falling, nothing drawn');
        drift.set(0.5);
        drift.update(camera, 3);
        assert(drift.points.visible && drift.points.material.uniforms.uAmount.value === 0.5, 'some falling');
        drift.update(camera, 3, undefined, true);
        assert(!drift.points.visible, 'under water, none');
        drift.setShelter({ minX: 0, maxX: 10, minZ: 0, maxZ: 10, top: 4 });
        assert(drift.points.material.uniforms.uShelterTop.value === 4, 'kept out of the room the avatar stands in');
        drift.dispose();
    }
    assert(added.length === 0, 'disposing takes them out of the scene');

    // Each tree for the season, from its own numbers.
    const numbers = treeNumbers(123.4, -56.7);
    assert(JSON.stringify(numbers) === JSON.stringify(treeNumbers(123.4, -56.7)) && numbers.every((n) => n >= 0 && n < 1), 'a tree\'s own numbers, the same every time');
    const green = [0.5, 0.7, 0.4];
    const plain = treeSeasonOf(null, numbers, DECIDUOUS.FULLY);
    assert(plain.leaf === 1 && plain.amount === 0 && plain.fruit === 0 && JSON.stringify(seasonedTreeColour(green, plain)) === JSON.stringify(green),
        'with no season a tree is as it was');
    const turned = treeSeasonOf(seasonLookAtYearDay(21), [0.5, 0.1, 0.1], DECIDUOUS.FULLY);
    const red = seasonedTreeColour(green, turned);
    assert(red[0] > red[1] && Math.abs((red[0] * 0.299 + red[1] * 0.587 + red[2] * 0.114) - (green[0] * 0.299 + green[1] * 0.587 + green[2] * 0.114) * 0.9) < 0.02,
        'an autumn red at about the leaves\' own brightness');
    const evergreen = treeSeasonOf(seasonLookAtYearDay(21), [0.5, 0.1, 0.1], DECIDUOUS.NEVER);
    assert(evergreen.amount === 0 && evergreen.leaf === 1, 'a conifer neither turns nor drops its needles');
    assert(treeSeasonOf(seasonLookAtYearDay(27), numbers, DECIDUOUS.FULLY).leaf === 0, 'in winter a broadleaf is bare');
    assert(Math.abs(treeSeasonOf(seasonLookAtYearDay(27), numbers, DECIDUOUS.PARTLY).leaf - 0.4) < 1e-9, 'scrub keeps some');
    const bareCrown = seasonedTreeColour(green, treeSeasonOf(seasonLookAtYearDay(27), numbers, DECIDUOUS.FULLY), { crown: true });
    assert(bareCrown[0] > bareCrown[2] && bareCrown[1] < green[1], 'a bare crown turns twig-brown');
    const blooming = treeSeasonOf(seasonLookAtYearDay(2.5), [0.2, 0.2, 0.5], DECIDUOUS.FULLY);
    assert(blooming.amount > 0.8 && blooming.hue[0] > blooming.hue[1], 'two in five broadleaves blossom, pink here');
    assert(treeSeasonOf(seasonLookAtYearDay(2.5), [0.2, 0.6, 0.5], DECIDUOUS.FULLY).amount === 0, 'the rest don\'t');
    assert(treeSeasonOf(seasonLookAtYearDay(14.5), [0.2, 0.5, 0.5], DECIDUOUS.FULLY).fruit > 0.1, 'fruit on a fruiting tree at harvest');

    // What the shaders need: dropping leaves and fruit, compiled in only then.
    assert(JSON.stringify(treeSeasonFlags(seasonLookAtYearDay(10))) === '{"bare":false,"fruit":true}', 'summer: fruit');
    assert(JSON.stringify(treeSeasonFlags(seasonLookAtYearDay(28))) === '{"bare":true,"fruit":false}', 'winter: bare trees');
    assert(JSON.stringify(treeSeasonFlags(null)) === '{"bare":false,"fruit":false}', 'no season: nothing');
    const leafMaterial = makeSeasonalTree(new THREE.MeshStandardMaterial(), { part: TREE_PART.LEAVES });
    const version = leafMaterial.version;
    setTreeSeasonFlags(leafMaterial, { bare: true, fruit: false });
    assert('SEASON_BARE' in leafMaterial.defines && !('SEASON_FRUIT' in leafMaterial.defines) && leafMaterial.version > version, 'compiled with dropping leaves');
    const again = leafMaterial.version;
    setTreeSeasonFlags(leafMaterial, { bare: true, fruit: false });
    assert(leafMaterial.version === again, 'and not again for the same');
    assert(makeSeasonalTree(new THREE.MeshStandardMaterial(), { part: TREE_PART.BARK }).onBeforeCompile.toString().indexOf('SEASON') < 0, 'bark is left alone');

    // Snow is compiled in only while it lies.
    const snowyWet = createWetSurfaces();
    const brick = makeWet(new THREE.MeshStandardMaterial(), snowyWet);
    const before = brick.version;
    setSnowCover(snowyWet, 0);
    assert(brick.version === before && !brick.customProgramCacheKey().endsWith('-snow'), 'no snow, no snow in the shader');
    setSnowCover(snowyWet, 0.2);
    assert(brick.version > before && brick.customProgramCacheKey().endsWith('-snow'), 'the first snow rebuilds it');
    const snowing = brick.version;
    setSnowCover(snowyWet, 0.7);
    assert(brick.version === snowing, 'deepening snow doesn\'t');
    brick.dispose();
    assert(!snowyWet.materials.has(brick), 'a disposed material is let go');

    // Trees that shed their leaves round the camera, for the leaves to fall from.
    const forest = new TreeForest({ add() {}, remove() {} }, { seed: DEFAULT_WORLD_SEED, wetSurfaces: wet });
    assert(forest.deciduousNearby === 0, 'no trees loaded, no wood');
    let wood = null;
    for (let tx = -30; tx < 30 && !wood; tx++) {
        const minX = tx * TERRAIN_TILE_SIZE;
        const broadleaves = naturalFeaturesInRegion(DEFAULT_WORLD_SEED, minX, 0, minX + TERRAIN_TILE_SIZE, TERRAIN_TILE_SIZE)
            .filter((f) => f.type === FEATURE_TYPE.TREE && f.species === TREE_SPECIES.BROADLEAF);
        if (broadleaves.length < 20) continue;
        const token = forest.loadTile(tx, 0);
        camera.position.set(broadleaves[0].x, broadleaves[0].y + 20, broadleaves[0].z);
        camera.lookAt(camera.position.x, 0, camera.position.z + 1);
        forest.update(camera);
        if (forest.deciduousNearby > 0.5) wood = tx;
        forest.unloadTile(token);
    }
    assert(wood !== null, 'somewhere is a wood of trees that shed their leaves');
    // The forest dressed for autumn: its broadleaves' colours turn, and its
    // shaders drop leaves.
    const token = forest.loadTile(wood, 0);
    forest.update(camera);
    const broadleafMeshes = () => forest.group.children.filter((m) => m.name.startsWith('tree-broadleaf') && m.visible && m.count > 0 && m.geometry.getAttribute('treeSeason'));
    const warmth = () => {
        let r = 0;
        let g = 0;
        for (const mesh of broadleafMeshes()) {
            for (let i = 0; i < mesh.count; i++) {
                r += mesh.instanceColor.getX(i);
                g += mesh.instanceColor.getY(i);
            }
        }
        return r / g;
    };
    const summerWarmth = warmth();
    forest.setSeason(seasonLookAtYearDay(22));
    forest.update(camera);
    assert(warmth() > summerWarmth * 1.2, `the broadleaves turn (${summerWarmth.toFixed(2)} to ${warmth().toFixed(2)})`);
    const someMesh = broadleafMeshes()[0];
    assert(someMesh.geometry.getAttribute('treeSeason').getX(0) < 1, 'and drop their leaves');
    assert('SEASON_BARE' in someMesh.material.defines && 'SEASON_BARE' in someMesh.customDepthMaterial.defines, 'which their shaders, shadows too, now draw');
    forest.unloadTile(token);
    forest.dispose();
    console.log('✓ the renderer follows the season, the snow and what falls');
}
