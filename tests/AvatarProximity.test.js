import { computeNearbyAvatars } from '../core/AvatarProximity.js';
import { AvatarTemplateRegistry } from '../core/AvatarTemplateRegistry.js';
import { CoreAvatarTemplateLibrary } from '../core/library/CoreAvatarTemplateLibrary.js';
import { AvatarProfileUseCase } from '../application/AvatarProfileUseCase.js';
import { AvatarPresenceSession } from '../application/AvatarPresenceSession.js';
import { WorldNavigationSession } from '../application/WorldNavigationSession.js';
import { LocalAvatarPresenceBroadcastProvider } from '../presence/LocalAvatarPresenceBroadcastProvider.js';
import { LocalIdentityProvider } from '../identity/LocalIdentityProvider.js';
import { StorageProvider } from '../storage/StorageProvider.js';
import { CreateBrickRegistryUseCase } from '../application/CreateBrickRegistryUseCase.js';
import { AvatarAnimationState } from '../core/AvatarAnimationState.js';
import { SpatialSelectionState } from '../application/spatial-state/SpatialSelectionState.js';

// 0.2.43 — Avatar-Avatar Proximity & Interaction Targets.
//
//   Section A: core/AvatarProximity.js — pure computation
//   Section B: WorldNavigationSession.getNearbyAvatars()
//   Section C: WorldNavigationSession.getAvatarDisplayName()
//   Section D: WorldNavigationSession.targetAvatar()
//   Section E: FLAGSHIP — the design doc's own scripted scenario
//
// Central architectural claim under test throughout: "who is near me"
// is a DERIVED, purely local geometric fact — never announced, never
// a claim one replica makes about another, never written anywhere —
// and being NEAR another avatar never authorizes touching it: nothing
// exercised here ever mutates a remote avatar's own presence or
// profile, because no such API exists at all.

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

function buildAvatarStack(registry, username, position) {
    const storage = new InMemoryStorageProvider();
    const identityProvider = new LocalIdentityProvider(storage);
    identityProvider.login(username);
    const avatarProfileUseCase = new AvatarProfileUseCase(storage, identityProvider, registry);
    const profile = avatarProfileUseCase.getProfile();
    const avatarPresenceSession = new AvatarPresenceSession(profile, position ? { position } : undefined);
    return { storage, identityProvider, avatarProfileUseCase, avatarPresenceSession };
}

function presenceEntry(avatarId, position, { lifecycleState = 'present', trustStatus = 'VALID', animation = AvatarAnimationState.IDLE, ownerIdentity = null } = {}) {
    return {
        advertisement: { avatarId, ownerIdentity, position, rotation: { x: 0, y: 0, z: 0 }, animation, sequence: 1 },
        lifecycleState,
        trustObservation: trustStatus === null ? null : { status: trustStatus }
    };
}

function spyFacade() {
    const calls = { setLocalAvatar: [], updateLocalAvatarAppearance: [], updateLocalAvatarPresence: [], setLocalAvatarVisible: [], removeLocalAvatar: 0, onAnimationFrameCallbacks: [], setRemoteAvatar: [], removeRemoteAvatar: [] };
    return {
        calls,
        setLocalAvatar: (template, appearance, presence) => calls.setLocalAvatar.push({ template, appearance, presence }),
        updateLocalAvatarAppearance: (template, appearance) => calls.updateLocalAvatarAppearance.push({ template, appearance }),
        updateLocalAvatarPresence: (presence) => calls.updateLocalAvatarPresence.push({ presence }),
        setLocalAvatarVisible: (visible) => calls.setLocalAvatarVisible.push(visible),
        removeLocalAvatar: () => { calls.removeLocalAvatar++; },
        onAnimationFrame: (callback) => { calls.onAnimationFrameCallbacks.push(callback); return () => {}; },
        getCameraState: () => ({ position: { x: 10, y: 10, z: 10 }, target: { x: 0, y: 0, z: 0 }, zoom: 1 }),
        setCameraState() {},
        addWorld() {}, removeWorld() {}, clearSelection() {}, clearHover() {},
        selectBricks() {}, hoverBrick() {}, showPreview() {}, hidePreview() {},
        showGizmo() {}, hideGizmo() {},
        gizmoHitTest() { return true; }, gizmoPointerDown() { return false; },
        gizmoPointerMove() { return { consumed: false, hovered: false, feedback: null }; },
        gizmoPointerUp() { return { consumed: false, committed: false, feedback: null }; },
        gizmoKeyDown() { return false; },
        pick() { return null; }, pickGround() { return null; }, pickRectangle() { return []; },
        pickAvatar() { return null; },
        setControlsEnabled() {},
        setRemoteAvatar: (avatarId, template, appearance, advertisement) => calls.setRemoteAvatar.push({ avatarId, template, appearance, advertisement }),
        updateRemoteAvatarPresence() {},
        removeRemoteAvatar: (avatarId) => calls.removeRemoteAvatar.push(avatarId),
        setRemoteAvatarsVisible() {},
        dispose() {}
    };
}

