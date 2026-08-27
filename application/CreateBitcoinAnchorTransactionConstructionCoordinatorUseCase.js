import { BitcoinAnchorTransactionConstructionCoordinator } from './BitcoinAnchorTransactionConstructionCoordinator.js';

// 0.8.61 — Explicit Bitcoin Anchor Transaction Construction UI.
//
// Takes its one collaborator as a parameter, constructing none of it — the
// identical shape application/CreateBitcoinAnchorPublicationCoordinatorUseCase.js
// (0.8.53) already established, for the identical reason: a real
// `bitcoinAnchorTransactionBuilder` already exists, produced by its own
// 0.8.47 composition-root use case (application/
// CreateBitcoinAnchorTransactionBuilderUseCase.js). Reconstructing it here
// would give this coordinator its own, disconnected copy of the fee/dust
// policy a composition root (ui/main.js, or a test) already built once.
export class CreateBitcoinAnchorTransactionConstructionCoordinatorUseCase {
    execute({ bitcoinAnchorTransactionBuilder } = {}) {
        const coordinator = new BitcoinAnchorTransactionConstructionCoordinator({ bitcoinAnchorTransactionBuilder });
        return { coordinator };
    }
}
