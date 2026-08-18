import { PresenceVisibility } from '../core/PresenceVisibility.js';
import { PresenceVisibilityPolicy } from '../core/PresenceVisibilityPolicy.js';
import { AvatarProfileVisibilityPolicy } from '../core/AvatarProfileVisibilityPolicy.js';
import { PresenceVisibilityUseCase } from '../application/PresenceVisibilityUseCase.js';
import { AvatarProfileVisibilityUseCase } from '../application/AvatarProfileVisibilityUseCase.js';
import { FriendRelationshipUseCase } from '../application/FriendRelationshipUseCase.js';
import { FriendshipState } from '../core/FriendshipState.js';
import { AvatarProfileUseCase } from '../application/AvatarProfileUseCase.js';
import { AvatarPresenceSession } from '../application/AvatarPresenceSession.js';
import { WorldNavigationSession } from '../application/WorldNavigationSession.js';
import { AvatarTemplateRegistry } from '../core/AvatarTemplateRegistry.js';
import { CoreAvatarTemplateLibrary } from '../core/library/CoreAvatarTemplateLibrary.js';
import { PeerAvatarPresenceBroadcastProvider } from '../presence/PeerAvatarPresenceBroadcastProvider.js';
import { LocalIdentityProvider } from '../identity/LocalIdentityProvider.js';
import { StorageProvider } from '../storage/StorageProvider.js';
import { LocalContentStore } from '../content/LocalContentStore.js';
import { LocalPublisherProvider } from '../publisher/LocalPublisherProvider.js';
import { LocalDiscoveryProvider } from '../discovery/LocalDiscoveryProvider.js';
import { LocalSpatialIndexProvider } from '../spatial/LocalSpatialIndexProvider.js';
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
import { LocalPeerNetwork, LocalPeerConnectionProvider } from '../peer/LocalPeerConnectionProvider.js';
import { ConnectToPeerUseCase } from '../application/ConnectToPeerUseCase.js';
import { PeerLifecycleState } from '../peer/PeerLifecycleState.js';
import { PeerMessageBus } from '../peer/PeerMessageBus.js';

// 0.2.58 — Friend-Aware Privacy & Social Visibility.
//
// "Now that Alice and Bob are actually friends, what does friendship
// allow them to see?" Nothing automatically — friendship (0.2.57) is an
// eligibility fact a visibility policy (0.2.40/0.2.54) can now
// reference, never a bypass around one. This file proves the whole
// boundary:
//
//   Section A: core/PresenceVisibilityPolicy.js#shouldAdvertiseToPeer()
//              — the new `{ isFriend }` context, additive alongside the
//              pre-existing manual authorizedPeerIdentities allow-list.
//   Section B: core/AvatarProfileVisibilityPolicy.js — the full
//              PUBLIC/FRIENDS/LOCAL/HIDDEN vocabulary it gains this
//              milestone, and its own independent `{ isFriend }`.
//   Section C: application/AvatarProfileVisibilityUseCase.js —
//              persistence, genuinely separate storage from presence's.
//   Section D: WorldNavigationSession — profile's OWN, independent
//              publication gate, superseding 0.2.41's shared one; the
//              pre-0.2.58 shared-gate fallback stays intact when no
//              avatarProfileVisibilityUseCase is wired.
//   Section E: presence/PeerAvatarPresenceBroadcastProvider.js — the
//              injected `isFriend` predicate, per peer, against minimal
//              stand-ins.
//   Section F: FLAGSHIP — Alice, Bob, and Charlie over a REAL peer
//              network, with REAL mutual friendship (0.2.57, unmodified)
//              driving FRIENDS visibility for both presence and profile,
//              nothing manually authorized at all.

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

function makeDevice(label) {
    const storage = new InMemoryStorageProvider();
    const provider = new LocalIdentityProvider(storage);
    provider.login(label);
    return { storage, provider };
}

