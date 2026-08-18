import { createId } from '../core/createId.js';
import { PeerDiscoverySource } from './PeerDiscoverySource.js';

// 0.2.50 — "here is something that might be Bob." A PeerDiscoveryRecord is
// the ONE thing every discovery mechanism this codebase will ever have
// (invitation today; LAN, a rendezvous service, a DHT tomorrow) produces —
// see peer/PeerDiscoveryProvider.js. It never claims proof of anything:
// `identityHint` travels here exactly as untrusted as it arrived on the
// peer/PeerInvitation.js it came from, and `candidateEndpoint` is nothing
// more than an address worth attempting peer/PeerConnectionProvider.js's
// own connect() against. Only peer/PeerAuthenticationSession.js's handshake
// — layered on top of a real connection this record's endpoint led to — may
// ever say "this IS Bob."
//
// Deliberately never persisted and never sent over the wire itself (compare
// peer/PeerIdentity.js's own "never persisted" — same discipline, one layer
// earlier): a record only exists for as long as whatever
// PeerDiscoveryProvider produced it keeps it in memory, and vanishes with
// no trace once forgotten or once the provider is disposed.
export class PeerDiscoveryRecord {
    constructor({ peerDiscoveryId = createId(), candidateEndpoint, identityHint = null, source, discoveredAt = new Date() } = {}) {
        if (!candidateEndpoint || typeof candidateEndpoint !== 'string') {
            throw new Error('PeerDiscoveryRecord: candidateEndpoint is required');
        }
        if (!source || !Object.values(PeerDiscoverySource).includes(source)) {
            throw new Error(`PeerDiscoveryRecord: unknown source "${source}"`);
        }
        if (identityHint !== null && (typeof identityHint !== 'string' || !identityHint)) {
            throw new Error('PeerDiscoveryRecord: identityHint, if present, must be a non-empty string');
        }

        this._peerDiscoveryId = peerDiscoveryId;
        this._candidateEndpoint = candidateEndpoint;
        this._identityHint = identityHint;
        this._source = source;
        this._discoveredAt = new Date(discoveredAt);
    }

    get peerDiscoveryId() { return this._peerDiscoveryId; }
    get candidateEndpoint() { return this._candidateEndpoint; }
    get identityHint() { return this._identityHint; }
    get source() { return this._source; }
    get discoveredAt() { return this._discoveredAt; }

    toJSON() {
        return {
            peerDiscoveryId: this._peerDiscoveryId,
            candidateEndpoint: this._candidateEndpoint,
            identityHint: this._identityHint,
            source: this._source,
            discoveredAt: this._discoveredAt.toISOString()
        };
    }
}
