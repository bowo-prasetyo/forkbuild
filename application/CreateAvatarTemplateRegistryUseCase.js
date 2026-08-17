import { AvatarTemplateRegistry } from '../core/AvatarTemplateRegistry.js';
import { CoreAvatarTemplateLibrary } from '../core/library/CoreAvatarTemplateLibrary.js';

// Builds the AvatarTemplateRegistry and registers every built-in
// library. Mirrors application/CreateBrickRegistryUseCase.js exactly.
// Later, community avatar-template libraries register alongside this
// one the same way a community brick library would — nothing else in
// the engine changes to pick them up.
export class CreateAvatarTemplateRegistryUseCase {
    execute() {
        const registry = new AvatarTemplateRegistry();
        registry.register(CoreAvatarTemplateLibrary);
        return registry;
    }
}
