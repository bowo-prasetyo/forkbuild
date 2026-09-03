import { readFile } from 'node:fs/promises';
import { WorldNavigationSession } from '../application/WorldNavigationSession.js';
import { nearbyVehicleInstances, VEHICLE_RENDER_RADIUS } from '../application/NearbyVehicleInstances.js';
import { vehiclePresenceInRegion } from '../core/VehiclePlacement.js';
import { vehicleInstanceFromPresence, isValidVehicleInstance } from '../core/VehicleInstance.js';
import { DEFAULT_WORLD_SEED } from '../core/TerrainHeightField.js';
import { AvatarProfileUseCase } from '../application/AvatarProfileUseCase.js';
import { AvatarPresenceSession } from '../application/AvatarPresenceSession.js';
import { CreateBrickRegistryUseCase } from '../application/CreateBrickRegistryUseCase.js';
import { LocalIdentityProvider } from '../identity/LocalIdentityProvider.js';
import { StorageProvider } from '../storage/StorageProvider.js';

// 0.9.115 — Vehicle Rendering, World View integration.
//
//   Section A: application/NearbyVehicleInstances.js — the pure
//              VehiclePresence -> VehicleInstance region bridge
//   Section B: application/WorldNavigationSession.js#_setupVehicleRendering() —
//              wires the render facade's syncVehicles() to fire once per
//              render frame, centered on the local avatar
//   Section C: falls back to camera position when there is no local avatar
//   Section D: no local avatar AND no camera -> never throws, never calls
//              syncVehicles with nothing to center on
//   Section E: dispose() actually tears the subscription down
//   Section F: architectural regression — rendering never takes ownership
//              of mount/dismount interaction detection
//
// Mirrors tests/AvatarRendering.test.js's own "real logic, fake low-level
// renderer" posture: WorldNavigationSession's real methods run
// unmodified; only the render facade (`session._session`) is a duck-typed
// stand-in, poked directly exactly like that file's own spyFacade().

class InMemoryStorageProvider extends StorageProvider {
    constructor() { super(); this._data = new Map(); }
    save(name, data) { this._data.set(name, JSON.parse(JSON.stringify(data))); }
    load(name) { return this._data.has(name) ? JSON.parse(JSON.stringify(this._data.get(name))) : null; }
    remove(name) { this._data.delete(name); }
    list() { return Array.from(this._data.keys()); }
}

function assert(condition, message) {
    if (!condition) throw new Error(`ASSERT FAILED: ${message}`);
}

// A tiny fake onAnimationFrame bus + a syncVehicles spy — everything else
// dispose() might touch on `this._session` is a harmless no-op, the same
// shape tests/AvatarRendering.test.js's own spyFacade() already uses.
function fakeRenderFacade() {
    const listeners = [];
    const syncCalls = [];
    return {
        syncCalls,
        onAnimationFrame(callback) {
            listeners.push(callback);
            return () => {
                const i = listeners.indexOf(callback);
                if (i !== -1) listeners.splice(i, 1);
            };
        },
        fireFrame() {
            for (const callback of listeners.slice()) callback(0.016);
        },
        listenerCount() { return listeners.length; },
        syncVehicles(vehicleInstances) { syncCalls.push(vehicleInstances); },
        dispose() {}
    };
}

function buildRegistry() {
    return new CreateBrickRegistryUseCase().execute();
}

function buildAvatarStack(username, position) {
    const storage = new InMemoryStorageProvider();
    const identityProvider = new LocalIdentityProvider(storage);
    identityProvider.login(username);
    const avatarProfileUseCase = new AvatarProfileUseCase(storage, identityProvider, buildRegistry());
    const profile = avatarProfileUseCase.getProfile();
    const avatarPresenceSession = new AvatarPresenceSession(profile, position ? { position } : undefined);
    return { avatarProfileUseCase, avatarPresenceSession };
}

