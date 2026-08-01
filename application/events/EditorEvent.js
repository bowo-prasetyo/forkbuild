// Editor event type constants. These are NOT domain events — World doesn't
// know or care which tool is active, what's selected, or where the camera
// is. EditorContext publishes these through the same EventBus mechanism
// (core/events/EventBus.js) World uses for domain events, but on its own
// bus instance, with its own vocabulary. Keeping "what changed in the
// world" and "what changed in this editing session" on separate buses
// makes the Domain State / Editor State boundary structural, not just a
// naming convention.
export const EditorEvent = Object.freeze({
    SELECTION_CHANGED: 'SelectionChanged',
    TOOL_CHANGED: 'ToolChanged',
    ACTIVE_BRICK_CHANGED: 'ActiveBrickChanged',
    CAMERA_STATE_CHANGED: 'CameraStateChanged',
    SETTINGS_CHANGED: 'SettingsChanged'
});
