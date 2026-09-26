import { BitcoinEsploraTransactionBroadcaster } from '../../../anchoring/BitcoinEsploraTransactionBroadcaster.js';
import { BitcoinEsploraTransactionBroadcasterFailover } from '../../../anchoring/BitcoinEsploraFailover.js';

// 0.8.52 — Bitcoin Anchor Transaction Broadcasting.
//
// Mirrors application/anchoring/bitcoin/CreateBitcoinAnchorProofVerifierUseCase.js's own
// shape exactly, for the identical reason — a composition root ui/ or
// tests/ uses to get a concrete, real-network-backed broadcasting
// capability without ever importing anchoring/
// BitcoinEsploraTransactionBroadcaster.js directly. The result plugs
// straight into application/anchoring/bitcoin/CreateBitcoinAnchorTransactionBroadcasterUseCase.js's
// own `broadcaster` option.
export class CreateBitcoinEsploraTransactionBroadcasterUseCase {
    // `apiUrls` (two or more endpoints, in order) builds the failover
    // wrapper from anchoring/BitcoinEsploraFailover.js; otherwise one
    // adapter on `apiUrl` (or `apiUrls`' only entry).
    execute({ apiUrl, apiUrls, fetchImpl, timeoutMs } = {}) {
        const bitcoinEsploraTransactionBroadcaster = Array.isArray(apiUrls) && apiUrls.length > 1
            ? new BitcoinEsploraTransactionBroadcasterFailover({ apiUrls, fetchImpl, timeoutMs })
            : new BitcoinEsploraTransactionBroadcaster({ apiUrl: Array.isArray(apiUrls) && apiUrls.length === 1 ? apiUrls[0] : apiUrl, fetchImpl, timeoutMs });

        return { bitcoinEsploraTransactionBroadcaster };
    }
}
