import { AvatarTemplateRegistry } from '../core/AvatarTemplateRegistry.js';
import { CoreAvatarTemplateLibrary } from '../core/library/CoreAvatarTemplateLibrary.js';
import { AvatarProfileUseCase } from '../application/avatar/AvatarProfileUseCase.js';
import { AvatarPresenceSession } from '../application/avatar/AvatarPresenceSession.js';
import { WorldNavigationSession } from '../application/world/WorldNavigationSession.js';
import { LocalIdentityProvider } from '../identity/LocalIdentityProvider.js';
import { CreateBrickRegistryUseCase } from '../application/editor/CreateBrickRegistryUseCase.js';
import { Position } from '../core/Position.js';
import { DEFAULT_WORLD_SEED, terrainHeightAt } from '../core/TerrainHeightField.js';
import { LAKE_SURFACE_HEIGHT } from '../core/Hydrology.js';
import { AvatarSwimMode, surfaceSwimFeetHeight } from '../core/AvatarSwimming.js';
import { InMemoryStorageProvider } from './support/InMemoryStorageProvider.js';
import { assert } from './support/Assert.js';

// Swimming through the whole World View session, wired as the app wires it. The
// session sets a WALK movement capability every frame while nothing is ridden;
// swimming must treat that as on foot, exactly like no capability at all.

const SEA = { x: 5000, z: 5000 };

function buildSession(position) {
    const registry = new AvatarTemplateRegistry();
    registry.register(CoreAvatarTemplateLibrary);
    const storage = new InMemoryStorageProvider();
    const identityProvider = new LocalIdentityProvider(storage);
    identityProvider.login('session-swimmer');
    const avatarProfileUseCase = new AvatarProfileUseCase(storage, identityProvider, registry);
    const avatarPresenceSession = new AvatarPresenceSession(avatarProfileUseCase.getProfile(), { position, rotation: { y: 0 } });
    const frameCallbacks = [];
    const facade = new Proxy({
        onAnimationFrame: (callback) => { frameCallbacks.push(callback); return () => {}; },
        getCameraState: () => ({ position: { x: 0, y: 0, z: 0 }, target: { x: 0, y: 0, z: 0 }, zoom: 1 })
    }, { get: (target, key) => (key in target ? target[key] : () => null) });
    const session = new WorldNavigationSession({
        registry: new CreateBrickRegistryUseCase().execute(), loadPublicationDocumentUseCase: null, worldLayoutProvider: null,
        avatarProfileUseCase, avatarPresenceSession
    });
    session._session = facade;
    session._setupLocalAvatar();
    session.setAvatarControlMode(true);
    const frames = (count) => {
        for (let i = 0; i < count; i++) for (const callback of frameCallbacks) callback(0.05);
    };
    return { session, avatarPresenceSession, frames };
}

async function run() {
    const depth = LAKE_SURFACE_HEIGHT - terrainHeightAt(DEFAULT_WORLD_SEED, SEA.x, SEA.z);
    assert(depth > 3, `setup: the sea point is deep (${depth.toFixed(2)})`);
    const floating = surfaceSwimFeetHeight(depth);

    const { session, avatarPresenceSession, frames } = buildSession(new Position(SEA.x, floating, SEA.z));
    frames(5);
    assert(session.avatarSwimState().mode === AvatarSwimMode.SURFACE, '1. on foot in the open sea, the avatar swims at the surface');
    assert(Math.abs(avatarPresenceSession.current.position.y - floating) < 1e-9, '2. ...floating, not standing on the sea floor');

    assert(session.avatarKeyDown('c') === true, '3. C is taken by Avatar Control Mode');
    frames(40);
    session.avatarKeyUp('c');
    assert(avatarPresenceSession.current.position.y < floating - 2, '4. holding C dives');
    assert(session.avatarSwimState().mode === AvatarSwimMode.DIVING, '5. ...and the session reports diving');
    assert(session.avatarSwimState().breathSeconds < session.avatarSwimState().breathCapacitySeconds, '6. ...holding its breath');

    const dived = avatarPresenceSession.current.position.y;
    session.avatarKeyDown(' ');
    frames(20);
    session.avatarKeyUp(' ');
    assert(avatarPresenceSession.current.position.y > dived + 1, '7. holding Space swims up');

    session.avatarKeyDown('w');
    frames(40);
    session.avatarKeyUp('w');
    assert(avatarPresenceSession.current.position.z > SEA.z + 1, '8. W swims forward');

    // Dropped onto the sea floor (as after a teleport), it drifts back up.
    const floor = buildSession(new Position(SEA.x, 0, SEA.z));
    floor.frames(40);
    assert(floor.avatarPresenceSession.current.position.y > 1, '9. with no keys held, a submerged avatar drifts up');

    console.log('✅ All Avatar Swimming Session tests passed.');
}

await run();
