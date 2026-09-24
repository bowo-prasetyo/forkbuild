import { RenderWorldViewUseCase } from './RenderWorldViewUseCase.js';
import { SpatialSelectionState } from '../spatial-state/SpatialSelectionState.js';
import { SpatialHoverState } from '../spatial-state/SpatialHoverState.js';
import { SpatialCameraController } from './SpatialCameraController.js';
import { SpatialInspectionService } from '../editor/SpatialInspectionService.js';
import { SpatialInspectionState } from '../spatial-state/SpatialInspectionState.js';
import { SpatialEditingContext } from '../spatial-state/SpatialEditingContext.js';
import { EventBus } from '../../core/events/EventBus.js';
import { SpatialAllocationPolicy } from '../../core/SpatialAllocationPolicy.js';
import { VehicleRuntimeInstances } from './VehicleRuntimeInstances.js';
import { AnimalRuntimeInstances, ANIMAL_RENDER_RADIUS } from './AnimalRuntimeInstances.js';
import { AvatarInventoryStore } from '../avatar/AvatarInventoryStore.js';
import { AvatarInventoryTransferPeerExchange } from '../avatar/AvatarInventoryTransferPeerExchange.js';
import { AvatarInteractionState } from '../spatial-state/AvatarInteractionState.js';
import { WorldLocationDirectory } from './WorldLocationDirectory.js';
import { installMethods } from '../../utils/installMethods.js';
import { localAvatarMethods } from '../worldNavigation/localAvatarMethods.js';
import { avatarPresenceMethods } from '../worldNavigation/avatarPresenceMethods.js';
import { placeQueryMethods } from '../worldNavigation/placeQueryMethods.js';
import { worldExperienceMethods } from '../worldNavigation/worldExperienceMethods.js';
import { collaborationMethods } from '../worldNavigation/collaborationMethods.js';
import { placementMethods } from '../worldNavigation/placementMethods.js';
import { forkOnWriteMethods } from '../worldNavigation/forkOnWriteMethods.js';
import { worldContentMethods } from '../worldNavigation/worldContentMethods.js';
import { placeNamingMethods } from '../worldNavigation/placeNamingMethods.js';
import { documentHistoryMethods } from '../worldNavigation/documentHistoryMethods.js';
import { navigationMethods } from '../worldNavigation/navigationMethods.js';
import { selectionMethods } from '../worldNavigation/selectionMethods.js';
import { stateQueryMethods } from '../worldNavigation/stateQueryMethods.js';
import { worldStreamingMethods } from '../worldNavigation/worldStreamingMethods.js';
import { documentOperationMethods } from '../worldNavigation/documentOperationMethods.js';

// Throttle for runtime vehicle/animal persistence. A ridden vehicle moves
// every frame; one snapshot per second is indistinguishable after a reload.
const RUNTIME_PLACEMENT_PERSISTENCE_INTERVAL_MS = 1000;

