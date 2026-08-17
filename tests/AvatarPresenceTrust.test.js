import { PresenceAuthorityRegistry } from '../core/PresenceAuthority.js';
import { PresenceEquivocation, detectPresenceEquivocation } from '../core/PresenceEquivocation.js';
import { PresenceReplayWindow } from '../core/PresenceReplayWindow.js';
import { PresenceTrustPolicy } from '../core/PresenceTrustPolicy.js';
import { summarizePresenceDiagnostics } from '../core/PresenceDiagnosticsSummary.js';
import { PresenceLifecycleState } from '../core/PresenceLifecycleState.js';
import { TrustStatus } from '../core/TrustObservation.js';
import { SignatureType, Signature } from '../core/Signature.js';
import { getAvatarPresenceSigningDescriptor } from '../core/AvatarPresenceAdvertisement.js';
import { AvatarAnimationState } from '../core/AvatarAnimationState.js';
import { AvatarTemplateRegistry } from '../core/AvatarTemplateRegistry.js';
import { CoreAvatarTemplateLibrary } from '../core/library/CoreAvatarTemplateLibrary.js';
import { AvatarProfileUseCase } from '../application/AvatarProfileUseCase.js';
import { AvatarPresenceSession } from '../application/AvatarPresenceSession.js';
import { LocalAuthorizationVerifier } from '../identity/LocalAuthorizationVerifier.js';
import { LocalIdentityProvider } from '../identity/LocalIdentityProvider.js';
import { signAvatarPresenceAdvertisement } from '../application/PresenceSigning.js';
import { PresenceTrustBoundary } from '../application/PresenceTrustBoundary.js';
import { LocalPresenceStore } from '../application/LocalPresenceStore.js';
import { LocalAvatarPresenceBroadcastProvider } from '../presence/LocalAvatarPresenceBroadcastProvider.js';
import { WorldNavigationSession } from '../application/WorldNavigationSession.js';
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

// 0.2.38 — Presence Trust, Replay & Conflict Handling.
//
//   Section A: core/PresenceAuthority.js — identity binding (TOFU)
//   Section B: core/PresenceEquivocation.js — equal-sequence conflict detection
//   Section C: core/PresenceReplayWindow.js — bounded replay memory
//   Section D: core/PresenceTrustPolicy.js — the one real policy axis
//   Section E: core/AvatarPresenceAdvertisement.js — signing descriptor
//   Section F: identity/LocalAuthorizationVerifier.verifyPresenceAdvertisement — REAL Ed25519
//   Section G: application/PresenceSigning.js
//   Section H: application/PresenceTrustBoundary.js — the orchestrated gate
//   Section I: application/LocalPresenceStore.js — trust surfaced through ingest()/list()
//   Section J: core/PresenceDiagnosticsSummary.js
//   Section K: WorldNavigationSession integration (signing, diagnostics)
//   Section L: FLAGSHIP — the design doc's own malicious scripted scenario
//
// This milestone deliberately does not redesign 0.2.37's transport —
// tests/AvatarPresenceSync.test.js is left untouched and still passes
// unmodified; every default here reproduces 0.2.37's own behavior
// (permissive policy, unsigned presence tolerated) unless a test
// explicitly opts into something stricter.

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
        position: { x: 0, y: 0, z: 0 },
        rotation: { x: 0, y: 0, z: 0 },
        animation: AvatarAnimationState.IDLE,
        sequence: 1,
        ...overrides
    };
}

// A REAL logged-in identity with a real Ed25519 keypair, ready to sign
// avatar-presence advertisements exactly the way WorldNavigationSession
// does in production.
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
        onAnimationFrameCallbacks: []
    };
    let cameraState = { position: { x: 10, y: 10, z: 10 }, target: { x: 0, y: 0, z: 0 }, zoom: 1 };
    return {
        calls,
        setLocalAvatar: (template, appearance, presence) => calls.setLocalAvatar.push({ template, appearance, presence }),
        updateLocalAvatarAppearance: (template, appearance) => calls.updateLocalAvatarAppearance.push({ template, appearance }),
        updateLocalAvatarPresence: (presence) => calls.updateLocalAvatarPresence.push({ presence }),
        setLocalAvatarVisible: (visible) => calls.setLocalAvatarVisible.push(visible),
        removeLocalAvatar: () => { calls.removeLocalAvatar++; },
        setRemoteAvatar: (avatarId, template, appearance, presenceLike) => calls.setRemoteAvatar.push({ avatarId, template, appearance, presenceLike }),
        updateRemoteAvatarPresence: (avatarId, presenceLike) => calls.updateRemoteAvatarPresence.push({ avatarId, presenceLike }),
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
        setControlsEnabled() {},
        dispose() {}
    };
}

