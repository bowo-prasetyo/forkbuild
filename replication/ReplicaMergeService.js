import { ConflictRelation } from './ConflictResolver.js';
import { ConflictSet } from '../core/ConflictSet.js';
import { PlacementRecord } from '../core/PlacementRecord.js';

export const MergeResult = Object.freeze({
    IGNORED: 'IGNORED',
    UPDATED: 'UPDATED',
    CONFLICT: 'CONFLICT',
    REJECTED: 'REJECTED'
});

// The central merge engine (0.2.18): the only place an incoming
// PlacementRecord — from replication, not from this replica's own
// editing flows — is allowed to change what this replica presents as
// the current revision of a placement.
//
// Pipeline, in this fixed order (docs/Principles.md, "Integrity,
// signature, and authorization are evaluated before a revision
// participates in conflict resolution"):
//
//   content integrity -> signature + authorization -> store immutable
//   object -> causal comparison -> (dominated | dominates | concurrent)
//
// A record that fails integrity or authorization never enters the
// replication store and never reaches causal comparison — an attacker
// cannot use a forged high revision, nor a stolen/absent signature, to
// influence which revision this replica presents (0.2.16's "newer
// VALID revision wins" carried forward unchanged; 0.2.18 only adds
// what happens once two revisions are BOTH valid).
export class ReplicaMergeService {
    constructor({
        resolver, policy, verifier = null, registry, replicationStore, spatialIndexBuilder = null,
        replayGuard = null
    }) {
        this._resolver = resolver;
        this._policy = policy;
        this._verifier = verifier;
        this._registry = registry;
        this._replicationStore = replicationStore;
        this._spatialIndexBuilder = spatialIndexBuilder;
        this._replayGuard = replayGuard;
    }

