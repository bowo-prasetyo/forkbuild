import { readFile } from 'node:fs/promises';

import { terrainHeightAt, DEFAULT_WORLD_SEED } from '../core/TerrainHeightField.js';
import { surfaceCategoryAt, SURFACE_CATEGORY, WATER_LEVEL } from '../core/TerrainSurface.js';
import { LAKE_SURFACE_HEIGHT, isRiverAt } from '../core/Hydrology.js';
import { AVATAR_COLLISION_HEIGHT } from '../core/AvatarCollision.js';
import { DEFAULT_MAX_WALKING_DEPTH, isWalkableWaterDepth, waterDepthSpeedFactor } from '../core/AvatarWaterWalkability.js';
import { AvatarWaterConstraint } from '../application/avatar/AvatarWaterConstraint.js';
import { AvatarTerrainConstraint } from '../application/avatar/AvatarTerrainConstraint.js';
import { AvatarMovementController } from '../application/avatar/AvatarMovementController.js';
import { simulateAvatarMovement } from '../core/AvatarMovementSimulation.js';
import { AvatarMovementState } from '../core/AvatarMovementState.js';
import { AvatarAnimationState } from '../core/AvatarAnimationState.js';
import { AvatarTemplateRegistry } from '../core/AvatarTemplateRegistry.js';
import { CoreAvatarTemplateLibrary } from '../core/library/CoreAvatarTemplateLibrary.js';
import { AvatarProfileUseCase } from '../application/avatar/AvatarProfileUseCase.js';
import { AvatarPresenceSession } from '../application/avatar/AvatarPresenceSession.js';
import { LocalIdentityProvider } from '../identity/LocalIdentityProvider.js';
import { StorageProvider } from '../storage/StorageProvider.js';
import { assert } from './support/Assert.js';

// 0.9.634 — Avatar Shallow-Water Ground Traversal.
//
// tests/AvatarShallowWaterTraversalBoundaryAudit.test.js (0.9.633) proved
// the mechanical shape (a render-time depth-aware floor, an append-only
// horizontal depth constraint, a depth-derived speed multiplier) ready to
// implement as a minimal, additive extension of 0.9.615/0.2.77's own
// existing patterns, using TEST-LOCAL candidates never installed
// anywhere. This milestone installs exactly that:
//
//   core/AvatarWaterWalkability.js         — pure depth/speed math
//   application/avatar/AvatarWaterConstraint.js   — the application-layer half
//   application/avatar/AvatarMovementController.js — a fifth, optional,
//                                              append-only waterConstraint
//   core/AvatarMovementSimulation.js       — a waterSpeedFactor multiplier
//   application/world/RenderWorldViewUseCase.js  — withGroundElevation() now
//                                              follows the lakebed within
//                                              DEFAULT_MAX_WALKING_DEPTH
//
// This file tests the REAL, installed production code — never a
// test-local stand-in — against real generated terrain under
// DEFAULT_WORLD_SEED, plus a small number of synthetic/injected
// coordinates (the same "engineered boundary, never a hand-hunted real
// one" discipline application/avatar/AvatarTerrainConstraint.js's own tests
// already established) purely to exercise the exact walkable/blocked
// boundary precisely.
//
//   Section A: dry-land regression — every seam this milestone touches
//              is byte-for-byte unchanged outside water.
//   Section B: shallow-water ground following — real terrain, feet at
//              the real lakebed height, not the water surface.
//   Section C: depth-speed monotonicity — speed never increases as
//              depth increases; depth 0 means land speed exactly.
//   Section D: maximum-depth blocking — the boundary convention
//              (inclusive at the limit) is explicit and tested.
//   Section E: recovery — land -> shallow -> boundary -> blocked ->
//              retreat -> shallow -> normal resumes, no persistent
//              "blocked" state.
//   Section F: land -> water -> land, repeated — no hysteresis.
//   Section G: horizontal movement — blocking deeper movement never
//              blocks movement along the shoreline or into shallower
//              water.
//   Section H: rendering interaction — the 0.9.615 -> 0.9.634
//              transition, against the real, current, shipped function.
//   Section I: jump interaction — vertical motion composes correctly
//              with both the blocking constraint and the render floor.
//   Section J: river behavior — a structural no-op, exactly like the
//              existing 0.9.615 clamp.
//   Section K: statelessness — the result depends only on current
//              (position, terrain, water surface, threshold).
//   Section L: full controller integration — a real, wired
//              AvatarMovementController drives the whole story end to
//              end through real ticks.

async function readSource(relativePath) {
    return readFile(new URL(`../${relativePath}`, import.meta.url), 'utf8');
}

function extractFunctionBody(source, startMarker) {
    const start = source.indexOf(startMarker);
    if (start === -1) return null;
    const braceStart = source.indexOf('{', start);
    if (braceStart === -1) return null;
    let depth = 0;
    for (let i = braceStart; i < source.length; i++) {
        if (source[i] === '{') depth++;
        else if (source[i] === '}') {
            depth--;
            if (depth === 0) return source.slice(start, i + 1);
        }
    }
    return null;
}

function findShoreline(seed, halfExtent) {
    for (let x = -halfExtent; x < halfExtent; x++) {
        for (let z = -halfExtent; z < halfExtent; z++) {
            if (surfaceCategoryAt(seed, x, z) !== SURFACE_CATEGORY.WATER) continue;
            const neighbors = [[x + 1, z], [x - 1, z], [x, z + 1], [x, z - 1]];
            for (const [nx, nz] of neighbors) {
                if (surfaceCategoryAt(seed, nx, nz) !== SURFACE_CATEGORY.WATER) {
                    return { shoreX: nx, shoreZ: nz, lakeX: x, lakeZ: z, dirX: x - nx, dirZ: z - nz };
                }
            }
        }
    }
    return null;
}

