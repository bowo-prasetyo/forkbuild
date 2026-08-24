import { Structure } from '../core/Structure.js';
import { Brick } from '../core/Brick.js';
import { Position } from '../core/Position.js';
import {
    canonicalizeBlueprint, deriveBlueprintFingerprint, blueprintFingerprintsEqual, describeBlueprintFingerprint
} from '../core/BlueprintFingerprint.js';
import { BlueprintAttribution, getBlueprintAttributionSigningDescriptor } from '../core/BlueprintAttribution.js';
import { LocalIdentityProvider } from '../identity/LocalIdentityProvider.js';
import { LocalAuthorizationVerifier } from '../identity/LocalAuthorizationVerifier.js';
import { StorageProvider } from '../storage/StorageProvider.js';
import { LocalBlueprintAttributionStore } from '../application/LocalBlueprintAttributionStore.js';
import { BlueprintAttributionUseCase } from '../application/BlueprintAttributionUseCase.js';
import { buildBlueprintPackage } from '../application/BlueprintPackage.js';
import { ExportBlueprintUseCase } from '../application/ExportBlueprintUseCase.js';
import { ImportBlueprintUseCase } from '../application/ImportBlueprintUseCase.js';

// 0.6.5 — Blueprint Identity & Attribution.
//
// This flagship suite proves the exact architectural boundary the design
// conversation asked for:
//
//   local Structure identity   = Structure#id / Brick#id — regenerated
//                                 on every fork/import (0.4.6, UNCHANGED)
//   BlueprintFingerprint       = objective, derived DESIGN identity —
//                                 the SAME across every independent copy
//   BlueprintAttribution       = a subjective, REQUIRED-signature,
//                                 published assertion about who made it
//                                 — never a Structure mutation
//
// See docs/Principles.md, "A Blueprint Fingerprint Is Derived From
// Design Content, Never From Local Identity (0.6.5)" and "Attribution Is
// An External Assertion About A Fingerprint, Never Structure State
// (0.6.5)."

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

// Mirrors tests/PlaceNamingClaims.test.js's own makeIdentity() — one
// independent, authenticated LocalIdentityProvider standing in for one
// distinct identity.
function makeIdentity(label) {
    const provider = new LocalIdentityProvider(new InMemoryStorageProvider());
    const identity = provider.createLocalIdentity(label);
    provider.authenticate(identity.identityId);
    return provider;
}

function brick(definitionId, x, y, z, rotation = 0) {
    return new Brick({ definitionId, position: new Position(x, y, z), rotation });
}

function farmstead({ id = 'farmstead-1', name = 'Farmstead', category = 'Architecture', description = 'A cozy farmstead.', bricks } = {}) {
    return new Structure({
        id,
        name,
        category,
        description,
        bricks: bricks || [
            brick('core:wall_1x3', 0, 0, 0),
            brick('core:wall_1x3', 1, 0, 0, 90),
            brick('core:roof_hip', 0, 1, 0)
        ]
    });
}

