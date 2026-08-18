import { PresenceVisibility } from '../core/PresenceVisibility.js';
import { PresenceVisibilityPolicy } from '../core/PresenceVisibilityPolicy.js';
import { PresenceVisibilityUseCase } from '../application/PresenceVisibilityUseCase.js';
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
import { getAvatarPresenceSigningDescriptor } from '../core/AvatarPresenceAdvertisement.js';

// 0.2.53 — Peer-Based Avatar Presence.
//
// "Replace BroadcastChannel as the primary remote-presence transport
// with authenticated peer messaging, while preserving the entire
// 0.2.38 presence trust model." This file proves exactly that claim,
// never the trust model itself (already proven, unmodified, in
// tests/AvatarPresenceTrust.test.js over BroadcastChannel) and never
// the peer authentication/messaging substrate itself (already proven,
// unmodified, in tests/PeerAuthentication.test.js/PeerMessaging.test.js).
//
//   Section A: core/PresenceVisibilityPolicy.js#shouldAdvertiseToPeer()
//              — the one new per-peer question this milestone adds
//   Section B: presence/PeerAvatarPresenceBroadcastProvider.js
//              construction, attach/detach, and dispose()
//   Section C: advertise() fan-out — AUTHENTICATED gating and
//              per-peer visibility, against minimal stand-ins
//   Section D: FLAGSHIP — Alice, Bob, and Charlie over a REAL
//              peer network: PUBLIC reaches both, FRIENDS(Bob) reaches
//              only Bob, HIDDEN reaches neither, PUBLIC again catches
//              both up, and a tampered advertisement sent over the
//              same authenticated peer transport is still rejected by
//              the completely unmodified 0.2.38 trust boundary.

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
        setLocalAvatar: [], updateLocalAvatarPresence: [], setLocalAvatarVisible: [],
        setRemoteAvatar: [], updateRemoteAvatarPresence: [], removeRemoteAvatar: [], setRemoteAvatarsVisible: [],
        onAnimationFrameCallbacks: []
    };
    return {
        calls,
        pick: () => null, pickAvatar: () => null, pickGround: () => null,
        setLocalAvatar: (template, appearance, presence) => calls.setLocalAvatar.push({ template, appearance, presence }),
        updateLocalAvatarAppearance: () => {},
        updateLocalAvatarPresence: (presence) => calls.updateLocalAvatarPresence.push({ presence }),
        setLocalAvatarVisible: (visible) => calls.setLocalAvatarVisible.push(visible),
        removeLocalAvatar: () => {},
        setRemoteAvatar: (avatarId, template, appearance, presenceLike) => calls.setRemoteAvatar.push({ avatarId, presenceLike }),
        updateRemoteAvatarPresence: (avatarId, presenceLike) => calls.updateRemoteAvatarPresence.push({ avatarId, presenceLike }),
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

// A minimal ConnectedPeer-shaped stand-in for Sections B/C, matching
// exactly what PeerAvatarPresenceBroadcastProvider actually reads:
// connectionId/connection (for PeerMessageBus.attach()),
// getLifecycleState(), remoteIdentity, onStateChange().
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
    // -------------------------------------------------------------
    {
        const pub = new PresenceVisibilityPolicy({ visibility: PresenceVisibility.PUBLIC });
        assert(pub.shouldAdvertiseToPeer('did:key:bob') === true, '1. PUBLIC advertises to any peer');
        assert(pub.shouldAdvertiseToPeer('did:key:anyone-at-all') === true, '2. PUBLIC advertises to literally any peer identityId');
        assert(pub.shouldAdvertiseToPeer(null) === true, '3. PUBLIC does not even require a peer identity to be known');
    }
    {
        const hidden = new PresenceVisibilityPolicy({ visibility: PresenceVisibility.HIDDEN });
        assert(hidden.shouldAdvertiseToPeer('did:key:bob') === false, '4. HIDDEN never advertises to any peer');
    }
    {
        const local = new PresenceVisibilityPolicy({ visibility: PresenceVisibility.LOCAL });
        assert(local.shouldAdvertiseToPeer('did:key:bob') === false, '5. LOCAL never reaches a peer connection — LOCAL means the local/non-network transport only');
    }
    {
        const friends = new PresenceVisibilityPolicy({ visibility: PresenceVisibility.FRIENDS, authorizedPeerIdentities: ['did:key:bob'] });
        assert(friends.shouldAdvertiseToPeer('did:key:bob') === true, '6. FRIENDS advertises to an authorized peer identityId');
        assert(friends.shouldAdvertiseToPeer('did:key:charlie') === false, '7. FRIENDS does NOT advertise to an unauthorized peer, even though the coarse shouldAdvertise() would say yes');
        assert(friends.shouldAdvertiseToPeer(null) === false, '8. FRIENDS never advertises to an unknown/unproven peer identity');
        assert(friends.shouldAdvertise() === true, '9. the coarse gate still only checks "is there anyone authorized at all"');
    }
    {
        const emptyFriends = new PresenceVisibilityPolicy({ visibility: PresenceVisibility.FRIENDS, authorizedPeerIdentities: [] });
        assert(emptyFriends.shouldAdvertiseToPeer('did:key:bob') === false, '10. FRIENDS with an empty list advertises to nobody, per-peer, exactly matching its coarse HIDDEN-like behavior');
    }

    // -------------------------------------------------------------
    // Section B — construction, attach/detach, dispose()
    // -------------------------------------------------------------
    {
        let threw = false;
        try { new PeerAvatarPresenceBroadcastProvider({ connectedPeerRegistry: fakeRegistry() }); } catch { threw = true; }
        assert(threw, '11. construction without a peerMessageBus throws');
    }
    {
        let threw = false;
        try { new PeerAvatarPresenceBroadcastProvider({ peerMessageBus: new PeerMessageBus() }); } catch { threw = true; }
        assert(threw, '12. construction without a connectedPeerRegistry throws');
    }
    {
        const bus = new PeerMessageBus();
        const peerA = fakeConnectedPeer({ connectionId: 'a', lifecycleState: PeerLifecycleState.AUTHENTICATED });
        const reg = fakeRegistry([peerA]);
        const transport = new PeerAvatarPresenceBroadcastProvider({ peerMessageBus: bus, connectedPeerRegistry: reg });

        // A peer already present at construction time is attached
        // immediately — sending a raw envelope through peerA's own
        // connection should reach the bus's routing (proven indirectly:
        // subscribing after the fact still sees a message sent via the
        // bus to a NEW peer added afterward, see Section C).
        const peerB = fakeConnectedPeer({ connectionId: 'b', lifecycleState: PeerLifecycleState.AUTHENTICATED });
        reg.add(peerB);
        // attach() is idempotent and internal; there's no direct
        // observable here beyond "no throw" — Section C exercises the
        // actual delivery path end to end.
        transport.dispose();
        // dispose() must not throw a second time and must not disturb
        // the shared bus/registry it never owned.
        transport.dispose();
        assert(reg.list().length === 2, '13. dispose() never removes peers from the shared registry it does not own');
    }

    // -------------------------------------------------------------
    // Section C — advertise() fan-out: AUTHENTICATED gating and
    // per-peer visibility, against minimal stand-ins.
    // -------------------------------------------------------------
    {
        const bus = new PeerMessageBus();
        const authenticatedBob = fakeConnectedPeer({
            connectionId: 'alice-bob', lifecycleState: PeerLifecycleState.AUTHENTICATED,
            remoteIdentity: { identityId: 'did:key:bob' }
        });
        const authenticatingCharlie = fakeConnectedPeer({
            connectionId: 'alice-charlie', lifecycleState: PeerLifecycleState.AUTHENTICATING,
            remoteIdentity: null
        });
        const reg = fakeRegistry([authenticatedBob, authenticatingCharlie]);

        const sentTo = { bob: [], charlie: [] };
        bus.subscribe('forkbuild:avatar-presence', () => {}); // no-op, just to prove subscribe doesn't interfere
        const originalSend = bus.send.bind(bus);
        bus.send = (peer, protocol, payload) => {
            if (peer === authenticatedBob) sentTo.bob.push(payload);
            if (peer === authenticatingCharlie) sentTo.charlie.push(payload);
            return originalSend(peer, protocol, payload);
        };

        let policy = PresenceVisibilityPolicy.default(); // PUBLIC
        const transport = new PeerAvatarPresenceBroadcastProvider({
            peerMessageBus: bus, connectedPeerRegistry: reg, getVisibilityPolicy: () => policy
        });

        transport.advertise({ avatarId: 'alice-avatar', ownerIdentity: 'did:key:alice', position: { x: 1, y: 0, z: 1 }, rotation: { x: 0, y: 0, z: 0 }, animation: 'IDLE', sequence: 1 });
        assert(sentTo.bob.length === 1, '14. PUBLIC: an AUTHENTICATED peer receives the advertisement');
        assert(sentTo.charlie.length === 0, '15. an AUTHENTICATING (not yet AUTHENTICATED) peer receives nothing, even though it is in the registry');

        policy = new PresenceVisibilityPolicy({ visibility: PresenceVisibility.FRIENDS, authorizedPeerIdentities: ['did:key:someone-else'] });
        transport.advertise({ avatarId: 'alice-avatar', ownerIdentity: 'did:key:alice', position: { x: 2, y: 0, z: 2 }, rotation: { x: 0, y: 0, z: 0 }, animation: 'IDLE', sequence: 2 });
        assert(sentTo.bob.length === 1, '16. FRIENDS excluding Bob: Bob receives nothing further even though his connection is still AUTHENTICATED');

        policy = new PresenceVisibilityPolicy({ visibility: PresenceVisibility.FRIENDS, authorizedPeerIdentities: ['did:key:bob'] });
        transport.advertise({ avatarId: 'alice-avatar', ownerIdentity: 'did:key:alice', position: { x: 3, y: 0, z: 3 }, rotation: { x: 0, y: 0, z: 0 }, animation: 'IDLE', sequence: 3 });
        assert(sentTo.bob.length === 2, '17. FRIENDS authorizing Bob specifically: Bob receives the very next advertisement');

        policy = new PresenceVisibilityPolicy({ visibility: PresenceVisibility.LOCAL });
        transport.advertise({ avatarId: 'alice-avatar', ownerIdentity: 'did:key:alice', position: { x: 4, y: 0, z: 4 }, rotation: { x: 0, y: 0, z: 0 }, animation: 'IDLE', sequence: 4 });
        assert(sentTo.bob.length === 2, '18. LOCAL never reaches a peer connection, even an AUTHENTICATED one Bob would otherwise qualify for under PUBLIC or FRIENDS');

        policy = new PresenceVisibilityPolicy({ visibility: PresenceVisibility.HIDDEN });
        transport.advertise({ avatarId: 'alice-avatar', ownerIdentity: 'did:key:alice', position: { x: 5, y: 0, z: 5 }, rotation: { x: 0, y: 0, z: 0 }, animation: 'IDLE', sequence: 5 });
        assert(sentTo.bob.length === 2, '19. HIDDEN reaches nobody, defense in depth at the transport itself');

        transport.dispose();
    }

    // -------------------------------------------------------------
    // Section D — FLAGSHIP: Alice, Bob, and Charlie over a REAL peer
    // network (LocalPeerConnectionProvider + PeerMessageBus), full
    // 0.2.49-0.2.52 stack, completely unmodified.
    // -------------------------------------------------------------
    {
        // --- Alice's full avatar + document stack -------------------
        const { storage: aliceStorage, provider: alice } = makeDevice('alice');
        const aliceAvatarProfileUseCase = new AvatarProfileUseCase(aliceStorage, alice, registry);
        aliceAvatarProfileUseCase.updateProfile({ templateId: 'humanoid-01', displayName: 'Alice' });
        const aliceProfile = aliceAvatarProfileUseCase.getProfile();
        const aliceAvatarPresenceSession = new AvatarPresenceSession(aliceProfile, { position: { x: 0, y: 0, z: 0 } });
        const alicePresenceVisibilityUseCase = new PresenceVisibilityUseCase(aliceStorage, alice);
        // Step 1 — Alice becomes PUBLIC (explicit, even though it is
        // already the default, per the design doc's own scripted
        // scenario).
        alicePresenceVisibilityUseCase.updatePolicy({ visibility: PresenceVisibility.PUBLIC });

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
        const document = new Document({ world, metadata: new DocumentMetadata({ title: 'Flagship Peer Presence Castle', author: 'alice', license: new License({ id: LicenseId.CC0_1_0 }) }) });
        const publication = publishDocumentUseCase.execute({ document });
        const placementBefore = placementRegistry.findByPublicationId(publication.id)[0];
        const placementJsonBefore = JSON.stringify(placementBefore.toJSON());
        const aliceProfileJsonBefore = JSON.stringify(aliceAvatarProfileUseCase.getProfile().toJSON());

        // --- Bob and Charlie: identity only, no avatar/document stack
        // of their own — proving "Watching Presence Never Requires
        // Having One" holds just as much over a real peer connection
        // as it always has over BroadcastChannel.
        const { provider: bob } = makeDevice('bob');
        const { provider: charlie } = makeDevice('charlie');

        // --- A real, three-node peer network: Alice connects OUT to
        // both Bob and Charlie; Bob and Charlie never connect to each
        // other at all — "Alice can advertise to Bob without
        // automatically advertising to Charlie" is a structural fact
        // here, not a policy Alice has to additionally enforce, because
        // there is no path between Bob and Charlie in the first place.
        const network = new LocalPeerNetwork();
        const aliceTransport = new LocalPeerConnectionProvider('alice', network);
        const bobTransport = new LocalPeerConnectionProvider('bob', network);
        const charlieTransport = new LocalPeerConnectionProvider('charlie', network);

        const aliceConnect = new ConnectToPeerUseCase({ peerConnectionProvider: aliceTransport, identityProvider: alice });
        const bobConnect = new ConnectToPeerUseCase({ peerConnectionProvider: bobTransport, identityProvider: bob });
        const charlieConnect = new ConnectToPeerUseCase({ peerConnectionProvider: charlieTransport, identityProvider: charlie });
        const stopBobListening = bobConnect.listen();
        const stopCharlieListening = charlieConnect.listen();

        // Step 2 — Bob and Charlie establish authenticated connections
        // (both dialed by Alice; peer authentication itself has no
        // initiator/responder distinction — see peer/
        // PeerAuthenticationSession.js's own header).
        const aliceToBob = aliceConnect.connect({ candidateEndpoint: 'bob' });
        const aliceToCharlie = aliceConnect.connect({ candidateEndpoint: 'charlie' });
        await wait(30);
        assert(aliceToBob.getLifecycleState() === PeerLifecycleState.AUTHENTICATED, "20. FLAGSHIP setup: Alice's connection to Bob authenticates");
        assert(aliceToCharlie.getLifecycleState() === PeerLifecycleState.AUTHENTICATED, "21. FLAGSHIP setup: Alice's connection to Charlie authenticates");
        assert(aliceConnect.registry.list().length === 2, '22. FLAGSHIP setup: Alice has exactly two live peer connections');
        assert(bobConnect.registry.list().length === 1 && bobConnect.registry.list()[0].getLifecycleState() === PeerLifecycleState.AUTHENTICATED,
            "23. FLAGSHIP setup: Bob's own side authenticates too");
        assert(charlieConnect.registry.list().length === 1 && charlieConnect.registry.list()[0].getLifecycleState() === PeerLifecycleState.AUTHENTICATED,
            "24. FLAGSHIP setup: Charlie's own side authenticates too");
        assert(bobConnect.registry.list().length === 1, '25. FLAGSHIP: Bob has exactly ONE connection — never one to Charlie');

        // --- One PeerMessageBus per node — the multiplexing substrate
        // 0.2.52 already shipped, completely unmodified.
        const aliceBus = new PeerMessageBus();
        const bobBus = new PeerMessageBus();
        const charlieBus = new PeerMessageBus();

        const alicePresenceTransport = new PeerAvatarPresenceBroadcastProvider({
            peerMessageBus: aliceBus, connectedPeerRegistry: aliceConnect.registry,
            getVisibilityPolicy: () => alicePresenceVisibilityUseCase.getPolicy()
        });
        const bobPresenceTransport = new PeerAvatarPresenceBroadcastProvider({ peerMessageBus: bobBus, connectedPeerRegistry: bobConnect.registry });
        const charliePresenceTransport = new PeerAvatarPresenceBroadcastProvider({ peerMessageBus: charlieBus, connectedPeerRegistry: charlieConnect.registry });

        const aliceSession = new WorldNavigationSession({
            registry: brickRegistry, loadPublicationDocumentUseCase, worldLayoutProvider: null,
            identityProvider: alice, discoveryProvider, placementRegistry,
            avatarProfileUseCase: aliceAvatarProfileUseCase, avatarPresenceSession: aliceAvatarPresenceSession,
            presenceVisibilityUseCase: alicePresenceVisibilityUseCase,
            presenceBroadcastProvider: alicePresenceTransport, avatarTemplateRegistry: registry
        });
        aliceSession._session = spyRenderFacade();
        aliceSession._setupRemoteAvatars();
        aliceSession._setupLocalAvatar();

        const bobSession = new WorldNavigationSession({
            registry: new CreateBrickRegistryUseCase().execute(), loadPublicationDocumentUseCase: null, worldLayoutProvider: null,
            presenceBroadcastProvider: bobPresenceTransport, avatarTemplateRegistry: registry
        });
        bobSession._session = spyRenderFacade();
        bobSession._setupRemoteAvatars();

        const charlieSession = new WorldNavigationSession({
            registry: new CreateBrickRegistryUseCase().execute(), loadPublicationDocumentUseCase: null, worldLayoutProvider: null,
            presenceBroadcastProvider: charliePresenceTransport, avatarTemplateRegistry: registry
        });
        charlieSession._session = spyRenderFacade();
        charlieSession._setupRemoteAvatars();

        const pull = (session) => {
            const now = Date.now();
            const known = session._presenceSyncService.pull(now);
            session._remoteAvatarRegistry.sync(known, now);
            session._remoteAvatarRegistry.tick(now);
            return known;
        };
        const positionOf = (known) => {
            const entry = known.find((k) => k.advertisement.avatarId === aliceProfile.avatarId);
            return entry ? entry.advertisement.position : null;
        };

        // Step 3-4 — Alice (PUBLIC) moves; both Bob and Charlie receive
        // her presence through PeerMessageBus.
        aliceAvatarPresenceSession.update({ position: { x: 10, y: 0, z: 10 } });
        await wait(60);
        let bobKnown = pull(bobSession);
        let charlieKnown = pull(charlieSession);
        assert(positionOf(bobKnown) && positionOf(bobKnown).x === 10, "26. FLAGSHIP: PUBLIC — Bob receives Alice's presence over the peer transport");
        assert(positionOf(charlieKnown) && positionOf(charlieKnown).x === 10, "27. FLAGSHIP: PUBLIC — Charlie receives it too, independently");

        // Step 5-8 — Alice switches to FRIENDS, authorizing Bob's real,
        // PROVEN peer identityId only, then moves again: Bob receives
        // it, Charlie's own view of Alice stays exactly where it was.
        const bobIdentityId = bob.getSigningIdentity().id;
        alicePresenceVisibilityUseCase.updatePolicy({ visibility: PresenceVisibility.FRIENDS, authorizedPeerIdentities: [bobIdentityId] });
        aliceAvatarPresenceSession.update({ position: { x: 20, y: 0, z: 20 } });
        await wait(60);
        bobKnown = pull(bobSession);
        charlieKnown = pull(charlieSession);
        assert(positionOf(bobKnown).x === 20, '28. FLAGSHIP: FRIENDS(Bob) — Bob receives the new position');
        assert(positionOf(charlieKnown).x === 10, "29. FLAGSHIP: FRIENDS(Bob) — Charlie's view of Alice is UNCHANGED, still her last PUBLIC position; nothing new ever reached him");

        // Step 9-10 — Alice goes HIDDEN and moves again: the coarse
        // shouldAdvertise() gate (0.2.40, unmodified) blocks publish()
        // entirely, so NEITHER Bob nor Charlie sees anything further,
        // even though Alice's own local presence genuinely advances.
        alicePresenceVisibilityUseCase.updatePolicy({ visibility: PresenceVisibility.HIDDEN });
        aliceAvatarPresenceSession.update({ position: { x: 30, y: 0, z: 30 } });
        assert(aliceAvatarPresenceSession.current.position.x === 30, '30. FLAGSHIP: HIDDEN is a publish gate, not a movement gate — Alice genuinely moved locally');
        await wait(60);
        bobKnown = pull(bobSession);
        charlieKnown = pull(charlieSession);
        assert(positionOf(bobKnown).x === 20, "31. FLAGSHIP: HIDDEN — Bob's view is unchanged from the FRIENDS-era position");
        assert(positionOf(charlieKnown).x === 10, "32. FLAGSHIP: HIDDEN — Charlie's view is unchanged from the PUBLIC-era position");

        // Step 11-12 — Alice becomes PUBLIC again: her very next
        // accepted movement reaches BOTH Bob and Charlie normally,
        // catching them both up to the same current position.
        alicePresenceVisibilityUseCase.updatePolicy({ visibility: PresenceVisibility.PUBLIC });
        aliceAvatarPresenceSession.update({ position: { x: 40, y: 0, z: 40 } });
        await wait(60);
        bobKnown = pull(bobSession);
        charlieKnown = pull(charlieSession);
        assert(positionOf(bobKnown).x === 40, '33. FLAGSHIP: PUBLIC again — Bob catches up to the current position');
        assert(positionOf(charlieKnown).x === 40, '34. FLAGSHIP: PUBLIC again — Charlie catches up too, the same movement reaching both');

        // Step 13 — existing trust semantics survive the transport
        // swap: a tampered advertisement, carrying Alice's OWN genuine
        // signature stolen from a different position, sent directly
        // over the SAME authenticated peer connection Bob just
        // legitimately received presence over, is rejected by the
        // completely unmodified application/PresenceTrustBoundary.js —
        // Bob's displayed position for Alice stays exactly what the
        // last ACCEPTED claim said.
        const lastGenuineAdvertisement = {
            avatarId: aliceProfile.avatarId, ownerIdentity: aliceProfile.ownerIdentity,
            position: { x: 40, y: 0, z: 40 }, rotation: { x: 0, y: 0, z: 0 },
            animation: aliceAvatarPresenceSession.current.animation, sequence: aliceAvatarPresenceSession.current.sequence
        };
        const genuineSignature = alice.signCanonical(getAvatarPresenceSigningDescriptor(lastGenuineAdvertisement));
        const tampered = { ...lastGenuineAdvertisement, position: { x: 999, y: 999, z: 999 }, signature: genuineSignature.toJSON() };
        const aliceSideOfBobConnection = aliceConnect.registry.list().find((p) => p.remoteIdentity && p.remoteIdentity.identityId === bobIdentityId);
        aliceBus.send(aliceSideOfBobConnection, PeerAvatarPresenceBroadcastProvider.DEFAULT_PROTOCOL, tampered);
        await wait(60);
        bobKnown = pull(bobSession);
        assert(positionOf(bobKnown).x === 40, "35. FLAGSHIP: a tampered position with a stolen-but-genuine signature is REJECTED by the unmodified trust boundary, over the peer transport exactly as it always was over BroadcastChannel");

        // Throughout all of this: AvatarProfile, the original
        // Publication, and its Placement are completely unaffected —
        // visibility and transport both gate delivery, never touch the
        // avatar's own durable identity or the world's content.
        assert(JSON.stringify(aliceAvatarProfileUseCase.getProfile().toJSON()) === aliceProfileJsonBefore,
            "36. FLAGSHIP: Alice's AvatarProfile is byte-identical throughout — peer presence never touches appearance/identity");
        assert(publisher.verifySnapshot(publication.id, publication.contentHash),
            '37. FLAGSHIP: the Publication still verifies against its own content hash');
        const placementAfter = placementRegistry.findByPublicationId(publication.id)[0];
        assert(JSON.stringify(placementAfter.toJSON()) === placementJsonBefore,
            "38. FLAGSHIP: the Building Placement is byte-identical — nothing about peer presence ever touches world content");

        stopBobListening();
        stopCharlieListening();
        aliceSession.dispose();
        bobSession.dispose();
        charlieSession.dispose();
        alicePresenceTransport.dispose();
        bobPresenceTransport.dispose();
        charliePresenceTransport.dispose();
        aliceTransport.dispose();
        bobTransport.dispose();
        charlieTransport.dispose();
    }

    console.log('✅ All Peer-Based Avatar Presence tests passed.');
}

await runTests();
