import { PeerAuthenticationState } from './PeerAuthenticationState.js';
import { PeerConnectionState } from './PeerConnectionState.js';
import { PeerIdentity } from './PeerIdentity.js';
import * as Ed25519 from '../identity/Ed25519.js';
import { LocalAuthorizationVerifier } from '../identity/LocalAuthorizationVerifier.js';
import {
    PeerAuthenticationMessageType,
    toHelloMessage,
    isValidHelloMessage,
    toProofMessage,
    isValidProofMessage,
    getPeerAuthenticationSigningDescriptor
} from '../core/PeerAuthenticationEnvelope.js';

// 0.2.49 — "Once Alice has a connection to something claiming to be
// Bob, how does Alice cryptographically establish who Bob is?" This is
// the answer: a mutual challenge-response handshake layered strictly
// ON TOP of a peer/PeerConnection.js, never inside one.
//
// A peer connection does not authenticate a user account. It
// authenticates possession of an identity key — see docs/
// Principles.md, "A Peer Connection Authenticates A Key, Not An
// Account." Concretely, THIS device's half of the proof is whatever
// `identityProvider` is currently authenticated as (identity/
// LocalIdentityProvider.js's own AuthenticationSession) — signing a
// peer-authentication PROOF reuses signCanonical() exactly the way
// signing a presence/profile/interaction advertisement already does
// (application/PresenceSigning.js), so a locked or logged-out identity
// simply cannot authenticate a peer connection either, with no
// separate code path to keep in sync.
//
// Handshake, driven identically on both ends (there is no
// initiator/responder distinction — see core/
// PeerAuthenticationEnvelope.js's own header):
//
//   1. start() sends a HELLO: our identityId/publicKey, plus a fresh
//      CHALLENGE we want the peer to sign back.
//   2. Receiving the peer's HELLO immediately answers it with a PROOF:
//      our signature over THEIR challenge (getPeerAuthenticationSigningDescriptor),
//      alongside our own identityId/publicKey/challenge again so the
//      signed payload is fully self-contained.
//   3. Receiving the peer's PROOF verifies it against the challenge WE
//      issued in step 1 — never the challenge the message merely
//      claims to be answering. A match, a valid identityId/publicKey
//      pairing, and a signature that verifies moves this session to
//      AUTHENTICATED and records remoteIdentity. Anything else moves
//      it to FAILED, terminally, for this connection — see peer/
//      PeerAuthenticationState.js's own header.
//
// Deliberately excluded from this milestone, on purpose (see docs/
// Roadmap.md's own "No persistent peer trust yet"): nothing here is
// ever written to storage, nothing survives past this ONE connection,
// and there is no "trusted peers" list anywhere. Closing the
// connection (or the connection failing) immediately discards
// remoteIdentity and resets authenticationState — reconnecting always
// means a brand-new PeerAuthenticationSession over a brand-new
// PeerConnection, proving possession again from nothing, never resuming
// a prior proof.
export class PeerAuthenticationSession {
    constructor({ connection, identityProvider, verifier = new LocalAuthorizationVerifier() } = {}) {
        if (!connection) {
            throw new Error('PeerAuthenticationSession: connection is required');
        }
        if (!identityProvider
            || typeof identityProvider.signCanonical !== 'function'
            || typeof identityProvider.getSigningIdentity !== 'function') {
            throw new Error('PeerAuthenticationSession: identityProvider capable of signCanonical/getSigningIdentity is required');
        }
        this._connection = connection;
        this._identityProvider = identityProvider;
        this._verifier = verifier;

        this._state = PeerAuthenticationState.IDLE;
        this._remoteIdentity = null;
        this._failureReason = null;
        this._localChallenge = null;

        this._stateListeners = new Set();

        this._unsubscribeMessage = connection.onMessage((message) => this._handleMessage(message));
        this._unsubscribeConnectionState = connection.onStateChange((transportState) => this._handleTransportStateChange(transportState));
    }

    get authenticationState() { return this._state; }
    get remoteIdentity() { return this._remoteIdentity; }
    get failureReason() { return this._failureReason; }
    get isAuthenticated() { return this._state === PeerAuthenticationState.AUTHENTICATED; }

    onStateChange(callback) {
        this._stateListeners.add(callback);
        return () => this._stateListeners.delete(callback);
    }

    // Begins the handshake: announces this side's identity plus a
    // fresh challenge for the peer to sign back. Not a retry
    // mechanism — a session that has already started, authenticated,
    // or failed refuses a second start() the same way identity/
    // LocalIdentityProvider.js's own authenticate() refuses to be
    // called onto an already-different session state silently.
    start() {
        if (this._state !== PeerAuthenticationState.IDLE) {
            throw new Error('PeerAuthenticationSession: cannot start, handshake already in progress or complete');
        }
        if (this._connection.transportState !== PeerConnectionState.CONNECTED) {
            throw new Error('PeerAuthenticationSession: cannot start, connection is not CONNECTED');
        }
        let localIdentity;
        try {
            localIdentity = this._identityProvider.getSigningIdentity();
        } catch (e) {
            return this._fail('no local signing identity available: ' + e.message);
        }
        this._localChallenge = Ed25519.bytesToHex(Ed25519.randomSeed());
        this._setState(PeerAuthenticationState.AUTHENTICATING);
        this._connection.send(toHelloMessage({
            sessionNonce: this._connection.connectionId,
            identityId: localIdentity.id,
            publicKey: localIdentity.publicKey,
            challenge: this._localChallenge
        }));
    }

