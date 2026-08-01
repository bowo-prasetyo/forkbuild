// Known editor tool identifiers. Not an exhaustive enum forever — a new
// tool (Rotate, Delete, ...) just adds a constant here; nothing about
// EditorContext or ToolState needs to change to support it.
//
// Named ToolId rather than Tool: the base class every tool implementation
// extends (application/tools/Tool.js) is also naturally called Tool, and
// the two must not collide on the same identifier.
export const ToolId = Object.freeze({
    SELECT: 'select',
    PLACE: 'place'
});
