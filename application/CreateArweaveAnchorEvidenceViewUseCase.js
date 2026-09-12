import { ArweaveAnchorEvidenceView } from '../anchoring/ArweaveAnchorEvidenceView.js';

// 0.9.425 — Arweave Proof/Anchoring Provider Implementation.
//
// Mirrors application/CreateBitcoinAnchorEvidenceViewUseCase.js's own
// shape exactly, so ui/main.js gets a concrete ArweaveAnchorEvidenceView
// without ever importing anchoring/ArweaveAnchorEvidenceView.js directly.
// Like its Bitcoin counterpart, this adapter has no network client or
// gateway to inject — it is a pure presentation transform — so this use
// case takes no options at all.
export class CreateArweaveAnchorEvidenceViewUseCase {
    execute() {
        const arweaveAnchorEvidenceView = new ArweaveAnchorEvidenceView();
        return { arweaveAnchorEvidenceView };
    }
}
