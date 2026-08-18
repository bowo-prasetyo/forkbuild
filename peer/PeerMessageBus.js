import { PeerLifecycleState } from './PeerLifecycleState.js';
import {
    createPeerMessage,
    isValidPeerMessageEnvelope,
    exceedsMaxPeerMessageSize
} from './PeerMessage.js';

const DUPLICATE_WINDOW_SIZE = 256;

// 0.2.52 — "once Alice and Bob have an authenticated peer connection, how
// do different decentralized application protocols safely share that
// connection?" This is the multiplexing substrate the design doc asked
// for, sitting directly on top of application/ConnectedPeer.js and
// nothing else: a protocol (Presence, Avatar Profile, Avatar Interaction,
// a future World Event or chat) subscribes here ONCE, by a namespaced
// `protocol` string, and receives messages from every attached peer that
// sends under that name — without ever importing peer/PeerConnection.js,
// peer/WebRtcPeerConnection.js, or peer/LocalPeerConnectionProvider.js,
// and without knowing or caring which one is underneath. See docs/
// Principles.md, "A Peer Connection Transports Messages; It Does Not
// Interpret Them" (0.2.52) — this class is the one place that rule is
// enforced structurally: it never contains `if (protocol ===
// 'avatar-presence')`, only a Map from protocol name to whatever
// handlers subscribed to it.
//
// The central security property (the design doc's own #4): a peer that
// has a live PeerConnection but has NOT reached
// PeerLifecycleState.AUTHENTICATED gets no message channel at all.
// `send()` refuses to send on a caller's behalf unless
// `connectedPeer.getLifecycleState() === AUTHENTICATED` right now, the
// same "refuse rather than silently queue" discipline peer/
// PeerConnection.js#send() already applies to a non-CONNECTED transport.
// Every INCOMING message is re-checked against that same, freshly
// recomputed lifecycle at delivery time, never merely at attach() time —
// a connection that is CONNECTED but still AUTHENTICATING (or one whose
// authentication has since FAILED) can hand this class a perfectly
// well-formed envelope and it is dropped, silently, indistinguishably
// from an unknown protocol. Authentication itself is peer/
// PeerAuthenticationSession.js's job, completely unmodified by this
// milestone; this class only ever reads its result via
// application/ConnectedPeer.js#getLifecycleState().
//
// Deliberately generic, transport-level hygiene only, per the design
// doc's own #6: a malformed envelope, an oversized one, or a duplicate
// `messageId` (suppressed within a small bounded per-connection window,
// never an unbounded ledger — see replication/ReplayGuard.js for the
// UNBOUNDED version of this idea this class deliberately does not reuse)
// are all rejected here. What a stale or replayed APPLICATION message
// means is never this class's question — see docs/Principles.md,
// "Replay Semantics Belong To The Protocol, Never The Bus" (0.2.52).
export class PeerMessageBus {
    constructor() {
        this._handlersByProtocol = new Map(); // protocol -> Set(handler)
        this._attachments = new Map(); // connectionId -> attachment record
    }

    // Wires this bus to receive whatever `connectedPeer`'s underlying
    // connection delivers, for as long as the peer lives. Returns a
    // detach function; also detaches itself automatically the moment the
    // peer's own lifecycle reaches CLOSED or FAILED — the same
    // structural "no separate cleanup call required" discipline
    // application/ConnectedPeerRegistry.js already applies one layer
    // down to application/ConnectedPeer.js itself. Attaching the same
    // connectionId twice is a no-op that returns a working detach
    // function for it.
    attach(connectedPeer) {
        if (!connectedPeer || typeof connectedPeer.connectionId !== 'string' || !connectedPeer.connection) {
            throw new Error('PeerMessageBus: attach() requires a ConnectedPeer');
        }
        const connectionId = connectedPeer.connectionId;
        if (this._attachments.has(connectionId)) {
            return () => this._detach(connectionId);
        }

        const attachment = {
            connectedPeer,
            seenMessageIds: new Set(),
            seenOrder: []
        };
        attachment.unsubscribeMessage = connectedPeer.connection.onMessage((message) => {
            this._handleIncoming(attachment, message);
        });
        attachment.unsubscribeState = connectedPeer.onStateChange((state) => {
            if (state === PeerLifecycleState.CLOSED || state === PeerLifecycleState.FAILED) {
                this._detach(connectionId);
            }
        });
        this._attachments.set(connectionId, attachment);
        return () => this._detach(connectionId);
    }

