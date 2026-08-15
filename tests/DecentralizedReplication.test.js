import { CausalStamp } from '../core/CausalStamp.js';
import { RevisionReference } from '../core/RevisionReference.js';
import { ConflictSet } from '../core/ConflictSet.js';
import { PlacementRecord } from '../core/PlacementRecord.js';
import { Position } from '../core/Position.js';
import { SpatialBounds } from '../core/SpatialBounds.js';
import { Signature } from '../core/Signature.js';
import { LocalIdentityProvider } from '../identity/LocalIdentityProvider.js';
import { LocalAuthorizationVerifier } from '../identity/LocalAuthorizationVerifier.js';
import { LocalPlacementRegistry } from '../placement/LocalPlacementRegistry.js';
import { LocalSpatialIndexProvider } from '../spatial/LocalSpatialIndexProvider.js';
import { LocalSpatialIndexStore } from '../spatial/LocalSpatialIndexStore.js';
import { SpatialIndexBuilder } from '../spatial/SpatialIndexBuilder.js';
import { DecentralizedSpatialDiscoveryProvider } from '../spatial/DecentralizedSpatialDiscoveryProvider.js';
import { ConflictResolver, ConflictRelation } from '../replication/ConflictResolver.js';
import { ConflictPolicy } from '../replication/ConflictPolicy.js';
import { ReplicaMergeService, MergeResult } from '../replication/ReplicaMergeService.js';
import { LocalReplicationStore } from '../replication/LocalReplicationStore.js';
import { ReplicatePlacementUseCase } from '../application/ReplicatePlacementUseCase.js';
import { SynchronizeReplicaUseCase } from '../application/SynchronizeReplicaUseCase.js';
import { PlacePublicationUseCase } from '../application/PlacePublicationUseCase.js';
import { MoveWorldPlacementUseCase } from '../application/MoveWorldPlacementUseCase.js';
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

function createIdentity(username) {
    const provider = new LocalIdentityProvider(new InMemoryStorageProvider());
    provider.login(username);
    provider.getSigningIdentity(); // force key creation now
    return provider;
}

const BOUNDS = new SpatialBounds({ min: { x: -0.5, y: 0, z: -0.5 }, max: { x: 0.5, y: 1, z: 0.5 } });

// Builds a signed genesis (revision 1) PlacementRecord the way
// PlacePublicationUseCase does — owner identity, causal genesis, real
// Ed25519 signature — without needing a full publication/document
// stack, for the granular unit tests below.
function genesisRecord(provider, { placementId, publicationId, x = 0, y = 0, z = 0 }) {
    const signingIdentity = provider.getSigningIdentity();
    let record = new PlacementRecord({
        placementId, publicationId, bounds: BOUNDS,
        position: new Position(x, y, z), revision: 1
    });
    record = record.withOwnerIdentity(signingIdentity.toJSON());
    record = record.withCausalHistory(new CausalStamp().advance(signingIdentity.id), []);
    record = record.withContentHash(record.computeContentHash());
    record = record.withSignature(provider.signCanonical(record.getSigningDescriptor()));
    return record;
}

// Builds the next revision of `parentRecord`, signed by `provider`, at
// a new position — the way MoveWorldPlacementUseCase does. `actorKey`
// is the vector-clock component to advance; it defaults to the
// signer's did:key (exactly what production code uses). Tests that
// simulate two disconnected DEVICES of the SAME identity may pass a
// device-qualified key instead — the signature is still the real
// owner's, only the causal thread differs.
function nextRevision(provider, parentRecord, { x, y, z }, actorKey = null) {
    const signingIdentity = provider.getSigningIdentity();
    let record = parentRecord.withPosition(new Position(x, y, z));
    const priorStamp = parentRecord.causalStamp || new CausalStamp();
    const parent = new RevisionReference({
        placementId: parentRecord.placementId,
        revision: parentRecord.revision,
        contentReference: { hash: parentRecord.contentHash }
    });
    record = record.withCausalHistory(priorStamp.advance(actorKey || signingIdentity.id), [parent]);
    record = record.withContentHash(record.computeContentHash());
    record = record.withSignature(provider.signCanonical(record.getSigningDescriptor()));
    return record;
}

