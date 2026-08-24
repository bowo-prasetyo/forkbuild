import { LocalStorageProvider } from '../storage/LocalStorageProvider.js';
import { LocalPublicationAnchorCatalog } from './LocalPublicationAnchorCatalog.js';
import { LocalAuthorizationVerifier } from '../identity/LocalAuthorizationVerifier.js';
import { PublicationAnchorExchange } from './PublicationAnchorExchange.js';
import { PublicationAnchorPeerExchange } from './PublicationAnchorPeerExchange.js';

// 0.8.4 — External Anchor Publication Over Peers.
//
// Wires the concrete local catalog storage and a live
// PublicationAnchorPeerExchange over it, so ui/ never imports application/
// LocalPublicationAnchorCatalog.js, application/
// PublicationAnchorExchange.js, or identity/LocalAuthorizationVerifier.js
// directly — the exact composition-root shape application/
// CreatePublicationPeerExchangeUseCase.js already established for
// publications.
//
// Returns its own `catalog` rather than reusing application/
// CreatePublicationAnchorCatalogUseCase.js's — that use case pairs a
// catalog with `AddPublicationAnchorUseCase` (structural-only, no
// signature check), while this one pairs the SAME kind of catalog with
// `PublicationAnchorExchange` (structural AND signature verification,
// the discipline a claim arriving from a stranger over a peer connection
// actually needs). A caller wiring the running app together (see
// ui/main.js) uses THIS use case's own `catalog` as the one
// LocalPublicationAnchorCatalog instance the replica uses anywhere —
// mirroring the same "one instance, threaded everywhere" discipline
// application/CreatePublicationPeerExchangeUseCase.js already holds for
// `publicationCatalog`.
//
// `peerMessageBus`/`connectedPeerRegistry` are passed straight through,
// never constructed here — both are shared, app-wide collaborators (see
// ui/main.js) application/PublicationAnchorPeerExchange.js's own header
// already documents as never owned by it.
export class CreatePublicationAnchorPeerExchangeUseCase {
    execute({ peerMessageBus, connectedPeerRegistry } = {}) {
        const storageProvider = new LocalStorageProvider();
        const catalog = new LocalPublicationAnchorCatalog(storageProvider);
        const verifier = new LocalAuthorizationVerifier();
        const exchange = new PublicationAnchorExchange(catalog, verifier);
        const peerExchange = new PublicationAnchorPeerExchange(exchange, peerMessageBus, connectedPeerRegistry);

        return { catalog, exchange, peerExchange, verifier };
    }
}
