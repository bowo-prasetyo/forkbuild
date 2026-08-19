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

// How long start() waits for a PROOF that answers OUR OWN challenge
// before giving up. Without this, a handshake that stalls for any
// reason on the PEER's side — a locked identity, a dropped message, a
// bug — is invisible to THIS side: _fail() never sends anything over
// the wire (see this file's own header), so a peer that never replies
// leaves an otherwise-healthy CONNECTED transport sitting in
// AUTHENTICATING forever, with no error and nothing to retry. This
// bounds that: reaching this deadline while still AUTHENTICATING fails
// the session locally, exactly like any other rejected handshake, so a
// UI watching authenticationState eventually sees FAILED instead of
// hanging indefinitely. 20s is generous for real signing + one
// round-trip over an already-open DataChannel — ordinarily this
// resolves in well under a second.
const DEFAULT_HANDSHAKE_TIMEOUT_MS = 20 * 1000;

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
// A rejected HELLO/PROOF fails ONLY the side that rejected it — see
// _fail() below: it never sends anything back over the wire, on
// purpose (a real transport carries no "authentication NAK" message
// type, only HELLO/PROOF). Left unbounded, that silence means a peer
// still waiting on a PROOF for a handshake that failed (or simply never
// happened) on the OTHER end would wait forever, on an otherwise
// perfectly healthy CONNECTED transport, with no error ever surfacing.
// DEFAULT_HANDSHAKE_TIMEOUT_MS above is what stops that: start() arms a
// deadline, cleared the moment this session reaches AUTHENTICATED or
// FAILED on its own, that fails the session locally if neither ever
// happens in time.
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
    constructor({
        connection,
        identityProvider,
        verifier = new LocalAuthorizationVerifier(),
        handshakeTimeoutMs = DEFAULT_HANDSHAKE_TIMEOUT_MS,
        setTimeoutFn = null,
        clearTimeoutFn = null
    } = {}) {
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

        // Injectable, like application/AutosaveScheduler.js's own timer
        // pair, so tests can drive the deadline deterministically instead
        // of actually waiting on it. `handshakeTimeoutMs: 0` (or any
        // falsy value) disables the timeout entirely — a real connection
        // never wants that, but a test isolating something else, with no
        // intention of ever reaching AUTHENTICATED/FAILED itself, does.
        this._handshakeTimeoutMs = handshakeTimeoutMs;
        this._setTimeout = setTimeoutFn || ((fn, ms) => setTimeout(fn, ms));
        this._clearTimeout = clearTimeoutFn || ((id) => clearTimeout(id));
        this._handshakeTimer = null;

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
        this._armHandshakeTimeout();
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
        this._clearHandshakeTimeout();
        this._setState(PeerAuthenticationState.AUTHENTICATED);
    }

    _handleTransportStateChange(transportState) {
        if (transportState === PeerConnectionState.CLOSED || transportState === PeerConnectionState.FAILED) {
            this._remoteIdentity = null;
            this._localChallenge = null;
            this._failureReason = null;
            this._clearHandshakeTimeout();
            this._setState(PeerAuthenticationState.IDLE);
        }
    }

    _fail(reason) {
        this._failureReason = reason;
        this._remoteIdentity = null;
        this._clearHandshakeTimeout();
        this._setState(PeerAuthenticationState.FAILED);
    }

    // Arms the "give up waiting for a PROOF" deadline — see this file's
    // own DEFAULT_HANDSHAKE_TIMEOUT_MS header. Only ever fails the
    // session if it is STILL AUTHENTICATING when the timer fires; if the
    // handshake already resolved (AUTHENTICATED/FAILED) or the transport
    // already reset it to IDLE, every one of those paths already cleared
    // this timer, so this callback firing at all means none of them ran.
    _armHandshakeTimeout() {
        this._clearHandshakeTimeout();
        if (!this._handshakeTimeoutMs) {
            return;
        }
        this._handshakeTimer = this._setTimeout(() => {
            this._handshakeTimer = null;
            if (this._state === PeerAuthenticationState.AUTHENTICATING) {
                this._fail('handshake timed out waiting for the peer to respond');
            }
        }, this._handshakeTimeoutMs);
        // Node's Timeout (unlike a browser's numeric handle) otherwise
        // keeps the process alive until this fires — harmless for a real
        // app, but this is a "give up eventually" safety net, never work
        // the process itself should be kept alive to guarantee, so it is
        // unref'd wherever that's available (a no-op in a browser).
        if (this._handshakeTimer && typeof this._handshakeTimer.unref === 'function') {
            this._handshakeTimer.unref();
        }
    }

    _clearHandshakeTimeout() {
        if (this._handshakeTimer !== null) {
            this._clearTimeout(this._handshakeTimer);
            this._handshakeTimer = null;
        }
    }

    _setState(state) {
        this._state = state;
        for (const listener of this._stateListeners) {
            listener(state);
        }
    }

    dispose() {
        this._clearHandshakeTimeout();
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
