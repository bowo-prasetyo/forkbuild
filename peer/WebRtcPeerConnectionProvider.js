import { PeerConnectionProvider } from './PeerConnectionProvider.js';
import { WebRtcPeerConnection } from './WebRtcPeerConnection.js';
import { PeerConnectionOffer } from './PeerConnectionOffer.js';
import { createId } from '../core/createId.js';

// 0.2.51 — the real, two-different-browser-sessions transport this
// codebase named and deferred all the way back in 0.2.49's own header
// ("no commitment to WebRTC or any other real network transport is made
// here") and again in 0.2.50's ("Real Browser Peer Transport," proposed,
// unscheduled). Satisfies the exact same peer/PeerConnectionProvider.js
// contract peer/LocalPeerConnectionProvider.js already does —
// `connect(remoteAddress)` / `onIncomingConnection()` / `dispose()` — so
// application/ConnectToPeerUseCase.js and application/
// DiscoverPeersUseCase.js needed NO changes to their own logic to drive a
// real transport instead of an in-process one.
//
// `remoteAddress` for THIS provider is the one thing peer/
// PeerConnectionProvider.js already documented it could be: opaque here, a
// serialized peer/PeerConnectionOffer.js elsewhere — literally usable as a
// peer/PeerInvitation.js's own `endpoint` field, so 0.2.50's discovery flow
// plugs straight into this transport with zero changes.
//
// Deliberately avoids inventing a signaling SERVER. WebRTC's own signaling
// requirement (exchanging an SDP offer and answer before any DataChannel
// can open) is answered here with the same "portable payload, deliberate
// out-of-band handoff" shape 0.2.50 already established for discovery,
// never with a rendezvous service this milestone would have to operate:
//
//   Alice: createOffer() -> { offer }  --(copy/paste, QR, an invitation)-->  Bob
//   Bob:   connect(serializedOffer)    --(copy/paste, QR, a reply)-->        Alice
//   Alice: connection.acceptRemoteAnswer(answer)
//
// `onIncomingConnection()` therefore never fires for this provider — there
// is no ambient channel on which an unsolicited connection could arrive.
// Every WebRTC connection this provider ever produces was either actively
// requested via createOffer() or actively completed via connect() against
// a specific, already-received offer; see docs/Principles.md, "A Signaling
// Payload Is Not An Identity Proof," for why that offer itself still proves
// nothing about who sent it — only peer/PeerAuthenticationSession.js,
// layered on top exactly as it already is for every other transport, may
// ever say who is actually on the other end.
export class WebRtcPeerConnectionProvider extends PeerConnectionProvider {
    // 0.3.6 — `iceGatheringTimeoutMs`, passed straight through to every
    // WebRtcPeerConnection this provider creates, same optional-override
    // posture as `iceServers`/`RTCPeerConnectionImpl` already have —
    // undefined here simply means each connection falls back to
    // peer/WebRtcPeerConnection.js's own ICE_GATHERING_TIMEOUT_MS
    // default. See that constant's own header for why it exists.
    constructor({ iceServers = [], RTCPeerConnectionImpl = globalThis.RTCPeerConnection, iceGatheringTimeoutMs } = {}) {
        super();
        this._iceServers = iceServers;
        this._RTCPeerConnectionImpl = RTCPeerConnectionImpl;
        this._iceGatheringTimeoutMs = iceGatheringTimeoutMs;
        this._connections = new Map(); // connectionId -> WebRtcPeerConnection
        this._incomingListeners = new Set();
    }

    // 0.3.7 — lets an already-constructed provider's `iceServers` be
    // replaced in place, for exactly one reason: peer/IceServerConfig.js's
    // own fetchIceServers() runs in the BACKGROUND, after this provider
    // already exists and the app has already started — see that
    // function's own header and ui/main.js's one call site. Every
    // connection created BEFORE this call keeps whatever iceServers it
    // was already built with (an RTCPeerConnection's own ICE
    // configuration is fixed at construction, same as any real WebRTC
    // implementation); only createOffer()/connect() calls AFTER this
    // one see the new list — this._iceServers is read fresh at the top
    // of each, never cached anywhere else.
    setIceServers(iceServers) {
        this._iceServers = Array.isArray(iceServers) ? iceServers : [];
    }

