import { PeerLifecycleState } from '../peer/PeerLifecycleState.js';

// 0.9.345 — Automatic Known-Peer Connection.
//
// 0.9.344's own boundary audit found the seam this milestone ships already
// exists, unmodified: application/FindPeerUseCase.js#search()/#connect() is
// the identical path a human's "Find Someone" click already walks, and
// eligibility already falls out of what a coordinator would have to iterate
// over — application/PeerRelationshipUseCase.js#getRelationships(), and
// nothing else. This class is that audit's own test-side-only
// `attemptKnownPeerAutoConnect()` helper, moved into production unchanged
// in shape, composed the exact way application/PeerReconnectionUseCase.js
// already composes its own two collaborators rather than owning any new
// storage, discovery, or transport of its own:
//
//   Known relationship -> exact identity lookup -> not discoverable? stop.
//   Discoverable -> already connected? reuse. Not connected -> FindPeerUseCase#connect().
//
// This class owns exactly that composition and nothing else. It never
// discovers a candidate (application/FindPeerUseCase.js#search() does,
// unmodified), never authenticates one (application/
// ConnectToPeerUseCase.js does, unmodified, underneath #connect()), never
// syncs Publications (application/PublicationPeerConnectionSync.js already
// reacts to ANY newly AUTHENTICATED peer regardless of how the connection
// was initiated — nothing here needs to know that class exists), and never
// retries, ranks, schedules, or persists anything of its own.
//
// DEDUPLICATION (0.9.344 Section F, flagship). application/
// ConnectedPeerRegistry.js has no identityId concept at all — two
// independent authenticated connections to the same remote identity can
// coexist unless something checks first. `_isAlreadyConnected()` below
// reuses `connectedPeerRegistry.list()`, the exact same read application/
// PeerPresenceUseCase.js#isIdentityOnline() already performs for an
// unrelated purpose — no new store, no new identityId index.
//
// TRIGGER, DELIBERATELY BOUNDED (0.9.344 Section I). This codebase already
// ships one real, always-on default rendezvous node — automating today's
// rare, human-initiated LOOKUP into a tight, unattended polling loop would
// hand that node's operator this device's entire Known Peers list, for
// free, over time. This class runs an attempt exactly twice per reason,
// never on a timer: once at construction (the known-relationship set this
// device already has, the moment this class starts observing it — the
// "application starts" case) and again every time application/
// PeerRelationshipUseCase.js#onRelationshipsChanged() fires (the "a
// relationship was remembered/updated/forgotten" case). A run already in
// flight coalesces a change that arrives mid-run into exactly one more
// full pass afterward, rather than overlapping two concurrent passes that
// could each decide, correctly at the time, that the same identity is not
// yet connected and both attempt it.
//
// FAILURE ISOLATION (0.9.344 Section G). One identity's failed lookup or
// rejected/failed connection attempt never blocks another's — each
// identity in a pass is attempted independently, in its own try/catch.
//
// NO RETRIES. A peer this pass could not reach is simply not attempted
// again until the next of the two triggers above fires naturally. There is
// no retry queue, backoff, or connection-health tracking here — see this
// codebase's own README/Roadmap entry for 0.9.345 on why that stays a
// deliberately separate concern, to be justified later only if real usage
// shows an actual gap.
export class AutoConnectKnownPeersUseCase {
    constructor({ findPeerUseCase, peerRelationshipUseCase, connectedPeerRegistry } = {}) {
        if (!findPeerUseCase || typeof findPeerUseCase.search !== 'function' || typeof findPeerUseCase.connect !== 'function') {
            throw new Error('AutoConnectKnownPeersUseCase: a FindPeerUseCase is required');
        }
        if (!peerRelationshipUseCase || typeof peerRelationshipUseCase.getRelationships !== 'function') {
            throw new Error('AutoConnectKnownPeersUseCase: a PeerRelationshipUseCase is required');
        }
        if (!connectedPeerRegistry || typeof connectedPeerRegistry.list !== 'function') {
            throw new Error('AutoConnectKnownPeersUseCase: a ConnectedPeerRegistry is required');
        }
        this._findPeerUseCase = findPeerUseCase;
        this._peerRelationshipUseCase = peerRelationshipUseCase;
        this._registry = connectedPeerRegistry;
        this._running = false;
        this._rerunRequested = false;
        this._unsubscribeRelationships = peerRelationshipUseCase.onRelationshipsChanged(() => this._scheduleRun());
        this._scheduleRun();
    }

    dispose() {
        if (this._unsubscribeRelationships) {
            this._unsubscribeRelationships();
            this._unsubscribeRelationships = null;
        }
        // Deliberately does NOT dispose the injected findPeerUseCase,
        // peerRelationshipUseCase, or connectedPeerRegistry — all three are
        // shared, app-wide collaborators this class never owns, the same
        // restraint application/PublicationPeerConnectionSync.js#dispose()
        // already documents for the identical reason.
    }

    // Coalesces a trigger that arrives while a pass is already running into
    // exactly one more full pass afterward, rather than letting two passes
    // overlap — see this file's own header, "TRIGGER, DELIBERATELY BOUNDED."
    _scheduleRun() {
        if (this._running) {
            this._rerunRequested = true;
            return;
        }
        this._running = true;
        this._runOnce().finally(() => {
            this._running = false;
            if (this._rerunRequested) {
                this._rerunRequested = false;
                this._scheduleRun();
            }
        });
    }

    async _runOnce() {
        for (const relationship of this._peerRelationshipUseCase.getRelationships()) {
            await this._attempt(relationship.identityId);
        }
    }

    async _attempt(identityId) {
        if (this._isAlreadyConnected(identityId)) {
            return; // 0.9.344 Section F — already authenticated; nothing to do
        }
        let candidates;
        try {
            candidates = await this._findPeerUseCase.search(identityId);
        } catch {
            return; // 0.9.344 Section G — one identity's lookup failing never blocks another's
        }
        if (!candidates || candidates.length === 0) {
            return; // 0.9.344 Section D — not currently discoverable: no automatic connection
        }
        try {
            await this._findPeerUseCase.connect(candidates[0], identityId);
        } catch {
            // 0.9.344 Section G/E — a failed or rejected attempt (including
            // application/FindPeerUseCase.js's own identity-mismatch guard)
            // never blocks the rest of this pass.
        }
    }

    _isAlreadyConnected(identityId) {
        return this._registry.list().some((peer) =>
            peer.remoteIdentity
            && peer.remoteIdentity.identityId === identityId
            && peer.getLifecycleState() === PeerLifecycleState.AUTHENTICATED);
    }
}
