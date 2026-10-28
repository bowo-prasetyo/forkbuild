import { PLACING_TOOLS, ToolId, toolForPlace } from '../application/editor-state/ToolId.js';
import { assert } from './support/Assert.js';

// Place (its button, or 2) while something is already being placed keeps it
// in hand: it used to swap a structure for a brick without a word (finding
// P2-13 of docs/reviews/EditorPlacementUX-2026-10-27.md).

assert(toolForPlace(ToolId.SELECT) === ToolId.PLACE, '1. from Select, Place turns on Place');
assert(toolForPlace(ToolId.PLACE) === null, '2. already placing a brick, it stays as it is');
assert(toolForPlace(ToolId.COMPOSE_STRUCTURE) === null, '3. holding a structure from the library, it stays in hand');
assert(toolForPlace(ToolId.PLACE_STRUCTURE) === null, '4. holding a placed build, it stays in hand');
assert(toolForPlace(undefined) === ToolId.PLACE, '5. with no tool yet, Place turns on Place');
assert([ToolId.PLACE, ToolId.PLACE_STRUCTURE, ToolId.COMPOSE_STRUCTURE].every((tool) => PLACING_TOOLS.has(tool)) && !PLACING_TOOLS.has(ToolId.SELECT),
    '6. the placing tools are Place and the two structure tools, not Select');
console.log('✅ All Place-keeps-hand tests passed.');
