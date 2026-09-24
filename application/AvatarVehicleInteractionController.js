import { DEFAULT_WORLD_SEED, terrainHeightAt } from '../core/TerrainHeightField.js';
import { VehicleType } from '../core/VehicleType.js';
import {
    AvatarVehicleInteractionIntent,
    deriveAvatarVehicleInteractionIntent
} from '../core/AvatarVehicleInteractionIntent.js';
import {
    resolveAvatarVehicleInteractionTarget
} from '../core/AvatarVehicleInteractionTarget.js';
import { createAvatarVehicleMount } from '../core/AvatarVehicleMount.js';
import { deriveAvatarVehicleMount } from '../core/AvatarVehicleMountTransition.js';
import {
    deriveAvatarVehicleDismountIntent
} from '../core/AvatarVehicleDismountIntent.js';
import {
    resolveAvatarVehicleDismountPosition
} from '../core/AvatarVehicleDismountPosition.js';
import {
    isAvatarVehicleDismountPositionClear
} from '../core/AvatarVehicleDismountClearance.js';
import {
    deriveAvatarVehicleDismountTransition
} from '../core/AvatarVehicleDismountTransition.js';
import { VEHICLE_INTERACTION_RADIUS } from '../core/AvatarVehicleProximity.js';
import { vehiclePresenceInRegion } from '../core/VehiclePlacement.js';
import { treeCollisionCandidatesForMovement } from '../core/AvatarTreeCollisionQuery.js';
import { InventoryEntryKind } from '../core/AvatarInventory.js';
import { AvatarInventoryStore } from './AvatarInventoryStore.js';
import { deriveAvatarVehicleStoreIntent } from '../core/AvatarVehicleStoreIntent.js';
import { deriveAvatarVehicleDeployIntent } from '../core/AvatarVehicleDeployIntent.js';
import { deriveAvatarVehicleStoreTransition } from '../core/AvatarVehicleStoreTransition.js';
import { deriveAvatarVehicleDeployTransition } from '../core/AvatarVehicleDeployTransition.js';
import { VehicleInstance } from '../core/VehicleInstance.js';
import { createId } from '../core/createId.js';

// Runs the core mount/dismount (and store/deploy) chain at runtime. It holds no
// policy of its own: every decision is made by the pure core/ functions it
// calls. It only supplies where the avatar is, which vehicles are nearby, and
// when to ask.
//
// Keys are polled from held state once per frame, like AvatarMovementController,
// so browser auto-repeat never counts as new presses. One key ('e') means mount
// when unmounted and dismount when mounted; `_interactKeyConsumed` limits each
// physical press to one transition, otherwise the tick after a dismount would
// immediately remount the vehicle still within reach.
//
// `mount` lives here: growing AvatarPresence with a `mountedVehicleId` was explicitly
// rejected (see core/AvatarVehicleMount.js), and AvatarMovementController only
// owns movement keys and kinematics.
//
// Once mounted, the vehicle is found by identity in VehicleRuntimeInstances (its
// current position), never by re-querying spawn positions around the avatar. A
// ridden vehicle's position differs from its spawn point. Mount targeting also
// merges tracked vehicles at their current positions. Without a runtime store,
// lookups fall back to the deterministic spawn query.

export class AvatarVehicleInteractionController {
    constructor(avatarPresenceSession, { seed = DEFAULT_WORLD_SEED, vehicleRuntimeInstances = null, avatarInventoryStore = null } = {}) {
        this._avatarPresenceSession = avatarPresenceSession;
        this._seed = seed;
        // Shared with AvatarAnimalInteractionController in a real session; a private
        // store otherwise.
        this._inventoryStore = avatarInventoryStore || new AvatarInventoryStore();
        // Optional; without it lookups fall back to the deterministic spawn query.
        this._vehicleRuntimeInstances = vehicleRuntimeInstances;
        this._interactKeyHeld = false;
        // Set once a press causes a transition; cleared on key release.
        this._interactKeyConsumed = false;
        this._mount = null;
        this._storeKeyHeld = false;
        this._storeKeyConsumed = false;
        // null means the most recent entry.
        this._selectedEntryId = null;
        this._cyclePreviousKeyHeld = false;
        this._cyclePreviousKeyConsumed = false;
        this._cycleNextKeyHeld = false;
        this._cycleNextKeyConsumed = false;
    }

    mount() {
        return this._mount;
    }

