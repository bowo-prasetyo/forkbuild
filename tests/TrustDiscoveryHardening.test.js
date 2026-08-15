import { CausalStamp } from '../core/CausalStamp.js';
import { RevisionReference } from '../core/RevisionReference.js';
import { PlacementRecord } from '../core/PlacementRecord.js';
import { Position } from '../core/Position.js';
import { SpatialBounds } from '../core/SpatialBounds.js';
import { SpatialIndexRoot } from '../core/SpatialIndexRoot.js';
import { Delegation, DelegationAction } from '../core/Delegation.js';
import { SigningIdentity as MockSigningIdentity } from '../core/SigningIdentity.js';
import { TrustStatus } from '../core/TrustObservation.js';
import { EquivocationDetector } from '../core/IndexEquivocation.js';
import { LocalIdentityProvider } from '../identity/LocalIdentityProvider.js';
import { LocalAuthorizationVerifier } from '../identity/LocalAuthorizationVerifier.js';
import { AuthorizationVerifier } from '../identity/AuthorizationVerifier.js';
import { TrustPolicy, AuthorityMode } from '../identity/TrustPolicy.js';
import { LocalDelegationResolver } from '../identity/LocalDelegationResolver.js';
import { LocalPlacementRegistry } from '../placement/LocalPlacementRegistry.js';
import { LocalSpatialIndexProvider } from '../spatial/LocalSpatialIndexProvider.js';
import { LocalSpatialIndexStore } from '../spatial/LocalSpatialIndexStore.js';
import { SpatialIndexBuilder } from '../spatial/SpatialIndexBuilder.js';
import { DecentralizedSpatialDiscoveryProvider } from '../spatial/DecentralizedSpatialDiscoveryProvider.js';
import { ReplayGuard } from '../replication/ReplayGuard.js';
import { CreateDelegationUseCase } from '../application/CreateDelegationUseCase.js';
import { StorageProvider } from '../storage/StorageProvider.js';

// ---------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------
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

function assertThrows(fn, message) {
    try {
        fn();
        assert(false, message);
    } catch (e) {
        // expected
    }
}

function createIdentity(username) {
    const provider = new LocalIdentityProvider(new InMemoryStorageProvider());
    provider.login(username);
    provider.getSigningIdentity();
    return provider;
}

const BOUNDS = new SpatialBounds({ min: { x: -0.5, y: 0, z: -0.5 }, max: { x: 0.5, y: 1, z: 0.5 } });

function makeSignedRecord(provider, { placementId, publicationId, x = 0, y = 0, z = 0, revision = 1 }) {
    const signingIdentity = provider.getSigningIdentity();
    let record = new PlacementRecord({ placementId, publicationId, bounds: BOUNDS, position: new Position(x, y, z), revision });
    record = record.withOwnerIdentity(signingIdentity.toJSON());
    record = record.withCausalHistory(new CausalStamp().advance(signingIdentity.id), []);
    record = record.withContentHash(record.computeContentHash());
    return record.withSignature(provider.signCanonical(record.getSigningDescriptor()));
}

// A full local replica: storage, registry, spatial index, decentralized
// index store/builder, and a discovery provider wired with whatever
// trust configuration the test wants.
function buildReplica(identityProvider, { trustPolicy, equivocationDetector, replayGuard, indexAuthorityIdentity = null } = {}) {
    const storage = new InMemoryStorageProvider();
    const spatialIndexProvider = new LocalSpatialIndexProvider(storage);
    const placementRegistry = new LocalPlacementRegistry(storage, spatialIndexProvider);
    const spatialIndexStore = new LocalSpatialIndexStore(storage);
    const builder = new SpatialIndexBuilder(spatialIndexStore, { cellSize: 100, identityProvider });
    const verifier = new LocalAuthorizationVerifier({ indexAuthorityIdentity });
    const provider = new DecentralizedSpatialDiscoveryProvider({
        spatialIndexStore, placementRegistry, authorizationVerifier: verifier,
        trustPolicy, equivocationDetector, replayGuard
    });
    return { storage, spatialIndexProvider, placementRegistry, spatialIndexStore, builder, verifier, provider };
}

