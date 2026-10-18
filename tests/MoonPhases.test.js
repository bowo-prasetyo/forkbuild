import * as THREE from 'three';
import {
    DAY,
    DAY_CYCLE_SECONDS,
    DAY_SKY_BODIES,
    FULL_MOON,
    MOON_CYCLE_DAYS,
    MOON_PHASES,
    NIGHT,
    moonPhaseAt,
    moonlitLook,
    skyBodiesAt,
    skyBodiesAtFraction,
    skyLookAtFraction
} from '../core/DayCycle.js';
import { compassLabelBetween } from '../core/CompassHeading.js';
import { overcastLook, weatherAt } from '../core/Weather.js';
import { SkyBodies } from '../renderer/SkyBodies.js';
import { StarSky } from '../renderer/StarSky.js';
import { CreateBrickRegistryUseCase } from '../application/editor/CreateBrickRegistryUseCase.js';
import { WorldNavigationSession } from '../application/world/WorldNavigationSession.js';
import { assert } from './support/Assert.js';

// The moon's phases (core/DayCycle.js): new to full and back over
// MOON_CYCLE_DAYS of World View's days, one phase a night, from the clock
// alone; lit on the side its sun would light; a new moon's night as bright
// as ever but flatter, a full moon's brighter, and the stars fainter the more
// of the moon is lit.

const at = (day, fraction) => (day + fraction) * DAY_CYCLE_SECONDS;
const brightness = (look) => look.hemisphereIntensity + look.sunIntensity;
const dot = (a, b) => a.x * b.x + a.y * b.y + a.z * b.z;
const compass = (d) => compassLabelBetween({ x: 0, z: 0 }, { x: d.x, z: d.z });

// Eight phases, each with its own share of the disc lit.
{
    assert(MOON_CYCLE_DAYS === 8 && MOON_PHASES.length === 8, 'eight phases, one a night');
    assert(JSON.stringify(MOON_PHASES.map((p) => p.name)) === JSON.stringify([
        'newMoon', 'waxingCrescent', 'firstQuarter', 'waxingGibbous', 'fullMoon', 'waningGibbous', 'thirdQuarter', 'waningCrescent'
    ]), 'from new, waxing to full, waning back');
    const lit = MOON_PHASES.map((p) => Math.round(p.illumination * 1000) / 1000);
    assert(JSON.stringify(lit) === JSON.stringify([0, 0.146, 0.5, 0.854, 1, 0.854, 0.5, 0.146]), `each lit as much as its phase (${lit})`);
    assert(MOON_PHASES.filter((p) => p.waxing).map((p) => p.index).join() === '1,2,3', 'waxing between new and full');
    assert(FULL_MOON === MOON_PHASES[4] && Object.isFrozen(FULL_MOON), 'a frozen full moon');
    console.log('✓ eight phases, from new to full and back');
}

// The phase follows the clock, the same for everyone; it changes once a night,
// at moonrise, never while the moon is up, and comes round again every
// MOON_CYCLE_DAYS.
{
    assert(moonPhaseAt(1_800_000_123.5) === moonPhaseAt(1_800_000_123.5), 'the same moment, the same moon');
    assert(moonPhaseAt(NaN) === FULL_MOON, 'no clock is a full moon');
    const seen = new Set();
    for (let day = 0; day < MOON_CYCLE_DAYS; day++) {
        const phase = moonPhaseAt(at(day, 0.8));
        seen.add(phase);
        assert(moonPhaseAt(at(day + MOON_CYCLE_DAYS, 0.8)) === phase, 'every eight days the same phase again');
        assert(moonPhaseAt(at(day + 1, 0.6)) === phase && moonPhaseAt(at(day + 1, 0.01)) === phase,
            'the night\'s phase holds until the next moonrise');
        assert(moonPhaseAt(at(day + 1, 0.8)).index === (phase.index + 1) % MOON_CYCLE_DAYS, 'and moves on one the next night');
    }
    assert(seen.size === MOON_CYCLE_DAYS, 'every phase in turn');
    for (let day = -3; day < 20; day++) {
        let previous = moonPhaseAt(at(day, 0));
        for (let i = 1; i <= 400; i++) {
            const seconds = at(day, i / 400);
            const phase = moonPhaseAt(seconds);
            if (phase !== previous) {
                assert(skyBodiesAt(at(day, (i - 1) / 400)).moon === null && skyBodiesAt(seconds).moon !== null,
                    `it changes only as the moon rises (day ${day}, ${i / 400})`);
            }
            previous = phase;
        }
    }
    const night = skyBodiesAt(at(5, 0.8));
    assert(night.moonPhase === moonPhaseAt(at(5, 0.8)), 'the sky carries the night\'s phase');
    assert(skyBodiesAtFraction(0.8).moonPhase === FULL_MOON && DAY_SKY_BODIES.moonPhase === FULL_MOON,
        'with no phase given, a full moon');
    console.log('✓ one phase a night, from the clock, changing only at moonrise');
}

