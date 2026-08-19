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
//
// 0.2.64 — a candidate carries its own explicit freshness, `expiresAt`,
// checked lazily via `isExpired()` — the exact same "checked on read, never
// on a timer" discipline core/ChatOutboxEntry.js's own TTL already
// established. This is a SEPARATE clock from whatever expiry the mechanism
// that produced this record might also enforce at import time (see
// peer/LocalPeerDiscoveryProvider.js#importInvitation, which still refuses
// an already-expired peer/PeerInvitation.js outright, before a record is
// ever created): that check answers "was this candidate ever worth
// creating at all," while `isExpired()` here answers the ongoing question
// "is this candidate still worth attempting right now" — see
// docs/Principles.md, "A Discovery Record's Freshness Outlives Neither The
// Identity Nor The Relationship It Might Lead To" (0.2.64). Bob changing
// networks doesn't un-know Bob; it just makes this ONE candidate stale.
const DEFAULT_DISCOVERY_RECORD_TTL_MS = 10 * 60 * 1000; // 10 minutes — matches peer/PeerInvitation.js's own default

export class PeerDiscoveryRecord {
    constructor({ peerDiscoveryId = createId(), candidateEndpoint, identityHint = null, source, discoveredAt = new Date(), expiresAt } = {}) {
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
        this._expiresAt = expiresAt !== undefined && expiresAt !== null
            ? new Date(expiresAt)
            : new Date(this._discoveredAt.getTime() + DEFAULT_DISCOVERY_RECORD_TTL_MS);
    }

    get peerDiscoveryId() { return this._peerDiscoveryId; }
    get candidateEndpoint() { return this._candidateEndpoint; }
    get identityHint() { return this._identityHint; }
    get source() { return this._source; }
    get discoveredAt() { return this._discoveredAt; }
    get expiresAt() { return this._expiresAt; }

    // A stale candidate is unusable, never merely "less preferred" — see
    // this file's own header. Every caller that reads a
    // PeerDiscoveryProvider's records (peer/LocalPeerDiscoveryProvider.js's
    // own list()/discover(), and anything built on top) is expected to
    // apply this check, exactly like core/ChatOutboxEntry.js#isExpired()'s
    // own callers do.
    isExpired(now = new Date()) {
        return now.getTime() >= this._expiresAt.getTime();
    }

    toJSON() {
        return {
            peerDiscoveryId: this._peerDiscoveryId,
            candidateEndpoint: this._candidateEndpoint,
            identityHint: this._identityHint,
            source: this._source,
            discoveredAt: this._discoveredAt.toISOString(),
            expiresAt: this._expiresAt.toISOString()
        };
    }
}
