import { CausalStamp } from '../core/CausalStamp.js';
import { PlacementRecord } from '../core/PlacementRecord.js';
import { ConflictResolver, ConflictRelation } from '../replication/ConflictResolver.js';
import { ConflictPolicy } from '../replication/ConflictPolicy.js';
import { ReplicaMergeService, MergeResult } from '../replication/ReplicaMergeService.js';
import { LocalReplicationStore } from '../replication/LocalReplicationStore.js';
import { LocalPlacementRegistry } from '../placement/LocalPlacementRegistry.js';
import { LocalSpatialIndexProvider } from '../spatial/LocalSpatialIndexProvider.js';
import { StorageProvider } from '../storage/StorageProvider.js';
import { Position } from '../core/Position.js';
import { SigningIdentity } from '../core/SigningIdentity.js';

class InMemoryStorageProvider extends StorageProvider {
    constructor() { super(); this._data = new Map(); }
    save(name, data) { this._data.set(name, JSON.parse(JSON.stringify(data))); }
    load(name) { return this._data.has(name) ? JSON.parse(JSON.stringify(this._data.get(name))) : null; }
    remove(name) { this._data.delete(name); }
    list() { return Array.from(this._data.keys()); }
}

class MockVerifier {
    constructor(validIds = new Set()) { this.validIds = validIds; }
    async verifyPlacement(record) {
        if (this.validIds.has(record.ownerIdentity?.id)) return { valid: true };
        return { valid: false, reason: 'UNAUTHORIZED' };
    }
}

function assert(condition, message) {
    if (!condition) throw new Error(`ASSERT FAILED: ${message}`);
}

async function runTests() {
    const alice = new SigningIdentity({ id: 'alice', username: 'alice', providerId: 'local', privateKey: 'alice-key' });
    const bob = new SigningIdentity({ id: 'bob', username: 'bob', providerId: 'local', privateKey: 'bob-key' });
    
    const storageA = new InMemoryStorageProvider();
    const storageB = new InMemoryStorageProvider();
    
    const spatialA = new LocalSpatialIndexProvider(storageA);
    const spatialB = new LocalSpatialIndexProvider(storageB);
    
    const registryA = new LocalPlacementRegistry(storageA, spatialA);
    const registryB = new LocalPlacementRegistry(storageB, spatialB);
    
    const replA = new LocalReplicationStore(storageA);
    const replB = new LocalReplicationStore(storageB);
    
    const verifier = new MockVerifier(new Set(['alice', 'bob']));
    const resolver = new ConflictResolver();
    const policy = new ConflictPolicy();
    
    const mergeA = new ReplicaMergeService({ resolver, policy, verifier, registry: registryA, replicationStore: replA });
    const mergeB = new ReplicaMergeService({ resolver, policy, verifier, registry: registryB, replicationStore: replB });

    // 1-3. CausalStamp logic
    const stampA = new CausalStamp({ clock: { alice: 1 } });
    const stampB = new CausalStamp({ clock: { alice: 1, bob: 1 } });
    assert(stampA.happensBefore(stampB), 'A happens-before B');
    assert(!stampB.happensBefore(stampA), 'B does not happen-before A');
    
    const stampC = new CausalStamp({ clock: { alice: 2 } });
    assert(stampB.concurrentWith(stampC), 'B and C are concurrent');

    // 4-8. Base Revision Creation
    const baseRecord = new PlacementRecord({
        placementId: 'pl-1', publicationId: 'pub-1', ownerIdentity: alice,
        position: new Position(0,0,0), revision: 1,
        causalStamp: new CausalStamp({ clock: { alice: 1 } })
    });
    baseRecord._contentHash = baseRecord.computeContentHash();
    baseRecord._signature = await alice.sign(baseRecord.getCanonicalPayload());
    
    const resA1 = await mergeA.merge(baseRecord);
    assert(resA1.result === MergeResult.UPDATED, 'Base record merged on A');
    
    // Replicate base to B
    const resB1 = await mergeB.merge(baseRecord);
    assert(resB1.result === MergeResult.UPDATED, 'Base record merged on B');

    // 9-10. Concurrent Edits
    const recordA = baseRecord.withPosition(new Position(10, 0, 0)).withCausalHistory(
        baseRecord.causalStamp.advance('alice'),
        [{ placementId: 'pl-1', revision: 1, contentReference: { hash: baseRecord.contentHash } }]
    );
    recordA._contentHash = recordA.computeContentHash();
    recordA._signature = await alice.sign(recordA.getCanonicalPayload());
    
    const recordB = baseRecord.withPosition(new Position(0, 10, 0)).withCausalHistory(
        baseRecord.causalStamp.advance('bob'),
        [{ placementId: 'pl-1', revision: 1, contentReference: { hash: baseRecord.contentHash } }]
    );
    recordB._contentHash = recordB.computeContentHash();
    recordB._signature = await bob.sign(recordB.getCanonicalPayload());

    // A receives its own edit
    const resA2 = await mergeA.merge(recordA);
    assert(resA2.result === MergeResult.UPDATED, 'A updates to its own edit');
    
    // B receives its own edit
    const resB2 = await mergeB.merge(recordB);
    assert(resB2.result === MergeResult.UPDATED, 'B updates to its own edit');

    // 11-12. Exchange and Conflict Detection
    // A receives B's edit
    const resA3 = await mergeA.merge(recordB);
    assert(resA3.result === MergeResult.CONFLICT, 'A detects conflict');
    
    // B receives A's edit
    const resB3 = await mergeB.merge(recordA);
    assert(resB3.result === MergeResult.CONFLICT, 'B detects conflict');

    // 13. Deterministic Convergence
    assert(resA3.winner === resB3.winner, 'Both replicas select the exact same winner');
    assert(resA3.conflictSet.revisions.length === 2, 'Conflict set contains both histories');
    
    // 14. History is retained
    const historyA = registryA.getHistory('pl-1');
    assert(historyA.length === 3, 'A retains base, A-edit, and B-edit');
    
    // 15. Spatial Index reflects the winner
    const winnerRecord = resA3.winner === recordA.contentHash ? recordA : recordB;
    const spatialPosA = spatialA.get('pl-1').position;
    assert(spatialPosA.x === winnerRecord.position.x && spatialPosA.y === winnerRecord.position.y, 
           'Spatial index on A reflects the deterministic winner');

    console.log('✅ All Decentralized Replication & Conflict Handling tests passed.');
}

runTests().catch(console.error);
