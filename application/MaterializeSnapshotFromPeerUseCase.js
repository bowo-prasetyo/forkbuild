import { StoreSnapshotContentOutcome } from './StoreSnapshotContentOutcome.js';
import { SnapshotMaterializationSourceKind } from './SnapshotMaterializationSourceKind.js';
import { PeerSnapshotMaterializationOutcome } from './PeerSnapshotMaterializationOutcome.js';

// 0.8.37 — Explicit Peer Snapshot Content Transfer.
//
// application/MaterializeSnapshotFromPlacementUseCase.js (0.8.35) turns an
// explicitly CHOSEN, already-resolved placement into local possession by
// running resolution, then handing successfully retrieved bytes to
// application/StoreSnapshotContentUseCase.js. This class is its
// peer-backed sibling: it turns an explicitly CHOSEN peer, asked about an
// explicitly CHOSEN content hash, into local possession, by running
// application/PublicationSnapshotContentPeerExchange.js's own
// request/response transport and, only once a RESPONSE actually arrives,
// adding exactly the one step that transport never takes itself: handing
// the received bytes to the SAME shared storage boundary application/
// ImportPublicationSnapshotTransferPackageUseCase.js (0.8.32) and
// application/MaterializeSnapshotFromPlacementUseCase.js (0.8.35) already
// share.
//
//   peer (an already-authenticated ConnectedPeer a person explicitly
//         selected), publicationId, contentHash
//        │
//        ▼
//   exchange.request(peer, { publicationId, contentHash })   (application/
//        │                                                    PublicationSnapshotContentPeerExchange.js
//        │                                                    — UNVERIFIED transport only)
//   ┌────┴─────────────────────────────────────┐
//   │ a verified-content event for              │ nothing arrives before
//   │ THIS contentHash arrives                  │ timeoutMs elapses
//   ▼                                            ▼
// storeSnapshotContentUseCase.execute(       PeerSnapshotMaterializationOutcome
//   { contentHash, bytes })                  .UNAVAILABLE
//   │                    │
//   │ HASH_MISMATCH      │ STORED / ALREADY_AVAILABLE
//   ▼                    ▼
// HASH_MISMATCH      STORED / ALREADY_AVAILABLE
// (nothing stored)   (mapped straight through)
//
// THE ONE RULE THIS FILE EXISTS TO ENFORCE, restated from application/
// StoreSnapshotContentUseCase.js's own header for a THIRD caller now: the
// bytes application/PublicationSnapshotContentPeerExchange.js#
// onContentReceived() hands this class are UNVERIFIED — a peer being
// AUTHENTICATED never made them trustworthy, only reachable. The ONLY
// thing that ever makes them trustworthy is handing them, unchanged, to
// application/StoreSnapshotContentUseCase.js, which recomputes the hash of
// exactly the bytes received and checks it against exactly the
// `contentHash` this class itself asked for. This class never verifies
// anything itself, and never stores anything outside that one call.
//
// Deliberately single-peer, and deliberately no fallback or ranking. This
// class never discovers a peer, never selects a "best" or "preferred" one
// among several connected, never tries a second peer after the first
// times out, and never retries automatically. The choice of WHICH peer to
// ask is always made by the person clicking "Get Snapshot from Peer" on
// one specific peer, exactly mirroring the identical single-placement
// restraint application/MaterializeSnapshotFromPlacementUseCase.js's own
// header already holds one axis over. See docs/Principles.md, "Peer
// Content Transfer Is Transport; Verification And Storage Stay Centralized
// (0.8.37)."
//
// Deliberately never modifies a publication, an anchor, or a placement,
// never creates a placement recording where these bytes came from, and
// never announces or re-gossips anything as a side effect of receiving
// them — possessing bytes and knowing a locator remain two independently
// true (or false) facts, exactly as 0.8.32's own header already
// establishes one axis over.
export class MaterializeSnapshotFromPeerUseCase {
    // peerSnapshotContentPeerExchange: an application/
    // PublicationSnapshotContentPeerExchange.js instance.
    // storeSnapshotContentUseCase: an application/
    // StoreSnapshotContentUseCase.js instance — the ONE shared boundary
    // application/ImportPublicationSnapshotTransferPackageUseCase.js and
    // application/MaterializeSnapshotFromPlacementUseCase.js are already
    // wired against, never a second, disconnected one.
    // publicationCatalog: an application/LocalPublicationCatalog.js
    // instance, used ONLY to report whether `publicationId` is known to
    // this replica right now — read-only, never a precondition.
    constructor(peerSnapshotContentPeerExchange, storeSnapshotContentUseCase, publicationCatalog, {
        timeoutMs = MaterializeSnapshotFromPeerUseCase.DEFAULT_TIMEOUT_MS
    } = {}) {
        if (!peerSnapshotContentPeerExchange
            || typeof peerSnapshotContentPeerExchange.request !== 'function'
            || typeof peerSnapshotContentPeerExchange.onContentReceived !== 'function') {
            throw new Error('MaterializeSnapshotFromPeerUseCase: a PublicationSnapshotContentPeerExchange is required');
        }
        if (!storeSnapshotContentUseCase || typeof storeSnapshotContentUseCase.execute !== 'function') {
            throw new Error('MaterializeSnapshotFromPeerUseCase: a StoreSnapshotContentUseCase is required');
        }
        if (!publicationCatalog || typeof publicationCatalog.get !== 'function') {
            throw new Error('MaterializeSnapshotFromPeerUseCase: a publication catalog is required');
        }
        this._exchange = peerSnapshotContentPeerExchange;
        this._storeSnapshotContentUseCase = storeSnapshotContentUseCase;
        this._publicationCatalog = publicationCatalog;
        this._timeoutMs = timeoutMs;
    }

