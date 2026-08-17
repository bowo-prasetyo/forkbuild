import { AvatarProfile } from '../core/AvatarProfile.js';
import { toAvatarProfileAdvertisement, isValidAvatarProfileAdvertisement, getAvatarProfileSigningDescriptor } from '../core/AvatarProfileAdvertisement.js';
import { resolveIncomingProfile } from '../core/AvatarProfileIngestion.js';
import { detectAvatarProfileEquivocation } from '../core/AvatarProfileEquivocation.js';
import { Signature, SignatureType } from '../core/Signature.js';
import { TrustStatus } from '../core/TrustObservation.js';
import { LocalAuthorizationVerifier } from '../identity/LocalAuthorizationVerifier.js';
import { LocalIdentityProvider } from '../identity/LocalIdentityProvider.js';
import { signAvatarProfileAdvertisement } from '../application/AvatarProfileSigning.js';
import { AvatarProfileTrustBoundary } from '../application/AvatarProfileTrustBoundary.js';
import { LocalAvatarProfileStore } from '../application/LocalAvatarProfileStore.js';
import { AvatarProfileSyncService } from '../application/AvatarProfileSyncService.js';
import { RemoteAvatarAppearanceRegistry } from '../application/RemoteAvatarAppearanceRegistry.js';
import { RemoteAvatarRegistry } from '../application/RemoteAvatarRegistry.js';
import { AvatarProfileUseCase } from '../application/AvatarProfileUseCase.js';
import { AvatarPresenceSession } from '../application/AvatarPresenceSession.js';
import { AvatarTemplateRegistry } from '../core/AvatarTemplateRegistry.js';
import { CoreAvatarTemplateLibrary } from '../core/library/CoreAvatarTemplateLibrary.js';
import { LocalAvatarPresenceBroadcastProvider } from '../presence/LocalAvatarPresenceBroadcastProvider.js';
import { WorldNavigationSession } from '../application/WorldNavigationSession.js';
import { CreateBrickRegistryUseCase } from '../application/CreateBrickRegistryUseCase.js';
import { StorageProvider } from '../storage/StorageProvider.js';

// 0.2.41 — Remote Avatar Appearance Synchronization.
//
//   Section A: core/AvatarProfile.js — revision field
//   Section B: core/AvatarProfileAdvertisement.js
//   Section C: core/AvatarProfileIngestion.js
//   Section D: core/AvatarProfileEquivocation.js
//   Section E: identity/LocalAuthorizationVerifier.verifyAvatarProfileAdvertisement (REAL Ed25519)
//   Section F: application/AvatarProfileSigning.js
//   Section G: application/AvatarProfileTrustBoundary.js — the full decision table
//   Section H: application/LocalAvatarProfileStore.js — durable, never pruned by time
//   Section I: application/AvatarProfileSyncService.js
//   Section J: application/RemoteAvatarAppearanceRegistry.js
//   Section K: application/RemoteAvatarRegistry.js — appearanceResolver integration
//   Section L: WorldNavigationSession — publish on edit + periodic republish, visibility reuse
//   Section M: FLAGSHIP — Bob renders Alice's REAL customized avatar over a real BroadcastChannel
//
// Central architectural claim under test throughout: "Presence says
// WHERE the avatar is; the avatar profile says WHAT the avatar looks
// like" — two independent lifecycles, two independent transports, one
// shared visibility gate, combined only at the very last step by the
// renderer. tests/AvatarPresenceTrust.test.js and
// tests/AvatarPresenceVisibility.test.js are left completely
// untouched and still pass unmodified.

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

function buildRealSigner(username) {
    const storage = new InMemoryStorageProvider();
    const provider = new LocalIdentityProvider(storage);
    provider.login(username);
    return provider;
}

