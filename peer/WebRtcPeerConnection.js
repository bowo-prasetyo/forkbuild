import { PeerConnection } from './PeerConnection.js';
import { PeerConnectionState } from './PeerConnectionState.js';
import { PeerConnectionOffer } from './PeerConnectionOffer.js';
import { PeerConnectionAnswer } from './PeerConnectionAnswer.js';

const DATA_CHANNEL_LABEL = 'forkbuild-peer';

// A transport-level control marker, never handed to onMessage()
// listeners — see close()'s own comment for why this exists at all.
const CLOSE_SENTINEL = '__forkbuild_webrtc_close__';

// 0.3.6 — bounds _waitForIceGatheringComplete() below, which previously
// had NO internal timeout at all: it waited on the browser's own
// `iceGatheringState` reaching 'complete', however long that took,
// however many configured `iceServers` entries it took to get there.
// Discovered the hard way — see peer/IceServerConfig.js's own 0.3.4/
// 0.3.5 history: a SINGLE ICE server that never resolves (neither a
// candidate nor an error — a silently dropped connection attempt,
// "blackholed" rather than refused) blocks EVERY offer and answer this
// class ever produces, for as long as application/PeerSessionManager.js's
// own outer SIGNAL_TIMEOUT_MS allows (30s) — one bad entry in
// DEFAULT_ICE_SERVERS was enough to break "Invite Someone" and "Be
// Discoverable" entirely, for every connection, regardless of how many
// OTHER configured servers answered instantly. On a healthy network,
// real gathering across several STUN/TURN servers ordinarily finishes
// in low single-digit seconds; this is deliberately generous room
// above that, not a tight budget.
//
// Whatever candidates HAVE been gathered by this deadline are used
// exactly as-is — this is not a new failure mode, just an earlier
// snapshot of the same `_gatheredCandidates` array
// `iceGatheringState: 'complete'` would eventually have captured
// anyway. A real WebRTC connection routinely succeeds on a SUBSET of
// candidates (that is the entire premise of trickle ICE, which this
// class's SDP already advertises support for — see `_beginOffer`'s own
// `a=ice-options:trickle` line — even though this class itself sends
// one complete signal rather than trickling candidates over time). If
// literally zero candidates were gathered by the deadline, nothing
// about how that failure surfaces changes: the resulting connection
// attempt still fails at the normal ICE connectivity-check stage,
// exactly like it always would have — see
// _handleIceConnectionStateChange()'s own 'failed' handling.
const ICE_GATHERING_TIMEOUT_MS = 8000;

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
//
// 0.2.73 — Authenticated Voice / Audio adds a SECOND, equally deliberate
// widening: `addAudioTrack`/`removeAudioTrack`/`renegotiate`/
// `applyRemoteOffer`/`applyRemoteAnswer`/`onRemoteTrack`. Per the design
// doc's own central rule — "one logical PeerConnection, never a second
// one for voice" — these methods add an audio `RTCRtpTransceiver` to
// THIS SAME `RTCPeerConnection`, the one already carrying the DataChannel
// peer/PeerMessageBus.js multiplexes every other protocol over, and
// renegotiate it in place. This class still knows nothing about WHO is
// on the other end (that stays peer/PeerAuthenticationSession.js's job)
// and nothing about WHY a track was added (that is
// application/VoiceUseCase.js's job, one layer up, which is also the
// only place that decides WHEN to call these methods, gated by
// authentication and social eligibility exactly like every other
// protocol layered on peer/PeerMessageBus.js). This class only performs
// the mechanical SDP renegotiation math — createOffer/setLocalDescription
// on request, setRemoteDescription/createAnswer/setLocalDescription on
// request — never decides to call itself, never sends anything over any
// transport (the renegotiation SDP text is handed back to the caller,
// which is application/VoiceUseCase.js relaying it over
// peer/PeerMessageBus.js's own `forkbuild:voice-media` protocol — see
// that file's own header on why renegotiation deliberately travels
// IN-BAND over the connection it is renegotiating, rather than through
// any out-of-band signaling channel). Unlike the INITIAL offer/answer
// above, renegotiation needs no fresh ICE candidate exchange at all in
// the common case — the existing ICE transport (bundled, per this
// class's own default RTCPeerConnection configuration) is simply reused
// for the new `m=audio` section, so `renegotiate()`/`applyRemoteOffer()`
// below resolve as soon as `setLocalDescription()` itself resolves,
// never waiting on `_waitForIceGatheringComplete()` the way the INITIAL
// handshake must.
export class WebRtcPeerConnection extends PeerConnection {
    constructor({ connectionId, role, iceServers = [], remoteOffer = null, ttlMs, now = new Date(), RTCPeerConnectionImpl = globalThis.RTCPeerConnection, iceGatheringTimeoutMs = ICE_GATHERING_TIMEOUT_MS } = {}) {
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
        this._iceGatheringTimeoutMs = iceGatheringTimeoutMs;
        this._transportState = PeerConnectionState.CONNECTING;
        this._localSignal = null;
        this._answerAccepted = false;
        this._gatheredCandidates = [];
        this._dataChannel = null;

        this._messageListeners = new Set();
        this._stateListeners = new Set();
        this._localSignalListeners = new Set();
        // 0.2.73 — see this class's own header on the audio widening.
        this._trackListeners = new Set();
        this._audioSender = null;

        this._peerConnection = new RTCPeerConnectionImpl({ iceServers });
        this._peerConnection.addEventListener('icecandidate', (event) => {
            if (event.candidate) {
                this._gatheredCandidates.push(event.candidate.toJSON ? event.candidate.toJSON() : event.candidate);
            }
        });
        this._peerConnection.addEventListener('iceconnectionstatechange', () => this._handleIceConnectionStateChange());
        // 0.2.73 — fires once per remote track a peer's own
        // addAudioTrack()/renegotiate() causes to arrive here. Never
        // fired for anything this side itself sent — only for a track
        // this class received, exactly like onMessage() only ever
        // delivers what arrived, never an echo of what was sent.
        this._peerConnection.addEventListener('track', (event) => {
            for (const listener of this._trackListeners) {
                listener(event.track, event.streams[0] || null);
            }
        });

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

    // 0.2.73 — attaches ONE local audio MediaStreamTrack to this SAME
    // RTCPeerConnection. Throws if a track is already attached — this
    // class holds at most one outgoing audio sender at a time, matching
    // application/VoiceUseCase.js's own "one call at a time, per peer"
    // scope; a caller that wants to swap tracks (e.g. muting by
    // replacing with a silent track) uses the returned RTCRtpSender's own
    // `replaceTrack()`, not a second addAudioTrack(). Does NOT
    // renegotiate by itself — see renegotiate() below; a caller adds
    // every track it intends to add first, then renegotiates once.
    addAudioTrack(track) {
        if (this._audioSender) {
            throw new Error('WebRtcPeerConnection: an audio track is already attached');
        }
        this._audioSender = this._peerConnection.addTrack(track);
        return this._audioSender;
    }

    // 0.2.75 — Voice UX & Device Controls. Swaps WHICH local track the
    // already-attached `_audioSender` transmits, via
    // `RTCRtpSender#replaceTrack()` — deliberately NOT a second
    // `addAudioTrack()`/`removeAudioTrack()`/`renegotiate()` sequence.
    // `addAudioTrack()`'s own header already named this precedent when
    // it first shipped in 0.2.73: "a caller that wants to swap tracks...
    // uses the returned RTCRtpSender's own `replaceTrack()`." A device
    // switch is exactly that caller. `replaceTrack()` changes only which
    // MediaStreamTrack feeds an EXISTING `m=audio` section — never its
    // presence, direction, or codec negotiation — so no SDP offer/answer
    // round trip is needed at all, and application/VoiceUseCase.js never
    // has to ask "am I the offerer" the way it must for
    // renegotiate()/applyRemoteOffer(). Throws if no audio track is
    // attached yet — this is a SWAP, not a first attach; a caller with no
    // call in progress has nothing to swap.
    replaceAudioTrack(track) {
        if (!this._audioSender) {
            throw new Error('WebRtcPeerConnection: no audio track is attached to replace');
        }
        return this._audioSender.replaceTrack(track);
    }

    // The mirror of addAudioTrack() — detaches and stops whatever local
    // audio track was attached. A no-op if none was ever attached
    // (harmless to call from application/VoiceUseCase.js's own teardown
    // path regardless of how far a call actually got).
    removeAudioTrack() {
        if (!this._audioSender) {
            return;
        }
        try {
            this._peerConnection.removeTrack(this._audioSender);
        } catch {
            // Already removed by the underlying RTCPeerConnection (e.g.
            // the connection itself is already closed) — nothing left to
            // do.
        }
        if (this._audioSender.track) {
            this._audioSender.track.stop();
        }
        this._audioSender = null;
    }

    // Returns an unsubscribe function. `callback(track, stream)` fires
    // for every remote track this connection receives — in 0.2.73,
    // always exactly one audio track per call, since
    // application/VoiceUseCase.js never attaches more than one local
    // track at a time on either side.
    onRemoteTrack(callback) {
        this._trackListeners.add(callback);
        return () => this._trackListeners.delete(callback);
    }

    // Creates and applies a fresh local offer reflecting whatever local
    // tracks are currently attached (or removed) — the renegotiation
    // counterpart of _beginOffer() above, callable at any time after the
    // connection first reached CONNECTED, not only once at construction.
    // See this class's own header on why no ICE gathering wait is needed
    // here. Resolves with the raw SDP offer text for the caller
    // (application/VoiceUseCase.js) to relay over
    // peer/PeerMessageBus.js — this class never sends it anywhere itself.
    async renegotiate() {
        if (this._transportState !== PeerConnectionState.CONNECTED) {
            throw new Error('WebRtcPeerConnection: cannot renegotiate, connection is ' + this._transportState);
        }
        const offerDescription = await this._peerConnection.createOffer();
        await this._peerConnection.setLocalDescription(offerDescription);
        return this._peerConnection.localDescription.sdp;
    }

    // The receiving side of a renegotiation: applies a remote offer
    // (raw SDP text, from a core/VoiceMediaSignal.js the caller already
    // validated) and produces a local answer. Resolves with the raw SDP
    // answer text for the caller to relay back.
    async applyRemoteOffer(sdp) {
        if (this._transportState !== PeerConnectionState.CONNECTED) {
            throw new Error('WebRtcPeerConnection: cannot apply a remote offer, connection is ' + this._transportState);
        }
        await this._peerConnection.setRemoteDescription({ type: 'offer', sdp });
        const answerDescription = await this._peerConnection.createAnswer();
        await this._peerConnection.setLocalDescription(answerDescription);
        return this._peerConnection.localDescription.sdp;
    }

    // Completes a renegotiation this side initiated with renegotiate() —
    // applies the remote answer (raw SDP text) this side's own offer
    // produced.
    async applyRemoteAnswer(sdp) {
        if (this._transportState !== PeerConnectionState.CONNECTED) {
            throw new Error('WebRtcPeerConnection: cannot apply a remote answer, connection is ' + this._transportState);
        }
        await this._peerConnection.setRemoteDescription({ type: 'answer', sdp });
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
        // 0.2.73 — a still-attached local audio track is stopped here
        // too, so closing the connection also releases the microphone
        // promptly rather than leaving it held until garbage collection
        // — see docs/Principles.md, "Voice Is Ephemeral; Closing The
        // Connection Is Always A Safe Way To End It."
        if (this._audioSender && this._audioSender.track) {
            this._audioSender.track.stop();
        }
        this._audioSender = null;
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

    // 0.3.6 — bounded by `_iceGatheringTimeoutMs` (see
    // ICE_GATHERING_TIMEOUT_MS's own header for why this exists at
    // all): resolves the MOMENT EITHER happens first — real
    // `iceGatheringState: 'complete'`, or the timeout — never both,
    // never neither. Whichever settles first tears down the other's
    // listener/timer so this never fires twice or leaks.
    _waitForIceGatheringComplete() {
        if (this._peerConnection.iceGatheringState === 'complete') {
            return Promise.resolve();
        }
        return new Promise((resolve) => {
            let settled = false;
            const settle = () => {
                if (settled) return;
                settled = true;
                clearTimeout(timeout);
                this._peerConnection.removeEventListener('icegatheringstatechange', check);
                resolve();
            };
            const check = () => {
                if (this._peerConnection.iceGatheringState === 'complete') {
                    settle();
                }
            };
            const timeout = setTimeout(settle, this._iceGatheringTimeoutMs);
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