async function runTests() {
    const registry = buildRegistry();
    const brickRegistry = new CreateBrickRegistryUseCase().execute();

    // -------------------------------------------------------------
    // Section A — core/AvatarProximity.js: pure computation
    // -------------------------------------------------------------
    {
        const result = computeNearbyAvatars({ localPosition: { x: 0, y: 0, z: 0 }, knownPresences: [], radius: 10 });
        assert(Array.isArray(result) && result.length === 0, '1. computeNearbyAvatars: no known presences -> empty array');
    }
    {
        const knownPresences = [
            presenceEntry('far', { x: 100, y: 0, z: 0 }),
            presenceEntry('near', { x: 3, y: 0, z: 0 }),
            presenceEntry('mid', { x: 6, y: 0, z: 0 })
        ];
        const result = computeNearbyAvatars({ localPosition: { x: 0, y: 0, z: 0 }, knownPresences, radius: 200 });
        assert(result.map((r) => r.avatarId).join(',') === 'near,mid,far', '2. computeNearbyAvatars: sorted NEAREST first, regardless of input order');
        assert(Math.abs(result[0].distance - 3) < 1e-9, '3. computeNearbyAvatars: distance is exact Euclidean distance');
    }
    {
        const knownPresences = [
            presenceEntry('inside', { x: 5, y: 0, z: 0 }),
            presenceEntry('outside', { x: 50, y: 0, z: 0 })
        ];
        const result = computeNearbyAvatars({ localPosition: { x: 0, y: 0, z: 0 }, knownPresences, radius: 10 });
        assert(result.length === 1 && result[0].avatarId === 'inside', '4. computeNearbyAvatars: radius genuinely filters out anything farther away');
    }
    {
        const knownPresences = [presenceEntry('bob', { x: 4, y: 0, z: 3 }, { lifecycleState: 'stale', trustStatus: 'STALE', animation: AvatarAnimationState.WALKING })];
        const result = computeNearbyAvatars({ localPosition: { x: 0, y: 0, z: 0 }, knownPresences, radius: 50 });
        assert(result[0].lifecycleState === 'stale' && result[0].trustStatus === 'STALE',
            '5. computeNearbyAvatars: lifecycleState/trustStatus pass through UNCHANGED from the trust boundary\'s own judgment — never re-derived here');
        assert(result[0].animation === AvatarAnimationState.WALKING, '6. computeNearbyAvatars: animation rides along for the UI mockup\'s own "Walking"/"Idle" display');
        assert(result[0].position.x === 4 && result[0].position.z === 3, '7. computeNearbyAvatars: position is a plain, independent copy');
    }
    {
        // Defensive: a malformed entry (missing advertisement/position)
        // is skipped, never thrown on — this function trusts its
        // input's SHAPE completely but still degrades gracefully
        // against garbage rather than crashing the whole computation.
        const knownPresences = [presenceEntry('ok', { x: 1, y: 0, z: 0 }), { advertisement: null }, {}];
        const result = computeNearbyAvatars({ localPosition: { x: 0, y: 0, z: 0 }, knownPresences, radius: 50 });
        assert(result.length === 1 && result[0].avatarId === 'ok', '8. computeNearbyAvatars: malformed entries are skipped, never thrown on');
    }
    {
        // No radius given -> effectively unlimited (Infinity default).
        const knownPresences = [presenceEntry('far', { x: 100000, y: 0, z: 0 })];
        const result = computeNearbyAvatars({ localPosition: { x: 0, y: 0, z: 0 }, knownPresences });
        assert(result.length === 1, '9. computeNearbyAvatars: an omitted radius defaults to unlimited, never silently excludes everything');
    }

    // -------------------------------------------------------------
    // Section B — WorldNavigationSession.getNearbyAvatars()
    // -------------------------------------------------------------
    {
        const session = new WorldNavigationSession({ registry: brickRegistry, loadPublicationDocumentUseCase: null, worldLayoutProvider: null });
        assert(Array.isArray(session.getNearbyAvatars()) && session.getNearbyAvatars().length === 0,
            '10. getNearbyAvatars(): no local avatar at all -> [] gracefully, never throws');
    }
    {
        const { avatarProfileUseCase, avatarPresenceSession } = buildAvatarStack(registry, 'session-b1', { x: 0, y: 0, z: 0 });
        const session = new WorldNavigationSession({
            registry: brickRegistry, loadPublicationDocumentUseCase: null, worldLayoutProvider: null,
            avatarProfileUseCase, avatarPresenceSession
            // Deliberately NO presenceBroadcastProvider -> no _presenceSyncService.
        });
        session._session = spyFacade();
        session._setupLocalAvatar();
        assert(session.getNearbyAvatars().length === 0, '11. getNearbyAvatars(): a local avatar with no presence sync wired -> [] gracefully');
    }
    {
        const channelName = 'forkbuild-test-proximity-session-b2';
        const { avatarProfileUseCase, avatarPresenceSession } = buildAvatarStack(registry, 'session-b2', { x: 0, y: 0, z: 0 });
        const provider = new LocalAvatarPresenceBroadcastProvider(channelName);
        const session = new WorldNavigationSession({
            registry: brickRegistry, loadPublicationDocumentUseCase: null, worldLayoutProvider: null,
            avatarProfileUseCase, avatarPresenceSession,
            presenceBroadcastProvider: provider, avatarTemplateRegistry: registry
        });
        session._session = spyFacade();
        session._setupRemoteAvatars();
        session._setupLocalAvatar();

        // Directly seed the store the same way a real pull() would —
        // exercising getNearbyAvatars() itself, not the transport.
        session._presenceSyncService._store.ingest({ avatarId: 'near-bob', ownerIdentity: 'bob', position: { x: 3, y: 0, z: 0 }, rotation: { x: 0, y: 0, z: 0 }, animation: AvatarAnimationState.IDLE, sequence: 1 });
        session._presenceSyncService._store.ingest({ avatarId: 'far-carol', ownerIdentity: 'carol', position: { x: 1000, y: 0, z: 0 }, rotation: { x: 0, y: 0, z: 0 }, animation: AvatarAnimationState.IDLE, sequence: 1 });

        const nearby = session.getNearbyAvatars(15);
        assert(nearby.length === 1 && nearby[0].avatarId === 'near-bob', '12. getNearbyAvatars(radius): the default query radius genuinely bounds results');
        assert(Math.abs(nearby[0].distance - 3) < 1e-9, '13. getNearbyAvatars(): distance is measured from the LOCAL avatar\'s own position');

        const wide = session.getNearbyAvatars(100000);
        assert(wide.length === 2, '14. getNearbyAvatars(): a wide-enough radius finds everyone known');

        session.dispose();
        provider.dispose();
    }

    // -------------------------------------------------------------
    // Section C — WorldNavigationSession.getAvatarDisplayName()
    // -------------------------------------------------------------
    {
        const { avatarProfileUseCase, avatarPresenceSession } = buildAvatarStack(registry, 'session-c1', { x: 0, y: 0, z: 0 });
        const session = new WorldNavigationSession({ registry: brickRegistry, loadPublicationDocumentUseCase: null, worldLayoutProvider: null, avatarProfileUseCase, avatarPresenceSession });
        session._session = spyFacade();
        session._setupLocalAvatar();
        assert(session.getAvatarDisplayName(avatarPresenceSession.current.avatarId) === 'session-c1',
            '15. getAvatarDisplayName(): the local avatar with no chosen displayName falls back to ownerIdentity (the logged-in username)');
        avatarProfileUseCase.updateProfile({ displayName: 'Alice' });
        assert(session.getAvatarDisplayName(avatarPresenceSession.current.avatarId) === 'Alice',
            '16. getAvatarDisplayName(): once set, the local avatar\'s own chosen displayName wins');
    }
    {
        const channelName = 'forkbuild-test-proximity-session-c2';
        const { avatarProfileUseCase, avatarPresenceSession } = buildAvatarStack(registry, 'session-c2', { x: 0, y: 0, z: 0 });
        const presenceProvider = new LocalAvatarPresenceBroadcastProvider(channelName);
        const profileProvider = new LocalAvatarPresenceBroadcastProvider(channelName + '-profile');
        const session = new WorldNavigationSession({
            registry: brickRegistry, loadPublicationDocumentUseCase: null, worldLayoutProvider: null,
            avatarProfileUseCase, avatarPresenceSession,
            presenceBroadcastProvider: presenceProvider, avatarTemplateRegistry: registry,
            avatarProfileBroadcastProvider: profileProvider
        });
        session._session = spyFacade();
        session._setupRemoteAvatars();
        session._setupLocalAvatar();

        session._presenceSyncService._store.ingest({ avatarId: 'remote-1', ownerIdentity: 'bob-owner', position: { x: 1, y: 0, z: 0 }, rotation: { x: 0, y: 0, z: 0 }, animation: AvatarAnimationState.IDLE, sequence: 1 });
        assert(session.getAvatarDisplayName('remote-1') === 'bob-owner',
            '17. getAvatarDisplayName(): a remote avatar with no synced profile falls back to ownerIdentity');

        session._avatarProfileSyncService._store.ingest({ avatarId: 'remote-1', ownerIdentity: 'bob-owner', profileRevision: 1, templateId: 'humanoid-01', appearance: {}, displayName: 'Bob' });
        assert(session.getAvatarDisplayName('remote-1') === 'Bob',
            '18. getAvatarDisplayName(): once a profile IS known, its real displayName wins over ownerIdentity — 0.2.41 catch-up');

        assert(session.getAvatarDisplayName('totally-unknown-id') === 'totally-unknown-id',
            '19. getAvatarDisplayName(): a completely unknown avatarId falls back to the id itself — never throws, never blank');

        session.dispose();
        presenceProvider.dispose();
        profileProvider.dispose();
    }

    // -------------------------------------------------------------
    // Section D — WorldNavigationSession.targetAvatar()
    // -------------------------------------------------------------
    {
        const { avatarProfileUseCase, avatarPresenceSession } = buildAvatarStack(registry, 'session-d1', { x: 0, y: 0, z: 0 });
        const session = new WorldNavigationSession({ registry: brickRegistry, loadPublicationDocumentUseCase: null, worldLayoutProvider: null, avatarProfileUseCase, avatarPresenceSession });
        session._session = spyFacade();
        session._setupLocalAvatar();

        const localId = avatarPresenceSession.current.avatarId;
        const result = session.targetAvatar(localId);
        assert(result !== null && result.avatarId === localId, '20. targetAvatar(): the local avatar\'s own id is a valid target');
        assert(session.getAvatarInfo().isLocal === true, '21. targetAvatar(): getAvatarInfo() reflects it immediately, exactly like a real pick()');
    }
    {
        const session = new WorldNavigationSession({ registry: brickRegistry, loadPublicationDocumentUseCase: null, worldLayoutProvider: null });
        session._session = spyFacade();
        const result = session.targetAvatar('nobody-knows-this-id');
        assert(result === null, '22. targetAvatar(): an unknown avatarId is rejected, returns null');
        assert(session.getAvatarInfo() === null, '23. targetAvatar(): ...and never becomes the interaction target');
    }
    {
        // targetAvatar() clears any existing brick/document selection —
        // the same mutual-exclusivity pick()'s avatar branch already
        // enforces (docs/Principles.md, "Avatars Are Never Document
        // Selection").
        const { avatarProfileUseCase, avatarPresenceSession } = buildAvatarStack(registry, 'session-d3', { x: 0, y: 0, z: 0 });
        const session = new WorldNavigationSession({ registry: brickRegistry, loadPublicationDocumentUseCase: null, worldLayoutProvider: null, avatarProfileUseCase, avatarPresenceSession });
        session._session = spyFacade();
        session._setupLocalAvatar();
        session._spatialSelection = SpatialSelectionState.ground({ x: 1, y: 0, z: 1 });
        assert(session.getSpatialSelection().isEmpty === false, '24. targetAvatar(): sanity — a selection genuinely exists beforehand');

        session.targetAvatar(avatarPresenceSession.current.avatarId);
        assert(session.getSpatialSelection().isEmpty === true, '25. targetAvatar(): targeting an avatar clears any existing document/ground selection');
    }

    // -------------------------------------------------------------
    // Section E — FLAGSHIP: the design doc's own scripted scenario.
    //
    //   Alice and Bob, real presence + profile sync over real
    //   BroadcastChannels -> Bob's Nearby Avatars list shows Alice
    //   with her real distance, her real synced displayName, and
    //   PRESENT status -> Alice walks far away -> she drops off the
    //   list -> Alice's presence goes STALE (real elapsed time) ->
    //   still listed, now visibly STALE -> Alice's presence goes
    //   ABSENT -> disappears entirely, pruned upstream, never a
    //   special case here -> Bob clicks Alice from the Nearby list ->
    //   targetAvatar() -> getAvatarInfo() -> Follow, all reusing
    //   EXISTING mechanisms -> throughout, nothing ever mutates
    //   Alice's own AvatarPresence or AvatarProfile — there is no API
    //   that could.
    // -------------------------------------------------------------
    {
        const presenceChannel = 'forkbuild-test-flagship-0-2-43-presence';
        const profileChannel = 'forkbuild-test-flagship-0-2-43-profile';

        const { avatarProfileUseCase: aliceProfileUseCase, avatarPresenceSession: alicePresenceSession } = buildAvatarStack(registry, 'alice-flagship', { x: 0, y: 0, z: 0 });
        aliceProfileUseCase.updateProfile({ displayName: 'Alice' });
        const alicePresenceProvider = new LocalAvatarPresenceBroadcastProvider(presenceChannel);
        const aliceProfileProvider = new LocalAvatarPresenceBroadcastProvider(profileChannel);
        const aliceSession = new WorldNavigationSession({
            registry: brickRegistry, loadPublicationDocumentUseCase: null, worldLayoutProvider: null,
            avatarProfileUseCase: aliceProfileUseCase, avatarPresenceSession: alicePresenceSession,
            presenceBroadcastProvider: alicePresenceProvider, avatarTemplateRegistry: registry,
            avatarProfileBroadcastProvider: aliceProfileProvider
        });
        aliceSession._session = spyFacade();
        aliceSession._setupRemoteAvatars();
        aliceSession._setupLocalAvatar();

        const { avatarProfileUseCase: bobProfileUseCase, avatarPresenceSession: bobPresenceSession } = buildAvatarStack(registry, 'bob-flagship', { x: 0, y: 0, z: 0 });
        const bobPresenceProvider = new LocalAvatarPresenceBroadcastProvider(presenceChannel);
        const bobProfileProvider = new LocalAvatarPresenceBroadcastProvider(profileChannel);
        const bobSession = new WorldNavigationSession({
            registry: brickRegistry, loadPublicationDocumentUseCase: null, worldLayoutProvider: null,
            avatarProfileUseCase: bobProfileUseCase, avatarPresenceSession: bobPresenceSession,
            presenceBroadcastProvider: bobPresenceProvider, avatarTemplateRegistry: registry,
            avatarProfileBroadcastProvider: bobProfileProvider
        });
        bobSession._session = spyFacade();
        bobSession._setupRemoteAvatars();
        bobSession._setupLocalAvatar();

        const bobPull = () => {
            const now = Date.now();
            bobSession._avatarProfileSyncService.pull();
            const known = bobSession._presenceSyncService.pull(now);
            bobSession._remoteAvatarRegistry.sync(known, now);
            return known;
        };

        // Alice's profile bootstrap-publishes on her first real frame
        // tick; her presence moves to (4, 0, 0), well within Bob's
        // default proximity radius.
        aliceSession._session.calls.onAnimationFrameCallbacks[1](0.016);
        await wait(100);
        alicePresenceSession.update({ position: { x: 4, y: 0, z: 0 } });
        await wait(100);
        bobPull();

        const nearAfterFirst = bobSession.getNearbyAvatars();
        assert(nearAfterFirst.length === 1 && nearAfterFirst[0].avatarId === alicePresenceSession.current.avatarId,
            '26. FLAGSHIP: Bob\'s Nearby Avatars list shows exactly Alice');
        assert(Math.abs(nearAfterFirst[0].distance - 4) < 1e-6, '27. FLAGSHIP: ...at her real, current distance from Bob');
        assert(nearAfterFirst[0].lifecycleState === 'present', '28. FLAGSHIP: ...marked PRESENT — a fresh, trusted claim');
        assert(bobSession.getAvatarDisplayName(nearAfterFirst[0].avatarId) === 'Alice',
            '29. FLAGSHIP: her REAL synced displayName resolves — not her raw avatarId, not a placeholder');

        // Alice walks far outside Bob's default proximity radius —
        // she remains a perfectly valid, trusted, PRESENT remote
        // avatar (RemoteAvatarRegistry still knows her, still renders
        // her), she simply drops out of "who is NEAR me."
        alicePresenceSession.update({ position: { x: 500, y: 0, z: 0 } });
        await wait(50);
        bobPull();
        assert(bobSession.getNearbyAvatars().length === 0,
            '30. FLAGSHIP: far away, Alice drops off the Nearby list even though she is still a known, trusted remote avatar');
        assert(bobSession._remoteAvatarRegistry.has(alicePresenceSession.current.avatarId) === true,
            '31. FLAGSHIP: ...proving proximity and "known at all" are genuinely different questions');

        // Alice comes back into range, then goes quiet — real elapsed
        // time pushes her presence to STALE. Still a legitimate
        // interaction target (per the design doc: "STALE -> visible
        // but potentially unsuitable"), just visibly marked as such.
        alicePresenceSession.update({ position: { x: 2, y: 0, z: 0 } });
        await wait(50);
        bobPull();
        assert(bobSession.getNearbyAvatars()[0].lifecycleState === 'present', '32. FLAGSHIP: fresh again -> PRESENT');

        await wait(2700); // staleAfterMs = 2500 (application/LocalPresenceStore.js default)
        const staleList = bobSession.getNearbyAvatars();
        assert(staleList.length === 1 && staleList[0].lifecycleState === 'stale',
            '33. FLAGSHIP: real elapsed time with no new movement -> STALE, still listed');

        // ...and further elapsed time prunes her to ABSENT — gone
        // from the Nearby list entirely, with NO special-case code
        // anywhere in getNearbyAvatars()/computeNearbyAvatars() to
        // make that happen: LocalPresenceStore.list() already deletes
        // an ABSENT record before anything downstream ever sees it.
        await wait(4000); // absentAfterMs = 6000 total from her last real update
        assert(bobSession.getNearbyAvatars().length === 0,
            '34. FLAGSHIP: ABSENT -> pruned upstream -> never reachable as an interaction target, with zero special-casing here');

        // One more real movement so Bob has someone to target again.
        alicePresenceSession.update({ position: { x: 5, y: 0, z: 0 } });
        await wait(100);
        const finalNearby = bobPull() && bobSession.getNearbyAvatars();
        assert(finalNearby.length === 1, '35. FLAGSHIP: Alice reappears in the Nearby list the moment she moves again');

        // Bob clicks Alice from the Nearby Avatars list — targetAvatar()
        // reuses the exact same interaction/inspection machinery a
        // real viewport click already established (0.2.39).
        const aliceProfileSnapshotBefore = JSON.stringify(aliceProfileUseCase.getProfile().toJSON());
        const alicePresenceSnapshotBefore = JSON.stringify(alicePresenceSession.current.toJSON());

        const targeted = bobSession.targetAvatar(finalNearby[0].avatarId);
        assert(targeted !== null, '36. FLAGSHIP: Bob can target Alice from the Nearby list');
        const info = bobSession.getAvatarInfo();
        assert(info !== null && info.avatarId === alicePresenceSession.current.avatarId,
            '37. FLAGSHIP: getAvatarInfo() reflects the SAME target — one inspection surface, reached two ways');
        assert(bobSession.followAvatarId(finalNearby[0].avatarId) === true,
            '38. FLAGSHIP: Follow (already-established 0.2.39 mechanism) works on a Nearby-list-targeted avatar exactly as it would on a clicked one');

        // Throughout the entire scenario — proximity queries, display
        // name resolution, targeting, following — Alice's own
        // AvatarProfile and AvatarPresence, on HER OWN session, are
        // completely byte-identical to what they were before Bob ever
        // looked at her. Proximity/interaction never authorizes
        // mutation of another avatar — there is no code path here
        // that could have changed them even by accident.
        assert(JSON.stringify(aliceProfileUseCase.getProfile().toJSON()) === aliceProfileSnapshotBefore,
            '39. FLAGSHIP: Alice\'s own AvatarProfile is untouched by any of Bob\'s proximity/targeting/following');
        assert(JSON.stringify(alicePresenceSession.current.toJSON()) === alicePresenceSnapshotBefore,
            '40. FLAGSHIP: Alice\'s own AvatarPresence is likewise completely untouched');

        aliceSession.dispose();
        bobSession.dispose();
        alicePresenceProvider.dispose();
        aliceProfileProvider.dispose();
        bobPresenceProvider.dispose();
        bobProfileProvider.dispose();
    }

    console.log('✅ All Avatar-Avatar Proximity & Interaction Target tests passed.');
}

await runTests();
