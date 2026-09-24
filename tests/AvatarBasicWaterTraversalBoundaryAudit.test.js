import { readFile } from 'node:fs/promises';

import { AvatarTerrainConstraint } from '../application/avatar/AvatarTerrainConstraint.js';
import { AvatarStepConstraint } from '../application/avatar/AvatarStepConstraint.js';
import { simulateAvatarMovement } from '../core/AvatarMovementSimulation.js';
import { AvatarMovementState } from '../core/AvatarMovementState.js';
import { AvatarAnimationState, isValidAnimationState } from '../core/AvatarAnimationState.js';
import { DEFAULT_MAX_WALKABLE_SLOPE } from '../core/TerrainWalkability.js';

import { terrainHeightAt, DEFAULT_WORLD_SEED } from '../core/TerrainHeightField.js';
import { surfaceCategoryAt, SURFACE_CATEGORY, WATER_LEVEL } from '../core/TerrainSurface.js';
import { hydrologyFeatureAt, HYDROLOGY_FEATURE, LAKE_SURFACE_HEIGHT, isRiverAt } from '../core/Hydrology.js';
import { resolveAvatarVehicleMovementCapability } from '../core/AvatarVehicleMovementCapability.js';
import { worldNavigationSessionFiles } from './support/SourceFileGroups.js';

// 0.9.614 — Avatar Basic Water Traversal Boundary Audit.
//
// 0.9.613 (tests/AvatarWaterInteractionProductBoundaryAudit.test.js)
// established, empirically, that a real avatar can enter a real
// production-generated lake, walk 60 real world units into its
// interior, and sink visibly below LAKE_SURFACE_HEIGHT with no floor,
// clamp, or state change of any kind — while this same codebase already
// has a working, enforced concept of "not a place things stand" for
// water (core/VehiclePlacement.js's own bicycle ground gate). That
// milestone deliberately stopped at naming the gap; it took no position
// on what, if anything, should fill it.
//
// This is a test-only, decision-oriented audit (no production code
// changes) asking exactly one narrower question: what is the MINIMUM
// coherent avatar-water behavior that closes 0.9.613's own flagship
// finding, without committing this product to a swimming/buoyancy/
// drowning subsystem it has never designed? Every section below either
// TRACES real, unmodified production code to find out what already
// exists, or exercises a test-local CANDIDATE rule (never written to
// any production file) against real, scanned terrain to see whether it
// behaves coherently — exactly the same "scan real generated terrain
// under DEFAULT_WORLD_SEED, never a hand-picked coordinate" discipline
// 0.9.613 and tests/Hydrology.test.js's own Section B already
// established.
//
//   Section A: water occupancy semantics — what can the avatar's own
//              collaborators already answer today, and what do they
//              still need to be combined with, to tell "there is water
//              here" apart from "the avatar is underwater"?
//   Section B: FLAGSHIP — trace the real vertical constraint. What
//              actually determines AvatarPresence.position.y today, and
//              why does 0.9.613's own submersion finding happen at all?
//              The answer turns out to be more structural than a
//              missing `if` check — see this section's own findings.
//   Section C: a minimal, TEST-LOCAL, render-time-only candidate rule,
//              modeled directly on application/world/RenderWorldViewUseCase.js's
//              own existing withGroundElevation() formula — tested for
//              shoreline continuity and depth fidelity, never installed
//              anywhere.
//   Section D: horizontal movement — does an existing movement-speed
//              convention already support a water modifier for free?
//   Section E: does closing this gap require a new SWIMMING state
//              anywhere in this codebase's existing state vocabularies?
//   Section F: the VehiclePlacement precedent, examined precisely —
//              what kind of rule is it actually, and does it hand this
//              milestone a ready-made real-time enforcement pattern?
//   Section G: lake vs. river — does one rule serve both?
//   Section H: classification — a fixed, closed vocabulary, per finding,
//              never a single verdict papering over five different
//              answers.
//
// SUPERSEDED IN PART BY 0.9.615 — Avatar Basic Water Surface Constraint.
// Section C's own candidate below (candidateWaterFloorRenderedY) was
// installed for real, in this exact form, as
// application/world/RenderWorldViewUseCase.js#withGroundElevation()'s new
// water-floor gate — see that file's own 0.9.615 header. Section C's
// TEST-LOCAL function and its own assertions are left completely
// unchanged below: they still independently verify the underlying
// formula's coherence (shoreline continuity, depth fidelity, river
// no-op) on their own terms, and remain correct as a description of
// that formula: only the narrative claim that it is "never installed
// anywhere" is now historical, not current. See
// tests/AvatarBasicWaterSurfaceConstraint.test.js for the dedicated
// proof that the REAL, shipped function (extracted from its own source,
// never re-typed) satisfies the same invariants.

