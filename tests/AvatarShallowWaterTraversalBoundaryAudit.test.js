import { readFile } from 'node:fs/promises';

import { AvatarTerrainConstraint } from '../application/AvatarTerrainConstraint.js';
import { simulateAvatarMovement } from '../core/AvatarMovementSimulation.js';
import { AvatarMovementState } from '../core/AvatarMovementState.js';
import { DEFAULT_MAX_WALKABLE_SLOPE } from '../core/TerrainWalkability.js';
import { AVATAR_COLLISION_HEIGHT, AVATAR_COLLISION_RADIUS } from '../core/AvatarCollision.js';
import { resolveAvatarVehicleMovementCapability } from '../core/AvatarVehicleMovementCapability.js';

import { terrainHeightAt, DEFAULT_WORLD_SEED, TERRAIN_HEIGHT_BOUND } from '../core/TerrainHeightField.js';
import { surfaceCategoryAt, SURFACE_CATEGORY, WATER_LEVEL } from '../core/TerrainSurface.js';
import { hydrologyFeatureAt, HYDROLOGY_FEATURE, LAKE_SURFACE_HEIGHT, isRiverAt } from '../core/Hydrology.js';

// 0.9.633 — Avatar Shallow-Water Traversal Boundary Audit.
//
// 0.9.613-0.9.616 closed one, narrower gap: an avatar walking into a real
// lake no longer sinks, unclamped, below LAKE_SURFACE_HEIGHT — 0.9.615's
// own withGroundElevation() floors the RENDERED avatar at
// max(terrainHeight, LAKE_SURFACE_HEIGHT) wherever the ground is
// SURFACE_CATEGORY.WATER, and 0.9.616 confirmed that closure was coherent
// enough to stand on its own. That fix was deliberately depth-blind BY
// DESIGN (see application/RenderWorldViewUseCase.js's own 0.9.615 header):
// it treats one inch of water and the deepest lake in the world
// identically, both rendered exactly AT the surface plane — which is
// physically the "avatar walks ON the water" look this milestone's own
// requesting brief calls out as a real, separate product gap, not a
// re-litigation of 0.9.616's own closure.
//
// This is a test-only, decision-oriented audit (no production code
// changes) asking whether the EXISTING terrain, hydrology, movement, and
// collision machinery can support a materially different shallow-water
// behavior — feet follow the real underwater terrain while depth stays
// within a walkable limit, walking slows as depth increases, and
// movement into water beyond that limit is blocked — by EXTENDING the
// same seams 0.9.615/0.2.77 already established, or whether it would
// require inventing new architecture (a WaterCollisionSystem, a
// SwimmingController, an AvatarPresence field) first. Every section below
// either TRACES real, unmodified production code, or exercises a
// test-local CANDIDATE (never written to any production file) against
// real terrain scanned under DEFAULT_WORLD_SEED — the same "never a
// hand-picked coordinate" discipline 0.9.613-0.9.616 already established.
//
//   Section A: real terrain-under-water census — does this generated
//              world actually contain both genuinely-shallow AND
//              genuinely-too-deep-for-an-avatar's-own-height water, or is
//              the whole premise moot against real generated terrain?
//   Section B: FLAGSHIP — the existing movement pipeline is completely
//              depth-blind (structurally, not just by observation), and
//              the real, shipped 0.9.615 render fix already produces the
//              "walking on the surface" look even in ankle-deep water.
//   Section C: avatar geometry census — what body-extent facts actually
//              exist to derive a walking-depth limit from, and what
//              would have to be invented instead.
//   Section D: a minimal, TEST-LOCAL, render-time-only shallow-water
//              candidate — feet follow the lakebed under a depth limit,
//              falls back to 0.9.615's own existing clamp beyond it.
//   Section E: a minimal, TEST-LOCAL horizontal depth gate, mirroring
//              AvatarTerrainConstraint's own {position, blocked} shape.
//   Section F: a minimal, TEST-LOCAL depth-based speed factor — tested
//              for monotonicity and boundary behavior, never committed
//              to a specific curve.
//   Section G: boundary continuity — no stuck state, no swimming flag,
//              shoreline-parallel movement unaffected.
//   Section H: classification — a fixed, closed vocabulary, one label
//              per finding, never a single verdict standing in for seven
//              different answers.

function assert(condition, message) {
    if (!condition) throw new Error(`ASSERT FAILED: ${message}`);
}

async function readSource(relativePath) {
    return readFile(new URL(`../${relativePath}`, import.meta.url), 'utf8');
}

function codeOnly(source) {
    return source.split('\n').filter((line) => !line.trim().startsWith('//')).join('\n');
}

// Identical balanced-brace extraction discipline to
// tests/AvatarBasicWaterTraversalProductClosureAudit.test.js's own
// helper — pulls a function's real body straight out of its real source
// text, never re-typed by hand.
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

// Identical scanning discipline to 0.9.613-0.9.616's own findShoreline()
// — a genuine, deterministic WATER cell with a dry neighbor exactly 1
// unit away, never assumed to exist at any particular coordinate.
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

