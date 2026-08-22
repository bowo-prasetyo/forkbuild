import { BrickRegistry } from '../core/BrickRegistry.js';
import { CoreLibrary } from '../core/library/CoreLibrary.js';

// Builds the BrickRegistry and registers every built-in library. Later,
// community libraries (medieval, space, city, ...) get one extra line here
// — nothing else in the engine changes to pick them up.
export class CreateBrickRegistryUseCase {
    execute() {
        const registry = new BrickRegistry();
        registry.register(CoreLibrary);
        return registry;
    }
}

// Convenience function for tests that need a ready-to-use registry
export function createBrickRegistry() {
    return new CreateBrickRegistryUseCase().execute();
}