async function runTests() {
    // -------------------------------------------------------------
    // Section A — application/NearbyVehicleInstances.js
    // -------------------------------------------------------------
    {
        const center = { x: 0, z: 0 };
        const instances = nearbyVehicleInstances(DEFAULT_WORLD_SEED, center);
        const presences = vehiclePresenceInRegion(
            DEFAULT_WORLD_SEED,
            center.x - VEHICLE_RENDER_RADIUS, center.z - VEHICLE_RENDER_RADIUS,
            center.x + VEHICLE_RENDER_RADIUS, center.z + VEHICLE_RENDER_RADIUS
        );
        assert(instances.length === presences.length,
            '1. nearbyVehicleInstances() returns exactly one VehicleInstance per VehiclePresence the real region query finds');
        for (let i = 0; i < instances.length; i++) {
            assert(isValidVehicleInstance(instances[i]), `2.${i} every result is a real VehicleInstance, never a raw coordinate`);
            assert(instances[i].id === presences[i].id, `3.${i} ids match the underlying deterministic placement`);
            assert(instances[i].position.x === presences[i].position.x && instances[i].position.z === presences[i].position.z,
                `4.${i} position matches the underlying deterministic placement`);
            assert(instances[i].position.x === instances[i].spawnPosition.x && instances[i].position.z === instances[i].spawnPosition.z,
                `5.${i} a freshly-bridged instance has position === spawnPosition (see vehicleInstanceFromPresence())`);
        }
    }
    {
        // Same bridge vehicleInstanceFromPresence() itself already
        // proves independently (tests/VehicleInstance.test.js) — checked
        // again here at the region-query boundary, so this file's own
        // wiring is never quietly reconstructing instances by hand.
        const presence = vehiclePresenceInRegion(DEFAULT_WORLD_SEED, -1000, -1000, 1000, 1000)[0];
        if (presence) {
            const expected = vehicleInstanceFromPresence(presence);
            const [actual] = nearbyVehicleInstances(DEFAULT_WORLD_SEED, { x: presence.position.x, z: presence.position.z }, 1);
            assert(actual.id === expected.id, '6. nearbyVehicleInstances() never invents an id of its own');
        }
    }

    // -------------------------------------------------------------
    // Section B — WorldNavigationSession wires syncVehicles to the
    // local avatar's own position, once per render frame.
    // -------------------------------------------------------------
    {
        const avatarPosition = { x: 5, y: 0, z: 9 };
        const { avatarProfileUseCase, avatarPresenceSession } = buildAvatarStack('alice', avatarPosition);
        const session = new WorldNavigationSession({
            registry: buildRegistry(), loadPublicationDocumentUseCase: null, worldLayoutProvider: null,
            avatarProfileUseCase, avatarPresenceSession
        });
        const facade = fakeRenderFacade();
        session._session = facade;
        session._setupVehicleRendering();

        assert(facade.listenerCount() === 1, '7. exactly one frame listener is registered');
        facade.fireFrame();
        assert(facade.syncCalls.length === 1, '8. one render frame produces exactly one syncVehicles() call');

        const expected = nearbyVehicleInstances(DEFAULT_WORLD_SEED, avatarPosition);
        const actual = facade.syncCalls[0];
        assert(actual.length === expected.length, '9. syncVehicles() receives every vehicle nearbyVehicleInstances() itself would return');
        for (let i = 0; i < actual.length; i++) {
            assert(isValidVehicleInstance(actual[i]), `10.${i} the World View is handed real VehicleInstance objects, never raw coordinates`);
            assert(actual[i].id === expected[i].id, `11.${i} ids match`);
        }

        // A second frame re-queries fresh (a requery, never a cache) —
        // see application/AvatarVehicleInteractionController.js's own
        // "Vehicle lookup" precedent.
        facade.fireFrame();
        assert(facade.syncCalls.length === 2, '12. every render frame produces its own syncVehicles() call');
    }

    // -------------------------------------------------------------
    // Section C — falls back to camera position with no local avatar
    // -------------------------------------------------------------
    {
        const session = new WorldNavigationSession({ registry: buildRegistry(), loadPublicationDocumentUseCase: null, worldLayoutProvider: null });
        assert(session.getAvatarPosition() === null, '13. sanity: no avatar collaborators means no avatar position');
        const cameraPosition = { x: -12, y: 3, z: 40 };
        session._spatialCameraController = { getSpatialCameraState: () => ({ position: cameraPosition }) };

        const facade = fakeRenderFacade();
        session._session = facade;
        session._setupVehicleRendering();
        facade.fireFrame();

        assert(facade.syncCalls.length === 1, '14. vehicle rendering still runs for a spectator with no avatar at all');
        const expected = nearbyVehicleInstances(DEFAULT_WORLD_SEED, cameraPosition);
        assert(facade.syncCalls[0].length === expected.length, '15. ...centered on the camera position instead');
    }

    // -------------------------------------------------------------
    // Section D — neither avatar nor camera: never throws
    // -------------------------------------------------------------
    {
        const session = new WorldNavigationSession({ registry: buildRegistry(), loadPublicationDocumentUseCase: null, worldLayoutProvider: null });
        const facade = fakeRenderFacade();
        session._session = facade;
        session._setupVehicleRendering();
        facade.fireFrame(); // must not throw
        assert(facade.syncCalls.length === 0, '16. with no known position at all, syncVehicles() is simply never called this frame');
    }

    // -------------------------------------------------------------
    // Section E — dispose() actually tears the subscription down
    // -------------------------------------------------------------
    {
        const avatarPosition = { x: 0, y: 0, z: 0 };
        const { avatarProfileUseCase, avatarPresenceSession } = buildAvatarStack('carol', avatarPosition);
        const session = new WorldNavigationSession({
            registry: buildRegistry(), loadPublicationDocumentUseCase: null, worldLayoutProvider: null,
            avatarProfileUseCase, avatarPresenceSession
        });
        const facade = fakeRenderFacade();
        session._session = facade;
        session._setupVehicleRendering();
        assert(facade.listenerCount() === 1, '17. sanity: subscribed');

        session._session = facade; // dispose() would null this on the session; keep the SAME facade reference to observe post-dispose (no) calls
        session.dispose();
        assert(facade.listenerCount() === 0, '18. dispose() actually unsubscribes the frame listener, not just forgets its own reference to it');
    }

    // -------------------------------------------------------------
    // Section F — architectural regression: rendering never takes
    // ownership of mount/dismount interaction detection, and vice versa.
    // -------------------------------------------------------------
    {
        const controllerSource = await readFile(new URL('../application/AvatarVehicleInteractionController.js', import.meta.url), 'utf8');
        for (const term of ['VehicleRenderer', 'VehicleVisual', 'VehicleFieldRenderer', 'THREE', 'syncVehicles']) {
            assert(!controllerSource.includes(term),
                `19. application/AvatarVehicleInteractionController.js never references "${term}" — mount/dismount stays entirely independent of rendering`);
        }
        const sessionSource = await readFile(new URL('../application/WorldNavigationSession.js', import.meta.url), 'utf8');
        assert(sessionSource.includes('avatarVehicleInteractionState'),
            '20. the existing mount/dismount observation seam is still exposed, untouched by this milestone');
    }

    console.log('✅ All Vehicle Rendering World View Integration tests passed.');
}

await runTests();
