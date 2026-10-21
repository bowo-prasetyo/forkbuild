import { isNightfallAt, NIGHTFALL_FRACTION } from '../core/nature/Nightfall.js';
import { DAY_CYCLE_SECONDS, dayFractionAt, skyLookAt } from '../core/nature/DayCycle.js';
import { seasonLookAt, yearDayAt, summerAt } from '../core/nature/Season.js';
import { wildlifeInRegion, ANIMAL_SPECIES } from '../core/nature/WildlifeField.js';
import { animalPoseAt, stationaryAnimalPoseAt, IDLE_ACTION, ANIMAL_MOTION } from '../core/nature/WildlifeMotion.js';
import { DEFAULT_WORLD_SEED } from '../core/nature/TerrainHeightField.js';
import { idleOffsetsAt, idleEnvelope, ANIMAL_IDLE } from '../renderer/AnimalIdle.js';
import { gaitOffsetsAt } from '../renderer/AnimalGait.js';
import { reactToObserver } from '../renderer/AnimalReaction.js';
import { assert } from './support/Assert.js';

// The World's night (core/nature/Nightfall.js), and wild animals bedding down
// in it (core/nature/WildlifeMotion.js, renderer/AnimalIdle.js). Residents going
// home at night are in tests/ResidentMotion.test.js.
//
//   Section A: when night falls — after the sun goes down, until dawn; later
//              in summer; the World's clock only
//   Section B: wild animals — back at their spot by night, lying down the night
//              through without getting up between segments, up and about by day
//   Section C: animals that stay put lie down too
//   Section D: how a resting animal looks, and that it gets up when you come close

const SEED = DEFAULT_WORLD_SEED;
const DAY_START = 1_758_998_400; // a dawn: 1_758_998_400 is a whole number of days

function angleBetween(a, b) {
    const d = Math.abs(a - b) % (Math.PI * 2);
    return Math.min(d, Math.PI * 2 - d);
}

