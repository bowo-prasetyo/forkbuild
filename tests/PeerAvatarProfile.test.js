import { AvatarProfileVisibilityPolicy } from '../core/AvatarProfileVisibilityPolicy.js';
import { PresenceVisibilityPolicy } from '../core/PresenceVisibilityPolicy.js';
import { PeerAvatarPresenceBroadcastProvider } from '../presence/PeerAvatarPresenceBroadcastProvider.js';
import { AvatarProfileUseCase } from '../application/AvatarProfileUseCase.js';
import { AvatarProfileSyncService } from '../application/AvatarProfileSyncService.js';
import { RemoteAvatarAppearanceRegistry } from '../application/RemoteAvatarAppearanceRegistry.js';
import { AvatarPresenceSession } from '../application/AvatarPresenceSession.js';
import { WorldNavigationSession } from '../application/WorldNavigationSession.js';
import { AvatarTemplateRegistry } from '../core/AvatarTemplateRegistry.js';
import { CoreAvatarTemplateLibrary } from '../core/library/CoreAvatarTemplateLibrary.js';
import { toAvatarProfileAdvertisement } from '../core/AvatarProfileAdvertisement.js';
import { signAvatarProfileAdvertisement } from '../application/AvatarProfileSigning.js';
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

// 0.2.54 — Peer-Based Avatar Profile Synchronization.
//
// "Replace BroadcastChannel as the primary remote-profile transport
// with authenticated peer messaging, while preserving the entire
// 0.2.41 profile trust model." The identical claim tests/
// PeerAvatarPresence.test.js already proved for presence in 0.2.53,
// proved here for profile: core/AvatarProfile.js, core/
// AvatarProfileAdvertisement.js, core/AvatarProfileIngestion.js,
// core/AvatarProfileEquivocation.js, application/
// AvatarProfileTrustBoundary.js, application/AvatarProfileSigning.js,
// application/LocalAvatarProfileStore.js, and application/
// RemoteAvatarAppearanceRegistry.js are every one of them completely
// untouched by this milestone — never re-tested here, already proven
// (unmodified) in tests/AvatarAppearanceSync.test.js over
// BroadcastChannel.
//
// The one new file this milestone adds, core/
// AvatarProfileVisibilityPolicy.js, is deliberately NOT core/
// PresenceVisibilityPolicy.js reused — "who may see me" and "who may
// see what I look like" are different questions with different
// answers, per the design doc's own explicit instruction.
// presence/PeerAvatarPresenceBroadcastProvider.js (0.2.53) itself is
// reused UNCHANGED for the profile channel too, exactly the same
// "generic transport wrapper, nothing presence-specific baked into
// its actual logic" reasoning CreateWorldViewUseCase.js already
// applied when it reused LocalAvatarPresenceBroadcastProvider
// directly for profile's own BroadcastChannel in 0.2.41.
//
//   Section A: core/AvatarProfileVisibilityPolicy.js — the one new
//              file, and its deliberate independence from
//              core/PresenceVisibilityPolicy.js
//   Section B: presence/PeerAvatarPresenceBroadcastProvider.js reused
//              for TWO independent protocols on the SAME shared bus —
//              proving presence and profile never cross-talk even
//              when riding the same authenticated connection
//   Section C: FLAGSHIP — Alice, Bob, and Charlie over a REAL peer
//              network. Charlie deliberately never has a presence
//              transport wired at all, proving profile sync never
//              depends on presence.

const PROFILE_PROTOCOL = 'forkbuild:avatar-profile';

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

