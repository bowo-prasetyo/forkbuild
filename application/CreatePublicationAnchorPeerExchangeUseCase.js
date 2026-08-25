import { LocalStorageProvider } from '../storage/LocalStorageProvider.js';
import { LocalPublicationAnchorCatalog } from './LocalPublicationAnchorCatalog.js';
import { LocalPublicationAnchorStore } from './LocalPublicationAnchorStore.js';
import { RestorePublicationAnchorCatalogUseCase } from './RestorePublicationAnchorCatalogUseCase.js';
import { LocalAuthorizationVerifier } from '../identity/LocalAuthorizationVerifier.js';
import { PublicationAnchorExchange } from './PublicationAnchorExchange.js';
import { PublicationAnchorPeerExchange } from './PublicationAnchorPeerExchange.js';
import { CreateAnchorKnowledgeStoreUseCase } from './CreateAnchorKnowledgeStoreUseCase.js';

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
//
// 0.8.15 — Persistent External Evidence Catalog & Restart Recovery.
//
// Now also constructs the durable application/
// LocalPublicationAnchorStore.js `catalog` delegates to, and runs
// application/RestorePublicationAnchorCatalogUseCase.js over it — ONCE,
// synchronously, before `exchange`/`peerExchange` are ever handed to a
// caller — so any record left over from a PRIOR process that no longer
// re-validates or re-verifies is pruned before this replica's UI can ever
// read it through `catalog`. Returns the restore pass's own result
// (`restoredAnchors`/`rejectedAnchors`) alongside everything this use
// case already returned, purely informational — see that class's own
// header for what each field means.
//
// 0.8.17 — Evidence Provenance & Observation Boundary. Also constructs
// and returns `knowledgeStore` (application/
// CreateAnchorKnowledgeStoreUseCase.js), wired into `peerExchange` so
// every anchor arriving over a live peer connection records how it
// arrived. See that use case's own header.
export class CreatePublicationAnchorPeerExchangeUseCase {
    execute({ peerMessageBus, connectedPeerRegistry } = {}) {
        const storageProvider = new LocalStorageProvider();
        const catalog = new LocalPublicationAnchorCatalog(storageProvider);
        const store = new LocalPublicationAnchorStore(storageProvider);
        const verifier = new LocalAuthorizationVerifier();

        const restoreResult = new RestorePublicationAnchorCatalogUseCase(store, verifier).execute();

        // 0.8.17 — Evidence Provenance & Observation Boundary. The one
        // `LocalAnchorKnowledgeStore` instance this replica uses anywhere
        // — threaded into `peerExchange` below so a live ANNOUNCE/RESPONSE
        // records PEER knowledge, and returned here so a caller (see
        // ui/main.js) can thread the SAME instance into
        // application/CreateExternalPublicationAnchorOrchestratorUseCase.js
        // (LOCAL) and, when wired, application/
        // ImportPackageAnchorsUseCase.js (PACKAGE) — one store, fed by all
        // three acquisition paths, exactly the "one instance, threaded
        // everywhere" discipline `catalog` above already holds.
        const { knowledgeStore } = new CreateAnchorKnowledgeStoreUseCase().execute();

        const exchange = new PublicationAnchorExchange(catalog, verifier);
        const peerExchange = new PublicationAnchorPeerExchange(exchange, peerMessageBus, connectedPeerRegistry, { knowledgeStore });

        return { catalog, exchange, peerExchange, verifier, restoreResult, knowledgeStore };
    }
}
