import * as THREE from 'three';
import { AvatarInteractionState } from '../application/spatial-state/AvatarInteractionState.js';
import { describeLifecycleState, describeTrustStatus } from '../application/AvatarPresenceLabels.js';
import { AvatarPickingService } from '../renderer/AvatarPickingService.js';
import { PickingService } from '../renderer/PickingService.js';
import { PresenceLifecycleState } from '../core/PresenceLifecycleState.js';
import { TrustStatus } from '../core/TrustObservation.js';
import { AvatarAnimationState } from '../core/AvatarAnimationState.js';
import { RemoteAvatarRegistry } from '../application/RemoteAvatarRegistry.js';
import { WorldNavigationSession } from '../application/WorldNavigationSession.js';
import { SpatialCameraController } from '../application/SpatialCameraController.js';
import { AvatarProfileUseCase } from '../application/AvatarProfileUseCase.js';
import { AvatarPresenceSession } from '../application/AvatarPresenceSession.js';
import { AvatarTemplateRegistry } from '../core/AvatarTemplateRegistry.js';
import { CoreAvatarTemplateLibrary } from '../core/library/CoreAvatarTemplateLibrary.js';
import { LocalAvatarPresenceBroadcastProvider } from '../presence/LocalAvatarPresenceBroadcastProvider.js';
import { LocalIdentityProvider } from '../identity/LocalIdentityProvider.js';
import { StorageProvider } from '../storage/StorageProvider.js';
import { LocalContentStore } from '../content/LocalContentStore.js';
import { LocalPublisherProvider } from '../publisher/LocalPublisherProvider.js';
import { LocalDiscoveryProvider } from '../discovery/LocalDiscoveryProvider.js';
import { LocalSpatialIndexProvider } from '../spatial/LocalSpatialIndexProvider.js';
import { LocalWorldLayoutProvider } from '../world-layout/LocalWorldLayoutProvider.js';
import { LocalPlacementRegistry } from '../placement/LocalPlacementRegistry.js';
import { PlacePublicationUseCase } from '../application/PlacePublicationUseCase.js';
import { GridPlacementStrategy } from '../application/InitialPlacementStrategy.js';
import { PublishDocumentUseCase } from '../application/PublishDocumentUseCase.js';
import { SaveDocumentUseCase } from '../application/SaveDocumentUseCase.js';
import { LoadPublicationDocumentUseCase } from '../application/LoadPublicationDocumentUseCase.js';
import { CreateBrickRegistryUseCase } from '../application/CreateBrickRegistryUseCase.js';
import { MoveBrickCommand } from '../application/commands/MoveBrickCommand.js';
import { DocumentCloneService } from '../application/DocumentCloneService.js';
import { Document } from '../core/Document.js';
import { DocumentMetadata } from '../core/DocumentMetadata.js';
import { World } from '../core/World.js';
import { Building } from '../core/Building.js';
import { Brick } from '../core/Brick.js';
import { Position } from '../core/Position.js';
import { License, LicenseId } from '../core/License.js';

// 0.2.39 — World Entity Interaction & Selection.
//
//   Section A: application/spatial-state/AvatarInteractionState.js
//   Section B: application/AvatarPresenceLabels.js
//   Section C: renderer/AvatarPickingService.js — REAL Three.js raycasting
//   Section D: renderer/PickingService.js — distance field addition
//   Section E: application/RemoteAvatarRegistry.js — has()/currentPosition()
//   Section F: WorldNavigationSession.pick() — avatar-vs-brick priority/distance
//   Section G: WorldNavigationSession.getAvatarInfo() — local vs remote
//   Section H: Follow-a-remote-avatar / mutual exclusivity / pruning on absence
//   Section I: FLAGSHIP — the design doc's own scripted scenario
//
// Central architectural claim under test throughout: avatars are
// first-class interactive World View entities WITHOUT ever becoming
// documents, placements, or editable world content — see
// docs/Principles.md, "Avatars Are Never Document Selection."

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

function wait(ms) {
    return new Promise((resolve) => setTimeout(resolve, ms));
}

function buildRegistry() {
    const registry = new AvatarTemplateRegistry();
    registry.register(CoreAvatarTemplateLibrary);
    return registry;
}

function buildAvatarStack(username, registry) {
    const storage = new InMemoryStorageProvider();
    const identityProvider = new LocalIdentityProvider(storage);
    identityProvider.login(username);
    const avatarProfileUseCase = new AvatarProfileUseCase(storage, identityProvider, registry);
    const profile = avatarProfileUseCase.getProfile();
    const avatarPresenceSession = new AvatarPresenceSession(profile, { position: { x: 0, y: 0, z: 0 } });
    return { storage, identityProvider, avatarProfileUseCase, avatarPresenceSession };
}

