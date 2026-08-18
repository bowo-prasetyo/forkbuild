import { PeerConnectionProvider } from './PeerConnectionProvider.js';
import { PeerConnection } from './PeerConnection.js';
import { PeerConnectionState } from './PeerConnectionState.js';
import { createId } from '../core/createId.js';

// 0.2.49's concrete transport: two (or more) LocalPeerConnectionProvider
// instances sharing one LocalPeerNetwork connect to each other entirely
// in-process, no browser transport involved. This is the peer-layer
// analogue of collaboration/LocalCollaborationTransport.js — a real,
// working implementation of a decentralized-shaped interface, standing
// in for a future WebRTCPeerConnectionProvider/relay implementation,
// exercising the exact PeerConnectionProvider/PeerConnection contract
// that milestone will have to satisfy too.
//
// Deliberately in-memory and synchronous-ish (message delivery is
// deferred one microtask, never truly instant) rather than reusing
// BroadcastChannel the way presence/profile/interaction sync do: those
// are all fire-and-forget ONE-TO-MANY broadcasts on a shared channel,
// while a peer connection is a direct ONE-TO-ONE channel between
// exactly two named endpoints — the shape a real WebRTC data channel
// actually has, and the shape the handshake in peer/
// PeerAuthenticationSession.js needs (it must be certain a message
// came from THIS specific connection's remote side, not merely from
// "somebody on the shared channel").
export class LocalPeerNetwork {
    constructor() {
        this._providers = new Map(); // address -> LocalPeerConnectionProvider
    }

    _register(address, provider) {
        if (this._providers.has(address)) {
            throw new Error('LocalPeerNetwork: address "' + address + '" is already registered');
        }
        this._providers.set(address, provider);
    }

    _unregister(address) {
        this._providers.delete(address);
    }

    _lookup(address) {
        return this._providers.get(address) || null;
    }
}

class LocalPeerConnection extends PeerConnection {
    constructor(connectionId, remoteAddress) {
        super();
        this._connectionId = connectionId;
        this._remoteAddress = remoteAddress;
        this._transportState = PeerConnectionState.CONNECTED;
        this._peer = null; // the OTHER LocalPeerConnection of this pair, wired by createPair()
        this._messageListeners = new Set();
        this._stateListeners = new Set();
    }

    static createPair(connectionId, addressA, addressB) {
        const a = new LocalPeerConnection(connectionId, addressB);
        const b = new LocalPeerConnection(connectionId, addressA);
        a._peer = b;
        b._peer = a;
        return [a, b];
    }

    get connectionId() { return this._connectionId; }
    get remoteAddress() { return this._remoteAddress; }
    get transportState() { return this._transportState; }

    send(message) {
        if (this._transportState !== PeerConnectionState.CONNECTED) {
            throw new Error('LocalPeerConnection: cannot send, connection is ' + this._transportState);
        }
        const peer = this._peer;
        // Deferred, not instant — a real transport is never
        // same-tick, and every handshake reject scenario this
        // milestone tests (tests/PeerAuthentication.test.js) exercises
        // messages that are constructed and injected directly rather
        // than relying on delivery timing, so this is a realism choice,
        // not a correctness dependency.
        queueMicrotask(() => {
            if (peer._transportState === PeerConnectionState.CONNECTED) {
                peer._receive(message);
            }
        });
    }

    _receive(message) {
        for (const listener of this._messageListeners) {
            listener(message);
        }
    }

    onMessage(callback) {
        this._messageListeners.add(callback);
        return () => this._messageListeners.delete(callback);
    }

    onStateChange(callback) {
        this._stateListeners.add(callback);
        return () => this._stateListeners.delete(callback);
    }

    close() {
        if (this._transportState === PeerConnectionState.CLOSED) {
            return;
        }
        this._setState(PeerConnectionState.CLOSED);
        const peer = this._peer;
        if (peer && peer._transportState !== PeerConnectionState.CLOSED) {
            peer._setState(PeerConnectionState.CLOSED);
        }
    }

    _setState(state) {
        this._transportState = state;
        for (const listener of this._stateListeners) {
            listener(state);
        }
    }
}

export class LocalPeerConnectionProvider extends PeerConnectionProvider {
    constructor(address, network = new LocalPeerNetwork()) {
        super();
        if (!address || typeof address !== 'string') {
            throw new Error('LocalPeerConnectionProvider: address is required');
        }
        this._address = address;
        this._network = network;
        this._connections = new Map(); // connectionId -> LocalPeerConnection
        this._incomingListeners = new Set();
        network._register(address, this);
    }

    get address() { return this._address; }
    get network() { return this._network; }

    connect(remoteAddress) {
        const remoteProvider = this._network._lookup(remoteAddress);
        if (!remoteProvider) {
            throw new Error('LocalPeerConnectionProvider: no peer registered at address "' + remoteAddress + '"');
        }
        const connectionId = createId();
        const [localConnection, remoteConnection] = LocalPeerConnection.createPair(connectionId, this._address, remoteAddress);
        this._connections.set(connectionId, localConnection);
        remoteProvider._acceptIncoming(remoteConnection);
        return localConnection;
    }

    onIncomingConnection(callback) {
        this._incomingListeners.add(callback);
        return () => this._incomingListeners.delete(callback);
    }

    _acceptIncoming(connection) {
        this._connections.set(connection.connectionId, connection);
        for (const listener of this._incomingListeners) {
            listener(connection);
        }
    }

    dispose() {
        for (const connection of this._connections.values()) {
            connection.close();
        }
        this._connections.clear();
        this._incomingListeners.clear();
        this._network._unregister(this._address);
    }
}