// A real terrain-under-water census over a bounded, scanned region.
// `terrainHeightAt(seed, x, z) <= WATER_LEVEL` is the EXACT condition
// surfaceCategoryAt()'s own first branch uses for SURFACE_CATEGORY.WATER
// (see core/TerrainSurface.js) — using it directly here, rather than
// calling surfaceCategoryAt() itself on every one of a million scanned
// cells, is a performance shortcut over the identical real classification
// rule, not an approximation of it; the found coordinate is independently
// reconfirmed with a real surfaceCategoryAt() call before this file ever
// treats it as WATER.
function scanWaterDepthCensus(seed, halfExtent, step) {
    let count = 0;
    let sum = 0;
    let minDepth = Infinity;
    let maxDepth = -Infinity;
    let deepest = null;
    let exceedingCollisionHeight = 0;
    for (let x = -halfExtent; x < halfExtent; x += step) {
        for (let z = -halfExtent; z < halfExtent; z += step) {
            const height = terrainHeightAt(seed, x, z);
            if (height > WATER_LEVEL) continue;
            const depth = LAKE_SURFACE_HEIGHT - height;
            count++;
            sum += depth;
            if (depth < minDepth) minDepth = depth;
            if (depth > maxDepth) { maxDepth = depth; deepest = { x, z, height, depth }; }
            if (depth > AVATAR_COLLISION_HEIGHT) exceedingCollisionHeight++;
        }
    }
    return { count, meanDepth: sum / count, minDepth, maxDepth, deepest, exceedingCollisionHeight };
}

// The SAME render-time formula application/RenderWorldViewUseCase.js's
// own withGroundElevation() already uses before any water gate at all —
// reproduced here read-only, exactly as 0.9.614's own realRenderedY().
function realRenderedY(seed, position) {
    return position.y + terrainHeightAt(seed, position.x, position.z);
}

// ---------------------------------------------------------------------
// TEST-LOCAL CANDIDATES — never imported FROM this file BY any
// production file, and never installed anywhere. Each is modeled as the
// smallest possible extension of an EXISTING production seam (named at
// each definition), never a new architectural shape.
// ---------------------------------------------------------------------

// Section D's own candidate — a direct generalization of
// RenderWorldViewUseCase.js#withGroundElevation()'s own 0.9.615 formula.
// Wherever the ground is WATER and the depth stays within
// `maxWalkingDepth`, the rendered floor follows the REAL lakebed (a
// "wading" look, feet under the translucent water plane); beyond that
// limit, it falls back to the EXACT SAME Math.max(...) clamp 0.9.615
// already ships — never a second, competing formula.
function candidateShallowWaterFloorRenderedY(seed, position, maxWalkingDepth) {
    const groundHeight = terrainHeightAt(seed, position.x, position.z);
    const isWaterGround = surfaceCategoryAt(seed, position.x, position.z) === SURFACE_CATEGORY.WATER;
    if (!isWaterGround) {
        return { x: position.x, y: position.y + groundHeight, z: position.z };
    }
    const depth = LAKE_SURFACE_HEIGHT - groundHeight;
    const floorHeight = depth <= maxWalkingDepth ? groundHeight : Math.max(groundHeight, LAKE_SURFACE_HEIGHT);
    return { x: position.x, y: position.y + floorHeight, z: position.z };
}

// Section E's own candidate — mirrors
// application/AvatarTerrainConstraint.js#apply()'s own {position,
// blocked} contract exactly: X/Z revert to the caller's CURRENT position
// when blocked, Y still passes through from `desiredPosition` unchanged
// (a rejected horizontal step must never cancel a jump/fall already in
// progress — the identical reasoning that class's own header already
// gives for its slope rejection).
function candidateWaterDepthConstraint(seed, position, desiredPosition, maxWalkingDepth, heightAt = (x, z) => terrainHeightAt(seed, x, z), isWaterAt = (x, z) => surfaceCategoryAt(seed, x, z) === SURFACE_CATEGORY.WATER) {
    if (!isWaterAt(desiredPosition.x, desiredPosition.z)) {
        return { position: desiredPosition, blocked: false };
    }
    const depth = LAKE_SURFACE_HEIGHT - heightAt(desiredPosition.x, desiredPosition.z);
    if (depth <= maxWalkingDepth) {
        return { position: desiredPosition, blocked: false };
    }
    return { position: { x: position.x, y: desiredPosition.y, z: position.z }, blocked: true };
}

// Section F's own candidate — a plain [0, 1] multiplier, never a
// specific product-approved curve (see this milestone's own brief: "I
// would not hard-code the exact mathematical function yet"). Linear is
// the simplest candidate that satisfies the one invariant Section F
// actually tests (monotonic, bounded, degrades gracefully) — chosen here
// purely to exercise that invariant, not proposed as final.
function candidateWaterDepthSpeedFactor(depth, maxWalkingDepth) {
    if (!Number.isFinite(depth) || !Number.isFinite(maxWalkingDepth) || maxWalkingDepth <= 0) return 1;
    const factor = 1 - depth / maxWalkingDepth;
    return Math.min(1, Math.max(0, factor));
}

