import { AvatarProfileTrustBoundary } from './AvatarProfileTrustBoundary.js';

// 0.2.41 — avatarId -> latest known AvatarProfileAdvertisement, the
// profile counterpart to application/LocalPresenceStore.js. A
// broadcast transport handler never writes directly into rendering/
// session state; it only ever calls `ingest()` here, and every entry
// is judged by an AvatarProfileTrustBoundary before being allowed to
// replace what's stored.
//
// Deliberately SIMPLER than LocalPresenceStore in one specific way:
// there is no lifecycle/staleness derivation, and nothing here ever
// prunes a record on its own. Appearance is a durable fact, not a
// live one — Alice's LAST KNOWN outfit remains the right thing for
// Bob to keep rendering even while she's temporarily AWAY (STALE or
// even ABSENT in presence terms); an avatar's LOOK does not expire
// just because its owner stopped moving for a while. A record here is
// only ever removed explicitly (remove()/clear()), driven by
// WorldNavigationSession the moment a remote avatar's PRESENCE
// actually disappears for good — see application/
// RemoteAvatarAppearanceRegistry.js's own forget().
export class LocalAvatarProfileStore {
    constructor({ trustBoundary = new AvatarProfileTrustBoundary() } = {}) {
        this._records = new Map(); // avatarId -> advertisement
        this._observations = new Map(); // avatarId -> most recent TrustObservation
        this._trustBoundary = trustBoundary;
    }

    ingest(advertisement) {
        const avatarId = advertisement && typeof advertisement === 'object' ? advertisement.avatarId : null;
        const existing = avatarId ? this._records.get(avatarId) : null;
        const { accepted, observation } = this._trustBoundary.evaluate(advertisement, existing || null);
        if (avatarId && typeof avatarId === 'string') {
            this._observations.set(avatarId, observation);
        }
        if (!accepted) {
            return false;
        }
        this._records.set(avatarId, advertisement);
        return true;
    }

    get(avatarId) {
        return this._records.get(avatarId) || null;
    }

    getObservation(avatarId) {
        return this._observations.get(avatarId) || null;
    }

    list() {
        const result = [];
        for (const [avatarId, advertisement] of this._records) {
            result.push({ advertisement, trustObservation: this._observations.get(avatarId) || null });
        }
        return result;
    }

    remove(avatarId) {
        this._records.delete(avatarId);
        this._observations.delete(avatarId);
    }

    clear() {
        this._records.clear();
        this._observations.clear();
    }
}
