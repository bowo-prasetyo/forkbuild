import { BitcoinAnchorConfirmationObserver } from '../anchoring/BitcoinAnchorConfirmationObserver.js';

// 0.8.54 — Bitcoin Anchor Confirmation Observation.
//
// The identical composition-root shape application/
// CreateBitcoinAnchorTransactionBroadcasterUseCase.js (0.8.52) already
// established, so a caller can obtain a real BitcoinAnchorConfirmationObserver
// without ever importing anchoring/BitcoinAnchorConfirmationObserver.js
// directly. The caller still supplies the `confirmationSource` itself —
// this use case wires the domain class, never the network capability
// behind it (see anchoring/BitcoinAnchorConfirmationObserver.js's own
// header on why that stays entirely the caller's own, real or fake).
export class CreateBitcoinAnchorConfirmationObserverUseCase {
    execute({ confirmationSource } = {}) {
        const bitcoinAnchorConfirmationObserver = new BitcoinAnchorConfirmationObserver({ confirmationSource });

        return { bitcoinAnchorConfirmationObserver };
    }
}
