import { PeerLifecycleState } from '../peer/PeerLifecycleState.js';
import { EventBus } from '../core/events/EventBus.js';
import {
    PublicationAnchorPeerMessageKind,
    MAX_ANCHORS_PER_RESPONSE,
    toPublicationAnchorAnnounceMessage,
    toPublicationAnchorRequestMessage,
    toPublicationAnchorResponseMessage,
    isValidPublicationAnchorPeerMessage
} from './PublicationAnchorPeerProtocol.js';
import { AnchorAcquisitionKind } from './AnchorAcquisitionKind.js';

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
// PublicationPeerExchange.js's own header already draws: incoming ANNOUNCE
// handling never reads `meta.connectedPeer` to decide whether to trust an
// envelope, and an anchor's own signature (checked entirely inside
// application/PublicationAnchorExchange.js) is the only thing that ever
// made it trustworthy. Authentication is a channel/identity property
// gating WHO this replica sends to — never an authority mechanism that
// makes a received anchor any more or less verified. This class
// introduces no concept of a "trusted peer" or peer reputation score for
// anchors, and none should ever be added to it.
//
// 0.8.5 — Historical Anchor Discovery & Synchronization.
//
// 0.8.4's own header named this milestone directly and declined to build
// it: "REQUEST/RESPONSE (historical anchor discovery for a newly joined
// replica) is deliberately left for its own future milestone." This class
// now also answers `requestAnchors(peer, publicationId)` — "ask exactly
// one peer for anchors it knows about this publication" — and the two
// new incoming handlers that make it work: `_handleRequest()` (answer a
// REQUEST from this replica's own catalog, via application/
// PublicationAnchorExchange.js#findByPublicationId(), bounded at
// MAX_ANCHORS_PER_RESPONSE) and `_handleResponse()` (import every anchor
// in a RESPONSE through the IDENTICAL `importAnchor()` call
// `_handleIncoming()` already runs an ANNOUNCE through — see this class's
// own docs/Principles.md entry for 0.8.5 on why that reuse is the whole
// point).
//
// THE CENTRAL INVARIANT EXTENDS UNCHANGED: `_handleResponse()` never
// calls application/ExternalAnchorVerifier.js either, and a RESPONSE
// carries nothing but plain `PublicationAnchor.toJSON()` envelopes — no
// `receivedAt`, no verification outcome, no "which peer told me this"
// metadata (see application/PublicationAnchorPeerProtocol.js#
// toPublicationAnchorResponseMessage()'s own header). Synchronization
// distributes CLAIMS this replica did not have yet; it never distributes
// what any replica has concluded about them.
//
// 0.8.17 — Evidence Provenance & Observation Boundary.
//
// `_importAndPublish()` now also records a LOCAL-ONLY application/
// AnchorAcquisitionKind.js#PEER knowledge entry for every anchor it
// successfully imports (see the optional `knowledgeStore` constructor
// parameter). This is NOT wire traffic — no PEER knowledge record, and
// no field naming which peer this anchor arrived from, is ever sent,
// received, or exists anywhere in application/
// PublicationAnchorPeerProtocol.js's own message shapes. It is this
// replica's own bookkeeping about its own history, written after
// import succeeds, exactly the way `receivedAt` already is one layer
// down inside application/LocalPublicationAnchorStore.js.
export class PublicationAnchorPeerExchange {
    // knowledgeStore: OPTIONAL, an application/LocalAnchorKnowledgeStore.js
    // instance (0.8.17). When supplied, every anchor this class
    // successfully imports — via ANNOUNCE or RESPONSE, `isNew` either way
    // — also records an application/AnchorAcquisitionKind.js#PEER
    // knowledge entry; see `_importAndPublish()` below, the ONE place
    // both ingestion paths already converge. Deliberately records no
    // peerId, connectionId, or remote identity alongside it — see this
    // milestone's own docs/Roadmap.md entry on why PEER is where THIS
    // codebase draws the line, never "PEER, from Alice."
    constructor(anchorExchange, peerMessageBus, connectedPeerRegistry, {
        protocol = PublicationAnchorPeerExchange.DEFAULT_PROTOCOL,
        knowledgeStore = null
    } = {}) {
        if (!anchorExchange
            || typeof anchorExchange.importAnchor !== 'function'
            || typeof anchorExchange.exportAnchor !== 'function'
            || typeof anchorExchange.findByPublicationId !== 'function') {
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
        this._knowledgeStore = knowledgeStore;
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

    // Asks exactly one `peer` for anchors it knows about `publicationId`
    // — a caller-chosen ConnectedPeer, typically whoever this replica
    // learned the publicationId from some other way (a cataloged
    // DecentralizedPublication, a relayed anchor naming it, or simply
    // "every currently authenticated peer," a caller's own choice). There
    // is no return value and no promise of a reply — a RESPONSE, if one
    // ever arrives, is delivered later, asynchronously, to each of its
    // anchors triggering onAnchorReceived() below, the identical
    // fire-and-forget shape application/PeerContentExchange.js#request()
    // already established one domain over. `peer` not being AUTHENTICATED
    // is left entirely to peer/PeerMessageBus.js#send()'s own check,
    // unchanged.
    requestAnchors(peer, publicationId) {
        const message = toPublicationAnchorRequestMessage(publicationId);
        this._bus.send(peer, this._protocol, message);
    }

    // Fires with `{ anchor, isNew }` — application/
    // PublicationAnchorExchange.js#importAnchor()'s own return shape,
    // passed straight through — every time an incoming ANNOUNCE, or any
    // single anchor inside an incoming RESPONSE, is successfully
    // cataloged, including a re-announce/re-synchronize of something
    // already known (`isNew: false`). Never fires for an envelope that
    // failed validation or signature verification; see `_handleIncoming()`
    // below. Never fires as a result of, or alongside, any call to
    // application/ExternalAnchorVerifier.js — this event reports "a new
    // claim is known," never "a claim was verified." A caller cannot tell
    // from this event alone whether an anchor arrived via ANNOUNCE or via
    // RESPONSE — both mean exactly the same thing once cataloged, the
    // identical "propagation carries a record, it does not mint a new
    // claim" restraint this class's own header already draws for ANNOUNCE
    // alone, now proven to hold for RESPONSE too.
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

    // The ingestion boundary, dispatching on `kind`. ANNOUNCE runs through
    // application/PublicationAnchorExchange.js#importAnchor() UNCHANGED
    // since 0.8.4 — structural validation, then construction, then
    // SIGNATURE verification only, applied here to an anchor that arrived
    // over a live, authenticated peer connection instead of however else
    // it might have reached this replica. A malformed gossip wrapper, or
    // an envelope that fails structural or signature validation, is
    // dropped here, silently — exactly like application/
    // PublicationPeerExchange.js#_handleIncoming() drops an unverifiable
    // publication. One peer's bad or forged message can never crash this
    // replica's message bus, and can never catalog anything this replica
    // did not independently verify the SIGNATURE of itself. REQUEST and
    // RESPONSE (0.8.5) are handled below by their own methods, under the
    // identical "malformed wrapper -> silently dropped" restraint —
    // `isValidPublicationAnchorPeerMessage()` already rejected anything
    // that is neither a well-formed ANNOUNCE, REQUEST, nor RESPONSE
    // before this method ever sees `payload.kind`.
    //
    // Never calls application/ExternalAnchorVerifier.js from ANY branch
    // — see this class's own header. A Bitcoin transaction that does not
    // exist, or an external system that is unreachable, is never a reason
    // to reject an announcement, a synchronized anchor, or a discovery
    // request here; that is a proof-verification question, answered
    // separately, on demand, by whatever caller wants a live answer.
    _handleIncoming(payload, meta) {
        if (!isValidPublicationAnchorPeerMessage(payload)) {
            return;
        }
        if (payload.kind === PublicationAnchorPeerMessageKind.REQUEST) {
            this._handleRequest(payload, meta);
            return;
        }
        if (payload.kind === PublicationAnchorPeerMessageKind.RESPONSE) {
            this._handleResponse(payload);
            return;
        }
        this._importAndPublish(payload.envelope);
    }

    // Answers a REQUEST from THIS replica's own catalog only — never
    // forwards the request to anyone else, never asks a third peer on the
    // requester's behalf (see docs/Roadmap.md, 0.8.5, "Deliberately
    // excluded," on why relayed/transitive discovery stays out of scope).
    // Every matching anchor this replica holds is offered, exported the
    // SAME way announce() already exports one — via application/
    // PublicationAnchorExchange.js#exportAnchor(), which refuses an
    // unsigned entry. An anchor this replica cataloged some OTHER way
    // (application/AddPublicationAnchorUseCase.js tolerates an unsigned
    // one) is silently skipped here rather than aborting the whole
    // response — one bad or unsigned cataloged entry never prevents every
    // other matching anchor from being offered. Truncated, never
    // rejected outright, at MAX_ANCHORS_PER_RESPONSE — the SENDING side's
    // own half of this milestone's bounded-response defense; the
    // RECEIVING side's own half is application/
    // PublicationAnchorPeerProtocol.js#isValidPublicationAnchorPeerMessage
    // ()'s own ceiling check. Silently sends nothing at all if this
    // replica knows no matching anchor — see application/
    // PublicationAnchorPeerProtocol.js's own header on why "not found" is
    // never a message this protocol sends.
    _handleRequest({ publicationId }, meta) {
        const known = this._exchange.findByPublicationId(publicationId);
        const envelopes = [];
        for (const anchor of known) {
            if (envelopes.length >= MAX_ANCHORS_PER_RESPONSE) {
                break;
            }
            try {
                envelopes.push(this._exchange.exportAnchor(anchor));
            } catch {
                // Unsigned or otherwise unexportable — skip it, never let
                // one bad cataloged entry break the response for every
                // other matching anchor.
            }
        }
        if (!envelopes.length) {
            return;
        }
        let message;
        try {
            message = toPublicationAnchorResponseMessage(publicationId, envelopes);
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

    // The ingestion boundary for a RESPONSE — every anchor it carries
    // runs through the IDENTICAL application/PublicationAnchorExchange.js
    // #importAnchor() call an ANNOUNCE already runs through, one at a
    // time, in order. THE key property this milestone's own design
    // insisted on: synchronization introduces no SECOND way for an anchor
    // to become trusted — a RESPONSE's envelopes are exactly as
    // structurally-validated and signature-verified as an ANNOUNCE's
    // single one always was, never a bulk-trust shortcut. A forged or
    // malformed entry anywhere in the array is dropped, silently, without
    // aborting the rest of the batch — the identical "one bad message
    // never blocks another" restraint `_handleRequest()` above already
    // applies while BUILDING a response, now applied here while
    // CONSUMING one. Deduplication needs no code of its own: application/
    // LocalPublicationAnchorCatalog.js#add() already dedupes by the
    // anchor's own id (0.8.2), so two peers answering the same REQUEST
    // with the identical anchor — or the same peer answering twice —
    // converges to exactly one cataloged entry, `isNew: false` the second
    // time, exactly like a duplicate ANNOUNCE already does.
    _handleResponse({ anchors }) {
        for (const envelope of anchors) {
            this._importAndPublish(envelope);
        }
    }

    // 0.8.17 — Evidence Provenance & Observation Boundary. The ONE place
    // both ANNOUNCE (`_handleIncoming()`) and RESPONSE (`_handleResponse
    // ()`) ingestion converge, and therefore the one place a PEER
    // knowledge record is ever written — every anchor that reaches this
    // replica over a peer connection, by either transport, records
    // identically. Called unconditionally on every successful import,
    // `isNew` either way; application/LocalAnchorKnowledgeStore.js#
    // record()'s own first-seen-wins discipline is what keeps a
    // re-announce or re-synchronize of an already-known anchor from ever
    // overwriting an earlier LOCAL or PACKAGE acquisition. See this
    // class's own header.
    _importAndPublish(envelope) {
        let result;
        try {
            result = this._exchange.importAnchor(envelope);
        } catch {
            return;
        }
        if (this._knowledgeStore) {
            this._knowledgeStore.record(result.anchor.id, AnchorAcquisitionKind.PEER);
        }
        this._eventBus.publish(ANCHOR_RECEIVED_EVENT, result);
    }
}

// Namespaced so it can never collide with chat/presence/profile/
// interaction/identity-lifecycle/device-authorization/publication/content
// traffic multiplexed over the same connection — see application/
// PublicationPeerExchange.js's own DEFAULT_PROTOCOL.
PublicationAnchorPeerExchange.DEFAULT_PROTOCOL = 'forkbuild:anchor';
