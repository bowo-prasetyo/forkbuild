import * as THREE from 'three';
import {
    DAY_CYCLE_SECONDS, EQUINOX_SKY, FULL_MOON, SEASON_DAY_SHIFT, seasonalFraction, seasonalSky,
    skyBodiesAt, skyBodiesAtFraction, skyLookAt, skyLookAtFraction, moonPhaseAt
} from '../core/DayCycle.js';
import {
    SEASON, SEASON_DAYS, WORLD_YEAR_SECONDS, LAKE_FREEZE_DAY, LAKE_THAW_DAY,
    isLakeFrozenAt, lakeIceAt, seasonLookAtYearDay, seasonLookOf, summerAt
} from '../core/Season.js';
import { LAKE_SURFACE_HEIGHT, isLakeAt, seaShareAt } from '../core/Hydrology.js';
import { surfaceCategoryAt, SURFACE_CATEGORY } from '../core/TerrainSurface.js';
import { DEFAULT_WORLD_SEED } from '../core/TerrainHeightField.js';
import { AvatarSwimMode } from '../core/AvatarSwimming.js';
import { AvatarAnimationState } from '../core/AvatarAnimationState.js';
import { AvatarVerticalState } from '../core/AvatarVerticalState.js';
import { VehicleType } from '../core/VehicleType.js';
import { FOOTSTEP_SURFACE, SNOW_FOOTSTEP_COVER, advanceAvatarSound, createAvatarSoundState, footstepSurfaceAt } from '../core/AvatarSoundCues.js';
import { FOOTPRINT_SECONDS, FOOTPRINT_STRIDE, advanceFootprints, createFootprintState, footprintFade } from '../core/Footprints.js';
import { CHALLENGE_THEMES, challengeAt } from '../core/BuildChallenge.js';
import { AvatarWaterConstraint } from '../application/avatar/AvatarWaterConstraint.js';
import { AvatarStepConstraint } from '../application/avatar/AvatarStepConstraint.js';
import { AvatarTerrainConstraint } from '../application/avatar/AvatarTerrainConstraint.js';
import { AvatarMovementController } from '../application/avatar/AvatarMovementController.js';
import { AvatarPresenceSession } from '../application/avatar/AvatarPresenceSession.js';
import { AvatarTemplateRegistry } from '../core/AvatarTemplateRegistry.js';
import { CoreAvatarTemplateLibrary } from '../core/library/CoreAvatarTemplateLibrary.js';
import { AvatarProfileUseCase } from '../application/avatar/AvatarProfileUseCase.js';
import { LocalIdentityProvider } from '../identity/LocalIdentityProvider.js';
import { CreateBrickRegistryUseCase } from '../application/editor/CreateBrickRegistryUseCase.js';
import { WorldNavigationSession } from '../application/world/WorldNavigationSession.js';
import { FootprintTrail, MAX_PRINTS } from '../renderer/FootprintTrail.js';
import { createLakeIce, setLakeIce, makeWaterWaving } from '../renderer/WaterWaveMaterial.js';
import { InMemoryStorageProvider } from './support/InMemoryStorageProvider.js';
import { assert } from './support/Assert.js';

// Winter, and the sun through the year: the sun's path and the day's length
// follow the season (core/DayCycle.js's seasonalSky()); lakes freeze hard
// in the depth of winter and are walked on (core/Season.js#lakeIceAt(), the
// avatar's water, step and terrain constraints); snow and ice sound
// underfoot; footprints follow the avatar through the snow, on this device
// only (core/Footprints.js); and seasonal challenge themes are added
// without changing the weeks before them.

const YEAR_START = Math.ceil(1_800_000_000 / WORLD_YEAR_SECONDS) * WORLD_YEAR_SECONDS;
const inYear = (day) => YEAR_START + day * DAY_CYCLE_SECONDS;
const degrees = (direction) => (Math.asin(direction.y) * 180) / Math.PI;

