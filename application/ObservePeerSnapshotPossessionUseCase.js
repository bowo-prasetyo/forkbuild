import { SnapshotPeerPossessionState } from './SnapshotPeerPossessionState.js';
import { toSnapshotPeerPossessionObservation } from './SnapshotPeerPossessionObservation.js';
import { PeerSnapshotPossessionWireState } from './PeerSnapshotPossessionProtocol.js';

// 0.8.40 — Snapshot Possession Observation Exchange.
//
// application/MaterializeSnapshotFromPeerUseCase.js (0.8.37) turns an
// explicitly chosen peer's REQUEST/RESPONSE round trip into local
// possession. This class is the question-only sibling: it turns the
// identical round trip, over application/
// PublicationSnapshotPossessionPeerExchange.js instead, into a single
// application/SnapshotPeerPossessionObservation.js record — and stops
// there. It never stores a byte, never touches content/ContentStore.js,
// never touches a placement catalog, and never touches application/
// StoreSnapshotContentUseCase.js.
//
//   peer (an already-authenticated ConnectedPeer a person explicitly
//         selected), publicationId, contentHash
//        │
//        ▼
//   exchange.requestPossession(peer, { publicationId, contentHash })
//        │
//   ┌────┴──────────────────────────────────┐
//   │ a RESPONSE for THIS peer/contentHash   │ nothing arrives before
//   │ arrives                                │ timeoutMs elapses
//   ▼                                         ▼
// SnapshotPeerPossessionState.AVAILABLE   SnapshotPeerPossessionState
// or .NOT_AVAILABLE (the wire value,      .UNAVAILABLE
// passed straight through)
//   │                                         │
//   └────────────────┬────────────────────────┘
//                     ▼
//     toSnapshotPeerPossessionObservation({ peerId, publicationId,
//        contentHash, state, observedAt: now })
//
// Deliberately single-peer, and deliberately no fallback, ranking, or
// automatic retry — the identical restraint every sibling *FromPeerUseCase
// already holds: the choice of WHICH peer to ask is always the person's
// own, made once, on one specific already-selected peer.
//
// THE ONE RULE THIS FILE EXISTS TO ENFORCE: the RESULT of `execute()` is an
// OBSERVATION, never a placement, never a materialization, and never
// written anywhere durable. This class takes no publication catalog, no
// content store, and no placement catalog as a dependency — there is
// nothing here FOR it to write to. A caller that wants to turn "the peer
// reports AVAILABLE" into actually possessing the bytes makes an entirely
// separate, entirely explicit "Get Snapshot from Peer" click, through
// application/MaterializeSnapshotFromPeerUseCase.js, unchanged — this class
// never calls it, never suggests calling it, and never runs it
// automatically on a caller's behalf. See docs/Principles.md, "Peer
// Possession Responses Are Observations, Not Placement Claims (0.8.40)."
export class ObservePeerSnapshotPossessionUseCase {
    // possessionPeerExchange: an application/
    // PublicationSnapshotPossessionPeerExchange.js instance.
    constructor(possessionPeerExchange, {
        timeoutMs = ObservePeerSnapshotPossessionUseCase.DEFAULT_TIMEOUT_MS
    } = {}) {
        if (!possessionPeerExchange
            || typeof possessionPeerExchange.requestPossession !== 'function'
            || typeof possessionPeerExchange.onPossessionReceived !== 'function') {
            throw new Error('ObservePeerSnapshotPossessionUseCase: a PublicationSnapshotPossessionPeerExchange is required');
        }
        this._exchange = possessionPeerExchange;
        this._timeoutMs = timeoutMs;
    }

    // `peer`: an already-authenticated ConnectedPeer a person explicitly
    // chose. `publicationId`/`contentHash`: the exact pair named on the
    // card a person clicked "Check with Peer" on.
    //
    // Always resolves — never rejects on a timeout or an unanswered
    // REQUEST, exactly mirroring application/
    // MaterializeSnapshotFromPeerUseCase.js's own identical restraint —
    // to a frozen application/SnapshotPeerPossessionObservation.js record.
    async execute({ peer, publicationId, contentHash } = {}) {
        if (!peer) {
            throw new Error('ObservePeerSnapshotPossessionUseCase: execute() requires a peer');
        }
        if (!publicationId || typeof publicationId !== 'string') {
            throw new Error('ObservePeerSnapshotPossessionUseCase: execute() requires a publicationId');
        }
        if (!contentHash || typeof contentHash !== 'string') {
            throw new Error('ObservePeerSnapshotPossessionUseCase: execute() requires a contentHash');
        }

        const wireState = await this._requestAndWait(peer, publicationId, contentHash);
        const state = wireState === PeerSnapshotPossessionWireState.AVAILABLE ? SnapshotPeerPossessionState.AVAILABLE
            : wireState === PeerSnapshotPossessionWireState.NOT_AVAILABLE ? SnapshotPeerPossessionState.NOT_AVAILABLE
            : SnapshotPeerPossessionState.UNAVAILABLE;

        return toSnapshotPeerPossessionObservation({
            peerId: peer.connectionId || null,
            publicationId,
            contentHash,
            state,
            observedAt: new Date()
        });
    }

    // Identical wait-for-one-matching-response shape to application/
    // MaterializeSnapshotFromPeerUseCase.js#_requestAndWait(), resolving to
    // the raw wire state string (or `null` on timeout) rather than bytes.
    // Subscribes BEFORE sending the request, so a same-tick reply (e.g. in
    // a test double) can never race ahead of this class listening for it.
    // Matches on `peerId` as well as `publicationId`/`contentHash` — unlike
    // content transfer, a shared peer/PeerMessageBus.js may have several
    // possession checks against DIFFERENT peers in flight for the identical
    // contentHash at once, and this call must only ever resolve to the ONE
    // peer it actually asked.
    _requestAndWait(peer, publicationId, contentHash) {
        return new Promise((resolve) => {
            let settled = false;
            let timer = null;
            const finish = (state) => {
                if (settled) return;
                settled = true;
                if (timer) clearTimeout(timer);
                unsubscribe();
                resolve(state);
            };
            const unsubscribe = this._exchange.onPossessionReceived(({ peerId, publicationId: receivedPublicationId, contentHash: receivedHash, state }) => {
                if (receivedHash === contentHash && receivedPublicationId === publicationId && (!peer.connectionId || peerId === peer.connectionId)) {
                    finish(state);
                }
            });
            timer = setTimeout(() => finish(null), this._timeoutMs);
            try {
                this._exchange.requestPossession(peer, { publicationId, contentHash });
            } catch {
                finish(null);
            }
        });
    }
}

// Same default as every sibling *FromPeerUseCase's own DEFAULT_TIMEOUT_MS —
// this class asks exactly one peer, so this is simply the one wait a caller
// experiences per click.
ObservePeerSnapshotPossessionUseCase.DEFAULT_TIMEOUT_MS = 8000;
