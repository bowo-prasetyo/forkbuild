import { BitcoinAnchorPsbtSerializer } from '../anchoring/BitcoinAnchorPsbtSerializer.js';

// 0.8.49 — Real BIP-174 PSBT Serialization.
//
// The identical composition-root shape application/
// CreateBitcoinAnchorPsbtBuilderUseCase.js already established, so a
// caller can obtain a real BitcoinAnchorPsbtSerializer without ever
// importing anchoring/BitcoinAnchorPsbtSerializer.js directly. Like its
// 0.8.48 sibling, this serializer carries no policy of its own — it is a
// pure, stateless codec — so this use case takes no arguments at all.
export class CreateBitcoinAnchorPsbtSerializerUseCase {
    execute() {
        const bitcoinAnchorPsbtSerializer = new BitcoinAnchorPsbtSerializer();

        return { bitcoinAnchorPsbtSerializer };
    }
}