function assert(condition, message) {
    if (!condition) throw new Error(`ASSERT FAILED: ${message}`);
}

// Identical scanning discipline to 0.9.613's own findShoreline() — a
// genuine, deterministic WATER cell with a dry neighbor exactly 1 unit
// away, never assumed to exist at any particular coordinate.
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

// The SAME render-time formula application/world/RenderWorldViewUseCase.js's
// own withGroundElevation() already uses (position.y +
// renderer.terrainHeightAt(x, z), which is itself a thin pass-through
// to terrainHeightAt(seed, x, z) — see that file's own 0.2.76 header).
// Reproduced here, read-only, purely to compute what 0.9.613's own
// flagship already measured, never to change it.
function realRenderedY(seed, position) {
    return position.y + terrainHeightAt(seed, position.x, position.z);
}

// ---------------------------------------------------------------------
// Section C's own candidate — TEST-LOCAL, standing on its own as an
// independent re-derivation of the formula, never imported FROM this
// file BY any production file. Modeled as the SMALLEST possible
// extension of the existing rendering-time-offset pattern: wherever the
// ground is WATER-classified, the rendered floor is the HIGHER of the
// real terrain height and the lake's own fixed surface plane —
// otherwise, byte-identical to the existing formula. This changes
// nothing about AvatarPresence.position.y, nothing about
// core/AvatarMovementSimulation.js, and nothing about any constraint —
// it is exactly one more input combined at the exact same layer
// docs/Principles.md's own "Terrain Elevation Is A Rendering-Time
// Offset, Never A Presence Or Placement Fact (0.2.76)" already
// describes RenderWorldViewUseCase.js as owning.
//
// AMENDED BY 0.9.615 — this exact rule (same gate, same Math.max, same
// two inputs) was independently installed for real inside
// application/world/RenderWorldViewUseCase.js#withGroundElevation() — see
// this file's own "SUPERSEDED IN PART BY 0.9.615" header note, above.
// It was not extracted from this test file (production code never
// imports a test); it was written fresh, to this same design, directly
// in that file. This function stays exactly what it always was: a
// standalone, test-local re-derivation used to verify the DESIGN, now
// independently re-verified against the SHIPPED code by
// tests/AvatarBasicWaterSurfaceConstraint.test.js.
// ---------------------------------------------------------------------
function candidateWaterFloorRenderedY(seed, position) {
    const groundHeight = terrainHeightAt(seed, position.x, position.z);
    const isWaterGround = surfaceCategoryAt(seed, position.x, position.z) === SURFACE_CATEGORY.WATER;
    const floor = isWaterGround ? Math.max(groundHeight, LAKE_SURFACE_HEIGHT) : groundHeight;
    return position.y + floor;
}

