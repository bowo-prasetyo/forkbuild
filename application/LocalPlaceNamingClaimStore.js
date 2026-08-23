import { PlaceNamingClaim } from '../core/PlaceNamingClaim.js';

const STORAGE_KEY_PREFIX = 'place-naming-claims:';

// 0.5.2 — Place Naming & Naming Claims.
//
// Local, persisted storage for PlaceNamingClaims — deliberately the
// SAME shape LocalPublisherProvider.js already keeps for Publications
// (one flat list under one storage key, read-modify-write), applied
// here to a much smaller record. This is the "establish the data model
// first" half of 0.5.2's own scope: it stores and lists claims for
// whichever World this replica happens to have — it never gossips one
// to a peer, never fetches one from anywhere else, and never reconciles
// two replicas' independently-published claims into one. See
// docs/Roadmap.md, 0.5.2, "Deliberately excluded," for why a real
// decentralized exchange transport is sized as its own future
// milestone, not attempted here.
//
// Keyed by worldId (STORAGE_KEY_PREFIX + worldId) rather than one
// single global list — a naming claim is always ABOUT one region in
// one World, and scoping storage the same way lets a caller load "every
// claim for World W" without ever scanning claims for Worlds it has
// nothing to do with, the same per-document storage-key discipline
// application/WorldMembershipUseCase.js already keeps (there, keyed by
// owner username instead).
export class LocalPlaceNamingClaimStore {
    constructor(storageProvider) {
        if (!storageProvider) {
            throw new Error('LocalPlaceNamingClaimStore: storageProvider is required');
        }
        this._storageProvider = storageProvider;
    }

    // Persists `claim` (a PlaceNamingClaim) alongside whatever this
    // World already has on file. Never deduplicates by (regionId, name,
    // authorIdentityId) — the same author claiming the same name twice
    // is two distinct, independently-timestamped claims, exactly like
    // two identical Publications of the same document would be two
    // distinct publications; see core/PlaceNamingClaim.js's own header.
    save(claim) {
        const all = this._loadAll(claim.worldId);
        all.push(claim.toJSON());
        this._storageProvider.save(STORAGE_KEY_PREFIX + claim.worldId, all);
    }

    // Every claim on file for `worldId`, most recent first. Returns
    // PlaceNamingClaim instances, never raw JSON — the one boundary
    // every caller (core/PlaceNamingView.js#namingView(), a UI listing)
    // can rely on without re-parsing dates/signatures itself.
    list(worldId) {
        return this._loadAll(worldId)
            .map((json) => PlaceNamingClaim.fromJSON(json))
            .filter(Boolean)
            .sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());
    }

    // Every claim on file for one region across the whole World — a
    // thin filter over list(), never a second storage key. Mirrors
    // core/PlaceNamingView.js#claimsForRegion()'s own filter, applied
    // here to what THIS replica has actually persisted rather than an
    // in-memory list a caller already holds.
    listForRegion(worldId, regionId) {
        return this.list(worldId).filter((claim) => claim.regionId === regionId);
    }

    // Withdraws a claim this replica itself stored, by id. Retraction
    // is LOCAL ONLY — it removes the claim from what THIS replica shows
    // going forward, but (like every publish/unpublish pair in this
    // codebase — see publisher/LocalPublisherProvider.js#unpublish())
    // can never reach into another replica that already copied the
    // claim before it was withdrawn. Returns true if a claim existed
    // and was removed.
    retract(worldId, claimId) {
        const all = this._loadAll(worldId);
        const index = all.findIndex((json) => json.id === claimId);
        if (index === -1) {
            return false;
        }
        all.splice(index, 1);
        this._storageProvider.save(STORAGE_KEY_PREFIX + worldId, all);
        return true;
    }

    _loadAll(worldId) {
        return this._storageProvider.load(STORAGE_KEY_PREFIX + worldId) || [];
    }
}
