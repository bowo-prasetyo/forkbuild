import { CameraPerspective } from '../core/CameraPerspective.js';
import { LocalWorldExperienceStore } from '../application/world/LocalWorldExperienceStore.js';
import { SpatialCameraController } from '../application/world/SpatialCameraController.js';
import { WorldNavigationSession } from '../application/world/WorldNavigationSession.js';
import { AvatarProfileUseCase } from '../application/avatar/AvatarProfileUseCase.js';
import { AvatarPresenceSession } from '../application/avatar/AvatarPresenceSession.js';
import { AvatarTemplateRegistry } from '../core/AvatarTemplateRegistry.js';
import { CoreAvatarTemplateLibrary } from '../core/library/CoreAvatarTemplateLibrary.js';
import { LocalIdentityProvider } from '../identity/LocalIdentityProvider.js';
import { CreateBrickRegistryUseCase } from '../application/editor/CreateBrickRegistryUseCase.js';
import { WorldPosition } from '../core/WorldPosition.js';
import { assert } from './support/Assert.js';
import { InMemoryStorageProvider } from './support/InMemoryStorageProvider.js';

// A World's saved camera framing must be framing of that World. World View
// saves the World it is leaving only once the active document has changed,
// when the camera has already moved on: to the next World (Search → Focus),
// or so far that the World streamed out. Saved as is, that framing sent the
// camera away from the World on the next Explore, which then showed nothing
// (a reported 1:6 Great Pyramid: "Camera: World · Editing: None").

const WORLD_A = 'world-a';
const WORLD_B = 'world-b';
const POSITIONS = {
    [WORLD_A]: new WorldPosition(1000, 0, 1000),
    [WORLD_B]: new WorldPosition(2000, 0, 2000)
};

function xyz(p) {
    return { x: p.x, y: p.y, z: p.z };
}

function stubCameraRenderer() {
    let state = { position: { x: 10, y: 10, z: 10 }, target: { x: 0, y: 0, z: 0 }, zoom: 1 };
    return {
        getCameraState() {
            return { position: xyz(state.position), target: xyz(state.target), zoom: state.zoom };
        },
        // Copies x/y/z by name: WorldPosition's are getters, which a spread drops.
        setCameraState(next) {
            state = { position: xyz(next.position), target: xyz(next.target), zoom: next.zoom };
        },
        setLocalAvatar() {}, updateLocalAvatarAppearance() {}, updateLocalAvatarPresence() {},
        setLocalAvatarVisible() {}, removeLocalAvatar() {},
        onAnimationFrame() { return () => {}; },
        addWorld() {}, removeWorld() {}, clearSelection() {}, clearHover() {},
        setRemoteAvatarsVisible() {},
        dispose() {}
    };
}

function buildSession() {
    const registry = new AvatarTemplateRegistry();
    registry.register(CoreAvatarTemplateLibrary);
    const storage = new InMemoryStorageProvider();
    const identityProvider = new LocalIdentityProvider(storage);
    identityProvider.login('alice');
    const avatarProfileUseCase = new AvatarProfileUseCase(storage, identityProvider, registry);
    const avatarPresenceSession = new AvatarPresenceSession(avatarProfileUseCase.getProfile(), { position: { x: 0, y: 0, z: 0 } });
    const store = new LocalWorldExperienceStore({ storageProvider: new InMemoryStorageProvider() });
    const session = new WorldNavigationSession({
        registry: new CreateBrickRegistryUseCase().execute(),
        loadPublicationDocumentUseCase: null,
        worldLayoutProvider: {
            getPosition: (documentId) => POSITIONS[documentId] || new WorldPosition(0, 0, 0),
            findVisibleDocuments: () => []
        },
        avatarProfileUseCase,
        avatarPresenceSession,
        localWorldExperienceStore: store
    });
    session._session = stubCameraRenderer();
    session._spatialCameraController = new SpatialCameraController(session._session);
    session._setupLocalAvatar();
    return { session, store, avatarPresenceSession };
}

