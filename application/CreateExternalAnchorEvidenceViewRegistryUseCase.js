import { ExternalAnchorEvidenceViewRegistry } from './ExternalAnchorEvidenceViewRegistry.js';

// 0.8.14 — External Evidence Inspection & Locator UX.
//
// Mirrors application/CreateExternalAnchorVerifierUseCase.js's own
// `proofVerifiers` composition exactly, one axis over: a caller (ui/
// main.js) hands in whichever concrete application/
// ExternalAnchorEvidenceViewRegistry.js plugins it has — e.g. `new
// CreateBitcoinAnchorEvidenceViewUseCase().execute().bitcoinAnchorEvidenceView`
// — without this use case ever importing anchoring/
// BitcoinAnchorEvidenceView.js or any other concrete adapter itself.
// Passing none still returns a perfectly usable, empty registry: every
// anchorType simply has no type-specific presentation, and application/
// PublicationAnchorDetailView.js's own generic shape is all a caller
// ever sees.
export class CreateExternalAnchorEvidenceViewRegistryUseCase {
    execute({ evidenceViews = [] } = {}) {
        const evidenceViewRegistry = new ExternalAnchorEvidenceViewRegistry();
        for (const evidenceView of evidenceViews) {
            evidenceViewRegistry.register(evidenceView);
        }
        return { evidenceViewRegistry };
    }
}
