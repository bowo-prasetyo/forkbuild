import { PeerDiscoveryProvider } from './PeerDiscoveryProvider.js';
import { PeerDiscoveryRecord } from './PeerDiscoveryRecord.js';
import { PeerDiscoverySource } from './PeerDiscoverySource.js';
import { PeerInvitation } from './PeerInvitation.js';

// 0.2.50's concrete discovery mechanism: invitation-based rendezvous, held
// entirely in memory. The peer-discovery analogue of peer/
// LocalPeerConnectionProvider.js — real, working code exercising the exact
// PeerDiscoveryProvider contract a future LAN/rendezvous-service/DHT
// provider will also have to satisfy, rather than a mock standing in for
// one.
//
// importInvitation() is the only way a record enters this provider —
// there is no scanning, no polling, nothing ambient. An expired invitation
// (peer/PeerInvitation.js#isExpired()) is rejected outright, before a
// PeerDiscoveryRecord is ever created: a captured invitation replayed after
// its own expiry never becomes a candidate endpoint worth attempting, let
// alone a connection.
export class LocalPeerDiscoveryProvider extends PeerDiscoveryProvider {
    constructor() {
        super();
        this._records = new Map(); // peerDiscoveryId -> PeerDiscoveryRecord
        this._discoveredListeners = new Set();
    }

    importInvitation(invitation, { now = new Date() } = {}) {
        const parsed = invitation instanceof PeerInvitation ? invitation : PeerInvitation.fromJSON(invitation);
        if (parsed.isExpired(now)) {
            throw new Error('LocalPeerDiscoveryProvider: invitation has expired');
        }

        const record = new PeerDiscoveryRecord({
            candidateEndpoint: parsed.endpoint,
            identityHint: parsed.identityHint,
            source: PeerDiscoverySource.INVITATION,
            discoveredAt: now
        });
        this._records.set(record.peerDiscoveryId, record);
        for (const listener of this._discoveredListeners) {
            listener(record);
        }
        return record;
    }

    list() {
        return Array.from(this._records.values());
    }

    forget(peerDiscoveryId) {
        this._records.delete(peerDiscoveryId);
    }

    onDiscovered(callback) {
        this._discoveredListeners.add(callback);
        return () => this._discoveredListeners.delete(callback);
    }

    dispose() {
        this._records.clear();
        this._discoveredListeners.clear();
    }
}
