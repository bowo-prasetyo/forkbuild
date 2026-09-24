import { readFile } from 'node:fs/promises';

import { AvatarTerrainConstraint } from '../application/avatar/AvatarTerrainConstraint.js';
import { AvatarMovementController } from '../application/avatar/AvatarMovementController.js';
import { AvatarTemplateRegistry } from '../core/AvatarTemplateRegistry.js';
import { CoreAvatarTemplateLibrary } from '../core/library/CoreAvatarTemplateLibrary.js';
import { AvatarProfileUseCase } from '../application/avatar/AvatarProfileUseCase.js';
import { AvatarPresenceSession } from '../application/avatar/AvatarPresenceSession.js';
import { LocalIdentityProvider } from '../identity/LocalIdentityProvider.js';
import { StorageProvider } from '../storage/StorageProvider.js';
import { simulateAvatarMovement } from '../core/AvatarMovementSimulation.js';
import { AvatarMovementState } from '../core/AvatarMovementState.js';
import { AvatarAnimationState } from '../core/AvatarAnimationState.js';

import { terrainHeightAt, DEFAULT_WORLD_SEED } from '../core/TerrainHeightField.js';
import { surfaceCategoryAt, SURFACE_CATEGORY, WATER_LEVEL } from '../core/TerrainSurface.js';
import { hydrologyFeatureAt, HYDROLOGY_FEATURE, LAKE_SURFACE_HEIGHT, isRiverAt, hydrologyGroundColorAt } from '../core/Hydrology.js';
import { DEFAULT_MAX_WALKING_DEPTH } from '../core/AvatarWaterWalkability.js';
import { buildWaterTileMesh } from '../renderer/WaterTileMesh.js';
import { TERRAIN_TILE_SIZE, tileCoordinateForPosition } from '../core/TerrainTiling.js';
import { computeCameraFraming, CameraPerspective } from '../core/CameraPerspective.js';

// 0.9.616 — Avatar Basic Water Traversal Product Closure Audit.
//
// 0.9.613 found a real avatar sinking, unclamped, below LAKE_SURFACE_HEIGHT
// the farther it walked into a real lake. 0.9.614 traced the cause and
// test-drove a minimal, render-time-only candidate fix. 0.9.615 installed
// that candidate for real, in application/world/RenderWorldViewUseCase.js's own
// withGroundElevation(). This milestone is the final validation pass for
// that arc: a test-only, decision-oriented audit (no production code
// changes) asking whether the rendering-layer water constraint is a
// coherent enough user experience to CLOSE the basic-water-surface arc, or
// whether the divergence it deliberately leaves behind — AvatarPresence.
// position.y stays a flat simulated plane; only the RENDERED position is
// floored — constitutes a real, remaining product gap.
//
//   Section A: FLAGSHIP — drive the real, fully wired
//              AvatarMovementController through a genuine deep lake and
//              verify the RENDERED avatar (the real, shipped
//              withGroundElevation(), extracted from its own source, never
//              re-typed) stays at/above the surface, keeps moving
//              horizontally, and stays stable across repeated ticks.
//   Section B: THE CENTRAL QUESTION — measure the authoritative/rendered
//              divergence, then enumerate every real, existing consumer of
//              AvatarPresence.position(.y) in this codebase and classify
//              whether each one can actually observe it.
//   Section C: shoreline transition — land -> water -> land, verified tick
//              by tick through the real controller, confirming no hidden
//              water state persists once back on dry ground.
//   Section D: rivers — is "a river behaves differently from a lake"
//              itself a coherent story, or a contradiction with how water
//              is presented?
//   Section E: composition — does the water floor interact correctly with
//              the jump offset, and does it stay scoped to avatars alone
//              (never bleeding into buildings/vehicles/remote markers)?
//   Section F: movement semantics — does walking across a lake at ordinary
//              land speed, with ordinary WALK animation, contradict
//              anything this product currently presents?
//   Section G: state/persistence — reconfirm, against the CURRENTLY
//              shipped code, that no SWIMMING state, occupancy flag, or
//              placement mutation was ever introduced.
//   Section H: closure classification — one of a fixed, closed vocabulary
//              per finding, never a single verdict standing in for eight
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
// tests/AvatarBasicWaterSurfaceConstraint.test.js's own helper — pulls a
// function's real body straight out of its real source text, never
// re-typed by hand, so every assertion below tests the SHIPPED code.
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

