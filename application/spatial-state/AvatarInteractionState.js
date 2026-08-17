// 0.2.39 — what avatar (if any) is currently the target of user
// interaction. Deliberately a SEPARATE, minimal state slice from
// SpatialSelectionState — see docs/Principles.md, "Avatars Are Never
// Document Selection": an avatar can be the thing a user clicked on,
// but it must never be able to enter SpatialSelectionState, and so
// must never be reachable by anything that reads selection (clipboard,
// groups, the transform gizmo, undo/redo). Two independent state
// classes, each owning its own Map/Set-free minimal shape, is what
// makes "an avatar physically cannot become a document selection"
// true by construction rather than by convention — there is no shared
// object an avatar's id could accidentally end up inside.
//
// Same style as SpatialHoverState/SpatialSelectionState: runtime-only,
// never serialized, never part of the ForkBuild Protocol, immutable
// (a setter always returns a NEW instance). Carries only `avatarId` —
// nothing about what that avatar looks like, where it is, or whether
// it's trusted; that's all DERIVED, on demand, by
// application/AvatarInspectionService.js, exactly the same
// "inspection state stores an identifier, not a snapshot" discipline
// SpatialInspectionState already follows for bricks.
export class AvatarInteractionState {
    constructor({ avatarId = null } = {}) {
        this._avatarId = avatarId;
    }

    get avatarId() { return this._avatarId; }
    get isEmpty() { return this._avatarId === null; }

    static empty() {
        return new AvatarInteractionState();
    }

    static avatar(avatarId) {
        return new AvatarInteractionState({ avatarId });
    }
}
