import { EventBus } from '../core/events/EventBus.js';
import { PeerLifecycleState } from '../peer/PeerLifecycleState.js';

const REJECTED_EVENT = 'PeerReconnectionRejected';

// 0.2.62 — Peer Connection Resilience & Reconnection.
//
// A persistent application/PeerRelationship.js (0.2.56) remembers an
// IDENTITY, never an endpoint — there is no address, connectionId, SDP,
// or session nonce anywhere on it, on purpose (see that file's own
// header). So "reconnect to a known peer" can never mean "redial a
// remembered address" — there is nothing of the kind to redial. It means
// exactly what a FIRST connection already means: a fresh rendezvous (a
// brand-new invitation, exchanged exactly as manually as the first one
// was — see peer/WebRtcPeerConnectionProvider.js's own header,
// unmodified), a fresh WebRTC connection (a new application/
// ConnectedPeer.js, a new connectionId), and a fresh peer/
// PeerAuthenticationSession.js handshake proving key possession from
// nothing. application/PeerSessionManager.js already guarantees every
// one of those, completely unchanged by this milestone.
//
// The one genuinely new question a reconnect raises that a first
// connection never has to answer: "this device remembers a specific
// identity — does the identity this fresh handshake just proved actually
// match?" A first connection has no expectation to check against; a
// reconnect always does. This class supplies that expectation (from a
// remembered PeerRelationship) and reacts to the answer — it never
// performs the check itself. The check itself lives one layer down, in
// application/ConnectToPeerUseCase.js#_guardExpectedIdentity, layered
// directly onto the SAME 0.2.49 authentication path every connection
// already goes through. See docs/Principles.md, "A Reconnect Verifies An
// Identity; It Never Assumes One" (0.2.62).
//
// Concretely, the attack this defeats: Alice remembers Bob and asks to
// reconnect. Someone hands her a perfectly valid invitation belonging to
// Charlie — not a forgery, not a broken signature, a real one. Charlie's
// side authenticates completely honestly, as Charlie. Without this
// class, Alice's app would have no way to know that isn't who she meant
// to reconnect to; application/ConnectToPeerUseCase.js would simply hand
// back an ordinary AUTHENTICATED ConnectedPeer, indistinguishable from
// any other. With it: the connection is closed the instant AUTHENTICATED
// reveals it was never Bob, `onReconnectRejected()` fires with enough
// context to explain why, and Alice's remembered relationship with Bob
// is never touched — it was never this connection's to touch in the
// first place.
export class PeerReconnectionUseCase {
    constructor({ peerSessionManager, peerRelationshipUseCase } = {}) {
        if (!peerSessionManager || typeof peerSessionManager.createInvitation !== 'function') {
            throw new Error('PeerReconnectionUseCase: a PeerSessionManager is required');
        }
        if (!peerRelationshipUseCase || typeof peerRelationshipUseCase.getRelationship !== 'function') {
            throw new Error('PeerReconnectionUseCase: a PeerRelationshipUseCase is required');
        }
        this._peerSessionManager = peerSessionManager;
        this._peerRelationshipUseCase = peerRelationshipUseCase;
        this._eventBus = new EventBus();
        this._unsubscribeMismatch = peerSessionManager.onIdentityMismatch((detail) => this._handleMismatch(detail));
    }

    // Alice's side of "Reconnect": opens a fresh invitation exactly like
    // application/PeerSessionManager.js#createInvitation, tagged with
    // the remembered identity this attempt expects to authenticate.
    // Throws for an identityId this device never chose to "Remember" —
    // see application/PeerRelationshipUseCase.js's own header on why
    // remembering is deliberate; there is nothing recorded to reconnect
    // to otherwise. The returned `connectedPeer` is labeled with the
    // relationship's own alias (application/ConnectedPeer.js#setAlias,
    // a purely local note) purely so a pending "My Peers" card reads as
    // "reconnecting to Bob" instead of "Unknown peer" while it waits for
    // the other side's reply.
    async reconnectAsInviter(identityId, { ttlMs } = {}) {
        const relationship = this._requireRelationship(identityId);
        const { invitation, connectedPeer } = await this._peerSessionManager.createInvitation({
            ...(ttlMs ? { ttlMs } : {}),
            expectedIdentityId: relationship.identityId
        });
        connectedPeer.setAlias(relationship.alias);
        this._noteAuthenticatedWhenMatched(connectedPeer);
        return { invitation, connectedPeer };
    }

