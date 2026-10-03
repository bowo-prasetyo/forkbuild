import { computeCompassHeading } from '../../core/CompassHeading.js';
import { STREAMING_RADIUS } from './constants.js';

// WorldNavigationSession methods for this replica's local, per-World camera
// experience: whether a World was visited, and saving/restoring its framing.
//
// Local, per-user camera framing for Worlds this replica has visited; never
// a Document or WorldPlacement field, never broadcast. See
// core/LocalWorldExperience.js and docs/Principles.md, "Personal Experience
// Is Not Shared World State". No-ops without localWorldExperienceStore.
//
// Independent of enterWorldPresence()/leaveWorldPresence(), which broadcast
// a shared "I am here". Callers wire both at the same active-document change
// (see WorldView.js _syncWorldExperience()). Never consulted for
// authorization: a prior visit is a convenience, not a claim.
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

    // Remembers the current camera framing as `documentId`'s, while the
    // camera is still near it. The caller notes the World it is in on every
    // refresh; saveWorldExperience() falls back to this once the camera has
    // already left (moved to the next World, or so far that this one streamed
    // out), so a World is never saved with another place's framing.
    noteWorldExperienceCamera(documentId) {
        const framing = this._currentWorldExperienceFraming();
        if (framing && documentId && this._isNearWorld(documentId, framing.position)) {
            this._lastWorldExperienceFraming = { documentId, framing };
        }
    },

    // Records a visit to `documentId` with THIS replica's camera framing
    // (position, target, a derived heading reading) and active Camera
    // Perspective: the current one while the camera is still near the World,
    // otherwise the last one noteWorldExperienceCamera() saw there, otherwise
    // none (the visit is recorded and the previous framing kept). A no-op with
    // no localWorldExperienceStore wired, or before start() has ever run (no
    // camera controller yet, nothing to snapshot).
    saveWorldExperience(documentId) {
        if (!this._localWorldExperienceStore || !documentId || !this._spatialCameraController) {
            return;
        }
        let framing = this._currentWorldExperienceFraming();
        if (!this._isNearWorld(documentId, framing.position)) {
            const last = this._lastWorldExperienceFraming;
            framing = last && last.documentId === documentId ? last.framing : {};
        }
        this._localWorldExperienceStore.recordVisit(documentId, framing);
    },

    _currentWorldExperienceFraming() {
        if (!this._spatialCameraController) {
            return null;
        }
        const state = this._spatialCameraController.getSpatialCameraState();
        const heading = computeCompassHeading(state.position, state.target);
        return {
            position: { x: state.position.x, y: state.position.y, z: state.position.z },
            target: { x: state.target.x, y: state.target.y, z: state.target.z },
            heading: heading ? heading.degrees : null,
            perspective: this._cameraPerspective
        };
    },

    // Whether a camera (or avatar) at `position` is close enough to
    // `documentId` for it to stream in. With no layout to say where the World
    // is, it can't be told apart, so anywhere counts as near.
    _isNearWorld(documentId, position) {
        if (!position) {
            return false;
        }
        const world = (this._worldLayoutProvider || this._localPositions.has(documentId))
            ? this._getWorldPosition(documentId)
            : null;
        if (!world) {
            return true;
        }
        const dx = position.x - world.x;
        const dy = position.y - world.y;
        const dz = position.z - world.z;
        return dx * dx + dy * dy + dz * dz <= STREAMING_RADIUS * STREAMING_RADIUS;
    },

    // Restores this replica's last visit to `documentId`. A stored Camera
    // Perspective wins and is re-applied via setCameraPerspective(), since it's
    // an offset from the avatar's current position. Otherwise the stored orbit
    // position+target is restored via _beginCameraFocus(). Either is skipped
    // when it would leave the camera away from the World (the avatar stands
    // elsewhere, or the framing was saved somewhere else), keeping the caller's
    // framing instead. Returns the LocalWorldExperience, or null on a first
    // visit (the caller keeps its framing, e.g. the Welcome framing).
    restoreWorldExperience(documentId) {
        if (!this._localWorldExperienceStore || !documentId) {
            return null;
        }
        const experience = this._localWorldExperienceStore.getExperience(documentId);
        if (!experience) {
            return null;
        }
        const avatarPosition = this._avatarPresenceSession ? this._avatarPresenceSession.current.position : null;
        if (experience.cameraPerspective && (!avatarPosition || this._isNearWorld(documentId, avatarPosition))) {
            this.setCameraPerspective(experience.cameraPerspective);
        } else if (experience.cameraPosition && experience.cameraTarget
            && this._isNearWorld(documentId, experience.cameraPosition)
            && this._isNearWorld(documentId, experience.cameraTarget)) {
            this._beginCameraFocus({ position: experience.cameraPosition, target: experience.cameraTarget });
        }
        return experience;
    },
};
