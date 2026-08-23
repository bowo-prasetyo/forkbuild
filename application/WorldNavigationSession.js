import { RenderWorldViewUseCase } from './RenderWorldViewUseCase.js';
import { Position } from '../core/Position.js';
import { SpatialSelectionState } from './spatial-state/SpatialSelectionState.js';
import { SpatialHoverState } from './spatial-state/SpatialHoverState.js';
import { SpatialCameraController } from './SpatialCameraController.js';
import { SpatialInspectionService } from './SpatialInspectionService.js';
import { SpatialInspectionState } from './spatial-state/SpatialInspectionState.js';
import { SpatialEditingService } from './SpatialEditingService.js';
import { SpatialEditingContext } from './spatial-state/SpatialEditingContext.js';
import { SpatialPlacementService } from './SpatialPlacementService.js';
import { SpatialPlacementState } from './spatial-state/SpatialPlacementState.js';
import { PlaceBrickCommand } from './commands/PlaceBrickCommand.js';
import { CommandHistory } from './CommandHistory.js';
import { PlacementValidator } from '../core/PlacementValidator.js';
import { terrainHeightAt, DEFAULT_WORLD_SEED } from '../core/TerrainHeightField.js';
import { EventBus } from '../core/events/EventBus.js';
import { TransformGizmoUseCase } from './TransformGizmoUseCase.js';
import { TransformSettings } from './TransformSettings.js';
import { License } from '../core/License.js';
import { SpatialClipboardState } from './spatial-state/SpatialClipboardState.js';
import { CreateGroupCommand } from './commands/CreateGroupCommand.js';
import { DeleteGroupCommand } from './commands/DeleteGroupCommand.js';
import { RenameGroupCommand } from './commands/RenameGroupCommand.js';
import { AddToGroupCommand } from './commands/AddToGroupCommand.js';
import { RemoveFromGroupCommand } from './commands/RemoveFromGroupCommand.js';
import { DuplicateGroupCommand } from './commands/DuplicateGroupCommand.js';
import { CreateWorldLandmarkCommand } from './commands/CreateWorldLandmarkCommand.js';
import { UpdateWorldLandmarkCommand } from './commands/UpdateWorldLandmarkCommand.js';
import { RemoveWorldLandmarkCommand } from './commands/RemoveWorldLandmarkCommand.js';
import { CreateWorldRegionCommand } from './commands/CreateWorldRegionCommand.js';
import { UpdateWorldRegionCommand } from './commands/UpdateWorldRegionCommand.js';
import { RemoveWorldRegionCommand } from './commands/RemoveWorldRegionCommand.js';
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
// 0.2.41 — how often the local avatar's PROFILE re-advertises even
// when nothing changed. Deliberately much less frequent than presence
// (published on every accepted movement) — see
// core/AvatarProfileAdvertisement.js's own header: appearance is
// low-frequency, persistent state. This exists ONLY to let a replica
// that joins (or missed the one message) mid-session eventually catch
// up on a fire-and-forget transport with no request/response — the
// same "eventual" half of "eventually consistent presentation state."
const PROFILE_REPUBLISH_INTERVAL_MS = 15000;
// 0.3.1 — how often the local avatar's PRESENCE re-advertises even
// when it hasn't moved. Unlike PROFILE_REPUBLISH_INTERVAL_MS above,
// this has to stay comfortably UNDER a receiver's own
// application/LocalPresenceStore.js staleAfterMs/absentAfterMs
// freshness window (2500ms/6000ms by default) — those are judged
// purely from wall-clock time since the last ACCEPTED advertisement
// (core/PresenceFreshness.js), and 0.2.37 deliberately never
// published one at all while idle ("an idle local avatar never
// reaches this line, so it publishes nothing"). That was fine when
// STALE/ABSENT only fed a diagnostic label, but it means a replica
// that is standing perfectly still — not gone, just not moving — is
// pruned out of every OTHER replica's Nearby Avatars / World View
// rendering a few seconds later, which reads as "they vanished."
// Republishing the CURRENT, UNCHANGED presence on this cadence keeps
// `sequence` advancing (see AvatarPresence.next()'s own header — a
// resend of the same sequence is rejected as stale/duplicate by
// core/PresenceIngestion.js, so this only works because
// AvatarPresenceSession.update() always bumps it) purely so every
// receiver's `receivedAt` keeps refreshing — nothing about the
// avatar's actual position, rotation, or animation changes.
const PRESENCE_HEARTBEAT_INTERVAL_MS = 2000;

// 0.2.29 — defaults for the two location-browser entry points.
// DEFAULT_EXPLORE_RADIUS matches the design doc's own example ("radius
// 25 of (100, 50, 250)") — a reasonable starting neighborhood to look
// around the camera without the caller having to pick a number first.
// NEARBY_RADIUS is deliberately much smaller: "What's Here?" reads as
// an exact-location query, but the camera's world position is
// continuous and essentially never lands exactly on a recorded
// PlacementRecord's position — not even immediately after Focus, whose
// orbit-style framing (SpatialCameraController) parks the camera a
// fixed offset away from the target, never on top of it. A small
// tolerance radius is what makes "What's here?" answerable at all from
// camera position; see exploreHere/whatsHere below.
const DEFAULT_EXPLORE_RADIUS = 25;
const NEARBY_RADIUS = 5;
// 0.2.43 — the default radius getNearbyAvatars() searches within when
// no radius is given. Deliberately its OWN constant, not a reuse of
// NEARBY_RADIUS above: that one answers "is a document essentially at
// this exact camera position" (0.2.29's tight tolerance for "What's
// Here?"); this one answers "who is close enough to plausibly
// interact with," a genuinely different, avatar-scaled question — a
// person walking at WALK_SPEED (core/AvatarMovementSimulation.js)
// covers this whole radius in well under ten seconds.
const DEFAULT_NEARBY_AVATAR_RADIUS = 15;
// 0.2.44 — how long a local GREET/WAVE/POINT gesture keeps playing
// before automatically returning to NONE — see
// _updateLocalAvatarInteractionPresentation() below. Deliberately
// short: a gesture is a momentary social beat, never a persistent
// state the user has to remember to turn off (there is no "stop
// waving" button, matching the design doc's own framing of these as
// transient events rather than a mode).
const GESTURE_DURATION_MS = 1800;
// 0.2.35 follow-up: a fresh AvatarPresence otherwise always spawns at
// literal world origin regardless of which document a session opens
// on — and a document's own placement (0.2.24's deterministic grid
// strategy) is essentially never near the origin, so the avatar would
// render far outside whatever the camera is actually looking at. A
// small, fixed diagonal offset from the first-focused document's own
// position — not exactly on top of it, to avoid spawning inside the
// document's own geometry — gives a sensible "you arrive where you're
// looking" default without pretending to know anything about that
// document's actual size/shape.
const AVATAR_SPAWN_OFFSET = { x: 3, y: 0, z: 3 };

// 0.2.94 — World View Location & Navigation. HOME_CAMERA_FRAMING is
// deliberately NOT a fresh invention: it is exactly
// renderer/CameraState.js's own DEFAULT_POSITION/DEFAULT_TARGET
// ((10,10,10) looking at the origin) — the framing every World View
// session already starts from before any focusDocument()/navigateToDocument()
// call ever runs. Reusing it (rather than picking a new "home" framing)
// is what makes goHome() actually mean "the world's conventional
// starting area" per the design conversation, instead of a third,
// independently-chosen camera pose nothing else in the codebase agrees
// with. LOCATION_FOCUS_OFFSET is the STRUCTURE-kind counterpart —
// reused from focusSelection()'s own placement-focus offset (see
// focusSelection() below), so focusing a location and focusing the
// current inspection selection land on the exact same framing for the
// exact same target. CAMERA_FOCUS_DURATION_MS is short on purpose: long
// enough to read as a deliberate glide rather than a jump-cut, short
// enough that repeated navigation (hopping through a Locations list)
// never feels sluggish.
const HOME_CAMERA_FRAMING = { position: { x: 10, y: 10, z: 10 }, target: { x: 0, y: 0, z: 0 } };
const LOCATION_FOCUS_OFFSET = { x: 12, y: 12, z: 12 };
const CAMERA_FOCUS_DURATION_MS = 900;

