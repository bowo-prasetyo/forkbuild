import { BitcoinEsploraWalletFundingSource } from '../../../anchoring/BitcoinEsploraWalletFundingSource.js';
import { BitcoinEsploraWalletFundingSourceFailover } from '../../../anchoring/BitcoinEsploraFailover.js';

// 0.8.60 — Explicit Bitcoin Anchor Funding & Address Preparation.
//
// Mirrors application/anchoring/bitcoin/CreateBitcoinEsploraTransactionConfirmationObserverUseCase.js
// (0.8.54) exactly, for the identical reason — a composition root ui/ or
// tests/ uses to get a concrete, real-network-backed funding source without
// ever importing anchoring/BitcoinEsploraWalletFundingSource.js directly.
// The result plugs straight into application/
// CreateBitcoinWalletFundingObserverUseCase.js's own `fundingSource` option.
export class CreateBitcoinEsploraWalletFundingSourceUseCase {
    // `apiUrls` (two or more endpoints, in order) builds the failover
    // wrapper from anchoring/BitcoinEsploraFailover.js; otherwise one
    // adapter on `apiUrl` (or `apiUrls`' only entry).
    execute({ apiUrl, apiUrls, fetchImpl, timeoutMs } = {}) {
        const bitcoinEsploraWalletFundingSource = Array.isArray(apiUrls) && apiUrls.length > 1
            ? new BitcoinEsploraWalletFundingSourceFailover({ apiUrls, fetchImpl, timeoutMs })
            : new BitcoinEsploraWalletFundingSource({ apiUrl: Array.isArray(apiUrls) && apiUrls.length === 1 ? apiUrls[0] : apiUrl, fetchImpl, timeoutMs });

        return { bitcoinEsploraWalletFundingSource };
    }
}
