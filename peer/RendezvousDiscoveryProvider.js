import { PeerDiscoveryProvider } from './PeerDiscoveryProvider.js';
import { PeerDiscoveryRecord } from './PeerDiscoveryRecord.js';
import { PeerDiscoverySource } from './PeerDiscoverySource.js';
import { PeerInvitation } from './PeerInvitation.js';
import { RendezvousPublication } from './RendezvousPublication.js';

// 0.2.65 — Distributed Peer Rendezvous.
//
// 0.2.64 answered "how does Alice search for a candidate among what this
// device already imported?" (peer/LocalPeerDiscoveryProvider.js#discover)
// — deliberately a bootstrap milestone, never a real network lookup; see
// that file's own header. This class is the first PeerDiscoveryProvider
// that actually IS one: `discover(identityId)` issues a real LOOKUP
// against a peer/RendezvousTransport.js, exactly like `publish()` issues a
// real PUBLISH. Nothing about the three-stage vocabulary changes:
//
//     Discovery            "something claiming to be Bob may be here"
//     Rendezvous            "here is an endpoint worth attempting"
//     Authentication         "this connection actually belongs to Bob"
//
// A RendezvousDiscoveryRecord this class returns is exactly as untrusted
// as one peer/LocalPeerDiscoveryProvider.js hands back — same
// PeerDiscoveryRecord shape, same peer/PeerDiscoverySource.js vocabulary
// (RENDEZVOUS_SERVICE), same obligation on every caller (application/
// FindPeerUseCase.js, unmodified by this milestone) to authenticate before
// treating any of it as proof. See docs/Principles.md, "Rendezvous
// Distributes Candidates; Authentication Establishes Identity" (0.2.65).
//
// Three things this class adds beyond what LocalPeerDiscoveryProvider
// already had:
//
//   publish()/unpublish() — PUBLISH/REMOVE. "Make me findable" (and "stop
//   being findable") is a genuinely new act 0.2.50 through 0.2.64 never
//   needed, because out-of-band relay never required announcing yourself
//   to anything. Publications are deliberately short-lived (see peer/
//   RendezvousPublication.js) — the network is never allowed to become a
//   permanent directory of "Bob currently lives here."
//
//   A network-backed discover() — a genuine LOOKUP, merged into this
//   provider's own local cache using the exact same dedup-by-
//   (candidateEndpoint, identityHint) discipline 0.2.64 established (see
//   docs/Principles.md, "Rediscovering A Candidate Refreshes It; It Never
//   Duplicates It"). A different endpoint claiming the same identity is
//   still never merged into an existing record here either.
//
//   Graceful degradation — a LOOKUP that fails (the rendezvous network is
//   temporarily unreachable) never throws out of discover(). It falls
//   back to whatever this device already has cached, exactly like a
//   real-world network hiccup makes a peer HARDER to find, never
//   retroactively un-finds one already known. See docs/Principles.md, "A
//   Rendezvous Lookup Degrades; It Never Fails Loud" (0.2.65). Likewise, a
//   single malformed or malicious publication returned by LOOKUP (missing
//   fields, garbage JSON — exactly what a broken or hostile rendezvous
//   node could hand back) is skipped, never allowed to crash the whole
//   query — the same failure-isolation discipline spatial/
//   DecentralizedSpatialDiscoveryProvider.js already established for a
//   different, and much larger, trust pipeline.
export class RendezvousDiscoveryProvider extends PeerDiscoveryProvider {
    constructor({ transport } = {}) {
        super();
        if (!transport || typeof transport.lookup !== 'function' || typeof transport.publish !== 'function') {
            throw new Error('RendezvousDiscoveryProvider: a RendezvousTransport is required');
        }
        this._transport = transport;
        this._records = new Map(); // peerDiscoveryId -> PeerDiscoveryRecord, this device's own local cache
        this._discoveredListeners = new Set();
        this._ownPublicationId = null; // this node's own most recent PUBLISH, for a bare unpublish() call
    }

    // Out-of-band import path — identical in every respect to peer/
    // LocalPeerDiscoveryProvider.js#importInvitation. Never touches the
    // network: a manually relayed invitation (QR code, copy/paste) is
    // exactly as valid a candidate as one this device discovers through
    // the rendezvous network — see peer/PeerDiscoverySource.js,
    // "provenance, never trustworthiness."
    importInvitation(invitation, { now = new Date() } = {}) {
        const parsed = invitation instanceof PeerInvitation ? invitation : PeerInvitation.fromJSON(invitation);
        if (parsed.isExpired(now)) {
            throw new Error('RendezvousDiscoveryProvider: invitation has expired');
        }
        this._pruneExpired(now);
        return this._mergeLocalRecord({
            candidateEndpoint: parsed.endpoint,
            identityHint: parsed.identityHint,
            source: PeerDiscoverySource.INVITATION,
            discoveredAt: now,
            expiresAt: parsed.expiresAt
        });
    }

