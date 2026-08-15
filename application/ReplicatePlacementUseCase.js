// The explicit entry point for accepting a single incoming
// PlacementRecord from replication — a thin wrapper so callers depend
// on a use case, not directly on ReplicaMergeService. See
// SynchronizeReplicaUseCase for the batch/advertise-and-pull flow this
// is the unit of.
export class ReplicatePlacementUseCase {
    constructor(mergeService) {
        this._mergeService = mergeService;
    }
    
    async execute(record) {
        return this._mergeService.merge(record);
    }
}