    // Alice's side: mints a fresh connectionId, opens an RTCPeerConnection,
    // and returns the WebRtcPeerConnection immediately — its
    // `localSignal` (a peer/PeerConnectionOffer.js) is null until ICE
    // gathering completes; use `onLocalSignalReady()` to wait for it. Not
    // part of the base peer/PeerConnectionProvider.js contract — WebRTC's
    // asymmetric offer/answer handshake has no "just dial an address"
    // active half the way peer/LocalPeerConnectionProvider.js's shared
    // in-process registry does, so this method exists to be that half
    // instead.
    createOffer({ ttlMs } = {}) {
        const connection = new WebRtcPeerConnection({
            connectionId: createId(),
            role: 'offerer',
            iceServers: this._iceServers,
            RTCPeerConnectionImpl: this._RTCPeerConnectionImpl,
            iceGatheringTimeoutMs: this._iceGatheringTimeoutMs,
            ...(ttlMs ? { ttlMs } : {})
        });
        this._connections.set(connection.connectionId, connection);
        return connection;
    }

    // Bob's side, and the ACTIVE half of the base peer/
    // PeerConnectionProvider.js contract: `remoteAddress` is a serialized
    // peer/PeerConnectionOffer.js — a JSON string (the same shape a
    // peer/PeerInvitation.js's own `endpoint` already carries as an opaque
    // string), an already-parsed plain object, or a PeerConnectionOffer
    // instance. Returns immediately, in CONNECTING transportState — this
    // connection's own `localSignal` becomes the peer/PeerConnectionAnswer.js
    // to relay back to whoever sent the offer.
    connect(remoteAddress) {
        const offer = parseOffer(remoteAddress);
        if (offer.isExpired()) {
            throw new Error('WebRtcPeerConnectionProvider: offer has expired');
        }
        const connection = new WebRtcPeerConnection({
            connectionId: offer.connectionId,
            role: 'answerer',
            iceServers: this._iceServers,
            remoteOffer: offer,
            RTCPeerConnectionImpl: this._RTCPeerConnectionImpl,
            iceGatheringTimeoutMs: this._iceGatheringTimeoutMs
        });
        this._connections.set(connection.connectionId, connection);
        return connection;
    }

    // Returns an unsubscribe function. Never fires — see this file's own
    // header for why there is no ambient incoming-connection channel for
    // this provider. Implemented (rather than left throwing) so callers
    // that generically call `.listen()` against ANY peer/
    // PeerConnectionProvider.js — application/ConnectToPeerUseCase.js's own
    // `listen()` among them — keep working unchanged; it simply never has
    // anything to report for this transport.
    onIncomingConnection(callback) {
        this._incomingListeners.add(callback);
        return () => this._incomingListeners.delete(callback);
    }

    dispose() {
        for (const connection of this._connections.values()) {
            connection.close();
        }
        this._connections.clear();
        this._incomingListeners.clear();
    }
}

function parseOffer(remoteAddress) {
    if (remoteAddress instanceof PeerConnectionOffer) {
        return remoteAddress;
    }
    if (typeof remoteAddress === 'string') {
        let parsed;
        try {
            parsed = JSON.parse(remoteAddress);
        } catch {
            throw new Error('WebRtcPeerConnectionProvider: remoteAddress is not a valid serialized PeerConnectionOffer');
        }
        return PeerConnectionOffer.fromJSON(parsed);
    }
    if (remoteAddress && typeof remoteAddress === 'object') {
        return PeerConnectionOffer.fromJSON(remoteAddress);
    }
    throw new Error('WebRtcPeerConnectionProvider: remoteAddress must be a serialized PeerConnectionOffer');
}
