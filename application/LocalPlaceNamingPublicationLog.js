const STORAGE_KEY_PREFIX = 'place-naming-publication-log:';

// 0.5.3 — Decentralized Place Name Exchange.
//
// The ONE genuinely new piece of metadata this milestone's own design
// conversation asked for: not to the signed claim itself (see
// application/PlaceNamingClaimPublication.js's own header on why a
// second, unsigned "publishedAt" would just be a spoofable shadow of
// `claim.createdAt`), but `receivedAt` — the one fact that, by
// definition, no author could ever sign in advance: "when did THIS
// replica first learn about this claim?"
//
// First-seen-wins, deliberately: re-receiving the exact same claim id a
// second or third time (the ordinary outcome of any gossip-style
// transport — see application/PlaceNamingClaimExchange.js's own header)
// never resets `receivedAt` to "just now." That would quietly erase the
// one honest signal this log exists to keep — "this replica has actually
// known about this for a while" — every time an old, already-known claim
// happened to be re-delivered.
//
// Deliberately NEVER read by core/PlaceNamingView.js#namingView() and
// NEVER allowed to change a naming view's ranking — see this milestone's
// own docs/Roadmap.md entry, "Deliberately excluded": freshness is
// preserved for a FUTURE policy to consume, not wired into 0.5.2's
// distinct-author scoring now.
export class LocalPlaceNamingPublicationLog {
    constructor(storageProvider) {
        if (!storageProvider) {
            throw new Error('LocalPlaceNamingPublicationLog: storageProvider is required');
        }
        this._storageProvider = storageProvider;
    }

    // Records that `claimId` (in World `worldId`) was received right
    // now, UNLESS this replica already has a receivedAt on file for it —
    // see this class's own header on why first-seen always wins.
    recordReceipt(worldId, claimId) {
        const all = this._loadAll(worldId);
        if (all[claimId]) {
            return;
        }
        all[claimId] = new Date().toISOString();
        this._storageProvider.save(this._key(worldId), all);
    }

    // The ISO timestamp this replica first recorded `claimId` at, or
    // null if it was never received through the exchange layer at all
    // (for instance, a claim this same identity published directly via
    // application/PlaceNamingClaimUseCase.js#publish() — publishing your
    // own claim is not "receiving" one).
    getReceivedAt(worldId, claimId) {
        return this._loadAll(worldId)[claimId] || null;
    }

    _loadAll(worldId) {
        return this._storageProvider.load(this._key(worldId)) || {};
    }

    _key(worldId) {
        return `${STORAGE_KEY_PREFIX}${worldId}`;
    }
}
