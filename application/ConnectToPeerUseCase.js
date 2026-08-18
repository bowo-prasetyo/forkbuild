import { PeerAuthenticationSession } from '../peer/PeerAuthenticationSession.js';
import { ConnectedPeer } from './ConnectedPeer.js';
import { ConnectedPeerRegistry } from './ConnectedPeerRegistry.js';

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
    }

    get registry() { return this._registry; }

    connect(discoveryRecord) {
        if (!discoveryRecord || !discoveryRecord.candidateEndpoint) {
            throw new Error('ConnectToPeerUseCase: discoveryRecord with a candidateEndpoint is required');
        }
        const connection = this._peerConnectionProvider.connect(discoveryRecord.candidateEndpoint);
        return this._authenticate(connection, discoveryRecord);
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

    _authenticate(connection, discoveryRecord) {
        const session = new PeerAuthenticationSession({
            connection,
            identityProvider: this._identityProvider,
            ...(this._verifier ? { verifier: this._verifier } : {})
        });
        const connectedPeer = new ConnectedPeer({ connection, authenticationSession: session, discoveryRecord });
        this._registry.add(connectedPeer);
        session.start();
        return connectedPeer;
    }
}