    inventory() {
        return this._inventoryStore.get();
    }

    // VehicleType.NONE when not mounted, never null. Read each frame by
    // WorldNavigationSession to resolve the movement capability.
    mountedVehicleType() {
        if (!this._avatarPresenceSession || this._mount === null) {
            return VehicleType.NONE;
        }
        const avatarPosition = this._avatarPresenceSession.current.position;
        const vehicle = this._currentMountedVehicle(avatarPosition);
        return vehicle ? vehicle.type : VehicleType.NONE;
    }

    // Read-only preview of what 'e' would do now, for the UI prompt:
    //
    //   mounted                  { mounted: true,  vehicleType, targetVehicleId: null }
    //   a vehicle in range       { mounted: false, vehicleType, targetVehicleId }
    //   nothing in range         { mounted: false, vehicleType: NONE, targetVehicleId: null }
    //
    // Asks the same target resolution with intent forced to MOUNT, purely as a
    // preview. Never called from tick().
    vehicleInteractionState() {
        if (!this._avatarPresenceSession) {
            return Object.freeze({ mounted: false, vehicleType: VehicleType.NONE, targetVehicleId: null });
        }
        if (this._mount !== null) {
            return Object.freeze({
                mounted: true,
                vehicleType: this.mountedVehicleType(),
                targetVehicleId: null
            });
        }
        const avatarPosition = this._avatarPresenceSession.current.position;
        const vehicles = this._nearbyVehicles(avatarPosition);
        const { targetVehicleId } = resolveAvatarVehicleInteractionTarget({
            avatarPosition,
            vehicles,
            interactionIntent: AvatarVehicleInteractionIntent.MOUNT
        });
        const targetVehicle = targetVehicleId
            ? vehicles.find((vehicle) => vehicle.id === targetVehicleId)
            : null;
        return Object.freeze({
            mounted: false,
            vehicleType: targetVehicle ? targetVehicle.type : VehicleType.NONE,
            targetVehicleId
        });
    }

    // Read-only preview for the store/deploy prompt: canStore/canDeploy, the type
    // that would be stored or deployed, carriedCount and the 1-based selectedIndex.
    // Counts VEHICLE entries only: the inventory also holds animals, which must not
    // count or become the selection. Never called from tick().
    storeInteractionState() {
        if (!this._avatarPresenceSession) {
            return Object.freeze({ canStore: false, canDeploy: false, vehicleType: VehicleType.NONE, carriedCount: 0, selectedIndex: null });
        }
        const inventory = this._inventoryStore.get();
        if (this._mount !== null) {
            return Object.freeze({
                canStore: true,
                canDeploy: false,
                vehicleType: this.mountedVehicleType(),
                carriedCount: inventory.entriesOf(InventoryEntryKind.VEHICLE).length,
                selectedIndex: null
            });
        }
        const entry = inventory.resolve(this._selectedEntryId, InventoryEntryKind.VEHICLE);
        const carriedVehicles = inventory.entriesOf(InventoryEntryKind.VEHICLE);
        const selectedIndex = entry
            ? carriedVehicles.findIndex((carried) => carried.id === entry.id) + 1
            : null;
        return Object.freeze({
            canStore: false,
            canDeploy: entry !== null,
            vehicleType: entry ? entry.type : VehicleType.NONE,
            carriedCount: carriedVehicles.length,
            selectedIndex
        });
    }

    // Returns whether `key` is handled, so the caller knows to swallow the event.
    keyDown(key) {
        return this._setKey(key, true);
    }

    keyUp(key) {
        return this._setKey(key, false);
    }

    // Releases held keys but keeps `mount`: losing focus must never dismount.
    releaseAll() {
        this._interactKeyHeld = false;
        this._interactKeyConsumed = false;
        this._storeKeyHeld = false;
        this._storeKeyConsumed = false;
        this._cyclePreviousKeyHeld = false;
        this._cyclePreviousKeyConsumed = false;
        this._cycleNextKeyHeld = false;
        this._cycleNextKeyConsumed = false;
    }

