// 0.3.0 — Collaborative Spatial Presence.
//
// A second, RICHER activity vocabulary than core/WorldPresenceActivity.js's
// own closed EXPLORING/EDITING pair (0.2.98) — deliberately a SEPARATE
// enum, never an extension of it. WorldPresenceActivity answers a coarse,
// low-frequency question ("is this identity broadly exploring or editing
// this World") that WorldMembersPanel's `canEdit` inference and the
// 0.2.98 roster still depend on exactly as before; nothing here changes
// that vocabulary or what it feeds. WorldSpatialActivity answers a purely
// COSMETIC, higher-frequency question a spatial marker wants to show next
// to a name — "what does this participant appear to be doing, right
// now" — and is never consulted by any authorization or roster-shape
// decision anywhere in the codebase. See core/WorldSpatialPresenceAdvertisement.js's
// own header for why the whole protocol this belongs to stays unsigned
// and ephemeral.
//
//   IDLE               — present, not currently walking, selecting, or
//                         transforming anything. The default.
//   WALKING            — the camera/avatar is currently in motion.
//   INSPECTING         — something is selected (a brick or a
//                         StructurePlacement instance) but nothing is
//                         currently being dragged/rotated — matches the
//                         read-only "select whole, never edit" posture
//                         0.2.93 already established for World View
//                         instance inspection.
//   BUILDING           — this participant currently holds EDIT authority
//                         on the World and has an active selection — the
//                         closest spatial-presence analog to
//                         WorldPresenceActivity.EDITING, but derived
//                         independently (see below).
//   MOVING_STRUCTURE    — a StructurePlacement selection is actively being
//                         dragged through the transform gizmo's own
//                         'translate' mode.
//   ROTATING_STRUCTURE  — a StructurePlacement selection is actively being
//                         rotated through the transform gizmo's own
//                         'rotate' mode.
//   JUMPING             — 0.3.4. The local avatar's own vertical motion
//                         (core/AvatarVerticalState.js) is currently
//                         RISING.
//   FALLING             — 0.3.4. The local avatar's own vertical motion
//                         is currently FALLING — gravity winning, whether
//                         that's the descending half of a jump or the
//                         result of walking off an unsupported ledge
//                         (see application/AvatarStepConstraint.js).
//
// 0.3.4 — named rather than hidden, the same restraint this file's own
// header already applies to every other addition here: JUMPING/FALLING
// were deliberately NOT added to core/AvatarAnimationState.js's own,
// narrower, presentation-facing vocabulary this milestone — that
// enum's existing JUMPING already covers the whole airborne
// experience, and widening it is a rendering/animation decision left
// for whenever a real jump/fall pose is built, not a byproduct of this
// vocabulary gaining two new words. WorldSpatialActivity and
// AvatarAnimationState stay two deliberately separate vocabularies,
// exactly as this header already states.
// Worth stating plainly, the same way core/WorldPresenceActivity.js's own
// header does for its narrower pair: this is NEVER authorization. Seeing
// "Bob — Building" tells a viewer nothing about whether Bob actually
// HOLDS edit authority — that fact still comes, exclusively, from
// application/WorldAuthorizationService.js, recomputed locally, exactly
// like WorldPresenceActivity.EDITING already never proves it either. And
// this value is never something a user TYPES — deriveWorldSpatialActivity()
// below is a pure function of local interaction state a session already
// tracks (selection, gizmo gesture, movement), never a free-text or
// user-authored field, so a remote participant can't claim an activity
// their own client-observable state contradicts.
export const WorldSpatialActivity = Object.freeze({
    IDLE: 'idle',
    WALKING: 'walking',
    INSPECTING: 'inspecting',
    BUILDING: 'building',
    MOVING_STRUCTURE: 'moving-structure',
    ROTATING_STRUCTURE: 'rotating-structure',
    JUMPING: 'jumping',
    FALLING: 'falling'
});

const VALID_ACTIVITIES = new Set(Object.values(WorldSpatialActivity));

export function isValidWorldSpatialActivity(value) {
    return VALID_ACTIVITIES.has(value);
}

// The one place this vocabulary is actually chosen. A pure function over
// plain booleans/strings a caller (application/WorldNavigationSession.js)
// already has lying around from its own gizmo/selection/movement state —
// never a THREE.js object, never a Command, never anything that could
// itself be mistaken for an editing signal. Ordered most-specific first:
// an active gizmo gesture always wins over the coarser "has a selection"
// or "is moving" facts it implies.
//
// 0.3.4 — `rising`/`falling` (both default `false`, so every pre-0.3.4
// caller that never mentions either gets byte-for-byte the same
// vocabulary as before) slot in right after the gizmo checks: a gizmo
// gesture requires active pointer control, which this codebase's own
// Avatar Control Mode already treats as a mutually exclusive input mode
// from avatar movement (see docs/Principles.md, "User-Controlled Avatar
// Mode Is Persistent Local Interaction State, Not A Transient Gesture
// (0.3.2)") — so a gizmo drag and a physical fall never genuinely
// coincide in practice, but WHEN a gizmo IS active, dragging it is
// still the more specific, more intentional fact. Below that, vertical
// motion outranks selection/BUILDING/INSPECTING/WALKING: a participant
// who is currently airborne is not meaningfully "building" or "walking"
// no matter what is still selected underneath them.
export function deriveWorldSpatialActivity({
    gizmoActive = false,
    gizmoMode = null,
    hasSelection = false,
    canEdit = false,
    isMoving = false,
    rising = false,
    falling = false
} = {}) {
    if (gizmoActive && gizmoMode === 'translate') {
        return WorldSpatialActivity.MOVING_STRUCTURE;
    }
    if (gizmoActive && gizmoMode === 'rotate') {
        return WorldSpatialActivity.ROTATING_STRUCTURE;
    }
    if (rising) {
        return WorldSpatialActivity.JUMPING;
    }
    if (falling) {
        return WorldSpatialActivity.FALLING;
    }
    if (hasSelection && canEdit) {
        return WorldSpatialActivity.BUILDING;
    }
    if (hasSelection) {
        return WorldSpatialActivity.INSPECTING;
    }
    if (isMoving) {
        return WorldSpatialActivity.WALKING;
    }
    return WorldSpatialActivity.IDLE;
}
