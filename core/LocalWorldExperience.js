// 0.3.10 — World Persistence & Return Experience.
//
// LocalWorldExperience captures a user's personal camera state when
// leaving a World — purely local application state, never part of the
// World itself. This implements the principle: "Personal Experience Is
// Not Shared World State."
//
// Key design decisions:
//   - Stores camera position, target, a derived heading snapshot, and
//     perspective — `cameraTarget` is what actually makes a free/orbit
//     camera framing reconstructible (position alone is not: two very
//     different views can share a camera position). `cameraHeading` is
//     kept alongside purely as a cheap display snapshot ("last facing
//     NE") — see core/CompassHeading.js's own "computed fresh, never
//     stored" principle for WHY this is never treated as a live source
//     of truth; restoring a framing always uses cameraTarget, never a
//     heading reconstructed into a synthetic target.
//   - Does NOT store avatar position (that would be World state)
//   - Per-user, per-World — Bob's client never sees Alice's experience
//   - Used for "Continue where I left off" UX on return
//
// See docs/Principles.md, "Personal Experience Is Not Shared World
// State (0.3.10)."
import { isValidCameraPerspective } from './CameraPerspective.js';

export class LocalWorldExperience {
    constructor({
        worldId,
        cameraPosition = null,
        cameraTarget = null,
        cameraHeading = null,
        cameraPerspective = null,
        lastVisitedAt = Date.now()
    } = {}) {
        if (!worldId || typeof worldId !== 'string') {
            throw new Error('LocalWorldExperience requires a valid worldId');
        }

        this._worldId = worldId;
        this._lastVisitedAt = lastVisitedAt;

        // Routed through the setters below (not a raw assignment) so
        // construction and fromJSON() share exactly one validation path
        // — including for data coming back out of localStorage, which
        // is never trustworthy just because this replica wrote it once.
        this._cameraPosition = null;
        this._cameraTarget = null;
        this._cameraHeading = null;
        this._cameraPerspective = null;
        this.setCameraPosition(cameraPosition);
        this.setCameraTarget(cameraTarget);
        this.setCameraHeading(cameraHeading);
        this.setCameraPerspective(cameraPerspective);
    }

    get worldId() { return this._worldId; }
    get cameraPosition() { return this._cameraPosition; }
    get cameraTarget() { return this._cameraTarget; }
    get cameraHeading() { return this._cameraHeading; }
    get cameraPerspective() { return this._cameraPerspective; }
    get lastVisitedAt() { return this._lastVisitedAt; }

    setCameraPosition(position) {
        this._cameraPosition = position ? { x: position.x, y: position.y, z: position.z } : null;
    }

    setCameraTarget(target) {
        this._cameraTarget = target ? { x: target.x, y: target.y, z: target.z } : null;
    }

    setCameraHeading(heading) {
        this._cameraHeading = typeof heading === 'number' && isFinite(heading) ? heading : null;
    }

    // Rejects anything that isn't a recognized CameraPerspective value
    // (or `null`, meaning free/orbit) rather than silently accepting
    // corrupted or foreign data — the same "degrade gracefully, never
    // corrupt state" discipline WorldNavigationSession#setCameraPerspective
    // already applies. Returns false (state unchanged) on rejection.
    setCameraPerspective(perspective) {
        if (perspective !== null && !isValidCameraPerspective(perspective)) {
            return false;
        }
        this._cameraPerspective = perspective;
        return true;
    }

    updateLastVisited() {
        this._lastVisitedAt = Date.now();
    }

    toJSON() {
        return {
            worldId: this._worldId,
            cameraPosition: this._cameraPosition,
            cameraTarget: this._cameraTarget,
            cameraHeading: this._cameraHeading,
            cameraPerspective: this._cameraPerspective,
            lastVisitedAt: this._lastVisitedAt
        };
    }

    static fromJSON(json) {
        return new LocalWorldExperience({
            worldId: json.worldId,
            cameraPosition: json.cameraPosition,
            cameraTarget: json.cameraTarget,
            cameraHeading: json.cameraHeading,
            cameraPerspective: json.cameraPerspective,
            lastVisitedAt: json.lastVisitedAt
        });
    }
}
