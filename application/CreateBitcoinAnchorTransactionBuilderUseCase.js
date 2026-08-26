import { BitcoinAnchorTransactionBuilder } from '../anchoring/BitcoinAnchorTransactionBuilder.js';

// 0.8.47 — Bitcoin Anchor Transaction Construction.
//
// The identical composition-root shape application/
// CreateBitcoinAnchorPublisherUseCase.js and application/
// CreateBitcoinAnchorProofVerifierUseCase.js already established, so a
// caller can obtain a real BitcoinAnchorTransactionBuilder without ever
// importing anchoring/BitcoinAnchorTransactionBuilder.js directly. This
// use case wires the builder's fee/dust POLICY only — it never supplies
// utxos, a changeAddress, or a contentHash, and never touches a wallet,
// a broadcaster, or anything network-facing.
export class CreateBitcoinAnchorTransactionBuilderUseCase {
    execute({ network, feeRateSatsPerVByte, dustThresholdSats, changeScriptType } = {}) {
        const bitcoinAnchorTransactionBuilder = new BitcoinAnchorTransactionBuilder({
            network, feeRateSatsPerVByte, dustThresholdSats, changeScriptType
        });

        return { bitcoinAnchorTransactionBuilder };
    }
}