async function runTests() {
    const seed = DEFAULT_WORLD_SEED;
    const SCAN_HALF_EXTENT = 400;
    const DEEP_SCAN_HALF_EXTENT = 1000;
    const DEEP_SCAN_STEP = 2;

    const shoreline = findShoreline(seed, SCAN_HALF_EXTENT);
    assert(shoreline !== null, 'setup: a real lake shoreline exists in the scanned region under the default world seed');
    const river = findRiverCoordinate(seed, SCAN_HALF_EXTENT);
    assert(river !== null, 'setup: a real river coordinate exists in the scanned region under the default world seed');

    const shallowPoint = { x: shoreline.lakeX, y: 0, z: shoreline.lakeZ };
    const shallowHeight = terrainHeightAt(seed, shallowPoint.x, shallowPoint.z);
    const shallowDepth = LAKE_SURFACE_HEIGHT - shallowHeight;
    assert(surfaceCategoryAt(seed, shallowPoint.x, shallowPoint.z) === SURFACE_CATEGORY.WATER,
        'setup: the shoreline\'s own first wet cell is genuinely WATER-classified');
    assert(shallowDepth > 0 && shallowDepth < 1,
        `setup: the first wet cell is genuinely SHALLOW (depth ${shallowDepth.toFixed(4)} world units) — a real, scanned representative of "barely wet," not hand-picked`);

    // A real terrain-under-water census, scanned once, reused across
    // every section below that needs a genuinely deep coordinate.
    const census = scanWaterDepthCensus(seed, DEEP_SCAN_HALF_EXTENT, DEEP_SCAN_STEP);
    assert(census.deepest !== null, 'setup: the deep scan finds at least one real WATER cell');
    const deepPoint = { x: census.deepest.x, y: 0, z: census.deepest.z };
    assert(surfaceCategoryAt(seed, deepPoint.x, deepPoint.z) === SURFACE_CATEGORY.WATER,
        'setup: the scanned deepest coordinate is independently reconfirmed WATER via the real surfaceCategoryAt()');

    const MAX_WALKING_DEPTH_CANDIDATE = AVATAR_COLLISION_HEIGHT;

    // -------------------------------------------------------------
    // Section A — real terrain-under-water census.
    // -------------------------------------------------------------
    {
        assert(census.deepest.depth > MAX_WALKING_DEPTH_CANDIDATE,
            `1. a real, scanned WATER coordinate exists under DEFAULT_WORLD_SEED whose depth (${census.deepest.depth.toFixed(4)} world units) genuinely exceeds the avatar's own full collision height (${AVATAR_COLLISION_HEIGHT}) — "too deep to walk" is not a hypothetical case this audit invented`);
        assert(shallowDepth < MAX_WALKING_DEPTH_CANDIDATE * 0.1,
            `2. ...while a SEPARATE, real, scanned shoreline coordinate sits at a depth (${shallowDepth.toFixed(4)}) under a tenth of that same height — genuinely shallow water exists side by side with genuinely too-deep water in this same generated world, not two ends of a spectrum this audit had to construct`);
        assert(census.exceedingCollisionHeight > 0 && census.exceedingCollisionHeight / census.count > 0.01,
            `3. within the scanned region, real WATER cells exceeding the avatar's own collision height are not a one-in-a-million fluke: ${census.exceedingCollisionHeight} of ${census.count} scanned WATER cells (${(census.exceedingCollisionHeight / census.count * 100).toFixed(2)}%) qualify — a walking-depth boundary is a real, load-bearing product question against this world's own actual terrain, not a moot one`);
        assert(census.minDepth >= 0 && census.meanDepth > 0 && Number.isFinite(census.meanDepth),
            `4. the census itself is well-formed — every sampled depth is non-negative and finite (mean depth across the scanned region: ${census.meanDepth.toFixed(4)})`);

        const theoreticalMaxDepth = LAKE_SURFACE_HEIGHT - (-TERRAIN_HEIGHT_BOUND);
        assert(census.deepest.depth <= theoreticalMaxDepth + 1e-9,
            `5. the deepest real depth found (${census.deepest.depth.toFixed(4)}) sits within the one theoretical bound this terrain field can ever produce (LAKE_SURFACE_HEIGHT - (-TERRAIN_HEIGHT_BOUND) = ${theoreticalMaxDepth.toFixed(4)}) — a sanity bound, not a number this audit had to invent either`);
    }

    // -------------------------------------------------------------
    // Section B — FLAGSHIP: the existing movement pipeline is
    // structurally depth-blind, and the real, shipped 0.9.615 render fix
    // already produces the "walking on the surface" look in shallow
    // water, not only deep water.
    // -------------------------------------------------------------
    let realWithGroundElevation;
    {
        const terrainConstraintSource = codeOnly(await readSource('application/AvatarTerrainConstraint.js'));
        assert(!/Hydrology|WATER|LAKE_SURFACE_HEIGHT|surfaceCategoryAt/.test(terrainConstraintSource),
            '6. application/AvatarTerrainConstraint.js — the ONE existing seam that can currently reject a horizontal step at all — contains no Hydrology/WATER reference anywhere in its own code; it is structurally INCAPABLE of ever gating on depth, only ever on slope');

        // A single, ordinary real footstep (1 world unit) from a real
        // WATER neighbor into the deepest scanned coordinate, using the
        // real, unmodified constraint.
        const constraint = new AvatarTerrainConstraint({ seed });
        const deepNeighbor = { x: deepPoint.x - 1, y: 0, z: deepPoint.z };
        assert(surfaceCategoryAt(seed, deepNeighbor.x, deepNeighbor.z) === SURFACE_CATEGORY.WATER,
            'setup: the deep coordinate\'s own 1-unit neighbor is genuinely WATER too (an interior lake point, not an edge)');
        const deepStep = constraint.apply(deepNeighbor, { x: deepPoint.x, y: 0, z: deepPoint.z });
        assert(deepStep.blocked === false,
            `7. FLAGSHIP: a single, ordinary footstep from a real WATER cell into the real deepest-scanned coordinate (depth ${census.deepest.depth.toFixed(4)}, well over the avatar's own height) is permitted OUTRIGHT by the real, unmodified AvatarTerrainConstraint — the local slope between them is tiny (real generated terrain is gentle, per core/TerrainSurface.js's own header), and slope is the only thing this constraint has ever been able to measure`);

        // The real, shipped withGroundElevation(), extracted from its
        // own current source text — never re-typed — same technique
        // 0.9.616 already established.
        const renderWorldViewSource = await readSource('application/RenderWorldViewUseCase.js');
        const withGroundElevationBody = extractFunctionBody(renderWorldViewSource, 'function withGroundElevation(position) {');
        assert(withGroundElevationBody !== null, 'setup: application/RenderWorldViewUseCase.js#withGroundElevation() is located and extracted from its real, current source text');
        const buildWithGroundElevation = new Function(
            'renderer', 'surfaceCategoryAt', 'SURFACE_CATEGORY', 'LAKE_SURFACE_HEIGHT', 'DEFAULT_WORLD_SEED',
            `${withGroundElevationBody}\nreturn withGroundElevation;`
        );
        const fakeRenderer = { terrainHeightAt: (x, z) => terrainHeightAt(seed, x, z) };
        realWithGroundElevation = buildWithGroundElevation(fakeRenderer, surfaceCategoryAt, SURFACE_CATEGORY, LAKE_SURFACE_HEIGHT, DEFAULT_WORLD_SEED);

        const shallowRenderedY = realWithGroundElevation(shallowPoint).y;
        assert(Math.abs(shallowRenderedY - LAKE_SURFACE_HEIGHT) < 1e-9,
            `8. the real, shipped withGroundElevation() renders the avatar at the real SHALLOW shoreline coordinate (real lakebed depth only ${shallowDepth.toFixed(4)}) at exactly LAKE_SURFACE_HEIGHT — standing visibly ON the water's own rendered surface plane rather than ankle-deep in it; this "walking on water" look already reproduces in barely-wet water today, not only in deep water`);

        const deepRenderedY = realWithGroundElevation(deepPoint).y;
        assert(Math.abs(deepRenderedY - LAKE_SURFACE_HEIGHT) < 1e-9 && Math.abs(deepRenderedY - shallowRenderedY) < 1e-9,
            `9. ...and the SAME shipped function renders the real deep coordinate (lakebed depth ${census.deepest.depth.toFixed(4)}) at the IDENTICAL apparent height as the barely-wet shoreline cell above — today's shipped code cannot visually distinguish "ankle-deep" from "over the avatar's own head," by design (0.9.615's own documented, deliberate depth-blindness), which is exactly the gap this milestone's own brief is asking about`);
    }

    // -------------------------------------------------------------
    // Section C — avatar geometry census: what body-extent facts
    // actually exist to derive a walking-depth limit from.
    // -------------------------------------------------------------
    {
        const collisionSource = await readSource('core/AvatarCollision.js');
        const exportedConsts = [...collisionSource.matchAll(/export const (\w+)/g)].map((m) => m[1]);
        assert(exportedConsts.includes('AVATAR_COLLISION_RADIUS') && exportedConsts.includes('AVATAR_COLLISION_HEIGHT') && exportedConsts.length === 2,
            `10. core/AvatarCollision.js exports exactly two avatar body-extent constants (${exportedConsts.join(', ')}) — the ONLY authoritative avatar geometry this codebase has, anywhere`);

        const cameraPerspectiveSource = await readSource('core/CameraPerspective.js');
        assert(/const EYE_HEIGHT = 1\.6;/.test(cameraPerspectiveSource) && !/export const EYE_HEIGHT/.test(cameraPerspectiveSource),
            '11. core/CameraPerspective.js\'s own EYE_HEIGHT (1.6) exists but is deliberately module-private (never exported) — reachable only through that file\'s own opt-in, off-by-default Camera Perspective mode (0.9.616\'s own Section B finding, still true), never a general-purpose avatar-geometry authority any other file can import');

        const searchSources = ['core', 'application'];
        let neckLikeConstantFound = false;
        for (const dir of searchSources) {
            const { readdir } = await import('node:fs/promises');
            const entries = await readdir(new URL(`../${dir}/`, import.meta.url));
            for (const entry of entries) {
                if (!entry.endsWith('.js')) continue;
                const text = await readSource(`${dir}/${entry}`);
                if (/\b(NECK|TORSO|WAIST|CHEST)_HEIGHT\b/i.test(text)) {
                    neckLikeConstantFound = true;
                }
            }
        }
        assert(neckLikeConstantFound === false,
            '12. a codebase-wide search of core/ and application/ finds no NECK_HEIGHT/TORSO_HEIGHT/WAIST_HEIGHT/CHEST_HEIGHT constant anywhere — a "neck depth" walking limit cannot be DERIVED from any existing representation; it would have to be INVENTED, a genuine product decision, not an architecture lookup this audit can resolve on its own');

        assert(MAX_WALKING_DEPTH_CANDIDATE === AVATAR_COLLISION_HEIGHT,
            '13. accordingly, every candidate below anchors its own maxWalkingDepth on AVATAR_COLLISION_HEIGHT — the one whole-body extent this codebase already treats as authoritative for collision — named honestly as a stand-in for "fully submerged," never presented as a resolved "neck" decision');
    }

    // -------------------------------------------------------------
    // Section D — a minimal, TEST-LOCAL, render-time-only shallow-water
    // candidate: never installed, tested here only for coherence.
    // -------------------------------------------------------------
    {
        const candidateShallowY = candidateShallowWaterFloorRenderedY(seed, shallowPoint, MAX_WALKING_DEPTH_CANDIDATE).y;
        assert(Math.abs(candidateShallowY - (shallowPoint.y + shallowHeight)) < 1e-9,
            `14. at the real shallow coordinate, the candidate renders the avatar AT the real lakebed height (feet on the bottom, legs in the translucent water plane) rather than clamped to LAKE_SURFACE_HEIGHT — a genuine, measurable difference from the shipped formula at that exact coordinate (assertion 8): ${(LAKE_SURFACE_HEIGHT - candidateShallowY).toFixed(4)} world units lower`);

        const candidateDeepY = candidateShallowWaterFloorRenderedY(seed, deepPoint, MAX_WALKING_DEPTH_CANDIDATE).y;
        const shippedDeepY = realWithGroundElevation(deepPoint).y;
        assert(Math.abs(candidateDeepY - shippedDeepY) < 1e-9,
            '15. at the real DEEP coordinate (beyond the candidate\'s own maxWalkingDepth), the candidate falls back to the EXACT same clamp the real shipped withGroundElevation() already produces there — a deliberate, explicit fallback for a position Section E argues below should never be reachable by ordinary movement anyway, not a second, competing formula');

        // Strict-superset check: maxWalkingDepth = 0 collapses the
        // candidate onto the shipped formula at EVERY point this file
        // has found so far — shallow, deep, and river alike.
        for (const point of [shallowPoint, deepPoint, { x: river.x, y: 0, z: river.z }]) {
            const collapsedY = candidateShallowWaterFloorRenderedY(seed, point, 0).y;
            const shippedY = realWithGroundElevation(point).y;
            assert(Math.abs(collapsedY - shippedY) < 1e-9,
                '16. with maxWalkingDepth forced to 0, the candidate is byte-identical to the real shipped withGroundElevation() at every real point this audit has found — proving the candidate is a strict ADDITIVE generalization of the existing 0.9.615 rule, never a replacement or a second competing formula');
        }

        // Shoreline continuity, identical bound to 0.9.614's own Section
        // C for the shipped rule.
        const dryPoint = { x: shoreline.shoreX, y: 0, z: shoreline.shoreZ };
        const realDryY = realRenderedY(seed, dryPoint);
        const candidateWetY = candidateShallowWaterFloorRenderedY(seed, shallowPoint, MAX_WALKING_DEPTH_CANDIDATE).y;
        const shorelineDelta = Math.abs(candidateWetY - realDryY);
        assert(shorelineDelta <= DEFAULT_MAX_WALKABLE_SLOPE + 1e-6,
            `17. the candidate's own shoreline transition stays bounded by the SAME slope tolerance (${DEFAULT_MAX_WALKABLE_SLOPE}) that already governs every other 1-unit terrain step — no larger pop at the water's edge than ordinary hilly terrain already tolerates (measured delta: ${shorelineDelta.toFixed(4)})`);

        const riverPoint = { x: river.x, y: 0, z: river.z };
        assert(Math.abs(candidateShallowWaterFloorRenderedY(seed, riverPoint, MAX_WALKING_DEPTH_CANDIDATE).y - realRenderedY(seed, riverPoint)) < 1e-9,
            '18. a real river coordinate is a complete no-op under the candidate too — never SURFACE_CATEGORY.WATER (Hydrology\'s own "a river is ground color" design), so the candidate\'s own WATER gate never fires for it, exactly like the shipped rule');
    }

    // -------------------------------------------------------------
    // Section E — a minimal, TEST-LOCAL horizontal depth gate, mirroring
    // AvatarTerrainConstraint's own {position, blocked} shape.
    // -------------------------------------------------------------
    {
        const shallowNeighbor = { x: shoreline.shoreX, y: 0, z: shoreline.shoreZ };
        const shallowGateResult = candidateWaterDepthConstraint(seed, shallowNeighbor, shallowPoint, MAX_WALKING_DEPTH_CANDIDATE);
        assert(shallowGateResult.blocked === false && shallowGateResult.position === shallowPoint,
            '19. at the real shallow coordinate (depth under the candidate\'s own limit), the depth gate returns blocked:false and passes the desired position straight through — ordinary walking continues exactly as the real, unmodified AvatarTerrainConstraint already allows there');

        const deepNeighbor = { x: deepPoint.x - 1, y: 0, z: deepPoint.z };
        const deepGateResult = candidateWaterDepthConstraint(seed, deepNeighbor, deepPoint, MAX_WALKING_DEPTH_CANDIDATE);
        assert(deepGateResult.blocked === true &&
            deepGateResult.position.x === deepNeighbor.x && deepGateResult.position.z === deepNeighbor.z && deepGateResult.position.y === deepPoint.y,
            '20. at the real deep coordinate, the depth gate returns blocked:true with X/Z reverted to the caller\'s own current position and Y passed through from the desired position unchanged — the IDENTICAL revert shape AvatarTerrainConstraint.apply()\'s own slope rejection already uses, never a new result shape this codebase has not already seen');

        const controllerSource = codeOnly(await readSource('application/AvatarMovementController.js'));
        const constructorMatch = controllerSource.match(/constructor\(avatarPresenceSession, movementConstraint = null, terrainConstraint = null, stepConstraint = null, treeConstraint = null\)/);
        assert(constructorMatch !== null,
            '21. AvatarMovementController\'s own constructor already accepts FOUR independent, optional, append-only constraints (movementConstraint/terrainConstraint/stepConstraint/treeConstraint, each defaulting to null, added one per milestone since 0.2.42/0.2.77/0.3.2/0.9.63) — confirmed against its real, current source text; a fifth water-depth constraint slot would follow an already-four-times-precedented pattern, not a new architectural shape');

        const riverGateResult = candidateWaterDepthConstraint(seed, { x: river.x - 1, y: 0, z: river.z }, { x: river.x, y: 0, z: river.z }, MAX_WALKING_DEPTH_CANDIDATE);
        assert(riverGateResult.blocked === false,
            '22. the depth gate never fires for a real river coordinate — never WATER-classified — preserving the exact same lake/river asymmetry the shipped rendering rule already has, not a new inconsistency this candidate introduces');
    }

    // -------------------------------------------------------------
    // Section F — a minimal, TEST-LOCAL depth-based speed factor: tested
    // for monotonicity and boundary behavior, never committed to a
    // specific curve.
    // -------------------------------------------------------------
    {
        assert(candidateWaterDepthSpeedFactor(0, MAX_WALKING_DEPTH_CANDIDATE) === 1,
            '23. at zero depth, the candidate speed factor is exactly 1 (full land speed) for a genuine walkable maxWalkingDepth');
        assert(candidateWaterDepthSpeedFactor(MAX_WALKING_DEPTH_CANDIDATE, MAX_WALKING_DEPTH_CANDIDATE) === 0,
            '24. at depth exactly equal to maxWalkingDepth, the candidate speed factor is exactly 0 — movement speed reaches zero exactly where Section E\'s own depth gate would already reject a step INTO that depth in the first place, so the two candidates agree at their shared boundary rather than contradicting one another');

        const sampledDepths = [0, shallowDepth, MAX_WALKING_DEPTH_CANDIDATE * 0.25, MAX_WALKING_DEPTH_CANDIDATE * 0.5, MAX_WALKING_DEPTH_CANDIDATE * 0.75, MAX_WALKING_DEPTH_CANDIDATE, census.deepest.depth];
        let monotonic = true;
        let previousFactor = Infinity;
        for (const depth of sampledDepths) {
            const factor = candidateWaterDepthSpeedFactor(depth, MAX_WALKING_DEPTH_CANDIDATE);
            if (factor > previousFactor + 1e-9) monotonic = false;
            previousFactor = factor;
        }
        assert(monotonic === true,
            `25. across a real, increasing sequence of depths (from 0 through the real scanned shallow and deep coordinates' own depths), the candidate speed factor is monotonically non-increasing — never faster in deeper water than in shallower water`);

        const edgeCases = [-1, census.deepest.depth * 10, NaN, Infinity];
        for (const depth of edgeCases) {
            const factor = candidateWaterDepthSpeedFactor(depth, MAX_WALKING_DEPTH_CANDIDATE);
            assert(Number.isFinite(factor) && factor >= 0 && factor <= 1,
                `26. for an out-of-range or invalid depth input (${depth}), the candidate speed factor stays clamped within [0, 1] and finite (got ${factor}) — never NaN, never negative, never greater than 1`);
        }

        // simulateAvatarMovement()'s own existing movementSpeed
        // parameter still needs no change to consume a depth-derived
        // speed — reconfirming 0.9.614's own assertions 17-18 against
        // the CURRENT shipped simulation, post-0.9.615/0.9.616.
        const forwardState = new AvatarMovementState({ forwardAxis: 1 });
        const landSpeed = 3;
        const depthFactor = candidateWaterDepthSpeedFactor(shallowDepth, MAX_WALKING_DEPTH_CANDIDATE);
        const atLandSpeed = simulateAvatarMovement({ position: { x: 0, y: 0, z: 0 }, rotationY: 0, movementState: forwardState, deltaSeconds: 0.1, movementSpeed: landSpeed });
        const atShallowWaterSpeed = simulateAvatarMovement({ position: { x: 0, y: 0, z: 0 }, rotationY: 0, movementState: forwardState, deltaSeconds: 0.1, movementSpeed: landSpeed * depthFactor });
        const landStep = Math.abs(atLandSpeed.position.z);
        const waterStep = Math.abs(atShallowWaterSpeed.position.z);
        assert(landStep > 0 && waterStep > 0 && Math.abs(waterStep / landStep - depthFactor) < 1e-9,
            '27. simulateAvatarMovement()\'s own existing movementSpeed parameter already scales the resulting step distance through the IDENTICAL arithmetic a ground-vehicle speed already uses — a depth-derived speed needs no change to this consumption seam, exactly as 0.9.614 already found for a hypothetical water speed');

        assert(resolveAvatarVehicleMovementCapability.length === 1,
            '28. but resolveAvatarVehicleMovementCapability() still takes exactly one input (a VehicleType), and application/WorldNavigationSession.js still never calls surfaceCategoryAt()/hydrologyFeatureAt() anywhere in its own real code (reconfirming 0.9.614\'s own assertions 19-20, unchanged by 0.9.615/0.9.616) — the PRODUCER side of a depth-derived speed remains a real, still-open TERRAIN_INTERACTION_SEAM_GAP; the vertical rendering fix did not incidentally close it');
    }

    // -------------------------------------------------------------
    // Section G — boundary continuity: no stuck state, no swimming flag,
    // shoreline-parallel movement unaffected. Uses AvatarTerrainConstraint's
    // OWN injectable heightAt override — explicitly sanctioned by that
    // class's own header for exercising a boundary cleanly without
    // hunting for a real coordinate steep enough — applied here to a
    // synthetic lakebed whose slope (0.15/unit) is deliberately still
    // well within DEFAULT_MAX_WALKABLE_SLOPE (0.75) and comparable to
    // real generated terrain's own steepest ~5% (core/TerrainSurface.js's
    // own ROCK_SLOPE, 0.075, doubled for headroom), never an artificially
    // engineered cliff.
    // -------------------------------------------------------------
    {
        const LAKEBED_SLOPE = 0.15;
        const syntheticHeightAt = (x) => Math.min(LAKE_SURFACE_HEIGHT, LAKE_SURFACE_HEIGHT - Math.max(0, x) * LAKEBED_SLOPE);
        const isWaterAt = (x) => syntheticHeightAt(x) <= WATER_LEVEL;
        const realSlopeConstraint = new AvatarTerrainConstraint({ heightAt: (x) => syntheticHeightAt(x) });

        let cursor = { x: 0, y: 0, z: 0 };
        const STEP_SIZE = 0.5;
        let blockedAt = null;
        for (let i = 0; i < 40; i++) {
            const desired = { x: cursor.x + STEP_SIZE, y: 0, z: cursor.z };
            const slopeResult = realSlopeConstraint.apply(cursor, desired);
            const depthResult = candidateWaterDepthConstraint(seed, cursor, desired, MAX_WALKING_DEPTH_CANDIDATE, (x) => syntheticHeightAt(x), (x) => isWaterAt(x));
            if (slopeResult.blocked || depthResult.blocked) { blockedAt = { ...cursor }; break; }
            cursor = desired;
        }
        assert(blockedAt !== null, '29. walking straight into the synthetic lakebed proceeds normally while depth stays under the limit, and is rejected the instant a step\'s DESTINATION would cross maxWalkingDepth — never partway, never a partial slide, mirroring core/TerrainWalkability.js\'s own "the whole step is rejected outright" design');
        const depthAtBlock = LAKE_SURFACE_HEIGHT - syntheticHeightAt(blockedAt.x);
        assert(depthAtBlock < MAX_WALKING_DEPTH_CANDIDATE + 1e-9,
            `30. the avatar stopped at a real depth (${depthAtBlock.toFixed(4)}) at or under the limit — it was never carried past it before the block took effect`);

        // Parallel-to-shore movement (constant depth, moving in Z, not
        // X) is NOT blocked by the depth gate from that same stopped
        // point.
        const sidewaysResult = candidateWaterDepthConstraint(seed, blockedAt, { x: blockedAt.x, y: 0, z: blockedAt.z + 1 }, MAX_WALKING_DEPTH_CANDIDATE, (x) => syntheticHeightAt(x), (x) => isWaterAt(x));
        assert(sidewaysResult.blocked === false,
            '31. from that same blocked point, a step PARALLEL to the shore (constant depth) is NOT blocked by the depth gate — only a step that would genuinely go DEEPER is ever rejected, confirming this is a depth constraint, not a general "stop here forever" wall');

        // Backing off, then re-approaching, reproduces the identical
        // outcome — no persisted "cannot walk anymore" flag.
        const retreatDesired = { x: blockedAt.x - STEP_SIZE, y: 0, z: blockedAt.z };
        const retreatResult = candidateWaterDepthConstraint(seed, blockedAt, retreatDesired, MAX_WALKING_DEPTH_CANDIDATE, (x) => syntheticHeightAt(x), (x) => isWaterAt(x));
        assert(retreatResult.blocked === false, '32. a step back toward shallower water is never blocked by the depth gate');
        const reapproachDesired = { x: retreatDesired.x + STEP_SIZE, y: 0, z: blockedAt.z };
        const reapproachResult = candidateWaterDepthConstraint(seed, retreatDesired, reapproachDesired, MAX_WALKING_DEPTH_CANDIDATE, (x) => syntheticHeightAt(x), (x) => isWaterAt(x));
        assert(reapproachDesired.x === blockedAt.x && reapproachResult.blocked === false,
            '33. walking forward again afterward lands back on the exact same coordinate the original loop already stood on successfully (not blocked, since it was reached in that very loop) — the gate is a pure, stateless function of CURRENT position on every call, exactly like surfaceCategoryAt() itself (0.9.614\'s own assertion 23, reconfirmed for this new gate); no persisted "cannot walk anymore" flag survives the retreat/reapproach round trip and produces a DIFFERENT answer for the same coordinate');

        const animationStateSource = await readSource('core/AvatarAnimationState.js');
        const movementStateSource = await readSource('core/AvatarMovementState.js');
        assert(!/SWIMMING|WADING/.test(animationStateSource) && !/SWIMMING|WADING/.test(movementStateSource),
            '34. core/AvatarAnimationState.js and core/AvatarMovementState.js — the two existing state vocabularies this candidate would have to extend if it needed a new mode — still contain no SWIMMING/WADING vocabulary of any kind, reconfirming (post-0.9.615/0.9.616) that every candidate in this file is a stateless function of (position, maxWalkingDepth) alone, never a mode an AvatarPresence or AvatarMovementState would need to carry');
    }

    // -------------------------------------------------------------
    // Section H — classification: a fixed, closed vocabulary, one label
    // per finding, never a single verdict standing in for seven
    // different answers.
    // -------------------------------------------------------------
    {
        const LABELS = Object.freeze([
            'MINIMAL_EXTENSION_OF_EXISTING_PATTERN',
            'PRODUCT_DECISION_REQUIRED',
            'TERRAIN_INTERACTION_SEAM_GAP',
            'GEOMETRY_UNDEFINED',
            'RIVER_UNAFFECTED',
            'SWIMMING_STILL_NOT_REQUIRED'
        ]);

        const classification = {
            // Section D: candidateShallowWaterFloorRenderedY is a strict,
            // additive generalization of 0.9.615's own shipped formula
            // (assertion 16) — no new rendering architecture required.
            verticalRenderingModel: 'MINIMAL_EXTENSION_OF_EXISTING_PATTERN',
            // Section E: candidateWaterDepthConstraint mirrors
            // AvatarTerrainConstraint's own existing {position, blocked}
            // contract exactly, and composes through an already-four-
            // times-precedented optional-constraint slot (assertion 21)
            // — no WaterCollisionSystem required.
            horizontalDepthGate: 'MINIMAL_EXTENSION_OF_EXISTING_PATTERN',
            // Section C: no existing avatar geometry names a "neck" or
            // any intermediate body threshold — the exact numeric
            // maxWalkingDepth (and whether AVATAR_COLLISION_HEIGHT is
            // even the right anchor) is a genuine product decision this
            // audit surfaces but does not resolve.
            walkingDepthThresholdSource: 'GEOMETRY_UNDEFINED',
            // Section F: the speed CURVE itself (linear vs. any other
            // shape) is likewise a product decision this audit
            // deliberately does not resolve — only tests for coherence.
            speedModifierCurve: 'PRODUCT_DECISION_REQUIRED',
            // Section F: the speed-consumption seam is already generic
            // (assertion 27), but no terrain-derived PRODUCER exists yet
            // (assertion 28) — the same real, still-open gap 0.9.614
            // already named, untouched by 0.9.615/0.9.616.
            speedModifierProducerWiring: 'TERRAIN_INTERACTION_SEAM_GAP',
            // Section D/E: a river is never SURFACE_CATEGORY.WATER, so
            // every candidate above is a structural no-op for it.
            riverInteraction: 'RIVER_UNAFFECTED',
            // Section G: every candidate is a stateless, per-call
            // function of (position, maxWalkingDepth) — no SWIMMING
            // state, occupancy flag, or AvatarPresence field is
            // structurally required for shallow-water traversal alone.
            explicitStateMachine: 'SWIMMING_STILL_NOT_REQUIRED'
        };

        for (const [finding, label] of Object.entries(classification)) {
            assert(LABELS.includes(label), `35. classification finding "${finding}" uses one of the six fixed labels this audit's own brief specified, never a free-text verdict`);
        }
        const extensionCount = Object.values(classification).filter((l) => l === 'MINIMAL_EXTENSION_OF_EXISTING_PATTERN').length;
        assert(extensionCount === 2 &&
            classification.walkingDepthThresholdSource === 'GEOMETRY_UNDEFINED' &&
            classification.speedModifierCurve === 'PRODUCT_DECISION_REQUIRED' &&
            classification.speedModifierProducerWiring === 'TERRAIN_INTERACTION_SEAM_GAP' &&
            classification.riverInteraction === 'RIVER_UNAFFECTED' &&
            classification.explicitStateMachine === 'SWIMMING_STILL_NOT_REQUIRED',
            '36. the classification is a genuine mix, not a single label rubber-stamped across every finding: the two MECHANICAL questions (how do you render it, how do you block it) close as minimal extensions of patterns that already exist; the two NUMERIC questions (what depth, what curve) are honestly left open as product decisions; the wiring gap and the river/swimming non-findings are each named precisely');

        console.log('Classification:', JSON.stringify(classification, null, 2));
        console.log(`Real terrain-under-water census: ${census.count} WATER cells scanned, mean depth ${census.meanDepth.toFixed(3)}, deepest ${census.deepest.depth.toFixed(3)} at (${census.deepest.x}, ${census.deepest.z}), ${census.exceedingCollisionHeight} cells (${(census.exceedingCollisionHeight / census.count * 100).toFixed(2)}%) exceed AVATAR_COLLISION_HEIGHT.`);
        console.log('Recommendation: the mechanical shape (render-time depth-aware floor + a fourth/fifth append-only movement constraint for the depth gate) is ready to implement as a minimal, additive extension of 0.9.615/0.2.77\'s own existing patterns. Two product decisions remain genuinely open and are NOT resolved by this audit: (1) what maxWalkingDepth actually means in the absence of any existing avatar body-segment geometry beyond AVATAR_COLLISION_HEIGHT, and (2) what shape the depth-to-speed curve should take. Swimming, buoyancy, and drowning remain out of scope, unevidenced by anything measured here.');
    }

    console.log('✅ All Avatar Shallow-Water Traversal Boundary Audit tests passed.');
}

await runTests();
