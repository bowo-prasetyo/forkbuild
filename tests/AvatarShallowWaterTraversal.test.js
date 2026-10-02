import { terrainHeightAt, DEFAULT_WORLD_SEED } from '../core/TerrainHeightField.js';
import { surfaceCategoryAt, SURFACE_CATEGORY } from '../core/TerrainSurface.js';
import { LAKE_SURFACE_HEIGHT } from '../core/Hydrology.js';
import { AVATAR_COLLISION_HEIGHT } from '../core/AvatarCollision.js';
import { DEFAULT_MAX_WALKING_DEPTH, AVATAR_NECK_HEIGHT, waterDepthSpeedFactor } from '../core/AvatarWaterWalkability.js';
import { AVATAR_SWIM_DEPTH, AvatarSwimMode } from '../core/AvatarSwimming.js';
import { AvatarWaterConstraint } from '../application/avatar/AvatarWaterConstraint.js';
import { AvatarTerrainConstraint } from '../application/avatar/AvatarTerrainConstraint.js';
import { AvatarMovementController } from '../application/avatar/AvatarMovementController.js';
import { simulateAvatarMovement } from '../core/AvatarMovementSimulation.js';
import { AvatarMovementState } from '../core/AvatarMovementState.js';
import { AvatarTemplateRegistry } from '../core/AvatarTemplateRegistry.js';
import { CoreAvatarTemplateLibrary } from '../core/library/CoreAvatarTemplateLibrary.js';
import { AvatarProfileUseCase } from '../application/avatar/AvatarProfileUseCase.js';
import { AvatarPresenceSession } from '../application/avatar/AvatarPresenceSession.js';
import { LocalIdentityProvider } from '../identity/LocalIdentityProvider.js';
import { StorageProvider } from '../storage/StorageProvider.js';
import { assert } from './support/Assert.js';

// Wading: water shallower than swim depth slows the avatar in proportion to its
// depth, against real terrain under DEFAULT_WORLD_SEED and through the real
// movement controller. Deeper water is swimming (tests/AvatarSwimming.test.js);
// here it is enough that the avatar is no longer stopped at the drop-off.

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

function buildProfile(username) {
    class InMemoryStorageProvider extends StorageProvider {
        constructor() { super(); this._data = new Map(); }
        save(name, data) { this._data.set(name, JSON.parse(JSON.stringify(data))); }
        load(name) { return this._data.has(name) ? JSON.parse(JSON.stringify(this._data.get(name))) : null; }
        remove(name) { this._data.delete(name); }
        list() { return Array.from(this._data.keys()); }
    }
    const registry = new AvatarTemplateRegistry();
    registry.register(CoreAvatarTemplateLibrary);
    const storage = new InMemoryStorageProvider();
    const identityProvider = new LocalIdentityProvider(storage);
    identityProvider.login(username);
    return new AvatarProfileUseCase(storage, identityProvider, registry).getProfile();
}