// A spy render facade that ALSO lets each test SCRIPT exactly what a
// click resolves to — pick()/pickAvatar()/pickGround() all read from
// mutable `scripted.*` fields the test sets before each
// session.pick() call, so the priority/distance-comparison logic in
// WorldNavigationSession.pick() itself is exercised for real, never
// bypassed.
function scriptableRenderFacade() {
    const scripted = { pick: null, pickAvatar: null, pickGround: null };
    const calls = {
        setLocalAvatar: [], updateLocalAvatarPresence: [], setLocalAvatarVisible: [],
        setRemoteAvatar: [], updateRemoteAvatarPresence: [], removeRemoteAvatar: [], setRemoteAvatarsVisible: [],
        selectBricks: [], clearSelection: 0, clearHover: 0,
        onAnimationFrameCallbacks: []
    };
    let cameraState = { position: { x: 0, y: 0, z: 20 }, target: { x: 0, y: 0, z: 0 }, zoom: 1 };
    return {
        scripted,
        calls,
        pick: (x, y) => (typeof scripted.pick === 'function' ? scripted.pick(x, y) : null),
        pickAvatar: (x, y) => (typeof scripted.pickAvatar === 'function' ? scripted.pickAvatar(x, y) : null),
        pickGround: (x, y) => (typeof scripted.pickGround === 'function' ? scripted.pickGround(x, y) : null),
        setLocalAvatar: (template, appearance, presence) => calls.setLocalAvatar.push({ template, appearance, presence }),
        updateLocalAvatarAppearance: () => {},
        updateLocalAvatarPresence: (presence) => calls.updateLocalAvatarPresence.push({ presence }),
        setLocalAvatarVisible: (visible) => calls.setLocalAvatarVisible.push(visible),
        removeLocalAvatar: () => {},
        setRemoteAvatar: (avatarId, template, appearance, presenceLike) => calls.setRemoteAvatar.push({ avatarId, template, appearance, presenceLike }),
        updateRemoteAvatarPresence: (avatarId, presenceLike) => calls.updateRemoteAvatarPresence.push({ avatarId, presenceLike }),
        removeRemoteAvatar: (avatarId) => calls.removeRemoteAvatar.push(avatarId),
        setRemoteAvatarsVisible: (visible) => calls.setRemoteAvatarsVisible.push(visible),
        onAnimationFrame: (callback) => { calls.onAnimationFrameCallbacks.push(callback); return () => {}; },
        getCameraState: () => cameraState,
        setCameraState: (state) => { cameraState = state; },
        addWorld() {}, removeWorld() {},
        clearSelection: () => { calls.clearSelection++; },
        clearHover: () => { calls.clearHover++; },
        selectBricks: (brickIds, primaryBrickId) => calls.selectBricks.push({ brickIds, primaryBrickId }),
        hoverBrick() {}, showPreview() {}, hidePreview() {},
        showGizmo() {}, hideGizmo() {},
        gizmoHitTest() { return true; }, gizmoPointerDown() { return false; },
        gizmoPointerMove() { return { consumed: false, hovered: false, feedback: null }; },
        gizmoPointerUp() { return { consumed: false, committed: false, feedback: null }; },
        gizmoKeyDown() { return false; },
        pickRectangle() { return []; },
        setControlsEnabled() {},
        dispose() {}
    };
}