function runTests() {
    // -------------------------------------------------------------
    // Section A — when night falls
    // -------------------------------------------------------------
    assert(dayFractionAt(DAY_START) === 0, '0. (fixture) DAY_START is a dawn');
    {
        let nights = 0;
        let sawNightfall = null;
        for (let t = DAY_START; t < DAY_START + DAY_CYCLE_SECONDS; t += 1) {
            const night = isNightfallAt(t);
            if (night) nights++;
            if (night && sawNightfall === null) sawNightfall = t;
        }
        const share = nights / DAY_CYCLE_SECONDS;
        assert(share > 0.3 && share < 0.45, `1. About a third of the World's day is night (${share.toFixed(2)})`);
        assert(!isNightfallAt(DAY_START + 60) && !isNightfallAt(DAY_START + DAY_CYCLE_SECONDS * 0.3), '2. Morning and midday are not');
        assert(skyLookAt(sawNightfall, seasonLookAt(sawNightfall).sky).glow > 0.5,
            '3. Night falls once the dusk has deepened and the lamps are lit');
        assert(isNightfallAt(DAY_START + DAY_CYCLE_SECONDS - 1), '4. ...and lasts until dawn');
        assert(!isNightfallAt(NaN) && !isNightfallAt(Infinity), '5. Without a clock it is never night');
        assert(NIGHTFALL_FRACTION > 0.6 && NIGHTFALL_FRACTION < 0.72, '6. (fixture) between dusk and full night');

        // Summer days are longer, so night falls later.
        const nightfallInDayOf = (start) => {
            let t = start;
            while (!isNightfallAt(t)) t += 1;
            return t - start;
        };
        let summerDay = null;
        let winterDay = null;
        for (let d = 0; d < 200 && (summerDay === null || winterDay === null); d++) {
            const start = DAY_START + d * DAY_CYCLE_SECONDS;
            const summer = summerAt(yearDayAt(start));
            if (summer > 0.95 && summerDay === null) summerDay = start;
            if (summer < -0.95 && winterDay === null) winterDay = start;
        }
        assert(summerDay !== null && winterDay !== null, '7. (fixture) a midsummer and a midwinter day');
        assert(nightfallInDayOf(summerDay) > nightfallInDayOf(winterDay) + 60, '8. Night falls later in midsummer than in midwinter');
    }

    let nightfall = DAY_START;
    while (!isNightfallAt(nightfall)) nightfall += 1;
    let dawn = nightfall;
    while (isNightfallAt(dawn)) dawn += 1;

    // -------------------------------------------------------------
    // Section B — wild animals
    // -------------------------------------------------------------
    {
        const animals = wildlifeInRegion(SEED, -400, -400, 400, 400).slice(0, 40);
        assert(animals.some((a) => a.species === ANIMAL_SPECIES.DEER) && animals.some((a) => a.species === ANIMAL_SPECIES.RABBIT),
            '9. (fixture) deer and rabbits');
        const STEP = 1 / 30;
        let maxJump = 0;
        let maxTurn = 0;
        for (const animal of animals) {
            const { segmentSeconds, walkSpeed } = ANIMAL_MOTION[animal.species];
            // From the evening into the night: every animal back at its spot,
            // lying still, its rest never dipping between segments.
            let previous = null;
            for (let t = nightfall - 3 * segmentSeconds; t <= nightfall + 6 * segmentSeconds; t += STEP) {
                const pose = animalPoseAt(SEED, animal, t);
                if (previous) {
                    maxJump = Math.max(maxJump, Math.hypot(pose.x - previous.x, pose.z - previous.z) / (walkSpeed * 1.5 * STEP));
                    maxTurn = Math.max(maxTurn, angleBetween(pose.rotationY, previous.rotationY));
                }
                if (t >= nightfall + segmentSeconds) {
                    assert(pose.x === animal.x && pose.z === animal.z && !pose.moving, '10. By night an animal is back where it was placed');
                    assert(pose.idleAction === IDLE_ACTION.REST, '11. ...lying down');
                    assert(idleEnvelope(pose.idleSeconds, pose.idleDuration) === 1,
                        '12. ...and stays down across segment boundaries, never getting up between them');
                    if (previous && previous.idleAction === IDLE_ACTION.REST) {
                        assert(pose.rotationY === previous.rotationY, '13. ...without turning in its sleep');
                    }
                }
                previous = pose;
            }
            // Into the morning: up and about again.
            let walked = false;
            let before = animalPoseAt(SEED, animal, dawn - 2 * segmentSeconds);
            for (let t = dawn - 2 * segmentSeconds + STEP; t < dawn; t += STEP) {
                const pose = animalPoseAt(SEED, animal, t);
                maxJump = Math.max(maxJump, Math.hypot(pose.x - before.x, pose.z - before.z) / (walkSpeed * 1.5 * STEP));
                maxTurn = Math.max(maxTurn, angleBetween(pose.rotationY, before.rotationY));
                before = pose;
            }
            for (let t = dawn; t <= dawn + 20 * segmentSeconds; t += STEP) {
                const pose = animalPoseAt(SEED, animal, t);
                maxJump = Math.max(maxJump, Math.hypot(pose.x - before.x, pose.z - before.z) / (walkSpeed * 1.5 * STEP));
                maxTurn = Math.max(maxTurn, angleBetween(pose.rotationY, before.rotationY));
                before = pose;
                walked = walked || pose.moving;
                assert(pose.idleAction !== IDLE_ACTION.REST || t < dawn + segmentSeconds, '14. By day nothing is lying down');
            }
            if (animal === animals[0]) assert(walked, '15. In the morning an animal walks again');
        }
        assert(maxJump <= 1 + 1e-9, `16. Walking home in the dusk, or off in the morning, never jumps (worst ${maxJump.toFixed(3)} of its peak speed)`);
        assert(maxTurn < 0.25, `17. ...nor snaps round (worst ${maxTurn.toFixed(3)} rad per frame)`);

        // Lying down takes a moment, at nightfall only.
        const animal = animals[0];
        const lying = [];
        for (let t = nightfall - ANIMAL_MOTION[animal.species].segmentSeconds; t <= nightfall + 60; t += 0.05) {
            const pose = animalPoseAt(SEED, animal, t);
            if (pose.idleAction === IDLE_ACTION.REST) lying.push(idleOffsetsAt(animal.species, pose.idleAction, pose.idleSeconds, pose.idleDuration).lift);
        }
        const settled = ANIMAL_IDLE[animal.species].rest.lift;
        assert(lying.length > 0 && Math.abs(lying[0]) < Math.abs(settled) / 2, '18. An animal sinks down gradually as it beds down');
        assert(lying.some((lift) => lift < settled * 0.9), '19. ...and lies low once settled');
    }

    // -------------------------------------------------------------
    // Section C — animals that stay put
    // -------------------------------------------------------------
    {
        for (const species of [ANIMAL_SPECIES.DEER, ANIMAL_SPECIES.RABBIT]) {
            const { segmentSeconds } = ANIMAL_MOTION[species];
            let previous = null;
            for (let t = nightfall + segmentSeconds; t <= dawn - segmentSeconds; t += 0.5) {
                const pose = stationaryAnimalPoseAt(SEED, 'decoration-1', species, t);
                assert(pose.idleAction === IDLE_ACTION.REST && idleEnvelope(pose.idleSeconds, pose.idleDuration) === 1,
                    `20. A ${species} that stays put lies down for the night too`);
                if (previous) assert(pose.rotationY === previous.rotationY, '21. ...still, facing one way');
                previous = pose;
            }
            const day = stationaryAnimalPoseAt(SEED, 'decoration-1', species, DAY_START + 300);
            assert(day.idleAction !== IDLE_ACTION.REST, '22. By day it does not');
        }
    }

    // -------------------------------------------------------------
    // Section D — how resting looks
    // -------------------------------------------------------------
    {
        for (const species of [ANIMAL_SPECIES.DEER, ANIMAL_SPECIES.RABBIT]) {
            const rest = idleOffsetsAt(species, IDLE_ACTION.REST, 500, 1000);
            assert(rest.lift < 0 && rest.headPitch > 0 && rest.headYaw === 0, `23. A resting ${species} lies low, head down`);
            const breathing = new Set();
            for (let s = 500; s < 504; s += 0.5) breathing.add(idleOffsetsAt(species, IDLE_ACTION.REST, s, 1000).lift.toFixed(5));
            assert(breathing.size > 1, '24. ...breathing slowly');
            assert(idleOffsetsAt(species, IDLE_ACTION.REST, 0, 1000).lift === 0, '25. ...and starts from standing');
            // You walk right up to it from the front: it lifts itself up.
            const pose = { rotationY: 0, idleSeconds: 500, idleDuration: 1000 };
            const near = reactToObserver(species, rest, pose, 0, 0, { x: 0, z: 1 });
            assert(near.lift > rest.lift, '26. A resting animal gets up as you come close');
            const far = reactToObserver(species, rest, pose, 0, 0, { x: 0, z: 50 });
            assert(far.lift === rest.lift, '27. ...but not from far off');
        }
        assert(gaitOffsetsAt(ANIMAL_SPECIES.DEER, 0).lift === 0, '28. (sanity) standing has no lift');
    }

    console.log('✅ Nightfall tests passed.');
}

runTests();
