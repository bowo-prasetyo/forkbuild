import { PeerLifecycleState } from '../peer/PeerLifecycleState.js';
import { EventBus } from '../core/events/EventBus.js';

const COMMENTARY_RECEIVED_EVENT = 'PublicationCommentaryDistributionPeerExchangeReceived';
const MESSAGE_KIND_ANNOUNCE = 'ANNOUNCE';

// 0.9.618 — Publication Commentary Distribution Envelope.
//
// application/PublicationAnchorPeerExchange.js's own shape, applied to a
// PublicationCommentaryDistributionEnvelope instead of a
// PublicationAnchor. Deliberately does NOT reinvent a peer transport —
// the identical restraint that class's own header already states, for
// the identical reason: peer/PeerMessageBus.js already solved
// namespaced, authenticated-only, hygienic delivery over a shared
// connection, and every propagation use case in this codebase
// (identity lifecycle, device authorization, publications, anchors,
// snapshot placements) is the same shape applied to a different
// gossiped record. This class is that shape applied to a Commentary
// distribution envelope: attach to every application/
// ConnectedPeerRegistry.js peer (now and in the future, via its own
// onChange), subscribe to this file's own DEFAULT_PROTOCOL, and run
// every incoming ANNOUNCE through application/
// PublicationCommentaryDistributionExchange.js#importCommentaryEnvelope()
// UNCHANGED.
//
// ANNOUNCE ONLY — DELIBERATELY NO REQUEST/RESPONSE, UNLIKE
// PublicationAnchorPeerExchange.js/PublicationSnapshotPlacementPeerExchange.js.
// The requesting brief for this milestone was explicit: distribution and
// discovery are different questions, and this milestone is scoped to
// "the smallest cross-device distribution capability," not a general
// historical-synchronization or discovery service for Commentary. A
// REQUEST/RESPONSE pair (find every commentary a peer knows about a
// publicationId, for a late-joining replica) is exactly the kind of
// seam a LATER, separately-scoped milestone could add on top of this
// one without changing anything here — see application/
// PublicationAnchorPeerProtocol.js's own 0.8.5 precedent for the shape
// such an addition would take. This file adds none of it.
//
// THE CENTRAL INVARIANT, enforced structurally by what this class does
// NOT call: it never consults application/CanCommentOnPublicationUseCase.js
// and never inspects whether the named publicationId resolves on this
// replica. A peer announcing a commentary only ever tells this replica
// "another replica holds a signed claim that this identity said this,
// about this publication" — never that the publication itself is known,
// reachable, or that commenting on it was ever authorized on the
// SENDING replica. See application/
// PublicationCommentaryDistributionExchange.js's own header, "stops
// exactly where signature verification stops."
//
// Peer identity is informational only, the identical restraint every
// sibling *PeerExchange class in this codebase already draws: incoming
// ANNOUNCE handling never reads `meta.connectedPeer` to decide whether
// to trust an envelope, and a commentary distribution envelope's own
// signature (checked entirely inside application/
// PublicationCommentaryDistributionExchange.js) is the only thing that
// ever made it acceptable. This class introduces no concept of a
// "trusted peer" or peer reputation score for commentary, and none
// should ever be added to it.
//
// NOTIFICATION STAYS DOWNSTREAM AND LOCAL — NEVER THIS FILE'S JOB.
// onCommentaryReceived() below fires a plain `{ commentary, isNew }`
// fact for whatever LOCAL code wants to react to newly arrived
// commentary (e.g. constructing a NotificationEvent) — this class
// itself never imports core/NotificationEvent.js, never constructs one,
// and never sends anything back out over the wire. See 0.9.617's own
// Section D: the notification boundary was already correctly local-only
// before this milestone, and stays exactly that way.
export class PublicationCommentaryDistributionPeerExchange {
    constructor(commentaryExchange, peerMessageBus, connectedPeerRegistry, {
        protocol = PublicationCommentaryDistributionPeerExchange.DEFAULT_PROTOCOL
    } = {}) {
        if (!commentaryExchange
            || typeof commentaryExchange.importCommentaryEnvelope !== 'function'
            || typeof commentaryExchange.exportCommentary !== 'function') {
            throw new Error('PublicationCommentaryDistributionPeerExchange: a PublicationCommentaryDistributionExchange is required');
        }
        if (!peerMessageBus || typeof peerMessageBus.send !== 'function' || typeof peerMessageBus.subscribe !== 'function' || typeof peerMessageBus.attach !== 'function') {
            throw new Error('PublicationCommentaryDistributionPeerExchange: a PeerMessageBus is required');
        }
        if (!connectedPeerRegistry || typeof connectedPeerRegistry.list !== 'function' || typeof connectedPeerRegistry.onChange !== 'function') {
            throw new Error('PublicationCommentaryDistributionPeerExchange: a ConnectedPeerRegistry is required');
        }
        this._exchange = commentaryExchange;
        this._bus = peerMessageBus;
        this._registry = connectedPeerRegistry;
        this._protocol = protocol;
        this._eventBus = new EventBus();

        for (const peer of this._registry.list()) {
            this._bus.attach(peer);
        }
        this._unsubscribeRegistry = this._registry.onChange((peers) => {
            for (const peer of peers) {
                this._bus.attach(peer);
            }
        });
        this._unsubscribeBus = this._bus.subscribe(this._protocol, (payload, meta) => this._handleIncoming(payload, meta));
    }

