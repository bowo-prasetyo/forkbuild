import { WebRtcPeerConnectionProvider } from '../peer/WebRtcPeerConnectionProvider.js';
import { LocalPeerDiscoveryProvider } from '../peer/LocalPeerDiscoveryProvider.js';
import { PeerInvitation } from '../peer/PeerInvitation.js';
import { ConnectToPeerUseCase } from './ConnectToPeerUseCase.js';
import { DiscoverPeersUseCase } from './DiscoverPeersUseCase.js';

const DEFAULT_INVITATION_TTL_MS = 10 * 60 * 1000; // 10 minutes — matches peer/PeerInvitation.js's own default
const SIGNAL_TIMEOUT_MS = 30 * 1000; // ICE gathering ordinarily resolves in well under this on a working network

// 0.2.55 — the one small application abstraction the design doc asked
// for: a UI-facing surface over the exact four-stage pipeline 0.2.49
// through 0.2.52 already built, and nothing more.
//
//   invitations -> connections -> authenticated peers -> ConnectedPeerRegistry
//
// Every real decision here already belonged to a class this file only
// composes: application/DiscoverPeersUseCase.js (invitation creation/
// import), application/ConnectToPeerUseCase.js (connection + 0.2.49
// authentication, and the application/ConnectedPeerRegistry.js it
// owns), and peer/WebRtcPeerConnectionProvider.js (the real, no-server
// transport 0.2.51 built). This class owns none of that logic — it
// exists only to hide the two-step WebRTC signaling handoff
// (offer -> answer -> acceptRemoteAnswer, see peer/
// WebRtcPeerConnection.js's own header) behind three verbs a UI can
// call without knowing WebRTC exists: createInvitation(), acceptInvitation(),
// completeConnection().
//
// Deliberately does NOT own presence, profiles, avatars, documents, or
// any social policy — see docs/Principles.md, "A Peer Session Manager
// Owns Connections, Never What Travels Over Them." Downstream protocols
// (presence, profile, a future chat) attach to the SAME registry() this
// class exposes; they never go through this class to do it.
//
// 0.2.62 — `createInvitation()`/`acceptInvitation()` accept an optional
// `expectedIdentityId`, threaded straight through to application/
// ConnectToPeerUseCase.js unmodified in every other respect. This class
// still owns nothing about WHAT identity to expect or WHY — see
// application/PeerReconnectionUseCase.js, the one caller that ever
// supplies it.
export class PeerSessionManager {
    constructor({ identityProvider, peerConnectionProvider = new WebRtcPeerConnectionProvider(), discoveryProvider = new LocalPeerDiscoveryProvider() } = {}) {
        if (!identityProvider) {
            throw new Error('PeerSessionManager: identityProvider is required');
        }
        this._identityProvider = identityProvider;
        this._peerConnectionProvider = peerConnectionProvider;
        this._connectToPeerUseCase = new ConnectToPeerUseCase({ peerConnectionProvider, identityProvider });
        this._discoverPeersUseCase = new DiscoverPeersUseCase(discoveryProvider);
        // Harmless for peer/WebRtcPeerConnectionProvider.js today (its own
        // onIncomingConnection() never fires — see that file's header) and
        // free forward-compatibility for any future transport that DOES
        // have an ambient incoming channel (e.g. a LAN discovery provider).
        this._stopListening = this._connectToPeerUseCase.listen();
    }

    get registry() { return this._connectToPeerUseCase.registry; }

    listPeers() { return this.registry.list(); }

    // Returns an unsubscribe function. Fires with the full current peer
    // list on every add/lifecycle-change/removal — see application/
    // ConnectedPeerRegistry.js.
    onPeersChanged(callback) { return this.registry.onChange(callback); }

    // 0.2.62 — re-exposes application/ConnectToPeerUseCase.js's own
    // mismatch signal unmodified. See application/
    // PeerReconnectionUseCase.js, the one caller that ever supplies
    // `expectedIdentityId` to createInvitation()/acceptInvitation() below.
    onIdentityMismatch(callback) { return this._connectToPeerUseCase.onIdentityMismatch(callback); }

