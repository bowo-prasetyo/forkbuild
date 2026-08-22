// 0.3.10 — World Persistence & Return Experience.
//
// LocalWorldExperience captures a user's personal camera state when
// leaving a World — purely local application state, never part of the
// World itself. This implements the principle: "Personal Experience Is
// Not Shared World State."
//
// Key design decisions:
//   - Stores only camera position, heading, and perspective
//   - Does NOT store avatar position (that would be World state)
//   - Per-user, per-World — Bob's client never sees Alice's experience
//   - Used for "Continue where I left off" UX on return
//
// See docs/Principles.md, "Personal Experience Is Not Shared World
// State (0.3.10)."
export class LocalWorldExperience {
    constructor({
        worldId,
        cameraPosition = null,
        cameraHeading = null,
        cameraPerspective = null,
        lastVisitedAt = Date.now()
    } = {}) {
        if (!worldId || typeof worldId !== 'string') {
            throw new Error('LocalWorldExperience requires a valid worldId');
        }

        this._worldId = worldId;
        this._cameraPosition = cameraPosition;
        this._cameraHeading = cameraHeading;
        this._cameraPerspective = cameraPerspective;
        this._lastVisitedAt = lastVisitedAt;
    }

    get worldId() { return this._worldId; }
    get cameraPosition() { return this._cameraPosition; }
    get cameraHeading() { return this._cameraHeading; }
    get cameraPerspective() { return this._cameraPerspective; }
    get lastVisitedAt() { return this._lastVisitedAt; }

    setCameraPosition(position) {
        this._cameraPosition = position ? { x: position.x, y: position.y, z: position.z } : null;
    }

    setCameraHeading(heading) {
        this._cameraHeading = typeof heading === 'number' && isFinite(heading) ? heading : null;
    }

    setCameraPerspective(perspective) {
        this._cameraPerspective = perspective;
    }

    updateLastVisited() {
        this._lastVisitedAt = Date.now();
    }

    toJSON() {
        return {
            worldId: this._worldId,
            cameraPosition: this._cameraPosition,
            cameraHeading: this._cameraHeading,
            cameraPerspective: this._cameraPerspective,
            lastVisitedAt: this._lastVisitedAt
        };
    }

    static fromJSON(json) {
        return new LocalWorldExperience({
            worldId: json.worldId,
            cameraPosition: json.cameraPosition,
            cameraHeading: json.cameraHeading,
            cameraPerspective: json.cameraPerspective,
            lastVisitedAt: json.lastVisitedAt
        });
    }
}