    // Signs `commentary` (via the injected exchange's own
    // exportCommentary() — see that class's own header on why signing
    // happens there, not here) and announces the resulting envelope to
    // every peer currently AUTHENTICATED on the injected
    // ConnectedPeerRegistry. Returns the number of peers it was actually
    // sent to — zero connected peers is never an error, only an
    // announcement nobody happened to be listening for, the same
    // restraint application/PublicationAnchorPeerExchange.js#announce()
    // already applies one domain over. Throws under exactly the same
    // conditions exportCommentary() itself throws.
    announce(commentary) {
        const envelope = this._exchange.exportCommentary(commentary);
        const message = { kind: MESSAGE_KIND_ANNOUNCE, envelope };
        const authenticatedPeers = this._registry.list().filter((peer) => peer.getLifecycleState() === PeerLifecycleState.AUTHENTICATED);
        for (const peer of authenticatedPeers) {
            this._bus.send(peer, this._protocol, message);
        }
        return authenticatedPeers.length;
    }

    // Fires with `{ commentary, isNew }` — application/
    // PublicationCommentaryDistributionExchange.js#
    // importCommentaryEnvelope()'s own return shape, passed straight
    // through — every time an incoming ANNOUNCE is successfully
    // verified and saved, including a re-announce of something already
    // known (`isNew: false`). Never fires for an envelope that failed
    // structural or signature validation; see `_handleIncoming()` below.
    onCommentaryReceived(callback) {
        const subscription = this._eventBus.subscribe(COMMENTARY_RECEIVED_EVENT, callback);
        return () => subscription.unsubscribe();
    }

    dispose() {
        if (this._unsubscribeRegistry) {
            this._unsubscribeRegistry();
            this._unsubscribeRegistry = null;
        }
        if (this._unsubscribeBus) {
            this._unsubscribeBus();
            this._unsubscribeBus = null;
        }
        // Deliberately does NOT dispose the injected peerMessageBus or
        // connectedPeerRegistry — both are shared, app-wide collaborators
        // this class never owns, the same restraint every sibling
        // *PeerExchange class in this codebase already documents.
    }

    // The ingestion boundary. A malformed gossip wrapper, or an envelope
    // that fails structural or signature validation, is dropped here,
    // silently — exactly like application/PublicationAnchorPeerExchange.js#
    // _handleIncoming() drops an unverifiable anchor. One peer's bad or
    // forged message can never crash this replica's message bus, and can
    // never catalog anything this replica did not independently verify
    // the SIGNATURE of itself.
    _handleIncoming(payload) {
        if (!payload || typeof payload !== 'object' || payload.kind !== MESSAGE_KIND_ANNOUNCE || !payload.envelope) {
            return;
        }
        let result;
        try {
            result = this._exchange.importCommentaryEnvelope(payload.envelope);
        } catch {
            return;
        }
        this._eventBus.publish(COMMENTARY_RECEIVED_EVENT, result);
    }
}

// Namespaced so it can never collide with chat/presence/profile/
// interaction/identity-lifecycle/device-authorization/publication/
// anchor/snapshot-placement traffic multiplexed over the same
// connection — see application/PublicationAnchorPeerExchange.js's own
// DEFAULT_PROTOCOL.
PublicationCommentaryDistributionPeerExchange.DEFAULT_PROTOCOL = 'forkbuild:commentary-distribution';
