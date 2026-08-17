import { toAvatarPresenceAdvertisement, isValidAvatarPresenceAdvertisement } from '../core/AvatarPresenceAdvertisement.js';
import { PresenceLifecycleState, isValidPresenceLifecycleState } from '../core/PresenceLifecycleState.js';
import { derivePresenceLifecycleState } from '../core/PresenceFreshness.js';
import { resolveIncomingPresence } from '../core/PresenceIngestion.js';
import { interpolatePresence } from '../core/PresenceInterpolation.js';
import { LocalPresenceStore } from '../application/LocalPresenceStore.js';
import { PresenceSyncService } from '../application/PresenceSyncService.js';
import { RemoteAvatarInterpolator } from '../application/RemoteAvatarInterpolator.js';
import { RemoteAvatarRegistry } from '../application/RemoteAvatarRegistry.js';
import { LocalAvatarPresenceBroadcastProvider } from '../presence/LocalAvatarPresenceBroadcastProvider.js';
import { AvatarPresence } from '../core/AvatarPresence.js';
import { AvatarAnimationState } from '../core/AvatarAnimationState.js';
import { AvatarTemplateRegistry } from '../core/AvatarTemplateRegistry.js';
import { CoreAvatarTemplateLibrary } from '../core/library/CoreAvatarTemplateLibrary.js';
import { AvatarProfileUseCase } from '../application/AvatarProfileUseCase.js';
import { AvatarPresenceSession } from '../application/AvatarPresenceSession.js';
import { WorldNavigationSession } from '../application/WorldNavigationSession.js';
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

// 0.2.37 — Decentralized Avatar Presence Synchronization.
//
//   Section A: core/AvatarPresenceAdvertisement — wire shape
//   Section B: core/PresenceLifecycleState + PresenceFreshness — derived staleness
//   Section C: core/PresenceIngestion — sequence-tolerant acceptance
//   Section D: core/PresenceInterpolation — pure visual smoothing math
//   Section E: application/LocalPresenceStore — ingestion boundary
//   Section F: application/PresenceSyncService — advertise/pull
//   Section G: application/RemoteAvatarInterpolator
//   Section H: application/RemoteAvatarRegistry (spy facade)
//   Section I: presence/LocalAvatarPresenceBroadcastProvider — REAL BroadcastChannel
//   Section J: WorldNavigationSession integration (spy facade, two replicas)
//   Section K: FLAGSHIP — the design doc's own scripted scenario
//
// Sections A-H are entirely deterministic (an explicit `now` is always
// passed, never a real Date.now()/setTimeout wait). Sections I, J, and
// K are the first tests in this codebase to exercise a REAL browser
// transport (BroadcastChannel) — message delivery is asynchronous, so
// those sections `await` a short, real delay after advertise() before
// asserting delivery. Everything else about timing (staleness,
// expiry) still uses injected `now` values so no test ever waits out
// a real multi-second timeout.

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

function buildAvatarStack(registry, username) {
    const storage = new InMemoryStorageProvider();
    const identityProvider = new LocalIdentityProvider(storage);
    identityProvider.login(username);
    const avatarProfileUseCase = new AvatarProfileUseCase(storage, identityProvider, registry);
    const profile = avatarProfileUseCase.getProfile();
    const avatarPresenceSession = new AvatarPresenceSession(profile);
    return { storage, identityProvider, avatarProfileUseCase, avatarPresenceSession };
}

