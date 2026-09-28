import { reactive, ref, computed, nextTick, onMounted, onBeforeUnmount, inject } from 'vue';
import { PeerLifecycleState } from '../../peer/PeerLifecycleState.js';
import { resolveSavedProviderDefault } from '../../application/settings/SavedProviderDefaultChoice.js';
import { PublicationResolutionOutcome } from '../../application/publication/PublicationResolutionOutcome.js';
import { resolvePublicationView, describePublicationOutcome, describeRetrieval } from '../../application/publication/PublicationResolutionView.js';
import { Publication } from '../../publisher/Publication.js';
import PublicationShareLink from '../components/PublicationShareLink.js';
import { publicationEvidenceView, describeKnownEvidenceCount } from '../../application/publication/evidence/PublicationEvidenceView.js';
import { derivePublicationEvidenceConvergence } from '../../application/publication/evidence/PublicationEvidenceConvergence.js';
import { publicationEvidenceConvergenceView } from '../../application/publication/evidence/PublicationEvidenceConvergenceView.js';
import { describeKnownPlacementCount } from '../../application/snapshot/placement/SnapshotPlacementView.js';
import { IpfsRemotePublicationState } from '../../application/ipfs/IpfsRemotePublicationState.js';
import {
    IpfsPublicationObservationTimelineEntryKind
} from '../../application/ipfs/IpfsPublicationObservationTimelineView.js';
import { describePublicationDecentralization, describeDecentralizationRelationshipContrast } from '../../application/publication/PublicationDecentralizationView.js';
import { describePublicationReplicaKnowledge } from '../../application/publication/replica/PublicationReplicaKnowledgeView.js';
import { describePublicationReplicaKnowledgeDetail, describeAcquisitionBreakdown } from '../../application/publication/replica/PublicationReplicaKnowledgeDetailView.js';
import { describeSnapshotStateInspection } from '../../application/snapshot/SnapshotStateInspectionView.js';
import { SnapshotPlacementRelationship } from '../../application/snapshot/placement/SnapshotPlacementRelationship.js';
import { BitcoinAnchorTransactionConstructionState } from '../../application/anchoring/bitcoin/BitcoinAnchorTransactionConstructionState.js';
import { BitcoinAnchorReviewedSigningState } from '../../application/anchoring/bitcoin/BitcoinAnchorReviewedSigningState.js';
import { BitcoinAnchorSignedPsbtFinalizationState } from '../../application/anchoring/bitcoin/BitcoinAnchorSignedPsbtFinalizationState.js';
import { BitcoinAnchorBroadcastState } from '../../application/anchoring/bitcoin/BitcoinAnchorBroadcastState.js';
import {
    PublicationObservationTimelineDomain, PublicationObservationTimelineEntryKind
} from '../../application/publication/observationArchive/PublicationObservationTimelineView.js';
import {
    PublicationObservationArchiveFingerprintComparisonResult
} from '../../application/publication/observationArchive/PublicationObservationArchiveFingerprintComparison.js';
import { LocalStoragePublicationObservationArchive } from '../../storage/LocalStoragePublicationObservationArchive.js';
// Publisher achievement profile/badges/statistics live on
// ui/views/LeaderboardHubView.js; this page keeps only the
// publisher-association lookups below.
import { PublicationObservationArchiveImportOutcome } from '../../application/publication/observationArchive/PublicationObservationArchiveExport.js';
import {
    PublicationObservationArchiveInspectionOutcome
} from '../../application/publication/observationArchive/PublicationObservationArchiveInspection.js';
import { BaseNetworkObservationState } from '../../application/anchoring/base/BaseNetworkObservationState.js';
import { BasePublicationTransactionPlanState } from '../../application/anchoring/base/BasePublicationTransactionPlanState.js';
import { BaseReviewedSigningState } from '../../application/anchoring/base/BaseReviewedSigningState.js';
import { BaseSignedTransactionFinalizationState } from '../../application/anchoring/base/BaseSignedTransactionFinalizationState.js';
import { BaseTransactionBroadcastState } from '../../application/anchoring/base/BaseTransactionBroadcastState.js';
import { BaseTransactionInclusionObservationState } from '../../application/anchoring/base/BaseTransactionInclusionObservationState.js';
import { sortOptionsByLabel } from '../../utils/sortOptionsByLabel.js';
import { isLegacyContentHash } from '../../serializer/contentHash.js';
import { RoleProviderRole } from '../../core/RoleProviderRole.js';
import {
    humanizeContentKind, humanizeStorageType, humanizeAnchorType, shortId, shortHash, OUTCOME_BADGE_CLASSES, republishAdviceFor,
    preferredDistributionChoice, WALLET_GUIDED_ANCHOR_TYPES,
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
// Large template sections live in ./decentralizedPublications/templates/ as
// strings interpolated into `template`; they share this component's scope.
import { anchoringToolsTabTemplate } from './decentralizedPublications/templates/anchoringToolsTab.js';
import { useBatchAnchoring } from './decentralizedPublications/useBatchAnchoring.js';
import { archiveToolsTabTemplate } from './decentralizedPublications/templates/archiveToolsTab.js';
import { connectionsToolsTabTemplate } from './decentralizedPublications/templates/connectionsToolsTab.js';
import { distributionSectionTemplate } from './decentralizedPublications/templates/distributionSection.js';
import { snapshotTabTemplate } from './decentralizedPublications/templates/snapshotTab.js';
import { evidenceTabTemplate } from './decentralizedPublications/templates/evidenceTab.js';
import { placementsTabTemplate } from './decentralizedPublications/templates/placementsTab.js';

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
    components: { PublicationShareLink },
    setup() {
        // Groups the page-level tool cards into three tabs. Presentation only:
        // panels use v-show, so no card state changes.
        const publicationsToolsTab = ref('anchoring');
        function setPublicationsToolsTab(tab) {
            publicationsToolsTab.value = tab;
        }
        // The tools panel sits at the bottom of the page. Opens it on `tab`
        // and scrolls to it; the panel's own state (wallets, funding) is kept
        // either way, since it only folds.
        const publicationsToolsOpen = ref(false);
        async function openPublicationsTools(tab) {
            setPublicationsToolsTab(tab);
            publicationsToolsOpen.value = true;
            await nextTick();
            const panel = typeof document !== 'undefined' ? document.getElementById('publications-tools') : null;
            if (panel && typeof panel.scrollIntoView === 'function') panel.scrollIntoView({ behavior: 'smooth', block: 'start' });
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
        // Only to tell which failed publications this device's identities
        // signed; without it none are marked as yours.
        const identityUseCase = inject('identityUseCase', null);
        // Finds which of this device's own Worlds an old entry shares, from
        // this device's own records; without it, such a card only says how
        // to publish again.
        const findOwnSharedPublicationUseCase = inject('findOwnSharedPublicationUseCase', null);
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
        const finalityObservers = inject('anchorFinalityObservers', null);
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

        // The person's saved Content and Proof/Anchoring providers, read once
        // (changing them means leaving for Settings, which remounts this
        // page). When one can be used here, a card's Distribution section
        // leads with a single button for it and folds the per-type cards;
        // otherwise it shows the cards and says why. Nothing is chosen for
        // the person: the button only ever uses their own saved choice.
        const roleProviderPreferenceStore = inject('roleProviderPreferenceStore', null);
        function savedProviderKey(role) {
            try {
                const preference = roleProviderPreferenceStore ? roleProviderPreferenceStore.get(role) : null;
                return preference ? preference.providerKey : null;
            } catch {
                return null;
            }
        }
        const contentPreference = preferredDistributionChoice(
            savedProviderKey(RoleProviderRole.CONTENT),
            preferredPlacementCreationCoordinator && typeof preferredPlacementCreationCoordinator.preferableStorageTypes === 'function'
                ? preferredPlacementCreationCoordinator.preferableStorageTypes() : []
        );
        const anchorPreference = preferredDistributionChoice(
            savedProviderKey(RoleProviderRole.PROOF_AND_ANCHORING),
            preferredAnchorCreationCoordinator ? availableAnchorTypes : [],
            { walletGuidedKeys: WALLET_GUIDED_ANCHOR_TYPES }
        );
        function preferenceHint(choice, noun, name) {
            if (choice.reason === 'unavailable') return `Your preferred ${noun}, ${name(choice.savedKey)}, can't be used with one click here; use the options below.`;
            if (choice.reason === 'wallet-guided') {
                return `Your preferred ${noun}, ${name(choice.savedKey)}, is anchored through its wallet steps in this card's Details → Decentralization & Evidence tab.`;
            }
            return `No preferred ${noun} is set. Choose one under Configure to get a single button here.`;
        }
        const contentPreferenceHint = preferenceHint(contentPreference, 'storage', humanizeStorageType);
        const anchorPreferenceHint = preferenceHint(anchorPreference, 'anchoring provider', humanizeAnchorType);

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
            await findOwnRecord(entry);
        }

        // For an entry that failed only because one of this device's
        // identities shared it under an old hash: which of its own Worlds it
        // is ({ publicationId, documentId, title }, from this device's own
        // record, never the entry's bytes), so the card can open it in the
        // Editor. Null when there is no such record. Looked up once.
        async function findOwnRecord(entry) {
            if (!findOwnSharedPublicationUseCase || entry.ownRecordLookedUp || !isOwnLegacyEntry(entry)) return;
            entry.ownRecordLookedUp = true;
            try {
                entry.ownRecord = await findOwnSharedPublicationUseCase.find(entry.publication);
            } catch {
                entry.ownRecord = null;
            }
        }
        function ownRecordEditorRoute(entry) {
            return { path: '/editor', query: { load: entry.ownRecord.documentId } };
        }

        // Rebuilds the entry list from the catalog (local and synchronous),
        // keeping existing entry state, then resolves only the new entries.
        // The did:key ids of the identities on this device, read again with
        // the list so one created meanwhile counts.
        const ownIdentityIds = ref(new Set());
        function loadOwnIdentityIds() {
            try {
                ownIdentityIds.value = new Set((identityUseCase ? identityUseCase.listIdentities() : []).map((identity) => identity.identityId));
            } catch {
                ownIdentityIds.value = new Set();
            }
        }

        async function refreshList() {
            loadOwnIdentityIds();
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
                // Whether a failed card is asking "Remove from this device?".
                confirmingRemoval: false,
                // See findOwnRecord().
                ownRecord: null,
                ownRecordLookedUp: false,
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
                // application/ipfs/IpfsRemotePublishingConfiguration.js); the draft
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
                    defaultAnnouncementDiscoveryProvider, ['nostr', 'arweave', 'steem'], 'nostr'
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
            preferredCreationButtonLabel, verificationNote, creationFinality, preferredCreationFinality,
            watchFinality, describeFinality
        } = useAnchorEvidence({
            anchorKnowledgeStore, creationCoordinator, evidenceCoordinator, evidenceDiscoveryCoordinator,
            evidenceViewRegistry, knowledgeSynchronizationCoordinator, loadEvidence, loadPlacements,
            preferredAnchorCreationCoordinator, recomputeConvergence, recomputeReplicaKnowledgeDetail,
            finalityObservers
        });

        const {
            batchAnchorTypes, batchAnchoring, batchSelectedIds, batchLimit, selectUnanchoredForBatch,
            clearBatchSelection, hasAnchorOfType, createBatchAnchors, batchCreationView, batchCreationBadgeClass,
            batchFinality, batchButtonLabel, batchButtonDisabled
        } = useBatchAnchoring({
            creationCoordinator, entries, loadEvidence, watchFinality, describeFinality,
            isAnchorable: (entry) => !failedCheck(entry)
        });

        const {
            publicationDistributionCommand, multiRelayNostrPublicationDistributionCommand,
            snapshotDistributionCommand, snapshotDistributionAvailableStorageTypesCommand,
            defaultAnnouncementDiscoveryProvider, defaultContentDistributionProvider,
            snapshotDistributionStorageTypes, snapshotDistributionStorageOptions,
            publicationDistributionLifecycleStore, distributeEntryPublication, distributeEntrySnapshot,
            distributePublicationForEntry, discoveryDistributionButtonLabel, distributeSnapshot,
            snapshotDistributionButtonLabel, discoveryObservationsView,
            discoveryDistributionConfigurationRoute, snapshotDistributionConfigurationRoute, steemUploadProgressText
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

        // Whether the last check found this publication unusable: anything but
        // Available or Content unavailable, including a kind this version
        // can't display. Such a card offers only Re-check: there are no bytes
        // it could distribute, and anchoring a hash that can't be checked
        // proves nothing. An entry not checked yet is not failed; one being
        // re-checked keeps its last result until the new one arrives.
        function failedCheck(entry) {
            if (!entry.view) return false;
            const outcome = entry.view.outcome;
            return outcome !== PublicationResolutionOutcome.RESOLVED
                && outcome !== PublicationResolutionOutcome.CONTENT_UNAVAILABLE;
        }

        // The page lists usable publications first and folds the failed ones
        // into one group, so a catalog full of old or broken records doesn't
        // bury the ones that work. Display order only.
        const usableEntries = computed(() => entries.filter((entry) => !failedCheck(entry)));
        // Failed only because one of this device's identities published it
        // before content hashes became SHA-256. The envelope signature is
        // checked before the content hash, so the publisher id is genuine.
        // Such a publication is never accepted: the content store also holds
        // bytes from peers, so its old hash still can't vouch for them. Its
        // card says how to publish it again instead.
        function isOwnLegacyEntry(entry) {
            const publisherId = entry.publication.publisherIdentity && entry.publication.publisherIdentity.id;
            return failedCheck(entry)
                && entry.view.outcome === PublicationResolutionOutcome.CONTENT_HASH_MISMATCH
                && isLegacyContentHash(entry.publication.contentReference.hash)
                && ownIdentityIds.value.has(publisherId);
        }
        // Yours first, since only you can fix them; otherwise catalog order.
        const failedEntries = computed(() => {
            const failed = entries.filter(failedCheck);
            return [...failed.filter(isOwnLegacyEntry), ...failed.filter((entry) => !isOwnLegacyEntry(entry))];
        });
        const ownLegacyCount = computed(() => failedEntries.value.filter(isOwnLegacyEntry).length);
        // How to publish an entry again, from its kind's display plugin.
        function ownLegacyRepublishAdvice(entry) {
            return republishAdviceFor(kindPlugins && kindPlugins[entry.publication.contentKind]);
        }
        const anyRetrievable = computed(() => entries.some(canRetrieve));

        // Forgets failed publications on this device only (see
        // LocalPublicationCatalog#remove()): nothing is un-published, and a
        // peer that still has one may announce it again. Only a failed entry
        // can be removed, and only after its confirm step.
        const confirmingRemoveAllFailed = ref(false);
        async function removeFailedEntry(entry) {
            if (!failedCheck(entry)) return;
            catalog.remove(entry.publication.id);
            await refreshList();
        }
        async function removeAllFailedEntries() {
            for (const entry of failedEntries.value) {
                catalog.remove(entry.publication.id);
            }
            confirmingRemoveAllFailed.value = false;
            await refreshList();
        }

        function preferredStoreButtonLabel(entry) {
            return preferredPlacementCreationView(entry).state === 'creating'
                ? 'Storing…' : `Store on ${humanizeStorageType(contentPreference.providerKey)}`;
        }
        function preferredAnchorButtonLabel(entry) {
            return preferredCreationView(entry).state === 'creating'
                ? 'Anchoring…' : `Anchor on ${humanizeAnchorType(anchorPreference.providerKey)}`;
        }

        // A name for the card and the batch-anchor picker, read from content
        // that passed its check: a Publication's title or a place name
        // claim's name. Null otherwise (not checked, unavailable, failed, or
        // a kind without one); callers fall back to the content kind. Long
        // names are shortened for display only.
        const TITLE_MAX_LENGTH = 80;
        function publicationTitle(entry) {
            const content = entry.view && entry.view.resolved ? entry.view.content : null;
            const name = content && (content.title || content.name);
            if (typeof name !== 'string' || !name.trim()) return null;
            const trimmed = name.trim();
            return trimmed.length > TITLE_MAX_LENGTH ? `${trimmed.slice(0, TITLE_MAX_LENGTH - 1)}…` : trimmed;
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
            publicationsToolsOpen, openPublicationsTools,
            entries, loading, retrievalPeers, retrievalPeerOptions, retrievalPeerLabel, availableAnchorTypes,
            humanizeContentKind, humanizeStorageType, humanizeAnchorType, shortId, shortHash, formatWhen, badgeClass, statusLabel, availabilityText,
            canRetrieve, retrieve, recheck, usableEntries, failedEntries, anyRetrievable,
            confirmingRemoveAllFailed, removeFailedEntry, removeAllFailedEntries, publicationTitle,
            isOwnLegacyEntry, ownLegacyCount, ownLegacyRepublishAdvice, ownRecordEditorRoute,
            contentPreference, anchorPreference, contentPreferenceHint, anchorPreferenceHint,
            preferredStoreButtonLabel, preferredAnchorButtonLabel,
            describeKnownEvidenceCount, toggleEvidence, verifyAnchor, evidenceBadgeClass, lifecycleNote,
            createAnchor, creationView, creationBadgeClass, creationButtonLabel, verificationNote, creationFinality,
            preferredCreationFinality, batchAnchorTypes, batchAnchoring, batchSelectedIds, batchLimit,
            selectUnanchoredForBatch, clearBatchSelection, hasAnchorOfType, createBatchAnchors, batchCreationView,
            batchCreationBadgeClass, batchFinality, batchButtonLabel, batchButtonDisabled,
            preferredAnchorCreationCoordinator, createPreferredAnchor, preferredCreationView, preferredCreationBadgeClass, preferredCreationButtonLabel,
            publicationDistributionCommand, multiRelayNostrPublicationDistributionCommand, snapshotDistributionCommand,
            distributePublicationForEntry, discoveryDistributionButtonLabel,
            distributeSnapshot, snapshotDistributionButtonLabel,
            discoveryObservationsView, discoveryDistributionConfigurationRoute, snapshotDistributionConfigurationRoute,
            steemUploadProgressText, toggleInspect, inspectionExpanded, inspectionDetail, inspectionTypeSpecific, inspectionKnowledge,
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
                Every signed publication this device has seen — its own, or one a connected
                <router-link to="/peers">peer</router-link> announced. Each status is checked fresh when the
                page opens: being listed never means the content is on this device. Wallets, archives
                and publisher tools are in
                <button type="button" class="inline-link-btn" @click="openPublicationsTools('anchoring')">Wallet, Archive &amp; Publisher Tools</button>
                at the bottom of the page.
            </p>
            <p v-if="retrievalPeers.length === 0 && anyRetrievable" class="form-hint form-hint--neutral">
                No peer is connected, so "Retrieve from Peers" can't fetch missing content. Connect to one
                from <router-link to="/peers">Peers</router-link>.
            </p>


            <p v-if="loading" class="locations-panel-empty">Checking cataloged publications…</p>
            <p v-else-if="entries.length === 0" class="locations-panel-empty">
                Nothing cataloged yet. Publish a signed attribution or naming claim, or connect to a peer who
                has one, and it will show up here.
            </p>

            <p v-else-if="usableEntries.length === 0" class="locations-panel-empty">
                None of the cataloged publications passed its check; they are listed below.
            </p>

            <div v-if="!loading && usableEntries.length > 0" class="identity-mgmt-list">
                <div v-for="entry in usableEntries" :key="entry.publication.id" class="identity-mgmt-card">
                    <div class="identity-mgmt-card-header">
                        <span class="identity-mgmt-name">{{ publicationTitle(entry) || humanizeContentKind(entry.publication.contentKind) }}</span>
                        <span class="peer-badge" :class="badgeClass(entry)">{{ statusLabel(entry) }}</span>
                    </div>
                    <p class="identity-mgmt-status">
                        <template v-if="publicationTitle(entry)">{{ humanizeContentKind(entry.publication.contentKind) }} · </template>Published by {{ shortId(entry.publication.publisherIdentity && entry.publication.publisherIdentity.id) }}
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

                    ${distributionSectionTemplate}

                    <!-- Per-publication details, collapsed by default. -->
                    <details class="identity-mgmt-card-details">
                        <summary class="identity-mgmt-card-details-summary">Details</summary>

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

                    ${snapshotTabTemplate}

                    ${evidenceTabTemplate}

                    ${placementsTabTemplate}

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

            <!-- Publications whose last check failed, folded into one group
                 with compact cards: nothing here can be distributed or
                 anchored, so only the status, its reason and Re-check are
                 shown. -->
            <details v-if="!loading && failedEntries.length > 0" class="publications-tools-panel"
                     :open="usableEntries.length === 0">
                <summary class="publications-tools-panel-summary">
                    {{ failedEntries.length }} publication{{ failedEntries.length === 1 ? '' : 's' }} that can't be used
                </summary>
                <p class="form-hint form-hint--neutral">
                    These failed their check, so they can't be opened, distributed or anchored. Each says why;
                    one published with an old content hash has to be published again by its author.
                    Removing one only forgets it on this device; a peer that still has it may announce it again.
                </p>
                <p v-if="ownLegacyCount > 0" class="form-hint form-hint--neutral">
                    <strong>{{ ownLegacyCount }} {{ ownLegacyCount === 1 ? 'is' : 'are' }} yours</strong>, published
                    before content hashes became SHA-256. Each card below says how to publish it again; once you
                    have, remove the old one.
                </p>
                <div class="identity-mgmt-actions">
                    <button v-if="!confirmingRemoveAllFailed" class="action-btn action-btn--secondary"
                            @click="confirmingRemoveAllFailed = true">
                        Remove All {{ failedEntries.length }} from This Device
                    </button>
                    <template v-else>
                        <span class="form-hint form-hint--neutral">Remove all {{ failedEntries.length }} from this device?</span>
                        <button class="action-btn action-btn--danger" @click="removeAllFailedEntries()">Remove All</button>
                        <button class="action-btn action-btn--secondary" @click="confirmingRemoveAllFailed = false">Cancel</button>
                    </template>
                </div>
                <div class="identity-mgmt-list">
                    <div v-for="entry in failedEntries" :key="entry.publication.id" class="identity-mgmt-card">
                        <div class="identity-mgmt-card-header">
                            <span class="identity-mgmt-name">{{ (entry.ownRecord && entry.ownRecord.title) || humanizeContentKind(entry.publication.contentKind) }}</span>
                            <span class="peer-badge" :class="badgeClass(entry)">{{ statusLabel(entry) }}</span>
                        </div>
                        <p class="identity-mgmt-status">
                            <template v-if="entry.ownRecord && entry.ownRecord.title">{{ humanizeContentKind(entry.publication.contentKind) }} · </template>Published by {{ shortId(entry.publication.publisherIdentity && entry.publication.publisherIdentity.id) }}
                            · received {{ formatWhen(entry.receivedAt) }}
                            · content {{ shortHash(entry.publication.contentReference.hash) }}
                        </p>
                        <!-- Found among this device's own Worlds: open that
                             World, publish it again, share the new copy. -->
                        <p v-if="isOwnLegacyEntry(entry) && entry.ownRecord" class="form-hint form-hint--neutral">
                            <span class="peer-badge peer-badge--pending">Yours</span>
                            You shared this World before content hashes became SHA-256, so nobody can check it.
                            Open it in the Editor and publish it again, then click Share with Peers under the new
                            copy in the Repository.
                        </p>
                        <p v-else-if="isOwnLegacyEntry(entry)" class="form-hint form-hint--neutral">
                            <span class="peer-badge peer-badge--pending">Yours</span>
                            You published this before content hashes became SHA-256, so nobody can check it.
                            {{ ownLegacyRepublishAdvice(entry).text }}
                        </p>
                        <p v-else-if="entry.view && entry.view.reason" class="form-hint form-hint--neutral">
                            {{ entry.view.reason }}
                        </p>
                        <div class="identity-mgmt-actions">
                            <router-link v-if="isOwnLegacyEntry(entry) && entry.ownRecord"
                                         :to="ownRecordEditorRoute(entry)" class="action-btn action-btn--primary">
                                Open in Editor
                            </router-link>
                            <router-link v-else-if="isOwnLegacyEntry(entry) && ownLegacyRepublishAdvice(entry).route"
                                         :to="ownLegacyRepublishAdvice(entry).route" class="action-btn action-btn--primary">
                                {{ ownLegacyRepublishAdvice(entry).routeLabel }}
                            </router-link>
                            <button class="action-btn action-btn--secondary" :disabled="entry.checking" @click="recheck(entry)">
                                {{ entry.checking ? 'Checking…' : 'Re-check' }}
                            </button>
                            <button v-if="!entry.confirmingRemoval" class="action-btn action-btn--secondary"
                                    @click="entry.confirmingRemoval = true">
                                Remove from This Device
                            </button>
                            <template v-else>
                                <span class="form-hint form-hint--neutral">Remove it from this device?</span>
                                <button class="action-btn action-btn--danger" @click="removeFailedEntry(entry)">Remove</button>
                                <button class="action-btn action-btn--secondary" @click="entry.confirmingRemoval = false">Cancel</button>
                            </template>
                        </div>
                    </div>
                </div>
            </details>

            <!-- Page-level tools, at the bottom and collapsed so the
                 publications come first. openPublicationsTools() opens it on
                 a tab and scrolls to it, for the per-publication steps that
                 need a wallet observed here first. -->
            <details id="publications-tools" class="publications-tools-panel" :open="publicationsToolsOpen"
                     @toggle="publicationsToolsOpen = $event.target.open">
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

            ${anchoringToolsTabTemplate}

            ${archiveToolsTabTemplate}

            ${connectionsToolsTabTemplate}

            </details>
        </section>
    `
};
