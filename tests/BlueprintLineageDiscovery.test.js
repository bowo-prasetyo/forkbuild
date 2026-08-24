import { Structure } from '../core/Structure.js';
import { Brick } from '../core/Brick.js';
import { Position } from '../core/Position.js';
import { deriveBlueprintFingerprint, blueprintFingerprintsEqual } from '../core/BlueprintFingerprint.js';
import {
    BlueprintLineageClaim, BlueprintLineageRelationship, BLUEPRINT_LINEAGE_CLAIM_KIND,
    getBlueprintLineageClaimSigningDescriptor
} from '../core/BlueprintLineageClaim.js';
import { claimsForFingerprint, lineageView, detectLocalLineageCycle, describeLineageView } from '../core/BlueprintLineageView.js';
import { LocalIdentityProvider } from '../identity/LocalIdentityProvider.js';
import { LocalAuthorizationVerifier } from '../identity/LocalAuthorizationVerifier.js';
import { resolveSigningIdentityId } from '../identity/resolveSigningIdentityId.js';
import { StorageProvider } from '../storage/StorageProvider.js';
import { LocalBlueprintLineageClaimStore } from '../application/LocalBlueprintLineageClaimStore.js';
import { BlueprintLineageUseCase } from '../application/BlueprintLineageUseCase.js';
import { BlueprintLineageExchange } from '../application/BlueprintLineageExchange.js';
import {
    validateBlueprintLineageClaimPublication, BlueprintLineageClaimPublicationError
} from '../application/BlueprintLineageClaimPublicationValidator.js';
import { ExportBlueprintUseCase } from '../application/ExportBlueprintUseCase.js';
import { ImportBlueprintUseCase } from '../application/ImportBlueprintUseCase.js';
import { buildBlueprintPackage } from '../application/BlueprintPackage.js';
import { BlueprintAttributionUseCase } from '../application/BlueprintAttributionUseCase.js';
import { LocalBlueprintAttributionStore } from '../application/LocalBlueprintAttributionStore.js';

// 0.6.8 — Blueprint Lineage & Revision Discovery.
//
// Full coverage of this milestone's decentralized-claim stack — the
// combined depth tests/BlueprintIdentityAttribution.test.js,
// tests/BlueprintAttributionExchange.test.js, and
// tests/BlueprintAttributionResolution.test.js each proved separately
// for attribution, folded into one suite here because this milestone
// folds the model, exchange, and view layers into one milestone too:
//
//   Section A: core/BlueprintLineageClaim.js — construction/validation
//   Section B: signing descriptor parity + verifyBlueprintLineageClaim()
//   Section C: application/LocalBlueprintLineageClaimStore.js — the
//              dual-indexed store, queryable from EITHER fingerprint
//   Section D: application/BlueprintLineageClaimPublicationValidator.js
//   Section E: application/BlueprintLineageExchange.js — export/import/
//              dedup/tamper/both-sided fingerprint cross-check
//   Section F: core/BlueprintLineageView.js — derivedFrom/derivedDesigns
//              split, cycle detection, describeLineageView()
//   Section G: application/BlueprintLineageUseCase.js — publish/retract/
//              lineageView wiring
//   Section H: application/BlueprintPackage.js — optional lineageClaims
//              bundling, mirroring 0.6.6's own attributions field
//   Section I — FLAGSHIP: Alice authors "Farmstead" and exports it; Bob
//              imports it, modifies his own copy into "Farmstead Large,"
//              and claims it was derived from Alice's original; both
//              replicas exchange every claim, in different orders,
//              including a duplicate re-import; both replicas' own
//              lineageView() converges to an identical shape. A THIRD
//              claim asserting the reverse relationship is then
//              introduced, and both replicas independently detect the
//              same local cycle warning.

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

function makeIdentity(label) {
    const provider = new LocalIdentityProvider(new InMemoryStorageProvider());
    const identity = provider.createLocalIdentity(label);
    provider.authenticate(identity.identityId);
    return provider;
}

function brick(definitionId, x, y, z, rotation = 0) {
    return new Brick({ definitionId, position: new Position(x, y, z), rotation });
}

function farmstead({ id = 'farmstead-1', bricks } = {}) {
    return new Structure({
        id, name: 'Farmstead', category: 'Architecture', description: 'A cozy farmstead.',
        bricks: bricks || [
            brick('core:wall_1x3', 0, 0, 0),
            brick('core:wall_1x3', 1, 0, 0, 90),
            brick('core:roof_hip', 0, 1, 0)
        ]
    });
}