    // Called once per frame alongside AvatarMovementController#tick().
    tick() {
        if (!this._avatarPresenceSession) {
            return;
        }
        const requested = this._interactKeyHeld && !this._interactKeyConsumed;
        if (this._mount === null) {
            this._tickMount(requested);
        } else {
            this._tickDismount(requested);
        }
        const storeRequested = this._storeKeyHeld && !this._storeKeyConsumed;
        if (this._mount === null) {
            this._tickDeploy(storeRequested);
        } else {
            this._tickStore(storeRequested);
        }
        if (this._cyclePreviousKeyHeld && !this._cyclePreviousKeyConsumed) {
            this._cycleSelection(-1);
            this._cyclePreviousKeyConsumed = true;
        }
        if (this._cycleNextKeyHeld && !this._cycleNextKeyConsumed) {
            this._cycleSelection(1);
            this._cycleNextKeyConsumed = true;
        }
    }

    _tickMount(requested) {
        const avatarPosition = this._avatarPresenceSession.current.position;
        const interactionIntent = deriveAvatarVehicleInteractionIntent({
            mountRequested: requested
        });
        const vehicles = this._nearbyVehicles(avatarPosition);
        const { targetVehicleId } = resolveAvatarVehicleInteractionTarget({
            avatarPosition,
            vehicles,
            interactionIntent
        });
        const nextMount = deriveAvatarVehicleMount({
            currentMount: this._mount,
            interactionIntent,
            targetVehicleId
        });
        if (nextMount !== this._mount) {
            this._interactKeyConsumed = true;
        }
        this._mount = nextMount;
    }

    // Once mounted, the vehicle's current runtime position is the authority for
    // the dismount destination, never its spawn position.
    _tickDismount(requested) {
        const currentPosition = this._avatarPresenceSession.current.position;
        const vehicle = this._currentMountedVehicle(currentPosition);

        // A drone in the air cannot be dismounted. Decided here from the vehicle's
        // committed Y vs. terrain height, so the core dismount transition stays
        // vehicle-agnostic.
        const airborne = vehicle !== null
            && vehicle.type === VehicleType.DRONE
            && vehicle.position.y > terrainHeightAt(this._seed, vehicle.position.x, vehicle.position.z) + 0.5;

        const dismountIntent = deriveAvatarVehicleDismountIntent({
            dismountRequested: airborne ? false : requested
        });
        const dismountPosition = vehicle
            ? resolveAvatarVehicleDismountPosition(vehicle)
            : null;
        const destinationClearance = dismountPosition
            ? isAvatarVehicleDismountPositionClear({
                position: dismountPosition,
                treeCollisions: treeCollisionCandidatesForMovement({
                    seed: this._seed,
                    currentPosition: dismountPosition,
                    requestedPosition: dismountPosition
                })
            })
            : null;

        const transition = deriveAvatarVehicleDismountTransition({
            currentMount: this._mount,
            currentPosition,
            dismountIntent,
            dismountPosition,
            destinationClearance
        });
        if (transition.mount !== this._mount) {
            this._interactKeyConsumed = true;
        }
        this._mount = transition.mount;
        if (transition.position !== currentPosition) {
            const current = this._avatarPresenceSession.current;
            this._avatarPresenceSession.update({
                position: transition.position,
                rotation: current.rotation,
                animation: current.animation
            });
        }
    }

    // Removes the stored vehicle from the world via VehicleRuntimeInstances#discard(),
    // the effect the pure transition does not perform.
    _tickStore(requested) {
        const avatarPosition = this._avatarPresenceSession.current.position;
        const vehicle = this._currentMountedVehicle(avatarPosition);
        const storeIntent = deriveAvatarVehicleStoreIntent({ storeRequested: requested });
        const transition = deriveAvatarVehicleStoreTransition({
            currentMount: this._mount,
            currentInventory: this._inventoryStore.get(),
            storeIntent,
            vehicleId: vehicle ? vehicle.id : null,
            vehicleType: vehicle ? vehicle.type : null
        });
        if (transition.mount !== this._mount) {
            this._storeKeyConsumed = true;
            if (this._vehicleRuntimeInstances && vehicle) {
                this._vehicleRuntimeInstances.discard(vehicle.id);
            }
        }
        this._mount = transition.mount;
        this._inventoryStore.set(transition.inventory);
    }

