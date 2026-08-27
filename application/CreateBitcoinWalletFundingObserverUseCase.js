import { BitcoinWalletFundingObserver } from '../anchoring/BitcoinWalletFundingObserver.js';

// 0.8.60 — Explicit Bitcoin Anchor Funding & Address Preparation.
//
// The identical composition-root shape application/
// CreateBitcoinAnchorConfirmationObserverUseCase.js (0.8.54) already
// established, so a caller can obtain a real BitcoinWalletFundingObserver
// without ever importing anchoring/BitcoinWalletFundingObserver.js
// directly. The caller still supplies the `fundingSource` itself — this use
// case wires the domain class, never the network capability behind it (see
// anchoring/BitcoinWalletFundingObserver.js's own header on why that stays
// entirely the caller's own, real or fake).
export class CreateBitcoinWalletFundingObserverUseCase {
    execute({ fundingSource } = {}) {
        const bitcoinWalletFundingObserver = new BitcoinWalletFundingObserver({ fundingSource });

        return { bitcoinWalletFundingObserver };
    }
}
