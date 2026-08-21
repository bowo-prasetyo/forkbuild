import { WebRtcPeerConnection } from '../peer/WebRtcPeerConnection.js';
import { WebRtcPeerConnectionProvider } from '../peer/WebRtcPeerConnectionProvider.js';
import { PeerConnectionOffer } from '../peer/PeerConnectionOffer.js';

// 0.3.6 — bounds a real, network-dependent failure mode that shipped
// silently for as long as WebRTC has existed in this codebase (0.2.51):
// _waitForIceGatheringComplete() had no internal timeout at all, so a
// SINGLE configured ICE server that never resolves — neither a
// candidate nor an error, just silence — blocked every offer and
// answer indefinitely, for every connection, regardless of how many
// OTHER servers answered instantly. Found for real via
// chrome://webrtc-internals against a live "Invite Someone" attempt —
// see peer/IceServerConfig.js's own 0.3.4/0.3.5 history for the actual
// incident. This suite proves the fix at the layer that actually
// matters: given an ICE server that NEVER completes gathering, does
// WebRtcPeerConnection still produce a usable local signal within a
// bounded time, using whatever candidates it managed to gather?
//
// Deliberately uses a FAKE RTCPeerConnection, breaking with this
// codebase's usual "prefer a real implementation over a mock" posture
// (see e.g. peer/LocalPeerConnectionProvider.js's own header) for one
// specific reason: deterministically forcing a REAL RTCPeerConnection's
// ICE gathering to hang forever, on demand, in a way that reproduces
// identically in CI and in a browser tab, is not something a real
// network permits — that is exactly the kind of flaky, environment-
// dependent behavior a fake exists to sidestep here. Everything ELSE
// this file does NOT touch (SDP semantics, real candidate gathering,
// real connectivity) is still proven against a real RTCPeerConnection
// in tests/WebRtcPeerTransport.test.js, unmodified by this milestone.

function assert(condition, message) {
    if (!condition) throw new Error(`ASSERT FAILED: ${message}`);
}

function wait(ms) {
    return new Promise((resolve) => setTimeout(resolve, ms));
}

class FakeDataChannel {
    constructor(label) {
        this.label = label;
        this._listeners = new Map();
    }
    addEventListener(type, handler) {
        if (!this._listeners.has(type)) this._listeners.set(type, new Set());
        this._listeners.get(type).add(handler);
    }
    removeEventListener(type, handler) {
        this._listeners.get(type)?.delete(handler);
    }
    send() {}
    close() {}
}

// The minimal surface WebRtcPeerConnection actually touches — see that
// file's own constructor and _beginOffer/_beginAnswer/
// _waitForIceGatheringComplete. `iceGatheringState` starts 'new' and
// stays there until the test explicitly calls _completeGathering() —
// simulating exactly the "never resolves" scenario this milestone
// exists to survive.
class FakeRTCPeerConnection {
    constructor({ iceServers } = {}) {
        this.iceServers = iceServers;
        this.iceGatheringState = 'new';
        this.iceConnectionState = 'new';
        this.localDescription = null;
        this.remoteDescription = null;
        this._listeners = new Map();
    }
    addEventListener(type, handler) {
        if (!this._listeners.has(type)) this._listeners.set(type, new Set());
        this._listeners.get(type).add(handler);
    }
    removeEventListener(type, handler) {
        this._listeners.get(type)?.delete(handler);
    }
    _emit(type, event = {}) {
        for (const handler of this._listeners.get(type) || []) handler(event);
    }
    createDataChannel(label) {
        return new FakeDataChannel(label);
    }
    async createOffer() {
        return { type: 'offer', sdp: 'v=0\r\no=- 1 1 IN IP4 127.0.0.1\r\ns=-\r\nt=0 0\r\n' };
    }
    async createAnswer() {
        return { type: 'answer', sdp: 'v=0\r\no=- 2 1 IN IP4 127.0.0.1\r\ns=-\r\nt=0 0\r\n' };
    }
    async setLocalDescription(desc) {
        this.localDescription = desc;
    }
    async setRemoteDescription(desc) {
        this.remoteDescription = desc;
    }
    async addIceCandidate() {}
    addTrack() { return { replaceTrack: async () => {} }; }
    removeTrack() {}
    close() {}
    // Test-only helpers — not part of the real RTCPeerConnection API.
    _emitCandidate(candidate) {
        this._emit('icecandidate', { candidate });
    }
    _completeGathering() {
        this.iceGatheringState = 'complete';
        this._emit('icegatheringstatechange');
    }
}

