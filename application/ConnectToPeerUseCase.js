import { PeerAuthenticationSession } from '../peer/PeerAuthenticationSession.js';
import { PeerConnectionState } from '../peer/PeerConnectionState.js';
import { PeerLifecycleState } from '../peer/PeerLifecycleState.js';
import { EventBus } from '../core/events/EventBus.js';
import { ConnectedPeer } from './ConnectedPeer.js';
import { ConnectedPeerRegistry } from './ConnectedPeerRegistry.js';

const IDENTITY_MISMATCH_EVENT = 'PeerIdentityMismatch';

// 0.2.50 — the architectural flow the design doc asked for, wired end to
// end:
//
//     Discovery -> Candidate Endpoint -> Peer Connection
//               -> 0.2.49 Mutual Authentication -> Authenticated PeerIdentity
//
// `connect(discoveryRecord)` is the ACTIVE half: it asks the injected
// peer/PeerConnectionProvider.js to open a transport connection to
// `discoveryRecord.candidateEndpoint` — a candidate address a
// PeerDiscoveryProvider produced, never treated as anything more
// authoritative than that — then layers a brand-new
// peer/PeerAuthenticationSession.js on top and starts the handshake
// immediately. `listen()` is the PASSIVE half: the handshake itself has no
// initiator/responder distinction (see peer/PeerAuthenticationSession.js's
// own header), so accepting an incoming connection runs through the exact
// same `_authenticate()` path, just with no discoveryRecord — this side
// didn't discover anything, it was found.
//
// This use case never inspects `discoveryRecord.identityHint` and never
// short-circuits authentication because of it. The ONLY thing that can
// ever populate a ConnectedPeer's remoteIdentity is a real, verified PROOF
// — see application/ConnectedPeer.js and docs/Principles.md, "Discovery
// Finds A Candidate; It Never Authenticates One."
//
// 0.2.62 note: `connect()`/`attach()` accept an optional
// `expectedIdentityId` — the one new question a RECONNECT raises that a
// first connection never has to answer (see application/
// PeerReconnectionUseCase.js's own header). It changes nothing about the
// handshake itself: authentication proceeds exactly as it always has,
// against whatever key genuinely answers the challenge. Only once a
// connection reaches AUTHENTICATED is the proven `remoteIdentity.identityId`
// compared against `expectedIdentityId`; a mismatch closes the connection
// immediately and is reported via `onIdentityMismatch()`, never allowed to
// sit in application/ConnectedPeerRegistry.js masquerading as the peer a
// caller asked to reconnect to. A caller that never supplies
// `expectedIdentityId` (every first-time "Invite Someone"/"Connect to
// Peer" gesture) gets EXACTLY the pre-0.2.62 behavior — this is an
// additional, optional gate layered on top of 0.2.49 authentication, never
// a replacement for it, the same "additional gate, never a substitute for
// cryptographic verification" shape 0.2.60's blocking already established
// one layer over.
//
// 0.2.51 note: `_authenticate()` no longer assumes `connection` is already
// CONNECTED the instant it exists. `peer/LocalPeerConnectionProvider.js`
// always was — pairing two in-process connections is instant — so
// `session.start()` used to run synchronously, same tick, right here. A
// real transport (`peer/WebRtcPeerConnectionProvider.js`) cannot make that
// promise: ICE negotiation and DataChannel establishment are genuinely
// asynchronous. Waiting for the connection's own `transportState` to reach
// CONNECTED before calling `start()` — immediately if it already has,
// otherwise via `onStateChange()` — makes this use case correct for BOTH,
// with the synchronous case unchanged in observable behavior (still starts
// before this call's caller gets control back).
export class ConnectToPeerUseCase {
    constructor({ peerConnectionProvider, identityProvider, verifier, registry = new ConnectedPeerRegistry() } = {}) {
        if (!peerConnectionProvider || typeof peerConnectionProvider.connect !== 'function') {
            throw new Error('ConnectToPeerUseCase: peerConnectionProvider capable of connect() is required');
        }
        if (!identityProvider) {
            throw new Error('ConnectToPeerUseCase: identityProvider is required');
        }
        this._peerConnectionProvider = peerConnectionProvider;
        this._identityProvider = identityProvider;
        this._verifier = verifier;
        this._registry = registry;
        this._eventBus = new EventBus();
    }

    get registry() { return this._registry; }

