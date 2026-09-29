// What World View's sound needs to know about the listener and the living
// things around it: where the listener is and which way the camera looks,
// the animals, residents and other players within earshot and what they are
// doing, and which animals the avatar carries. Pure reads over state the
// session already keeps; see application/world/WorldSoundscapeService.js.
//
// Heights (`y`) are where things are drawn (terrain height added), so a 3D
// listener and its sources agree; horizontal positions are the session's own.
import { wildlifeInRegionAt, stationaryAnimalPoseAt } from '../../core/WildlifeMotion.js';
import { InventoryEntryKind } from '../../core/AvatarInventory.js';
import { terrainHeightAt } from '../../core/TerrainHeightField.js';

// Nothing farther than this is heard (core/CreatureSoundCues.js).
export const CREATURE_EARSHOT = 30;
// Ears above the feet, and a resident's mouth.
const EAR_HEIGHT = 1.6;
const RESIDENT_VOICE_HEIGHT = 1.5;
const ANIMAL_SOUND_HEIGHT = 0.5;

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

    // The listener for 3D sound, where things are drawn: at the avatar's ears
    // (else the camera), looking the way the camera looks, pitch included.
    // Null before a camera.
    soundListenerPose() {
        if (!this._spatialCameraController) {
            return null;
        }
        const state = this._spatialCameraController.getSpatialCameraState();
        const avatar = this.getAvatarPosition();
        let position;
        if (avatar) {
            // A rider's position already carries terrain height (docs/Architecture.md,
            // "Avatar movement constraint pipeline"); on foot it is added here.
            const ground = this._isRidingMovableVehicle() ? 0 : terrainHeightAt(this.getWorldSeed(), avatar.x, avatar.z);
            position = { x: avatar.x, y: ground + avatar.y + EAR_HEIGHT, z: avatar.z };
        } else {
            position = { x: state.position.x, y: state.position.y, z: state.position.z };
        }
        const dx = state.target.x - state.position.x;
        const dy = state.target.y - state.position.y;
        const dz = state.target.z - state.position.z;
        const length = Math.hypot(dx, dy, dz);
        const forward = length > 1e-6 ? { x: dx / length, y: dy / length, z: dz / length } : { x: 0, y: 0, z: 1 };
        // Up is world up made perpendicular to forward.
        const along = forward.y;
        const ux = -along * forward.x;
        const uy = 1 - along * forward.y;
        const uz = -along * forward.z;
        const upLength = Math.hypot(ux, uy, uz);
        const up = upLength > 1e-6 ? { x: ux / upLength, y: uy / upLength, z: uz / upLength } : { x: 0, y: 0, z: -1 };
        return { position, forward, up };
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
                id: animal.id, species: animal.species, x: animal.x, y: animal.y + ANIMAL_SOUND_HEIGHT, z: animal.z,
                moving: animal.moving, gaitPhase: animal.gaitPhase, idleAction: animal.idleAction
            });
        }
        const released = this._animalRuntimeInstances ? this._animalRuntimeInstances.releasedNearby(center, radius) : [];
        for (const instance of released) {
            const pose = stationaryAnimalPoseAt(seed, instance.id, instance.species, time);
            animals.push({
                id: instance.id, species: instance.species,
                x: instance.position.x, y: instance.position.y + ANIMAL_SOUND_HEIGHT, z: instance.position.z,
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

    // Residents within `radius` of `center` now: { id, x, y, z, moving }.
    residentsForSound(center, radius = CREATURE_EARSHOT) {
        if (!center) {
            return [];
        }
        const seed = this.getWorldSeed();
        return this._residentRuntime().posesNear(center, radius, this._wildlifeClock())
            .map((pose) => ({
                id: pose.id, x: pose.x, y: terrainHeightAt(seed, pose.x, pose.z) + RESIDENT_VOICE_HEIGHT, z: pose.z,
                moving: Boolean(pose.moving)
            }));
    },

    // Other players within `radius` of `center`, where they are drawn now:
    // { id, position (the presence's own, for footsteps), y (drawn height),
    // animation }. None while other avatars are hidden: you hear who you see.
    remoteAvatarsForSound(center, radius = CREATURE_EARSHOT) {
        if (!center || !this._remoteAvatarRegistry || !this._remoteAvatarsVisible) {
            return [];
        }
        const seed = this.getWorldSeed();
        const now = Date.now();
        const heard = [];
        for (const avatarId of this._remoteAvatarRegistry.knownAvatarIds()) {
            const presence = this._remoteAvatarRegistry.currentPresence(avatarId, now);
            if (!presence || !presence.position) continue;
            const { x, y, z } = presence.position;
            if (Math.hypot(x - center.x, z - center.z) > radius) continue;
            heard.push({
                id: avatarId,
                position: { x, y, z },
                y: terrainHeightAt(seed, x, z) + y,
                animation: presence.animation
            });
        }
        return heard;
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
            residentSpeech: this.lastResidentSpeech(),
            remoteAvatars: this.remoteAvatarsForSound(listener.position)
        };
    }
};
