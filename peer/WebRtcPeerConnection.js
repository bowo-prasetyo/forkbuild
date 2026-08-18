import { PeerConnection } from './PeerConnection.js';
import { PeerConnectionState } from './PeerConnectionState.js';
import { PeerConnectionOffer } from './PeerConnectionOffer.js';
import { PeerConnectionAnswer } from './PeerConnectionAnswer.js';

const DATA_CHANNEL_LABEL = 'forkbuild-peer';

// A transport-level control marker, never handed to onMessage()
// listeners — see close()'s own comment for why this exists at all.
const CLOSE_SENTINEL = '__forkbuild_webrtc_close__';

// 0.2.51 — a real, two-different-browser-sessions peer/PeerConnection.js:
// one RTCPeerConnection plus one RTCDataChannel, wired to the exact same
// send()/onMessage()/onStateChange()/close() contract
// peer/LocalPeerConnectionProvider.js's in-process implementation already
// satisfies. Nothing above peer/PeerConnection.js's own interface ever
// needs to know which one it's holding — see that file's own header.
//
// Deliberately knows NOTHING about identity. It moves bytes; it never
// inspects them. `remoteAddress` is null here on purpose — a direct WebRTC
// connection has no registry-issued address the way
// LocalPeerConnectionProvider's shared network does, and this class must
// never be tempted to treat `role`/`localSignal` as anything more than "how
// bytes started moving," exactly the discipline peer/PeerConnection.js's
// own header already demands: "does a channel exist" is this class's ONLY
// question, never "who is on it" (peer/PeerAuthenticationSession.js's job,
// layered on top, completely unaware this is WebRTC underneath).
//
// Two roles, one class, because both sides of a WebRTC handshake run
// genuinely different code (createOffer/setLocalDescription vs.
// setRemoteDescription/createAnswer) — unlike peer/
// PeerAuthenticationSession.js's own handshake, which is symmetric by
// design. `role` and the signaling extension methods below
// (`localSignal`/`onLocalSignalReady`/`acceptRemoteAnswer`) are the ONE
// deliberate, documented widening beyond the base peer/PeerConnection.js
// interface — the same "extra capability beyond the base contract"
// precedent peer/LocalPeerConnectionProvider.js already set with its own
// `.address`/`.network`. They carry SDP and ICE candidates only, never
// identity, never authentication state.
export class WebRtcPeerConnection extends PeerConnection {
    constructor({ connectionId, role, iceServers = [], remoteOffer = null, ttlMs, now = new Date(), RTCPeerConnectionImpl = globalThis.RTCPeerConnection } = {}) {
        super();
        if (!connectionId || typeof connectionId !== 'string') {
            throw new Error('WebRtcPeerConnection: connectionId is required');
        }
        if (role !== 'offerer' && role !== 'answerer') {
            throw new Error('WebRtcPeerConnection: role must be "offerer" or "answerer"');
        }
        if (typeof RTCPeerConnectionImpl !== 'function') {
            throw new Error('WebRtcPeerConnection: no RTCPeerConnection implementation available in this environment');
        }
        if (role === 'answerer' && !(remoteOffer instanceof PeerConnectionOffer)) {
            throw new Error('WebRtcPeerConnection: role "answerer" requires a remoteOffer');
        }

        this._connectionId = connectionId;
        this._role = role;
        this._ttlMs = ttlMs;
        this._transportState = PeerConnectionState.CONNECTING;
        this._localSignal = null;
        this._answerAccepted = false;
        this._gatheredCandidates = [];
        this._dataChannel = null;

        this._messageListeners = new Set();
        this._stateListeners = new Set();
        this._localSignalListeners = new Set();

        this._peerConnection = new RTCPeerConnectionImpl({ iceServers });
        this._peerConnection.addEventListener('icecandidate', (event) => {
            if (event.candidate) {
                this._gatheredCandidates.push(event.candidate.toJSON ? event.candidate.toJSON() : event.candidate);
            }
        });
        this._peerConnection.addEventListener('iceconnectionstatechange', () => this._handleIceConnectionStateChange());

        if (role === 'offerer') {
            this._dataChannel = this._peerConnection.createDataChannel(DATA_CHANNEL_LABEL);
            this._wireDataChannel(this._dataChannel);
            this._beginOffer(now);
        } else {
            this._peerConnection.addEventListener('datachannel', (event) => {
                this._dataChannel = event.channel;
                this._wireDataChannel(this._dataChannel);
            });
            this._beginAnswer(remoteOffer, now);
        }
    }

