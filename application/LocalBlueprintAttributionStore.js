import { BlueprintAttribution } from '../core/BlueprintAttribution.js';

const STORAGE_KEY_PREFIX = 'blueprint-attributions:';

// 0.6.5 — Blueprint Identity & Attribution.
//
// Local, persisted storage for BlueprintAttributions — deliberately the
// SAME shape application/LocalPlaceNamingClaimStore.js already keeps for
// PlaceNamingClaims (one flat list under one storage key, read-modify-
// write), applied here to a fingerprint instead of a (worldId, regionId)
// pair. This is the "establish the data model first" half of 0.6.5's own
// scope: it stores and lists attributions this replica knows about; it
// never gossips one to a peer, never fetches one from anywhere else, and
// never reconciles two replicas' independently-published attributions
// into one. See docs/Roadmap.md, 0.6.5, "Deliberately excluded," for why
// a real decentralized exchange transport is sized as its own future
// milestone (0.6.6), not attempted here.
//
// Keyed by fingerprint (STORAGE_KEY_PREFIX + fingerprint) rather than one
// single global list — an attribution is always ABOUT one blueprint
// design, and scoping storage the same way lets a caller load "every
// attribution for design X" without ever scanning attributions for
// designs it has nothing to do with, the same per-region storage-key
// discipline LocalPlaceNamingClaimStore.js already keeps one domain over.
export class LocalBlueprintAttributionStore {
    constructor(storageProvider) {
        if (!storageProvider) {
            throw new Error('LocalBlueprintAttributionStore: storageProvider is required');
        }
        this._storageProvider = storageProvider;
    }

    // Persists `attribution` (a BlueprintAttribution) alongside whatever
    // this fingerprint already has on file. Never deduplicates — the
    // same author republishing an attribution for the same fingerprint
    // is two distinct, independently-timestamped facts, exactly like two
    // identical PlaceNamingClaims would be; see core/
    // BlueprintAttribution.js's own header.
    save(attribution) {
        const all = this._loadAll(attribution.fingerprint);
        all.push(attribution.toJSON());
        this._storageProvider.save(STORAGE_KEY_PREFIX + attribution.fingerprint, all);
    }

    // Every attribution on file for `fingerprint`, most recent first.
    // Returns BlueprintAttribution instances, never raw JSON — the one
    // boundary every caller can rely on without re-parsing dates/
    // signatures itself.
    list(fingerprint) {
        return this._loadAll(fingerprint)
            .map((json) => BlueprintAttribution.fromJSON(json))
            .filter(Boolean)
            .sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());
    }

    // True iff an attribution with this exact id is already on file for
    // `fingerprint` — mirrors LocalPlaceNamingClaimStore.js#has(), ready
    // for the same "arrived a second time through an exchange transport"
    // use a future 0.6.6 would need.
    has(fingerprint, attributionId) {
        return this._loadAll(fingerprint).some((json) => json.id === attributionId);
    }

    // Withdraws an attribution this replica itself stored, by id.
    // Retraction is LOCAL ONLY — see LocalPlaceNamingClaimStore.js#
    // retract()'s own header on why this can never reach a replica that
    // already copied the attribution before it was withdrawn. Returns
    // true if an attribution existed and was removed.
    retract(fingerprint, attributionId) {
        const all = this._loadAll(fingerprint);
        const index = all.findIndex((json) => json.id === attributionId);
        if (index === -1) {
            return false;
        }
        all.splice(index, 1);
        this._storageProvider.save(STORAGE_KEY_PREFIX + fingerprint, all);
        return true;
    }

    _loadAll(fingerprint) {
        return this._storageProvider.load(STORAGE_KEY_PREFIX + fingerprint) || [];
    }
}
