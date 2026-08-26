import { EventBus } from '../core/events/EventBus.js';
import { ContentReference } from '../core/ContentReference.js';
import {
    PeerSnapshotContentMessageKind,
    toSnapshotContentRequestMessage,
    toSnapshotContentResponseMessage,
    isValidPeerSnapshotContentMessage
} from './PeerSnapshotContentProtocol.js';

const CONTENT_RECEIVED_EVENT = 'PublicationSnapshotContentPeerExchangeReceived';

// 0.8.37 — Explicit Peer Snapshot Content Transfer.
//
// 0.8.36 gave this codebase exactly one place bytes claiming a hash ever
// become durable local content — application/StoreSnapshotContentUseCase.js
// — and two explicit, person-driven callers of it: an offline transfer
// package (0.8.32/0.8.34) and a resolved placement (0.8.20/0.8.35). This
// class is the third: the transport a person's own explicit "Get Snapshot
// from Peer" click rides, over one peer THEY chose, to reach that SAME
// boundary. It is deliberately NOT application/PeerContentExchange.js
// (0.7.4) reused or extended — that class already has a job, wired into
// application/PublicationResolutionCoordinator.js (0.7.5/0.7.6) to ask
// EVERY connected peer, automatically, the moment a publication resolves
// CONTENT_UNAVAILABLE, and it verifies-and-stores inline, itself, the
// instant a RESPONSE arrives. Bending that class to also serve one
// person's single deliberate click — on one specific peer, feeding one
// specific shared storage boundary — would either weaken its own
// automatic-retrieval authorization (catalog-gated, see its own header)
// or silently duplicate application/StoreSnapshotContentUseCase.js's own
// verify-then-store shape a THIRD time. Building a second, narrower,
// purely-transport class instead is the identical choice this codebase
// already made keeping application/PublicationPeerExchange.js, application/
// PublicationAnchorPeerExchange.js, and application/
// PublicationSnapshotPlacementPeerExchange.js as three separate classes
// rather than one generic "gossip a signed thing" superclass.
//
// THE ONE STRUCTURAL DIFFERENCE FROM APPLICATION/PEERCONTENTEXCHANGE.JS,
// stated once here because it shapes this entire class: THIS class never
// verifies a hash and never writes to a ContentStore. `onContentReceived()`
// fires for every structurally valid RESPONSE, UNVERIFIED — on purpose.
// Verification and storage stay centralized in application/
// StoreSnapshotContentUseCase.js; this class is a producer that hands it
// raw candidate bytes, exactly like application/
// ImportPublicationSnapshotTransferPackageUseCase.js (an unsigned file) and
// application/MaterializeSnapshotFromPlacementUseCase.js (a resolved
// locator's own claim) already do. See application/
// MaterializeSnapshotFromPeerUseCase.js — the one and only caller this
// class should ever have — for where the received bytes actually meet
// `core/ContentReference.js#verify()`. A second caller that trusted this
// class's own onContentReceived() bytes without routing them through that
// boundary first would defeat the entire point of 0.8.36 having built one.
//
// THE AUTHORIZATION BOUNDARY IS DIFFERENT TOO, and deliberately simpler:
// unlike application/PeerContentExchange.js#request()/_handleRequest(),
// which both refuse to act on a hash absent from this replica's own
// application/LocalPublicationCatalog.js, NEITHER side of this class ever
// consults a catalog. The REQUESTING side's authorization is the person's
// own explicit click — they already know which publication and which
// content hash they are asking about, because it came from a card they
// were already looking at; there is no second, automatic caller of
// `request()` this class needs to gate on their behalf. The RESPONDING
// side answers strictly by asking `localContentStore.has()` — never by
// resolving a placement, never by consulting IPFS, never by asking another
// peer, never by inspecting an anchor. See docs/Principles.md, "Peer
// Content Transfer Is Transport; Verification And Storage Stay Centralized
// (0.8.37)."
//
// Deliberately does not reinvent a peer transport — the identical
// restraint application/PeerContentExchange.js's own header already
// states: peer/PeerMessageBus.js already solved multiplexed, namespaced,
// authenticated-only delivery over one connection. This class attaches to
// the SAME bus instance a caller already uses for every other protocol,
// under its own 'forkbuild:snapshot-content-transfer' namespace, entirely
// independent of 0.7.4's own 'forkbuild:content'.
export class PublicationSnapshotContentPeerExchange {
    // localContentStore: a content/ContentStore.js instance — this
    // replica's own LOCAL store. Only ever READ here (`has()`/`get()`,
    // when answering a REQUEST); this class never itself calls `put()` —
    // see this file's own header on why storage stays application/
    // StoreSnapshotContentUseCase.js's job alone.
    constructor(localContentStore, peerMessageBus, connectedPeerRegistry, {
        protocol = PublicationSnapshotContentPeerExchange.DEFAULT_PROTOCOL
    } = {}) {
        if (!localContentStore || typeof localContentStore.has !== 'function' || typeof localContentStore.get !== 'function') {
            throw new Error('PublicationSnapshotContentPeerExchange: a local ContentStore is required');
        }
        if (!peerMessageBus || typeof peerMessageBus.send !== 'function' || typeof peerMessageBus.subscribe !== 'function' || typeof peerMessageBus.attach !== 'function') {
            throw new Error('PublicationSnapshotContentPeerExchange: a PeerMessageBus is required');
        }
        if (!connectedPeerRegistry || typeof connectedPeerRegistry.list !== 'function' || typeof connectedPeerRegistry.onChange !== 'function') {
            throw new Error('PublicationSnapshotContentPeerExchange: a ConnectedPeerRegistry is required');
        }
        this._localContentStore = localContentStore;
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

    // Requests `contentHash`'s bytes, for `publicationId`, from exactly
    // one `peer` — a caller-chosen, already-authenticated ConnectedPeer a
    // person explicitly selected, never one this class picks for them.
    // There is no return value and no promise of a reply — a RESPONSE, if
    // one ever arrives, is delivered later, asynchronously, to
    // onContentReceived() below. `peer` not being AUTHENTICATED is left
    // to peer/PeerMessageBus.js#send()'s own check, unchanged.
    request(peer, { publicationId, contentHash } = {}) {
        const message = toSnapshotContentRequestMessage(publicationId, contentHash);
        this._bus.send(peer, this._protocol, message);
    }

    // Fires with `{ publicationId, contentHash, bytes }` for every
    // structurally valid RESPONSE this replica receives — deliberately
    // UNVERIFIED; see this file's own header. A caller (application/
    // MaterializeSnapshotFromPeerUseCase.js) is expected to hand `bytes`
    // straight to application/StoreSnapshotContentUseCase.js, which
    // performs the one verification that matters, before treating them as
    // possessed. This class never fires for a malformed message, and
    // never fires twice for reasons of its own — a peer sending the
    // identical RESPONSE twice fires this callback twice, exactly as
    // received, with de-duplication left entirely to whatever the caller
    // does with the (verified, idempotent) result.
    onContentReceived(callback) {
        const subscription = this._eventBus.subscribe(CONTENT_RECEIVED_EVENT, callback);
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
        // Deliberately does NOT dispose the injected localContentStore,
        // peerMessageBus, or connectedPeerRegistry — all three are shared,
        // app-wide collaborators this class never owns, the same restraint
        // every sibling *PeerExchange.js in this codebase already documents.
    }

    _handleIncoming(payload, meta) {
        if (!isValidPeerSnapshotContentMessage(payload)) {
            return;
        }
        if (payload.kind === PeerSnapshotContentMessageKind.REQUEST) {
            this._handleRequest(payload, meta);
            return;
        }
        this._handleResponse(payload);
    }

    // Answers a REQUEST strictly from THIS replica's own local
    // content/ContentStore.js — never a placement, never IPFS, never
    // another peer, never an anchor, and never a catalog lookup of any
    // kind. `publicationId` is read only to echo it back on the RESPONSE
    // for the requester's own correlation; it plays no role in deciding
    // whether to answer. Silently sends nothing at all — no NOT_FOUND, no
    // rejection message — if this replica does not currently hold bytes
    // for `contentHash`, or if replying would exceed
    // MAX_SNAPSHOT_CONTENT_BYTES; see application/
    // PeerSnapshotContentProtocol.js's own header on why "not found" is
    // never a message this protocol sends. This is the one place this
    // milestone's own design insists on: a peer possessing bytes is a
    // content fact, never an assertion about a placement, an anchor, or
    // where those bytes originally came from — this method knows nothing
    // about any of those and asks nothing of them.
    async _handleRequest({ publicationId, contentHash }, meta) {
        const reference = new ContentReference({ hash: contentHash });
        let present;
        try {
            present = await this._localContentStore.has(reference);
        } catch {
            return;
        }
        if (!present) {
            return;
        }
        let bytes;
        try {
            bytes = await this._localContentStore.get(reference);
        } catch {
            return;
        }
        if (bytes === null || bytes === undefined) {
            return;
        }
        let message;
        try {
            message = toSnapshotContentResponseMessage(publicationId, contentHash, bytes);
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
    // (`isValidPeerSnapshotContentMessage()`, already checked by
    // `_handleIncoming()` before this is ever called) — never hash
    // verification, and never a store. Fires unconditionally for anything
    // that reaches here; an unsolicited or mismatched RESPONSE achieves
    // nothing on its own, because the only caller that ever acts on this
    // event (application/MaterializeSnapshotFromPeerUseCase.js) ignores
    // anything that does not match the one `contentHash` it is currently
    // waiting on, and the only path that can ever write a byte
    // (application/StoreSnapshotContentUseCase.js) always re-verifies
    // regardless of what this class reports.
    _handleResponse({ publicationId, contentHash, content }) {
        this._eventBus.publish(CONTENT_RECEIVED_EVENT, { publicationId, contentHash, bytes: content });
    }
}

// Namespaced separately from application/PeerContentProtocol.js's own
// 'forkbuild:content' — this is a DIFFERENT protocol, with a different
// authorization boundary and a different caller, sharing peer/
// PeerMessageBus.js the same way every other protocol in this codebase
// already does, never each other's messages.
PublicationSnapshotContentPeerExchange.DEFAULT_PROTOCOL = 'forkbuild:snapshot-content-transfer';