    // Performs what the pure transition leaves to its caller: mints an id (a
    // deployed vehicle has no placement slot to derive one from), creates the
    // VehicleInstance at the avatar, registers it, then mounts it. Requires a
    // runtime store; without one the press is a no-op. Clears the selection after
    // deploying.
    _tickDeploy(requested) {
        if (!this._vehicleRuntimeInstances) {
            return;
        }
        const deployIntent = deriveAvatarVehicleDeployIntent({ deployRequested: requested });
        const transition = deriveAvatarVehicleDeployTransition({
            currentMount: this._mount,
            currentInventory: this._inventoryStore.get(),
            deployIntent,
            selectedEntryId: this._selectedEntryId
        });
        this._inventoryStore.set(transition.inventory);
        if (transition.entry === null) {
            return;
        }
        this._storeKeyConsumed = true;
        this._selectedEntryId = null;
        const avatarPosition = this._avatarPresenceSession.current.position;
        const instance = new VehicleInstance({
            id: createId(),
            type: transition.entry.type,
            spawnPosition: avatarPosition,
            position: avatarPosition
        });
        this._vehicleRuntimeInstances.add(instance);
        this._mount = createAvatarVehicleMount(instance.id);
    }

    // Steps the selection through VEHICLE entries only; changes which entry a
    // future deploy uses, never deploys.
    _cycleSelection(direction) {
        const inventory = this._inventoryStore.get();
        const entry = direction === 1
            ? inventory.next(this._selectedEntryId, InventoryEntryKind.VEHICLE)
            : inventory.previous(this._selectedEntryId, InventoryEntryKind.VEHICLE);
        this._selectedEntryId = entry ? entry.id : null;
    }

    // Deterministic fallback: the vehicle as found near its spawn point. Returns
    // null once the avatar is out of range of that spawn point.
    _findMountedVehicle(avatarPosition) {
        const vehicles = this._nearbyVehicles(avatarPosition);
        return vehicles.find((vehicle) => vehicle.id === this._mount.vehicleId) || null;
    }

    // Identity first: looks up the mounted vehicle in the runtime store. Falls back
    // to the spawn query only without a store, or in the first frame before the
    // store has discovered the vehicle (which cannot have moved yet, so its spawn
    // position is still correct).
    _currentMountedVehicle(avatarPosition) {
        if (this._mount === null) {
            return null;
        }
        if (this._vehicleRuntimeInstances) {
            const tracked = this._vehicleRuntimeInstances.get(this._mount.vehicleId);
            if (tracked) {
                return tracked;
            }
        }
        return this._findMountedVehicle(avatarPosition);
    }

    // Deterministic candidates within a square around the avatar (a superset of the
    // interaction circle), minus vehicles the store has excluded (stored ones, which
    // the placement query cannot know about), merged after already-tracked vehicles
    // at their current positions (tracked entries win by id). Never calls sync():
    // its eviction radius is the render radius, so calling it here would evict
    // vehicles the renderer still needs.
    _nearbyVehicles(avatarPosition) {
        const rawDeterministic = vehiclePresenceInRegion(
            this._seed,
            avatarPosition.x - VEHICLE_INTERACTION_RADIUS,
            avatarPosition.z - VEHICLE_INTERACTION_RADIUS,
            avatarPosition.x + VEHICLE_INTERACTION_RADIUS,
            avatarPosition.z + VEHICLE_INTERACTION_RADIUS
        );
        if (!this._vehicleRuntimeInstances) {
            return rawDeterministic;
        }
        const deterministic = rawDeterministic.filter((vehicle) => !this._vehicleRuntimeInstances.isExcluded(vehicle.id));
        const tracked = this._vehicleRuntimeInstances.nearby(avatarPosition, VEHICLE_INTERACTION_RADIUS);
        const trackedIds = new Set(tracked.map((vehicle) => vehicle.id));
        return [...tracked, ...deterministic.filter((vehicle) => !trackedIds.has(vehicle.id))];
    }

    // Releasing re-arms `_interactKeyConsumed`.
    _setKey(key, isDown) {
        switch (String(key || '').toLowerCase()) {
            case 'e':
                this._interactKeyHeld = isDown;
                if (!isDown) {
                    this._interactKeyConsumed = false;
                }
                return true;
            case 'q':
                this._storeKeyHeld = isDown;
                if (!isDown) {
                    this._storeKeyConsumed = false;
                }
                return true;
            // '[' older, ']' newer: arrow keys steer and the wheel zooms the camera.
            case '[':
                this._cyclePreviousKeyHeld = isDown;
                if (!isDown) {
                    this._cyclePreviousKeyConsumed = false;
                }
                return true;
            case ']':
                this._cycleNextKeyHeld = isDown;
                if (!isDown) {
                    this._cycleNextKeyConsumed = false;
                }
                return true;
            default: return false;
        }
    }
}
