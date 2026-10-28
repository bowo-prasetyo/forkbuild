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
    PLACE_STRUCTURE: 'place-structure',
    // 0.4.1 — Interactive Structure Composition UX. A separate tool
    // from PLACE_STRUCTURE for the same reason PLACE_STRUCTURE is
    // separate from PLACE: what's being placed (a library
    // core/building/Structure.js's own bricks vs. a Document reference) and what
    // gets committed (a flattened PasteBricksCommand vs. a
    // PlaceStructureCommand StructurePlacement) diverge — see
    // application/tools/StructureCompositionTool.js's own header.
    COMPOSE_STRUCTURE: 'compose-structure'
});

// The tools that place something: a brick, a placed build or a structure.
export const PLACING_TOOLS = new Set([ToolId.PLACE, ToolId.PLACE_STRUCTURE, ToolId.COMPOSE_STRUCTURE]);

// The tool Place (its button, or 2) turns on from `activeTool`: Place, or
// none when something is already being placed, so a structure in hand stays
// in hand instead of being swapped for a brick without a word
// (docs/reviews/EditorPlacementUX-2026-10-27.md, P2-13).
export function toolForPlace(activeTool) {
    return PLACING_TOOLS.has(activeTool) ? null : ToolId.PLACE;
}
