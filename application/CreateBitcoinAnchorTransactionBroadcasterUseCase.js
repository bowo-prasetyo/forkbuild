import { BitcoinAnchorTransactionBroadcaster } from '../anchoring/BitcoinAnchorTransactionBroadcaster.js';

// 0.8.52 — Bitcoin Anchor Transaction Broadcasting.
//
// The identical composition-root shape application/
// CreateBitcoinAnchorPublisherUseCase.js already established, so a caller
// can obtain a real BitcoinAnchorTransactionBroadcaster without ever
// importing anchoring/BitcoinAnchorTransactionBroadcaster.js directly. The
// caller still supplies the `broadcaster` itself — this use case wires the
// domain class, never the network capability behind it (see anchoring/
// BitcoinAnchorTransactionBroadcaster.js's own header on why that stays
// entirely the caller's own, real or fake).
export class CreateBitcoinAnchorTransactionBroadcasterUseCase {
    execute({ broadcaster } = {}) {
        const bitcoinAnchorTransactionBroadcaster = new BitcoinAnchorTransactionBroadcaster({ broadcaster });

        return { bitcoinAnchorTransactionBroadcaster };
    }
}