// One replica: its own storage, registry, spatial index, decentralized
// index, and merge pipeline. Two InMemoryStorageProviders never share
// data, exactly like two disconnected nodes.
function buildReplica({ indexAuthorityIdentity = null } = {}) {
    const storage = new InMemoryStorageProvider();
    const spatialIndexProvider = new LocalSpatialIndexProvider(storage);
    const registry = new LocalPlacementRegistry(storage, spatialIndexProvider);
    const replicationStore = new LocalReplicationStore(storage);
    const spatialIndexStore = new LocalSpatialIndexStore(storage);
    const spatialIndexBuilder = new SpatialIndexBuilder(spatialIndexStore, { cellSize: 100 });
    const verifier = new LocalAuthorizationVerifier({ indexAuthorityIdentity });
    const resolver = new ConflictResolver();
    const policy = new ConflictPolicy();
    const mergeService = new ReplicaMergeService({
        resolver, policy, verifier, registry, replicationStore, spatialIndexBuilder
    });
    const discoveryProvider = new DecentralizedSpatialDiscoveryProvider({
        spatialIndexStore, placementRegistry: registry, authorizationVerifier: verifier
    });
    return {
        storage, spatialIndexProvider, registry, replicationStore, spatialIndexBuilder,
        verifier, resolver, policy, mergeService, discoveryProvider,
        replicatePlacementUseCase: new ReplicatePlacementUseCase(mergeService),
        syncFrom: (remoteStore) => new SynchronizeReplicaUseCase({
            localStore: replicationStore, remoteStore, mergeService
        })
    };
}