function makeProfileAdvertisement(overrides = {}) {
    return {
        avatarId: 'avatar-1',
        ownerIdentity: 'alice',
        profileRevision: 1,
        templateId: 'humanoid-01',
        appearance: { skin: 'skin-03' },
        displayName: 'Alice',
        ...overrides
    };
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

async function runTests() {
    const registry = buildRegistry();

    // -------------------------------------------------------------
    // Section A — core/AvatarProfile.js: revision field
    // -------------------------------------------------------------
    {
        const profile = new AvatarProfile({ ownerIdentity: 'alice' });
        assert(profile.revision === 0, '1. a fresh profile starts at revision 0');
        const v1 = profile.withDisplayName('Alice');
        assert(v1.revision === 1, '2. withDisplayName() bumps the revision');
        const v2 = v1.withAppearance({ hair: 'hair-02' });
        assert(v2.revision === 2, '3. withAppearance() bumps it again');
        const v3 = v2.withTemplateId('humanoid-01');
        assert(v3.revision === 3, '4. withTemplateId() bumps it again');
        assert(profile.revision === 0, '5. the ORIGINAL instance is never mutated');
    }
    {
        const profile = new AvatarProfile({ ownerIdentity: 'alice', displayName: 'Alice' }).withDisplayName('Alicia');
        const restored = AvatarProfile.fromJSON(profile.toJSON());
        assert(restored.revision === profile.revision, '6. toJSON()/fromJSON() round-trips revision exactly');
        assert(AvatarProfile.fromJSON({ ownerIdentity: 'bob' }).revision === 0, '7. fromJSON() with no revision field degrades to 0, never throws');
    }

    // -------------------------------------------------------------
    // Section B — core/AvatarProfileAdvertisement.js
    // -------------------------------------------------------------
    {
        const profile = new AvatarProfile({ ownerIdentity: 'alice', templateId: 'humanoid-01', appearance: { skin: 'skin-03' }, displayName: 'Alice' }).withDisplayName('Alice W.');
        const ad = toAvatarProfileAdvertisement(profile);
        assert(ad.avatarId === profile.avatarId && ad.ownerIdentity === 'alice', '8. advertisement carries avatarId/ownerIdentity');
        assert(ad.profileRevision === profile.revision, '9. advertisement carries profileRevision, matching AvatarProfile.revision');
        assert(ad.templateId === 'humanoid-01' && ad.appearance.skin === 'skin-03', '10. advertisement carries templateId/appearance');
        assert(ad.displayName === 'Alice W.', '11. advertisement carries displayName');
        assert(!('createdAt' in ad) && !('updatedAt' in ad), '12. advertisement omits createdAt/updatedAt — never needed by a receiver');
    }
    {
        assert(isValidAvatarProfileAdvertisement(makeProfileAdvertisement()) === true, '13. a well-formed advertisement is valid');
        assert(isValidAvatarProfileAdvertisement(null) === false, '14. null is never valid');
        assert(isValidAvatarProfileAdvertisement({ ...makeProfileAdvertisement(), avatarId: '' }) === false, '15. an empty avatarId is never valid');
        assert(isValidAvatarProfileAdvertisement({ ...makeProfileAdvertisement(), templateId: '' }) === false, '16. an empty templateId is never valid');
        assert(isValidAvatarProfileAdvertisement({ ...makeProfileAdvertisement(), appearance: 'not-an-object' }) === false, '17. a non-object appearance is never valid');
        assert(isValidAvatarProfileAdvertisement({ ...makeProfileAdvertisement(), profileRevision: 'nope' }) === false, '18. a non-numeric profileRevision is never valid');
    }
    {
        // Never sign only avatarId+profileRevision.
        const base = getAvatarProfileSigningDescriptor(makeProfileAdvertisement());
        const tamperedAppearance = getAvatarProfileSigningDescriptor(makeProfileAdvertisement({ appearance: { skin: 'skin-06' } }));
        assert(Signature.canonicalBytes(base) !== Signature.canonicalBytes(tamperedAppearance),
            '19. changing ONLY appearance changes the canonical signed bytes');
        const tamperedTemplate = getAvatarProfileSigningDescriptor(makeProfileAdvertisement({ templateId: 'humanoid-02' }));
        assert(Signature.canonicalBytes(base) !== Signature.canonicalBytes(tamperedTemplate),
            '20. changing ONLY templateId changes the canonical signed bytes too');
        assert(getAvatarProfileSigningDescriptor(makeProfileAdvertisement()).type === SignatureType.AVATAR_PROFILE,
            '21. the descriptor uses the AVATAR_PROFILE signature type');
    }

    // -------------------------------------------------------------
    // Section C — core/AvatarProfileIngestion.js
    // -------------------------------------------------------------
    {
        let current = null;
        const accept = (rev) => {
            const incoming = makeProfileAdvertisement({ profileRevision: rev });
            const decision = resolveIncomingProfile(current, incoming);
            if (decision.accepted) current = incoming;
            return decision.accepted;
        };
        assert(accept(1) === true, '22. revision 1 accepted (nothing stored yet)');
        assert(accept(3) === true, '23. revision 3 accepted (3 > 1)');
        assert(accept(2) === false, '24. revision 2 rejected (2 <= 3 already stored — reordered)');
        assert(accept(3) === false, '25. duplicate revision 3 rejected');
        assert(current.profileRevision === 3, '26. the stored revision is still 3');
    }
    {
        const decision = resolveIncomingProfile(null, { ...makeProfileAdvertisement(), profileRevision: 'nope' });
        assert(decision.accepted === false, '27. a non-numeric profileRevision is rejected outright');
    }

    // -------------------------------------------------------------
    // Section D — core/AvatarProfileEquivocation.js
    // -------------------------------------------------------------
    {
        assert(detectAvatarProfileEquivocation(null, makeProfileAdvertisement()) === null, '28. nothing stored yet is never an equivocation');
        assert(detectAvatarProfileEquivocation(makeProfileAdvertisement({ profileRevision: 1 }), makeProfileAdvertisement({ profileRevision: 2 })) === null,
            '29. different revisions are never an equivocation — that is AvatarProfileIngestion\'s job');
        assert(detectAvatarProfileEquivocation(makeProfileAdvertisement({ profileRevision: 5 }), makeProfileAdvertisement({ profileRevision: 5 })) === null,
            '30. identical content at an equal revision is a REPLAY, not an equivocation');
        const equivocation = detectAvatarProfileEquivocation(
            makeProfileAdvertisement({ profileRevision: 5, appearance: { skin: 'skin-01' } }),
            makeProfileAdvertisement({ profileRevision: 5, appearance: { skin: 'skin-06' } })
        );
        assert(equivocation !== null && equivocation.profileRevision === 5, '31. two different claims at the same revision ARE an equivocation');
        assert(equivocation.claims.length === 2, '32. both competing claims are retained as evidence');
    }

    // -------------------------------------------------------------
    // Section E — identity/LocalAuthorizationVerifier.verifyAvatarProfileAdvertisement (REAL Ed25519)
    // -------------------------------------------------------------
    {
        const verifier = new LocalAuthorizationVerifier();
        const alice = buildRealSigner('alice-e');
        const ad = makeProfileAdvertisement({ avatarId: 'ae1', ownerIdentity: 'alice-e' });
        const signed = signAvatarProfileAdvertisement(ad, alice);

        assert(!!signed.signature, '33. signAvatarProfileAdvertisement actually attaches a signature');
        let result = verifier.verifyAvatarProfileAdvertisement(signed);
        assert(result.valid === true && result.signed === true, '34. a genuinely signed advertisement verifies');

        result = verifier.verifyAvatarProfileAdvertisement(ad);
        assert(result.valid === true && result.signed === false, '35. an unsigned advertisement is structurally fine — just unsigned');

        const tampered = { ...signed, appearance: { skin: 'skin-06' } };
        result = verifier.verifyAvatarProfileAdvertisement(tampered);
        assert(result.valid === false && result.signed === true, '36. tampering with appearance AFTER signing invalidates the signature');

        assert(verifier.verifyAvatarProfileAdvertisement(null).valid === false, '37. null is never valid');
        assert(verifier.verifyAvatarProfileAdvertisement({ ...signed, signature: { garbage: true } }).reason === 'malformed signature',
            '38. a structurally broken signature object is reported, never crashes');
    }

    // -------------------------------------------------------------
    // Section F — application/AvatarProfileSigning.js
    // -------------------------------------------------------------
    {
        const ad = makeProfileAdvertisement({ avatarId: 'af1' });
        assert(signAvatarProfileAdvertisement(ad, null) === ad, '39. no identityProvider -> the SAME advertisement, unchanged');
        const alice = buildRealSigner('alice-f');
        const signed = signAvatarProfileAdvertisement(ad, alice);
        assert(signed !== ad && ad.signature === undefined, '40. a real identityProvider produces a NEW object; the original is never mutated');
    }

    // -------------------------------------------------------------
    // Section G — application/AvatarProfileTrustBoundary.js
    // -------------------------------------------------------------
    {
        const boundary = new AvatarProfileTrustBoundary();
        let { accepted, observation } = boundary.evaluate(makeProfileAdvertisement({ avatarId: 'g1', profileRevision: 1 }), null);
        assert(accepted === true && observation.status === TrustStatus.VALID, '41. a first-seen unsigned claim is accepted (no policy knob — unsigned always tolerated)');

        ({ accepted, observation } = boundary.evaluate(
            makeProfileAdvertisement({ avatarId: 'g1', profileRevision: 1 }),
            makeProfileAdvertisement({ avatarId: 'g1', profileRevision: 1 })
        ));
        assert(accepted === false && observation.status === TrustStatus.REPLAYED, '42. resending an already-accepted claim is REPLAYED');

        ({ accepted, observation } = boundary.evaluate(
            makeProfileAdvertisement({ avatarId: 'g1', profileRevision: 0 }),
            makeProfileAdvertisement({ avatarId: 'g1', profileRevision: 1 })
        ));
        assert(accepted === false && observation.status === TrustStatus.STALE, '43. an older revision is STALE');

        ({ accepted, observation } = boundary.evaluate(
            makeProfileAdvertisement({ avatarId: 'g1', profileRevision: 1, appearance: { skin: 'skin-06' } }),
            makeProfileAdvertisement({ avatarId: 'g1', profileRevision: 1 })
        ));
        assert(accepted === false && observation.status === TrustStatus.EQUIVOCATING, '44. a same-revision, different-content claim from the SAME bound identity is EQUIVOCATING');

        ({ accepted, observation } = boundary.evaluate(
            makeProfileAdvertisement({ avatarId: 'g1', profileRevision: 1, ownerIdentity: 'mallory', appearance: { skin: 'skin-06' } }),
            makeProfileAdvertisement({ avatarId: 'g1', profileRevision: 1 })
        ));
        assert(accepted === false && observation.status === TrustStatus.UNAUTHORIZED, '45. a DIFFERENT ownerIdentity for a bound avatarId is UNAUTHORIZED, not merely a conflict');
    }
    {
        // Real signers: cross-signer rejection and tamper detection.
        const boundary = new AvatarProfileTrustBoundary();
        const alice = buildRealSigner('alice-g2');
        const mallory = buildRealSigner('mallory-g2');
        const ad = makeProfileAdvertisement({ avatarId: 'g2', ownerIdentity: 'alice-g2', profileRevision: 1 });
        const aliceSigned = signAvatarProfileAdvertisement(ad, alice);

        let { accepted, observation } = boundary.evaluate(aliceSigned, null);
        assert(accepted === true && observation.status === TrustStatus.VALID, '46. a genuinely signed first claim is accepted');

        const mallorySigned = signAvatarProfileAdvertisement(
            makeProfileAdvertisement({ avatarId: 'g2', ownerIdentity: 'alice-g2', profileRevision: 2, appearance: { skin: 'skin-06' } }),
            mallory
        );
        ({ accepted, observation } = boundary.evaluate(mallorySigned, aliceSigned));
        assert(accepted === false && observation.status === TrustStatus.UNAUTHORIZED,
            "47. a DIFFERENT signer claiming Alice's avatarId (even with their OWN valid signature) is UNAUTHORIZED");

        const tampered = { ...aliceSigned, profileRevision: 2, appearance: { skin: 'skin-09' } };
        ({ accepted, observation } = boundary.evaluate(tampered, aliceSigned));
        assert(accepted === false && observation.status === TrustStatus.INVALID_SIGNATURE,
            '48. reusing a real signature over DIFFERENT content fails cryptographic verification');
    }
    {
        const boundary = new AvatarProfileTrustBoundary();
        const { accepted, observation } = boundary.evaluate({ avatarId: '', templateId: 'x', appearance: {}, profileRevision: 1 }, null);
        assert(accepted === false && observation.status === TrustStatus.UNAVAILABLE, '49. a structurally malformed advertisement is UNAVAILABLE, never crashes');
    }

    // -------------------------------------------------------------
    // Section H — application/LocalAvatarProfileStore.js
    // -------------------------------------------------------------
    {
        const store = new LocalAvatarProfileStore();
        assert(store.ingest(makeProfileAdvertisement({ avatarId: 'h1', profileRevision: 1 })) === true, '50. a first-seen advertisement is ingested');
        assert(store.get('h1').profileRevision === 1, '51. the store holds it');
        assert(store.ingest(makeProfileAdvertisement({ avatarId: 'h1', profileRevision: 1 })) === false, '52. a duplicate revision is rejected');
        assert(store.getObservation('h1').status === TrustStatus.REPLAYED, '53. the rejected duplicate is still recorded as a trust observation');

        // Deliberately NO time-based pruning — a profile never
        // "expires" the way presence lifecycle does.
        assert(store.list().length === 1, '54. list() reports exactly the one known profile, with no concept of staleness/absence at all');

        store.remove('h1');
        assert(store.get('h1') === null, '55. remove() takes a profile out explicitly');
        store.ingest(makeProfileAdvertisement({ avatarId: 'h2' }));
        store.clear();
        assert(store.list().length === 0, '56. clear() empties the store');
    }

    // -------------------------------------------------------------
    // Section I — application/AvatarProfileSyncService.js
    // -------------------------------------------------------------
    {
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
        const service = new AvatarProfileSyncService(provider, { localAvatarId: 'me' });

        service.publish(makeProfileAdvertisement({ avatarId: 'me' }));
        assert(provider.sent.length === 1, '57. publish() hands the advertisement straight to the transport');

        provider.deliver(makeProfileAdvertisement({ avatarId: 'them' }));
        provider.deliver(makeProfileAdvertisement({ avatarId: 'me', profileRevision: 2 })); // our own -- must be ignored
        const known = service.pull();
        assert(known.length === 1 && known[0].advertisement.avatarId === 'them', '58. pull() ingests received advertisements but never treats the local avatarId as remote');
        assert(service.getKnownProfile('them').avatarId === 'them', '59. getKnownProfile() resolves a known avatarId directly');
        assert(service.getKnownProfile('nobody') === null, '60. getKnownProfile() for an unknown avatarId is null');

        service.dispose();
        assert(service.listKnownProfiles().length === 0, '61. dispose() clears everything the service knew');
    }

    // -------------------------------------------------------------
    // Section J — application/RemoteAvatarAppearanceRegistry.js
    // -------------------------------------------------------------
    {
        const facade = spyRenderFacade();
        function fakeSyncService(profile) {
            return { getKnownProfile: (id) => (id === 'bob' ? profile : null) };
        }
        const humanoid = registry.get('humanoid-01');

        // J1 — no known profile at all -> placeholder.
        let appearanceRegistry = new RemoteAvatarAppearanceRegistry(facade, fakeSyncService(null), registry, { defaultTemplate: humanoid, defaultAppearance: humanoid.defaultAppearance });
        let resolved = appearanceRegistry.resolve('bob');
        assert(resolved.isPlaceholder === true && resolved.template === humanoid, '62. no known profile resolves to the placeholder');

        // J2 — known profile, KNOWN template -> real appearance.
        const knownProfile = makeProfileAdvertisement({ avatarId: 'bob', templateId: 'humanoid-01', appearance: { skin: 'skin-05' }, profileRevision: 3 });
        appearanceRegistry = new RemoteAvatarAppearanceRegistry(facade, fakeSyncService(knownProfile), registry, { defaultTemplate: humanoid, defaultAppearance: humanoid.defaultAppearance });
        resolved = appearanceRegistry.resolve('bob');
        assert(resolved.isPlaceholder === false && resolved.template === humanoid, '63. a known profile with a KNOWN template resolves to the REAL template');
        assert(resolved.appearance.skin === 'skin-05', '64. ...and the real (validated/resolved) appearance');

        // J3 — known profile, UNKNOWN template -> graceful placeholder, never invented.
        const unknownTemplateProfile = makeProfileAdvertisement({ avatarId: 'bob', templateId: 'no-such-template', profileRevision: 4 });
        appearanceRegistry = new RemoteAvatarAppearanceRegistry(facade, fakeSyncService(unknownTemplateProfile), registry, { defaultTemplate: humanoid, defaultAppearance: humanoid.defaultAppearance });
        resolved = appearanceRegistry.resolve('bob');
        assert(resolved.isPlaceholder === true && resolved.template === humanoid,
            '65. an unknown templateId degrades gracefully to the placeholder, never invents an appearance');

        // J4 — resolveAndTrack() + sync() only pushes on a genuine revision change.
        appearanceRegistry = new RemoteAvatarAppearanceRegistry(facade, fakeSyncService(knownProfile), registry, { defaultTemplate: humanoid, defaultAppearance: humanoid.defaultAppearance });
        appearanceRegistry.resolveAndTrack('bob');
        appearanceRegistry.sync(['bob']);
        assert(facade.calls.updateRemoteAvatarAppearance.length === 0, '66. sync() does nothing when the profile hasn\'t changed since it was already applied');

        // J5 — forget()/clear().
        appearanceRegistry.forget('bob');
        appearanceRegistry.sync(['bob']);
        assert(facade.calls.updateRemoteAvatarAppearance.length === 1, '67. forgetting an avatarId makes the NEXT sync() re-apply its current appearance');
    }

    // -------------------------------------------------------------
    // Section K — application/RemoteAvatarRegistry.js: appearanceResolver integration
    // -------------------------------------------------------------
    {
        const facade = spyRenderFacade();
        const humanoid = registry.get('humanoid-01');
        const knownProfile = makeProfileAdvertisement({ avatarId: 'carol', templateId: 'humanoid-01', appearance: { skin: 'skin-02' }, profileRevision: 1 });
        const appearanceResolver = new RemoteAvatarAppearanceRegistry(
            facade, { getKnownProfile: (id) => (id === 'carol' ? knownProfile : null) }, registry,
            { defaultTemplate: humanoid, defaultAppearance: humanoid.defaultAppearance }
        );
        const remoteRegistry = new RemoteAvatarRegistry(facade, { defaultTemplate: humanoid, defaultAppearance: humanoid.defaultAppearance, appearanceResolver });

        remoteRegistry.sync([{ advertisement: { avatarId: 'carol', position: { x: 0, y: 0, z: 0 }, rotation: { x: 0, y: 0, z: 0 }, animation: 'idle', sequence: 1 } }], 1000);
        assert(facade.calls.setRemoteAvatar.length === 1, '68. a brand-new remote avatar still creates exactly one visual');
        assert(facade.calls.setRemoteAvatar[0].appearance.skin === 'skin-02',
            '69. ...and it is created with Carol\'s ALREADY-KNOWN real appearance, never the placeholder — a profile that arrived before presence is never wasted');

        assert(remoteRegistry.knownAvatarIds().join(',') === 'carol', '70. knownAvatarIds() reflects the currently-tracked presence-driven avatars');

        remoteRegistry.sync([], 5000);
        assert(facade.calls.removeRemoteAvatar.length === 1, '71. removing a vanished avatar still works exactly as before');
    }
    {
        // No appearanceResolver wired at all -> falls back to the fixed
        // placeholder, exactly 0.2.37's own behavior (full backward
        // compatibility).
        const facade = spyRenderFacade();
        const humanoid = registry.get('humanoid-01');
        const remoteRegistry = new RemoteAvatarRegistry(facade, { defaultTemplate: humanoid, defaultAppearance: humanoid.defaultAppearance });
        remoteRegistry.sync([{ advertisement: { avatarId: 'dave', position: { x: 0, y: 0, z: 0 }, rotation: { x: 0, y: 0, z: 0 }, animation: 'idle', sequence: 1 } }], 1000);
        assert(facade.calls.setRemoteAvatar[0].template === humanoid, '72. no appearanceResolver wired -> the fixed placeholder, unchanged from 0.2.37');
    }

    // -------------------------------------------------------------
    // Section L — WorldNavigationSession integration
    // -------------------------------------------------------------
    {
        const { avatarProfileUseCase, avatarPresenceSession } = buildAvatarStack('session-l1', registry);
        const presenceProvider = new LocalAvatarPresenceBroadcastProvider('forkbuild-test-l1-presence');
        function fakeProfileBroadcastProvider() {
            const sent = [];
            return { sent, advertise: (ad) => sent.push(ad), onAdvertisement: () => () => {}, dispose() {} };
        }
        const profileProvider = fakeProfileBroadcastProvider();
        const session = new WorldNavigationSession({
            registry: new CreateBrickRegistryUseCase().execute(), loadPublicationDocumentUseCase: null, worldLayoutProvider: null,
            avatarProfileUseCase, avatarPresenceSession,
            presenceBroadcastProvider: presenceProvider, avatarTemplateRegistry: registry,
            avatarProfileBroadcastProvider: profileProvider
        });
        session._session = spyRenderFacade();
        session._setupRemoteAvatars();
        session._setupLocalAvatar();

        // L1 — an explicit profile edit publishes immediately.
        avatarProfileUseCase.updateProfile({ displayName: 'Session L' });
        assert(profileProvider.sent.length === 1, '73. an explicit profile edit publishes a profile advertisement immediately');
        assert(profileProvider.sent[0].displayName === 'Session L', '74. ...carrying the new displayName');
        assert(profileProvider.sent[0].profileRevision === avatarProfileUseCase.getProfile().revision,
            '75. ...and the profileRevision matches the profile\'s own revision');

        // L2 — periodic republish: simulate "a long time has passed"
        // by rewinding the bookkeeping, then firing the SAME frame
        // callback movement already ticks — no real 15s wait needed.
        session._lastProfilePublishAt = 0;
        // callbacks[0] is _setupRemoteAvatars' own onAnimationFrame
        // subscription (registered first); the movement/periodic-
        // republish callback under test here is _setupLocalAvatar's,
        // registered second.
        const frameCallback = session._session.calls.onAnimationFrameCallbacks[1];
        frameCallback(0.016);
        assert(profileProvider.sent.length === 2, '76. the periodic republish tick publishes again once the interval has "elapsed"');

        // L3 — presence and profile publish completely independently.
        avatarPresenceSession.update({ position: { x: 1, y: 0, z: 0 } });
        assert(profileProvider.sent.length === 2, "77. moving the avatar never publishes a profile advertisement — the two transports stay independent");

        session.dispose();
        presenceProvider.dispose();
    }
    {
        // L4 — visibility gate reused: HIDDEN suppresses PROFILE
        // publishing too, exactly like presence.
        const { avatarProfileUseCase, avatarPresenceSession } = buildAvatarStack('session-l2', registry);
        const { PresenceVisibilityUseCase } = await import('../application/PresenceVisibilityUseCase.js');
        const { PresenceVisibility } = await import('../core/PresenceVisibility.js');
        const storage = new InMemoryStorageProvider();
        const identity = new LocalIdentityProvider(storage);
        identity.login('session-l2');
        const presenceVisibilityUseCase = new PresenceVisibilityUseCase(storage, identity);
        presenceVisibilityUseCase.updatePolicy({ visibility: PresenceVisibility.HIDDEN });

        function fakeProfileBroadcastProvider() {
            const sent = [];
            return { sent, advertise: (ad) => sent.push(ad), onAdvertisement: () => () => {}, dispose() {} };
        }
        const profileProvider = fakeProfileBroadcastProvider();
        const presenceProvider = new LocalAvatarPresenceBroadcastProvider('forkbuild-test-l2-presence');
        const session = new WorldNavigationSession({
            registry: new CreateBrickRegistryUseCase().execute(), loadPublicationDocumentUseCase: null, worldLayoutProvider: null,
            avatarProfileUseCase, avatarPresenceSession, presenceVisibilityUseCase,
            presenceBroadcastProvider: presenceProvider, avatarTemplateRegistry: registry,
            avatarProfileBroadcastProvider: profileProvider
        });
        session._session = spyRenderFacade();
        session._setupRemoteAvatars();
        session._setupLocalAvatar();

        avatarProfileUseCase.updateProfile({ displayName: 'Hidden Session' });
        assert(profileProvider.sent.length === 0, '78. HIDDEN suppresses profile publishing exactly like presence — one shared gate, never two privacy systems');

        session.dispose();
        presenceProvider.dispose();
    }

    // -------------------------------------------------------------
    // Section M — FLAGSHIP: Bob renders Alice's REAL customized
    // avatar over a real BroadcastChannel.
    //
    //   Alice customizes her avatar -> Bob (who has never touched
    //   Alice's profile before) eventually renders her REAL
    //   appearance, not the placeholder.
    //   A SECOND, unrelated avatar advertises a template Bob's
    //   replica has never heard of -> Bob degrades gracefully to the
    //   placeholder, never crashes, never invents an appearance.
    //   Alice's appearance OUTLIVES a presence blip (durability:
    //   appearance is not pruned the way presence lifecycle is).
    // -------------------------------------------------------------
    {
        const presenceChannel = 'forkbuild-test-flagship-0-2-41-presence';
        const profileChannel = 'forkbuild-test-flagship-0-2-41-profile';

        const { avatarProfileUseCase: aliceAvatarProfileUseCase, avatarPresenceSession: aliceAvatarPresenceSession, identityProvider: alice } = buildAvatarStack('alice-flagship', registry);
        aliceAvatarProfileUseCase.updateProfile({ templateId: 'humanoid-01', appearance: { skin: 'skin-06' }, displayName: 'Alice' });
        const aliceProfile = aliceAvatarProfileUseCase.getProfile();

        const alicePresenceProvider = new LocalAvatarPresenceBroadcastProvider(presenceChannel);
        const aliceProfileProvider = new LocalAvatarPresenceBroadcastProvider(profileChannel);
        const aliceSession = new WorldNavigationSession({
            registry: new CreateBrickRegistryUseCase().execute(), loadPublicationDocumentUseCase: null, worldLayoutProvider: null,
            identityProvider: alice, avatarProfileUseCase: aliceAvatarProfileUseCase, avatarPresenceSession: aliceAvatarPresenceSession,
            presenceBroadcastProvider: alicePresenceProvider, avatarTemplateRegistry: registry,
            avatarProfileBroadcastProvider: aliceProfileProvider
        });
        const aliceFacade = spyRenderFacade();
        aliceSession._session = aliceFacade;
        aliceSession._setupRemoteAvatars();
        aliceSession._setupLocalAvatar();

        const bobPresenceProvider = new LocalAvatarPresenceBroadcastProvider(presenceChannel);
        const bobProfileProvider = new LocalAvatarPresenceBroadcastProvider(profileChannel);
        const bobSession = new WorldNavigationSession({
            registry: new CreateBrickRegistryUseCase().execute(), loadPublicationDocumentUseCase: null, worldLayoutProvider: null,
            presenceBroadcastProvider: bobPresenceProvider, avatarTemplateRegistry: registry,
            avatarProfileBroadcastProvider: bobProfileProvider
        });
        const bobFacade = spyRenderFacade();
        bobSession._session = bobFacade;
        bobSession._setupRemoteAvatars();

        // Mirrors _setupRemoteAvatars()'s own per-frame callback
        // exactly, including its ORDER: profile pulled first, so a
        // profile that already arrived is on hand the moment presence
        // sync creates a brand-new avatar's very first visual.
        const bobPull = () => {
            const now = Date.now();
            bobSession._avatarProfileSyncService.pull();
            const known = bobSession._presenceSyncService.pull(now);
            bobSession._remoteAvatarRegistry.sync(known, now);
            bobSession._remoteAvatarRegistry.tick(now);
            bobSession._remoteAvatarAppearanceRegistry.sync(bobSession._remoteAvatarRegistry.knownAvatarIds());
            return known;
        };

        // Alice's profile edit happened BEFORE her session even
        // existed (the ordinary real-world case: customize in the
        // Avatar Creator, THEN enter World View), so no
        // onProfileChanged subscription ever saw it. What DOES catch
        // it is the periodic-republish bootstrap — "0 means never
        // published," so the very first real animation frame
        // publishes immediately (see PROFILE_REPUBLISH_INTERVAL_MS's
        // own comment). Fire that one frame here, exactly like a real
        // requestAnimationFrame loop would within milliseconds of
        // World View mounting — give both real channels time to
        // deliver, then Alice moves so Bob learns her avatarId exists
        // at all.
        aliceSession._session.calls.onAnimationFrameCallbacks[1](0.016);
        await wait(80);
        aliceAvatarPresenceSession.update({ position: { x: 4, y: 0, z: 4 } });
        await wait(80);
        bobPull();

        assert(bobFacade.calls.setRemoteAvatar.length === 1, "80. FLAGSHIP: Bob creates exactly one remote visual for Alice");
        assert(bobFacade.calls.setRemoteAvatar[0].appearance.skin === 'skin-06',
            "81. FLAGSHIP: Bob renders Alice's REAL customized appearance from the very first visual — her profile arrived independently of, and before being needed by, her presence");
        assert(bobSession._remoteAvatarAppearanceRegistry.resolve(aliceProfile.avatarId).isPlaceholder === false,
            '82. FLAGSHIP: Bob genuinely knows this is Alice\'s real appearance, not a fallback');

        // Alice edits her appearance again -> Bob's visual updates.
        aliceAvatarProfileUseCase.updateProfile({ appearance: { skin: 'skin-01' } });
        await wait(80);
        bobPull();
        const lastAppearanceUpdate = bobFacade.calls.updateRemoteAvatarAppearance.at(-1);
        assert(lastAppearanceUpdate && lastAppearanceUpdate.appearance.skin === 'skin-01',
            "83. FLAGSHIP: a later edit propagates to Bob's ALREADY-EXISTING visual via updateRemoteAvatarAppearance, never a second setRemoteAvatar");

        // A SECOND, unrelated avatar advertises a template Bob has
        // never heard of -> graceful degradation, never a crash.
        const strangerProfileAd = signAvatarProfileAdvertisement(
            makeProfileAdvertisement({ avatarId: 'stranger-avatar', ownerIdentity: 'stranger', templateId: 'a-template-nobody-has', profileRevision: 1 }),
            null
        );
        const strangerPresenceProvider = new LocalAvatarPresenceBroadcastProvider(presenceChannel);
        const strangerProfilePublisher = new LocalAvatarPresenceBroadcastProvider(profileChannel);
        strangerProfilePublisher.advertise(strangerProfileAd);
        strangerPresenceProvider.advertise({ avatarId: 'stranger-avatar', ownerIdentity: 'stranger', position: { x: -4, y: 0, z: -4 }, rotation: { x: 0, y: 0, z: 0 }, animation: 'idle', sequence: 1 });
        await wait(80);
        bobPull();
        const strangerVisual = bobFacade.calls.setRemoteAvatar.find((c) => c.avatarId === 'stranger-avatar');
        assert(strangerVisual && strangerVisual.template && strangerVisual.template.templateId === 'humanoid-01',
            '84. FLAGSHIP: an avatar advertising an UNKNOWN template renders with the generic placeholder — no crash, nothing invented');

        // Durability: Alice's appearance survives a presence blip —
        // fast-forward Bob's clock past ABSENT, prune her presence,
        // then bring her back. Her REAL appearance is still known and
        // applied immediately (no placeholder flash).
        const farFuture = Date.now() + 60000;
        const knownFarFuture = bobSession._presenceSyncService.pull(farFuture);
        bobSession._remoteAvatarRegistry.sync(knownFarFuture, farFuture);
        assert(bobSession._remoteAvatarRegistry.has(aliceProfile.avatarId) === false, '85. FLAGSHIP: Alice\'s PRESENCE has expired from Bob\'s store');
        assert(bobSession._avatarProfileSyncService.getKnownProfile(aliceProfile.avatarId) !== null,
            "86. FLAGSHIP: ...but Bob still remembers her PROFILE — appearance is durable, never pruned by presence lifecycle");

        aliceAvatarPresenceSession.update({ position: { x: 5, y: 0, z: 5 } });
        await wait(80);
        bobPull();
        const recreated = bobFacade.calls.setRemoteAvatar.filter((c) => c.avatarId === aliceProfile.avatarId).at(-1);
        assert(recreated && recreated.appearance.skin === 'skin-01',
            "87. FLAGSHIP: when Alice reappears, Bob immediately re-creates her visual with her REAL, already-known appearance — never a placeholder flash");

        // Throughout: AvatarPresence itself is untouched by any of
        // this, and nothing about appearance sync ever mutates it.
        assert(aliceAvatarPresenceSession.current.position.x === 5, '88. FLAGSHIP: AvatarPresence reflects only real movement, never appearance sync');

        aliceSession.dispose();
        bobSession.dispose();
        alicePresenceProvider.dispose();
        aliceProfileProvider.dispose();
        bobPresenceProvider.dispose();
        bobProfileProvider.dispose();
        strangerPresenceProvider.dispose();
        strangerProfilePublisher.dispose();
    }

    console.log('✅ All Remote Avatar Appearance Synchronization tests passed.');
}

await runTests();
