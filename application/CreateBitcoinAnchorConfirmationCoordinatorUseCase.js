import { BitcoinAnchorConfirmationCoordinator } from './BitcoinAnchorConfirmationCoordinator.js';

// 0.8.65 — Explicit Bitcoin Anchor Confirmation UI.
//
// The identical composition-root shape application/
// CreateBitcoinAnchorBroadcastCoordinatorUseCase.js (0.8.64) already
// established, so a caller can obtain a real BitcoinAnchorConfirmationCoordinator
// without ever importing application/BitcoinAnchorConfirmationCoordinator.js
// directly. `bitcoinAnchorConfirmationObserver` is taken as a parameter,
// never constructed here — the SAME, already-existing 0.8.54 observer
// instance a composition root (ui/main.js, or a test) already built once
// via application/CreateBitcoinAnchorConfirmationObserverUseCase.js, and
// already reused UNCHANGED by application/
// BitcoinAnchorProofReconciliationView.js (0.8.55) — never a second,
// disconnected observer instance.
export class CreateBitcoinAnchorConfirmationCoordinatorUseCase {
    execute({ bitcoinAnchorConfirmationObserver } = {}) {
        const coordinator = new BitcoinAnchorConfirmationCoordinator({ bitcoinAnchorConfirmationObserver });
        return { coordinator };
    }
}
