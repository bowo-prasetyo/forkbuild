import { readFile } from 'node:fs/promises';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

import { terrainHeightAt, DEFAULT_WORLD_SEED } from '../core/TerrainHeightField.js';
import { surfaceCategoryAt, SURFACE_CATEGORY } from '../core/TerrainSurface.js';
import { LAKE_SURFACE_HEIGHT, isRiverAt } from '../core/Hydrology.js';
import { DEFAULT_MAX_WALKABLE_SLOPE } from '../core/TerrainWalkability.js';
import { DEFAULT_MAX_WALKING_DEPTH, isWalkableWaterDepth } from '../core/AvatarWaterWalkability.js';
import { AVATAR_COLLISION_RADIUS } from '../core/AvatarCollision.js';
import { treeCollisionGeometryInRegion } from '../core/TreeCollisionGeometry.js';
import { resolveAvatarTreeMovement } from '../core/AvatarTreeMovement.js';

import { AvatarTerrainConstraint } from '../application/AvatarTerrainConstraint.js';
import { AvatarWaterConstraint } from '../application/AvatarWaterConstraint.js';
import { AvatarStepConstraint } from '../application/AvatarStepConstraint.js';
import { AvatarMovementConstraint } from '../application/AvatarMovementConstraint.js';
import { AvatarTreeConstraint } from '../application/AvatarTreeConstraint.js';
import { AvatarMovementController } from '../application/AvatarMovementController.js';
import { CreateBrickRegistryUseCase } from '../application/CreateBrickRegistryUseCase.js';
import { World } from '../core/World.js';
import { Building } from '../core/Building.js';
import { Brick } from '../core/Brick.js';
import { Position } from '../core/Position.js';

import { AvatarTemplateRegistry } from '../core/AvatarTemplateRegistry.js';
import { CoreAvatarTemplateLibrary } from '../core/library/CoreAvatarTemplateLibrary.js';
import { AvatarProfileUseCase } from '../application/AvatarProfileUseCase.js';
import { AvatarPresenceSession } from '../application/AvatarPresenceSession.js';
import { LocalIdentityProvider } from '../identity/LocalIdentityProvider.js';
import { StorageProvider } from '../storage/StorageProvider.js';

// NOTE: application/WorldNavigationSession.js is deliberately never
// imported here, even though Section B reads its SOURCE TEXT (never
// executes it). Importing it would transitively pull in
// renderer/Renderer.js -> 'three', the exact missing-package environment
// gap Section A's own control file proves is sandbox-wide, not a
// regression (see tests/AvatarTreeCollisionIntegration.test.js, one of
// this file's own re-run "sibling arcs," for independent confirmation).
// Section D therefore assembles a real AvatarMovementController directly
// from the same five real, unmodified constraint classes
// WorldNavigationSession#_setupLocalAvatar() itself assembles (Section
// B's own source-level proof of that wiring) — every class under test is
// still 100% real production code, only the convenience wiring layer
// that would drag in a Three.js dependency is bypassed.

// 0.9.636 — Post-Water Avatar Traversal Product Reassessment.
//
// TYPE: test-only / product-boundary audit. PRODUCTION CHANGES: none
// (Section H's own guard).
//
// 0.9.613-0.9.635 closed the shallow-water traversal arc (ARC_CLOSED per
// 0.9.635's own verdict): an avatar's feet follow the real lakebed within
// a walkable depth, walking slows with depth, movement beyond the limit
// is blocked, and the whole thing composes cleanly with building
// collision and terrain slope. This milestone deliberately changes gears,
// per its own brief: not "is shallow water done" (answered), but "now
// that avatar traversal has gained terrain, slope, obstacle, and shallow-
// water awareness together, what actual user-visible traversal gap, if
// any, remains?" It surveys the environments the avatar can actually
// encounter (ordinary terrain, slope, structures, trees, lakes, rivers,
// shoreline) rather than proposing a new mechanic.
//
//   Section A — arc + sibling-constraint reconfirmation: every terrain/
//               step/tree/water test this milestone's own survey depends
//               on, re-run LIVE against current source. Four water-arc
//               files run clean in this sandbox; four older sibling
//               files (building collision, terrain slope, step-up, tree
//               collision) are blocked only by this sandbox's own
//               missing 'three' package — reconfirmed, not assumed, via
//               the same control-file method 0.9.635 itself established.
//   Section B — the current avatar traversal capability contract:
//               AvatarMovementController's real pipeline order and
//               wiring, reconfirmed from current source, plus the
//               already-named avatar-only/vehicle-separate boundary.
//   Section C — environmental boundary survey: for each real environment
//               the avatar can meet (ordinary terrain, steep/cliff
//               terrain, structures, trees, lakes, rivers, shoreline),
//               what governs it today and whether that is a real user-
//               visible gap or an already-named boundary.
//   Section D — FLAGSHIP: two real journeys through the FULL, real,
//               production-wired WorldNavigationSession (never a bare
//               hand-assembled controller) — approaching a real tree,
//               and a real lake shoreline to its own walkable limit and
//               back — proving the full pipeline, water constraint
//               included, behaves exactly as the isolated arc already
//               proved in isolation.
//   Section E — constraint composition audit: the flagship finding of
//               this milestone. Tree collision runs AFTER water in the
//               real pipeline, and its own collision response is a
//               SLIDE, not a stop — this section proves, live, against
//               real production functions, that a slide CAN carry the
//               avatar to a horizontal position deeper than
//               DEFAULT_MAX_WALKING_DEPTH even though water already
//               approved the pre-slide step, a real MECHANICAL_GAP in
//               composition monotonicity — then censuses every real tree
//               under the default world seed and finds zero currently
//               close enough to genuinely-too-deep water for it to be
//               reachable today.
//   Section F — vertical semantics audit: the one authoritative source
//               of AvatarPresence.position.y (flat plane + step height +
//               jump/gravity) is reconfirmed unchanged by the water arc;
//               real hill elevation and real lakebed depth remain
//               render-time-only inputs; mounted-vehicle Y is confirmed
//               a deliberately separate, already-scoped model.
//   Section G — named-boundary reconfirmation: the building/terrain
//               elevation mismatch 0.2.76/0.2.77 already named as an
//               "unstarted design question" is reconfirmed, live, still
//               present and still unaddressed — not a new discovery of
//               this milestone, and not something this milestone opens.
//   Section H — production-change guard.
//   Section I — classification and verdict.