// The moon is lit from where its sun would stand: from behind at new moon,
// from the viewer's side at full, on its western side while waxing and its
// eastern while waning.
{
    for (const phase of MOON_PHASES) {
        for (const fraction of [0.67, 0.8, 0.95]) {
            const bodies = skyBodiesAtFraction(fraction, phase);
            const from = bodies.moonLitFrom;
            assert(from && Math.abs(Math.hypot(from.x, from.y, from.z) - 1) < 1e-9, 'a unit direction');
            const away = Math.acos(Math.max(-1, Math.min(1, dot(from, bodies.moon))));
            assert(Math.abs(away - Math.min(phase.angle, Math.PI * 2 - phase.angle)) < 1e-6, `${phase.name} is lit from its phase angle off the moon`);
        }
    }
    const high = (phase) => skyBodiesAtFraction(0.83, phase);
    assert(dot(high(MOON_PHASES[0]).moonLitFrom, high(MOON_PHASES[0]).moon) > 0.999, 'a new moon is lit from behind');
    assert(dot(high(FULL_MOON).moonLitFrom, high(FULL_MOON).moon) < -0.999, 'a full moon from the viewer\'s side');
    // Facing the moon high in the south, west is to the right (+x).
    for (const phase of MOON_PHASES.slice(1, 4)) {
        assert(high(phase).moonLitFrom.x > high(phase).moon.x, `${phase.name} is lit on its western side`);
    }
    for (const phase of MOON_PHASES.slice(5)) {
        assert(high(phase).moonLitFrom.x < high(phase).moon.x, `${phase.name} on its eastern side`);
    }
    assert(compass(high(MOON_PHASES[2]).moonLitFrom) === 'W', 'a first quarter by a sun setting in the west');
    assert(skyBodiesAtFraction(0.3, MOON_PHASES[2]).moonLitFrom === null, 'no moon, no light on it');
    console.log('✓ each phase lit from where its sun would stand');
}

// A night under any moon is never darker than NIGHT: a new moon's light is
// spread as fill, flatter and with faint shadows, under a deeper sky; a full
// moon's is brighter and more silver. Day, dusk and dawn's sun are untouched.
{
    const newMoon = moonlitLook(NIGHT, MOON_PHASES[0]);
    const quarter = moonlitLook(NIGHT, MOON_PHASES[2]);
    const full = moonlitLook(NIGHT, FULL_MOON);
    assert(JSON.stringify(quarter) === JSON.stringify(NIGHT), 'a half-lit moon\'s night is NIGHT');
    assert(newMoon.sunIntensity < NIGHT.sunIntensity * 0.5 && Math.abs(brightness(newMoon) - brightness(NIGHT)) < 1e-9,
        'a new moon gives little light of its own, and the fill takes up the rest');
    assert(full.sunIntensity > NIGHT.sunIntensity && brightness(full) > brightness(NIGHT), 'a full moon lights the night more');
    const blue = (hex) => hex & 0xff;
    assert(blue(newMoon.sky) < blue(NIGHT.sky) && blue(full.sky) > blue(NIGHT.sky), 'a deeper sky at new moon, a paler one at full');
    assert(newMoon.glow === NIGHT.glow && full.glow === NIGHT.glow, 'lamps shine the same whatever the moon');
    assert(moonlitLook(NIGHT, FULL_MOON) === full, 'the same night gives the same look back');
    assert(moonlitLook(DAY, MOON_PHASES[0]) === DAY && moonlitLook(DAY, FULL_MOON) === DAY, 'day is untouched');
    let previous = null;
    for (let i = 0; i <= 1000; i++) {
        const plain = skyLookAtFraction(i / 1000);
        for (const phase of MOON_PHASES) {
            const look = moonlitLook(plain, phase);
            assert(brightness(look) >= brightness(NIGHT) - 1e-9, `never darker than NIGHT (${phase.name} at ${i / 1000})`);
            assert(brightness(overcastLook(look, 1)) >= brightness(NIGHT) - 1e-9, `nor under overcast (${phase.name} at ${i / 1000})`);
            if (plain.glow <= 0.6) assert(look === plain, `dusk and dawn's sun is as it was (at ${i / 1000})`);
        }
        const look = moonlitLook(plain, MOON_PHASES[0]);
        if (previous) {
            assert(Math.abs(look.sunIntensity - previous.sunIntensity) < 0.06, `the moon's light comes in gradually (at ${i / 1000})`);
        }
        previous = look;
    }
    console.log('✓ a new moon\'s night as light but flatter, a full moon\'s brighter');
}

