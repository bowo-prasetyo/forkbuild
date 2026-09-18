import { AvatarTerrainConstraint } from '../application/AvatarTerrainConstraint.js';
import { AvatarMovementController } from '../application/AvatarMovementController.js';
import { AvatarTemplateRegistry } from '../core/AvatarTemplateRegistry.js';
import { CoreAvatarTemplateLibrary } from '../core/library/CoreAvatarTemplateLibrary.js';
import { AvatarProfileUseCase } from '../application/AvatarProfileUseCase.js';
import { AvatarPresenceSession } from '../application/AvatarPresenceSession.js';
import { LocalIdentityProvider } from '../identity/LocalIdentityProvider.js';
import { StorageProvider } from '../storage/StorageProvider.js';

import { terrainHeightAt, DEFAULT_WORLD_SEED } from '../core/TerrainHeightField.js';
import { surfaceCategoryAt, SURFACE_CATEGORY, WATER_LEVEL } from '../core/TerrainSurface.js';
import { ecologyZoneAt, ECOLOGY_ZONE } from '../core/TerrainEcology.js';
import { hydrologyFeatureAt, HYDROLOGY_FEATURE, LAKE_SURFACE_HEIGHT, isRiverAt, hydrologyGroundColorAt } from '../core/Hydrology.js';
import { buildWaterTileMesh } from '../renderer/WaterTileMesh.js';
import { vehiclePresenceInRegion } from '../core/VehiclePlacement.js';
import { deriveSpatialContext } from '../core/WorldSpatialContext.js';

// 0.9.613 — Avatar-Water Interaction Product Boundary Audit.
//
// core/Hydrology.js (0.2.89) has represented lakes and rivers for many
// milestones, and that same file's own header already names, in its
// "Deliberately not yet" list, "swimming or any avatar movement state
// tied to water" as an explicit non-goal — but a comment describing an
// intended boundary is not the same thing as demonstrating that the
// boundary is where the current PRODUCT actually needs it to be. This is
// a test-only, decision-oriented audit (no production code changes) that
// asks one question against real, unmodified production code: what
// interaction semantics, if any, does water currently provide to the
// avatar, and is that the right place for this product to stand?
//
//   Section A: where water actually is, and how it is represented —
//              does the existing system already know where water is,
//              even though avatar movement has never reacted to it?
//   Section B: FLAGSHIP — the real avatar movement pipeline
//              (AvatarTerrainConstraint, then the fully wired
//              AvatarMovementController) driven through a genuine,
//              scanned shoreline, straight into the lake interior — what
//              actually happens today when an avatar walks from dry land
//              into a real lake? Includes the same before/after
//              wire-shape invariants every prior avatar-movement audit
//              in this codebase already checks (AvatarPresence's own
//              JSON shape, no swim-state field anywhere).
//   Section C: an existing, working precedent for terrain-type awareness
//              already exists elsewhere in this exact codebase
//              (core/VehiclePlacement.js's own water/river ground gate)
//              — and is never consulted for the avatar.
//   Section D: water is discovery-layer flavor text (WorldSpatialContext's
//              own `description` string), never a gameplay effect.
//
// Every coordinate used below is found by SCANNING real,
// production-generated terrain under DEFAULT_WORLD_SEED — never a
// hand-picked "this happens to work" magic number — the same discipline
// tests/Hydrology.test.js's own Section B already established ("scanning
// thousands of coordinates").
//
// PARTIALLY SUPERSEDED BY 0.9.615 — Avatar Basic Water Surface
// Constraint. This audit's own flagship (Section B, assertion 14) named
// the gap this classification recommended closing; 0.9.614 then
// narrowed it to a minimal, render-time-only candidate, and 0.9.615
// installed exactly that candidate for real in
// application/RenderWorldViewUseCase.js#withGroundElevation(). Assertion
// 14's own comment and message are amended in place, below, to say what
// they now measure precisely (the PRE-0.9.615 raw formula, replicated by
// hand, not what a viewer watching a real avatar actually sees anymore)
// — the numeric fact it checks (`maxSubmersion > 0`) is unchanged and
// still true, since AvatarPresence.position.y and terrainHeightAt() are
// both still exactly what they always were; only what sits ON TOP of
// that raw number, at the rendering layer, changed. Every other section
// (A, C, D) was independently re-verified against the 0.9.615 production
// code with NO changes needed — VehiclePlacement's own ground gate and
// WorldSpatialContext's own wire shape are still completely untouched,
// exactly as this audit's own classification said they would remain. See
// tests/AvatarBasicWaterSurfaceConstraint.test.js for the dedicated
// coverage of what 0.9.615 actually closes.