function spyRenderFacade() {
    const calls = {
        setLocalAvatar: [], updateLocalAvatarAppearance: [], updateLocalAvatarPresence: [], setLocalAvatarVisible: [], removeLocalAvatar: 0,
        setRemoteAvatar: [], updateRemoteAvatarPresence: [], removeRemoteAvatar: [], setRemoteAvatarsVisible: [],
        onAnimationFrameCallbacks: []
    };
    let cameraState = { position: { x: 10, y: 10, z: 10 }, target: { x: 0, y: 0, z: 0 }, zoom: 1 };
    return {
        calls,
        setLocalAvatar: (template, appearance, presence) => calls.setLocalAvatar.push({ template, appearance, presence }),
        updateLocalAvatarAppearance: (template, appearance) => calls.updateLocalAvatarAppearance.push({ template, appearance }),
        updateLocalAvatarPresence: (presence) => calls.updateLocalAvatarPresence.push({ presence }),
        setLocalAvatarVisible: (visible) => calls.setLocalAvatarVisible.push(visible),
        removeLocalAvatar: () => { calls.removeLocalAvatar++; },
        setRemoteAvatar: (avatarId, template, appearance, presenceLike) => calls.setRemoteAvatar.push({ avatarId, template, appearance, presenceLike }),
        updateRemoteAvatarPresence: (avatarId, presenceLike) => calls.updateRemoteAvatarPresence.push({ avatarId, presenceLike }),
        removeRemoteAvatar: (avatarId) => calls.removeRemoteAvatar.push(avatarId),
        setRemoteAvatarsVisible: (visible) => calls.setRemoteAvatarsVisible.push(visible),
        onAnimationFrame: (callback) => { calls.onAnimationFrameCallbacks.push(callback); return () => {}; },
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

function makeAdvertisement(overrides = {}) {
    return {
        avatarId: 'avatar-1',
        ownerIdentity: 'alice',
        position: { x: 0, y: 0, z: 0 },
        rotation: { x: 0, y: 0, z: 0 },
        animation: AvatarAnimationState.IDLE,
        sequence: 1,
        ...overrides
    };
}

async function runTests() {
    const registry = buildRegistry();

    // -------------------------------------------------------------
    // Section A — core/AvatarPresenceAdvertisement
    // -------------------------------------------------------------
    {
        const profile = { avatarId: 'a1', ownerIdentity: 'alice' };
        const presence = new AvatarPresence({ avatarId: profile.avatarId, ownerIdentity: profile.ownerIdentity, position: { x: 1, y: 2, z: 3 }, rotation: { y: 45 }, animation: AvatarAnimationState.WALKING, sequence: 7 });
        const ad = toAvatarPresenceAdvertisement(presence);
        assert(ad.avatarId === 'a1' && ad.ownerIdentity === 'alice', '1. advertisement carries avatarId/ownerIdentity');
        assert(ad.position.x === 1 && ad.position.y === 2 && ad.position.z === 3, '2. advertisement carries position');
        assert(ad.rotation.y === 45, '3. advertisement carries rotation');
        assert(ad.animation === AvatarAnimationState.WALKING && ad.sequence === 7, '4. advertisement carries animation/sequence');
        assert(!('timestamp' in ad), "5. advertisement deliberately omits timestamp — freshness is the receiver's own clock, never the sender's claim");
    }
    {
        assert(isValidAvatarPresenceAdvertisement(makeAdvertisement()) === true, '6. a well-formed advertisement is valid');
        assert(isValidAvatarPresenceAdvertisement(null) === false, '7. null is never valid');
        assert(isValidAvatarPresenceAdvertisement({ ...makeAdvertisement(), avatarId: '' }) === false, '8. an empty avatarId is never valid');
        assert(isValidAvatarPresenceAdvertisement({ ...makeAdvertisement(), position: { x: NaN, y: 0, z: 0 } }) === false, '9. a non-finite position is never valid');
        assert(isValidAvatarPresenceAdvertisement({ ...makeAdvertisement(), sequence: 'not-a-number' }) === false, '10. a non-numeric sequence is never valid');
    }

    // -------------------------------------------------------------
    // Section B — core/PresenceLifecycleState + PresenceFreshness
    // -------------------------------------------------------------
    {
        assert(isValidPresenceLifecycleState(PresenceLifecycleState.PRESENT), '11. PRESENT is a valid lifecycle state');
        assert(isValidPresenceLifecycleState('made-up') === false, '12. an unrecognized value is never a valid lifecycle state');
    }
    {
        const receivedAt = 1000;
        const state = derivePresenceLifecycleState({ receivedAt, now: 1000, staleAfterMs: 500, absentAfterMs: 2000 });
        assert(state === PresenceLifecycleState.PRESENT, '13. zero elapsed time is PRESENT');
    }
    {
        const state = derivePresenceLifecycleState({ receivedAt: 1000, now: 1600, staleAfterMs: 500, absentAfterMs: 2000 });
        assert(state === PresenceLifecycleState.STALE, '14. elapsed time past staleAfterMs (but under absentAfterMs) is STALE');
    }
    {
        const state = derivePresenceLifecycleState({ receivedAt: 1000, now: 3500, staleAfterMs: 500, absentAfterMs: 2000 });
        assert(state === PresenceLifecycleState.ABSENT, '15. elapsed time past absentAfterMs is ABSENT');
    }
    {
        const state = derivePresenceLifecycleState({ receivedAt: 1000, now: 900, staleAfterMs: 500, absentAfterMs: 2000 });
        assert(state === PresenceLifecycleState.PRESENT, '16. negative/garbage elapsed time degrades to PRESENT rather than crashing or misjudging absence');
    }

    // -------------------------------------------------------------
    // Section C — core/PresenceIngestion (sequence tolerance)
    // -------------------------------------------------------------
    {
        // The design doc's own tolerance script: 50, 52, 51, duplicate
        // 52, missing 53 — the highest sequence seen always wins, and
        // nothing about disorder or gaps needs special-casing.
        let current = null;
        const accept = (seq) => {
            const incoming = makeAdvertisement({ sequence: seq });
            const decision = resolveIncomingPresence(current, incoming);
            if (decision.accepted) current = incoming;
            return decision.accepted;
        };
        assert(accept(50) === true, '17. sequence 50 accepted (nothing stored yet)');
        assert(accept(52) === true, '18. sequence 52 accepted (52 > 50)');
        assert(accept(51) === false, '19. sequence 51 rejected (51 <= 52 already stored — reordered)');
        assert(accept(52) === false, '20. duplicate sequence 52 rejected');
        assert(current.sequence === 52, '21. the stored sequence is still 52 after all the above (53 never arrived, and nothing broke waiting for it)');
        assert(accept(54) === true, '22. sequence 54 accepted once it does arrive, unaffected by the earlier gap at 53');
    }
    {
        const decision = resolveIncomingPresence(null, { ...makeAdvertisement(), sequence: 'nope' });
        assert(decision.accepted === false, '23. a non-numeric sequence is rejected outright, even with nothing stored yet');
    }

    // -------------------------------------------------------------
    // Section D — core/PresenceInterpolation
    // -------------------------------------------------------------
    {
        const from = { position: { x: 0, y: 0, z: 0 }, rotation: { y: 0 }, animation: AvatarAnimationState.WALKING };
        const to = { position: { x: 10, y: 0, z: 20 }, rotation: { y: 0 }, animation: AvatarAnimationState.WALKING };
        const mid = interpolatePresence(from, to, 0.5);
        assert(mid.position.x === 5 && mid.position.z === 10, '24. t=0.5 is exactly halfway between from and to');
        assert(interpolatePresence(from, to, 0).position.x === 0, '25. t=0 reproduces "from" exactly');
        assert(interpolatePresence(from, to, 1).position.x === 10, '26. t=1 reproduces "to" exactly');
        assert(interpolatePresence(from, to, 5).position.x === 10, '27. t beyond 1 is clamped, never overshoots');
        assert(interpolatePresence(from, to, -5).position.x === 0, '28. t below 0 is clamped, never undershoots');
    }
    {
        // Shortest-arc rotation: 350deg -> 10deg should turn by +20,
        // never spin the long way around through -340.
        const from = { position: { x: 0, y: 0, z: 0 }, rotation: { y: 350 } };
        const to = { position: { x: 0, y: 0, z: 0 }, rotation: { y: 10 } };
        const mid = interpolatePresence(from, to, 0.5);
        assert(Math.abs(mid.rotation.y - 0) < 1e-9 || Math.abs(mid.rotation.y - 360) < 1e-9, '29. rotation interpolates through the shorter arc (350 -> 360/0 -> 10)');
    }
    {
        const from = { position: { x: 0, y: 0, z: 0 }, rotation: { y: 0 }, animation: AvatarAnimationState.IDLE };
        const to = { position: { x: 1, y: 0, z: 0 }, rotation: { y: 0 }, animation: AvatarAnimationState.WALKING };
        assert(interpolatePresence(from, to, 0.5).animation === AvatarAnimationState.WALKING, "30. animation always snaps to the target's value — it is never blended");
    }

    // -------------------------------------------------------------
    // Section E — application/LocalPresenceStore
    // -------------------------------------------------------------
    {
        const store = new LocalPresenceStore({ staleAfterMs: 500, absentAfterMs: 2000 });
        assert(store.ingest(makeAdvertisement({ sequence: 1 }), 1000) === true, '31. a first-seen advertisement is ingested');
        assert(store.ingest(makeAdvertisement({ sequence: 1 }), 1100) === false, '32. a duplicate sequence is rejected by the store too');
        assert(store.ingest(makeAdvertisement({ sequence: 2 }), 1200) === true, '33. a genuinely newer sequence is accepted');
        assert(store.get('avatar-1').sequence === 2, '34. the store now holds the newer advertisement');

        let list = store.list(1250);
        assert(list.length === 1 && list[0].lifecycleState === PresenceLifecycleState.PRESENT, '35. list() reports PRESENT shortly after receipt');

        list = store.list(1200 + 600);
        assert(list[0].lifecycleState === PresenceLifecycleState.STALE, '36. list() reports STALE once staleAfterMs has passed');

        list = store.list(1200 + 3000);
        assert(list.length === 0, '37. list() prunes and stops reporting an ABSENT record entirely');
        assert(store.get('avatar-1') === null, '38. the pruned record is genuinely gone, not just hidden');
    }
    {
        const store = new LocalPresenceStore();
        assert(store.ingest({ avatarId: '', sequence: 1, position: { x: 0, y: 0, z: 0 } }) === false, '39. a malformed advertisement is rejected outright, never stored');
        store.ingest(makeAdvertisement({ avatarId: 'x' }), 0);
        store.remove('x');
        assert(store.get('x') === null, '40. remove() takes an avatar out immediately');
        store.ingest(makeAdvertisement({ avatarId: 'y' }), 0);
        store.clear();
        assert(store.list(0).length === 0, '41. clear() empties the store');
    }

    // -------------------------------------------------------------
    // Section F — application/PresenceSyncService
    // -------------------------------------------------------------
    {
        // A fake, synchronous, deterministic broadcast provider — no
        // real BroadcastChannel needed for testing the advertise/pull
        // orchestration itself (Section I covers the real transport).
        function fakeBroadcastProvider() {
            const listeners = new Set();
            const sent = [];
            return {
                sent,
                advertise: (ad) => sent.push(ad),
                onAdvertisement: (cb) => { listeners.add(cb); return () => listeners.delete(cb); },
                deliver: (ad) => { for (const cb of listeners) cb(ad); }
            };
        }
        const provider = fakeBroadcastProvider();
        const service = new PresenceSyncService(provider, { localAvatarId: 'me' });

        service.publish(makeAdvertisement({ avatarId: 'me', sequence: 1 }));
        assert(provider.sent.length === 1, '42. publish() hands the advertisement straight to the transport');

        provider.deliver(makeAdvertisement({ avatarId: 'them', sequence: 1 }));
        provider.deliver(makeAdvertisement({ avatarId: 'me', sequence: 2 })); // our own — must be ignored
        const known = service.pull(1000);
        assert(known.length === 1 && known[0].advertisement.avatarId === 'them', "43. pull() ingests received advertisements but never treats the local avatarId as remote");

        assert(service.pull(1000).length === 1, '44. a second pull() with nothing new still reports the still-fresh known presence');
        service.dispose();
        assert(service.listKnownPresences(1000).length === 0, '45. dispose() clears everything the service knew');
    }

    // -------------------------------------------------------------
    // Section G — application/RemoteAvatarInterpolator
    // -------------------------------------------------------------
    {
        const first = makeAdvertisement({ position: { x: 0, y: 0, z: 0 }, sequence: 1 });
        const interpolator = new RemoteAvatarInterpolator(first, 1000, { durationMs: 100 });
        assert(interpolator.currentPresence(1000).position.x === 0, '46. a freshly created interpolator starts exactly at its initial advertisement');

        interpolator.retarget(makeAdvertisement({ position: { x: 10, y: 0, z: 0 }, sequence: 2 }), 1000);
        assert(interpolator.currentPresence(1000).position.x === 0, '47. the instant a retarget happens, it starts at the OLD position (t=0)');
        assert(interpolator.currentPresence(1050).position.x === 5, '48. halfway through the interpolation window, it is halfway there');
        assert(interpolator.currentPresence(1100).position.x === 10, '49. once the interpolation window elapses, it reaches the new target exactly');
        assert(interpolator.sequence === 2, '50. sequence always reflects the AUTHORITATIVE target, never the interpolated (presentation-only) value');

        // Retargeting again mid-flight starts smoothly from wherever
        // it currently visually is, not from the old target.
        const midway = interpolator.currentPresence(1075).position.x;
        interpolator.retarget(makeAdvertisement({ position: { x: 20, y: 0, z: 0 }, sequence: 3 }), 1075);
        assert(Math.abs(interpolator.currentPresence(1075).position.x - midway) < 1e-9,
            '51. a mid-flight retarget starts from the CURRENT visual position, not a hard snap back to the previous target');

        // Retargeting to the SAME sequence is a no-op — it must never
        // restart the interpolation clock.
        interpolator.retarget(makeAdvertisement({ position: { x: 999, y: 0, z: 0 }, sequence: 3 }), 1200);
        assert(interpolator.currentPresence(1175).position.x === 20, '52. retargeting to an unchanged sequence is a no-op, never restarts the blend');
    }

    // -------------------------------------------------------------
    // Section H — application/RemoteAvatarRegistry (spy facade)
    // -------------------------------------------------------------
    {
        const facade = spyRenderFacade();
        const template = registry.get('humanoid-01');
        const appearance = template.defaultAppearance;
        const remoteRegistry = new RemoteAvatarRegistry(facade, { defaultTemplate: template, defaultAppearance: appearance });

        remoteRegistry.sync([{ advertisement: makeAdvertisement({ avatarId: 'bob', sequence: 1 }) }], 1000);
        assert(facade.calls.setRemoteAvatar.length === 1, '53. a brand-new avatarId creates exactly one remote avatar');
        assert(facade.calls.setRemoteAvatar[0].template === template, "54. the remote avatar uses the resolved default template — 0.2.37 never synchronizes real appearance");

        remoteRegistry.tick(1000);
        assert(facade.calls.updateRemoteAvatarPresence.length === 1, '55. tick() pushes an interpolated pose every frame');

        // A repeat sync() with the SAME sequence never re-creates the avatar.
        remoteRegistry.sync([{ advertisement: makeAdvertisement({ avatarId: 'bob', sequence: 1 }) }], 1100);
        assert(facade.calls.setRemoteAvatar.length === 1, '56. seeing the same avatarId/sequence again never calls setRemoteAvatar a second time');

        // A newly-known-presences list that no longer mentions "bob" removes him.
        remoteRegistry.sync([], 5000);
        assert(facade.calls.removeRemoteAvatar.length === 1 && facade.calls.removeRemoteAvatar[0] === 'bob',
            '57. an avatarId no longer present in the known-presences list is removed');

        remoteRegistry.dispose();
    }
    {
        // No default template wired (a session with no
        // avatarTemplateRegistry) — presence is still tracked, but no
        // visual is ever created.
        const facade = spyRenderFacade();
        const remoteRegistry = new RemoteAvatarRegistry(facade, {});
        remoteRegistry.sync([{ advertisement: makeAdvertisement({ avatarId: 'carol', sequence: 1 }) }], 1000);
        assert(facade.calls.setRemoteAvatar.length === 0, '58. with no default template resolved, a known remote avatar never gets a visual');
        assert(remoteRegistry.size === 1, "59. ...but it's still tracked internally (size reflects known avatars, not rendered ones)");
    }

    // -------------------------------------------------------------
    // Section I — presence/LocalAvatarPresenceBroadcastProvider
    //   (REAL BroadcastChannel — the only non-deterministic section)
    // -------------------------------------------------------------
    {
        const a = new LocalAvatarPresenceBroadcastProvider('forkbuild-test-channel-1');
        const b = new LocalAvatarPresenceBroadcastProvider('forkbuild-test-channel-1');
        const receivedByB = [];
        const receivedByA = [];
        b.onAdvertisement((ad) => receivedByB.push(ad));
        a.onAdvertisement((ad) => receivedByA.push(ad));

        a.advertise(makeAdvertisement({ avatarId: 'from-a', sequence: 1 }));
        await wait(50);
        assert(receivedByB.length === 1 && receivedByB[0].avatarId === 'from-a', "60. a message posted on one instance is received by another instance of the SAME channel name");
        assert(receivedByA.length === 0, "61. a channel never receives its own posted message");

        a.dispose();
        b.dispose();
    }
    {
        const a = new LocalAvatarPresenceBroadcastProvider('forkbuild-test-channel-2');
        const c = new LocalAvatarPresenceBroadcastProvider('forkbuild-test-channel-DIFFERENT');
        const receivedByC = [];
        c.onAdvertisement((ad) => receivedByC.push(ad));
        a.advertise(makeAdvertisement({ avatarId: 'from-a', sequence: 1 }));
        await wait(50);
        assert(receivedByC.length === 0, '62. a different channel NAME never hears anything at all');
        a.dispose();
        c.dispose();
    }

    // -------------------------------------------------------------
    // Section J — WorldNavigationSession integration (spy facade)
    // -------------------------------------------------------------
    {
        const { avatarProfileUseCase, avatarPresenceSession } = buildAvatarStack(registry, 'session-j1');
        const template = registry.get('humanoid-01');
        const provider = new LocalAvatarPresenceBroadcastProvider('forkbuild-test-session-j1');
        const session = new WorldNavigationSession({
            registry: new CreateBrickRegistryUseCase().execute(), loadPublicationDocumentUseCase: null, worldLayoutProvider: null,
            avatarProfileUseCase, avatarPresenceSession,
            presenceBroadcastProvider: provider, avatarTemplateRegistry: registry
        });
        const facade = spyRenderFacade();
        session._session = facade;
        session._setupRemoteAvatars();
        session._setupLocalAvatar();

        assert(facade.calls.onAnimationFrameCallbacks.length === 2, '63. both movement AND remote-avatar sync each register their own frame subscription');
        assert(session.isRemoteAvatarsVisible() === true, '64. Show Other Avatars starts on by default');
        session.setRemoteAvatarsVisible(false);
        assert(facade.calls.setRemoteAvatarsVisible.at(-1) === false, '65. setRemoteAvatarsVisible passes straight through to the facade');
        assert(session.getKnownRemoteAvatarCount() === 0, '66. a fresh session knows about zero remote avatars');

        // A session with NO presenceBroadcastProvider still works —
        // remote avatars simply never exist.
        const bareSession = new WorldNavigationSession({
            registry: new CreateBrickRegistryUseCase().execute(), loadPublicationDocumentUseCase: null, worldLayoutProvider: null
        });
        bareSession._session = spyRenderFacade();
        bareSession._setupRemoteAvatars();
        assert(bareSession.getKnownRemoteAvatarCount() === 0, '67. no broadcast provider wired -> _setupRemoteAvatars() is a graceful no-op');

        session.dispose();
        provider.dispose();
    }
    {
        // A logged-out viewer (no avatarProfileUseCase/avatarPresenceSession
        // at all) can STILL see other replicas' avatars — see
        // docs/Principles.md, "Watching Presence Never Requires Having
        // One."
        const provider = new LocalAvatarPresenceBroadcastProvider('forkbuild-test-session-j2');
        const session = new WorldNavigationSession({
            registry: new CreateBrickRegistryUseCase().execute(), loadPublicationDocumentUseCase: null, worldLayoutProvider: null,
            presenceBroadcastProvider: provider, avatarTemplateRegistry: registry
        });
        const facade = spyRenderFacade();
        session._session = facade;
        session._setupRemoteAvatars();
        assert(session.hasLocalAvatar() === false, '68. this session genuinely has no local avatar');
        assert(facade.calls.onAnimationFrameCallbacks.length === 1, '69. ...yet remote-avatar sync is still wired (only the local-avatar/movement subscription is absent)');
        session.dispose();
        provider.dispose();
    }

    // -------------------------------------------------------------
    // Section K — FLAGSHIP: the design doc's own scripted scenario
    //   Alice moves -> Alice's presence changes -> Bob synchronizes ->
    //   Bob sees Alice's avatar at the corresponding position ->
    //   Alice stops -> Bob eventually sees Alice disappear as
    //   presence expires -> neither Document, Publication,
    //   WorldPlacement, nor SpatialIndex changes anywhere.
    // -------------------------------------------------------------
    {
        const channelName = 'forkbuild-test-flagship-0-2-37';

        // Alice: a real avatar stack, a real published/placed
        // document (so "nothing else changes" is a real, checkable
        // claim), and a real WorldNavigationSession with movement.
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
        const loadPublicationDocumentUseCase = new LoadPublicationDocumentUseCase(storage);
        const placePublicationUseCase = new PlacePublicationUseCase(
            spatialIndexProvider, discoveryProvider, loadPublicationDocumentUseCase, brickRegistry, placementRegistry, alice
        );
        const publishDocumentUseCase = new PublishDocumentUseCase(publisher, alice, placePublicationUseCase, new GridPlacementStrategy());
        const world = new World();
        const building = new Building({ creator: 'alice' });
        building.addBrick(new Brick({ definitionId: 'core:cube' }));
        world.addBuilding(building);
        const document = new Document({ world, metadata: new DocumentMetadata({ title: 'Flagship Presence Castle', author: 'alice', license: new License({ id: LicenseId.CC0_1_0 }) }) });
        const publication = publishDocumentUseCase.execute({ document });

        const placementBefore = placementRegistry.findByPublicationId(publication.id)[0];
        const placementJsonBefore = JSON.stringify(placementBefore.toJSON());
        const documentKeysBefore = storage.list().filter((k) => k.startsWith('document:')).length;
        const spatialCountBefore = spatialIndexProvider.discover({ x: 0, y: 0, z: 0 }, 100000).length;

        const aliceSession = new WorldNavigationSession({
            registry: brickRegistry, loadPublicationDocumentUseCase, worldLayoutProvider: new LocalWorldLayoutProvider(spatialIndexProvider, discoveryProvider),
            identityProvider: alice, discoveryProvider, placementRegistry,
            avatarProfileUseCase: aliceAvatarProfileUseCase, avatarPresenceSession: aliceAvatarPresenceSession,
            presenceBroadcastProvider: aliceBroadcastProvider, avatarTemplateRegistry: registry
        });
        const aliceFacade = spyRenderFacade();
        aliceSession._session = aliceFacade;
        aliceSession._setupRemoteAvatars();
        aliceSession._setupLocalAvatar();

        // Bob: a completely separate replica — own storage, own
        // session, connected only via the shared channel name.
        const bobBroadcastProvider = new LocalAvatarPresenceBroadcastProvider(channelName);
        const bobSession = new WorldNavigationSession({
            registry: new CreateBrickRegistryUseCase().execute(), loadPublicationDocumentUseCase: null, worldLayoutProvider: null,
            presenceBroadcastProvider: bobBroadcastProvider, avatarTemplateRegistry: registry
        });
        const bobFacade = spyRenderFacade();
        bobSession._session = bobFacade;
        bobSession._setupRemoteAvatars();
        assert(bobSession.hasLocalAvatar() === false, '70. FLAGSHIP: Bob has no avatar of his own');

        // Alice walks: press W for real elapsed time via direct ticks
        // (frame-rate independent — see tests/AvatarMovement.test.js).
        aliceSession.setAvatarControlMode(true);
        aliceSession.avatarKeyDown('w');
        for (let i = 0; i < 20; i++) {
            aliceSession._avatarMovementController.tick(0.05); // 1.0s of walking
        }
        aliceSession.avatarKeyUp('w');
        assert(aliceAvatarPresenceSession.current.position.z > 0, '71. FLAGSHIP: Alice actually moved');

        // Let the real BroadcastChannel messages actually arrive.
        await wait(80);

        // Bob pulls/syncs/ticks exactly the way his own frame-loop
        // subscription would.
        const bobPull = () => {
            const now = Date.now();
            const known = bobSession._presenceSyncService.pull(now);
            bobSession._remoteAvatarRegistry.sync(known, now);
            bobSession._remoteAvatarRegistry.tick(now);
        };
        bobPull();

        assert(bobFacade.calls.setRemoteAvatar.length === 1, "72. FLAGSHIP: Bob synchronizes and creates exactly one remote avatar for Alice");
        assert(bobFacade.calls.setRemoteAvatar[0].avatarId === aliceProfile.avatarId, "73. FLAGSHIP: the remote avatar Bob created IS Alice's own avatarId");
        const lastBobUpdate = bobFacade.calls.updateRemoteAvatarPresence.at(-1);
        assert(lastBobUpdate && Math.abs(lastBobUpdate.presenceLike.position.z - aliceAvatarPresenceSession.current.position.z) < 0.5,
            "74. FLAGSHIP: Bob sees Alice's avatar at (approximately, allowing for in-flight interpolation) her actual position");

        // Alice stops. One final "settling to idle" update still
        // publishes (an animation change IS a real change) — then
        // truly nothing further.
        aliceSession._avatarMovementController.tick(0.5); // no keys held -> settles to IDLE, one last publish
        await wait(80);
        bobPull();
        assert(aliceAvatarPresenceSession.current.animation === AvatarAnimationState.IDLE, '75. FLAGSHIP: Alice settles to IDLE once she stops');

        // Fast-forward Bob's own clock well past absence — no real
        // waiting required, LocalPresenceStore's list()/pull() both
        // take an explicit `now`.
        const farFuture = Date.now() + 60000;
        const knownFarFuture = bobSession._presenceSyncService.pull(farFuture);
        bobSession._remoteAvatarRegistry.sync(knownFarFuture, farFuture);
        assert(knownFarFuture.length === 0, "76. FLAGSHIP: far enough in the future, Alice's presence has expired from Bob's own store");
        assert(bobFacade.calls.removeRemoteAvatar.length === 1 && bobFacade.calls.removeRemoteAvatar[0] === aliceProfile.avatarId,
            "77. FLAGSHIP: Bob's renderer is told to remove Alice's avatar once her presence expires");

        // Neither Document, Publication, WorldPlacement, nor
        // SpatialIndex changed ANYWHERE, on either replica, at any
        // point during this entire scenario.
        const placementAfter = placementRegistry.findByPublicationId(publication.id)[0];
        assert(JSON.stringify(placementAfter.toJSON()) === placementJsonBefore,
            '78. FLAGSHIP: WorldPlacement/PlacementRecord is byte-identical after the entire presence-sync scenario');
        const documentKeysAfter = storage.list().filter((k) => k.startsWith('document:')).length;
        assert(documentKeysAfter === documentKeysBefore, '79. FLAGSHIP: no document was ever created for Alice, Bob, or their presence traffic');
        const spatialCountAfter = spatialIndexProvider.discover({ x: 0, y: 0, z: 0 }, 100000).length;
        assert(spatialCountAfter === spatialCountBefore, '80. FLAGSHIP: the spatial index is untouched by any presence activity');
        assert(document.metadata.title === 'Flagship Presence Castle', '81. FLAGSHIP: DocumentMetadata is untouched');

        aliceSession.dispose();
        bobSession.dispose();
        aliceBroadcastProvider.dispose();
        bobBroadcastProvider.dispose();
    }

    console.log('✅ All Avatar Presence Synchronization tests passed.');
}

// Top-level await — see tests/AvatarRendering.test.js's comment for
// why the usual fire-and-forget `runTests().catch(...)` pattern isn't
// reliably safe even for a file with no real macrotask scheduling —
// and this file has GENUINE macrotask scheduling (the real
// BroadcastChannel waits), making it doubly important here.
await runTests();
