import { isValidAvatarVehicleMount } from './AvatarVehicleMount.js';
import { AvatarVehicleDeployIntent, isValidAvatarVehicleDeployIntent } from './AvatarVehicleDeployIntent.js';
import { AvatarInventory, InventoryEntryKind, withEntryRemoved } from './AvatarInventory.js';
import { isNonEmptyString } from '../utils/typeGuards.js';

// 0.9.670 — Avatar Vehicle Deploy Transition.
//
// The mirror image of core/AvatarVehicleStoreTransition.js: given the
// avatar's current mount state, a deploy request, and its current
// inventory, decides WHETHER a carried vehicle should come out, and
// WHICH one — without ever minting an id or constructing a real
// VehicleInstance itself.
//
//   deriveAvatarVehicleDeployTransition({
//       currentMount, currentInventory, deployIntent
//   }) -> { entry, inventory }
//
// PURE, the same discipline every other transition in this line already
// follows. The same three inputs always produce the same result.
//
// THE ONE RULE THIS FILE ADDS:
//
//   currentMount == null
//   AND deployIntent == DEPLOY
//   AND currentInventory has at least one entry
//       -> entry: the most recently stored entry, inventory: that entry
//          removed
//
// Every other combination leaves both fields exactly as they were:
// already mounted (nowhere to put a second vehicle — mirrors
// core/AvatarVehicleMountTransition.js's own "already mounted is a
// no-op"), no DEPLOY intent, or nothing carried, all fall through to
// `{ entry: null, inventory: currentInventory }`.
//
// RETURNS AN ENTRY, NEVER A MOUNT. Unlike
// core/AvatarVehicleMountTransition.js, this file cannot hand back a
// real `AvatarVehicleMount` — a deployed vehicle has no pre-existing
// 0.9.74 vehicle id to mount onto; one has to be minted for whatever
// brand-new VehicleInstance is about to be created. That is an
// application-layer job (ordinarily
// application/avatar/AvatarVehicleInteractionController.js, using
// core/createId.js exactly like a hand-placed World/Building/Brick
// already does — see that file's own header on why a formula-derived id
// would be wrong here), never this file's. This function only ever
// answers "should a deploy happen, and which carried entry does it come
// from," identical in spirit to how
// core/AvatarVehicleDeployIntent.js's own header already draws the line
// at intent, not effect.
//
// POPS mostRecent() BY DEFAULT, OR A CALLER-CHOSEN ENTRY VIA
// `selectedEntryId` — 0.9.671 — Avatar Inventory Cycle Selection. Both
// paths go through the exact SAME `AvatarInventory#resolve()` this file
// never duplicates: `selectedEntryId: null` (the default — no cycle
// selection has ever been made) resolves to mostRecent(), the original
// LIFO behavior, byte-for-byte unchanged; a real id resolves to that
// specific entry when still carried, or falls back to mostRecent() when
// it is not (a stale selection — see AvatarInventory#resolve()'s own
// header). This file still never picks an entry by type or any other
// criterion of its own — selection itself is entirely
// application/avatar/AvatarVehicleInteractionController.js's own job (its
// cycle-selection keys), never a rule this pure transition invents.

export function deriveAvatarVehicleDeployTransition({
    currentMount = null,
    currentInventory,
    deployIntent,
    selectedEntryId = null
} = {}) {
    if (!isValidAvatarVehicleMount(currentMount)) {
        throw new Error(`deriveAvatarVehicleDeployTransition requires currentMount to be null or a valid AvatarVehicleMount, got ${JSON.stringify(currentMount)}`);
    }
    if (!(currentInventory instanceof AvatarInventory)) {
        throw new Error('deriveAvatarVehicleDeployTransition requires currentInventory to be an AvatarInventory instance');
    }
    if (!isValidAvatarVehicleDeployIntent(deployIntent)) {
        throw new Error(`deriveAvatarVehicleDeployTransition requires a valid deployIntent, got ${JSON.stringify(deployIntent)}`);
    }
    if (selectedEntryId !== null && !isNonEmptyString(selectedEntryId)) {
        throw new Error(`deriveAvatarVehicleDeployTransition requires selectedEntryId to be null or a non-empty string, got ${JSON.stringify(selectedEntryId)}`);
    }

    const unchanged = { entry: null, inventory: currentInventory };

    if (currentMount !== null) {
        return unchanged;
    }
    if (deployIntent !== AvatarVehicleDeployIntent.DEPLOY) {
        return unchanged;
    }
    // 0.9.700 UPDATE — scoped to InventoryEntryKind.VEHICLE. Once
    // core/AvatarInventory.js can also carry ANIMAL entries (0.9.700 —
    // Animal Catching), an unscoped resolve() could silently deploy the
    // avatar's own most-recently-CAUGHT animal instead of a vehicle —
    // see that file's own header, "A shared inventory, not two parallel
    // ones." Passing the kind here means this file's own default
    // behavior (mostRecent() among vehicles only) is unchanged from
    // 0.9.670, before ANIMAL ever existed.
    const entry = currentInventory.resolve(selectedEntryId, InventoryEntryKind.VEHICLE);
    if (entry === null) {
        return unchanged;
    }

    return { entry, inventory: withEntryRemoved(currentInventory, entry.id) };
}

// Deliberately not yet: id minting or VehicleInstance construction (an
// application-layer job — see this file's own header); registering a
// deployed vehicle into any runtime store
// (application/world/VehicleRuntimeInstances.js's own `add()` is the caller's
// job); constructing the resulting AvatarVehicleMount itself (the caller
// already has core/AvatarVehicleMount.js's own `createAvatarVehicleMount()`
// for that, once it has a real id); store (its own mirror-image file,
// core/AvatarVehicleStoreTransition.js); entry selection by type; avatar
// position or heading; keyboard input; rendering; persistence;
// networking; randomness; the clock.
