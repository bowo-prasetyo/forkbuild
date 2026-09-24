import { ref, computed, onMounted, onBeforeUnmount, inject } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import { CreateBrickRegistryUseCase } from '../../application/CreateBrickRegistryUseCase.js';
import { CreateWorldViewUseCase } from '../../application/CreateWorldViewUseCase.js';
import { CreateDiscoveryUseCase } from '../../application/CreateDiscoveryUseCase.js';
import { InputRouter } from '../../application/InputRouter.js';
import { WorldSpatialContextService } from '../../application/WorldSpatialContextService.js';
import { AutomaticSnapshotEncounterCascade } from '../../application/AutomaticSnapshotEncounterCascade.js';
import { AutomaticSnapshotEncounterRetentionReconciliation } from '../../application/AutomaticSnapshotEncounterRetentionReconciliation.js';
import { SnapshotWorldRegistrationOutcome } from '../../application/SnapshotWorldRegistrationOutcome.js';
import { ObserverLocalEncounterStore } from '../../application/ObserverLocalEncounterStore.js';
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
import LocationsPanel from '../components/LocationsPanel.js';
import LandmarkFormModal from '../components/LandmarkFormModal.js';
import RegionFormModal from '../components/RegionFormModal.js';
import WorldMembersPanel from '../components/WorldMembersPanel.js';
import WorldPresenceIndicator from '../components/WorldPresenceIndicator.js';
import WorldCollaboratorIndicator, { buildSpatialCollaboratorRows } from '../components/WorldCollaboratorIndicator.js';
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
import HistoryTimelinePanel from '../components/HistoryTimelinePanel.js';
import NotificationHistoryPanel from '../components/NotificationHistoryPanel.js';
import { CameraPerspective } from '../../core/CameraPerspective.js';
import { WorldFocusKind } from '../../core/WorldFocusContext.js';
import { EditorEntryContext, EditorEntryReason, editorEntryContextToQuery } from '../../core/EditorEntryContext.js';
import { WorldViewNavigationState, WorldViewPrimaryMode } from '../../application/WorldViewNavigationState.js';
import { PlaceNamingDiscoveryMonitor } from '../../application/PlaceNamingDiscoveryMonitor.js';
import { executeDiscoverPlaceNamingClaimsCommand } from '../../application/DiscoverPlaceNamingClaimsCommand.js';
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

