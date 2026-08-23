const STORAGE_KEY_PREFIX = 'place-name-preference:';

// 0.5.2 — Place Naming & Naming Claims.
//
// The THIRD naming concept the design conversation drew a line around,
// distinct from both a WorldRegion's own `name` and a published
// PlaceNamingClaim:
//
//   Local name                — "my name for this place is Green
//                                Valley" — personal, never published.
//   Published naming claim    — application/PlaceNamingClaimUseCase.js
//                                — signed, publicly discoverable.
//   Community-preferred name  — core/PlaceNamingView.js's own derived
//                                ranking of whatever claims a replica
//                                knows about.
//
// This class is the FIRST of those three. It is never signed, never
// stored in a PlaceNamingClaim, never leaves this device — Alice can
// prefer "Green Valley" while Bob prefers "Emerald Valley" for the
// exact same region on the exact same shared World, and neither
// preference is visible to, or corrects, the other's. Keyed by the
// CURRENTLY authenticated username (mirroring
// application/WorldMembershipUseCase.js's own STORAGE_KEY_PREFIX +
// owner convention) so two identities using the same browser/
// storageProvider never see each other's preferences.
//
// A preference is a pure UI convenience, never a fact: setting one
// changes nothing about which name core/PlaceNamingView.js#namingView()
// ranks first, and clearing one simply falls back to that ranking (or,
// if nobody has claimed anything at all, to whatever the caller already
// used before this milestone — see application/WorldNavigationSession.js#
// getPreferredPlaceName()).
export class LocalNamePreferenceStore {
    constructor(storageProvider, identityProvider = null) {
        if (!storageProvider) {
            throw new Error('LocalNamePreferenceStore: storageProvider is required');
        }
        this._storageProvider = storageProvider;
        this._identityProvider = identityProvider;
    }

    setPreferredName(worldId, regionId, name) {
        const owner = this._currentOwnerOrNull();
        if (!owner) {
            return false;
        }
        const all = this._loadAll(owner, worldId);
        all[regionId] = name;
        this._storageProvider.save(this._key(owner, worldId), all);
        return true;
    }

    clearPreferredName(worldId, regionId) {
        const owner = this._currentOwnerOrNull();
        if (!owner) {
            return false;
        }
        const all = this._loadAll(owner, worldId);
        if (!(regionId in all)) {
            return false;
        }
        delete all[regionId];
        this._storageProvider.save(this._key(owner, worldId), all);
        return true;
    }

    // null when nobody is signed in, no preference was ever set for
    // this region, or it was since cleared — never a fabricated
    // fallback; see application/WorldNavigationSession.js#
    // getPreferredPlaceName() for what a caller does with null.
    getPreferredName(worldId, regionId) {
        const owner = this._currentOwnerOrNull();
        if (!owner) {
            return null;
        }
        const all = this._loadAll(owner, worldId);
        return all[regionId] || null;
    }

    _loadAll(owner, worldId) {
        return this._storageProvider.load(this._key(owner, worldId)) || {};
    }

    _key(owner, worldId) {
        return `${STORAGE_KEY_PREFIX}${owner}:${worldId}`;
    }

    _currentOwnerOrNull() {
        const user = this._identityProvider && typeof this._identityProvider.currentUser === 'function'
            ? this._identityProvider.currentUser()
            : null;
        return user ? user.username : null;
    }
}
