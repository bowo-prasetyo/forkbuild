import { SteemReadingConfiguration, steemProofNodesFor } from '../../core/networks/SteemReadingConfiguration.js';
import { createSteemRpcClient } from '../../steem/SteemRpcClient.js';
import { createSteemDiscoveryThreadReader } from './SteemDiscoveryThreadReader.js';
import { SteemPublicationDiscoveryQueryService } from './SteemPublicationDiscoveryQueryService.js';
import { SteemSnapshotDiscoveryQueryService } from './SteemSnapshotDiscoveryQueryService.js';
import { SteemPlaceNamingDiscoverySource } from './SteemPlaceNamingDiscoverySource.js';
import { SteemPublicationDiscoveryPublisher } from './SteemPublicationDiscoveryPublisher.js';
import { SteemSnapshotDiscoveryPublisher } from './SteemSnapshotDiscoveryPublisher.js';
import { SteemPlaceNamingDiscoveryPublisher } from './SteemPlaceNamingDiscoveryPublisher.js';
import { PublicationCommentarySteemDistribution } from './PublicationCommentarySteemDistribution.js';
import { SteemContentStore } from '../../content/SteemContentStore.js';
import { SteemWorldEncounterMaterialResolver } from '../worldEncounter/SteemWorldEncounterMaterialResolver.js';
import { SteemProofVerifier } from '../../anchoring/SteemProofVerifier.js';
import { SteemAnchorEvidenceView } from '../../anchoring/SteemAnchorEvidenceView.js';
import { SteemAnchorFinalityObserver } from '../../anchoring/SteemAnchorFinalityObserver.js';
import { STEEM_ANCHOR_MAX_BATCH, STEEM_ANCHOR_TYPE } from '../../core/networks/SteemAnchor.js';
import { STEEM_DISCOVERY_THREAD_ACCOUNT, isSteemAccountName } from '../../core/networks/SteemDiscoveryThread.js';
import { createLazyPosting } from '../networks/LazyPosting.js';

// One thread reader and one announcer, each family's reader and publisher
// over them, and the Steem content store, from the saved Steem settings (or
// the defaults).
// Reading needs no Steem account; announcing asks `getAccount()` and
// `getBroadcaster()` at the moment it announces, so a Keychain that
// appears after load, or an account set later, is picked up. The content
// store remembers unfinished uploads in `contentUploads` and reports upload
// progress to `contentUploadProgress`, when given; it stores Snapshots and
// Signed Claims, and the publication material resolver reads Signed Claims
// back for World discovery. The anchor publisher,
// proof verifier, evidence view and finality observer are for the `steem`
// anchor type; the verifier asks each configured API node separately.
//
// What posts (application/steem/SteemPostingComposition.js) is loaded the
// first time something is posted, or when `loadPosting()` is called as the
// writer is switched on; until then the announcer, estimator and anchor
// publisher here stand in for it. `getBroadcaster` defaults to Steem
// Keychain.
export function composeSteemRuntime({
    configuration = new SteemReadingConfiguration(),
    fetchImpl = globalThis.fetch,
    getAccount = () => null,
    getBroadcaster,
    isWriterEnabled = () => true,
    appVersion = null,
    contentUploads = null,
    contentUploadProgress = null,
    describePublication = null,
    buildTagsFor = null
} = {}) {
    if (typeof fetchImpl !== 'function') return null;
    const rpc = createSteemRpcClient({ nodes: [...configuration.apiNodes], fetchImpl });
    const reader = createSteemDiscoveryThreadReader({
        rpc,
        threadAccounts: [...configuration.threadAccounts],
        earliestPeriod: configuration.earliestPeriod
    });
    // Announcements go to the first thread account's threads.
    // Nothing is posted while this device's Steem writer is switched off
    // (core/publication/NetworkWriters.js); reading never asks.
    const threadAccount = configuration.threadAccounts[0];
    const posting = createLazyPosting(async () => {
        const { composeSteemPosting } = await import('./SteemPostingComposition.js');
        return composeSteemPosting({ rpc, getAccount, getBroadcaster, isEnabled: isWriterEnabled, threadAccount, appVersion });
    });
    const posted = (part, method) => async (...args) => (await posting.get())[part][method](...args);
    const announcer = Object.freeze({
        announce: posted('announcer', 'announce'),
        postContent: posted('announcer', 'postContent'),
        postContentPart: posted('announcer', 'postContentPart'),
        postAnchor: posted('announcer', 'postAnchor'),
        // The account posts would come from right now, or null, as the
        // announcer answers it.
        currentAccount: () => {
            if (posting.loaded) return posting.loaded.announcer.currentAccount();
            if (!isWriterEnabled()) return null;
            const account = getAccount();
            return isSteemAccountName(account) ? account : null;
        },
        threadAccount: threadAccount ?? STEEM_DISCOVERY_THREAD_ACCOUNT
    });
    const estimator = Object.freeze({ estimate: posted('estimator', 'estimate') });
    const anchorPublisher = Object.freeze({
        anchorType: STEEM_ANCHOR_TYPE,
        maxBatchSize: STEEM_ANCHOR_MAX_BATCH,
        publish: posted('anchorPublisher', 'publish'),
        publishBatch: posted('anchorPublisher', 'publishBatch')
    });
    return Object.freeze({
        configuration,
        reader,
        announcer,
        loadPosting: () => posting.get(),
        publicationDiscoveryQueryService: new SteemPublicationDiscoveryQueryService({ reader }),
        snapshotDiscoveryQueryService: new SteemSnapshotDiscoveryQueryService({ reader }),
        placeNamingDiscoverySource: new SteemPlaceNamingDiscoverySource({ reader }),
        publicationDiscoveryPublisher: new SteemPublicationDiscoveryPublisher({ announcer, buildTagsFor }),
        snapshotDiscoveryPublisher: new SteemSnapshotDiscoveryPublisher({ announcer }),
        placeNamingDiscoveryPublisher: new SteemPlaceNamingDiscoveryPublisher({ announcer }),
        commentaryDistribution: new PublicationCommentarySteemDistribution({ reader, announcer }),
        contentStore: new SteemContentStore({
            rpc,
            announcer,
            threadAccounts: [...configuration.threadAccounts],
            uploads: contentUploads,
            estimator,
            progress: contentUploadProgress,
            describePublication
        }),
        publicationMaterialResolver: new SteemWorldEncounterMaterialResolver({ rpc, threadAccounts: [...configuration.threadAccounts] }),
        anchorPublisher,
        proofVerifier: new SteemProofVerifier({ nodes: steemProofNodesFor(configuration.apiNodes), fetchImpl }),
        anchorEvidenceView: new SteemAnchorEvidenceView(),
        anchorFinalityObserver: new SteemAnchorFinalityObserver({ rpc })
    });
}
