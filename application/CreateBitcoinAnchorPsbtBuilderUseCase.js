import { BitcoinAnchorPsbtBuilder } from '../anchoring/BitcoinAnchorPsbtBuilder.js';

// 0.8.48 — Bitcoin Anchor PSBT Construction.
//
// The identical composition-root shape application/
// CreateBitcoinAnchorTransactionBuilderUseCase.js already established, so
// a caller can obtain a real BitcoinAnchorPsbtBuilder without ever
// importing anchoring/BitcoinAnchorPsbtBuilder.js directly. Unlike its
// 0.8.47 sibling, this builder carries no fee/dust policy of its own —
// it is a pure, stateless transform of an already-built plan — so this
// use case takes no arguments at all.
export class CreateBitcoinAnchorPsbtBuilderUseCase {
    execute() {
        const bitcoinAnchorPsbtBuilder = new BitcoinAnchorPsbtBuilder();

        return { bitcoinAnchorPsbtBuilder };
    }
}
