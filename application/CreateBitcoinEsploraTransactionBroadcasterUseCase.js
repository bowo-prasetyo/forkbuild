import { BitcoinEsploraTransactionBroadcaster } from '../anchoring/BitcoinEsploraTransactionBroadcaster.js';

// 0.8.52 — Bitcoin Anchor Transaction Broadcasting.
//
// Mirrors application/CreateBitcoinAnchorProofVerifierUseCase.js's own
// shape exactly, for the identical reason — a composition root ui/ or
// tests/ uses to get a concrete, real-network-backed broadcasting
// capability without ever importing anchoring/
// BitcoinEsploraTransactionBroadcaster.js directly. The result plugs
// straight into application/CreateBitcoinAnchorTransactionBroadcasterUseCase.js's
// own `broadcaster` option.
export class CreateBitcoinEsploraTransactionBroadcasterUseCase {
    execute({ apiUrl, fetchImpl, timeoutMs } = {}) {
        const bitcoinEsploraTransactionBroadcaster = new BitcoinEsploraTransactionBroadcaster({
            apiUrl, fetchImpl, timeoutMs
        });

        return { bitcoinEsploraTransactionBroadcaster };
    }
}
