import { LocalStorageProvider } from '../storage/LocalStorageProvider.js';
import { LocalIdentityProvider } from '../identity/LocalIdentityProvider.js';

// Builds the concrete identity backend, so ui/ never imports identity/
// or storage/ directly — same reasoning as CreatePersistenceUseCase.
// LocalIdentityProvider is the only concrete provider today; a future
// Steem Keychain / Hive Keychain / wallet provider slots in here without
// application/ or ui/ changing at all — everything above this only ever
// calls login()/logout()/currentUser()/sign().
export class CreateIdentityProviderUseCase {
    execute() {
        return new LocalIdentityProvider(new LocalStorageProvider());
    }
}