// Minimal ConnectedPeer-shaped stand-ins, identical in shape to
// tests/PeerAvatarPresence.test.js's own — this milestone reuses
// PeerAvatarPresenceBroadcastProvider unmodified, so it reads exactly
// the same fields.
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
    // Section A — core/AvatarProfileVisibilityPolicy.js
    // -------------------------------------------------------------
    {
        const policy = new AvatarProfileVisibilityPolicy();
        assert(policy.shouldAdvertiseToPeer('did:key:bob') === true, '1. eligible to any peer identityId the transport already deemed AUTHENTICATED');
        assert(policy.shouldAdvertiseToPeer(null) === true, '2. does not require a peer identity to be known, the same permissive default PresenceVisibilityPolicy PUBLIC uses');
        assert(AvatarProfileVisibilityPolicy.default().shouldAdvertiseToPeer('did:key:anyone') === true, '3. static default() returns an equally permissive instance');
    }
    {
        // Deliberate independence: setting presence to HIDDEN has
        // absolutely no effect on a separately-constructed profile
        // policy instance — they are not the same object, not the same
        // class, and not read from the same configuration.
        const hiddenPresence = new PresenceVisibilityPolicy({ visibility: 'hidden' });
        const profilePolicy = AvatarProfileVisibilityPolicy.default();
        assert(hiddenPresence.shouldAdvertiseToPeer('did:key:bob') === false, '4. presence set to HIDDEN blocks presence, as expected');
        assert(profilePolicy.shouldAdvertiseToPeer('did:key:bob') === true, "5. ...but a peer's PROFILE eligibility is entirely unaffected — Presence: HIDDEN, Profile: PUBLIC is a real, independently-representable combination, never silently coupled");
    }

    // -------------------------------------------------------------
    // Section B — PeerAvatarPresenceBroadcastProvider reused for TWO
    // independent protocols ('forkbuild:avatar-presence' and
    // 'forkbuild:avatar-profile') on the SAME shared PeerMessageBus,
    // against minimal stand-ins. Never re-tests the transport's own
    // construction/attach/dispose mechanics (already proven, unmodified,
    // in tests/PeerAvatarPresence.test.js) — only that two protocols
    // sharing one bus/connection never cross-talk.
    // -------------------------------------------------------------
    {
        const bus = new PeerMessageBus();
        const peer = fakeConnectedPeer({
            connectionId: 'alice-bob', lifecycleState: PeerLifecycleState.AUTHENTICATED,
            remoteIdentity: { identityId: 'did:key:bob' }
        });
        const reg = fakeRegistry([peer]);

        // Intercept at bus.send() — the point where a protocol string
        // is actually chosen for the wire — the same technique tests/
        // PeerAvatarPresence.test.js's own Section C already uses, since
        // PeerMessageBus.subscribe() only ever delivers messages that
        // arrive FROM a remote peer's connection, never a local send()
        // looped back to this same bus's own subscribers.
        const sentUnderPresence = [];
        const sentUnderProfile = [];
        const originalSend = bus.send.bind(bus);
        bus.send = (targetPeer, protocol, payload) => {
            if (protocol === 'forkbuild:avatar-presence') sentUnderPresence.push(payload);
            if (protocol === PROFILE_PROTOCOL) sentUnderProfile.push(payload);
            return originalSend(targetPeer, protocol, payload);
        };

        const presenceTransport = new PeerAvatarPresenceBroadcastProvider({ peerMessageBus: bus, connectedPeerRegistry: reg });
        const profileTransport = new PeerAvatarPresenceBroadcastProvider({
            peerMessageBus: bus, connectedPeerRegistry: reg,
            protocol: PROFILE_PROTOCOL, getVisibilityPolicy: () => AvatarProfileVisibilityPolicy.default()
        });

        presenceTransport.advertise({ avatarId: 'a', ownerIdentity: 'alice', position: { x: 0, y: 0, z: 0 }, rotation: { x: 0, y: 0, z: 0 }, animation: 'IDLE', sequence: 1 });
        profileTransport.advertise({ avatarId: 'a', ownerIdentity: 'alice', profileRevision: 1, templateId: 'humanoid-01', appearance: {}, displayName: 'Alice' });

        assert(sentUnderPresence.length === 1 && sentUnderProfile.length === 1, '6. each transport sends exactly one message, under its own protocol string');
        assert(sentUnderPresence[0].position !== undefined, "7. presence's send carries presence's own shape");
        assert(sentUnderProfile[0].profileRevision !== undefined, "8. profile's send carries profile's own shape — never presence's, even sharing the SAME bus and the SAME peer connection");

        presenceTransport.dispose();
        profileTransport.dispose();
    }

    // -------------------------------------------------------------
    // Section C — FLAGSHIP: Alice, Bob, and Charlie over a REAL peer
    // network (peer/LocalPeerConnectionProvider.js + peer/
    // PeerMessageBus.js), the full 0.2.49-0.2.53 stack, completely
    // unmodified.
    // -------------------------------------------------------------
    {
        const { storage: aliceStorage, provider: alice } = makeDevice('alice');
        const aliceAvatarProfileUseCase = new AvatarProfileUseCase(aliceStorage, alice, registry);
        // Alice customizes her avatar BEFORE her World View session
        // even exists — the ordinary real-world sequence (Avatar
        // Creator, then enter World View) — so no onProfileChanged
        // subscription ever sees this edit; the periodic-republish
        // bootstrap is what catches it, exactly the same "0 means
        // never published" mechanic 0.2.41 already established.
        aliceAvatarProfileUseCase.updateProfile({ templateId: 'humanoid-01', appearance: { skin: 'skin-06' }, displayName: 'Alice' });
        const aliceProfileAtStart = aliceAvatarProfileUseCase.getProfile();
        const aliceAvatarPresenceSession = new AvatarPresenceSession(aliceProfileAtStart, { position: { x: 0, y: 0, z: 0 } });

        // --- Alice's document/publication/placement stack — the same
        // non-contamination proof 0.2.39-0.2.53's own flagships already
        // established for the avatar arc.
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
        const document = new Document({ world, metadata: new DocumentMetadata({ title: 'Flagship Peer Profile Castle', author: 'alice', license: new License({ id: LicenseId.CC0_1_0 }) }) });
        const publication = publishDocumentUseCase.execute({ document });
        const placementBefore = placementRegistry.findByPublicationId(publication.id)[0];
        const placementJsonBefore = JSON.stringify(placementBefore.toJSON());

        // --- Bob and Charlie: identity only, no avatar/document stack
        // of their own.
        const { provider: bob } = makeDevice('bob');
        const { provider: charlie } = makeDevice('charlie');

        // --- A real, three-node peer network: Alice dials OUT to both
        // Bob and Charlie; Bob and Charlie never connect to each other.
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
        assert(aliceToBob.getLifecycleState() === PeerLifecycleState.AUTHENTICATED, '9. FLAGSHIP setup: Alice-Bob authenticates');
        assert(aliceToCharlie.getLifecycleState() === PeerLifecycleState.AUTHENTICATED, '10. FLAGSHIP setup: Alice-Charlie authenticates');
        assert(bobConnect.registry.list().length === 1, '11. FLAGSHIP setup: Bob has exactly one connection — never one to Charlie');

        const bobIdentityId = bob.getSigningIdentity().id;

        // --- One PeerMessageBus per node, shared between the presence
        // AND profile transports on that node — the multiplexing
        // substrate 0.2.52 already shipped, completely unmodified.
        const aliceBus = new PeerMessageBus();
        const bobBus = new PeerMessageBus();
        const charlieBus = new PeerMessageBus();

        const alicePresenceTransport = new PeerAvatarPresenceBroadcastProvider({ peerMessageBus: aliceBus, connectedPeerRegistry: aliceConnect.registry });
        const aliceProfileTransport = new PeerAvatarPresenceBroadcastProvider({
            peerMessageBus: aliceBus, connectedPeerRegistry: aliceConnect.registry,
            protocol: PROFILE_PROTOCOL, getVisibilityPolicy: () => AvatarProfileVisibilityPolicy.default()
        });
        // Bob: BOTH presence and profile — the "ordinary" full
        // participant, exercised through a real WorldNavigationSession
        // exactly as tests/AvatarAppearanceSync.test.js's own flagship
        // did over BroadcastChannel.
        const bobPresenceTransport = new PeerAvatarPresenceBroadcastProvider({ peerMessageBus: bobBus, connectedPeerRegistry: bobConnect.registry });
        const bobProfileTransport = new PeerAvatarPresenceBroadcastProvider({
            peerMessageBus: bobBus, connectedPeerRegistry: bobConnect.registry,
            protocol: PROFILE_PROTOCOL, getVisibilityPolicy: () => AvatarProfileVisibilityPolicy.default()
        });
        // Charlie: PROFILE ONLY — no presence transport, no
        // WorldNavigationSession at all. If Charlie can still resolve
        // Alice's REAL appearance through nothing but
        // AvatarProfileSyncService + RemoteAvatarAppearanceRegistry,
        // profile synchronization never depended on presence in the
        // first place — the design doc's own explicit instruction: "a
        // peer can know your profile without currently observing your
        // avatar."
        const charlieProfileTransport = new PeerAvatarPresenceBroadcastProvider({
            peerMessageBus: charlieBus, connectedPeerRegistry: charlieConnect.registry,
            protocol: PROFILE_PROTOCOL, getVisibilityPolicy: () => AvatarProfileVisibilityPolicy.default()
        });
        const charlieProfileSyncService = new AvatarProfileSyncService(charlieProfileTransport, {});
        const charlieAppearanceRegistry = new RemoteAvatarAppearanceRegistry(null, charlieProfileSyncService, registry, {});

        const aliceSession = new WorldNavigationSession({
            registry: brickRegistry, loadPublicationDocumentUseCase, worldLayoutProvider: null,
            identityProvider: alice, discoveryProvider, placementRegistry,
            avatarProfileUseCase: aliceAvatarProfileUseCase, avatarPresenceSession: aliceAvatarPresenceSession,
            presenceBroadcastProvider: alicePresenceTransport, avatarProfileBroadcastProvider: aliceProfileTransport,
            avatarTemplateRegistry: registry
        });
        aliceSession._session = spyRenderFacade();
        aliceSession._setupRemoteAvatars();
        aliceSession._setupLocalAvatar();

        const bobSession = new WorldNavigationSession({
            registry: new CreateBrickRegistryUseCase().execute(), loadPublicationDocumentUseCase: null, worldLayoutProvider: null,
            presenceBroadcastProvider: bobPresenceTransport, avatarProfileBroadcastProvider: bobProfileTransport,
            avatarTemplateRegistry: registry
        });
        const bobFacade = spyRenderFacade();
        bobSession._session = bobFacade;
        bobSession._setupRemoteAvatars();

        const bobPull = () => {
            const now = Date.now();
            bobSession._avatarProfileSyncService.pull();
            const known = bobSession._presenceSyncService.pull(now);
            bobSession._remoteAvatarRegistry.sync(known, now);
            bobSession._remoteAvatarRegistry.tick(now);
            bobSession._remoteAvatarAppearanceRegistry.sync(bobSession._remoteAvatarRegistry.knownAvatarIds());
            return known;
        };
        const findAliceSideOf = (identityId) => aliceConnect.registry.list().find((p) => p.remoteIdentity && p.remoteIdentity.identityId === identityId);

        // Step 1-3 — Alice's periodic-republish bootstrap fires on the
        // very first frame (0 means never published — see
        // PROFILE_REPUBLISH_INTERVAL_MS's own comment), delivering her
        // ALREADY-customized profile to Bob and Charlie over
        // PeerMessageBus. Bob renders her REAL appearance from the very
        // first visual; Charlie — who has no presence transport at all
        // — still resolves it correctly through profile alone.
        aliceSession._session.calls.onAnimationFrameCallbacks[1](0.016);
        await wait(60);
        // Alice's presence has to reach Bob at least once too, so
        // RemoteAvatarRegistry actually creates a visual for her to
        // apply the (independently-arrived) profile appearance to —
        // see docs/Principles.md, "Appearance And Position Are
        // Different Lifecycles, Never One Message": a visual is only
        // ever created by PRESENCE; profile only ever decorates it.
        aliceAvatarPresenceSession.update({ position: { x: 1, y: 0, z: 1 } });
        await wait(60);
        bobPull();
        charlieProfileSyncService.pull();

        assert(bobFacade.calls.setRemoteAvatar.length === 1, '12. FLAGSHIP: Bob creates exactly one remote visual for Alice');
        assert(bobFacade.calls.setRemoteAvatar[0].appearance.skin === 'skin-06',
            "13. FLAGSHIP: Bob renders Alice's REAL customized appearance from the very first visual, delivered over PeerMessageBus");
        assert(bobSession._remoteAvatarAppearanceRegistry.resolve(aliceProfileAtStart.avatarId).isPlaceholder === false,
            "14. FLAGSHIP: Bob genuinely knows this is Alice's real appearance, not a fallback");
        const charlieResolved = charlieAppearanceRegistry.resolve(aliceProfileAtStart.avatarId);
        assert(charlieResolved.isPlaceholder === false && charlieResolved.appearance.skin === 'skin-06',
            "15. FLAGSHIP: Charlie ALSO knows Alice's REAL appearance — through PROFILE alone, having never received a single presence advertisement");

        // Step 4-6 — Alice changes her display name AND template/
        // appearance again, this time through an already-live session
        // (onProfileChanged publishes immediately). Revision
        // increments; Bob receives the newer revision.
        const revisionBefore = aliceAvatarProfileUseCase.getProfile().revision;
        aliceAvatarProfileUseCase.updateProfile({ displayName: 'Alice Prime', templateId: 'humanoid-02' });
        const revisionAfter = aliceAvatarProfileUseCase.getProfile().revision;
        assert(revisionAfter > revisionBefore, '16. FLAGSHIP: an edit strictly increments AvatarProfile.revision');
        await wait(60);
        bobPull();
        charlieProfileSyncService.pull();
        assert(bobSession._avatarProfileSyncService.getKnownProfile(aliceProfileAtStart.avatarId).profileRevision === revisionAfter,
            '17. FLAGSHIP: Bob receives the newer revision');
        assert(bobSession._remoteAvatarAppearanceRegistry.resolve(aliceProfileAtStart.avatarId).template.templateId === 'humanoid-02',
            "18. FLAGSHIP: Bob's resolved template reflects Alice's new choice");
        assert(charlieAppearanceRegistry.resolve(aliceProfileAtStart.avatarId).template.templateId === 'humanoid-02',
            "19. FLAGSHIP: Charlie catches up too, independently, through profile alone");

        // Step 7 — an OLD revision arriving afterward is rejected: a
        // genuinely-signed advertisement for Alice's FIRST profile
        // (captured before either edit above) is sent directly, after
        // Bob has already accepted a strictly newer revision.
        const staleAdvertisement = signAvatarProfileAdvertisement(toAvatarProfileAdvertisement(aliceProfileAtStart), alice);
        aliceBus.send(findAliceSideOf(bobIdentityId), PROFILE_PROTOCOL, staleAdvertisement);
        await wait(60);
        bobPull();
        assert(bobSession._avatarProfileSyncService.getKnownProfile(aliceProfileAtStart.avatarId).profileRevision === revisionAfter,
            '20. FLAGSHIP: a stale, older revision is REJECTED — Bob keeps the newer one he already accepted, over the peer transport exactly as it always was over BroadcastChannel');

        // Step 8 — a same-revision/different-content advertisement is
        // treated as equivocation: two DIFFERENT, genuinely-signed
        // claims at the SAME (new, not-yet-seen) profileRevision.
        const equivocationRevision = revisionAfter + 1;
        const claimA = signAvatarProfileAdvertisement({
            avatarId: aliceProfileAtStart.avatarId, ownerIdentity: aliceProfileAtStart.ownerIdentity,
            profileRevision: equivocationRevision, templateId: 'humanoid-01', appearance: { skin: 'skin-01' }, displayName: 'Alice Prime'
        }, alice);
        const claimB = signAvatarProfileAdvertisement({
            avatarId: aliceProfileAtStart.avatarId, ownerIdentity: aliceProfileAtStart.ownerIdentity,
            profileRevision: equivocationRevision, templateId: 'humanoid-01', appearance: { skin: 'skin-09' }, displayName: 'Alice Prime'
        }, alice);
        aliceBus.send(findAliceSideOf(bobIdentityId), PROFILE_PROTOCOL, claimA);
        await wait(60);
        bobPull();
        assert(bobSession._avatarProfileSyncService.getKnownProfile(aliceProfileAtStart.avatarId).appearance.skin === 'skin-01',
            '21. FLAGSHIP: the FIRST claim at the new revision is accepted');
        aliceBus.send(findAliceSideOf(bobIdentityId), PROFILE_PROTOCOL, claimB);
        await wait(60);
        bobPull();
        assert(bobSession._avatarProfileSyncService.getKnownProfile(aliceProfileAtStart.avatarId).appearance.skin === 'skin-01',
            '22. FLAGSHIP: a SECOND, conflicting claim at the SAME revision is rejected as equivocation — the first-accepted content is kept');

        // Step 9 — an unrecognized template gracefully becomes the
        // placeholder: an unrelated stranger avatar advertises a
        // template Bob's replica has never heard of.
        const strangerAdvertisement = { avatarId: 'stranger-avatar-1', ownerIdentity: 'stranger', profileRevision: 1, templateId: 'a-template-nobody-has', appearance: {}, displayName: 'Stranger' };
        aliceBus.send(findAliceSideOf(bobIdentityId), PROFILE_PROTOCOL, strangerAdvertisement);
        await wait(60);
        bobPull();
        assert(bobSession._remoteAvatarAppearanceRegistry.resolve('stranger-avatar-1').isPlaceholder === true,
            '23. FLAGSHIP: an avatar advertising an UNKNOWN template renders with the generic placeholder — no crash, nothing invented');

        // Step 10-11 — Alice disconnects from Bob and reconnects. Her
        // profile remains available throughout, according to
        // LocalAvatarProfileStore's own durable semantics — nothing
        // about a peer connection's lifecycle ever prunes it.
        const bobsKnownProfileBeforeDisconnect = bobSession._avatarProfileSyncService.getKnownProfile(aliceProfileAtStart.avatarId);
        aliceToBob.close();
        await wait(30);
        assert(aliceToBob.getLifecycleState() === PeerLifecycleState.CLOSED, '24. FLAGSHIP: Alice-Bob connection is closed');
        assert(JSON.stringify(bobSession._avatarProfileSyncService.getKnownProfile(aliceProfileAtStart.avatarId)) === JSON.stringify(bobsKnownProfileBeforeDisconnect),
            "25. FLAGSHIP: Bob's known profile for Alice is completely untouched by the connection dropping");

        aliceToBob = aliceConnect.connect({ candidateEndpoint: 'bob' });
        await wait(30);
        assert(aliceToBob.getLifecycleState() === PeerLifecycleState.AUTHENTICATED, '26. FLAGSHIP: Alice reconnects to Bob');
        assert(JSON.stringify(bobSession._avatarProfileSyncService.getKnownProfile(aliceProfileAtStart.avatarId)) === JSON.stringify(bobsKnownProfileBeforeDisconnect),
            '27. FLAGSHIP: the profile store never needed anything re-sent — it was durable across the disconnect/reconnect the entire time');

        // Alice moves once more so Bob's PRESENCE genuinely refreshes
        // after the reconnect, setting up the next step.
        aliceAvatarPresenceSession.update({ position: { x: 4, y: 0, z: 4 } });
        await wait(60);
        bobPull();
        assert(bobSession._remoteAvatarRegistry.has(aliceProfileAtStart.avatarId) === true, '28. FLAGSHIP: Bob sees Alice present again after reconnecting');

        // Step 12 — presence disappearing (going stale/ABSENT and
        // being pruned) does NOT destroy the profile: fast-forward
        // Bob's clock past staleness, exactly the same durability proof
        // tests/AvatarAppearanceSync.test.js's own flagship already
        // established over BroadcastChannel.
        const farFuture = Date.now() + 60000;
        const knownFarFuture = bobSession._presenceSyncService.pull(farFuture);
        bobSession._remoteAvatarRegistry.sync(knownFarFuture, farFuture);
        assert(bobSession._remoteAvatarRegistry.has(aliceProfileAtStart.avatarId) === false, "29. FLAGSHIP: Alice's PRESENCE has expired from Bob's store");
        assert(bobSession._avatarProfileSyncService.getKnownProfile(aliceProfileAtStart.avatarId) !== null,
            "30. FLAGSHIP: ...but Bob still remembers her PROFILE — presence disappearing never destroys it");

        aliceAvatarPresenceSession.update({ position: { x: 5, y: 0, z: 5 } });
        await wait(60);
        bobPull();
        const recreated = bobFacade.calls.setRemoteAvatar.filter((c) => c.avatarId === aliceProfileAtStart.avatarId).at(-1);
        assert(recreated && recreated.appearance.skin === 'skin-01',
            "31. FLAGSHIP: when Alice reappears, Bob immediately re-creates her visual with her REAL, already-known appearance — never a placeholder flash");

        // Step 13 — a malicious peer cannot reuse a genuine Alice
        // signature with modified profile contents: her own, genuinely
        // signed CURRENT advertisement, tampered afterward without
        // re-signing.
        const genuineAdvertisement = signAvatarProfileAdvertisement(toAvatarProfileAdvertisement(aliceAvatarProfileUseCase.getProfile()), alice);
        const tamperedAdvertisement = { ...genuineAdvertisement, appearance: { skin: 'stolen-skin' } };
        aliceBus.send(findAliceSideOf(bobIdentityId), PROFILE_PROTOCOL, tamperedAdvertisement);
        await wait(60);
        bobPull();
        assert(bobSession._avatarProfileSyncService.getKnownProfile(aliceProfileAtStart.avatarId).appearance.skin === 'skin-01',
            "32. FLAGSHIP: a tampered appearance carrying a stolen-but-genuine signature is REJECTED by the unmodified 0.2.41 trust boundary, over the peer transport exactly as it always was over BroadcastChannel");

        // Step 14 — throughout all of this: AvatarPresence itself, the
        // original Publication, and its Placement are completely
        // unaffected. Presence and profile trust/ingestion are proven
        // untouched by construction — every function this test exercised
        // (resolveIncomingProfile, detectAvatarProfileEquivocation,
        // AvatarProfileTrustBoundary, AvatarProfileSigning,
        // LocalAvatarProfileStore) is the literal, unmodified 0.2.41
        // module, imported and exercised through its real, public API —
        // never a re-implementation.
        assert(aliceAvatarPresenceSession.current.position.x === 5, '33. FLAGSHIP: AvatarPresence reflects only real movement, never profile sync');
        assert(publisher.verifySnapshot(publication.id, publication.contentHash),
            '34. FLAGSHIP: the Publication still verifies against its own content hash');
        const placementAfter = placementRegistry.findByPublicationId(publication.id)[0];
        assert(JSON.stringify(placementAfter.toJSON()) === placementJsonBefore,
            "35. FLAGSHIP: the Building Placement is byte-identical — nothing about peer profile sync ever touches world content");

        stopBobListening();
        stopCharlieListening();
        aliceSession.dispose();
        bobSession.dispose();
        alicePresenceTransport.dispose();
        aliceProfileTransport.dispose();
        bobPresenceTransport.dispose();
        bobProfileTransport.dispose();
        charlieProfileTransport.dispose();
        aliceTransport.dispose();
        bobTransport.dispose();
        charlieTransport.dispose();
    }

    console.log('✅ All Peer-Based Avatar Profile tests passed.');
}

await runTests();
