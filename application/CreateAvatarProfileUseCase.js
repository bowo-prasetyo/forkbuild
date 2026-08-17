import { LocalStorageProvider } from '../storage/LocalStorageProvider.js';
import { AvatarProfileUseCase } from './AvatarProfileUseCase.js';

// Wires the concrete storage backend, so ui/ never imports storage/
// directly — same shape as CreateIdentityProviderUseCase and
// CreatePersistenceUseCase. Takes the already-logged-in
// identityProvider as a parameter rather than constructing its own,
// same convention CreatePublisherUseCase.execute(identityProvider)
// established: an avatar profile is meaningless without knowing whose
// it is, and the app already has exactly one shared identity provider
// instance (see ui/App.js) that every other use case is wired against.
export class CreateAvatarProfileUseCase {
    execute(identityProvider) {
        const storageProvider = new LocalStorageProvider();
        return {
            avatarProfileUseCase: new AvatarProfileUseCase(storageProvider, identityProvider)
        };
    }
}