function findRiverCoordinate(seed, halfExtent) {
    for (let x = -halfExtent; x < halfExtent; x++) {
        for (let z = -halfExtent; z < halfExtent; z++) {
            if (isRiverAt(seed, x, z)) return { x, z };
        }
    }
    return null;
}

// Real-terrain walk, using the REAL, unmodified AvatarTerrainConstraint
// (slope-only — never a hand-picked coordinate), exactly the same
// technique 0.9.613-0.9.616's own tests already established.
function walkInto(seed, start, dirX, dirZ, stepSize, stepCount) {
    const constraint = new AvatarTerrainConstraint({ seed });
    let cursor = { ...start };
    for (let i = 0; i < stepCount; i++) {
        const desired = { x: cursor.x + dirX * stepSize, y: 0, z: cursor.z + dirZ * stepSize };
        const stepResult = constraint.apply(cursor, desired);
        if (stepResult.blocked) break;
        cursor = stepResult.position;
    }
    return cursor;
}

function buildAvatarStack(registry, username) {
    class InMemoryStorageProvider extends StorageProvider {
        constructor() { super(); this._data = new Map(); }
        save(name, data) { this._data.set(name, JSON.parse(JSON.stringify(data))); }
        load(name) { return this._data.has(name) ? JSON.parse(JSON.stringify(this._data.get(name))) : null; }
        remove(name) { this._data.delete(name); }
        list() { return Array.from(this._data.keys()); }
    }
    const storage = new InMemoryStorageProvider();
    const identityProvider = new LocalIdentityProvider(storage);
    identityProvider.login(username);
    const avatarProfileUseCase = new AvatarProfileUseCase(storage, identityProvider, registry);
    return { profile: avatarProfileUseCase.getProfile() };
}

