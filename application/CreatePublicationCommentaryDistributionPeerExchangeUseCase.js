import { LocalStorageProvider } from '../storage/LocalStorageProvider.js';
import { PublicationCommentaryStore } from '../storage/PublicationCommentaryStore.js';
import { LocalAuthorizationVerifier } from '../identity/LocalAuthorizationVerifier.js';
import { PublicationCommentaryDistributionExchange } from './PublicationCommentaryDistributionExchange.js';
import { PublicationCommentaryDistributionPeerExchange } from './PublicationCommentaryDistributionPeerExchange.js';

// 0.9.620 — Wire Publication Commentary Peer Distribution.
//
// application/CreatePublicationAnchorPeerExchangeUseCase.js's own
// composition-root shape, applied to Commentary distribution instead of
// Anchors — closing exactly the gap 0.9.619's own Section B/C flagship
// finding measured (no composition root existed, ui/main.js never wired
// one, and application/CreatePublicationCommentaryUseCase.js was
// structurally incapable of reaching a peer).
//
//   storageProvider   (a fresh LocalStorageProvider — same underlying
//        │              window.localStorage keys application/
//        │              CreatePublicationCommentaryUseCase.js's own
//        │              PublicationCommentaryStore instance already
//        │              reads/writes, per that file's own "a second
//        │              composition, never a second source of truth"
//        │              discipline)
//        ▼
//   PublicationCommentaryStore            (0.9.243, unmodified)
//        ▼
//   PublicationCommentaryDistributionExchange   (0.9.618, unmodified —
//        │                                        signs on export,
//        │                                        verifies on import)
//        ▼
//   PublicationCommentaryDistributionPeerExchange   (0.9.618, unmodified
//                                                      — ANNOUNCE-only,
//                                                      over the injected
//                                                      peerMessageBus/
//                                                      connectedPeerRegistry)
//
// `peerMessageBus`/`connectedPeerRegistry` are passed straight through,
// never constructed here — both are shared, app-wide collaborators (see
// ui/main.js) neither PublicationCommentaryDistributionPeerExchange nor
// any sibling *PeerExchange class in this codebase ever owns.
//
// `identityProvider` is passed straight through too — the ONE app-wide
// identity instance ui/main.js already owns, never a second identity
// mechanism. PublicationCommentaryDistributionExchange's own constructor
// (0.9.618, unmodified) is what actually enforces "only the commentary's
// own author may sign it for distribution" — this file introduces no
// identity or signing logic of its own.
//
// NO NEW ABSTRACTION. This file composes four already-existing,
// already-tested classes; it adds no DistributedPublicationCommentaryStore,
// no CommentarySyncService, and no Commentary-specific lifecycle
// framework of any kind — see docs/Roadmap.md's own 0.9.620 entry.
export class CreatePublicationCommentaryDistributionPeerExchangeUseCase {
    execute({ identityProvider, peerMessageBus, connectedPeerRegistry } = {}) {
        const storageProvider = new LocalStorageProvider();
        const store = new PublicationCommentaryStore(storageProvider);
        const verifier = new LocalAuthorizationVerifier();

        const exchange = new PublicationCommentaryDistributionExchange(store, identityProvider, verifier);
        const peerExchange = new PublicationCommentaryDistributionPeerExchange(exchange, peerMessageBus, connectedPeerRegistry);

        return { store, exchange, peerExchange, verifier };
    }
}
