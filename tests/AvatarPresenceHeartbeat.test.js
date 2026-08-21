import { AvatarProfileUseCase } from '../application/AvatarProfileUseCase.js';
import { AvatarPresenceSession } from '../application/AvatarPresenceSession.js';
import { AvatarTemplateRegistry } from '../core/AvatarTemplateRegistry.js';
import { CoreAvatarTemplateLibrary } from '../core/library/CoreAvatarTemplateLibrary.js';
import { LocalIdentityProvider } from '../identity/LocalIdentityProvider.js';
import { WorldNavigationSession } from '../application/WorldNavigationSession.js';
import { CreateBrickRegistryUseCase } from '../application/CreateBrickRegistryUseCase.js';
import { StorageProvider } from '../storage/StorageProvider.js';
import { PresenceVisibilityUseCase } from '../application/PresenceVisibilityUseCase.js';
import { PresenceVisibility } from '../core/PresenceVisibility.js';

// 0.3.1 — Presence Heartbeat.
//
// Before this milestone, WorldNavigationSession only ever published a
// PRESENCE advertisement in reaction to an ACCEPTED AvatarPresenceSession
// update — and AvatarMovementController.tick() only ever calls update()
// when position/rotation/animation genuinely changed (see its own
// header: "an avatar standing still ... produces an EXACT no-op"). So
// an idle-but-still-connected local avatar published nothing at all,
// and every OTHER replica's application/LocalPresenceStore.js aged that
// avatar's last-known advertisement into STALE (2500ms) then ABSENT
// (6000ms) purely from elapsed wall-clock time — it silently vanished
// from World View / Nearby Avatars despite never having actually left.
//
// This suite proves the fix in isolation, at the same layer
// tests/AvatarAppearanceSync.test.js's own "Section L" already proves
// PROFILE_REPUBLISH_INTERVAL_MS at: WorldNavigationSession's frame
// subscription, with the bookkeeping field rewound to simulate elapsed
// idle time rather than a real multi-second wait.

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

function buildAvatarStack(username, registry) {
    const storage = new InMemoryStorageProvider();
    const identityProvider = new LocalIdentityProvider(storage);
    identityProvider.login(username);
    const avatarProfileUseCase = new AvatarProfileUseCase(storage, identityProvider, registry);
    const profile = avatarProfileUseCase.getProfile();
    const avatarPresenceSession = new AvatarPresenceSession(profile, { position: { x: 0, y: 0, z: 0 } });
    return { storage, identityProvider, avatarProfileUseCase, avatarPresenceSession };
}

function fakeBroadcastProvider() {
    const sent = [];
    return { sent, advertise: (ad) => sent.push(ad), onAdvertisement: () => () => {}, dispose() {} };
}

