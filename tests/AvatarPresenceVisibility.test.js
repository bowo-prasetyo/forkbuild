import { PresenceVisibility, isValidPresenceVisibility } from '../core/PresenceVisibility.js';
import { PresenceVisibilityPolicy } from '../core/PresenceVisibilityPolicy.js';
import { PresenceVisibilityUseCase } from '../application/PresenceVisibilityUseCase.js';
import { CreatePresenceVisibilityUseCase } from '../application/CreatePresenceVisibilityUseCase.js';
import { CreateAvatarPresenceSessionUseCase } from '../application/CreateAvatarPresenceSessionUseCase.js';
import { AvatarProfileUseCase } from '../application/AvatarProfileUseCase.js';
import { AvatarPresenceSession } from '../application/AvatarPresenceSession.js';
import { WorldNavigationSession } from '../application/WorldNavigationSession.js';
import { AvatarTemplateRegistry } from '../core/AvatarTemplateRegistry.js';
import { CoreAvatarTemplateLibrary } from '../core/library/CoreAvatarTemplateLibrary.js';
import { LocalAvatarPresenceBroadcastProvider } from '../presence/LocalAvatarPresenceBroadcastProvider.js';
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

// 0.2.40 — Avatar Presence Visibility & Privacy.
//
//   Section A: core/PresenceVisibility.js
//   Section B: core/PresenceVisibilityPolicy.js
//   Section C: application/PresenceVisibilityUseCase.js
//   Section D: application/CreatePresenceVisibilityUseCase.js / CreateAvatarPresenceSessionUseCase.js wiring
//   Section E: WorldNavigationSession publish gating
//   Section F: FLAGSHIP — Alice controls her own visibility; Bob only
//              ever sees what Alice actually chose to advertise
//
// Central architectural claim under test throughout: visibility is
// decided at the SENDER, before anything reaches the transport — see
// docs/Principles.md, "Visibility Happens Before Broadcasting, Never
// After." Nothing in 0.2.37/0.2.38's receiver-side machinery
// (PresenceSyncService, LocalPresenceStore, PresenceTrustBoundary) is
// touched by this milestone at all.

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
    const presenceVisibilityUseCase = new PresenceVisibilityUseCase(storage, identityProvider);
    return { storage, identityProvider, avatarProfileUseCase, avatarPresenceSession, presenceVisibilityUseCase };
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

