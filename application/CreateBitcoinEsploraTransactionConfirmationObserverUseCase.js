import { BitcoinEsploraTransactionConfirmationObserver } from '../anchoring/BitcoinEsploraTransactionConfirmationObserver.js';

// 0.8.54 — Bitcoin Anchor Confirmation Observation.
//
// Mirrors application/CreateBitcoinEsploraTransactionBroadcasterUseCase.js
// (0.8.52) exactly, for the identical reason — a composition root ui/ or
// tests/ uses to get a concrete, real-network-backed confirmation source
// without ever importing anchoring/
// BitcoinEsploraTransactionConfirmationObserver.js directly. The result
// plugs straight into application/
// CreateBitcoinAnchorConfirmationObserverUseCase.js's own
// `confirmationSource` option.
export class CreateBitcoinEsploraTransactionConfirmationObserverUseCase {
    execute({ apiUrl, fetchImpl, timeoutMs } = {}) {
        const bitcoinEsploraTransactionConfirmationObserver = new BitcoinEsploraTransactionConfirmationObserver({
            apiUrl, fetchImpl, timeoutMs
        });

        return { bitcoinEsploraTransactionConfirmationObserver };
    }
}