    connect(discoveryRecord, { expectedIdentityId = null } = {}) {
        if (!discoveryRecord || !discoveryRecord.candidateEndpoint) {
            throw new Error('ConnectToPeerUseCase: discoveryRecord with a candidateEndpoint is required');
        }
        const connection = this._peerConnectionProvider.connect(discoveryRecord.candidateEndpoint);
        return this._authenticate(connection, discoveryRecord, expectedIdentityId);
    }

    // Returns an unsubscribe function. Every incoming connection this
    // provider receives is authenticated the same way an active connect()
    // is — there is no "trust incoming connections less" mode, because
    // authentication itself, not which side dialed, is what establishes
    // trust.
    listen() {
        return this._peerConnectionProvider.onIncomingConnection((connection) => {
            this._authenticate(connection, null);
        });
    }

    // Wraps an ALREADY-EXISTING peer/PeerConnection.js in 0.2.49
    // authentication and this registry, without this use case having asked
    // its provider to create the connection via connect(). `connect()` and
    // `listen()` are both thin wrappers over this. Exists for a transport
    // where dialing and connection-object-creation are two separate steps
    // — peer/WebRtcPeerConnectionProvider.js's own `createOffer()`, whose
    // caller already holds a WebRtcPeerConnection before any remote answer
    // has even arrived, let alone before the connection reaches CONNECTED.
    attach(connection, discoveryRecord = null, { expectedIdentityId = null } = {}) {
        return this._authenticate(connection, discoveryRecord, expectedIdentityId);
    }

    // Fires `{ connectionId, expectedIdentityId, actualIdentityId }`
    // whenever a connection started with an `expectedIdentityId`
    // authenticates as someone else. By the time this fires the
    // connection is already closed (see `_guardExpectedIdentity` below)
    // — there is nothing left for a subscriber to reject, only to
    // explain. Never fires for a connection started without an
    // `expectedIdentityId` at all. Returns an unsubscribe function.
    onIdentityMismatch(callback) {
        const subscription = this._eventBus.subscribe(IDENTITY_MISMATCH_EVENT, (detail) => callback(detail));
        return () => subscription.unsubscribe();
    }

    _authenticate(connection, discoveryRecord, expectedIdentityId = null) {
        const session = new PeerAuthenticationSession({
            connection,
            identityProvider: this._identityProvider,
            ...(this._verifier ? { verifier: this._verifier } : {})
        });
        const connectedPeer = new ConnectedPeer({ connection, authenticationSession: session, discoveryRecord });
        this._registry.add(connectedPeer);
        this._startWhenConnected(connection, session);
        if (expectedIdentityId) {
            this._guardExpectedIdentity(connectedPeer, expectedIdentityId);
        }
        return connectedPeer;
    }

    // The ONE new check 0.2.62 adds, layered strictly on top of an
    // otherwise-unmodified authentication result: once (and only once)
    // this connection reaches AUTHENTICATED, its proven remoteIdentity
    // must match what the caller expected. A mismatch is not a failed
    // handshake — the peer on the other end proved a completely real
    // identity, just not the one this connection was opened to reach —
    // so it is never reported through peer/PeerAuthenticationState.js's
    // own FAILED (that stays reserved for a handshake that never proved
    // anything at all). Closing immediately is what stops a substituted
    // identity from ever sitting in application/ConnectedPeerRegistry.js
    // where a caller could mistake it for the peer it was expecting.
    _guardExpectedIdentity(connectedPeer, expectedIdentityId) {
        const unsubscribe = connectedPeer.onStateChange((state) => {
            if (state === PeerLifecycleState.AUTHENTICATED) {
                unsubscribe();
                const actualIdentityId = connectedPeer.remoteIdentity.identityId;
                if (actualIdentityId !== expectedIdentityId) {
                    const connectionId = connectedPeer.connectionId;
                    connectedPeer.close();
                    this._eventBus.publish(IDENTITY_MISMATCH_EVENT, { connectionId, expectedIdentityId, actualIdentityId });
                }
            } else if (state === PeerLifecycleState.FAILED || state === PeerLifecycleState.CLOSED) {
                unsubscribe();
            }
        });
    }

    _startWhenConnected(connection, session) {
        if (connection.transportState === PeerConnectionState.CONNECTED) {
            session.start();
            return;
        }
        const unsubscribe = connection.onStateChange((state) => {
            if (state === PeerConnectionState.CONNECTED) {
                unsubscribe();
                session.start();
            } else if (state === PeerConnectionState.CLOSED || state === PeerConnectionState.FAILED) {
                unsubscribe();
            }
        });
    }
}
