import { RenderWorldViewUseCase } from './RenderWorldViewUseCase.js';
import { Position } from '../../core/Position.js';
import { SpatialSelectionState } from '../spatial-state/SpatialSelectionState.js';
import { SpatialHoverState } from '../spatial-state/SpatialHoverState.js';
import { SpatialCameraController } from './SpatialCameraController.js';
import { SpatialInspectionService } from '../editor/SpatialInspectionService.js';
import { SpatialInspectionState } from '../spatial-state/SpatialInspectionState.js';
import { SpatialEditingContext } from '../spatial-state/SpatialEditingContext.js';
import { CommandHistory } from '../editor/CommandHistory.js';
import { DEFAULT_WORLD_SEED } from '../../core/TerrainHeightField.js';
import { EventBus } from '../../core/events/EventBus.js';
import { SpatialAllocationPolicy } from '../../core/SpatialAllocationPolicy.js';
import { distanceBetween } from '../../core/SpatialQuery.js';
import { VehicleRuntimeInstances } from './VehicleRuntimeInstances.js';
import { AnimalRuntimeInstances, ANIMAL_RENDER_RADIUS } from './AnimalRuntimeInstances.js';
import { AvatarInventoryStore } from '../avatar/AvatarInventoryStore.js';
import { AvatarInventoryTransferPeerExchange } from '../avatar/AvatarInventoryTransferPeerExchange.js';
import { DEFAULT_AVATAR_TEMPLATE_ID } from '../../core/AvatarProfile.js';
import { AvatarInteractionState } from '../spatial-state/AvatarInteractionState.js';
import { WorldLocationDirectory, ORIGIN_LOCATION_ID } from './WorldLocationDirectory.js';
import { CameraFocusAnimator } from '../editor/CameraFocusAnimator.js';
import { computeCompassHeading } from '../../core/CompassHeading.js';
import { LOCATION_FOCUS_OFFSET } from '../worldNavigation/constants.js';
import { installMethods } from '../worldNavigation/installMethods.js';
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

const STREAMING_RADIUS = 150;
const NAVIGATION_RADIUS = 80;
const RETRY_DELAYS = [2000, 5000, 10000];

// Throttle for runtime vehicle/animal persistence. A ridden vehicle moves
// every frame; one snapshot per second is indistinguishable after a reload.
const RUNTIME_PLACEMENT_PERSISTENCE_INTERVAL_MS = 1000;

