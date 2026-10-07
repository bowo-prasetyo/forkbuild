import { BlurtReadingConfiguration, blurtProofNodesFor } from '../../core/BlurtReadingConfiguration.js';
import { createBlurtRpcClient } from '../../blurt/BlurtRpcClient.js';
import { createBlurtDiscoveryReader } from './BlurtDiscoveryReader.js';
import { createBlurtPoster } from './BlurtPoster.js';
import { createBlurtFeeEstimator } from './BlurtFeeEstimator.js';
import { BlurtPublicationDiscoveryQueryService } from './BlurtPublicationDiscoveryQueryService.js';
import { BlurtSnapshotDiscoveryQueryService } from './BlurtSnapshotDiscoveryQueryService.js';
import { BlurtPlaceNamingDiscoverySource } from './BlurtPlaceNamingDiscoverySource.js';
import { BlurtPublicationDiscoveryPublisher } from './BlurtPublicationDiscoveryPublisher.js';
import { BlurtSnapshotDiscoveryPublisher } from './BlurtSnapshotDiscoveryPublisher.js';
import { BlurtPlaceNamingDiscoveryPublisher } from './BlurtPlaceNamingDiscoveryPublisher.js';
import { PublicationCommentaryBlurtDistribution } from './PublicationCommentaryBlurtDistribution.js';
import { BlurtContentStore } from '../../content/BlurtContentStore.js';
import { BlurtWorldEncounterMaterialResolver } from '../worldEncounter/BlurtWorldEncounterMaterialResolver.js';
import { BlurtAnchorPublisher } from '../../anchoring/BlurtAnchorPublisher.js';
import { BlurtProofVerifier } from '../../anchoring/BlurtProofVerifier.js';
import { BlurtAnchorEvidenceView } from '../../anchoring/BlurtAnchorEvidenceView.js';
import { BlurtAnchorFinalityObserver } from '../../anchoring/BlurtAnchorFinalityObserver.js';

// Everything ForkBuild does on Blurt (docs/Protocol.md, "Proposed: Blurt
// Substrate"), from the saved Blurt settings (or the defaults): one reader
// and one poster, each family's reader and publisher over them, the content
// store, and the `blurt` anchor type's publisher, verifier, evidence view and
// finality observer. Reading needs no Blurt account; posting asks
// `getAccount()` and `getBroadcaster()` each time, so an account set later,
// or a Keychain that appears after load, is picked up. `knownAuthors`,
// `postRecords` and `contentUploads` are the device's stores
// (storage/Blurt*Store.js); each is optional.
export function composeBlurtRuntime({
    configuration = new BlurtReadingConfiguration(),
    fetchImpl = globalThis.fetch,
    getAccount = () => null,
    getBroadcaster = () => undefined,
    appVersion = null,
    knownAuthors = null,
    postRecords = null,
    contentUploads = null,
    contentUploadProgress = null,
    describePublication = null,
    onWaiting = null
} = {}) {
    if (typeof fetchImpl !== 'function') return null;
    const rpc = createBlurtRpcClient({ nodes: [...configuration.apiNodes], fetchImpl });
    const reader = createBlurtDiscoveryReader({ rpc, knownAuthors });
    const poster = createBlurtPoster({ rpc, getAccount, getBroadcaster, appVersion, records: postRecords, onWaiting });
    return Object.freeze({
        configuration,
        reader,
        poster,
        publicationDiscoveryQueryService: new BlurtPublicationDiscoveryQueryService({ reader }),
        snapshotDiscoveryQueryService: new BlurtSnapshotDiscoveryQueryService({ reader }),
        placeNamingDiscoverySource: new BlurtPlaceNamingDiscoverySource({ reader }),
        publicationDiscoveryPublisher: new BlurtPublicationDiscoveryPublisher({ poster }),
        snapshotDiscoveryPublisher: new BlurtSnapshotDiscoveryPublisher({ poster }),
        placeNamingDiscoveryPublisher: new BlurtPlaceNamingDiscoveryPublisher({ poster }),
        commentaryDistribution: new PublicationCommentaryBlurtDistribution({ reader, poster }),
        contentStore: new BlurtContentStore({
            rpc,
            poster,
            uploads: contentUploads,
            estimator: createBlurtFeeEstimator({ rpc }),
            progress: contentUploadProgress,
            describePublication
        }),
        publicationMaterialResolver: new BlurtWorldEncounterMaterialResolver({ rpc }),
        anchorPublisher: new BlurtAnchorPublisher({ poster, rpc }),
        proofVerifier: new BlurtProofVerifier({ nodes: blurtProofNodesFor(configuration.apiNodes), fetchImpl }),
        anchorEvidenceView: new BlurtAnchorEvidenceView(),
        anchorFinalityObserver: new BlurtAnchorFinalityObserver({ rpc })
    });
}
