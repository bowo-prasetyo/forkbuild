import { CreateBaseInjectedProviderWalletAdapterUseCase } from '../../../application/anchoring/base/CreateBaseInjectedProviderWalletAdapterUseCase.js';
import { CreateBaseWalletConnectionUseCase } from '../../../application/anchoring/base/CreateBaseWalletConnectionUseCase.js';
import { CreateBaseJsonRpcClientUseCase } from '../../../application/anchoring/base/CreateBaseJsonRpcClientUseCase.js';
import { CreateBaseNetworkObserverUseCase } from '../../../application/anchoring/base/CreateBaseNetworkObserverUseCase.js';
import { CreateBasePublicationTransactionPlannerUseCase } from '../../../application/anchoring/base/CreateBasePublicationTransactionPlannerUseCase.js';
import { CreateBasePublicationTransactionPlanCoordinatorUseCase } from '../../../application/anchoring/base/CreateBasePublicationTransactionPlanCoordinatorUseCase.js';
import { CreateBaseInjectedProviderWalletTransactionSignerUseCase } from '../../../application/anchoring/base/CreateBaseInjectedProviderWalletTransactionSignerUseCase.js';
import { CreateBaseReviewedSigningCoordinatorUseCase } from '../../../application/anchoring/base/CreateBaseReviewedSigningCoordinatorUseCase.js';
import { CreateBaseSignedTransactionFinalizerUseCase } from '../../../application/anchoring/base/CreateBaseSignedTransactionFinalizerUseCase.js';
import { CreateBaseSignedTransactionFinalizationCoordinatorUseCase } from '../../../application/anchoring/base/CreateBaseSignedTransactionFinalizationCoordinatorUseCase.js';
import { CreateBaseTransactionBroadcasterUseCase } from '../../../application/anchoring/base/CreateBaseTransactionBroadcasterUseCase.js';
import { CreateBaseAnchorPublisherUseCase } from '../../../application/anchoring/base/CreateBaseAnchorPublisherUseCase.js';
import { CreateBaseTransactionBroadcastCoordinatorUseCase } from '../../../application/anchoring/base/CreateBaseTransactionBroadcastCoordinatorUseCase.js';
import { CreateBaseTransactionInclusionObserverUseCase } from '../../../application/anchoring/base/CreateBaseTransactionInclusionObserverUseCase.js';
import { CreateBaseTransactionInclusionObservationCoordinatorUseCase } from '../../../application/anchoring/base/CreateBaseTransactionInclusionObservationCoordinatorUseCase.js';

// Base's writer (core/NetworkWriters.js): connecting a Base wallet, observing
// its account, and planning, signing, finalizing, broadcasting and watching a
// Base anchor transaction. Built only when this device switches Base's writer
// on (ui/main/NetworkWriterLoader.js); Base's reader (proof checks and
// evidence views) is in ui/main/composeAnchoring.js.
//
// `anchoring` is what composeAnchoring() returns. Returns the services the
// Publications page injects.
export function composeBaseWallet({ anchoring }) {
    const { createPublicationAnchorUseCase } = anchoring;

    // window.ethereum or null. The Base connection exposes an account address
    // only, never a signing capability.
    const { baseInjectedProviderWalletAdapter } = new CreateBaseInjectedProviderWalletAdapterUseCase().execute({
        injectedProvider: (typeof window !== 'undefined' && window.ethereum) ? window.ethereum : null
    });
    const { baseWalletConnection } = new CreateBaseWalletConnectionUseCase().execute({
        provider: baseInjectedProviderWalletAdapter
    });
    // Its own client, kept separate from the one Base's proof checks use.
    const { baseJsonRpcClient } = new CreateBaseJsonRpcClientUseCase().execute();
    const { baseNetworkObserver } = new CreateBaseNetworkObserverUseCase().execute({
        rpcSource: baseJsonRpcClient
    });

    const { basePublicationTransactionPlanner } = new CreateBasePublicationTransactionPlannerUseCase().execute({
        rpcSource: baseJsonRpcClient
    });
    const { coordinator: basePublicationTransactionPlanCoordinator } = new CreateBasePublicationTransactionPlanCoordinatorUseCase().execute({
        basePublicationTransactionPlanner
    });

    // Reads window.ethereum separately from the adapter above: connecting and
    // signing stay two separate objects.
    const { baseInjectedProviderWalletTransactionSigner } = new CreateBaseInjectedProviderWalletTransactionSignerUseCase().execute({
        injectedProvider: (typeof window !== 'undefined' && window.ethereum) ? window.ethereum : null
    });
    const { coordinator: baseReviewedSigningCoordinator } = new CreateBaseReviewedSigningCoordinatorUseCase().execute();

    const { baseSignedTransactionFinalizer } = new CreateBaseSignedTransactionFinalizerUseCase().execute();
    const { coordinator: baseSignedTransactionFinalizationCoordinator } = new CreateBaseSignedTransactionFinalizationCoordinatorUseCase().execute({
        baseSignedTransactionFinalizer
    });

    const { baseTransactionBroadcaster } = new CreateBaseTransactionBroadcasterUseCase().execute({
        rpcSource: baseJsonRpcClient
    });
    const { coordinator: baseTransactionBroadcastCoordinator } = new CreateBaseTransactionBroadcastCoordinatorUseCase().execute({
        baseTransactionBroadcaster
    });

    // Deliberately not registered into the shared anchor publisher registry (see
    // anchoring/BaseAnchorPublisher.js).
    const { baseAnchorPublisher } = new CreateBaseAnchorPublisherUseCase().execute({
        baseTransactionBroadcaster,
        createPublicationAnchorUseCase
    });

    const { baseTransactionInclusionObserver } = new CreateBaseTransactionInclusionObserverUseCase().execute({
        rpcSource: baseJsonRpcClient
    });
    const { coordinator: baseTransactionInclusionObservationCoordinator } = new CreateBaseTransactionInclusionObservationCoordinatorUseCase().execute({
        baseTransactionInclusionObserver
    });

    return {
        baseWalletConnection, baseNetworkObserver, basePublicationTransactionPlanCoordinator,
        baseInjectedProviderWalletTransactionSigner, baseReviewedSigningCoordinator,
        baseSignedTransactionFinalizationCoordinator, baseTransactionBroadcastCoordinator,
        baseAnchorPublisher, baseTransactionInclusionObservationCoordinator
    };
}