    // Bob's side of "Reconnect": imports an invitation someone sent him
    // exactly like application/PeerSessionManager.js#acceptInvitation,
    // tagged the same way.
    async reconnectViaInvitation(identityId, invitationInput) {
        const relationship = this._requireRelationship(identityId);
        const { connectedPeer, reply } = await this._peerSessionManager.acceptInvitation(invitationInput, {
            expectedIdentityId: relationship.identityId
        });
        connectedPeer.setAlias(relationship.alias);
        this._noteAuthenticatedWhenMatched(connectedPeer);
        return { connectedPeer, reply };
    }

    // Returns an unsubscribe function. Fires `{ relationship,
    // expectedIdentityId, actualIdentityId, connectionId }` the instant
    // a reconnect attempt authenticates as someone OTHER than the
    // identity it was started for. application/ConnectToPeerUseCase.js
    // has already closed the connection by the time this fires — there
    // is nothing left for a subscriber to reject, only to explain to
    // whoever is watching "Known Peers." Never fires for an ordinary
    // first-time connection (those never carry an expectedIdentityId at
    // all) and never fires for an ordinary authentication FAILURE (a
    // malformed handshake, a bad signature) — see application/
    // ConnectToPeerUseCase.js#_guardExpectedIdentity's own header on why
    // those two stay distinct.
    onReconnectRejected(callback) {
        const subscription = this._eventBus.subscribe(REJECTED_EVENT, (detail) => callback(detail));
        return () => subscription.unsubscribe();
    }

    dispose() {
        if (this._unsubscribeMismatch) {
            this._unsubscribeMismatch();
            this._unsubscribeMismatch = null;
        }
    }

    _handleMismatch({ connectionId, expectedIdentityId, actualIdentityId }) {
        // A mismatch this class never tagged (there isn't one today —
        // expectedIdentityId is only ever supplied through the two
        // methods above — but nothing stops a future caller from using
        // application/ConnectToPeerUseCase.js's own gate directly)
        // resolves to no relationship here and is silently not this
        // class's event to publish.
        const relationship = this._peerRelationshipUseCase.getRelationship(expectedIdentityId);
        if (!relationship) {
            return;
        }
        this._eventBus.publish(REJECTED_EVENT, { relationship, expectedIdentityId, actualIdentityId, connectionId });
    }

    // 0.2.56 built application/PeerRelationshipUseCase.js#noteAuthenticated
    // by name for exactly this moment — "the 'Alice verifies the
    // authenticated identity matches the remembered identity' step of the
    // design doc's flagship scenario," per that method's own header — but
    // nothing ever actually called it until now. A genuinely matched
    // reconnect is the one place calling it is correct: it only bumps
    // `lastAuthenticatedAt`, never the alias, and only for an identity
    // this device already chose to remember.
    //
    // application/ConnectToPeerUseCase.js#_guardExpectedIdentity registers
    // ITS mismatch-checking listener synchronously, before `connectedPeer`
    // is ever handed back to a caller — strictly earlier than this
    // listener, which is only ever added after that. A mismatch is
    // checked and, if needed, closes the connection SYNCHRONOUSLY within
    // that same AUTHENTICATED notification, before this later listener
    // ever runs — so re-reading `getLifecycleState()` live (never trusting
    // the `state` argument this callback was handed) is what lets this
    // tell "genuinely matched" apart from "matched a moment ago, until the
    // guard above just closed it": a rejected reconnect reports CLOSED
    // here, never AUTHENTICATED, and onIdentityMismatch (wired in the
    // constructor) is what reports that case instead.
    _noteAuthenticatedWhenMatched(connectedPeer) {
        const unsubscribe = connectedPeer.onStateChange((state) => {
            if (state !== PeerLifecycleState.AUTHENTICATED) {
                if (state === PeerLifecycleState.FAILED || state === PeerLifecycleState.CLOSED) {
                    unsubscribe();
                }
                return;
            }
            unsubscribe();
            if (connectedPeer.getLifecycleState() === PeerLifecycleState.AUTHENTICATED) {
                this._peerRelationshipUseCase.noteAuthenticated(connectedPeer.remoteIdentity);
            }
        });
    }

    _requireRelationship(identityId) {
        const relationship = this._peerRelationshipUseCase.getRelationship(identityId);
        if (!relationship) {
            throw new Error('PeerReconnectionUseCase: no known peer with that identity — remember them first');
        }
        return relationship;
    }
}
