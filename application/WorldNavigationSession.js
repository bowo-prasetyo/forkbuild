import { RenderWorldViewUseCase } from './RenderWorldViewUseCase.js';
import { Position } from '../core/Position.js';
import { createId } from '../core/createId.js';
import { AnimalPresence } from '../core/AnimalPresence.js';
import { SpatialBounds } from '../core/SpatialBounds.js';
import { SpatialSelectionState } from './spatial-state/SpatialSelectionState.js';
import { SpatialHoverState } from './spatial-state/SpatialHoverState.js';
import { SpatialCameraController } from './SpatialCameraController.js';
import { SpatialInspectionService } from './SpatialInspectionService.js';
import { SpatialInspectionState } from './spatial-state/SpatialInspectionState.js';
import { SpatialEditingContext } from './spatial-state/SpatialEditingContext.js';
import { CommandHistory } from './CommandHistory.js';
import { terrainHeightAt, DEFAULT_WORLD_SEED } from '../core/TerrainHeightField.js';
import { EventBus } from '../core/events/EventBus.js';
import { License } from '../core/License.js';
import { CreateWorldLandmarkCommand } from './commands/CreateWorldLandmarkCommand.js';
import { UpdateWorldLandmarkCommand } from './commands/UpdateWorldLandmarkCommand.js';
import { RemoveWorldLandmarkCommand } from './commands/RemoveWorldLandmarkCommand.js';
import { CreateWorldRegionCommand } from './commands/CreateWorldRegionCommand.js';
import { UpdateWorldRegionCommand } from './commands/UpdateWorldRegionCommand.js';
import { RemoveWorldRegionCommand } from './commands/RemoveWorldRegionCommand.js';
import { CreateWorldAnimalDecorationCommand } from './commands/CreateWorldAnimalDecorationCommand.js';
import { RemoveWorldAnimalDecorationCommand } from './commands/RemoveWorldAnimalDecorationCommand.js';
import { RegionKind } from '../core/RegionKind.js';
import { resolveSigningIdentityId } from '../identity/resolveSigningIdentityId.js';
import { Document } from '../core/Document.js';
import { computeLifecycleStatus, describeLifecycleStatus } from './DocumentLifecycleStatus.js';
import { detectSpatialOverlap } from '../core/SpatialOverlap.js';
import { SpatialAllocationPolicy, evaluateSpatialAllocation } from '../core/SpatialAllocationPolicy.js';
import { distanceBetween, isWithinRadius } from '../core/SpatialQuery.js';
import { summarizeDiscoveryDiagnostics } from '../core/DiscoveryDiagnosticsSummary.js';
import { AvatarMovementController } from './AvatarMovementController.js';
import { AvatarMovementConstraint } from './AvatarMovementConstraint.js';
import { AvatarTerrainConstraint } from './AvatarTerrainConstraint.js';
import { AvatarStepConstraint } from './AvatarStepConstraint.js';
import { AvatarTreeConstraint } from './AvatarTreeConstraint.js';
import { AvatarWaterConstraint } from './AvatarWaterConstraint.js';
import { AvatarWildlifeConstraint } from './AvatarWildlifeConstraint.js';
import { AvatarVehicleInteractionController } from './AvatarVehicleInteractionController.js';
import { VehicleRuntimeInstances } from './VehicleRuntimeInstances.js';
import { AvatarAnimalInteractionController } from './AvatarAnimalInteractionController.js';
import { AnimalRuntimeInstances, ANIMAL_RENDER_RADIUS } from './AnimalRuntimeInstances.js';
import { ANIMAL_INTERACTION_RADIUS } from '../core/AvatarAnimalCatchTarget.js';
import { AvatarInventoryStore } from './AvatarInventoryStore.js';
import { AvatarInventoryTransferPeerExchange } from './AvatarInventoryTransferPeerExchange.js';
import { AvatarVehicleMovementController } from './AvatarVehicleMovementController.js';
import { resolveAvatarVehicleMovementCapability } from '../core/AvatarVehicleMovementCapability.js';
import { isValidVehicleSteeringIntent, createVehicleSteeringIntent, VehicleSteeringIntent } from '../core/VehicleSteeringIntent.js';
import { deriveVehicleSteeringInputEvent } from '../core/VehicleSteeringInputAdapter.js';
import { deriveAvatarContinuousMovementInputEvent } from '../core/AvatarContinuousMovementInputAdapter.js';
import { deriveAvatarContinuousMovementIntent } from '../core/AvatarContinuousMovementIntent.js';
import { deriveAvatarContinuousMovementMode } from '../core/AvatarContinuousMovementMode.js';
import { deriveAvatarVehicleBrakingInputFact } from '../core/AvatarVehicleBrakingInputAdapter.js';
import { AvatarVehicleBrakingIntent, deriveAvatarVehicleBrakingIntent } from '../core/AvatarVehicleBrakingIntent.js';
import { DEFAULT_MAX_STEP_HEIGHT } from '../core/BrickWalkability.js';
import { PresenceSyncService } from './PresenceSyncService.js';
import { LocalPresenceStore } from './LocalPresenceStore.js';
import { PresenceTrustBoundary } from './PresenceTrustBoundary.js';
import { RemoteAvatarRegistry } from './RemoteAvatarRegistry.js';
import { toAvatarPresenceAdvertisement } from '../core/AvatarPresenceAdvertisement.js';
import { DEFAULT_AVATAR_TEMPLATE_ID } from '../core/AvatarProfile.js';
import { signAvatarPresenceAdvertisement } from './PresenceSigning.js';
import { summarizePresenceDiagnostics } from '../core/PresenceDiagnosticsSummary.js';
import { AvatarInteractionState } from './spatial-state/AvatarInteractionState.js';
import { AvatarProfileSyncService } from './AvatarProfileSyncService.js';
import { LocalAvatarProfileStore } from './LocalAvatarProfileStore.js';
import { AvatarProfileTrustBoundary } from './AvatarProfileTrustBoundary.js';
import { RemoteAvatarAppearanceRegistry } from './RemoteAvatarAppearanceRegistry.js';
import { toAvatarProfileAdvertisement } from '../core/AvatarProfileAdvertisement.js';
import { signAvatarProfileAdvertisement } from './AvatarProfileSigning.js';
import { computeNearbyAvatars } from '../core/AvatarProximity.js';
import { AvatarInteractionKind, isValidInteractionKind } from '../core/AvatarInteractionKind.js';
import { canPerformInteraction } from '../core/AvatarInteractionCooldown.js';
import { computeFacingYawDegrees } from '../core/AvatarFacing.js';
import { AvatarInteractionSyncService } from './AvatarInteractionSyncService.js';
import { AvatarInteractionTrustBoundary } from './AvatarInteractionTrustBoundary.js';
import { toAvatarInteractionAdvertisement } from '../core/AvatarInteractionAdvertisement.js';
import { signAvatarInteractionAdvertisement } from './AvatarInteractionSigning.js';
import { WorldLocationDirectory, ORIGIN_LOCATION_ID } from './WorldLocationDirectory.js';
import { CameraFocusAnimator } from './CameraFocusAnimator.js';
import { computeCompassHeading } from '../core/CompassHeading.js';
import { CameraPerspective, isValidCameraPerspective, computeCameraFraming } from '../core/CameraPerspective.js';
import { WorldAccessLevel } from '../core/WorldAccessLevel.js';
import { WorldPresenceActivity } from '../core/WorldPresenceActivity.js';
import { WorldSpatialSelection } from '../core/WorldSpatialSelection.js';
import { deriveWorldSpatialActivity } from '../core/WorldSpatialActivity.js';
import { AvatarVerticalState } from '../core/AvatarVerticalState.js';
import { deriveWorldSpatialAnchor } from '../core/WorldSpatialAnchor.js';
import { derivePlaceContexts, findNearestLandmark, describeLocation } from '../core/WorldCurationContext.js';
import { deriveWorldWelcomeContext } from '../core/WorldWelcomeContext.js';
import { regionsContaining, describePlace } from '../core/WorldRegionGeography.js';
import { preferredClaimedName } from '../core/PlaceNamingView.js';
import { groupRegionsByPlaceIdentity } from '../core/PlaceIdentity.js';
import { geographicPlaceForRegion } from '../core/GeographicPlaceResolution.js';
import { buildGeographicPlaceDirectory, geographicPlaceByKey } from '../core/GeographicPlaceDirectory.js';
import {
    geographicPlaceLocationId,
    isGeographicPlaceLocationId,
    geographicPlaceFingerprintKeyFromLocationId,
    deriveNearbyGeographicPlaces,
    searchGeographicPlaces as searchGeographicPlaceRows,
    DEFAULT_NEARBY_GEOGRAPHIC_PLACE_RADIUS
} from '../core/GeographicPlaceNavigation.js';
import { deriveWorldFocusContext, WorldFocusKind } from '../core/WorldFocusContext.js';

const STREAMING_RADIUS = 150;
const NAVIGATION_RADIUS = 80;
const RETRY_DELAYS = [2000, 5000, 10000];
// How often the local avatar's profile re-advertises even when unchanged.
// Appearance is low-frequency state; this only lets a replica that joined
// late catch up on a fire-and-forget transport.
const PROFILE_REPUBLISH_INTERVAL_MS = 15000;
// How often an idle avatar's presence re-advertises. Must stay under a
// receiver's LocalPresenceStore stale/absent window (2500ms/6000ms), or a
// standing-still avatar is pruned from every other replica and reads as
// "they vanished". Each republish bumps `sequence`, since a resend of the same
// sequence is rejected by core/PresenceIngestion.js.
const PRESENCE_HEARTBEAT_INTERVAL_MS = 2000;

// Location-browser radii. NEARBY_RADIUS is small but non-zero: the camera
// essentially never lands exactly on a placement's position (Focus parks it
// at an orbit offset), so "What's here?" needs a tolerance.
const DEFAULT_EXPLORE_RADIUS = 25;
const NEARBY_RADIUS = 5;
// Throttle for runtime vehicle/animal persistence. A ridden vehicle moves
// every frame; one snapshot per second is indistinguishable after a reload.
const RUNTIME_PLACEMENT_PERSISTENCE_INTERVAL_MS = 1000;
// Control is the one modifier-row key with no existing meaning: WASD, Shift,
// Space (jump, still live when mounted), Alt (continuous movement) and 'E'
// (mount) are all taken. See `_processVehicleBrakingInput()`.
const VEHICLE_BRAKE_KEY = 'control';
// Bakes the nearest released animal into World content, or undoes that for
// the nearest decoration. 'G' is the next free home-row key (WASD, Shift,
// Space, Alt, 'E', 'F', Control and arrows are taken).
// See `_processWorldAnimalDecorationInput()`.
const WORLD_ANIMAL_DECORATION_KEY = 'g';
// Arrow keys steer: every nearer key is already claimed, and the Transform
// panel's arrow bindings are Editor-only. See `_processVehicleSteeringInput()`.
const VEHICLE_STEER_LEFT_KEY = 'arrowleft';
const VEHICLE_STEER_RIGHT_KEY = 'arrowright';
// Default radius for getNearbyAvatars(). Separate from NEARBY_RADIUS: that
// asks "is a document at this camera position", this asks "who is close
// enough to interact with".
const DEFAULT_NEARBY_AVATAR_RADIUS = 15;
// How long a local GREET/WAVE/POINT gesture plays before returning to NONE.
// A gesture is a momentary beat, never a mode the user must turn off.
const GESTURE_DURATION_MS = 1800;
// Fallback spawn offset from the first-focused document's position, used
// only when the document's content isn't loaded yet to measure (see
// _safeSpawnPosition()). A fixed offset spawns inside structures built around
// their own origin.
const AVATAR_SPAWN_OFFSET = { x: 3, y: 0, z: 3 };
// The gap left BEYOND a document's own farthest measured corner (see
// _safeSpawnPosition() below) — small on purpose, matching
// AVATAR_SPAWN_OFFSET's own original magnitude: enough that the avatar
// doesn't spawn flush against a wall, not so much that it lands far
// out in unrelated space for a small build.
const AVATAR_SPAWN_CLEARANCE = 3;

