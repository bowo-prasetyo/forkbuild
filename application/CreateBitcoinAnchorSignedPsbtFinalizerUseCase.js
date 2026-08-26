import { BitcoinAnchorSignedPsbtFinalizer } from '../anchoring/BitcoinAnchorSignedPsbtFinalizer.js';

// 0.8.51 — Bitcoin Signed PSBT Finalization & Cryptographic Signature
// Verification.
//
// The identical composition-root shape application/
// CreateBitcoinAnchorSignedPsbtInspectorUseCase.js already established, so
// a caller can obtain a real BitcoinAnchorSignedPsbtFinalizer without ever
// importing anchoring/BitcoinAnchorSignedPsbtFinalizer.js directly. Like
// its 0.8.50 sibling, the finalizer carries no policy or capability of its
// own to inject — it is a pure, offline cryptographic check — so this use
// case takes no arguments at all.
export class CreateBitcoinAnchorSignedPsbtFinalizerUseCase {
    execute() {
        const bitcoinAnchorSignedPsbtFinalizer = new BitcoinAnchorSignedPsbtFinalizer();

        return { bitcoinAnchorSignedPsbtFinalizer };
    }
}