// 0.1.46: gizmo wiring. 0.1.47: precision + modifier plumbing + gesture
// feedback; keyboard transforms route through the gesture transaction.
// 0.1.48: alignSelection/distributeSelection. 0.1.49:
// applyNumericTransform. One gateway, one command type, byte-identical
// behavior to the Editor for the same selection.
//
// 0.1.50: the World View half of the consolidated editing surface —
// selectAll()/getSelectionCount() join the session API so the shared
// EditorActionRegistry can drive World View operations exactly as it
// drives the Editor. Group and clipboard surface (0.1.42/0.1.43)
// belongs wherever this session is extended in the deployed tree; the
// action layer degrades gracefully when those methods are absent.
export class WorldNavigationSession {
	constructor({
	    registry,
	    loadPublicationDocumentUseCase,
	    worldLayoutProvider,
	    saveDocumentUseCase = null,
	    publishDocumentUseCase = null,
	    replayDocumentUseCase = null,
	    restoreHistoryStateUseCase = null,
	    identityProvider = null,
	    documentCloneService = null,
	    copySelectionUseCase = null,
	    pasteClipboardUseCase = null,
	    // 0.4.9 — Alignment, Snapping & Repetition. Same optional
	    // posture as copySelectionUseCase/pasteClipboardUseCase above —
	    // a session built without one simply can't offer
	    // repeatSelection(); duplicateSelection() keeps working either
	    // way.
	    repeatSelectionUseCase = null,
    	discoveryProvider = null, // <-- Fixed: Added missing parameter
	    placementRegistry = null,
	    moveWorldPlacementUseCase = null,
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
	    // 0.2.93 — World View Instance Inspection. Both optional, the
	    // same "enforce/offer only when the collaborator is actually
	    // wired" posture every other optional collaborator in this
	    // constructor already follows: a session built without
	    // structureResolver simply never RENDERS a StructurePlacement at
	    // all (renderer/WorldRenderer.js's own 0.2.90 header — this was
	    // already true before this milestone; see
	    // application/CreateWorldViewUseCase.js for the real wiring), and
	    // one built without loadDocumentUseCase falls back to showing a
	    // placement's raw documentId instead of its title (see
	    // getSavedDocumentTitle() below) — never throws either way.
	    structureResolver = null,
	    loadDocumentUseCase = null,
	    // 0.2.95 — World Editing Authorization Foundation. Optional,
	    // the same "enforce/offer only when the collaborator is
	    // actually wired" posture every other optional collaborator in
	    // this constructor already follows: a session built without one
	    // (every pre-0.2.95 caller, and every existing test) treats
	    // every loaded document as editable, exactly the pre-0.2.95
	    // behavior — see canEditDocument()/canReadDocument() below. Real
	    // wiring wraps application/WorldAuthorizationService.js — see
	    // application/CreateWorldViewUseCase.js.
	    worldAuthorizationService = null,
	    // 0.2.97 — Shared World Ordering & Conflict Resolution. Closes
	    // the composition gap 0.2.96 explicitly left open (see
	    // application/WorldCommandPropagationUseCase.js's own header):
	    // "broadcastCommand()/onOperationApplied() are not yet threaded
	    // into WorldNavigationSession." Optional, the same
	    // "enforce/offer only when the collaborator is actually wired"
	    // posture worldAuthorizationService above already follows — a
	    // session built without one (every pre-0.2.97 caller, and every
	    // existing test) behaves exactly as before: purely local
	    // editing, nothing ever broadcast. When wired, every
	    // application/CommandHistory.js this session creates or
	    // replaces is registered with it — see _registerCommandHistory()
	    // below — so a FORWARD local mutation (execute(), never
	    // undo()/redo() — see application/WorldCommandPropagationUseCase.js#
	    // attachCommandHistory()'s own header) is broadcast to every
	    // authenticated peer with zero additional wiring at any of this
	    // file's many mutation call sites.
	    worldCommandPropagation = null,
	    // 0.2.98 — Shared World Membership & Collaborative Presence.
	    // Both OPTIONAL, the same "enforce/offer only when the
	    // collaborator is actually wired" posture worldAuthorizationService/
	    // worldCommandPropagation above already follow. `worldMembershipUseCase`
	    // (application/WorldMembershipUseCase.js) is what
	    // grantWorldEdit()/revokeWorldEdit()/listWorldMembers() below
	    // delegate to — a session built without one (every pre-0.2.98
	    // caller) simply has no membership model: canEditDocument() falls
	    // back to ownership alone, exactly the pre-0.2.98 behavior.
	    // `worldPresenceUseCase` (application/WorldPresenceUseCase.js) is
	    // what enterWorldPresence()/leaveWorldPresence()/
	    // getWorldPresenceRoster() below delegate to — a session built
	    // without one simply never advertises or observes presence at
	    // all.
	    worldMembershipUseCase = null,
	    worldPresenceUseCase = null,
	    // 0.3.0 — Collaborative Spatial Presence. OPTIONAL, the exact
	    // same "enforce/offer only when the collaborator is actually
	    // wired" posture worldPresenceUseCase above already follows — a
	    // session built without one (every pre-0.3.0 caller, and every
	    // existing test) simply never advertises or observes spatial
	    // presence at all; see enterWorldSpatialPresence()/
	    // syncWorldSpatialPresence()/leaveWorldSpatialPresence() below.
	    worldSpatialPresenceUseCase = null,
	    // 0.3.10 — World Persistence & Return Experience. OPTIONAL, the
	    // same "enforce/offer only when the collaborator is actually
	    // wired" posture every other optional collaborator in this
	    // constructor follows — a session built without one (every
	    // pre-0.3.10 caller, and every existing test) simply never
	    // remembers or restores a camera framing for any World. See
	    // application/LocalWorldExperienceStore.js and the "Local World
	    // Experience & Return" section below.
	    localWorldExperienceStore = null,
	    // 0.5.2 — Place Naming & Naming Claims. Both OPTIONAL, the same
	    // "enforce/offer only when the collaborator is actually wired"
	    // posture every other optional collaborator in this constructor
	    // already follows: a session built without one (every pre-0.5.2
	    // caller, and every existing test) simply can't publish/retract/
	    // read naming claims or local name preferences — see the "Place
	    // Naming & Naming Claims" section below, and
	    // application/CreateWorldPlaceNamingUseCase.js for the real
	    // wiring. Deliberately separate collaborators, never folded into
	    // one — a claim is signed, shared content; a preference is
	    // unsigned, local-only state, exactly the boundary core/
	    // PlaceNamingClaim.js and application/LocalNamePreferenceStore.js
	    // each document in their own header.
	    placeNamingClaimUseCase = null,
	    localNamePreferenceStore = null,
	    // 0.5.3 — Decentralized Place Name Exchange. The SAME optional-
	    // collaborator posture as the two above: a session built without
	    // one (every pre-0.5.3 caller, and every existing test) simply
	    // can't export/import a naming claim — see the "Decentralized
	    // Place Name Exchange" section below, and
	    // application/PlaceNamingClaimExchange.js's own header on why
	    // this is a genuinely separate concern from publishing/retracting
	    // one's own claim.
	    placeNamingClaimExchange = null
	}) {
	    this._registry = registry;
	    this._loadPublicationDocumentUseCase = loadPublicationDocumentUseCase;
	    this._worldLayoutProvider = worldLayoutProvider;
	    this._saveDocumentUseCase = saveDocumentUseCase;
	    this._publishDocumentUseCase = publishDocumentUseCase;
	    this._replayDocumentUseCase = replayDocumentUseCase;
	    this._restoreHistoryStateUseCase = restoreHistoryStateUseCase;
	    this._identityProvider = identityProvider;
	    this._documentCloneService = documentCloneService;
	    this._copySelectionUseCase = copySelectionUseCase;
	    this._pasteClipboardUseCase = pasteClipboardUseCase;
	    this._repeatSelectionUseCase = repeatSelectionUseCase;
	    // 0.2.23: WHERE a published world sits in shared space — a
	    // separate concern from the document/publication itself (see
	    // docs/Principles.md, "A Publication Is What; A Placement Is
	    // Where"). Both optional: a session built without them (most
	    // existing tests) simply can't resolve/move a placement,
	    // exactly the same "enforce/offer only when the collaborator is
	    // actually wired" pattern discoveryProvider already follows.
	    this._placementRegistry = placementRegistry;
	    this._moveWorldPlacementUseCase = moveWorldPlacementUseCase;
	    // 0.2.25: the policy applied to EXPLICIT, interactive placement
	    // (checkPlacementOverlap/movePlacement) — see
	    // core/SpatialAllocationPolicy.js. Automatic initial placement
	    // (PlacePublicationUseCase, via GridPlacementStrategy) is
	    // deliberately NOT routed through this — it always behaves as
	    // ALLOW, matching 0.2.23's "placement never blocks a publish."
	    this._spatialAllocationPolicy = spatialAllocationPolicy;
	    // 0.2.26: optional, same "enforce/offer only when the
	    // collaborator is actually wired" rule everything else in this
	    // constructor follows — a session built without it (most
	    // existing tests) simply can't search.
	    this._searchWorldUseCase = searchWorldUseCase;
	    // 0.2.30: OPTIONAL trust-capable discovery provider, consulted
	    // ONLY to obtain diagnostics for exploreLocation/exploreHere/
	    // whatsHere — never to resolve which documents/positions those
	    // methods return (that still goes through searchWorldByLocation,
	    // exactly as 0.2.28/0.2.29 established). Deliberately decoupled
	    // from document resolution: the live World View's placement data
	    // comes from LocalPlacementRegistry/LocalWorldLayoutProvider, and
	    // as of this milestone no live deployment has ever built a
	    // populated SpatialIndexRoot/Manifest for
	    // DecentralizedSpatialDiscoveryProvider to query — wiring it as
	    // the SOURCE of documents would silently return zero results
	    // everywhere. Wiring it as an diagnostics-only ADDITION means a
	    // replica that DOES have a real decentralized index populated
	    // can honestly report on it, while every other replica honestly
	    // reports "no trust layer available" instead of fabricating
	    // either a false "all clear" or a false "nothing found." See
	    // docs/Principles.md, "Diagnostics Are Received From The
	    // Discovery Layer, Never Invented By The UI (0.2.30)."
	    this._spatialDiscoveryProvider = spatialDiscoveryProvider;
	    // 0.2.35 — OPTIONAL, same "enforce/offer only when the
	    // collaborator is actually wired" rule as every other
	    // optional dependency in this constructor. Both null when
	    // nobody is logged in (see CreateWorldViewUseCase) — a session
	    // built without them simply renders no local avatar, exactly
	    // the graceful-absence posture spatialDiscoveryProvider already
	    // established.
	    this._avatarProfileUseCase = avatarProfileUseCase;
	    this._avatarPresenceSession = avatarPresenceSession;
	    this._avatarProfileSubscription = null;
	    this._avatarPresenceSubscription = null;
	    this._localAvatarVisible = true;
	    // 0.2.36 — Local Avatar Movement & Animation. See the "Local
	    // Avatar Movement" section below for the full picture;
	    // `_avatarMovementController` is only ever constructed once an
	    // avatar actually exists (same optional-collaborator posture as
	    // everything else avatar-related in this constructor).
	    this._avatarMovementController = null;
	    this._avatarFrameSubscription = null;
	    this._avatarControlModeActive = false;
	    this._followAvatarEnabled = false;
	    this._lastAvatarFollowPosition = null;
	    // 0.3.2 — Camera Perspective. `null` means "off" — the free/orbit
	    // camera this session has always had, completely unchanged. Purely
	    // LOCAL UI/navigation state, exactly like `_followAvatarEnabled`
	    // above: never persisted, never signed, never broadcast to any
	    // collaborator — see docs/Principles.md, "Camera Perspective Is
	    // Local Perception, Never Shared Reality (0.3.2)." See
	    // setCameraPerspective() below.
	    this._cameraPerspective = null;
	    // 0.2.37 — Decentralized Avatar Presence Synchronization.
	    // `presenceBroadcastProvider` and `avatarTemplateRegistry` are
	    // both OPTIONAL, same posture as everything else avatar-related
	    // above: a session built without a broadcast provider simply
	    // never publishes or receives presence at all; one built
	    // without a template registry can still receive presence but
	    // has no way to resolve what an unknown remote avatar should
	    // even look like, so it never creates a visual for one. See the
	    // "Remote Avatar Presence" section below for the full wiring.
	    this._presenceBroadcastProvider = presenceBroadcastProvider;
	    this._avatarTemplateRegistry = avatarTemplateRegistry;
	    // 0.2.40 — OPTIONAL, same posture as every other avatar-related
	    // collaborator here: a session built without one simply always
	    // advertises (see the publish gate in _setupLocalAvatar() below),
	    // exactly 0.2.37/0.2.38's own behavior, unchanged.
	    this._presenceVisibilityUseCase = presenceVisibilityUseCase;
	    // 0.2.58 — OPTIONAL, profile's OWN independent publish gate. See
	    // _publishLocalAvatarProfile() below: when this is wired, profile
	    // publishing consults ONLY this policy, never presenceVisibilityUseCase's
	    // — see docs/Principles.md, "Profile Gets Its Own Publication
	    // Gate, Superseding The Shared One." A session built WITHOUT one
	    // (every pre-0.2.58 caller, and any test that only wires
	    // presenceVisibilityUseCase) falls back to the exact 0.2.41
	    // shared-gate behavior unchanged — see _publishLocalAvatarProfile's
	    // own comment.
	    this._avatarProfileVisibilityUseCase = avatarProfileVisibilityUseCase;
	    // 0.2.58 — OPTIONAL zero-arg predicate: "do I currently have AT
	    // LEAST ONE real, mutual FriendshipState.FRIEND," re-consulted
	    // fresh on every publish attempt, never cached — the COARSE
	    // counterpart to the per-peer `isFriend` predicate
	    // presence/PeerAvatarPresenceBroadcastProvider.js#advertise()
	    // itself consults. Feeds PresenceVisibilityPolicy#shouldAdvertise()/
	    // AvatarProfileVisibilityPolicy#shouldAdvertise()'s own
	    // `{ hasFriend }` context via _hasFriendContext() below. Absent
	    // (null) is the exact pre-0.2.58 behavior: FRIENDS with an empty
	    // authorizedPeerIdentities still behaves like HIDDEN at this
	    // coarse gate, unchanged — see core/PresenceVisibilityPolicy.js's
	    // own shouldAdvertise() header.
	    this._hasFriend = hasFriend;
	    // 0.2.60 — OPTIONAL zero-arg-per-call predicate
	    // `(identityId) => boolean`, the RECEIVER-side counterpart to
	    // isFriend/hasFriend above: consulted in _setupRemoteAvatars()
	    // below to build each avatar-social protocol's trust boundary
	    // with blocking wired in, so a locally-blocked identity's
	    // presence/profile/interaction claims are rejected at ingestion
	    // regardless of how cryptographically valid they are — see
	    // application/PresenceTrustBoundary.js's own `isBlocked` header.
	    // The SENDER-side gate is a completely separate wiring, one
	    // layer further out — see application/CreateWorldViewUseCase.js,
	    // which passes the same predicate straight to each
	    // presence/PeerAvatarPresenceBroadcastProvider.js's own
	    // `isBlocked` instead. Absent (null) is the exact pre-0.2.60
	    // behavior: every trust boundary defaults to `isBlocked: () =>
	    // false`, nothing silently changes.
	    this._isBlocked = isBlocked;
	    this._presenceSyncService = null;
	    this._remoteAvatarRegistry = null;
	    this._presencePublishSubscription = null;
	    this._remoteAvatarFrameSubscription = null;
	    this._remoteAvatarsVisible = true;
	    // 0.2.41 — Remote Avatar Appearance Synchronization. OPTIONAL,
	    // same posture as presenceBroadcastProvider — a session built
	    // without one simply never publishes or receives PROFILE data
	    // (every remote avatar still renders, using the placeholder
	    // appearance exactly like 0.2.37 always did). See the "Remote
	    // Avatar Appearance" section below for the full wiring.
	    this._avatarProfileBroadcastProvider = avatarProfileBroadcastProvider;
	    this._avatarProfileSyncService = null;
	    this._remoteAvatarAppearanceRegistry = null;
	    // Reused by BOTH the profile-changed subscription (resets this
	    // on every explicit edit) and the periodic republish check in
	    // the avatar movement frame subscription — see
	    // _setupLocalAvatar() below. 0 means "never yet published,"
	    // which deliberately makes the very FIRST frame tick publish
	    // immediately — no separate bootstrap call needed.
	    this._lastProfilePublishAt = 0;
	    // 0.3.1 — reused by BOTH the onPresenceChanged subscription
	    // (refreshed on every accepted movement update) and the
	    // periodic heartbeat check in the avatar movement frame
	    // subscription — see PRESENCE_HEARTBEAT_INTERVAL_MS's own
	    // comment and _setupLocalAvatar() below. Same "0 means never
	    // yet published" bootstrap posture as `_lastProfilePublishAt`
	    // above.
	    this._lastPresenceUpdateAt = 0;
	    // 0.2.39 — World Entity Interaction & Selection. See the
	    // "Avatar Interaction" section below for the full picture.
	    // `_avatarInteraction` is deliberately its OWN state slice,
	    // never folded into `_spatialSelection` — see
	    // docs/Principles.md, "Avatars Are Never Document Selection."
	    // `_followedRemoteAvatarId` is the camera-follows-a-REMOTE-
	    // avatar counterpart to `_followAvatarEnabled` above (which
	    // only ever follows the LOCAL avatar) — the two are mutually
	    // exclusive (see setFollowAvatar/followAvatarId), because
	    // there is only one camera.
	    this._avatarInteraction = AvatarInteractionState.empty();
	    this._followedRemoteAvatarId = null;
	    this._lastFollowedRemotePosition = null;
	    // 0.2.44 — Local Avatar Interaction & Social Presence. Gates
	    // GREET/WAVE/POINT through ONE shared cooldown regardless of
	    // which gesture was last performed — see
	    // core/AvatarInteractionCooldown.js. 0 means "never yet
	    // performed," which — like `_lastProfilePublishAt` above —
	    // deliberately makes the very FIRST gesture always allowed.
	    this._lastInteractionPerformedAt = 0;
	    // 0.2.45 — Ephemeral Avatar Interaction Synchronization.
	    // OPTIONAL, same posture as every other broadcast-provider
	    // collaborator in this constructor: a session built without one
	    // simply never publishes or receives interaction EVENTS at all
	    // (a gesture still fully happens locally either way — see
	    // performAvatarInteraction below). `_localInteractionSequence`
	    // is this avatar's OWN, separate monotonic counter for
	    // interaction events specifically — never AvatarPresence's own
	    // `sequence` — see core/AvatarInteractionAdvertisement.js's own
	    // header for why. `_remoteAvatarGestureExpiry` is
	    // avatarId -> the timestamp a REMOTE avatar's currently-playing
	    // received gesture should be cleared, the receiving-side
	    // counterpart to `_avatarInteraction.interactionStartedAt` on
	    // this replica's own local gesture — see
	    // _applyRemoteAvatarInteraction/_expireRemoteAvatarGestures
	    // below.
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

	    // 0.2.93 — see the constructor's own comment above.
	    this._structureResolver = structureResolver;
	    this._loadDocumentUseCase = loadDocumentUseCase;

	    // 0.2.95 — see the constructor's own comment above.
	    this._worldAuthorizationService = worldAuthorizationService;

	    // 0.2.97 — see the constructor's own comment above.
	    // `_commandHistoryUnsubscribes` mirrors `_commandHistories`
	    // key-for-key: whenever a CommandHistory for a worldId is
	    // replaced or removed (fork, clone, historical restoration,
	    // unload — see _registerCommandHistory()/_unregisterCommandHistory()
	    // below), the OLD subscription is torn down first, so a stale
	    // CommandHistory instance never keeps broadcasting after this
	    // session has moved on from it.
	    this._worldCommandPropagation = worldCommandPropagation;
	    this._commandHistoryUnsubscribes = new Map();

	    // 0.2.98 — see the constructor's own comment above.
	    this._worldMembershipUseCase = worldMembershipUseCase;
	    this._worldPresenceUseCase = worldPresenceUseCase;
	    // Worlds this session has explicitly entered presence for — so
	    // dispose() can broadcast an honest LEAVE for each rather than
	    // relying solely on the eventual connection-drop pruning every
	    // OTHER replica's own WorldPresenceUseCase already performs.
	    this._presentWorldDocumentIds = new Set();

	    // 0.3.0 — see the constructor's own comment above.
	    this._worldSpatialPresenceUseCase = worldSpatialPresenceUseCase;
	    // Worlds this session has explicitly entered SPATIAL presence
	    // for — mirrors `_presentWorldDocumentIds` above, one rung
	    // further: dispose() broadcasts an honest LEAVE for each. A
	    // SEPARATE set from `_presentWorldDocumentIds` on purpose — a
	    // caller may enter coarse presence without ever syncing spatial
	    // presence (or vice versa); the two protocols never assume one
	    // implies the other.
	    this._presentSpatialWorldDocumentIds = new Set();
	    // documentId -> unsubscribe function for this session's own
	    // internal onSpatialPresenceChanged() listener — see
	    // enterWorldSpatialPresence()/leaveWorldSpatialPresence() below.
	    // This is what drives `this._session.setRemoteSpatialPresence()`
	    // automatically, the identical "application layer drives its own
	    // render facade" shape application/RemoteAvatarRegistry.js
	    // already established for avatars — WorldView.js never touches
	    // the renderer directly for this any more than it does for
	    // remote avatars.
	    this._spatialPresenceRenderSubscriptions = new Map();
	    // documentId -> Set(deviceId) currently rendered, so a device
	    // that drops out of a later roster snapshot can be explicitly
	    // removed from the scene rather than left as a stale marker.
	    this._spatialPresenceRenderedDevices = new Map();

	    // 0.3.10 — see the constructor's own comment above.
	    this._localWorldExperienceStore = localWorldExperienceStore;

	    // 0.5.2 — see the constructor's own comment above.
	    this._placeNamingClaimUseCase = placeNamingClaimUseCase;
	    this._localNamePreferenceStore = localNamePreferenceStore;
	    this._placeNamingClaimExchange = placeNamingClaimExchange;

	    this._container = null;
	    this._session = null;
        this._spatialCameraController = null;
        this._transformSettings = new TransformSettings();
        this._placementService = new SpatialPlacementService(registry);
        this._loadedDocuments = new Map();
        this._commandHistories = new Map();
        this._inspectionService = new SpatialInspectionService(this);
        this._editingService = new SpatialEditingService(
            this,
            this._commandHistories,
            this._registry,
            this._transformSettings,
            // 0.2.95 — the ONE seam every real mutation chokepoint in
            // SpatialEditingService now consults — see that class's own
            // constructor comment.
            (documentId) => this.canEditDocument(documentId)
        );
        this._gizmoUseCase = new TransformGizmoUseCase(this._editingService);
        this._failedLoads = new Map();
        this._spatialSelection = SpatialSelectionState.empty();
        this._spatialHover = SpatialHoverState.empty();
        this._spatialInspection = SpatialInspectionState.empty();
        this._spatialEditingContext = SpatialEditingContext.empty();
        this._spatialPlacement = SpatialPlacementState.empty();
        this._activeDefinitionId = null;
        // 0.2.87 — one shared PlacementValidator instance (stateless,
        // safe to reuse) rather than commitPlacement()'s own previous
        // habit of constructing a fresh one inline; the SAME instance
        // now also backs the hover-time `blocked` check in
        // _updatePlacementPreview(), so preview and commit can never
        // disagree about what counts as occupied. `_pendingPlacementRotation`
        // is this session's own placement-preview orientation — owned
        // here, not on SpatialPlacementState, because it must survive
        // across hover updates and brick switches within one placement
        // session; it resets only when placement mode is actually left
        // (setActiveDefinitionId(null)), never on every hover or brick
        // change — see rotatePlacementPreview() below.
        this._placementValidator = new PlacementValidator();
        this._pendingPlacementRotation = 0;
        // 0.2.27: two independent concepts that used to be one field —
        // see docs/Principles.md, "Camera Focus, Active Document, and
        // Selection Are Three Different Things."
        //   _focusedDocumentId — where the CAMERA is navigated to.
        //   _activeDocumentId  — which document receives document-level
        //                        actions and mutation fallbacks.
        // They usually change together (focusDocument() sets both, by
        // default) but are never assumed to be equal — every mutation
        // path in this file reads _activeDocumentId, never
        // _focusedDocumentId, so "where the camera happens to be
        // pointed" can never silently decide what gets edited.
        this._focusedDocumentId = null;
        this._activeDocumentId = null;
        this._eventBus = null;
	    this._discoveryProvider = discoveryProvider;

		this._pasteCount = 0;

        // 0.2.20: documentIds currently loaded straight from a
        // publication — immutable as far as this session is concerned,
        // exactly like PublishedWorldSession's canEdit:false, except
        // enforced here by intercepting mutation entry points rather
        // than by omitting them. A documentId leaves this set the
        // moment it is superseded by a fork (_forkForEdit) or created
        // fresh by forkDocument()/cloneDocument(). See
        // docs/Principles.md, "A published snapshot is never mutated
        // in place (0.2.20)".
        this._publishedDocumentIds = new Set();

        // 0.2.20 follow-up: a lazily-created fork is, by definition, a
        // document the discovery/layout providers have never heard of
        // (it has not been published). Two things break if that's not
        // accounted for:
        //   1. updateSpatialView()'s streaming unload only protects
        //      "dirty" documents; once a fork is saved (dirty clears)
        //      it silently vanishes from the view on the next camera
        //      move, because it can never appear in
        //      findVisibleDocuments()'s results again.
        //   2. worldLayoutProvider.getPosition(forkId) has nothing to
        //      look up and falls back to (0,0,0)/a wrong grid slot —
        //      fine for the bricks themselves (addWorld was called
        //      with the correct inherited position once, at fork
        //      time), but every *subsequent* position lookup (the
        //      transform gizmo's pivot, chiefly) recomputes from
        //      scratch and drifts away from where the bricks actually
        //      are, so the gizmo can no longer be grabbed.
        // _localOnlyDocumentIds pins a fork against streaming unload
        // unconditionally; _localPositions remembers the position it
        // inherited from its source so lookups stay correct even after
        // the document stops being "dirty".
        this._localOnlyDocumentIds = new Set();
        this._localPositions = new Map();

        // 0.2.21: set by _forkForEdit right before it returns, cleared
        // by the next consumeForkNotice() call. A drain, not an event
        // subscription — the UI already polls session state once per
        // interaction (refreshSpatialUI), so a flag it can check right
        // after a guarded call is simpler than wiring a new EventBus
        // topic for something that fires at most once per interaction.
        this._pendingForkNotice = null;

        // 0.2.94 — World View Location & Navigation. `_worldLocationDirectory`
        // is stateless and cheap to construct once, reused for every
        // getWorldLocations()/focusLocation() call — see
        // WorldLocationDirectory's own header for why it never needs
        // rebuilding. `_activeCameraFocus` is null whenever no
        // goHome()/focusLocation() animation is currently in flight;
        // otherwise `{ animator, startedAt }`, advanced once per render
        // frame by `_tickCameraFocus` (wired in start(), see below).
        this._worldLocationDirectory = new WorldLocationDirectory(this);
        this._activeCameraFocus = null;
        this._cameraFocusFrameSubscription = null;
    }

    get transformSettings() {
        return this._transformSettings;
    }

    // 0.2.97 — the ONE place a CommandHistory ever enters
    // `_commandHistories`. Every call site that used to write
    // `this._commandHistories.set(worldId, history)` directly now
    // calls this instead, so wiring a `worldCommandPropagation`
    // collaborator into the constructor makes EVERY existing mutation
    // pathway (placement, gesture commit, paste, fork, clone,
    // historical restoration, document-metadata touch) broadcast
    // automatically — none of those call sites themselves changed.
    // Replacing an existing history for the same worldId (fork/clone/
    // restoreHistoryAt all do this — a fresh CommandHistory instance
    // taking over the same live World) tears down the OLD subscription
    // first, exactly like every other "replace, don't leak" pattern in
    // this file.
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

