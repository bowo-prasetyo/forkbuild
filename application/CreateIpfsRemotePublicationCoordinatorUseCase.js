import { IpfsRemotePublicationCoordinator } from './IpfsRemotePublicationCoordinator.js';

// 0.8.68 — Explicit Remote IPFS Publishing Configuration & UX.
//
// Mirrors application/CreateBitcoinAnchorBroadcastCoordinatorUseCase.js's
// own shape, for the identical reason — a composition root (ui/main.js,
// or a test) uses this to get a real IpfsRemotePublicationCoordinator
// without ever importing application/IpfsRemotePublicationCoordinator.js
// directly. Unlike that use case, this one takes no collaborator
// parameter at all: application/IpfsRemotePublicationCoordinator.js
// needs no injected content/PinningProvider.js up front — it constructs
// one FRESH from whatever application/IpfsRemotePublishingConfiguration.js
// a person supplies at the moment of each explicit "Publish to Remote
// IPFS" click (see that coordinator's own header). ui/main.js therefore
// constructs exactly ONE shared coordinator instance at startup, the
// same way it already does for `bitcoinAnchorBroadcastCoordinator` —
// the instance holds no configuration and no credential of its own, so
// sharing it app-wide carries none of the risk sharing a connected
// wallet or a live credential would.
export class CreateIpfsRemotePublicationCoordinatorUseCase {
    execute() {
        const coordinator = new IpfsRemotePublicationCoordinator();
        return { coordinator };
    }
}
