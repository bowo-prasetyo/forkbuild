import { CommandRegistry } from './commands/CommandRegistry.js';
import { PlaceBrickCommand } from './commands/PlaceBrickCommand.js';
import { DeleteBrickCommand } from './commands/DeleteBrickCommand.js';
import { MoveBrickCommand } from './commands/MoveBrickCommand.js';
import { RotateBrickCommand } from './commands/RotateBrickCommand.js';
import { CompositeCommand } from './commands/CompositeCommand.js';
import { TransformSelectionCommand } from './commands/TransformSelectionCommand.js';

// Builds the CommandRegistry and registers every built-in command type.
// Later, community tools or plugin commands get one extra line here —
// nothing about CommandHistory or serialization changes to pick them up.
// Mirrors CreateBrickRegistryUseCase and CreateToolRegistryUseCase.
export class CreateCommandRegistryUseCase {
    execute() {
        const registry = new CommandRegistry();
        registry.register('place-brick', PlaceBrickCommand);
        registry.register('delete-brick', DeleteBrickCommand);
        registry.register('move-brick', MoveBrickCommand);
        registry.register('rotate-brick', RotateBrickCommand);
        registry.register('composite', CompositeCommand);
        registry.register('transform-selection', TransformSelectionCommand);
        return registry;
    }
}
