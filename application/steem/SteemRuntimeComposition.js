import { SteemReadingConfiguration } from '../../core/SteemReadingConfiguration.js';
import { createSteemRpcClient } from '../../steem/SteemRpcClient.js';
import { createSteemDiscoveryThreadReader } from './SteemDiscoveryThreadReader.js';
import { createSteemAnnouncer } from './SteemAnnouncer.js';
import { SteemPublicationDiscoveryQueryService } from './SteemPublicationDiscoveryQueryService.js';
import { SteemSnapshotDiscoveryQueryService } from './SteemSnapshotDiscoveryQueryService.js';
import { SteemPlaceNamingDiscoverySource } from './SteemPlaceNamingDiscoverySource.js';
import { SteemPublicationDiscoveryPublisher } from './SteemPublicationDiscoveryPublisher.js';
import { SteemSnapshotDiscoveryPublisher } from './SteemSnapshotDiscoveryPublisher.js';
import { SteemPlaceNamingDiscoveryPublisher } from './SteemPlaceNamingDiscoveryPublisher.js';
import { PublicationCommentarySteemDistribution } from './PublicationCommentarySteemDistribution.js';
import { SteemContentStore } from '../../content/SteemContentStore.js';
import { createSteemResourceCreditEstimator } from './SteemResourceCreditEstimator.js';
import { SteemAnchorPublisher } from '../../anchoring/SteemAnchorPublisher.js';
import { SteemProofVerifier } from '../../anchoring/SteemProofVerifier.js';
import { SteemAnchorEvidenceView } from '../../anchoring/SteemAnchorEvidenceView.js';
import { SteemAnchorFinalityObserver } from '../../anchoring/SteemAnchorFinalityObserver.js';

// One thread reader and one announcer, each family's reader and publisher
// over them, and the Steem content store, from the saved Steem settings (or
// the defaults).
// Reading needs no Steem account; announcing asks `getAccount()` and
// `getBroadcaster()` at the moment it announces, so a Keychain that
// appears after load, or an account set later, is picked up. The content
// store remembers unfinished uploads in `contentUploads` and reports upload
// progress to `contentUploadProgress`, when given. The anchor publisher,
// proof verifier, evidence view and finality observer are for the `steem`
// anchor type; the verifier asks each configured API node separately.
export function composeSteemRuntime({
    configuration = new SteemReadingConfiguration(),
    fetchImpl = globalThis.fetch,
    getAccount = () => null,
    getBroadcaster = () => undefined,
    appVersion = null,
    contentUploads = null,
    contentUploadProgress = null
} = {}) {
    if (typeof fetchImpl !== 'function') return null;
    const rpc = createSteemRpcClient({ nodes: [...configuration.apiNodes], fetchImpl });
    const reader = createSteemDiscoveryThreadReader({
        rpc,
        threadAccounts: [...configuration.threadAccounts],
        earliestPeriod: configuration.earliestPeriod
    });
    // Announcements go to the first thread account's threads.
    const announcer = createSteemAnnouncer({ rpc, getAccount, getBroadcaster, threadAccount: configuration.threadAccounts[0], appVersion });
    return Object.freeze({
        configuration,
        reader,
        announcer,
        publicationDiscoveryQueryService: new SteemPublicationDiscoveryQueryService({ reader }),
        snapshotDiscoveryQueryService: new SteemSnapshotDiscoveryQueryService({ reader }),
        placeNamingDiscoverySource: new SteemPlaceNamingDiscoverySource({ reader }),
        publicationDiscoveryPublisher: new SteemPublicationDiscoveryPublisher({ announcer }),
        snapshotDiscoveryPublisher: new SteemSnapshotDiscoveryPublisher({ announcer }),
        placeNamingDiscoveryPublisher: new SteemPlaceNamingDiscoveryPublisher({ announcer }),
        commentaryDistribution: new PublicationCommentarySteemDistribution({ reader, announcer }),
        contentStore: new SteemContentStore({
            rpc,
            announcer,
            threadAccounts: [...configuration.threadAccounts],
            uploads: contentUploads,
            estimator: createSteemResourceCreditEstimator({ rpc }),
            progress: contentUploadProgress
        }),
        anchorPublisher: new SteemAnchorPublisher({ poster: announcer, rpc }),
        proofVerifier: new SteemProofVerifier({ nodes: [...configuration.apiNodes], fetchImpl }),
        anchorEvidenceView: new SteemAnchorEvidenceView(),
        anchorFinalityObserver: new SteemAnchorFinalityObserver({ rpc })
    });
}