    // PUBLISH — "make me reachable." Wraps `invitationInput` (an ordinary
    // peer/PeerInvitation.js the caller already built — see application/
    // DiscoverPeersUseCase.js#createInvitation, unmodified by this
    // milestone) as a peer/RendezvousPublication.js and pushes it to the
    // transport. Never publishes a private credential — a PeerInvitation
    // never contains one (see that file's own header) — and never claims
    // permanence: the publication expires on its own, deliberately no
    // later than the invitation itself.
    publish(invitationInput, { ttlMs, now = new Date() } = {}) {
        const invitation = invitationInput instanceof PeerInvitation ? invitationInput : PeerInvitation.fromJSON(invitationInput);
        if (!invitation.identityHint) {
            throw new Error('RendezvousDiscoveryProvider: an invitation with no identityHint cannot be published — nobody could ever look it up by identity');
        }
        const publication = RendezvousPublication.create({
            invitation,
            now,
            ...(ttlMs !== undefined ? { ttlMs } : {})
        });
        this._transport.publish(publication);
        this._ownPublicationId = publication.publicationId;
        return publication;
    }

    // REMOVE — explicit withdrawal, e.g. on logout or an intentional "stop
    // being discoverable." Never implied by a publication merely expiring
    // on its own — an active withdrawal and a natural lapse are two
    // different acts (see this file's own header). Defaults to this
    // node's own last publish() when called with no argument.
    unpublish(publicationId = this._ownPublicationId) {
        if (!publicationId) {
            return false;
        }
        const removed = this._transport.remove(publicationId);
        if (publicationId === this._ownPublicationId) {
            this._ownPublicationId = null;
        }
        return removed;
    }

    list() {
        this._pruneExpired();
        return Array.from(this._records.values());
    }

    // LOOKUP — a REAL network query, unlike peer/LocalPeerDiscoveryProvider.js's
    // own discover() (a search over only what was already imported). See
    // this file's own header for the two things that make this safe to
    // call even against a hostile or flaky network: graceful degradation
    // on transport failure, and per-entry rejection of anything malformed.
    discover(identityId, { now = new Date() } = {}) {
        if (!identityId || typeof identityId !== 'string') {
            throw new Error('RendezvousDiscoveryProvider: identityId is required');
        }
        this._pruneExpired(now);

        let publications = [];
        try {
            publications = this._transport.lookup(identityId) || [];
        } catch {
            // Rendezvous network unreachable right now — proceed with
            // whatever this device already has cached. See this file's
            // own header, "A Rendezvous Lookup Degrades; It Never Fails
            // Loud."
            publications = [];
        }
        for (const raw of publications) {
            this._mergePublication(raw, now);
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

    _mergePublication(raw, now) {
        let publication;
        try {
            publication = raw instanceof RendezvousPublication ? raw : RendezvousPublication.fromJSON(raw);
        } catch {
            // A malformed or malicious entry from the network — skipped,
            // never allowed to crash the whole lookup. See this file's
            // own header.
            return;
        }
        if (publication.isExpired(now)) {
            return;
        }
        this._mergeLocalRecord({
            candidateEndpoint: publication.endpoint,
            identityHint: publication.identityHint,
            source: PeerDiscoverySource.RENDEZVOUS_SERVICE,
            discoveredAt: now,
            expiresAt: publication.expiresAt
        });
    }

    // Same dedup-by-(candidateEndpoint, identityHint) discipline peer/
    // LocalPeerDiscoveryProvider.js#importInvitation already established —
    // a rediscovery of the exact same candidate refreshes it in place; a
    // genuinely different endpoint claiming the same identity is kept as
    // a separate, independently-evaluated candidate. See docs/
    // Principles.md, "Rediscovering A Candidate Refreshes It; It Never
    // Duplicates It" (0.2.64), unchanged in spirit here.
    _mergeLocalRecord({ candidateEndpoint, identityHint, source, discoveredAt, expiresAt }) {
        const duplicate = Array.from(this._records.values()).find((existing) =>
            existing.candidateEndpoint === candidateEndpoint && existing.identityHint === identityHint);
        if (duplicate) {
            this._records.delete(duplicate.peerDiscoveryId);
        }
        const record = new PeerDiscoveryRecord({
            peerDiscoveryId: duplicate ? duplicate.peerDiscoveryId : undefined,
            candidateEndpoint,
            identityHint,
            source,
            discoveredAt,
            expiresAt
        });
        this._records.set(record.peerDiscoveryId, record);
        for (const listener of this._discoveredListeners) {
            listener(record);
        }
        return record;
    }

    _pruneExpired(now = new Date()) {
        for (const [id, record] of this._records) {
            if (record.isExpired(now)) {
                this._records.delete(id);
            }
        }
    }
}
