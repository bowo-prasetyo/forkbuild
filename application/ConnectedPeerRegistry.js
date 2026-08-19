import { PeerConnectionState } from '../peer/PeerConnectionState.js';

// 0.2.50 — tracks every application/ConnectedPeer.js currently live on
// this device, keyed by connectionId. This is the one piece of state a
// "Connected Peers" UI would actually read — see the design doc's own
// mockup — and it enforces, structurally, the milestone's central
// lifecycle rule: once a peer's connection disappears, it disappears from
// here too, automatically, with no separate cleanup call required from
// whatever added it. There is no persistence layer underneath this
// registry at all; it is exactly as durable as the connections it tracks,
// which is to say: not durable. No automatic permanent friend relationship
// — see docs/Principles.md, "A Peer Connection Authenticates A Key, Not An
// Account" (0.2.49), extended here to discovery and connection tracking.
//
// Removal is keyed on the underlying peer/PeerConnection.js's own
// transportState — CLOSED or FAILED — never on the derived
// peer/PeerLifecycleState.js value a state-change notification carries.
// The two used to coincide by accident: before a real handshake timeout
// existed, the only way to observe PeerLifecycleState.FAILED with the
// TRANSPORT still CONNECTED was a forged/malformed message, over almost
// as fast as it arrived. peer/PeerAuthenticationSession.js's own
// handshake deadline made that gap real — a peer that simply never
// answers now reaches authentication FAILED on a connection that is
// still perfectly alive — and removing it here on THAT signal would
// erase the card (and the failureReason ui/views/PeerConnectionsView.js
// shows on it) in the same tick it ever became visible: see docs/user/
// 07-PeerConnectionsAndFriends.md's own "Authenticated (or Failed)" —
// Failed is a state this device's own user is meant to actually SEE, not
// one that flashes and vanishes. A transport that is itself CLOSED/FAILED
// is unusable regardless of what authentication was doing, so THAT still
// removes immediately, same as always; an authentication-only failure now
// leaves the card in place, exactly like a CONNECTING or CONNECTED one,
// until the transport itself ends — the user's own explicit Disconnect,
// same as any other peer, or the connection failing for real.
export class ConnectedPeerRegistry {
    constructor() {
        this._peers = new Map(); // connectionId -> ConnectedPeer
        this._unsubscribes = new Map(); // connectionId -> unsubscribe function
        this._changeListeners = new Set();
    }

    add(connectedPeer) {
        const connectionId = connectedPeer.connectionId;
        this._peers.set(connectionId, connectedPeer);
        this._unsubscribes.set(connectionId, connectedPeer.onStateChange(() => {
            const transportState = connectedPeer.connection.transportState;
            if (transportState === PeerConnectionState.CLOSED || transportState === PeerConnectionState.FAILED) {
                this._remove(connectionId);
            } else {
                this._publishChange();
            }
        }));
        this._publishChange();
        return connectedPeer;
    }

    list() {
        return Array.from(this._peers.values());
    }

    get(connectionId) {
        return this._peers.get(connectionId) || null;
    }

    // Returns an unsubscribe function. Fires with the full current list
    // whenever a peer is added, changes lifecycle state, or is removed.
    onChange(callback) {
        this._changeListeners.add(callback);
        return () => this._changeListeners.delete(callback);
    }

    dispose() {
        for (const connectionId of Array.from(this._peers.keys())) {
            this._remove(connectionId);
        }
        this._changeListeners.clear();
    }

    _remove(connectionId) {
        const peer = this._peers.get(connectionId);
        if (!peer) {
            return;
        }
        this._peers.delete(connectionId);
        const unsubscribe = this._unsubscribes.get(connectionId);
        if (unsubscribe) {
            unsubscribe();
            this._unsubscribes.delete(connectionId);
        }
        peer.dispose();
        this._publishChange();
    }

    _publishChange() {
        const snapshot = this.list();
        for (const listener of this._changeListeners) {
            listener(snapshot);
        }
    }
}