// World View observes and navigates; the Editor mutates and builds (see
// docs/Principles.md, "World View Observes and Navigates; Editor Mutates and
// Builds"). selectAll()/getSelectionCount()/pick()/hover()/marqueeSelect()/
// clearSelection() remain because they drive focus and inspection, not
// mutation. Region/Landmark naming also stays: naming a place is annotation,
// not construction. The one door out is "Edit a Copy"
// (ui/views/WorldView.js#editFocusedCopyFromFocusPanel()), which reuses the
// `/editor?fork=` entry point PublicationCatalog.js#forkPublication() already
// uses to hand the Document to the Editor.
export class WorldNavigationSession {
    constructor({
        registry,
        loadPublicationDocumentUseCase,
        // Read-through material bridge, consulted only by _loadWorld()'s fallback
        // when a documentId surfaced by worldLayoutProvider has no local copy.
        // Without it, _loadWorld() fails for documents this replica doesn't hold.
        loadPublishedWorldSessionUseCase = null,
        worldLayoutProvider,
        saveDocumentUseCase = null,
        publishDocumentUseCase = null,
        replayDocumentUseCase = null,
        restoreHistoryStateUseCase = null,
        identityProvider = null,
        documentCloneService = null,
        discoveryProvider = null,
        // Optional discovery provider consulted only by getPublicationForDocument()/
        // findPublicationById(). It is kept separate from `discoveryProvider`:
        // widening that shared provider to include Repository-admitted Publications
        // would extend fork-policy license enforcement to never-published local
        // documents that merely share a documentId. Falls back to
        // `discoveryProvider` when not supplied.
        publicationActionDiscoveryProvider = null,
        // The same PlacePublicationUseCase CreateWorldViewUseCase builds for
        // automatic initial placement, used here for explicit placePublication()
        // calls. Without it, a session can't place a Publication explicitly.
        placePublicationUseCase = null,
        placementRegistry = null,
        moveWorldPlacementUseCase = null,
        // Optional; without it a session can't remove a placement. See
        // removePlacement().
        removeWorldPlacementUseCase = null,
        // Removes the Publication itself from the catalog, a different authority
        // from removing a Placement (see docs/Principles.md, "A Publication Is What;
        // A Placement Is Where"). Without it a session can't unpublish; see
        // unpublishDocument().
        unpublishDocumentUseCase = null,
        // Read/write pair for publication commentary. Without them the session
        // reports empty commentary and refuses to create any.
        getPublicationCommentariesUseCase = null,
        addPublicationCommentaryUseCase = null,
        // Without it the session reports no notification history; see
        // getRecipientNotificationEvents().
        getRecipientNotificationEventsUseCase = null,
        spatialAllocationPolicy = SpatialAllocationPolicy.WARN,
        searchWorldUseCase = null,
        spatialDiscoveryProvider = null,
        avatarProfileUseCase = null,
        avatarPresenceSession = null,
        presenceBroadcastProvider = null,
        avatarTemplateRegistry = null,
        presenceVisibilityUseCase = null,
        avatarProfileBroadcastProvider = null,
        avatarInteractionBroadcastProvider = null,
        avatarProfileVisibilityUseCase = null,
        hasFriend = null,
        isBlocked = null,
        // Without structureResolver, StructurePlacements aren't rendered; without
        // loadDocumentUseCase, a placement shows its raw documentId instead of a
        // title (see getSavedDocumentTitle()). Neither case throws.
        structureResolver = null,
        loadDocumentUseCase = null,
        // Without it every loaded document is treated as editable; see
        // canEditDocument()/canReadDocument(). Real wiring wraps
        // application/identity/WorldAuthorizationService.js.
        worldAuthorizationService = null,
        // When wired, every CommandHistory this session creates is registered with
        // it (see _registerCommandHistory()), so every forward local mutation is
        // broadcast to authenticated peers without touching each mutation call site.
        // Undo/redo are never broadcast. Without it, editing is purely local.
        worldCommandPropagation = null,
        // worldMembershipUseCase backs grantWorldEdit()/revokeWorldEdit()/
        // listWorldMembers(); without it canEditDocument() falls back to ownership.
        // worldPresenceUseCase backs enterWorldPresence()/leaveWorldPresence()/
        // getWorldPresenceRoster(); without it presence is never advertised.
        worldMembershipUseCase = null,
        worldPresenceUseCase = null,
        // Without it spatial presence is never advertised or observed; see
        // enterWorldSpatialPresence()/syncWorldSpatialPresence()/
        // leaveWorldSpatialPresence().
        worldSpatialPresenceUseCase = null,
        // Without it no camera framing is remembered or restored. See
        // application/world/LocalWorldExperienceStore.js and "Local World Experience &
        // Return" below.
        localWorldExperienceStore = null,
        // Without these a session can't publish/retract/read naming claims or local
        // name preferences. Kept separate: a claim is signed, shared content; a
        // preference is unsigned, local-only state.
        placeNamingClaimUseCase = null,
        localNamePreferenceStore = null,
        // Without it a session can't export/import a naming claim. See
        // application/placeNaming/PlaceNamingClaimExchange.js.
        placeNamingClaimExchange = null,
        // Optional persistence for avatar inventory, vehicles and animals. Without
        // them those stay session-local. When wired, the constructor rehydrates from
        // the last save and _setupVehicleRuntimePersistence()/
        // _setupAnimalRuntimePersistence() keep saving as the World changes.
        avatarInventoryPersistenceStore = null,
        vehicleRuntimeInstancePersistenceStore = null,
        animalRuntimeInstancePersistenceStore = null,
        // The app-wide peer bus and registry every other peer collaborator shares,
        // never a second transport. Without them there is no
        // avatarInventoryTransferPeerExchange(): sending a carried entry is
        // unavailable rather than silently broken.
        peerMessageBus = null,
        connectedPeerRegistry = null
    }) {
        this._registry = registry;
        this._loadPublicationDocumentUseCase = loadPublicationDocumentUseCase;
        this._loadPublishedWorldSessionUseCase = loadPublishedWorldSessionUseCase;
        this._worldLayoutProvider = worldLayoutProvider;
        this._saveDocumentUseCase = saveDocumentUseCase;
        this._publishDocumentUseCase = publishDocumentUseCase;
        this._replayDocumentUseCase = replayDocumentUseCase;
        this._restoreHistoryStateUseCase = restoreHistoryStateUseCase;
        this._identityProvider = identityProvider;
        this._documentCloneService = documentCloneService;
        // Where a published world sits in shared space, a separate concern from the
        // publication (see docs/Principles.md, "A Publication Is What; A Placement Is
        // Where"). Without these a session can't resolve or move a placement.
        this._placementRegistry = placementRegistry;
        this._placePublicationUseCase = placePublicationUseCase;
        this._moveWorldPlacementUseCase = moveWorldPlacementUseCase;
        this._removeWorldPlacementUseCase = removeWorldPlacementUseCase;
        this._unpublishDocumentUseCase = unpublishDocumentUseCase;
        this._getPublicationCommentariesUseCase = getPublicationCommentariesUseCase;
        this._addPublicationCommentaryUseCase = addPublicationCommentaryUseCase;
        this._getRecipientNotificationEventsUseCase = getRecipientNotificationEventsUseCase;
        // Policy for explicit, interactive placement (checkPlacementOverlap/
        // movePlacement); see core/SpatialAllocationPolicy.js. Automatic initial
        // placement always behaves as ALLOW: placement never blocks a publish.
        this._spatialAllocationPolicy = spatialAllocationPolicy;
        // Without it a session can't search.
        this._searchWorldUseCase = searchWorldUseCase;
        // Optional trust-capable provider, consulted only for diagnostics in
        // exploreLocation/exploreHere/whatsHere, never to resolve documents (live
        // placement data comes from the placement registry). A replica with a real
        // decentralized index can report on it; others report "no trust layer
        // available". See docs/Principles.md, "Diagnostics Are Received From The
        // Discovery Layer, Never Invented By The UI".
        this._spatialDiscoveryProvider = spatialDiscoveryProvider;
        // Both null when nobody is logged in; the session then renders no local
        // avatar.
        this._avatarProfileUseCase = avatarProfileUseCase;
        this._avatarPresenceSession = avatarPresenceSession;
        this._avatarProfileSubscription = null;
        this._avatarPresenceSubscription = null;
        this._localAvatarVisible = true;
        // Only constructed once an avatar exists; see "Local Avatar Movement" below.
        this._avatarMovementController = null;
        // Mount/dismount controller, built with the avatar and ticked on the same
        // frame. Each frame, after its tick and before the movement controller's,
        // this session resolves the mounted vehicle's movement capability and hands
        // it to `_avatarMovementController.setMovementCapability()`. Neither
        // controller depends on the other; this session composes them.
        this._avatarVehicleInteractionController = null;
        // Built with the avatar in _setupLocalAvatar(); catching needs an avatar.
        this._avatarAnimalInteractionController = null;
        // Mounted vehicle movement. Reads and commits the vehicle's position through
        // `_vehicleRuntimeInstances` rather than an AvatarPresenceSession. See the
        // frame loop below for the "vehicle moves, avatar follows" ordering.
        this._avatarVehicleMovementController = null;
        // The current steering request: a VehicleSteeringIntent, or null for "no
        // request" (distinct from `VehicleSteeringDirection.NONE`; see
        // `setVehicleSteeringIntent()`). Passed verbatim to the vehicle movement
        // controller's tick every frame.
        this._vehicleSteeringIntent = null;
        this._avatarFrameSubscription = null;
        this._avatarControlModeActive = false;
        // Physical Alt key hold state for core/AvatarContinuousMovementInputAdapter.js.
        // The resulting intent lives only in `_avatarMovementController`; this is
        // never a second copy of it.
        this._altDown = false;
        // Physical Shift key hold state, tracked like `_altDown`. The resulting
        // NONE/WALK/RUN mode lives only in `_avatarMovementController`.
        this._shiftDown = false;
        // Raw physical hold bits for the steering keys, so a new press can be told
        // from a key-repeat (steering is a discrete pulse; see
        // core/VehicleSteeringInputAdapter.js). The request itself lives only in
        // `_vehicleSteeringIntent`.
        this._vehicleSteerLeftHeld = false;
        this._vehicleSteerRightHeld = false;
        // Rising-edge tracking for 'G': decorating is one-shot, so a held key's
        // repeat keydowns must not re-trigger it.
        this._decorateKeyHeld = false;
        this._followAvatarEnabled = false;
        this._lastAvatarFollowPosition = null;
        // `null` means off (the free/orbit camera). Local UI state only: never
        // persisted, signed or broadcast (see docs/Principles.md, "Camera
        // Perspective Is Local Perception, Never Shared Reality"). See
        // setCameraPerspective().
        this._cameraPerspective = null;
        // Without a broadcast provider, presence is never published or received;
        // without a template registry, remote presence is received but no visual is
        // created, since there's no way to resolve its look. See "Remote Avatar
        // Presence" below.
        this._presenceBroadcastProvider = presenceBroadcastProvider;
        this._avatarTemplateRegistry = avatarTemplateRegistry;
        // Without it the session always advertises (see the publish gate in
        // _setupLocalAvatar()).
        this._presenceVisibilityUseCase = presenceVisibilityUseCase;
        // Profile's own publish gate: when wired, profile publishing consults only
        // this policy (see docs/Principles.md, "Profile Gets Its Own Publication
        // Gate, Superseding The Shared One"). Without it, profile falls back to the
        // shared presence gate; see _publishLocalAvatarProfile().
        this._avatarProfileVisibilityUseCase = avatarProfileVisibilityUseCase;
        // Zero-arg predicate "do I have at least one mutual friend", re-checked on
        // every publish and never cached. Feeds the visibility policies'
        // `{ hasFriend }` context via _hasFriendContext(). Without it, FRIENDS with
        // no authorized peers behaves like HIDDEN at this coarse gate.
        this._hasFriend = hasFriend;
        // Receiver-side block predicate `(identityId) => boolean`, wired into each
        // avatar-social trust boundary in _setupRemoteAvatars() so a blocked
        // identity's claims are rejected at ingestion however valid they are. The
        // sender-side gate is wired separately in CreateWorldViewUseCase. Without it,
        // every trust boundary defaults to `isBlocked: () => false`.
        this._isBlocked = isBlocked;
        this._presenceSyncService = null;
        this._remoteAvatarRegistry = null;
        this._presencePublishSubscription = null;
        this._remoteAvatarFrameSubscription = null;
        this._remoteAvatarsVisible = true;
        // Without it no profile data is published or received; remote avatars
        // render with the placeholder appearance. See "Remote Avatar Appearance"
        // below.
        this._avatarProfileBroadcastProvider = avatarProfileBroadcastProvider;
        this._avatarProfileSyncService = null;
        this._remoteAvatarAppearanceRegistry = null;
        // Reset on every explicit profile edit and read by the periodic republish
        // check. 0 means "never published", so the first frame publishes
        // immediately.
        this._lastProfilePublishAt = 0;
        // Refreshed on every accepted presence update and read by the heartbeat
        // check (see PRESENCE_HEARTBEAT_INTERVAL_MS). 0 means "never published".
        this._lastPresenceUpdateAt = 0;
        // `_avatarInteraction` is its own state slice, never part of
        // `_spatialSelection` (see docs/Principles.md, "Avatars Are Never Document
        // Selection"). `_followedRemoteAvatarId` follows a remote avatar;
        // `_followAvatarEnabled` follows the local one. The two are mutually
        // exclusive because there is one camera.
        this._avatarInteraction = AvatarInteractionState.empty();
        this._followedRemoteAvatarId = null;
        this._lastFollowedRemotePosition = null;
        // One shared cooldown for GREET/WAVE/POINT (see
        // core/AvatarInteractionCooldown.js). 0 means the first gesture is always
        // allowed.
        this._lastInteractionPerformedAt = 0;
        // Without a provider, interaction events are never published or received; a
        // gesture still happens locally. `_localInteractionSequence` is a separate
        // counter from AvatarPresence's `sequence` (see
        // core/AvatarInteractionAdvertisement.js). `_remoteAvatarGestureExpiry` maps
        // avatarId to when a received remote gesture should clear; see
        // _applyRemoteAvatarInteraction/_expireRemoteAvatarGestures.
        this._avatarInteractionBroadcastProvider = avatarInteractionBroadcastProvider;
        this._avatarInteractionSyncService = null;
        this._localInteractionSequence = 0;
        this._remoteAvatarGestureExpiry = new Map();
        // Raw DiscoveryDiagnostics from the most recent
        // exploreLocation/exploreHere/whatsHere call — kept alongside
        // the summarized version so inspectDocument can look up a
        // specific document's own TrustObservation (summarizing throws
        // away per-record detail on purpose; the raw copy is what makes
        // that detail available again, on demand, without re-querying).
        this._lastDiscoveryDiagnosticsRaw = null;

        this._structureResolver = structureResolver;
        this._loadDocumentUseCase = loadDocumentUseCase;

        this._worldAuthorizationService = worldAuthorizationService;

        // `_commandHistoryUnsubscribes` mirrors `_commandHistories` key for key, so a
        // replaced or removed CommandHistory stops broadcasting.
        this._worldCommandPropagation = worldCommandPropagation;
        this._commandHistoryUnsubscribes = new Map();

        this._worldMembershipUseCase = worldMembershipUseCase;
        this._worldPresenceUseCase = worldPresenceUseCase;
        // Worlds this session has explicitly entered presence for — so
        // dispose() can broadcast an honest LEAVE for each rather than
        // relying solely on the eventual connection-drop pruning every
        // OTHER replica's own WorldPresenceUseCase already performs.
        this._presentWorldDocumentIds = new Set();

        this._worldSpatialPresenceUseCase = worldSpatialPresenceUseCase;
        // Worlds with spatial presence entered, so dispose() can broadcast a LEAVE
        // for each. Separate from `_presentWorldDocumentIds`: neither protocol
        // implies the other.
        this._presentSpatialWorldDocumentIds = new Set();
        // documentId -> unsubscribe for this session's onSpatialPresenceChanged()
        // listener, which drives `this._session.setRemoteSpatialPresence()`. The
        // application layer drives the render facade; WorldView.js never touches the
        // renderer for this.
        this._spatialPresenceRenderSubscriptions = new Map();
        // documentId -> Set(deviceId) currently rendered, so a device
        // that drops out of a later roster snapshot can be explicitly
        // removed from the scene rather than left as a stale marker.
        this._spatialPresenceRenderedDevices = new Map();

        this._localWorldExperienceStore = localWorldExperienceStore;

        this._placeNamingClaimUseCase = placeNamingClaimUseCase;
        this._localNamePreferenceStore = localNamePreferenceStore;
        this._placeNamingClaimExchange = placeNamingClaimExchange;

        this._container = null;
        this._session = null;
        this._spatialCameraController = null;
        this._loadedDocuments = new Map();
        this._commandHistories = new Map();
        // Brick/structure/group mutation lives in EditorSession (see
        // docs/Principles.md, "World View Observes and Navigates; Editor Mutates and
        // Builds"). SpatialInspectionService stays, read-only. `_commandHistories`
        // stays because Region/Landmark naming still routes fork-on-write and
        // undo/redo through it.
        this._inspectionService = new SpatialInspectionService(this);
        this._failedLoads = new Map();
        this._spatialSelection = SpatialSelectionState.empty();
        this._spatialHover = SpatialHoverState.empty();
        this._spatialInspection = SpatialInspectionState.empty();
        // Two independent concepts (see docs/Principles.md, "Camera Focus, Active
        // Document, and Selection Are Three Different Things"):
        //   _focusedDocumentId — where the CAMERA is navigated to.
        //   _activeDocumentId  — which document receives document-level
        //                        actions and mutation fallbacks.
        // Every mutation path reads _activeDocumentId, so where the camera happens
        // to point never decides what gets edited.
        this._focusedDocumentId = null;
        this._activeDocumentId = null;
        // Stable home pointer. _focusedDocumentId is cleared when its document
        // streams out of range, but wandering far away is exactly when Home is
        // needed. Set once by _loadWorld() and cleared only by dispose().
        this._homeDocumentId = null;
        this._eventBus = null;
        this._discoveryProvider = discoveryProvider;
        // Falls back to `discoveryProvider` when no separate provider is supplied.
        this._publicationActionDiscoveryProvider = publicationActionDiscoveryProvider || discoveryProvider;

        // documentIds loaded straight from a publication: immutable here, enforced by
        // intercepting mutation entry points. An id leaves the set once superseded by
        // a fork or created fresh by forkDocument()/cloneDocument(). See
        // docs/Principles.md, "A published snapshot is never mutated in place".
        this._publishedDocumentIds = new Set();

        // A lazily-created fork is unknown to the discovery/layout providers, which
        // breaks two things:
        //   1. Streaming unload only protects dirty documents, so a saved fork
        //      would vanish on the next camera move.
        //   2. worldLayoutProvider.getPosition(forkId) has nothing to look up, so
        //      later position lookups (the gizmo pivot) drift from the bricks.
        // _localOnlyDocumentIds pins forks against unload; _localPositions keeps the
        // position inherited from the source.
        this._localOnlyDocumentIds = new Set();
        this._localPositions = new Map();

        // Set by _forkForEdit, cleared by consumeForkNotice(). A drain rather than
        // an event: the UI already polls session state after each interaction.
        this._pendingForkNotice = null;

        // `_worldLocationDirectory` is stateless and reused for every call.
        // `_activeCameraFocus` is null unless a goHome()/focusLocation() animation
        // is in flight, else `{ animator, startedAt }`, advanced each frame by
        // `_tickCameraFocus`.
        this._worldLocationDirectory = new WorldLocationDirectory(this);
        this._activeCameraFocus = null;
        this._cameraFocusFrameSubscription = null;
        // See _setupVehicleRendering() below.
        this._vehicleRenderFrameSubscription = null;
        // Runtime vehicle positions (see application/world/VehicleRuntimeInstances.js).
        // Built unconditionally: a vehicle's position is a fact about the World,
        // independent of whether a local avatar exists (see docs/Principles.md,
        // "Watching Presence Never Requires Having One").
        this._vehicleRuntimeInstances = new VehicleRuntimeInstances();
        // Kept as a field so _setupVehicleRuntimePersistence() can keep saving.
        // Seeding uses only VehicleRuntimeInstances' public add()/discard().
        this._vehicleRuntimeInstancePersistenceStore = vehicleRuntimeInstancePersistenceStore;
        if (this._vehicleRuntimeInstancePersistenceStore) {
            const { instances, excludedIds } = this._vehicleRuntimeInstancePersistenceStore.load();
            for (const instance of instances) {
                this._vehicleRuntimeInstances.add(instance);
            }
            for (const id of excludedIds) {
                this._vehicleRuntimeInstances.discard(id);
            }
        }
        // Animal counterpart of `_vehicleRuntimeInstances`; see
        // application/world/AnimalRuntimeInstances.js.
        this._animalRuntimeInstances = new AnimalRuntimeInstances();
        // Animal counterpart of `_vehicleRuntimeInstancePersistenceStore`.
        this._animalRuntimeInstancePersistenceStore = animalRuntimeInstancePersistenceStore;
        if (this._animalRuntimeInstancePersistenceStore) {
            const { instances, excludedIds } = this._animalRuntimeInstancePersistenceStore.load();
            for (const instance of instances) {
                this._animalRuntimeInstances.add(instance);
            }
            for (const id of excludedIds) {
                this._animalRuntimeInstances.excludeId(id);
            }
        }
        // The one AvatarInventory owner both interaction controllers are handed
        // (see application/avatar/AvatarInventoryStore.js). Built unconditionally, before
        // either controller exists. The optional persistence store is passed
        // straight through; AvatarInventoryStore rehydrates and saves itself.
        this._avatarInventoryStore = new AvatarInventoryStore(avatarInventoryPersistenceStore);
        // Bound to the same `_avatarInventoryStore`, never a second owner. Only
        // built when a real peer stack is wired; otherwise null.
        this._avatarInventoryTransferPeerExchange = (peerMessageBus && connectedPeerRegistry)
            ? new AvatarInventoryTransferPeerExchange(this._avatarInventoryStore, peerMessageBus, connectedPeerRegistry)
            : null;
        // See _setupWildlifeExclusionSync() below.
        this._wildlifeExclusionSyncFrameSubscription = null;
        // See _setupVehicleRuntimePersistence()/_setupAnimalRuntimePersistence().
        this._vehicleRuntimePersistenceFrameSubscription = null;
        this._animalRuntimePersistenceFrameSubscription = null;
        // `0` so the first frame after construction may save.
        this._lastVehicleRuntimeSaveAt = 0;
        this._lastAnimalRuntimeSaveAt = 0;
    }

