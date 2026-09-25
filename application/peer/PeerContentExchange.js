import { EventBus } from '../../core/events/EventBus.js';
import { ContentReference } from '../../core/ContentReference.js';
import {
    PeerContentMessageKind,
    MAX_CONTENT_BYTES,
    toContentRequestMessage,
    toContentResponseMessage,
    toContentResponsePartMessage,
    isValidPeerContentMessage
} from './PeerContentProtocol.js';
import { PartAssembler, OutstandingRequests, sendInParts } from './ChunkedPeerTransfer.js';

const CONTENT_RECEIVED_EVENT = 'PeerContentExchangeReceived';
const TRANSFER_PROGRESS_EVENT = 'PeerContentExchangeTransferProgress';

// 0.7.4 — Peer Content Retrieval.
//
// The pipeline this milestone's own docs/Roadmap.md entry draws runs:
//
//   Peer -> PublicationPeerExchange -> PublicationCatalog
//        -> PublicationResolver -> ContentStore
//
// and names exactly what was still missing: "if Bob discovers a
// publication whose content he doesn't have, Bob should be able to ask a
// peer for that content." This class is that missing pull. It is a
// REQUEST/RESPONSE protocol for content BYTES, never a modification of
// application/publication/PublicationPeerExchange.js — that class still only ever
// gossips signed locators; this one moves the bytes a locator points at,
// entirely separately, over the SAME authenticated connection.
//
// Deliberately does not reinvent a peer transport, for the identical
// reason application/publication/PublicationPeerExchange.js's own header gives:
// peer/PeerMessageBus.js already solved "how do independent decentralized
// protocols safely share one authenticated peer connection," namespaced
// by protocol string, gated on PeerLifecycleState.AUTHENTICATED,
// malformed/oversized/duplicate hygiene already handled one layer down.
// This class attaches to the SAME bus instance a caller already uses for
// PublicationPeerExchange, under its own 'forkbuild:content' protocol —
// tests/PeerContentExchange.test.js's own flagship proves both run over
// one real connection at once, exactly as multiplexed as peer/
// PeerMessageBus.js's own header always promised.
//
// THE CRITICAL SECURITY RULE, stated once here because it governs every
// method below: a peer is never trusted merely because it supplied
// bytes. Peer identity is not content authenticity, and a publication's
// own signature is not content-delivery authority — that signature only
// ever proved who published a LOCATOR (core/DecentralizedPublication.js's
// own header), never who is allowed to hand this replica bytes for it.
// The only thing that ever makes a RESPONSE trustworthy is core/
// ContentReference.js#verify(): recomputing the hash of exactly the bytes
// received and checking it against exactly the hash that was requested.
// `_handleResponse()` below never stores anything that fails this check,
// and application/peer/PeerContentExchange.js introduces no notion of a
// "trusted peer" that could ever bypass it.
//
// THE AUTHORIZATION BOUNDARY, the second rule this milestone's own design
// conversation insisted on: this class is not a generic file-transfer
// service. Both `request()` and `_handleRequest()` refuse to act on a
// hash the injected PublicationCatalog does not already know, via SOME
// cataloged DecentralizedPublication's own contentReference — a REQUEST
// for an arbitrary hash nobody ever published a locator for goes
// unanswered, and this replica never asks its own peer for one either.
// Unknown hash -> no request, ever. Known publication -> a request is
// permitted, never guaranteed an answer.
export class PeerContentExchange {
    constructor(contentStore, peerMessageBus, connectedPeerRegistry, publicationCatalog, {
        protocol = PeerContentExchange.DEFAULT_PROTOCOL
    } = {}) {
        if (!contentStore || typeof contentStore.get !== 'function' || typeof contentStore.put !== 'function') {
            throw new Error('PeerContentExchange: a ContentStore is required');
        }
        if (!peerMessageBus || typeof peerMessageBus.send !== 'function' || typeof peerMessageBus.subscribe !== 'function' || typeof peerMessageBus.attach !== 'function') {
            throw new Error('PeerContentExchange: a PeerMessageBus is required');
        }
        if (!connectedPeerRegistry || typeof connectedPeerRegistry.list !== 'function' || typeof connectedPeerRegistry.onChange !== 'function') {
            throw new Error('PeerContentExchange: a ConnectedPeerRegistry is required');
        }
        if (!publicationCatalog || typeof publicationCatalog.findByContentHash !== 'function') {
            throw new Error('PeerContentExchange: a PublicationCatalog is required');
        }
        this._contentStore = contentStore;
        this._bus = peerMessageBus;
        this._registry = connectedPeerRegistry;
        this._catalog = publicationCatalog;
        this._protocol = protocol;
        this._eventBus = new EventBus();
        // Content too large for one RESPONSE arrives in parts
        // (ChunkedPeerTransfer.js), accepted only for hashes this side
        // requested.
        this._assembler = new PartAssembler();
        this._outstanding = new OutstandingRequests();
        // connectionId|hash of part transfers being sent: a peer repeating
        // a REQUEST never starts a second copy of the same transfer.
        this._sending = new Set();

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

    // Requests `hash`'s bytes from exactly one `peer` — a caller-chosen
    // ConnectedPeer, typically whoever announced the publication this
    // hash belongs to. Refuses, per this class's own authorization
    // boundary, unless this replica's OWN catalog already holds at least
    // one publication whose contentReference.hash equals `hash`; `peer`
    // not being AUTHENTICATED is left to peer/PeerMessageBus.js#send()'s
    // own check, unchanged. There is no return value and no promise of a
    // reply — a RESPONSE, if one ever arrives, is delivered later,
    // asynchronously, to onContentReceived() below.
    request(peer, hash) {
        if (!this._catalog.findByContentHash(hash).length) {
            throw new Error('PeerContentExchange: refusing to request a hash with no known publication in the catalog');
        }
        const message = toContentRequestMessage(hash);
        this._bus.send(peer, this._protocol, message);
        this._outstanding.add(hash);
    }

    // Fires with `{ hash }` every time an incoming RESPONSE is verified
    // and actually stored — never for one that is malformed, unsolicited
    // (unknown to this replica's own catalog), or fails hash
    // verification. Those are all silently dropped by `_handleResponse()`
    // below, the identical restraint application/
    // PublicationPeerExchange.js#onPublicationReceived() already applies
    // to a bad ANNOUNCE.
    onContentReceived(callback) {
        const subscription = this._eventBus.subscribe(CONTENT_RECEIVED_EVENT, callback);
        return () => subscription.unsubscribe();
    }

    // callback({ hash, receivedLength, totalLength }) for each part of a
    // content arriving in parts, so a caller waiting for it can tell a
    // slow transfer from one that stopped. Returns an unsubscribe function.
    onTransferProgress(callback) {
        const subscription = this._eventBus.subscribe(TRANSFER_PROGRESS_EVENT, callback);
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
        // Deliberately does NOT dispose the injected contentStore,
        // peerMessageBus, connectedPeerRegistry, or publicationCatalog —
        // all four are shared, app-wide collaborators this class never
        // owns, the same restraint application/publication/PublicationPeerExchange.js#
        // dispose() already documents for its own two.
    }

    _handleIncoming(payload, meta) {
        if (!isValidPeerContentMessage(payload)) {
            return;
        }
        if (payload.kind === PeerContentMessageKind.REQUEST) {
            this._handleRequest(payload, meta);
            return;
        }
        if (payload.kind === PeerContentMessageKind.RESPONSE_PART) {
            this._handlePart(payload, meta);
            return;
        }
        this._handleResponse(payload);
    }

    // Answers a REQUEST only for a hash this replica's own catalog
    // already knows a publication for — the RESPONDING side's own half
    // of this class's authorization boundary, independent of whatever
    // the requester itself checked, exactly the "never trust the other
    // side already checked" discipline this codebase applies throughout.
    // Silently does nothing — no reply at all — if the hash is unknown,
    // if this replica's own ContentStore does not actually have the
    // bytes, or if they exceed ChunkedPeerTransfer.js's MAX_TRANSFER_LENGTH; see
    // application/peer/PeerContentProtocol.js's own header on why "not found"
    // is never a message this protocol sends.
    async _handleRequest({ hash }, meta) {
        const publications = this._catalog.findByContentHash(hash);
        if (!publications.length) {
            return;
        }
        let bytes;
        try {
            bytes = await this._contentStore.get(publications[0].contentReference);
        } catch {
            return;
        }
        if (bytes === null || bytes === undefined) {
            return;
        }
        // One RESPONSE when the content fits a message (what every peer
        // understands); otherwise parts. A send failure here is either
        // the message being too large once JSON-escaped, which parts
        // handle, or the peer having gone away, which sendInParts() also
        // notices, never crashing the bus over the race.
        if (typeof bytes === 'string' && bytes.length > 0 && bytes.length <= MAX_CONTENT_BYTES) {
            try {
                this._bus.send(meta.connectedPeer, this._protocol, toContentResponseMessage(hash, bytes));
                return;
            } catch {
                // fall through to parts
            }
        }
        if (typeof bytes !== 'string' || bytes.length === 0) {
            return;
        }
        const sendingKey = `${meta.connectedPeer && meta.connectedPeer.connectionId}|${hash}`;
        if (this._sending.has(sendingKey)) {
            return;
        }
        this._sending.add(sendingKey);
        try {
            await sendInParts(this._bus, meta.connectedPeer, this._protocol, bytes,
                (fields) => toContentResponsePartMessage(hash, fields));
        } finally {
            this._sending.delete(sendingKey);
        }
    }

    // A part of a content arriving in parts. Accepted only while this side
    // is waiting for that hash (see request()), and only when its declared
    // length matches the size the catalog's reference records, if any;
    // the joined content then goes through _handleResponse() exactly like
    // a single RESPONSE, hash check included.
    _handlePart(message, meta) {
        const { hash } = message;
        if (!this._outstanding.has(hash)) {
            return;
        }
        const publications = this._catalog.findByContentHash(hash);
        if (!publications.length) {
            return;
        }
        const expectedSize = publications[0].contentReference && publications[0].contentReference.size;
        if (Number.isInteger(expectedSize) && expectedSize > 0 && expectedSize !== message.totalLength) {
            return;
        }
        const senderKey = (meta && meta.connectedPeer && meta.connectedPeer.connectionId) || 'unknown';
        const result = this._assembler.accept(`${senderKey}|${hash}`, message);
        if (result.status === 'progress') {
            this._eventBus.publish(TRANSFER_PROGRESS_EVENT, { hash, receivedLength: result.receivedLength, totalLength: result.totalLength });
        } else if (result.status === 'complete') {
            this._handleResponse({ hash, bytes: result.text });
        }
    }

    // The ingestion boundary for a RESPONSE, and the one place this
    // class's central security rule (see this file's own header) is
    // structurally enforced. Never stores anything, and never fires
    // onContentReceived(), unless BOTH:
    //
    //   1. this replica's own catalog already knows a publication for
    //      `hash` (an unsolicited RESPONSE for a hash nobody here ever
    //      asked about, or that no locator was ever cataloged for, is
    //      dropped — the identical boundary `request()` applies before
    //      ever sending);
    //   2. `core/ContentReference.js#verify()` confirms the received
    //      bytes actually hash to `hash` — never merely because SOME
    //      peer, authenticated or not, chose to send them.
    //
    // Storing then goes through `this._contentStore.put(bytes)`
    // unchanged — content/LocalContentStore.js#put() already recomputes
    // its own hash from the bytes rather than accepting one handed to
    // it, so this call can never mislabel content under a hash that
    // does not match what was actually stored, even redundantly with the
    // check just performed. A duplicate RESPONSE for a hash already
    // stored is harmless: put() is idempotent by construction (same
    // bytes hash to the same key), so two peers answering the same
    // REQUEST, or the same peer answering twice, converge to one entry.
    async _handleResponse({ hash, bytes }) {
        if (!this._catalog.findByContentHash(hash).length) {
            return;
        }
        if (!new ContentReference({ hash }).verify(bytes)) {
            return;
        }
        try {
            await this._contentStore.put(bytes);
        } catch {
            return;
        }
        this._outstanding.delete(hash);
        this._eventBus.publish(CONTENT_RECEIVED_EVENT, { hash });
    }
}

// Namespaced separately from application/publication/PublicationPeerExchange.js's own
// 'forkbuild:publication' — the two protocols share peer/PeerMessageBus.js
// but never each other's messages, exactly the separation this class's
// own header describes between gossiping a locator and pulling the bytes
// it points at.
PeerContentExchange.DEFAULT_PROTOCOL = 'forkbuild:content';
