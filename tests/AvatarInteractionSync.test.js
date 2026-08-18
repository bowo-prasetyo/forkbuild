import { AvatarInteractionKind } from '../core/AvatarInteractionKind.js';
import {
    toAvatarInteractionAdvertisement,
    isValidAvatarInteractionAdvertisement,
    getAvatarInteractionSigningDescriptor
} from '../core/AvatarInteractionAdvertisement.js';
import { resolveIncomingInteraction } from '../core/AvatarInteractionIngestion.js';
import { AvatarInteractionReplayWindow } from '../core/AvatarInteractionReplayWindow.js';
import { AvatarInteractionTrustPolicy } from '../core/AvatarInteractionTrustPolicy.js';
import { SignatureType, Signature } from '../core/Signature.js';
import { TrustStatus } from '../core/TrustObservation.js';
import { AvatarAnimationState } from '../core/AvatarAnimationState.js';
import { AvatarTemplateRegistry } from '../core/AvatarTemplateRegistry.js';
import { CoreAvatarTemplateLibrary } from '../core/library/CoreAvatarTemplateLibrary.js';
import { AvatarProfileUseCase } from '../application/AvatarProfileUseCase.js';
import { AvatarPresenceSession } from '../application/AvatarPresenceSession.js';
import { LocalAuthorizationVerifier } from '../identity/LocalAuthorizationVerifier.js';
import { LocalIdentityProvider } from '../identity/LocalIdentityProvider.js';
import { signAvatarInteractionAdvertisement } from '../application/AvatarInteractionSigning.js';
import { AvatarInteractionTrustBoundary } from '../application/AvatarInteractionTrustBoundary.js';
import { AvatarInteractionSyncService } from '../application/AvatarInteractionSyncService.js';
import { LocalAvatarPresenceBroadcastProvider } from '../presence/LocalAvatarPresenceBroadcastProvider.js';
import { WorldNavigationSession } from '../application/WorldNavigationSession.js';
import { AvatarInteractionState } from '../application/spatial-state/AvatarInteractionState.js';
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

// 0.2.45 — Ephemeral Avatar Interaction Synchronization.
//
//   Section A: core/AvatarInteractionAdvertisement.js — wire shape/validity/signing descriptor
//   Section B: core/AvatarInteractionIngestion.js — pure monotonic-sequence decision
//   Section C: core/AvatarInteractionReplayWindow.js — bounded id+sequence bookkeeping
//   Section D: core/AvatarInteractionTrustPolicy.js — the one real policy axis
//   Section E: identity/LocalAuthorizationVerifier.verifyAvatarInteractionAdvertisement — REAL Ed25519
//   Section F: application/AvatarInteractionSigning.js
//   Section G: application/AvatarInteractionTrustBoundary.js — the orchestrated gate
//   Section H: application/AvatarInteractionSyncService.js — publish/pull, events not state
//   Section I: WorldNavigationSession integration (publish on gesture, render on receipt)
//   Section J: FLAGSHIP — two real replicas, a real BroadcastChannel, and an attacker
//
// Central architectural claim under test throughout: an interaction is
// an EVENT, never STATE — it is never retained once rendered, it never
// touches AvatarPresence/AvatarProfile, and no amount of interaction
// traffic (legitimate or hostile) ever mutates a Document, Publication,
// WorldPlacement, or SpatialIndex. See docs/Principles.md, "Presence
// Describes An Avatar's Current State; Interaction Describes An Event
// That Happened (0.2.45)."

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

function makeAdvertisement(overrides = {}) {
    return {
        avatarId: 'avatar-1',
        ownerIdentity: 'alice',
        interactionId: 'int-1',
        kind: AvatarInteractionKind.WAVE,
        targetAvatarId: 'avatar-2',
        sequence: 1,
        timestamp: 1000,
        ...overrides
    };
}

function buildRealSigner(username) {
    const storage = new InMemoryStorageProvider();
    const provider = new LocalIdentityProvider(storage);
    provider.login(username);
    return provider;
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
        setLocalAvatar: [], updateLocalAvatarAppearance: [], updateLocalAvatarPresence: [], setLocalAvatarVisible: [], removeLocalAvatar: 0,
        setRemoteAvatar: [], updateRemoteAvatarPresence: [], removeRemoteAvatar: [], setRemoteAvatarsVisible: [],
        setRemoteAvatarGesture: [],
        onAnimationFrameCallbacks: []
    };
    let cameraState = { position: { x: 10, y: 10, z: 10 }, target: { x: 0, y: 0, z: 0 }, zoom: 1 };
    return {
        calls,
        setLocalAvatar: (template, appearance, presence) => calls.setLocalAvatar.push({ template, appearance, presence }),
        updateLocalAvatarAppearance: (template, appearance) => calls.updateLocalAvatarAppearance.push({ template, appearance }),
        updateLocalAvatarPresence: (presence) => calls.updateLocalAvatarPresence.push({ presence }),
        setLocalAvatarFacing() {}, setLocalAvatarGesture() {},
        setLocalAvatarVisible: (visible) => calls.setLocalAvatarVisible.push(visible),
        removeLocalAvatar: () => { calls.removeLocalAvatar++; },
        setRemoteAvatar: (avatarId, template, appearance, presenceLike) => calls.setRemoteAvatar.push({ avatarId, template, appearance, presenceLike }),
        updateRemoteAvatarPresence: (avatarId, presenceLike) => calls.updateRemoteAvatarPresence.push({ avatarId, presenceLike }),
        updateRemoteAvatarAppearance() {},
        setRemoteAvatarGesture: (avatarId, kind) => calls.setRemoteAvatarGesture.push({ avatarId, kind }),
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
        pickAvatar() { return null; },
        setControlsEnabled() {},
        dispose() {}
    };
}

