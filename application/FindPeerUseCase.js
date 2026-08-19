import { EventBus } from '../core/events/EventBus.js';

const REJECTED_EVENT = 'FindPeerRejected';

// 0.2.64 — Decentralized Peer Discovery.
//
// Answers the question 0.2.50 deliberately left open: "Alice knows Bob's
// identityId. How does she find a candidate endpoint for HIM, specifically,
// among whatever candidates this device has discovered — without ever
// treating a match on that search as proof it actually is him?"
//
//     Discovery            "Something claiming to be Bob may be here."
//     Rendezvous           "Here is an endpoint worth attempting."
//     Authentication        "This connection actually belongs to Bob."
//
// Only the third is authoritative — see peer/PeerDiscoveryProvider.js,
// "Discovery Finds A Candidate; It Never Authenticates One" (0.2.50), which
// this milestone extends rather than replaces. `search()` below is pure
// delegation to application/PeerSessionManager.js's own discovery pool —
// this class adds no discovery mechanism of its own, and never conjures a
// candidate the pool didn't already have (see peer/
// LocalPeerDiscoveryProvider.js#discover's own header on why 0.2.64 is
// deliberately a bootstrap/local milestone, not a real distributed lookup).
//
// The one thing this class DOES add: `connect()` always threads the
// identityId Alice searched FOR as `expectedIdentityId`, regardless of
// what the candidate record's own (untrusted) identityHint claims — see
// application/ConnectToPeerUseCase.js#_guardExpectedIdentity, the exact
// same 0.2.62 gate application/PeerReconnectionUseCase.js already reuses
// for reconnecting to a KNOWN peer. Here the gate does the same job for a
// peer this device has never met at all: if a discovery record calls
// itself Bob but whoever actually answers at its endpoint authenticates as
// Charlie, the connection is closed the instant that becomes provable,
// exactly as honestly as Charlie authenticated — never silently accepted
// as "found Bob," never left sitting in application/
// ConnectedPeerRegistry.js for a caller to mistake for him. Nothing about
// this rejection touches application/PeerRelationshipUseCase.js — a
// discovery record was never eligible to become a PeerRelationship in the
// first place (see that file's own header: only a verified peer/
// PeerIdentity.js from a completed handshake ever is), so there is nothing
// here to undo. See docs/Principles.md, "Discovery Is Untrusted Input;
// Only Authentication Answers Who" (0.2.64).
export class FindPeerUseCase {
    constructor({ peerSessionManager } = {}) {
        if (!peerSessionManager || typeof peerSessionManager.discoverCandidates !== 'function') {
            throw new Error('FindPeerUseCase: a PeerSessionManager is required');
        }
        this._peerSessionManager = peerSessionManager;
        this._eventBus = new EventBus();
        // Tracks which identityId a connectionId was opened to FIND, so a
        // mismatch this class didn't start (an ordinary "Invite Someone"/
        // "Connect to Peer" gesture, or a 0.2.62 reconnect) is never
        // mistaken for one of this class's own rejected searches.
        this._searchedIdentityIds = new Map();
        this._unsubscribeMismatch = peerSessionManager.onIdentityMismatch((detail) => this._handleMismatch(detail));
    }

    // Adds a candidate to the discovery pool without connecting to it —
    // see application/PeerSessionManager.js#importCandidate. Someone else
    // relaying Bob's invitation to Alice out-of-band is still how a
    // candidate for him enters this device at all; 0.2.64 only makes that
    // candidate discoverable BY IDENTITY afterward, rather than requiring
    // Alice to connect to it the instant she receives it.
    importCandidate(invitationInput) {
        return this._peerSessionManager.importCandidate(invitationInput);
    }

    // "Candidate found," never "identity found" — every peer/
    // PeerDiscoveryRecord.js this returns is exactly as untrusted as the
    // one that led here, filtered only by its own (unverified)
    // identityHint. See this class's own header.
    search(identityId) {
        if (!identityId || typeof identityId !== 'string') {
            throw new Error('FindPeerUseCase: identityId is required');
        }
        return this._peerSessionManager.discoverCandidates(identityId);
    }

    // Attempts a real connection to `record`, expecting the result to
    // authenticate as `identityId` — the identity Alice searched for, NOT
    // necessarily `record.identityHint` (a caller that passes a record
    // found via search() will always have those match going in, but this
    // method never assumes it — see this class's own header on why the
    // expectation is what Alice asked for, never what the record claims).
    // Returns `{ connectedPeer, reply }` exactly like
    // application/PeerSessionManager.js#acceptInvitation: `reply` must
    // still be relayed back out-of-band for the handshake to complete —
    // 0.2.64 changes nothing about WebRTC's own two-step signaling.
    async connect(record, identityId) {
        if (!identityId || typeof identityId !== 'string') {
            throw new Error('FindPeerUseCase: identityId is required');
        }
        const { connectedPeer, reply } = await this._peerSessionManager.connectToDiscovered(record, { expectedIdentityId: identityId });
        this._searchedIdentityIds.set(connectedPeer.connectionId, identityId);
        return { connectedPeer, reply };
    }

    // Returns an unsubscribe function. Fires `{ expectedIdentityId,
    // actualIdentityId, connectionId }` the instant a connect() started
    // for a searched identity authenticates as someone else instead.
    // application/ConnectToPeerUseCase.js has already closed the
    // connection by the time this fires — there is nothing left to
    // reject, only to explain. Never fires for a mismatch this class
    // didn't start (see the constructor's own `_searchedIdentityIds`).
    onCandidateRejected(callback) {
        const subscription = this._eventBus.subscribe(REJECTED_EVENT, (detail) => callback(detail));
        return () => subscription.unsubscribe();
    }

    dispose() {
        if (this._unsubscribeMismatch) {
            this._unsubscribeMismatch();
            this._unsubscribeMismatch = null;
        }
        this._searchedIdentityIds.clear();
    }

    _handleMismatch({ connectionId, expectedIdentityId, actualIdentityId }) {
        if (!this._searchedIdentityIds.has(connectionId)) {
            return;
        }
        this._searchedIdentityIds.delete(connectionId);
        this._eventBus.publish(REJECTED_EVENT, { expectedIdentityId, actualIdentityId, connectionId });
    }
}
