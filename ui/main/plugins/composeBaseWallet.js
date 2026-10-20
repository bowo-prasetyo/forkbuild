import { CreateBaseInjectedProviderWalletAdapterUseCase } from '../../../application/anchoring/base/CreateBaseInjectedProviderWalletAdapterUseCase.js';
import { CreateBaseWalletConnectionUseCase } from '../../../application/anchoring/base/CreateBaseWalletConnectionUseCase.js';
import { CreateBaseJsonRpcClientUseCase } from '../../../application/anchoring/base/CreateBaseJsonRpcClientUseCase.js';
import { CreateBaseInjectedProviderWalletTransactionSignerUseCase } from '../../../application/anchoring/base/CreateBaseInjectedProviderWalletTransactionSignerUseCase.js';
import { CreateBaseTransactionBroadcasterUseCase } from '../../../application/anchoring/base/CreateBaseTransactionBroadcasterUseCase.js';
import { CreateBaseAnchorPublisherUseCase } from '../../../application/anchoring/base/CreateBaseAnchorPublisherUseCase.js';
import { BaseNetworkObserver } from '../../../base/BaseNetworkObserver.js';
import { BasePublicationTransactionPlanCoordinator } from '../../../application/anchoring/base/BasePublicationTransactionPlanCoordinator.js';
import { BasePublicationTransactionPlanner } from '../../../base/BasePublicationTransactionPlanner.js';
import { BaseReviewedSigningCoordinator } from '../../../application/anchoring/base/BaseReviewedSigningCoordinator.js';
import { BaseSignedTransactionFinalizationCoordinator } from '../../../application/anchoring/base/BaseSignedTransactionFinalizationCoordinator.js';
import { BaseSignedTransactionFinalizer } from '../../../base/BaseSignedTransactionFinalizer.js';
import { BaseTransactionBroadcastCoordinator } from '../../../application/anchoring/base/BaseTransactionBroadcastCoordinator.js';
import { BaseTransactionInclusionObservationCoordinator } from '../../../application/anchoring/base/BaseTransactionInclusionObservationCoordinator.js';
import { BaseTransactionInclusionObserver } from '../../../base/BaseTransactionInclusionObserver.js';

// Base's writer (core/publication/NetworkWriters.js): connecting a Base wallet, observing
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
    const baseNetworkObserver = new BaseNetworkObserver({ rpcSource: baseJsonRpcClient });

    const basePublicationTransactionPlanner = new BasePublicationTransactionPlanner({ rpcSource: baseJsonRpcClient });
    const basePublicationTransactionPlanCoordinator = new BasePublicationTransactionPlanCoordinator({ basePublicationTransactionPlanner });

    // Reads window.ethereum separately from the adapter above: connecting and
    // signing stay two separate objects.
    const { baseInjectedProviderWalletTransactionSigner } = new CreateBaseInjectedProviderWalletTransactionSignerUseCase().execute({
        injectedProvider: (typeof window !== 'undefined' && window.ethereum) ? window.ethereum : null
    });
    const baseReviewedSigningCoordinator = new BaseReviewedSigningCoordinator();

    const baseSignedTransactionFinalizer = new BaseSignedTransactionFinalizer();
    const baseSignedTransactionFinalizationCoordinator = new BaseSignedTransactionFinalizationCoordinator({ baseSignedTransactionFinalizer });

    const { baseTransactionBroadcaster } = new CreateBaseTransactionBroadcasterUseCase().execute({
        rpcSource: baseJsonRpcClient
    });
    const baseTransactionBroadcastCoordinator = new BaseTransactionBroadcastCoordinator({ baseTransactionBroadcaster });

    // Deliberately not registered into the shared anchor publisher registry (see
    // anchoring/BaseAnchorPublisher.js).
    const { baseAnchorPublisher } = new CreateBaseAnchorPublisherUseCase().execute({
        baseTransactionBroadcaster,
        createPublicationAnchorUseCase
    });

    const baseTransactionInclusionObserver = new BaseTransactionInclusionObserver({ rpcSource: baseJsonRpcClient });
    const baseTransactionInclusionObservationCoordinator = new BaseTransactionInclusionObservationCoordinator({ baseTransactionInclusionObserver });

    return {
        baseWalletConnection, baseNetworkObserver, basePublicationTransactionPlanCoordinator,
        baseInjectedProviderWalletTransactionSigner, baseReviewedSigningCoordinator,
        baseSignedTransactionFinalizationCoordinator, baseTransactionBroadcastCoordinator,
        baseAnchorPublisher, baseTransactionInclusionObservationCoordinator
    };
}
