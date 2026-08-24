import { PeerContentExchange } from './PeerContentExchange.js';

// 0.7.4 — Peer Content Retrieval.
//
// Unlike application/CreatePublicationPeerExchangeUseCase.js — which
// constructs its OWN catalog + exchange internally, because 0.7.3
// introduced no domain store of its own and only ever needed a fresh
// one to wire a transport around — this composition root takes ALL FOUR
// collaborators as parameters: `contentStore` and `publicationCatalog`
// are never constructed here. Both already exist, produced by 0.7.1's
// and 0.7.2's own composition roots (application/
// CreatePublicationResolverUseCase.js / application/
// CreateIpfsPublicationResolverUseCase.js, and application/
// CreatePublicationCatalogUseCase.js), and a caller reconstructing
// SEPARATE instances here would silently split this replica's content
// and catalog state into two halves nothing else in the app would ever
// see — bytes a peer hands over would land somewhere application/
// PublicationResolver.js never looks, and a hash this replica actually
// knows a publication for would look unauthorized to this class's own
// boundary. Passing the app's real instances through, unchanged, is the
// only wiring that keeps "ask a peer for content" and "resolve a
// publication" looking at the same store.
//
// `peerMessageBus`/`connectedPeerRegistry` are passed through for the
// identical reason application/CreatePublicationPeerExchangeUseCase.js
// already documents: both are shared, app-wide collaborators (see ui/
// main.js) this milestone does not own either.
//
// Deliberately NOT wired into ui/main.js by this milestone, mirroring
// application/CreatePublicationPeerExchangeUseCase.js's own restraint —
// see docs/Roadmap.md, 0.7.4, "Deliberately excluded." There is still no
// Discovery UI (named for 0.7.5) for a retrieved-content event to feed.
export class CreatePeerContentExchangeUseCase {
    execute({ contentStore, peerMessageBus, connectedPeerRegistry, publicationCatalog } = {}) {
        const peerContentExchange = new PeerContentExchange(contentStore, peerMessageBus, connectedPeerRegistry, publicationCatalog);

        return { peerContentExchange };
    }
}
