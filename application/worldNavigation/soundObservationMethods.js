// What World View's sound needs to know about the listener and the living
// things around it: where the listener is and which way the camera looks,
// the animals and residents within earshot and what they are doing, and
// which animals the avatar carries. Pure reads over state the session
// already keeps; see application/world/WorldSoundscapeService.js.
import { wildlifeInRegionAt, stationaryAnimalPoseAt } from '../../core/WildlifeMotion.js';
import { InventoryEntryKind } from '../../core/AvatarInventory.js';

// Nothing farther than this is heard (core/CreatureSoundCues.js).
export const CREATURE_EARSHOT = 30;

export const soundObservationMethods = {
    // Where sound is heard from and which way is "ahead": the avatar (else the
    // camera) and the camera's horizontal viewing direction, so what is on
    // the right of the screen is heard on the right. Null before a camera.
    soundListener() {
        if (!this._spatialCameraController) {
            return null;
        }
        const state = this._spatialCameraController.getSpatialCameraState();
        const position = this.getAvatarPosition()
            || { x: state.position.x, y: state.position.y, z: state.position.z };
        const dx = state.target.x - state.position.x;
        const dz = state.target.z - state.position.z;
        const length = Math.hypot(dx, dz);
        const forward = length > 1e-6 ? { x: dx / length, z: dz / length } : { x: 0, z: 1 };
        return { position, forward };
    },

    // Every animal within `radius` of `center` now: wild ones where they have
    // wandered to (caught ones left out), released ones and decorations where
    // they stand. Each is { id, species, x, z, moving, gaitPhase, idleAction }.
    animalsForSound(center, radius = CREATURE_EARSHOT) {
        if (!center) {
            return [];
        }
        const seed = this.getWorldSeed();
        const time = this._wildlifeClock();
        const animals = [];
        const wild = wildlifeInRegionAt(seed, center.x - radius, center.z - radius, center.x + radius, center.z + radius, time);
        for (const animal of wild) {
            if (this._animalRuntimeInstances && this._animalRuntimeInstances.isExcluded(animal.id)) {
                continue;
            }
            if (Math.hypot(animal.x - center.x, animal.z - center.z) > radius) {
                continue;
            }
            animals.push({
                id: animal.id, species: animal.species, x: animal.x, z: animal.z,
                moving: animal.moving, gaitPhase: animal.gaitPhase, idleAction: animal.idleAction
            });
        }
        const released = this._animalRuntimeInstances ? this._animalRuntimeInstances.releasedNearby(center, radius) : [];
        for (const instance of released) {
            const pose = stationaryAnimalPoseAt(seed, instance.id, instance.species, time);
            animals.push({
                id: instance.id, species: instance.species, x: instance.position.x, z: instance.position.z,
                moving: false, gaitPhase: 0, idleAction: pose.idleAction
            });
        }
        return animals;
    },

    // The animals the avatar carries, as { id, species }; empty without one.
    carriedAnimalsForSound() {
        if (!this._avatarInventoryStore) {
            return [];
        }
        return this._avatarInventoryStore.get().entriesOf(InventoryEntryKind.ANIMAL)
            .map((entry) => ({ id: entry.id, species: entry.type }));
    },

    // Residents within `radius` of `center` now: { id, x, z, moving }.
    residentsForSound(center, radius = CREATURE_EARSHOT) {
        if (!center) {
            return [];
        }
        return this._residentRuntime().posesNear(center, radius, this._wildlifeClock())
            .map((pose) => ({ id: pose.id, x: pose.x, z: pose.z, moving: Boolean(pose.moving) }));
    },

    // Everything the creature sounds read in one go (core/CreatureSoundCues.js).
    creatureSoundObservation() {
        const listener = this.soundListener();
        if (!listener) {
            return null;
        }
        return {
            listener,
            animals: this.animalsForSound(listener.position),
            carriedAnimals: this.carriedAnimalsForSound(),
            residents: this.residentsForSound(listener.position),
            residentSpeech: this.lastResidentSpeech()
        };
    }
};