// HOME_CAMERA_FRAMING is renderer/CameraState.js's own default framing, so
// goHome() returns to the same pose every session starts from.
// LOCATION_FOCUS_OFFSET matches focusSelection()'s placement-focus offset, so
// both land on the same framing for the same target. The focus glide is short
// so hopping through a Locations list never feels sluggish.
const HOME_CAMERA_FRAMING = { position: { x: 10, y: 10, z: 10 }, target: { x: 0, y: 0, z: 0 } };
const CAMERA_FOCUS_DURATION_MS = 900;

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

    // Advances any in-flight goHome()/focusLocation() animation once per frame.
    // Without onAnimationFrame, camera focus applies instantly (see
    // _beginCameraFocus()).
    _setupCameraFocusAnimation() {
        if (typeof this._session.onAnimationFrame !== 'function') {
            return;
        }
        this._cameraFocusFrameSubscription = this._session.onAnimationFrame(() => {
            this._tickCameraFocus(Date.now());
        });
    }

    // Glides toward `framing` when this session can tick frames, otherwise
    // applies it instantly. The final framing is the same either way.
    _beginCameraFocus(framing) {
        if (!this._spatialCameraController) {
            return;
        }
        if (!this._cameraFocusFrameSubscription) {
            this._spatialCameraController.applyFraming(framing);
            return;
        }
        const current = this._spatialCameraController.getSpatialCameraState();
        this._activeCameraFocus = {
            // Explicit {x,y,z} copies, never the WorldPosition instances
            // themselves — CameraFocusAnimator spreads its `from`/`to`
            // inputs (`{ ...from.position }`), and WorldPosition's x/y/z
            // are prototype getters that a plain object spread would
            // silently drop, leaving an animator with no coordinates at
            // all. See core/WorldPosition.js.
            animator: new CameraFocusAnimator({
                from: {
                    position: { x: current.position.x, y: current.position.y, z: current.position.z },
                    target: { x: current.target.x, y: current.target.y, z: current.target.z }
                },
                to: framing,
                durationMs: CAMERA_FOCUS_DURATION_MS
            }),
            startedAt: Date.now()
        };
    }

    _tickCameraFocus(now) {
        if (!this._activeCameraFocus || !this._spatialCameraController) {
            return;
        }
        const { animator, startedAt } = this._activeCameraFocus;
        const state = animator.stateAt(now - startedAt);
        this._spatialCameraController.applyFraming(state);
        if (state.complete) {
            this._activeCameraFocus = null;
        }
    }

    // -----------------------------------------------------------------
    // Placement mode and gizmo interaction live in EditorSession (see
    // docs/Principles.md, "World View Observes and Navigates; Editor Mutates and
    // Builds").
    // -----------------------------------------------------------------

    // -----------------------------------------------------------------
    // Navigation
    // -----------------------------------------------------------------

    // Moves the camera and, by default, makes `documentId` the active document
    // too, which is what search/Nearby Worlds/"Focus" mean. Pass
    // `{ setActive: false }` for a camera-only move (see docs/Principles.md,
    // "Navigation Never Implies Editing").
    focusDocument(documentId, { setActive = true } = {}) {
        this._focusedDocumentId = documentId;
        if (setActive) {
            this.setActiveDocument(documentId);
        }
        const layoutPos = this._getWorldPosition(documentId);
        this._spawnAvatarNear(documentId, layoutPos);
        this._spatialCameraController.focusDocument(documentId, layoutPos);
        return this.updateSpatialView();
    }

    // Makes `documentId` active without moving the camera (e.g. two
    // publications sharing a coordinate). A selection in a different document is
    // cleared, or the next transform would fork a document that isn't the active
    // one (see docs/Principles.md, "Only The Active Document Is An Editing
    // Target").
    setActiveDocument(documentId) {
        if (this._spatialSelection && !this._spatialSelection.isEmpty
            && this._spatialSelection.documentId !== documentId) {
            this.clearSelection();
        }
        this._activeDocumentId = documentId;
        return this._activeDocumentId;
    }

    // Where the camera is currently navigated to; see getActiveDocumentId() for where an
    // edit would land.
    getFocusedDocumentId() {
        return this._focusedDocumentId;
    }

    focusSelection() {
        if (!this._spatialInspection || this._spatialInspection.isEmpty) {
            return;
        }
        const data = this._spatialInspection.data;
        if (data?.worldPosition) {
            this._spatialCameraController.focusTarget(
                {
                    x: data.worldPosition.x,
                    y: data.worldPosition.y,
                    z: data.worldPosition.z
                },
                { x: 12, y: 12, z: 12 }
            );
        }
    }

    navigateToDocument(documentId) {
        return this.focusDocument(documentId);
    }

    // -----------------------------------------------------------------
    // Local World Experience & Return
    // -----------------------------------------------------------------
    //
    // Local, per-user camera framing for Worlds this replica has visited; never
    // a Document or WorldPlacement field, never broadcast. See
    // core/LocalWorldExperience.js and docs/Principles.md, "Personal Experience
    // Is Not Shared World State". No-ops without localWorldExperienceStore.
    //
    // Independent of enterWorldPresence()/leaveWorldPresence(), which broadcast
    // a shared "I am here". Callers wire both at the same active-document change
    // (see WorldView.js _syncWorldExperience()). Never consulted for
    // authorization: a prior visit is a convenience, not a claim.

    // Moves the camera to a WorldLocation (LOCATION_FOCUS_OFFSET for a
    // STRUCTURE, HOME_CAMERA_FRAMING for ORIGIN), animated when possible. Never
    // touches the active document, selection or inspection (see
    // docs/Principles.md, "Navigation Never Implies Editing"). Returns false for
    // an unknown id, e.g. a stale panel entry.
    focusLocation(locationId) {
        const location = this._worldLocationDirectory.find(locationId);
        if (!location) {
            return false;
        }
        if (location.isOrigin) {
            this._beginCameraFocus(HOME_CAMERA_FRAMING);
            return true;
        }
        const { x, y, z } = location.position;
        this._beginCameraFocus({
            position: { x: x + LOCATION_FOCUS_OFFSET.x, y: y + LOCATION_FOCUS_OFFSET.y, z: z + LOCATION_FOCUS_OFFSET.z },
            target: { x, y, z }
        });
        return true;
    }

    // "Home" returns the camera and the local avatar to the user's own world.
    // World origin is reachable through the ORIGIN_LOCATION_ID entry, but a
    // published world sits somewhere on a huge shared grid, so origin is almost
    // never near the user's content.
    //
    // Moving the avatar is a deliberate exception to "navigation never
    // relocates a participant": leaving it behind would show the user's world
    // while WASD moves an avatar somewhere off-screen.
    //
    // Uses focusDocument() for the camera, active document and streaming, then
    // repositions the avatar. Falls back to origin only when no document has
    // ever been focused.
    //
    // Reads _homeDocumentId, not _focusedDocumentId, and doesn't require the
    // document to be loaded: wandering far enough to unload it is exactly when
    // Home is needed. focusDocument() reloads it synchronously, so
    // _safeSpawnPosition() measures real bounds.
    goHome() {
        const documentId = this._homeDocumentId;
        if (!documentId) {
            return this.focusLocation(ORIGIN_LOCATION_ID);
        }
        // focusDocument() returns updateSpatialView()'s { loaded, visible, failed };
        // goHome() keeps its boolean contract.
        this.focusDocument(documentId);
        const layoutPos = this._getWorldPosition(documentId);
        if (this._avatarPresenceSession && layoutPos) {
            // Uses the bounds-aware spawn point so Home never lands inside a structure
            // built around its own origin. _safeSpawnPosition() falls back to the fixed
            // offset if the reload failed.
            this._avatarPresenceSession.update({
                position: this._safeSpawnPosition(documentId, layoutPos)
            });
        }
        return true;
    }

    // Which way the camera is looking, derived fresh from position/target (see
    // core/CompassHeading.js). Null before start() or when position and target
    // coincide.
    getCompassHeading() {
        if (!this._spatialCameraController) {
            return null;
        }
        const state = this._spatialCameraController.getSpatialCameraState();
        return computeCompassHeading(state.position, state.target);
    }

    moveCamera(delta) {
        this._spatialCameraController.moveCamera(delta);
        return this.updateSpatialView();
    }

    updateSpatialView() {
        if (!this._session) {
            return { loaded: [], visible: [], failed: this._getFailedIds() };
        }
        const cameraState = this._spatialCameraController.getSpatialCameraState();
        const cameraPos = new Position(
            cameraState.position.x,
            cameraState.position.y,
            cameraState.position.z
        );
        const visibleIds = this._worldLayoutProvider.findVisibleDocuments(
            cameraPos,
            STREAMING_RADIUS
        );
        const currentlyLoaded = new Set(this._loadedDocuments.keys());
		const toUnload = Array.from(currentlyLoaded).filter((id) => {
		    if (visibleIds.includes(id)) return false;
		    // Pin dirty documents against streaming unload
		    if (this.isDocumentDirty(id)) return false;
		    // A lazily-forked document is never a publication, so it can never re-enter
		    // `visibleIds`; unlike the dirty flag, this pin survives a save. Without it a
		    // saved fork would stream out on the next camera move for good.
		    if (this._localOnlyDocumentIds.has(id)) return false;
		    return true;
		});
        const now = Date.now();
        const toLoad = visibleIds.filter((id) => {
            if (currentlyLoaded.has(id)) {
                return false;
            }
            const failure = this._failedLoads.get(id);
            if (!failure) {
                return true;
            }
            if (failure.attempts > RETRY_DELAYS.length) {
                return false;
            }
            return now - failure.lastAttemptAt >= RETRY_DELAYS[failure.attempts - 1];
        });
        for (const id of toUnload) {
            this._unloadWorld(id);
        }
        for (const id of toLoad) {
            try {
                this._loadWorld(id);
                this._failedLoads.delete(id);
            } catch (err) {
                console.warn(`WorldNavigationSession: failed to load world ${id} — ${err.message}`);
                const existing = this._failedLoads.get(id);
                this._failedLoads.set(id, {
                    attempts: existing ? existing.attempts + 1 : 1,
                    lastAttemptAt: now
                });
            }
        }
        this._refreshGizmo();
        return {
            loaded: Array.from(this._loadedDocuments.keys()),
            visible: visibleIds,
            failed: this._getFailedIds()
        };
    }

    // -----------------------------------------------------------------
    // Interaction
    // -----------------------------------------------------------------
	
	// Avatar, placement and brick picks are separate raycasts; the nearest hit
	// wins, so an avatar in front of a wall is selectable. At most one of
	// {avatar target, brick/ground selection} is set at a time (see
	// docs/Principles.md, "Avatars Are Never Document Selection").
	// `toggle`/`additive` don't apply to avatars.
	pick(screenX, screenY, { toggle = false, additive = false } = {}) {
	    if (!this._session) {
	        return null;
	    }
	    const brickHit = this._session.pick(screenX, screenY);
	    const avatarHit = typeof this._session.pickAvatar === 'function'
	        ? this._session.pickAvatar(screenX, screenY)
	        : null;
	    // StructurePlacement meshes live in their own registry, so a placement hit
	    // needs its own raycast, folded into the same nearest-wins comparison. A
	    // facade without pickPlacement() never resolves one.
	    const placementHit = typeof this._session.pickPlacement === 'function'
	        ? this._session.pickPlacement(screenX, screenY)
	        : null;

	    if (avatarHit
	        && (!brickHit || avatarHit.distance < brickHit.distance)
	        && (!placementHit || avatarHit.distance < placementHit.distance)) {
	        this._setAvatarInteraction(AvatarInteractionState.avatar(avatarHit.avatarId));
	        this._setSpatialSelection(SpatialSelectionState.empty());
	        this._session.clearSelection();
	        this._session.clearHover();
	        this._refreshGizmo();
	        return this._avatarInteraction;
	    }

	    // A StructurePlacement is selected, never edited (see docs/Principles.md,
	    // "Selection In World View Does Not Imply Editing Authority"). A `placement`
	    // selection has no items, so no gizmo shows. `toggle`/`additive` are
	    // ignored.
	    if (placementHit && (!brickHit || placementHit.distance < brickHit.distance)) {
	        const hostDocumentId = this._resolvePlacementHostDocumentId(placementHit.placementId);
	        if (hostDocumentId) {
	            this._setAvatarInteraction(AvatarInteractionState.empty());
	            this._setSpatialSelection(SpatialSelectionState.placement({
	                documentId: hostDocumentId,
	                placementId: placementHit.placementId
	            }));
	            this._session.clearSelection();
	            if (typeof this._session.selectPlacement === 'function') {
	                this._session.selectPlacement(placementHit.placementId);
	            }
	            this._session.clearHover();
	            this._refreshInspection();
	            this._refreshEditingContext();
	            this._refreshGizmo();
	            return this._spatialSelection;
	        }
	    }

	    if (brickHit) {
	        let nextSelection;
	        if (additive) {
	            nextSelection = this._spatialSelection.addBrick(brickHit);
	        } else if (toggle) {
	            nextSelection = this._spatialSelection.toggleBrick(brickHit);
	        } else {
	            nextSelection = SpatialSelectionState.brick(brickHit);
	        }
	        this._setAvatarInteraction(AvatarInteractionState.empty());
	        this._setSpatialSelection(nextSelection);
			this._session.selectBricks(nextSelection.brickIds, nextSelection.brickId);
            this._session.clearHover();
            this._refreshInspection();
            this._refreshEditingContext();
            this._refreshGizmo();
            return this._spatialSelection;
        }
        const groundHit = this._session.pickGround(screenX, screenY);
        if (groundHit) {
            this._setAvatarInteraction(AvatarInteractionState.empty());
            this._setSpatialSelection(SpatialSelectionState.ground(groundHit.position));
            this._session.clearSelection();
            this._session.clearHover();
            this._refreshInspection();
            this._refreshEditingContext();
            this._refreshGizmo();
            return this._spatialSelection;
        }
        this._setAvatarInteraction(AvatarInteractionState.empty());
        this._setSpatialSelection(SpatialSelectionState.empty());
        this._session.clearSelection();
        this._session.clearHover();
        this._refreshInspection();
        this._refreshEditingContext();
        this._refreshGizmo();
        return null;
    }

    hover(screenX, screenY) {
        if (!this._session) {
            this._setSpatialHover(SpatialHoverState.empty());
            return null;
        }
        const brickHit = this._session.pick(screenX, screenY);
        if (brickHit) {
            const hover = SpatialHoverState.brick(brickHit);
            this._setSpatialHover(hover);
            this._session.hoverBrick(brickHit.brickId);
            return hover;
        }
        const groundHit = this._session.pickGround(screenX, screenY);
        if (groundHit) {
            const hover = SpatialHoverState.ground(groundHit.position);
            this._setSpatialHover(hover);
            this._session.clearHover();
            return hover;
        }
        this._setSpatialHover(SpatialHoverState.empty());
        this._session.clearHover();
        return null;
    }

    clearSelection() {
        this._setAvatarInteraction(AvatarInteractionState.empty());
        this._setSpatialSelection(SpatialSelectionState.empty());
        this._spatialInspection = SpatialInspectionState.empty();
        this._spatialEditingContext = SpatialEditingContext.empty();
        if (this._session) {
            this._session.clearSelection();
        }
        this._refreshGizmo();
        return true;
    }

    // Selects every brick in the selection's document, or the active document
    // (never the camera-focused one) when nothing is selected. A spatial
    // selection references exactly one document.
    selectAll() {
        const documentId = (!this._spatialSelection.isEmpty && this._spatialSelection.documentId)
            || this._activeDocumentId;
        const document = documentId ? this._loadedDocuments.get(documentId) : null;
        if (!document || !this._session) {
            return false;
        }
        const items = [];
        for (const building of document.world.getBuildings()) {
            for (const brick of building.getBricks()) {
                items.push({ type: 'brick', buildingId: building.id, brickId: brick.id });
            }
        }
        if (items.length === 0) {
            return false;
        }
        this._setSpatialSelection(SpatialSelectionState.bricks({ documentId, items }));
        this._session.selectBricks(items.map((item) => item.brickId), items[items.length - 1].brickId);
        this._refreshInspection();
        this._refreshEditingContext();
        this._refreshGizmo();
        return true;
    }

    marqueeSelect({ x0, y0, x1, y1 } = {}, { additive = false } = {}) {
        if (!this._session || typeof this._session.pickRectangle !== 'function') {
            return false;
        }
        const hits = this._session.pickRectangle(x0, y0, x1, y1) || [];
        const documentId = this._resolveMarqueeDocumentId(hits);
        if (!documentId) {
            if (!additive) {
                this.clearSelection();
            }
            return true;
        }

        let nextSelection = additive && this._spatialSelection.documentId === documentId
            ? this._spatialSelection
            : SpatialSelectionState.empty();
        for (const hit of hits) {
            if (!hit || hit.documentId !== documentId || !hit.buildingId || !hit.brickId) {
                continue;
            }
            nextSelection = nextSelection.addBrick(hit);
        }

        this._setSpatialSelection(nextSelection);
        this._session.selectBricks(nextSelection.brickIds, nextSelection.brickId);
        this._session.clearHover();
        this._refreshInspection();
        this._refreshEditingContext();
        this._refreshGizmo();
        return true;
    }

    getSelectionCount() {
        return this._spatialSelection.isEmpty ? 0 : this._spatialSelection.items.length;
    }

    setControlsEnabled(enabled) {
        if (!this._session || typeof this._session.setControlsEnabled !== 'function') {
            return false;
        }
        this._session.setControlsEnabled(enabled);
        return true;
    }

    // Selection transforms (move/delete/rotate/align/distribute/snap/numeric)
    // live in EditorSession.

    undo() {
	    if (this._historyPreview && this._historyPreview.active) return false;
        const history = this._getActiveCommandHistory();
        if (history && history.canUndo()) {
            history.undo();
            this._refreshInspection();
            this._refreshEditingContext();
            this._refreshGizmo();
            return true;
        }
        return false;
    }

    redo() {
	    if (this._historyPreview && this._historyPreview.active) return false;
        const history = this._getActiveCommandHistory();
        if (history && history.canRedo()) {
            history.redo();
            this._refreshInspection();
            this._refreshEditingContext();
            this._refreshGizmo();
            return true;
        }
        return false;
    }

    // Read-only mirrors of undo()/redo()'s gating, so WorldView.js can disable
    // its buttons without touching CommandHistory.
    canUndo() {
        if (this._historyPreview && this._historyPreview.active) return false;
        const history = this._getActiveCommandHistory();
        return !!history && history.canUndo();
    }

    canRedo() {
        if (this._historyPreview && this._historyPreview.active) return false;
        const history = this._getActiveCommandHistory();
        return !!history && history.canRedo();
    }

    // Descriptive text straight from CommandHistory's own getUndoLabel()/
    // getRedoLabel() (e.g. "Undo Create Landmark") — never recomputed or
    // paraphrased here.
    getUndoLabel() {
        const history = this._getActiveCommandHistory();
        return history ? history.getUndoLabel() : null;
    }

    getRedoLabel() {
        const history = this._getActiveCommandHistory();
        return history ? history.getRedoLabel() : null;
    }

    getSpatialSelection() {
        return this._spatialSelection;
    }

    getSpatialHover() {
        return this._spatialHover;
    }

    getSpatialInspection() {
        return this._spatialInspection;
    }

    // The raw AvatarInteractionState, a separate slice from the spatial
    // selection (see docs/Principles.md, "Avatars Are Never Document
    // Selection").
    getAvatarInteraction() {
        return this._avatarInteraction;
    }

    // Read-only presentation data for the current avatar target, for
    // ui/components/AvatarInfoPanel.js, from the local avatar's profile/presence
    // or a remote avatar's known presence (see docs/Principles.md, "Looking At
    // Something Is Never The Same As Acting On It"). Null with no target or
    // when the target's presence expired.
    getAvatarInfo() {
        if (!this._avatarInteraction || this._avatarInteraction.isEmpty) {
            return null;
        }
        const avatarId = this._avatarInteraction.avatarId;
        return this.isLocalAvatarId(avatarId)
            ? this._inspectLocalAvatar()
            : this._inspectRemoteAvatar(avatarId);
    }

    // Whether `avatarId` is THIS session's own local avatar — never a
    // trust/authorization check, purely "which of the two data sources
    // getAvatarInfo() should read from."
    isLocalAvatarId(avatarId) {
        return Boolean(this._avatarPresenceSession) && this._avatarPresenceSession.current.avatarId === avatarId;
    }

    // A lighter-weight alternative to getSpatialState().cameraPosition
    // for callers (getAvatarInfo(), follow-avatar) that only need the
    // camera's position, not a full findVisibleDocuments() pass.
    getCameraPosition() {
        if (!this._spatialCameraController) {
            return null;
        }
        const state = this._spatialCameraController.getSpatialCameraState();
        return { x: state.position.x, y: state.position.y, z: state.position.z };
    }

    // The local avatar's live world position, WorldSpatialContextService's
    // primary "where am I" signal (see docs/Principles.md, "Exploration Is
    // Derived From Place, Not Stored As Place"). Null without an
    // avatarPresenceSession; callers fall back to getCameraPosition().
    getAvatarPosition() {
        if (!this._avatarPresenceSession) {
            return null;
        }
        const { x, y, z } = this._avatarPresenceSession.current.position;
        return { x, y, z };
    }

    // The one live seed (DEFAULT_WORLD_SEED), so spatial context never invents
    // its own.
    getWorldSeed() {
        return DEFAULT_WORLD_SEED;
    }

    _inspectLocalAvatar() {
        if (!this._avatarProfileUseCase || !this._avatarPresenceSession) {
            return null;
        }
        const { profile, template } = this._avatarProfileUseCase.getEffectiveAvatar();
        const presence = this._avatarPresenceSession.current;
        const cameraPosition = this.getCameraPosition();
        return {
            avatarId: presence.avatarId,
            isLocal: true,
            displayName: profile.displayName || profile.ownerIdentity || 'You',
            ownerIdentity: profile.ownerIdentity,
            templateLabel: template ? template.displayLabel : null,
            // The local avatar always has its own chosen template.
            templatePlaceholder: false,
            position: { x: presence.position.x, y: presence.position.y, z: presence.position.z },
            rotation: { ...presence.rotation },
            animation: presence.animation,
            // Trust describes a RECEIVED claim about someone else;
            // there is no such claim about yourself, and lifecycle
            // (PRESENT/STALE/ABSENT) is a judgment a RECEIVER makes
            // about elapsed time since last heard from — neither
            // question is meaningful applied to your own, always-live
            // presence.
            lifecycleState: null,
            trustStatus: null,
            distance: cameraPosition ? distanceBetween(presence.position, cameraPosition) : null
        };
    }

    _inspectRemoteAvatar(avatarId) {
        if (!this._presenceSyncService) {
            return null;
        }
        const known = this._presenceSyncService.listKnownPresences(Date.now());
        const entry = known.find((k) => k.advertisement.avatarId === avatarId);
        if (!entry) {
            return null;
        }
        const defaultTemplate = this._avatarTemplateRegistry
            ? this._avatarTemplateRegistry.get(DEFAULT_AVATAR_TEMPLATE_ID)
            : null;
        const cameraPosition = this.getCameraPosition();
        return {
            avatarId,
            isLocal: false,
            // A remote displayName is distributed with the profile;
            // getAvatarDisplayName() falls back to ownerIdentity, then avatarId.
            displayName: this.getAvatarDisplayName(avatarId),
            ownerIdentity: entry.advertisement.ownerIdentity,
            templateLabel: defaultTemplate ? defaultTemplate.displayLabel : null,
            templatePlaceholder: true,
            position: { ...entry.advertisement.position },
            rotation: { ...entry.advertisement.rotation },
            animation: entry.advertisement.animation,
            lifecycleState: entry.lifecycleState,
            trustStatus: entry.trustObservation ? entry.trustObservation.status : null,
            distance: cameraPosition ? distanceBetween(entry.advertisement.position, cameraPosition) : null
        };
    }

    getSpatialEditingContext() {
        return this._spatialEditingContext;
    }

    getSpatialState() {
        if (!this._session) {
            return {
                loaded: [],
                visible: [],
                nearby: [],
                failed: [],
                cameraPosition: null
            };
        }
        const cameraState = this._spatialCameraController.getSpatialCameraState();
        const cameraPos = new Position(
            cameraState.position.x,
            cameraState.position.y,
            cameraState.position.z
        );
        const visible = this._worldLayoutProvider.findVisibleDocuments(
            cameraPos,
            STREAMING_RADIUS
        );
        const nearby = this._worldLayoutProvider.findVisibleDocuments(
            cameraPos,
            NAVIGATION_RADIUS
        );
        return {
            loaded: Array.from(this._loadedDocuments.keys()),
            visible,
            nearby,
            failed: this._getFailedIds(),
            cameraPosition: cameraPos
        };
    }

    getLoadedDocuments() {
        return Array.from(this._loadedDocuments.values());
    }

    getDocument(documentId) {
        return this._loadedDocuments.get(documentId) || null;
    }

    getDocumentPosition(documentId) {
        return this._getWorldPosition(documentId);
    }

    // -----------------------------------------------------------------
    // Fork-on-write
    //
    // A published World View is immutable; a World View session is editable.
    // The first mutation of a published snapshot creates a new Document derived
    // from it. Navigation, camera, selection, hover and inspection never fork;
    // only an actual document mutation does. See docs/Principles.md, "A
    // published snapshot is never mutated in place".
    // -----------------------------------------------------------------

    // -----------------------------------------------------------------
    // World Location Browser
    //
    // Camera-driven exploration of a region, instead of knowing a name or typing
    // coordinates. Not a second discovery mechanism: every method wraps
    // searchWorldByLocation/searchWorld, so there is one path (query ->
    // discoveryProvider -> position enrichment -> radius test). Nothing here
    // moves, edits, forks or publishes (see docs/Principles.md, "Navigation
    // Never Implies Editing").
    // -----------------------------------------------------------------

    // -----------------------------------------------------------------
    // Internal
    // -----------------------------------------------------------------

    // The document the next mutation would land on, shared by
    // _getActiveCommandHistory (undo/redo) and history preview so they agree
    // with every other mutation path. A non-empty selection wins, then the
    // active document, never the camera-focused one.
    _resolveMutationTargetId() {
        if (this._spatialSelection && !this._spatialSelection.isEmpty && this._spatialSelection.documentId) {
            return this._spatialSelection.documentId;
        }
        return this._activeDocumentId;
    }

    _getActiveCommandHistory() {
        const id = this._resolveMutationTargetId();
        if (!id) return null;
        const document = this._loadedDocuments.get(id);
        if (!document) return null;
        return this._commandHistories.get(document.world.id) || null;
    }

	// Tries local storage first, unchanged. Only when storage[documentId] is
	// empty (any other failure, such as validation, still propagates) does it
	// fall back to the read-through material bridge for a Publication surfaced
	// by worldLayoutProvider but never published locally. `.getDocument()` keeps
	// `_loadedDocuments` holding ordinary Documents, never a
	// PublishedWorldSession and never a copy into storage.
	// Returns { document, isMaterializedPublication }, so _loadWorld() can mark
	// fallback documents immutable without consulting fork policy's
	// _findPublications()/_discoveryProvider.
	_resolveWorldDocument(documentId) {
	    try {
	        return { document: this._loadPublicationDocumentUseCase.execute(documentId, this._eventBus), isMaterializedPublication: false };
	    } catch (error) {
	        if (!/no document found/.test(error.message)) {
	            throw error;
	        }
	        const publication = this._resolvePublicationMaterial(documentId);
	        if (!publication) {
	            throw error;
	        }
	        const document = this._loadPublishedWorldSessionUseCase.execute(publication, this._eventBus).getDocument();
	        return { document, isMaterializedPublication: true };
	    }
	}

	// Resolves a materializable Publication through
	// `_publicationActionDiscoveryProvider`, never the narrow fork-policy
	// provider. Returns null when no fallback is possible, so
	// _resolveWorldDocument() re-throws the original "not found".
	_resolvePublicationMaterial(documentId) {
	    if (!this._loadPublishedWorldSessionUseCase || !this._publicationActionDiscoveryProvider
	        || typeof this._publicationActionDiscoveryProvider.findByDocumentId !== 'function') {
	        return null;
	    }
	    const publications = this._publicationActionDiscoveryProvider.findByDocumentId(documentId) || [];
	    const publication = publications[0];
	    return (publication && publication.contentReference) ? publication : null;
	}

	_loadWorld(documentId) {
	    const { document, isMaterializedPublication } = this._resolveWorldDocument(documentId);
	    this._loadedDocuments.set(documentId, document);
	    // A streamed-in world is a published snapshot, immutable until an edit forks
	    // it (see _ensureEditableDocumentId), but only when a Publication resolves.
	    // In streaming that's always true, since only published documents become
	    // visible. Without a discoveryProvider this session can't tell, so it
	    // doesn't claim to. A materialized Publication is marked immutable too,
	    // without consulting _isKnownPublication().
	    if (isMaterializedPublication || this._isKnownPublication(documentId)) {
	        this._publishedDocumentIds.add(documentId);
	    }
	    if (!this._focusedDocumentId) {
	        this._focusedDocumentId = documentId;
	    }
	    // Set once, like _focusedDocumentId, but never cleared by _unloadWorld();
	    // see the _homeDocumentId constructor comment.
	    if (!this._homeDocumentId) {
	        this._homeDocumentId = documentId;
	    }
	    // Bootstrap the active document the same way.
	    if (!this._activeDocumentId) {
	        this._activeDocumentId = documentId;
	    }
        const layoutPos = this._worldLayoutProvider.getPosition(documentId);
        this._session.addWorld(document.world, documentId, layoutPos);
        if (!this._commandHistories.has(document.world.id)) {
            this._registerCommandHistory(document.world.id, new CommandHistory({ world: document.world }));
        }
    }

    _unloadWorld(documentId) {
        if (this._focusedDocumentId === documentId) {
            this._focusedDocumentId = null;
        }
        // An unloaded document can't stay active; a mutation would have nowhere to
        // land.
        if (this._activeDocumentId === documentId) {
            this._activeDocumentId = null;
        }
        if (this._spatialSelection.documentId === documentId) {
            this.clearSelection();
        }
        if (this._spatialHover.documentId === documentId) {
            this._setSpatialHover(SpatialHoverState.empty());
            if (this._session) {
                this._session.clearHover();
            }
        }
        const document = this._loadedDocuments.get(documentId);
        if (document) {
            this._unregisterCommandHistory(document.world.id);
        }
        if (document && this._session) {
            this._session.removeWorld(document.world, documentId);
        }
        this._loadedDocuments.delete(documentId);
        this._refreshGizmo();
    }

	// A real (non-ground, non-empty) selection makes its document active (see
	// docs/Principles.md, "Camera Focus, Active Document, and Selection Are
	// Three Different Things"). Every selection path funnels through this
	// setter, so the sync happens in one place.
	_setSpatialSelection(selection) {
	    this._spatialSelection = selection;
	    if (selection && !selection.isEmpty && selection.documentId) {
	        this._activeDocumentId = selection.documentId;
	    }
	    this._refreshEditingContext();
	    this._refreshInspection();
	}

    // PlacementMeshRegistry is keyed by placementId alone, so a pick returns
    // no document. With many documents streamed in, the hit is resolved back to
    // whichever World contains it. placementIds are unique per instance, so the
    // first match is the only one. Null if the document streamed out in
    // between.
    _resolvePlacementHostDocumentId(placementId) {
        for (const [documentId, document] of this._loadedDocuments) {
            if (document.world.getStructurePlacement(placementId)) {
                return documentId;
            }
        }
        return null;
    }

    _resolveMarqueeDocumentId(hits) {
        const firstHit = (hits || []).find((hit) => hit && hit.documentId);
        if (firstHit) {
            return firstHit.documentId;
        }
        if (!this._spatialSelection.isEmpty && this._spatialSelection.documentId) {
            return this._spatialSelection.documentId;
        }
        return this._activeDocumentId;
    }
	
	_setSpatialHover(hover) {
        this._spatialHover = hover;
    }

    // Minimal, unlike _setSpatialSelection: an avatar target is just an id
    // that getAvatarInfo() resolves on demand.
    _setAvatarInteraction(avatarInteraction) {
        this._avatarInteraction = avatarInteraction;
    }

    _refreshInspection() {
        if (!this._inspectionService) {
            this._spatialInspection = SpatialInspectionState.empty();
            return;
        }
        this._spatialInspection = this._inspectionService.inspect(this._spatialSelection);
    }

    // Permanently inert: World View has no editing kernel or gizmo (see
    // docs/Principles.md, "World View Observes and Navigates; Editor Mutates and
    // Builds"). Keeping these as no-ops is less invasive than removing their
    // many call sites; `_spatialEditingContext` stays empty, which is the
    // correct answer ("nothing is editable").
    _refreshEditingContext() {
        this._spatialEditingContext = SpatialEditingContext.empty();
    }

    _refreshGizmo() {}

    _getFailedIds() {
        return Array.from(this._failedLoads.keys());
    }

	// --- Parity Methods for Tests ---
	getActiveDocumentId() { return this._activeDocumentId; }
	isDocumentDirty(documentId) {
	    const doc = this.getDocument(documentId || this._activeDocumentId);
	    if (!doc) return false;
	    const history = this._commandHistories.get(doc.world.id);
	    return history ? history.isDirty() : false;
	}
	saveDocument(documentId) {
	    const id = documentId || this._activeDocumentId;
	    // Defense in depth: guarded mutations fork before marking dirty, so a
	    // published document should never have anything to save. Refuse rather
	    // than overwrite the published source (see docs/Principles.md, "A
	    // published snapshot is never mutated in place").
	    if (this._publishedDocumentIds.has(id)) {
	        throw new Error(`WorldNavigationSession: "${id}" is a published snapshot and cannot be saved directly — edit it to fork first`);
	    }
	    const doc = this.getDocument(id);
	    if (!doc) throw new Error('no loaded document');
	    this._saveDocumentUseCase.execute({ document: doc, state: { dirty: true }, markSaved: () => {} });
	    const history = this._commandHistories.get(doc.world.id);
	    if (history) history.markSaved();
	}
	publishDocument(documentId) {
	    const id = documentId || this._activeDocumentId;
	    if (this._publishedDocumentIds.has(id)) {
	        throw new Error(`WorldNavigationSession: "${id}" is already a published snapshot — fork it to publish an edited copy`);
	    }
	    const doc = this.getDocument(id);
	    if (!doc) throw new Error('no loaded document');
	    if (this.isDocumentDirty(doc.world.id)) this.saveDocument(doc.world.id);
	    return this._publishDocumentUseCase.execute({ document: doc });
	}
	
	cloneDocument(documentId) {
	    const doc = this.getDocument(documentId || this._activeDocumentId);
	    if (!doc) throw new Error('no loaded document');
	    const clone = this._documentCloneService.execute(doc, { eventBus: this._eventBus });
	    this._loadedDocuments.set(clone.world.id, clone);
	    
	    const history = new CommandHistory({ world: clone.world });
	    history.markUnsaved();

	    this._registerCommandHistory(clone.world.id, history);
	    if (this._session) this._session.addWorld(clone.world, clone.world.id, this._worldLayoutProvider.getPosition(clone.world.id));
	    return clone.world.id;
	}
	
	forkDocument(documentId) {
	    const doc = this.getDocument(documentId || this._activeDocumentId);
	    if (!doc) throw new Error('no loaded document');
	    const user = this._identityProvider ? this._identityProvider.currentUser() : null;
	    const fork = this._documentCloneService.execute(doc, {
	        title: `Fork of ${doc.metadata.title || 'Untitled'}`,
	        author: user ? user.username : null,
	        parentDocumentId: doc.world.id,
	        eventBus: this._eventBus
	    });
	    this._loadedDocuments.set(fork.world.id, fork);
	    const history = new CommandHistory({ world: fork.world });
	    history.markUnsaved();
	    this._registerCommandHistory(fork.world.id, history);
	    if (this._session) this._session.addWorld(fork.world, fork.world.id, this._worldLayoutProvider.getPosition(fork.world.id));
	    // An explicit "Fork" action means the person wants to work on
	    // the fork next — camera AND active document both move to it,
	    // same combined behavior focusDocument()'s default gives.
	    this._focusedDocumentId = fork.world.id;
	    this._activeDocumentId = fork.world.id;
	    return fork.world.id;
	}

	
	// Add getDocumentManager alias for WorldViewPersistence tests
	getDocumentManager(documentId) {
	    return this.getDocument(documentId);
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
    documentHistoryMethods
);