    // The one place a CommandHistory enters `_commandHistories`, so a wired
    // `worldCommandPropagation` makes every mutation pathway broadcast without
    // changing any call site. Replacing a history for the same worldId (fork,
    // clone, restoreHistoryAt) tears down the old subscription first.
    _registerCommandHistory(worldId, history) {
        this._unregisterCommandHistory(worldId);
        this._commandHistories.set(worldId, history);
        if (this._worldCommandPropagation) {
            const unsubscribe = this._worldCommandPropagation.attachCommandHistory({
                worldDocumentId: worldId,
                commandHistory: history
            });
            this._commandHistoryUnsubscribes.set(worldId, unsubscribe);
        }
        return history;
    }

    // Mirror of _registerCommandHistory(): a history this session no longer owns
    // stops broadcasting immediately.
    _unregisterCommandHistory(worldId) {
        const unsubscribe = this._commandHistoryUnsubscribes.get(worldId);
        if (unsubscribe) {
            unsubscribe();
            this._commandHistoryUnsubscribes.delete(worldId);
        }
        this._commandHistories.delete(worldId);
    }

    start(container) {
        this.dispose();
        this._container = container;
        this._eventBus = new EventBus();
        this._session = new RenderWorldViewUseCase().execute(
            container,
            this._registry,
            this._eventBus,
            // structureResolver lets World View render (and so pick/inspect)
            // StructurePlacements. gestureService is always null: World View owns no
            // gizmo kernel, and the gizmo controller's null guards make that a no-op.
            { gestureService: null, structureResolver: this._structureResolver }
        );
        this._spatialCameraController = new SpatialCameraController(this._session);
        this._inspectionService = new SpatialInspectionService(this);
        // Remote avatars first: _setupLocalAvatar()'s presence
        // subscription publishes THROUGH _presenceSyncService, so it
        // must already exist by the time that subscription is wired.
        this._setupRemoteAvatars();
        this._setupLocalAvatar();
        this._setupCameraFocusAnimation();
        this._setupVehicleRendering();
        this._setupWildlifeExclusionSync();
        this._setupAnimalRendering();
        this._setupVehicleRuntimePersistence();
        this._setupAnimalRuntimePersistence();
    }

