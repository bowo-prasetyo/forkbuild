import { residentPoseAt, RESIDENT_MOTION } from '../core/ResidentMotion.js';
import { isResidentWalkClear, isResidentGroundAt, RESIDENT_COLLISION_RADIUS } from '../core/ResidentPath.js';
import { residentAppearanceFor, RESIDENT_TEMPLATE_ID } from '../core/ResidentAppearance.js';
import { surfaceCategoryAt, SURFACE_CATEGORY } from '../core/TerrainSurface.js';
import { DEFAULT_WORLD_SEED } from '../core/TerrainHeightField.js';
import { CoreAvatarTemplateLibrary } from '../core/library/CoreAvatarTemplateLibrary.js';
import { residentFacingFor, RESIDENT_REACTION } from '../renderer/ResidentReaction.js';
import { assert } from './support/Assert.js';

// Where a World Resident walks (core/ResidentMotion.js, core/ResidentPath.js),
// what it looks like (core/ResidentAppearance.js) and how it notices the
// viewer (renderer/ResidentReaction.js).
//
//   Section A: determinism and bounds
//   Section B: continuity — position and facing never jump, over hours
//   Section C: obstacles — a wall is never crossed; a blocked straight walk
//              detours by way of home; a blocked waypoint is home itself
//   Section D: core/ResidentPath.js — boxes, circles, water, slopes
//   Section E: appearance — deterministic, and always the template's own options
//   Section F: noticing the viewer — only while settled, never behind, and
//              never a jump in facing

const SEED = DEFAULT_WORLD_SEED;
const T0 = 1_759_000_000;
const STEP = 0.05;
const close = (a, b, eps = 1e-9) => Math.abs(a - b) < eps;

function angleBetween(a, b) {
    const d = Math.abs(a - b) % (Math.PI * 2);
    return Math.min(d, Math.PI * 2 - d);
}

// A home with dry, gentle ground all around it, so terrain never vetoes a
// walk and every test below is about what it means to test.
function openHome() {
    const reach = RESIDENT_MOTION.wanderRadius + 1;
    for (let x = 0; x < 4000; x += 13) {
        const home = { x, z: 17 };
        let ok = true;
        for (let a = 0; a < 16 && ok; a++) {
            const angle = (a / 16) * Math.PI * 2;
            ok = isResidentWalkClear(SEED, home, { x: home.x + Math.sin(angle) * reach, z: home.z + Math.cos(angle) * reach });
        }
        if (ok) return home;
    }
    throw new Error('No open home found — fixture assumption broken');
}

// Every sampled pose of `resident` over `seconds`, at STEP.
function track(resident, seconds, options = {}) {
    const poses = [];
    for (let t = 0; t <= seconds; t += STEP) {
        poses.push(residentPoseAt(resident, T0 + t, options));
    }
    return poses;
}