async function run() {
    // -------------------------------------------------------------
    // Section A: core/BlueprintFingerprint.js — canonicalization & determinism
    // -------------------------------------------------------------
    {
        assert(canonicalizeBlueprint(null) === null, 'canonicalizeBlueprint(null) is null, never throws');
        assert(deriveBlueprintFingerprint(null) === null, 'deriveBlueprintFingerprint(null) is null, never throws');
        assert(deriveBlueprintFingerprint({}) === null, 'deriveBlueprintFingerprint() refuses a non-Structure duck-type');

        const a = farmstead({ id: 'A123' });
        const b = farmstead({ id: 'B987' }); // same content, different LOCAL Structure identity
        const fpA = deriveBlueprintFingerprint(a);
        const fpB = deriveBlueprintFingerprint(b);
        assert(typeof fpA === 'string' && fpA.startsWith('bp:'), 'fingerprint is a "bp:"-prefixed string');
        assert(blueprintFingerprintsEqual(fpA, fpB), 'identical design content fingerprints identically despite different Structure ids');

        // Brick ids never participate either.
        const c = farmstead({
            id: 'C555',
            bricks: [
                new Brick({ id: 'brick-x', definitionId: 'core:wall_1x3', position: new Position(0, 0, 0), rotation: 0 }),
                new Brick({ id: 'brick-y', definitionId: 'core:wall_1x3', position: new Position(1, 0, 0), rotation: 90 }),
                new Brick({ id: 'brick-z', definitionId: 'core:roof_hip', position: new Position(0, 1, 0), rotation: 0 })
            ]
        });
        assert(blueprintFingerprintsEqual(fpA, deriveBlueprintFingerprint(c)), 'brick ids never participate in the fingerprint');

        // Brick ORDER never matters.
        const reordered = farmstead({
            id: 'D111',
            bricks: [
                brick('core:roof_hip', 0, 1, 0),
                brick('core:wall_1x3', 1, 0, 0, 90),
                brick('core:wall_1x3', 0, 0, 0)
            ]
        });
        assert(blueprintFingerprintsEqual(fpA, deriveBlueprintFingerprint(reordered)), 'brick array order never affects the fingerprint');

        // Floating-point noise is absorbed.
        const noisy = farmstead({
            id: 'E222',
            bricks: [
                brick('core:wall_1x3', 0.0000001, -0, 0, 0),
                brick('core:wall_1x3', 0.9999999999999998, 0, 0, 90),
                brick('core:roof_hip', 0, 1.0000000000000002, 0)
            ]
        });
        assert(blueprintFingerprintsEqual(fpA, deriveBlueprintFingerprint(noisy)), 'sub-epsilon floating-point noise never changes the fingerprint');

        // Real geometric differences DO change it.
        const movedBrick = farmstead({ id: 'F333', bricks: [brick('core:wall_1x3', 5, 0, 0), brick('core:wall_1x3', 1, 0, 0, 90), brick('core:roof_hip', 0, 1, 0)] });
        assert(!blueprintFingerprintsEqual(fpA, deriveBlueprintFingerprint(movedBrick)), 'moving a brick changes the fingerprint');

        const rotatedBrick = farmstead({ id: 'G444', bricks: [brick('core:wall_1x3', 0, 0, 0), brick('core:wall_1x3', 1, 0, 0, 180), brick('core:roof_hip', 0, 1, 0)] });
        assert(!blueprintFingerprintsEqual(fpA, deriveBlueprintFingerprint(rotatedBrick)), 'rotating a brick changes the fingerprint');

        const differentDefinition = farmstead({ id: 'H555', bricks: [brick('core:wall_1x2', 0, 0, 0), brick('core:wall_1x3', 1, 0, 0, 90), brick('core:roof_hip', 0, 1, 0)] });
        assert(!blueprintFingerprintsEqual(fpA, deriveBlueprintFingerprint(differentDefinition)), 'a different brick definition changes the fingerprint');

        assert(!blueprintFingerprintsEqual(fpA, deriveBlueprintFingerprint(farmstead({ id: 'I666', name: 'Farmstead Deluxe' }))), 'a different name changes the fingerprint');
        assert(!blueprintFingerprintsEqual(fpA, deriveBlueprintFingerprint(farmstead({ id: 'J777', category: 'Agriculture' }))), 'a different category changes the fingerprint');
        assert(!blueprintFingerprintsEqual(fpA, deriveBlueprintFingerprint(farmstead({ id: 'K888', description: 'Something else entirely.' }))), 'a different description changes the fingerprint');

        // tags are deliberately excluded — see core/BlueprintFingerprint.js's own header.
        const withTags = new Structure({ id: 'L999', name: a.name, category: a.category, description: a.description, tags: ['unused', 'today'], bricks: a.bricks.map((br) => br.clone()) });
        assert(blueprintFingerprintsEqual(fpA, deriveBlueprintFingerprint(withTags)), 'tags never participate in the fingerprint (0.6.3 never gave them an authoring UI)');

        assert(blueprintFingerprintsEqual('bp:abc', 'bp:abc'), 'blueprintFingerprintsEqual: identical strings match');
        assert(!blueprintFingerprintsEqual(null, null), 'blueprintFingerprintsEqual: two nulls never "match" — no fingerprint is never proof of sameness');
        assert(describeBlueprintFingerprint(fpA).startsWith('bp:') && describeBlueprintFingerprint(fpA).length < fpA.length + 1, 'describeBlueprintFingerprint() is a short display form');
        assert(describeBlueprintFingerprint(null) === '', 'describeBlueprintFingerprint(null) is the empty string');
    }
    console.log('✓ Section A: core/BlueprintFingerprint.js — order/id-independent, noise-tolerant, sensitive to real design changes');

    // -------------------------------------------------------------
    // Section B: core/BlueprintAttribution.js — construction & validation
    // -------------------------------------------------------------
    {
        let threw = false;
        try { new BlueprintAttribution({ authorIdentityId: 'a1' }); } catch { threw = true; }
        assert(threw, 'BlueprintAttribution requires a fingerprint');

        threw = false;
        try { new BlueprintAttribution({ fingerprint: 'bp:abc' }); } catch { threw = true; }
        assert(threw, 'BlueprintAttribution requires an authorIdentityId');

        const attribution = new BlueprintAttribution({ fingerprint: 'bp:abc', authorIdentityId: 'a1' });
        assert(attribution.id, 'id auto-generated');
        assert(attribution.createdAt instanceof Date, 'createdAt defaults to now');

        const json = attribution.toJSON();
        assert(json.kind === 'forkbuild.blueprint-attribution', 'toJSON() carries a self-describing kind');
        assert(json.schemaVersion === 1, 'toJSON() carries a schemaVersion');
        const restored = BlueprintAttribution.fromJSON(json);
        assert(restored.id === attribution.id && restored.fingerprint === 'bp:abc' && restored.authorIdentityId === 'a1', 'fromJSON round-trip preserves identity');

        const descriptorFromInstance = attribution.getSigningDescriptor();
        const descriptorFromFreeFn = getBlueprintAttributionSigningDescriptor(attribution.toJSON());
        assert(JSON.stringify(descriptorFromInstance) === JSON.stringify(descriptorFromFreeFn), 'instance getSigningDescriptor() matches the standalone free function exactly');
        assert(BlueprintAttribution.fromJSON(null) === null, 'fromJSON(null) is null, never throws');
    }
    console.log('✓ Section B: core/BlueprintAttribution.js — construction, validation, signing descriptor parity');

    // -------------------------------------------------------------
    // Section C: identity/LocalAuthorizationVerifier.js#verifyBlueprintAttribution
    // -------------------------------------------------------------
    {
        const alice = makeIdentity('Alice');
        const bob = makeIdentity('Bob');
        const verifier = new LocalAuthorizationVerifier();

        let attribution = new BlueprintAttribution({ fingerprint: 'bp:abc', authorIdentityId: alice.getSigningIdentity().id });
        attribution = attribution.withSignature(alice.signCanonical(attribution.getSigningDescriptor()));

        const valid = verifier.verifyBlueprintAttribution(attribution.toJSON());
        assert(valid.valid === true, `a properly signed attribution should verify: ${valid.reason}`);

        const unsigned = verifier.verifyBlueprintAttribution({ ...attribution.toJSON(), signature: null });
        assert(unsigned.valid === false && unsigned.signed === false, 'an unsigned attribution must never verify');

        const tampered = verifier.verifyBlueprintAttribution({ ...attribution.toJSON(), fingerprint: 'bp:hacked' });
        assert(tampered.valid === false, 'a tampered attribution (fingerprint changed after signing) must fail verification');

        // Bob signs an attribution but attributes it to Alice's identity.
        let impostor = new BlueprintAttribution({ fingerprint: 'bp:abc', authorIdentityId: alice.getSigningIdentity().id });
        impostor = impostor.withSignature(bob.signCanonical(impostor.getSigningDescriptor()));
        assert(verifier.verifyBlueprintAttribution(impostor.toJSON()).valid === false, 'an attribution signed by someone other than its own authorIdentityId must fail');

        assert(verifier.verifyBlueprintAttribution(null).valid === false, 'verifyBlueprintAttribution(null) is false, never throws');
    }
    console.log('✓ Section C: identity/LocalAuthorizationVerifier.js#verifyBlueprintAttribution — required-signature discipline');

    // -------------------------------------------------------------
    // Section D: application/LocalBlueprintAttributionStore.js
    // -------------------------------------------------------------
    {
        const storage = new InMemoryStorageProvider();
        const store = new LocalBlueprintAttributionStore(storage);
        const alice = makeIdentity('Alice');
        const bob = makeIdentity('Bob');

        let a1 = new BlueprintAttribution({ fingerprint: 'bp:abc', authorIdentityId: alice.getSigningIdentity().id });
        a1 = a1.withSignature(alice.signCanonical(a1.getSigningDescriptor()));
        let a2 = new BlueprintAttribution({ fingerprint: 'bp:abc', authorIdentityId: bob.getSigningIdentity().id });
        a2 = a2.withSignature(bob.signCanonical(a2.getSigningDescriptor()));

        store.save(a1);
        store.save(a2);
        assert(store.list('bp:abc').length === 2, 'both attributions are on file for the fingerprint');
        assert(store.list('bp:other').length === 0, 'a different fingerprint has an independent, empty list');
        assert(store.has('bp:abc', a1.id) === true, 'has() finds a stored attribution by id');
        assert(store.has('bp:abc', 'never-existed') === false, 'has() is false for an unknown id');

        assert(store.retract('bp:abc', a1.id) === true, 'retract() returns true for an existing attribution');
        assert(store.list('bp:abc').length === 1, 'retracted attribution is gone');
        assert(store.retract('bp:abc', a1.id) === false, 'retract() is idempotent-false for an already-removed attribution');
    }
    console.log('✓ Section D: application/LocalBlueprintAttributionStore.js — per-fingerprint persistence, round-trip, retraction');

    // -------------------------------------------------------------
    // Section E: application/BlueprintAttributionUseCase.js — publish/retract/summarize
    // -------------------------------------------------------------
    {
        const storage = new InMemoryStorageProvider();
        const store = new LocalBlueprintAttributionStore(storage);
        const verifier = new LocalAuthorizationVerifier();
        const alice = makeIdentity('Alice');
        const bob = makeIdentity('Bob');
        const aliceUseCase = new BlueprintAttributionUseCase(store, alice, verifier);
        const bobUseCase = new BlueprintAttributionUseCase(store, bob, verifier);

        const structure = farmstead();
        const fingerprint = deriveBlueprintFingerprint(structure);

        const before = aliceUseCase.summarize(structure);
        assert(before.fingerprint === fingerprint, 'summarize() reports the structure\'s own derived fingerprint');
        assert(before.attributions.length === 0 && before.mine === null, 'a fresh design has no attributions yet');

        const published = aliceUseCase.publish(structure);
        assert(published.signature, 'publish() returns a signed attribution');
        assert(published.authorIdentityId === alice.getSigningIdentity().id, 'publish() stamps the CURRENT signed-in identity, never a caller-supplied one');
        assert(verifier.verifyBlueprintAttribution(published.toJSON()).valid, 'a use-case-published attribution verifies');

        const afterAlice = aliceUseCase.summarize(structure);
        assert(afterAlice.attributions.length === 1, 'summarize() sees the published attribution');
        assert(afterAlice.mine && afterAlice.mine.id === published.id, 'summarize() identifies Alice\'s OWN attribution as "mine" for Alice');

        const fromBob = bobUseCase.summarize(structure);
        assert(fromBob.attributions.length === 1, 'the SAME store shows the SAME attribution to a different identity');
        assert(fromBob.mine === null, 'Alice\'s attribution is never "mine" for Bob');

        bobUseCase.publish(structure);
        assert(aliceUseCase.summarize(structure).attributions.length === 2, 'two independent identities can both attribute the same design');

        // Bob cannot retract Alice's attribution.
        assert(bobUseCase.retract(fingerprint, published.id) === false, 'retract() must refuse a non-author');
        // Alice can retract her own.
        assert(aliceUseCase.retract(fingerprint, published.id) === true, 'retract() succeeds for the attribution\'s own author');
        assert(aliceUseCase.summarize(structure).attributions.length === 1, 'exactly the retracted attribution is gone');

        // A provider that cannot sign at all is refused, never silently unsigned.
        const noSignProvider = { currentUser: () => null, getSigningIdentity: () => { throw new Error('nope'); } };
        const brokenUseCase = new BlueprintAttributionUseCase(store, noSignProvider, verifier);
        let threw = false;
        try { brokenUseCase.publish(structure); } catch { threw = true; }
        assert(threw, 'publish() must throw rather than silently store an unsigned attribution when nobody is signed in');

        threw = false;
        try { aliceUseCase.publish(null); } catch { threw = true; }
        assert(threw, 'publish() must throw for a structure with no derivable design content');

        assert(aliceUseCase.summarize(null).fingerprint === null, 'summarize(null) degrades to an empty, non-throwing summary');
    }
    console.log('✓ Section E: application/BlueprintAttributionUseCase.js — required signing, author-only retraction, summarize()');

    // -------------------------------------------------------------
    // Section F — CAPSTONE: Alice exports; Bob imports under a fresh id;
    // both still resolve to the SAME design identity.
    // -------------------------------------------------------------
    {
        const storage = new InMemoryStorageProvider();
        const store = new LocalBlueprintAttributionStore(storage);
        const verifier = new LocalAuthorizationVerifier();
        const alice = makeIdentity('Alice');
        const bob = makeIdentity('Bob');
        const aliceUseCase = new BlueprintAttributionUseCase(store, alice, verifier);
        const bobUseCase = new BlueprintAttributionUseCase(store, bob, verifier);

        // Alice authors "Farmstead" and claims authorship of it.
        const aliceStructure = farmstead({ id: 'alice-local-id' });
        const aliceAttribution = aliceUseCase.publish(aliceStructure);

        // Alice exports it — the exact 0.4.6 portable package, unchanged.
        const pkg = new ExportBlueprintUseCase().execute(aliceStructure);
        assert(JSON.stringify(pkg) === JSON.stringify(buildBlueprintPackage(aliceStructure)), 'ExportBlueprintUseCase delegates straight to buildBlueprintPackage(), unchanged by this milestone');

        // Bob imports it — 0.4.6's own "every id crossing a boundary
        // regenerates" rule mints Bob a BRAND NEW Structure id and fresh
        // brick ids.
        const bobStructure = new ImportBlueprintUseCase().execute(pkg);
        assert(bobStructure.id !== aliceStructure.id, 'Bob\'s imported Structure has its own, independent local id');
        assert(bobStructure.bricks.every((b, i) => b.id !== aliceStructure.bricks[i].id), 'every imported brick has its own, independent local id');

        // Yet the BLUEPRINT FINGERPRINT — the design identity — matches.
        const aliceFingerprint = deriveBlueprintFingerprint(aliceStructure);
        const bobFingerprint = deriveBlueprintFingerprint(bobStructure);
        assert(blueprintFingerprintsEqual(aliceFingerprint, bobFingerprint), 'Bob\'s import fingerprints IDENTICALLY to Alice\'s original, despite fully independent local ids');
        assert(aliceFingerprint === aliceAttribution.fingerprint, 'the attribution Alice already published is for THIS exact design');

        // Bob did not author it, but nothing stops him from claiming he
        // did — this layer establishes what a claim MEANS, not whether
        // it is true (see application/BlueprintAttributionUseCase.js's
        // own header). What it DOES let a future reader do is see that
        // two DIFFERENT identities both signed an attribution for the
        // exact same design.
        const bobAttribution = bobUseCase.publish(bobStructure);
        assert(bobAttribution.fingerprint === aliceAttribution.fingerprint, 'Bob\'s own attribution is for the SAME fingerprint as Alice\'s, despite starting from a completely independent Structure instance');

        const summaryFromBob = bobUseCase.summarize(bobStructure);
        assert(summaryFromBob.attributions.length === 2, '"Community" reads as 2 known authors for this design');
        assert(summaryFromBob.mine.id === bobAttribution.id, 'Bob sees his OWN attribution as "mine"');

        const summaryFromAlice = aliceUseCase.summarize(aliceStructure);
        assert(summaryFromAlice.attributions.length === 2, 'Alice sees the exact same 2 attributions — same fingerprint, same store');
        assert(summaryFromAlice.mine.id === aliceAttribution.id, 'Alice still sees HER OWN attribution as "mine", not Bob\'s');

        // Placing/modifying Bob's copy never touches Alice's attribution,
        // or Alice's own Structure — exactly the same independence
        // 0.4.6's own flagship test already proves for the bricks
        // themselves, now extended to attribution.
        bobStructure.bricks[0].position = new Position(99, 99, 99);
        assert(deriveBlueprintFingerprint(aliceStructure) === aliceFingerprint, 'mutating Bob\'s copy never changes Alice\'s own fingerprint');
        assert(store.list(aliceFingerprint).length === 2, 'Alice\'s and Bob\'s already-published attributions are untouched by Bob\'s later edit');

        // And a genuinely different design — not merely a different
        // instance — gets its own, independent identity and its own,
        // independent, empty attribution list.
        const differentStructure = farmstead({ id: 'unrelated', name: 'Barn' });
        const differentFingerprint = deriveBlueprintFingerprint(differentStructure);
        assert(!blueprintFingerprintsEqual(differentFingerprint, aliceFingerprint), 'a genuinely different design gets a different fingerprint');
        assert(store.list(differentFingerprint).length === 0, 'an unrelated design has no attributions of its own');
    }
    console.log('✓ Section F: CAPSTONE — export/import independence (0.4.6) composed with fingerprint identity and multi-author attribution (0.6.5)');

    console.log('\nAll Blueprint Identity & Attribution tests passed.');
}

await run();
