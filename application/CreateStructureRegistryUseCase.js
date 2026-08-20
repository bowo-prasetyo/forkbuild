import { StructureRegistry } from '../core/StructureRegistry.js';
import { VillageLibrary } from '../core/library/VillageLibrary.js';

// Builds the StructureRegistry and registers every built-in structure
// library — the exact same shape as application/CreateBrickRegistryUseCase.js,
// one rung up. Later, community structure libraries get one extra line
// here — nothing else in the engine changes to pick them up.
export class CreateStructureRegistryUseCase {
    execute() {
        const registry = new StructureRegistry();
        registry.register(VillageLibrary);
        return registry;
    }
}
