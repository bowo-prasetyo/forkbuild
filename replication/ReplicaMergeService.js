import { ConflictRelation } from './ConflictResolver.js';
import { ConflictSet } from '../core/ConflictSet.js';
import { PlacementRecord } from '../core/PlacementRecord.js';

export const MergeResult = Object.freeze({
    IGNORED: 'IGNORED',
    UPDATED: 'UPDATED',
    CONFLICT: 'CONFLICT',
    REJECTED: 'REJECTED'
});

export class ReplicaMergeService {
    constructor({ resolver, policy, verifier, registry, replicationStore }) {
        this._resolver = resolver;
        this._policy = policy;
        this._verifier = verifier;
        this._registry = registry;
        this._replicationStore = replicationStore;
    }
    
    async merge(incomingJson) {
        const incomingRecord = incomingJson instanceof PlacementRecord 
            ? incomingJson 
            : PlacementRecord.fromJSON(incomingJson);
        
        // 1. Integrity
        if (!incomingRecord.verifyIntegrity()) {
            return { result: MergeResult.REJECTED, reason: 'INTEGRITY' };
        }
        
        // 2. Store immutable object
        this._replicationStore.put(incomingRecord);
        
        // 3. Signature & Authorization
        if (this._verifier) {
            const authResult = await this._verifier.verifyPlacement(incomingRecord);
            if (!authResult.valid) {
                return { result: MergeResult.REJECTED, reason: 'AUTHORIZATION', detail: authResult.reason };
            }
        }
        
        // 4. Causal comparison
        const placementId = incomingRecord.placementId;
        const current = this._registry.get(placementId);
        
        if (!current) {
            this._registry.add(incomingRecord);
            this._registry.setLatest(placementId, incomingRecord);
            return { result: MergeResult.UPDATED, winner: incomingRecord.contentHash };
        }
        
        const relation = this._resolver.compare(current.causalStamp, incomingRecord.causalStamp);
        
        if (relation === ConflictRelation.EQUAL) {
            if (current.contentHash === incomingRecord.contentHash) {
                return { result: MergeResult.IGNORED, reason: 'DUPLICATE' };
            }
        }
        
        if (relation === ConflictRelation.BEFORE) {
            // Incoming is causally newer
            this._registry.add(incomingRecord);
            this._registry.setLatest(placementId, incomingRecord);
            return { result: MergeResult.UPDATED, winner: incomingRecord.contentHash };
        }
        
        if (relation === ConflictRelation.AFTER) {
            // Incoming is older
            this._registry.add(incomingRecord); // Retain in history
            return { result: MergeResult.IGNORED, reason: 'OLDER' };
        }
        
        if (relation === ConflictRelation.CONCURRENT) {
            this._registry.add(incomingRecord);
            
            const revisions = [
                { revision: current.revision, hash: current.contentHash },
                { revision: incomingRecord.revision, hash: incomingRecord.contentHash }
            ];
            
            // Deduplicate hashes
            const uniqueMap = new Map();
            for (const r of revisions) uniqueMap.set(r.hash, r);
            const uniqueRevisions = Array.from(uniqueMap.values());
            
            const winnerHash = this._policy.selectWinner(uniqueRevisions);
            const winnerRecord = winnerHash === current.contentHash ? current : incomingRecord;
            
            this._registry.setLatest(placementId, winnerRecord);
            
            const conflictSet = new ConflictSet({
                placementId,
                revisions: uniqueRevisions,
                winner: winnerHash
            });
            this._registry.setConflictSet(placementId, conflictSet);
            
            return { result: MergeResult.CONFLICT, conflictSet, winner: winnerHash };
        }
        
        return { result: MergeResult.IGNORED };
    }
}