function runTests() {
    const home = openHome();
    const resident = { id: 'resident-a', home };
    const clear = (from, to) => isResidentWalkClear(SEED, from, to);
    const HOUR = 60 * 60;

    // -------------------------------------------------------------
    // Section A — determinism and bounds
    // -------------------------------------------------------------
    const hour = track(resident, HOUR, { isClear: clear });
    {
        const again = residentPoseAt(resident, T0 + 1234.5, { isClear: clear });
        const same = residentPoseAt({ id: 'resident-a', home: { ...home } }, T0 + 1234.5, { isClear: clear });
        assert(JSON.stringify(again) === JSON.stringify(same), '1. The same resident at the same moment is in the same place — no hidden state');
        const other = residentPoseAt({ id: 'resident-b', home }, T0 + 1234.5, { isClear: clear });
        assert(other.x !== again.x || other.z !== again.z, '2. Two residents sharing a home walk their own paths');
        const farthest = Math.max(...hour.map((p) => Math.hypot(p.x - home.x, p.z - home.z)));
        assert(farthest <= RESIDENT_MOTION.wanderRadius + 1e-9, '3. A resident never strays past its wander radius');
        assert(farthest > RESIDENT_MOTION.wanderRadius * 0.5, '4. ...but does get around within it');
        const walking = hour.filter((p) => p.moving).length / hour.length;
        assert(walking > 0.1 && walking < 0.5, `5. It spends some, not all, of its time walking (${walking.toFixed(2)})`);
        assert(hour.some((p) => p.idleDuration > 0), '6. It has idle pauses');
        assert(hour.every((p) => p.rotationY >= 0 && p.rotationY < Math.PI * 2), '7. rotationY is always in [0, 2π)');
        let threw = false;
        try { residentPoseAt(resident, NaN); } catch { threw = true; }
        assert(threw, '8. A non-finite time is refused');
    }

    // -------------------------------------------------------------
    // Section B — continuity
    // -------------------------------------------------------------
    {
        // Peak eased speed is 1.5x the average walking speed.
        const maxStep = RESIDENT_MOTION.walkSpeed * 1.5 * STEP + 1e-6;
        // Peak eased turning is 1.5x π per turn duration.
        const maxTurn = (1.5 * Math.PI / RESIDENT_MOTION.turnSeconds) * STEP + 1e-6;
        let worstStep = 0;
        let worstTurn = 0;
        for (let i = 1; i < hour.length; i++) {
            worstStep = Math.max(worstStep, Math.hypot(hour[i].x - hour[i - 1].x, hour[i].z - hour[i - 1].z));
            worstTurn = Math.max(worstTurn, angleBetween(hour[i].rotationY, hour[i - 1].rotationY));
        }
        assert(worstStep <= maxStep, `9. Position never jumps (worst ${worstStep.toFixed(4)} per frame)`);
        assert(worstTurn <= maxTurn, `10. Facing never snaps (worst ${worstTurn.toFixed(4)} rad per frame)`);
        for (let i = 1; i < hour.length; i++) {
            if (hour[i].moving && hour[i - 1].moving) {
                const heading = Math.atan2(hour[i].x - hour[i - 1].x, hour[i].z - hour[i - 1].z);
                const moved = Math.hypot(hour[i].x - hour[i - 1].x, hour[i].z - hour[i - 1].z);
                if (moved > 1e-3) {
                    assert(angleBetween(heading, hour[i].rotationY) < 1e-6, '11. A walking resident faces the way it walks');
                }
            }
        }
        // Across a segment boundary exactly.
        const phaseProbe = residentPoseAt(resident, T0, { isClear: clear });
        assert(phaseProbe, '12. (probe)');
        for (let k = 0; k < 50; k++) {
            const boundary = T0 + k * RESIDENT_MOTION.segmentSeconds * 1.37;
            const a = residentPoseAt(resident, boundary - 1e-4, { isClear: clear });
            const b = residentPoseAt(resident, boundary + 1e-4, { isClear: clear });
            assert(Math.hypot(a.x - b.x, a.z - b.z) < 1e-3 && angleBetween(a.rotationY, b.rotationY) < 1e-2,
                '13. Continuous everywhere, segment boundaries included');
        }
    }

    // -------------------------------------------------------------
    // Section C — obstacles
    // -------------------------------------------------------------
    {
        // A wall right through the middle of its range, leaving a gap round
        // neither end (it runs well past the wander radius both ways).
        const wall = { min: { x: home.x + 1, z: home.z - 20 }, max: { x: home.x + 1.4, z: home.z + 20 } };
        const walled = (from, to) => isResidentWalkClear(SEED, from, to, { boxes: [wall] });
        const poses = track(resident, HOUR, { isClear: walled });
        assert(poses.every((p) => p.x <= wall.min.x - RESIDENT_COLLISION_RADIUS + 1e-9),
            '14. A resident never walks through (or into) a wall on its home\'s side');
        assert(poses.some((p) => Math.hypot(p.x - home.x, p.z - home.z) > 3), '15. ...and still strolls on its own side');

        // A pillar between home and the far side: straight walks across it are
        // blocked, but each end can see home, so it goes round by home.
        const pillar = { center: { x: home.x + 3, z: home.z }, radius: 0.8 };
        const pillared = (from, to) => isResidentWalkClear(SEED, from, to, { circles: [pillar] });
        const around = track({ id: 'resident-c', home }, HOUR, { isClear: pillared });
        for (let i = 1; i < around.length; i++) {
            assert(isResidentWalkClear(SEED, around[i - 1], around[i], { circles: [pillar], radius: RESIDENT_COLLISION_RADIUS - 1e-6 }),
                '16. A resident never passes through a pillar in its way');
        }
        // Arriving home mid-walk, turning in place there (no idle window), and
        // walking on within one turn's time.
        const turnFrames = Math.ceil(RESIDENT_MOTION.turnSeconds / STEP) + 1;
        const detours = around.filter((p, i) => i > 0 && !p.moving && around[i - 1].moving
            && p.idleDuration === 0
            && Math.hypot(p.x - home.x, p.z - home.z) < 1e-9
            && around.slice(i + 1, i + 1 + turnFrames).some((q) => q.moving));
        assert(detours.length > 0, '17. ...detouring by way of home, where it stops to turn');

        // Everything blocked: it simply stays home.
        const boxedIn = track({ id: 'resident-d', home }, 600, { isClear: () => false });
        assert(boxedIn.every((p) => p.x === home.x && p.z === home.z && !p.moving), '18. With nowhere to go, a resident stands at home');
        assert(boxedIn.some((p, i) => i > 0 && p.rotationY !== boxedIn[0].rotationY), '19. ...turning now and then instead of freezing');
    }

    // -------------------------------------------------------------
    // Section D — core/ResidentPath.js
    // -------------------------------------------------------------
    {
        const box = { min: { x: 0, z: 0 }, max: { x: 1, z: 1 } };
        const at = (x, z) => ({ x: home.x + x, z: home.z + z });
        const shifted = { min: at(0, 0), max: at(1, 1) };
        assert(!isResidentWalkClear(SEED, at(-2, 0.5), at(3, 0.5), { boxes: [shifted] }), '20. A walk through a box is blocked');
        assert(!isResidentWalkClear(SEED, at(-2, 1.2), at(3, 1.2), { boxes: [shifted] }), '21. ...and so is one grazing it within the body radius');
        assert(isResidentWalkClear(SEED, at(-2, 1.5), at(3, 1.5), { boxes: [shifted] }), '22. One passing clear of it is not');
        assert(!isResidentWalkClear(SEED, at(0.5, -3), at(0.5, 3), { boxes: [shifted] }), '23. Along either axis');
        assert(box.min.x === 0, '(fixture)');
        assert(!isResidentWalkClear(SEED, at(-2, 0), at(2, 0), { circles: [{ center: at(0, 0.5), radius: 0.3 }] }), '24. A walk past a trunk closer than both radii is blocked');
        assert(isResidentWalkClear(SEED, at(-2, 0), at(2, 0), { circles: [{ center: at(0, 1), radius: 0.3 }] }), '25. ...one farther is not');

        let wet = null;
        for (let x = -3000; x < 3000 && !wet; x += 7) {
            for (let z = -3000; z < 3000 && !wet; z += 97) {
                if (surfaceCategoryAt(SEED, x, z) === SURFACE_CATEGORY.WATER) wet = { x, z };
            }
        }
        assert(wet && !isResidentGroundAt(SEED, wet.x, wet.z), '26. A lake is not ground a resident stands on');
        assert(!isResidentWalkClear(SEED, { x: wet.x - 0.01, z: wet.z }, wet), '27. ...nor walks into');
        assert(isResidentWalkClear(SEED, at(0, 0), at(3, 0), { maxSlope: 100 }), '28. Open ground is clear');
        assert(!isResidentWalkClear(SEED, at(0, 0), at(3, 0), { maxSlope: -1 }), '29. Slope limits apply along the whole walk');
    }

    // -------------------------------------------------------------
    // Section E — appearance
    // -------------------------------------------------------------
    {
        const template = CoreAvatarTemplateLibrary.templates.find((t) => t.templateId === RESIDENT_TEMPLATE_ID);
        const a = residentAppearanceFor('resident-a', template);
        assert(JSON.stringify(a) === JSON.stringify(residentAppearanceFor('resident-a', template)), '30. The same resident always wears the same');
        const looks = new Set(Array.from({ length: 40 }, (_, i) => JSON.stringify(residentAppearanceFor(`r-${i}`, template))));
        assert(looks.size > 30, '31. Residents look varied');
        for (let i = 0; i < 40; i++) {
            const look = residentAppearanceFor(`r-${i}`, template);
            for (const name of ['skin', 'hair', 'shirt', 'pants']) {
                assert(template.getComponent(name).options.includes(look[name]), `32. Every ${name} is one of the template's own options`);
            }
            assert(/^#[0-9a-f]{6}$/.test(look.shirtColor) && Array.isArray(look.accessories), '33. ...with valid colors and accessories');
        }
        const slim = CoreAvatarTemplateLibrary.templates.find((t) => t.templateId === 'humanoid-02');
        const onSlim = residentAppearanceFor('resident-a', slim);
        assert(slim.getComponent('hair').options.includes(onSlim.hair), '34. Any template works, each from its own options');
    }

    // -------------------------------------------------------------
    // Section F — noticing the viewer
    // -------------------------------------------------------------
    {
        const settled = { x: 0, z: 0, rotationY: 0, idleSeconds: 4, idleDuration: 8 };
        const walking = { x: 0, z: 0, rotationY: 0, idleSeconds: 0, idleDuration: 0 };
        const side = { x: 2, z: 0 }; // 90° to its right (+X), close
        const facing = residentFacingFor(settled, side);
        assert(close(facing.rotationY, Math.PI / 2, 1e-6) && close(facing.attention, 1), '35. A settled resident turns to face a nearby avatar');
        assert(residentFacingFor(walking, side).rotationY === 0, '36. A walking one keeps walking the way it goes');
        assert(residentFacingFor(settled, null).rotationY === 0, '37. With no avatar, nothing changes');
        assert(residentFacingFor(settled, { x: 0, z: RESIDENT_REACTION.noticeRadius + 0.1 }).attention === 0, '38. Nor from beyond the notice radius');
        assert(residentFacingFor(settled, { x: 0, z: -2 }).attention === 0, '39. Nor from directly behind');
        // Circle the resident at a steady distance: its facing never jumps.
        let previous = null;
        let worst = 0;
        for (let a = 0; a <= 720; a += 0.5) {
            const r = (a * Math.PI) / 180;
            const f = residentFacingFor(settled, { x: Math.sin(r) * 3, z: Math.cos(r) * 3 }).rotationY;
            if (previous !== null) worst = Math.max(worst, angleBetween(f, previous));
            previous = f;
        }
        assert(worst < 0.1, `40. Circling a resident, its facing follows smoothly (worst ${worst.toFixed(3)} rad per half-degree)`);
        // Walk straight up to it from the front: attention only grows.
        let last = 0;
        for (let d = 7; d >= 0.5; d -= 0.05) {
            const attention = residentFacingFor(settled, { x: 0.3, z: d }).attention;
            assert(attention >= last - 1e-12, '41. Approaching from the front, attention only grows');
            last = attention;
        }
        // Over an hour of real poses with an avatar standing nearby: never a snap.
        const observer = { x: home.x + 2, z: home.z + 1 };
        let prev = null;
        let worstReal = 0;
        for (const pose of hour) {
            const f = residentFacingFor(pose, observer).rotationY;
            if (prev !== null) worstReal = Math.max(worstReal, angleBetween(f, prev));
            prev = f;
        }
        assert(worstReal < 0.3, `42. Over an hour of pauses and walks with you nearby, its facing never snaps (worst ${worstReal.toFixed(3)})`);
    }

    console.log('✅ All Resident Motion tests passed.');
}

runTests();
