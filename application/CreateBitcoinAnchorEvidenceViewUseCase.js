import { BitcoinAnchorEvidenceView } from '../anchoring/BitcoinAnchorEvidenceView.js';

// 0.8.14 — External Evidence Inspection & Locator UX.
//
// Mirrors application/CreateBitcoinAnchorProofVerifierUseCase.js's own
// shape exactly, so ui/main.js gets a concrete BitcoinAnchorEvidenceView
// without ever importing anchoring/BitcoinAnchorEvidenceView.js directly.
// Unlike anchoring/BitcoinOpReturnProofVerifier.js/anchoring/
// BitcoinAnchorPublisher.js, this adapter has no network client, API URL,
// or broadcaster to inject — it is a pure presentation transform — so
// this use case takes no options at all.
export class CreateBitcoinAnchorEvidenceViewUseCase {
    execute() {
        const bitcoinAnchorEvidenceView = new BitcoinAnchorEvidenceView();
        return { bitcoinAnchorEvidenceView };
    }
}
