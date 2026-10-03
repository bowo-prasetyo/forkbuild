import { ref, computed, onMounted, onBeforeUnmount, inject } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import { CreateBrickRegistryUseCase } from '../../application/editor/CreateBrickRegistryUseCase.js';
import { CreateWorldViewUseCase } from '../../application/world/CreateWorldViewUseCase.js';
import { CreateDiscoveryUseCase } from '../../application/discovery/CreateDiscoveryUseCase.js';
import { WorldSpatialContextService } from '../../application/world/WorldSpatialContextService.js';
import { AutomaticSnapshotEncounterCascade } from '../../application/snapshot/AutomaticSnapshotEncounterCascade.js';
import { AutomaticSnapshotEncounterRetentionReconciliation } from '../../application/snapshot/AutomaticSnapshotEncounterRetentionReconciliation.js';
import { SnapshotWorldRegistrationOutcome } from '../../application/snapshot/placement/SnapshotWorldRegistrationOutcome.js';
import { ObserverLocalEncounterStore } from '../../application/worldEncounter/ObserverLocalEncounterStore.js';
import { selectNearbySnapshotCandidates } from '../../application/snapshot/NearbySnapshotCandidates.js';
import { limitConcurrency } from '../../utils/limitConcurrency.js';
import ActionFeedback from '../components/ActionFeedback.js';
import DocumentInfoPanel from '../components/DocumentInfoPanel.js';
import MetadataEditorDialog from '../components/MetadataEditorDialog.js';
import PlacementInfoPanel from '../components/PlacementInfoPanel.js';
import PlacementEditorDialog from '../components/PlacementEditorDialog.js';
import WorldSearchPanel from '../components/WorldSearchPanel.js';
import LocationDocumentsDialog from '../components/LocationDocumentsDialog.js';
import WorldLocationBrowser from '../components/WorldLocationBrowser.js';
import AvatarInfoPanel from '../components/AvatarInfoPanel.js';
import NearbyAvatarsPanel from '../components/NearbyAvatarsPanel.js';
import CompassIndicator from '../components/CompassIndicator.js';
import SoundControl from '../components/SoundControl.js';
import LocationsPanel from '../components/LocationsPanel.js';
import LandmarkFormModal from '../components/LandmarkFormModal.js';
import RegionFormModal from '../components/RegionFormModal.js';
import WorldMembersPanel from '../components/WorldMembersPanel.js';
import PublicLobbyPanel from '../components/PublicLobbyPanel.js';
import { worldLobby } from '../../core/LobbyCard.js';
import WorldPresenceIndicator from '../components/WorldPresenceIndicator.js';
import WorldCollaboratorIndicator from '../components/WorldCollaboratorIndicator.js';
import { buildWorldCollaborationRoster } from '../components/WorldCollaborationRoster.js';
import WorldWelcomePanel from '../components/WorldWelcomePanel.js';
import WorldMapPanel from '../components/WorldMapPanel.js';
import PlaceNamingPanel from '../components/PlaceNamingPanel.js';
import GeographicPlaceDirectoryPanel from '../components/GeographicPlaceDirectoryPanel.js';
import GeographicPlacePanel from '../components/GeographicPlacePanel.js';
import CollapsibleSection from '../components/CollapsibleSection.js';
import WorldFocusPanel from '../components/WorldFocusPanel.js';
import WorldEncounterCanvas from '../components/WorldEncounterCanvas.js';
import OwnPublicationPanel from '../components/OwnPublicationPanel.js';
import VehicleInteractionPrompt from '../components/VehicleInteractionPrompt.js';
import AnimalInteractionPrompt from '../components/AnimalInteractionPrompt.js';
import ResidentInteractionPrompt from '../components/ResidentInteractionPrompt.js';
import ResidentSpeechActions from '../components/ResidentSpeechActions.js';
import { residentRefusalLabel } from '../components/avatarInteractionLabels.js';
import HistoryTimelinePanel from '../components/HistoryTimelinePanel.js';
import TouchMovementPad from '../components/TouchMovementPad.js';
import BreathMeter from '../components/BreathMeter.js';
import { useMediaQuery, COMPACT_LAYOUT_QUERY, TOUCH_INPUT_QUERY } from '../composables/useMediaQuery.js';
import { CameraPerspective } from '../../core/CameraPerspective.js';
import { WorldViewNavigationState, WorldViewPrimaryMode } from '../../application/world/WorldViewNavigationState.js';
import { PlaceNamingDiscoveryMonitor } from '../../application/placeNaming/PlaceNamingDiscoveryMonitor.js';
import { executeDiscoverPlaceNamingClaimsCommand } from '../../application/placeNaming/DiscoverPlaceNamingClaimsCommand.js';
import { derivePlaceNamingDiscoveryTag } from '../../core/PlaceNamingDiscoveryEnvelope.js';
import { usePlaceNamingPanel } from './worldView/usePlaceNamingPanel.js';
import { useWorldHistoryPanel } from './worldView/useWorldHistoryPanel.js';
import { useLandmarkAndRegionForms } from './worldView/useLandmarkAndRegionForms.js';
import { useLocationBrowser } from './worldView/useLocationBrowser.js';
import { useAvatarControls } from './worldView/useAvatarControls.js';
import { useWelcomePanel } from './worldView/useWelcomePanel.js';
import { usePlacesAndFocus } from './worldView/usePlacesAndFocus.js';
import { useNearbySections } from './worldView/useNearbySections.js';
import { useWorldMembersPanel } from './worldView/useWorldMembersPanel.js';
import { useWorldEncounterCommands } from './worldView/useWorldEncounterCommands.js';
import { useOwnPublicationActions } from './worldView/useOwnPublicationActions.js';
import { useClaimedBuilds } from './worldView/useClaimedBuilds.js';
import { useViewportInput } from './worldView/useViewportInput.js';
import { useHomeAndLocations } from './worldView/useHomeAndLocations.js';
import { useEditorHandoff } from './worldView/useEditorHandoff.js';
import { useDocumentActions } from './worldView/useDocumentActions.js';
import { useWorldPresenceSync } from './worldView/useWorldPresenceSync.js';
import { useWorldSoundscape } from './worldView/useWorldSoundscape.js';
// Large template sections live in ./worldView/templates/ as strings
// interpolated into `template`; they share this component's scope.
import { nearbySectionTemplate } from './worldView/templates/nearbySection.js';
import { avatarSectionTemplate } from './worldView/templates/avatarSection.js';
import { inspectionPanelsTemplate } from './worldView/templates/inspectionPanels.js';
import { dialogsTemplate } from './worldView/templates/dialogs.js';
import { headerSectionTemplate } from './worldView/templates/headerSection.js';
import { worldListsSectionTemplate } from './worldView/templates/worldListsSection.js';
import { navigationHudSectionTemplate } from './worldView/templates/navigationHudSection.js';
import { publicationSectionTemplate } from './worldView/templates/publicationSection.js';
import { hoverCardTemplate } from './worldView/templates/hoverCard.js';
import { displayText, errorText, t } from '../i18n/i18n.js';
import { compassText, spatialContextDescription } from '../i18n/worldText.js';

// Snapshot fetches the automatic cascade runs at once.
const AUTOMATIC_SNAPSHOT_FETCH_CONCURRENCY = 4;

