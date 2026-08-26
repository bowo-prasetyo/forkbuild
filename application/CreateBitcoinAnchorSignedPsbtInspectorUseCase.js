import { BitcoinAnchorSignedPsbtInspector } from '../anchoring/BitcoinAnchorSignedPsbtInspector.js';

// 0.8.50 — Explicit Bitcoin Wallet Signing.
//
// The identical composition-root shape application/
// CreateBitcoinAnchorPsbtSerializerUseCase.js already established, so a
// caller can obtain a real BitcoinAnchorSignedPsbtInspector without ever
// importing anchoring/BitcoinAnchorSignedPsbtInspector.js directly. Like
// its 0.8.49 sibling, this inspector carries no policy of its own — it is
// a pure, stateless check — so this use case takes no arguments at all.
export class CreateBitcoinAnchorSignedPsbtInspectorUseCase {
    execute() {
        const bitcoinAnchorSignedPsbtInspector = new BitcoinAnchorSignedPsbtInspector();

        return { bitcoinAnchorSignedPsbtInspector };
    }
}
