import { RendezvousTransport } from './RendezvousTransport.js';

// 0.2.65's concrete rendezvous transport: an in-memory, shared "node" that
// any number of peer/RendezvousDiscoveryProvider.js instances can point at
// — the rendezvous-layer analogue of peer/LocalPeerConnectionProvider.js's
// own LocalPeerNetwork (several providers sharing one in-process network,
// standing in for a future networked implementation without pretending to
// be a mock of one).
//
// Deliberately holds AT MOST ONE live publication per identityId — keyed
// by `publication.identityHint`, a fresh publish() for the same identity
// simply overwrites whatever was there before, regardless of endpoint.
// This is the "newer publication replaces older candidate" behavior the
// distributed rendezvous layer is meant to enforce, and it falls straight
// out of this one design choice: the network is a "where is X reachable
// RIGHT NOW" pointer, never an accumulating history of every place X has
// ever announced itself. Compare peer/LocalPeerDiscoveryProvider.js, which
// deliberately keeps two DIFFERENT endpoints for the same identityHint as
// two separate candidates — that discipline still applies one layer up, in
// peer/RendezvousDiscoveryProvider.js's own local cache; it is simply not
// this transport's job, since this transport only ever exposes "the
// current one," never a history to merge in the first place.
//
// `setAvailable(false)` simulates "the rendezvous network is temporarily
// unreachable" — every operation throws until it's set back to true —
// exercised in tests/DistributedPeerRendezvous.test.js to prove a caller
// degrades gracefully rather than crashing.
export class LocalRendezvousNetwork extends RendezvousTransport {
    constructor() {
        super();
        this._publications = new Map(); // identityHint -> RendezvousPublication
        this._available = true;
    }

    setAvailable(available) { this._available = Boolean(available); }
    get isAvailable() { return this._available; }

    publish(publication) {
        this._assertAvailable();
        this._pruneExpired();
        this._publications.set(publication.identityHint, publication);
        return publication;
    }

    lookup(identityId) {
        this._assertAvailable();
        this._pruneExpired();
        const publication = this._publications.get(identityId);
        return publication ? [publication] : [];
    }

    remove(publicationId) {
        this._assertAvailable();
        for (const [identityHint, publication] of this._publications) {
            if (publication.publicationId === publicationId) {
                this._publications.delete(identityHint);
                return true;
            }
        }
        return false;
    }

    // Defensive against more than mere expiry: an entry that doesn't even
    // look like a real peer/RendezvousPublication.js (nothing this
    // transport's own publish() would ever store, but conceivable for any
    // future implementation backed by real network deserialization) is
    // pruned the same as an expired one, rather than crashing every
    // subsequent operation on this node — the transport layer's own
    // half of the same failure-isolation discipline peer/
    // RendezvousDiscoveryProvider.js applies one layer up.
    _pruneExpired(now = new Date()) {
        for (const [identityHint, publication] of this._publications) {
            if (typeof publication.isExpired !== 'function' || publication.isExpired(now)) {
                this._publications.delete(identityHint);
            }
        }
    }

    _assertAvailable() {
        if (!this._available) {
            throw new Error('LocalRendezvousNetwork: rendezvous network is currently unavailable');
        }
    }
}
