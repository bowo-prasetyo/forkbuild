import { CreatePublicationCatalogUseCase } from './CreatePublicationCatalogUseCase.js';
import { PublicationPeerExchange } from './PublicationPeerExchange.js';
import { PublicationPeerConnectionSync } from './PublicationPeerConnectionSync.js';

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
// Deliberately NOT wired into application/CreateWorldViewUseCase.js —
// see docs/Roadmap.md, 0.7.3, "Deliberately excluded." (0.7.5 later did
// wire this composition root into ui/main.js itself, once a Discovery UI
// existed for a live peer announcement to feed.)
//
// 0.9.342 — Automatic Peer Publication Connection Sync additionally
// composes a PublicationPeerConnectionSync here, alongside — never
// inside — the PublicationPeerExchange above, the same "wrap, do not
// modify" shape application/PublicationCommentaryNotificationProducer.js
// already established one domain over. See that class's own header for
// the full seam: it reuses `catalog.list()`/`peerExchange.announce()`/
// `connectedPeerRegistry.onChange()` completely unchanged, with no new
// wire format, message kind, or content-transfer concern. Returned as
// `connectionSync` purely so a caller (or a test) can `dispose()` it;
// ui/main.js does not need to hold onto it for it to keep running, the
// same way it already never holds onto PublicationPeerExchange's own
// internal registry subscription.
export class CreatePublicationPeerExchangeUseCase {
    execute({ peerMessageBus, connectedPeerRegistry } = {}) {
        const { catalog, exchange, verifier } = new CreatePublicationCatalogUseCase().execute();
        const peerExchange = new PublicationPeerExchange(exchange, peerMessageBus, connectedPeerRegistry);
        const connectionSync = new PublicationPeerConnectionSync(catalog, peerExchange, connectedPeerRegistry);

        return { catalog, exchange, peerExchange, connectionSync, verifier };
    }
}
