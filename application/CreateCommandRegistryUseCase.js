import { CommandRegistry } from './commands/CommandRegistry.js';
import { PlaceBrickCommand } from './commands/PlaceBrickCommand.js';
import { DeleteBrickCommand } from './commands/DeleteBrickCommand.js';
import { MoveBrickCommand } from './commands/MoveBrickCommand.js';
import { RotateBrickCommand } from './commands/RotateBrickCommand.js';
import { CompositeCommand } from './commands/CompositeCommand.js';
import { TransformSelectionCommand } from './commands/TransformSelectionCommand.js';
import { PasteBricksCommand } from './commands/PasteBricksCommand.js';
import { CreateGroupCommand } from './commands/CreateGroupCommand.js';
import { DeleteGroupCommand } from './commands/DeleteGroupCommand.js';
import { RenameGroupCommand } from './commands/RenameGroupCommand.js';
import { AddToGroupCommand } from './commands/AddToGroupCommand.js';
import { RemoveFromGroupCommand } from './commands/RemoveFromGroupCommand.js';
import { DuplicateGroupCommand } from './commands/DuplicateGroupCommand.js';
import { PlaceStructureCommand } from './commands/PlaceStructureCommand.js';
import { RemoveStructurePlacementCommand } from './commands/RemoveStructurePlacementCommand.js';

// Builds the CommandRegistry and registers every built-in command type.
// Later, community tools or plugin commands get one extra line here —
// nothing about CommandHistory or serialization changes to pick them up.
export class CreateCommandRegistryUseCase {
    execute() {
        const registry = new CommandRegistry();
        registry.register('place-brick', PlaceBrickCommand);
        registry.register('delete-brick', DeleteBrickCommand);
        registry.register('move-brick', MoveBrickCommand);
        registry.register('rotate-brick', RotateBrickCommand);
        registry.register('composite', CompositeCommand);
        registry.register('transform-selection', TransformSelectionCommand);
        registry.register('paste-bricks', PasteBricksCommand);
        // 0.1.43 — group commands. Groups inherit undo/redo, persistence,
        // replay, and restoration with no changes to those systems.
        registry.register('create-group', CreateGroupCommand);
        registry.register('delete-group', DeleteGroupCommand);
        registry.register('rename-group', RenameGroupCommand);
        registry.register('add-to-group', AddToGroupCommand);
        registry.register('remove-from-group', RemoveFromGroupCommand);
        registry.register('duplicate-group', DuplicateGroupCommand);
        // 0.2.90 — Structure Placement & World Instances. Placements
        // inherit undo/redo, persistence, and replay the same way group
        // commands did in 0.1.43 — nothing about CommandHistory changed.
        registry.register('place-structure', PlaceStructureCommand);
        registry.register('remove-structure-placement', RemoveStructurePlacementCommand);
        return registry;
    }
}
