import * as THREE from 'three';
import { CELESTIAL_POLE, MILKY_WAY_STAR_COUNT, STAR_COUNT, milkyWayPole, milkyWayRibbon, starField, turnSky } from '../core/nature/StarField.js';
import { DAY_CYCLE_SECONDS, DAY_SKY_BODIES, skyBodiesAt, skyBodiesAtFraction } from '../core/nature/DayCycle.js';
import { compassLabelBetween } from '../core/world/CompassHeading.js';
import { StarSky } from '../renderer/StarSky.js';
import { assert } from './support/Assert.js';

// World View's night sky (core/nature/StarField.js, renderer/StarSky.js): the same
// stars for everyone, the Milky Way across them, and the whole sky turning
// once a day round the celestial pole, rising in the east and setting in
// the west with the sun and the moon.

const length = (d) => Math.hypot(d.x, d.y, d.z);
const dot = (a, b) => a.x * b.x + a.y * b.y + a.z * b.z;
const compass = (d) => compassLabelBetween({ x: 0, z: 0 }, { x: d.x, z: d.z });

// A fixed field, the same every time: many faint stars, few bright, spread
// evenly; the Milky Way's crowded in a band.
{
    const field = starField();
    assert(field === starField(), 'made once');
    assert(field.stars.length === STAR_COUNT && field.milkyWay.length === MILKY_WAY_STAR_COUNT, 'every star there');
    for (const star of [...field.stars, ...field.milkyWay]) {
        assert(Math.abs(length(star) - 1) < 1e-9, 'each a unit direction');
        assert(star.size > 0 && star.size < 5 && star.brightness > 0 && star.brightness <= 1, 'a sensible size and brightness');
        assert(Number.isInteger(star.color) && star.phase >= 0 && star.phase < Math.PI * 2, 'a color and a twinkle phase');
    }
    const upper = field.stars.filter((s) => s.y > 0).length / STAR_COUNT;
    assert(upper > 0.45 && upper < 0.55, `spread evenly over the sphere (${upper} in the upper half)`);
    const bright = field.stars.filter((s) => s.brightness > 0.8).length / STAR_COUNT;
    assert(bright > 0.02 && bright < 0.25, `a few bright stars among many faint ones (${bright})`);
    const pole = milkyWayPole();
    const nearBand = field.milkyWay.filter((s) => Math.abs(dot(s, pole)) < Math.sin(0.3)).length / MILKY_WAY_STAR_COUNT;
    assert(nearBand > 0.95, `the Milky Way's stars crowd its band (${nearBand})`);
    const ribbon = milkyWayRibbon(36, 0.2);
    assert(ribbon.length === 37 && ribbon.every(({ middle, left, right }) => Math.abs(dot(middle, pole)) < 1e-9
        && Math.abs(Math.acos(dot(middle, left)) - 0.2) < 1e-9 && Math.abs(Math.acos(dot(middle, right)) - 0.2) < 1e-9),
    'its glow runs round its middle, as wide either side');
    console.log('✓ a fixed field of stars, and the Milky Way crowded in a band');
}

// The sky turns once a day round the pole, which stands due north: a star on
// the celestial equator rises in the east, crosses the south and sets in the
// west, on the sun's own arc.
{
    assert(compass(CELESTIAL_POLE) === 'N' && CELESTIAL_POLE.y > 0.7, 'the pole stands in the north, high up');
    const pole = turnSky(CELESTIAL_POLE, 1.7);
    assert(length({ x: pole.x - CELESTIAL_POLE.x, y: pole.y - CELESTIAL_POLE.y, z: pole.z - CELESTIAL_POLE.z }) < 1e-9, 'the pole stays put');
    const east = { x: -1, y: 0, z: 0 };
    assert(compass(east) === 'E', 'east is where the compass says');
    const quarter = turnSky(east, Math.PI / 2);
    const half = turnSky(east, Math.PI);
    assert(compass(quarter) === 'S' && quarter.y > 0.6, 'a quarter turn on, it is high in the south');
    assert(compass(half) === 'W' && Math.abs(half.y) < 1e-9, 'half a turn on, it sets in the west');
    const sunAtNoon = skyBodiesAtFraction(0.34).sun;
    assert(Math.acos(Math.min(1, dot(quarter, sunAtNoon))) < 1e-6, 'on the very arc the sun takes');
    const anyStar = starField().stars[7];
    assert(Math.abs(length(turnSky(anyStar, 2.3)) - 1) < 1e-9 && Math.abs(dot(turnSky(anyStar, 2.3), CELESTIAL_POLE) - dot(anyStar, CELESTIAL_POLE)) < 1e-9,
        'every star keeps its distance from the pole');
    assert(skyBodiesAtFraction(0).skyTurn === 0 && Math.abs(skyBodiesAtFraction(0.5).skyTurn - Math.PI) < 1e-9, 'once round a day, from dawn');
    assert(skyBodiesAt(DAY_CYCLE_SECONDS * 3 + 0.25 * DAY_CYCLE_SECONDS).skyTurn === skyBodiesAtFraction(0.25).skyTurn,
        'from the clock, the same for everyone');
    assert(Number.isFinite(DAY_SKY_BODIES.skyTurn), 'Always day has a turn too (its stars stay hidden)');
    console.log('✓ the sky turns once a day round the north pole, east to west');
}

// The renderer: hidden by day and under water, out at night, far off round
// the camera, turned by the sky's turn.
{
    const added = [];
    const sceneManager = { add: (o) => added.push(o), remove: (o) => added.splice(added.indexOf(o), 1) };
    const sky = new StarSky(sceneManager, { pixelRatio: 2 });
    const camera = new THREE.PerspectiveCamera(60, 1, 0.1, 1000);
    camera.position.set(40, 3, -12);
    sky.set(0, 0);
    sky.update(camera, 0);
    assert(added.length === 1 && !sky.group.visible && sky.strength === 0, 'none by day');
    sky.set(0.6, 0);
    sky.update(camera, 0);
    assert(!sky.group.visible, 'none yet in an orange dusk');
    sky.set(1, 1.1);
    sky.update(camera, 5);
    assert(sky.group.visible && sky.strength === 1, 'all out at night');
    assert(sky.group.position.equals(camera.position) && Math.abs(sky.group.scale.x - 850) < 1e-9, 'far off round the camera, inside what it sees');
    const star = starField().stars[3];
    const drawn = new THREE.Vector3(star.x, star.y, star.z).applyQuaternion(sky.group.quaternion);
    const turned = turnSky(star, 1.1);
    assert(drawn.distanceTo(new THREE.Vector3(turned.x, turned.y, turned.z)) < 1e-6, 'turned as the sky has turned');
    sky.update(camera, 5, true);
    assert(!sky.group.visible, 'none under water');
    sky.set(NaN, NaN);
    sky.update(camera, 5);
    assert(!sky.group.visible, 'nonsense is day');
    sky.dispose();
    assert(added.length === 0, 'disposing takes it out of the scene');
    console.log('✓ the stars come out at night, far off round the camera, turned with the sky');
}
