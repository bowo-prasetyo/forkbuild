import { PlacementRecord } from '../core/PlacementRecord.js';

export class SynchronizeReplicaUseCase {
    constructor({ localStore, remoteStore, mergeService }) {
        this._localStore = localStore;
        this._remoteStore = remoteStore;
        this._mergeService = mergeService;
    }
    
    async execute() {
        const localRefs = this._localStore.getReferences('placements');
        const remoteRefs = this._remoteStore.getReferences('placements');
        
        const localSet = new Set(localRefs);
        const remoteSet = new Set(remoteRefs);
        
        const toPull = remoteRefs.filter(r => !localSet.has(r));
        const toPush = localRefs.filter(r => !remoteSet.has(r));
        
        const results = [];
        for (const hash of toPull) {
            const json = this._remoteStore.get(hash);
            if (json) {
                const record = PlacementRecord.fromJSON(json);
                const res = await this._mergeService.merge(record);
                results.push({ hash, ...res });
            }
        }
        
        return { pulled: toPull.length, pushed: toPush.length, results };
    }
}
