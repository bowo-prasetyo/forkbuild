import { PeerLifecycleState } from '../peer/PeerLifecycleState.js';
import { EventBus } from '../core/events/EventBus.js';
import {
    toPublicationAnchorAnnounceMessage,
    isValidPublicationAnchorPeerMessage
} from './PublicationAnchorPeerProtocol.js';

const ANCHOR_RECEIVED_EVENT = 'PublicationAnchorPeerExchangeReceived';

// 0.8.4 — External Anchor Publication Over Peers.
//
// application/PublicationPeerExchange.js's own class, applied to an
// anchor instead of a publication envelope. Deliberately does NOT
// reinvent a peer transport — the identical restraint that class's own
// header already states, for the identical reason: peer/PeerMessageBus.js
// already solved namespaced, authenticated-only, hygienic delivery over a
// shared connection, and every propagation use case in this codebase
// (identity lifecycle, device authorization, publications) is the same
// shape applied to a different gossiped record. This class is that shape
// applied to a PublicationAnchor envelope: attach to every application/
// ConnectedPeerRegistry.js peer (now and in the future, via its own
// onChange), subscribe to this file's own DEFAULT_PROTOCOL, and run every
// incoming ANNOUNCE through application/PublicationAnchorExchange.js#
// importAnchor() UNCHANGED.
//
// THE CENTRAL INVARIANT OF THIS MILESTONE, enforced structurally by what
// this class does NOT call: it never calls application/
// ExternalAnchorVerifier.js, and never inspects `proof` or the locator's
// reachability. A peer announcing an anchor only ever tells this replica
// "another replica holds a signed claim that this evidence exists" —
// never "the evidence has been verified." Receiving an anchor means
// exactly what application/PublicationAnchorExchange.js#importAnchor()
// already establishes (a well-formed, genuinely signed CLAIM is now
// known), never anything about whether the claim's proof holds up. Two
// replicas that received the identical anchor from the identical peer can
// reach two different, entirely local, entirely independent verification
// outcomes for it — see docs/Principles.md, "Peers Exchange Anchor
// Claims, Not Verification Results (0.8.4)."
//
// Peer identity is informational only, the identical restraint application/
// PublicationPeerExchange.js's own header already draws: `_handleIncoming`
// below never reads `meta.connectedPeer`, and an anchor's own signature
// (checked entirely inside application/PublicationAnchorExchange.js) is
// the only thing that ever made it trustworthy. Authentication is a
// channel/identity property gating WHO this replica sends to — never an
// authority mechanism that makes a received anchor any more or less
// verified. This class introduces no concept of a "trusted peer" or peer
// reputation score for anchors, and none should ever be added to it.
export class PublicationAnchorPeerExchange {
    constructor(anchorExchange, peerMessageBus, connectedPeerRegistry, {
        protocol = PublicationAnchorPeerExchange.DEFAULT_PROTOCOL
    } = {}) {
        if (!anchorExchange || typeof anchorExchange.importAnchor !== 'function' || typeof anchorExchange.exportAnchor !== 'function') {
            throw new Error('PublicationAnchorPeerExchange: a PublicationAnchorExchange is required');
        }
        if (!peerMessageBus || typeof peerMessageBus.send !== 'function' || typeof peerMessageBus.subscribe !== 'function' || typeof peerMessageBus.attach !== 'function') {
            throw new Error('PublicationAnchorPeerExchange: a PeerMessageBus is required');
        }
        if (!connectedPeerRegistry || typeof connectedPeerRegistry.list !== 'function' || typeof connectedPeerRegistry.onChange !== 'function') {
            throw new Error('PublicationAnchorPeerExchange: a ConnectedPeerRegistry is required');
        }
        this._exchange = anchorExchange;
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
        this._unsubscribeBus = this._bus.subscribe(this._protocol, (payload) => this._handleIncoming(payload));
    }

    // Announces `anchor` — a real, signed PublicationAnchor this replica
    // already holds (its own, or one it cataloged some other way) — to
    // every peer currently AUTHENTICATED on the injected
    // ConnectedPeerRegistry. `exportAnchor()` (unchanged) is what actually
    // enforces "must be signed"; this method never re-derives that check.
    // Returns the number of peers it was actually sent to — zero
    // connected peers is never an error, only an announcement nobody
    // happened to be listening for, the same restraint application/
    // PublicationPeerExchange.js#announce() already applies one domain
    // over.
    //
    // Deliberately never touches this replica's OWN catalog — an anchor a
    // caller can export is, by construction, already a real
    // PublicationAnchor instance the caller obtained some other way;
    // cataloging it locally is that caller's own business, exactly as
    // separate from announcing it as application/
    // LocalPublicationAnchorCatalog.js's own header keeps cataloging
    // separate from verifying.
    announce(anchor) {
        const envelope = this._exchange.exportAnchor(anchor);
        const message = toPublicationAnchorAnnounceMessage(envelope);
        const authenticatedPeers = this._registry.list().filter((peer) => peer.getLifecycleState() === PeerLifecycleState.AUTHENTICATED);
        for (const peer of authenticatedPeers) {
            this._bus.send(peer, this._protocol, message);
        }
        return authenticatedPeers.length;
    }

    // Fires with `{ anchor, isNew }` — application/
    // PublicationAnchorExchange.js#importAnchor()'s own return shape,
    // passed straight through — every time an incoming ANNOUNCE is
    // successfully cataloged, including a re-announce of something
    // already known (`isNew: false`). Never fires for a message that
    // failed validation or signature verification; see `_handleIncoming()`
    // below. Never fires as a result of, or alongside, any call to
    // application/ExternalAnchorVerifier.js — this event reports "a new
    // claim is known," never "a claim was verified."
    onAnchorReceived(callback) {
        const subscription = this._eventBus.subscribe(ANCHOR_RECEIVED_EVENT, callback);
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
        // this class never owns, the same restraint application/
        // PublicationPeerExchange.js#dispose() already documents for the
        // identical reason.
    }

    // The ingestion boundary. Every incoming ANNOUNCE runs through
    // application/PublicationAnchorExchange.js#importAnchor() UNCHANGED —
    // structural validation, then construction, then SIGNATURE
    // verification only, applied here to an anchor that arrived over a
    // live, authenticated peer connection instead of however else it
    // might have reached this replica. A malformed gossip wrapper, or an
    // envelope that fails structural or signature validation, is dropped
    // here, silently — exactly like application/
    // PublicationPeerExchange.js#_handleIncoming() drops an unverifiable
    // publication. One peer's bad or forged message can never crash this
    // replica's message bus, and can never catalog anything this replica
    // did not independently verify the SIGNATURE of itself.
    //
    // Never calls application/ExternalAnchorVerifier.js — see this
    // class's own header. A Bitcoin transaction that does not exist, or
    // an external system that is unreachable, is never a reason to reject
    // an announcement here; that is a proof-verification question,
    // answered separately, on demand, by whatever caller wants a live
    // answer.
    _handleIncoming(payload) {
        if (!isValidPublicationAnchorPeerMessage(payload)) {
            return;
        }
        let result;
        try {
            result = this._exchange.importAnchor(payload.envelope);
        } catch {
            return;
        }
        this._eventBus.publish(ANCHOR_RECEIVED_EVENT, result);
    }
}

// Namespaced so it can never collide with chat/presence/profile/
// interaction/identity-lifecycle/device-authorization/publication/content
// traffic multiplexed over the same connection — see application/
// PublicationPeerExchange.js's own DEFAULT_PROTOCOL.
PublicationAnchorPeerExchange.DEFAULT_PROTOCOL = 'forkbuild:anchor';
