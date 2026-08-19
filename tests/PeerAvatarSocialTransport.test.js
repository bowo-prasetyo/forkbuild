import { AvatarInteractionKind } from '../core/AvatarInteractionKind.js';
import { PresenceVisibility } from '../core/PresenceVisibility.js';
import { PresenceVisibilityUseCase } from '../application/PresenceVisibilityUseCase.js';
import { AvatarProfileVisibilityUseCase } from '../application/AvatarProfileVisibilityUseCase.js';
import { PeerAvatarPresenceBroadcastProvider } from '../presence/PeerAvatarPresenceBroadcastProvider.js';
import { LocalAvatarPresenceBroadcastProvider } from '../presence/LocalAvatarPresenceBroadcastProvider.js';
import { AvatarProfileUseCase } from '../application/AvatarProfileUseCase.js';
import { AvatarPresenceSession } from '../application/AvatarPresenceSession.js';
import { WorldNavigationSession } from '../application/WorldNavigationSession.js';
import { AvatarTemplateRegistry } from '../core/AvatarTemplateRegistry.js';
import { CoreAvatarTemplateLibrary } from '../core/library/CoreAvatarTemplateLibrary.js';
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
import { FriendRelationshipUseCase } from '../application/FriendRelationshipUseCase.js';
import { FriendshipState } from '../core/FriendshipState.js';