// World View observes and navigates; brick editing lives in the Editor (see
// docs/Principles.md, "World View Observes and Navigates; Editor Mutates and
// Builds"). What remains mutation-shaped is document- and World-level: Save,
// Publish, metadata, placement moves, landmarks/regions/place names, and
// Undo/Redo over those.
export default {
    name: 'WorldView',
    components: {
        ActionFeedback,
        DocumentInfoPanel, MetadataEditorDialog,
        PlacementInfoPanel, PlacementEditorDialog,
        WorldSearchPanel, LocationDocumentsDialog, WorldLocationBrowser,
        AvatarInfoPanel, NearbyAvatarsPanel,
        CompassIndicator, LocationsPanel, LandmarkFormModal, RegionFormModal,
        WorldMembersPanel, WorldPresenceIndicator, WorldCollaboratorIndicator, PublicLobbyPanel,
        WorldWelcomePanel, WorldMapPanel, PlaceNamingPanel,
        GeographicPlaceDirectoryPanel, GeographicPlacePanel, CollapsibleSection,
        WorldFocusPanel, WorldEncounterCanvas, OwnPublicationPanel, VehicleInteractionPrompt, AnimalInteractionPrompt, ResidentInteractionPrompt, ResidentSpeechActions,
        HistoryTimelinePanel, TouchMovementPad, BreathMeter, SoundControl
    },
    setup() {
        const route = useRoute();
        const router = useRouter();
        const viewport = ref(null);
        const initialDocumentId = route.params.documentId;

        const title = ref(t('worldView.loading'));
        const author = ref(null);
        // Info for the ACTIVE document (drives the header badge), which can differ
        // from the inspected `documentInfo` below.
        const activeDocumentInfo = ref(null);
        // The camera's target, which can differ from the active document (see
        // docs/Principles.md, "Camera Focus, Active Document, and Selection Are Three
        // Different Things").
        const focusedDocumentTitle = ref(null);
        const loadedWorlds = ref([]);
        const nearbyWorlds = ref([]);
        const failedWorlds = ref([]);
        const spatialHover = ref(null);
        const spatialInspection = ref(null);
        const documentInfo = ref(null);
        const showMetadataEditor = ref(false);
        const metadataEditTarget = ref(null);
        // Where the active/inspected world sits in shared space. Unrelated to
        // `spatialPlacement` (brick placement preview): "placement" means different
        // things at the two layers.
        const placementInfo = ref(null);
        const activePlacementInfo = ref(null);
        // The active document's Publication, re-read every refresh; null when it was
        // never published. Never derived from World Encounters or the selection.
        const ownPublication = ref(null);
        const avatarInfo = ref(null);
        const followedRemoteAvatarId = ref(null);
        // Enriched with display names here: a presentation concern the session's
        // return value does not carry.
        const nearbyAvatars = ref([]);
        const showPlacementEditor = ref(false);
        const placementEditTarget = ref(null);
        // Set only when a move hits an occupied destination under a WARN policy.
        const placementOverlapWarning = ref(null);
        const cameraPosition = ref(null);
        // The location list is re-read each time the panel opens, never cached.
        const compassHeading = ref(null);
        const spatialContext = ref(null);
        // A reshape of spatialContext (never a second query), capped at 5 so the
        // compass never becomes a minimap.
        const compassMarkers = computed(() => {
            if (!spatialContext.value) return [];
            const structures = (spatialContext.value.nearbyStructures || []).map((s) => (
                { id: `structure:${s.id}`, direction: s.direction, kind: 'structure', label: s.title }
            ));
            const collaborators = (spatialContext.value.nearbyCollaborators || []).map((c) => (
                { id: `collaborator:${c.identityId}`, direction: c.direction, kind: 'collaborator', label: c.displayName }
            ));
            const landmarks = (spatialContext.value.nearbyLandmarks || []).map((l) => (
                { id: `landmark:${l.id}`, direction: l.direction, kind: 'landmark', label: l.title }
            ));
            // Nearby geographic places use their own, much larger radius; appended last so
            // the other markers keep priority under the cap.
            const places = (nearbyGeographicPlaces.value || []).map((p) => (
                { id: `place:${p.fingerprintKey}`, direction: p.direction, kind: 'place', label: p.displayName }
            ));
            return structures.concat(collaborators, landmarks, places).filter((m) => m.direction).slice(0, 5);
        });
        const showLocationsPanel = ref(false);
        const worldLocations = ref([]);
        // Mirrors session.canEditDocument(); gates the landmark affordances.
        const canEditActiveWorld = ref(false);
        // A plain non-reactive object, like `session`: call its methods, then mirror the
        // changes into refs.
        const worldViewNav = new WorldViewNavigationState();
        const primaryMode = ref(worldViewNav.primaryMode);
        // Raw facts for the ACTIVE document, re-read on each refresh and on live
        // membership/presence changes; joined into rows only by worldCollaborationRoster.
        const showMembersPanel = ref(false);
        // This World's public lobby (core/LobbyCard.js), following the
        // active document like the header does.
        const activeWorldLobby = ref(null);
        const showLobbyPanel = ref(false);
        function openLobbyPanel() { showLobbyPanel.value = true; }
        function closeLobbyPanel() { showLobbyPanel.value = false; }
        const worldMembers = ref([]);
        const worldPresenceRoster = ref([]);
        const isActiveWorldOwner = ref(false);
        const collaborationPendingIdentityId = ref(null);
        // One row per identity, refreshed on each live spatial-presence change (never
        // polled: it changes far more often than the refresh cadence).
        const spatialCollaboratorRows = ref([]);
        const feedbackMessage = ref('');
        const feedbackVisible = ref(false);

        const identityUseCase = inject('identityUseCase');
        const peerSessionManager = inject('peerSessionManager');
        const peerMessageBus = inject('peerMessageBus');
        const friendRelationshipUseCase = inject('friendRelationshipUseCase');
        const peerBlockUseCase = inject('peerBlockUseCase');
        const deviceAuthorizationUseCase = inject('deviceAuthorizationUseCase');
        // Display only (aliases), never for authorization.
        const peerRelationshipUseCase = inject('peerRelationshipUseCase');
        // Named to avoid clashing with the BrickRegistry `registry` below. This view
        // performs no discovery itself.
        const worldDiscoverySourceRegistry = inject('worldDiscoverySourceRegistry', null);
        const worldEncounterMaterialSources = inject('worldEncounterMaterialSources', null);
        const worldEncounterMaterialVerifier = inject('worldEncounterMaterialVerifier', null);
        const publicationDistributionLifecycleStore = inject('publicationDistributionLifecycleStore', null);
        const publicationDistributionCommand = inject('publicationDistributionCommand', null);
        const multiRelayNostrPublicationDistributionCommand = inject('multiRelayNostrPublicationDistributionCommand', null);
        const snapshotDistributionCommand = inject('snapshotDistributionCommand', null);
        const publicationContentStore = inject('publicationContentStore', null);
        // Called once: the registry is populated at startup.
        const snapshotDistributionAvailableStorageTypesCommand = inject('snapshotDistributionAvailableStorageTypes', null);
        // Seeds the pickers' initial choices only.
        const defaultAnnouncementDiscoveryProvider = inject('defaultAnnouncementDiscoveryProvider', 'nostr');
        const defaultContentDistributionProvider = inject('defaultContentDistributionProvider', null);
        const snapshotDistributionStorageTypes = snapshotDistributionAvailableStorageTypesCommand
            ? snapshotDistributionAvailableStorageTypesCommand()
            : [];
        // Remote Pinning needs no registration (it holds no credential), so it is never
        // in snapshotDistributionStorageTypes; the endpoint and credential are entered
        // per attempt.
        const ipfsRemotePublicationCoordinator = inject('ipfsRemotePublicationCoordinator', null);
        // Picks the Nostr or Arweave publisher for the Remote Pinning path, like
        // snapshotDistributionCommand does for the other paths.
        const resolveSnapshotDiscoveryPublisher = inject('resolveSnapshotDiscoveryPublisher', null);
        const discoverSnapshotCommand = inject('discoverSnapshotCommand', null);
        // Takes no publication, so it is passed straight to OwnPublicationPanel.
        const discoverSnapshotCandidatesCommand = inject('discoverSnapshotCandidatesCommand', null);
        const discoverSnapshotCandidatesWithOutcomeCommand = inject('discoverSnapshotCandidatesWithOutcomeCommand', null);
        const worldSnapshotDiscoveryMonitor = inject('worldSnapshotDiscoveryMonitor', null);
        // Only the transport half: the command and position resolver are composed here
        // because only this session holds the World layout.
        const placeNamingDiscoveryQueryService = inject('placeNamingDiscoveryQueryService', null);
        // Answer from the Announcement Index alone, so World View can show what
        // earlier searches found before the network answers (docs/AnnouncementIndex.md).
        const discoverIndexedSnapshotCandidatesCommand = inject('discoverIndexedSnapshotCandidatesCommand', null);
        const indexedPlaceNamingDiscoveryQueryService = inject('indexedPlaceNamingDiscoveryQueryService', null);
        const announcementIndexChanges = inject('announcementIndexChanges', null);
        const distributePlaceNamingClaimCommand = inject('distributePlaceNamingClaimCommand', null);
        const resolveSelectedSnapshotCommand = inject('resolveSelectedSnapshotCommand', null);
        const materializeSelectedSnapshotCommand = inject('materializeSelectedSnapshotCommand', null);
        const exportSnapshotCommand = inject('exportSnapshotCommand', null);
        const worldDiscoveryLeadRegistry = inject('worldDiscoveryLeadRegistry', null);
        const discoverWorldEncounterPublicationCommand = inject('discoverWorldEncounterPublicationCommand', null);
        // null keeps the Location panel hidden.
        const worldEncounterLeadAssociationsQuery = inject('worldEncounterLeadAssociationsQuery', null);
        // Only seeds the Discovery-tag field.
        const publicationDiscoveryTag = inject('publicationDiscoveryTag', '');
        // Also passed to CreateWorldViewUseCase so publication actions can reach
        // Repository-admitted Publications, without widening World Search.
        const decentralizedDiscoveryProviderForEnrichment = inject('decentralizedPublicationDiscoveryProvider', null);
        const worldEncounterPublicationAdmissionLog = inject('worldEncounterPublicationAdmissionLog', null);
        const registry = new CreateBrickRegistryUseCase().execute();
        const worldViewFactory = new CreateWorldViewUseCase().execute(identityUseCase.provider, {
            peerMessageBus,
            connectedPeerRegistry: peerSessionManager ? peerSessionManager.registry : null,
            friendRelationshipUseCase,
            peerBlockUseCase,
            deviceAuthorizationPropagationUseCase: deviceAuthorizationUseCase,
            decentralizedPublicationDiscoveryProvider: decentralizedDiscoveryProviderForEnrichment
        });
        const session = worldViewFactory.createSession(registry);
        // The automatic Snapshot cascade, scoped to this mount (a fresh idempotency map
        // per session). `automaticCascadeSessionActive` is set false first thing on
        // unmount; the cascade reads it through a closure so a long-running chain sees
        // the current value and stops.
        let automaticCascadeSessionActive = true;
        // Scoped to this mount: a fresh, empty store per session, never surviving a remount or
        // shared with any other Wanderer's own session (see ObserverLocalEncounterStore).
        const observerLocalEncounterStore = new ObserverLocalEncounterStore();
        // At most a few Snapshots are fetched at once; one still waiting when this
        // view closes is never fetched (a null resolution ends that run).
        const automaticResolveSelectedSnapshotCommand = resolveSelectedSnapshotCommand
            ? limitConcurrency((candidate) => (automaticCascadeSessionActive ? resolveSelectedSnapshotCommand(candidate) : null), AUTOMATIC_SNAPSHOT_FETCH_CONCURRENCY)
            : null;
        const automaticSnapshotEncounterCascade = new AutomaticSnapshotEncounterCascade({
            resolveSelectedSnapshotCommand: automaticResolveSelectedSnapshotCommand,
            materializeSelectedSnapshotCommand,
            worldDiscoverySourceRegistry,
            resolvePlacementInfo: (publicationId) => session.getPlacementInfoForPublication(publicationId),
            findPublicationById: (publicationId) => session.findPublicationById(publicationId),
            isSessionActive: () => automaticCascadeSessionActive,
            // The viewer's current position (never the candidate's claimed one); null
            // before the first refresh.
            resolveEncounterPosition: () => (spatialContext.value ? spatialContext.value.position : null)
        });
        // Scoped to this mount. Linked to the cascade only through refreshSpatialUI():
        // registrations feed noteAutomaticRegistration(), the position feeds
        // reconcile(), on the same tick.
        const automaticSnapshotEncounterRetentionReconciliation = new AutomaticSnapshotEncounterRetentionReconciliation({
            worldDiscoverySourceRegistry
        });
        // PlaceNamingDiscoveryMonitor decides which claims are nearby; this view only
        // presents its result. Scoped to this mount. The two closures exist because
        // only this session holds the World layout: which regions to query, and where a
        // claim's region sits. An unknown region resolves to null and is excluded,
        // never guessed.
        const placeNamingDiscoveryMonitor = placeNamingDiscoveryQueryService
            ? new PlaceNamingDiscoveryMonitor({
                discoverPlaceNamingClaimsCommand: () => {
                    const regions = session.getRegions();
                    return Promise.all(regions.map((region) => executeDiscoverPlaceNamingClaimsCommand({
                        discoveryTag: derivePlaceNamingDiscoveryTag(region.worldId, region.id),
                        discoveryQueryService: placeNamingDiscoveryQueryService
                    }))).then((perRegionResults) => perRegionResults.flat());
                },
                resolveClaimPosition: (envelope) => {
                    const region = session.getRegions().find((r) => r.worldId === envelope.worldId && r.id === envelope.regionId);
                    return region ? region.position : null;
                }
            })
            : null;
        // Set false first thing on unmount, so a late observe() never writes to a
        // torn-down view.
        let placeNamingDiscoveryPresentationActive = true;
        const spatialContextService = new WorldSpatialContextService(session);
        // A client rendering preference, never avatar state (docs/Principles.md,
        // "Avatar Visibility Is A Client Rendering Preference, Not Avatar State").
        const showMyAvatar = ref(true);
        const hasLocalAvatar = ref(false);
        // Mirrors the session's own state. Both default on: entering World View with an
        // avatar usually means walking around. The session applies them on mount.
        const avatarControlMode = ref(true);
        const followAvatar = ref(true);
        // Mirrors the session's state, polled on a short interval of its own: the
        // prompt must track proximity far more closely than the 3-second refresh.
        const vehicleInteractionState = ref(null);
        const storeInteractionState = ref(null);
        const animalInteractionState = ref(null);
        const decorationInteractionState = ref(null);
        // WorldNavigationSession#residentInteractionState(): polled whenever there
        // is an avatar, since the Avatar panel's Residents row shows without
        // Avatar Control Mode too.
        const residentInteractionState = ref(null);
        // The last thing a resident said (session.lastResidentSpeech()), for a
        // screen-reader announcement; the words themselves are drawn in a bubble
        // over the resident's head.
        const residentSpeech = ref(null);
        // Focus buttons for what that resident mentioned: shown while its words
        // are up (the same time its bubble stays) and the viewer is still
        // beside it; empty otherwise.
        const residentFocusTargets = ref([]);
        const cruiseState = ref(null);
        // The local avatar's swim mode and air, for the air meter and touch pad.
        const swimState = ref(null);
        // null means the free orbit camera.
        const cameraPerspective = ref(null);
        // Not gated on having an avatar (docs/Principles.md, "Watching Presence Never
        // Requires Having One").
        const showOtherAvatars = ref(true);
        // Trust diagnostics over the rendered remote avatars (docs/Principles.md,
        // "Rendering Presence And Trusting Presence Remain Separate"), refreshed with
        // everything else, never per frame.
        const remoteAvatarDiagnostics = ref({ total: 0, trusted: 0, stale: 0, conflicting: 0, unavailable: 0 });
        // Merges in decentralized publications only to enrich titles/authors of world
        // markers. World Search itself stays local-only (docs/Principles.md,
        // "Discovery Is One Path, Not Two").
        const { listPublicationsUseCase } = new CreateDiscoveryUseCase().execute({
            decentralizedDiscoveryProvider: decentralizedDiscoveryProviderForEnrichment
        });
        const allPublications = ref([]);

        let spatialInterval = null;
        let feedbackTimer = null;
        let spatialPresenceSyncInterval = null;
        let vehicleInteractionInterval = null;

        // ----------------------------- action surface -------------

        // `message` is text or a message descriptor (core/Message.js).
        const feedback = {
            show(message) {
                feedbackMessage.value = displayText(message);
                feedbackVisible.value = true;
                if (feedbackTimer) {
                    clearTimeout(feedbackTimer);
                }
                feedbackTimer = setTimeout(() => {
                    feedbackVisible.value = false;
                }, 2500);
            }
        };
        // Turns a rejected mutation (e.g. fork-on-edit refusing a fork-forbidden
        // snapshot) into a message instead of an uncaught exception, and after success
        // reports any fork that just happened, so the document id never changes
        // silently.
        function guarded(fn) {
            try {
                const result = fn();
                const notice = session.consumeForkNotice();
                if (notice) {
                    feedback.show(t('worldView.forkCreated', { title: notice.sourceTitle }));
                }
                return result;
            } catch (err) {
                feedback.show(errorText(err));
                return undefined;
            }
        }

        const {
            onSaveMetadata, openMetadataEditor, publishActiveDocument, saveActiveDocument
        } = useDocumentActions({
            activeDocumentInfo, feedback, guarded, metadataEditTarget, refreshSpatialUI, session, showMetadataEditor
        });

        const {
            showHistoryPanel, historyPanelDocumentId, historyTimeline, selectedHistoryEntryId,
            historyPreviewCursor, canUndo, canRedo, undoLabel, redoLabel, openHistoryPanel, closeHistoryPanel,
            selectHistoryEntry, _resolveSelectedHistoryCursor, previewSelectedHistoryEntry,
            cancelHistoryPreviewAction, restoreSelectedHistoryEntry, undoAction, redoAction
        } = useWorldHistoryPanel({
            activeDocumentInfo, feedback, guarded, refreshSpatialUI, session
        });

        const {
            distributeWorldEncounterPublication, distributeWorldEncounterSnapshot, discoverOwnSnapshot,
            exportOwnSnapshot
        } = useWorldEncounterCommands({
            discoverSnapshotCommand, exportSnapshotCommand, ipfsRemotePublicationCoordinator,
            multiRelayNostrPublicationDistributionCommand, publicationContentStore,
            publicationDistributionCommand, resolveSnapshotDiscoveryPublisher, session,
            snapshotDistributionCommand
        });

        // The discovery command's shape already matches WorldEncounterCanvas's prop, so
        // it is passed through unwrapped.

        const {
            openPlacementEditor, closePlacementEditor, onMovePlacement, removePlacementFromPanel,
            removePublicationPlacement, placementsRevision, unpublishOwnPublication, placeOwnPublication, getPublicationCommentariesCommand,
            addPublicationCommentaryCommand, getPublicationPlacementsCommand
        } = useOwnPublicationActions({
            distributePublicationCommentaryCommand: inject('distributePublicationCommentaryCommand', null), feedback, guarded, placementEditTarget, placementOverlapWarning, refreshSpatialUI,
            session, showPlacementEditor
        });

        const {
            claimedBuildRows, noteSnapshotCandidateResult, reconcileClaimedBuilds,
            navigateToClaimedBuild, verifyClaimedBuild, acceptClaimedBuild, dismissClaimedBuild, disposeClaimedBuilds
        } = useClaimedBuilds({
            session, publicationContentStore, feedback, guarded, refreshSpatialUI,
            verifyClaimedBuildPublicationCommand: inject('verifyClaimedBuildPublicationCommand', null),
            getViewerPosition: () => (spatialContext.value ? spatialContext.value.position : null)
        });

        // Notification History lives in the app's header (ui/App.js).
        // While this view is mounted, a notification's Explore focuses its World here
        // through focusWorld(), the one mechanism that changes the active document
        // inside a live World View; a bare route change would not.
        const notificationWorldNavigation = inject('notificationWorldNavigation', null);
        let unregisterNotificationWorldNavigation = null;
        onMounted(() => {
            if (notificationWorldNavigation) {
                unregisterNotificationWorldNavigation = notificationWorldNavigation.register(focusWorld);
            }
        });
        onBeforeUnmount(() => {
            if (unregisterNotificationWorldNavigation) {
                unregisterNotificationWorldNavigation();
            }
        });

        // -----------------------------------------------------------------
        // Spatial UI refresh
        // -----------------------------------------------------------------

        // Only Snapshots near the viewer are fetched (see NearbySnapshotCandidates);
        // one skipped now is offered again once the viewer comes near it.
        function handleDiscoveredSnapshotCandidates(candidates) {
            if (!Array.isArray(candidates)) {
                return;
            }
            selectNearbySnapshotCandidates(candidates, {
                viewerPosition: spatialContext.value ? spatialContext.value.position : null,
                placementPositionOf: (publicationId) => {
                    const placement = session.getPlacementInfoForPublication(publicationId);
                    return placement ? placement.position : null;
                }
            }).forEach((candidate) => automaticSnapshotEncounterCascade.processCandidate(candidate).then((result) => {
                // The only place a Snapshot becomes watched for retention; manual
                // registrations never pass through here.
                if (result && result.outcome === SnapshotWorldRegistrationOutcome.REGISTERED) {
                    automaticSnapshotEncounterRetentionReconciliation.noteAutomaticRegistration({
                        publicationId: result.publicationId,
                        contentHash: result.contentHash
                    });
                }
                // The only place an observer-local encounter is recorded; only UNPLACED runs
                // with a usable position carry one.
                if (result && result.encounter) {
                    observerLocalEncounterStore.record(result.encounter);
                }
                // An UNPLACED run with a claimed position becomes a ghost (useClaimedBuilds).
                noteSnapshotCandidateResult(candidate, result);
            }));
        }

        // Once per mount, on the first refresh with a position: show what the
        // Announcement Index already holds without waiting for the network. The
        // monitors' own network discovery still runs on this same tick, and its
        // result replaces this one when it arrives.
        let discoveryPrimedFromIndex = false;
        // `replace`: after a background sync, show everything the index now
        // holds rather than only filling an empty result.
        function primeDiscoveryFromIndex(context, { replace = false } = {}) {
            if (discoverIndexedSnapshotCandidatesCommand) {
                discoverIndexedSnapshotCandidatesCommand(context.position).then(handleDiscoveredSnapshotCandidates, () => {});
            }
            if (indexedPlaceNamingDiscoveryQueryService && placeNamingDiscoveryMonitor) {
                const regions = session.getRegions();
                Promise.all(regions.map((region) => indexedPlaceNamingDiscoveryQueryService.search(
                    derivePlaceNamingDiscoveryTag(region.worldId, region.id)
                ))).then((perRegion) => {
                    if (!placeNamingDiscoveryPresentationActive) {
                        return;
                    }
                    if (placeNamingDiscoveryMonitor.seed(context.position, perRegion.flat(), { replace })) {
                        nearbyPlaceNamingClaims.value = placeNamingDiscoveryMonitor.lastResult || [];
                    }
                }, () => {});
            }
        }

        // What a background sync or a peer adds to the index shows here without
        // waiting for the player to move.
        const unsubscribeAnnouncementIndexChanges = announcementIndexChanges
            ? announcementIndexChanges.onChanged(() => {
                if (discoveryPrimedFromIndex && spatialContext.value) {
                    primeDiscoveryFromIndex(spatialContext.value, { replace: true });
                }
            })
            : () => {};

        function refreshSpatialUI() {
            const state = session.getSpatialState();
            const docs = session.getLoadedDocuments();
            const pubMap = new Map(allPublications.value.map((p) => [p.documentId, p]));

            const worldRow = (id, doc = null) => {
                const pub = pubMap.get(id);
                return {
                    documentId: id,
                    title: doc?.metadata?.title || pub?.title || t('worldView.untitled'),
                    author: doc?.metadata?.author || pub?.author || t('worldLocationBrowser.anonymous')
                };
            };
            loadedWorlds.value = state.loaded.map((id) => worldRow(id, docs.find((d) => d.world.id === id)));
            const loadedSet = new Set(state.loaded);
            nearbyWorlds.value = state.nearby.filter((id) => !loadedSet.has(id)).map((id) => worldRow(id));
            failedWorlds.value = state.failed.map((id) => worldRow(id));

            cameraPosition.value = state.cameraPosition;
            compassHeading.value = session.getCompassHeading();
            
            spatialContext.value = spatialContextService.getCurrentContext();

            // Feeds the Snapshot discovery monitor on this same tick (no polling of its
            // own); the monitor ignores most calls until the viewer moves meaningfully.
            // Its last result is then handed, in order, to the automatic cascade.
            // Re-feeding an unchanged result is harmless: the cascade is idempotent per
            // publicationId:contentHash. Never awaited; a registration becomes visible
            // through the canvas's normal rendering.
            reconcileClaimedBuilds();

            if (spatialContext.value && !discoveryPrimedFromIndex) {
                discoveryPrimedFromIndex = true;
                primeDiscoveryFromIndex(spatialContext.value);
            }

            if (worldSnapshotDiscoveryMonitor && spatialContext.value) {
                worldSnapshotDiscoveryMonitor.observe(spatialContext.value).then(() => {
                    handleDiscoveredSnapshotCandidates(worldSnapshotDiscoveryMonitor.lastResult);
                });
            }

            // Place naming discovery on the same tick, given the raw {x,z} position. The
            // view copies the monitor's lastResult/lastError verbatim; a failed cycle
            // keeps the previous claims on screen and only changes the error. The active
            // flag stops a late callback from touching a torn-down view.
            if (placeNamingDiscoveryMonitor && spatialContext.value) {
                placeNamingDiscoveryMonitor.observe(spatialContext.value.position).then(() => {
                    if (!placeNamingDiscoveryPresentationActive) {
                        return;
                    }
                    nearbyPlaceNamingClaims.value = placeNamingDiscoveryMonitor.lastResult || [];
                    placeNamingDiscoveryError.value = placeNamingDiscoveryMonitor.lastError;
                });
            }

            // Reconciled every tick (not gated by the discovery threshold) against the
            // viewer's current position; a no-op when nothing is watched.
            automaticSnapshotEncounterRetentionReconciliation.reconcile(
                spatialContext.value ? spatialContext.value.position : null
            );

            // Kept current while the map is open; openMapPanel() re-reads it on open.
            if (showMapPanel.value) {
                refreshMapContent();
            }

            nearbyGeographicPlaces.value = session.getNearbyGeographicPlaces();

            remoteAvatarDiagnostics.value = session.getRemoteAvatarDiagnostics();

            const inspection = session.getSpatialInspection();
            if (inspection && !inspection.isEmpty) {
                spatialInspection.value = {
                    type: inspection.type,
                    // documentId is a top-level field of the inspection, not inside `data`;
                    // spreading only `data` dropped it and hid every button gated on it.
                    documentId: inspection.documentId,
                    ...inspection.data
                };
            } else {
                spatialInspection.value = null;
            }

            documentInfo.value = (spatialInspection.value && spatialInspection.value.documentId)
                ? session.getDocumentInfo(spatialInspection.value.documentId)
                : null;

            // The placement (WHERE) for the same world, kept separate from the document
            // info (WHAT); null when it has none.
            placementInfo.value = (spatialInspection.value && spatialInspection.value.documentId)
                ? session.getPlacementInfo(spatialInspection.value.documentId)
                : null;

            // Read from separate session state: an avatar target and a brick/ground
            // selection are mutually exclusive.
            avatarInfo.value = session.getAvatarInfo();
            followedRemoteAvatarId.value = session.getFollowedRemoteAvatarId();

            // A standing fact about the avatar's position, independent of selection.
            nearbyAvatars.value = session.getNearbyAvatars().map((entry) => ({
                ...entry,
                displayName: session.getAvatarDisplayName(entry.avatarId)
            }));

            // The header and route always follow the ACTIVE document, never a route param
            // frozen at mount; otherwise a fork would change where edits land without the
            // title or URL following.
            const activeId = session.getActiveDocumentId();
            const activeDoc = docs.find((d) => d.world.id === activeId);
            if (activeDoc) {
                title.value = activeDoc.metadata.title || t('worldView.untitled');
                author.value = activeDoc.metadata.author;
            } else if (!activeId) {
                // No active World (it streamed out): don't keep the last one's title.
                title.value = t('worldView.world2');
                author.value = null;
            }
            activeDocumentInfo.value = activeId ? session.getDocumentInfo(activeId) : null;
            activeWorldLobby.value = activeId ? worldLobby(activeId) : null;
            canUndo.value = session.canUndo();
            canRedo.value = session.canRedo();
            undoLabel.value = session.getUndoLabel();
            redoLabel.value = session.getRedoLabel();
            activePlacementInfo.value = activeId ? session.getPlacementInfo(activeId) : null;
            ownPublication.value = activeId ? session.getPublicationForDocument(activeId) : null;
            if (activeId && activeId !== route.params.documentId) {
                router.replace({ path: `/world/${activeId}` });
            }

            // A no-op unless the active document changed.
            _syncWorldPresence(activeId);
            // Runs before spatial presence so worldReturnInfo (and the saved camera) is
            // ready before the Welcome panel can open.
            _syncWorldExperience(activeId);
            _syncWorldSpatialPresence(activeId);
            isActiveWorldOwner.value = activeId ? session.isWorldOwner(activeId) : false;
            canEditActiveWorld.value = activeId ? session.canEditDocument(activeId) : false;

            // The camera's target, shown separately from the active document (docs/
            // Principles.md, "Camera Focus, Active Document, and Selection Are Three
            // Different Things"): two publications can share a coordinate.
            const focusedId = session.getFocusedDocumentId();
            if (!focusedId) {
                focusedDocumentTitle.value = null;
            } else {
                const focusedDoc = docs.find((d) => d.world.id === focusedId);
                const focusedPub = pubMap.get(focusedId);
                focusedDocumentTitle.value = focusedDoc?.metadata?.title || focusedPub?.title || t('worldView.untitled');
            }
        }

        const {
            showWelcomePanel, welcomeContext, welcomeIsArrival, worldReturnInfo, refreshWelcomeContext,
            welcomeIsReturning, openWelcomePanel, closeWelcomePanel, exploreWelcomeSuggestion
        } = useWelcomePanel({
            refreshSpatialUI, resolveIdentityDisplayName, session, syncPrimaryMode
        });

        const {
            _syncWorldExperience, _syncWorldPresence, _syncWorldSpatialPresence, disposeWorldPresence,
            refreshCollaborationRoster, syncCurrentWorldSpatialPresence
        } = useWorldPresenceSync({
            cameraPerspective, openWelcomePanel, refreshWelcomeContext, resolveIdentityDisplayName, session, showWelcomePanel,
            spatialCollaboratorRows, worldMembers, worldPresenceRoster, worldReturnInfo
        });

        // The one handler for every "go to this person" entry point. Only moves the
        // camera; sends nothing.
        function followCollaborator(deviceId) {
            session.focusCollaborator(deviceId);
            refreshSpatialUI();
        }

        // Presentation only: alias, then the caller's fallback label, then a short id.
        function resolveIdentityDisplayName(identityId, fallbackLabel = null) {
            if (!identityId) {
                return fallbackLabel || 'Unknown';
            }
            const relationship = peerRelationshipUseCase && typeof peerRelationshipUseCase.getRelationship === 'function'
                ? peerRelationshipUseCase.getRelationship(identityId)
                : null;
            if (relationship && relationship.alias) {
                return relationship.alias;
            }
            if (fallbackLabel) {
                return fallbackLabel;
            }
            return identityId.length > 14 ? '…' + identityId.slice(-12) : identityId;
        }

        const {
            openMembersPanel, closeMembersPanel, grantWorldMember, revokeWorldMember
        } = useWorldMembersPanel({
            activeDocumentInfo, collaborationPendingIdentityId, feedback, refreshCollaborationRoster, session,
            showMembersPanel
        });

        // The parent is a Publication, so its title is available from the publications
        // list even when not loaded.
        function parentTitle(parentDocumentId) {
            const pub = allPublications.value.find((p) => p.documentId === parentDocumentId);
            return pub ? (pub.title || t('worldView.untitled')) : null;
        }

        function refreshHoverUI() {
            const pubMap = new Map(allPublications.value.map((p) => [p.documentId, p]));
            const hover = session.getSpatialHover();
            if (hover && !hover.isEmpty) {
                const pub = pubMap.get(hover.documentId);
                spatialHover.value = {
                    type: hover.type,
                    documentId: hover.documentId,
                    buildingId: hover.buildingId,
                    brickId: hover.brickId,
                    position: hover.position,
                    worldTitle: pub?.title || t('worldView.untitled'),
                    worldAuthor: pub?.author || t('worldLocationBrowser.anonymous')
                };
            } else {
                spatialHover.value = null;
            }
        }

        function focusWorld(documentId) {
            session.focusDocument(documentId);
            router.replace({ path: `/world/${documentId}` });
            refreshSpatialUI();
        }

        function exploreEncounteredPublicationCommand(publication) {
            focusWorld(publication.documentId);
        }

        function focusSelection() {
            session.focusSelection();
            refreshSpatialUI();
        }

        const {
            closeLocationsPanel, focusLocation, goHome, openLocationsPanel, refreshLocationsPanel
        } = useHomeAndLocations({
            closePrimaryNavigationPanels, refreshSpatialUI, session, showLocationsPanel, syncPrimaryMode,
            worldLocations
        });

        // -----------------------------------------------------------------
        // Landmarks & Waypoints
        // -----------------------------------------------------------------

        const {
            showLandmarkForm, landmarkFormTarget, showRegionForm, regionFormTarget, openAddLandmarkForm,
            openEditLandmarkForm, closeLandmarkForm, onSaveLandmarkForm, removeLandmarkFromPanel,
            openAddRegionForm, openEditRegionForm, closeRegionForm, onSaveRegionForm, removeRegionFromPanel
        } = useLandmarkAndRegionForms({
            feedback, guarded, refreshLocationsPanel, refreshSpatialUI, session
        });

        const {
            showNamingPanel, namingPanelRegionId, namingPanelClaims, namingPanelView, namingPanelPreferredName,
            namingPanelGeographicRegions, namingPanelGeographicView, namingPanelDiscoveryProvider,
            namingPanelDistributionClaimId, namingPanelDistributionExecuting, namingPanelDistributionError,
            namingPanelDistributionResult, namingPanelDistributionOfferClaimId, myIdentityId,
            refreshNamingPanel, openNamingPanel, closeNamingPanel,
            publishNamingClaim, retractNamingClaim, setPreferredNamingName, clearPreferredNamingName,
            exportNamingClaim, importNamingClaim, distributeNamingClaim, dismissNamingClaimDistributionOffer
        } = usePlaceNamingPanel({
            defaultDiscoveryProvider: defaultAnnouncementDiscoveryProvider, distributePlaceNamingClaimCommand,
            feedback, guarded, session
        });

        // -----------------------------------------------------------------
        // Primary navigation: Explore / Map / Places
        // -----------------------------------------------------------------
        //
        // The three primary surfaces are mutually exclusive. Closing them never touches
        // the create forms, Save/Publish/metadata or Members: browsing and editing
        // never compete for the same space.
        function closePrimaryNavigationPanels() {
            showWelcomePanel.value = false;
            showLocationsPanel.value = false;
            showMapPanel.value = false;
            showGeographicPlaceDirectory.value = false;
            showGeographicPlacePanel.value = false;
            showFocusPanel.value = false;
            focusContext.value = null;
        }

        // Records `mode` without setPrimaryMode()'s open/close side effects.
        function syncPrimaryMode(mode) {
            worldViewNav.setPrimaryMode(mode);
            primaryMode.value = worldViewNav.primaryMode;
        }

        function setPrimaryMode(mode) {
            if (!worldViewNav.setPrimaryMode(mode)) {
                return;
            }
            primaryMode.value = worldViewNav.primaryMode;
            closePrimaryNavigationPanels();
            if (mode === WorldViewPrimaryMode.EXPLORE) {
                openWelcomePanel(false);
            } else if (mode === WorldViewPrimaryMode.MAP) {
                openMapPanel();
            } else if (mode === WorldViewPrimaryMode.PLACES) {
                const view = worldViewNav.currentPlacesView;
                if (view.screen === 'detail' && view.fingerprintKey) {
                    restoreGeographicPlaceDetail(view.fingerprintKey);
                } else {
                    openGeographicPlaceDirectory();
                }
            }
        }

        const {
            nearbyPlaceNamingClaims, placeNamingDiscoveryError, NEARBY_PLACES_SECTION,
            NEARBY_LANDMARKS_SECTION, NEARBY_PEOPLE_SECTION, WORLD_ENCOUNTERS_SECTION,
            NEARBY_PLACE_NAMING_SECTION, NEARBY_CLAIMED_BUILDS_SECTION, nearbySectionsCollapsed, setNearbySectionCollapsed,
            nearbyLandmarkRows, nearbyPeopleRows, formatNearbyPlaceNamingCreatedAt, nearbyPlaceNamingClaimRows,
            navigateToNearbyPlaceNamingClaim, adoptNearbyPlaceNamingClaim
        } = useNearbySections({
            feedback, guarded, refreshSpatialUI, resolveIdentityDisplayName, session, spatialCollaboratorRows,
            spatialContext, worldViewNav
        });

        const {
            showMapPanel, mapContent, showGeographicPlaceDirectory, geographicPlaces, showGeographicPlacePanel,
            geographicPlace, mapHighlightRegionKeys, nearbyGeographicPlaces, showFocusPanel, focusContext,
            openMapPanel, refreshMapContent, closeMapPanel, openFocusForLocation, openFocusForGeographicPlace,
            openFocusForCollaborator, closeFocusPanel, goFromFocusPanel, showFocusOnMap,
            openNamesFromFocusPanel, currentReturnWorld, editFocusedCopyFromFocusPanel,
            openGeographicPlaceDirectory, showGeographicPlaceDirectoryList, goToGeographicPlace,
            closeGeographicPlaceDirectory, openGeographicPlace, restoreGeographicPlaceDetail,
            closeGeographicPlacePanel, goBackInPlaces, openNamesFromPlace, showGeographicPlaceOnMap
        } = usePlacesAndFocus({
            closeWelcomePanel, feedback, focusedDocumentTitle, openNamingPanel, refreshLocationsPanel,
            refreshSpatialUI, resolveIdentityDisplayName, route, router, session, setPrimaryMode,
            showWelcomePanel, syncPrimaryMode, title, worldViewNav
        });

        const {
            editInspectedCopy, forkEncounteredPublicationCommand, openEncounteredPublicationCommand,
            openStructureSource
        } = useEditorHandoff({
            currentReturnWorld, router, session
        });

        // -----------------------------------------------------------------
        // Search & Spatial Discovery
        // -----------------------------------------------------------------

        // Search only resolves results. "Catalog empty" vs. "no match" comes from the
        // already-loaded publications list.
        const catalogEmpty = computed(() => allPublications.value.length === 0);

        // The one place members and presence are joined into rows; always derived
        // fresh.
        const worldCollaborationRoster = computed(() => {
            const ownerIdentityId = activeDocumentInfo.value ? activeDocumentInfo.value.authorIdentityId : null;
            const ownerLabel = activeDocumentInfo.value ? activeDocumentInfo.value.author : null;
            return buildWorldCollaborationRoster({
                ownerIdentityId,
                isViewerOwner: isActiveWorldOwner.value,
                members: worldMembers.value,
                presence: worldPresenceRoster.value
            }).map((row) => ({
                ...row,
                displayName: resolveIdentityDisplayName(row.identityId, row.identityId === ownerIdentityId ? ownerLabel : null)
            }));
        });

        // Other present participants plus the viewer, whenever a world is active.
        const worldOnlineCount = computed(() => worldPresenceRoster.value.length + (activeDocumentInfo.value ? 1 : 0));

        const {
            searchResults, showLocationDocuments, locationDocumentsPosition, locationDocumentsOccupants,
            showLocationBrowser, locationBrowserCenter, locationBrowserRadius, locationBrowserDocuments,
            locationBrowserDiagnostics, locationBrowserInspected, performSearch, openLocationDocuments,
            closeLocationDocuments, focusLocationDocument, openLocationBrowser, exploreHere, whatsHere,
            reExploreLocationBrowser, closeLocationBrowser, focusLocationBrowserResult,
            selectLocationBrowserResult, inspectLocationBrowserResult
        } = useLocationBrowser({
            cameraPosition, focusWorld, guarded, refreshSpatialUI, session
        });

        // -----------------------------------------------------------------
        // Lifecycle
        // -----------------------------------------------------------------

        // Checkboxes give focus back immediately, so a focused checkbox never swallows
        // the next WASD press as a text input would.
        function blurCheckbox(event) {
            if (event && event.target && typeof event.target.blur === 'function') {
                event.target.blur();
            }
        }

        const {
            toggleShowMyAvatar, toggleAvatarControlMode, toggleFollowAvatar, setCameraPerspective,
            followAvatarFromPanel, stopFollowingAvatarFromPanel, performAvatarInteraction, selectNearbyAvatar,
            toggleShowOtherAvatars, onAvatarKeyDown, onAvatarKeyUp, pressAvatarKey, releaseAvatarKey, onWindowBlur
        } = useAvatarControls({
            avatarControlMode, blurCheckbox, cameraPerspective, followAvatar, followedRemoteAvatarId,
            refreshSpatialUI, session, showMyAvatar, showOtherAvatars
        });

        // Touch screens get the on-screen movement pad. On a phone-width screen the
        // side panel starts closed so the World fills the screen.
        const touchInput = useMediaQuery(TOUCH_INPUT_QUERY);
        const compactLayout = useMediaQuery(COMPACT_LAYOUT_QUERY);
        const panelOpen = ref(!compactLayout.value);
        // The camera and walking controls hint, behind the panel's ? button.
        const controlsHintOpen = ref(false);
        const touchPadVisible = computed(() => touchInput.value && hasLocalAvatar.value && avatarControlMode.value);
        function togglePanel() {
            panelOpen.value = !panelOpen.value;
        }

        // The touch pad's Decorate: the same action as 'G', but through guarded() so a
        // refusal (not signed in, no edit access) is shown instead of ignored.
        function toggleAnimalDecoration() {
            guarded(() => session.toggleNearestAnimalDecorationHere());
            decorationInteractionState.value = session.animalDecorationInteractionState();
            refreshSpatialUI();
        }

        // The Avatar panel's Residents button: the same action as 'R', but through
        // guarded() so a refusal (not signed in, no edit access) is shown.
        // The Avatar panel's and touch pad's Talk: the same action as 'T'.
        function talkToResident() {
            guarded(() => session.talkToNearestResident());
            residentSpeech.value = session.lastResidentSpeech();
            refreshResidentFocusTargets();
        }

        function refreshResidentFocusTargets() {
            const speech = residentSpeech.value;
            const state = residentInteractionState.value;
            const current = speech
                && Date.now() - speech.spokenAt < speech.seconds * 1000
                && state && state.targetResidentId === speech.residentId;
            const next = current ? speech.focusTargets : [];
            if (next !== residentFocusTargets.value && !(next.length === 0 && residentFocusTargets.value.length === 0)) {
                residentFocusTargets.value = next;
            }
        }

        // A Focus button: a camera-only look at what the resident mentioned.
        function focusResidentMention(index) {
            guarded(() => session.focusResidentMention(index));
        }

        function toggleResidentHere() {
            guarded(() => session.toggleResidentHere());
            residentInteractionState.value = session.residentInteractionState();
            refreshSpatialUI();
        }

        const {
            soundAvailable, soundMuted, soundVolume, soundSpatial, startSound, stopSound, toggleSound, setSoundVolume,
            toggleSoundSpatial, onSoundKeyDown
        } = useWorldSoundscape({ createWorldSoundscape: inject('createWorldSoundscape', null), session });

        const {
            onKeyDown, onPointerDown, onPointerMove, onPointerUp
        } = useViewportInput({
            compassHeading, goHome, onAvatarKeyDown, onSoundKeyDown, redoAction, refreshHoverUI, refreshSpatialUI, session, undoAction
        });

        onMounted(() => {
            allPublications.value = listPublicationsUseCase.execute();
            session.start(viewport.value);
            session.navigateToDocument(initialDocumentId);
            refreshSpatialUI();

            // Reopens the focus panel for the location the Editor's "Back to World" named;
            // the camera is restored by the per-World experience store. A location that no
            // longer exists is silently ignored.
            if (route.query.returnLocation) {
                const context = session.getFocusContextForLocation(route.query.returnLocation);
                if (context) {
                    focusContext.value = context.toJSON();
                    showFocusPanel.value = true;
                }
                router.replace({ path: `/world/${initialDocumentId}` });
            }

            startSound();

            hasLocalAvatar.value = session.hasLocalAvatar();
            // Applies the default-on avatar toggles once session.start() has created a
            // local avatar.
            if (hasLocalAvatar.value) {
                session.setAvatarControlMode(avatarControlMode.value);
                session.setFollowAvatar(followAvatar.value);
            }

            viewport.value.addEventListener('pointerdown', onPointerDown);
            viewport.value.addEventListener('pointermove', onPointerMove);
            viewport.value.addEventListener('pointerup', onPointerUp);
            window.addEventListener('keydown', onKeyDown);
            window.addEventListener('keyup', onAvatarKeyUp);
            window.addEventListener('blur', onWindowBlur);

            spatialInterval = setInterval(() => {
                session.updateSpatialView();
                refreshSpatialUI();
            }, 3000);

            // A separate, much faster interval than spatialInterval. The session throttles
            // (selection/activity immediately, position/heading at most every ~90ms); this
            // only guarantees a fresh read to throttle from. A no-op outside spatial
            // presence.
            spatialPresenceSyncInterval = setInterval(syncCurrentWorldSpatialPresence, 100);

            // Its own short interval: the 3-second refresh is far too slow for a prompt
            // that must appear as the avatar approaches a vehicle. Only reads session
            // state. Hidden when Avatar Control Mode is off, since the key would do
            // nothing.
            // Residents name people the way the People lists do.
            session.setResidentDisplayNameResolver((identityId) => resolveIdentityDisplayName(identityId));
            // ...and speak in the chosen language.
            session.setResidentSpeechTranslator((remark) => displayText(remark));
            vehicleInteractionInterval = setInterval(() => {
                vehicleInteractionState.value = (hasLocalAvatar.value && avatarControlMode.value)
                    ? session.avatarVehicleInteractionState()
                    : null;
                // Same interval and gating as the vehicle prompt.
                storeInteractionState.value = (hasLocalAvatar.value && avatarControlMode.value)
                    ? session.avatarStoreInteractionState()
                    : null;
                animalInteractionState.value = (hasLocalAvatar.value && avatarControlMode.value)
                    ? session.avatarAnimalInteractionState()
                    : null;
                decorationInteractionState.value = (hasLocalAvatar.value && avatarControlMode.value)
                    ? session.animalDecorationInteractionState()
                    : null;
                residentInteractionState.value = hasLocalAvatar.value
                    ? session.residentInteractionState()
                    : null;
                // 'T' talks without going through the UI, so pick up what was said.
                const speech = session.lastResidentSpeech();
                if (speech !== residentSpeech.value) {
                    residentSpeech.value = speech;
                }
                refreshResidentFocusTargets();
                cruiseState.value = (hasLocalAvatar.value && avatarControlMode.value)
                    ? session.avatarContinuousMovementState()
                    : null;
                // Not gated on control mode: air runs out whether or not keys are held.
                swimState.value = hasLocalAvatar.value ? session.avatarSwimState() : null;
            }, 150);
        });

        onBeforeUnmount(() => {
            // Set first, before anything tears down: an in-flight cascade (never cancelled)
            // sees a dead session at its registration checkpoint.
            automaticCascadeSessionActive = false;
            placeNamingDiscoveryPresentationActive = false;
            disposeClaimedBuilds();
            unsubscribeAnnouncementIndexChanges();
            if (placeNamingDiscoveryMonitor) {
                placeNamingDiscoveryMonitor.dispose();
            }
            clearInterval(spatialInterval);
            clearInterval(spatialPresenceSyncInterval);
            clearInterval(vehicleInteractionInterval);
            if (feedbackTimer) {
                clearTimeout(feedbackTimer);
            }
            window.removeEventListener('keydown', onKeyDown);
            window.removeEventListener('keyup', onAvatarKeyUp);
            window.removeEventListener('blur', onWindowBlur);
            viewport.value.removeEventListener('pointerup', onPointerUp);
            viewport.value.removeEventListener('pointermove', onPointerMove);
            viewport.value.removeEventListener('pointerdown', onPointerDown);
            disposeWorldPresence();
            stopSound();
            // Defensive: end any preview before disposing the session.
            if (historyPreviewCursor.value !== null) {
                guarded(() => session.cancelHistoryPreview());
            }
            session.dispose();
        });

        return {
            displayText,
            compassText,
            spatialContextDescription,
            t,
            viewport,
            title,
            author,
            showMyAvatar,
            hasLocalAvatar,
            toggleShowMyAvatar,
            avatarControlMode,
            followAvatar,
            vehicleInteractionState,
            storeInteractionState,
            animalInteractionState,
            decorationInteractionState,
            toggleAnimalDecoration,
            residentInteractionState,
            toggleResidentHere,
            residentSpeech,
            talkToResident,
            residentFocusTargets,
            focusResidentMention,
            residentRefusalLabel,
            cruiseState,
            swimState,
            cameraPerspective,
            CameraPerspective,
            setCameraPerspective,
            showOtherAvatars,
            remoteAvatarDiagnostics,
            toggleAvatarControlMode,
            pressAvatarKey,
            releaseAvatarKey,
            touchInput,
            soundAvailable,
            soundMuted,
            soundVolume,
            soundSpatial,
            toggleSound,
            setSoundVolume,
            toggleSoundSpatial,
            touchPadVisible,
            panelOpen,
            togglePanel,
            controlsHintOpen,
            toggleFollowAvatar,
            toggleShowOtherAvatars,
            avatarInfo,
            followedRemoteAvatarId,
            followAvatarFromPanel,
            stopFollowingAvatarFromPanel,
            performAvatarInteraction,
            nearbyAvatars,
            selectNearbyAvatar,
            loadedWorlds,
            nearbyWorlds,
            failedWorlds,
            spatialHover,
            spatialInspection,
            documentInfo,
            activeDocumentInfo,
            focusedDocumentTitle,
            parentTitle,
            showMetadataEditor,
            metadataEditTarget,
            openMetadataEditor,
            placementInfo,
            activePlacementInfo,
            ownPublication,
            showPlacementEditor,
            placementEditTarget,
            placementOverlapWarning,
            openPlacementEditor,
            closePlacementEditor,
            onMovePlacement,
            removePlacementFromPanel,
            removePublicationPlacement,
            placementsRevision,
            claimedBuildRows,
            navigateToClaimedBuild,
            verifyClaimedBuild,
            acceptClaimedBuild,
            dismissClaimedBuild,
            unpublishOwnPublication,
            placeOwnPublication,
            getPublicationCommentariesCommand,
            getPublicationPlacementsCommand,
            addPublicationCommentaryCommand,
            searchResults,
            catalogEmpty,
            performSearch,
            showLocationDocuments,
            locationDocumentsPosition,
            locationDocumentsOccupants,
            openLocationDocuments,
            closeLocationDocuments,
            focusLocationDocument,
            showLocationBrowser,
            locationBrowserCenter,
            locationBrowserRadius,
            locationBrowserDocuments,
            locationBrowserDiagnostics,
            locationBrowserInspected,
            exploreHere,
            whatsHere,
            reExploreLocationBrowser,
            closeLocationBrowser,
            focusLocationBrowserResult,
            selectLocationBrowserResult,
            inspectLocationBrowserResult,
            cameraPosition,
            compassHeading,
            spatialContext,
            compassMarkers,
            showLocationsPanel,
            worldLocations,
            showHistoryPanel,
            historyTimeline,
            selectedHistoryEntryId,
            historyPreviewCursor,
            openHistoryPanel,
            closeHistoryPanel,
            selectHistoryEntry,
            previewSelectedHistoryEntry,
            cancelHistoryPreviewAction,
            restoreSelectedHistoryEntry,
            canUndo,
            canRedo,
            undoLabel,
            redoLabel,
            undoAction,
            redoAction,
            showWelcomePanel,
            welcomeContext,
            welcomeIsArrival,
            worldReturnInfo,
            welcomeIsReturning,
            closeWelcomePanel,
            exploreWelcomeSuggestion,
            canEditActiveWorld,
            showLandmarkForm,
            landmarkFormTarget,
            showRegionForm,
            regionFormTarget,
            showMapPanel,
            mapContent,
            closeMapPanel,
            mapHighlightRegionKeys,
            showFocusPanel,
            focusContext,
            openFocusForLocation,
            openFocusForGeographicPlace,
            openFocusForCollaborator,
            closeFocusPanel,
            goFromFocusPanel,
            showFocusOnMap,
            openNamesFromFocusPanel,
            editFocusedCopyFromFocusPanel,
            showGeographicPlaceDirectory,
            geographicPlaces,
            showGeographicPlacePanel,
            geographicPlace,
            closeGeographicPlaceDirectory,
            openGeographicPlace,
            openNamesFromPlace,
            showGeographicPlaceOnMap,
            nearbyGeographicPlaces,
            goToGeographicPlace,
            WorldViewPrimaryMode,
            primaryMode,
            setPrimaryMode,
            goBackInPlaces,
            nearbySectionsCollapsed,
            setNearbySectionCollapsed,
            NEARBY_PLACES_SECTION,
            NEARBY_LANDMARKS_SECTION,
            NEARBY_PEOPLE_SECTION,
            WORLD_ENCOUNTERS_SECTION,
            NEARBY_PLACE_NAMING_SECTION,
            NEARBY_CLAIMED_BUILDS_SECTION,
            nearbyPlaceNamingClaimRows,
            placeNamingDiscoveryError,
            worldDiscoverySourceRegistry,
            observerLocalEncounterStore,
            worldEncounterMaterialSources,
            worldEncounterMaterialVerifier,
            publicationDistributionLifecycleStore,
            worldDiscoveryLeadRegistry,
            discoverWorldEncounterPublicationCommand,
            worldEncounterLeadAssociationsQuery,
            publicationDiscoveryTag,
            nearbyLandmarkRows,
            nearbyPeopleRows,
            navigateToNearbyPlaceNamingClaim,
            adoptNearbyPlaceNamingClaim,
            goHome,
            openLocationsPanel,
            closeLocationsPanel,
            focusLocation,
            openAddLandmarkForm,
            openEditLandmarkForm,
            closeLandmarkForm,
            onSaveLandmarkForm,
            removeLandmarkFromPanel,
            openAddRegionForm,
            openEditRegionForm,
            closeRegionForm,
            onSaveRegionForm,
            removeRegionFromPanel,
            showNamingPanel,
            namingPanelRegionId,
            namingPanelClaims,
            namingPanelView,
            namingPanelPreferredName,
            namingPanelGeographicRegions,
            namingPanelGeographicView,
            openNamingPanel,
            closeNamingPanel,
            publishNamingClaim,
            retractNamingClaim,
            setPreferredNamingName,
            clearPreferredNamingName,
            exportNamingClaim,
            importNamingClaim,
            distributeNamingClaim,
            dismissNamingClaimDistributionOffer,
            canDistributePlaceNamingClaim: Boolean(distributePlaceNamingClaimCommand),
            namingPanelDiscoveryProvider,
            namingPanelDistributionClaimId,
            namingPanelDistributionExecuting,
            namingPanelDistributionError,
            namingPanelDistributionResult,
            namingPanelDistributionOfferClaimId,
            myIdentityId,
            showMembersPanel,
            activeWorldLobby, showLobbyPanel, openLobbyPanel, closeLobbyPanel,
            worldCollaborationRoster,
            worldOnlineCount,
            spatialCollaboratorRows,
            followCollaborator,
            isActiveWorldOwner,
            collaborationPendingIdentityId,
            openMembersPanel,
            closeMembersPanel,
            grantWorldMember,
            revokeWorldMember,
            feedbackMessage,
            feedbackVisible,
            focusWorld,
            openEncounteredPublicationCommand,
            forkEncounteredPublicationCommand,
            exploreEncounteredPublicationCommand,
            focusSelection,
            openStructureSource,
            editInspectedCopy,
            onSaveMetadata,
            saveActiveDocument,
            publishActiveDocument,
            distributeWorldEncounterPublication,
            distributeWorldEncounterSnapshot,
            snapshotDistributionStorageTypes,
            defaultAnnouncementDiscoveryProvider,
            defaultContentDistributionProvider,
            discoverOwnSnapshot,
            exportOwnSnapshot,
            discoverSnapshotCandidatesCommand,
            discoverSnapshotCandidatesWithOutcomeCommand,
            resolveSelectedSnapshotCommand,
            materializeSelectedSnapshotCommand,
            // Also passed to WorldEncounterCanvas so it can admit encountered Publications
            // into the app-wide catalog.
            decentralizedDiscoveryProviderForEnrichment,
            worldEncounterPublicationAdmissionLog
        };
    },
    template: `
        <div class="world-view">
            <div :class="['world-view-overlay', { 'world-view-overlay--collapsed': !panelOpen }]">
              <!-- Shown only on phone-width screens (css/main/touch-and-compact.css). -->
              <button
                  type="button"
                  class="action-btn world-view-panel-toggle"
                  :aria-expanded="panelOpen ? 'true' : 'false'"
                  @click="togglePanel"
              >{{ panelOpen ? t('worldView.hidePanel') : t('worldView.panel') }}</button>
              <div class="world-view-overlay-scroll">
                ${headerSectionTemplate}
                <!--
                    Panel order: what you're looking at, where to go, what's around, then your
                    own tools (Search, Avatar, Publication). Home, Locations and Members are
                    plain utilities (Notifications is in the app's header);
                    Explore / Map / Places are the three mutually exclusive primary modes.
                -->
                <div v-if="cameraPosition || activeDocumentInfo" class="world-view-actions world-view-actions--navigation">
                    <button v-if="cameraPosition" class="action-btn" @click="goHome">{{ t('worldView.home') }}</button>
                    <button
                        v-if="activeDocumentInfo"
                        class="action-btn"
                        :title="t('worldView.landmarksRegionsAndEveryStructure')"
                        @click="openLocationsPanel"
                    >{{ t('worldView.locations') }}</button>
                    <!--
                        The online count is the Members button. Subtle, so the World stays
                        dominant (docs/Principles.md, "The UI Displays Authorization; It Never
                        Decides It").
                    -->
                    <WorldPresenceIndicator v-if="activeDocumentInfo" :online-count="worldOnlineCount" @open="openMembersPanel" />
                    <button v-if="activeDocumentInfo && activeWorldLobby" class="action-btn" @click="openLobbyPanel">{{ t('worldView.lobby') }}</button>
                    <button
                        v-if="cameraPosition"
                        type="button"
                        :class="['action-btn', 'world-view-controls-toggle', { 'action-btn--active': controlsHintOpen }]"
                        :title="t('worldView.controls')"
                        :aria-label="t('worldView.controls')"
                        :aria-expanded="controlsHintOpen ? 'true' : 'false'"
                        @click="controlsHintOpen = !controlsHintOpen"
                    >?</button>
                </div>
                <template v-if="cameraPosition && controlsHintOpen">
                    <p v-if="touchInput" class="world-view-hint world-view-hint--controls">
                        {{ t('worldView.dragToOrbitPinchTo') }}<template v-if="avatarControlMode">{{ ' ' + t('worldView.joystickToWalkPushTo') }}</template>
                    </p>
                    <p v-else class="world-view-hint world-view-hint--controls">
                        {{ t('worldView.dragToOrbitScrollTo') }}<template v-if="avatarControlMode">{{ ' ' + t('worldView.wasdToWalkShiftTo') + ' ' + t('worldView.swimKeysHint') }}</template>
                    </p>
                </template>
                <WorldCollaboratorIndicator v-if="activeDocumentInfo" :rows="spatialCollaboratorRows" @follow="followCollaborator" />
                <div v-if="cameraPosition" class="world-view-primary-nav">
                    <button
                        :class="['action-btn', { 'action-btn--active': primaryMode === WorldViewPrimaryMode.EXPLORE }]"
                        :title="t('worldView.whatSAroundMeAnd')"
                        @click="setPrimaryMode(WorldViewPrimaryMode.EXPLORE)"
                    >{{ t('worldView.explore') }}</button>
                    <button
                        :class="['action-btn', { 'action-btn--active': primaryMode === WorldViewPrimaryMode.MAP }]"
                        :title="t('worldView.whereIsEverything')"
                        @click="setPrimaryMode(WorldViewPrimaryMode.MAP)"
                    >{{ t('worldView.map') }}</button>
                    <button
                        :class="['action-btn', { 'action-btn--active': primaryMode === WorldViewPrimaryMode.PLACES }]"
                        :title="t('worldView.whatPlacesExist')"
                        @click="setPrimaryMode(WorldViewPrimaryMode.PLACES)"
                    >{{ t('worldView.places') }}</button>
                </div>
                ${nearbySectionTemplate}

                ${inspectionPanelsTemplate}

                <div class="world-view-section world-view-section--search">
                    <h4>{{ t('worldView.search') }}</h4>
                    <WorldSearchPanel
                        :results="searchResults"
                        :catalog-empty="catalogEmpty"
                        @search="performSearch"
                        @focus="focusWorld"
                    />
                </div>

                ${avatarSectionTemplate}

                ${publicationSectionTemplate}

                ${worldListsSectionTemplate}
              </div>
            </div>
            <div ref="viewport" class="world-viewport"></div>
            ${dialogsTemplate}
            ${navigationHudSectionTemplate}
            ${hoverCardTemplate}
            <TouchMovementPad
                v-if="touchPadVisible"
                :vehicle-state="vehicleInteractionState"
                :store-state="storeInteractionState"
                :animal-state="animalInteractionState"
                :decoration-state="decorationInteractionState"
                :cruise-state="cruiseState"
                :resident-state="residentInteractionState"
                :swim-state="swimState"
                @key-down="pressAvatarKey"
                @key-up="releaseAvatarKey"
                @decorate="toggleAnimalDecoration"
            />
            <BreathMeter :swim-state="swimState" />
            <SoundControl
                v-if="soundAvailable"
                :muted="soundMuted"
                :volume="soundVolume"
                :spatial="soundSpatial"
                :show-spatial="true"
                @toggle="toggleSound"
                @volume="setSoundVolume"
                @toggle-spatial="toggleSoundSpatial"
            />
            <button
                v-if="touchInput && hasLocalAvatar"
                type="button"
                :class="['action-btn', 'world-view-walk-toggle', { 'action-btn--active': avatarControlMode }]"
                :aria-pressed="avatarControlMode ? 'true' : 'false'"
                @click="toggleAvatarControlMode"
            >{{ t('worldView.walk') }}</button>
        </div>
    `
};
