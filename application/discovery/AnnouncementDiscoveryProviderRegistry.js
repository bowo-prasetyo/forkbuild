import { isAnnouncementDiscoveryProviderKey } from '../../core/AnnouncementDiscoveryProvider.js';
import { UserFacingError } from '../../core/UserFacingError.js';
import { message } from '../../core/Message.js';

// The Announcement & Discovery role's keyed registry, the counterpart of
// SnapshotPlacementStoreRegistry (Content, keyed by `storage`) and
// ExternalProofVerifierRegistry (Proof & Anchoring, keyed by `anchorType`).
// It is keyed by provider key (core/AnnouncementDiscoveryProvider.js) and
// holds, per substrate, the announcement services this device has set up,
// one per kind of announcement:
//
//   snapshotDiscoveryPublisher    publish({ contentHash, locator, storage, … })
//   placeNamingDiscoveryPublisher publish(claim)
//
// A substrate is registered kind by kind, as each composition root builds
// its services; a later registration adds to the earlier one and replaces
// only the kinds it names. A kind a substrate can't do on this device (Steem
// or Blurt not set up, no Nostr extension) is left out, so asking for it is
// "not set up", never a call that fails on a missing collaborator.

export const AnnouncementDiscoveryServiceKind = Object.freeze({
    SNAPSHOT: 'snapshotDiscoveryPublisher',
    PLACE_NAMING: 'placeNamingDiscoveryPublisher'
});

const KINDS = Object.values(AnnouncementDiscoveryServiceKind);

export class AnnouncementDiscoveryProviderRegistry {
    constructor() {
        this._providers = new Map();
    }

    register({ providerKey, ...services } = {}) {
        if (!isAnnouncementDiscoveryProviderKey(providerKey)) {
            throw new Error(`AnnouncementDiscoveryProviderRegistry: unknown providerKey "${providerKey}"`);
        }
        const unknown = Object.keys(services).filter((kind) => !KINDS.includes(kind));
        if (unknown.length > 0) {
            throw new Error(`AnnouncementDiscoveryProviderRegistry: unknown service ${unknown.join(', ')}`);
        }
        const provider = { ...(this._providers.get(providerKey) ?? { providerKey }) };
        for (const [kind, service] of Object.entries(services)) {
            if (service === null || service === undefined) continue;
            if (typeof service.publish !== 'function') {
                throw new Error(`AnnouncementDiscoveryProviderRegistry: ${providerKey}'s ${kind} must implement publish()`);
            }
            provider[kind] = service;
        }
        this._providers.set(providerKey, Object.freeze(provider));
        return this;
    }

    has(providerKey) {
        return this._providers.has(providerKey);
    }

    // `{ providerKey, …services }`, or null for a substrate nothing was
    // registered for. Never throws, like the other role registries, so
    // application/settings/RoleAwareProviderResolver.js can use it as is.
    get(providerKey) {
        return this._providers.get(providerKey) ?? null;
    }

    get providerKeys() {
        return Array.from(this._providers.keys());
    }

    // One kind of service for a substrate, or null.
    serviceFor(providerKey, kind) {
        return this.get(providerKey)?.[kind] ?? null;
    }

    // The same, or a UserFacingError naming the substrate as not set up on
    // this device, which the app shows as it is.
    requireServiceFor(providerKey, kind) {
        const service = this.serviceFor(providerKey, kind);
        if (service) return service;
        if (providerKey === 'nostr') throw new UserFacingError(message('announcementDiscovery.nostrUnavailable'));
        const provider = { arweave: 'Arweave', steem: 'Steem', blurt: 'Blurt' }[providerKey] ?? String(providerKey);
        throw new UserFacingError(message('announcementDiscovery.networkUnavailable', { provider }));
    }
}
