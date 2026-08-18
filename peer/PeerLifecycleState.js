import { PeerConnectionState } from './PeerConnectionState.js';
import { PeerAuthenticationState } from './PeerAuthenticationState.js';

// 0.2.50 — a single, UI-facing vocabulary for "where is this peer right
// now," spanning discovery through authentication:
//
//   DISCOVERED -> CONNECTING -> CONNECTED -> AUTHENTICATING -> AUTHENTICATED
//                                                            -> FAILED
//                                                            -> CLOSED
//
// Deliberately NOT a third, independently-tracked state machine sitting
// alongside peer/PeerConnectionState.js and peer/PeerAuthenticationState.js
// — see docs/Principles.md, "A Peer's Lifecycle Is Derived, Never A Third
// State Machine." Storing a third value here would immediately raise the
// question those two files' own header already answers for each other:
// what happens when it disagrees with the two real state machines it's
// supposed to be summarizing? derivePeerLifecycleState() has no such
// question to answer, because it never stores anything — every call
// recomputes the answer fresh from whichever real PeerConnectionState and
// PeerAuthenticationState currently exist, the same "computed, not stored"
// discipline this codebase already applies to document lifecycle status
// (0.2.21), spatial overlap (0.2.25), and distance (0.2.28).
export const PeerLifecycleState = Object.freeze({
    // A PeerDiscoveryRecord exists, but nothing has attempted to connect
    // to its candidateEndpoint yet — there is no PeerConnection at all.
    DISCOVERED: 'DISCOVERED',
    CONNECTING: 'CONNECTING',
    CONNECTED: 'CONNECTED',
    AUTHENTICATING: 'AUTHENTICATING',
    AUTHENTICATED: 'AUTHENTICATED',
    FAILED: 'FAILED',
    CLOSED: 'CLOSED'
});

// `connectionState`/`authenticationState` are omitted (or null) for a bare
// discovery candidate that has never been connected to — the only case
// this function answers DISCOVERED for. Once a real PeerConnection exists,
// its transportState always wins first (a CLOSED or FAILED transport means
// the peer is gone or unreachable regardless of what authentication was
// doing), matching peer/PeerAuthenticationSession.js's own one-way wiring:
// transport failure resets authentication, never the reverse.
export function derivePeerLifecycleState({ connectionState = null, authenticationState = null } = {}) {
    if (!connectionState) {
        return PeerLifecycleState.DISCOVERED;
    }
    if (connectionState === PeerConnectionState.CLOSED) {
        return PeerLifecycleState.CLOSED;
    }
    if (connectionState === PeerConnectionState.FAILED || authenticationState === PeerAuthenticationState.FAILED) {
        return PeerLifecycleState.FAILED;
    }
    if (connectionState === PeerConnectionState.DISCONNECTED || connectionState === PeerConnectionState.CONNECTING) {
        return PeerLifecycleState.CONNECTING;
    }
    // connectionState === CONNECTED from here on.
    if (authenticationState === PeerAuthenticationState.AUTHENTICATED) {
        return PeerLifecycleState.AUTHENTICATED;
    }
    if (authenticationState === PeerAuthenticationState.AUTHENTICATING) {
        return PeerLifecycleState.AUTHENTICATING;
    }
    return PeerLifecycleState.CONNECTED;
}
