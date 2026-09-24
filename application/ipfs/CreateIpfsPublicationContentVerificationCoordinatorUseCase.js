import { IpfsPublicationContentVerificationCoordinator } from './IpfsPublicationContentVerificationCoordinator.js';

// 0.8.70 — IPFS Publication & Content Verification UI.
//
// The identical composition-root shape application/
// CreateBitcoinAnchorBroadcastCoordinatorUseCase.js (0.8.64) already
// established — `ipfsPublicationContentVerifier` is taken as a
// parameter, never constructed here, so a composition root (ui/main.js,
// or a test) supplies the SAME already-built verifier application/
// CreateIpfsPublicationContentVerifierUseCase.js (0.8.69) produced,
// rather than a second, disconnected instance.
export class CreateIpfsPublicationContentVerificationCoordinatorUseCase {
    execute({ ipfsPublicationContentVerifier } = {}) {
        const coordinator = new IpfsPublicationContentVerificationCoordinator({ ipfsPublicationContentVerifier });
        return { coordinator };
    }
}
