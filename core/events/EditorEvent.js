// Editor event type constants. These are NOT domain events — World doesn't
// know or care which tool is active, what's selected, or where the camera
// is. EditorContext (application/) publishes these through the same
// EventBus mechanism (EventBus.js, right here) World uses for domain
// events, but on its own bus instance, with its own vocabulary.
//
// This file lives in core/events/ rather than application/events/ for the
// same reason DomainEvent.js does: EditorContext (application/) publishes
// these, and renderer/SelectionRenderer subscribes to them — and
// renderer/ must never depend on application/ (only the reverse). core/
// is the one layer both already depend on, so the shared vocabulary sits
// here. This does NOT make Editor State part of the domain — EditorContext
// and every editor-state class still live entirely in application/; only
// this string-constant file needed a lower home to stay reachable from
// both a publisher and a subscriber that don't depend on each other.
export const EditorEvent = Object.freeze({
    SELECTION_CHANGED: 'SelectionChanged',
    TOOL_CHANGED: 'ToolChanged',
    ACTIVE_BRICK_CHANGED: 'ActiveBrickChanged',
    CAMERA_STATE_CHANGED: 'CameraStateChanged',
    SETTINGS_CHANGED: 'SettingsChanged',
    PREVIEW_CHANGED: 'PreviewChanged',
    // 0.2.90 — Structure Placement & World Instances. Mirror the brick
    // palette's own ACTIVE_BRICK_CHANGED/PREVIEW_CHANGED pair one rung up.
    ACTIVE_STRUCTURE_CHANGED: 'ActiveStructureChanged',
    STRUCTURE_PREVIEW_CHANGED: 'StructurePreviewChanged',
    // 0.4.1 — Interactive Structure Composition UX. Mirrors the pair
    // directly above, one rung over: composing a library Structure into
    // the current Document instead of placing a StructurePlacement
    // reference to another Document.
    ACTIVE_COMPOSITION_CHANGED: 'ActiveCompositionChanged',
    COMPOSITION_PREVIEW_CHANGED: 'CompositionPreviewChanged'
});
