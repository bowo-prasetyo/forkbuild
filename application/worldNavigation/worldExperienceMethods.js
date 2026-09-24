import { computeCompassHeading } from '../../core/CompassHeading.js';

// WorldNavigationSession methods for this replica's local, per-World camera
// experience: whether a World was visited, and saving/restoring its framing.
export const worldExperienceMethods = {
    hasVisitedWorld(documentId) {
        if (!this._localWorldExperienceStore || !documentId) {
            return false;
        }
        return this._localWorldExperienceStore.hasVisited(documentId);
    },

    getWorldExperience(documentId) {
        if (!this._localWorldExperienceStore || !documentId) {
            return null;
        }
        return this._localWorldExperienceStore.getExperience(documentId);
    },

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
    },

    // Restores this replica's last visit to `documentId`. A stored Camera
    // Perspective wins and is re-applied via setCameraPerspective(), since it's
    // an offset from the avatar's current position. Otherwise the stored orbit
    // position+target is restored via _beginCameraFocus(). Returns the restored
    // LocalWorldExperience, or null (the caller keeps its framing, e.g. the
    // Welcome framing on a first visit).
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
    },
};
