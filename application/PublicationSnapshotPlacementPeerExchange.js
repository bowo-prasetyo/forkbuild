import { PeerLifecycleState } from '../peer/PeerLifecycleState.js';
import { EventBus } from '../core/events/EventBus.js';
import {
    PublicationSnapshotPlacementPeerMessageKind,
    MAX_PLACEMENTS_PER_RESPONSE,
    toPublicationSnapshotPlacementAnnounceMessage,
    toPublicationSnapshotPlacementRequestMessage,
    toPublicationSnapshotPlacementResponseMessage,
    isValidPublicationSnapshotPlacementPeerMessage
} from './PublicationSnapshotPlacementPeerProtocol.js';

const PLACEMENT_RECEIVED_EVENT = 'PublicationSnapshotPlacementPeerExchangeReceived';

// 0.8.19 — Snapshot Placement Discovery & Peer Synchronization.
//
// application/PublicationAnchorPeerExchange.js's own class (0.8.4/0.8.5),
// applied to a PublicationSnapshotPlacement envelope instead of a
// PublicationAnchor one. Deliberately does NOT reinvent a peer transport
// — the identical restraint that class's own header already states, for
// the identical reason: peer/PeerMessageBus.js already solved namespaced,
// authenticated-only, hygienic delivery over a shared connection, and
// every propagation use case in this codebase is the same shape applied
// to a different gossiped record. This class is that shape applied to a
// PublicationSnapshotPlacement envelope: attach to every application/
// ConnectedPeerRegistry.js peer (now and in the future, via its own
// onChange), subscribe to this file's own DEFAULT_PROTOCOL, and run every
// incoming ANNOUNCE — and every entry of an incoming RESPONSE — through
// application/PublicationSnapshotPlacementExchange.js#importPlacement()
// UNCHANGED.
//
// THE CENTRAL INVARIANT OF THIS MILESTONE, enforced structurally by what
// this class does NOT call: it never calls application/
// SnapshotPlacementResolver.js, and never inspects `locator`'s
// reachability or retrieves a single byte. A peer announcing (or
// synchronizing) a placement only ever tells this replica "another
// replica holds a signed claim that this content can be retrieved from
// this locator" — never "the locator currently serves those bytes."
// Two replicas that received the identical placement from the identical
// peer can reach two entirely different, entirely local resolution
// outcomes for it — one may find `RESOLVED`, the other
// `CONTENT_UNAVAILABLE` — and neither outcome ever crosses the wire.
// See docs/Principles.md, "Peers Exchange Placement Claims, Not
// Resolution Results (0.8.19)."
//
// Unlike anchors, which shipped push (0.8.4: ANNOUNCE only) and pull
// (0.8.5: REQUEST/RESPONSE) as two separate milestones, this class ships
// all three message kinds together — see application/
// PublicationSnapshotPlacementPeerProtocol.js's own header for why. The
// shape of each handler is otherwise identical to its anchor-side
// precedent: `_handleRequest()` answers a REQUEST from THIS replica's own
// catalog only, bounded at MAX_PLACEMENTS_PER_RESPONSE; `_handleResponse()`
// imports every placement in a RESPONSE through the IDENTICAL
// `importPlacement()` call `_handleIncoming()` already runs an ANNOUNCE
// through.
//
// Peer identity is informational only, the identical restraint application/
// PublicationAnchorPeerExchange.js's own header already draws: incoming
// ANNOUNCE/RESPONSE handling never reads `meta.connectedPeer` to decide
// whether to trust an envelope, and a placement's own signature (checked
// entirely inside application/PublicationSnapshotPlacementExchange.js) is
// the only thing that ever made it acceptable. Authentication is a
// channel/identity property gating WHO this replica sends to — never an
// authority mechanism that makes a received placement any more or less
// resolvable. This class introduces no concept of a "trusted peer" or
// peer reputation score for placements, and none should ever be added to
// it.
export class PublicationSnapshotPlacementPeerExchange {
    constructor(placementExchange, peerMessageBus, connectedPeerRegistry, {
        protocol = PublicationSnapshotPlacementPeerExchange.DEFAULT_PROTOCOL
    } = {}) {
        if (!placementExchange
            || typeof placementExchange.importPlacement !== 'function'
            || typeof placementExchange.exportPlacement !== 'function'
            || typeof placementExchange.findByPublicationId !== 'function') {
            throw new Error('PublicationSnapshotPlacementPeerExchange: a PublicationSnapshotPlacementExchange is required');
        }
        if (!peerMessageBus || typeof peerMessageBus.send !== 'function' || typeof peerMessageBus.subscribe !== 'function' || typeof peerMessageBus.attach !== 'function') {
            throw new Error('PublicationSnapshotPlacementPeerExchange: a PeerMessageBus is required');
        }
        if (!connectedPeerRegistry || typeof connectedPeerRegistry.list !== 'function' || typeof connectedPeerRegistry.onChange !== 'function') {
            throw new Error('PublicationSnapshotPlacementPeerExchange: a ConnectedPeerRegistry is required');
        }
        this._exchange = placementExchange;
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

    // Announces `placement` — a real, signed PublicationSnapshotPlacement
    // this replica already holds (its own, or one it cataloged some other
    // way) — to every peer currently AUTHENTICATED on the injected
    // ConnectedPeerRegistry. `exportPlacement()` (unchanged) is what
    // actually enforces "must be signed"; this method never re-derives
    // that check. Returns the number of peers it was actually sent to —
    // zero connected peers is never an error, only an announcement nobody
    // happened to be listening for, the same restraint application/
    // PublicationAnchorPeerExchange.js#announce() already applies one
    // domain over.
    //
    // Deliberately never touches this replica's OWN catalog — a placement
    // a caller can export is, by construction, already a real
    // PublicationSnapshotPlacement instance the caller obtained some
    // other way; cataloging it locally is that caller's own business,
    // exactly as separate from announcing it as application/
    // LocalPublicationSnapshotPlacementCatalog.js's own header keeps
    // cataloging separate from resolving.
    announce(placement) {
        const envelope = this._exchange.exportPlacement(placement);
        const message = toPublicationSnapshotPlacementAnnounceMessage(envelope);
        const authenticatedPeers = this._registry.list().filter((peer) => peer.getLifecycleState() === PeerLifecycleState.AUTHENTICATED);
        for (const peer of authenticatedPeers) {
            this._bus.send(peer, this._protocol, message);
        }
        return authenticatedPeers.length;
    }

    // Asks exactly one `peer` for placements it knows about
    // `publicationId` — a caller-chosen ConnectedPeer, typically whoever
    // this replica learned the publicationId from some other way. There
    // is no return value and no promise of a reply — a RESPONSE, if one
    // ever arrives, is delivered later, asynchronously, to each of its
    // placements triggering onPlacementReceived() below, the identical
    // fire-and-forget shape application/PublicationAnchorPeerExchange.js#
    // requestAnchors() already established one domain over. `peer` not
    // being AUTHENTICATED is left entirely to peer/PeerMessageBus.js#
    // send()'s own check, unchanged.
    requestPlacements(peer, publicationId) {
        const message = toPublicationSnapshotPlacementRequestMessage(publicationId);
        this._bus.send(peer, this._protocol, message);
    }

    // Fires with `{ placement, isNew }` — application/
    // PublicationSnapshotPlacementExchange.js#importPlacement()'s own
    // return shape, passed straight through — every time an incoming
    // ANNOUNCE, or any single placement inside an incoming RESPONSE, is
    // successfully cataloged, including a re-announce/re-synchronize of
    // something already known (`isNew: false`). Never fires for an
    // envelope that failed validation or signature verification; see
    // `_handleIncoming()` below. Never fires as a result of, or alongside,
    // any call to application/SnapshotPlacementResolver.js — this event
    // reports "a new claim is known," never "a claim was resolved." A
    // caller cannot tell from this event alone whether a placement
    // arrived via ANNOUNCE or via RESPONSE — both mean exactly the same
    // thing once cataloged, the identical "propagation carries a record,
    // it does not mint a new claim" restraint this class's own header
    // already draws for ANNOUNCE alone, now proven to hold for RESPONSE
    // too.
    onPlacementReceived(callback) {
        const subscription = this._eventBus.subscribe(PLACEMENT_RECEIVED_EVENT, callback);
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
        // PublicationAnchorPeerExchange.js#dispose() already documents for
        // the identical reason.
    }

    // The ingestion boundary, dispatching on `kind`. A malformed gossip
    // wrapper, or an envelope that fails structural or signature
    // validation, is dropped here, silently — exactly like application/
    // PublicationAnchorPeerExchange.js#_handleIncoming() drops an
    // unverifiable anchor. One peer's bad or forged message can never
    // crash this replica's message bus, and can never catalog anything
    // this replica did not independently verify the SIGNATURE of itself.
    //
    // Never calls application/SnapshotPlacementResolver.js from ANY
    // branch — see this class's own header. A storage backend that is
    // currently unreachable, or a locator that does not actually serve
    // any bytes, is never a reason to reject an announcement, a
    // synchronized placement, or a discovery request here; that is a
    // resolution question, answered separately, on demand, by whatever
    // caller wants a live answer.
    _handleIncoming(payload, meta) {
        if (!isValidPublicationSnapshotPlacementPeerMessage(payload)) {
            return;
        }
        if (payload.kind === PublicationSnapshotPlacementPeerMessageKind.REQUEST) {
            this._handleRequest(payload, meta);
            return;
        }
        if (payload.kind === PublicationSnapshotPlacementPeerMessageKind.RESPONSE) {
            this._handleResponse(payload);
            return;
        }
        this._importAndPublish(payload.envelope);
    }

    // Answers a REQUEST from THIS replica's own catalog only — never
    // forwards the request to anyone else, never asks a third peer on the
    // requester's behalf. Every matching placement this replica holds is
    // offered, exported the SAME way announce() already exports one — via
    // application/PublicationSnapshotPlacementExchange.js#
    // exportPlacement(), which refuses an unsigned entry. A placement
    // this replica cataloged some OTHER way (application/
    // AddPublicationSnapshotPlacementUseCase.js tolerates an unsigned
    // one) is silently skipped here rather than aborting the whole
    // response — one bad or unsigned cataloged entry never prevents every
    // other matching placement from being offered. Truncated, never
    // rejected outright, at MAX_PLACEMENTS_PER_RESPONSE — the SENDING
    // side's own half of this milestone's bounded-response defense; the
    // RECEIVING side's own half is application/
    // PublicationSnapshotPlacementPeerProtocol.js#
    // isValidPublicationSnapshotPlacementPeerMessage()'s own ceiling
    // check. Silently sends nothing at all if this replica knows no
    // matching placement — see application/
    // PublicationSnapshotPlacementPeerProtocol.js's own header on why
    // "not found" is never a message this protocol sends.
    _handleRequest({ publicationId }, meta) {
        const known = this._exchange.findByPublicationId(publicationId);
        const envelopes = [];
        for (const placement of known) {
            if (envelopes.length >= MAX_PLACEMENTS_PER_RESPONSE) {
                break;
            }
            try {
                envelopes.push(this._exchange.exportPlacement(placement));
            } catch {
                // Unsigned or otherwise unexportable — skip it, never let
                // one bad cataloged entry break the response for every
                // other matching placement.
            }
        }
        if (!envelopes.length) {
            return;
        }
        let message;
        try {
            message = toPublicationSnapshotPlacementResponseMessage(publicationId, envelopes);
        } catch {
            return;
        }
        try {
            this._bus.send(meta.connectedPeer, this._protocol, message);
        } catch {
            // The requesting peer may have disconnected between REQUEST
            // and RESPONSE — never crash the bus over a race like that.
        }
    }

    // The ingestion boundary for a RESPONSE — every placement it carries
    // runs through the IDENTICAL application/
    // PublicationSnapshotPlacementExchange.js#importPlacement() call an
    // ANNOUNCE already runs through, one at a time, in order. THE key
    // property this milestone's own design insisted on: synchronization
    // introduces no SECOND way for a placement to become trusted — a
    // RESPONSE's envelopes are exactly as structurally-validated and
    // signature-verified as an ANNOUNCE's single one always was, never a
    // bulk-trust shortcut. A forged or malformed entry anywhere in the
    // array is dropped, silently, without aborting the rest of the batch
    // — the identical "one bad message never blocks another" restraint
    // `_handleRequest()` above already applies while BUILDING a response,
    // now applied here while CONSUMING one. Deduplication needs no code
    // of its own: application/LocalPublicationSnapshotPlacementCatalog.js
    // #add() already dedupes by the placement's own id (0.8.18), so two
    // peers answering the same REQUEST with the identical placement — or
    // the same peer answering twice — converges to exactly one cataloged
    // entry, `isNew: false` the second time, exactly like a duplicate
    // ANNOUNCE already does.
    _handleResponse({ placements }) {
        for (const envelope of placements) {
            this._importAndPublish(envelope);
        }
    }

    // The ONE place both ANNOUNCE (`_handleIncoming()`) and RESPONSE
    // (`_handleResponse()`) ingestion converge.
    _importAndPublish(envelope) {
        let result;
        try {
            result = this._exchange.importPlacement(envelope);
        } catch {
            return;
        }
        this._eventBus.publish(PLACEMENT_RECEIVED_EVENT, result);
    }
}

// Namespaced so it can never collide with chat/presence/profile/
// interaction/identity-lifecycle/device-authorization/publication/content/
// anchor traffic multiplexed over the same connection — see application/
// PublicationAnchorPeerExchange.js's own DEFAULT_PROTOCOL.
PublicationSnapshotPlacementPeerExchange.DEFAULT_PROTOCOL = 'forkbuild:snapshot-placement';