// The sun's path and the day through the year.
{
    assert(seasonalSky(0) === EQUINOX_SKY && seasonalSky(NaN) === EQUINOX_SKY, 'the equinoxes, and nonsense, are the sky as it always was');
    const peak = (sky) => {
        let highest = -1;
        let up = 0;
        for (let f = 0; f < 1; f += 0.0005) {
            const bodies = skyBodiesAtFraction(f, FULL_MOON, sky);
            if (bodies.sun) {
                highest = Math.max(highest, bodies.sun.y);
                up += 0.0005;
            }
        }
        return { degrees: (Math.asin(highest) * 180) / Math.PI, up };
    };
    const summer = peak(seasonalSky(1));
    const equinox = peak(EQUINOX_SKY);
    const winter = peak(seasonalSky(-1));
    assert(Math.abs(equinox.degrees - 40) < 0.2 && Math.abs(summer.degrees - 52) < 0.2 && Math.abs(winter.degrees - 28) < 0.2,
        `the sun climbs to 52° at midsummer, 40° at the equinoxes, 28° at midwinter (${summer.degrees.toFixed(1)}, ${equinox.degrees.toFixed(1)}, ${winter.degrees.toFixed(1)})`);
    assert(summer.up > equinox.up + 0.03 && winter.up < equinox.up - 0.03, 'and stays up longer in summer, shorter in winter');
    const nightShare = (sky) => {
        let night = 0;
        for (let f = 0; f < 1; f += 0.0005) if (skyLookAtFraction(f, sky).glow >= 0.999) night += 0.0005;
        return night;
    };
    assert(nightShare(seasonalSky(-1)) < 0.27 && nightShare(seasonalSky(1)) > 0.17, 'the longest night stays about a quarter of the cycle, the shortest about a fifth');
    // The full moon rides high in winter and low in summer.
    const moonPeak = (sky) => Math.max(...Array.from({ length: 400 }, (_, i) => skyBodiesAtFraction(0.64 + i * 0.001, FULL_MOON, sky).moon?.y ?? -1));
    assert(moonPeak(seasonalSky(-1)) > moonPeak(seasonalSky(1)) + 0.2, 'the winter moon rides high, the summer moon low');
    // The light never comes from lower than before, in any season.
    for (const s of [-1, -0.5, 0, 0.5, 1]) {
        for (let f = 0; f < 1; f += 0.01) {
            assert(skyBodiesAtFraction(f, FULL_MOON, seasonalSky(s)).light.y >= 0.25 - 1e-9, 'the light never comes from low down');
        }
    }
    // Dawn stays at the start of the cycle; the fraction is a smooth warp.
    assert(seasonalFraction(0, SEASON_DAY_SHIFT) === 0 && Math.abs(seasonalFraction(1, -SEASON_DAY_SHIFT) - 1) < 1e-12, 'the day still starts and ends at the cycle\'s ends');
    for (let f = 0; f < 1; f += 0.01) {
        assert(seasonalFraction(f + 0.01, SEASON_DAY_SHIFT) > seasonalFraction(f, SEASON_DAY_SHIFT), 'and runs forward');
    }
    // The season's look carries its sky; a kept season keeps its middle's.
    assert(seasonLookAtYearDay(12).sky.dayShift > 0.049 && seasonLookAtYearDay(28).sky.dayShift < -0.049, 'midsummer\'s long day, midwinter\'s short one');
    assert(Math.abs(seasonLookAtYearDay(4).sky.dayShift) < 1e-9 && Math.abs(summerAt(20)) < 1e-9, 'the equinoxes in the middle of spring and autumn');
    assert(seasonLookOf(SEASON.WINTER).sky.sunTilt > EQUINOX_SKY.sunTilt, 'a kept winter keeps its low sun');
    // Defaults change nothing: the equinox sky is the sky as it was.
    const t = 1_800_000_123;
    assert(JSON.stringify(skyLookAt(t)) === JSON.stringify(skyLookAt(t, EQUINOX_SKY)) && JSON.stringify(skyBodiesAt(t)) === JSON.stringify(skyBodiesAt(t, EQUINOX_SKY)), 'with no season, the sky as before');
    // The moon's phase still changes only while it is down: at the season's moonrise.
    const sky = seasonalSky(-1);
    for (let day = 0; day < 8; day++) {
        let previous = null;
        for (let f = 0; f < 1; f += 0.002) {
            const at = (day + f) * DAY_CYCLE_SECONDS;
            const phase = moonPhaseAt(at, sky);
            const bodies = skyBodiesAtFraction(f, phase, sky);
            if (previous && phase !== previous) assert(!skyBodiesAtFraction(f - 0.002, previous, sky).moon, 'the phase changes only while the moon is down');
            previous = phase;
            void bodies;
        }
    }
    console.log('✓ a high sun and a long day in summer, a low sun and a short one in winter');
}

