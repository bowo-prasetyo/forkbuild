import { AvatarInteractionKind, isValidInteractionKind } from '../../core/AvatarInteractionKind.js';

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
//
// 0.2.44 — Local Avatar Interaction & Social Presence adds two more
// fields, `interaction`/`interactionStartedAt`: which LOCAL gesture
// (core/AvatarInteractionKind.js — NONE/GREET/WAVE/POINT) the user is
// currently performing at this target, and when it started. Kept on
// THIS class rather than a third, separate state slice — a gesture is
// meaningless without a target, so the two travel together exactly
// like `avatarId`/`isEmpty` already do. Deliberately still `avatarId`,
// not the design doc's own illustrative `targetAvatarId` — the
// existing name is already load-bearing across this codebase (the
// picking pipeline, the Nearby Avatars panel, ~20 call sites and
// tests), and renaming it would be pure churn with no behavior change;
// "the exact vocabulary can remain small" applies here too. A gesture
// is still local-only and never reaches AvatarPresence or the wire —
// see core/AvatarInteractionKind.js's own header for why that split is
// enforced by construction, not convention.
export class AvatarInteractionState {
    constructor({
        avatarId = null,
        interaction = AvatarInteractionKind.NONE,
        interactionStartedAt = null
    } = {}) {
        this._avatarId = avatarId;
        this._interaction = isValidInteractionKind(interaction) ? interaction : AvatarInteractionKind.NONE;
        this._interactionStartedAt = interactionStartedAt;
    }

    get avatarId() { return this._avatarId; }
    get isEmpty() { return this._avatarId === null; }
    get interaction() { return this._interaction; }
    get interactionStartedAt() { return this._interactionStartedAt; }
    get isGesturing() { return this._interaction !== AvatarInteractionKind.NONE; }

    static empty() {
        return new AvatarInteractionState();
    }

    static avatar(avatarId) {
        return new AvatarInteractionState({ avatarId });
    }

    // 0.2.44 — advances ONLY the gesture half of this state, keeping
    // the same targeted `avatarId` — returns a fresh instance, the
    // same immutable-setter discipline every spatial-state class in
    // this file's family already follows. Never validated against
    // "is there actually a target" here (a pure data holder has no
    // business enforcing that); WorldNavigationSession.
    // performAvatarInteraction() is the one place that invariant is
    // actually enforced, exactly like every other cross-field rule in
    // this codebase living in the application layer, not the state
    // class itself.
    withInteraction(interaction, interactionStartedAt) {
        return new AvatarInteractionState({
            avatarId: this._avatarId,
            interaction,
            interactionStartedAt
        });
    }
}
