import { isValidAvatarVehicleMount } from './AvatarVehicleMount.js';
import { AvatarVehicleStoreIntent, isValidAvatarVehicleStoreIntent } from './AvatarVehicleStoreIntent.js';
import {
    AvatarInventory,
    InventoryEntryKind,
    createAvatarInventoryEntry,
    withEntryAdded
} from './AvatarInventory.js';
import { VehicleType, isValidVehicleType } from './VehicleType.js';
import { isNonEmptyString } from '../utils/typeGuards.js';

// 0.9.670 — Avatar Vehicle Store Transition.
//
// core/AvatarVehicleDismountTransition.js decides whether a mounted
// avatar should end up back on foot, beside the vehicle. This file
// decides the sibling question: should a mounted avatar's vehicle be put
// away into Avatar Inventory (core/AvatarInventory.js) instead — ending
// the mount exactly like dismounting does, but removing the vehicle from
// the world rather than parking it.
//
//   deriveAvatarVehicleStoreTransition({
//       currentMount, currentInventory, storeIntent, vehicleId, vehicleType
//   }) -> { mount, inventory }
//
// PURE, mirroring core/AvatarVehicleDismountTransition.js's own
// discipline exactly: no Math.random, no Date.now, no persisted state.
// The same five inputs always produce the same result.
//
// THE ONE RULE THIS FILE ADDS:
//
//   currentMount != null
//   AND storeIntent == STORE
//   AND vehicleId/vehicleType identify a real vehicle
//       -> mount: null, inventory: currentInventory + one new entry
//
// Every other combination leaves both fields exactly as they were —
// not mounted, no STORE intent, or no vehicle identified (the caller
// could not resolve what the avatar is actually mounted on) all fall
// through to `{ mount: currentMount, inventory: currentInventory }`,
// the exact unchanged pair, the same shape
// core/AvatarVehicleDismountTransition.js's own header already
// establishes for its own "nothing happens" branches.
//
// TAKES vehicleId/vehicleType, NEVER A VehicleInstance OR
// VehiclePresence. Exactly like core/AvatarVehicleMountTransition.js
// takes a target id rather than an object, this file never imports
// core/VehicleInstance.js or core/VehiclePresence.js, and never asks
// "is this actually the vehicle I'm mounted on" — `currentMount.vehicleId`
// is never compared against `vehicleId`. That question belongs upstream,
// to whatever call site resolved which vehicle the avatar is currently
// mounted on in the first place (ordinarily
// application/avatar/AvatarVehicleInteractionController.js's own
// `_currentMountedVehicle()`) — the identical restraint
// core/AvatarVehicleDismountTransition.js's own header already models
// for `dismountPosition`.
//
// A NEW INVENTORY ENTRY, NEVER A MUTATED ONE. The changed branch builds
// exactly one `AvatarInventoryEntry` of `InventoryEntryKind.VEHICLE`
// from `vehicleId`/`vehicleType`, and appends it via
// `withEntryAdded()` — core/AvatarInventory.js's own only way an entry
// is ever added. This file never touches `currentInventory.entries`
// directly.

export function deriveAvatarVehicleStoreTransition({
    currentMount = null,
    currentInventory,
    storeIntent,
    vehicleId = null,
    vehicleType = null
} = {}) {
    if (!isValidAvatarVehicleMount(currentMount)) {
        throw new Error(`deriveAvatarVehicleStoreTransition requires currentMount to be null or a valid AvatarVehicleMount, got ${JSON.stringify(currentMount)}`);
    }
    if (!(currentInventory instanceof AvatarInventory)) {
        throw new Error('deriveAvatarVehicleStoreTransition requires currentInventory to be an AvatarInventory instance');
    }
    if (!isValidAvatarVehicleStoreIntent(storeIntent)) {
        throw new Error(`deriveAvatarVehicleStoreTransition requires a valid storeIntent, got ${JSON.stringify(storeIntent)}`);
    }
    if (vehicleId !== null && !isNonEmptyString(vehicleId)) {
        throw new Error(`deriveAvatarVehicleStoreTransition requires vehicleId to be null or a non-empty string, got ${JSON.stringify(vehicleId)}`);
    }
    if (vehicleType !== null && !isValidVehicleType(vehicleType)) {
        throw new Error(`deriveAvatarVehicleStoreTransition requires vehicleType to be null or a valid VehicleType, got ${JSON.stringify(vehicleType)}`);
    }

    const unchanged = { mount: currentMount, inventory: currentInventory };

    if (currentMount === null) {
        return unchanged;
    }
    if (storeIntent !== AvatarVehicleStoreIntent.STORE) {
        return unchanged;
    }
    if (vehicleId === null || vehicleType === null || vehicleType === VehicleType.NONE) {
        return unchanged;
    }

    const entry = createAvatarInventoryEntry({
        id: vehicleId,
        kind: InventoryEntryKind.VEHICLE,
        type: vehicleType
    });
    return { mount: null, inventory: withEntryAdded(currentInventory, entry) };
}

// Deliberately not yet: comparing `currentMount.vehicleId` against
// `vehicleId` (see this file's own header); removing the vehicle from
// any runtime store (application/world/VehicleRuntimeInstances.js's own
// `discard()` is the caller's job — this file has no world/rendering
// awareness at all); deploy (its own mirror-image file,
// core/AvatarVehicleDeployTransition.js); id minting; capacity limits;
// avatar movement; collision; keyboard input; rendering; persistence;
// networking; randomness; the clock.