async function runTests() {
    const alice = createIdentity('alice');
    const bob = createIdentity('bob');
    const aliceId = alice.getSigningIdentity().id;
    const bobId = bob.getSigningIdentity().id;

    // -------------------------------------------------------------
    // 1-3. CausalStamp — vector-clock semantics
    // -------------------------------------------------------------
    {
        const s1 = new CausalStamp({ clock: { [aliceId]: 1 } });
        const s2 = s1.advance(bobId); // { alice: 1, bob: 1 }
        assert(s1.happensBefore(s2), '1. Advancing a stamp for a new actor keeps happens-before');
        assert(!s2.happensBefore(s1), '2. A causal successor never happens-before its predecessor');

        const s3 = s1.advance(aliceId).advance(aliceId); // { alice: 3 }
        assert(s2.concurrentWith(s3), '3. Divergent single-actor advances are CONCURRENT');
        assert(!s2.happensBefore(s3) && !s3.happensBefore(s2), '3b. Neither concurrent stamp dominates the other');

        // Serialization determinism.
        const round = CausalStamp.fromJSON(JSON.parse(JSON.stringify(s2.toJSON())));
        assert(round.equals(s2), '3c. CausalStamp survives a JSON round-trip unchanged');
        assert(JSON.stringify(round.toJSON()) === JSON.stringify(s2.toJSON()),
            '3d. toJSON() is deterministic for equal stamps');
    }

    // -------------------------------------------------------------
    // 4. Signature covers causal metadata — tampering invalidates it
    // -------------------------------------------------------------
    {
        const record = genesisRecord(alice, { placementId: 'pl-sig', publicationId: 'pub-1', x: 0, y: 0, z: 0 });
        const replica = buildReplica();
        const okCheck = replica.verifier.verifyPlacement(record);
        assert(okCheck.valid, '4a. A genuine causally-stamped signature verifies');

        // Forge a different causal history onto the SAME signature.
        const tampered = new PlacementRecord({
            ...record.toJSON(),
            causalStamp: { version: 1, clock: { 'did:key:zAttacker': 99 } }
        });
        const tamperedCheck = replica.verifier.verifyPlacement(tampered);
        assert(!tamperedCheck.valid, '4b. Forging causal history invalidates the existing signature');

        // Forging a parent reference is equally caught.
        const tamperedParents = new PlacementRecord({
            ...record.toJSON(),
            parents: [{ placementId: 'pl-sig', revision: 1, contentReference: { hash: 'deadbeef' } }]
        });
        assert(!replica.verifier.verifyPlacement(tamperedParents).valid,
            '4c. Forging a parent reference invalidates the existing signature');
    }

    // -------------------------------------------------------------
    // 5. Immutable revisions survive replication (content-addressed
    //    store round-trip, deduplicated)
    // -------------------------------------------------------------
    {
        const replica = buildReplica();
        const record = genesisRecord(alice, { placementId: 'pl-store', publicationId: 'pub-1' });
        const hashA = replica.replicationStore.put(record);
        const hashB = replica.replicationStore.put(record); // same object again
        assert(hashA === hashB, '5a. Storing the same immutable object twice yields the same reference');
        assert(replica.storage.list().filter((k) => k.startsWith('replication:')).length === 1,
            '5b. Duplicate puts do not duplicate storage (content-addressed dedup)');
        const fetched = PlacementRecord.fromJSON(replica.replicationStore.get(hashA));
        assert(fetched.verifyIntegrity(), '5c. A round-tripped revision still verifies its own integrity');
        assert(replica.replicationStore.has(hashA), '5d. has() reports a stored reference present');
    }

    // -------------------------------------------------------------
    // 6-8. Merge pipeline: genesis, causally-newer, and older revisions
    // -------------------------------------------------------------
    {
        const replica = buildReplica();
        const base = genesisRecord(alice, { placementId: 'pl-1', publicationId: 'pub-1', x: 0, y: 0, z: 0 });

        const r1 = await replica.mergeService.merge(base);
        assert(r1.result === MergeResult.UPDATED, '6. Genesis revision merges as UPDATED (no prior current)');

        const moved = nextRevision(alice, base, { x: 5, y: 0, z: 0 });
        const r2 = await replica.mergeService.merge(moved);
        assert(r2.result === MergeResult.UPDATED, '7. Causally newer valid revision replaces the older one');
        assert(replica.registry.get('pl-1').contentHash === moved.contentHash, '7b. Registry now presents the newer revision');

        // A causally OLDER revision arriving late must never win.
        const r3 = await replica.mergeService.merge(base);
        assert(r3.result === MergeResult.IGNORED && r3.reason === 'OLDER',
            '8. Older valid revision cannot replace a newer valid revision');
        assert(replica.registry.get('pl-1').contentHash === moved.contentHash,
            '8b. The newer revision remains presented after the older one arrives late');

        // The exact same revision arriving again is a no-op, not a conflict.
        const r4 = await replica.mergeService.merge(moved);
        assert(r4.result === MergeResult.IGNORED && r4.reason === 'DUPLICATE', '8c. Re-merging an identical revision is a duplicate no-op');
    }

    // -------------------------------------------------------------
    // 9-11. Concurrent revisions -> ConflictSet, deterministic winner,
    //       regardless of arrival order; both histories retained
    // -------------------------------------------------------------
    let recordA, recordB, expectedWinnerHash;
    {
        // Alice's phone and Alice's laptop: the same authority, two
        // disconnected causal threads. Both revisions are validly
        // signed by Alice; only their causal thread (device) differs,
        // so their vector clocks are genuinely CONCURRENT rather than
        // merely equal (see the "same thread" variant below).
        const base = genesisRecord(alice, { placementId: 'pl-2', publicationId: 'pub-1', x: 0, y: 0, z: 0 });
        recordA = nextRevision(alice, base, { x: 10, y: 0, z: 0 }, `${aliceId}#phone`);
        recordB = nextRevision(alice, base, { x: 0, y: 10, z: 0 }, `${aliceId}#laptop`);
        assert(recordA.causalStamp.concurrentWith(recordB.causalStamp), 'sanity: the two edits are causally concurrent');

        const replicaX = buildReplica();
        await replicaX.mergeService.merge(base);
        await replicaX.mergeService.merge(recordA);
        const conflictXY = await replicaX.mergeService.merge(recordB); // arrival order: A, then B
        assert(conflictXY.result === MergeResult.CONFLICT, '9. Concurrent valid revisions produce a CONFLICT result');
        assert(conflictXY.conflictSet instanceof ConflictSet, '9b. The merge result carries a real ConflictSet');
        assert(conflictXY.conflictSet.revisions.length === 2, '9c. The conflict set holds exactly the two competing revisions');
        expectedWinnerHash = conflictXY.winner;

        const replicaY = buildReplica();
        await replicaY.mergeService.merge(base);
        await replicaY.mergeService.merge(recordB);
        const conflictYX = await replicaY.mergeService.merge(recordA); // arrival order: B, then A
        assert(conflictYX.result === MergeResult.CONFLICT, '10a. The reverse arrival order also detects a conflict');
        assert(conflictYX.winner === expectedWinnerHash,
            '10b. Conflict winner is deterministic regardless of arrival order');
        assert(conflictYX.conflictSet.winner === conflictXY.conflictSet.winner,
            '10c. Both replicas record the identical ConflictSet winner');

        // 11. Both conflicting revisions remain independently retrievable.
        const historyX = replicaX.registry.getHistory('pl-2');
        assert(historyX.some((h) => h.hash === recordA.contentHash) && historyX.some((h) => h.hash === recordB.contentHash),
            '11a. Registry history retains both competing revisions');
        assert(replicaX.replicationStore.has(recordA.contentHash) && replicaX.replicationStore.has(recordB.contentHash),
            '11b. Both competing revisions remain fetchable from the replication store');
        const loserHash = expectedWinnerHash === recordA.contentHash ? recordB.contentHash : recordA.contentHash;
        const loserRecord = PlacementRecord.fromJSON(replicaX.replicationStore.get(loserHash));
        assert(loserRecord.verifyIntegrity(), '11c. The losing revision is not corrupted — it is simply not presented');
    }

    // -------------------------------------------------------------
    // 11b. Same causal thread, different content: two revisions
    //      advancing the SAME actor key from the same parent (the
    //      ordinary single-device case, replayed twice) have EQUAL —
    //      not concurrent — vector clocks, yet still differ in
    //      content. This is exactly as indeterminate as a genuine
    //      concurrent edit and must be handled identically, never
    //      silently dropped.
    // -------------------------------------------------------------
    {
        const base = genesisRecord(alice, { placementId: 'pl-2b', publicationId: 'pub-1' });
        const editX = nextRevision(alice, base, { x: 1, y: 0, z: 0 });
        const editY = nextRevision(alice, base, { x: 0, y: 1, z: 0 });
        assert(editX.causalStamp.equals(editY.causalStamp), 'sanity: same actor key, same parent -> equal clocks');
        assert(editX.contentHash !== editY.contentHash, 'sanity: equal clocks, different content');

        const replica = buildReplica();
        await replica.mergeService.merge(base);
        await replica.mergeService.merge(editX);
        const result = await replica.mergeService.merge(editY);
        assert(result.result === MergeResult.CONFLICT,
            '11b. Equal-clock, different-content revisions are treated as an indeterminate conflict, not dropped');
    }

    // -------------------------------------------------------------
    // 12. Legacy pre-0.2.18 data (no causal stamp) remains readable,
    //     and two such revisions with different content are treated
    //     as an indeterminate (concurrent) conflict, never dropped.
    // -------------------------------------------------------------
    {
        const replica = buildReplica();
        const legacy1 = alice.getSigningIdentity && (() => {
            let r = new PlacementRecord({ placementId: 'pl-legacy', publicationId: 'pub-1', bounds: BOUNDS, position: new Position(0, 0, 0), revision: 1 });
            r = r.withOwnerIdentity(alice.getSigningIdentity().toJSON());
            r = r.withContentHash(r.computeContentHash());
            return r.withSignature(alice.signCanonical(r.getSigningDescriptor()));
        })();
        const legacy2 = (() => {
            let r = new PlacementRecord({ placementId: 'pl-legacy', publicationId: 'pub-1', bounds: BOUNDS, position: new Position(1, 0, 0), revision: 1 });
            r = r.withOwnerIdentity(alice.getSigningIdentity().toJSON());
            r = r.withContentHash(r.computeContentHash());
            return r.withSignature(alice.signCanonical(r.getSigningDescriptor()));
        })();
        assert(legacy1.causalStamp === null && legacy2.causalStamp === null, 'sanity: neither legacy revision carries a causal stamp');

        const r1 = await replica.mergeService.merge(legacy1);
        assert(r1.result === MergeResult.UPDATED, '12a. A legacy (uncausaled) revision merges normally');
        const r2 = await replica.mergeService.merge(legacy2);
        assert(r2.result === MergeResult.CONFLICT,
            '12b. Two legacy revisions with no causal ordering are an indeterminate conflict, not a silent drop');
        assert(r2.conflictSet.revisions.length === 2, '12c. Both legacy revisions are retained in the conflict set');
    }

    // -------------------------------------------------------------
    // 13-15. Security: only integrity-valid, authorized revisions can
    //        ever enter a replica or influence its presented state
    // -------------------------------------------------------------
    {
        const replica = buildReplica();
        const base = genesisRecord(alice, { placementId: 'pl-secure', publicationId: 'pub-1' });
        await replica.mergeService.merge(base);

        // 13. Invalid signature.
        const tampered = base.withPosition(new Position(99, 0, 0));
        const forged = new PlacementRecord({ ...tampered.toJSON(), contentHash: tampered.computeContentHash(), signature: base.signature });
        const r13 = await replica.mergeService.merge(forged);
        assert(r13.result === MergeResult.REJECTED && r13.reason === 'AUTHORIZATION',
            '13. A record with an invalid (reused/mismatched) signature is rejected');
        assert(!replica.replicationStore.has(forged.contentHash), '13b. A rejected record never enters the replication store');
        assert(replica.registry.get('pl-secure').contentHash === base.contentHash, '13c. The rejected record never becomes the presented revision');

        // 14. Unauthorized signer — Bob signs a revision claiming Alice's ownership.
        let bobsForgery = base.withPosition(new Position(50, 0, 0));
        bobsForgery = bobsForgery.withCausalHistory(base.causalStamp.advance(bobId), []);
        bobsForgery = bobsForgery.withContentHash(bobsForgery.computeContentHash());
        bobsForgery = bobsForgery.withSignature(bob.signCanonical(bobsForgery.getSigningDescriptor()));
        // ownerIdentity is still Alice's — Bob is not a recognized delegate (0.2.17 delegation
        // is a separate authorization surface not consulted by LocalAuthorizationVerifier here).
        const r14 = await replica.mergeService.merge(bobsForgery);
        assert(r14.result === MergeResult.REJECTED && r14.reason === 'AUTHORIZATION',
            '14. A record signed by someone other than its declared owner is rejected');

        // 15. Forged high revision number cannot beat valid history merely by being "newer".
        let highRevision = new PlacementRecord({ ...base.toJSON(), revision: 999, signature: null, contentHash: null });
        highRevision = highRevision.withContentHash(highRevision.computeContentHash());
        highRevision = highRevision.withSignature(bob.signCanonical(highRevision.getSigningDescriptor())); // wrong signer
        const r15 = await replica.mergeService.merge(highRevision);
        assert(r15.result === MergeResult.REJECTED, '15. A forged high revision number cannot beat valid history');
        assert(replica.registry.get('pl-secure').revision === 1, '15b. The authentic revision 1 remains presented');
    }

    // -------------------------------------------------------------
    // 16-17. SynchronizeReplicaUseCase — advertise/pull, bidirectional
    //        convergence between two independently-running replicas
    // -------------------------------------------------------------
    {
        const replicaA = buildReplica();
        const replicaB = buildReplica();

        const base = genesisRecord(alice, { placementId: 'pl-sync', publicationId: 'pub-1', x: 0, y: 0, z: 0 });
        await replicaA.mergeService.merge(base);
        assert(replicaB.registry.get('pl-sync') === null, 'sanity: B has not seen the placement yet');

        // 16. B pulls what it is missing from A.
        const sync1 = await replicaB.syncFrom(replicaA.replicationStore).execute();
        assert(sync1.pulled === 1, '16a. B correctly determines it is missing exactly one revision');
        assert(replicaB.registry.get('pl-sync').contentHash === base.contentHash,
            '16b. The missing revision is requested, imported, and merged into B');

        // A concurrent edit on each side while disconnected.
        const editA = nextRevision(alice, base, { x: 3, y: 0, z: 0 });
        const editB = nextRevision(alice, base, { x: 0, y: 3, z: 0 });
        await replicaA.mergeService.merge(editA);
        await replicaB.mergeService.merge(editB);

        // 17. Exchange in both directions — order of who syncs first must not matter.
        const syncBFromA = await replicaB.syncFrom(replicaA.replicationStore).execute();
        const syncAFromB = await replicaA.syncFrom(replicaB.replicationStore).execute();

        assert(replicaA.registry.get('pl-sync').contentHash === replicaB.registry.get('pl-sync').contentHash,
            '17a. Replica A -> B and B -> A both converge to the identical presented revision');
        const csA = replicaA.registry.getConflictSet('pl-sync');
        const csB = replicaB.registry.getConflictSet('pl-sync');
        assert(csA.winner === csB.winner, '17b. Both replicas agree on the same deterministic conflict winner');
        assert(syncBFromA.pulled >= 1 && syncAFromB.pulled >= 1, '17c. Each sync actually pulled the object it was missing');
    }

    // -------------------------------------------------------------
    // 18. Three replicas converge despite different arrival orders
    // -------------------------------------------------------------
    {
        const replicaA = buildReplica();
        const replicaB = buildReplica();
        const replicaC = buildReplica();

        const base = genesisRecord(alice, { placementId: 'pl-three', publicationId: 'pub-1' });
        const editA = nextRevision(alice, base, { x: 7, y: 0, z: 0 });
        const editB = nextRevision(alice, base, { x: 0, y: 7, z: 0 });

        await replicaA.mergeService.merge(base);
        await replicaA.mergeService.merge(editA);
        await replicaB.mergeService.merge(base);
        await replicaB.mergeService.merge(editB);

        // C sees B's edit before A's — the opposite of how A itself received them.
        await replicaC.mergeService.merge(base);
        await replicaC.mergeService.merge(editB);
        await replicaC.mergeService.merge(editA);

        await replicaB.syncFrom(replicaA.replicationStore).execute();
        await replicaA.syncFrom(replicaB.replicationStore).execute();
        await replicaC.syncFrom(replicaA.replicationStore).execute();

        const winners = new Set([
            replicaA.registry.get('pl-three').contentHash,
            replicaB.registry.get('pl-three').contentHash,
            replicaC.registry.get('pl-three').contentHash
        ]);
        assert(winners.size === 1, '18. All three replicas converge to one winner regardless of arrival order');
    }

    // -------------------------------------------------------------
    // 19-20. Spatial index reflects reconciled state; a stale
    //        decentralized index entry never resurrects a losing
    //        revision (0.2.15's "index is an accelerator, not truth"
    //        carried into 0.2.18's conflict resolution).
    // -------------------------------------------------------------
    {
        const replica = buildReplica();
        const base = genesisRecord(alice, { placementId: 'pl-index', publicationId: 'pub-1', x: 0, y: 0, z: 0 });
        await replica.mergeService.merge(base);
        // Publish the decentralized index once, capturing revision 1.
        replica.spatialIndexBuilder.addOrUpdatePlacement(replica.registry.get('pl-index'));

        const editA = nextRevision(alice, base, { x: 20, y: 0, z: 0 });
        const editB = nextRevision(alice, base, { x: 0, y: 20, z: 0 });
        await replica.mergeService.merge(editA); // UPDATED, and rebuilds the decentralized index
        const conflict = await replica.mergeService.merge(editB); // CONCURRENT

        const winnerRecord = conflict.winner === editA.contentHash ? editA : editB;
        const loserRecord = conflict.winner === editA.contentHash ? editB : editA;

        assert(replica.spatialIndexProvider.get('pl-index').position.x === winnerRecord.position.x
            && replica.spatialIndexProvider.get('pl-index').position.y === winnerRecord.position.y,
            '19. The local spatial index reflects the reconciled winner, not whichever revision arrived first');

        const found = replica.discoveryProvider.discover(winnerRecord.position, 1);
        assert(found.some((r) => r.placementId === 'pl-index' && r.contentHash === winnerRecord.contentHash),
            '20a. Discovery through the decentralized index resolves to the reconciled winner');
        assert(!found.some((r) => r.contentHash === loserRecord.contentHash),
            '20b. A stale/losing revision is never resurrected by discovery');
    }

    // -------------------------------------------------------------
    // FLAGSHIP: publish -> sign -> place -> concurrent move on two
    // disconnected replicas of the SAME owner -> exchange -> detect
    // conflict -> deterministic convergence -> spatial index rebuilt
    // -------------------------------------------------------------
    {
        const replicaA = buildReplica();
        const replicaB = buildReplica();

        // Alice places a publication on "her phone" (replica A).
        const placeOnA = new PlacePublicationUseCase(
            replicaA.spatialIndexProvider, { findById: () => ({ id: 'pub-flagship' }) },
            null, null, replicaA.registry, alice, replicaA.spatialIndexBuilder
        );
        const placement = placeOnA.execute('pub-flagship', new Position(0, 0, 0), { bounds: BOUNDS });
        const genesis = replicaA.registry.get(placement.id);
        assert(genesis.signature && genesis.causalStamp, 'flagship-a. The placed revision is signed and causally stamped');

        // Replicate the genesis revision to "her laptop" (replica B).
        await replicaA.mergeService.merge(genesis); // no-op re-merge of a locally-created record is safe
        const syncSeed = await replicaB.syncFrom(replicaA.replicationStore).execute();
        assert(syncSeed.pulled === 1 && replicaB.registry.get(placement.id) !== null,
            'flagship-b. Replica B receives the genesis placement via replication');

        // Alice moves the placement independently on both devices while disconnected.
        const moveOnA = new MoveWorldPlacementUseCase(replicaA.spatialIndexProvider, replicaA.registry, replicaA.spatialIndexBuilder, alice);
        const moveOnB = new MoveWorldPlacementUseCase(replicaB.spatialIndexProvider, replicaB.registry, replicaB.spatialIndexBuilder, alice);
        moveOnA.execute(placement.id, new Position(12, 0, 0));
        moveOnB.execute(placement.id, new Position(0, 12, 0));

        const revA = replicaA.registry.get(placement.id);
        const revB = replicaB.registry.get(placement.id);
        // Production code advances the causal clock by signer did:key
        // (see MoveWorldPlacementUseCase) — since both devices sign as
        // the SAME Alice, their clocks land EQUAL, not concurrentWith;
        // either way neither happens-before the other, so neither can
        // simply "win" by causal order alone.
        const relation = replicaA.resolver.compare(revA.causalStamp, revB.causalStamp);
        assert(relation === ConflictRelation.EQUAL || relation === ConflictRelation.CONCURRENT,
            'flagship-c. The two independent moves are not causally ordered');
        assert(revA.contentHash !== revB.contentHash, 'flagship-c2. ...yet they are genuinely different revisions');

        // Exchange: each replica pulls what the other has.
        await replicaA.mergeService.merge(revA); // ensure it's addressable for the accumulation fallback
        await replicaB.mergeService.merge(revB);
        const pullBFromA = await replicaB.syncFrom(replicaA.replicationStore).execute();
        const pullAFromB = await replicaA.syncFrom(replicaB.replicationStore).execute();

        const conflictOnB = pullBFromA.results.find((r) => r.result === MergeResult.CONFLICT);
        const conflictOnA = pullAFromB.results.find((r) => r.result === MergeResult.CONFLICT);
        assert(conflictOnB && conflictOnA, 'flagship-d. Both replicas detect the conflict during synchronization');
        assert(conflictOnA.winner === conflictOnB.winner, 'flagship-e. Deterministic convergence: identical winner on both replicas');

        const finalA = replicaA.registry.get(placement.id);
        const finalB = replicaB.registry.get(placement.id);
        assert(finalA.contentHash === finalB.contentHash, 'flagship-f. Both replicas present the identical winning revision');

        // The decentralized spatial index was rebuilt from the reconciled state on both sides.
        const discoveredA = replicaA.discoveryProvider.discover(finalA.position, 1);
        const discoveredB = replicaB.discoveryProvider.discover(finalB.position, 1);
        assert(discoveredA.some((r) => r.contentHash === finalA.contentHash),
            'flagship-g. Replica A discovers the reconciled placement at its winning position');
        assert(discoveredB.some((r) => r.contentHash === finalB.contentHash),
            'flagship-h. Replica B discovers the reconciled placement at its winning position');

        // Neither disconnected edit was destroyed — both remain independently verifiable.
        assert(replicaA.registry.getConflictSet(placement.id).revisions.length === 2
            && replicaB.registry.getConflictSet(placement.id).revisions.length === 2,
            'flagship-i. Both concurrent histories are retained, on both replicas, not merely the winner');
    }

    console.log('✅ All Decentralized Replication & Conflict Handling tests passed.');
}

runTests().catch((e) => { console.error(e); throw e; });
