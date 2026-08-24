import { CreatePublicationCatalogUseCase } from './CreatePublicationCatalogUseCase.js';
import { PublicationPeerExchange } from './PublicationPeerExchange.js';

// 0.7.3 — Peer Publication Exchange.
//
// Wires application/CreatePublicationCatalogUseCase.js's own catalog +
// exchange pair to a live PublicationPeerExchange, so ui/ never imports
// application/PublicationExchange.js or application/
// LocalPublicationCatalog.js directly — the same composition-root shape
// application/CreatePublicationCatalogUseCase.js and application/
// CreatePublicationResolverUseCase.js already established one layer down.
//
// `peerMessageBus`/`connectedPeerRegistry` are passed straight through,
// never constructed here: both are shared, app-wide collaborators (see
// ui/main.js) that application/PublicationPeerExchange.js's own header
// already documents as never owned by it — the identical one-level-of-
// indirection application/CreateIdentityLifecyclePropagationUseCase.js
// already established for the same two collaborators, applied here to a
// third gossiped record type.
//
// Deliberately NOT wired into ui/main.js or application/
// CreateWorldViewUseCase.js by this milestone — see docs/Roadmap.md,
// 0.7.3, "Deliberately excluded." There is still no Discovery UI for a
// live peer announcement to feed; wiring this composition root into the
// app bootstrap without one would connect a transport to nothing.
export class CreatePublicationPeerExchangeUseCase {
    execute({ peerMessageBus, connectedPeerRegistry } = {}) {
        const { catalog, exchange, verifier } = new CreatePublicationCatalogUseCase().execute();
        const peerExchange = new PublicationPeerExchange(exchange, peerMessageBus, connectedPeerRegistry);

        return { catalog, exchange, peerExchange, verifier };
    }
}
