import { BlurtReadingConfiguration, blurtProofNodesFor } from '../../core/networks/BlurtReadingConfiguration.js';
import { createBlurtRpcClient } from '../../blurt/BlurtRpcClient.js';
import { createBlurtDiscoveryReader } from './BlurtDiscoveryReader.js';
import { BlurtPublicationDiscoveryQueryService } from './BlurtPublicationDiscoveryQueryService.js';
import { BlurtSnapshotDiscoveryQueryService } from './BlurtSnapshotDiscoveryQueryService.js';
import { BlurtPlaceNamingDiscoverySource } from './BlurtPlaceNamingDiscoverySource.js';
import { BlurtPublicationDiscoveryPublisher } from './BlurtPublicationDiscoveryPublisher.js';
import { BlurtSnapshotDiscoveryPublisher } from './BlurtSnapshotDiscoveryPublisher.js';
import { BlurtPlaceNamingDiscoveryPublisher } from './BlurtPlaceNamingDiscoveryPublisher.js';
import { PublicationCommentaryBlurtDistribution } from './PublicationCommentaryBlurtDistribution.js';
import { BlurtContentStore } from '../../content/BlurtContentStore.js';
import { BlurtWorldEncounterMaterialResolver } from '../worldEncounter/BlurtWorldEncounterMaterialResolver.js';
import { BlurtProofVerifier } from '../../anchoring/BlurtProofVerifier.js';
import { BlurtAnchorEvidenceView } from '../../anchoring/BlurtAnchorEvidenceView.js';
import { BlurtAnchorFinalityObserver } from '../../anchoring/BlurtAnchorFinalityObserver.js';
import { BLURT_ANCHOR_MAX_BATCH, BLURT_ANCHOR_TYPE } from '../../core/networks/BlurtAnchor.js';
import { isBlurtAccountName } from '../../core/networks/BlurtPost.js';
import { createLazyPosting } from '../networks/LazyPosting.js';

// Everything ForkBuild does on Blurt (docs/Protocol.md, "Proposed: Blurt
// Substrate"), from the saved Blurt settings (or the defaults): one reader
// and one poster, each family's reader and publisher over them, the content
// store, and the `blurt` anchor type's publisher, verifier, evidence view and
// finality observer. Reading needs no Blurt account; posting asks
// `getAccount()` and `getBroadcaster()` each time, so an account set later,
// or a Keychain that appears after load, is picked up. `knownAuthors`,
// `postRecords` and `contentUploads` are the device's stores
// (storage/Blurt*Store.js); each is optional.
//
// What posts (application/blurt/BlurtPostingComposition.js) is loaded the
// first time something is posted, or when `loadPosting()` is called as the
// writer is switched on; until then the poster, estimator and anchor
// publisher here stand in for it. `getBroadcaster` defaults to Blurt
// Keychain.
export function composeBlurtRuntime({
    configuration = new BlurtReadingConfiguration(),
    fetchImpl = globalThis.fetch,
    getAccount = () => null,
    getBroadcaster,
    isWriterEnabled = () => true,
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
    // Nothing is posted while this device's Blurt writer is switched off
    // (core/publication/NetworkWriters.js); reading never asks.
    const posting = createLazyPosting(async () => {
        const { composeBlurtPosting } = await import('./BlurtPostingComposition.js');
        return composeBlurtPosting({ rpc, getAccount, getBroadcaster, isEnabled: isWriterEnabled, appVersion, records: postRecords, onWaiting });
    });
    const posted = (part, method) => async (...args) => (await posting.get())[part][method](...args);
    // The account posts would come from right now, or null, as the poster
    // answers it.
    const currentAccount = () => {
        if (posting.loaded) return posting.loaded.poster.currentAccount();
        if (!isWriterEnabled()) return null;
        const account = getAccount();
        return isBlurtAccountName(account) ? account : null;
    };
    const poster = Object.freeze({
        announce: posted('poster', 'announce'),
        postAnchor: posted('poster', 'postAnchor'),
        postBatchAnchor: posted('poster', 'postBatchAnchor'),
        postContent: posted('poster', 'postContent'),
        postContentPart: posted('poster', 'postContentPart'),
        // Before anything is posted from this load there is no build post to
        // group with, and only the saved records know a commitment.
        findCommitment: (contentHash) => {
            if (posting.loaded) return posting.loaded.poster.findCommitment(contentHash);
            const author = currentAccount();
            return author ? postRecords?.get(author, contentHash) ?? null : null;
        },
        willStartBuildPost: () => (posting.loaded ? posting.loaded.poster.willStartBuildPost() : true),
        currentAccount
    });
    const estimator = Object.freeze({ estimate: posted('estimator', 'estimate') });
    const anchorPublisher = Object.freeze({
        anchorType: BLURT_ANCHOR_TYPE,
        maxBatchSize: BLURT_ANCHOR_MAX_BATCH,
        publish: posted('anchorPublisher', 'publish'),
        publishBatch: posted('anchorPublisher', 'publishBatch')
    });
    return Object.freeze({
        configuration,
        reader,
        poster,
        loadPosting: () => posting.get(),
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
            estimator,
            progress: contentUploadProgress,
            describePublication
        }),
        publicationMaterialResolver: new BlurtWorldEncounterMaterialResolver({ rpc }),
        anchorPublisher,
        proofVerifier: new BlurtProofVerifier({ nodes: blurtProofNodesFor(configuration.apiNodes), fetchImpl }),
        anchorEvidenceView: new BlurtAnchorEvidenceView(),
        anchorFinalityObserver: new BlurtAnchorFinalityObserver({ rpc })
    });
}
