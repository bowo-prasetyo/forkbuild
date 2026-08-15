import { PlacementRecord } from '../core/PlacementRecord.js';
import { LocalReplicationStore } from '../replication/LocalReplicationStore.js';

const SCOPE = LocalReplicationStore.DEFAULT_SCOPE;

// The flagship replication flow (0.2.18): advertise -> determine
// missing references -> request -> verify -> merge, transport-
// independent (localStore/remoteStore only need getReferences/get/put —
// see replication/ReplicationStore.js):
//
//   Replica A -- advertise references --> Replica B
//                                          determine missing references
//   Replica A <-- request missing objects --
//                                          verify -> merge -> converged
//
// Deliberately PULL-ONLY, matching the diagram above exactly: this use
// case only ever changes THIS replica's registry, through its own
// ReplicaMergeService, never the remote's. A remote object only
// becomes part of a replica's presented/reconciled state once THAT
// replica's own merge pipeline has verified it — there is no "push"
// that writes bytes into a remote's store on its behalf, because
// nothing would ever reconcile them into the remote's registry (the
// remote is not assumed to expose its merge pipeline, only the four
// ReplicationStore methods — it may be a real network peer). Two
// replicas converge by each running this once against the other as
// "remote" (see the flagship test in
// tests/DecentralizedReplication.test.js).
export class SynchronizeReplicaUseCase {
    constructor({ localStore, remoteStore, mergeService }) {
        this._localStore = localStore;
        this._remoteStore = remoteStore;
        this._mergeService = mergeService;
    }

    async execute() {
        const localRefs = new Set(this._localStore.getReferences(SCOPE));
        const remoteRefs = this._remoteStore.getReferences(SCOPE);
        const toPull = remoteRefs.filter((hash) => !localRefs.has(hash));

        const results = [];
        for (const hash of toPull) {
            const json = this._remoteStore.get(hash, SCOPE);
            if (json) {
                const record = PlacementRecord.fromJSON(json);
                const res = await this._mergeService.merge(record);
                results.push({ hash, ...res });
            }
        }

        return { pulled: toPull.length, results };
    }
}