    // Alice's side of "Invite Someone." Opens a real WebRTC offer,
    // attaches it to 0.2.49 authentication + the registry IMMEDIATELY
    // (so the pending connection shows up in "My Peers" as CONNECTING
    // right away, exactly like any other connection attempt), then waits
    // for ICE gathering to finish before wrapping the resulting offer as
    // an ordinary 0.2.50 PeerInvitation. Returns once there is something
    // to display and copy — never partway through.
    async createInvitation({ ttlMs = DEFAULT_INVITATION_TTL_MS, expectedIdentityId = null } = {}) {
        const connection = this._peerConnectionProvider.createOffer({ ttlMs });
        const connectedPeer = this._connectToPeerUseCase.attach(connection, null, { expectedIdentityId });
        const offer = await waitForLocalSignal(connection, connectedPeer);
        const invitation = this._discoverPeersUseCase.createInvitation({
            endpoint: JSON.stringify(offer.toJSON()),
            identityProvider: this._identityProvider,
            ttlMs
        });
        return { invitation, connectedPeer };
    }

    // Bob's side of "Connect to Peer." Imports the pasted invitation
    // (0.2.50, unmodified — a rendezvous hint, never a credential),
    // connects through it, and waits for this side's own WebRTC answer
    // to be ready. The caller MUST relay `reply` back to whoever issued
    // the invitation, out-of-band — copy/paste, exactly as manual as the
    // invitation itself arrived (see peer/WebRtcPeerConnectionProvider.js's
    // own header) — or the connection never leaves CONNECTING.
    async acceptInvitation(invitationInput, { expectedIdentityId = null } = {}) {
        const invitation = parseInvitation(invitationInput);
        const record = this._discoverPeersUseCase.importInvitation(invitation);
        const connectedPeer = this._connectToPeerUseCase.connect(record, { expectedIdentityId });
        const answer = await waitForLocalSignal(connectedPeer.connection, connectedPeer);
        return { connectedPeer, reply: JSON.stringify(answer.toJSON()) };
    }

    // Alice's side, completing the handoff: applies Bob's relayed reply
    // to the SAME pending connection createInvitation() started. Looks
    // the connection up in the registry by connectionId rather than
    // taking a connection reference directly, so a UI only ever needs to
    // remember the id it already displays on the pending peer's own card.
    async completeConnection(connectionId, replyInput) {
        const connectedPeer = this.registry.get(connectionId);
        if (!connectedPeer) {
            throw new Error('PeerSessionManager: no pending connection with that id — it may have already closed or expired');
        }
        let answer;
        try {
            answer = typeof replyInput === 'string' ? JSON.parse(replyInput) : replyInput;
        } catch {
            throw new Error('PeerSessionManager: that reply is not valid JSON — paste it exactly as it was copied');
        }
        await connectedPeer.connection.acceptRemoteAnswer(answer);
        return connectedPeer;
    }

    // Closing is the ONLY way a peer ever leaves the registry — see
    // application/ConnectedPeerRegistry.js's own header. There is no
    // separate "forget" or "remove" call: a closed peer disappears on
    // its own the moment its lifecycle reports CLOSED/FAILED.
    disconnect(connectionId) {
        const connectedPeer = this.registry.get(connectionId);
        if (connectedPeer) {
            connectedPeer.close();
        }
    }

    dispose() {
        if (this._stopListening) {
            this._stopListening();
            this._stopListening = null;
        }
        this.registry.dispose();
        this._peerConnectionProvider.dispose();
    }
}

// Bounds how long createInvitation()/acceptInvitation() will wait for
// this side's own WebRTC signal (offer or answer) to be ready — ICE
// gathering is normally fast, but a UI awaiting this promise needs a
// real failure eventually, not a spinner that waits forever on a
// broken network. On timeout, closes the half-open connection so it
// never lingers as a CONNECTING peer with no way to retry.
function waitForLocalSignal(connection, connectedPeer, timeoutMs = SIGNAL_TIMEOUT_MS) {
    return new Promise((resolve, reject) => {
        const timeout = setTimeout(() => {
            connectedPeer.close();
            reject(new Error('PeerSessionManager: WebRTC signaling never completed — check your network connection and try again'));
        }, timeoutMs);
        connection.onLocalSignalReady((signal) => {
            clearTimeout(timeout);
            resolve(signal);
        });
    });
}

function parseInvitation(invitationInput) {
    if (invitationInput instanceof PeerInvitation) {
        return invitationInput;
    }
    let json = invitationInput;
    if (typeof invitationInput === 'string') {
        try {
            json = JSON.parse(invitationInput);
        } catch {
            throw new Error('PeerSessionManager: that invitation is not valid JSON — paste it exactly as it was copied');
        }
    }
    return PeerInvitation.fromJSON(json);
}
