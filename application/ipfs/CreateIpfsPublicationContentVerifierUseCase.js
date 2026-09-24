import { IpfsPublicationContentVerifier } from './IpfsPublicationContentVerifier.js';

// 0.8.69 — IPFS Publication Record & Content-Identity Binding.
//
// Takes an already-constructed `contentStore` as a parameter, building
// none itself — the identical shape `application/
// CreateBitcoinAnchorProofReconciliationViewUseCase.js` (0.8.55) already
// established for the identical reason: a real `content/
// IpfsGatewayContentStore.js` or `content/IpfsContentStore.js` is
// composed once, by its own use case (`application/
// CreateIpfsPublicationResolverUseCase.js`, or a fresh gateway store), and
// this use case only ever wires the resulting capability into a verifier
// — never a second, disconnected copy of it.
export class CreateIpfsPublicationContentVerifierUseCase {
    execute({ contentStore } = {}) {
        const ipfsPublicationContentVerifier = new IpfsPublicationContentVerifier({ contentStore });
        return { ipfsPublicationContentVerifier };
    }
}
