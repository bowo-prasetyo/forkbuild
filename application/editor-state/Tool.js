// Known editor tool identifiers. Not an exhaustive enum forever — a new
// tool (Rotate, Delete, ...) just adds a constant here; nothing about
// EditorContext or ToolState needs to change to support it.
export const Tool = Object.freeze({
    SELECT: 'select',
    PLACE: 'place'
});