// Lakes freeze in the depth of winter, on the world's clock.
{
    assert(lakeIceAt(inYear(12)) === 0 && lakeIceAt(inYear(20)) === 0 && lakeIceAt(inYear(4)) === 0, 'open water spring, summer and autumn');
    assert(lakeIceAt(inYear(3 * SEASON_DAYS + 1)) === 0, 'and in early winter');
    const forming = lakeIceAt(inYear(3 * SEASON_DAYS + LAKE_FREEZE_DAY - 0.25));
    assert(forming > 0 && forming < 1 && !isLakeFrozenAt(inYear(3 * SEASON_DAYS + LAKE_FREEZE_DAY - 0.25)), 'it forms over half a day, not yet walkable');
    assert(isLakeFrozenAt(inYear(3 * SEASON_DAYS + 4)) && lakeIceAt(inYear(3 * SEASON_DAYS + 4)) === 1, 'frozen hard in the depth of winter');
    const breaking = lakeIceAt(inYear(3 * SEASON_DAYS + LAKE_THAW_DAY + 0.25));
    assert(breaking > 0 && breaking < 1 && !isLakeFrozenAt(inYear(3 * SEASON_DAYS + LAKE_THAW_DAY + 0.25)), 'and breaks up at winter\'s end');
    assert(lakeIceAt(inYear(3 * SEASON_DAYS + 7.9)) === 0 && lakeIceAt(NaN) === 0, 'open again before spring');
    // Lakes, never the sea.
    let lake = null;
    let sea = null;
    for (let x = -3000; x < 3000 && (!lake || !sea); x += 23) {
        for (let z = -3000; z < 3000 && (!lake || !sea); z += 29) {
            if (surfaceCategoryAt(DEFAULT_WORLD_SEED, x, z) !== SURFACE_CATEGORY.WATER) continue;
            if (!lake && seaShareAt(DEFAULT_WORLD_SEED, x, z) === 0) lake = { x, z };
            if (!sea && seaShareAt(DEFAULT_WORLD_SEED, x, z) === 1) sea = { x, z };
        }
    }
    assert(lake && isLakeAt(DEFAULT_WORLD_SEED, lake.x, lake.z), 'an inland lake is a lake');
    if (sea) assert(!isLakeAt(DEFAULT_WORLD_SEED, sea.x, sea.z), 'the open sea is not');
    // The session freezes the lakes on the world's clock, whatever season it keeps.
    const clock = { now: inYear(3 * SEASON_DAYS + 4) };
    const nav = new WorldNavigationSession({ registry: new CreateBrickRegistryUseCase().execute(), wildlifeClock: () => clock.now });
    assert(nav.lakeIce() === 1, 'the session\'s lakes are frozen in the depth of winter');
    nav.setKeptSeason(SEASON.SUMMER);
    assert(nav.lakeIce() === 1 && nav._isLakeFrozenAt(lake.x, lake.z), 'kept in summer here, they are still frozen: everyone walks on the same ice');
    clock.now = inYear(12);
    nav.setKeptSeason(SEASON.WINTER);
    assert(nav.lakeIce() === 0 && !nav._isLakeFrozenAt(lake.x, lake.z), 'kept in winter in the world\'s summer, they are open');
    console.log('✓ lakes freeze hard in the depth of winter, the same for everyone; the sea never does');
}

function buildProfile(username) {
    const registry = new AvatarTemplateRegistry();
    registry.register(CoreAvatarTemplateLibrary);
    const storage = new InMemoryStorageProvider();
    const identityProvider = new LocalIdentityProvider(storage);
    identityProvider.login(username);
    return new AvatarProfileUseCase(storage, identityProvider, registry).getProfile();
}

