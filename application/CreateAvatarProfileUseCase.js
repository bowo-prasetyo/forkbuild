import { LocalStorageProvider } from '../storage/LocalStorageProvider.js';
import { AvatarProfileUseCase } from './AvatarProfileUseCase.js';
import { CreateAvatarTemplateRegistryUseCase } from './CreateAvatarTemplateRegistryUseCase.js';

// Wires the concrete storage backend and the built-in template
// registry, so ui/ never imports storage/ or core/library/ directly —
// same shape as CreateIdentityProviderUseCase and
// CreatePersistenceUseCase. Takes the already-logged-in
// identityProvider as a parameter rather than constructing its own,
// same convention CreatePublisherUseCase.execute(identityProvider)
// established: an avatar profile is meaningless without knowing whose
// it is, and the app already has exactly one shared identity provider
// instance (see ui/App.js) that every other use case is wired against.
export class CreateAvatarProfileUseCase {
    execute(identityProvider) {
        const storageProvider = new LocalStorageProvider();
        const templateRegistry = new CreateAvatarTemplateRegistryUseCase().execute();
        return {
            avatarProfileUseCase: new AvatarProfileUseCase(storageProvider, identityProvider, templateRegistry),
            templateRegistry
        };
    }
}
