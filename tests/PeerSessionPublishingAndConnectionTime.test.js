import { LocalIdentityProvider } from '../identity/LocalIdentityProvider.js';
import { StorageProvider } from '../storage/StorageProvider.js';
import { PeerConnectionState } from '../peer/PeerConnectionState.js';
import { LocalRendezvousNetwork } from '../peer/LocalRendezvousNetwork.js';
import { RendezvousDiscoveryProvider } from '../peer/RendezvousDiscoveryProvider.js';
import { WebRtcPeerConnectionProvider } from '../peer/WebRtcPeerConnectionProvider.js';
import { ConnectedPeerRegistry } from '../application/ConnectedPeerRegistry.js';
import { PeerSessionManager } from '../application/PeerSessionManager.js';
import { FindPeerUseCase } from '../application/FindPeerUseCase.js';

// Two pieces of state ui/views/PeerConnectionsView.js used to keep on its
// own, and lose on every remount, now read from app-wide objects instead:
//
//   - "connected for …" — application/ConnectedPeerRegistry.js#connectedSince
//     records when each connection attempt was added, and forgets it with
//     the connection itself.
//   - "Be Discoverable" — application/PeerSessionManager.js#isPublishing is
//     derived from the published offer's own connection: true only while
//     that offer is still waiting for an answer and unexpired, false once
//     one inbound connection consumes it (one publication answers at most
//     one — see publishSelf()'s own header), it closes, it expires, or
//     stopPublishing() withdraws it.

class InMemoryStorageProvider extends StorageProvider {
    constructor() { super(); this._data = new Map(); }
    save(name, data) { this._data.set(name, JSON.parse(JSON.stringify(data))); }
    load(name) { return this._data.has(name) ? JSON.parse(JSON.stringify(this._data.get(name))) : null; }
    remove(name) { this._data.delete(name); }
    list() { return Array.from(this._data.keys()); }
}

function assert(condition, message) {
    if (!condition) throw new Error(`ASSERT FAILED: ${message}`);
}

function wait(ms = 30) {
    return new Promise((resolve) => setTimeout(resolve, ms));
}

class FakeDataChannel {
    constructor(label) {
        this.label = label;
        this.readyState = 'connecting';
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
    // Test-only: the far end answered and the channel opened.
    _open() {
        this.readyState = 'open';
        for (const handler of this._listeners.get('open') || []) handler({});
    }
}

// The same minimal surface tests/IceGatheringTimeout.test.js fakes, except
// ICE gathering completes as soon as a local description is set, so an
// offer is ready immediately.
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
        this.iceGatheringState = 'complete';
        this._emit('icegatheringstatechange');
    }
    async setRemoteDescription(desc) {
        this.remoteDescription = desc;
    }
    async addIceCandidate() {}
    close() {}
}

function makeSessionManager({ withRendezvous = true } = {}) {
    const identityProvider = new LocalIdentityProvider(new InMemoryStorageProvider());
    identityProvider.login('alice');
    const peerConnectionProvider = new WebRtcPeerConnectionProvider({ RTCPeerConnectionImpl: FakeRTCPeerConnection });
    const options = { identityProvider, peerConnectionProvider };
    if (withRendezvous) {
        options.discoveryProvider = new RendezvousDiscoveryProvider({ transport: new LocalRendezvousNetwork() });
    }
    const sessions = new PeerSessionManager(options);
    return { sessions, findPeer: new FindPeerUseCase({ peerSessionManager: sessions }) };
}

// The pending offer behind the last publishSelf(): the one peer still
// CONNECTING whose connectionId is not in `before`.
function newPendingPeer(sessions, before) {
    return sessions.listPeers().find((p) => !before.has(p.connectionId));
}