const DRAG_THRESHOLD_PX = 6;

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
        WorldMembersPanel, WorldPresenceIndicator, WorldCollaboratorIndicator,
        WorldWelcomePanel, WorldMapPanel, PlaceNamingPanel,
        GeographicPlaceDirectoryPanel, GeographicPlacePanel, CollapsibleSection,
        WorldFocusPanel, WorldEncounterCanvas, OwnPublicationPanel, VehicleInteractionPrompt, AnimalInteractionPrompt,
        HistoryTimelinePanel, NotificationHistoryPanel
    },
    setup() {
        const route = useRoute();
        const router = useRouter();
        const viewport = ref(null);
        const initialDocumentId = route.params.documentId;

        const title = ref('Loading...');
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
        const publishPlaceNamingClaimToNostrCommand = inject('publishPlaceNamingClaimToNostrCommand', null);
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
        const automaticSnapshotEncounterCascade = new AutomaticSnapshotEncounterCascade({
            resolveSelectedSnapshotCommand,
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
        let pointerStart = null;
        let isDragging = false;
        let feedbackTimer = null;
        // Non-reactive bookkeeping; the template never reads these.
        let presentWorldDocumentId = null;
        let unsubscribeWorldPresence = null;
        let unsubscribeWorldMembership = null;
        // A separate, much faster timer than spatialInterval: a moving camera needs
        // 10-15 updates per second, while presence and membership only every few
        // seconds.
        let presentSpatialWorldDocumentId = null;
        let unsubscribeWorldSpatialPresence = null;
        // Separate from the presence ids: tracked even when no experience store is
        // wired.
        let presentExperienceWorldDocumentId = null;
        // The automatic Welcome shows once per World per session; only "Explore"
        // reopens it.
        const welcomeShownForDocumentId = new Set();
        let spatialPresenceSyncInterval = null;
        let vehicleInteractionInterval = null;

        // ----------------------------- action surface -------------

        const feedback = {
            show(message) {
                feedbackMessage.value = message;
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
                    feedback.show(`Created your own editable copy — "${notice.sourceTitle}" is unchanged`);
                }
                return result;
            } catch (err) {
                feedback.show(err.message);
                return undefined;
            }
        }

        // Editing a published snapshot's metadata forks it first, so this goes through
        // guarded(). Openable from the inspected document's panel or the header (the
        // active document); metadataEditTarget records which.
        function openMetadataEditor(info) {
            if (!info) return;
            metadataEditTarget.value = info;
            showMetadataEditor.value = true;
        }

        function onSaveMetadata({ title, description, license }) {
            const info = metadataEditTarget.value;
            if (!info) return;
            guarded(() => session.updateDocumentMetadata(info.documentId, { title, description, license }));
            showMetadataEditor.value = false;
            metadataEditTarget.value = null;
            refreshSpatialUI();
        }

        // Bound to the ACTIVE document, never the inspected one: save/publish must be
        // unambiguous about which document it acts on.
        function saveActiveDocument() {
            const info = activeDocumentInfo.value;
            if (!info) return;
            guarded(() => {
                session.saveDocument(info.documentId);
                feedback.show('Saved');
            });
            refreshSpatialUI();
        }

        function publishActiveDocument() {
            const info = activeDocumentInfo.value;
            if (!info) return;
            guarded(() => {
                const publication = session.publishDocument(info.documentId);
                feedback.show(`Published "${publication.title}"`);
            });
            refreshSpatialUI();
        }

        // Recipient-scoped, unlike the document-scoped History panel.
        const showNotificationHistoryPanel = ref(false);
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
            unpublishOwnPublication, placeOwnPublication, getPublicationCommentariesCommand,
            addPublicationCommentaryCommand, getPublicationPlacementsCommand,
            getRecipientNotificationEventsCommand, openNotificationHistoryPanel, closeNotificationHistoryPanel,
            viewNotificationPublicationCommand
        } = useOwnPublicationActions({
            feedback, focusWorld, guarded, placementEditTarget, placementOverlapWarning, refreshSpatialUI,
            session, showNotificationHistoryPanel, showPlacementEditor
        });

        // -----------------------------------------------------------------
        // Spatial UI refresh
        // -----------------------------------------------------------------

        function refreshSpatialUI() {
            const state = session.getSpatialState();
            const docs = session.getLoadedDocuments();
            const pubMap = new Map(allPublications.value.map((p) => [p.documentId, p]));

            const worldRow = (id, doc = null) => {
                const pub = pubMap.get(id);
                return {
                    documentId: id,
                    title: doc?.metadata?.title || pub?.title || 'Untitled',
                    author: doc?.metadata?.author || pub?.author || 'anonymous'
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
            if (worldSnapshotDiscoveryMonitor && spatialContext.value) {
                worldSnapshotDiscoveryMonitor.observe(spatialContext.value).then(() => {
                    const candidates = worldSnapshotDiscoveryMonitor.lastResult;
                    if (Array.isArray(candidates)) {
                        candidates.forEach((candidate) => automaticSnapshotEncounterCascade.processCandidate(candidate).then((result) => {
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
                        }));
                    }
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
                title.value = activeDoc.metadata.title || 'Untitled';
                author.value = activeDoc.metadata.author;
            }
            activeDocumentInfo.value = activeId ? session.getDocumentInfo(activeId) : null;
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
                focusedDocumentTitle.value = focusedDoc?.metadata?.title || focusedPub?.title || 'Untitled';
            }
        }

        // -----------------------------------------------------------------
        // World Collaboration
        // -----------------------------------------------------------------
        //
        // Presence follows the ACTIVE document, never the merely focused one: entering
        // presence for a world you only look at would announce "here" for a document
        // nothing considers current. A no-op unless the active document changed, to
        // avoid re-subscribing every poll.
        function _syncWorldPresence(activeId) {
            if (activeId === presentWorldDocumentId) {
                return;
            }
            if (presentWorldDocumentId) {
                session.leaveWorldPresence(presentWorldDocumentId);
            }
            if (unsubscribeWorldPresence) {
                unsubscribeWorldPresence();
                unsubscribeWorldPresence = null;
            }
            if (unsubscribeWorldMembership) {
                unsubscribeWorldMembership();
                unsubscribeWorldMembership = null;
            }
            presentWorldDocumentId = activeId || null;
            refreshCollaborationRoster(presentWorldDocumentId);
            if (!presentWorldDocumentId) {
                return;
            }
            session.enterWorldPresence(presentWorldDocumentId);
            // Live membership/presence changes refresh the roster immediately. A grant or
            // revocation also re-derives and re-broadcasts this replica's own advertised
            // activity right away. That refresh is isolated in its own try/catch: this
            // callback runs synchronously inside WorldMembershipUseCase, and a throw would
            // skip its network broadcast for every peer.
            unsubscribeWorldMembership = session.onWorldMembershipChanged(presentWorldDocumentId, () => {
                worldMembers.value = session.listWorldMembers(presentWorldDocumentId);
                try {
                    session.refreshWorldPresenceActivity(presentWorldDocumentId);
                } catch {
                }
            });
            unsubscribeWorldPresence = session.onWorldPresenceChanged(presentWorldDocumentId, (roster) => {
                worldPresenceRoster.value = roster;
            });
        }

        // Same shape as _syncWorldPresence() but purely local storage, never
        // broadcast. worldReturnInfo is captured from the prior record before this
        // visit's restore/save.
        function _syncWorldExperience(activeId) {
            if (activeId === presentExperienceWorldDocumentId) {
                return;
            }
            if (presentExperienceWorldDocumentId) {
                session.saveWorldExperience(presentExperienceWorldDocumentId);
            }
            presentExperienceWorldDocumentId = activeId || null;
            if (!presentExperienceWorldDocumentId) {
                worldReturnInfo.value = null;
                return;
            }
            // restoreWorldExperience() only reads, and returns null on a first visit.
            const priorExperience = session.restoreWorldExperience(presentExperienceWorldDocumentId);
            worldReturnInfo.value = priorExperience ? { lastVisitedAt: priorExperience.lastVisitedAt } : null;
        }

        function refreshCollaborationRoster(documentId) {
            if (!documentId) {
                worldMembers.value = [];
                worldPresenceRoster.value = [];
                return;
            }
            worldMembers.value = session.listWorldMembers(documentId);
            worldPresenceRoster.value = session.getWorldPresenceRoster(documentId);
        }

        // Same shape as _syncWorldPresence(), for spatial presence.
        function _syncWorldSpatialPresence(activeId) {
            if (activeId === presentSpatialWorldDocumentId) {
                return;
            }
            if (presentSpatialWorldDocumentId) {
                session.leaveWorldSpatialPresence(presentSpatialWorldDocumentId);
            }
            if (unsubscribeWorldSpatialPresence) {
                unsubscribeWorldSpatialPresence();
                unsubscribeWorldSpatialPresence = null;
            }
            presentSpatialWorldDocumentId = activeId || null;
            spatialCollaboratorRows.value = [];
            if (!presentSpatialWorldDocumentId) {
                return;
            }
            session.enterWorldSpatialPresence(presentSpatialWorldDocumentId, {
                resolveDisplayName: (identityId) => resolveIdentityDisplayName(identityId)
            });
            spatialCollaboratorRows.value = buildSpatialCollaboratorRows(
                session.getWorldSpatialPresenceRoster(presentSpatialWorldDocumentId),
                { resolveDisplayName: resolveIdentityDisplayName, resolveSelectionLabel: (selection) => session.resolveSpatialSelectionLabel(selection) }
            );
            unsubscribeWorldSpatialPresence = session.onWorldSpatialPresenceChanged(presentSpatialWorldDocumentId, (roster) => {
                spatialCollaboratorRows.value = buildSpatialCollaboratorRows(roster, {
                    resolveDisplayName: resolveIdentityDisplayName,
                    resolveSelectionLabel: (selection) => session.resolveSpatialSelectionLabel(selection)
                });
                // Refreshes an already-open Welcome panel in place; never reopens a dismissed
                // one (docs/Principles.md, "Exploration Guides Attention, Never Ownership or
                // Mutation").
                if (showWelcomePanel.value) {
                    refreshWelcomeContext();
                }
            });
            if (!welcomeShownForDocumentId.has(presentSpatialWorldDocumentId)) {
                welcomeShownForDocumentId.add(presentSpatialWorldDocumentId);
                openWelcomePanel(true);
            }
        }

        const {
            showWelcomePanel, welcomeContext, welcomeIsArrival, worldReturnInfo, refreshWelcomeContext,
            welcomeIsReturning, openWelcomePanel, closeWelcomePanel, exploreWelcomeSuggestion
        } = useWelcomePanel({
            refreshSpatialUI, resolveIdentityDisplayName, session, syncPrimaryMode
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
            return pub ? (pub.title || 'Untitled') : null;
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
                    worldTitle: pub?.title || 'Untitled',
                    worldAuthor: pub?.author || 'anonymous'
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

        // Same /editor?load= navigation as PublicationCatalog's Open.
        function openEncounteredPublicationCommand(publication) {
            router.push({ path: '/editor', query: { load: publication.documentId } });
        }

        // Same /editor?fork= navigation as PublicationCatalog's Fork.
        function forkEncounteredPublicationCommand(publication) {
            router.push({ path: '/editor', query: { fork: publication.documentId, publication: publication.id } });
        }

        function exploreEncounteredPublicationCommand(publication) {
            focusWorld(publication.documentId);
        }

        function focusSelection() {
            session.focusSelection();
            refreshSpatialUI();
        }

        // -----------------------------------------------------------------
        // Location & Navigation
        // -----------------------------------------------------------------
        //
        // Unlike focusWorld(), Home and Locations never load a document, touch the
        // route or change the active document.
        function goHome() {
            session.goHome();
            refreshSpatialUI();
        }

        // Lives under Explore mode, opened through the same mutual-exclusion helper.
        function openLocationsPanel() {
            syncPrimaryMode(WorldViewPrimaryMode.EXPLORE);
            closePrimaryNavigationPanels();
            refreshLocationsPanel();
            showLocationsPanel.value = true;
        }

        function closeLocationsPanel() {
            showLocationsPanel.value = false;
        }

        // The one handler for every "go to this location" entry point.
        function focusLocation(locationId) {
            session.focusLocation(locationId);
            refreshSpatialUI();
        }

        // -----------------------------------------------------------------
        // Landmarks & Waypoints
        // -----------------------------------------------------------------
        //
        // Mutations go through guarded(); the Locations list is re-read after each so
        // changes show immediately.
        function refreshLocationsPanel() {
            worldLocations.value = session.getWorldLocations().map((loc) => loc.toJSON());
        }

        const {
            showLandmarkForm, landmarkFormTarget, showRegionForm, regionFormTarget, openAddLandmarkForm,
            openEditLandmarkForm, closeLandmarkForm, onSaveLandmarkForm, removeLandmarkFromPanel,
            openAddRegionForm, openEditRegionForm, closeRegionForm, onSaveRegionForm, removeRegionFromPanel
        } = useLandmarkAndRegionForms({
            feedback, guarded, refreshLocationsPanel, refreshSpatialUI, session
        });

        const {
            showNamingPanel, namingPanelRegionId, namingPanelClaims, namingPanelView, namingPanelPreferredName,
            namingPanelGeographicRegions, namingPanelGeographicView, namingPanelPublishToNostrClaimId,
            namingPanelPublishToNostrExecuting, namingPanelPublishToNostrError,
            namingPanelPublishToNostrResult, namingPanelPublishToNostrRequestId, myIdentityId,
            refreshNamingPanel, openNamingPanel, closeNamingPanel, resetNamingPanelPublishToNostr,
            publishNamingClaim, retractNamingClaim, setPreferredNamingName, clearPreferredNamingName,
            exportNamingClaim, importNamingClaim, publishNamingClaimToNostr
        } = usePlaceNamingPanel({
            feedback, guarded, publishPlaceNamingClaimToNostrCommand, session
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
            NEARBY_PLACE_NAMING_SECTION, nearbySectionsCollapsed, setNearbySectionCollapsed,
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

        // "Open Source" loads the structure's document directly in the Editor (no
        // fork), so edits affect every placed instance. Contrast "Edit a Copy".
        function openStructureSource(documentId) {
            if (!documentId) {
                return;
            }
            router.push({ path: '/editor', query: { load: documentId } });
        }

        // "Edit a Copy" from the inspection panel: forks the containing World for a
        // brick or ground, or the structure's own content document for a placement.
        // Builds the EditorEntryContext by hand: camera framing always, and
        // selectAllBricks only for a placement. The return address is the focused
        // document; no focusLocationId is available here.
        function editInspectedCopy(inspection) {
            if (!inspection) {
                return;
            }
            const isPlacement = inspection.type === 'placement';
            const documentId = isPlacement ? inspection.sourceDocumentId : inspection.documentId;
            if (!documentId) {
                return;
            }
            const publication = session.getPublicationIdForDocument(documentId);
            const position = inspection.type === 'ground' ? inspection.position : inspection.worldPosition;
            const title = isPlacement ? inspection.sourceTitle : inspection.worldTitle;
            const returnWorld = currentReturnWorld();
            const entryContext = new EditorEntryContext({
                sourceDocumentId: documentId,
                focusPosition: position || null,
                selectAllBricks: isPlacement,
                title: title || '',
                kind: isPlacement ? WorldFocusKind.STRUCTURE : null,
                reason: EditorEntryReason.WORLD_VIEW_EDIT_COPY,
                returnWorldId: returnWorld.id,
                returnWorldTitle: returnWorld.title
            });
            router.push({
                path: '/editor',
                query: {
                    fork: documentId,
                    ...(publication ? { publication } : {}),
                    ...editorEntryContextToQuery(entryContext)
                }
            });
        }

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
        // Pointer interaction: pick/hover for focus and inspection only
        // -----------------------------------------------------------------

        function onPointerDown(event) {
            isDragging = false;
            pointerStart = { x: event.clientX, y: event.clientY };
        }

        function onPointerMove(event) {
            if (pointerStart) {
                const dx = event.clientX - pointerStart.x;
                const dy = event.clientY - pointerStart.y;
                if (Math.sqrt(dx * dx + dy * dy) > DRAG_THRESHOLD_PX) {
                    isDragging = true;
                }
            }
            if (event.buttons === 0) {
                session.hover(event.clientX, event.clientY);
                refreshHoverUI();
            }
            // Keep the compass turning during an orbit drag.
            if (isDragging && event.buttons !== 0) {
                compassHeading.value = session.getCompassHeading();
            }
        }

        function onPointerUp(event) {
            if (!isDragging && pointerStart) {
                session.pick(event.clientX, event.clientY, {
                    toggle: event.ctrlKey || event.metaKey,
                    additive: event.shiftKey
                });
                refreshSpatialUI();
            } else if (isDragging) {
                compassHeading.value = session.getCompassHeading();
            }
            pointerStart = null;
            isDragging = false;
        }

        // -----------------------------------------------------------------
        // Keyboard interaction
        // -----------------------------------------------------------------

        function onKeyDown(event) {
            if (InputRouter.isTextInputTarget(event.target)) {
                if (event.key === 'Escape') {
                    event.target.blur();
                }
                return;
            }
            // 2. Undo/Redo: Ctrl+Z / Ctrl+Y / Ctrl+Shift+Z, as in the Editor.
            if ((event.ctrlKey || event.metaKey) && !event.altKey) {
                const key = event.key.toLowerCase();
                if (key === 'z' && !event.shiftKey) {
                    event.preventDefault();
                    undoAction();
                    return;
                }
                if ((key === 'z' && event.shiftKey) || key === 'y') {
                    event.preventDefault();
                    redoAction();
                    return;
                }
            }
            // 3. Avatar Control Mode consumes W/A/S/D/Shift/Space only while on.
            if (onAvatarKeyDown(event)) {
                return;
            }
        }

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
            toggleShowOtherAvatars, onAvatarKeyDown, onAvatarKeyUp, onWindowBlur
        } = useAvatarControls({
            avatarControlMode, blurCheckbox, cameraPerspective, followAvatar, followedRemoteAvatarId,
            refreshSpatialUI, session, showMyAvatar, showOtherAvatars
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
            spatialPresenceSyncInterval = setInterval(() => {
                if (presentSpatialWorldDocumentId) {
                    session.syncWorldSpatialPresence(presentSpatialWorldDocumentId);
                }
            }, 100);

            // Its own short interval: the 3-second refresh is far too slow for a prompt
            // that must appear as the avatar approaches a vehicle. Only reads session
            // state. Hidden when Avatar Control Mode is off, since the key would do
            // nothing.
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
            }, 150);
        });

        onBeforeUnmount(() => {
            // Set first, before anything tears down: an in-flight cascade (never cancelled)
            // sees a dead session at its registration checkpoint.
            automaticCascadeSessionActive = false;
            placeNamingDiscoveryPresentationActive = false;
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
            // session.dispose() leaves every world's coarse and spatial presence, so only
            // the view's own subscriptions are torn down here.
            if (unsubscribeWorldPresence) {
                unsubscribeWorldPresence();
            }
            if (unsubscribeWorldMembership) {
                unsubscribeWorldMembership();
            }
            if (unsubscribeWorldSpatialPresence) {
                unsubscribeWorldSpatialPresence();
            }
            // Final save of the camera framing: _syncWorldExperience() only saves on the
            // next active-document change, which never comes after teardown.
            if (presentExperienceWorldDocumentId) {
                session.saveWorldExperience(presentExperienceWorldDocumentId);
            }
            // Defensive: end any preview before disposing the session.
            if (historyPreviewCursor.value !== null) {
                guarded(() => session.cancelHistoryPreview());
            }
            session.dispose();
        });

        return {
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
            cameraPerspective,
            CameraPerspective,
            setCameraPerspective,
            showOtherAvatars,
            remoteAvatarDiagnostics,
            toggleAvatarControlMode,
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
            unpublishOwnPublication,
            placeOwnPublication,
            getPublicationCommentariesCommand,
            getPublicationPlacementsCommand,
            addPublicationCommentaryCommand,
            getRecipientNotificationEventsCommand,
            viewNotificationPublicationCommand,
            showNotificationHistoryPanel,
            openNotificationHistoryPanel,
            closeNotificationHistoryPanel,
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
            publishNamingClaimToNostr,
            canPublishPlaceNamingClaimToNostr: Boolean(publishPlaceNamingClaimToNostrCommand),
            namingPanelPublishToNostrClaimId,
            namingPanelPublishToNostrExecuting,
            namingPanelPublishToNostrError,
            namingPanelPublishToNostrResult,
            myIdentityId,
            showMembersPanel,
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
            <div class="world-view-overlay">
              <div class="world-view-overlay-scroll">
                <h2>{{ title }}</h2>
                <p
                    v-if="activeDocumentInfo"
                    :class="['world-view-status', { 'world-view-status--published': activeDocumentInfo.status === 'published' }]"
                >
                    <span v-if="activeDocumentInfo.status === 'published'">🔒 Published</span>
                    <span v-else-if="activeDocumentInfo.parentDocumentId">
                        ✎ Editing fork<template v-if="parentTitle(activeDocumentInfo.parentDocumentId)"> — forked from {{ parentTitle(activeDocumentInfo.parentDocumentId) }}</template>
                    </span>
                    <span v-else>✎ {{ activeDocumentInfo.statusLabel }}</span>
                </p>
                <!--
                    Camera focus and the active document are tracked separately (docs/
                    Principles.md, "Camera Focus, Active Document, and Selection Are Three
                    Different Things").
                -->
                <p class="world-view-context">
                    Camera: {{ focusedDocumentTitle || 'World' }} · Editing: {{ activeDocumentInfo ? title : 'None' }}
                </p>
                <div v-if="activeDocumentInfo && activeDocumentInfo.editable" class="world-view-actions">
                    <button
                        class="action-btn"
                        :disabled="!activeDocumentInfo.dirty"
                        @click="saveActiveDocument"
                    >Save</button>
                    <button class="action-btn action-btn--primary" @click="publishActiveDocument">Publish</button>
                    <button class="action-btn" @click="openMetadataEditor(activeDocumentInfo)">Edit Metadata</button>
                    <button
                        class="action-btn"
                        :disabled="!canUndo"
                        :title="undoLabel || 'Nothing to undo'"
                        @click="undoAction"
                    >Undo</button>
                    <button
                        class="action-btn"
                        :disabled="!canRedo"
                        :title="redoLabel || 'Nothing to redo'"
                        @click="redoAction"
                    >Redo</button>
                    <button
                        class="action-btn"
                        title="Inspect, preview, and restore this document's command history"
                        @click="openHistoryPanel"
                    >History</button>
                </div>
                <div v-if="activePlacementInfo" class="world-view-actions">
                    <button
                        class="action-btn"
                        :disabled="!activePlacementInfo.movable"
                        @click="openPlacementEditor(activePlacementInfo)"
                    >Move Placement</button>
                </div>
                <p v-if="author">by {{ author }}</p>
                <!--
                    Mounted beside Save/Publish rather than inside World Encounters, so
                    distributing your own Snapshot never depends on primary mode, a peer or
                    Encounters. The commands are this view's thin wrappers, shared with
                    WorldEncounterCanvas where they overlap.
                -->
                <OwnPublicationPanel
                    v-if="cameraPosition"
                    :publication="ownPublication"
                    :unpublishCommand="unpublishOwnPublication"
                    :placePublicationCommand="placeOwnPublication"
                    :snapshotDistributionCommand="distributeWorldEncounterSnapshot"
                    :snapshotDistributionStorageTypes="snapshotDistributionStorageTypes"
                    :defaultContentDistributionProvider="defaultContentDistributionProvider"
                    :publicationDistributionCommand="distributeWorldEncounterPublication"
                    :defaultDiscoveryDistributionProvider="defaultAnnouncementDiscoveryProvider"
                    :discoverSnapshotCommand="discoverOwnSnapshot"
                    :exportSnapshotCommand="exportOwnSnapshot"
                    :discoverSnapshotCandidatesCommand="discoverSnapshotCandidatesCommand"
                    :worldDiscoverySourceRegistry="worldDiscoverySourceRegistry"
                    :resolveSelectedSnapshotCommand="resolveSelectedSnapshotCommand"
                    :materializeSelectedSnapshotCommand="materializeSelectedSnapshotCommand"
                    :placementInfo="activePlacementInfo"
                    :getPublicationCommentariesCommand="getPublicationCommentariesCommand"
                    :addPublicationCommentaryCommand="addPublicationCommentaryCommand"
                    :viewerIdentityId="myIdentityId"
                    :getPublicationPlacementsCommand="getPublicationPlacementsCommand"
                    :discoverSnapshotCandidatesWithOutcomeCommand="discoverSnapshotCandidatesWithOutcomeCommand"
                />
            <!--
                Home and Locations are plain utilities; Explore / Map / Places are the three
                mutually exclusive primary modes.
            -->
            <div v-if="cameraPosition" class="world-view-actions world-view-actions--navigation">
                <button class="action-btn" @click="goHome">Home</button>
                <button
                    v-if="activeDocumentInfo"
                    class="action-btn"
                    title="Landmarks, regions, and every structure this session knows about"
                    @click="openLocationsPanel"
                >Locations</button>
                <!-- Scoped to the signed-in identity, not the open document. -->
                <button
                    class="action-btn"
                    title="A durable record of notification facts addressed to you"
                    @click="openNotificationHistoryPanel"
                >Notifications</button>
            </div>
            <div v-if="cameraPosition" class="world-view-primary-nav">
                <button
                    :class="['action-btn', { 'action-btn--active': primaryMode === WorldViewPrimaryMode.EXPLORE }]"
                    title="What's around me, and where can I go?"
                    @click="setPrimaryMode(WorldViewPrimaryMode.EXPLORE)"
                >Explore</button>
                <button
                    :class="['action-btn', { 'action-btn--active': primaryMode === WorldViewPrimaryMode.MAP }]"
                    title="Where is everything?"
                    @click="setPrimaryMode(WorldViewPrimaryMode.MAP)"
                >Map</button>
                <button
                    :class="['action-btn', { 'action-btn--active': primaryMode === WorldViewPrimaryMode.PLACES }]"
                    title="What places exist?"
                    @click="setPrimaryMode(WorldViewPrimaryMode.PLACES)"
                >Places</button>
            </div>
            <div v-if="cameraPosition && primaryMode === WorldViewPrimaryMode.EXPLORE" class="world-view-section world-view-section--nearby">
                <h4>Nearby</h4>
                <CollapsibleSection
                    title="Nearby Places"
                    :count="nearbyGeographicPlaces.length"
                    :collapsed="nearbySectionsCollapsed.places"
                    @toggle="setNearbySectionCollapsed('places', NEARBY_PLACES_SECTION, $event)"
                >
                    <p v-if="nearbyGeographicPlaces.length === 0" class="world-view-nearby-empty">Nothing nearby yet.</p>
                    <div v-for="place in nearbyGeographicPlaces" :key="place.fingerprintKey" class="world-view-nearby-row">
                        <span class="world-view-nearby-row-label">⬢ {{ place.displayName }}</span>
                        <span class="world-view-nearby-row-distance">{{ place.distance }}m {{ place.direction }}</span>
                        <button class="action-btn world-view-nearby-row-go" @click="openFocusForGeographicPlace(place.fingerprintKey)">Info</button>
                        <button class="action-btn world-view-nearby-row-go" @click="goToGeographicPlace(place.fingerprintKey)">Go</button>
                    </div>
                </CollapsibleSection>
                <CollapsibleSection
                    title="Nearby Landmarks"
                    :count="nearbyLandmarkRows.length"
                    :collapsed="nearbySectionsCollapsed.landmarks"
                    @toggle="setNearbySectionCollapsed('landmarks', NEARBY_LANDMARKS_SECTION, $event)"
                >
                    <p v-if="nearbyLandmarkRows.length === 0" class="world-view-nearby-empty">Nothing nearby yet.</p>
                    <div v-for="landmark in nearbyLandmarkRows" :key="landmark.id" class="world-view-nearby-row">
                        <span class="world-view-nearby-row-label">★ {{ landmark.title }}</span>
                        <span class="world-view-nearby-row-distance">{{ landmark.distance }}m {{ landmark.direction }}</span>
                        <button class="action-btn world-view-nearby-row-go" @click="openFocusForLocation(landmark.id)">Info</button>
                        <button class="action-btn world-view-nearby-row-go" @click="focusLocation(landmark.id)">Go</button>
                    </div>
                </CollapsibleSection>
                <CollapsibleSection
                    title="Nearby People"
                    :count="nearbyPeopleRows.length"
                    :collapsed="nearbySectionsCollapsed.people"
                    @toggle="setNearbySectionCollapsed('people', NEARBY_PEOPLE_SECTION, $event)"
                >
                    <p v-if="nearbyPeopleRows.length === 0" class="world-view-nearby-empty">Nobody nearby yet.</p>
                    <div v-for="person in nearbyPeopleRows" :key="person.identityId" class="world-view-nearby-row">
                        <span class="world-view-nearby-row-label">{{ person.displayName }}</span>
                        <span class="world-view-nearby-row-distance">{{ person.distance }}m {{ person.direction }}</span>
                        <button
                            v-if="person.deviceId"
                            class="action-btn world-view-nearby-row-go"
                            @click="openFocusForCollaborator(person.deviceId)"
                        >Info</button>
                        <button
                            v-if="person.deviceId"
                            class="action-btn world-view-nearby-row-go"
                            @click="followCollaborator(person.deviceId)"
                        >Go</button>
                    </div>
                </CollapsibleSection>
                <!--
                    An empty list means no claims were discovered nearby, never that the place
                    has no name. The error never hides the last successful results.
                -->
                <CollapsibleSection
                    title="Nearby Place Names"
                    :count="nearbyPlaceNamingClaimRows.length"
                    :collapsed="nearbySectionsCollapsed.placeNaming"
                    @toggle="setNearbySectionCollapsed('placeNaming', NEARBY_PLACE_NAMING_SECTION, $event)"
                >
                    <p v-if="placeNamingDiscoveryError" class="world-view-nearby-empty world-view-place-naming-error">
                        Place naming discovery is temporarily unavailable — showing the last known claims, if any.
                    </p>
                    <p v-if="nearbyPlaceNamingClaimRows.length === 0" class="world-view-nearby-empty">No nearby place naming claims were discovered.</p>
                    <div
                        v-for="claim in nearbyPlaceNamingClaimRows"
                        :key="claim.claimId"
                        class="world-view-nearby-row world-view-place-naming-row"
                        :title="claim.claimId"
                    >
                        <span class="world-view-nearby-row-label">✎ {{ claim.name }}</span>
                        <span class="world-view-nearby-row-distance" v-if="claim.position">at ({{ Math.round(claim.position.x) }}, {{ Math.round(claim.position.z) }})</span>
                        <span class="world-view-place-naming-author">claimed by {{ claim.authorDisplayName }}</span>
                        <!-- No signature/verification indicator here (see nearbyPlaceNamingClaimRows). -->
                        <span v-if="claim.createdAtLabel" class="world-view-place-naming-created">Created: {{ claim.createdAtLabel }}</span>
                        <!-- Navigate only moves the camera; it never adopts, verifies or renames. -->
                        <button
                            class="action-btn world-view-nearby-row-go"
                            @click="navigateToNearbyPlaceNamingClaim(claim)"
                        >Navigate</button>
                        <!--
                            Adopt is the only action that imports a claim, and only on this click. Once
                            saved, a passive "Already saved" line replaces the button ("saved", not
                            "adopted": the store also holds the viewer's own claims).
                        -->
                        <button
                            v-if="!claim.alreadySaved"
                            class="action-btn world-view-nearby-row-adopt"
                            @click="adoptNearbyPlaceNamingClaim(claim)"
                        >Adopt</button>
                        <span v-else class="world-view-nearby-row-status">✓ Already saved</span>
                    </div>
                </CollapsibleSection>
                <!--
                    WorldEncounterCanvas mounted inside Explore, with the app-wide collaborators
                    and this view's thin command wrappers passed straight through. All encounter
                    behavior stays inside the canvas; this view constructs and decides nothing.
                -->
                <CollapsibleSection
                    title="World Encounters"
                    :collapsed="nearbySectionsCollapsed.worldEncounters"
                    @toggle="setNearbySectionCollapsed('worldEncounters', WORLD_ENCOUNTERS_SECTION, $event)"
                >
                    <WorldEncounterCanvas
                        :discoveryCommand="discoverWorldEncounterPublicationCommand"
                        :registry="worldDiscoverySourceRegistry"
                        :materialSources="worldEncounterMaterialSources"
                        :materialVerifier="worldEncounterMaterialVerifier"
                        :distributionLifecycleStore="publicationDistributionLifecycleStore"
                        :distributionCommand="distributeWorldEncounterPublication"
                        :snapshotDistributionCommand="distributeWorldEncounterSnapshot"
                        :snapshotDistributionStorageTypes="snapshotDistributionStorageTypes"
                        :defaultDiscoveryDistributionProvider="defaultAnnouncementDiscoveryProvider"
                        :defaultContentDistributionProvider="defaultContentDistributionProvider"
                        :discoverSnapshotCommand="discoverOwnSnapshot"
                        :worldDiscoveryLeadRegistry="worldDiscoveryLeadRegistry"
                        :leadAssociationsQuery="worldEncounterLeadAssociationsQuery"
                        :getPublicationCommentariesCommand="getPublicationCommentariesCommand"
                        :addPublicationCommentaryCommand="addPublicationCommentaryCommand"
                        :viewerIdentityId="myIdentityId"
                        :defaultDiscoveryTag="publicationDiscoveryTag"
                        :publicationAdmissionLog="worldEncounterPublicationAdmissionLog"
                        :decentralizedPublicationDiscoveryProvider="decentralizedDiscoveryProviderForEnrichment"
                        :observerLocalEncounterRegistry="observerLocalEncounterStore"
                        :openPublicationCommand="openEncounteredPublicationCommand"
                        :forkPublicationCommand="forkEncounteredPublicationCommand"
                        :explorePublicationCommand="exploreEncounteredPublicationCommand"
                    />
                </CollapsibleSection>
            </div>
                <!--
                    Subtle, so the World stays dominant (docs/Principles.md, "The UI Displays
                    Authorization; It Never Decides It").
                -->
                <div v-if="activeDocumentInfo" class="world-view-actions world-view-actions--collaboration">
                    <WorldPresenceIndicator :online-count="worldOnlineCount" @open="openMembersPanel" />
                    <button class="action-btn" @click="openMembersPanel">Members</button>
                </div>

                <WorldCollaboratorIndicator v-if="activeDocumentInfo" :rows="spatialCollaboratorRows" @follow="followCollaborator" />
                <!--
                    Browse by camera position (docs/Principles.md, "Exploring A Location Is Not
                    A Second Search").
                -->
                <div v-if="cameraPosition" class="world-view-actions world-view-actions--explore">
                    <button class="action-btn" @click="exploreHere">Explore Here</button>
                    <button class="action-btn" @click="whatsHere">What's Here?</button>
                </div>
                <p class="world-view-hint">
                    Drag to orbit • Scroll to zoom • Home to reset • Click to inspect<template v-if="avatarControlMode"> • WASD to walk • Shift to run • Space to jump</template>
                </p>

                <!--
                    Client rendering preferences. Control/Follow are explicit toggles, never
                    implied by focus. Show Other Avatars does not require an avatar of your own.
                -->
                <div class="world-view-section world-view-section--avatar">
                    <h4>Avatar</h4>
                    <label class="world-view-avatar-toggle">
                        <input
                            type="checkbox"
                            :checked="showMyAvatar"
                            :disabled="!hasLocalAvatar"
                            @change="toggleShowMyAvatar($event)"
                        />
                        Show My Avatar
                    </label>
                    <label class="world-view-avatar-toggle">
                        <input
                            type="checkbox"
                            :checked="showOtherAvatars"
                            @change="toggleShowOtherAvatars($event)"
                        />
                        Show Other Avatars
                    </label>
                    <!--
                        Diagnostics appear only here, never on an avatar: rendering presence and
                        trusting it stay separate.
                    -->
                    <p v-if="showOtherAvatars && remoteAvatarDiagnostics.total > 0" class="world-view-avatar-diagnostics">
                        Other Avatars: {{ remoteAvatarDiagnostics.total }}
                        <span class="world-view-avatar-diagnostics-detail">
                            (<template v-if="remoteAvatarDiagnostics.trusted">{{ remoteAvatarDiagnostics.trusted }} trusted</template><template v-if="remoteAvatarDiagnostics.stale">{{ remoteAvatarDiagnostics.trusted ? ', ' : '' }}{{ remoteAvatarDiagnostics.stale }} stale</template><template v-if="remoteAvatarDiagnostics.conflicting">{{ (remoteAvatarDiagnostics.trusted || remoteAvatarDiagnostics.stale) ? ', ' : '' }}{{ remoteAvatarDiagnostics.conflicting }} conflicting</template><template v-if="remoteAvatarDiagnostics.unavailable">{{ (remoteAvatarDiagnostics.trusted || remoteAvatarDiagnostics.stale || remoteAvatarDiagnostics.conflicting) ? ', ' : '' }}{{ remoteAvatarDiagnostics.unavailable }} unavailable</template>)
                        </span>
                    </p>
                    <!-- A local geometric fact, never announced; shown with Show Other Avatars. -->
                    <NearbyAvatarsPanel
                        v-if="showOtherAvatars"
                        :entries="nearbyAvatars"
                        @select="selectNearbyAvatar"
                    />
                    <label class="world-view-avatar-toggle">
                        <input
                            type="checkbox"
                            :checked="avatarControlMode"
                            :disabled="!hasLocalAvatar"
                            @change="toggleAvatarControlMode($event)"
                        />
                        Control My Avatar (WASD, Shift, Space)
                    </label>
                    <label class="world-view-avatar-toggle">
                        <input
                            type="checkbox"
                            :checked="followAvatar"
                            :disabled="!hasLocalAvatar"
                            @change="toggleFollowAvatar($event)"
                        />
                        Follow Avatar
                    </label>
                    <p v-if="!hasLocalAvatar" class="form-hint form-hint--neutral">
                        Log in and create an avatar (My Avatar) to appear here.
                    </p>
                    <!--
                        Fixed offsets around the avatar; clicking the active one returns to Free.
                        Local only.
                    -->
                    <div class="world-view-camera-perspective">
                        <span class="world-view-camera-perspective-label">Camera</span>
                        <div class="world-view-camera-perspective-buttons">
                            <button
                                type="button"
                                class="action-btn"
                                :class="{ 'action-btn--active': !cameraPerspective }"
                                :disabled="!hasLocalAvatar"
                                @click="setCameraPerspective(null)"
                            >Free</button>
                            <button
                                type="button"
                                class="action-btn"
                                :class="{ 'action-btn--active': cameraPerspective === CameraPerspective.FIRST_PERSON }"
                                :disabled="!hasLocalAvatar"
                                @click="setCameraPerspective(CameraPerspective.FIRST_PERSON)"
                            >First Person</button>
                            <button
                                type="button"
                                class="action-btn"
                                :class="{ 'action-btn--active': cameraPerspective === CameraPerspective.THIRD_PERSON }"
                                :disabled="!hasLocalAvatar"
                                @click="setCameraPerspective(CameraPerspective.THIRD_PERSON)"
                            >Third Person</button>
                            <button
                                type="button"
                                class="action-btn"
                                :class="{ 'action-btn--active': cameraPerspective === CameraPerspective.BIRD_EYE }"
                                :disabled="!hasLocalAvatar"
                                @click="setCameraPerspective(CameraPerspective.BIRD_EYE)"
                            >Bird's-Eye</button>
                        </div>
                    </div>
                </div>

                <div class="world-view-section world-view-section--search">
                    <h4>Search</h4>
                    <WorldSearchPanel
                        :results="searchResults"
                        :catalog-empty="catalogEmpty"
                        @search="performSearch"
                        @focus="focusWorld"
                    />
                </div>

                <div v-if="spatialHover" class="spatial-panel spatial-panel--hover">
                    <h4>Hover</h4>
                    <p class="spatial-type">{{ spatialHover.type }}</p>
                    <p v-if="spatialHover.worldTitle" class="spatial-world">
                        World: {{ spatialHover.worldTitle }}
                        <span class="spatial-author">by {{ spatialHover.worldAuthor }}</span>
                    </p>
                    <p v-if="spatialHover.brickId" class="spatial-id">
                        Brick: {{ spatialHover.brickId.slice(0, 8) }}…
                    </p>
                    <p v-if="spatialHover.position" class="spatial-pos">
                        {{ spatialHover.position.x.toFixed(2) }},
                        {{ spatialHover.position.y.toFixed(2) }},
                        {{ spatialHover.position.z.toFixed(2) }}
                    </p>
                </div>

                <div v-if="spatialInspection" class="spatial-panel spatial-panel--inspection">
                    <h4>Inspection</h4>
                    <p class="spatial-type">{{ spatialInspection.type }}</p>
                    <div v-if="spatialInspection.type === 'brick'" class="inspection-fields">
                        <div class="inspection-row">
                            <span class="inspection-label">Type</span>
                            <span class="inspection-value">{{ spatialInspection.brickType }}</span>
                        </div>
                        <div class="inspection-row">
                            <span class="inspection-label">ID</span>
                            <span class="inspection-value">{{ spatialInspection.brickId.slice(0, 8) }}…</span>
                        </div>
                        <div class="inspection-row">
                            <span class="inspection-label">Local Pos</span>
                            <span class="inspection-value">
                                {{ spatialInspection.localPosition.x.toFixed(2) }},
                                {{ spatialInspection.localPosition.y.toFixed(2) }},
                                {{ spatialInspection.localPosition.z.toFixed(2) }}
                            </span>
                        </div>
                        <div class="inspection-row">
                            <span class="inspection-label">World Pos</span>
                            <span class="inspection-value">
                                {{ spatialInspection.worldPosition.x.toFixed(2) }},
                                {{ spatialInspection.worldPosition.y.toFixed(2) }},
                                {{ spatialInspection.worldPosition.z.toFixed(2) }}
                            </span>
                        </div>
                        <div class="inspection-row">
                            <span class="inspection-label">Rotation</span>
                            <span class="inspection-value">{{ spatialInspection.rotation }}°</span>
                        </div>
                        <div class="inspection-row">
                            <span class="inspection-label">Building</span>
                            <span class="inspection-value">{{ spatialInspection.buildingId.slice(0, 8) }}… ({{ spatialInspection.buildingBrickCount }} bricks)</span>
                        </div>
                        <div class="inspection-row">
                            <span class="inspection-label">World</span>
                            <span class="inspection-value">{{ spatialInspection.worldTitle }}</span>
                        </div>
                        <div class="inspection-row">
                            <span class="inspection-label">Author</span>
                            <span class="inspection-value">{{ spatialInspection.worldAuthor }}</span>
                        </div>
                    </div>
                    <div v-if="spatialInspection.type === 'ground'" class="inspection-fields">
                        <div class="inspection-row">
                            <span class="inspection-label">Position</span>
                            <span class="inspection-value">
                                {{ spatialInspection.position.x.toFixed(2) }},
                                {{ spatialInspection.position.y.toFixed(2) }},
                                {{ spatialInspection.position.z.toFixed(2) }}
                            </span>
                        </div>
                        <div class="inspection-row">
                            <span class="inspection-label">World</span>
                            <span class="inspection-value">{{ spatialInspection.worldTitle }}</span>
                        </div>
                        <div class="inspection-row">
                            <span class="inspection-label">Author</span>
                            <span class="inspection-value">{{ spatialInspection.worldAuthor }}</span>
                        </div>
                    </div>
                    <!-- Read-only fields; the one action, "Open Source", leaves for the Editor. -->
                    <div v-if="spatialInspection.type === 'placement'" class="inspection-fields">
                        <div class="inspection-row">
                            <span class="inspection-label">Source</span>
                            <span class="inspection-value">{{ spatialInspection.sourceTitle }}</span>
                        </div>
                        <div class="inspection-row">
                            <span class="inspection-label">Local Pos</span>
                            <span class="inspection-value">
                                {{ spatialInspection.localPosition.x.toFixed(2) }},
                                {{ spatialInspection.localPosition.y.toFixed(2) }},
                                {{ spatialInspection.localPosition.z.toFixed(2) }}
                            </span>
                        </div>
                        <div class="inspection-row">
                            <span class="inspection-label">World Pos</span>
                            <span class="inspection-value">
                                {{ spatialInspection.worldPosition.x.toFixed(2) }},
                                {{ spatialInspection.worldPosition.y.toFixed(2) }},
                                {{ spatialInspection.worldPosition.z.toFixed(2) }}
                            </span>
                        </div>
                        <div class="inspection-row">
                            <span class="inspection-label">Rotation</span>
                            <span class="inspection-value">{{ spatialInspection.rotation }}°</span>
                        </div>
                        <div class="inspection-row">
                            <span class="inspection-label">Ground Y</span>
                            <span class="inspection-value">{{ spatialInspection.groundY.toFixed(2) }}</span>
                        </div>
                        <div class="inspection-row">
                            <span class="inspection-label">World</span>
                            <span class="inspection-value">{{ spatialInspection.worldTitle }}</span>
                        </div>
                        <div class="inspection-row">
                            <span class="inspection-label">Author</span>
                            <span class="inspection-value">{{ spatialInspection.worldAuthor }}</span>
                        </div>
                    </div>
                    <div class="inspection-actions">
                        <button
                            v-if="spatialInspection.documentId"
                            class="action-btn action-btn--explore"
                            @click="focusWorld(spatialInspection.documentId)"
                        >
                            Focus World
                        </button>
                        <button
                            v-if="spatialInspection.type === 'brick'"
                            class="action-btn action-btn--primary"
                            @click="focusSelection"
                        >
                            Focus Brick
                        </button>
                        <button
                            v-if="spatialInspection.type === 'placement'"
                            class="action-btn action-btn--primary"
                            title="Open the referenced Document in the Editor"
                            @click="openStructureSource(spatialInspection.sourceDocumentId)"
                        >
                            Open Source
                        </button>
                        <button
                            v-if="spatialInspection.documentId"
                            class="action-btn"
                            title="Fork this Document and open the copy in the Editor"
                            @click="editInspectedCopy(spatialInspection)"
                        >
                            Edit a Copy
                        </button>
                    </div>
                </div>

                <DocumentInfoPanel
                    v-if="documentInfo"
                    :info="documentInfo"
                    @edit-metadata="openMetadataEditor(documentInfo)"
                />
                <PlacementInfoPanel
                    v-if="placementInfo"
                    :info="placementInfo"
                    @focus="focusWorld(placementInfo.documentId)"
                    @move="openPlacementEditor(placementInfo)"
                    @remove="removePlacementFromPanel(placementInfo)"
                    @view-here="openLocationDocuments(placementInfo.position)"
                />
                <AvatarInfoPanel
                    v-if="avatarInfo"
                    :info="avatarInfo"
                    :following="followedRemoteAvatarId === avatarInfo.avatarId"
                    @follow="followAvatarFromPanel(avatarInfo.avatarId)"
                    @stop-follow="stopFollowingAvatarFromPanel"
                    @interact="performAvatarInteraction"
                />

                <div v-if="failedWorlds.length > 0" class="world-view-section world-view-section--error">
                    <h4>Unavailable ({{ failedWorlds.length }})</h4>
                    <ul class="world-list world-list--failed">
                        <li v-for="w in failedWorlds" :key="w.documentId" class="world-item world-item--failed">
                            <span class="world-item-title">{{ w.title }}</span>
                            <span class="world-item-author">{{ w.author }}</span>
                        </li>
                    </ul>
                </div>

                <div v-if="loadedWorlds.length > 0" class="world-view-section">
                    <h4>Worlds in View ({{ loadedWorlds.length }})</h4>
                    <ul class="world-list world-list--loaded">
                        <li
                            v-for="w in loadedWorlds"
                            :key="w.documentId"
                            :class="['world-item', { 'world-item--current': w.documentId === $route.params.documentId }]"
                        >
                            <span class="world-item-title">{{ w.title }}</span>
                            <span class="world-item-author">{{ w.author }}</span>
                        </li>
                    </ul>
                </div>

                <div v-if="nearbyWorlds.length > 0" class="world-view-section">
                    <h4>Nearby Worlds</h4>
                    <ul class="world-list world-list--nearby">
                        <li
                            v-for="w in nearbyWorlds"
                            :key="w.documentId"
                            class="world-item world-item--clickable"
                            @click="focusWorld(w.documentId)"
                        >
                            <span class="world-item-title">{{ w.title }}</span>
                            <span class="world-item-author">{{ w.author }}</span>
                        </li>
                    </ul>
                </div>
              </div>
            </div>
            <div ref="viewport" class="world-viewport"></div>
            <ActionFeedback :message="feedbackMessage" :visible="feedbackVisible" />
            <VehicleInteractionPrompt :state="vehicleInteractionState" :store-state="storeInteractionState" />
            <AnimalInteractionPrompt :state="animalInteractionState" />
            <MetadataEditorDialog
                v-if="showMetadataEditor"
                :info="metadataEditTarget"
                @save="onSaveMetadata"
                @cancel="showMetadataEditor = false; metadataEditTarget = null"
            />
            <HistoryTimelinePanel
                v-if="showHistoryPanel"
                :timeline="historyTimeline"
                :selected-entry-id="selectedHistoryEntryId"
                :preview-cursor="historyPreviewCursor"
                @select="selectHistoryEntry"
                @preview="previewSelectedHistoryEntry"
                @cancel-preview="cancelHistoryPreviewAction"
                @restore="restoreSelectedHistoryEntry"
                @cancel="closeHistoryPanel"
            />
            <PlacementEditorDialog
                v-if="showPlacementEditor"
                :info="placementEditTarget"
                :overlap-warning="placementOverlapWarning"
                @move="onMovePlacement"
                @cancel="closePlacementEditor"
            />
            <LocationDocumentsDialog
                v-if="showLocationDocuments"
                :position="locationDocumentsPosition"
                :occupants="locationDocumentsOccupants"
                @focus="focusLocationDocument"
                @cancel="closeLocationDocuments"
            />
            <WorldLocationBrowser
                v-if="showLocationBrowser"
                :center="locationBrowserCenter"
                :radius="locationBrowserRadius"
                :documents="locationBrowserDocuments"
                :diagnostics="locationBrowserDiagnostics"
                :inspected="locationBrowserInspected"
                :catalog-empty="catalogEmpty"
                @explore="reExploreLocationBrowser"
                @focus="focusLocationBrowserResult"
                @select="selectLocationBrowserResult"
                @inspect="inspectLocationBrowserResult"
                @cancel="closeLocationBrowser"
            />
            <LocationsPanel
                v-if="showLocationsPanel"
                :locations="worldLocations"
                :can-edit="canEditActiveWorld"
                @focus="focusLocation"
                @inspect="openFocusForLocation"
                @cancel="closeLocationsPanel"
                @add-landmark="openAddLandmarkForm"
                @edit-landmark="openEditLandmarkForm"
                @remove-landmark="removeLandmarkFromPanel"
                @add-region="openAddRegionForm"
                @edit-region="openEditRegionForm"
                @remove-region="removeRegionFromPanel"
                @manage-names="openNamingPanel"
            />
            <LandmarkFormModal
                v-if="showLandmarkForm"
                :landmark="landmarkFormTarget"
                @save="onSaveLandmarkForm"
                @cancel="closeLandmarkForm"
            />
            <RegionFormModal
                v-if="showRegionForm"
                :region="regionFormTarget"
                @save="onSaveRegionForm"
                @cancel="closeRegionForm"
            />
            <PlaceNamingPanel
                v-if="showNamingPanel"
                :region-id="namingPanelRegionId"
                :region-name="(worldLocations.find(l => l.id === namingPanelRegionId) || {}).title || ''"
                :naming-view="namingPanelView"
                :claims="namingPanelClaims"
                :preferred-name="namingPanelPreferredName"
                :geographic-regions="namingPanelGeographicRegions"
                :geographic-naming-view="namingPanelGeographicView"
                :my-identity-id="myIdentityId"
                :can-publish-to-nostr="canPublishPlaceNamingClaimToNostr"
                :publish-to-nostr-claim-id="namingPanelPublishToNostrClaimId"
                :publish-to-nostr-executing="namingPanelPublishToNostrExecuting"
                :publish-to-nostr-error="namingPanelPublishToNostrError"
                :publish-to-nostr-result="namingPanelPublishToNostrResult"
                @publish-name="publishNamingClaim"
                @retract-name="retractNamingClaim"
                @set-preferred-name="setPreferredNamingName"
                @clear-preferred-name="clearPreferredNamingName"
                @export-claim="exportNamingClaim"
                @import-claim="importNamingClaim"
                @publish-to-nostr="publishNamingClaimToNostr"
                @cancel="closeNamingPanel"
            />
            <WorldMapPanel
                v-if="showMapPanel"
                :content="mapContent"
                :highlight-region-keys="mapHighlightRegionKeys"
                @focus-location="focusLocation"
                @focus-collaborator="followCollaborator"
                @cancel="closeMapPanel"
            />
            <GeographicPlaceDirectoryPanel
                v-if="showGeographicPlaceDirectory"
                :places="geographicPlaces"
                :nearby="nearbyGeographicPlaces"
                @open-place="openGeographicPlace"
                @go-to-place="goToGeographicPlace"
                @cancel="closeGeographicPlaceDirectory"
            />
            <GeographicPlacePanel
                v-if="showGeographicPlacePanel"
                :place="geographicPlace"
                @focus-region="focusLocation"
                @open-names="openNamesFromPlace"
                @show-on-map="showGeographicPlaceOnMap"
                @go-to-place="goToGeographicPlace(geographicPlace.fingerprintKey)"
                @cancel="goBackInPlaces"
            />
            <WorldWelcomePanel
                v-if="showWelcomePanel"
                :context="welcomeContext"
                :is-arrival="welcomeIsArrival"
                :returning="welcomeIsReturning"
                :last-visited-at="worldReturnInfo && worldReturnInfo.lastVisitedAt"
                @explore="exploreWelcomeSuggestion"
                @go-to-place="goToGeographicPlace"
                @dismiss="closeWelcomePanel"
            />
            <WorldFocusPanel
                v-if="showFocusPanel"
                :context="focusContext"
                @go="goFromFocusPanel"
                @show-on-map="showFocusOnMap"
                @open-names="openNamesFromFocusPanel"
                @edit-copy="editFocusedCopyFromFocusPanel"
                @cancel="closeFocusPanel"
            />
            <WorldMembersPanel
                v-if="showMembersPanel"
                :roster="worldCollaborationRoster"
                :is-owner="isActiveWorldOwner"
                :pending-identity-id="collaborationPendingIdentityId"
                @grant="grantWorldMember"
                @revoke="revokeWorldMember"
                @cancel="closeMembersPanel"
            />
            <NotificationHistoryPanel
                v-if="showNotificationHistoryPanel"
                :getRecipientNotificationEventsCommand="getRecipientNotificationEventsCommand"
                :viewPublicationCommand="viewNotificationPublicationCommand"
                @cancel="closeNotificationHistoryPanel"
            />
            <!--
                Coordinates and compass float over the viewport, transparent so the World
                stays dominant.
            -->
            <div v-if="cameraPosition" class="world-view-nav-hud">
                <p class="world-view-nav-hud-coords">
                    {{ cameraPosition.x.toFixed(1) }}, {{ cameraPosition.y.toFixed(1) }}, {{ cameraPosition.z.toFixed(1) }}
                </p>
                <div class="world-view-nav-hud-compass">
                    <CompassIndicator :heading="compassHeading" :markers="compassMarkers" />
                </div>
                <!--
                    The human-named place, shown above the derived terrain description and never
                    merged with it (docs/Principles.md, "Users Name Places; The World Derives
                    Geography From Names").
                -->
                <div v-if="spatialContext && spatialContext.placeName" class="world-view-nav-context world-view-nav-context--place">
                    {{ spatialContext.placeName }}
                </div>
                <div v-if="spatialContext && spatialContext.description" class="world-view-nav-context">
                    {{ spatialContext.description }}
                </div>
                <!-- Readable legend for the compass markers: the dial has no room for labels. -->
                <div v-if="spatialContext && spatialContext.nearbyStructures && spatialContext.nearbyStructures.length > 0" class="world-view-nav-markers">
                    <div v-for="structure in spatialContext.nearbyStructures.slice(0, 3)" :key="structure.id" class="world-view-nav-marker">
                        <span class="marker-direction">{{ structure.direction }}</span>
                        <span class="marker-label">{{ structure.title }} ({{ structure.distance }}m)</span>
                    </div>
                </div>
                <div v-if="spatialContext && spatialContext.nearbyCollaborators && spatialContext.nearbyCollaborators.length > 0" class="world-view-nav-markers">
                    <div v-for="collab in spatialContext.nearbyCollaborators.slice(0, 3)" :key="collab.identityId" class="world-view-nav-marker collaborator">
                        <span class="marker-direction">{{ collab.direction }}</span>
                        <span class="marker-label">{{ collab.displayName }} ({{ collab.distance }}m)</span>
                    </div>
                </div>
                <div v-if="spatialContext && spatialContext.nearbyLandmarks && spatialContext.nearbyLandmarks.length > 0" class="world-view-nav-markers">
                    <div v-for="landmark in spatialContext.nearbyLandmarks.slice(0, 3)" :key="landmark.id" class="world-view-nav-marker landmark">
                        <span class="marker-direction">{{ landmark.direction }}</span>
                        <span class="marker-label">★ {{ landmark.title }} ({{ landmark.distance }}m)</span>
                    </div>
                </div>
                <div v-if="nearbyGeographicPlaces && nearbyGeographicPlaces.length > 0" class="world-view-nav-markers">
                    <div v-for="place in nearbyGeographicPlaces.slice(0, 3)" :key="place.fingerprintKey" class="world-view-nav-marker place">
                        <span class="marker-direction">{{ place.direction }}</span>
                        <span class="marker-label">⬢ {{ place.displayName }} ({{ place.distance }}m)</span>
                    </div>
                </div>
            </div>
        </div>
    `
};
