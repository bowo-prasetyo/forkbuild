import { BitcoinEsploraWalletFundingSource } from '../anchoring/BitcoinEsploraWalletFundingSource.js';

// 0.8.60 — Explicit Bitcoin Anchor Funding & Address Preparation.
//
// Mirrors application/CreateBitcoinEsploraTransactionConfirmationObserverUseCase.js
// (0.8.54) exactly, for the identical reason — a composition root ui/ or
// tests/ uses to get a concrete, real-network-backed funding source without
// ever importing anchoring/BitcoinEsploraWalletFundingSource.js directly.
// The result plugs straight into application/
// CreateBitcoinWalletFundingObserverUseCase.js's own `fundingSource` option.
export class CreateBitcoinEsploraWalletFundingSourceUseCase {
    execute({ apiUrl, fetchImpl, timeoutMs } = {}) {
        const bitcoinEsploraWalletFundingSource = new BitcoinEsploraWalletFundingSource({
            apiUrl, fetchImpl, timeoutMs
        });

        return { bitcoinEsploraWalletFundingSource };
    }
}
