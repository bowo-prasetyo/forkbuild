import { PeerContentRetrievalCoordinator } from './PeerContentRetrievalCoordinator.js';

// 0.7.6 — Multi-Peer Publication Retrieval & Replication.
//
// Takes `peerContentExchange` as a parameter, constructing nothing else
// — the identical shape application/
// CreatePublicationResolutionCoordinatorUseCase.js's own 0.7.5 header
// already established, for the identical reason: `peerContentExchange`
// already exists, produced by application/
// CreatePeerContentExchangeUseCase.js, and this replica has exactly one
// instance of it (see ui/main.js). Reconstructing a second one here
// would give this coordinator its own, disconnected view of the wire a
// caller's real request()/onContentReceived() calls never see.
//
// Deliberately NOT wired into ui/main.js — application/
// CreatePublicationResolutionCoordinatorUseCase.js's own composition
// root already builds a application/PeerContentRetrievalCoordinator.js
// internally, around the identical `peerContentExchange` this factory
// would otherwise wrap a second time (see that class's own header on
// why a second instance is harmless but unnecessary: this coordinator
// holds no state beyond a reference to the exchange it was given).
// This factory exists for a caller that wants multi-peer content
// retrieval WITHOUT going through publication resolution at all — none
// exists yet — and for testing application/
// PeerContentRetrievalCoordinator.js in isolation, the same standalone
// purpose every other Create*UseCase in this codebase serves before its
// own first real caller arrives.
export class CreatePeerContentRetrievalCoordinatorUseCase {
    execute({ peerContentExchange } = {}) {
        const retrievalCoordinator = new PeerContentRetrievalCoordinator(peerContentExchange);
        return { retrievalCoordinator };
    }
}
