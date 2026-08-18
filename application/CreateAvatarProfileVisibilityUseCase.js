import { LocalStorageProvider } from '../storage/LocalStorageProvider.js';
import { AvatarProfileVisibilityUseCase } from './AvatarProfileVisibilityUseCase.js';

// Wires the concrete storage backend so ui/ never imports storage/
// directly — same shape as application/CreatePresenceVisibilityUseCase.js.
// Takes the already-logged-in identityProvider as a parameter rather
// than constructing its own, same convention every other Create*
// wiring in this codebase follows: a profile visibility policy is
// meaningless without knowing whose it is.
export class CreateAvatarProfileVisibilityUseCase {
    execute(identityProvider) {
        const storageProvider = new LocalStorageProvider();
        return {
            avatarProfileVisibilityUseCase: new AvatarProfileVisibilityUseCase(storageProvider, identityProvider)
        };
    }
}
