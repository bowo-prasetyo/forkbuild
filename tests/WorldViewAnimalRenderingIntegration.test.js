import { readFile } from 'node:fs/promises';
import { WorldNavigationSession } from '../application/world/WorldNavigationSession.js';
import { AnimalRuntimeInstances, ANIMAL_RENDER_RADIUS } from '../application/world/AnimalRuntimeInstances.js';
import { animalPresenceInRegion } from '../core/AnimalPlacement.js';
import { AnimalPresence } from '../core/AnimalPresence.js';
import { Position } from '../core/Position.js';
import { ANIMAL_SPECIES } from '../core/WildlifeField.js';
import { DEFAULT_WORLD_SEED } from '../core/TerrainHeightField.js';
import { AvatarProfileUseCase } from '../application/avatar/AvatarProfileUseCase.js';
import { AvatarPresenceSession } from '../application/avatar/AvatarPresenceSession.js';
import { CreateBrickRegistryUseCase } from '../application/editor/CreateBrickRegistryUseCase.js';
import { LocalIdentityProvider } from '../identity/LocalIdentityProvider.js';
import { StorageProvider } from '../storage/StorageProvider.js';

// 0.9.701 — Released Animal Rendering, World View integration.
//
//   Section A: WorldNavigationSession#_setupAnimalRendering() wires the
//              render facade's syncAnimals() to fire once per render
//              frame, centered on the local avatar
//   Section B: FLAGSHIP — a deterministic (tile-baked, merely
//              DISCOVERED) animal is NEVER handed to syncAnimals(),
//              only a genuinely RELEASED one — the exact double-render
//              bug this milestone's own design exists to prevent
//   Section C: falls back to camera position when there is no local avatar
//   Section D: neither avatar nor camera -> never throws, never calls
//              syncAnimals
//   Section E: dispose() actually tears the subscription down
//   Section F: architectural regression — catch/release interaction
//              stays entirely independent of rendering
//
// Mirrors tests/WorldViewVehicleRenderingIntegration.test.js's own "real
// logic, fake low-level renderer" posture exactly.

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
        syncAnimals(animalPresences) { syncCalls.push(animalPresences); },
        markAnimalCaught() {},
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
    // Section A — wires syncAnimals to the local avatar's own
    // position, once per render frame.
    // -------------------------------------------------------------
    {
        const realAnimal = animalPresenceInRegion(DEFAULT_WORLD_SEED, -300, -300, 300, 300)[0];
        if (!realAnimal) {
            throw new Error('No real animal found under the default seed — fixture assumption broken');
        }
        const avatarPosition = { x: realAnimal.position.x, y: 0, z: realAnimal.position.z };
        const { avatarProfileUseCase, avatarPresenceSession } = buildAvatarStack('alice', avatarPosition);
        const session = new WorldNavigationSession({
            registry: buildRegistry(), loadPublicationDocumentUseCase: null, worldLayoutProvider: null,
            avatarProfileUseCase, avatarPresenceSession
        });
        const facade = fakeRenderFacade();
        session._session = facade;
        session._setupAnimalRendering();

        assert(facade.listenerCount() === 1, '1. exactly one frame listener is registered');
        facade.fireFrame();
        assert(facade.syncCalls.length === 1, '2. one render frame produces exactly one syncAnimals() call');
        assert(Array.isArray(facade.syncCalls[0]), '3. syncAnimals() is called with an array');

        facade.fireFrame();
        assert(facade.syncCalls.length === 2, '4. every render frame produces its own syncAnimals() call');
    }

    // -------------------------------------------------------------
    // Section B — FLAGSHIP: deterministic (merely discovered) animals
    // never reach syncAnimals(); only genuinely released ones do.
    // -------------------------------------------------------------
    {
        const realAnimal = animalPresenceInRegion(DEFAULT_WORLD_SEED, -300, -300, 300, 300)[0];
        const avatarPosition = { x: realAnimal.position.x, y: 0, z: realAnimal.position.z };
        const { avatarProfileUseCase, avatarPresenceSession } = buildAvatarStack('bob', avatarPosition);
        const session = new WorldNavigationSession({
            registry: buildRegistry(), loadPublicationDocumentUseCase: null, worldLayoutProvider: null,
            avatarProfileUseCase, avatarPresenceSession
        });
        const facade = fakeRenderFacade();
        session._session = facade;
        session._setupAnimalRendering();

        // Register a RELEASED animal directly into the SAME store the
        // session's own frame loop reads from.
        const released = new AnimalPresence({
            id: 'animal:released:test-1',
            species: ANIMAL_SPECIES.DEER,
            position: new Position(avatarPosition.x, 0, avatarPosition.z)
        });
        session._animalRuntimeInstances.add(released);

        facade.fireFrame();
        assert(facade.syncCalls.length === 1, '5. one frame, one syncAnimals() call');
        const synced = facade.syncCalls[0];

        assert(synced.some((a) => a.id === 'animal:released:test-1'),
            '6. the released animal IS handed to syncAnimals()');
        assert(!synced.some((a) => a.id === realAnimal.id),
            '7. FLAGSHIP: the real, deterministically-placed, tile-baked animal standing right next to the avatar is NEVER handed to syncAnimals() — it renders through its own tile, never doubled here');

        // Sanity: the deterministic animal WAS discovered by this same
        // sync() call (catch-target resolution still works) — it is
        // merely excluded from the RENDER hand-off specifically.
        assert(session._animalRuntimeInstances.get(realAnimal.id) !== null,
            '8. sanity: the deterministic animal is still tracked by the store for catching — sync() itself ran normally');
    }

    // -------------------------------------------------------------
    // Section C — falls back to camera position with no local avatar
    // -------------------------------------------------------------
    {
        const session = new WorldNavigationSession({ registry: buildRegistry(), loadPublicationDocumentUseCase: null, worldLayoutProvider: null });
        assert(session.getAvatarPosition() === null, '9. sanity: no avatar collaborators means no avatar position');
        const cameraPosition = { x: -12, y: 3, z: 40 };
        session._spatialCameraController = { getSpatialCameraState: () => ({ position: cameraPosition }) };

        const facade = fakeRenderFacade();
        session._session = facade;
        session._setupAnimalRendering();
        facade.fireFrame();

        assert(facade.syncCalls.length === 1, '10. animal rendering still runs for a spectator with no avatar at all');
    }

    // -------------------------------------------------------------
    // Section D — neither avatar nor camera: never throws
    // -------------------------------------------------------------
    {
        const session = new WorldNavigationSession({ registry: buildRegistry(), loadPublicationDocumentUseCase: null, worldLayoutProvider: null });
        const facade = fakeRenderFacade();
        session._session = facade;
        session._setupAnimalRendering();
        facade.fireFrame(); // must not throw
        assert(facade.syncCalls.length === 0, '11. with no known position at all, syncAnimals() is simply never called this frame');
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
        session._setupAnimalRendering();
        assert(facade.listenerCount() === 1, '12. sanity: subscribed');

        session._session = facade;
        session.dispose();
        assert(facade.listenerCount() === 0, '13. dispose() actually unsubscribes the frame listener');
    }

    // -------------------------------------------------------------
    // Section F — architectural regression
    // -------------------------------------------------------------
    {
        const controllerSource = await readFile(new URL('../application/avatar/AvatarAnimalInteractionController.js', import.meta.url), 'utf8');
        for (const term of ['AnimalRenderer', 'AnimalVisual', 'AnimalFieldRenderer', 'THREE', 'syncAnimals']) {
            assert(!controllerSource.includes(term),
                `14. application/avatar/AvatarAnimalInteractionController.js never references "${term}" — catch/release stays entirely independent of rendering`);
        }
        const sessionSource = await readFile(new URL('../application/world/WorldNavigationSession.js', import.meta.url), 'utf8');
        assert(sessionSource.includes('avatarAnimalInteractionState'),
            '15. the existing catch/release observation seam is still exposed, untouched by this milestone');
    }

    console.log('✅ All Animal Rendering World View Integration tests passed.');
}

await runTests();
