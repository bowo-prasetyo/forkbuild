import { PeerLifecycleState } from '../peer/PeerLifecycleState.js';
import { EventBus } from '../core/events/EventBus.js';
import {
    toPublicationAnnounceMessage,
    isValidPublicationPeerMessage
} from './PublicationPeerProtocol.js';

const PUBLICATION_RECEIVED_EVENT = 'PublicationPeerExchangeReceived';

// 0.7.3 — Peer Publication Exchange.
//
// 0.7.2's own design conversation named exactly what was still missing:
// "a live peer-gossip transport... 0.7.3's own job." application/
// PublicationExchange.js already moves a `DecentralizedPublication`
// envelope between replicas — validate -> construct -> verify -> catalog —
// but only ever as a plain object in, a plain object out; something else
// has always had to physically move that object (a pasted file, in every
// test up to and including 0.7.2's own flagship). This class is that
// missing transport, and nothing more: it wires application/
// PublicationExchange.js to a LIVE, already-authenticated peer connection
// instead of a hand-off file.
//
// Deliberately does NOT reinvent a peer transport. peer/PeerMessageBus.js
// (0.2.52) already solved "how do different decentralized application
// protocols safely share one authenticated peer connection" — a namespaced
// protocol string, delivery gated on PeerLifecycleState.AUTHENTICATED,
// malformed/oversized/duplicate hygiene, transport-agnostic by
// construction (peer/LocalPeerConnectionProvider.js today, peer/
// WebRtcPeerConnectionProvider.js already proven over the SAME bus by
// tests/PeerMessaging.test.js's own flagship). Every propagation use case
// built since (application/IdentityLifecyclePropagationUseCase.js,
// application/DeviceAuthorizationPropagationUseCase.js) is exactly this
// same shape applied to a different gossiped record. This class is that
// shape applied to a DecentralizedPublication envelope: attach to every
// application/ConnectedPeerRegistry.js peer (now and in the future, via
// its own onChange), subscribe to this file's own DEFAULT_PROTOCOL, and
// run every incoming ANNOUNCE through application/PublicationExchange.js#
// importPublication() UNCHANGED. Building a second, parallel "publication
// transport" hierarchy alongside PeerMessageBus would duplicate all of
// that hard-won hygiene for no reason, and would leave a future real
// WebRTC milestone (0.7.4, unchanged from 0.7.2's own roadmap entry) with
// a SECOND transport to port instead of zero — PeerMessageBus already runs
// over WebRTC today, unmodified.
//
// The critical rule this milestone's own design conversation stated
// plainly, and this class exists to enforce structurally: it NEVER calls
// application/PublicationResolver.js, and never inspects the wrapped
// content or the locator's reachability. A peer announcing a publication
// only ever tells this replica "this envelope exists, signed by whoever
// signed it" — exactly what application/PublicationExchange.js#
// importPublication() already establishes for a pasted file, unchanged for
// one that arrived live. Whether the content it points at can actually be
// retrieved stays application/PublicationResolver.js#resolve()'s own
// question, asked separately, on demand, by whatever caller wants a live
// answer — see docs/Principles.md, "Discovery Is Not Resolution (0.7.2)."
//
// Peer identity is informational only. `_handleIncoming` below never reads
// `meta.connectedPeer` — a publication is exactly as valid received from
// Alice, from Charlie, or from a pasted file, because its own signature
// (checked entirely inside application/PublicationExchange.js) is the only
// thing that ever made it trustworthy. This class introduces no concept of
// a "trusted peer," a "trusted publisher," or a peer reputation score, and
// none should ever be added to it — publisher identity and transport
// source stay two separate facts, exactly as they always have been for
// every exchange class in this codebase since 0.5.3.
export class PublicationPeerExchange {
    constructor(publicationExchange, peerMessageBus, connectedPeerRegistry, {
        protocol = PublicationPeerExchange.DEFAULT_PROTOCOL
    } = {}) {
        if (!publicationExchange || typeof publicationExchange.importPublication !== 'function' || typeof publicationExchange.exportPublication !== 'function') {
            throw new Error('PublicationPeerExchange: a PublicationExchange is required');
        }
        if (!peerMessageBus || typeof peerMessageBus.send !== 'function' || typeof peerMessageBus.subscribe !== 'function' || typeof peerMessageBus.attach !== 'function') {
            throw new Error('PublicationPeerExchange: a PeerMessageBus is required');
        }
        if (!connectedPeerRegistry || typeof connectedPeerRegistry.list !== 'function' || typeof connectedPeerRegistry.onChange !== 'function') {
            throw new Error('PublicationPeerExchange: a ConnectedPeerRegistry is required');
        }
        this._exchange = publicationExchange;
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

    // Announces `publication` — a real, signed DecentralizedPublication
    // this replica already holds (its own, or one it cataloged some other
    // way) — to every peer currently AUTHENTICATED on the injected
    // ConnectedPeerRegistry. `exportPublication()` (unchanged) is what
    // actually enforces "must be signed"; this method never re-derives
    // that check. Returns the number of peers it was actually sent to —
    // zero connected peers is never an error, only an announcement nobody
    // happened to be listening for, the same restraint application/
    // DeviceAuthorizationPropagationUseCase.js#_broadcast() already
    // applies one domain over.
    //
    // Deliberately never touches this replica's OWN catalog — a
    // publication a caller can export is, by construction, already a real
    // DecentralizedPublication instance the caller obtained some other
    // way (application/PublicationResolver.js#publish(), or a prior
    // import); cataloging it locally is that caller's own business,
    // exactly as separate from announcing it as application/
    // LocalPublicationCatalog.js's own header keeps cataloging separate
    // from resolving.
    announce(publication) {
        const envelope = this._exchange.exportPublication(publication);
        const message = toPublicationAnnounceMessage(envelope);
        const authenticatedPeers = this._registry.list().filter((peer) => peer.getLifecycleState() === PeerLifecycleState.AUTHENTICATED);
        for (const peer of authenticatedPeers) {
            this._bus.send(peer, this._protocol, message);
        }
        return authenticatedPeers.length;
    }

    // Fires with `{ publication, isNew }` — application/
    // PublicationExchange.js#importPublication()'s own return shape,
    // passed straight through — every time an incoming ANNOUNCE is
    // successfully cataloged, including a re-announce of something already
    // known (`isNew: false`). Never fires for a message that failed
    // validation or verification; see `_handleIncoming()` below. A future
    // Discovery UI (deliberately not built by this milestone — see this
    // file's own header) is the intended caller, refreshing a live view
    // without polling application/LocalPublicationCatalog.js itself.
    onPublicationReceived(callback) {
        const subscription = this._eventBus.subscribe(PUBLICATION_RECEIVED_EVENT, callback);
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
        // DeviceAuthorizationPropagationUseCase.js#dispose() already
        // documents for the identical reason.
    }

    // The ingestion boundary. Every incoming ANNOUNCE runs through
    // application/PublicationExchange.js#importPublication() UNCHANGED —
    // the identical validate -> construct -> verify -> catalog discipline
    // that class already applies to a pasted-file envelope, applied here
    // to one that arrived over a live, authenticated peer connection
    // instead. A malformed gossip wrapper, or an envelope that fails any
    // of those three checks, is dropped here, silently — exactly like
    // application/DeviceAuthorizationPropagationUseCase.js#_handleGrant()
    // drops an unverifiable grant. One peer's bad or forged message can
    // never crash this replica's message bus, and can never catalog
    // anything this replica did not independently verify itself.
    _handleIncoming(payload) {
        if (!isValidPublicationPeerMessage(payload)) {
            return;
        }
        let result;
        try {
            result = this._exchange.importPublication(payload.envelope);
        } catch {
            return;
        }
        this._eventBus.publish(PUBLICATION_RECEIVED_EVENT, result);
    }
}

// Namespaced so it can never collide with chat/presence/profile/
// interaction/identity-lifecycle/device-authorization traffic multiplexed
// over the same connection — see application/
// DeviceAuthorizationPropagationUseCase.js's own DEFAULT_PROTOCOL.
PublicationPeerExchange.DEFAULT_PROTOCOL = 'forkbuild:publication';
