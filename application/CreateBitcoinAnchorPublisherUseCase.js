import { BitcoinAnchorPublisher } from '../anchoring/BitcoinAnchorPublisher.js';

// 0.8.9 — Bitcoin Anchor Creation Adapter.
//
// Mirrors application/CreateBitcoinAnchorProofVerifierUseCase.js's own
// shape exactly, for the identical reason — a composition root ui/ or
// tests/ uses to get a concrete BitcoinAnchorPublisher without ever
// importing anchoring/BitcoinAnchorPublisher.js directly. The caller
// still supplies the `broadcaster` itself — this use case wires the
// publisher, never the wallet/transaction capability behind it (see
// anchoring/BitcoinAnchorPublisher.js's own header on why that stays
// entirely the caller's own, real or fake).
export class CreateBitcoinAnchorPublisherUseCase {
    execute({ network, broadcaster } = {}) {
        const bitcoinAnchorPublisher = new BitcoinAnchorPublisher({ network, broadcaster });

        return { bitcoinAnchorPublisher };
    }
}