async function runTests() {
    const registry = buildRegistry();

    // -------------------------------------------------------------
    // Section A — application/spatial-state/AvatarInteractionState.js
    // -------------------------------------------------------------
    {
        assert(AvatarInteractionState.empty().isEmpty === true, '1. empty() is empty');
        assert(AvatarInteractionState.empty().avatarId === null, '2. empty() carries no avatarId');
        const target = AvatarInteractionState.avatar('a1');
        assert(target.isEmpty === false && target.avatarId === 'a1', '3. avatar(id) carries exactly that id');
    }

    // -------------------------------------------------------------
    // Section B — application/AvatarPresenceLabels.js
    // -------------------------------------------------------------
    {
        assert(describeLifecycleState(PresenceLifecycleState.PRESENT) === 'Present', '4. PRESENT -> "Present"');
        assert(describeLifecycleState(PresenceLifecycleState.STALE) === 'Stale', '5. STALE -> "Stale"');
        assert(describeLifecycleState('made-up') === 'Unknown', '6. an unrecognized lifecycle state degrades to "Unknown", never throws');
        assert(describeTrustStatus(TrustStatus.VALID) === 'Trusted', '7. VALID -> "Trusted"');
        assert(describeTrustStatus(TrustStatus.EQUIVOCATING) === 'Conflicting', '8. EQUIVOCATING -> "Conflicting"');
        assert(describeTrustStatus(TrustStatus.UNAUTHORIZED) === 'Unauthorized', '9. UNAUTHORIZED -> "Unauthorized"');
        assert(describeTrustStatus(null) === 'Unknown', '10. a null trust status degrades to "Unknown", never throws');
    }

    // -------------------------------------------------------------
    // Section C — renderer/AvatarPickingService.js (REAL Three.js raycasting)
    // -------------------------------------------------------------
    {
        // A simple orthographic camera looking straight down -Z at the
        // origin — screen center always maps to NDC (0,0), i.e. a ray
        // straight along -Z through (0,0,anything).
        const camera = new THREE.OrthographicCamera(-5, 5, 5, -5, 0.1, 100);
        camera.position.set(0, 0, 10);
        camera.lookAt(0, 0, 0);
        camera.updateMatrixWorld();
        const fakeDomElement = { getBoundingClientRect: () => ({ left: 0, top: 0, width: 800, height: 600 }) };
        const service = new AvatarPickingService(camera, fakeDomElement);
        const screenCenterX = 400, screenCenterY = 300; // NDC (0,0)
        const screenOffsetX = 700, screenOffsetY = 300; // well off-center -> NDC ~(0.75, 0)

        assert(service.pick(screenCenterX, screenCenterY, new Map()) === null, '11. an empty candidate map is never a hit');

        const meshA = new THREE.Mesh(new THREE.BoxGeometry(1, 1, 1));
        meshA.position.set(0, 0, 0);
        meshA.updateMatrixWorld();
        const rootsSingle = new Map([['avatar-a', meshA]]);
        const hit = service.pick(screenCenterX, screenCenterY, rootsSingle);
        assert(hit && hit.avatarId === 'avatar-a', '12. a centered ray hits the avatar directly under it');
        assert(Number.isFinite(hit.distance) && hit.distance > 0, '13. the hit carries a finite, positive distance');

        assert(service.pick(screenOffsetX, screenOffsetY, rootsSingle) === null, '14. a ray well off to the side misses entirely');

        // Recursive children — an AvatarVisual's real shape is
        // root -> poseGroup -> body parts, never a single flat mesh.
        const group = new THREE.Group();
        group.position.set(0, 0, 0);
        const child = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.5, 0.5));
        child.position.set(0, 0, 0);
        group.add(child);
        group.updateMatrixWorld(true);
        const rootsGroup = new Map([['avatar-group', group]]);
        const groupHit = service.pick(screenCenterX, screenCenterY, rootsGroup);
        assert(groupHit && groupHit.avatarId === 'avatar-group', '15. a hit on a CHILD mesh resolves back to the GROUP root avatarId');

        // Nearest-wins: two avatars along the SAME ray at different depths.
        const near = new THREE.Mesh(new THREE.BoxGeometry(1, 1, 1));
        near.position.set(0, 0, 5);
        near.updateMatrixWorld();
        const far = new THREE.Mesh(new THREE.BoxGeometry(1, 1, 1));
        far.position.set(0, 0, -5);
        far.updateMatrixWorld();
        const rootsBoth = new Map([['avatar-far', far], ['avatar-near', near]]);
        const nearestHit = service.pick(screenCenterX, screenCenterY, rootsBoth);
        assert(nearestHit.avatarId === 'avatar-near', '16. of two avatars along the same ray, the NEARER one (to the camera) wins');
    }

    // -------------------------------------------------------------
    // Section D — renderer/PickingService.js: distance field addition
    // -------------------------------------------------------------
    {
        const camera = new THREE.OrthographicCamera(-5, 5, 5, -5, 0.1, 100);
        camera.position.set(0, 0, 10);
        camera.lookAt(0, 0, 0);
        camera.updateMatrixWorld();
        const fakeDomElement = { getBoundingClientRect: () => ({ left: 0, top: 0, width: 800, height: 600 }) };
        const mesh = new THREE.Mesh(new THREE.BoxGeometry(1, 1, 1));
        mesh.position.set(0, 0, 0);
        mesh.updateMatrixWorld();
        const fakeMeshRegistry = {
            getAllMeshes: () => [mesh],
            getBrickId: () => 'brick-1',
            getDocumentId: () => 'doc-1',
            getBuildingId: () => 'building-1'
        };
        const pickingService = new PickingService(camera, fakeDomElement, fakeMeshRegistry);
        const result = pickingService.pickRich(400, 300);
        assert(result && result.type === 'brick', '17. pickRich still resolves a brick hit exactly as before');
        assert(Number.isFinite(result.distance) && result.distance > 0, '18. pickRich now also exposes the raycaster\'s own hit distance');
    }

    // -------------------------------------------------------------
    // Section E — application/RemoteAvatarRegistry.js: has()/currentPosition()
    // -------------------------------------------------------------
    {
        const calls = { setRemoteAvatar: [], updateRemoteAvatarPresence: [], removeRemoteAvatar: [] };
        const facade = {
            setRemoteAvatar: (avatarId, t, a, p) => calls.setRemoteAvatar.push({ avatarId, p }),
            updateRemoteAvatarPresence: (avatarId, p) => calls.updateRemoteAvatarPresence.push({ avatarId, p }),
            removeRemoteAvatar: (avatarId) => calls.removeRemoteAvatar.push(avatarId)
        };
        const remoteRegistry = new RemoteAvatarRegistry(facade, {});
        assert(remoteRegistry.has('bob') === false, '19. an unknown avatarId is not "has"');
        assert(remoteRegistry.currentPosition('bob') === null, '20. currentPosition() for an unknown avatarId is null');

        const advertisement = {
            avatarId: 'bob', ownerIdentity: 'bob',
            position: { x: 10, y: 0, z: 0 }, rotation: { x: 0, y: 0, z: 0 },
            animation: AvatarAnimationState.IDLE, sequence: 1
        };
        remoteRegistry.sync([{ advertisement }], 1000);
        assert(remoteRegistry.has('bob') === true, '21. a synced avatarId is "has"');
        const pos = remoteRegistry.currentPosition('bob', 1000);
        assert(pos && pos.x === 10, '22. currentPosition() reads the SAME interpolated value tick() would push to the renderer');

        remoteRegistry.sync([], 5000);
        assert(remoteRegistry.has('bob') === false, '23. an avatarId no longer in the known-presences list is no longer "has" after sync()');
    }

    // -------------------------------------------------------------
    // Section F — WorldNavigationSession.pick(): avatar-vs-brick
    // priority/distance, mutual exclusivity with SpatialSelectionState
    // -------------------------------------------------------------
    {
        const { avatarProfileUseCase, avatarPresenceSession } = buildAvatarStack('session-f1', registry);
        const provider = new LocalAvatarPresenceBroadcastProvider('forkbuild-test-f1');
        const session = new WorldNavigationSession({
            registry: new CreateBrickRegistryUseCase().execute(), loadPublicationDocumentUseCase: null, worldLayoutProvider: null,
            avatarProfileUseCase, avatarPresenceSession,
            presenceBroadcastProvider: provider, avatarTemplateRegistry: registry
        });
        const facade = scriptableRenderFacade();
        session._session = facade;
        session._setupRemoteAvatars();
        session._setupLocalAvatar();

        // F1 — a pure avatar hit (no brick along the ray at all).
        facade.scripted.pick = () => null;
        facade.scripted.pickAvatar = () => ({ type: 'avatar', avatarId: 'remote-1', isLocal: false, distance: 5 });
        facade.scripted.pickGround = () => null;
        let result = session.pick(100, 100);
        assert(session.getAvatarInteraction().avatarId === 'remote-1', '24. clicking a bare avatar sets the avatar interaction target');
        assert(session.getSpatialSelection().isEmpty, '25. ...and leaves SpatialSelectionState completely empty');
        assert(result === session.getAvatarInteraction(), '26. pick() returns the avatar interaction state on an avatar hit');
        assert(facade.calls.selectBricks.length === 0, "27. the renderer's brick-selection surface is never called for an avatar hit");

        // F2 — a brick hit with NO avatar along the ray clears the
        // avatar target and selects the brick normally.
        facade.scripted.pick = () => ({ type: 'brick', documentId: 'd1', buildingId: 'b1', brickId: 'k1', point: { x: 0, y: 0, z: 0 }, normal: { x: 0, y: 1, z: 0 }, distance: 10 });
        facade.scripted.pickAvatar = () => null;
        session.pick(100, 100);
        assert(session.getAvatarInteraction().isEmpty, '28. clicking a brick clears any avatar interaction target');
        assert(session.getSpatialSelection().brickId === 'k1', '29. ...and the brick is selected normally');

        // F3 — an avatar standing IN FRONT of a brick along the SAME
        // ray: the NEARER one wins, regardless of category.
        facade.scripted.pick = () => ({ type: 'brick', documentId: 'd1', buildingId: 'b1', brickId: 'k2', point: { x: 0, y: 0, z: 0 }, normal: { x: 0, y: 1, z: 0 }, distance: 50 });
        facade.scripted.pickAvatar = () => ({ type: 'avatar', avatarId: 'remote-2', isLocal: false, distance: 10 });
        session.pick(100, 100);
        assert(session.getAvatarInteraction().avatarId === 'remote-2', '30. a NEARER avatar wins over a FARTHER brick along the same ray');
        assert(session.getSpatialSelection().isEmpty, '31. ...and the brick is never selected in that case');

        // F4 — the reverse: a brick nearer than the avatar wins.
        facade.scripted.pick = () => ({ type: 'brick', documentId: 'd1', buildingId: 'b1', brickId: 'k3', point: { x: 0, y: 0, z: 0 }, normal: { x: 0, y: 1, z: 0 }, distance: 5 });
        facade.scripted.pickAvatar = () => ({ type: 'avatar', avatarId: 'remote-3', isLocal: false, distance: 50 });
        session.pick(100, 100);
        assert(session.getSpatialSelection().brickId === 'k3', '32. a NEARER brick wins over a FARTHER avatar along the same ray');
        assert(session.getAvatarInteraction().isEmpty, '33. ...and no avatar interaction target is set in that case');

        // F5 — a ground click clears any avatar target too.
        facade.scripted.pick = () => null;
        facade.scripted.pickAvatar = () => null;
        facade.scripted.pickGround = () => ({ position: { x: 1, y: 0, z: 1 } });
        session._setAvatarInteraction(AvatarInteractionState.avatar('leftover'));
        session.pick(100, 100);
        assert(session.getAvatarInteraction().isEmpty, '34. a ground click clears a leftover avatar interaction target');
        assert(session.getSpatialSelection().type === 'ground', '35. ...and selects the ground normally');

        // F6 — an empty click (nothing at all) clears both.
        facade.scripted.pickGround = () => null;
        session._setAvatarInteraction(AvatarInteractionState.avatar('leftover2'));
        session.pick(100, 100);
        assert(session.getAvatarInteraction().isEmpty && session.getSpatialSelection().isEmpty,
            '36. clicking empty space clears both the selection AND the avatar interaction target');

        // F7 — a session whose render facade doesn't implement
        // pickAvatar() at all (an older/minimal test facade) degrades
        // gracefully rather than throwing.
        facade.scripted.pick = () => null;
        facade.scripted.pickGround = () => null;
        delete facade.pickAvatar;
        assert(session.pick(100, 100) === null, '37. a facade without pickAvatar() at all never throws — treated as no avatar hit');

        session.dispose();
        provider.dispose();
    }

    // -------------------------------------------------------------
    // Section G — WorldNavigationSession.getAvatarInfo(): local vs remote
    // -------------------------------------------------------------
    {
        const { avatarProfileUseCase, avatarPresenceSession } = buildAvatarStack('session-g1', registry);
        avatarProfileUseCase.updateProfile({ displayName: 'Gina' });
        const provider = new LocalAvatarPresenceBroadcastProvider('forkbuild-test-g1');
        const session = new WorldNavigationSession({
            registry: new CreateBrickRegistryUseCase().execute(), loadPublicationDocumentUseCase: null, worldLayoutProvider: null,
            avatarProfileUseCase, avatarPresenceSession,
            presenceBroadcastProvider: provider, avatarTemplateRegistry: registry
        });
        const facade = scriptableRenderFacade();
        facade.getCameraState = () => ({ position: { x: 0, y: 0, z: 0 }, target: { x: 0, y: 0, z: 0 }, zoom: 1 });
        session._session = facade;
        session._spatialCameraController = new SpatialCameraController(facade);
        session._setupRemoteAvatars();
        session._setupLocalAvatar();

        assert(session.getAvatarInfo() === null, '38. no current avatar interaction target -> getAvatarInfo() is null');

        // G1 — targeting the LOCAL avatar.
        const localId = avatarPresenceSession.current.avatarId;
        assert(session.isLocalAvatarId(localId) === true, '39. isLocalAvatarId() recognizes the local avatar');
        assert(session.isLocalAvatarId('someone-else') === false, '40. ...and correctly rejects anyone else');
        session._setAvatarInteraction(AvatarInteractionState.avatar(localId));
        let info = session.getAvatarInfo();
        assert(info && info.isLocal === true && info.displayName === 'Gina', '41. local avatar info reflects the real profile displayName');
        assert(info.templatePlaceholder === false, '42. the LOCAL avatar\'s template is never flagged as a placeholder');
        assert(info.lifecycleState === null && info.trustStatus === null, '43. lifecycle/trust are meaningless for your OWN avatar, and are null, not fabricated');
        assert(info.position.x === 0 && info.animation === AvatarAnimationState.IDLE, '44. local avatar info reflects the real current presence');

        // G2 — targeting a REMOTE avatar the local presence sync
        // service actually knows about.
        session._presenceSyncService._store.ingest({
            avatarId: 'remote-g', ownerIdentity: 'remote-owner',
            position: { x: 3, y: 0, z: 4 }, rotation: { x: 0, y: 0, z: 0 },
            animation: AvatarAnimationState.WALKING, sequence: 1
        }, Date.now());
        session._setAvatarInteraction(AvatarInteractionState.avatar('remote-g'));
        info = session.getAvatarInfo();
        assert(info && info.isLocal === false, '45. a known remote avatarId resolves to remote info');
        assert(info.displayName === 'remote-owner', '46. remote displayName falls back to the synced ownerIdentity string (real displayName is never synced)');
        assert(info.templatePlaceholder === true, '47. a REMOTE avatar\'s appearance is always flagged as a placeholder');
        assert(info.animation === AvatarAnimationState.WALKING, '48. remote animation reflects the synced advertisement');
        assert(info.distance !== null && Math.abs(info.distance - 5) < 1e-9, '49. distance is computed from the real camera position (3-4-5 triangle here)');
        assert(info.lifecycleState === PresenceLifecycleState.PRESENT, '50. a freshly-ingested remote claim reports PRESENT');
        assert(info.trustStatus === TrustStatus.VALID, '51. an ordinary accepted claim reports VALID trust');

        // G3 — targeting an avatarId that ISN'T known at all (e.g. it
        // expired between being clicked and being inspected).
        session._setAvatarInteraction(AvatarInteractionState.avatar('nobody-knows-this-one'));
        assert(session.getAvatarInfo() === null, '52. an unknown avatarId resolves to null, never a half-filled/fabricated object');

        session.dispose();
        provider.dispose();
    }

    // -------------------------------------------------------------
    // Section H — Follow a remote avatar: mutual exclusivity with
    // local-avatar-follow, and graceful pruning on absence.
    // -------------------------------------------------------------
    {
        const { avatarProfileUseCase, avatarPresenceSession } = buildAvatarStack('session-h1', registry);
        const provider = new LocalAvatarPresenceBroadcastProvider('forkbuild-test-h1');
        const session = new WorldNavigationSession({
            registry: new CreateBrickRegistryUseCase().execute(), loadPublicationDocumentUseCase: null, worldLayoutProvider: null,
            avatarProfileUseCase, avatarPresenceSession,
            presenceBroadcastProvider: provider, avatarTemplateRegistry: registry
        });
        const facade = scriptableRenderFacade();
        session._session = facade;
        session._spatialCameraController = new SpatialCameraController(facade);
        session._setupRemoteAvatars();
        session._setupLocalAvatar();

        assert(session.followAvatarId('unknown-avatar') === false, '53. cannot follow an avatarId that is not a known remote avatar');
        assert(session.getFollowedRemoteAvatarId() === null, '54. ...and nothing is followed as a result');

        session._presenceSyncService._store.ingest({
            avatarId: 'remote-h', ownerIdentity: 'h-owner',
            position: { x: 0, y: 0, z: 0 }, rotation: { x: 0, y: 0, z: 0 },
            animation: AvatarAnimationState.IDLE, sequence: 1
        }, Date.now());
        session._remoteAvatarRegistry.sync(session._presenceSyncService.listKnownPresences(Date.now()), Date.now());

        assert(session.followAvatarId('remote-h') === true, '55. following a genuinely known remote avatar succeeds');
        assert(session.getFollowedRemoteAvatarId() === 'remote-h', '56. getFollowedRemoteAvatarId() reflects it');

        // Mutual exclusivity: enabling local-avatar-follow turns OFF
        // remote-avatar-follow — there is only one camera.
        session.setFollowAvatar(true);
        assert(session.getFollowedRemoteAvatarId() === null, '57. enabling local-avatar-follow stops following any remote avatar');
        assert(session.isFollowingAvatar() === true, '58. ...and local-avatar-follow is genuinely on');

        assert(session.followAvatarId('remote-h') === true, '59. following a remote avatar again succeeds');
        assert(session.isFollowingAvatar() === false, '60. ...and turns OFF local-avatar-follow in turn');

        session.stopFollowingRemoteAvatar();
        assert(session.getFollowedRemoteAvatarId() === null, '61. stopFollowingRemoteAvatar() clears it explicitly');

        // Graceful pruning: target AND follow both clear the moment
        // the avatar's presence actually expires — driven by the SAME
        // per-frame subscription pull()/sync() already uses.
        session._setAvatarInteraction(AvatarInteractionState.avatar('remote-h'));
        session.followAvatarId('remote-h');
        assert(facade.calls.onAnimationFrameCallbacks.length >= 1, '62. the remote-avatar frame subscription is wired');
        const farFuture = Date.now() + 60000;
        // Directly exercise the SAME pruning/follow-tick helpers the
        // frame subscription calls, with an explicit far-future `now`
        // — no real waiting required, matching every other
        // presence-lifecycle test in this codebase.
        const knownFarFuture = session._presenceSyncService.pull(farFuture);
        session._remoteAvatarRegistry.sync(knownFarFuture, farFuture);
        session._pruneAvatarInteractionIfGone(knownFarFuture);
        session._followRemoteAvatarIfEnabled(farFuture);
        assert(session.getAvatarInteraction().isEmpty, '63. the avatar interaction target is cleared once the targeted avatar expires');
        assert(session.getFollowedRemoteAvatarId() === null, '64. ...and following it stops too, rather than tracking a nonexistent avatar');

        session.dispose();
        provider.dispose();
    }

    // -------------------------------------------------------------
    // Section I — FLAGSHIP: the design doc's own scripted scenario.
    //
    //   Alice moves -> presence -> Bob sees Alice
    //   Bob clicks Alice -> avatar target -> Avatar Info
    //   Bob clicks Alice's building -> brick selection
    //   Bob moves the brick -> document forks
    //   Alice's avatar remains completely unaffected
    // -------------------------------------------------------------
    {
        const channelName = 'forkbuild-test-flagship-0-2-39';

        const storage = new InMemoryStorageProvider();
        const alice = new LocalIdentityProvider(storage);
        alice.login('alice');
        const aliceAvatarProfileUseCase = new AvatarProfileUseCase(storage, alice, registry);
        aliceAvatarProfileUseCase.updateProfile({ templateId: 'humanoid-01', displayName: 'Alice' });
        const aliceProfile = aliceAvatarProfileUseCase.getProfile();
        const aliceAvatarPresenceSession = new AvatarPresenceSession(aliceProfile, { position: { x: 0, y: 0, z: 0 } });
        const aliceBroadcastProvider = new LocalAvatarPresenceBroadcastProvider(channelName);

        const brickRegistry = new CreateBrickRegistryUseCase().execute();
        const contentStore = new LocalContentStore(storage);
        const publisher = new LocalPublisherProvider(storage, contentStore);
        const discoveryProvider = new LocalDiscoveryProvider(storage);
        const spatialIndexProvider = new LocalSpatialIndexProvider(storage);
        const placementRegistry = new LocalPlacementRegistry(storage, spatialIndexProvider);
        const worldLayoutProvider = new LocalWorldLayoutProvider(spatialIndexProvider, discoveryProvider);
        const loadPublicationDocumentUseCase = new LoadPublicationDocumentUseCase(storage);
        const saveDocumentUseCase = new SaveDocumentUseCase(storage);
        const placePublicationUseCase = new PlacePublicationUseCase(
            spatialIndexProvider, discoveryProvider, loadPublicationDocumentUseCase, brickRegistry, placementRegistry, alice
        );
        const publishDocumentUseCase = new PublishDocumentUseCase(publisher, alice, placePublicationUseCase, new GridPlacementStrategy());
        const world = new World();
        const building = new Building({ creator: 'alice' });
        building.addBrick(new Brick({ definitionId: 'core:cube', position: new Position(0, 0.5, 0) }));
        world.addBuilding(building);
        const document = new Document({ world, metadata: new DocumentMetadata({ title: 'Flagship Interaction Castle', author: 'alice', license: new License({ id: LicenseId.CC0_1_0 }) }) });
        const publication = publishDocumentUseCase.execute({ document });
        const brickId = building.getBricks()[0].id;

        const placementBefore = placementRegistry.findByPublicationId(publication.id)[0];
        const placementJsonBefore = JSON.stringify(placementBefore.toJSON());
        const spatialCountBefore = spatialIndexProvider.discover({ x: 0, y: 0, z: 0 }, 100000).length;
        const aliceProfileJsonBefore = JSON.stringify(aliceAvatarProfileUseCase.getProfile().toJSON());

        // Alice: full session, publishing presence as she moves.
        const aliceSession = new WorldNavigationSession({
            registry: brickRegistry, loadPublicationDocumentUseCase, worldLayoutProvider,
            identityProvider: alice, discoveryProvider, placementRegistry,
            avatarProfileUseCase: aliceAvatarProfileUseCase, avatarPresenceSession: aliceAvatarPresenceSession,
            presenceBroadcastProvider: aliceBroadcastProvider, avatarTemplateRegistry: registry
        });
        const aliceFacade = scriptableRenderFacade();
        aliceSession._session = aliceFacade;
        aliceSession._setupRemoteAvatars();
        aliceSession._setupLocalAvatar();

        // Bob: a SEPARATE user who can both watch presence AND edit
        // Alice's published world — needs the full document-editing
        // stack (unlike 0.2.37/0.2.38's presence-only Bob), plus a
        // scriptable render facade so each click can be driven
        // deterministically through the REAL pick() priority logic.
        const bob = new LocalIdentityProvider(new InMemoryStorageProvider());
        bob.login('bob');
        const bobBroadcastProvider = new LocalAvatarPresenceBroadcastProvider(channelName);
        const bobSession = new WorldNavigationSession({
            registry: brickRegistry, loadPublicationDocumentUseCase, worldLayoutProvider,
            saveDocumentUseCase, publishDocumentUseCase, identityProvider: bob,
            documentCloneService: new DocumentCloneService(), discoveryProvider, placementRegistry,
            presenceBroadcastProvider: bobBroadcastProvider, avatarTemplateRegistry: registry
        });
        const bobFacade = scriptableRenderFacade();
        bobSession._session = bobFacade;
        bobSession._setupRemoteAvatars();
        bobSession._loadWorld(publication.documentId);
        assert(bobSession.hasLocalAvatar() === false, '65. FLAGSHIP: Bob has no avatar of his own — watching never requires having one');

        const bobPull = () => {
            const now = Date.now();
            const known = bobSession._presenceSyncService.pull(now);
            bobSession._remoteAvatarRegistry.sync(known, now);
            bobSession._remoteAvatarRegistry.tick(now);
            bobSession._pruneAvatarInteractionIfGone(known);
            return known;
        };

        // Alice moves -> presence -> Bob sees Alice.
        aliceAvatarPresenceSession.update({ position: { x: 5, y: 0, z: 5 } });
        await wait(80);
        bobPull();
        assert(bobSession._remoteAvatarRegistry.has(aliceProfile.avatarId), '66. FLAGSHIP: Bob synchronizes and now knows Alice\'s avatar');

        // Bob clicks Alice -> avatar target -> Avatar Info.
        bobFacade.scripted.pick = () => null;
        bobFacade.scripted.pickAvatar = () => ({ type: 'avatar', avatarId: aliceProfile.avatarId, isLocal: false, distance: 8 });
        bobSession.pick(150, 150);
        assert(bobSession.getAvatarInteraction().avatarId === aliceProfile.avatarId, "67. FLAGSHIP: Bob's click resolves to an avatar interaction target on Alice");
        const avatarInfo = bobSession.getAvatarInfo();
        assert(avatarInfo && avatarInfo.displayName === 'alice', '68. FLAGSHIP: Avatar Info resolves Alice\'s ownerIdentity');
        assert(avatarInfo.position.x === 5 && avatarInfo.position.z === 5, "69. FLAGSHIP: Avatar Info reflects Alice's real current position");
        assert(bobSession.getSpatialSelection().isEmpty, '70. FLAGSHIP: targeting Alice never touches SpatialSelectionState — see "Avatars Are Never Document Selection"');

        // Bob clicks Alice's building (a brick) -> brick selection,
        // avatar target cleared.
        bobFacade.scripted.pickAvatar = () => null;
        bobFacade.scripted.pick = () => ({
            type: 'brick', documentId: publication.documentId, buildingId: building.id, brickId,
            point: { x: 0, y: 0.5, z: 0 }, normal: { x: 0, y: 1, z: 0 }, distance: 12
        });
        bobSession.pick(200, 200);
        assert(bobSession.getAvatarInteraction().isEmpty, '71. FLAGSHIP: clicking the building clears the avatar interaction target');
        assert(bobSession.getSpatialSelection().brickId === brickId, "72. FLAGSHIP: the building's brick is now a genuine document selection");

        // Bob edits the World -> document forks (exactly 0.2.20's
        // fork-on-write boundary — never bypassed by avatar
        // interaction machinery). 0.5.9 retired moveSelection() from
        // WorldNavigationSession — and Bob deliberately has no avatar
        // of his own (assertion 65 above), so createLandmarkHere()
        // isn't available to him either. The fork trigger here is
        // updateDocumentMetadata() (unaffected, needs no avatar); the
        // brick move itself then executes directly against the fork's
        // own CommandHistory, same pattern as
        // tests/ForkRenderSync.test.js for the identical reason.
        const forkId = bobSession.updateDocumentMetadata(publication.documentId, { title: "Bob's Copy" });
        assert(forkId !== publication.documentId, '73. FLAGSHIP: exactly one NEW document exists — Bob\'s fork');
        assert(!bobSession.isDocumentPublished(publication.documentId), '74. FLAGSHIP: the published id is no longer tracked as published in Bob\'s session');
        assert(bobSession.getActiveDocumentId() === forkId, '74b. FLAGSHIP: Bob\'s active document switched to the fork');
        const forkDoc = bobSession.getDocument(forkId);
        assert(forkDoc.metadata.parentDocumentId === publication.documentId, '75. FLAGSHIP: fork provenance points at the original published document');

        const forkHistory = bobSession._commandHistories.get(forkId);
        const forkBuilding = forkDoc.world.getBuildings()[0];
        const forkBrickId = forkBuilding.getBricks()[0].id;
        forkHistory.execute(new MoveBrickCommand({
            worldId: forkId, buildingId: forkBuilding.id, brickId: forkBrickId, delta: { x: 3, y: 0, z: 0 }
        }));
        assert(forkDoc.world.getBuildings()[0].getBricks()[0].position.x === 3, '76. FLAGSHIP: the mutation landed on the fork');

        // Alice's avatar remains COMPLETELY unaffected throughout.
        assert(aliceAvatarPresenceSession.current.position.x === 5 && aliceAvatarPresenceSession.current.position.z === 5,
            "77. FLAGSHIP: Alice's own AvatarPresence is untouched by Bob's click-then-edit sequence");
        assert(JSON.stringify(aliceAvatarProfileUseCase.getProfile().toJSON()) === aliceProfileJsonBefore,
            "78. FLAGSHIP: Alice's AvatarProfile is byte-identical — never touched by Bob targeting or editing anything");
        assert(publisher.verifySnapshot(publication.id, publication.contentHash),
            "79. FLAGSHIP: Alice's original Publication still verifies against its own content hash");
        const placementAfter = placementRegistry.findByPublicationId(publication.id)[0];
        assert(JSON.stringify(placementAfter.toJSON()) === placementJsonBefore,
            '80. FLAGSHIP: the ORIGINAL Building Placement is byte-identical — Bob\'s fork is a separate document, not an edit in place');
        const spatialCountAfterAvatarClick = spatialIndexProvider.discover({ x: 0, y: 0, z: 0 }, 100000).length;
        assert(spatialCountAfterAvatarClick === spatialCountBefore,
            '81. FLAGSHIP: SpatialIndex is unaffected by avatar selection specifically (unchanged since before ANY of this scenario ran)');

        // Reloading the original published snapshot fresh (as any
        // other viewer would) resolves the ORIGINAL geometry.
        const reloaded = loadPublicationDocumentUseCase.execute(publication.documentId);
        assert(reloaded.world.getBuildings()[0].getBricks()[0].position.x === 0,
            '82. FLAGSHIP: the original published snapshot is verifiably unchanged, byte-for-byte');

        aliceSession.dispose();
        bobSession.dispose();
        aliceBroadcastProvider.dispose();
        bobBroadcastProvider.dispose();
    }

    console.log('✅ All World Entity Interaction & Selection tests passed.');
}

await runTests();