    // Independent of _setupLocalAvatar(): vehicles are a fact about the World,
    // so a logged-out spectator still sees vehicles near the camera (see
    // docs/Principles.md, "Watching Presence Never Requires Having One").
    //
    // A reconcile every frame, never a bare requery: calling
    // nearbyVehicleInstances() directly would overwrite a moving vehicle's
    // runtime position with its fixed spawn point. `_vehicleRuntimeInstances.sync()`
    // uses the same deterministic bridge to discover vehicles but never
    // overwrites a known current position. The query is a few cheap hash
    // evaluations per frame.
    //
    // Absent when the render facade lacks onAnimationFrame or syncVehicles.
    _setupVehicleRendering() {
        if (typeof this._session.onAnimationFrame !== 'function' || typeof this._session.syncVehicles !== 'function') {
            return;
        }
        this._vehicleRenderFrameSubscription = this._session.onAnimationFrame(() => {
            const position = this.getAvatarPosition() || this.getCameraPosition();
            if (!position) {
                return;
            }
            this._session.syncVehicles(this._vehicleRuntimeInstances.sync(this.getWorldSeed(), position));
        });
    }

    // Drains `_animalRuntimeInstances.drainRecentlyCaught()` once per frame
    // into the facade's `markAnimalCaught()`, so controllers never call the
    // renderer from inside their own tick(). Usually a no-op. Absent when the
    // facade lacks markAnimalCaught.
    _setupWildlifeExclusionSync() {
        if (typeof this._session.onAnimationFrame !== 'function' || typeof this._session.markAnimalCaught !== 'function') {
            return;
        }
        this._wildlifeExclusionSyncFrameSubscription = this._session.onAnimationFrame(() => {
            for (const { id, position } of this._animalRuntimeInstances.drainRecentlyCaught()) {
                this._session.markAnimalCaught(id, position);
            }
        });
    }