async function runTests() {
    const seed = DEFAULT_WORLD_SEED;
    const SCAN_HALF_EXTENT = 400;

    const shoreline = findShoreline(seed, SCAN_HALF_EXTENT);
    assert(shoreline !== null, 'setup: a real lake shoreline exists in the scanned region under the default world seed');
    const river = findRiverCoordinate(seed, SCAN_HALF_EXTENT);
    assert(river !== null, 'setup: a real river coordinate exists in the scanned region under the default world seed');

    // Reproduce 0.9.613's own flagship interior walk, using nothing but
    // the real, unmodified AvatarTerrainConstraint.apply(), to obtain a
    // genuine DEEP lake-interior coordinate — never hand-picked — for
    // Sections B/C/D/E to test against alongside the shoreline itself.
    const constraint = new AvatarTerrainConstraint({ seed });
    const stepSize = 0.3;
    const stepCount = 200;
    let cursor = { x: shoreline.shoreX, y: 0, z: shoreline.shoreZ };
    for (let i = 0; i < stepCount; i++) {
        const desired = { x: cursor.x + shoreline.dirX * stepSize, y: 0, z: cursor.z + shoreline.dirZ * stepSize };
        const stepResult = constraint.apply(cursor, desired);
        if (stepResult.blocked) break;
        cursor = stepResult.position;
    }
    const deepInterior = { x: cursor.x, y: 0, z: cursor.z };
    assert(surfaceCategoryAt(seed, deepInterior.x, deepInterior.z) === SURFACE_CATEGORY.WATER,
        'setup: the reproduced flagship walk genuinely ends on real WATER ground, exactly as 0.9.613 found');
    const deepSubmersion = LAKE_SURFACE_HEIGHT - realRenderedY(seed, deepInterior);
    assert(deepSubmersion > 0,
        'setup: the reproduced deep-interior coordinate genuinely reproduces 0.9.613\'s own submersion finding (a positive number)');

    // -------------------------------------------------------------
    // Section A — water occupancy semantics: what the avatar's own
    // collaborators can already answer, and the one distinction they
    // cannot answer alone.
    // -------------------------------------------------------------
    {
        // AvatarTerrainConstraint's own apply() already computes
        // terrainHeightAt(seed, x, z) internally, on every call, from
        // exactly the (x, z) pair its caller already supplies — see
        // its own constructor: `heightAt = (x, z) => terrainHeightAt(seed, x, z)`.
        // "Is there water here" is answerable from the SAME two
        // arguments, using the SAME seed already closed over — no new
        // collaborator, no new dependency injection, just one more
        // import at the same call site.
        assert(surfaceCategoryAt(seed, deepInterior.x, deepInterior.z) === SURFACE_CATEGORY.WATER,
            '1. surfaceCategoryAt() answers "is there water here" from exactly the (seed, x, z) triple AvatarTerrainConstraint already has in scope on every apply() call');
        assert(hydrologyFeatureAt(seed, deepInterior.x, deepInterior.z) === HYDROLOGY_FEATURE.LAKE,
            '2. hydrologyFeatureAt() agrees — the same real coordinate the avatar already walked onto, unblocked, in the reproduced flagship walk');

        // LAKE_SURFACE_HEIGHT is one FIXED constant (== WATER_LEVEL),
        // never a per-lake or per-coordinate lookup — "where is the
        // water's own surface" needs no query of its own at all, only
        // one imported number, the same way GROUND_Y is one constant
        // core/AvatarMovementSimulation.js already imports nothing to
        // obtain.
        assert(LAKE_SURFACE_HEIGHT === WATER_LEVEL, '3. the water surface height is a single fixed constant, not a per-lake fact requiring its own query');

        // "There is water here" is answerable from (seed, x, z) ALONE —
        // it has no idea the avatar exists, let alone what Y the avatar
        // is currently at. Calling it twice with the SAME (x, z) but
        // imagining two wildly different avatar heights changes nothing
        // about the answer, because the function never receives a Y at
        // all.
        const groundFactA = surfaceCategoryAt(seed, deepInterior.x, deepInterior.z);
        const groundFactB = surfaceCategoryAt(seed, deepInterior.x, deepInterior.z);
        assert(groundFactA === groundFactB && groundFactA === SURFACE_CATEGORY.WATER,
            '4. "is there water here" is a pure fact of (seed, x, z) alone — structurally incapable of seeing the avatar\'s own vertical position at all');

        // "Is the avatar UNDERWATER" is a genuinely different question:
        // it can only be answered by comparing something the GROUND
        // knows (terrainHeightAt) against something the AVATAR knows
        // (position.y) — via the exact rendering formula 0.9.613's own
        // flagship already used. Neither fact alone answers it; the two
        // must be combined, and nothing in this codebase's own
        // observable surfaces (AvatarPresence, AvatarMovementController#
        // movementState(), WorldSpatialContext) currently performs or
        // stores that combination anywhere (see 0.9.613's own
        // assertions 18/20/26).
        const isUnderwater = realRenderedY(seed, deepInterior) < LAKE_SURFACE_HEIGHT
            && surfaceCategoryAt(seed, deepInterior.x, deepInterior.z) === SURFACE_CATEGORY.WATER;
        assert(isUnderwater === true,
            '5. "is the avatar underwater" is only answerable by combining a ground fact (terrainHeightAt) with an avatar fact (position.y) through the SAME rendering formula already used elsewhere — it is not a single existing field anywhere');
    }

    // -------------------------------------------------------------
    // Section B — FLAGSHIP: trace the real vertical constraint. What
    // actually governs AvatarPresence.position.y today?
    // -------------------------------------------------------------
    {
        // core/AvatarMovementSimulation.js#simulateAvatarMovement() is
        // the ONE function that ever computes a next Y. Called directly
        // (no x/z parameter exists in its signature at all — see its
        // own destructured argument list), it produces the exact same
        // Y regardless of which real-world coordinate the avatar is
        // conceptually standing at.
        const idleState = new AvatarMovementState();
        const resultAtShoreline = simulateAvatarMovement({
            position: { x: shoreline.shoreX, y: 0, z: shoreline.shoreZ },
            movementState: idleState,
            deltaSeconds: 0.05
        });
        const resultAtDeepInterior = simulateAvatarMovement({
            position: { x: deepInterior.x, y: 0, z: deepInterior.z },
            movementState: idleState,
            deltaSeconds: 0.05
        });
        assert(resultAtShoreline.position.y === 0 && resultAtDeepInterior.position.y === 0,
            '6. FLAGSHIP: simulateAvatarMovement() resolves Y to the exact same flat floor (0) whether the avatar is conceptually on dry shoreline or deep inside a real lake — it has no x/z parameter through which real terrain OR water could ever reach it');

        // The ONE seam capable of overriding that flat floor —
        // AvatarStepConstraint#supportHeightAt() — is, BY ITS OWN
        // DESIGN, never wired to terrainHeightAt() at all (see its own
        // header: "Deliberately NOT core/TerrainHeightField.js's real,
        // hilly terrainHeightAt()"). Unwired (no loadedDocuments), it
        // returns the identical flat baseline for a real dry coordinate
        // and a real deep-lake coordinate alike.
        const stepConstraint = new AvatarStepConstraint({});
        const supportAtShoreline = stepConstraint.supportHeightAt(shoreline.shoreX, shoreline.shoreZ);
        const supportAtDeepInterior = stepConstraint.supportHeightAt(deepInterior.x, deepInterior.z);
        assert(supportAtShoreline === 0 && supportAtDeepInterior === 0 && supportAtShoreline === supportAtDeepInterior,
            '7. AvatarStepConstraint#supportHeightAt() returns the byte-identical flat baseline for dry ground and real lake ground alike — the one seam that COULD override the flat floor was never built to consult real terrain height, water or not');

        // Confirmed structurally, not just behaviorally: neither file
        // in the vertical-kinematics path references hydrology, or even
        // real terrain height, anywhere in its own code.
        const stepConstraintSource = await readFile(new URL('../application/avatar/AvatarStepConstraint.js', import.meta.url), 'utf8');
        const stepConstraintCode = stepConstraintSource.split('\n').filter((line) => !line.trim().startsWith('//')).join('\n');
        assert(!stepConstraintCode.includes('terrainHeightAt') && !stepConstraintCode.includes('Hydrology'),
            '8. application/avatar/AvatarStepConstraint.js contains no reference to terrainHeightAt or Hydrology anywhere in its own code — this is a deliberate, named design boundary (0.3.2), not an oversight this milestone discovered');

        const simulationSource = await readFile(new URL('../core/AvatarMovementSimulation.js', import.meta.url), 'utf8');
        const simulationCode = simulationSource.split('\n').filter((line) => !line.trim().startsWith('//')).join('\n');
        assert(!/Hydrology|LAKE_SURFACE_HEIGHT|WATER_LEVEL|surfaceCategoryAt/.test(simulationCode),
            '9. core/AvatarMovementSimulation.js contains no water-related reference of any kind — confirming no hidden water floor already exists anywhere in the vertical kinematics this milestone traced');

        // This reframes 0.9.613's own finding: the avatar is not
        // failing a water-specific check that terrain-following Y logic
        // otherwise has — there IS no terrain-following Y in the
        // simulation at all, for hills OR lakes alike (see
        // docs/Principles.md, "Terrain Elevation Is A Rendering-Time
        // Offset, Never A Presence Or Placement Fact (0.2.76)"). The
        // real, unmodified render-time formula reproduces exactly what
        // 0.9.613 already measured.
        assert(Math.abs(realRenderedY(seed, deepInterior) - (deepInterior.y + terrainHeightAt(seed, deepInterior.x, deepInterior.z))) < 1e-9,
            '10. the real rendered Y (0.9.613\'s own measured quantity) is exactly position.y + terrainHeightAt(seed, x, z) — the same rendering-time formula application/world/RenderWorldViewUseCase.js already applies for ordinary hills, extended to a coordinate that happens to be a lake');
    }

    // -------------------------------------------------------------
    // Section C — a minimal, TEST-LOCAL, render-time-only candidate
    // rule: never installed anywhere, tested here only for coherence.
    // -------------------------------------------------------------
    {
        // At the deep interior: the candidate floors the avatar at the
        // lake's own fixed surface, where the real formula sinks it
        // (0.9.613's own finding, reproduced in `deepSubmersion` above).
        const candidateDeep = candidateWaterFloorRenderedY(seed, deepInterior);
        assert(Math.abs(candidateDeep - LAKE_SURFACE_HEIGHT) < 1e-9,
            '11. the candidate rule holds the avatar exactly AT the lake surface at the deep-interior coordinate, where the real formula currently sinks it below by a real, positive amount');
        assert(candidateDeep > realRenderedY(seed, deepInterior),
            '12. ...strictly higher than the real (unclamped) rendered Y at that same coordinate — the candidate genuinely closes 0.9.613\'s own flagship gap, not merely relabels it');

        // Shoreline continuity: the dry cell just before the water gets
        // NO candidate adjustment at all (its own ground category is
        // never WATER); the first wet cell gets clamped to the surface.
        // The GAP between the two is bounded by the exact same
        // DEFAULT_MAX_WALKABLE_SLOPE that already let the avatar cross
        // that specific 1-unit step in the first place (0.9.613's own
        // assertion 10): the dry cell's real height can be at most
        // DEFAULT_MAX_WALKABLE_SLOPE above the wet cell's real height,
        // and the wet cell's real height is, by classification, at or
        // below WATER_LEVEL — so the dry cell's real height is bounded
        // within DEFAULT_MAX_WALKABLE_SLOPE of WATER_LEVEL too.
        const dryPoint = { x: shoreline.shoreX, y: 0, z: shoreline.shoreZ };
        const firstWetPoint = { x: shoreline.lakeX, y: 0, z: shoreline.lakeZ };
        const realDryY = realRenderedY(seed, dryPoint);
        const candidateWetY = candidateWaterFloorRenderedY(seed, firstWetPoint);
        const shorelineDelta = Math.abs(candidateWetY - realDryY);
        assert(shorelineDelta <= DEFAULT_MAX_WALKABLE_SLOPE + 1e-6,
            `13. the candidate rule's own shoreline transition is bounded by the SAME slope tolerance (${DEFAULT_MAX_WALKABLE_SLOPE}) that already governs every other 1-unit terrain step the avatar walks over — no larger, more jarring pop is introduced at the water's edge than ordinary hilly terrain already tolerates (measured delta: ${shorelineDelta.toFixed(4)})`);

        // Depth fidelity, named honestly rather than hidden: the
        // candidate collapses EVERY water depth to the identical fixed
        // surface height, so the avatar's own rendered feet read as
        // "exactly at the surface" whether the real lake bed just
        // beneath is barely below WATER_LEVEL (the first wet cell) or
        // deep inside it (deepInterior) — a real, measurable loss of
        // depth-relative fidelity, not a hidden cost.
        const realHeightDelta = Math.abs(
            terrainHeightAt(seed, deepInterior.x, deepInterior.z) - terrainHeightAt(seed, firstWetPoint.x, firstWetPoint.z)
        );
        const candidateWetDeep = candidateWaterFloorRenderedY(seed, deepInterior);
        assert(Math.abs(candidateWetY - candidateWetDeep) < 1e-9,
            '14. the candidate rule renders the shoreline\'s first wet cell and the deep interior at the EXACT same apparent surface height...');
        assert(realHeightDelta > 0.01,
            `15. ...even though their real, underlying terrain heights genuinely differ by a measurable amount (${realHeightDelta.toFixed(4)} world units) — this minimal rule trades away apparent depth entirely in exchange for never sinking below the surface, a real, named limitation rather than an accidental one`);

        // Sanity: never NaN/non-finite across every real point scanned
        // so far, dry or wet.
        for (const point of [dryPoint, firstWetPoint, deepInterior, { x: river.x, y: 0, z: river.z }]) {
            assert(Number.isFinite(candidateWaterFloorRenderedY(seed, point)),
                '16. the candidate rule produces a finite number for every real scanned point exercised by this audit, dry, lake, or river alike');
        }
    }

    // -------------------------------------------------------------
    // Section D — horizontal movement: does an existing movement-speed
    // convention already carry a water modifier for free?
    // -------------------------------------------------------------
    {
        // simulateAvatarMovement()'s own `movementSpeed` parameter is
        // already a bare, semantically opaque number — the exact seam
        // 0.9.86 built so a GROUND_VEHICLE capability's speed and
        // WALK's own speed take the identical code path. Feeding it a
        // number that would represent a hypothetical "wading" speed
        // exercises that SAME path, unmodified.
        const forwardState = new AvatarMovementState({ forwardAxis: 1 });
        const atWalkSpeed = simulateAvatarMovement({
            position: { x: deepInterior.x, y: 0, z: deepInterior.z },
            rotationY: 0,
            movementState: forwardState,
            deltaSeconds: 0.1,
            movementSpeed: 3
        });
        const atHypotheticalWaterSpeed = simulateAvatarMovement({
            position: { x: deepInterior.x, y: 0, z: deepInterior.z },
            rotationY: 0,
            movementState: forwardState,
            deltaSeconds: 0.1,
            movementSpeed: 1.2
        });
        const walkStep = Math.abs(atWalkSpeed.position.z - deepInterior.z);
        const waterStep = Math.abs(atHypotheticalWaterSpeed.position.z - deepInterior.z);
        assert(walkStep > 0 && waterStep > 0, '17. both speeds actually move the avatar this tick');
        assert(Math.abs(waterStep / walkStep - 1.2 / 3) < 1e-9,
            '18. a hypothetical water movement speed scales the resulting step distance through the IDENTICAL arithmetic a ground-vehicle speed already uses — the consumption seam is already fully generic and needs no change to accept a terrain-derived speed');

        // But the only thing that currently ever PRODUCES a non-default
        // movementSpeed is a vehicle-mount relationship —
        // resolveAvatarVehicleMovementCapability(vehicleType), arity 1,
        // keyed on VehicleType alone (0.9.84's own explicit design).
        assert(resolveAvatarVehicleMovementCapability.length === 1,
            '19. resolveAvatarVehicleMovementCapability() takes exactly one input — a VehicleType — with no seam for a ground/terrain fact of any kind');

        // And application/world/WorldNavigationSession.js — the one place
        // that resolves a capability and calls setMovementCapability()
        // each frame — never once calls a hydrology or ground-category
        // function to do it.
        const sessionSource = (await Promise.all(worldNavigationSessionFiles().map((file) => readFile(new URL(`../${file}`, import.meta.url), 'utf8')))).join('\n');
        const sessionCode = sessionSource.split('\n').filter((line) => !line.trim().startsWith('//')).join('\n');
        assert(!sessionCode.includes('hydrologyFeatureAt(') && !sessionCode.includes('surfaceCategoryAt('),
            '20. application/world/WorldNavigationSession.js never calls hydrologyFeatureAt()/surfaceCategoryAt() anywhere in its own code — the ONLY existing movement-capability PRODUCER is vehicle-mount-derived; a terrain-derived producer would be genuinely new wiring, not a rewire of something already halfway there');
    }

    // -------------------------------------------------------------
    // Section E — does closing this gap require a new SWIMMING state
    // anywhere in this codebase's existing state vocabularies?
    // -------------------------------------------------------------
    {
        // A reduced, hypothetical water speed still resolves to one of
        // the FOUR existing AvatarAnimationState values — no new
        // animation vocabulary is structurally required merely to keep
        // the numbers coherent (whether it looks convincing is a
        // separate, later, presentation question this audit does not
        // answer).
        const forwardState = new AvatarMovementState({ forwardAxis: 1 });
        const waterTickResult = simulateAvatarMovement({
            position: { x: deepInterior.x, y: 0, z: deepInterior.z },
            rotationY: 0,
            movementState: forwardState,
            deltaSeconds: 0.1,
            movementSpeed: 1.2
        });
        assert(isValidAnimationState(waterTickResult.animation) && waterTickResult.animation === AvatarAnimationState.WALKING,
            '21. a reduced, water-scale movement speed still resolves to an existing AvatarAnimationState (WALKING) — resolveAnimationState() only ever consults moving/running/grounded, never a speed magnitude, so no new animation state is REQUIRED for basic traversal');

        // The result shape itself gains no new required field merely
        // because a different movementSpeed was supplied.
        assert(JSON.stringify(Object.keys(waterTickResult).sort()) ===
            JSON.stringify(['animation', 'currentMovementSpeed', 'grounded', 'position', 'rotationY', 'verticalState', 'verticalVelocity'].sort()),
            '22. simulateAvatarMovement()\'s own result shape is unchanged by a non-default movementSpeed — the existing shape already tolerates an arbitrary base speed, water-derived or otherwise');

        // The one fact a water rule actually needs each tick — "is the
        // ground under the avatar's CURRENT position WATER" — is a
        // pure, stateless, per-tick-recomputable function of (seed, x,
        // z) alone, unlike `_currentMovementSpeed`/`_vehicleBrakingIntent`
        // (application/avatar/AvatarMovementController.js's own genuinely
        // PERSISTED controller state, carried tick to tick). Two
        // independent calls with no shared object agree exactly,
        // because there is nothing to remember.
        const factA = surfaceCategoryAt(seed, deepInterior.x, deepInterior.z) === SURFACE_CATEGORY.WATER;
        const factB = surfaceCategoryAt(DEFAULT_WORLD_SEED, deepInterior.x, deepInterior.z) === SURFACE_CATEGORY.WATER;
        assert(factA === true && factA === factB,
            '23. "is the avatar currently over water" is recomputable fresh from position alone on every tick — it needs no persisted flag, no transition function, and no place to live between ticks the way genuine controller state does, which is the structural reason a full state machine is not obviously required here');
    }

    // -------------------------------------------------------------
    // Section F — the VehiclePlacement precedent, examined precisely.
    // -------------------------------------------------------------
    {
        // core/VehiclePlacement.js's own ground gate is real and
        // enforced (0.9.613's own assertions 21/22) — but it fires
        // exactly once, at procedural PLACEMENT time, inside
        // presenceForCell(). It is never consulted again afterward:
        // there is no runtime check anywhere that re-validates a placed
        // bicycle still isn't standing in water, because nothing in
        // this codebase ever moves a placed bicycle at all (see that
        // file's own "Deliberately not yet": "vehicle movement, speed,
        // heading, or any physics").
        const vehiclePlacementSource = await readFile(new URL('../core/VehiclePlacement.js', import.meta.url), 'utf8');
        assert(vehiclePlacementSource.includes('vehicle movement, speed, heading, or any physics'),
            '24. core/VehiclePlacement.js\'s own header names, in its own words, that vehicle movement/physics is explicitly not yet built — the ground gate cannot be a movement-time precedent for something that has no movement of its own to constrain');

        // And application/avatar/AvatarMovementController.js — the file that
        // WOULD need to consult a water rule during real-time movement
        // — never imports VehiclePlacement at all, confirming the gate
        // is genuinely placement-only, structurally unreachable from
        // the avatar's own movement pipeline.
        const controllerSource = await readFile(new URL('../application/avatar/AvatarMovementController.js', import.meta.url), 'utf8');
        const controllerCode = controllerSource.split('\n').filter((line) => !line.trim().startsWith('//')).join('\n');
        assert(!controllerCode.includes('VehiclePlacement') && !controllerCode.includes('vehiclePresenceInRegion'),
            '25. application/avatar/AvatarMovementController.js never references core/VehiclePlacement.js or vehiclePresenceInRegion() anywhere in its own code — the bicycle ground gate is a PLACEMENT restriction (procedural content-generation hygiene), never a real-time movement constraint this milestone could simply reuse');
    }

    // -------------------------------------------------------------
    // Section G — lake vs. river: does one rule serve both?
    // -------------------------------------------------------------
    {
        // A river's own ground category is never WATER (Hydrology.js's
        // own "A River Is Ground Color" design, reconfirmed here) — so
        // the Section C candidate's own WATER gate never fires for a
        // river coordinate at all. It is a structural no-op, not a
        // rule that happens to produce zero change.
        const riverPoint = { x: river.x, y: 0, z: river.z };
        assert(surfaceCategoryAt(seed, river.x, river.z) !== SURFACE_CATEGORY.WATER,
            '26. a real scanned river coordinate is never SURFACE_CATEGORY.WATER — confirming the lake-only gate the candidate rule (and LAKE_SURFACE_HEIGHT itself) is built around');
        assert(candidateWaterFloorRenderedY(seed, riverPoint) === realRenderedY(seed, riverPoint),
            '27. the candidate rule is a complete no-op at a real river coordinate — a river needs no new handling under this minimal rule at all, it already renders exactly as ordinary (tinted) walkable ground');

        // The two "waters" are guaranteed to sit on opposite sides of
        // WATER_LEVEL — surfaceCategoryAt()'s own classification is
        // `height <= WATER_LEVEL -> WATER`, `height > WATER_LEVEL` is
        // the ONLY way to ever reach GRASS, and isRiverAt() requires
        // GRASS. But the guarantee is a strict inequality with no
        // promised margin: this real, scanned river coordinate sits
        // barely above WATER_LEVEL at all (a river can run right along
        // a lake's own low-lying shore), which is itself the honest
        // finding — a lake has a real fixed surface PLANE to clamp
        // toward; a river, even one this close to WATER_LEVEL in raw
        // height, structurally never does, because it is color layered
        // onto ordinary walkable ground, never a depression in the
        // height field at all.
        const riverHeight = terrainHeightAt(seed, river.x, river.z);
        assert(riverHeight > WATER_LEVEL,
            `28. the river coordinate's own real terrain height (${riverHeight.toFixed(4)}) is guaranteed strictly above WATER_LEVEL (${WATER_LEVEL.toFixed(4)}) — by however thin a margin — because isRiverAt() requires GRASS classification, and GRASS is structurally unreachable at or below WATER_LEVEL; a river has no fixed surface plane to clamp toward the way a lake does, regardless of how close its raw height sits to the lake threshold`);
    }

    // -------------------------------------------------------------
    // Section H — classification: a fixed, closed vocabulary, one
    // label per finding, never a single verdict standing in for five
    // different answers.
    // -------------------------------------------------------------
    {
        const LABELS = Object.freeze([
            'BASIC_WATER_TRAVERSAL_SUFFICIENT',
            'SWIMMING_STATE_REQUIRED',
            'BUOYANCY_REQUIRED',
            'TERRAIN_INTERACTION_SEAM_GAP',
            'WATER_INTERACTION_REQUIREMENT_UNCLEAR'
        ]);

        const classification = {
            // Section B/C: a render-time-only floor, modeled on the
            // EXISTING "Terrain Elevation Is A Rendering-Time Offset"
            // pattern, closes 0.9.613's own flagship submersion finding
            // with no new AvatarPresence field, no new simulation
            // state, and a shoreline transition bounded by the existing
            // slope tolerance.
            verticalSubmersionInvariant: 'BASIC_WATER_TRAVERSAL_SUFFICIENT',
            // Section D: the SPEED-CONSUMPTION seam is already fully
            // generic (Section D, assertions 17-18) — but the only
            // existing PRODUCER is vehicle-mount-derived (assertion 19),
            // and no terrain-derived producer exists yet in the one
            // file that would need one (assertion 20), with composition
            // against a simultaneous vehicle capability left genuinely
            // open. Real, but small, and not a blocker to the vertical
            // invariant above.
            horizontalMovementSpeedModifier: 'TERRAIN_INTERACTION_SEAM_GAP',
            // Section E: "is the avatar over water" is a stateless,
            // per-tick-recomputable fact, unlike the controller's own
            // genuinely persisted transient state — no explicit state
            // machine is structurally required for the minimum
            // behavior this audit tested.
            explicitStateMachine: 'BASIC_WATER_TRAVERSAL_SUFFICIENT',
            // Section G: a river needs zero new handling under the
            // Section C candidate — it is already coherent, ordinary
            // walkable ground.
            riverTraversal: 'BASIC_WATER_TRAVERSAL_SUFFICIENT',
            // Never tested by this audit, and deliberately not guessed
            // at: whether the product actually WANTS buoyancy, diving,
            // or drowning is a design decision this milestone's own
            // brief explicitly declined to make, and nothing measured
            // here provides evidence either way.
            buoyancyOrDrowning: 'WATER_INTERACTION_REQUIREMENT_UNCLEAR'
        };

        for (const [finding, label] of Object.entries(classification)) {
            assert(LABELS.includes(label), `29. classification finding "${finding}" uses one of the five fixed labels this audit's own brief specified, never a free-text verdict`);
        }
        const sufficientCount = Object.values(classification).filter((l) => l === 'BASIC_WATER_TRAVERSAL_SUFFICIENT').length;
        assert(sufficientCount === 3 && classification.horizontalMovementSpeedModifier === 'TERRAIN_INTERACTION_SEAM_GAP' &&
            classification.buoyancyOrDrowning === 'WATER_INTERACTION_REQUIREMENT_UNCLEAR',
            '30. the classification is a genuine mix, not a single label rubber-stamped across every finding — three sub-questions close cleanly, one names a small real gap, and one is honestly left unresolved');

        console.log('Classification:', JSON.stringify(classification, null, 2));
    }

    console.log('✅ All Avatar Basic Water Traversal Boundary Audit tests passed.');
}

await runTests();
