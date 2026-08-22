// 0.3.10 — World Persistence & Return Experience.
//
// LocalWorldExperienceStore manages a user's personal camera state for
// Worlds they've visited — purely local application state, never part
// of the World itself. This implements the principle: "Personal
// Experience Is Not Shared World State."
//
// Key design decisions:
//   - Backed by StorageProvider (localStorage in browser)
//   - Stores LocalWorldExperience records keyed by worldId
//   - Provides "recently visited" listing sorted by lastVisitedAt
//   - Does NOT store avatar position (that would be World state)
//
// See docs/Principles.md, "Personal Experience Is Not Shared World
// State (0.3.10)."
import { StorageProvider } from '../storage/StorageProvider.js';
import { LocalWorldExperience } from '../core/LocalWorldExperience.js';

const STORAGE_KEY_PREFIX = 'world-experience:';

export class LocalWorldExperienceStore {
    constructor({ storageProvider }) {
        if (!storageProvider || !(storageProvider instanceof StorageProvider)) {
            throw new Error('LocalWorldExperienceStore requires a StorageProvider');
        }
        this._storage = storageProvider;
    }

    // Get the experience record for a specific world, or null if none exists
    getExperience(worldId) {
        if (!worldId || typeof worldId !== 'string') {
            return null;
        }
        const key = STORAGE_KEY_PREFIX + worldId;
        const data = this._storage.load(key);
        if (!data) {
            return null;
        }
        return LocalWorldExperience.fromJSON(data);
    }

    // Save or update the experience record for a world
    saveExperience(experience) {
        if (!experience || !(experience instanceof LocalWorldExperience)) {
            throw new Error('saveExperience requires a LocalWorldExperience instance');
        }
        const key = STORAGE_KEY_PREFIX + experience.worldId;
        this._storage.save(key, experience.toJSON());
    }

    // Remove the experience record for a world
    removeExperience(worldId) {
        if (!worldId || typeof worldId !== 'string') {
            return;
        }
        const key = STORAGE_KEY_PREFIX + worldId;
        this._storage.remove(key);
    }

    // List all stored experiences, sorted by lastVisitedAt (most recent first)
    listExperiences() {
        const allKeys = this._storage.list();
        const experiences = [];
        for (const key of allKeys) {
            if (key.startsWith(STORAGE_KEY_PREFIX)) {
                const worldId = key.slice(STORAGE_KEY_PREFIX.length);
                const experience = this.getExperience(worldId);
                if (experience) {
                    experiences.push(experience);
                }
            }
        }
        experiences.sort((a, b) => b.lastVisitedAt - a.lastVisitedAt);
        return experiences;
    }

    // Get recently visited worlds (convenience method, returns top N)
    getRecentlyVisited(limit = 10) {
        return this.listExperiences().slice(0, limit);
    }

    // Check if a world has been visited before
    hasVisited(worldId) {
        return this.getExperience(worldId) !== null;
    }

    // Update just the camera position for a world (convenience method)
    updateCameraPosition(worldId, position) {
        let experience = this.getExperience(worldId);
        if (!experience) {
            experience = new LocalWorldExperience({ worldId });
        }
        experience.setCameraPosition(position);
        experience.updateLastVisited();
        this.saveExperience(experience);
    }

    // Update just the camera target for a world (convenience method)
    updateCameraTarget(worldId, target) {
        let experience = this.getExperience(worldId);
        if (!experience) {
            experience = new LocalWorldExperience({ worldId });
        }
        experience.setCameraTarget(target);
        experience.updateLastVisited();
        this.saveExperience(experience);
    }

    // Update just the camera heading for a world (convenience method)
    updateCameraHeading(worldId, heading) {
        let experience = this.getExperience(worldId);
        if (!experience) {
            experience = new LocalWorldExperience({ worldId });
        }
        experience.setCameraHeading(heading);
        experience.updateLastVisited();
        this.saveExperience(experience);
    }

    // Update just the camera perspective for a world (convenience method)
    updateCameraPerspective(worldId, perspective) {
        let experience = this.getExperience(worldId);
        if (!experience) {
            experience = new LocalWorldExperience({ worldId });
        }
        experience.setCameraPerspective(perspective);
        experience.updateLastVisited();
        this.saveExperience(experience);
    }

    // Record a complete visit with all camera state at once. `perspective`
    // is written even when explicitly null — leaving a World with the
    // free/orbit camera must clear a previously-recorded perspective,
    // not leave a stale one behind for the next restore to misapply.
    recordVisit(worldId, cameraState) {
        let experience = this.getExperience(worldId);
        if (!experience) {
            experience = new LocalWorldExperience({ worldId });
        }
        if (cameraState && cameraState.position) {
            experience.setCameraPosition(cameraState.position);
        }
        if (cameraState && cameraState.target) {
            experience.setCameraTarget(cameraState.target);
        }
        if (cameraState && typeof cameraState.heading === 'number') {
            experience.setCameraHeading(cameraState.heading);
        }
        if (cameraState && 'perspective' in cameraState) {
            experience.setCameraPerspective(cameraState.perspective);
        }
        experience.updateLastVisited();
        this.saveExperience(experience);
    }
}