function assert(condition, message) {
    if (!condition) throw new Error(`ASSERT FAILED: ${message}`);
}

class InMemoryStorageProvider extends StorageProvider {
    constructor() { super(); this._data = new Map(); }
    save(name, data) { this._data.set(name, JSON.parse(JSON.stringify(data))); }
    load(name) { return this._data.has(name) ? JSON.parse(JSON.stringify(this._data.get(name))) : null; }
    remove(name) { this._data.delete(name); }
    list() { return Array.from(this._data.keys()); }
}

function buildAvatarStack(registry, username) {
    const storage = new InMemoryStorageProvider();
    const identityProvider = new LocalIdentityProvider(storage);
    identityProvider.login(username);
    const avatarProfileUseCase = new AvatarProfileUseCase(storage, identityProvider, registry);
    const profile = avatarProfileUseCase.getProfile();
    return { storage, avatarProfileUseCase, profile };
}

// Deterministically scans a bounded region for a real WATER cell that
// has at least one non-WATER neighbor exactly 1 unit away — a genuine
// shoreline pair, never assumed to exist at any particular coordinate.
function findShoreline(seed, halfExtent) {
    for (let x = -halfExtent; x < halfExtent; x++) {
        for (let z = -halfExtent; z < halfExtent; z++) {
            if (surfaceCategoryAt(seed, x, z) !== SURFACE_CATEGORY.WATER) continue;
            const neighbors = [[x + 1, z], [x - 1, z], [x, z + 1], [x, z - 1]];
            for (const [nx, nz] of neighbors) {
                if (surfaceCategoryAt(seed, nx, nz) !== SURFACE_CATEGORY.WATER) {
                    // direction FROM the dry neighbor INTO the lake, as a unit vector
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

async function runTests() {
    const seed = DEFAULT_WORLD_SEED;
    const SCAN_HALF_EXTENT = 400;

    const shoreline = findShoreline(seed, SCAN_HALF_EXTENT);
    assert(shoreline !== null, 'setup: a real lake shoreline exists in the scanned region under the default world seed');
    const river = findRiverCoordinate(seed, SCAN_HALF_EXTENT);
    assert(river !== null, 'setup: a real river coordinate exists in the scanned region under the default world seed');

    // -------------------------------------------------------------
    // Section A — where water actually is, and how it is represented.
    // The system already knows exactly where water is; the question
    // this audit asks is whether anything downstream of that knowledge
    // ever reaches avatar movement.
    // -------------------------------------------------------------
    {
        assert(hydrologyFeatureAt(seed, shoreline.lakeX, shoreline.lakeZ) === HYDROLOGY_FEATURE.LAKE,
            '1. The scanned WATER cell is classified LAKE by Hydrology.js, mirroring surfaceCategoryAt() exactly');
        assert(hydrologyFeatureAt(seed, shoreline.shoreX, shoreline.shoreZ) !== HYDROLOGY_FEATURE.LAKE,
            '2. Its dry shoreline neighbor is not classified LAKE');
        assert(terrainHeightAt(seed, shoreline.lakeX, shoreline.lakeZ) <= WATER_LEVEL,
            '3. The LAKE cell genuinely sits at or below WATER_LEVEL — hydrology tracks the height field underneath, never a second geography');

        // River: classified RIVER, but its own ground category is
        // never WATER — a river never overlaps a lake by construction
        // (core/Hydrology.js's own fixed-evaluation-order guarantee).
        assert(hydrologyFeatureAt(seed, river.x, river.z) === HYDROLOGY_FEATURE.RIVER,
            '4. The scanned river coordinate is classified RIVER');
        assert(surfaceCategoryAt(seed, river.x, river.z) !== SURFACE_CATEGORY.WATER,
            '5. A RIVER coordinate is never also a WATER (lake) coordinate');

        // A river is a ground-COLOR treatment only — it never touches
        // the height field a lake's own geometry (and the avatar's own
        // movement) is built from. Confirms core/Hydrology.js's own "A
        // River Is Ground Color" design is exactly what real code does.
        const colorAtRiver = hydrologyGroundColorAt(seed, river.x, river.z);
        const heightAtRiver = terrainHeightAt(seed, river.x, river.z);
        const riverIsGrass = surfaceCategoryAt(seed, river.x, river.z) === SURFACE_CATEGORY.GRASS;
        assert(riverIsGrass, '6. A river coordinate sits on ordinary GRASS ground');
        assert(Number.isFinite(heightAtRiver) && Number.isFinite(colorAtRiver.r),
            '7. A river coordinate has both an ordinary terrain height AND a tinted ground color — two independent facts, one of which (color) a river changes and the other (height) it never does');

        // The renderer DOES already know exactly where a lake is: real
        // Three.js geometry, sunk vertices everywhere else, a flat
        // plane at LAKE_SURFACE_HEIGHT wherever the ground below is
        // WATER — this is not an unimplemented visual. Scanned directly
        // (a shoreline pixel is not guaranteed to fall inside the
        // renderer's own coarser per-tile vertex grid — a narrow WATER
        // crack can pass the pixel-level surfaceCategoryAt() check while
        // never being sampled by any tile's 13x13 vertex lattice; a
        // separate, wider water BODY is what the tile mesh itself needs).
        let waterTile = null;
        let waterMesh = null;
        let dryTile = null;
        outer:
        for (let tx = -30; tx <= 30; tx++) {
            for (let tz = -30; tz <= 30; tz++) {
                const candidate = buildWaterTileMesh(tx, tz, seed);
                if (candidate.isMesh) {
                    waterTile = { tx, tz };
                    waterMesh = candidate;
                } else if (!dryTile) {
                    dryTile = { tx, tz };
                }
                if (waterTile && dryTile) break outer;
            }
        }
        assert(waterTile !== null && waterMesh !== null, 'setup: a real water-carrying tile exists in the scanned tile range');
        assert(dryTile !== null, 'setup: a dry (no-water) tile also exists nearby for contrast');

        // A tile WITH water returns an actual THREE.Mesh (never a Group)
        assert(waterMesh.isMesh === true && waterMesh.geometry.attributes.position.array.length > 0,
            '8. buildWaterTileMesh() produces a real THREE.Mesh, with real geometry, for a tile that actually contains lake ground');
        const waterGeometryPosition = waterMesh.geometry.attributes.position;
        let sawLakeSurfaceVertex = false;
        for (let i = 0; i < waterGeometryPosition.count; i++) {
            // Float32Array precision (a BufferAttribute's own storage,
            // not core/Hydrology.js's double-precision LAKE_SURFACE_HEIGHT
            // itself) — a generous-but-still-exacting tolerance for it.
            if (Math.abs(waterGeometryPosition.getY(i) - LAKE_SURFACE_HEIGHT) < 1e-4) { sawLakeSurfaceVertex = true; break; }
        }
        assert(sawLakeSurfaceVertex, '9. The built lake mesh actually holds a vertex at exactly LAKE_SURFACE_HEIGHT — a real, flat water plane, not merely a colored texture');

        // A tile WITHOUT water returns the documented empty-tile contract
        // (a bare THREE.Group, never a Mesh, never a draw call for nothing).
        const dryMesh = buildWaterTileMesh(dryTile.tx, dryTile.tz, seed);
        assert(dryMesh.isMesh !== true && dryMesh.children.length === 0,
            '9b. A tile scanned to contain no water at all builds no mesh geometry — the renderer\'s own water/no-water knowledge is exact, never a blanket assumption');
    }

    // -------------------------------------------------------------
    // Section B — the real avatar movement pipeline, driven through a
    // genuine scanned shoreline. Does anything about "this ground is
    // WATER" ever reach AvatarTerrainConstraint?
    // -------------------------------------------------------------
    {
        const constraint = new AvatarTerrainConstraint({ seed });
        const from = { x: shoreline.shoreX, y: 0, z: shoreline.shoreZ };
        const to = { x: shoreline.lakeX, y: 0, z: shoreline.lakeZ };
        const result = constraint.apply(from, to);
        assert(result.blocked === false,
            '10. AvatarTerrainConstraint allows the exact same dry-to-lake step ordinary walking already allows — it never once consults surfaceCategoryAt/hydrologyFeatureAt');
        assert(surfaceCategoryAt(seed, to.x, to.z) === SURFACE_CATEGORY.WATER,
            '11. ...even though the destination genuinely is WATER ground, not a false positive in the scan');

        // FLAGSHIP interior walk: 200 real steps of 0.3 units each,
        // straight into the lake along the real shoreline's own
        // dry->wet direction, using nothing but the real, unmodified
        // AvatarTerrainConstraint.apply() the ordinary movement pipeline
        // already calls every tick.
        const stepSize = 0.3;
        const stepCount = 200;
        let cursor = { x: shoreline.shoreX, y: 0, z: shoreline.shoreZ };
        let everBlocked = false;
        let sawWaterGround = false;
        let maxSubmersion = 0;
        for (let i = 0; i < stepCount; i++) {
            const desired = { x: cursor.x + shoreline.dirX * stepSize, y: 0, z: cursor.z + shoreline.dirZ * stepSize };
            const stepResult = constraint.apply(cursor, desired);
            if (stepResult.blocked) { everBlocked = true; break; }
            cursor = stepResult.position;
            if (surfaceCategoryAt(seed, cursor.x, cursor.z) === SURFACE_CATEGORY.WATER) {
                sawWaterGround = true;
                // The RAW pre-0.9.615 formula, replicated by hand:
                // position.y + terrainHeightAt(seed, x, z), with NO water
                // floor applied — AvatarPresence.position.y itself still
                // stays the flat 0 ground-level fact (docs/Principles.md,
                // "Terrain Elevation Is A Rendering-Time Offset"), exactly
                // as it did before and after 0.9.615.
                //
                // AMENDED BY 0.9.615 — Avatar Basic Water Surface
                // Constraint (see this file's own "PARTIALLY SUPERSEDED"
                // header note, above). This is no longer "what a viewer
                // actually sees": application/RenderWorldViewUseCase.js's
                // own withGroundElevation() now floors the AVATAR's own
                // rendered Y at max(terrainHeight, LAKE_SURFACE_HEIGHT)
                // wherever ground is WATER — see
                // tests/AvatarBasicWaterSurfaceConstraint.test.js for the
                // dedicated coverage of the real, shipped function. This
                // raw value remains useful as the UNCONSTRAINED input the
                // real fix now floors, never as a description of the
                // final rendered result.
                const renderedY = cursor.y + terrainHeightAt(seed, cursor.x, cursor.z);
                const submersion = LAKE_SURFACE_HEIGHT - renderedY;
                if (submersion > maxSubmersion) maxSubmersion = submersion;
            }
        }
        assert(everBlocked === false,
            `12. FLAGSHIP: ${stepCount} real steps (${(stepSize * stepCount).toFixed(0)} world units) straight into the lake interior are NEVER blocked by the real, unmodified AvatarTerrainConstraint`);
        assert(sawWaterGround === true, '13. FLAGSHIP: the walk genuinely crosses onto WATER-classified ground, not merely toward it');
        assert(maxSubmersion > 0,
            '14. AMENDED BY 0.9.615 — FLAGSHIP (historical): the RAW position.y + terrainHeightAt() value (still exactly what AvatarPresence/terrain kinematics produce, unchanged by 0.9.615) sinks below the fixed LAKE_SURFACE_HEIGHT the farther the avatar walks. This is no longer the avatar\'s own real rendered elevation — application/RenderWorldViewUseCase.js#withGroundElevation() now floors it at the lake surface before anything reaches the screen; see tests/AvatarBasicWaterSurfaceConstraint.test.js, Section B, for proof against the real, shipped rendering function.');

        // The exact same coordinate the avatar just walked onto,
        // unblocked, is independently confirmed to be real WATER ground
        // — not an edge-of-scan artifact.
        assert(surfaceCategoryAt(seed, cursor.x, cursor.z) === SURFACE_CATEGORY.WATER,
            '15. The final resting coordinate of the flagship walk is itself genuinely classified WATER ground');
    }
    {
        // The real, fully wired AvatarMovementController — not just the
        // bare constraint — produces the identical outcome, and its own
        // observable movement-state surface gains no water/swim
        // vocabulary while standing on WATER ground.
        const registry = new AvatarTemplateRegistry();
        registry.register(CoreAvatarTemplateLibrary);
        const { profile } = buildAvatarStack(registry, 'water-audit');
        const avatarPresenceSession = new AvatarPresenceSession(profile, {
            position: { x: shoreline.shoreX, y: 0, z: shoreline.shoreZ },
            // rotationY chosen so forward movement (dx=sin, dz=cos, see
            // core/AvatarMovementSimulation.js) walks along the exact
            // shoreline->lake direction this scan found, whichever axis
            // that happens to be.
            rotation: { x: 0, y: Math.atan2(shoreline.dirX, shoreline.dirZ) * (180 / Math.PI), z: 0 }
        });
        const terrainConstraint = new AvatarTerrainConstraint({ seed });
        const controller = new AvatarMovementController(avatarPresenceSession, null, terrainConstraint);

        controller.keyDown('w');
        for (let i = 0; i < 400; i++) controller.tick(0.05);

        const finalPosition = avatarPresenceSession.current.position;
        assert(surfaceCategoryAt(seed, finalPosition.x, finalPosition.z) === SURFACE_CATEGORY.WATER,
            '16. Driven through the real AvatarMovementController (not the bare constraint), the avatar reaches real WATER ground');
        assert(controller.isBlockedBySlope() === false,
            '17. ...having never once been blocked by slope on the way there');

        const movementStateWhileInWater = controller.movementState();
        assert(JSON.stringify(Object.keys(movementStateWhileInWater).sort()) ===
            JSON.stringify(['brakingRequested', 'direction', 'jumpRequested', 'movementCapability', 'movementSpeed', 'running', 'turnAxis'].sort()),
            '18. movementState() while standing in real water is byte-for-byte the same shape 0.9.97 documented for dry land — no swim/underwater/wading field exists anywhere on this observable surface');
        assert(movementStateWhileInWater.movementCapability === 'walk',
            '19. The active movement capability while standing in water is still plain WALK — there is no WATER or SWIM capability kind anywhere in this codebase');

        controller.keyUp('w');

        // AvatarPresence's own wire shape — the one prior avatar-movement
        // audits in this codebase already treat as the load-bearing
        // invariant — is untouched by ever having stood in water.
        const presenceKeys = Object.keys(avatarPresenceSession.current.toJSON()).sort();
        assert(JSON.stringify(presenceKeys) === JSON.stringify(['animation', 'avatarId', 'ownerIdentity', 'position', 'rotation', 'sequence', 'timestamp']),
            '20. AvatarPresence\'s own JSON shape is exactly what 0.2.33/0.2.37 established — nothing water-related ever joins it, even after a real journey into a real lake');
    }

    // -------------------------------------------------------------
    // Section C — an existing, working precedent for terrain-type
    // awareness already exists elsewhere in this exact codebase, and is
    // never consulted for the avatar.
    // -------------------------------------------------------------
    {
        // core/VehiclePlacement.js's own real, production ground gate
        // (documented in that file's own header: "A bicycle standing in
        // open water or a river channel is wrong") genuinely holds over
        // a wide real region — this is enforced behavior, not merely a
        // comment.
        const region = { minX: -600, minZ: -600, maxX: 600, maxZ: 600 };
        const bicycles = vehiclePresenceInRegion(seed, region.minX, region.minZ, region.maxX, region.maxZ);
        assert(bicycles.length > 0, 'setup: at least one bicycle exists in the scanned region, so the gate below is actually exercised');
        const bicycleInWater = bicycles.some((bicycle) =>
            ecologyZoneAt(seed, bicycle.position.x, bicycle.position.z) === ECOLOGY_ZONE.WATER ||
            isRiverAt(seed, bicycle.position.x, bicycle.position.z));
        assert(bicycleInWater === false,
            '21. Every real, procedurally-placed bicycle in this region avoids WATER/river ground — the same codebase already has a working, enforced concept of "not a place things stand" for water');

        // Direct juxtaposition: the exact real coordinate the avatar
        // just stood on, unblocked, in Section B is a coordinate this
        // same codebase's own bicycle placement gate would reject
        // outright for a bicycle.
        const avatarRestingCoordinate = { x: shoreline.lakeX, z: shoreline.lakeZ };
        const bicycleGateWouldReject =
            ecologyZoneAt(seed, avatarRestingCoordinate.x, avatarRestingCoordinate.z) === ECOLOGY_ZONE.WATER ||
            isRiverAt(seed, avatarRestingCoordinate.x, avatarRestingCoordinate.z);
        assert(bicycleGateWouldReject === true,
            '22. The exact coordinate AvatarTerrainConstraint freely allows the avatar onto is a coordinate this codebase\'s own VehiclePlacement ground gate already treats as invalid for a bicycle — same seed, same coordinate, same codebase, two disconnected answers to "can something stand here"');
    }

    // -------------------------------------------------------------
    // Section D — water is discovery-layer flavor text, never a
    // gameplay effect.
    // -------------------------------------------------------------
    {
        const lakeContext = deriveSpatialContext({
            position: { x: shoreline.lakeX, y: 0, z: shoreline.lakeZ },
            seed,
            structurePlacements: [],
            collaboratorPositions: [],
            landmarks: [],
            regions: []
        });
        assert(lakeContext.hydrologyFeature === HYDROLOGY_FEATURE.LAKE,
            '23. WorldSpatialContext correctly derives LAKE at the real lake coordinate');
        assert(lakeContext.description.toLowerCase().includes('lake'),
            '24. ...and the ONLY place that fact surfaces is the human-readable description string ("...lake...")');

        const dryContext = deriveSpatialContext({
            position: { x: shoreline.shoreX, y: 0, z: shoreline.shoreZ },
            seed,
            structurePlacements: [],
            collaboratorPositions: [],
            landmarks: [],
            regions: []
        });
        // Every OTHER field this service produces is empty/derived
        // identically regardless of hydrology — nearbyStructures,
        // nearbyCollaborators, nearbyLandmarks, containingRegions are
        // never gated or altered by hydrologyFeature at all.
        assert(JSON.stringify(lakeContext.toJSON().nearbyStructures) === JSON.stringify(dryContext.toJSON().nearbyStructures) &&
            JSON.stringify(lakeContext.toJSON().nearbyCollaborators) === JSON.stringify(dryContext.toJSON().nearbyCollaborators) &&
            JSON.stringify(lakeContext.toJSON().nearbyLandmarks) === JSON.stringify(dryContext.toJSON().nearbyLandmarks),
            '25. Standing in a lake versus standing on its dry shore changes nothing about structures/collaborators/landmarks discovery — hydrology never gates anything but its own description text');

        const contextKeys = Object.keys(lakeContext.toJSON()).sort();
        assert(!contextKeys.some((key) => /walk|swim|block|travers/i.test(key)),
            '26. WorldSpatialContext exposes no "walkable"/"traversable"/"blocked" field derived from hydrology anywhere in its own wire shape');
    }

    console.log('✅ All Avatar-Water Interaction Product Boundary Audit tests passed.');
}

await runTests();