    // Normally driven entirely by the wired connection's onMessage
    // listener; exposed directly so tests (and, later, any transport
    // that cannot deliver its own onMessage synchronously enough) can
    // exercise forged, mutated, or replayed messages without needing a
    // second live connection to produce them honestly.
    handleIncomingMessage(message) {
        this._handleMessage(message);
    }

    _handleMessage(message) {
        if (this._state === PeerAuthenticationState.FAILED
            || this._connection.transportState !== PeerConnectionState.CONNECTED) {
            return;
        }
        if (!message || typeof message !== 'object') {
            return;
        }
        if (message.type === PeerAuthenticationMessageType.HELLO) {
            this._handleHello(message);
        } else if (message.type === PeerAuthenticationMessageType.PROOF) {
            this._handleProof(message);
        }
    }

    _handleHello(message) {
        if (this._state === PeerAuthenticationState.AUTHENTICATED) {
            // No re-handshake in 0.2.49 — an already-authenticated
            // connection ignores a stray later HELLO rather than
            // reopening trust it already established.
            return;
        }
        if (!isValidHelloMessage(message)) {
            return this._fail('malformed HELLO message');
        }
        if (message.sessionNonce !== this._connection.connectionId) {
            return this._fail('HELLO sessionNonce does not match this connection');
        }
        if (!identityMatchesPublicKey(message.identityId, message.publicKey)) {
            return this._fail('HELLO identityId does not match publicKey');
        }

        let localIdentity;
        try {
            localIdentity = this._identityProvider.getSigningIdentity();
        } catch (e) {
            return this._fail('no local signing identity available: ' + e.message);
        }

        const descriptor = getPeerAuthenticationSigningDescriptor({
            sessionNonce: this._connection.connectionId,
            identityId: localIdentity.id,
            publicKey: localIdentity.publicKey,
            challenge: message.challenge
        });
        let signature;
        try {
            signature = this._identityProvider.signCanonical(descriptor);
        } catch (e) {
            return this._fail('unable to sign PROOF: ' + e.message);
        }

        this._connection.send(toProofMessage({
            sessionNonce: this._connection.connectionId,
            identityId: localIdentity.id,
            publicKey: localIdentity.publicKey,
            challenge: message.challenge,
            signature: signature.toJSON()
        }));
    }

    _handleProof(message) {
        if (!isValidProofMessage(message)) {
            return this._fail('malformed PROOF message');
        }
        if (!this._localChallenge) {
            return this._fail('received a PROOF before start() issued a challenge');
        }
        if (message.sessionNonce !== this._connection.connectionId) {
            return this._fail('PROOF sessionNonce does not match this connection');
        }
        if (message.challenge !== this._localChallenge) {
            return this._fail('PROOF answers a different challenge than the one issued');
        }
        if (!identityMatchesPublicKey(message.identityId, message.publicKey)) {
            return this._fail('PROOF identityId does not match publicKey');
        }

        const descriptor = getPeerAuthenticationSigningDescriptor({
            sessionNonce: message.sessionNonce,
            identityId: message.identityId,
            publicKey: message.publicKey,
            challenge: message.challenge
        });
        const claimedIdentity = { id: message.identityId, algorithm: 'Ed25519', publicKey: message.publicKey };
        const result = this._verifier.verifyDescriptor(descriptor, message.signature, claimedIdentity);
        if (!result.valid) {
            return this._fail('PROOF signature invalid: ' + result.reason);
        }

        this._remoteIdentity = new PeerIdentity({
            identityId: message.identityId,
            publicKey: message.publicKey,
            algorithm: 'Ed25519'
        });
        this._setState(PeerAuthenticationState.AUTHENTICATED);
    }

    _handleTransportStateChange(transportState) {
        if (transportState === PeerConnectionState.CLOSED || transportState === PeerConnectionState.FAILED) {
            this._remoteIdentity = null;
            this._localChallenge = null;
            this._failureReason = null;
            this._setState(PeerAuthenticationState.IDLE);
        }
    }

    _fail(reason) {
        this._failureReason = reason;
        this._remoteIdentity = null;
        this._setState(PeerAuthenticationState.FAILED);
    }

    _setState(state) {
        this._state = state;
        for (const listener of this._stateListeners) {
            listener(state);
        }
    }

    dispose() {
        this._unsubscribeMessage();
        this._unsubscribeConnectionState();
        this._stateListeners.clear();
    }
}

function identityMatchesPublicKey(identityId, publicKeyHex) {
    try {
        return Ed25519.publicKeyToDidKey(Ed25519.hexToBytes(publicKeyHex)) === identityId;
    } catch {
        return false;
    }
}
