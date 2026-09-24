import { AvatarAnimalReleaseIntent, isValidAvatarAnimalReleaseIntent } from './AvatarAnimalReleaseIntent.js';
import { AvatarInventory, InventoryEntryKind, withEntryRemoved } from './AvatarInventory.js';

// 0.9.700 — Avatar Animal Release Transition.
//
// The animal counterpart of core/AvatarVehicleDeployTransition.js — but
// SIMPLER in the same way core/AvatarAnimalCatchTransition.js is simpler
// than store: there is no mount state to gate on. A vehicle can only be
// deployed while unmounted (nowhere else for it to appear); an animal
// has no comparable "somewhere else to be" — an avatar can release an
// animal whether mounted on a vehicle or not, so this file takes no
// `currentMount` parameter at all.
//
//   deriveAvatarAnimalReleaseTransition({
//       currentInventory, releaseIntent, selectedEntryId
//   }) -> { entry, inventory }
//
// PURE. THE ONE RULE:
//
//   releaseIntent == RELEASE AND at least one ANIMAL entry is carried
//       -> entry: the resolved ANIMAL entry, inventory: that entry
//          removed
//
// `entry` is resolved via `currentInventory.resolve(selectedEntryId,
// InventoryEntryKind.ANIMAL)` — core/AvatarInventory.js's own single
// fallback rule, scoped to ANIMAL so this file can never resolve, and
// therefore never release, a carried VEHICLE — see that file's own
// header, "A shared inventory, not two parallel ones." No cycle-
// selection keys exist for animals yet (see
// application/avatar/AvatarAnimalInteractionController.js's own header for
// why), so `selectedEntryId` is always `null` from every real caller
// today; the parameter exists so this file's own contract already
// matches core/AvatarVehicleDeployTransition.js's shape, ready for that
// UI refinement without a signature change later.
//
// RETURNS AN ENTRY, NEVER SPAWNS ANYTHING. Exactly like
// core/AvatarVehicleDeployTransition.js's own header explains for
// itself: constructing a real, visible animal back in the world (an id,
// a position) is an application-layer EFFECT
// (application/avatar/AvatarAnimalInteractionController.js's own job), never
// this pure function's.
export function deriveAvatarAnimalReleaseTransition({
    currentInventory,
    releaseIntent,
    selectedEntryId = null
} = {}) {
    if (!(currentInventory instanceof AvatarInventory)) {
        throw new Error('deriveAvatarAnimalReleaseTransition requires currentInventory to be an AvatarInventory instance');
    }
    if (!isValidAvatarAnimalReleaseIntent(releaseIntent)) {
        throw new Error(`deriveAvatarAnimalReleaseTransition requires a valid releaseIntent, got ${JSON.stringify(releaseIntent)}`);
    }

    const unchanged = { entry: null, inventory: currentInventory };

    if (releaseIntent !== AvatarAnimalReleaseIntent.RELEASE) {
        return unchanged;
    }
    const entry = currentInventory.resolve(selectedEntryId, InventoryEntryKind.ANIMAL);
    if (entry === null) {
        return unchanged;
    }

    return { entry, inventory: withEntryRemoved(currentInventory, entry.id) };
}

// Deliberately not yet: a mount-state gate (see this file's own header —
// there is none to gate on); cycle-selection keys or any UI for picking
// a specific carried animal (a plausible follow-on once carrying several
// animals is a real, reported friction — the exact same order this
// codebase already shipped for vehicles: store/deploy first, cycle
// selection only once asked for); id minting or AnimalPresence
// construction (an application-layer job); catch (its own mirror-image
// file, core/AvatarAnimalCatchTransition.js); avatar position; keyboard
// input; rendering; persistence; networking; randomness; the clock.
