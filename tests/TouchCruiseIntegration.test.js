import { AvatarTemplateRegistry } from '../core/AvatarTemplateRegistry.js';
import { CoreAvatarTemplateLibrary } from '../core/library/CoreAvatarTemplateLibrary.js';
import { AvatarProfileUseCase } from '../application/avatar/AvatarProfileUseCase.js';
import { AvatarPresenceSession } from '../application/avatar/AvatarPresenceSession.js';
import { WorldNavigationSession } from '../application/world/WorldNavigationSession.js';
import { LocalIdentityProvider } from '../identity/LocalIdentityProvider.js';
import { CreateBrickRegistryUseCase } from '../application/editor/CreateBrickRegistryUseCase.js';
import { TouchMovementInput, cruiseChord } from '../application/avatar/TouchMovementInput.js';
import { AvatarContinuousMovementIntent as Intent } from '../core/AvatarContinuousMovementIntent.js';
import { AvatarContinuousMovementMode as Mode } from '../core/AvatarContinuousMovementMode.js';
import { InMemoryStorageProvider } from './support/InMemoryStorageProvider.js';
import { assert } from './support/Assert.js';

// The touch pad's Cruise button against a real WorldNavigationSession: its
// chords go through avatarKeyDown/avatarKeyUp exactly as a keyboard's do.

function facade() {
    return {
        setLocalAvatar() {}, updateLocalAvatarAppearance() {}, updateLocalAvatarPresence() {},
        setLocalAvatarVisible() {}, removeLocalAvatar() {},
        onAnimationFrame: () => () => {},
        getCameraState: () => ({ position: { x: 10, y: 10, z: 10 }, target: { x: 0, y: 0, z: 0 }, zoom: 1 }),
        setCameraState() {}, setControlsEnabled() {}, dispose() {}
    };
}

function controlledSession() {
    const registry = new AvatarTemplateRegistry();
    registry.register(CoreAvatarTemplateLibrary);
    const storage = new InMemoryStorageProvider();
    const identityProvider = new LocalIdentityProvider(storage);
    identityProvider.login('cruiser');
    const avatarProfileUseCase = new AvatarProfileUseCase(storage, identityProvider, registry);
    const avatarPresenceSession = new AvatarPresenceSession(avatarProfileUseCase.getProfile());
    const session = new WorldNavigationSession({
        registry: new CreateBrickRegistryUseCase().execute(), loadPublicationDocumentUseCase: null, worldLayoutProvider: null,
        avatarProfileUseCase, avatarPresenceSession
    });
    session._session = facade();
    session._setupLocalAvatar();
    session.setAvatarControlMode(true);
    return session;
}

function describe(state) {
    return `${state.intent}/${state.mode}`;
}

// 1. Cruise walks, then runs, then stops.
{
    const session = controlledSession();
    const input = new TouchMovementInput({ keyDown: (k) => session.avatarKeyDown(k), keyUp: (k) => session.avatarKeyUp(k) });
    assert(describe(session.avatarContinuousMovementState()) === `${Intent.NONE}/${Mode.NONE}`, 'starts still');

    input.pressChord(cruiseChord(session.avatarContinuousMovementState()));
    assert(describe(session.avatarContinuousMovementState()) === `${Intent.FORWARD}/${Mode.WALK}`, 'first tap walks forward');

    input.pressChord(cruiseChord(session.avatarContinuousMovementState()));
    assert(describe(session.avatarContinuousMovementState()) === `${Intent.FORWARD}/${Mode.RUN}`, 'second tap runs');

    input.pressChord(cruiseChord(session.avatarContinuousMovementState()));
    assert(session.avatarContinuousMovementState().intent === Intent.NONE, 'third tap stops');
    console.log('✓ cruise cycles walk, run, stop');
}

// 2. Pushing the joystick forward stops a cruise, as W does; turning does not.
{
    const session = controlledSession();
    const input = new TouchMovementInput({ keyDown: (k) => session.avatarKeyDown(k), keyUp: (k) => session.avatarKeyUp(k) });
    input.pressChord(cruiseChord(session.avatarContinuousMovementState()));
    input.setJoystick({ dx: 40, dy: 0, radius: 50 });
    input.releaseJoystick();
    assert(session.avatarContinuousMovementState().intent === Intent.FORWARD, 'turning with the joystick keeps cruising');
    input.setJoystick({ dx: 0, dy: -40, radius: 50 });
    input.releaseJoystick();
    assert(session.avatarContinuousMovementState().intent === Intent.NONE, 'pushing forward stops the cruise');
    console.log('✓ joystick and cruise');
}

// 3. No state without an avatar.
{
    const session = new WorldNavigationSession({
        registry: new CreateBrickRegistryUseCase().execute(), loadPublicationDocumentUseCase: null, worldLayoutProvider: null
    });
    assert(session.avatarContinuousMovementState() === null, 'no avatar, no cruise state');
    console.log('✓ no avatar');
}