function camera(session) {
    return session._spatialCameraController.getSpatialCameraState();
}

function frame(session, documentId, offset = 35) {
    const at = POSITIONS[documentId];
    session._spatialCameraController.focusTarget({ x: at.x, y: at.y, z: at.z }, { x: offset, y: offset, z: offset });
}

{
    // Visiting A, then jumping to B before A is saved.
    const { session, store } = buildSession();
    frame(session, WORLD_A, 20);
    session.noteWorldExperienceCamera(WORLD_A);
    frame(session, WORLD_B);
    session.noteWorldExperienceCamera(WORLD_A);
    session.saveWorldExperience(WORLD_A);

    const saved = store.getExperience(WORLD_A);
    assert(saved.cameraPosition.x === 1020 && saved.cameraPosition.z === 1020,
        '1. leaving A after the camera moved to B saves the framing last seen at A, not B\'s');
    assert(saved.cameraTarget.x === 1000, '2. ...and the target it had at A');

    session.saveWorldExperience(WORLD_B);
    assert(store.getExperience(WORLD_B).cameraPosition.x === 2035, '3. a World the camera is still at is saved with the current framing');
    console.log('✓ leaving a World saves the framing from while the camera was there');
}

{
    // Nothing noted near A (the camera never settled there in this session).
    const { session, store } = buildSession();
    store.recordVisit(WORLD_A, { position: { x: 1010, y: 10, z: 1010 }, target: { x: 1000, y: 0, z: 1000 }, perspective: null });
    frame(session, WORLD_B);
    session.saveWorldExperience(WORLD_A);
    const saved = store.getExperience(WORLD_A);
    assert(saved.cameraPosition.x === 1010, '4. with no framing seen at A, A keeps its previous framing instead of taking B\'s');
    console.log('✓ a World is never saved with another place\'s framing');
}

{
    // A framing already saved somewhere else (what browsers hold from before this fix).
    const { session, store } = buildSession();
    store.recordVisit(WORLD_A, { position: { x: 2035, y: 35, z: 2035 }, target: { x: 2000, y: 0, z: 2000 }, perspective: null });
    frame(session, WORLD_A);
    const restored = session.restoreWorldExperience(WORLD_A);
    assert(restored !== null, '5. the visit is still reported (Welcome back)');
    assert(camera(session).target.x === 1000 && camera(session).position.x === 1035,
        '6. a saved framing away from the World is ignored: the camera stays on the World');

    store.recordVisit(WORLD_A, { position: { x: 1020, y: 20, z: 1020 }, target: { x: 1000, y: 0, z: 1000 }, perspective: null });
    session.restoreWorldExperience(WORLD_A);
    assert(camera(session).position.x === 1020, '7. a saved framing at the World is still restored');
    console.log('✓ restoring ignores a framing that is not at the World');
}

{
    // A saved Camera Perspective frames the avatar, wherever it stands.
    const { session, store, avatarPresenceSession } = buildSession();
    store.recordVisit(WORLD_A, { position: { x: 1020, y: 20, z: 1020 }, target: { x: 1000, y: 0, z: 1000 }, perspective: CameraPerspective.THIRD_PERSON });
    avatarPresenceSession.update({ position: { x: 2000, y: 0, z: 2000 } });
    frame(session, WORLD_A);
    session.restoreWorldExperience(WORLD_A);
    assert(session.getCameraPerspective() === null, '8. a saved perspective is not re-applied while the avatar stands far from the World');
    assert(camera(session).position.x === 1020, '9. ...the saved orbit framing at the World is used instead');

    avatarPresenceSession.update({ position: { x: 1005, y: 0, z: 1005 } });
    session.restoreWorldExperience(WORLD_A);
    assert(session.getCameraPerspective() === CameraPerspective.THIRD_PERSON, '10. with the avatar at the World, the saved perspective is re-applied');
    console.log('✓ a saved perspective is re-applied only with the avatar at the World');
}