async function run() {
    const seed = DEFAULT_WORLD_SEED;
    const SCAN_HALF_EXTENT = 400;

    const shoreline = findShoreline(seed, SCAN_HALF_EXTENT);
    assert(shoreline !== null, 'setup: a real lake shoreline exists in the scanned region under the default world seed');
    const river = findRiverCoordinate(seed, SCAN_HALF_EXTENT);
    assert(river !== null, 'setup: a real river coordinate exists in the scanned region under the default world seed');

    const dryPoint = { x: shoreline.shoreX, y: 0, z: shoreline.shoreZ };
    const shallowPoint = { x: shoreline.lakeX, y: 0, z: shoreline.lakeZ };
    const shallowDepth = LAKE_SURFACE_HEIGHT - terrainHeightAt(seed, shallowPoint.x, shallowPoint.z);
    assert(shallowDepth > 0 && shallowDepth < DEFAULT_MAX_WALKING_DEPTH,
        `setup: the shoreline's own first wet cell is genuinely shallow (depth ${shallowDepth.toFixed(4)}), under DEFAULT_MAX_WALKING_DEPTH (${DEFAULT_MAX_WALKING_DEPTH})`);

    // A real, genuinely deep coordinate in the SAME lake — walked to via
    // the real, unmodified AvatarTerrainConstraint (slope-only), never
    // hand-picked. 530 steps of 0.3 world units (159 units) reproduces
    // exactly the same real coordinate
    // tests/AvatarBasicWaterTraversalProductClosureAudit.test.js (0.9.616,
    // amended by this milestone) already confirmed exceeds
    // DEFAULT_MAX_WALKING_DEPTH in this same real lake.
    const deepPoint = walkInto(seed, dryPoint, shoreline.dirX, shoreline.dirZ, 0.3, 530);
    const deepDepth = LAKE_SURFACE_HEIGHT - terrainHeightAt(seed, deepPoint.x, deepPoint.z);
    assert(surfaceCategoryAt(seed, deepPoint.x, deepPoint.z) === SURFACE_CATEGORY.WATER,
        'setup: the reproduced deep-water walk genuinely ends on real WATER ground');
    assert(deepDepth > DEFAULT_MAX_WALKING_DEPTH,
        `setup: the reproduced deep-water walk genuinely exceeds DEFAULT_MAX_WALKING_DEPTH (depth ${deepDepth.toFixed(4)} > ${DEFAULT_MAX_WALKING_DEPTH})`);

    // -------------------------------------------------------------
    // Section A — dry-land regression.
    // -------------------------------------------------------------
    {
        const waterConstraint = new AvatarWaterConstraint({ seed });
        assert(waterConstraint.depthAt(dryPoint.x, dryPoint.z) === 0,
            '1. AvatarWaterConstraint#depthAt() reports exactly 0 on ordinary dry ground');
        assert(waterConstraint.speedFactorAt(dryPoint.x, dryPoint.z) === 1,
            '2. AvatarWaterConstraint#speedFactorAt() reports exactly 1 (full land speed) on ordinary dry ground');
        const dryResult = waterConstraint.apply(dryPoint, { x: dryPoint.x + 1, y: 0, z: dryPoint.z });
        assert(dryResult.blocked === false,
            '3. AvatarWaterConstraint#apply() never blocks a step between two dry coordinates');

        // simulateAvatarMovement() with no waterSpeedFactor at all (the
        // overwhelming majority of existing call sites, including every
        // test written before this milestone) is byte-for-byte unchanged.
        const forwardState = new AvatarMovementState({ forwardAxis: 1 });
        const withoutFactor = simulateAvatarMovement({ position: { x: 0, y: 0, z: 0 }, movementState: forwardState, deltaSeconds: 0.1, movementSpeed: 3 });
        const withNoOpFactor = simulateAvatarMovement({ position: { x: 0, y: 0, z: 0 }, movementState: forwardState, deltaSeconds: 0.1, movementSpeed: 3, waterSpeedFactor: 1 });
        assert(withoutFactor.position.z === withNoOpFactor.position.z && withoutFactor.currentMovementSpeed === withNoOpFactor.currentMovementSpeed,
            '4. simulateAvatarMovement() with waterSpeedFactor omitted produces the byte-identical result to waterSpeedFactor: 1 — an explicit no-op default, never a silent behavior change for every pre-0.9.634 caller');

        // A controller built without a waterConstraint (every pre-0.9.634
        // caller, and every other test in this codebase) behaves exactly
        // as it did before this milestone.
        const registry = new AvatarTemplateRegistry();
        registry.register(CoreAvatarTemplateLibrary);
        const { profile } = buildAvatarStack(registry, 'shallow-water-dry-regression');
        const session = new AvatarPresenceSession(profile, { position: { x: 0, y: 0, z: 0 }, rotation: { x: 0, y: 0, z: 0 } });
        const controller = new AvatarMovementController(session, null, null, null, null, null);
        assert(typeof controller.isBlockedByWaterDepth === 'function' && controller.isBlockedByWaterDepth() === false,
            '5. a controller built with no waterConstraint reports isBlockedByWaterDepth() === false, and gains no other observable behavior change');
    }

    // -------------------------------------------------------------
    // Section B — shallow-water ground following.
    // -------------------------------------------------------------
    let realWithGroundElevation;
    let withGroundElevationBody;
    const renderWorldViewSource = await readSource('application/world/RenderWorldViewUseCase.js');
    {
        withGroundElevationBody = extractFunctionBody(renderWorldViewSource, 'function withGroundElevation(position) {');
        assert(withGroundElevationBody !== null, '6. application/world/RenderWorldViewUseCase.js#withGroundElevation() is located and extracted from its real, current source text');
        const buildWithGroundElevation = new Function(
            'renderer', 'surfaceCategoryAt', 'SURFACE_CATEGORY', 'LAKE_SURFACE_HEIGHT', 'DEFAULT_WORLD_SEED', 'DEFAULT_MAX_WALKING_DEPTH',
            `${withGroundElevationBody}\nreturn withGroundElevation;`
        );
        const fakeRenderer = { terrainHeightAt: (x, z) => terrainHeightAt(seed, x, z) };
        realWithGroundElevation = buildWithGroundElevation(fakeRenderer, surfaceCategoryAt, SURFACE_CATEGORY, LAKE_SURFACE_HEIGHT, DEFAULT_WORLD_SEED, DEFAULT_MAX_WALKING_DEPTH);

        const waterSurfaceY = LAKE_SURFACE_HEIGHT;
        const terrainY = terrainHeightAt(seed, shallowPoint.x, shallowPoint.z);
        assert(waterSurfaceY > terrainY,
            `7. at the real shallow coordinate, the water surface (${waterSurfaceY}) genuinely sits above the real underwater terrain (${terrainY.toFixed(4)}) — a real depth to follow, not a degenerate zero`);

        const rendered = realWithGroundElevation(shallowPoint);
        assert(Math.abs(rendered.y - (shallowPoint.y + terrainY)) < 1e-9,
            '8. FLAGSHIP — the real, shipped withGroundElevation() renders the avatar\'s feet at the real underwater TERRAIN height, not the water surface, for genuinely shallow water within DEFAULT_MAX_WALKING_DEPTH');
        assert(rendered.y < waterSurfaceY,
            '9. ...strictly below the water surface — the avatar visibly wades, legs in the translucent water plane, rather than standing on top of it');

        // Beyond the limit, the existing 0.9.615 surface clamp remains
        // available, never deleted.
        const deepRendered = realWithGroundElevation(deepPoint);
        assert(Math.abs(deepRendered.y - LAKE_SURFACE_HEIGHT) < 1e-9,
            '10. beyond DEFAULT_MAX_WALKING_DEPTH, the existing 0.9.615 clamp still applies exactly — the avatar renders AT the water surface, never below it, for water genuinely too deep to walk');
    }

    // -------------------------------------------------------------
    // Section C — depth-speed monotonicity.
    // -------------------------------------------------------------
    {
        assert(waterDepthSpeedFactor(0, DEFAULT_MAX_WALKING_DEPTH) === 1,
            '11. at depth 0, the speed factor is exactly 1 — identical to existing land speed, by definition');

        const fractions = [0, 0.25, 0.5, 0.75, 0.99];
        const factors = fractions.map((f) => waterDepthSpeedFactor(f * DEFAULT_MAX_WALKING_DEPTH, DEFAULT_MAX_WALKING_DEPTH));
        for (let i = 1; i < factors.length; i++) {
            assert(factors[i] <= factors[i - 1] + 1e-12,
                `12. depth fraction ${fractions[i]} produces a speed factor (${factors[i].toFixed(4)}) that never exceeds the factor at a shallower depth fraction ${fractions[i - 1]} (${factors[i - 1].toFixed(4)}) — depth increases, speed never increases`);
        }
        assert(factors[0] === 1, '13. the 0% sample is exactly full land speed');
        assert(factors[factors.length - 1] > 0 && factors[factors.length - 1] < factors[0],
            '14. the 99% sample is strictly slower than land speed, and still strictly positive — the avatar keeps moving, however slowly, right up to the walkable limit');

        // Composes with movementSpeed exactly like RUN_SPEED_MULTIPLIER
        // already does — see core/AvatarMovementSimulation.js's own
        // 0.9.634 header.
        const forwardState = new AvatarMovementState({ forwardAxis: 1 });
        const landSpeed = 3;
        const depthFactor = waterDepthSpeedFactor(shallowDepth, DEFAULT_MAX_WALKING_DEPTH);
        const onLand = simulateAvatarMovement({ position: { x: 0, y: 0, z: 0 }, movementState: forwardState, deltaSeconds: 0.1, movementSpeed: landSpeed });
        const inShallowWater = simulateAvatarMovement({ position: { x: 0, y: 0, z: 0 }, movementState: forwardState, deltaSeconds: 0.1, movementSpeed: landSpeed, waterSpeedFactor: depthFactor });
        const landStep = Math.abs(onLand.position.z);
        const waterStep = Math.abs(inShallowWater.position.z);
        assert(landStep > 0 && waterStep > 0 && waterStep < landStep,
            `15. a real shallow-water depth factor (${depthFactor.toFixed(4)}) genuinely produces a SLOWER step than dry land in the real simulation function — the reduction is live, not merely a number computed in isolation`);
        assert(Math.abs(waterStep / landStep - depthFactor) < 1e-9,
            '16. ...and the reduction is EXACTLY proportional to the depth factor, composing multiplicatively with the existing base speed, exactly like the running multiplier already does');
    }

    // -------------------------------------------------------------
    // Section D — maximum-depth blocking: the boundary convention is
    // explicit and tested, using an injected, engineered depth field —
    // the same "engineered boundary, never a hand-hunted real one"
    // discipline AvatarTerrainConstraint's own tests already establish.
    // -------------------------------------------------------------
    {
        // depth(x) = x exactly, for x >= 0; water starts at x = 0.
        const syntheticHeightAt = (x) => LAKE_SURFACE_HEIGHT - Math.max(0, x);
        const syntheticIsWaterAt = (x) => x >= 0;
        const boundaryConstraint = new AvatarWaterConstraint({
            maxWalkingDepth: DEFAULT_MAX_WALKING_DEPTH,
            heightAt: (x) => syntheticHeightAt(x),
            isWaterAt: (x) => syntheticIsWaterAt(x)
        });

        const justBelow = { x: DEFAULT_MAX_WALKING_DEPTH - 0.01, y: 0, z: 0 };
        const atLimit = { x: DEFAULT_MAX_WALKING_DEPTH, y: 0, z: 0 };
        const justBeyond = { x: DEFAULT_MAX_WALKING_DEPTH + 0.01, y: 0, z: 0 };
        const from = { x: 0, y: 0, z: 0 };

        assert(boundaryConstraint.apply(from, justBelow).blocked === false,
            '17. just below DEFAULT_MAX_WALKING_DEPTH: allowed');
        assert(boundaryConstraint.apply(from, atLimit).blocked === false,
            '18. AT DEFAULT_MAX_WALKING_DEPTH exactly: the boundary convention is INCLUSIVE (allowed) — the same "<=" convention core/TerrainWalkability.js#isWalkableSlope() already uses, explicit and tested rather than left ambiguous');
        assert(boundaryConstraint.apply(from, justBeyond).blocked === true,
            '19. just beyond DEFAULT_MAX_WALKING_DEPTH: blocked');

        // isWalkableWaterDepth() itself agrees with the constraint that
        // consumes it, at the exact same three points.
        assert(isWalkableWaterDepth(DEFAULT_MAX_WALKING_DEPTH - 0.01, DEFAULT_MAX_WALKING_DEPTH) === true &&
            isWalkableWaterDepth(DEFAULT_MAX_WALKING_DEPTH, DEFAULT_MAX_WALKING_DEPTH) === true &&
            isWalkableWaterDepth(DEFAULT_MAX_WALKING_DEPTH + 0.01, DEFAULT_MAX_WALKING_DEPTH) === false,
            '20. core/AvatarWaterWalkability.js#isWalkableWaterDepth() itself agrees with AvatarWaterConstraint at all three boundary points — one shared definition, not two that could drift');

        // A blocked step reverts X/Z but passes Y through unchanged —
        // the identical convention AvatarTerrainConstraint.apply() and
        // AvatarStepConstraint.apply() already use.
        const blockedResult = boundaryConstraint.apply({ x: 0, y: 0, z: 0 }, { x: DEFAULT_MAX_WALKING_DEPTH + 0.01, y: 1.4, z: 0 });
        assert(blockedResult.blocked === true && blockedResult.position.x === 0 && blockedResult.position.y === 1.4 && blockedResult.position.z === 0,
            '21. a blocked step reverts X/Z to the caller\'s own current position, but Y still passes through from the desired position unchanged — a rejected horizontal step must never also cancel a jump/fall already in progress');
    }

    // -------------------------------------------------------------
    // Section E — recovery: land -> shallow -> boundary -> blocked ->
    // retreat -> shallow -> normal resumes, with no persistent state.
    // -------------------------------------------------------------
    {
        const syntheticHeightAt = (x) => LAKE_SURFACE_HEIGHT - Math.max(0, x) * 0.2; // gentle slope, well under DEFAULT_MAX_WALKABLE_SLOPE
        const syntheticIsWaterAt = (x) => x >= 0;
        const waterConstraint = new AvatarWaterConstraint({ heightAt: (x) => syntheticHeightAt(x), isWaterAt: (x) => syntheticIsWaterAt(x) });
        const terrainConstraint = new AvatarTerrainConstraint({ heightAt: (x) => syntheticHeightAt(x) });

        let cursor = { x: -5, y: 0, z: 0 }; // starts on dry land (x < 0)
        const STEP = 0.5;
        let blockedAt = null;
        for (let i = 0; i < 60; i++) {
            const desired = { x: cursor.x + STEP, y: 0, z: cursor.z };
            const slopeResult = terrainConstraint.apply(cursor, desired);
            const depthResult = waterConstraint.apply(cursor, desired);
            if (slopeResult.blocked || depthResult.blocked) { blockedAt = { ...cursor }; break; }
            cursor = desired;
        }
        assert(blockedAt !== null, '22. walking from dry land, through shallow water, is eventually rejected exactly at the boundary this milestone installs — never blocked while still on dry land, never carried arbitrarily far into deep water');
        const depthAtBlock = LAKE_SURFACE_HEIGHT - syntheticHeightAt(blockedAt.x);
        assert(depthAtBlock <= DEFAULT_MAX_WALKING_DEPTH + 1e-9,
            `23. the avatar stopped at a depth (${depthAtBlock.toFixed(4)}) at or under DEFAULT_MAX_WALKING_DEPTH — never carried past it before the block took effect`);

        // Retreat: a step back toward shallower water (or dry land) is
        // never blocked by the depth gate.
        const retreatDesired = { x: blockedAt.x - STEP, y: 0, z: blockedAt.z };
        const retreatResult = waterConstraint.apply(blockedAt, retreatDesired);
        assert(retreatResult.blocked === false, '24. a step back toward shallower water is never blocked by the depth gate');

        // Re-approach: walking forward again reproduces the IDENTICAL
        // outcome at the identical coordinate — no persisted "cannot walk
        // anymore" flag.
        const reapproachResult = waterConstraint.apply(retreatDesired, blockedAt);
        assert(reapproachResult.blocked === false && reapproachResult.position.x === blockedAt.x,
            '25. re-approaching the exact same coordinate that was already reached during the original walk is never blocked — the gate is a pure, stateless function of CURRENT position on every call, exactly like surfaceCategoryAt() itself; no persisted state survives the retreat/reapproach round trip and produces a DIFFERENT answer for the same coordinate');

        // Normal (unreduced) speed resumes exactly at depth 0, whether
        // reached from dry land or from having just retreated out of
        // water entirely.
        assert(waterConstraint.speedFactorAt(-1, 0) === 1 && waterConstraint.speedFactorAt(-1, 0) === waterConstraint.speedFactorAt(-100, 0),
            '26. on dry land, the speed factor is exactly 1 regardless of which dry coordinate is queried, or how deep into water a PREVIOUS query happened to be — no lingering reduction of any kind');
    }

    // -------------------------------------------------------------
    // Section F — land -> water -> land, repeated: no hysteresis.
    // -------------------------------------------------------------
    {
        const waterConstraint = new AvatarWaterConstraint({ seed });
        const sequence = [dryPoint, shallowPoint, dryPoint, shallowPoint, dryPoint];
        const results = sequence.map((p) => waterConstraint.depthAt(p.x, p.z));
        assert(results[0] === 0 && results[2] === 0 && results[4] === 0,
            '27. every dry-point query in a repeated land -> water -> land sequence reports exactly 0 depth — no state from an intervening wet query ever leaks into a later dry one');
        assert(results[1] === results[3] && results[1] > 0,
            '28. every shallow-point query in the same sequence reports the IDENTICAL positive depth, whether it is the first or a later crossing — no hysteresis, no cumulative drift');

        // Crossing the shoreline repeatedly through the real, installed
        // withGroundElevation() reproduces the same guarantee at the
        // rendering layer.
        const beforeY = realWithGroundElevation(dryPoint).y;
        realWithGroundElevation(deepPoint); // an intervening deep-water render
        const afterY = realWithGroundElevation(dryPoint).y;
        assert(beforeY === afterY,
            '29. the SAME dry coordinate, rendered again after an intervening deep-water render, produces the byte-identical result — withGroundElevation() remains a stateless, per-call function');
    }

    // -------------------------------------------------------------
    // Section G — horizontal movement: blocking deeper movement never
    // blocks movement along the shoreline or into shallower water.
    // -------------------------------------------------------------
    {
        const syntheticHeightAt = (x) => LAKE_SURFACE_HEIGHT - Math.max(0, x) * 0.15;
        const syntheticIsWaterAt = (x) => x >= 0;
        const waterConstraint = new AvatarWaterConstraint({ heightAt: (x) => syntheticHeightAt(x), isWaterAt: (x) => syntheticIsWaterAt(x) });

        // A coordinate genuinely AT the walkable limit — reached only by
        // X — the furthest into the water an ordinary walk could ever
        // legitimately stand. Moving in Z alone (parallel to the
        // "shoreline," constant depth, still exactly at the limit) is not
        // blocked from there — proving the gate reacts to a step's own
        // DESTINATION depth, never merely to "how close to the limit the
        // avatar already stands."
        const atLimitX = DEFAULT_MAX_WALKING_DEPTH / 0.15; // depth exactly DEFAULT_MAX_WALKING_DEPTH at this x
        const edgePoint = { x: atLimitX, y: 0, z: 0 };
        const sideways = waterConstraint.apply(edgePoint, { x: atLimitX, y: 0, z: edgePoint.z + 1 });
        assert(sideways.blocked === false,
            '30. from a coordinate genuinely AT the walkable depth limit, a step PARALLEL to the shoreline (constant depth, moving only in Z) is NOT blocked by the depth gate — only a step that would genuinely go DEEPER is ever rejected');

        // A step toward SHALLOWER water (decreasing depth) from the same
        // point is likewise never blocked.
        const towardShallower = waterConstraint.apply(edgePoint, { x: atLimitX - 1, y: 0, z: 0 });
        assert(towardShallower.blocked === false,
            '31. from the same coordinate, a step toward SHALLOWER water is never blocked by the depth gate — this is a depth constraint, not a general "stop here forever" wall');

        // But a step that would genuinely go DEEPER from that exact same
        // edge is still rejected — confirming Section G's own exemptions
        // are real, narrow carve-outs, not a general weakening of
        // Section D's own boundary.
        const deeper = waterConstraint.apply(edgePoint, { x: atLimitX + 1, y: 0, z: 0 });
        assert(deeper.blocked === true,
            '31b. ...while a step from that same edge that WOULD go deeper is still rejected — the gate distinguishes direction, it does not simply give up once the avatar is near the limit');
    }

    // -------------------------------------------------------------
    // Section H — rendering interaction: the 0.9.615 -> 0.9.634
    // transition, against the real, current, shipped function.
    // -------------------------------------------------------------
    {
        // At maxWalkingDepth = 0, withGroundElevation() collapses onto
        // the EXACT pre-0.9.634 (0.9.615) formula at every point this
        // file has found — proving this milestone's own render change is
        // a strict, additive superset, never a replacement.
        const buildWithGroundElevationAtZero = new Function(
            'renderer', 'surfaceCategoryAt', 'SURFACE_CATEGORY', 'LAKE_SURFACE_HEIGHT', 'DEFAULT_WORLD_SEED', 'DEFAULT_MAX_WALKING_DEPTH',
            `${withGroundElevationBody}\nreturn withGroundElevation;`
        );
        const fakeRenderer = { terrainHeightAt: (x, z) => terrainHeightAt(seed, x, z) };
        const collapsedToZero = buildWithGroundElevationAtZero(fakeRenderer, surfaceCategoryAt, SURFACE_CATEGORY, LAKE_SURFACE_HEIGHT, DEFAULT_WORLD_SEED, 0);
        for (const point of [shallowPoint, deepPoint, dryPoint, { x: river.x, y: 0, z: river.z }]) {
            const zeroY = collapsedToZero(point).y;
            const preExisting905615Formula = point.y + (surfaceCategoryAt(seed, point.x, point.z) === SURFACE_CATEGORY.WATER
                ? Math.max(terrainHeightAt(seed, point.x, point.z), LAKE_SURFACE_HEIGHT)
                : terrainHeightAt(seed, point.x, point.z));
            assert(Math.abs(zeroY - preExisting905615Formula) < 1e-9,
                `32. at maxWalkingDepth = 0, withGroundElevation() reproduces the EXACT pre-0.9.634 (0.9.615) formula at (${point.x}, ${point.z}) — a strict additive superset, never a competing formula`);
        }

        // At the REAL, shipped DEFAULT_MAX_WALKING_DEPTH, a comfortably
        // (not merely barely) shallow coordinate and the genuinely deep
        // one now render VISIBLY differently — the whole point of this
        // milestone, live-confirmed against the real shipped source. A
        // real, walked-to coordinate in the SAME lake (never hand-picked)
        // well under the limit, so the divergence below is a comfortable
        // margin rather than the shoreline's own barely-wet edge case
        // (already covered, with its own tiny divergence, by assertions
        // 8-9 above).
        const midShallowPoint = walkInto(seed, dryPoint, shoreline.dirX, shoreline.dirZ, 0.3, 420);
        const midShallowDepth = LAKE_SURFACE_HEIGHT - terrainHeightAt(seed, midShallowPoint.x, midShallowPoint.z);
        assert(midShallowDepth > 0 && midShallowDepth < DEFAULT_MAX_WALKING_DEPTH,
            `setup: the mid-shallow coordinate is genuinely wet and genuinely under DEFAULT_MAX_WALKING_DEPTH (depth ${midShallowDepth.toFixed(4)})`);
        const midShallowY = realWithGroundElevation(midShallowPoint).y;
        const deepY = realWithGroundElevation(deepPoint).y;
        assert(Math.abs(deepY - midShallowY) > 0.5,
            `33. the real, shipped withGroundElevation() now renders genuinely-shallow water and genuinely-too-deep water at visibly DIFFERENT apparent heights (delta ${(deepY - midShallowY).toFixed(4)}) — closing 0.9.615's own documented, deliberate depth-blindness`);
    }

    // -------------------------------------------------------------
    // Section I — jump interaction: vertical motion composes correctly.
    // -------------------------------------------------------------
    {
        // Blocked horizontal step: Y still passes through from the
        // desired position, exactly like AvatarTerrainConstraint.
        const waterConstraint = new AvatarWaterConstraint({ seed });
        const jumpingBlocked = waterConstraint.apply(
            { x: deepPoint.x - shoreline.dirX, y: 0, z: deepPoint.z - shoreline.dirZ },
            { x: deepPoint.x, y: 1.6, z: deepPoint.z }
        );
        assert(jumpingBlocked.blocked === true && jumpingBlocked.position.y === 1.6,
            '34. a rejected step into too-deep water passes Y through unchanged — a jump already in progress is never cancelled by the water depth gate');

        // Rendering: the jump offset composes ADDITIVELY on top of the
        // shallow-water lakebed floor, exactly like it already does for
        // the 0.9.615 surface clamp.
        const jumpHeight = 1.2;
        const jumpingInShallow = realWithGroundElevation({ x: shallowPoint.x, y: jumpHeight, z: shallowPoint.z });
        const groundHeight = terrainHeightAt(seed, shallowPoint.x, shallowPoint.z);
        assert(Math.abs(jumpingInShallow.y - (jumpHeight + groundHeight)) < 1e-9,
            '35. mid-jump over shallow water, the rendered Y is exactly jumpHeight + the real lakebed height — the jump offset composes additively on top of the new shallow-water floor, never double-counted and never discarded by it');
    }

    // -------------------------------------------------------------
    // Section J — river behavior: a structural no-op.
    // -------------------------------------------------------------
    {
        assert(surfaceCategoryAt(seed, river.x, river.z) !== SURFACE_CATEGORY.WATER,
            '36. a real river coordinate is never SURFACE_CATEGORY.WATER, exactly as 0.9.614/0.9.615 already established');
        const waterConstraint = new AvatarWaterConstraint({ seed });
        assert(waterConstraint.depthAt(river.x, river.z) === 0,
            '37. AvatarWaterConstraint reports exactly 0 depth at a real river coordinate — it never provides meaningful underwater terrain for a river, so this milestone preserves the river\'s existing (unwalled, unslowed) behavior rather than treating it like a lake, per this milestone\'s own brief');
        const riverStep = waterConstraint.apply({ x: river.x - 1, y: 0, z: river.z }, { x: river.x, y: 0, z: river.z });
        assert(riverStep.blocked === false,
            '38. a step into a real river coordinate is never blocked by the depth gate');
        assert(Math.abs(realWithGroundElevation({ x: river.x, y: 0, z: river.z }).y - terrainHeightAt(seed, river.x, river.z)) < 1e-9,
            '39. the real, shipped withGroundElevation() renders a river coordinate at exactly its ordinary terrain height — completely unaffected by this milestone, exactly like the 0.9.615 clamp it extends');
    }

    // -------------------------------------------------------------
    // Section K — statelessness: the result depends only on current
    // (position, terrain, water surface, threshold).
    // -------------------------------------------------------------
    {
        const a = new AvatarWaterConstraint({ seed });
        const b = new AvatarWaterConstraint({ seed });
        assert(a.depthAt(deepPoint.x, deepPoint.z) === b.depthAt(deepPoint.x, deepPoint.z),
            '40. two completely independent AvatarWaterConstraint instances, given the same seed and coordinate, produce the byte-identical depth — no instance-local state of any kind');

        const strictConstraint = new AvatarWaterConstraint({ seed, maxWalkingDepth: shallowDepth / 2 });
        const looseConstraint = new AvatarWaterConstraint({ seed, maxWalkingDepth: 100 });
        assert(strictConstraint.apply(dryPoint, shallowPoint).blocked === true,
            '41. with a smaller configured maxWalkingDepth, the SAME real shallow coordinate is now blocked — the result is a pure function of the configured threshold, never a hardcoded constant baked into the class itself');
        assert(looseConstraint.apply(dryPoint, deepPoint).blocked === false,
            '42. ...and with a larger configured maxWalkingDepth, the SAME real deep coordinate is now allowed — confirming maxWalkingDepth is a genuine, overridable parameter, not an architectural constant');

        // No SWIMMING/WADING vocabulary anywhere this milestone touches.
        const files = [
            'core/AvatarWaterWalkability.js',
            'application/avatar/AvatarWaterConstraint.js',
            'core/AvatarPresence.js',
            'core/AvatarMovementState.js',
            'core/AvatarAnimationState.js',
            'application/avatar/AvatarMovementController.js'
        ];
        for (const file of files) {
            const src = await readSource(file);
            const codeOnly = src.split('\n').filter((line) => !line.trim().startsWith('//')).join('\n');
            assert(!/SWIMMING|WADING|WATER_OCCUPANCY|isSwimming|isUnderwater/i.test(codeOnly),
                `43. ${file} introduces no SWIMMING/WADING/occupancy vocabulary of any kind`);
        }
    }

    // -------------------------------------------------------------
    // Section L — full controller integration: a real, wired
    // AvatarMovementController drives the whole story end to end.
    //
    // L1 uses the SAME real lake every other section already scanned,
    // walked for a bounded number of real ticks — real terrain, real
    // speed reduction, real rendering. L2 switches to an engineered
    // synthetic depth field (the same "engineered boundary, never a
    // hand-hunted real one" discipline Sections D/E/G already use) for
    // the FLAGSHIP blocking demonstration specifically: this real lake's
    // own gentle slope means the depth-derived speed reduction (Section
    // C) asymptotically slows the approach to the boundary the closer it
    // gets — a real, honest, measured consequence of a LINEAR speed
    // curve (current position's depth drives current speed, so speed
    // trends toward zero as depth trends toward the limit), not a defect
    // in the blocking logic itself, which Section D already proved
    // exactly at the boundary, in isolation, with no timing question
    // involved at all. L2 demonstrates the SAME blocking logic engaged
    // through the real, full controller pipeline, at a depth field
    // engineered (a shallow shelf, then a sharp underwater drop-off — a
    // real, physically ordinary lake shape) so the block is reached in a
    // small, bounded, deterministic number of ticks rather than
    // depending on this specific world's own gentle real slope.
    // -------------------------------------------------------------
    {
        const registry = new AvatarTemplateRegistry();
        registry.register(CoreAvatarTemplateLibrary);
        const { profile } = buildAvatarStack(registry, 'shallow-water-integration-l1');
        const session = new AvatarPresenceSession(profile, {
            position: { x: shoreline.shoreX, y: 0, z: shoreline.shoreZ },
            rotation: { x: 0, y: Math.atan2(shoreline.dirX, shoreline.dirZ) * (180 / Math.PI), z: 0 }
        });
        const terrainConstraint = new AvatarTerrainConstraint({ seed });
        const waterConstraint = new AvatarWaterConstraint({ seed });
        const controller = new AvatarMovementController(session, null, terrainConstraint, null, null, waterConstraint);

        controller.keyDown('w');
        let everInShallowBelowSurface = false;
        let everSpeedReduced = false;
        const L1_TICKS = 900;
        for (let i = 0; i < L1_TICKS; i++) {
            const speedFactorBeforeTick = waterConstraint.speedFactorAt(session.current.position.x, session.current.position.z);
            controller.tick(0.05);
            if (speedFactorBeforeTick < 1) everSpeedReduced = true;
            const p = session.current.position;
            if (surfaceCategoryAt(seed, p.x, p.z) === SURFACE_CATEGORY.WATER) {
                const depth = LAKE_SURFACE_HEIGHT - terrainHeightAt(seed, p.x, p.z);
                if (depth > 0 && depth <= DEFAULT_MAX_WALKING_DEPTH && realWithGroundElevation(p).y < LAKE_SURFACE_HEIGHT - 1e-6) {
                    everInShallowBelowSurface = true;
                }
            }
        }
        controller.keyUp('w');

        assert(everInShallowBelowSurface === true,
            '44. a real, controller-driven avatar walking into this real lake genuinely renders below the old, depth-blind surface floor while in shallow water — the shallow-following half of this milestone\'s own contract, exercised through the real, full movement pipeline, not merely the bare render function in isolation');
        assert(everSpeedReduced === true,
            '45. ...and the SAME real walk genuinely experiences a reduced speed factor (read from the real AvatarWaterConstraint, at the avatar\'s own real current position) at some point before this section\'s own tick budget ends — the speed-reduction half of this milestone\'s own contract, likewise exercised end to end');

        const registryL2 = new AvatarTemplateRegistry();
        registryL2.register(CoreAvatarTemplateLibrary);
        const { profile: profileL2 } = buildAvatarStack(registryL2, 'shallow-water-integration-l2');
        const sessionL2 = new AvatarPresenceSession(profileL2, { position: { x: -5, y: 0, z: 0 }, rotation: { x: 0, y: 90, z: 0 } });
        // A shallow shelf from x=0 to x=10 (depth ramps 0 -> 1.7, staying
        // strictly under DEFAULT_MAX_WALKING_DEPTH throughout, so speed
        // never reduces all the way to zero and the shelf is always
        // crossed in finite time), then a sharp drop at x=10 to a depth
        // (5) well beyond the limit — a real, physically ordinary
        // "shallow shelf, then it drops off" lake shape.
        const shelfHeightAt = (x) => x < 10 ? LAKE_SURFACE_HEIGHT - (x / 10) * 1.7 : LAKE_SURFACE_HEIGHT - 5;
        const shelfIsWaterAt = (x) => x >= 0;
        const shelfWaterConstraint = new AvatarWaterConstraint({ heightAt: (x) => shelfHeightAt(x), isWaterAt: (x) => shelfIsWaterAt(x) });
        const controllerL2 = new AvatarMovementController(sessionL2, null, null, null, null, shelfWaterConstraint);

        controllerL2.keyDown('w');
        let everBlockedByWater = false;
        const L2_FORWARD_TICKS = 400;
        for (let i = 0; i < L2_FORWARD_TICKS; i++) {
            controllerL2.tick(0.05);
            if (controllerL2.isBlockedByWaterDepth()) everBlockedByWater = true;
        }
        controllerL2.keyUp('w');
        assert(everBlockedByWater === true,
            '46. FLAGSHIP — a real, controller-driven avatar walking continuously toward a real underwater drop-off is genuinely, eventually blocked by the new water-depth constraint (isBlockedByWaterDepth() observed true at least once) — movement into water too deep to walk is actually prevented by the real, full pipeline, not merely computed correct in isolation');
        const stoppedX = sessionL2.current.position.x;
        assert(stoppedX <= 10 + 0.2,
            `47. the avatar was never carried far past the drop-off's own edge (x = 10) before the block took effect (stopped at x = ${stoppedX.toFixed(4)}; one tick's own step distance bounds the overshoot) — blocked at the boundary, not merely somewhere deep`);

        // Retreat and confirm ordinary walking resumes, with no
        // persistent "blocked" state.
        controllerL2.keyDown('s');
        for (let i = 0; i < 400; i++) controllerL2.tick(0.05);
        controllerL2.keyUp('s');
        assert(controllerL2.isBlockedByWaterDepth() === false,
            '48. after retreating, isBlockedByWaterDepth() reports false again — the block is a per-tick fact, never a persisted mode the avatar has to be explicitly released from');
        assert(sessionL2.current.position.x < stoppedX,
            '49. retreating genuinely moves the avatar back toward shallower water versus the point the forward walk was blocked at — normal walking resumed, moving away from the boundary rather than staying pinned to it');

        // Re-approach one more time: the SAME edge blocks again,
        // identically — no stale/persisted state from the first
        // encounter changes the outcome on a second approach.
        controllerL2.keyDown('w');
        let blockedAgain = false;
        for (let i = 0; i < 400; i++) {
            controllerL2.tick(0.05);
            if (controllerL2.isBlockedByWaterDepth()) blockedAgain = true;
        }
        controllerL2.keyUp('w');
        assert(blockedAgain === true && sessionL2.current.position.x <= 10 + 0.2,
            '50. re-approaching the same drop-off a second time reproduces the identical outcome — blocked at the identical edge, never carried further by having "already been blocked here once before"');
    }

    console.log('✅ All Avatar Shallow-Water Traversal tests passed.');
}

await run();