    // Animal counterpart of `_setupVehicleRendering()`.
    //
    // `sync()` always runs, since catch-target resolution depends on its
    // discovery/eviction bookkeeping. Only what goes to `syncAnimals()` is
    // narrowed, via `releasedNearby()`; handing it `sync()`'s full result would
    // double-render every tile-baked animal.
    _setupAnimalRendering() {
        if (typeof this._session.onAnimationFrame !== 'function' || typeof this._session.syncAnimals !== 'function') {
            return;
        }
        this._animalRenderFrameSubscription = this._session.onAnimationFrame(() => {
            const position = this.getAvatarPosition() || this.getCameraPosition();
            if (!position) {
                return;
            }
            this._animalRuntimeInstances.sync(this.getWorldSeed(), position, ANIMAL_RENDER_RADIUS);
            this._session.syncAnimals(this._animalRuntimeInstances.releasedNearby(position, ANIMAL_RENDER_RADIUS));
        });
    }
  
    // Absent when no persistence store is wired or the facade lacks
    // onAnimationFrame. Independent of rendering. Throttled to
    // RUNTIME_PLACEMENT_PERSISTENCE_INTERVAL_MS so a ridden vehicle's per-frame
    // moves never become per-frame writes.
    _setupVehicleRuntimePersistence() {
        if (!this._vehicleRuntimeInstancePersistenceStore || typeof this._session.onAnimationFrame !== 'function') {
            return;
        }
        this._vehicleRuntimePersistenceFrameSubscription = this._session.onAnimationFrame(() => {
            const now = Date.now();
            if (now - this._lastVehicleRuntimeSaveAt < RUNTIME_PLACEMENT_PERSISTENCE_INTERVAL_MS) {
                return;
            }
            this._lastVehicleRuntimeSaveAt = now;
            this._vehicleRuntimeInstancePersistenceStore.save(
                this._vehicleRuntimeInstances.instances,
                this._vehicleRuntimeInstances.excludedIds
            );
        });
    }

