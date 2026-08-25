import { LocalAuthorizationVerifier } from '../identity/LocalAuthorizationVerifier.js';
import { CreatePublicationAnchorUseCase } from './CreatePublicationAnchorUseCase.js';
import { CreateExternalPublicationAnchorUseCase } from './CreateExternalPublicationAnchorUseCase.js';
import { ExternalAnchorPublisherRegistry } from './ExternalAnchorPublisherRegistry.js';

// 0.8.10 — External Anchor Creation Orchestration & Publisher Registry.
//
// Wires the concrete authorization verifier, the 0.8.8 generic creation
// use case, and an ExternalAnchorPublisherRegistry together, and returns
// a CreateExternalPublicationAnchorUseCase — so ui/ never imports
// identity/LocalAuthorizationVerifier.js, application/
// CreatePublicationAnchorUseCase.js, or any concrete publisher directly.
// The identical composition-root shape application/
// CreateExternalAnchorVerifierUseCase.js already established for the
// verification side (0.8.1), mirrored here for creation.
//
// `publicationCatalog` and `anchorCatalog` are always caller-supplied —
// this use case wires signing/orchestration only, never storage, exactly
// as application/CreatePublicationAnchorCatalogUseCase.js already wires
// storage only and never signing. A caller obtains both from their own
// existing composition roots (application/CreatePublicationCatalogUseCase.js,
// application/CreatePublicationAnchorCatalogUseCase.js) and passes the
// SAME instances here — never a second, disconnected pair of catalogs.
//
// `publishers` (mirroring `proofVerifiers` on application/
// CreateExternalAnchorVerifierUseCase.js) is where a caller plugs in
// whichever real publishers it wants available — e.g. `new
// CreateBitcoinAnchorPublisherUseCase().execute({ broadcaster }).bitcoinAnchorPublisher`
// — without this use case ever importing anchoring/
// BitcoinAnchorPublisher.js or any other concrete adapter itself. Passing
// none still returns a perfectly usable, empty ExternalAnchorPublisherRegistry;
// every anchorType simply has no registered publisher, and `execute()`
// refuses to proceed for any of them, exactly as it would for a single
// missing publisher.
export class CreateExternalPublicationAnchorOrchestratorUseCase {
    // knowledgeStore: OPTIONAL (0.8.17) — passed straight through to
    // application/CreatePublicationAnchorUseCase.js, so a locally created
    // anchor also records its own LOCAL knowledge entry. See that class's
    // own header; this use case constructs no knowledge store of its own,
    // the same "storage lives elsewhere, wiring lives here" restraint
    // this class's own header already holds for `publicationCatalog`/
    // `anchorCatalog`.
    execute({ publicationCatalog, anchorCatalog, identityProvider, publishers = [], knowledgeStore = null } = {}) {
        const verifier = new LocalAuthorizationVerifier();
        const createPublicationAnchorUseCase = new CreatePublicationAnchorUseCase(
            publicationCatalog, identityProvider, verifier, anchorCatalog, knowledgeStore
        );
        const publisherRegistry = new ExternalAnchorPublisherRegistry();
        for (const publisher of publishers) {
            publisherRegistry.register(publisher);
        }
        const createExternalPublicationAnchorUseCase = new CreateExternalPublicationAnchorUseCase(
            publicationCatalog, publisherRegistry, createPublicationAnchorUseCase
        );

        return { createExternalPublicationAnchorUseCase, publisherRegistry, createPublicationAnchorUseCase, verifier };
    }
}