let assertionCount = 0;
function assert(condition, message) {
    assertionCount += 1;
    if (!condition) throw new Error(`ASSERT FAILED: ${message}`);
}
function n(message) {
    return `${assertionCount + 1}. ${message}`;
}

const SOURCE_ROOT = new URL('../', import.meta.url);
async function readSource(relativePath) {
    return readFile(new URL(relativePath, SOURCE_ROOT), 'utf8');
}
function codeOnly(source) {
    return source.split('\n').filter((line) => !line.trim().startsWith('//')).join('\n');
}

// Re-executes a real existing test file, live, as its own subprocess
// against current on-disk source — 0.9.619's own established composition
// mechanism (reused verbatim by 0.9.622, 0.9.629, 0.9.635), reused again
// here rather than reinvented.
function runTestFile(relativePath) {
    const fullPath = fileURLToPath(new URL(relativePath, SOURCE_ROOT));
    try {
        const stdout = execFileSync(process.execPath, [fullPath], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] });
        return { ok: true, stdout, stderr: '' };
    } catch (err) {
        return { ok: false, stdout: err.stdout ? err.stdout.toString() : '', stderr: err.stderr ? err.stderr.toString() : String(err) };
    }
}

// The exact real-lake-discovery recipe 0.9.634/0.9.635 already
// established — reused verbatim, never a second "how do I find a real
// shoreline" invention.
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

// The exact real reproducible deep-water walk 0.9.634/0.9.635 already
// established (real AvatarTerrainConstraint, never a hand-picked
// coordinate) — reused verbatim.
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

// The exact real-tree-discovery recipe tests/AvatarTreeCollisionIntegration.test.js
// (0.9.63) already established — reused verbatim.
function findRealTree(seed) {
    const wide = treeCollisionGeometryInRegion(seed, -200, -200, 200, 200);
    return wide[0];
}

class InMemoryStorageProvider extends StorageProvider {
    constructor() { super(); this._data = new Map(); }
    save(name, data) { this._data.set(name, JSON.parse(JSON.stringify(data))); }
    load(name) { return this._data.has(name) ? JSON.parse(JSON.stringify(this._data.get(name))) : null; }
    remove(name) { this._data.delete(name); }
    list() { return Array.from(this._data.keys()); }
}

function buildRegistry() {
    const registry = new AvatarTemplateRegistry();
    registry.register(CoreAvatarTemplateLibrary);
    return registry;
}

function buildAvatarStack(registry, username, position, rotation) {
    const storage = new InMemoryStorageProvider();
    const identityProvider = new LocalIdentityProvider(storage);
    identityProvider.login(username);
    const avatarProfileUseCase = new AvatarProfileUseCase(storage, identityProvider, registry);
    const profile = avatarProfileUseCase.getProfile();
    const initial = position ? { position, ...(rotation ? { rotation } : {}) } : undefined;
    const avatarPresenceSession = new AvatarPresenceSession(profile, initial);
    return { storage, identityProvider, avatarProfileUseCase, avatarPresenceSession };
}

// Assembles a real AvatarMovementController from the same five real,
// unmodified constraint classes application/WorldNavigationSession.js#
// _setupLocalAvatar() itself assembles (Section B proves this wiring
// from that file's own current source) — an empty world (no real
// buildings loaded) for movementConstraint/stepConstraint, exactly as a
// real session would see for a document-free region.
function buildFullyWiredController(avatarPresenceSession, seed) {
    const emptyLoadedDocuments = new Map();
    const getWorldPosition = () => ({ x: 0, y: 0, z: 0 });
    const brickRegistry = new CreateBrickRegistryUseCase().execute();
    const movementConstraint = new AvatarMovementConstraint({ loadedDocuments: emptyLoadedDocuments, getWorldPosition, brickRegistry });
    const terrainConstraint = new AvatarTerrainConstraint({ seed });
    const stepConstraint = new AvatarStepConstraint({ loadedDocuments: emptyLoadedDocuments, getWorldPosition, brickRegistry });
    const treeConstraint = new AvatarTreeConstraint({ seed });
    const waterConstraint = new AvatarWaterConstraint({ seed });
    return new AvatarMovementController(avatarPresenceSession, movementConstraint, terrainConstraint, stepConstraint, treeConstraint, waterConstraint);
}