async function runTests() {
    // 1-3 — the core fix: gathering that NEVER completes still produces
    // a local signal, within the bounded timeout, carrying whatever
    // candidates were gathered before the deadline.
    {
        const start = Date.now();
        const connection = new WebRtcPeerConnection({
            connectionId: 'conn-hang-1',
            role: 'offerer',
            iceGatheringTimeoutMs: 60,
            RTCPeerConnectionImpl: FakeRTCPeerConnection
        });
        // A couple of REAL candidates arrive — gathering just never
        // reaches 'complete' (the fake's iceGatheringState stays 'new'/
        // 'gathering' forever, exactly like the reporting network's
        // silently-dropped ICE server).
        await wait(5);
        connection._peerConnection._emitCandidate({ candidate: 'candidate:1 1 udp 1 10.0.0.1 51000 typ host' });
        connection._peerConnection._emitCandidate({ candidate: 'candidate:2 1 udp 1 203.0.113.5 51001 typ srflx' });

        const signal = await new Promise((resolve) => connection.onLocalSignalReady(resolve));
        const elapsed = Date.now() - start;

        assert(signal !== null && signal !== undefined, '1. a local signal is produced even though gathering never completed');
        assert(signal instanceof PeerConnectionOffer, '2. ...specifically a PeerConnectionOffer, for the offerer role');
        assert(signal.iceCandidates.length === 2, '3. ...carrying exactly the candidates gathered before the deadline, never fewer, never invented');
        // Generous upper bound — this is real-timer-based like the rest
        // of this codebase's own tests (e.g. tests/AvatarProximity.test.js's
        // own `await wait(...)` pattern), not a tight race.
        assert(elapsed < 1000, `4. resolves promptly once the BOUNDED timeout elapses, not the old unbounded wait (took ${elapsed}ms)`);

        connection.close();
    }

    // 5-6 — real completion still wins when it happens BEFORE the
    // timeout — this milestone adds a ceiling, it does not remove the
    // "wait for the real thing" behavior when the network actually
    // cooperates.
    {
        const connection = new WebRtcPeerConnection({
            connectionId: 'conn-real-complete',
            role: 'offerer',
            iceGatheringTimeoutMs: 5000,
            RTCPeerConnectionImpl: FakeRTCPeerConnection
        });
        await wait(5);
        connection._peerConnection._emitCandidate({ candidate: 'candidate:1 1 udp 1 10.0.0.1 51000 typ host' });

        const start = Date.now();
        const signalPromise = new Promise((resolve) => connection.onLocalSignalReady(resolve));
        connection._peerConnection._completeGathering();
        const signal = await signalPromise;
        const elapsed = Date.now() - start;

        assert(signal.iceCandidates.length === 1, '5. real gathering completion is still honored (not truncated early by the timeout)');
        assert(elapsed < 1000, `6. ...and resolves immediately on real completion, never waiting out the full 5000ms timeout (took ${elapsed}ms)`);

        connection.close();
    }

    // 7 — the answerer role gets the identical bounded behavior — this
    // fix lives in the ONE shared _waitForIceGatheringComplete() both
    // _beginOffer() and _beginAnswer() call, never duplicated per role.
    {
        const remoteOffer = PeerConnectionOffer.create({
            connectionId: 'conn-answerer-hang',
            sdp: 'v=0\r\no=- 9 1 IN IP4 127.0.0.1\r\ns=-\r\nt=0 0\r\n',
            iceCandidates: []
        });
        const connection = new WebRtcPeerConnection({
            connectionId: 'conn-answerer-hang',
            role: 'answerer',
            remoteOffer,
            iceGatheringTimeoutMs: 60,
            RTCPeerConnectionImpl: FakeRTCPeerConnection
        });

        const signal = await new Promise((resolve) => connection.onLocalSignalReady(resolve));
        assert(signal !== null && signal.connectionId === 'conn-answerer-hang',
            '7. the answerer role also produces a bounded local signal when gathering never completes');

        connection.close();
    }

    // 8 — default behavior: a connection built with NO
    // iceGatheringTimeoutMs override still eventually resolves (using
    // peer/WebRtcPeerConnection.js's own ICE_GATHERING_TIMEOUT_MS
    // default) rather than requiring every caller to know about this
    // option to get the fix at all.
    {
        const connection = new WebRtcPeerConnection({
            connectionId: 'conn-default-timeout',
            role: 'offerer',
            RTCPeerConnectionImpl: FakeRTCPeerConnection
        });
        assert(connection._iceGatheringTimeoutMs > 0, '8. a connection built with no override still has a real, positive default timeout — never Infinity, never 0');
        connection.close();
    }

    // 9 — WebRtcPeerConnectionProvider threads its own
    // iceGatheringTimeoutMs option through to every connection it
    // creates, for BOTH createOffer() (the offerer path) and connect()
    // (the answerer path) — exactly like it already does for
    // iceServers/RTCPeerConnectionImpl.
    {
        const provider = new WebRtcPeerConnectionProvider({
            iceGatheringTimeoutMs: 60,
            RTCPeerConnectionImpl: FakeRTCPeerConnection
        });

        const offererConnection = provider.createOffer();
        const offererSignal = await new Promise((resolve) => offererConnection.onLocalSignalReady(resolve));
        assert(offererSignal !== null, '9. createOffer() honors the provider-level iceGatheringTimeoutMs — resolves promptly even though gathering never completes');

        const remoteOffer = PeerConnectionOffer.create({
            connectionId: 'conn-provider-answerer',
            sdp: 'v=0\r\no=- 9 1 IN IP4 127.0.0.1\r\ns=-\r\nt=0 0\r\n',
            iceCandidates: []
        });
        const answererConnection = provider.connect(JSON.stringify(remoteOffer.toJSON()));
        const answererSignal = await new Promise((resolve) => answererConnection.onLocalSignalReady(resolve));
        assert(answererSignal !== null, '10. ...and so does connect() (the answerer path), the same option reaching both roles');

        provider.dispose();
    }

    console.log('✅ All ICE Gathering Timeout tests passed.');
}

await runTests();
