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
        this._answers = new Map(); // publicationId -> { answer, answererId }
        this._lobbies = new Map(); // lobby -> Map(identityId -> LobbyCard)
        this._available = true;
    }

    setAvailable(available) { this._available = Boolean(available); }
    get isAvailable() { return this._available; }

    // async only to satisfy peer/RendezvousTransport.js's own contract —
    // see that file's own header. Every operation below still runs
    // entirely synchronously against the in-memory Map; wrapping an
    // already-known result in a Promise changes nothing observable beyond
    // requiring `await` at the call site.
    async publish(publication) {
        this._assertAvailable();
        this._pruneExpired();
        this._publications.set(publication.identityHint, publication);
        return publication;
    }

    async lookup(identityId) {
        this._assertAvailable();
        this._pruneExpired();
        const publication = this._publications.get(identityId);
        // An answered offer is spent, as on the reference server.
        return publication && !this._answers.has(publication.publicationId) ? [publication] : [];
    }

    async remove(publicationId) {
        this._assertAvailable();
        for (const [identityHint, publication] of this._publications) {
            if (publication.publicationId === publicationId) {
                this._publications.delete(identityHint);
                return true;
            }
        }
        return false;
    }

    // The answer mailbox, without the reference server's signature checks
    // (this network accepts unsigned publications too).
    async postAnswer({ identityId, publicationId, answer, answererId = null } = {}) {
        this._assertAvailable();
        this._pruneExpired();
        const publication = this._publications.get(identityId);
        if (!publication || publication.publicationId !== publicationId) {
            throw new Error('LocalRendezvousNetwork: that publication is no longer available');
        }
        if (this._answers.has(publicationId)) {
            throw new Error('LocalRendezvousNetwork: that publication was already answered');
        }
        this._answers.set(publicationId, { answer, answererId });
        return true;
    }

    async fetchAnswer({ identityId, publicationId } = {}) {
        this._assertAvailable();
        const publication = this._publications.get(identityId);
        if (!publication || publication.publicationId !== publicationId) {
            return null;
        }
        return this._answers.get(publicationId) || null;
    }

    // peer/RendezvousLobbyTransport.js, in memory and, like publish(),
    // without the reference server's signature checks.
    async joinLobby(card) {
        this._assertAvailable();
        if (!this._lobbies.has(card.lobby)) {
            this._lobbies.set(card.lobby, new Map());
        }
        this._lobbies.get(card.lobby).set(card.identityId, card);
        return typeof card.toJSON === 'function' ? card.toJSON() : card;
    }

    async leaveLobby({ identityId, lobby, cardId } = {}) {
        this._assertAvailable();
        const members = this._lobbies.get(lobby);
        const card = members && members.get(identityId);
        if (!card || card.cardId !== cardId) {
            return false;
        }
        members.delete(identityId);
        return true;
    }

    async listLobby(lobby, now = new Date()) {
        this._assertAvailable();
        const members = this._lobbies.get(lobby);
        const cards = [];
        for (const [identityId, card] of members || []) {
            if (typeof card.isExpired === 'function' && card.isExpired(now)) {
                members.delete(identityId);
            } else {
                cards.push(typeof card.toJSON === 'function' ? card.toJSON() : card);
            }
        }
        return { cards, total: cards.length };
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
                this._answers.delete(publication.publicationId);
            }
        }
    }

    _assertAvailable() {
        if (!this._available) {
            throw new Error('LocalRendezvousNetwork: rendezvous network is currently unavailable');
        }
    }
}