// The session lights each night by its moon.
{
    const clock = { now: at(12, 0.8) };
    const nav = new WorldNavigationSession({ registry: new CreateBrickRegistryUseCase().execute(), wildlifeClock: () => clock.now });
    const phase = moonPhaseAt(clock.now);
    assert(nav.skyBodies().moonPhase === phase, 'World View\'s moon is the night\'s phase');
    nav.setNoFlashes(true);
    assert(nav.skyLook() === overcastLook(moonlitLook(NIGHT, phase), weatherAt(clock.now).overcast), 'and its light the moon\'s');
    nav.setAlwaysDay(true);
    assert(nav.skyBodies() === DAY_SKY_BODIES && nav.skyLook() === DAY, 'Always day has no moon to light it');
    console.log('✓ the session lights each night by its moon');
}

// The renderer: the moon's disc faces the viewer and is lit from its phase's
// side; its dark side is the sky, a little paler; its halo grows with how much
// is lit; the stars fade under a bright moon.
{
    const added = [];
    const sceneManager = { add: (o) => added.push(o), remove: (o) => added.splice(added.indexOf(o), 1) };
    const bodies = new SkyBodies(sceneManager);
    const camera = new THREE.PerspectiveCamera(60, 1, 0.1, 1000);
    camera.position.set(4, 2, 7);
    camera.lookAt(4, 30, -50);
    const show = (phase, sky = NIGHT.sky) => {
        bodies.set(skyBodiesAtFraction(0.83, phase));
        bodies.update(camera, false, sky);
        return bodies.moon.material.uniforms;
    };
    let uniforms = show(MOON_PHASES[2]);
    const moon = bodies.moon;
    const towards = new THREE.Vector3(0, 0, 1).applyQuaternion(moon.quaternion);
    const direction = moon.position.clone().sub(camera.position).normalize();
    assert(towards.dot(direction) < -0.999999, 'the disc faces straight back at the viewer');
    assert(moon.material.fog === false, 'untouched by fog');
    assert(uniforms.uLight.value.x > 0.9 && Math.abs(uniforms.uLight.value.z) < 0.05, 'a first quarter is lit on its right, half of it');
    assert(show(MOON_PHASES[6]).uLight.value.x < -0.9, 'a third quarter on its left');
    assert(show(MOON_PHASES[1]).uLight.value.x > 0 && show(MOON_PHASES[1]).uLight.value.z < -0.6, 'a waxing crescent a sliver on its right');
    assert(show(FULL_MOON).uLight.value.z > 0.999, 'a full moon all over');
    assert(bodies.moonHalo.visible && Math.abs(bodies.moonHalo.material.opacity - 0.12) < 1e-9, 'with its fullest halo');
    uniforms = show(MOON_PHASES[0], 0x101828);
    assert(uniforms.uLight.value.z < -0.999, 'a new moon is dark to the viewer');
    assert(!bodies.moonHalo.visible, 'with no halo');
    const sky = new THREE.Color(0x101828);
    const dark = uniforms.uDark.value;
    assert(dark.b > sky.b && dark.b - sky.b < 0.2 && dark.r >= sky.r, 'its dark side is the sky, a little paler');
    bodies.update(camera, true);
    assert(!moon.visible && !bodies.moonHalo.visible, 'under water neither shows');
    bodies.dispose();
    assert(added.length === 0, 'disposing takes them out of the scene');

    const stars = new StarSky({ add() {}, remove() {} });
    const strengths = (moonlight) => {
        stars.set(1, 0, moonlight);
        stars.update(camera, 0);
        return { stars: stars._uniforms.uStarLight.value, milkyWay: stars._uniforms.uGlowLight.value };
    };
    const moonless = strengths(0);
    const bright = strengths(1);
    assert(moonless.stars === 1 && moonless.milkyWay === 1, 'with no moon lit, the stars as they always were');
    assert(bright.stars < 0.7 && bright.milkyWay < bright.stars, 'a full moon washes out the stars, and the Milky Way more');
    assert(strengths(NaN).stars === 1, 'nonsense is a dark sky');
    stars.dispose();
    console.log('✓ the moon drawn in its phase, and the stars fading under it');
}
