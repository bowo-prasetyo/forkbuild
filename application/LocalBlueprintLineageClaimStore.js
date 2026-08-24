import { BlueprintLineageClaim } from '../core/BlueprintLineageClaim.js';

const STORAGE_KEY_PREFIX = 'blueprint-lineage-claims:';

// 0.6.8 — Blueprint Lineage & Revision Discovery.
//
// Local, persisted storage for BlueprintLineageClaims — the same flat,
// per-fingerprint, read-modify-write shape application/
// LocalBlueprintAttributionStore.js already keeps one concept over, with
// exactly one structural difference: an attribution is ABOUT one
// fingerprint, but a lineage claim is ABOUT TWO — `sourceFingerprint` and
// `derivedFingerprint` — and a caller inspecting EITHER design needs to
// find it.
//
// DUAL-INDEXED, deliberately, rather than scanning: save() writes the
// SAME claim JSON under both `key(sourceFingerprint)` and
// `key(derivedFingerprint)`. This means list(fingerprint) always returns
// every claim touching `fingerprint`, in EITHER role, from a single,
// direct storage read — no wider "list every claim this replica has ever
// stored" capability is needed (or built — see core/
// BlueprintLineageView.js's own header on why that restraint is exactly
// what keeps cycle detection deliberately one-hop-only). The cost is
// exactly the cost application/LocalBlueprintAttributionStore.js already
// accepts for a claim's OWN single fingerprint, doubled: two writes on
// save(), two removals on retract(), keeping the two copies in lockstep.
//
// A claim's own `sourceFingerprint` and `derivedFingerprint` are always
// different (core/BlueprintLineageClaim.js's own constructor enforces
// this), so a claim is always stored under exactly two distinct keys,
// never one key twice.
export class LocalBlueprintLineageClaimStore {
    constructor(storageProvider) {
        if (!storageProvider) {
            throw new Error('LocalBlueprintLineageClaimStore: storageProvider is required');
        }
        this._storageProvider = storageProvider;
    }

    // Persists `claim` (a BlueprintLineageClaim) under BOTH of its own
    // fingerprints. Never deduplicates — the same author redundantly
    // republishing a claim is two distinct, independently-timestamped
    // facts, exactly like core/BlueprintAttribution.js's own identical
    // header describes one concept over.
    save(claim) {
        const json = claim.toJSON();
        this._append(claim.sourceFingerprint, json);
        this._append(claim.derivedFingerprint, json);
    }

    // Every claim on file touching `fingerprint`, in EITHER role, most
    // recent first. Returns BlueprintLineageClaim instances, never raw
    // JSON.
    list(fingerprint) {
        return this._loadAll(fingerprint)
            .map((json) => BlueprintLineageClaim.fromJSON(json))
            .filter(Boolean)
            .sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());
    }

    // True iff a claim with this exact id is already on file for
    // `fingerprint` — ready for the "arrived a second time through an
    // exchange transport" dedup application/BlueprintLineageExchange.js
    // needs, mirroring application/LocalBlueprintAttributionStore.js#has().
    has(fingerprint, claimId) {
        return this._loadAll(fingerprint).some((json) => json.id === claimId);
    }

    // Withdraws a claim this replica itself stored, by id, looked up
    // starting from EITHER of its own fingerprints — the caller only
    // needs to know one of the two (typically the Structure currently
    // being inspected). Removes the claim from BOTH of its own index
    // keys, keeping the dual index in lockstep. Retraction is LOCAL
    // ONLY — the same restraint every local claim store in this codebase
    // already keeps (see application/LocalBlueprintAttributionStore.js#
    // retract()'s own header). Returns true if a claim existed and was
    // removed.
    retract(fingerprint, claimId) {
        const all = this._loadAll(fingerprint);
        const found = all.find((json) => json.id === claimId);
        if (!found) {
            return false;
        }
        const otherFingerprint = found.sourceFingerprint === fingerprint
            ? found.derivedFingerprint
            : found.sourceFingerprint;
        this._remove(fingerprint, claimId);
        this._remove(otherFingerprint, claimId);
        return true;
    }

    _append(fingerprint, json) {
        const all = this._loadAll(fingerprint);
        all.push(json);
        this._storageProvider.save(STORAGE_KEY_PREFIX + fingerprint, all);
    }

    _remove(fingerprint, claimId) {
        const all = this._loadAll(fingerprint);
        const index = all.findIndex((json) => json.id === claimId);
        if (index === -1) {
            return;
        }
        all.splice(index, 1);
        this._storageProvider.save(STORAGE_KEY_PREFIX + fingerprint, all);
    }

    _loadAll(fingerprint) {
        return this._storageProvider.load(STORAGE_KEY_PREFIX + fingerprint) || [];
    }
}
