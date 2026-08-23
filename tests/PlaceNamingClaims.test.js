import { PlaceNamingClaim, getPlaceNamingClaimSigningDescriptor } from '../core/PlaceNamingClaim.js';
import {
    claimsForRegion, namingView, preferredClaimedName, describeNamingView
} from '../core/PlaceNamingView.js';
import { WorldRegion } from '../core/WorldRegion.js';
import { RegionKind } from '../core/RegionKind.js';
import { regionsContaining, describePlace } from '../core/WorldRegionGeography.js';
import { Position } from '../core/Position.js';
import { LocalIdentityProvider } from '../identity/LocalIdentityProvider.js';
import { LocalAuthorizationVerifier } from '../identity/LocalAuthorizationVerifier.js';
import { StorageProvider } from '../storage/StorageProvider.js';
import { LocalPlaceNamingClaimStore } from '../application/LocalPlaceNamingClaimStore.js';
import { PlaceNamingClaimUseCase } from '../application/PlaceNamingClaimUseCase.js';
import { LocalNamePreferenceStore } from '../application/LocalNamePreferenceStore.js';

// 0.5.2 — Place Naming & Naming Claims.
//
// This flagship suite proves the exact architectural boundary the
// design conversation asked for:
//
//   WorldRegion       = objective shared geometry (0.5.0, UNCHANGED)
//   PlaceNamingClaim  = a subjective, REQUIRED-signature, published
//                       assertion — never a World mutation
//   PlaceNamingView   = a pure, derived, confidence-not-authority
//                       ranking of whatever claims a replica knows
//   LocalNamePreferenceStore = a purely local, unsigned override
//
// See docs/Principles.md, "A Name Is A Claim, Not A Fact (0.5.2)."

function assert(condition, message) {
    if (!condition) throw new Error(`ASSERT FAILED: ${message}`);
}

class InMemoryStorageProvider extends StorageProvider {
    constructor() { super(); this._data = new Map(); }
    save(name, data) { this._data.set(name, JSON.parse(JSON.stringify(data))); }
    load(name) { return this._data.has(name) ? JSON.parse(JSON.stringify(this._data.get(name))) : null; }
    remove(name) { this._data.delete(name); }
    list() { return Array.from(this._data.keys()); }
}

// Mirrors tests/MultiDeviceSocialSemantics.test.js's own makeDevice() —
// one independent, authenticated LocalIdentityProvider standing in for
// one distinct identity.
function makeIdentity(label) {
    const provider = new LocalIdentityProvider(new InMemoryStorageProvider());
    const identity = provider.createLocalIdentity(label);
    provider.authenticate(identity.identityId);
    return provider;
}

