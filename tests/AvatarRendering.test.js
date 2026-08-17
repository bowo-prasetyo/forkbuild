import * as THREE from 'three';
import { AvatarRenderer } from '../renderer/AvatarRenderer.js';
import { AvatarVisual } from '../renderer/AvatarVisual.js';
import { AvatarProfile } from '../core/AvatarProfile.js';
import { AvatarPresence } from '../core/AvatarPresence.js';
import { AvatarAnimationState } from '../core/AvatarAnimationState.js';
import { AvatarTemplateRegistry } from '../core/AvatarTemplateRegistry.js';
import { CoreAvatarTemplateLibrary } from '../core/library/CoreAvatarTemplateLibrary.js';
import { AvatarProfileUseCase } from '../application/AvatarProfileUseCase.js';
import { AvatarPresenceSession } from '../application/AvatarPresenceSession.js';
import { WorldNavigationSession } from '../application/WorldNavigationSession.js';
import { SpatialCameraController } from '../application/SpatialCameraController.js';
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
import { LoadPublicationDocumentUseCase } from '../application/LoadPublicationDocumentUseCase.js';
import { CreateBrickRegistryUseCase } from '../application/CreateBrickRegistryUseCase.js';
import { Document } from '../core/Document.js';
import { DocumentMetadata } from '../core/DocumentMetadata.js';
import { World } from '../core/World.js';
import { Building } from '../core/Building.js';
import { Brick } from '../core/Brick.js';
import { License, LicenseId } from '../core/License.js';

// 0.2.35 — Avatar Rendering & World Presence.
//
//   Section A: renderer/AvatarRenderer.js  — declarative -> Three.js
//   Section B: renderer/AvatarVisual.js    — diff/rebuild lifecycle
//   Section C: WorldNavigationSession integration (spy facade)
//   Section D: FLAGSHIP — the design doc's own scripted scenario
//   Section E: avatar spawn-near-document (0.2.35 follow-up)
//
// No real WebGL/<canvas> anywhere — AvatarRenderer/AvatarVisual build
// real THREE.Group/Mesh/Material objects (three's CPU-side scene
// graph needs no GPU context at all), and Section C bypasses
// WorldNavigationSession.start()'s real Renderer entirely by wiring a
// duck-typed spy facade directly onto session._session — the exact
// "real logic, fake low-level renderer" pattern
// tests/ForkRenderSync.test.js already established for WorldRenderer.

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

function buildRegistry() {
    const registry = new AvatarTemplateRegistry();
    registry.register(CoreAvatarTemplateLibrary);
    return registry;
}

function spyFacade() {
    const calls = { setLocalAvatar: [], updateLocalAvatarAppearance: [], updateLocalAvatarPresence: [], setLocalAvatarVisible: [], removeLocalAvatar: 0 };
    let cameraState = { position: { x: 10, y: 10, z: 10 }, target: { x: 0, y: 0, z: 0 }, zoom: 1 };
    return {
        calls,
        setLocalAvatar: (template, appearance, presence) => calls.setLocalAvatar.push({ template, appearance, presence }),
        updateLocalAvatarAppearance: (template, appearance) => calls.updateLocalAvatarAppearance.push({ template, appearance }),
        updateLocalAvatarPresence: (presence) => calls.updateLocalAvatarPresence.push({ presence }),
        setLocalAvatarVisible: (visible) => calls.setLocalAvatarVisible.push(visible),
        removeLocalAvatar: () => { calls.removeLocalAvatar++; },
        // Minimal stand-ins so WorldNavigationSession.focusDocument()
        // (the method under test in the spawn-near-document section
        // below) can run its full body — including
        // SpatialCameraController and updateSpatialView()'s streaming
        // load/unload — without a real Renderer/WebGL. Mirrors the
        // stub shape tests/ForkRenderSync.test.js already established
        // for exactly this "poke session._session directly" pattern.
        getCameraState: () => cameraState,
        setCameraState: (state) => { cameraState = state; },
        addWorld() {}, removeWorld() {}, clearSelection() {}, clearHover() {},
        selectBricks() {}, hoverBrick() {}, showPreview() {}, hidePreview() {},
        showGizmo() {}, hideGizmo() {},
        gizmoHitTest() { return true; }, gizmoPointerDown() { return false; },
        gizmoPointerMove() { return { consumed: false, hovered: false, feedback: null }; },
        gizmoPointerUp() { return { consumed: false, committed: false, feedback: null }; },
        gizmoKeyDown() { return false; },
        pick() { return null; }, pickGround() { return null; }, pickRectangle() { return []; },
        setControlsEnabled() {},
        dispose() {}
    };
}

