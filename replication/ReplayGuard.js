// Answers exactly one question, and deliberately only that one:
//
//     "Have I already accepted this immutable object?"
//
// That is a DIFFERENT question from "is this object still eligible to
// affect current state?" (causal ordering — replication/
// ConflictResolver.js + ReplicaMergeService.js). Conflating the two is
// how a replayed-but-historically-valid object ends up masquerading as
// current: a revision that was legitimately accepted five minutes ago
// remains verifiable forever (0.2.18), but replaying it now must not
// re-trigger whatever accepting it the first time caused, and must not
// be treated as new information.
//
// ReplayGuard is content-hash keyed and object-type agnostic — the
// same instance can track PlacementRecords, Delegations, and
// SpatialIndexRoots, each under its own scope, without knowing
// anything about what those objects mean. It is intentionally NOT the
// thing that decides what "current" is; ReplicaMergeService and
// DecentralizedSpatialDiscoveryProvider keep owning that.
export class ReplayGuard {
    static DEFAULT_SCOPE = 'default';

    // storageProvider is optional — omit it for an in-memory guard
    // (the common case: one guard per live replica process). Pass one
    // to persist "already seen" across restarts.
    constructor(storageProvider = null) {
        this._storage = storageProvider;
        this._memory = new Set();
    }

    _key(hash, scope) {
        return `replay-guard:${scope || ReplayGuard.DEFAULT_SCOPE}:${hash}`;
    }

    hasAccepted(hash, scope = ReplayGuard.DEFAULT_SCOPE) {
        const key = this._key(hash, scope);
        if (this._memory.has(key)) {
            return true;
        }
        return !!this._storage && this._storage.load(key) !== null;
    }

    // Idempotent: recording the same hash twice is a no-op. Returns
    // `hash` so this can be chained after a verification step.
    recordAccepted(hash, scope = ReplayGuard.DEFAULT_SCOPE) {
        const key = this._key(hash, scope);
        this._memory.add(key);
        if (this._storage) {
            this._storage.save(key, true);
        }
        return hash;
    }
}