    get connectionId() { return this._connectionId; }
    get remoteAddress() { return null; }
    get transportState() { return this._transportState; }
    get role() { return this._role; }

    // Null until this side's SDP + ICE gathering is ready to hand off —
    // a peer/PeerConnectionOffer.js for the offerer, a
    // peer/PeerConnectionAnswer.js for the answerer. The caller is
    // responsible for relaying it out-of-band (an invitation's endpoint,
    // a copy/paste reply, a QR code — this class has no opinion).
    get localSignal() { return this._localSignal; }

    onLocalSignalReady(callback) {
        if (this._localSignal) {
            callback(this._localSignal);
            return () => {};
        }
        this._localSignalListeners.add(callback);
        return () => this._localSignalListeners.delete(callback);
    }

    // Offerer-only: completes the handshake once the answerer's
    // peer/PeerConnectionAnswer.js has traveled back out-of-band. Throws
    // for the answerer role, a mismatched or expired answer, or a second
    // call — this is a one-shot completion, not a renegotiation API.
    async acceptRemoteAnswer(answer) {
        if (this._role !== 'offerer') {
            throw new Error('WebRtcPeerConnection: only the offerer role accepts a remote answer');
        }
        if (this._answerAccepted) {
            throw new Error('WebRtcPeerConnection: a remote answer was already accepted on this connection');
        }
        const parsed = answer instanceof PeerConnectionAnswer ? answer : PeerConnectionAnswer.fromJSON(answer);
        if (parsed.connectionId !== this._connectionId) {
            throw new Error('WebRtcPeerConnection: answer connectionId does not match this connection');
        }
        if (parsed.isExpired()) {
            throw new Error('WebRtcPeerConnection: answer has expired');
        }
        this._answerAccepted = true;
        try {
            await this._peerConnection.setRemoteDescription({ type: 'answer', sdp: parsed.sdp });
            await this._addRemoteCandidates(parsed.iceCandidates);
        } catch (e) {
            this._fail();
            throw e;
        }
    }

    send(message) {
        if (this._transportState !== PeerConnectionState.CONNECTED) {
            throw new Error('WebRtcPeerConnection: cannot send, connection is ' + this._transportState);
        }
        this._dataChannel.send(JSON.stringify(message));
    }

    onMessage(callback) {
        this._messageListeners.add(callback);
        return () => this._messageListeners.delete(callback);
    }

    onStateChange(callback) {
        this._stateListeners.add(callback);
        return () => this._stateListeners.delete(callback);
    }

    // Real WebRTC has no equivalent of peer/LocalPeerConnectionProvider.js's
    // instantly-mirrored close — an abrupt RTCPeerConnection#close() gives
    // the remote side nothing to react to promptly, leaving it to notice
    // only via ICE's own consent-freshness/failure timers, which can take
    // tens of seconds. Sending one small, transport-level CLOSE_SENTINEL
    // over the DataChannel FIRST — filtered out of onMessage() below,
    // never handed to peer/PeerAuthenticationSession.js or anything else
    // above this layer — is what makes closing propagate in about one real
    // network round-trip instead. This is still fully a transport-layer
    // fact: it carries no identity, and a connection that never received
    // it (e.g. the remote already vanished) still eventually reaches
    // CLOSED/FAILED via ICE's own detection regardless.
    close() {
        if (this._transportState === PeerConnectionState.CLOSED) {
            return;
        }
        if (this._dataChannel && this._dataChannel.readyState === 'open') {
            try { this._dataChannel.send(JSON.stringify({ [CLOSE_SENTINEL]: true })); } catch { /* remote already gone */ }
        }
        if (this._dataChannel) {
            try { this._dataChannel.close(); } catch { /* already closing */ }
        }
        // Tearing down the whole RTCPeerConnection in the SAME tick would
        // risk abandoning the sentinel/the DataChannel's own graceful
        // SCTP stream-reset mid-flight, before either reaches the wire. A
        // short delay lets them actually leave first. This side's own
        // transportState still transitions to CLOSED immediately below,
        // synchronously, matching every other PeerConnection's close().
        setTimeout(() => {
            try { this._peerConnection.close(); } catch { /* already closed */ }
        }, 50);
        this._setState(PeerConnectionState.CLOSED);
    }

