import { PublicationEvidenceCoordinator } from './PublicationEvidenceCoordinator.js';

// 0.8.3 — Publication Center: External Evidence UX.
//
// Takes both collaborators as parameters, constructing neither — the
// identical shape application/
// CreatePublicationResolutionCoordinatorUseCase.js's own header already
// established, for the identical reason: `anchorCatalog` and
// `externalAnchorVerifier` already exist, produced by application/
// CreatePublicationAnchorCatalogUseCase.js and application/
// CreateExternalAnchorVerifierUseCase.js. Reconstructing separate
// instances here would give this coordinator its own, disconnected view
// of evidence this replica's real catalog/verifier never see. ui/main.js
// is the one place all three composition roots run together.
export class CreatePublicationEvidenceCoordinatorUseCase {
    execute({ anchorCatalog, externalAnchorVerifier } = {}) {
        const coordinator = new PublicationEvidenceCoordinator(anchorCatalog, externalAnchorVerifier);
        return { coordinator };
    }
}