async function run() {
    const seed = DEFAULT_WORLD_SEED;
    const shoreline = findShoreline(seed, 400);
    assert(shoreline !== null, 'setup: a real lake shoreline exists near the origin');
    const dryPoint = { x: shoreline.shoreX, y: 0, z: shoreline.shoreZ };
    const shallowDepth = LAKE_SURFACE_HEIGHT - terrainHeightAt(seed, shoreline.lakeX, shoreline.lakeZ);
    assert(shallowDepth > 0 && shallowDepth < AVATAR_SWIM_DEPTH,
        `setup: the shoreline's first wet cell is wading depth (${shallowDepth.toFixed(4)})`);

    // Dry land is untouched.
    {
        const waterConstraint = new AvatarWaterConstraint({ seed });
        assert(waterConstraint.depthAt(dryPoint.x, dryPoint.z) === 0, '1. depthAt() is 0 on dry ground');
        assert(waterConstraint.speedFactorAt(dryPoint.x, dryPoint.z) === 1, '2. speedFactorAt() is 1 on dry ground');
        assert(waterConstraint.waterSurfaceAt(dryPoint.x, dryPoint.z) === null, '3. waterSurfaceAt() is null on dry ground');

        const forwardState = new AvatarMovementState({ forwardAxis: 1 });
        const withoutFactor = simulateAvatarMovement({ position: { x: 0, y: 0, z: 0 }, movementState: forwardState, deltaSeconds: 0.1, movementSpeed: 3 });
        const withNoOpFactor = simulateAvatarMovement({ position: { x: 0, y: 0, z: 0 }, movementState: forwardState, deltaSeconds: 0.1, movementSpeed: 3, waterSpeedFactor: 1 });
        assert(withoutFactor.position.z === withNoOpFactor.position.z,
            '4. an omitted waterSpeedFactor is the same as 1');
    }

    // Wading slows the avatar in proportion to depth.
    {
        assert(waterDepthSpeedFactor(0, DEFAULT_MAX_WALKING_DEPTH) === 1, '5. depth 0 is full speed');
        const fractions = [0, 0.25, 0.5, 0.75, 0.99];
        const factors = fractions.map((f) => waterDepthSpeedFactor(f * DEFAULT_MAX_WALKING_DEPTH, DEFAULT_MAX_WALKING_DEPTH));
        for (let i = 1; i < factors.length; i++) {
            assert(factors[i] <= factors[i - 1] + 1e-12, `6. deeper water is never faster (fraction ${fractions[i]})`);
        }
        const forwardState = new AvatarMovementState({ forwardAxis: 1 });
        const depthFactor = waterDepthSpeedFactor(shallowDepth, DEFAULT_MAX_WALKING_DEPTH);
        const onLand = simulateAvatarMovement({ position: { x: 0, y: 0, z: 0 }, movementState: forwardState, deltaSeconds: 0.1, movementSpeed: 3 });
        const wading = simulateAvatarMovement({ position: { x: 0, y: 0, z: 0 }, movementState: forwardState, deltaSeconds: 0.1, movementSpeed: 3, waterSpeedFactor: depthFactor });
        assert(Math.abs(wading.position.z / onLand.position.z - depthFactor) < 1e-9,
            '7. a wading step is exactly the depth factor times a dry step');
    }

    // A real walk into a real lake wades, slowed, with its feet on the lakebed.
    {
        const session = new AvatarPresenceSession(buildProfile('wading-real-lake'), {
            position: { x: shoreline.shoreX, y: 0, z: shoreline.shoreZ },
            rotation: { x: 0, y: Math.atan2(shoreline.dirX, shoreline.dirZ) * (180 / Math.PI), z: 0 }
        });
        const waterConstraint = new AvatarWaterConstraint({ seed });
        const controller = new AvatarMovementController(session, null, new AvatarTerrainConstraint({ seed }), null, null, waterConstraint);
        controller.keyDown('w');
        let everWadingOnBed = false;
        let everSlowed = false;
        for (let i = 0; i < 300; i++) {
            if (waterConstraint.speedFactorAt(session.current.position.x, session.current.position.z) < 1) everSlowed = true;
            controller.tick(0.05);
            const p = session.current.position;
            const depth = waterConstraint.depthAt(p.x, p.z);
            if (depth > 0 && depth <= AVATAR_SWIM_DEPTH && p.y === 0) everWadingOnBed = true;
        }
        assert(everWadingOnBed, '8. walking into the lake wades with the feet on the lakebed (y = 0, terrain-relative)');
        assert(everSlowed, '9. ...and is slowed while it does');
    }

    // A shallow shelf that drops off: the avatar wades the shelf, then swims on
    // past the edge instead of being stopped there.
    {
        const session = new AvatarPresenceSession(buildProfile('wading-shelf'), { position: { x: -5, y: 0, z: 0 }, rotation: { x: 0, y: 90, z: 0 } });
        const shelfHeightAt = (x) => (x < 10 ? LAKE_SURFACE_HEIGHT - (x / 10) * AVATAR_SWIM_DEPTH * 0.9 : LAKE_SURFACE_HEIGHT - 5);
        const waterConstraint = new AvatarWaterConstraint({ heightAt: (x) => shelfHeightAt(x), isWaterAt: (x) => x >= 0 });
        const controller = new AvatarMovementController(session, null, null, null, null, waterConstraint);
        controller.keyDown('w');
        for (let i = 0; i < 600; i++) controller.tick(0.05);
        assert(session.current.position.x > 12, `10. the avatar carries on past the drop-off (x = ${session.current.position.x.toFixed(2)})`);
        assert(controller.swimState().mode === AvatarSwimMode.SURFACE, '11. ...swimming at the surface');
        controller.keyDown('s');
        controller.keyUp('w');
        for (let i = 0; i < 1200; i++) controller.tick(0.05);
        assert(session.current.position.x < 0 && session.current.position.y === 0,
            '12. swimming back, it wades the shelf and walks out onto dry land');
        assert(controller.swimState().mode === AvatarSwimMode.NONE, '13. ...and is no longer swimming');
    }

    // Wading never reaches the neck: swimming starts at half the avatar's height.
    {
        assert(DEFAULT_MAX_WALKING_DEPTH === AVATAR_NECK_HEIGHT, 'N1. the wading speed curve is scaled to neck depth');
        assert(AVATAR_SWIM_DEPTH === AVATAR_COLLISION_HEIGHT / 2, 'N2. swimming starts at half the avatar\'s height');
        assert(waterDepthSpeedFactor(AVATAR_SWIM_DEPTH) > 0, 'N3. the avatar still moves at swim depth, so it can always reach deep water');
    }

    console.log('✅ All Avatar Shallow-Water Traversal tests passed.');
}

await run();
