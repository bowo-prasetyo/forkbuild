import { reactive, ref, computed, onMounted, onBeforeUnmount, inject } from 'vue';
import { PeerLifecycleState } from '../../peer/PeerLifecycleState.js';
import { resolveSavedProviderDefault } from '../../application/SavedProviderDefaultChoice.js';
import { PublicationResolutionOutcome } from '../../application/PublicationResolutionOutcome.js';
import { resolvePublicationView, describePublicationOutcome, describeRetrieval } from '../../application/PublicationResolutionView.js';
import { Publication } from '../../publisher/Publication.js';
import { publicationEvidenceView, describeKnownEvidenceCount } from '../../application/PublicationEvidenceView.js';
import { derivePublicationEvidenceConvergence } from '../../application/PublicationEvidenceConvergence.js';
import { publicationEvidenceConvergenceView } from '../../application/PublicationEvidenceConvergenceView.js';
import { describeKnownPlacementCount } from '../../application/SnapshotPlacementView.js';
import { IpfsRemotePublicationState } from '../../application/IpfsRemotePublicationState.js';
import {
    IpfsPublicationObservationTimelineEntryKind
} from '../../application/IpfsPublicationObservationTimelineView.js';
import { describePublicationDecentralization, describeDecentralizationRelationshipContrast } from '../../application/PublicationDecentralizationView.js';
import { describePublicationReplicaKnowledge } from '../../application/PublicationReplicaKnowledgeView.js';
import { describePublicationReplicaKnowledgeDetail, describeAcquisitionBreakdown } from '../../application/PublicationReplicaKnowledgeDetailView.js';
import { describeSnapshotStateInspection } from '../../application/SnapshotStateInspectionView.js';
import { SnapshotPlacementRelationship } from '../../application/SnapshotPlacementRelationship.js';
import { BitcoinAnchorTransactionConstructionState } from '../../application/BitcoinAnchorTransactionConstructionState.js';
import { BitcoinAnchorReviewedSigningState } from '../../application/BitcoinAnchorReviewedSigningState.js';
import { BitcoinAnchorSignedPsbtFinalizationState } from '../../application/BitcoinAnchorSignedPsbtFinalizationState.js';
import { BitcoinAnchorBroadcastState } from '../../application/BitcoinAnchorBroadcastState.js';
import {
    PublicationObservationTimelineDomain, PublicationObservationTimelineEntryKind
} from '../../application/PublicationObservationTimelineView.js';
import {
    PublicationObservationArchiveFingerprintComparisonResult
} from '../../application/PublicationObservationArchiveFingerprintComparison.js';
import { LocalStoragePublicationObservationArchive } from '../../storage/LocalStoragePublicationObservationArchive.js';
// Publisher achievement profile/badges/statistics live on
// ui/views/LeaderboardHubView.js; this page keeps only the
// publisher-association lookups below.
import { PublicationObservationArchiveImportOutcome } from '../../application/PublicationObservationArchiveExport.js';
import {
    PublicationObservationArchiveInspectionOutcome
} from '../../application/PublicationObservationArchiveInspection.js';
import { BaseNetworkObservationState } from '../../application/BaseNetworkObservationState.js';
import { BasePublicationTransactionPlanState } from '../../application/BasePublicationTransactionPlanState.js';
import { BaseReviewedSigningState } from '../../application/BaseReviewedSigningState.js';
import { BaseSignedTransactionFinalizationState } from '../../application/BaseSignedTransactionFinalizationState.js';
import { BaseTransactionBroadcastState } from '../../application/BaseTransactionBroadcastState.js';
import { BaseTransactionInclusionObservationState } from '../../application/BaseTransactionInclusionObservationState.js';
import { sortOptionsByLabel } from '../../utils/sortOptionsByLabel.js';
import {
    humanizeContentKind, humanizeStorageType, humanizeAnchorType, shortId, shortHash, OUTCOME_BADGE_CLASSES,
    EVIDENCE_BADGE_CLASSES
} from './decentralizedPublications/presentation.js';
import { useBaseAnchoring } from './decentralizedPublications/useBaseAnchoring.js';
import { usePublicationObservationArchive } from './decentralizedPublications/usePublicationObservationArchive.js';
import { useArchivedAnchorPublications } from './decentralizedPublications/useArchivedAnchorPublications.js';
import { usePublicationReferences } from './decentralizedPublications/usePublicationReferences.js';
import { useAchievements } from './decentralizedPublications/useAchievements.js';
import { usePublisherAssociations } from './decentralizedPublications/usePublisherAssociations.js';
import { useBitcoinAnchoring } from './decentralizedPublications/useBitcoinAnchoring.js';
import { useBitcoinAnchorReconciliation } from './decentralizedPublications/useBitcoinAnchorReconciliation.js';
import { useSnapshotPlacements } from './decentralizedPublications/useSnapshotPlacements.js';
import { useSnapshotPeerExchange } from './decentralizedPublications/useSnapshotPeerExchange.js';
import { useIpfsRemotePublishing } from './decentralizedPublications/useIpfsRemotePublishing.js';
import { useCrossDomainObservationTimeline } from './decentralizedPublications/useCrossDomainObservationTimeline.js';
import { useAnchorEvidence } from './decentralizedPublications/useAnchorEvidence.js';
import { useSnapshotMaterialization } from './decentralizedPublications/useSnapshotMaterialization.js';
import { usePublicationDistribution } from './decentralizedPublications/usePublicationDistribution.js';

// Publications page (/publications). Lists every DecentralizedPublication in
// the local catalog (this replica's own, or one a peer announced) with its
// content availability, external evidence (anchors), snapshot placements and
// local snapshot possession, plus page-level wallet, archive and publisher
// tools.
//
// Rules this page keeps (see docs/Principles.md; history in docs/Roadmap.md):
// - Status is derived at display time, never stored on a catalog entry;
//   "Re-check" always re-derives it from scratch.
// - Opening the page or a disclosure never touches the network. Retrieval,
//   verification, discovery, resolution, creation, materialization and
//   synchronization each run only on an explicit click.
// - Those actions stay separate: creating or discovering an anchor never
//   verifies it, resolving a placement never materializes it, inspecting is a
//   purely local read.
// - Per-entry results (verifications, resolutions, attempts, histories) are
//   ephemeral session state, never written back into a catalog; durable facts
//   go only to the publication observation archive.
// - Evidence is shown and compared, never ranked, merged into a score, or
//   turned into a trust verdict.
// - Retrieval asks every authenticated peer, in PeerSessionManager registry
//   order, one at a time.
//

