import { BitcoinEsploraTransactionConfirmationObserver } from '../../../anchoring/BitcoinEsploraTransactionConfirmationObserver.js';
import { BitcoinEsploraTransactionConfirmationObserverFailover } from '../../../anchoring/BitcoinEsploraFailover.js';

// 0.8.54 — Bitcoin Anchor Confirmation Observation.
//
// Mirrors application/anchoring/bitcoin/CreateBitcoinEsploraTransactionBroadcasterUseCase.js
// (0.8.52) exactly, for the identical reason — a composition root ui/ or
// tests/ uses to get a concrete, real-network-backed confirmation source
// without ever importing anchoring/
// BitcoinEsploraTransactionConfirmationObserver.js directly. The result
// plugs straight into application/
// CreateBitcoinAnchorConfirmationObserverUseCase.js's own
// `confirmationSource` option.
export class CreateBitcoinEsploraTransactionConfirmationObserverUseCase {
    // `apiUrls` (two or more endpoints, in order) builds the failover
    // wrapper from anchoring/BitcoinEsploraFailover.js; otherwise one
    // adapter on `apiUrl` (or `apiUrls`' only entry).
    execute({ apiUrl, apiUrls, fetchImpl, timeoutMs } = {}) {
        const bitcoinEsploraTransactionConfirmationObserver = Array.isArray(apiUrls) && apiUrls.length > 1
            ? new BitcoinEsploraTransactionConfirmationObserverFailover({ apiUrls, fetchImpl, timeoutMs })
            : new BitcoinEsploraTransactionConfirmationObserver({ apiUrl: Array.isArray(apiUrls) && apiUrls.length === 1 ? apiUrls[0] : apiUrl, fetchImpl, timeoutMs });

        return { bitcoinEsploraTransactionConfirmationObserver };
    }
}
