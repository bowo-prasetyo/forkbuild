import { derivePeerLifecycleState } from '../peer/PeerLifecycleState.js';

// 0.2.50 — the UI-facing aggregate for one live peer: a peer/
// PeerConnection.js plus the peer/PeerAuthenticationSession.js layered on
// top of it, plus (when this side did the discovering) the peer/
// PeerDiscoveryRecord.js that led here. Exists ONLY for the lifetime of the
// underlying connection — application/ConnectedPeerRegistry.js disposes and
// discards it the moment the connection closes or fails, exactly matching
// peer/PeerAuthenticationSession.js's own "closing discards remoteIdentity"
// discipline one layer up. There is no persisted "connected peers" list
// anywhere; this is a live view of what is true right now, nothing more.
//
// `alias` is a deliberately narrow answer to the design doc's "peer
// aliases" idea: a purely local, in-memory label THIS device typed for
// itself, for THIS one connection. It is never signed, never sent to the
// peer, never written to storage, and never survives past this
// ConnectedPeer instance — reconnecting to the exact same identityId later
// starts with no alias at all. See docs/Principles.md, "A Peer Alias Is A
// Local Note, Never A Claim About The Peer" — a real, persistent
// friend/contact system is explicitly future work, not this milestone's.
export class ConnectedPeer {
    constructor({ connection, authenticationSession, discoveryRecord = null } = {}) {
        if (!connection) {
            throw new Error('ConnectedPeer: connection is required');
        }
        if (!authenticationSession) {
            throw new Error('ConnectedPeer: authenticationSession is required');
        }
        this._connection = connection;
        this._authenticationSession = authenticationSession;
        this._discoveryRecord = discoveryRecord;
        this._alias = null;
        this._stateListeners = new Set();

        this._unsubscribeConnection = connection.onStateChange(() => this._notify());
        this._unsubscribeAuthentication = authenticationSession.onStateChange(() => this._notify());
    }

    get connectionId() { return this._connection.connectionId; }
    get connection() { return this._connection; }
    get authenticationSession() { return this._authenticationSession; }
    get discoveryRecord() { return this._discoveryRecord; }

    // Null until authenticationSession reaches AUTHENTICATED — see peer/
    // PeerAuthenticationSession.js. Never derived from discoveryRecord's
    // own (untrusted) identityHint.
    get remoteIdentity() { return this._authenticationSession.remoteIdentity; }

    get alias() { return this._alias; }
    setAlias(alias) {
        this._alias = alias && typeof alias === 'string' && alias.trim() ? alias.trim() : null;
        this._notify();
    }

    getLifecycleState() {
        return derivePeerLifecycleState({
            connectionState: this._connection.transportState,
            authenticationState: this._authenticationSession.authenticationState
        });
    }

    // Returns an unsubscribe function. Fires on every underlying
    // connection or authentication state change, with the ONE derived
    // PeerLifecycleState value — a caller never needs to read two state
    // machines separately just to know when to re-render.
    onStateChange(callback) {
        this._stateListeners.add(callback);
        return () => this._stateListeners.delete(callback);
    }

    close() {
        this._connection.close();
    }

    dispose() {
        this._unsubscribeConnection();
        this._unsubscribeAuthentication();
        this._stateListeners.clear();
    }

    _notify() {
        const state = this.getLifecycleState();
        // Snapshot before iterating: a CLOSED/FAILED notification here is
        // exactly what drives application/ConnectedPeerRegistry.js's own
        // auto-removal (see its header), which calls dispose() — and
        // dispose() clears `_stateListeners` synchronously, from WITHIN
        // this same notification. Iterating the live Set directly would
        // let that clear() truncate a `for...of` already in progress,
        // silently skipping any listener registered after the registry's
        // own (Set iteration stops once the set it's iterating is
        // cleared). A snapshot guarantees every listener subscribed at
        // notification time is called exactly once, regardless of what a
        // listener does to this object in response — 0.2.51's real,
        // network-timed WebRtcPeerConnection is what first exposed this;
        // peer/LocalPeerConnectionProvider.js's instant, synchronous close
        // never left a test with an external listener still needing to
        // observe CLOSED after registry disposal.
        for (const listener of Array.from(this._stateListeners)) {
            listener(state);
        }
    }
}