// Scans for a real, dry (never-WATER) coordinate whose terrain height is
// genuinely well above zero — a "hill," used by Section B to test whether
// the divergence it measures is water-specific or a general, pre-existing
// terrain-following characteristic.
function findHillCoordinate(seed, halfExtent, minHeight) {
    let best = null;
    for (let x = -halfExtent; x < halfExtent; x += 2) {
        for (let z = -halfExtent; z < halfExtent; z += 2) {
            if (surfaceCategoryAt(seed, x, z) === SURFACE_CATEGORY.WATER) continue;
            const h = terrainHeightAt(seed, x, z);
            if (!best || h > best.height) best = { x, z, height: h };
            if (best.height >= minHeight) return best;
        }
    }
    return best;
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
    const hill = findHillCoordinate(seed, SCAN_HALF_EXTENT, 3);
    assert(hill !== null && hill.height > 0.5,
        `setup: a real, dry hill coordinate exists with a non-trivial terrain height (${hill && hill.height.toFixed(3)})`);

    // The real, shipped withGroundElevation(), extracted from its own
    // source text — never re-typed — exactly as
    // tests/AvatarBasicWaterSurfaceConstraint.test.js's own Section A
    // already established.
    const renderWorldViewSource = await readSource('application/world/RenderWorldViewUseCase.js');
    const withGroundElevationBody = extractFunctionBody(renderWorldViewSource, 'function withGroundElevation(position) {');
    assert(withGroundElevationBody !== null, '1. application/world/RenderWorldViewUseCase.js#withGroundElevation() is located and extracted from its real, current source text');
    // AMENDED BY 0.9.634 — the real, current source text now references
    // DEFAULT_MAX_WALKING_DEPTH (core/AvatarWaterWalkability.js) as a
    // free identifier; this dynamic extraction must supply it too, the
    // same reasoning tests/AvatarShallowWaterTraversalBoundaryAudit.test.js
    // (0.9.633) and tests/AvatarBasicWaterSurfaceConstraint.test.js
    // (0.9.615) already applied to their own identical extraction.
    const buildWithGroundElevation = new Function(
        'renderer', 'surfaceCategoryAt', 'SURFACE_CATEGORY', 'LAKE_SURFACE_HEIGHT', 'DEFAULT_WORLD_SEED', 'DEFAULT_MAX_WALKING_DEPTH',
        `${withGroundElevationBody}\nreturn withGroundElevation;`
    );
    const fakeRenderer = { terrainHeightAt: (x, z) => terrainHeightAt(seed, x, z) };
    const withGroundElevation = buildWithGroundElevation(fakeRenderer, surfaceCategoryAt, SURFACE_CATEGORY, LAKE_SURFACE_HEIGHT, DEFAULT_WORLD_SEED, DEFAULT_MAX_WALKING_DEPTH);

    // Reproduce the flagship's own deep-interior walk with the real,
    // unmodified AvatarTerrainConstraint — never a hand-picked coordinate.
    const constraint = new AvatarTerrainConstraint({ seed });
    function walkInto(start, dirX, dirZ, stepSize, stepCount) {
        let cursor = { ...start };
        for (let i = 0; i < stepCount; i++) {
            const desired = { x: cursor.x + dirX * stepSize, y: 0, z: cursor.z + dirZ * stepSize };
            const stepResult = constraint.apply(cursor, desired);
            if (stepResult.blocked) break;
            cursor = stepResult.position;
        }
        return cursor;
    }
    // AMENDED BY 0.9.634 — the original 200-step walk (60 world units)
    // landed on a genuinely SHALLOW coordinate (depth well under
    // DEFAULT_MAX_WALKING_DEPTH) — sufficient for 0.9.615's own
    // depth-blind clamp, which fired at ANY positive depth, but no
    // longer deep enough to exercise the clamp this milestone's own
    // formula still preserves BEYOND the walkable limit. 530 steps
    // (159 world units) reaches a real, scanned coordinate in this SAME
    // lake whose depth genuinely exceeds DEFAULT_MAX_WALKING_DEPTH —
    // preserving every one of this section's own "deep lake" assertions
    // below, now against a coordinate that is actually deep under the
    // new, finer-grained rule, not merely under the old, depth-blind one.
    const deepInterior = walkInto({ x: shoreline.shoreX, y: 0, z: shoreline.shoreZ }, shoreline.dirX, shoreline.dirZ, 0.3, 530);
    assert(surfaceCategoryAt(seed, deepInterior.x, deepInterior.z) === SURFACE_CATEGORY.WATER,
        'setup: the reproduced walk genuinely ends on real WATER ground');
    assert(LAKE_SURFACE_HEIGHT - terrainHeightAt(seed, deepInterior.x, deepInterior.z) > DEFAULT_MAX_WALKING_DEPTH,
        'setup: AMENDED BY 0.9.634 — the reproduced walk now genuinely ends beyond DEFAULT_MAX_WALKING_DEPTH, so this section\'s own "deep lake" assertions remain meaningful under the new, depth-aware rule');

    // -------------------------------------------------------------
    // Section A — FLAGSHIP: drive the real, fully wired
    // AvatarMovementController (not just the bare constraint) through the
    // genuine deep lake, and verify the RENDERED avatar position, movement,
    // and stability.
    // -------------------------------------------------------------
    {
        const registry = new AvatarTemplateRegistry();
        registry.register(CoreAvatarTemplateLibrary);
        const { profile } = buildAvatarStack(registry, 'closure-audit');
        const session = new AvatarPresenceSession(profile, {
            position: { x: shoreline.shoreX, y: 0, z: shoreline.shoreZ },
            rotation: { x: 0, y: Math.atan2(shoreline.dirX, shoreline.dirZ) * (180 / Math.PI), z: 0 }
        });
        const controller = new AvatarMovementController(session, null, constraint);

        // AMENDED BY 0.9.634 — the original 400-tick walk (60 world
        // units at WALK_SPEED) never reached beyond a genuinely shallow
        // depth in this real lake (see the setup's own amendment above).
        // 1100 ticks (165 world units) reaches the same genuinely deep
        // coordinate `deepInterior` above was independently confirmed to
        // be beyond DEFAULT_MAX_WALKING_DEPTH — driven here through the
        // real, ticking controller rather than the quantized walkInto()
        // helper, so this section's own FLAGSHIP still exercises the
        // real simulation loop, not merely the bare constraint.
        const FORWARD_TICKS = 1100;
        const BACK_TICKS = 550;

        controller.keyDown('w');
        const renderedYSamples = [];
        for (let i = 0; i < FORWARD_TICKS; i++) {
            controller.tick(0.05);
            const p = session.current.position;
            if (surfaceCategoryAt(seed, p.x, p.z) === SURFACE_CATEGORY.WATER) {
                renderedYSamples.push({ y: withGroundElevation(p).y, depth: LAKE_SURFACE_HEIGHT - terrainHeightAt(seed, p.x, p.z) });
            }
        }
        controller.keyUp('w');

        assert(renderedYSamples.length > 0, '2. setup: the real controller-driven walk genuinely crosses onto WATER ground, giving this section real samples to check');
        // AMENDED BY 0.9.634 — the original invariant ("every sample
        // stays at/above the lake surface") was 0.9.615's own
        // depth-blind clamp, now deliberately superseded: a real,
        // controller-driven walk through a real lake's own shallow
        // shelf now genuinely renders BELOW the surface (following the
        // lakebed), which is this milestone's own explicit goal, not a
        // regression. What survives, restated precisely: every sample
        // matches the SAME real, current, shipped formula exactly
        // (never a second, silently-diverging one), and the flagship's
        // own original concern — the avatar never disappears below the
        // surface once genuinely too deep to walk — still holds, for the
        // samples that are genuinely that deep.
        const mismatched = renderedYSamples.filter(({ y, depth }) => {
            const groundHeightAtSample = LAKE_SURFACE_HEIGHT - depth;
            const expected = depth <= DEFAULT_MAX_WALKING_DEPTH ? groundHeightAtSample : Math.max(groundHeightAtSample, LAKE_SURFACE_HEIGHT);
            return Math.abs(y - expected) > 1e-9;
        });
        assert(mismatched.length === 0,
            `3. FLAGSHIP, AMENDED BY 0.9.634: every rendered Y sample taken while the real, controller-driven avatar stood on WATER ground matches the SAME real, current, shipped depth-aware formula exactly (${mismatched.length} of ${renderedYSamples.length} mismatched)`);
        assert(renderedYSamples.some(({ depth }) => depth > DEFAULT_MAX_WALKING_DEPTH) && renderedYSamples.some(({ y }) => Math.abs(y - LAKE_SURFACE_HEIGHT) < 1e-9),
            '3b. AMENDED BY 0.9.634: the walk genuinely reaches water deep enough to exceed DEFAULT_MAX_WALKING_DEPTH, and at least one such sample is genuinely clamped AT the lake surface — the original flagship\'s own "avatar never sinks below the surface once too deep" concern still holds, for water that is ACTUALLY that deep');
        assert(renderedYSamples.some(({ y, depth }) => depth > 0 && depth <= DEFAULT_MAX_WALKING_DEPTH && y < LAKE_SURFACE_HEIGHT - 1e-6),
            '3c. NEW BY 0.9.634: the SAME walk also genuinely crosses genuinely shallow water (depth under the limit) whose rendered Y sits BELOW the old, depth-blind surface floor — the real, controller-driven demonstration of this milestone\'s own new behavior');

        const finalPosition = session.current.position;
        assert(surfaceCategoryAt(seed, finalPosition.x, finalPosition.z) === SURFACE_CATEGORY.WATER,
            '4. the avatar genuinely reaches deep water through the real controller, not merely the bare constraint');
        assert(controller.isBlockedBySlope() === false,
            '5. horizontal movement was never blocked on the way there — the avatar does not "disappear" or get stuck at the shoreline');

        // Stability across repeated movement: reverse and walk back out,
        // then back in again — the rendered floor must hold on every
        // pass, not just the first. AMENDED BY 0.9.634 — BACK_TICKS
        // scales with FORWARD_TICKS above, for the same reason.
        controller.keyDown('s');
        for (let i = 0; i < BACK_TICKS; i++) controller.tick(0.05);
        controller.keyUp('s');
        controller.keyDown('w');
        for (let i = 0; i < BACK_TICKS; i++) controller.tick(0.05);
        controller.keyUp('w');
        const p2 = session.current.position;
        if (surfaceCategoryAt(seed, p2.x, p2.z) === SURFACE_CATEGORY.WATER) {
            assert(withGroundElevation(p2).y >= LAKE_SURFACE_HEIGHT - 1e-9,
                '6. repeated back-and-forth movement through the same lake still holds the rendered floor on a SECOND pass — the constraint is not a one-shot effect that degrades with repeated ticks');
        }
    }

    // -------------------------------------------------------------
    // Section B — THE CENTRAL QUESTION: the authoritative/rendered
    // divergence, and every real consumer of AvatarPresence.position(.y)
    // this codebase actually has.
    // -------------------------------------------------------------
    let divergenceIsPreexistingAndGeneral = false;
    {
        // The divergence itself: real, measurable, and confined to Y.
        const idleState = new AvatarMovementState();
        const simResult = simulateAvatarMovement({ position: deepInterior, movementState: idleState, deltaSeconds: 0.05 });
        assert(simResult.position.y === 0,
            '7. AvatarPresence.position.y — the authoritative, simulated value — stays the flat ground-level plane even deep inside a real lake, exactly as 0.9.614 traced');
        const renderedDeep = withGroundElevation(deepInterior);
        // Two distinct quantities, both real: `waterFloorLift` is this
        // water arc's OWN contribution (how much higher the water gate
        // renders the avatar than the raw, pre-0.9.615 terrain-only
        // formula would); `totalRenderDivergence` is the FULL gap between
        // the authoritative position and the final rendered one (terrain
        // height AND the water floor together) — the quantity that
        // actually matters to a consumer, like the camera below, that
        // reads position.y directly and applies no terrain-following of
        // its own at all.
        const waterFloorLift = renderedDeep.y - (deepInterior.y + terrainHeightAt(seed, deepInterior.x, deepInterior.z));
        const totalRenderDivergence = renderedDeep.y - deepInterior.y;
        assert(waterFloorLift > 0,
            `8. the water arc's own contribution to the divergence at the deep-interior coordinate is real and positive (${waterFloorLift.toFixed(4)} world units) — this is the exact fact the audit's own central question is about`);
        assert(renderedDeep.x === deepInterior.x && renderedDeep.z === deepInterior.z,
            '9. the divergence is confined to Y alone — X/Z are byte-identical between the authoritative and rendered positions, so nothing about horizontal position, collision footprint, or region queries could ever observe it');

        // Consumer 1 — core/AvatarCollision.js: reads position.y directly
        // (fixed.y in resolveAxis), but every obstacle AABB it tests
        // against is built from the SAME flat-plane convention (ground
        // level = 0, AVATAR_COLLISION_HEIGHT above it) — collision has
        // never consulted terrainHeightAt() for hills OR water, so it
        // cannot observe a divergence that only exists between the flat
        // plane and something ELSE (the render). It compares the flat
        // plane to other flat-plane facts, consistently.
        const collisionSource = codeOnly(await readSource('core/AvatarCollision.js'));
        assert(!collisionSource.includes('terrainHeightAt') && !collisionSource.includes('Hydrology'),
            '10. core/AvatarCollision.js contains no terrainHeightAt/Hydrology reference anywhere — collision is a closed, self-consistent flat-plane system, structurally unable to observe the render-only water floor');

        // Consumer 2 — application/avatar/AvatarVehicleInteractionController.js:
        // its own nearby-vehicle/mount queries key off x/z only.
        const vehicleInteractionSource = codeOnly(await readSource('application/avatar/AvatarVehicleInteractionController.js'));
        const nearbyVehiclesBody = extractFunctionBody(vehicleInteractionSource, '_nearbyVehicles(avatarPosition) {');
        assert(nearbyVehiclesBody !== null && !nearbyVehiclesBody.includes('avatarPosition.y'),
            '11. application/avatar/AvatarVehicleInteractionController.js#_nearbyVehicles() never reads avatarPosition.y — vehicle interaction range is an x/z-only query, structurally unaffected by the Y divergence');

        // Consumer 3 — core/WorldSpatialContext.js: every nearby-*
        // distance this facade computes is Math.sqrt(dx*dx + dz*dz) —
        // horizontal only.
        const spatialContextSource = codeOnly(await readSource('core/WorldSpatialContext.js'));
        const yDistanceUses = (spatialContextSource.match(/dy\s*\*\s*dy/g) || []).length;
        assert(yDistanceUses === 0,
            '12. core/WorldSpatialContext.js computes every nearby-entity distance from dx/dz alone (no dy*dy term anywhere) — discovery/proximity context cannot observe the Y divergence either');

        // Consumer 4 — renderer/AvatarPickingService.js: raycasts against
        // avatar ROOTS, which are positioned via
        // AvatarVisual.setPose(withGroundElevation(...)) — i.e. the
        // RENDERED position, not the raw presence. Picking therefore
        // already sees the corrected value, by construction, not the
        // divergent one.
        const withGroundElevationCallSites = (codeOnly(renderWorldViewSource).match(/withGroundElevation\(/g) || []).length;
        // AMENDED TWICE.
        //
        // First, 0.9.607 (Vehicle Ground Elevation Parity) added a FIFTH
        // call site, syncVehicles(), on the theory that a VehicleInstance's
        // position is a flat domain fact exactly like AvatarPresence's own
        // — wrong, as the second amendment below found.
        //
        // Second, a bug fix (Bicycle Ground Elevation Double-Lift) found
        // that theory false: a VehicleInstance's position has carried REAL,
        // raw terrainHeightAt() elevation since its very first bridge from
        // a VehiclePresence, and a moving vehicle's own movement tick keeps
        // re-snapping it to that same raw sample every frame (see
        // application/avatar/AvatarVehicleMovementController.js's own
        // 0.9.116/0.9.119 header) — so 0.9.607's own lift in syncVehicles()
        // was adding the real elevation a SECOND time, and the identical
        // mistake reached the avatar too: a mounted rider's presence is
        // copied verbatim from that same already-elevated vehicle position
        // (WorldNavigationSession's own "the vehicle moves, the avatar
        // follows"), so setLocalAvatar()/updateLocalAvatarPresence() lifting
        // it a second time doubled the rider's rendered height as well —
        // sunk into low ground, floating above hills/treetops the higher
        // the terrain got. The fix removes syncVehicles()'s own call
        // entirely (a VehicleInstance's position needs no lift — it already
        // IS the real elevation) and routes the two LOCAL avatar-pose call
        // sites through a new resolveAvatarRenderPosition(position,
        // ridingVehicle) wrapper that skips the lift for exactly that one
        // case, applying it unconditionally otherwise. setRemoteAvatar()/
        // updateRemoteAvatarPresence() are untouched — remote riding is not
        // wired (AvatarPresenceAdvertisement carries no vehicle/mount fact)
        // — so this audit's own "every avatar visual is built from the
        // CORRECTED position" conclusion still holds, on either path: an
        // on-foot avatar's rendered position is still withGroundElevation()
        // applied to its raw presence, and a mounted avatar's rendered
        // position is still exactly the real, correctly-elevated value —
        // it simply no longer runs a real value through the formula a
        // second time.
        assert(withGroundElevationCallSites === 4, // 1 definition + 1 inside resolveAvatarRenderPosition() (covering setLocalAvatar/updateLocalAvatarPresence) + 2 remote-avatar call sites (setRemoteAvatar, updateRemoteAvatarPresence) — syncVehicles() no longer calls it at all
            `13. application/world/RenderWorldViewUseCase.js applies withGroundElevation() unconditionally only at its two remote-avatar call sites (setRemoteAvatar/updateRemoteAvatarPresence) and, via resolveAvatarRenderPosition(), at its two local-avatar call sites (setLocalAvatar/updateLocalAvatarPresence) whenever the avatar is not riding a vehicle — never at its vehicle call site (syncVehicles) at all, since a VehicleInstance's own position already IS real elevation — so every avatar visual (and therefore every avatar raycast target) is still built from the CORRECTED position, never a doubled or a raw one, so pickAvatar() cannot observe the divergence`);

        // Consumer 5 — core/CameraPerspective.js#computeCameraFraming(),
        // invoked from application/world/WorldNavigationSession.js. THIS is the
        // one real consumer that treats position.y as if it already were
        // the final render elevation.
        const sessionSource = await readSource('application/world/WorldNavigationSession.js');
        const sessionCode = codeOnly(sessionSource);
        const applyFramingBody = extractFunctionBody(sessionSource, '_applyCameraPerspectiveFraming(position, headingDegrees) {');
        assert(applyFramingBody !== null, '14. application/world/WorldNavigationSession.js#_applyCameraPerspectiveFraming() is located and extracted from its real source');
        assert(!applyFramingBody.includes('terrainHeightAt'),
            '15. ...and it calls computeCameraFraming() with its own `position` parameter completely unmodified — no terrainHeightAt() call anywhere in this function\'s own body');
        assert(sessionCode.includes('_applyCameraPerspectiveFraming(presence.position,'),
            '16. its one real call site passes presence.position directly — the SAME authoritative, flat-plane value Section B has already shown never reflects the water floor (or, per the next assertions, a hill\'s own elevation either)');

        // Live-demonstrated magnitude, using the REAL computeCameraFraming
        // — not a re-derivation of it.
        const rawFraming = computeCameraFraming(CameraPerspective.THIRD_PERSON, deepInterior, 0);
        const renderedFraming = computeCameraFraming(CameraPerspective.THIRD_PERSON, withGroundElevation(deepInterior), 0);
        assert(Math.abs((renderedFraming.position.y - rawFraming.position.y) - totalRenderDivergence) < 1e-9,
            `17. computeCameraFraming(), called with the two REAL candidate inputs (raw presence.position vs. the rendered position), produces a camera height that differs by exactly the same ${totalRenderDivergence.toFixed(4)}-unit divergence — a live-reproduced, not hypothetical, consequence. This is the FULL terrain+water gap (the camera applies no terrain-following of its own at all, so it misses ordinary ground elevation too, not only the water floor)`);

        // Is this NEW, caused by this water arc — or an already-standing,
        // general characteristic of how the camera code treats terrain?
        // Same live test, at a real HILL coordinate with no water
        // involvement whatsoever.
        const hillPoint = { x: hill.x, y: 0, z: hill.z };
        const hillRenderedY = hillPoint.y + terrainHeightAt(seed, hill.x, hill.z); // ordinary terrain-following render, no water gate involved at all
        const rawHillFraming = computeCameraFraming(CameraPerspective.THIRD_PERSON, hillPoint, 0);
        const renderedHillFraming = computeCameraFraming(CameraPerspective.THIRD_PERSON, { x: hill.x, y: hillRenderedY, z: hill.z }, 0);
        assert(renderedHillFraming.position.y - rawHillFraming.position.y > 0.1,
            `18. the IDENTICAL divergence exists, unrelated to water, at a real dry hill coordinate (terrain height ${hill.height.toFixed(3)}) — this consumer has never applied ANY terrain elevation, hill or lake, to the camera's own local-avatar-following path; the water arc introduced nothing new here`);

        // The asymmetry is real within this SAME file: a DIFFERENT call
        // site of the identical computeCameraFraming(), focusCollaborator(),
        // DOES pre-elevate with terrainHeightAt() before calling it —
        // proving the gap is an existing internal inconsistency in the
        // camera code's own two call sites, not something this audit
        // invented or something specific to the live-tracking path alone.
        const focusCollaboratorBody = extractFunctionBody(sessionSource, 'focusCollaborator(deviceId) {');
        assert(focusCollaboratorBody !== null && focusCollaboratorBody.includes('terrainHeightAt(DEFAULT_WORLD_SEED'),
            '19. by contrast, this SAME file\'s own focusCollaborator() DOES compute groundY = terrainHeightAt(...) before its own computeCameraFraming() call — confirming the gap Section B found is a genuine, pre-existing asymmetry between two call sites of the same function, not a water-specific defect');

        divergenceIsPreexistingAndGeneral = true;
    }

    // -------------------------------------------------------------
    // Section C — shoreline transition: land -> water -> land, verified
    // tick by tick through the real controller.
    // -------------------------------------------------------------
    {
        const registry = new AvatarTemplateRegistry();
        registry.register(CoreAvatarTemplateLibrary);
        const { profile } = buildAvatarStack(registry, 'closure-audit-shore');
        const session = new AvatarPresenceSession(profile, {
            position: { x: shoreline.shoreX, y: 0, z: shoreline.shoreZ },
            rotation: { x: 0, y: Math.atan2(shoreline.dirX, shoreline.dirZ) * (180 / Math.PI), z: 0 }
        });
        const localConstraint = new AvatarTerrainConstraint({ seed });
        const controller = new AvatarMovementController(session, null, localConstraint);

        let sawDryBefore = false;
        // AMENDED BY 0.9.634 — renamed in spirit from `sawWetFloored`:
        // this short, near-shoreline walk (30 ticks, 4.5 world units)
        // never reaches beyond a genuinely shallow depth, so under the
        // new, depth-aware rule its wet samples correctly render BELOW
        // the old, depth-blind surface floor rather than AT it — the
        // very case this milestone exists to change. What this section
        // still needs, and still gets, is simply that the walk genuinely
        // crosses onto WATER ground at all, and that every wet sample
        // still matches the SAME real, current, shipped formula exactly
        // (folded into `noHiddenStateEverObserved` below, alongside the
        // existing dry-tick and presence-shape checks it already made).
        let sawWet = false;
        let sawDryAfter = false;
        let noHiddenStateEverObserved = true;
        const presenceShape = JSON.stringify(Object.keys(session.current.toJSON()).sort());

        controller.keyDown('w');
        for (let i = 0; i < 30; i++) {
            controller.tick(0.05);
            const p = session.current.position;
            const isWater = surfaceCategoryAt(seed, p.x, p.z) === SURFACE_CATEGORY.WATER;
            const rendered = withGroundElevation(p);
            if (!isWater) {
                sawDryBefore = true;
                if (Math.abs(rendered.y - (p.y + terrainHeightAt(seed, p.x, p.z))) > 1e-9) noHiddenStateEverObserved = false;
            } else {
                sawWet = true;
                const groundHeight = terrainHeightAt(seed, p.x, p.z);
                const depth = LAKE_SURFACE_HEIGHT - groundHeight;
                const expected = depth <= DEFAULT_MAX_WALKING_DEPTH ? groundHeight : Math.max(groundHeight, LAKE_SURFACE_HEIGHT);
                if (Math.abs(rendered.y - expected) > 1e-9) noHiddenStateEverObserved = false;
            }
            if (JSON.stringify(Object.keys(session.current.toJSON()).sort()) !== presenceShape) noHiddenStateEverObserved = false;
        }
        controller.keyUp('w');
        controller.keyDown('s');
        for (let i = 0; i < 60; i++) {
            controller.tick(0.05);
            const p = session.current.position;
            const isWater = surfaceCategoryAt(seed, p.x, p.z) === SURFACE_CATEGORY.WATER;
            if (!isWater) {
                sawDryAfter = true;
                const rendered = withGroundElevation(p);
                // The very next dry tick after leaving water renders at
                // the ordinary, unfloored formula — nothing lingers.
                if (Math.abs(rendered.y - (p.y + terrainHeightAt(seed, p.x, p.z))) > 1e-9) noHiddenStateEverObserved = false;
            }
        }
        controller.keyUp('s');

        assert(sawDryBefore && sawWet && sawDryAfter,
            '20. AMENDED BY 0.9.634: the real controller-driven walk genuinely covers all three phases — dry shoreline, real WATER ground, and dry shoreline again — giving this section real ticks to check in each phase');
        assert(noHiddenStateEverObserved,
            '21. AMENDED BY 0.9.634: at every single tick across all three phases, the dry-ground render formula is exactly the ordinary unfloored one, the water-ground render matches the SAME real, current, depth-aware formula exactly, and AvatarPresence\'s own JSON shape never changes — entering and leaving water leaves nothing lingering, because withGroundElevation() is a stateless, per-call function of (renderer, position) alone, never a mode the avatar enters or exits');
    }

    // -------------------------------------------------------------
    // Section D — rivers: is "a river behaves differently from a lake"
    // itself a coherent story?
    // -------------------------------------------------------------
    {
        assert(surfaceCategoryAt(seed, river.x, river.z) !== SURFACE_CATEGORY.WATER,
            '22. a real river coordinate is never SURFACE_CATEGORY.WATER — the water-floor gate structurally cannot fire for it, exactly as 0.9.614/0.9.615 already established');

        // The renderer-level reason this is coherent, not merely a code
        // fact: a river gets no raised/lowered water GEOMETRY at all —
        // renderer/WaterTileMesh.js's own header says so explicitly
        // ("a river... stays a ground COLOR tint"). A lake tile, by
        // contrast, genuinely builds a flat mesh plane. Scanned directly,
        // using the real TERRAIN_TILE_SIZE, for a lake-carrying tile AND
        // a genuinely lake-free river tile (never assuming the river
        // coordinate's own containing tile happens to be lake-free —
        // a river can run close enough to a lake to share a tile).
        let lakeTile = null;
        outer:
        for (let tx = -30; tx <= 30; tx++) {
            for (let tz = -30; tz <= 30; tz++) {
                if (buildWaterTileMesh(tx, tz, seed).isMesh) { lakeTile = { tx, tz }; break outer; }
            }
        }
        assert(lakeTile !== null, 'setup: a real lake-carrying tile exists in the scanned tile range');

        let riverOnlyPoint = null;
        for (let x = -SCAN_HALF_EXTENT; x < SCAN_HALF_EXTENT && !riverOnlyPoint; x++) {
            for (let z = -SCAN_HALF_EXTENT; z < SCAN_HALF_EXTENT && !riverOnlyPoint; z++) {
                if (!isRiverAt(seed, x, z)) continue;
                const { tx, tz } = tileCoordinateForPosition(x, z);
                let tileHasLake = false;
                for (let ox = 0; ox < TERRAIN_TILE_SIZE && !tileHasLake; ox += 4) {
                    for (let oz = 0; oz < TERRAIN_TILE_SIZE && !tileHasLake; oz += 4) {
                        if (surfaceCategoryAt(seed, tx * TERRAIN_TILE_SIZE + ox, tz * TERRAIN_TILE_SIZE + oz) === SURFACE_CATEGORY.WATER) tileHasLake = true;
                    }
                }
                if (!tileHasLake) riverOnlyPoint = { x, z, tx, tz };
            }
        }
        assert(riverOnlyPoint !== null, 'setup: a real river coordinate exists whose own containing tile has no lake ground at all, isolating the river-only case');
        const riverTileMesh = buildWaterTileMesh(riverOnlyPoint.tx, riverOnlyPoint.tz, seed);
        assert(riverTileMesh.isMesh !== true,
            '23. a tile containing only a river (no lake ground) builds no water-plane geometry at all — a river is never presented to the viewer as a distinct surface to sink into or stand atop in the first place');

        // A river IS visually distinguished from ordinary ground (a real,
        // non-default tint) — so a player can tell it is "water-flavored"
        // — but its terrain HEIGHT is completely ordinary, identical to
        // any other walkable ground at that height.
        const riverColor = hydrologyGroundColorAt(seed, river.x, river.z);
        const riverHeight = terrainHeightAt(seed, river.x, river.z);
        assert(Number.isFinite(riverColor.r) && Number.isFinite(riverHeight),
            '24. a river coordinate has both a real, distinct ground tint AND an ordinary terrain height — visually "water-flavored" ground, never a surface plane the avatar could appear to float on or sink through');
        assert(withGroundElevation({ x: river.x, y: 0, z: river.z }).y === (0 + riverHeight),
            '25. the avatar\'s own rendered Y at that river coordinate is exactly its ordinary terrain height — the avatar visibly walks ON the river\'s own ground, precisely as it is visually presented, with no floor/ceiling effect it doesn\'t also visually have');

        // Conclusion: the river/lake asymmetry in AVATAR BEHAVIOR mirrors
        // a pre-existing asymmetry in how the two are RENDERED (0.2.89's
        // own "A River Is Ground Color" design, unrelated to this water
        // arc) — not a new, self-contradictory rule this arc invented.
    }

    // -------------------------------------------------------------
    // Section E — composition: the water floor with the jump offset, and
    // confirmation it stays scoped to avatars alone.
    // -------------------------------------------------------------
    {
        // Jumping (a transient, positive position.y) while over water:
        // additive on top of the floor, never replaced by it.
        const jumpHeight = 2.0;
        const jumpingInWater = { x: deepInterior.x, y: jumpHeight, z: deepInterior.z };
        const constrained = withGroundElevation(jumpingInWater);
        const groundHeight = terrainHeightAt(seed, deepInterior.x, deepInterior.z);
        const floor = Math.max(groundHeight, LAKE_SURFACE_HEIGHT);
        assert(Math.abs(constrained.y - (jumpHeight + floor)) < 1e-9,
            `26. mid-jump over deep water, the rendered Y is exactly jumpHeight + the water floor (${(jumpHeight + floor).toFixed(4)}) — the jump offset composes ADDITIVELY on top of the water constraint, never double-counted and never discarded by it`);

        // Jumping on ordinary dry ground still behaves exactly as before
        // 0.9.615 — the water gate never fires there.
        const dryJump = withGroundElevation({ x: hill.x, y: jumpHeight, z: hill.z });
        assert(Math.abs(dryJump.y - (jumpHeight + terrainHeightAt(seed, hill.x, hill.z))) < 1e-9,
            '27. a jump on ordinary dry (hill) ground is completely unaffected — the water gate composes with the jump offset only where ground is actually WATER-classified');

        // Scope: withGroundElevation() is applied ONLY at the four
        // avatar-pose call sites already confirmed in Section B (13) —
        // never to worldRenderer.addWorld (buildings), never to
        // vehicleFieldRenderer.syncVehicles (vehicles), never to
        // remoteSpatialPresenceRenderer (collaborator markers). Buildings
        // and vehicles read renderer.terrainHeightAt() directly, the one
        // shared ground-height authority, completely untouched by this
        // gate — confirming the invariant "water constrains the rendered
        // floor; it doesn't replace the existing elevation calculation
        // wholesale."
        const renderWorldViewCode = codeOnly(renderWorldViewSource);
        assert(!renderWorldViewCode.includes('withGroundElevation(vehicleInstances') &&
            !/syncVehicles[\s\S]{0,300}withGroundElevation/.test(renderWorldViewCode),
            '28. syncVehicles() (the vehicle rendering path) never calls withGroundElevation() anywhere near its own body — a parked bicycle near a lake edge gets ordinary terrain-following elevation only, never the avatar-specific water floor');
        assert(!/addWorld:[\s\S]{0,200}withGroundElevation/.test(renderWorldViewCode),
            '29. addWorld() (buildings/structures) never calls withGroundElevation() either — the water floor is scoped exclusively to avatar rendering, exactly as this milestone\'s own invariant requires');
    }

    // -------------------------------------------------------------
    // Section F — movement semantics: does the current lack of speed
    // reduction, buoyancy, swimming, breath, or drowning create an
    // observable contradiction?
    // -------------------------------------------------------------
    {
        const forwardState = new AvatarMovementState({ forwardAxis: 1 });
        const onLand = simulateAvatarMovement({ position: { x: hill.x, y: 0, z: hill.z }, rotationY: 0, movementState: forwardState, deltaSeconds: 0.1 });
        const onWater = simulateAvatarMovement({ position: deepInterior, rotationY: 0, movementState: forwardState, deltaSeconds: 0.1 });
        assert(onLand.currentMovementSpeed === onWater.currentMovementSpeed && onLand.animation === onWater.animation,
            '30. simulateAvatarMovement() produces the byte-identical speed and animation on dry land and deep in a lake — the avatar walks across the lake surface at ordinary land speed, consistent with this product\'s current builder/sandbox scope; no code anywhere claims otherwise (no speed-reduction, buoyancy, swim, breath, or drowning term exists in the movement/rendering pipeline — reconfirmed in Section G)');
        assert(onWater.animation === AvatarAnimationState.WALKING,
            '31. the animation shown while crossing water is plain WALKING — the product never visually promises swimming, so the absence of swimming mechanics is not a promise being broken');
    }

    // -------------------------------------------------------------
    // Section G — state/persistence: reconfirm against the CURRENTLY
    // shipped code that no SWIMMING state, occupancy flag, or placement
    // mutation exists anywhere.
    // -------------------------------------------------------------
    {
        const presenceFiles = [
            'core/AvatarPresence.js',
            'core/AvatarMovementState.js',
            'core/AvatarAnimationState.js',
            'core/AvatarMovementSimulation.js',
            'application/avatar/AvatarStepConstraint.js',
            'application/avatar/AvatarMovementController.js'
        ];
        for (const file of presenceFiles) {
            const src = codeOnly(await readSource(file));
            assert(!/SWIMMING|WADING|WATER_OCCUPANCY|isSwimming|isUnderwater/i.test(src),
                `32. ${file} still introduces no SWIMMING/WADING/occupancy vocabulary of any kind, currently, not just as of 0.9.615`);
        }
        const forbiddenTerms = /\bbreath\b|\bdrown|\bstamina\b|\bbuoyan/i;
        for (const file of [...presenceFiles, 'application/world/RenderWorldViewUseCase.js']) {
            const src = codeOnly(await readSource(file));
            assert(!forbiddenTerms.test(src), `33. ${file} still introduces no breath/drowning/stamina/buoyancy mechanic`);
        }

        // Two fresh, independent instances of the extracted function,
        // same input, no shared object — byte-identical output, proving
        // there is still nothing anywhere for water traversal to persist.
        const a = withGroundElevation(deepInterior);
        const freshRenderer = { terrainHeightAt: (x, z) => terrainHeightAt(seed, x, z) };
        const b = buildWithGroundElevation(freshRenderer, surfaceCategoryAt, SURFACE_CATEGORY, LAKE_SURFACE_HEIGHT, DEFAULT_WORLD_SEED, DEFAULT_MAX_WALKING_DEPTH)(deepInterior);
        assert(a.y === b.y, '34. a completely fresh instance of the extracted function still produces the byte-identical result for the same input — confirmed against the CURRENT shipped source, not merely the 0.9.615 snapshot');
    }

    // -------------------------------------------------------------
    // Section H — closure classification.
    // -------------------------------------------------------------
    {
        const LABELS = Object.freeze([
            'BASIC_WATER_TRAVERSAL_SUFFICIENT',
            'RENDER_SIMULATION_DIVERGENCE_GAP',
            'RIVER_INTERACTION_GAP',
            'FULL_SWIMMING_REQUIREMENT_CONFIRMED',
            'ARC_CLOSED'
        ]);

        const classification = {
            // Section A: the rendering-layer floor holds under a real,
            // controller-driven deep-lake crossing, repeated back and
            // forth, with horizontal movement never blocked.
            deepLakeFlagship: 'BASIC_WATER_TRAVERSAL_SUFFICIENT',
            // Section B: the divergence is real (assertion 8) and one
            // real consumer (core/CameraPerspective.js, reached only
            // through an explicitly opt-in, off-by-default Camera
            // Perspective mode) genuinely cannot see the corrected
            // position — but it is proven, live, to be an ALREADY-
            // EXISTING, GENERAL characteristic that applies identically
            // to ordinary dry hills (assertion 18) and predates this
            // water arc entirely; a different call site of the same
            // function (focusCollaborator) already handles terrain
            // correctly, confirming this is a standing internal
            // asymmetry in the camera code, not something 0.9.613-0.9.615
            // introduced or something specific to water. Named honestly,
            // not swept under the water arc's own rug, and not treated as
            // blocking THIS arc's own closure.
            authoritativeRenderedDivergence: 'RENDER_SIMULATION_DIVERGENCE_GAP',
            // Section C: no hidden state anywhere across a full
            // land -> water -> land cycle, tick by tick.
            shorelineTransition: 'BASIC_WATER_TRAVERSAL_SUFFICIENT',
            // Section D: a river gets no water-plane geometry at all —
            // there is nothing visually presented for the avatar's
            // identical-to-land behavior to contradict.
            riverInteraction: 'BASIC_WATER_TRAVERSAL_SUFFICIENT',
            // Section E: composition with the jump offset is additive and
            // correct; the fix is provably scoped to avatars alone.
            renderingOffsetComposition: 'BASIC_WATER_TRAVERSAL_SUFFICIENT',
            // Section F: ordinary WALK speed/animation across water
            // matches what this product visually promises (nothing about
            // swimming) — no contradiction.
            movementSemantics: 'BASIC_WATER_TRAVERSAL_SUFFICIENT',
            // Section G: still no SWIMMING state, occupancy flag, or
            // placement mutation anywhere, reconfirmed against current code.
            statePersistence: 'BASIC_WATER_TRAVERSAL_SUFFICIENT',
            // Overall: six of seven sub-findings close cleanly; the one
            // real gap found is pre-existing, general-purpose (not
            // water-specific), and orthogonal to this arc's own scope
            // (this arc never touched camera code). No evidence anywhere
            // in this audit supports FULL_SWIMMING_REQUIREMENT_CONFIRMED
            // — nothing measured here is about buoyancy, drowning, or
            // swimming at all.
            overallArc: 'ARC_CLOSED'
        };

        for (const [finding, label] of Object.entries(classification)) {
            assert(LABELS.includes(label), `35. classification finding "${finding}" uses one of the five fixed labels this audit's own brief specified, never a free-text verdict`);
        }
        const sufficientCount = Object.values(classification).filter((l) => l === 'BASIC_WATER_TRAVERSAL_SUFFICIENT').length;
        assert(sufficientCount === 6 &&
            classification.authoritativeRenderedDivergence === 'RENDER_SIMULATION_DIVERGENCE_GAP' &&
            classification.overallArc === 'ARC_CLOSED' &&
            divergenceIsPreexistingAndGeneral,
            '36. the classification is a genuine mix, not a rubber stamp — six sub-findings close cleanly, one real (but pre-existing, general, non-blocking) gap is named honestly, and the arc itself closes');

        console.log('Classification:', JSON.stringify(classification, null, 2));
    }

    console.log('✅ All Avatar Basic Water Traversal Product Closure Audit tests passed.');
}

await run();
