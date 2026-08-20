import { ToolRegistry } from './tools/ToolRegistry.js';
import { SelectionTool } from './tools/SelectionTool.js';
import { PlacementTool } from './tools/PlacementTool.js';
import { StructurePlacementTool } from './tools/StructurePlacementTool.js';
import { ToolId } from './editor-state/ToolId.js';

// Builds the ToolRegistry and registers every built-in tool. Later,
// community tools (Terrain, Paint, Measure, ...) get one extra line here
// — nothing about ToolManager, EditorContext, or ui/ changes to pick them
// up. Mirrors CreateBrickRegistryUseCase for the same reason.
export class CreateToolRegistryUseCase {
    execute() {
        const registry = new ToolRegistry();
        registry.register(ToolId.SELECT, SelectionTool);
        registry.register(ToolId.PLACE, PlacementTool);
        // 0.2.90 — Structure Placement & World Instances.
        registry.register(ToolId.PLACE_STRUCTURE, StructurePlacementTool);
        return registry;
    }
}
