import { AvatarTemplateRegistry } from '../core/avatar/AvatarTemplateRegistry.js';
import { CoreAvatarTemplateLibrary } from '../core/library/CoreAvatarTemplateLibrary.js';
import { FunnelEvent, VISITOR_COUNT_SITE_ORIGIN, funnelEventHitUrl } from '../core/app/VisitorCount.js';
import { CreateGuestAvatarUseCase, GuestAvatarProfileUseCase } from '../application/avatar/GuestAvatar.js';
import { AvatarProfileUseCase } from '../application/avatar/AvatarProfileUseCase.js';
import { AvatarPresenceSession } from '../application/avatar/AvatarPresenceSession.js';
import { WorldNavigationSession } from '../application/world/WorldNavigationSession.js';
import { CreateBrickRegistryUseCase } from '../application/editor/CreateBrickRegistryUseCase.js';
import { FunnelEventCounter } from '../application/settings/FunnelEventCounter.js';
import { VisitorCountSettingsStore } from '../application/settings/VisitorCountSettingsStore.js';
import { LocalAvatarPresenceBroadcastProvider } from '../presence/LocalAvatarPresenceBroadcastProvider.js';
import { LocalIdentityProvider } from '../identity/LocalIdentityProvider.js';
import { UserFacingError } from '../core/app/UserFacingError.js';
import { InMemoryStorageProvider } from './support/InMemoryStorageProvider.js';
import { assert } from './support/Assert.js';

// Walking with no name (docs/reviews/CreativeDirection-2026-10-12c.md,
// finding 1): a guest's avatar walks World View, is never sent to anyone, and
// becomes the named avatar where it stands once a name is chosen. The panel's
// guest line is checked in the bundled-site test with a real browser.

function wait(ms) {
    return new Promise((resolve) => setTimeout(resolve, ms));
}

function templates() {
    const registry = new AvatarTemplateRegistry();
    registry.register(CoreAvatarTemplateLibrary);
    return registry;
}

// The render facade, as far as avatars go.
function facade() {
    const calls = { setLocalAvatar: [], removeLocalAvatar: 0, setRemoteAvatar: [], frames: [] };
    let cameraState = { position: { x: 10, y: 10, z: 10 }, target: { x: 0, y: 0, z: 0 }, zoom: 1 };
    return {
        calls,
        setLocalAvatar: (template, appearance, presence) => calls.setLocalAvatar.push({ template, presence }),
        updateLocalAvatarAppearance() {},
        updateLocalAvatarPresence() {},
        setLocalAvatarVisible() {},
        removeLocalAvatar: () => { calls.removeLocalAvatar++; },
        setRemoteAvatar: (avatarId) => calls.setRemoteAvatar.push(avatarId),
        updateRemoteAvatarPresence() {},
        removeRemoteAvatar() {},
        setRemoteAvatarsVisible() {},
        onAnimationFrame: (callback) => { calls.frames.push(callback); return () => {}; },
        getCameraState: () => cameraState,
        setCameraState: (state) => { cameraState = state; },
        moveCamera() {},
        dispose() {}
    };
}

// Every BroadcastChannel opened, closed at the end so the test can exit.
const channels = [];
function channelProvider(name) {
    const provider = new LocalAvatarPresenceBroadcastProvider(name);
    channels.push(provider);
    return provider;
}

function sessionWith(wiring, extra = {}) {
    const session = new WorldNavigationSession({
        registry: new CreateBrickRegistryUseCase().execute(),
        loadPublicationDocumentUseCase: null,
        worldLayoutProvider: null,
        avatarProfileUseCase: wiring ? wiring.avatarProfileUseCase : null,
        avatarPresenceSession: wiring ? wiring.presenceSession : null,
        presenceVisibilityUseCase: wiring ? wiring.presenceVisibilityUseCase : null,
        avatarProfileVisibilityUseCase: wiring ? wiring.avatarProfileVisibilityUseCase : null,
        avatarTemplateRegistry: templates(),
        ...extra
    });
    const render = facade();
    session._session = render;
    session._setupRemoteAvatars();
    session._setupLocalAvatar();
    return { session, render };
}

function walk(session, seconds = 1) {
    session.setAvatarControlMode(true);
    session.avatarKeyDown('w');
    for (let i = 0; i < seconds * 20; i++) session._avatarMovementController.tick(0.05);
    session.avatarKeyUp('w');
}