function spyRenderFacade() {
    const calls = { updateLocalAvatarPresence: [], onAnimationFrameCallbacks: [] };
    return {
        calls,
        pick: () => null, pickAvatar: () => null, pickGround: () => null,
        setLocalAvatar: () => {},
        updateLocalAvatarAppearance: () => {},
        updateLocalAvatarPresence: (presence) => calls.updateLocalAvatarPresence.push({ presence }),
        setLocalAvatarVisible: () => {},
        removeLocalAvatar: () => {},
        setRemoteAvatar: () => {}, updateRemoteAvatarPresence: () => {}, updateRemoteAvatarAppearance: () => {},
        removeRemoteAvatar: () => {}, setRemoteAvatarsVisible: () => {},
        onAnimationFrame: (callback) => { calls.onAnimationFrameCallbacks.push(callback); return () => {}; },
        getCameraState: () => ({ position: { x: 0, y: 0, z: 20 }, target: { x: 0, y: 0, z: 0 }, zoom: 1 }),
        setCameraState: () => {},
        addWorld() {}, removeWorld() {}, clearSelection() {}, clearHover() {},
        selectBricks() {}, hoverBrick() {}, showPreview() {}, hidePreview() {},
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

    {
        // Section A — the idle heartbeat itself: no publish until the
        // very first frame tick (bootstrap), no SECOND publish until
        // genuinely idle for PRESENCE_HEARTBEAT_INTERVAL_MS, and the
        // position/rotation/animation carried never change.
        const { avatarProfileUseCase, avatarPresenceSession } = buildAvatarStack('heartbeat-a', registry);
        const presenceProvider = fakeBroadcastProvider();
        const session = new WorldNavigationSession({
            registry: new CreateBrickRegistryUseCase().execute(), loadPublicationDocumentUseCase: null, worldLayoutProvider: null,
            avatarProfileUseCase, avatarPresenceSession,
            presenceBroadcastProvider: presenceProvider, avatarTemplateRegistry: registry
        });
        session._session = spyRenderFacade();
        session._setupRemoteAvatars();
        session._setupLocalAvatar();

        assert(presenceProvider.sent.length === 0, '1. setup alone publishes nothing');

        const frameCallback = session._session.calls.onAnimationFrameCallbacks[1];
        frameCallback(0.016);
        assert(presenceProvider.sent.length === 1, '2. the very first frame tick bootstraps a heartbeat publish (0 means never yet published)');
        assert(presenceProvider.sent[0].sequence === 1, '3. ...advancing sequence from 0 to 1, exactly like a real movement would');
        assert(presenceProvider.sent[0].position.x === 0 && presenceProvider.sent[0].position.z === 0,
            '4. ...carrying the avatar\'s CURRENT, UNCHANGED position');

        frameCallback(0.016);
        assert(presenceProvider.sent.length === 1, '5. an immediately-following frame tick does NOT republish — not idle long enough yet');

        // Simulate real elapsed idle time the same way Section L of
        // tests/AvatarAppearanceSync.test.js simulates PROFILE_REPUBLISH_INTERVAL_MS:
        // rewind the bookkeeping field rather than actually waiting.
        session._lastPresenceUpdateAt = 0;
        frameCallback(0.016);
        assert(presenceProvider.sent.length === 2, '6. once idle time has "elapsed," the heartbeat republishes again');
        assert(presenceProvider.sent[1].sequence === 2, '7. ...advancing sequence again, still just a resend of the same position');

        session.dispose();
    }
    {
        // Section B — a real movement update refreshes the heartbeat's
        // own bookkeeping (both paths share the one onPresenceChanged
        // subscription), so it never double-publishes right behind a
        // movement that already published this frame.
        const { avatarProfileUseCase, avatarPresenceSession } = buildAvatarStack('heartbeat-b', registry);
        const presenceProvider = fakeBroadcastProvider();
        const session = new WorldNavigationSession({
            registry: new CreateBrickRegistryUseCase().execute(), loadPublicationDocumentUseCase: null, worldLayoutProvider: null,
            avatarProfileUseCase, avatarPresenceSession,
            presenceBroadcastProvider: presenceProvider, avatarTemplateRegistry: registry
        });
        session._session = spyRenderFacade();
        session._setupRemoteAvatars();
        session._setupLocalAvatar();

        const frameCallback = session._session.calls.onAnimationFrameCallbacks[1];
        frameCallback(0.016);
        assert(presenceProvider.sent.length === 1, '8. bootstrap heartbeat fires as before');

        // A real movement, published exactly like
        // AvatarMovementController.tick() would.
        avatarPresenceSession.update({ position: { x: 3, y: 0, z: 0 } });
        assert(presenceProvider.sent.length === 2, '9. the real movement publishes immediately, independent of the heartbeat tick');
        assert(presenceProvider.sent[1].position.x === 3, '10. ...carrying the REAL new position');

        // The very next frame tick must not immediately re-fire the
        // heartbeat just because a publish happened a moment ago.
        frameCallback(0.016);
        assert(presenceProvider.sent.length === 2, '11. the frame tick right after a real movement does not double-publish');

        session.dispose();
    }
    {
        // Section C — visibility gate: the heartbeat still advances the
        // LOCAL avatar's own presence (and calls update()), but HIDDEN
        // still means nothing ever reaches the transport — the exact
        // same gate a real movement is already subject to. See
        // docs/Principles.md, "Visibility Happens Before Broadcasting,
        // Never After."
        const { storage, identityProvider, avatarProfileUseCase, avatarPresenceSession } = buildAvatarStack('heartbeat-c', registry);
        const presenceVisibilityUseCase = new PresenceVisibilityUseCase(storage, identityProvider);
        presenceVisibilityUseCase.updatePolicy({ visibility: PresenceVisibility.HIDDEN });
        const presenceProvider = fakeBroadcastProvider();
        const session = new WorldNavigationSession({
            registry: new CreateBrickRegistryUseCase().execute(), loadPublicationDocumentUseCase: null, worldLayoutProvider: null,
            avatarProfileUseCase, avatarPresenceSession, presenceVisibilityUseCase,
            presenceBroadcastProvider: presenceProvider, avatarTemplateRegistry: registry
        });
        session._session = spyRenderFacade();
        session._setupRemoteAvatars();
        session._setupLocalAvatar();

        const frameCallback = session._session.calls.onAnimationFrameCallbacks[1];
        frameCallback(0.016);
        assert(presenceProvider.sent.length === 0, '12. HIDDEN suppresses the heartbeat publish exactly like it suppresses a real movement publish');
        assert(session._session.calls.updateLocalAvatarPresence.length >= 1,
            '13. ...but the LOCAL avatar visual still updates locally (rendering your own avatar never depends on remote visibility)');

        session.dispose();
    }

    console.log('✅ All Presence Heartbeat tests passed.');
}

await runTests();