async function runTests() {
    const registry = buildRegistry();

    // -------------------------------------------------------------
    // Section A — core/PresenceAuthority.js
    // -------------------------------------------------------------
    {
        const authority = new PresenceAuthorityRegistry();
        assert(authority.binding('a1') === null, '1. no binding exists before any claim is evaluated');

        let result = authority.evaluate('a1', { ownerIdentity: 'alice', signerId: 'did:key:zAlice' });
        assert(result.authorized === true && result.reason === 'first-seen', '2. the first claim for an avatarId is always authorized');

        result = authority.evaluate('a1', { ownerIdentity: 'alice', signerId: 'did:key:zAlice' });
        assert(result.authorized === true, '3. the SAME signer claiming the same avatarId again is authorized');

        result = authority.evaluate('a1', { ownerIdentity: 'alice', signerId: 'did:key:zMallory' });
        assert(result.authorized === false && /signer does not match/.test(result.reason),
            '4. a DIFFERENT signer claiming an already-signer-bound avatarId is rejected');

        result = authority.evaluate('a1', { ownerIdentity: 'alice', signerId: null });
        assert(result.authorized === false && /unsigned claim/.test(result.reason),
            '5. an unsigned claim for an avatarId that already has a bound signer is rejected');

        assert(authority.binding('a1').signerId === 'did:key:zAlice', '6. the binding still reflects the original signer after rejected attempts');
    }
    {
        const authority = new PresenceAuthorityRegistry();
        authority.evaluate('a2', { ownerIdentity: 'bob', signerId: null });
        let result = authority.evaluate('a2', { ownerIdentity: 'mallory', signerId: null });
        assert(result.authorized === false, "7. under permissive/unsigned binding, a DIFFERENT ownerIdentity string is rejected");

        result = authority.evaluate('a2', { ownerIdentity: 'bob', signerId: null });
        assert(result.authorized === true, '8. the SAME ownerIdentity string is authorized when nothing is signed');

        result = authority.evaluate('a2', { ownerIdentity: 'bob', signerId: 'did:key:zBob' });
        assert(result.authorized === true && result.reason === 'authority upgraded to a signed claim',
            '9. an unsigned binding upgrades gracefully the first time a real signer claims it');
        assert(authority.binding('a2').signerId === 'did:key:zBob', '10. the binding now reflects the upgraded signer');

        result = authority.evaluate('a2', { ownerIdentity: 'bob', signerId: null });
        assert(result.authorized === false, '11. once upgraded, an unsigned claim can no longer pass — it is never safe to accept LESS proof than already held');

        authority.clear();
        assert(authority.binding('a2') === null, '12. clear() forgets every binding');
    }

    // -------------------------------------------------------------
    // Section B — core/PresenceEquivocation.js
    // -------------------------------------------------------------
    {
        assert(detectPresenceEquivocation(null, makeAdvertisement()) === null, '13. nothing stored yet is never an equivocation');
        assert(detectPresenceEquivocation(makeAdvertisement({ avatarId: 'x' }), makeAdvertisement({ avatarId: 'y' })) === null,
            '14. different avatarIds are never compared against each other');
        assert(detectPresenceEquivocation(makeAdvertisement({ sequence: 1 }), makeAdvertisement({ sequence: 2 })) === null,
            '15. different sequences are never an equivocation — that is core/PresenceIngestion.js\'s job');
        assert(detectPresenceEquivocation(makeAdvertisement({ sequence: 5 }), makeAdvertisement({ sequence: 5 })) === null,
            '16. identical content at an equal sequence is a REPLAY, not an equivocation');

        const equivocation = detectPresenceEquivocation(
            makeAdvertisement({ sequence: 5, position: { x: 10, y: 0, z: 20 } }),
            makeAdvertisement({ sequence: 5, position: { x: 500, y: 0, z: 900 } })
        );
        assert(equivocation instanceof PresenceEquivocation, '17. two different claims at the same sequence ARE an equivocation');
        assert(equivocation.avatarId === 'avatar-1' && equivocation.sequence === 5, '18. the equivocation records the right avatarId/sequence');
        assert(equivocation.claims.length === 2, '19. both competing claims are retained as evidence, not just the winner');
    }

    // -------------------------------------------------------------
    // Section C — core/PresenceReplayWindow.js
    // -------------------------------------------------------------
    {
        const window_ = new PresenceReplayWindow();
        assert(window_.hasAccepted('a1', 'h1') === false, '20. nothing has been accepted yet');
        window_.recordAccepted('a1', 'h1');
        assert(window_.hasAccepted('a1', 'h1') === true, '21. a recorded hash is recognized');
        assert(window_.hasAccepted('a1', 'h2') === false, "22. a DIFFERENT hash for the same avatarId is not confused with it");
        assert(window_.hasAccepted('a2', 'h1') === false, '23. the same hash under a DIFFERENT avatarId is tracked independently');
    }
    {
        // Bounded eviction — the whole reason this exists instead of
        // reusing replication/ReplayGuard.js's unbounded set.
        const window_ = new PresenceReplayWindow(3);
        window_.recordAccepted('a1', 'h1');
        window_.recordAccepted('a1', 'h2');
        window_.recordAccepted('a1', 'h3');
        assert(window_.hasAccepted('a1', 'h1') === true, '24. still within the window, h1 is remembered');
        window_.recordAccepted('a1', 'h4');
        assert(window_.hasAccepted('a1', 'h1') === false, '25. once the window fills, the OLDEST hash is evicted');
        assert(window_.hasAccepted('a1', 'h4') === true, '26. the newest hash is still remembered');
        window_.clear();
        assert(window_.hasAccepted('a1', 'h4') === false, '27. clear() forgets everything');
    }

    // -------------------------------------------------------------
    // Section D — core/PresenceTrustPolicy.js
    // -------------------------------------------------------------
    {
        assert(PresenceTrustPolicy.permissive().requireSignedPresence === false, '28. permissive() tolerates unsigned presence');
        assert(PresenceTrustPolicy.hardened().requireSignedPresence === true, '29. hardened() requires signed presence');
        assert(new PresenceTrustPolicy().requireSignedPresence === false, '30. the bare default constructor matches permissive()');
        assert(PresenceTrustPolicy.hardened().toJSON().requireSignedPresence === true, '31. toJSON() reflects the configured policy');
    }

    // -------------------------------------------------------------
    // Section E — core/AvatarPresenceAdvertisement.js signing descriptor
    // -------------------------------------------------------------
    {
        const ad = makeAdvertisement({ position: { x: 1, y: 2, z: 3 } });
        const descriptor = getAvatarPresenceSigningDescriptor(ad);
        assert(descriptor.type === SignatureType.AVATAR_PRESENCE, '32. the descriptor uses the AVATAR_PRESENCE signature type');
        assert(descriptor.id === ad.avatarId && descriptor.revision === ad.sequence, '33. id/revision are avatarId/sequence');
        assert(descriptor.payload.position.x === 1, '34. the payload carries position');

        // Never sign only avatarId+sequence — every field must
        // participate, or a signature could be replayed with tampered
        // content (0.2.18's causal-history signing bug, recreated one
        // level up).
        const tampered = getAvatarPresenceSigningDescriptor(makeAdvertisement({ position: { x: 999, y: 2, z: 3 } }));
        assert(Signature.canonicalBytes(descriptor) !== Signature.canonicalBytes(tampered),
            '35. changing ONLY position changes the canonical signed bytes');
        const tamperedAnim = getAvatarPresenceSigningDescriptor(makeAdvertisement({ position: { x: 1, y: 2, z: 3 }, animation: AvatarAnimationState.RUNNING }));
        assert(Signature.canonicalBytes(descriptor) !== Signature.canonicalBytes(tamperedAnim),
            '36. changing ONLY animation changes the canonical signed bytes too');
    }

    // -------------------------------------------------------------
    // Section F — identity/LocalAuthorizationVerifier.verifyPresenceAdvertisement (REAL Ed25519)
    // -------------------------------------------------------------
    {
        const verifier = new LocalAuthorizationVerifier();
        const alice = buildRealSigner('alice-f');
        const ad = makeAdvertisement({ avatarId: 'af1', ownerIdentity: 'alice-f' });
        const signed = signAvatarPresenceAdvertisement(ad, alice);

        assert(!!signed.signature, '37. signAvatarPresenceAdvertisement actually attaches a signature');
        let result = verifier.verifyPresenceAdvertisement(signed);
        assert(result.valid === true && result.signed === true, '38. a genuinely signed advertisement verifies');

        result = verifier.verifyPresenceAdvertisement(ad);
        assert(result.valid === true && result.signed === false && result.reason === 'unsigned presence advertisement',
            '39. an unsigned advertisement is structurally fine — just unsigned, never treated as broken');

        const tampered = { ...signed, position: { x: 999, y: 0, z: 0 } };
        result = verifier.verifyPresenceAdvertisement(tampered);
        assert(result.valid === false && result.signed === true,
            '40. tampering with position AFTER signing invalidates the signature — position is inside the signed envelope');

        const malformedSig = { ...signed, signature: { garbage: true } };
        result = verifier.verifyPresenceAdvertisement(malformedSig);
        assert(result.valid === false && result.signed === true && result.reason === 'malformed signature',
            '41. a structurally broken signature object is reported, never crashes');

        const unknownSigner = { ...signed, signature: { ...signed.signature, signer: 'did:key:zNotARealKey!!' } };
        result = verifier.verifyPresenceAdvertisement(unknownSigner);
        assert(result.valid === false && result.reason === 'unknown signer identity',
            '42. an unparseable did:key signer is rejected cleanly');

        assert(verifier.verifyPresenceAdvertisement(null).valid === false, '43. null is never valid');
    }

    // -------------------------------------------------------------
    // Section G — application/PresenceSigning.js
    // -------------------------------------------------------------
    {
        const ad = makeAdvertisement({ avatarId: 'ag1' });
        assert(signAvatarPresenceAdvertisement(ad, null) === ad, '44. no identityProvider at all -> the SAME advertisement, unchanged');
        assert(signAvatarPresenceAdvertisement(ad, {}) === ad, "45. an identityProvider missing signCanonical/getSigningIdentity -> unchanged");

        const notLoggedIn = new LocalIdentityProvider(new InMemoryStorageProvider()); // never login() called
        assert(signAvatarPresenceAdvertisement(ad, notLoggedIn) === ad, '46. an identityProvider with nobody logged in degrades to unsigned rather than throwing');

        const alice = buildRealSigner('alice-g');
        const signed = signAvatarPresenceAdvertisement(ad, alice);
        assert(signed !== ad, '47. a real identityProvider produces a NEW object');
        assert(ad.signature === undefined, '48. the ORIGINAL advertisement is never mutated');
        assert(signed.avatarId === ad.avatarId && signed.position === ad.position, '49. every other field is carried through unchanged');
    }

    // -------------------------------------------------------------
    // Section H — application/PresenceTrustBoundary.js
    // -------------------------------------------------------------
    {
        // H1 — permissive default: unsigned presence works exactly
        // like 0.2.37 left it.
        const boundary = new PresenceTrustBoundary();
        let { accepted, observation } = boundary.evaluate(makeAdvertisement({ avatarId: 'h1', sequence: 1 }), null);
        assert(accepted === true && observation.status === TrustStatus.VALID, '50. a first-seen unsigned claim is accepted under the permissive default');

        // H2 — REPLAY: the exact same claim again.
        ({ accepted, observation } = boundary.evaluate(makeAdvertisement({ avatarId: 'h1', sequence: 1 }), makeAdvertisement({ avatarId: 'h1', sequence: 1 })));
        assert(accepted === false && observation.status === TrustStatus.REPLAYED, '51. resending an already-accepted claim is REPLAYED');

        // H3 — STALE: an older sequence.
        ({ accepted, observation } = boundary.evaluate(makeAdvertisement({ avatarId: 'h1', sequence: 0 }), makeAdvertisement({ avatarId: 'h1', sequence: 1 })));
        assert(accepted === false && observation.status === TrustStatus.STALE, '52. an older sequence than what is currently held is STALE');

        // H4 — EQUIVOCATION: same (unsigned) authority, same
        // sequence, different content.
        ({ accepted, observation } = boundary.evaluate(
            makeAdvertisement({ avatarId: 'h1', sequence: 1, position: { x: 500, y: 0, z: 0 } }),
            makeAdvertisement({ avatarId: 'h1', sequence: 1 })
        ));
        assert(accepted === false && observation.status === TrustStatus.EQUIVOCATING, '53. a same-sequence, different-content claim from the SAME bound identity is EQUIVOCATING');

        // H5 — impersonation attempt in permissive/unsigned mode: a
        // DIFFERENT ownerIdentity string never even reaches the
        // equivocation check.
        ({ accepted, observation } = boundary.evaluate(
            makeAdvertisement({ avatarId: 'h1', sequence: 1, ownerIdentity: 'mallory', position: { x: 500, y: 0, z: 0 } }),
            makeAdvertisement({ avatarId: 'h1', sequence: 1 })
        ));
        assert(accepted === false && observation.status === TrustStatus.UNAUTHORIZED, '54. a claim under a DIFFERENT ownerIdentity for a bound avatarId is UNAUTHORIZED, not merely a conflict');
    }
    {
        // H6 — hardened policy rejects unsigned presence outright.
        const boundary = new PresenceTrustBoundary({ policy: PresenceTrustPolicy.hardened() });
        const { accepted, observation } = boundary.evaluate(makeAdvertisement({ avatarId: 'h2', sequence: 1 }), null);
        assert(accepted === false && observation.status === TrustStatus.MISSING, '55. an unsigned claim is rejected outright under a hardened policy');
    }
    {
        // H7-H9 — real signatures: acceptance, cross-signer rejection,
        // and tamper detection, all through the boundary (not just the
        // verifier directly, as Section F already covered).
        const boundary = new PresenceTrustBoundary();
        const alice = buildRealSigner('alice-h');
        const mallory = buildRealSigner('mallory-h');
        const ad = makeAdvertisement({ avatarId: 'h3', ownerIdentity: 'alice-h', sequence: 1 });
        const aliceSigned = signAvatarPresenceAdvertisement(ad, alice);

        let { accepted, observation } = boundary.evaluate(aliceSigned, null);
        assert(accepted === true && observation.status === TrustStatus.VALID, '56. a genuinely signed first claim is accepted');

        const mallorySigned = signAvatarPresenceAdvertisement(
            makeAdvertisement({ avatarId: 'h3', ownerIdentity: 'alice-h', sequence: 2, position: { x: 50, y: 0, z: 0 } }),
            mallory
        );
        ({ accepted, observation } = boundary.evaluate(mallorySigned, aliceSigned));
        assert(accepted === false && observation.status === TrustStatus.UNAUTHORIZED,
            "57. a DIFFERENT signer claiming Alice's avatarId (even with a perfectly VALID signature of their own) is UNAUTHORIZED");

        const tampered = { ...aliceSigned, sequence: 2, position: { x: 999, y: 0, z: 0 } };
        ({ accepted, observation } = boundary.evaluate(tampered, aliceSigned));
        assert(accepted === false && observation.status === TrustStatus.INVALID_SIGNATURE,
            '58. reusing a real signature over DIFFERENT content fails cryptographic verification, caught before authority is even consulted');
    }
    {
        // H10 — malformed input.
        const boundary = new PresenceTrustBoundary();
        const { accepted, observation } = boundary.evaluate({ avatarId: '', sequence: 1, position: { x: 0, y: 0, z: 0 } }, null);
        assert(accepted === false && observation.status === TrustStatus.UNAVAILABLE, '59. a structurally malformed advertisement is UNAVAILABLE, never crashes the boundary');
    }

    // -------------------------------------------------------------
    // Section I — application/LocalPresenceStore.js: trust surfaced
    // through ingest()/list()
    // -------------------------------------------------------------
    {
        const store = new LocalPresenceStore();
        assert(store.ingest(makeAdvertisement({ avatarId: 'i1', sequence: 1 }), 1000) === true, '60. an ordinary unsigned claim is still accepted (0.2.37 behavior preserved)');
        let list = store.list(1000);
        assert(list[0].trustObservation.status === TrustStatus.VALID, '61. list() surfaces the trust observation alongside lifecycleState');

        // A same-sequence, different-content claim is REJECTED by
        // ingest(), but the store still records what happened, and
        // the DISPLAYED advertisement is untouched.
        const rejected = store.ingest(makeAdvertisement({ avatarId: 'i1', sequence: 1, position: { x: 900, y: 0, z: 0 } }), 1100);
        assert(rejected === false, '62. an equivocating claim is rejected by ingest()');
        assert(store.get('i1').position.x === 0, "63. the store's displayed position is UNCHANGED by the rejected claim — arrival order never picks a winner");
        list = store.list(1100);
        assert(list[0].trustObservation.status === TrustStatus.EQUIVOCATING, '64. ...but the most recent trust observation now reports the conflict, for diagnostics');

        // A genuinely newer, legitimate claim still moves things
        // forward normally afterward.
        assert(store.ingest(makeAdvertisement({ avatarId: 'i1', sequence: 2, position: { x: 5, y: 0, z: 0 } }), 1200) === true,
            '65. a genuinely newer claim is still accepted after a rejected equivocation attempt');
        list = store.list(1200);
        assert(list[0].advertisement.position.x === 5 && list[0].trustObservation.status === TrustStatus.VALID,
            '66. the store now reflects the new legitimate position, and trust reports VALID again');
    }
    {
        // A hardened trust boundary, wired directly into the store.
        const store = new LocalPresenceStore({ trustBoundary: new PresenceTrustBoundary({ policy: PresenceTrustPolicy.hardened() }) });
        assert(store.ingest(makeAdvertisement({ avatarId: 'i2', sequence: 1 }), 1000) === false,
            '67. LocalPresenceStore honors an injected hardened trustBoundary — unsigned presence is rejected outright');
    }

    // -------------------------------------------------------------
    // Section J — core/PresenceDiagnosticsSummary.js
    // -------------------------------------------------------------
    {
        assert(JSON.stringify(summarizePresenceDiagnostics([])) === JSON.stringify({ total: 0, trusted: 0, stale: 0, conflicting: 0, unavailable: 0 }),
            '68. an empty list summarizes to all zeros');

        const summary = summarizePresenceDiagnostics([
            { lifecycleState: PresenceLifecycleState.PRESENT, trustObservation: { status: TrustStatus.VALID } },
            { lifecycleState: PresenceLifecycleState.PRESENT, trustObservation: { status: TrustStatus.VALID } },
            { lifecycleState: PresenceLifecycleState.STALE, trustObservation: { status: TrustStatus.VALID } },
            { lifecycleState: PresenceLifecycleState.PRESENT, trustObservation: { status: TrustStatus.EQUIVOCATING } },
            { lifecycleState: PresenceLifecycleState.PRESENT, trustObservation: { status: TrustStatus.UNAUTHORIZED } },
            { lifecycleState: PresenceLifecycleState.PRESENT, trustObservation: null }
        ]);
        assert(summary.total === 6, '69. total counts every known avatar');
        assert(summary.trusted === 2, '70. trusted counts PRESENT + VALID');
        assert(summary.stale === 1, '71. stale counts lifecycle STALE regardless of trust status');
        assert(summary.conflicting === 1, '72. conflicting counts the most recent EQUIVOCATING observation');
        assert(summary.unavailable === 2, '73. everything else questionable (UNAUTHORIZED, or no observation at all) falls into unavailable');
    }

    // -------------------------------------------------------------
    // Section K — WorldNavigationSession integration
    // -------------------------------------------------------------
    {
        const { identityProvider: alice, avatarProfileUseCase, avatarPresenceSession } = buildAvatarStack('session-k1', registry);

        function fakeBroadcastProvider() {
            const listeners = new Set();
            const sent = [];
            return {
                sent,
                advertise: (ad) => sent.push(ad),
                onAdvertisement: (cb) => { listeners.add(cb); return () => listeners.delete(cb); },
                dispose() {}
            };
        }
        const provider = fakeBroadcastProvider();
        const session = new WorldNavigationSession({
            registry: new CreateBrickRegistryUseCase().execute(), loadPublicationDocumentUseCase: null, worldLayoutProvider: null,
            identityProvider: alice, avatarProfileUseCase, avatarPresenceSession,
            presenceBroadcastProvider: provider, avatarTemplateRegistry: registry
        });
        session._session = spyRenderFacade();
        session._setupRemoteAvatars();
        session._setupLocalAvatar();

        avatarPresenceSession.update({ position: { x: 1, y: 0, z: 0 } });
        assert(provider.sent.length === 1, '74. moving the local avatar publishes exactly one advertisement');
        assert(!!provider.sent[0].signature, "75. WorldNavigationSession signs the local avatar's presence whenever identityProvider can sign");

        const diag = session.getRemoteAvatarDiagnostics();
        assert(diag.total === 0, '76. a fresh session with no remote avatars yet reports an all-zero diagnostics summary');

        session.dispose();
    }
    {
        // No identityProvider wired -> publishes unsigned, exactly
        // 0.2.37's own behavior.
        const registry2 = buildRegistry();
        const storage = new InMemoryStorageProvider();
        const anon = new LocalIdentityProvider(storage);
        anon.login('session-k2');
        const avatarProfileUseCase = new AvatarProfileUseCase(storage, anon, registry2);
        const profile = avatarProfileUseCase.getProfile();
        const avatarPresenceSession = new AvatarPresenceSession(profile, { position: { x: 0, y: 0, z: 0 } });
        const sent = [];
        const provider = {
            advertise: (ad) => sent.push(ad),
            onAdvertisement: () => () => {},
            dispose() {}
        };
        const session = new WorldNavigationSession({
            registry: new CreateBrickRegistryUseCase().execute(), loadPublicationDocumentUseCase: null, worldLayoutProvider: null,
            // identityProvider deliberately OMITTED
            avatarProfileUseCase, avatarPresenceSession,
            presenceBroadcastProvider: provider, avatarTemplateRegistry: registry2
        });
        session._session = spyRenderFacade();
        session._setupRemoteAvatars();
        session._setupLocalAvatar();
        avatarPresenceSession.update({ position: { x: 1, y: 0, z: 0 } });
        assert(sent.length === 1 && !sent[0].signature, '77. with no identityProvider wired, presence still publishes, just unsigned — never breaks publishing');
        session.dispose();
    }

    // -------------------------------------------------------------
    // Section L — FLAGSHIP: the design doc's own malicious scripted
    // scenario.
    //
    //   Alice publishes signed presence sequence N -> Bob accepts.
    //   Attacker replays an OLD, genuinely captured packet -> Bob
    //     recognizes REPLAY.
    //   Attacker tampers with a captured packet's position while
    //     keeping its old signature -> Bob's signature check fails
    //     outright (a STRONGER outcome than mere conflict-detection —
    //     see core/PresenceEquivocation.js's own header for why this
    //     milestone treats a forged claim from a non-owning attacker
    //     as INVALID_SIGNATURE/UNAUTHORIZED, never EQUIVOCATING).
    //   Alice's OWN key double-signs a conflicting claim at her
    //     CURRENT sequence (simulating a buggy multi-device client) ->
    //     Bob detects EQUIVOCATION and does NOT let it become the new
    //     truth.
    //   A second attacker, with their OWN real (but wrong) signing
    //     identity, claims Alice's avatarId at a brand new sequence ->
    //     UNAUTHORIZED.
    //   Alice moves again for real -> Bob accepts it normally.
    //   Alice goes idle long enough to expire -> Bob's renderer is
    //     told to remove her.
    //   Document/Publication/WorldPlacement/SpatialIndex are
    //     byte-identical throughout, on both replicas, at every point.
    // -------------------------------------------------------------
    {
        const channelName = 'forkbuild-test-flagship-0-2-38';

        const storage = new InMemoryStorageProvider();
        const alice = new LocalIdentityProvider(storage);
        alice.login('alice');
        const aliceAvatarProfileUseCase = new AvatarProfileUseCase(storage, alice, registry);
        aliceAvatarProfileUseCase.updateProfile({ templateId: 'humanoid-01', displayName: 'Alice' });
        const aliceProfile = aliceAvatarProfileUseCase.getProfile();
        const aliceAvatarPresenceSession = new AvatarPresenceSession(aliceProfile, { position: { x: 0, y: 0, z: 0 } });
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
        const document = new Document({ world, metadata: new DocumentMetadata({ title: 'Flagship Trust Castle', author: 'alice', license: new License({ id: LicenseId.CC0_1_0 }) }) });
        const publication = publishDocumentUseCase.execute({ document });

        const placementBefore = placementRegistry.findByPublicationId(publication.id)[0];
        const placementJsonBefore = JSON.stringify(placementBefore.toJSON());
        const documentKeysBefore = storage.list().filter((k) => k.startsWith('document:')).length;
        const spatialCountBefore = spatialIndexProvider.discover({ x: 0, y: 0, z: 0 }, 100000).length;

        const aliceSession = new WorldNavigationSession({
            registry: brickRegistry, loadPublicationDocumentUseCase, worldLayoutProvider: new LocalWorldLayoutProvider(spatialIndexProvider, discoveryProvider),
            identityProvider: alice, discoveryProvider, placementRegistry,
            avatarProfileUseCase: aliceAvatarProfileUseCase, avatarPresenceSession: aliceAvatarPresenceSession,
            presenceBroadcastProvider: aliceBroadcastProvider, avatarTemplateRegistry: registry
        });
        const aliceFacade = spyRenderFacade();
        aliceSession._session = aliceFacade;
        aliceSession._setupRemoteAvatars();
        aliceSession._setupLocalAvatar();

        // A raw "wire recorder" — a THIRD provider on the same
        // channel, capturing every genuine advertisement Alice's
        // session actually broadcasts, exactly what a real attacker
        // sniffing an unauthenticated broadcast transport could do.
        const capturedFromAlice = [];
        const recorder = new LocalAvatarPresenceBroadcastProvider(channelName);
        recorder.onAdvertisement((ad) => capturedFromAlice.push(ad));

        // The attacker's own transport handle — anyone can post to an
        // unauthenticated BroadcastChannel.
        const attackerProvider = new LocalAvatarPresenceBroadcastProvider(channelName);

        // Bob: a completely separate replica.
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

        // Alice moves for real (sequence 1).
        aliceAvatarPresenceSession.update({ position: { x: 5, y: 0, z: 0 } });
        await wait(80);
        let known = bobPull();
        assert(known.length === 1 && known[0].advertisement.avatarId === aliceProfile.avatarId,
            "78. FLAGSHIP: Bob synchronizes Alice's first genuine, signed movement");
        assert(known[0].trustObservation.status === TrustStatus.VALID, '79. FLAGSHIP: that first claim is reported VALID');
        assert(capturedFromAlice.length >= 1, '80. FLAGSHIP: the recorder captured a genuine copy of what Alice actually sent (the "attacker" now has a real packet to replay)');
        const genuineSequence1 = capturedFromAlice[capturedFromAlice.length - 1];

        // Alice moves again for real (sequence 2) — this becomes
        // Bob's CURRENT state for the rest of the scenario.
        aliceAvatarPresenceSession.update({ position: { x: 10, y: 0, z: 0 } });
        await wait(80);
        known = bobPull();
        assert(known[0].advertisement.position.x === 10, "81. FLAGSHIP: Bob's view tracks Alice's second real movement");

        // ATTACK 1a — not every hostile-looking arrival is a forgery:
        // a lagging/duplicating transport (or a stale relay) can
        // legitimately redeliver an old, genuinely-signed claim Bob
        // has simply never seen before (sequence 0 — Alice's spawn
        // point, never itself published, so its hash was never
        // accepted). Older than Bob's current sequence 2, and not a
        // duplicate of anything Bob HAS seen: STALE, not REPLAYED —
        // see core/TrustObservation.js's own distinction between the
        // two.
        const neverSeenOldClaim = signAvatarPresenceAdvertisement(
            makeAdvertisement({ avatarId: aliceProfile.avatarId, ownerIdentity: 'alice', position: { x: 0, y: 0, z: 0 }, sequence: 0 }),
            alice
        );
        attackerProvider.advertise(neverSeenOldClaim);
        await wait(80);
        known = bobPull();
        assert(known[0].advertisement.position.x === 10, "82. FLAGSHIP: a genuinely stale claim never overwrites Bob's current (newer) state");
        assert(known[0].trustObservation.status === TrustStatus.STALE, '83. FLAGSHIP: an old sequence Bob has never accepted before is classified STALE');

        // ATTACK 1b — replay the captured, genuinely-signed sequence-1
        // packet VERBATIM. Bob already accepted this exact claim once
        // (before Alice's second move superseded it), so this is
        // recognized as a REPLAY, not merely STALE — the design doc's
        // own "sequence 100 replayed after 101 is current -> REPLAY"
        // example, exercised for real.
        attackerProvider.advertise(genuineSequence1);
        await wait(80);
        known = bobPull();
        assert(known[0].advertisement.position.x === 10, '84. FLAGSHIP: a replayed OLD packet never overwrites Bob\'s current (newer) state either');
        assert(known[0].trustObservation.status === TrustStatus.REPLAYED, '85. FLAGSHIP: resending an exact claim Bob already accepted once before is recognized as a REPLAY, not STALE');

        // ATTACK 2 — tamper with the captured packet's position while
        // keeping its (now stale) signature. The signature no longer
        // matches the payload at all.
        const tamperedPacket = { ...genuineSequence1, position: { x: 999, y: 0, z: 999 } };
        attackerProvider.advertise(tamperedPacket);
        await wait(80);
        known = bobPull();
        assert(known[0].advertisement.position.x === 10, '86. FLAGSHIP: a tampered position never overwrites Bob\'s current state');
        assert(known[0].trustObservation.status === TrustStatus.INVALID_SIGNATURE,
            '87. FLAGSHIP: tampering with a signed field is caught as an invalid signature, never mistaken for a mere conflict');

        // ATTACK 3 — Alice's OWN real key double-signs a conflicting
        // claim at her CURRENT sequence (a buggy multi-device client,
        // or a compromised-but-still-her-key scenario) — genuine
        // equivocation.
        const currentSequence = aliceAvatarPresenceSession.current.sequence;
        const conflictingClaim = signAvatarPresenceAdvertisement(
            makeAdvertisement({
                avatarId: aliceProfile.avatarId, ownerIdentity: 'alice',
                position: { x: -500, y: 0, z: -500 }, sequence: currentSequence
            }),
            alice
        );
        attackerProvider.advertise(conflictingClaim);
        await wait(80);
        known = bobPull();
        assert(known[0].advertisement.position.x === 10, "88. FLAGSHIP: an equivocating claim from Alice's OWN real key still never becomes the new truth");
        assert(known[0].trustObservation.status === TrustStatus.EQUIVOCATING, '89. FLAGSHIP: Bob correctly recognizes this as equivocation, not a legitimate update');
        let diag = bobSession.getRemoteAvatarDiagnostics();
        assert(diag.conflicting === 1, '90. FLAGSHIP: the World View diagnostic surface reports exactly one conflicting avatar right now');

        // ATTACK 4 — a genuinely different attacker, with their OWN
        // real (but wrong) signing identity, claims Alice's avatarId
        // at a brand-new, higher sequence.
        const mallory = buildRealSigner('mallory-flagship');
        const impersonation = signAvatarPresenceAdvertisement(
            makeAdvertisement({
                avatarId: aliceProfile.avatarId, ownerIdentity: 'alice',
                position: { x: 12345, y: 0, z: 0 }, sequence: currentSequence + 1
            }),
            mallory
        );
        attackerProvider.advertise(impersonation);
        await wait(80);
        known = bobPull();
        assert(known[0].advertisement.position.x === 10, "91. FLAGSHIP: impersonation with a DIFFERENT real signing identity never becomes the new truth");
        assert(known[0].trustObservation.status === TrustStatus.UNAUTHORIZED, "92. FLAGSHIP: Bob's identity binding correctly rejects a claim to Alice's avatarId from a different real signer");

        // Alice moves again for real — everything still works
        // normally after all four attacks.
        aliceAvatarPresenceSession.update({ position: { x: 15, y: 0, z: 0 } });
        await wait(80);
        known = bobPull();
        assert(known[0].advertisement.position.x === 15, "93. FLAGSHIP: Alice's next genuine movement is accepted normally, unaffected by any of the attacks");
        assert(known[0].trustObservation.status === TrustStatus.VALID, '94. FLAGSHIP: trust reports VALID again once a real update arrives');
        diag = bobSession.getRemoteAvatarDiagnostics();
        assert(diag.trusted === 1 && diag.conflicting === 0, '95. FLAGSHIP: diagnostics recover to fully trusted once legitimate traffic resumes');

        // Alice goes idle. One final settle-to-idle publish, then
        // truly nothing further.
        await wait(50);

        // Fast-forward Bob's own clock well past absence.
        const farFuture = Date.now() + 60000;
        const knownFarFuture = bobSession._presenceSyncService.pull(farFuture);
        bobSession._remoteAvatarRegistry.sync(knownFarFuture, farFuture);
        assert(knownFarFuture.length === 0, "96. FLAGSHIP: far enough in the future, Alice's presence has expired from Bob's own store");
        assert(bobFacade.calls.removeRemoteAvatar.includes(aliceProfile.avatarId),
            "97. FLAGSHIP: Bob's renderer is told to remove Alice's avatar once her presence expires");

        // Neither Document, Publication, WorldPlacement, nor
        // SpatialIndex changed ANYWHERE, on either replica, at any
        // point during the entire attack scenario.
        const placementAfter = placementRegistry.findByPublicationId(publication.id)[0];
        assert(JSON.stringify(placementAfter.toJSON()) === placementJsonBefore,
            '98. FLAGSHIP: WorldPlacement/PlacementRecord is byte-identical after the entire trust/attack scenario');
        const documentKeysAfter = storage.list().filter((k) => k.startsWith('document:')).length;
        assert(documentKeysAfter === documentKeysBefore, '99. FLAGSHIP: no document was ever created for any presence or attack traffic');
        const spatialCountAfter = spatialIndexProvider.discover({ x: 0, y: 0, z: 0 }, 100000).length;
        assert(spatialCountAfter === spatialCountBefore, '100. FLAGSHIP: the spatial index is untouched by any presence or attack activity');
        assert(document.metadata.title === 'Flagship Trust Castle', '101. FLAGSHIP: DocumentMetadata is untouched');

        aliceSession.dispose();
        bobSession.dispose();
        aliceBroadcastProvider.dispose();
        bobBroadcastProvider.dispose();
        recorder.dispose();
        attackerProvider.dispose();
    }

    console.log('✅ All Avatar Presence Trust, Replay & Conflict Handling tests passed.');
}

// Top-level await — see tests/AvatarPresenceSync.test.js's comment for
// why the usual fire-and-forget pattern isn't reliably safe, doubly so
// here given the same genuine macrotask scheduling (real
// BroadcastChannel waits).
await runTests();
