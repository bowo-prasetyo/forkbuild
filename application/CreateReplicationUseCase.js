import { LocalReplicationStore } from '../replication/LocalReplicationStore.js';
import { ConflictResolver } from '../replication/ConflictResolver.js';
import { ConflictPolicy } from '../replication/ConflictPolicy.js';
import { ReplicaMergeService } from '../replication/ReplicaMergeService.js';
import { ReplicatePlacementUseCase } from './ReplicatePlacementUseCase.js';
import { SynchronizeReplicaUseCase } from './SynchronizeReplicaUseCase.js';
import { LocalAuthorizationVerifier } from '../identity/LocalAuthorizationVerifier.js';
import { ReplayGuard } from '../replication/ReplayGuard.js';

// Wires the concrete replication backend (0.2.18): a LocalReplicationStore
// for this replica's exchanged immutable objects, and the
// ReplicaMergeService that turns an incoming PlacementRecord into either
// an updated presentation pointer or a recorded ConflictSet — never a
// silent overwrite. Same DI pattern as CreatePlacementRegistryUseCase;
// swapping the transport (HTTP, WebRTC, IPFS, libp2p) later means
// changing what backs `remoteStore`, never this wiring or the merge
// pipeline itself (replication/ReplicationStore.js).
//
// spatialIndexBuilder is optional: wire it so a merge that changes the
// presentation winner also republishes the decentralized spatial index
// from the reconciled state (docs/Principles.md, 0.2.15 + 0.2.18).
//
// As of 0.2.19, a ReplayGuard is wired by default (pass `replayGuard:
// null` to opt out) so repeatedly-seen objects skip re-verification
// cheaply — see replication/ReplayGuard.js and identity/TrustPolicy.js.
export class CreateReplicationUseCase {
    execute(storageProvider, placementRegistry, {
        spatialIndexBuilder = null,
        indexAuthorityIdentity = null,
        replayGuard = new ReplayGuard()
    } = {}) {
        const replicationStore = new LocalReplicationStore(storageProvider);
        const resolver = new ConflictResolver();
        const policy = new ConflictPolicy();
        const verifier = new LocalAuthorizationVerifier({ indexAuthorityIdentity });

        const mergeService = new ReplicaMergeService({
            resolver,
            policy,
            verifier,
            registry: placementRegistry,
            replicationStore,
            spatialIndexBuilder,
            replayGuard
        });

        return {
            replicationStore,
            resolver,
            policy,
            verifier,
            replayGuard,
            mergeService,
            replicatePlacementUseCase: new ReplicatePlacementUseCase(mergeService),
            // A replica has exactly one local store but potentially many
            // peers; build a SynchronizeReplicaUseCase per remote rather
            // than fixing one at wiring time.
            createSynchronizeUseCase: (remoteStore) => new SynchronizeReplicaUseCase({
                localStore: replicationStore,
                remoteStore,
                mergeService
            })
        };
    }
}
