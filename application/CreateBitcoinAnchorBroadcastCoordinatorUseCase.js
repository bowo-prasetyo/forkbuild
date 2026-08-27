import { BitcoinAnchorBroadcastCoordinator } from './BitcoinAnchorBroadcastCoordinator.js';

// 0.8.64 — Explicit Bitcoin Anchor Broadcast UI.
//
// The identical composition-root shape application/
// CreateBitcoinAnchorSignedPsbtFinalizationCoordinatorUseCase.js (0.8.63)
// already established, so a caller can obtain a real
// BitcoinAnchorBroadcastCoordinator without ever importing application/
// BitcoinAnchorBroadcastCoordinator.js directly. `bitcoinAnchorTransactionBroadcaster`
// is taken as a parameter, never constructed here — the SAME,
// already-existing 0.8.52 broadcaster instance a composition root
// (ui/main.js, or a test) already built once via application/
// CreateBitcoinAnchorTransactionBroadcasterUseCase.js, exactly as
// application/CreateBitcoinAnchorSignedPsbtFinalizationCoordinatorUseCase.js
// already takes its own `bitcoinAnchorSignedPsbtFinalizer` as a parameter
// rather than reconstructing it.
export class CreateBitcoinAnchorBroadcastCoordinatorUseCase {
    execute({ bitcoinAnchorTransactionBroadcaster } = {}) {
        const coordinator = new BitcoinAnchorBroadcastCoordinator({ bitcoinAnchorTransactionBroadcaster });
        return { coordinator };
    }
}
