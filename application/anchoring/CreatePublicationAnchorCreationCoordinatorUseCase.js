import { PublicationAnchorCreationCoordinator } from './PublicationAnchorCreationCoordinator.js';

// 0.8.11 — Explicit External Anchoring UX.
//
// Takes both collaborators as parameters, constructing neither — the
// identical shape application/CreatePublicationEvidenceCoordinatorUseCase
// .js's own header already established, for the identical reason:
// `createExternalPublicationAnchorUseCase` and `publisherRegistry`
// already exist, produced together by application/
// CreateExternalPublicationAnchorOrchestratorUseCase.js (0.8.10).
// Reconstructing either here would give this coordinator its own,
// disconnected view of which publishers are actually registered.
// ui/main.js is the one place both composition roots run together.
export class CreatePublicationAnchorCreationCoordinatorUseCase {
    execute({ createExternalPublicationAnchorUseCase, publisherRegistry } = {}) {
        const coordinator = new PublicationAnchorCreationCoordinator(createExternalPublicationAnchorUseCase, publisherRegistry);
        return { coordinator };
    }
}
