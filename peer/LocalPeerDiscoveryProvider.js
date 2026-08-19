import { PeerDiscoveryProvider } from './PeerDiscoveryProvider.js';
import { PeerDiscoveryRecord } from './PeerDiscoveryRecord.js';
import { PeerDiscoverySource } from './PeerDiscoverySource.js';
import { PeerInvitation } from './PeerInvitation.js';

// 0.2.50's concrete discovery mechanism: invitation-based rendezvous, held
// entirely in memory. The peer-discovery analogue of peer/
// LocalPeerConnectionProvider.js — real, working code exercising the exact
// PeerDiscoveryProvider contract a future LAN/rendezvous-service/
// distributed provider will also have to satisfy, rather than a mock
// standing in for one.
//
// importInvitation() is the only way a record enters this provider —
// there is no scanning, no polling, nothing ambient. An expired invitation
// (peer/PeerInvitation.js#isExpired()) is rejected outright, before a
// PeerDiscoveryRecord is ever created: a captured invitation replayed after
// its own expiry never becomes a candidate endpoint worth attempting, let
// alone a connection. The resulting record's OWN freshness (peer/
// PeerDiscoveryRecord.js#expiresAt) is set to the invitation's own
// expiresAt — the record is never worth attempting for longer than the
// rendezvous hint that vouched for it claimed to be good for.
//
// 0.2.64 adds two things this provider needed before "search by identity"
// could mean anything: expired records are pruned lazily, on every read
// (never on a timer — the same discipline application/ChatOutbox.js#list()
// already established for core/ChatOutboxEntry.js's own TTL), and
// re-importing the SAME candidate (same candidateEndpoint + identityHint,
// while the existing record is still fresh) refreshes that one record
// rather than accumulating a second, redundant entry for it — see
// docs/Principles.md, "Rediscovering A Candidate Refreshes It; It Never
// Duplicates It" (0.2.64).
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
        this._pruneExpired(now);

        const duplicate = Array.from(this._records.values()).find((existing) =>
            existing.candidateEndpoint === parsed.endpoint && existing.identityHint === parsed.identityHint);
        if (duplicate) {
            this._records.delete(duplicate.peerDiscoveryId);
        }

        const record = new PeerDiscoveryRecord({
            peerDiscoveryId: duplicate ? duplicate.peerDiscoveryId : undefined,
            candidateEndpoint: parsed.endpoint,
            identityHint: parsed.identityHint,
            source: PeerDiscoverySource.INVITATION,
            discoveredAt: now,
            expiresAt: parsed.expiresAt
        });
        this._records.set(record.peerDiscoveryId, record);
        for (const listener of this._discoveredListeners) {
            listener(record);
        }
        return record;
    }

    list() {
        this._pruneExpired();
        return Array.from(this._records.values());
    }

    // 0.2.64 — every currently-fresh candidate whose (untrusted)
    // identityHint matches `identityId`, freshest first. Never conjures a
    // candidate from nothing: this only ever searches what importInvitation()
    // has already put in this provider's own memory — see this provider's
    // own header on why 0.2.64 is a bootstrap/local milestone, not a real
    // distributed lookup.
    discover(identityId) {
        if (!identityId || typeof identityId !== 'string') {
            throw new Error('LocalPeerDiscoveryProvider: identityId is required');
        }
        return this.list()
            .filter((record) => record.identityHint === identityId)
            .sort((a, b) => b.discoveredAt.getTime() - a.discoveredAt.getTime());
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

    _pruneExpired(now = new Date()) {
        for (const [id, record] of this._records) {
            if (record.isExpired(now)) {
                this._records.delete(id);
            }
        }
    }
}