async function runTests() {
    // 1-3 — ConnectedPeerRegistry records when each peer was added, and
    // forgets it with the peer.
    {
        let clock = new Date('2026-01-01T00:00:00Z');
        const registry = new ConnectedPeerRegistry({ now: () => clock });
        const listeners = new Set();
        const fakePeer = {
            connectionId: 'conn-1',
            connection: { transportState: PeerConnectionState.CONNECTING },
            onStateChange(cb) { listeners.add(cb); return () => listeners.delete(cb); },
            dispose() {}
        };
        assert(registry.connectedSince('conn-1') === null, '1. an unknown connectionId has no connectedSince');
        registry.add(fakePeer);
        clock = new Date('2026-01-01T00:05:00Z');
        assert(registry.connectedSince('conn-1').toISOString() === '2026-01-01T00:00:00.000Z', '2. connectedSince is the moment the peer was ADDED, unaffected by later time passing');
        fakePeer.connection.transportState = PeerConnectionState.CLOSED;
        listeners.forEach((cb) => cb());
        assert(registry.get('conn-1') === null && registry.connectedSince('conn-1') === null, '3. once the connection closes, the peer and its connectedSince are both gone');
    }
    console.log('✓ 1-3: ConnectedPeerRegistry#connectedSince');

    // 4-5 — PeerSessionManager exposes the same timestamp for a real
    // pending invitation, and it is stable across reads (as a remounted
    // view would read it).
    {
        const { sessions } = makeSessionManager();
        const before = Date.now();
        const { connectedPeer } = await sessions.createInvitation();
        const since = sessions.connectedSince(connectedPeer.connectionId);
        assert(since instanceof Date && since.getTime() >= before && since.getTime() <= Date.now(), '4. connectedSince is set when createInvitation() registers the pending connection');
        await wait(20);
        assert(sessions.connectedSince(connectedPeer.connectionId).getTime() === since.getTime(), '5. a later read returns the same start time — it never restarts');
        sessions.disconnect(connectedPeer.connectionId);
        assert(sessions.connectedSince(connectedPeer.connectionId) === null, '5b. disconnecting clears it with the connection');
        sessions.dispose();
    }
    console.log('✓ 4-5: PeerSessionManager#connectedSince');

    // 6-10 — isPublishing() follows the published offer's own connection.
    {
        const { sessions, findPeer } = makeSessionManager();
        assert(!sessions.isPublishing() && !findPeer.isPublishing(), '6. nothing is published initially');

        let before = new Set(sessions.listPeers().map((p) => p.connectionId));
        assert(await findPeer.publishSelf(), 'setup: publishSelf() publishes to the configured rendezvous network');
        assert(sessions.isPublishing() && findPeer.isPublishing(), '7. after publishSelf(), isPublishing() is true (and FindPeerUseCase forwards it)');

        // Someone answers the published offer: its data channel opens.
        const offer = newPendingPeer(sessions, before);
        offer.connection._dataChannel._open();
        assert(offer.connection.transportState === PeerConnectionState.CONNECTED, 'setup: the published offer is now answered');
        assert(!sessions.isPublishing(), '8. once one inbound connection consumes the offer, isPublishing() is false — a publication answers at most one');

        before = new Set(sessions.listPeers().map((p) => p.connectionId));
        await sessions.publishSelf();
        assert(sessions.isPublishing(), '9. publishing again makes it true again');
        await sessions.stopPublishing();
        assert(!sessions.isPublishing(), '9b. stopPublishing() makes it false');

        before = new Set(sessions.listPeers().map((p) => p.connectionId));
        await sessions.publishSelf();
        sessions.disconnect(newPendingPeer(sessions, before).connectionId);
        assert(!sessions.isPublishing(), '10. closing the published offer\'s connection makes it false');
        sessions.dispose();
    }
    console.log('✓ 6-10: isPublishing() follows the published offer');

    // 11 — an expired publication is no longer publishing.
    {
        const { sessions } = makeSessionManager();
        await sessions.publishSelf({ ttlMs: 60 });
        assert(sessions.isPublishing(), 'setup: a short-lived publication starts out publishing');
        await wait(100);
        assert(!sessions.isPublishing(), '11. once its invitation expires, isPublishing() is false');
        sessions.dispose();
    }
    console.log('✓ 11: expiry ends publishing');

    // 12 — with no rendezvous network configured, nothing is published,
    // so nothing reports publishing either.
    {
        const { sessions } = makeSessionManager({ withRendezvous: false });
        const publication = await sessions.publishSelf();
        assert(!publication && !sessions.isPublishing(), '12. no rendezvous network: publishSelf() returns nothing and isPublishing() stays false');
        sessions.dispose();
    }
    console.log('✓ 12: no rendezvous network, never publishing');

    console.log('\nAll peer session publishing and connection-time tests passed.');
}

await runTests();