async function runTests() {
    // A guest's avatar: the default look, held in memory, changed by nobody.
    {
        const guest = new CreateGuestAvatarUseCase().execute({ position: { x: 4, y: 0, z: -2 } });
        assert(guest.avatarProfileUseCase instanceof GuestAvatarProfileUseCase && guest.avatarProfileUseCase.isGuest, 'a guest profile');
        const { profile, template } = guest.avatarProfileUseCase.getEffectiveAvatar();
        assert(template && profile.displayName === '', 'drawn in the default look, with no name');
        assert(guest.avatarProfileUseCase.getProfile() === profile, 'the same profile every time, never stored');
        let threw = false;
        try { guest.avatarProfileUseCase.updateProfile({ displayName: 'Ana' }); } catch { threw = true; }
        assert(threw, 'a guest look can\'t be changed');
        assert(guest.presenceSession.current.position.x === 4 && guest.presenceSession.current.position.z === -2, 'it starts where it was asked to');
        assert(!guest.presenceVisibilityUseCase.getPolicy().shouldAdvertise({ hasFriend: true }), 'presence is never advertised');
        assert(!guest.avatarProfileVisibilityUseCase.getPolicy().shouldAdvertise({ hasFriend: true }), 'nor is the profile');
        console.log('✓ a guest\'s avatar has the default look, isn\'t stored, and is advertised to nobody');
    }

    // A guest walks, and a replica on the same channel sees nobody.
    {
        const channel = `guest-walking-${Date.now()}`;
        const { session: guestSession, render: guestRender } = sessionWith(new CreateGuestAvatarUseCase().execute(), {
            presenceBroadcastProvider: channelProvider(channel)
        });
        const { session: watcher, render: watcherRender } = sessionWith(null, {
            presenceBroadcastProvider: channelProvider(channel)
        });
        assert(guestSession.hasLocalAvatar() && guestSession.isLocalAvatarGuest(), 'the session has a guest avatar');
        assert(guestRender.calls.setLocalAvatar.length === 1, 'drawn on this screen');
        walk(guestSession);
        assert(guestSession.getAvatarPosition().z > 0, 'and it walks');
        // The frame loop's heartbeat and profile republish run too.
        for (const frame of guestRender.calls.frames) {
            try { frame(0.016); } catch { /* the bare facade can't draw everything a frame does */ }
        }
        await wait(80);
        const now = Date.now();
        watcher._remoteAvatarRegistry.sync(watcher._presenceSyncService.pull(now), now);
        assert(watcherRender.calls.setRemoteAvatar.length === 0, `nobody else sees a guest (${watcherRender.calls.setRemoteAvatar.length})`);
        assert(guestSession.getAvatarDisplayName(guestSession.localAvatarPlacement() && guestSession._avatarPresenceSession.current.avatarId) === 'You',
            'a guest is "You" on their own screen, never "guest"');
        guestSession.dispose();
        watcher.dispose();
        console.log('✓ a guest walks World View, and no other replica sees them');
    }

    // Choosing a name: the named avatar takes over where the guest stood, and is seen.
    {
        const channel = `guest-named-${Date.now()}`;
        const { session, render } = sessionWith(new CreateGuestAvatarUseCase().execute(), {
            presenceBroadcastProvider: channelProvider(channel)
        });
        const { session: watcher, render: watcherRender } = sessionWith(null, {
            presenceBroadcastProvider: channelProvider(channel)
        });
        walk(session);
        const stood = session.getAvatarPosition();

        const storage = new InMemoryStorageProvider();
        const ana = new LocalIdentityProvider(storage);
        ana.login('ana');
        session._identityProvider = ana;
        // What CreateWorldViewUseCase's localAvatarWiring() builds for her.
        const avatarProfileUseCase = new AvatarProfileUseCase(storage, ana, templates());
        session.adoptLocalAvatar({
            avatarProfileUseCase,
            presenceSession: new AvatarPresenceSession(avatarProfileUseCase.getProfile(), session.localAvatarPlacement())
        });
        assert(!session.isLocalAvatarGuest() && session.localAvatarOwnerIdentity() === 'ana', 'the avatar is Ana\'s now');
        assert(render.calls.removeLocalAvatar === 1 && render.calls.setLocalAvatar.length === 2, 'the guest\'s figure is replaced by hers');
        const now = session.getAvatarPosition();
        assert(now.x === stood.x && now.z === stood.z, 'standing where the guest stood');
        assert(session._avatarControlModeActive, 'still walking with the keys');

        walk(session);
        await wait(80);
        const at = Date.now();
        watcher._remoteAvatarRegistry.sync(watcher._presenceSyncService.pull(at), at);
        assert(watcherRender.calls.setRemoteAvatar.length === 1, 'and other replicas see her');

        // Logging out walks on as a guest again.
        session.adoptLocalAvatar(new CreateGuestAvatarUseCase().execute(session.localAvatarPlacement()));
        assert(session.isLocalAvatarGuest(), 'a guest again after logging out');
        session.dispose();
        watcher.dispose();
        console.log('✓ choosing a name makes the guest\'s avatar the named one, where it stands, seen by others');
    }

    // A guest talks to residents, but changes no World.
    {
        const { session } = sessionWith(new CreateGuestAvatarUseCase().execute());
        const state = session.residentInteractionState();
        assert(state && state.canAdd === false && state.canRemove === false, `a guest adds no resident (${JSON.stringify(state)})`);
        let refusal = null;
        try { session.addResidentHere(); } catch (error) { refusal = error; }
        assert(refusal instanceof UserFacingError, 'and is told why, before anything is copied');
        const decoration = session.animalDecorationInteractionState();
        assert(decoration && !decoration.canDecorate && !decoration.canUndecorate, 'nor decorates one');
        session.dispose();
        console.log('✓ a guest adds, removes and decorates nothing: those are signed changes to a World');
    }

    // A guest walking is counted once a page load.
    {
        const store = new VisitorCountSettingsStore({ storageProvider: new InMemoryStorageProvider() });
        store.setEnabled(true);
        const hits = [];
        const counter = new FunnelEventCounter({ settingsStore: store, origin: VISITOR_COUNT_SITE_ORIGIN, random: () => 0.5, sendHit: (url) => hits.push(url) });
        assert(counter.walkedAsGuest() && !counter.walkedAsGuest(), 'once a page load');
        assert(hits.length === 1 && hits[0] === funnelEventHitUrl(FunnelEvent.GUEST_WALK, '5'), `as /e/guest-walk (${hits})`);
        console.log('✓ a guest who walks is counted as /e/guest-walk, once a page load');
    }
}

try {
    await runTests();
} finally {
    for (const provider of channels) provider.dispose();
}