    async _beginOffer(now) {
        try {
            const offerDescription = await this._peerConnection.createOffer();
            await this._peerConnection.setLocalDescription(offerDescription);
            await this._waitForIceGatheringComplete();
            this._localSignal = PeerConnectionOffer.create({
                connectionId: this._connectionId,
                sdp: this._peerConnection.localDescription.sdp,
                iceCandidates: this._gatheredCandidates,
                ...(this._ttlMs ? { ttlMs: this._ttlMs } : {}),
                now
            });
            this._notifyLocalSignal();
        } catch {
            this._fail();
        }
    }

    async _beginAnswer(remoteOffer, now) {
        try {
            await this._peerConnection.setRemoteDescription({ type: 'offer', sdp: remoteOffer.sdp });
            await this._addRemoteCandidates(remoteOffer.iceCandidates);
            const answerDescription = await this._peerConnection.createAnswer();
            await this._peerConnection.setLocalDescription(answerDescription);
            await this._waitForIceGatheringComplete();
            this._localSignal = PeerConnectionAnswer.create({
                connectionId: this._connectionId,
                sdp: this._peerConnection.localDescription.sdp,
                iceCandidates: this._gatheredCandidates,
                ...(this._ttlMs ? { ttlMs: this._ttlMs } : {}),
                now
            });
            this._notifyLocalSignal();
        } catch {
            this._fail();
        }
    }

    async _addRemoteCandidates(candidates) {
        for (const candidate of candidates) {
            try {
                await this._peerConnection.addIceCandidate(candidate);
            } catch {
                // A candidate that fails to add (e.g. a transport the
                // remote gathered but this side can't use) is not fatal —
                // ICE only needs ONE working pair, exactly the same
                // best-effort spirit as a real browser's own trickle-ICE
                // handling.
            }
        }
    }

    _wireDataChannel(channel) {
        channel.addEventListener('open', () => this._setState(PeerConnectionState.CONNECTED));
        channel.addEventListener('close', () => {
            if (this._transportState !== PeerConnectionState.CLOSED) {
                this._setState(PeerConnectionState.CLOSED);
            }
        });
        channel.addEventListener('error', () => this._fail());
        channel.addEventListener('message', (event) => {
            let message;
            try {
                message = JSON.parse(event.data);
            } catch {
                return;
            }
            if (message && typeof message === 'object' && message[CLOSE_SENTINEL]) {
                this.close();
                return;
            }
            for (const listener of this._messageListeners) {
                listener(message);
            }
        });
    }

    _handleIceConnectionStateChange() {
        const iceState = this._peerConnection.iceConnectionState;
        if (iceState === 'failed') {
            this._fail();
        } else if (iceState === 'closed' && this._transportState !== PeerConnectionState.CLOSED) {
            this._setState(PeerConnectionState.CLOSED);
        }
        // 'disconnected'/'checking'/'new'/'connected'/'completed' are left
        // alone deliberately — CONNECTED, for this class, means "the data
        // channel is open and can carry messages," not merely "ICE found a
        // candidate pair." A transient 'disconnected' during real network
        // hiccups is not treated as terminal here.
    }

    _waitForIceGatheringComplete() {
        if (this._peerConnection.iceGatheringState === 'complete') {
            return Promise.resolve();
        }
        return new Promise((resolve) => {
            const check = () => {
                if (this._peerConnection.iceGatheringState === 'complete') {
                    this._peerConnection.removeEventListener('icegatheringstatechange', check);
                    resolve();
                }
            };
            this._peerConnection.addEventListener('icegatheringstatechange', check);
        });
    }

    _notifyLocalSignal() {
        for (const listener of this._localSignalListeners) {
            listener(this._localSignal);
        }
        this._localSignalListeners.clear();
    }

    _fail() {
        if (this._transportState !== PeerConnectionState.CLOSED) {
            this._setState(PeerConnectionState.FAILED);
        }
    }

    _setState(state) {
        this._transportState = state;
        for (const listener of this._stateListeners) {
            listener(state);
        }
    }
}
