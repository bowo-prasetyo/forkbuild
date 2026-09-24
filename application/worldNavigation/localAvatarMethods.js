import { AvatarMovementController } from '../AvatarMovementController.js';
import { AvatarVehicleInteractionController } from '../AvatarVehicleInteractionController.js';
import { AvatarAnimalInteractionController } from '../AvatarAnimalInteractionController.js';
import { AvatarVehicleMovementController } from '../AvatarVehicleMovementController.js';
import { toAvatarPresenceAdvertisement } from '../../core/AvatarPresenceAdvertisement.js';
import { signAvatarPresenceAdvertisement } from '../PresenceSigning.js';
import { resolveAvatarVehicleMovementCapability } from '../../core/AvatarVehicleMovementCapability.js';
import {
    VehicleSteeringIntent, isValidVehicleSteeringIntent, createVehicleSteeringIntent
} from '../../core/VehicleSteeringIntent.js';
import { AvatarMovementConstraint } from '../AvatarMovementConstraint.js';
import { DEFAULT_MAX_STEP_HEIGHT } from '../../core/BrickWalkability.js';
import { AvatarTerrainConstraint } from '../AvatarTerrainConstraint.js';
import { AvatarStepConstraint } from '../AvatarStepConstraint.js';
import { AvatarTreeConstraint } from '../AvatarTreeConstraint.js';
import { AvatarWaterConstraint } from '../AvatarWaterConstraint.js';
import { AvatarWildlifeConstraint } from '../AvatarWildlifeConstraint.js';
import { ANIMAL_INTERACTION_RADIUS } from '../../core/AvatarAnimalCatchTarget.js';
import { AvatarVehicleBrakingIntent, deriveAvatarVehicleBrakingIntent } from '../../core/AvatarVehicleBrakingIntent.js';
import { deriveAvatarContinuousMovementInputEvent } from '../../core/AvatarContinuousMovementInputAdapter.js';
import { deriveAvatarContinuousMovementIntent } from '../../core/AvatarContinuousMovementIntent.js';
import { deriveAvatarContinuousMovementMode } from '../../core/AvatarContinuousMovementMode.js';
import { deriveAvatarVehicleBrakingInputFact } from '../../core/AvatarVehicleBrakingInputAdapter.js';
import { deriveVehicleSteeringInputEvent } from '../../core/VehicleSteeringInputAdapter.js';
import { SpatialBounds } from '../../core/SpatialBounds.js';

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

// WorldNavigationSession methods for the local avatar: setup and per-frame
// movement, the collision/terrain/step/tree/water/wildlife constraints, Avatar
// Control Mode and keyboard input (movement, vehicles, braking, steering,
// decorating), mounted-vehicle and inventory accessors, and spawn placement.
export const localAvatarMethods = {
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
    },

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
    },

    // Terrain is a pure function of (seed, x, z), so this needs no session
    // state; the constraint's defaults (DEFAULT_WORLD_SEED, default slope limit)
    // are what a real session wants.
    _buildAvatarTerrainConstraint() {
        return new AvatarTerrainConstraint();
    },

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
    },

    // Tree placement is a pure function of (seed, x, z); defaults suffice.
    _buildAvatarTreeConstraint() {
        return new AvatarTreeConstraint();
    },

    // Water depth is a pure function of (seed, x, z); defaults suffice.
    _buildAvatarWaterConstraint() {
        return new AvatarWaterConstraint();
    },

    // Animal placement is a pure function of (seed, x, z); defaults suffice.
    _buildAvatarWildlifeConstraint() {
        return new AvatarWildlifeConstraint();
    },

    // Whether Avatar Control Mode currently captures W/A/S/D/Shift/
    // Space — see avatarKeyDown/avatarKeyUp. An explicit toggle, never
    // implied by focus/hover, so typing in a search box can never
    // accidentally walk the avatar away — see the design doc's own
    // concern and docs/Principles.md.
    isAvatarControlModeActive() {
        return this._avatarControlModeActive;
    },

    // The local avatar's AvatarVehicleMount, or null when unmounted or when no
    // avatar exists.
    avatarVehicleMount() {
        return this._avatarVehicleInteractionController
            ? this._avatarVehicleInteractionController.mount()
            : null;
    },

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
    },

    // Pass-through to AvatarVehicleInteractionController#vehicleInteractionState();
    // null when no avatar exists.
    avatarVehicleInteractionState() {
        return this._avatarVehicleInteractionController
            ? this._avatarVehicleInteractionController.vehicleInteractionState()
            : null;
    },

    // Pass-through to AvatarVehicleInteractionController#storeInteractionState();
    // null when no avatar exists.
    avatarStoreInteractionState() {
        return this._avatarVehicleInteractionController
            ? this._avatarVehicleInteractionController.storeInteractionState()
            : null;
    },

    // Pass-through to AvatarAnimalInteractionController#catchInteractionState();
    // null when no avatar exists.
    avatarAnimalInteractionState() {
        return this._avatarAnimalInteractionController
            ? this._avatarAnimalInteractionController.catchInteractionState()
            : null;
    },

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
    },

    // Accessor for the transfer exchange, or null without a peer stack. The
    // caller reads carried entries from `avatarInventoryStore()` and calls
    // sendOffer()/acceptOffer()/declineOffer() directly; this session has no
    // transfer policy of its own.
    avatarInventoryTransferPeerExchange() {
        return this._avatarInventoryTransferPeerExchange;
    },

    // The local AvatarInventoryStore, exposed so a caller can list every carried
    // entry, not just the per-kind affordances.
    avatarInventoryStore() {
        return this._avatarInventoryStore;
    },

    // The one way `_vehicleSteeringIntent` is set; programmatic, not a key
    // binding. `intent` must be null (release) or a VehicleSteeringIntent;
    // anything else is treated as null. It only records the request; the frame
    // loop decides each frame whether a movable mounted vehicle applies it.
    setVehicleSteeringIntent(intent) {
        this._vehicleSteeringIntent = isValidVehicleSteeringIntent(intent) ? intent : null;
    },

    // Read-back of what setVehicleSteeringIntent() last recorded.
    vehicleSteeringIntent() {
        return this._vehicleSteeringIntent;
    },

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
    },

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
    },

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
    },

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
    },

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
    },

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
    },

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
    },

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
    },

    // Whether a local avatar was actually wired for this session (i.e.
    // someone was logged in when it started) — lets the UI decide
    // whether "Show My Avatar" is even a meaningful control to offer.
    hasLocalAvatar() {
        return Boolean(this._avatarProfileUseCase && this._avatarPresenceSession);
    },

    isLocalAvatarVisible() {
        return this._localAvatarVisible;
    },

    // Moves a never-moved local avatar (sequence 0) near where the camera is
    // about to focus, instead of world origin. Fires at most once per session,
    // on the first focusDocument(). After the avatar has moved, navigating the
    // camera never teleports it.
    _spawnAvatarNear(documentId, position) {
        if (!this._avatarPresenceSession || this._avatarPresenceSession.current.sequence !== 0) {
            return;
        }
        this._avatarPresenceSession.update({ position: this._safeSpawnPosition(documentId, position) });
    },

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
    },

    // A pure client rendering preference — see docs/Principles.md.
    // Never touches AvatarProfile or AvatarPresence; toggling it
    // twice in a row is a no-op exactly like every other purely
    // visual toggle in this codebase.
    setLocalAvatarVisible(visible) {
        this._localAvatarVisible = visible;
        if (this._session && typeof this._session.setLocalAvatarVisible === 'function') {
            this._session.setLocalAvatarVisible(visible);
        }
    },
};