    async merge(incomingJson) {
        const incomingRecord = incomingJson instanceof PlacementRecord
            ? incomingJson
            : PlacementRecord.fromJSON(incomingJson);

        // 1. Integrity — is this exactly the object it claims to be?
        if (!incomingRecord.verifyIntegrity()) {
            return { result: MergeResult.REJECTED, reason: 'INTEGRITY' };
        }

        // 0.2.19: "have I already verified this EXACT object" is a
        // separate, cheaper question from "is it eligible to be
        // current" (replication/ReplayGuard.js) — a hit here only ever
        // skips re-running signature/authorization on bytes already
        // proven authentic; it never changes the causal-eligibility
        // decision below.
        const alreadyAccepted = !!this._replayGuard
            && this._replayGuard.hasAccepted(incomingRecord.contentHash, 'placement-record');

        // 2. Signature + authorization — was the signer allowed to
        // produce this revision? (identity/LocalAuthorizationVerifier,
        // 0.2.16). A verifier is required for real replication; tests
        // that intentionally exercise the pipeline without one accept
        // every integrity-valid record — never do this against an
        // untrusted transport.
        if (!alreadyAccepted && this._verifier) {
            const authResult = await this._verifier.verifyPlacement(incomingRecord);
            if (!authResult.valid) {
                return { result: MergeResult.REJECTED, reason: 'AUTHORIZATION', detail: authResult.reason };
            }
        }

        // 3. Only integrity-valid, authorized revisions enter the
        // content-addressed replication store.
        this._replicationStore.put(incomingRecord);
        if (this._replayGuard) {
            this._replayGuard.recordAccepted(incomingRecord.contentHash, 'placement-record');
        }

        // 4. Causal comparison against whatever this replica currently
        // presents for the placement.
        const placementId = incomingRecord.placementId;
        const current = this._registry.get(placementId);

        if (!current) {
            this._registry.add(incomingRecord);
            this._registry.setLatest(placementId, incomingRecord);
            this._rebuildSpatialIndex(incomingRecord);
            return { result: MergeResult.UPDATED, winner: incomingRecord.contentHash };
        }

        const relation = this._resolver.compare(current.causalStamp, incomingRecord.causalStamp);
        const isDuplicate = relation === ConflictRelation.EQUAL
            && current.contentHash === incomingRecord.contentHash;

        if (isDuplicate) {
            return { result: MergeResult.IGNORED, reason: 'DUPLICATE' };
        }

        if (relation === ConflictRelation.BEFORE) {
            // current happens-before incoming: incoming is causally newer.
            this._registry.add(incomingRecord);
            this._registry.setLatest(placementId, incomingRecord);
            this._rebuildSpatialIndex(incomingRecord);
            return { result: MergeResult.UPDATED, winner: incomingRecord.contentHash };
        }

        if (relation === ConflictRelation.AFTER) {
            // incoming happens-before current: incoming is causally older.
            // Retained in history (never destroyed), never presented.
            // add() also (re-)writes the latest pointer as a side effect
            // of appending history — restore it to `current` explicitly
            // rather than relying on call order.
            this._registry.add(incomingRecord);
            this._registry.setLatest(placementId, current);
            return { result: MergeResult.IGNORED, reason: 'OLDER' };
        }

        // CONCURRENT — including the EQUAL-but-different-content case:
        // two revisions whose causal stamps carry no ordering
        // information at all (e.g. both legacy pre-0.2.18 revisions
        // with no causal stamp) cannot be ordered either, and must be
        // treated exactly like a genuine concurrent edit rather than
        // silently dropped.
        this._registry.add(incomingRecord);
        // `current` may be a purely local revision (created directly by
        // PlacePublicationUseCase/MoveWorldPlacementUseCase and never
        // routed through merge()) — make sure it's addressable so a
        // THIRD concurrent revision can still resolve it as a
        // conflict-set member below, not just "current" or "incoming".
        this._replicationStore.put(current);

        // Accumulate against any conflict this placement is already
        // part of, so a third (fourth, ...) concurrent revision widens
        // the same ConflictSet instead of replacing it — no competing
        // valid history is ever dropped from the set merely because a
        // later revision arrived (docs/Principles.md, 0.2.18).
        const existingConflict = this._registry.getConflictSet(placementId);
        const candidates = [
            ...(existingConflict ? existingConflict.revisions : []),
            { revision: current.revision, hash: current.contentHash },
            { revision: incomingRecord.revision, hash: incomingRecord.contentHash }
        ];
        const uniqueRevisions = Array.from(
            new Map(candidates.map((r) => [r.hash, r])).values()
        );

        const winnerHash = this._policy.selectWinner(uniqueRevisions);
        const winnerRecord = this._resolveRecord(winnerHash, current, incomingRecord);

        this._registry.setLatest(placementId, winnerRecord);
        this._rebuildSpatialIndex(winnerRecord);

        const conflictSet = new ConflictSet({
            placementId,
            revisions: uniqueRevisions,
            winner: winnerHash
        });
        this._registry.setConflictSet(placementId, conflictSet);

        return { result: MergeResult.CONFLICT, conflictSet, winner: winnerHash };
    }

    // Resolves a conflict-set member by content hash. The winner is
    // usually `current` or `incomingRecord`, but once a placement has
    // three or more concurrent revisions the deterministic winner can be
    // an earlier member neither of those — fall back to whatever this
    // replica has stored for it.
    _resolveRecord(hash, ...candidates) {
        for (const candidate of candidates) {
            if (candidate && candidate.contentHash === hash) {
                return candidate;
            }
        }
        const json = this._replicationStore.get(hash);
        return json ? PlacementRecord.fromJSON(json) : candidates[candidates.length - 1];
    }

    // Replication state is authoritative; the spatial index is an
    // accelerator rebuilt/updated FROM the reconciled placement state
    // (docs/Principles.md, 0.2.15 + 0.2.18) — never the other way
    // around. Optional: a replica with no SpatialIndexBuilder wired
    // (e.g. a pure storage node) still merges and reconciles correctly.
    _rebuildSpatialIndex(winnerRecord) {
        if (this._spatialIndexBuilder) {
            this._spatialIndexBuilder.addOrUpdatePlacement(winnerRecord);
        }
    }
}