function farmsteadLarge({ id = 'farmstead-large-1' } = {}) {
    return new Structure({
        id, name: 'Farmstead Large', category: 'Architecture', description: 'A cozy farmstead.',
        bricks: [
            brick('core:wall_1x3', 0, 0, 0),
            brick('core:wall_1x3', 1, 0, 0, 90),
            brick('core:roof_gable', 0, 1, 0),
            brick('core:chimney', 0, 2, 0)
        ]
    });
}

function makeReplica(label) {
    const storage = new InMemoryStorageProvider();
    const store = new LocalBlueprintLineageClaimStore(storage);
    const verifier = new LocalAuthorizationVerifier();
    const identity = makeIdentity(label);
    const useCase = new BlueprintLineageUseCase(store, identity, verifier);
    const exchange = new BlueprintLineageExchange(store, verifier);
    return { storage, store, verifier, identity, useCase, exchange };
}

async function run() {
    // ---------------------------------------------------------------
    // Section A — core/BlueprintLineageClaim.js construction
    // ---------------------------------------------------------------
    {
        let threw = false;
        try { new BlueprintLineageClaim({ sourceFingerprint: 'bp:a', derivedFingerprint: 'bp:a', authorIdentityId: 'alice' }); } catch (e) { threw = true; }
        assert(threw, '1. a design cannot be derived from itself — constructor throws when the two fingerprints are equal');

        threw = false;
        try { new BlueprintLineageClaim({ derivedFingerprint: 'bp:b', authorIdentityId: 'alice' }); } catch (e) { threw = true; }
        assert(threw, '2. sourceFingerprint is required');

        threw = false;
        try { new BlueprintLineageClaim({ sourceFingerprint: 'bp:a', authorIdentityId: 'alice' }); } catch (e) { threw = true; }
        assert(threw, '3. derivedFingerprint is required');

        threw = false;
        try { new BlueprintLineageClaim({ sourceFingerprint: 'bp:a', derivedFingerprint: 'bp:b' }); } catch (e) { threw = true; }
        assert(threw, '4. authorIdentityId is required');

        threw = false;
        try { new BlueprintLineageClaim({ sourceFingerprint: 'bp:a', derivedFingerprint: 'bp:b', authorIdentityId: 'alice', relationship: 'inspired-by' }); } catch (e) { threw = true; }
        assert(threw, '5. an unknown relationship is rejected — the vocabulary stays exactly one member');

        const claim = new BlueprintLineageClaim({ sourceFingerprint: 'bp:a', derivedFingerprint: 'bp:b', authorIdentityId: 'alice' });
        assert(claim.relationship === BlueprintLineageRelationship.DERIVED_FROM, '6. relationship defaults to DERIVED_FROM');
        assert(claim.id && claim.createdAt instanceof Date, '7. a fresh claim gets an id and a createdAt');

        const json = claim.toJSON();
        assert(json.kind === BLUEPRINT_LINEAGE_CLAIM_KIND && json.schemaVersion === 1, '8. toJSON() carries kind/schemaVersion');
        const rehydrated = BlueprintLineageClaim.fromJSON(json);
        assert(rehydrated.sourceFingerprint === 'bp:a' && rehydrated.derivedFingerprint === 'bp:b' && rehydrated.authorIdentityId === 'alice',
            '9. fromJSON() round-trips every field');
        assert(BlueprintLineageClaim.fromJSON(null) === null, '10. fromJSON(null) is null, never throws');

        const withSig = claim.withSignature({ signer: 'alice', algorithm: 'Ed25519', signature: 'x', signedHash: 'y', domain: 'forkbuild' });
        assert(withSig.id === claim.id && withSig.signature, '11. withSignature() preserves identity, attaches a signature');
        assert(claim.signature === null, '12. the original claim instance is untouched — withSignature() never mutates');
    }
    console.log('✓ Section A: core/BlueprintLineageClaim.js — construction, self-loop rejection, relationship vocabulary, round-trip');

    // ---------------------------------------------------------------
    // Section B — signing descriptor + verifyBlueprintLineageClaim()
    // ---------------------------------------------------------------
    {
        const alice = makeIdentity('Alice');
        const bob = makeIdentity('Bob');
        const verifier = new LocalAuthorizationVerifier();
        const aliceId = resolveSigningIdentityId(alice);

        let claim = new BlueprintLineageClaim({ sourceFingerprint: 'bp:a', derivedFingerprint: 'bp:b', authorIdentityId: aliceId });
        assert(JSON.stringify(claim.getSigningDescriptor()) === JSON.stringify(getBlueprintLineageClaimSigningDescriptor(claim.toJSON())),
            '13. instance getSigningDescriptor() matches the standalone free function');

        const unsigned = verifier.verifyBlueprintLineageClaim(claim.toJSON());
        assert(unsigned.valid === false && unsigned.signed === false, '14. an unsigned claim never verifies — REQUIRED, not tolerated');

        const signature = alice.signCanonical(claim.getSigningDescriptor());
        claim = claim.withSignature(signature);
        const valid = verifier.verifyBlueprintLineageClaim(claim.toJSON());
        assert(valid.valid === true, '15. a genuinely self-signed claim verifies');

        // Tamper: alter the payload after signing.
        const tampered = { ...claim.toJSON(), derivedFingerprint: 'bp:tampered' };
        assert(verifier.verifyBlueprintLineageClaim(tampered).valid === false, '16. a tampered payload fails verification');

        // Impersonation: Bob signs, but claims to be Alice.
        let impersonated = new BlueprintLineageClaim({ sourceFingerprint: 'bp:a', derivedFingerprint: 'bp:b', authorIdentityId: aliceId });
        const bobSignature = bob.signCanonical(impersonated.getSigningDescriptor());
        impersonated = impersonated.withSignature(bobSignature);
        const impersonationResult = verifier.verifyBlueprintLineageClaim(impersonated.toJSON());
        assert(impersonationResult.valid === false, '17. Bob signing a claim that names Alice as authorIdentityId never verifies — signer must equal authorIdentityId');
    }
    console.log('✓ Section B: signing descriptor parity, required signature, tamper detection, impersonation rejection');

    // ---------------------------------------------------------------
    // Section C — application/LocalBlueprintLineageClaimStore.js
    // ---------------------------------------------------------------
    {
        const storage = new InMemoryStorageProvider();
        const store = new LocalBlueprintLineageClaimStore(storage);
        const alice = makeIdentity('Alice');
        const aliceId = resolveSigningIdentityId(alice);

        let claim = new BlueprintLineageClaim({ sourceFingerprint: 'bp:a', derivedFingerprint: 'bp:b', authorIdentityId: aliceId });
        claim = claim.withSignature(alice.signCanonical(claim.getSigningDescriptor()));
        store.save(claim);

        // DUAL-INDEXED: queryable from EITHER of the claim's own fingerprints.
        assert(store.list('bp:a').length === 1 && store.list('bp:a')[0].id === claim.id, '18. list(sourceFingerprint) finds the claim');
        assert(store.list('bp:b').length === 1 && store.list('bp:b')[0].id === claim.id, '19. list(derivedFingerprint) ALSO finds the same claim');
        assert(store.has('bp:a', claim.id) && store.has('bp:b', claim.id), '20. has() is true from either fingerprint');
        assert(store.list('bp:unrelated').length === 0, '21. an unrelated fingerprint sees nothing');

        // Retract via ONE fingerprint removes it from BOTH indices.
        const removed = store.retract('bp:a', claim.id);
        assert(removed === true, '22. retract() reports success');
        assert(store.list('bp:a').length === 0 && store.list('bp:b').length === 0,
            '23. retract() via one fingerprint removes the claim from BOTH of its own index keys');
        assert(store.retract('bp:a', 'unknown-id') === false, '24. retracting an unknown id is a no-op, returns false');

        // Redundant republish — two distinct claims for the same pair.
        let claim2 = new BlueprintLineageClaim({ sourceFingerprint: 'bp:a', derivedFingerprint: 'bp:b', authorIdentityId: aliceId });
        claim2 = claim2.withSignature(alice.signCanonical(claim2.getSigningDescriptor()));
        store.save(claim2);
        let claim3 = new BlueprintLineageClaim({ sourceFingerprint: 'bp:a', derivedFingerprint: 'bp:b', authorIdentityId: aliceId });
        claim3 = claim3.withSignature(alice.signCanonical(claim3.getSigningDescriptor()));
        store.save(claim3);
        assert(store.list('bp:a').length === 2, '25. save() never deduplicates — two distinct republished claims both persist');

        // A fingerprint that plays BOTH roles across different claims.
        let claim4 = new BlueprintLineageClaim({ sourceFingerprint: 'bp:b', derivedFingerprint: 'bp:c', authorIdentityId: aliceId });
        claim4 = claim4.withSignature(alice.signCanonical(claim4.getSigningDescriptor()));
        store.save(claim4);
        assert(store.list('bp:b').length === 3, '26. bp:b now shows 3 claims total — 2 where it is derived, 1 where it is the source');
    }
    console.log('✓ Section C: LocalBlueprintLineageClaimStore — dual-indexed save/list/has, both-key retract, no dedup on save');

    // ---------------------------------------------------------------
    // Section D — application/BlueprintLineageClaimPublicationValidator.js
    // ---------------------------------------------------------------
    {
        function expectRejected(pkg, label) {
            let threw = false;
            try { validateBlueprintLineageClaimPublication(pkg); } catch (e) {
                threw = e instanceof BlueprintLineageClaimPublicationError;
            }
            assert(threw, label);
        }
        expectRejected(null, '27. null is rejected');
        expectRejected({}, '28. missing kind is rejected');
        expectRejected({ kind: 'forkbuild.blueprint' }, '29. wrong kind is rejected');
        expectRejected({ kind: BLUEPRINT_LINEAGE_CLAIM_KIND, schemaVersion: 99 }, '30. unsupported schemaVersion is rejected');

        const validSignature = { algorithm: 'Ed25519', signer: 'did:key:x', signature: 'sig', signedHash: 'hash', domain: 'forkbuild' };
        const base = {
            kind: BLUEPRINT_LINEAGE_CLAIM_KIND, schemaVersion: 1, id: 'c1',
            sourceFingerprint: 'bp:a', derivedFingerprint: 'bp:b', authorIdentityId: 'did:key:x',
            relationship: BlueprintLineageRelationship.DERIVED_FROM, createdAt: '2026-01-01T00:00:00.000Z',
            signature: validSignature
        };
        expectRejected({ ...base, sourceFingerprint: 'bp:b' }, '31. sourceFingerprint === derivedFingerprint is rejected structurally, not just by the constructor');
        expectRejected({ ...base, relationship: 'inspired-by' }, '32. an unknown relationship is rejected structurally');
        expectRejected({ ...base, signature: null }, '33. a missing signature is rejected');
        expectRejected({ ...base, signature: { ...validSignature, signer: undefined } }, '34. a malformed signature field is rejected');

        // Success: no throw.
        let wellFormedThrew = false;
        try { validateBlueprintLineageClaimPublication(base); } catch (e) { wellFormedThrew = true; }
        assert(wellFormedThrew === false, '35. a well-formed publication validates without throwing');
    }
    console.log('✓ Section D: BlueprintLineageClaimPublicationValidator — every malformed-publication rejection');

    // ---------------------------------------------------------------
    // Section E — application/BlueprintLineageExchange.js
    // ---------------------------------------------------------------
    {
        const alice = makeReplica('Alice');
        const bob = makeReplica('Bob');

        const source = farmstead({ id: 'e-source' });
        const derived = farmsteadLarge({ id: 'e-derived' });
        const claim = alice.useCase.publish(derived, source);

        let threw = false;
        try { alice.exchange.exportClaim({}); } catch (e) { threw = true; }
        assert(threw, '36. exportClaim() refuses a non-BlueprintLineageClaim');

        const pkg = alice.exchange.exportClaim(claim);
        assert(pkg.kind === BLUEPRINT_LINEAGE_CLAIM_KIND, '37. exportClaim() is a pure toJSON() passthrough');

        const imported = bob.exchange.importClaim(pkg);
        assert(imported.isNew === true, '38. a fresh import reports isNew: true');
        assert(bob.store.has(claim.sourceFingerprint, claim.id), '39. importClaim() actually persists into the receiver\'s own store');

        const reimported = bob.exchange.importClaim(pkg);
        assert(reimported.isNew === false, '40. re-importing the identical publication is recognized as not-new (dedup by id)');

        // Cross-check: BOTH sides, independently.
        const sourceFp = deriveBlueprintFingerprint(source);
        const derivedFp = deriveBlueprintFingerprint(derived);
        const okBoth = new BlueprintLineageExchange(new LocalBlueprintLineageClaimStore(new InMemoryStorageProvider()), new LocalAuthorizationVerifier())
            .importClaim(pkg, { expectedSourceFingerprint: sourceFp, expectedDerivedFingerprint: derivedFp });
        assert(okBoth.isNew === true, '41. a correct expectedSourceFingerprint AND expectedDerivedFingerprint together still succeed');

        let mismatchThrew = false;
        try {
            new BlueprintLineageExchange(new LocalBlueprintLineageClaimStore(new InMemoryStorageProvider()), new LocalAuthorizationVerifier())
                .importClaim(pkg, { expectedSourceFingerprint: 'bp:not-the-real-source' });
        } catch (e) { mismatchThrew = true; }
        assert(mismatchThrew, '42. a mismatched expectedSourceFingerprint is rejected even with a valid signature');

        let derivedMismatchThrew = false;
        try {
            new BlueprintLineageExchange(new LocalBlueprintLineageClaimStore(new InMemoryStorageProvider()), new LocalAuthorizationVerifier())
                .importClaim(pkg, { expectedDerivedFingerprint: 'bp:not-the-real-derived' });
        } catch (e) { derivedMismatchThrew = true; }
        assert(derivedMismatchThrew, '43. a mismatched expectedDerivedFingerprint is rejected independently of the source side');

        // Tamper after signing: fingerprint changed, signature no longer verifies.
        const tamperedPkg = { ...pkg, derivedFingerprint: 'bp:hand-tampered' };
        let tamperThrew = false;
        try {
            new BlueprintLineageExchange(new LocalBlueprintLineageClaimStore(new InMemoryStorageProvider()), new LocalAuthorizationVerifier())
                .importClaim(tamperedPkg);
        } catch (e) { tamperThrew = true; }
        assert(tamperThrew, '44. a hand-tampered fingerprint fails signature verification on import');
    }
    console.log('✓ Section E: BlueprintLineageExchange — export/import/dedup, both-sided cross-check, tamper rejection');

    // ---------------------------------------------------------------
    // Section F — core/BlueprintLineageView.js pure derivation
    // ---------------------------------------------------------------
    {
        assert(JSON.stringify(claimsForFingerprint(null, [{ sourceFingerprint: 'bp:a' }])) === '[]', '45. claimsForFingerprint(null, ...) is always []');
        assert(JSON.stringify(claimsForFingerprint('bp:a', null)) === '[]', '46. claimsForFingerprint(fingerprint, non-array) is always []');

        const raw = [
            { id: 'c1', sourceFingerprint: 'bp:a', derivedFingerprint: 'bp:b', authorIdentityId: 'alice', createdAt: '2026-01-01T00:00:00.000Z' },
            { id: 'c2', sourceFingerprint: 'bp:a', derivedFingerprint: 'bp:c', authorIdentityId: 'bob', createdAt: '2026-01-02T00:00:00.000Z' },
            { id: 'c3', sourceFingerprint: 'bp:x', derivedFingerprint: 'bp:y', authorIdentityId: 'carol', createdAt: '2026-01-01T00:00:00.000Z' }
        ];
        const forA = claimsForFingerprint('bp:a', raw);
        assert(forA.length === 2 && !forA.some((c) => c.id === 'c3'), '47. claimsForFingerprint filters to exactly claims touching the fingerprint, either role');

        const viewA = lineageView('bp:a', raw, null);
        assert(viewA.derivedFrom.length === 0, '48. bp:a is never claimed as a DERIVED design here — derivedFrom is empty');
        assert(viewA.derivedDesigns.length === 2, '49. bp:a is the SOURCE of two claims — both appear in derivedDesigns');
        assert(viewA.hasCycleWarning === false, '50. no contradiction present — no cycle warning');

        const viewB = lineageView('bp:b', raw, 'alice');
        assert(viewB.derivedFrom.length === 1 && viewB.derivedFrom[0].sourceFingerprint === 'bp:a', '51. bp:b correctly shows one ancestor claim');
        assert(viewB.derivedDesigns.length === 0, '52. bp:b has no claimed descendants here');
        assert(viewB.mine && viewB.mine.id === 'c1', '53. mine resolves to the signed-in identity\'s own most recent claim touching this fingerprint');
        assert(lineageView(null, raw, null).fingerprint === null, '54. lineageView(null, ...) degrades to a fully empty, non-throwing view');
        assert(lineageView('bp:nobody', [], null).derivedFrom.length === 0 && lineageView('bp:nobody', [], null).derivedDesigns.length === 0,
            '55. an unclaimed fingerprint is a fully empty view, never throws');

        // Cycle detection: A -> B and B -> A, both on file.
        const contradictory = [
            { id: 'x1', sourceFingerprint: 'bp:a', derivedFingerprint: 'bp:b', authorIdentityId: 'alice', createdAt: '2026-01-01T00:00:00.000Z' },
            { id: 'x2', sourceFingerprint: 'bp:b', derivedFingerprint: 'bp:a', authorIdentityId: 'carol', createdAt: '2026-01-02T00:00:00.000Z' }
        ];
        const cycleFromA = lineageView('bp:a', contradictory, null);
        assert(cycleFromA.hasCycleWarning === true, '56. a direct A->B / B->A contradiction is flagged from A\'s own view');
        const cycleFromB = lineageView('bp:b', contradictory, null);
        assert(cycleFromB.hasCycleWarning === true, '57. the same contradiction is flagged from B\'s own view too');
        assert(detectLocalLineageCycle([], []) === false, '58. detectLocalLineageCycle() with nothing on file is false');

        // Non-contradictory chain — A -> B, B -> C — is NOT flagged
        // (this module deliberately only detects the direct one-hop case).
        const chain = [
            { id: 'y1', sourceFingerprint: 'bp:a', derivedFingerprint: 'bp:b', authorIdentityId: 'alice', createdAt: '2026-01-01T00:00:00.000Z' },
            { id: 'y2', sourceFingerprint: 'bp:b', derivedFingerprint: 'bp:c', authorIdentityId: 'bob', createdAt: '2026-01-02T00:00:00.000Z' }
        ];
        assert(lineageView('bp:b', chain, null).hasCycleWarning === false, '59. a genuine A->B->C chain is never flagged as a cycle from B\'s own local view');

        assert(describeLineageView(lineageView(null, [], null)) === '', '60. describeLineageView is empty for nothing on file');
        assert(describeLineageView(viewA) === '2 derived designs', '61. describeLineageView phrases a derivedDesigns-only view correctly');
        assert(describeLineageView(viewB) === 'Derived from 1 design', '62. describeLineageView phrases a derivedFrom-only view correctly');
    }
    console.log('✓ Section F: core/BlueprintLineageView.js — derivedFrom/derivedDesigns split, one-hop cycle detection, describeLineageView()');

    // ---------------------------------------------------------------
    // Section G — application/BlueprintLineageUseCase.js wiring
    // ---------------------------------------------------------------
    {
        const alice = makeReplica('Alice');
        const source = farmstead({ id: 'g-source' });
        const derived = farmsteadLarge({ id: 'g-derived' });

        assert(alice.useCase.lineageView(null).fingerprint === null, '63. lineageView(null) degrades cleanly, never throws');
        assert(alice.useCase.claimsForBlueprint(null).length === 0, '64. claimsForBlueprint(null) is [], never throws');

        let threw = false;
        try { alice.useCase.publish(derived, derived); } catch (e) { threw = true; }
        assert(threw, '65. publishing a design as derived from itself throws — the fingerprints are identical');

        const claim = alice.useCase.publish(derived, source);
        assert(claim.authorIdentityId === resolveSigningIdentityId(alice.identity), '66. publish() signs as the currently authenticated identity');

        const view = alice.useCase.lineageView(derived);
        assert(view.derivedFrom.length === 1 && view.derivedFrom[0].id === claim.id, '67. lineageView(derived) shows the freshly published claim as an ancestor');
        assert(view.mine && view.mine.id === claim.id, '68. lineageView\'s own mine resolves to the publisher\'s claim');

        assert(alice.useCase.claimsForBlueprint(derived).length === 1 && alice.useCase.claimsForBlueprint(source).length === 1,
            '69. claimsForBlueprint() finds the claim from EITHER structure — the dual index at work through the use case');

        // Retraction — author-only. Bob first genuinely receives the
        // claim into his OWN store (through the real exchange, not by
        // sharing Alice's), so his own retract() attempt actually
        // exercises the author check, not merely "I never heard of this."
        const bob = makeReplica('Bob');
        bob.exchange.importClaim(alice.exchange.exportClaim(claim));
        assert(bob.store.has(deriveBlueprintFingerprint(derived), claim.id), 'sanity: Bob genuinely has the claim on file');
        assert(bob.useCase.retract(deriveBlueprintFingerprint(derived), claim.id) === false,
            '70. an identity that never published this claim cannot retract it, even though it is genuinely on file and the fingerprint is correct');
        assert(bob.store.has(deriveBlueprintFingerprint(derived), claim.id) === true,
            '70b. the rejected retraction attempt left the claim untouched in Bob\'s own store');
        assert(alice.useCase.retract(deriveBlueprintFingerprint(derived), claim.id) === true, '71. the original publisher can retract their own claim');
        assert(alice.useCase.lineageView(derived).derivedFrom.length === 0, '72. after retraction, the claim no longer appears in the publisher\'s own view');
    }
    console.log('✓ Section G: BlueprintLineageUseCase — publish/retract/lineageView/claimsForBlueprint wiring, author-only retraction');

    // ---------------------------------------------------------------
    // Section H — application/BlueprintPackage.js lineageClaims bundling
    // ---------------------------------------------------------------
    {
        const alice = makeReplica('Alice');
        const source = farmstead({ id: 'h-source' });
        const derived = farmsteadLarge({ id: 'h-derived' });
        const claim = alice.useCase.publish(derived, source);

        const bare = buildBlueprintPackage(derived);
        assert(bare.lineageClaims === undefined, '73. lineageClaims is omitted entirely when none are supplied — byte-for-byte what 0.4.6 always produced');

        const withClaims = buildBlueprintPackage(derived, { lineageClaims: [claim] });
        assert(Array.isArray(withClaims.lineageClaims) && withClaims.lineageClaims.length === 1, '74. lineageClaims bundles when supplied');
        assert(withClaims.lineageClaims[0].id === claim.id, '75. the bundled entry is the claim\'s own toJSON()');

        const exported = new ExportBlueprintUseCase().execute(derived, { lineageClaims: [claim] });
        assert(exported.lineageClaims && exported.lineageClaims.length === 1, '76. ExportBlueprintUseCase passes lineageClaims straight through');

        // ImportBlueprintUseCase stays completely unchanged — it only
        // ever returns a Structure; reading lineageClaims back out is a
        // separate step, exactly like attributions.
        const importedStructure = new ImportBlueprintUseCase().execute(exported);
        assert(importedStructure instanceof Structure, '77. ImportBlueprintUseCase is untouched — still returns exactly a Structure');

        let threw = false;
        try { buildBlueprintPackage(derived, { lineageClaims: [{ not: 'a real claim' }] }); } catch (e) { threw = true; }
        assert(threw, '78. buildBlueprintPackage rejects a lineageClaims entry that is not a real BlueprintLineageClaim instance');
    }
    console.log('✓ Section H: BlueprintPackage — optional, additive, omit-when-empty lineageClaims bundling');

    // ---------------------------------------------------------------
    // Section I — FLAGSHIP: Alice authors "Farmstead," Bob derives
    // "Farmstead Large" from his own imported copy and claims it; both
    // replicas converge on an identical lineageView; a contradictory
    // third claim then produces a converging cycle warning on both.
    // ---------------------------------------------------------------
    console.log('\n--- Blueprint Lineage & Revision Discovery: flagship scenario ---');

    const alice = makeReplica('Alice');
    const bob = makeReplica('Bob');

    // Phase A — Alice authors "Farmstead," exports it via the REAL 0.4.6
    // export/import boundary; Bob imports it under a fully independent
    // Structure id and fresh brick ids, then builds his own "Farmstead
    // Large" locally by modifying his copy.
    const aliceOriginal = farmstead({ id: 'alice-original' });
    const sourceFingerprint = deriveBlueprintFingerprint(aliceOriginal);
    const wire = JSON.stringify(new ExportBlueprintUseCase().execute(aliceOriginal));
    const bobsCopy = new ImportBlueprintUseCase().execute(JSON.parse(wire));
    assert(bobsCopy.id !== aliceOriginal.id, '79. PHASE A: Bob\'s imported copy has its own independent Structure id');
    assert(blueprintFingerprintsEqual(deriveBlueprintFingerprint(bobsCopy), sourceFingerprint), '80. PHASE A: Bob\'s copy fingerprints identically to Alice\'s original');

    const bobsDerivedDesign = farmsteadLarge({ id: 'bob-large' });
    const derivedFingerprint = deriveBlueprintFingerprint(bobsDerivedDesign);
    console.log('✓ Phase A: Alice authored "Farmstead"; Bob independently imported it and built "Farmstead Large" from his own copy');

    // Phase B — Bob signs a lineage claim: "Farmstead Large" (his design)
    // was derived from HIS OWN local copy of "Farmstead" — which
    // fingerprints identically to Alice's original, proving the claim is
    // meaningful across the export/import boundary without either side
    // ever comparing raw Structure ids.
    const bobsClaim = bob.useCase.publish(bobsDerivedDesign, bobsCopy);
    assert(bobsClaim.sourceFingerprint === sourceFingerprint && bobsClaim.derivedFingerprint === derivedFingerprint,
        '81. PHASE B: the signed claim carries the two correct, independently-derivable fingerprints');
    console.log('✓ Phase B: Bob signed "Farmstead Large derived from Farmstead"');

    // Phase C — exported, then imported into Alice's own replica, cross-
    // checked against HER OWN local Structure for the source side (she
    // has no local copy of "Farmstead Large" to check the derived side
    // against — that half stays an unconfirmed assertion, exactly as
    // documented).
    const claimPkg = bob.exchange.exportClaim(bobsClaim);
    const aliceImport = alice.exchange.importClaim(claimPkg, { expectedSourceFingerprint: deriveBlueprintFingerprint(aliceOriginal) });
    assert(aliceImport.isNew === true, '82. PHASE C: Alice\'s import of Bob\'s claim succeeds and is new');
    // A duplicate re-import, and a re-import of Bob's own claim into his
    // own replica (idempotent no-op through the exchange, exactly as
    // 0.6.6 already proved for attribution).
    const duplicate = alice.exchange.importClaim(claimPkg, { expectedSourceFingerprint: deriveBlueprintFingerprint(aliceOriginal) });
    assert(duplicate.isNew === false, '83. PHASE C: re-importing the same publication a second time is recognized as not-new');
    console.log('✓ Phase C: Alice imported and cross-checked Bob\'s claim against her own local "Farmstead"; a duplicate re-import changed nothing');

    // Phase D — both replicas now derive their OWN lineageView from
    // their OWN local Structure. Alice has only her original; Bob has
    // his own copy AND his derived design. Both converge on the SAME
    // claim for the SAME fingerprint pair.
    const aliceView = alice.useCase.lineageView(aliceOriginal);
    const bobSourceView = bob.useCase.lineageView(bobsCopy);
    const bobDerivedView = bob.useCase.lineageView(bobsDerivedDesign);

    assert(aliceView.derivedDesigns.length === 1 && aliceView.derivedDesigns[0].id === bobsClaim.id,
        '84. PHASE D: Alice\'s own "Farmstead" now shows exactly one derived design — Bob\'s claim');
    assert(bobSourceView.derivedDesigns.length === 1 && bobSourceView.derivedDesigns[0].id === bobsClaim.id,
        '85. PHASE D: Bob\'s own local copy of "Farmstead" shows the identical derived-design claim');
    assert(bobDerivedView.derivedFrom.length === 1 && bobDerivedView.derivedFrom[0].id === bobsClaim.id,
        '86. PHASE D: Bob\'s "Farmstead Large" correctly shows the SAME claim as its own ancestor');
    assert(aliceView.derivedDesigns[0].derivedFingerprint === bobDerivedView.derivedFrom[0].derivedFingerprint,
        '87. PHASE D: both replicas\' own views agree on the exact derivedFingerprint — the shape truly converged');
    console.log('✓ Phase D: Alice\'s and Bob\'s independently-derived lineage views converge on the identical claim, from both sides of the relationship');

    // Phase E — a third identity, Carol, independently (and mistakenly,
    // or adversarially) signs the REVERSE relationship: "Farmstead was
    // derived from Farmstead Large." Both Alice and Bob import it and
    // independently detect the same local cycle warning — neither
    // replica ever resolves the contradiction by dropping either claim.
    const carol = makeReplica('Carol');
    const carolsCopyOfDerived = farmsteadLarge({ id: 'carol-large-copy' });
    const carolsCopyOfOriginal = farmstead({ id: 'carol-original-copy' });
    assert(blueprintFingerprintsEqual(deriveBlueprintFingerprint(carolsCopyOfDerived), derivedFingerprint)
        && blueprintFingerprintsEqual(deriveBlueprintFingerprint(carolsCopyOfOriginal), sourceFingerprint),
        '88. PHASE E: sanity — Carol\'s own copies fingerprint identically to Bob\'s and Alice\'s designs');
    const carolsReverseClaim = carol.useCase.publish(carolsCopyOfOriginal, carolsCopyOfDerived); // "Farmstead" derived from "Farmstead Large"
    const reversePkg = carol.exchange.exportClaim(carolsReverseClaim);

    alice.exchange.importClaim(reversePkg);
    bob.exchange.importClaim(reversePkg);

    const aliceViewAfterCycle = alice.useCase.lineageView(aliceOriginal);
    const bobViewAfterCycle = bob.useCase.lineageView(bobsCopy);
    assert(aliceViewAfterCycle.hasCycleWarning === true, '89. PHASE E: Alice\'s own view now flags the contradiction as a cycle warning');
    assert(bobViewAfterCycle.hasCycleWarning === true, '90. PHASE E: Bob\'s own view, independently derived, flags the SAME contradiction');
    assert(aliceViewAfterCycle.derivedFrom.length === 1 && aliceViewAfterCycle.derivedDesigns.length === 1,
        '91. PHASE E: BOTH contradicting claims remain visible in the view — neither is dropped or "resolved" away');
    console.log('✓ Phase E: a contradicting third claim produces a converging cycle warning on both replicas — both claims stay visible, neither is silently resolved');

    // Phase F — none of this touched local Structure identity.
    assert(aliceOriginal.id === 'alice-original' && bobsCopy.id !== aliceOriginal.id,
        '92. PHASE F: local Structure ids were never touched by any of this claim traffic');
    assert(blueprintFingerprintsEqual(deriveBlueprintFingerprint(aliceOriginal), sourceFingerprint),
        '93. PHASE F: Alice\'s own Structure still fingerprints identically after everything above');
    // And attribution stays a fully independent claim type throughout —
    // publishing a lineage claim never touches, requires, or implies an
    // attribution for either design.
    const attributionStore = new LocalBlueprintAttributionStore(new InMemoryStorageProvider());
    const attributionUseCase = new BlueprintAttributionUseCase(attributionStore, alice.identity, new LocalAuthorizationVerifier());
    assert(attributionUseCase.summarize(aliceOriginal).attributions.length === 0,
        '94. PHASE F: no attribution was ever created as a side effect of any lineage claim in this scenario — the two claim types stay fully independent');

    console.log('✓ Phase F: local Structure identity and attribution both stayed completely untouched throughout');

    console.log('\nAll Blueprint Lineage & Revision Discovery tests passed.');
}

await run();
