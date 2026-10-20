import { LOCAL_AND_PEERS_ONLY } from '../../../core/publication/CommentaryDistributionProvider.js';

// Which networks this device sent each of its own hearts to, and where they
// landed, so taking a heart back on Nostr can ask relays to delete the
// reactions it replaces.
export const OWN_HEART_DISTRIBUTIONS_KEY = 'own-heart-distributions';
const MAX_ENTRIES = 2000;

export class PublicationHeartDistributionLog {
    constructor(storageProvider, { now = () => new Date() } = {}) {
        if (!storageProvider || typeof storageProvider.load !== 'function' || typeof storageProvider.save !== 'function') {
            throw new Error('PublicationHeartDistributionLog requires a storage provider');
        }
        this._storage = storageProvider;
        this._now = now;
    }

    record({ heart, substrate, result }) {
        if (!heart || typeof heart.heartId !== 'string' || typeof substrate !== 'string') return null;
        if (!result || result.published !== true) return null;
        const entry = {
            heartId: heart.heartId,
            publicationId: heart.publicationId,
            authorIdentityId: heart.authorIdentityId,
            hearted: heart.hearted === true,
            substrate,
            locator: result.locator == null ? null : String(result.locator),
            at: this._now().toISOString()
        };
        this._storage.save(OWN_HEART_DISTRIBUTIONS_KEY, [...this.list(), entry].slice(-MAX_ENTRIES));
        return entry;
    }

    list() {
        const stored = this._storage.load(OWN_HEART_DISTRIBUTIONS_KEY);
        return Array.isArray(stored) ? stored.filter((e) => e && typeof e.heartId === 'string' && typeof e.substrate === 'string') : [];
    }

    // Where this identity's hearts (not their taking back) for the build went
    // on one network.
    heartLocators({ publicationId, authorIdentityId, substrate }) {
        return this.list()
            .filter((e) => e.publicationId === publicationId && e.authorIdentityId === authorIdentityId && e.substrate === substrate && e.hearted && e.locator)
            .map((e) => e.locator);
    }
}

// Sends one of this device's own hearts to connected peers and to the one
// network chosen for hearts in Settings (`provider()`, Nostr unless changed;
// "Local & peers only" sends it nowhere else). Best effort, like comments:
// the heart is already kept here, and nothing that fails on the way undoes
// it or reaches the person who tapped.
export function createPublicationHeartDistributor({ peerExchange, heartExchange, substrateFor, provider, distributionLog = null }) {
    return function distributePublicationHeart(heart) {
        try {
            peerExchange.announce(heart);
        } catch {
        }
        const network = provider();
        if (network === LOCAL_AND_PEERS_ONLY) {
            return;
        }
        const distribution = substrateFor(network);
        if (!distribution) {
            return;
        }
        try {
            const envelopeJson = heartExchange.exportHeart(heart);
            const options = network === 'nostr' && distributionLog && !heart.hearted
                ? { replaces: distributionLog.heartLocators({ publicationId: heart.publicationId, authorIdentityId: heart.authorIdentityId, substrate: network }) }
                : {};
            Promise.resolve(distribution.publish(envelopeJson, options)).then((result) => {
                if (distributionLog) distributionLog.record({ heart, substrate: network, result });
            }).catch(() => {});
        } catch {
        }
    };
}