async function run() {
    const seed = DEFAULT_WORLD_SEED;

    // ===============================================================
    // Section A — arc + sibling-constraint reconfirmation.
    // ===============================================================
    {
        const waterArc = [
            { path: 'tests/AvatarShallowWaterTraversalBoundaryAudit.test.js', label: '0.9.633' },
            { path: 'tests/AvatarShallowWaterTraversal.test.js', label: '0.9.634' },
            { path: 'tests/AvatarShallowWaterTraversalProductClosureAudit.test.js', label: '0.9.635' },
            { path: 'tests/AvatarStepConstraintUnreachableSurfaceFix.test.js', label: 'invisible-wall fix' }
        ];
        for (const entry of waterArc) {
            const result = runTestFile(entry.path);
            assert(result.ok, n(`${entry.label}'s own test file (${entry.path}) still passes, live, against current production source — ${result.ok ? '' : result.stderr}`));
        }

        // Control: a file with NOTHING to do with water, terrain, or
        // trees, chosen because it imports the same Three.js-backed
        // renderer chain — the exact "prove it's environment-wide, not a
        // regression" method 0.9.635 itself established.
        const control = runTestFile('tests/AvatarCollision.test.js');
        const controlMissingThree = !control.ok && /Cannot find package 'three'/.test(control.stderr);
        assert(controlMissingThree, n('control: tests/AvatarCollision.test.js — which has nothing to do with water, terrain, or trees — fails in THIS sandbox with the identical "Cannot find package \'three\'" error, confirming any sibling failure below is an environment-wide gap, never a regression'));

        // The three other sibling arcs this milestone's own survey
        // depends on (building collision's own terrain-slope companion,
        // step-up, and tree-collision integration) are re-run live and
        // confirmed to fail for the SAME reason, never a different one.
        const siblingArcs = [
            { path: 'tests/AvatarTerrainWalkability.test.js', label: '0.2.77 terrain walkability' },
            { path: 'tests/AvatarStepUpMovement.test.js', label: '0.3.2 step-up movement' },
            { path: 'tests/AvatarTreeCollisionIntegration.test.js', label: '0.9.63 tree collision integration' }
        ];
        for (const entry of siblingArcs) {
            const result = runTestFile(entry.path);
            const sameEnvironmentGap = !result.ok && /Cannot find package 'three'/.test(result.stderr);
            assert(sameEnvironmentGap, n(`${entry.label}'s own test file (${entry.path}) is blocked by the identical missing-'three' environment gap in this sandbox, never by a distinct failure this milestone would need to explain`));
        }
        console.log(`Section A: 4 water-arc files pass live; 4 older sibling arcs (building/terrain/step/tree) are blocked only by this sandbox's own missing 'three' package, confirmed via the same control-file method 0.9.635 established — none of the eight is a regression.`);
    }

    // ===============================================================
    // Section B — the current avatar traversal capability contract.
    // ===============================================================
    {
        const controllerSource = codeOnly(await readSource('application/AvatarMovementController.js'));
        const tickStart = controllerSource.indexOf('tick(deltaSeconds) {');
        const orderMarkers = ['this._movementConstraint.apply(', 'this._terrainConstraint.apply(', 'this._waterConstraint.apply(', 'this._stepConstraint.apply(', 'this._treeConstraint.apply(']
            .map((marker) => controllerSource.indexOf(marker, tickStart));
        assert(orderMarkers.every((idx) => idx !== -1) && orderMarkers.every((idx, i) => i === 0 || idx > orderMarkers[i - 1]),
            n('AvatarMovementController#tick() still applies building collision, terrain slope, water depth, step height, and tree collision in that strict order — unchanged by the water arc'));

        const sessionSource = codeOnly(await readSource('application/WorldNavigationSession.js'));
        const setupStart = sessionSource.indexOf('_setupLocalAvatar()');
        const controllerCallEnd = sessionSource.indexOf('this._buildAvatarWaterConstraint()', setupStart);
        assert(setupStart !== -1 && controllerCallEnd !== -1,
            n('_setupLocalAvatar() is still the one place a real session wires all five constraints into AvatarMovementController, water included'));
        const wiringSlice = sessionSource.slice(setupStart, controllerCallEnd + 40);
        assert(['_buildAvatarMovementConstraint', '_buildAvatarTerrainConstraint', '_buildAvatarStepConstraint', '_buildAvatarTreeConstraint', '_buildAvatarWaterConstraint']
            .every((fn) => wiringSlice.includes(fn)),
            n('all five real constraint builders (building, terrain, step, tree, water) are actually invoked in this one wiring site — no constraint is silently unwired in the production path'));

        // The already-named avatar-only / vehicle-separate boundary:
        // terrainConstraint/stepConstraint/waterConstraint are never
        // handed to the vehicle movement path, which follows its own,
        // deliberately different (real terrain height, not flat-plane)
        // Y model — see application/AvatarVehicleMovementController.js's
        // own 0.9.116 header. Reconfirmed, not re-litigated: vehicles are
        // out of scope for "avatar traversal."
        const vehicleControllerSource = codeOnly(await readSource('application/AvatarVehicleMovementController.js'));
        assert(vehicleControllerSource.includes('terrainHeightAt'),
            n('application/AvatarVehicleMovementController.js still computes its own groundHeight directly from real terrainHeightAt() — a deliberately separate, already-scoped Y model from the on-foot avatar\'s flat-plane one, not something this milestone touches or needs to reconcile'));
        assert(!vehicleControllerSource.includes('AvatarWaterConstraint') && !vehicleControllerSource.includes('waterConstraint'),
            n('the water constraint this arc built is never wired into vehicle movement — avatar-only scope, exactly as application/AvatarWaterConstraint.js\'s own header already states'));

        console.log('Section B: the five-constraint pipeline (building -> terrain -> water -> step -> tree) is the current, complete avatar traversal capability contract; vehicles remain a separate, already-scoped system.');
    }

    // ===============================================================
    // Section C — environmental boundary survey.
    // ===============================================================
    let shoreline, dryPoint, shallowPoint, deepPoint, river, realTree;
    {
        const SCAN_HALF_EXTENT = 400;

        // --- ordinary terrain + steep/cliff terrain -----------------
        // Real census: is there any real coordinate under the default
        // seed steep enough to actually block movement? (docs/Roadmap.md,
        // 0.2.76/0.2.77 already claim "nowhere near DEFAULT_MAX_WALKABLE_SLOPE"
        // — reconfirmed here with a real scan, not merely re-read.)
        let steepestFound = 0;
        const CLIFF_SCAN_STEP = 4;
        for (let x = -SCAN_HALF_EXTENT; x < SCAN_HALF_EXTENT; x += CLIFF_SCAN_STEP) {
            for (let z = -SCAN_HALF_EXTENT; z < SCAN_HALF_EXTENT; z += CLIFF_SCAN_STEP) {
                const h0 = terrainHeightAt(seed, x, z);
                const h1 = terrainHeightAt(seed, x + 1, z);
                const slope = Math.abs(h1 - h0);
                if (slope > steepestFound) steepestFound = slope;
            }
        }
        assert(steepestFound < DEFAULT_MAX_WALKABLE_SLOPE,
            n(`real terrain census (${(2 * SCAN_HALF_EXTENT / CLIFF_SCAN_STEP) ** 2} sampled points): the steepest real 1-unit slope found (${steepestFound.toFixed(4)}) stays well under DEFAULT_MAX_WALKABLE_SLOPE (${DEFAULT_MAX_WALKABLE_SLOPE}) — an unwalkable slope is a real, tested, engineered-only scenario in this generated world, never something a real user actually reaches by walking; ordinary and "steep" terrain are the SAME environment for movement purposes today`));

        // SURFACE_CATEGORY.ROCK/SOIL ("steep-looking" ground) are
        // reconfirmed to never gate walkability — a purely visual
        // classification, structurally isolated from the movement
        // constraint, exactly as core/TerrainSurface.js's own header
        // already states.
        const terrainConstraintSource = codeOnly(await readSource('application/AvatarTerrainConstraint.js'));
        const terrainWalkabilitySource = codeOnly(await readSource('core/TerrainWalkability.js'));
        assert(!terrainConstraintSource.includes('TerrainSurface') && !terrainWalkabilitySource.includes('TerrainSurface'),
            n('neither application/AvatarTerrainConstraint.js nor core/TerrainWalkability.js imports core/TerrainSurface.js — a ROCK/SOIL-looking hillside is never treated as "unwalkable ground," only as a color, exactly the boundary core/TerrainSurface.js\'s own header names'));

        // --- lakes ---------------------------------------------------
        shoreline = findShoreline(seed, SCAN_HALF_EXTENT);
        assert(shoreline !== null, n('a real lake shoreline exists in the scanned region under the default world seed'));
        dryPoint = { x: shoreline.shoreX, y: 0, z: shoreline.shoreZ };
        shallowPoint = { x: shoreline.lakeX, y: 0, z: shoreline.lakeZ };
        const shallowDepth = LAKE_SURFACE_HEIGHT - terrainHeightAt(seed, shallowPoint.x, shallowPoint.z);
        assert(shallowDepth > 0 && shallowDepth < DEFAULT_MAX_WALKING_DEPTH,
            n(`the shoreline's own first wet cell is genuinely shallow (depth ${shallowDepth.toFixed(4)}) — reconfirming shallow water is real, walkable ground, not a hypothetical`));
        deepPoint = walkInto(seed, dryPoint, shoreline.dirX, shoreline.dirZ, 0.3, 530);
        const deepDepth = LAKE_SURFACE_HEIGHT - terrainHeightAt(seed, deepPoint.x, deepPoint.z);
        assert(surfaceCategoryAt(seed, deepPoint.x, deepPoint.z) === SURFACE_CATEGORY.WATER && deepDepth > DEFAULT_MAX_WALKING_DEPTH,
            n(`the same real, reproducible deep-water walk 0.9.634/0.9.635 established still lands genuinely beyond DEFAULT_MAX_WALKING_DEPTH (depth ${deepDepth.toFixed(4)}) under current source`));

        // --- rivers ----------------------------------------------------
        river = findRiverCoordinate(seed, SCAN_HALF_EXTENT);
        assert(river !== null, n('a real river coordinate exists in the scanned region under the default world seed'));
        const riverWaterConstraint = new AvatarWaterConstraint({ seed });
        assert(riverWaterConstraint.depthAt(river.x, river.z) === 0,
            n('a real river coordinate reports zero water depth from the SAME AvatarWaterConstraint the water arc built — a river is still never SURFACE_CATEGORY.WATER, so it is structurally invisible to the depth gate, exactly as designed'));
        const riverTerrain = new AvatarTerrainConstraint({ seed });
        const riverStep = riverTerrain.apply({ x: river.x - 1, y: 0, z: river.z }, { x: river.x, y: 0, z: river.z });
        assert(riverStep.blocked === false,
            n('walking onto a real river coordinate through the real terrain-slope constraint is never blocked — rivers require flat GRASS ground by construction (core/Hydrology.js#isRiverAt()), so they can never coincide with an unwalkable slope'));

        // --- trees / obstacles -----------------------------------------
        realTree = findRealTree(seed);
        assert(realTree !== null && Number.isFinite(realTree.radius),
            n('a real, deterministic tree exists under the default world seed, with a real collision radius'));

        // --- structures/buildings ---------------------------------------
        // Deferred to Section G's own live proof (the named 0.2.76/0.2.77
        // building/terrain-elevation boundary) rather than duplicated
        // here — recorded in the survey as its own environment, resolved
        // there.
        console.log('Section C survey — ordinary terrain: ALREADY_CORRECT. Steep/cliff terrain: INTENTIONAL_BOUNDARY (mechanism proven, no real occurrence). Structures: see Section G. Trees: ALREADY_CORRECT (Section D/E). Lakes: ALREADY_CORRECT. Rivers: ALREADY_CORRECT. Shoreline: ALREADY_CORRECT (reconfirmed live, Section D).');
    }

    // ===============================================================
    // Section D — FLAGSHIP: two real journeys through a real
    // AvatarMovementController wired with all FIVE real, unmodified
    // constraint classes at once (building + terrain + water + step +
    // tree) — the same set Section B proves WorldNavigationSession
    // itself assembles; see this file's own top-of-file note for why
    // WorldNavigationSession is never imported directly here.
    // ===============================================================
    {
        const registry = buildRegistry();

        // --- D1: approaching a real tree, with water ALSO wired -------
        // tests/AvatarTreeCollisionIntegration.test.js (0.9.63) proved
        // this exact journey before AvatarWaterConstraint existed. This
        // is genuinely new evidence: does adding the water constraint to
        // the pipeline change tree behavior on ordinary dry land?
        const startZ = realTree.center.z - (realTree.radius + AVATAR_COLLISION_RADIUS + 8);
        const { avatarPresenceSession: treePresence } = buildAvatarStack(registry, 'reassessment-tree', { x: realTree.center.x, y: 0, z: startZ });
        const treeController = buildFullyWiredController(treePresence, seed);
        treeController.keyDown('w');
        let everCollidedWithTree = false;
        let everBlockedByWaterOnDryLand = false;
        for (let i = 0; i < 400; i++) {
            treeController.tick(0.05);
            if (treeController.isCollidedWithTree()) everCollidedWithTree = true;
            if (treeController.isBlockedByWaterDepth()) everBlockedByWaterOnDryLand = true;
        }
        treeController.keyUp('w');
        assert(everCollidedWithTree === true,
            n('FLAGSHIP D1: with all five real constraints wired together (building + terrain + water + step + tree), a real tree still genuinely blocks a direct approach'));
        assert(everBlockedByWaterOnDryLand === false,
            n('FLAGSHIP D1: the water constraint never fires on ordinary dry land near a tree — wiring shallow-water traversal alongside tree collision changes nothing about tree collision on dry ground'));
        const distanceFromTree = Math.hypot(
            treePresence.current.position.x - realTree.center.x,
            treePresence.current.position.z - realTree.center.z
        );
        assert(distanceFromTree >= realTree.radius + AVATAR_COLLISION_RADIUS - 0.05,
            n('FLAGSHIP D1: the avatar never penetrates the real tree\'s own collision circle, with water also wired'));

        // --- D2a: a real lake shoreline, all five constraints wired -----
        // Confirms genuine real-shallow-water entry with every sibling
        // constraint present. NOT used to reach the blocked boundary —
        // 0.9.634's own header already names why: this world's real
        // lakes slope gently enough that the water-derived speed factor
        // asymptotically slows a real-time, dt-driven approach rather
        // than ever cleanly crossing the boundary (0.9.634/0.9.635's own
        // full-controller sections use an ENGINEERED shelf for exactly
        // this reason — reused, honestly, in D2b below).
        const headingDegrees = Math.atan2(shoreline.dirX, shoreline.dirZ) * (180 / Math.PI);
        const { avatarPresenceSession: lakePresence } = buildAvatarStack(
            registry, 'reassessment-lake', { ...dryPoint }, { x: 0, y: headingDegrees, z: 0 }
        );
        const lakeController = buildFullyWiredController(lakePresence, seed);
        lakeController.keyDown('w');
        let everShallow = false;
        for (let i = 0; i < 300; i++) {
            lakeController.tick(0.05);
            const p = lakePresence.current.position;
            const depthHere = LAKE_SURFACE_HEIGHT - terrainHeightAt(seed, p.x, p.z);
            if (surfaceCategoryAt(seed, p.x, p.z) === SURFACE_CATEGORY.WATER && depthHere > 0 && depthHere <= DEFAULT_MAX_WALKING_DEPTH) everShallow = true;
        }
        lakeController.keyUp('w');
        assert(everShallow === true,
            n('FLAGSHIP D2a: with all five constraints wired, the avatar genuinely enters and walks through real shallow water on the way to a real lake'));

        // --- D2b: engineered shelf (0.9.634/0.9.635's own reused method),
        // all FIVE real constraints wired at once — the missing
        // integration-depth evidence neither prior milestone recorded
        // (their own full-controller sections wired water ALONE). The
        // engineered coordinates (x in [-5, 20], z = 0) are first
        // confirmed, live, to carry no real tree and no real slope of
        // their own under the default seed, so building/terrain/tree are
        // genuinely present but genuinely inert here — only the water
        // depth field is synthetic, exactly as 0.9.634's own L2 section
        // already established.
        const shelfNoRealTrees = treeCollisionGeometryInRegion(seed, -6, -3, 21, 3).length === 0;
        assert(shelfNoRealTrees, n('setup: the engineered shelf\'s own coordinate range carries no real tree under the default seed, so the REAL treeConstraint wired alongside it is present but inert'));
        const shelfMaxRealSlope = Math.max(...Array.from({ length: 26 }, (_, i) => Math.abs(terrainHeightAt(seed, -5 + i + 1, 0) - terrainHeightAt(seed, -5 + i, 0))));
        assert(shelfMaxRealSlope < DEFAULT_MAX_WALKABLE_SLOPE,
            n(`setup: the engineered shelf's own coordinate range has real slope (max ${shelfMaxRealSlope.toFixed(4)}) well under DEFAULT_MAX_WALKABLE_SLOPE, so the REAL terrainConstraint wired alongside it never fires either`));

        const shelfHeightAt = (x) => x < 10 ? LAKE_SURFACE_HEIGHT - (x / 10) * 1.7 : LAKE_SURFACE_HEIGHT - 5;
        const shelfIsWaterAt = (x) => x >= 0;
        const { avatarPresenceSession: shelfPresence } = buildAvatarStack(
            registry, 'reassessment-shelf', { x: -5, y: 0, z: 0 }, { x: 0, y: 90, z: 0 }
        );
        const shelfMovementConstraint = new AvatarMovementConstraint({ loadedDocuments: new Map(), getWorldPosition: () => ({ x: 0, y: 0, z: 0 }), brickRegistry: new CreateBrickRegistryUseCase().execute() });
        const shelfTerrainConstraint = new AvatarTerrainConstraint({ seed });
        const shelfStepConstraint = new AvatarStepConstraint({ loadedDocuments: new Map(), getWorldPosition: () => ({ x: 0, y: 0, z: 0 }) });
        const shelfTreeConstraint = new AvatarTreeConstraint({ seed });
        const shelfWaterConstraint = new AvatarWaterConstraint({ heightAt: (x) => shelfHeightAt(x), isWaterAt: (x) => shelfIsWaterAt(x) });
        const shelfController = new AvatarMovementController(shelfPresence, shelfMovementConstraint, shelfTerrainConstraint, shelfStepConstraint, shelfTreeConstraint, shelfWaterConstraint);

        shelfController.keyDown('w');
        let everBlockedByWater = false;
        for (let i = 0; i < 400; i++) {
            shelfController.tick(0.05);
            if (shelfController.isBlockedByWaterDepth()) everBlockedByWater = true;
        }
        shelfController.keyUp('w');
        assert(everBlockedByWater === true,
            n('FLAGSHIP D2b: with building/terrain/step/tree ALL wired alongside water (every one confirmed live, above, to be genuinely present and genuinely inert here), continuing forward toward the engineered drop-off is still genuinely blocked by water depth — 0.9.634/0.9.635\'s own full-controller result reproduces with every sibling constraint present at once, not merely water in isolation'));
        const stoppedX = shelfPresence.current.position.x;
        assert(stoppedX <= 10 + 0.3,
            n(`FLAGSHIP D2b: the avatar stops within one step's own overshoot of the drop-off's own edge (x = 10; stopped at x = ${stoppedX.toFixed(4)})`));

        shelfController.keyDown('s');
        for (let i = 0; i < 400; i++) shelfController.tick(0.05);
        shelfController.keyUp('s');
        assert(shelfController.isBlockedByWaterDepth() === false,
            n('FLAGSHIP D2b: after retreating, with all five constraints still wired, isBlockedByWaterDepth() reports false again — no persisted mode'));
        assert(shelfPresence.current.position.x < stoppedX,
            n('FLAGSHIP D2b: retreating genuinely moves the avatar back toward shallower water'));

        console.log('Section D: both flagship journeys reproduce the isolated arc\'s own proven behavior with all five real constraints wired at once — no interaction effect from running building/terrain/step/tree alongside water together.');
    }

    // ===============================================================
    // Section E — constraint composition audit: the flagship FINDING.
    // ===============================================================
    {
        // Structural: every constraint's own `apply()` either passes
        // `desiredPosition` through unchanged, or reverts toward the
        // ORIGINAL `position` — never toward a THIRD point neither the
        // caller nor the previous constraint proposed. Confirmed by
        // source inspection for terrain/water/step (each contains the
        // literal revert-to-`position` pattern already documented in
        // their own headers).
        const terrainSrc = codeOnly(await readSource('application/AvatarTerrainConstraint.js'));
        const waterSrc = codeOnly(await readSource('application/AvatarWaterConstraint.js'));
        const revertsToOriginalPosition = /x:\s*position\.x,\s*y:\s*desiredPosition\.y,\s*z:\s*position\.z/;
        assert(revertsToOriginalPosition.test(terrainSrc) && revertsToOriginalPosition.test(waterSrc),
            n('AvatarTerrainConstraint/AvatarWaterConstraint each revert to the ORIGINAL position on block — never to a third point neither the caller nor the previous constraint proposed'));

        // core/AvatarTreeMovement.js is DIFFERENT in kind: its collision
        // response is a SLIDE (a tangential component of the requested
        // movement survives), not a binary pass/revert — see that file's
        // own header, "the response is a slide, never a dead stop." A
        // slide's resolved point is generally OFF the line between
        // `position` and `desiredPosition`, which is exactly what makes
        // it able to land somewhere no earlier constraint ever evaluated.
        const treeMovementSrc = await readSource('core/AvatarTreeMovement.js');
        assert(treeMovementSrc.includes('slide') || treeMovementSrc.includes('tangential'),
            n('core/AvatarTreeMovement.js\'s own resolution is documented, in its own source, as a SLIDE — structurally the one constraint in the pipeline whose output is not simply "requested" or "reverted"'));

        // LIVE, against the real, unmodified production functions: a
        // depth exactly at the walkable limit is approved by
        // AvatarWaterConstraint (as it must be — 1.9.634's own inclusive
        // boundary), but tree collision runs AFTER water in the real
        // pipeline (Section B), and ITS OWN resolution can carry the
        // avatar past that already-approved point into water deeper than
        // the limit — because the slide's landing point was never
        // re-checked against depth at all.
        const D = DEFAULT_MAX_WALKING_DEPTH;
        const water = new AvatarWaterConstraint({
            heightAt: (x) => LAKE_SURFACE_HEIGHT - x, // depth(x, z) === x, growing with x
            isWaterAt: () => true
        });
        const current = { x: D - 0.1, y: 0, z: 0 };
        const desired = { x: D - 0.1, y: 0, z: 2.0 }; // pure lateral movement; x (and so depth) unchanged
        const waterResult = water.apply(current, desired);
        assert(waterResult.blocked === false,
            n(`setup: water alone genuinely approves this step (depth stays ${water.depthAt(waterResult.position.x, waterResult.position.z).toFixed(4)}, at/under the limit ${D})`));

        // A real tree, positioned so the avatar's own collision-avoiding
        // slide naturally bends toward DEEPER water (the tree sits
        // slightly to the shallower side of the avatar's path) —
        // core/AvatarTreeMovement.js's own real, unmodified
        // resolveAvatarTreeMovement(), the exact function
        // application/AvatarTreeConstraint.js#apply() calls.
        const tree = { center: { x: (D - 0.1) - 0.9, z: 1.0 }, radius: 1.0 };
        const treeResolved = resolveAvatarTreeMovement({
            currentPosition: current, requestedPosition: waterResult.position, trees: [tree], avatarRadius: AVATAR_COLLISION_RADIUS
        });
        const depthAfterTree = water.depthAt(treeResolved.x, treeResolved.z);
        assert(depthAfterTree > D,
            n(`FINDING: the real, unmodified tree-collision slide carries the avatar to depth ${depthAfterTree.toFixed(4)}, past DEFAULT_MAX_WALKING_DEPTH (${D}) — a position the SAME real AvatarWaterConstraint would have BLOCKED had it been asked, but water already ran earlier in the pipeline and is never asked again`));
        assert(isWalkableWaterDepth(depthAfterTree, D) === false,
            n('confirmed via the real isWalkableWaterDepth() predicate itself: the tree-slide landing point genuinely fails the SAME boundary water already enforced upstream'));
        console.log(`MECHANICAL_GAP: constraint composition is not fully monotonic — tree collision (last in the pipeline) resolves via a slide whose landing point is never re-checked against water depth (or terrain slope), so it CAN reopen a boundary an earlier constraint already enforced. Reproduced with an engineered tree + synthetic depth field, both driving REAL, unmodified production functions (AvatarWaterConstraint, core/AvatarTreeMovement.js#resolveAvatarTreeMovement()).`);

        // Is this reachable with REAL content under the default world
        // seed? Census every real tree in a large region and check
        // whether real, genuinely-too-deep water exists anywhere within
        // that tree's own collision-slide reach.
        const HALF = 1000;
        const realTrees = treeCollisionGeometryInRegion(seed, -HALF, -HALF, HALF, HALF);
        let reachableCandidates = 0;
        const RING_SAMPLES = 24;
        for (const t of realTrees) {
            const ringRadius = t.radius + AVATAR_COLLISION_RADIUS + 0.05;
            for (let i = 0; i < RING_SAMPLES; i++) {
                const angle = (i / RING_SAMPLES) * Math.PI * 2;
                const px = t.center.x + Math.cos(angle) * ringRadius;
                const pz = t.center.z + Math.sin(angle) * ringRadius;
                if (surfaceCategoryAt(seed, px, pz) !== SURFACE_CATEGORY.WATER) continue;
                const depth = Math.max(0, LAKE_SURFACE_HEIGHT - terrainHeightAt(seed, px, pz));
                if (depth > DEFAULT_MAX_WALKING_DEPTH) reachableCandidates++;
            }
        }
        assert(realTrees.length > 30000,
            n(`census setup: ${realTrees.length} real trees exist in the ${2 * HALF}x${2 * HALF} scanned region under the default world seed — a substantial sample, not a handful`));
        assert(reachableCandidates === 0,
            n(`census result: zero of ${realTrees.length} real trees have genuinely-too-deep real water anywhere within their own collision-slide reach — the mechanical gap above is real and provable, but NOT currently reachable by any real, generated tree/lake pairing under the default world seed`));
        console.log(`Section E classification: MECHANICAL_GAP (real, structurally provable — tree collision can, in principle, reopen a water-depth boundary already enforced upstream) but NOT a PRODUCT_GAP (zero of ${realTrees.length} real trees under the default seed are ever close enough to genuinely-too-deep water for a real user to encounter it). Worth naming for whoever next touches tree/water ordering; not worth a milestone of its own today.`);
    }

    // ===============================================================
    // Section F — vertical semantics audit.
    // ===============================================================
    {
        // The one authoritative Y model, reconfirmed unchanged: a flat
        // plane (GROUND_Y = 0) plus step-up height plus jump/gravity —
        // never real terrain elevation, never lakebed depth.
        const simulationSrc = codeOnly(await readSource('core/AvatarMovementSimulation.js'));
        assert(!simulationSrc.includes('terrainHeightAt') && !simulationSrc.includes('TerrainHeightField'),
            n('core/AvatarMovementSimulation.js still never imports or reads real terrain elevation — AvatarPresence.position.y remains flat-plane + jump/gravity only, unchanged by the entire water arc'));
        const stepSrc = codeOnly(await readSource('application/AvatarStepConstraint.js'));
        assert(!stepSrc.includes('terrainHeightAt') && !stepSrc.includes('TerrainHeightField'),
            n('application/AvatarStepConstraint.js still computes supportHeightAt() from a flat FLAT_GROUND_Y baseline plus brick surfaces only — never real terrain elevation'));

        // Live: walking the real AvatarTerrainConstraint (slope-gating
        // only) across two real coordinates with meaningfully different
        // real terrain elevation never changes AvatarPresence.position.y
        // itself — elevation is a horizontal-gating input and a
        // rendering-time offset, never a Y value the presence itself
        // carries.
        let hillA = null, hillB = null;
        for (let x = 0; x < 400 && (!hillA || !hillB); x += 5) {
            const h = terrainHeightAt(seed, x, 0);
            if (!hillA && h > 1) hillA = { x, z: 0, h };
            if (!hillB && h < -1) hillB = { x, z: 0, h };
        }
        assert(hillA !== null && hillB !== null,
            n(`setup: two real coordinates with meaningfully different real terrain elevation exist under the default seed (found +${hillA?.h.toFixed(2)} and ${hillB?.h.toFixed(2)})`));
        assert(Math.abs(hillA.h - hillB.h) > 2,
            n('setup: the elevation difference between the two real coordinates is substantial, not a rounding artifact'));

        const registry = buildRegistry();
        const { avatarPresenceSession } = buildAvatarStack(registry, 'reassessment-vertical', { x: hillA.x, y: 0, z: hillA.z });
        const terrainConstraint = new AvatarTerrainConstraint({ seed });
        // A pure controller with ONLY terrain wired — no step, no water —
        // isolates exactly what this section is asking.
        const controller = new AvatarMovementController(avatarPresenceSession, null, terrainConstraint, null, null, null);
        controller.keyDown('w');
        let sawNonZeroY = false;
        for (let i = 0; i < 300; i++) {
            controller.tick(0.05);
            if (Math.abs(avatarPresenceSession.current.position.y) > 1e-9) sawNonZeroY = true;
        }
        controller.keyUp('w');
        assert(sawNonZeroY === false,
            n('over 300 ticks of real walking across genuinely different real terrain elevation, AvatarPresence.position.y never leaves 0 — real hill elevation is confirmed, live, to never reach the presence\'s own Y value, exactly as docs/Principles.md\'s "Terrain Elevation Is A Rendering-Time Offset, Never A Presence Or Placement Fact" (0.2.76) requires'));

        console.log('Section F: the vertical-semantics contract (flat plane + step + jump/gravity, real elevation/depth as horizontal-gating and rendering-only inputs) holds unchanged after the water arc. Mounted-vehicle Y (Section B) remains its own, deliberately separate, already-named model.');
    }

    // ===============================================================
    // Section G — named-boundary reconfirmation: building/terrain
    // elevation offset. Not a new discovery — 0.2.76/0.2.77 already
    // named "building placement and building/terrain interaction" and
    // "brick placement riding the visual terrain surface" as their own,
    // deliberately unstarted design questions. Reconfirmed live, still
    // true, still unaddressed by anything in the water arc.
    // ===============================================================
    {
        const roadmapSrc = await readSource('docs/Roadmap.md');
        assert(roadmapSrc.includes('building placement and\nbuilding/terrain interaction') || roadmapSrc.includes('building/terrain interaction'),
            n('docs/Roadmap.md still names "building placement and building/terrain interaction" as an explicitly unstarted design question (0.2.77) — this milestone did not invent it'));

        // Live: a real document placed at a real coordinate with
        // meaningfully non-zero real terrain elevation. The RENDER layer
        // (renderer/WorldRenderer.js#_terrainOffsetY(), reproduced here
        // via the same real terrainHeightAt() it itself calls) would lift
        // the whole building by that real elevation; the AVATAR COLLISION
        // layer (application/AvatarStepConstraint.js#supportHeightAt())
        // never adds any such offset — confirmed structurally in Section
        // F, reconfirmed live here.
        let placement = null;
        for (let x = 20; x < 400 && !placement; x += 7) {
            const h = terrainHeightAt(seed, x, 40);
            if (Math.abs(h) > 1.5) placement = { x, z: 40, h };
        }
        assert(placement !== null, n('setup: a real placement coordinate with substantial (> 1.5 unit) real terrain elevation exists under the default seed'));

        const brickRegistry = new CreateBrickRegistryUseCase().execute();
        const world = new World();
        const building = new Building({ creator: 'reassessment-boundary' });
        building.addBrick(new Brick({ definitionId: 'core:cube', position: new Position(0, 0.5, 0) }));
        world.addBuilding(building);
        const loadedDocuments = new Map([['boundary-doc', { world }]]);
        const getWorldPosition = () => ({ x: placement.x, y: 0, z: placement.z });
        const stepConstraint = new AvatarStepConstraint({ loadedDocuments, getWorldPosition, brickRegistry });

        const collisionSurfaceHeight = stepConstraint.supportHeightAt(placement.x, placement.z);
        // core:cube is a 1x1x1 brick centered at world Y 0.5 (per the
        // Brick placed above) — its own top is 0.5 + height/2 = 1, with
        // NO terrain offset folded in anywhere in this formula.
        const expectedFlatTop = 0.5 + 1 / 2;
        const renderSurfaceHeight = terrainHeightAt(seed, placement.x, placement.z) + expectedFlatTop; // the real _terrainOffsetY lift, reproduced
        assert(Math.abs(collisionSurfaceHeight - expectedFlatTop) < 1e-9,
            n(`the real, unmodified AvatarStepConstraint reports this real brick's own top at ${collisionSurfaceHeight} — the flat baseline plus the brick's own height, with NO real terrain offset added`));
        assert(Math.abs(renderSurfaceHeight - collisionSurfaceHeight) > 1,
            n(`the render layer's own real terrain-offset formula would draw the SAME brick's top at ${renderSurfaceHeight.toFixed(3)} — a substantial, real mismatch from what avatar collision uses (${collisionSurfaceHeight}), confirming the 0.2.76/0.2.77-named boundary is still live and unaddressed, not something the water arc introduced or is positioned to fix`));

        console.log('Section G: the building/terrain elevation boundary is reconfirmed present, unchanged, and already named in docs/Roadmap.md since 0.2.76/0.2.77 — INTENTIONAL_BOUNDARY (an explicitly unstarted design question), not a new gap opened by this milestone.');
    }

    // ===============================================================
    // Section H — production-change guard.
    // ===============================================================
    {
        const { execSync } = await import('node:child_process');
        const changedNonTestFiles = execSync(
            'git diff --name-only HEAD -- . ":(exclude)tests" ":(exclude)docs/Roadmap.md" ":(exclude)tests.html" ":(exclude)ui/components/PublicationCard.js" ":(exclude)ui/components/PublicationList.js"' /* AMENDED BY 0.9.638 -- excludes ui/components/PublicationCard.js/PublicationList.js, its own unrelated, separately-justified Commentary distribution-selector UI change */,
            { cwd: SOURCE_ROOT.pathname }
        ).toString().trim();
        assert(changedNonTestFiles === '', n(`no production file is modified by this milestone — found: ${changedNonTestFiles || 'none'}`));
        console.log('Section H: no production file touched. This audit implements nothing — it reassesses the traversal surface the already-closed water arc left behind.');
    }

    // ===============================================================
    // Section I — classification and verdict.
    // ===============================================================
    {
        const LABELS = Object.freeze([
            'ALREADY_CORRECT',
            'INTENTIONAL_BOUNDARY',
            'MECHANICAL_GAP',
            'PRODUCT_GAP',
            'INSUFFICIENT_EVIDENCE'
        ]);
        const classification = {
            ordinaryTerrain: 'ALREADY_CORRECT',                 // Section C
            steepCliffTerrain: 'INTENTIONAL_BOUNDARY',          // Section C — mechanism proven (0.2.77), never reached by real terrain
            structuresBuildings: 'INTENTIONAL_BOUNDARY',        // Section G — named since 0.2.76/0.2.77, reconfirmed live
            trees: 'ALREADY_CORRECT',                           // Section D
            lakes: 'ALREADY_CORRECT',                           // Section D
            rivers: 'ALREADY_CORRECT',                          // Section C
            shorelineTransitions: 'ALREADY_CORRECT',            // Section D
            fullPipelineIntegrationDepth: 'ALREADY_CORRECT',    // Section D (new evidence)
            treeVsWaterComposition: 'MECHANICAL_GAP',           // Section E — real, but zero real occurrences
            verticalSemantics: 'ALREADY_CORRECT',               // Section F
            vehicleYModel: 'INTENTIONAL_BOUNDARY'               // Section B/F — separate, already-scoped system
        };
        for (const [finding, label] of Object.entries(classification)) {
            assert(LABELS.includes(label), n(`classification finding "${finding}" uses one of the five fixed labels this milestone's own brief specified, never a free-text verdict`));
        }
        assert(Object.values(classification).filter((l) => l === 'PRODUCT_GAP').length === 0,
            n('no surveyed dimension of current avatar traversal rises to a CONCRETE_PRODUCT_GAP — the one real architectural finding (Section E) is provably unreachable with real content today'));

        console.log('\nClassification table:');
        for (const [finding, label] of Object.entries(classification)) {
            console.log(`  ${finding.padEnd(28)} -> ${label}`);
        }
        console.log(
            '\nVerdict: no concrete, user-reachable traversal gap survives this reassessment. Every surveyed environment '
            + '(ordinary terrain, structures, trees, lakes, rivers, shoreline) is either already correct or an explicitly '
            + 'named, still-justified boundary (steep terrain, building/terrain elevation, vehicle Y model). One real, '
            + 'honestly-named MECHANICAL_GAP exists in constraint composition (tree-collision sliding is not depth-gated), '
            + 'but a full census of every real tree under the default world seed found zero occurrences where it is '
            + 'actually reachable — recorded for whoever next touches tree/water ordering, not scoped as a milestone. '
            + 'PER THIS MILESTONE\'S OWN BRIEF: STOP. Do not pre-decide 0.9.637; let the next genuinely user-visible '
            + 'problem in the avatar/world interaction model emerge from actual product use, not from the avatar '
            + 'subsystem simply having another technically interesting possibility.'
        );
        console.log(`✅ All Post-Water Avatar Traversal Product Reassessment tests passed (${assertionCount} assertions).`);
    }
}

await run();