    // The mirror of _registerCommandHistory() above — every existing
    // `this._commandHistories.delete(worldId)` call site now calls
    // this instead, so a CommandHistory this session no longer owns
    // (unloaded, superseded by a fork) stops broadcasting immediately
    // rather than leaking a subscription to a detached World.
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
        this._transformSettings = new TransformSettings();
        this._editingService = new SpatialEditingService(
            this,
            this._commandHistories,
            this._registry,
            this._transformSettings,
            // 0.2.95 — the ONE seam every real mutation chokepoint in
            // SpatialEditingService now consults — see that class's own
            // constructor comment.
            (documentId) => this.canEditDocument(documentId)
        );
        this._gizmoUseCase = new TransformGizmoUseCase(this._editingService);
        this._session = new RenderWorldViewUseCase().execute(
            container,
            this._registry,
            this._eventBus,
            // 0.2.93 — structureResolver threaded through so World View
            // actually RENDERS a StructurePlacement's content (and can
            // therefore pick/inspect it) — see this class's own
            // constructor comment and renderer/WorldRenderer.js's 0.2.90
            // header. Still gracefully absent (null) for any caller that
            // doesn't wire one, exactly as before this milestone.
            { gestureService: this._editingService, structureResolver: this._structureResolver }
        );
        this._spatialCameraController = new SpatialCameraController(this._session);
        this._inspectionService = new SpatialInspectionService(this);
        this._placementService = new SpatialPlacementService(this._registry);
        // Remote avatars first: _setupLocalAvatar()'s presence
        // subscription publishes THROUGH _presenceSyncService, so it
        // must already exist by the time that subscription is wired.
        this._setupRemoteAvatars();
        this._setupLocalAvatar();
        this._setupCameraFocusAnimation();
    }

    // 0.2.94 — advances any in-flight goHome()/focusLocation() animation
    // once per render frame, the same frame loop every other time-based
    // concern in this file already rides (avatar movement, presence
    // republish). Absent entirely when the render facade doesn't
    // support onAnimationFrame (a minimal test double) — a session
    // without frame ticking simply applies every camera focus
    // instantly, see _beginCameraFocus() below, the same
    // graceful-absence posture every other optional frame-driven
    // feature in this file already follows.
    _setupCameraFocusAnimation() {
        if (typeof this._session.onAnimationFrame !== 'function') {
            return;
        }
        this._cameraFocusFrameSubscription = this._session.onAnimationFrame(() => {
            this._tickCameraFocus(Date.now());
        });
    }

    // Applies `framing` to the camera right now, then either starts an
    // animated glide toward it (when this session can actually tick
    // frames) or — the graceful-absence case, e.g. a test session built
    // without start()/onAnimationFrame support — applies it instantly,
    // exactly like every pre-0.2.94 focus call already did. Either way
    // the FINAL framing is the same deterministic value for the same
    // target; only whether the camera visibly glides there differs.
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
    // Local Avatar (0.2.35)
    // -----------------------------------------------------------------
    //
    // Deliberately narrow: renders ONLY the current user's own avatar,
    // combining two independent, already-existing inputs it never
    // modifies — AvatarProfileUseCase.getEffectiveAvatar() (WHAT it
    // looks like) and AvatarPresenceSession.current (WHERE it is) —
    // see docs/Principles.md, "An Avatar's Location Comes From
    // Presence, Never From The Avatar Itself." Neither subscription
    // here ever writes back to the profile, the presence, a Document,
    // a WorldPlacement, or any discovery/publication provider — this
    // session's avatar wiring only ever calls the render facade.
    _setupLocalAvatar() {
        if (!this._avatarProfileUseCase || !this._avatarPresenceSession) {
            return;
        }
        const { template, appearance } = this._avatarProfileUseCase.getEffectiveAvatar();
        this._session.setLocalAvatar(template, appearance, this._avatarPresenceSession.current);
        this._session.setLocalAvatarVisible(this._localAvatarVisible);

        this._avatarProfileSubscription = this._avatarProfileUseCase.onProfileChanged((profile) => {
            const effective = this._avatarProfileUseCase.getEffectiveAvatar();
            this._session.updateLocalAvatarAppearance(effective.template, effective.appearance);
            // 0.2.41 — ADVERTISE: an explicit edit publishes
            // immediately, never waiting for the periodic republish
            // tick below.
            this._publishLocalAvatarProfile(profile, Date.now());
        });
        this._avatarPresenceSubscription = this._avatarPresenceSession.onPresenceChanged((presence) => {
            this._session.updateLocalAvatarPresence(presence);
            this._followAvatarIfEnabled(presence);
            // 0.2.37 — ADVERTISE: publish only when
            // AvatarPresenceSession actually accepted a new update
            // (the same event this subscription is already reacting
            // to) — an idle local avatar never reaches this line at
            // all, so it publishes nothing. See
            // docs/Principles.md, "No Movement, No Sequence
            // Advancement, No Network Traffic."
            //
            // 0.2.38 — signed whenever this session's identityProvider
            // is actually able to (see application/PresenceSigning.js);
            // falls back to an unsigned advertisement otherwise, which
            // is exactly what always happened before this milestone.
            // In real deployment `_identityProvider` and
            // `_avatarPresenceSession` are always wired together (see
            // CreateWorldViewUseCase — both come from being logged in),
            // so the local avatar's own presence is signed whenever it
            // exists at all.
            //
            // 0.2.40 — VISIBILITY: consulted here, BEFORE anything
            // reaches the transport, never as a receiver-side filter
            // and never by publishing an obscured/encrypted
            // advertisement anyway — see docs/Principles.md,
            // "Visibility Happens Before Broadcasting, Never After."
            // A session without a presenceVisibilityUseCase wired
            // always advertises, exactly 0.2.37/0.2.38's own behavior.
            const canAdvertise = this._presenceVisibilityUseCase
                ? this._presenceVisibilityUseCase.getPolicy().shouldAdvertise(this._hasFriendContext())
                : true;
            if (this._presenceSyncService && canAdvertise) {
                const advertisement = toAvatarPresenceAdvertisement(presence);
                this._presenceSyncService.publish(signAvatarPresenceAdvertisement(advertisement, this._identityProvider));
            }
            // 0.3.1 — refreshed on EVERY accepted presence update,
            // movement-driven or heartbeat-driven alike (this
            // subscription fires for both — see the heartbeat tick
            // below), so PRESENCE_HEARTBEAT_INTERVAL_MS only ever
            // measures genuine idle time since the last one, exactly
            // like `_lastProfilePublishAt`'s own bookkeeping.
            this._lastPresenceUpdateAt = Date.now();
        });

        // 0.2.36 — Local Avatar Movement. The controller owns raw key
        // state and the pure kinematics tick; this session only ever
        // decides WHEN it ticks (every render frame, via the same
        // frame loop AvatarVisual's gait clock already uses) and WHAT
        // key events reach it at all (only while Avatar Control Mode
        // is on — see avatarKeyDown/avatarKeyUp below). Absent entirely
        // when `_session` doesn't support onAnimationFrame (a minimal
        // test facade, e.g. Section C's spy) — movement simply never
        // ticks, exactly the same graceful-absence posture every other
        // optional collaborator in this file already follows.
        this._avatarMovementController = new AvatarMovementController(
            this._avatarPresenceSession,
            this._buildAvatarMovementConstraint(),
            this._buildAvatarTerrainConstraint(),
            this._buildAvatarStepConstraint()
        );
        this._lastAvatarFollowPosition = this._avatarPresenceSession.current.position;
        if (typeof this._session.onAnimationFrame === 'function') {
            this._avatarFrameSubscription = this._session.onAnimationFrame((deltaSeconds) => {
                this._avatarMovementController.tick(deltaSeconds);
                const now = Date.now();
                // 0.2.44 — expires a finished gesture and refreshes the
                // local avatar's facing override, both purely local,
                // purely presentation — see
                // _updateLocalAvatarInteractionPresentation()'s own
                // header.
                this._updateLocalAvatarInteractionPresentation(now);
                // 0.2.41 — periodic profile republish, rides the SAME
                // frame loop as movement — see
                // PROFILE_REPUBLISH_INTERVAL_MS's own comment for why
                // this exists at all (a fire-and-forget transport has
                // no "catch me up" mechanism; this is the ONLY thing
                // that lets a replica joining mid-session eventually
                // see current appearance without an explicit edit ever
                // happening).
                if (this._avatarProfileSyncService && now - this._lastProfilePublishAt >= PROFILE_REPUBLISH_INTERVAL_MS) {
                    this._publishLocalAvatarProfile(this._avatarProfileUseCase.getProfile(), now);
                }
                // 0.3.1 — periodic presence HEARTBEAT: republishes the
                // CURRENT, UNCHANGED presence once the local avatar has
                // been idle for PRESENCE_HEARTBEAT_INTERVAL_MS — see
                // that constant's own comment for why an idle-but-still-
                // present avatar otherwise ages into STALE/ABSENT on
                // every OTHER replica's receiving end. Movement's own
                // tick() above already published (and refreshed
                // `_lastPresenceUpdateAt`, via the onPresenceChanged
                // subscription both paths share) if anything actually
                // changed this frame, so this only ever fires while
                // genuinely idle — never a second publish for the same
                // movement. Routed through AvatarPresenceSession.update()
                // rather than a bespoke resend, so it advances `sequence`
                // exactly like a real movement would (a raw resend of
                // the same sequence is rejected as stale/duplicate — see
                // core/PresenceIngestion.js) and reaches every other
                // subscriber of onPresenceChanged identically.
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

    // 0.2.42 — builds the LOCAL avatar's movement constraint from
    // state this session already owns: `_loadedDocuments` (the exact
    // streaming set updateSpatialView() maintains — see
    // docs/Principles.md, "The Local Avatar Is Constrained By
    // Collision Geometry Currently Available To This Replica"),
    // `_getWorldPosition` (already the one source of truth for a
    // document's world offset, fork-local-override included), and
    // `_registry` (the BrickRegistry every other spatial use case here
    // already shares). No new constructor dependency on
    // WorldNavigationSession itself — collision is entirely DERIVED
    // from state that already exists for other reasons, never a
    // separately-wired collaborator. Always built, unconditionally:
    // an empty `_loadedDocuments` (nothing streamed in yet) simply
    // means the constraint finds no obstacles and never alters
    // movement — the exact same graceful-absence behavior as if no
    // constraint were wired at all.
    _buildAvatarMovementConstraint() {
        return new AvatarMovementConstraint({
            loadedDocuments: this._loadedDocuments,
            getWorldPosition: (documentId) => this._getWorldPosition(documentId),
            brickRegistry: this._registry,
            // 0.3.2 — the SAME DEFAULT_MAX_STEP_HEIGHT
            // _buildAvatarStepConstraint() below builds its own
            // constraint with: a single shared constant, so a brick
            // this class excludes from horizontal collision as
            // "climbable" and the brick AvatarStepConstraint actually
            // climbs are always talking about the exact same height
            // threshold, never two constants that could quietly drift
            // apart.
            maxStepHeight: DEFAULT_MAX_STEP_HEIGHT
        });
    }

    // 0.2.77 — builds the LOCAL avatar's terrain-slope constraint.
    // Unlike _buildAvatarMovementConstraint() above, this needs no
    // state from this session at all: terrain is a pure function of
    // (seed, x, z), always computable for any coordinate regardless of
    // which documents happen to be streamed in nearby, so there is no
    // "currently available to this replica" concept to wire up here —
    // see application/AvatarTerrainConstraint.js's own header.
    // AvatarTerrainConstraint's own constructor defaults (the same
    // shared DEFAULT_WORLD_SEED every other terrain query point in
    // this codebase reads, and a fixed default walkable-slope limit)
    // are exactly what a real session wants, so nothing is passed
    // here — always built, unconditionally, the same posture
    // _buildAvatarMovementConstraint() already established.
    _buildAvatarTerrainConstraint() {
        return new AvatarTerrainConstraint();
    }

    // 0.3.2 — builds the LOCAL avatar's Step-Up Movement constraint,
    // from exactly the same already-owned state
    // _buildAvatarMovementConstraint() above reads (`_loadedDocuments`,
    // `_getWorldPosition`, `_registry`) — collision and step-up are
    // both entirely DERIVED from the same streamed-in geometry, never
    // a second, separately-tracked obstacle set. Always built,
    // unconditionally, same posture as both constraints above: an
    // empty `_loadedDocuments` simply means no brick ever offers a
    // step, and terrain alone (a pure function of seed/x/z) decides
    // support height — the exact same graceful-absence behavior as if
    // this constraint were never wired at all.
    _buildAvatarStepConstraint() {
        return new AvatarStepConstraint({
            loadedDocuments: this._loadedDocuments,
            getWorldPosition: (documentId) => this._getWorldPosition(documentId),
            brickRegistry: this._registry
        });
    }

    // -----------------------------------------------------------------
    // Remote Avatar Presence (0.2.37)
    // -----------------------------------------------------------------
    //
    // Deliberately independent of hasLocalAvatar(): a logged-out
    // viewer can still SEE other participants' avatars even though
    // they have none of their own to publish — see
    // docs/Principles.md, "Watching Presence Never Requires Having
    // One." Wires the ADVERTISE/PULL round trip the design doc calls
    // for: PresenceSyncService owns the transport + ingestion
    // boundary (application/LocalPresenceStore.js's sequence-based
    // acceptance), RemoteAvatarRegistry owns reconciling which avatars
    // exist and their visual interpolation — this method only ever
    // decides WHEN pull()/sync()/tick() run (once per render frame,
    // the same frame loop every other time-based avatar concern in
    // this file already uses) and never touches the render facade
    // directly itself.
    _setupRemoteAvatars() {
        if (!this._presenceBroadcastProvider) {
            return;
        }
        const localAvatarId = this._avatarPresenceSession ? this._avatarPresenceSession.current.avatarId : null;
        // 0.2.60 — every trust boundary below is built with the SAME
        // `isBlocked` predicate (defaulting to `() => false` when this
        // session wasn't given one), each its OWN instance, never
        // shared — the same "presence-authority, profile-authority, and
        // interaction-authority stay independently established" posture
        // application/AvatarProfileTrustBoundary.js's own header already
        // documents, extended here to blocking.
        const isBlocked = this._isBlocked || (() => false);
        this._presenceSyncService = new PresenceSyncService(this._presenceBroadcastProvider, {
            localAvatarId,
            store: new LocalPresenceStore({ trustBoundary: new PresenceTrustBoundary({ isBlocked }) })
        });

        // A remote avatar's APPEARANCE is not synchronized at all in
        // 0.2.37 (see the design doc's own scope list) — every remote
        // avatar renders with the same fixed, resolved-once
        // placeholder template+appearance. Resolved here (application
        // layer), never inside the renderer — see docs/Principles.md,
        // "A Template Is A Closed Vocabulary, Not An Asset Loader."
        // Absent entirely when no registry was wired: remote presence
        // is still tracked and synced, it just never produces a
        // visual, the same graceful-absence posture every optional
        // collaborator in this file already follows.
        let defaultTemplate = null;
        let defaultAppearance = null;
        if (this._avatarTemplateRegistry) {
            defaultTemplate = this._avatarTemplateRegistry.get(DEFAULT_AVATAR_TEMPLATE_ID);
            defaultAppearance = defaultTemplate ? defaultTemplate.defaultAppearance : null;
        }

        // 0.2.41 — OPTIONAL: a session without a profile broadcast
        // provider still renders every remote avatar exactly as 0.2.37
        // always did (the same fixed placeholder), it just never
        // upgrades to anyone's real appearance. See docs/Principles.md,
        // "Appearance And Position Are Different Lifecycles, Never One
        // Message."
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

        // 0.2.45 — OPTIONAL: a session without an interaction broadcast
        // provider still renders every remote avatar exactly as before,
        // it just never plays a received GREET/WAVE/POINT for anyone.
        // See docs/Principles.md, "Presence Describes An Avatar's
        // Current State; Interaction Describes An Event That Happened."
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
                // 0.2.41 — profile inbox is drained FIRST, before
                // presence sync creates any brand-new avatar visual.
                // Presence and profile are two independent, racing
                // transports (see core/AvatarProfileAdvertisement.js's
                // own header) — a profile that already arrived this
                // frame must be sitting in LocalAvatarProfileStore
                // BEFORE RemoteAvatarRegistry.sync() below ever
                // consults the appearanceResolver for a stranger it's
                // seeing for the first time, or that first visual
                // wastefully renders the placeholder even though the
                // real appearance was already known. pull() itself is
                // cheap (an empty inbox almost every frame — profile
                // updates are rare).
                if (this._avatarProfileSyncService) {
                    this._avatarProfileSyncService.pull();
                }
                const knownPresences = this._presenceSyncService.pull(now);
                this._remoteAvatarRegistry.sync(knownPresences, now);
                this._remoteAvatarRegistry.tick(now);
                // 0.2.39 — both read the SAME knownPresences/registry
                // this frame already computed; neither adds a query.
                this._pruneAvatarInteractionIfGone(knownPresences);
                this._followRemoteAvatarIfEnabled(now);
                // 0.2.41 — now that sync() above has settled which
                // avatarIds exist, apply any profileRevision that
                // changed for an avatar that ALREADY had a visual
                // (sync() above already handled a brand-new one).
                if (this._avatarProfileSyncService) {
                    this._remoteAvatarAppearanceRegistry.sync(this._remoteAvatarRegistry.knownAvatarIds());
                }
                // 0.2.45 — drains any newly-accepted interaction EVENTS
                // and plays each one on its sender's own remote avatar
                // visual, then expires whichever received gestures have
                // finished playing. See _applyRemoteAvatarInteraction/
                // _expireRemoteAvatarGestures below for why this is
                // never a "known list" the way presence/profile pull()
                // returns — an interaction event is rendered once and
                // then genuinely forgotten.
                if (this._avatarInteractionSyncService) {
                    for (const event of this._avatarInteractionSyncService.pull()) {
                        this._applyRemoteAvatarInteraction(event, now);
                    }
                }
                this._expireRemoteAvatarGestures(now);
            });
        }
    }

    // 0.2.45 — plays ONE accepted interaction event on the SENDER's own
    // remote avatar visual — "Remote interaction event -> RemoteAvatarVisual,"
    // per the design doc's own pipeline. Deliberately keyed by
    // `event.avatarId` (who PERFORMED the gesture), never
    // `event.targetAvatarId`: the gesture is presentation on the
    // sender's own body, exactly like the LOCAL half 0.2.44 already
    // established (a wave is rendered on Bob, not teleported onto
    // Alice) — see core/AvatarInteractionAdvertisement.js's own header
    // for why `targetAvatarId` is a claim, never an instruction. A
    // no-op if the sender isn't currently a known (presence-driven)
    // remote avatar, or the render facade doesn't support gestures —
    // the same graceful-absence posture every other optional avatar
    // surface in this file already follows.
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

    // 0.2.45 — the receiving-side counterpart to
    // _updateLocalAvatarInteractionPresentation()'s own local-gesture
    // expiry: once a received gesture's short lifetime elapses, clears
    // it back to no-gesture, with no explicit "stop" message from the
    // sender ever required or expected — see docs/Principles.md,
    // "Interaction Is Rendered, Never Retained." Reuses the SAME
    // GESTURE_DURATION_MS a local gesture plays for, so a sender's own
    // avatar and everyone watching it see the gesture for the same
    // visual duration.
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

    // 0.2.38 — the unobtrusive World View diagnostic surface the
    // design doc asked for: trusted/stale/conflicting/unavailable
    // counts over exactly the same known-presences list
    // getKnownRemoteAvatarCount() already summarizes as one number.
    // Reads from PresenceSyncService.listKnownPresences() (never
    // pull()) so calling this from the UI has no side effects and
    // never drains the inbox out from under the real per-frame
    // pull()/sync()/tick() loop above.
    getRemoteAvatarDiagnostics() {
        if (!this._presenceSyncService) {
            return summarizePresenceDiagnostics([]);
        }
        return summarizePresenceDiagnostics(this._presenceSyncService.listKnownPresences(Date.now()));
    }

    // 0.2.43 — "who is near me?" as a derived, local, geometric fact —
    // see docs/Principles.md, "Proximity Is Derived, Never Announced."
    // Reads from PresenceSyncService.listKnownPresences() (never
    // pull()), the EXACT SAME trusted remote-presence list that
    // already drives rendering (RemoteAvatarRegistry.sync()) and the
    // diagnostics summary above — proximity is a new VIEW over
    // already-trusted state, never a second, independently-verified
    // copy of it. Requires a local avatar (there is no "near ME"
    // without a me); returns [] gracefully otherwise, the same
    // graceful-absence posture every other optional avatar surface in
    // this file already follows.
    getNearbyAvatars(radius = DEFAULT_NEARBY_AVATAR_RADIUS) {
        if (!this._avatarPresenceSession || !this._presenceSyncService) {
            return [];
        }
        const localPosition = this._avatarPresenceSession.current.position;
        const knownPresences = this._presenceSyncService.listKnownPresences(Date.now());
        return computeNearbyAvatars({ localPosition, knownPresences, radius });
    }

    // 0.2.43 — the one, shared place a friendly name is resolved for
    // ANY avatarId, local or remote — used by getNearbyAvatars()
    // consumers (the "Nearby Avatars" panel doesn't want to show raw
    // avatarIds) and by _inspectRemoteAvatar() below, replacing what
    // used to be a hard "never distributed" fallback to ownerIdentity.
    // That was true when 0.2.39 wrote it; it stopped being true the
    // moment 0.2.41 started distributing AvatarProfile.displayName
    // over its own channel — this is that catch-up. Degrades in the
    // same order either way: real displayName, then ownerIdentity,
    // then the avatarId itself, then (local avatar only) "You" — never
    // throws, never returns an empty string.
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

    // 0.2.43 — targets `avatarId` as the avatar interaction target
    // WITHOUT a screen-space pick: the "Nearby Avatars" panel's own
    // row click needs exactly the outcome pick()'s avatar branch
    // already produces (see docs/Principles.md, "Avatars Are Never
    // Document Selection" — clears any brick/ground selection the same
    // way), just triggered from a UI list entry instead of a raycast.
    // Validates `avatarId` is actually KNOWN first (the local avatar,
    // or a remote one whose presence hasn't expired) — unlike pick(),
    // which can trust a raycast hit because it only ever hits a
    // currently-rendered avatar, a UI-supplied id could be stale.
    // Returns the new AvatarInteractionState on success, null
    // (no-op) otherwise — the same "not currently known" contract
    // followAvatarId() already established.
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

    // 0.2.44 — GREET/WAVE/POINT: a LOCAL, presentation-only gesture
    // the user chooses to perform at the CURRENT avatar interaction
    // target. See docs/Principles.md, "Observation Does Not Imply
    // Authority, And Interaction Does Not Imply Control": this never
    // touches AvatarPresence and never reaches the transport (see the
    // design doc's own scope — no wire format change in 0.2.44). It
    // only ever changes THIS replica's own local AvatarInteractionState,
    // which _updateLocalAvatarInteractionPresentation() below then
    // renders as a temporary pose overlay on Bob's OWN avatar — never
    // Alice's; Alice's replica never even hears about it.
    //
    // Requires a REMOTE target: gesturing with nothing targeted, or at
    // yourself, is a no-op, the same "not currently a valid target"
    // posture followAvatarId() already has. Rate-limited by
    // core/AvatarInteractionCooldown.js so holding a button (or a
    // scripted spam) can never restart the gesture faster than the
    // shared cooldown allows. Returns true when the gesture was
    // actually accepted, false otherwise (no target, invalid kind, or
    // still on cooldown) — the same boolean-outcome contract
    // followAvatarId() already established.
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
        // 0.2.45 — ADVERTISE: see _publishAvatarInteraction's own header.
        // Never changes this method's return contract — a gesture that
        // fails to publish (no sync service wired, no local avatar
        // identity, or visibility policy says HIDDEN) still fully
        // happened LOCALLY, exactly 0.2.44's own behavior.
        this._publishAvatarInteraction(kind, targetAvatarId, now);
        return true;
    }

    // 0.2.45 — the ONE place a performed gesture is signed and handed
    // to its own transport, mirroring _publishLocalAvatarProfile's role
    // one layer over. Reuses the EXACT same visibility gate presence/
    // profile publishing already share — see docs/Principles.md,
    // "Presence And Profile Share One Publication Gate," extended here
    // to interactions too: HIDDEN/empty-FRIENDS means a gesture never
    // reaches the transport either, one single policy. A single
    // fire-and-forget publish, deliberately never a periodic republish
    // the way profile gets one — see
    // application/AvatarInteractionSyncService.js's own header for why
    // a missed gesture is not something a later-joining replica should
    // ever catch up on.
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

    // 0.2.41 — the ONE place a local profile advertisement is signed
    // and handed to the transport, called from two sites: an explicit
    // profile edit (immediate) and the periodic republish tick in
    // _setupLocalAvatar() above (eventual, for a replica that joins
    // mid-session).
    //
    // 0.2.58 — SUPERSEDES 0.2.41's "Presence And Profile Share One
    // Publication Gate": profile now gates on its OWN
    // avatarProfileVisibilityUseCase when one is wired, completely
    // independent of presenceVisibilityUseCase — see docs/Principles.md,
    // "Profile Gets Its Own Publication Gate, Superseding The Shared
    // One." `Presence: HIDDEN, Profile: PUBLIC` and `Presence: PUBLIC,
    // Profile: HIDDEN` are now both real, independently-representable
    // configurations, exactly as core/AvatarProfileVisibilityPolicy.js's
    // own header always intended once a real profile-visibility
    // configuration surface existed. A session that does NOT wire
    // avatarProfileVisibilityUseCase (any pre-0.2.58 caller) falls back
    // to the EXACT 0.2.41 shared-gate behavior, unchanged — this is a
    // purely ADDITIVE change, never a breaking one.
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

    // 0.2.58 — the one place `_hasFriend` (see the constructor's own
    // comment) is actually consulted and turned into the `{ hasFriend }`
    // context both PresenceVisibilityPolicy#shouldAdvertise() and
    // AvatarProfileVisibilityPolicy#shouldAdvertise() accept. Called
    // fresh every time, never cached, exactly like every other
    // visibility decision in this file.
    _hasFriendContext() {
        return { hasFriend: this._hasFriend ? Boolean(this._hasFriend()) : false };
    }

    // Shifts the camera by exactly the avatar's own movement delta —
    // see docs/Principles.md, "Following The Avatar Never Redefines
    // What The Camera Is Looking At (0.2.36)." Deliberately calls
    // ONLY moveCamera() (position AND target shifted together,
    // preserving whatever orbit offset the user last set) — never
    // focusDocument()/setActiveDocument(), so following the avatar can
    // never change `_focusedDocumentId`/`_activeDocumentId` or fork
    // anything. Runs regardless of whether follow is enabled (so the
    // tracked position never goes stale) but only ever MOVES the
    // camera when it is.
    _followAvatarIfEnabled(presence) {
        const previous = this._lastAvatarFollowPosition;
        this._lastAvatarFollowPosition = presence.position;
        // 0.3.2 — a selected Camera Perspective takes over camera
        // placement on every presence update, superseding the plain
        // delta-preserving follow below: a perspective's whole point is
        // a FIXED offset relative to the avatar (eye height, behind-
        // and-above, straight overhead), never "whatever offset the
        // user happened to leave the orbit camera at." See
        // core/CameraPerspective.js and docs/Principles.md, "Camera
        // Perspective Determines An Offset; It Never Replaces The
        // Camera Machinery (0.3.2)." Runs regardless of
        // `_followAvatarEnabled` — selecting a perspective IS a
        // stronger, always-on form of following your own avatar.
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

    // Applies `perspective`'s deterministic offset around `position`/
    // `headingDegrees` directly (never through _beginCameraFocus()'s
    // glide-once animator — that machinery is for a discrete, one-shot
    // user action like clicking a Locations-panel entry; a perspective
    // re-frames every single presence update, so applying it instantly
    // each tick already IS continuous, smooth tracking, exactly like
    // moveCamera() above already is for plain Follow Avatar).
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

    // Turning the mode OFF immediately releases every held key —
    // exiting must return keyboard control to the rest of World View
    // at once, never leave a key "stuck" because its keyup never
    // arrived (e.g. focus moved to a dialog mid-press).
    setAvatarControlMode(active) {
        this._avatarControlModeActive = Boolean(active);
        if (!this._avatarControlModeActive && this._avatarMovementController) {
            this._avatarMovementController.releaseAll();
        }
    }

    // 0.3.2 — Avatar Control Mode is persistent LOCAL INTERACTION STATE,
    // never a transient gesture: once the user explicitly turns it on
    // it stays on until they explicitly turn it off again — see
    // docs/Principles.md, "User-Controlled Avatar Mode Is Persistent
    // Local Interaction State (0.3.2)." This method exists precisely so
    // a caller with a legitimate reason to release held keys (a window
    // blur swallowing a keyup — see ui/views/WorldView.js's own
    // onWindowBlur) never has to reach for setAvatarControlMode(false)
    // to do it: that would silently uncheck the mode itself, which is a
    // hidden state transition the user never asked for. Releasing keys
    // and disabling the mode are two different things — this is the
    // one that only ever does the first.
    releaseAvatarMovementKeys() {
        if (this._avatarMovementController) {
            this._avatarMovementController.releaseAll();
        }
    }

    // Returns true if `key` was one the movement controller
    // understands (so the UI knows whether to preventDefault/swallow
    // the event) — false when control mode is off, no avatar exists,
    // or the key is unrelated to movement, in every case leaving the
    // key free for whatever else would normally handle it.
    avatarKeyDown(key) {
        if (!this._avatarControlModeActive || !this._avatarMovementController) {
            return false;
        }
        return this._avatarMovementController.keyDown(key);
    }

    avatarKeyUp(key) {
        if (!this._avatarMovementController) {
            return false;
        }
        // Always forwarded, even if control mode was switched off
        // between this key's down and up — so a key held before the
        // mode was toggled off still cleanly releases instead of
        // leaving stale state inside the controller (releaseAll()
        // already covers the same case on the toggle itself; this
        // covers the ordinary "released after mode already off" case).
        return this._avatarMovementController.keyUp(key);
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
            // 0.2.39 — there is only one camera; following your OWN
            // avatar and following a REMOTE one are mutually
            // exclusive. See followAvatarId() below.
            this._stopFollowingRemoteAvatarInternal();
        }
    }

    // 0.3.2 — the CURRENT Camera Perspective, or `null` while the
    // camera is free/orbit (every pre-0.3.2 World View behavior,
    // completely unchanged). Purely local UI/navigation state — see
    // this._cameraPerspective's own constructor comment.
    getCameraPerspective() {
        return this._cameraPerspective;
    }

    // Sets the active Camera Perspective (one of core/CameraPerspective.js's
    // CameraPerspective values), or clears it back to the free/orbit
    // camera with `null`. Rejects anything else (returns false,
    // changes nothing) rather than silently accepting an unrecognized
    // value — the same "degrade gracefully, never corrupt state" rule
    // every other setter in this file already follows.
    //
    // Turning a perspective ON immediately re-frames toward the local
    // avatar's CURRENT position/facing, right now — never waits for
    // the next movement tick, so choosing "Bird's-Eye" while standing
    // still still actually moves the camera. Turning a perspective OFF
    // (`null`) deliberately does NOT snap the camera anywhere: the
    // free/orbit camera simply resumes from wherever the perspective
    // last left it, the same "removing an unintended reset is the fix,
    // never inventing a second one" discipline this milestone's own
    // avatar-control-mode fix applies. Never touches `_followAvatarEnabled`
    // — the two are independent, but only one can ever actually be
    // steering the camera at once (see _followAvatarIfEnabled: a set
    // perspective always wins).
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

    // 0.2.39 — the camera-follows-a-REMOTE-avatar counterpart to
    // setFollowAvatar/isFollowingAvatar above. Deliberately a
    // SEPARATE surface, not a generalized "follow any avatarId"
    // replacement for the existing boolean API — see
    // docs/Principles.md, "Following The Avatar Never Redefines What
    // The Camera Is Looking At": both follow relationships share that
    // same principle (moveCamera() only, never focusDocument()/
    // setActiveDocument()), but 0.2.36's local-avatar-follow keeps its
    // own tested boolean contract completely unchanged.
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

    // 0.2.39 — the moment a targeted avatar's presence actually
    // expires (ABSENT-pruned from LocalPresenceStore — see
    // application/RemoteAvatarRegistry.js's own sync()), the
    // interaction target and any active follow relationship both
    // gracefully clear, rather than pointing at an avatar that no
    // longer exists. `knownPresences` is exactly what this frame's
    // pull()/sync() already computed — no extra query.
    _pruneAvatarInteractionIfGone(knownPresences) {
        if (this._avatarInteraction.isEmpty || this.isLocalAvatarId(this._avatarInteraction.avatarId)) {
            return;
        }
        const stillKnown = knownPresences.some((k) => k.advertisement.avatarId === this._avatarInteraction.avatarId);
        if (!stillKnown) {
            this._setAvatarInteraction(AvatarInteractionState.empty());
        }
    }

    // 0.2.44 — runs every render frame, right after movement ticks:
    // expires a finished gesture back to NONE, then pushes the
    // current gesture kind AND facing override to the render facade.
    // Both purely local, purely presentation — see this file's own
    // avatar-interaction comments above, core/AvatarGesturePoseOffsets.js,
    // and core/AvatarFacing.js. Reads `_avatarInteraction`/
    // `_remoteAvatarRegistry`, both already current from this or the
    // previous frame — no new query added.
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

    // 0.2.44 — see docs/Principles.md, "Facing A Target Is
    // Presentation, Never Presence": computes (or clears) a temporary
    // yaw override that makes the local avatar face its current
    // interaction target, but ONLY while the player isn't actively
    // steering — an actively-moving player's own input always wins,
    // so this never fights AvatarMovementController's own rotation.
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

    // Repositions a still-untouched (sequence 0, i.e. never explicitly
    // moved) local avatar to spawn near wherever the camera is about
    // to focus, instead of leaving it at literal world origin — see
    // AVATAR_SPAWN_OFFSET above and docs/Principles.md. Deliberately
    // gated on sequence === 0: this only ever fires once per session,
    // on whichever focusDocument() call happens first (in practice
    // the initial navigateToDocument() on World View mount). Once the
    // avatar has moved even once — by this spawn repositioning itself,
    // or later by real movement (0.2.36) — every subsequent
    // focusDocument() call (searching, Explore Here, Nearby Worlds)
    // leaves it exactly where it is; navigating the CAMERA elsewhere
    // must never silently teleport a participant.
    _spawnAvatarNear(position) {
        if (!this._avatarPresenceSession || this._avatarPresenceSession.current.sequence !== 0) {
            return;
        }
        this._avatarPresenceSession.update({
            position: {
                x: position.x + AVATAR_SPAWN_OFFSET.x,
                y: position.y + AVATAR_SPAWN_OFFSET.y,
                z: position.z + AVATAR_SPAWN_OFFSET.z
            }
        });
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
    // Placement Mode
    // -----------------------------------------------------------------

    setActiveDefinitionId(definitionId) {
        this._activeDefinitionId = definitionId;
        if (!definitionId) {
            this._spatialPlacement = SpatialPlacementState.empty();
            // 0.2.87 — leaving placement mode resets the pending
            // orientation; switching bricks WHILE still placing does
            // not (this method is only reached with a null definitionId
            // when placement mode actually ends — see cancelPlacement()
            // and commitPlacement()'s own use of setActiveDefinitionId
            // is never called on a successful commit, only via explicit
            // cancellation).
            this._pendingPlacementRotation = 0;
            this._session.hidePreview();
        }
        this._refreshGizmo();
    }

    getActiveDefinitionId() {
        return this._activeDefinitionId;
    }

    isPlacementMode() {
        return this._activeDefinitionId !== null;
    }

    // 0.2.87 — rotates the PENDING placement preview by `delta` degrees
    // (default +90, matching PlaceBrickCommand/RotateBrickCommand's own
    // convention of un-normalized accumulation — see this file's own
    // header note above _pendingPlacementRotation). Acts on whatever the
    // most recent hover already resolved (this._spatialPlacement),
    // exactly like PlacementTool's own onKeyDown() in the Editor: no
    // re-picking, no CommandHistory entry — rotating before you've
    // placed anything is Editor/session state, never a domain mutation.
    // Returns false (a no-op) when there's nothing currently being
    // hovered to rotate, so callers can skip a redundant UI refresh.
    rotatePlacementPreview(delta = 90) {
        if (!this._activeDefinitionId || !this._spatialPlacement || !this._spatialPlacement.valid) {
            return false;
        }
        this._pendingPlacementRotation += delta;
        this._spatialPlacement = new SpatialPlacementState({
            valid: this._spatialPlacement.valid,
            definitionId: this._spatialPlacement.definitionId,
            position: this._spatialPlacement.position,
            rotation: this._pendingPlacementRotation,
            blocked: this._spatialPlacement.blocked,
            targetDocumentId: this._spatialPlacement.targetDocumentId,
            targetBuildingId: this._spatialPlacement.targetBuildingId
        });
        this._presentPlacementPreview();
        return true;
    }

    isGestureActive() {
        return this._editingService ? this._editingService.transformGizmoState.active : false;
    }

    getSpatialPlacement() {
        return this._spatialPlacement;
    }

    commitPlacement() {
        if (!this._spatialPlacement || !this._spatialPlacement.valid) {
            return false;
        }
        const placement = this._spatialPlacement;
        let targetDocumentId = placement.targetDocumentId || this._activeDocumentId;
        let targetBuildingId = placement.targetBuildingId || null;
        // 0.2.20: placing a brick is a mutation — fork first if the
        // target is still a published, unforked snapshot. The target
        // building (if any was resolved before the fork) is remapped
        // positionally, same as a selection would be.
        if (this._publishedDocumentIds.has(targetDocumentId)) {
            const sourceDoc = this._loadedDocuments.get(targetDocumentId);
            const buildingIndex = (targetBuildingId && sourceDoc)
                ? sourceDoc.world.getBuildings().findIndex((b) => b.id === targetBuildingId)
                : -1;
            targetDocumentId = this._ensureEditableDocumentId(targetDocumentId);
            const forkedDoc = this._loadedDocuments.get(targetDocumentId);
            targetBuildingId = (buildingIndex !== -1 && forkedDoc)
                ? (forkedDoc.world.getBuildings()[buildingIndex]?.id || null)
                : null;
        }
        const document = this._loadedDocuments.get(targetDocumentId);
        if (!document) {
            return false;
        }
        const world = document.world;
        const buildings = world.getBuildings();
        if (buildings.length === 0) {
            return false;
        }
        const buildingId = targetBuildingId || buildings[0].id;
        if (!this._placementValidator.canPlace(world, buildingId, placement.position)) {
            return false;
        }
        const command = new PlaceBrickCommand({
            worldId: world.id,
            buildingId,
            definitionId: placement.definitionId,
            position: placement.position,
            rotation: placement.rotation
        });
        let history = this._commandHistories.get(world.id);
        if (!history) {
            history = new CommandHistory({ world });
            this._registerCommandHistory(world.id, history);
        }
        history.execute(command);
        this._spatialPlacement = SpatialPlacementState.empty();
        return true;
    }

    cancelPlacement() {
        this.setActiveDefinitionId(null);
    }

    // -----------------------------------------------------------------
    // Gizmo interaction (0.1.46; modifiers + feedback in 0.1.47)
    // -----------------------------------------------------------------

    gizmoPointerDown(rawEvent) {
        if (!this._session || rawEvent.button !== 0) {
            return false;
        }
        if (this.isPlacementMode() || this._spatialSelection.isEmpty) {
            return false;
        }
        // gizmoPointerDown runs on EVERY pointer-down while something
        // is selected — that's the "gizmo-first" pattern (try the
        // gizmo, fall back to a plain click-select on pointer-up), not
        // a signal that this particular click is a drag. A fork must
        // stay lazy on the actual first mutation, so hit-test BEFORE
        // forking: a click that lands anywhere but a handle (e.g.
        // re-selecting a different brick) must never fork on its own.
        if (typeof this._session.gizmoHitTest === 'function'
            && !this._session.gizmoHitTest(rawEvent.clientX, rawEvent.clientY)) {
            return false;
        }
        // This IS a genuine grab: it commits to a mutation the moment
        // the drag ends. Fork now, before the renderer arms the drag
        // against `this._spatialSelection` — every subsequent gizmo
        // callback (move/up) reads that same (now-forked) selection
        // reference.
        this._ensureEditableSelection();
        return this._session.gizmoPointerDown(
            rawEvent.clientX,
            rawEvent.clientY,
            this._spatialSelection,
            this._toModifiers(rawEvent)
        ) === true;
    }

    gizmoPointerMove(rawEvent) {
        if (!this._session) {
            return { consumed: false, hovered: false, feedback: null };
        }
        return this._session.gizmoPointerMove(
            rawEvent.clientX,
            rawEvent.clientY,
            this._spatialSelection,
            this._toModifiers(rawEvent)
        ) || { consumed: false, hovered: false, feedback: null };
    }

    gizmoPointerUp(rawEvent) {
        if (!this._session) {
            return { consumed: false, committed: false, feedback: null };
        }
        const result = this._session.gizmoPointerUp(
            rawEvent.clientX,
            rawEvent.clientY,
            this._spatialSelection,
            this._toModifiers(rawEvent)
        );
        if (result && result.consumed) {
            this._refreshInspection();
            this._refreshEditingContext();
            this._refreshGizmo();
            return result;
        }
        return { consumed: false, committed: false, feedback: null };
    }

    gizmoKeyDown(keyEvent) {
        if (!this._session) {
            return false;
        }
        const consumed = this._session.gizmoKeyDown(keyEvent, this._spatialSelection);
        if (consumed) {
            this._refreshGizmo();
        }
        return consumed;
    }

    // -----------------------------------------------------------------
    // Navigation
    // -----------------------------------------------------------------

    // 0.2.27: moves the camera AND, by default, makes `documentId` the
    // active (editing) document too — the common case (search/Nearby
    // Worlds/Documents-Here "Focus") really does mean both at once,
    // and every pre-0.2.27 caller of focusDocument already expected
    // that combined behavior. Pass `{ setActive: false }` for a pure
    // camera move that must not change what mutations target — see
    // docs/Principles.md, "Navigation Never Implies Editing."
    focusDocument(documentId, { setActive = true } = {}) {
        this._focusedDocumentId = documentId;
        if (setActive) {
            this.setActiveDocument(documentId);
        }
        const layoutPos = this._getWorldPosition(documentId);
        this._spawnAvatarNear(layoutPos);
        this._spatialCameraController.focusDocument(documentId, layoutPos);
        return this.updateSpatialView();
    }

    // 0.2.27: makes `documentId` the active document WITHOUT touching
    // the camera — the missing half of "Editing: Bob" while "Camera:
    // Alice" stays put (e.g. two publications sharing a coordinate;
    // switching which one is the editing target never needs to move
    // anything). A selection that belongs to a DIFFERENT document is
    // cleared — carrying it forward would mean the next transform
    // silently forks a document that isn't the one this call just
    // said should be active (see docs/Principles.md, "Only The Active
    // Document Is An Editing Target"). A selection already inside
    // `documentId` (or no selection at all) is left exactly as it was.
    setActiveDocument(documentId) {
        if (this._spatialSelection && !this._spatialSelection.isEmpty
            && this._spatialSelection.documentId !== documentId) {
            this.clearSelection();
        }
        this._activeDocumentId = documentId;
        return this._activeDocumentId;
    }

    // Where the camera is currently navigated to — see getActiveDocumentId()
    // for "which document would an edit land on," a genuinely different
    // question as of 0.2.27.
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

    // 0.2.94 — every currently-navigable WorldLocation: the world's
    // fixed Origin, plus one entry per StructurePlacement across every
    // currently LOADED document. See WorldLocationDirectory's own
    // header for exactly what "currently loaded" does and doesn't
    // include. Purely a query — never mutates selection, focus, or the
    // active document.
    getWorldLocations() {
        return this._worldLocationDirectory.list();
    }

    // Every OTHER collaborator currently spatially present across every
    // World this session has entered (`_presentSpatialWorldDocumentIds`),
    // flattened to one row per identity: `{ identityId, label, position,
    // activity, activityTarget }`. The shared collaborator source both
    // getPlaceContexts() (0.3.8) and getWelcomeContext() (0.3.9) derive
    // from — the roster itself stays grouped by identity with one entry
    // per DEVICE (see WorldSpatialPresenceUseCase#getSpatialRoster()'s
    // own header), so this picks each identity's first device that
    // currently reports a position and skips identities with none.
    // `resolveDisplayName`, if given, is the same optional
    // `(identityId) => string` callers already thread through
    // enterWorldSpatialPresence() for spatial marker rendering — absent,
    // falls back to the same short truncated identityId
    // _applySpatialPresenceRoster() uses. Never throws; an empty array
    // when no World has been spatially entered yet.
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

    // 0.3.8 — Collaborative World Curation. Returns derived place
    // contexts based on spatial proximity to landmarks. Each context
    // includes the landmark, nearby structures, nearby landmarks, and
    // nearby collaborators. Purely derived — never persisted, never
    // authoritative. See core/WorldCurationContext.js for the grouping
    // logic and radius constants. `resolveDisplayName` is optional — see
    // _getPresentCollaborators() above.
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

    // 0.3.8 — Returns a human-readable description of the current
    // location based on nearby landmarks and structures. E.g.,
    // "In Village" or "Near Old Bridge". Returns empty string if
    // no meaningful context can be derived.
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

    // 0.3.8 — Focus the camera on a place context (landmark position).
    // Uses the same camera animation as focusLocation(). Returns false
    // if the landmarkId is not found.
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

    // 0.3.9 — World Welcome & Guided Exploration. Derives a
    // WorldWelcomeContext for the active document's World: the same
    // landmark/structure collection getPlaceContexts() above gathers,
    // the live spatial presence roster (_getPresentCollaborators()), and
    // the avatar's own position (falling back to the camera's, for a
    // viewer with no avatar movement controller wired). Purely derived —
    // never persisted, never mutates the World, introduces no new
    // storage. See core/WorldWelcomeContext.js for the derivation itself
    // and docs/Principles.md, "Exploration Guides Attention, Never
    // Ownership or Mutation (0.3.9)." `resolveDisplayName` is optional —
    // see _getPresentCollaborators() above. Returns null when there is
    // no active document to welcome the viewer into.
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
        // 0.5.0 — regions across every loaded document, positions
        // already offset into the SAME shared/absolute layout space the
        // avatar/camera position above already is (see this method's
        // sibling loop above for structures/landmarks, and
        // getCurrentRegionPath() below for the identical offset logic).
        const regions = this._collectRegions();
        // 0.5.6 — Geographic Place Navigation & Arrival. Already
        // distance-filtered/sorted, direction-labeled rows — see
        // getNearbyGeographicPlaces()'s own header for why this is the
        // one call site that resolution logic lives behind.
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

    // 0.5.0 — World Regions & Decentralized Place Naming. Every
    // WorldRegion across every currently loaded document, with each
    // region's own X/Z offset into this session's shared/absolute
    // layout space (getDocumentPosition), the exact inverse of what
    // createRegionHere() below subtracts when creating one. A thin,
    // read-only helper shared by getWelcomeContext(), getCurrentRegionPath(),
    // and getRegions() — never a second source of truth for what regions
    // currently exist.
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

    // Every currently known region, world-wide across loaded documents —
    // the "Places" panel's own data source, the region counterpart to
    // getWorldLocations().
    getRegions() {
        return this._collectRegions();
    }

    // 0.5.4 — Place Identity & Geographic Claim Resolution. Every
    // WorldRegion across every currently loaded document, in EACH
    // region's own NATIVE per-World coordinates — deliberately NOT
    // offset into this session's shared multi-document layout space the
    // way _collectRegions() above is. That offset exists purely so
    // several loaded Worlds can be visualized side by side without
    // overlapping on screen; using it here would make every cross-World
    // geographic comparison meaningless (two regions that genuinely
    // describe the same ground in two independent Worlds would appear
    // however many thousands of units apart the layout happened to
    // place their documents). core/PlaceFingerprint.js/PlaceIdentity.js
    // only ever see what THIS method returns — never the shared-layout
    // positions _collectRegions() produces.
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

    // The combined community naming view for whatever geographic place
    // `regionId` belongs to: every region this replica currently knows
    // about that shares its core/PlaceFingerprint.js fingerprint (see
    // core/PlaceIdentity.js), and every claim on file for ANY of them,
    // ranked together by core/PlaceNamingView.js#rankClaimsByName()'s
    // own distinct-author scoring — see core/GeographicPlaceResolution.js
    // for the full derivation. Returns `{ regions, namingView }`:
    // `regions` is always at least `[the region itself]` when it's
    // known to this replica; `namingView` is [] when naming claims
    // aren't wired, mirroring getPlaceNamingView()'s own graceful
    // degradation — a caller may always call this safely without first
    // checking whether either collaborator exists.
    getGeographicNamingView(regionId, options = {}) {
        const regions = this._collectRawRegions();
        const claims = this._collectClaimsFor(regions);
        const group = geographicPlaceForRegion(regionId, regions, claims, options);
        if (!group) {
            return { regions: [], namingView: [] };
        }
        return { regions: group.regions, namingView: group.namingView };
    }

    // 0.5.5 — Geographic Place Directory & Identity UX. Every geographic
    // place candidate this replica currently knows about, world-wide
    // across every loaded document — the "Places" directory's own data
    // source, the geographic counterpart to
    // application/WorldLocationDirectory.js#list(). Each entry is a
    // core/GeographicPlaceView.js#GeographicPlaceView: a DERIVED reading
    // over whatever regions/claims this replica already has, never a
    // fourth stored object alongside WorldRegion/PlaceFingerprint/
    // PlaceIdentity — see that module's own header on the exact
    // pipeline this closes:
    //
    //   WorldRegion -> PlaceFingerprint -> PlaceIdentity ->
    //   GeographicPlaceView -> UI
    //
    // Cheap and safe to call as often as a UI likes, the same "list() is
    // never cached" posture WorldLocationDirectory itself already
    // documents — this method re-derives the whole directory fresh on
    // every call rather than keeping any state of its own.
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

    // 0.5.6 — Geographic Place Navigation & Arrival. Every geographic
    // place candidate within `radius` of the viewer's current position
    // (avatar position, falling back to camera position — the exact
    // same "where am I" fallback getWelcomeContext()/getCurrentRegionPath()
    // already use), nearest first. [] with no position available (no
    // avatar, no camera — e.g. before start()), the same graceful
    // degradation every other position-dependent read in this file
    // already has.
    //
    // Deliberately resolves each place's navigable position through
    // `_worldLocationDirectory` — the SAME single source of truth
    // focusLocation() itself reads via its own `place:<fingerprintKey>`
    // resolution (application/WorldLocationDirectory.js#
    // _geographicPlaceLocation()) — rather than recomputing a layout
    // offset here a second time. "How far away is it" and "where does
    // Go To Place actually take me" can never disagree, by
    // construction: both answers come from the exact same lookup.
    //
    // No distance/visitor/lastVisited is ever stored — every row
    // returned here is recomputed fresh on every call, exactly like
    // getGeographicPlaceDirectory() itself already is.
    getNearbyGeographicPlaces(radius = DEFAULT_NEARBY_GEOGRAPHIC_PLACE_RADIUS) {
        const position = this.getAvatarPosition() || this.getCameraPosition();
        if (!position) {
            return [];
        }
        return deriveNearbyGeographicPlaces(this._collectGeographicPlaceEntries(), position, radius);
    }

    // 0.5.8 — World View Contextual Focus & Information Hierarchy. The
    // entries loop getNearbyGeographicPlaces() built inline before this
    // milestone, extracted so getFocusContext() below can ask its own
    // "what's the nearest OTHER geographic place candidate to THIS
    // target" question by reusing the exact same resolution — never a
    // second copy of this loop, and never a second way "how far away is
    // a geographic place" gets answered. See core/GeographicPlaceNavigation.js#
    // deriveNearbyGeographicPlaces()'s own header on why no distance is
    // ever stored: every entry's position is re-resolved fresh, on
    // every call, straight through the same WorldLocationDirectory
    // lookup focusLocation() itself uses.
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

    // 0.5.8 — every WorldLandmark across every loaded document, in this
    // session's own shared/absolute layout space (getDocumentPosition)
    // — the exact same offset _collectRegions()/getMapContent() already
    // apply — PLUS each landmark's own description, which
    // getMapContent()'s thinner {id, title, position} rows don't carry.
    // A thin, read-only helper for getFocusContext() below; never a
    // second source of truth for what landmarks currently exist.
    _collectFocusLandmarks() {
        const landmarks = [];
        for (const document of this.getLoadedDocuments()) {
            const layoutPosition = this.getDocumentPosition(document.world.id);
            for (const landmark of document.world.getWorldLandmarks()) {
                landmarks.push({
                    id: landmark.id,
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

    // The structure counterpart to _collectFocusLandmarks() above —
    // same shape/offset getMapContent() already produces for
    // structures; kept as its own method purely so getFocusContext()
    // below reads symmetrically with the landmark/region helpers beside
    // it, not because the shape actually differs from getMapContent()'s
    // own structures array.
    _collectFocusStructures() {
        const structures = [];
        for (const document of this.getLoadedDocuments()) {
            const layoutPosition = this.getDocumentPosition(document.world.id);
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
        return structures;
    }

    // 0.5.8 — World View Contextual Focus & Information Hierarchy. The
    // ONE place a core/WorldFocusContext.js#WorldFocusContext is ever
    // built: gathers whatever raw World state deriveWorldFocusContext()
    // needs (the target itself, the viewer's own current position for
    // distance/direction, every region for containment, every
    // geographic place candidate for "Near: ___") and hands it to that
    // pure function — this method never derives anything itself. See
    // getFocusContextForLocation()/getFocusContextForCollaborator()
    // below for the two ways a caller actually reaches this; both are
    // thin resolvers that end here.
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

    // The Locations-panel/Map/Explore counterpart to focusLocation(): the
    // SAME `locationId` space (a WorldRegion/WorldLandmark/StructurePlacement
    // id, or a geographic place's own derived `place:<fingerprintKey>` id
    // — see core/GeographicPlaceNavigation.js) resolved into a
    // WorldFocusContext instead of a camera move. Deliberately does NOT
    // go through `_worldLocationDirectory.find()` for a region/landmark/
    // structure id — that returns only {id, title, kind, position},
    // missing the description/region-kind a focus panel wants to show —
    // so this resolves each kind against its own richer collection
    // instead (_collectRegions()/_collectFocusLandmarks()/
    // _collectFocusStructures()). Returns null for an unknown id, an
    // ORIGIN id (not a focusable kind — see core/WorldFocusContext.js's
    // own closed vocabulary), or when nothing is currently loaded —
    // never throws.
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

    // The collaborator counterpart to getFocusContextForLocation() above
    // — a WorldCollaboratorIndicator row/Explore's "Nearby People" row/a
    // map collaborator marker all already address a collaborator by
    // `deviceId`, exactly what focusCollaborator() itself takes.
    // `resolveDisplayName` is the same optional `(identityId) => string`
    // every other collaborator-listing method here already accepts —
    // see _getPresentCollaborators()'s own header. Returns null for an
    // unknown/no-longer-present deviceId, never throws.
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

    // 0.5.6 — a lightweight, derived filter over getGeographicPlaceDirectory()'s
    // own rows — see core/GeographicPlaceNavigation.js#searchGeographicPlaces()
    // for what it matches against (displayName, every community name,
    // every region's own name). Never a second index kept in sync with
    // anything; every call re-derives the directory fresh, the same
    // "cheap, never cached" posture getGeographicPlaceDirectory() itself
    // already holds to.
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

    // 0.5.0 — every named region actually containing the viewer's
    // current position, innermost first. Purely derived — see
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

    // 0.5.1 — World Maps & Geographic Navigation. Every region/landmark/
    // structure/collaborator currently known to this session, WORLD-WIDE
    // across every loaded document — the exact same scope
    // application/WorldLocationDirectory.js#list() already uses for
    // navigation (never streaming-radius-limited, per that class's own
    // header), because a map is for understanding the whole World, not
    // just what's currently rendered nearby. Each entry's position is
    // already offset into this session's shared/absolute layout space
    // (getDocumentPosition) — the SAME transform _collectRegions() above
    // and WorldLocationDirectory's own _landmarkLocationsFor()/
    // _structureLocationsFor() already apply — so a map spanning
    // multiple loaded Worlds lines their content up exactly like the
    // Locations panel already does. `resolveDisplayName` is the same
    // optional `(identityId) => string` every other collaborator-listing
    // method here already accepts — see _getPresentCollaborators()'s
    // own header.
    //
    // Purely a read: never mutates the World, never decides what a map
    // does with this. See core/WorldMapProjection.js for the pure
    // projection math built on top, and ui/components/WorldMapPanel.js
    // for the one renderer that consumes it today.
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

    // The human breadcrumb for the viewer's CURRENT position, e.g.
    // "Willow Village · Green Valley". Falls back to the exact same
    // describeLocation() reading (nearest landmark/structure) this
    // session already offered before 0.5.0 when no region contains the
    // position — never a fabricated placeholder name.
    getCurrentPlaceName() {
        const path = this.getCurrentRegionPath();
        const placeName = describePlace(path);
        return placeName || this.getCurrentLocationDescription();
    }

    // -----------------------------------------------------------------
    // Local World Experience & Return (0.3.10)
    // -----------------------------------------------------------------
    //
    // Purely local, per-user camera framing for a World this replica has
    // visited before — never a Document field, a WorldPlacement field,
    // or anything ever broadcast. See core/LocalWorldExperience.js and
    // docs/Principles.md, "Personal Experience Is Not Shared World
    // State (0.3.10)." Every method below is a graceful no-op with no
    // localWorldExperienceStore wired — the same optional-collaborator
    // posture every other optional feature in this constructor follows.
    //
    // Deliberately independent of enterWorldPresence()/leaveWorldPresence()
    // (0.2.98): those broadcast a SHARED "I am here" fact to peers; these
    // read/write nothing but this replica's own local storage. A caller
    // wires both at the same "active document changed" event (see
    // ui/views/WorldView.js's _syncWorldExperience()) without either
    // implying the other — and, per the same principle, this state is
    // NEVER consulted by canEditDocument()/worldAuthorizationService: a
    // prior visit is a UX convenience, never an authorization claim.

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

    // Most-recently-visited Worlds this replica has a local experience
    // record for — the "Recent Worlds" list's own data source. An empty
    // array, never a throw, with no store wired.
    getRecentlyVisitedWorlds(limit = 10) {
        if (!this._localWorldExperienceStore) {
            return [];
        }
        return this._localWorldExperienceStore.getRecentlyVisited(limit);
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

    // Restores whatever THIS replica's own last visit to `documentId`
    // left behind, if anything. A stored Camera Perspective takes
    // priority and is re-applied via setCameraPerspective() — a
    // perspective is always an offset from the avatar's CURRENT
    // position (core/CameraPerspective.js), never a raw coordinate, so
    // it re-frames correctly even if the avatar moved (or the World
    // changed) since the last visit. Otherwise, a stored free/orbit
    // position+target is restored directly, exactly like every other
    // camera-focus caller in this file (see _beginCameraFocus()) — never
    // a second camera-movement mechanism. Returns the restored
    // LocalWorldExperience, or null when there is nothing to restore
    // (no store wired, or no prior visit on record) — the caller simply
    // keeps whatever framing it already had, e.g. 0.3.9's Welcome
    // framing for a first-time visitor.
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

    // 0.2.94 — the Locations-panel counterpart to focusDocument()/
    // focusSelection(): moves the camera toward a WorldLocation's own
    // position with a deterministic offset (LOCATION_FOCUS_OFFSET for a
    // STRUCTURE location, or the fixed HOME_CAMERA_FRAMING for ORIGIN —
    // see those constants' own comments for why each is what it is),
    // smoothly when this session can animate (see _beginCameraFocus()).
    // Deliberately never touches `_activeDocumentId`/selection/
    // inspection — see docs/Principles.md, "Navigation Never Implies
    // Editing (0.2.27)," which this milestone's Locations panel keeps
    // exactly as true as every prior navigation entry point. Returns
    // false (a no-op) for an unknown locationId, e.g. a stale panel
    // entry whose StructurePlacement was since deleted or unloaded —
    // never throws.
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

    // 0.2.94 — "Home": returns the camera to the world's one
    // conventional starting framing, regardless of how far the camera
    // has since wandered. Exactly `focusLocation(ORIGIN_LOCATION_ID)`,
    // exposed under its own name because "Home" is the one destination
    // the design conversation calls out as needing no Locations-panel
    // lookup at all — a single always-available action. Never changes
    // `_activeDocumentId` or any document/placement state — the world
    // itself is completely unaffected; only the camera moves.
    goHome() {
        return this.focusLocation(ORIGIN_LOCATION_ID);
    }

    // 0.2.94 — a pure, derived orientation reading for a compass
    // indicator: "which way is the camera currently looking," computed
    // fresh from the camera's own position/target (core/CompassHeading.js)
    // every time this is called — never cached, never a stored fact.
    // Returns null before start() has ever been called (no camera
    // controller yet) or when the camera's position and target
    // currently coincide (no meaningful heading — see
    // computeCompassHeading's own comment).
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
		    // 0.2.20: a lazily-forked document is never a publication,
		    // so it can never re-enter `visibleIds` on its own — unlike
		    // a dirty flag, this pin does not clear on save. Without it,
		    // saving a fork (which clears dirty) would make the very
		    // next camera move stream it out permanently: unloadable
		    // and undiscoverable in the same breath.
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
	
	// 0.2.39 — an avatar pick is checked ALONGSIDE the brick pick (both
	// are cheap raycasts against entirely separate object sets — see
	// renderer/AvatarPickingService.js), and whichever is actually
	// NEARER the camera wins — never "bricks always win" regardless of
	// depth (an avatar standing in front of a wall must be selectable
	// as itself, not as the wall behind it). Exactly one of
	// {avatar interaction target, brick/ground selection} is ever
	// non-empty at a time — see docs/Principles.md, "Avatars Are Never
	// Document Selection": every branch below explicitly clears the
	// other. `toggle`/`additive` are meaningless for an avatar target
	// (there is no multi-avatar-selection concept) and are simply
	// ignored on that branch.
	pick(screenX, screenY, { toggle = false, additive = false } = {}) {
	    if (!this._session) {
	        return null;
	    }
	    const brickHit = this._session.pick(screenX, screenY);
	    const avatarHit = typeof this._session.pickAvatar === 'function'
	        ? this._session.pickAvatar(screenX, screenY)
	        : null;
	    // 0.2.93 — World View Instance Inspection: a THIRD, separate
	    // raycast target set (renderer/PlacementMeshRegistry.js, via
	    // PickingService#pickPlacement()) — a StructurePlacement's own
	    // meshes are never registered with the brick mesh registry (see
	    // renderer/WorldRenderer.js's own 0.2.90 header), so resolving a
	    // hit on one needs its own test, folded into the same
	    // nearest-wins comparison avatarHit already uses against
	    // brickHit. Optional: a render facade that doesn't support it
	    // (an older test double) simply never resolves a placement hit —
	    // the same graceful-absence posture avatarHit already has.
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

	    // 0.2.93 — a StructurePlacement instance: SELECT, never EDIT. See
	    // docs/Principles.md, "Selection In World View Does Not Imply
	    // Editing Authority" — this branch only ever sets selection +
	    // inspection state and drives a whole-instance highlight; it
	    // never reaches SpatialEditingService, and never shows the
	    // transform gizmo (a `placement` selection's `items` array is
	    // always empty — see SpatialSelectionState's own header — so
	    // SelectionBoundsService#calculate() returns null for it, and
	    // TransformGizmoUseCase#resolvePresentation(), called from
	    // _refreshGizmo() below, hides the gizmo accordingly. No
	    // special-casing needed in either of those files). `toggle`/
	    // `additive` are meaningless here (there is no multi-placement-
	    // selection concept) and are simply ignored, exactly like the
	    // avatar branch above.
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
            this._updatePlacementPreview(brickHit);
            return hover;
        }
        const groundHit = this._session.pickGround(screenX, screenY);
        if (groundHit) {
            const hover = SpatialHoverState.ground(groundHit.position);
            this._setSpatialHover(hover);
            this._session.clearHover();
            this._updatePlacementPreview(groundHit);
            return hover;
        }
        this._setSpatialHover(SpatialHoverState.empty());
        this._session.clearHover();
        this._clearPlacementPreview();
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

    // 0.1.50 — select every brick in the document the current selection
    // belongs to (or the ACTIVE document when nothing is selected —
    // 0.2.27: never the camera-focused one, see docs/Principles.md).
    // Multi-document select-all is deliberately undefined: a spatial
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

    moveSelection(delta, modifiers = null) {
	    if (this._historyPreview && this._historyPreview.active) return false;
        this._ensureEditableSelection();
        if (!this._spatialEditingContext || this._spatialEditingContext.isEmpty) {
            return false;
        }
        const ctx = this._spatialEditingContext;
        if (!ctx.can('move')) {
            return false;
        }
        const success = this._editingService.moveSelection(this._spatialSelection, delta, { modifiers });
        if (success) {
            this._refreshInspection();
            this._refreshGizmo();
        }
        return success;
    }

    deleteSelection() {
	    if (this._historyPreview && this._historyPreview.active) return false;
        this._ensureEditableSelection();
        if (!this._spatialEditingContext || this._spatialEditingContext.isEmpty) {
            return false;
        }
        const ctx = this._spatialEditingContext;
        if (!ctx.can('delete')) {
            return false;
        }
        const success = this._editingService.deleteSelection(this._spatialSelection);
        if (success) {
            this.clearSelection();
        }
        return success;
    }

    rotateSelection(deltaRotation, modifiers = null) {
	    if (this._historyPreview && this._historyPreview.active) return false;
        this._ensureEditableSelection();
        if (!this._spatialEditingContext || this._spatialEditingContext.isEmpty) {
            return false;
        }
        const ctx = this._spatialEditingContext;
        if (!ctx.can('rotate')) {
            return false;
        }
        const success = this._editingService.rotateSelection(this._spatialSelection, deltaRotation, { modifiers });
        if (success) {
            this._refreshInspection();
            this._refreshGizmo();
        }
        return success;
    }

    alignSelection(mode) {
	    if (this._historyPreview && this._historyPreview.active) return false;
        this._ensureEditableSelection();
        if (!this._spatialEditingContext || this._spatialEditingContext.isEmpty) {
            return false;
        }
        const success = this._editingService.alignSelection(this._spatialSelection, mode);
        if (success) {
            this._refreshInspection();
            this._refreshGizmo();
        }
        return success;
    }

    distributeSelection(axis) {
	    if (this._historyPreview && this._historyPreview.active) return false;
        this._ensureEditableSelection();
        if (!this._spatialEditingContext || this._spatialEditingContext.isEmpty) {
            return false;
        }
        const success = this._editingService.distributeSelection(this._spatialSelection, axis);
        if (success) {
            this._refreshInspection();
            this._refreshGizmo();
        }
        return success;
    }

    // 0.4.9 — see EditorSession#snapSelectionToGrid()'s own comment:
    // identical shape, reused across both surfaces.
    snapSelectionToGrid(gridSize) {
	    if (this._historyPreview && this._historyPreview.active) return false;
        this._ensureEditableSelection();
        if (!this._spatialEditingContext || this._spatialEditingContext.isEmpty) {
            return false;
        }
        const success = this._editingService.snapSelectionToGrid(this._spatialSelection, gridSize);
        if (success) {
            this._refreshInspection();
            this._refreshGizmo();
        }
        return success;
    }

    applyNumericTransform(intent, options = {}) {
	    if (this._historyPreview && this._historyPreview.active) return false;
        this._ensureEditableSelection();
        if (!this._spatialEditingContext || this._spatialEditingContext.isEmpty) {
            return false;
        }
        const success = this._editingService.applyNumericTransform(this._spatialSelection, intent, options);
        if (success) {
            this._refreshInspection();
            this._refreshGizmo();
        }
        return success;
    }

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

    getSpatialSelection() {
        return this._spatialSelection;
    }

    getSpatialHover() {
        return this._spatialHover;
    }

    getSpatialInspection() {
        return this._spatialInspection;
    }

    // 0.2.39 — the raw AvatarInteractionState, same shape/role as
    // getSpatialSelection() but for the entirely separate avatar
    // target slice — see docs/Principles.md, "Avatars Are Never
    // Document Selection."
    getAvatarInteraction() {
        return this._avatarInteraction;
    }

    // Read-only, generalizes 0.2.29's inspectDocument() to avatars:
    // resolves the CURRENT avatar interaction target into plain
    // presentation data for ui/components/AvatarInfoPanel.js, reading
    // from whichever source actually HOLDS that data — the local
    // avatar's own AvatarProfileUseCase/AvatarPresenceSession, or a
    // remote avatar's known presence via PresenceSyncService — never
    // mutating anything, never forking, never touching presence. See
    // docs/Principles.md, "Looking At Something Is Never The Same As
    // Acting On It." Returns null when there is no current target, or
    // when the targeted avatar is no longer known (e.g. its presence
    // expired between being clicked and being inspected).
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

    // 0.3.6 — World Discovery & Exploration. The local avatar's own
    // live world position — WorldSpatialContextService's primary
    // "where am I" signal (see application/WorldSpatialContextService.js
    // and docs/Principles.md, "Exploration Is Derived From Place, Not
    // Stored As Place"). Same graceful-absence posture as
    // getCameraPosition() above: a session with no avatarPresenceSession
    // wired (nobody logged in, or most existing tests) simply returns
    // null, leaving the caller to fall back to getCameraPosition().
    getAvatarPosition() {
        if (!this._avatarPresenceSession) {
            return null;
        }
        const { x, y, z } = this._avatarPresenceSession.current.position;
        return { x, y, z };
    }

    // 0.3.6 — the SAME seed terrainHeightAt()/ecologyZoneAt()/
    // hydrologyFeatureAt() already use everywhere else in this file
    // (DEFAULT_WORLD_SEED, imported above) — spatial context derivation
    // must never invent a second, session-local notion of "which seed
    // is this world using," it just needs a way to ask this session
    // which one is live.
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
            // 0.2.37 never synchronizes real appearance for a REMOTE
            // avatar — but THIS is the local avatar, whose template is
            // always its own real, chosen one.
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
            // 0.2.41 onward, a remote AvatarProfile's displayName IS
            // distributed (see core/AvatarProfileAdvertisement.js) —
            // getAvatarDisplayName() resolves it when known, falling
            // back to ownerIdentity, then the avatarId itself.
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
    // World Editing Authorization (0.2.95)
    // -----------------------------------------------------------------
    //
    // Three public queries, deliberately never a fourth "isOwner" or a
    // role name — see core/WorldAccessLevel.js and application/
    // WorldAuthorizationService.js's own headers. A session built
    // without a worldAuthorizationService (every pre-0.2.95 caller)
    // treats every loaded document as fully editable — the EXACT
    // pre-0.2.95 behavior, unchanged — which is also why
    // getWorldAccessLevel() falls back to EDIT rather than NONE for a
    // documentId this session cannot resolve at all: an unresolvable
    // id under the graceful-absence default must never look MORE
    // restrictive than simply having no gate wired, or a caller that
    // never asked for authorization at all would start seeing spurious
    // denials the moment a documentId typo or a not-yet-streamed-in
    // document is looked up. When a real worldAuthorizationService IS
    // wired, an unresolvable documentId instead denies (see
    // canEditDocument/canReadDocument below) — there is no Document to
    // ask the service about, and "no Document" is never editable or
    // readable by construction.
    getWorldAccessLevel(documentId) {
        if (!this._worldAuthorizationService) {
            return WorldAccessLevel.EDIT;
        }
        const document = this.getDocument(documentId);
        return this._worldAuthorizationService.resolveAccess(document, documentId);
    }

    // The gate every real mutation chokepoint in
    // application/SpatialEditingService.js consults (wired at
    // construction — see start()/the constructor above), and safe to
    // call directly from a UI surface that wants to reflect (never
    // decide) whether an edit affordance should even be offered.
    //
    // 0.2.98 — now also threads `documentId` through to
    // WorldAuthorizationService, so a NON-OWNER holding a signed World
    // edit grant (application/WorldMembershipUseCase.js) is recognized
    // here too, not merely by application/WorldCommandPropagationUseCase.js's
    // own receiving side — the exact same authorization answer,
    // consulted from both the LOCAL mutation chokepoint and the network
    // one.
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
    // World Membership (0.2.98)
    // -----------------------------------------------------------------
    //
    // "Am I this exact World's own cryptographic owner?" — the gate
    // application/WorldMembershipUseCase.js itself already enforces
    // before honoring grantWorldEdit()/revokeWorldEdit() below; exposed
    // here too so a UI can decide whether to even OFFER a "manage
    // collaborators" affordance, the identical "reflect, never decide"
    // relationship canEditDocument() already has with
    // SpatialEditingService's own enforcement.
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

    // 0.2.99 — World Collaboration UX. Thin delegation mirroring
    // onWorldPresenceChanged() below exactly — a UI Members panel
    // wants to reflect a GOSSIPED grant/revocation (one this replica
    // didn't itself issue, e.g. Charlie observing Alice grant Bob) the
    // moment it arrives, not only after its own next poll. Returns a
    // no-op unsubscribe when no worldMembershipUseCase is wired, the
    // same graceful-absence contract every subscription method here
    // already follows.
    onWorldMembershipChanged(documentId, callback) {
        if (!this._worldMembershipUseCase) {
            return () => {};
        }
        return this._worldMembershipUseCase.onMembershipChanged(documentId, callback);
    }

    // -----------------------------------------------------------------
    // World Presence (0.2.98)
    // -----------------------------------------------------------------
    //
    // Declares this replica present in `documentId`. `activity` defaults
    // to a fresh canEditDocument() read — see core/WorldPresenceActivity.js's
    // own header on why this is only ever a self-reported UI HINT,
    // never itself an authorization claim. A no-op when no
    // worldPresenceUseCase is wired (every pre-0.2.98 caller, and any
    // headless/local-only use).
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
    // World Spatial Presence (0.3.0)
    // -----------------------------------------------------------------
    //
    // Declares this replica SPATIALLY present in `documentId` — see
    // application/WorldSpatialPresenceUseCase.js's own header. A no-op
    // when no worldSpatialPresenceUseCase is wired, the exact
    // graceful-absence contract enterWorldPresence() above already
    // follows. `resolveDisplayName`, if given, is an OPTIONAL
    // `(identityId) => string` this session threads straight through to
    // every remote marker it renders for THIS World — the same
    // presentation-only resolution WorldView.js's own
    // resolveIdentityDisplayName() already performs for the Members
    // panel (ui/components/WorldMembersPanel.js), never duplicated or
    // reinvented here. Absent, a short truncated identityId is shown
    // instead — never a thrown error.
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

    // The one call a UI drives on a fast interval (see ui/views/WorldView.js)
    // while this World is the active one — reads this session's OWN
    // already-existing camera/selection/gizmo/movement state and
    // forwards it. This is the ONE place local interaction state becomes
    // a network fact — see core/WorldSpatialActivity.js's own header:
    // `activity` is always DERIVED here, never something a caller passes
    // in directly. A no-op for a World this session hasn't entered
    // spatial presence for.
    syncWorldSpatialPresence(documentId) {
        if (!this._worldSpatialPresenceUseCase || !this._presentSpatialWorldDocumentIds.has(documentId)) {
            return;
        }
        const cameraPosition = this.getCameraPosition();
        const heading = this.getCompassHeading();
        const selection = this._resolveWorldSpatialSelection(documentId);
        const gizmoState = this._editingService.transformGizmoState;
        // 0.3.4 — the local avatar's own vertical motion
        // (core/AvatarVerticalState.js), read fresh off the movement
        // controller exactly like `isMoving` already is below, and fed
        // into deriveWorldSpatialActivity()'s own new JUMPING/FALLING
        // cases. Absent entirely (no controller wired at all) simply
        // means neither ever fires — same graceful-absence posture as
        // `isMoving` already follows.
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

    // Reads this session's own LOCAL editing selection
    // (`_spatialSelection`, application/spatial-state/SpatialSelectionState.js)
    // and translates it into the read-only observation shape
    // core/WorldSpatialSelection.js defines — see that file's own
    // header on why the two are never the same type. Only ever reflects
    // a selection that belongs to THIS World (never a different loaded
    // document this replica also happens to have open) and only its
    // World-View-relevant kinds (brick, structure placement) — a ground
    // click or ordinary multi-brick marquee simply reports no selection,
    // exactly like a placement selection already suppresses the
    // transform gizmo (see SpatialSelectionState's own header).
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

    // 0.3.0 — the application-layer render driver, the identical shape
    // application/RemoteAvatarRegistry.js already established for remote
    // avatars: THIS class reacts to a presence-sync event and calls its
    // own render facade (`this._session`) directly — WorldView.js never
    // touches renderer/RemoteSpatialPresenceRenderer.js, or even knows
    // it exists. A no-op (never throws) before this._session exists yet
    // (start() hasn't been called) — the subscription is still recorded,
    // so a start() that happens later doesn't need this called again.
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

    // Diffs the freshly-fetched roster against whatever this session
    // last rendered for `documentId`, so a device that dropped out (its
    // owner disconnected, or explicitly left) is removed from the scene
    // rather than left behind as a stale marker.
    //
    // 0.3.1 — Collaborative Spatial Awareness. Each device's raw 0.3.0
    // observation is turned into a `WorldSpatialAnchor` (core/WorldSpatialAnchor.js)
    // BEFORE it ever reaches the renderer: this session's OWN camera
    // position/heading (already read for syncWorldSpatialPresence() just
    // above) becomes the anchor's viewer, and this device's own selection
    // is resolved to a contextual label ("House") through
    // _resolveSpatialContextualLabel() below. The renderer/UI never do
    // this derivation themselves — see that file's own header, "a pure
    // function of a WorldSpatialPresenceUseCase observation plus the
    // VIEWER's own local camera state."
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

    // 0.3.1 — Collaborative Spatial Awareness. "What is this remote
    // selection actually pointing at, in words" — the ONE place a
    // `WorldSpatialSelection` (0.3.0's read-only observation type) is
    // ever turned into display text. Reuses getSavedDocumentTitle()'s
    // own already-existing lookup rather than inventing a second one; a
    // placement selection resolves through `document.world.getStructurePlacement()`
    // to find WHICH document it references (exactly
    // application/EditorSession.js#getSelectedPlacementInfo()'s own
    // step, generalized to any loaded document rather than only the
    // active one, since a remote participant's selection can live in any
    // World this session has open). A brick selection has no comparable
    // name to show — core/Building.js carries no title field at all
    // (see that file's own header) — so it deliberately resolves to
    // null, which describeSpatialActivity() already treats as "no
    // contextual target," falling back to the exact plain phrase 0.3.0
    // always showed ("Building", never "Building undefined"). Returns
    // null, never throws, for an empty selection, an unresolvable
    // placement (deleted, or in a document this replica hasn't loaded),
    // or no loadDocumentUseCase wired at all.
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

    // The public counterpart to _resolveSpatialContextualLabel() above —
    // a UI (ui/views/WorldView.js) passes THIS straight to
    // buildSpatialCollaboratorRows()'s own `resolveSelectionLabel` option
    // rather than reaching into a private method, exactly the same
    // "public wrapper around an internal derivation" shape
    // resolveIdentityDisplayName()/getSavedDocumentTitle() already are.
    resolveSpatialSelectionLabel(selection) {
        return this._resolveSpatialContextualLabel(selection);
    }

    // 0.3.1 — Collaborative Spatial Awareness. The Follow-only navigation
    // counterpart to focusLocation()/focusDocument(): moves the camera
    // toward a collaborator's LAST KNOWN spatial position, once, through
    // the exact same _beginCameraFocus()/LOCATION_FOCUS_OFFSET machinery
    // 0.2.94's own Locations panel already established — no second
    // camera-movement mechanism. Deliberately NOT a subscription: this
    // reads whatever getWorldSpatialPresenceRoster() reports RIGHT NOW
    // and never looks again — see docs/Principles.md, "Follow Is Local
    // Camera Navigation, Never A Shared Camera (0.3.1)." A second call
    // (e.g. a UI's own "Follow" button clicked again later) simply
    // focuses wherever that collaborator now is; there is no persistent
    // "currently following" mode, no live tether, and nothing is ever
    // sent to the collaborator's own replica — their client has no way
    // to know this was ever called. Searches every World this session is
    // currently spatially present in (ordinarily just the one active
    // World View is showing) rather than requiring a caller to also name
    // a documentId. Returns false (a no-op) for a deviceId with no
    // currently-known position — a stale roster row, or one that
    // disconnected between the click and this call — never throws.
    focusCollaborator(deviceId) {
        for (const documentId of this._presentSpatialWorldDocumentIds) {
            const roster = this.getWorldSpatialPresenceRoster(documentId);
            for (const group of roster) {
                const device = group.devices.find((candidate) => candidate.deviceId === deviceId);
                if (device && device.position) {
                    const groundY = terrainHeightAt(DEFAULT_WORLD_SEED, device.position.x, device.position.z);
                    // 0.3.2 — a selected Camera Perspective decides
                    // Follow's offset too, exactly as
                    // docs/Principles.md, "Camera Perspective
                    // Determines An Offset; It Never Replaces The
                    // Camera Machinery (0.3.2)" describes: Bob in
                    // third-person shows him ahead of the camera; the
                    // same Follow in first-person approaches through
                    // his own eyes instead. Still the exact same
                    // _beginCameraFocus() glide-once call either way —
                    // only the FRAMING handed to it differs. Falls
                    // back to the original fixed LOCATION_FOCUS_OFFSET
                    // box exactly as before whenever no perspective is
                    // selected.
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

    // 0.2.93 — resolves a StructurePlacement's referenced documentId to
    // a human title via the SAME saved-document listing
    // application/EditorSession.js#getSelectedPlacementInfo() already
    // reads (application/LoadDocumentUseCase.js#listSavedDocuments()) —
    // no second title-lookup mechanism. Falls back to the raw
    // documentId when there's no loadDocumentUseCase wired, or no
    // matching saved entry (e.g. content authored on a different
    // device/replica this replica has never saved locally) — the same
    // graceful-absence shape getSelectedPlacementInfo() already
    // established, never a thrown error.
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
    // Fork-on-write (0.2.20)
    //
    // A published World View is immutable; a World View SESSION is
    // editable. Opening a published snapshot never makes the snapshot
    // itself editable — the first mutation crosses the publication
    // boundary and creates a new Document derived from it (Copy-on-
    // Write / Fork-on-Edit). Navigation, camera, selection, hover, and
    // inspection never call any of this; only an actual document
    // mutation does. See docs/Principles.md, 0.2.20.
    // -----------------------------------------------------------------

    // True while `documentId` is still a straight, unforked view of a
    // published snapshot — i.e. still immutable as far as this session
    // is concerned.
    isDocumentPublished(documentId) {
        return this._publishedDocumentIds.has(documentId);
    }

    // Proactive counterpart to the guards below: tells the UI what
    // WOULD happen on the first edit of `documentId`, before the user
    // attempts one, so it can explain itself instead of only reacting
    // after a blocked action throws. Returns null for anything that
    // isn't a still-published snapshot (already editable — nothing to
    // say). Otherwise:
    //   { blocked: false, message } — editable; first edit forks silently
    //   { blocked: true,  message } — fork policy (0.2.13) forbids it
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

    // 0.2.21: the World View entry point for the Document Properties
    // editor. Editing metadata is a mutation exactly like moving a
    // brick — it must not land on a published snapshot — so it goes
    // through the SAME fork-on-first-mutation gate
    // (_ensureEditableDocumentId) every other guard in this file uses,
    // rather than a bespoke "throw if published" check of its own.
    // Returns the documentId the edit actually landed on (the fork's
    // id, if one was just created) so the caller can re-focus/re-select
    // it.
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
            // 0.2.99 — World Collaboration UX. The SAME cryptographic
            // fact WorldAuthorizationService/WorldMembershipUseCase
            // already key ownership off (core/DocumentMetadata.js's own
            // 0.2.95 field), exposed here purely so a Members panel can
            // label the owner's row without re-deriving ownership
            // itself — null for a pre-0.2.95 document, exactly like
            // `author` degrades gracefully everywhere else.
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

    // 0.2.23: the Publication a loaded document's placement(s) belong
    // to — a document only HAS a placement once it (or a document
    // sharing its documentId, for a document that hasn't been
    // published itself) has been published; a fork you haven't
    // published yet has none. Separate from _isKnownPublication/
    // _findPublications (0.2.20), which answer "is this a published
    // snapshot" for the fork-on-edit boundary — this answers "which
    // Publication row does the spatial layer key placements under",
    // used regardless of whether the document is currently the
    // read-only source or an already-forked, still-editable copy that
    // happens to share history with one.
    _resolvePublicationForPlacement(documentId) {
        const publications = this._findPublications(documentId);
        if (publications.length === 0) return null;
        return publications.reduce((latest, p) => (!latest || p.publishedAt > latest.publishedAt) ? p : latest, null);
    }

    // A document can have more than one placement (the same
    // publication exhibited in several places — see docs/Principles.md,
    // "A Publication Is What; A Placement Is Where"). Picking the most
    // recently updated one is a deliberate simplification for this
    // milestone, matching WorldLayoutProvider.getPosition's same
    // choice; browsing/choosing among several is future scope, not
    // something the current data model prevents.
    _resolvePlacementRecord(documentId) {
        if (!this._placementRegistry) return null;
        const publication = this._resolvePublicationForPlacement(documentId);
        if (!publication) return null;
        const records = this._placementRegistry.findByPublicationId(publication.id);
        if (records.length === 0) return null;
        return records.reduce((latest, r) => (!latest || r.updatedAt > latest.updatedAt) ? r : latest, null);
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
        const currentUser = this._identityProvider ? this._identityProvider.currentUser() : null;
        const currentUsername = currentUser ? (currentUser.username || currentUser.id) : null;
        // Best-effort, LOCAL ownership signal for the UI only — never
        // the actual authorization boundary. A move this session
        // allows still gets signed as the CURRENT user (0.2.16); if
        // that doesn't match the placement's real owner (or a valid
        // 0.2.17 delegation), the revision fails verification wherever
        // it's actually checked, the same "the writer doesn't gate
        // itself, the reader verifies" decentralized posture 0.2.19's
        // trust layer already established. No owner recorded at all
        // (a legacy/never-signed placement) is treated as movable,
        // matching "enforce only when the information is actually
        // available" (0.2.13/0.2.20's fork policy checks use the same
        // rule).
        const ownerName = record.owner || (record.ownerIdentity ? (record.ownerIdentity.username || record.ownerIdentity.id) : null);
        const ownedByCurrentUser = !ownerName || (currentUsername !== null && ownerName === currentUsername);
        // 0.2.25: passive overlap visibility — how many OTHER placements
        // (local knowledge only, same "best-effort" posture as `movable`
        // above) currently sit at this exact position. Shown regardless
        // of how this placement got here (automatic or explicit) — see
        // docs/Principles.md, "Overlap Is A Fact; Collision Is A Policy
        // Decision." Never blocks or alters anything by itself.
        const overlap = this._placementRegistry
            ? detectSpatialOverlap(record.position, this._placementRegistry.list(), { excludePlacementId: record.placementId })
            : null;
        return {
            documentId: id,
            placementId: record.placementId,
            publicationId: record.publicationId,
            position: { x: record.position.x, y: record.position.y, z: record.position.z },
            rotation: record.rotation,
            revision: record.revision,
            owner: ownerName,
            movable: ownedByCurrentUser,
            overlapCount: overlap ? overlap.count : 0
        };
    }

    // Pre-flight query for an EXPLICIT placement request — "if I moved
    // this placement to newPosition right now, what would I find
    // there, and does my configured policy require confirming first?"
    // Purely a query: it never mutates anything, and movePlacement()
    // below does not call it — the caller (the UI) is expected to call
    // this FIRST, get a decision, and only invoke movePlacement() once
    // that decision is satisfied (allowed, and confirmed if required).
    // See docs/Principles.md, "Overlap Is A Fact; Collision Is A Policy
    // Decision" — MoveWorldPlacementUseCase remains the sole authority
    // for actually creating a new placement revision; this method never
    // touches it.
    //
    // Returns null when there is nothing to check against (no
    // placementRegistry wired, or the document has no placement of its
    // own to move) rather than a decision-shaped object full of
    // defaults — the same "null when the question doesn't apply" rule
    // getPlacementInfo already follows.
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

    // 0.2.26 — "what's actually here?", independent of any move in
    // progress. Unlike checkPlacementOverlap (which excludes the
    // placement being moved, because it's asking "would I collide with
    // something ELSE"), this includes every placement at the position,
    // the currently-inspected one included — it answers the World
    // Navigation design's "Documents at this location" list, not a
    // move's pre-flight check. Read-only: never touches
    // MoveWorldPlacementUseCase, never mutates anything.
    //
    // Only PUBLISHED placements (backed by a PlacementRecord) can ever
    // appear here — an editing fork has no placement of its own (it
    // inherits its source's position locally and non-authoritatively,
    // see _localPositions below), so it deliberately never shows up in
    // a "documents at this position" query. Making forks independently
    // placeable would mean giving something that BY DESIGN has no
    // publication yet a position anyway — a bigger question this
    // milestone does not attempt to answer.
    getDocumentsAtPosition(position) {
        if (!this._placementRegistry) return [];
        const overlap = detectSpatialOverlap(position, this._placementRegistry.list());
        return overlap.occupants.map((occupant) => this._describeSpatialOccupant(occupant));
    }

    // Resolves a placement record into the shape a UI actually wants
    // to show a person: a title and a documentId to focus, not a raw
    // publicationId. Best-effort — falls back to the publicationId
    // itself when discovery can't resolve it (no discoveryProvider
    // wired, or the publication isn't locally known), matching how
    // every other best-effort local lookup in this file degrades.
    // Shared by checkPlacementOverlap (0.2.25) and getDocumentsAtPosition
    // (0.2.26) — both are "who else is at this position," just with
    // different self-inclusion rules upstream.
    _describeSpatialOccupant(record) {
        const publication = this._discoveryProvider ? this._discoveryProvider.findById(record.publicationId) : null;
        return {
            documentId: publication ? publication.documentId : null,
            publicationId: record.publicationId,
            title: publication ? publication.title : record.publicationId,
            owner: record.owner || null
        };
    }

    // 0.2.26 — search over the SAME discovery machinery everything
    // else reads from (see application/SearchWorldUseCase.js), enriched
    // with what the World View actually needs to show a result and
    // act on it: a resolved position (Focus needs somewhere to send
    // the camera) and whether that position came from a real,
    // recorded PlacementRecord or the deterministic fallback grid
    // (0.2.24) — a real, meaningful distinction (see docs/Principles.md,
    // "Publication Found Is Not The Same As Placement Found"), not an
    // error state. Read-only, like every other navigation method here:
    // searching never loads, forks, or mutates anything by itself.
    //
    // 0.2.28: accepts either the original plain string (text-only,
    // unchanged) or an options object `{ text, center, radius }` —
    // `searchWorldByLocation` below is a thin convenience wrapper for
    // the center/radius-only case. The spatial filter runs HERE, after
    // enrichment, not inside SearchWorldUseCase: position resolution
    // already lives in this method (see _describeSearchResult), and a
    // pure discovery-layer use case has no reason to know about
    // placements at all — see docs/Principles.md, "A Spatial Query Is
    // Authoritative Over Placement, Not A Local-Cache Scan," for why
    // this still returns a real answer over whatever this node can
    // discover rather than merely "whatever happens to be nearby the
    // camera." Results are sorted nearest-first when a spatial filter
    // ran — the natural reading of a radius query — and left in
    // whatever order discovery returned them for a text-only one
    // (matching 0.2.26 — no ordering guarantee of its own).
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

    // Convenience for a PURE spatial query — "what's within `radius`
    // World Units of `center`," no text criterion at all. Equivalent
    // to `searchWorld({ center, radius })`; exists because "find
    // everything near this point" reads more clearly as its own named
    // operation than as a text search with the text left out (see
    // docs/Principles.md — spatial and text discovery are two kinds of
    // the same underlying query, not one shoehorned into the other).
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
    // World Location Browser (0.2.29)
    //
    // Lets a person explore a region of the world directly — by camera
    // position — instead of requiring they already know a document's
    // name or manually type coordinates into the Search panel. This is
    // deliberately NOT a second discovery mechanism: every method here
    // is a thin wrapper over searchWorldByLocation/searchWorld (0.2.28),
    // so there remains exactly one path — text/spatial query ->
    // discoveryProvider -> position enrichment -> distance/radius test
    // — and the location browser just gives it a camera-driven entry
    // point and a couple of read-only conveniences on top. Nothing in
    // this section moves a placement, edits a document, forks anything,
    // or publishes — it only ever looks (see docs/Principles.md,
    // "Navigation Never Implies Editing," 0.2.27, which this section
    // extends to exploration as well as to focus/select).
    // -----------------------------------------------------------------

    // Explicit center/radius exploration — the same enriched spatial
    // result shape 0.2.28 established (position, hasPlacement,
    // distance), just under a name that reads as "look around this
    // location" rather than "search." `searchWorldByLocation` still
    // resolves WHICH documents come back — that resolution path is
    // completely unchanged from 0.2.29. What's new in 0.2.30 is the
    // return shape: `{ documents, diagnostics }` rather than a bare
    // array, so a caller can show what was found AND what the trust
    // layer (if any is wired) has to say about how it was found,
    // without the two ever being confused for one thing. See
    // docs/Principles.md, "Discovery And Trust Are Related, But They
    // Are Not The Same Operation (0.2.30)."
    //
    // This is a deliberately narrower change than it might look: only
    // exploreLocation/exploreHere/whatsHere (all three brand new in
    // 0.2.29, with exactly one caller — WorldLocationBrowser — fully
    // owned by this codebase) gain the envelope. searchWorld/
    // searchWorldByLocation (0.2.26/0.2.28, the more established API
    // WorldSearchPanel depends on) keep returning a plain array,
    // unchanged — see docs/Architecture.md, 0.2.30, for why the two
    // were kept independent rather than unifying both under one
    // envelope shape in this pass.
    exploreLocation({ center, radius }) {
        const documents = this.searchWorldByLocation({ center, radius });
        const diagnostics = this._runSpatialDiscoveryDiagnostics(center, radius);
        return { documents, diagnostics };
    }

    // "Explore Here" — the query center is the CAMERA's current world
    // position, not the active document's placement. Per 0.2.27, camera
    // focus and active document are independent: the user may be
    // looking at empty space between two documents, with no active
    // document at all (or one that has nothing to do with where the
    // camera happens to be pointed), and still want to explore right
    // there. Returns an empty envelope if the session has no camera
    // state yet (nothing loaded) rather than falling back to some other
    // position — there is no "camera position" to explore from before
    // a world session exists, and no discovery query was even attempted
    // (diagnostics.available stays false, honestly — nothing ran).
    exploreHere(radius = DEFAULT_EXPLORE_RADIUS) {
        const center = this.getSpatialState().cameraPosition;
        if (!center) return { documents: [], diagnostics: summarizeDiscoveryDiagnostics(null) };
        return this.exploreLocation({ center, radius });
    }

    // "What's Here?" — a small-tolerance version of exploreHere, for
    // "what, if anything, is essentially at the camera's current
    // position" rather than "what's in the neighborhood." The design
    // doc suggested reusing getDocumentsAtPosition()'s exact-match
    // semantics directly; that method tests literal position equality
    // (via detectSpatialOverlap), which works for "what else occupies
    // this placement's exact spot" but never matches a continuous
    // camera coordinate — so this adapts the same intent to a radius
    // query with a deliberately small radius (NEARBY_RADIUS) instead of
    // reusing getDocumentsAtPosition() verbatim. It still shares
    // exploreHere/exploreLocation's single code path, so the adaptation
    // costs nothing in duplicated logic.
    whatsHere() {
        return this.exploreHere(NEARBY_RADIUS);
    }

    // 0.2.30: runs the OPTIONAL trust-capable spatialDiscoveryProvider
    // (if one is wired) over the same center/radius, purely to obtain
    // diagnostics — its own result (a PlacementRecord[]) is discarded;
    // exploreLocation's documents already came from
    // searchWorldByLocation and are not replaced or filtered by
    // anything this method finds. See the constructor's own comment
    // for why the two are kept decoupled.
    //
    // DecentralizedSpatialDiscoveryProvider.discover() THROWS for a
    // root/authority it cannot trust at all (untrusted signer,
    // equivocation under the default policy) — the correct behavior
    // for a caller that's about to treat the index as authoritative,
    // but exploreLocation is a read-only exploration call, not a
    // mutation gate, so that throw is caught here and turned into
    // `diagnostics.fatal` instead of propagating out of a UI action
    // that never expected to throw.
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

    // Read-only bundle for the Location Browser's "Inspect" action:
    // Document Info + Placement Info for `documentId`, exactly as
    // getDocumentInfo/getPlacementInfo already compute them — inspect
    // never forces a load. A location-browser result is, by definition,
    // usually a document this session hasn't loaded (that's the point
    // of finding it via search/explore rather than already having it
    // open), and getDocumentInfo only has data for a document current
    // loaded in this session (`getDocument(id)` must resolve) — loading
    // it just to inspect it would be a real side effect (renderer work,
    // network/storage reads) that a strictly read-only action should
    // not trigger on its own. So documentInfo may legitimately be null
    // here; the caller (WorldLocationBrowser) falls back to the
    // search/explore result's own already-known fields (title, author,
    // position, hasPlacement) when that happens. placementInfo is
    // independent of whether the document is loaded — it comes from
    // the placement registry — so it is often available even when
    // documentInfo is not.
    //
    // 0.2.30: `trust` — the specific TrustObservation (if any) recorded
    // for this document's placement during the MOST RECENT
    // exploreLocation/exploreHere/whatsHere call, looked up from the
    // raw diagnostics cached by _runSpatialDiscoveryDiagnostics above.
    // null whenever there is nothing to report: no diagnostics-capable
    // provider wired, this document's cell wasn't part of the last
    // query, or the document has no known placement at all. This is
    // deliberately NOT a fresh query — Inspect stays a read-only lookup
    // against what the last exploration already observed, not a reason
    // to run a whole new discovery pass.
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

    // Moves a placement to a new position — this is NOT a document
    // mutation: it never touches the Document/Publication, never
    // forks anything (see docs/Principles.md, "Moving A Placement Is
    // Not Editing A Document"), and applies even to a still-published,
    // un-forked snapshot's placement. Delegates the actual revision
    // (signed, causally-stamped — 0.2.10/0.2.16/0.2.18) to
    // MoveWorldPlacementUseCase; this method's job is purely resolving
    // WHICH placement "the document currently showing as documentId"
    // means.
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

    // Guard for selection-driven mutations (move/rotate/delete/align/
    // distribute/numeric transform/gizmo drags). Forks the CURRENT
    // selection's document in place when it is still published, and
    // updates `this._spatialSelection` (by reference, so every caller
    // already holding it — including a renderer gizmo drag armed via
    // gizmoPointerDown — sees the forked selection) to the equivalent
    // selection in the fork. A no-op when there is no selection or the
    // selection's document is already editable.
    _ensureEditableSelection() {
        if (!this._spatialSelection || this._spatialSelection.isEmpty) {
            return;
        }
        const sourceId = this._spatialSelection.documentId;
        if (!sourceId || !this._publishedDocumentIds.has(sourceId)) {
            return;
        }
        this._forkForEdit(sourceId);
    }

    // Guard for document-scoped mutations that are not selection-driven
    // (placement, groups, paste). Returns the documentId to actually
    // operate against — unchanged when already editable, the new
    // fork's id otherwise.
    _ensureEditableDocumentId(documentId) {
        if (!documentId || !this._publishedDocumentIds.has(documentId)) {
            return documentId;
        }
        return this._forkForEdit(documentId);
    }

    // The actual Copy-on-Write: forks `sourceDocumentId`, swaps this
    // session's view of it for the fork (the published source is
    // unloaded from this session — the mutation the caller is about to
    // perform must land on the fork, never on the source), and remaps
    // any live references (selection, focus, hover) that pointed at
    // the source. Returns the fork's documentId.
    //
    // Throws if the publication's fork policy forbids forking — the
    // mutation the caller is attempting is rejected, exactly like
    // ForkDocumentUseCase's existing enforcement (0.2.13), rather than
    // silently allowed or silently dropped.
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
            // Hardening (post-0.2.22): without this, the fork's bricks have no wired
            // eventBus, so every mutation after this one updates the
            // domain model correctly but never tells the renderer —
            // the mesh freezes wherever addWorld first placed it. Same
            // bus _loadWorld already passes to loadPublicationDocumentUseCase
            // for the source, and the one the active WorldRenderer
            // subscribed to in start().
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

        // 0.2.21: so the UI can say what just happened instead of the
        // document id silently changing underneath the user — see
        // consumeForkNotice() / WorldView's guarded().
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

    // fork policy (0.2.13): does the license governing `documentId`
    // permit forking at all? Enforced only when a Publication can
    // actually be resolved for it — no matching publication allows the
    // fork rather than introducing a new capability regression where
    // none existed before (matches ForkDocumentUseCase's own "only
    // enforce when a sourcePublication is known" behavior). In
    // practice this is only ever reached for documentIds
    // _isKnownPublication already confirmed, so the "no publication"
    // branch is defensive, not a live path.
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
        // 0.2.27: a fork only ever happens because a mutation targeted
        // sourceDocumentId — and every mutation path resolves its
        // target from _activeDocumentId (or a selection that itself
        // gets remapped below). Whichever one caused this fork, if it
        // was the active document, the fork must become the new active
        // document too — otherwise the very next mutation would
        // silently target a document that no longer exists in this
        // session's view (it was just superseded and unloaded).
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

    // 0.2.27: "which document would the next mutation land on" —
    // shared by _getActiveCommandHistory (undo/redo) and the history-
    // replay preview below, so both agree with every other mutation
    // path in this file instead of each independently guessing (the
    // group-ops methods above had exactly this kind of drift before
    // this milestone: two call sites resolving "the" document
    // differently, and disagreeing whenever selection and active
    // diverged). A non-empty selection wins — it's the more specific
    // answer — falling back to the active document, never the
    // camera-focused one.
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

	_loadWorld(documentId) {
	    const document = this._loadPublicationDocumentUseCase.execute(documentId, this._eventBus);
	    this._loadedDocuments.set(documentId, document);
	    // 0.2.20: a world streamed in this way is a published snapshot,
	    // immutable until (and unless) an edit forks it — see
	    // _ensureEditableSelection/_ensureEditableDocumentId — but only
	    // when a real Publication can be resolved for it. In real
	    // streaming usage (updateSpatialView) that is always true: a
	    // documentId only becomes visible/loadable in the first place
	    // because WorldLayoutProvider/discoveryProvider already know it
	    // as published. Without a discoveryProvider wired at all, this
	    // session has no way to tell a published world from any other
	    // loaded document, so it does not claim to — exactly the same
	    // "enforce only when we can" rule _checkForkPolicy already
	    // follows for license checks.
	    if (this._isKnownPublication(documentId)) {
	        this._publishedDocumentIds.add(documentId);
	    }
	    if (!this._focusedDocumentId) {
	        this._focusedDocumentId = documentId; // Set focus on first load
	    }
	    // 0.2.27: bootstrap the active document the same way — the very
	    // first thing streamed in has nothing else to be "instead of."
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
        // 0.2.27: a document that just left this session's view can't
        // remain the active (editing) document either — nothing would
        // be there for a mutation to land on.
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

	// 0.2.27: whenever a real (non-ground, non-empty) selection is set,
	// the document it belongs to BECOMES the active document — see
	// docs/Principles.md, "Camera Focus, Active Document, and Selection
	// Are Three Different Things." This is what makes "select a brick
	// in a different loaded document" and "editing always targets the
	// active document" the same guarantee instead of two separate
	// invariants that could drift apart: picking, marquee-select,
	// select-all, and selecting a group all funnel through this one
	// setter, so there is exactly one place this sync can happen, not
	// one per call site to keep in sync by hand.
	_setSpatialSelection(selection) {
	    this._spatialSelection = selection;
	    if (selection && !selection.isEmpty && selection.documentId) {
	        this._activeDocumentId = selection.documentId;
	    }
	    this._refreshEditingContext();
	    this._refreshInspection();
	}

    // 0.2.93 — renderer/PlacementMeshRegistry.js is keyed by placementId
    // alone, with no documentId of its own (see its own header) —
    // PickingService#pickPlacement() therefore only ever returns a bare
    // placementId, never which document it lives in. World View can
    // have MANY documents streamed in at once, each with zero or more
    // StructurePlacements, so a hit has to be resolved back to whichever
    // loaded document's World actually contains it. placementId is
    // minted per-instance (core/StructurePlacement.js, createId()),
    // never reused across placements, so the first match is the only
    // match. Returns null in the (defensive, shouldn't happen in
    // practice) case that the hit outlived its document — e.g. the
    // document streamed out between the raycast and this lookup.
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

    // 0.2.39 — deliberately minimal, unlike _setSpatialSelection: an
    // avatar interaction target has no editing context, no brick
    // inspection, no gizmo presentation to refresh — it is JUST an
    // identifier a caller (getAvatarInfo()) resolves fresh on demand.
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

    _refreshEditingContext() {
        if (!this._editingService) {
            this._spatialEditingContext = SpatialEditingContext.empty();
            return;
        }
        this._spatialEditingContext = this._editingService.getEditingContext(this._spatialSelection);
    }

    _refreshGizmo() {
        if (!this._session || !this._editingService || !this._gizmoUseCase) {
            return;
        }
        if (this._editingService.transformGizmoState.active) {
            return;
        }
        if (this.isPlacementMode()) {
            this._hideGizmo();
            return;
        }
        const presentation = this._gizmoUseCase.resolvePresentation(this._spatialSelection);
        if (!presentation) {
            this._hideGizmo();
            return;
        }
        const offset = this._getWorldPosition(this._spatialSelection.documentId);
        const worldPivot = {
            x: presentation.pivot.x + offset.x,
            y: presentation.pivot.y + offset.y,
            z: presentation.pivot.z + offset.z
        };
        const worldBounds = {
            min: {
                x: presentation.bounds.min.x + offset.x,
                y: presentation.bounds.min.y + offset.y,
                z: presentation.bounds.min.z + offset.z
            },
            max: {
                x: presentation.bounds.max.x + offset.x,
                y: presentation.bounds.max.y + offset.y,
                z: presentation.bounds.max.z + offset.z
            },
            center: worldPivot,
            size: presentation.bounds.size
        };
        this._showGizmo(worldPivot, worldBounds);
    }

    _hideGizmo() {
        if (typeof this._session?.hideGizmo === 'function') {
            this._session.hideGizmo();
        }
    }

    _showGizmo(pivot, bounds) {
        if (typeof this._session?.showGizmo === 'function') {
            this._session.showGizmo(pivot, bounds);
        }
    }

    _updatePlacementPreview(hitResult) {
        if (!this._activeDefinitionId || !this._session) {
            return;
        }
        let existingBrick = null;
        let layoutOffset = null;
        // 0.2.27: ground-hover preview targets the ACTIVE document —
        // must agree with commitPlacement's own fallback, or the
        // preview would show a brick landing in one document while the
        // actual commit lands in another.
        let targetDocumentId = this._activeDocumentId;
        let targetBuildingId = null;
        if (hitResult.type === 'brick') {
            targetDocumentId = hitResult.documentId;
            targetBuildingId = hitResult.buildingId;
            const document = this._loadedDocuments.get(targetDocumentId);
            if (document) {
                const building = document.world.getBuilding(hitResult.buildingId);
                existingBrick = building?.findBrick(hitResult.brickId);
                layoutOffset = this._getWorldPosition(targetDocumentId);
            }
        } else if (hitResult.type === 'ground') {
            if (targetDocumentId) {
                layoutOffset = this._getWorldPosition(targetDocumentId);
            }
        }
        if (!targetDocumentId || !layoutOffset) {
            this._clearPlacementPreview();
            return;
        }
        const computed = this._placementService.calculateFromHit(
            hitResult,
            this._activeDefinitionId,
            existingBrick,
            layoutOffset,
            { gridSnapEnabled: true, gridSnapSize: 1 }
        );
        if (!computed.valid) {
            this._clearPlacementPreview();
            return;
        }
        // 0.2.87 — the SAME PlacementValidator commitPlacement() itself
        // uses, run early so the ghost can be shown-but-tinted rather
        // than silently doing nothing on click. Building resolution
        // mirrors commitPlacement()'s own fallback exactly (targeted
        // building, or this document's first building) — see
        // core/PlacementValidator.js's own header for why exact-position
        // collision is the whole check, on purpose, for 0.2.87.
        const targetDocument = this._loadedDocuments.get(targetDocumentId);
        const resolvedBuildingId = targetBuildingId || targetDocument?.world.getBuildings()[0]?.id || null;
        const blocked = !resolvedBuildingId
            || !this._placementValidator.canPlace(targetDocument.world, resolvedBuildingId, computed.position);
        this._spatialPlacement = new SpatialPlacementState({
            valid: true,
            definitionId: computed.definitionId,
            position: computed.position,
            rotation: this._pendingPlacementRotation,
            blocked,
            targetDocumentId,
            targetBuildingId: computed.targetBuildingId
        });
        this._presentPlacementPreview();
    }

    // 0.2.87 — the one place that turns this._spatialPlacement into a
    // world-space showPreview() call, shared by _updatePlacementPreview()
    // (a fresh hover) and rotatePlacementPreview() (the same position,
    // a new rotation) so the two can never compute the terrain offset
    // differently. `terrainHeightAt()` is called directly from
    // core/TerrainHeightField.js, never through renderer.terrainHeightAt()
    // — the same discipline application/AvatarTerrainConstraint.js
    // already established (see its own header) — sampled ONCE at the
    // TARGET DOCUMENT's own placement position, mirroring
    // renderer/WorldRenderer.js#_terrainOffsetY() exactly: a whole
    // building rides the terrain as one rigid unit, so the brick you're
    // about to add must be lifted by the SAME offset the building's
    // already-committed bricks render with, never a second,
    // independently-sampled value. Before this, the ghost sat flush
    // with the document's local Y=0 plane while the real brick — the
    // instant it committed — visually jumped by the building's own
    // terrain lift.
    _presentPlacementPreview() {
        const placement = this._spatialPlacement;
        const layoutOffset = this._getWorldPosition(placement.targetDocumentId) || { x: 0, y: 0, z: 0 };
        const groundY = terrainHeightAt(DEFAULT_WORLD_SEED, layoutOffset.x, layoutOffset.z);
        const worldPos = {
            x: placement.position.x + layoutOffset.x,
            y: placement.position.y + layoutOffset.y + groundY,
            z: placement.position.z + layoutOffset.z
        };
        this._session.showPreview(placement.definitionId, worldPos, placement.rotation, !placement.blocked);
    }

    _clearPlacementPreview() {
        this._spatialPlacement = SpatialPlacementState.empty();
        if (this._session) {
            this._session.hidePreview();
        }
    }

    _toModifiers(rawEvent) {
        return {
            ctrl: rawEvent.ctrlKey || false,
            shift: rawEvent.shiftKey || false,
            alt: rawEvent.altKey || false,
            meta: rawEvent.metaKey || false
        };
    }

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
	    // 0.2.20: defense in depth — every guarded mutation already forks
	    // before marking a document dirty, so a still-published document
	    // should never reach here with anything to save. Refuse rather
	    // than silently persisting over the published source's storage
	    // slot (see docs/Principles.md, "A published snapshot is never
	    // mutated in place").
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
	        throw new Error('no restore configured'); // <--- ADD GUARD
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
	    if (this._session) {
	        if (this._historyPreview && this._historyPreview.active) {
	            this._session.removeWorld(this._historyPreview.world, `replay:${docId}`);
	            this._historyPreview = null;
	        } else {
	            this._session.removeWorld(doc.world, docId);
	        }
	        this._session.addWorld(restoredWorld, docId, this._worldLayoutProvider.getPosition(docId));
	    }
	
	    this.clearSelection();
	}
	
	copySelection() {
	    if (this._historyPreview && this._historyPreview.active) return SpatialClipboardState.empty(); // <-- ADD THIS
	    if (!this._copySelectionUseCase || !this._activeDocumentId) return SpatialClipboardState.empty();

	    // Prefer the document ID from the selection, fall back to the
	    // active document (0.2.27: never the camera-focused one).
	    const docId = (this._spatialSelection && this._spatialSelection.documentId) || this._activeDocumentId;
	    if (!docId) return SpatialClipboardState.empty();
	    
	    const doc = this.getDocument(docId);
	    if (!doc) return SpatialClipboardState.empty();
	    
	    this._pasteCount = 0; // Reset cascade count on new copy
	    this._clipboardState = this._copySelectionUseCase.execute(this._spatialSelection, doc);
	    return this._clipboardState;
	}
	
	// 3. Fix pasteClipboard to cascade offsets
	pasteClipboard() {
	    if (this._historyPreview && this._historyPreview.active) return false; // ADD THIS LINE
	    if (!this._pasteClipboardUseCase || !this._clipboardState || this._clipboardState.isEmpty) return false;
	    this._activeDocumentId = this._ensureEditableDocumentId(this._activeDocumentId);
	    const doc = this.getDocument(this._activeDocumentId);
	    if (!doc) return false;
	    const buildingId = doc.world.getBuildings()[0]?.id;
	    if (!buildingId) return false;
	    if (!this._pasteCount) this._pasteCount = 0;
	    this._pasteCount++;
	    const offset = { x: 2 * this._pasteCount, y: 0, z: 2 * this._pasteCount };
	    const command = this._pasteClipboardUseCase.execute(this._clipboardState, {
	        worldId: doc.world.id, buildingId, position: offset
	    });
	    if (command) {
	        this._commandHistories.get(doc.world.id).execute(command);
	        
	        // Automatically select the newly pasted bricks
	        if (command.executedBrickIds && command.executedBrickIds.length > 0) {
	            const items = command.executedBrickIds.map(brickId => ({ type: 'brick', buildingId, brickId }));
	            this._setSpatialSelection(SpatialSelectionState.bricks({
	                documentId: doc.world.id,
	                items
	            }));
	        }
	        return true;
	    }
	    return false;
	}
	
	// 0.4.7 — Ctrl/Cmd+D for a loose brick selection in World View
	// (previously copy/paste only). A structure-placement selection is
	// deliberately a no-op here, the same way move/rotate/delete already
	// are for one (see SpatialEditingService#getEditingContext()'s own
	// header) — World View has never had placement mutation, only
	// placement inspection and NEW-structure placement (0.2.93's
	// "Selection In World View Does Not Imply Editing Authority"); this
	// milestone closes the brick-selection gap without opening that one.
	// _ensureEditableSelection() is deleteSelection()'s own guard
	// (fork-on-write for a selection into a published document), not
	// pasteClipboard()'s _ensureEditableDocumentId — duplicate reads FROM
	// the selection's own source bricks, so it needs the selection guard.
	duplicateSelection() {
	    if (this._historyPreview && this._historyPreview.active) return null;
	    this._ensureEditableSelection();
	    if (!this._spatialEditingContext || this._spatialEditingContext.isEmpty) {
	        return null;
	    }
	    const newId = this._duplicateBrickSelection(this._spatialSelection);
	    if (newId) {
	        this._refreshGizmo();
	    }
	    return newId;
	}

	// 0.4.7 — see EditorSession#_duplicateBrickSelection()'s own header:
	// identical shape, reused across both surfaces. Deliberately builds a
	// throwaway clipboard local to this call rather than routing through
	// this._copySelectionUseCase-backed copySelection()/pasteClipboard()
	// — those mutate this._clipboardState/_pasteCount, and a Ctrl+D must
	// never clobber whatever the user actually has copied.
	_duplicateBrickSelection(selection) {
	    if (!selection || selection.isEmpty || !this._copySelectionUseCase || !this._pasteClipboardUseCase) {
	        return null;
	    }
	    const docId = selection.documentId || this._activeDocumentId;
	    const doc = docId ? this.getDocument(docId) : null;
	    if (!doc) {
	        return null;
	    }
	    const clipboard = this._copySelectionUseCase.execute(selection, doc);
	    if (!clipboard || clipboard.isEmpty) {
	        return null;
	    }
	    const buildingId = selection.buildingId;
	    const command = this._pasteClipboardUseCase.execute(clipboard, {
	        worldId: doc.world.id, buildingId, position: { x: 2, y: 0, z: 2 }
	    });
	    if (!command) {
	        return null;
	    }
	    this._commandHistories.get(doc.world.id).execute(command);
	    if (command.executedBrickIds.length > 0) {
	        const items = command.executedBrickIds.map((brickId) => ({ type: 'brick', buildingId, brickId }));
	        this._setSpatialSelection(SpatialSelectionState.bricks({ documentId: doc.world.id, items }));
	    }
	    return command.executedBrickIds[0] || null;
	}

	// 0.4.9 — "Repeat x N" for World View, mirroring duplicateSelection()'s
	// own guard shape one rung up: RepeatSelectionUseCase's own header
	// covers the atomicity/collision contract. false means either
	// "nothing to repeat" or "blocked by collision" — either way the
	// World is guaranteed untouched.
	repeatSelection(options = {}) {
	    if (this._historyPreview && this._historyPreview.active) return false;
	    this._ensureEditableSelection();
	    if (!this._spatialEditingContext || this._spatialEditingContext.isEmpty) {
	        return false;
	    }
	    const selection = this._spatialSelection;
	    if (!selection || selection.isEmpty || !this._repeatSelectionUseCase) {
	        return false;
	    }
	    const docId = selection.documentId || this._activeDocumentId;
	    const doc = docId ? this.getDocument(docId) : null;
	    if (!doc) {
	        return false;
	    }
	    const buildingId = selection.buildingId;
	    const command = this._repeatSelectionUseCase.execute(selection, doc, options);
	    if (!command) {
	        return false;
	    }
	    this._commandHistories.get(doc.world.id).execute(command);
	    const items = command.commands
	        .flatMap((child) => child.executedBrickIds)
	        .map((brickId) => ({ type: 'brick', buildingId, brickId }));
	    if (items.length > 0) {
	        this._setSpatialSelection(SpatialSelectionState.bricks({ documentId: doc.world.id, items }));
	    }
	    this._refreshGizmo();
	    return true;
	}

	cloneDocument(documentId) {
	    const doc = this.getDocument(documentId || this._activeDocumentId);
	    if (!doc) throw new Error('no loaded document');
	    const clone = this._documentCloneService.execute(doc, { eventBus: this._eventBus });
	    this._loadedDocuments.set(clone.world.id, clone);
	    
	    const history = new CommandHistory({ world: clone.world });
	    history.markUnsaved(); // <--- ADD THIS LINE (matches forkDocument behavior)

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
	// 1. Fix restoreHistoryAt (Update the fake documentManager to include load/state)
	getGroups() {
	    const doc = this.getDocument(this._activeDocumentId);
	    if (!doc) return [];
	    const world = doc.world || doc;
	    const groups = typeof world.getGroups === 'function' ? world.getGroups() : (world.groups || []);
	    return groups.map(g => ({ id: g.id, name: g.name, memberCount: g.memberCount || (g.brickIds ? g.brickIds.length : 0) }));
	}
	// 0.2.27: resolves the target document from the SELECTION itself
	// (already forked/remapped by _ensureEditableSelection above, if
	// it needed to be), never from a separately, independently forked
	// _activeDocumentId. Before this milestone these could be two
	// DIFFERENT documents — a selection in Bob's world while Alice's
	// happened to be active — and this method would fork BOTH
	// (needlessly forking Alice's) and then build the group command
	// from Alice's worldId with Bob's brick ids: a real, silent
	// cross-document corruption bug. Group membership is a selection-
	// scoped operation exactly like move/rotate/delete; it must use
	// the same source of truth they do.
	createGroupFromSelection(name) {
	    this._ensureEditableSelection();
	    if (this._spatialSelection.isEmpty) return null;
	    const doc = this.getDocument(this._spatialSelection.documentId);
	    if (!doc) return null;
	    const cmd = new CreateGroupCommand({ worldId: doc.world.id, brickIds: this._spatialSelection.brickIds, name });
	    this._commandHistories.get(doc.world.id).execute(cmd);
	    return cmd.executedGroupId;
	}
	selectGroup(groupId) {
	    const doc = this.getDocument(this._activeDocumentId);
	    if (!doc) return false;
	    const group = doc.world.getGroup(groupId);
	    if (!group) return false;
	    const items = [];
	    for (const brickId of group.brickIds) {
	        for (const building of doc.world.getBuildings()) {
	            if (building.findBrick(brickId)) {
	                items.push({ type: 'brick', buildingId: building.id, brickId });
	                break;
	            }
	        }
	    }
	    this._setSpatialSelection(SpatialSelectionState.bricks({ documentId: doc.world.id, items }));
	    return true;
	}
	addSelectionToSelectedGroup(groupId) {
	    this._ensureEditableSelection();
	    if (this._spatialSelection.isEmpty) return false;
	    const doc = this.getDocument(this._spatialSelection.documentId);
	    if (!doc) return false;
	    const cmd = new AddToGroupCommand({ worldId: doc.world.id, groupId, brickIds: this._spatialSelection.brickIds });
	    this._commandHistories.get(doc.world.id).execute(cmd);
	    return true;
	}
	removeSelectionFromSelectedGroup(groupId) {
	    this._ensureEditableSelection();
	    if (this._spatialSelection.isEmpty) return false;
	    const doc = this.getDocument(this._spatialSelection.documentId);
	    if (!doc) return false;
	    const cmd = new RemoveFromGroupCommand({ worldId: doc.world.id, groupId, brickIds: this._spatialSelection.brickIds });
	    this._commandHistories.get(doc.world.id).execute(cmd);
	    return true;
	}
	// groupId-targeted operations below have no selection of their own
	// to resolve a document from — they operate on the ACTIVE document
	// (0.2.27: never the camera-focused one).
	renameGroup(groupId, name) {
	    this._activeDocumentId = this._ensureEditableDocumentId(this._activeDocumentId);
	    const doc = this.getDocument(this._activeDocumentId);
	    if (!doc) return false;
	    this._commandHistories.get(doc.world.id).execute(new RenameGroupCommand({ worldId: doc.world.id, groupId, name }));
	    return true;
	}
	duplicateGroup(groupId) {
	    this._activeDocumentId = this._ensureEditableDocumentId(this._activeDocumentId);
	    const doc = this.getDocument(this._activeDocumentId);
	    if (!doc) return null;
	    const cmd = new DuplicateGroupCommand({ worldId: doc.world.id, groupId });
	    this._commandHistories.get(doc.world.id).execute(cmd);
	    return cmd.executedGroupId;
	}
	deleteGroup(groupId) {
	    this._activeDocumentId = this._ensureEditableDocumentId(this._activeDocumentId);
	    const doc = this.getDocument(this._activeDocumentId);
	    if (!doc) return false;
	    this._commandHistories.get(doc.world.id).execute(new DeleteGroupCommand({ worldId: doc.world.id, groupId }));
	    return true;
	}

	// -----------------------------------------------------------------
	// World Landmarks (0.3.7) — explicit, persistent World content.
	// -----------------------------------------------------------------
	//
	// Landmarks already appear in getWorldLocations() (kind: 'landmark',
	// see application/WorldLocationDirectory.js) for navigation/compass
	// purposes — focusLocation() already moves the camera to one, no
	// changes needed there. This section is only the MUTATION surface:
	// create, rename/redescribe, and remove, each an ordinary Command
	// executed through the exact same
	// this._commandHistories.get(worldId).execute(cmd) chokepoint every
	// other named World content type (Group, above) already uses — so
	// propagation (WorldCommandPropagationUseCase, wired once in
	// _registerCommandHistory) and undo/redo need zero landmark-specific
	// code. See core/WorldLandmark.js's own header and docs/Principles.md,
	// "A Landmark Is World Content, Not Spatial Presence (0.3.7)."
	//
	// getLandmark() is the one richer read: a WorldLocation deliberately
	// never carries description/authorIdentityId (core/WorldLocation.js)
	// or a worldId, so the Edit Landmark form reads the raw WorldLandmark
	// instead — searched across every loaded document (see
	// _resolveLandmarkOwner below), the same "world-wide, not just the
	// active document" scope getWorldLocations() already has, so the
	// form always has real title/description to prefill regardless of
	// which loaded World the landmark actually lives in. Returns null
	// when no loaded document currently has it.
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

	// "Place Here" — a landmark at the local avatar's own current
	// position, in the ACTIVE document's World (the world you're
	// actually working in, exactly like createGroupFromSelection/
	// renameGroup above — same _ensureEditableDocumentId fork-on-write
	// guard, same canEditDocument authorization gate the milestone
	// design calls for: "any EDIT member can modify World landmarks,"
	// never a separate LandmarkOwner/ACL concept).
	//
	// Requires a live avatar (see getAvatarPosition()'s own header) —
	// World View hides the Add Landmark affordance without one, but
	// this throws rather than silently doing nothing if called
	// directly. core/WorldLandmark.js stores X/Z as authoritative and
	// documents Y as "derived from terrain at render time," but (like
	// StructurePlacement's own position) the value actually stored here
	// is still the avatar's real, currently-correct Y. The avatar's own
	// position is in the shared/absolute layout space (see
	// application/WorldSpatialContextService.js, which compares it
	// directly against placement positions already offset the same
	// way) — this World's own layout offset (getDocumentPosition) must
	// be subtracted to get the LOCAL position WorldLandmark stores,
	// the exact inverse of the offset WorldLocationDirectory#
	// _landmarkLocationsFor() adds back for display.
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
	// World Regions (0.5.0) — explicit, persistent World content: a
	// named AREA (center + radius) rather than a landmark's single
	// point. Mirrors the World Landmarks section immediately above in
	// every structural respect — same Command chokepoint (so
	// propagation/undo/redo need zero region-specific code), same
	// world-wide "search every loaded document" resolution, same
	// canEditDocument() authorization gate, never a second
	// RegionOwner/ACL concept. See core/WorldRegion.js's own header and
	// docs/Principles.md, "Users Name Places; The World Derives
	// Geography From Names (0.5.0)."
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

	// "Name This Area" — a region CENTERED on the local avatar's own
	// current position, in the ACTIVE document's World, exactly the same
	// fork-on-write / authorization posture createLandmarkHere() already
	// established one section above. `radius` is required — unlike a
	// landmark's single point, an area has no meaningful default extent;
	// the caller (a form field, or a test) decides how big "here" means.
	// `kind`/`parentRegionId` are both optional: a region with no kind
	// picked defaults to RegionKind.PLACE, and a region with no parent
	// is exactly as valid as one nested three levels deep — see
	// core/WorldRegion.js's own header on why hierarchy is never
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

	// The currently signed-in identity's own did:key id, or null — a
	// small general-purpose accessor this milestone needed for
	// ui/components/PlaceNamingPanel.js to tell "my own claim" apart
	// from everyone else's without duplicating
	// identity/resolveSigningIdentityId.js's own tolerant lookup in the
	// UI layer.
	getMyIdentityId() {
	    return resolveSigningIdentityId(this._identityProvider);
	}

	// -----------------------------------------------------------------
	// Place Naming & Naming Claims (0.5.2) — deliberately NOT another
	// World Regions section above it. A WorldRegion's own `name` is
	// untouched by any of this and stays exactly what
	// core/WorldRegionGeography.js's regionsContaining()/describePlace()
	// read. What follows is a SEPARATE, additive layer: any identity —
	// not only a region's author, not even someone holding EDIT on the
	// World the region lives in — may publish a signed opinion about
	// what a region should be called (core/PlaceNamingClaim.js), and
	// this replica can locally prefer one name over whatever
	// core/PlaceNamingView.js's own ranking would otherwise show. See
	// docs/Principles.md, "A Name Is A Claim, Not A Fact (0.5.2)."
	//
	// Every method below degrades gracefully when
	// placeNamingClaimUseCase/localNamePreferenceStore were never wired
	// (every pre-0.5.2 caller, and every existing test): publish/retract
	// throw a clear "not available" error exactly like
	// grantWorldEdit()/revokeWorldEdit() already do without
	// worldMembershipUseCase, while the read methods return an empty/
	// null "nothing to show" result rather than throwing — a UI can
	// always safely call getPlaceNamingView()/getPreferredPlaceName()
	// without first checking whether naming claims are configured at
	// all.
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

	// -----------------------------------------------------------------
	// Decentralized Place Name Exchange (0.5.3) — the missing piece
	// 0.5.2 deliberately left for this milestone: HOW a claim this
	// replica published/discovered reaches, or is reached by, another
	// replica. See application/PlaceNamingClaimExchange.js's own header
	// for the full design; both methods below are thin delegations —
	// this session never validates, signs, or verifies anything itself.
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

	// The single name a caller (a map label, a Locations panel row)
	// should actually DISPLAY for a region, in priority order:
	//   1. this replica's own local preference, if one was ever set
	//   2. the top-ranked name from getPlaceNamingView() above, if
	//      anyone has published a claim at all
	//   3. the region's own WorldRegion.name — the exact 0.5.0 behavior
	//      every pre-0.5.2 caller already saw, untouched
	// Never throws, never returns an empty string for a region that
	// actually exists — the same "always something sensible to show"
	// guarantee getRegion() itself already offers.
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

	// Add these to EditorSession.js and WorldNavigationSession.js
	// They bridge the gap between the UI/Tests (which pass a groupId)
	// and the Action Registry (which relies on the internal selected state).
	
	addToGroupWithSelection(groupId) {
	    this._selectedGroupId = groupId;
	    return this.addSelectionToSelectedGroup(groupId);
	}
	
	removeFromGroupWithSelection(groupId) {
	    this._selectedGroupId = groupId;
	    return this.removeSelectionFromSelectedGroup(groupId);
	}
	
	// --- History Preview & Restore (0.1.39 / 0.1.41) ---
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
	            this._session.removeWorld(doc.world, docId);
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
        // 0.2.98 — an honest LEAVE for every World presence was entered
        // for, rather than relying solely on the eventual connection-
        // drop pruning every OTHER replica's own WorldPresenceUseCase
        // performs — see application/WorldPresenceUseCase.js's own
        // header.
        if (this._worldPresenceUseCase) {
            for (const documentId of this._presentWorldDocumentIds) {
                this._worldPresenceUseCase.leaveWorld(documentId);
            }
        }
        this._presentWorldDocumentIds.clear();
        // 0.3.0 — the identical honest-LEAVE discipline, one rung
        // further: also tears down this session's own render-driving
        // subscriptions and removes every marker it ever added to the
        // scene, so a disposed session leaves no stale Object3Ds behind.
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
        this._avatarControlModeActive = false;
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
        this._editingService = null;
        this._gizmoUseCase = null;
        this._placementService = null;
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
        this._spatialPlacement = SpatialPlacementState.empty();
        this._activeDefinitionId = null;
        this._pendingPlacementRotation = 0;
        this._focusedDocumentId = null;
        this._activeDocumentId = null;
        this._eventBus = null;
    }
}
