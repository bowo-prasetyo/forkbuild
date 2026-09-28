import { PublicationDistributionLifecyclePersistence } from './distribution/PublicationDistributionLifecyclePersistence.js';
import { PublicationDistributionState } from './distribution/PublicationDistributionLifecycle.js';

const OWN_PUBLICATIONS_KEY = 'forkbuild-publications';

export const DistributionKind = Object.freeze({
    IPFS: 'ipfs',
    ARWEAVE: 'arweave',
    STEEM: 'steem',
    NOSTR: 'nostr'
});

export const DISTRIBUTION_KIND_LABELS = Object.freeze({
    [DistributionKind.IPFS]: 'IPFS',
    [DistributionKind.ARWEAVE]: 'Arweave',
    [DistributionKind.STEEM]: 'Steem',
    [DistributionKind.NOSTR]: 'Nostr'
});

const STORAGE_KINDS = Object.freeze({ ipfs: DistributionKind.IPFS, ar: DistributionKind.ARWEAVE, arweave: DistributionKind.ARWEAVE, steem: DistributionKind.STEEM });
const SUBSTRATE_KINDS = Object.freeze({ nostr: DistributionKind.NOSTR, arweave: DistributionKind.ARWEAVE, steem: DistributionKind.STEEM });

// Where this device has a record of distributing one of your own
// publications: storage its build or Signed Claim was uploaded to, and
// substrates that announced it. It states only what it has a record of,
// never that a copy exists nowhere else (a distribution from another
// device leaves no record here), nor that an upload is still available.
//
// Records come from the publication's distribution lifecycle (its Signed
// Claim), signed snapshot placements of its content, and the snapshot
// distribution log.
export class OwnPublicationDistributionRecord {
    constructor({
        storageProvider,
        placementCatalog = null,
        snapshotDistributionLog = null,
        lifecyclePersistence = new PublicationDistributionLifecyclePersistence(storageProvider)
    }) {
        this._storage = storageProvider;
        this._placementCatalog = placementCatalog;
        this._snapshotDistributionLog = snapshotDistributionLog;
        this._lifecyclePersistence = lifecyclePersistence;
    }

    // null for a publication that isn't yours; otherwise
    // { stored: [{ kind, locator }], announced: [{ kind, id }] }, one entry
    // per kind, in a fixed order.
    describe(publication) {
        if (!publication || !publication.id || !publication.contentHash || !this._isOwn(publication)) return null;
        const stored = new Map();
        const announced = new Map();
        const addStored = (storage, locator) => {
            const kind = STORAGE_KINDS[storage];
            if (kind && !stored.has(kind)) stored.set(kind, { kind, locator: locator || null });
        };
        const addAnnounced = (kind, id) => {
            if (kind && !announced.has(kind)) announced.set(kind, { kind, id: id || null });
        };

        const lifecycle = this._lifecyclePersistence.load(publication.id);
        if (lifecycle && lifecycle.material.state === PublicationDistributionState.PRESENT) {
            addStored(lifecycle.material.storage || storageOfUri(lifecycle.material.uri), lifecycle.material.uri);
        }
        if (lifecycle && lifecycle.discovery.state === PublicationDistributionState.PRESENT) {
            addAnnounced(substrateOfOrigin(lifecycle.discovery.origin), lifecycle.discovery.id);
        }
        for (const placement of this._placementCatalog ? this._placementCatalog.findByContentHash(publication.contentHash) : []) {
            addStored(placement.storage, placement.locator);
        }
        for (const entry of this._snapshotDistributionLog ? this._snapshotDistributionLog.findByContentHash(publication.contentHash) : []) {
            addStored(entry.storage, entry.uri);
            if (entry.substrate) addAnnounced(SUBSTRATE_KINDS[entry.substrate], entry.announcementId);
        }
        const order = Object.values(DistributionKind);
        const sorted = (map) => [...map.values()].sort((a, b) => order.indexOf(a.kind) - order.indexOf(b.kind));
        return { stored: sorted(stored), announced: sorted(announced) };
    }

    _isOwn(publication) {
        const records = this._storage.load(OWN_PUBLICATIONS_KEY);
        return Array.isArray(records)
            && records.some((record) => record && record.id === publication.id && record.contentHash === publication.contentHash);
    }
}

function storageOfUri(uri) {
    if (typeof uri !== 'string') return null;
    if (uri.startsWith('ipfs://')) return 'ipfs';
    if (uri.startsWith('ar://')) return 'ar';
    if (uri.startsWith('steem://')) return 'steem';
    return null;
}

// A lifecycle names where an announcement went by URL: a Nostr relay
// (ws: or wss:), a Steem discovery thread (steemit.com), or else the
// Arweave gateway it was uploaded through.
export function substrateOfOrigin(origin) {
    if (typeof origin !== 'string' || !origin) return null;
    let url;
    try {
        url = new URL(origin);
    } catch {
        return null;
    }
    if (url.protocol === 'ws:' || url.protocol === 'wss:') return DistributionKind.NOSTR;
    if (url.hostname === 'steemit.com' || url.hostname.endsWith('.steemit.com')) return DistributionKind.STEEM;
    if (url.protocol === 'https:' || url.protocol === 'http:') return DistributionKind.ARWEAVE;
    return null;
}
