import { AvatarAnimalCatchIntent, isValidAvatarAnimalCatchIntent } from './AvatarAnimalCatchIntent.js';
import {
    AvatarInventory,
    InventoryEntryKind,
    createAvatarInventoryEntry,
    withEntryAdded
} from './AvatarInventory.js';
import { isValidAnimalSpecies } from './AnimalPresence.js';
import { isNonEmptyString } from '../utils/typeGuards.js';

// 0.9.700 — Avatar Animal Catch Transition.
//
// The animal counterpart of core/AvatarVehicleStoreTransition.js — but
// SIMPLER than that file in one real way: storing a vehicle first has to
// clear a mount (`currentMount != null` is part of its own rule), while
// catching an animal has no comparable prerequisite state to check. An
// avatar is never "on" an animal the way it can be mounted on a bicycle
// — catching is a single step straight from "an animal exists nearby"
// to "it's in my inventory," never a two-step mount-then-store.
//
//   deriveAvatarAnimalCatchTransition({
//       currentInventory, catchIntent, animalId, animalSpecies
//   }) -> { caught, inventory }
//
// PURE. THE ONE RULE:
//
//   catchIntent == CATCH AND animalId/animalSpecies identify a real
//   animal (both non-null)
//       -> caught: true, inventory: currentInventory + one new entry
//
// Every other combination — no CATCH intent, or no animal resolved (the
// caller found nothing in range) — leaves `inventory` exactly as it was
// and reports `caught: false`. `caught` exists so a caller (ordinarily
// application/avatar/AvatarAnimalInteractionController.js) knows WHETHER to
// also remove the animal from the world — this function has no world
// awareness of its own and never performs that removal itself, the same
// "decide, never perform the real-world effect" split every transition
// in this codebase's mount/dismount/store/deploy line already follows.
//
// TAKES animalId/animalSpecies, NEVER AN AnimalPresence. Exactly the
// discipline core/AvatarVehicleStoreTransition.js's own header already
// establishes for vehicleId/vehicleType: this file never imports
// core/AnimalPresence.js and never asks whether `animalId` is really the
// target `resolveAvatarAnimalCatchTarget()` just resolved — that
// question belongs upstream, to whatever call site already did the
// resolving.

export function deriveAvatarAnimalCatchTransition({
    currentInventory,
    catchIntent,
    animalId = null,
    animalSpecies = null
} = {}) {
    if (!(currentInventory instanceof AvatarInventory)) {
        throw new Error('deriveAvatarAnimalCatchTransition requires currentInventory to be an AvatarInventory instance');
    }
    if (!isValidAvatarAnimalCatchIntent(catchIntent)) {
        throw new Error(`deriveAvatarAnimalCatchTransition requires a valid catchIntent, got ${JSON.stringify(catchIntent)}`);
    }
    if (animalId !== null && !isNonEmptyString(animalId)) {
        throw new Error(`deriveAvatarAnimalCatchTransition requires animalId to be null or a non-empty string, got ${JSON.stringify(animalId)}`);
    }
    if (animalSpecies !== null && !isValidAnimalSpecies(animalSpecies)) {
        throw new Error(`deriveAvatarAnimalCatchTransition requires animalSpecies to be null or a real ANIMAL_SPECIES, got ${JSON.stringify(animalSpecies)}`);
    }

    if (catchIntent !== AvatarAnimalCatchIntent.CATCH) {
        return { caught: false, inventory: currentInventory };
    }
    if (animalId === null || animalSpecies === null) {
        return { caught: false, inventory: currentInventory };
    }

    const entry = createAvatarInventoryEntry({
        id: animalId,
        kind: InventoryEntryKind.ANIMAL,
        type: animalSpecies
    });
    return { caught: true, inventory: withEntryAdded(currentInventory, entry) };
}

// Deliberately not yet: comparing animalId against a resolved target
// (see this file's own header); removing the animal from any runtime
// store (application/world/AnimalRuntimeInstances.js's own job); release (its
// own mirror-image file, core/AvatarAnimalReleaseTransition.js); a
// taming difficulty, escape chance, or cooldown of any kind; capacity
// limits; avatar movement; collision; keyboard input; rendering;
// persistence; networking; randomness; the clock.