export default {
    name: 'DecentralizedPublicationsView',
    setup() {
        // Groups the page-level tool cards into three tabs. Presentation only:
        // panels use v-show, so no card state changes.
        const publicationsToolsTab = ref('anchoring');
        function setPublicationsToolsTab(tab) {
            publicationsToolsTab.value = tab;
        }

        const catalog = inject('publicationCatalog');
        const coordinator = inject('publicationResolutionCoordinator');
        const kindPlugins = inject('publicationDisplayKindPlugins');
        // The single app-lifetime provider from ui/main.js: one built per view
        // would drop every previously admitted candidate on navigation. Without
        // it, admission is simply skipped.
        const discoveryProvider = inject('decentralizedPublicationDiscoveryProvider', null);
        const publicationPeerExchange = inject('publicationPeerExchange');
        const publicationPeerContentExchange = inject('publicationPeerContentExchange');
        const peerSessionManager = inject('peerSessionManager');
        const evidenceCoordinator = inject('publicationEvidenceCoordinator');
        const creationCoordinator = inject('publicationAnchorCreationCoordinator');
        // Optional services inject as null (e.g. in a test harness); the UI
        // each one drives is then hidden. The preferred-provider coordinators
        // resolve the stored RoleProviderPreference on every click and sit
        // beside, never replace, the per-type creation coordinators.
        const preferredAnchorCreationCoordinator = inject('preferredPublicationAnchorCreationCoordinator', null);
        const evidenceDiscoveryCoordinator = inject('publicationEvidenceDiscoveryCoordinator', null);
        const knowledgeSynchronizationCoordinator = inject('publicationKnowledgeSynchronizationCoordinator', null);
        const evidenceViewRegistry = inject('externalAnchorEvidenceViewRegistry', null);
        const anchorKnowledgeStore = inject('anchorKnowledgeStore', null);
        const placementResolutionCoordinator = inject('publicationSnapshotPlacementResolutionCoordinator', null);
        const placementViewRegistry = inject('snapshotPlacementViewRegistry', null);
        const placementKnowledgeStore = inject('placementKnowledgeStore', null);
        const placementCreationCoordinator = inject('snapshotPlacementCreationCoordinator', null);
        const preferredPlacementCreationCoordinator = inject('preferredSnapshotPlacementCreationCoordinator', null);
        // Local bytes for publishToRemoteIpfs()/distributeEntrySnapshot() come
        // from publicationContentStore by the publication's contentReference,
        // never from the catalog, which only holds peer-announced envelopes.
        const ipfsRemotePublicationCoordinator = inject('ipfsRemotePublicationCoordinator', null);
        const publicationContentStore = inject('publicationContentStore', null);
        // The same snapshotDiscoveryPublisher "Distribute Snapshot" uses.
        // Without it, remote-IPFS publishing simply does not announce.
        const snapshotDiscoveryPublisher = inject('snapshotDiscoveryPublisher', null);
        const ipfsPublicationContentVerificationCoordinator = inject('ipfsPublicationContentVerificationCoordinator', null);
        // Unlike the other services this one has a working default: the archive
        // store falls back to browser localStorage. A test harness can inject
        // an in-memory one.
        const publicationObservationArchiveStorage = inject('publicationObservationArchiveStorage', null)
            || new LocalStoragePublicationObservationArchive();
        const localSnapshotContentAvailabilityUseCase = inject('localSnapshotContentAvailabilityUseCase', null);
        const snapshotContentMaterializationCoordinator = inject('snapshotContentMaterializationCoordinator', null);
        const snapshotPlacementMaterializationCoordinator = inject('snapshotPlacementMaterializationCoordinator', null);
        const snapshotPeerMaterializationCoordinator = inject('snapshotPeerMaterializationCoordinator', null);
        // Asks a peer whether it holds a snapshot; independent of
        // snapshotPeerMaterializationCoordinator, which fetches bytes.
        const snapshotPeerPossessionCoordinator = inject('snapshotPeerPossessionCoordinator', null);
        // Only turns an already-rendered peer observation row into an explicit
        // action; never picks or ranks a peer on the person's behalf.
        const snapshotMaterializationSelectionCoordinator = inject('snapshotMaterializationSelectionCoordinator', null);

        // Which publishers exist is a property of this replica, not of an
        // entry, so the list is read once. Empty means no "Create Anchor"
        // control is offered.
        const availableAnchorTypes = creationCoordinator ? creationCoordinator.availableAnchorTypes() : [];
        // Same for storage types and "Create Placement".
        const availableStorageTypes = placementCreationCoordinator ? placementCreationCoordinator.availableStorageTypes() : [];

        const entries = reactive([]);
        const loading = ref(true);

        const {
            publicationObservationArchive, publicationObservationArchiveExpanded,
            persistPublicationObservationArchive, archivePublishIpfsRecord, archiveIpfsVerificationObservation,
            archiveBitcoinBroadcast, archiveBitcoinConfirmationObservation,
            archiveBitcoinContentProofObservation, createBitcoinAnchorPublicationRecordUseCase,
            archiveBitcoinAnchorPublicationRecord, archiveBaseTransactionInclusionObservation,
            createBaseAnchorPublicationRecordUseCase, archiveBaseAnchorPublicationRecord,
            publicationObservationArchiveView, publicationObservationArchiveProvenanceView,
            publicationObservationArchiveFingerprintView, archiveFingerprintCopied, copyArchiveFingerprint,
            archiveFingerprintComparisonInput, archiveFingerprintComparisonResult,
            onArchiveFingerprintComparisonInputChanged, compareArchiveFingerprint,
            togglePublicationObservationArchive, clearPublicationObservationArchive,
            publicationArchiveExportedPackage, exportPublicationArchive, showPublicationArchiveImportForm,
            publicationArchiveImportText, togglePublicationArchiveImportForm,
            onPublicationArchiveImportFileChosen, publicationArchiveImportOutcome,
            publicationArchiveImportPreview, confirmPublicationArchiveImport,
            showPublicationArchiveInspectionForm, publicationArchiveInspectionText,
            publicationArchiveDifferenceResult, publicationArchiveReplacementReviewResult,
            invalidatePublicationArchiveDifference, togglePublicationArchiveInspectionForm,
            onPublicationArchiveInspectionFileChosen, publicationArchiveInspectionOutcome,
            comparePublicationArchiveDifference, publicationArchiveDifferenceCollectionRows,
            reviewPublicationArchiveReplacement, cancelPublicationArchiveReplacementReview,
            confirmPublicationArchiveReplacementFromReview
        } = usePublicationObservationArchive({
            publicationObservationArchiveStorage
        });

        const {
            historicalBitcoinAnchorsExpanded, historicalBitcoinAnchorEntryExpanded,
            toggleHistoricalBitcoinAnchors, historicalBitcoinAnchorArchiveView,
            toggleHistoricalBitcoinAnchorEntry, isHistoricalBitcoinAnchorEntryExpanded,
            historicalBitcoinAnchorEvidenceView, bitcoinAnchorPublicationsExpanded,
            bitcoinAnchorPublicationInspectionExpanded, toggleBitcoinAnchorPublications,
            bitcoinAnchorPublicationRecordHistoryView, toggleBitcoinAnchorPublicationInspection,
            isBitcoinAnchorPublicationInspectionExpanded, bitcoinAnchorPublicationInspectionView,
            bitcoinAnchorPublicationLifecycleExpanded, toggleBitcoinAnchorPublicationLifecycle,
            isBitcoinAnchorPublicationLifecycleExpanded, bitcoinAnchorPublicationLifecycleTimelineView,
            bitcoinAnchorPublicationLifecycleEntryDetail, baseAnchorPublicationsExpanded,
            toggleBaseAnchorPublications, baseAnchorPublicationRecordHistoryView,
            baseAnchorPublicationLifecycleExpanded, toggleBaseAnchorPublicationLifecycle,
            isBaseAnchorPublicationLifecycleExpanded, baseAnchorPublicationLifecycleTimelineView,
            baseAnchorPublicationLifecycleEntryDetail
        } = useArchivedAnchorPublications({
            publicationObservationArchive
        });

        const {
            publicationReferencesExpanded, publicationReferenceSourceKey, publicationReferenceReferencedKey,
            publicationReferenceError, togglePublicationReferences, knownPublicationIdentityOptions,
            findKnownPublicationIdentity, createPublicationReferenceRecordUseCase, recordPublicationReference,
            publicationReferenceRecordHistoryView, publicationReferenceGraphExpanded,
            publicationReferenceGraphNodeExpanded, togglePublicationReferenceGraph,
            publicationReferenceGraphView, publicationReferenceGraphNodeKey,
            togglePublicationReferenceGraphNode, isPublicationReferenceGraphNodeExpanded
        } = usePublicationReferences({
            persistPublicationObservationArchive, publicationObservationArchive
        });

        const {
            achievementsExpanded, achievementBadgeExpanded, toggleAchievements, achievementBadgesView,
            toggleAchievementBadge, isAchievementBadgeExpanded, canViewAchievementBadgeLifecycle,
            viewAchievementBadgeLifecycle, achievementProfileExpanded, achievementProfileSelectedKey,
            toggleAchievementProfile, achievementProfileView
        } = useAchievements({
            baseAnchorPublicationLifecycleExpanded, baseAnchorPublicationsExpanded,
            bitcoinAnchorPublicationLifecycleExpanded, bitcoinAnchorPublicationsExpanded,
            findKnownPublicationIdentity, publicationObservationArchive
        });

        const {
            publisherAssociationsExpanded, publisherAssociationPublisherId, publisherAssociationPublicationKey,
            publisherAssociationError, publisherAssociationSelectedPublisherId, togglePublisherAssociations,
            publisherPublicationAssociationRecordHistoryView, distinctPublisherIdentifiersView,
            createPublisherPublicationAssociationRecordUseCase, recordPublisherAssociation,
            publisherAssociationProfileView
        } = usePublisherAssociations({
            findKnownPublicationIdentity, persistPublicationObservationArchive, publicationObservationArchive
        });

        // Every authenticated peer, in registry order: the candidate list
        // handed to PublicationResolutionCoordinator#resolve().
        const retrievalPeers = computed(() => peerSessionManager.listPeers()
            .filter((peer) => peer.getLifecycleState() === PeerLifecycleState.AUTHENTICATED));

        // The "Choose an authenticated peer…" dropdowns list the same peers
        // alphabetically — display order only; `retrievalPeers` itself keeps
        // registry order for resolution. See utils/sortOptionsByLabel.js.
        function retrievalPeerLabel(peer) {
            return peer.alias || (peer.remoteIdentity ? shortId(peer.remoteIdentity.identityId) : 'Unknown peer');
        }
        const retrievalPeerOptions = computed(() => sortOptionsByLabel(retrievalPeers.value, retrievalPeerLabel));

        function findEntry(publicationId) {
            return entries.find((entry) => entry.publication.id === publicationId);
        }

        // Only a successfully resolved Publication is admitted to Repository
        // discovery; an envelope that merely arrived is not. The instanceof
        // check keeps other content kinds (attributions, naming claims) out. A
        // failed resolution is simply not admitted: no placeholder, no retry.
        function admitToRepositoryDiscovery(view) {
            if (discoveryProvider && view && view.resolved && view.content instanceof Publication) {
                discoveryProvider.add(view.content);
            }
        }

        async function resolveEntry(entry) {
            entry.checking = true;
            try {
                entry.view = await resolvePublicationView(entry.publication, { coordinator, kindPlugins });
                admitToRepositoryDiscovery(entry.view);
            } finally {
                entry.checking = false;
            }
        }

        // Rebuilds the entry list from the catalog (local and synchronous),
        // keeping existing entry state, then resolves only the new entries.
        async function refreshList() {
            const known = new Map(entries.map((entry) => [entry.publication.id, entry]));
            const current = catalog.list();
            entries.splice(0, entries.length, ...current.map((publication) => known.get(publication.id) || reactive({
                publication,
                receivedAt: catalog.getReceivedAt(publication.id),
                view: null,
                checking: false,
                retrieving: false,
                // Per-entry UI state. Everything below is ephemeral for the
                // page's lifetime and never written to anything durable.
                // detailsTab is the open tab of the entry's details disclosure.
                detailsTab: 'snapshot',
                evidenceAnchors: [],
                evidence: null,
                evidenceExpanded: false,
                verifications: {},
                // Recomputed from evidenceAnchors whenever
                // loadEvidence()/verifyAnchor() run.
                convergence: null,
                convergenceView: null,
                // Keyed by anchorId: every verification this session, appended
                // in order. verifications keeps only the latest result.
                verificationHistory: {},
                inspections: {},
                // Discovery asks about the whole publication, so there is one
                // attempt per entry.
                discoveryAttempt: null,
                synchronizationAttempt: null,
                creationAttempts: {},
                // Kept apart from creationAttempts: the preferred trigger has
                // no anchorType until it resolves, and sharing a key could let
                // the two attempts overwrite each other's outcome.
                preferredAnchorCreationAttempt: null,
                // One publication has at most one transaction plan at a time.
                bitcoinAnchorTransactionConstruction: null,
                // The placement-side counterparts of the evidence fields above.
                placements: [],
                placementsView: null,
                placementsExpanded: false,
                resolutions: {},
                materializations: {},
                // Keyed by placementId: every resolution this session, appended
                // in order. resolutions keeps only the latest result.
                resolutionHistory: {},
                placementInspections: {},
                // Recomputed from placements whenever loadPlacements() runs,
                // never from resolutions.
                placementConvergence: null,
                placementConvergenceView: null,
                // Combines convergenceView and placementConvergenceView;
                // recomputed when either changes.
                decentralization: null,
                // decentralization plus whether this replica has cataloged the
                // envelope itself.
                replicaKnowledge: null,
                replicaKnowledgeDetail: null,
                replicaKnowledgeExpanded: false,
                placementCreationAttempts: {},
                // Kept apart from placementCreationAttempts for the same reason
                // as preferredAnchorCreationAttempt.
                preferredPlacementCreationAttempt: null,
                // Remote IPFS publishing: the configuration exists only in
                // memory until the page closes (see
                // application/IpfsRemotePublishingConfiguration.js); the draft
                // holds unsubmitted form fields. A new configuration clears the
                // previous publication outcome.
                ipfsRemotePublishingConfiguration: null,
                ipfsRemotePublishingConfigureFormOpen: false,
                ipfsRemotePublishingDraft: { endpoint: '', credential: '', requestField: '', responseField: '' },
                ipfsRemotePublicationOutcome: null,
                // The record from the last PUBLISHED outcome and its latest
                // verification. A new publish (a new record) clears both, so an
                // old record's verification is never shown for the new one;
                // "Verify Again" just replaces the verification.
                ipfsPublicationRecord: null,
                ipfsPublicationContentVerification: null,
                // Append-only history of every published record; it survives
                // reconfiguring the provider because a past publication stays a
                // fact. Keyed maps below use the stable history index.
                ipfsPublicationRecordHistory: [],
                ipfsPublicationRecordHistoryExpanded: false,
                ipfsPublicationRecordInspectionExpanded: {},
                // Per-record verification histories (append-only) and in-flight
                // flags, keyed by record index. "Verifying" is never recorded
                // as an observation.
                ipfsPublicationVerificationHistoriesByRecordIndex: {},
                ipfsPublicationRecordVerifyingByRecordIndex: {},
                ipfsPublicationVerificationHistoryExpandedByRecordIndex: {},
                ipfsPublicationObservationTimelineExpanded: false,
                // Maps a local record index to its position in the shared
                // archive (see archivePublishIpfsRecord()).
                archiveIpfsRecordIndexByLocalIndex: [],
                // Written only by "Check Local Snapshot"; never recomputed by
                // the evidence or placement loaders.
                localSnapshotAvailability: null,
                // Opening the import panel never imports anything; only the
                // "Import Snapshot" click does.
                materializationFormOpen: false,
                materializationImportText: '',
                materializationAttempt: null,
                // The most recent successful materialization, from any source.
                // Feeds the "Source: …" line only.
                lastMaterializationAttempt: null,
                // The person's own peer choice; the page never picks, ranks or
                // falls back between peers.
                peerMaterializationSelectedPeerId: '',
                peerMaterializationAttempt: null,
                // A separate peer choice from the one above: asking whether a
                // peer has bytes and asking it for them are independent
                // actions. A new check replaces the previous observation.
                peerPossessionSelectedPeerId: '',
                peerPossessionAttempt: null,
                // Every materialization attempt this session, successful or
                // not, appended in order.
                materializationHistory: [],
                materializationHistoryExpanded: false,
                // Keyed by stable history index (the history is append-only).
                materializationHistoryEntryExpanded: {},
                // Multi-peer comparison, separate from the single-peer check
                // above: the peers the person ticked, and an append-only
                // history of every answer.
                peerPossessionCompareSelectedPeerIds: [],
                peerPossessionObservationHistory: [],
                peerPossessionComparisonChecking: false,
                peerPossessionComparisonHistoryExpanded: false,
                // Keyed by stable history index (the history is append-only).
                peerPossessionObservationHistoryEntryExpanded: {},
                // Keyed by peerId: one attempt per comparison row, independent
                // of every other row and of the peer's possession observation.
                peerPossessionComparisonMaterializations: {},
                // Bitcoin anchor inspection, keyed by anchorId (a publication
                // can carry several bitcoin anchors). A new reconcile replaces
                // bitcoinAnchorReconciliations[anchorId]; confirmations are
                // also appended to a separate history. Content proof has no
                // history: a hash match against an immutable OP_RETURN output
                // doesn't change over time.
                bitcoinAnchorReconciliations: {},
                bitcoinAnchorConfirmationHistories: {},
                bitcoinAnchorConfirmationHistoryExpanded: {},
                bitcoinAnchorConfirmationHistoryEntryExpanded: {},
                // Comparing, consistency analysis and evidence correlation
                // below are synchronous and local, so they need no in-flight or
                // error state.
                bitcoinAnchorChainPlacementComparisonExpanded: {},
                bitcoinAnchorObservationConsistencyExpanded: {},
                bitcoinAnchorObservationEvidenceExpanded: {},
                crossDomainPublicationObservationTimelineExpanded: false,
                // The entry's own Nostr/Arweave choice (per entry, since the
                // page lists many). Seeded from the saved
                // Announcement/Discovery preference when it is one of the
                // offered substrates, else 'nostr'; later preference changes
                // never reach an existing entry. Attempts are single ephemeral
                // objects; the durable record is
                // publicationDistributionLifecycleStore's.
                discoveryDistributionProvider: resolveSavedProviderDefault(
                    defaultAnnouncementDiscoveryProvider, ['nostr', 'arweave'], 'nostr'
                ),
                discoveryDistributionAttempt: null,
                // The entry's own Content backend. Seeded from the saved
                // Content preference when it is currently eligible, else the
                // first eligible backend, else 'ar'.
                snapshotDistributionStorage: resolveSavedProviderDefault(
                    defaultContentDistributionProvider, snapshotDistributionStorageTypes, snapshotDistributionStorageTypes[0] || 'ar'
                ),
                snapshotDistributionAttempt: null
            })));
            await Promise.all(entries.filter((entry) => !entry.view && !entry.checking).map(resolveEntry));
            entries.forEach(loadEvidence);
            entries.forEach(loadPlacements);
        }

        // Discovery only: a local catalog read that never verifies and leaves
        // existing verification results alone.
        function loadEvidence(entry) {
            if (!evidenceCoordinator) return;
            entry.evidenceAnchors = evidenceCoordinator.discover(entry.publication.id);
            entry.evidence = publicationEvidenceView(entry.evidenceAnchors, entry.verifications);
            recomputeConvergence(entry);
            recomputeReplicaKnowledgeDetail(entry);
        }

        // Local verification outcomes are passed along only to populate each
        // anchor's verification field; they never change the conflict/grouping
        // result.
        function recomputeConvergence(entry) {
            const verificationByAnchorId = {};
            for (const anchorId of Object.keys(entry.verifications)) {
                const result = entry.verifications[anchorId];
                if (result && !result.checking && result.outcome) {
                    verificationByAnchorId[anchorId] = result.outcome;
                }
            }
            entry.convergence = derivePublicationEvidenceConvergence({
                publicationId: entry.publication.id,
                expectedContentHash: entry.publication.contentReference.hash,
                anchors: entry.evidenceAnchors,
                verificationByAnchorId
            });
            entry.convergenceView = publicationEvidenceConvergenceView(entry.convergence);
            recomputeDecentralization(entry);
        }

        // Called from both convergence recomputes so the combined view is never
        // stale; safe before either exists.
        function recomputeDecentralization(entry) {
            entry.decentralization = describePublicationDecentralization({
                publicationId: entry.publication.id,
                evidenceConvergenceView: entry.convergenceView,
                placementConvergenceView: entry.placementConvergenceView
            });
            recomputeReplicaKnowledge(entry);
        }

        // Calls catalog.has() rather than assuming true, so this stays right
        // for an entry built from elsewhere.
        function recomputeReplicaKnowledge(entry) {
            entry.replicaKnowledge = describePublicationReplicaKnowledge({
                publicationId: entry.publication.id,
                hasPublication: catalog.has(entry.publication.id),
                evidenceConvergenceView: entry.convergenceView,
                placementConvergenceView: entry.placementConvergenceView
            });
        }

        function decentralizationContrast(entry) {
            return describeDecentralizationRelationshipContrast(entry.decentralization);
        }

        // Shows the snapshot's independently observed facts side by side, never
        // collapsed into one verdict.
        function snapshotStateInspectionView(entry) {
            return describeSnapshotStateInspection({
                publicationId: entry.publication.id,
                contentHash: entry.publication.contentReference.hash,
                possessionView: currentPossessionView(entry),
                acquisitionView: snapshotAcquisitionView(entry),
                placementConvergenceView: entry.placementConvergenceView,
                peerPossessionComparisonView: peerPossessionComparisonView(entry)
            });
        }

        function snapshotStatePlacementRelationshipLabel(view) {
            if (!view || !view.placements) return null;
            return view.placements.relationship === SnapshotPlacementRelationship.CONFLICT ? 'Conflict' : 'Agreement';
        }

        const {
            checkLocalSnapshotAvailability, localSnapshotAvailabilityView, localSnapshotAvailabilityBadgeClass,
            localSnapshotAvailabilityButtonLabel, currentPossessionView, replicaContentKnowledgeView,
            snapshotAcquisitionView, snapshotAcquisitionOutcomeCountsSentence,
            snapshotAcquisitionNeedsSourceHint, onMaterializationFileChosen, importSnapshotContent,
            recordMaterializationSource, localSnapshotMaterializationSourceView,
            mapPackageOutcomeToStoreOutcome, mapPlacementOutcomeToStoreOutcome, mapPeerOutcomeToStoreOutcome,
            recordMaterializationHistoryEntry, materializationHistoryDetailsView,
            isMaterializationHistoryEntryExpanded, toggleMaterializationHistoryEntry,
            materializationSourceCountsSentence, toggleMaterializationHistory, materializationView,
            materializationBadgeClass, materializationButtonLabel
        } = useSnapshotMaterialization({
            catalog, localSnapshotContentAvailabilityUseCase, snapshotContentMaterializationCoordinator
        });

        // Called explicitly wherever the claim set or an observation changes,
        // rather than chained through recomputeDecentralization():
        // verify/resolve push their history entry after recomputing
        // convergence, so chaining would leave this one step stale.
        function recomputeReplicaKnowledgeDetail(entry) {
            const evidenceClaims = entry.evidenceAnchors.map((anchor) => ({
                anchorId: anchor.id,
                knowledgeRecord: anchorKnowledgeStore ? anchorKnowledgeStore.get(anchor.id) : null,
                verificationObservations: entry.verificationHistory[anchor.id] || []
            }));
            const placementClaims = entry.placements.map((placement) => ({
                placementId: placement.id,
                knowledgeRecord: placementKnowledgeStore ? placementKnowledgeStore.get(placement.id) : null,
                resolutionObservations: entry.resolutionHistory[placement.id] || []
            }));
            entry.replicaKnowledgeDetail = describePublicationReplicaKnowledgeDetail({
                publicationId: entry.publication.id,
                hasPublication: catalog.has(entry.publication.id),
                evidenceConvergenceView: entry.convergenceView,
                placementConvergenceView: entry.placementConvergenceView,
                evidenceClaims,
                placementClaims
            });
        }

        function toggleReplicaKnowledge(entry) {
            entry.replicaKnowledgeExpanded = !entry.replicaKnowledgeExpanded;
        }

        // A tally, never a ranking.
        function acquisitionBreakdownSentence(claims) {
            const counts = describeAcquisitionBreakdown(claims);
            const parts = [];
            if (counts.peer > 0) parts.push(`${counts.peer} learned via peer exchange`);
            if (counts.package > 0) parts.push(`${counts.package} learned via package import`);
            if (counts.local > 0) parts.push(`${counts.local} learned locally`);
            if (!parts.length) return null;
            return parts.join(' · ');
        }

        function toggleEvidence(entry) {
            entry.evidenceExpanded = !entry.evidenceExpanded;
        }

        function setEntryDetailsTab(entry, tab) {
            entry.detailsTab = tab;
        }

        const {
            bitcoinAnchorProofReconciliationView, reconcileBitcoinAnchor, bitcoinAnchorReconciliationView,
            bitcoinAnchorConfirmationBadgeClass, bitcoinAnchorContentProofBadgeClass,
            bitcoinAnchorReconcileButtonLabel, bitcoinAnchorConfirmationHistoryView,
            toggleBitcoinAnchorConfirmationHistory, isBitcoinAnchorConfirmationHistoryExpanded,
            toggleBitcoinAnchorConfirmationHistoryEntry, isBitcoinAnchorConfirmationHistoryEntryExpanded,
            bitcoinAnchorChainPlacementComparisonView, toggleBitcoinAnchorChainPlacementComparison,
            isBitcoinAnchorChainPlacementComparisonExpanded, bitcoinAnchorObservationConsistencyView,
            toggleBitcoinAnchorObservationConsistency, isBitcoinAnchorObservationConsistencyExpanded,
            bitcoinAnchorObservationEvidenceView, toggleBitcoinAnchorObservationEvidence,
            isBitcoinAnchorObservationEvidenceExpanded
        } = useBitcoinAnchorReconciliation({
            archiveBitcoinConfirmationObservation, archiveBitcoinContentProofObservation
        });

        const {
            baseWalletConnection, baseNetworkObserver, basePublicationTransactionPlanCoordinator,
            baseInjectedProviderWalletTransactionSigner, baseReviewedSigningCoordinator,
            baseSignedTransactionFinalizationCoordinator, baseTransactionBroadcastCoordinator,
            baseTransactionInclusionObservationCoordinator, baseAnchorPublisher, baseWalletConnectionState,
            baseAccountObservationState, connectBaseWallet, disconnectBaseWallet, baseWalletConnectionView,
            baseWalletConnectionBadgeClass, isBaseWalletConnected, isBaseWalletConnecting, observeBaseAccount,
            baseAccountObservationView, baseAccountObservationBadgeClass, isBaseAccountObserved,
            constructBasePublicationTransaction, basePublicationTransactionPlanView,
            basePublicationTransactionPlanBadgeClass, basePublicationTransactionReviewView, createBaseAnchor,
            baseAnchorCreationView, baseAnchorCreationBadgeClass, baseAnchorCreationButtonLabel,
            signBaseReviewedTransaction, baseReviewedTransactionSigningView,
            baseReviewedTransactionSigningBadgeClass, isBaseReviewedTransactionSigning,
            finalizeBaseSignedTransaction, baseSignedTransactionFinalizationView,
            baseSignedTransactionFinalizationBadgeClass, broadcastBaseTransaction,
            baseTransactionBroadcastView, baseTransactionBroadcastBadgeClass, isBaseTransactionBroadcasting,
            observeBaseTransactionInclusion, baseTransactionInclusionView, baseTransactionInclusionBadgeClass,
            isBaseTransactionInclusionObserving, baseTransactionInclusionHistoryView,
            toggleBaseTransactionInclusionHistory
        } = useBaseAnchoring({
            archiveBaseAnchorPublicationRecord, archiveBaseTransactionInclusionObservation, loadEvidence,
            persistPublicationObservationArchive, publicationObservationArchive
        });

        const {
            bitcoinWalletConnection, bitcoinWalletFundingObserver, bitcoinAnchorTransactionReviewCoordinator,
            bitcoinAnchorReviewedSigningCoordinator, bitcoinAnchorSignedPsbtFinalizationCoordinator,
            bitcoinAnchorBroadcastCoordinator, bitcoinAnchorConfirmationCoordinator,
            bitcoinAnchorPublicationCoordinator, bitcoinAnchorTransactionConstructionCoordinator,
            bitcoinWalletConnectionState, bitcoinAnchorFundingState, bitcoinAnchorFundingUtxosExpanded,
            bitcoinAnchorTransactionReview, bitcoinAnchorReviewedSigningOutcome,
            bitcoinAnchorSignedPsbtFinalizationOutcome, bitcoinAnchorFinalizedTransaction,
            bitcoinAnchorBroadcastOutcome, bitcoinAnchorBroadcastedAt, bitcoinAnchorPublicationAttempt,
            bitcoinAnchorBroadcastConfirmationOutcome, bitcoinAnchorBroadcastConfirmationHistory,
            bitcoinAnchorBroadcastConfirmationObserving, bitcoinAnchorBroadcastConfirmationError,
            bitcoinAnchorBroadcastConfirmationHistoryExpanded,
            bitcoinAnchorBroadcastConfirmationHistoryEntryExpanded,
            retireBitcoinAnchorBroadcastConfirmationContext, connectBitcoinWallet, disconnectBitcoinWallet,
            bitcoinWalletConnectionView, bitcoinWalletConnectionBadgeClass, isBitcoinWalletConnected,
            isBitcoinWalletConnecting, bitcoinAnchorTransactionReviewView,
            bitcoinAnchorTransactionReviewWalletMatchView, observeBitcoinAnchorFunding,
            toggleBitcoinAnchorFundingUtxosExpanded, bitcoinAnchorFundingView, bitcoinAnchorFundingBadgeClass,
            isBitcoinAnchorFundingObserved, constructBitcoinAnchorTransaction,
            bridgeBitcoinAnchorTransactionToReview, signBitcoinAnchorReviewedTransaction,
            bitcoinAnchorReviewedSigningView, bitcoinAnchorReviewedSigningBadgeClass,
            isBitcoinAnchorReviewedSigning, finalizeBitcoinAnchorSignedPsbt,
            bitcoinAnchorSignedPsbtFinalizationView, bitcoinAnchorSignedPsbtFinalizationBadgeClass,
            broadcastBitcoinAnchorTransaction, bitcoinAnchorPublicationView,
            bitcoinAnchorPublicationBadgeClass, bitcoinAnchorBroadcastView, bitcoinAnchorBroadcastBadgeClass,
            isBitcoinAnchorBroadcasting, observeBitcoinAnchorBroadcastConfirmation,
            bitcoinAnchorBroadcastConfirmationView, bitcoinAnchorBroadcastConfirmationBadgeClass,
            bitcoinAnchorBroadcastConfirmationHistoryView, toggleBitcoinAnchorBroadcastConfirmationHistory,
            toggleBitcoinAnchorBroadcastConfirmationHistoryEntry,
            isBitcoinAnchorBroadcastConfirmationHistoryEntryExpanded, bitcoinAnchorTransactionConstructionView,
            bitcoinAnchorTransactionConstructionBadgeClass
        } = useBitcoinAnchoring({
            archiveBitcoinAnchorPublicationRecord, archiveBitcoinBroadcast,
            archiveBitcoinConfirmationObservation, findEntry, loadEvidence
        });

        function evidenceBadgeClass(anchorView) {
            if (anchorView.checking) return 'peer-badge--pending';
            if (!anchorView.verified) return 'peer-badge--unchecked';
            return EVIDENCE_BADGE_CLASSES[anchorView.verificationOutcome] || 'peer-badge--unchecked';
        }

        const {
            selectedPeerForMaterialization, requestSnapshotFromPeer, peerMaterializationView,
            peerMaterializationBadgeClass, peerMaterializationButtonLabel, selectedPeerForPossessionCheck,
            checkSnapshotPossessionWithPeer, peerPossessionView, peerPossessionBadgeClass,
            peerPossessionButtonLabel, togglePeerPossessionCompareSelection,
            selectedPeersForPossessionComparison, checkSnapshotPossessionWithSelectedPeers,
            peerPossessionComparisonView, peerPossessionComparisonRowBadgeClass,
            peerPossessionComparisonRowLabel, materializeFromComparisonPeer, comparisonPeerMaterializationView,
            comparisonPeerMaterializationBadgeClass, comparisonPeerMaterializationButtonLabel,
            peerPossessionObservationHistoryView, togglePeerPossessionComparisonHistory,
            peerPossessionObservationDetailsView, isPeerPossessionObservationHistoryEntryExpanded,
            togglePeerPossessionObservationHistoryEntry, peerPossessionRowLabel
        } = useSnapshotPeerExchange({
            mapPeerOutcomeToStoreOutcome, recordMaterializationHistoryEntry, recordMaterializationSource,
            retrievalPeers, snapshotMaterializationSelectionCoordinator,
            snapshotPeerMaterializationCoordinator, snapshotPeerPossessionCoordinator
        });

        const {
            loadPlacements, recomputePlacementConvergence, togglePlacements, resolvePlacement,
            placementLifecycleNote, placementBadgeClass, materializePlacement, placementMaterializationView,
            placementMaterializationBadgeClass, placementMaterializationButtonLabel, togglePlacementInspect,
            placementInspectionExpanded, placementInspectionDetail, placementInspectionTypeSpecific,
            placementInspectionKnowledge, createPlacement, placementCreationView, placementCreationBadgeClass,
            placementCreationButtonLabel, createPreferredPlacement, preferredPlacementCreationView,
            preferredPlacementCreationBadgeClass, preferredPlacementCreationButtonLabel
        } = useSnapshotPlacements({
            mapPlacementOutcomeToStoreOutcome, placementCreationCoordinator, placementKnowledgeStore,
            placementResolutionCoordinator, placementViewRegistry, preferredPlacementCreationCoordinator,
            recomputeDecentralization, recomputeReplicaKnowledgeDetail, recordMaterializationHistoryEntry,
            recordMaterializationSource, snapshotPlacementMaterializationCoordinator
        });

        const {
            openIpfsRemotePublishingConfigureForm, cancelIpfsRemotePublishingConfigureForm,
            toggleIpfsRemotePublishingConfigureForm, saveIpfsRemotePublishingConfiguration,
            clearIpfsRemotePublishingConfiguration, ipfsRemotePublishingConfigurationView, publishToRemoteIpfs,
            ipfsRemotePublicationView, ipfsRemotePublicationBadgeClass, isIpfsRemotePublishing,
            verifyIpfsPublicationContent, ipfsPublicationContentVerificationView,
            ipfsPublicationContentVerificationBadgeClass, isVerifyingIpfsPublicationContent,
            ipfsPublicationContentVerifyButtonLabel, ipfsPublicationRecordHistoryView,
            toggleIpfsPublicationRecordHistory, toggleIpfsPublicationRecordInspection,
            isIpfsPublicationRecordInspectionExpanded, verifyIpfsPublicationRecordHistoryEntry,
            isVerifyingIpfsPublicationRecordHistoryEntry, ipfsPublicationRecordVerificationHistoryView,
            latestIpfsPublicationRecordVerificationView, ipfsPublicationRecordVerificationBadgeClass,
            ipfsPublicationVerificationEntryBadgeClass, ipfsPublicationRecordVerifyButtonLabel,
            toggleIpfsPublicationRecordVerificationHistory, isIpfsPublicationRecordVerificationHistoryExpanded,
            ipfsPublicationObservationTimelineView, toggleIpfsPublicationObservationTimeline,
            ipfsPublicationObservationTimelineEntryBadgeClass
        } = useIpfsRemotePublishing({
            archiveIpfsVerificationObservation, archivePublishIpfsRecord,
            ipfsPublicationContentVerificationCoordinator, ipfsRemotePublicationCoordinator,
            publicationContentStore, snapshotDiscoveryPublisher
        });

        const {
            crossDomainPublicationObservationTimelineView, toggleCrossDomainPublicationObservationTimeline,
            crossDomainPublicationObservationTimelineEntryBadgeClass,
            crossDomainPublicationObservationTimelineEntryDomainLabel
        } = useCrossDomainObservationTimeline({
            bitcoinAnchorBroadcastConfirmationHistory, bitcoinAnchorBroadcastOutcome,
            bitcoinAnchorBroadcastedAt, bitcoinAnchorFinalizedTransaction, bitcoinAnchorTransactionReview
        });

        const {
            verifyAnchor, lifecycleNote, toggleInspect, inspectionExpanded, inspectionDetail,
            inspectionTypeSpecific, inspectionKnowledge, createAnchor, discoverFromPeers, discoveryView,
            discoveryBadgeClass, discoveryButtonLabel, synchronizeWithPeers, synchronizationView,
            synchronizationBadgeClass, synchronizationButtonLabel, creationView, creationBadgeClass,
            creationButtonLabel, createPreferredAnchor, preferredCreationView, preferredCreationBadgeClass,
            preferredCreationButtonLabel
        } = useAnchorEvidence({
            anchorKnowledgeStore, creationCoordinator, evidenceCoordinator, evidenceDiscoveryCoordinator,
            evidenceViewRegistry, knowledgeSynchronizationCoordinator, loadEvidence, loadPlacements,
            preferredAnchorCreationCoordinator, recomputeConvergence, recomputeReplicaKnowledgeDetail
        });

        const {
            publicationDistributionCommand, multiRelayNostrPublicationDistributionCommand,
            snapshotDistributionCommand, snapshotDistributionAvailableStorageTypesCommand,
            defaultAnnouncementDiscoveryProvider, defaultContentDistributionProvider,
            snapshotDistributionStorageTypes, snapshotDistributionStorageOptions,
            publicationDistributionLifecycleStore, distributeEntryPublication, distributeEntrySnapshot,
            distributePublicationForEntry, discoveryDistributionButtonLabel, distributeSnapshot,
            snapshotDistributionButtonLabel, discoveryObservationsView,
            discoveryDistributionConfigurationRoute, snapshotDistributionConfigurationRoute
        } = usePublicationDistribution({
            publicationContentStore
        });

        async function recheck(entry) {
            await resolveEntry(entry);
        }

        async function retrieve(entry) {
            const peers = retrievalPeers.value;
            if (!peers.length) {
                return;
            }
            entry.retrieving = true;
            try {
                entry.view = await resolvePublicationView(entry.publication, { coordinator, kindPlugins, peers });
                admitToRepositoryDiscovery(entry.view);
            } finally {
                entry.retrieving = false;
            }
        }

        function canRetrieve(entry) {
            return Boolean(entry.view && entry.view.outcome === PublicationResolutionOutcome.CONTENT_UNAVAILABLE);
        }

        function formatWhen(iso) {
            return iso ? new Date(iso).toLocaleString() : 'unknown time';
        }

        function badgeClass(entry) {
            if (!entry.view) return 'peer-badge--pending';
            return OUTCOME_BADGE_CLASSES[entry.view.outcome] || 'peer-badge--failed';
        }

        function statusLabel(entry) {
            if (entry.checking) return 'Checking…';
            if (!entry.view) return 'Checking…';
            return describePublicationOutcome(entry.view.outcome);
        }

        // describeRetrieval() returns null when the bytes were already local,
        // or a sentence when they just arrived from a peer (accepted after
        // their hash matched).
        function availabilityText(entry) {
            if (!entry.view) return null;
            if (entry.view.outcome === PublicationResolutionOutcome.RESOLVED) {
                return describeRetrieval(entry.view)
                    || "Available locally. The content matching this publication's cryptographic hash is stored on this device.";
            }
            if (entry.view.outcome === PublicationResolutionOutcome.CONTENT_UNAVAILABLE) {
                return describeRetrieval(entry.view)
                    || 'Unavailable locally. The publication is known, but its referenced content is not currently available on this device.';
            }
            return null;
        }

        let unsubscribeReceived = null;
        let unsubscribeContent = null;
        onMounted(async () => {
            // load() never throws: missing or corrupt storage starts an empty
            // archive.
            publicationObservationArchive.value = publicationObservationArchiveStorage.load();

            loading.value = true;
            await refreshList();
            loading.value = false;
            unsubscribeReceived = publicationPeerExchange
                ? publicationPeerExchange.onPublicationReceived(() => refreshList())
                : null;
            // A hash can belong to several entries (independent publishers,
            // identical bytes); re-check every one.
            unsubscribeContent = publicationPeerContentExchange
                ? publicationPeerContentExchange.onContentReceived(({ hash }) => {
                    for (const entry of entries) {
                        if (entry.publication.contentReference.hash === hash) {
                            resolveEntry(entry);
                        }
                    }
                })
                : null;
        });
        onBeforeUnmount(() => {
            if (unsubscribeReceived) unsubscribeReceived();
            if (unsubscribeContent) unsubscribeContent();
        });

        return {
            entries, loading, retrievalPeers, retrievalPeerOptions, retrievalPeerLabel, availableAnchorTypes,
            humanizeContentKind, humanizeStorageType, humanizeAnchorType, shortId, shortHash, formatWhen, badgeClass, statusLabel, availabilityText,
            canRetrieve, retrieve, recheck,
            describeKnownEvidenceCount, toggleEvidence, verifyAnchor, evidenceBadgeClass, lifecycleNote,
            createAnchor, creationView, creationBadgeClass, creationButtonLabel,
            preferredAnchorCreationCoordinator, createPreferredAnchor, preferredCreationView, preferredCreationBadgeClass, preferredCreationButtonLabel,
            publicationDistributionCommand, multiRelayNostrPublicationDistributionCommand, snapshotDistributionCommand,
            distributePublicationForEntry, discoveryDistributionButtonLabel,
            distributeSnapshot, snapshotDistributionButtonLabel,
            discoveryObservationsView, discoveryDistributionConfigurationRoute, snapshotDistributionConfigurationRoute,
            toggleInspect, inspectionExpanded, inspectionDetail, inspectionTypeSpecific, inspectionKnowledge,
            evidenceDiscoveryCoordinator, discoverFromPeers, discoveryView, discoveryBadgeClass, discoveryButtonLabel,
            describeKnownPlacementCount, togglePlacements, resolvePlacement, placementBadgeClass, placementLifecycleNote,
            togglePlacementInspect, placementInspectionExpanded, placementInspectionDetail, placementInspectionTypeSpecific,
            placementInspectionKnowledge,
            availableStorageTypes, createPlacement, placementCreationView, placementCreationBadgeClass, placementCreationButtonLabel,
            snapshotDistributionStorageTypes, snapshotDistributionStorageOptions,
            preferredPlacementCreationCoordinator, createPreferredPlacement, preferredPlacementCreationView,
            preferredPlacementCreationBadgeClass, preferredPlacementCreationButtonLabel,
            ipfsRemotePublicationCoordinator, publicationContentStore,
            toggleIpfsRemotePublishingConfigureForm,
            saveIpfsRemotePublishingConfiguration, clearIpfsRemotePublishingConfiguration,
            ipfsRemotePublishingConfigurationView, publishToRemoteIpfs,
            ipfsRemotePublicationView, ipfsRemotePublicationBadgeClass, isIpfsRemotePublishing,
            IpfsRemotePublicationState,
            ipfsPublicationContentVerificationCoordinator,
            verifyIpfsPublicationContent, ipfsPublicationContentVerificationView, ipfsPublicationContentVerificationBadgeClass,
            isVerifyingIpfsPublicationContent, ipfsPublicationContentVerifyButtonLabel,
            ipfsPublicationRecordHistoryView, toggleIpfsPublicationRecordHistory,
            toggleIpfsPublicationRecordInspection, isIpfsPublicationRecordInspectionExpanded,
            verifyIpfsPublicationRecordHistoryEntry, isVerifyingIpfsPublicationRecordHistoryEntry,
            ipfsPublicationRecordVerificationHistoryView, latestIpfsPublicationRecordVerificationView,
            ipfsPublicationRecordVerificationBadgeClass, ipfsPublicationVerificationEntryBadgeClass,
            ipfsPublicationRecordVerifyButtonLabel,
            toggleIpfsPublicationRecordVerificationHistory, isIpfsPublicationRecordVerificationHistoryExpanded,
            ipfsPublicationObservationTimelineView, toggleIpfsPublicationObservationTimeline,
            ipfsPublicationObservationTimelineEntryBadgeClass, IpfsPublicationObservationTimelineEntryKind,
            crossDomainPublicationObservationTimelineView, toggleCrossDomainPublicationObservationTimeline,
            crossDomainPublicationObservationTimelineEntryBadgeClass, crossDomainPublicationObservationTimelineEntryDomainLabel,
            PublicationObservationTimelineEntryKind, PublicationObservationTimelineDomain,
            publicationObservationArchiveView, publicationObservationArchiveExpanded,
            togglePublicationObservationArchive, clearPublicationObservationArchive,
            publicationArchiveExportedPackage, exportPublicationArchive,
            showPublicationArchiveImportForm, togglePublicationArchiveImportForm,
            publicationArchiveImportText, onPublicationArchiveImportFileChosen,
            publicationArchiveImportOutcome, publicationArchiveImportPreview,
            confirmPublicationArchiveImport, PublicationObservationArchiveImportOutcome,
            showPublicationArchiveInspectionForm, togglePublicationArchiveInspectionForm,
            publicationArchiveInspectionText, onPublicationArchiveInspectionFileChosen,
            publicationArchiveInspectionOutcome, PublicationObservationArchiveInspectionOutcome,
            publicationArchiveDifferenceResult, invalidatePublicationArchiveDifference,
            comparePublicationArchiveDifference, publicationArchiveDifferenceCollectionRows,
            publicationArchiveReplacementReviewResult, reviewPublicationArchiveReplacement,
            cancelPublicationArchiveReplacementReview, confirmPublicationArchiveReplacementFromReview,
            publicationObservationArchiveProvenanceView,
            publicationObservationArchiveFingerprintView, copyArchiveFingerprint, archiveFingerprintCopied,
            archiveFingerprintComparisonInput, archiveFingerprintComparisonResult,
            onArchiveFingerprintComparisonInputChanged, compareArchiveFingerprint,
            PublicationObservationArchiveFingerprintComparisonResult,
            historicalBitcoinAnchorsExpanded, toggleHistoricalBitcoinAnchors, historicalBitcoinAnchorArchiveView,
            toggleHistoricalBitcoinAnchorEntry, isHistoricalBitcoinAnchorEntryExpanded, historicalBitcoinAnchorEvidenceView,
            bitcoinAnchorPublicationsExpanded, toggleBitcoinAnchorPublications, bitcoinAnchorPublicationRecordHistoryView,
            toggleBitcoinAnchorPublicationInspection, isBitcoinAnchorPublicationInspectionExpanded, bitcoinAnchorPublicationInspectionView,
            toggleBitcoinAnchorPublicationLifecycle, isBitcoinAnchorPublicationLifecycleExpanded,
            bitcoinAnchorPublicationLifecycleTimelineView, bitcoinAnchorPublicationLifecycleEntryDetail,
            baseAnchorPublicationsExpanded, toggleBaseAnchorPublications, baseAnchorPublicationRecordHistoryView,
            toggleBaseAnchorPublicationLifecycle, isBaseAnchorPublicationLifecycleExpanded,
            baseAnchorPublicationLifecycleTimelineView, baseAnchorPublicationLifecycleEntryDetail,
            publicationReferencesExpanded, togglePublicationReferences, knownPublicationIdentityOptions,
            publicationReferenceSourceKey, publicationReferenceReferencedKey, publicationReferenceError,
            recordPublicationReference, publicationReferenceRecordHistoryView,
            publicationReferenceGraphExpanded, togglePublicationReferenceGraph, publicationReferenceGraphView,
            togglePublicationReferenceGraphNode, isPublicationReferenceGraphNodeExpanded,
            achievementsExpanded, toggleAchievements, achievementBadgesView,
            toggleAchievementBadge, isAchievementBadgeExpanded,
            canViewAchievementBadgeLifecycle, viewAchievementBadgeLifecycle,
            achievementProfileExpanded, toggleAchievementProfile,
            achievementProfileSelectedKey, achievementProfileView,
            publisherAssociationsExpanded, togglePublisherAssociations,
            publisherAssociationPublisherId, publisherAssociationPublicationKey, publisherAssociationError,
            recordPublisherAssociation, publisherPublicationAssociationRecordHistoryView,
            distinctPublisherIdentifiersView, publisherAssociationSelectedPublisherId, publisherAssociationProfileView,
            decentralizationContrast,
            knowledgeSynchronizationCoordinator, synchronizeWithPeers, synchronizationView, synchronizationBadgeClass, synchronizationButtonLabel,
            toggleReplicaKnowledge, acquisitionBreakdownSentence,
            localSnapshotContentAvailabilityUseCase, checkLocalSnapshotAvailability, localSnapshotAvailabilityView,
            localSnapshotAvailabilityBadgeClass, localSnapshotAvailabilityButtonLabel,
            replicaContentKnowledgeView,
            snapshotAcquisitionView, snapshotAcquisitionOutcomeCountsSentence, snapshotAcquisitionNeedsSourceHint,
            snapshotStateInspectionView, snapshotStatePlacementRelationshipLabel,
            localSnapshotMaterializationSourceView,
            snapshotContentMaterializationCoordinator, onMaterializationFileChosen, importSnapshotContent,
            materializationView, materializationBadgeClass, materializationButtonLabel,
            snapshotPlacementMaterializationCoordinator, materializePlacement,
            placementMaterializationView, placementMaterializationBadgeClass, placementMaterializationButtonLabel,
            snapshotPeerMaterializationCoordinator, requestSnapshotFromPeer,
            peerMaterializationView, peerMaterializationBadgeClass, peerMaterializationButtonLabel,
            snapshotPeerPossessionCoordinator, checkSnapshotPossessionWithPeer,
            peerPossessionView, peerPossessionBadgeClass, peerPossessionButtonLabel,
            materializationHistoryDetailsView, materializationSourceCountsSentence, toggleMaterializationHistory,
            isMaterializationHistoryEntryExpanded, toggleMaterializationHistoryEntry,
            togglePeerPossessionCompareSelection, checkSnapshotPossessionWithSelectedPeers,
            peerPossessionComparisonView, peerPossessionComparisonRowBadgeClass, peerPossessionComparisonRowLabel,
            peerPossessionObservationHistoryView, togglePeerPossessionComparisonHistory, peerPossessionRowLabel,
            peerPossessionObservationDetailsView, isPeerPossessionObservationHistoryEntryExpanded, togglePeerPossessionObservationHistoryEntry,
            snapshotMaterializationSelectionCoordinator, materializeFromComparisonPeer,
            comparisonPeerMaterializationView, comparisonPeerMaterializationBadgeClass, comparisonPeerMaterializationButtonLabel,
            bitcoinAnchorProofReconciliationView, reconcileBitcoinAnchor, bitcoinAnchorReconciliationView,
            bitcoinAnchorConfirmationBadgeClass, bitcoinAnchorContentProofBadgeClass, bitcoinAnchorReconcileButtonLabel,
            bitcoinAnchorConfirmationHistoryView, toggleBitcoinAnchorConfirmationHistory, isBitcoinAnchorConfirmationHistoryExpanded,
            toggleBitcoinAnchorConfirmationHistoryEntry, isBitcoinAnchorConfirmationHistoryEntryExpanded,
            bitcoinAnchorChainPlacementComparisonView, toggleBitcoinAnchorChainPlacementComparison, isBitcoinAnchorChainPlacementComparisonExpanded,
            bitcoinAnchorObservationConsistencyView, toggleBitcoinAnchorObservationConsistency, isBitcoinAnchorObservationConsistencyExpanded,
            bitcoinAnchorObservationEvidenceView, toggleBitcoinAnchorObservationEvidence, isBitcoinAnchorObservationEvidenceExpanded,
            bitcoinWalletConnection, bitcoinWalletConnectionState, connectBitcoinWallet, disconnectBitcoinWallet,
            bitcoinWalletConnectionView, bitcoinWalletConnectionBadgeClass, isBitcoinWalletConnected, isBitcoinWalletConnecting,
            bitcoinAnchorTransactionReview, bitcoinAnchorTransactionReviewView, bitcoinAnchorTransactionReviewWalletMatchView,
            bitcoinWalletFundingObserver, bitcoinAnchorFundingState, observeBitcoinAnchorFunding,
            bitcoinAnchorFundingView, bitcoinAnchorFundingBadgeClass, isBitcoinAnchorFundingObserved,
            bitcoinAnchorFundingUtxosExpanded, toggleBitcoinAnchorFundingUtxosExpanded,
            baseWalletConnection, baseWalletConnectionState, connectBaseWallet, disconnectBaseWallet,
            baseWalletConnectionView, baseWalletConnectionBadgeClass, isBaseWalletConnected, isBaseWalletConnecting,
            baseNetworkObserver, baseAccountObservationState, observeBaseAccount,
            baseAccountObservationView, baseAccountObservationBadgeClass, BaseNetworkObservationState,
            isBaseAccountObserved,
            basePublicationTransactionPlanCoordinator, constructBasePublicationTransaction,
            basePublicationTransactionPlanView, basePublicationTransactionPlanBadgeClass,
            BasePublicationTransactionPlanState,
            basePublicationTransactionReviewView,
            baseAnchorPublisher, createBaseAnchor,
            baseAnchorCreationView, baseAnchorCreationBadgeClass, baseAnchorCreationButtonLabel,
            baseReviewedSigningCoordinator, signBaseReviewedTransaction,
            baseReviewedTransactionSigningView, baseReviewedTransactionSigningBadgeClass, isBaseReviewedTransactionSigning,
            BaseReviewedSigningState,
            baseSignedTransactionFinalizationCoordinator, finalizeBaseSignedTransaction,
            baseSignedTransactionFinalizationView, baseSignedTransactionFinalizationBadgeClass,
            BaseSignedTransactionFinalizationState,
            baseTransactionBroadcastCoordinator, broadcastBaseTransaction,
            baseTransactionBroadcastView, baseTransactionBroadcastBadgeClass, isBaseTransactionBroadcasting,
            BaseTransactionBroadcastState,
            baseTransactionInclusionObservationCoordinator, observeBaseTransactionInclusion,
            baseTransactionInclusionView, baseTransactionInclusionBadgeClass, isBaseTransactionInclusionObserving,
            baseTransactionInclusionHistoryView, toggleBaseTransactionInclusionHistory,
            BaseTransactionInclusionObservationState,
            bitcoinAnchorTransactionConstructionCoordinator, constructBitcoinAnchorTransaction,
            bitcoinAnchorTransactionConstructionView, bitcoinAnchorTransactionConstructionBadgeClass,
            BitcoinAnchorTransactionConstructionState,
            signBitcoinAnchorReviewedTransaction,
            bitcoinAnchorReviewedSigningView, bitcoinAnchorReviewedSigningBadgeClass, isBitcoinAnchorReviewedSigning,
            BitcoinAnchorReviewedSigningState,
            finalizeBitcoinAnchorSignedPsbt,
            bitcoinAnchorSignedPsbtFinalizationView, bitcoinAnchorSignedPsbtFinalizationBadgeClass,
            BitcoinAnchorSignedPsbtFinalizationState,
            bitcoinAnchorFinalizedTransaction, broadcastBitcoinAnchorTransaction,
            bitcoinAnchorBroadcastView, bitcoinAnchorBroadcastBadgeClass, isBitcoinAnchorBroadcasting,
            BitcoinAnchorBroadcastState,
            bitcoinAnchorPublicationCoordinator,
            bitcoinAnchorPublicationView, bitcoinAnchorPublicationBadgeClass,
            observeBitcoinAnchorBroadcastConfirmation,
            bitcoinAnchorBroadcastConfirmationObserving, bitcoinAnchorBroadcastConfirmationError,
            bitcoinAnchorBroadcastConfirmationView, bitcoinAnchorBroadcastConfirmationBadgeClass,
            bitcoinAnchorBroadcastConfirmationHistoryView, toggleBitcoinAnchorBroadcastConfirmationHistory,
            bitcoinAnchorBroadcastConfirmationHistoryExpanded, toggleBitcoinAnchorBroadcastConfirmationHistoryEntry,
            isBitcoinAnchorBroadcastConfirmationHistoryEntryExpanded,
            publicationsToolsTab, setPublicationsToolsTab,
            setEntryDetailsTab
        };
    },
    template: `
        <section class="publications-view">
            <h1>Publications</h1>
            <p class="form-hint form-hint--neutral">
                Every signed publication this device has cataloged — its own, or one a connected peer
                announced (see <router-link to="/peers">Peers</router-link>). Status is always checked fresh,
                never remembered from last time: cataloging a publication only ever means this device has SEEN
                a validly signed locator, never that its content is sitting here right now.
            </p>
            <p v-if="retrievalPeers.length === 0" class="form-hint form-hint--neutral">
                No authenticated peer is connected right now — "Retrieve from Peers" below will do nothing
                until one is. Connect to a peer first from <router-link to="/peers">Peers</router-link>.
            </p>

            <!-- Page-level tools, collapsed so the publication list stays on
                 screen. -->
            <details class="publications-tools-panel">
                <summary class="publications-tools-panel-summary">Wallet, Archive &amp; Publisher Tools</summary>

                <!-- Tab panels use v-show so card state survives tab switches. -->
                <div class="publications-tools-tabs" role="tablist">
                    <button type="button" role="tab" :aria-selected="publicationsToolsTab === 'anchoring'"
                            :class="['publications-tools-tab', { 'publications-tools-tab--active': publicationsToolsTab === 'anchoring' }]"
                            @click="setPublicationsToolsTab('anchoring')">
                        Blockchain Anchoring
                    </button>
                    <button type="button" role="tab" :aria-selected="publicationsToolsTab === 'archive'"
                            :class="['publications-tools-tab', { 'publications-tools-tab--active': publicationsToolsTab === 'archive' }]"
                            @click="setPublicationsToolsTab('archive')">
                        Archive Tools
                    </button>
                    <button type="button" role="tab" :aria-selected="publicationsToolsTab === 'connections'"
                            :class="['publications-tools-tab', { 'publications-tools-tab--active': publicationsToolsTab === 'connections' }]"
                            @click="setPublicationsToolsTab('connections')">
                        References &amp; Achievements
                    </button>
                </div>

            <div v-show="publicationsToolsTab === 'anchoring'">
            <!-- Bitcoin funding: page-level, for a transaction not built yet.
                 Selects and spends nothing. -->
            <div v-if="bitcoinWalletFundingObserver && isBitcoinWalletConnected()" class="identity-mgmt-card">
                <div class="identity-mgmt-card-header">
                    <span class="identity-mgmt-name">Bitcoin Funding</span>
                </div>
                <p class="form-hint form-hint--neutral">
                    What the connected wallet's own account can currently spend, as of the moment this was last
                    observed. Nothing is selected, spent, or committed by observing this — it is a fact about a
                    moment, not a promise about right now.
                </p>
                <dl class="evidence-fields">
                    <div class="evidence-field"><dt>Network</dt><dd>{{ bitcoinWalletConnectionState.network }}</dd></div>
                    <div class="evidence-field"><dt>Account</dt><dd>{{ shortId(bitcoinWalletConnectionState.account) }}</dd></div>
                </dl>
                <button type="button" class="action-btn action-btn--secondary" :disabled="bitcoinAnchorFundingState.observing" @click="observeBitcoinAnchorFunding">
                    {{ bitcoinAnchorFundingState.observing ? 'Observing…' : (bitcoinAnchorFundingView() ? 'Refresh Funding' : 'Observe Wallet Funding') }}
                </button>
                <p v-if="bitcoinAnchorFundingState.error" class="form-hint form-hint--neutral">{{ bitcoinAnchorFundingState.error }}</p>

                <div v-if="bitcoinAnchorFundingView()" class="evidence-inspection-adapter">
                    <span class="peer-badge" :class="bitcoinAnchorFundingBadgeClass()">{{ bitcoinAnchorFundingView().stateLabel }}</span>

                    <p v-if="bitcoinAnchorFundingView().networkMismatch" class="form-hint form-hint--neutral">
                        ⚠ This funding was observed on {{ bitcoinAnchorFundingView().network }}, but the connected
                        wallet is now on {{ bitcoinAnchorFundingView().expectedNetwork }}. Refresh funding before
                        relying on it.
                    </p>
                    <p v-else-if="bitcoinAnchorFundingView().reason" class="form-hint form-hint--neutral">
                        {{ bitcoinAnchorFundingView().reason }}
                    </p>

                    <dl v-if="isBitcoinAnchorFundingObserved()" class="evidence-fields">
                        <div class="evidence-field"><dt>UTXOs observed</dt><dd>{{ bitcoinAnchorFundingView().utxoCount }}</dd></div>
                        <div class="evidence-field"><dt>Total</dt><dd>{{ bitcoinAnchorFundingView().totalValueSats }} sat</dd></div>
                        <div class="evidence-field"><dt>Script type</dt><dd>{{ bitcoinAnchorFundingView().scriptType }}</dd></div>
                    </dl>

                    <button v-if="bitcoinAnchorFundingView().utxoCount > 0" type="button" class="action-btn action-btn--secondary"
                        @click="toggleBitcoinAnchorFundingUtxosExpanded">
                        {{ bitcoinAnchorFundingUtxosExpanded ? 'Hide Funding Inputs' : 'Show Funding Inputs' }}
                    </button>
                    <template v-if="bitcoinAnchorFundingUtxosExpanded">
                        <dl v-for="utxo in bitcoinAnchorFundingView().utxos" :key="utxo.txid + ':' + utxo.vout" class="evidence-fields">
                            <div class="evidence-field">
                                <dt>{{ shortId(utxo.txid) }}:{{ utxo.vout }}</dt>
                                <dd>{{ utxo.valueSats }} sat ({{ utxo.scriptType }}{{ utxo.confirmed ? '' : ', unconfirmed' }})</dd>
                            </div>
                        </dl>
                    </template>

                    <dl v-if="isBitcoinAnchorFundingObserved()" class="evidence-fields">
                        <div class="evidence-field"><dt>Change destination</dt><dd>{{ shortId(bitcoinAnchorFundingView().changeAccount) }}</dd></div>
                    </dl>
                    <p v-if="isBitcoinAnchorFundingObserved()" class="form-hint form-hint--neutral">
                        Change returns to the connected wallet's own account — no separate change address is
                        requested from the wallet.
                    </p>
                </div>
            </div>

            <!-- Base network and account: page-level, observation only (no
                 signing capability). -->
            <div v-if="baseWalletConnection" class="identity-mgmt-card">
                <div class="identity-mgmt-card-header">
                    <span class="identity-mgmt-name">Base Network</span>
                </div>
                <p class="form-hint form-hint--neutral">
                    Observing an account here never constructs, signs, or broadcasts a transaction — it is a fact
                    about a moment, read fresh every time this is asked.
                </p>

                <div class="evidence-inspection-adapter">
                    <span class="peer-badge" :class="baseWalletConnectionBadgeClass()">
                        {{ baseWalletConnectionView().stateLabel }}
                    </span>
                    <dl v-if="isBaseWalletConnected()" class="evidence-fields">
                        <div class="evidence-field"><dt>Account</dt><dd>{{ shortId(baseWalletConnectionView().address) }}</dd></div>
                    </dl>
                    <p v-if="baseWalletConnectionState.reason" class="form-hint form-hint--neutral">
                        {{ baseWalletConnectionState.reason }}
                    </p>
                </div>
                <div class="identity-mgmt-actions">
                    <button v-if="!isBaseWalletConnected()" class="action-btn action-btn--secondary"
                            :disabled="isBaseWalletConnecting()"
                            @click="connectBaseWallet()">
                        {{ isBaseWalletConnecting() ? 'Connecting…' : 'Connect Base Wallet' }}
                    </button>
                    <button v-else class="action-btn action-btn--secondary" @click="disconnectBaseWallet()">
                        Disconnect
                    </button>
                </div>

                <template v-if="baseNetworkObserver && isBaseWalletConnected()">
                    <button type="button" class="action-btn action-btn--secondary" :disabled="baseAccountObservationState.observing" @click="observeBaseAccount">
                        {{ baseAccountObservationState.observing ? 'Observing…' : (baseAccountObservationView() ? 'Refresh Observation' : 'Observe Base Account') }}
                    </button>
                    <p v-if="baseAccountObservationState.error" class="form-hint form-hint--neutral">{{ baseAccountObservationState.error }}</p>

                    <div v-if="baseAccountObservationView()" class="evidence-inspection-adapter">
                        <span class="peer-badge" :class="baseAccountObservationBadgeClass()">{{ baseAccountObservationView().stateLabel }}</span>

                        <dl v-if="baseAccountObservationView().state === BaseNetworkObservationState.OBSERVED" class="evidence-fields">
                            <div class="evidence-field"><dt>Network</dt><dd>{{ baseAccountObservationView().network }}</dd></div>
                            <div class="evidence-field"><dt>Chain ID</dt><dd>{{ baseAccountObservationView().chainId }}</dd></div>
                            <div class="evidence-field"><dt>Account</dt><dd>{{ shortId(baseAccountObservationView().address) }}</dd></div>
                            <div class="evidence-field"><dt>Native balance</dt><dd>{{ baseAccountObservationView().nativeBalanceWei }} wei</dd></div>
                            <div class="evidence-field"><dt>Observed at</dt><dd>{{ baseAccountObservationView().observedAt }}</dd></div>
                        </dl>

                        <!-- A non-Base network is shown with its actual chain
                             id, never relabeled. -->
                        <dl v-else-if="baseAccountObservationView().state === BaseNetworkObservationState.CHAIN_MISMATCH" class="evidence-fields">
                            <div class="evidence-field"><dt>Chain ID</dt><dd>{{ baseAccountObservationView().chainId }}</dd></div>
                        </dl>

                        <p v-if="baseAccountObservationView().reason" class="form-hint form-hint--neutral">
                            {{ baseAccountObservationView().reason }}
                        </p>
                    </div>
                </template>
            </div>

            <!-- Bitcoin transaction review: page-level, before anything is
                 published. -->
            <p v-if="bitcoinAnchorTransactionReview.reason && !bitcoinAnchorTransactionReviewView()" class="form-hint form-hint--neutral">
                {{ bitcoinAnchorTransactionReview.reason }}
            </p>
            <div v-if="bitcoinAnchorTransactionReviewView()" class="identity-mgmt-card">
                <div class="identity-mgmt-card-header">
                    <span class="identity-mgmt-name">Review Bitcoin Anchor Transaction</span>
                </div>
                <p class="form-hint form-hint--neutral">
                    Nothing is signed or published by viewing this review. It names exactly what a wallet
                    would be asked to sign — nothing more, and nothing assumed.
                </p>
                <dl class="evidence-fields">
                    <div class="evidence-field"><dt>Network</dt><dd>{{ bitcoinAnchorTransactionReviewView().network }}</dd></div>
                    <div class="evidence-field"><dt>Content hash</dt><dd>{{ bitcoinAnchorTransactionReviewView().contentHash }}</dd></div>
                    <div class="evidence-field"><dt>Fee</dt><dd>{{ bitcoinAnchorTransactionReviewView().feeSats }} sat</dd></div>
                    <div class="evidence-field"><dt>Change</dt><dd>{{ bitcoinAnchorTransactionReviewView().changeSats }} sat</dd></div>
                    <div class="evidence-field"><dt>Total input</dt><dd>{{ bitcoinAnchorTransactionReviewView().totalInputSats }} sat</dd></div>
                </dl>
                <div class="evidence-inspection-adapter">
                    <span class="evidence-inspection-adapter-title">Inputs</span>
                    <dl v-for="input in bitcoinAnchorTransactionReviewView().inputs" :key="input.txid + ':' + input.vout" class="evidence-fields">
                        <div class="evidence-field"><dt>{{ shortId(input.txid) }}:{{ input.vout }}</dt><dd>{{ input.valueSats }} sat ({{ input.scriptType }})</dd></div>
                    </dl>
                </div>
                <div class="evidence-inspection-adapter">
                    <span class="evidence-inspection-adapter-title">Outputs</span>
                    <dl v-for="(output, index) in bitcoinAnchorTransactionReviewView().outputs" :key="index" class="evidence-fields">
                        <div class="evidence-field">
                            <dt>{{ output.type === 'change' ? 'Change' : 'OP_RETURN' }}</dt>
                            <dd>{{ output.address ? shortId(output.address) + ' — ' : '' }}{{ output.valueSats }} sat</dd>
                        </div>
                    </dl>
                </div>

                <!-- A network mismatch is named, never auto-corrected. -->
                <div v-if="bitcoinAnchorTransactionReviewWalletMatchView()" class="evidence-inspection-adapter">
                    <span class="evidence-inspection-adapter-title">Wallet</span>
                    <span class="peer-badge" :class="bitcoinWalletConnectionBadgeClass()">
                        {{ bitcoinAnchorTransactionReviewWalletMatchView().stateLabel }}
                    </span>
                    <dl v-if="isBitcoinWalletConnected()" class="evidence-fields">
                        <div class="evidence-field"><dt>Account</dt><dd>{{ shortId(bitcoinAnchorTransactionReviewWalletMatchView().account) }}</dd></div>
                        <div class="evidence-field"><dt>Wallet network</dt><dd>{{ bitcoinAnchorTransactionReviewWalletMatchView().network }}</dd></div>
                        <div class="evidence-field"><dt>Transaction network</dt><dd>{{ bitcoinAnchorTransactionReviewWalletMatchView().expectedNetwork }}</dd></div>
                    </dl>
                    <p v-if="bitcoinAnchorTransactionReviewWalletMatchView().networkMismatch" class="form-hint form-hint--neutral">
                        ⚠ Wallet network ({{ bitcoinAnchorTransactionReviewWalletMatchView().network }}) does not match this
                        transaction's network ({{ bitcoinAnchorTransactionReviewWalletMatchView().expectedNetwork }}).
                        Signing is unavailable until a wallet on the matching network is connected.
                    </p>
                    <p v-else-if="isBitcoinWalletConnected()" class="form-hint form-hint--neutral">
                        ✓ Network matches.
                    </p>
                </div>

                <!-- The only signing action. A connected wallet is a
                     capability, not permission; the reviewed PSBT is handed
                     over byte for byte. -->
                <div class="evidence-inspection-adapter">
                    <span class="evidence-inspection-adapter-title">Signing</span>
                    <button type="button" class="action-btn action-btn--secondary"
                        :disabled="!isBitcoinWalletConnected() || (bitcoinAnchorTransactionReviewWalletMatchView() && bitcoinAnchorTransactionReviewWalletMatchView().networkMismatch) || isBitcoinAnchorReviewedSigning()"
                        @click="signBitcoinAnchorReviewedTransaction">
                        {{ isBitcoinAnchorReviewedSigning() ? 'Waiting for wallet…' : 'Sign Reviewed Transaction' }}
                    </button>

                    <span v-if="bitcoinAnchorReviewedSigningView().state !== BitcoinAnchorReviewedSigningState.IDLE" class="peer-badge"
                        :class="bitcoinAnchorReviewedSigningBadgeClass()">
                        {{ bitcoinAnchorReviewedSigningView().stateLabel }}
                    </span>
                    <p v-if="bitcoinAnchorReviewedSigningView().reason" class="form-hint form-hint--neutral">
                        {{ bitcoinAnchorReviewedSigningView().reason }}
                    </p>

                    <!-- SIGNED only means the wallet returned signing material
                         for this transaction, not that it has been verified. -->
                    <template v-if="bitcoinAnchorReviewedSigningView().state === BitcoinAnchorReviewedSigningState.SIGNED">
                        <dl class="evidence-fields">
                            <div class="evidence-field"><dt>Signed inputs</dt><dd>{{ bitcoinAnchorReviewedSigningView().signedInputCount }}</dd></div>
                        </dl>
                        <p class="form-hint form-hint--neutral">
                            The wallet returned a signed PSBT. ForkBuild has not yet cryptographically verified
                            or finalized it — that is a separate, explicit step.
                        </p>
                    </template>
                </div>

                <!-- A wallet-returned PSBT is untrusted until verified and
                     finalized here. -->
                <div v-if="bitcoinAnchorReviewedSigningView().state === BitcoinAnchorReviewedSigningState.SIGNED" class="evidence-inspection-adapter">
                    <span class="evidence-inspection-adapter-title">Verification &amp; Finalization</span>
                    <p class="form-hint form-hint--neutral">
                        The wallet returned signing material. ForkBuild has not yet accepted it as a valid
                        signature.
                    </p>
                    <button type="button" class="action-btn action-btn--secondary" @click="finalizeBitcoinAnchorSignedPsbt">
                        Verify &amp; Finalize Transaction
                    </button>

                    <span v-if="bitcoinAnchorSignedPsbtFinalizationView().state !== BitcoinAnchorSignedPsbtFinalizationState.IDLE" class="peer-badge"
                        :class="bitcoinAnchorSignedPsbtFinalizationBadgeClass()">
                        {{ bitcoinAnchorSignedPsbtFinalizationView().stateLabel }}
                    </span>
                    <p v-if="bitcoinAnchorSignedPsbtFinalizationView().reason" class="form-hint form-hint--neutral">
                        {{ bitcoinAnchorSignedPsbtFinalizationView().reason }}
                    </p>

                    <template v-if="bitcoinAnchorSignedPsbtFinalizationView().state === BitcoinAnchorSignedPsbtFinalizationState.FINALIZED">
                        <dl class="evidence-fields">
                            <div class="evidence-field"><dt>Signature verification</dt><dd>✓ Verified</dd></div>
                            <div class="evidence-field">
                                <dt>Verified inputs</dt>
                                <dd>{{ bitcoinAnchorSignedPsbtFinalizationView().verifiedInputCount }} / {{ bitcoinAnchorReviewedSigningView().signedInputCount }}</dd>
                            </div>
                            <div class="evidence-field"><dt>Transaction ID</dt><dd>{{ bitcoinAnchorSignedPsbtFinalizationView().txid }}</dd></div>
                        </dl>
                        <details class="evidence-inspection-proof">
                            <summary>Raw transaction bytes</summary>
                            <pre class="evidence-inspection-proof-json">{{ bitcoinAnchorSignedPsbtFinalizationView().rawTransactionHex }}</pre>
                        </details>
                        <p class="form-hint form-hint--neutral">
                            Transaction finalized. Broadcasting it is a separate, explicit step.
                        </p>
                    </template>
                </div>

                <!-- The only step that reaches the network. BROADCASTED means
                     accepted, not confirmed; no automatic retry. -->
                <div v-if="bitcoinAnchorFinalizedTransaction" class="evidence-inspection-adapter">
                    <span class="evidence-inspection-adapter-title">Broadcast</span>
                    <dl class="evidence-fields">
                        <div class="evidence-field"><dt>Transaction ID</dt><dd>{{ bitcoinAnchorFinalizedTransaction.txid }}</dd></div>
                        <div class="evidence-field"><dt>Finalized transaction</dt><dd>{{ bitcoinAnchorFinalizedTransaction.rawTransaction.bytes.length }} bytes</dd></div>
                    </dl>
                    <p class="form-hint form-hint--neutral">
                        This is the exact transaction that was reviewed, signed, and cryptographically verified.
                        Broadcasting submits it; it does not decide whether the network will accept it.
                    </p>
                    <button type="button" class="action-btn action-btn--secondary"
                        :disabled="isBitcoinAnchorBroadcasting()"
                        @click="broadcastBitcoinAnchorTransaction">
                        {{ isBitcoinAnchorBroadcasting() ? 'Broadcasting…' : (bitcoinAnchorBroadcastView().state === BitcoinAnchorBroadcastState.IDLE ? 'Broadcast Transaction' : 'Broadcast Again') }}
                    </button>

                    <span v-if="bitcoinAnchorBroadcastView().state !== BitcoinAnchorBroadcastState.IDLE" class="peer-badge"
                        :class="bitcoinAnchorBroadcastBadgeClass()">
                        {{ bitcoinAnchorBroadcastView().stateLabel }}
                    </span>
                    <p v-if="bitcoinAnchorBroadcastView().reason" class="form-hint form-hint--neutral">
                        {{ bitcoinAnchorBroadcastView().reason }}
                    </p>

                    <template v-if="bitcoinAnchorBroadcastView().state === BitcoinAnchorBroadcastState.BROADCASTED">
                        <dl class="evidence-fields">
                            <div class="evidence-field"><dt>Transaction ID</dt><dd>{{ bitcoinAnchorBroadcastView().txid }}</dd></div>
                        </dl>
                        <details class="evidence-inspection-proof">
                            <summary>Raw transaction bytes</summary>
                            <pre class="evidence-inspection-proof-json">{{ bitcoinAnchorFinalizedTransaction.rawTransaction.hex }}</pre>
                        </details>
                        <p class="form-hint form-hint--neutral">
                            Transaction broadcasted. This is not yet confirmation — observing confirmation is a
                            separate, explicit step.
                        </p>

                        <!-- Anchor minted automatically after BROADCASTED. -->
                        <template v-if="bitcoinAnchorPublicationCoordinator">
                            <span v-if="bitcoinAnchorPublicationView().label" class="peer-badge"
                                :class="bitcoinAnchorPublicationBadgeClass()">
                                {{ bitcoinAnchorPublicationView().label }}
                            </span>
                            <p v-if="bitcoinAnchorPublicationView().message" class="form-hint form-hint--neutral">
                                {{ bitcoinAnchorPublicationView().message }}
                            </p>
                            <p v-if="bitcoinAnchorPublicationView().reason" class="form-hint form-hint--neutral">
                                {{ bitcoinAnchorPublicationView().reason }}
                            </p>
                            <dl v-if="bitcoinAnchorPublicationView().anchor" class="evidence-fields">
                                <div class="evidence-field"><dt>Publication Anchor</dt><dd>{{ bitcoinAnchorPublicationView().anchor.id }}</dd></div>
                            </dl>
                        </template>
                    </template>
                </div>

                <!-- Confirmation is a separate explicit action; each click
                     appends to the history. -->
                <div v-if="bitcoinAnchorBroadcastView().state === BitcoinAnchorBroadcastState.BROADCASTED" class="evidence-inspection-adapter">
                    <span class="evidence-inspection-adapter-title">Confirmation</span>
                    <p class="form-hint form-hint--neutral">
                        The network accepted this transaction for broadcast. Whether it has since been mined
                        into a block is a separate, later observation.
                    </p>

                    <button type="button" class="action-btn action-btn--secondary"
                        :disabled="bitcoinAnchorBroadcastConfirmationObserving"
                        @click="observeBitcoinAnchorBroadcastConfirmation">
                        {{ bitcoinAnchorBroadcastConfirmationObserving ? 'Observing…' : (bitcoinAnchorBroadcastConfirmationView() ? 'Observe Confirmation Again' : 'Observe Confirmation') }}
                    </button>
                    <p v-if="bitcoinAnchorBroadcastConfirmationError" class="form-hint form-hint--neutral">
                        {{ bitcoinAnchorBroadcastConfirmationError }}
                    </p>

                    <template v-if="bitcoinAnchorBroadcastConfirmationView()">
                        <span class="peer-badge" :class="bitcoinAnchorBroadcastConfirmationBadgeClass()">
                            {{ bitcoinAnchorBroadcastConfirmationView().stateLabel }}
                        </span>
                        <dl v-if="bitcoinAnchorBroadcastConfirmationView().blockHeight !== null" class="evidence-fields">
                            <div class="evidence-field"><dt>Block height</dt><dd>{{ bitcoinAnchorBroadcastConfirmationView().blockHeight }}</dd></div>
                            <div class="evidence-field"><dt>Block hash</dt><dd>{{ bitcoinAnchorBroadcastConfirmationView().blockHash }}</dd></div>
                            <div class="evidence-field"><dt>Confirmations</dt><dd>{{ bitcoinAnchorBroadcastConfirmationView().confirmationCount }}</dd></div>
                        </dl>
                        <p v-if="bitcoinAnchorBroadcastConfirmationView().reason" class="form-hint form-hint--neutral">
                            {{ bitcoinAnchorBroadcastConfirmationView().reason }}
                        </p>

                        <button v-if="bitcoinAnchorBroadcastConfirmationHistoryView().count > 0" type="button" class="action-btn action-btn--secondary"
                            @click="toggleBitcoinAnchorBroadcastConfirmationHistory">
                            {{ bitcoinAnchorBroadcastConfirmationHistoryExpanded ? 'Hide Confirmation History' : 'Show Confirmation History' }}
                        </button>
                    </template>

                    <!-- Confirmations of this broadcast, separate from the
                         per-anchor "Reconcile" history. -->
                    <div v-if="bitcoinAnchorBroadcastConfirmationHistoryExpanded">
                        <ul class="replica-knowledge-claim-list">
                            <li v-for="(item, index) in bitcoinAnchorBroadcastConfirmationHistoryView().entries" :key="index" class="replica-knowledge-claim">
                                <button type="button" class="action-btn action-btn--secondary"
                                    @click="toggleBitcoinAnchorBroadcastConfirmationHistoryEntry(index)">
                                    {{ formatWhen(item.observedAt) }} — {{ item.stateShortLabel }}
                                </button>
                                <dl v-if="isBitcoinAnchorBroadcastConfirmationHistoryEntryExpanded(index)" class="evidence-fields">
                                    <div class="evidence-field"><dt>State</dt><dd>{{ item.stateLabel }}</dd></div>
                                    <div class="evidence-field"><dt>Transaction ID</dt><dd>{{ item.txid }}</dd></div>
                                    <div v-if="item.blockHash" class="evidence-field"><dt>Block hash</dt><dd>{{ item.blockHash }}</dd></div>
                                    <div v-if="item.blockHeight !== null" class="evidence-field"><dt>Block height</dt><dd>{{ item.blockHeight }}</dd></div>
                                    <div v-if="item.confirmationCount !== null" class="evidence-field"><dt>Confirmations</dt><dd>{{ item.confirmationCount }}</dd></div>
                                    <div v-if="item.reason" class="evidence-field"><dt>Reason</dt><dd>{{ item.reason }}</dd></div>
                                </dl>
                            </li>
                        </ul>
                    </div>
                </div>
            </div>

            <!-- Bitcoin anchor evidence rebuilt from the durable archive; no
                 network access. -->
            <div class="identity-mgmt-card">
                <div class="identity-mgmt-card-header">
                    <span class="identity-mgmt-name">Historical Bitcoin Anchor Evidence</span>
                    <span class="peer-badge peer-badge--pending">Persisted locally</span>
                </div>
                <p class="form-hint form-hint--neutral">
                    Every Bitcoin anchor this archive holds a durable fact for, organized by its own
                    explicit anchorId. Counts below describe how much this replica has recorded for
                    each anchor — never how complete, reliable, or trustworthy that anchor's own
                    evidence is.
                </p>
                <dl class="evidence-fields">
                    <div class="evidence-field"><dt>Anchors</dt><dd>{{ historicalBitcoinAnchorArchiveView().anchorCount }}</dd></div>
                </dl>
                <div class="identity-mgmt-actions">
                    <button type="button" class="action-btn action-btn--secondary" @click="toggleHistoricalBitcoinAnchors">
                        {{ historicalBitcoinAnchorsExpanded ? 'Hide Historical Anchors' : 'Show Historical Anchors' }}
                    </button>
                </div>
                <div v-if="historicalBitcoinAnchorsExpanded" class="evidence-inspection-adapter">
                    <span class="evidence-inspection-adapter-title">Archived Bitcoin Anchors</span>
                    <p v-if="historicalBitcoinAnchorArchiveView().anchorCount === 0" class="form-hint form-hint--neutral">
                        No Bitcoin anchor facts archived yet. Broadcasting a Bitcoin transaction,
                        observing a confirmation, or recording a content-proof observation elsewhere
                        on this page adds to this archive automatically.
                    </p>
                    <ul v-else class="replica-knowledge-claim-list">
                        <li v-for="anchorRow in historicalBitcoinAnchorArchiveView().anchors" :key="anchorRow.anchorId" class="replica-knowledge-claim">
                            <button type="button" class="action-btn action-btn--secondary" @click="toggleHistoricalBitcoinAnchorEntry(anchorRow.anchorId)">
                                {{ anchorRow.anchorId }}
                            </button>
                            <p class="form-hint form-hint--neutral">
                                Broadcast observations: {{ anchorRow.broadcastObservationCount }} ·
                                Confirmation observations: {{ anchorRow.confirmationObservationCount }} ·
                                Content-proof observations: {{ anchorRow.contentProofObservationCount }} ·
                                Chain-placement comparisons: {{ anchorRow.chainPlacementComparisonCount }} ·
                                Consistency findings: {{ anchorRow.consistencyFindingCount }}
                            </p>

                            <div v-if="isHistoricalBitcoinAnchorEntryExpanded(anchorRow.anchorId) && historicalBitcoinAnchorEvidenceView(anchorRow.anchorId)" class="evidence-list">
                                <div class="evidence-list">
                                    <span class="evidence-convergence-title">Broadcast History</span>
                                    <p v-if="historicalBitcoinAnchorEvidenceView(anchorRow.anchorId).broadcastObservations.count === 0" class="form-hint form-hint--neutral">No broadcast observations recorded.</p>
                                    <ul v-else class="replica-knowledge-claim-list">
                                        <li v-for="item in historicalBitcoinAnchorEvidenceView(anchorRow.anchorId).broadcastObservations.observations" :key="item.index" class="replica-knowledge-claim">
                                            {{ item.stateLabel }} — {{ item.broadcastedAt ? formatWhen(item.broadcastedAt) : 'no timestamp recorded' }}
                                            <template v-if="item.txid"> — txid {{ item.txid }}</template>
                                        </li>
                                    </ul>
                                </div>

                                <div class="evidence-list">
                                    <span class="evidence-convergence-title">Confirmation History</span>
                                    <p v-if="historicalBitcoinAnchorEvidenceView(anchorRow.anchorId).confirmationObservations.count === 0" class="form-hint form-hint--neutral">No confirmation observations recorded.</p>
                                    <ul v-else class="replica-knowledge-claim-list">
                                        <li v-for="item in historicalBitcoinAnchorEvidenceView(anchorRow.anchorId).confirmationObservations.observations" :key="item.index" class="replica-knowledge-claim">
                                            Confirmation observation #{{ item.index }} — {{ formatWhen(item.observedAt) }} — {{ item.stateLabel }}
                                            <template v-if="item.blockHeight !== null && item.blockHeight !== undefined"> — height {{ item.blockHeight }}</template>
                                        </li>
                                    </ul>
                                </div>

                                <div class="evidence-list">
                                    <span class="evidence-convergence-title">Content-Proof History</span>
                                    <p v-if="historicalBitcoinAnchorEvidenceView(anchorRow.anchorId).contentProofObservations.count === 0" class="form-hint form-hint--neutral">No content-proof observations recorded.</p>
                                    <ul v-else class="replica-knowledge-claim-list">
                                        <li v-for="item in historicalBitcoinAnchorEvidenceView(anchorRow.anchorId).contentProofObservations.observations" :key="item.index" class="replica-knowledge-claim">
                                            Content-proof observation #{{ item.index }} — {{ formatWhen(item.observedAt) }} — {{ item.stateLabel }}
                                        </li>
                                    </ul>
                                </div>

                                <div class="evidence-list">
                                    <span class="evidence-convergence-title">Chain Placement Comparisons</span>
                                    <p v-if="historicalBitcoinAnchorEvidenceView(anchorRow.anchorId).chainPlacementObservations.count === 0" class="form-hint form-hint--neutral">Not enough confirmed observations exist yet to compare block placement.</p>
                                    <ul v-else class="replica-knowledge-claim-list">
                                        <li v-for="(comparison, index) in historicalBitcoinAnchorEvidenceView(anchorRow.anchorId).chainPlacementObservations.comparisons" :key="index" class="replica-knowledge-claim">
                                            {{ comparison.outcomeLabel }}
                                        </li>
                                    </ul>
                                </div>

                                <div class="evidence-list">
                                    <span class="evidence-convergence-title">Observation Consistency</span>
                                    <p v-if="historicalBitcoinAnchorEvidenceView(anchorRow.anchorId).consistencyFindings.count === 0" class="form-hint form-hint--neutral">Not enough confirmed observations exist yet to analyze consistency.</p>
                                    <ul v-else class="replica-knowledge-claim-list">
                                        <li v-for="(finding, index) in historicalBitcoinAnchorEvidenceView(anchorRow.anchorId).consistencyFindings.findings" :key="index" class="replica-knowledge-claim">
                                            {{ finding.stateLabel }}
                                        </li>
                                    </ul>
                                </div>

                                <div class="evidence-list">
                                    <span class="evidence-convergence-title">Combined Evidence</span>
                                    <p class="form-hint form-hint--neutral">
                                        Broadcast: {{ historicalBitcoinAnchorEvidenceView(anchorRow.anchorId).broadcastObservations.count }} ·
                                        Confirmation: {{ historicalBitcoinAnchorEvidenceView(anchorRow.anchorId).confirmationObservations.count }} ·
                                        Content-proof: {{ historicalBitcoinAnchorEvidenceView(anchorRow.anchorId).contentProofObservations.count }} ·
                                        Chain-placement: {{ historicalBitcoinAnchorEvidenceView(anchorRow.anchorId).chainPlacementObservations.count }} ·
                                        Consistency: {{ historicalBitcoinAnchorEvidenceView(anchorRow.anchorId).consistencyFindings.count }}
                                    </p>
                                    <p class="form-hint form-hint--neutral">
                                        This is a correlation of independently recorded facts by explicit anchorId — not a verdict.
                                    </p>
                                </div>
                            </div>
                        </li>
                    </ul>
                </div>
            </div>

            <!-- Only anchors this replica minted a publication identity for. -->
            <div class="identity-mgmt-card">
                <div class="identity-mgmt-card-header">
                    <span class="identity-mgmt-name">Bitcoin Anchor Publications</span>
                    <span class="peer-badge peer-badge--pending">Persisted locally</span>
                </div>
                <p class="form-hint form-hint--neutral">
                    Every Bitcoin anchor publication attempt this replica has minted a durable identity
                    for — created the moment a transaction is finalized, independent of whether its
                    broadcast later succeeds. A publication record names WHAT was published, AS WHICH
                    transaction, and on WHICH network — never whether it was later confirmed.
                </p>
                <dl class="evidence-fields">
                    <div class="evidence-field"><dt>Publications</dt><dd>{{ bitcoinAnchorPublicationRecordHistoryView().count }}</dd></div>
                </dl>
                <div class="identity-mgmt-actions">
                    <button type="button" class="action-btn action-btn--secondary" @click="toggleBitcoinAnchorPublications">
                        {{ bitcoinAnchorPublicationsExpanded ? 'Hide Publications' : 'Show Publications' }}
                    </button>
                </div>
                <div v-if="bitcoinAnchorPublicationsExpanded" class="evidence-inspection-adapter">
                    <span class="evidence-inspection-adapter-title">Publication Identities</span>
                    <p v-if="bitcoinAnchorPublicationRecordHistoryView().count === 0" class="form-hint form-hint--neutral">
                        No Bitcoin anchor publication identity minted yet. Finalizing a Bitcoin anchor
                        transaction elsewhere on this page creates one automatically.
                    </p>
                    <ul v-else class="replica-knowledge-claim-list">
                        <li v-for="publicationRow in bitcoinAnchorPublicationRecordHistoryView().records" :key="publicationRow.anchorId" class="replica-knowledge-claim">
                            <button type="button" class="action-btn action-btn--secondary" @click="toggleBitcoinAnchorPublicationInspection(publicationRow.anchorId)">
                                {{ publicationRow.anchorId }}
                            </button>
                            <p class="form-hint form-hint--neutral">
                                Content hash: {{ publicationRow.contentHash }} ·
                                Txid: {{ publicationRow.txid }} ·
                                Network: {{ publicationRow.network }} ·
                                Created: {{ formatWhen(publicationRow.createdAt) }}
                            </p>

                            <div v-if="isBitcoinAnchorPublicationInspectionExpanded(publicationRow.anchorId) && bitcoinAnchorPublicationInspectionView(publicationRow.anchorId)" class="evidence-list">
                                <span class="evidence-convergence-title">Inspect Observations</span>
                                <p class="form-hint form-hint--neutral">
                                    Broadcast: {{ bitcoinAnchorPublicationInspectionView(publicationRow.anchorId).evidence.broadcastObservations.count }} ·
                                    Confirmation: {{ bitcoinAnchorPublicationInspectionView(publicationRow.anchorId).evidence.confirmationObservations.count }} ·
                                    Content-proof: {{ bitcoinAnchorPublicationInspectionView(publicationRow.anchorId).evidence.contentProofObservations.count }} ·
                                    Chain-placement: {{ bitcoinAnchorPublicationInspectionView(publicationRow.anchorId).evidence.chainPlacementObservations.count }} ·
                                    Consistency: {{ bitcoinAnchorPublicationInspectionView(publicationRow.anchorId).evidence.consistencyFindings.count }}
                                </p>
                                <p class="form-hint form-hint--neutral">
                                    This is a correlation of independently recorded facts by explicit anchorId — not a
                                    verdict. See "Historical Bitcoin Anchor Evidence" above for the full, per-observation
                                    breakdown of this same anchorId.
                                </p>
                            </div>

                            <!-- Missing stages produce no row, never a
                                 fabricated "missing" entry. -->
                            <button type="button" class="action-btn action-btn--secondary" @click="toggleBitcoinAnchorPublicationLifecycle(publicationRow.anchorId)">
                                {{ isBitcoinAnchorPublicationLifecycleExpanded(publicationRow.anchorId) ? 'Hide Publication Lifecycle' : 'Show Publication Lifecycle' }}
                            </button>
                            <div v-if="isBitcoinAnchorPublicationLifecycleExpanded(publicationRow.anchorId)" class="evidence-list">
                                <span class="evidence-convergence-title">Publication Lifecycle</span>
                                <p v-if="!bitcoinAnchorPublicationLifecycleTimelineView(publicationRow.anchorId)" class="form-hint form-hint--neutral">
                                    No lifecycle timeline available for this anchorId.
                                </p>
                                <ul v-else class="replica-knowledge-claim-list">
                                    <li v-for="(item, timelineIndex) in bitcoinAnchorPublicationLifecycleTimelineView(publicationRow.anchorId).entries"
                                        :key="timelineIndex" class="replica-knowledge-claim">
                                        <span class="peer-badge peer-badge--pending">
                                            {{ formatWhen(item.observedAt) }} — {{ item.label }}
                                        </span>
                        <p class="form-hint form-hint--neutral">{{ bitcoinAnchorPublicationLifecycleEntryDetail(item) }}</p>
                                        <p v-if="item.reason" class="form-hint form-hint--neutral">{{ item.reason }}</p>
                                    </li>
                                </ul>
                            </div>
                        </li>
                    </ul>
                </div>
            </div>

            <!-- Only txids this replica minted a Base publication identity for. -->
            <div class="identity-mgmt-card">
                <div class="identity-mgmt-card-header">
                    <span class="identity-mgmt-name">Base Anchor Publications</span>
                    <span class="peer-badge peer-badge--pending">Persisted locally</span>
                </div>
                <p class="form-hint form-hint--neutral">
                    Every Base publication attempt this replica has minted a durable identity for —
                    created the moment a transaction is finalized, independent of whether its broadcast
                    later succeeds. A publication record names WHAT was published, AS WHICH transaction,
                    and on WHICH network — never whether it was later included in a block.
                </p>
                <dl class="evidence-fields">
                    <div class="evidence-field"><dt>Publications</dt><dd>{{ baseAnchorPublicationRecordHistoryView().count }}</dd></div>
                </dl>
                <div class="identity-mgmt-actions">
                    <button type="button" class="action-btn action-btn--secondary" @click="toggleBaseAnchorPublications">
                        {{ baseAnchorPublicationsExpanded ? 'Hide Publications' : 'Show Publications' }}
                    </button>
                </div>
                <div v-if="baseAnchorPublicationsExpanded" class="evidence-inspection-adapter">
                    <span class="evidence-inspection-adapter-title">Publication Identities</span>
                    <p v-if="baseAnchorPublicationRecordHistoryView().count === 0" class="form-hint form-hint--neutral">
                        No Base publication identity minted yet. Finalizing a Base transaction elsewhere on
                        this page creates one automatically.
                    </p>
                    <ul v-else class="replica-knowledge-claim-list">
                        <li v-for="publicationRow in baseAnchorPublicationRecordHistoryView().records" :key="publicationRow.txid" class="replica-knowledge-claim">
                            <span class="peer-badge peer-badge--pending">{{ publicationRow.txid }}</span>
                            <p class="form-hint form-hint--neutral">
                                Content hash: {{ publicationRow.contentHash }} ·
                                Txid: {{ publicationRow.txid }} ·
                                Network: {{ publicationRow.network }} ·
                                Created: {{ formatWhen(publicationRow.createdAt) }}
                            </p>

                            <button type="button" class="action-btn action-btn--secondary" @click="toggleBaseAnchorPublicationLifecycle(publicationRow.txid)">
                                {{ isBaseAnchorPublicationLifecycleExpanded(publicationRow.txid) ? 'Hide Publication Lifecycle' : 'Show Publication Lifecycle' }}
                            </button>
                            <div v-if="isBaseAnchorPublicationLifecycleExpanded(publicationRow.txid)" class="evidence-list">
                                <span class="evidence-convergence-title">Publication Lifecycle</span>
                                <p v-if="!baseAnchorPublicationLifecycleTimelineView(publicationRow.txid)" class="form-hint form-hint--neutral">
                                    No lifecycle timeline available for this txid.
                                </p>
                                <ul v-else class="replica-knowledge-claim-list">
                                    <li v-for="(item, timelineIndex) in baseAnchorPublicationLifecycleTimelineView(publicationRow.txid).entries"
                                        :key="timelineIndex" class="replica-knowledge-claim">
                                        <span class="peer-badge peer-badge--pending">
                                            {{ formatWhen(item.observedAt) }} — {{ item.label }}
                                        </span>
                                        <p class="form-hint form-hint--neutral">{{ baseAnchorPublicationLifecycleEntryDetail(item) }}</p>
                                        <p v-if="item.reason" class="form-hint form-hint--neutral">{{ item.reason }}</p>
                                    </li>
                                </ul>
                            </div>
                        </li>
                    </ul>
                </div>
            </div>
            </div>

            <div v-show="publicationsToolsTab === 'archive'">
            <!-- The durable observation archive. Other actions only ever add to
                 it; "Clear Archive" is the only removal. -->
            <div class="identity-mgmt-card">
                <div class="identity-mgmt-card-header">
                    <span class="identity-mgmt-name">Observation Archive</span>
                    <span class="peer-badge peer-badge--pending">Persisted locally</span>
                </div>
                <p class="form-hint form-hint--neutral">
                    Publication and observation facts, kept durable across a page reload. Never a
                    wallet connection, a signing capability, a private key, or any other
                    credential — this archive never stores one, and reloading this page never
                    restores one.
                </p>
                <dl class="evidence-fields">
                    <div class="evidence-field"><dt>Publications</dt><dd>{{ publicationObservationArchiveView().publicationCount }}</dd></div>
                    <div class="evidence-field"><dt>Observations</dt><dd>{{ publicationObservationArchiveView().observationCount }}</dd></div>
                </dl>
                <div class="identity-mgmt-actions">
                    <button type="button" class="action-btn action-btn--secondary" @click="togglePublicationObservationArchive">
                        {{ publicationObservationArchiveExpanded ? 'Hide Archive' : 'Show Archive' }}
                    </button>
                    <button type="button" class="action-btn action-btn--danger"
                            :disabled="publicationObservationArchiveView().publicationCount === 0 && publicationObservationArchiveView().observationCount === 0"
                            @click="clearPublicationObservationArchive">
                        Clear Archive
                    </button>
                </div>
                <div v-if="publicationObservationArchiveExpanded" class="evidence-inspection-adapter">
                    <span class="evidence-inspection-adapter-title">Archived Observation Timeline</span>
                    <p v-if="publicationObservationArchiveView().entryCount === 0" class="form-hint form-hint--neutral">
                        Nothing archived yet. Publishing to IPFS, verifying content, broadcasting a
                        Bitcoin transaction, or observing a confirmation on this page adds to this
                        archive automatically.
                    </p>
                    <ul v-else class="replica-knowledge-claim-list">
                        <li v-for="(item, archiveIndex) in publicationObservationArchiveView().entries"
                            :key="archiveIndex" class="replica-knowledge-claim">
                            <span class="peer-badge" :class="crossDomainPublicationObservationTimelineEntryBadgeClass(item)">
                                {{ formatWhen(item.observedAt) }} — {{ crossDomainPublicationObservationTimelineEntryDomainLabel(item) }} —
                                {{ item.kind === PublicationObservationTimelineEntryKind.IPFS_PUBLICATION ? 'Published' : item.stateLabel }}
                            </span>
                            <p class="form-hint form-hint--neutral">
                                {{ item.label }}
                                <template v-if="item.domain === PublicationObservationTimelineDomain.IPFS"> — {{ item.locator }}</template>
                                <template v-else-if="item.txid"> — txid {{ item.txid }}</template>
                            </p>
                            <p v-if="item.kind === PublicationObservationTimelineEntryKind.BITCOIN_CONFIRMATION && item.blockHeight != null" class="form-hint form-hint--neutral">
                                Block height {{ item.blockHeight }}
                            </p>
                            <p v-if="item.reason" class="form-hint form-hint--neutral">{{ item.reason }}</p>
                        </li>
                    </ul>
                </div>
            </div>

            <!-- Import replaces (never merges) after an explicit confirmation;
                 an invalid file is rejected. -->
            <div class="identity-mgmt-card">
                <div class="identity-mgmt-card-header">
                    <span class="identity-mgmt-name">Publication Archive</span>
                    <span class="peer-badge peer-badge--pending">Export / Import</span>
                </div>
                <p class="form-hint form-hint--neutral">
                    A portable copy of the recorded facts above — publication identities and
                    observations only, never a wallet connection, a signing capability, a
                    private key, or any pinning-provider credential. Exporting performs no
                    network operation of its own. Importing REPLACES the current archive
                    entirely — it never merges with it.
                </p>
                <div class="identity-mgmt-actions">
                    <button type="button" class="action-btn action-btn--secondary" @click="exportPublicationArchive">
                        Export Archive
                    </button>
                    <button type="button" class="action-btn action-btn--secondary" @click="togglePublicationArchiveImportForm">
                        {{ showPublicationArchiveImportForm ? 'Cancel Import' : 'Import Archive' }}
                    </button>
                </div>
                <p class="form-hint form-hint--neutral">
                    Reconciling this archive against a peer's, authoring or exporting
                    your own signed leaderboard snapshot claim, and seeing publishers
                    ranked by their own recorded achievements all happen on the
                    <router-link to="/leaderboard">Leaderboard</router-link> page.
                </p>

                <div v-if="publicationArchiveExportedPackage.json" class="evidence-inspection-adapter">
                    <span class="evidence-inspection-adapter-title">Exported Archive</span>
                    <textarea class="form-input identity-export-json" rows="6" readonly :value="publicationArchiveExportedPackage.json"></textarea>
                    <div class="identity-mgmt-actions">
                        <a class="modal-btn modal-btn--primary" :href="publicationArchiveExportedPackage.downloadHref" :download="publicationArchiveExportedPackage.fileName">Download Archive Export</a>
                    </div>
                </div>

                <div v-if="showPublicationArchiveImportForm" class="evidence-inspection-adapter">
                    <span class="evidence-inspection-adapter-title">Import Archive</span>
                    <label class="form-field">
                        <span class="form-label">Exported archive file</span>
                        <input type="file" accept="application/json" @change="onPublicationArchiveImportFileChosen" class="form-input" />
                    </label>
                    <textarea v-model="publicationArchiveImportText" class="form-input identity-export-json" rows="6"
                              placeholder="…or paste the exported archive JSON here"></textarea>

                    <p v-if="publicationArchiveImportOutcome && publicationArchiveImportOutcome.outcome === PublicationObservationArchiveImportOutcome.INVALID_ARCHIVE"
                       class="identity-unlock-error">
                        This is not a valid publication archive export — nothing was changed.
                    </p>

                    <div v-if="publicationArchiveImportPreview" class="identity-import-preview">
                        <p><strong>Imported archive holds:</strong> {{ publicationArchiveImportPreview.publicationCount }} publication(s), {{ publicationArchiveImportPreview.observationCount }} observation(s).</p>
                        <p class="form-hint form-hint--neutral">
                            Replacing discards every fact currently in the Observation Archive above
                            ({{ publicationObservationArchiveView().publicationCount }} publication(s),
                            {{ publicationObservationArchiveView().observationCount }} observation(s)) — this cannot be undone.
                        </p>
                        <button type="button" class="action-btn action-btn--danger" @click="confirmPublicationArchiveImport">
                            Replace Current Archive
                        </button>
                    </div>
                </div>
            </div>

            <!-- Inspecting an external archive never touches the current one. -->
            <div class="identity-mgmt-card">
                <div class="identity-mgmt-card-header">
                    <span class="identity-mgmt-name">Inspect External Archive</span>
                    <span class="peer-badge peer-badge--pending">Read-only</span>
                </div>
                <p class="form-hint form-hint--neutral">
                    Look inside an exported archive file without importing it — the Observation
                    Archive above, and everything derived from it, stays exactly as it is. Nothing
                    here is fetched, verified, or reconciled against the current archive, and
                    nothing here can ever replace it.
                </p>
                <div class="identity-mgmt-actions">
                    <button type="button" class="action-btn action-btn--secondary" @click="togglePublicationArchiveInspectionForm">
                        {{ showPublicationArchiveInspectionForm ? 'Cancel Inspection' : 'Inspect Archive' }}
                    </button>
                </div>

                <div v-if="showPublicationArchiveInspectionForm" class="evidence-inspection-adapter">
                    <span class="evidence-inspection-adapter-title">Inspect Archive</span>
                    <label class="form-field">
                        <span class="form-label">Exported archive file</span>
                        <input type="file" accept="application/json" @change="onPublicationArchiveInspectionFileChosen" class="form-input" />
                    </label>
                    <textarea v-model="publicationArchiveInspectionText" @input="invalidatePublicationArchiveDifference"
                              class="form-input identity-export-json" rows="6"
                              placeholder="…or paste an exported archive JSON here"></textarea>

                    <p v-if="publicationArchiveInspectionOutcome && publicationArchiveInspectionOutcome.outcome === PublicationObservationArchiveInspectionOutcome.INVALID_ARCHIVE"
                       class="identity-unlock-error">
                        This is not a valid publication archive export — nothing to inspect.
                    </p>

                    <div v-if="publicationArchiveInspectionOutcome && publicationArchiveInspectionOutcome.outcome === PublicationObservationArchiveInspectionOutcome.INSPECTED"
                         class="identity-import-preview">
                        <dl class="evidence-fields">
                            <div class="evidence-field"><dt>Schema version</dt><dd>{{ publicationArchiveInspectionOutcome.inspection.schemaVersion }}</dd></div>
                            <div class="evidence-field"><dt>IPFS publication records</dt><dd>{{ publicationArchiveInspectionOutcome.inspection.ipfsPublicationCount }}</dd></div>
                            <div class="evidence-field"><dt>IPFS verification observations</dt><dd>{{ publicationArchiveInspectionOutcome.inspection.ipfsVerificationCount }}</dd></div>
                            <div class="evidence-field"><dt>Bitcoin broadcast observations</dt><dd>{{ publicationArchiveInspectionOutcome.inspection.bitcoinBroadcastCount }}</dd></div>
                            <div class="evidence-field"><dt>Bitcoin confirmation observations</dt><dd>{{ publicationArchiveInspectionOutcome.inspection.bitcoinConfirmationCount }}</dd></div>
                            <div class="evidence-field"><dt>Bitcoin content-proof observations</dt><dd>{{ publicationArchiveInspectionOutcome.inspection.bitcoinContentProofCount }}</dd></div>
                            <div class="evidence-field"><dt>Bitcoin publication records</dt><dd>{{ publicationArchiveInspectionOutcome.inspection.bitcoinAnchorPublicationRecordCount }}</dd></div>
                            <div class="evidence-field"><dt>Base transaction inclusion observations</dt><dd>{{ publicationArchiveInspectionOutcome.inspection.baseTransactionInclusionObservationCount }}</dd></div>
                            <div class="evidence-field"><dt>Base publication records</dt><dd>{{ publicationArchiveInspectionOutcome.inspection.baseAnchorPublicationRecordCount }}</dd></div>
                            <div class="evidence-field"><dt>Local facts</dt><dd>{{ publicationArchiveInspectionOutcome.inspection.localFactCount }}</dd></div>
                            <div class="evidence-field"><dt>Imported facts</dt><dd>{{ publicationArchiveInspectionOutcome.inspection.importedFactCount }}</dd></div>
                            <div class="evidence-field"><dt>Import events</dt><dd>{{ publicationArchiveInspectionOutcome.inspection.archiveImportCount }}</dd></div>
                            <div class="evidence-field"><dt>Archive fingerprint</dt><dd>{{ publicationArchiveInspectionOutcome.inspection.fingerprint }}</dd></div>
                        </dl>
                        <p v-if="publicationArchiveInspectionOutcome.inspection.bitcoinAnchorIds.length > 0" class="form-hint form-hint--neutral">
                            Bitcoin anchor IDs: {{ publicationArchiveInspectionOutcome.inspection.bitcoinAnchorIds.join(', ') }}
                        </p>
                        <p v-if="publicationArchiveInspectionOutcome.inspection.ipfsPublicationRecordIndexes.length > 0" class="form-hint form-hint--neutral">
                            IPFS publication record indexes: {{ publicationArchiveInspectionOutcome.inspection.ipfsPublicationRecordIndexes.join(', ') }}
                        </p>
                        <p v-if="publicationArchiveInspectionOutcome.inspection.baseTransactionHashes.length > 0" class="form-hint form-hint--neutral">
                            Base transaction hashes: {{ publicationArchiveInspectionOutcome.inspection.baseTransactionHashes.join(', ') }}
                        </p>
                        <p class="form-hint form-hint--neutral">
                            This is a read-only look at the file above — it changes nothing about the
                            Observation Archive shown earlier on this page. Use "Import Archive" above
                            if you want this archive to replace it.
                        </p>

                        <!-- Difference is an explicit click; it never says
                             which archive is right. -->
                        <div class="identity-mgmt-actions">
                            <button type="button" class="action-btn action-btn--secondary" @click="comparePublicationArchiveDifference">
                                Compare With Current Archive
                            </button>
                        </div>

                        <div v-if="publicationArchiveDifferenceResult" class="evidence-inspection-adapter">
                            <span class="evidence-inspection-adapter-title">Archive Difference</span>
                            <p class="form-hint form-hint--neutral">
                                This describes which durable facts and provenance tags differ between the
                                current archive and the external archive above — it does not determine
                                which archive is correct.
                            </p>

                            <p v-if="!publicationArchiveDifferenceResult.hasFactDifference && !publicationArchiveDifferenceResult.hasProvenanceDifference"
                               class="form-hint form-hint--neutral">
                                These two archives hold identical durable facts and provenance.
                            </p>

                            <ul class="replica-knowledge-claim-list">
                                <li v-for="row in publicationArchiveDifferenceCollectionRows()" :key="row.label" class="replica-knowledge-claim">
                                    <span class="peer-badge peer-badge--pending">{{ row.label }}</span>
                                    <p class="form-hint form-hint--neutral">
                                        Same: {{ row.collection.unchangedCount }} ·
                                        Changed: {{ row.collection.changedCount }} ·
                                        Only in current: {{ row.collection.onlyInCurrentCount }} ·
                                        Only in external: {{ row.collection.onlyInExternalCount }} ·
                                        Different provenance: {{ row.collection.provenanceChangedCount }}
                                    </p>
                                </li>
                            </ul>

                            <p class="form-hint form-hint--neutral">
                                Import events: {{ publicationArchiveDifferenceResult.importEvents.currentCount }} current vs.
                                {{ publicationArchiveDifferenceResult.importEvents.externalCount }} external — not part of
                                the content fingerprint (0.8.84).
                            </p>

                            <!-- Review composes the difference; only "Replace
                                 Current Archive" changes anything. -->
                            <div class="identity-mgmt-actions">
                                <button type="button" class="action-btn action-btn--secondary" @click="reviewPublicationArchiveReplacement">
                                    Review Replacement
                                </button>
                            </div>

                            <div v-if="publicationArchiveReplacementReviewResult" class="evidence-inspection-adapter">
                                <span class="evidence-inspection-adapter-title">Replacement Review</span>
                                <p class="form-hint form-hint--neutral">
                                    What replacing the current archive with the external archive above would
                                    change — the current archive stays exactly as it is until "Replace Current
                                    Archive" below is clicked explicitly.
                                </p>

                                <dl class="evidence-fields">
                                    <div class="evidence-field"><dt>Current fingerprint</dt><dd>{{ publicationArchiveReplacementReviewResult.currentFingerprint }}</dd></div>
                                    <div class="evidence-field"><dt>External fingerprint</dt><dd>{{ publicationArchiveReplacementReviewResult.externalFingerprint }}</dd></div>
                                </dl>

                                <ul class="replica-knowledge-claim-list">
                                    <li class="replica-knowledge-claim">
                                        <span class="peer-badge peer-badge--pending">Facts</span>
                                        <p class="form-hint form-hint--neutral">
                                            Publications — current: {{ publicationArchiveReplacementReviewResult.current.publicationCount }},
                                            external: {{ publicationArchiveReplacementReviewResult.external.publicationCount }}
                                        </p>
                                        <p class="form-hint form-hint--neutral">
                                            Observations — current: {{ publicationArchiveReplacementReviewResult.current.observationCount }},
                                            external: {{ publicationArchiveReplacementReviewResult.external.observationCount }}
                                        </p>
                                    </li>
                                    <li class="replica-knowledge-claim">
                                        <span class="peer-badge peer-badge--pending">Provenance</span>
                                        <p class="form-hint form-hint--neutral">
                                            Local facts — current: {{ publicationArchiveReplacementReviewResult.current.localFactCount }},
                                            external: {{ publicationArchiveReplacementReviewResult.external.localFactCount }}
                                        </p>
                                        <p class="form-hint form-hint--neutral">
                                            Imported facts — current: {{ publicationArchiveReplacementReviewResult.current.importedFactCount }},
                                            external: {{ publicationArchiveReplacementReviewResult.external.importedFactCount }}
                                        </p>
                                    </li>
                                    <li class="replica-knowledge-claim">
                                        <span class="peer-badge peer-badge--pending">Import events</span>
                                        <p class="form-hint form-hint--neutral">
                                            Current: {{ publicationArchiveReplacementReviewResult.current.archiveImportCount }},
                                            external: {{ publicationArchiveReplacementReviewResult.external.archiveImportCount }}
                                        </p>
                                    </li>
                                </ul>

                                <p class="form-hint form-hint--neutral">
                                    Replacing restamps every fact in the external archive above IMPORTED
                                    (0.8.83) — the resulting current fingerprint will therefore differ from
                                    "External fingerprint" shown above, even though the underlying
                                    observations are identical.
                                </p>

                                <div class="identity-mgmt-actions">
                                    <button type="button" class="action-btn action-btn--secondary" @click="cancelPublicationArchiveReplacementReview">
                                        Cancel
                                    </button>
                                    <button type="button" class="action-btn action-btn--danger" @click="confirmPublicationArchiveReplacementFromReview">
                                        Replace Current Archive
                                    </button>
                                </div>
                            </div>
                        </div>
                    </div>
                </div>
            </div>

            <!-- Provenance says where a fact entered the archive, not whether
                 it is true. -->
            <div class="identity-mgmt-card">
                <div class="identity-mgmt-card-header">
                    <span class="identity-mgmt-name">Archive Provenance</span>
                    <span class="peer-badge peer-badge--pending">Where facts entered this archive</span>
                </div>
                <p class="form-hint form-hint--neutral">
                    Local facts were observed by this replica directly. Imported facts entered
                    this archive through a prior "Replace Current Archive" import. Neither is
                    more trustworthy than the other — this only states where each fact came from.
                </p>
                <dl class="evidence-fields">
                    <div class="evidence-field"><dt>Local facts</dt><dd>{{ publicationObservationArchiveProvenanceView().localFactCount }}</dd></div>
                    <div class="evidence-field"><dt>Imported facts</dt><dd>{{ publicationObservationArchiveProvenanceView().importedFactCount }}</dd></div>
                </dl>
                <div v-if="publicationObservationArchiveProvenanceView().archiveImportCount > 0" class="evidence-inspection-adapter">
                    <span class="evidence-inspection-adapter-title">Archive Imports</span>
                    <ul class="replica-knowledge-claim-list">
                        <li v-for="(event, importIndex) in publicationObservationArchiveProvenanceView().archiveImportEvents"
                            :key="importIndex" class="replica-knowledge-claim">
                            <span class="peer-badge peer-badge--pending">{{ formatWhen(event.importedAt) }}</span>
                            <p class="form-hint form-hint--neutral">
                                {{ event.importedEntryCount }} fact(s) imported (archive schema version {{ event.importedArchiveSchemaVersion }})
                            </p>
                        </li>
                    </ul>
                </div>
            </div>

            <!-- Fingerprint: SHA-256 of the archive's canonical facts.
                 Comparing runs only on the "Compare" click; a match means
                 identical contents, nothing more. -->
            <div class="identity-mgmt-card">
                <div class="identity-mgmt-card-header">
                    <span class="identity-mgmt-name">Archive Fingerprint</span>
                    <span class="peer-badge peer-badge--pending">{{ publicationObservationArchiveFingerprintView().algorithm }}</span>
                </div>
                <p class="form-hint form-hint--neutral">
                    A deterministic digest of every fact and provenance tag recorded above.
                    Two replicas whose fingerprints match hold exactly the same durable archive
                    contents — this states nothing about whether those contents are authentic,
                    verified, or correct.
                </p>
                <dl class="evidence-fields">
                    <div class="evidence-field"><dt>Fingerprint</dt><dd>{{ publicationObservationArchiveFingerprintView().fingerprint }}</dd></div>
                </dl>
                <div class="identity-mgmt-actions">
                    <button type="button" class="action-btn action-btn--secondary" @click="copyArchiveFingerprint">
                        {{ archiveFingerprintCopied ? 'Copied!' : 'Copy Fingerprint' }}
                    </button>
                </div>

                <div class="evidence-inspection-adapter">
                    <span class="evidence-inspection-adapter-title">Compare With Another Fingerprint</span>
                    <label class="form-field">
                        <span class="form-label">Fingerprint to compare</span>
                        <input type="text" class="form-input" v-model="archiveFingerprintComparisonInput"
                               @input="onArchiveFingerprintComparisonInputChanged"
                               placeholder="Paste a 64-character SHA-256 fingerprint" />
                    </label>
                    <div class="identity-mgmt-actions">
                        <button type="button" class="action-btn action-btn--secondary" @click="compareArchiveFingerprint">
                            Compare
                        </button>
                    </div>

                    <p v-if="archiveFingerprintComparisonResult === PublicationObservationArchiveFingerprintComparisonResult.MATCH"
                       class="form-hint form-hint--neutral">
                        Result: MATCH — the supplied fingerprint is equal to the digest computed from this
                        archive above. This states nothing about whether either archive's facts are correct.
                    </p>
                    <p v-else-if="archiveFingerprintComparisonResult === PublicationObservationArchiveFingerprintComparisonResult.DIFFERENT"
                       class="form-hint form-hint--neutral">
                        Result: DIFFERENT — the supplied fingerprint is not equal to the digest computed from
                        this archive above.
                    </p>
                    <p v-else-if="archiveFingerprintComparisonResult === PublicationObservationArchiveFingerprintComparisonResult.INVALID_FINGERPRINT"
                       class="identity-unlock-error">
                        This is not a well-formed 64-character SHA-256 fingerprint — nothing was compared.
                    </p>
                </div>
            </div>
            </div>

            <div v-show="publicationsToolsTab === 'connections'">
            <!-- References are recorded explicitly between known identities,
                 never inferred. -->
            <div class="identity-mgmt-card">
                <div class="identity-mgmt-card-header">
                    <span class="identity-mgmt-name">Publication References</span>
                    <span class="peer-badge peer-badge--pending">Persisted locally</span>
                </div>
                <p class="form-hint form-hint--neutral">
                    An explicit, durable record that one publication references another — never inferred
                    from matching content, timestamps, or authors. Both publications must already have a
                    durable identity above; a reference is never a "fork" classification, only a plain,
                    attributable fact: this publication points at that one.
                </p>
                <dl class="evidence-fields">
                    <div class="evidence-field"><dt>References recorded</dt><dd>{{ publicationReferenceRecordHistoryView().count }}</dd></div>
                </dl>
                <div class="identity-mgmt-actions">
                    <button type="button" class="action-btn action-btn--secondary" @click="togglePublicationReferences">
                        {{ publicationReferencesExpanded ? 'Hide References' : 'Show References' }}
                    </button>
                </div>
                <div v-if="publicationReferencesExpanded" class="evidence-inspection-adapter">
                    <span class="evidence-inspection-adapter-title">Record A New Reference</span>
                    <p v-if="knownPublicationIdentityOptions().length < 2" class="form-hint form-hint--neutral">
                        At least two publication identities (Bitcoin or Base, above) are needed before a
                        reference can be recorded.
                    </p>
                    <template v-else>
                        <label class="form-field">
                            <span class="form-label">Source publication (the one making the reference)</span>
                            <select v-model="publicationReferenceSourceKey" class="form-input">
                                <option value="" disabled>Choose a publication…</option>
                                <option v-for="option in knownPublicationIdentityOptions()" :key="'src-' + option.key" :value="option.key">
                                    {{ option.label }}
                                </option>
                            </select>
                        </label>
                        <label class="form-field">
                            <span class="form-label">Referenced publication (the one being pointed at)</span>
                            <select v-model="publicationReferenceReferencedKey" class="form-input">
                                <option value="" disabled>Choose a publication…</option>
                                <option v-for="option in knownPublicationIdentityOptions()" :key="'ref-' + option.key" :value="option.key">
                                    {{ option.label }}
                                </option>
                            </select>
                        </label>
                        <div class="identity-mgmt-actions">
                            <button type="button" class="action-btn action-btn--secondary"
                                    :disabled="!publicationReferenceSourceKey || !publicationReferenceReferencedKey"
                                    @click="recordPublicationReference">
                                Record Reference
                            </button>
                        </div>
                        <p v-if="publicationReferenceError" class="identity-unlock-error">{{ publicationReferenceError }}</p>
                    </template>

                    <span class="evidence-inspection-adapter-title">Recorded References</span>
                    <p v-if="publicationReferenceRecordHistoryView().count === 0" class="form-hint form-hint--neutral">
                        No references recorded yet.
                    </p>
                    <ul v-else class="replica-knowledge-claim-list">
                        <li v-for="(referenceRow, referenceIndex) in publicationReferenceRecordHistoryView().records" :key="referenceIndex" class="replica-knowledge-claim">
                            <span class="peer-badge peer-badge--pending">
                                {{ referenceRow.sourcePublicationIdentity.blockchain }}:{{ shortId(referenceRow.sourcePublicationIdentity.chainReference) }}
                                references
                                {{ referenceRow.referencedPublicationIdentity.blockchain }}:{{ shortId(referenceRow.referencedPublicationIdentity.chainReference) }}
                            </span>
                            <p class="form-hint form-hint--neutral">
                                Source content hash: {{ referenceRow.sourcePublicationIdentity.contentHash }} ·
                                Referenced content hash: {{ referenceRow.referencedPublicationIdentity.contentHash }} ·
                                Recorded: {{ formatWhen(referenceRow.createdAt) }}
                            </p>
                        </li>
                    </ul>
                </div>
            </div>

            <!-- Read-only graph of recorded references; counts are facts, not a
                 ranking. -->
            <div class="identity-mgmt-card">
                <div class="identity-mgmt-card-header">
                    <span class="identity-mgmt-name">Publication Reference Graph</span>
                    <span class="peer-badge peer-badge--pending">Persisted locally</span>
                </div>
                <p class="form-hint form-hint--neutral">
                    The same recorded references above, grouped by publication so this replica's own
                    reference graph is inspectable at a glance. A publication's outgoing/incoming counts
                    are plain, attributable facts — never a score, a rank, or a claim that one
                    publication is more valuable than another.
                </p>
                <dl class="evidence-fields">
                    <div class="evidence-field"><dt>Edges</dt><dd>{{ publicationReferenceGraphView().edgeCount }}</dd></div>
                    <div class="evidence-field"><dt>Publications</dt><dd>{{ publicationReferenceGraphView().nodes.length }}</dd></div>
                    <div class="evidence-field"><dt>Distinct sources</dt><dd>{{ publicationReferenceGraphView().distinctSourcePublicationCount }}</dd></div>
                    <div class="evidence-field"><dt>Distinct referenced</dt><dd>{{ publicationReferenceGraphView().distinctReferencedPublicationCount }}</dd></div>
                </dl>
                <div class="identity-mgmt-actions">
                    <button type="button" class="action-btn action-btn--secondary" @click="togglePublicationReferenceGraph">
                        {{ publicationReferenceGraphExpanded ? 'Hide Reference Graph' : 'Show Reference Graph' }}
                    </button>
                </div>
                <div v-if="publicationReferenceGraphExpanded" class="evidence-inspection-adapter">
                    <span class="evidence-inspection-adapter-title">Publications In This Graph</span>
                    <p v-if="publicationReferenceGraphView().nodes.length === 0" class="form-hint form-hint--neutral">
                        No references recorded yet — record one above and it appears here.
                    </p>
                    <ul v-else class="replica-knowledge-claim-list">
                        <li v-for="node in publicationReferenceGraphView().nodes" :key="node.identity.blockchain + ':' + node.identity.chainReference" class="replica-knowledge-claim">
                            <button type="button" class="action-btn action-btn--secondary" @click="togglePublicationReferenceGraphNode(node)">
                                {{ node.identity.blockchain }}:{{ shortId(node.identity.chainReference) }}
                            </button>
                            <p class="form-hint form-hint--neutral">
                                Outgoing references: {{ node.outgoingReferenceCount }} ·
                                Incoming references: {{ node.incomingReferenceCount }}
                            </p>

                            <div v-if="isPublicationReferenceGraphNodeExpanded(node)" class="evidence-list">
                                <p v-if="node.outgoingReferenceCount === 0 && node.incomingReferenceCount === 0" class="form-hint form-hint--neutral">
                                    No edges touch this publication.
                                </p>
                                <template v-if="node.outgoingReferenceCount > 0">
                                    <p class="form-hint form-hint--neutral"><strong>References →</strong></p>
                                    <p v-for="(edge, edgeIndex) in node.outgoingReferences" :key="'out-' + edgeIndex" class="form-hint form-hint--neutral">
                                        {{ edge.referencedPublicationIdentity.blockchain }}:{{ shortId(edge.referencedPublicationIdentity.chainReference) }}
                                        — recorded {{ formatWhen(edge.createdAt) }}
                                    </p>
                                </template>
                                <template v-if="node.incomingReferenceCount > 0">
                                    <p class="form-hint form-hint--neutral"><strong>← Referenced by</strong></p>
                                    <p v-for="(edge, edgeIndex) in node.incomingReferences" :key="'in-' + edgeIndex" class="form-hint form-hint--neutral">
                                        {{ edge.sourcePublicationIdentity.blockchain }}:{{ shortId(edge.sourcePublicationIdentity.chainReference) }}
                                        — recorded {{ formatWhen(edge.createdAt) }}
                                    </p>
                                </template>
                            </div>
                        </li>
                    </ul>
                </div>
            </div>

            <!-- Badges present achievement events; no points, scores or ranks. -->
            <div class="identity-mgmt-card">
                <div class="identity-mgmt-card-header">
                    <span class="identity-mgmt-name">Achievements</span>
                    <span class="peer-badge peer-badge--pending">Persisted locally</span>
                </div>
                <p class="form-hint form-hint--neutral">
                    A human-facing presentation of this replica's own achievement events, each one
                    attributed to the exact durable publication record that earned it. A badge is
                    never a score, a rank, or a statement about a person's worth — only a threshold
                    this replica's own publications have crossed, and when.
                </p>
                <dl class="evidence-fields">
                    <div class="evidence-field"><dt>Badges earned</dt><dd>{{ achievementBadgesView().count }}</dd></div>
                </dl>
                <div class="identity-mgmt-actions">
                    <button type="button" class="action-btn action-btn--secondary" @click="toggleAchievements">
                        {{ achievementsExpanded ? 'Hide Achievements' : 'Show Achievements' }}
                    </button>
                </div>
                <div v-if="achievementsExpanded" class="evidence-inspection-adapter">
                    <span class="evidence-inspection-adapter-title">Achievement Badges</span>
                    <p v-if="achievementBadgesView().count === 0" class="form-hint form-hint--neutral">
                        No achievements earned yet. Publishing a blockchain-anchored record elsewhere on
                        this page earns one automatically, the moment its own threshold is crossed.
                    </p>
                    <ul v-else class="replica-knowledge-claim-list">
                        <li v-for="badge in achievementBadgesView().badges" :key="badge.index" class="replica-knowledge-claim">
                            <button type="button" class="action-btn action-btn--secondary" @click="toggleAchievementBadge(badge.index)">
                                {{ badge.icon }} {{ badge.title }}
                            </button>
                            <p class="form-hint form-hint--neutral">
                                {{ badge.description }} — earned {{ formatWhen(badge.earnedAt) }}
                            </p>

                            <div v-if="isAchievementBadgeExpanded(badge.index)" class="evidence-list">
                                <span class="evidence-convergence-title">Source Publication</span>
                                <dl class="evidence-fields">
                                    <div class="evidence-field"><dt>Blockchain</dt><dd>{{ badge.sourcePublicationIdentity.blockchain }}</dd></div>
                                    <div class="evidence-field"><dt>Content hash</dt><dd>{{ badge.sourcePublicationIdentity.contentHash }}</dd></div>
                                    <div class="evidence-field"><dt>Chain reference</dt><dd>{{ badge.sourcePublicationIdentity.chainReference }}</dd></div>
                                    <div class="evidence-field"><dt>Created</dt><dd>{{ formatWhen(badge.sourcePublicationIdentity.createdAt) }}</dd></div>
                                </dl>
                                <p class="form-hint form-hint--neutral">
                                    This badge is a presentation of one achievement event — it names the exact
                                    publication identity that earned it, never a score or a rank.
                                </p>
                                <button v-if="canViewAchievementBadgeLifecycle(badge)" type="button" class="action-btn action-btn--secondary"
                                        @click="viewAchievementBadgeLifecycle(badge)">
                                    View Publication Lifecycle Above
                                </button>
                                <p v-else class="form-hint form-hint--neutral">
                                    This replica could not resolve this badge's own source anchor to a publication
                                    lifecycle timeline above.
                                </p>
                            </div>
                        </li>
                    </ul>
                </div>
            </div>

            <!-- Scoped to a publication identity, never a person or wallet. -->
            <div class="identity-mgmt-card">
                <div class="identity-mgmt-card-header">
                    <span class="identity-mgmt-name">Achievement Profile</span>
                    <span class="peer-badge peer-badge--pending">Persisted locally</span>
                </div>
                <p class="form-hint form-hint--neutral">
                    A publication identity's own slice of this replica's achievement events — never a
                    human or wallet profile. ForkBuild can state that a publication earned an
                    achievement; it cannot yet state that a person did, because no durable record here
                    links a publication identity to a human identity.
                </p>
                <div class="identity-mgmt-actions">
                    <button type="button" class="action-btn action-btn--secondary" @click="toggleAchievementProfile">
                        {{ achievementProfileExpanded ? 'Hide Achievement Profile' : 'Show Achievement Profile' }}
                    </button>
                </div>
                <div v-if="achievementProfileExpanded" class="evidence-inspection-adapter">
                    <span class="evidence-inspection-adapter-title">Choose A Publication</span>
                    <p v-if="knownPublicationIdentityOptions().length === 0" class="form-hint form-hint--neutral">
                        No publication identities recorded yet — publish a Bitcoin or Base anchor above
                        first.
                    </p>
                    <label v-else class="form-field">
                        <span class="form-label">Publication</span>
                        <select v-model="achievementProfileSelectedKey" class="form-input">
                            <option value="" disabled>Choose a publication…</option>
                            <option v-for="option in knownPublicationIdentityOptions()" :key="'profile-' + option.key" :value="option.key">
                                {{ option.label }}
                            </option>
                        </select>
                    </label>

                    <template v-if="achievementProfileSelectedKey">
                        <span class="evidence-inspection-adapter-title">Achievement Profile</span>
                        <dl class="evidence-fields">
                            <div class="evidence-field"><dt>Publication</dt><dd>{{ achievementProfileView().publicationIdentity.blockchain }} — {{ shortId(achievementProfileView().publicationIdentity.chainReference) }}</dd></div>
                            <div class="evidence-field"><dt>Achievements</dt><dd>{{ achievementProfileView().achievementCount }}</dd></div>
                        </dl>
                        <p v-if="achievementProfileView().achievementCount === 0" class="form-hint form-hint--neutral">
                            This publication has not earned any achievements yet.
                        </p>
                        <ul v-else class="replica-knowledge-claim-list">
                            <li v-for="(achievement, achievementIndex) in achievementProfileView().achievements" :key="achievementIndex" class="replica-knowledge-claim">
                                <span class="peer-badge peer-badge--pending">🏆 {{ achievement.label }}</span>
                                <p class="form-hint form-hint--neutral">
                                    Earned {{ formatWhen(achievement.observedAt) }}
                                </p>
                            </li>
                        </ul>
                        <p class="form-hint form-hint--neutral">
                            These achievements belong to this publication identity — not necessarily to
                            any particular person.
                        </p>
                    </template>
                </div>
            </div>

            <!-- A publisher identifier is a bare typed label, never a verified
                 identity or ownership claim. -->
            <div class="identity-mgmt-card">
                <div class="identity-mgmt-card-header">
                    <span class="identity-mgmt-name">Publisher Associations</span>
                    <span class="peer-badge peer-badge--pending">Persisted locally</span>
                </div>
                <p class="form-hint form-hint--neutral">
                    An explicit, durable record that a publisher identity claims a publication — never
                    inferred from matching wallets, matching content, or matching names. A publisher
                    identifier is a bare, explicit label, never a cryptographic proof of ownership or of
                    the human behind it.
                </p>
                <dl class="evidence-fields">
                    <div class="evidence-field"><dt>Associations recorded</dt><dd>{{ publisherPublicationAssociationRecordHistoryView().count }}</dd></div>
                </dl>
                <div class="identity-mgmt-actions">
                    <button type="button" class="action-btn action-btn--secondary" @click="togglePublisherAssociations">
                        {{ publisherAssociationsExpanded ? 'Hide Publisher Associations' : 'Show Publisher Associations' }}
                    </button>
                </div>
                <div v-if="publisherAssociationsExpanded" class="evidence-inspection-adapter">
                    <span class="evidence-inspection-adapter-title">Associate A Publication With A Publisher</span>
                    <p v-if="knownPublicationIdentityOptions().length === 0" class="form-hint form-hint--neutral">
                        At least one publication identity (Bitcoin or Base, above) is needed before an
                        association can be recorded.
                    </p>
                    <template v-else>
                        <label class="form-field">
                            <span class="form-label">Publisher identifier</span>
                            <input v-model="publisherAssociationPublisherId" type="text" class="form-input"
                                   list="publisher-association-known-identifiers" placeholder="e.g. Publisher A">
                            <datalist id="publisher-association-known-identifiers">
                                <option v-for="publisherId in distinctPublisherIdentifiersView()" :key="publisherId" :value="publisherId"></option>
                            </datalist>
                        </label>
                        <label class="form-field">
                            <span class="form-label">Publication</span>
                            <select v-model="publisherAssociationPublicationKey" class="form-input">
                                <option value="" disabled>Choose a publication…</option>
                                <option v-for="option in knownPublicationIdentityOptions()" :key="'assoc-' + option.key" :value="option.key">
                                    {{ option.label }}
                                </option>
                            </select>
                        </label>
                        <div class="identity-mgmt-actions">
                            <button type="button" class="action-btn action-btn--secondary"
                                    :disabled="!publisherAssociationPublisherId.trim() || !publisherAssociationPublicationKey"
                                    @click="recordPublisherAssociation">
                                Add Publication
                            </button>
                        </div>
                        <p v-if="publisherAssociationError" class="identity-unlock-error">{{ publisherAssociationError }}</p>
                    </template>

                    <span class="evidence-inspection-adapter-title">Recorded Associations</span>
                    <p v-if="publisherPublicationAssociationRecordHistoryView().count === 0" class="form-hint form-hint--neutral">
                        No associations recorded yet.
                    </p>
                    <ul v-else class="replica-knowledge-claim-list">
                        <li v-for="(associationRow, associationIndex) in publisherPublicationAssociationRecordHistoryView().records" :key="associationIndex" class="replica-knowledge-claim">
                            <span class="peer-badge peer-badge--pending">
                                {{ associationRow.publisherIdentity.publisherId }} —
                                {{ associationRow.publicationIdentity.blockchain }}:{{ shortId(associationRow.publicationIdentity.chainReference) }}
                            </span>
                            <p class="form-hint form-hint--neutral">
                                Content hash: {{ associationRow.publicationIdentity.contentHash }} ·
                                Recorded: {{ formatWhen(associationRow.createdAt) }}
                            </p>
                        </li>
                    </ul>

                    <span class="evidence-inspection-adapter-title">A Publisher's Associated Publications</span>
                    <p v-if="distinctPublisherIdentifiersView().length === 0" class="form-hint form-hint--neutral">
                        No publisher has been associated with anything yet — record one above and it
                        appears here.
                    </p>
                    <label v-else class="form-field">
                        <span class="form-label">Publisher</span>
                        <select v-model="publisherAssociationSelectedPublisherId" class="form-input">
                            <option value="" disabled>Choose a publisher…</option>
                            <option v-for="publisherId in distinctPublisherIdentifiersView()" :key="'view-' + publisherId" :value="publisherId">
                                {{ publisherId }}
                            </option>
                        </select>
                    </label>

                    <template v-if="publisherAssociationSelectedPublisherId">
                        <dl class="evidence-fields">
                            <div class="evidence-field"><dt>Publisher</dt><dd>{{ publisherAssociationProfileView().publisherIdentity.publisherId }}</dd></div>
                            <div class="evidence-field"><dt>Associated publications</dt><dd>{{ publisherAssociationProfileView().associationCount }}</dd></div>
                        </dl>
                        <p v-if="publisherAssociationProfileView().associationCount === 0" class="form-hint form-hint--neutral">
                            This publisher has not been associated with any publication.
                        </p>
                        <ul v-else class="replica-knowledge-claim-list">
                            <li v-for="(association, associationIndex) in publisherAssociationProfileView().associations" :key="associationIndex" class="replica-knowledge-claim">
                                <span class="peer-badge peer-badge--pending">
                                    {{ association.publicationIdentity.blockchain }} — {{ shortId(association.publicationIdentity.chainReference) }}
                                </span>
                                <p class="form-hint form-hint--neutral">
                                    Content hash: {{ association.publicationIdentity.contentHash }} ·
                                    Associated: {{ formatWhen(association.createdAt) }}
                                </p>
                            </li>
                        </ul>
                        <p class="form-hint form-hint--neutral">
                            This is an explicit claim, not a verified fact — it states that this publisher
                            identity was associated with these publications, never that this replica has
                            proven who controls them.
                        </p>
                    </template>
                </div>
            </div>

            <!-- Publisher achievement profile, badges and statistics live on
                 ui/views/LeaderboardHubView.js. -->
            </div>

            </details>

            <p v-if="loading" class="locations-panel-empty">Checking cataloged publications…</p>
            <p v-else-if="entries.length === 0" class="locations-panel-empty">
                Nothing cataloged yet. Publish a signed attribution or naming claim, or connect to a peer who
                has one, and it will show up here.
            </p>

            <div v-else class="identity-mgmt-list">
                <div v-for="entry in entries" :key="entry.publication.id" class="identity-mgmt-card">
                    <div class="identity-mgmt-card-header">
                        <span class="identity-mgmt-name">{{ humanizeContentKind(entry.publication.contentKind) }}</span>
                        <span class="peer-badge" :class="badgeClass(entry)">{{ statusLabel(entry) }}</span>
                    </div>
                    <p class="identity-mgmt-status">
                        Published by {{ shortId(entry.publication.publisherIdentity && entry.publication.publisherIdentity.id) }}
                        · received {{ formatWhen(entry.receivedAt) }}
                    </p>
                    <p v-if="entry.view && entry.view.contentSummary" class="form-hint form-hint--neutral">
                        {{ entry.view.contentSummary }}
                    </p>
                    <p v-if="availabilityText(entry)" class="form-hint form-hint--neutral">
                        {{ availabilityText(entry) }}
                    </p>
                    <p v-else-if="entry.view && entry.view.reason" class="form-hint form-hint--neutral">
                        {{ entry.view.reason }}
                    </p>
                    <p v-if="canRetrieve(entry) && retrievalPeers.length > 0" class="form-hint form-hint--neutral">
                        {{ retrievalPeers.length }} connected peer{{ retrievalPeers.length === 1 ? '' : 's' }} may have this content.
                    </p>

                    <div class="identity-mgmt-actions">
                        <button v-if="canRetrieve(entry)" class="action-btn action-btn--secondary"
                                :disabled="entry.retrieving || retrievalPeers.length === 0" @click="retrieve(entry)">
                            {{ entry.retrieving ? 'Asking peers…' : 'Retrieve from Peers' }}
                        </button>
                        <button class="action-btn action-btn--secondary" :disabled="entry.checking" @click="recheck(entry)">
                            {{ entry.checking ? 'Checking…' : 'Re-check' }}
                        </button>
                    </div>

                    <!-- Distribution: the three roles (Announcement/Discovery,
                         Content, Proof/Anchoring) for this publication.
                         Presentation only: each role keeps its own verb and
                         collaborator; a placement is never called "publishing".
                         Open by default because these are the primary actions. -->
                    <details open class="identity-mgmt-card-details identity-mgmt-distribution">
                        <summary class="identity-mgmt-card-details-summary">Distribution</summary>

                        <div v-if="publicationDistributionCommand || multiRelayNostrPublicationDistributionCommand || snapshotDistributionCommand" class="identity-mgmt-distribution-role">
                            <span class="evidence-convergence-title">Announcement / Discovery</span>
                            <div class="evidence-list">
                                <!-- Either command is enough;
                                     distributeEntryPublication() picks one per
                                     substrate. -->
                                <div v-if="publicationDistributionCommand || multiRelayNostrPublicationDistributionCommand" class="evidence-anchor-card">
                                    <div class="evidence-anchor-header">
                                        <span class="evidence-anchor-type">Publication</span>
                                    </div>
                                    <p class="form-hint form-hint--neutral">
                                        Distributes this Publication's own signed envelope — uploading its
                                        material and announcing it via the chosen substrate in one call.
                                    </p>
                                    <label class="form-label">
                                        Substrate
                                        <select v-model="entry.discoveryDistributionProvider" class="form-select"
                                                :disabled="entry.discoveryDistributionAttempt && entry.discoveryDistributionAttempt.distributing">
                                            <option value="arweave">Arweave</option>
                                            <option value="nostr">Nostr</option>
                                        </select>
                                    </label>
                                    <div class="identity-mgmt-actions">
                                        <button class="action-btn action-btn--primary"
                                                :disabled="entry.discoveryDistributionAttempt && entry.discoveryDistributionAttempt.distributing"
                                                @click="distributePublicationForEntry(entry)">
                                            {{ discoveryDistributionButtonLabel(entry) }}
                                        </button>
                                        <!-- Where to configure the chosen
                                             substrate; says nothing about
                                             whether it is reachable. -->
                                        <router-link :to="discoveryDistributionConfigurationRoute(entry)" class="action-btn action-btn--secondary">
                                            Configure {{ entry.discoveryDistributionProvider === 'arweave' ? 'Arweave' : 'Nostr' }}
                                        </router-link>
                                    </div>
                                    <p v-if="entry.discoveryDistributionAttempt && entry.discoveryDistributionAttempt.error" class="form-hint form-hint--neutral">
                                        {{ entry.discoveryDistributionAttempt.error }}
                                    </p>
                                    <!-- One row per substrate, never collapsed
                                         into one status. -->
                                    <dl v-if="discoveryObservationsView(entry).length > 0" class="evidence-fields">
                                        <!-- Keyed by provider and origin:
                                             several Nostr relay observations
                                             can coexist. -->
                                        <div v-for="observation in discoveryObservationsView(entry)" :key="observation.discoveryProvider + ':' + observation.origin" class="evidence-field">
                                            <dt>Discovery ({{ observation.discoveryProvider }})</dt>
                                            <dd>{{ observation.state }}</dd>
                                        </div>
                                    </dl>
                                </div>

                                <div v-if="snapshotDistributionCommand" class="evidence-anchor-card">
                                    <div class="evidence-anchor-header">
                                        <span class="evidence-anchor-type">Snapshot</span>
                                    </div>
                                    <p class="form-hint form-hint--neutral">
                                        Distributes this replica's own locally held Snapshot bytes — never
                                        available when this replica does not currently possess them.
                                    </p>
                                    <!-- Where the snapshot's bytes are stored;
                                         announcement stays on Nostr. Only
                                         eligible, registered backends are
                                         offered. -->
                                    <label v-if="snapshotDistributionStorageTypes.length > 0" class="form-label">
                                        Content
                                        <select v-model="entry.snapshotDistributionStorage" class="form-select"
                                                :disabled="entry.snapshotDistributionAttempt && entry.snapshotDistributionAttempt.distributing">
                                            <option v-for="storage in snapshotDistributionStorageOptions" :key="storage" :value="storage">{{ humanizeStorageType(storage) }}</option>
                                        </select>
                                    </label>
                                    <div class="identity-mgmt-actions">
                                        <button class="action-btn action-btn--primary"
                                                :disabled="entry.snapshotDistributionAttempt && entry.snapshotDistributionAttempt.distributing"
                                                @click="distributeSnapshot(entry)">
                                            {{ snapshotDistributionButtonLabel(entry) }}
                                        </button>
                                        <router-link :to="snapshotDistributionConfigurationRoute(entry)" class="action-btn action-btn--secondary">
                                            Configure {{ entry.snapshotDistributionStorage === 'ar' ? 'Arweave' : 'IPFS' }}
                                        </router-link>
                                        <router-link to="/settings/nostr-relay" class="action-btn action-btn--secondary">Configure Nostr</router-link>
                                    </div>
                                    <p v-if="entry.snapshotDistributionAttempt && entry.snapshotDistributionAttempt.error" class="form-hint form-hint--neutral">
                                        {{ entry.snapshotDistributionAttempt.error }}
                                    </p>
                                    <dl v-if="entry.snapshotDistributionAttempt && entry.snapshotDistributionAttempt.result" class="evidence-fields">
                                        <div class="evidence-field"><dt>Content</dt><dd>{{ entry.snapshotDistributionAttempt.result.contentReference }}</dd></div>
                                    </dl>
                                    <!-- A null announcement is
                                         SnapshotDistributionCommand's ordinary
                                         decline, not a failure; the content is
                                         placed either way. -->
                                    <p v-if="entry.snapshotDistributionAttempt && entry.snapshotDistributionAttempt.result" class="form-hint form-hint--neutral">
                                        <span class="peer-badge" :class="entry.snapshotDistributionAttempt.result.announcement ? 'peer-badge--authenticated' : 'peer-badge--failed'">
                                            {{ entry.snapshotDistributionAttempt.result.announcement ? 'Nostr: Announced' : 'Nostr: Not announced' }}
                                        </span>
                                    </p>
                                </div>
                            </div>
                        </div>

                        <!-- Content: one card per available storage type. A
                             placement says where bytes can be retrieved; it is
                             never called publishing. -->
                        <div v-if="availableStorageTypes.length > 0" class="identity-mgmt-distribution-role">
                            <!-- One Configure link for the role: the Content
                                 preference is role-wide, not per storage type. -->
                            <div class="evidence-discovery-header">
                                <span class="evidence-convergence-title">Content</span>
                                <router-link to="/settings/content-provider" class="action-btn action-btn--secondary">Configure</router-link>
                            </div>
                            <div class="evidence-list">
                                <div v-for="storage in availableStorageTypes" :key="storage" class="evidence-anchor-card">
                                    <div class="evidence-anchor-header">
                                        <span class="evidence-anchor-type">{{ humanizeStorageType(storage) }}</span>
                                        <span v-if="placementCreationView(entry, storage).label" class="peer-badge" :class="placementCreationBadgeClass(entry, storage)">
                                            {{ placementCreationView(entry, storage).label }}
                                        </span>
                                    </div>
                                    <p v-if="placementCreationView(entry, storage).message" class="form-hint form-hint--neutral">
                                        {{ placementCreationView(entry, storage).message }}
                                    </p>
                                    <p v-if="placementCreationView(entry, storage).reason" class="form-hint form-hint--neutral">
                                        {{ placementCreationView(entry, storage).reason }}
                                    </p>
                                    <dl v-if="placementCreationView(entry, storage).placement" class="evidence-fields">
                                        <div class="evidence-field"><dt>Locator</dt><dd>{{ placementCreationView(entry, storage).placement.locator }}</dd></div>
                                        <div class="evidence-field"><dt>Content hash</dt><dd>{{ placementCreationView(entry, storage).placement.contentHash }}</dd></div>
                                    </dl>
                                    <div class="identity-mgmt-actions">
                                        <button class="action-btn action-btn--primary"
                                                :disabled="placementCreationView(entry, storage).state === 'creating'"
                                                @click="createPlacement(entry, storage)">
                                            {{ placementCreationButtonLabel(entry, storage) }}
                                        </button>
                                    </div>
                                </div>
                            </div>
                        </div>

                        <!-- Proof / Anchoring: one card per available
                             anchorType. Configure sets the role-wide preferred
                             provider; wallet state still renders inline. -->
                        <div v-if="availableAnchorTypes.length > 0" class="identity-mgmt-distribution-role">
                            <div class="evidence-discovery-header">
                                <span class="evidence-convergence-title">Proof / Anchoring</span>
                                <router-link to="/settings/anchor-provider" class="action-btn action-btn--secondary">Configure</router-link>
                            </div>
                            <!-- The generic loop can't run the wallet-guided
                                 Bitcoin pipeline or Base (which needs a
                                 reviewed plan), so point to those flows further
                                 down. Each half shows only when its
                                 collaborator exists. -->
                            <p v-if="bitcoinWalletConnection || baseAnchorPublisher" class="form-hint form-hint--neutral">
                                <template v-if="bitcoinWalletConnection">Bitcoin anchoring is wallet-guided and multi-step — the button below only
                                succeeds once a transaction has been connected, funded, constructed, reviewed, signed,
                                finalized, and broadcast in the Bitcoin section under &quot;Snapshot, Anchoring, IPFS
                                &amp; Evidence Details&quot; below.</template>
                                <template v-if="baseAnchorPublisher"> Base anchoring is also available, through its own
                                wallet-guided flow — connect a wallet and review a transaction in the Base section under
                                &quot;Snapshot, Anchoring, IPFS &amp; Evidence Details&quot; below to create one.</template>
                            </p>
                            <div class="evidence-list">
                                <div v-for="anchorType in availableAnchorTypes" :key="anchorType" class="evidence-anchor-card">
                                    <div class="evidence-anchor-header">
                                        <span class="evidence-anchor-type">{{ humanizeAnchorType(anchorType) }}</span>
                                        <span v-if="creationView(entry, anchorType).label" class="peer-badge" :class="creationBadgeClass(entry, anchorType)">
                                            {{ creationView(entry, anchorType).label }}
                                        </span>
                                    </div>
                                    <p v-if="creationView(entry, anchorType).message" class="form-hint form-hint--neutral">
                                        {{ creationView(entry, anchorType).message }}
                                    </p>
                                    <p v-if="creationView(entry, anchorType).reason" class="form-hint form-hint--neutral">
                                        {{ creationView(entry, anchorType).reason }}
                                    </p>
                                    <dl v-if="creationView(entry, anchorType).anchor" class="evidence-fields">
                                        <div class="evidence-field"><dt>Transaction</dt><dd>{{ creationView(entry, anchorType).anchor.locator }}</dd></div>
                                        <div class="evidence-field"><dt>Content hash</dt><dd>{{ creationView(entry, anchorType).anchor.contentHash }}</dd></div>
                                    </dl>
                                    <div class="identity-mgmt-actions">
                                        <button class="action-btn action-btn--primary"
                                                :disabled="creationView(entry, anchorType).state === 'creating'"
                                                @click="createAnchor(entry, anchorType)">
                                            {{ creationButtonLabel(entry, anchorType) }}
                                        </button>
                                    </div>
                                </div>
                            </div>

                            <!-- Resolves the saved PROOF_AND_ANCHORING
                                 preference on every click; never offers Base. -->
                            <div v-if="preferredAnchorCreationCoordinator" class="evidence-discovery">
                                <div class="evidence-discovery-header">
                                    <button class="action-btn action-btn--secondary"
                                            :disabled="preferredCreationView(entry).state === 'creating'"
                                            @click="createPreferredAnchor(entry)">
                                        {{ preferredCreationButtonLabel(entry) }}
                                    </button>
                                    <span v-if="preferredCreationView(entry).label" class="peer-badge" :class="preferredCreationBadgeClass(entry)">
                                        {{ preferredCreationView(entry).label }}
                                    </span>
                                </div>
                                <p v-if="preferredCreationView(entry).message" class="form-hint form-hint--neutral">
                                    {{ preferredCreationView(entry).message }}
                                </p>
                                <p v-if="preferredCreationView(entry).reason" class="form-hint form-hint--neutral">
                                    {{ preferredCreationView(entry).reason }}
                                </p>
                                <dl v-if="preferredCreationView(entry).anchor" class="evidence-fields">
                                    <div class="evidence-field"><dt>Transaction</dt><dd>{{ preferredCreationView(entry).anchor.locator }}</dd></div>
                                    <div class="evidence-field"><dt>Content hash</dt><dd>{{ preferredCreationView(entry).anchor.contentHash }}</dd></div>
                                </dl>
                            </div>
                        </div>
                    </details>

                    <!-- Per-publication details, collapsed by default. -->
                    <details class="identity-mgmt-card-details">
                        <summary class="identity-mgmt-card-details-summary">Snapshot, Anchoring, IPFS &amp; Evidence Details</summary>

                        <div class="publications-tools-tabs" role="tablist">
                            <button type="button" role="tab" :aria-selected="entry.detailsTab === 'snapshot'"
                                    :class="['publications-tools-tab', { 'publications-tools-tab--active': entry.detailsTab === 'snapshot' }]"
                                    @click="setEntryDetailsTab(entry, 'snapshot')">
                                Snapshot
                            </button>
                            <button type="button" role="tab" :aria-selected="entry.detailsTab === 'evidence'"
                                    :class="['publications-tools-tab', { 'publications-tools-tab--active': entry.detailsTab === 'evidence' }]"
                                    @click="setEntryDetailsTab(entry, 'evidence')">
                                Decentralization &amp; Evidence
                            </button>
                            <button type="button" role="tab" :aria-selected="entry.detailsTab === 'placements'"
                                    :class="['publications-tools-tab', { 'publications-tools-tab--active': entry.detailsTab === 'placements' }]"
                                    @click="setEntryDetailsTab(entry, 'placements')">
                                Placements &amp; IPFS
                            </button>
                            <button type="button" role="tab" :aria-selected="entry.detailsTab === 'history'"
                                    :class="['publications-tools-tab', { 'publications-tools-tab--active': entry.detailsTab === 'history' }]"
                                    @click="setEntryDetailsTab(entry, 'history')">
                                History
                            </button>
                        </div>

                    <div v-show="entry.detailsTab === 'snapshot'">
                    <!-- This replica's own content state, separate from the
                         distributed claims under Decentralization. -->
                    <div v-if="localSnapshotContentAvailabilityUseCase || snapshotContentMaterializationCoordinator || snapshotPeerMaterializationCoordinator" class="decentralization-summary">
                        <span class="evidence-convergence-title">Local Snapshot</span>

                        <!-- Summary of possession and acquisition counts;
                             hidden until something was checked or attempted
                             this session. -->
                        <div v-if="localSnapshotAvailabilityView(entry).checked || snapshotAcquisitionView(entry).acquisition.attemptCount > 0" class="evidence-list">
                            <span class="evidence-convergence-title">Snapshot Acquisition</span>
                            <p class="form-hint form-hint--neutral">
                                Current possession:
                                {{ localSnapshotAvailabilityView(entry).checked ? localSnapshotAvailabilityView(entry).message : 'Not yet checked.' }}
                            </p>
                            <p v-if="snapshotAcquisitionOutcomeCountsSentence(entry)" class="form-hint form-hint--neutral">
                                Acquisition history: {{ snapshotAcquisitionOutcomeCountsSentence(entry) }}
                            </p>
                            <p v-if="materializationSourceCountsSentence(entry)" class="form-hint form-hint--neutral">
                                {{ materializationSourceCountsSentence(entry) }}
                            </p>
                            <p v-if="snapshotAcquisitionNeedsSourceHint(entry)" class="form-hint form-hint--neutral">
                                This replica does not currently possess a valid snapshot. Choose a source below —
                                "Import Snapshot," a placement's own "Materialize Snapshot," or a peer's own "Get
                                Snapshot from Peer" — to try again.
                            </p>

                            <!-- Every acquisition attempt this session,
                                 including rejected ones; a narration, never a
                                 ranking of sources. -->
                            <div v-if="materializationHistoryDetailsView(entry).count > 0" class="evidence-list">
                                <button class="action-btn action-btn--secondary" @click="toggleMaterializationHistory(entry)">
                                    {{ entry.materializationHistoryExpanded ? 'Hide Acquisition History' : 'Show Acquisition History' }}
                                </button>
                                <div v-if="entry.materializationHistoryExpanded">
                                    <ul class="replica-knowledge-claim-list">
                                        <li v-for="(item, index) in materializationHistoryDetailsView(entry).entries" :key="index" class="replica-knowledge-claim">
                                            <button class="action-btn action-btn--secondary" @click="toggleMaterializationHistoryEntry(entry, index)">
                                                {{ formatWhen(item.observedAt) }} — {{ item.sourceLabel }} → {{ item.outcomeShortLabel }}
                                            </button>
                                            <dl v-if="isMaterializationHistoryEntryExpanded(entry, index)" class="evidence-fields">
                                                <div class="evidence-field">
                                                    <dt>Outcome</dt>
                                                    <dd>{{ item.outcomeLabel }}</dd>
                                                </div>
                                                <div class="evidence-field">
                                                    <dt>Publication</dt>
                                                    <dd>{{ item.publicationId }}</dd>
                                                </div>
                                                <div class="evidence-field">
                                                    <dt>Content hash</dt>
                                                    <dd>{{ item.contentHash }}</dd>
                                                </div>
                                            </dl>
                                        </li>
                                    </ul>
                                </div>
                            </div>
                        </div>

                        <!-- Shown once a local check has completed; evidence
                             and placement counts stay on the Decentralization
                             card. -->
                        <p v-if="localSnapshotContentAvailabilityUseCase && localSnapshotAvailabilityView(entry).checked" class="form-hint form-hint--neutral">
                            Publication: {{ replicaContentKnowledgeView(entry).hasPublication ? 'known locally' : 'not known locally' }}
                            · Snapshot: {{ replicaContentKnowledgeView(entry).hasValidSnapshot ? 'available' : 'not available' }}
                        </p>

                        <div v-if="localSnapshotContentAvailabilityUseCase" class="evidence-discovery-header">
                            <button class="action-btn action-btn--secondary"
                                    :disabled="localSnapshotAvailabilityView(entry).checking"
                                    @click="checkLocalSnapshotAvailability(entry)">
                                {{ localSnapshotAvailabilityButtonLabel(entry) }}
                            </button>
                            <span v-if="localSnapshotAvailabilityView(entry).checked" class="peer-badge" :class="localSnapshotAvailabilityBadgeClass(entry)">
                                {{ localSnapshotAvailabilityView(entry).label }}
                            </span>
                        </div>
                        <p v-if="localSnapshotContentAvailabilityUseCase && localSnapshotAvailabilityView(entry).message" class="form-hint form-hint--neutral">
                            {{ localSnapshotAvailabilityView(entry).message }}
                        </p>

                        <p v-if="localSnapshotMaterializationSourceView(entry).possessed" class="form-hint form-hint--neutral">
                            Source: {{ localSnapshotMaterializationSourceView(entry).sourceLabel }}
                        </p>

                        <!-- Imports only what the person supplies, on an
                             explicit click. -->
                        <div v-if="snapshotContentMaterializationCoordinator" class="evidence-list">
                            <button v-if="!entry.materializationFormOpen" class="action-btn action-btn--secondary"
                                    @click="entry.materializationFormOpen = true">
                                Import Snapshot
                            </button>
                            <template v-else>
                                <label class="form-field">
                                    <span class="form-label">Publication Snapshot Transfer Package</span>
                                    <input type="file" accept="application/json" class="form-input"
                                           @change="onMaterializationFileChosen(entry, $event)" />
                                </label>
                                <textarea v-model="entry.materializationImportText" class="form-input" rows="4"
                                          placeholder="…or paste the exported Publication Snapshot Transfer Package JSON here"></textarea>
                                <div class="evidence-discovery-header">
                                    <button class="action-btn action-btn--primary"
                                            :disabled="materializationView(entry).importing"
                                            @click="importSnapshotContent(entry)">
                                        {{ materializationButtonLabel(entry) }}
                                    </button>
                                    <span v-if="materializationView(entry).label" class="peer-badge" :class="materializationBadgeClass(entry)">
                                        {{ materializationView(entry).label }}
                                    </span>
                                </div>
                            </template>
                            <p v-if="entry.materializationFormOpen && materializationView(entry).message" class="form-hint form-hint--neutral">
                                {{ materializationView(entry).message }}
                            </p>
                        </div>

                        <!-- The person picks the peer; no ranking and no
                             automatic fallback. -->
                        <div v-if="snapshotPeerMaterializationCoordinator" class="evidence-list">
                            <p v-if="retrievalPeers.length === 0" class="form-hint form-hint--neutral">
                                No authenticated peer is connected right now — connect to one first from
                                <router-link to="/peers">Peers</router-link>.
                            </p>
                            <template v-else>
                                <label class="form-field">
                                    <span class="form-label">Peer</span>
                                    <select v-model="entry.peerMaterializationSelectedPeerId" class="form-input">
                                        <option value="" disabled>Choose an authenticated peer…</option>
                                        <option v-for="peer in retrievalPeerOptions" :key="peer.connectionId" :value="peer.connectionId">
                                            {{ retrievalPeerLabel(peer) }}
                                        </option>
                                    </select>
                                </label>
                                <div class="evidence-discovery-header">
                                    <button class="action-btn action-btn--secondary"
                                            :disabled="peerMaterializationView(entry).requesting || !entry.peerMaterializationSelectedPeerId"
                                            @click="requestSnapshotFromPeer(entry)">
                                        {{ peerMaterializationButtonLabel(entry) }}
                                    </button>
                                    <span v-if="peerMaterializationView(entry).label" class="peer-badge" :class="peerMaterializationBadgeClass(entry)">
                                        {{ peerMaterializationView(entry).label }}
                                    </span>
                                </div>
                            </template>
                            <p v-if="peerMaterializationView(entry).message" class="form-hint form-hint--neutral">
                                {{ peerMaterializationView(entry).message }}
                            </p>
                        </div>

                        <!-- Asking whether a peer has bytes is separate from
                             asking it for them; a check never transfers
                             anything. -->
                        <div v-if="snapshotPeerPossessionCoordinator" class="evidence-list">
                            <span class="evidence-convergence-title">Peer Snapshot Possession</span>
                            <p v-if="retrievalPeers.length === 0" class="form-hint form-hint--neutral">
                                No authenticated peer is connected right now — connect to one first from
                                <router-link to="/peers">Peers</router-link>.
                            </p>
                            <template v-else>
                                <label class="form-field">
                                    <span class="form-label">Peer</span>
                                    <select v-model="entry.peerPossessionSelectedPeerId" class="form-input">
                                        <option value="" disabled>Choose an authenticated peer…</option>
                                        <option v-for="peer in retrievalPeerOptions" :key="peer.connectionId" :value="peer.connectionId">
                                            {{ retrievalPeerLabel(peer) }}
                                        </option>
                                    </select>
                                </label>
                                <div class="evidence-discovery-header">
                                    <button class="action-btn action-btn--secondary"
                                            :disabled="peerPossessionView(entry).checking || !entry.peerPossessionSelectedPeerId"
                                            @click="checkSnapshotPossessionWithPeer(entry)">
                                        {{ peerPossessionButtonLabel(entry) }}
                                    </button>
                                    <span v-if="peerPossessionView(entry).label" class="peer-badge" :class="peerPossessionBadgeClass(entry)">
                                        {{ peerPossessionView(entry).label }}
                                    </span>
                                </div>
                            </template>
                            <p v-if="peerPossessionView(entry).message" class="form-hint form-hint--neutral">
                                {{ peerPossessionView(entry).message }}
                            </p>
                            <p v-if="peerPossessionView(entry).observedAt" class="form-hint form-hint--neutral">
                                Observed: {{ formatWhen(peerPossessionView(entry).observedAt) }}
                            </p>
                        </div>

                        <!-- Several peers at once, with a history; reports what
                             each peer said, never ranks them. -->
                        <div v-if="snapshotPeerPossessionCoordinator" class="evidence-list">
                            <span class="evidence-convergence-title">Peer Snapshot Possession Comparison</span>
                            <p v-if="retrievalPeers.length === 0" class="form-hint form-hint--neutral">
                                No authenticated peer is connected right now — connect to one first from
                                <router-link to="/peers">Peers</router-link>.
                            </p>
                            <template v-else>
                                <ul class="replica-knowledge-claim-list">
                                    <li v-for="peer in retrievalPeers" :key="peer.connectionId" class="replica-knowledge-claim">
                                        <label>
                                            <input type="checkbox"
                                                   :checked="entry.peerPossessionCompareSelectedPeerIds.includes(peer.connectionId)"
                                                   @change="togglePeerPossessionCompareSelection(entry, peer.connectionId)">
                                            {{ peer.alias || (peer.remoteIdentity ? shortId(peer.remoteIdentity.identityId) : 'Unknown peer') }}
                                        </label>
                                    </li>
                                </ul>
                                <div class="evidence-discovery-header">
                                    <button class="action-btn action-btn--secondary"
                                            :disabled="entry.peerPossessionComparisonChecking || entry.peerPossessionCompareSelectedPeerIds.length === 0"
                                            @click="checkSnapshotPossessionWithSelectedPeers(entry)">
                                        {{ entry.peerPossessionComparisonChecking ? 'Checking…' : (peerPossessionObservationHistoryView(entry).count > 0 ? 'Check Selected Peers Again' : 'Check Selected Peers') }}
                                    </button>
                                </div>
                            </template>

                            <div v-if="peerPossessionComparisonView(entry).peers.length > 0">
                                <p class="form-hint form-hint--neutral">
                                    {{ peerPossessionComparisonView(entry).availableCount }} available ·
                                    {{ peerPossessionComparisonView(entry).notAvailableCount }} not available ·
                                    {{ peerPossessionComparisonView(entry).unavailableCount }} could not determine
                                </p>
                                <ul class="replica-knowledge-claim-list">
                                    <li v-for="peerRow in peerPossessionComparisonView(entry).peers" :key="peerRow.peerId" class="replica-knowledge-claim">
                                        <dl class="evidence-fields">
                                            <div class="evidence-field">
                                                <dt>Peer</dt>
                                                <dd>{{ peerPossessionRowLabel(peerRow.peerId) }}</dd>
                                            </div>
                                            <div class="evidence-field">
                                                <dt>Reports</dt>
                                                <dd>
                                                    <span class="peer-badge" :class="peerPossessionComparisonRowBadgeClass(peerRow)">
                                                        {{ peerPossessionComparisonRowLabel(peerRow) }}
                                                    </span>
                                                </dd>
                                            </div>
                                            <div class="evidence-field">
                                                <dt>Observed</dt>
                                                <dd>{{ formatWhen(peerRow.observedAt) }}</dd>
                                            </div>
                                        </dl>
                                        <!-- A new attempt to fetch from this
                                             peer; it never changes the row's
                                             earlier report. -->
                                        <template v-if="snapshotMaterializationSelectionCoordinator && peerRow.possessed">
                                            <button class="action-btn action-btn--secondary"
                                                    :disabled="comparisonPeerMaterializationView(entry, peerRow.peerId).requesting"
                                                    @click="materializeFromComparisonPeer(entry, peerRow.peerId)">
                                                {{ comparisonPeerMaterializationButtonLabel(entry, peerRow) }}
                                            </button>
                                            <span v-if="comparisonPeerMaterializationView(entry, peerRow.peerId).label"
                                                  class="peer-badge" :class="comparisonPeerMaterializationBadgeClass(entry, peerRow.peerId)">
                                                {{ comparisonPeerMaterializationView(entry, peerRow.peerId).label }}
                                            </span>
                                            <p v-if="comparisonPeerMaterializationView(entry, peerRow.peerId).message" class="form-hint form-hint--neutral">
                                                {{ comparisonPeerMaterializationView(entry, peerRow.peerId).message }}
                                            </p>
                                        </template>
                                    </li>
                                </ul>
                            </div>

                            <!-- Every recorded answer, including repeats; a
                                 narration, never a ranking. -->
                            <div v-if="peerPossessionObservationDetailsView(entry).count > 0">
                                <button class="action-btn action-btn--secondary" @click="togglePeerPossessionComparisonHistory(entry)">
                                    {{ entry.peerPossessionComparisonHistoryExpanded ? 'Hide Observation History' : 'Show Observation History' }}
                                </button>
                                <div v-if="entry.peerPossessionComparisonHistoryExpanded">
                                    <ul class="replica-knowledge-claim-list">
                                        <li v-for="(item, index) in peerPossessionObservationDetailsView(entry).entries" :key="index" class="replica-knowledge-claim">
                                            <button class="action-btn action-btn--secondary" @click="togglePeerPossessionObservationHistoryEntry(entry, index)">
                                                {{ formatWhen(item.observedAt) }} — {{ peerPossessionRowLabel(item.peerId) }} → {{ item.stateShortLabel }}
                                            </button>
                                            <dl v-if="isPeerPossessionObservationHistoryEntryExpanded(entry, index)" class="evidence-fields">
                                                <div class="evidence-field">
                                                    <dt>Reported</dt>
                                                    <dd>{{ item.stateLabel }}</dd>
                                                </div>
                                                <div class="evidence-field">
                                                    <dt>Publication</dt>
                                                    <dd>{{ item.publicationId }}</dd>
                                                </div>
                                                <div class="evidence-field">
                                                    <dt>Content hash</dt>
                                                    <dd>{{ item.contentHash }}</dd>
                                                </div>
                                            </dl>
                                        </li>
                                    </ul>
                                </div>
                            </div>
                        </div>
                    </div>

                    <!-- Independent facts side by side, never combined into one
                         verdict; each hides until observed. -->
                    <div v-if="localSnapshotAvailabilityView(entry).checked || snapshotAcquisitionOutcomeCountsSentence(entry) || entry.placementConvergenceView || peerPossessionComparisonView(entry).peers.length > 0"
                         class="decentralization-summary">
                        <span class="evidence-convergence-title">Snapshot State</span>

                        <div class="evidence-list">
                            <span class="evidence-convergence-title">Content</span>
                            <dl class="evidence-fields">
                                <div class="evidence-field">
                                    <dt>Publication</dt>
                                    <dd>{{ entry.publication.id }}</dd>
                                </div>
                                <div class="evidence-field">
                                    <dt>Content hash</dt>
                                    <dd>{{ entry.publication.contentReference.hash }}</dd>
                                </div>
                            </dl>
                        </div>

                        <div class="evidence-list">
                            <span class="evidence-convergence-title">Local possession</span>
                            <p class="form-hint form-hint--neutral">
                                {{ localSnapshotAvailabilityView(entry).checked ? localSnapshotAvailabilityView(entry).message : 'Not yet checked.' }}
                            </p>
                        </div>

                        <div v-if="snapshotAcquisitionOutcomeCountsSentence(entry)" class="evidence-list">
                            <span class="evidence-convergence-title">Acquisition</span>
                            <p class="form-hint form-hint--neutral">{{ snapshotAcquisitionOutcomeCountsSentence(entry) }}</p>
                        </div>

                        <div v-if="entry.placementConvergenceView" class="evidence-list">
                            <span class="evidence-convergence-title">Placements</span>
                            <p class="form-hint form-hint--neutral">
                                {{ snapshotStatePlacementRelationshipLabel(snapshotStateInspectionView(entry)) }} ·
                                {{ entry.placementConvergenceView.placementCount }} known placement{{ entry.placementConvergenceView.placementCount === 1 ? '' : 's' }} ·
                                {{ entry.placementConvergenceView.storageTypeCount }} storage backend{{ entry.placementConvergenceView.storageTypeCount === 1 ? '' : 's' }} ·
                                {{ entry.placementConvergenceView.locatorCount }} distinct location{{ entry.placementConvergenceView.locatorCount === 1 ? '' : 's' }}
                            </p>
                        </div>

                        <div v-if="peerPossessionComparisonView(entry).peers.length > 0" class="evidence-list">
                            <span class="evidence-convergence-title">Peer observations</span>
                            <p class="form-hint form-hint--neutral">
                                {{ peerPossessionComparisonView(entry).availableCount }} available ·
                                {{ peerPossessionComparisonView(entry).notAvailableCount }} not available ·
                                {{ peerPossessionComparisonView(entry).unavailableCount }} could not determine
                            </p>
                        </div>
                    </div>
                    </div>

                    <div v-show="entry.detailsTab === 'evidence'">
                    <!-- Evidence and placement summaries side by side; neither
                         is ranked above the other. -->
                    <div v-if="entry.decentralization && (entry.decentralization.evidence.anchorCount > 0 || entry.decentralization.placements.placementCount > 0)"
                         class="decentralization-summary">
                        <span class="evidence-convergence-title">Decentralization</span>
                        <p v-if="entry.replicaKnowledge" class="form-hint form-hint--neutral">
                            Publication: {{ entry.replicaKnowledge.hasPublication ? 'known locally' : 'not known locally' }}
                        </p>
                        <div class="decentralization-dimensions">
                            <div class="decentralization-dimension">
                                <span class="decentralization-dimension-title">External Evidence</span>
                                <p class="form-hint form-hint--neutral">
                                    {{ entry.decentralization.evidence.anchorCount }} anchor claim{{ entry.decentralization.evidence.anchorCount === 1 ? '' : 's' }}
                                </p>
                                <p v-if="entry.decentralization.evidence.relationship" class="form-hint form-hint--neutral">
                                    Relationship: {{ entry.decentralization.evidence.relationship === 'conflict' ? 'Conflict' : 'Agreement' }}
                                </p>
                            </div>
                            <div class="decentralization-dimension">
                                <span class="decentralization-dimension-title">Snapshot Placements</span>
                                <p class="form-hint form-hint--neutral">
                                    {{ entry.decentralization.placements.placementCount }} placement claim{{ entry.decentralization.placements.placementCount === 1 ? '' : 's' }}
                                    · {{ entry.decentralization.placements.storageTypeCount }} storage type{{ entry.decentralization.placements.storageTypeCount === 1 ? '' : 's' }}
                                </p>
                                <p v-if="entry.decentralization.placements.relationship" class="form-hint form-hint--neutral">
                                    Relationship: {{ entry.decentralization.placements.relationship === 'conflict' ? 'Conflict' : 'Agreement' }}
                                </p>
                            </div>
                        </div>
                        <p v-if="decentralizationContrast(entry)" class="evidence-convergence-conflict">
                            {{ decentralizationContrast(entry) }}
                        </p>

                        <!-- Explicit click only. -->
                        <div v-if="knowledgeSynchronizationCoordinator" class="evidence-discovery">
                            <div class="evidence-discovery-header">
                                <button class="action-btn action-btn--secondary"
                                        :disabled="entry.synchronizationAttempt && entry.synchronizationAttempt.synchronizing"
                                        @click="synchronizeWithPeers(entry)">
                                    {{ synchronizationButtonLabel(entry) }}
                                </button>
                                <span v-if="synchronizationView(entry).label" class="peer-badge" :class="synchronizationBadgeClass(entry)">
                                    {{ synchronizationView(entry).label }}
                                </span>
                            </div>
                            <p v-if="synchronizationView(entry).message" class="form-hint form-hint--neutral">
                                {{ synchronizationView(entry).message }}
                            </p>
                            <dl v-if="synchronizationView(entry).newAnchorCount !== null" class="evidence-fields replica-sync-breakdown">
                                <div class="evidence-field">
                                    <dt>New claims</dt>
                                    <dd>Evidence: {{ synchronizationView(entry).newAnchorCount }} · Placements: {{ synchronizationView(entry).newPlacementCount }}</dd>
                                </div>
                                <div class="evidence-field">
                                    <dt>Already known</dt>
                                    <dd>Evidence: {{ synchronizationView(entry).alreadyKnownAnchorCount }} · Placements: {{ synchronizationView(entry).alreadyKnownPlacementCount }}</dd>
                                </div>
                            </dl>
                        </div>

                        <!-- How this replica learned each claim, and what it
                             has observed about it: an inventory, not a verdict. -->
                        <div v-if="entry.replicaKnowledgeDetail" class="replica-knowledge">
                            <button class="action-btn action-btn--secondary" @click="toggleReplicaKnowledge(entry)">
                                {{ entry.replicaKnowledgeExpanded ? 'Hide Replica Knowledge' : 'Show Replica Knowledge' }}
                            </button>
                            <div v-if="entry.replicaKnowledgeExpanded" class="replica-knowledge-detail">
                                <div class="replica-knowledge-dimension">
                                    <span class="decentralization-dimension-title">Evidence</span>
                                    <p class="form-hint form-hint--neutral">
                                        {{ entry.replicaKnowledgeDetail.evidence.count }} claim{{ entry.replicaKnowledgeDetail.evidence.count === 1 ? '' : 's' }}
                                        <template v-if="acquisitionBreakdownSentence(entry.replicaKnowledgeDetail.evidence.claims)"> · {{ acquisitionBreakdownSentence(entry.replicaKnowledgeDetail.evidence.claims) }}</template>
                                    </p>
                                    <ul v-if="entry.replicaKnowledgeDetail.evidence.claims.length" class="replica-knowledge-claim-list">
                                        <li v-for="claim in entry.replicaKnowledgeDetail.evidence.claims" :key="claim.anchorId" class="replica-knowledge-claim">
                                            <dl class="evidence-fields">
                                                <div class="evidence-field">
                                                    <dt>Anchor</dt>
                                                    <dd>{{ shortId(claim.anchorId) }}</dd>
                                                </div>
                                                <div class="evidence-field">
                                                    <dt>Acquisition</dt>
                                                    <dd>{{ claim.acquisitionLabel }}</dd>
                                                </div>
                                                <div class="evidence-field" v-if="claim.firstSeenAt">
                                                    <dt>First seen</dt>
                                                    <dd>{{ formatWhen(claim.firstSeenAt) }}</dd>
                                                </div>
                                                <div class="evidence-field">
                                                    <dt>Verification</dt>
                                                    <dd>{{ claim.verificationStateLabel }}</dd>
                                                </div>
                                            </dl>
                                        </li>
                                    </ul>
                                </div>
                                <div class="replica-knowledge-dimension">
                                    <span class="decentralization-dimension-title">Placements</span>
                                    <p class="form-hint form-hint--neutral">
                                        {{ entry.replicaKnowledgeDetail.placements.count }} claim{{ entry.replicaKnowledgeDetail.placements.count === 1 ? '' : 's' }}
                                        <template v-if="acquisitionBreakdownSentence(entry.replicaKnowledgeDetail.placements.claims)"> · {{ acquisitionBreakdownSentence(entry.replicaKnowledgeDetail.placements.claims) }}</template>
                                    </p>
                                    <ul v-if="entry.replicaKnowledgeDetail.placements.claims.length" class="replica-knowledge-claim-list">
                                        <li v-for="claim in entry.replicaKnowledgeDetail.placements.claims" :key="claim.placementId" class="replica-knowledge-claim">
                                            <dl class="evidence-fields">
                                                <div class="evidence-field">
                                                    <dt>Placement</dt>
                                                    <dd>{{ shortId(claim.placementId) }}</dd>
                                                </div>
                                                <div class="evidence-field">
                                                    <dt>Acquisition</dt>
                                                    <dd>{{ claim.acquisitionLabel }}</dd>
                                                </div>
                                                <div class="evidence-field" v-if="claim.firstSeenAt">
                                                    <dt>First seen</dt>
                                                    <dd>{{ formatWhen(claim.firstSeenAt) }}</dd>
                                                </div>
                                                <div class="evidence-field">
                                                    <dt>Resolution</dt>
                                                    <dd>{{ claim.resolutionStateLabel }}</dd>
                                                </div>
                                            </dl>
                                        </li>
                                    </ul>
                                </div>
                            </div>
                        </div>
                    </div>

                    <div v-if="entry.evidence" class="evidence-section">
                        <div class="evidence-summary">
                            <span class="evidence-summary-title">External Evidence</span>
                            <span class="form-hint form-hint--neutral">{{ describeKnownEvidenceCount(entry.evidence) }}</span>
                            <button v-if="entry.evidence.count > 0" class="action-btn action-btn--secondary" @click="toggleEvidence(entry)">
                                {{ entry.evidenceExpanded ? 'Hide Evidence' : 'Show Evidence' }}
                            </button>
                        </div>

                        <!-- Explicit click only. -->
                        <div v-if="evidenceDiscoveryCoordinator" class="evidence-discovery">
                            <div class="evidence-discovery-header">
                                <button class="action-btn action-btn--secondary"
                                        :disabled="entry.discoveryAttempt && entry.discoveryAttempt.discovering"
                                        @click="discoverFromPeers(entry)">
                                    {{ discoveryButtonLabel(entry) }}
                                </button>
                                <span v-if="discoveryView(entry).label" class="peer-badge" :class="discoveryBadgeClass(entry)">
                                    {{ discoveryView(entry).label }}
                                </span>
                            </div>
                            <p v-if="discoveryView(entry).message" class="form-hint form-hint--neutral">
                                {{ discoveryView(entry).message }}
                            </p>
                        </div>

                        <!-- Groups are ordered by contentHash, never by size: a
                             bigger group is not more likely correct. -->
                        <div v-if="entry.evidenceExpanded && entry.convergenceView && entry.convergenceView.anchorCount > 1"
                             class="evidence-convergence">
                            <span class="evidence-convergence-title">Content binding</span>
                            <div class="evidence-convergence-groups">
                                <div v-for="group in entry.convergenceView.contentGroups" :key="group.contentHash"
                                     class="evidence-convergence-group">
                                    <span class="evidence-convergence-hash">{{ shortHash(group.contentHash) }}</span>
                                    <span class="form-hint form-hint--neutral">
                                        {{ group.anchorCount }} anchor{{ group.anchorCount === 1 ? '' : 's' }}
                                    </span>
                                </div>
                            </div>
                            <p v-if="entry.convergenceView.hasConflict" class="evidence-convergence-conflict">
                                ⚠ {{ entry.convergenceView.conflictDescription }}
                            </p>
                        </div>

                        <!-- Turns observed funding into an unsigned plan; needs
                             the funding panel's observation and never
                             re-observes it. -->
                        <div v-if="bitcoinAnchorTransactionConstructionCoordinator" class="evidence-list">
                            <div class="evidence-anchor-card">
                                <div class="evidence-anchor-header">
                                    <span class="evidence-anchor-type">Bitcoin Anchor Transaction</span>
                                    <span v-if="bitcoinAnchorTransactionConstructionView(entry)" class="peer-badge"
                                        :class="bitcoinAnchorTransactionConstructionBadgeClass(entry)">
                                        {{ bitcoinAnchorTransactionConstructionView(entry).stateLabel }}
                                    </span>
                                </div>
                                <p class="form-hint form-hint--neutral">
                                    Turns the wallet funding observed above into an unsigned transaction plan for
                                    THIS publication's own content hash. Nothing is signed or broadcast by
                                    constructing this — it only names which observed inputs would be spent, and
                                    what the resulting fee and change would be.
                                </p>
                                <p v-if="!isBitcoinAnchorFundingObserved()" class="form-hint form-hint--neutral">
                                    Observe wallet funding above before creating a transaction plan.
                                </p>
                                <div class="identity-mgmt-actions">
                                    <button class="action-btn action-btn--primary"
                                            :disabled="!isBitcoinAnchorFundingObserved() || (bitcoinAnchorTransactionConstructionView(entry) && bitcoinAnchorTransactionConstructionView(entry).state === BitcoinAnchorTransactionConstructionState.CONSTRUCTING)"
                                            @click="constructBitcoinAnchorTransaction(entry)">
                                        Create Transaction Plan
                                    </button>
                                </div>

                                <template v-if="bitcoinAnchorTransactionConstructionView(entry)">
                                    <p v-if="bitcoinAnchorTransactionConstructionView(entry).reason" class="form-hint form-hint--neutral">
                                        {{ bitcoinAnchorTransactionConstructionView(entry).reason }}
                                    </p>

                                    <template v-if="bitcoinAnchorTransactionConstructionView(entry).state === BitcoinAnchorTransactionConstructionState.CONSTRUCTED">
                                        <dl class="evidence-fields">
                                            <div class="evidence-field"><dt>Network</dt><dd>{{ bitcoinAnchorTransactionConstructionView(entry).network }}</dd></div>
                                            <div class="evidence-field"><dt>Content hash</dt><dd>{{ bitcoinAnchorTransactionConstructionView(entry).contentHash }}</dd></div>
                                            <div class="evidence-field"><dt>Selected inputs</dt><dd>{{ bitcoinAnchorTransactionConstructionView(entry).selectedInputCount }}</dd></div>
                                            <div class="evidence-field"><dt>Fee</dt><dd>{{ bitcoinAnchorTransactionConstructionView(entry).feeSats }} sat</dd></div>
                                            <div class="evidence-field"><dt>Change</dt><dd>{{ bitcoinAnchorTransactionConstructionView(entry).changeSats }} sat</dd></div>
                                            <div class="evidence-field"><dt>Total inputs</dt><dd>{{ bitcoinAnchorTransactionConstructionView(entry).totalInputSats }} sat</dd></div>
                                        </dl>
                                        <div class="evidence-inspection-adapter">
                                            <span class="evidence-inspection-adapter-title">Inputs</span>
                                            <dl v-for="input in bitcoinAnchorTransactionConstructionView(entry).inputs" :key="input.txid + ':' + input.vout" class="evidence-fields">
                                                <div class="evidence-field"><dt>{{ shortId(input.txid) }}:{{ input.vout }}</dt><dd>{{ input.valueSats }} sat ({{ input.scriptType }})</dd></div>
                                            </dl>
                                        </div>
                                        <div class="evidence-inspection-adapter">
                                            <span class="evidence-inspection-adapter-title">Outputs</span>
                                            <dl v-for="(output, index) in bitcoinAnchorTransactionConstructionView(entry).outputs" :key="index" class="evidence-fields">
                                                <div class="evidence-field">
                                                    <dt>{{ output.type === 'change' ? 'Change' : 'OP_RETURN' }}</dt>
                                                    <dd>{{ output.address ? shortId(output.address) + ' — ' : '' }}{{ output.valueSats }} sat</dd>
                                                </div>
                                            </dl>
                                        </div>
                                        <p class="form-hint form-hint--neutral">
                                            Funding observed {{ formatWhen(bitcoinAnchorTransactionConstructionView(entry).fundingObservedAt) }};
                                            plan constructed {{ formatWhen(bitcoinAnchorTransactionConstructionView(entry).constructedAt) }}.
                                            The observed funding may already be stale by now — this plan records what it was built from, it
                                            does not claim those inputs are still spendable.
                                        </p>
                                    </template>
                                </template>
                            </div>
                        </div>

                        <!-- Turns an observed Base account into an unsigned
                             plan; needs the account observation and never
                             re-observes it. -->
                        <div v-if="basePublicationTransactionPlanCoordinator" class="evidence-list">
                            <div class="evidence-anchor-card">
                                <div class="evidence-anchor-header">
                                    <span class="evidence-anchor-type">Base Publication Transaction</span>
                                    <span v-if="basePublicationTransactionPlanView(entry)" class="peer-badge"
                                        :class="basePublicationTransactionPlanBadgeClass(entry)">
                                        {{ basePublicationTransactionPlanView(entry).stateLabel }}
                                    </span>
                                </div>
                                <p class="form-hint form-hint--neutral">
                                    Turns the Base account observed above into an unsigned, self-transfer
                                    transaction plan carrying THIS publication's own content hash as raw
                                    transaction data. Nothing is signed or broadcast by constructing this — it
                                    only names the nonce, gas limit, and fee figures the account was observed
                                    with, and the exact bytes the transaction would carry.
                                </p>
                                <p v-if="!isBaseAccountObserved()" class="form-hint form-hint--neutral">
                                    Observe a Base account above before creating a transaction plan.
                                </p>
                                <div class="identity-mgmt-actions">
                                    <button class="action-btn action-btn--primary"
                                            :disabled="!isBaseAccountObserved() || (basePublicationTransactionPlanView(entry) && basePublicationTransactionPlanView(entry).state === BasePublicationTransactionPlanState.CONSTRUCTING)"
                                            @click="constructBasePublicationTransaction(entry)">
                                        {{ basePublicationTransactionPlanView(entry) && basePublicationTransactionPlanView(entry).state === BasePublicationTransactionPlanState.CONSTRUCTING ? 'Constructing…' : 'Create Base Transaction Plan' }}
                                    </button>
                                </div>

                                <template v-if="basePublicationTransactionPlanView(entry)">
                                    <p v-if="basePublicationTransactionPlanView(entry).reason" class="form-hint form-hint--neutral">
                                        {{ basePublicationTransactionPlanView(entry).reason }}
                                    </p>

                                    <template v-if="basePublicationTransactionPlanView(entry).state === BasePublicationTransactionPlanState.CONSTRUCTED">
                                        <dl class="evidence-fields">
                                            <div class="evidence-field"><dt>Network</dt><dd>{{ basePublicationTransactionPlanView(entry).network }}</dd></div>
                                            <div class="evidence-field"><dt>Chain ID</dt><dd>{{ basePublicationTransactionPlanView(entry).chainId }}</dd></div>
                                            <div class="evidence-field"><dt>Content hash</dt><dd>{{ basePublicationTransactionPlanView(entry).contentHash }}</dd></div>
                                            <div class="evidence-field"><dt>From</dt><dd>{{ shortId(basePublicationTransactionPlanView(entry).from) }}</dd></div>
                                            <div class="evidence-field"><dt>To</dt><dd>{{ shortId(basePublicationTransactionPlanView(entry).to) }} (self-transfer)</dd></div>
                                            <div class="evidence-field"><dt>Value</dt><dd>{{ basePublicationTransactionPlanView(entry).value }} wei</dd></div>
                                            <div class="evidence-field"><dt>Nonce</dt><dd>{{ basePublicationTransactionPlanView(entry).nonce }}</dd></div>
                                            <div class="evidence-field"><dt>Gas limit</dt><dd>{{ basePublicationTransactionPlanView(entry).gasLimit }}</dd></div>
                                            <div class="evidence-field"><dt>Max fee per gas</dt><dd>{{ basePublicationTransactionPlanView(entry).maxFeePerGas }} wei</dd></div>
                                            <div class="evidence-field"><dt>Priority fee</dt><dd>{{ basePublicationTransactionPlanView(entry).maxPriorityFeePerGas }} wei</dd></div>
                                            <div class="evidence-field"><dt>Data</dt><dd>{{ basePublicationTransactionPlanView(entry).data }}</dd></div>
                                        </dl>
                                        <p class="form-hint form-hint--neutral">
                                            Account observed {{ formatWhen(basePublicationTransactionPlanView(entry).accountObservedAt) }};
                                            plan constructed {{ formatWhen(basePublicationTransactionPlanView(entry).constructedAt) }}.
                                            The observed balance and fee figures may already be stale by now — this plan records what
                                            it was built from, it does not claim the network still prices gas this way.
                                        </p>
                                    </template>
                                </template>
                            </div>

                            <!-- Shown as soon as the plan is CONSTRUCTED;
                                 read-only. -->
                            <div v-if="basePublicationTransactionReviewView(entry)" class="evidence-anchor-card">
                                <div class="evidence-anchor-header">
                                    <span class="evidence-anchor-type">Base Transaction Review</span>
                                </div>
                                <p class="form-hint form-hint--neutral">
                                    The following transaction plan will be supplied to the signing capability if
                                    you explicitly continue. Reviewing it does not sign, broadcast, or validate it
                                    against the network — it names exactly what a wallet would be asked to sign,
                                    nothing more, and nothing assumed.
                                </p>
                                <dl class="evidence-fields">
                                    <div class="evidence-field"><dt>From</dt><dd>{{ basePublicationTransactionReviewView(entry).from }}</dd></div>
                                    <div class="evidence-field"><dt>To</dt><dd>{{ basePublicationTransactionReviewView(entry).to }}</dd></div>
                                    <div class="evidence-field"><dt>Value</dt><dd>{{ basePublicationTransactionReviewView(entry).value }} wei</dd></div>
                                    <div class="evidence-field"><dt>Nonce</dt><dd>{{ basePublicationTransactionReviewView(entry).nonce }}</dd></div>
                                    <div class="evidence-field"><dt>Gas limit</dt><dd>{{ basePublicationTransactionReviewView(entry).gasLimit }}</dd></div>
                                    <div class="evidence-field"><dt>Max fee per gas</dt><dd>{{ basePublicationTransactionReviewView(entry).maxFeePerGas }} wei</dd></div>
                                    <div class="evidence-field"><dt>Priority fee</dt><dd>{{ basePublicationTransactionReviewView(entry).maxPriorityFeePerGas }} wei</dd></div>
                                </dl>
                                <div class="evidence-inspection-adapter">
                                    <span class="evidence-inspection-adapter-title">Content Hash</span>
                                    <dl class="evidence-fields">
                                        <div class="evidence-field"><dd>{{ basePublicationTransactionReviewView(entry).contentHash }}</dd></div>
                                    </dl>
                                </div>
                                <div class="evidence-inspection-adapter">
                                    <span class="evidence-inspection-adapter-title">Transaction Data</span>
                                    <dl class="evidence-fields">
                                        <div class="evidence-field"><dd>{{ basePublicationTransactionReviewView(entry).transactionData }}</dd></div>
                                    </dl>
                                </div>

                                <!-- One-click alternative to the step-by-step
                                     pipeline below; both stay usable. -->
                                <div v-if="baseAnchorPublisher" class="evidence-inspection-adapter">
                                    <span class="evidence-inspection-adapter-title">Create Base Anchor</span>
                                    <p class="form-hint form-hint--neutral">
                                        Signs, finalizes, and broadcasts the exact transaction reviewed above in one
                                        step, then records a Base anchor for this publication — an alternative to
                                        signing it step by step below.
                                    </p>
                                    <button type="button" class="action-btn action-btn--secondary"
                                        :disabled="baseAnchorCreationView(entry).state === 'creating'"
                                        @click="createBaseAnchor(entry)">
                                        {{ baseAnchorCreationButtonLabel(entry) }}
                                    </button>
                                    <span v-if="baseAnchorCreationView(entry).label" class="peer-badge"
                                        :class="baseAnchorCreationBadgeClass(entry)">
                                        {{ baseAnchorCreationView(entry).label }}
                                    </span>
                                    <p v-if="baseAnchorCreationView(entry).message" class="form-hint form-hint--neutral">
                                        {{ baseAnchorCreationView(entry).message }}
                                    </p>
                                    <p v-if="baseAnchorCreationView(entry).reason" class="form-hint form-hint--neutral">
                                        {{ baseAnchorCreationView(entry).reason }}
                                    </p>
                                </div>

                                <!-- The only Base signing action; hands over
                                     the exact plan and review shown. Signing
                                     does not broadcast. -->
                                <div v-if="baseReviewedSigningCoordinator" class="evidence-inspection-adapter">
                                    <span class="evidence-inspection-adapter-title">Signing</span>
                                    <p class="form-hint form-hint--neutral">
                                        Signing authorizes the exact transaction reviewed above. It does not
                                        reconstruct or modify it, and it does not broadcast it.
                                    </p>
                                    <button type="button" class="action-btn action-btn--secondary"
                                        :disabled="isBaseReviewedTransactionSigning(entry)"
                                        @click="signBaseReviewedTransaction(entry)">
                                        {{ isBaseReviewedTransactionSigning(entry) ? 'Waiting for wallet…' : 'Sign Reviewed Transaction' }}
                                    </button>

                                    <span v-if="baseReviewedTransactionSigningView(entry).state !== BaseReviewedSigningState.IDLE" class="peer-badge"
                                        :class="baseReviewedTransactionSigningBadgeClass(entry)">
                                        {{ baseReviewedTransactionSigningView(entry).stateLabel }}
                                    </span>
                                    <p v-if="baseReviewedTransactionSigningView(entry).reason" class="form-hint form-hint--neutral">
                                        {{ baseReviewedTransactionSigningView(entry).reason }}
                                    </p>

                                    <!-- SIGNED only means the wallet returned
                                         an artifact for the reviewed plan, not
                                         that it was verified or broadcast. -->
                                    <p v-if="baseReviewedTransactionSigningView(entry).state === BaseReviewedSigningState.SIGNED"
                                       class="form-hint form-hint--neutral">
                                        The wallet returned a signed transaction. ForkBuild has not yet
                                        inspected, verified, or broadcast it — those are separate, explicit
                                        steps.
                                    </p>
                                </div>

                                <!-- A wallet-returned artifact is untrusted
                                     until verified against the reviewed plan
                                     here. Finalizing does not broadcast. -->
                                <div v-if="baseSignedTransactionFinalizationCoordinator && baseReviewedTransactionSigningView(entry).state === BaseReviewedSigningState.SIGNED"
                                     class="evidence-inspection-adapter">
                                    <span class="evidence-inspection-adapter-title">Verification & Finalization</span>
                                    <p class="form-hint form-hint--neutral">
                                        Finalizing independently, cryptographically verifies the signed
                                        transaction against the exact plan reviewed above — including
                                        recovering the actual signer from the signature itself. It does not
                                        broadcast it.
                                    </p>
                                    <button type="button" class="action-btn action-btn--secondary"
                                        @click="finalizeBaseSignedTransaction(entry)">
                                        Verify &amp; Finalize Transaction
                                    </button>

                                    <span v-if="baseSignedTransactionFinalizationView(entry).state !== BaseSignedTransactionFinalizationState.IDLE" class="peer-badge"
                                        :class="baseSignedTransactionFinalizationBadgeClass(entry)">
                                        {{ baseSignedTransactionFinalizationView(entry).stateLabel }}
                                    </span>
                                    <p v-if="baseSignedTransactionFinalizationView(entry).reason" class="form-hint form-hint--neutral">
                                        {{ baseSignedTransactionFinalizationView(entry).reason }}
                                    </p>

                                    <!-- FINALIZED: decoded, matches the plan
                                         field for field, and signed by the
                                         plan's from account. Not broadcast or
                                         confirmed. -->
                                    <template v-if="baseSignedTransactionFinalizationView(entry).state === BaseSignedTransactionFinalizationState.FINALIZED">
                                        <dl class="evidence-fields">
                                            <div class="evidence-field"><dt>Recovered signer</dt><dd>{{ baseSignedTransactionFinalizationView(entry).from }}</dd></div>
                                            <div class="evidence-field"><dt>Transaction hash</dt><dd>{{ baseSignedTransactionFinalizationView(entry).transactionHash }}</dd></div>
                                        </dl>
                                        <p class="form-hint form-hint--neutral">
                                            The signed transaction matches the reviewed transaction and is
                                            ready for the separate broadcast step.
                                        </p>
                                    </template>
                                </div>

                                <!-- Submits the exact finalized raw
                                     transaction. BROADCASTED does not mean
                                     confirmed. -->
                                <div v-if="baseTransactionBroadcastCoordinator && baseSignedTransactionFinalizationView(entry).state === BaseSignedTransactionFinalizationState.FINALIZED"
                                     class="evidence-inspection-adapter">
                                    <span class="evidence-inspection-adapter-title">Broadcast</span>
                                    <p class="form-hint form-hint--neutral">
                                        Broadcasting submits the exact finalized transaction above to Base's
                                        own network. It does not construct, sign, modify, or re-verify it —
                                        and broadcasting does not mean the transaction has been confirmed.
                                    </p>
                                    <button type="button" class="action-btn action-btn--secondary"
                                        :disabled="isBaseTransactionBroadcasting(entry)"
                                        @click="broadcastBaseTransaction(entry)">
                                        {{ isBaseTransactionBroadcasting(entry) ? 'Broadcasting…' : (baseTransactionBroadcastView(entry).state === BaseTransactionBroadcastState.IDLE ? 'Broadcast Transaction' : 'Broadcast Again') }}
                                    </button>

                                    <span v-if="baseTransactionBroadcastView(entry).state !== BaseTransactionBroadcastState.IDLE" class="peer-badge"
                                        :class="baseTransactionBroadcastBadgeClass(entry)">
                                        {{ baseTransactionBroadcastView(entry).stateLabel }}
                                    </span>
                                    <p v-if="baseTransactionBroadcastView(entry).reason" class="form-hint form-hint--neutral">
                                        {{ baseTransactionBroadcastView(entry).reason }}
                                    </p>

                                    <dl v-if="baseTransactionBroadcastView(entry).state === BaseTransactionBroadcastState.BROADCASTED" class="evidence-fields">
                                        <div class="evidence-field"><dt>Transaction ID</dt><dd>{{ baseTransactionBroadcastView(entry).txid }}</dd></div>
                                    </dl>
                                </div>

                                <!-- Asks Base whether the broadcast hash is in
                                     a block, one fresh observation per click;
                                     every observation is kept and archived. -->
                                <div v-if="baseTransactionInclusionObservationCoordinator && baseTransactionBroadcastView(entry).state === BaseTransactionBroadcastState.BROADCASTED"
                                     class="evidence-inspection-adapter">
                                    <span class="evidence-inspection-adapter-title">Base Transaction Inclusion</span>
                                    <p class="form-hint form-hint--neutral">
                                        The network accepted this transaction for broadcast. Whether it has
                                        since been included in a block is a separate, later observation.
                                    </p>

                                    <button type="button" class="action-btn action-btn--secondary"
                                        :disabled="isBaseTransactionInclusionObserving(entry)"
                                        @click="observeBaseTransactionInclusion(entry)">
                                        {{ isBaseTransactionInclusionObserving(entry) ? 'Observing…' : (baseTransactionInclusionView(entry) ? 'Observe Transaction Again' : 'Observe Transaction') }}
                                    </button>
                                    <p v-if="entry.baseTransactionInclusionError" class="form-hint form-hint--neutral">
                                        {{ entry.baseTransactionInclusionError }}
                                    </p>

                                    <template v-if="baseTransactionInclusionView(entry)">
                                        <span class="peer-badge" :class="baseTransactionInclusionBadgeClass(entry)">
                                            {{ baseTransactionInclusionView(entry).stateLabel }}
                                        </span>

                                        <!-- INCLUDED only means a receipt
                                             exists now; a reorganization is
                                             still possible and is not detected. -->
                                        <dl v-if="baseTransactionInclusionView(entry).state === BaseTransactionInclusionObservationState.INCLUDED" class="evidence-fields">
                                            <div class="evidence-field"><dt>Block hash</dt><dd>{{ baseTransactionInclusionView(entry).blockHash }}</dd></div>
                                            <div class="evidence-field"><dt>Block number</dt><dd>{{ baseTransactionInclusionView(entry).blockNumber }}</dd></div>
                                            <div class="evidence-field"><dt>Transaction index</dt><dd>{{ baseTransactionInclusionView(entry).transactionIndex }}</dd></div>
                                            <div class="evidence-field"><dt>Confirmations</dt><dd>{{ baseTransactionInclusionView(entry).confirmationCount }}</dd></div>
                                            <div class="evidence-field"><dt>Observed</dt><dd>{{ formatWhen(baseTransactionInclusionView(entry).observedAt) }}</dd></div>
                                        </dl>
                                        <p v-else-if="baseTransactionInclusionView(entry).state === BaseTransactionInclusionObservationState.NOT_INCLUDED" class="form-hint form-hint--neutral">
                                            No receipt was returned for this transaction at this observation
                                            ({{ formatWhen(baseTransactionInclusionView(entry).observedAt) }}).
                                        </p>
                                        <p v-if="baseTransactionInclusionView(entry).reason" class="form-hint form-hint--neutral">
                                            {{ baseTransactionInclusionView(entry).reason }}
                                        </p>

                                        <button v-if="baseTransactionInclusionHistoryView(entry).count > 1" type="button" class="action-btn action-btn--secondary"
                                            @click="toggleBaseTransactionInclusionHistory(entry)">
                                            {{ entry.baseTransactionInclusionHistoryExpanded ? 'Hide Observation History' : ('Show Observation History (' + baseTransactionInclusionHistoryView(entry).count + ')') }}
                                        </button>
                                    </template>

                                    <div v-if="entry.baseTransactionInclusionHistoryExpanded">
                                        <ul class="replica-knowledge-claim-list">
                                            <li v-for="(item, index) in baseTransactionInclusionHistoryView(entry).observations" :key="index" class="replica-knowledge-claim">
                                                <dl class="evidence-fields">
                                                    <div class="evidence-field"><dt>Observed</dt><dd>{{ formatWhen(item.observedAt) }}</dd></div>
                                                    <div class="evidence-field"><dt>State</dt><dd>{{ item.stateShortLabel }}</dd></div>
                                                    <div v-if="item.blockHash" class="evidence-field"><dt>Block hash</dt><dd>{{ item.blockHash }}</dd></div>
                                                    <div v-if="item.blockNumber !== null" class="evidence-field"><dt>Block number</dt><dd>{{ item.blockNumber }}</dd></div>
                                                    <div v-if="item.confirmationCount !== null" class="evidence-field"><dt>Confirmations</dt><dd>{{ item.confirmationCount }}</dd></div>
                                                    <div v-if="item.reason" class="evidence-field"><dt>Reason</dt><dd>{{ item.reason }}</dd></div>
                                                </dl>
                                            </li>
                                        </ul>
                                    </div>
                                </div>
                            </div>
                        </div>

                        <div v-if="entry.evidenceExpanded && entry.evidence.count > 0" class="evidence-list">
                            <div v-for="anchorView in entry.evidence.anchors" :key="anchorView.anchorId" class="evidence-anchor-card">
                                <div class="evidence-anchor-header">
                                    <span class="evidence-anchor-type">{{ humanizeAnchorType(anchorView.anchorType) }}</span>
                                    <span class="peer-badge" :class="evidenceBadgeClass(anchorView)">{{ anchorView.verificationLabel }}</span>
                                </div>
                                <p v-if="anchorView.verificationReason" class="form-hint form-hint--neutral">
                                    {{ anchorView.verificationReason }}
                                </p>
                                <p v-if="lifecycleNote(entry, anchorView)" class="form-hint form-hint--neutral">
                                    {{ lifecycleNote(entry, anchorView) }}
                                </p>
                                <dl class="evidence-fields">
                                    <div class="evidence-field"><dt>Locator</dt><dd>{{ anchorView.locator }}</dd></div>
                                    <div class="evidence-field"><dt>Recorded</dt><dd>{{ formatWhen(anchorView.anchoredAt) }}</dd></div>
                                    <div class="evidence-field"><dt>Publication</dt><dd>{{ anchorView.publicationId }}</dd></div>
                                    <div class="evidence-field"><dt>Content hash</dt><dd>{{ anchorView.contentHash }}</dd></div>
                                    <div v-if="anchorView.anchorIdentityId" class="evidence-field">
                                        <dt>Attested by</dt><dd>{{ shortId(anchorView.anchorIdentityId) }}</dd>
                                    </div>
                                </dl>
                                <div class="identity-mgmt-actions">
                                    <button class="action-btn action-btn--secondary" @click="toggleInspect(entry, anchorView)">
                                        {{ inspectionExpanded(entry, anchorView) ? 'Hide Details' : 'Inspect Evidence' }}
                                    </button>
                                    <button class="action-btn action-btn--secondary" :disabled="anchorView.checking"
                                            @click="verifyAnchor(entry, anchorView)">
                                        {{ anchorView.checking ? 'Verifying…' : (anchorView.verified ? 'Verify Again' : 'Verify Evidence') }}
                                    </button>
                                </div>

                                <!-- Wallet connection is independent of the
                                     reconciliation card below, which needs no
                                     wallet. -->
                                <div v-if="anchorView.anchorType === 'bitcoin-op-return' && bitcoinWalletConnection"
                                     class="evidence-inspection">
                                    <span class="evidence-inspection-title">Bitcoin Wallet</span>
                                    <div class="evidence-inspection-adapter">
                                        <span class="peer-badge" :class="bitcoinWalletConnectionBadgeClass()">
                                            {{ bitcoinWalletConnectionView().stateLabel }}
                                        </span>
                                        <dl v-if="isBitcoinWalletConnected()" class="evidence-fields">
                                            <div class="evidence-field"><dt>Account</dt><dd>{{ shortId(bitcoinWalletConnectionView().account) }}</dd></div>
                                            <div class="evidence-field"><dt>Network</dt><dd>{{ bitcoinWalletConnectionView().network }}</dd></div>
                                        </dl>
                                        <!-- A mismatch is named, never resolved
                                             on the person's behalf. -->
                                        <p v-if="bitcoinWalletConnectionView().networkMismatch" class="form-hint form-hint--neutral">
                                            Wallet network ({{ bitcoinWalletConnectionView().network }}) does not match this anchor's network ({{ bitcoinWalletConnectionView().expectedNetwork }}). Connect a wallet on the matching network to continue.
                                        </p>
                                        <p v-if="bitcoinWalletConnectionState.reason" class="form-hint form-hint--neutral">
                                            {{ bitcoinWalletConnectionState.reason }}
                                        </p>
                                    </div>
                                    <div class="identity-mgmt-actions">
                                        <button v-if="!isBitcoinWalletConnected()" class="action-btn action-btn--secondary"
                                                :disabled="isBitcoinWalletConnecting()"
                                                @click="connectBitcoinWallet()">
                                            {{ isBitcoinWalletConnecting() ? 'Connecting…' : 'Connect Bitcoin Wallet' }}
                                        </button>
                                        <button v-else class="action-btn action-btn--secondary" @click="disconnectBitcoinWallet()">
                                            Disconnect
                                        </button>
                                    </div>
                                </div>

                                <!-- Confirmation and content proof as reported
                                     now, side by side; a CONFIRMED transaction
                                     next to a HASH_MISMATCH proof is shown as
                                     is. -->
                                <div v-if="anchorView.anchorType === 'bitcoin-op-return' && bitcoinAnchorProofReconciliationView"
                                     class="evidence-inspection">
                                    <span class="evidence-inspection-title">Bitcoin Anchor</span>
                                    <dl class="evidence-fields">
                                        <div class="evidence-field"><dt>Transaction</dt><dd>{{ anchorView.locator }}</dd></div>
                                        <div class="evidence-field"><dt>Content hash</dt><dd>{{ anchorView.contentHash }}</dd></div>
                                    </dl>

                                    <p v-if="!bitcoinAnchorReconciliationView(entry, anchorView).confirmation && !bitcoinAnchorReconciliationView(entry, anchorView).reconciling"
                                       class="form-hint form-hint--neutral">
                                        Not yet checked this session.
                                    </p>
                                    <p v-if="bitcoinAnchorReconciliationView(entry, anchorView).error" class="form-hint form-hint--neutral">
                                        {{ bitcoinAnchorReconciliationView(entry, anchorView).error }}
                                    </p>

                                    <div v-if="bitcoinAnchorReconciliationView(entry, anchorView).confirmation" class="evidence-inspection-adapter">
                                        <span class="evidence-inspection-adapter-title">Confirmation</span>
                                        <span class="peer-badge" :class="bitcoinAnchorConfirmationBadgeClass(entry, anchorView)">
                                            {{ bitcoinAnchorReconciliationView(entry, anchorView).confirmation.stateLabel }}
                                        </span>
                                        <dl v-if="bitcoinAnchorReconciliationView(entry, anchorView).confirmation.blockHeight !== null" class="evidence-fields">
                                            <div class="evidence-field"><dt>Block</dt><dd>{{ bitcoinAnchorReconciliationView(entry, anchorView).confirmation.blockHeight }}</dd></div>
                                            <div class="evidence-field"><dt>Confirmations</dt><dd>{{ bitcoinAnchorReconciliationView(entry, anchorView).confirmation.confirmationCount }}</dd></div>
                                        </dl>
                                        <p v-if="bitcoinAnchorReconciliationView(entry, anchorView).confirmation.reason" class="form-hint form-hint--neutral">
                                            {{ bitcoinAnchorReconciliationView(entry, anchorView).confirmation.reason }}
                                        </p>
                                    </div>

                                    <div v-if="bitcoinAnchorReconciliationView(entry, anchorView).contentProof" class="evidence-inspection-adapter">
                                        <span class="evidence-inspection-adapter-title">Content proof</span>
                                        <span class="peer-badge" :class="bitcoinAnchorContentProofBadgeClass(entry, anchorView)">
                                            {{ bitcoinAnchorReconciliationView(entry, anchorView).contentProof.stateLabel }}
                                        </span>
                                        <p v-if="bitcoinAnchorReconciliationView(entry, anchorView).contentProof.reason" class="form-hint form-hint--neutral">
                                            {{ bitcoinAnchorReconciliationView(entry, anchorView).contentProof.reason }}
                                        </p>
                                    </div>

                                    <div class="identity-mgmt-actions">
                                        <button class="action-btn action-btn--secondary"
                                                :disabled="bitcoinAnchorReconciliationView(entry, anchorView).reconciling"
                                                @click="reconcileBitcoinAnchor(entry, anchorView)">
                                            {{ bitcoinAnchorReconcileButtonLabel(entry, anchorView) }}
                                        </button>
                                        <button v-if="bitcoinAnchorConfirmationHistoryView(entry, anchorView).count > 0"
                                                class="action-btn action-btn--secondary"
                                                @click="toggleBitcoinAnchorConfirmationHistory(entry, anchorView)">
                                            {{ isBitcoinAnchorConfirmationHistoryExpanded(entry, anchorView) ? 'Hide Confirmation History' : 'Show Confirmation History' }}
                                        </button>
                                        <!-- Needs at least two observations to
                                             compare; a local re-derivation, no
                                             network call. -->
                                        <button v-if="(entry.bitcoinAnchorConfirmationHistories[anchorView.anchorId] || []).length > 1"
                                                class="action-btn action-btn--secondary"
                                                @click="toggleBitcoinAnchorChainPlacementComparison(entry, anchorView)">
                                            {{ isBitcoinAnchorChainPlacementComparisonExpanded(entry, anchorView) ? 'Hide Placement Comparison' : 'Compare Confirmation Observations' }}
                                        </button>
                                        <button v-if="(entry.bitcoinAnchorConfirmationHistories[anchorView.anchorId] || []).length > 1"
                                                class="action-btn action-btn--secondary"
                                                @click="toggleBitcoinAnchorObservationConsistency(entry, anchorView)">
                                            {{ isBitcoinAnchorObservationConsistencyExpanded(entry, anchorView) ? 'Hide Observation Consistency' : 'Observation Consistency' }}
                                        </button>
                                        <!-- Shown for any recorded fact (it
                                             also includes content proof);
                                             local, no network call. -->
                                        <button v-if="bitcoinAnchorObservationEvidenceView(entry, anchorView).confirmationObservations.count > 0
                                                       || bitcoinAnchorObservationEvidenceView(entry, anchorView).contentProofObservations.count > 0"
                                                class="action-btn action-btn--secondary"
                                                @click="toggleBitcoinAnchorObservationEvidence(entry, anchorView)">
                                            {{ isBitcoinAnchorObservationEvidenceExpanded(entry, anchorView) ? 'Hide Bitcoin Anchor Evidence' : 'Bitcoin Anchor Evidence' }}
                                        </button>
                                    </div>

                                    <!-- A changed placement is narrated
                                         neutrally, never labeled a
                                         reorganization. -->
                                    <div v-if="isBitcoinAnchorChainPlacementComparisonExpanded(entry, anchorView)">
                                        <p v-if="bitcoinAnchorChainPlacementComparisonView(entry, anchorView).count === 0" class="form-hint form-hint--neutral">
                                            Not enough confirmed observations exist yet to compare block placement.
                                        </p>
                                        <ul v-else class="replica-knowledge-claim-list">
                                            <li v-for="(comparison, index) in bitcoinAnchorChainPlacementComparisonView(entry, anchorView).comparisons" :key="index" class="replica-knowledge-claim">
                                                <p class="form-hint form-hint--neutral">{{ comparison.outcomeLabel }}</p>
                                                <dl v-if="comparison.previousBlock || comparison.laterBlock" class="evidence-fields">
                                                    <div v-if="comparison.previousBlock" class="evidence-field">
                                                        <dt>Previous block</dt>
                                                        <dd>
                                                            {{ comparison.previousBlock.blockHash || '(not confirmed)' }}
                                                            <span v-if="comparison.previousBlock.blockHeight !== null">— height {{ comparison.previousBlock.blockHeight }}, {{ comparison.previousBlock.confirmationCount }} confirmation(s)</span>
                                                            — observed {{ formatWhen(comparison.previousBlock.observedAt) }}
                                                        </dd>
                                                    </div>
                                                    <div v-if="comparison.laterBlock" class="evidence-field">
                                                        <dt>Later block</dt>
                                                        <dd>
                                                            {{ comparison.laterBlock.blockHash || '(not confirmed)' }}
                                                            <span v-if="comparison.laterBlock.blockHeight !== null">— height {{ comparison.laterBlock.blockHeight }}, {{ comparison.laterBlock.confirmationCount }} confirmation(s)</span>
                                                            — observed {{ formatWhen(comparison.laterBlock.observedAt) }}
                                                        </dd>
                                                    </div>
                                                </dl>
                                            </li>
                                        </ul>
                                    </div>

                                    <!-- An inconsistency is narrated neutrally,
                                         never labeled a reorganization or
                                         fraud. -->
                                    <div v-if="isBitcoinAnchorObservationConsistencyExpanded(entry, anchorView)">
                                        <p v-if="bitcoinAnchorObservationConsistencyView(entry, anchorView).count === 0" class="form-hint form-hint--neutral">
                                            Not enough confirmed observations exist yet to analyze consistency.
                                        </p>
                                        <ul v-else class="replica-knowledge-claim-list">
                                            <li v-for="(finding, index) in bitcoinAnchorObservationConsistencyView(entry, anchorView).findings" :key="index" class="replica-knowledge-claim">
                                                <p class="form-hint form-hint--neutral">{{ finding.stateLabel }}</p>
                                                <dl v-if="finding.previousBlock || finding.laterBlock" class="evidence-fields">
                                                    <div v-if="finding.previousBlock" class="evidence-field">
                                                        <dt>Previous block</dt>
                                                        <dd>
                                                            {{ finding.previousBlock.blockHash || '(not confirmed)' }}
                                                            <span v-if="finding.previousBlock.blockHeight !== null">— height {{ finding.previousBlock.blockHeight }}, {{ finding.previousBlock.confirmationCount }} confirmation(s)</span>
                                                            — observed {{ formatWhen(finding.previousBlock.observedAt) }}
                                                        </dd>
                                                    </div>
                                                    <div v-if="finding.laterBlock" class="evidence-field">
                                                        <dt>Later block</dt>
                                                        <dd>
                                                            {{ finding.laterBlock.blockHash || '(not confirmed)' }}
                                                            <span v-if="finding.laterBlock.blockHeight !== null">— height {{ finding.laterBlock.blockHeight }}, {{ finding.laterBlock.confirmationCount }} confirmation(s)</span>
                                                            — observed {{ formatWhen(finding.laterBlock.observedAt) }}
                                                        </dd>
                                                    </div>
                                                </dl>
                                            </li>
                                        </ul>
                                    </div>

                                    <!-- This anchor's independent facts side by
                                         side in their own vocabularies, never a
                                         combined verdict. -->
                                    <ul v-if="isBitcoinAnchorObservationEvidenceExpanded(entry, anchorView)" class="replica-knowledge-claim-list">
                                        <li class="replica-knowledge-claim">
                                            <p class="form-hint form-hint--neutral">
                                                Broadcast observations: {{ bitcoinAnchorObservationEvidenceView(entry, anchorView).broadcastObservations.count }}
                                            </p>
                                            <ul v-if="bitcoinAnchorObservationEvidenceView(entry, anchorView).broadcastObservations.count > 0">
                                                <li v-for="item in bitcoinAnchorObservationEvidenceView(entry, anchorView).broadcastObservations.observations" :key="item.index">
                                                    {{ item.stateLabel }} — {{ item.broadcastedAt ? formatWhen(item.broadcastedAt) : 'no timestamp recorded' }}
                                                </li>
                                            </ul>
                                        </li>
                                        <li class="replica-knowledge-claim">
                                            <p class="form-hint form-hint--neutral">
                                                Confirmation observations: {{ bitcoinAnchorObservationEvidenceView(entry, anchorView).confirmationObservations.count }}
                                            </p>
                                            <ul v-if="bitcoinAnchorObservationEvidenceView(entry, anchorView).confirmationObservations.count > 0">
                                                <li v-for="item in bitcoinAnchorObservationEvidenceView(entry, anchorView).confirmationObservations.observations" :key="item.index">
                                                    Confirmation observation #{{ item.index }} — {{ formatWhen(item.observedAt) }} — {{ item.stateLabel }}
                                                </li>
                                            </ul>
                                        </li>
                                        <li class="replica-knowledge-claim">
                                            <p class="form-hint form-hint--neutral">
                                                Content-proof observations: {{ bitcoinAnchorObservationEvidenceView(entry, anchorView).contentProofObservations.count }}
                                            </p>
                                            <ul v-if="bitcoinAnchorObservationEvidenceView(entry, anchorView).contentProofObservations.count > 0">
                                                <li v-for="item in bitcoinAnchorObservationEvidenceView(entry, anchorView).contentProofObservations.observations" :key="item.index">
                                                    Content-proof observation #{{ item.index }} — {{ formatWhen(item.observedAt) }} — {{ item.stateLabel }}
                                                </li>
                                            </ul>
                                        </li>
                                        <li class="replica-knowledge-claim">
                                            <p class="form-hint form-hint--neutral">
                                                Chain-placement comparisons: {{ bitcoinAnchorObservationEvidenceView(entry, anchorView).chainPlacementObservations.count }}
                                            </p>
                                        </li>
                                        <li class="replica-knowledge-claim">
                                            <p class="form-hint form-hint--neutral">
                                                Consistency findings: {{ bitcoinAnchorObservationEvidenceView(entry, anchorView).consistencyFindings.count }}
                                            </p>
                                        </li>
                                    </ul>

                                    <div v-if="isBitcoinAnchorConfirmationHistoryExpanded(entry, anchorView)">
                                        <ul class="replica-knowledge-claim-list">
                                            <li v-for="(item, index) in bitcoinAnchorConfirmationHistoryView(entry, anchorView).entries" :key="index" class="replica-knowledge-claim">
                                                <button class="action-btn action-btn--secondary"
                                                        @click="toggleBitcoinAnchorConfirmationHistoryEntry(entry, anchorView, index)">
                                                    {{ formatWhen(item.observedAt) }} — {{ item.stateShortLabel }}
                                                </button>
                                                <dl v-if="isBitcoinAnchorConfirmationHistoryEntryExpanded(entry, anchorView, index)" class="evidence-fields">
                                                    <div class="evidence-field"><dt>State</dt><dd>{{ item.stateLabel }}</dd></div>
                                                    <div class="evidence-field"><dt>Transaction ID</dt><dd>{{ item.txid }}</dd></div>
                                                    <div v-if="item.blockHash" class="evidence-field"><dt>Block hash</dt><dd>{{ item.blockHash }}</dd></div>
                                                    <div v-if="item.blockHeight !== null" class="evidence-field"><dt>Block height</dt><dd>{{ item.blockHeight }}</dd></div>
                                                    <div v-if="item.confirmationCount !== null" class="evidence-field"><dt>Confirmations</dt><dd>{{ item.confirmationCount }}</dd></div>
                                                    <div v-if="item.reason" class="evidence-field"><dt>Reason</dt><dd>{{ item.reason }}</dd></div>
                                                </dl>
                                            </li>
                                        </ul>
                                    </div>
                                </div>

                                <!-- Local read; inspecting and verifying stay
                                     separate actions. -->
                                <div v-if="inspectionExpanded(entry, anchorView) && inspectionDetail(entry, anchorView)"
                                     class="evidence-inspection">
                                    <span class="evidence-inspection-title">External Evidence</span>
                                    <p class="form-hint form-hint--neutral">{{ inspectionDetail(entry, anchorView).bindingDescription }}</p>
                                    <dl class="evidence-fields">
                                        <div class="evidence-field">
                                            <dt>{{ inspectionDetail(entry, anchorView).anchoredAtLabel }}</dt>
                                            <dd>{{ formatWhen(inspectionDetail(entry, anchorView).anchoredAt) }}</dd>
                                        </div>
                                        <div class="evidence-field"><dt>External locator</dt><dd>{{ inspectionDetail(entry, anchorView).locator }}</dd></div>
                                    </dl>

                                    <div v-if="inspectionTypeSpecific(entry, anchorView)" class="evidence-inspection-adapter">
                                        <span class="evidence-inspection-adapter-title">{{ inspectionTypeSpecific(entry, anchorView).summary }}</span>
                                        <dl class="evidence-fields">
                                            <div v-for="field in inspectionTypeSpecific(entry, anchorView).fields" :key="field.label" class="evidence-field">
                                                <dt>{{ field.label }}</dt><dd>{{ field.value }}</dd>
                                            </div>
                                        </dl>
                                        <a v-if="inspectionTypeSpecific(entry, anchorView).externalLocator"
                                           class="action-btn action-btn--secondary"
                                           :href="inspectionTypeSpecific(entry, anchorView).externalLocator.url"
                                           target="_blank" rel="noopener noreferrer">
                                            {{ inspectionTypeSpecific(entry, anchorView).externalLocator.label }}
                                        </a>
                                    </div>

                                    <details class="evidence-inspection-proof">
                                        <summary>Proof (raw, adapter-defined evidence)</summary>
                                        <pre class="evidence-inspection-proof-json">{{ JSON.stringify(inspectionDetail(entry, anchorView).proof, null, 2) }}</pre>
                                    </details>

                                    <!-- How this replica learned the claim;
                                         never names a peer or reads as a trust
                                         signal. -->
                                    <div v-if="inspectionKnowledge(entry, anchorView) && inspectionKnowledge(entry, anchorView).known"
                                         class="evidence-inspection-knowledge">
                                        <span class="evidence-inspection-title">Local Knowledge</span>
                                        <dl class="evidence-fields">
                                            <div class="evidence-field">
                                                <dt>Acquisition</dt>
                                                <dd>{{ inspectionKnowledge(entry, anchorView).acquisitionLabel }}</dd>
                                            </div>
                                            <div class="evidence-field">
                                                <dt>{{ inspectionKnowledge(entry, anchorView).firstSeenAtLabel }}</dt>
                                                <dd>{{ formatWhen(inspectionKnowledge(entry, anchorView).firstSeenAt) }}</dd>
                                            </div>
                                        </dl>
                                    </div>
                                </div>
                            </div>
                        </div>
                    </div>

                    </div>

                    <div v-show="entry.detailsTab === 'placements'">
                    <!-- Placements answer "where can I retrieve this", anchors
                         "did something record this"; kept as separate lists. -->
                    <div v-if="entry.placementsView" class="evidence-section">
                        <div class="evidence-summary">
                            <span class="evidence-summary-title">Snapshot Placements</span>
                            <span class="form-hint form-hint--neutral">{{ describeKnownPlacementCount(entry.placementsView) }}</span>
                            <button v-if="entry.placementsView.count > 0" class="action-btn action-btn--secondary" @click="togglePlacements(entry)">
                                {{ entry.placementsExpanded ? 'Hide Placements' : 'Show Placements' }}
                            </button>
                        </div>

                        <!-- Resolves the saved Content preference on every
                             click; the per-storage buttons stay unchanged. -->
                        <div v-if="preferredPlacementCreationCoordinator" class="evidence-discovery">
                            <div class="evidence-discovery-header">
                                <button class="action-btn action-btn--secondary"
                                        :disabled="preferredPlacementCreationView(entry).state === 'creating'"
                                        @click="createPreferredPlacement(entry)">
                                    {{ preferredPlacementCreationButtonLabel(entry) }}
                                </button>
                                <span v-if="preferredPlacementCreationView(entry).label" class="peer-badge" :class="preferredPlacementCreationBadgeClass(entry)">
                                    {{ preferredPlacementCreationView(entry).label }}
                                </span>
                            </div>
                            <p v-if="preferredPlacementCreationView(entry).message" class="form-hint form-hint--neutral">
                                {{ preferredPlacementCreationView(entry).message }}
                            </p>
                            <p v-if="preferredPlacementCreationView(entry).reason" class="form-hint form-hint--neutral">
                                {{ preferredPlacementCreationView(entry).reason }}
                            </p>
                            <dl v-if="preferredPlacementCreationView(entry).placement" class="evidence-fields">
                                <div class="evidence-field"><dt>Locator</dt><dd>{{ preferredPlacementCreationView(entry).placement.locator }}</dd></div>
                                <div class="evidence-field"><dt>Content hash</dt><dd>{{ preferredPlacementCreationView(entry).placement.contentHash }}</dd></div>
                            </dl>
                        </div>

                        <!-- Groups are ordered by contentHash, never by size. -->
                        <div v-if="entry.placementsExpanded && entry.placementConvergenceView && entry.placementConvergenceView.placementCount > 1"
                             class="evidence-convergence">
                            <span class="evidence-convergence-title">Placement relationships</span>
                            <p class="form-hint form-hint--neutral">
                                {{ entry.placementConvergenceView.placementCount }} known placements
                                · {{ entry.placementConvergenceView.storageTypeCount }} storage backend{{ entry.placementConvergenceView.storageTypeCount === 1 ? '' : 's' }}
                                · {{ entry.placementConvergenceView.locatorCount }} distinct location{{ entry.placementConvergenceView.locatorCount === 1 ? '' : 's' }}
                            </p>
                            <div class="evidence-convergence-groups">
                                <div v-for="group in entry.placementConvergenceView.contentGroups" :key="group.contentHash"
                                     class="evidence-convergence-group">
                                    <span class="evidence-convergence-hash">{{ shortHash(group.contentHash) }}</span>
                                    <span class="form-hint form-hint--neutral">
                                        {{ group.placementCount }} placement{{ group.placementCount === 1 ? '' : 's' }}
                                    </span>
                                </div>
                            </div>
                            <p class="form-hint form-hint--neutral">Content binding: {{ entry.placementConvergenceView.relationship === 'conflict' ? 'CONFLICT' : 'AGREEMENT' }}</p>
                            <p v-if="entry.placementConvergenceView.hasConflict" class="evidence-convergence-conflict">
                                ⚠ {{ entry.placementConvergenceView.conflictDescription }}
                            </p>
                        </div>

                        <div v-if="entry.placementsExpanded && entry.placementsView.count > 0" class="evidence-list">
                            <div v-for="placementView in entry.placementsView.placements" :key="placementView.placementId" class="evidence-anchor-card">
                                <div class="evidence-anchor-header">
                                    <span class="evidence-anchor-type">{{ humanizeStorageType(placementView.storage) }}</span>
                                    <span class="peer-badge" :class="placementBadgeClass(placementView)">{{ placementView.resolutionLabel }}</span>
                                </div>
                                <p v-if="placementView.resolutionReason" class="form-hint form-hint--neutral">
                                    {{ placementView.resolutionReason }}
                                </p>
                                <p v-if="placementLifecycleNote(entry, placementView)" class="form-hint form-hint--neutral">
                                    {{ placementLifecycleNote(entry, placementView) }}
                                </p>
                                <dl class="evidence-fields">
                                    <div class="evidence-field"><dt>Locator</dt><dd>{{ placementView.locator }}</dd></div>
                                    <div class="evidence-field"><dt>Placed</dt><dd>{{ formatWhen(placementView.placedAt) }}</dd></div>
                                    <div class="evidence-field"><dt>Publication</dt><dd>{{ placementView.publicationId }}</dd></div>
                                    <div class="evidence-field"><dt>Content hash</dt><dd>{{ placementView.contentHash }}</dd></div>
                                    <div v-if="placementView.placerIdentityId" class="evidence-field">
                                        <dt>Placed by</dt><dd>{{ shortId(placementView.placerIdentityId) }}</dd>
                                    </div>
                                </dl>
                                <div class="identity-mgmt-actions">
                                    <button class="action-btn action-btn--secondary" @click="togglePlacementInspect(entry, placementView)">
                                        {{ placementInspectionExpanded(entry, placementView) ? 'Hide Details' : 'Inspect Placement' }}
                                    </button>
                                    <button class="action-btn action-btn--secondary" :disabled="placementView.checking"
                                            @click="resolvePlacement(entry, placementView)">
                                        {{ placementView.checking ? 'Resolving…' : (placementView.resolved ? 'Resolve Again' : 'Resolve Snapshot') }}
                                    </button>
                                    <!-- Resolves and, on success, stores the
                                         bytes locally; explicit click only. -->
                                    <button v-if="snapshotPlacementMaterializationCoordinator" class="action-btn action-btn--primary"
                                            :disabled="placementMaterializationView(entry, placementView).materializing"
                                            @click="materializePlacement(entry, placementView)">
                                        {{ placementMaterializationButtonLabel(entry, placementView) }}
                                    </button>
                                </div>
                                <div v-if="snapshotPlacementMaterializationCoordinator && placementMaterializationView(entry, placementView).label"
                                     class="evidence-discovery-header">
                                    <span class="peer-badge" :class="placementMaterializationBadgeClass(entry, placementView)">
                                        {{ placementMaterializationView(entry, placementView).label }}
                                    </span>
                                </div>
                                <p v-if="snapshotPlacementMaterializationCoordinator && placementMaterializationView(entry, placementView).message"
                                   class="form-hint form-hint--neutral">
                                    {{ placementMaterializationView(entry, placementView).message }}
                                </p>

                                <!-- Local read; inspecting and resolving stay
                                     separate actions. -->
                                <div v-if="placementInspectionExpanded(entry, placementView) && placementInspectionDetail(entry, placementView)"
                                     class="evidence-inspection">
                                    <span class="evidence-inspection-title">Snapshot Placement</span>
                                    <p class="form-hint form-hint--neutral">{{ placementInspectionDetail(entry, placementView).bindingDescription }}</p>
                                    <dl class="evidence-fields">
                                        <div class="evidence-field">
                                            <dt>{{ placementInspectionDetail(entry, placementView).placedAtLabel }}</dt>
                                            <dd>{{ formatWhen(placementInspectionDetail(entry, placementView).placedAt) }}</dd>
                                        </div>
                                        <div class="evidence-field"><dt>Locator</dt><dd>{{ placementInspectionDetail(entry, placementView).locator }}</dd></div>
                                    </dl>

                                    <div v-if="placementInspectionTypeSpecific(entry, placementView)" class="evidence-inspection-adapter">
                                        <span class="evidence-inspection-adapter-title">{{ placementInspectionTypeSpecific(entry, placementView).summary }}</span>
                                        <dl class="evidence-fields">
                                            <div v-for="field in placementInspectionTypeSpecific(entry, placementView).fields" :key="field.label" class="evidence-field">
                                                <dt>{{ field.label }}</dt><dd>{{ field.value }}</dd>
                                            </div>
                                        </dl>
                                        <a v-if="placementInspectionTypeSpecific(entry, placementView).externalLocator"
                                           class="action-btn action-btn--secondary"
                                           :href="placementInspectionTypeSpecific(entry, placementView).externalLocator.url"
                                           target="_blank" rel="noopener noreferrer">
                                            {{ placementInspectionTypeSpecific(entry, placementView).externalLocator.label }}
                                        </a>
                                    </div>

                                    <!-- How this replica learned the claim;
                                         never names a peer or reads as a trust
                                         signal. -->
                                    <div v-if="placementInspectionKnowledge(entry, placementView) && placementInspectionKnowledge(entry, placementView).known"
                                         class="evidence-inspection-knowledge">
                                        <span class="evidence-inspection-title">Local Knowledge</span>
                                        <dl class="evidence-fields">
                                            <div class="evidence-field">
                                                <dt>Acquisition</dt>
                                                <dd>{{ placementInspectionKnowledge(entry, placementView).acquisitionLabel }}</dd>
                                            </div>
                                            <div class="evidence-field">
                                                <dt>{{ placementInspectionKnowledge(entry, placementView).firstSeenAtLabel }}</dt>
                                                <dd>{{ formatWhen(placementInspectionKnowledge(entry, placementView).firstSeenAt) }}</dd>
                                            </div>
                                        </dl>
                                    </div>
                                </div>
                            </div>
                        </div>
                    </div>

                    <!-- Remote IPFS publishing is not a placement: nothing here
                         catalogs or signs a placement claim. Shows the most
                         recent attempt only. -->
                    <div v-if="ipfsRemotePublicationCoordinator && publicationContentStore" class="evidence-section">
                        <div class="evidence-summary">
                            <span class="evidence-summary-title">IPFS Publishing</span>
                            <span class="form-hint form-hint--neutral">
                                Local Kubo can resolve and publish. A remote gateway can only resolve. Remote
                                pinning, configured below, can only publish.
                            </span>
                        </div>

                        <div class="evidence-anchor-card">
                            <div class="evidence-anchor-header">
                                <span class="evidence-anchor-type">Remote pinning</span>
                            </div>
                            <dl class="evidence-fields">
                                <div class="evidence-field"><dt>Endpoint</dt><dd>{{ ipfsRemotePublishingConfigurationView(entry).endpoint || 'not configured' }}</dd></div>
                                <div class="evidence-field"><dt>Credential</dt><dd>{{ ipfsRemotePublishingConfigurationView(entry).hasCredential ? 'configured' : 'not configured' }}</dd></div>
                            </dl>

                            <div class="identity-mgmt-actions">
                                <button type="button" class="action-btn action-btn--secondary"
                                        @click="toggleIpfsRemotePublishingConfigureForm(entry)">
                                    {{ entry.ipfsRemotePublishingConfigureFormOpen ? 'Cancel' : (ipfsRemotePublishingConfigurationView(entry).configured ? 'Reconfigure Remote Publishing' : 'Configure Remote Publishing') }}
                                </button>
                                <button v-if="ipfsRemotePublishingConfigurationView(entry).configured" type="button" class="action-btn action-btn--secondary"
                                        @click="clearIpfsRemotePublishingConfiguration(entry)">
                                    Clear Configuration
                                </button>
                            </div>

                            <!-- Draft fields, kept in memory only until "Save
                                 Configuration". -->
                            <div v-if="entry.ipfsRemotePublishingConfigureFormOpen" class="evidence-inspection-adapter">
                                <label class="form-field">
                                    <span class="form-label">Endpoint</span>
                                    <input type="text" class="form-input" v-model="entry.ipfsRemotePublishingDraft.endpoint"
                                           placeholder="https://your-pinning-service.example/api/pin" />
                                </label>
                                <label class="form-field">
                                    <span class="form-label">Credential (optional)</span>
                                    <input type="password" class="form-input" v-model="entry.ipfsRemotePublishingDraft.credential"
                                           placeholder="Bearer token" />
                                </label>
                                <label class="form-field">
                                    <span class="form-label">Request field (optional)</span>
                                    <input type="text" class="form-input" v-model="entry.ipfsRemotePublishingDraft.requestField" placeholder="file" />
                                </label>
                                <label class="form-field">
                                    <span class="form-label">Response field (optional)</span>
                                    <input type="text" class="form-input" v-model="entry.ipfsRemotePublishingDraft.responseField" placeholder="cid" />
                                </label>
                                <p class="form-hint form-hint--neutral">
                                    Nothing here is saved anywhere. This configuration lives only in this page's
                                    own memory for this browsing session, and is discarded the moment the page
                                    reloads or "Clear Configuration" is clicked.
                                </p>
                                <button type="button" class="action-btn action-btn--primary" @click="saveIpfsRemotePublishingConfiguration(entry)">
                                    Save Configuration
                                </button>
                            </div>

                            <div v-if="ipfsRemotePublishingConfigurationView(entry).configured" class="identity-mgmt-actions">
                                <button type="button" class="action-btn action-btn--primary"
                                        :disabled="isIpfsRemotePublishing(entry)"
                                        @click="publishToRemoteIpfs(entry)">
                                    {{ isIpfsRemotePublishing(entry) ? 'Publishing…' : (ipfsRemotePublicationView(entry).state === IpfsRemotePublicationState.IDLE ? 'Publish to Remote IPFS' : 'Publish Again') }}
                                </button>
                            </div>

                            <!-- PUBLISHED only means the provider accepted the
                                 bytes and returned this locator. -->
                            <div v-if="ipfsRemotePublicationView(entry).state !== IpfsRemotePublicationState.IDLE" class="evidence-inspection-adapter">
                                <span class="evidence-inspection-adapter-title">Remote IPFS</span>
                                <span class="peer-badge" :class="ipfsRemotePublicationBadgeClass(entry)">{{ ipfsRemotePublicationView(entry).stateLabel }}</span>
                                <p v-if="ipfsRemotePublicationView(entry).reason" class="form-hint form-hint--neutral">
                                    {{ ipfsRemotePublicationView(entry).reason }}
                                </p>

                                <template v-if="ipfsRemotePublicationView(entry).state === IpfsRemotePublicationState.PUBLISHED">
                                    <dl class="evidence-fields">
                                        <div class="evidence-field"><dt>Content hash</dt><dd>{{ ipfsRemotePublicationView(entry).contentHash }}</dd></div>
                                        <div class="evidence-field"><dt>IPFS locator</dt><dd>{{ ipfsRemotePublicationView(entry).locator }}</dd></div>
                                        <div class="evidence-field"><dt>Provider</dt><dd>{{ ipfsRemotePublicationView(entry).endpoint }}</dd></div>
                                        <div class="evidence-field"><dt>Published at</dt><dd>{{ formatWhen(ipfsRemotePublicationView(entry).publishedAt) }}</dd></div>
                                    </dl>
                                    <p class="form-hint form-hint--neutral">
                                        The configured provider accepted these bytes and returned this locator.
                                        This is an observation of what the provider just said, not a promise
                                        that it will still be retrievable later, and not a cataloged Snapshot
                                        Placement.
                                    </p>
                                    <!-- A missing announcement is not a failed
                                         publish; the content is on IPFS either
                                         way. -->
                                    <p v-if="entry.ipfsRemoteSnapshotAnnouncement" class="form-hint form-hint--neutral">
                                        <span class="peer-badge" :class="entry.ipfsRemoteSnapshotAnnouncement.announced ? 'peer-badge--authenticated' : 'peer-badge--failed'">
                                            {{ entry.ipfsRemoteSnapshotAnnouncement.announced ? 'Nostr: Announced' : 'Nostr: Not announced' }}
                                        </span>
                                        <template v-if="entry.ipfsRemoteSnapshotAnnouncement.error"> — {{ entry.ipfsRemoteSnapshotAnnouncement.error }}</template>
                                    </p>
                                </template>
                            </div>

                            <!-- Publishing is an action, verification an
                                 observation: PUBLISHED next to UNAVAILABLE or
                                 HASH_MISMATCH is shown as is. -->
                            <div v-if="ipfsPublicationContentVerificationCoordinator && entry.ipfsPublicationRecord" class="evidence-inspection-adapter">
                                <span class="evidence-inspection-adapter-title">Content retrieval</span>
                                <div class="identity-mgmt-actions">
                                    <button type="button" class="action-btn action-btn--primary"
                                            :disabled="isVerifyingIpfsPublicationContent(entry)"
                                            @click="verifyIpfsPublicationContent(entry)">
                                        {{ ipfsPublicationContentVerifyButtonLabel(entry) }}
                                    </button>
                                </div>
                                <template v-if="entry.ipfsPublicationContentVerification">
                                    <span class="peer-badge" :class="ipfsPublicationContentVerificationBadgeClass(entry)">
                                        {{ ipfsPublicationContentVerificationView(entry).stateLabel }}
                                    </span>
                                    <p v-if="ipfsPublicationContentVerificationView(entry).reason" class="form-hint form-hint--neutral">
                                        {{ ipfsPublicationContentVerificationView(entry).reason }}
                                    </p>
                                    <p v-if="ipfsPublicationContentVerificationView(entry).observedAt" class="form-hint form-hint--neutral">
                                        Observed {{ formatWhen(ipfsPublicationContentVerificationView(entry).observedAt) }}
                                    </p>
                                </template>
                            </div>

                            <!-- Every published record, append-only. -->
                            <div v-if="ipfsPublicationRecordHistoryView(entry).count > 0" class="identity-mgmt-actions">
                                <button type="button" class="action-btn action-btn--secondary"
                                        @click="toggleIpfsPublicationRecordHistory(entry)">
                                    {{ entry.ipfsPublicationRecordHistoryExpanded ? 'Hide Publication History' : 'Show Publication History' }}
                                </button>
                            </div>
                            <div v-if="entry.ipfsPublicationRecordHistoryExpanded" class="evidence-inspection-adapter">
                                <span class="evidence-inspection-adapter-title">Publication History</span>
                                <ul class="replica-knowledge-claim-list">
                                    <li v-for="(item, index) in ipfsPublicationRecordHistoryView(entry).records" :key="index" class="replica-knowledge-claim">
                                        <button class="action-btn action-btn--secondary"
                                                @click="toggleIpfsPublicationRecordInspection(entry, index)">
                                            {{ formatWhen(item.publishedAt) }} — {{ item.locator }}
                                        </button>

                                        <dl v-if="isIpfsPublicationRecordInspectionExpanded(entry, index)" class="evidence-fields">
                                            <div class="evidence-field"><dt>Locator</dt><dd>{{ item.locator }}</dd></div>
                                            <div class="evidence-field"><dt>Content hash</dt><dd>{{ item.contentHash }}</dd></div>
                                            <div class="evidence-field"><dt>Published at</dt><dd>{{ formatWhen(item.publishedAt) }}</dd></div>
                                            <div v-if="item.publicationMethodLabel" class="evidence-field"><dt>Method</dt><dd>{{ item.publicationMethodLabel }}</dd></div>
                                        </dl>

                                        <!-- This record's own append-only
                                             verification history. -->
                                        <div v-if="ipfsPublicationContentVerificationCoordinator" class="evidence-inspection-adapter">
                                            <span class="evidence-inspection-adapter-title">Content retrieval</span>
                                            <span v-if="ipfsPublicationRecordVerificationHistoryView(entry, index).count > 0"
                                                  class="peer-badge" :class="ipfsPublicationRecordVerificationBadgeClass(entry, index)">
                                                Latest: {{ latestIpfsPublicationRecordVerificationView(entry, index).stateLabel }}
                                            </span>

                                            <div class="identity-mgmt-actions">
                                                <button type="button" class="action-btn action-btn--primary"
                                                        :disabled="isVerifyingIpfsPublicationRecordHistoryEntry(entry, index)"
                                                        @click="verifyIpfsPublicationRecordHistoryEntry(entry, index)">
                                                    {{ ipfsPublicationRecordVerifyButtonLabel(entry, index) }}
                                                </button>
                                            </div>

                                            <!-- Opening this only reads memory;
                                                 it never verifies. -->
                                            <div v-if="ipfsPublicationRecordVerificationHistoryView(entry, index).count > 0" class="identity-mgmt-actions">
                                                <button type="button" class="action-btn action-btn--secondary"
                                                        @click="toggleIpfsPublicationRecordVerificationHistory(entry, index)">
                                                    {{ isIpfsPublicationRecordVerificationHistoryExpanded(entry, index) ? 'Hide Verification History' : 'Show Verification History' }}
                                                </button>
                                            </div>
                                            <div v-if="isIpfsPublicationRecordVerificationHistoryExpanded(entry, index)">
                                                <p class="form-hint form-hint--neutral">
                                                    These are observations made at different times. A
                                                    later observation never rewrites or replaces an
                                                    earlier one.
                                                </p>
                                                <ul class="replica-knowledge-claim-list">
                                                    <li v-for="(verification, vIndex) in ipfsPublicationRecordVerificationHistoryView(entry, index).verifications"
                                                        :key="vIndex" class="replica-knowledge-claim">
                                                        <span class="peer-badge" :class="ipfsPublicationVerificationEntryBadgeClass(verification)">
                                                            {{ formatWhen(verification.observedAt) }} — {{ verification.stateLabel }}
                                                        </span>
                                                        <p v-if="verification.reason" class="form-hint form-hint--neutral">
                                                            {{ verification.reason }}
                                                        </p>
                                                    </li>
                                                </ul>
                                            </div>
                                        </div>
                                    </li>
                                </ul>
                            </div>

                            <!-- Chronological read of the publication and
                                 verification histories; no network access. -->
                            <div v-if="ipfsPublicationObservationTimelineView(entry).count > 0" class="identity-mgmt-actions">
                                <button type="button" class="action-btn action-btn--secondary"
                                        @click="toggleIpfsPublicationObservationTimeline(entry)">
                                    {{ entry.ipfsPublicationObservationTimelineExpanded ? 'Hide Timeline' : 'Show Timeline' }}
                                </button>
                            </div>
                            <div v-if="entry.ipfsPublicationObservationTimelineExpanded" class="evidence-inspection-adapter">
                                <span class="evidence-inspection-adapter-title">Observation Timeline</span>
                                <p class="form-hint form-hint--neutral">
                                    Every publication and every content-retrieval observation for
                                    this entry, in true chronological order — never a running
                                    status, and never evidence that one publication record is
                                    preferable to another.
                                </p>
                                <ul class="replica-knowledge-claim-list">
                                    <li v-for="(item, tIndex) in ipfsPublicationObservationTimelineView(entry).entries"
                                        :key="tIndex" class="replica-knowledge-claim">
                                        <span class="peer-badge" :class="ipfsPublicationObservationTimelineEntryBadgeClass(item)">
                                            {{ formatWhen(item.observedAt) }} — {{ item.kind === IpfsPublicationObservationTimelineEntryKind.PUBLICATION ? 'Published' : item.stateLabel }}
                                        </span>
                                        <p class="form-hint form-hint--neutral">{{ item.label }} — {{ item.locator }}</p>
                                        <p v-if="item.kind === IpfsPublicationObservationTimelineEntryKind.CONTENT_VERIFICATION && item.reason" class="form-hint form-hint--neutral">
                                            {{ item.reason }}
                                        </p>
                                    </li>
                                </ul>
                            </div>
                        </div>
                    </div>
                    </div>

                    <div v-show="entry.detailsTab === 'history'">
                    <!-- Both domains on one timeline; no combined status. No
                         network access. -->
                    <div v-if="crossDomainPublicationObservationTimelineView(entry).count > 0" class="evidence-section">
                        <div class="evidence-summary">
                            <span class="evidence-summary-title">Cross-Domain Observation Timeline</span>
                            <span class="form-hint form-hint--neutral">
                                Every IPFS and Bitcoin observation for this publication, in one true
                                chronological order. Each entry keeps its own domain's own vocabulary —
                                this is never a combined status, and an IPFS fact is never presented as
                                evidence about a Bitcoin fact, or the other way around.
                            </span>
                        </div>
                        <div class="identity-mgmt-actions">
                            <button type="button" class="action-btn action-btn--secondary"
                                    @click="toggleCrossDomainPublicationObservationTimeline(entry)">
                                {{ entry.crossDomainPublicationObservationTimelineExpanded ? 'Hide Cross-Domain Timeline' : 'Show Cross-Domain Timeline' }}
                            </button>
                        </div>
                        <div v-if="entry.crossDomainPublicationObservationTimelineExpanded" class="evidence-inspection-adapter">
                            <span class="evidence-inspection-adapter-title">Cross-Domain Observation Timeline</span>
                            <ul class="replica-knowledge-claim-list">
                                <li v-for="(item, cdIndex) in crossDomainPublicationObservationTimelineView(entry).entries"
                                    :key="cdIndex" class="replica-knowledge-claim">
                                    <span class="peer-badge" :class="crossDomainPublicationObservationTimelineEntryBadgeClass(item)">
                                        {{ formatWhen(item.observedAt) }} — {{ crossDomainPublicationObservationTimelineEntryDomainLabel(item) }} —
                                        {{ item.kind === PublicationObservationTimelineEntryKind.IPFS_PUBLICATION ? 'Published' : item.stateLabel }}
                                    </span>
                                    <p class="form-hint form-hint--neutral">
                                        {{ item.label }}
                                        <template v-if="item.domain === PublicationObservationTimelineDomain.IPFS"> — {{ item.locator }}</template>
                                        <template v-else-if="item.txid"> — txid {{ item.txid }}</template>
                                    </p>
                                    <p v-if="item.kind === PublicationObservationTimelineEntryKind.BITCOIN_CONFIRMATION && item.blockHeight != null" class="form-hint form-hint--neutral">
                                        Block height {{ item.blockHeight }}
                                    </p>
                                    <p v-if="item.reason" class="form-hint form-hint--neutral">{{ item.reason }}</p>
                                </li>
                            </ul>
                        </div>
                    </div>
                    </div>

                    </details>
                </div>
            </div>
        </section>
    `
};