async function runTests() {
    const alice = createIdentity('alice');
    const bob = createIdentity('bob');
    const aliceIdentity = alice.getSigningIdentity();
    const bobIdentity = bob.getSigningIdentity();

    // -------------------------------------------------------------
    // 1-2. Authority pinning: trusted authority accepted, unknown
    //      (non-pinned) authority rejected, same signature validity.
    // -------------------------------------------------------------
    {
        const pinned = TrustPolicy.pinnedTo(aliceIdentity);
        assert(pinned.authorityMode === AuthorityMode.PINNED, '1. Pinning an identity sets PINNED mode');
        assert(pinned.acceptsAuthority(aliceIdentity.id), '1b. The pinned authority is accepted');
        assert(!pinned.acceptsAuthority(bobIdentity.id), '2. A different, non-pinned signer is rejected');

        const discovered = new TrustPolicy(); // default: no pin
        assert(discovered.acceptsAuthority(bobIdentity.id) && discovered.acceptsAuthority(aliceIdentity.id),
            '2b. Default (DISCOVERED) policy accepts any signer, matching pre-0.2.19 behavior');

        const untrusted = new TrustPolicy({ authorityMode: AuthorityMode.UNTRUSTED });
        assert(!untrusted.acceptsAuthority(aliceIdentity.id), '2c. UNTRUSTED mode accepts nobody');
    }

    // -------------------------------------------------------------
    // 3-5. Signed root history: chains onto the previous root,
    //      advances the authority's causal stamp, and the signature
    //      covers that history — tampering with it invalidates the
    //      signature exactly like a tampered PlacementRecord causal
    //      stamp does (0.2.18's pattern, reused for roots).
    // -------------------------------------------------------------
    {
        const replica = buildReplica(alice);
        replica.placementRegistry.add(makeSignedRecord(alice, { placementId: 'p-1', publicationId: 'pub-1', x: 0 }));
        const build1 = replica.builder.build(replica.placementRegistry.list());
        assert(build1.root.revision === 1 && build1.root.previousRootReference === null,
            '3. The first signed root is revision 1 with no previous root');
        assert(build1.root.causalStamp.clock[aliceIdentity.id] === 1, '3b. Its causal stamp advances the authority once');

        replica.placementRegistry.add(makeSignedRecord(alice, { placementId: 'p-2', publicationId: 'pub-1', x: 10 }));
        const build2 = replica.builder.build(replica.placementRegistry.list());
        assert(build2.root.revision === 2, '4. A second build chains as revision 2');
        assert(build2.root.previousRootReference && build2.root.previousRootReference.hash === build1.rootReference.hash,
            '4b. Its previousRootReference points at the first root');
        assert(build2.root.causalStamp.clock[aliceIdentity.id] === 2, '4c. The causal stamp advances again');

        const verifyCheck = replica.verifier.verifyIndexRoot(build2.root);
        assert(verifyCheck.valid, '5. A root carrying real history still verifies');

        const tamperedRoot = new SpatialIndexRoot({
            ...build2.root.toJSON(),
            causalStamp: { version: 1, clock: { 'did:key:zAttacker': 99 } }
        });
        assert(!replica.verifier.verifyIndexRoot(tamperedRoot).valid,
            '5b. Forging the root causal history invalidates its existing signature');

        const genesisRoot = new SpatialIndexRoot({ cellSize: 100 });
        assert(!genesisRoot.hasHistory, '5c. A genesis root (defaults only) carries no history');
    }

    // -------------------------------------------------------------
    // 6. Equivocation: the same authority signs two DIFFERENT roots
    //    at the SAME causal sequence -> detected, and by default
    //    policy the discovery provider refuses to trust either.
    // -------------------------------------------------------------
    {
        const rootA = new SpatialIndexRoot({ cellSize: 100 })
            .withManifestReference('0,0,0', { hash: 'aaa' })
            .withHistory({ revision: 5, previousRootReference: null, causalStamp: new CausalStamp({ clock: { [aliceIdentity.id]: 5 } }) });
        const rootB = new SpatialIndexRoot({ cellSize: 100 })
            .withManifestReference('0,0,0', { hash: 'bbb' }) // different content, same sequence
            .withHistory({ revision: 5, previousRootReference: null, causalStamp: new CausalStamp({ clock: { [aliceIdentity.id]: 5 } }) });
        const signedA = rootA.withSignature(alice.signCanonical(rootA.getSigningDescriptor()));
        const signedB = rootB.withSignature(alice.signCanonical(rootB.getSigningDescriptor()));

        const detector = new EquivocationDetector();
        assert(detector.observe(signedA) === null, '6a. A single observation is not (yet) an equivocation');
        const equivocation = detector.observe(signedB);
        assert(equivocation !== null, '6b. A second, different root at the same authority+sequence IS equivocation');
        assert(equivocation.authority === aliceIdentity.id && equivocation.sequence === 5,
            '6c. The equivocation names the right authority and sequence');
        assert(equivocation.roots.length === 2, '6d. Both competing roots are recorded');

        // Order independence: observing B then A detects the identical equivocation.
        const reversedDetector = new EquivocationDetector();
        reversedDetector.observe(signedB);
        const reversedEquivocation = reversedDetector.observe(signedA);
        assert(reversedEquivocation.authority === equivocation.authority
            && reversedEquivocation.sequence === equivocation.sequence,
            '19. Arrival order does not change the equivocation result');

        // A discovery provider refuses to trust an equivocating root by default.
        const storage = new InMemoryStorageProvider();
        const store = new LocalSpatialIndexStore(storage);
        store.setRootReference(store.put(signedA.toJSON()));
        const verifier = new LocalAuthorizationVerifier({});
        const strictProvider = new DecentralizedSpatialDiscoveryProvider({
            spatialIndexStore: store, authorizationVerifier: verifier,
            equivocationDetector: detector // already knows about both A and B
        });
        assertThrows(() => strictProvider.discover(new Position(0, 0, 0), 10),
            '6e. Default policy (rejectEquivocatingAuthority) refuses an equivocating root');

        const tolerantProvider = new DecentralizedSpatialDiscoveryProvider({
            spatialIndexStore: store, authorizationVerifier: verifier,
            equivocationDetector: new EquivocationDetector(),
            trustPolicy: new TrustPolicy({ rejectEquivocatingAuthority: false })
        });
        tolerantProvider.discover(new Position(0, 0, 0), 10); // does not throw
        tolerantProvider.discover(new Position(0, 0, 0), 10); // second observation trips the detector, still tolerated
        console.log('✓ root history and equivocation');
    }

    // -------------------------------------------------------------
    // 7-11. Manifest/record isolation feeds the new diagnostics
    //       surface without changing discover()'s return type.
    // -------------------------------------------------------------
    {
        const replica = buildReplica(alice);
        // Placed well inside one cell (cellSize 100), away from any
        // cell boundary, and without bounds — so it is referenced from
        // exactly ONE manifest, and corrupting that manifest fully
        // isolates it rather than leaving redundant copies elsewhere.
        const signingIdentity = alice.getSigningIdentity();
        let p1 = new PlacementRecord({ placementId: 'p-a', publicationId: 'pub-a', position: new Position(10, 0, 10), revision: 1 });
        p1 = p1.withOwnerIdentity(signingIdentity.toJSON());
        p1 = p1.withCausalHistory(new CausalStamp().advance(signingIdentity.id), []);
        p1 = p1.withContentHash(p1.computeContentHash());
        p1 = p1.withSignature(alice.signCanonical(p1.getSigningDescriptor()));
        replica.placementRegistry.add(p1);
        replica.builder.build([p1]);

        const found = replica.provider.discover(new Position(10, 0, 10), 5);
        assert(found.length === 1, '7. A clean index resolves normally');
        const diagnostics = replica.provider.getLastDiagnostics();
        assert(diagnostics.manifestsLoaded >= 1 && diagnostics.manifestsMissing === 0 && diagnostics.manifestsInvalid === 0,
            '7b. Diagnostics report a clean load with no missing/invalid manifests');
        assert(diagnostics.observations.some((o) => o.status === TrustStatus.VALID),
            '7c. A VALID TrustObservation was recorded for the trusted record');

        // 8. Corrupt the one manifest referencing it -> isolated + counted.
        const rootRef = replica.spatialIndexStore.getRootReference();
        const rootJson = replica.spatialIndexStore.get(rootRef);
        const root = SpatialIndexRoot.fromJSON(rootJson);
        assert(root.cellKeys.length === 1, 'sanity: the unbounded record occupies exactly one cell');
        const cellKey = root.cellKeys[0];
        const manifestRef = root.getManifestReference(cellKey);
        const manifestStorageKey = 'spatial-index-content:' + manifestRef.hash;
        const manifest = replica.storage.load(manifestStorageKey);
        manifest.cellSize = 999999; // tamper -> hash mismatch
        replica.storage.save(manifestStorageKey, manifest);

        const foundAfterTamper = replica.provider.discover(new Position(10, 0, 10), 5);
        assert(foundAfterTamper.length === 0, '8. A tampered manifest yields no results for its cell, not a throw');
        const diagAfterTamper = replica.provider.getLastDiagnostics();
        assert(diagAfterTamper.manifestsInvalid === 1, '8b. Diagnostics distinguish INVALID from MISSING manifests');

        // 9. A missing manifest (reference points at nothing).
        replica.storage.remove(manifestStorageKey);
        const foundMissing = replica.provider.discover(new Position(10, 0, 10), 5);
        assert(foundMissing.length === 0, '9. A missing manifest also yields no results, not a throw');
        assert(replica.provider.getLastDiagnostics().manifestsMissing === 1, '9b. Diagnostics count it as MISSING');
        console.log('✓ manifest isolation reflected in diagnostics');
    }

    // -------------------------------------------------------------
    // 10-11. Stale index entry: live truth has moved on, but the
    //        index's cached reference still names the old revision.
    //        The correct (live) revision is still what discover()
    //        returns; staleness is recorded, not hidden.
    // -------------------------------------------------------------
    {
        const replica = buildReplica(alice);
        const rev1 = makeSignedRecord(alice, { placementId: 'p-stale', publicationId: 'pub-s', x: 0, revision: 1 });
        replica.placementRegistry.add(rev1);
        replica.builder.build([rev1]); // index now has revision 1

        let rev2 = rev1.withPosition(new Position(5, 0, 0));
        rev2 = rev2.withCausalHistory(rev1.causalStamp.advance(aliceIdentity.id), [
            new RevisionReference({ placementId: rev1.placementId, revision: rev1.revision, contentReference: { hash: rev1.contentHash } })
        ]);
        rev2 = rev2.withContentHash(rev2.computeContentHash());
        rev2 = rev2.withSignature(alice.signCanonical(rev2.getSigningDescriptor()));
        replica.placementRegistry.update(rev2); // live truth moves to revision 2; index NOT rebuilt (simulates lag)

        const found = replica.provider.discover(new Position(5, 0, 0), 10);
        assert(found.length === 1 && found[0].revision === 2, '10. Live (newer) revision wins over the stale cached index entry');
        assert(replica.provider.getLastDiagnostics().staleEntries >= 1, '11. The disagreement is recorded as a stale entry, not hidden');
        console.log('✓ stale index entry resolved to live truth and reported');
    }

    // -------------------------------------------------------------
    // 12. Forged/unauthorized high revision cannot poison discovery
    //     (0.2.16 property, reconfirmed against the new diagnostics).
    // -------------------------------------------------------------
    {
        const replica = buildReplica(alice);
        const rev4 = makeSignedRecord(alice, { placementId: 'p-forge', publicationId: 'pub-f', x: 0, revision: 4 });
        replica.placementRegistry.add(rev4);

        const forgedUnsigned = rev4.withPosition(new Position(9, 0, 0));
        let forged = new PlacementRecord({ ...forgedUnsigned.toJSON(), contentHash: forgedUnsigned.computeContentHash() });
        forged = forged.withSignature(bob.signCanonical(forged.getSigningDescriptor())); // Bob, not Alice
        replica.builder.build([forged]);

        const found = replica.provider.discover(new Position(5, 0, 0), 20);
        assert(found.length === 1 && found[0].revision === 4, '12. Forged high revision from the wrong signer cannot displace the authentic one');
        assert(replica.provider.getLastDiagnostics().recordsRejected >= 1, '12b. The rejection is recorded in diagnostics');
    }

    // -------------------------------------------------------------
    // 13. Delegation replay is detectable via ReplayGuard, decoupled
    //     from whether the delegation remains otherwise valid.
    // -------------------------------------------------------------
    {
        // Delegation signing uses the 0.2.17 mock scheme
        // (core/SigningIdentity.js) — see the note in section 17 below.
        const mockAlice = new MockSigningIdentity({ id: 'mock-alice-13', username: 'alice', providerId: 'local' });
        const mockBob = new MockSigningIdentity({ id: 'mock-bob-13', username: 'bob', providerId: 'local' });

        const resolver = new LocalDelegationResolver(new InMemoryStorageProvider());
        const createDelegation = new CreateDelegationUseCase(resolver);
        const del = await createDelegation.execute({
            issuerIdentity: mockAlice, delegateIdentity: mockBob,
            action: DelegationAction.PLACE, subject: { type: 'publication', id: 'pub-1' }
        });
        assert(typeof del.nonce === 'string' && del.nonce.length > 0, '13a. Every delegation carries a nonce');
        assert(del.issuedFor === mockBob.id, '13b. issuedFor names the delegate flatly');

        const guard = new ReplayGuard();
        const hash = del.computeHash();
        assert(!guard.hasAccepted(hash, 'delegation'), '13c. A fresh delegation has not been seen before');
        guard.recordAccepted(hash, 'delegation');
        assert(guard.hasAccepted(hash, 'delegation'), '13. Replaying the identical delegation object is now detectable');

        // A second, semantically-similar-but-freshly-issued delegation
        // is NOT a replay — different nonce, different hash.
        const del2 = await createDelegation.execute({
            issuerIdentity: mockAlice, delegateIdentity: mockBob,
            action: DelegationAction.PLACE, subject: { type: 'publication', id: 'pub-1' }
        });
        assert(del2.nonce !== del.nonce, '13d. Two issuances of the same terms carry different nonces');
        assert(!guard.hasAccepted(del2.computeHash(), 'delegation'), '13e. A fresh issuance is not flagged as a replay');
    }

    // -------------------------------------------------------------
    // 14-16. Canonical capability scope: independent of incidental
    //        JSON shape, comparable by hash across replicas.
    // -------------------------------------------------------------
    {
        const region = { min: { x: 0, y: 0, z: 0 }, max: { x: 10, y: 10, z: 10 } };
        const delA = new Delegation({
            issuerIdentity: aliceIdentity, delegateIdentity: bobIdentity,
            action: DelegationAction.PLACE, subject: { type: 'publication', id: 'pub-1' },
            constraints: { region }
        });
        const delB = new Delegation({
            issuerIdentity: aliceIdentity, delegateIdentity: bobIdentity,
            action: DelegationAction.PLACE, subject: { type: 'publication', id: 'pub-1' },
            constraints: { region: { min: { ...region.min }, max: { ...region.max } } } // independently constructed, same meaning
        });
        assert(delA.scopeHash === delB.scopeHash, '14. Two independently-serialized delegations with the same capability hash identically');

        const delDifferentAction = new Delegation({
            issuerIdentity: aliceIdentity, delegateIdentity: bobIdentity,
            action: DelegationAction.MOVE, subject: { type: 'publication', id: 'pub-1' },
            constraints: { region }
        });
        assert(delA.scopeHash !== delDifferentAction.scopeHash,
            '15. A PLACE capability and a MOVE capability hash differently even over the same subject/region');
        assert(delA.scope.action === DelegationAction.PLACE && delA.scope.spatialScope.max.x === 10,
            '16. scope exposes the normalized action + spatial region directly');
    }

    // -------------------------------------------------------------
    // 17. Delegation chains are explicitly rejected, not silently
    //     mis-authorized.
    // -------------------------------------------------------------
    {
        // Delegation's own signature uses the 0.2.17 mock signature
        // scheme (core/SigningIdentity.js), matching
        // tests/DelegatedAuthorization.test.js exactly — distinct from
        // the real Ed25519 identities (alice/bob/carol) used elsewhere
        // in this file for placement/root signing.
        const mockAlice = new MockSigningIdentity({ id: 'mock-alice', username: 'alice', providerId: 'local' });
        const mockBob = new MockSigningIdentity({ id: 'mock-bob', username: 'bob', providerId: 'local' });
        const mockCarol = new MockSigningIdentity({ id: 'mock-carol', username: 'carol', providerId: 'local' });

        const resolver = new LocalDelegationResolver(new InMemoryStorageProvider());
        const createDelegation = new CreateDelegationUseCase(resolver);
        const verifier = new AuthorizationVerifier();

        const grant = await createDelegation.execute({
            issuerIdentity: mockAlice, delegateIdentity: mockBob,
            action: DelegationAction.PLACE, subject: { type: 'publication', id: 'pub-chain' }
        });
        assert(grant.parentDelegationId === null, 'sanity: a direct-from-owner delegation has no parent');

        // Bob attempts to re-delegate to Carol under his OWN delegation
        // (rather than Alice, the actual owner, issuing directly).
        const chained = new Delegation({
            issuerIdentity: mockBob, delegateIdentity: mockCarol,
            action: DelegationAction.PLACE, subject: { type: 'publication', id: 'pub-chain' },
            parentDelegationId: grant.id
        });
        chained._signature = await mockBob.sign(chained.getCanonicalPayload());
        await resolver.save(chained);

        const result = await verifier.verify({
            signerIdentity: mockCarol, ownerIdentity: mockAlice,
            requiredAction: DelegationAction.PLACE,
            subject: { type: 'publication', id: 'pub-chain' },
            signature: await mockCarol.sign('placement-payload'), payload: 'placement-payload',
            delegationId: chained.id, delegationResolver: resolver
        });
        assert(result.authorized === false && result.reason === 'UNSUPPORTED_DELEGATION_CHAIN',
            '17. A delegation chain (parentDelegationId set) is rejected with a named, explicit reason');
    }

    // -------------------------------------------------------------
    // 18. Legacy unsigned content obeys the configured trust policy.
    // -------------------------------------------------------------
    {
        const storage = new InMemoryStorageProvider();
        const spatialIndexProvider = new LocalSpatialIndexProvider(storage);
        const placementRegistry = new LocalPlacementRegistry(storage, spatialIndexProvider);
        const spatialIndexStore = new LocalSpatialIndexStore(storage);
        const builder = new SpatialIndexBuilder(spatialIndexStore, { cellSize: 100 }); // no identityProvider -> unsigned
        const legacyRecord = new PlacementRecord({ placementId: 'p-legacy', publicationId: 'pub-legacy', bounds: BOUNDS, position: new Position(0, 0, 0) });
        const stored = new PlacementRecord({ ...legacyRecord.toJSON(), contentHash: legacyRecord.computeContentHash() });
        placementRegistry.add(stored);
        builder.build([stored]);

        const permissiveProvider = new DecentralizedSpatialDiscoveryProvider({
            spatialIndexStore, placementRegistry, authorizationVerifier: new LocalAuthorizationVerifier({}),
            trustPolicy: new TrustPolicy() // default: legacy tolerated
        });
        const permissiveResult = permissiveProvider.discover(new Position(0, 0, 0), 10);
        assert(permissiveResult.length === 1, '18a. Default (permissive) policy tolerates unsigned legacy content');

        const hardenedProvider = new DecentralizedSpatialDiscoveryProvider({
            spatialIndexStore, placementRegistry, authorizationVerifier: new LocalAuthorizationVerifier({}),
            trustPolicy: TrustPolicy.hardened()
        });
        assertThrows(() => hardenedProvider.discover(new Position(0, 0, 0), 10),
            '18b. TrustPolicy.hardened() refuses an unsigned root outright');
    }

    // -------------------------------------------------------------
    // 20. FLAGSHIP: a replica facing a hostile discovery environment
    //     — stale root, forged manifest, replayed placement,
    //     unauthorized revision, a competing (equivocating) root —
    //     still converges on the legitimate, trusted state and
    //     reports everything it rejected along the way.
    // -------------------------------------------------------------
    {
        const detector = new EquivocationDetector();
        const replayGuard = new ReplayGuard();
        const replica = buildReplica(alice, { equivocationDetector: detector, replayGuard });

        // Legitimate placement, properly indexed.
        const genesis = makeSignedRecord(alice, { placementId: 'p-flagship', publicationId: 'pub-flagship', x: 0, y: 0, z: 0 });
        replica.placementRegistry.add(genesis);
        const build1 = replica.builder.build([genesis]);

        // Attack 1: an unauthorized "higher revision" forged by Bob.
        const forgedUnsigned = genesis.withPosition(new Position(50, 50, 50));
        let forged = new PlacementRecord({ ...forgedUnsigned.toJSON(), contentHash: forgedUnsigned.computeContentHash() });
        forged = forged.withSignature(bob.signCanonical(forged.getSigningDescriptor()));

        // Attack 2: index a manifest that ALSO includes the forged record
        // alongside the legitimate one (a malicious/compromised index
        // node advertising a poisoned reference).
        replica.builder.addOrUpdatePlacement(forged);

        const found1 = replica.provider.discover(new Position(0, 0, 0), 200);
        const legit = found1.find((r) => r.placementId === 'p-flagship');
        assert(legit && legit.contentHash === genesis.contentHash,
            'flagship-a. The forged revision never displaces the legitimate one');
        const diag1 = replica.provider.getLastDiagnostics();
        assert(diag1.recordsRejected >= 1, 'flagship-b. The forgery is recorded as a rejection, not silently dropped');

        // Attack 3: replay the legitimate revision again (e.g. a
        // malicious node re-broadcasting old-but-genuine content).
        replica.builder.addOrUpdatePlacement(genesis);
        const found2 = replica.provider.discover(new Position(0, 0, 0), 200);
        assert(found2.find((r) => r.placementId === 'p-flagship').contentHash === genesis.contentHash,
            'flagship-c. Replaying the legitimate revision changes nothing');
        assert(replayGuard.hasAccepted(genesis.contentHash, 'placement-record'),
            'flagship-d. The replay guard recognizes the legitimate revision as already accepted');

        // Attack 4: a competing (equivocating) root at the same
        // sequence as the current one, from the SAME authority key —
        // simulates a compromised or dishonest index relay presenting
        // a different snapshot to a different observer. Detected via a
        // SEPARATE detector, standing in for an external gossip/
        // monitoring process comparing roots across replicas — it must
        // not corrupt THIS replica's own trust state merely by
        // existing; this replica's root pointer never actually
        // changed, and it must keep converging on what it actually has.
        const currentRootJson = replica.spatialIndexStore.get(replica.spatialIndexStore.getRootReference());
        const currentRoot = SpatialIndexRoot.fromJSON(currentRootJson);
        let rivalRoot = new SpatialIndexRoot({ cellSize: currentRoot.cellSize })
            .withManifestReference('99,99,99', { hash: 'rival-manifest' })
            .withHistory({
                revision: currentRoot.revision,
                previousRootReference: currentRoot.previousRootReference,
                causalStamp: currentRoot.causalStamp
            });
        rivalRoot = rivalRoot.withSignature(alice.signCanonical(rivalRoot.getSigningDescriptor()));

        const externalDetector = new EquivocationDetector();
        externalDetector.observe(currentRoot);
        const equivocation = externalDetector.observe(rivalRoot);
        assert(equivocation !== null, 'flagship-e. The rival root is recognized as equivocation at the current sequence');

        // The replica's OWN root pointer never changed — it still
        // trusts and discovers through the root it actually has.
        const found3 = replica.provider.discover(new Position(0, 0, 0), 200);
        assert(found3.find((r) => r.placementId === 'p-flagship').contentHash === genesis.contentHash,
            'flagship-f. Despite a detected rival root elsewhere, this replica keeps converging on the legitimate placement');

        console.log('✅ FLAGSHIP: malicious replica environment — trusted replica still converges');
    }

    console.log('✅ All Trust & Discovery Hardening tests passed.');
}

runTests().catch((e) => { console.error(e); throw e; });