    // Animal counterpart of _setupVehicleRuntimePersistence().
    _setupAnimalRuntimePersistence() {
        if (!this._animalRuntimeInstancePersistenceStore || typeof this._session.onAnimationFrame !== 'function') {
            return;
        }
        this._animalRuntimePersistenceFrameSubscription = this._session.onAnimationFrame(() => {
            const now = Date.now();
            if (now - this._lastAnimalRuntimeSaveAt < RUNTIME_PLACEMENT_PERSISTENCE_INTERVAL_MS) {
                return;
            }
            this._lastAnimalRuntimeSaveAt = now;
            this._animalRuntimeInstancePersistenceStore.save(
                this._animalRuntimeInstances.instances,
                this._animalRuntimeInstances.excludedIds
            );
        });
    }

    dispose() {
        // An honest LEAVE for every entered World, rather than relying on other
        // replicas pruning dropped connections.
        if (this._worldPresenceUseCase) {
            for (const documentId of this._presentWorldDocumentIds) {
                this._worldPresenceUseCase.leaveWorld(documentId);
            }
        }
        this._presentWorldDocumentIds.clear();
        // The same honest LEAVE for spatial presence, plus tearing down render
        // subscriptions and every marker this session added.
        if (this._worldSpatialPresenceUseCase) {
            for (const documentId of Array.from(this._presentSpatialWorldDocumentIds)) {
                this.leaveWorldSpatialPresence(documentId);
            }
        }
        this._presentSpatialWorldDocumentIds.clear();
        if (this._avatarProfileSubscription) {
            this._avatarProfileSubscription();
            this._avatarProfileSubscription = null;
        }
        if (this._avatarPresenceSubscription) {
            this._avatarPresenceSubscription();
            this._avatarPresenceSubscription = null;
        }
        if (this._avatarFrameSubscription) {
            this._avatarFrameSubscription();
            this._avatarFrameSubscription = null;
        }
        this._avatarMovementController = null;
        this._avatarVehicleInteractionController = null;
        this._avatarAnimalInteractionController = null;
        this._avatarVehicleMovementController = null;
        this._vehicleSteeringIntent = null;
        this._avatarControlModeActive = false;
        this._altDown = false;
        this._shiftDown = false;
        this._vehicleSteerLeftHeld = false;
        this._vehicleSteerRightHeld = false;
        this._decorateKeyHeld = false;
        this._followAvatarEnabled = false;
        this._lastAvatarFollowPosition = null;
        this._cameraPerspective = null;
        this._lastPresenceUpdateAt = 0;
        this._avatarInteraction = AvatarInteractionState.empty();
        this._followedRemoteAvatarId = null;
        this._lastFollowedRemotePosition = null;
        if (this._remoteAvatarFrameSubscription) {
            this._remoteAvatarFrameSubscription();
            this._remoteAvatarFrameSubscription = null;
        }
        if (this._cameraFocusFrameSubscription) {
            this._cameraFocusFrameSubscription();
            this._cameraFocusFrameSubscription = null;
        }
        this._activeCameraFocus = null;
        // Mirrors the camera-focus teardown above.
        if (this._vehicleRenderFrameSubscription) {
            this._vehicleRenderFrameSubscription();
            this._vehicleRenderFrameSubscription = null;
        }
        // Mirrors the vehicle render teardown above.
        if (this._wildlifeExclusionSyncFrameSubscription) {
            this._wildlifeExclusionSyncFrameSubscription();
            this._wildlifeExclusionSyncFrameSubscription = null;
        }
        // Same teardown shape.
        if (this._animalRenderFrameSubscription) {
            this._animalRenderFrameSubscription();
            this._animalRenderFrameSubscription = null;
        }
        // Same teardown, plus one final unthrottled save so nothing from the last
        // interval is lost.
        if (this._vehicleRuntimePersistenceFrameSubscription) {
            this._vehicleRuntimePersistenceFrameSubscription();
            this._vehicleRuntimePersistenceFrameSubscription = null;
        }
        if (this._vehicleRuntimeInstancePersistenceStore) {
            this._vehicleRuntimeInstancePersistenceStore.save(
                this._vehicleRuntimeInstances.instances,
                this._vehicleRuntimeInstances.excludedIds
            );
        }
        if (this._animalRuntimePersistenceFrameSubscription) {
            this._animalRuntimePersistenceFrameSubscription();
            this._animalRuntimePersistenceFrameSubscription = null;
        }
        if (this._animalRuntimeInstancePersistenceStore) {
            this._animalRuntimeInstancePersistenceStore.save(
                this._animalRuntimeInstances.instances,
                this._animalRuntimeInstances.excludedIds
            );
        }
        // A fresh start() after dispose() gets no vehicle positions from the
        // previous visit.
        this._vehicleRuntimeInstances.clear();
        if (this._presenceSyncService) {
            this._presenceSyncService.dispose();
            this._presenceSyncService = null;
        }
        if (this._avatarProfileSyncService) {
            this._avatarProfileSyncService.dispose();
            this._avatarProfileSyncService = null;
        }
        this._remoteAvatarAppearanceRegistry = null;
        this._lastProfilePublishAt = 0;
        if (this._avatarInteractionSyncService) {
            this._avatarInteractionSyncService.dispose();
            this._avatarInteractionSyncService = null;
        }
        this._localInteractionSequence = 0;
        this._remoteAvatarGestureExpiry.clear();
        // Never leave a subscription on the app-wide peer bus. An offer still in
        // escrow stays escrowed: it resolves only on ACCEPT, DECLINE or the
        // recipient disconnecting, never because this session ended.
        if (this._avatarInventoryTransferPeerExchange) {
            this._avatarInventoryTransferPeerExchange.dispose();
            this._avatarInventoryTransferPeerExchange = null;
        }
        if (this._remoteAvatarRegistry) {
            this._remoteAvatarRegistry.dispose();
            this._remoteAvatarRegistry = null;
        }
        if (this._session) {
            this._session.dispose();
            this._session = null;
        }
        this._container = null;
        this._spatialCameraController = null;
        this._inspectionService = null;
        for (const unsubscribe of this._commandHistoryUnsubscribes.values()) {
            unsubscribe();
        }
        this._commandHistoryUnsubscribes.clear();
        this._commandHistories.clear();
        this._loadedDocuments.clear();
        this._failedLoads.clear();
        this._spatialSelection = SpatialSelectionState.empty();
        this._spatialHover = SpatialHoverState.empty();
        this._spatialInspection = SpatialInspectionState.empty();
        this._spatialEditingContext = SpatialEditingContext.empty();
        this._focusedDocumentId = null;
        this._activeDocumentId = null;
        this._homeDocumentId = null;
        // Reset so a fresh start() behaves like a new session. A leftover
        // `active: true` preview would permanently block undo()/redo(). Retired
        // histories belong to the disposed session too.
        this._historyPreview = null;
        this._retiredHistories = null;
        this._eventBus = null;
    }
}

// Most of this class's methods live in application/worldNavigation/, one module per concern,
// and are installed on the prototype as if written in the class body.
installMethods(
    WorldNavigationSession,
    localAvatarMethods,
    avatarPresenceMethods,
    placeQueryMethods,
    worldExperienceMethods,
    collaborationMethods,
    placementMethods,
    forkOnWriteMethods,
    worldContentMethods,
    placeNamingMethods,
    documentHistoryMethods,
    navigationMethods,
    selectionMethods,
    stateQueryMethods,
    worldStreamingMethods,
    documentOperationMethods
);
