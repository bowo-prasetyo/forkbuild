import { BitcoinAnchorWalletSigner } from '../anchoring/BitcoinAnchorWalletSigner.js';

// 0.8.50 — Explicit Bitcoin Wallet Signing.
//
// Mirrors application/CreateBitcoinAnchorPublisherUseCase.js's own shape
// exactly, for the identical reason — a composition root ui/ or tests/
// uses to get a concrete BitcoinAnchorWalletSigner without ever importing
// anchoring/BitcoinAnchorWalletSigner.js directly. The caller still
// supplies the `wallet` itself — this use case wires the signer, never
// the wallet capability behind it (see anchoring/
// BitcoinAnchorWalletSigner.js's own header on why that stays entirely
// the caller's own, real or fake, exactly as `broadcaster` already does
// for anchoring/BitcoinAnchorPublisher.js).
export class CreateBitcoinAnchorWalletSignerUseCase {
    execute({ wallet } = {}) {
        const bitcoinAnchorWalletSigner = new BitcoinAnchorWalletSigner({ wallet });

        return { bitcoinAnchorWalletSigner };
    }
}