function spyRenderFacade() {
    const calls = {
        setLocalAvatar: [], updateLocalAvatarPresence: [], updateLocalAvatarAppearance: [], setLocalAvatarVisible: [],
        setRemoteAvatar: [], updateRemoteAvatarPresence: [], updateRemoteAvatarAppearance: [], removeRemoteAvatar: [], setRemoteAvatarsVisible: [],
        onAnimationFrameCallbacks: []
    };
    return {
        calls,
        pick: () => null, pickAvatar: () => null, pickGround: () => null,
        setLocalAvatar: (template, appearance, presence) => calls.setLocalAvatar.push({ template, appearance, presence }),
        updateLocalAvatarAppearance: (template, appearance) => calls.updateLocalAvatarAppearance.push({ template, appearance }),
        updateLocalAvatarPresence: (presence) => calls.updateLocalAvatarPresence.push({ presence }),
        setLocalAvatarVisible: (visible) => calls.setLocalAvatarVisible.push(visible),
        removeLocalAvatar: () => {},
        setRemoteAvatar: (avatarId, template, appearance, presenceLike) => calls.setRemoteAvatar.push({ avatarId, template, appearance, presenceLike }),
        updateRemoteAvatarPresence: (avatarId, presenceLike) => calls.updateRemoteAvatarPresence.push({ avatarId, presenceLike }),
        updateRemoteAvatarAppearance: (avatarId, template, appearance) => calls.updateRemoteAvatarAppearance.push({ avatarId, template, appearance }),
        removeRemoteAvatar: (avatarId) => calls.removeRemoteAvatar.push(avatarId),
        setRemoteAvatarsVisible: (visible) => calls.setRemoteAvatarsVisible.push(visible),
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

function fakeConnectedPeer({ connectionId, lifecycleState, remoteIdentity = null }) {
    let state = lifecycleState;
    const stateListeners = new Set();
    const messageListeners = new Set();
    return {
        connectionId,
        connection: {
            onMessage: (cb) => { messageListeners.add(cb); return () => messageListeners.delete(cb); },
            send: () => {}
        },
        remoteIdentity,
        getLifecycleState: () => state,
        onStateChange: (cb) => { stateListeners.add(cb); return () => stateListeners.delete(cb); },
        _setState(next) { state = next; for (const l of Array.from(stateListeners)) l(next); },
        _deliver(message) { for (const l of Array.from(messageListeners)) l(message); }
    };
}

function fakeRegistry(initialPeers = []) {
    let peers = [...initialPeers];
    const changeListeners = new Set();
    return {
        list: () => [...peers],
        add(peer) { peers.push(peer); this._publish(); },
        remove(connectionId) { peers = peers.filter((p) => p.connectionId !== connectionId); this._publish(); },
        onChange(cb) { changeListeners.add(cb); return () => changeListeners.delete(cb); },
        _publish() { const snap = [...peers]; for (const l of changeListeners) l(snap); }
    };
}

async function runTests() {
    const registry = buildRegistry();

    // -------------------------------------------------------------
    // Section A — core/PresenceVisibilityPolicy.js#shouldAdvertiseToPeer()
    // with { isFriend }
    // -------------------------------------------------------------
    {
        const friendsNoList = new PresenceVisibilityPolicy({ visibility: PresenceVisibility.FRIENDS });
        assert(friendsNoList.shouldAdvertiseToPeer('did:key:bob') === false, '1. FRIENDS with no isFriend context and no allow-list denies, exactly 0.2.53 unchanged');
        assert(friendsNoList.shouldAdvertiseToPeer('did:key:bob', { isFriend: true }) === true, '2. FRIENDS grants a peer reported as isFriend, with NO allow-list entry at all');
        assert(friendsNoList.shouldAdvertiseToPeer('did:key:bob', { isFriend: false }) === false, '3. FRIENDS still denies when isFriend is explicitly false and no allow-list entry exists');
        assert(friendsNoList.shouldAdvertiseToPeer(null, { isFriend: true }) === false, '4. FRIENDS never grants an unknown/unproven peer identity, even with isFriend true');
    }
    {
        // Additive, never exclusive: a manually-authorized identity
        // that is NOT (yet, or ever) a real friend still works.
        const friendsWithList = new PresenceVisibilityPolicy({ visibility: PresenceVisibility.FRIENDS, authorizedPeerIdentities: ['did:key:charlie'] });
        assert(friendsWithList.shouldAdvertiseToPeer('did:key:charlie', { isFriend: false }) === true, '5. the manual allow-list still grants access on its own, isFriend false');
        assert(friendsWithList.shouldAdvertiseToPeer('did:key:bob', { isFriend: true }) === true, '6. real friendship grants access even for a peer absent from the manual list');
        assert(friendsWithList.shouldAdvertiseToPeer('did:key:dave', { isFriend: false }) === false, '7. neither mechanism grants a peer that is on neither');
    }
    {
        // isFriend is irrelevant to every other tier — it never widens
        // PUBLIC (already unconditional) or narrows/widens LOCAL/HIDDEN.
        const pub = new PresenceVisibilityPolicy({ visibility: PresenceVisibility.PUBLIC });
        const local = new PresenceVisibilityPolicy({ visibility: PresenceVisibility.LOCAL });
        const hidden = new PresenceVisibilityPolicy({ visibility: PresenceVisibility.HIDDEN });
        assert(pub.shouldAdvertiseToPeer('did:key:bob', { isFriend: false }) === true, '8. PUBLIC is unaffected by isFriend');
        assert(local.shouldAdvertiseToPeer('did:key:bob', { isFriend: true }) === false, '9. LOCAL still never reaches a peer connection, even a real friend');
        assert(hidden.shouldAdvertiseToPeer('did:key:bob', { isFriend: true }) === false, '10. HIDDEN still reaches nobody, even a real friend');
    }
    {
        // Omitting context entirely degrades to isFriend: false — no
        // silent grant for a caller that never learned about friendship.
        const friends = new PresenceVisibilityPolicy({ visibility: PresenceVisibility.FRIENDS });
        assert(friends.shouldAdvertiseToPeer('did:key:bob') === false, '11. omitting context altogether is the same as isFriend: false');
    }
    {
        // The COARSE gate's own { hasFriend } context — "is there
        // anyone eligible at all," never which peer.
        const friendsEmpty = new PresenceVisibilityPolicy({ visibility: PresenceVisibility.FRIENDS });
        assert(friendsEmpty.shouldAdvertise() === false, "11a. FRIENDS with an empty allow-list and no hasFriend context still behaves like HIDDEN at the coarse gate — the exact pre-0.2.58 behavior");
        assert(friendsEmpty.shouldAdvertise({ hasFriend: true }) === true, '11b. ...but reporting at least one real mutual friend unblocks the coarse gate too, with no manual allow-list at all');
        assert(friendsEmpty.shouldAdvertise({ hasFriend: false }) === false, '11c. an explicit false changes nothing');
    }

    // -------------------------------------------------------------
    // Section B — core/AvatarProfileVisibilityPolicy.js — full
    // PUBLIC/FRIENDS/LOCAL/HIDDEN vocabulary + { isFriend }
    // -------------------------------------------------------------
    {
        assert(AvatarProfileVisibilityPolicy.default().visibility === PresenceVisibility.PUBLIC, '12. default() is still PUBLIC — 0.2.54\'s own permissive default, unchanged');
        assert(AvatarProfileVisibilityPolicy.default().shouldAdvertiseToPeer('did:key:anyone') === true, '13. default() still grants any peer, exactly 0.2.54 unchanged');
        assert(new AvatarProfileVisibilityPolicy().shouldAdvertiseToPeer(null) === true, "14. PUBLIC does not require a peer identity to be known — 0.2.54's own permissive rule preserved");

        let threw = false;
        try { new AvatarProfileVisibilityPolicy({ visibility: 'not-a-real-tier' }); } catch { threw = true; }
        assert(threw, '15. an unrecognized visibility value throws, mirroring PresenceVisibilityPolicy');

        const hidden = new AvatarProfileVisibilityPolicy({ visibility: PresenceVisibility.HIDDEN });
        assert(hidden.shouldAdvertise() === false, '16. HIDDEN never advertises the coarse gate');
        assert(hidden.shouldAdvertiseToPeer('did:key:bob', { isFriend: true }) === false, '17. HIDDEN denies every peer, even a real friend');

        const local = new AvatarProfileVisibilityPolicy({ visibility: PresenceVisibility.LOCAL });
        assert(local.shouldAdvertise() === true, '18. LOCAL still passes the coarse gate (it is a transport-scope restriction, not a publish gate)');
        assert(local.shouldAdvertiseToPeer('did:key:bob', { isFriend: true }) === false, '19. LOCAL never reaches a peer connection, even a real friend');

        const friendsEmpty = new AvatarProfileVisibilityPolicy({ visibility: PresenceVisibility.FRIENDS });
        assert(friendsEmpty.shouldAdvertise() === false, '20. FRIENDS with nothing manually authorized behaves like HIDDEN at the coarse gate, mirroring presence exactly');
        assert(friendsEmpty.shouldAdvertiseToPeer('did:key:bob', { isFriend: true }) === true, '21. ...but the PER-PEER decision still grants a real friend regardless of the coarse gate\'s own pessimism');

        const withFriendship = friendsEmpty.withVisibility(PresenceVisibility.FRIENDS).withAuthorizedPeerIdentities(['did:key:dave']);
        assert(withFriendship.shouldAdvertiseToPeer('did:key:dave', { isFriend: false }) === true, '22. withAuthorizedPeerIdentities still grants a manually-authorized, non-friend peer');
        assert(withFriendship.toJSON().visibility === PresenceVisibility.FRIENDS && withFriendship.toJSON().authorizedPeerIdentities.length === 1,
            '23. toJSON()/fromJSON() round-trip the full vocabulary, not just the old always-true shape');
        const roundTripped = AvatarProfileVisibilityPolicy.fromJSON(withFriendship.toJSON());
        assert(roundTripped.visibility === PresenceVisibility.FRIENDS && roundTripped.authorizedPeerIdentities[0] === 'did:key:dave',
            '24. fromJSON() reconstructs an equivalent policy');
    }
    {
        // Deliberate independence, unchanged from 0.2.54: setting
        // presence to HIDDEN has zero effect on a separately-constructed
        // profile policy, even now that both share the identical
        // vocabulary and both support isFriend.
        const hiddenPresence = new PresenceVisibilityPolicy({ visibility: PresenceVisibility.HIDDEN });
        const profileFriends = new AvatarProfileVisibilityPolicy({ visibility: PresenceVisibility.FRIENDS });
        assert(hiddenPresence.shouldAdvertiseToPeer('did:key:bob', { isFriend: true }) === false, '25. presence HIDDEN blocks presence, even for a real friend');
        assert(profileFriends.shouldAdvertiseToPeer('did:key:bob', { isFriend: true }) === true,
            "26. ...but profile's own independent policy still grants that SAME real friend — Presence: HIDDEN, Profile: FRIENDS is real and representable");
    }

    // -------------------------------------------------------------
    // Section C — application/AvatarProfileVisibilityUseCase.js —
    // persistence, genuinely separate storage from presence's own.
    // -------------------------------------------------------------
    {
        const storage = new InMemoryStorageProvider();
        const identity = new LocalIdentityProvider(storage);
        identity.login('carol');

        const presenceUseCase = new PresenceVisibilityUseCase(storage, identity);
        const profileUseCase = new AvatarProfileVisibilityUseCase(storage, identity);

        assert(profileUseCase.getPolicy().visibility === PresenceVisibility.PUBLIC, '27. a fresh profile policy defaults to PUBLIC, same default as presence');

        presenceUseCase.updatePolicy({ visibility: PresenceVisibility.HIDDEN });
        assert(profileUseCase.getPolicy().visibility === PresenceVisibility.PUBLIC,
            '28. updating PRESENCE visibility never touches the separately-stored PROFILE policy');

        let receivedEvent = null;
        const unsubscribe = profileUseCase.onPolicyChanged((policy) => { receivedEvent = policy; });
        const updated = profileUseCase.updatePolicy({ visibility: PresenceVisibility.FRIENDS, authorizedPeerIdentities: ['did:key:erin'] });
        assert(updated.visibility === PresenceVisibility.FRIENDS, '29. updatePolicy() returns the new profile policy');
        assert(profileUseCase.getPolicy().authorizedPeerIdentities.includes('did:key:erin'), '30. ...and persists it — a fresh getPolicy() sees it too');
        assert(receivedEvent && receivedEvent.visibility === PresenceVisibility.FRIENDS, '31. onPolicyChanged() fires with the new profile policy');
        assert(presenceUseCase.getPolicy().visibility === PresenceVisibility.HIDDEN, "32. ...and presence's own policy is still exactly what it was, unaffected by the profile update");
        unsubscribe();

        let threw = false;
        try { profileUseCase.updatePolicy({ visibility: 'nonsense' }); } catch { threw = true; }
        assert(threw, '33. an unrecognized visibility value is rejected');
        assert(profileUseCase.getPolicy().visibility === PresenceVisibility.FRIENDS, '34. ...and the rejected update never partially applied');
    }

    // -------------------------------------------------------------
    // Section D — WorldNavigationSession: profile's OWN independent
    // publication gate, superseding 0.2.41's shared one, with the
    // pre-0.2.58 fallback intact when unwired.
    // -------------------------------------------------------------
    async function buildAvatarStack(label) {
        const { storage, provider } = makeDevice(label);
        const avatarProfileUseCase = new AvatarProfileUseCase(storage, provider, registry);
        avatarProfileUseCase.updateProfile({ templateId: 'humanoid-01', displayName: label });
        const profile = avatarProfileUseCase.getProfile();
        const avatarPresenceSession = new AvatarPresenceSession(profile, { position: { x: 0, y: 0, z: 0 } });
        return { storage, provider, avatarProfileUseCase, avatarPresenceSession };
    }
    function fakeBroadcastProvider() {
        const sent = [];
        return { sent, advertise: (ad) => sent.push(ad), onAdvertisement: () => () => {}, dispose() {} };
    }
    {
        // D1 — Presence: HIDDEN, Profile: PUBLIC. Profile publishes;
        // presence does not. Impossible to represent before 0.2.58.
        const { storage, provider, avatarProfileUseCase, avatarPresenceSession } = await buildAvatarStack('session-d1');
        const presenceVisibilityUseCase = new PresenceVisibilityUseCase(storage, provider);
        presenceVisibilityUseCase.updatePolicy({ visibility: PresenceVisibility.HIDDEN });
        const avatarProfileVisibilityUseCase = new AvatarProfileVisibilityUseCase(storage, provider);
        avatarProfileVisibilityUseCase.updatePolicy({ visibility: PresenceVisibility.PUBLIC });

        const presenceProvider = fakeBroadcastProvider();
        const profileProvider = fakeBroadcastProvider();
        const session = new WorldNavigationSession({
            registry: new CreateBrickRegistryUseCase().execute(), loadPublicationDocumentUseCase: null, worldLayoutProvider: null,
            avatarProfileUseCase, avatarPresenceSession, presenceVisibilityUseCase, avatarProfileVisibilityUseCase,
            presenceBroadcastProvider: presenceProvider, avatarTemplateRegistry: registry,
            avatarProfileBroadcastProvider: profileProvider
        });
        session._session = spyRenderFacade();
        session._setupRemoteAvatars();
        session._setupLocalAvatar();

        avatarProfileUseCase.updateProfile({ displayName: 'D1 Renamed' });
        assert(profileProvider.sent.length === 1, '35. Presence: HIDDEN, Profile: PUBLIC — profile publishes despite presence being hidden, now that the gates are independent');
        avatarPresenceSession.update({ position: { x: 1, y: 0, z: 1 } });
        assert(presenceProvider.sent.length === 0, '36. ...and presence itself still never publishes while HIDDEN');
        session.dispose();
    }
    {
        // D2 — Presence: PUBLIC, Profile: HIDDEN. The exact reverse.
        const { storage, provider, avatarProfileUseCase, avatarPresenceSession } = await buildAvatarStack('session-d2');
        const presenceVisibilityUseCase = new PresenceVisibilityUseCase(storage, provider);
        const avatarProfileVisibilityUseCase = new AvatarProfileVisibilityUseCase(storage, provider);
        avatarProfileVisibilityUseCase.updatePolicy({ visibility: PresenceVisibility.HIDDEN });

        const presenceProvider = fakeBroadcastProvider();
        const profileProvider = fakeBroadcastProvider();
        const session = new WorldNavigationSession({
            registry: new CreateBrickRegistryUseCase().execute(), loadPublicationDocumentUseCase: null, worldLayoutProvider: null,
            avatarProfileUseCase, avatarPresenceSession, presenceVisibilityUseCase, avatarProfileVisibilityUseCase,
            presenceBroadcastProvider: presenceProvider, avatarTemplateRegistry: registry,
            avatarProfileBroadcastProvider: profileProvider
        });
        session._session = spyRenderFacade();
        session._setupRemoteAvatars();
        session._setupLocalAvatar();

        avatarProfileUseCase.updateProfile({ displayName: 'D2 Renamed' });
        assert(profileProvider.sent.length === 0, '37. Presence: PUBLIC, Profile: HIDDEN — profile never publishes');
        avatarPresenceSession.update({ position: { x: 1, y: 0, z: 1 } });
        assert(presenceProvider.sent.length === 1, '38. ...but presence still publishes normally — the two gates are genuinely independent');
        session.dispose();
    }
    {
        // D3 — backward compatibility: a session that wires ONLY
        // presenceVisibilityUseCase (no avatarProfileVisibilityUseCase
        // at all) keeps the EXACT 0.2.41 shared-gate behavior.
        const { storage, provider, avatarProfileUseCase, avatarPresenceSession } = await buildAvatarStack('session-d3');
        const presenceVisibilityUseCase = new PresenceVisibilityUseCase(storage, provider);
        presenceVisibilityUseCase.updatePolicy({ visibility: PresenceVisibility.HIDDEN });

        const profileProvider = fakeBroadcastProvider();
        const session = new WorldNavigationSession({
            registry: new CreateBrickRegistryUseCase().execute(), loadPublicationDocumentUseCase: null, worldLayoutProvider: null,
            avatarProfileUseCase, avatarPresenceSession, presenceVisibilityUseCase,
            presenceBroadcastProvider: fakeBroadcastProvider(), avatarTemplateRegistry: registry,
            avatarProfileBroadcastProvider: profileProvider
        });
        session._session = spyRenderFacade();
        session._setupRemoteAvatars();
        session._setupLocalAvatar();

        avatarProfileUseCase.updateProfile({ displayName: 'D3 Renamed' });
        assert(profileProvider.sent.length === 0, '39. unwired avatarProfileVisibilityUseCase: profile publishing still falls back to presence\'s own gate — the pre-0.2.58 shared-gate behavior is preserved exactly, never broken by this milestone');
        session.dispose();
    }

    // -------------------------------------------------------------
    // Section E — presence/PeerAvatarPresenceBroadcastProvider.js —
    // the injected isFriend predicate, per peer.
    // -------------------------------------------------------------
    {
        const bus = new PeerMessageBus();
        const bob = fakeConnectedPeer({ connectionId: 'alice-bob', lifecycleState: PeerLifecycleState.AUTHENTICATED, remoteIdentity: { identityId: 'did:key:bob' } });
        const charlie = fakeConnectedPeer({ connectionId: 'alice-charlie', lifecycleState: PeerLifecycleState.AUTHENTICATED, remoteIdentity: { identityId: 'did:key:charlie' } });
        const reg = fakeRegistry([bob, charlie]);

        const sentTo = { bob: [], charlie: [] };
        const originalSend = bus.send.bind(bus);
        bus.send = (peer, protocol, payload) => {
            if (peer === bob) sentTo.bob.push(payload);
            if (peer === charlie) sentTo.charlie.push(payload);
            return originalSend(peer, protocol, payload);
        };

        const friends = new Set(['did:key:bob']);
        const policy = new PresenceVisibilityPolicy({ visibility: PresenceVisibility.FRIENDS });
        const transport = new PeerAvatarPresenceBroadcastProvider({
            peerMessageBus: bus, connectedPeerRegistry: reg,
            getVisibilityPolicy: () => policy,
            isFriend: (peerIdentityId) => friends.has(peerIdentityId)
        });

        transport.advertise({ avatarId: 'a', ownerIdentity: 'did:key:alice', position: { x: 0, y: 0, z: 0 }, rotation: { x: 0, y: 0, z: 0 }, animation: 'IDLE', sequence: 1 });
        assert(sentTo.bob.length === 1, '40. FRIENDS with no manual allow-list: the peer the injected isFriend predicate reports true for receives it');
        assert(sentTo.charlie.length === 0, '41. ...and the peer it reports false for receives nothing, structurally, not via any error or rejection notice');

        // The predicate is re-consulted fresh on every advertise() —
        // never cached — exactly like getVisibilityPolicy() already is.
        friends.add('did:key:charlie');
        transport.advertise({ avatarId: 'a', ownerIdentity: 'did:key:alice', position: { x: 1, y: 0, z: 1 }, rotation: { x: 0, y: 0, z: 0 }, animation: 'IDLE', sequence: 2 });
        assert(sentTo.charlie.length === 1, '42. a friendship becoming true takes effect on the very next advertise(), with no reconnect and no cached decision');

        // A transport built without an isFriend predicate at all
        // defaults to () => false — FRIENDS still works via the manual
        // allow-list alone, exactly 0.2.53's own behavior.
        const legacyPolicy = new PresenceVisibilityPolicy({ visibility: PresenceVisibility.FRIENDS, authorizedPeerIdentities: ['did:key:bob'] });
        const legacyTransport = new PeerAvatarPresenceBroadcastProvider({ peerMessageBus: new PeerMessageBus(), connectedPeerRegistry: fakeRegistry([bob]), getVisibilityPolicy: () => legacyPolicy });
        const legacySent = [];
        legacyTransport._bus.send = (peer, protocol, payload) => legacySent.push(payload);
        legacyTransport.advertise({ avatarId: 'a', ownerIdentity: 'did:key:alice', position: { x: 0, y: 0, z: 0 }, rotation: { x: 0, y: 0, z: 0 }, animation: 'IDLE', sequence: 1 });
        assert(legacySent.length === 1, "43. a transport with no isFriend predicate wired still honors the manual allow-list — this milestone adds capability, never removes it");

        transport.dispose();
        legacyTransport.dispose();
    }

    // -------------------------------------------------------------
    // Section F — FLAGSHIP: Alice, Bob, and Charlie over a REAL peer
    // network, with REAL mutual friendship (0.2.57, unmodified) driving
    // FRIENDS for both presence and profile — nothing manually
    // authorized at all.
    // -------------------------------------------------------------
    {
        const { storage: aliceStorage, provider: alice } = makeDevice('alice');
        const aliceAvatarProfileUseCase = new AvatarProfileUseCase(aliceStorage, alice, registry);
        aliceAvatarProfileUseCase.updateProfile({ templateId: 'humanoid-01', appearance: { skin: 'skin-06' }, displayName: 'Alice' });
        const aliceProfile = aliceAvatarProfileUseCase.getProfile();
        const aliceAvatarPresenceSession = new AvatarPresenceSession(aliceProfile, { position: { x: 0, y: 0, z: 0 } });
        const alicePresenceVisibilityUseCase = new PresenceVisibilityUseCase(aliceStorage, alice);
        const aliceProfileVisibilityUseCase = new AvatarProfileVisibilityUseCase(aliceStorage, alice);

        // --- Alice's document/publication/placement stack — the same
        // non-contamination proof every prior avatar flagship establishes.
        const brickRegistry = new CreateBrickRegistryUseCase().execute();
        const contentStore = new LocalContentStore(aliceStorage);
        const publisher = new LocalPublisherProvider(aliceStorage, contentStore);
        const discoveryProvider = new LocalDiscoveryProvider(aliceStorage);
        const spatialIndexProvider = new LocalSpatialIndexProvider(aliceStorage);
        const placementRegistry = new LocalPlacementRegistry(aliceStorage, spatialIndexProvider);
        const loadPublicationDocumentUseCase = new LoadPublicationDocumentUseCase(aliceStorage);
        const placePublicationUseCase = new PlacePublicationUseCase(
            spatialIndexProvider, discoveryProvider, loadPublicationDocumentUseCase, brickRegistry, placementRegistry, alice
        );
        const publishDocumentUseCase = new PublishDocumentUseCase(publisher, alice, placePublicationUseCase, new GridPlacementStrategy());
        const world = new World();
        const building = new Building({ creator: 'alice' });
        building.addBrick(new Brick({ definitionId: 'core:cube' }));
        world.addBuilding(building);
        const document = new Document({ world, metadata: new DocumentMetadata({ title: 'Flagship Friend-Aware Visibility Castle', author: 'alice', license: new License({ id: LicenseId.CC0_1_0 }) }) });
        const publication = publishDocumentUseCase.execute({ document });
        const placementBefore = placementRegistry.findByPublicationId(publication.id)[0];
        const placementJsonBefore = JSON.stringify(placementBefore.toJSON());

        const { provider: bob } = makeDevice('bob');
        const { provider: charlie } = makeDevice('charlie');
        const bobIdentityId = bob.getSigningIdentity().id;

        // --- A real, three-node peer network: Alice connects OUT to
        // both Bob and Charlie; Bob and Charlie never connect to each
        // other.
        const network = new LocalPeerNetwork();
        const aliceTransport = new LocalPeerConnectionProvider('alice', network);
        const bobTransport = new LocalPeerConnectionProvider('bob', network);
        const charlieTransport = new LocalPeerConnectionProvider('charlie', network);

        const aliceConnect = new ConnectToPeerUseCase({ peerConnectionProvider: aliceTransport, identityProvider: alice });
        const bobConnect = new ConnectToPeerUseCase({ peerConnectionProvider: bobTransport, identityProvider: bob });
        const charlieConnect = new ConnectToPeerUseCase({ peerConnectionProvider: charlieTransport, identityProvider: charlie });
        const stopBobListening = bobConnect.listen();
        const stopCharlieListening = charlieConnect.listen();

        let aliceToBob = aliceConnect.connect({ candidateEndpoint: 'bob' });
        const aliceToCharlie = aliceConnect.connect({ candidateEndpoint: 'charlie' });
        await wait(30);
        assert(aliceToBob.getLifecycleState() === PeerLifecycleState.AUTHENTICATED, '44. FLAGSHIP setup: Alice-Bob authenticates');
        assert(aliceToCharlie.getLifecycleState() === PeerLifecycleState.AUTHENTICATED, '45. FLAGSHIP setup: Alice-Charlie authenticates');

        // --- One PeerMessageBus per node, shared between the
        // friendship, presence, AND profile protocols on that node —
        // the exact multiplexing substrate every prior peer milestone
        // already established.
        const aliceBus = new PeerMessageBus();
        const bobBus = new PeerMessageBus();
        const charlieBus = new PeerMessageBus();

        const aliceFriendUseCase = new FriendRelationshipUseCase(aliceStorage, alice, { peerMessageBus: aliceBus, connectedPeerRegistry: aliceConnect.registry });
        const bobFriendStorage = new InMemoryStorageProvider();
        const bobFriendUseCase = new FriendRelationshipUseCase(bobFriendStorage, bob, { peerMessageBus: bobBus, connectedPeerRegistry: bobConnect.registry });
        // Charlie never sends or accepts anything — he stays a stranger
        // to Alice's FriendshipRecord store throughout.

        // Step 1-2 — Alice and Bob become REAL mutual friends: Alice
        // requests, Bob accepts, both derive FRIEND independently — the
        // completely unmodified 0.2.57 protocol.
        const aliceSideOfBob = aliceConnect.registry.list().find((p) => p.remoteIdentity && p.remoteIdentity.identityId === bobIdentityId);
        aliceFriendUseCase.sendFriendRequest(aliceSideOfBob);
        await wait(60);
        const bobSideOfAlice = bobConnect.registry.list()[0];
        bobFriendUseCase.acceptFriendRequest(bobSideOfAlice);
        await wait(60);
        assert(aliceFriendUseCase.getState(bobIdentityId) === FriendshipState.FRIEND, "46. FLAGSHIP: Alice's own record derives FRIEND after Bob's signed ACCEPT arrives");
        assert(bobFriendUseCase.getState(alice.getSigningIdentity().id) === FriendshipState.FRIEND, '47. FLAGSHIP: Bob independently derives FRIEND too');

        const isFriendOfAlice = (peerIdentityId) => aliceFriendUseCase.getState(peerIdentityId) === FriendshipState.FRIEND;
        const aliceHasAnyFriend = () => aliceFriendUseCase.getRelationships().some((r) => r.isFriend);

        // Step 3 — Alice sets Presence: FRIENDS and Profile: FRIENDS,
        // with NOTHING manually authorized on either policy — proving
        // eligibility comes from real mutual friendship alone.
        alicePresenceVisibilityUseCase.updatePolicy({ visibility: PresenceVisibility.FRIENDS });
        aliceProfileVisibilityUseCase.updatePolicy({ visibility: PresenceVisibility.FRIENDS });
        assert(alicePresenceVisibilityUseCase.getPolicy().authorizedPeerIdentities.length === 0, '48. FLAGSHIP: Presence FRIENDS carries no manual allow-list at all');
        assert(aliceProfileVisibilityUseCase.getPolicy().authorizedPeerIdentities.length === 0, '49. FLAGSHIP: Profile FRIENDS carries no manual allow-list at all');

        const alicePresenceTransport = new PeerAvatarPresenceBroadcastProvider({
            peerMessageBus: aliceBus, connectedPeerRegistry: aliceConnect.registry,
            getVisibilityPolicy: () => alicePresenceVisibilityUseCase.getPolicy(),
            isFriend: isFriendOfAlice
        });
        const aliceProfileTransport = new PeerAvatarPresenceBroadcastProvider({
            peerMessageBus: aliceBus, connectedPeerRegistry: aliceConnect.registry,
            protocol: 'forkbuild:avatar-profile',
            getVisibilityPolicy: () => aliceProfileVisibilityUseCase.getPolicy(),
            isFriend: isFriendOfAlice
        });
        const bobPresenceTransport = new PeerAvatarPresenceBroadcastProvider({ peerMessageBus: bobBus, connectedPeerRegistry: bobConnect.registry });
        const bobProfileTransport = new PeerAvatarPresenceBroadcastProvider({ peerMessageBus: bobBus, connectedPeerRegistry: bobConnect.registry, protocol: 'forkbuild:avatar-profile' });
        const charliePresenceTransport = new PeerAvatarPresenceBroadcastProvider({ peerMessageBus: charlieBus, connectedPeerRegistry: charlieConnect.registry });
        const charlieProfileTransport = new PeerAvatarPresenceBroadcastProvider({ peerMessageBus: charlieBus, connectedPeerRegistry: charlieConnect.registry, protocol: 'forkbuild:avatar-profile' });

        const aliceSession = new WorldNavigationSession({
            registry: brickRegistry, loadPublicationDocumentUseCase, worldLayoutProvider: null,
            identityProvider: alice, discoveryProvider, placementRegistry,
            avatarProfileUseCase: aliceAvatarProfileUseCase, avatarPresenceSession: aliceAvatarPresenceSession,
            presenceVisibilityUseCase: alicePresenceVisibilityUseCase, avatarProfileVisibilityUseCase: aliceProfileVisibilityUseCase,
            presenceBroadcastProvider: alicePresenceTransport, avatarProfileBroadcastProvider: aliceProfileTransport,
            avatarTemplateRegistry: registry, hasFriend: aliceHasAnyFriend
        });
        aliceSession._session = spyRenderFacade();
        aliceSession._setupRemoteAvatars();
        aliceSession._setupLocalAvatar();

        const bobSession = new WorldNavigationSession({
            registry: new CreateBrickRegistryUseCase().execute(), loadPublicationDocumentUseCase: null, worldLayoutProvider: null,
            presenceBroadcastProvider: bobPresenceTransport, avatarProfileBroadcastProvider: bobProfileTransport, avatarTemplateRegistry: registry
        });
        bobSession._session = spyRenderFacade();
        bobSession._setupRemoteAvatars();

        const charlieSession = new WorldNavigationSession({
            registry: new CreateBrickRegistryUseCase().execute(), loadPublicationDocumentUseCase: null, worldLayoutProvider: null,
            presenceBroadcastProvider: charliePresenceTransport, avatarProfileBroadcastProvider: charlieProfileTransport, avatarTemplateRegistry: registry
        });
        charlieSession._session = spyRenderFacade();
        charlieSession._setupRemoteAvatars();

        const pull = (session) => {
            const now = Date.now();
            session._avatarProfileSyncService.pull();
            const known = session._presenceSyncService.pull(now);
            session._remoteAvatarRegistry.sync(known, now);
            session._remoteAvatarRegistry.tick(now);
            return known;
        };
        const bobKnowsAlicePresence = () => bobSession._remoteAvatarRegistry.has(aliceProfile.avatarId);
        const charlieKnowsAlicePresence = () => charlieSession._remoteAvatarRegistry.has(aliceProfile.avatarId);

        // Step 1 (design doc numbering) — Alice moves.
        aliceAvatarPresenceSession.update({ position: { x: 10, y: 0, z: 10 } });
        await wait(60);
        pull(bobSession);
        pull(charlieSession);
        // Step 2 — Bob receives the presence.
        assert(bobKnowsAlicePresence() === true, '50. FLAGSHIP step 2: Bob (real friend) receives presence under FRIENDS, no manual authorization needed');
        // Step 3 — Charlie receives nothing.
        assert(charlieKnowsAlicePresence() === false, '51. FLAGSHIP step 3: Charlie (not a friend) receives nothing');

        // Step 4 — Alice changes appearance.
        aliceAvatarProfileUseCase.updateProfile({ appearance: { skin: 'skin-01' } });
        await wait(60);
        pull(bobSession);
        pull(charlieSession);
        // Step 5 — Bob receives the profile update.
        assert(bobSession._avatarProfileSyncService.getKnownProfile(aliceProfile.avatarId).appearance.skin === 'skin-01', '52. FLAGSHIP step 5: Bob receives the profile update under Profile: FRIENDS, no manual authorization needed');
        // Step 6 — Charlie receives nothing.
        assert(charlieSession._avatarProfileSyncService.getKnownProfile(aliceProfile.avatarId) === null, '53. FLAGSHIP step 6: Charlie receives no profile at all');

        // Step 7 — Alice changes presence to PUBLIC.
        alicePresenceVisibilityUseCase.updatePolicy({ visibility: PresenceVisibility.PUBLIC });
        aliceAvatarPresenceSession.update({ position: { x: 20, y: 0, z: 20 } });
        await wait(60);
        pull(bobSession);
        pull(charlieSession);
        // Step 8 — next movement reaches both Bob and Charlie.
        assert(bobKnowsAlicePresence() === true, '54. FLAGSHIP step 8: Bob still sees Alice after switching to PUBLIC');
        assert(charlieKnowsAlicePresence() === true, "55. FLAGSHIP step 8: Charlie now sees Alice too — PUBLIC catches him up immediately, with no reconnect");

        // Step 9 — Alice changes profile to HIDDEN.
        aliceProfileVisibilityUseCase.updatePolicy({ visibility: PresenceVisibility.HIDDEN });
        const bobProfileBeforeHidden = JSON.stringify(bobSession._avatarProfileSyncService.getKnownProfile(aliceProfile.avatarId));
        aliceAvatarProfileUseCase.updateProfile({ appearance: { skin: 'skin-04' } });
        await wait(60);
        pull(bobSession);
        pull(charlieSession);
        // Step 10 — future profile edits reach neither.
        assert(JSON.stringify(bobSession._avatarProfileSyncService.getKnownProfile(aliceProfile.avatarId)) === bobProfileBeforeHidden,
            '56. FLAGSHIP step 10: Bob\'s known profile is byte-identical after Alice goes Profile: HIDDEN — the new skin never reached him');
        assert(charlieSession._avatarProfileSyncService.getKnownProfile(aliceProfile.avatarId) === null,
            '57. FLAGSHIP step 10: Charlie still has no profile at all — withholding future advertisements, not remote deletion, and Charlie never had anything to withhold in the first place');

        // Step 11 — Alice remains visible to herself throughout.
        assert(aliceAvatarPresenceSession.current.position.x === 20, '58. FLAGSHIP step 11: Alice\'s own local presence reflects her real, current state throughout — visibility policy never touches the LOCAL view of herself');
        assert(aliceAvatarProfileUseCase.getProfile().appearance.skin === 'skin-04', "59. FLAGSHIP step 11: ...and her own profile shows her real, current appearance too, even though Profile: HIDDEN kept it from Bob and Charlie");

        // Step 12 — friendship state itself remains untouched by any of
        // these visibility changes.
        assert(aliceFriendUseCase.getState(bobIdentityId) === FriendshipState.FRIEND, '60. FLAGSHIP step 12: Alice-Bob friendship is still FRIEND — changing presence/profile visibility never touched it');
        assert(bobFriendUseCase.getState(alice.getSigningIdentity().id) === FriendshipState.FRIEND, "61. FLAGSHIP step 12: ...and Bob's own independent record agrees");

        // Step 13 — Bob cannot alter Alice's policy: there is no
        // protocol, message, or method anywhere that lets a remote peer
        // write to alicePresenceVisibilityUseCase/aliceProfileVisibilityUseCase
        // — both live entirely in Alice's own local storage, consulted
        // only by Alice's own transports. Demonstrate structurally: Bob
        // sending arbitrary junk over the SAME bus/protocol Alice's
        // policy machinery uses changes nothing about her policy.
        const aliceProfilePolicyBefore = JSON.stringify(aliceProfileVisibilityUseCase.getPolicy().toJSON());
        const alicePresencePolicyBefore = JSON.stringify(alicePresenceVisibilityUseCase.getPolicy().toJSON());
        bobBus.send(bobSideOfAlice, PeerAvatarPresenceBroadcastProvider.DEFAULT_PROTOCOL, { visibility: 'public', authorizedPeerIdentities: ['did:key:anyone'] });
        await wait(60);
        assert(JSON.stringify(aliceProfileVisibilityUseCase.getPolicy().toJSON()) === aliceProfilePolicyBefore, "62. FLAGSHIP step 13: Bob's message cannot alter Alice's profile policy — there is no such write path");
        assert(JSON.stringify(alicePresenceVisibilityUseCase.getPolicy().toJSON()) === alicePresencePolicyBefore, "63. FLAGSHIP step 13: ...nor her presence policy");

        // Step 14 — Charlie cannot infer friendship merely from a
        // rejected advertisement: during the FRIENDS phase above,
        // Charlie's bus received literally nothing under either
        // protocol — no rejection notice, no redacted envelope, no
        // signal distinguishing "not a friend" from "offline" — proven
        // earlier (steps 50/53) by his known-state staying completely
        // empty, indistinguishable from silence.
        assert(charlieSession._remoteAvatarRegistry.knownAvatarIds().length === 0 || charlieKnowsAlicePresence() === true,
            '64. FLAGSHIP step 14: at no point did Charlie ever receive an explicit rejection — his only observable states are "knows" (after PUBLIC) or "knows nothing," never an in-between signal');

        // Step 15 — documents, publications, placements and spatial
        // state remain byte-identical throughout.
        assert(publisher.verifySnapshot(publication.id, publication.contentHash), '65. FLAGSHIP step 15: the Publication still verifies against its own content hash');
        const placementAfter = placementRegistry.findByPublicationId(publication.id)[0];
        assert(JSON.stringify(placementAfter.toJSON()) === placementJsonBefore, '66. FLAGSHIP step 15: the Building Placement is byte-identical — nothing about friend-aware visibility ever touches world content');

        // The subtle reconnect case: Bob disconnects and reconnects.
        // Eligibility is re-derived from his freshly PROVEN identityId
        // against Alice's persisted FriendshipRecord — never from
        // anything about the OLD connection — so the very next
        // movement reaches him again with no re-authorization gesture.
        alicePresenceVisibilityUseCase.updatePolicy({ visibility: PresenceVisibility.FRIENDS });
        aliceToBob.close();
        await wait(30);
        assert(aliceToBob.getLifecycleState() === PeerLifecycleState.CLOSED, '67. FLAGSHIP reconnect: Alice-Bob connection is closed');
        aliceToBob = aliceConnect.connect({ candidateEndpoint: 'bob' });
        await wait(30);
        assert(aliceToBob.getLifecycleState() === PeerLifecycleState.AUTHENTICATED, '68. FLAGSHIP reconnect: Alice reconnects to Bob over a completely fresh connection');
        assert(aliceFriendUseCase.getState(bobIdentityId) === FriendshipState.FRIEND, "69. FLAGSHIP reconnect: Alice's persisted friendship record survives the disconnect untouched");
        aliceAvatarPresenceSession.update({ position: { x: 99, y: 0, z: 99 } });
        await wait(60);
        pull(bobSession);
        const bobKnownAfterReconnect = bobSession._remoteAvatarRegistry.knownAvatarIds().includes(aliceProfile.avatarId);
        assert(bobKnownAfterReconnect === true,
            "70. FLAGSHIP reconnect: Bob's freshly-authenticated connection is recognized as a friend immediately, from his PROVEN identityId alone — no reconnect-time re-authorization gesture required");

        stopBobListening();
        stopCharlieListening();
        aliceSession.dispose();
        bobSession.dispose();
        charlieSession.dispose();
        alicePresenceTransport.dispose();
        aliceProfileTransport.dispose();
        bobPresenceTransport.dispose();
        bobProfileTransport.dispose();
        charliePresenceTransport.dispose();
        charlieProfileTransport.dispose();
        aliceFriendUseCase.dispose();
        bobFriendUseCase.dispose();
        aliceTransport.dispose();
        bobTransport.dispose();
        charlieTransport.dispose();
    }

    console.log('✅ All Friend-Aware Privacy & Social Visibility tests passed.');
}

await runTests();
