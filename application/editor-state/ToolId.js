// Known editor tool identifiers. Not an exhaustive enum forever — a new
// tool (Rotate, Delete, ...) just adds a constant here; nothing about
// EditorContext or ToolState needs to change to support it.
//
// Named ToolId rather than Tool: the base class every tool implementation
// extends (application/tools/Tool.js) is also naturally called Tool, and
// the two must not collide on the same identifier.
export const ToolId = Object.freeze({
    SELECT: 'select',
    PLACE: 'place',
    // 0.2.90 — a separate tool from PLACE rather than a mode switch on
    // PlacementTool itself: placing a Document reference (a whole,
    // possibly-multi-brick structure) and placing one Brick are
    // different enough operations (different preview shape, different
    // command, different collision check) to earn their own small,
    // focused Tool class — see application/tools/StructurePlacementTool.js.
    PLACE_STRUCTURE: 'place-structure'
});