// Mirrors the real onAnimationFrame pipeline _setupRemoteAvatars()
// wires, but driven by hand — the same "poke session internals
// directly" pattern tests/AvatarPresenceTrust.test.js's own bobPull()
// already uses, extended to also drain the interaction inbox.
function pumpSession(session, now = Date.now()) {
    const known = session._presenceSyncService.pull(now);
    session._remoteAvatarRegistry.sync(known, now);
    session._remoteAvatarRegistry.tick(now);
    if (session._avatarProfileSyncService) {
        session._avatarProfileSyncService.pull();
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
    // Section A — core/AvatarInteractionAdvertisement.js
    // -------------------------------------------------------------
    {
        const ad = toAvatarInteractionAdvertisement({
            avatarId: 'bob', ownerIdentity: 'bob-owner', kind: AvatarInteractionKind.WAVE,
            targetAvatarId: 'alice', sequence: 1, timestamp: 500
        });
        assert(ad.avatarId === 'bob' && ad.targetAvatarId === 'alice' && ad.kind === AvatarInteractionKind.WAVE, '1. toAvatarInteractionAdvertisement carries every given field through');
        assert(typeof ad.interactionId === 'string' && ad.interactionId.length > 0, '2. a fresh interactionId is always generated');
        const ad2 = toAvatarInteractionAdvertisement({ avatarId: 'bob', ownerIdentity: 'bob-owner', kind: AvatarInteractionKind.WAVE, targetAvatarId: 'alice', sequence: 2 });
        assert(ad.interactionId !== ad2.interactionId, '3. two separate calls never produce the same interactionId');
        assert(typeof ad2.timestamp === 'number' && ad2.timestamp > 0, '4. timestamp defaults to now() when omitted');
    }
    {
        assert(isValidAvatarInteractionAdvertisement(makeAdvertisement()) === true, '5. a well-formed advertisement is valid');
        assert(isValidAvatarInteractionAdvertisement(null) === false, '6. null is never valid');
        assert(isValidAvatarInteractionAdvertisement(makeAdvertisement({ avatarId: '' })) === false, '7. an empty avatarId is invalid');
        assert(isValidAvatarInteractionAdvertisement(makeAdvertisement({ interactionId: '' })) === false, '8. a missing interactionId is invalid');
        assert(isValidAvatarInteractionAdvertisement(makeAdvertisement({ kind: 'dance' })) === false, '9. an unrecognized kind is invalid');
        assert(isValidAvatarInteractionAdvertisement(makeAdvertisement({ kind: AvatarInteractionKind.NONE })) === false, '10. NONE is never a valid broadcast kind — the absence of an interaction is not an event');
        assert(isValidAvatarInteractionAdvertisement(makeAdvertisement({ targetAvatarId: '' })) === false, '11. a missing targetAvatarId is invalid');
        assert(isValidAvatarInteractionAdvertisement(makeAdvertisement({ sequence: 'one' })) === false, '12. a non-numeric sequence is invalid');
        assert(isValidAvatarInteractionAdvertisement(makeAdvertisement({ timestamp: undefined })) === false, '13. a missing timestamp is invalid');
    }
    {
        const ad = makeAdvertisement({ kind: AvatarInteractionKind.POINT });
        const descriptor = getAvatarInteractionSigningDescriptor(ad);
        assert(descriptor.type === SignatureType.AVATAR_INTERACTION, '14. the descriptor uses the AVATAR_INTERACTION signature type');
        assert(descriptor.id === ad.avatarId && descriptor.revision === ad.sequence, '15. id/revision are avatarId/sequence');
        assert(descriptor.payload.kind === AvatarInteractionKind.POINT && descriptor.payload.targetAvatarId === ad.targetAvatarId, '16. the payload carries kind/targetAvatarId');

        // Every field participates in the signature — tampering with
        // ANY of them changes the canonical signed bytes, the same
        // "never sign only a narrow subset" discipline
        // core/AvatarPresenceAdvertisement.js's own header establishes.
        const tamperedKind = getAvatarInteractionSigningDescriptor(makeAdvertisement({ kind: AvatarInteractionKind.GREET }));
        assert(Signature.canonicalBytes(descriptor) !== Signature.canonicalBytes(tamperedKind), '17. changing ONLY kind changes the canonical signed bytes');
        const tamperedTarget = getAvatarInteractionSigningDescriptor(makeAdvertisement({ targetAvatarId: 'someone-else' }));
        assert(Signature.canonicalBytes(descriptor) !== Signature.canonicalBytes(tamperedTarget), '18. changing ONLY targetAvatarId changes the canonical signed bytes');
        const tamperedId = getAvatarInteractionSigningDescriptor(makeAdvertisement({ interactionId: 'a-different-id' }));
        assert(Signature.canonicalBytes(descriptor) !== Signature.canonicalBytes(tamperedId), '19. changing ONLY interactionId changes the canonical signed bytes');
    }

    // -------------------------------------------------------------
    // Section B — core/AvatarInteractionIngestion.js
    // -------------------------------------------------------------
    {
        assert(resolveIncomingInteraction(null, makeAdvertisement({ sequence: 1 })).accepted === true, '20. first-seen (no highwater yet) is always accepted');
        assert(resolveIncomingInteraction(5, makeAdvertisement({ sequence: 6 })).accepted === true, '21. a genuinely newer sequence is accepted');
        assert(resolveIncomingInteraction(5, makeAdvertisement({ sequence: 5 })).accepted === false, '22. an equal sequence is rejected (stale-or-duplicate)');
        assert(resolveIncomingInteraction(5, makeAdvertisement({ sequence: 4 })).accepted === false, '23. an older sequence is rejected');
        assert(resolveIncomingInteraction(5, null).accepted === false, '24. a null advertisement is rejected, never throws');
        assert(resolveIncomingInteraction(5, makeAdvertisement({ sequence: 'x' })).accepted === false, '25. a non-numeric sequence is rejected');
    }

    // -------------------------------------------------------------
    // Section C — core/AvatarInteractionReplayWindow.js
    // -------------------------------------------------------------
    {
        const w = new AvatarInteractionReplayWindow();
        assert(w.hasAccepted('a1', 'i1') === false, '26. nothing accepted yet');
        assert(w.highestSequence('a1') === null, '27. no highwater sequence yet');
        w.recordAccepted('a1', 'i1', 1);
        assert(w.hasAccepted('a1', 'i1') === true, '28. a recorded interactionId is recognized');
        assert(w.hasAccepted('a1', 'i2') === false, '29. a DIFFERENT interactionId for the same avatarId is not confused with it');
        assert(w.hasAccepted('a2', 'i1') === false, '30. the same interactionId under a DIFFERENT avatarId is tracked independently');
        assert(w.highestSequence('a1') === 1, '31. highestSequence reflects the recorded sequence');
        w.recordAccepted('a1', 'i2', 3);
        assert(w.highestSequence('a1') === 3, '32. highestSequence advances forward');
        w.recordAccepted('a1', 'i3', 2);
        assert(w.highestSequence('a1') === 3, '33. highestSequence never moves BACKWARD even if a lower sequence is (separately) recorded');
    }
    {
        // Bounded eviction of the id set — the whole point of a
        // BOUNDED replay window instead of an unbounded one.
        const w = new AvatarInteractionReplayWindow(3);
        w.recordAccepted('a1', 'i1', 1);
        w.recordAccepted('a1', 'i2', 2);
        w.recordAccepted('a1', 'i3', 3);
        assert(w.hasAccepted('a1', 'i1') === true, '34. still within the window, i1 is remembered');
        w.recordAccepted('a1', 'i4', 4);
        assert(w.hasAccepted('a1', 'i1') === false, '35. once the window fills, the OLDEST interactionId is evicted');
        assert(w.hasAccepted('a1', 'i4') === true, '36. the newest interactionId is still remembered');
        assert(w.highestSequence('a1') === 4, '37. highestSequence itself is never evicted — it is a single number, not part of the bounded set');
        w.clear();
        assert(w.hasAccepted('a1', 'i4') === false && w.highestSequence('a1') === null, '38. clear() forgets everything, including highwater sequence');
    }

    // -------------------------------------------------------------
    // Section D — core/AvatarInteractionTrustPolicy.js
    // -------------------------------------------------------------
    {
        assert(AvatarInteractionTrustPolicy.permissive().requireSignedInteraction === false, '39. permissive() tolerates unsigned interactions');
        assert(AvatarInteractionTrustPolicy.hardened().requireSignedInteraction === true, '40. hardened() requires signed interactions');
        assert(new AvatarInteractionTrustPolicy().requireSignedInteraction === false, '41. the bare default constructor matches permissive()');
        assert(AvatarInteractionTrustPolicy.hardened().toJSON().requireSignedInteraction === true, '42. toJSON() reflects the configured policy');
    }

    // -------------------------------------------------------------
    // Section E — identity/LocalAuthorizationVerifier.verifyAvatarInteractionAdvertisement (REAL Ed25519)
    // -------------------------------------------------------------
    {
        const verifier = new LocalAuthorizationVerifier();
        const alice = buildRealSigner('alice-e');
        const ad = makeAdvertisement({ avatarId: 'ae1', ownerIdentity: 'alice-e' });
        const signed = signAvatarInteractionAdvertisement(ad, alice);

        assert(!!signed.signature, '43. signAvatarInteractionAdvertisement actually attaches a signature');
        let result = verifier.verifyAvatarInteractionAdvertisement(signed);
        assert(result.valid === true && result.signed === true, '44. a genuinely signed advertisement verifies');

        result = verifier.verifyAvatarInteractionAdvertisement(ad);
        assert(result.valid === true && result.signed === false && result.reason === 'unsigned interaction advertisement',
            '45. an unsigned advertisement is structurally fine — just unsigned, never treated as broken');

        const tampered = { ...signed, kind: AvatarInteractionKind.POINT };
        result = verifier.verifyAvatarInteractionAdvertisement(tampered);
        assert(result.valid === false && result.signed === true, '46. tampering with kind AFTER signing invalidates the signature');

        const malformedSig = { ...signed, signature: { garbage: true } };
        result = verifier.verifyAvatarInteractionAdvertisement(malformedSig);
        assert(result.valid === false && result.reason === 'malformed signature', '47. a structurally broken signature object is reported, never crashes');

        assert(verifier.verifyAvatarInteractionAdvertisement(null).valid === false, '48. null is never valid');
    }

    // -------------------------------------------------------------
    // Section F — application/AvatarInteractionSigning.js
    // -------------------------------------------------------------
    {
        const ad = makeAdvertisement({ avatarId: 'af1' });
        assert(signAvatarInteractionAdvertisement(ad, null) === ad, '49. no identityProvider at all -> the SAME advertisement, unchanged');
        assert(signAvatarInteractionAdvertisement(ad, {}) === ad, '50. an identityProvider missing signCanonical/getSigningIdentity -> unchanged');

        const notLoggedIn = new LocalIdentityProvider(new InMemoryStorageProvider());
        assert(signAvatarInteractionAdvertisement(ad, notLoggedIn) === ad, '51. an identityProvider with nobody logged in degrades to unsigned rather than throwing');

        const alice = buildRealSigner('alice-f');
        const signed = signAvatarInteractionAdvertisement(ad, alice);
        assert(signed !== ad, '52. a real identityProvider produces a NEW object');
        assert(ad.signature === undefined, '53. the ORIGINAL advertisement is never mutated');
        assert(signed.kind === ad.kind && signed.targetAvatarId === ad.targetAvatarId, '54. every other field is carried through unchanged');
    }

    // -------------------------------------------------------------
    // Section G — application/AvatarInteractionTrustBoundary.js
    // -------------------------------------------------------------
    {
        // G1 — permissive default: unsigned interactions work.
        const boundary = new AvatarInteractionTrustBoundary();
        let { accepted, observation } = boundary.evaluate(makeAdvertisement({ avatarId: 'g1', interactionId: 'g1-i1', sequence: 1 }));
        assert(accepted === true && observation.status === TrustStatus.VALID, '55. a first-seen unsigned claim is accepted under the permissive default');

        // G2 — REPLAY: the exact same interactionId again.
        ({ accepted, observation } = boundary.evaluate(makeAdvertisement({ avatarId: 'g1', interactionId: 'g1-i1', sequence: 1 })));
        assert(accepted === false && observation.status === TrustStatus.REPLAYED, '56. resending an already-accepted interactionId is REPLAYED');

        // G3 — STALE: an older/equal sequence under a NEW interactionId.
        ({ accepted, observation } = boundary.evaluate(makeAdvertisement({ avatarId: 'g1', interactionId: 'g1-i2', sequence: 1 })));
        assert(accepted === false && observation.status === TrustStatus.STALE, '57. a NEW interactionId at an already-used sequence is still rejected as STALE');

        // G4 — a genuinely newer sequence succeeds.
        ({ accepted, observation } = boundary.evaluate(makeAdvertisement({ avatarId: 'g1', interactionId: 'g1-i3', sequence: 2 })));
        assert(accepted === true && observation.status === TrustStatus.VALID, '58. a genuinely newer sequence, new interactionId, is accepted');

        // G5 — impersonation: a DIFFERENT ownerIdentity for a bound avatarId.
        ({ accepted, observation } = boundary.evaluate(makeAdvertisement({ avatarId: 'g1', ownerIdentity: 'mallory', interactionId: 'g1-i4', sequence: 3 })));
        assert(accepted === false && observation.status === TrustStatus.UNAUTHORIZED, '59. a claim under a DIFFERENT ownerIdentity for a bound avatarId is UNAUTHORIZED');
    }
    {
        // G6 — hardened policy rejects unsigned interactions outright.
        const boundary = new AvatarInteractionTrustBoundary({ policy: AvatarInteractionTrustPolicy.hardened() });
        const { accepted, observation } = boundary.evaluate(makeAdvertisement({ avatarId: 'g2', sequence: 1 }));
        assert(accepted === false && observation.status === TrustStatus.MISSING, '60. an unsigned claim is rejected outright under a hardened policy');
    }
    {
        // G7-G9 — real signatures: acceptance, cross-signer rejection, tamper detection.
        const boundary = new AvatarInteractionTrustBoundary();
        const alice = buildRealSigner('alice-g');
        const mallory = buildRealSigner('mallory-g');
        const ad = makeAdvertisement({ avatarId: 'g3', ownerIdentity: 'alice-g', interactionId: 'g3-i1', sequence: 1 });
        const aliceSigned = signAvatarInteractionAdvertisement(ad, alice);

        let { accepted, observation } = boundary.evaluate(aliceSigned);
        assert(accepted === true && observation.status === TrustStatus.VALID, '61. a genuinely signed first claim is accepted');

        const mallorySigned = signAvatarInteractionAdvertisement(
            makeAdvertisement({ avatarId: 'g3', ownerIdentity: 'alice-g', interactionId: 'g3-i2', sequence: 2 }),
            mallory
        );
        ({ accepted, observation } = boundary.evaluate(mallorySigned));
        assert(accepted === false && observation.status === TrustStatus.UNAUTHORIZED,
            "62. a DIFFERENT signer claiming Alice's avatarId (even with their own perfectly VALID signature) is UNAUTHORIZED");

        const tampered = { ...aliceSigned, interactionId: 'g3-i3', sequence: 2, kind: AvatarInteractionKind.POINT };
        ({ accepted, observation } = boundary.evaluate(tampered));
        assert(accepted === false && observation.status === TrustStatus.INVALID_SIGNATURE,
            '63. reusing a real signature over DIFFERENT content fails cryptographic verification, caught before authority is even consulted');
    }
    {
        // G10 — malformed input.
        const boundary = new AvatarInteractionTrustBoundary();
        const { accepted, observation } = boundary.evaluate({ avatarId: '', sequence: 1 });
        assert(accepted === false && observation.status === TrustStatus.UNAVAILABLE, '64. a structurally malformed advertisement is UNAVAILABLE, never crashes the boundary');
    }

    // -------------------------------------------------------------
    // Section H — application/AvatarInteractionSyncService.js
    // -------------------------------------------------------------
    {
        function fakeBroadcastProvider() {
            const listeners = new Set();
            const sent = [];
            return {
                sent,
                advertise: (ad) => { sent.push(ad); for (const l of listeners) l(ad); },
                onAdvertisement: (cb) => { listeners.add(cb); return () => listeners.delete(cb); },
                dispose() {}
            };
        }
        const provider = fakeBroadcastProvider();
        const service = new AvatarInteractionSyncService(provider, { localAvatarId: 'me' });

        service.publish(makeAdvertisement({ avatarId: 'other', interactionId: 'h-i1', sequence: 1 }));
        assert(provider.sent.length === 1, '65. publish() hands the advertisement straight to the broadcast provider');

        let accepted = service.pull();
        assert(accepted.length === 1 && accepted[0].interactionId === 'h-i1', '66. pull() returns the newly-accepted event');

        accepted = service.pull();
        assert(accepted.length === 0, '67. a second pull() with nothing new returns an empty array — events are never retained');

        // Its OWN avatarId is never treated as a remote event, exactly
        // PresenceSyncService.pull()'s own defense-in-depth check.
        service.publish(makeAdvertisement({ avatarId: 'me', interactionId: 'h-i2', sequence: 1 }));
        accepted = service.pull();
        assert(accepted.length === 0, '68. an event carrying this service\'s OWN localAvatarId is never surfaced as incoming');

        // A rejected (replayed) event is silently dropped from pull()'s
        // return value, never surfaced as a "known but invalid" entry —
        // unlike LocalPresenceStore, there is no diagnostics surface
        // here at all (see this file's own header).
        service.publish(makeAdvertisement({ avatarId: 'other', interactionId: 'h-i1', sequence: 1 }));
        accepted = service.pull();
        assert(accepted.length === 0, '69. a replayed event (same interactionId already accepted) is dropped, not returned');

        service.dispose();
    }

    // -------------------------------------------------------------
    // Section I — WorldNavigationSession integration
    // -------------------------------------------------------------
    {
        // I1 — performAvatarInteraction() still returns exactly what
        // 0.2.44 already established, with NO interaction sync service
        // wired at all — publishing is purely additive.
        const { avatarProfileUseCase, avatarPresenceSession } = buildAvatarStack('session-i1', registry);
        const session = new WorldNavigationSession({
            registry: new CreateBrickRegistryUseCase().execute(), loadPublicationDocumentUseCase: null, worldLayoutProvider: null,
            avatarProfileUseCase, avatarPresenceSession
        });
        session._session = spyRenderFacade();
        session._setupLocalAvatar();
        session._setAvatarInteraction(AvatarInteractionState.avatar('bob'));
        assert(session.performAvatarInteraction(AvatarInteractionKind.WAVE) === true, '70. a gesture still succeeds locally with no interaction sync service wired at all');
        session.dispose();
    }
    {
        // I2 — WITH a sync service wired: performing a gesture actually
        // publishes a signed advertisement.
        const { identityProvider: alice, avatarProfileUseCase, avatarPresenceSession } = buildAvatarStack('session-i2', registry);
        function fakeBroadcastProvider() {
            const listeners = new Set();
            const sent = [];
            return { sent, advertise: (ad) => sent.push(ad), onAdvertisement: (cb) => { listeners.add(cb); return () => listeners.delete(cb); }, dispose() {} };
        }
        const presenceProvider = fakeBroadcastProvider();
        const interactionProvider = fakeBroadcastProvider();
        const session = new WorldNavigationSession({
            registry: new CreateBrickRegistryUseCase().execute(), loadPublicationDocumentUseCase: null, worldLayoutProvider: null,
            identityProvider: alice, avatarProfileUseCase, avatarPresenceSession,
            presenceBroadcastProvider: presenceProvider, avatarTemplateRegistry: registry,
            avatarInteractionBroadcastProvider: interactionProvider
        });
        session._session = spyRenderFacade();
        session._setupRemoteAvatars();
        session._setupLocalAvatar();
        session._remoteAvatarRegistry = { has: () => true, currentPosition: () => ({ x: 5, y: 0, z: 0 }), dispose() {} };
        session.targetAvatar('bob-remote');

        assert(session.performAvatarInteraction(AvatarInteractionKind.GREET) === true, '71. the gesture succeeds locally as before');
        assert(interactionProvider.sent.length === 1, '72. it ALSO publishes a signed interaction advertisement');
        const sentAd = interactionProvider.sent[0];
        assert(sentAd.kind === AvatarInteractionKind.GREET && sentAd.targetAvatarId === 'bob-remote', '73. the published advertisement carries the right kind/target');
        assert(sentAd.avatarId === avatarPresenceSession.current.avatarId, '74. it is published under the LOCAL avatar\'s own avatarId');
        assert(!!sentAd.signature, '75. the advertisement is signed, exactly as presence/profile already are for a logged-in identity');
        assert(presenceProvider.sent.length === 0, "76. NOTHING was published on the presence channel — a gesture never touches AvatarPresence's own transport");

        // A second gesture immediately after is blocked by the SAME
        // local cooldown as before, and also never publishes again.
        assert(session.performAvatarInteraction(AvatarInteractionKind.WAVE) === false, '77. cooldown still blocks a second immediate gesture');
        assert(interactionProvider.sent.length === 1, '78. ...and a cooldown-blocked attempt never publishes anything');

        session.dispose();
    }
    {
        // I3 — receiving side: a trusted incoming interaction event
        // renders on the SENDER's remote avatar visual, and expires on
        // its own.
        const registry2 = buildRegistry();
        const { avatarProfileUseCase, avatarPresenceSession } = buildAvatarStack('session-i3', registry2);
        const session = new WorldNavigationSession({
            registry: new CreateBrickRegistryUseCase().execute(), loadPublicationDocumentUseCase: null, worldLayoutProvider: null,
            avatarProfileUseCase, avatarPresenceSession,
            presenceBroadcastProvider: { advertise() {}, onAdvertisement: () => () => {}, dispose() {} },
            avatarTemplateRegistry: registry2,
            avatarInteractionBroadcastProvider: { advertise() {}, onAdvertisement: () => () => {}, dispose() {} }
        });
        const facade = spyRenderFacade();
        session._session = facade;
        session._setupRemoteAvatars();
        session._remoteAvatarRegistry = { has: (id) => id === 'remote-bob', currentPosition: () => ({ x: 0, y: 0, z: 0 }), dispose() {} };

        const now = Date.now();
        session._applyRemoteAvatarInteraction({ avatarId: 'remote-bob', kind: AvatarInteractionKind.WAVE, targetAvatarId: 'someone' }, now);
        assert(facade.calls.setRemoteAvatarGesture.at(-1).avatarId === 'remote-bob' && facade.calls.setRemoteAvatarGesture.at(-1).kind === AvatarInteractionKind.WAVE,
            '79. a trusted incoming event is rendered on the SENDER\'s own remote avatar visual');

        // An event from an avatarId this replica doesn't currently
        // know as a remote avatar is silently ignored — never rendered
        // "blind."
        session._applyRemoteAvatarInteraction({ avatarId: 'unknown-avatar', kind: AvatarInteractionKind.POINT, targetAvatarId: 'someone' }, now);
        assert(facade.calls.setRemoteAvatarGesture.length === 1, '80. an event from an unrecognized avatarId is never rendered');

        // Expiry: before the gesture's duration elapses, nothing changes...
        session._expireRemoteAvatarGestures(now + 100);
        assert(facade.calls.setRemoteAvatarGesture.length === 1, '81. the gesture is not cleared before its own duration elapses');
        // ...but once it does, it's cleared back to null automatically.
        session._expireRemoteAvatarGestures(now + 5000);
        const last = facade.calls.setRemoteAvatarGesture.at(-1);
        assert(last.avatarId === 'remote-bob' && last.kind === null, '82. the gesture auto-expires back to null once its duration elapses, with no explicit "stop" message needed');

        session.dispose();
    }

    // -------------------------------------------------------------
    // Section J — FLAGSHIP: two real replicas, a real BroadcastChannel,
    // and an attacker.
    //
    //   Alice and Bob are present (real signed presence sync).
    //   Bob targets Alice -> Bob WAVEs -> Alice's replica renders it on
    //     Bob's own avatar visual.
    //   An attacker replays the captured packet, sends a stale
    //     sequence, tampers a captured packet, and impersonates Bob
    //     with a real-but-wrong signing identity — NONE of it renders.
    //   The gesture expires on its own.
    //   AvatarPresence/AvatarProfile of BOTH avatars are byte-identical
    //     throughout. No Document/Publication/WorldPlacement/
    //     SpatialIndex was ever created or touched.
    // -------------------------------------------------------------
    {
        const presenceChannel = 'forkbuild-test-flagship-0-2-45-presence';
        const interactionChannel = 'forkbuild-test-flagship-0-2-45-interaction';
        const registryJ = buildRegistry();

        const storage = new InMemoryStorageProvider();
        const alice = new LocalIdentityProvider(storage);
        alice.login('alice-j');
        const aliceAvatarProfileUseCase = new AvatarProfileUseCase(storage, alice, registryJ);
        aliceAvatarProfileUseCase.updateProfile({ templateId: 'humanoid-01', displayName: 'Alice' });
        const aliceProfile = aliceAvatarProfileUseCase.getProfile();
        const aliceProfileRevisionBefore = aliceProfile.revision;
        const aliceAvatarPresenceSession = new AvatarPresenceSession(aliceProfile, { position: { x: 0, y: 0, z: 0 } });
        const alicePresenceProvider = new LocalAvatarPresenceBroadcastProvider(presenceChannel);
        const aliceInteractionProvider = new LocalAvatarPresenceBroadcastProvider(interactionChannel);

        const bobStorage = new InMemoryStorageProvider();
        const bob = new LocalIdentityProvider(bobStorage);
        bob.login('bob-j');
        const bobAvatarProfileUseCase = new AvatarProfileUseCase(bobStorage, bob, registryJ);
        bobAvatarProfileUseCase.updateProfile({ templateId: 'humanoid-01', displayName: 'Bob' });
        const bobProfile = bobAvatarProfileUseCase.getProfile();
        const bobProfileRevisionBefore = bobProfile.revision;
        const bobAvatarPresenceSession = new AvatarPresenceSession(bobProfile, { position: { x: 10, y: 0, z: 0 } });
        const bobPresenceProvider = new LocalAvatarPresenceBroadcastProvider(presenceChannel);
        const bobInteractionProvider = new LocalAvatarPresenceBroadcastProvider(interactionChannel);

        // A minimal published world, to prove interaction traffic
        // never touches it.
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
        const building = new Building({ creator: 'alice-j' });
        building.addBrick(new Brick({ definitionId: 'core:cube' }));
        world.addBuilding(building);
        const document = new Document({ world, metadata: new DocumentMetadata({ title: 'Flagship Interaction Castle', author: 'alice-j', license: new License({ id: LicenseId.CC0_1_0 }) }) });
        const publication = publishDocumentUseCase.execute({ document });
        const placementBefore = placementRegistry.findByPublicationId(publication.id)[0];
        const placementJsonBefore = JSON.stringify(placementBefore.toJSON());
        const documentKeysBefore = storage.list().filter((k) => k.startsWith('document:')).length;

        const aliceSession = new WorldNavigationSession({
            registry: brickRegistry, loadPublicationDocumentUseCase, worldLayoutProvider: new LocalWorldLayoutProvider(spatialIndexProvider, discoveryProvider),
            identityProvider: alice, discoveryProvider, placementRegistry,
            avatarProfileUseCase: aliceAvatarProfileUseCase, avatarPresenceSession: aliceAvatarPresenceSession,
            presenceBroadcastProvider: alicePresenceProvider, avatarTemplateRegistry: registryJ,
            avatarInteractionBroadcastProvider: aliceInteractionProvider
        });
        const aliceFacade = spyRenderFacade();
        aliceSession._session = aliceFacade;
        aliceSession._setupRemoteAvatars();
        aliceSession._setupLocalAvatar();

        const bobSession = new WorldNavigationSession({
            registry: new CreateBrickRegistryUseCase().execute(), loadPublicationDocumentUseCase: null, worldLayoutProvider: null,
            identityProvider: bob,
            avatarProfileUseCase: bobAvatarProfileUseCase, avatarPresenceSession: bobAvatarPresenceSession,
            presenceBroadcastProvider: bobPresenceProvider, avatarTemplateRegistry: registryJ,
            avatarInteractionBroadcastProvider: bobInteractionProvider
        });
        const bobFacade = spyRenderFacade();
        bobSession._session = bobFacade;
        bobSession._setupRemoteAvatars();
        bobSession._setupLocalAvatar();

        // Nudge both avatars once so real presence actually publishes
        // (0.2.37's own "no movement, no sequence advancement, no
        // network traffic" rule — an untouched AvatarPresence never
        // gets onto the wire at all).
        aliceAvatarPresenceSession.update({ position: { x: 0, y: 0, z: 0.001 } });
        bobAvatarPresenceSession.update({ position: { x: 10, y: 0, z: 0.001 } });
        await wait(80);
        pumpSession(aliceSession);
        pumpSession(bobSession);
        assert(bobSession._remoteAvatarRegistry.has(aliceProfile.avatarId), '83. FLAGSHIP: Bob\'s replica knows Alice as a remote avatar');
        assert(aliceSession._remoteAvatarRegistry.has(bobProfile.avatarId), '84. FLAGSHIP: Alice\'s replica knows Bob as a remote avatar');

        // A raw wire recorder on the INTERACTION channel — what a
        // real attacker sniffing an unauthenticated broadcast
        // transport could capture. Created BEFORE Bob's genuine WAVE
        // fires, since a BroadcastChannel only delivers to handles
        // that already exist at post time — a listener attached AFTER
        // the fact would simply never see it.
        const capturedFromBob = [];
        const recorder = new LocalAvatarPresenceBroadcastProvider(interactionChannel);
        recorder.onAdvertisement((ad) => capturedFromBob.push(ad));
        const attackerProvider = new LocalAvatarPresenceBroadcastProvider(interactionChannel);

        // Bob targets Alice and waves at her.
        assert(bobSession.targetAvatar(aliceProfile.avatarId) !== null, '85. FLAGSHIP: Bob can target Alice, now that she is a known remote avatar');
        assert(bobSession.performAvatarInteraction(AvatarInteractionKind.WAVE) === true, '86. FLAGSHIP: Bob successfully WAVEs at Alice');

        await wait(80);
        pumpSession(aliceSession);
        pumpSession(bobSession);
        const firstGestureCall = aliceFacade.calls.setRemoteAvatarGesture.at(-1);
        assert(firstGestureCall && firstGestureCall.avatarId === bobProfile.avatarId && firstGestureCall.kind === AvatarInteractionKind.WAVE,
            "87. FLAGSHIP: Alice's replica renders Bob's WAVE on Bob's OWN avatar visual");
        assert(bobFacade.calls.setRemoteAvatarGesture.length === 0, "88. FLAGSHIP: Bob's OWN replica never renders his own gesture as a remote one (never hears his own broadcast)");

        // Wire separation: nothing on the PRESENCE channel ever carried
        // interaction fields, and vice versa — captured on a second
        // recorder for completeness.
        assert(capturedFromBob.length >= 1, '89. FLAGSHIP: the recorder captured a genuine copy of what Bob actually sent');
        const genuineWave = capturedFromBob[capturedFromBob.length - 1];
        assert(genuineWave.kind === AvatarInteractionKind.WAVE && genuineWave.targetAvatarId === aliceProfile.avatarId, '90. FLAGSHIP: the captured packet is exactly the WAVE Bob performed');
        assert(!('kind' in bobAvatarPresenceSession.current) && !('interactionId' in bobAvatarPresenceSession.current),
            "91. FLAGSHIP: Bob's own AvatarPresence never gained an interaction-shaped field");

        const gestureCallsBeforeAttacks = aliceFacade.calls.setRemoteAvatarGesture.length;

        // ATTACK 1 — replay the captured packet verbatim.
        attackerProvider.advertise(genuineWave);
        await wait(80);
        pumpSession(aliceSession);
        assert(aliceFacade.calls.setRemoteAvatarGesture.length === gestureCallsBeforeAttacks, '92. FLAGSHIP: a byte-for-byte replay of the genuine packet never renders again');

        // ATTACK 2 — a stale sequence (Bob's spawn-equivalent, sequence
        // 0, never itself accepted) signed for real.
        const staleClaim = signAvatarInteractionAdvertisement(
            toAvatarInteractionAdvertisement({ avatarId: bobProfile.avatarId, ownerIdentity: 'bob-j', kind: AvatarInteractionKind.POINT, targetAvatarId: aliceProfile.avatarId, sequence: 0 }),
            bob
        );
        attackerProvider.advertise(staleClaim);
        await wait(80);
        pumpSession(aliceSession);
        assert(aliceFacade.calls.setRemoteAvatarGesture.length === gestureCallsBeforeAttacks, '93. FLAGSHIP: a stale (already-superseded) sequence never renders, even genuinely signed');

        // ATTACK 3 — tamper with the captured packet's kind while
        // keeping its (now mismatched) signature.
        const tamperedPacket = { ...genuineWave, kind: AvatarInteractionKind.GREET };
        attackerProvider.advertise(tamperedPacket);
        await wait(80);
        pumpSession(aliceSession);
        assert(aliceFacade.calls.setRemoteAvatarGesture.length === gestureCallsBeforeAttacks, '94. FLAGSHIP: a tampered packet with an invalid signature never renders');

        // ATTACK 4 — impersonation: a genuinely different real signer
        // claiming to BE Bob, at a brand-new sequence.
        const mallory = buildRealSigner('mallory-flagship-int');
        const impersonation = signAvatarInteractionAdvertisement(
            toAvatarInteractionAdvertisement({ avatarId: bobProfile.avatarId, ownerIdentity: 'bob-j', kind: AvatarInteractionKind.POINT, targetAvatarId: aliceProfile.avatarId, sequence: genuineWave.sequence + 1 }),
            mallory
        );
        attackerProvider.advertise(impersonation);
        await wait(80);
        pumpSession(aliceSession);
        assert(aliceFacade.calls.setRemoteAvatarGesture.length === gestureCallsBeforeAttacks, "95. FLAGSHIP: impersonation with a DIFFERENT real signing identity never renders as Bob");

        // Bob genuinely gestures again — everything still works
        // normally after all four attacks.
        await wait(1600); // let the cooldown clear
        assert(bobSession.performAvatarInteraction(AvatarInteractionKind.POINT) === true, '96. FLAGSHIP: Bob can gesture again normally after the attacks');
        await wait(80);
        pumpSession(aliceSession);
        const recovered = aliceFacade.calls.setRemoteAvatarGesture.at(-1);
        assert(recovered.avatarId === bobProfile.avatarId && recovered.kind === AvatarInteractionKind.POINT,
            '97. FLAGSHIP: a genuine subsequent gesture renders normally, unaffected by any of the attacks');

        // The gesture expires on its own.
        const farFuture = Date.now() + 5000;
        aliceSession._expireRemoteAvatarGestures(farFuture);
        const cleared = aliceFacade.calls.setRemoteAvatarGesture.at(-1);
        assert(cleared.avatarId === bobProfile.avatarId && cleared.kind === null, '98. FLAGSHIP: the gesture auto-expires back to null, with no message from Bob required');

        // AvatarPresence/AvatarProfile of BOTH avatars are exactly what
        // they were before ANY interaction traffic — position/
        // revision untouched by any amount of gesturing.
        assert(aliceAvatarPresenceSession.current.position.x === 0 && aliceAvatarPresenceSession.current.position.z === 0.001,
            "99. FLAGSHIP: Alice's own AvatarPresence position is untouched by receiving/rendering Bob's gestures");
        assert(bobAvatarPresenceSession.current.position.x === 10, "100. FLAGSHIP: Bob's own AvatarPresence position is untouched by performing his own gestures");
        assert(aliceAvatarProfileUseCase.getProfile().revision === aliceProfileRevisionBefore && bobAvatarProfileUseCase.getProfile().revision === bobProfileRevisionBefore,
            "101. FLAGSHIP: neither avatar's AvatarProfile revision advanced due to any interaction traffic");

        // Document/Publication/WorldPlacement/SpatialIndex are
        // byte-identical throughout.
        const placementAfter = placementRegistry.findByPublicationId(publication.id)[0];
        assert(JSON.stringify(placementAfter.toJSON()) === placementJsonBefore, '102. FLAGSHIP: WorldPlacement/PlacementRecord is byte-identical after the entire interaction/attack scenario');
        const documentKeysAfter = storage.list().filter((k) => k.startsWith('document:')).length;
        assert(documentKeysAfter === documentKeysBefore, '103. FLAGSHIP: no document was ever created for any interaction or attack traffic');
        assert(document.metadata.title === 'Flagship Interaction Castle', '104. FLAGSHIP: DocumentMetadata is untouched');

        aliceSession.dispose();
        bobSession.dispose();
        alicePresenceProvider.dispose();
        bobPresenceProvider.dispose();
        aliceInteractionProvider.dispose();
        bobInteractionProvider.dispose();
        recorder.dispose();
        attackerProvider.dispose();
    }

    console.log('✅ All Avatar Interaction Synchronization tests passed.');
}

await runTests();
