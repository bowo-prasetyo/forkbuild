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
//
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
    ROTATING_STRUCTURE: 'rotating-structure'
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
export function deriveWorldSpatialActivity({
    gizmoActive = false,
    gizmoMode = null,
    hasSelection = false,
    canEdit = false,
    isMoving = false
} = {}) {
    if (gizmoActive && gizmoMode === 'translate') {
        return WorldSpatialActivity.MOVING_STRUCTURE;
    }
    if (gizmoActive && gizmoMode === 'rotate') {
        return WorldSpatialActivity.ROTATING_STRUCTURE;
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
