import { PeerLifecycleState } from '../peer/PeerLifecycleState.js';

// 0.9.342 — Automatic Peer Publication Connection Sync.
//
// 0.9.341's own boundary audit (Section A) found that application/
// PublicationPeerExchange.js already subscribes to application/
// ConnectedPeerRegistry.js#onChange() — the exact connection-established
// seam — but its callback body only ever calls `bus.attach(peer)`, never
// `announce()`. Section D then live-reproduced the resulting product gap
// (a peer who connects AFTER a Publication was already cataloged never
// receives it) and closed it with a seam built entirely from three
// already-public methods: `catalog.list()`, `peerExchange.announce()`,
// and `connectedPeerRegistry.onChange()` — no wire-format change, no new
// message kind, no new domain class underneath any of the three. This
// file is that seam, moved from the audit's own test file into
// production, unchanged in shape.
//
// A DECORATOR, NOT A MODIFICATION. Exactly the "wrap, do not modify"
// shape application/PublicationCommentaryNotificationProducer.js already
// established one domain over: rather than adding connection-sync
// behavior into application/PublicationPeerExchange.js's own onChange
// callback, this class subscribes to the SAME ConnectedPeerRegistry
// independently and reuses `announce()` as an ordinary caller —
// identical to how ui/views/EditorView.js's own "Publish to Network"
// button already calls it. application/PublicationPeerExchange.js is
// left completely unmodified; every existing caller and every existing
// test that constructs it with its current three collaborators keeps
// working unchanged.
//
// THE SEMANTIC RULE THIS CLASS ENFORCES, AND NOTHING MORE: when a peer
// becomes AUTHENTICATED, advertise the Publications currently present in
// the local catalog to that peer. Not "synchronize repositories," not
// "replicate documents," not "synchronize all decentralized state," and
// never "download content." `announce()` only ever moves the signed
// DecentralizedPublication envelope application/PublicationExchange.js
// already knows how to carry — see that file's own header, and
// application/PublicationPeerExchange.js's own header, for why actual
// document/material bytes stay entirely outside this seam. This class
// never imports application/PublicationResolver.js, any ContentStore, or
// application/PeerContentExchange.js, and none should ever be added to
// it.
//
// CURRENT CATALOG SNAPSHOT ONLY — no queue, no cursor, no "last synced
// peer" store, no retry state, no background polling, no reconciliation
// protocol. `_handleChange()` below reads `catalog.list()` fresh, once,
// every time it decides a newly authenticated peer needs syncing; there
// is no state here that outlives a single onChange callback except the
// small `connectionId` bookkeeping set that keeps a peer from being
// re-processed for a lifecycle change unrelated to first reaching
// AUTHENTICATED (e.g. a later, unrelated registry snapshot while it
// stays connected). Re-announcing an already-known publication to an
// already-synced peer is never a new concern this class has to solve —
// application/LocalPublicationCatalog.js#add()'s own first-seen-wins
// idempotency already makes repeated observation harmless on the
// receiving side, exactly as 0.9.341 Section E already proved live.
//
// `announce()` itself broadcasts to every currently AUTHENTICATED peer,
// unchanged — this class never narrows that to "only the newly connected
// peer." A peer who is already synced simply re-observes a publication
// it already has (isNew: false, no duplicate catalog entry); it is never
// told anything untrue, and no cross-peer state is read or compared to
// decide what to send — each currently AUTHENTICATED peer is always
// offered this replica's OWN, single, catalog snapshot, never a peer-
// specific view of it.
//
// FAILURE ISOLATION. A single publication that fails to announce (a
// transport hiccup, a peer disconconnecting mid-loop) must never abort
// announcing the rest, and must never propagate out of the
// ConnectedPeerRegistry#onChange callback: application/
// ConnectedPeerRegistry.js#_publishChange() calls every registered
// listener from one plain, synchronous loop — an uncaught exception from
// THIS listener would silently cancel every OTHER listener still queued
// behind it on the same registry, including application/
// PublicationPeerExchange.js's own bus-attach listener. The try/catch in
// `_handleChange()` below exists to guarantee this class can never do
// that, to any sibling listener, regardless of which peer or which
// publication triggered the failure.
//
// NO NotificationEvent PRODUCER. 0.9.341 Section H already applied this
// codebase's own NotificationEvent boundary criterion (0.9.274) to
// exactly this fact and found no recipient identity distinct from the
// local replica's own current identity — the existing local feedback/
// list-refresh mechanisms (ui/views/EditorView.js's `feedback.show()`,
// ui/views/DecentralizedPublicationsView.js's own
// `onPublicationReceived(() => refreshList())`) already cover it. This
// class fires no event of its own; `peerExchange.announce()` and
// `peerExchange.onPublicationReceived()` remain the only observable
// signals, both already unmodified since 0.7.3.
export class PublicationPeerConnectionSync {
    constructor(catalog, peerExchange, connectedPeerRegistry) {
        if (!catalog || typeof catalog.list !== 'function') {
            throw new Error('PublicationPeerConnectionSync: a LocalPublicationCatalog is required');
        }
        if (!peerExchange || typeof peerExchange.announce !== 'function') {
            throw new Error('PublicationPeerConnectionSync: a PublicationPeerExchange is required');
        }
        if (!connectedPeerRegistry || typeof connectedPeerRegistry.onChange !== 'function') {
            throw new Error('PublicationPeerConnectionSync: a ConnectedPeerRegistry is required');
        }
        this._catalog = catalog;
        this._peerExchange = peerExchange;
        this._syncedConnectionIds = new Set();
        this._unsubscribeRegistry = connectedPeerRegistry.onChange((peers) => this._handleChange(peers));
    }

    dispose() {
        if (this._unsubscribeRegistry) {
            this._unsubscribeRegistry();
            this._unsubscribeRegistry = null;
        }
        // Deliberately does NOT dispose the injected catalog, peerExchange,
        // or connectedPeerRegistry — all three are shared, app-wide
        // collaborators this class never owns, the same restraint
        // application/PublicationPeerExchange.js#dispose() already
        // documents for the identical reason.
    }

    // Fires on every ConnectedPeerRegistry snapshot; only a peer newly
    // reaching AUTHENTICATED (one this instance has not already
    // processed this connection) triggers a catalog announcement. A
    // brand-new `connectionId` on reconnect — application/
    // ConnectedPeerRegistry.js's own header: a reconnect is an entirely
    // new connection with no memory of the old one — is, correctly,
    // never confused with the stale one it replaced.
    _handleChange(peers) {
        const newlyAuthenticated = peers.filter((peer) =>
            peer.getLifecycleState() === PeerLifecycleState.AUTHENTICATED && !this._syncedConnectionIds.has(peer.connectionId));
        if (newlyAuthenticated.length === 0) {
            return;
        }
        for (const peer of newlyAuthenticated) {
            this._syncedConnectionIds.add(peer.connectionId);
        }
        for (const publication of this._catalog.list()) {
            try {
                this._peerExchange.announce(publication);
            } catch {
                // See this file's own header, "FAILURE ISOLATION" — one
                // publication's failed announce must never abort the
                // rest, never corrupt the local catalog (never touched
                // here at all — see PublicationPeerExchange#announce()'s
                // own header), and must never escape this callback.
            }
        }
    }
}
