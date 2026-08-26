import { EventBus } from '../core/events/EventBus.js';
import { ContentReference } from '../core/ContentReference.js';
import { LocalSnapshotContentAvailabilityOutcome } from './LocalSnapshotContentAvailabilityOutcome.js';
import {
    PeerSnapshotPossessionMessageKind,
    PeerSnapshotPossessionWireState,
    toSnapshotPossessionRequestMessage,
    toSnapshotPossessionResponseMessage,
    isValidPeerSnapshotPossessionMessage
} from './PeerSnapshotPossessionProtocol.js';

const POSSESSION_RECEIVED_EVENT = 'PublicationSnapshotPossessionPeerExchangeReceived';

// 0.8.40 — Snapshot Possession Observation Exchange.
//
// application/PublicationSnapshotContentPeerExchange.js (0.8.37) is the
// transport for one person's explicit "Give me the bytes" click. This class
// is its narrower sibling for the question that milestone's own conclusion
// named directly: "Do you have bytes matching this hash?" — asked, and
// answered, without a single byte ever crossing the wire. Structurally the
// SAME shape every *PeerExchange.js in this codebase already holds
// (attach to application/ConnectedPeerRegistry.js peers now and in the
// future, subscribe to this file's own DEFAULT_PROTOCOL over peer/
// PeerMessageBus.js, dispatch REQUEST/RESPONSE), narrowed to exactly the
// two responsibilities application/
// PublicationSnapshotPossessionProtocol.js's own header already promises:
//
//   REQUESTING side — requestPossession(peer, { publicationId, contentHash }):
//     validate, send to exactly one caller-chosen AUTHENTICATED peer,
//     nothing more. A RESPONSE, if one ever arrives, reaches
//     onPossessionReceived() asynchronously — this method makes no promise
//     of a reply, exactly like application/
//     PublicationSnapshotContentPeerExchange.js#request()'s own identical
//     restraint.
//   RESPONDING side — _handleRequest(): check THIS replica's OWN local
//     content store, and ALWAYS answer, AVAILABLE or NOT_AVAILABLE — never
//     silence. See application/PeerSnapshotPossessionProtocol.js's own
//     header on why this is the one place this class's wire behavior
//     actually differs from every sibling *PeerExchange.js: a REQUEST here
//     always gets a RESPONSE, because "no" is exactly as answerable, and
//     exactly as informative, as "yes."
//
// THE ONE STRUCTURAL RULE THIS CLASS EXISTS TO ENFORCE, restated from
// application/PeerSnapshotPossessionProtocol.js's own header because it
// shapes every method below: THIS CLASS NEVER TRANSFERS A SINGLE BYTE. It
// never reads a candidate's actual content beyond what `_handleRequest()`
// needs to answer AVAILABLE/NOT_AVAILABLE, never writes to a ContentStore,
// and — unlike application/PublicationSnapshotContentPeerExchange.js's own
// `_handleRequest()`, which sends the bytes it read — never re-sends
// anything it reads back over the wire. A responder that reports AVAILABLE
// promises nothing about what a SUBSEQUENT "Get Snapshot from Peer"
// request against it will find; that remains application/
// PublicationSnapshotContentPeerExchange.js's own, entirely separate,
// entirely independent transport, exactly as true here as it always was —
// see docs/Principles.md, "Peer Possession Responses Are Observations, Not
// Placement Claims (0.8.40)."
//
// THE RESPONDING SIDE REUSES application/
// CheckLocalSnapshotContentAvailabilityUseCase.js UNCHANGED — the SAME
// 0.8.33 use case, and the SAME semantic definition of "possession,"
// `application/PublicationSnapshotPossessionView.js` (0.8.39) already gives
// the local "Local Snapshot" UI. This class introduces NO second content
// checker, no new hashing, and no independent notion of what "possesses
// this snapshot" means — a peer's own answer to "do you have it?" is
// computed by literally the same code path a person clicking "Check Local
// Snapshot" on their own machine already runs, applied here to a bare
// `{ id, contentReference }` shape built from the REQUEST's own
// `publicationId`/`contentHash` rather than a cataloged core/
// DecentralizedPublication.js — this class never consults a catalog on
// either side, exactly mirroring application/
// PublicationSnapshotContentPeerExchange.js's own identical restraint one
// milestone back. `CONTENT_HASH_MISMATCH` collapses to NOT_AVAILABLE on the
// wire; see application/PeerSnapshotPossessionProtocol.js's own header on
// why.
//
// `meta.connectedPeer` IS read here, unlike application/
// PublicationSnapshotContentPeerExchange.js#_handleResponse(), which never
// needs to know who sent bytes. A possession observation is inherently a
// statement ABOUT the answering peer — see application/
// SnapshotPeerPossessionObservation.js's own header on why `peerId` is the
// one field that shape carries beyond its verification-observation
// siblings — so `onPossessionReceived()` reports the peer's own
// `connectionId` alongside the answer. Peer identity remains informational
// only in every other respect: AUTHENTICATED gates whether `send()` will
// deliver at all (peer/PeerMessageBus.js's own job, unchanged), never
// whether an answer is believed — this class introduces no concept of a
// "trusted peer" or peer reputation for possession, and none should ever be
// added to it.
export class PublicationSnapshotPossessionPeerExchange {
    // checkLocalSnapshotContentAvailabilityUseCase: an application/
    // CheckLocalSnapshotContentAvailabilityUseCase.js instance — this
    // replica's own already-constructed one (see ui/main.js), never a
    // second instance built here; a caller constructing a SEPARATE one
    // would risk it reading a different content/ContentStore.js than the
    // rest of the app, silently splitting this replica's own notion of
    // "what do I possess" into two.
    constructor(checkLocalSnapshotContentAvailabilityUseCase, peerMessageBus, connectedPeerRegistry, {
        protocol = PublicationSnapshotPossessionPeerExchange.DEFAULT_PROTOCOL
    } = {}) {
        if (!checkLocalSnapshotContentAvailabilityUseCase || typeof checkLocalSnapshotContentAvailabilityUseCase.execute !== 'function') {
            throw new Error('PublicationSnapshotPossessionPeerExchange: a CheckLocalSnapshotContentAvailabilityUseCase is required');
        }
        if (!peerMessageBus || typeof peerMessageBus.send !== 'function' || typeof peerMessageBus.subscribe !== 'function' || typeof peerMessageBus.attach !== 'function') {
            throw new Error('PublicationSnapshotPossessionPeerExchange: a PeerMessageBus is required');
        }
        if (!connectedPeerRegistry || typeof connectedPeerRegistry.list !== 'function' || typeof connectedPeerRegistry.onChange !== 'function') {
            throw new Error('PublicationSnapshotPossessionPeerExchange: a ConnectedPeerRegistry is required');
        }
        this._checkLocalPossession = checkLocalSnapshotContentAvailabilityUseCase;
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

    // Asks exactly one `peer` — an already-authenticated ConnectedPeer a
    // person explicitly selected, never one this class picks for them —
    // whether it currently possesses bytes for `contentHash`. No return
    // value and no promise of a reply; a RESPONSE, if one arrives, reaches
    // onPossessionReceived() below. `peer` not being AUTHENTICATED is left
    // entirely to peer/PeerMessageBus.js#send()'s own check, unchanged.
    requestPossession(peer, { publicationId, contentHash } = {}) {
        const message = toSnapshotPossessionRequestMessage(publicationId, contentHash);
        this._bus.send(peer, this._protocol, message);
    }

    // Fires with `{ peerId, publicationId, contentHash, state }` for every
    // structurally valid RESPONSE — `state` is exactly the wire value the
    // peer sent, application/PeerSnapshotPossessionProtocol.js's own
    // `PeerSnapshotPossessionWireState.AVAILABLE`/`NOT_AVAILABLE`, passed
    // straight through. This event reports only "this peer just answered
    // this," never a resolved, verified, or actionable fact — turning it
    // into an application/SnapshotPeerPossessionObservation.js record,
    // timestamped with THIS replica's own clock, is application/
    // ObservePeerSnapshotPossessionUseCase.js's own job, one layer up.
    onPossessionReceived(callback) {
        const subscription = this._eventBus.subscribe(POSSESSION_RECEIVED_EVENT, callback);
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
        // Deliberately does NOT dispose the injected checkLocalSnapshotContentAvailabilityUseCase,
        // peerMessageBus, or connectedPeerRegistry — all three are shared,
        // app-wide collaborators this class never owns, the same restraint
        // every sibling *PeerExchange.js in this codebase already
        // documents.
    }

    _handleIncoming(payload, meta) {
        if (!isValidPeerSnapshotPossessionMessage(payload)) {
            return;
        }
        if (payload.kind === PeerSnapshotPossessionMessageKind.REQUEST) {
            this._handleRequest(payload, meta);
            return;
        }
        this._handleResponse(payload, meta);
    }

    // Answers a REQUEST strictly from THIS replica's own local possession
    // check — never a placement, never a catalog, never IPFS, never
    // another peer, never an anchor. `publicationId` is read only to echo
    // it back on the RESPONSE for the requester's own correlation, exactly
    // mirroring application/PublicationSnapshotContentPeerExchange.js#
    // _handleRequest()'s own identical restraint; it plays no role in
    // deciding what to answer. ALWAYS sends a RESPONSE — see this file's
    // own header and application/PeerSnapshotPossessionProtocol.js's own
    // header on why silence is never this protocol's way of saying "no."
    async _handleRequest({ publicationId, contentHash }, meta) {
        const candidate = { id: publicationId, contentReference: new ContentReference({ hash: contentHash }) };
        let result;
        try {
            result = await this._checkLocalPossession.execute(candidate);
        } catch {
            return;
        }
        const possession = result.outcome === LocalSnapshotContentAvailabilityOutcome.AVAILABLE
            ? PeerSnapshotPossessionWireState.AVAILABLE
            : PeerSnapshotPossessionWireState.NOT_AVAILABLE;
        let message;
        try {
            message = toSnapshotPossessionResponseMessage(publicationId, contentHash, possession);
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

    // The ingestion boundary for a RESPONSE. Structural validity only
    // (`isValidPeerSnapshotPossessionMessage()`, already checked by
    // `_handleIncoming()`); never re-derives, re-checks, or trusts the
    // answer any more because the peer happened to be AUTHENTICATED —
    // authentication gated whether this replica's own REQUEST could be
    // delivered at all, never whether the answer that comes back is
    // believed. `meta.connectedPeer` may be absent for a message this
    // class did not itself solicit (defensive only; peer/PeerMessageBus.js
    // always supplies it for a genuine delivery) — `peerId` reports `null`
    // rather than throwing.
    _handleResponse({ publicationId, contentHash, possession }, meta) {
        this._eventBus.publish(POSSESSION_RECEIVED_EVENT, {
            peerId: (meta && meta.connectedPeer && meta.connectedPeer.connectionId) || null,
            publicationId,
            contentHash,
            state: possession
        });
    }
}

// Namespaced separately from every sibling protocol multiplexed over the
// same peer/PeerMessageBus.js connection — this milestone's own wire shape,
// never confused with application/PublicationSnapshotContentPeerExchange.js's
// own 'forkbuild:snapshot-content-transfer' or any other protocol in this
// codebase.
PublicationSnapshotPossessionPeerExchange.DEFAULT_PROTOCOL = 'forkbuild:snapshot-possession';
