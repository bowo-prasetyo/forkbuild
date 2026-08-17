import { LocalStorageProvider } from '../storage/LocalStorageProvider.js';
import { PresenceVisibilityUseCase } from './PresenceVisibilityUseCase.js';

// Wires the concrete storage backend so ui/ never imports storage/
// directly — same shape as application/CreateAvatarProfileUseCase.js.
// Takes the already-logged-in identityProvider as a parameter rather
// than constructing its own, same convention every other Create*
// wiring in this codebase follows: a presence visibility policy is
// meaningless without knowing whose it is.
export class CreatePresenceVisibilityUseCase {
    execute(identityProvider) {
        const storageProvider = new LocalStorageProvider();
        return {
            presenceVisibilityUseCase: new PresenceVisibilityUseCase(storageProvider, identityProvider)
        };
    }
}
