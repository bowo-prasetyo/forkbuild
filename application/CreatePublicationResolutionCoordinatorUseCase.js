import { PublicationResolutionCoordinator } from './PublicationResolutionCoordinator.js';

// 0.7.5 — Decentralized Publication UX & Resolution.
//
// Takes both collaborators as parameters, constructing neither — the
// identical shape application/CreatePeerContentExchangeUseCase.js's own
// header already established, for the identical reason:
// `publicationResolver` and `peerContentExchange` already exist,
// produced by application/CreatePublicationResolverUseCase.js (or
// application/CreateIpfsPublicationResolverUseCase.js) and application/
// CreatePeerContentExchangeUseCase.js. Reconstructing separate instances
// here would give this coordinator its own, disconnected view of
// content this replica's real resolver/exchange never see. `ui/main.js`
// is the one place all three composition roots run together.
//
// `peerContentExchange` is OPTIONAL — application/
// PublicationResolutionCoordinator.js's own constructor already accepts
// `null`, for a caller that only ever needs local resolution (see that
// class's own header).
export class CreatePublicationResolutionCoordinatorUseCase {
    execute({ publicationResolver, peerContentExchange = null } = {}) {
        const coordinator = new PublicationResolutionCoordinator(publicationResolver, peerContentExchange);
        return { coordinator };
    }
}