// 0.2.59 — Peer-Based Avatar Social Transport.
//
// "Once a peer is authenticated, avatar state and events travel
// through that authenticated peer — not through an unrelated ambient
// broadcast channel." 0.2.53/0.2.54 already proved presence/profile
// CAN ride an authenticated peer connection; this milestone is the one
// that actually wires all three avatar-social protocols — presence,
// profile, AND (new here) interaction — through application/
// CreateWorldViewUseCase.js at once, sharing ONE PeerMessageBus per
// replica exactly the way ui/main.js's own friendship protocol (0.2.57)
// already does, with 0.2.58's isFriend/hasFriend predicates wired from
// a REAL FriendRelationshipUseCase for the first time (every prior
// flagship built those predicates from a hand-rolled test closure).
//
// core/PresenceIngestion.js, core/PresenceEquivocation.js, core/
// PresenceReplayWindow.js, application/PresenceSyncService.js,
// application/LocalPresenceStore.js, application/PresenceTrustBoundary.js,
// application/AvatarProfileSyncService.js, application/
// AvatarInteractionSyncService.js, and application/
// AvatarInteractionTrustBoundary.js are every one of them completely
// untouched by this milestone — this file never re-proves their own
// unit-level behavior (see tests/AvatarPresenceTrust.test.js, tests/
// AvatarAppearanceSync.test.js, tests/AvatarInteractionSync.test.js),
// only that the TRANSPORT migration around them is real.
//
// This flagship deliberately mirrors application/CreateWorldViewUseCase.js's
// OWN transport-construction shape (one PeerAvatarPresenceBroadcastProvider
// per protocol, sharing one PeerMessageBus, wired with the SAME
// presence/profile visibility policies and the SAME isFriend/hasFriend
// predicates that use case now builds) rather than calling
// CreateWorldViewUseCase.execute() directly — that use case
// unconditionally builds a real, browser-localStorage-backed
// LocalStorageProvider for content/discovery/spatial-index storage,
// and (per every prior avatar-arc flagship in this suite) tests here
// never touch real browser storage, only per-device
// InMemoryStorageProvider instances.

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
        setLocalAvatar: [], updateLocalAvatarAppearance: [], updateLocalAvatarPresence: [], setLocalAvatarVisible: [],
        setRemoteAvatar: [], updateRemoteAvatarPresence: [], updateRemoteAvatarAppearance: [], removeRemoteAvatar: [], setRemoteAvatarsVisible: [],
        setRemoteAvatarGesture: [],
        onAnimationFrameCallbacks: []
    };
    return {
        calls,
        pick: () => null, pickAvatar: () => null, pickGround: () => null,
        setLocalAvatar: (template, appearance, presence) => calls.setLocalAvatar.push({ template, appearance, presence }),
        updateLocalAvatarAppearance: (template, appearance) => calls.updateLocalAvatarAppearance.push({ template, appearance }),
        updateLocalAvatarPresence: (presence) => calls.updateLocalAvatarPresence.push({ presence }),
        setLocalAvatarFacing() {}, setLocalAvatarGesture() {},
        setLocalAvatarVisible: (visible) => calls.setLocalAvatarVisible.push(visible),
        removeLocalAvatar: () => {},
        setRemoteAvatar: (avatarId, template, appearance, presenceLike) => calls.setRemoteAvatar.push({ avatarId, template, appearance, presenceLike }),
        updateRemoteAvatarPresence: (avatarId, presenceLike) => calls.updateRemoteAvatarPresence.push({ avatarId, presenceLike }),
        updateRemoteAvatarAppearance: (avatarId, template, appearance) => calls.updateRemoteAvatarAppearance.push({ avatarId, template, appearance }),
        setRemoteAvatarGesture: (avatarId, kind) => calls.setRemoteAvatarGesture.push({ avatarId, kind }),
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

// Mirrors the real onAnimationFrame pipeline _setupRemoteAvatars()
// wires (profile pull -> presence pull/sync/tick -> profile-appearance
// resync -> interaction pull/apply -> gesture expiry), driven by hand
// — the same pattern tests/AvatarInteractionSync.test.js's own
// pumpSession() already established, reused here unmodified.
function pumpSession(session, now = Date.now()) {
    if (session._avatarProfileSyncService) {
        session._avatarProfileSyncService.pull();
    }
    const known = session._presenceSyncService.pull(now);
    session._remoteAvatarRegistry.sync(known, now);
    session._remoteAvatarRegistry.tick(now);
    if (session._avatarProfileSyncService) {
        session._remoteAvatarAppearanceRegistry.sync(session._remoteAvatarRegistry.knownAvatarIds());
    }
    if (session._avatarInteractionSyncService) {
        for (const event of session._avatarInteractionSyncService.pull()) {
            session._applyRemoteAvatarInteraction(event, now);
        }
    }
    session._expireRemoteAvatarGestures(now);
    return known;
}

async function runTests() {
    const registry = buildRegistry();

    // -------------------------------------------------------------
    // FLAGSHIP — Alice, Bob, and Charlie over a REAL peer network,
    // ALL THREE avatar-social protocols (presence, profile,
    // interaction) riding ONE authenticated peer connection per pair,
    // exactly the shape application/CreateWorldViewUseCase.js now
    // builds. Alice: Presence=FRIENDS, Profile=PUBLIC (the default).
    // Bob: real, mutual FriendshipState.FRIEND with Alice. Charlie:
    // authenticated, but never a friend.
    // -------------------------------------------------------------
    {
        // --- Alice ---------------------------------------------------
        const { storage: aliceStorage, provider: alice } = makeDevice('alice');
        const aliceAvatarProfileUseCase = new AvatarProfileUseCase(aliceStorage, alice, registry);
        const aliceProfile = aliceAvatarProfileUseCase.getProfile();
        const aliceAvatarPresenceSession = new AvatarPresenceSession(aliceProfile, { position: { x: 0, y: 0, z: 0 } });
        const alicePresenceVisibilityUseCase = new PresenceVisibilityUseCase(aliceStorage, alice);
        const aliceProfileVisibilityUseCase = new AvatarProfileVisibilityUseCase(aliceStorage, alice);
        // "Once a peer is authenticated, avatar state and events travel
        // through that authenticated peer" — proven under Presence:
        // FRIENDS specifically, the tier that most depends on this
        // milestone's real, mutual-friendship-driven isFriend wiring
        // (Profile stays PUBLIC, its own default, unchanged).
        alicePresenceVisibilityUseCase.updatePolicy({ visibility: PresenceVisibility.FRIENDS });

        // --- Alice's document/publication/placement stack — the same
        // non-contamination proof every prior avatar-arc flagship
        // establishes: nothing about this milestone ever touches
        // Document/Publication/WorldPlacement/SpatialIndex state.
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
        const document = new Document({ world, metadata: new DocumentMetadata({ title: 'Flagship Peer Social Transport Castle', author: 'alice', license: new License({ id: LicenseId.CC0_1_0 }) }) });
        const publication = publishDocumentUseCase.execute({ document });
        const placementBefore = placementRegistry.findByPublicationId(publication.id)[0];
        const placementJsonBefore = JSON.stringify(placementBefore.toJSON());

        // --- Bob: a full participant, with his own avatar (he must be
        // a KNOWN, targetable remote avatar for Alice to wave AT).
        const { storage: bobStorage, provider: bob } = makeDevice('bob');
        const bobAvatarProfileUseCase = new AvatarProfileUseCase(bobStorage, bob, registry);
        const bobProfile = bobAvatarProfileUseCase.getProfile();
        const bobAvatarPresenceSession = new AvatarPresenceSession(bobProfile, { position: { x: 2, y: 0, z: 2 } });
        const bobIdentityId = bob.getSigningIdentity().id;

        // --- Charlie: authenticated, never a friend, never publishes
        // his own avatar — a pure receiver, exactly precedent's own
        // "stranger" role in tests/PeerAvatarProfile.test.js/tests/
        // FriendAwareVisibility.test.js.
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
        assert(aliceToBob.getLifecycleState() === PeerLifecycleState.AUTHENTICATED, '1. FLAGSHIP setup: Alice-Bob authenticates');
        assert(aliceToCharlie.getLifecycleState() === PeerLifecycleState.AUTHENTICATED, '2. FLAGSHIP setup: Alice-Charlie authenticates');

        // --- One PeerMessageBus per node, shared between friendship,
        // presence, profile, AND interaction on that node — exactly
        // the substrate application/CreateWorldViewUseCase.js now
        // builds for the live app (one bus, four protocols).
        const aliceBus = new PeerMessageBus();
        const bobBus = new PeerMessageBus();
        const charlieBus = new PeerMessageBus();

        // --- Real, mutual friendship: Alice and Bob. Charlie stays a
        // stranger throughout.
        const aliceFriendUseCase = new FriendRelationshipUseCase(aliceStorage, alice, { peerMessageBus: aliceBus, connectedPeerRegistry: aliceConnect.registry });
        const bobFriendUseCase = new FriendRelationshipUseCase(bobStorage, bob, { peerMessageBus: bobBus, connectedPeerRegistry: bobConnect.registry });
        const aliceSideOfBob = aliceConnect.registry.list().find((p) => p.remoteIdentity && p.remoteIdentity.identityId === bobIdentityId);
        aliceFriendUseCase.sendFriendRequest(aliceSideOfBob);
        await wait(60);
        const bobSideOfAlice = bobConnect.registry.list()[0];
        bobFriendUseCase.acceptFriendRequest(bobSideOfAlice);
        await wait(60);
        assert(aliceFriendUseCase.getState(bobIdentityId) === FriendshipState.FRIEND, "3. FLAGSHIP setup: Alice's own record derives FRIEND after Bob's signed ACCEPT arrives");

        // --- isFriend/hasFriend: built the EXACT way application/
        // CreateWorldViewUseCase.js now builds them from a real
        // FriendRelationshipUseCase — never a hand-rolled test-only
        // closure, unlike every prior avatar flagship in this suite.
        const aliceIsFriend = (peerIdentityId) => aliceFriendUseCase.getState(peerIdentityId) === FriendshipState.FRIEND;
        const aliceHasFriend = () => aliceFriendUseCase.getRelationships().some((relationship) => relationship.isFriend);

        // --- Alice's THREE peer transports — presence, profile,
        // interaction — all on aliceBus, exactly application/
        // CreateWorldViewUseCase.js's own construction.
        const alicePresenceTransport = new PeerAvatarPresenceBroadcastProvider({
            peerMessageBus: aliceBus, connectedPeerRegistry: aliceConnect.registry,
            getVisibilityPolicy: () => alicePresenceVisibilityUseCase.getPolicy(), isFriend: aliceIsFriend
        });
        const aliceProfileTransport = new PeerAvatarPresenceBroadcastProvider({
            peerMessageBus: aliceBus, connectedPeerRegistry: aliceConnect.registry, protocol: 'forkbuild:avatar-profile',
            getVisibilityPolicy: () => aliceProfileVisibilityUseCase.getPolicy(), isFriend: aliceIsFriend
        });
        const aliceInteractionTransport = new PeerAvatarPresenceBroadcastProvider({
            peerMessageBus: aliceBus, connectedPeerRegistry: aliceConnect.registry, protocol: 'forkbuild:avatar-interaction',
            getVisibilityPolicy: () => alicePresenceVisibilityUseCase.getPolicy(), isFriend: aliceIsFriend
        });
        // --- Bob: the same three protocols, own bus/registry, no
        // custom visibility policy at all (default PUBLIC — any
        // authenticated peer, i.e. Alice, receives his presence/
        // profile/interaction).
        const bobPresenceTransport = new PeerAvatarPresenceBroadcastProvider({ peerMessageBus: bobBus, connectedPeerRegistry: bobConnect.registry });
        const bobProfileTransport = new PeerAvatarPresenceBroadcastProvider({ peerMessageBus: bobBus, connectedPeerRegistry: bobConnect.registry, protocol: 'forkbuild:avatar-profile' });
        const bobInteractionTransport = new PeerAvatarPresenceBroadcastProvider({ peerMessageBus: bobBus, connectedPeerRegistry: bobConnect.registry, protocol: 'forkbuild:avatar-interaction' });
        // --- Charlie: same three protocols, own bus/registry — a
        // receiver only, never publishes anything himself.
        const charliePresenceTransport = new PeerAvatarPresenceBroadcastProvider({ peerMessageBus: charlieBus, connectedPeerRegistry: charlieConnect.registry });
        const charlieProfileTransport = new PeerAvatarPresenceBroadcastProvider({ peerMessageBus: charlieBus, connectedPeerRegistry: charlieConnect.registry, protocol: 'forkbuild:avatar-profile' });
        const charlieInteractionTransport = new PeerAvatarPresenceBroadcastProvider({ peerMessageBus: charlieBus, connectedPeerRegistry: charlieConnect.registry, protocol: 'forkbuild:avatar-interaction' });

        // 4 — no BroadcastChannel anywhere in this replica's social
        // transport: every one of the nine transports above is a REAL
        // authenticated-peer transport, never the local development
        // one.
        for (const transport of [
            alicePresenceTransport, aliceProfileTransport, aliceInteractionTransport,
            bobPresenceTransport, bobProfileTransport, bobInteractionTransport,
            charliePresenceTransport, charlieProfileTransport, charlieInteractionTransport
        ]) {
            assert(transport instanceof PeerAvatarPresenceBroadcastProvider, '4. FLAGSHIP: every avatar-social transport is peer-based');
            assert(!(transport instanceof LocalAvatarPresenceBroadcastProvider), '4b. FLAGSHIP: ...and structurally never the BroadcastChannel one (disjoint classes)');
        }

        const aliceSession = new WorldNavigationSession({
            registry: brickRegistry, loadPublicationDocumentUseCase, worldLayoutProvider: null,
            identityProvider: alice, discoveryProvider, placementRegistry,
            avatarProfileUseCase: aliceAvatarProfileUseCase, avatarPresenceSession: aliceAvatarPresenceSession,
            presenceVisibilityUseCase: alicePresenceVisibilityUseCase, avatarProfileVisibilityUseCase: aliceProfileVisibilityUseCase,
            presenceBroadcastProvider: alicePresenceTransport, avatarProfileBroadcastProvider: aliceProfileTransport,
            avatarInteractionBroadcastProvider: aliceInteractionTransport,
            avatarTemplateRegistry: registry, hasFriend: aliceHasFriend
        });
        aliceSession._session = spyRenderFacade();
        aliceSession._setupRemoteAvatars();
        aliceSession._setupLocalAvatar();

        const bobSession = new WorldNavigationSession({
            registry: new CreateBrickRegistryUseCase().execute(), loadPublicationDocumentUseCase: null, worldLayoutProvider: null,
            identityProvider: bob,
            avatarProfileUseCase: bobAvatarProfileUseCase, avatarPresenceSession: bobAvatarPresenceSession,
            presenceBroadcastProvider: bobPresenceTransport, avatarProfileBroadcastProvider: bobProfileTransport,
            avatarInteractionBroadcastProvider: bobInteractionTransport,
            avatarTemplateRegistry: registry
        });
        const bobFacade = spyRenderFacade();
        bobSession._session = bobFacade;
        bobSession._setupRemoteAvatars();
        bobSession._setupLocalAvatar();

        const charlieSession = new WorldNavigationSession({
            registry: new CreateBrickRegistryUseCase().execute(), loadPublicationDocumentUseCase: null, worldLayoutProvider: null,
            presenceBroadcastProvider: charliePresenceTransport, avatarProfileBroadcastProvider: charlieProfileTransport,
            avatarInteractionBroadcastProvider: charlieInteractionTransport,
            avatarTemplateRegistry: registry
        });
        const charlieFacade = spyRenderFacade();
        charlieSession._session = charlieFacade;
        charlieSession._setupRemoteAvatars();

        // Give Alice her real, customized appearance and Bob his own —
        // both AFTER their sessions are already live, so each edit
        // publishes IMMEDIATELY via onProfileChanged (never waiting on
        // the periodic republish tick).
        aliceAvatarProfileUseCase.updateProfile({ templateId: 'humanoid-01', appearance: { skin: 'skin-06' }, displayName: 'Alice' });
        bobAvatarProfileUseCase.updateProfile({ templateId: 'humanoid-02', appearance: { skin: 'skin-03' }, displayName: 'Bob' });

        // Bob publishes his own presence first — Alice needs to KNOW
        // Bob (a real, presence-driven remote avatar) before she can
        // target and wave at him.
        bobAvatarPresenceSession.update({ position: { x: 2, y: 0, z: 2 } });
        await wait(60);
        pumpSession(aliceSession);
        assert(aliceSession._remoteAvatarRegistry.has(bobProfile.avatarId), "5. FLAGSHIP: Alice sees Bob's own presence (Bob: default PUBLIC, no visibility restriction of his own)");

        // Alice moves — her FIRST presence publish, under Presence:
        // FRIENDS, nothing manually authorized beyond real mutual
        // friendship.
        aliceAvatarPresenceSession.update({ position: { x: 1, y: 0, z: 1 } });
        await wait(60);
        pumpSession(bobSession);
        pumpSession(charlieSession);
        assert(bobSession._remoteAvatarRegistry.has(aliceProfile.avatarId), '6. FLAGSHIP: Bob (real friend) receives Alice\'s presence under Presence: FRIENDS');
        assert(charlieSession._remoteAvatarRegistry.has(aliceProfile.avatarId) === false, "7. FLAGSHIP: Charlie (not a friend) receives no presence at all");

        // Profile: PUBLIC (Alice's default, untouched) reaches BOTH Bob
        // and Charlie — proving presence and profile stay independent
        // even now that both ride the identical authenticated
        // connection and the identical PeerMessageBus.
        assert(bobFacade.calls.setRemoteAvatar.find((c) => c.avatarId === aliceProfile.avatarId)?.appearance.skin === 'skin-06',
            "8. FLAGSHIP: Bob renders Alice's REAL customized appearance, delivered over the peer transport");
        assert(bobSession._remoteAvatarAppearanceRegistry.resolve(aliceProfile.avatarId).isPlaceholder === false,
            '9. FLAGSHIP: Bob genuinely knows this is Alice\'s real appearance, not a placeholder');
        const charlieResolved = charlieSession._remoteAvatarAppearanceRegistry.resolve(aliceProfile.avatarId);
        assert(charlieResolved.isPlaceholder === false && charlieResolved.appearance.skin === 'skin-06',
            "10. FLAGSHIP: Charlie ALSO knows Alice's REAL appearance — Profile: PUBLIC reaches him even though Presence: FRIENDS just excluded him entirely");

        // Alice waves AT Bob. Requires Alice to already know Bob (step
        // 5) as a real, presence-driven remote avatar to target.
        const targeted = aliceSession.targetAvatar(bobProfile.avatarId);
        assert(targeted !== null, '11. FLAGSHIP: Alice can target Bob\'s known remote avatar');
        assert(aliceSession.performAvatarInteraction(AvatarInteractionKind.WAVE) === true, '12. FLAGSHIP: Alice successfully WAVEs at Bob');
        await wait(60);
        pumpSession(bobSession);
        pumpSession(charlieSession);
        const bobGesture = bobFacade.calls.setRemoteAvatarGesture.at(-1);
        assert(bobGesture && bobGesture.avatarId === aliceProfile.avatarId && bobGesture.kind === AvatarInteractionKind.WAVE,
            '13. FLAGSHIP: Bob sees Alice\'s wave — interaction rides the SAME Presence: FRIENDS eligibility, delivered over the peer transport');
        assert(charlieFacade.calls.setRemoteAvatarGesture.length === 0,
            "14. FLAGSHIP: Charlie sees no interaction event at all — never an authorized presence connection, so the interaction transport's own per-peer gate never sends it to him in the first place");

        // Alice changes her appearance again — both Bob and Charlie
        // independently receive the new profile revision, through
        // Profile: PUBLIC, regardless of Presence: FRIENDS.
        const revisionBefore = aliceAvatarProfileUseCase.getProfile().revision;
        aliceAvatarProfileUseCase.updateProfile({ appearance: { skin: 'skin-01' } });
        const revisionAfter = aliceAvatarProfileUseCase.getProfile().revision;
        assert(revisionAfter > revisionBefore, '15. FLAGSHIP: an edit strictly increments AvatarProfile.revision');
        await wait(60);
        pumpSession(bobSession);
        pumpSession(charlieSession);
        assert(bobSession._avatarProfileSyncService.getKnownProfile(aliceProfile.avatarId).profileRevision === revisionAfter,
            '16. FLAGSHIP: Bob receives the newer revision');
        assert(charlieSession._avatarProfileSyncService.getKnownProfile(aliceProfile.avatarId).profileRevision === revisionAfter,
            '17. FLAGSHIP: Charlie independently receives it too, through profile alone');

        // Alice moves again — Bob sees the movement.
        aliceAvatarPresenceSession.update({ position: { x: 5, y: 0, z: 5 } });
        await wait(60);
        pumpSession(bobSession);
        const bobKnownAlice = bobSession._presenceSyncService.listKnownPresences(Date.now()).find((p) => p.advertisement.avatarId === aliceProfile.avatarId);
        assert(bobKnownAlice && bobKnownAlice.advertisement.position.x === 5, "18. FLAGSHIP: Bob sees Alice's real, current movement");

        // Bob disconnects — his known profile of Alice is untouched by
        // the connection dropping (profile is durable; presence is
        // ephemeral — see docs/Principles.md, 0.2.41).
        const bobsKnownProfileBeforeDisconnect = bobSession._avatarProfileSyncService.getKnownProfile(aliceProfile.avatarId);
        aliceToBob.close();
        await wait(30);
        assert(aliceToBob.getLifecycleState() === PeerLifecycleState.CLOSED, '19. FLAGSHIP: Alice-Bob connection is closed');
        assert(JSON.stringify(bobSession._avatarProfileSyncService.getKnownProfile(aliceProfile.avatarId)) === JSON.stringify(bobsKnownProfileBeforeDisconnect),
            "20. FLAGSHIP: Bob's known profile for Alice is completely untouched by the connection dropping");

        // Fast-forward Bob's clock — Alice's PRESENCE goes stale/absent
        // and is pruned, but her PROFILE survives.
        const farFuture = Date.now() + 60000;
        const knownFarFuture = bobSession._presenceSyncService.pull(farFuture);
        bobSession._remoteAvatarRegistry.sync(knownFarFuture, farFuture);
        assert(bobSession._remoteAvatarRegistry.has(aliceProfile.avatarId) === false, "21. FLAGSHIP: Alice's PRESENCE has expired from Bob's store");
        assert(bobSession._avatarProfileSyncService.getKnownProfile(aliceProfile.avatarId) !== null,
            '22. FLAGSHIP: ...but Bob still remembers her PROFILE — presence disappearing never destroys it');

        // Reconnect — Alice's persisted friendship with Bob survives
        // untouched, and her next movement reaches him again with no
        // re-authorization gesture required.
        aliceToBob = aliceConnect.connect({ candidateEndpoint: 'bob' });
        await wait(30);
        assert(aliceToBob.getLifecycleState() === PeerLifecycleState.AUTHENTICATED, '23. FLAGSHIP: Alice reconnects to Bob over a fresh connection');
        assert(aliceFriendUseCase.getState(bobIdentityId) === FriendshipState.FRIEND, "24. FLAGSHIP: Alice's persisted friendship record survives the disconnect untouched");
        aliceAvatarPresenceSession.update({ position: { x: 8, y: 0, z: 8 } });
        await wait(60);
        pumpSession(bobSession);
        assert(bobSession._remoteAvatarRegistry.has(aliceProfile.avatarId), "25. FLAGSHIP: Bob sees Alice present again after reconnecting, from his freshly-proven identity alone");
        const recreated = bobFacade.calls.setRemoteAvatar.filter((c) => c.avatarId === aliceProfile.avatarId).at(-1);
        assert(recreated && recreated.appearance.skin === 'skin-01',
            "26. FLAGSHIP: ...and immediately with her REAL, already-known appearance — never a placeholder flash");

        // Throughout all of this: AvatarPresence itself, the original
        // Publication, and its Placement are completely unaffected.
        assert(aliceAvatarPresenceSession.current.position.x === 8, '27. FLAGSHIP: AvatarPresence reflects only real movement, never profile/interaction sync');
        assert(publisher.verifySnapshot(publication.id, publication.contentHash),
            '28. FLAGSHIP: the Publication still verifies against its own content hash');
        const placementAfter = placementRegistry.findByPublicationId(publication.id)[0];
        assert(JSON.stringify(placementAfter.toJSON()) === placementJsonBefore,
            "29. FLAGSHIP: the Building Placement is byte-identical — nothing about peer avatar social transport ever touches world content");
        assert(aliceFriendUseCase.getState(bobIdentityId) === FriendshipState.FRIEND,
            '30. FLAGSHIP: friendship state itself remains untouched by any amount of presence/profile/interaction traffic');

        stopBobListening();
        stopCharlieListening();
        aliceSession.dispose();
        bobSession.dispose();
        charlieSession.dispose();
        alicePresenceTransport.dispose();
        aliceProfileTransport.dispose();
        aliceInteractionTransport.dispose();
        bobPresenceTransport.dispose();
        bobProfileTransport.dispose();
        bobInteractionTransport.dispose();
        charliePresenceTransport.dispose();
        charlieProfileTransport.dispose();
        charlieInteractionTransport.dispose();
        aliceFriendUseCase.dispose();
        bobFriendUseCase.dispose();
        aliceTransport.dispose();
        bobTransport.dispose();
        charlieTransport.dispose();
    }

    console.log('✅ All Peer-Based Avatar Social Transport tests passed.');
}

await runTests();
