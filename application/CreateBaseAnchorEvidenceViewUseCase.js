import { BaseAnchorEvidenceView } from '../anchoring/BaseAnchorEvidenceView.js';

// 0.9.511 — Base Anchor Evidence View.
//
// Mirrors application/CreateBitcoinAnchorEvidenceViewUseCase.js's and
// application/CreateArweaveAnchorEvidenceViewUseCase.js's own shape
// exactly, so ui/main.js gets a concrete BaseAnchorEvidenceView without
// ever importing anchoring/BaseAnchorEvidenceView.js directly. Like its
// two siblings, this adapter has no network client or RPC endpoint to
// inject — it is a pure presentation transform — so this use case takes
// no options at all.
export class CreateBaseAnchorEvidenceViewUseCase {
    execute() {
        const baseAnchorEvidenceView = new BaseAnchorEvidenceView();
        return { baseAnchorEvidenceView };
    }
}