async function runTests() {
    const registry = buildRegistry();

    // -------------------------------------------------------------
    // Section A — core/PresenceVisibility.js
    // -------------------------------------------------------------
    {
        assert(isValidPresenceVisibility(PresenceVisibility.PUBLIC), '1. PUBLIC is valid');
        assert(isValidPresenceVisibility(PresenceVisibility.FRIENDS), '2. FRIENDS is valid');
        assert(isValidPresenceVisibility(PresenceVisibility.LOCAL), '3. LOCAL is valid');
        assert(isValidPresenceVisibility(PresenceVisibility.HIDDEN), '4. HIDDEN is valid');
        assert(isValidPresenceVisibility('made-up') === false, '5. an unrecognized value is never valid');
        assert(isValidPresenceVisibility(null) === false, '6. null is never valid');
    }

    // -------------------------------------------------------------
    // Section B — core/PresenceVisibilityPolicy.js
    // -------------------------------------------------------------
    {
        const def = PresenceVisibilityPolicy.default();
        assert(def.visibility === PresenceVisibility.PUBLIC, '7. default() is PUBLIC');
        assert(def.authorizedPeerIdentities.length === 0, '8. default() has no authorized peers');
        assert(def.shouldAdvertise() === true, '9. PUBLIC always advertises');
    }
    {
        assert(new PresenceVisibilityPolicy({ visibility: PresenceVisibility.LOCAL }).shouldAdvertise() === true,
            '10. LOCAL always advertises (observationally identical to PUBLIC today — only a local-scoped transport exists)');
        assert(new PresenceVisibilityPolicy({ visibility: PresenceVisibility.HIDDEN }).shouldAdvertise() === false,
            '11. HIDDEN never advertises');
    }
    {
        const emptyFriends = new PresenceVisibilityPolicy({ visibility: PresenceVisibility.FRIENDS, authorizedPeerIdentities: [] });
        assert(emptyFriends.shouldAdvertise() === false, '12. FRIENDS with NO authorized peers behaves like HIDDEN');
        const realFriends = new PresenceVisibilityPolicy({ visibility: PresenceVisibility.FRIENDS, authorizedPeerIdentities: ['bob'] });
        assert(realFriends.shouldAdvertise() === true, '13. FRIENDS with at least one authorized peer advertises');
    }
    {
        assert(() => new PresenceVisibilityPolicy({ visibility: 'made-up' }), '14. placeholder');
        let threw = false;
        try { new PresenceVisibilityPolicy({ visibility: 'made-up' }); } catch { threw = true; }
        assert(threw, '15. constructing with an unrecognized visibility throws');
    }
    {
        // Normalization: trim, dedupe, drop blanks, deterministic order.
        const policy = new PresenceVisibilityPolicy({
            visibility: PresenceVisibility.FRIENDS,
            authorizedPeerIdentities: [' bob ', 'alice', 'bob', '', '   ', 'alice']
        });
        assert(policy.authorizedPeerIdentities.length === 2, '16. duplicates and blanks are dropped');
        assert(policy.authorizedPeerIdentities.includes('bob') && policy.authorizedPeerIdentities.includes('alice'),
            '17. real entries survive normalization, trimmed');
        assert(JSON.stringify(policy.authorizedPeerIdentities) === JSON.stringify(['alice', 'bob']),
            '18. normalization is deterministically sorted');
        assert(new PresenceVisibilityPolicy({ authorizedPeerIdentities: 'not-an-array' }).authorizedPeerIdentities.length === 0,
            '19. a non-array input degrades to an empty list rather than throwing');
    }
    {
        // Withers and immutability.
        const original = PresenceVisibilityPolicy.default();
        const changed = original.withVisibility(PresenceVisibility.HIDDEN);
        assert(original.visibility === PresenceVisibility.PUBLIC, '20. withVisibility() never mutates the original');
        assert(changed.visibility === PresenceVisibility.HIDDEN, '21. ...and returns a genuinely new instance');
        const withPeers = changed.withAuthorizedPeerIdentities(['carol']);
        assert(withPeers.visibility === PresenceVisibility.HIDDEN, '22. withAuthorizedPeerIdentities() preserves the existing visibility');
        assert(withPeers.authorizedPeerIdentities[0] === 'carol', '23. ...and applies the new peer list');
    }
    {
        // toJSON/fromJSON round trip.
        const policy = new PresenceVisibilityPolicy({ visibility: PresenceVisibility.FRIENDS, authorizedPeerIdentities: ['dave'] });
        const restored = PresenceVisibilityPolicy.fromJSON(policy.toJSON());
        assert(restored.visibility === policy.visibility && restored.authorizedPeerIdentities.join(',') === policy.authorizedPeerIdentities.join(','),
            '24. toJSON()/fromJSON() round-trips exactly');
        assert(PresenceVisibilityPolicy.fromJSON(null).visibility === PresenceVisibility.PUBLIC,
            '25. fromJSON(null) degrades to the default policy rather than throwing');
    }

    // -------------------------------------------------------------
    // Section C — application/PresenceVisibilityUseCase.js
    // -------------------------------------------------------------
    {
        const storage = new InMemoryStorageProvider();
        const identity = new LocalIdentityProvider(storage);
        identity.login('user-c1');
        const useCase = new PresenceVisibilityUseCase(storage, identity);

        const first = useCase.getPolicy();
        assert(first.visibility === PresenceVisibility.PUBLIC, '26. a first-ever getPolicy() creates the default (PUBLIC)');
        assert(storage.load('presence-visibility:user-c1') !== null, '27. the default is actually PERSISTED on first access, not just returned');

        const second = useCase.getPolicy();
        assert(second.visibility === first.visibility, '28. a second getPolicy() returns the SAME stored policy, not a re-rolled one');

        let receivedEvent = null;
        const unsubscribe = useCase.onPolicyChanged((policy) => { receivedEvent = policy; });
        const updated = useCase.updatePolicy({ visibility: PresenceVisibility.HIDDEN });
        assert(updated.visibility === PresenceVisibility.HIDDEN, '29. updatePolicy() returns the new policy');
        assert(useCase.getPolicy().visibility === PresenceVisibility.HIDDEN, '30. ...and persists it — a fresh getPolicy() sees it too');
        assert(receivedEvent && receivedEvent.visibility === PresenceVisibility.HIDDEN, '31. onPolicyChanged() fires with the new policy');
        unsubscribe();

        let threw = false;
        try { useCase.updatePolicy({ visibility: 'made-up' }); } catch { threw = true; }
        assert(threw, '32. updatePolicy() with an unrecognized visibility throws — nothing invalid is ever persisted');
        assert(useCase.getPolicy().visibility === PresenceVisibility.HIDDEN, '33. ...and the rejected update never partially applied');

        useCase.updatePolicy({ authorizedPeerIdentities: ['eve'] });
        assert(useCase.getPolicy().authorizedPeerIdentities[0] === 'eve', '34. updating ONLY authorizedPeerIdentities leaves visibility untouched');
        assert(useCase.getPolicy().visibility === PresenceVisibility.HIDDEN, '35. ...confirmed: visibility is still HIDDEN from the earlier update');
    }
    {
        const storage = new InMemoryStorageProvider();
        const identity = new LocalIdentityProvider(storage);
        const useCase = new PresenceVisibilityUseCase(storage, identity); // never logged in
        let threw = false;
        try { useCase.getPolicy(); } catch { threw = true; }
        assert(threw, '36. getPolicy() with nobody logged in throws rather than silently resolving a policy for nobody');
    }

    // -------------------------------------------------------------
    // Section D — wiring: CreatePresenceVisibilityUseCase / CreateAvatarPresenceSessionUseCase
    // -------------------------------------------------------------
    {
        const storage = new InMemoryStorageProvider();
        const identity = new LocalIdentityProvider(storage);
        identity.login('user-d1');
        const wired = new CreatePresenceVisibilityUseCase().execute(identity);
        assert(wired.presenceVisibilityUseCase instanceof PresenceVisibilityUseCase, '37. CreatePresenceVisibilityUseCase wires a real PresenceVisibilityUseCase');
        assert(wired.presenceVisibilityUseCase.getPolicy().visibility === PresenceVisibility.PUBLIC, '38. ...defaulting to PUBLIC');
    }
    {
        const storage = new InMemoryStorageProvider();
        const identity = new LocalIdentityProvider(storage);
        identity.login('user-d2');
        const avatarWiring = new CreateAvatarPresenceSessionUseCase().execute(identity);
        assert(avatarWiring.presenceVisibilityUseCase instanceof PresenceVisibilityUseCase,
            '39. CreateAvatarPresenceSessionUseCase now ALSO wires presenceVisibilityUseCase alongside avatarProfileUseCase/presenceSession');
        assert(!!avatarWiring.avatarProfileUseCase && !!avatarWiring.presenceSession,
            '40. ...without disturbing the existing avatarProfileUseCase/presenceSession shape');
    }

    // -------------------------------------------------------------
    // Section E — WorldNavigationSession publish gating
    // -------------------------------------------------------------
    {
        // E1 — default policy (PUBLIC, since nobody ever called
        // updatePolicy()): advertises normally.
        const { avatarProfileUseCase, avatarPresenceSession, presenceVisibilityUseCase } = buildAvatarStack('session-e1', registry);
        function fakeBroadcastProvider() {
            const sent = [];
            return { sent, advertise: (ad) => sent.push(ad), onAdvertisement: () => () => {}, dispose() {} };
        }
        const provider = fakeBroadcastProvider();
        const session = new WorldNavigationSession({
            registry: new CreateBrickRegistryUseCase().execute(), loadPublicationDocumentUseCase: null, worldLayoutProvider: null,
            avatarProfileUseCase, avatarPresenceSession, presenceVisibilityUseCase,
            presenceBroadcastProvider: provider, avatarTemplateRegistry: registry
        });
        session._session = spyRenderFacade();
        session._setupRemoteAvatars();
        session._setupLocalAvatar();

        avatarPresenceSession.update({ position: { x: 1, y: 0, z: 0 } });
        assert(provider.sent.length === 1, '41. a session with an explicitly-wired but never-configured visibility policy defaults to PUBLIC and advertises normally');
        session.dispose();
    }
    {
        // E2 — HIDDEN suppresses publishing entirely, even though the
        // local avatar genuinely moves and AvatarPresenceSession
        // genuinely accepts the update.
        const { avatarProfileUseCase, avatarPresenceSession, presenceVisibilityUseCase } = buildAvatarStack('session-e2', registry);
        presenceVisibilityUseCase.updatePolicy({ visibility: PresenceVisibility.HIDDEN });
        function fakeBroadcastProvider() {
            const sent = [];
            return { sent, advertise: (ad) => sent.push(ad), onAdvertisement: () => () => {}, dispose() {} };
        }
        const provider = fakeBroadcastProvider();
        const session = new WorldNavigationSession({
            registry: new CreateBrickRegistryUseCase().execute(), loadPublicationDocumentUseCase: null, worldLayoutProvider: null,
            avatarProfileUseCase, avatarPresenceSession, presenceVisibilityUseCase,
            presenceBroadcastProvider: provider, avatarTemplateRegistry: registry
        });
        session._session = spyRenderFacade();
        session._setupRemoteAvatars();
        session._setupLocalAvatar();

        avatarPresenceSession.update({ position: { x: 5, y: 0, z: 0 } });
        assert(avatarPresenceSession.current.sequence === 1, '42. the local presence itself still genuinely advances — HIDDEN is a publish gate, not a movement gate');
        assert(provider.sent.length === 0, '43. ...but NOTHING reaches the transport while HIDDEN');
        session.dispose();
    }
    {
        // E3 — FRIENDS with an empty peer list behaves like HIDDEN;
        // adding a peer starts advertising.
        const { avatarProfileUseCase, avatarPresenceSession, presenceVisibilityUseCase } = buildAvatarStack('session-e3', registry);
        presenceVisibilityUseCase.updatePolicy({ visibility: PresenceVisibility.FRIENDS });
        function fakeBroadcastProvider() {
            const sent = [];
            return { sent, advertise: (ad) => sent.push(ad), onAdvertisement: () => () => {}, dispose() {} };
        }
        const provider = fakeBroadcastProvider();
        const session = new WorldNavigationSession({
            registry: new CreateBrickRegistryUseCase().execute(), loadPublicationDocumentUseCase: null, worldLayoutProvider: null,
            avatarProfileUseCase, avatarPresenceSession, presenceVisibilityUseCase,
            presenceBroadcastProvider: provider, avatarTemplateRegistry: registry
        });
        session._session = spyRenderFacade();
        session._setupRemoteAvatars();
        session._setupLocalAvatar();

        avatarPresenceSession.update({ position: { x: 1, y: 0, z: 0 } });
        assert(provider.sent.length === 0, '44. FRIENDS with nobody authorized never advertises');

        presenceVisibilityUseCase.updatePolicy({ authorizedPeerIdentities: ['bob'] });
        avatarPresenceSession.update({ position: { x: 2, y: 0, z: 0 } });
        assert(provider.sent.length === 1, '45. FRIENDS starts advertising the moment an authorized peer is configured, on the very next update');
        session.dispose();
    }
    {
        // E4 — no presenceVisibilityUseCase wired at all: always
        // advertises, exactly 0.2.37/0.2.38's own behavior, unchanged.
        const { avatarProfileUseCase, avatarPresenceSession } = buildAvatarStack('session-e4', registry);
        function fakeBroadcastProvider() {
            const sent = [];
            return { sent, advertise: (ad) => sent.push(ad), onAdvertisement: () => () => {}, dispose() {} };
        }
        const provider = fakeBroadcastProvider();
        const session = new WorldNavigationSession({
            registry: new CreateBrickRegistryUseCase().execute(), loadPublicationDocumentUseCase: null, worldLayoutProvider: null,
            avatarProfileUseCase, avatarPresenceSession, // presenceVisibilityUseCase deliberately OMITTED
            presenceBroadcastProvider: provider, avatarTemplateRegistry: registry
        });
        session._session = spyRenderFacade();
        session._setupRemoteAvatars();
        session._setupLocalAvatar();
        avatarPresenceSession.update({ position: { x: 1, y: 0, z: 0 } });
        assert(provider.sent.length === 1, '46. a session with no visibility policy wired always advertises — full backward compatibility');
        session.dispose();
    }
    {
        // E5 — PUBLIC and LOCAL both advertise (observationally
        // identical today).
        for (const mode of [PresenceVisibility.PUBLIC, PresenceVisibility.LOCAL]) {
            const { avatarProfileUseCase, avatarPresenceSession, presenceVisibilityUseCase } = buildAvatarStack(`session-e5-${mode}`, registry);
            presenceVisibilityUseCase.updatePolicy({ visibility: mode });
            function fakeBroadcastProvider() {
                const sent = [];
                return { sent, advertise: (ad) => sent.push(ad), onAdvertisement: () => () => {}, dispose() {} };
            }
            const provider = fakeBroadcastProvider();
            const session = new WorldNavigationSession({
                registry: new CreateBrickRegistryUseCase().execute(), loadPublicationDocumentUseCase: null, worldLayoutProvider: null,
                avatarProfileUseCase, avatarPresenceSession, presenceVisibilityUseCase,
                presenceBroadcastProvider: provider, avatarTemplateRegistry: registry
            });
            session._session = spyRenderFacade();
            session._setupRemoteAvatars();
            session._setupLocalAvatar();
            avatarPresenceSession.update({ position: { x: 1, y: 0, z: 0 } });
            assert(provider.sent.length === 1, `47. ${mode} mode advertises normally`);
            session.dispose();
        }
    }

    // -------------------------------------------------------------
    // Section F — FLAGSHIP: Alice controls her own visibility; Bob
    // only ever sees what Alice actually chose to advertise.
    //
    //   Alice is HIDDEN -> moves -> Bob receives NOTHING, ever.
    //   Alice switches to PUBLIC -> moves -> Bob now sees her.
    //   Throughout: AvatarProfile/AvatarPresence/Publication/Placement
    //   are exactly what Alice's own actions would produce regardless
    //   of visibility — visibility never alters any of them, only
    //   whether presence reaches the transport.
    // -------------------------------------------------------------
    {
        const channelName = 'forkbuild-test-flagship-0-2-40';

        const storage = new InMemoryStorageProvider();
        const alice = new LocalIdentityProvider(storage);
        alice.login('alice');
        const aliceAvatarProfileUseCase = new AvatarProfileUseCase(storage, alice, registry);
        aliceAvatarProfileUseCase.updateProfile({ templateId: 'humanoid-01', displayName: 'Alice' });
        const aliceProfile = aliceAvatarProfileUseCase.getProfile();
        const aliceAvatarPresenceSession = new AvatarPresenceSession(aliceProfile, { position: { x: 0, y: 0, z: 0 } });
        const alicePresenceVisibilityUseCase = new PresenceVisibilityUseCase(storage, alice);
        alicePresenceVisibilityUseCase.updatePolicy({ visibility: PresenceVisibility.HIDDEN });
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
        const document = new Document({ world, metadata: new DocumentMetadata({ title: 'Flagship Visibility Castle', author: 'alice', license: new License({ id: LicenseId.CC0_1_0 }) }) });
        const publication = publishDocumentUseCase.execute({ document });

        const placementBefore = placementRegistry.findByPublicationId(publication.id)[0];
        const placementJsonBefore = JSON.stringify(placementBefore.toJSON());
        const aliceProfileJsonBefore = JSON.stringify(aliceAvatarProfileUseCase.getProfile().toJSON());

        const aliceSession = new WorldNavigationSession({
            registry: brickRegistry, loadPublicationDocumentUseCase, worldLayoutProvider: null,
            identityProvider: alice, discoveryProvider, placementRegistry,
            avatarProfileUseCase: aliceAvatarProfileUseCase, avatarPresenceSession: aliceAvatarPresenceSession,
            presenceVisibilityUseCase: alicePresenceVisibilityUseCase,
            presenceBroadcastProvider: aliceBroadcastProvider, avatarTemplateRegistry: registry
        });
        const aliceFacade = spyRenderFacade();
        aliceSession._session = aliceFacade;
        aliceSession._setupRemoteAvatars();
        aliceSession._setupLocalAvatar();

        const bobBroadcastProvider = new LocalAvatarPresenceBroadcastProvider(channelName);
        const bobSession = new WorldNavigationSession({
            registry: new CreateBrickRegistryUseCase().execute(), loadPublicationDocumentUseCase: null, worldLayoutProvider: null,
            presenceBroadcastProvider: bobBroadcastProvider, avatarTemplateRegistry: registry
        });
        const bobFacade = spyRenderFacade();
        bobSession._session = bobFacade;
        bobSession._setupRemoteAvatars();

        const bobPull = () => {
            const now = Date.now();
            const known = bobSession._presenceSyncService.pull(now);
            bobSession._remoteAvatarRegistry.sync(known, now);
            bobSession._remoteAvatarRegistry.tick(now);
            return known;
        };

        // Alice, HIDDEN, moves for real — genuinely, verifiably.
        aliceAvatarPresenceSession.update({ position: { x: 7, y: 0, z: 7 } });
        assert(aliceAvatarPresenceSession.current.position.x === 7, '48. FLAGSHIP: Alice genuinely moved locally while HIDDEN');
        await wait(80);
        let known = bobPull();
        assert(known.length === 0, "49. FLAGSHIP: Bob receives NOTHING — Alice's movement never reached the transport at all");
        assert(bobSession._remoteAvatarRegistry.has(aliceProfile.avatarId) === false, "50. FLAGSHIP: Bob doesn't even know Alice's avatar exists");

        // Alice moves AGAIN while still hidden — still nothing.
        aliceAvatarPresenceSession.update({ position: { x: 8, y: 0, z: 8 } });
        await wait(80);
        known = bobPull();
        assert(known.length === 0, '51. FLAGSHIP: still nothing, after a SECOND hidden movement');

        // Alice switches to PUBLIC.
        alicePresenceVisibilityUseCase.updatePolicy({ visibility: PresenceVisibility.PUBLIC });
        aliceAvatarPresenceSession.update({ position: { x: 9, y: 0, z: 9 } });
        await wait(80);
        known = bobPull();
        assert(known.length === 1 && known[0].advertisement.avatarId === aliceProfile.avatarId,
            '52. FLAGSHIP: the moment Alice switches to PUBLIC, her NEXT movement reaches Bob');
        assert(known[0].advertisement.position.x === 9,
            "53. FLAGSHIP: Bob sees Alice's CURRENT position — the two earlier hidden movements were never retroactively sent");

        // Throughout all of this: AvatarProfile, the original
        // Publication, and its Placement are completely unaffected by
        // visibility policy changes — visibility gates the TRANSPORT,
        // nothing about the avatar's own durable identity or the
        // world's content.
        assert(JSON.stringify(aliceAvatarProfileUseCase.getProfile().toJSON()) === aliceProfileJsonBefore,
            "54. FLAGSHIP: Alice's AvatarProfile is byte-identical throughout — visibility never touches appearance/identity");
        assert(publisher.verifySnapshot(publication.id, publication.contentHash),
            '55. FLAGSHIP: the Publication still verifies against its own content hash');
        const placementAfter = placementRegistry.findByPublicationId(publication.id)[0];
        assert(JSON.stringify(placementAfter.toJSON()) === placementJsonBefore,
            "56. FLAGSHIP: the Building Placement is byte-identical — nothing about visibility ever touches world content");

        aliceSession.dispose();
        bobSession.dispose();
        aliceBroadcastProvider.dispose();
        bobBroadcastProvider.dispose();
    }

    console.log('✅ All Avatar Presence Visibility & Privacy tests passed.');
}

await runTests();
