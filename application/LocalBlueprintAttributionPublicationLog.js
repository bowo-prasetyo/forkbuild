const STORAGE_KEY_PREFIX = 'blueprint-attribution-publication-log:';

// 0.6.6 — Decentralized Blueprint Exchange.
//
// The exact application/LocalPlaceNamingPublicationLog.js shape, one
// domain over: not the signed attribution itself (see application/
// BlueprintAttributionPublicationValidator.js's own header on why a
// second, unsigned "publishedAt" would just be a spoofable shadow of
// `attribution.createdAt`, already part of the signed payload), but
// `receivedAt` — the one fact that, by definition, no author could ever
// sign in advance: "when did THIS replica first learn about this
// attribution?"
//
// First-seen-wins, deliberately: re-receiving the exact same attribution
// id a second or third time (the ordinary outcome of any gossip-style
// transport — see application/BlueprintAttributionExchange.js's own
// header) never resets `receivedAt` to "just now."
//
// Keyed by fingerprint (STORAGE_KEY_PREFIX + fingerprint) rather than one
// global list — the same per-design storage-key discipline application/
// LocalBlueprintAttributionStore.js already keeps for the attributions
// themselves.
//
// Deliberately NEVER read by application/BlueprintAttributionUseCase.js#
// summarize() and NEVER allowed to change what a UI shows as "known
// authors" — preserved for a FUTURE freshness policy to consume, not
// wired into 0.6.5's plain, unranked attribution list now. Mirrors
// application/LocalPlaceNamingPublicationLog.js's own identical
// restraint.
export class LocalBlueprintAttributionPublicationLog {
    constructor(storageProvider) {
        if (!storageProvider) {
            throw new Error('LocalBlueprintAttributionPublicationLog: storageProvider is required');
        }
        this._storageProvider = storageProvider;
    }

    // Records that `attributionId` (about design `fingerprint`) was
    // received right now, UNLESS this replica already has a receivedAt
    // on file for it — see this class's own header on why first-seen
    // always wins.
    recordReceipt(fingerprint, attributionId) {
        const all = this._loadAll(fingerprint);
        if (all[attributionId]) {
            return;
        }
        all[attributionId] = new Date().toISOString();
        this._storageProvider.save(this._key(fingerprint), all);
    }

    // The ISO timestamp this replica first recorded `attributionId` at,
    // or null if it was never received through the exchange layer at all
    // (for instance, an attribution this same identity published directly
    // via application/BlueprintAttributionUseCase.js#publish() —
    // publishing your own attribution is not "receiving" one).
    getReceivedAt(fingerprint, attributionId) {
        return this._loadAll(fingerprint)[attributionId] || null;
    }

    _loadAll(fingerprint) {
        return this._storageProvider.load(this._key(fingerprint)) || {};
    }

    _key(fingerprint) {
        return `${STORAGE_KEY_PREFIX}${fingerprint}`;
    }
}