// Walking on the ice: from the shore out over deep water, at the lake's
// surface, at full speed, never swimming; open, the same walk goes into the
// water; a swimmer under new ice swims on.
{
    // A shore at x = 0 shelving down to a bed 6 deep by x = 12, as steep as a
    // walker could never climb out of.
    const bedAt = (x) => (x < 0 ? LAKE_SURFACE_HEIGHT - x * 0.1 : LAKE_SURFACE_HEIGHT - Math.min(6, x * 0.5));
    const lakeWorld = (frozen) => {
        const frozenAt = () => frozen;
        const water = new AvatarWaterConstraint({ heightAt: (x) => bedAt(x), isWaterAt: (x) => x >= 0, frozenAt });
        const step = new AvatarStepConstraint({ floorAt: (x, z) => water.iceTopAt(x, z) });
        const terrain = new AvatarTerrainConstraint({ heightAt: (x) => bedAt(x), frozenAt: (x) => frozen && x >= 0 });
        return { water, step, terrain };
    };
    const walker = (frozen, start = { x: -2, y: 0, z: 0 }) => {
        const world = lakeWorld(frozen);
        const session = new AvatarPresenceSession(buildProfile(`ice-${frozen}`), { position: start, rotation: { x: 0, y: 90, z: 0 } });
        const controller = new AvatarMovementController(session, null, world.terrain, world.step, null, world.water);
        return { session, controller, world };
    };
    const iced = walker(true);
    iced.controller.keyDown('w');
    for (let i = 0; i < 160; i++) iced.controller.tick(0.05);
    iced.controller.keyUp('w');
    const out = iced.session.current.position;
    assert(out.x > 15, `on the ice it walks far out over deep water (x ${out.x.toFixed(1)})`);
    const worldFeet = out.y + bedAt(out.x);
    assert(Math.abs(worldFeet - LAKE_SURFACE_HEIGHT) < 1e-6, `standing on the ice, level with the lake's surface (${worldFeet.toFixed(3)})`);
    assert(iced.controller.swimState().mode === AvatarSwimMode.NONE, 'never swimming');
    assert(iced.world.water.depthAt(10, 0) === 0, 'the ice slows no one');

    const open = walker(false);
    open.controller.keyDown('w');
    for (let i = 0; i < 160; i++) open.controller.tick(0.05);
    open.controller.keyUp('w');
    const wet = open.session.current.position;
    assert(wet.y + bedAt(wet.x) < LAKE_SURFACE_HEIGHT, 'open, the same walk goes into the water');

    // A swimmer under the ice when it froze is not lifted onto it: it swims on.
    const under = walker(true, { x: 14, y: 6 - 1.4, z: 0 });
    under.controller.tick(0.05);
    assert(under.controller.swimState().mode !== AvatarSwimMode.NONE, 'a swimmer caught under new ice swims on beneath it');
    console.log('✓ the frozen lake is walked on, level and at full speed; open water is swum');
}

// Underfoot: snow crunches, ice taps.
{
    const ground = { x: 10, z: -20 };
    assert(footstepSurfaceAt(DEFAULT_WORLD_SEED, ground.x, ground.z, { snowCover: SNOW_FOOTSTEP_COVER }) === FOOTSTEP_SURFACE.SNOW, 'snow lying crunches');
    assert(footstepSurfaceAt(DEFAULT_WORLD_SEED, ground.x, ground.z, { snowCover: 0.1 }) !== FOOTSTEP_SURFACE.SNOW, 'a dusting doesn\'t');
    assert(footstepSurfaceAt(DEFAULT_WORLD_SEED, ground.x, ground.z, { onStructure: true, snowCover: 1 }) === FOOTSTEP_SURFACE.STRUCTURE, 'bricks sound as bricks');
    assert(footstepSurfaceAt(DEFAULT_WORLD_SEED, ground.x, ground.z, { onIce: true, snowCover: 1 }) === FOOTSTEP_SURFACE.ICE, 'ice taps');
    let state = createAvatarSoundState();
    const step = (x, extra) => {
        const result = advanceAvatarSound(state, {
            position: { x, y: 0.8, z: 0 }, animation: AvatarAnimationState.WALKING, verticalState: AvatarVerticalState.SUPPORTED,
            vehicleType: null, swimMode: AvatarSwimMode.NONE, ...extra
        }, 0.1, DEFAULT_WORLD_SEED);
        state = result.state;
        return result.cues;
    };
    step(0, { onIce: true });
    const cues = step(1, { onIce: true });
    assert(cues.some((cue) => cue.surface === FOOTSTEP_SURFACE.ICE), 'walking on the ice, high above the bed, sounds as ice, not as bricks');
    console.log('✓ snow crunches underfoot, and ice taps');
}