async function run() {
    // -------------------------------------------------------------
    // Section A: core/PlaceNamingClaim.js — construction & validation
    // -------------------------------------------------------------
    {
        let threw = false;
        try { new PlaceNamingClaim({ worldId: 'w1', name: 'X', authorIdentityId: 'a1' }); }
        catch { threw = true; }
        assert(threw, 'PlaceNamingClaim requires a regionId');

        threw = false;
        try { new PlaceNamingClaim({ worldId: 'w1', regionId: 'r1', authorIdentityId: 'a1' }); }
        catch { threw = true; }
        assert(threw, 'PlaceNamingClaim requires a name');

        threw = false;
        try { new PlaceNamingClaim({ worldId: 'w1', regionId: 'r1', name: '   ', authorIdentityId: 'a1' }); }
        catch { threw = true; }
        assert(threw, 'PlaceNamingClaim rejects a whitespace-only name');

        threw = false;
        try { new PlaceNamingClaim({ worldId: 'w1', regionId: 'r1', name: 'X' }); }
        catch { threw = true; }
        assert(threw, 'PlaceNamingClaim requires an authorIdentityId');

        const claim = new PlaceNamingClaim({ worldId: 'w1', regionId: 'r1', name: '  Green Valley  ', authorIdentityId: 'a1' });
        assert(claim.name === 'Green Valley', 'name is trimmed');
        assert(claim.id, 'id auto-generated');
        assert(claim.createdAt instanceof Date, 'createdAt defaults to now');

        const json = claim.toJSON();
        const restored = PlaceNamingClaim.fromJSON(json);
        assert(restored.id === claim.id, 'fromJSON round-trip preserves id');
        assert(restored.name === 'Green Valley', 'fromJSON round-trip preserves name');
        assert(restored.regionId === 'r1' && restored.worldId === 'w1', 'fromJSON round-trip preserves worldId/regionId');

        const descriptorFromInstance = claim.getSigningDescriptor();
        const descriptorFromFreeFn = getPlaceNamingClaimSigningDescriptor(claim.toJSON());
        assert(JSON.stringify(descriptorFromInstance) === JSON.stringify(descriptorFromFreeFn),
            'instance getSigningDescriptor() matches the standalone free function exactly');
    }
    console.log('✓ Section A: core/PlaceNamingClaim.js — construction & validation');

    // -------------------------------------------------------------
    // Section B: identity/LocalAuthorizationVerifier.js#verifyPlaceNamingClaim
    // -------------------------------------------------------------
    {
        const alice = makeIdentity('Alice');
        const bob = makeIdentity('Bob');
        const verifier = new LocalAuthorizationVerifier();

        let claim = new PlaceNamingClaim({
            worldId: 'w1', regionId: 'r1', name: 'Green Valley',
            authorIdentityId: alice.getSigningIdentity().id
        });
        const signature = alice.signCanonical(claim.getSigningDescriptor());
        claim = claim.withSignature(signature);

        const valid = verifier.verifyPlaceNamingClaim(claim.toJSON());
        assert(valid.valid === true, `a properly signed claim should verify: ${valid.reason}`);

        const unsigned = verifier.verifyPlaceNamingClaim({ ...claim.toJSON(), signature: null });
        assert(unsigned.valid === false && unsigned.signed === false, 'an unsigned claim must never verify');

        const tampered = verifier.verifyPlaceNamingClaim({ ...claim.toJSON(), name: 'Hacked Valley' });
        assert(tampered.valid === false, 'a tampered claim (name changed after signing) must fail verification');

        // Bob signs a claim but attributes it to Alice's identity.
        let impostorClaim = new PlaceNamingClaim({
            worldId: 'w1', regionId: 'r1', name: 'Bob\'s Lie', authorIdentityId: alice.getSigningIdentity().id
        });
        const bobSignature = bob.signCanonical(impostorClaim.getSigningDescriptor());
        impostorClaim = impostorClaim.withSignature(bobSignature);
        const impersonation = verifier.verifyPlaceNamingClaim(impostorClaim.toJSON());
        assert(impersonation.valid === false, 'a claim signed by someone other than its own authorIdentityId must fail');

        assert(verifier.verifyPlaceNamingClaim(null).valid === false, 'verifyPlaceNamingClaim(null) is false, never throws');
    }
    console.log('✓ Section B: identity/LocalAuthorizationVerifier.js#verifyPlaceNamingClaim — required-signature discipline');

    // -------------------------------------------------------------
    // Section C: core/PlaceNamingView.js — confidence, not authority
    // -------------------------------------------------------------
    {
        const alice = 'did:key:alice';
        const bob = 'did:key:bob';
        const carol = 'did:key:carol';
        const claims = [
            new PlaceNamingClaim({ worldId: 'w1', regionId: 'r1', name: 'Green Valley', authorIdentityId: alice }),
            new PlaceNamingClaim({ worldId: 'w1', regionId: 'r1', name: 'Green Valley', authorIdentityId: carol }),
            new PlaceNamingClaim({ worldId: 'w1', regionId: 'r1', name: 'Emerald Valley', authorIdentityId: bob }),
            // Alice republishes "Green Valley" a second time — must NOT
            // double-count her own vote (see this module's own header).
            new PlaceNamingClaim({ worldId: 'w1', regionId: 'r1', name: 'Green Valley', authorIdentityId: alice }),
            // A claim for a DIFFERENT region must never leak in.
            new PlaceNamingClaim({ worldId: 'w1', regionId: 'r2', name: 'Somewhere Else', authorIdentityId: bob })
        ];

        const forRegion = claimsForRegion('r1', claims);
        assert(forRegion.length === 4, `claimsForRegion should return exactly the 4 r1 claims, got ${forRegion.length}`);

        const view = namingView('r1', claims);
        assert(view.length === 2, `expected 2 distinct names, got ${view.length}`);
        assert(view[0].name === 'Green Valley' && view[0].score === 2, `Green Valley should rank first with score 2, got ${view[0].name}/${view[0].score}`);
        assert(view[1].name === 'Emerald Valley' && view[1].score === 1, `Emerald Valley should be second with score 1, got ${view[1].name}/${view[1].score}`);
        assert(view[0].claims.length === 3, `Green Valley's own claims list should include all 3 (2 authors, one republished), got ${view[0].claims.length}`);

        assert(preferredClaimedName('r1', claims) === 'Green Valley', 'preferredClaimedName should be the top-ranked name');
        assert(preferredClaimedName('unknown-region', claims) === null, 'preferredClaimedName is null for a region nobody claimed anything about');

        assert(describeNamingView(view) === 'Green Valley · 2 community names', `describeNamingView mismatch: "${describeNamingView(view)}"`);
        assert(describeNamingView([]) === '', 'describeNamingView is empty string for no claims, never a placeholder');
        assert(describeNamingView([view[0]]) === 'Green Valley', 'describeNamingView with exactly one name is just that name');

        // Deterministic tie-break: two names with equal score sort by
        // name, so replicas that discovered claims in a different order
        // still converge on the same displayed ranking.
        const tiedClaims = [
            new PlaceNamingClaim({ worldId: 'w1', regionId: 'r3', name: 'Zebra Town', authorIdentityId: alice }),
            new PlaceNamingClaim({ worldId: 'w1', regionId: 'r3', name: 'Apple Town', authorIdentityId: bob })
        ];
        const tiedView = namingView('r3', tiedClaims);
        assert(tiedView[0].name === 'Apple Town', `tied scores should break alphabetically, got ${tiedView[0].name} first`);
    }
    console.log('✓ Section C: core/PlaceNamingView.js — distinct-author scoring, ranking, deterministic tie-break');

    // -------------------------------------------------------------
    // Section D: application/LocalPlaceNamingClaimStore.js — persistence
    // -------------------------------------------------------------
    {
        const storage = new InMemoryStorageProvider();
        const store = new LocalPlaceNamingClaimStore(storage);
        const claim1 = new PlaceNamingClaim({ worldId: 'w1', regionId: 'r1', name: 'Green Valley', authorIdentityId: 'a1' });
        const claim2 = new PlaceNamingClaim({ worldId: 'w1', regionId: 'r2', name: 'Somewhere Else', authorIdentityId: 'a2' });
        const claimOtherWorld = new PlaceNamingClaim({ worldId: 'w2', regionId: 'r1', name: 'Different World', authorIdentityId: 'a3' });

        store.save(claim1);
        store.save(claim2);
        store.save(claimOtherWorld);

        assert(store.list('w1').length === 2, 'list(w1) should return exactly the 2 claims stored for w1');
        assert(store.list('w2').length === 1, 'list(w2) should be scoped independently from w1');
        assert(store.list('w1')[0] instanceof PlaceNamingClaim, 'list() returns hydrated PlaceNamingClaim instances');
        assert(store.listForRegion('w1', 'r1').length === 1, 'listForRegion filters within a World');

        assert(store.retract('w1', claim1.id) === true, 'retract() returns true for an existing claim');
        assert(store.list('w1').length === 1, 'retracted claim is gone');
        assert(store.retract('w1', claim1.id) === false, 'retract() is idempotent-false for an already-removed claim');
        assert(store.retract('w1', 'never-existed') === false, 'retract() returns false for an unknown id');
    }
    console.log('✓ Section D: application/LocalPlaceNamingClaimStore.js — per-World persistence, round-trip, retraction');

    // -------------------------------------------------------------
    // Section E: application/PlaceNamingClaimUseCase.js — publish/retract authority
    // -------------------------------------------------------------
    {
        const storage = new InMemoryStorageProvider();
        const store = new LocalPlaceNamingClaimStore(storage);
        const verifier = new LocalAuthorizationVerifier();
        const alice = makeIdentity('Alice');
        const bob = makeIdentity('Bob');
        const aliceUseCase = new PlaceNamingClaimUseCase(store, alice, verifier);
        const bobUseCase = new PlaceNamingClaimUseCase(store, bob, verifier);

        const published = aliceUseCase.publish('w1', 'r1', 'Green Valley');
        assert(published.signature, 'publish() returns a signed claim');
        assert(published.authorIdentityId === alice.getSigningIdentity().id, 'publish() stamps the CURRENT signed-in identity, never a caller-supplied one');
        assert(verifier.verifyPlaceNamingClaim(published.toJSON()).valid, 'a use-case-published claim verifies');
        assert(store.list('w1').length === 1, 'publish() persists through the store');

        // Bob cannot retract Alice's claim.
        assert(bobUseCase.retract('w1', published.id) === false, 'retract() must refuse a non-author');
        assert(store.list('w1').length === 1, 'a refused retraction changes nothing');

        // Alice can retract her own.
        assert(aliceUseCase.retract('w1', published.id) === true, 'retract() succeeds for the claim\'s own author');
        assert(store.list('w1').length === 0, 'the claim is actually gone');

        // A provider that cannot sign at all is refused, never silently unsigned.
        const noSignProvider = { currentUser: () => null, getSigningIdentity: () => { throw new Error('nope'); } };
        const brokenUseCase = new PlaceNamingClaimUseCase(store, noSignProvider, verifier);
        let threw = false;
        try { brokenUseCase.publish('w1', 'r1', 'X'); } catch { threw = true; }
        assert(threw, 'publish() must throw rather than silently store an unsigned claim when nobody is signed in');

        // namingView() delegation.
        aliceUseCase.publish('w1', 'r2', 'Sunny Meadow');
        const carol = makeIdentity('Carol');
        new PlaceNamingClaimUseCase(store, carol, verifier).publish('w1', 'r2', 'Sunny Meadow');
        const view = aliceUseCase.namingView('w1', 'r2');
        assert(view.length === 1 && view[0].score === 2, `namingView() should merge Alice+Carol's agreement into one score-2 entry, got ${JSON.stringify(view)}`);
    }
    console.log('✓ Section E: application/PlaceNamingClaimUseCase.js — required signing, author-only retraction, namingView delegation');

    // -------------------------------------------------------------
    // Section F: application/LocalNamePreferenceStore.js — local-only, per-identity
    // -------------------------------------------------------------
    {
        const storage = new InMemoryStorageProvider();
        const alice = makeIdentity('Alice');
        const bob = makeIdentity('Bob');
        const alicePrefs = new LocalNamePreferenceStore(storage, alice);
        const bobPrefs = new LocalNamePreferenceStore(storage, bob);

        assert(alicePrefs.getPreferredName('w1', 'r1') === null, 'no preference set yet');
        assert(alicePrefs.setPreferredName('w1', 'r1', 'Green Valley') === true, 'setPreferredName succeeds when signed in');
        assert(alicePrefs.getPreferredName('w1', 'r1') === 'Green Valley', 'preference reads back');

        bobPrefs.setPreferredName('w1', 'r1', 'Emerald Valley');
        assert(alicePrefs.getPreferredName('w1', 'r1') === 'Green Valley', 'Alice\'s own preference is untouched by Bob setting his, even sharing the same storageProvider');
        assert(bobPrefs.getPreferredName('w1', 'r1') === 'Emerald Valley', 'Bob sees his own preference');

        assert(alicePrefs.clearPreferredName('w1', 'r1') === true, 'clearPreferredName succeeds');
        assert(alicePrefs.getPreferredName('w1', 'r1') === null, 'cleared preference reads back as null');
        assert(bobPrefs.getPreferredName('w1', 'r1') === 'Emerald Valley', 'clearing Alice\'s preference never touches Bob\'s');

        const signedOutPrefs = new LocalNamePreferenceStore(storage, null);
        assert(signedOutPrefs.getPreferredName('w1', 'r1') === null, 'no identityProvider degrades to null, never throws');
        assert(signedOutPrefs.setPreferredName('w1', 'r1', 'X') === false, 'setPreferredName without a signed-in identity fails safely');
    }
    console.log('✓ Section F: application/LocalNamePreferenceStore.js — per-identity isolation, safe degradation when signed out');

    // -------------------------------------------------------------
    // Section G: WorldRegion.name stays completely untouched (0.5.0 regression)
    // -------------------------------------------------------------
    {
        const region = new WorldRegion({
            id: 'r1', worldId: 'w1', authorIdentityId: 'a1', name: 'Willow Village',
            kind: RegionKind.VILLAGE, position: new Position(0, 0, 0), radius: 30
        });
        const claims = [
            new PlaceNamingClaim({ worldId: 'w1', regionId: 'r1', name: 'Riverside', authorIdentityId: 'bob' }),
            new PlaceNamingClaim({ worldId: 'w1', regionId: 'r1', name: 'Riverside', authorIdentityId: 'carol' })
        ];
        // Even though "Riverside" out-scores anything the region itself
        // claims (region.name isn't even IN the claim pool), the
        // region's own geometric/naming behavior from 0.5.0 is
        // completely unaffected — regionsContaining()/describePlace()
        // never consult PlaceNamingClaim at all.
        const containing = regionsContaining({ x: 0, z: 0 }, [region]);
        assert(containing.length === 1 && containing[0].name === 'Willow Village', 'regionsContaining() still reports the region\'s own name, untouched by any claim');
        assert(describePlace(containing) === 'Willow Village', 'describePlace() is untouched by 0.5.2');
        assert(preferredClaimedName('r1', claims) === 'Riverside', 'meanwhile, the CLAIMED naming view is a completely independent reading');
    }
    console.log('✓ Section G: core/WorldRegion.js / core/WorldRegionGeography.js — 0.5.0 behavior completely unchanged by 0.5.2');

    // -------------------------------------------------------------
    // Section H: CAPSTONE — three independent identities, disagreement,
    // retraction, and a purely local preference, all coexisting
    // -------------------------------------------------------------
    {
        const storage = new InMemoryStorageProvider();
        const store = new LocalPlaceNamingClaimStore(storage);
        const verifier = new LocalAuthorizationVerifier();
        const alice = makeIdentity('Alice');
        const bob = makeIdentity('Bob');
        const carol = makeIdentity('Carol');
        const aliceUseCase = new PlaceNamingClaimUseCase(store, alice, verifier);
        const bobUseCase = new PlaceNamingClaimUseCase(store, bob, verifier);
        const carolUseCase = new PlaceNamingClaimUseCase(store, carol, verifier);

        const worldId = 'capstone-world';
        const region = new WorldRegion({
            id: 'capstone-region', worldId, authorIdentityId: alice.getSigningIdentity().id,
            name: 'Willow Village', kind: RegionKind.VILLAGE, position: new Position(0, 0, 0), radius: 30
        });

        // Alice authored the region itself, calling it "Willow Village."
        // Bob and Carol disagree, independently, without asking anyone's
        // permission.
        const aliceClaim = aliceUseCase.publish(worldId, region.id, 'Willow Village');
        const bobClaim = bobUseCase.publish(worldId, region.id, 'Riverbend');
        carolUseCase.publish(worldId, region.id, 'Riverbend');

        let view = aliceUseCase.namingView(worldId, region.id);
        assert(view[0].name === 'Riverbend' && view[0].score === 2, `Riverbend should lead 2-1 over Alice's own region name, got ${JSON.stringify(view)}`);
        // The region itself never budges.
        assert(region.name === 'Willow Village', 'the WorldRegion itself is never mutated by any claim, including its own author\'s');

        // Alice sets a LOCAL preference for her own name — visible only
        // to her, never changing the shared naming view.
        const alicePrefs = new LocalNamePreferenceStore(storage, alice);
        alicePrefs.setPreferredName(worldId, region.id, 'Willow Village');
        assert(alicePrefs.getPreferredName(worldId, region.id) === 'Willow Village', 'Alice\'s local preference sticks');
        const bobPrefs = new LocalNamePreferenceStore(storage, bob);
        assert(bobPrefs.getPreferredName(worldId, region.id) === null, 'Bob has set no preference of his own, and Alice\'s never leaks to him');
        view = aliceUseCase.namingView(worldId, region.id);
        assert(view[0].name === 'Riverbend', 'the shared naming view is completely unaffected by anyone\'s local preference');

        // Bob retracts his claim; Carol's alone can no longer outrank
        // Alice's on shared score, but IS still tied, and the
        // deterministic tie-break applies.
        assert(bobUseCase.retract(worldId, bobClaim.id) === true, 'Bob retracts');
        view = aliceUseCase.namingView(worldId, region.id);
        assert(view.length === 2, `after retraction there should be 2 tied names, got ${view.length}`);
        assert(view[0].score === 1 && view[1].score === 1, 'both remaining names are now tied at score 1');
        assert(view[0].name === (aliceClaim.name < 'Riverbend' ? aliceClaim.name : 'Riverbend'), 'tie-break is alphabetical, deterministically, across replicas');

        // Every claim on file independently verifies — proof that
        // nothing about storage, retraction, or ranking ever touched a
        // signature.
        for (const claim of store.list(worldId)) {
            const result = verifier.verifyPlaceNamingClaim(claim.toJSON());
            assert(result.valid, `every remaining stored claim must still verify: ${result.reason}`);
        }
    }
    console.log('✓ Section H: CAPSTONE — independent disagreement, region immutability, local preference isolation, retraction, deterministic convergence');

    console.log('\nAll Place Naming Claims tests passed.');
}

await run();