    // `peer`: an already-authenticated ConnectedPeer a person explicitly
    // chose — never looked up or selected by this class itself.
    // `publicationId`/`contentHash`: the exact pair named on the card a
    // person clicked "Get Snapshot from Peer" on.
    //
    // Returns `{ outcome, publicationId, contentHash, contentReference,
    // publicationKnown, reason, source }`:
    //   outcome           — one of application/
    //                        PeerSnapshotMaterializationOutcome.js's own
    //                        four values
    //   contentReference  — the core/ContentReference.js this replica now
    //                        holds bytes under (STORED/ALREADY_AVAILABLE),
    //                        or null otherwise
    //   publicationKnown  — whether this replica's own publication catalog
    //                        already has an envelope for `publicationId`
    //                        RIGHT NOW
    //   reason            — a plain-language note on UNAVAILABLE/
    //                        HASH_MISMATCH; null on STORED/ALREADY_AVAILABLE
    //   source            — `{ kind: SnapshotMaterializationSourceKind.PEER }`,
    //                        always this same value, on every outcome
    async execute({ peer, publicationId, contentHash } = {}) {
        if (!peer) {
            throw new Error('MaterializeSnapshotFromPeerUseCase: execute() requires a peer');
        }
        if (!publicationId || typeof publicationId !== 'string') {
            throw new Error('MaterializeSnapshotFromPeerUseCase: execute() requires a publicationId');
        }
        if (!contentHash || typeof contentHash !== 'string') {
            throw new Error('MaterializeSnapshotFromPeerUseCase: execute() requires a contentHash');
        }

        const publicationKnown = Boolean(this._publicationCatalog.get(publicationId));
        const source = Object.freeze({ kind: SnapshotMaterializationSourceKind.PEER });

        const bytes = await this._requestAndWait(peer, publicationId, contentHash);
        if (bytes === null) {
            return {
                outcome: PeerSnapshotMaterializationOutcome.UNAVAILABLE,
                publicationId, contentHash, contentReference: null, publicationKnown,
                reason: 'The selected peer did not supply verified content before the request timed out. '
                    + 'It may not currently hold these bytes, or may be unreachable.',
                source
            };
        }

        const stored = await this._storeSnapshotContentUseCase.execute({ contentHash, bytes });
        if (stored.outcome === StoreSnapshotContentOutcome.HASH_MISMATCH) {
            return {
                outcome: PeerSnapshotMaterializationOutcome.HASH_MISMATCH,
                publicationId, contentHash, contentReference: null, publicationKnown,
                reason: "The selected peer supplied bytes that do not match this snapshot's own claimed content hash.",
                source
            };
        }

        return {
            outcome: stored.outcome === StoreSnapshotContentOutcome.ALREADY_AVAILABLE
                ? PeerSnapshotMaterializationOutcome.ALREADY_AVAILABLE
                : PeerSnapshotMaterializationOutcome.STORED,
            publicationId, contentHash, contentReference: stored.contentReference, publicationKnown,
            reason: null,
            source
        };
    }

    // Identical wait-for-one-verified-response shape to application/
    // PeerContentRetrievalCoordinator.js#_requestFrom() (0.7.6), resolving
    // to the RECEIVED BYTES rather than a boolean — this class, unlike
    // that one, still has to hand them to application/
    // StoreSnapshotContentUseCase.js itself. Subscribes BEFORE sending the
    // request, so a same-tick reply (e.g. in a test double) can never race
    // ahead of this class listening for it.
    _requestAndWait(peer, publicationId, contentHash) {
        return new Promise((resolve) => {
            let settled = false;
            let timer = null;
            const finish = (bytes) => {
                if (settled) return;
                settled = true;
                if (timer) clearTimeout(timer);
                unsubscribe();
                resolve(bytes);
            };
            const unsubscribe = this._exchange.onContentReceived(({ contentHash: receivedHash, bytes }) => {
                if (receivedHash === contentHash) {
                    finish(bytes);
                }
            });
            timer = setTimeout(() => finish(null), this._timeoutMs);
            try {
                this._exchange.request(peer, { publicationId, contentHash });
            } catch {
                finish(null);
            }
        });
    }
}

// Same default as application/PeerContentRetrievalCoordinator.js's own
// DEFAULT_TIMEOUT_MS (0.7.6) — this class asks exactly one peer, so unlike
// that coordinator's per-candidate cost, this is simply the one wait a
// caller experiences per click.
MaterializeSnapshotFromPeerUseCase.DEFAULT_TIMEOUT_MS = 8000;