// Footprints in the snow: every stride, left and right in turn, only on snowy
// open ground, fading after a minute and with the snow.
{
    const observation = (x, extra = {}) => ({
        position: { x, y: 0, z: 0 }, animation: AvatarAnimationState.WALKING, verticalState: AvatarVerticalState.SUPPORTED,
        vehicleType: VehicleType.NONE, swimMode: AvatarSwimMode.NONE, onIce: false, snowCover: 0.8, sheltered: false, ...extra
    });
    const walk = (extra, metres = 6) => {
        let state = createFootprintState();
        const prints = [];
        for (let x = 0; x <= metres; x += 0.1) {
            const result = advanceFootprints(state, observation(x, extra), x);
            state = result.state;
            prints.push(...result.prints);
        }
        return prints;
    };
    const prints = walk({});
    assert(Math.abs(prints.length - Math.floor(6 / FOOTPRINT_STRIDE)) <= 1, `a print every stride (${prints.length} in 6 m)`);
    assert(prints.every((p, i) => p.left === (i % 2 === 0)), 'left and right in turn');
    assert(prints.every((p) => Math.abs(p.heading - Math.PI / 2) < 1e-9), 'pointing the way it walks');
    assert(prints[0].z * prints[1].z < 0, 'one each side of the path');
    assert(walk({ snowCover: 0.1 }).length === 0, 'none in a dusting');
    assert(walk({ sheltered: true }).length === 0 && walk({ onIce: true }).length === 0, 'none indoors or on the ice');
    assert(walk({ position: undefined, swimMode: AvatarSwimMode.SURFACE }).length === 0, 'none swimming');
    assert(walk({ vehicleType: VehicleType.BICYCLE }).length === 0 && walk({ animation: AvatarAnimationState.IDLE }).length === 0, 'none riding or standing');
    assert(footprintFade(0, 1) === 1 && footprintFade(0, FOOTPRINT_SECONDS * 0.9) < 0.5 && footprintFade(0, FOOTPRINT_SECONDS) === 0, 'they fade away after a minute');
    assert(footprintFade(0, 1, 0) === 0 && footprintFade(0, 1, SNOW_FOOTSTEP_COVER / 2) === 0.5, 'and with the snow as it melts');

    // Drawn on this device only: one draw, the newest kept, gone once faded.
    const added = [];
    const trail = new FootprintTrail({ add: (o) => added.push(o), remove: (o) => added.splice(added.indexOf(o), 1) }, { heightAt: () => 3 });
    trail.update(0, 1);
    assert(!trail.mesh.visible && added.length === 1, 'nothing showing, nothing drawn');
    for (let i = 0; i < MAX_PRINTS + 10; i++) trail.add({ x: i * 0.7, z: 0, heading: 0, left: i % 2 === 0, at: i * 0.5 });
    trail.update(MAX_PRINTS * 0.5, 1);
    assert(trail.count === MAX_PRINTS && trail.mesh.visible, 'the newest are kept, and shown');
    const matrix = new THREE.Matrix4();
    trail.mesh.getMatrixAt(0, matrix);
    assert(Math.abs(new THREE.Vector3().setFromMatrixPosition(matrix).y - 3) < 0.05, 'lying on the ground');
    trail.update(10_000, 1);
    assert(trail.count === 0 && !trail.mesh.visible, 'and forgotten once all have faded');
    trail.dispose();
    assert(added.length === 0, 'disposing takes it out of the scene');
    console.log('✓ footprints follow the avatar through the snow, and fade');
}

// The water's ice is compiled in only while there is some.
{
    const ice = createLakeIce();
    const material = makeWaterWaving(new THREE.MeshStandardMaterial(), { value: 0 }, { ice });
    const version = material.version;
    setLakeIce(ice, 0);
    assert(material.version === version && !material.customProgramCacheKey().endsWith('-ice'), 'open water, no ice in the shader');
    setLakeIce(ice, 0.3);
    assert(ice.ice.value === 0.3 && material.version > version && material.customProgramCacheKey().endsWith('-ice'), 'the first ice rebuilds it');
    const frozen = material.version;
    setLakeIce(ice, 1);
    assert(material.version === frozen, 'thickening ice doesn\'t');
    material.dispose();
    assert(!ice.materials.has(material), 'a disposed material is let go');
    console.log('✓ the water carries the ice\'s code only while there is ice');
}

// Seasonal challenge themes.
{
    const winterThemes = CHALLENGE_THEMES.filter((theme) => theme.season === 'WINTER').map((theme) => theme.id);
    assert(winterThemes.includes('winter-cabin') && winterThemes.includes('skating-pond'), 'winter brings a cabin in the snow and a skating pond');
    const firstWeek = challengeAt(Date.parse('2026-10-14T12:00:00Z'));
    assert(firstWeek.themeId === 'lighthouse', 'the weeks already under way keep their themes');
    console.log('✓ seasonal challenge themes, added without changing the weeks before');
}