    // Sends `payload` under `protocol` to ONE specific peer. Throws if
    // that peer is not, right now, AUTHENTICATED. Does not require
    // attach() to have been called first — sending and receiving are
    // independent here, exactly like a PeerConnection's own
    // send()/onMessage() already are. Returns the envelope's own
    // messageId.
    send(connectedPeer, protocol, payload, { version } = {}) {
        if (!connectedPeer || typeof connectedPeer.getLifecycleState !== 'function' || !connectedPeer.connection) {
            throw new Error('PeerMessageBus: send() requires a ConnectedPeer');
        }
        if (connectedPeer.getLifecycleState() !== PeerLifecycleState.AUTHENTICATED) {
            throw new Error('PeerMessageBus: cannot send, peer is not AUTHENTICATED');
        }
        const envelope = createPeerMessage(protocol, payload, version !== undefined ? { version } : {});
        if (exceedsMaxPeerMessageSize(envelope)) {
            throw new Error('PeerMessageBus: message exceeds MAX_PEER_MESSAGE_BYTES');
        }
        connectedPeer.connection.send(envelope);
        return envelope.messageId;
    }

    // Registers `handler(payload, meta)` for every future message
    // received, from ANY attached peer, under `protocol`. Returns an
    // unsubscribe function. `meta` is `{ protocol, version, messageId,
    // connectedPeer }` — enough for a protocol to know who sent
    // something (via `connectedPeer.remoteIdentity`) without this class
    // ever handing out anything peer/PeerAuthenticationSession.js didn't
    // already prove.
    subscribe(protocol, handler) {
        if (!protocol || typeof protocol !== 'string') {
            throw new Error('PeerMessageBus: subscribe() requires a protocol name');
        }
        if (typeof handler !== 'function') {
            throw new Error('PeerMessageBus: subscribe() requires a handler function');
        }
        if (!this._handlersByProtocol.has(protocol)) {
            this._handlersByProtocol.set(protocol, new Set());
        }
        const handlers = this._handlersByProtocol.get(protocol);
        handlers.add(handler);
        return () => {
            handlers.delete(handler);
            if (handlers.size === 0) {
                this._handlersByProtocol.delete(protocol);
            }
        };
    }

    dispose() {
        for (const connectionId of Array.from(this._attachments.keys())) {
            this._detach(connectionId);
        }
        this._handlersByProtocol.clear();
    }

    _handleIncoming(attachment, message) {
        const { connectedPeer } = attachment;
        // Re-checked on EVERY message, never cached from attach() time —
        // see this class's own header. A message that arrives before
        // AUTHENTICATED (or after authentication has since FAILED) is
        // dropped here, exactly like a malformed envelope below — there
        // is no separate, distinguishable rejection an attacker could
        // use to learn which reason applied.
        if (connectedPeer.getLifecycleState() !== PeerLifecycleState.AUTHENTICATED) {
            return;
        }
        if (!isValidPeerMessageEnvelope(message)) {
            // Also silently covers peer/PeerAuthenticationSession.js's
            // own HELLO/PROOF messages riding this same connection's
            // message stream — see peer/PeerMessage.js's own header for
            // why those can never validate as a PeerMessage envelope.
            return;
        }
        if (exceedsMaxPeerMessageSize(message)) {
            return;
        }
        if (attachment.seenMessageIds.has(message.messageId)) {
            return;
        }
        this._recordSeen(attachment, message.messageId);

        const handlers = this._handlersByProtocol.get(message.protocol);
        if (!handlers || handlers.size === 0) {
            return;
        }
        const meta = {
            protocol: message.protocol,
            version: message.version,
            messageId: message.messageId,
            connectedPeer
        };
        for (const handler of Array.from(handlers)) {
            handler(message.payload, meta);
        }
    }

    _recordSeen(attachment, messageId) {
        attachment.seenMessageIds.add(messageId);
        attachment.seenOrder.push(messageId);
        if (attachment.seenOrder.length > DUPLICATE_WINDOW_SIZE) {
            const oldest = attachment.seenOrder.shift();
            attachment.seenMessageIds.delete(oldest);
        }
    }

    _detach(connectionId) {
        const attachment = this._attachments.get(connectionId);
        if (!attachment) {
            return;
        }
        this._attachments.delete(connectionId);
        attachment.unsubscribeMessage();
        attachment.unsubscribeState();
    }
}