// HOME_CAMERA_FRAMING is renderer/CameraState.js's own default framing, so
// goHome() returns to the same pose every session starts from.
// LOCATION_FOCUS_OFFSET matches focusSelection()'s placement-focus offset, so
// both land on the same framing for the same target. The focus glide is short
// so hopping through a Locations list never feels sluggish.
const HOME_CAMERA_FRAMING = { position: { x: 10, y: 10, z: 10 }, target: { x: 0, y: 0, z: 0 } };
const LOCATION_FOCUS_OFFSET = { x: 12, y: 12, z: 12 };
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
	    // application/WorldAuthorizationService.js.
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
	    // application/LocalWorldExperienceStore.js and "Local World Experience &
	    // Return" below.
	    localWorldExperienceStore = null,
	    // Without these a session can't publish/retract/read naming claims or local
	    // name preferences. Kept separate: a claim is signed, shared content; a
	    // preference is unsigned, local-only state.
	    placeNamingClaimUseCase = null,
	    localNamePreferenceStore = null,
	    // Without it a session can't export/import a naming claim. See
	    // application/PlaceNamingClaimExchange.js.
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
        // Runtime vehicle positions (see application/VehicleRuntimeInstances.js).
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
        // application/AnimalRuntimeInstances.js.
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
        // (see application/AvatarInventoryStore.js). Built unconditionally, before
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
    // Local Avatar
    // -----------------------------------------------------------------
    //
    // Renders only the current user's avatar from two inputs it never modifies:
    // AvatarProfileUseCase.getEffectiveAvatar() (what it looks like) and
    // AvatarPresenceSession.current (where it is). See docs/Principles.md, "An
    // Avatar's Location Comes From Presence, Never From The Avatar Itself".
    // This wiring only ever calls the render facade.
    _setupLocalAvatar() {
        if (!this._avatarProfileUseCase || !this._avatarPresenceSession) {
            return;
        }
        const { template, appearance } = this._avatarProfileUseCase.getEffectiveAvatar();
        this._session.setLocalAvatar(template, appearance, this._avatarPresenceSession.current, {
            ridingVehicle: this._isRidingMovableVehicle()
        });
        this._session.setLocalAvatarVisible(this._localAvatarVisible);

        this._avatarProfileSubscription = this._avatarProfileUseCase.onProfileChanged((profile) => {
            const effective = this._avatarProfileUseCase.getEffectiveAvatar();
            this._session.updateLocalAvatarAppearance(effective.template, effective.appearance);
            // An explicit edit publishes immediately, without waiting for the periodic
            // republish.
            this._publishLocalAvatarProfile(profile, Date.now());
        });
        this._avatarPresenceSubscription = this._avatarPresenceSession.onPresenceChanged((presence) => {
            // While riding a movable ground vehicle, presence.position was copied from
            // the vehicle, which already carries terrain elevation. Telling the facade
            // lets it skip its own ground lift so elevation isn't added twice. See
            // RenderWorldViewUseCase's resolveAvatarRenderPosition()/
            // withGroundElevation().
            this._session.updateLocalAvatarPresence(presence, { ridingVehicle: this._isRidingMovableVehicle() });
            this._followAvatarIfEnabled(presence);
            // Publish only when AvatarPresenceSession accepted a new update; an idle
            // avatar publishes nothing here (the heartbeat below covers that). Signed
            // whenever the identity provider can sign (see application/PresenceSigning.js).
            // Visibility is checked before anything reaches the transport, never as a
            // receiver-side filter (see docs/Principles.md, "Visibility Happens Before
            // Broadcasting, Never After"). Without a visibility use case, always
            // advertise.
            const canAdvertise = this._presenceVisibilityUseCase
                ? this._presenceVisibilityUseCase.getPolicy().shouldAdvertise(this._hasFriendContext())
                : true;
            if (this._presenceSyncService && canAdvertise) {
                const advertisement = toAvatarPresenceAdvertisement(presence);
                this._presenceSyncService.publish(signAvatarPresenceAdvertisement(advertisement, this._identityProvider));
            }
            // Refreshed on every accepted update, movement or heartbeat, so the
            // heartbeat interval measures genuine idle time.
            this._lastPresenceUpdateAt = Date.now();
        });

        // The controller owns key state and kinematics; this session decides when it
        // ticks (every render frame) and which key events reach it (only in Avatar
        // Control Mode). Absent when `_session` lacks onAnimationFrame.
        // `movementConstraint`/`treeConstraint` are built once and shared with
        // AvatarVehicleMovementController: building and tree collision are one
        // system, parameterized by the moving body's radius. Terrain and step
        // constraints stay avatar-only.
        const movementConstraint = this._buildAvatarMovementConstraint();
        const treeConstraint = this._buildAvatarTreeConstraint();
        this._avatarMovementController = new AvatarMovementController(
            this._avatarPresenceSession,
            movementConstraint,
            this._buildAvatarTerrainConstraint(),
            this._buildAvatarStepConstraint(),
            treeConstraint,
            // Avatar-only: water depth never affects a mounted vehicle.
            this._buildAvatarWaterConstraint(),
            // Avatar-only, same posture as terrainConstraint/stepConstraint/
            // waterConstraint above — see
            // application/AvatarWildlifeConstraint.js's own header.
            this._buildAvatarWildlifeConstraint()
        );
        // Built from the same avatarPresenceSession as the movement controller.
        // It also gets `_vehicleRuntimeInstances`, so dismount resolves the mounted
        // vehicle's current position by identity rather than from a spawn-anchored
        // requery. One store is shared by this controller, vehicle movement and
        // vehicle rendering.
        this._avatarVehicleInteractionController = new AvatarVehicleInteractionController(
            this._avatarPresenceSession,
            {
                vehicleRuntimeInstances: this._vehicleRuntimeInstances,
                // The same AvatarInventoryStore the animal controller gets.
                avatarInventoryStore: this._avatarInventoryStore
            }
        );
        // Shares `_animalRuntimeInstances` and `_avatarInventoryStore`, as the
        // vehicle controller shares its store.
        this._avatarAnimalInteractionController = new AvatarAnimalInteractionController(
            this._avatarPresenceSession,
            {
                animalRuntimeInstances: this._animalRuntimeInstances,
                avatarInventoryStore: this._avatarInventoryStore
            }
        );
        // Shares `_vehicleRuntimeInstances` with vehicle rendering, and the same
        // `movementConstraint`/`treeConstraint` instances as the avatar: one
        // collision system, two subjects.
        this._avatarVehicleMovementController = new AvatarVehicleMovementController(
            this._vehicleRuntimeInstances,
            movementConstraint,
            treeConstraint
        );
        this._lastAvatarFollowPosition = this._avatarPresenceSession.current.position;
        if (typeof this._session.onAnimationFrame === 'function') {
            this._avatarFrameSubscription = this._session.onAnimationFrame((deltaSeconds) => {
                // Mount/dismount is resolved first, before movement, so a transition this
                // frame is reflected in the movement capability on the same frame rather
                // than one frame late (mount = bicycle, capability = WALK).
                this._avatarVehicleInteractionController.tick();
                // Catching never changes how the avatar moves, so no ordering against
                // movement is needed.
                this._avatarAnimalInteractionController.tick();
                // Resolved after mount/dismount and before movement: the mounted
                // VehicleType goes through resolveAvatarVehicleMovementCapability() into
                // AvatarMovementController#setMovementCapability(). The movement controller
                // never learns about vehicles.
                this._avatarMovementController.setMovementCapability(
                    resolveAvatarVehicleMovementCapability(
                        this._avatarVehicleInteractionController.mountedVehicleType()
                    )
                );
                // Whether this frame's intent goes to the vehicle or to the on-foot pipeline
                // is decided here. The vehicle identity comes from `mount()` and its type
                // from `_vehicleRuntimeInstances`, so riding far from the spawn point never
                // degrades it to VehicleType.NONE.
                const mount = this._avatarVehicleInteractionController.mount();
                const mountedVehicleInstance = mount ? this._vehicleRuntimeInstances.get(mount.vehicleId) : null;
                const vehicleMovementActive = mountedVehicleInstance !== null
                    && this._avatarVehicleMovementController.canMove(mountedVehicleInstance.type);

                if (vehicleMovementActive) {
                    // The vehicle moves and the avatar follows, never the reverse.
                    // `AvatarMovementController#tick()` is not called this frame; this session
                    // decides where the avatar's position comes from while riding.
                    const current = this._avatarPresenceSession.current;
                    const moved = this._avatarVehicleMovementController.tick({
                        seed: this.getWorldSeed(),
                        vehicleId: mount.vehicleId,
                        capability: resolveAvatarVehicleMovementCapability(mountedVehicleInstance.type),
                        movementIntent: this._avatarMovementController.movementState(),
                        currentRotationY: current.rotation.y || 0,
                        deltaSeconds,
                        // Passed verbatim; see `_vehicleSteeringIntent`.
                        steeringIntent: this._vehicleSteeringIntent
                    });
                    // A steering request is a single, discrete turn, not a continuous rate, and
                    // tick() already applied it. Decaying it to explicit NONE (not `null`) keeps
                    // a held key from compounding a turn every frame; the next tick continues
                    // along the new heading.
                    if (this._vehicleSteeringIntent && !this._vehicleSteeringIntent.isNone) {
                        this.setVehicleSteeringIntent(VehicleSteeringIntent.none());
                    }
                    if (moved) {
                        const positionChanged = moved.vehicleInstance.position.x !== current.position.x
                            || moved.vehicleInstance.position.y !== current.position.y
                            || moved.vehicleInstance.position.z !== current.position.z;
                        const rotationChanged = Math.abs(moved.rotationY - (current.rotation.y || 0)) > 1e-6;
                        // "No movement, no sequence advancement, no network traffic" applies to a
                        // stationary mounted vehicle as to an idle avatar.
                        if (positionChanged || rotationChanged) {
                            this._avatarPresenceSession.update({
                                position: moved.vehicleInstance.position,
                                rotation: { y: moved.rotationY }
                            });
                        }
                    }
                } else {
                    // Not moving a vehicle: clear the controller's per-ride state so a later
                    // ride doesn't inherit it, and run the on-foot pipeline.
                    this._avatarVehicleMovementController.reset();
                    this._avatarMovementController.tick(deltaSeconds);
                }
                const now = Date.now();
                // Expires a finished gesture and refreshes the facing override; local
                // presentation only.
                this._updateLocalAvatarInteractionPresentation(now);
                // Periodic profile republish, the only way a replica joining mid-session
                // catches up on appearance (see PROFILE_REPUBLISH_INTERVAL_MS).
                if (this._avatarProfileSyncService && now - this._lastProfilePublishAt >= PROFILE_REPUBLISH_INTERVAL_MS) {
                    this._publishLocalAvatarProfile(this._avatarProfileUseCase.getProfile(), now);
                }
                // periodic presence HEARTBEAT: republishes the
                // CURRENT, UNCHANGED presence once the local avatar has
                // been idle for PRESENCE_HEARTBEAT_INTERVAL_MS. Real movement already
                // published and refreshed `_lastPresenceUpdateAt`, so this never
                // double-publishes. It goes through AvatarPresenceSession.update() so
                // `sequence` advances.
                if (this._avatarPresenceSession && now - this._lastPresenceUpdateAt >= PRESENCE_HEARTBEAT_INTERVAL_MS) {
                    const current = this._avatarPresenceSession.current;
                    this._avatarPresenceSession.update({
                        position: current.position,
                        rotation: current.rotation,
                        animation: current.animation
                    });
                }
            });
        }
    }

    // Collision is derived from state this session already owns:
    // `_loadedDocuments` (see docs/Principles.md, "The Local Avatar Is
    // Constrained By Collision Geometry Currently Available To This Replica"),
    // `_getWorldPosition` and `_registry`. Always built; with nothing streamed in
    // it finds no obstacles.
    _buildAvatarMovementConstraint() {
        return new AvatarMovementConstraint({
            loadedDocuments: this._loadedDocuments,
            getWorldPosition: (documentId) => this._getWorldPosition(documentId),
            brickRegistry: this._registry,
            // Same constant as _buildAvatarStepConstraint(), so the bricks excluded from
            // horizontal collision as climbable are the ones the step constraint climbs.
            maxStepHeight: DEFAULT_MAX_STEP_HEIGHT,
            // Uses the renderer's structure resolver so placed structures are as solid as
            // ordinary buildings.
            structureResolver: this._structureResolver
        });
    }

    // Terrain is a pure function of (seed, x, z), so this needs no session
    // state; the constraint's defaults (DEFAULT_WORLD_SEED, default slope limit)
    // are what a real session wants.
    _buildAvatarTerrainConstraint() {
        return new AvatarTerrainConstraint();
    }

    // Derived from the same streamed-in geometry as the movement constraint.
    // With nothing loaded, terrain alone decides support height.
    _buildAvatarStepConstraint() {
        return new AvatarStepConstraint({
            loadedDocuments: this._loadedDocuments,
            getWorldPosition: (documentId) => this._getWorldPosition(documentId),
            brickRegistry: this._registry,
            // Structure tops must be as walkable as ordinary buildings.
            structureResolver: this._structureResolver
        });
    }

    // Tree placement is a pure function of (seed, x, z); defaults suffice.
    _buildAvatarTreeConstraint() {
        return new AvatarTreeConstraint();
    }

    // Water depth is a pure function of (seed, x, z); defaults suffice.
    _buildAvatarWaterConstraint() {
        return new AvatarWaterConstraint();
    }

    // Animal placement is a pure function of (seed, x, z); defaults suffice.
    _buildAvatarWildlifeConstraint() {
        return new AvatarWildlifeConstraint();
    }

    // -----------------------------------------------------------------
    // Remote Avatar Presence
    // -----------------------------------------------------------------
    //
    // Independent of hasLocalAvatar(): a logged-out viewer still sees other
    // avatars (see docs/Principles.md, "Watching Presence Never Requires Having
    // One"). PresenceSyncService owns transport and ingestion;
    // RemoteAvatarRegistry owns reconciliation and interpolation. This method
    // only decides when pull()/sync()/tick() run (once per frame) and never
    // touches the render facade itself.
    _setupRemoteAvatars() {
        if (!this._presenceBroadcastProvider) {
            return;
        }
        const localAvatarId = this._avatarPresenceSession ? this._avatarPresenceSession.current.avatarId : null;
        // Each trust boundary gets its own instance with the same `isBlocked`
        // predicate: presence, profile and interaction authority stay independently
        // established.
        const isBlocked = this._isBlocked || (() => false);
        this._presenceSyncService = new PresenceSyncService(this._presenceBroadcastProvider, {
            localAvatarId,
            store: new LocalPresenceStore({ trustBoundary: new PresenceTrustBoundary({ isBlocked }) })
        });

        // Placeholder template+appearance for remote avatars until a profile
        // arrives, resolved here rather than in the renderer (see
        // docs/Principles.md, "A Template Is A Closed Vocabulary, Not An Asset
        // Loader"). Without a registry, presence is still synced but produces no
        // visual.
        let defaultTemplate = null;
        let defaultAppearance = null;
        if (this._avatarTemplateRegistry) {
            defaultTemplate = this._avatarTemplateRegistry.get(DEFAULT_AVATAR_TEMPLATE_ID);
            defaultAppearance = defaultTemplate ? defaultTemplate.defaultAppearance : null;
        }

        // Without a profile provider, remote avatars keep the placeholder. See
        // docs/Principles.md, "Appearance And Position Are Different Lifecycles,
        // Never One Message."
        if (this._avatarProfileBroadcastProvider) {
            this._avatarProfileSyncService = new AvatarProfileSyncService(this._avatarProfileBroadcastProvider, {
                localAvatarId,
                store: new LocalAvatarProfileStore({ trustBoundary: new AvatarProfileTrustBoundary({ isBlocked }) })
            });
            this._remoteAvatarAppearanceRegistry = new RemoteAvatarAppearanceRegistry(
                this._session, this._avatarProfileSyncService, this._avatarTemplateRegistry,
                { defaultTemplate, defaultAppearance }
            );
        }

        // Without an interaction provider, received gestures are never played. See
        // docs/Principles.md, "Presence Describes An Avatar's Current State;
        // Interaction Describes An Event That Happened."
        if (this._avatarInteractionBroadcastProvider) {
            this._avatarInteractionSyncService = new AvatarInteractionSyncService(this._avatarInteractionBroadcastProvider, {
                localAvatarId,
                trustBoundary: new AvatarInteractionTrustBoundary({ isBlocked })
            });
        }

        this._remoteAvatarRegistry = new RemoteAvatarRegistry(this._session, {
            defaultTemplate, defaultAppearance,
            appearanceResolver: this._remoteAvatarAppearanceRegistry
        });
        if (typeof this._session.setRemoteAvatarsVisible === 'function') {
            this._session.setRemoteAvatarsVisible(this._remoteAvatarsVisible);
        }

        if (typeof this._session.onAnimationFrame === 'function') {
            this._remoteAvatarFrameSubscription = this._session.onAnimationFrame(() => {
                const now = Date.now();
                // Drain profiles before presence sync creates new visuals. The two
                // transports race, so a profile that arrived this frame must be in
                // LocalAvatarProfileStore before RemoteAvatarRegistry.sync() resolves a new
                // avatar's appearance, or it renders the placeholder needlessly.
                if (this._avatarProfileSyncService) {
                    this._avatarProfileSyncService.pull();
                }
                const knownPresences = this._presenceSyncService.pull(now);
                this._remoteAvatarRegistry.sync(knownPresences, now);
                this._remoteAvatarRegistry.tick(now);
                // Both reuse this frame's knownPresences; no extra query.
                this._pruneAvatarInteractionIfGone(knownPresences);
                this._followRemoteAvatarIfEnabled(now);
                // After sync() settles which avatars exist, apply changed profileRevisions
                // to avatars that already had a visual.
                if (this._avatarProfileSyncService) {
                    this._remoteAvatarAppearanceRegistry.sync(this._remoteAvatarRegistry.knownAvatarIds());
                }
                // Plays newly accepted interaction events, then expires finished ones. An
                // event is rendered once and forgotten, never a "known list".
                if (this._avatarInteractionSyncService) {
                    for (const event of this._avatarInteractionSyncService.pull()) {
                        this._applyRemoteAvatarInteraction(event, now);
                    }
                }
                this._expireRemoteAvatarGestures(now);
            });
        }
    }

    // Plays one accepted interaction on the sender's own avatar, keyed by
    // `event.avatarId`, never `targetAvatarId`: a wave is rendered on the
    // waver (see core/AvatarInteractionAdvertisement.js). No-op if the sender
    // isn't a known remote avatar or the facade lacks gestures.
    _applyRemoteAvatarInteraction(event, now) {
        if (!this._remoteAvatarRegistry || !this._remoteAvatarRegistry.has(event.avatarId)) {
            return;
        }
        if (!this._session || typeof this._session.setRemoteAvatarGesture !== 'function') {
            return;
        }
        this._session.setRemoteAvatarGesture(event.avatarId, event.kind);
        this._remoteAvatarGestureExpiry.set(event.avatarId, now + GESTURE_DURATION_MS);
    }

    // Clears a received gesture after GESTURE_DURATION_MS, with no stop message
    // from the sender (see docs/Principles.md, "Presence Describes An Avatar's
    // Current State; Interaction Describes An Event That Happened"). Same
    // duration as a local gesture, so everyone sees it for the same time.
    _expireRemoteAvatarGestures(now) {
        if (this._remoteAvatarGestureExpiry.size === 0) {
            return;
        }
        if (!this._session || typeof this._session.setRemoteAvatarGesture !== 'function') {
            return;
        }
        for (const [avatarId, expiresAt] of this._remoteAvatarGestureExpiry) {
            if (now >= expiresAt) {
                this._remoteAvatarGestureExpiry.delete(avatarId);
                this._session.setRemoteAvatarGesture(avatarId, null);
            }
        }
    }

    // How many OTHER avatars this replica currently believes are
    // present/stale (never counts the local avatar) — a debug/UI
    // surface, not something anything internal reads.
    getKnownRemoteAvatarCount() {
        return this._remoteAvatarRegistry ? this._remoteAvatarRegistry.size : 0;
    }

    // Trusted/stale/conflicting/unavailable counts over the known-presences
    // list. Reads listKnownPresences(), never pull(), so the UI never drains the
    // per-frame loop's inbox.
    getRemoteAvatarDiagnostics() {
        if (!this._presenceSyncService) {
            return summarizePresenceDiagnostics([]);
        }
        return summarizePresenceDiagnostics(this._presenceSyncService.listKnownPresences(Date.now()));
    }

    // "Who is near me?" as a derived, local fact (see docs/Principles.md,
    // "Proximity Is Derived, Never Announced"), over the same trusted list that
    // drives rendering. Requires a local avatar; returns [] otherwise.
    getNearbyAvatars(radius = DEFAULT_NEARBY_AVATAR_RADIUS) {
        if (!this._avatarPresenceSession || !this._presenceSyncService) {
            return [];
        }
        const localPosition = this._avatarPresenceSession.current.position;
        const knownPresences = this._presenceSyncService.listKnownPresences(Date.now());
        return computeNearbyAvatars({ localPosition, knownPresences, radius });
    }

    // The one place a friendly name is resolved for any avatarId. Falls back in
    // order: displayName, ownerIdentity, avatarId, then "You" for the local
    // avatar. Never throws or returns an empty string.
    getAvatarDisplayName(avatarId) {
        if (this.isLocalAvatarId(avatarId)) {
            const profile = this._avatarProfileUseCase ? this._avatarProfileUseCase.getProfile() : null;
            return (profile && (profile.displayName || profile.ownerIdentity)) || 'You';
        }
        const knownProfile = this._avatarProfileSyncService ? this._avatarProfileSyncService.getKnownProfile(avatarId) : null;
        if (knownProfile && knownProfile.displayName) {
            return knownProfile.displayName;
        }
        const known = this._presenceSyncService ? this._presenceSyncService.listKnownPresences(Date.now()) : [];
        const entry = known.find((k) => k.advertisement.avatarId === avatarId);
        return (entry && entry.advertisement.ownerIdentity) || avatarId;
    }

    // Targets `avatarId` without a screen-space pick, for the Nearby Avatars
    // panel; same outcome as pick()'s avatar branch (see docs/Principles.md,
    // "Avatars Are Never Document Selection"). Unlike a raycast hit, a UI id can
    // be stale, so it must be known first. Returns the new state, or null.
    targetAvatar(avatarId) {
        const known = this.isLocalAvatarId(avatarId)
            || Boolean(this._remoteAvatarRegistry && this._remoteAvatarRegistry.has(avatarId));
        if (!known) {
            return null;
        }
        this._setAvatarInteraction(AvatarInteractionState.avatar(avatarId));
        this._setSpatialSelection(SpatialSelectionState.empty());
        if (this._session) {
            this._session.clearSelection();
            this._session.clearHover();
        }
        this._refreshGizmo();
        return this._avatarInteraction;
    }

    // GREET/WAVE/POINT at the current target: a local, presentation-only
    // gesture (see docs/Principles.md, "Observation Does Not Imply Authority,
    // And Interaction Does Not Imply Control"). It never touches AvatarPresence;
    // it is rendered on the performer's own avatar.
    //
    // Requires a remote target and is rate-limited by
    // core/AvatarInteractionCooldown.js. Returns true when accepted, false when
    // there's no target, the kind is invalid, or it's on cooldown.
    performAvatarInteraction(kind) {
        if (this._avatarInteraction.isEmpty || this.isLocalAvatarId(this._avatarInteraction.avatarId)) {
            return false;
        }
        if (!isValidInteractionKind(kind) || kind === AvatarInteractionKind.NONE) {
            return false;
        }
        const now = Date.now();
        if (!canPerformInteraction(this._lastInteractionPerformedAt, now)) {
            return false;
        }
        const targetAvatarId = this._avatarInteraction.avatarId;
        this._lastInteractionPerformedAt = now;
        this._setAvatarInteraction(this._avatarInteraction.withInteraction(kind, now));
        // Publishing never changes the return value: a gesture that fails to
        // publish still happened locally.
        this._publishAvatarInteraction(kind, targetAvatarId, now);
        return true;
    }

    // The one place a gesture is signed and sent. Uses the same visibility gate
    // as presence (see docs/Principles.md, "Presence And Profile Share One
    // Publication Gate"): HIDDEN/empty-FRIENDS never reaches the transport. One
    // fire-and-forget publish, never republished; a late joiner shouldn't catch
    // up on a missed gesture.
    _publishAvatarInteraction(kind, targetAvatarId, now) {
        if (!this._avatarInteractionSyncService || !this._avatarPresenceSession) {
            return;
        }
        const canAdvertise = this._presenceVisibilityUseCase
            ? this._presenceVisibilityUseCase.getPolicy().shouldAdvertise(this._hasFriendContext())
            : true;
        if (!canAdvertise) {
            return;
        }
        this._localInteractionSequence += 1;
        const presence = this._avatarPresenceSession.current;
        const advertisement = toAvatarInteractionAdvertisement({
            avatarId: presence.avatarId,
            ownerIdentity: presence.ownerIdentity,
            kind,
            targetAvatarId,
            sequence: this._localInteractionSequence,
            timestamp: now
        });
        this._avatarInteractionSyncService.publish(signAvatarInteractionAdvertisement(advertisement, this._identityProvider));
    }

    // A pure client rendering preference, exactly like
    // isLocalAvatarVisible/setLocalAvatarVisible — never touches
    // presence sync, the known-remote-avatar set, or anything
    // persisted; only which already-built visuals are actually in the
    // scene.
    isRemoteAvatarsVisible() {
        return this._remoteAvatarsVisible;
    }

    setRemoteAvatarsVisible(visible) {
        this._remoteAvatarsVisible = Boolean(visible);
        if (this._session && typeof this._session.setRemoteAvatarsVisible === 'function') {
            this._session.setRemoteAvatarsVisible(this._remoteAvatarsVisible);
        }
    }

    // The one place a profile advertisement is signed and sent: on an explicit
    // edit (immediately) and from the periodic republish tick. When
    // avatarProfileVisibilityUseCase is wired, profile uses its own gate,
    // independent of presence (see docs/Principles.md, "Profile Gets Its Own
    // Publication Gate, Superseding The Shared One"); otherwise it falls back to
    // the shared gate.
    _publishLocalAvatarProfile(profile, now) {
        this._lastProfilePublishAt = now;
        if (!this._avatarProfileSyncService) {
            return;
        }
        const canAdvertise = this._avatarProfileVisibilityUseCase
            ? this._avatarProfileVisibilityUseCase.getPolicy().shouldAdvertise(this._hasFriendContext())
            : (this._presenceVisibilityUseCase ? this._presenceVisibilityUseCase.getPolicy().shouldAdvertise(this._hasFriendContext()) : true);
        if (!canAdvertise) {
            return;
        }
        const advertisement = toAvatarProfileAdvertisement(profile);
        this._avatarProfileSyncService.publish(signAvatarProfileAdvertisement(advertisement, this._identityProvider));
    }

    // The one place `_hasFriend` becomes the `{ hasFriend }` context both
    // visibility policies accept. Called fresh every time, never cached.
    _hasFriendContext() {
        return { hasFriend: this._hasFriend ? Boolean(this._hasFriend()) : false };
    }

    // Shifts the camera by the avatar's movement delta via moveCamera() only
    // (see docs/Principles.md, "Following The Avatar Never Redefines What The
    // Camera Is Looking At"), so following never changes the focused/active
    // document or forks anything. Always tracks the position; only moves the
    // camera when follow is enabled.
    _followAvatarIfEnabled(presence) {
        const previous = this._lastAvatarFollowPosition;
        this._lastAvatarFollowPosition = presence.position;
        // A selected Camera Perspective takes over on every presence update with a
        // fixed offset from the avatar, superseding plain follow (see
        // core/CameraPerspective.js and docs/Principles.md, "Camera Perspective
        // Determines An Offset; It Never Replaces The Camera Machinery"). Applies
        // whether or not `_followAvatarEnabled` is set.
        if (this._cameraPerspective && this._spatialCameraController) {
            this._applyCameraPerspectiveFraming(presence.position, presence.rotation ? presence.rotation.y : null);
            return;
        }
        if (!this._followAvatarEnabled || !this._spatialCameraController || !previous) {
            return;
        }
        const delta = {
            x: presence.position.x - previous.x,
            y: presence.position.y - previous.y,
            z: presence.position.z - previous.z
        };
        if (delta.x === 0 && delta.y === 0 && delta.z === 0) {
            return;
        }
        this._spatialCameraController.moveCamera(delta);
    }

    // Applied instantly each update rather than through _beginCameraFocus()'s
    // one-shot glide; per-update framing is already smooth tracking.
    _applyCameraPerspectiveFraming(position, headingDegrees) {
        const framing = computeCameraFraming(this._cameraPerspective, position, headingDegrees);
        if (framing) {
            this._spatialCameraController.applyFraming(framing);
        }
    }

    // Whether Avatar Control Mode currently captures W/A/S/D/Shift/
    // Space — see avatarKeyDown/avatarKeyUp. An explicit toggle, never
    // implied by focus/hover, so typing in a search box can never
    // accidentally walk the avatar away — see the design doc's own
    // concern and docs/Principles.md.
    isAvatarControlModeActive() {
        return this._avatarControlModeActive;
    }

    // The local avatar's AvatarVehicleMount, or null when unmounted or when no
    // avatar exists.
    avatarVehicleMount() {
        return this._avatarVehicleInteractionController
            ? this._avatarVehicleInteractionController.mount()
            : null;
    }

    // Whether presence.position is currently copied from a movable, mounted
    // vehicle (which already includes terrain elevation) rather than on-foot.
    // Mirrors the frame loop's `vehicleMovementActive` gate: being mounted on
    // something that can't move (AERIAL_VEHICLE/DRONE) doesn't count. Any
    // missing collaborator reads as "not riding".
    _isRidingMovableVehicle() {
        if (!this._avatarVehicleInteractionController || !this._vehicleRuntimeInstances || !this._avatarVehicleMovementController) {
            return false;
        }
        const mount = this._avatarVehicleInteractionController.mount();
        if (!mount) {
            return false;
        }
        const mountedVehicleInstance = this._vehicleRuntimeInstances.get(mount.vehicleId);
        return mountedVehicleInstance !== null
            && this._avatarVehicleMovementController.canMove(mountedVehicleInstance.type);
    }

    // Pass-through to AvatarVehicleInteractionController#vehicleInteractionState();
    // null when no avatar exists.
    avatarVehicleInteractionState() {
        return this._avatarVehicleInteractionController
            ? this._avatarVehicleInteractionController.vehicleInteractionState()
            : null;
    }

    // Pass-through to AvatarVehicleInteractionController#storeInteractionState();
    // null when no avatar exists.
    avatarStoreInteractionState() {
        return this._avatarVehicleInteractionController
            ? this._avatarVehicleInteractionController.storeInteractionState()
            : null;
    }

    // Pass-through to AvatarAnimalInteractionController#catchInteractionState();
    // null when no avatar exists.
    avatarAnimalInteractionState() {
        return this._avatarAnimalInteractionController
            ? this._avatarAnimalInteractionController.catchInteractionState()
            : null;
    }

    // What a 'G' press would do right now (decorate or undecorate), without the
    // caller recomputing proximity or duplicating
    // toggleNearestAnimalDecorationHere()'s priority rule. Separate from
    // avatarAnimalInteractionState(): the animal controller knows nothing about
    // Documents or authorization. Null when no avatar exists.
    animalDecorationInteractionState() {
        const avatarPos = this.getAvatarPosition();
        if (!avatarPos) {
            return null;
        }
        const releaseTarget = this._animalRuntimeInstances.nearestReleased(avatarPos, ANIMAL_INTERACTION_RADIUS);
        if (releaseTarget) {
            return Object.freeze({
                canDecorate: true,
                canUndecorate: false,
                species: releaseTarget.species,
                targetAnimalId: releaseTarget.id,
                targetDecorationId: null
            });
        }
        const decorationTarget = this._nearestAnimalDecorationNear(avatarPos, ANIMAL_INTERACTION_RADIUS);
        return Object.freeze({
            canDecorate: false,
            canUndecorate: decorationTarget !== null,
            species: decorationTarget ? decorationTarget.decoration.species : null,
            targetAnimalId: null,
            targetDecorationId: decorationTarget ? decorationTarget.decoration.id : null
        });
    }

    // Accessor for the transfer exchange, or null without a peer stack. The
    // caller reads carried entries from `avatarInventoryStore()` and calls
    // sendOffer()/acceptOffer()/declineOffer() directly; this session has no
    // transfer policy of its own.
    avatarInventoryTransferPeerExchange() {
        return this._avatarInventoryTransferPeerExchange;
    }

    // The local AvatarInventoryStore, exposed so a caller can list every carried
    // entry, not just the per-kind affordances.
    avatarInventoryStore() {
        return this._avatarInventoryStore;
    }

    // The one way `_vehicleSteeringIntent` is set; programmatic, not a key
    // binding. `intent` must be null (release) or a VehicleSteeringIntent;
    // anything else is treated as null. It only records the request; the frame
    // loop decides each frame whether a movable mounted vehicle applies it.
    setVehicleSteeringIntent(intent) {
        this._vehicleSteeringIntent = isValidVehicleSteeringIntent(intent) ? intent : null;
    }

    // Read-back of what setVehicleSteeringIntent() last recorded.
    vehicleSteeringIntent() {
        return this._vehicleSteeringIntent;
    }

    // Turning the mode off releases every held key at once, so none stays stuck
    // after a lost keyup (e.g. focus moved to a dialog mid-press). `_altDown` and
    // `_shiftDown` reset for the same reason. The continuous movement intent and
    // mode are left alone: leaving Avatar Control Mode never cancels a
    // deliberately started continuous walk or run.
    setAvatarControlMode(active) {
        this._avatarControlModeActive = Boolean(active);
        this._altDown = false;
        this._shiftDown = false;
        // Reset the steer hold bits too, or a key still held when the mode comes
        // back on would read as a repeat and never fire.
        this._vehicleSteerLeftHeld = false;
        this._vehicleSteerRightHeld = false;
        // Same for 'G'.
        this._decorateKeyHeld = false;
        if (!this._avatarControlModeActive && this._avatarMovementController) {
            this._avatarMovementController.releaseAll();
        }
        // The interaction key ('E') must not read as held after the mode turns off.
        // `mount` is untouched; see AvatarVehicleInteractionController#releaseAll.
        if (!this._avatarControlModeActive && this._avatarVehicleInteractionController) {
            this._avatarVehicleInteractionController.releaseAll();
        }
        // Same for the catch/release key ('F').
        if (!this._avatarControlModeActive && this._avatarAnimalInteractionController) {
            this._avatarAnimalInteractionController.releaseAll();
        }
        // Braking is a held-key fact, not a persistent toggle, so it has no way to
        // decay once this session forgets whether Control is down. Force it to NONE,
        // or a lost keyup would leave the avatar braking forever.
        if (!this._avatarControlModeActive && this._avatarMovementController) {
            this._avatarMovementController.setVehicleBrakingIntent(AvatarVehicleBrakingIntent.NONE);
        }
    }

    // Avatar Control Mode is persistent local interaction state (see
    // docs/Principles.md, "User-Controlled Avatar Mode Is Persistent Local
    // Interaction State"). This releases held keys without turning the mode off,
    // e.g. after a window blur swallows a keyup (see WorldView.js onWindowBlur).
    releaseAvatarMovementKeys() {
        this._altDown = false;
        this._shiftDown = false;
        // Also the steer hold bits; see setAvatarControlMode().
        this._vehicleSteerLeftHeld = false;
        this._vehicleSteerRightHeld = false;
        // Also the decorate key.
        this._decorateKeyHeld = false;
        if (this._avatarMovementController) {
            this._avatarMovementController.releaseAll();
        }
        // Also the interaction key.
        if (this._avatarVehicleInteractionController) {
            this._avatarVehicleInteractionController.releaseAll();
        }
        // Also the catch/release key.
        if (this._avatarAnimalInteractionController) {
            this._avatarAnimalInteractionController.releaseAll();
        }
        // Also the brake key, which needs an explicit reset; see
        // setAvatarControlMode().
        if (this._avatarMovementController) {
            this._avatarMovementController.setVehicleBrakingIntent(AvatarVehicleBrakingIntent.NONE);
        }
    }

    // Returns true if `key` was consumed (so the UI can preventDefault); false
    // when control mode is off, no avatar exists, or the key is unrelated.
    //
    // The raw key also goes through `_processContinuousMovementInput()`, which
    // turns an Alt + W/S chord into setContinuousMovementIntent() calls. Gated
    // by the same early return as ordinary movement.
    avatarKeyDown(key) {
        if (!this._avatarControlModeActive || !this._avatarMovementController) {
            return false;
        }
        this._processContinuousMovementInput(key, 'keydown');
        const movementConsumed = this._avatarMovementController.keyDown(key);
        // Tried independently of movement; either controller recognizing the key
        // consumes the event.
        const vehicleInteractionConsumed = this._avatarVehicleInteractionController
            ? this._avatarVehicleInteractionController.keyDown(key)
            : false;
        // Tried independently: 'F' is neither a movement nor a vehicle key.
        const animalInteractionConsumed = this._avatarAnimalInteractionController
            ? this._avatarAnimalInteractionController.keyDown(key)
            : false;
        // Tried independently: Control is not a movement key.
        const vehicleBrakingConsumed = this._processVehicleBrakingInput(key, 'keydown');
        // Tried independently: the arrow keys are not movement keys.
        const vehicleSteeringConsumed = this._processVehicleSteeringInput(key, 'keydown');
        // Tried independently: 'G' is claimed by nothing above.
        const worldAnimalDecorationConsumed = this._processWorldAnimalDecorationInput(key, 'keydown');
        return movementConsumed || vehicleInteractionConsumed || animalInteractionConsumed || vehicleBrakingConsumed || vehicleSteeringConsumed || worldAnimalDecorationConsumed;
    }

    avatarKeyUp(key) {
        if (!this._avatarMovementController) {
            return false;
        }
        // Not gated on control mode, so an Alt release after the mode turned off
        // still clears `_altDown`. Key-up never produces a transition, so this only
        // updates the hold bit.
        this._processContinuousMovementInput(key, 'keyup');
        // Always forwarded, even if control mode was switched off
        // between this key's down and up — so a key held before the
        // mode was toggled off still cleanly releases instead of
        // leaving stale state inside the controller (releaseAll()
        // already covers the same case on the toggle itself; this
        // covers the ordinary "released after mode already off" case).
        const movementConsumed = this._avatarMovementController.keyUp(key);
        // Always forwarded, like movement's keyUp.
        const vehicleInteractionConsumed = this._avatarVehicleInteractionController
            ? this._avatarVehicleInteractionController.keyUp(key)
            : false;
        // Always forwarded, like movement's keyUp.
        const animalInteractionConsumed = this._avatarAnimalInteractionController
            ? this._avatarAnimalInteractionController.keyUp(key)
            : false;
        // Always forwarded, so a Control release after the mode turned off still
        // clears the braking request.
        const vehicleBrakingConsumed = this._processVehicleBrakingInput(key, 'keyup');
        // Always forwarded, so an arrow release after the mode turned off still
        // clears the steering hold bit.
        const vehicleSteeringConsumed = this._processVehicleSteeringInput(key, 'keyup');
        // Always forwarded, so `_decorateKeyHeld` clears even if the mode turned off
        // mid-press.
        const worldAnimalDecorationConsumed = this._processWorldAnimalDecorationInput(key, 'keyup');
        return movementConsumed || vehicleInteractionConsumed || animalInteractionConsumed || vehicleBrakingConsumed || vehicleSteeringConsumed || worldAnimalDecorationConsumed;
    }

    // The one seam from a raw key to setContinuousMovementIntent() and
    // setContinuousMovementMode(). This session carries `_altDown`/`_shiftDown`,
    // the only state core/AvatarContinuousMovementInputAdapter.js needs a caller
    // to hold, and reads the current intent from the controller rather than
    // keeping a copy. Every decision is made by the pure adapter and transition
    // functions; nothing here re-implements them. Direction and mode come from
    // the same `transition`, so one key event updates both together. Mode needs
    // no current value fed back (see core/AvatarContinuousMovementMode.js).
    _processContinuousMovementInput(key, type) {
        const { altDown, shiftDown, transition } = deriveAvatarContinuousMovementInputEvent({
            altDown: this._altDown,
            shiftDown: this._shiftDown,
            key,
            type
        });
        this._altDown = altDown;
        this._shiftDown = shiftDown;
        if (transition && this._avatarMovementController) {
            this._avatarMovementController.setContinuousMovementIntent(
                deriveAvatarContinuousMovementIntent({
                    currentIntent: this._avatarMovementController.continuousMovementIntent(),
                    direction: transition.direction,
                    activationRequested: transition.activationRequested
                })
            );
            this._avatarMovementController.setContinuousMovementMode(
                deriveAvatarContinuousMovementMode({
                    activationRequested: transition.activationRequested,
                    runRequested: transition.runRequested
                })
            );
        }
    }

    // The seam that maps a physical key to
    // `_avatarMovementController.setVehicleBrakingIntent()`. See
    // VEHICLE_BRAKE_KEY for why Control.
    //
    // A thin translation, not a decision layer: it turns Control's down/up into
    // the `type: 'brakedown'/'brakeup'` core/AvatarVehicleBrakingInputAdapter.js
    // expects. Everything after that (what BRAKE means, whether it reaches the
    // simulation) is decided by the braking intent chain.
    //
    // Stateless across calls: there is no chord to resolve, so holding Control
    // reports BRAKE on every repeat keydown and releasing reports NONE, the
    // level-driven shape core/AvatarVehicleBrakingIntent.js requires.
    //
    // Never vehicle- or movement-aware: it doesn't check the mount, the
    // capability or whether the avatar is moving. An unrelated key returns
    // false and calls nothing.
    _processVehicleBrakingInput(key, type) {
        if (String(key || '').toLowerCase() !== VEHICLE_BRAKE_KEY) {
            return false;
        }
        if (this._avatarMovementController) {
            const { brakeRequested } = deriveAvatarVehicleBrakingInputFact({
                type: type === 'keyup' ? 'brakeup' : 'brakedown'
            });
            this._avatarMovementController.setVehicleBrakingIntent(
                deriveAvatarVehicleBrakingIntent({ brakeRequested })
            );
        }
        return true;
    }

    // The seam that maps WORLD_ANIMAL_DECORATION_KEY ('G') to
    // toggleNearestAnimalDecorationHere(), which picks decorate or undecorate the
    // way 'F' picks catch or release.
    //
    // Rising edge only: decorating is one-shot, so `_decorateKeyHeld` makes a
    // held 'G' fire once, not on every key-repeat.
    //
    // Never lets an error escape. The decorate/undecorate methods throw for setup
    // problems (no avatar, no editable document, not authorized, not signed in),
    // expecting a UI caller to guard() them. This is that guard for the keyboard:
    // a stray 'G' that does nothing is the right outcome. The key is reported
    // consumed either way.
    _processWorldAnimalDecorationInput(key, type) {
        if (String(key || '').toLowerCase() !== WORLD_ANIMAL_DECORATION_KEY) {
            return false;
        }
        if (type === 'keyup') {
            this._decorateKeyHeld = false;
            return true;
        }
        if (!this._decorateKeyHeld) {
            this._decorateKeyHeld = true;
            try {
                this.toggleNearestAnimalDecorationHere();
            } catch {
                // See this method's own header, "Never lets an error escape."
            }
        }
        return true;
    }

    // The seam that maps the arrow keys to `setVehicleSteeringIntent()`. Not
    // 'a'/'d': those already drive the avatar's continuous held-key turning
    // (`turnAxis` -> `rotationY`) on foot and while riding, a separate turning
    // model that must stay independent of discrete steering pulses.
    //
    // A thin translation, not a decision layer: it turns an arrow key's down/up
    // into the `type: 'steerleftdown'/'steerleftup'/'steerrightdown'/
    // 'steerrightup'` core/VehicleSteeringInputAdapter.js expects, threading the
    // `leftHeld`/`rightHeld` bits through `_vehicleSteerLeftHeld`/
    // `_vehicleSteerRightHeld`. Whether a press is new, what LEFT/RIGHT means and
    // whether it reaches the simulation are decided downstream.
    //
    // Never vehicle-, movement- or heading-aware: the frame loop decides whether
    // a pending request reaches a moving vehicle. An unrelated key returns false
    // and touches no hold bit.
    _processVehicleSteeringInput(key, type) {
        const normalizedKey = String(key || '').toLowerCase();
        let controlType;
        if (normalizedKey === VEHICLE_STEER_LEFT_KEY) {
            controlType = type === 'keyup' ? 'steerleftup' : 'steerleftdown';
        } else if (normalizedKey === VEHICLE_STEER_RIGHT_KEY) {
            controlType = type === 'keyup' ? 'steerrightup' : 'steerrightdown';
        } else {
            return false;
        }

        const { leftHeld, rightHeld, direction } = deriveVehicleSteeringInputEvent({
            leftHeld: this._vehicleSteerLeftHeld,
            rightHeld: this._vehicleSteerRightHeld,
            type: controlType
        });
        this._vehicleSteerLeftHeld = leftHeld;
        this._vehicleSteerRightHeld = rightHeld;
        if (direction) {
            this.setVehicleSteeringIntent(createVehicleSteeringIntent(direction));
        }
        return true;
    }

    // Whether the camera currently follows the local avatar's
    // movement — see _followAvatarIfEnabled above. A pure client
    // camera preference, exactly like "Show My Avatar": never touches
    // AvatarProfile, AvatarPresence, _focusedDocumentId, or
    // _activeDocumentId.
    isFollowingAvatar() {
        return this._followAvatarEnabled;
    }

    setFollowAvatar(enabled) {
        this._followAvatarEnabled = Boolean(enabled);
        if (this._followAvatarEnabled && this._avatarPresenceSession) {
            // Re-anchor to the CURRENT position rather than whatever
            // was last recorded while follow was off — otherwise the
            // first movement after re-enabling follow would yank the
            // camera through every step the avatar took while
            // unobserved.
            this._lastAvatarFollowPosition = this._avatarPresenceSession.current.position;
            // There is one camera: following your own avatar and a remote one are
            // mutually exclusive. See followAvatarId().
            this._stopFollowingRemoteAvatarInternal();
        }
    }

    // The current Camera Perspective, or `null` for the free/orbit camera.
    getCameraPerspective() {
        return this._cameraPerspective;
    }

    // Sets the Camera Perspective (a core/CameraPerspective.js value), or clears
    // it with `null`. Anything else is rejected (returns false).
    //
    // Turning one on re-frames immediately, so choosing "Bird's-Eye" while
    // standing still moves the camera. Turning it off
    // does NOT snap the camera anywhere; the orbit camera resumes from where the
    // perspective left it. Independent of
    // `_followAvatarEnabled`, but a set perspective always wins.
    setCameraPerspective(perspective) {
        if (perspective !== null && !isValidCameraPerspective(perspective)) {
            return false;
        }
        this._cameraPerspective = perspective;
        if (perspective && this._avatarPresenceSession) {
            const presence = this._avatarPresenceSession.current;
            this._applyCameraPerspectiveFraming(presence.position, presence.rotation ? presence.rotation.y : null);
        }
        return true;
    }

    // Following a remote avatar. A separate surface from setFollowAvatar/
    // isFollowingAvatar rather than a generalized replacement; both follow
    // moveCamera()-only (see docs/Principles.md, "Following The Avatar Never
    // Redefines What The Camera Is Looking At").
    getFollowedRemoteAvatarId() {
        return this._followedRemoteAvatarId;
    }

    // Starts following avatarId's camera position. A no-op (returns
    // false) if avatarId isn't currently a known remote avatar — most
    // commonly because it's the LOCAL avatar (use setFollowAvatar for
    // that) or because its presence already expired. Turns OFF
    // local-avatar-follow, for the same one-camera reason
    // setFollowAvatar turns this off.
    followAvatarId(avatarId) {
        if (!this._remoteAvatarRegistry || !this._remoteAvatarRegistry.has(avatarId)) {
            return false;
        }
        this._followedRemoteAvatarId = avatarId;
        this._lastFollowedRemotePosition = this._remoteAvatarRegistry.currentPosition(avatarId, Date.now());
        this._followAvatarEnabled = false;
        return true;
    }

    stopFollowingRemoteAvatar() {
        this._stopFollowingRemoteAvatarInternal();
    }

    _stopFollowingRemoteAvatarInternal() {
        this._followedRemoteAvatarId = null;
        this._lastFollowedRemotePosition = null;
    }

    // Same delta-only camera shift _followAvatarIfEnabled uses for the
    // local avatar, driven from the SAME interpolated position
    // RemoteAvatarRegistry.tick() already pushes to the renderer every
    // frame — following sees exactly what's on screen, never a
    // separately-computed value. Gracefully stops following (rather
    // than throwing or camera-jumping) the moment the target avatar is
    // no longer known — e.g. its presence expired.
    _followRemoteAvatarIfEnabled(now) {
        if (!this._followedRemoteAvatarId || !this._spatialCameraController || !this._remoteAvatarRegistry) {
            return;
        }
        if (!this._remoteAvatarRegistry.has(this._followedRemoteAvatarId)) {
            this._stopFollowingRemoteAvatarInternal();
            return;
        }
        const position = this._remoteAvatarRegistry.currentPosition(this._followedRemoteAvatarId, now);
        const previous = this._lastFollowedRemotePosition;
        this._lastFollowedRemotePosition = position;
        if (!previous || !position) {
            return;
        }
        const delta = {
            x: position.x - previous.x,
            y: position.y - previous.y,
            z: position.z - previous.z
        };
        if (delta.x === 0 && delta.y === 0 && delta.z === 0) {
            return;
        }
        this._spatialCameraController.moveCamera(delta);
    }

    // When a targeted avatar's presence expires, the interaction target and any
    // follow clear rather than point at nothing. `knownPresences` is this
    // frame's pull()/sync() result; no extra query.
    _pruneAvatarInteractionIfGone(knownPresences) {
        if (this._avatarInteraction.isEmpty || this.isLocalAvatarId(this._avatarInteraction.avatarId)) {
            return;
        }
        const stillKnown = knownPresences.some((k) => k.advertisement.avatarId === this._avatarInteraction.avatarId);
        if (!stillKnown) {
            this._setAvatarInteraction(AvatarInteractionState.empty());
        }
    }

    // Runs every frame after movement: expires a finished gesture, then pushes
    // gesture kind and facing override to the render facade. Local presentation
    // only (see core/AvatarGesturePoseOffsets.js, core/AvatarFacing.js).
    _updateLocalAvatarInteractionPresentation(now) {
        if (!this._session || typeof this._session.setLocalAvatarGesture !== 'function') {
            return;
        }
        if (this._avatarInteraction.isGesturing
            && now - this._avatarInteraction.interactionStartedAt >= GESTURE_DURATION_MS) {
            this._setAvatarInteraction(this._avatarInteraction.withInteraction(AvatarInteractionKind.NONE, null));
        }
        this._session.setLocalAvatarGesture(this._avatarInteraction.isGesturing ? this._avatarInteraction.interaction : null);
        this._applyAvatarFacing(now);
    }

    // See docs/Principles.md, "A Gesture Is Presentation, Never Presence": faces
    // the local avatar toward its interaction target, but only while the player
    // isn't steering; active input always wins.
    _applyAvatarFacing(now) {
        if (!this._session || typeof this._session.setLocalAvatarFacing !== 'function' || !this._avatarPresenceSession) {
            return;
        }
        const targetPosition = this._facingTargetPosition(now);
        const isMoving = Boolean(this._avatarMovementController && this._avatarMovementController.hasMovementInput());
        if (!targetPosition || isMoving) {
            this._session.setLocalAvatarFacing(null);
            return;
        }
        const localPosition = this._avatarPresenceSession.current.position;
        this._session.setLocalAvatarFacing(computeFacingYawDegrees(localPosition, targetPosition));
    }

    // The CURRENT interaction target's position, or null when there is
    // no target, the target is the local avatar itself (facing
    // yourself is meaningless), or the target's presence isn't known
    // to `_remoteAvatarRegistry` (e.g. it expired this same frame,
    // before `_pruneAvatarInteractionIfGone` got to it) — gracefully
    // "no facing override" in every case, never a thrown error.
    _facingTargetPosition(now) {
        if (this._avatarInteraction.isEmpty || this.isLocalAvatarId(this._avatarInteraction.avatarId)) {
            return null;
        }
        return this._remoteAvatarRegistry
            ? this._remoteAvatarRegistry.currentPosition(this._avatarInteraction.avatarId, now)
            : null;
    }

    // Whether a local avatar was actually wired for this session (i.e.
    // someone was logged in when it started) — lets the UI decide
    // whether "Show My Avatar" is even a meaningful control to offer.
    hasLocalAvatar() {
        return Boolean(this._avatarProfileUseCase && this._avatarPresenceSession);
    }

    isLocalAvatarVisible() {
        return this._localAvatarVisible;
    }

    // Moves a never-moved local avatar (sequence 0) near where the camera is
    // about to focus, instead of world origin. Fires at most once per session,
    // on the first focusDocument(). After the avatar has moved, navigating the
    // camera never teleports it.
    _spawnAvatarNear(documentId, position) {
        if (!this._avatarPresenceSession || this._avatarPresenceSession.current.sequence !== 0) {
            return;
        }
        this._avatarPresenceSession.update({ position: this._safeSpawnPosition(documentId, position) });
    }

    // A spawn point must clear the document's real content. The fixed
    // AVATAR_SPAWN_OFFSET lands inside structures built around their own origin
    // ("Home dropped me inside my own pyramid"). When the content is loaded, this
    // measures its local bounds (core/SpatialBounds.js#fromWorld()) and spawns
    // just past the farthest corner plus a clearance; otherwise it falls back to
    // the fixed offset.
    _safeSpawnPosition(documentId, position) {
        const document = documentId ? this._loadedDocuments.get(documentId) : null;
        if (!document) {
            return {
                x: position.x + AVATAR_SPAWN_OFFSET.x,
                y: position.y + AVATAR_SPAWN_OFFSET.y,
                z: position.z + AVATAR_SPAWN_OFFSET.z
            };
        }
        const bounds = SpatialBounds.fromWorld(document.world, this._registry);
        return {
            x: position.x + bounds.max.x + AVATAR_SPAWN_CLEARANCE,
            y: position.y + AVATAR_SPAWN_OFFSET.y,
            z: position.z + bounds.max.z + AVATAR_SPAWN_CLEARANCE
        };
    }

    // A pure client rendering preference — see docs/Principles.md.
    // Never touches AvatarProfile or AvatarPresence; toggling it
    // twice in a row is a no-op exactly like every other purely
    // visual toggle in this codebase.
    setLocalAvatarVisible(visible) {
        this._localAvatarVisible = visible;
        if (this._session && typeof this._session.setLocalAvatarVisible === 'function') {
            this._session.setLocalAvatarVisible(visible);
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

    // Every navigable WorldLocation: the fixed Origin plus one per
    // StructurePlacement across loaded documents. A pure query.
    getWorldLocations() {
        return this._worldLocationDirectory.list();
    }

    // Other collaborators spatially present across every entered World, one row
    // per identity: `{ identityId, label, position, activity, activityTarget }`.
    // Shared by getPlaceContexts() and getWelcomeContext(). The roster has one
    // entry per device, so this picks each identity's first device with a
    // position. `resolveDisplayName` is optional; without it, a truncated
    // identityId is used. Never throws; [] when no World is entered.
    _getPresentCollaborators(resolveDisplayName) {
        const collaborators = [];
        const seen = new Set();
        for (const documentId of this._presentSpatialWorldDocumentIds) {
            const roster = this.getWorldSpatialPresenceRoster(documentId);
            for (const group of roster) {
                if (seen.has(group.identityId)) {
                    continue;
                }
                const device = group.devices.find((candidate) => candidate.position);
                if (!device) {
                    continue;
                }
                seen.add(group.identityId);
                collaborators.push({
                    identityId: group.identityId,
                    label: typeof resolveDisplayName === 'function' ? resolveDisplayName(group.identityId) : this._shortIdentityLabel(group.identityId),
                    position: device.position,
                    activity: device.activity,
                    activityTarget: this._resolveSpatialContextualLabel(device.selection),
                    // Carried through so a "Follow" affordance built on
                    // top of this row (see core/WorldWelcomeContext.js's
                    // nearby-collaborator shape) can call
                    // focusCollaborator(deviceId) directly.
                    deviceId: device.deviceId
                });
            }
        }
        return collaborators;
    }

    // Derived place contexts around landmarks: the landmark plus nearby
    // structures, landmarks and collaborators. Never persisted or authoritative;
    // see core/WorldCurationContext.js.
    getPlaceContexts(resolveDisplayName) {
        const landmarks = [];
        const structurePlacements = [];
        const structureTitles = new Map();

        for (const document of this.getLoadedDocuments()) {
            const world = document.world;
            for (const landmark of world.getWorldLandmarks()) {
                landmarks.push(landmark);
            }
            for (const placement of world.getStructurePlacements()) {
                structurePlacements.push(placement);
                structureTitles.set(placement.documentId, this.getSavedDocumentTitle(placement.documentId));
            }
        }

        const collaborators = this._getPresentCollaborators(resolveDisplayName);

        return derivePlaceContexts({
            landmarks,
            structurePlacements,
            structureTitles,
            collaborators
        });
    }

    // A readable description of the current location, e.g. "In Village" or
    // "Near Old Bridge"; empty when nothing meaningful can be derived.
    getCurrentLocationDescription() {
        const cameraPos = this.getCameraPosition();
        if (!cameraPos) {
            return '';
        }

        const landmarks = [];
        const structurePlacements = [];
        const structureTitles = new Map();

        for (const document of this.getLoadedDocuments()) {
            const world = document.world;
            for (const landmark of world.getWorldLandmarks()) {
                landmarks.push(landmark);
            }
            for (const placement of world.getStructurePlacements()) {
                structurePlacements.push(placement);
                structureTitles.set(placement.documentId, this.getSavedDocumentTitle(placement.documentId));
            }
        }

        return describeLocation({
            position: cameraPos,
            landmarks,
            structurePlacements,
            structureTitles
        });
    }

    // Focuses the camera on a landmark with the same animation as
    // focusLocation(). Returns false for an unknown landmarkId.
    focusPlace(landmarkId) {
        const landmarks = [];
        for (const document of this.getLoadedDocuments()) {
            const world = document.world;
            for (const landmark of world.getWorldLandmarks()) {
                if (landmark.id === landmarkId) {
                    landmarks.push(landmark);
                }
            }
        }

        if (landmarks.length === 0) {
            return false;
        }

        const landmark = landmarks[0];
        const { x, y, z } = landmark.position;
        this._beginCameraFocus({
            position: { x: x + LOCATION_FOCUS_OFFSET.x, y: y + LOCATION_FOCUS_OFFSET.y, z: z + LOCATION_FOCUS_OFFSET.z },
            target: { x, y, z }
        });
        return true;
    }

    // Derives a WorldWelcomeContext for the active document's World from the
    // landmarks/structures getPlaceContexts() gathers, the live spatial roster
    // and the avatar's position (or the camera's). Never persisted, never
    // mutates. See core/WorldWelcomeContext.js and docs/Principles.md,
    // "Exploration Guides Attention, Never Ownership or Mutation". Null with no
    // active document.
    getWelcomeContext(resolveDisplayName) {
        const activeDocumentId = this.getActiveDocumentId();
        const activeDocument = activeDocumentId ? this.getDocument(activeDocumentId) : null;
        if (!activeDocument) {
            return null;
        }

        const landmarks = [];
        const structurePlacements = [];
        const structureTitles = new Map();
        for (const document of this.getLoadedDocuments()) {
            const world = document.world;
            for (const landmark of world.getWorldLandmarks()) {
                landmarks.push(landmark);
            }
            for (const placement of world.getStructurePlacements()) {
                structurePlacements.push(placement);
                structureTitles.set(placement.documentId, this.getSavedDocumentTitle(placement.documentId));
            }
        }

        const collaborators = this._getPresentCollaborators(resolveDisplayName);
        const position = this.getAvatarPosition() || this.getCameraPosition();
        const placeContexts = derivePlaceContexts({ landmarks, structurePlacements, structureTitles, collaborators });
        // Regions across loaded documents, offset into the same shared layout space
        // as the avatar/camera position.
        const regions = this._collectRegions();
        // Already filtered, sorted and direction-labeled; see
        // getNearbyGeographicPlaces().
        const nearbyGeographicPlaces = this.getNearbyGeographicPlaces();

        return deriveWorldWelcomeContext({
            world: activeDocument.world,
            position,
            landmarks,
            structurePlacements,
            structureTitles,
            collaborators,
            placeContexts,
            regions,
            nearbyGeographicPlaces
        });
    }

    // Every WorldRegion across loaded documents, offset by getDocumentPosition
    // (the inverse of what createRegionHere() subtracts). Shared by
    // getWelcomeContext(), getCurrentRegionPath() and getRegions().
    _collectRegions() {
        const regions = [];
        for (const document of this.getLoadedDocuments()) {
            const layoutPosition = this.getDocumentPosition(document.world.id);
            for (const region of document.world.getWorldRegions()) {
                regions.push({
                    id: region.id,
                    worldId: document.world.id,
                    name: region.name,
                    description: region.description,
                    kind: region.kind,
                    radius: region.radius,
                    parentRegionId: region.parentRegionId,
                    authorIdentityId: region.authorIdentityId,
                    position: {
                        x: region.x + layoutPosition.x,
                        y: region.position.y + layoutPosition.y,
                        z: region.z + layoutPosition.z
                    }
                });
            }
        }
        return regions;
    }

    // Every known region across loaded documents, for the Places panel.
    getRegions() {
        return this._collectRegions();
    }

    // Every WorldRegion in its own native per-World coordinates, not offset
    // into the shared layout. That offset only keeps loaded Worlds from
    // overlapping on screen; using it would make cross-World geographic
    // comparison meaningless. core/PlaceFingerprint.js/PlaceIdentity.js only
    // ever see these positions.
    _collectRawRegions() {
        const regions = [];
        for (const document of this.getLoadedDocuments()) {
            for (const region of document.world.getWorldRegions()) {
                regions.push({
                    id: region.id,
                    worldId: document.world.id,
                    name: region.name,
                    kind: region.kind,
                    radius: region.radius,
                    authorIdentityId: region.authorIdentityId,
                    position: { x: region.x, y: region.position.y, z: region.z }
                });
            }
        }
        return regions;
    }

    // core/PlaceIdentity.js#groupRegionsByPlaceIdentity(), applied to
    // every region across every currently loaded document. Pure
    // geometry — candidacy only; see that module's own header on why a
    // matching fingerprint is never treated as proof that two regions
    // are the same place.
    getGeographicPlaceGroups(options = {}) {
        return groupRegionsByPlaceIdentity(this._collectRawRegions(), options);
    }

    // The combined naming view for the geographic place `regionId` belongs to:
    // every known region sharing its fingerprint and every claim on any of them,
    // ranked by distinct authors (see core/GeographicPlaceResolution.js).
    // Returns `{ regions, namingView }`; `namingView` is [] when naming claims
    // aren't wired. Always safe to call.
    getGeographicNamingView(regionId, options = {}) {
        const regions = this._collectRawRegions();
        const claims = this._collectClaimsFor(regions);
        const group = geographicPlaceForRegion(regionId, regions, claims, options);
        if (!group) {
            return { regions: [], namingView: [] };
        }
        return { regions: group.regions, namingView: group.namingView };
    }

    // Every geographic place candidate across loaded documents, for the Places
    // directory. Each entry is a derived GeographicPlaceView, never a stored
    // object:
    //
    //   WorldRegion -> PlaceFingerprint -> PlaceIdentity ->
    //   GeographicPlaceView -> UI
    //
    // Re-derived on every call; nothing is cached.
    getGeographicPlaceDirectory(options = {}) {
        const regions = this._collectRawRegions();
        const claims = this._collectClaimsFor(regions);
        return buildGeographicPlaceDirectory(regions, claims, options);
    }

    // One geographic place by its own fingerprint key — exactly the id
    // a getGeographicPlaceDirectory() row itself carries
    // (GeographicPlaceView#fingerprintKey) — so a directory row can be
    // opened directly without the caller needing to already hold a
    // regionId. Returns null for an unknown key, never a throw, the
    // same graceful-absence posture getGeographicNamingView() already
    // keeps for an unknown regionId.
    getGeographicPlace(fingerprintKey, options = {}) {
        const regions = this._collectRawRegions();
        const claims = this._collectClaimsFor(regions);
        return geographicPlaceByKey(fingerprintKey, regions, claims, options);
    }

    // Geographic places within `radius` of the viewer (avatar position, else
    // camera), nearest first; [] with no position. Positions resolve through
    // `_worldLocationDirectory`, the same lookup focusLocation() uses for
    // `place:<fingerprintKey>`, so "how far" and "where Go To Place takes me"
    // can't disagree. Nothing is stored; every call recomputes.
    getNearbyGeographicPlaces(radius = DEFAULT_NEARBY_GEOGRAPHIC_PLACE_RADIUS) {
        const position = this.getAvatarPosition() || this.getCameraPosition();
        if (!position) {
            return [];
        }
        return deriveNearbyGeographicPlaces(this._collectGeographicPlaceEntries(), position, radius);
    }

    // Shared by getNearbyGeographicPlaces() and getFocusContext(), so there is
    // one way to answer "how far away is a geographic place". Positions are
    // re-resolved through WorldLocationDirectory on every call.
    _collectGeographicPlaceEntries() {
        const entries = [];
        for (const place of this.getGeographicPlaceDirectory()) {
            const location = this._worldLocationDirectory.find(geographicPlaceLocationId(place.fingerprintKey));
            if (!location) {
                continue;
            }
            entries.push({
                fingerprintKey: place.fingerprintKey,
                displayName: place.displayName,
                descriptionCount: place.descriptionCount,
                worldCount: place.worldCount,
                authorCount: place.authorCount,
                position: { x: location.position.x, y: location.position.y, z: location.position.z }
            });
        }
        return entries;
    }

    // Every WorldLandmark across loaded documents, in shared layout space, plus
    // its description (which getMapContent()'s rows don't carry). Read-only
    // helper for getFocusContext().
    _collectFocusLandmarks() {
        const landmarks = [];
        for (const document of this.getLoadedDocuments()) {
            const layoutPosition = this.getDocumentPosition(document.world.id);
            for (const landmark of document.world.getWorldLandmarks()) {
                landmarks.push({
                    id: landmark.id,
                    documentId: document.world.id,
                    title: landmark.title,
                    description: landmark.description,
                    position: {
                        x: landmark.position.x + layoutPosition.x,
                        y: landmark.position.y + layoutPosition.y,
                        z: landmark.position.z + layoutPosition.z
                    }
                });
            }
        }
        return landmarks;
    }

    // Structure counterpart of _collectFocusLandmarks(); same shape as
    // getMapContent()'s structures, kept separate so getFocusContext() reads
    // symmetrically.
    _collectFocusStructures() {
        const structures = [];
        for (const document of this.getLoadedDocuments()) {
            const layoutPosition = this.getDocumentPosition(document.world.id);
            for (const placement of document.world.getStructurePlacements()) {
                structures.push({
                    id: placement.id,
                    // The placed structure's own content document: "Edit a Copy" forks this,
                    // never the World document that positions it (see
                    // core/WorldFocusContext.js). Same id WorldView.js#openStructureSource()
                    // loads.
                    documentId: placement.documentId,
                    title: this.getSavedDocumentTitle(placement.documentId),
                    position: {
                        x: placement.position.x + layoutPosition.x,
                        y: placement.position.y + layoutPosition.y,
                        z: placement.position.z + layoutPosition.z
                    }
                });
            }
        }
        return structures;
    }

    // The one place a WorldFocusContext is built: gathers the target, viewer
    // position, regions and geographic places, and hands them to the pure
    // deriveWorldFocusContext(). See getFocusContextForLocation()/
    // getFocusContextForCollaborator().
    _buildFocusContext(kind, entity) {
        if (!entity) {
            return null;
        }
        const viewerPosition = this.getAvatarPosition() || this.getCameraPosition();
        return deriveWorldFocusContext({
            kind,
            entity,
            viewerPosition,
            regions: this._collectRegions(),
            nearbyPlaceEntries: this._collectGeographicPlaceEntries()
        });
    }

    // Resolves a `locationId` (region/landmark/structure id, or a
    // `place:<fingerprintKey>` id) into a WorldFocusContext instead of a camera
    // move. Region/landmark/structure ids resolve against the richer
    // _collectRegions()/_collectFocusLandmarks()/_collectFocusStructures(),
    // because `_worldLocationDirectory.find()` lacks descriptions and region
    // kinds. Null for an unknown id, an ORIGIN id, or nothing loaded.
    getFocusContextForLocation(locationId) {
        if (!locationId) {
            return null;
        }
        if (isGeographicPlaceLocationId(locationId)) {
            const fingerprintKey = geographicPlaceFingerprintKeyFromLocationId(locationId);
            const entry = fingerprintKey
                ? this._collectGeographicPlaceEntries().find((e) => e.fingerprintKey === fingerprintKey)
                : null;
            return this._buildFocusContext(WorldFocusKind.GEOGRAPHIC_PLACE, entry);
        }
        const region = this._collectRegions().find((r) => r.id === locationId);
        if (region) {
            return this._buildFocusContext(WorldFocusKind.REGION, region);
        }
        const landmark = this._collectFocusLandmarks().find((l) => l.id === locationId);
        if (landmark) {
            return this._buildFocusContext(WorldFocusKind.LANDMARK, landmark);
        }
        const structure = this._collectFocusStructures().find((s) => s.id === locationId);
        if (structure) {
            return this._buildFocusContext(WorldFocusKind.STRUCTURE, structure);
        }
        return null;
    }

    // Collaborator counterpart of getFocusContextForLocation(), addressed by
    // `deviceId` like focusCollaborator(). Null for an unknown or departed
    // device.
    getFocusContextForCollaborator(deviceId, resolveDisplayName) {
        if (!deviceId) {
            return null;
        }
        const collaborator = this._getPresentCollaborators(resolveDisplayName).find((c) => c.deviceId === deviceId);
        if (!collaborator || !collaborator.position) {
            return null;
        }
        return this._buildFocusContext(WorldFocusKind.COLLABORATOR, {
            identityId: collaborator.identityId,
            deviceId: collaborator.deviceId,
            displayName: collaborator.label,
            activity: collaborator.activity,
            position: collaborator.position
        });
    }

    // A derived filter over getGeographicPlaceDirectory() (see
    // core/GeographicPlaceNavigation.js#searchGeographicPlaces()); no second
    // index, re-derived on every call.
    searchGeographicPlaces(query, options = {}) {
        return searchGeographicPlaceRows(this.getGeographicPlaceDirectory(options), query);
    }

    // Every claim this replica has on file for any of `regions` —
    // gathered per (worldId, regionId), since
    // application/LocalPlaceNamingClaimStore.js is scoped per World.
    // Returns [] when naming claims were never wired, the same
    // graceful-degradation posture getPlaceNamingClaims() itself keeps.
    _collectClaimsFor(regions) {
        if (!this._placeNamingClaimUseCase) {
            return [];
        }
        const claims = [];
        for (const region of regions) {
            claims.push(...this._placeNamingClaimUseCase.claimsForRegion(region.worldId, region.id));
        }
        return claims;
    }

    // Every named region containing the viewer, innermost first; see
    // core/WorldRegionGeography.js#regionsContaining().
    getCurrentRegionPath() {
        const position = this.getAvatarPosition() || this.getCameraPosition();
        if (!position) {
            return [];
        }
        const regions = this._collectRegions();
        return regionsContaining(position, regions).map((region) => {
            const dx = region.position.x - position.x;
            const dz = region.position.z - position.z;
            return {
                id: region.id,
                name: region.name,
                kind: region.kind,
                distance: Math.round(Math.sqrt(dx * dx + dz * dz) * 10) / 10
            };
        });
    }

    // Every region/landmark/structure/collaborator known to this session across
    // all loaded documents, the same world-wide scope as
    // WorldLocationDirectory#list(): a map shows the whole World, not just the
    // streaming radius. Positions are offset into shared layout space like
    // _collectRegions(). `resolveDisplayName` is optional.
    //
    // A pure read. See core/WorldMapProjection.js and
    // ui/components/WorldMapPanel.js.
    getMapContent(resolveDisplayName) {
        const landmarks = [];
        const structures = [];
        for (const document of this.getLoadedDocuments()) {
            const layoutPosition = this.getDocumentPosition(document.world.id);
            for (const landmark of document.world.getWorldLandmarks()) {
                landmarks.push({
                    id: landmark.id,
                    title: landmark.title,
                    position: {
                        x: landmark.position.x + layoutPosition.x,
                        y: landmark.position.y + layoutPosition.y,
                        z: landmark.position.z + layoutPosition.z
                    }
                });
            }
            for (const placement of document.world.getStructurePlacements()) {
                structures.push({
                    id: placement.id,
                    title: this.getSavedDocumentTitle(placement.documentId),
                    position: {
                        x: placement.position.x + layoutPosition.x,
                        y: placement.position.y + layoutPosition.y,
                        z: placement.position.z + layoutPosition.z
                    }
                });
            }
        }

        return {
            regions: this._collectRegions(),
            landmarks,
            structures,
            collaborators: this._getPresentCollaborators(resolveDisplayName),
            viewerPosition: this.getAvatarPosition() || this.getCameraPosition()
        };
    }

    // Breadcrumb for the viewer's position, e.g. "Willow Village · Green
    // Valley". Falls back to describeLocation() (nearest landmark/structure)
    // when no region contains it; never a made-up name.
    getCurrentPlaceName() {
        const path = this.getCurrentRegionPath();
        const placeName = describePlace(path);
        return placeName || this.getCurrentLocationDescription();
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

    hasVisitedWorld(documentId) {
        if (!this._localWorldExperienceStore || !documentId) {
            return false;
        }
        return this._localWorldExperienceStore.hasVisited(documentId);
    }

    getWorldExperience(documentId) {
        if (!this._localWorldExperienceStore || !documentId) {
            return null;
        }
        return this._localWorldExperienceStore.getExperience(documentId);
    }

    // Snapshots THIS replica's current camera framing (position, target,
    // a derived heading reading) and active Camera Perspective for
    // `documentId`, right now. A no-op with no localWorldExperienceStore
    // wired, or before start() has ever run (no camera controller yet —
    // nothing to snapshot).
    saveWorldExperience(documentId) {
        if (!this._localWorldExperienceStore || !documentId || !this._spatialCameraController) {
            return;
        }
        const state = this._spatialCameraController.getSpatialCameraState();
        const heading = computeCompassHeading(state.position, state.target);
        this._localWorldExperienceStore.recordVisit(documentId, {
            position: { x: state.position.x, y: state.position.y, z: state.position.z },
            target: { x: state.target.x, y: state.target.y, z: state.target.z },
            heading: heading ? heading.degrees : null,
            perspective: this._cameraPerspective
        });
    }

    // Restores this replica's last visit to `documentId`. A stored Camera
    // Perspective wins and is re-applied via setCameraPerspective(), since it's
    // an offset from the avatar's current position. Otherwise the stored orbit
    // position+target is restored via _beginCameraFocus(). Returns the restored
    // LocalWorldExperience, or null (the caller keeps its framing, e.g. the
    // Welcome framing on a first visit).
    restoreWorldExperience(documentId) {
        if (!this._localWorldExperienceStore || !documentId) {
            return null;
        }
        const experience = this._localWorldExperienceStore.getExperience(documentId);
        if (!experience) {
            return null;
        }
        if (experience.cameraPerspective) {
            this.setCameraPerspective(experience.cameraPerspective);
        } else if (experience.cameraPosition && experience.cameraTarget) {
            this._beginCameraFocus({ position: experience.cameraPosition, target: experience.cameraTarget });
        }
        return experience;
    }

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
    // World Editing Authorization
    // -----------------------------------------------------------------
    //
    // Three public queries, never an "isOwner" or role name (see
    // core/WorldAccessLevel.js, application/WorldAuthorizationService.js).
    // Without a worldAuthorizationService every loaded document is editable,
    // and getWorldAccessLevel() returns EDIT even for an unresolvable id, so a
    // typo or not-yet-loaded document never looks more restrictive than having
    // no gate. With a service wired, an unresolvable id is denied: there is no
    // Document to ask about.
    getWorldAccessLevel(documentId) {
        if (!this._worldAuthorizationService) {
            return WorldAccessLevel.EDIT;
        }
        const document = this.getDocument(documentId);
        return this._worldAuthorizationService.resolveAccess(document, documentId);
    }

    // The gate every remaining mutation chokepoint here consults (the region and
    // landmark create/update/remove methods), also safe for a UI to reflect
    // (never decide) whether to offer an edit. Passes `documentId` to
    // WorldAuthorizationService so a non-owner holding a signed edit grant is
    // recognized: the same answer, consulted from BOTH the LOCAL mutation chokepoint
    // and the network one.
    canEditDocument(documentId) {
        if (!this._worldAuthorizationService) {
            return true;
        }
        return this._worldAuthorizationService.canEdit(this.getDocument(documentId), documentId);
    }

    canReadDocument(documentId) {
        if (!this._worldAuthorizationService) {
            return true;
        }
        return this._worldAuthorizationService.canRead(this.getDocument(documentId), documentId);
    }

    // -----------------------------------------------------------------
    // World Membership
    // -----------------------------------------------------------------
    //
    // "Am I this World's cryptographic owner?", the gate WorldMembershipUseCase
    // enforces before grant/revoke, exposed so a UI can decide whether to offer
    // "manage collaborators".
    isWorldOwner(documentId) {
        if (!this._worldAuthorizationService) {
            return false;
        }
        return this._worldAuthorizationService.isOwner(this.getDocument(documentId));
    }

    // Grants `subjectIdentityId` EDIT authority over `documentId` —
    // throws exactly when application/WorldMembershipUseCase.js#grantEdit()
    // itself would (not wired, not this World's owner, or a malformed
    // subject). See that class's own header for the full security
    // model.
    grantWorldEdit(documentId, subjectIdentityId) {
        if (!this._worldMembershipUseCase) {
            throw new Error('WorldNavigationSession: no worldMembershipUseCase is wired — World membership grants are unavailable');
        }
        return this._worldMembershipUseCase.grantEdit(documentId, subjectIdentityId);
    }

    revokeWorldEdit(documentId, subjectIdentityId) {
        if (!this._worldMembershipUseCase) {
            throw new Error('WorldNavigationSession: no worldMembershipUseCase is wired — World membership grants are unavailable');
        }
        return this._worldMembershipUseCase.revokeEdit(documentId, subjectIdentityId);
    }

    // Every membership fact this replica currently holds for `documentId`
    // — an empty array, never a throw, when no worldMembershipUseCase is
    // wired (the same graceful-absence posture every other optional
    // collaborator in this class already follows).
    listWorldMembers(documentId) {
        if (!this._worldMembershipUseCase) {
            return [];
        }
        return this._worldMembershipUseCase.listMembers(documentId);
    }

    // Lets a Members panel reflect a gossiped grant/revocation as soon as it
    // arrives. Returns a no-op unsubscribe when not wired.
    onWorldMembershipChanged(documentId, callback) {
        if (!this._worldMembershipUseCase) {
            return () => {};
        }
        return this._worldMembershipUseCase.onMembershipChanged(documentId, callback);
    }

    // -----------------------------------------------------------------
    // World Presence
    // -----------------------------------------------------------------
    //
    // Declares this replica present in `documentId`. `activity` defaults to a
    // fresh canEditDocument() read; it is a self-reported UI hint, never an
    // authorization claim (see core/WorldPresenceActivity.js). No-op when not
    // wired.
    enterWorldPresence(documentId, activity = null) {
        if (!this._worldPresenceUseCase) {
            return;
        }
        const resolvedActivity = activity || (this.canEditDocument(documentId) ? WorldPresenceActivity.EDITING : WorldPresenceActivity.EXPLORING);
        this._worldPresenceUseCase.enterWorld(documentId, resolvedActivity);
        this._presentWorldDocumentIds.add(documentId);
    }

    // Re-derives this replica's own advertised activity from a FRESH
    // canEditDocument() read — the call a session makes after a World
    // edit grant it holds changes (granted or revoked), so its own
    // presence stays honest without waiting for a peer to notice on
    // their own. A no-op for a World this session never entered
    // presence for.
    refreshWorldPresenceActivity(documentId) {
        if (!this._worldPresenceUseCase || !this._presentWorldDocumentIds.has(documentId)) {
            return;
        }
        this._worldPresenceUseCase.setActivity(documentId, this.canEditDocument(documentId) ? WorldPresenceActivity.EDITING : WorldPresenceActivity.EXPLORING);
    }

    leaveWorldPresence(documentId) {
        if (!this._worldPresenceUseCase) {
            return;
        }
        this._worldPresenceUseCase.leaveWorld(documentId);
        this._presentWorldDocumentIds.delete(documentId);
    }

    // The roster of every OTHER participant currently present in
    // `documentId` — see application/WorldPresenceUseCase.js#getRoster()'s
    // own header for the exact shape. An empty array, never a throw,
    // when no worldPresenceUseCase is wired.
    getWorldPresenceRoster(documentId) {
        if (!this._worldPresenceUseCase) {
            return [];
        }
        return this._worldPresenceUseCase.getRoster(documentId);
    }

    onWorldPresenceChanged(documentId, callback) {
        if (!this._worldPresenceUseCase) {
            return () => {};
        }
        return this._worldPresenceUseCase.onPresenceChanged(documentId, callback);
    }

    // -----------------------------------------------------------------
    // World Spatial Presence
    // -----------------------------------------------------------------
    //
    // Declares this replica spatially present in `documentId` (see
    // application/WorldSpatialPresenceUseCase.js). No-op when not wired.
    // `resolveDisplayName`, an optional `(identityId) => string`, is passed to
    // every remote marker for this World; without it a truncated identityId is
    // shown.
    enterWorldSpatialPresence(documentId, { resolveDisplayName = null } = {}) {
        if (!this._worldSpatialPresenceUseCase) {
            return;
        }
        const cameraPosition = this.getCameraPosition();
        const heading = this.getCompassHeading();
        this._worldSpatialPresenceUseCase.enterWorld(documentId, {
            position: cameraPosition ? { x: cameraPosition.x, z: cameraPosition.z } : null,
            heading: heading ? heading.degrees : null
        });
        this._presentSpatialWorldDocumentIds.add(documentId);
        this._startSpatialPresenceRendering(documentId, typeof resolveDisplayName === 'function' ? resolveDisplayName : null);
    }

    // Called on a fast interval by the UI while this World is active. The one
    // place local interaction state becomes a network fact; `activity` is always
    // derived here, never passed in (see core/WorldSpatialActivity.js). No-op
    // for a World not entered.
    syncWorldSpatialPresence(documentId) {
        if (!this._worldSpatialPresenceUseCase || !this._presentSpatialWorldDocumentIds.has(documentId)) {
            return;
        }
        const cameraPosition = this.getCameraPosition();
        const heading = this.getCompassHeading();
        const selection = this._resolveWorldSpatialSelection(documentId);
        // World View has no gizmo, so this is always inactive; the shape stays
        // because deriveWorldSpatialActivity() expects gizmoActive/gizmoMode.
        const gizmoState = { active: false, mode: null };
        // The avatar's vertical motion (core/AvatarVerticalState.js), for the
        // JUMPING/FALLING activities. Without a controller neither fires.
        const verticalState = this._avatarMovementController ? this._avatarMovementController.verticalState() : null;
        const activity = deriveWorldSpatialActivity({
            gizmoActive: gizmoState.active,
            gizmoMode: gizmoState.mode,
            hasSelection: !selection.isEmpty,
            canEdit: this.canEditDocument(documentId),
            isMoving: Boolean(this._avatarMovementController && this._avatarMovementController.hasMovementInput()),
            rising: verticalState === AvatarVerticalState.RISING,
            falling: verticalState === AvatarVerticalState.FALLING
        });
        this._worldSpatialPresenceUseCase.updateSpatial(documentId, {
            position: cameraPosition ? { x: cameraPosition.x, z: cameraPosition.z } : undefined,
            heading: heading ? heading.degrees : undefined,
            selection,
            activity
        });
    }

    leaveWorldSpatialPresence(documentId) {
        if (!this._worldSpatialPresenceUseCase) {
            return;
        }
        this._worldSpatialPresenceUseCase.leaveWorld(documentId);
        this._presentSpatialWorldDocumentIds.delete(documentId);
        this._stopSpatialPresenceRendering(documentId);
    }

    // Every device-level entry currently spatially present in
    // `documentId` — see WorldSpatialPresenceUseCase#getSpatialRoster()'s
    // own header for the exact shape. An empty array, never a throw,
    // when no worldSpatialPresenceUseCase is wired.
    getWorldSpatialPresenceRoster(documentId) {
        if (!this._worldSpatialPresenceUseCase) {
            return [];
        }
        return this._worldSpatialPresenceUseCase.getSpatialRoster(documentId);
    }

    onWorldSpatialPresenceChanged(documentId, callback) {
        if (!this._worldSpatialPresenceUseCase) {
            return () => {};
        }
        return this._worldSpatialPresenceUseCase.onSpatialPresenceChanged(documentId, callback);
    }

    // Translates this session's local selection into the read-only observation
    // shape core/WorldSpatialSelection.js defines. Only a selection in this
    // World, and only brick or structure-placement kinds, is reported.
    _resolveWorldSpatialSelection(documentId) {
        const selection = this._spatialSelection;
        if (!selection || selection.isEmpty || selection.documentId !== documentId) {
            return WorldSpatialSelection.none();
        }
        if (selection.isStructurePlacementSelection) {
            return WorldSpatialSelection.placement({ documentId, placementId: selection.placementId });
        }
        if (selection.isSingle && selection.type === 'brick') {
            return WorldSpatialSelection.brick({ documentId, buildingId: selection.buildingId, brickId: selection.brickId });
        }
        return WorldSpatialSelection.none();
    }

    // The application layer drives rendering, as RemoteAvatarRegistry does for
    // avatars; WorldView.js never touches RemoteSpatialPresenceRenderer. Before
    // start() the subscription is still recorded, so nothing needs re-calling.
    _startSpatialPresenceRendering(documentId, resolveDisplayName) {
        if (this._spatialPresenceRenderSubscriptions.has(documentId)) {
            return;
        }
        this._spatialPresenceRenderedDevices.set(documentId, new Set());
        const unsubscribe = this._worldSpatialPresenceUseCase.onSpatialPresenceChanged(documentId, (roster) => {
            this._applySpatialPresenceRoster(documentId, roster, resolveDisplayName);
        });
        this._spatialPresenceRenderSubscriptions.set(documentId, unsubscribe);
        this._applySpatialPresenceRoster(documentId, this._worldSpatialPresenceUseCase.getSpatialRoster(documentId), resolveDisplayName);
    }

    _stopSpatialPresenceRendering(documentId) {
        const unsubscribe = this._spatialPresenceRenderSubscriptions.get(documentId);
        if (unsubscribe) {
            unsubscribe();
            this._spatialPresenceRenderSubscriptions.delete(documentId);
        }
        const rendered = this._spatialPresenceRenderedDevices.get(documentId);
        if (rendered && this._session && typeof this._session.removeRemoteSpatialPresence === 'function') {
            for (const deviceId of rendered) {
                this._session.removeRemoteSpatialPresence(deviceId);
            }
        }
        this._spatialPresenceRenderedDevices.delete(documentId);
    }

    // Diffs the roster against what was last rendered for `documentId`, so a
    // departed device's marker is removed.
    //
    // Each observation becomes a WorldSpatialAnchor before reaching the
    // renderer: this session's camera is the viewer, and the device's selection
    // is labeled via _resolveSpatialContextualLabel(). The renderer and UI never
    // derive this themselves.
    _applySpatialPresenceRoster(documentId, roster, resolveDisplayName) {
        if (!this._session || typeof this._session.setRemoteSpatialPresence !== 'function') {
            return;
        }
        const viewerPosition = this.getCameraPosition();
        const viewerHeading = this.getCompassHeading();
        const seen = new Set();
        for (const group of roster) {
            const label = resolveDisplayName ? resolveDisplayName(group.identityId) : this._shortIdentityLabel(group.identityId);
            for (const device of group.devices) {
                seen.add(device.deviceId);
                const anchor = deriveWorldSpatialAnchor({
                    deviceId: device.deviceId,
                    identityId: group.identityId,
                    label,
                    position: device.position,
                    heading: device.heading,
                    selection: device.selection,
                    activity: device.activity,
                    contextualLabel: this._resolveSpatialContextualLabel(device.selection),
                    viewerPosition: viewerPosition ? { x: viewerPosition.x, z: viewerPosition.z } : null,
                    viewerHeadingDegrees: viewerHeading ? viewerHeading.degrees : null
                });
                this._session.setRemoteSpatialPresence(device.deviceId, anchor);
            }
        }
        const previouslyRendered = this._spatialPresenceRenderedDevices.get(documentId) || new Set();
        for (const deviceId of previouslyRendered) {
            if (!seen.has(deviceId)) {
                this._session.removeRemoteSpatialPresence(deviceId);
            }
        }
        this._spatialPresenceRenderedDevices.set(documentId, seen);
    }

    _shortIdentityLabel(identityId) {
        if (typeof identityId !== 'string' || identityId.length === 0) {
            return '?';
        }
        return `${identityId.replace(/^did:key:/, '').slice(0, 6)}…`;
    }

    // The one place a WorldSpatialSelection becomes display text. A placement
    // resolves through `document.world.getStructurePlacement()` to its document
    // title via getSavedDocumentTitle(), in any loaded document. A brick has no
    // name (core/Building.js has no title), so it resolves to null and
    // describeSpatialActivity() shows the plain phrase ("Building"). Null, never
    // a throw, for an empty or unresolvable selection or no
    // loadDocumentUseCase.
    _resolveSpatialContextualLabel(selection) {
        if (!selection || selection.isEmpty || selection.kind !== 'placement') {
            return null;
        }
        const hostDocument = this.getDocument(selection.documentId);
        if (!hostDocument) {
            return null;
        }
        const placement = hostDocument.world.getStructurePlacement(selection.placementId);
        if (!placement) {
            return null;
        }
        return this.getSavedDocumentTitle(placement.documentId);
    }

    // Public wrapper around _resolveSpatialContextualLabel(), passed by the UI
    // as buildSpatialCollaboratorRows()'s `resolveSelectionLabel`.
    resolveSpatialSelectionLabel(selection) {
        return this._resolveSpatialContextualLabel(selection);
    }

    // Moves the camera once toward a collaborator's last known position via
    // _beginCameraFocus(). Not a subscription (see docs/Principles.md, "Follow
    // Is Local Camera Navigation, Never A Shared Camera"): a later call focuses
    // wherever they are then, and nothing is sent to their replica. Searches
    // every spatially entered World. Returns false for a device with no known
    // position.
    focusCollaborator(deviceId) {
        for (const documentId of this._presentSpatialWorldDocumentIds) {
            const roster = this.getWorldSpatialPresenceRoster(documentId);
            for (const group of roster) {
                const device = group.devices.find((candidate) => candidate.deviceId === deviceId);
                if (device && device.position) {
                    const groundY = terrainHeightAt(DEFAULT_WORLD_SEED, device.position.x, device.position.z);
                    // A selected Camera Perspective decides Follow's offset too (see
                    // docs/Principles.md, "Camera Perspective Determines An Offset; It Never
                    // Replaces The Camera Machinery"); otherwise LOCATION_FOCUS_OFFSET.
                    const framing = this._cameraPerspective
                        ? computeCameraFraming(
                            this._cameraPerspective,
                            { x: device.position.x, y: groundY, z: device.position.z },
                            device.heading
                        )
                        : null;
                    this._beginCameraFocus(framing || {
                        position: {
                            x: device.position.x + LOCATION_FOCUS_OFFSET.x,
                            y: groundY + LOCATION_FOCUS_OFFSET.y,
                            z: device.position.z + LOCATION_FOCUS_OFFSET.z
                        },
                        target: { x: device.position.x, y: groundY, z: device.position.z }
                    });
                    return true;
                }
            }
        }
        return false;
    }

    // Resolves a documentId to a title via
    // LoadDocumentUseCase#listSavedDocuments(), the same listing
    // EditorSession#getSelectedPlacementInfo() reads. Falls back to the raw
    // documentId without a loadDocumentUseCase or a matching saved entry.
    getSavedDocumentTitle(documentId) {
        if (this._loadDocumentUseCase && typeof this._loadDocumentUseCase.listSavedDocuments === 'function') {
            const entry = this._loadDocumentUseCase.listSavedDocuments().find((doc) => doc.id === documentId);
            if (entry) {
                return entry.title;
            }
        }
        return documentId;
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

    // True while `documentId` is still a straight, unforked view of a
    // published snapshot — i.e. still immutable as far as this session
    // is concerned.
    isDocumentPublished(documentId) {
        return this._publishedDocumentIds.has(documentId);
    }

    // Tells the UI what would happen on the first edit of `documentId`, so it
    // can explain before the user tries. Null for anything already editable.
    // Otherwise:
    //   { blocked: false, message } — editable; first edit forks silently
    //   { blocked: true,  message } — fork policy forbids it
    getEditabilityNotice(documentId) {
        if (!documentId || !this._publishedDocumentIds.has(documentId)) {
            return null;
        }
        const { allowed, license } = this._checkForkPolicy(documentId);
        if (!allowed) {
            const licenseLabel = license ? license.id : 'UNSPECIFIED';
            return {
                blocked: true,
                message: `Published under "${licenseLabel}" — the author has not allowed forking, so this world can be viewed but not edited.`
            };
        }
        return {
            blocked: false,
            message: 'Published snapshot — your first edit creates your own editable fork; the original is never changed.'
        };
    }

    // Document Properties entry point. Metadata edits are mutations, so they go
    // through the same fork-on-first-mutation gate (_ensureEditableDocumentId).
    // Returns the documentId the edit landed on (the fork's, if one was made).
    updateDocumentMetadata(documentId, { title, description, license } = {}) {
        const id = this._ensureEditableDocumentId(documentId || this._activeDocumentId);
        const doc = this.getDocument(id);
        if (!doc) {
            throw new Error(`WorldNavigationSession: no loaded document "${id}"`);
        }
        const metadata = doc.metadata;
        if (title !== undefined) metadata.title = title;
        if (description !== undefined) metadata.description = description;
        if (license !== undefined) metadata.license = license;
        metadata.touch();
        let history = this._commandHistories.get(id);
        if (!history) {
            history = new CommandHistory({ world: doc.world });
            this._registerCommandHistory(id, history);
        }
        history.markUnsaved();
        return id;
    }

    // Normalized data for the Document Info panel — the same shape
    // for a published snapshot, a fork, or an ordinary loaded
    // document, so the UI component doesn't need to know which one
    // it's looking at. `hasBeenSaved` is approximated as "not dirty":
    // every fork starts dirty the instant it's created (_forkForEdit
    // always calls history.markUnsaved()), so a clean history reliably
    // means an explicit saveDocument() happened since.
    getDocumentInfo(documentId) {
        const id = documentId || this._activeDocumentId;
        const doc = this.getDocument(id);
        if (!doc) return null;
        const isPublished = this.isDocumentPublished(id);
        const dirty = this.isDocumentDirty(id);
        const status = computeLifecycleStatus({ hasBeenSaved: !dirty, isPublished });
        return {
            documentId: id,
            title: doc.metadata.title || 'Untitled',
            description: doc.metadata.description || '',
            author: doc.metadata.author,
            // The ownership fact WorldAuthorizationService/WorldMembershipUseCase use,
            // so a Members panel can label the owner's row. Null for older documents.
            authorIdentityId: doc.metadata.authorIdentityId || null,
            license: doc.metadata.license,
            parentDocumentId: doc.metadata.parentDocumentId,
            status,
            statusLabel: describeLifecycleStatus(status, { dirty }),
            dirty,
            editable: !isPublished,
            editabilityNotice: this.getEditabilityNotice(id)
        };
    }

    // The Publication a loaded document's placements belong to; an unpublished
    // fork has none. Separate from _isKnownPublication/_findPublications, which
    // decide the fork-on-edit boundary: this answers which Publication the
    // spatial layer keys placements under, for the source or a fork of it.
    _resolvePublicationForPlacement(documentId) {
        const publications = this._findPublications(documentId);
        if (publications.length === 0) return null;
        return publications.reduce((latest, p) => (!latest || p.publishedAt > latest.publishedAt) ? p : latest, null);
    }

    // A document can have several placements (see docs/Principles.md, "A
    // Publication Is What; A Placement Is Where"). This picks the most recently
    // updated one, like WorldLayoutProvider.getPosition; browsing/choosing among several is future scope.
    _resolvePlacementRecord(documentId) {
        if (!this._placementRegistry) return null;
        const publication = this._resolvePublicationForPlacement(documentId);
        if (!publication) return null;
        const records = this._placementRegistry.findByPublicationId(publication.id);
        if (records.length === 0) return null;
        return records.reduce((latest, r) => (!latest || r.updatedAt > latest.updatedAt) ? r : latest, null);
    }

    // Per-record facts (position, revision, owner, whether this identity may
    // move/remove it) shared by getPlacementInfo() and
    // getPlacementsForPublication(), so both compute them identically.
    _enrichPlacementRecord(record) {
        const currentUser = this._identityProvider ? this._identityProvider.currentUser() : null;
        const currentUsername = currentUser ? (currentUser.username || currentUser.id) : null;
        // A best-effort local ownership signal for the UI, never the authorization
        // boundary: a move is signed as the current user and fails verification
        // wherever it's checked if that isn't the owner or a valid delegate. A
        // placement with no recorded owner is treated as movable.
        const ownerName = record.owner || (record.ownerIdentity ? (record.ownerIdentity.username || record.ownerIdentity.id) : null);
        const ownedByCurrentUser = !ownerName || (currentUsername !== null && ownerName === currentUsername);
        // Passive overlap: how many other known placements sit at this exact
        // position (see docs/Principles.md, "Overlap Is A Fact; Collision Is A
        // Policy Decision"). Never blocks anything.
        const overlap = this._placementRegistry
            ? detectSpatialOverlap(record.position, this._placementRegistry.list(), { excludePlacementId: record.placementId })
            : null;
        return {
            placementId: record.placementId,
            publicationId: record.publicationId,
            position: { x: record.position.x, y: record.position.y, z: record.position.z },
            rotation: record.rotation,
            revision: record.revision,
            owner: ownerName,
            movable: ownedByCurrentUser,
            // Removing a placement, like moving one, is authority over where a
            // publication sits; reuses `ownedByCurrentUser`.
            removable: ownedByCurrentUser,
            overlapCount: overlap ? overlap.count : 0
        };
    }

    // Normalized data for a Placement Info panel — position, revision,
    // owner, and whether THIS identity is (as far as this session can
    // tell, locally) the one who may move it. Returns null when the
    // document has no known placement yet (never published, or
    // placementRegistry isn't wired) rather than a placement-shaped
    // object full of nulls.
    getPlacementInfo(documentId) {
        const id = documentId || this._activeDocumentId;
        const record = this._resolvePlacementRecord(id);
        if (!record) return null;
        return { documentId: id, ...this._enrichPlacementRecord(record) };
    }

    // Every placement of a Publication, unreduced, each enriched like
    // getPlacementInfo()'s record (see docs/Principles.md, "A Publication Is
    // What; A Placement Is Where"). Order is whatever findByPublicationId()
    // returns; never sorted, deduped or ranked. No `documentId`: a Publication
    // placed several times has no single document.
    //
    // Returns [] with no registry, no publicationId, or zero placements. A
    // discovery failure propagates rather than becoming an empty array, so
    // callers can tell "zero placements" from "discovery failed" (see
    // OwnPublicationPanel's refreshPublicationPlacements()).
    getPlacementsForPublication(publicationId) {
        if (!this._placementRegistry || typeof publicationId !== 'string' || publicationId.length === 0) return [];
        const records = this._placementRegistry.findByPublicationId(publicationId);
        return records.map((record) => this._enrichPlacementRecord(record));
    }

    // Like getPlacementInfo() but starting from a publicationId, for background
    // Snapshot processing (application/AutomaticSnapshotEncounterCascade.js)
    // that has no open document. Returns only what
    // resolveSnapshotWorldPlacement() needs: `{ placementId, publicationId,
    // position }`. Null with no registry or no placement.
    getPlacementInfoForPublication(publicationId) {
        if (!this._placementRegistry || typeof publicationId !== 'string' || publicationId.length === 0) return null;
        const records = this._placementRegistry.findByPublicationId(publicationId);
        if (records.length === 0) return null;
        const record = records.reduce((latest, r) => (!latest || r.updatedAt > latest.updatedAt) ? r : latest, null);
        return {
            placementId: record.placementId,
            publicationId: record.publicationId,
            position: { x: record.position.x, y: record.position.y, z: record.position.z }
        };
    }

    // Exact-id Publication lookup for the Snapshot cascade's
    // `findPublicationById`. Reads `_publicationActionDiscoveryProvider`: an
    // exact-id lookup has no documentId-collision risk, so seeing
    // Repository-admitted Publications is safe. _describeSpatialOccupant()
    // keeps its own `_discoveryProvider` lookup. Null when unknown; never
    // throws.
    findPublicationById(publicationId) {
        if (!this._publicationActionDiscoveryProvider || typeof publicationId !== 'string' || publicationId.length === 0) return null;
        return this._publicationActionDiscoveryProvider.findById(publicationId) || null;
    }

    // Pre-flight for an explicit placement move: what's at newPosition, and does
    // the policy require confirmation? A pure query; movePlacement() doesn't
    // call it, the UI calls it first (see docs/Principles.md, "Overlap Is A
    // Fact; Collision Is A Policy Decision"). Null when there's nothing to check
    // (no registry, or no placement to move).
    checkPlacementOverlap(documentId, newPosition) {
        const id = documentId || this._activeDocumentId;
        if (!this._placementRegistry) return null;
        const record = this._resolvePlacementRecord(id);
        if (!record) return null;
        const overlap = detectSpatialOverlap(newPosition, this._placementRegistry.list(), { excludePlacementId: record.placementId });
        const decision = evaluateSpatialAllocation(this._spatialAllocationPolicy, overlap);
        return {
            ...decision,
            occupants: overlap.occupants.map((occupant) => this._describeSpatialOccupant(occupant))
        };
    }

    // "What's actually here?", including the inspected placement itself (unlike
    // checkPlacementOverlap, which excludes the one being moved). Read-only.
    //
    // Only published placements appear: an editing fork has no placement of its
    // own (it inherits a local, non-authoritative position; see
    // _localPositions).
    //
    // A PlacementRecord that outlived its unpublished Publication is a storage
    // fact, not a user-facing one. _describeSpatialOccupant() reports it with
    // documentId: null, and this presentation boundary omits it. The record,
    // spatial index and checkPlacementOverlap's occupants are untouched.
    getDocumentsAtPosition(position) {
        if (!this._placementRegistry) return [];
        const overlap = detectSpatialOverlap(position, this._placementRegistry.list());
        return overlap.occupants
            .map((occupant) => this._describeSpatialOccupant(occupant))
            .filter((occupant) => occupant.documentId !== null);
    }

    // Resolves a placement record into a title and a documentId to focus, falling
    // back to the publicationId when discovery can't resolve it. Shared by
    // checkPlacementOverlap and getDocumentsAtPosition.
    //
    // It doesn't know why a publication fails to resolve. checkPlacementOverlap
    // keeps unresolved occupants, since they are still physically there to
    // collide with; getDocumentsAtPosition omits them because it lists
    // user-facing documents.
    _describeSpatialOccupant(record) {
        const publication = this._discoveryProvider ? this._discoveryProvider.findById(record.publicationId) : null;
        return {
            documentId: publication ? publication.documentId : null,
            publicationId: record.publicationId,
            title: publication ? publication.title : record.publicationId,
            owner: record.owner || null
        };
    }

    // Search over the shared discovery machinery (application/SearchWorldUseCase.js),
    // enriched with a resolved position and whether it came from a real
    // PlacementRecord or the deterministic fallback grid (see docs/Principles.md,
    // "Publication Found Is Not The Same As Placement Found"). Read-only.
    //
    // Accepts a plain string or `{ text, center, radius }`. The spatial filter
    // runs here, after position enrichment, because a discovery-layer use case
    // has no reason to know about placements (see docs/Principles.md, "A
    // Spatial Query Is Authoritative Over Placement, Not A Local-Cache Scan").
    // Spatial results are nearest-first; text-only results keep discovery's
    // order.
    searchWorld(queryOrOptions) {
        if (!this._searchWorldUseCase) return [];
        const options = typeof queryOrOptions === 'string' ? { text: queryOrOptions } : (queryOrOptions || {});
        const candidates = this._searchWorldUseCase.execute(options);
        let results = candidates.map((publication) => this._describeSearchResult(publication, options.center));
        if (options.center && Number.isFinite(options.radius)) {
            results = results
                .filter((r) => r.position && isWithinRadius(r.position, options.center, options.radius))
                .sort((a, b) => a.distance - b.distance);
        }
        return results;
    }

    // A pure spatial query, equivalent to `searchWorld({ center, radius })`,
    // named separately because it reads more clearly.
    searchWorldByLocation({ center, radius }) {
        return this.searchWorld({ center, radius });
    }

    // `center` is optional — only passed when a spatial query is in
    // progress, so `distance` is computed (and included) ONLY when it
    // actually means something; a plain text search never carries a
    // `distance` field implying a query that was never made.
    _describeSearchResult(publication, center = null) {
        const explicit = this._placementRegistry
            ? this._placementRegistry.findByPublicationId(publication.id)
                .reduce((latest, r) => (!latest || r.revision > latest.revision) ? r : latest, null)
            : null;
        const resolved = this._worldLayoutProvider
            ? this._worldLayoutProvider.getPosition(publication.documentId)
            : null;
        const position = explicit
            ? { x: explicit.position.x, y: explicit.position.y, z: explicit.position.z }
            : (resolved ? { x: resolved.x, y: resolved.y, z: resolved.z } : null);
        return {
            documentId: publication.documentId,
            publicationId: publication.id,
            title: publication.title,
            author: publication.author,
            hasPlacement: !!explicit,
            position,
            distance: (center && position) ? distanceBetween(position, center) : null
        };
    }

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

    // Center/radius exploration. `searchWorldByLocation` decides which
    // documents come back; the result is `{ documents, diagnostics }` so a
    // caller can show what was found and what the trust layer says about it
    // without confusing the two (see docs/Principles.md, "Discovery And Trust
    // Are Related, But They Are Not The Same Operation"). searchWorld/
    // searchWorldByLocation still return plain arrays; see
    // docs/ArchitectureHistory.md for why the shapes weren't unified.
    exploreLocation({ center, radius }) {
        const documents = this.searchWorldByLocation({ center, radius });
        const diagnostics = this._runSpatialDiscoveryDiagnostics(center, radius);
        return { documents, diagnostics };
    }

    // "Explore Here": centered on the camera, not the active document's
    // placement; the camera may be over empty space with no active document.
    // Returns an empty envelope (diagnostics.available false) before any camera
    // state exists.
    exploreHere(radius = DEFAULT_EXPLORE_RADIUS) {
        const center = this.getSpatialState().cameraPosition;
        if (!center) return { documents: [], diagnostics: summarizeDiscoveryDiagnostics(null) };
        return this.exploreLocation({ center, radius });
    }

    // "What's Here?": exploreHere with a small radius (NEARBY_RADIUS).
    // getDocumentsAtPosition() tests exact position equality, which a
    // continuous camera coordinate never matches, so this uses a radius query
    // through the same code path.
    whatsHere() {
        return this.exploreHere(NEARBY_RADIUS);
    }

    // Runs the optional trust-capable spatialDiscoveryProvider over the same
    // center/radius only for diagnostics; its PlacementRecords are discarded and
    // never replace exploreLocation's documents.
    //
    // DecentralizedSpatialDiscoveryProvider.discover() throws for an untrusted
    // root/authority, which is right for an authoritative caller. Exploration is
    // read-only, so the throw becomes `diagnostics.fatal` instead of escaping a
    // UI action.
    _runSpatialDiscoveryDiagnostics(center, radius) {
        if (!this._spatialDiscoveryProvider || typeof this._spatialDiscoveryProvider.discover !== 'function') {
            this._lastDiscoveryDiagnosticsRaw = null;
            return summarizeDiscoveryDiagnostics(null);
        }
        let raw = null;
        try {
            this._spatialDiscoveryProvider.discover(center, radius);
            raw = typeof this._spatialDiscoveryProvider.getLastDiagnostics === 'function'
                ? this._spatialDiscoveryProvider.getLastDiagnostics()
                : null;
            this._lastDiscoveryDiagnosticsRaw = raw;
            return summarizeDiscoveryDiagnostics(raw);
        } catch (err) {
            this._lastDiscoveryDiagnosticsRaw = null;
            return summarizeDiscoveryDiagnostics(null, { fatal: err.message });
        }
    }

    // Read-only bundle for the Location Browser's "Inspect": Document Info and
    // Placement Info, never forcing a load. Results are usually not loaded, and
    // loading just to inspect would be a real side effect, so documentInfo may
    // be null; WorldLocationBrowser then falls back to the result's own fields.
    // placementInfo comes from the registry and is often available anyway.
    //
    // `trust` is the TrustObservation for this document's placement from the
    // most recent explore/whatsHere call's cached raw diagnostics, or null. Not
    // a fresh query.
    inspectDocument(documentId) {
        const placementInfo = this.getPlacementInfo(documentId);
        return {
            documentId,
            documentInfo: this.getDocumentInfo(documentId),
            placementInfo,
            trust: this._lookupTrustObservation(placementInfo)
        };
    }

    _lookupTrustObservation(placementInfo) {
        if (!placementInfo || !this._lastDiscoveryDiagnosticsRaw) {
            return null;
        }
        const match = this._lastDiscoveryDiagnosticsRaw.observations.find((o) =>
            o.subjectType === 'placement-record' && o.subjectId === placementInfo.placementId);
        if (!match) {
            return null;
        }
        return {
            status: match.status,
            reason: match.reason,
            freshness: match.freshness && typeof match.freshness.toJSON === 'function'
                ? match.freshness.toJSON()
                : match.freshness
        };
    }

    // Keyed by publicationId, unlike movePlacement()/removePlacement(): it
    // reaches Publications with no documentId path at all, such as a
    // Repository-admitted Publication this replica never published.
    //
    // Delegates to placePublicationUseCase, which builds the placement and
    // already supports first and later placements alike, so there's no "already
    // placed" guard. The PlacementRecord's owner is the caller, never the
    // Publication's author: placing a Publication never makes you its owner.
    //
    // Authorization is ungated, as for automatic initial placement; whether it
    // should be gated is an open product decision.
    //
    // Throws when no placePublicationUseCase is wired, like
    // movePlacement()/removePlacement().
    placePublication(publicationId, position) {
        if (!this._placePublicationUseCase) {
            throw new Error('WorldNavigationSession: publication cannot be placed — no PlacePublicationUseCase wired');
        }
        if (typeof publicationId !== 'string' || publicationId.length === 0) {
            throw new Error('WorldNavigationSession: placePublication requires a publicationId');
        }
        return this._placePublicationUseCase.execute(publicationId, position);
    }

    // Moves a placement. Not a document mutation: it never touches the
    // Document or Publication and never forks (see docs/Principles.md, "Moving
    // A Placement Is Not Editing A Document"), even for a still-published
    // snapshot. MoveWorldPlacementUseCase makes the signed revision; this only
    // resolves which placement `documentId` means.
    movePlacement(documentId, newPosition) {
        const id = documentId || this._activeDocumentId;
        if (!this._moveWorldPlacementUseCase) {
            throw new Error('WorldNavigationSession: placement cannot be moved — no MoveWorldPlacementUseCase wired');
        }
        const record = this._resolvePlacementRecord(id);
        if (!record) {
            throw new Error(`WorldNavigationSession: "${id}" has no known placement to move`);
        }
        return this._moveWorldPlacementUseCase.execute(record.placementId, newPosition);
    }

    // Takes the placement out of shared space. Not unpublish: the Publication,
    // Document and material are untouched, and the Publication can be found and
    // placed again. getPlacementInfo() returns null afterwards, so the panel
    // collapses on the next refresh.
    //
    // `expectedPlacementId` is an optional compare-and-swap guard: if the
    // placement now resolved for this document differs (moved, replaced or
    // removed since the panel rendered), it refuses rather than removing one
    // the person never saw. Without it, whatever resolves is removed.
    removePlacement(documentId, expectedPlacementId = null) {
        const id = documentId || this._activeDocumentId;
        if (!this._removeWorldPlacementUseCase) {
            throw new Error('WorldNavigationSession: placement cannot be removed — no RemoveWorldPlacementUseCase wired');
        }
        const record = this._resolvePlacementRecord(id);
        if (!record) {
            throw new Error(`WorldNavigationSession: "${id}" has no known placement to remove`);
        }
        if (expectedPlacementId && record.placementId !== expectedPlacementId) {
            throw new Error('WorldNavigationSession: this placement has changed since it was selected — refusing to remove a different placement');
        }
        this._removeWorldPlacementUseCase.execute(record.placementId);
    }

    // Retracts the Publication governing `documentId` from the catalog. Not a
    // placement removal or a document deletion: UnpublishDocumentUseCase decides
    // what happens, and this adds no cleanup of its own.
    //
    // Known side effect: getPlacementInfo()/movePlacement()/removePlacement()
    // resolve placements through the current Publication, so an existing
    // placement becomes unreachable by documentId, though the PlacementRecord
    // is untouched and still reachable by publicationId (see
    // getPlacementInfoForPublication()).
    //
    // `expectedPublicationId` is a compare-and-swap guard like
    // removePlacement()'s: a stale panel never retracts a Publication it didn't
    // read. Without it, whatever resolves is unpublished.
    //
    // Returns UnpublishDocumentUseCase.execute()'s boolean unchanged.
    unpublishDocument(documentId, expectedPublicationId = null) {
        const id = documentId || this._activeDocumentId;
        if (!this._unpublishDocumentUseCase) {
            throw new Error('WorldNavigationSession: publication cannot be unpublished — no UnpublishDocumentUseCase wired');
        }
        const publication = this._resolvePublicationForPlacement(id);
        if (!publication) {
            throw new Error(`WorldNavigationSession: "${id}" has no known publication to unpublish`);
        }
        if (expectedPublicationId && publication.id !== expectedPublicationId) {
            throw new Error('WorldNavigationSession: this publication has changed since it was selected — refusing to unpublish a different publication');
        }
        return this._unpublishDocumentUseCase.execute(publication.id);
    }

    // Read side, via GetPublicationCommentariesUseCase. Without it, `[]`. No
    // sorting here.
    getPublicationCommentaries(publicationId) {
        if (!this._getPublicationCommentariesUseCase || !publicationId) {
            return [];
        }
        return this._getPublicationCommentariesUseCase.execute({ publicationId });
    }

    // Write side, delegated to AddPublicationCommentaryUseCase. Throws when not
    // wired: creating commentary is an explicit action whose outcome the caller
    // must see. `authorIdentityId` is deliberately not a parameter. Optional
    // `commentaryId`/`createdAt` let a manual retry of an unchanged draft reuse
    // the store's idempotent-retry identity instead of creating a visible
    // duplicate (see OwnPublicationPanel).
    addPublicationCommentary({ publicationId, content, commentaryId, createdAt }) {
        if (!this._addPublicationCommentaryUseCase) {
            throw new Error('WorldNavigationSession: publication commentary cannot be created — no AddPublicationCommentaryUseCase wired');
        }
        return this._addPublicationCommentaryUseCase.execute({ publicationId, content, commentaryId, createdAt });
    }

    // Read-only seam for the Notification History panel. Without the use case,
    // `[]`. Once wired there is no try/catch here: authentication and storage
    // failures propagate, so the caller can tell "no notifications" from
    // "couldn't load" (see ui/components/NotificationHistoryPanel.js). No
    // sorting here.
    getRecipientNotificationEvents() {
        if (!this._getRecipientNotificationEventsUseCase) {
            return [];
        }
        return this._getRecipientNotificationEventsUseCase.execute();
    }

    // Guard for document-scoped mutations. Returns the documentId to operate on:
    // unchanged when editable, otherwise the new fork's id.
    _ensureEditableDocumentId(documentId) {
        if (!documentId || !this._publishedDocumentIds.has(documentId)) {
            return documentId;
        }
        return this._forkForEdit(documentId);
    }

    // The actual Copy-on-Write: forks `sourceDocumentId`, swaps this session's
    // view to the fork (the source is unloaded so the mutation lands on the
    // fork), and remaps selection, focus and hover. Returns the fork's id.
    //
    // Throws if the fork policy forbids forking, like ForkDocumentUseCase.
    _forkForEdit(sourceDocumentId) {
        const sourceDoc = this._loadedDocuments.get(sourceDocumentId);
        if (!sourceDoc) {
            throw new Error(`WorldNavigationSession: no loaded document "${sourceDocumentId}" to fork`);
        }

        const policy = this._checkForkPolicy(sourceDocumentId);
        if (!policy.allowed) {
            throw new Error(
                `WorldNavigationSession: forking is not permitted under license `
                + `${policy.license ? policy.license.id : 'UNSPECIFIED'} for document "${sourceDocumentId}"`
            );
        }

        const user = this._identityProvider ? this._identityProvider.currentUser() : null;
        const fork = this._documentCloneService.execute(sourceDoc, {
            title: `Fork of ${sourceDoc.metadata.title || 'Untitled'}`,
            author: user ? user.username : null,
            parentDocumentId: sourceDoc.world.id,
            // Without the eventBus the fork's later mutations update the model but never
            // reach the renderer, freezing the mesh. Same bus _loadWorld and the
            // WorldRenderer use.
            eventBus: this._eventBus
        });
        const forkId = fork.world.id;

        this._loadedDocuments.set(forkId, fork);
        const history = new CommandHistory({ world: fork.world });
        history.markUnsaved();
        this._registerCommandHistory(forkId, history);

        // The fork inherits the source's position permanently: it is
        // not discoverable (never published), so the layout/discovery
        // providers can never resolve a position for `forkId` on their
        // own — every later lookup must come back here, not fall
        // through to their "unknown document" default.
        const pos = this._getWorldPosition(sourceDocumentId);
        this._localPositions.set(forkId, pos);
        this._localOnlyDocumentIds.add(forkId);

        if (this._session) {
            this._session.removeWorld(sourceDoc.world, sourceDocumentId);
            this._session.addWorld(fork.world, forkId, pos);
        }

        // The published source is superseded in THIS session's view —
        // it was never mutated (a fresh reload of the same publication
        // elsewhere still resolves it byte-for-byte unchanged), but
        // this session now works against the fork exclusively.
        this._loadedDocuments.delete(sourceDocumentId);
        this._unregisterCommandHistory(sourceDocumentId);
        this._publishedDocumentIds.delete(sourceDocumentId);

        this._remapReferencesAfterFork(sourceDocumentId, sourceDoc, forkId, fork);

        // So the UI can say what happened instead of the document id silently
        // changing; see consumeForkNotice() / WorldView's guarded().
        this._pendingForkNotice = {
            sourceDocumentId,
            sourceTitle: sourceDoc.metadata.title || 'Untitled',
            forkId,
            forkTitle: fork.metadata.title
        };

        return forkId;
    }

    // Drains the notice _forkForEdit leaves behind, if any. Returns
    // null (not just falsy) when nothing forked since the last call —
    // callers can `if (notice) ...` without worrying about undefined.
    consumeForkNotice() {
        const notice = this._pendingForkNotice;
        this._pendingForkNotice = null;
        return notice;
    }

    // The world position to render/pivot `documentId` at. Prefers a
    // remembered local position (set at fork time — see _forkForEdit)
    // over the layout provider, because the provider can only resolve
    // positions for documents it can discover, and a fork never is
    // one. Used everywhere a position is needed for a document that
    // might be a fork, not just inside _forkForEdit itself.
    _getWorldPosition(documentId) {
        if (this._localPositions.has(documentId)) {
            return this._localPositions.get(documentId);
        }
        return this._worldLayoutProvider.getPosition(documentId);
    }

    // Every Publication on record for `documentId`, or [] when there is
    // no discoveryProvider wired to ask at all. The one lookup shared by
    // _isKnownPublication (is this world published at all?) and
    // _checkForkPolicy (may it be forked?).
    _findPublications(documentId) {
        if (!this._discoveryProvider || typeof this._discoveryProvider.findByDocumentId !== 'function') {
            return [];
        }
        return this._discoveryProvider.findByDocumentId(documentId) || [];
    }

    // Is `documentId` a real, published world — the actual condition
    // fork-on-write exists to protect? A session with no
    // discoveryProvider wired cannot tell, and does not claim to (see
    // _loadWorld).
    _isKnownPublication(documentId) {
        return this._findPublications(documentId).length > 0;
    }

    // Does the license governing `documentId` permit forking? Only enforced
    // when a Publication resolves, like ForkDocumentUseCase. In practice only
    // reached for ids _isKnownPublication confirmed, so the no-publication
    // branch is defensive.
    _checkForkPolicy(documentId) {
        const publications = this._findPublications(documentId);
        if (publications.length === 0) {
            return { allowed: true, license: null };
        }
        // Most recent publication of this document governs.
        const publication = publications.reduce((latest, p) =>
            (!latest || p.publishedAt > latest.publishedAt) ? p : latest, null);
        const license = publication.license instanceof License
            ? publication.license
            : new License(publication.license || {});
        return { allowed: license.forkAllowed, license };
    }

    // The governing publication id, for a caller building a `/editor?fork=`
    // link like PublicationCatalog.js#forkPublication(); without the
    // `publication` param, ForkDocumentUseCase never enforces the license. Uses
    // _checkForkPolicy()'s "most recent Publication governs" rule so the
    // outcome matches in-session fork-on-write. Null for an unknown
    // publication.
    getPublicationIdForDocument(documentId) {
        const publications = this._findPublications(documentId);
        if (publications.length === 0) {
            return null;
        }
        const publication = publications.reduce((latest, p) =>
            (!latest || p.publishedAt > latest.publishedAt) ? p : latest, null);
        return publication.id;
    }

    // The Publication object governing `documentId`, for callers that need the
    // object rather than an id (e.g. World View's own "distribute my snapshot",
    // bound to OwnPublicationPanel's `publication` prop). Performs the same
    // "most recent Publication for this documentId wins" reduction as
    // _resolvePublicationForPlacement(), but over
    // `_publicationActionDiscoveryProvider`, so a Repository-admitted
    // Publication this replica never published resolves here without
    // _isKnownPublication()/_checkForkPolicy() treating a never-published
    // document as known or applying that license to it. Placement resolution and
    // fork policy stay on the narrow `_findPublications()`. Null when no
    // Publication is known.
    getPublicationForDocument(documentId) {
        if (!this._publicationActionDiscoveryProvider || typeof this._publicationActionDiscoveryProvider.findByDocumentId !== 'function') {
            return null;
        }
        const publications = this._publicationActionDiscoveryProvider.findByDocumentId(documentId) || [];
        if (publications.length === 0) return null;
        return publications.reduce((latest, p) => (!latest || p.publishedAt > latest.publishedAt) ? p : latest, null);
    }

    // Remaps this session's live references — selection, focus, active
    // document, hover — from the just-superseded source document onto
    // its fork. Bricks get fresh ids on clone (DocumentCloneService),
    // so brick references are remapped POSITIONALLY (same building
    // index, same brick index within it) rather than by id; the clone
    // preserves structure and order exactly, so position is a stable
    // identity across the fork boundary.
    _remapReferencesAfterFork(sourceDocumentId, sourceDoc, forkId, forkDoc) {
        if (this._focusedDocumentId === sourceDocumentId) {
            this._focusedDocumentId = forkId;
        }
        // A fork only happens because a mutation targeted the source. If the source
        // was active, the fork becomes active, or the next mutation would target a
        // document that was just unloaded.
        if (this._activeDocumentId === sourceDocumentId) {
            this._activeDocumentId = forkId;
        }
        if (this._spatialSelection && this._spatialSelection.documentId === sourceDocumentId) {
            if (this._spatialSelection.type === 'ground') {
                this._spatialSelection = SpatialSelectionState.ground(this._spatialSelection.position);
            } else {
                const items = this._spatialSelection.items
                    .map((item) => item.type === 'brick'
                        ? this._remapBrickReference(sourceDoc, forkDoc, item.buildingId, item.brickId)
                        : null)
                    .filter((item) => item !== null);
                this._spatialSelection = items.length > 0
                    ? SpatialSelectionState.bricks({ documentId: forkId, items })
                    : SpatialSelectionState.empty();
            }
            // The renderer's own selection highlight and the transform
            // gizmo were both set up against the source document's
            // (now-removed) brick meshes. Without this, the visuals
            // stay pinned to whatever was on screen before the fork —
            // typically nothing, since removeWorld just tore those
            // meshes down — and the gizmo can no longer be grabbed even
            // though the (correct, forked) selection state says
            // something is selected.
            if (this._session) {
                this._session.selectBricks(this._spatialSelection.brickIds, this._spatialSelection.brickId);
            }
            this._refreshEditingContext();
            this._refreshInspection();
            this._refreshGizmo();
        }
        if (this._spatialHover && this._spatialHover.documentId === sourceDocumentId) {
            this._setSpatialHover(SpatialHoverState.empty());
        }
    }

    // Positional remap: same building index, same brick index within
    // it. Returns null if the source reference cannot be resolved
    // (defensive — should not happen for a fresh, unedited clone).
    _remapBrickReference(sourceDoc, forkDoc, buildingId, brickId) {
        const sourceBuildings = sourceDoc.world.getBuildings();
        const buildingIndex = sourceBuildings.findIndex((b) => b.id === buildingId);
        if (buildingIndex === -1) return null;
        const sourceBricks = sourceBuildings[buildingIndex].getBricks();
        const brickIndex = sourceBricks.findIndex((b) => b.id === brickId);
        if (brickIndex === -1) return null;

        const forkBuildings = forkDoc.world.getBuildings();
        const forkBuilding = forkBuildings[buildingIndex];
        if (!forkBuilding) return null;
        const forkBrick = forkBuilding.getBricks()[brickIndex];
        if (!forkBrick) return null;
        return { type: 'brick', buildingId: forkBuilding.id, brickId: forkBrick.id };
    }

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
	getTimeline(documentId) {
	    const doc = this.getDocument(documentId || this._activeDocumentId);
	    const history = doc ? this._commandHistories.get(doc.world.id) : null;
	    return history ? history.getTimeline() : [];
	}		
	
	restoreHistoryAt(cursor, documentId) {
	    if (!this._replayDocumentUseCase) {
	        throw new Error('no restore configured');
	    }
	    const docId = documentId || this._activeDocumentId;
	    const doc = this.getDocument(docId);
	    if (!doc) throw new Error('no loaded document');
	    
	    const history = this._commandHistories.get(doc.world.id);
	    if (!history) throw new Error('no history');
	
	    // 1. Rebuild the world and document
	    const restoredWorld = this._replayDocumentUseCase.execute(history, { endCursor: cursor });
	    const restoredDocument = new Document({
	        world: restoredWorld,
	        metadata: doc.metadata
	    });
	    
	    // 2. Rebuild the history
	    const restoredHistory = new CommandHistory({ world: restoredWorld });
	    restoredHistory.markUnsaved();
	
	    // 3. Update session state
	    this._loadedDocuments.set(docId, restoredDocument);
	    this._registerCommandHistory(restoredWorld.id, restoredHistory);
	
	    // 4. Retire the old history
	    if (!this._retiredHistories) this._retiredHistories = new Map();
	    if (!this._retiredHistories.has(doc.world.id)) this._retiredHistories.set(doc.world.id, []);
	    this._retiredHistories.get(doc.world.id).push(history);
	
	    // 5. Update Renderer
	    //
	    // A preview only occupies this document's render slot if it belongs to this
	    // documentId. Checking `_historyPreview.active` alone let restoring document
	    // B wipe document A's preview. A preview for another document is left
	    // untouched.
	    if (this._session) {
	        const previewingThisDocument = this._historyPreview
	            && this._historyPreview.active
	            && this._historyPreview.documentId === docId;
	        if (previewingThisDocument) {
	            this._session.removeWorld(this._historyPreview.world, `replay:${docId}`);
	            this._historyPreview = null;
	        } else {
	            this._session.removeWorld(doc.world, docId);
	        }
	        this._session.addWorld(restoredWorld, docId, this._worldLayoutProvider.getPosition(docId));
	    }
	
	    this.clearSelection();
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

	// -----------------------------------------------------------------
	// World Landmarks: explicit, persistent World content.
	// -----------------------------------------------------------------
	//
	// Landmarks already appear in getWorldLocations() for navigation. This
	// section is the mutation surface (create, update, remove), each an ordinary
	// Command through `this._commandHistories.get(worldId).execute(cmd)`, so
	// propagation and undo/redo need no landmark-specific code. See
	// core/WorldLandmark.js and docs/Principles.md, "A Landmark Is World
	// Content, Not Spatial Presence".
	//
	// getLandmark() reads the raw WorldLandmark, since a WorldLocation lacks
	// description, authorIdentityId and worldId. It searches every loaded
	// document, so the Edit form can prefill from whichever World holds it.
	// Null when no loaded document has it.
	getLandmark(landmarkId) {
	    const doc = this._resolveLandmarkOwner(landmarkId);
	    if (!doc) return null;
	    return doc.world.getWorldLandmark(landmarkId).toJSON();
	}

	// Which loaded document's World actually owns landmarkId. Landmarks
	// are world-wide destinations exactly like structures (see
	// WorldLocationDirectory's own header) — a landmark shown in the
	// Locations panel may belong to any currently loaded document, not
	// only the active one — so getLandmark()/update/remove below resolve
	// by searching rather than assuming "the active document."
	_resolveLandmarkOwner(landmarkId) {
	    for (const doc of this.getLoadedDocuments()) {
	        if (doc.world.getWorldLandmark(landmarkId)) {
	            return doc;
	        }
	    }
	    return null;
	}

	// "Place Here": a landmark at the avatar's position in the active
	// document's World, behind the same fork-on-write guard and canEditDocument
	// gate ("any EDIT member can modify World landmarks"). Naming a place is
	// annotation, not building, so it stays in World View (see
	// docs/Principles.md, "World View Observes and Navigates; Editor Mutates and
	// Builds").
	//
	// Requires a live avatar and throws without one. The stored Y is the
	// avatar's real Y. The avatar is in shared layout space, so this World's
	// layout offset (getDocumentPosition) is subtracted to get the local
	// position, the inverse of what WorldLocationDirectory adds for display.
	createLandmarkHere(title, description = '') {
	    const avatarPos = this.getAvatarPosition();
	    if (!avatarPos) {
	        throw new Error('WorldNavigationSession: cannot add a landmark without a live avatar position');
	    }
	    this._activeDocumentId = this._ensureEditableDocumentId(this._activeDocumentId);
	    const doc = this.getDocument(this._activeDocumentId);
	    if (!doc) {
	        throw new Error('WorldNavigationSession: no active World to add a landmark to');
	    }
	    const worldId = doc.world.id;
	    if (!this.canEditDocument(worldId)) {
	        throw new Error('WorldNavigationSession: not authorized to add landmarks to this World');
	    }
	    const authorIdentityId = resolveSigningIdentityId(this._identityProvider);
	    if (!authorIdentityId) {
	        throw new Error('WorldNavigationSession: sign in to add a landmark');
	    }
	    const layoutPosition = this.getDocumentPosition(worldId);
	    const cmd = new CreateWorldLandmarkCommand({
	        worldId,
	        authorIdentityId,
	        title,
	        description,
	        position: new Position(
	            avatarPos.x - layoutPosition.x,
	            avatarPos.y - layoutPosition.y,
	            avatarPos.z - layoutPosition.z
	        )
	    });
	    this._commandHistories.get(worldId).execute(cmd);
	    return cmd.executedLandmarkId;
	}

	updateLandmark(landmarkId, { title, description } = {}) {
	    const owner = this._resolveLandmarkOwner(landmarkId);
	    if (!owner) {
	        throw new Error(`WorldNavigationSession: no landmark "${landmarkId}" known`);
	    }
	    const worldId = this._ensureEditableDocumentId(owner.world.id);
	    if (!this.canEditDocument(worldId)) {
	        throw new Error('WorldNavigationSession: not authorized to edit landmarks in this World');
	    }
	    this._commandHistories.get(worldId).execute(
	        new UpdateWorldLandmarkCommand({ worldId, landmarkId, title, description })
	    );
	    return true;
	}

	removeLandmark(landmarkId) {
	    const owner = this._resolveLandmarkOwner(landmarkId);
	    if (!owner) {
	        throw new Error(`WorldNavigationSession: no landmark "${landmarkId}" known`);
	    }
	    const worldId = this._ensureEditableDocumentId(owner.world.id);
	    if (!this.canEditDocument(worldId)) {
	        throw new Error('WorldNavigationSession: not authorized to remove landmarks from this World');
	    }
	    this._commandHistories.get(worldId).execute(
	        new RemoveWorldLandmarkCommand({ worldId, landmarkId })
	    );
	    return true;
	}

	// -----------------------------------------------------------------
	// World Animal Decorations: bakes the nearest released (session-local, not
	// tile-baked) animal into the active document's World as durable content.
	// Same guard, authorization and layout-offset subtraction as
	// createLandmarkHere(), sourcing species and position from the animal. No
	// update/remove counterpart beyond undecorate (see core/AnimalDecoration.js,
	// decorative only).
	//
	// Unlike a landmark, Y is kept: avatarPos.y includes real height gained from
	// standing on bricks, so subtracting only the layout offset (never
	// re-deriving from terrain) keeps "released on top of a pyramid" through
	// save, publish and reload.
	//
	// Returns null, never throws, when nothing nearby qualifies: pressing the
	// key with nothing around is expected. (No live avatar at all still
	// throws.)
	//
	// Ownership moves from runtime to document: once the command commits, the
	// source AnimalPresence is discard()'d, so it can't be re-caught or
	// re-decorated, and it isn't a live creature for later loaders either.
	decorateNearestReleasedAnimalHere() {
	    const avatarPos = this.getAvatarPosition();
	    if (!avatarPos) {
	        throw new Error('WorldNavigationSession: cannot decorate a World without a live avatar position');
	    }
	    const target = this._animalRuntimeInstances.nearestReleased(avatarPos, ANIMAL_INTERACTION_RADIUS);
	    if (!target) {
	        return null;
	    }
	    this._activeDocumentId = this._ensureEditableDocumentId(this._activeDocumentId);
	    const doc = this.getDocument(this._activeDocumentId);
	    if (!doc) {
	        throw new Error('WorldNavigationSession: no active World to add a decoration to');
	    }
	    const worldId = doc.world.id;
	    if (!this.canEditDocument(worldId)) {
	        throw new Error('WorldNavigationSession: not authorized to decorate this World');
	    }
	    const authorIdentityId = resolveSigningIdentityId(this._identityProvider);
	    if (!authorIdentityId) {
	        throw new Error('WorldNavigationSession: sign in to decorate a World');
	    }
	    const layoutPosition = this.getDocumentPosition(worldId);
	    const cmd = new CreateWorldAnimalDecorationCommand({
	        worldId,
	        authorIdentityId,
	        species: target.species,
	        position: new Position(
	            target.position.x - layoutPosition.x,
	            target.position.y - layoutPosition.y,
	            target.position.z - layoutPosition.z
	        )
	    });
	    this._commandHistories.get(worldId).execute(cmd);
	    this._animalRuntimeInstances.discard(target.id, target.position);
	    return cmd.executedDecorationId;
	}

	// The 'G' key's dispatcher, mirroring the 'F' priority rule:
	//
	//   a released animal is in range   -> G decorates it
	//   otherwise, a decoration is in range -> G undecorates it
	//   otherwise                       -> G does nothing
	//
	// Decorating wins a tie, as catching wins over releasing.
	toggleNearestAnimalDecorationHere() {
	    const avatarPos = this.getAvatarPosition();
	    if (!avatarPos) {
		    throw new Error('WorldNavigationSession: cannot toggle a World animal decoration without a live avatar position');
	    }
	    if (this._animalRuntimeInstances.nearestReleased(avatarPos, ANIMAL_INTERACTION_RADIUS)) {
		    return this.decorateNearestReleasedAnimalHere();
	    }
	    return this.undecorateNearestAnimalDecorationHere();
	}

	// The nearest AnimalDecoration within `radius`, searched across every loaded
	// document (undecorating can target any streamed-in World). Returns
	// `{ decoration, doc, globalPosition }` or null. A pure read.
	_nearestAnimalDecorationNear(avatarPos, radius) {
	    let best = null;
	    let bestDistance = Infinity;
	    for (const doc of this.getLoadedDocuments()) {
		    const layoutPosition = this.getDocumentPosition(doc.world.id);
		    for (const decoration of doc.world.getAnimalDecorations()) {
			    const globalPosition = {
				    x: decoration.position.x + layoutPosition.x,
				    y: decoration.position.y + layoutPosition.y,
				    z: decoration.position.z + layoutPosition.z
			    };
			    const dx = globalPosition.x - avatarPos.x;
			    const dz = globalPosition.z - avatarPos.z;
			    const distance = dx * dx + dz * dz;
			    if (distance > radius * radius) {
				    continue;
			    }
			    if (best === null || distance < bestDistance || (distance === bestDistance && decoration.id < best.decoration.id)) {
				    best = { decoration, doc, globalPosition };
				    bestDistance = distance;
			    }
		    }
	    }
	    return best;
	}

	// Undo of decorateNearestReleasedAnimalHere(): removes the nearest
	// decoration and hands it back to AnimalRuntimeInstances as a live,
	// catchable animal. It gets a fresh id: decoration ids are durable World
	// content identities, while released animals always get new ids at release,
	// and the two spaces must not mix.
	//
	// Same guard and authorization as other World mutations. Returns null,
	// never throws, when nothing nearby qualifies.
	undecorateNearestAnimalDecorationHere() {
	    const avatarPos = this.getAvatarPosition();
	    if (!avatarPos) {
		    throw new Error('WorldNavigationSession: cannot undecorate a World without a live avatar position');
	    }
	    const found = this._nearestAnimalDecorationNear(avatarPos, ANIMAL_INTERACTION_RADIUS);
	    if (!found) {
		    return null;
	    }
	    const { decoration, doc, globalPosition } = found;
	    const worldId = this._ensureEditableDocumentId(doc.world.id);
	    if (!this.canEditDocument(worldId)) {
		    throw new Error('WorldNavigationSession: not authorized to remove a decoration from this World');
	    }
	    this._commandHistories.get(worldId).execute(
		    new RemoveWorldAnimalDecorationCommand({ worldId, decorationId: decoration.id })
	    );
	    this._animalRuntimeInstances.add(new AnimalPresence({
		    id: createId(),
		    species: decoration.species,
		    position: new Position(globalPosition.x, globalPosition.y, globalPosition.z)
	    }));
	    return decoration.id;
	}

	// -----------------------------------------------------------------
	// World Regions: a named area (center + radius) rather than a landmark's
	// point. Same Command chokepoint, world-wide resolution and
	// canEditDocument() gate as landmarks. See core/WorldRegion.js and
	// docs/Principles.md, "Users Name Places; The World Derives Geography From
	// Names".
	// -----------------------------------------------------------------

	getRegion(regionId) {
	    const doc = this._resolveRegionOwner(regionId);
	    if (!doc) return null;
	    return doc.world.getWorldRegion(regionId).toJSON();
	}

	_resolveRegionOwner(regionId) {
	    for (const doc of this.getLoadedDocuments()) {
	        if (doc.world.getWorldRegion(regionId)) {
	            return doc;
	        }
	    }
	    return null;
	}

	// "Name This Area": a region centered on the avatar in the active World,
	// with createLandmarkHere()'s guard and authorization. `radius` is required
	// (an area has no sensible default extent). `kind` defaults to
	// RegionKind.PLACE; `parentRegionId` is optional, since hierarchy is never
	// mandatory.
	createRegionHere(name, { description = '', kind = RegionKind.PLACE, radius, parentRegionId = null } = {}) {
	    if (!Number.isFinite(radius) || radius <= 0) {
	        throw new Error('WorldNavigationSession: a region requires a positive radius');
	    }
	    const avatarPos = this.getAvatarPosition();
	    if (!avatarPos) {
	        throw new Error('WorldNavigationSession: cannot add a region without a live avatar position');
	    }
	    this._activeDocumentId = this._ensureEditableDocumentId(this._activeDocumentId);
	    const doc = this.getDocument(this._activeDocumentId);
	    if (!doc) {
	        throw new Error('WorldNavigationSession: no active World to add a region to');
	    }
	    const worldId = doc.world.id;
	    if (!this.canEditDocument(worldId)) {
	        throw new Error('WorldNavigationSession: not authorized to add regions to this World');
	    }
	    const authorIdentityId = resolveSigningIdentityId(this._identityProvider);
	    if (!authorIdentityId) {
	        throw new Error('WorldNavigationSession: sign in to add a region');
	    }
	    const layoutPosition = this.getDocumentPosition(worldId);
	    const cmd = new CreateWorldRegionCommand({
	        worldId,
	        authorIdentityId,
	        name,
	        description,
	        kind,
	        radius,
	        parentRegionId,
	        position: new Position(
	            avatarPos.x - layoutPosition.x,
	            avatarPos.y - layoutPosition.y,
	            avatarPos.z - layoutPosition.z
	        )
	    });
	    this._commandHistories.get(worldId).execute(cmd);
	    return cmd.executedRegionId;
	}

	updateRegion(regionId, { name, description, kind, radius } = {}) {
	    const owner = this._resolveRegionOwner(regionId);
	    if (!owner) {
	        throw new Error(`WorldNavigationSession: no region "${regionId}" known`);
	    }
	    const worldId = this._ensureEditableDocumentId(owner.world.id);
	    if (!this.canEditDocument(worldId)) {
	        throw new Error('WorldNavigationSession: not authorized to edit regions in this World');
	    }
	    this._commandHistories.get(worldId).execute(
	        new UpdateWorldRegionCommand({ worldId, regionId, name, description, kind, radius })
	    );
	    return true;
	}

	removeRegion(regionId) {
	    const owner = this._resolveRegionOwner(regionId);
	    if (!owner) {
	        throw new Error(`WorldNavigationSession: no region "${regionId}" known`);
	    }
	    const worldId = this._ensureEditableDocumentId(owner.world.id);
	    if (!this.canEditDocument(worldId)) {
	        throw new Error('WorldNavigationSession: not authorized to remove regions from this World');
	    }
	    this._commandHistories.get(worldId).execute(
	        new RemoveWorldRegionCommand({ worldId, regionId })
	    );
	    return true;
	}

	// The signed-in identity's did:key id, or null, so PlaceNamingPanel can tell
	// its own claims apart without duplicating the identity lookup.
	getMyIdentityId() {
	    return resolveSigningIdentityId(this._identityProvider);
	}

	// -----------------------------------------------------------------
	// Place Naming & Naming Claims: a separate, additive layer. A WorldRegion's
	// own `name` is untouched. Any identity, not only the region's author or an
	// EDIT member, may publish a signed opinion about what a region is called
	// (core/PlaceNamingClaim.js), and this replica may prefer a name locally.
	// See docs/Principles.md, "A Name Is A Claim, Not A Fact".
	//
	// Without placeNamingClaimUseCase/localNamePreferenceStore, publish/retract
	// throw a clear "not available" error, and reads return empty/null, so a UI
	// can always call getPlaceNamingView()/getPreferredPlaceName().
	// -----------------------------------------------------------------

	// Signs and publishes "I claim region `regionId` is called `name`,"
	// scoped to whichever World that region actually belongs to (see
	// _resolveRegionOwner() above and core/PlaceNamingClaim.js's own
	// header on why a claim always carries an explicit worldId). Throws
	// if the region is unknown to this replica, or if naming claims were
	// never wired — never a canEditDocument() check, unlike every
	// World-content mutation above: publishing a claim never touches the
	// World itself. See application/PlaceNamingClaimUseCase.js#publish().
	publishPlaceNamingClaim(regionId, name) {
	    if (!this._placeNamingClaimUseCase) {
	        throw new Error('WorldNavigationSession: place naming claims are not available');
	    }
	    const owner = this._resolveRegionOwner(regionId);
	    if (!owner) {
	        throw new Error(`WorldNavigationSession: no region "${regionId}" known`);
	    }
	    return this._placeNamingClaimUseCase.publish(owner.world.id, regionId, name);
	}

	// Withdraws a claim THIS identity itself published — see
	// application/PlaceNamingClaimUseCase.js#retract() on why anyone
	// else's claim id is silently ignored (returns false) rather than
	// throwing.
	retractPlaceNamingClaim(regionId, claimId) {
	    if (!this._placeNamingClaimUseCase) {
	        throw new Error('WorldNavigationSession: place naming claims are not available');
	    }
	    const owner = this._resolveRegionOwner(regionId);
	    if (!owner) {
	        return false;
	    }
	    return this._placeNamingClaimUseCase.retract(owner.world.id, claimId);
	}

	// Every claim this replica knows about for one region, most recent
	// first — raw facts, unranked. [] when naming claims aren't wired or
	// the region is unknown, never an error.
	getPlaceNamingClaims(regionId) {
	    if (!this._placeNamingClaimUseCase) {
	        return [];
	    }
	    const owner = this._resolveRegionOwner(regionId);
	    if (!owner) {
	        return [];
	    }
	    return this._placeNamingClaimUseCase.claimsForRegion(owner.world.id, regionId);
	}

	// core/PlaceNamingView.js#namingView() for one region — ranked by
	// distinct-author score, most-agreed-on name first. [] under the
	// same "nothing wired, nothing known" conditions as
	// getPlaceNamingClaims() above.
	getPlaceNamingView(regionId) {
	    if (!this._placeNamingClaimUseCase) {
	        return [];
	    }
	    const owner = this._resolveRegionOwner(regionId);
	    if (!owner) {
	        return [];
	    }
	    return this._placeNamingClaimUseCase.namingView(owner.world.id, regionId);
	}

	// Is a claim with this `claimId` for this `worldId` already in this
	// replica's store? Pass-through to PlaceNamingClaimUseCase#hasClaim().
	// `worldId` is taken directly because a nearby claim may name a World not
	// being viewed. False when naming claims aren't wired.
	hasPlaceNamingClaim(worldId, claimId) {
	    if (!this._placeNamingClaimUseCase) {
	        return false;
	    }
	    return this._placeNamingClaimUseCase.hasClaim(worldId, claimId);
	}

	// -----------------------------------------------------------------
	// Decentralized Place Name Exchange: how a claim reaches, or is reached by,
	// another replica. Both methods delegate to
	// application/PlaceNamingClaimExchange.js; this session validates, signs
	// and verifies nothing itself.
	// -----------------------------------------------------------------

	// Builds a portable publication package for one claim this replica
	// already has on file for `regionId` — see
	// application/PlaceNamingClaimPublication.js for the exact wire
	// shape. What the caller does with the returned package (write it to
	// a file, copy it to a clipboard) is this session's own business as
	// little as it is application/ExportBlueprintUseCase.js's. Throws if
	// exchange isn't wired, the region is unknown, or `claimId` doesn't
	// match any claim this replica actually has for it — never a stale
	// or partial package.
	exportPlaceNamingClaim(regionId, claimId) {
	    if (!this._placeNamingClaimExchange) {
	        throw new Error('WorldNavigationSession: place naming exchange is not available');
	    }
	    const owner = this._resolveRegionOwner(regionId);
	    if (!owner) {
	        throw new Error(`WorldNavigationSession: no region "${regionId}" known`);
	    }
	    const claim = this._placeNamingClaimUseCase
	        ? this._placeNamingClaimUseCase.claimsForRegion(owner.world.id, regionId).find((c) => c.id === claimId)
	        : null;
	    if (!claim) {
	        throw new Error(`WorldNavigationSession: no naming claim "${claimId}" known for this region`);
	    }
	    return this._placeNamingClaimExchange.exportClaim(claim);
	}

	// Imports a naming claim publication `pkg` (untrusted input — see
	// application/PlaceNamingClaimExchange.js#importClaim()'s own
	// "validate, construct, verify" order) into this replica's own
	// claim store. Deliberately NOT scoped to `regionId` or to whatever
	// World is currently active: a publication carries its own
	// worldId/regionId, and application/LocalPlaceNamingClaimStore.js is
	// already scoped per-World — see that store's own header on why it
	// happily holds claims for a World this replica isn't even currently
	// viewing. Returns `{ claim, isNew }`; throws for anything malformed
	// or unverifiable, never silently drops it.
	importPlaceNamingClaim(pkg) {
	    if (!this._placeNamingClaimExchange) {
	        throw new Error('WorldNavigationSession: place naming exchange is not available');
	    }
	    return this._placeNamingClaimExchange.importClaim(pkg);
	}

	// This replica's own LOCAL, unsigned, unshared override — see
	// application/LocalNamePreferenceStore.js's own header on why this
	// is a genuinely third concept, never a claim and never the
	// region's own name.
	setPreferredPlaceName(regionId, name) {
	    if (!this._localNamePreferenceStore) {
	        throw new Error('WorldNavigationSession: place name preferences are not available');
	    }
	    const owner = this._resolveRegionOwner(regionId);
	    if (!owner) {
	        throw new Error(`WorldNavigationSession: no region "${regionId}" known`);
	    }
	    return this._localNamePreferenceStore.setPreferredName(owner.world.id, regionId, name);
	}

	clearPreferredPlaceName(regionId) {
	    if (!this._localNamePreferenceStore) {
	        return false;
	    }
	    const owner = this._resolveRegionOwner(regionId);
	    if (!owner) {
	        return false;
	    }
	    return this._localNamePreferenceStore.clearPreferredName(owner.world.id, regionId);
	}

	// This replica's own raw local override for one region, or null —
	// distinct from getDisplayPlaceName() below, which additionally
	// falls back to the community-claimed and World-authored name. A UI
	// showing "your preference: ___" reads this; a UI showing "what to
	// actually label the map with" reads getDisplayPlaceName().
	getPreferredPlaceName(regionId) {
	    if (!this._localNamePreferenceStore) {
	        return null;
	    }
	    const owner = this._resolveRegionOwner(regionId);
	    if (!owner) {
	        return null;
	    }
	    return this._localNamePreferenceStore.getPreferredName(owner.world.id, regionId);
	}

	// The name to display for a region, in priority order:
	//   1. this replica's own local preference, if one was ever set
	//   2. the top-ranked name from getPlaceNamingView() above, if
	//      anyone has published a claim at all
	//   3. the region's own WorldRegion.name
	// Never throws or returns an empty string for an existing region.
	getDisplayPlaceName(regionId) {
	    const owner = this._resolveRegionOwner(regionId);
	    const preferred = (this._localNamePreferenceStore && owner)
	        ? this._localNamePreferenceStore.getPreferredName(owner.world.id, regionId)
	        : null;
	    if (preferred) {
	        return preferred;
	    }
	    const claimed = preferredClaimedName(regionId, this.getPlaceNamingClaims(regionId));
	    if (claimed) {
	        return claimed;
	    }
	    const region = this.getRegion(regionId);
	    return region ? region.name : '';
	}

	// --- History Preview & Restore ---
	beginHistoryPreview() {
	    this._historyPreview = { active: true, cursor: null, world: null };
	    return true;
	}
	
	previewHistoryAt(cursor) {
	    if (!this._historyPreview || !this._historyPreview.active) {
	        throw new Error('no active history preview');
	    }
	    const history = this._getActiveCommandHistory();
	    if (!history) throw new Error('no history');
	    
	    const replayWorld = this._replayDocumentUseCase.execute(history, { endCursor: cursor });
	    // Captured before _historyPreview is overwritten. Selecting a different
	    // entry while already previewing must remove the previous preview world
	    // from `replay:${docId}`, not just the (already hidden) live world, so this
	    // distinguishes "first preview" from "switching entries".
	    const previousPreviewWorld = this._historyPreview.world;
	    const previousPreviewDocumentId = this._historyPreview.documentId;
	    this._historyPreview.cursor = cursor;
	    this._historyPreview.world = replayWorld;

	    // Renderer integration: hide live world, show replay world.
	    // Must resolve the SAME document _getActiveCommandHistory() just
	    // built `history` from above — otherwise the replay could swap
	    // out one document's live world while showing a different
	    // document's history.
	    // Remembered on _historyPreview itself (not re-resolved at cancel
	    // time) so a selection/active-document change WHILE the preview
	    // is open can never make cancelHistoryPreview restore the wrong
	    // document.
	    const docId = this._resolveMutationTargetId();
	    this._historyPreview.documentId = docId;
	    if (this._session && docId) {
	        const doc = this.getDocument(docId);
	        if (doc) {
	            if (previousPreviewWorld) {
	                this._session.removeWorld(previousPreviewWorld, `replay:${previousPreviewDocumentId}`);
	            } else {
	                this._session.removeWorld(doc.world, docId);
	            }
	            this._session.addWorld(replayWorld, `replay:${docId}`, this._worldLayoutProvider.getPosition(docId));
	        }
	    }
	    return true;
	}

	cancelHistoryPreview() {
	    if (!this._historyPreview || !this._historyPreview.active) return false;
	    
	    const docId = this._historyPreview.documentId;
	    if (this._session && docId) {
	        const doc = this.getDocument(docId);
	        if (doc) {
	            this._session.removeWorld(this._historyPreview.world, `replay:${docId}`);
	            this._session.addWorld(doc.world, docId, this._worldLayoutProvider.getPosition(docId));
	        }
	    }
	    this._historyPreview = null;
	    return true;
	}
	
	getHistoryPreview() {
	    if (!this._historyPreview || !this._historyPreview.active) return null;
	    return { cursor: this._historyPreview.cursor, world: this._historyPreview.world };
	}
	getRetiredHistories(documentId) {
	    return this._retiredHistories ? (this._retiredHistories.get(documentId || this._activeDocumentId) || []) : [];
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