async function runTests() {
    const registry = buildRegistry();
    const humanoid01 = registry.get('humanoid-01');
    const humanoid02 = registry.get('humanoid-02');

    // -------------------------------------------------------------
    // Section A — renderer/AvatarRenderer.js
    // -------------------------------------------------------------
    {
        const renderer = new AvatarRenderer();
        const { root, poseGroup } = renderer.build(humanoid01, humanoid01.defaultAppearance);
        assert(root instanceof THREE.Object3D, '1. build() returns a real THREE root object');
        const parts = poseGroup.userData.avatarParts;
        assert(parts.head, '2. a head is always built');
        assert(parts.hair && parts.torso && parts.legs, '3. hair/torso/legs are built when the template declares those components');
        assert(Object.keys(parts).filter((k) => k.startsWith('accessory:')).length === 0,
            '4. no accessory markers when defaultAppearance selects none');
    }

    {
        const renderer = new AvatarRenderer();
        const { poseGroup } = renderer.build(humanoid01, { ...humanoid01.defaultAppearance, skin: 'skin-06' });
        const head = poseGroup.userData.avatarParts.head;
        assert(head.material.color.getHexString() === '4a2c17', '5. the selected skin option maps to its own distinct color');
    }

    {
        // Missing/unrecognized skin falls back to a default color
        // rather than an undefined/black material.
        const renderer = new AvatarRenderer();
        const { poseGroup } = renderer.build(humanoid01, {});
        const head = poseGroup.userData.avatarParts.head;
        assert(head.material.color.getHexString() === 'e0ac69', '6. an appearance missing skin entirely still renders a sensible default head color');
    }

    {
        const renderer = new AvatarRenderer();
        const { poseGroup } = renderer.build(humanoid01, {
            ...humanoid01.defaultAppearance,
            accessories: ['glasses-01', 'hat-01', 'scarf-01', 'backpack-01']
        });
        const parts = poseGroup.userData.avatarParts;
        assert(parts['accessory:glasses-01'] && parts['accessory:hat-01'] && parts['accessory:scarf-01'] && parts['accessory:backpack-01'],
            '7. one mesh per selected accessory, keyed by its own id');

        // 0.2.35 follow-up: each accessory type gets its OWN geometry
        // and position — glasses on the face, a hat on the head, a
        // scarf at the neck, a backpack on the back — not the same
        // generic marker repeated for every selection.
        const glasses = parts['accessory:glasses-01'];
        const hat = parts['accessory:hat-01'];
        const scarf = parts['accessory:scarf-01'];
        const backpack = parts['accessory:backpack-01'];
        const geometryTypes = new Set([glasses, hat, scarf, backpack].map((mesh) => mesh.geometry.type));
        assert(geometryTypes.size === 4, '7a. each accessory type renders as its own distinct geometry, not a shared generic marker');
        assert(glasses.position.z > 0, '7b. glasses sit at the front of the face');
        assert(hat.position.y > glasses.position.y, '7c. a hat sits above the head, higher than the glasses');
        assert(Math.abs(scarf.position.y - glasses.position.y) < 0.4 && scarf.position.y < hat.position.y,
            '7d. a scarf sits around the neck, between the head and the torso');
        assert(backpack.position.z < 0, '7e. a backpack sits against the back, opposite the glasses');
    }

    {
        // A template could in principle declare an accessory option id
        // this renderer has no bespoke shape for yet (e.g. a future
        // core/ addition landing before its geometry does) — that must
        // degrade to SOME visible marker, never throw or render
        // nothing.
        const renderer = new AvatarRenderer();
        const { poseGroup } = renderer.build(humanoid01, { ...humanoid01.defaultAppearance, accessories: ['mystery-99'] });
        const unknown = poseGroup.userData.avatarParts['accessory:mystery-99'];
        assert(unknown && unknown.geometry, '7f. an unrecognized accessory id still renders a fallback marker instead of throwing');
    }

    {
        // Template-driven, not hardcoded — humanoid-02 has the SAME
        // component names but a genuinely different, smaller template;
        // AvatarRenderer must not assume humanoid-01's exact shape.
        const renderer = new AvatarRenderer();
        const { poseGroup } = renderer.build(humanoid02, humanoid02.defaultAppearance);
        assert(poseGroup.userData.avatarParts.hair, '8. humanoid-02 still renders its own declared components correctly');
    }

    {
        const renderer = new AvatarRenderer();
        const { poseGroup } = renderer.build(humanoid01, humanoid01.defaultAppearance);
        renderer.applyPose(poseGroup, AvatarAnimationState.JUMPING);
        assert(poseGroup.position.y > 0, '9. JUMPING lifts the poseGroup (hopHeight applied)');
        renderer.applyPose(poseGroup, AvatarAnimationState.IDLE);
        assert(poseGroup.position.y === 0, '10. switching back to IDLE returns to neutral (no leftover offset)');
    }

    // -------------------------------------------------------------
    // Section B — renderer/AvatarVisual.js
    // -------------------------------------------------------------
    {
        const visual = new AvatarVisual(new AvatarRenderer());
        visual.setAppearance(humanoid01, { ...humanoid01.defaultAppearance });
        const firstPoseGroup = visual._poseGroup;
        visual.setAppearance(humanoid01, { ...humanoid01.defaultAppearance }); // a FRESH object, same content
        assert(visual._poseGroup === firstPoseGroup, '11. an equal-content appearance never rebuilds the mesh graph (identity preserved)');
    }

    {
        const visual = new AvatarVisual(new AvatarRenderer());
        visual.setAppearance(humanoid01, { ...humanoid01.defaultAppearance });
        const firstPoseGroup = visual._poseGroup;
        visual.setAppearance(humanoid01, { ...humanoid01.defaultAppearance, skin: 'skin-05' });
        assert(visual._poseGroup !== firstPoseGroup, '12. a genuinely different appearance DOES rebuild');
    }

    {
        const visual = new AvatarVisual(new AvatarRenderer());
        visual.setAppearance(humanoid01, humanoid01.defaultAppearance);
        const poseGroupBefore = visual._poseGroup;
        visual.setPose({ x: 5, y: 0, z: 10 }, { x: 0, y: 90, z: 0 });
        assert(visual.root.position.x === 5 && visual.root.position.z === 10, '13. setPose moves the root to the given world position');
        assert(visual._poseGroup === poseGroupBefore, '14. setPose never rebuilds the mesh graph');
    }

    {
        const visual = new AvatarVisual(new AvatarRenderer());
        visual.setAppearance(humanoid01, humanoid01.defaultAppearance);
        const poseGroupBefore = visual._poseGroup;
        visual.setAnimation(AvatarAnimationState.RUNNING);
        assert(visual._poseGroup === poseGroupBefore, '15. setAnimation never rebuilds the mesh graph either');
        assert(visual._poseGroup.userData.avatarParts.legs.rotation.x !== 0, '16. ...but it DOES actually change the pose');
    }

    {
        const visual = new AvatarVisual(new AvatarRenderer());
        visual.setAppearance(humanoid01, humanoid01.defaultAppearance);
        visual.dispose();
        assert(visual._poseGroup === null, '17. dispose() clears the pose group');
    }

    // -------------------------------------------------------------
    // Section C — WorldNavigationSession integration
    // -------------------------------------------------------------
    function buildAvatarStack(username) {
        const storage = new InMemoryStorageProvider();
        const identityProvider = new LocalIdentityProvider(storage);
        identityProvider.login(username);
        const avatarProfileUseCase = new AvatarProfileUseCase(storage, identityProvider, registry);
        const profile = avatarProfileUseCase.getProfile();
        const avatarPresenceSession = new AvatarPresenceSession(profile);
        return { storage, identityProvider, avatarProfileUseCase, avatarPresenceSession };
    }

    {
        const session = new WorldNavigationSession({ registry: new CreateBrickRegistryUseCase().execute(), loadPublicationDocumentUseCase: null, worldLayoutProvider: null });
        assert(session.hasLocalAvatar() === false, '18. a session built with no avatar collaborators reports hasLocalAvatar() false');
    }

    {
        const { avatarProfileUseCase, avatarPresenceSession } = buildAvatarStack('alice');
        const session = new WorldNavigationSession({
            registry: new CreateBrickRegistryUseCase().execute(),
            loadPublicationDocumentUseCase: null,
            worldLayoutProvider: null,
            avatarProfileUseCase,
            avatarPresenceSession
        });
        const facade = spyFacade();
        session._session = facade;
        session._setupLocalAvatar();

        assert(session.hasLocalAvatar() === true, '19. a session built WITH avatar collaborators reports hasLocalAvatar() true');
        assert(facade.calls.setLocalAvatar.length === 1, '20. exactly one initial setLocalAvatar call on setup');
        const initial = facade.calls.setLocalAvatar[0];
        assert(initial.presence.position.x === 0 && initial.presence.position.y === 0 && initial.presence.position.z === 0,
            '21. avatar exists at presence.position — a fresh presence starts at the origin');
        assert(initial.template.templateId === avatarProfileUseCase.getProfile().templateId,
            '22. the initial call carries the profile\'s own template');

        // Profile change -> appearance update only (not a full setLocalAvatar).
        avatarProfileUseCase.updateProfile({ displayName: 'Alice W.', appearance: { ...initial.template.defaultAppearance, skin: 'skin-04' } });
        assert(facade.calls.updateLocalAvatarAppearance.length === 1, '23. changing the profile calls updateLocalAvatarAppearance exactly once');
        assert(facade.calls.updateLocalAvatarAppearance[0].appearance.skin === 'skin-04', '24. ...with the newly-effective appearance');
        assert(facade.calls.setLocalAvatar.length === 1, '25. it does NOT call setLocalAvatar again (no unnecessary full re-init)');

        // Presence change -> presence update only.
        avatarPresenceSession.update({ position: { x: 12, y: 0, z: -4 } });
        assert(facade.calls.updateLocalAvatarPresence.length === 1, '26. changing presence calls updateLocalAvatarPresence exactly once');
        assert(facade.calls.updateLocalAvatarPresence[0].presence.position.x === 12, '27. ...with the new position');

        // Visibility is a pure passthrough. _setupLocalAvatar() already
        // synced the facade with the default (visible) state once, so
        // this toggle is the SECOND call, not the first.
        session.setLocalAvatarVisible(false);
        assert(facade.calls.setLocalAvatarVisible.at(-1) === false, '28. setLocalAvatarVisible passes straight through to the facade');
        assert(session.isLocalAvatarVisible() === false, '29. isLocalAvatarVisible reflects the change');

        // dispose() actually unsubscribes.
        const appearanceCallsBeforeDispose = facade.calls.updateLocalAvatarAppearance.length;
        session._session = facade; // dispose() would null this; keep the SAME facade to observe post-dispose (no) calls
        const unsubscribeProfile = session._avatarProfileSubscription;
        const unsubscribePresence = session._avatarPresenceSubscription;
        assert(typeof unsubscribeProfile === 'function' && typeof unsubscribePresence === 'function', '30. dispose-able subscriptions exist before dispose()');
        session.dispose();
        avatarProfileUseCase.updateProfile({ displayName: 'Should Not Propagate' });
        assert(facade.calls.updateLocalAvatarAppearance.length === appearanceCallsBeforeDispose,
            '31. after dispose(), a profile change no longer reaches the (now-torn-down) facade');
    }

    // -------------------------------------------------------------
    // Section D — FLAGSHIP: the design doc's own scripted scenario
    // -------------------------------------------------------------
    {
        const storage = new InMemoryStorageProvider();
        const alice = new LocalIdentityProvider(storage);
        alice.login('alice');

        // Create AvatarProfile, customize appearance.
        const avatarProfileUseCase = new AvatarProfileUseCase(storage, alice, registry);
        avatarProfileUseCase.updateProfile({
            templateId: 'humanoid-01',
            appearance: { skin: 'skin-02', hair: 'hair-08', hairColor: '#222222', shirt: 'shirt-03', shirtColor: '#00aa00', pants: 'pants-02', pantsColor: '#111111', accessories: ['hat-01'] },
            displayName: 'Alice'
        });

        // Create AvatarPresence.
        const profile = avatarProfileUseCase.getProfile();
        const avatarPresenceSession = new AvatarPresenceSession(profile, { position: { x: 3, y: 0, z: 3 } });

        // Also publish and place a REAL document, so we have a real
        // WorldPlacement/PlacementRecord to prove stays untouched.
        const brickRegistry = new CreateBrickRegistryUseCase().execute();
        const contentStore = new LocalContentStore(storage);
        const publisher = new LocalPublisherProvider(storage, contentStore);
        const discoveryProvider = new LocalDiscoveryProvider(storage);
        const spatialIndexProvider = new LocalSpatialIndexProvider(storage);
        const placementRegistry = new LocalPlacementRegistry(storage, spatialIndexProvider);
        const loadPublicationDocumentUseCase = new LoadPublicationDocumentUseCase(storage);
        const placePublicationUseCase = new PlacePublicationUseCase(
            spatialIndexProvider, discoveryProvider, loadPublicationDocumentUseCase, brickRegistry, placementRegistry, alice
        );
        const publishDocumentUseCase = new PublishDocumentUseCase(publisher, alice, placePublicationUseCase, new GridPlacementStrategy());

        const world = new World();
        const building = new Building({ creator: 'alice' });
        building.addBrick(new Brick({ definitionId: 'core:cube' }));
        world.addBuilding(building);
        const document = new Document({ world, metadata: new DocumentMetadata({ title: 'Castle', author: 'alice', license: new License({ id: LicenseId.CC0_1_0 }) }) });
        const publication = publishDocumentUseCase.execute({ document });

        const placementBefore = placementRegistry.findByPublicationId(publication.id)[0];
        const placementJsonBefore = JSON.stringify(placementBefore.toJSON());
        const spatialAddCallsBefore = spatialIndexProvider.discover({ x: 0, y: 0, z: 0 }, 100000).length;
        const documentKeysBefore = storage.list().filter((k) => k.startsWith('document:')).length;

        // "Render World View" — wire the session with a spy facade,
        // exactly the way the real one would be wired via
        // CreateWorldViewUseCase, minus the real WebGL.
        const session = new WorldNavigationSession({
            registry: brickRegistry, loadPublicationDocumentUseCase, worldLayoutProvider: new LocalWorldLayoutProvider(spatialIndexProvider, discoveryProvider),
            identityProvider: alice, discoveryProvider, placementRegistry,
            avatarProfileUseCase, avatarPresenceSession
        });
        const facade = spyFacade();
        session._session = facade;
        session._setupLocalAvatar();

        // Avatar exists at presence.position.
        const initialCall = facade.calls.setLocalAvatar[0];
        assert(initialCall.presence.position.x === 3 && initialCall.presence.position.z === 3, '32. FLAGSHIP: avatar renders at the presence position');
        assert(initialCall.appearance.hair === 'hair-08', '33. FLAGSHIP: avatar renders the customized appearance');

        // Change profile -> avatar appearance changes.
        avatarProfileUseCase.updateProfile({ appearance: { ...avatarProfileUseCase.getProfile().appearance, shirtColor: '#ff0000' } });
        const lastAppearanceCall = facade.calls.updateLocalAvatarAppearance.at(-1);
        assert(lastAppearanceCall.appearance.shirtColor === '#ff0000', '34. FLAGSHIP: changing the profile changes the rendered appearance');

        // Change presence -> avatar moves.
        avatarPresenceSession.update({ position: { x: 50, y: 0, z: 50 } });
        const lastPresenceCall = facade.calls.updateLocalAvatarPresence.at(-1);
        assert(lastPresenceCall.presence.position.x === 50, '35. FLAGSHIP: changing presence moves the avatar');

        // Document placements remain untouched.
        const placementAfter = placementRegistry.findByPublicationId(publication.id)[0];
        assert(JSON.stringify(placementAfter.toJSON()) === placementJsonBefore, '36. FLAGSHIP: the document\'s WorldPlacement/PlacementRecord is byte-identical after all avatar activity');
        const spatialAddCallsAfter = spatialIndexProvider.discover({ x: 0, y: 0, z: 0 }, 100000).length;
        assert(spatialAddCallsAfter === spatialAddCallsBefore, '37. no avatar activity added anything to the spatial index');
        const documentKeysAfter = storage.list().filter((k) => k.startsWith('document:')).length;
        assert(documentKeysAfter === documentKeysBefore, '38. no avatar is ever created as a Document');

        // IDLE/WALKING/etc. map to valid visual states (no throw, and
        // each is genuinely a different pose from IDLE except IDLE
        // itself).
        const visual = new AvatarVisual(new AvatarRenderer());
        visual.setAppearance(registry.get('humanoid-01'), registry.get('humanoid-01').defaultAppearance);
        for (const animation of Object.values(AvatarAnimationState)) {
            let threw = false;
            try { visual.setAnimation(animation); } catch (e) { threw = true; }
            assert(!threw, `39. animation state "${animation}" maps to a valid visual state without throwing`);
        }

        // Avatar "survives World View refresh" — calling setPose/
        // setAnimation repeatedly with the SAME values never rebuilds
        // or removes the mesh graph.
        const poseGroupRef = visual._poseGroup;
        visual.setPose({ x: 1, y: 0, z: 1 }, { x: 0, y: 0, z: 0 });
        visual.setPose({ x: 1, y: 0, z: 1 }, { x: 0, y: 0, z: 0 });
        assert(visual._poseGroup === poseGroupRef, '40. repeated identical pose/appearance updates never tear down and rebuild the visual');
    }

    // -------------------------------------------------------------
    // Section E — 0.2.35 follow-up: a fresh avatar spawns near the
    // document a World View session first navigates to, instead of
    // always at literal world origin regardless of what's on screen.
    // -------------------------------------------------------------
    {
        const storage = new InMemoryStorageProvider();
        const alice = new LocalIdentityProvider(storage);
        alice.login('alice');
        const avatarProfileUseCase = new AvatarProfileUseCase(storage, alice, registry);
        const profile = avatarProfileUseCase.getProfile();
        const avatarPresenceSession = new AvatarPresenceSession(profile); // NOT pre-seeded — starts at the origin, sequence 0

        const brickRegistry = new CreateBrickRegistryUseCase().execute();
        const contentStore = new LocalContentStore(storage);
        const publisher = new LocalPublisherProvider(storage, contentStore);
        const discoveryProvider = new LocalDiscoveryProvider(storage);
        const spatialIndexProvider = new LocalSpatialIndexProvider(storage);
        const placementRegistry = new LocalPlacementRegistry(storage, spatialIndexProvider);
        const worldLayoutProvider = new LocalWorldLayoutProvider(spatialIndexProvider, discoveryProvider);
        const loadPublicationDocumentUseCase = new LoadPublicationDocumentUseCase(storage);
        const placePublicationUseCase = new PlacePublicationUseCase(
            spatialIndexProvider, discoveryProvider, loadPublicationDocumentUseCase, brickRegistry, placementRegistry, alice
        );
        const publishDocumentUseCase = new PublishDocumentUseCase(publisher, alice, placePublicationUseCase, new GridPlacementStrategy());

        const world = new World();
        const building = new Building({ creator: 'alice' });
        building.addBrick(new Brick({ definitionId: 'core:cube' }));
        world.addBuilding(building);
        const document = new Document({ world, metadata: new DocumentMetadata({ title: 'Lighthouse', author: 'alice', license: new License({ id: LicenseId.CC0_1_0 }) }) });
        const publication = publishDocumentUseCase.execute({ document });
        const documentPos = worldLayoutProvider.getPosition(publication.documentId);

        const session = new WorldNavigationSession({
            registry: brickRegistry, loadPublicationDocumentUseCase, worldLayoutProvider,
            identityProvider: alice, discoveryProvider, placementRegistry,
            avatarProfileUseCase, avatarPresenceSession
        });
        // Bypasses session.start() (needs a real Renderer/WebGL) —
        // wires exactly what start() would have, against the spy
        // facade, matching Section C's own established pattern.
        session._session = spyFacade();
        session._spatialCameraController = new SpatialCameraController(session._session);
        session._setupLocalAvatar();

        assert(avatarPresenceSession.current.position.x === 0 && avatarPresenceSession.current.position.z === 0,
            "41. before any navigation, a fresh avatar is still at the origin");

        session.focusDocument(publication.documentId); // the same call navigateToDocument() makes

        assert(avatarPresenceSession.current.sequence === 1, '42. the first focusDocument() call repositions the (still-untouched) avatar exactly once');
        assert(
            avatarPresenceSession.current.position.x === documentPos.x + 3
            && avatarPresenceSession.current.position.z === documentPos.z + 3,
            '43. the avatar spawns at the focused document\'s own position, offset so it doesn\'t sit inside the document\'s geometry'
        );
        const presenceCallsAfterFirstFocus = session._session.calls.updateLocalAvatarPresence.length;
        assert(presenceCallsAfterFirstFocus >= 1, '44. the reposition actually propagated to the render facade');

        // A second focusDocument() call (e.g. a later search result, or
        // simply re-focusing the same document) must NOT move the
        // avatar again — only the FIRST ever focus repositions it.
        session.focusDocument(publication.documentId);
        assert(avatarPresenceSession.current.sequence === 1, '45. a second focusDocument() call does not move an already-spawned avatar');
        assert(session._session.calls.updateLocalAvatarPresence.length === presenceCallsAfterFirstFocus,
            '46. ...and does not send a redundant presence update to the facade either');
    }

    console.log('✅ All Avatar Rendering tests passed.');
}

// Top-level await, not the fire-and-forget `runTests().catch(...)`
// most other files in this suite use — see 0.2.32's own note on
// tests/PreviewService.test.js for the original discovery of this
// gap (tests.html's `await import(file)` only waits for a module's
// SYNCHRONOUS top-level evaluation). Empirically, this file showed
// the same symptom (a failing assertion counted as "passed" by the
// runner, surfacing only as a late, out-of-order console error) even
// though nothing here uses a real macrotask (no requestIdleCallback/
// setTimeout) — dynamic import()'s own promise settles after
// additional internal microtask hops beyond a plain `.then()`/
// `.catch()` chain, so a same-tick rejection is not actually
// guaranteed to be observed before the import resolves. Top-level
// await sidesteps the ambiguity entirely by making import() itself
// the thing that waits.
await runTests();
